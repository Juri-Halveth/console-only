# KORRIDOT: COSMOS FIELD V1, Phase 0/1

## Ausgangspunkt

Basis ist Commit `91febcb2eb102b5c3ec89f90031a73156d9cf386`.
Der bisherige, uncommittete FLOW-Versuch wird archiviert, nicht weiter dekoriert.
Die Architektur stammt aus dem bereitgestellten Dossier
„KORRIDOT: Vom poetischen Raumgefühl zur überprüfbaren Echtzeit-Szene“,
insbesondere Seiten 3–4, 10–14. Diese Datei ist eine Umsetzungsspezifikation,
kein Nachweis einer fertigen Grafikengine.

## Leitbild und Konsequenzen

Der Betrachter soll nicht einen Schweif hinter einem Leuchtpunkt verfolgen.
Er soll eine Umgebung durchqueren, die bereits vor seiner Ankunft vorhanden ist
und nach seiner Abreise dieselbe räumliche Identität behält. Der Blick ist eine
Frage an den Raum, kein Befehl, die Welt neu zu würfeln. Daraus folgt:
`material = f(worldXYZ, visualSeed)`, ohne Kamera- oder Uhrzeit als Weltursprung.

Ein naher Nebelbereich muss bei einer seitlichen Fahrt stärker über das Blickfeld
ziehen als ein mittlerer und ein ferner Bereich. Alle drei benutzen denselben
Beobachter und dieselbe Projektion. Die erste numerische Referenz verwendet
12, 60 und 240 Modell-Einheiten Entfernung; diese Werte sind Testfälle, keine
astronomischen Maße und noch keine gerenderten Schichten.

Leere ist keine vergessene Textur. Sie ist ein Teil des Feldes. Große Dichteformen,
mittlere Faltungen und kleine Details sollen später gemeinsam sichtbar werden.
Daher liefert der Feldkern drei räumliche Frequenzen und eine dünn besetzte,
kontinuierliche Dichtefunktion. Die spätere visuelle Qualität folgt NICHT schon
aus dem Bestehen dieser mathematischen Tests.

Eine Chunk-Grenze ist eine Speicherentscheidung, keine Wand im Kosmos. Der Kern
berechnet Dichte aus globalen Koordinaten; er startet das Noise nicht an jeder
Chunk-Grenze neu. `supportWeight` liefert zusätzlich einen weichen Auslauf für
einen späteren Impostor. Chunk-Streaming und Impostor-Komposition sind noch
nicht implementiert.

## Jetzt implementiert

- `src/cosmos_field.mjs`: reines synthetisches Dichte-/Materialfeld, Chunk-Adresse,
  weiche Reichweitenmaske und KORRIDOT-kompatible Referenzprojektion.
- `tests/cosmos_field.test.mjs`: 21 numerische und strukturelle Gegenproben.
- Weltbereich ausdrücklich begrenzt auf ±1.000.000 Modell-Einheiten. Kein
  vorgetäuschter unendlicher Präzisionsraum.
- Keine Änderungen an Renderer, Bedienung, Server, Preview-Generator oder Belegen.
- Keine neuen Imports dieses Moduls im Browser. Daher noch kein neuer visueller
  Effekt und kein zusätzlicher Laufzeit-Renderingaufwand durch den Feldkern.

## Was ein grüner Test noch NICHT beweist

Ein Parallaxentest auf drei Referenzpunkten beweist die Projektionsbeziehung,
nicht das Raumgefühl eines gerenderten Nebels. Ein Dichtetest an Chunk-Grenzen
beweist numerische Kontinuität an den getesteten Positionen, nicht das Fehlen
aller denkbaren Pop-in-Artefakte. Ein 2π-Test ist kein 360°-Browser-Sichttest.

## Zeit- und Datengrenzen

`T_evidence`: gespeicherte Garden-/Quellereignisse; bleibt unverändert.
`τ_simulation`: veränderliche Modellzeit anderer Module; kein Seed-Eingang.
`t_camera`: Animation und Eingabe; verändert die Projektion, nicht das Feld.
BTC-Headerzeit bleibt gesondert. Das Feld importiert keine Garden-/BTC-Dateien.
Kein Netzwerk, keine Schreibrechte im Modul, kein `Date.now()`, kein `Math.random()`.

## Nächster Render-Schritt nach diesem Gate

1. Drei bis fünf weltverankerte, zwischengespeicherte Nebel-Impostor-Ebenen als
   ausdrücklich bezeichnete 2.5D-Referenz IN der vorhandenen KORRIDOT-Stage.
2. Keine neuen Strokes als Atmosphäre. Dünne Belegverbindungen bleiben semantische
   Beziehungen; die dekorativen Filamente werden standardmäßig ausgeblendet.
3. Gemeinsamer Seed und gemeinsame Kamera für lokalen Betrieb und synthetische
   öffentliche Demo. Fehlende Modulfreigaben und Preview-Kopierwege explizit testen.
4. Fixierte Kamerazustände: still, seitlich, zurück zum Ursprung, Orbit, ×8-WARP.
5. Erst bei überzeugender Tiefenstaffelung: niedrig aufgelöster WebGL2-Dichtepass
   hinter dem bestehenden Canvas2D. Noch keine temporale Reprojektion.
6. Tatsächliche Framezeiten messen. Die GPU-Budgets im Dossier sind Projektziele,
   keine zugesicherte Leistung auf Juris Windows-Rechner.
7. Screenshots und Bedienung abnehmen; dann Commit, Push, PR, Merge, Pages-Abruf.

## Abnahme-Matrix

| Eigenschaft | Dieses Paket | Spätere Browser-Abnahme |
|---|---|---|
| Gleiche XYZ + Seed → gleiches Material | numerisch geprüft | Bild-Roundtrip offen |
| Nah > Mittel > Fern | Referenzprojektion geprüft | echte Nebelparallaxe offen |
| Kontinuität an Zellgrenzen | numerische Stichproben | Streaming-Pop-in offen |
| 360°-Rückkehr | Projektion numerisch geprüft | Orbit-Bildvergleich offen |
| Keine Veränderung privater Belege | Installer vergleicht Dateien | erneut nach Renderer-Patch |
| Bildqualität zur Konzeptgrafik | keine Behauptung | menschliches A/B-Gate offen |
| CPU/GPU-Budget | kein Benchmarkversprechen | Zielrechner messen |

## Ergänzende Primärdokumentation

- Git stash: https://git-scm.com/docs/git-stash
- Git switch: https://git-scm.com/docs/git-switch
- Canvas-Puffer/Caching: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- Node-VM-Imports: https://nodejs.org/api/vm.html
