# Nøkler, tokens og hemmeligheter

Alt appen trenger av hemmeligheter: hvor de settes, hva som svikter uten
dem, hva du ser når de går ut, og hvordan de fornyes. Skrevet fordi dette
er den ene typen kunnskap som ikke står i koden — koden leser
`process.env.X`, men ikke hvorfor X finnes, hvor verdien kommer fra, eller
hva som ryker når den dør.

Ingenting her er hemmelig i seg selv. Navnene står i koden fra før; det er
*verdiene* som aldri skal inn i et repo, en chat eller et skjermbilde.

## Kortversjonen

| Variabel | Trengs for | Uten den | Utløper? |
| --- | --- | --- | --- |
| `API_FOOTBALL_KEY` | tabell, resultater, terminliste | hele fotballfanen svarer 503 | nei |
| `THESPORTSDB_KEY` | årets sesong i fotballfanen | faller tilbake til fjorårets tall | med abonnementet |
| `ADMIN_PASSORD` | innlogging i adminportalen | portalen svarer 503 | nei |
| `GITHUB_TOKEN` | lagring fra adminportalen | portalen svarer 503 | **ja — 90 dager** |
| `SUPABASE_URL` | innlogging i appen | innloggingen svarer 503 | nei |
| `SUPABASE_ANON_KEY` | innlogging i appen | innloggingen svarer 503 | ved rotering |
| `MET_KONTAKT` | valgfri kontaktadresse til MET | ingenting; været virker | nei |
| `GITHUB_REPO` | valgfri: hvilket repo admin skriver til | `runevangen/sb` | — |
| `GITHUB_BRANCH` | valgfri: hvilken gren | `main` | — |

Alle settes samme sted: **Netlify → prosjektet `mvp-sb` → Site
configuration → Environment variables**.

Bare én av dem dør av seg selv. Det er `GITHUB_TOKEN`, og avsnittet om
hva som skjer den dagen står lenger nede.

## De to fellene som allerede har kostet tid

**1. Funksjonene leser miljøet ved utrulling.** En variabel du setter nå,
finnes ikke for funksjonen som kjører nå. Etter *hver* endring i
Environment variables: **Deploys → Trigger deploy → Deploy site**. En
deploy tømmer også kant-cachen, som ellers holder forrige svar.

**2. Miljøvariabler er versalfølsomme.** `api_football_key` og
`API_FOOTBALL_KEY` er to forskjellige variabler for Linux.
Fotballfunksjonen godtar begge skrivemåtene med vilje (`NOKKELNAVN` i
`netlify/functions/fotball.mjs`), fordi akkurat denne feilen har skjedd.
De andre godtar bare formen som står i tabellen over.

## Hver enkelt

### `API_FOOTBALL_KEY` — API-Football

Hele fotballfanen står på denne.

- **Leses av:** `netlify/functions/fotball.mjs`
- **Sendes som:** headeren `x-apisports-key` til `v3.football.api-sports.io`
- **Alternativt navn:** `api_football_key` — begge leses
- **Uten den:** `503 {"feil":"Tjenesten mangler API-nokkel"}`, og fanen viser meldingen. Feilsvar caches aldri, så det løsner i samme øyeblikk nøkkelen er på plass og deployet er kjørt.
- **Lages på:** https://dashboard.api-football.com → *Profile* → *API Key*
- **Utløper:** nei. Den roteres bare om du bytter plan eller trykker regenerate.

**Kvoten er det som faktisk kan svi:** gratisnivået gir **100 kall i
døgnet**. Nøkkelen forlater aldri funksjonen, så det er vår egen cache som
avgjør forbruket. Levetidene står i `LEVETID` i `fotball-data.js`:

```
tabell      3 timer   →  8 kall/døgn
resultater  1 time    → 24 kall/døgn
neste       6 timer   →  4 kall/døgn
                        36 kall/døgn per liga
```

To ligaer = 72 kall. En tredje sprenger kvoten, og `unit.mjs` slår ut på
det (`kallPerDogn`) før du rekker å deploye. Skal du legge til en liga, må
en levetid opp først.

Gratisnivået dekker dessuten bare sesongene i `SESONGVINDU` (nå 2022–2024)
og svarer «season, try from 2022 to 2024» på alt utenfor. Det er hele
grunnen til at TheSportsDB finnes i bildet.

### `THESPORTSDB_KEY` — TheSportsDB

Gir årets sesong. Uten den er ikke fotballfanen død — den viser fjorårets
tall fra API-Football, med sesongen tydelig merket over tabellen.

