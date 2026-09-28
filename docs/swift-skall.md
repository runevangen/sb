# Swift-skallet: App Store, push og annonser uten å skrive appen på nytt

*Plan, 28. september 2026. Ingen kode, og ikke besluttet — dette er
grunnlaget for å bestemme. Påstander om Apple og Google er slått opp,
ikke husket; kildene står nederst.*

Spørsmålet var hva det koster å bygge appen i Swift, og hva en Swift-app
skulle gi som PWA-en ikke gir: **plass i App Store, push-varsler og
annonser via AdMob.** Svaret er at alle tre løses av et tynt skall rundt
PWA-en, og at ingen av dem krever at appen skrives på nytt.

## Konklusjonen først

- **Et skall, ikke en omskriving.** Et lite Swift-prosjekt som viser
  PWA-en, med det native rundt: push og annonseflater. Innholdet og
  reglene blir der de er, og en flettet PR er i appen uten å gå via Apple.
- **AdMob krever ikke samtykke — hvis vi bare viser «begrensede
  annonser».** De bruker verken informasjonskapsler, reklame-id eller
  lokal lagring. Samtykkeløsningen og Apples sporingsboks gjelder
  *tilpassede* annonser. Valget mellom de to er et valg om ADR 0004, og
  det hører til #38.
- **Push er grunnen til at Apple kan si ja.** Apple avviser apper som
  bare er et nettsted i en ramme. Native push for favorittlaget er det
  sterkeste argumentet vi har for at skallet er mer enn det.
- **Det som tar lengst tid, er ikke koden.** Et D-U-N-S-nummer, en Mac og
  en Apple-konto i selskapets navn. Start med dem.

## Hvorfor ikke skrive appen på nytt

Målt i repoet 28. september 2026:

| Lag | Linjer | Ved en omskriving |
|---|---:|---|
| Visningen (`app.js`, `fotball.js`, CSS, HTML) | 9 068 | skrives på nytt i Swift |
| Reglene (`*-data.js`, `lib.js`) | 4 222 | må finnes i **begge** språk |
| Tjenestene (`netlify/functions/`) | 3 095 | gjenbrukes |
| Portalen | 3 214 | blir på nett |
| Testene | 16 169 | nettlesertestene følger ikke med |

Det dyre er ikke linjene, men den andre raden. `*-data.js` deles i dag
mellom appen, tjenestene og testene, og det er hele mønsteret: *blir
appen og tjenesten uenige om en regel, får leseren en feilmelding som
ikke stemmer.* Swift kan ikke lese JavaScript. En omskriving gir hver
regel to hjem, i to språk, der ingen test kan sammenlikne dem — den samme
feilen som seks kopier av `kortMelding` som alt hadde glidd fra hverandre,
bare verre. Og den betales ved hver endring, ikke én gang.

I tillegg: hver versjon gjennom Apples gjennomgang, Android utenfor, og to
visninger å holde i takt fordi PWA-en må stå for alle andre.

Skallet unngår alle tre.

## Hva skallet er

    ┌──────────────────────────────────────────┐
    │  Swift                                   │
    │   ├─ WKWebView → appen på Netlify        │  innhold, regler, visning:
    │   │                                      │  som i dag, én kodebase
    │   ├─ Push (APNs)                         │
    │   ├─ Annonseflater (AdMob)               │  senere, se under
    │   └─ Lenker ut → Safari, Kart, Del       │
    └──────────────────────────────────────────┘

**Innholdet oppdateres fra Netlify, som i dag.** Bare endringer i selve
skallet går gjennom Apple — og det er sjelden, for skallet gjør lite.

## Seks steder der skallet må gjøre det riktig

Hvert punkt er et sted der nettappen virker og et naivt skall stille ikke
gjør det. En knapp som ser ut som den virker, men ikke gjør noe, er verre
enn ingen — og det er akkurat den feilen et skall inviterer til.

**1. Lenker ut.** «Veien dit», «Del saken» og eksterne lenker i sakene
bruker `target="_blank"`. WKWebView ignorerer det som standard: trykket
gjør ingenting. Skallet må sende dem videre til systemet — Kart-appen,
Safari, delingsarket.

**2. Service workeren.** `sw.js` cacher appens skall. I WKWebView kjører
service workers bare med *App-Bound Domains* (iOS 14+): opptil ti domener
i `WKAppBoundDomains` i Info.plist, og
`limitsNavigationsToAppBoundDomains` satt. Uten det: ingen offline. Med
det: navigasjon til andre domener feiler — og da blir punkt 1 enda
viktigere, for Google Maps er et annet domene.

