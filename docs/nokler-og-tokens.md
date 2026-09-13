# Nøkler, tokens og hemmeligheter

Alt appen trenger av hemmeligheter: hvor de settes, hva som svikter uten
dem, hva du ser når de går ut, og hvordan de fornyes. Skrevet fordi dette
er den ene typen kunnskap som ikke står i koden — koden leser
`process.env.X`, men ikke hvorfor X finnes, hvor verdien kommer fra, eller
hva som ryker når den dør.

Ingenting her er hemmelig i seg selv. Navnene står i koden fra før; det er
*verdiene* som aldri skal inn i et repo, en chat eller et skjermbilde.

**Skal du sette opp Supabase fra bunnen:** all SQL-en står samlet og i
rekkefølge i [`oppsett.sql`](oppsett.sql) — lim hele fila inn i Supabase →
*SQL Editor* → *Run*. Den kan kjøres flere ganger. Forklaringen på hvorfor
hver bit finnes står her.

## Direktelenker til panelene

Å navigere Supabase og Netlify på mobil er tungt. Disse går rett dit.
`_` i Supabase-adressene betyr «prosjektet du sist var i», så de virker
uten at prosjekt-ID-en står i repoet — der hører den ikke hjemme.

| Dit du skal | Lenke |
| --- | --- |
| SQL-en, klar til å limes inn | https://raw.githubusercontent.com/runevangen/sb/main/docs/oppsett.sql |
| Supabase → SQL Editor, nytt spørsmål | https://supabase.com/dashboard/project/_/sql/new |
| Supabase → slå av «Confirm email» | https://supabase.com/dashboard/project/_/auth/providers |
| Supabase → nøklene (`anon` og `service_role`) | https://supabase.com/dashboard/project/_/settings/api |
| Supabase → brukerne, som de ser ut der | https://supabase.com/dashboard/project/_/auth/users |
| Netlify → miljøvariabler | https://app.netlify.com/projects/mvp-sb/configuration/env |
| Netlify → Trigger deploy | https://app.netlify.com/projects/mvp-sb/deploys |
| Vår egen adminportal | https://mvp-sb.netlify.app/admin.html |

Treffer ikke Netlify-lenkene, bytt `projects` med `sites` i adressen:
Netlify døpte om den delen av panelet, og begge formene har vært i bruk.

## Kortversjonen

| Variabel | Trengs for | Uten den | Utløper? |
| --- | --- | --- | --- |
| `API_FOOTBALL_KEY` | tabell, resultater, terminliste | hele fotballfanen svarer 503 | nei |
| `THESPORTSDB_KEY` | årets sesong i fotballfanen | faller tilbake til fjorårets tall | med abonnementet |
| `ADMIN_PASSORD` | innlogging i adminportalen | portalen svarer 503 | nei |
| `GITHUB_TOKEN` | lagring fra adminportalen | portalen svarer 503 | **ja — 90 dager** |
| `SUPABASE_URL` | innlogging i appen | innloggingen svarer 503 | nei |
| `SUPABASE_ANON_KEY` | innlogging i appen | innloggingen svarer 503 | ved rotering |
| `PIN_PEPPER` | innlogging med fornavn og PIN | innloggingen svarer 503 | nei — **men kan ikke endres etterpå** |
| `SUPABASE_SERVICE_KEY` | brukerlista i adminportalen | portalen viser ingen brukere | ved rotering — **og den kan alt** |
| *(Resend API-nøkkel)* | **parkert**: e-posten med engangskoden | ingenting i dag; appen sender ingen e-post | nei — settes i Supabase, ikke i Netlify |
| `MET_KONTAKT` | valgfri kontaktadresse til MET | ingenting; været virker | nei |
| `GITHUB_REPO` | valgfri: hvilket repo admin skriver til | `runevangen/sb` | — |
| `GITHUB_BRANCH` | valgfri: hvilken gren | `main` | — |

Alle settes samme sted: **Netlify → prosjektet `mvp-sb` → Site
configuration → Environment variables**.

Bare én av dem dør av seg selv. Det er `GITHUB_TOKEN`, og avsnittet om
hva som skjer den dagen står lenger nede.

## De fire fellene som allerede har kostet tid

**1. Funksjonene leser miljøet ved utrulling.** En variabel du setter nå,
finnes ikke for funksjonen som kjører nå. Etter *hver* endring i
Environment variables: **Deploys → Trigger deploy → Deploy site**. En
deploy tømmer også kant-cachen, som ellers holder forrige svar.

