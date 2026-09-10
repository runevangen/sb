# Backlogg

Saker som er bestemt, men ikke bygget. Nyeste øverst. Er en sak ferdig,
slettes den herfra — historikken ligger i git.

---

## Innlogging og personalisert feed

**Status:** ikke startet · **Estimat:** 3–5 dager · **Avhengigheter:** avklaringene under

Mål: brukere skal kunne velge favorittlag og få sakene om dem øverst i
feeden. Innlogging er midlet, ikke målet — den finnes for at valget skal
følge brukeren mellom enheter.

### Oppgaver, slik de ble bestilt

1. **Aktiver Netlify Identity**
   - Konfigurasjon i `netlify.toml`
   - Google som ekstern innloggingsprovider, i tillegg til e-post/passord
2. **Sett opp identity-pakken**
   - Login-, logout- og signup-flyt
   - Auth-state (innlogget/utlogget) i UI-et
   - Tydelig «Logg inn med Google»-knapp
3. **Sikkerhet**
   - CSRF-beskyttelse på server-side auth-endepunkter
   - JWT/refresh-cookies håndtert riktig av Netlify sitt runtime
4. **Datamodell**
   - Enkel database med en `users`-tabell: bruker-UID → liste over favorittlag
   - Preferanseskjema i UI der bruker velger favorittlag etter innlogging
5. **Feed-filtrering**
   - Innlogget med lagrede favorittlag: saker om favorittlagene øverst
   - Utlogget eller uten preferanser: dagens feed, uendret
6. **Test**
   - Google-innlogging end-to-end
   - At preferanser lagres og slår ut i feeden

### Må avklares før arbeidet starter

Dette er ikke innvendinger mot målet — det er punkter der bestillingen og
kodebasen står i strid, og som avgjør hvor mye arbeid saken faktisk er.

**a. Er Netlify Identity riktig verktøy i 2026?**
Netlify Identity har ligget i vedlikeholdsmodus i flere år, og Netlify har
over tid pekt nye prosjekter mot andre leverandører. Jeg får ikke sjekket
`docs.netlify.com` herfra, så dette må bekreftes før noe bygges — ikke
etter. Er tjenesten avviklet for nye prosjekter, er alternativene Auth0,
Clerk, Supabase Auth eller Google Sign-In direkte. Valget påvirker
oppgave 1–3 helt, og oppgave 4–6 nesten ikke.

**b. `verifyRequestOrigin` hører til Lucia, ikke til Netlify.**
Bestillingens intensjon — beskytt endepunktene mot forespørsler fra andre
nettsteder — er riktig, men mekanismen passer ikke: Netlify Identity gir
en JWT i JavaScript som sendes som `Authorization: Bearer`, ikke en
informasjonskapsel nettleseren sender av seg selv. Da er CSRF i praksis
ikke angrepet. Det som må gjøres i stedet, og som er like viktig:
**verifiser signaturen på tokenet i hver funksjon** før den rører data.
Velges en løsning med cookies, kommer origin-sjekken tilbake som et krav.

**c. Enhver npm-pakke bryter «ingen byggesteg».**
`netlify-identity-widget`, `@netlify/database` og `@netlify/blobs` krever
alle `package.json` og `npm install` ved deploy. Prosjektet har bevisst
ingen byggekjede i dag. To veier: godta et byggesteg (og all
vedlikeholdsgjelden det fører med seg), eller skrive de få kallene mot
Identitys REST-endepunkter for hånd. Avgjørelsen bør tas eksplisitt.

**d. Database: Postgres eller nøkkel/verdi?**
Datamodellen er én rad per bruker med en liste med lagnavn. Netlify DB
(Postgres, provisjoneres automatisk) er kraftigere enn behovet;
Netlify Blobs lagrer et JSON-objekt per UID og er nok. Postgres blir
riktig først når vi vil spørre på tvers av brukere — for eksempel «hvilke
lag er mest valgt».

**e. Feed-filtrering er vanskeligere enn det ser ut.**
WordPress-API-et kan ikke rangere saker etter «nevner favorittlagene
mine». Realistiske alternativer:
   - hente dagens feed og sortere i nettleseren på treff i tittel,
     ingress og kategori — billig, men treffer bare det som står i teksten
   - ett `search=`-kall per favorittlag og flette resultatene — bedre
     treff, men flere kall og tregere første visning
   - be redaksjonen merke saker med lag-tagger i WordPress — best resultat,
     men bryter med «ingenting skal kreve endringer på sportsbibelen.no»

Vi så allerede symptomet da lagsøket ble laget: et søk på «Fulham» ga
Premier League-saker generelt, ikke Fulham-saker.

**f. Personvern endrer seg fra ingenting til noe.**
Appen lagrer i dag ingen personopplysninger, og Plausible er
cookieløst — derfor har vi ingen samtykkebanner. Brukerkontoer betyr
personopplysninger: personvernerklæring, databehandleravtale med
leverandøren, en vei til å slette kontoen sin, og en vurdering av
hvilke data som faktisk trengs. E-post og UID holder; navn og bilde fra
Google trenger vi ikke å lagre.

