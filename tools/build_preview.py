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
# HALVETH_PUBLIC_READY_V1: public demo only; never mutate the local live HTML.
PUBLIC_URL = 'https://juri-halveth.github.io/console-only/'
PUBLIC_TITLE = 'KORRIDOT | Begehbare Software-Ereignisse · HALVETH'
PUBLIC_DESC = ('KORRIDOT macht aufgezeichnete Software-Versuche räumlich erkundbar. '
               'Steuere durch eine interaktive 3D-Demo mit synthetischen Daten, Zeitspur und Quellcode.')
page = page.replace('<title>Console Only · interaktive Vorschau</title>',
                    '<title>' + PUBLIC_TITLE + '</title>', 1)
head_meta = f'''<meta name="description" content="{PUBLIC_DESC}">
<link rel="canonical" href="{PUBLIC_URL}">
<meta property="og:type" content="website">
<meta property="og:title" content="{PUBLIC_TITLE}">
<meta property="og:description" content="{PUBLIC_DESC}">
<meta property="og:url" content="{PUBLIC_URL}">
<meta property="og:image" content="{PUBLIC_URL}og-korridot.png">
<meta property="og:image:alt" content="KORRIDOT Offline-Demonstration mit 3D-Sternenraum, Ereignisknoten und Zeitspur">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{PUBLIC_TITLE}">
<meta name="twitter:description" content="{PUBLIC_DESC}">
<meta name="twitter:image" content="{PUBLIC_URL}og-korridot.png">'''
page = page.replace('</head>', head_meta + '\n</head>', 1)
public_css = '''
.public-ready{border:1px solid #346879;border-radius:19px;padding:clamp(14px,1.8vw,22px);margin:0 0 14px;background:#092234}
.public-ready h2{color:#e8fff7;font:700 clamp(19px,2.1vw,28px) system-ui,sans-serif;letter-spacing:normal;margin:5px 0 10px;text-transform:none}
.public-ready p,.public-ready li{color:#bfdce5;font:15px/1.6 system-ui,sans-serif;max-width:850px}
.public-ready .public-cta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.public-ready .public-cta a{display:inline-flex;align-items:center;padding:9px 13px;min-height:44px;border:1px solid #549c9f;border-radius:11px;text-decoration:none;font-weight:600;background:#0f3445}
.public-ready .public-cta a.primary{background:#97f5d9;color:#08242a;border-color:#97f5d9}
.public-ready .public-cta a:focus-visible{outline:3px solid #fff;outline-offset:2px}
.public-ready details{margin-top:8px;border-top:1px solid #315363;padding-top:8px}
.public-ready summary{cursor:pointer;color:#a8f5df;font-weight:700;min-height:44px;display:flex;align-items:center}
.public-ready ol{padding-left:24px}
.public-ready .public-proof{font:12px/1.5 ui-monospace,monospace;color:#9fbfc9}
@media(max-width:650px){.public-ready .public-cta a{flex:1 1 160px;justify-content:center}.public-ready{padding:15px}}
'''
page = page.replace('</style>', public_css + '\n</style>', 1)
intro = '''<section class="public-ready" aria-labelledby="what-is-korridot">
<p class="micro">HALVETH / KORRIDOT · INTERAKTIVE OFFLINE-DEMO</p>
<h2 id="what-is-korridot">Software-Versuche räumlich erleben.</h2>
<p>Fliege durch einen 3D-Zeitkorridor mit anklickbaren Ereignissen, Zeitpunkten und Ergebnissen. Diese Vorschau verwendet ausschließlich erfundene Beispieldaten.</p>
<nav class="public-cta" aria-label="KORRIDOT Einstiege">
<a class="primary" href="#korridot-demo">Demo erkunden</a>
<a href="#so-funktioniert-es">So funktioniert es</a>
<a href="https://github.com/Juri-Halveth/console-only">Quellcode &amp; Tests</a>
<a href="https://juri-halveth.github.io/arbeiten/#contact">Projekt anfragen</a>
</nav>
<details id="so-funktioniert-es"><summary>20-Sekunden-Start: Wie fliege ich?</summary>
<ol><li>Rechte Maustaste halten und mit dem Mauszeiger steuern; auf Touch-Geräten gedrückt ziehen.</li>
<li><strong>W</strong> vorwärts, <strong>S</strong> zurück, <strong>Shift+S</strong> schneller zurück, <strong>X</strong> bremsen.</li>
<li>Ein Ereignis anklicken oder rechts in der Zeitspur auswählen: Herkunft, Zeit und Ergebnis lesen.</li></ol>
</details>
<p class="public-proof">DEMO, KEIN LIVE-ZUGRIFF · Dein eigener Garten startet lokal mit <code>./garden live</code> · X/Y/Z sind Modellkoordinaten, T ist Ereigniszeit.</p>
</section>
'''
page = page.replace('<div class="grid">', intro + '<div id="korridot-demo" class="grid">', 1)

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
