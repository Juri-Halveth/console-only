import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock

module_path = Path(__file__).resolve().parents[1] / 'src' / 'garden.py'
spec = importlib.util.spec_from_file_location('zero_garden', module_path)
garden = importlib.util.module_from_spec(spec)
spec.loader.exec_module(garden)


class GardenTests(unittest.TestCase):
    def test_help_on_redirected_windows_output(self):
        buffer = io.BytesIO()
        with io.TextIOWrapper(buffer, encoding='cp1252', write_through=True) as output:
            with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as exit_status:
                garden.main(['--help'])
            self.assertEqual(exit_status.exception.code, 0)
            self.assertIn('Äste', buffer.getvalue().decode('cp1252'))

    def test_seed_branches_rebuild_and_render_deterministically(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                garden.init(root)
                garden.append(root, 'seed', 'Keim')
                garden.append(root, 'branch', 'Licht', 'Keim')
                garden.append(root, 'branch', 'Wasser', 'Keim')
                garden.append(root, 'branch', 'Blatt', 'Licht')
                view = garden.render(root)
            content = view.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                garden.render(root)
            self.assertEqual(view.read_bytes(), content)
            self.assertEqual(len(garden.read(root)), 4)
            self.assertIn(b'Blatt', content)
            self.assertIn(b'3 \xc3\x84ste', content)
            self.assertIn(b'default-src \'none\'', content)
            self.assertIn(b'href="#node-4"', content)
            self.assertIn(b'id="node-4"', content)
            self.assertIn(b'body:has(#node-4:target) svg', content)
            self.assertIn(b'class="stage-reset" href="#garten"', content)
            self.assertIn(b'Freie Fl\xc3\xa4che: Gesamtansicht wiederherstellen', content)
            self.assertIn(b'body:has(.node-detail:target) .stage-reset', content)
            self.assertIn(b'.stars,.branch{pointer-events:none}', content)
            self.assertIn(b'Noch keine Beschreibung f\xc3\xbcr diesen Raum', content)
            self.assertNotIn(b'<script', content)
            self.assertEqual(content.count(b'class="node-detail"'), 4)
            self.assertTrue((root / '.zero/garden/doors/door-4.html').is_file())

    def test_duplicate_cycle_and_input_controls_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Keim')
            original = garden.store(root)[1].read_bytes()
            for args in [('branch', 'Keim', 'Keim'), ('branch', 'Neu', 'Unbekannt'),
                         ('seed', 'Zweiter'), ('branch', 'Mehr\nCode', 'Keim')]:
                with self.assertRaises(ValueError):
                    garden.append(root, *args)
            self.assertEqual(garden.store(root)[1].read_bytes(), original)

    def test_changed_record_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Keim')
            ledger = garden.store(root)[1]
            ledger.write_bytes(ledger.read_bytes().replace(b'Keim', b'Kram'))
            with self.assertRaisesRegex(ValueError, 'Belegkette'):
                garden.render(root)

    def test_html_labels_escaped_and_not_scripts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', '<script>alert(1)</script>')
            with contextlib.redirect_stdout(io.StringIO()):
                page = garden.render(root).read_text(encoding='utf-8')
            self.assertNotIn('<script>alert(1)</script>', page)
            self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', page)
            self.assertNotIn('href="https:', page)

    def test_render_never_overwrites_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Keim')
            external = root / 'outside.html'
            external.write_text('KEEP', encoding='utf-8')
            view = garden.store(root)[0] / 'view.html'
            try:
                view.symlink_to(external)
            except OSError as exc:
                if getattr(exc, 'winerror', None) == 1314:
                    self.skipTest('Windows-Symlinkrecht fehlt')
                raise
            with self.assertRaisesRegex(ValueError, 'Verknüpfung'):
                garden.render(root)
            self.assertEqual(external.read_text(), 'KEEP')

    def test_open_uses_local_file_url_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Keim')
            with mock.patch.object(garden.webbrowser, 'open', return_value=True) as browser, \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(garden.main(['open'], root), 0)
            self.assertEqual(browser.call_args.args[0], (root / '.zero/garden/view.html').resolve().as_uri())

    def test_legacy_garden_accepts_note_and_opens_bound_door(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Konsole')
            garden.append(root, 'branch', 'Welten', 'Konsole')
            original = garden.store(root)[1].read_bytes()
            garden.append(root, 'note', 'Welten', text='Wir bauen <Licht> & Wege.')
            garden.append(root, 'branch', 'Quellen', 'Konsole')
            events = garden.read(root)
            self.assertTrue(garden.store(root)[1].read_bytes().startswith(original))
            self.assertEqual([e['kind'] for e in events], ['seed', 'branch', 'note', 'branch'])
            with contextlib.redirect_stdout(io.StringIO()):
                garden.render(root)
            door = (root / '.zero/garden/doors/door-2.html').read_text(encoding='utf-8')
            self.assertIn('Wir bauen &lt;Licht&gt; &amp; Wege.', door)
            self.assertIn('../view.html#node-2', door)
            self.assertIn('href="door-1.html">← Konsole</a>', door)
            self.assertIn('href="door-4.html">Quellen</a>',
                          (root / '.zero/garden/doors/door-1.html').read_text(encoding='utf-8'))
            self.assertNotEqual((root / '.zero/garden/doors/door-1.html').read_bytes(),
                                (root / '.zero/garden/doors/door-2.html').read_bytes())
            self.assertNotIn('<Licht>', door)
            self.assertIn('doors/door-2.html', (root / '.zero/garden/view.html').read_text(encoding='utf-8'))

    def test_note_malformed_and_modified_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Konsole')
            for text in ('', 'x' * 1201, 'bad\x00'):
                with self.assertRaises(ValueError):
                    garden.append(root, 'note', 'Konsole', text=text)
            garden.append(root, 'note', 'Konsole', text='Gültig')
            ledger = garden.store(root)[1]
            ledger.write_bytes(ledger.read_bytes().replace('Gültig'.encode(), 'Falsch'.encode()))
            with self.assertRaisesRegex(ValueError, 'Belegkette'):
                garden.render(root)

    def test_public_universum_portal_opens_only_after_explicit_click(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            garden.init(root)
            garden.append(root, 'seed', 'Konsole')
            garden.append(root, 'branch', 'Welten', 'Konsole')
            garden.append(root, 'portal', 'Welten')
            before = garden.store(root)[1].read_bytes()
            garden.append(root, 'portal', 'Welten')
            self.assertEqual(before, garden.store(root)[1].read_bytes())
            with contextlib.redirect_stdout(io.StringIO()):
                garden.render(root)
            view = (root / '.zero/garden/view.html').read_text(encoding='utf-8')
            door = (root / '.zero/garden/doors/door-2.html').read_text(encoding='utf-8')
            self.assertNotIn(garden.UNIVERSUM, view)
            self.assertIn('href="' + garden.UNIVERSUM + '" target="_blank" rel="noopener noreferrer"', door)
            self.assertIn('erst nach deinem Klick', door)
            self.assertNotIn(garden.UNIVERSUM, (root / '.zero/garden/doors/door-1.html').read_text())
            self.assertEqual([e['kind'] for e in garden.read(root)], ['seed', 'branch', 'portal'])
            ledger = garden.store(root)[1]
            ledger.write_bytes(ledger.read_bytes().replace(b'https://', b'httpx://'))
            with self.assertRaisesRegex(ValueError, 'Belegkette'):
                garden.read(root)


if __name__ == '__main__':
    unittest.main()
