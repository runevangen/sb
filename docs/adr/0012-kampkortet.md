# 0012 — Kampkortet er en liste over steder

## Kontekst
Før var det tre steg — velg hjemme/pub/stadion, skriv pubnavnet, trykk
«Jeg skal dit» — og et navnefelt i tillegg, på hver eneste kamp. Tre steg
for å si én ting.

## Beslutning
Kortet er en liste over steder man kan dra, og ett trykk på et sted er
svaret. Hvert sted er en **rad** (`stedRad()`): navnet, folka som skal
dit, og én knapp som sier hva den gjør.

## Konsekvens
- Overskriften er alltid «Hvor skal du se den?». **Den spør, den påstår
  ingenting** — «Disse viser kampen» over hele lista ville sagt at
  arenaen og en pub ingen har meldt inn viser den. Stjerna bærer
  forskjellen, rad for rad.
- **Knappen sier hva trykket gjør**: «Jeg skal hit» blir «Meld deg av».
  Farge alene holdt ikke. Utlogget sier den «Valgt for deling» — det er
  ingenting å melde seg av fra.
- **Folka står i raden**, ikke i en egen liste nederst: stedet og hvem som
  er der er én ting. Du står først og heter «Du». Er det flere enn
  `NAVN_I_RAD` (fem), vises én færre enn taket og resten telles.
- Nederst står bare de som blir med **uten å si hvor**.
- Raden er **ingen knapp**: den har en inni seg, og en knapp i en knapp
  finnes ikke. Samme regel som `.kamp-del` i kamplinja, løst motsatt vei.
  «Et annet sted» ser ut som en rad, men er ingen `.sted-rad-kort` — den
  har verken stedsnavn eller folk.
- **«Hjemme» er borte.** Kortet handler om hvor man møter noen, og sofaen
  er ikke et møtested. Rader som alt står i basen med `hvor='hjemme'`
  faller til `null` i `tolkSvar`: personen står fortsatt på lista, bare
  uten et sted — og det er riktig, hen sa aldri at hen skulle noe sted.
- **Stedet fra en delt lenke blir pekt ut, ikke valgt.** Å melde noen på
  uten at de trykket ville vært å svare i deres navn.
- **«Hvilken pub?» får ett svar, ikke seks.** Én rangert liste på høyst
  `FORSLAG_MAKS`; `rangerForslag()` er rekkefølgen, og rekkefølgen *er*
  svaret. Resten ligger bak «Flere forslag»; ingenting forsvinner.
