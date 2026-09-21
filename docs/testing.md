# Testing

**Dette er det ene stedet antallet står.** CLAUDE.md og README har
kommandoene, men ikke tallene: de sto i tre filer og glei fire ganger på to
dager. Legger du til tester, er det denne fila som skal rettes.

    node test/unit.mjs      811 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  407 tester, ~250 ms, ingen nettleser
    node test/run.mjs       822 tester, 3–20 s, headless Chromium

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

**Nettlesertestene koster oppstart, ikke ventetid.** Hver scene er en
egen Chromium-prosess, og `--virtual-time-budget` hopper over all
`setTimeout`-venting: en scene som venter tolv sekunder er like rask som
en som venter ett. Det som stanser den virtuelle klokka er ekte
ressurslasting — og Google-fontene i `index.html` ble hentet på nytt i
hver ferske profil, uten cache, så de kostet mer enn selve testen.
`kjor()` tar derfor fontlenkene ut av testkopien (ingen test ser på
fonter), og scenene kjøres flere om gangen, hver med sin egen tjener og
sin egen mappe, så ingen scene kan se en annens filer. `SAMTIDIG=1`
kjører dem etter tur, som før.

Målt på fire kjerner, 33 scener: `headless_shell` rundt 3 s parallelt og
8 s etter tur; full Chromium rundt 10 s og 17 s. Før var det 13–27 s her,
og rundt 200 s på en Mac med full Chrome. Et grønt CI-resultat på under et
minutt er altså normalt — det betyr *ikke* at nettlesertestene ble hoppet
over. Sjekk antallet i loggen framfor å lese klokka; det er tallet som
sier at de kjørte.

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

**En stubb kan også være for *kort*.** 17. september 2026 skrev jeg en
test på at Overpass' feilside skal gi grunnen framfor doctypen — og lot
stubben returnere en tre linjers feilside. Den overlevde sabotasjen der
teksten kappes på 80 tegn, for etter at taggene var strippet var hele
stubben under 80 tegn. Den ekte sida har et avsnitt om ODbL-lisensen
først, og det er *nettopp* det avsnittet som fyller de 80 tegnene og
skjuler feilen. Stubben må bære det som gjør feilen mulig, ikke bare det
feltet testen leser.

**Og en sabotasje kan avsløre at stubben er feil, ikke bare at koden er
det.** Det var sabotasjen som fant dette — testen var grønn både før og
etter fiksen, og sa dermed ingenting.

**Sabotér hver linje for seg, ikke fiksen under ett.** 17. september 2026
ble en rettelse satt to steder: når lista tegnes, og etter en vellykket
lagring. Begge fjernet samtidig felte to tester, og det så ut som dekning.
Bare den ene fjernet — den som gjaldt *nettopp det som var meldt* — felte
ingen av dem. Vakta for den ekte rundturen fantes ikke, og ble skrevet
etterpå. En fiks med to inngangspunkter trenger en sabotasje per
inngangspunkt.

**Scenelista nederst kan liste den samme scenen to ganger.** `SAK_15E`
sto to steder i `Promise.all([…])` fram til 21. september 2026, og da ble
de tretten testene i den talt dobbelt. Tallet i denne fila var altså for
høyt — og tallet finnes nettopp for å avsløre at noe ikke kjørte. Et
`Promise.all` på den samme promisen gir det samme resultatet to ganger
uten å klage. Legger du til en scene: sjekk at navnet ikke alt står der,
og at antallet flyttet seg så mye som scenen faktisk inneholder.

**En vakt som måler hele sida, må åpne den først.** Portalen ble
sammenleggbar 21. september 2026, og da sto de fleste seksjonene lukket.
Både 16 px-vakta og 320 px-vakta i `SAK_15` måler *alt* — og et skjult
panel har ingen bredde. Uten `apneAlt()` ville de sagt «alt er bra» om
felt som står én knapp unna. Vakta måler portalen, ikke dagens tilstand.

