"""Lifecycle checks use one private temporary-file lock as the worker witness."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(SOURCE))
import garden
import garden_jobs
import garden_live
import garden_process


def lock_file(stream):
    if os.name == 'nt':
        import msvcrt
        msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)


def demo_command(mode):
    return [sys.executable, '-B', str(Path(__file__).resolve()), mode]


def demo(mode):
    if mode == 'child':
        with open('worker.lock', 'r+b') as stream:
            lock_file(stream)
            Path('worker.ready').touch()
            print('worker ready', flush=True)
            time.sleep(15)
    else:
        child = subprocess.Popen(demo_command('child'))
        if mode == 'wait-for-child':
            child.wait()


class RunLifecycleTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / 'worker.lock').write_bytes(b'x')
        with contextlib.redirect_stdout(io.StringIO()):
            garden.init(self.root)
            garden.append(self.root, 'seed', 'Lab')

    def assert_child_released(self):
        self.assertTrue((self.root / 'worker.ready').is_file(), 'child acquired the lock')
        with (self.root / 'worker.lock').open('r+b') as stream:
            lock_file(stream)  # Immediate, nonblocking OS check after receipt.

    def test_timeout_releases_owned_descendant_even_after_root_exits(self):
        for mode in ('wait-for-child', 'exit-with-pipe-open'):
            with self.subTest(mode=mode), patch.object(garden_live, 'MAX_SECONDS', 2):
                (self.root / 'worker.ready').unlink(missing_ok=True)
                with contextlib.redirect_stdout(io.StringIO()):
                    code = garden_live.run_command(self.root, 'Lab', demo_command(mode), garden.read, garden.store)
                self.assertEqual(code, 1)
                end = garden_live.read_runs(self.root, garden.store)[-1]
                self.assertEqual(end['result'], 'TIMEOUT')
                self.assertIn('worker ready', end['output'])
                self.assert_child_released()

    def test_cancel_after_root_exit_releases_job_worker(self):
        with ThreadPoolExecutor(1) as runner, contextlib.redirect_stdout(io.StringIO()):
            run = runner.submit(garden_jobs.start_job, self.root, 'Lab', demo_command('exit-with-pipe-open'),
                                10, garden.read, garden.store)
            deadline = time.monotonic() + 5
            while not (self.root / 'worker.ready').is_file() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue((self.root / 'worker.ready').is_file())
            job = garden_jobs.read_jobs(self.root, garden.store)[0]['jobId']
            garden_jobs.cancel_job(self.root, job, garden.store)
            self.assertEqual(run.result(timeout=6), 1)
        self.assertEqual(garden_jobs.read_jobs(self.root, garden.store)[-1]['result'], 'CANCELLED')
        self.assert_child_released()

    def test_launch_error_is_distinct_and_literal_arguments_survive(self):
        missing = str(self.root / 'no-such-executable')
        outcome, code, _ = garden_live.capture([missing], self.root)
        self.assertEqual((outcome, code), ('SPAWN_ERROR', None))
        argument = 'zwei Wörter "mit Anführungszeichen"'
        self.assertEqual(garden_live.capture([sys.executable, '-c',
                         'import sys; print(sys.argv[1],end=""); sys.exit(7)', argument], self.root),
                         ('EXITED', 7, argument))

    def test_stopping_one_owner_preserves_another_running_command(self):
        commands = []
        try:
            for label in ('first', 'second'):
                root = self.root / label
                root.mkdir()
                (root / 'worker.lock').write_bytes(b'x')
                commands.append(garden_process.start(demo_command('child'), root))
                deadline = time.monotonic() + 5
                while not (root / 'worker.ready').is_file() and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertTrue((root / 'worker.ready').is_file())
            commands[0].stop()
            self.assertEqual(commands[0].stdout.read().strip(), b'worker ready')
            self.assertIsNone(commands[1].poll())
            with (self.root / 'second' / 'worker.lock').open('r+b') as stream:
                with self.assertRaises(OSError):
                    lock_file(stream)
        finally:
            for command in commands:
                command.stop()
                command.close()
                command.stdout.close()


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] in {'child', 'wait-for-child', 'exit-with-pipe-open'}:
        demo(sys.argv[1])
    else:
        unittest.main()
