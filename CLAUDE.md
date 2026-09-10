# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no. Ingen byggesteg. Hostes på Netlify som
prosjektet `mvp-sb`.

    index.html    markup, meta og temaskriptet som må kjøre før rendering
    app.css       all stil
    app.js        appen, lastet som modul
    lib.js        rene funksjoner uten DOM, importeres av app.js og av testene
    sw.js         service worker
    netlify.toml  proxy mot WordPress

    BACKLOGG.md   peker til issues, som er den ekte backloggen
    docs/         dypdykk og notater som ikke er kode

    fotball.js                    fotballmodulen (beta): visningen
    fotball-data.js               samme modul: rene funksjoner
    netlify/functions/fotball.mjs samme modul: henting og caching

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
- «Neste runde» for en sesong utenfor vinduet hentes først fra
  TheSportsDB (liga-id i `tsdb` i `LIGAER`, testnøkkel «3», eller
  `THESPORTSDB_KEY`), som gir årets kamper gratis. Svikter den — nettverk,
  uventet form, ingen kamper — får leseren API-Footballs svar som før.
  Svaret sier hvor det kom fra (`kilde`), og stempelet under viser det.
  Feltnavnene er fra dokumentasjonen, ikke fra et svar vi har sett selv;
  til det er sett i prod er dette `uverifisert`.
- «Hvor ser du kampen?» Årets kommende kamper har en delingsknapp som
  åpner ett spørsmål under raden: hjemme, på pub (med navn) eller på
  stadion (med arena). Svaret deles som tekst inn i gruppechatten leseren
  allerede har — ingen konto, ingen lagring, chatten er vennegruppa.
  Teksten lages av `delingstekst()` i `fotball-data.js`, i norsk tid, og
  er testet: det er det leseren faktisk sender. Fjorårets runde kan ikke
  deles; det står hvorfor. Delingen går gjennom samme `delTekst()` i
  `app.js` som «Del appen», med utklippstavle som reserve.
- Gratisnivået gir 100 kall i døgnet. Caching skjer på Netlifys kant med
  `Netlify-CDN-Cache-Control` og `durable`, som gir én delt cache i stedet
  for én per region. Levetidene står i `LEVETID` i `fotball-data.js`, og
  en enhetstest slår ut hvis en ny liga sprenger kvoten.
- Feilsvar caches aldri (`no-store`). Ellers ville et blaff låst seg fast
  i timevis.
- API-et svarer 200 også når noe er galt og legger feilen i `errors`.
  `tolkTabell` kaster på det framfor å vise en tom tabell.

## Testing

    node test/unit.mjs      155 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  50 tester, ~120 ms, ingen nettleser
    node test/run.mjs       130 tester, ~110 s, headless Chromium

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`.
De raske først, så en åpenbar feil stopper kjøringen før nettleseren
i det hele tatt starter.

`funksjon.mjs` kaller Netlify-funksjonen direkte med et stubbet `fetch`:
statuskoder, cache-headere, at API-nøkkelen går til API-et og ikke til
leseren, og at TheSportsDB prøves først for årets neste runde og faller
tilbake når den svikter. Ingen nøkkel og ingen nettverk kreves.

`unit.mjs` dekker `lib.js` og `fotball-data.js`: URL-validering, videovertslisten, tidsstempler,
endringssignaturen, gjenkjenning av interne lenker, rangering av søketreff og favorittlag, sesongvinduet per
liga, tolkning av API-Football-svaret, hvilken runde som er «neste», og at
døgnkvoten holder. `run.mjs` dekker alt som trenger DOM: XSS i titler
og artikkel-HTML, annonseplassering, rulleoppførsel, artikkelvisningen,
fokusfella, korthøyden, at toppfeltet krymper, paginering, ruting,
visningsvalgene i menyen, favorittlag fra stjerne til feed, deling av en
kamp med sted, og hele
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

## Arbeidsflyt

Små, trygge endringer kan pushes rett til `main` — Netlify deployer på
push, og CI kjører der også. Bruk pull request for alt som endrer
arkitektur, sikkerhet eller flere filer samtidig.
