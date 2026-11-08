"""The workshop@1 service: one turn of the claude CLI on a workshop plugin's files.

The browser sends the plugin's files (`plugin.tsx`, `content/*.yml`) with each message; this writes them into a
workspace per plugin, next to the agent template (the plugin contract, types, `check.ts`), runs
`claude -p --output-format stream-json` there and hands back what it said and did, then the files it changed. It
reads and writes no notes: the browser writes them, so another agent backend can take this one's place.

Routes, all one path segment (the SDK passes on only the first one):
- `POST turn` `{plugin, session?, message, files: {path: text}, diagnostics: [..]}` → 202 `{job}`; 409 while that
  plugin has a turn running
- `GET events?job=&after=n` → `{events, next, done}`, waiting up to 20 s for events after the `n`-th
- `POST cancel` `{job}` → `{}`
"""

import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from gestalts_plugin import Worker, run_worker

REPO = Path(__file__).resolve().parents[3]
TEMPLATE = Path(os.environ.get("WORKSHOP_TEMPLATE", REPO / "agent-template"))
COMPILE = REPO / "src" / "runtime" / "compile.ts"
WORKSPACES = Path(os.environ.get("WORKSHOP_WORKSPACES", Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "gestalt-workshop" / "workspaces"))
CLAUDE = os.environ.get("WORKSHOP_CLAUDE", "claude")
# what the template brings into each workspace, replaced on every turn so a changed template takes effect
TEMPLATE_FILES = ["CLAUDE.md", "tsconfig.json", "workshop.d.ts", "check.ts", "examples"]
TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "Bash(node check.ts)", "Bash(node check.ts:*)"]
SYSTEM = ("You are editing one workshop plugin in this directory. CLAUDE.md here is the contract: read it first. "
          "Only plugin.tsx and content/*.yml are kept; run `node check.ts` before you finish.")
# the node's service proxy gives up after 180 s; each poll returns well before that
POLL_S = 20
KEEP_S = 600
PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


class Job:
    def __init__(self, plugin: str):
        self.id = uuid.uuid4().hex
        self.plugin = plugin
        self.events: list[dict] = []
        self.done = False
        self.finished_at = 0.0
        self.process: subprocess.Popen | None = None
        self.cancelled = False
        self.cond = threading.Condition()

    def emit(self, event: dict) -> None:
        with self.cond:
            self.events.append(event)
            self.cond.notify_all()

    def finish(self) -> None:
        with self.cond:
            self.done = True
            self.finished_at = time.time()
            self.cond.notify_all()


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()


def _json(status: int, body: object) -> tuple[int, str, bytes]:
    return status, "application/json", json.dumps(body).encode()


def _safe_path(path: str) -> bool:
    """Only the files a plugin is: its source and its content notes."""
    return path == "plugin.tsx" or (re.fullmatch(r"content/[A-Za-z0-9][A-Za-z0-9_.-]*\.yml", path) is not None and ".." not in path)


def _changed_outside(workspace: Path, files: dict[str, str]) -> list[str]:
    """The files that differ from how the last turn here left them: edited, reverted, added or deleted meanwhile."""
    try:
        last = json.loads((workspace / ".workshop" / "last.json").read_text())
    except (OSError, json.JSONDecodeError):
        return []
    return sorted(p for p in set(last) | set(files) if last.get(p) != files.get(p))


