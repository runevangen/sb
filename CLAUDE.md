# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no. Ingen byggesteg. Hostes på Netlify som
prosjektet `mvp-sb`.

    index.html    markup, meta og temaskriptet som må kjøre før rendering
    app.css       all stil
    app.js        appen, lastet som modul
    lib.js        rene funksjoner uten DOM, importeres av app.js og av testene
    sw.js         service worker: cacher bare skallet, aldri /api/
    netlify.toml  proxy mot WordPress

    bilder/       annonsebilder. prem-{portrett,bred,hoy}.jpg er samme
                  bilde i tre utsnitt, ett per form pa den ledige plassen

    BACKLOGG.md   peker til issues, som er den ekte backloggen
    docs/         dypdykk og notater som ikke er kode
                  nokler-og-tokens.md: alle hemmeligheter, hvor de settes,
                  hva som svikter uten dem, og hvordan de fornyes
                  oppsett.sql: all SQL-en Supabase trenger, i rekkefølge,
                  trygg å kjøre om igjen

    fotball.js                    fotballmodulen (beta): visningen
    fotball-data.js               samme modul: rene funksjoner
    netlify/functions/fotball.mjs samme modul: henting og caching
    vaer-data.js                  været ved avspark: arenaer, varsel, kleråd
    netlify/functions/vaer.mjs    samme: henting fra MET og caching
    pub-data.js                   pubene rundt kampen: Overpass, Entur, dine puber
    puber-oslo.js                 kuratert liste: Oslo-puber som viser fotball
    puber-kontakt.js              samme puber: telefon, mat, apningstider — uverifisert
    netlify/functions/puber.mjs   samme: puber ved stadion og holdeplass, døgncache

    pin-data.js                     innlogging med fornavn og PIN: rene funksjoner,
                                    og brukerlista adminportalen viser
    netlify/functions/brukere.mjs   admin: se, endre PIN og slette brukere.
                                    Den ene fila med en service_role-nøkkel
    konto-data.js                   innlogging: rene funksjoner (økt, og den
                                    parkerte e-posthalvdelen)
    netlify/functions/konto.mjs     samme: konto og økt via Supabase Auth,
                                    og hvilke fornavn som er tatt
    svar-data.js                    «jeg blir med»: rene funksjoner
    netlify/functions/svar.mjs      samme: lesing for alle, skriving med din egen økt

    personvern.html                 hva vi lagrer, og hvordan du blir kvitt det

    admin.html / admin.js            adminportalen: hvilke kamper viser hvilken pub
    visning-data.js                  samme: rene funksjoner, ogsa for lesersiden
    netlify/functions/visninger.mjs  samme: passord og skriving til repoet
    visninger.js                     dataene portalen skriver, lest av appen

`lib.js` finnes for å kunne enhetstestes uten nettleser. Hører en funksjon
hjemme der — ingen DOM, ingen nettverk, ingen lagring — så legg den der.

## Slik vil jeg ha svar

- **Still spørsmål som kan klikkes.** Bruk AskUserQuestion med konkrete
  alternativer, ikke åpne spørsmål i brødteksten.
- **Avslutt hvert svar med en statusblokk** som inneholder:
  - hva som er siste nytt (hva du nettopp endret),
  - hvor jeg finner det (prod-URL, branch, PR),
  - om du venter på meg eller ikke.

## Arkitektur

- Feeden hentes fra WordPress REST via en proxy på eget domene.
  Reglene ligger i `netlify.toml` og er bevisst smale: kun `/posts` og
  `/categories`, aldri wildcard mot `wp/v2` — det ville åpnet en vei inn
  til `/users`, som lister brukernavn.
- Ingenting skal kreve endringer på sportsbibelen.no.
- Hemmelighetene appen trenger — API-nøkler, adminpassordet,
  GitHub-tokenet — står samlet i `docs/nokler-og-tokens.md`: hvor hver
  settes, hva som svikter uten den, hvordan den fornyes, og hvilket
  endepunkt som sier fra når noe er galt. Legger du til en ny nøkkel,
  hører den hjemme der. To ting gjelder alle: funksjonene leser miljøet
  ved utrulling, så en ny variabel krever en ny deploy, og
  miljøvariabler er versalfølsomme.
- Artikkel-HTML renses med en allowlist før den vises. Ukjente tagger
  pakkes ut til tekst. Utvid allowlisten framfor å lage unntak.
- Fargene ligger som CSS-variabler i `:root`. Et tema overstyrer kun
  variabler. Tekst som ligger oppå bildegradienten bruker `--on-overlay`,
  ikke temaets tekstfarge — gradienten er mørk i begge temaer.
- Tekststørrelser skaleres av `--fs`. Avstander og rammer skaleres ikke.
- Ruting går på hash (`#/sak/<slug>`), ikke sti. En sti ville gitt 404 ved
  oppfriskning uten en ny regel i `netlify.toml`, og den skal holdes smal.
  Å åpne en sak legger en tilstand i historikken, så telefonens
  tilbakeknapp lukker artikkelen i stedet for appen.
- Lenker i artikkelteksten til vårt eget domene får `data-slug` og åpnes i
  appen. `href` beholdes, så lenken virker om noe feiler, og lang-trykk
  oppfører seg normalt.
