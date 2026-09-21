# Sportsbibelen — nyhetsapp

Viser saker fra sportsbibelen.no, med en fotballmodul. Vanilla ES-moduler,
ingen byggesteg. Hostes på Netlify som `mvp-sb`.

Denne fila er **reglene som gjelder nå**, på tvers. Begrunnelsene står i
[`docs/adr/`](docs/adr/README.md), historien i
[`docs/hendelser.md`](docs/hendelser.md), testdetaljene i
[`docs/testing.md`](docs/testing.md). Er du i tvil om *hvorfor*, er svaret
der — ikke her.

Reglene som gjelder **inne i én fil** — hva hver funksjon bærer, og hva
som ryker om den flyttes — står i [`docs/modulene.md`](docs/modulene.md),
modul for modul.

## Slik vil jeg ha svar

- **Still spørsmål som kan klikkes.** Bruk AskUserQuestion med konkrete
  alternativer, ikke åpne spørsmål i brødteksten.
- **Avslutt hvert svar med en statusblokk**: hva som er siste nytt, hvor
  jeg finner det (prod-URL, branch, PR), og om du venter på meg.

## Filene

    index.html      markup, meta, temaskriptet som må kjøre før rendering
    app.css         all stil
    app.js          appen, lastet som modul
    lib.js          rene funksjoner uten DOM
    sw.js           service worker: nett først, cacher skallet, aldri /api/
    netlify.toml    proxy mot WordPress

    fotball.js / fotball-data.js / netlify/functions/fotball.mjs
    vaer-data.js / netlify/functions/vaer.mjs
    pub-data.js / puber.js / puber-kontakt.js / netlify/functions/puber.mjs
    pub-forslag-data.js / netlify/functions/pub-forslag.mjs
    netlify/functions/pub-liste.mjs   rettelsene admin gjør i portalen
    kanaler.js      hvilken kanal som sender ligaen — tom til noen har sjekket
    konto-data.js / pin-data.js / netlify/functions/konto.mjs
    svar-data.js / netlify/functions/svar.mjs
    visning-data.js / netlify/functions/visninger.mjs
    admin.html / admin.js / netlify/functions/brukere.mjs

    verktoy/        diagnostikk som kjores for hand, ikke av CI
                    kanalsjekk.mjs: neste runde mot det kanaler.js pastar

    personvern.html hva vi lagrer, og hvordan du blir kvitt det
    bilder/         annonsebilder, ett ferdig utsnitt per form
    docs/           adr/, modulene.md, hendelser.md, testing.md,
                    nokler-og-tokens.md, oppsett.sql, kampdag-dypdykk.md
                    kom-i-gang.md: veien inn for en ny person, som PDF
    BACKLOGG.md     peker til issues, som er den ekte backloggen

**Mønsteret:** `*-data.js` er rene funksjoner — ingen DOM, ingen
nettverk, ingen lagring — delt mellom appen, Netlify-funksjonen og
testene. Hører en funksjon hjemme der, legg den der. Blir appen og
tjenesten uenige om en regel, får leseren en feilmelding som ikke stemmer.

## Reglene

### Ikke rør
- **Ingenting skal kreve endringer på sportsbibelen.no.**
- **Proxyen er smal**: kun `/posts` og `/categories`, aldri wildcard mot
  `wp/v2` — det åpner en vei inn til `/users`. [ADR 0003](docs/adr/0003-smal-wordpress-proxy.md)
- **Ingen funksjon har en `service_role`-nøkkel**, med ett dokumentert
  unntak (`brukere.mjs`). [ADR 0010](docs/adr/0010-ingen-service-role.md)
- **Ingen sporing, ingen informasjonskapsler, ingen samtykkebanner.**
  [ADR 0004](docs/adr/0004-ingen-statistikk.md) — vi **fører** ingen
  teller. Å lese et felt Supabase skriver uansett, fordi den må for å
  holde folk innlogget, er noe annet: `sessions.refreshed_at` gir «sist
  inne» uten at vi har begynt å måle noen.
  [ADR 0021](docs/adr/0021-sist-inne-fra-oktene.md)
- **Ingenting er låst bak innlogging.** [ADR 0009](docs/adr/0009-fornavn-og-pin.md)
- **`PIN_PEPPER` kan ikke endres.** Et nytt pepper låser alle ute.

### Si sant
- **Hvert annonsekort sier hva det er** — «Reklame», «Ledig plass» eller
  «Spøk». Merket ligger som data i `EGNE_MERKER`, ikke som `if`-er, og
  slås opp på `merke` — ikke på `format`, som er fasongen (`kort`,
  `banner`, `stripe`). **Ingen oppdiktet annonsør i prod:** en rad uten
  `merke` er en ekte annonsør, og det finnes ingen ennå.
  **Og ingen spøk heller, fra 21. september 2026.** De sju vitsene var
  ærlige, men de sto først i rotasjonen — og den første annonsen en leser
  møter er den ene som skal overbevise noen om å kjøpe plassen. Merket
  lever videre uten data: `run.mjs` holder at feeden ikke har en spøk,
  `unit.mjs` at apparatet for å lage en fortsatt finnes. Bare den ene av
  dem, og merket kunne ryket som død kode uten at noe sa fra.
  [ADR 0005](docs/adr/0005-egen-annonseplass.md)
- **En knapp som ser ut som den gir noe den ikke gir, er verre enn en som
  sier hva den er.** Gjelder «Venner», «Meldt inn til oss», og
  «Valgt for deling» utlogget.
- **Ingen knapp navngir noe appen ikke har.** «Del i chatten» sto til
  19. september 2026, og Sportsbibelen har ingen chat — knappen lovet et
  sted å sende den. Hvor teksten havner er leserens valg i
  delingsmenyen, så knappen heter «Del» og svaret «Kopiert. Lim inn der du
  vil.»
- **Kortet har to lister, og de svarer på hvert sitt spørsmål.**
  «Kampen vises hos:» er stedene **nær deg** — svaret på «hvor skal jeg».
  «Trykk her for puber i andre byer» er resten, lukket til du trykker:
  svaret på «hvem viser kampen ellers». En bekreftet visning 392 km unna
  hører hjemme i den andre, ikke i den første, og `naerNok()` er skillet.
  Begge sorteres av `sorterForslag()`: **bekreftet, så dine egne puber, så
  avstand** — «først» betyr først *innenfor* lista, ikke øverst uansett.
  Ukjent avstand sorteres sist i sitt lag; raden står der, men et tall vi
  ikke har kan ikke slå et tall noen andre har.
  **Den andre lista leser hele `KJENTE`**, ikke bare det de geografiske
  kildene fant. Står du i Trondheim, svarer ingen av dem på Oslo — og da
  ville lista vært tom akkurat når den trengs.