def _prepare(workspace: Path, files: dict[str, str], diagnostics: list) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    for name in TEMPLATE_FILES:
        src, dst = TEMPLATE / name, workspace / name
        if dst.is_dir() and not dst.is_symlink():
            shutil.rmtree(dst)
        elif dst.exists() or dst.is_symlink():
            dst.unlink()
        if src.is_dir():
            shutil.copytree(src, dst)
        elif src.exists():
            shutil.copy2(src, dst)
    shared = workspace / ".workshop"
    shared.mkdir(exist_ok=True)
    shutil.copy2(COMPILE, shared / "compile.ts")
    modules = workspace / "node_modules"
    if not modules.exists():
        modules.symlink_to(TEMPLATE / "node_modules", target_is_directory=True)
    # the notes are the truth: what isn't in this turn's files is gone
    (workspace / "plugin.tsx").unlink(missing_ok=True)
    shutil.rmtree(workspace / "content", ignore_errors=True)
    (workspace / "content").mkdir()
    for path, text in files.items():
        (workspace / path).write_text(text)
    errors = workspace / "runtime-errors.md"
    if diagnostics:
        lines = ["# Errors the preview reported since the last turn", ""]
        for d in diagnostics:
            lines += [f"## {d.get('kind', 'error')}: {d.get('message', '')}", "", "```", str(d.get("stack") or "").strip(), "```", ""]
        errors.write_text("\n".join(lines))
    else:
        errors.unlink(missing_ok=True)


