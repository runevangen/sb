# 0008 — Kamp-id-en er kampens, ikke kildens

## Kontekst
`id` på en kamp var `fixture.id` fra API-Football **eller** `idEvent` fra
TheSportsDB — to helt ulike tallrekker skrevet inn i samme kolonne. Og
kilden byttes av seg selv ([0007](0007-thesportsdb-forst.md)): fallback,
kant-cache på tre timer, og en utrulling som tømmer den.

Når kilden byttet, ble hver eneste lagrede rad usynlig. Kampen fantes,
raden fantes, men id-en den ble skrevet under stemte ikke med id-en
runden viste.

## Beslutning
`kampNokkel()` i `fotball-data.js` er identiteten: dagen i UTC og de to
lagene — `2026-09-14-bodoglimt-sandefjord`.

## Konsekvens
- Lagnavnene var alt forent på tvers av kildene av `redaksjonsnavn()` og
  `normaliserLagnavn()` — de finnes nettopp fordi de to skriver
  «Bodo/Glimt» ulikt. Mekanismen lå der hele tiden; den var bare aldri
  brukt på identiteten.
- Ligaen står **ikke** i nøkkelen: to lag møter ikke hverandre to ganger
  på én dag, og et liganavn de to skriver ulikt ville bare flyttet
  problemet.
- `id` blir stående ved siden av, for feilsøking. Alt som lagres, slås
  opp eller deles går på `nokkel`.
- **Testen som manglet** kjører begge parserne på samme kamp og krever
  ulik `id` og lik `nokkel`. Uten den kunne ingenting fange dette.
- `gyldigKampId()` godtar både nøkler og gamle tall, så en delt lenke som
  alt er sendt åpner fortsatt kampen sin, og radene i `visninger.js` med
  et tall virker ut kampen sin.
- Tegnsettet er `[a-z0-9-]` med vilje: verdien går inn i en
  PostgREST-liste (`kamp_id=in.(...)`), der komma og parentes ville
  betydd noe annet enn tegn i et navn.
- **Advarsel:** `redaksjonsnavn()` dekker bare norske bokstaver. Skriver
  én kilde «Sandefjord Fotball» der den andre skriver «Sandefjord», blir
  nøklene ulike. Det er ikke observert i dag, men det er den neste
  varianten av samme feil.
