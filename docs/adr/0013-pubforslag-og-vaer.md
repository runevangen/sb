# 0013 — Pubforslag og vær rundt kampen

## Kontekst
«Hvilken pub?» trenger et svar som gjelder *denne* kampen, på en telefon,
uten at leseren venter.

## Beslutning
Én rangert liste på høyst `FORSLAG_MAKS` (seks) chips. `rangerForslag()`
i `pub-data.js` er rekkefølgen, og **rekkefølgen er svaret**: det som
gjelder denne kampen først, så dine egne, så kjente fotballpuber nær deg,
så ved arenaen, så resten fra kartet.

## Konsekvens

### Kildene, og hvorfor hver finnes
- **Nær deg** hentes med en gang: kampen spilles ofte et annet sted enn
  der man ser den. Trykket som valgte «på pub» er handlingen telefonen
  krever for å spørre om posisjon. Posisjonen rundes til tre desimaler
  (≈100 m) og går **rett fra nettleseren** til Overpass, aldri innom oss
  — og det står under knappen.
- **Dine puber**: de du har delt før, lagret lokalt (`sb-visning`, feltet
  `puber`), oftest brukt først.
- **Ved stadion / ved holdeplassen**: `netlify/functions/puber.mjs` spør
  Entur om holdeplasser innen 700 m og Overpass om puber innen 1200 m.
  Arenaene står fast, så hver er én cache-nøkkel med et døgns levetid —
  Overpass ber om fair use, og dette er det.
- **`puber-oslo.js`** bærer den redaksjonelle vurderingen: OpenStreetMap
  vet at et sted er en pub, men ikke om de viser fotball. Lista ligger i
  koden, så «kjent for å vise fotball» står der også når både Overpass og
  vår egen funksjon er nede.

### Kappløpet
Netlify avbryter en funksjon etter ti sekunder, så alt kappløper innenfor
**én frist** (`restTid`): Entur og Overpass samtidig, og alle tjenerne i
`OVERPASS_SPEIL` samtidig. Den første som svarer vinner, resten avbrytes
— da settler de med en gang, så `forsok` blir komplett uten å vente på de
trege.

Overpass-kall **må** bære `Accept: application/json`; uten den svarer
hovedtjeneren 406 med en HTML-feilside.

### Å si fra
- Kildene lander til ulik tid, så hver legger seg i `boks.kilder` og ber
  om en ny tegning. **Ett sted bestemmer hva som står på skjermen.**
- `boks.feil` er en **liste**, ikke én streng: sviktet både arenaen og
  «nær deg», skal begge navngis.
- `meldTomt()` gir **ett** svar på «fant dere noe?» for hele panelet, ikke
  ett per kilde. Venter en kilde fortsatt, sies ingenting.
- `hvemSviktet()` setter den siste linja i `forsok` inn i feilmeldingen
  («overpass-api.de svarte 406»), så det kan meldes videre uten å grave i
  funksjonsloggen.

### Verifisering
- **Ingenting fra `puber-kontakt.js` vises før det er verifisert.**
  `kontaktFor()` gir bare ut felt med en `verifisert`-dato, satt av en
  person som har sett opplysningen selv. Et feil telefonnummer til en
  ekte bedrift er verre enn ingen. Hvert felt bærer kilde, ordrett sitat
  og `tillit` — hvor mange uavhengige kilder som sa det samme.
- De to filene råtner i ulikt tempo: at et sted viser fotball er en
  vurdering som står seg, et telefonnummer gjør det ikke.
- `sjekkPubliste()` og `sjekkKontaktliste()` vokter formen, og `unit.mjs`
  kjører dem mot de **ekte** filene: en feilskrevet rad slår ut i testene
  framfor i appen. Hver rad må ha en kilde som er en lenke og en
  `sjekket`-dato — en udatert rad er verre enn ingen rad.
- Rader merket `usikker` vises ikke.
- Lisensen (ODbL) krever «© OpenStreetMap-bidragsytere» der pubene vises.

### Været
MET Norway (Locationforecast 2.0) via `netlify/functions/vaer.mjs`: MET
krever en User-Agent som sier hvem som spør, og den kan ikke settes fra
nettleseren. Ingen nøkkel, men lisensen krever kreditering.

Koordinatene ligger i `ARENAER` i `vaer-data.js`, skrevet for hånd med
tre desimaler (MET vil ikke ha flere) og slått opp på arenanavnet slik
API-ene skriver det. Ukjent arena gir **ingen vær**, ikke feil sted.

Været hentes først når kampen **åpnes**, ikke når runden tegnes: før ble
ti kamper til ti kall før leseren hadde trykket på noe, og raden vokste
mens den ble lest. `hentVaer` husker per kamp.
