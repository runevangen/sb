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

## Øvrige punkter

Mindre saker som har dukket opp underveis og som ingen har tatt tak i:

- **Plausible:** domenet `mvp-sb.netlify.app` må legges til i en
  Plausible-konto. Skriptet ligger i `index.html` og er en stille no-op
  til det er gjort.
- **WordPress-kontoer:** `admin`-brukeren bør erstattes, og de ti
  kontoene bør ha 2FA og ratebegrensning på innlogging.
- **AdSense:** avgjørelse om ekte annonser. Krever samtykkebanner i EØS,
  som er grunnen til at det ikke er gjort.
- **Installasjonsknappen** er ikke verifisert på en ekte iPhone.
- **Videoinnbygginger:** uavklart om redaksjonen faktisk bruker dem.
- **Fotball:** lagmerker i tabellen, flere ligaer (krever lengre
  levetider — se `LEVETID`), og inneværende sesong (krever betalt
  abonnement — se `SESONGVINDU`).