**2. En funksjon som ikke er merget, finnes ikke i prod.** `mvp-sb.netlify.app`
bygges fra `main`. Ligger funksjonen i en gren, svarer prod 404 uansett
hvor riktig miljøet er satt — og 404 ser ut som «ikke satt opp» for den
som feilsøker. Test mot forhåndsvisningen i stedet:
`https://deploy-preview-<nr>--mvp-sb.netlify.app/api/…`. Husk at også den
leste miljøet da den ble bygget: setter du en variabel etterpå, må
forhåndsvisningen bygges på nytt (*Deploys* → finn deployen → *Retry
deploy*).

**3. Miljøvariabler er versalfølsomme.** `api_football_key` og
`API_FOOTBALL_KEY` er to forskjellige variabler for Linux.
Fotballfunksjonen godtar begge skrivemåtene med vilje (`NOKKELNAVN` i
`netlify/functions/fotball.mjs`), fordi akkurat denne feilen har skjedd.
De andre godtar bare formen som står i tabellen over.

**4. `PIN_PEPPER` kan ikke endres etter at den første kontoen er laget.**
Passordet hos Supabase er avledet av pepperet, så et nytt pepper låser
alle ut på én gang — og det ser ut som om alle plutselig husker PIN-en
feil. Det finnes ingen vei tilbake annet enn å slette kontoene. Sett den
én gang, før noen logger inn.

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

Innloggingen i menyen: leseren skriver et **fornavn og en PIN**, og er
logget inn. Paret er kontoen. Supabase Auth gjør jobben — lagrer kontoen
og gir ut økten.

Engangskoden på e-post virker, men krever en avsender på et verifisert
domene, og domenet er ikke kjøpt ennå. Hele det oppsettet står parkert på
grenen `epost-innlogging` og er beskrevet nedenfor, så det kan hentes fram
uten å finnes på nytt.

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

**Dette er første gang appen lagrer noe om en person.** Fornavnet ligger
hos Supabase, økten ligger i leserens egen `localStorage`, og ingenting
ligger hos oss. Velg region i Supabase bevisst (EU), og husk at en
personvernerklæring og en måte å be om sletting på hører til her — det er
ikke kode, men det hører til denne nøkkelen.

### `PIN_PEPPER` — innlogging med fornavn og PIN

- **Leses av:** `netlify/functions/konto.mjs`
- **Brukes til:** passordet hos Supabase er PIN-en pluss dette pepperet
  (`pinPassord()` i `pin-data.js`)
- **Uten den:** `503`, og panelet sier at den mangler når det åpnes
- **Lages av:** deg. En lang, tilfeldig streng — `openssl rand -base64 32`
  eller hva som helst du ikke skal huske.

**Den kan ikke endres etter at den første kontoen er laget.** Passordet
hos tjenesten er avledet av pepperet, så et nytt pepper låser alle ut, og
det finnes ingen vei tilbake annet enn å slette kontoene. Sett den én
gang, før første innlogging.

Hvorfor et pepper i det hele tatt — to konkrete grunner:

1. **Fire siffer er 10 000 forsøk.** Uten pepperet kunne hvem som helst
   gjette dem rett mot Supabase sitt eget endepunkt, som ligger åpent.
   Med pepperet må gjettingen gjennom vår egen funksjon, på vårt eget
   domene.
2. **Supabase krever minst seks tegn i et passord.** En PIN på fire er
   kortere enn det og ville blitt avvist ved den første innloggingen — med
   en melding om passordlengde som ingen ville koblet til PIN-feltet.

Dette gjør ikke en PIN på fire siffer til et passord, og appen later ikke
som. Ingenting er låst bak innloggingen: det verste den som kommer seg inn
kan gjøre, er å skrive «jeg blir med» i en annens navn.

#### Det som må stilles i Supabase for PIN

Kontoen lagres som en e-postadresse hos Supabase, fordi det er det
Supabase Auth kjenner. Adressen lages av fornavnet:
`ola@pin.mvp-sb.netlify.app` (`PIN_DOMENE` i `pin-data.js`). **Ingen
e-post sendes noe sted** — adressen er en nøkkel, ikke en postkasse, og
den vises aldri i appen.

Derfor må to innstillinger stå riktig:

