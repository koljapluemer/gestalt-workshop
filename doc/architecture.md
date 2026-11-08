# Architecture

```
src/                 the shell: plugin list, the workbench (preview, chat, content, revisions), agents/
src/runtime/         running a plugin from a note; meant to move into gestalts' host once it settles
  compile.ts         plugin.tsx → CommonJS (sucrase), the import allowlist; also run by the agent's check.ts
  query.ts           the core's Query matching, for the frame's copy of the notes (tested against the core)
  protocol.ts        host ⇄ frame messages
  FrameHost.tsx      the host side: inside PaneFrame, bridges the scoped repo and host capabilities to the frame
  frame/             the frame page (frame.html): FrameRepo, the module table, @workshop/plugin
plugins/workshop/    @gestalts-plugin/workshop: the workshop-plugin@1 gestalt, and the workshop@1 worker
agent-template/      what the agent works against: its contract (CLAUDE.md), types, check.ts, examples/
scripts/             node.sh (the node), dev.sh, check-example.sh
```

## How it fits together

```
browser: shell (OPFS `workshop`, synced with the node)
 ├─ chat ─ AgentBackend ─(cli: workshop@1 via the node)─► worker ─► `claude -p` in the plugin's workspace
 └─ PaneFrame (the plugin's access) ─ FrameHost ─ MessagePort ─► <iframe frame.html>: the plugin, on a FrameRepo
```

- **The node.** `scripts/node.sh` runs `gestalts-node` from `../gestalts` with only this repo's plugins:
  - port 7727 and lan-port 7728, its own profile, so it runs beside the Gestalter's desktop app (7717, and 7718
    while pairing);
  - the folder is `$WORKSHOP_DATA`.
  - The app connects its OPFS repo to it on first start; the settings menu changes that.
  - `repo.service()` works only while connected.
- **One plugin `<id>` as notes** (`src/workshop.ts`):

  | note | key | tags | holds |
  |---|---|---|---|
  | the plugin (`workshop-plugin@1`) | `workshop-plugin-<id>` | `workshop-plugin` | `title`, `plugin`, `source` |
  | content and params | `wp-<id>-<name>`, params `wp-<id>-params` | `wp-<id>` | any YAML |
  | a revision | `workshop-revision-<id>-<time>` | `workshop-revision`, `wpr-<id>` | each source it had |
  | the chat | `workshop-chat-<id>` | `workshop-chat` | messages, and each backend's session |

- **Access.** Every plugin gets the same fixed access (`pluginAccess`):
  - read and write `wp-<id>` notes, and learner state (`fsrs-state@1`, `practice-session@1`, `settings@1`);
  - the host's `scopedRepo` enforces it, inside `PaneFrame` with a synthetic `PluginEntry` (no modules).
- **The frame** (`frame.html`) loads the core's natives (`loadNatives` from `@gestalts/client`), so `stableId` and
  `stateKey` match the host's. It then:
  - evaluates the compiled plugin with a `require` limited to `ALLOWED_IMPORTS`;
  - keeps a copy of the notes in scope, which the host replaces on every change;
  - sends writes, blobs and `openNote`/`createNote`/`pickNote` to the host over the port;
  - reports errors (window, rejections, render, `console.error`) back. Compile errors are found on the host side.
  - Styling is Tailwind's browser build plus daisyUI's prebuilt CSS, since a plugin's classes are only known at run time.
  - It's same-origin with `sandbox="allow-scripts allow-same-origin"`. That contains crashes but doesn't isolate.
    Serving `frame.html` from another origin (`VITE_WORKSHOP_FRAME_URL`) isolates it with no protocol change.
- **A turn** (`panels/Chat.tsx`):
  1. The browser sends the plugin as files (`plugin.tsx`, `content/<name>.yml`) with the message and the preview's
     errors since the last turn.
  2. The agent returns the files it changed.
  3. The browser writes them: the source with a revision, then the content through the plugin's scope, so content
     without its tag is refused like any write of the plugin.

  No agent needs note access.
- **The agent seam** is `AgentBackend` (`src/agents/types.ts`). `cli.ts` is the claude CLI behind the node.
  - A browser-side backend (e.g. OpenRouter with tools `read_file`/`write_file`/`check` over the same files, `check`
    being `compile.ts`) fits the same interface, and the rest stays as it is.
- **The worker** (`plugins/workshop/worker/workshop_worker.py`):
  - It has a job per turn. The node's proxy buffers whole responses and gives up after 180 s, so the browser polls
    `GET events?job=&after=n`, which waits up to 20 s.
  - Each plugin gets a workspace, refreshed every turn: the template, `.workshop/compile.ts`, `node_modules` linked
    to the template's, the files, and `runtime-errors.md`.
  - The CLI runs as `claude -p --output-format stream-json --verbose --strict-mcp-config --allowedTools …
    [--resume <session>]`, with the prompt on stdin.
  - Files that changed between turns (edited or reverted in the app) are named in the prompt.
  - Routes are one path segment each, since the Python SDK passes on only the first.
  - The node passes its environment on, so the CLI finds your login. `network:` in plugin.yml isn't enforced by the node.

## Not yet

- **Plugins' capabilities:** kit components, services, slots and lenses. A plugin can't widen its access or own
  gestalts.
- **The workshop:** a live preview during a turn, an OpenRouter or other in-browser backend, and a frame on its own
  origin.
- **Elsewhere:** running workshop plugins in loops-for-learning, which needs the runtime there and this repo's plugin
  for the gestalt.
- **Upstream:** moving `src/runtime` into gestalts' host.