**g. End-to-end-test av Google-innlogging kan ikke automatiseres her.**
Testoppsettet kjører headless Chromium uten ekte kontoer. Planen bør være
en mocket auth-state i `run.mjs` for alt som er vår kode, pluss en kort
manuell sjekkliste for selve Google-flyten.

### Rekkefølge jeg vil foreslå

1. Avklar (a) og (c) — de bestemmer alt annet
2. Preferanser i `localStorage` først, uten innlogging. Da kan
   favorittlag og feed-sortering bygges og testes ferdig, og innlogging
   blir en ren synkroniseringssak etterpå framfor en blokkering
3. Innlogging, med server-side verifisering av tokenet
4. Flytt preferansene fra `localStorage` til databasen, og la dem
   fortsatt virke utlogget

Punkt 2 gir mesteparten av verdien for en brøkdel av arbeidet, og gjør
ingenting av det vanskelig å angre.

*Merk: bestillingen ble avkortet på siste linje («Verifiser at preferanser
lagres og fa…»). Jeg har lest den som «lagres og fanges opp i feeden».
Stemmer ikke det, må punkt 6 rettes.*

---

## Står ute i prod nå

- **Oppdiktede annonsører er synlige for ekte lesere.** Nordbane,
  Padelhuset, Sprinta og Tribune vises på `mvp-sb.netlify.app`. De er
  merket «REKLAME» og finnes ikke, så ingen blir lurt — men de er heller
  ikke klikkbare, og de står der til noen bestemmer seg for ekte annonser
  eller for å ta dem ned. Dette er punktet jeg ville tatt stilling til
  først, rett og slett fordi det står ute.
- **Statistikken samler null.** Hendelsene ligger klare i koden, men
  ingenting registreres før `mvp-sb.netlify.app` legges til i en
  Plausible-konto. Ett steg, ingen ny deploy.

## Sikkerhet — utenfor appen, krever wp-admin

Ingen av disse kan gjøres herfra; de hører hjemme på sportsbibelen.no.

- **`admin`-kontoen** bør erstattes med et annet brukernavn.
- **Tofaktor og ratebegrensning** på innlogging for de ti kontoene.
- **Brukerlisten er offentlig:** `/wp-json/wp/v2/users` lister
  brukernavnene til alle forfattere. Det er grunnen til at proxyen i
  `netlify.toml` er smal og aldri får bli et wildcard mot `wp/v2` — men
  endepunktet står fortsatt åpent på selve nettstedet.
- **Tiltaksplanen** mangler ansvarlig og datoer før den kan sendes til
  redaksjonen. PDF-en ligger hos deg, ikke i repoet — dette repoet er
  offentlig, og en tiltaksplan som beskriver egne svakheter hører ikke
  hjemme her.

## Fotball

- **Lagnavn stemmer ikke alltid overens.** API-Football skriver
  «Bodo/Glimt», redaksjonen skriver «Bodø/Glimt». Lagsøket bruker API-ets
  skrivemåte direkte, så et lag med ulik staving gir null treff. Løsningen
  er en oversettelse fra API-navn til redaksjonens navn i
  `fotball-data.js`, som kan enhetstestes.
- **Lagsøk gir skjeve treff.** Et søk på «Fulham» ga Premier
  League-saker generelt, ikke Fulham-saker. Samme problem som punkt (e) i
  saken over, og de bør løses sammen.
- **Lagmerker i tabellen.** API-et gir logo-URL per lag. Krever en
  bildepolicy for eksterne bilder og plass til en kolonne til.
- **Flere ligaer** krever lengre levetider først — se `LEVETID`, og
  enhetstesten som vokter døgnkvoten.
- **Inneværende sesong** krever betalt abonnement — se `SESONGVINDU`.

## Uverifisert

- **Installasjonsknappen** er aldri prøvd på en ekte iPhone. På iOS er
  den bare en instruksjon.
- **Videoinnbygginger:** YouTube og Vimeo slipper gjennom allowlisten,
  men vi vet fortsatt ikke om redaksjonen faktisk bruker dem.

## Vurdert og valgt bort

Står her for at ingen skal utrede dem på nytt uten å vite at de har vært
oppe.

- **AdMob:** utelukket. Det er native-only; AdSense er
  web-motstykket, og det krever samtykkebanner i EØS — altså det vi
  unngikk med cookieløs statistikk. Selve AdSense-avgjørelsen er ikke
  tatt.
- **Tettere innhold** og **kantløs visning på mobil:** begge vurdert og
  valgt bort. Dokumentert i [skjermplass-notatet](https://claude.ai/code/artifact/875ec3d2-508e-4491-aeee-6131c0d07e98)
  om dere ombestemmer dere.
