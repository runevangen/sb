# Nøkler, tokens og hemmeligheter

Alt appen trenger av hemmeligheter, hvor de settes, hva som skjer når de
mangler, og hvordan de fornyes. Skrevet fordi dette er den ene typen
kunnskap som ikke står i koden: koden leser `process.env.X`, men ikke
hvorfor X finnes, hvor den kommer fra, eller hva som ryker når den går ut.

Ingenting her er hemmelig i seg selv. Navnene står i koden fra før — det
er *verdiene* som aldri skal inn i et repo, en chat eller et skjermbilde.

## Kortversjonen

| Variabel | Trengs for | Uten den | Hvor den lages |
| --- | --- | --- | --- |
| `API_FOOTBALL_KEY` | tabell, resultater, terminliste | hele fotballfanen svarer 503 | dashboard.api-football.com |
| `THESPORTSDB_KEY` | årets sesong (2025→) i fotballfanen | faller tilbake til fjorårets data fra API-Football | thesportsdb.com (Patreon) |
| `ADMIN_PASSORD` | innlogging i adminportalen | portalen svarer 503, ingen kan logge inn | du finner den på selv |
| `GITHUB_TOKEN` | lagring fra adminportalen | portalen svarer 503 | github.com → fine-grained PAT |
| `MET_KONTAKT` | valgfri kontaktadresse til MET | ingenting — været virker uansett | din egen e-post |
| `GITHUB_REPO` | valgfri: hvilket repo admin skriver til | `runevangen/sb` | — |
| `GITHUB_BRANCH` | valgfri: hvilken gren | `main` | — |

Alle settes samme sted: **Netlify → prosjektet `mvp-sb` → Site
configuration → Environment variables**.

## To ting som har kostet tid før, og vil gjøre det igjen

**1. Funksjonene leser miljøet ved utrulling.** En variabel du setter nå,
finnes ikke for funksjonen som kjører nå. Etter *hver* endring i
Environment variables: **Deploys → Trigger deploy → Deploy site**. En
deploy tømmer også kant-cachen, som ellers holder forrige svar i inntil
tre timer.

**2. Miljøvariabler er versalfølsomme.** `api_football_key` og
`API_FOOTBALL_KEY` er to forskjellige variabler for Linux. Fotball­funksjonen
godtar begge skrivemåtene med vilje (`NOKKELNAVN` i
`netlify/functions/fotball.mjs`), fordi denne feilen allerede har skjedd.
De andre godtar bare den ene formen som står i tabellen over.

## Hver enkelt

### `API_FOOTBALL_KEY` — API-Football

Hele fotballfanen står på denne.

- **Leses av:** `netlify/functions/fotball.mjs`
- **Sendes som:** headeren `x-apisports-key` til `v3.football.api-sports.io`
- **Alternativt navn:** `api_football_key` (begge leses)
- **Når den mangler:** funksjonen svarer `503 {"feil":"Tjenesten mangler API-nokkel"}`, og fanen viser meldingen. Feilsvar caches aldri (`no-store`), så det løsner i samme øyeblikk nøkkelen er på plass og deployet er kjørt.
- **Lages på:** https://dashboard.api-football.com → *Profile* → *API Key*
- **Utløper:** nei, men den roteres hvis du bytter plan eller trykker regenerate

**Kvoten er det som faktisk kan svi:** gratisnivået gir **100 kall i
døgnet**. Nøkkelen forlater aldri funksjonen, så det er *vår* cache som
avgjør forbruket. Levetidene står i `LEVETID` i `fotball-data.js`:

```
tabell      3 timer   →  8 kall/døgn
resultater  1 time    → 24 kall/døgn
neste       6 timer   →  4 kall/døgn
                        36 kall/døgn per liga
```

To ligaer = 72 kall. En tredje liga sprenger kvoten, og `unit.mjs` slår ut
på det før du rekker å deploye (`kallPerDogn`). Skal du legge til en liga,
må en levetid opp først.

Gratisnivået dekker dessuten bare sesongene i `SESONGVINDU` (nå 2022–2024)
og svarer «season, try from 2022 to 2024» på alt utenfor. Det er hele
grunnen til at TheSportsDB finnes i bildet.

### `THESPORTSDB_KEY` — TheSportsDB