- **Leses av:** `netlify/functions/fotball.mjs`
- **Sendes som:** to måter, fordi vi ikke vet hvilken utgave nøkkelen er for. Først v2 (`/api/v2/json/`, nøkkelen i headeren `X-API-KEY`), så v1 (nøkkelen i selve adressen). Patreon gir begge.
- **Uten den:** testnøkkelen `3` brukes. Den virker, men **kapper svarene** — fem tabellrader, én kamp i listene. Et avkortet svar vises aldri som årets: `TSDB_MINST` i `fotball-data.js` (`{tabell: 10, resultater: 2, neste: 2}`) er grensen for hva som regnes som helt, og under den faller vi tilbake til API-Football.
- **Lages på:** thesportsdb.com → Patreon-abonnement
- **Utløper:** når abonnementet gjør det. Symptomet er ikke en feilmelding, men at tabellen stille går tilbake til fjoråret — se symptomtabellen nedenfor.

**Denne ene bryteren åpner fire ting samtidig:** full tabell, hele runder,
og dermed også deling av kamp og vær ved avspark, som bare finnes på
årets kommende kamper.

**Feilsøking uten å grave i logger:** åpne
`https://mvp-sb.netlify.app/api/fotball/tabell?liga=eliteserien`. Svaret
bærer `kilde` (hvor dataene kom fra) og `forsok`: hva som ble prøvd,
statuskode, tjenestens egen feilmelding, antall rader og utfall — uten
nøkkel og uten adresser. Da nøkkelen ble satt 11. september 2026, feilet
første forsøk fordi den var limt inn med ett siffer for lite. `forsok`
viste 400 fra begge utgavene, og det var det som pekte på nøkkelen framfor
koden.

### `ADMIN_PASSORD` — adminportalen

Ett passord for den som fører inn hvilke puber som viser hvilke kamper.
Ikke en konto, ikke en bruker.

- **Leses av:** `netlify/functions/visninger.mjs`
- **Sjekkes:** i konstant tid (`likeStrenger`), så svartiden ikke røper hvor mange tegn som stemte
- **Verdi:** finn på noe langt. Det gjenbrukes ikke mot noe annet, så tre tilfeldige ord og noen tall holder fint.
- **Roteres:** bytt verdien i Netlify, deploy. Ingen andre steder å oppdatere. En åpen adminfane blir avvist ved neste lagring og ber om ny innlogging.

Passordet når aldri GitHub: er det feil, svarer funksjonen 401 før den har
rørt tokenet.

### `SUPABASE_URL` og `SUPABASE_ANON_KEY` — innlogging i appen

Innloggingen i menyen: leseren skriver e-postadressen sin, får en
engangskode, og er logget inn. Supabase Auth gjør jobben — utsteder
koden, sender e-posten og gir ut økten.

- **Leses av:** `netlify/functions/konto.mjs`
- **Sendes som:** headeren `apikey` til `<SUPABASE_URL>/auth/v1/…`
- **Uten dem:** `503`, og appen sier hvilken som mangler allerede når
  panelet åpnes (`GET /api/konto` spør bare om oppsettet)
- **Lages på:** https://supabase.com → prosjektet → *Project Settings* →
  *API*. `SUPABASE_URL` er *Project URL*, `SUPABASE_ANON_KEY` er den
  offentlige *anon*-nøkkelen — **ikke** `service_role`, som kan lese alt.
- **Utløper:** ikke av seg selv. Roterer du nøkkelen i Supabase, må
  verdien byttes her og deployes.

Hvorfor kallet går fra funksjonen og ikke fra nettleseren, når
anon-nøkkelen tåler å være offentlig: da snakker appen bare med sitt eget
domene. Ingen tredjepartsskript i `index.html`, ingen informasjonskapsel
fra noen andre, og ingenting å gjøre om Supabase en dag bytter SDK. Det
er samme regel som for API-Football, av en annen grunn.

**Dette er første gang appen lagrer noe om en person.** Adressen ligger
hos Supabase, økten ligger i leserens egen `localStorage`, og ingenting
ligger hos oss. Velg region i Supabase bevisst (EU), og husk at en
personvernerklæring og en måte å be om sletting på hører til her — det er
ikke kode, men det hører til denne nøkkelen.

#### Tabellen «kampsvar» — hvem blir med

Innloggingen alene trenger ingen tabell. «Jeg blir med» gjør det, og den
lages én gang med SQL-en under (Supabase → *SQL Editor*). Til den finnes,
svarer `/api/svar` 503 og sier nøyaktig det.