| Sted | Innstilling | Verdi |
| --- | --- | --- |
| *Authentication* → *Sign In / Providers* → Email | **Confirm email** | **av** |
| *Authentication* → *Sign In / Providers* → Email | Minimum password length | 6 (standard, og pepperet dekker den) |

Står *Confirm email* på, venter Supabase på at noen skal klikke i en
e-post som aldri kommer, og den første innloggingen svarer 200 uten økt.
Funksjonen kjenner igjen nøyaktig det og svarer 503 med en melding som
peker hit — framfor «uventet svar», som ikke hjelper noen.

**Fornavn er unike.** «Ola» er én konto. Prøver en annen Ola samme navn
med en annen PIN, får hen ««Ola» er tatt. Er PIN-en feil, eller skal du
velge et annet navn?» At navnet er tatt sier vi rett ut — et fornavn i en
vennegjeng er ingen hemmelighet, og alternativet er «feil PIN» på en PIN
som stemmer. Sletter noen kontoen sin, blir navnet ledig igjen.


### Parkert: engangskode på e-post

**Alt fra her til «Tabellen kampsvar» gjelder e-postinnloggingen, som
ikke er i bruk i dag.** Koden, malene, avsenderen og de fire fellene i
e-postoppsettet står
her fordi de kostet halvannen dag å finne, og fordi de skal hentes fram
igjen når avsenderdomenet er kjøpt. Selve koden ligger komplett på grenen
`epost-innlogging`:

```
git checkout epost-innlogging -- konto-data.js netlify/functions/konto.mjs app.js index.html
```

Rekkefølgen den dagen: kjøp domenet → verifiser i Resend → bytt *Sender
email* i Supabase → hent fram grenen → deploy.

#### Koden i e-posten krever egen SMTP

**Dette er fella i oppsettet, og den koster en time hvis man ikke vet
den.** Med Supabases innebygde e-posttjeneste er malene låst — panelet
sier «Set up custom SMTP to edit templates», og standardmalen sender en
*lenke* («Your sign-in link»), ikke en kode. Appen spør om seks siffer.
Får leseren bare en lenke, er det ingenting å skrive inn, og
innloggingen står fast.

Løsningen er en egen SMTP-avsender (Authentication → Emails → *Set up
SMTP*). Da låses malene opp, og flettefeltet `{{ .Token }}` kan legges
inn i **Magic Link** og i **Confirm signup** — den første brukes når
adressen har logget inn før, den andre aller første gang:

```html
<h2>Logg inn i Sportsbibelen</h2>
<p>Koden din er:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Den varer en liten stund.</p>
```

Står det `{{ .Token }}` bokstavelig i e-posten du får, er malen lagret
med feil skrivemåte — sjekk krøllparentesene, punktumet og stor T.

Egen SMTP trengs uansett før ekte lesere: den innebygde tjenesten er
strupet til noen få e-poster i timen og er ikke ment for produksjon.
Avsenderadressen bør ligge på et domene vi rår over.

#### Avsenderen — Resend, og hvorfor ikke Brevo

**Brevo ble prøvd først og forkastet.** Ikke på grunn av tjenesten, men
på grunn av registreringen: den krever verifisering med SMS til mobil, og
koden kom aldri fram 12. september 2026, etter flere forsøk. Mailjet og
Amazon SES har samme type krav. Det er verdt å vite før noen prøver
igjen — dette koster en dag, ikke en time.

Resend er valgt fordi registreringen går med e-post eller GitHub. Merk at
selskapet er amerikansk: e-postadressen passerer dit, mens resten av
persondataene ligger i EU-regionen i Supabase. Det er et bevisst
kompromiss, tatt fordi EU-alternativene ikke lot seg registrere.

**I Resend** (resend.com):

1. Lag en **API-nøkkel** (*API Keys*). Den begynner med `re_` og er
   passordet i SMTP-oppsettet.
2. Brukernavnet er bokstavelig `resend` — ikke adressen din.
3. Verifiser avsenderdomenet (*Domains*). Resend gir tre ferdige
   DNS-poster — DKIM, SPF og DMARC — som limes inn hos registraren.

**Domenet skal være ditt eget, ikke `sportsbibelen.no`.** Regelen om at
ingenting skal kreve endringer der gjelder også DNS. Et eget domene til
avsending koster en drøy hundrelapp i året, verifiseres én gang, og
dekker alle appene: `sportsbibelen@dittdomene.no`,
`neste-app@dittdomene.no`. Ny app blir en ny avsenderadresse, ikke et
nytt DNS-oppsett. Du trenger ikke e-posthotell — appen skal bare sende —
men sett opp gratis videresending hos registraren, så svar på en
innloggingskode havner et sted.