- **Fire rader framme, så «Ekspander lista (N)» — og taket teller bare de
  vanlige.** Ditt eget sted og stedene noen andre skal til kommer i
  tillegg: de er ikke rader blant mange, og en liste som skyver svaret
  ditt bak en knapp er ingen hjelp. Andre byer viser fem.
  Regelen sa «har du valgt et sted, minimeres de andre» til
  20. september 2026. Da var det to regler om det samme, og taket vant:
  lista har samme høyde før og etter at du har svart. Åpen/lukket huskes
  på panelet — `tegnSteder` kjører på hvert svar, og en liste som lukker
  seg selv midt i en vurdering er verre enn ingen minimering.
- **«Ukjent avstand demper ingenting» gjelder når vi ikke KAN vite.**
  «Dine puber» bærer bare et navn — `dinePuber()` lagrer `{navn, antall,
  sist}` i nettleseren — så en pub du har delt før kom inn i kortet uten
  koordinat. Da ga `avstandTil()` null, `naerNok()` svarte ja, og Andy's
  Pub sto blant stedene nær en leser i Trondheim, 390 km unna, uten by og
  uten km. Tallene sto i `puber.js` hele tiden.
  `merkKuraterte()` fyller derfor inn **lat, lon og bydel når raden
  mangler dem** — og bare da. Et treff fra kartet bærer sitt eget punkt,
  og de to kan peke på hver sin inngang.
- **`min: true` settes der vi vet at raden er din**, i `boks.kilder.dine`.
  Det er mellomlaget i `sorterForslag`, og flagget sto som en regel uten
  en setter til 20. september 2026: enhetstesten lagde objektet for hånd og
  var grønn, mens ingen pub i appen noen gang bar det.
- **Et antatt sted vises, og sier at det er antatt.** `usikker` ble
  filtrert bort før lista nådde leseren, og da var det ingen forskjell
  mellom «vi har sett etter og er i tvil» og «stedet finnes ikke». Lista
  var 26 steder, alle i Oslo, og resten av landet fikk «Fant ingen puber»
  — ikke fordi vi hadde undersøkt.
  `merkAntatte()` setter `antatt: true` framfor å skjule, og raden får sitt
  eget merke og **ord**: «Antatt — ikke bekreftet». Ikke ⚽, som er en
  påstand vi ikke har dekning for. En antakelse som sier at den er en
  antakelse, er sann. Grensa går ved `usikker`, ikke ved `sannsynlig`.
  **Portalens pubvelger filtrerer fortsatt bort `usikker`:** å krysse av at
  et sted viser en bestemt kamp er en påstand admin gjør, og den kan ikke
  hvile på en antakelse. [ADR 0022](docs/adr/0022-antatte-steder.md)
  **Og et antatt sted sender ingen liga.** `ligapuberAv()` slipper ikke et
  `usikker`-sted gjennom, uansett hvor godt datert flagget er. «Sender
  Eliteserien» er den sterkeste påstanden et sted kan bære uten at et
  menneske har sett på nettopp denne kampen, og `usikker` betyr at vi ikke
  har sjekket at stedet viser fotball i det hele tatt.
  **Vakta ligger i kilden, ikke i merket.** `ligapuber` står rett etter
  `bekreftede` i `FORSLAG_KILDER`, så en rad som slapp gjennom ville blitt
  *løftet* over alt geografisk — samme form som den bekreftede visningen
  392 km unna. Å sette «?» foran 📺 i merkekjeden skjuler bare tegnet.
  Avgjort i flettinga 21. september 2026, da ligaflagget og de antatte
  stedene møttes for første gang.
- **Et antatt sted kan sies imot, og `viser_fotball === false` er tipset.**
  Uten en vei tilbake er en antakelse gjetning med bedre typografi, og lista
  blir dårligere for hver by vi fyller. Feltet hadde to verdier og tre
  betydninger — portalen viste `false` som «uvisst om de viser fotball», et
  ord dataene aldri sa, og ingen rad i basen har noen gang vært `false`.
  Avkryssingsboksen som kunne satt den er ute: står du i døra på en pub og
  melder den inn, er svaret på «viser de fotball» at du bruker den knappen.
  Da er `false` ledig, og den betyr det den ser ut som. Ett felt, én
  betydning per verdi, og ingen ny kolonne å holde i takt.
  **`forslagRad()` skriver bare `false` når feltet uttrykkelig er `false`.**
  Sto det `!!inn.viserFotball`, ble en glemt linje hos den som kaller et
  tips om at stedet er feil.
  **Knappen «De viser ikke fotball» står bare på et antatt sted**, og bare
  innlogget. Et sted noen har stått i døra på skal ikke kunne rettes bort av
  et trykk fra en som gikk forbi; et sted vi har gjettet på skal kunne det,
  for vi har ingenting å forsvare. Utlogget tier den, som `tilbyForslag()` —
  databasen setter `foreslatt_av` fra økta.
  **Og vakta mot «står allerede i lista» går motsatt vei her.** Et tips
  handler om et sted som alt står der; sto vakta som for et forslag, avviste
  vi den ene meldinga som kan rette lista.
  [ADR 0023](docs/adr/0023-tipset-som-tar-et-sted-ut.md)
- **Køen sorteres, og tipsene står først.** `sorterForslagKo()` har tre
  trinn: tips om et sted vi **gjettet** på, tips om et sted noen har **stått
  i døra** på, så forslagene — og eldst først innenfor hvert lag, for køen er
  arbeid som ligger, ikke et varsel. Vekta leses av **lista**, ikke av raden:
  `sikkerhet` står i `puber`, og et felt ved siden av i køen kunne vært uenig
  med den. Og av den **sammenslåtte** lista — et antatt sted i en ny by
  ligger i basen, ikke i fila, og det er nettopp de radene tipsene handler
  om. Derfor tegnes køen om i `tegnForslagIgjen()` når rettelsene lander.
