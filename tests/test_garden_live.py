import contextlib
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

source = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(source))
def load(name):
    spec = importlib.util.spec_from_file_location(name, source / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

garden = load('garden')
live = load('garden_live')


class GardenLiveTests(unittest.TestCase):
    def seed(self, root):
        with contextlib.redirect_stdout(io.StringIO()):
            garden.init(root)
            garden.append(root, 'seed', 'Konsole')
            garden.append(root, 'branch', 'Welten', 'Konsole')

    def test_explicit_process_logs_start_exit_and_utf8_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed(root)
            with contextlib.redirect_stdout(io.StringIO()):
                result = live.run_command(root, 'Welten',
                    [sys.executable, '-c', 'print("Grün ✦")'], garden.read, garden.store)
            self.assertEqual(result, 0)
            data = live.state(root, garden.read, garden.store)
            self.assertEqual([e['kind'] for e in data['runs']], ['run-start', 'run-end'])
            self.assertEqual(data['runs'][1]['output'].strip(), 'Grün ✦')
            self.assertEqual(data['runs'][1]['result'], 'EXITED')
            self.assertEqual(data['runs'][1]['exitCode'], 0)
            self.assertEqual(data['runs'][0]['runId'], data['runs'][1]['runId'])
            self.assertEqual(len(data['garden']), 2)

    def test_failed_and_unknown_node_preserve_distinct_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed(root)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(live.run_command(root, 'Welten',
                    [sys.executable, '-c', 'raise SystemExit(7)'], garden.read, garden.store), 1)
            self.assertEqual(live.read_runs(root, garden.store)[-1]['exitCode'], 7)
            before = live.path(root, garden.store).read_bytes()
            with self.assertRaises(ValueError):
                live.run_command(root, 'Unbekannt', [sys.executable, '-c', 'print("x")'],
                                 garden.read, garden.store)
            self.assertEqual(live.path(root, garden.store).read_bytes(), before)
            live.path(root, garden.store).write_bytes(before.replace(b'EXITED', b'ALTERED'))
            with self.assertRaisesRegex(ValueError, 'Kette beschädigt'):
                live.state(root, garden.read, garden.store)

    def test_end_receipt_space_is_reserved_before_starting_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed(root)
            with patch.object(live, 'capture', return_value=('EXITED', 0, 'Grün')):
                live.run_command(root, 'Welten', ['demo'], garden.read, garden.store)
            target = live.path(root, garden.store)
            before = target.read_bytes()
            start_size = len(before.splitlines(keepends=True)[0])
            available = len(before) + start_size + 1
            with patch.object(live, 'MAX_LEDGER_BYTES', available), patch.object(live, 'capture') as capture:
                with self.assertRaisesRegex(ValueError, 'zu wenig Platz'):
                    live.run_command(root, 'Welten', ['demo'], garden.read, garden.store)
                capture.assert_not_called()
                self.assertEqual(len(live.read_runs(root, garden.store)), 2)
            with patch.object(live, 'LIMIT', 3), patch.object(live, 'capture') as capture:
                with self.assertRaisesRegex(ValueError, 'Ereignislimit'):
                    live.run_command(root, 'Welten', ['demo'], garden.read, garden.store)
                capture.assert_not_called()
            self.assertEqual(target.read_bytes(), before)

    def test_overlapping_commands_keep_two_complete_chained_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed(root)
            overlap = threading.Barrier(2, timeout=7)
            def capture(command, root):
                overlap.wait()
                return 'EXITED', 0, '\0' * live.MAX_OUTPUT
            with contextlib.redirect_stdout(io.StringIO()), patch.object(live, 'capture', side_effect=capture), ThreadPoolExecutor(2) as pool:
                runs = [pool.submit(live.run_command, root, 'Welten', ['demo'], garden.read,
                                    garden.store) for _ in range(2)]
                self.assertEqual([run.result(timeout=12) for run in runs], [0, 0])
            events = live.read_runs(root, garden.store)
            self.assertEqual([row['kind'] for row in events], ['run-start'] * 2 + ['run-end'] * 2)
            self.assertEqual({row['runId'] for row in events[:2]}, {row['runId'] for row in events[2:]})

    def test_loopback_serves_fresh_state_and_rejects_other_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed(root)
            copied = root / 'src'
            copied.mkdir()
            for file in ('garden.py', 'garden_live.py', 'garden_live.html', 'garden_live.js',
                         'garden_jobs.py', 'garden_process.py'):
                shutil.copy2(source / file, copied / file)
            cmd = [sys.executable, '-B', str(copied / 'garden.py'), 'live']
            env = {**os.environ, 'CONSOLE_ZERO_NO_BROWSER': '1'}
            proc = subprocess.Popen(cmd, cwd=root, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True, env=env)
            try:
                url = proc.stdout.readline().split()[2]
                self.assertTrue(url.startswith('http://127.0.0.1:'))
                with urlopen(url + 'state', timeout=3) as response:
                    self.assertEqual(json.load(response)['gardenHead'],
                                     garden.read(root)[-1]['hash'])
                with urlopen(url + 'garden_live.js', timeout=3) as response:
                    self.assertIn(b'setInterval(poll,2000)', response.read())
                with self.assertRaises(HTTPError) as caught:
                    urlopen(Request(url + 'state', headers={'Host': 'other.example'}), timeout=3)
                self.assertEqual(caught.exception.code, 403)
                garden.append(root, 'note', 'Welten', text='Ein neuer Punkt')
                with urlopen(url + 'state', timeout=3) as response:
                    self.assertEqual(len(json.load(response)['garden']), 3)
            finally:
                proc.terminate()
                try:
                    proc.communicate(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.communicate()


if __name__ == '__main__':
    unittest.main()
