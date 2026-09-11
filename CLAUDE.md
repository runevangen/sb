# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no. Ingen byggesteg. Hostes på Netlify som
prosjektet `mvp-sb`.

    index.html    markup, meta og temaskriptet som må kjøre før rendering
    app.css       all stil
    app.js        appen, lastet som modul
    lib.js        rene funksjoner uten DOM, importeres av app.js og av testene
    sw.js         service worker: cacher bare skallet, aldri /api/
    netlify.toml  proxy mot WordPress

    BACKLOGG.md   peker til issues, som er den ekte backloggen
    docs/         dypdykk og notater som ikke er kode
                  nokler-og-tokens.md: alle hemmeligheter, hvor de settes,
                  hva som svikter uten dem, og hvordan de fornyes

    fotball.js                    fotballmodulen (beta): visningen
    fotball-data.js               samme modul: rene funksjoner
    netlify/functions/fotball.mjs samme modul: henting og caching
    vaer-data.js                  været ved avspark: arenaer, varsel, kleråd
    netlify/functions/vaer.mjs    samme: henting fra MET og caching
    pub-data.js                   pubene rundt kampen: Overpass, Entur, dine puber
    puber-oslo.js                 kuratert liste: Oslo-puber som viser fotball
    puber-kontakt.js              samme puber: telefon, mat, apningstider — uverifisert
    netlify/functions/puber.mjs   samme: puber ved stadion og holdeplass, døgncache

    admin.html / admin.js            adminportalen: hvilke kamper viser hvilken pub
    visning-data.js                  samme: rene funksjoner, ogsa for lesersiden
    netlify/functions/visninger.mjs  samme: passord og skriving til repoet
    visninger.js                     dataene portalen skriver, lest av appen

`lib.js` finnes for å kunne enhetstestes uten nettleser. Hører en funksjon
hjemme der — ingen DOM, ingen nettverk, ingen lagring — så legg den der.

## Slik vil jeg ha svar

- **Still spørsmål som kan klikkes.** Bruk AskUserQuestion med konkrete
  alternativer, ikke åpne spørsmål i brødteksten.
- **Avslutt hvert svar med en statusblokk** som inneholder:
  - hva som er siste nytt (hva du nettopp endret),
  - hvor jeg finner det (prod-URL, branch, PR),
  - om du venter på meg eller ikke.

## Arkitektur

- Feeden hentes fra WordPress REST via en proxy på eget domene.
  Reglene ligger i `netlify.toml` og er bevisst smale: kun `/posts` og
  `/categories`, aldri wildcard mot `wp/v2` — det ville åpnet en vei inn
  til `/users`, som lister brukernavn.
- Ingenting skal kreve endringer på sportsbibelen.no.
- Hemmelighetene appen trenger — API-nøkler, adminpassordet,
  GitHub-tokenet — står samlet i `docs/nokler-og-tokens.md`: hvor hver
  settes, hva som svikter uten den, hvordan den fornyes, og hvilket
  endepunkt som sier fra når noe er galt. Legger du til en ny nøkkel,
  hører den hjemme der. To ting gjelder alle: funksjonene leser miljøet
  ved utrulling, så en ny variabel krever en ny deploy, og
  miljøvariabler er versalfølsomme.
- Artikkel-HTML renses med en allowlist før den vises. Ukjente tagger
  pakkes ut til tekst. Utvid allowlisten framfor å lage unntak.
- Fargene ligger som CSS-variabler i `:root`. Et tema overstyrer kun
  variabler. Tekst som ligger oppå bildegradienten bruker `--on-overlay`,
  ikke temaets tekstfarge — gradienten er mørk i begge temaer.
- Tekststørrelser skaleres av `--fs`. Avstander og rammer skaleres ikke.
- Ruting går på hash (`#/sak/<slug>`), ikke sti. En sti ville gitt 404 ved
  oppfriskning uten en ny regel i `netlify.toml`, og den skal holdes smal.
  Å åpne en sak legger en tilstand i historikken, så telefonens
  tilbakeknapp lukker artikkelen i stedet for appen.
