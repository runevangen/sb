# 0022 — Et antatt sted vises, og sier at det er antatt

## Kontekst
Lista var 26 steder 20. september 2026, og **alle 26 lå i Oslo**. Trondheim
hadde ett, ført inn i portalen. Bergen, Stavanger, Tromsø og Bodø hadde
null.

Uka før gikk med på å gjøre kortet ærlig om geografi: en bekreftet visning
392 km unna hører ikke hjemme blant stedene du kan dra til, og en pub uten
koordinat kan ikke plasseres. Alt sammen virker. Konsekvensen er at kortet
nå er ærlig **tomt** utenfor Oslo — en leser i Bergen får «Fant ingen
puber» og har ingen grunn til å komme tilbake.

`sikkerhet` har tre nivåer fra før: `bekreftet`, `sannsynlig`, `usikker`.
Men `usikker` ble **filtrert bort** før lista nådde leseren, i `kjenteAv()`
og i portalens pubvelger. Følgen: for leseren var det ingen forskjell
mellom «vi har sett etter og er i tvil» og «stedet finnes ikke».

Det er den forskjellen som avgjør om en liste kan bygges opp.

## Beslutning
**`usikker` skjules ikke lenger. Den merkes.**

`merkAntatte()` i `pub-data.js` setter `antatt: true` på raden, og kortet
viser den med sitt eget merke og med **ord**: «Antatt — ikke bekreftet».
Ikke ⚽, som betyr «kjent for å vise fotball» og er en påstand vi ikke har
dekning for.

Grensa går ved `usikker`, ikke ved `sannsynlig`. Det siste betyr at noen
har sett etter og trodd det; det første at vi har gjettet.

## Konsekvens

### Hvorfor dette ikke bryter «si sant»
Fordi raden sier hva den er. **En antakelse som sier at den er en
antakelse, er sann.** Det usanne ville vært å gi den samme ⚽ som et sted
noen har stått i døra på — da hadde vi flyttet tilliten fra de nitten
bekreftede over på gjetninger, og leseren hadde ingen måte å se det på.

Regelen er den samme som for annonsekortene: hvert kort sier hva det er.
Og den samme som for «Bernie's (Oslo)»: når vi ikke vet avstanden, sier vi
byen framfor å tie.

### Hva som blir dårligere
Lista blir mindre presis. En leser som drar til et antatt sted kan møte en
skjerm som er av. Det er en ekte kostnad, og den er tatt med åpne øyne:
alternativet er en tom liste, og en tom liste hjelper ingen.

Derfor hører **rettelsessløyfa** med. Uten en vei for «de viser ikke
fotball her» er dette bare gjetning med bedre typografi. Denne
beslutningen er halvparten, og den andre halvparten er det som gjør den
forsvarlig — den står i [ADR 0023](0023-tipset-som-tar-et-sted-ut.md).

### Hva den ikke endrer
Fila er fortsatt grunnfjellet ([ADR 0020](0020-stedene-i-portalen.md)), og
et forslag fra en leser blir fortsatt aldri en rad av seg selv
([ADR 0019](0019-pubforslag.md)). Et antatt sted føres inn av et menneske,
som alle andre — det mennesket er bare ærlig om at det gjetter.

### Hva et antatt sted ikke kan gjøre
**Det kan ikke sende en liga.** Ligaflagget ([#121](https://github.com/runevangen/sb/pull/121))
og de antatte stedene møttes i flettinga 21. september 2026, og de to
grenene satte hver sin gren inn på samme sted i merkekjeden.

`ligapuberAv()` slipper ikke et `usikker`-sted gjennom. Ikke fordi merket
ville sett rart ut, men fordi `ligapuber` står rett etter `bekreftede` i
`FORSLAG_KILDER`: en gjetning ville blitt **løftet** over alt geografisk,
og stått der det sterkeste svaret skulle vært. Samme form som den
bekreftede visningen 392 km unna. Å sette «?» foran 📺 i merkekjeden
skjuler bare tegnet.

Portalens **pubvelger** filtrerer fortsatt bort `usikker`: å krysse av at
et sted viser en bestemt kamp, er en påstand admin gjør, og den kan ikke
hvile på en antakelse. Vises kampen der, er stedet ikke antatt lenger.
