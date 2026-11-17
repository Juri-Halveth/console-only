"""Real ./garden live server against a fresh synthetic fixture only."""
import contextlib,hashlib,importlib.util,io,os,pathlib,shutil,subprocess,sys,tempfile,unittest
from urllib.request import urlopen
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'src'/f'{name}.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
garden=load('garden')
class ModelAssetServer(unittest.TestCase):
    def test_live_model_assets_and_read_only_synthetic_state(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);shutil.copytree(ROOT/'src',root/'src',ignore=shutil.ignore_patterns('__pycache__'))
            with contextlib.redirect_stdout(io.StringIO()):
                garden.init(root);garden.append(root,'seed','SYNTHETIC_TEST')
            before={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'.zero').rglob('*') if p.is_file()}
            proc=subprocess.Popen([sys.executable,'-B',str(root/'src/garden.py'),'live'],cwd=root,env={**os.environ,'CONSOLE_ZERO_NO_BROWSER':'1','PYTHONIOENCODING':'utf-8'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
            try:
                url=proc.stdout.readline().split()[2]
                for name in ['simulation_models.mjs','particle-dynamics.js','reference-physics.js','models.js','material-engine.js','material-model.js','material-view.js']:
                    with urlopen(url+name,timeout=4) as response:
                        self.assertEqual(response.status,200);self.assertIn('text/javascript',response.headers['Content-Type'])
                        self.assertEqual(response.read(),(ROOT/'src'/name).read_bytes())
                with urlopen(url+'state',timeout=4) as response:self.assertEqual(response.status,200)
                after={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'.zero').rglob('*') if p.is_file()}
                self.assertEqual(after,before)
            finally:
                proc.terminate()
                try:proc.communicate(timeout=4)
                except subprocess.TimeoutExpired:proc.kill();proc.communicate()
if __name__=='__main__':unittest.main()
