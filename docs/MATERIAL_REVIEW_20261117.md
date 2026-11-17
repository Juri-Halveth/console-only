# Review-Nachprüfung · 17.11.2026

Die gemeldeten Funktionskombinationen wurden am geprüften Commit lokal mit
synthetischen Dateien, Zuständen und einer Loopback-Browservorschau nachgestellt.
Die Vorher-Prüfung reproduzierte die folgenden Fälle; dieselben Hauptgegenproben
bestehen gegen die Korrektur. Rohmails und ihre Benachrichtigungslinks werden
nicht veröffentlicht.

| Fall | Korrektur |
| --- | --- |
| C-IMPORT-01 | Eine Importablehnung ist ein eigener Hinweis. Sie ersetzt keinen fatalen Modellfehler und sperrt keinen gültigen Versuch. |
| C-REC-01 | Neu starten und erfolgreicher Import gleichen den Recorder an den tatsächlichen Wiedergabezustand an. |
| C-PENDING-01 | Noch nicht angewendete Materialeingaben werden separat exportiert, geprüft und wiederhergestellt. Ältere Exporte ohne dieses Feld bekommen einen sichtbaren Kompatibilitätshinweis. |
| C-STARS-01 | Die CPU-Auswahl verwendet den stabilen Sternindex innerhalb einer Weltzelle. Die Prüfung umfasst X/Y/Z-Grenzen und beide Qualitätsstufen. |
| C-DEPTH-01 | Material und Planet werden anhand der Kamera-Tiefe gezeichnet. Vordergrund und Rückansicht sowie sichtbare Picking-Ziele sind getrennt geprüft. |

Browserprüfung mit bereits vorhandenem Playwright und Chromium/Chrome:

```bash
node tests/material-review-browser.cjs
```

HALVETH_PLAYWRIGHT kann eine vorhandene Playwright-Installation und
HALVETH_BROWSER einen vorhandenen Browser benennen. Die Prüfung liest keine
Garden-Datenbank und führt keine Netzwerkaktionen an Fremdsystemen aus.

Die ursprünglichen numerischen Materialquellen und die sechs Solverhashes
bleiben erhalten. Ein neuer Anzeigehinweis hebt eine tatsächliche Fehlersperre
nicht auf. Die Planetendarstellung bleibt das vorhandene illustrative Modell.
