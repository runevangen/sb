# 0015 — Hvem blir med: lesing, skriving og tegning

## Kontekst
Delingsteksten spurte «Hvor ser du?», og det spørsmålet hadde ingen vei
tilbake til appen.

## Beslutning
Lesing krever ingen konto; skriving krever at du er logget inn, og bare i
ditt eget navn. Se [ADR 0012](0012-kampkortet.md) for formen på kortet.

## Konsekvens

### Å spørre
- Kampene på skjermen hentes i **så få kall som mulig** (`/api/svar?kamper=…`).
  Ti kamper skal ikke bli ti kall.
- **Spør om alle kampene som står på skjermen**, og det er hele vinduet
  (se [ADR 0017](0017-kampene-framover.md)). En kamp man kan se skal ha
  lista si.
- **Buntingen er det eneste som holder taket.** `/api/svar` kapper
  spørringen ved `KAMPER_MAKS` (tjue) id-er, og kappingen er stille — id-ene
  etter den tjuende gir ingen feil, de gir ingen rader. `hentSvar()` kalte
  `nesteRunde()` først for å holde seg under, men det virket bare når
  kampene bar et rundetall (TheSportsDBs kommende kamper mangler ofte
  `intRound`), og var uansett en bivirkning av at halve vinduet ble kastet.
  `hentSvarFor()` deler derfor spørringen i bunter på `KAMPER_MAKS`: 25
  kamper blir to kall, ikke ett per kamp og ikke ett som kappes. Taket står
  i `svar-data.js`, delt mellom appen og funksjonen.
- **Og stubben må svare bare om det den ble spurt om.** Svarte
  vennetestens stubb likt uansett id-er, ga buntingen den samme raden én
  gang per bunt — «Kari og Kari» i lista, og en test som beviste noe annet
  enn den trodde.
- **Feiler `/api/svar`, sier vennefanen det.** I rundevisningen er
  tausheten riktig — lista er et tillegg til kampen. I vennefanen *er*
  lista hele visningen, og «Ingen har sagt at de blir med ennå» er da en
  påstand om noe vi ikke vet.

### Å skrive
- Skrivingen går med leserens **egen økt**, aldri en nøkkel som kan skrive
  hva som helst. [ADR 0010](0010-ingen-service-role.md)
- Upsert mot `unique (kamp_id, bruker)`: trykker du på et annet sted,
  flytter svaret seg; trykker du på det samme igjen, går du av lista.
- **En upsert som ikke endret noe kan svare med tom representasjon.**
  Lista bygges derfor aldri på upsertens svar alene — `friskeOppSvar()`
  henter kampen på nytt. Det er også det som gjør at venner som har svart
  siden runden ble hentet dukker opp med det samme.
- Svaret bærer **hele kampen**, så `leggInnSvar()` bytter ut kampens rader
  i sin helhet framfor å legge de nye oppå.

### Navnet
- **Navnet kommer fra innloggingen**, ikke fra et felt i kortet.
  `svarNavn()` faller tilbake på kontonavnet. Et felt man måtte fylle før
  trykket virket ville betydd at «ett trykk» ikke var sant.
- Det er «navnet vennene ser», synlig for alle som åpner kampen — prisen
  for at lista kan leses uten konto.
- **Navnet hører til kontoen, ikke til telefonen.** `svarnavnFor` holder
  bruker-id-en det ble skrevet av, og `loggUt()` tømmer begge. Uten det
  skrev neste som logget inn i samme nettleser raden sin med forrige
  persons navn.

### Å tegne
- **Kampene noen blir med på løftes øverst**, i to merkede bolker. Ikke
  som en flat omstokking: lista har dagskiller, og en søndagskamp løftet
  over fredagsskillet ville havnet under feil dag. Hver bolk får sine egne
  dagskiller; dagen ligger i `dataset.dag`.
- Løftingen skjer i `tegnSvar()`, ikke der runden tegnes — svarene kommer
  etterpå. Radene **flyttes**, de tegnes ikke på nytt, så et åpent panel
  og en hentet værlinje overlever.
- **`tegnSvar()` tegner også et åpent kort på nytt.** Kampen huskes på
  `rad.kamp` og `panel.kamp`, så en tegning utenfra vet hvilken kamp den
  gjelder.
- Linja under kampen sier **hvor du skal**, ikke bare hvem som blir med
  (`blirMedLinje()`); `mittSted()` lar stadion uten navn falle tilbake på
  arenaen.
- Meldinga sier hva du nettopp gjorde, ikke hvilken liste du havnet i.

### Vennefanen
`#/fotball/venner` (#71) slår sammen ligaenes kommende kamper og viser bare
kampene noen blir med på (`bareMedSvar()`). Løftingen i Kommende
gjelder én liga — står Ola på en Premier League-kamp og Kari på en
eliteseriekamp, ser du dem bare ved å bytte fane.

**`FANER` er ikke `DELER`.** `DELER` er datasettene funksjonen serverer,
og `fotball.mjs` validerer `del` mot lista — et fjerde navn der ville
blitt en rute funksjonen godtar og så feiler på i `apiSti`. `FANER` er
`DELER` pluss `venner`.

«Venner» er i dag **alle som er logget inn og har svart**, og det står med
ord under lista.

### Delingen
Teksten går inn i gruppechatten leseren allerede har, og krever ingen
konto — den går til vennene, ikke til oss. `delingstekst()` lager den i
norsk tid, og den er testet: det er det leseren faktisk sender.
Delingen går gjennom samme `delTekst()` i `app.js` som «Del appen», med
utklippstavle som reserve. Fjorårets
runde kan ikke deles; det står hvorfor.

`kamplenke()` peker på **kampen**, ikke runden. Mottakeren får kampen
løftet fram med en linje som sier hvor avsenderen ser den, og en
«Svar»-knapp som åpner panelet med det samme stedet valgt. Adressen
tolkes i `app.js` med `tolkKamplenke()` og sendes inn til `visFotball` —
modulen eier ikke ruting. Finner vi ikke kampen igjen, står runden som
før: en feilmelding om en kamp som er ferdigspilt hjelper ingen.

Stedet i lenka er skrevet av hvem som helst: `hvor` valideres mot `HVOR`,
og navnet kappes ved `STED_MAKS` som i feltet.

### Navnekollisjoner
`sistInneTekst()` heter ikke `tidstekst()` — det navnet er tatt i
`fotball-data.js` og står for avsparkstidspunktet. Og klassen på den
delte kampen heter `.kamp-invitert`, ikke `.kamp-delt`: vokteren som
sjekker trykkflata matcher selektorer på tekst, og `.kamp-del` er en bit
av `.kamp-delt`. Begge kostet en runde.