def _collect(workspace: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    source = workspace / "plugin.tsx"
    if source.is_file():
        out["plugin.tsx"] = source.read_text()
    for f in sorted((workspace / "content").glob("*.yml")):
        path = f"content/{f.name}"
        if _safe_path(path):
            out[path] = f.read_text()
    return out


def _summary(name: str, args: dict, workspace: Path) -> str:
    for key in ("file_path", "path"):
        if isinstance(args.get(key), str):
            p = args[key]
            return p[len(str(workspace)) + 1:] if p.startswith(str(workspace) + "/") else p
    for key in ("command", "pattern"):
        if isinstance(args.get(key), str):
            return args[key][:200]
    return ""


def _run(job: Job, session: str | None, message: str, files: dict[str, str], diagnostics: list) -> None:
    workspace = WORKSPACES / job.plugin
    try:
        outside = _changed_outside(workspace, files)
        _prepare(workspace, files, diagnostics)
        prompt = message
        if outside and session:
            prompt += f"\n\n(Changed since your last turn, outside this conversation: {', '.join(outside)}. Re-read them before relying on what you remember.)"
        if diagnostics:
            prompt += f"\n\n(The preview reported {len(diagnostics)} runtime error(s) since the last turn: see runtime-errors.md.)"
        cmd = [CLAUDE, "-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config",
               "--append-system-prompt", SYSTEM, "--allowedTools", *TOOLS]
        if session:
            cmd += ["--resume", session]
        # the prompt goes in on stdin, so no flag can take it for one of its values
        job.process = subprocess.Popen(cmd, cwd=workspace, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, start_new_session=True)
        assert job.process.stdin and job.process.stdout and job.process.stderr
        job.process.stdin.write(prompt)
        job.process.stdin.close()
        new_session = session
        failed = None
        for line in job.process.stdout:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            kind = e.get("type")
            if kind == "system" and e.get("subtype") == "init":
                new_session = e.get("session_id") or new_session
            elif kind == "assistant":
                for c in e.get("message", {}).get("content", []):
                    if c.get("type") == "text" and c.get("text"):
                        job.emit({"type": "text", "text": c["text"]})
                    elif c.get("type") == "tool_use":
                        job.emit({"type": "tool", "name": c.get("name", ""), "summary": _summary(c.get("name", ""), c.get("input") or {}, workspace)})
            elif kind == "result":
                new_session = e.get("session_id") or new_session
                if e.get("is_error"):
                    failed = str(e.get("result") or e.get("subtype") or "the CLI reported an error")
                for d in e.get("permission_denials") or []:
                    what = _summary(d.get("tool_name", ""), d.get("tool_input") or {}, workspace)
                    job.emit({"type": "tool", "name": d.get("tool_name", "?"), "summary": f"(not allowed in the workshop) {what}".strip()})
        code = job.process.wait()
        stderr = job.process.stderr.read().strip()
        if job.cancelled:
            job.emit({"type": "error", "message": "stopped"})
        elif code != 0 and not failed:
            failed = f"claude exited with {code}" + (f": {stderr[-2000:]}" if stderr else "")
        after = _collect(workspace)
        (workspace / ".workshop" / "last.json").write_text(json.dumps(after))
        changed: dict[str, str | None] = {p: t for p, t in after.items() if files.get(p) != t}
        changed.update({p: None for p in files if p not in after})
        if changed:
            job.emit({"type": "files", "files": changed})
        if failed and not job.cancelled:
            job.emit({"type": "error", "message": failed})
        job.emit({"type": "done", "session": new_session})
    except FileNotFoundError as error:
        job.emit({"type": "error", "message": f"cannot run {CLAUDE}: {error}"})
        job.emit({"type": "done", "session": session})
    except Exception as error:  # the browser must hear of it, or it waits forever
        job.emit({"type": "error", "message": f"{type(error).__name__}: {error}"})
        job.emit({"type": "done", "session": session})
    finally:
        job.finish()


def _prune() -> None:
    now = time.time()
    with _jobs_lock:
        for key in [k for k, j in _jobs.items() if j.done and now - j.finished_at > KEEP_S]:
            del _jobs[key]


def turn(body: bytes) -> tuple[int, str, bytes]:
    try:
        req = json.loads(body)
    except json.JSONDecodeError:
        return _json(400, {"error": "not JSON"})
    plugin, message = req.get("plugin"), req.get("message")
    files = req.get("files") or {}
    if not isinstance(plugin, str) or not PLUGIN_ID.match(plugin):
        return _json(400, {"error": "plugin: lowercase letters, digits and -"})
    if not isinstance(message, str) or not message.strip():
        return _json(400, {"error": "message is empty"})
    if not isinstance(files, dict) or not all(isinstance(p, str) and _safe_path(p) and isinstance(t, str) for p, t in files.items()):
        return _json(400, {"error": "files: only plugin.tsx and content/<name>.yml, as text"})
    _prune()
    with _jobs_lock:
        if any(j.plugin == plugin and not j.done for j in _jobs.values()):
            return _json(409, {"error": "a turn is running for this plugin"})
        job = Job(plugin)
        _jobs[job.id] = job
    session = req.get("session") if isinstance(req.get("session"), str) else None
    threading.Thread(target=_run, args=(job, session, message, files, req.get("diagnostics") or []), daemon=True).start()
    return _json(202, {"job": job.id})


def events(query: dict) -> tuple[int, str, bytes]:
    job = _jobs.get((query.get("job") or [""])[0])
    if not job:
        return _json(404, {"error": "no such job"})
    try:
        after = max(0, int((query.get("after") or ["0"])[0]))
    except ValueError:
        after = 0
    with job.cond:
        job.cond.wait_for(lambda: len(job.events) > after or job.done, timeout=POLL_S)
        return _json(200, {"events": job.events[after:], "next": len(job.events), "done": job.done})


def cancel(body: bytes) -> tuple[int, str, bytes]:
    try:
        job = _jobs.get(json.loads(body).get("job", ""))
    except (json.JSONDecodeError, AttributeError):
        job = None
    if not job:
        return _json(404, {"error": "no such job"})
    job.cancelled = True
    if job.process and job.process.poll() is None:
        try:
            os.killpg(job.process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    return _json(200, {})


def service(method: str, path: str, body: bytes) -> tuple[int, str, bytes]:
    url = urlsplit(path)
    route = (method, url.path.rstrip("/"))
    if route == ("POST", "/turn"):
        return turn(body)
    if route == ("GET", "/events"):
        return events(parse_qs(url.query))
    if route == ("POST", "/cancel"):
        return cancel(body)
    return _json(404, {"error": f"no route {method} {url.path}"})


def main() -> None:
    worker = Worker(lambda _req: {"message": "the workshop has no runs; it offers workshop@1"})
    worker.service("workshop@1", service)
    run_worker(worker)


if __name__ == "__main__":
    main()
