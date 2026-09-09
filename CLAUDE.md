# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no. Ingen byggesteg. Hostes på Netlify som
prosjektet `mvp-sb`.

    index.html    markup, meta og temaskriptet som må kjøre før rendering
    app.css       all stil
    app.js        appen, lastet som modul
    lib.js        rene funksjoner uten DOM, importeres av app.js og av testene
    sw.js         service worker
    netlify.toml  proxy mot WordPress

    fotball-data.js               fotballmodulen (beta): rene funksjoner
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

### Fotball (beta)

- Data hentes fra API-Football via en Netlify Function, ikke via en
  redirect: en redirect kan ikke sette en hemmelig header, og nøkkelen
  skal aldri nå nettleseren. Den ligger i `FOOTBALL_API_KEY` i
  Netlify-miljøet.
- Adressen settes av `export const config` i funksjonen. Da slipper
  `netlify.toml` en ny regel, og redirect-reglene der holder seg smale.
- Gratisnivået gir 100 kall i døgnet. Caching skjer på Netlifys kant med
  `Netlify-CDN-Cache-Control` og `durable`, som gir én delt cache i stedet
  for én per region. Levetidene står i `LEVETID` i `fotball-data.js`, og
  en enhetstest slår ut hvis en ny liga sprenger kvoten.
- Feilsvar caches aldri (`no-store`). Ellers ville et blaff låst seg fast
  i timevis.
- API-et svarer 200 også når noe er galt og legger feilen i `errors`.
  `tolkTabell` kaster på det framfor å vise en tom tabell.

## Testing

    node test/unit.mjs      59 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  18 tester, ~120 ms, ingen nettleser
    node test/run.mjs       40 tester, ~70 s, headless Chromium

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`.
De raske først, så en åpenbar feil stopper kjøringen før nettleseren
i det hele tatt starter.

`funksjon.mjs` kaller Netlify-funksjonen direkte med et stubbet `fetch`:
statuskoder, cache-headere og at API-nøkkelen går til API-et og ikke til
leseren. Ingen nøkkel og ingen nettverk kreves.

`unit.mjs` dekker `lib.js` og `fotball-data.js`: URL-validering, videovertslisten, tidsstempler,
endringssignaturen, gjenkjenning av interne lenker, sesongvinduet per
liga, tolkning av API-Football-svaret og at døgnkvoten holder. `run.mjs` dekker alt som trenger DOM: XSS i titler
og artikkel-HTML, annonseplassering, rulleoppførsel, artikkelvisningen,
fokusfella, korthøyden, at toppfeltet krymper, paginering, ruting og
visningsvalgene i menyen.

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
