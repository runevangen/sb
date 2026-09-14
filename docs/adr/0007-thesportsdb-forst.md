# 0007 — TheSportsDB først, API-Football som reserve

## Kontekst
API-Footballs gratisnivå dekker bare sesongene i `SESONGVINDU`
(2022–2024) og svarer «season, try from 2022 to 2024» på alt utenfor. En
tabell fra i fjor som ser ut som årets er verre enn ingen tabell.

## Beslutning
En sesong utenfor vinduet hentes først fra TheSportsDB. Svikter den —
nettverk, uventet form, ingenting — får leseren API-Footballs svar som
før. Svaret sier hvor det kom fra (`kilde`), og stempelet under viser det.

## Konsekvens
- Gratisnøkkelen hos TheSportsDB **kapper** svarene (fem tabellrader, én
  kamp). `TSDB_MINST` er det minste som regnes som helt; under det brukes
  API-Football. Et avkortet svar vises aldri som årets.
- Med en Patreon-nøkkel prøves v2 (`/api/v2/json/`, nøkkelen i
  `X-API-KEY`) og deretter v1 (nøkkelen i adressen). Patreon gir begge
  varianter, og vi vet ikke hvilken nøkkelen er.
- Svaret bærer `forsok`: hva som ble prøvd, statuskode, tjenestens egen
  melding, antall og utfall — **uten nøkkel og uten adresser**, så det
  kan leses rett fra nettleseren når noe ikke stemmer.
- Parserne tar den **første lista de finner** i svaret, så et annet
  feltnavn ikke velter noe.
- TheSportsDB skriver sesongen «2026» for kalenderligaer og «2026-2027»
  for dem som krysser nyttår (`tsdbSesong`).
- **Kilden byttes uten at leseren gjør noe.** Det er premisset bak
  [0008](0008-kampnokkel.md).
- Funksjonene leser miljøet ved utrulling, og kant-cachen holder i inntil
  tre timer: etter at en nøkkel er satt må det deployes på nytt. En
  deploy tømmer også cachen.
