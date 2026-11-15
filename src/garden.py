#!/usr/bin/env python3
"""Console Zero Garden: one local seed, explicit branches, verified visual state."""
import argparse
from datetime import datetime, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import random
import sys
import webbrowser

ZERO = '0' * 64
MAX_NODES = 48
MAX_EVENTS = 256
UNIVERSUM = 'https://juri-halveth.github.io/universum/'


def data(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def store(root):
    base = root / '.zero'
    folder = base / 'garden'
    ledger = folder / 'events.jsonl'
    if any(p.is_symlink() for p in (base, folder, ledger)):
        raise ValueError('Verknüpfung im Gartenpfad abgewiesen')
    return folder, ledger


def name(value):
    if (not isinstance(value, str) or value != value.strip() or
            not 1 <= len(value) <= 60 or
            any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError('Name: 1–60 Zeichen, ohne Steuerzeichen oder Rand-Leerraum')
    return value


def read(root):
    _, ledger = store(root)
    if not ledger.is_file():
        raise ValueError('Garten fehlt: ./garden init')
    blob = ledger.read_bytes()
    if len(blob) > 500_000 or blob and not blob.endswith(b'\n'):
        raise ValueError('Gartenbeleg zu groß oder abgeschnitten')
    events = []
    nodes = {}
    previous = ZERO
    for seq, line in enumerate(blob.splitlines(), 1):
        item = json.loads(line)
        if (type(item) is not dict or set(item) !=
                ({'seq', 'prev', 'kind', 'name', 'parent', 'at', 'hash', 'text'}
                 if item.get('kind') == 'note' else
                 {'seq', 'prev', 'kind', 'name', 'parent', 'at', 'hash', 'url'}
                 if item.get('kind') == 'portal' else
                 {'seq', 'prev', 'kind', 'name', 'parent', 'at', 'hash'})):
            raise ValueError(f'Belegschema beschädigt: {seq}')
        supplied = item.pop('hash')
        if (type(item['seq']) is not int or item['seq'] != seq or
                item['prev'] != previous or supplied != digest(data(item))):
            raise ValueError(f'Belegkette beschädigt: {seq}')
        if type(item['at']) is not str or not item['at'].endswith('+00:00'):
            raise ValueError(f'Zeitbeleg ungültig: {seq}')
        n = name(item['name'])
        if seq > MAX_EVENTS:
            raise ValueError('Ereignislimit erreicht')
        if item['kind'] == 'note':
            if (n not in nodes or item['parent'] is not None or
                    type(item['text']) is not str or not 1 <= len(item['text']) <= 1200 or
                    any(ord(c) < 32 and c not in '\n\t' for c in item['text'])):
                raise ValueError(f'Notiz ungültig: {seq}')
        elif item['kind'] == 'portal':
            if n not in nodes or item['parent'] is not None or item['url'] != UNIVERSUM:
                raise ValueError(f'Portal ungültig: {seq}')
        elif n in nodes or len(nodes) >= MAX_NODES:
            raise ValueError(f'Knoten ungültig: {seq}')
        elif seq == 1:
            if item['kind'] != 'seed' or item['parent'] is not None:
                raise ValueError('Erster Knoten muss ein Keim sein')
        elif item['kind'] != 'branch' or type(item['parent']) is not str or item['parent'] not in nodes:
            raise ValueError(f'Ast ohne vorhandenen Elternknoten: {seq}')
        item['hash'] = supplied
        if item['kind'] not in ('note', 'portal'):
            nodes[n] = item['parent']
        events.append(item)
        previous = supplied
    return events


def init(root):
    folder, ledger = store(root)
    folder.mkdir(parents=True, exist_ok=True)
    if ledger.exists():
        read(root)
        print('GARTEN: vorhandener Beleg geprüft; nichts überschrieben')
        return
    with os.fdopen(os.open(ledger, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb'):
        pass
    print('GARTEN: leer · bereit für ./garden seed NAME')


def append(root, kind, label, parent=None, text=None):
    events = read(root)
    label = name(label)
    nodes = [e for e in events if e['kind'] in ('seed', 'branch')]
    if len(events) >= MAX_EVENTS:
        raise ValueError('Ereignislimit erreicht')
    if kind in ('seed', 'branch') and label in {e['name'] for e in nodes}:
        raise ValueError('Name bereits vorhanden')
    if kind in ('seed', 'branch') and len(nodes) >= MAX_NODES:
        raise ValueError('Gartenlimit erreicht (48 Knoten)')
    if kind == 'seed':
        if events:
            raise ValueError('Dieser Garten hat bereits einen Keim')
    elif kind == 'branch':
        if parent not in {e['name'] for e in nodes}:
            raise ValueError('Elternknoten fehlt')
    elif kind == 'note':
        if label not in {e['name'] for e in nodes} or parent is not None:
            raise ValueError('Knoten für Notiz fehlt')
        if (type(text) is not str or not 1 <= len(text) <= 1200 or
                any(ord(c) < 32 and c not in '\n\t' for c in text)):
            raise ValueError('Notiz muss 1–1200 Zeichen enthalten')
    elif kind == 'portal':
        if label not in {e['name'] for e in nodes} or parent is not None:
            raise ValueError('Knoten für Portal fehlt')
        if any(e['kind'] == 'portal' and e['name'] == label for e in events):
            print(f'PORTAL: {label} · bereits gebunden; kein neuer Beleg')
            return
    else:
        raise ValueError('Unbekanntes Ereignis')
    item = {'seq': len(events) + 1, 'prev': events[-1]['hash'] if events else ZERO,
            'kind': kind, 'name': label, 'parent': parent,
            'at': datetime.now(timezone.utc).isoformat(timespec='microseconds')}
    if kind == 'note':
        item['text'] = text
    elif kind == 'portal':
        item['url'] = UNIVERSUM
    item['hash'] = digest(data(item))
    _, ledger = store(root)
    with ledger.open('ab') as stream:
        stream.write(data(item) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    print(f'{kind.upper()}: {label} · Schritt {item["seq"]} · {item["hash"][:12]}')


def status(root):
    events = read(root)
    nodes = [e for e in events if e['kind'] in ('seed', 'branch')]
    print(f'GARTEN · {len(nodes)} Knoten · {max(len(nodes)-1,0)} Äste · '
          f'{sum(e["kind"] == "note" for e in events)} Notizen · '
          f'{sum(e["kind"] == "portal" for e in events)} Portale · '
          f'Beleg {events[-1]["hash"][:16] if events else ZERO[:16]} · lokal')
    for event in nodes:
        print(f'  {event["seq"]:02d}  {event["name"]}' +
              (f' ← {event["parent"]}' if event['parent'] else ' · Keim'))


def render(root):
    events = read(root)
    if not events:
        raise ValueError('Erst einen Keim setzen: ./garden seed NAME')
    nodes_only = [e for e in events if e['kind'] in ('seed', 'branch')]
    notes = {e['name']: e for e in events if e['kind'] == 'note'}
    portals = {e['name']: e for e in events if e['kind'] == 'portal'}
    children = {e['name']: [] for e in nodes_only}
    for event in nodes_only[1:]:
        children[event['parent']].append(event['name'])
    depth = {nodes_only[0]['name']: 0}
    for event in nodes_only[1:]:
        depth[event['name']] = depth[event['parent']] + 1
    leaves = [n for n in children if not children[n]]
    x = {n: 110 + i * 1380 / max(1, len(leaves) - 1) if len(leaves) > 1 else 800
         for i, n in enumerate(leaves)}
    for event in reversed(nodes_only):
        n = event['name']
        if children[n]:
            x[n] = sum(x[c] for c in children[n]) / len(children[n])
    max_depth = max(depth.values())
    y = {n: 710 - d * min(135, 550 / max(1, max_depth)) for n, d in depth.items()}
    rng = random.Random(int(events[-1]['hash'][:16], 16))
    stars = ''.join(f'<circle cx="{rng.randrange(30,1570)}" cy="{rng.randrange(30,820)}" '
                    f'r="{rng.choice((1,1,2))}" fill="#9ed7e3" opacity=".32"/>'
                    for _ in range(85))
    lines = []
    for event in nodes_only[1:]:
        n, p = event['name'], event['parent']
        mid = (y[n] + y[p]) / 2
        lines.append(f'<path class="branch" d="M {x[p]:.1f} {y[p]:.1f} '
                     f'C {x[p]:.1f} {mid:.1f}, {x[n]:.1f} {mid:.1f}, '
                     f'{x[n]:.1f} {y[n]:.1f}" style="animation-delay:{event["seq"]*.18:.2f}s"/>')
    nodes = []
    for event in nodes_only:
        n = event['name']
        label = html.escape(n, quote=True)
        nodes.append(f'<a class="node-link" href="#node-{event["seq"]}" aria-label="{label} öffnen">'
                     f'<title>{label} · Wachstumsschritt {event["seq"]}</title>'
                     f'<g class="node" style="animation-delay:{event["seq"]*.18:.2f}s">'
                     f'<circle cx="{x[n]:.1f}" cy="{y[n]:.1f}" r="29" class="halo"/>'
                     f'<circle cx="{x[n]:.1f}" cy="{y[n]:.1f}" r="7" fill="#b7f59c"/>'
                     f'<text x="{x[n]:.1f}" y="{y[n]+52:.1f}" text-anchor="middle">{label}</text></g></a>')
    rows = ''.join(f'<li><a href="#node-{e["seq"]}"><span>{e["seq"]:02d}</span>{html.escape(e["name"])}'
                   + (f'<small> ← {html.escape(e["parent"])}</small>' if e['parent'] else '<small> · Keim</small>')
                   + '</a></li>' for e in nodes_only)
    sequence = {e['name']: e['seq'] for e in nodes_only}
    details = []
    zoom = []
    for event in nodes_only:
        n = event['name']
        seq = event['seq']
        parent = event['parent']
        parent_link = (f'<a href="#node-{sequence[parent]}">{html.escape(parent)}</a>'
                       if parent else 'Ursprung')
        child_links = ', '.join(f'<a href="#node-{sequence[c]}">{html.escape(c)}</a>'
                                for c in children[n]) or 'Noch keine'
        note_preview = (html.escape(notes[n]['text'][:160]) if n in notes else
                        'Noch keine Beschreibung für diesen Raum.')
        details.append(f'<section id="node-{seq}" class="node-detail" tabindex="-1">'
                       f'<div class="eyebrow">Schritt {seq:02d} · Ebene {depth[n]}</div>'
                       f'<h3>{html.escape(n)}</h3><p>Entsteht aus: {parent_link}</p>'
                       f'<p>Wächst weiter zu: {child_links}</p>'
                       f'<p class="evidence">UTC {html.escape(event["at"])}<br>'
                       f'SHA-256 {event["hash"]}</p>'
                       f'<p>{note_preview}</p><a class="back" href="doors/door-{seq}.html">Tür öffnen →</a> '
                       '<a href="#garten" class="back">Zur Gesamtansicht</a></section>')
        scale = min(1.55 + depth[n] * .26, 2.8)
        zoom.append(f'body:has(#node-{seq}:target) svg{{transform:scale({scale:.2f});'
                    f'transform-origin:{x[n]/16:.2f}% {y[n]/8.5:.2f}%}}')
    markup = f'''<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Console Zero · Garten</title>
<style>
:root{{color-scheme:dark;font-family:system-ui,sans-serif;background:#071617;color:#e3f3df}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;background:radial-gradient(circle at 52% 56%,#143f3e,#071617 64%)}}
header{{padding:28px 4vw 12px;display:flex;justify-content:space-between;gap:20px;align-items:end}}
h1{{font-size:clamp(30px,5vw,64px);letter-spacing:-.055em;margin:0}}.eyebrow{{color:#a4e69b;letter-spacing:.3em;text-transform:uppercase;font-size:12px}}
.meta{{color:#94adab;font:13px ui-monospace,monospace;text-align:right;line-height:1.7}}
main{{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;padding:0 4vw 40px}}
.stage{{position:relative;min-width:0;overflow:hidden;border:1px solid #446b60;border-radius:24px;background:#091d1dcc;box-shadow:0 28px 90px #0007}}
svg{{width:100%;height:auto;display:block;transition:transform .85s cubic-bezier(.2,.8,.25,1)}}.branch{{fill:none;stroke:#a1e49b;stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 7px #64ecab);stroke-dasharray:2300;stroke-dashoffset:2300;animation:grow 2s ease forwards}}
.stars,.branch{{pointer-events:none}}.stage-reset{{display:none;position:absolute;z-index:2;top:16px;right:16px;padding:11px 16px;border:1px solid #b7f59c;border-radius:24px;background:#102d2be8;color:#e3f3df;font-weight:700;text-decoration:none;box-shadow:0 0 20px #345b47}}
.stage-reset:hover,.stage-reset:focus-visible{{background:#24574a;outline:3px solid #e3f3df}}
body:has(.node-detail:target) .stage-reset{{display:inline-flex}}
.node{{opacity:0;animation:appear .65s ease forwards}}.halo{{fill:#173c37;stroke:#b7f59c;stroke-width:2;filter:drop-shadow(0 0 16px #6cf1b0)}}
.node-link{{cursor:pointer}}.node-link:hover .halo,.node-link:focus-visible .halo{{stroke:#fff;stroke-width:4}}.node-link:focus-visible{{outline:3px solid #fff}}
text{{fill:#e8f7dd;font-size:19px;font-weight:600;paint-order:stroke;stroke:#092321;stroke-width:5px}}
aside{{border:1px solid #446b60;border-radius:24px;padding:22px;background:#0c2323;align-self:start}}
h2{{font-size:14px;text-transform:uppercase;letter-spacing:.2em;color:#a4e69b;margin:0 0 18px}}
ol{{padding:0;list-style:none;max-height:36vh;overflow:auto}}li{{padding:10px 0;border-bottom:1px solid #345249;font-size:14px;overflow-wrap:anywhere}}
li span{{font:12px ui-monospace,monospace;color:#a4e69b;margin-right:10px}}small{{color:#89a7a1}}
aside a{{color:#e3f3df;text-decoration:none}}aside a:hover,aside a:focus-visible{{color:#b7f59c;text-decoration:underline}}
.node-detail{{display:none;border-top:1px solid #446b60;padding-top:20px;overflow-wrap:anywhere}}
.node-detail:target{{display:block;animation:appear .35s ease forwards}}.node-detail h3{{font-size:27px;margin:12px 0}}
.node-detail p{{font-size:14px;line-height:1.6}}.node-detail .evidence{{font:11px/1.7 ui-monospace,monospace;color:#8baaa3}}
.back{{display:inline-block;border:1px solid #729b80;border-radius:20px;padding:8px 12px;margin-top:8px}}
body:has(.node-detail:target) .intro{{display:none}}
{''.join(zoom)}
footer{{padding:0 4vw 24px;color:#8baaa3;font:12px ui-monospace,monospace}}
@keyframes grow{{to{{stroke-dashoffset:0}}}}@keyframes appear{{to{{opacity:1}}}}
@media(prefers-reduced-motion:reduce){{.branch{{animation:none;stroke-dashoffset:0}}.node{{animation:none;opacity:1}}svg{{transition:none}}}}
@media(max-width:900px){{main{{grid-template-columns:1fr}}.meta{{display:none}}}}
</style>
<header><div><div class="eyebrow">Console Zero · Experiment 01</div><h1>Aus einem Keim.</h1></div>
<div class="meta">{len(nodes_only)} KNOTEN · {len(nodes_only)-1} ÄSTE<br>BELEG {events[-1]['hash'][:16]}</div></header>
<main><section class="stage" id="garten" aria-label="Gewachsenes Konzeptnetz"><a class="stage-reset" href="#garten">↖ Gesamtansicht</a><svg viewBox="0 0 1600 850" aria-label="Ein Keim mit {len(nodes_only)-1} Ästen">
<defs><radialGradient id="ground"><stop stop-color="#2c6654"/><stop offset="1" stop-color="#071617"/></radialGradient></defs>
<a href="#garten" aria-label="Freie Fläche: Gesamtansicht wiederherstellen"><rect width="1600" height="850" fill="url(#ground)" opacity=".25"/></a><g class="stars">{stars}
<ellipse cx="800" cy="780" rx="700" ry="25" fill="#70c99b" opacity=".13"/></g>
{''.join(lines)}{''.join(nodes)}</svg></section>
<aside><h2>Wachstumsspur</h2><p class="intro">Klicke einen Keim oder Ast an und folge seiner Spur.</p><ol>{rows}</ol>{''.join(details)}</aside></main>
<footer>LOKAL · AUS BEFEHLEN REKONSTRUIERT · SIMULATION · KEIN NETZWERK</footer></html>'''
    folder, _ = store(root)
    doors = folder / 'doors'
    if doors.is_symlink():
        raise ValueError('Türordner ist eine Verknüpfung')
    doors.mkdir(exist_ok=True)
    for event in nodes_only:
        seq = event['seq']
        n = event['name']
        title = html.escape(n)
        accent, glow = (('#b7f59c', '#255246'), ('#9cdaff', '#20445c'),
                        ('#dfbbff', '#4b315d'), ('#ffd599', '#60402c'))[seq % 4]
        parent = event['parent']
        parent_door = (f'<a href="door-{sequence[parent]}.html">← {html.escape(parent)}</a>'
                       if parent else '')
        text = (html.escape(notes[n]['text']).replace('\n', '<br>') if n in notes else
                'Noch keine Beschreibung. In Bash: ./garden describe NAME TEXT')
        descendants = ''.join(f'<a href="door-{sequence[c]}.html">{html.escape(c)}</a>'
                              for c in children[n]) or '<span>Noch keine Äste</span>'
        external = (f'<p><a href="{UNIVERSUM}" target="_blank" rel="noopener noreferrer">'
                    'HALVETH NETZ · öffentliches Universum öffnen ↗</a></p>'
                    '<small>Externe Seite · erst nach deinem Klick · keine Datenübernahme</small>'
                    if n in portals else '')
        page = f'''<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>{title} · Console Zero</title><style>
:root{{color-scheme:dark;font-family:system-ui,sans-serif;background:#071617;color:#e3f3df}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle,{glow},#071617 68%)}}
main{{width:min(800px,90vw);padding:clamp(24px,5vw,64px);border:1px solid {accent};border-radius:32px;background:#102b29;box-shadow:0 0 120px {glow};animation:enter .6s ease-out}}
.eye{{border:2px solid {accent};box-shadow:0 0 40px {accent};border-radius:50%;width:90px;height:90px;display:grid;place-items:center;font-size:38px}}
h1{{font-size:clamp(36px,7vw,76px);margin:24px 0;overflow-wrap:anywhere}}.note{{font-size:clamp(18px,2.4vw,25px);line-height:1.6;white-space:normal;overflow-wrap:anywhere}}
.links{{display:flex;gap:10px;flex-wrap:wrap}}a{{color:#d8f5cb;border:1px solid #759f81;border-radius:24px;padding:10px 14px;text-decoration:none}}a:hover,a:focus-visible{{background:#2d6150;outline:2px solid #fff}}
small{{font:12px/1.7 ui-monospace,monospace;color:#9cbbb0;overflow-wrap:anywhere}}
@keyframes enter{{from{{opacity:0;transform:scale(.88)}}to{{opacity:1;transform:scale(1)}}}}
@media(prefers-reduced-motion:reduce){{main{{animation:none}}}}</style>
<main><div class="eye" aria-hidden="true">✦</div><small>CONSOLE ZERO · RAUM {seq:02d} · LOKAL</small>
<h1>{title}</h1><p class="note">{text}</p><h2>Weitere Äste</h2><div class="links">{descendants}</div>
{external}
<p class="links">{parent_door}<a href="../view.html#node-{seq}">↖ Zum Garten</a></p>
<small>UTC {html.escape(event['at'])}<br>KNOTEN {event['hash']}<br>GARTEN {events[-1]['hash']}</small></main></html>'''
        target_door = doors / f'door-{seq}.html'
        temporary_door = doors / f'door-{seq}.new'
        if target_door.is_symlink() or temporary_door.exists():
            raise ValueError('Türpfad blockiert')
        temporary_door.write_bytes(page.encode('utf-8'))
        os.replace(temporary_door, target_door)
    target = folder / 'view.html'
    if target.is_symlink():
        raise ValueError('Ausgabedatei ist eine Verknüpfung')
    temporary = folder / 'view.new'
    if temporary.exists():
        raise ValueError('Vorige temporäre Ausgabe vorhanden')
    temporary.write_bytes(markup.encode('utf-8'))
    os.replace(temporary, target)
    print(f'GERENDERT: {target} · {len(nodes_only)} Knoten · Beleg {events[-1]["hash"][:16]}')
    return target


def main(argv=None, root=None):
    parser = argparse.ArgumentParser(prog='./garden', description='Lokales Konsolenexperiment: Keim → Äste → sichtbare Welt')
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('init')
    p = sub.add_parser('seed'); p.add_argument('name')
    p = sub.add_parser('branch'); p.add_argument('parent'); p.add_argument('name')
    p = sub.add_parser('describe'); p.add_argument('node'); p.add_argument('text')
    p = sub.add_parser('portal'); p.add_argument('node'); p.add_argument('destination', choices=['universum'])
    p = sub.add_parser('run'); p.add_argument('node'); p.add_argument('command', nargs=argparse.REMAINDER)
    p = sub.add_parser('job'); p.add_argument('--timeout', type=int, default=900); p.add_argument('node'); p.add_argument('command', nargs=argparse.REMAINDER)
    p = sub.add_parser('cancel'); p.add_argument('job_id')
    sub.add_parser('jobs')
    sub.add_parser('live')
    sub.add_parser('status'); sub.add_parser('verify'); sub.add_parser('render'); sub.add_parser('open')
    args = parser.parse_args(argv)
    root = root or Path(__file__).resolve().parents[1]
    try:
        if args.action == 'init': init(root)
        elif args.action == 'seed': append(root, 'seed', args.name)
        elif args.action == 'branch': append(root, 'branch', args.name, args.parent)
        elif args.action == 'describe': append(root, 'note', args.node, text=args.text)
        elif args.action == 'portal': append(root, 'portal', args.node)
        elif args.action == 'run':
            from garden_live import run_command
            command = args.command[1:] if args.command[:1] == ['--'] else args.command
            return run_command(root, args.node, command, read, store)
        elif args.action == 'job':
            from garden_jobs import start_job
            return start_job(root, args.node, args.command, args.timeout, read, store)
        elif args.action == 'cancel':
            from garden_jobs import cancel_job
            cancel_job(root, args.job_id, store)
        elif args.action == 'jobs':
            from garden_jobs import status_jobs
            status_jobs(root, store)
        elif args.action == 'live':
            from garden_live import serve
            serve(root, read, store)
        elif args.action == 'status': status(root)
        elif args.action == 'verify':
            items = read(root)
            print(f'GEPRÜFT: {len(items)} Ereignisse · Beleg {items[-1]["hash"] if items else ZERO}')
        elif args.action == 'render': render(root)
        elif args.action == 'open':
            target = render(root)
            if not webbrowser.open(target.resolve().as_uri()):
                print('Browser nicht geöffnet; die ausgegebene HTML-Datei manuell öffnen')
    except (OSError, ValueError, UnicodeError, json.JSONDecodeError) as exc:
        print(f'GARTEN STOP: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
