"""KORRIDOT 0.7 static regression guards; browser tests remain separate.

Deliberately preserves the older loopback test's exact polling bytes and the
public builder's literal replacement points, rather than weakening the suite.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'src/garden_live.html').read_text(encoding='utf-8')
JS = (ROOT / 'src/garden_live.js').read_text(encoding='utf-8')


class KorridotUIStaticTests(unittest.TestCase):
    def test_version_local_service_and_existing_loopback_contract(self):
        self.assertIn('JAVASCRIPT WARTET · KORRIDOT 0.7', HTML)
        self.assertIn('JAVASCRIPT AKTIV · KORRIDOT 0.7', JS)
        self.assertIn('<script src="/garden_live.js"></script>', HTML)
        self.assertIn("fetch('/state'", JS)
        self.assertIn('setInterval(poll,2000)', JS)  # existing 403/loopback test

    def test_not_two_loosely_overlaid_animated_layers(self):
        self.assertIn('<canvas id="world"', HTML)
        self.assertNotIn('vortexBackground', HTML)
        self.assertNotIn('<svg id="world"', HTML)
        self.assertIn("canvas.getContext('2d'", JS)
        self.assertIn('function drawFilaments(', JS)
        self.assertIn('function drawStars(', JS)
        self.assertIn('function drawGate(', JS)
        self.assertIn('function drawBeacon(', JS)
        self.assertIn('function project(', JS)
        self.assertIn('drawable.sort((a,b)=>b.z-a.z)', JS)

    def test_mathematically_shared_3d_positions_and_receipt_times(self):
        self.assertIn('function bend(z)', JS)
        self.assertIn('function surface(z, angle, fraction = 1)', JS)
        self.assertIn('function camera()', JS)
        self.assertIn('function zFor(index)', JS)
        self.assertIn('zFor(index)', JS)
        self.assertIn('project(surface(', JS)
        self.assertIn("...data.garden.map(", JS)
        self.assertIn("...data.runs.map(", JS)
        self.assertIn('cameraZ+=dt*(flightSpeed+wheelImpulse)', JS)
        self.assertIn('Raumzeitpunkt T', JS)

    def test_clickable_camera_navigation_and_accessibility(self):
        self.assertIn('canvas.addEventListener(\'pointerup\'', JS)
        self.assertIn('canvas.addEventListener(\'wheel\'', JS)
        self.assertIn('canvas.addEventListener(\'keydown\'', JS)
        self.assertIn('key=pick(p.x,p.y)', JS)
        self.assertIn('<canvas id="world" tabindex="0"', HTML)
        self.assertIn('function focusRow(', JS)
        self.assertIn("reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')", JS)
        self.assertIn('let motion = !reducedMotion', JS)

    def test_public_preview_builder_literally_compatible(self):
        for marker in ('<title>Console Zero · Raumzeit</title>', 'Console Zero / Experiment 02',
                       'VERBINDE LOKAL …', 'Offene Wachstumsspur', 'MODELLANSICHT / T',
                       'LOKAL · BELEGSTATUS OFFEN', '<div class="legend">'):
            with self.subTest(marker=marker):
                self.assertIn(marker, HTML)
        for marker in ("line(detail, 'SHA-256 ' + e.hash, 'code');",
                       'Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.',
                       "+' · lokal'", '  async function poll() {'):
            self.assertIn(marker, JS)
        before_poll = JS.split('  async function poll() {', 1)[0]
        self.assertNotIn('fetch(', before_poll)
        self.assertNotIn('setInterval(', before_poll)

    def test_remote_exposure_remains_explicit_and_text_only(self):
        for fragment in ("default-src 'none'", "script-src 'self'", "connect-src 'self'"):
            self.assertIn(fragment, HTML)
        self.assertNotIn('innerHTML', JS)
        self.assertNotIn('eval(', JS)
        self.assertNotIn('github.com/', JS.lower())
        self.assertIn("a.rel = 'noopener noreferrer'", JS)

    def test_virtual_flight_never_writes_receipts(self):
        self.assertIn('requestAnimationFrame(animate)', JS)
        self.assertIn('visual looping never creates log events', JS)
        self.assertIn('KEIN AUTOMATISCHER GITHUB-ABRUF', JS)
        self.assertNotIn('POST', JS)

    def test_continuous_control_loop_and_predictable_stop(self):
        self.assertIn("canvas.addEventListener('contextmenu',event=>event.preventDefault())",JS)
        self.assertIn("const mode=event.pointerType==='touch'||event.button===2?'pilot':'look'",JS)
        self.assertIn('dt-based input integration',JS)
        self.assertIn('Math.exp(-dt*',JS)
        self.assertIn('wheelImpulse=clamp(wheelImpulse+',JS)
        self.assertNotIn('frameCount%2',JS)
        self.assertIn('pointercancel',JS)
        self.assertIn('visibilitychange',JS)

    def test_volumetric_stars_without_overlay_and_separate_data_claims(self):
        self.assertIn('const starCells = Array.from(',JS)
        self.assertIn('const p=project(star)',JS)
        self.assertIn('drawStars();',JS)
        self.assertIn('drawFilaments();',JS)
        self.assertNotIn('function drawTube(',JS)
        self.assertNotIn('vortexBackground',HTML)
        self.assertIn('Sterne sind modellierte 3D-Punkte',HTML)

    def test_flight_telemetry_and_keyboard_controls(self):
        self.assertIn('FPS · T',JS)
        self.assertIn('flightSpeed',JS)
        self.assertIn("keys.has('d')",JS)
        self.assertIn("keys.has('e')",JS)
        self.assertIn('thrustHeld=false',JS)
        self.assertIn('Touch gedrückt halten/ziehen',HTML)
        self.assertIn('Rechte Maustaste halten',HTML)
        self.assertIn('kein laufendes Programm', JS)


if __name__ == '__main__':
    unittest.main()
