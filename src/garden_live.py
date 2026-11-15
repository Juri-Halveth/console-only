"""Explicit local command receipts and a read-only loopback view of the garden."""
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid
import webbrowser

ZERO = '0' * 64
LIMIT = 128
MAX_OUTPUT = 4096
MAX_SECONDS = 30


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':')).encode('utf-8')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def path(root, store):
    folder, _ = store(root)
    target = folder / 'runs.jsonl'
    if target.is_symlink():
        raise ValueError('Ausführungsbeleg ist eine Verknüpfung')
    return target


def read_runs(root, store):
    target = path(root, store)
    if not target.exists():
        return []
    blob = target.read_bytes()
    if len(blob) > 250_000 or blob and not blob.endswith(b'\n'):
        raise ValueError('Ausführungsbeleg zu groß oder abgeschnitten')
    previous, events, starts, ended = ZERO, [], {}, set()
    for sequence, line in enumerate(blob.splitlines(), 1):
        entry = json.loads(line)
        if type(entry) is not dict or entry.get('kind') not in ('run-start', 'run-end'):
            raise ValueError('Ausführungsbeleg: ungültiges Schema')
        fields = ({'seq', 'prev', 'kind', 'node', 'at', 'runId', 'argv', 'hash'}
                  if entry['kind'] == 'run-start' else
                  {'seq', 'prev', 'kind', 'node', 'at', 'runId', 'result', 'exitCode', 'output', 'hash'})
        if set(entry) != fields:
            raise ValueError('Ausführungsbeleg: ungültige Felder')
        claimed = entry.pop('hash')
        if (type(entry['seq']) is not int or entry['seq'] != sequence or
                entry['prev'] != previous or claimed != sha(packed(entry)) or
                type(entry['node']) is not str or type(entry['at']) is not str or
                not entry['at'].endswith('+00:00') or
                type(entry['runId']) is not str or
                not re.fullmatch(r'[0-9a-f]{32}', entry['runId'])):
            raise ValueError('Ausführungsbeleg: Kette beschädigt')
        if entry['kind'] == 'run-start':
            if (entry['runId'] in starts or type(entry['argv']) is not list or
                    not 1 <= len(entry['argv']) <= 64 or
                    any(type(arg) is not str or not arg or len(arg) > 1024 for arg in entry['argv'])):
                raise ValueError('Ausführungsbeleg: Start ungültig')
            starts[entry['runId']] = entry['node']
        else:
            if (entry['runId'] not in starts or entry['runId'] in ended or
                    starts[entry['runId']] != entry['node'] or
                    entry['result'] not in ('EXITED', 'TIMEOUT', 'SPAWN_ERROR') or
                    (entry['exitCode'] is not None and type(entry['exitCode']) is not int) or
                    type(entry['output']) is not str or len(entry['output']) > MAX_OUTPUT):
                raise ValueError('Ausführungsbeleg: Ergebnis ungültig')
            ended.add(entry['runId'])
        entry['hash'] = claimed
        events.append(entry)
        previous = claimed
        if sequence > LIMIT:
            raise ValueError('Ausführungsbeleg: Ereignislimit erreicht')
    return events


def append_run(root, store, entry):
    events = read_runs(root, store)
    if len(events) >= LIMIT:
        raise ValueError('Ausführungsbeleg: 128 Ereignisse erreicht')
    entry.update(seq=len(events) + 1, prev=events[-1]['hash'] if events else ZERO, at=now())
    entry['hash'] = sha(packed(entry))
    with path(root, store).open('ab') as stream:
        stream.write(packed(entry) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())


