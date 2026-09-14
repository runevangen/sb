# 0009 — Innlogging med fornavn og PIN

## Kontekst
Appen trengte en identitet som virker på **en annen telefon** — ellers
kan ingen se hvem som blir med på kampen. E-post med engangskode virket,
men avsenderen må ligge på et verifisert domene, og domenet er ikke
kjøpt. Se [Parkert: engangskoden på e-post](0009-vedlegg-epost.md).

## Beslutning
Fornavn og PIN. Paret *er* kontoen. Supabase Auth holder den.

## Konsekvens
- **Ingenting er låst bak innlogging.** Nyheter, fotball, tabell,
  favorittlag, deling, puber og vær virker som før uten konto. Innlogging
  er for det som går til noen andre, eller til en annen telefon.
- **To steg: navnet først, PIN-en etterpå.** Er navnet ledig, *lages* en
  PIN der og da, og da må den gjentas — vi har ingen e-post å sende en ny
  kode til, så en feiltastet PIN ved opprettelse gjør kontoen
  utilgjengelig og brenner navnet. Er navnet kjent, står det «skriv
  PIN-en du valgte» og ett felt.
- At de to PIN-ene er like sjekkes **i appen**: en tjeneste kan ikke se at
  du tastet feil to ganger på rad.
- **Fornavnet blir en adresse hos tjenesten** (`ola@pin.mvp-sb.netlify.app`),
  fordi det er det Supabase Auth kjenner. Ingen e-post sendes. Adressen
  vises aldri i appen og legges aldri i økten. `pinSlug()` folder norske
  bokstaver **før** tegnene strippes — uten det ville «Bjorn» og «Bjørn»
  blitt `bjrn` begge to.
- **PIN-en er PIN-en pluss et pepper** (`PIN_PEPPER`). Fire siffer er
  10 000 forsøk; uten pepperet kunne de gjettes rett mot Supabase. Og
  Supabase krever minst seks tegn. Pepperet må settes før den første
  kontoen og **kan ikke endres** — et nytt pepper låser alle ute.
- Dette gjør ikke en PIN på fire siffer til et passord, og appen later
  ikke som. Det verste den som kommer seg inn kan gjøre, er å skrive «jeg
  blir med» i en annens navn. Det står i `personvern.html` med de ordene.
- **At et fornavn er tatt, sier vi rett ut.** Motsatt av hva vi gjør med
  e-postadresser, og med vilje: et fornavn i en vennegjeng er ingen
  hemmelighet, og alternativet er «feil PIN» på en PIN som stemmer.
  Lista ligger i `pin_kontoer` med `on delete cascade`, så den kan ikke
  lyve.
- **Et utløpt tilgangstoken er ikke det samme som å være logget ut.**
  Fornyeren lagres i økten og **roterer** — den brukte er død i samme
  øyeblikk. Fornyingen gjør sitt eget kall, ikke gjennom `kontoKall`, så
  en avvist fornyer kan skilles fra et nettverksblaff: bare en 4xx med
  `utlogget: true` logger deg ut.
- **Identiteten må overleve en fornying.** Supabase trenger ikke sende
  brukerobjektet med på `grant_type=refresh_token`. Appen beholder derfor
  `bruker` og `navn` fra forrige økt, og `maaFornyes()` melder en økt uten
  `bruker` som moden uansett hvor fersk den er.
- `pin-data.js` er de rene funksjonene, **delt** mellom appen og
  funksjonen: blir de to uenige om hva et gyldig navn eller en gyldig PIN
  er, får leseren «feil PIN» på en PIN som stemmer.

## Detaljer som har kostet noe
- **Teksten står ett sted.** `KONTO_TEKST` i `app.js` dekker alle fire
  tilstandene. En knapp i menyen ser ut som en port, så panelet må si med
  ord at den ikke er det.
- **Oppsettet sjekkes når panelet åpnes** (`GET /api/konto` svarer `klar`
  og `mangler`), ikke når leseren trykker Logg inn: får du vite at
  innloggingen ikke er satt opp etter at navnet og PIN-en er skrevet inn,
  var skrivingen til ingen nytte. Samme grep som i adminportalen.
- **Økten ligger i `localStorage` (`sb-konto`) med et utløpstidspunkt**,
  ikke et antall sekunder — sekunder er ubrukelige etter en omstart.
  `lesKonto` rydder bare en økt som *hverken* er gyldig eller kan fornyes
  (`kanFornyes()` / `maaFornyes()`).
- **Supabase svarer 200 uten økt i to tilfeller som betyr helt ulike
  ting**, og skillet er `identities`: en tom liste betyr «finnes alt», en
  full liste at *Confirm email* står på. Funksjonen kjenner igjen begge —
  det første blir «navnet er tatt», det andre en 503 som sier hva som må
  slås av. «Uventet svar» ville sendt den som satte opp prosjektet ut på
  leting.
- Navnet sendes som **POST**, ikke i en spørring: en adresse havner i
  tilgangsloggene hos hvert ledd underveis.
- Kallet går fra funksjonen, ikke fra nettleseren, selv om anon-nøkkelen
  tåler å være offentlig: da snakker appen bare med sitt eget domene. Og
  pepperet finnes bare der.
- Feltene bærer `autocomplete="username"` og `current-password`, så
  telefonen kan tilby å huske paret.
- **Etter innlogging er du ferdig i panelet.** Fornavnet står i toppfeltet
  — det er svaret på «gikk det bra?». Merket der er en knapp som åpner
  menyen med kontoen ute.
- Navnet vises i adminportalen slik personen selv skrev det: adressen
  bærer bare slugen, så `konto.mjs` sender navnet med som `user_metadata`
  ved opprettelse. Kontoer laget uten det faller tilbake til slugen.
- Feiler innloggingen, står tjenestens egen melding i parentes etter
  (`tjenestenSa()`, som henter siste ledd i `forsok`). Verken pepperet,
  nøkkelen eller adressen ligger i `forsok`.
- **Sletting krever to trykk**: det første sier hva som kommer til å skje
  — og at fornavnet blir ledig — det andre gjør det. Ingen dialogboks; den
  ville blitt et hinder å klikke bort framfor en setning å lese.
