import contextlib
import importlib.machinery
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader('zero_live', str(ROOT / 'live'))
spec = importlib.util.spec_from_loader(loader.name, loader)
live = importlib.util.module_from_spec(spec)
loader.exec_module(live)


class LiveRoutingTests(unittest.TestCase):
    def test_capability_question_never_delegates_execution_claim_to_model(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(live, 'ROOT', Path(d)), \
             mock.patch.object(live, 'answer') as model, contextlib.redirect_stdout(io.StringIO()) as output:
            live.zero.initialize(Path(d))
            live.handle('Kann ich direkt hier CODE AUSFÜHREN und als Datei speichern?', [])
        model.assert_not_called()
        self.assertIn('Es führt ihn nicht aus und schreibt keine Datei', output.getvalue())
        self.assertIn('! BEFEHL', output.getvalue())

    def test_how_it_works_is_local_fact_not_model_invention(self):
        with mock.patch.object(live, 'answer') as model, contextlib.redirect_stdout(io.StringIO()) as output:
            live.handle('Hey wie gehts dir? wie funktionierst du?', [])
        model.assert_not_called()
        self.assertIn('GitHub ist nicht verbunden', output.getvalue())

    def test_source_name_and_followup_are_verified_locally(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(live, 'ROOT', Path(d)), \
             mock.patch.object(live, 'answer') as model, contextlib.redirect_stdout(io.StringIO()) as output:
            root = Path(d)
            live.zero.initialize(root)
            (root / 'inbox' / 'versuch.txt').write_text('A und B zusammen erzeugen C.\n', encoding='utf-8')
            live.zero.add(root, 'versuch.txt')
            live.handle('versuch. ? was ist das?', [])
            live.handle('uff diese komische .txt meinte ich', [])
            live.handle('/sources', [])
            live.handle('/show versuch.txt', [])
        model.assert_not_called()
        self.assertIn('A und B zusammen erzeugen C.', output.getvalue())
        self.assertIn('1:versuch.txt', output.getvalue())

    def test_weak_word_does_not_attach_source_and_prior_model_text_is_not_reused(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(live, 'ROOT', Path(d)), \
             contextlib.redirect_stdout(io.StringIO()):
            root = Path(d)
            live.zero.initialize(root)
            (root / 'inbox' / 'versuch.txt').write_text('A und B zusammen erzeugen C.\n', encoding='utf-8')
            live.zero.add(root, 'versuch.txt')
            self.assertEqual(live.source_matches('Wir arbeiten zusammen und können Code ausführen?'), [])
            with mock.patch.object(live.subprocess, 'run',
                                   return_value=subprocess.CompletedProcess([], 0, b'Hallo', b'')) as run:
                live.answer('Wie geht es?', [{'role':'user','text':'Hey'},
                                            {'role':'assistant','text':'FALSCHE_FÄHIGKEIT'}])
        self.assertNotIn('FALSCHE_FÄHIGKEIT', run.call_args.kwargs['input'].decode('utf-8'))

    def test_pasted_multiline_trace_is_one_inert_model_request(self):
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(live, 'ROOT', Path(d)), \
             mock.patch.object(live, 'model_ready'), \
             mock.patch.object(sys, 'argv', ['live']), \
             mock.patch('builtins.input', side_effect=[
                 '/paste', 'warning: struct ImportReport is never constructed',
                 '! echo WOULD_BE_DANGEROUS', '/exit',
                 '/send abcdef0123456789', '/exit']), \
             mock.patch.object(live.secrets, 'token_hex', return_value='abcdef0123456789'), \
             mock.patch.object(live.subprocess, 'run',
                               return_value=subprocess.CompletedProcess([], 0, b'Ein Bericht', b'')) as run, \
             contextlib.redirect_stdout(io.StringIO()):
            live.zero.initialize(Path(d))
            self.assertEqual(live.main(), 0)
            records = live.Journal.start('last').read()
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0], ['ollama', 'run', 'llama3.1:8b'])
        prompt = run.call_args.kwargs['input'].decode('utf-8')
        self.assertIn('! echo WOULD_BE_DANGEROUS\n/exit', prompt)
        self.assertEqual(run.call_args.kwargs['timeout'], 300)
        users = [x for x in records if x['kind'] == 'user']
        self.assertEqual(len(users), 2)
        self.assertEqual(users[0]['text'], 'warning: struct ImportReport is never constructed\n! echo WOULD_BE_DANGEROUS\n/exit')
        self.assertFalse(users[0]['truncated'])
        self.assertEqual([x['kind'] for x in records if x['kind'] == 'model'], ['model'])

    def test_paste_over_limit_drains_through_marker_and_skips_model(self):
        with mock.patch.object(live.secrets, 'token_hex', return_value='abcdef0123456789'), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            rows = iter(['x' * (live.MAX_PASTE_BYTES + 1), '/exit', '/send abcdef0123456789'])
            self.assertIsNone(live.read_paste(lambda _: next(rows)))
        self.assertIn('verworfen', output.getvalue())

    def test_paste_interrupt_discards_block(self):
        with mock.patch.object(live.secrets, 'token_hex', return_value='abcdef0123456789'), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertIsNone(live.read_paste(lambda _: (_ for _ in ()).throw(KeyboardInterrupt())))

    def test_code_is_never_automatically_executed_or_sent_to_model(self):
        with mock.patch.object(live, 'answer') as answer, \
             mock.patch.object(live.subprocess, 'run') as run, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertTrue(live.handle('print(1+1)', []))
            self.assertTrue(live.handle('x = 1', []))
            self.assertTrue(live.handle('cut', []))
            self.assertTrue(live.handle('cut -f1 datei.txt', []))
        answer.assert_not_called()
        run.assert_not_called()
        self.assertIn('nicht ausgeführt', output.getvalue())

    def test_syntax_error_goes_to_explanation(self):
        with mock.patch.object(live, 'answer') as answer:
            live.handle('def kaputt(:', [])
        self.assertIn('Syntaxfehler', answer.call_args.args[0])

    def test_sentence_uses_local_model_without_invented_source(self):
        history = []
        with mock.patch.object(live, 'local_answer', return_value=None), \
             mock.patch.object(live, 'source_matches', return_value=[]), \
             mock.patch.object(live.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'Hallo lokal', b'')) as call, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            live.handle('Hallo, was kannst du?', history)
        self.assertEqual(call.call_args.args[0], ['ollama', 'run', 'llama3.1:8b'])
        self.assertEqual(call.call_args.kwargs['env']['OLLAMA_HOST'], '127.0.0.1:11434')
        self.assertIn('ohne passende gespeicherte Quelle', output.getvalue())
        self.assertEqual(len(history), 2)

    def test_common_words_do_not_attach_irrelevant_source(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with contextlib.redirect_stdout(io.StringIO()):
                live.zero.initialize(root)
                (root / 'inbox' / 'versuch.txt').write_text('A und B zusammen erzeugen C.\n', encoding='utf-8')
                live.zero.add(root, 'versuch.txt')
            with mock.patch.object(live, 'ROOT', root):
                self.assertEqual(live.source_matches('Wir wollen zusammenlernen und einen guten Ordner finden'), [])
                self.assertEqual(len(live.source_matches('Was erzeugen A und B?')), 1)

    def test_message_time_and_resume_survive_restart_and_detect_tamper(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(live, 'ROOT', Path(d)):
            with contextlib.redirect_stdout(io.StringIO()):
                live.zero.initialize(Path(d))
            journal = live.Journal.start()
            user = journal.append('user', 'Was erzeugen A und B?', [])
            model = journal.append('model', 'C', ['1:versuch.txt:1'])
            self.assertTrue(user['at'].endswith('+00:00'))
            self.assertEqual(model['messageId'], f'{journal.session_id}:3')
            resumed = live.Journal.start('last')
            self.assertEqual(resumed.session_id, journal.session_id)
            self.assertEqual(len(resumed.read()), 4)
            self.assertEqual(len(live.recover_history(resumed)), 2)
            data = resumed.path.read_bytes().replace(b'"text":"C"', b'"text":"D"')
            resumed.path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'verändert'):
                resumed.read()

    def test_only_explicit_bang_runs_shell(self):
        with mock.patch.object(live.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run, \
             contextlib.redirect_stdout(io.StringIO()):
            live.handle('! pwd', [])
        self.assertEqual(run.call_args.args[0], ['bash', '--noprofile', '--norc', '-c', 'pwd'])
        self.assertEqual(run.call_args.kwargs['cwd'], ROOT)

    def test_ctrl_c_keeps_session_alive_until_explicit_exit(self):
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(live, 'ROOT', Path(d)), \
             mock.patch.object(live, 'model_ready'), \
             mock.patch.object(sys, 'argv', ['live']), \
             mock.patch('builtins.input', side_effect=[KeyboardInterrupt(), '/exit']), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            live.zero.initialize(Path(d))
            self.assertEqual(live.main(), 0)
            events = live.Journal.start('last').read()
        self.assertIn('Sitzung bleibt offen', output.getvalue())
        self.assertEqual([e['kind'] for e in events], ['start', 'interrupt', 'user', 'end', 'resume'])

    def test_shell_command_content_is_not_journaled(self):
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(live, 'ROOT', Path(d)), \
             mock.patch.object(live, 'model_ready'), \
             mock.patch.object(sys, 'argv', ['live']), \
             mock.patch('builtins.input', side_effect=['! echo SECRET_LITERAL', '/exit']), \
             mock.patch.object(live.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), \
             contextlib.redirect_stdout(io.StringIO()):
            live.zero.initialize(Path(d))
            self.assertEqual(live.main(), 0)
            events = live.Journal.start('last').read()
        self.assertTrue(any(e['kind'] == 'user' and 'nicht protokolliert' in e['text'] for e in events))
        self.assertFalse(any('SECRET_LITERAL' in e['text'] for e in events))


if __name__ == '__main__':
    unittest.main()