def capture(command, root):
    chunks = []
    total = [0]
    try:
        process = subprocess.Popen(command, cwd=root, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    except OSError as exc:
        return 'SPAWN_ERROR', None, str(exc)[:MAX_OUTPUT]

    def drain():
        while True:
            chunk = process.stdout.read(8192)
            if not chunk:
                break
            if total[0] < MAX_OUTPUT:
                chunks.append(chunk[:MAX_OUTPUT - total[0]])
                total[0] += len(chunks[-1])

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    result = 'EXITED'
    try:
        process.wait(timeout=MAX_SECONDS)
    except subprocess.TimeoutExpired:
        result = 'TIMEOUT'
        process.kill()
        process.wait()
    reader.join(timeout=2)
    if not reader.is_alive():
        process.stdout.close()
    output = b''.join(chunks).decode('utf-8', 'replace')
    if total[0] >= MAX_OUTPUT:
        output += '\n[Ausgabe auf 4096 Bytes begrenzt]'
    return result, process.returncode if result == 'EXITED' else None, output[:MAX_OUTPUT]


def run_command(root, node, command, read, store):
    nodes = {e['name'] for e in read(root) if e['kind'] in ('seed', 'branch')}
    if node not in nodes or not command or len(command) > 64 or any(not x for x in command):
        raise ValueError('Knoten oder Befehl fehlt: ./garden run NAME -- PROGRAMM ARGUMENTE')
    if any(len(x) > 1024 or '\x00' in x for x in command):
        raise ValueError('Befehlsargument zu lang oder ungültig')
    run_id = uuid.uuid4().hex
    append_run(root, store, {'kind': 'run-start', 'node': node, 'runId': run_id, 'argv': command})
    print(f'START: {node} · {run_id[:12]} · {command[0]}', flush=True)
    outcome, code, output = capture(command, root)
    append_run(root, store, {'kind': 'run-end', 'node': node, 'runId': run_id,
                             'result': outcome, 'exitCode': code, 'output': output})
    print(f'ENDE: {outcome} · Exit {code} · {run_id[:12]}')
    if output:
        print(output)
    return 0 if outcome == 'EXITED' and code == 0 else 1


def state(root, read, store):
    from garden_jobs import read_jobs
    events = read(root)
    runs = read_runs(root, store)
    jobs = read_jobs(root, store)
    nodes = {e['name'] for e in events if e['kind'] in ('seed', 'branch')}
    if any(e['node'] not in nodes for e in runs):
        raise ValueError('Ausführungsbeleg verweist auf fehlenden Knoten')
    return {'schema': 'console-zero.garden-live.v1', 'garden': events, 'runs': runs,
            'jobs': jobs, 'at': now(), 'gardenHead': events[-1]['hash'] if events else ZERO,
            'runHead': runs[-1]['hash'] if runs else ZERO,
            'jobHead': jobs[-1]['hash'] if jobs else ZERO}


def serve(root, read, store, open_browser=True):
    state(root, read, store)
    page = (Path(__file__).parent / 'garden_live.html').read_bytes()
    script = (Path(__file__).parent / 'garden_live.js').read_bytes()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
                self.send_error(403)
                return
            if self.path not in ('/', '/garden_live.js', '/field_physics.mjs', '/openspace_dna.mjs', '/btc_time_rail.mjs', '/state'):
                self.send_error(404)
                return
            try:
                content = (page if self.path == '/' else script if self.path == '/garden_live.js'
                           else (Path(__file__).parent / 'field_physics.mjs').read_bytes()
                           if self.path == '/field_physics.mjs' else
                           (Path(__file__).parent / 'openspace_dna.mjs').read_bytes()
                           if self.path == '/openspace_dna.mjs' else
                           (Path(__file__).parent / 'btc_time_rail.mjs').read_bytes()
                           if self.path == '/btc_time_rail.mjs' else packed(state(root, read, store)))
            except (ValueError, OSError, json.JSONDecodeError) as exc:
                content = packed({'error': str(exc)})
                self.send_response(409)
            else:
                self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8' if self.path == '/state'
                             else 'text/javascript; charset=utf-8' if self.path.endswith(('.js', '.mjs'))
                             else 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, format, *args):
            return

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'GARTEN LIVE: {url} · lokale Zeitspur · Strg+C stoppt', flush=True)
    if open_browser and os.environ.get('CONSOLE_ZERO_NO_BROWSER') != '1':
        webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:
        print('\nGARTEN LIVE beendet')
    finally:
        server.server_close()