**En bakoverfnutt i en kommentar sprenger hele fila.** Scenene i
`run.mjs` er maler (`` ` ``), sa ``// `sist` er PIN-datoen`` avslutter
malen midt i scenen. Feilen kommer ut som «missing ) after argument list»
pa `kjor(`-linja hundrevis av linjer tidligere, og peker altsa ikke i
naerheten av det som er galt. Bruk «hermetegn» i kommentarer der inne.
Samme familie som bakoverstrekene som blir spist.

**Og en bredde er ikke alltid det som er galt.** 18. september ble «jeg
kan scrolle skjermen til venstre og høyre» meldt for andre gang, etter at
brukertabellen var rettet. Jeg målte hvert eneste element i en 320
px-boks: ingenting over 320. Layouten var riktig hele tiden — Safari på
iPhone **zoomer inn av seg selv** når du fokuserer et felt med skrift under
16 px, og etter den zoomen er sida pannbar. Vakta måler derfor
skriftstørrelsen på hvert felt, ikke bredden. En vakt som måler feil ting
sier «alt er bra» mens telefonen gjør noe annet.

**En regel som ser på vinduet kan ikke voktes her.** `--window-size`
binder ikke likt lokalt og på CI, så bredder måles i en boks med kjent
bredde — og da fyrer ikke en `@media`. Samme dag ble brukerlista først
fikset med `@media (max-width: 560px)`, og vakta viste 542 px som før.
Fiksen gjelder nå i enhver bredde, uten spørring. Trenger du likevel en
media query, må den voktes et annet sted enn her.

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

Suiten vokter også to lister som vedlikeholdes for hånd og derfor glir:
at hver modul appen importerer står i service workerens `SKALL`, og at
hver fil i appen er omtalt i [`modulene.md`](modulene.md). Begge leser
filene fra disken framfor fra en liste i testen — en liste ved siden av
dokumentet ville bare gitt to steder som kan ligge etter i stedet for ett.

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

- **Ikke still scenen der svaret er opplagt.** `SAK_14D` sto i *døra* til
  puben den skulle finne — null meter unna — og var grønn mens appen viste
  ingenting for en leser i sentrum 1545 meter unna. Testen beviste at
  sammenslåinga virket, ikke at stedet kunne nås. Er det geografi som
  testes, still deg der en leser faktisk står, ikke på punktet raden
  lagres med.

- **`?posisjon=` setter posisjonen ved oppstart — og hopper over veien
  dit.** Snarveien er laget for å kunne prøve appen utenfor Oslo, og den
  setter `sisteKjentePosisjon` før noe kort åpnes. Alle sju
  posisjonsscenene brukte den, og alle sju var grønne mens appen aldri
  spurte telefonen om noe: de beviste at filteret virker **når** posisjonen
  finnes, og ingenting om hvordan den kommer. En telefon har bare den ene
  veien. Testes det som skjer *fordi* posisjonen mangler, må scenen stå
  uten `?posisjon=` og stubbe `navigator.geolocation` selv — gjerne slik at
  svaret kan holdes tilbake, så skjermen kan måles både før og etter.

- **Et tidspunkt i en stubb må ligge i samme *kalenderdøgn* som nå.**
  `SAK_15` satte en økt til `Date.now() - 3600000` og krevde at cella leste
  «I dag». Mellom midnatt og 01:00 i Oslo er én time siden i **går**, og da
  sto to tester røde mens koden var riktig — `osloDogn()` i `pin-data.js`
  regner nettopp kalenderdøgn, og gjør det rett. CI kjører i UTC, så vinduet
  var 22–23 UTC hvert døgn: rødt én time om dagen, grønt de andre
  tjuetre. Det er samme felle som feilen kolonnen ble laget for — «I dag
  23:00» klokka 01:00 natt til dagen etter. **Et døgn er ikke 24 timer
  bakover.** `iDagIOslo()` går en time tilbake, men aldri forbi ett minutt
  etter Oslo-midnatt.

  Verdt å merke seg *hvordan* den ble funnet: den slo til under en helt
  annen kjøring, i det ene vinduet. En test som er rød én time i døgnet
  ser ut som en flakete test, og «flake» er ingen årsak.

- **Skriv aldri bakoverstrek i et testskript.** Skriptene limes inn i en
  template-streng, og `\d` er borte før nettleseren ser det — mønsteret
  blir `dd.dd.dddd` og treffer ingenting. Fella har slått til tre ganger:
  i en XSS-test, i en CSS-selektor, og i en regex for en dato. Regelen er
  ikke «tell bakoverstrekene riktig», den er **la være å bruke dem**:
  `split(".")` framfor `/\./`, `indexOf` framfor `test()`.

- **`getComputedStyle()` gir et *levende* objekt.** Vil du vite hva en
  klasse faktisk gjør, må verdiene kopieres til vanlige strenger **før**
  klassen fjernes. Leser du samme deklarasjon etterpå, sammenlikner du
  elementet med seg selv — og får «ingenting endres» uansett. Kostet en
  feil konklusjon 16. september 2026.
- **De genererte sidene i `tmp` kjører sitt eget scenario.** Injiserer du
  et eget skript i `pub-bekreftet.html` for å måle noe, klikker sidas egen
  test videre samtidig — og du måler en blandet tilstand. Samme dag ble
  «Carls har stjerne på feil kamp» meldt som en feil; det var proben som
  leste kortet fra kamp 1 mens sida alt hadde åpnet kamp 2. Bygg en egen
  side fra `index.html` når du skal måle, eller les assertionene som
  finnes fra før.
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
- - **Bredder settes i testen, ikke av `--window-size`.** Flagget slår ikke
  gjennom likt overalt: lokalt er binærfila ofte `headless_shell`, på en
  CI-runner er det ekte Chrome, og der ble kortet 390 px uansett hva vinduet
  sa. Sett `.phone` sin bredde selv når bredden er det du tester.
- **Og mål med margin, ikke på grensen.** Fontene er ikke de samme på din
  maskin og på runneren. Tabelltesten passerte lokalt med 310 px felt og
  feilet på CI med «322 av 310» — tolv piksler, og hele forskjellen var
  fontmetrikk. Den sjekker nå også en bredde smalere enn noen iPhone i bruk,
  så en font som tegner litt bredere ikke kan velte den.

**`kjor()` tar en valgfri vindusstørrelse — og uten den måler du en
  bredde ingen telefon gir.** Standardvinduet lar `.phone` få hele sine
  390 px. En iPhone 13 mini er 375 px *totalt*, og `body` tar 10 px på hver
  side: 355 px til kortet, 310 px til tabellfeltet. En tabelltest uten
  størrelse passerte i to dager mens poengkolonnen sto utenfor skjermen i
  prod. Høydetesten trenger den av samme grunn: uten et telefonformat
  binder taket aldri.
- **Template-literal-feller:** bakstreker spises (bruk enkeltfnutter inne
  i selektorer), og en bakstrek-apostrof i en kommentar avslutter
  literalen.
  **Og den kommer som vane, ikke som slurv:** den vanligste formen er et
  kodeord i fnutter i en kommentar — «regelen `merke: "spok"`», «flagget
  `--window-size`». Det er Markdown-refleksen, og den satt i fingrene to
  ganger på én dag 21. september 2026. Symptomet peker ikke på linja:
  du får `SyntaxError` et sted **etter** scenen, der neste `kjor(`
  begynner, og med en melding om noe helt annet — «missing ) after
  argument list» eller «Invalid left-hand side expression in postfix
  operation», det siste fordi `--noe` da leses som en dekrement.
  Skriv kodeord uten fnutter inne i en scene.
- **En `pull_request`-kjøring tester grenen flettet med `main`.** En test
  som er ny på main kjører der før den finnes lokalt.