**3. Posisjon.** `hentNaerDeg()` spør gjennom nettleseren. I skallet
krever det en forklaringstekst i Info.plist, og det kan gi to
tillatelsesbokser etter hverandre. Må prøves på en ekte telefon.

**4. Deling og utklippstavle.** `navigator.share` og kopiering oppfører
seg ikke nødvendigvis likt i WKWebView som i Safari. Fallbacken — lenka
som er en ekte `<a>` — må virke der også. Må prøves.

**5. Innlogging.** Økta ligger i `localStorage`, og skallet har sitt eget
lager, adskilt fra Safari. Første gang logger leseren inn på nytt. Ikke en
feil, men det skal ikke overraske noen.

**6. Appen må vite at den står i skallet** — for å be om push native i
stedet for i nettleseren, og for å vise AdMob-flatene i stedet for de
egne annonseplassene. Ett flagg, satt av skallet og lest ett sted. Sto
det to steder, ville de to kunnet si hver sin ting om hvor appen er.

## Push

**Tillatelse først når leseren trykker, aldri ved første oppstart** —
samme krav som #143 stiller. Apple sier det samme fra sin side
(retningslinje 5.1.2): ingen funksjon får kreve at push er slått på.

**Hva:** kampstart og resultat for favorittlagene, som #143 beskriver.
Favorittlagene ligger nå på kontoen ([ADR 0024](adr/0024-favorittlag-og-pin-pa-kontoen.md)),
men virker også uten — og push bør gjøre det samme, for ingenting er låst
bak innlogging ([ADR 0009](adr/0009-fornavn-og-pin.md)).

**Sendingen:** en planlagt Netlify-funksjon som spør APNs, med en
APNs-nøkkel (`.p8`) som ny hemmelighet i Netlify.

**Et ekte åpent spørsmål: hvem leser alle enhetene?** Funksjonen som
sender, må vite for hver telefon hvilke lag den vil høre om.
Favorittlagene ligger i `user_metadata`, som bare kan leses med brukerens
egen økt eller med `service_role` — og [ADR 0010](adr/0010-ingen-service-role.md)
sier at ingen funksjon har `service_role`, med ett dokumentert unntak.
Push trenger derfor sin egen liste over enheter og lag, og noe må lese
hele den lista. Det valget hører hjemme i en egen ADR før noe bygges.

**Personvern:** et enhets-token er en opplysning om leseren.
`personvern.html` må si det, og hvordan man blir kvitt det.