**`onboarding@resend.dev` leverer bare til deg selv.** Det er Resends
testavsender, og den er fin til å se at kjeden virker — men alle andre
som prøver å logge inn får `500: Error sending confirmation email`, og
det ser ut som en feil i appen. Sett i prod 12. september 2026: det var
nøyaktig det som skjedde da andre enn kontoeieren prøvde.

Når domenet er grønt i Resend, **må avsenderen byttes i Supabase også**
(*Authentication* → *Emails* → SMTP → *Sender email*), til for eksempel
`ikke-svar@dittdomene.no`. Verifiserer du domenet men lar avsenderen stå
på `onboarding@resend.dev`, endrer ingenting seg. Det er steget som
glemmes.

**I Supabase** (*Authentication* → *Emails* → *Set up SMTP*). Merk stien:
SMTP ligger sammen med malene, ikke under *Project Settings*. Panelet
flytter pa disse sidene fra tid til annen — leter du, er det siden med
*Subject* og *Body* du skal til:

| Felt | Verdi |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` — **sma bokstaver** |
| Password | API-nøkkelen (`re_…`) |
| Sender email | en adresse på det verifiserte domenet, eller `onboarding@resend.dev` |
| Sender name | `Sportsbibelen` |

Feltnavnene kan ha flyttet seg siden dette ble skrevet (12. september
2026); formen er den samme.

**Brukernavnet er versalfølsomt, og det kostet en ettermiddag.** Skrevet
som `Resend` — med stor R, slik en autoutfylling eller en vanlig
skrivemåte gjerne gir — avvises påloggingen hver gang, og det eneste
sporet er at ingenting dukker opp i Resend sin egen e-postlogg. Det er
samme felle som for miljøvariablene, i et felt man ikke tenker på som en
nøkkel. Står det `resend` og det fortsatt feiler, lim inn API-nøkkelen
på nytt: den er maskert, så en avkortet nøkkel ser helt riktig ut.

*Minimum interval per user* står som standard på 60 sekunder. Prøver du
igjen med en gang etter en retting, blir forsøket avvist av den grunnen
i stedet — og det ser ut som om rettingen ikke virket. Vent et minutt.

**To ting som følger med:**

- Malene låses opp i samme øyeblikk. Da — og først da — kan `{{ .Token }}`
  legges inn, som beskrevet over. Rekkefølgen er SMTP først, mal etterpå.
- Supabase har en egen grense for hvor mange e-poster som sendes per time
  (*Authentication* → *Rate Limits*). Den står lavt fra start og kan
  heves når SMTP er på plass. Treffer du «For mange forsøk» under
  testing, er det som regel den, ikke avsenderen.
- Skal e-posten bort fra innloggingen en gang, er det *Authentication* →
  *Sign In / Providers* som er stedet. Da slås Google på, og hele
  SMTP-oppsettet blir overflødig.

API-nøkkelen hører hjemme i Resend og i Supabase — ikke i Netlify og ikke
i dette repoet. Appen sender ingen e-post selv; den ber Supabase gjøre
det.

#### Gmail med app-passord — nødluka

Prøvd 12. september 2026 for å komme videre uten domene, og forkastet
igjen dagen etter: et eget domene løser det samme, permanent, for alle
appene. Står du fast uten domene, virker den — `smtp.gmail.com`, port
587, **hele e-postadressen** som brukernavn (motsatt av Resend), og et
app-passord fra `myaccount.google.com/apppasswords` uten mellomrom. Taket
er rundt 500 i døgnet, og app-utsending ligger i utkanten av Googles
vilkår, så det er en nødluke og ikke et oppsett.

### `SUPABASE_SERVICE_KEY` — brukerlista i adminportalen

**Dette er den ene nøkkelen i prosjektet som kan gjøre hva som helst med
hvem som helst, og at den finnes i det hele tatt er et bevisst brudd på
en regel som ellers gjelder overalt.**

Regelen er at ingen funksjon har en `service_role`-nøkkel: da kan heller
ikke en feil i `konto.mjs` eller `svar.mjs` skrive i en annens navn. Den
regelen står. Men å se andres kontoer, sette en annens PIN og slette en
annens konto *er* å handle på vegne av andre, og Supabase Auth har ingen
annen vei dit. En `security definer`-funksjon i databasen ville bare
flyttet den samme makta, med en hemmelighet i et SQL-argument i stedet.

Så nøkkelen ligger i **én fil**, `netlify/functions/brukere.mjs`. Den
importeres ikke noe sted, den deles ikke, og fila gjør ikke annet enn
dette. Hver eneste handling krever `ADMIN_PASSORD`, sammenliknet i
konstant tid — et feil passord når aldri Supabase.

- **Leses av:** `netlify/functions/brukere.mjs`, og ingen andre
- **Sendes som:** `apikey` og `Authorization: Bearer` til
  `<SUPABASE_URL>/auth/v1/admin/…`
- **Uten den:** `503`, og portalen sier hvilken som mangler
- **Lages på:** Supabase → *Project Settings* → *API* → `service_role`.
  Den står bak en «Reveal»-knapp, med en advarsel ved siden av. Advarselen
  stemmer.
- **Utløper:** ikke av seg selv, men roteres den i Supabase må verdien
  byttes her og deployes.

**De to nøklene ser like ut.** `SUPABASE_ANON_KEY` og
`SUPABASE_SERVICE_KEY` er begge lange JWT-er som begynner likt, og limer
du inn feil, svarer Supabase 401 på alt i portalen. Funksjonen kjenner
igjen nettopp den 401-en og sier «Står anon-nøkkelen i
SUPABASE_SERVICE_KEY? De to ser like ut.» framfor en generisk feil.

**Aldri i nettleseren.** Nøkkelen skal ikke inn i `admin.js`, ikke i en
`data-`-attributt, ikke i en URL. Portalen sender passordet og får en
liste; den ser aldri nøkkelen og aldri noen PIN.

#### Hva admin kan gjøre, og hva admin ikke kan

| Kan | Kan ikke |
| --- | --- |
| Se hvem som har logget inn, første gang og sist inne | Se noens PIN — de ligger hashet hos Supabase |
| Sette en ny PIN på en som har glemt sin | Lese den gamle |
| Slette en konto, med alle «jeg blir med»-svarene | Angre slettingen |

Tidene kommer fra Supabase selv: `created_at` og `last_sign_in_at`. Vi
teller ikke — en teller vi fører selv ville kunne gli fra virkeligheten
uten at noen merket det. Kontoen lages ved første innlogging, så
`created_at` *er* første gang noen logget på.

En ny PIN settes med `PIN_PEPPER` på, som alle andre PIN-er. Står
pepperet feil her, kommer ikke personen inn med PIN-en admin nettopp ga
dem — derfor står `PIN_PEPPER` i lista over det som må være satt.

### Tabellen «pin_kontoer» — hvilke fornavn er tatt

Innloggingen spør om navnet er nytt **før** PIN-en tastes, og det er ikke
kosmetikk: er navnet nytt, *lages* en PIN der og da, og da må den
gjentas. Vi har ingen e-post å sende en ny kode til, så en feiltastet PIN
ved opprettelse gjør kontoen utilgjengelig og brenner navnet.

Supabase Auth har med vilje ingen «finnes denne?»-vei utenfra, og
admin-veien krever en `service_role`-nøkkel som ikke finnes i dette
prosjektet. Derfor en liten tabell med bare slugen — ingen navn i
klartekst utover det leseren selv skrev, ingen PIN, ingenting annet:

```sql
create table pin_kontoer (
  slug   text primary key check (char_length(slug) between 2 and 24),
  bruker uuid not null default auth.uid()
         references auth.users (id) on delete cascade,
  laget  timestamptz not null default now()
);

