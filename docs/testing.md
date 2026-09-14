# Testing

    node test/unit.mjs      484 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  238 tester, ~250 ms, ingen nettleser
    node test/run.mjs       413 tester, ~200 s, headless Chromium

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`. De
raske først, så en åpenbar feil stopper kjøringen før nettleseren i det
hele tatt starter.

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
`visning-data.js`. URL-validering, videovertslisten, tidsstempler,
endringssignaturen, interne lenker, rangering av søketreff og
favorittlag, sesongvinduet per liga, tolkning av API-svarene, hvilken
runde som er «neste», at døgnkvoten holder per sport, at begge parserne
gir samme `nokkel` men ulik `id`, at `tolkSvar` tåler å kjøres to ganger,
at en økt vi ikke kjenner levetiden på regnes som utløpt, at ditt eget
svar finnes på id og ikke på navn, at «Ola» og «ola» blir samme konto
mens «Bjorn» og «Bjørn» ikke blir det, og at ingenting i
`puber-kontakt.js` slipper ut før noen har datert det.

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
- **`kjor()` tar en valgfri vindusstørrelse.** Høydetesten trenger et
  telefonformat for at taket i det hele tatt skal binde.
- **Template-literal-feller:** bakstreker spises (bruk enkeltfnutter inne
  i selektorer), og en bakstrek-apostrof i en kommentar avslutter
  literalen.
- **En `pull_request`-kjøring tester grenen flettet med `main`.** En test
  som er ny på main kjører der før den finnes lokalt.
