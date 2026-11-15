import importlib.util
from pathlib import Path
import contextlib
import io
import json
import os
import tempfile
import threading
import time
import sys
import unittest

SRC = Path(__file__).resolve().parents[1] / 'src'
if not (SRC / 'garden_jobs.py').exists():
    SRC = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('garden_jobs', SRC / 'garden_jobs.py')
jobs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jobs)


def store(root):
    b = root / '.zero' / 'garden'
    b.mkdir(parents=True, exist_ok=True)
    return b, b / 'events.jsonl'


def read(root):
    return [{'kind':'seed','name':'Konsole'},{'kind':'branch','name':'Funktionsatlas'}]

class LongJobTests(unittest.TestCase):
    def test_success_and_sha_chain_and_no_output_in_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                code = jobs.start_job(root, 'Funktionsatlas',
                    [sys.executable, '-c', 'print("PRIVATE_WORD")'], 5, read, store)
            self.assertEqual(code, 0)
            events = jobs.read_jobs(root, store)
            self.assertEqual([e['kind'] for e in events], ['job-start','job-end'])
            self.assertEqual(events[-1]['result'], 'EXITED')
            self.assertNotIn('PRIVATE_WORD', json.dumps(events))
            logfile = root / '.zero/garden/job-logs' / (events[0]['jobId']+'.log')
            self.assertIn(b'PRIVATE_WORD', logfile.read_bytes())
            self.assertEqual(events[-1]['logHash'], jobs._hash(logfile.read_bytes()))
            self.assertFalse((root / '.zero/garden/job-active.lock').exists())

    def test_bad_hash_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                jobs.start_job(root,'Funktionsatlas',[sys.executable,'-c','print(3)'],5,read,store)
            ledger = root / '.zero/garden/jobs.jsonl'
            ledger.write_bytes(ledger.read_bytes().replace(b'EXITED',b'PWNEDX'))
            with self.assertRaisesRegex(ValueError, 'Hashkette'):
                jobs.read_jobs(root,store)

    def test_unknown_node_and_unbounded_timeout_rejected_without_side_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, sec in [('Unknown',5),('Funktionsatlas',999999)]:
                with self.assertRaises(ValueError):
                    jobs.start_job(root, name, [sys.executable, '-c','print(1)'],sec,read,store)
            self.assertFalse((root / '.zero/garden/jobs.jsonl').exists())

    def test_cancel_running_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            errors = []
            def runner():
                try:
                    jobs.start_job(root,'Funktionsatlas',
                        [sys.executable,'-c','import time; time.sleep(10)'],15,read,store)
                except Exception as ex:
                    errors.append(ex)
            thread = threading.Thread(target=runner)
            with contextlib.redirect_stdout(io.StringIO()):
                thread.start()
                path = root / '.zero/garden/job-active.lock'
                for _ in range(100):
                    if path.exists(): break
                    time.sleep(.025)
                self.assertTrue(path.exists())
                jobid = json.loads(path.read_text())['jobId']
                for _ in range(100):
                    if jobs.read_jobs(root,store): break
                    time.sleep(.025)
                jobs.cancel_job(root, jobid, store)
                thread.join(timeout=8)
            self.assertFalse(thread.is_alive())
            self.assertFalse(errors)
            self.assertEqual(jobs.read_jobs(root,store)[-1]['result'],'CANCELLED')

if __name__ == '__main__':
    unittest.main()
