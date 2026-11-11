import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

PLUGIN = Path(__file__).resolve().parents[1] / "plugins" / "workshop-agent"
sys.path.insert(0, str(PLUGIN))
from runlog import RunLog  # noqa: E402


class RunLogTest(unittest.TestCase):
    def test_writes_raw_trace_and_normalized_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = RunLog(root, "run-1", "view", "old-session", "hello", {"view.tsx": "abc"}, [{}])
            log.event({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read"}]}})
            log.event({"type": "result", "duration_ms": 12, "duration_api_ms": 8, "num_turns": 2,
                       "total_cost_usd": 0.25,
                       "usage": {"input_tokens": 10, "output_tokens": 4, "cache_read_input_tokens": 20}})
            record = log.finish(status="ok", session="new-session", exit_code=0, changed_files=1, error=None)
            self.assertEqual(record["usage"], {"input_tokens": 10, "output_tokens": 4, "cache_read_tokens": 20})
            self.assertEqual(record["tools"], {"Read": 1})
            self.assertEqual(record["request"]["file_chars"], 3)
            self.assertEqual(record["timings"]["api_ms"], 8)
            raw = list((root / ".workshop" / "runs" / record["raw"]).read_text().splitlines())
            self.assertEqual(len(raw), 2)
            summary = next((root / ".workshop" / "runs").glob("????-??-??.jsonl"))
            self.assertEqual(json.loads(summary.read_text())["run_id"], "run-1")

    def test_records_malformed_output_stderr_and_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = RunLog(root, "run-2", "view", None, "hello", {}, [])
            log.malformed("not json\n")
            log.stderr("bad news")
            record = log.finish(status="error", session=None, exit_code=2, changed_files=0, error="failed")
            self.assertEqual(record["status"], "error")
            raw = (root / ".workshop" / "runs" / record["raw"]).read_text()
            self.assertIn('\"unparsed\":\"not json\"', raw)
            self.assertIn('\"stream\":\"stderr\"', raw)

    def test_appends_concurrent_summaries_without_losing_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            logs = [RunLog(root, f"run-{i}", "view", None, "hello", {}, []) for i in range(10)]
            threads = [threading.Thread(target=log.finish, kwargs={
                "status": "ok", "session": None, "exit_code": 0, "changed_files": 0, "error": None,
            }) for log in logs]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            summary = next((root / ".workshop" / "runs").glob("????-??-??.jsonl"))
            records = [json.loads(line) for line in summary.read_text().splitlines()]
            self.assertEqual({record["run_id"] for record in records}, {f"run-{i}" for i in range(10)})


if __name__ == "__main__":
    unittest.main()