Gir årets sesong. Uten den er ikke fotballfanen død — den viser fjorårets
tall fra API-Football, med sesongen tydelig merket over tabellen.

- **Leses av:** `netlify/functions/fotball.mjs`
- **Sendes som:** to måter, fordi vi ikke vet hvilken utgave nøkkelen er for. Først v2 (`/api/v2/json/`, nøkkelen i headeren `X-API-KEY`), så v1 (nøkkelen i selve adressen). Patreon gir begge.
- **Uten den:** testnøkkelen `3` brukes. Den virker, men **kapper svarene** — fem tabellrader og én kamp i listene. Et avkortet svar vises aldri som årets: `TSDB_MINST` i `fotball-data.js` er grensen for hva som regnes som helt, og under den faller vi tilbake til API-Football.
- **Lages på:** https://www.thesportsdb.com → Patreon-abonnement (rundt to euro i måneden)

**Denne ene bryteren åpner fire ting samtidig:** full tabell, hele runder,
og dermed også deling av kamp og vær ved avspark — som bare finnes på
årets kommende kamper.

**Feilsøking uten å grave i logger:** åpne
`https://mvp-sb.netlify.app/api/fotball/tabell?liga=eliteserien` i
nettleseren. Svaret bærer `kilde` (hvor dataene kom fra) og `forsok`: hva
som ble prøvd, statuskode, tjenestens egen feilmelding, antall rader og
utfall — uten nøkkel og uten adresser. Da nøkkelen ble satt 11. september
2026, feilet første forsøk fordi den var limt inn med ett siffer for lite.
`forsok` viste 400 fra begge utgavene, og det var det som pekte på
nøkkelen framfor koden. Uten `forsok` hadde det vært en kveld i
funksjonsloggen.

### `ADMIN_PASSORD` — adminportalen

Passordet til `/admin.html`. Ikke en konto, ikke en bruker — ett passord
for den som fører inn hvilke puber som viser hvilke kamper.

- **Leses av:** `netlify/functions/visninger.mjs`
- **Sjekkes:** i konstant tid (`likeStrenger`), så svartiden ikke røper hvor mange tegn som stemte
- **Verdi:** finn på noe langt. Det gjenbrukes ikke mot noe annet, så det kan gjerne være tre tilfeldige ord og noen tall.
- **Roteres:** bare bytt verdien i Netlify og deploy. Ingen andre steder å oppdatere. En åpen adminfane blir da avvist ved neste lagring, og portalen ber om ny innlogging.

Passordet når aldri GitHub: er det feil, svarer funksjonen 401 før den har
rørt tokenet.

### `GITHUB_TOKEN` — adminportalens lagring

Lagring i portalen er en commit. Tokenet er det som får lov til å skrive.

- **Leses av:** `netlify/functions/visninger.mjs`
- **Sendes som:** `Authorization: Bearer <token>` til api.github.com
- **Verdien er:** selve tokenstrengen, alene. Ikke `Bearer …`, ikke anførselstegn, ikke `GITHUB_TOKEN=…`. Funksjonen setter `Bearer ` på selv. Ingen mellomrom eller linjeskift foran eller bak — Netlify trimmer ikke, og et usynlig mellomrom gir 401 uten at noe annet ser galt ut.

**Slik lages det:**

1. https://github.com/settings/personal-access-tokens/new
2. **Token name:** `sportsbibelen-visninger`
3. **Expiration:** 90 dager. Ikke *No expiration*.
4. **Resource owner:** kontoen som eier repoet
5. **Repository access:** *Only select repositories* → **runevangen/sb**. Bare den ene.
6. **Permissions → Repository permissions → Contents: Read and write**. Alt annet *No access*. (*Metadata: Read-only* setter GitHub på selv — obligatorisk, og greit.)
7. **Generate token**, kopier strengen. GitHub viser den én gang.

`Contents` må være **read and write**, ikke bare write: funksjonen leser
fila først for å få `sha`-en, og et PUT uten den avvises.

**Sjekk tokenet før du limer det inn** — ett kall, ingen skriving:

```
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer DITT_TOKEN" \
  https://api.github.com/repos/runevangen/sb/contents/visninger.js
```

`200` = tokenet leser repoet. `401` = feil eller utløpt token. `404` =
repoet er som regel ikke med under *Only select repositories*.