- **Lagringen merker den raden den svarer på, og hva den svarer avgjøres av
  hva den gjør.** Tas stedet ut, er det tipset som er besvart; blir det
  stående, er det forslaget. Det sto `p.fjernet ? null` — riktig da køen bare
  kunne si «ta dette inn», og en fjerning svarte ingen. Merket vi begge,
  ville en redigering stilt tipset som om noen hadde vurdert det.
  **«Ta stedet ut» lagrer ikke.** Den åpner stedet med haken satt, og et
  menneske trykker — ADR 0019 og 0020 står, og et tips fra en
  forbipasserende er ikke et unntak fra dem, det er grunnen til at de finnes.
- **⚽ settes ett sted, ikke i hver kilde.** `kuraterteNaer()` kopierer
  raden rett fra `KJENTE` og vet ikke at den er kuratert, mens
  `stampuberFor()` går gjennom `merkKuraterte`. Sto merkingen i hver
  kilde, forsvant ⚽ avhengig av hvilken vei raden kom. `tegnSteder`
  merker hele lista i ett kall.
- **Én note for hele kortet, ikke én per liste.** Den teller radene i
  **begge**: sto den bare over de fjerne, ville «Fant ingen puber» stått
  over en liste med fire. En posisjon som uteble forklarer begge listene,
  og to linjer med samme forklaring er én for mye.
  Veien videre er knappen nederst. Til 20. september 2026 sto «Skriv
  navnet selv», om et felt som nå er borte — en setning som peker et sted
  som ikke finnes er verre enn ingen.
- **Sier du at du skal til et sted vi ikke kjenner, blir du spurt om å
  sende det inn.** Skjemaet har stått der hele tiden, bak «Mangler stedet?
  Send det inn.» — en knapp du måtte legge merke til. Øyeblikket stedet
  faktisk mangler, er øyeblikket du nettopp sa at du skal dit.
  `panel.tilbyForslag()` kommer **etter** svaret, ikke mens du skriver: et
  halvskrevet navn på et sted som finnes er ikke et sted som mangler.
  Den holder kjeft for stadion, for den som ikke er logget inn (databasen
  setter `foreslatt_av` fra økta, så et tilbud som ikke kan tas imot er
  verre enn ingen), og for et sted `alleredeILista()` kjenner — ellers ber
  appen deg melde inn en pub den selv har i lista.
- **En bekreftet visning svarer på kampen, ikke på hvor du er — og må
  derfor bære avstand.** `bekreftetFor()` kjenner ingen geografi: den er
  den ENESTE kilden som svarer på *denne kampen*, og det er derfor den står
  først i `FORSLAG_KILDER`. Men ingenting filtrerte den, så en pub på
  Grønland i Oslo sto øverst som svaret på «hvor skal du se den?» for en
  leser i Trondheim — 392 km unna. Samme antagelse som `puber.js` bar:
  riktig så lenge alt var Oslo.
  **Kampraden navngir ingen pub.** «Denne kampen vises på: …» sto der til
  21. september 2026, og skulle svare uten at du åpnet noe. Meldt med
  skjermbilde: fem rader på rad sa «Andy's Pub (Oslo)». Et svar som er likt
  på hver rad svarer ikke — det står i veien for det som **skiller** radene,
  som er hvem som spiller og når. Opplysningen lever i kortet, der den
  kommer med avstand, by og de andre stedene, og der den er svar på et
  spørsmål du nettopp stilte ved å åpne det.
  **I kortet går de fjerne bak «Vis de andre», med avstanden på raden.**
  «Bernie's» og «Bernie's 392 km» er to ulike svar, og bare det andre kan
  leses.
  **`NAER_M` er femti kilometer, ikke `NAER_RADIUS`.** Det siste er
  gangavstand til et sted du skal; en pub som har meldt inn kampen tvers
  over byen er fortsatt et godt svar. En sirkel er riktig **her**, til
  forskjell fra `kjenteNaer` — den bredeste byen i `BYER` er tretti
  kilometer tvers over, og de to nærmeste byene ligger hundre og seksti fra
  hverandre. Femti ligger rent imellom, så sirkelen gir samme svar som
  `byFor()` ville gitt, for alle seks. Det ble prøvd med byen først, som
  `kuraterteIByen()`: ingen test kunne skille de to, fordi ingen inndata
  finnes der de er uenige. To veier til samme svar er én vei for mye.
  **Og ukjent avstand demper ingenting.** `naerNok()` svarer ja når vi ikke
  vet — uten posisjon, eller uten koordinater på stedet. En liste som
  gjemmer noe fordi den mangler opplysninger, gjemmer det uten grunn.
  Posisjonen til radene ligger i `sisteKjentePosisjon`, satt fra
  `?posisjon=` ved oppstart og ellers første gang et kort får en. **Vi ber
  aldri om posisjon for å tegne en rad** — trykket som åpner kortet er
  handlingen telefonen krever, og lander posisjonen etterpå, tegnes radene
  om (`settPosisjon`).
  **Og derfor spør kortet om posisjon når det åpnes.** `fyllForslag()`
  kalles fra `delKnapp`, og `hentNaerDeg()` spør derfra. Til
  20. september 2026 hang den på «Andre fotballpuber» — ett trykk lenger
  inn enn kortet — og da sto Bernie's øverst i Trondheim med filteret på
  plass og virksomt: `naerNok()` svarer ja når vi ikke vet, og vi spurte
  aldri. `sporPosisjon()` var det første forsøket, og sto i to timer: da
  lista flyttet framme i kortet, spurte `hentNaerDeg` uansett, og to veier
  til samme posisjon er én for mye. **Én som spør**, og det er den som
  også trenger svaret.
  **Og en rad uten kjent avstand bærer byen ved navnet** — «Bernie's»,
  «Oslo». Kortet tegnes i det posisjonen spørres om, så de første radene
  står der før svaret finnes. Byen er det eneste vi kan stå inne for uten å
  vite hvor leseren er, og den koster ingen tillatelsesboks.
