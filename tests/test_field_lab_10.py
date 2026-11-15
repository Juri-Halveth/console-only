"""Field Lab integration smoke tests; no browser or network access required."""
from pathlib import Path
import re
import shutil
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[1]

class FieldLabIntegrationTests(unittest.TestCase):
    def test_existing_source_was_preserved_and_license_bundled(self):
        p = ROOT / 'src/field_physics.mjs'
        self.assertIn('export function simulateCentral(', p.read_text(encoding='utf-8'))
        self.assertIn('export function centralAcceleration(', p.read_text(encoding='utf-8'))
        self.assertTrue((ROOT / 'src/field_lab_LICENSE.txt').is_file())
        self.assertIn('8c6e1ab', (ROOT / 'src/field_lab_NOTICE.md').read_text(encoding='utf-8'))

    def test_model_numeric_contract_from_original_module(self):
        node = shutil.which('node')
        if not node: self.skipTest('Node fehlt')
        code = '''import {centralAcceleration, simulateCentral} from './src/field_physics.mjs';
let a = centralAcceleration([1,0],0)[0], b = centralAcceleration([1,0],1)[0], c = centralAcceleration([1,0],1.4)[0];
if (!(a < -0.99 && b === 0 && c > .39)) process.exit(7);
if (simulateCentral(1).length !== 331) process.exit(8);
console.log('FIELD_MODEL_SOURCE_OK');'''
        result = subprocess.run([node,'--input-type=module','-e',code],cwd=ROOT,
             capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        self.assertIn('FIELD_MODEL_SOURCE_OK',result.stdout)

    def test_local_service_and_scene_wiring(self):
        py=(ROOT/'src/garden_live.py').read_text(encoding='utf-8')
        js=(ROOT/'src/garden_live.js').read_text(encoding='utf-8')
        html=(ROOT/'src/garden_live.html').read_text(encoding='utf-8')
        self.assertIn("'/field_physics.mjs'",py)
        self.assertIn("import('./field_physics.mjs')",js)
        self.assertIn('drawFieldTrajectory();',js)
        self.assertIn('fieldModel.simulateCentral(kappa)',js)
        self.assertIn('id="fieldKappa"',html)
        self.assertIn('id="fieldLab" hidden',html)
        self.assertNotIn('innerHTML',js)

if __name__ == '__main__':
    unittest.main()