**Når det utløper** (og det gjør det, om 90 dager): lagring i portalen
svarer `502 Fikk ikke lagret: HTTP 401`. Innloggingen virker fortsatt —
den rører bare passordet. Lag nytt token, bytt verdien i Netlify, deploy.

### `MET_KONTAKT` — været (valgfri)

MET Norway krever ingen nøkkel, men de krever at den som spør sier hvem
hen er. Det gjør vi allerede: `sportsbibelen-app/1.0
https://mvp-sb.netlify.app` som User-Agent. `MET_KONTAKT` legger en
kontaktadresse bak den, om MET en dag vil ha noen å ringe.

- **Leses av:** `netlify/functions/vaer.mjs`
- **Uten den:** ingenting skjer. Været virker.
- **Lisensen (CC BY 4.0) krever kreditering** — «Vær: MET Norway» står i stempelet under kampene. Den linja er ikke pynt, og skal ikke fjernes.

### `GITHUB_REPO` og `GITHUB_BRANCH` (valgfrie)

Settes ikke i dag. De finnes for at adminportalen skal kunne skrive til et
annet repo eller en annen gren uten en kodeendring — nyttig hvis du vil
teste lagringen mot en blindvei. Standard er `runevangen/sb` og `main`.

## Tjenester uten nøkkel

Verdt å vite at de finnes, for de kan svikte selv om alle nøkler er på
plass:

- **WordPress REST** (sakene) — via proxy i `netlify.toml`, ingen nøkkel. Reglene er bevisst smale: kun `/posts` og `/categories`, aldri wildcard mot `wp/v2`, som ville åpnet en vei inn til `/users` og dermed brukernavn.
- **MET Norway** (været) — ingen nøkkel, men User-Agent er påkrevd. Uten den svarer MET 403.
- **Overpass** (puber fra OpenStreetMap) — ingen nøkkel, men fair use. Vi cacher et døgn per arena og spør fire speil samtidig (`OVERPASS_SPEIL` i `pub-data.js`). Kallene må bære `Accept: application/json`; uten den svarer hovedtjeneren 406 med en HTML-feilside. Lisensen (ODbL) krever «© OpenStreetMap-bidragsytere» der pubene vises.
- **Entur** (holdeplasser) — ingen nøkkel, men headeren `ET-Client-Name: sportsbibelen-app` er påkrevd.

Det er verdt å merke seg at *ingen* av disse fire kan feile på grunn av en
nøkkel. Feiler de, er det nettverk, form på svaret, eller at vi ba stygt.

## Rutiner

**Når noe er galt, spør endepunktet først.** Alle tre funksjonene svarer
med diagnose i klartekst, uten hemmeligheter:

```
https://mvp-sb.netlify.app/api/visninger                    → {"klar":true,"mangler":[]}
https://mvp-sb.netlify.app/api/fotball/tabell?liga=eliteserien → kilde + forsok
https://mvp-sb.netlify.app/api/vaer?arena=Ullevaal Stadion&naar=<iso> → forsok ved feil
```

Det er raskere enn funksjonsloggen, og det kan sendes videre til noen
andre uten at noe lekker.

**Når en nøkkel roteres**, i denne rekkefølgen:

1. Lag den nye før du sletter den gamle — appen står nede i mellomtiden ellers
2. Bytt verdien i Netlify → Environment variables
3. **Trigger deploy** (ellers skjer ingenting)
4. Sjekk endepunktet over
5. Først da: slett den gamle hos utstederen

**Hva som aldri skal skje:**

- En nøkkel i repoet. Testene bruker oppdiktede verdier (`test/funksjon.mjs` setter `process.env` selv), og ingen test krever en ekte nøkkel eller nettverk.
- En nøkkel i nettleseren. Derfor er fotball og vær *funksjoner* og ikke redirects: en redirect kan ikke sette en hemmelig header. `funksjon.mjs` har en egen test på at API-nøkkelen går til API-et og ikke til leseren.
- En nøkkel i et feilsvar. `forsok`-feltene er skrevet for å kunne leses av hvem som helst: status, tjenestens egen melding, antall, utfall — aldri nøkkel, aldri full adresse.

**Kalender:** sett en påminnelse 80 dager fram når du lager
`GITHUB_TOKEN`. Det er den eneste hemmeligheten her som dør av seg selv.