- **Kortet rangerer etter hvor du står *nå*, og andre byer er veien
  utenom.** For en kamp i kveld er «nå» og «ved avspark» det samme. For en
  kamp om tre dager er det en gjetning, og for den som reiser feil
  gjetning: «jeg er i Trondheim i dag, men i Oslo på fredag». Da svarer
  ingen av de geografiske kildene.
  **Søkefeltet var svaret til 20. september 2026**, og det krevde at du
  visste hva stedet het. «Puber i andre byer» krever ingenting: du åpner
  lista og ser dem, med avstand på hver rad. `sokKuraterte()` og
  `sokNokkel()` står igjen i `pub-data.js` med testene sine, men appen
  bruker dem ikke lenger.
  **Et treff påstår ingenting om avstand** — den står på raden der vi
  kjenner den, så «391 km» er noe du kan forkaste selv. Og du kan si at du
  skal dit: det var hele grunnen til at de fjerne ble en **liste** og ikke
  en opplysning.
- **★ og ⚽ er to ulike påstander.** ★ betyr «viser denne kampen» og
  settes av admin; ⚽ betyr «kjent for å vise fotball» og kommer fra
  `puber.js`. Merkene holder dem fra hverandre, og «(bekreftet visning)»
  står i ord ved siden av stjerna: merket alene er en konvensjon du må
  lære, ordene er ikke.
  Lenka **«Andre fotballpuber»** sto til 20. september 2026 med hele
  forslagslista, søket, fritekstsvaret og innsendingsskjemaet bak seg —
  én knapp du måtte legge merke til, med svaret på innsiden. Den er borte;
  innholdet ligger i de to listene, og kildene hentes når kortet åpnes.
  De kuraterte stedene nådde lenge bare fram gjennom et **geografisk
  filter** — `kjenteNaer` krever posisjonen din, `kjenteVedArena` at
  arenaen er en vi kjenner. Utenlandsk kamp *og* nei til posisjon ga en
  tom liste, enda `lag` i fila svarer på nettopp den kampen.
  `stampuberFor()` er veien inn som manglet: spiller Brann, er
  Brann-stampuben et svar uansett hvor du står. Den ligger **etter** de
  geografiske kildene i `FORSLAG_KILDER` og **før** de rene karttreffene:
  en stampub tvers over byen er et dårligere svar enn en fotballpub i
  nabogata, men et bedre svar enn en tilfeldig bar Overpass fant.
  **Og den er en utvei, ikke et tillegg.** Kommer en posisjon, tømmes
  kilden: et lagtreff bærer ingen avstand, og en stampub i en annen by står
  da i lista som om den var i nabogata. Er du i byen der den ligger, kommer
  den tilbake gjennom `kjenteNaer`, med avstand på.
- **`?posisjon=bodo` setter posisjonen, og skjermen sier det.** Pubene
  «nær deg» kommer fra Overpass, og Overpass svarer på hvor du står — så
  uten dette kan appen bare prøves i Oslo. `falskPosisjon()` tar et bynavn
  fra `BYER` eller et rått `lat,lon`. Så lenge den er på, står «Falsk
  posisjon: Bodø» først i linja under forslagene: en app som viser puber
  et annet sted enn du er, og tier om det, sier noe usant med sin egen
  liste. `verktoy/byersjekk.mjs` gjør den samme målingen uten nettleser.
- **Byene står i `BYER`, og de er både falsk posisjon og ramme.** Lista
  gjør to jobber med vilje: `falskPosisjon()` setter en posisjon fra den,
  og `rammeFor()`/`byFor()` er rammene portalen får lagre steder innenfor.
  Ramma var **Oslo alene** til 18. september 2026, hardkodet inni
  `sjekkPubliste`, og da kunne en RBK-pub i Trondheim ikke føres inn i det
  hele tatt: søket lette i en Oslo-boks, så stedet fantes ikke, og vakta
  avviste koordinatet som fulgte med «koordinatene ligger utenfor
  området» — om et koordinat som var helt riktig. Forslaget ble stående i
  køen som om ingen hadde prøvd.
  **Ramma er en vakt mot skrivefeil, ikke en grense for hvor folk bor.**
  Den viktigste feilen den fanger er lat og lon byttet om. En pub lenger
  ut føres inn ved å utvide `BY_RADIUS_KM` — ett sted, for alle byene.
  **Byen lagres ikke på raden**: `byFor()` leser den ut av koordinatet, og
  byvelgeren i portalen styrer bare hvor vi *leter*. Den følger tallene,
  aldri motsatt — to felt som kan si hver sin by er to sannheter om ett
  sted.
- **Lagnavn fra API-et og fra redaksjonen foldes strengere enn
  `normaliserLagnavn`.** Kilden skriver «Vaalerenga», fila «Vålerenga», og
  `normaliserLagnavn` gir «vaalerenga» mot «valerenga» — to ulike lag, så
  vidt den vet. `stampuberFor()` folder i tillegg `aa` → `a`, og den
  foldingen ligger **der og ikke i `normaliserLagnavn`**: den går inn i
  `kampNokkel()`, som er id-en alt lagret og delt står på
  ([ADR 0008](docs/adr/0008-kampnokkel.md)). Endrer vi den, endrer vi
  nøkkelen til hver rad som alt ligger i basen.
- **Puber ved arenaen bare for arenaer vi kjenner.** `arenaFor()` kjenner
  tretti norske stadion; `/api/puber` svarer «Ukjent arena» på alt annet.
  Vakta står på `arenaFor(kamp.arena)`, ikke på at navnet finnes — ellers
  blir hver utenlandske kamp ett bortkastet kall og ei linje om at noe
  sviktet. For de kampene er stedene **nær deg** svaret, og det er de vi
  leter etter. Stadionraden blir stående: hvor kampen spilles er en
  opplysning, ikke et søk.
- **Radiusen er en sirkel, og en by er ikke det.** `kuraterteIByen()` gir
  de kuraterte stedene i **samme by som deg**, uansett avstand — `byFor()`
  leser byen ut av koordinatet, som ellers. Står du fire kilometer ut,
  faller din egen bys steder utenfor `NAER_RADIUS` enda de åpenbart er
  svaret, og for en by med ett kuratert sted sto det da ingenting igjen.
  Kilden ligger **etter** de geografiske og **før** karttreffene, av samme
  grunn som stampubene. **Men i motsetning til dem bærer den avstand**, og
  blir derfor stående når posisjonen kommer: det var nettopp den manglende
  avstanden som gjorde en stampub i en annen by til et dårlig svar. Din
  by, ikke alle byer — slipper et Oslo-sted gjennom i Trondheim, er vi
  tilbake til den feilen. Utenfor de seks byene svarer den ingenting:
  vi vet da ikke hvilken by du står i, og en liste ville vært gjetning.
  `kjenteIByen` og `stampuber` møtes aldri — den ene krever posisjon, den
  andre tømmes av den. De dekker hver sin halvdel av det samme hullet.
