import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


MODULE = Path(__file__).resolve().parents[1] / 'src' / 'console_zero.py'
spec = importlib.util.spec_from_file_location('console_zero', MODULE)
zero = importlib.util.module_from_spec(spec)
spec.loader.exec_module(zero)


class ConsoleZeroTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        with contextlib.redirect_stdout(io.StringIO()):
            zero.initialize(self.root)

    def add_source(self):
        (self.root / 'inbox' / 'test.txt').write_text('A plus B erzeugen C.\n', encoding='utf-8')
        with contextlib.redirect_stdout(io.StringIO()):
            zero.add(self.root, 'test.txt')
        return zero.events(self.root)[0]

    def test_source_survives_inbox_edit_and_tamper_is_detected(self):
        event = self.add_source()
        (self.root / 'inbox' / 'test.txt').write_text('anderer Text', encoding='utf-8')
        self.assertEqual(len(zero.events(self.root)), 1)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            zero.find(self.root, 'erzeugen')
        self.assertIn('1:test.txt:1', output.getvalue())
        (self.root / '.zero' / 'objects' / event['sha256']).write_text('verändert', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Quellenobjekt verändert'):
            zero.events(self.root)

    def test_external_path_and_symlink_are_rejected(self):
        outside = self.root.parent / 'outside.txt'
        with self.assertRaisesRegex(ValueError, 'Nur ein regulärer Dateiname'):
            zero.add(self.root, '../outside.txt')
        try:
            (self.root / 'inbox' / 'linked.txt').symlink_to(outside)
        except OSError as exc:
            if getattr(exc, 'winerror', None) == 1314:
                self.skipTest('Windows-Symlinkrecht fehlt')
            raise
        with self.assertRaisesRegex(ValueError, 'Nur ein regulärer Dateiname'):
            zero.add(self.root, 'linked.txt')

    def test_no_source_never_calls_model(self):
        with mock.patch.object(zero.subprocess, 'run') as call:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                zero.ask(self.root, 'Was erzeugt A?', 'llama3.1:8b')
        call.assert_not_called()
        self.assertIn('KEINE QUELLE', output.getvalue())

    def test_missing_installed_model_never_downloads_or_runs(self):
        self.add_source()
        with mock.patch.object(zero.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'NAME ID\n', b'')) as call:
            with self.assertRaisesRegex(ValueError, 'kein Download gestartet'):
                zero.ask(self.root, 'Was erzeugen A und B?', 'llama3.1:8b')
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0], ['ollama', 'list'])

    def test_local_model_receives_only_matched_excerpt_as_data(self):
        self.add_source()
        def fake_run(argv, **kwargs):
            self.assertEqual(kwargs['env']['OLLAMA_HOST'], '127.0.0.1:11434')
            if argv[1] == 'list':
                return subprocess.CompletedProcess(argv, 0, b'NAME ID\nllama3.1:8b abc\n', b'')
            self.assertEqual(argv, ['ollama', 'run', 'llama3.1:8b'])
            self.assertIn('A plus B erzeugen C.'.encode('utf-8'), kwargs['input'])
            return subprocess.CompletedProcess(argv, 0, 'Ungeprüfter Vorschlag\u200f'.encode('utf-8'), b'\x8f')
        with mock.patch.object(zero.subprocess, 'run', side_effect=fake_run) as call:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                zero.ask(self.root, 'Was erzeugen A und B?', 'llama3.1:8b')
        self.assertEqual(call.call_count, 2)
        self.assertIn('UNGEPRÜFTER VORSCHLAG', output.getvalue())
        self.assertIn('Ungeprüfter Vorschlag\u200f', output.getvalue())
        self.assertEqual(len(zero.events(self.root)), 1)

    def test_invalid_model_bytes_fail_cleanly_on_caller(self):
        self.add_source()
        replies = [subprocess.CompletedProcess([], 0, b'NAME ID\nllama3.1:8b abc\n', b''),
                   subprocess.CompletedProcess([], 0, b'bad\x8f', b'')]
        with mock.patch.object(zero.subprocess, 'run', side_effect=replies):
            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(UnicodeDecodeError):
                    zero.ask(self.root, 'Was erzeugen A und B?', 'llama3.1:8b')


if __name__ == '__main__':
    unittest.main()