- Lenker i artikkelteksten til vårt eget domene får `data-slug` og åpnes i
  appen. `href` beholdes, så lenken virker om noe feiler, og lang-trykk
  oppfører seg normalt.
- Ingen statistikk i det hele tatt, med vilje. Appen har null
  sporingsskript, ingen informasjonskapsler og ingen samtykkebanner.
  Bruken leses av Usage-grafen i Netlify — båndbredde og forespørsler —
  som er grov, men gratis og allerede der.
  `track()` i `app.js` står igjen som en tom operasjon, så de seksten
  hendelsene fortsatt er merket i koden. Skal de samles inn en gang, er
  det ett skript i `index.html` og ingen endringer i resten.
  Netlify Analytics ville målt på serveren uten noe skript, men er et
  betalt tillegg per prosjekt — valgt bort inntil videre.
- Et søk sorteres etter relevans hos WordPress (`orderby=relevance`),
  ikke dato: ellers fyller de tolv nyeste sakene som nevner laget i
  forbifarten første side. Innenfor det som er hentet legger
  `rangerTreff()` i `lib.js` tittel-treff øverst, så brødtekst-treff, så
  resten — nyeste først innenfor hver gruppe. Rangeringen skjer i
  `renderFeed`, ikke der dataene hentes, så «Vis flere» rangerer hele
  lista på nytt. Sammenlikningen folder norske tegn og HTML-entiteter,
  så «Bodø/Glimt» treffer tittelen «Bod&#248;/Glimt». Samme mekanisme er
  tenkt brukt til å løfte favorittlag i feeden (#24).
- Favorittlag velges med stjernen ved lagnavnet i tabellen og lagres i
  `localStorage` sammen med tema og skrift (`sb-visning`, feltet `lag`).
  Ingen konto, ingen data hos oss. Feeden løfter sakene om lagene med
  samme `rangerTreff()` som søket, men med terskel 2: bare saker som har
  laget i tittelen eller som kategori. En sak som nevner laget i
  forbifarten skal ikke skyve dagens toppsak nedover uten at leseren ser
  hvorfor. At rekkefølgen er endret står som en linje øverst i feeden,
  og linja er en knapp til tabellen, der valget gjøres om. Et søk
  overstyrer favorittene: da rangeres det etter søkeordet.
  Innlogging (#24) er dermed en synkroniseringssak, ikke en forutsetning.
- Filtrerer noe feeden — et søk eller en kategori — står det i toppfeltet
  som en knapp med kryss, ikke som ren tekst. Et filter uten vei ut blir
  stående til man åpner menyen og finner «Alle saker», og krysset i
  søkefeltet på iOS tømmer bare teksten uten å kjøre søket på nytt. I
  fotball er teksten ren: ligaen byttes, den fjernes ikke.

### Fotball (beta)

- Data hentes fra API-Football via en Netlify Function, ikke via en
  redirect: en redirect kan ikke sette en hemmelig header, og nøkkelen
  skal aldri nå nettleseren. Den ligger i `api_football_key` i
  Netlify-miljøet; funksjonen godtar også `API_FOOTBALL_KEY`, siden
  miljøvariabler er versalfølsomme. Uten nøkkel svarer funksjonen 503 med
  en synlig melding.
- Nyheter og fotball er to visninger i det samme kortet, valgt med
  bunnfanene. Begge ligger i DOM-en hele tiden — feeden skal stå klar bak
  fanen, med rulleposisjonen der leseren forlot den.
- Ruting: `#/fotball/<liga>/<del>`, begge ledd valgfrie og gjenkjent på
  innhold framfor rekkefølge. Ukjente ledd faller tilbake til standard, så
  en klippet lenke åpner noe framfor ingenting.
- Menyen beskriver visningen du står i: kategorier i nyheter, ligaer i
  fotball.
- API-Football skriver lagnavn uten norske bokstaver («Bodo/Glimt»,
  «Tromso»). `redaksjonsnavn()` i `fotball-data.js` oversetter til
  redaksjonens skrivemåte i det ene stedet dataene formes, så tabell,
  kamplister og lagsøk ser samme navn. Nøkkelen er navnet normalisert
  (små bokstaver, norske tegn foldet, tegnsetting fjernet), så lista
  tåler at API-et endrer skrivemåte. Ukjente navn går uendret gjennom —
  bare lag der API-ets form faktisk avviker står i lista.
- Lagnavnet i tabellen er en knapp, ikke en klikkbar rad: den nås med
  tastatur og leses opp som noe man kan trykke på. Den kaller samme
  `startSok` som søkefeltet, så et lagsøk oppfører seg nøyaktig som et
  søk man skriver selv — samme nullstilling, samme toppfelt, samme vei
  tilbake.
- Tabellen viser alle kolonnene. Et langt lagnavn brytes over to linjer
  framfor å gjøre tabellen bredere enn telefonen, så alt får plass også
  med stor skrift. Blir feltet likevel for smalt, ruller tabellen
  vannrett i sitt eget felt: `.phone` klipper alt som stikker utenfor, så
  et felt uten `overflow-x` ville skjult de siste kolonnene uten vei
  tilbake. Testen smalner feltet med vilje og ruller det faktisk, framfor
  bare å måle bredden.
- Adressen settes av `export const config` i funksjonen. Da slipper
  `netlify.toml` en ny regel, og redirect-reglene der holder seg smale.
- Gratisnivået dekker bare sesongene i `SESONGVINDU` (nå 2022–2024) og
  svarer «season, try from 2022 to 2024» på alt utenfor. Funksjonen spør
  derfor om nyeste sesong abonnementet gir, og sier fra i svaret
  (`sisteSesong: false`) når det ikke er den vi står i. Visningen setter
  sesongen over tabellen — en tabell fra i fjor som ser ut som årets er
  verre enn ingen tabell. Utvides abonnementet, er `SESONGVINDU` det
  eneste stedet tallene står.
- En sesong utenfor vinduet hentes først fra TheSportsDB (liga-id i
  `tsdb` i `LIGAER`, testnøkkel «3», eller `THESPORTSDB_KEY`), som gir
  årets tabell, resultater og neste runde gratis. Svikter den — nettverk,
  uventet form, ingenting — får leseren API-Footballs svar som før.
  Svaret sier hvor det kom fra (`kilde`), og stempelet under viser det.
  Alle tre er sett virke i prod 10. september 2026 — men gratisnøkkelen
  kapper svarene (fem tabellrader, én kamp i listene). Et avkortet svar
  vises aldri som årets: `TSDB_MINST` i `fotball-data.js` er det minste
  som regnes som helt, og under det brukes API-Football som før. Med en
  Patreon-nøkkel i `THESPORTSDB_KEY` prøves v2 (`/api/v2/json/`, nøkkelen
  i `X-API-KEY`-headeren) og deretter v1 med nøkkelen i adressen — Patreon
  gir begge varianter, og vi vet ikke hvilken nøkkelen er. Svaret bærer
  `forsok`: hva som ble prøvd, statuskode, tjenestens egen feilmelding,
  antall og utfall, uten nøkkel og uten adresser, så det kan leses rett fra nettleseren
  (`/api/fotball/tabell?liga=eliteserien`) når noe ikke stemmer. Da kommer full tabell, hele
  runder, og dermed deling og vær: det er den ene bryteren. Men
  funksjonene leser miljøet ved deploy, og kant-cachen holder forrige
  svar i inntil tre timer — så etter at nøkkelen er satt, må det
  deployes på nytt (Netlify → Deploys → Trigger deploy) før noe endrer
  seg. En deploy tømmer også cachen.
  Parserne tar den første lista de finner i svaret, så et annet
  feltnavn ikke velter noe. Sett virke i prod 11. september 2026 med
  Patreon-nøkkel: full tabell for 2026. Første forsøk feilet fordi
  nøkkelen var limt inn med ett siffer for lite — `forsok` viste 400 fra
  begge utgavene, og det var det som pekte på nøkkelen framfor koden.
  TheSportsDB skriver sesongen «2026»
  for kalenderligaer og «2026-2027» for dem som krysser nyttår
  (`tsdbSesong`).
- «Hvor ser du kampen?» Årets kommende kamper har en delingsknapp som
  åpner ett spørsmål under raden: hjemme, på pub (med navn) eller på
  stadion (med arena). Svaret deles som tekst inn i gruppechatten leseren
  allerede har — ingen konto, ingen lagring, chatten er vennegruppa.
  Teksten lages av `delingstekst()` i `fotball-data.js`, i norsk tid, og
  er testet: det er det leseren faktisk sender. Fjorårets runde kan ikke
  deles; det står hvorfor. Delingen går gjennom samme `delTekst()` i
  `app.js` som «Del appen», med utklippstavle som reserve.
- Været ved avspark står under hver kamp i årets neste runde, og går
  inn i delingsteksten. Kilden er MET Norway (Locationforecast 2.0) via
  `netlify/functions/vaer.mjs`: MET krever en User-Agent som sier hvem
  som spør, og den kan ikke settes fra nettleseren. Ingen nøkkel, men
  lisensen krever kreditering, og «Vær: MET Norway» står i stempelet.
  Koordinatene ligger i `ARENAER` i `vaer-data.js`, skrevet inn for hånd
  med tre desimaler (MET vil ikke ha flere) og slått opp på arenanavnet
  slik API-ene skriver det; ukjent arena gir ingen vær, ikke feil sted.
  Kleråd og følt temperatur (JAG/TI, som yr bruker) er rene funksjoner
  med tester. Varselet rekker rundt ni dager; en kamp lenger fram får et
  gyldig, tomt svar. Cache-nøkkelen er adressen med arena og tidspunkt,
  så hver kamp er én nøkkel, og MET spørres høyst en gang i timen per
  kamp. Sett virke i prod 11. september 2026. Feiler kallet, bærer
  feilsvaret `forsok` med status og METs egen melding, som
  fotballfunksjonen.
- «Hvilken pub?» får fire svar som chips over feltet, og feltet er
  fortsatt sannheten. *Nær deg* står først og hentes med en gang:
  kampen spilles ofte et annet sted enn der man ser den. Trykket som
  valgte «på pub» er handlingen telefonen krever for å spørre om
  posisjon, så den kan hentes da framfor etter et trykk til. Posisjonen
  rundes til tre desimaler (≈100 m) og går rett fra nettleseren til
  Overpass, aldri innom oss, og det står under knappen. *Dine puber*:
  de du har delt før, lagret lokalt som favorittlagene (`sb-visning`,
  feltet `puber`), oftest brukt først. *Ved stadion* og *ved holdeplassen*: fra
  `netlify/functions/puber.mjs`, som spør Entur om holdeplassene innen
  700 m og Overpass om puber innen 1200 m, og grupperer (800 m fra
  stadion, 300 m fra holdeplass). Arenaene står fast, så hver er én
  cache-nøkkel med et døgns levetid — Overpass ber om fair use, og dette
  er det. Netlify avbryter en funksjon etter ti sekunder, så alt kappløper
  innenfor én frist (`restTid`): Entur og Overpass samtidig, og alle
  Overpass-tjenerne i `OVERPASS_SPEIL` samtidig. Den første som svarer
  vinner, resten avbrytes — da settler de med en gang, så `forsok` blir
  komplett uten å vente på de trege. Etter tur ble summen av trege
  tjenere større enn fristen, og da kom ingenting: leseren fikk Netlifys
  feilside i stedet for vårt svar, uten `forsok`, som er det eneste som
  sier hvem som sviktet. Overpass-kall må bære
  `Accept: application/json`; uten den svarer hovedtjeneren 406 med en
  HTML-feilside. `OVERPASS_SPEIL` i
  `pub-data.js` er tjenerne, og de spørres samtidig både fra funksjonen og
  fra nettleseren, så én streng eller treg tjener ikke tar ned
  funksjonen. Svikter
  Entur, står pubene ved stadion igjen; svikter alle Overpass-tjenerne,
  502 uten cache og `forsok` som forklarer per tjener — og visningen
  setter den siste linja i `forsok` inn i feilmeldingen
  («overpass-api.de svarte 406»), så det kan meldes videre uten å grave
  i funksjonsloggen. Lisensen (ODbL) krever
  «© OpenStreetMap-bidragsytere» der pubene vises. `uverifisert` til det
  er sett i prod: sandkassen når verken Overpass eller Entur.
- OpenStreetMap vet at et sted er en pub, men ikke om de viser fotball.
  Det er den vurderingen `puber-oslo.js` bærer, og den ligger i koden —
  så «Kjent for å vise fotball» står der også når både Overpass og vår
  egen funksjon er nede. Det er verdt mye her, der Overpass har vært det
  skjøreste leddet. Lista brukes tre steder: en gruppe nær leseren, en
  gruppe ved arenaen der lista dekker den, og et merke på treff fra
  OpenStreetMap som vi vet viser fotball. Rader merket `usikker` vises
  ikke — ett forslag færre er bedre enn ett vi ikke tør stå inne for.
  `sjekkPubliste()` vokter formen, og `unit.mjs` kjører den mot den ekte
  lista: en feilskrevet rad slår ut i testene framfor i appen. Hver rad
  må ha en kilde som er en lenke, og en `sjekket`-dato. En udatert rad er
  verre enn ingen rad; Oslos uteliv flytter seg fort. Koordinatene er
  anslag fra gateadressen, gode nok til å sortere etter avstand, ikke til
  å navigere etter.
- Kontaktopplysningene ligger i `puber-kontakt.js`, ikke i `puber-oslo.js`.
  De to råtner i ulikt tempo: at et sted viser fotball er en redaksjonell
  vurdering som står seg, mens et telefonnummer ikke gjør det. Hvert felt
  bærer kilden og et ordrett sitat, og `tillit` — hvor mange uavhengige
  kilder som sa det samme.
- **Ingenting derfra vises i appen før det er verifisert.** `kontaktFor()`
  i `pub-data.js` gir bare ut felt som har en `verifisert`-dato, satt av
  en person som har sett opplysningen selv. Uten den er raden et forslag,
  og et feil telefonnummer til en ekte bedrift er verre enn ingen.
  `sjekkKontaktliste()` vokter formen — nummerform, e-postform, at
  matvalget er ett av tre, at hvert felt har kilde og sitat — og `unit.mjs`
  kjører den mot den ekte fila. Innsamlingen 11. september 2026 nådde
  ingen av pubenes egne sider; sitatene er slik de sto i søketreffet.
- Gratisnivået gir 100 kall i døgnet. Caching skjer på Netlifys kant med
  `Netlify-CDN-Cache-Control` og `durable`, som gir én delt cache i stedet
  for én per region. Levetidene står i `LEVETID` i `fotball-data.js`, og
  en enhetstest slår ut hvis en ny liga sprenger kvoten.
- Feilsvar caches aldri (`no-store`). Ellers ville et blaff låst seg fast
  i timevis.
- API-et svarer 200 også når noe er galt og legger feilen i `errors`.
  `tolkTabell` kaster på det framfor å vise en tom tabell.

### Hvem viser kampen (admin)

- `admin.html` er en egen side, ikke en visning i appen. Den ligger under
  «Del appen» i menyen og er `noindex`. Portalen skriver ingenting selv:
  den sender valget til `/api/visninger`, som er det eneste stedet
  passordet (`ADMIN_PASSORD`) og GitHub-tokenet (`GITHUB_TOKEN`) finnes.
  Passordet sammenliknes i konstant tid, og et feil passord når aldri
  GitHub.
- Passordet først: resten av portalen ligger skjult til tjenesten har
  godtatt det (`handling: "sjekk"`, som bare svarer ja eller nei).
  Skjulingen er ikke sikkerheten — den ligger i funksjonen, som krever
  passordet ved hver skriving — men den som åpner sida skal se ett felt,
  ikke et skjema hen ikke kan lagre. Innloggingen sparer også et kall
  mot API-Football per åpning: kampene hentes først etterpå, og
  døgnkvoten er hundre. Passordet lever i en variabel i modulen, ikke i
  feltet og ikke i `sessionStorage`; feltet tømmes, og en oppfriskning
  krever ny innlogging.
- Mangler en av hemmelighetene, svarer funksjonen 503 og sier hvilken —
  «Portalen er ikke satt opp» alene sender admin til å lete i koden
  etter noe som står i Netlify-panelet. Et `GET /api/visninger` spør
  bare om oppsettet (`klar`, `mangler`), og portalen gjør det ved
  åpning: da står det der før kampene er krysset av, ikke etter. Husk at
  funksjonene leser miljøet ved utrulling, så en ny variabel krever en
  ny deploy.
- Kampene admin krysser av hentes fra `/api/fotball/neste` — samme
  endepunkt som fotballfanen. Ligaene kommer fra `LIGAER` i
  `fotball-data.js`, ikke fra en egen liste, så de to ikke kan gli fra
  hverandre. Bytter admin liga, hentes den ligaens kommende kamper.
  Kampene som sto på skjermen sendes med lagringen, så funksjonen slipper
  å hente dem på nytt og vi vet at det er de samme.
- Lagringen er en commit: funksjonen leser `visninger.js` fra GitHub
  (sha og innhold), fletter inn valget med `slaSammen` i
  `visning-data.js` og skriver fila tilbake. Fila er derfor gyldig JSON
  inni en `export`, så funksjonen kan lese den ekte tilstanden fra
  repoet framfor å stole på en utrullet kopi. `utenGamle` kaster kamper
  som er spilt for lenge siden, så lista ikke vokser i det uendelige.
  En commit utløser en deploy, så endringen er ute i appen etter et
  minutt eller to — og går noe galt, kan fila rettes for hånd.
- `slaSammen` rører bare den ene puben og de kampene som sto på
  skjermen. To puber kan settes etter hverandre, og en annen ligas
  visninger overlever et bytte.
- Pubene kommer fra `puber-oslo.js`; en pub som ikke står der, avvises av
  funksjonen. `usikker` vises ikke i appen og kan derfor ikke velges her
  heller.
- Leseren ser det to steder. På kampen selv står «Denne kampen vises på:
  Lincoln Pub» rett under raden, så den som blar gjennom runden ser det
  uten å åpne noe; pubnavnet er en knapp som åpner delingspanelet med
  «på pub» og puben ferdig valgt. I panelet står de samme pubene som
  egen gruppe aller øverst — den eneste gruppa som svarer på *denne*
  kampen, mens resten er steder som pleier å vise fotball. Dukker samme
  pub opp igjen under «Nær deg» eller ved arenaen, bærer den samme
  stjerne der (`merkBekreftet`), så den ser lik ut overalt.
- Det står «Meldt inn til oss» under gruppa, ikke «Puben bekrefter»:
  inntil pubene skriver selv (#65) er det vi som har ført det inn, og
  leseren skal vite forskjellen.
- Fargen er `--bekreftet`, en egen variabel i begge temaer: `#1F7A4D` er
  for mørk på svart. Stjerna sier noe annet enn ballen — ballen betyr at
  stedet pleier å vise fotball, stjerna at nettopp denne kampen vises.
  Stjerna i tabellen er en annen sak: den velger favorittlag, og de to
  møtes aldri på samme skjerm.
- Nettlesertesten legger sin egen `visninger.js` i temp-katalogen, og
  testtjeneren serverer den framfor den i repoet. Da kan lesersiden
  testes med ekte data uten at `visninger.js` fylles med oppdiktede
  puber.

## Testing

    node test/unit.mjs      300 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  128 tester, ~250 ms, ingen nettleser
    node test/run.mjs       203 tester, ~130 s, headless Chromium

Tallene telles av testene selv. De sto en stund som konstanter, og da
gled de fra virkeligheten: enhetstestene meldte 271 mens 279 kjørte, og
funksjonstestene 122 mens 119 kjørte.

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`.
De raske først, så en åpenbar feil stopper kjøringen før nettleseren
i det hele tatt starter.

`funksjon.mjs` kaller Netlify-funksjonene direkte med et stubbet `fetch`:
statuskoder, cache-headere, at API-nøkkelen går til API-et og ikke til
leseren, og at TheSportsDB prøves først for årets neste runde og faller
tilbake når den svikter, og at værfunksjonen identifiserer seg for MET.
Ingen nøkkel og ingen nettverk kreves. Én test lar en tjener tie for å se
at kappløpet ikke venter på den; uten den ville akkurat den feilen bare
vist seg i prod.

`unit.mjs` dekker `lib.js`, `fotball-data.js`, `vaer-data.js` og `pub-data.js`: URL-validering, videovertslisten, tidsstempler,
endringssignaturen, gjenkjenning av interne lenker, rangering av søketreff og favorittlag, sesongvinduet per
liga, tolkning av API-Football-svaret, hvilken runde som er «neste», at
døgnkvoten holder, og at ingenting i `puber-kontakt.js` slipper ut i
appen før noen har datert det. `run.mjs` dekker alt som trenger DOM: XSS i titler
og artikkel-HTML, annonseplassering, rulleoppførsel, artikkelvisningen,
fokusfella, korthøyden, at toppfeltet krymper, paginering, ruting,
visningsvalgene i menyen, favorittlag fra stjerne til feed, deling av en
kamp med sted og pubforslag, adminportalen fra innlogging til lagring, og hele
fotballmodulen — fanebytte, tabell, resultater, neste runde, dyplenker og
feilmelding fra tjenesten.

Testsidene serveres over HTTP, ikke fra `file://` — modul-script blokkeres
av CORS på file-opphav, og appen ville aldri lastet.

Legger du til en test, sjekk at den kan feile: ødelegg linja den skal
beskytte og se at den slår ut. To tester har passert av feil grunn i dette
prosjektet — rulletesten sjekket `scrollTop` der den var null uansett, og
høydetesten kjørte i et vindu der taket aldri bandt. `kjor()` tar derfor en
valgfri vindusstørrelse.

Merk at `--virtual-time-budget` ikke driver CSS-transisjoner fram; bruk
`--force-prefers-reduced-motion` for skjermbilder av animerte paneler.
Merk også at virtuell tid står stille så lenge et nettkall venter: et
ekte posisjonsoppslag hang hele kjøringen på CI. Testrammen stubber
derfor `getCurrentPosition` til å avslå, og tester som trenger en
posisjon overstyrer den selv.

## Arbeidsflyt

Små, trygge endringer kan pushes rett til `main` — Netlify deployer på
push, og CI kjører der også. Bruk pull request for alt som endrer
arkitektur, sikkerhet eller flere filer samtidig.