- **«Nær deg» og «ved arenaen» er to påstander, og de tåler ikke samme
  radius.** `NAER_RADIUS` er 3000 m, `ARENA_RADIUS` 1500 m. Avstanden står
  på hver brikke, så en lang liste sortert på avstand er ærlig — du ser tre
  kilometer og forkaster den selv. Stadion kan du ikke forkaste: målt fra
  KFUM Arena ville 3000 m gitt åtte kuraterte steder under en overskrift
  som sier «ved arenaen», og de fleste av dem er sentrumspuber som ikke
  ligger der. Tallene sto som **ett** til 19. september 2026, og da lå
  1500 akkurat lavt nok til at RBK-puben i Trondheim — 1545 m fra sentrum —
  falt utenfor med 45 meter, mens den ene utvidelsen som slapp den inn
  ville gjort arenalista usann.
- **Uteblir posisjonen, sier skjermen hvilken av dem det var.** Nei,
  tidsavbrudd, «telefonen fant den ikke» og «nettleseren har ikke API-et»
  ble håndtert likt og stille, og da sto «Fant ingen puber i nærheten»
  igjen som eneste forklaring — en setning som ikke er sann når vi aldri
  fikk vite hvor «nær» var. `posisjonsfeil()` gir én setning per årsak, og
  hver av dem navngir det som mangler på skjermen. **Den ligger i sitt eget
  felt, ikke i `boks.feil`:** den skal kunne byttes ut når du prøver igjen.
  I feil-lista ble «Du sa nei til posisjon» stående etter at du sa ja — sann
  da den ble skrevet, usann da den ble lest. Uten geolocation står det
  ingen knapp: en vei tilbake som ikke fører noe sted er verre enn ingen.
- **Et sted sender en LIGA, ikke «alle kamper».** Kamper kolliderer: tre
  Eliteserie-kamper kl. 15 blir tre påstander der et sted med én skjerm
  bare kan innfri én. `ligaer` på pubraden er derfor `{sender, kilde,
  sjekket}` på liganivå — samme innsikt som `kanaler.js`: rettighetene er
  en egenskap ved ligaen, ikke ved kampen.
  **Merket 📺 «Sender Eliteserien» er svakere enn ★** og vises bare når
  stjerna ikke gjør det. ★ betyr at et menneske krysset av nettopp den
  kampen; lot vi flagget produsere ★, ble merket stille omdefinert til
  «noen sa en gang at de pleier». Merket **navngir ligaen** — «viser
  vanligvis kamper» ville latt leseren tro det gjaldt kampen hen ser på.
  **Flagget er ingen ny dør inn i lista.** `ligapuberAv()` siler
  kandidater de geografiske kildene alt har funnet; et Oslo-sted som
  sender Eliteserien er ikke et svar i Trondheim.
  **Og det utløper ved sesongslutt**, regnet av `sjekket` gjennom
  `sesongFor()` — Eliteserien ved nyttår, de andre i juli. Sesongen lagres
  **ikke** som eget felt: to felt kunne sagt hver sin sesong om det samme
  flagget. Foreldelsen er ikke pynt — hver annen opplysning her dør av seg
  selv når kampen er spilt, mens et stående flagg ellers ville lovet
  kamper lenge etter at stedet sluttet å vise dem.
- **En stille tom liste er ikke til å skille fra «ingen svarte».** Feiler
  et kall der lista *er* hele visningen, si det. Er lista et tillegg til
  noe annet, ti — men da får den som handlet beskjed.
- **Feilmeldinger bærer tjenestens egne ord.** `forsok` i svaret, uten
  nøkler og uten adresser, så det kan leses fra nettleseren. **Og den som
  kaller, viser den:** en `forsok` klienten kaster er like god som ingen.
  «Fikk ikke svar fra OpenStreetMap» er like forenlig med at tjeneren er
  nede som med at vi selv la på — og de to krever ulike ting.
- **Bokstaver er `\p{L}`, ikke en håndskrevet liste.** `osmNavnVask()`
  hadde `A-Za-zæøå` og gjorde «Grünerløkka» til «Gr nerløkka». En liste
  over hvilke tegn som er bokstaver, mangler alltid noen. Vask bort det
  som faktisk er farlig — hermetegn, apostrof, bakoverstrek — ikke alt du
  ikke kom på.
- **«Jeg står her» er den eneste veien inn som virker i Google
  Maps-appen.** Den lange URL-en med koordinatet i finnes bare i en
  nettleser med adressefelt; på telefonen får du del-lenka, og
  `maps.app.goo.gl/…` er en oppslagsnøkkel hos Google — den bærer
  ingenting. Knappen leser telefonens egen posisjon, og punktet er
  gjerne bedre enn kartets: Googles eget punkt ligger ofte midt på
  bygget, mens du står i døra. **Nøyaktigheten står i svaret** — fire
  desimaler ser like presise ut enten de er på tolv meter eller to
  kilometer. Kilden fylles med «Var innom ‹dato›», men **bare når feltet
  er tomt**: en kilde som står der er en vurdering, ikke en plassholder.
- **Koordinatfeltet tar det kartet faktisk gir deg.** Høyreklikk i Google
  Maps gir et *koordinat*, ikke en lenke — og fra stedskortet med
  parenteser rundt. `koordinatFraLenke()` tåler parenteser, hakeparenteser
  og mellomrom, og etiketten sier «koordinat eller kartlenke» så den som
  sitter med tallene ser at feltet er til dem.
- **Husnummeret står rett etter gata, ikke sist.** Folk skriver poststed
  etter adressen, og et innsendt forslag gjør det nesten alltid.
  `delAdresse()` kaster alt som kommer etter nummeret; leste den siste
  bit, ble «Torggata 11, Oslo» til gata «Torggata 11 Oslo» og null treff.
- **En frist som er kortere enn den vi ba om, gjør oss til den som ga
  opp.** `SOK_SEKUNDER` står ett sted og går både i spørringen og i
  fristen. Sto de hver for seg, ba vi om tolv sekunder og la på etter
  seks, mens meldinga la skylda på den andre parten.
