# Kampdagen er hullet ingen norsk sportsapp fyller

*Teknisk dypdykk, september 2026. Også publisert som
[artifact](https://claude.ai/code/artifact/8fb75d02-e594-4259-9682-342f6b8dda2e).
Grunnlag: to research-runder, rundt 210 kildeoppslag. Ingen kode endret.*

Hva FotMob, Sofascore, TV 2 og VG gjør best, hvor de lar
Eliteserien-leseren stå alene, og hvilke gratis datakilder Sportsbibelen
kan koble på uten å bryte med sporingsfri drift og null byggesteg.

## Konklusjonen først

De store appene konkurrerer om *kampen*: live-score, xG, momentum,
lock-screen. Ingen norsk aktør eier *kampdagen*: hvor kampen vises, hva
været blir på vei dit, hvilken pub som er nærmest, og hvordan du kommer
deg hjem. Det er akkurat de dataene som er gratis i Norge, og som passer
arkitekturen appen allerede har.

Én ting stopper alt: API-Footballs gratisnivå gir ikke terminlisten for
2026. Kampdag-funksjoner trenger en kamp å henge på. Det finnes en gratis
vei rundt, og den står i steg 1 nederst.

## Slik kunne kampdag-kortet sett ut

> **Rosenborg – Bodø/Glimt** · Lerkendal · søndag 13. september · 17.00
> *(eksempel, ikke ekte data)*
>
> **Vises på:** TV 2 Direkte (åpen kanal) og TV 2 Play
> — kilde: håndvedlikeholdt liste fra NFFs rundeoppsett
>
> **Været:** 8°, føles som 4°. Sørvest 9 m/s, regn fra 16.30. **Ta
> regnjakke og lue.** Sola går ned 19.51, kampen ender i skumring.
> — kilde: MET Norway Locationforecast, Nowcast og Sunrise, cachet per stadion
>
> **Nærmeste pub:** 4 puber innen 800 m av Lerkendal, 2 av dem åpne fra 12.
> — kilde: OpenStreetMap via Overpass, cachet ett døgn per stadion
>
> **Dit og hjem:** Buss 3 fra Prinsens gate, 11 min. 12 ledige bysykler
> ved Lerkendal nå.
> — kilde: Entur JourneyPlanner og Mobility. Posisjonen din blir i nettleseren.

## Hva de beste gjør

Åtte mønstre går igjen hos appene som vinner. De to første forklarer
hvorfor FotMob fra Bergen har over 20 millioner månedlige brukere; de to
siste forklarer hvorfor en liten norsk aktør fortsatt har en åpning.

- **Følg-modellen er produktet.** FotMob ble bygget rundt «mine lag» fra
  2004. Sofascore slår på lock-screen automatisk for favorittlag. BBC og
  The Athletic lar deg følge emner og skribenter, ikke bare klubber.
- **Kampsenteret er et sted man blir.** Momentum-graf, xG, spillerrating,
  tekst, lyd, TV-kanal og vær på samme skjerm. FotMob henter været fra
  The Weather Company, men gjør det på serversiden og pre-cacher,
  nøyaktig som fotballfunksjonen vår.
- **Ett signaturtall.** Sofascore Rating og Attack Momentum siteres
  utenfor appen. FotMob fikk Optas fysiske data (toppfart, distanse)
  gratis for Premier League i 2025/26. Tallet er merkevaren.
- **Ut av appen.** Live Activities, widgets og push med målvideo. Målet er
  at du ikke skal måtte åpne appen. Apple Sports har ennå ikke Eliteserien.
- **Live som vern mot AI.** The Athletic vrir mot liveblogg og video fordi
  det er det som ikke lar seg skrape og oppsummere. BBCs live text er
  samme tanke.
- **Reklamehygiene som salgsargument.** 433-brukere roser fraværet av
  betting-annonser. FotMob Pro selger reklamefrihet. I Norge er affiliate
  til utenlandske spillselskap uansett ulovlig, så FotMob-modellen er
  stengt for oss.
- **Rettigheter bestemmer.** TV 2 har Eliteserien til 2034. OneFootballs
  gratis Eliteserien-strømming er borte fra 2026. Video er ikke en vei
  for noen andre.
- **Alle klubbene ser like ut.** Norsk Toppfotballs «Medieplattformen»
  gir klubbene samme mal. Personlighet à la Josimar og «Spiss Vinkel» er
  der en liten aktør skiller seg ut.

## Hvem gjør hva for Eliteserien-leseren

Kolonnene er det en leser trenger søndag klokka 15. Ingen norsk aktør
fyller mer enn to av dem, og ingen kombinerer dem per kamp.
● = ja, per kamp · ◐ = delvis eller generelt · ○ = nei.

| Aktør | Kanal per kamp | Vær | Pub | Reise | Sporingsfri | Styrke |
|---|:-:|:-:|:-:|:-:|:-:|---|
| FotMob | ● | ● | ○ | ○ | ○ | Opta-data, TV-guide per land, lock-screen |
| Sofascore / Flashscore | ◐ | ○ | ○ | ○ | ○ | Rating, momentum, bredde og fart |
| TV 2 Livesport | ◐ | ○ | ○ | ○ | ○ | Rettighetene, målvideo i push, Fantasy |
| VG Live | ○ | ○ | ○ | ○ | ○ | Minutt for minutt, favorittlag, podkast |
| NRK Sport | ○ | ○ | ○ | ○ | ◐ | Radio direkte med tilbakespoling |
| eliteserien.no-appen | ○ | ○ | ○ | ○ | ○ | Billetter, Fantasy, push per lag |
| MinFotball (NFF) | ○ | ○ | ○ | ◐ | ○ | Kart til banen, all norsk fotball |
| HvorVises.no | ○ | ○ | ◐ | ○ | ○ | Katalog over sportsbarer, omfang uverifisert |
| Sportsbibelen i dag | ○ | ○ | ○ | ○ | ● | Redaksjonen, ingen cookies, ingen konto |

Merk kolonnen «Sporingsfri». FotMob og Flashscore lever av annonser fra
spillselskap, TV 2 og VG krever konto. En app uten cookies, uten konto og
uten betting har ingen direkte norsk konkurrent. Det er ikke en funksjon,
men det er en posisjon.

## Idébank: kampdagen

Sortert etter hvor mye de gir per time arbeid. «Passer» betyr at ideen
kan bygges med samme mønster som fotballfunksjonen: én Netlify-funksjon,
kant-cache, ingen nøkkel i nettleseren, ingen lagring av leserdata.

### Kle deg til kampen — passer, gratis

Værvarsel for stadion ved avspark, oversatt til råd: «8° og 9 m/s føles
som 4°. Regn fra 16.30. Ta regnjakke og lue.» Rådet regnes fra følt
temperatur, vind og nedbør neste time. Nowcast gir nedbør i 5-minutters
oppløsning, så «det holder opp til pause» er mulig. Sunrise gir «kampen
ender i skumring» for kveldskamper i Tromsø i oktober.

*Data:* MET Locationforecast, Nowcast, Sunrise. Ingen nøkkel, krever
User-Agent, derfor via funksjon. 16 stadioner er 16 cache-nøkler med én
times levetid, altså rundt 400 kall i døgnet mot MET uansett antall
lesere. Kreditering «Basert på data fra MET» er påkrevd.

### Hvor vises kampen — håndarbeid, høy verdi

Kanal per kamp i kortet: åpen TV 2 Direkte eller bare TV 2 Play. Regelen
er stabil til 2034: alle kamper på Play, et utvalg per runde åpent. Det
finnes ingen lovlig feed for utvalget. NFF slipper det som artikler ti
runder om gangen, så det er en JSON-fil i repoet med rundt 240 rader i
sesongen, oppdatert fire ganger i året.

*Data:* NFFs rundeoppsett, manuelt. API-Football har ikke kringkaster.
LiveSoccerTV og NIFS har data, men krever avtale.

### Puben nærmest stadion — passer, gratis

Alle puber og barer innen 800 meter av stadion, med åpningstid og
nettside der OSM har det. Kan ikke love at puben viser kampen, men kan si
«4 puber innen gangavstand, 2 åpne fra 12». Leseren kan merke sin egen
stampub lokalt i nettleseren, uten at noe lagres hos oss.

*Data:* OpenStreetMap via Overpass. Sender CORS-headere, men proxy med
ett døgns cache per stadion er riktig, så 100 lesere på kampdag ikke gir
429. Kreditering «© OpenStreetMap contributors» må stå synlig.

### Dit og hjem — passer, krever posisjon

Neste avgang til stadion fra der leseren står, og bysykler ledige ved
stadion akkurat nå. Posisjonen spørres om i nettleseren og sendes bare
til Entur, aldri til oss. Bysykkel-delen krever ingen posisjon og kan stå
i kortet alltid.

*Data:* Entur JourneyPlanner og Mobility v2, som samler alle norske
bysykkelfeeder bak én header. Ingen nøkkel, krever ET-Client-Name. Om
Entur svarer med CORS er uverifisert, så test ett fetch fra prod før du
velger proxy eller ikke.

### Styrketabellen — passer, signaturtall

Elo-rating for alle norske klubber ved siden av poengtabellen, og
vinnersjanse per kamp i neste runde. Det er det nærmeste vi kommer et
eget «signaturtall» uten odds-lisens, og det er lov å vise i Norge fordi
det ikke er et spilltilbud.

*Data:* ClubElo, CSV, daglig. Bare over http, så proxy er obligatorisk.
Navneformen for norske klubber i adressen er uverifisert.

### Tabellen om du får bestemme — passer, ingen ny kilde

Leseren tipper resultatene i de gjenstående rundene og ser tabellen
flytte seg. Ren klientlogikk over data appen allerede henter. Fungerer
best i oktober og november, når det er det alle snakker om.

*Data:* Tabell og terminliste appen har. Null nye kall, null nye
avhengigheter, testbar i lib-stil.

### Stadionet — passer, grunnmur

Koordinater, kapasitet og stiftelsesår for alle klubbene. Ikke en
funksjon i seg selv, men grunnmuren de tre første ideene står på. Hentes
én gang og legges som JSON i repoet.

*Data:* Wikidata SPARQL, CC0, støtter CORS. Én spørring, deretter
statisk fil. Sjekk at små stadioner faktisk har koordinater fylt ut.

### Kampstart om en time — første lagrede leserdata

Web Push før avspark for laget du følger. Verdien er reell, men det blir
appens første npm-avhengighet og første lagring av noe om leseren, siden
abonnementet må ligge i Netlify Blobs. «Mål!» er ikke mulig uansett,
gratisnivået gir ikke live-data. Vent med denne til kampdag-kortet har
bevist verdien.

*Data:* Terminlisten. Teknisk: VAPID, web-push i en Scheduled Function,
iOS krever «lagt til Hjem-skjerm».

### Terminlisten i kalenderen — passer, ingen ny kilde

En ics-fil per lag som leseren abonnerer på i egen kalender. Får «ut av
appen»-effekten som de store bruker push til, uten push, uten lagring og
uten konto. Kanalen fra «Hvor vises kampen» kan stå i beskrivelsen.

*Data:* Terminlisten appen har, servert av en funksjon med lang cache.

## Datakildene, teknisk

Alt under er gratis. Enkelhet vekter ingen nøkkel, triviell proxy,
cachbart og ingen ny avhengighet. Skille betyr hvor synlig og unik
funksjonen blir for en Eliteserien-leser. Skala 1 til 5.

| Kilde | Gir | Nøkkel og vilkår | Fra nettleser? | Ferskhet | Enkelhet | Skille |
|---|---|---|---|---|:-:|:-:|
| MET Locationforecast + Nowcast | Time-for-time-varsel og nedbør neste to timer i 5-min oppløsning | Ingen nøkkel. User-Agent påkrevd, maks 4 desimaler, CC BY 4.0 med kreditering. Ikke bruk «Yr» i navnet. | Nei, User-Agent kan ikke settes fra nettleser. Funksjon. | Hver time / hvert 5. min | 5 | 5 |
| MET Sunrise 3.0 | Soloppgang og solnedgang for dato og punkt | Som over | Funksjon | Statisk per dato | 5 | 2 |
| Wikidata SPARQL | Stadion, koordinater, kapasitet, stiftet, farger | Ingen. CC0. 60 s spørretid per minutt. | Ja, dokumentert CORS. Men kjør én gang og lagre. | Statisk | 5 | 3 |
| Entur Mobility v2 | Bysykler og sparkesykler nær et punkt, hele landet | Ingen nøkkel. ET-Client-Name påkrevd. NLOD. | Uverifisert. Egendefinert header gir preflight uansett. | 10 sekunder | 4 | 4 |
| Overpass (OSM) | Puber og barer innen radius, åpningstider, nettside | Ingen. Ca. 10 000 kall/døgn. ODbL, synlig kreditering. | Ja, men feilsvar mangler CORS-header. Proxy med døgncache anbefales. | Minutter | 4 | 4 |
| Entur JourneyPlanner + Geocoder | Reiseforslag punkt til punkt med sanntid, adressesøk | Ingen nøkkel. ET-Client-Name. Egen kvote for trip-kall, 429 ved brudd. | Uverifisert, test fra prod | Sanntid | 3 | 4 |
| ClubElo | Elo per klubb siden 1939, kamper med sannsynligheter | Ingen. Ingen publiserte grenser. Hent daglig. | Nei, bare http. Funksjon. | Daglig | 3 | 3 |
| TheSportsDB | Terminliste 2026 for Eliteserien (liga 4358), tabell, tilskuertall, crowdsourcet TV-liste | Testnøkkel «3», 30 kall/min. Kommersielle vilkår på gratis er uverifisert. | Funksjon | Crowdsourcet, hullete | 3 | 2 |
| API-Football, flere endepunkt | Lineups, hendelser, skader, odds, predictions, venue uten koordinater | Nøkkelen vi har. Sesongvinduet 2022–2024 stopper alt for 2026. | Funksjon, som i dag | Historikk | 3 | 2 |
| Web Push via Netlify Blobs | Varsel før avspark | VAPID-nøkler, Blobs trekker fra månedlige credits. Endepunkt-URL er personopplysning. | Krever funksjon og lagring | Planlagt | 2 | 4 |
| TV-kanal per kamp | Åpen kanal eller bare Play | Ingen lovlig feed. Håndvedlikeholdt JSON, eller avtale med LiveSoccerTV/NIFS. | Statisk fil | Fire ganger i sesongen | 2 | 5 |
| Vegvesen DATEX | Vegstenginger ved stadion | Krever tilgangssøknad, XML | Funksjon | Sanntid | 1 | 2 |

Utelatt fordi de ikke dekker Eliteserien eller ikke finnes:
football-data.org, OpenFootball, Understat, Norsk Tipping-API,
fotball.no-API, Apple Sports.

## Det som stopper, og veien rundt

### Terminlisten for 2026

Gratisnivået hos API-Football svarer «season, try from 2022 to 2024» på
alt utenfor vinduet. Dette er
[#35](https://github.com/runevangen/sb/issues/35). Kampdag-kortet
trenger en kamp med dato, klokkeslett og hjemmebane for i år, ellers har
det ingenting å vise. To veier:

- **TheSportsDB gratis.** Eliteserien har liga-id 4358, og
  `eventsnextleague.php` gir kommende kamper for 2026 med stadionnavn.
  Crowdsourcet, så en test bør sjekke at rundene stemmer mot NFF.
  Kommersielle vilkår på gratisnøkkelen er uklare og bør avklares.
- **Betalt API-Football.** Åpner også lineups, hendelser og skader for i
  år. Kostnaden er kjent for deg, og #35 er der avgjørelsen hører hjemme.

### Kringkaster

Ingen feed. Håndarbeid fire ganger i sesongen er ærlig og billig.
Alternativet er en avtale med LiveSoccerTV eller NIFS, som leverer til
NRK og TV 2. Skraping av TV 2 eller fotball.no frarådes: udokumenterte
endepunkt, opphavsrettslig grått, og en sikkerhetsprofil vi har jobbet
for å holde smal.

### Personvern

Vær, pub og bysykkel trenger bare stadionets koordinater, som er
offentlige. Reisesøk trenger leserens posisjon, som må gå direkte fra
nettleseren til Entur og aldri innom oss. Push er den eneste ideen som
lagrer noe om leseren, og derfor den siste.

### Kvoten

Alle kildene over tåler mønsteret som allerede gjelder: én funksjon per
datasett, kant-cache med `Netlify-CDN-Cache-Control` og `durable`,
feilsvar aldri cachet. Med 16 stadioner som cache-nøkler er trafikken mot
MET, Overpass og Entur uavhengig av antall lesere. Enhetstesten som
vokter døgnkvoten hos API-Football kan få søsken for hver ny kilde.

**Arkitektur i én setning.** En ny funksjon
`netlify/functions/kampdag.mjs` tar en stadion-nøkkel, slår sammen vær,
sol, puber og bysykler til ett svar, cacher det på kanten i en time, og
visningen viser det under «Neste runde» i fotballfanen. Rene funksjoner
for følt temperatur og kleråd hører hjemme i `fotball-data.js`, der de
kan testes på millisekunder.

## Anbefalt rekkefølge

1. **Avklar terminlisten (#35).** Prøv TheSportsDB mot NFFs rundeoppsett
   i en enhetstest. Stemmer den, er kampdagen gratis. Stemmer den ikke,
   er betalt API-Football svaret, og det er en avgjørelse for deg, ikke
   for koden.
2. **Stadion-JSON fra Wikidata.** Én spørring, én fil i repoet, én test
   som sier fra om en klubb i tabellen mangler koordinater. Alt som
   følger henger på denne.
3. **Kle deg til kampen.** MET via funksjon, kleråd som ren funksjon med
   tester. Første synlige ting ingen norsk konkurrent har, og den koster
   minst.
4. **Hvor vises kampen.** JSON-fil med åpne kamper per runde. Høyest
   verdi per rad, og null risiko.
5. **Pub og bysykkel.** Overpass og Entur Mobility i samme funksjon som
   været. Kreditering i bunnen av kortet.
6. **Reisesøk, styrketabell, kalender.** Hver for seg små. Rekkefølgen
   etter det leserne faktisk trykker på, lest fra Netlifys
   forespørselsgraf.

## Uverifisert i denne runden

Sandkassen fikk ikke kalle domenene direkte. Sjekk i nettleser før
beslutning:

- Om Entur og bysykkel-feedene sender CORS-headere.
- ClubElos navneform for norske klubber, og om de sender CORS.
- TheSportsDBs kommersielle vilkår på gratisnøkkel, og om
  stadionkoordinater finnes der.
- API-Footballs påstand om kommersiell bruk på gratisnivå, mot deres egne
  vilkår.
- Omfanget av HvorVises.no, og om FotMob står bak TV 2s app (pakkenavnet
  `com.mobilefootie.tv2` antyder det).
- Wikidata-id for 2026-sesongen av Eliteserien.

## Sentrale kilder

- [MET HowTo](https://api.met.no/doc/locationforecast/HowTO) ·
  [MET lisens](https://api.met.no/doc/License)
- [Entur autentisering](https://developer.entur.org/pages-intro-authentication) ·
  [Entur Mobility v2](https://developer.entur.org/pages-mobility-docs-mobility-v2)
- [Overpass fair use](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Wikidata SPARQL](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service)
- [ClubElo API](http://clubelo.com/API)
- [TheSportsDB Eliteserien](https://www.thesportsdb.com/league/4358?lan=NO)
- [API-Football](https://www.api-football.com/documentation-v3)
- [FotMob og The Weather Company](https://www.weathercompany.com/case-studies/fotmob/) ·
  [FotMob TV-guide Norge](https://www.fotmob.com/nb/tv-guide/no)
- [VG om medieavtalen til 2034](https://www.vg.no/sport/i/xrlq7Q/tv-2-forlenger-eliteserien-til-2034-vg-og-schibsted-tar-over-cupen)
- [NFF rundeoppsett](https://www.fotball.no/turneringer/eliteserien/2026/eliteserien-slik-spilles-runde-13-til-22/)
- [Digiday om The Athletic](https://digiday.com/media/the-athletic-invests-in-live-blogs-video-to-insulate-sports-coverage-from-ai-scraping/)
- [Lottstift om spillreklame](https://lottstift.no/for-spillere/mye-av-pengespillreklamen-du-ser-er-ulovlig/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
