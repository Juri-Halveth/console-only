"""Build the offline public preview from the local garden UI.

The preview uses illustrative events only. It never reads .zero/ or inbox/.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs'
OUT.mkdir(exist_ok=True)

page = (ROOT / 'src/garden_live.html').read_text(encoding='utf-8')
page = page.replace('<title>Console Zero · Raumzeit</title>',
                    '<title>Console Only · interaktive Vorschau</title>')
page = page.replace('Console Zero / Experiment 02', 'Console Only / öffentliche Vorschau')
page = page.replace('Jeder Punkt hat einen Beleg. Zweige zeigen Herkunft; die Zeitspur zeigt, wann Gartenbefehle und ausdrücklich gestartete Programme erfasst wurden.',
                    'Erkunde ein Beispiel: Keim, Äste und eine aufgezeichnete Ausführung. Diese Vorschau enthält erfundene Ereignisse; deine lokalen Belege erscheinen ausschließlich in ./garden live.')
page = page.replace('VERBINDE LOKAL …', 'BEISPIEL · OFFLINE')
page = page.replace('Offene Wachstumsspur', 'Beispielspur')
page = page.replace('● Live folgen', '● Letztem Punkt folgen')
page = page.replace('MODELLANSICHT / T', 'BEISPIEL / T')
page = page.replace('LOKAL · BELEGSTATUS OFFEN', 'DEMO · SYNTHETISCHE DATEN · KEINE LOKALEN DATEIEN')
page = page.replace('<script src="/garden_live.js"></script>', '<script src="./preview.js"></script>')
page = page.replace("connect-src 'self'", "connect-src 'none'")
page = page.replace('<div class="legend">',
                    '<p class="lead">Diese Seite startet keine Befehle und verbindet sich mit keinem Dienst. Für deine eigenen Daten: <code>./garden live</code> im geklonten Projekt starten.</p>\n<div class="legend">')
(OUT / 'index.html').write_text(page, encoding='utf-8', newline='\n')

def event(seq, kind, name, parent=None, text=None):
    row = {'seq': seq, 'kind': kind, 'name': name,
           'at': f'2026-11-13T17:{seq:02d}:00+00:00', 'hash': f'beispiel-g{seq}'}
    if parent is not None:
        row['parent'] = parent
    if text is not None:
        row['text'] = text
    return row

garden = [event(1, 'seed', 'Konsole'),
          event(2, 'branch', 'Welten', 'Konsole'),
          event(3, 'branch', 'Quellen', 'Konsole'),
          event(4, 'note', 'Welten', text='Ein Raum für ausdrücklich gestartete Experimente.'),
          event(5, 'branch', 'Erster Versuch', 'Welten'),
          event(6, 'note', 'Quellen', text='Quellen werden erst nach lokaler Aufnahme sichtbar.')]
runs = [
    {'seq': 1, 'kind': 'run-start', 'node': 'Welten', 'at': '2026-11-13T17:07:00+00:00',
     'hash': 'beispiel-r1', 'runId': 'beispiel-lauf',
     'argv': ['python', '-B', '-c', 'print("Hallo aus einem Lauf")']},
    {'seq': 2, 'kind': 'run-end', 'node': 'Welten', 'at': '2026-11-13T17:08:00+00:00',
     'hash': 'beispiel-r2', 'runId': 'beispiel-lauf',
     'result': 'EXITED', 'exitCode': 0, 'output': 'Hallo aus einem Lauf\n'}]
data = {'garden': garden, 'runs': runs, 'gardenHead': 'beispiel-g6',
        'runHead': 'beispiel-r2'}
script = (ROOT / 'src/garden_live.js').read_text(encoding='utf-8')
script = script.replace("line(detail, 'SHA-256 ' + e.hash, 'code');",
                        "line(detail, 'DEMO-ID ' + e.hash + ' · kein SHA-256-Beleg', 'code');")
script = script.replace('Live folgen', 'Letztem Punkt folgen')
script = script.replace("+' · lokal'", "+' · Demo'")
script = script.replace('Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.',
                        'Dies sind erfundene Beispielereignisse. Lokale Belege erscheinen hier nicht.')
start = script.index('  async function poll() {')
script = script[:start] + (
    '  const data = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    "  snapshot = data; ordered = entryList(data);\n"
    "  slider.max = String(ordered.length); slider.value = String(ordered.length);\n"
    "  refreshTimeline(); redraw(); showDetail();\n"
    "  document.getElementById('heads').textContent = 'DEMO · ' + data.garden.length +\n"
    "    ' BEISPIELEREIGNISSE · ' + data.runs.length + ' BEISPIEL-LAUFPUNKTE · OFFLINE';\n"
    '})();\n')
if "fetch(" in script or 'setInterval(' in script:
    raise ValueError('Preview darf keine Netzabfrage oder Polling enthalten')
(OUT / 'preview.js').write_text(script, encoding='utf-8', newline='\n')
print('docs/index.html und docs/preview.js aus lokalen Vorlagen erzeugt')