- **Et forslag fra en leser er ikke en rad i lista.** `puber.js` er
  kode fordi den bærer en redaksjonell vurdering. Innsendinger går i
  `pub_forslag`, og et menneske gjør raden ferdig. Det finnes ingen vei fra
  et skjema på nettet og rett inn i det leseren ser.
  [ADR 0019](docs/adr/0019-pubforslag.md)
  **«Jeg er på pub, legg inn her» er veien inn nå, og den er alene.**
  «Mangler stedet? Send det inn.» sto rett under den og åpnet det samme
  skjemaet — to knapper til én ting, i et kort som nettopp var ryddet for
  nettopp det. Skjemaet lå bak to
  knapper, og øyeblikket stedet faktisk mangler er øyeblikket du står i
  døra på det. Knappen leser posisjonen og legger den i **merknaden** —
  «Jeg står her: 63.4305, 10.3951 (±12 m)» — ikke som et koordinat på
  raden: `pub_forslag` har ingen koordinatkolonner, og et punkt fra en
  telefon er en opplysning til mennesket som gjør raden ferdig. Feltet er
  synlig: en opplysning vi sender videre om deg, skal du kunne lese og
  slette. Nøyaktigheten står med, for fire desimaler ser like presise ut
  enten de er på tolv meter eller to kilometer.
  **Og `tilbyForslag()` lever fortsatt**, men bare for et sted fra en
  **delt lenke**: feltet du kunne skrive et ukjent navn i er borte, så det
  er den eneste veien et navn vi ikke kjenner kommer inn i kortet.
  **Men lagringen merker forslaget den svarer på.** Lagring og merking var
  to handlinger for én avgjørelse, og den naturlige er lagringen — så
  forslaget ble stående i køen etter at stedet var lagt inn.
  `merkForslagBehandlet()` henger på lagringen og aldri motsatt: mennesket
  gjorde nettopp raden ferdig, med koordinater, kilde og dato. «Lagt
  inn»-knappen står igjen for radene som limes rett inn i fila.
  **Og den merker bare den sorten rad lagringen svarer på** — se tipset
  lenger opp: et tips sier at stedet er usant, et forslag at det mangler,
  og de besvares av motsatte handlinger.
- **`puber.js` er grunnfjellet; `puber` i Supabase er rettelsene
  oppå.** Admin retter i portalen, appen slår sammen med `slaSammenPuber()`
  — hele rader, aldri felt for felt. Fila skrives aldri fra nettet, og den
  er det leseren ser når Supabase er nede. Et sted som har lagt ned tas ut
  med `fjernet`, ikke ved å la være å skrive. Nøkkelen er navnet foldet.
  [ADR 0020](docs/adr/0020-stedene-i-portalen.md)
- **Opplysninger om virkeligheten trenger kilde og dato.** Pubenes
  kontaktfelt (`kontaktFor`) og kanalen som sender ligaen (`kanalFor`)
  slipper bare gjennom når begge står. Voktere i `unit.mjs` kjører mot de
  ekte filene, og et navn uten kilde slår ut der framfor i appen.
  [ADR 0016](docs/adr/0016-kanalen-som-sender.md)
- **Kilde betyr «hvordan vet vi det», ikke «en URL».** For en pubrad
  godtar `kildeHolder()` en lenke *eller* en setning — små steder har
  ingen nettside, og «Var innom 16.09.2026, storskjerm i baren» er bedre
  dokumentasjon enn en side fra 2019. Feltet vises aldri for leseren.
  Kontaktfeltene og kanalene krever fortsatt lenke: de siterer en
  nettside, og sitatet skal kunne slås opp.

### Form
- Farger er CSS-variabler i `:root`; et tema overstyrer **kun** variabler.
  Tekst oppå bildegradienten bruker `--on-overlay`.
- `--fs` skalerer tekst. Avstander og rammer skaleres ikke.
- **En knapp i en knapp finnes ikke.** Trenger en rad to mål, er de
  søsken — eller trykkflata legges utstrakt over innholdet (`.kamp-del`).
- Artikkel-HTML renses med allowlist. Utvid lista framfor å lage unntak.
- **Fremmed HTML parses i `<template>`, aldri i et `<div>`.** Gjelder både
  `sanitizeHtml()` og `stripHtml()`. Et `<div>` aktiverer det det leser —
  også i et element som aldri settes inn i dokumentet, og også når vi
  kaster alt utenom teksten rett etterpå.
- Filtrerer noe feeden, står det som en knapp med kryss i toppfeltet.
- **Et felt som må fylles ut, sier det — før du trykker lagre.** Stjernene
  i stedskjemaet settes av `merkPakrevde()` **ut av `PUBLISTE_FELT`**, ikke
  skrevet i markupen: en liste i HTML-en kunne glidd fra den lista
  validatoren bruker, og da lover skjemaet noe annet enn det slipper
  gjennom. Et navn i `PUBLISTE_FELT` uten et felt i skjemaet blir stående i
  `dataset.umerket`, og en vakt i `run.mjs` slår ut.
  **Merkingen må være sann begge veier:** adresse, lag og merknad slipper
  gjennom uten verdi, og en stjerne der ville sagt at noe kreves som ikke
  gjør det. Tas stedet **ut** av lista, holder navnet alene — `sjekkPubRad`
  slipper en fjernet rad gjennom på navnet — og da sier forklaringa det, og
  stjernene dempes. `apneSted()` kaller den også: `fyllSted` setter haken
  uten å utløse `change`, og et skjema som lyver om sine egne krav er verre
  enn et som ikke sier noe. Stjerna er `aria-hidden`; skjermleseren får
  `aria-required`.
- **Stedslista i portalen filtreres på by, og byen leses av koordinatet.**
  `byenTil()` bruker `byFor()` — ingen rad bærer byen som et felt, og et
  felt ved siden av kunne vært uenig med tallene. Velgeren bygges av de
  byene som **faktisk har steder**, med tall: en by uten rader er et valg
  som ikke gir noe, og hele raden skjules når det bare finnes én gruppe.
  **En rad uten koordinat får sin egen gruppe.** Et sted som er tatt ut
  slipper gjennom på navnet alene, så det kan mangle koordinater helt — og
  et filter som skjuler den raden, har tatt stedet ut av portalen.
  **Og tallet som står må være tallet som vises:** «26 steder i lista» over
  en liste med ett sted leses som at de andre er borte. Filtrert teller
  hinten radene den viser. «Steder» og «rader» er ikke det samme, og
  forskjellen er de fjernede: et sted som er tatt ut er ikke i lista, men
  raden står der så den kan åpnes igjen.
