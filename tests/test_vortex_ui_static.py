"""KORRIDOT Raumflug: markup, module and read-only integration guards.

Flight dynamics and projection are covered by the numerical/runtime suites.
These checks retain polling, preview isolation, text-only UI and accessibility
contracts without requiring obsolete renderer bodies or explanatory comments.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'src/garden_live.html').read_text(encoding='utf-8')
JS = (ROOT / 'src/garden_live.js').read_text(encoding='utf-8')
RENDERER = (ROOT / 'src/cosmos_renderer.mjs').read_text(encoding='utf-8')
OPTICS = (ROOT / 'src/space_optics.mjs').read_text(encoding='utf-8')


class KorridotUIStaticTests(unittest.TestCase):
    def assertContains(self, fragment, source):
        self.assertTrue(fragment in source, f'Missing source/markup contract: {fragment!r}')

    def assertOmits(self, fragment, source):
        self.assertFalse(fragment in source, f'Unexpected source/markup fragment: {fragment!r}')

    def test_version_local_service_and_existing_loopback_contract(self):
        self.assertContains('id="runtime"', HTML)
        self.assertContains('JAVASCRIPT WARTET · RAUMFLUG', HTML)
        self.assertContains("document.getElementById('runtime').textContent", JS)
        self.assertContains('KORRIDOT · RAUMFLUG', JS)
        self.assertContains('<script src="/garden_live.js"></script>', HTML)
        self.assertContains("fetch('/state'", JS)
        self.assertContains('setInterval(poll,2000)', JS)  # existing 403/loopback test

    def test_shared_sky_and_event_layers(self):
        self.assertContains('<canvas id="world"', HTML)
        self.assertContains('<canvas id="cosmos" aria-hidden="true">', HTML)
        self.assertOmits('vortexBackground', HTML)
        self.assertOmits('<svg id="world"', HTML)
        self.assertContains("canvas.getContext('2d'", JS)
        self.assertContains("import('./cosmos_renderer.mjs')", JS)
        self.assertContains("import('./space_optics.mjs')", JS)
        self.assertContains('function drawStars(', JS)
        self.assertContains('function drawGate(', JS)
        self.assertContains('function drawBeacon(', JS)
        self.assertContains('function project(', JS)
        self.assertContains('drawable.sort((a,b)=>b.z-a.z)', JS)

    def test_mathematically_shared_3d_positions_and_receipt_times(self):
        self.assertContains('function bend(z)', JS)
        self.assertContains('function surface(z, angle, fraction = 1)', JS)
        self.assertContains('function camera()', JS)
        self.assertContains('function zFor(index)', JS)
        self.assertContains('zFor(index)', JS)
        self.assertContains('project(surface(', JS)
        self.assertContains("...data.garden.map(", JS)
        self.assertContains("...data.runs.map(", JS)
        self.assertContains('spaceOptics.projectPoint(p,view,width,height,lens,opticalState', JS)
        self.assertContains("from './space_optics.mjs'", RENDERER)
        self.assertContains('soForwardDirection(', RENDERER)
        self.assertContains('soLensInverse(', RENDERER)
        self.assertContains('soInverseDirection(', RENDERER)
        self.assertContains('Raumzeitpunkt T', JS)

    def test_clickable_camera_navigation_and_accessibility(self):
        self.assertContains('canvas.addEventListener(\'pointerup\'', JS)
        self.assertContains('canvas.addEventListener(\'wheel\'', JS)
        self.assertContains('canvas.addEventListener(\'keydown\'', JS)
        self.assertContains('key=pick(p.x,p.y)', JS)
        self.assertContains('<canvas id="world" tabindex="0"', HTML)
        self.assertContains('function focusRow(', JS)
        self.assertContains("reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')", JS)
        self.assertContains('let motion = false', JS)

    def test_public_preview_builder_literally_compatible(self):
        for marker in ('<title>Console Zero · Raumzeit</title>',
                       'VERBINDE LOKAL …', 'Offene Wachstumsspur', 'MODELLANSICHT / T',
                       'LOKAL · BELEGSTATUS OFFEN', '<div class="legend">'):
            with self.subTest(marker=marker):
                self.assertContains(marker, HTML)
        for marker in ("line(detail, 'SHA-256 ' + e.hash, 'code');",
                       'Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.',
                       "+' · lokal'", '  async function poll() {'):
            self.assertContains(marker, JS)
        before_poll = JS.split('  async function poll() {', 1)[0]
        self.assertOmits('fetch(', before_poll)
        self.assertOmits('setInterval(', before_poll)
        # Run the existing builder against an isolated source-only fixture: no
        # local receipts or user directories are copied into the preview.
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary)
            (fixture / 'src').mkdir()
            (fixture / 'tools').mkdir()
            module_names = sorted(path.name for path in (ROOT / 'src').glob('*.mjs')) + ['particle-dynamics.js','reference-physics.js','models.js','material-engine.js','material-model.js','material-view.js','doppelacht-source.js','doppelacht.js','doppelacht-view.js']
            for name in ('garden_live.html', 'garden_live.js', *module_names):
                shutil.copyfile(ROOT / 'src' / name, fixture / 'src' / name)
            builder = fixture / 'tools/build_preview.py'
            shutil.copyfile(ROOT / 'tools/build_preview.py', builder)
            # These are the public source records used by the offline timeline.
            # An isolated build must also verify them before copying the module.
            shutil.copytree(ROOT / 'tools/gg24', fixture / 'tools/gg24',
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            result = subprocess.run([sys.executable, '-B', str(builder)],
                                    cwd=fixture, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr[:1000])
            page = (fixture / 'docs/index.html').read_text(encoding='utf-8')
            script = (fixture / 'docs/preview.js').read_text(encoding='utf-8')
            self.assertContains("connect-src 'none'", page)
            self.assertContains('DEMO · SYNTHETISCHE DATEN · KEINE LOKALEN DATEIEN', page)
            self.assertContains('<script src="./preview.js"></script>', page)
            self.assertOmits('fetch(', script)
            self.assertOmits('setInterval(', script)
            imports = re.findall(r"import\(['\"]\./([^'\"]+\.mjs)['\"]\)", script)
            self.assertTrue(imports, 'The preview must retain its local renderer modules')
            for name in imports:
                self.assertTrue((fixture / 'docs' / name).is_file(),
                                f'Public preview is missing {name}')

    def test_remote_exposure_remains_explicit_and_text_only(self):
        for fragment in ("default-src 'none'", "script-src 'self'", "connect-src 'self'"):
            self.assertContains(fragment, HTML)
        self.assertOmits('innerHTML', JS)
        self.assertOmits('eval(', JS)
        self.assertOmits('github.com/', JS.lower())
        self.assertContains("a.rel = 'noopener noreferrer'", JS)

    def test_virtual_flight_never_writes_receipts(self):
        self.assertContains('requestAnimationFrame(animate)', JS)
        self.assertEqual(len(re.findall(r'\bfetch\s*\(', JS)), 1,
                         'The live UI has exactly one read-only state request')
        self.assertContains("fetch('/state',{cache:'no-store'})", JS)
        for source in (JS, RENDERER, OPTICS):
            for writer in ('sendBeacon(', 'XMLHttpRequest', 'WebSocket(',
                           'localStorage.setItem(', 'sessionStorage.setItem('):
                self.assertOmits(writer, source)
        for source in (RENDERER, OPTICS):
            self.assertOmits('fetch(', source)
        self.assertContains('KEIN AUTOMATISCHER GITHUB-ABRUF', JS)
        self.assertOmits('POST', JS)

    def test_continuous_control_loop_and_predictable_stop(self):
        self.assertContains("canvas.addEventListener('contextmenu',event=>event.preventDefault())",JS)
        self.assertContains("const mode=event.pointerType==='touch'||event.button===2?'pilot':'look'",JS)
        self.assertContains('function animate(time)',JS)
        self.assertContains('if(document.hidden)',JS)
        self.assertOmits('setInterval(animate',JS)
        self.assertContains('Math.exp(-dt*',JS)
        self.assertContains('wheelImpulse=clamp(wheelImpulse+',JS)
        self.assertOmits('frameCount%2',JS)
        self.assertContains('pointercancel',JS)
        self.assertContains('visibilitychange',JS)

    def test_reverse_brake_and_manual_default(self):
        self.assertContains('id="reverseHold"',HTML)
        self.assertContains('id="brakeHold"',HTML)
        self.assertContains("const releaseReverse=bindHold('reverseHold'",JS)
        self.assertContains("const releaseBrake=bindHold('brakeHold'",JS)
        self.assertContains("keys.has('s')",JS)
        self.assertContains("keys.has('x')",JS)
        self.assertContains('boost?-78:-55',JS)
        self.assertContains('braking?14:reversing?11',JS)
        self.assertContains('motion?12:0',JS)
        self.assertContains('let motion = false',JS)
        self.assertContains("window.addEventListener('blur'",JS)
        self.assertContains('releaseReverse();releaseBrake();',JS)
        self.assertContains('Shift+S: TURBO-Rückflug',HTML)

    def test_volumetric_stars_without_overlay_and_separate_data_claims(self):
        self.assertContains('cosmosModule.createStarGeometry()',JS)
        self.assertContains('cosmosModule.createLocalStars(view)',JS)
        self.assertContains('spaceOptics.projectPointImages(world,view,width,height,lens,opticalState',JS)
        self.assertContains('if(!usingCosmos&&!viewingPoint)drawStars()',JS)
        self.assertIsNone(re.search(r'\bdrawFilaments\s*\(\s*\)\s*;',JS),
                          'The obsolete filament layer must not be drawn')
        self.assertOmits('function drawTube(',JS)
        self.assertOmits('vortexBackground',HTML)
        self.assertContains('Sterne sind modellierte 3D-Punkte',HTML)

    def test_flight_telemetry_and_keyboard_controls(self):
        self.assertContains('FPS · T',JS)
        self.assertContains('flightSpeed',JS)
        self.assertContains("keys.has('d')",JS)
        self.assertContains("keys.has('e')",JS)
        self.assertContains('thrustHeld=false',JS)
        self.assertContains('Touch gedrückt halten/ziehen',HTML)
        self.assertContains('Rechte Maustaste halten',HTML)
        self.assertContains('kein laufendes Programm', JS)


if __name__ == '__main__':
    unittest.main()
