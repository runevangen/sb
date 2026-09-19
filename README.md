# Sportsbibelen

Nyhetsapp som viser saker fra sportsbibelen.no, med en fotballmodul i
beta: tabell, resultater, neste runde, været ved avspark, hvilke puber som
viser kampen, og hvem av vennene dine som blir med.

**Prod:** [mvp-sb.netlify.app](https://mvp-sb.netlify.app)

Vanilla ES-moduler. **Ingen byggesteg, ingen avhengigheter, ingen
`package.json`** — filene i repoet er filene nettleseren får. Netlify
deployer på push til `main`.

## Kom i gang

```sh
git clone https://github.com/runevangen/sb.git && cd sb
node test/unit.mjs        # rene funksjoner, ~90 ms
node test/funksjon.mjs    # Netlify-funksjonene, ~250 ms
node test/run.mjs         # DOM-testene, sekunder, krever Chromium
```

Node 22 (som CI og som byggeporten). Ingen `npm install` — det finnes
ingenting å installere.

Hvor mange tester hver suite har står i
[`docs/testing.md`](docs/testing.md), som er det ene stedet tallene bor.

Vil du se appen, server mappa over HTTP. **Ikke `file://`** — modul-script
blokkeres av CORS på file-opphav, og appen laster aldri:

```sh
python3 -m http.server 8000
```

`/api/*` svarer ikke da; de er Netlify Functions. Bruk `netlify dev`, eller
en forhåndsvisning fra en pull request.

## Når noe er galt

**Rulle tilbake en deploy.** Netlify → Deploys → velg forrige gode deploy →
**Publish deploy**. Tar sekunder og krever ingen commit. En utrulling
tømmer også kant-cachen, så funksjonene leser miljøet på nytt.

**Deployen stoppet, og testene var røde.** Det er meningen: enhets- og
funksjonstestene kjører som byggekommando, så en rød test publiserer
ingenting og forrige deploy står. Les byggeloggen i Netlify — den siste
linja før avbruddet sier hvilken test. `test/run.mjs` er *ikke* med i
porten (den trenger Chromium), så en DOM-regresjon fanges bare av CI.

**Adminportalen har skrevet noe galt.** Visningene er rader i tabellen
`visninger` i Supabase, ikke en fil i repoet ([ADR
0018](docs/adr/0018-visninger-i-supabase.md)). Rett eller slett raden i
Supabases tabellredigerer.

**Og merk hva det betyr for rollback:** å publisere en tidligere deploy
ruller tilbake *koden*, ikke *dataene*. En feil pubvisning, et «jeg blir
med» eller en konto står der etterpå. Før lå visningene i repoet, og da
fulgte de med tilbake. Det gjør de ikke nå.

**En funksjon svarer 503.** Da mangler en miljøvariabel, og svaret sier
hvilken. To ting gjelder alle: funksjonene leser miljøet **ved utrulling**
— en ny variabel krever en ny deploy — og navnene er versalfølsomme. Alt
står i [`docs/nokler-og-tokens.md`](docs/nokler-og-tokens.md).

**En funksjon svarer rart.** Feilsvarene bærer `forsok`: hva som ble
prøvd, statuskode og tjenestens egen melding, uten nøkler og uten
adresser. Les det rett fra nettleseren:

```
/api/fotball/tabell?liga=eliteserien
```

**Innloggingen svarer ikke, og ingenting er endret.** Sjekk om
Supabase-prosjektet er pauset — gratisnivået pauser etter en periode uten
aktivitet, og da dør innloggingen stille framfor med en feilmelding som
peker noe sted. Start det igjen fra Supabase-panelet.
*Uverifisert:* grensen er ikke bekreftet mot Supabases egne vilkår, og den
har endret seg før. Bekreft den, så hører den hjemme i nøkkelboka med
dato.

**Deployen stoppet på hemmelighetsskanning.** En miljøvariabel er satt til
noe som finnes som tekst i repoet. `netlify.toml` holder `docs/` og
`test/` utenfor skanningen, men fiksen er en lang tilfeldig verdi. Det
skjedde 13. september 2026 med `PIN_PEPPER`.

## Veien videre i repoet

| Hvor | Hva |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglene som gjelder nå. Start her. |
| [`docs/adr/`](docs/adr/README.md) | Hvorfor de gjelder — én fil per beslutning |
| [`docs/kampdag-flyt.md`](docs/kampdag-flyt.md) | Kampdagen fra trykket på kortet til admin, med bilder |
| [`docs/hendelser.md`](docs/hendelser.md) | Hva som gikk galt, og hva som faktisk var årsaken |
| [`docs/testing.md`](docs/testing.md) | De tre testreglene og fellene i testrammen |
| [`docs/nokler-og-tokens.md`](docs/nokler-og-tokens.md) | Hver hemmelighet: hvor den settes, hva som svikter uten |
| [`docs/oppsett.sql`](docs/oppsett.sql) | All SQL Supabase trenger, trygg å kjøre om igjen |
| [`BACKLOGG.md`](BACKLOGG.md) | Peker til issues, som er den ekte backloggen |

## Tre ting som har kostet tid her

**Tallene i testene telles av testene selv.** Legger du til seks tester og
tallet står stille, kjørte de ikke.

**Sjekk at en ny test kan feile.** Ødelegg linja den beskytter og se den
slå ut. To tester har passert av feil grunn i dette prosjektet.

**En stubb skal modellere det endepunktet faktisk sender**, ikke det du
tror det sender. En stubb skrevet ut fra samme tankefeil som koden
bekrefter feilen framfor å avsløre den — det skjulte en feil i tre dager
og gjennom 412 tester.
