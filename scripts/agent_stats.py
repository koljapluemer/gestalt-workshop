#!/usr/bin/env python3
"""Summarize local workshop agent run records."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


def default_root() -> Path:
    workspaces = Path(os.environ.get("WORKSHOP_WORKSPACES", Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "gestalt-workshop" / "workspaces"))
    return workspaces / ".workshop" / "runs"


def load(root: Path) -> list[dict]:
    records = []
    for path in sorted(root.glob("????-??-??.jsonl")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            try:
                record = json.loads(line)
                if record.get("schema") == "workshop-agent-run@1":
                    records.append(record)
            except (json.JSONDecodeError, AttributeError):
                print(f"warning: skipped malformed {path}:{number}", file=sys.stderr)
    return records


def selected(records: list[dict], view: str | None, days: int | None) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days) if days is not None else None
    result = []
    for record in records:
        if view and record.get("view") != view:
            continue
        try:
            started = datetime.fromisoformat(record["started_at"])
        except (KeyError, TypeError, ValueError):
            continue
        if cutoff is None or started >= cutoff:
            result.append(record)
    return result


def summarize(records: list[dict], limit: int) -> dict:
    statuses = Counter(str(r.get("status", "unknown")) for r in records)
    tools: Counter[str] = Counter()
    usage: Counter[str] = Counter()
    for record in records:
        tools.update(record.get("tools") or {})
        usage.update(record.get("usage") or {})

    def timing(name: str) -> float:
        return sum(float((r.get("timings") or {}).get(name, 0) or 0) for r in records)

    def top(key):
        return [
            {"run_id": r.get("run_id"), "view": r.get("view"), "value": key(r)}
            for r in sorted(records, key=key, reverse=True)[:limit]
        ]

    def tokens(record: dict) -> float:
        return sum(float(value or 0) for value in (record.get("usage") or {}).values())

    return {
        "runs": len(records),
        "statuses": dict(sorted(statuses.items())),
        "wall_ms": timing("wall_ms"),
        "api_ms": timing("api_ms"),
        "usage": dict(sorted(usage.items())),
        "cost_usd": sum(float(r.get("cost_usd", 0) or 0) for r in records),
        "tools": dict(tools.most_common()),
        "slowest": top(lambda r: float((r.get("timings") or {}).get("wall_ms", 0) or 0)),
        "largest": top(tokens),
        "costliest": top(lambda r: float(r.get("cost_usd", 0) or 0)),
    }


def human(summary: dict, root: Path) -> str:
    lines = [
        f"Logs: {root.resolve()}",
        f"Runs: {summary['runs']}  Status: {summary['statuses']}",
        f"Wall: {summary['wall_ms'] / 1000:.1f}s  API: {summary['api_ms'] / 1000:.1f}s  Cost: ${summary['cost_usd']:.4f}",
        f"Usage: {summary['usage']}",
        f"Tools: {summary['tools']}",
    ]
    for label in ("slowest", "largest", "costliest"):
        lines.append(f"\n{label.title()}:")
        lines.extend(f"  {item['value']:.2f}  {item['view']}  {item['run_id']}" for item in summary[label])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--days", type=int)
    parser.add_argument("--view")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    summary = summarize(selected(load(args.root), args.view, args.days), max(0, args.limit))
    if args.json:
        print(json.dumps({"logs": str(args.root.resolve()), **summary}, indent=2))
    else:
        print(human(summary, args.root))


if __name__ == "__main__":
    main()
