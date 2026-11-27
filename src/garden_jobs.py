"""KORRIDOT 0.9: explicit, bounded, single-writer long jobs.

The private job ledger is separate from garden/events.jsonl and runs.jsonl.
Neither stdout nor command arguments enter /state; stdout stays in .zero/.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

ZERO = '0' * 64
MAX_EVENTS = 1200
MAX_LEDGER_BYTES = 800_000
LOG_CAP_BYTES = 1_000_000
PROGRESS_INTERVAL = 15
MAX_TIMEOUT = 3600


def _bytes(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':')).encode('utf-8')


def _hash(blob):
    return hashlib.sha256(blob).hexdigest()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def _paths(root, store):
    base, _ = store(root)
    ledger, guard, logdir = base / 'jobs.jsonl', base / 'job-active.lock', base / 'job-logs'
    if any(p.is_symlink() for p in (ledger, guard, logdir)):
        raise ValueError('Auftragsverzeichnis enthält einen Symlink')
    return base, ledger, guard, logdir


def read_jobs(root, store):
    _, ledger, _, _ = _paths(root, store)
    if not ledger.exists():
        return []
    if ledger.stat().st_size > MAX_LEDGER_BYTES:
        raise ValueError('Auftragsbeleg zu groß')
    raw = ledger.read_bytes()
    if raw and not raw.endswith(b'\n'):
        raise ValueError('Auftragsbeleg abgeschnitten')
    rows, previous, running = [], ZERO, {}
    for seq, line in enumerate(raw.splitlines(), 1):
        if seq > MAX_EVENTS:
            raise ValueError('Zu viele Auftragsereignisse')
        try:
            e = json.loads(line)
        except (ValueError, UnicodeError) as ex:
            raise ValueError('Auftragsbeleg enthält ungültiges JSON') from ex
        if type(e) is not dict:
            raise ValueError('Ungültiges Auftragsereignis')
        kind = e.get('kind')
        common = {'seq', 'prev', 'kind', 'jobId', 'node', 'at', 'hash'}
        fields = ({'program', 'timeoutSeconds'} if kind == 'job-start'
                  else {'elapsedSeconds', 'outputBytes'} if kind == 'job-progress'
                  else {'elapsedSeconds', 'result', 'exitCode', 'logHash', 'truncated'}
                  if kind == 'job-end' else None)
        if fields is None or set(e) != common | fields:
            raise ValueError('Auftragsereignis: Schemafehler')
        claimed = e.pop('hash')
        if (e['seq'] != seq or type(e['seq']) is not int or e['prev'] != previous
            or not isinstance(claimed, str) or claimed != _hash(_bytes(e))
            or type(e['jobId']) is not str or not re.fullmatch(r'[0-9a-f]{32}', e['jobId'])
            or type(e['node']) is not str or not e['node']
            or type(e['at']) is not str or not e['at'].endswith('+00:00')):
            raise ValueError('Auftragsbeleg: Hashkette beschädigt')
        if kind == 'job-start':
            if (e['jobId'] in running or type(e['program']) is not str
                or not e['program'] or type(e['timeoutSeconds']) is not int
                or not 5 <= e['timeoutSeconds'] <= MAX_TIMEOUT):
                raise ValueError('Ungültiger Auftragsstart')
            running[e['jobId']] = {'node': e['node'], 'ended': False, 'elapsed': -1}
        else:
            prior = running.get(e['jobId'])
            if not prior or prior['ended'] or prior['node'] != e['node']:
                raise ValueError('Auftragsereignis ohne offenen Start')
            if (type(e['elapsedSeconds']) is not int or e['elapsedSeconds'] < 0
                or e['elapsedSeconds'] < prior['elapsed']):
                raise ValueError('Ungültige Auftragszeit')
            prior['elapsed'] = e['elapsedSeconds']
            if kind == 'job-progress':
                if type(e['outputBytes']) is not int or e['outputBytes'] < 0:
                    raise ValueError('Ungültige Bytezahl')
            else:
                if (e['result'] not in {'EXITED', 'TIMEOUT', 'CANCELLED', 'SPAWN_ERROR'}
                    or not (e['exitCode'] is None or type(e['exitCode']) is int)
                    or type(e['truncated']) is not bool
                    or type(e['logHash']) is not str or not re.fullmatch(r'[0-9a-f]{64}', e['logHash'])):
                    raise ValueError('Ungültiger Auftragsabschluss')
                prior['ended'] = True
        e['hash'] = claimed
        previous = claimed
        rows.append(e)
    return rows


def _append(root, store, event):
    rows = read_jobs(root, store)
    if len(rows) >= MAX_EVENTS:
        raise ValueError('Auftragsbeleg voll')
    entry = {**event, 'seq': len(rows) + 1,
             'prev': rows[-1]['hash'] if rows else ZERO, 'at': _now()}
    entry['hash'] = _hash(_bytes(entry))
    _, ledger, _, _ = _paths(root, store)
    with ledger.open('ab') as stream:
        stream.write(_bytes(entry) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    return entry


def _validate_command(node, command, read, root, timeout):
    if node not in {e['name'] for e in read(root) if e['kind'] in ('seed','branch')}:
        raise ValueError('Auftragsknoten fehlt')
    if type(timeout) is not int or not 5 <= timeout <= MAX_TIMEOUT:
        raise ValueError('Zeitlimit: 5 bis 3600 Sekunden')
    if (not command or len(command) > 64 or any(type(x) is not str or
        not x or len(x) > 1024 or '\x00' in x for x in command)):
        raise ValueError('Ungültiger Auftrag; keine Secrets als Argumente verwenden')


def start_job(root, node, command, timeout, read, store):
    """Blocking until completion, with inspectable live progress from another terminal."""
    from garden_process import OutputReader, start as start_process
    command = command[1:] if command[:1] == ['--'] else command
    _validate_command(node, command, read, root, timeout)
    base, _, guard, logdir = _paths(root, store)
    if len(read_jobs(root, store)) + (timeout // PROGRESS_INTERVAL) + 3 > MAX_EVENTS:
        raise ValueError('Zu wenig Platz im Auftragsbeleg')
    base.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    try:
        fd = os.open(guard, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as ex:
        raise ValueError('Bereits ein Langauftrag aktiv (oder verwaiste Sperre); nicht parallel starten') from ex
    with os.fdopen(fd, 'w', encoding='utf-8') as lockfile:
        json.dump({'jobId': job_id, 'pid': os.getpid()}, lockfile)
    process = None
    reader = None
    log = None
    marker = base / f'{job_id}.cancel'
    start = time.monotonic()
    captured = {'stored': 0, 'total': 0}
    truncated = False
    result, exit_code = 'SPAWN_ERROR', None
    try:
        if logdir.exists() and logdir.is_symlink():
            raise ValueError('Logordner ist ein Symlink')
        logdir.mkdir(exist_ok=True)
        log_path = logdir / f'{job_id}.log'
        log = log_path.open('xb')
        _append(root, store, {'kind':'job-start', 'jobId':job_id,
             'node':node, 'program':Path(command[0].replace('\\', '/')).name,
             'timeoutSeconds':timeout})
        print(f'AUFTRAG START · {node} · {job_id} · Limit {timeout}s', flush=True)
        try:
            process = start_process(command, root)
        except OSError as exc:
            log.write(f'SPAWN_ERROR: {type(exc).__name__}\n'.encode())
        if process is not None:
            def capture_chunk(chunk):
                captured['total'] += len(chunk)
                remaining = LOG_CAP_BYTES - captured['stored']
                if remaining > 0:
                    clipped = chunk[:remaining]
                    log.write(clipped)
                    captured['stored'] += len(clipped)

            reader = OutputReader(process.stdout, capture_chunk)
            reader.start()
            checkpoint = start + PROGRESS_INTERVAL
            while True:
                code = process.poll()
                if code is not None and not reader.is_alive():
                    result, exit_code = 'EXITED', code
                    break
                current = time.monotonic()
                if marker.is_file():
                    result = 'CANCELLED'
                    break
                if current - start >= timeout:
                    result = 'TIMEOUT'
                    break
                if current >= checkpoint:
                    elapsed = int(current - start)
                    _append(root, store, {'kind':'job-progress', 'jobId':job_id,
                        'node':node, 'elapsedSeconds':elapsed,
                        'outputBytes':captured['total']})
                    print(f'AUFTRAG LAEUFT · {job_id[:12]} · {elapsed}s', flush=True)
                    checkpoint = current + PROGRESS_INTERVAL
                time.sleep(.2)
            if result in ('TIMEOUT', 'CANCELLED'):
                process.stop()
            reader.finish()
            try:
                process.close()
            finally:
                process = None
        log.flush()
        os.fsync(log.fileno())
        log.close()
        log = None
        truncated = captured['total'] > LOG_CAP_BYTES
        log_hash = _hash(log_path.read_bytes())
        _append(root, store, {'kind':'job-end', 'jobId':job_id, 'node':node,
            'elapsedSeconds':int(time.monotonic()-start), 'result':result,
            'exitCode':exit_code, 'logHash':log_hash, 'truncated':truncated})
        print(f'AUFTRAG ENDE · {result} · Exit {exit_code} · {job_id[:12]}', flush=True)
        print(f'Lokales Protokoll: {log_path}', flush=True)
        print('Hinweis: Beleg und Log bleiben lokal; keine Veröffentlichung.', flush=True)
        return 0 if result == 'EXITED' and exit_code == 0 else 1
    except KeyboardInterrupt:
        print('Unterbrochen. Offener Startbeleg bleibt erhalten.', flush=True)
        return 130
    finally:
        if process is not None:
            try:
                process.stop()
                if reader is not None and reader.ident is not None:
                    reader.join(timeout=4)
                else:
                    process.stdout.close()
            finally:
                process.close()
        if log is not None:
            log.close()
        if guard.is_file():
            try:
                # Only release the exact lock we created.
                if json.loads(guard.read_text(encoding='utf-8')).get('jobId') == job_id:
                    guard.unlink()
            except (OSError, ValueError):
                pass
        if marker.exists() and not marker.is_symlink():
            marker.unlink()


def cancel_job(root, job_id, store):
    if not re.fullmatch(r'[0-9a-f]{32}', job_id):
        raise ValueError('Auftrags-ID benötigt 32 Hex-Zeichen')
    base, _, guard, _ = _paths(root, store)
    rows = [e for e in read_jobs(root, store) if e['jobId'] == job_id]
    if not rows or rows[-1]['kind'] == 'job-end':
        raise ValueError('Kein offener Auftrag mit dieser ID')
    if not guard.exists() or guard.is_symlink():
        raise ValueError('Kein aktiver Worker bestätigt; nicht automatisch beenden')
    if json.loads(guard.read_text(encoding='utf-8')).get('jobId') != job_id:
        raise ValueError('Auftrag ist nicht aktueller Worker')
    marker = base / f'{job_id}.cancel'
    if marker.is_symlink():
        raise ValueError('Abbruchmarker ist ein Symlink')
    with marker.open('x', encoding='utf-8') as stream:
        stream.write(job_id)
    print(f'ABBRUCH ANGEFORDERT · {job_id}')


def status_jobs(root, store):
    rows = read_jobs(root, store)
    starts = [e for e in rows if e['kind'] == 'job-start']
    print(f'AUFTRAEGE · {len(starts)} Starts · {len(rows)} belegte Ereignisse')
    for start in starts[-12:]:
        events = [e for e in rows if e['jobId'] == start['jobId']]
        last = events[-1]
        status = (last['result'] if last['kind'] == 'job-end' else 'OFFEN')
        print(f'  {start["jobId"]} · {start["node"]} · {status}')
