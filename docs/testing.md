# Testing

    node test/unit.mjs      531 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  272 tester, ~250 ms, ingen nettleser
    node test/run.mjs       453 tester, ~200 s, headless Chromium

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`. De
raske først, så en åpenbar feil stopper kjøringen før nettleseren i det
hele tatt starter.

**Suitene setter sitt eget miljø, og det er ikke pedanteri.** Flere
funksjonstester dekker veien *når en nøkkel mangler*, og de stolte på at
`process.env` var tom framfor å tømme den. Det holdt lokalt og i CI, der
ingen av nøklene finnes — men Netlifys byggemiljø har dem alle satt, og da
feilet tre tester fordi `THESPORTSDB_KEY` sto der. `funksjon.mjs` sletter
derfor variablene den bryr seg om **før første test**; de som trenger en
satt, setter den selv. Samme tanke som tidssonesjekken: en test som er
avhengig av maskinen den kjører på, sier ingenting om koden.

**De to raske er porten foran prod.** `netlify.toml` kjører
`node test/unit.mjs && node test/funksjon.mjs` som byggekommando, så en rød
test publiserer ingenting (#77). De er sjekket å være maskinuavhengige —
begge passerer under UTC, `America/Los_Angeles`, `Pacific/Kiritimati` og
`Australia/Sydney` — og de bruker ingenting som krever nyere enn Node 18.
Det er de to egenskapene som gjør dem trygge som en port: en test som er
avhengig av maskinen den kjører på, ville stoppet deployer av grunner som
ikke har noe med koden å gjøre.

`run.mjs` står utenfor porten. Byggeloggen blir dessuten full av
stakksporene fra feilstitestene også når alt går bra — det er `console.error`
i funksjonene, ikke en feil.

**De ~200 sekundene er en treg maskin, ikke et fast tall.** På
GitHub-runneren tar hele jobben rundt 35 sekunder. Et grønt CI-resultat på
under et minutt er altså normalt — det betyr *ikke* at nettlesertestene
ble hoppet over. Sjekk antallet i loggen framfor å lese klokka; det er
tallet som sier at de kjørte.

## De tre reglene

**Tallene telles av testene selv.** De sto en stund som konstanter, og da
gled de fra virkeligheten. Og tallet er sjekken på at en ny test faktisk
kjørte: la du til seks tester og tallet står stille, kjørte de ikke.
Grønt på en test som aldri kjørte er verre enn rødt.

**Sjekk at testen kan feile.** Ødelegg linja den skal beskytte og se at
den slår ut. To tester har passert av feil grunn her — se
[hendelser](hendelser.md).

**Stubben skal modellere svaret, ikke koden som lager det.** En stubb
skrevet ut fra samme tankefeil som koden bekrefter feilen framfor å
avsløre den. Det skjulte en feil som gjorde «blir med»-lista usynlig for
alle, i tre dager og gjennom 412 tester. `somTjenesten()` i testrammen
finnes derfor: den gjør omformingen tjenesten gjør, mens `__lagret` står
igjen som basen.

## Hva hver suite dekker

**`unit.mjs`** — `lib.js`, `fotball-data.js`, `vaer-data.js`,
`pub-data.js`, `konto-data.js`, `pin-data.js`, `svar-data.js`,
`visning-data.js`, `kanaler.js`. URL-validering, videovertslisten, tidsstempler,
endringssignaturen, interne lenker, rangering av søketreff og
favorittlag, sesongvinduet per liga, tolkning av API-svarene, hvilken
runde som er «neste», at døgnkvoten holder per sport, at begge parserne
gir samme `nokkel` men ulik `id`, at `tolkSvar` tåler å kjøres to ganger,
at en økt vi ikke kjenner levetiden på regnes som utløpt, at ditt eget
svar finnes på id og ikke på navn, at «Ola» og «ola» blir samme konto
mens «Bjorn» og «Bjørn» ikke blir det, og at ingenting i
`puber-kontakt.js` eller `kanaler.js` slipper ut før noen har datert det.

**`funksjon.mjs`** — kaller Netlify-funksjonene direkte med et stubbet
`fetch`. Statuskoder, cache-headere, at API-nøkkelen, Supabase-nøkkelen
og PIN-pepperet går til tjenesten og ikke til leseren, at en ny konto
lages i samme kall som innloggingen, at et fornavn som er tatt sier det
både før og etter at PIN-en tastes, at et feil adminpassord aldri når
Supabase i det hele tatt, at en ny PIN settes med pepperet på, at
TheSportsDB prøves først og faller tilbake når den svikter, og at
værfunksjonen identifiserer seg for MET. Ingen nøkkel og ingen nettverk
kreves. Én test lar en tjener tie for å se at kappløpet ikke venter på
den.

**`run.mjs`** — alt som trenger DOM. XSS i titler og artikkel-HTML,
annonseplassering og merking, rulleoppførsel, artikkelvisningen,
fokusfella, korthøyden, toppfeltet som krymper, paginering, ruting,
visningsvalgene, favorittlag fra stjerne til feed, deling av en kamp med
sted og pubforslag, den delte lenka hos mottakeren, adminportalen fra
innlogging til lagring, innlogging i to steg, «jeg blir med» fra trykk
til angring, og hele fotballmodulen.

## Feller i testrammen

- **Testsidene serveres over HTTP**, ikke fra `file://` — modul-script
  blokkeres av CORS på file-opphav, og appen ville aldri lastet.
  Tegnsettet står i HTTP-headeren, ikke bare i `<meta charset>`: det
  injiserte skriptet skyver meta-taggen forbi de første 1024 bytene.
- **`--virtual-time-budget` driver ikke CSS-transisjoner fram.** Bruk
  `--force-prefers-reduced-motion` for skjermbilder av animerte paneler.
- **Virtuell tid står stille så lenge et nettkall venter.** Et ekte
  posisjonsoppslag hang hele kjøringen på CI. Rammen stubber derfor
  `getCurrentPosition` til å avslå, og tester som trenger en posisjon
  overstyrer den selv. Samme felle gjelder bilder som må hentes — derfor
  godtar `godtattMerke()` `data:image/`.
- **En bildelasting er ingen god prøve på om noe ble aktivert.** `onerror`
  fyrer fra en dekodetråd, og under `--virtual-time-budget` rekker den
  ikke alltid å fyre i det hele tatt — også for en `data:`-URL som feiler
  uten nettverk. En test som noen ganger sier «ingen kode kjørte» fordi
  bildet aldri ble lest, beviser ingenting. XSS-testen bruker derfor et
  **egendefinert element**: det bygges synkront av parseren, og det er
  samme egenskap som avgjør begge — `<template>`-innhold hører til et
  dokument uten nettleserkontekst, så der skjer ingen av delene.
- **`kjor()` tar en valgfri vindusstørrelse.** Høydetesten trenger et
  telefonformat for at taket i det hele tatt skal binde.
- **Template-literal-feller:** bakstreker spises (bruk enkeltfnutter inne
  i selektorer), og en bakstrek-apostrof i en kommentar avslutter
  literalen.
- **En `pull_request`-kjøring tester grenen flettet med `main`.** En test
  som er ny på main kjører der før den finnes lokalt.
