"""Stdlib regression guards for the read-only, animated Garden UI.

These static checks complement, rather than replace, browser interaction tests.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'src/garden_live.html').read_text(encoding='utf-8')
JS = (ROOT / 'src/garden_live.js').read_text(encoding='utf-8')


class TestVortexUI(unittest.TestCase):
    def test_version_and_local_script_wiring(self):
        self.assertIn('JAVASCRIPT WARTET · VORTEX 0.5.1', HTML)
        self.assertIn('<script src="/garden_live.js"></script>', HTML)
        self.assertIn("fetch('/state'", JS)
        self.assertRegex(JS, r'setInterval\(poll,\s*2000\)')

    def test_clickable_entities_not_selectable_text(self):
        self.assertIn('role', JS)
        self.assertIn("'button'", JS)
        self.assertIn("'tabindex'", JS)
        self.assertIn('event.target.closest(\'.hit\')', JS)
        self.assertIn('label-hit', HTML)
        self.assertIn('touch-target', JS)
        self.assertIn('user-select:none', HTML)

    def test_no_external_auto_fetch_or_dynamic_html_execution(self):
        self.assertIn("default-src 'none'", HTML)
        self.assertIn("script-src 'self'", HTML)
        self.assertIn("connect-src 'self'", HTML)
        self.assertNotIn('innerHTML', JS)
        self.assertNotIn('eval(', JS)
        self.assertNotIn('github.com/', JS.lower())

    def test_public_preview_builder_compatibility(self):
        for marker in ('<title>Console Zero · Raumzeit</title>',
                       'Console Zero / Experiment 02',
                       'VERBINDE LOKAL …',
                       'Offene Wachstumsspur',
                       'MODELLANSICHT / T',
                       'LOKAL · BELEGSTATUS OFFEN',
                       '<div class="legend">'):
            with self.subTest(marker=marker):
                self.assertIn(marker, HTML)
        for marker in ("line(detail, 'SHA-256 ' + e.hash, 'code');",
                       'Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.',
                       "+' · lokal'", '  async function poll() {'):
            self.assertIn(marker, JS)
        static_part = JS.split('  async function poll() {', 1)[0]
        self.assertNotIn('fetch(', static_part)
        self.assertNotIn('setInterval(', static_part)

    def test_visual_motion_not_fake_receipts(self):
        self.assertIn('requestAnimationFrame(animate)', JS)
        self.assertIn('prefers-reduced-motion: reduce', JS)
        self.assertIn("data.garden", JS)
        self.assertIn("data.runs", JS)
        self.assertIn('kein laufendes Programm', JS)


if __name__ == '__main__':
    unittest.main()