- **Den ledige annonseplassen er vår egen, og merkes ikke som reklame.**
  Fire av de fem annonsørene i `ADS` i `app.js` er oppdiktede (#25). Den
  femte er ingen annonsør: den selger plassen den står i, og ber om en
  prat med Prem. Den står først i lista, så den ene som er sann er den man
  ser først. Merket sier «Ledig plass» og `aria-label` «Ledig
  annonseplass» — å merke vår egen tekst som reklame fra en annonsør ville
  vært å lyve i akkurat den merkingen appen ellers er nøye på, og
  markedsføringsloven ber om det motsatte. Formen er stiplet ramme og
  ingen fylt flate, men den roper ikke høyere enn en ekte annonse ville
  gjort: en plass som overdøver innholdet rundt seg selger ikke plassen.
  `MESSENGER` i `app.js` er brukernavnet etter `m.me/` — det samme som
  står etter `facebook.com/` i profilen. Står det tomt, blir knappen ren
  tekst framfor en død lenke. Lenka åpner i en ny fane med `noopener`, så
  den nye fanen ikke kan røre appen bak.
- **Plassen står i tre former, og ansiktet er poenget.** Det er en person
  man skal sende en melding til, ikke et skjema, så man skal se hvem.
  `form` i annonsen velger fasongen, og de tre står spredt utover `ADS`
  med vilje: plassene kommer etter hver fjerde sak, så to av dem kan stå
  på samme skjerm — tre like bokser leses som støy, tre ulike som tre
  plasser.
  - `portrett`: rundt bilde ved siden av teksten, som en person i en
    kontaktliste.
  - `bred`: bildet som et 16:9-band over teksten, med solnedgangen i.
    Bannerannonsenes egen flate er 120 px høy, og et ansikt får ikke plass
    der — kuttet ville gått gjennom haka. Vår egen plass trenger ikke
    følge deres mål.
  - `hoy`: bildet er flata, og teksten ligger oppå gradienten nederst,
    som toppsaken i feeden. Derfor `--on-overlay`, ikke temaets
    tekstfarge: gradienten er mørk i begge temaer.
  Utsnittene ligger ferdig beskåret i `bilder/` — ingen byggesteg, så
  nettleseren skal ikke skalere et kvadratisk bilde ned til et band.
  Bredde og høyde står på hver `<img>`: uten dem vokser annonsen når
  bildet lastes, og dytter saken man holder på å lese nedover. `alt` er
  navnet hans, ikke en beskrivelse av bildet — den som ikke ser det, skal
  vite at det er en person her.
- Ingen statistikk i det hele tatt, med vilje. Appen har null
  sporingsskript, ingen informasjonskapsler og ingen samtykkebanner.
  Bruken leses av Usage-grafen i Netlify — båndbredde og forespørsler —
  som er grov, men gratis og allerede der.
  `track()` i `app.js` står igjen som en tom operasjon, så de femten
  hendelsene fortsatt er merket i koden. Skal de samles inn en gang, er
  det ett skript i `index.html` og ingen endringer i resten.
  Netlify Analytics ville målt på serveren uten noe skript, men er et
  betalt tillegg per prosjekt — valgt bort inntil videre.
  Innloggingen endrer ikke dette: den lagrer fornavnet til den som selv
  velger å logge inn, og fortsatt ingenting om alle andre. Ingen sporing,
  ingen informasjonskapsler, ingen samtykkebanner.
- Et søk sorteres etter relevans hos WordPress (`orderby=relevance`),
  ikke dato: ellers fyller de tolv nyeste sakene som nevner laget i
  forbifarten første side. Innenfor det som er hentet legger
  `rangerTreff()` i `lib.js` tittel-treff øverst, så brødtekst-treff, så
  resten — nyeste først innenfor hver gruppe. Rangeringen skjer i
  `renderFeed`, ikke der dataene hentes, så «Vis flere» rangerer hele
  lista på nytt. Sammenlikningen folder norske tegn og HTML-entiteter,
  så «Bodø/Glimt» treffer tittelen «Bod&#248;/Glimt». Samme mekanisme er
  tenkt brukt til å løfte favorittlag i feeden (#24).
- Favorittlag velges med stjernen ved lagnavnet i tabellen og lagres i
  `localStorage` sammen med tema og skrift (`sb-visning`, feltet `lag`).
  Ingen konto, ingen data hos oss. Feeden løfter sakene om lagene med
  samme `rangerTreff()` som søket, men med terskel 2: bare saker som har
  laget i tittelen eller som kategori. En sak som nevner laget i
  forbifarten skal ikke skyve dagens toppsak nedover uten at leseren ser
  hvorfor. At rekkefølgen er endret står som en linje øverst i feeden,
  og linja er en knapp til tabellen, der valget gjøres om. Et søk
  overstyrer favorittene: da rangeres det etter søkeordet.
  Innlogging (#24) er dermed en synkroniseringssak, ikke en forutsetning.
- Menyen har to veier ut: krysset i hjørnet og en bred knapp nederst.
  Krysset ligger under statuslinja på iPhone, der tommelen ikke rekker og
  fingeren treffer skjermkanten i stedet. Meldt fra faktisk bruk
  13. september 2026.
- Filtrerer noe feeden — et søk eller en kategori — står det i toppfeltet
  som en knapp med kryss, ikke som ren tekst. Et filter uten vei ut blir
  stående til man åpner menyen og finner «Alle saker», og krysset i
  søkefeltet på iOS tømmer bare teksten uten å kjøre søket på nytt. I
  fotball er teksten ren: ligaen byttes, den fjernes ikke.

### Fotball (beta)

- Data hentes fra API-Football via en Netlify Function, ikke via en
  redirect: en redirect kan ikke sette en hemmelig header, og nøkkelen
  skal aldri nå nettleseren. Den ligger i `api_football_key` i
  Netlify-miljøet; funksjonen godtar også `API_FOOTBALL_KEY`, siden
  miljøvariabler er versalfølsomme. Uten nøkkel svarer funksjonen 503 med
  en synlig melding.
- Nyheter og fotball er to visninger i det samme kortet, valgt med
  bunnfanene. Begge ligger i DOM-en hele tiden — feeden skal stå klar bak
  fanen, med rulleposisjonen der leseren forlot den.
- Ruting: `#/fotball/<liga>/<del>`, begge ledd valgfrie og gjenkjent på
  innhold framfor rekkefølge. Ukjente ledd faller tilbake til standard, så
  en klippet lenke åpner noe framfor ingenting.
- Menyen beskriver visningen du står i: kategorier i nyheter, ligaer i
  fotball.
- API-Football skriver lagnavn uten norske bokstaver («Bodo/Glimt»,
  «Tromso»). `redaksjonsnavn()` i `fotball-data.js` oversetter til
  redaksjonens skrivemåte i det ene stedet dataene formes, så tabell,
  kamplister og lagsøk ser samme navn. Nøkkelen er navnet normalisert
  (små bokstaver, norske tegn foldet, tegnsetting fjernet), så lista
  tåler at API-et endrer skrivemåte. Ukjente navn går uendret gjennom —
  bare lag der API-ets form faktisk avviker står i lista.
- Lagnavnet i tabellen er en knapp, ikke en klikkbar rad: den nås med
  tastatur og leses opp som noe man kan trykke på. Den kaller samme
  `startSok` som søkefeltet, så et lagsøk oppfører seg nøyaktig som et
  søk man skriver selv — samme nullstilling, samme toppfelt, samme vei
  tilbake.
- Tabellen viser alle kolonnene. Et langt lagnavn brytes over to linjer
  framfor å gjøre tabellen bredere enn telefonen, så alt får plass også
  med stor skrift. Blir feltet likevel for smalt, ruller tabellen
  vannrett i sitt eget felt: `.phone` klipper alt som stikker utenfor, så
  et felt uten `overflow-x` ville skjult de siste kolonnene uten vei
  tilbake. Testen smalner feltet med vilje og ruller det faktisk, framfor
  bare å måle bredden.
- Adressen settes av `export const config` i funksjonen. Da slipper
  `netlify.toml` en ny regel, og redirect-reglene der holder seg smale.
- Gratisnivået dekker bare sesongene i `SESONGVINDU` (nå 2022–2024) og
  svarer «season, try from 2022 to 2024» på alt utenfor. Funksjonen spør
  derfor om nyeste sesong abonnementet gir, og sier fra i svaret
  (`sisteSesong: false`) når det ikke er den vi står i. Visningen setter
  sesongen over tabellen — en tabell fra i fjor som ser ut som årets er
  verre enn ingen tabell. Utvides abonnementet, er `SESONGVINDU` det
  eneste stedet tallene står.
- En sesong utenfor vinduet hentes først fra TheSportsDB (liga-id i
  `tsdb` i `LIGAER`, testnøkkel «3», eller `THESPORTSDB_KEY`), som gir
  årets tabell, resultater og neste runde gratis. Svikter den — nettverk,
  uventet form, ingenting — får leseren API-Footballs svar som før.
  Svaret sier hvor det kom fra (`kilde`), og stempelet under viser det.
  Alle tre er sett virke i prod 10. september 2026 — men gratisnøkkelen
  kapper svarene (fem tabellrader, én kamp i listene). Et avkortet svar
  vises aldri som årets: `TSDB_MINST` i `fotball-data.js` er det minste
  som regnes som helt, og under det brukes API-Football som før. Med en
  Patreon-nøkkel i `THESPORTSDB_KEY` prøves v2 (`/api/v2/json/`, nøkkelen
  i `X-API-KEY`-headeren) og deretter v1 med nøkkelen i adressen — Patreon
  gir begge varianter, og vi vet ikke hvilken nøkkelen er. Svaret bærer
  `forsok`: hva som ble prøvd, statuskode, tjenestens egen feilmelding,
  antall og utfall, uten nøkkel og uten adresser, så det kan leses rett fra nettleseren
  (`/api/fotball/tabell?liga=eliteserien`) når noe ikke stemmer. Da kommer full tabell, hele
  runder, og dermed deling og vær: det er den ene bryteren. Men
  funksjonene leser miljøet ved deploy, og kant-cachen holder forrige
  svar i inntil tre timer — så etter at nøkkelen er satt, må det
  deployes på nytt (Netlify → Deploys → Trigger deploy) før noe endrer
  seg. En deploy tømmer også cachen.
  Parserne tar den første lista de finner i svaret, så et annet
  feltnavn ikke velter noe. Sett virke i prod 11. september 2026 med
  Patreon-nøkkel: full tabell for 2026. Første forsøk feilet fordi
  nøkkelen var limt inn med ett siffer for lite — `forsok` viste 400 fra
  begge utgavene, og det var det som pekte på nøkkelen framfor koden.
  TheSportsDB skriver sesongen «2026»
  for kalenderligaer og «2026-2027» for dem som krysser nyttår
  (`tsdbSesong`).
- Hele kamplinja er trykkflaten, ikke en pil i hjørnet. Raden kan ikke
  selv være en `<button>` — den inneholder pubnavn-knappen, og en knapp i
  en knapp finnes ikke — så `.kamp-del` er en ekte knapp lagt utstrakt
  over `.kamp-linje` (`position: absolute; inset: 0`), mens pubnavnet
  løftes over med `z-index`. Ett tastaturmål per kamp, lest opp som
  «Rosenborg – Tromsø. Hvor skal du se den?». Pilen er dekor
  (`pointer-events: none`) og roterer når raden er åpen, så den viser
  tilstand framfor å være det eneste man kan treffe.
- Den åpne kampen får en ramme i aksentfargen. Raden er derfor en
  beholder og `.kamp-linje` rutenettet inni: rammen skal omslutte alt som
  hører til kampen — tiden, været, puben og panelet — så panelet ligger
  inne i raden, ikke som en løsrevet rad under den. Bunnen er
  `--accent-wash`, egen variabel i begge temaer: på svart er en dyp
  marine (`#0F1730`) nærmere aksenten enn en grå ville vært.
- Været hentes først når kampen åpnes, ikke når runden tegnes. Før kalte
  `kamprad()` `vaerlinje()` for hver eneste kamp, og ti kamper ble ti
  kall mot MET før leseren hadde trykket på noe — og raden vokste og
  hoppet mens den ble lest. `hentVaer` husker per kamp, så å åpne den
  samme igjen koster ingenting, og delingsteksten henter fra samme minne.
  Linja fjernes når raden lukkes.
- **Kampkortet er en liste over steder man kan dra, og ett trykk på et
  sted er svaret.** Overskriften i kortet er «Disse viser kampen:» når en
  pub har meldt inn, ellers «Hvor skal du se den?» — lagene er
  overskriften på selve kampen og står i linja over, så kortet skal ikke
  ha en tittel til som konkurrerer med dem.
  Stedene er pubene som har meldt inn *denne* kampen, arenaen («en plass
  man kan dra», på linje med pubene), stedene vennene alt har sagt at de
  skal til, og stedet en delt lenke pekte på — deduplisert på
  `stedNokkel()`, så en pub som både er meldt inn og har folk står én
  gang. Trykker du på stedet du alt står på, går du av lista igjen: to
  knapper ville betydd at man kan bli med to ganger.
  Før var det tre steg — velg hjemme/pub/stadion, skriv pubnavnet, trykk
  «Jeg skal dit» — og et navnefelt i tillegg, på hver eneste kamp. Tre
  steg for å si én ting.
- **«Hjemme» er borte.** Kortet handler om hvor man møter noen, og sofaen
  er ikke et møtested; det var også det eneste svaret som ikke sa noe om
  hvor du er. Nøkkelen er tatt ut av `HVOR`, så ingenting skriver den
  lenger. Rader som alt står i basen med `hvor='hjemme'` faller til `null`
  i `tolkSvar` — personen står fortsatt på lista, bare uten et sted, og
  det er riktig: hen sa aldri at hen skulle noe sted. Sjekken i SQL-en
  godtar den fortsatt, så ingen migrering trengs. En lenke som alt er
  sendt med `?hvor=hjemme` åpner kampen som før, bare uten et sted pekt
  ut.
- **Pubene som pleier å vise fotball ligger bak en lenke i kortet**, ikke
  framme. De fleste kamper trenger dem ikke, og de var størstedelen av
  støyen: listen, feltet og forslagene kostet fire linjer før man hadde
  sett et eneste sted som svarte på kampen. Har ingen meldt inn noe, er
  lenka den eneste veien videre — da sier den det («Puber som pleier å
  vise fotball»), og lista står åpen med en gang. Ingenting hentes før
  den åpnes: før kostet et trykk på «på pub» to nettkall uansett.
  Et sted du skriver selv er samme svar, bare med et navn vi ikke hadde
  på lista. Stedene du har trykket på blir stående som chips så lenge
  kortet er åpent, også etter at svaret er angret — en chip som
  forsvinner under fingeren er verre enn en chip for mye.
- Stedet fra en delt lenke eller fra «denne kampen vises på»-linja blir
  **pekt ut, ikke valgt**: chipen markeres og får fokus, så svaret koster
  fortsatt ett trykk — leserens eget. Å melde noen på uten at de trykket
  ville vært å svare i deres navn.
- Delingen sender teksten inn i gruppechatten leseren allerede har, og
  krever ingen konto — den går til vennene, ikke til oss. Utlogget velger
  et trykk på et sted stedet *lokalt* i kortet, så teksten kan bære det;
  det som skal stå på lista i appen må noen ha sagt, og det står i kortet.
  Teksten lages av `delingstekst()` i `fotball-data.js`, i norsk tid, og
  er testet: det er det leseren faktisk sender. Fjorårets runde kan ikke
  deles; det står hvorfor. Delingen går gjennom samme `delTekst()` i
  `app.js` som «Del appen», med utklippstavle som reserve.
- Klassen på den delte kampen heter `.kamp-invitert`, ikke `.kamp-delt`.
  Vokteren som sjekker at trykkflata aldri maler noe, matcher selektorer
  på tekst — og `.kamp-del` er en bit av `.kamp-delt`. To navn én bokstav
  fra hverandre betydde dessuten helt ulike ting: knappen som deler, og
  kampen som ble delt. CI fanget det, ikke den lokale kjøringen: en
  `pull_request`-kjøring tester grenen flettet med `main`, så en test som
  er ny på main kjører der før den finnes lokalt.
- Lenka i delingsteksten peker på kampen, ikke på runden: `kamplenke()`
  legger kampen, svaret og stedet i en spørring etter hashen
  (`#/fotball/<liga>/neste?kamp=<id>&hvor=pub&sted=…`), ikke som nye ledd
  i stien — `tolkFotballHash` kjenner ledd igjen på innhold, og en
  kamp-id ligner verken på en liga eller en del. En eldre utgave av appen
  ser bare `#/fotball/<liga>/neste`, så en lenke som alt er sendt virker
  fortsatt. Mottakeren får kampen løftet fram i runden med en linje som
  sier hvor avsenderen ser den, og en «Svar»-knapp som åpner panelet med
  det samme stedet valgt: å bli med skal koste ett trykk, ikke at
  pubnavnet skrives på nytt. Adressen tolkes i `app.js` med
  `tolkKamplenke()` og sendes inn til `visFotball` — modulen eier ikke
  ruting. Finner vi ikke kampen igjen, står runden som før; en
  feilmelding om en kamp som er ferdigspilt hjelper ingen. Stedet i
  lenka er skrevet av hvem som helst: `hvor` valideres mot de tre
  svarene, og navnet kappes ved `STED_MAKS` som i feltet.
- Været ved avspark står under hver kamp i årets neste runde, og går
  inn i delingsteksten. Kilden er MET Norway (Locationforecast 2.0) via
  `netlify/functions/vaer.mjs`: MET krever en User-Agent som sier hvem
  som spør, og den kan ikke settes fra nettleseren. Ingen nøkkel, men
  lisensen krever kreditering, og «Vær: MET Norway» står i stempelet.
  Koordinatene ligger i `ARENAER` i `vaer-data.js`, skrevet inn for hånd
  med tre desimaler (MET vil ikke ha flere) og slått opp på arenanavnet
  slik API-ene skriver det; ukjent arena gir ingen vær, ikke feil sted.
  Kleråd og følt temperatur (JAG/TI, som yr bruker) er rene funksjoner
  med tester. Varselet rekker rundt ni dager; en kamp lenger fram får et
  gyldig, tomt svar. Cache-nøkkelen er adressen med arena og tidspunkt,
  så hver kamp er én nøkkel, og MET spørres høyst en gang i timen per
  kamp. Sett virke i prod 11. september 2026. Feiler kallet, bærer
  feilsvaret `forsok` med status og METs egen melding, som
  fotballfunksjonen.
- **«Hvilken pub?» får ett svar, ikke seks.** Forslagene sto i en gruppe
  per kilde, med hver sin overskrift: «Viser denne kampen», «Kjent for å
  vise fotball», «Nær deg», «Dine puber», «Fotballpuber ved <arena>»,
  «Ved stadion», «Ved holdeplassen». Det var ikke åpenhet, det var støy —
  samme pub sto i tre av dem, og den ene gruppa som faktisk svarte på
  kampen druknet. Meldt fra faktisk bruk 13. september 2026.
  Nå er det én rangert liste på høyst `FORSLAG_MAKS` (seks) chips.
  `rangerForslag()` i `pub-data.js` er rekkefølgen, og rekkefølgen *er*
  svaret: det som gjelder denne kampen først, så dine egne, så kjente
  fotballpuber nær deg, så ved arenaen, så resten fra kartet. Hver pub
  havner ett sted — dedupliseres på `normaliserLagnavn`, samme nøkkel som
  ellers — og merkene slås sammen, så et treff fra kartet ikke skjuler at
  stedet alt har meldt at det viser kampen. Merkene ★ og ⚽ bærer det
  overskriftene sa, og koster ingen linje. Resten ligger bak «Flere
  forslag»; ingenting forsvinner.
- Kildene lander til ulik tid, så hver legger seg i `boks.kilder` og ber
  om en ny tegning. Ett sted bestemmer hva som står på skjermen. Før
  oppdaterte fem grupper seg selv, hver for seg, og det var derfor ingen
  kunne se hvor mange linjer panelet ville ende med.
- `boks.feil` er en **liste**, ikke én streng. Første forsøk på å rydde
  gjorde den til én, og da forsvant den andre feilen når både arenaen og
  «nær deg» sviktet — nøyaktig den diagnostikken som gjør at en feil kan
  meldes videre uten å grave i funksjonsloggen. Nettlesertesten fanget
  det. Begge navngis nå, i samme avsnitt.
- «Puber nær deg»-knappen står bare når den har noe å gjøre: avslått
  posisjon, eller et kart som sviktet. Den sto der alltid før, og var en
  av de seks tingene som fylte panelet — men uten den finnes ingen vei
  tilbake om man ombestemmer seg.
- De fire kildene bak rangeringen, og hvorfor de finnes: feltet er
  fortsatt sannheten. *Nær deg* står først og hentes med en gang:
  kampen spilles ofte et annet sted enn der man ser den. Trykket som
  valgte «på pub» er handlingen telefonen krever for å spørre om
  posisjon, så den kan hentes da framfor etter et trykk til. Posisjonen
  rundes til tre desimaler (≈100 m) og går rett fra nettleseren til
  Overpass, aldri innom oss, og det står under knappen. *Dine puber*:
  de du har delt før, lagret lokalt som favorittlagene (`sb-visning`,
  feltet `puber`), oftest brukt først. *Ved stadion* og *ved holdeplassen*: fra
  `netlify/functions/puber.mjs`, som spør Entur om holdeplassene innen
  700 m og Overpass om puber innen 1200 m, og grupperer (800 m fra
  stadion, 300 m fra holdeplass). Arenaene står fast, så hver er én
  cache-nøkkel med et døgns levetid — Overpass ber om fair use, og dette
  er det. Netlify avbryter en funksjon etter ti sekunder, så alt kappløper
  innenfor én frist (`restTid`): Entur og Overpass samtidig, og alle
  Overpass-tjenerne i `OVERPASS_SPEIL` samtidig. Den første som svarer
  vinner, resten avbrytes — da settler de med en gang, så `forsok` blir
  komplett uten å vente på de trege. Etter tur ble summen av trege
  tjenere større enn fristen, og da kom ingenting: leseren fikk Netlifys
  feilside i stedet for vårt svar, uten `forsok`, som er det eneste som
  sier hvem som sviktet. Overpass-kall må bære
  `Accept: application/json`; uten den svarer hovedtjeneren 406 med en
  HTML-feilside. `OVERPASS_SPEIL` i
  `pub-data.js` er tjenerne, og de spørres samtidig både fra funksjonen og
  fra nettleseren, så én streng eller treg tjener ikke tar ned
  funksjonen. Svikter
  Entur, står pubene ved stadion igjen; svikter alle Overpass-tjenerne,
  502 uten cache og `forsok` som forklarer per tjener — og visningen
  setter den siste linja i `forsok` inn i feilmeldingen
  («overpass-api.de svarte 406»), så det kan meldes videre uten å grave
  i funksjonsloggen. Lisensen (ODbL) krever
  «© OpenStreetMap-bidragsytere» der pubene vises. `uverifisert` til det
  er sett i prod: sandkassen når verken Overpass eller Entur.
- OpenStreetMap vet at et sted er en pub, men ikke om de viser fotball.
  Det er den vurderingen `puber-oslo.js` bærer, og den ligger i koden —
  så «Kjent for å vise fotball» står der også når både Overpass og vår
  egen funksjon er nede. Det er verdt mye her, der Overpass har vært det
  skjøreste leddet. Lista brukes tre steder: en gruppe nær leseren, en
  gruppe ved arenaen der lista dekker den, og et merke på treff fra
  OpenStreetMap som vi vet viser fotball. Rader merket `usikker` vises
  ikke — ett forslag færre er bedre enn ett vi ikke tør stå inne for.
  `sjekkPubliste()` vokter formen, og `unit.mjs` kjører den mot den ekte
  lista: en feilskrevet rad slår ut i testene framfor i appen. Hver rad
  må ha en kilde som er en lenke, og en `sjekket`-dato. En udatert rad er
  verre enn ingen rad; Oslos uteliv flytter seg fort. Koordinatene er
  anslag fra gateadressen, gode nok til å sortere etter avstand, ikke til
  å navigere etter.
- Kontaktopplysningene ligger i `puber-kontakt.js`, ikke i `puber-oslo.js`.
  De to råtner i ulikt tempo: at et sted viser fotball er en redaksjonell
  vurdering som står seg, mens et telefonnummer ikke gjør det. Hvert felt
  bærer kilden og et ordrett sitat, og `tillit` — hvor mange uavhengige
  kilder som sa det samme.
- **Ingenting derfra vises i appen før det er verifisert.** `kontaktFor()`
  i `pub-data.js` gir bare ut felt som har en `verifisert`-dato, satt av
  en person som har sett opplysningen selv. Uten den er raden et forslag,
  og et feil telefonnummer til en ekte bedrift er verre enn ingen.
  `sjekkKontaktliste()` vokter formen — nummerform, e-postform, at
  matvalget er ett av tre, at hvert felt har kilde og sitat — og `unit.mjs`
  kjører den mot den ekte fila. Innsamlingen 11. september 2026 nådde
  ingen av pubenes egne sider; sitatene er slik de sto i søketreffet.
- Gratisnivået gir 100 kall i døgnet. Caching skjer på Netlifys kant med
  `Netlify-CDN-Cache-Control` og `durable`, som gir én delt cache i stedet
  for én per region. Levetidene står i `LEVETID` i `fotball-data.js`, og
  en enhetstest slår ut hvis en ny liga sprenger kvoten.
- Feilsvar caches aldri (`no-store`). Ellers ville et blaff låst seg fast
  i timevis.
- API-et svarer 200 også når noe er galt og legger feilen i `errors`.
  `tolkTabell` kaster på det framfor å vise en tom tabell.

### Hvem viser kampen (admin)

- `admin.html` er en egen side, ikke en visning i appen. Den ligger under
  «Del appen» i menyen og er `noindex`. Portalen skriver ingenting selv:
  den sender valget til `/api/visninger`, som er det eneste stedet
  passordet (`ADMIN_PASSORD`) og GitHub-tokenet (`GITHUB_TOKEN`) finnes.
  Passordet sammenliknes i konstant tid, og et feil passord når aldri
  GitHub.
- Passordet først: resten av portalen ligger skjult til tjenesten har
  godtatt det (`handling: "sjekk"`, som bare svarer ja eller nei).
  Skjulingen er ikke sikkerheten — den ligger i funksjonen, som krever
  passordet ved hver skriving — men den som åpner sida skal se ett felt,
  ikke et skjema hen ikke kan lagre. Innloggingen sparer også et kall
  mot API-Football per åpning: kampene hentes først etterpå, og
  døgnkvoten er hundre. Passordet lever i en variabel i modulen, ikke i
  feltet og ikke i `sessionStorage`; feltet tømmes, og en oppfriskning
  krever ny innlogging.
- Mangler en av hemmelighetene, svarer funksjonen 503 og sier hvilken —
  «Portalen er ikke satt opp» alene sender admin til å lete i koden
  etter noe som står i Netlify-panelet. Et `GET /api/visninger` spør
  bare om oppsettet (`klar`, `mangler`), og portalen gjør det ved
  åpning: da står det der før kampene er krysset av, ikke etter. Husk at
  funksjonene leser miljøet ved utrulling, så en ny variabel krever en
  ny deploy.
- Kampene admin krysser av hentes fra `/api/fotball/neste` — samme
  endepunkt som fotballfanen. Ligaene kommer fra `LIGAER` i
  `fotball-data.js`, ikke fra en egen liste, så de to ikke kan gli fra
  hverandre. Bytter admin liga, hentes den ligaens kommende kamper.
  Kampene som sto på skjermen sendes med lagringen, så funksjonen slipper
  å hente dem på nytt og vi vet at det er de samme.
- Lagringen er en commit: funksjonen leser `visninger.js` fra GitHub
  (sha og innhold), fletter inn valget med `slaSammen` i
  `visning-data.js` og skriver fila tilbake. Fila er derfor gyldig JSON
  inni en `export`, så funksjonen kan lese den ekte tilstanden fra
  repoet framfor å stole på en utrullet kopi. `utenGamle` kaster kamper
  som er spilt for lenge siden, så lista ikke vokser i det uendelige.
  En commit utløser en deploy, så endringen er ute i appen etter et
  minutt eller to — og går noe galt, kan fila rettes for hånd.
- `slaSammen` rører bare den ene puben og de kampene som sto på
  skjermen. To puber kan settes etter hverandre, og en annen ligas
  visninger overlever et bytte.
- Pubene kommer fra `puber-oslo.js`; en pub som ikke står der, avvises av
  funksjonen. `usikker` vises ikke i appen og kan derfor ikke velges her
  heller.
- Leseren ser det to steder. På kampen selv står «Denne kampen vises på:
  Lincoln Pub» rett under raden, så den som blar gjennom runden ser det
  uten å åpne noe; pubnavnet er en knapp som åpner delingspanelet med
  «på pub» og puben ferdig valgt. I panelet står de samme pubene som
  egen gruppe aller øverst — den eneste gruppa som svarer på *denne*
  kampen, mens resten er steder som pleier å vise fotball. Dukker samme
  pub opp igjen under «Nær deg» eller ved arenaen, bærer den samme
  stjerne der (`merkBekreftet`), så den ser lik ut overalt.
- Det står «Meldt inn til oss» under gruppa, ikke «Puben bekrefter»:
  inntil pubene skriver selv (#65) er det vi som har ført det inn, og
  leseren skal vite forskjellen.
- Fargen er `--bekreftet`, en egen variabel i begge temaer: `#1F7A4D` er
  for mørk på svart. Stjerna sier noe annet enn ballen — ballen betyr at
  stedet pleier å vise fotball, stjerna at nettopp denne kampen vises.
  Stjerna i tabellen er en annen sak: den velger favorittlag, og de to
  møtes aldri på samme skjerm.
- Nettlesertesten legger sin egen `visninger.js` i temp-katalogen, og
  testtjeneren serverer den framfor den i repoet. Da kan lesersiden
  testes med ekte data uten at `visninger.js` fylles med oppdiktede
  puber.

### Innlogging

- **Ingenting er låst bak innlogging.** Nyheter, fotball, tabell,
  favorittlag, deling, puber og vær virker nøyaktig som før uten konto,
  og skal fortsette å gjøre det. Innlogging er for det som går til noen
  andre, eller til en annen telefon: å dele hvor du ser kampen, og å ta
  med favorittlagene dine. En knapp i menyen ser ut som en port, så
  panelet sier med ord at den ikke er det — teksten står ett sted
  (`KONTO_TEKST` i `app.js`) for alle fire tilstandene, og en
  nettlesertest sjekker at feeden står ferdig før noen har logget inn.
- **Fornavn og PIN.** Første gang velger du de to, neste gang skriver du
  de samme, og er inne — også på en annen telefon. Paret *er* kontoen.
- **To steg: navnet først, PIN-en etterpå**, og det er ikke kosmetikk.
  Er navnet ledig, *lages* en PIN der og da, og da må den gjentas: vi har
  ingen e-post å sende en ny kode til, så en feiltastet PIN ved
  opprettelse gjør kontoen utilgjengelig og brenner navnet. Er navnet
  kjent, står det «skriv PIN-en du valgte» og ett felt — den som kommer
  tilbake skal ikke møte noe som ser ut som en registrering. Steg to
  viser navnet som overskrift, så du ser hvem du er i ferd med å bli, og
  «Bytt navn» er veien tilbake. Formen er hentet fra Dagslogg-appen.
- At de to PIN-ene er like sjekkes i appen, ikke hos tjenesten: en
  tjeneste kan ikke se at du tastet feil to ganger på rad, og en konto
  laget med feil PIN er ikke til å rette opp.
- **Hvorfor ikke engangskode på e-post:** den virker, men avsenderen må
  ligge på et verifisert domene for at andre enn kontoeieren skal få
  koden, og domenet er ikke kjøpt. Hele e-postinnloggingen — funksjonen,
  malene, Resend-oppsettet og de fire fellene som kostet halvannen dag å
  finne — står komplett på grenen `epost-innlogging`, og fellene står
  fortsatt i `docs/nokler-og-tokens.md`, i et avsnitt merket som parkert.
  `konto-data.js` beholder derfor e-posthalvdelen: den er parkert, ikke
  kastet, og enhetstestene holder den i orden.
- Innloggingen er første steg mot fire ting: å se hvem som blir med på
  kampen, at valgene dine følger deg mellom enheter (#24), at pubene
  skriver selv (#65), og faste vennegrupper. Ingen av dem er bygget ennå,
  og panelet lover ikke noe annet.
- Supabase Auth holder kontoen. Å skrive det selv ville vært lagring av
  passord, sperring av gjentatte forsøk og utstedelse av økter — feil sted
  å spare. Og identiteten *må* finnes hos tjenesten, ikke bare i
  telefonen: hele poenget er at de samme to feltene virker på en annen
  telefon.
- **Fornavnet blir en adresse hos tjenesten**, fordi det er det Supabase
  Auth kjenner: `ola@pin.mvp-sb.netlify.app` (`PIN_DOMENE` i
  `pin-data.js`). Ingen e-post sendes noe sted — adressen er en nøkkel,
  ikke en postkasse — og den vises aldri i appen og legges aldri i økten.
  `pinSlug()` lager nøkkelen, og den må bli den samme hver gang: skriver
  du «ola» på neste telefon, er det samme konto. Norske bokstaver foldes
  (`ø` → `oe`) *før* tegnene strippes — uten foldingen ville «Bjorn» og
  «Bjørn» blitt `bjrn` begge to, altså to ulike navn på én konto.
- **PIN-en er PIN-en pluss et pepper** (`PIN_PEPPER` i Netlify-miljøet,
  `pinPassord()` i `pin-data.js`). To konkrete grunner: fire siffer er
  10 000 forsøk, og uten pepperet kunne de gjettes rett mot Supabase sitt
  eget endepunkt — med det må gjettingen gjennom vår egen funksjon. Og
  Supabase krever minst seks tegn i et passord, så en PIN på fire ville
  blitt avvist ved første innlogging, med en melding om passordlengde som
  ingen ville koblet til PIN-feltet. Pepperet må settes før den første
  kontoen og kan ikke endres etterpå: et nytt pepper låser alle ut. Og det
  må være en lang tilfeldig streng, ikke et ord: Netlifys
  hemmelighetsskanning leter etter verdien i det som rulles ut, og hele
  repoet publiseres — et ord som finnes i `test/` eller `docs/` stopper
  deployen. `netlify.toml` holder de to mappene utenfor skanningen, men
  det er verdien som er fiksen. Begge deler står i nøkkelboka.
- Dette gjør ikke en PIN på fire siffer til et passord, og appen later
  ikke som. Ingenting er låst bak innloggingen, så det verste den som
  kommer seg inn kan gjøre, er å skrive «jeg blir med» i en annens navn.
  Det står i `personvern.html` med de ordene, sammen med rådet om å ikke
  bruke en PIN man bruker andre steder.
- **At et fornavn er tatt, sier vi rett ut.** «Ola» er én konto; en annen
  Ola får ««Ola» er tatt. Er PIN-en feil, eller skal du velge et annet
  navn?» Det er motsatt av hva vi gjør med e-postadresser, og med vilje:
  et fornavn i en vennegjeng er ingen hemmelighet, og alternativet er
  «feil PIN» på en PIN som stemmer. Sletter noen kontoen, blir navnet
  ledig igjen.
- **Hvilke fornavn som er tatt står i `pin_kontoer`**, en tabell med bare
  slugen. Supabase Auth har med vilje ingen «finnes denne?»-vei utenfra,
  og admin-veien krever en `service_role`-nøkkel som ikke finnes her.
  Fremmednøkkelen står med `on delete cascade`, så lista kan ikke lyve:
  sletter noen kontoen sin, blir fornavnet ledig samme øyeblikk. Raden
  føres opp med den nye leserens egen økt, rett etter at kontoen er
  laget; feiler den, er du likevel logget inn — kontoen finnes hos
  Supabase uansett hva lista sier — så det logges framfor å rulle
  tilbake noe vi ikke kan rulle tilbake. Uten tabellen svarer
  `/api/konto` 503 og sier nøyaktig det, som `kampsvar`.
- Navnet sendes som POST, ikke i en spørring: en adresse havner i
  tilgangsloggene hos hvert ledd underveis, og et fornavn hører ikke
  hjemme der.
- **Står «Confirm email» på, ser det ulikt ut alt etter om SMTP er satt
  opp.** Uten SMTP svarer signup 200 uten økt. Med SMTP — og det står
  igjen her, fra e-postinnloggingen — prøver Supabase å sende
  bekreftelsen og ryker i sendingen: `500 Error sending confirmation
  email`. Funksjonen kjenner igjen begge og svarer 503 med hvilken
  innstilling det er og hvor den står. «Prøv igjen om litt» ville sendt
  leseren ut på å vente på noe som aldri går over av seg selv. Og
  Supabase lagrer ikke provider-innstillinger på selve bryteren — det må
  trykkes Save, ellers står den tilbake som før.
- Supabase svarer 200 uten økt i to tilfeller som betyr helt ulike ting,
  og skillet er `identities`: en tom liste er tjenestens måte å si «denne
  finnes alt» uten å rope det, mens en full liste betyr at *Confirm
  email* står på. Funksjonen kjenner igjen begge — det første blir
  «navnet er tatt», det andre en 503 som sier hva som må slås av i
  Supabase. «Uventet svar» ville sendt den som satte opp prosjektet ut på
  leting.
- Kallet går fra `netlify/functions/konto.mjs`, ikke fra nettleseren, selv
  om anon-nøkkelen tåler å være offentlig: da snakker appen bare med sitt
  eget domene. Ingen tredjepartsskript i `index.html`, ingen
  informasjonskapsel fra noen andre. Og pepperet finnes bare der.
- Oppsettet sjekkes når panelet åpnes (`GET /api/konto` svarer `klar` og
  `mangler`), ikke når leseren trykker Logg inn: får du vite at
  innloggingen ikke er satt opp først etter at navnet og PIN-en er
  skrevet inn, var skrivingen til ingen nytte. Samme grep som i
  adminportalen.
- Økten ligger i `localStorage` (`sb-konto`) med et utløpstidspunkt, ikke
  et antall sekunder: sekunder er ubrukelige etter en omstart. En økt
  uten gyldig utløpstidspunkt regnes som utløpt og ryddes ved oppstart —
  en økt vi ikke kjenner levetiden på, er ikke en økt å stole på. Økten
  må også si *hvem* du er, ellers har menyen ingenting å skrive: et navn
  (PIN) eller en adresse (den parkerte e-postveien, som fortsatt ligger i
  telefoner som har brukt den).
- Menyen viser fornavnet, ikke en maskert adresse: det er allerede
  offentlig for vennene, og det er det samme navnet de ser i «blir
  med»-lista. PIN-feltet er `type="password"` og tømmes etter innlogging;
  navnet blir stående. Feltene bærer `autocomplete="username"` og
  `current-password`, så telefonen kan tilby å huske paret — ett trykk
  framfor å taste fornavnet på nytt hver gang.
- **Etter innlogging er du ferdig i panelet.** Menyen og kontopanelet
  lukkes, og fornavnet står i toppfeltet på hovedskjermen — det er svaret
  på «gikk det bra?». Å bli stående i et panel som ikke har mer å si er
  et trykk til uten grunn. Merket i toppfeltet er en knapp: den åpner
  menyen med kontoen ute, så «logg ut» og «slett kontoen» er ett trykk
  fra der du ser navnet.
- **Fornavnet du logget inn med er alt navnet vennene ser.** Står det
  ingenting lagret i `sb-visning.svarnavn`, prefylles «blir med»-feltet
  med kontonavnet, så den som nettopp logget inn ikke skriver navnet sitt
  to ganger. Skriver hen noe annet, vinner det og blir lagret — feltet er
  fortsatt sannheten, og tømmer man det, er svaret ugyldig.
- Feiler innloggingen, står tjenestens egen melding i parentes etter
  («svarte 400: User already registered» — `tjenestenSa()` i `app.js`,
  som henter siste ledd i `forsok`). «Prøv igjen om litt» alene sender
  både leseren og den som satte opp tjenesten ut på leting i et panel som
  ikke sier noe. Samme grep som i pubforslagene. Verken pepperet,
  nøkkelen eller adressen vi lager av navnet ligger i `forsok`.
- `pin-data.js` er de rene funksjonene, delt mellom appen og funksjonen:
  blir de to uenige om hva et gyldig navn eller en gyldig PIN er, får
  leseren «feil PIN» på en PIN som stemmer. Det kostet en kveld sist, da
  appen kappet en åttesifret engangskode til seks.
- Dette er første gang appen lagrer noe om en person, og
  `personvern.html` sier hva det er: fornavnet og PIN-en hos Supabase
  (EU), navnet du selv skriver — synlig for andre — og økten lokalt. Sida
  er skrevet om denne appen, ikke etter en mal: den navngir Supabase og
  Netlify, og den sier at posisjonen i pubsøket går rett fra nettleseren
  til OpenStreetMap uten å innom oss. Lenka står i menyen. PIN-en flyttet
  Resend ut av lista: appen sender ingen e-post nå, så ingenting passerer
  USA.
- **Du sletter kontoen selv, fra menyen.** Det krever normalt admin-
  tilgang hos Supabase og en `service_role`-nøkkel som kan slette hvem
  som helst. Den finnes ikke her. I stedet ligger sletteretten i
  databasen som `slett_meg()`, en `security definer`-funksjon som sletter
  raden der id-en er `auth.uid()` og ingen andre — den tar ikke imot noen
  id, så selv en feil i `konto.mjs` kan ikke slette en annens konto.
  Radene i `kampsvar` følger med gjennom `on delete cascade`, så
  slettingen er hel. SQL-en står i `docs/nokler-og-tokens.md`; uten den
  svarer funksjonen 503 og sier det.
- Slettingen krever to trykk: det første sier hva som kommer til å skje —
  og at fornavnet blir ledig for andre — det andre gjør det. Ingen
  dialogboks; den ville blitt et hinder å klikke bort framfor en setning
  å lese. En utlogging nullstiller bekreftelsen, så den ikke står klar
  neste gang noen logger inn.
- **Sett virke i prod 13. september 2026**: fornavn og PIN, konto laget
  hos Supabase i samme kall som innloggingen, økten lagret lokalt. Fire
  ting sto i veien, og ingen av dem var i koden:
  - **Hemmelighetsskanningen stoppet deployen.** `PIN_PEPPER` var satt
    til noe som finnes som tekst i repoet. `netlify.toml` holder nå
    `docs/` og `test/` utenfor skanningen, men fiksen er en lang
    tilfeldig verdi.
  - **Scope på miljøvariablene.** En variabel som bare gjelder «Builds»
    ser ikke funksjonen ved kjøring. Den må ha Functions med.
  - **Supabase lagrer ikke provider-innstillinger på bryteren.** «Confirm
    email» ble slått av uten Save, og sto tilbake som før.
  - **Settings er delt opp hos Supabase.** Nøklene ligger under *API
    Keys*, ikke på den gamle `/settings/api`, som nå lander på *General*.

#### Parkert: engangskoden på e-post

Dette virket, sett i prod 12. september 2026 i forhåndsvisningen av #68 —
hele kjeden fra e-post til økt, med Resend som avsender, malene med
`{{ .Token }}`, en kode på åtte siffer og oppslaget som `magiclink`. Det
står her fordi det skal hentes fram igjen, og fordi fire ting sto i veien
og ga alle *den samme* feilen:

- **SMS-sperren hos Brevo.** Registreringen krever kode på mobil, og den
  kom aldri. Mailjet og Amazon SES har samme krav. Derfor Resend, som er
  amerikansk — et bevisst kompromiss, tatt fordi EU-alternativene ikke
  lot seg registrere.
- **Låste maler uten egen SMTP.** Standardmalen sender en *lenke*, ikke
  en kode. Rekkefølgen er SMTP først, mal etterpå.
- **Stor R i SMTP-brukernavnet.** Det skal være `resend`, og feltet er
  versalfølsomt som en miljøvariabel.
- **At appen kappet koden til seks siffer.** Kodelengden stilles i
  Supabase (*Authentication* → *Rate Limits* → «Email OTP Length»), og
  dette prosjektet står på åtte. `KODE_MIN` og `KODE_MAKS` i
  `konto-data.js` er derfor et spenn, ikke et tall. Kappet til seks
  sendte vi «637381» og fikk 403 — som ser nøyaktig ut som en feil kode.
  Det siste var vårt, og det tok en kveld.

To ting til som gjelder den dagen koden hentes fram: Supabase lagrer
engangskoden ulikt etter hvilken vei adressen kom inn («signup»,
«magiclink», «email»), og alle tre gir samme 403 utenfra — derfor prøver
funksjonen dem i rekkefølge (`KODETYPER`), og bare avvisninger gir et
forsøk til. Og feil kode og utløpt kode får samme svar: at en kode fantes,
er i seg selv noe om adressen.


### Brukerne (admin)

- Adminportalen viser **hvem som har logget inn, første gang og sist
  inne**, og lar admin **sette en ny PIN** eller **slette** en konto.
  Tidene kommer fra Supabase selv (`created_at` og `last_sign_in_at`) —
  vi teller ikke, for en teller vi fører selv ville kunne gli fra
  virkeligheten uten at noen merket det. Kontoen lages ved første
  innlogging, så `created_at` *er* første gang.
- **`netlify/functions/brukere.mjs` er den ene fila i prosjektet med en
  `service_role`-nøkkel, og det er et bevisst brudd på en regel som
  ellers gjelder overalt.** Regelen — ingen funksjon har en slik nøkkel,
  så en feil i `konto.mjs` eller `svar.mjs` ikke kan skrive i en annens
  navn — står. Men å sette en annens PIN og slette en annens konto *er* å
  handle på vegne av andre, og Supabase Auth har ingen annen vei dit; en
  `security definer`-funksjon ville bare flyttet den samme makta inn i
  databasen, med en hemmelighet i et SQL-argument i stedet. Nøkkelen
  ligger derfor i den ene fila, importeres ingen steder, og fila gjør
  ikke annet enn dette.
- Hver handling krever `ADMIN_PASSORD`, sammenliknet i konstant tid som i
  `visninger.mjs`, og sjekken skjer **før** noe som helst annet: et feil
  passord når aldri Supabase. En nettlesertest sjekker at portalen ikke
  henter en eneste bruker før passordet er godtatt.
- **Admin ser aldri en PIN.** De ligger hashet hos Supabase, og det er
  riktig. Admin kan sette en ny — og da står den i klartekst på skjermen
  én gang, fordi den må sies videre. Det står i meldingen at den ikke kan
  leses igjen.
- En ny PIN settes med `PIN_PEPPER` på, som alle andre. Står pepperet
  feil, kommer ikke personen inn med PIN-en admin nettopp ga dem — derfor
  er `PIN_PEPPER` med i det funksjonen krever, ikke bare `konto.mjs`.
- Navnet vises slik personen selv skrev det. Adressen bærer bare slugen
  («bjoernaage»), så `konto.mjs` sender navnet med som `user_metadata`
  ved opprettelse. Kontoer laget uten det faller tilbake til slugen — ikke
  pent, men riktig, og bedre enn en tom rad.
- Id-en går inn i en adresse, så den sjekkes mot formen en uuid har
  framfor å stoles på — selv om den kommer fra lista portalen nettopp
  fikk.
- Sletting krever to trykk, som i appen: det første sier hva som kommer
  til å skje — og at fornavnet blir ledig igjen — det andre gjør det.
- Funksjonen som viser tiden heter `sistInneTekst()`, ikke `tidstekst()`:
  det navnet er tatt i `fotball-data.js` og står for avsparkstidspunktet.
  To like navn på to ulike ting kostet en CI-runde sist (`.kamp-delt`).

### Hvem blir med

- Svaret delingslenka ba om. Teksten i chatten spurte «Hvor ser du?», og
  til nå hadde det spørsmålet ingen vei tilbake til appen.
- **Stedet er handlingen.** Det finnes ingen egen «Jeg skal dit»-knapp og
  ingen erklæring på toppen: du trykker på et sted, og det *er* svaret.
  Delingen er en tekstknapp under — den sender beskjeden til gruppechatten,
  mens lista i appen er det vennene faktisk ser når de åpner kampen.
- **Navnet kommer fra innloggingen, ikke fra et felt i kortet.** Det er alt
  det samme fornavnet: PIN-innloggingen ber om nøyaktig det, og
  `svarNavn()` i `app.js` faller tilbake på kontonavnet. Et felt man måtte
  fylle før trykket virket ville betydd at «ett trykk» ikke var sant — og
  feltet sto på hver eneste kamp. Har noen skrevet et annet navn før,
  ligger det fortsatt i `sb-visning.svarnavn` og vinner som før.
- **Vennene står nederst i kortet, gruppert etter stedet de skal til**
  («Lincoln Pub — Ola og Kari»), av `perSted()` i `svar-data.js`. Flest
  først, og den som ikke sa hvor, sist og uten sted. Linja under kampen
  sier hvor mange og hvem — nok når man blar; kortet sier hvor man møter
  dem, og det er spørsmålet man åpnet kortet for å svare på. «3 blir med:
  Ola, Kari og Per» sa ingenting om det.
- **Ingen treff er ingen nyhet.** `meldTomt()` gir ett svar på «fant dere
  noe?» for hele panelet, ikke ett per kilde. Før sa fire grupper fra
  hver for seg, og de tre tomme druknet den ene som hadde et forslag.
  Venter en kilde fortsatt, sies ingenting — det er for tidlig.
- **Lesing krever ingen konto.** «3 blir med: Ola, Kari og Per» står
  under kampen for alle, som «denne kampen vises på»-linja: den som
  blar gjennom runden ser det uten å åpne noe. Skriving krever at du er
  logget inn — og bare i ditt eget navn.
- Skrivingen går med leserens egen økt (`Authorization: Bearer`), ikke
  med en nøkkel som kan skrive hva som helst. Databasen setter `bruker`
  fra økten, og reglene der slipper bare gjennom din egen rad.
  Funksjonen har ingen `service_role`-nøkkel, med vilje: da kan heller
  ikke en feil i den fila skrive i en annens navn.
- Hele runden hentes i ett kall (`/api/svar?kamper=3,4,5`). Ti kamper
  skal ikke bli ti kall.
- **Kampene noen blir med på løftes øverst**, i to merkede bolker: «2
  kamper noen blir med på» og «Resten av runden». Ikke som en flat
  omstokking — lista har dagskiller, og en søndagskamp løftet over
  fredagsskillet ville havnet under feil dag. Hver bolk får sine egne
  dagskiller. Ingenting dupliseres og ingenting skjules, så det trengs
  ingen vei ut; men leseren skal se hvorfor rekkefølgen ikke er den hen
  ventet — samme grep som linja over feeden når favorittlag løftes.
- Løftingen skjer i `tegnSvar()`, ikke der runden tegnes: svarene kommer
  etterpå, og runden står ferdig lenge før vi vet om noen blir med.
  Radene **flyttes**, de tegnes ikke på nytt, så et åpent panel og en
  hentet værlinje overlever. Dagen ligger i `dataset.dag` på raden, så
  dagskillene kan tegnes på nytt uten å regnes ut igjen. Blir ingen med
  lenger, forsvinner bolkene og runden ser ut som en runde igjen.
- Feiler lista, sier den ingenting. Den er et tillegg til kampen, ikke
  kampen, og en feilmelding under hver eneste rad ville dekket over
  runden. Den som trykker «Jeg blir med», får derimot beskjed — det er
  der man venter et svar.
- Svarer du to ganger, endrer du svaret ditt: skrivingen er en upsert
  mot `unique (kamp_id, bruker)`. Trykker du på et annet sted, flytter
  svaret ditt dit; trykker du på det samme igjen, går du av lista.
- Navnet er «navnet vennene ser», og det er synlig for alle som åpner
  kampen — det er prisen for at lista kan leses uten konto. Det lagres
  med visningsvalgene (`sb-visning`, feltet `svarnavn`) ved hvert svar, så
  det ikke hentes på nytt for hver kamp.
- Tabellen og reglene står som SQL i `docs/nokler-og-tokens.md`. Finnes
  den ikke, svarer funksjonen 503 og sier nøyaktig det, framfor å sende
  en PostgREST-feil videre til leseren.
- **Sett virke 12. september 2026**, i forhåndsvisningen av #68: en rad
  skrevet fra appen med leserens egen økt, gjennom de fire RLS-reglene,
  og lista tegnet under kampen med en gang.
- **Vennefanen** (`#/fotball/venner`, #71) svarer på tvers av ligaer:
  løftingen i Neste runde gjelder én liga, så står Ola på en Premier
  League-kamp og Kari på en eliteseriekamp, ser du dem bare ved å bytte
  fane. Fanen slår sammen ligaenes neste runder og viser bare kampene
  noen blir med på, med `bareMedSvar()`.
- **`FANER` er ikke `DELER`.** `DELER` er datasettene funksjonen serverer,
  og `netlify/functions/fotball.mjs` validerer `del` mot lista — et
  fjerde navn der ville blitt en rute funksjonen godtar og så feiler på i
  `apiSti`. `FANER` er `DELER` pluss `venner`, og det er den `tolkFotballHash`
  kjenner igjen.
- «Venner» er i dag **alle som er logget inn og har svart**; det finnes
  ikke noe skille. Navnet lover mer enn det holder, så det står med ord
  under lista: «Alle som er logget inn og har svart. Faste vennegrupper
  kommer.» Samme regel som ellers — en knapp som ser ut som den gir noe
  den ikke gir, er verre enn en som sier hva den er.
- Fanen er tom til noen svarer, og da er nettopp den lista hele poenget.
  Tomteksten sier derfor hva som skal til, ikke bare at det er tomt.

## Testing

    node test/unit.mjs      420 tester, ~90 ms, ingen nettleser
    node test/funksjon.mjs  219 tester, ~250 ms, ingen nettleser
    node test/run.mjs       341 tester, ~200 s, headless Chromium

Tallene telles av testene selv. De sto en stund som konstanter, og da
gled de fra virkeligheten: enhetstestene meldte 271 mens 279 kjørte, og
funksjonstestene 122 mens 119 kjørte.

**Og tallet er sjekken på at en ny test faktisk kjørte.** La du til seks
tester og tallet står stille, kjørte de ikke — da traff ikke redigeringen
fila, eller de ligger bak noe som returnerte før. Grønt på en test som
aldri kjørte er verre enn rødt. Det skjedde 13. september 2026: et
redigeringsskript feilet, testene kjørte mot den gamle fila, og alt så
grønt ut.

Alle tre kjøres på hver pull request via `.github/workflows/test.yml`.
De raske først, så en åpenbar feil stopper kjøringen før nettleseren
i det hele tatt starter.

`funksjon.mjs` kaller Netlify-funksjonene direkte med et stubbet `fetch`:
statuskoder, cache-headere, at API-nøkkelen, Supabase-nøkkelen og
PIN-pepperet går til tjenesten og ikke til leseren, at en ny konto lages i
samme kall som innloggingen, at et fornavn som er tatt sier det både før
og etter at PIN-en tastes, at et nytt navn føres opp i kontolista med
leserens egen økt, at et feil adminpassord aldri når Supabase i det hele
tatt, at en ny PIN settes med pepperet på, og at
TheSportsDB prøves først for årets neste runde og faller
tilbake når den svikter, og at værfunksjonen identifiserer seg for MET.
Ingen nøkkel og ingen nettverk kreves. Én test lar en tjener tie for å se
at kappløpet ikke venter på den; uten den ville akkurat den feilen bare
vist seg i prod.

`unit.mjs` dekker `lib.js`, `fotball-data.js`, `vaer-data.js`,
`pub-data.js`, `konto-data.js`, `pin-data.js` og `svar-data.js`: URL-validering, videovertslisten, tidsstempler,
endringssignaturen, gjenkjenning av interne lenker, rangering av søketreff og favorittlag, sesongvinduet per
liga, tolkning av API-Football-svaret, hvilken runde som er «neste», at
døgnkvoten holder, og at ingenting i `puber-kontakt.js` slipper ut i
appen før noen har datert det, og at en økt vi ikke kjenner levetiden på
regnes som utløpt, og at ditt eget svar på en kamp finnes på id og ikke
på navn, og at «Ola» og «ola» blir samme konto mens «Bjorn» og «Bjørn»
ikke blir det, og at brukerlista formes uten adressen vi lagde av navnet.
`run.mjs` dekker alt som trenger DOM: XSS i titler
og artikkel-HTML, annonseplassering, rulleoppførsel, artikkelvisningen,
fokusfella, korthøyden, at toppfeltet krymper, paginering, ruting,
visningsvalgene i menyen, favorittlag fra stjerne til feed, deling av en
kamp med sted og pubforslag, den delte lenka som åpner kampen den peker
på hos mottakeren, adminportalen fra innlogging til lagring — og
brukerlista der, som ikke hentes før passordet er godtatt, innlogging i
appen i to steg — et ledig navn som ber om PIN-en to ganger, to ulike
PIN-er som stoppes før kontoen lages, «bytt navn» som tømmer det du
tastet, og et kjent navn som bare ber om PIN-en — med feeden ferdig
lastet før noen har logget inn, «jeg blir med» fra navn til angring, og hele
fotballmodulen — fanebytte, tabell, resultater, neste runde, dyplenker og
feilmelding fra tjenesten.

Testsidene serveres over HTTP, ikke fra `file://` — modul-script blokkeres
av CORS på file-opphav, og appen ville aldri lastet.

Legger du til en test, sjekk at den kan feile: ødelegg linja den skal
beskytte og se at den slår ut. To tester har passert av feil grunn i dette
prosjektet — rulletesten sjekket `scrollTop` der den var null uansett, og
høydetesten kjørte i et vindu der taket aldri bandt. `kjor()` tar derfor en
valgfri vindusstørrelse.

Merk at `--virtual-time-budget` ikke driver CSS-transisjoner fram; bruk
`--force-prefers-reduced-motion` for skjermbilder av animerte paneler.
Merk også at virtuell tid står stille så lenge et nettkall venter: et
ekte posisjonsoppslag hang hele kjøringen på CI. Testrammen stubber
derfor `getCurrentPosition` til å avslå, og tester som trenger en
posisjon overstyrer den selv.

## Arbeidsflyt

Små, trygge endringer kan pushes rett til `main` — Netlify deployer på
push, og CI kjører der også. Bruk pull request for alt som endrer
arkitektur, sikkerhet eller flere filer samtidig.