- **Felt er minst 16 px.** Safari på iPhone zoomer inn av seg selv når du
  fokuserer et felt med mindre skrift, og etter den zoomen er sida pannbar
  sidelengs. Meldt to ganger som «jeg kan scrolle skjermen til venstre og
  høyre»; begge gangene lette jeg etter noe som var for bredt. Det var
  forstørrelsen, ikke bredden. To vakter i `run.mjs` måler `font-size` på
  hvert `input`, `select` og `textarea` — én i portalen og én i appen.
- **Hver regel som setter `display`, må si hva `[hidden]` betyr.**
  `display: flex` slår `[hidden]` fra nettleserens eget stilark, og da står
  et element framme som koden tror den har skjult.

### Data
- **Kamp-id er `kampNokkel()`**, ikke kildens id. Alt som lagres, slås opp
  eller deles går på `nokkel`. [ADR 0008](docs/adr/0008-kampnokkel.md)
- **«Hvem viser kampen» ligger i Supabase**, ikke i repoet, og rir med på
  `/api/svar` — den spør alt om de samme kampene. Skrivingen går med
  skriverens **egen økt**; RLS slår opp uid-en i `visning_skrivere`.
  `ADMIN_PASSORD` er døren til skjemaet, ikke til skrivingen.
  [ADR 0018](docs/adr/0018-visninger-i-supabase.md)
- **Det som kommer over nettet, lander etter at visningen står ferdig.**
  Alt som tegnes av data fra `/api/svar` må tegnes på nytt i `tegnSvar()`
  — kampraden, den åpne kampen og linjene under. Tre feil i dette
  prosjektet har vært den samme. Det samme gjelder stedene fra
  `/api/pub-liste`: `KJENTE` er ingen `const`, og et kort som alt står
  åpent tegnes om i `tegnKjenteIgjen()` — som regner om **alle** kildene
  som leser `KJENTE`: `bekreftede`, `kjenteVedArena`, `kjenteNaer`,
  `kjenteIByen`, `stampuber` og `ligapuber`. Seks, ikke fire — lista her
  vokser med hver ny kilde. En som glemmes blir stående med gamle rader
  til kortet lukkes. **`ligapuber` regnes sist**, for den siler de
  geografiske som nettopp ble regnet om.
  Derfor husker boksen kampen sin.
- **Rettelsene hentes på nytt når appen kommer fram igjen.** De ble hentet
  **én gang, ved sidelasting**, og runden admin → app er nettopp den
  runden en rettelse gjøres i — den ene runden appen ikke så. En pub
  lagret i portalen fantes da ikke i appen før du lastet den på nytt:
  raden var riktig, sammenslåingen virket, avstanden var null.
  `visibilitychange` er den runden. `PUBLISTE_FERSK` holder det til ett
  kall per to minutter, samme vindu som `LEVETID_PUBLISTE` — kanten svarer
  med det samme der uansett.
  **Og en tom liste er et svar.** Vakta sto på `!json.puber.length`, som
  var likegyldig da lista ble hentet én gang. Nå er den ikke det: tas den
  siste rettelsen bort i portalen, er det tomme svaret det riktige, og
  appen skal falle tilbake til fila framfor å bli stående med en rad ingen
  har lenger. `klar` skiller «ingen rettelser» fra «tjenesten svarte ikke».
- **«Kommende» viser hele vinduet**, ikke én runde, med en overskrift per
  runde. Taket på tjue id-er mot `/api/svar` holdes av buntingen i
  `hentSvarFor()`, ikke av at lista kappes i forkant.
  [ADR 0017](docs/adr/0017-kampene-framover.md)
- **«Resultater» henter hele sesongen, og viser siste runde framme.**
  `apiSti` spurte om `&status=FT&last=10`, og ti kamper er godt over én
  runde i Eliteserien — da sa fanen «kun siste runde». Å droppe `last`
  koster **ingen ekstra kall**: samme endepunkt, samme ene forespørsel,
  bare et større svar som `tolkKamper()` skreller ned før noe caches.
  **Og TheSportsDB spør om `eventsseason`, ikke `eventspastleague`.**
  Det siste ga femten hendelser. Målt med sonden 21. september 2026:
  sesongsvaret er 240 rader, 30 ulike runder, 168 spilte med resultat — og
  det bærer mål, dato og rundetall. Ikke antatt; spurt.
  **Svaret er hele sesongen, også det som ikke er spilt.** De uspilte har
  *senere* datoer, så uten silinga i `hentTsdbVersjon` ville runde 30 stått
  øverst med «null–null». Det er verre enn ingen liste.
  **Og `TSDB_MINST.resultater` er tjue, ikke to.** Grensa sto på 2 da
  spørringa var «de siste kampene». Nå spør vi om 240, og da er femten
  ikke en liten sesong — det er en kappet en. Et avkortet svar må ikke
  vises som om det var helt.
  `next=20` på «neste» står: dét er et vindu *framover*, og en sesong som
  ikke er spilt ennå er ingen liste noen blar i.
  **Siste runde står framme, resten bak «Vis tidligere runder (N)».**
  Hundre og åtti rader er ingen liste noen leser. Knappen teller **runder**,
  ikke kamper — det er runder du blar i. Skillet går på runden, ikke på et
  tak: en runde deles aldri i to.
  **Og en rad uten rundetall blir stående framme.** Havnet den bak knappen,
  var den skjult av en opplysning vi ikke har, uten overskrift og uten å
  telle med i tallet. Samme regel som `naerNok()`. Fanget av en sabotasje,
  ikke av at noen tenkte på det.
- **`tolkSvar` må tåle å kjøres to ganger.** Den deles mellom tjenesten og
  appen, og begge kjører den.
- **En skriving som svarer 200 er ikke bevis på at raden ligger der.**
  `settSvar` leser tilbake to ganger — som deg og som hvem som helst — og
  forskjellen er diagnosen.
- **Skriv bare det som endrer seg.** `/api/visninger` leser hva som ligger
  der, regner ut forskjellen med `visningsDiff()`, og rører bare den. Vi
  slettet og skrev alt på nytt før; da fikk rader ingen hadde endret nytt
  `satt` og ny `satt_av`, så feltet som skal si **når** noen satte kampen,
  sa «sist noen trykket lagre» — i den siste admins navn. Ingen så det,
  for `satt` vises ikke. Et felt som stille blir usant er verre enn ett som
  ropes ut: ingenting avslører det.
