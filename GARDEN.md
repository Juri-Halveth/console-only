# Console Zero Garden · Experiment 01

Ein Keim und seine Äste entstehen ausschließlich durch ausdrückliche Konsolenbefehle.
Jeder Schritt hat eine laufende Nummer, UTC-Zeit und einen verketteten SHA-256-Beleg.
`verify` rekonstruiert den Baum, `render` zeichnet daraus ein lokales HTML-Bild.
Der Renderer lädt keine externen Ressourcen, benutzt kein Modell und schreibt
nur `.zero/garden/`. Es ist eine Visualisierung von eingegebenen Beziehungen,
kein selbst lernendes System und keine reale Außenmessung.

Aus dem Projektordner in Git Bash:

```bash
./garden init
./garden seed 'Konsole'
./garden branch 'Konsole' 'Welten'
./garden branch 'Konsole' 'Quellen'
./garden branch 'Welten' 'Licht'
./garden verify
./garden render
./garden open
```

`./garden open` öffnet die neu gerenderte lokale Datei im Standardbrowser.
Wenn der Browseraufruf scheitert, bleibt `.zero/garden/view.html` erhalten.
Weitere `branch`-Befehle erweitern denselben Baum; danach erneut `open`
ausführen. `./garden status` zeigt die komplette Wachstumsspur.

Version 0.2: Ein Klick auf Knoten oder Listenzeile öffnet die lokale
Wachstumsspur des gewählten Schritts und zoomt optisch auf ihn. Eltern,
direkte Kinder, UTC-Zeit und Beleg sind sichtbar; „Zur Gesamtansicht“
führt zurück. Das funktioniert über lokale Fragmentlinks und CSS ohne
JavaScript oder Internet. Hinter einem Knoten liegt noch kein fremdes
Projekt oder eine frei ausführbare App. Diese Anschlüsse brauchen später
eigene, ausdrücklich gebundene Quellen und Befehle. Zoomen ist eine
begrenzte Ansicht der vorhandenen höchstens 48 Knoten, kein unendlicher
Speicher oder automatisches Wachstum.

Version 0.2.1: Nach dem Öffnen eines Knotens sind ein stets sichtbarer
„Gesamtansicht“-Knopf und die freie Fläche als Rückweg per Maus oder Touch
verfügbar. Beim Rückweg wird nur der optische Zoom zurückgesetzt;
Wachstumsereignisse bleiben erhalten.

Version 0.3: `./garden describe 'Welten' 'Hier entsteht unser erster Raum.'`
ergänzt eine belegte Beschreibung. Der Garten zeigt eine Vorschau und eine
„Tür öffnen“-Verbindung auf eine eigene lokale Seite mit vollständiger Notiz,
direkten Kindern, Elternraum, UTC-Zeit und Rückweg. Die Räume erhalten
unterschiedliche, aus dem Knotenschritt bestimmte Farbwelten. Spätere Beschreibungen bleiben als
Ereignisse erhalten; die jüngste wird gezeigt. Vorhandene v0.1/v0.2-Belege
werden beim Lesen unverändert übernommen. Der Raum zeigt nur ausdrücklich
eingegebenen Text; es wird kein fremder Code, Projekt oder Asset gestartet.
Höchstens 256 Ereignisse, Notizen bis 1200 Zeichen. Ein äußerer Prozess mit
gleichen Dateirechten kann weiterhin Belege und HTML ersetzen.

Version 0.3.1: `./garden portal 'Welten' universum` bindet den vorhandenen
öffentlichen HALVETH-NETZ-Flugraum als bewusst zu öffnenden Link an die Tür.
Der Link führt auf `https://juri-halveth.github.io/universum/` und wird nur
auf der Raumseite angezeigt. Rendern lädt weder die Seite noch ihren Code.
Ein Klick öffnet die externe Website in einem neuen Tab; sie bleibt ein
separates Projekt mit eigener Quellen- und Lizenzkarte. Der Garten übernimmt
keine Modelle, Daten oder Rechte aus diesem Projekt.