```sql
create table kampsvar (
  id        uuid primary key default gen_random_uuid(),
  kamp_id   text not null,
  bruker    uuid not null default auth.uid()
            references auth.users (id) on delete cascade,
  navn      text not null check (char_length(navn) between 1 and 24),
  hvor      text check (hvor in ('hjemme', 'pub', 'stadion')),
  sted      text check (char_length(sted) <= 60),
  opprettet timestamptz not null default now(),
  unique (kamp_id, bruker)
);

alter table kampsvar enable row level security;

-- Alle kan se hvem som blir med: appen skal kunne leses uten konto.
create policy "les for alle" on kampsvar
  for select using (true);

-- Skrive kan du bare i ditt eget navn. `bruker` settes av databasen fra
-- økten, og funksjonen sender den aldri selv.
create policy "skriv eget svar" on kampsvar
  for insert to authenticated with check (bruker = auth.uid());
create policy "endre eget svar" on kampsvar
  for update to authenticated using (bruker = auth.uid())
  with check (bruker = auth.uid());
create policy "slett eget svar" on kampsvar
  for delete to authenticated using (bruker = auth.uid());
```

`unique (kamp_id, bruker)` er det som gjør at to «jeg blir med» på samme
kamp er én person og ikke to: funksjonen skriver som en upsert.

**Navnet i `navn` er synlig for alle** som åpner den kampen i appen —
det er prisen for at lista kan leses uten konto. E-postadressen er det
ikke; den ligger bare i `auth.users`. Derfor er feltet «navnet vennene
ser», ikke adressen, og fornavn holder.

Tabellen kan ikke leses eller skrives med `service_role`-nøkkelen fra
denne koden, for den nøkkelen finnes ikke her. Det er med vilje: da kan
heller ikke en feil i funksjonen skrive i en annens navn.

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
6. **Permissions → Repository permissions → Contents: Read and write.** Alt annet *No access*. (*Metadata: Read-only* setter GitHub på selv — obligatorisk, og greit.)
7. **Generate token**, kopier strengen. GitHub viser den én gang.

`Contents` må være **read and write**, ikke bare write: funksjonen leser
fila først for å få `sha`-en, og et PUT uten den avvises.

**Sjekk tokenet før du limer det inn** — ett kall, ingen skriving:

```
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer DITT_TOKEN" \
  https://api.github.com/repos/runevangen/sb/contents/visninger.js
```

`200` = tokenet leser repoet. `401` = feil eller utløpt. `404` = repoet er
som regel ikke med under *Only select repositories*.

## Når `GITHUB_TOKEN` utløper

Det skjer om 90 dager, og det er verdt å vite nøyaktig hvordan det ser ut,
for symptomet peker ikke på tokenet av seg selv.

**Hva som fortsatt virker:**

- **Leserne merker ingenting.** `visninger.js` ligger i koden og er allerede utrullet. Pubene som er ført inn, blir stående på kampene sine. Ingenting forsvinner.
- **Innloggingen i portalen virker.** Den rører bare passordet.
- **Kampene lastes.** De kommer fra API-Football, ikke fra GitHub.
- **`/api/visninger` svarer fortsatt `{"klar":true,"mangler":[]}`.** Dette er den viktige finten: oppsettsjekken ser bare at variabelen *er satt*, ikke at verdien *virker*. Et utløpt token er satt. «Klar» betyr «begge hemmelighetene finnes», ikke «alt fungerer».

**Hva som ryker:** bare lagringen, og den ryker på lesesteget.

Funksjonen leser `visninger.js` fra GitHub før den skriver — den trenger
`sha`-en. Derfor er meldingen du får *ikke* «Fikk ikke lagret», men:

```
502 — Fikk ikke lest visninger.js: HTTP 401
```

Det står i den røde meldingen under Lagre-knappen, i klartekst.
`HTTP 401` fra GitHub betyr utløpt eller trukket token. Ser du `HTTP 404`
i stedet, er tokenet gyldig, men repoet er ikke med i tokenets utvalg.
`HTTP 403` betyr som regel at `Contents`-rettigheten mangler.

Meldingen «Fikk ikke lagret: …» kommer fra skrivesteget, og betyr at
lesingen gikk bra — altså at tokenet lever, men noe annet skar seg (som
regel `409`: fila ble endret av noen andre mellom lesing og skriving).
De to meldingene skiller altså mellom «tokenet er dødt» og «tokenet lever,
men». `test/funksjon.mjs` dekker begge veier.

**GitHub varsler på e-post sju dager før utløp.** Det er den eneste
forvarselen du får — Netlify vet ingenting om at tokenet dør.

**Fornyelsen:** lag et nytt token (samme oppskrift som over), bytt verdien
i Netlify, **trigger deploy**, og lagre noe i portalen for å se at det tok.
Gammelt token kan slettes etterpå.