- **Knappen sier hva trykket gjør, ikke hvor mye som er valgt.** «Lagre 6
  kamper» når du la til én er sant om det som sendes og usant om det du
  gjør. `lagreKnappTekst()` teller endringen. Det samme gjelder knappen per
  runde: `rundeKnappTekst()` sier «Kryss av 5 til» når tre av åtte står,
  ikke «Kryss av alle 8» — trykket legger til fem. Står alt, snur den til
  «Fjern alle 8», og teksten følger hvert håndsatt kryss.
- **Feilsvar caches aldri** (`no-store`). Ellers låser et blaff seg fast.
- Hemmeligheter står samlet i [`docs/nokler-og-tokens.md`](docs/nokler-og-tokens.md).
  Funksjonene leser miljøet **ved utrulling** — en ny variabel krever en
  ny deploy — og navnene er versalfølsomme.

## Testing

    node test/unit.mjs      rene funksjoner, ingen nettleser, millisekunder
    node test/funksjon.mjs  Netlify-funksjonene med stubbet fetch
    node test/run.mjs       alt som trenger DOM, headless Chromium

**Antallet står i [`docs/testing.md`](docs/testing.md), og bare der.** Det
sto i tre filer og glei fire ganger på to dager — to økter som lander
arbeid samme time treffer dem i ulik rekkefølge, og da ligger minst én
bak. Et tall som ligger bak sier «ingen nye tester» om en kjøring som la
til tre, og det er nøyaktig det tallet finnes for å avsløre. Ett sted kan
ikke gli fra seg selv.

Tre regler, og de har alle kostet noe:

1. **Tallene telles av testene selv**, og tallet er sjekken på at en ny
   test faktisk kjørte. Grønt på en test som aldri kjørte er verre enn rødt.
2. **Sjekk at testen kan feile.** Ødelegg linja den beskytter og se at den
   slår ut.
3. **Stubben skal modellere svaret, ikke koden som lager det.** En stubb
   som er enig med feilen din beviser ingenting.

Detaljer og feller: [`docs/testing.md`](docs/testing.md).

## Arbeidsflyt

**Alt går gjennom pull request.** `main` er beskyttet: PR kreves, og
`regresjonstester` må være grønn.

Regelen sa «små, trygge endringer kan pushes rett til `main`» til
20. september 2026, og den var skrevet for én person. Prosjektet er nå to,
og push til `main` deployer til prod — det er den ene handlingen der et
uhell er ute hos leseren før noen rekker å se det.

**Enhets- og funksjonstestene er porten foran prod.** De kjører som
byggekommando i `netlify.toml`; feiler de, publiseres ingenting og forrige
deploy står. Ingen bundler og ingen `node_modules` — kommandoen kjører to
filer og ser på exit-koden.

**Men `test/run.mjs` er ikke med.** Den trenger Chromium, som
ikke er noe å regne med i Netlifys byggemiljø. En DOM-regresjon kan fortsatt
rulle ut, og fanges bare av CI — etterpå. Halv port, med vilje. Det er
derfor `regresjonstester` er den sjekken grenbeskyttelsen krever: den er
den eneste som kjører alle tre.

### Når dere er to

**Antallet i `docs/testing.md` glir.** Det gled fire ganger på to dager med
én person — to økter som lander arbeid samme time treffer det i ulik
rekkefølge. Regelen står allerede: tallet telles av testene, det legges
aldri sammen. Etter en fletting **måles det på nytt** framfor å regnes ut.

**Tre filer kolliderer oftere enn resten**, fordi alle legger til på
toppen eller i en liste: `CLAUDE.md`, `docs/hendelser.md` og
`docs/testing.md`. I `hendelser.md` skal begge oppføringer stå — det er en
logg, ikke en tilstand. I `testing.md` er svaret å kjøre suitene og skrive
det de sier.

**`git checkout --ours -- <fil>` tar hele fila, ikke hunken.** Den henter
vår versjon fra før flettinga og kaster alt fra den andre siden — også det
som fletta helt rent. Det tok #129 sitt avsnitt ut av `docs/modulene.md`
21. september 2026, uten at noen konflikt nevnte det og uten at en eneste
test kunne fange det. **Løs per hunk**, og etter en fletting: sjekk med en
`grep` per gren at innholdet du tror du har, faktisk er der. Et supersett
er lett å påstå og billig å måle.

**En squash-fletting skriver om historikken**, så en gren som lå på toppen
av den flettede vil se de samme endringene som nye på begge sider. Da blir
hver konflikt av formen «vår side er et supersett» — og det er akkurat der
forrige avsnitt koster deg noe.

**En fletting kan være ekte uenighet, ikke bare to linjer som møtes.** Det
skjedde 20. september: den ene grenen innførte en sirkel for «nær nok»
mens den andre nettopp hadde landet «radiusen er en sirkel, og en by er
ikke det». Les hva den andre siden faktisk gjorde før du løser konflikten;
noen ganger er svaret å ta ut sitt eget.

**En ny person leser [`docs/kom-i-gang.md`](docs/kom-i-gang.md) først.**
Den er veien inn — koble seg på, runden fra gren til flettet PR, og de
fellene som har kostet noe. Reglene her er fortsatt fasit; heftet er
rekkefølgen å møte dem i. PDF-en lages med
`node verktoy/lag-pdf.mjs docs/kom-i-gang.md --sideskift`.

**Hemmelighetene ligger i Netlify, ikke i repoet**, og det er derfor repoet
kan deles fritt. `node test/unit.mjs && node test/funksjon.mjs` kjører uten
nett og uten en eneste nøkkel — hele porten foran prod kan kjøres av noen
som ikke har tilgang til noe som helst. `test/run.mjs` trenger bare
Chromium.

**`SECRETS_SCAN_OMIT_PATHS` dekker `docs/**` og `test/**`**, fordi
dokumentasjonen nevner plassholdere som «hemmelig-pepper». Følgen: en ekte
nøkkel i en testfil blir **ikke** fanget av Netlifys skanner.

**`PIN_PEPPER` kan ikke endres.** Et nytt pepper låser alle ute. Det er den
ene miljøvariabelen som ikke tåler et forsøk.
