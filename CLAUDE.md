# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no, med en fotballmodul. Vanilla ES-moduler,
ingen byggesteg. Hostes på Netlify som `mvp-sb`.

Denne fila er **reglene som gjelder nå**. Begrunnelsene står i
[`docs/adr/`](docs/adr/README.md), historien i
[`docs/hendelser.md`](docs/hendelser.md), testdetaljene i
[`docs/testing.md`](docs/testing.md). Er du i tvil om *hvorfor*, er svaret
der — ikke her.

## Slik vil jeg ha svar

- **Still spørsmål som kan klikkes.** Bruk AskUserQuestion med konkrete
  alternativer, ikke åpne spørsmål i brødteksten.
- **Avslutt hvert svar med en statusblokk**: hva som er siste nytt, hvor
  jeg finner det (prod-URL, branch, PR), og om du venter på meg.

## Filene

    index.html      markup, meta, temaskriptet som må kjøre før rendering
    app.css         all stil
    app.js          appen, lastet som modul
    lib.js          rene funksjoner uten DOM
    sw.js           service worker: nett først, cacher skallet, aldri /api/
    netlify.toml    proxy mot WordPress

    fotball.js / fotball-data.js / netlify/functions/fotball.mjs
    vaer-data.js / netlify/functions/vaer.mjs
    pub-data.js / puber-oslo.js / puber-kontakt.js / netlify/functions/puber.mjs
    kanaler.js      hvilken kanal som sender ligaen — tom til noen har sjekket
    konto-data.js / pin-data.js / netlify/functions/konto.mjs
    svar-data.js / netlify/functions/svar.mjs
    visning-data.js / visninger.js / netlify/functions/visninger.mjs
    admin.html / admin.js / netlify/functions/brukere.mjs

    personvern.html hva vi lagrer, og hvordan du blir kvitt det
    bilder/         annonsebilder, ett ferdig utsnitt per form
    docs/           adr/, hendelser.md, testing.md,
                    nokler-og-tokens.md, oppsett.sql, kampdag-dypdykk.md
    BACKLOGG.md     peker til issues, som er den ekte backloggen

**Mønsteret:** `*-data.js` er rene funksjoner — ingen DOM, ingen
nettverk, ingen lagring — delt mellom appen, Netlify-funksjonen og
testene. Hører en funksjon hjemme der, legg den der. Blir appen og
tjenesten uenige om en regel, får leseren en feilmelding som ikke stemmer.

## Reglene

### Ikke rør
- **Ingenting skal kreve endringer på sportsbibelen.no.**
- **Proxyen er smal**: kun `/posts` og `/categories`, aldri wildcard mot
  `wp/v2` — det åpner en vei inn til `/users`. [ADR 0003](docs/adr/0003-smal-wordpress-proxy.md)
- **Ingen funksjon har en `service_role`-nøkkel**, med ett dokumentert
  unntak (`brukere.mjs`). [ADR 0010](docs/adr/0010-ingen-service-role.md)
- **Ingen sporing, ingen informasjonskapsler, ingen samtykkebanner.**
  [ADR 0004](docs/adr/0004-ingen-statistikk.md)
- **Ingenting er låst bak innlogging.** [ADR 0009](docs/adr/0009-fornavn-og-pin.md)
- **`PIN_PEPPER` kan ikke endres.** Et nytt pepper låser alle ute.

### Si sant
- **Hvert annonsekort sier hva det er** — «Reklame», «Ledig plass» eller
  «Spøk». Merket ligger som data i `EGNE_MERKER`, ikke som `if`-er.
  [ADR 0005](docs/adr/0005-egen-annonseplass.md)
- **En knapp som ser ut som den gir noe den ikke gir, er verre enn en som
  sier hva den er.** Gjelder «Venner», «Meldt inn til oss», og
  «Valgt for deling» utlogget.
- **En stille tom liste er ikke til å skille fra «ingen svarte».** Feiler
  et kall der lista *er* hele visningen, si det. Er lista et tillegg til
  noe annet, ti — men da får den som handlet beskjed.
- **Feilmeldinger bærer tjenestens egne ord.** `forsok` i svaret, uten
  nøkler og uten adresser, så det kan leses fra nettleseren.
- **Opplysninger om virkeligheten trenger kilde og dato.** Pubenes
  kontaktfelt (`kontaktFor`) og kanalen som sender ligaen (`kanalFor`)
  slipper bare gjennom når begge står. Voktere i `unit.mjs` kjører mot de
  ekte filene, og et navn uten kilde slår ut der framfor i appen.
  [ADR 0016](docs/adr/0016-kanalen-som-sender.md)

### Form
- Farger er CSS-variabler i `:root`; et tema overstyrer **kun** variabler.
  Tekst oppå bildegradienten bruker `--on-overlay`.
- `--fs` skalerer tekst. Avstander og rammer skaleres ikke.
- **En knapp i en knapp finnes ikke.** Trenger en rad to mål, er de
  søsken — eller trykkflata legges utstrakt over innholdet (`.kamp-del`).
- Artikkel-HTML renses med allowlist. Utvid lista framfor å lage unntak.
- Filtrerer noe feeden, står det som en knapp med kryss i toppfeltet.

### Data
- **Kamp-id er `kampNokkel()`**, ikke kildens id. Alt som lagres, slås opp
  eller deles går på `nokkel`. [ADR 0008](docs/adr/0008-kampnokkel.md)
- **`tolkSvar` må tåle å kjøres to ganger.** Den deles mellom tjenesten og
  appen, og begge kjører den.
- **En skriving som svarer 200 er ikke bevis på at raden ligger der.**
  `settSvar` leser tilbake to ganger — som deg og som hvem som helst — og
  forskjellen er diagnosen.
- **Feilsvar caches aldri** (`no-store`). Ellers låser et blaff seg fast.
- Hemmeligheter står samlet i [`docs/nokler-og-tokens.md`](docs/nokler-og-tokens.md).
  Funksjonene leser miljøet **ved utrulling** — en ny variabel krever en
  ny deploy — og navnene er versalfølsomme.

## Testing

    node test/unit.mjs      501 tester
    node test/funksjon.mjs  238 tester
    node test/run.mjs       423 tester, ~200 s, headless Chromium

Tre regler, og de har alle kostet noe:

1. **Tallene telles av testene selv**, og tallet er sjekken på at en ny
   test faktisk kjørte. Grønt på en test som aldri kjørte er verre enn rødt.
2. **Sjekk at testen kan feile.** Ødelegg linja den beskytter og se at den
   slår ut.
3. **Stubben skal modellere svaret, ikke koden som lager det.** En stubb
   som er enig med feilen din beviser ingenting.

Detaljer og feller: [`docs/testing.md`](docs/testing.md).

## Arbeidsflyt

Små, trygge endringer kan pushes rett til `main` — Netlify deployer på
push, og CI kjører der også. **Merk at CI ikke stopper en deploy:** en rød
test er en rapport, ikke en vakt.

Bruk pull request for alt som endrer arkitektur, sikkerhet eller flere
filer samtidig.