### `MET_KONTAKT` — været (valgfri)

MET Norway krever ingen nøkkel, men krever at den som spør sier hvem hen
er. Det gjør vi allerede: `sportsbibelen-app/1.0
https://mvp-sb.netlify.app` som User-Agent. `MET_KONTAKT` legger en
kontaktadresse bak den, om MET en dag vil ha noen å ringe.

- **Leses av:** `netlify/functions/vaer.mjs`
- **Uten den:** ingenting skjer. Været virker.
- **Lisensen (CC BY 4.0) krever kreditering.** «Vær: MET Norway» står i stempelet under kampene. Den linja er ikke pynt, og skal ikke fjernes.

### `GITHUB_REPO` og `GITHUB_BRANCH` (valgfrie)

Settes ikke i dag. De finnes for at adminportalen skal kunne skrive til et
annet repo eller en annen gren uten en kodeendring — nyttig om du vil teste
lagringen mot en blindvei. Standard er `runevangen/sb` og `main`.

## Symptom → årsak

Det du ser først, og hva det som regel betyr.

| Det du ser | Sannsynlig årsak | Fiks |
| --- | --- | --- |
| Fotballfanen: «Tjenesten mangler API-nokkel» | `API_FOOTBALL_KEY` ikke satt, feilstavet, eller deploy ikke kjørt | sett den, trigger deploy |
| Portalen: «Portalen er ikke satt opp: X mangler» | X ikke satt i Netlify | sett X, trigger deploy |
| Portalen: «Feil passord» (401) | `ADMIN_PASSORD` er noe annet enn du tror | sjekk verdien i Netlify |
| Portalen: «Fikk ikke lest visninger.js: HTTP 401» | **tokenet er utløpt eller trukket** | nytt token, deploy |
| Portalen: «… HTTP 404» | repoet ikke med i tokenets *selected repositories* | rett tokenets utvalg |
| Portalen: «… HTTP 403» | tokenet mangler `Contents: read and write` | rett rettighetene |
| Portalen: «Fikk ikke lagret: HTTP 409» | fila endret mellom lesing og skriving | prøv igjen |
| Tabellen viser i fjor, uten feilmelding | `THESPORTSDB_KEY` mangler, er utløpt, eller svaret ble avkortet | se `forsok` på `/api/fotball/tabell` |
| Innlogging: «Innloggingen er ikke satt opp: X mangler» | X ikke satt i Netlify | sett X, trigger deploy |
| Innlogging: «Koden stemmer ikke, eller den er for gammel» | feil eller utløpt kode — samme svar med vilje | be om ny kode |
| Innlogging: «For mange forsøk» (429) | Supabase sperrer e-postsending en stund | vent et minutt |
| Innlogging: «Fikk ikke sendt koden» | se `forsok` i svaret fra `/api/konto` | som regel feil `SUPABASE_URL` |
| «Tabellen «kampsvar» finnes ikke i Supabase ennå» | SQL-en over er ikke kjørt | kjør den i Supabase → SQL Editor |
| «Jeg blir med»: «Økten gjelder ikke lenger» | utløpt økt, eller reglene slipper ikke skrivingen gjennom | logg inn på nytt; sjekk policyene |
| Ingen «blir med»-linje, men ingen feil heller | lista er et tillegg og feiler stille | se `/api/svar?kamper=<id>` i nettleseren |
| Pubene: «overpass-api.de svarte 406» | ikke en nøkkel — Overpass-tjeneren | som regel forbigående |
| Alt ser gammelt ut etter en endring | kant-cachen | trigger deploy tømmer den |

## Hvorfor en endring ikke slår gjennom med en gang

Tre lag mellom nøkkelen og leseren. Å vite hvilket som holder igjen sparer
mye leting.

1. **Funksjonen leser miljøet ved utrulling.** Ny variabel ⇒ ny deploy. Dette er det vanligste.
2. **Netlifys kant-cache.** Vellykkede svar får `Netlify-CDN-Cache-Control: public, durable, s-maxage=<levetid>, stale-while-revalidate=86400`. `durable` gir én delt cache for hele kanten i stedet for én per region — uten den ville døgnkvoten ganget seg opp med antall regioner leserne kommer fra. `stale-while-revalidate` betyr at et utgått svar kan vises mens et nytt hentes. En deploy tømmer cachen, og er den raskeste veien ut av et gammelt svar.
3. **Service workeren rører ikke dette.** `sw.js` hopper eksplisitt over `/api/` og `/wp-api/` (linje 51 og 56) og cacher bare skallet. Et gammelt API-svar er aldri service workerens feil.

