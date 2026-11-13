# Console Only · Console Zero

**Ein lokaler Baukasten, der mit einer Konsole anfängt.** Du setzt einen Keim,
verzweigst ihn mit Befehlen und siehst seine Ereignisse in einer navigierbaren
Zeitansicht. Quellen und Modellgespräche sind eigene, ausdrücklich gestartete
Wege. Das Projekt ist ein Prototyp, kein autonomes KI-System.

![Status: lokaler Prototyp](https://img.shields.io/badge/status-lokaler%20Prototyp-87d4a9)

## In drei Minuten ausprobieren

Voraussetzung: Python 3 mit `python` im Pfad und Bash (unter Windows z. B.
Git Bash). Es werden keine Pakete installiert. Klone das Repository in einen
neuen Ordner und führe dort aus:

```bash
./zero init
./garden init
./garden seed 'Konsole'
./garden branch 'Konsole' 'Welten'
./garden branch 'Konsole' 'Quellen'
./garden live
```

`./garden live` startet einen lesenden Server auf `127.0.0.1` und druckt
eine URL. Falls der Browser nicht automatisch öffnet, kopiere diese URL in
die Adresszeile. Lass das Terminal laufen. In einem zweiten Terminal:

```bash
cd /pfad/zu/console-only
./garden branch 'Welten' 'Erster Versuch'
./garden describe 'Welten' 'Ein eigener Raum entsteht.'
./garden run 'Welten' -- python -B -c 'print("Hallo aus einem echten Lauf")'
```

Der Browser liest alle zwei Sekunden den lokalen Beleg neu. Klicke auf
Knoten und Ereignispunkte, ziehe den Raum, zoome und bewege den Zeitregler.
`./garden live` endet mit Strg+C. `./garden verify` prüft die gespeicherten
Gartenereignisse; `./garden status` zeigt den Baum. Eine statische Ansicht
ohne laufenden Server gibt es mit `./garden open`.

## Was wirklich geschieht

| Einstieg | Gegenwärtige Wirkung |
| --- | --- |
| `./zero` | Speichert ausdrücklich hinzugefügte UTF-8-Dateien als lokale Quellen mit SHA-256-Belegen; `find` sucht darin. `ask` fragt optional ein schon installiertes Ollama-Modell. |
| `./live` | Lokale Textsitzung mit Ollama, ID, UTC-Zeit und gespeichertem Gespräch. Normale Sätze gehen an das Modell. Nur `! BEFEHL` startet ausdrücklich Bash mit Benutzerrechten. |
| `./garden` | Ein Keim, Äste, Beschreibungen und ein optionaler Link ins öffentliche HALVETH NETZ. `run` startet ein ausdrücklich benanntes Programm und hält Start, Ausgang, Exit-Code und begrenzte Ausgabe fest. |
| `./garden live` | Lokale Raum- und Zeitansicht der **aufgezeichneten** Gartenereignisse und `garden run`-Läufe. Ein Zeitregler spielt die gespeicherte Reihenfolge ab. |

Die Darstellung von Zweig, Tiefe und Zeit ist eine Bedienoberfläche, keine
physikalische 4D-Simulation. Nur Befehle, die durch Console Zero laufen,
erscheinen als solche in seinem Log. Andere Shells, fremde Prozesse, GitHub
und externe Websites werden nicht automatisch beobachtet. Das Portal zu
[HALVETH NETZ](https://juri-halveth.github.io/universum/) öffnet erst nach
einem ausdrücklichen Klick; es importiert dessen Code nicht.

`ask` und die Antworten in `./live` sind ungeprüfte Modellvorschläge.
Gespeicherte Quellen sind keine Garantie, dass eine Modellantwort richtig
ist. Weder `./zero` noch `./garden` laden Modelle selbst herunter.

## Lokale Daten und Grenzen

`.zero/` und `inbox/` bleiben außerhalb von Git. Dort liegen Quellen,
Sitzungstexte, Befehlsargumente und begrenzte Programmausgaben **im
Klartext**. Gib in `garden run` und `./live` keine Geheimnisse ein, die
im lokalen Beleg erscheinen sollen. `! BEFEHL` in `./live` ist keine
Sandbox. `garden run` verwendet keine implizite Shell, aber das von dir
gewählte Programm hat deine normalen Benutzerrechte. Der lokale
Browserdienst ist lesend und nur an Loopback gebunden. Eine Hash-Kette
erkennt gewöhnliche Beschädigungen; sie widersteht keinem Prozess mit
denselben Schreibrechten. Parallele Schreiber sind nicht unterstützt.

Der Garten umfasst höchstens 48 Knoten und 256 Ereignisse; der separate
Ausführungsbeleg höchstens 128 Start-/Ende-Ereignisse. Ein nach START
abgebrochener Prozess bleibt als offener Versuch sichtbar und wird nicht
automatisch wiederholt. Mehr Einzelheiten: [GARDEN.md](GARDEN.md).

## Prüfen

```bash
python -B -m unittest discover -s tests -v
node --check src/garden_live.js  # falls Node vorhanden ist
```

Am 13. November 2026 bestanden 33 lokale Python-Tests. Ein Konsolenlauf
und ein Browsermitschnitt auf Windows zeigten den neuen Ast und die
Laufpunkte. Das ist eine begrenzte Prototypabnahme, kein Produktionstest
und keine GitHub-CI-Aussage.

## Nächste Wachstumsstufen

1. Öffentliche Quellrevisionen **lesend und mit Commitbindung** als eigene
   Ereignisart erfassen. Modellzeit und Commitzeit bleiben getrennt.
2. Wiederholbare Aufträge aus mehreren lokalen Werkzeugen zusammenstellen;
   jeder Schritt hält Eingabe, Wirkung, Ergebnis und offene Fehler fest.
3. Visuelle Räume aus vorhandenen, lizenzgeprüften HALVETH-Bausteinen
   ausdrücklich übernehmen und ihre Herkunft pro Raum anzeigen.
4. Erst danach Beiträge anderer Personen als getrennte, nachvollziehbare
   Zweige mit klaren Zuständigkeiten ermöglichen.

Die Idee von „Beschwörung“ meint hier eine präzise, nachvollziehbare
Aufgabe an lokale Werkzeuge: **Wunsch → gewählter Befehl → beobachtete
Wirkung → Beleg → menschliche Prüfung**. Weniger Handarbeit ist das Ziel;
mehr Fähigkeiten werden erst behauptet, wenn sie tatsächlich angeschlossen
und geprüft sind.

## Lizenz

Der Code dieses Repositories steht unter [MIT](LICENSE). Externe Projekte,
auf die Dokumentation oder Portale verweisen, behalten ihre eigenen Rechte.