alter table pin_kontoer enable row level security;

-- Hvem som helst kan få vite at et fornavn er tatt: appen sier det
-- uansett, og alternativet er «feil PIN» på en PIN som stemmer.
create policy "les for alle" on pin_kontoer
  for select using (true);

-- Føre opp et navn kan du bare i ditt eget. `bruker` settes av databasen
-- fra økten, og funksjonen sender den aldri selv.
create policy "før opp eget navn" on pin_kontoer
  for insert to authenticated with check (bruker = auth.uid());
```

`on delete cascade` er det som gjør at lista ikke kan lyve: sletter noen
kontoen sin, forsvinner raden samtidig, og fornavnet blir ledig igjen.
Uten den ville lista holdt på navn ingen lenger eier.

Til tabellen finnes, svarer `/api/konto` 503 og sier nøyaktig det.

### Tabellen «kampsvar» — hvem blir med

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

### Sletting av egen konto

Å slette en bruker krever normalt admin-tilgang hos Supabase, og en
`service_role`-nøkkel som kan slette hvem som helst. Den nøkkelen finnes
ikke i dette prosjektet, med vilje. I stedet ligger sletteretten i
databasen, begrenset til den som ber om den:

```sql
create or replace function public.slett_meg()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.slett_meg() from public, anon;
grant execute on function public.slett_meg() to authenticated;
```

`auth.uid()` er den som er logget inn, og ingen andre. Selv en feil i
`konto.mjs` kan derfor ikke slette en annens konto — funksjonen tar ikke
imot noen id.

Radene i `kampsvar` følger med: fremmednøkkelen står med
`on delete cascade`. En sletting er dermed hel — adressen og navnet
forsvinner samtidig, og det er det personvernsiden lover.

Uten denne funksjonen svarer `/api/konto` 503 med «Slettingen er ikke
satt opp i Supabase ennå».

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
| `/api/konto` eller `/api/svar` svarer 404 | funksjonen er ikke merget til `main` enda | test mot deploy-preview-adressen |
| Innlogging: «Innloggingen er ikke satt opp: X mangler» | X ikke satt i Netlify — eller deployen er eldre enn variabelen | sett X, trigger deploy |
| Innlogging: «Navnet eller PIN-en stemmer ikke» | feil PIN, eller `PIN_PEPPER` er endret etter at kontoen ble laget | sett pepperet tilbake; endres det, må kontoene lages på nytt |
| Innlogging: ««Ola» er tatt» | fornavnet er én konto, og noen andre har det | velg et annet fornavn |
| «Tabellen «pin_kontoer» finnes ikke i Supabase ennå» | SQL-en over er ikke kjørt | kjør den i Supabase → SQL Editor |
| Portalen: «Supabase avviste nøkkelen» | anon-nøkkelen står i `SUPABASE_SERVICE_KEY` | hent `service_role` under Project Settings → API |
| Portalen: «Brukerlista er ikke satt opp: X mangler» | X ikke satt i Netlify | sett X, trigger deploy |
| Ny PIN virker ikke for personen | `PIN_PEPPER` var ikke satt da PIN-en ble satt | sett pepperet, deploy, sett PIN-en på nytt |
| Et kjent navn ber om «Gjenta PIN-en» | raden i `pin_kontoer` mangler — kontoen ble laget før tabellen fantes | før opp slugen for hånd, eller la personen slette og lage kontoen på nytt |
| Innlogging: «krever at e-postbekreftelse er slått av» | *Confirm email* står på i Supabase | slå den av; adressen er en nøkkel, ikke en postkasse |
| Innlogging: «For mange forsøk» (429) | Supabase sperrer en stund | vent et minutt |
| Innlogging: alle får «stemmer ikke» etter en deploy | `PIN_PEPPER` er byttet eller borte | se pepper-avsnittet |
| *(parkert, e-post)* E-posten har en lenke, ingen kode | malene er låst til egen SMTP er satt opp | se det parkerte avsnittet |
| *(parkert, e-post)* Bare én adresse får kode; andre får 500 | Resends testavsender leverer bare til kontoeieren | verifiser et eget domene, og bytt *Sender email* i Supabase |
| *(parkert, e-post)* Koden avvises (403) selv om den er fersk | koden er lengre enn appen tar imot, eller slås opp med feil type | begge deler er rettet i koden; sjekk «Email OTP Length» i Supabase mot `KODE_MAKS` |
| *(parkert, e-post)* «Fikk ikke sendt koden» og ingenting i Resend-loggen | SMTP-påloggingen avvises — som regel `Resend` med stor R | skriv `resend`, lim inn nøkkelen på nytt |
| «Tabellen «kampsvar» finnes ikke i Supabase ennå» | SQL-en over er ikke kjørt | kjør den i Supabase → SQL Editor |
| «Slettingen er ikke satt opp i Supabase ennå» | `slett_meg()` er ikke laget | kjør SQL-en for sletting |
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
/api/konto                            → {"klar":true,"mangler":[]}
/api/brukere                          → {"klar":true,"mangler":[]}
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