Version 0.4: `./garden live` startet eine lokale, lesende Ansicht auf
`127.0.0.1` und öffnet sie im Browser. Solange der Befehl in diesem
Terminal läuft, liest die Seite alle zwei Sekunden frisch geprüfte
Garten- und Ausführungsbelege. Der Zeitregler zeigt die aufgezeichnete
Reihenfolge, Knoten und Ereignispunkte sind anklickbar, Maus oder Touch
können den Raum verschieben; Mausrad und Schaltflächen zoomen. Die Achsen
stellen Zweig, Tiefe und aufgezeichnete Zeit dar. Sie sind keine
physikalische vierte Dimension und kein Blick auf unbeobachtete Prozesse.

In einem zweiten Git-Bash-Terminal kann ein **ausdrücklich gewählter**
lokaler Prozess mit Start, Ausgang, Exit-Code und begrenzter Ausgabe
protokolliert werden:

```bash
cd "$HOME/console-zero"
./garden run 'Welten' -- python -B -c 'print("Hallo aus dem echten Lauf")'
```

`run` startet das angegebene Programm ohne Shell-Interpretation, im
Console-Zero-Ordner und mit geschlossenem Standard-Eingang. Für Bash-Code
ist ausdrücklich `-- bash -lc '...'` möglich. Der Kurzlauf hat 30 Sekunden
Zeitbudget einschließlich der Ausgabe. Der Beleg übernimmt die ersten
4096 Ausgabe-Bytes. Bei Zeitablauf beendet Garden die eigene POSIX-Prozessgruppe
beziehungsweise das Windows-Jobobjekt samt zugehörigen Kindern. Beim Langauftrag
`job` gilt das auch für den ausdrücklichen Abbruch. Ein außerhalb dieser Gruppe
arbeitender Dienst hat einen eigenen Lebenszyklus. Ein reguläres `EXITED` meldet
den Exit-Code des gewählten Programms nach dem Schließen der Ausgabepipe.

Garden reserviert vor dem Start Platz für den Abschlussbeleg. Ein offener
START nach einem Absturz lässt die Wirkung ungeklärt. Auch bis zu einem
TIMEOUT können bereits Dateien geschrieben worden sein. Prüfe den Zustand der
Zieldateien vor einem erneuten Lauf. Eine nicht gestartete oder mit Fehler
beendete Ausführung erhält ihren eigenen Status. Befehlsargumente und
Ausgabe stehen lokal im Beleg und können Geheimnisse enthalten; daher
keine Passwörter oder Schlüssel in diesen Aufruf einfügen. Die Seite
publiziert nichts und liest keine beliebigen fremden Prozesse, Shells,
Repos oder GitHub-Aktionen. Andere Arbeit muss ausdrücklich durch
`./garden run` gestartet werden, um als gemessener Lauf aufzutauchen.
Der lokale Server stoppt mit Strg+C. Sein Browser-Tab zeigt danach den
letzten Stand und meldet den unterbrochenen Kontakt. Die Datei
`.zero/garden/runs.jsonl` ist eine eigene Hash-Kette mit höchstens
128 Start-/Ende-Ereignissen, weiterhin kein Schutz vor jemandem mit
denselben lokalen Schreibrechten.

Grenzen: höchstens 48 Knoten, ein Keim, genau ein Elternknoten pro Ast.
Keine gleichzeitigen Schreiber; eine Stromunterbrechung mitten im Schreiben
kann eine unvollständige letzte Zeile hinterlassen, die `verify` dann ablehnt.
Die Hash-Kette erkennt gewöhnliche Beschädigung, schützt aber nicht gegen
einen Prozess mit denselben Schreibrechten. Browserdarstellung ist optional:
die Ereignisse bleiben auch ohne Browser vollständig prüfbar.