Web-push i PWA-en (#143) og push i skallet deler «hvem vil ha hva» og
tidsplanen, men ikke transporten.

## AdMob

AdMob har to moduser, og forskjellen avgjør om ADR 0004 kan stå:

| | Begrensede annonser | Tilpassede annonser |
|---|---|---|
| Informasjonskapsler, reklame-id, lokal lagring | nei | ja |
| Samtykkeløsning (CMP) i EØS | ikke påkrevd | påkrevd siden januar 2024 |
| Apples sporingsboks (ATT) | nei | ja |
| ADR 0004 | kan stå, med én presisering | må erstattes |
| Inntekt | lavere | høyere |

**Én presisering også for de begrensede.** Den *programmatiske* varianten
bruker informasjonskapsler og lokal lagring til ett formål — å oppdage
falsk trafikk — og Google krever ikke samtykke for det. Men ADR 0004 sier
«ingen informasjonskapsler» uten forbehold. Velges den varianten, må
ADR-en si det, ikke bare tolkes stille.

**Hvor mye lavere inntekten blir, vet vi ikke.** Ingen tall her, med
vilje — det bør måles, ikke antas.

**Flatene står rundt nettvisningen, ikke inni den**: native bannere over
eller under innholdet. Og de egne plassene («Ledig plass»,
[ADR 0005](adr/0005-egen-annonseplass.md)) — skal de stå i appen ved
siden av AdMob, eller bare på nett? Det er et designvalg.

**AdMob blokkerer ikke første innsending.** Skallet kan gå ut med push
alene, og annonsene komme i en senere versjon når #38 er avgjort.

## Apples gjennomgang

Retningslinje 4.2, ordrett:

> Your app should include features, content, and UI that elevate it
> beyond a repackaged website.

Og 4.2.2 nevner «web clippings, content aggregators, or a collection of
links» blant det en app ikke primært skal være. En gjennomgang kan se en
nyhetsside i en ramme.

**Argumentet vårt:** native push for favorittlaget, kampkortet med puber,
vær og «Veien dit», og «jeg blir med». Push er det sterkeste, fordi det er
det eneste som faktisk er native.

**Regn med at første runde kan komme tilbake.** Da svarer vi med hva som
er native, og legger til mer hvis det trengs. Det koster tid, ikke penger.

## Før første innsending

- [ ] **D-U-N-S-nummer for selskapet** — gratis, fem virkedager til to
      uker. Lengst ledetid: start her. Mange selskaper har et uten å vite
      det.
- [ ] Apple Developer Program som **organisasjon** — 99 dollar i året.
      Da står Sportsbibelen som selger, ikke en person.
- [ ] Hvem som eier Apple-kontoen — selskapet, ikke den som satte den opp
- [ ] En Mac med Xcode, og hvem som har den jobben
- [ ] Domenet appen laster: `mvp-sb.netlify.app` eller et eget
- [ ] App Store Connect: navn, ikon, skjermbilder, beskrivelse,
      støtte-adresse, personvern-adresse
- [ ] Personvernetiketten («App Privacy»): hva appen samler inn — i dag
      fornavn (konto) og enhets-token (push). AdMob legger til mer.
- [ ] `personvern.html` oppdatert
- [ ] En demokonto til Apples gjennomgang, så «jeg blir med» kan prøves
- [ ] TestFlight på minst én ekte iPhone, med de seks punktene over
      krysset av

## Hvordan det testes — og hva som ikke kan testes her

**Swift kan verken bygges eller kjøres i containeren prosjektet utvikles
i.** Xcode finnes bare på macOS. Koden kan skrives her, ikke prøves.

**JS-siden kan testes som alt annet:** flagget som sier at appen står i
skallet, at lenkene ut er ekte `<a>` med riktig mål, og broen til Swift
stubbet i `run.mjs`. Stubben skal modellere hva skallet svarer, ikke hva
koden vår forventer — samme regel som ellers.

**Swift-siden** testes med XCTest på en Mac, gjerne som en macOS-jobb i
GitHub Actions på hver PR.

**Resten er TestFlight på en telefon.** Det er der de seks punktene
krysses av, og ingen stubb kan gjøre det for oss.

## Rekkefølgen

0. **D-U-N-S og Apple-konto — nå**, mens resten skjer.
1. JS-siden av skallet, testet her: flagget, lenkene ut.
2. Skallet selv: nettvisning, lenker ut, posisjon, service worker.
   TestFlight.
3. En ADR for hvem som leser push-enhetene. Så tabellen, funksjonen og
   APNs-nøkkelen.
4. Første innsending — med push, uten annonser.
5. AdMob i en senere versjon, når #38 har bestemt hvilken modus.

## Hva det koster

**Kontant:** 99 dollar i året, og en Mac.

**Tid — anslag, ikke målt**, og avhengig av hvem som gjør det med en Mac
for hånden:

| | |
|---|---|
| Skallet, lenker ut, posisjon | dager til et par uker |
| Push hele veien | én til to uker |
| AdMob, begrensede annonser | omtrent en uke |
| Apples gjennomgang | ventetid, ofte et døgn per runde |

Til sammenlikning: en omskriving er måneder, og så løpende dobbeltarbeid.

**Løpende:** en ny iOS-versjon og en ny Xcode hvert år. Apples
gjennomgang bare når selve skallet endres.

## Åpne spørsmål

1. **Hvem leser push-enhetene?** Står mot ADR 0010. Egen ADR.
2. **AdMob: begrensede eller tilpassede annonser?** Står mot ADR 0004.
   Hører til #38, og henger sammen med #149.
3. **De egne annonseplassene i appen** — ja eller nei?
4. **Domenet** appen laster.
5. **Hvem eier Apple-kontoen og Mac-en.**

## Kilder

Slått opp 28. september 2026.

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
  — 4.2, 4.2.2 og 5.1.2(i). Lest direkte.
- [WebKit: App-Bound Domains](https://webkit.org/blog/10882/app-bound-domains/)
  — service workers i WKWebView, grensen på ti domener.
- [Apple: påmelding i Developer Program](https://developer.apple.com/help/account/membership/program-enrollment/)
  — organisasjon og D-U-N-S. Tidsbruken på D-U-N-S er fra
  tredjepartsguider, ikke fra Apple.
- [Google AdMob: krav til samtykkeløsning i EØS, Storbritannia og Sveits](https://support.google.com/admob/answer/13554116)
- [Google AdMob: begrensede annonser](https://support.google.com/admob/answer/10105530)

**Google-sidene er lest gjennom søkeresultater, ikke direkte** —
nettverket prosjektet utvikles i slipper ikke til `support.google.com`.
De er verdt å lese selv før #38 avgjøres.