Og **feilsvar caches aldri** (`Cache-Control: no-store`, `levetid = 0` i
alle tre funksjonene). Ellers ville et blaff låst seg fast i timevis. Det
betyr også at en feil du ser nå, er en feil som skjer nå.

## Hva testene og CI trenger: ingenting

Verdt å vite, for det betyr at en rød CI aldri skyldes en nøkkel.

- `test/funksjon.mjs` kaller Netlify-funksjonene direkte med et stubbet `fetch` og setter `process.env` selv, med oppdiktede verdier (`et-langt-adminpassord`, `ghp_hemmelig`). Ingen ekte nøkkel, ingen nettverk.
- Én test sjekker eksplisitt at **API-nøkkelen går til API-et og ikke til leseren**, og en annen at **tokenet ikke lekker ut i svaret til portalen**.
- `.github/workflows/test.yml` setter ingen secrets. Den eneste miljøvariabelen er `CHROME`, som peker på nettleseren.

Kjører testene grønt lokalt uten at du har en eneste nøkkel satt, er det
riktig — ikke et tegn på at noe er stubbet feil.

## Hvis en nøkkel lekker

Antar du at en verdi er kommet på avveie — limt i en chat, med i et
skjermbilde, pushet ved et uhell — er rekkefølgen:

1. **Trekk tilbake hos utstederen først.** GitHub: *Settings → Developer settings → Personal access tokens* → tokenet → *Revoke*. API-Football: regenerate i dashbordet. Det stopper misbruk med en gang, uavhengig av oss.
2. **Lag en ny, sett den i Netlify, trigger deploy.** Appen er nede i mellomtiden, og det er riktig prioritering.
3. **Er den pushet til git, hjelper det ikke å slette linja.** Verdien ligger i historikken og i alle klonene. Punkt 1 er hele fiksen; en ny commit er bare kosmetikk.
4. `ADMIN_PASSORD` har ingen utsteder — bytt verdien, deploy, ferdig.

Repoet har en `.gitignore` som holder `.env` og `.env.*` ute. Den er den
eneste tekniske sperren mot en nøkkel i git, så ikke lag unntak i den.

## Når du legger til en ny nøkkel

Sjekklista, i rekkefølge:

1. Les den i funksjonen — aldri i nettleseren. Skal den til en tredjepart som krever en hemmelig header, må kallet gå fra en Netlify Function, ikke en redirect i `netlify.toml`: en redirect kan ikke sette en hemmelig header.
2. Svar tydelig når den mangler — 503 med en melding som **navngir variabelen**, slik `visninger.mjs` gjør. «Tjenesten er ikke satt opp» alene sender neste person til å lete i koden etter noe som står i Netlify-panelet.
3. Legg den i `test/funksjon.mjs` med en oppdiktet verdi, og test at den *ikke* havner i svaret til leseren.
4. Sett den i Netlify, huk av *Contains secret value*, **trigger deploy**.
5. Skriv den inn i tabellen øverst i dette dokumentet.

## Rutiner

**Når noe er galt, spør endepunktet før du åpner funksjonsloggen.** Alle
tre svarer med diagnose i klartekst, uten hemmeligheter, så svaret kan
sendes videre til hvem som helst:

```
/api/visninger                        → {"klar":true,"mangler":[]}
/api/fotball/tabell?liga=eliteserien  → kilde + forsok
/api/vaer?arena=<navn>&naar=<iso>     → forsok ved feil
```

Husk hva `klar: true` betyr og ikke betyr: begge variablene finnes. Om
tokenet bak dem lever, sier den ingenting om.

**Når en nøkkel roteres:**

1. Lag den nye før du sletter den gamle — ellers står appen nede i mellomtiden
2. Bytt verdien i Netlify → Environment variables
3. **Trigger deploy** (ellers skjer ingenting)
4. Sjekk endepunktet over, eller lagre noe i portalen
5. Først da: slett den gamle hos utstederen

**Tre ting som aldri skal skje:**

- En nøkkel i repoet. Testene bruker oppdiktede verdier, og ingen test krever en ekte nøkkel eller nettverk.
- En nøkkel i nettleseren. Derfor er fotball og vær *funksjoner* og ikke redirects.
- En nøkkel i et feilsvar. `forsok`-feltene er skrevet for å kunne leses av hvem som helst: status, tjenestens egen melding, antall, utfall — aldri nøkkel, aldri full adresse.

**Kalender:** sett en påminnelse 80 dager fram når du lager
`GITHUB_TOKEN`. GitHub varsler sju dager før, men det varselet kommer på
e-post og er lett å overse — og symptomet, `HTTP 401` på lesing, peker
ikke på en kalender.
