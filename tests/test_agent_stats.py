import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "agent_stats.py"
spec = importlib.util.spec_from_file_location("agent_stats", SCRIPT)
assert spec and spec.loader
agent_stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent_stats)


class AgentStatsTest(unittest.TestCase):
    def test_load_filter_and_summarize(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [
                {"schema": "workshop-agent-run@1", "run_id": "a", "view": "one", "status": "ok",
                 "started_at": "2099-01-01T00:00:00+00:00", "timings": {"wall_ms": 100, "api_ms": 60},
                 "usage": {"input_tokens": 5}, "cost_usd": 0.1, "tools": {"Read": 2}},
                {"schema": "workshop-agent-run@1", "run_id": "b", "view": "two", "status": "error",
                 "started_at": "2099-01-01T00:00:00+00:00", "timings": {"wall_ms": 200}, "tools": {}},
            ]
            (root / "2099-01-01.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
            records = agent_stats.selected(agent_stats.load(root), "one", None)
            summary = agent_stats.summarize(records, 5)
            self.assertEqual(summary["runs"], 1)
            self.assertEqual(summary["wall_ms"], 100)
            self.assertEqual(summary["tools"], {"Read": 2})


if __name__ == "__main__":
    unittest.main()
