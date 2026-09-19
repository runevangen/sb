# Hendelser

Det som gikk galt, hva som faktisk var årsaken, og hva som fanget det.

Loggen står her og ikke i `CLAUDE.md` fordi den er *historie*, ikke
regler. Reglene som kom ut av hver hendelse står i `CLAUDE.md` eller i en
[ADR](adr/README.md). Men historien er verdt å ha: nesten hver eneste av
disse så ut som noe annet enn den var.

---

## 19. september 2026 — de siste 45 meterne, og setningen som skjulte dem

**Meldt som:** «Utvid `KJENT_RADIUS`» og «undersøk hvorfor posisjon ikke
slo inn» — to valg etter at RBK-puben fortsatt ikke sto der.

**Hva det så ut som.** To uavhengige saker. Det var én, og den lå i
setningen som sto igjen begge gangene.

**Radiusen, målt.** Puben ligger 63.4286, 10.3641 — **1545 meter** fra
Trondheim sentrum slik `BYER` definerer det, mot en radius på 1500. Den
bommet med 45 meter. (Oppføringen over målte 1560 m fra Torvet; samme pub,
litt annet utgangspunkt.) Radiusen *var* altså en ekte årsak, den lå bare
bak en større en og ble stående da den første ble rettet.

**Hvorfor den ikke bare ble skrudd opp.** `KJENT_RADIUS` gjorde to jobber.
Målt fra KFUM Arena gir 3000 m åtte kuraterte steder, mot ett på 1500 —
og de sju nye er sentrumspuber som ikke ligger ved den arenaen. «Nær deg»
tåler tre kilometer fordi hver brikke bærer avstanden sin og du forkaster
den selv; «ved arenaen» er en påstand du ikke kan forkaste. Så tallet ble
to: `NAER_RADIUS` 3000, `ARENA_RADIUS` 1500.

**Posisjonen, og hvorfor spørsmålet ikke lot seg stille.** Appen håndterte
avslag, tidsavbrudd, «telefonen fant den ikke» og «nettleseren har ikke
API-et» likt — og stille. Det siste som et rent `return`, uten så mye som
en knapp. Da sto «Fant ingen puber i nærheten. Skriv navnet selv.» igjen
som eneste forklaring.

Den setningen er ikke sann i noen av de fire tilfellene. Vi fant ingenting
fordi vi aldri fikk vite hvor «nær» var, og de to tingene ber leseren om
helt ulike ting: den ene å skrive navnet selv, den andre å trykke ja.

**Og det er den samme setningen som skjulte forrige feil.** Oppføringen
over ender med at ingenting fanget den, fordi appen sa «Fant ingen puber i
nærheten» — «en helt vanlig setning». Den var vanlig nettopp fordi den ble
sagt uansett hva som hadde skjedd. En feilmelding som passer til alt,
forteller ingenting.

**Hva som ble gjort.** `posisjonsfeil()` i `pub-data.js` gir én setning per
årsak, og hver navngir det som mangler på skjermen. Den ligger i sitt eget
felt på boksen, ikke i `boks.feil`, fordi den skal kunne **byttes ut**: i
feil-lista ble «Du sa nei til posisjon» stående etter at leseren sa ja.
Uten geolocation settes ingen knapp — en vei tilbake som ikke fører noe
sted er verre enn ingen.

**Testen som var grønn hele tida.** `SAK_14D` dekket den samme raden og
passerte. Den står i **døra** til puben — «samme punkt raden lagres med»,
altså null meter. Den beviste at sammenslåinga virker, ikke at stedet nås
fra der en leser står. En test som stiller seg der svaret er opplagt, måler
ikke det den tror. `SAK_14H` står i Trondheim sentrum i stedet.

**Hva som fanget det.** Seks sabotasjer, og alle ga symptomet tilbake.
Radiusen satt til 1500 igjen gir «Fant ingen puber i nærheten. Skriv
navnet selv.» — ordrett det som sto på skjermen. Den mest verdifulle var den tredje: droppes nullstillingen, blir
«Posisjonen kom ikke fram i tide» stående etter et vellykket nytt forsøk.
Den feilen ville ingen sett, for skjermen sa noe som hadde vært sant.

**Én ting til, om tallene.** Testtallet 660 som ble skrevet inn dagen før,
gjaldt et tre der PR #113 ikke hadde landet ennå. Den fjernet to
enhetstester, og squash-en rettet tallet til 658 av seg selv. Verdt å merke
seg at det gikk bra: to økter samme time traff fila i ulik rekkefølge, og
det var nettopp derfor tallet bare står ett sted.

---

## 18. september 2026 — puben var lagret, men appen hadde sluttet å spørre

**Meldt som:** «Fikk til å lagre rbk pøbb. Men den dukker ikke opp i andre
puber da jeg er innom Trondheim nå. Burde den ikke finne den som
nærmeste.» Og etterpå: «Jeg la inn Trondheim og kordinator herfra.»

**Hva det så ut som.** At rangeringen ikke tok den, eller at `KJENT_RADIUS`
på 1500 m var for trangt. Den første målingen støttet det: fra Torvet er
Ila 1560 meter — seksti meter utenfor.

**Hva som faktisk var årsaken.** Ikke radiusen. Koordinatet var leserens
eget, så avstanden var null.

Raden var riktig, sammenslåingen virket, og hele kjeden ble kjørt i
nettleseren med den ekte raden fra basen og posisjonen i Ila:

    ok   kampen kan apnes
    ok   knappen finnes
    ok   RBK-puben star i lista

Lista var hentet **én gang, ved sidelasting**, fra `initFotball()`. Runden
er admin → app: du lagrer i portalen og går tilbake til appen. Appen sto da
med `KJENTE` slik den var da sida ble lastet — før raden fantes — og hentet
aldri igjen. Den ene runden en rettelse gjøres i, var den ene runden appen
ikke så.

**Hva som ble gjort.** `visibilitychange` er den runden: du forlot fana,
gjorde noe, kom tilbake. `PUBLISTE_FERSK` holder det til ett kall per to
minutter, samme vindu som `LEVETID_PUBLISTE` — kanten svarer med det samme
der uansett. Et forsøk som ikke kom fram teller ikke som ferskt, så det
prøves igjen neste gang; en egen sperre hindrer to samtidige kall, og hvert
forsøk krever at et menneske har byttet fane.

**Og en tom liste ble et svar.** Vakta sto på `!json.puber.length`, som var
likegyldig da lista ble hentet én gang. Nå er den ikke det: tas den siste
rettelsen bort i portalen, er det tomme svaret det riktige, og appen skal
falle tilbake til fila framfor å bli stående med en rad ingen har lenger.
`klar` skiller «ingen rettelser» fra «tjenesten kunne ikke svare».

**Det andre som lå i det.** `tegnKjenteIgjen()` regnet bare om `kjenteNaer`
og `kjenteVedArena`. To kilder til leser også `KJENTE`: `bekreftede` slår
opp detaljene om stedet der, og `stampuber` leter etter `lag`. Så lenge
lista ble hentet én gang var det likegyldig. Nå henter den flere ganger, og
da måtte alle fire med — derfor holder boksen på kampen sin.

**Hva som fanget det.** Ingenting, og det er verdt å merke seg: appen sa
«Fant ingen puber i nærheten», som er en helt vanlig setning. En liste som
mangler én rad ser ut som en liste. Sabotasjen som fjerner lytteren gir
nøyaktig den setningen igjen.

---

## 18. september 2026 — RBK-puben kunne ikke legges inn, og køen fikk skylda

**Meldt som:** «Jeg prøvde å lagre RBK pøbb og sånt. Men ser den fortsatt i
forslagskasse.»

**Hva det så ut som.** At behandlingen av forslaget ikke tok — at «Lagt
inn» ikke ble lagret, eller at køen ikke ble hentet på nytt.

**Hva som faktisk var årsaken.** Køen sa sant. Stedet ble aldri lagret, og
forslaget sto som «ny» fordi ingen rad var laget.

To vakter stengte, begge med samme rot. `osmNavnSporring()` bygget en
bounding box av Oslo — `(59.8,10.45,60.05,10.95)` — så et navnesøk etter
«RBK Pub» lette i feil by og kunne ikke finne noe. Uten et treff, ingen
koordinater. Og `sjekkPubliste()` hadde den samme boksen hardkodet inni
seg, så et koordinat tastet for hånd ble avvist med «koordinatene ligger
utenfor området» — om et koordinat som var helt riktig.

**Det som hadde blitt usant var ramma, ikke køen.** Appen svarte allerede i
flere byer: `TESTBYER` med Oslo, Bergen, Trondheim, Bodø, Stavanger og
Tromsø kom inn dagen før, og `stampuberFor()` svarer på lagnavn — RBK er
nøyaktig det tilfellet. Portalen var den siste delen som trodde alt var
Oslo, og fila het `puber-oslo.js`, som var med på å gjøre det usynlig.

**Hva som ble gjort.** Byene er nå én liste som gjør to jobber: `BYER`
setter en falsk posisjon *og* er rammene portalen får lagre innenfor.
`rammeFor()` regner boksen ut framfor å skrive den inn — lengdegradene
smalner mot polene, og en fast bredde i grader ville gitt Tromsø en boks
tre ganger så bred som Oslos. `sjekkPubliste()` uten ramme krever at raden
ligger i én av byene; med ramme gjelder bare den, og det er søket, som
leter i én by om gangen. Fila heter `puber.js`.

**Byen lagres ikke på raden.** `byFor()` leser den ut av koordinatet.
Byvelgeren i portalen styrer bare hvor vi *leter*, og følger tallene når de
endrer seg — to felt som kan si hver sin by er to sannheter om ett sted.

**Hva ramma er til for.** Ikke å si hvor folk bor. Den fanger lat og lon
byttet om: da havner en Oslo-pub i Somalia, og begge tallene ser fortsatt
riktige ut. Det er én grense å flytte hvis en pub ligger lenger ut —
`BY_RADIUS_KM`, femten kilometer, ett sted for alle byene.

**Hva som fanget det.** Ingenting. Vakta sa «koordinatene ligger utenfor
området» til en admin som satt med riktige tall, og meldinga nevnte ikke at
«området» var Oslo. Den sier nå hvilke byer som finnes. Og feilen var
umulig å se fra køen, som var det eneste stedet den ga utslag: et forslag
som blir stående ser likt ut enten ingen har prøvd eller noen har prøvd og
blitt avvist.

---

## 17. september 2026 — adressesøket fant ingenting, og bokstavene var halve

**Meldt som:** «Feilmelding når jeg legger inn bydel og adresse på foreslått
pub», med `forsok`-lista limt inn — ett speil svarte 200, resten 406 eller
avbrutt.

**Hva som faktisk var årsaken.** To ting, og ingen av dem var Overpass.

`delAdresse()` leste husnummeret som **siste** bit. Folk skriver poststed
etter adressen, og et innsendt forslag gjør det nesten alltid: «Torggata
11, Oslo» ble da gata «Torggata 11 Oslo», forankret med `^$`, og null
treff. Nummeret står rett etter gata, ikke sist — nå kastes alt som kommer
etter det.

`osmNavnVask()` hadde en **håndskrevet** bokstavliste: `A-Za-z` pluss æøå.
Alt annet ble mellomrom. «Grünerløkka» ble «Gr nerløkka» og «Café Sara»
ble «Caf Sara» — to ekte steder i Oslo, begge usøkbare. Klassen er
`\p{L}` nå: en bokstav, uansett språk. Hermetegn, apostrof og
bakoverstrek slipper like lite gjennom som før — det var dem vasken
fantes for.

**Hva som fanget det.** `forsok`-lista. Uten den ville meldinga vært «ingen
treff», og ingen ville visst at ett speil faktisk svarte 200 — altså at
spørringen var stilt og besvart, og at det var *spørsmålet* som var feil.
Regelen fra #100 tjente inn seg selv på to dager.

**Regelen det ble til.** En håndskrevet liste over hvilke tegn som er
bokstaver, er en liste som kommer til å mangle noen. Bruk `\p{L}` og vask
bort det som faktisk er farlig.

---

## 17. september 2026 — «Fikk ikke puber ved Stadio Pierluigi Penzo»

**Meldt som:** «Finner ikke puber nær stadion er vel litt rart å si. Her må
vi vel søke etter nær bruker.»

**Hva som skjedde.** Hver eneste Serie A-kamp — og hver Premier League-,
La Liga- og Bundesliga-kamp — viste ei linje i kampkortet om at vi ikke
fikk puber ved stadion. Den hadde stått siden ligaene ble lagt til.

**Hva som faktisk var årsaken.** `ARENAER` i `vaer-data.js` er tretti
norske stadion, og `/api/puber` svarer `400 Ukjent arena` på alt annet.
Den kuraterte lista ved arenaen var riktig vaktet med
`arenaFor(kamp.arena)` — men nettkallet sto på `if (kamp.arena)`, altså på
at *navnet* fantes. To vakter på samme spørsmål, og bare den ene stilte
det riktige.

**Hva som fanget det.** Ingenting. En leser så det i appen. Testene dekket
norske arenaer og arenaer uten navn; en arena med et navn vi ikke kjenner
var hullet mellom de to.

**Regelen det ble til.** Vakta står på `arenaFor()`, ikke på at navnet
finnes. Og mer generelt: **en feilmelding om noe vi aldri burde spurt om,
er verre enn ingen melding.** Den ser ut som at tjenesten svikter, mens
det som svikter er spørsmålet. For de kampene er stedene nær deg svaret —
og de sto der hele tiden, under en linje som sa at noe var galt.

---

## 18. september 2026 — Lista fantes, men bare hvis du sa hvor du var

**Drodlet fram, ikke meldt som feil:** «Andre fotballpuber — skulle ikke
det være puber som ligger i lista, men ikke har bekreftet at de viser
kampen?»

Jo. Og de sto der — `kjenteNaer` og `kjenteVedArena` er nettopp det, merket
⚽ framfor ★. Men begge når fram gjennom et **geografisk filter**:
`kjenteNaer` krever posisjonen din, `kjenteVedArena` at arenaen er en av de
tretti norske `arenaFor()` kjenner.

**Utenlandsk kamp og nei til posisjon: da fantes ikke lista.** Ikke
«tømt», ikke «feilet» — den ble aldri spørt. 26 steder redaksjonen har
vurdert lå i pakka og ble ikke vist, enda `lag`-feltet i dem svarer på
nettopp den kampen som sto på skjermen.

`stampuberFor()` er veien inn som manglet. Spiller Brann, er
Brann-stampuben et svar uansett hvor du står.

### Plasseringen var avgjørelsen, ikke kilden

Første forsøk satte `stampuber` rett etter `dine` — altså foran geografien.
En eksisterende test falt: «nærmest står først». Kampen i fikstur er
Brann–Bodø/Glimt, Scotsman *er* Bodø/Glimt-stampuben, og den gikk forbi
den nærmeste puben.

Testen hadde rett. En stampub tvers over byen er et dårligere svar enn en
fotballpub i nabogata. Kilden skal **fylle hullet der geografien ikke gir
noe, ikke gå foran den der den gjør det** — altså etter de geografiske
kildene og før de rene karttreffene.

### To ganger grønt av feil grunn

**Røyktesten min.** Jeg kjørte `stampuberFor({hjemme:"Vaalerenga",
borte:"Brann"})`, fikk to puber, og leste det som at foldingen virket. De
to var **Brann**-puber. «Vaalerenga» traff ingenting: `normaliserLagnavn`
gir «vaalerenga» mot «valerenga». Enhetstesten som spurte om nettopp den
foldingen fant det.

Dette er det første stedet i appen der lagnavn fra **API-et** møter lagnavn
skrevet av **redaksjonen**, og derfor har ingen truffet det før. Foldingen
`aa` → `a` ligger lokalt i `stampuberFor()` — ikke i `normaliserLagnavn`,
som går inn i `kampNokkel()` og dermed i id-en til hver rad som alt ligger
i basen ([ADR 0008](adr/0008-kampnokkel.md)).

**Og nettlesertesten.** Jeg la påstanden i en scene som **gir posisjon midt
i Oslo**, så Scotsman kom fra `kjenteNaer` hele tiden. Sabotasjen — kilden
tømt — endret ingenting, og det var det som avslørte det. Scenen som faktisk
har hullet måtte bygges: utenlandsk arena, posisjon avslått. Der står det
nå «(tom liste)» når kilden fjernes.

**Bakoverfnutten i en kommentar sprengte malen igjen**, andre dag på rad.
Den står i `docs/testing.md`; jeg leste den ikke først.

### Og en tredje gang, i det jeg trodde jeg var ferdig

Falsk posisjon (`?posisjon=bodo`) kom til rett etter, for å kunne prøve
appen i andre byer. Første kjøring i Bodø viste **Scotsman, O'Learys og
Carls** — tre Oslo-puber, uten avstand, som om de lå i nabogata.

De kom fra stampub-kilden jeg nettopp hadde lagt inn. `puber-oslo.js` er
en **Oslo**-liste, og `stampuberFor()` spør ikke hvor du er. For en leser i
Oslo er det riktig; for en leser i Bodø er det selvsikker støy.

Kilden er en **utvei**, ikke et tillegg: kommer det en posisjon, tømmes
den. Geografien er svaret der den finnes. Er du i Oslo, kommer de samme
stedene tilbake gjennom `kjenteNaer` — med avstand på.

Det var testen i Bodø-scenen som fant det, én time etter at kilden ble
skrevet. Uten den ville feilen ligget i prod og sett helt rimelig ut for
alle som bor i Oslo.

---

## 18. september 2026 — Det var ikke bredden, det var zoomen

**Meldt som:** «Jeg kan fortsatt flytte vindu til høyre og venstre. Admin
vindu.» — andre gang, etter at brukertabellen var rettet.

Første gang fant jeg noe ekte: tabellen trengte 457 px der telefonen ga
343. Jeg rettet den, skrev en vakt som måler `main` i en 320 px-boks, og
trodde saken var ute av verden.

**Andre gang målte jeg hvert eneste element.** Ingenting over 320 px. Alle
seksjoner synlige, skjemaene åpne, tabellen full. Layouten var riktig.

Safari på iPhone **zoomer inn av seg selv** når du fokuserer et felt med
skrift under 16 px. Etter den zoomen er den visuelle viewporten mindre enn
layout-viewporten, og sida kan dras sidelengs. Feltene arvet `font: inherit`
— 15 px fra `body`. Én piksel fra å være trygg. PIN-feltet i brukerlista sto
på 13.

Det skjer i det du trykker i passordfeltet, altså første handling på sida.
Derfor så det ut som om sida alltid var «løs».

**Vakta målte feil ting.** Den målte bredde, og bredden var i orden. En
vakt som måler feil ting sier «alt er bra» mens telefonen gjør noe annet —
og den er verre enn ingen vakt, fordi den lukker spørsmålet. Den nye måler
`font-size` på hvert `input`, `select` og `textarea`, og lister opp hvert
felt som er for lite når den slår ut.

**Appen hadde det samme:** `.konto-felt` på 13 px — der PIN-en skrives, og
altså feltet folk blir stående lengst i — og `.sok-felt` på 13,5. Begge
rettet. `--fs` er 1 eller 1,2, så skaleringen oppover står; det er bare
bunnen som er løftet. Vakta dekker begge sider nå.

Samtidig: lenka i hamburgermenyen het «Hvem viser kampen (admin)», som
beskrev én seksjon av portalen framfor portalen. Den heter «Admin» nå, som
sida selv.

---

## 18. september 2026 — «Egentlig så lagrer bruker 1 da»

**Meldt som:** «Jeg kommer inn i admin, fem kamper er markert. Jeg legger
til én og da står det 6 lagret. Egentlig så lagrer bruker 1 da. De
tidligere er lagret fra før.»

Det var sant på to nivåer, og det andre så ingen.

### Knappen talte valget, ikke endringen

«Lagre 6 kamper» er sant om det som ble sendt og usant om det du gjorde.
Knappen sier nå «Legg til 1 kamp for Andy's Pub» — eller «Fjern 2 kamper»,
eller «Legg til 1 kamp og fjern 2» når begge deler skjer i samme trykk.

### Og tjenesten skrev dem virkelig alle seks

Lagringen slettet pubens rader for kampene på skjermen og skrev hele
valget på nytt. De fem som alt lå der fikk dermed **nytt `satt` og ny
`satt_av`** hver gang noen trykket lagre.

Feltet som skal si *når kampen ble satt*, sa i stedet *sist noen trykket
lagre* — og i den siste admins navn, siden databasen setter `satt_av` fra
økta som skriver.

**Ingen så det, fordi `satt` ikke vises noe sted.** Det er nettopp derfor
det er verre enn en synlig feil: et felt som stille blir usant har
ingenting som avslører det. Det hadde ligget der og vært galt til noen en
dag bygde en visning oppe på det og lurte på hvorfor alle kampene var satt
samme minutt.

Tjenesten leser nå hva som ligger der, regner ut forskjellen med
`visningsDiff()`, og rører bare den. Uendrede rader beholder sitt
opprinnelige `satt`.

**Og lesingen tilbake ble sterkere av det.** Før var beviset at
skrivingen ga rader tilbake; nå leses hele omfanget etterpå, og hver rad
som skulle legges til må være der. Kvitteringen sier hva som faktisk
skjedde: «La til 1 kamp. 5 sto fra før.»

### Stubben kunne ikke svare på spørsmålet lenger

Funksjonstestene ga et fast svar på hver GET — den samme lista før og
etter skrivingen. En tjeneste som leser tilbake for å se hva den gjorde,
kan ikke testes mot noe slikt. Stubben er nå en liten tabell som forstår
`pub=eq.`, `kamp_id=in.(…)` og `dato=lt.`: GET gir det som ligger der, POST
legger til, DELETE fjerner.

At den må forstå filtrene er ikke pedanteri — en stubb som svarte alt
uansett filter, ville gitt en diff mot andre pubers rader og vært enig med
en feil vi ikke har.

**Fanget av:** en admin som talte etter. Feilen i knappen var synlig; den i
databasen var det ikke, og den ble funnet fordi den første ble meldt.

---

## 17. september 2026 — Spørsmålet jeg hadde svart nei på to ganger

«Jeg ønsker å kunne se når de var inne med pålogget bruker, ikke bare tastet
pin kode. Er det mulig?»

To dager på rad hadde jeg forklart hvorfor kolonnen sto som den sto: feltet
er `last_sign_in_at`, en fornyet økt rører det ikke, og å måle bruk ville
vært sporingen [ADR 0004](adr/0004-ingen-statistikk.md) forbyr. Først døpte
jeg kolonnen om. Så satte jeg «det er deg, innlogget nå» ved siden av den.
Begge gangene gjorde jeg etiketten sannere og lot spørsmålet stå.

**Da jeg endelig slø opp i basen i stedet for å resonnere om den, sto svaret
der.** Samme konto:

| Felt | Verdi |
| --- | --- |
| `users.last_sign_in_at` | 14. september |
| `sessions.refreshed_at` | 17. september 21:04 |

Supabase fører allerede når økta sist ble fornyet. Den **må** — det er slik
folk holdes innlogget. Å lese det feltet er ikke å begynne å måle noen; det
er samme slags oppslag som `last_sign_in_at`, som vi hadde vist hele tiden.
[ADR 0021](adr/0021-sist-inne-fra-oktene.md).

**Det jeg tok feil av var ikke reglene, men hvor jeg lette.** «Er dette
mulig uten å bryte ADR 0004» ble besvart fra det jeg visste om koden vår,
ikke fra det som faktisk lå i databasen. Ett oppslag — fire linjer SQL —
gjorde to dager med forklaringer unødvendige.

Tre ting måtte stå for at kolonnen ikke skulle bli en ny halvsannhet: at
det betyr «sist appen var i gang», ikke «sist de så på skjermen»; at
historikken bare er så lang som øktene lever, så «Ingen økt i live» står
framfor en tom celle; og at PIN-datoen ikke forsvinner — den ligger i
hjelpeteksten, for det er den du trenger når noen har glemt PIN-en.

**`personvern.html` sa «når hver av dem logget inn første og siste gang».**
Den setningen ble usann i det kolonnen skiftet betydning. Rettet — ikke som
en ny opplysning, men for å holde en gammel sann.

**En stubb som var enig med koden uansett:** funksjonstestene ga det samme
svaret på hvert endepunkt, så økt-oppslaget fikk brukerlista tilbake som
«økter». Alt var grønt før jeg skrev en linje med assertions. De to
endepunktene svarer hver for seg nå, som hos Supabase.

**Og en bakoverfnutt i en kommentar:** ``// `sist` er PIN-datoen`` inne i en
scene avsluttet malen scenen står i. Feilen kom ut som «missing ) after
argument list» på en linje flere hundre lenger opp.

---

## 17. september 2026 — Fire ting i portalen, meldt i én melding

### Sida var løs på mobil

«Jeg kan scrolle hele skjermen til venstre og høyre.»

Brukertabellen trengte **457 px**: fire kolonner, to av dem `white-space:
nowrap`, og en med et tekstfelt og to knapper. En iPhone 13 mini gir 343.
Hele sida ble dratt bred etter den.

**Samme feil som poengkolonnen 16. september**, i en annen tabell. Og
første forsøk på fiksen gjentok feilen i testen: en `@media (max-width:
560px)` ser på **vinduet**, og testen måler i en boks med kjent bredde —
fordi `--window-size` ikke binder likt lokalt og på CI. Regelen ville
altså stått uvoktet. Lista er derfor kort-per-person i **enhver** bredde,
uten spørring, og vakta måler `main` i en 320 px-boks.

### «Sist pålogget» var fortsatt feil — for leseren

«Jeg er inne men det står 2 dager siden.»

Datoen var riktig, og etiketten var riktig etter omdøpingen dagen før:
feltet er sist personen **tastet PIN-en**, og en fornyet økt rører det
ikke. Men to sanne ting ved siden av hverandre kan fortsatt lese som en
selvmotsigelse.

Vi begynner ikke å telle bruk for å gjøre tallet til noe annet — det er
sporingen [ADR 0004](adr/0004-ingen-statistikk.md) forbyr. Men den ene
raden vi kan si noe sant om **uten å måle noe**, er din egen: økta ligger
i denne nettleseren, og uid-en i den er den samme som i lista. Raden din
sier nå «— det er deg, innlogget nå» rett ved siden av datoen.

### Knappen trakk tilbake sin egen kvittering

«Jeg trykker lagre 5 kamper, får beskjed at de er lagret, så dukker
lagre-knappen opp igjen.»

Den gjorde det: boksene sto urørt, så knappen sa fortsatt «Lagre 5
kamper». En knapp som ser ut som den har arbeid å gjøre, rett under en
melding som sier at den er ferdig, motsier kvitteringen.

Avkryssingene har nå en signatur, satt to steder: etter en vellykket
lagring, og når lista tegnes — det som står der da, kom fra basen og *er*
det lagrede. Er de like, sier knappen «Lagret for Andy's Pub» og er
avslått.

Og et skille som måtte håndteres: **tomt er ikke det samme som lagret.**
Har puben ingenting satt, ville «Lagret for Andy's Pub» påstått at noe
ligger der; den sier «Ingen kamper satt for Andy's Pub». Har puben kamper
og du fjerner alle, betyr null avkrysset noe — å ta dem bort — og da sier
knappen nettopp det. En eksisterende test voktet den andre tilstanden i en
scene som var i den første; begge er voktet nå, hver i sin scene.

### Undertittelen løy om to ting

Den sa at PIN-ene ligger i portalen (admin kan sette en ny, aldri lese den
gamle) og at endringen venter på en utrulling (visningene gikk til Supabase
15. september, og lagremeldingen sier nettopp at det ikke er noe å vente
på). En undertittel som motsier kvitteringen to seksjoner ned er verre enn
ingen. Sida heter «Admin» nå.

**En vakt som ikke voktet:** sabotasjen av *bare* linja som settes etter en
vellykket lagring felte ingen av mine nye tester — bare en urelatert. Den
lokale veien var dekket, den som faktisk ble meldt var det ikke. Testen for
den ekte rundturen kom til etter den sabotasjen, ikke før.

---

## 17. september 2026 — «Viser 5 kamper fra før» var sant og ubrukelig

**Meldt som:** «Når jeg kommer tilbake på admin ser det sånn ut. Selv om
jeg lagret sist gang.» Skjermbildet viste tre avkryssinger. Hinten over
sa fem.

**Ingenting var borte.** De to siste sto lenger ned enn skjermen rakk, og
lagringen hadde gjort nøyaktig det den skulle: slettingen er avgrenset til
kampene som sto på skjermen, og lista i minnet holdes i takt med det som
faktisk ble skrevet. Et ligabytte tar ikke med seg en annen ligas kamper.

Feilen var at **skjermen ikke svarte på spørsmålet**. Admin lurer ikke på
*hvor mange*; admin lurer på *ble det jeg lagret stående?* «Viser 5 kamper
fra før» er sant, og sier ingenting om det. Tre synlige avkryssinger av
fem ser da ut som tap — og den eneste måten å vite bedre på, var å rulle
gjennom hele lista og telle selv.

**Og tallet talte på tvers av ligaer** mens boksene under viste én:
`visninger.filter((v) => v.pub === pub)`, uten filter på liga. Har puben
to kamper i Premier League, sier hinten fem der Eliteserien kan vise tre.
Da er forskjellen ekte, og ser ut som akkurat det samme tapet.

To rettelser, begge om å si hvor ting er framfor hvor mange:

- Hinten sier nå «Andy's Pub viser 5 kamper fra før, alle i lista under»
  — eller «3 i denne ligaen, 2 i en annen» når det er sant. Den navngir
  puben, så feil pub valgt synes her også.
- Hver rundeoverskrift bærer «2 av 2 valgt», talt av boksene selv og
  oppdatert på hvert kryss. Da svarer et blikk på det lista ellers krever
  rulling for.

**Fanget av:** admin, som trodde arbeidet var tapt. Det er den dyreste
formen for uklarhet — den koster tillit til lagringen, ikke bare tid.

**En grønn test brøt på riktig måte:** «hver runde får sin egen
overskrift» sammenliknet `textContent` med «Runde 21» og falt da tallet
kom til. Den sjekker nå at navnet står først, og tallet har sin egen test.

---

## 17. september 2026 — Fire linjer diagnostikk, tre feil i dem

Dagen før fikk portalen vise `forsok` — tjenestens egne ord om hvert
speil. Første gang de sto på skjermen, sa de dette:

    Overpass overpass-api.de       · HTTP 406 · <!DOCTYPE HTML PUBLIC "-//W3C… · 472 ms
    Overpass overpass.private.coffee · This operation was aborted · 6480 ms
    Overpass overpass.private.coffee · This operation was aborted · 6480 ms
    Overpass overpass.osm.ch       · HTTP 400 · <?xml version="1.0" encoding… · 409 ms

Fire linjer, og **tre feil i dem**.

### 1. `Accept: application/json` var grunnen til 406-en, ikke botemidlet

Kommentaren over `overpassHeadere()` sa at hovedtjeneren svarer 406 uten
Accept, og en enhetstest slått fast at den skulle stå der. Begge tok
feil. Overpass merker ikke svaret som JSON på HTTP-nivå selv om
`[out:json]` står i spørringen — ber vi strengt om JSON, er det
ingenting den kan gi oss, og 406 er nettopp «jeg har ikke noe du vil ha».
Formatet bestemmes av spørringen. Her er det ingenting å hevde, og Accept
er `*/*` nå.

**472 ms, hver gang.** Det er derfor ingen oppdaget det: en feil som
kommer på under et halvt sekund ser aldri ut som nedetid, og de andre
speilene dekket over den. Dette gjaldt også pubsøket leserne bruker.

### 2. Diagnostikken forvekslet to tjenere

`private.coffee` sto to ganger — med samme tid på begge — og
`kumi.systems` sto ikke i det hele tatt.

Notatene ble hentet fra avvisningene: `Object.assign(err, { notat })`.
Men når en `AbortController` avbryter, avvises **alle** kallene med det
**samme feilobjektet** — `signal.reason` er én instans. Hvert speil skrev
da over det forrige, og det siste som kjørte sin `catch` vant, én gang per
avbrutt kall. Sabotasjen som gjeninnførte dette viser det rent: alle fire
linjene ble til samme vert.

Notatene eies av den som kaller nå, ett per speil, fylt på plass. Det
samme gjaldt `puber.mjs`, som leserne treffer.

*En diagnostikk som forveksler to tjenere er verre enn ingen* — den peker
på feil sted med samme selvsikkerhet som en riktig.

### 3. Feilsiden viste doctypen i stedet for grunnen

Overpass svarer med en HTML-side når noe er galt. Vi tok de første 80
tegnene av den — altså `<!DOCTYPE html PUBLIC "-//W3C//DTD…`, som er det
samme uansett hva som feilet. `overpassFeiltekst()` stripper taggene og
tar feilsetningen framfor resten.

### HTTP 400: spørringen krevde et regex-bygg ikke alle har

Spørringen sa `["name"~"(?=.*Dubliner)(?=.*Folk)",i]` — alle ordene må
finnes, i hvilken som helst rekkefølge. Lookahead krever et regex-bygg
som `overpass.osm.ch` ikke har, og den svarte HTTP 400 på hvert eneste
søk.

Overpass ANDer flere filtre på samme nøkkel, så
`["name"~"Dubliner",i]["name"~"Folk",i]` betyr nøyaktig det samme og
leses av alle bygg. Lookahead-formen var bare kortere å skrive, og det
var alt den hadde. *Et speil som ikke kan lese spørringen vår er et speil
vi ikke har.*

Og en test til som var grønn av feil grunn: «korte biter som «The» og
«Pub» teller ikke med» søkte etter `(?=.*Pub)`. Med filterformen finnes
den strengen ikke uansett hva koden gjør — og `"Pub"` alene står inni
`["name"~"Dubliner",i]`. Sjekken må være på hele filteret.

### Og en femte, som følger av regelen fra i går

To speil ble avbrutt **midt i arbeidet** på 6480 ms. Fristen var målt for
lavt, så `SOK_SEKUNDER` er åtte, og `SOK_TAK` vokter Netlifys ti sekunder
med margin. `overpassSporring()` — radiussøket — hadde samme uoverens-
stemmelse: den ba om `[timeout:12]` mens tjenesten ventet 7,5 s og appen
8 s. Den tar sekundene som parameter nå, og hver kaller sier sannheten.

**Fanget av:** `forsok` på skjermen, første gang den sto der. Alt dette
hadde ligget i produksjon og vært usynlig, fordi et speil som svarte
dekket over tre som ikke gjorde det.

**Testene var enige med to av feilene.** Enhetstesten slått fast at Accept
skulle være `application/json`, med en kommentar som forklarte hvorfor —
begge skrevet ut fra samme antakelse som koden. Og funksjonstesten for
feilsiden overlevde sin egen sabotasje, fordi stubben min var kortere enn
80 tegn etter tagstripping. Begge fellene står i `docs/testing.md`.

---

## 16. september 2026 — Navnesøket var den eneste veien til et koordinat

**Meldt som:** «Får ikke svar, dermed ikke lagret da vi ikke har
koordinater.» Skjemaet sto med navn, bydel, adresse, type og kilde — og
to tomme koordinatfelt.

Portalen kunne slå opp et sted i OpenStreetMap **på navn**. Det hjelper
for «The Dubliner». Det hjelper ikke for et lite sted OSM ikke kjenner
navnet på — og det er nettopp de stedene admin må føre inn for hånd.
Uten koordinat stopper lagringen, for `sjekkPubliste` krever et punkt
innenfor Oslo-ramma. Blindvei.

**Men den viktigste feilen var at vi ikke visste hvilken feil det var.**
Tjenesten svarte «Fikk ikke svar fra OpenStreetMap» — og la ved `forsok`,
som er nettopp den lista som sier hvem som svarte hva.
`stedKall()` kastet den. Det samme gjorde `forslagKall()`. Så admin
kunne ikke vite om Overpass var nede, om spørringen ble avvist, eller om
vi selv la på før svaret kom — og de tre krever tre ulike ting.

Det var det siste. Spørringen ba Overpass om `[timeout:12]` mens
tjenesten avbrøt etter seks sekunder. **Vi var den som ga opp**, og
meldinga la skylda på OpenStreetMap. To tall som skulle si det samme og
ikke gjorde det. Nå er det ett tall, `SOK_SEKUNDER`, og en test slår ut
hvis spørringen ber om noe annet enn det tjenesten venter.

**Tre veier nå, og den siste spør ingen:**

1. Navn, som før.
2. **Adresse.** «Berglyveien 4J» finnes i OSM selv om puben i første
   etasje ikke gjør det — norske adresser er importert fra Kartverket.
   Et hus har ingen `name`, så navnesøkets parser kastet nettopp den
   raden; adressesøket har sin egen.
3. **En kartlenke limt inn.** Koordinatet står i lenka. Ingen tjeneste
   spørres, så den virker også når Overpass er nede.

To feller i lenketolkinga: Google legger stedets eget punkt i `!3d…!4d…`
og kartets midtpunkt i `@…`, og står du zoomet ut er de langt fra
hverandre — stedets punkt leses først. Og en kortlenke
(`maps.app.goo.gl`) bærer ingen koordinater i det hele tatt; den får sin
egen melding, for «fant ingenting» ville sendt admin ut for å lete etter
noe som ikke er der.

**Fanget av:** en admin som prøvde å føre inn et sted. Alle testene var
grønne — de testet navnesøket, og navnesøket virket. Det var ingen test
for «hva gjør admin når det ikke gir noe», fordi det ikke fantes et svar
å teste.

Fem sabotasjer: `[timeout:12]` tilbake, `@` foran `!3d`, `forsok` kastet
igjen, ruta til adressesøket fjernet, og huset uten navn filtrert bort.
Alle fem slår ut.

---

## 16. september 2026 — «Sist inne» talte noe vi ikke måler

**Meldt som:** «Sist inne-loggen av brukere er feil. Jeg er inne nå og det
står 2 dager siden.»

Kolonnen viste `last_sign_in_at` fra Supabase. Det feltet er **sist noen
tastet PIN-en**, ikke sist de brukte appen. Appen holder telefonen
innlogget med roterende fornyere ([ADR 0009](adr/0009-fornavn-og-pin.md)),
og en fornying er ingen ny pålogging — feltet står stille. En som er innom
hver dag kan derfor ha en dato flere uker tilbake.

**Datoen var riktig. Ordet var det ikke.** «Sist inne» leses som aktivitet,
og aktivitet er nettopp det vi ikke registrerer
([ADR 0004](adr/0004-ingen-statistikk.md)). Fristelsen var å gjøre tallet
sant ved å begynne å telle besøk — altså å bygge sporingen ADR-en forbyr,
for å redde en overskrift. Den riktige rettelsen gikk andre veien:
kolonnen heter «Sist pålogget», og et avsnitt over tabellen sier i klartekst
at det ikke er sist bruk.

**Fanget av:** en leser som var innlogget mens han leste sin egen rad. Ingen
test kunne sett dette — koden gjorde nøyaktig det den skulle. Det var
etiketten som løy, og en etikett måles mot virkeligheten, ikke mot feltet.

To vakter i `run.mjs` holder ordlyden nå: overskriften må si «Sist
pålogget» og aldri «Sist inne», og seksjonen må forklare forskjellen.
Begge ble sabotert og slår ut.

---

## 16. september 2026 — «Lagre» lå tre seksjoner fra det den lagret

**Meldt som:** «lagre under admin og der en pub kan få lagt til en kamp er
ikke lett å se.»

Adminportalen er én lang rulling med seks seksjoner. «Lagre» lå i sin egen
seksjon **nederst** — etter *Foreslåtte steder*, *Steder* (et stort skjema)
og *Brukere* — mens den lagrer **Kamper**, som ligger nær toppen. «Kryss av
alle» og «Fjern alle» lå samme sted: knapper som opererer på en liste du
ikke ser mens du trykker dem.

**Tre feil, ingen av dem smak:**

- Handlingen var skilt fra det den handler på.
- Ingenting sa hvilken pub du lagret for. Pub-velgeren er en egen seksjon
  over, så du kunne krysse av ti kamper med feil pub valgt uten at noe på
  skjermen fanget det før det var lagret.
- «Lagre» sa ikke hva den lagrer — hverken antall eller pub.

Handlingsraden står nå i Kamper-seksjonen, klebrig mot bunnen så den følger
med mens du krysser av. Overskriften sier «Kamper Lincoln Pub viser», og
knappen «Lagre 3 kamper for Lincoln Pub» — eller «Fjern alle kamper for
Lincoln Pub» når ingen er krysset av, for null avkrysset er ikke *lagre
ingenting*, det er *fjern dem*.

Overskriften settes **over** den tidlige returnen i `tegnKamper()`: den
handler om puben, ikke om hvorvidt ligaen har kamper. Under den ville den
stått igjen med forrige pub i en liga uten kommende kamper.

---

## 16. september 2026 — poengkolonnen sto utenfor skjermen

**Meldt som:** «Må scrolle skjermen til siden for å se poeng. Alt burde få
plass på en side.» Testet på iPhone.

**Årsak:** `min-width: 316px` på `.tabell`. Begrunnelsen i koden sa «lavt
nok til at alle åtte kolonnene får plass på en telefon» — men en iPhone 13
mini er 375 px bred, `body` tar 10 px på hver side, og tabellfeltet blir
**310 px**. 316 er større enn 310, så regelen *tvang* tabellen seks piksler
forbi skjermen og skjøv poengkolonnen ut.

Den andre halvdelen av begrunnelsen — «høyt nok til at tallene ikke klemmes
sammen» — gjør `white-space: nowrap` allerede. En px-verdi der var et gjett
på feltets bredde, og feltets bredde avhenger av telefonen.

**Og det fantes en test som sa at alt fikk plass.** Den passerte av to
grunner som begge var feil:

- **Vinduet.** Ingen størrelse sendt inn, så `.phone` fikk hele sine 390 px
  — en bredde ingen telefon gir.
- **Navnene.** Tre rader med «Brann» og «Rosenborg». Eliteserien har
  «Kristiansund BK» og «Sarpsborg 08», og lagkolonnen er den ene som får
  vokse.

Og siden testen ble skrevet kom lagmerket (#33): 18 px bilde pluss 6 px
mellomrom i hver rad i nettopp den kolonnen. Ingen justerte bredden etterpå.

Den nye testen setter bredden selv og sjekker først at feltet *faktisk* er
smalt — ellers kunne den passere av samme grunn som den forrige.

**Og fiksen var ikke nok.** Å fjerne `min-width` lot tabellen krympe til det
den trengte — men den trengte fortsatt 322 px på CI, der bare 310 var
tilgjengelig. Lokalt fikk den plass. Hele forskjellen var **fontmetrikk**:
runneren har ikke de samme fontene som sandkassen, og layouten hadde null
slingringsmonn.

Det som faktisk bandt, var det lengste **ordet**. `«Kristiansund»` kunne
ikke brytes, så lagkolonnen kunne ikke bli smalere enn det ordet pluss
lagmerket — uansett hvor smal telefonen var. `overflow-wrap: anywhere` lar
ordet brytes når det må, og teller med i min-content-bredden, så tabellen
faktisk kan krympe.

Testen måler nå også ved 320 px, smalere enn noen iPhone i bruk. **En test
som treffer på grensen forteller deg bare hvilken font runneren din har.**

---

## 16. september 2026 — samme felle, samme dag, i en test jeg nettopp skrev

**Hva som skjedde.** Kilden på en pubrad måtte være en URL. Den regelen
stengte ute nettopp de stedene lista er til for — den lille puben med
storskjerm og ingen nettside — så den ble løsnet til «en lenke eller en
setning». Den nye testen for at «ok» fortsatt avvises, så grønn ut.

**Hva som faktisk var årsaken.** Den var skrevet
`sjekkPubliste([...])[0].indexOf("hvordan vi vet det") > -1`. Under
sabotasjen ble lista tom, `[0]` ble `undefined`, og `.indexOf` kastet. Da
døde hele unit.mjs midt i kjøringen framfor å melde ett rødt punkt — og
resten av suiten sto ukjørt.

**Hva som fanget det.** Sabotasjesjekken, men først på andre forsøk: første
gang leste jeg `grep`-utdata der krasjen ikke synes, og tok tallet fra en
senere kjøring i samme kommando som bevis på at alt var grønt.

**Regelen det ble til.** To ting, og begge sto i loggen fra før. En
assertion som plukker fra en liste, må tåle at lista er tom — `join(" | ")`
framfor `[0]`. Og et testtall er bare et bevis når du ser det i den samme
kjøringen som testen. Loggen hjelper ikke om den ikke leses før man
skriver, og den ble skrevet samme dag som dette.

---

## 16. september 2026 — stubben modellerte koden, ikke basen

**Hva som skjedde.** Testen for at rettelsene fra portalen treffer leseren
(#80) var rød på ett punkt: stedet som var merket `fjernet` ble stående i
kortet. Sammenslåingen så riktig ut, og enhetstestene for den var grønne.

**Hva som faktisk var årsaken.** Stubben. Den la inn `nokkel: "the toucan
public house"` — navnet med mellomrom, slik et menneske ville skrevet det.
`pubNokkel()` er `normaliserLagnavn()`, som også fjerner mellomrom, så
raden i basen bærer `"thetoucanpublichouse"`. Nøklene møttes aldri, og
raden ble aldri matchet.

**Hva som fanget det.** Ikke noe annet enn at assertionen var skrevet.
Enhetstestene for `slaSammenPuber()` brukte `pubNokkel()` til å lage
nøkkelen sin, og var derfor enige med koden uansett hva den gjorde.

**Regelen det ble til.** Den står alt i `docs/testing.md`: stubben skal
modellere svaret, ikke koden som lager det. Her ble den brutt i den andre
retningen — jeg skrev nøkkelen for hånd og modellerte det jeg *trodde*
koden gjorde. Rettelsen var å la stubben droppe nøkkelen helt, og la
`tolkPubRader()` utlede den, slik tabellen garanterer at den er.

---

## 16. september 2026 — én test rev de neste to hundre med seg

**Hva som skjedde.** Under en sabotasjesjekk av en ny funksjonstest døde
hele suiten: `TypeError: Cannot read properties of undefined`. Ikke ett
rødt punkt — kjøringen stoppet, og alt etter linja sto ukjørt.

**Hva som faktisk var årsaken.** Assertionen gjorde `kall.find(…).opsjoner`
uten å sjekke at `find` fant noe. Under sabotasjen gjorde den ikke det, og
da kastet uttrykket framfor å svare `false`.

**Hva som fanget det.** Sabotasjesjekken selv. I grønn tilstand ville
linja aldri kastet, og fella ville ligget der til den dagen noen brøt
akkurat det den beskytter — altså den dagen den trengtes.

**Regelen det ble til.** Grønt på en test som aldri kjørte er verre enn
rødt, og en test som drepte de neste to hundre er verst. En assertion som
plukker fra en liste, må tåle at lista er tom.

---

## 16. september 2026 — porten feilet av miljøet, ikke av koden

Da enhets- og funksjonstestene ble gjort til byggekommando (#77), feilet
Netlify-bygget: «Build script returned non-zero exit code: 2». De samme to
kommandoene ga exit 0 fra en ren utsjekking, og `netlify.toml` validerte.

**Første diagnose var feil.** Jeg trodde det var `publish = "."`, som
Netlify avviser når den er lik basismappa. Fjernet den — bygget var
fortsatt rødt.

**Årsaken var testenes miljø.** Tre funksjonstester dekker veien *uten*
`THESPORTSDB_KEY` — testnøkkelen «3», v1 framfor v2 — og de stolte på at
variabelen var tom framfor å tømme den. Lokalt og i CI er den tom.
Netlifys byggemiljø har alle de ekte nøklene satt.

**Funnet uten å bruke en deploy-runde:** å sette de samme variablene
lokalt og kjøre suiten. `funksjon.mjs` exit 1, `unit.mjs` exit 0. Fire
minutter per Netlify-syklus mot fire sekunder lokalt.

`funksjon.mjs` sletter nå variablene den bryr seg om før første test. En
port som feiler av miljøet den står i, er verre enn ingen port — og
suitene hadde aldri vært prøvd i et miljø med nøkler.

---

## 15. september 2026 — kolonnen som ikke førte regnskap

**Meldt som:** ingenting. Funnet ved å telle rader i basen etter at
visningene var flyttet dit, mens alt så riktig ut i appen.

**Årsak:** `satt_av` ble opprettet som `uuid references auth.users(id)`
— uten `default auth.uid()`. Funksjonen sender aldri kolonnen selv, med
vilje, så da var det ingen som satte den. Null på hver eneste rad, også
de som ble skrevet med en gyldig økt.

**Hvorfor den var vanskelig å se:** ingenting feilet. Skrivingen gikk,
RLS slapp den gjennom, leseren så pubene sine. Kolonnen er ikke lest av
noe ennå — den ligger der for #65, der det nettopp er *hvem* som meldte
inn som er poenget. En kolonne som later som den fører regnskap er verre
enn ingen kolonne, og den ville løyet først den dagen noen stolte på den.

**Lærdommen:** «funksjonen sender den aldri selv» er bare halve regelen.
Den andre halvparten er at databasen faktisk må sette den. To kommentarer
i koden påsto at den gjorde det.

---

## 15. september 2026 — «inne i dag før tiden er mulig»

**Meldt som:** «Ser bruker har vært inne i dag før tiden er mulig.»
Første mistanke var tidssone.

**Årsak:** ikke tidssonen. `sistInneTekst()` setter eksplisitt
`timeZone: "Europe/Oslo"`, og klokkeslettet var riktig hele tiden. Det var
*bøtta* som var feil: `(naa - t) / 86400000` teller forløpte
24-timersperioder, ikke kalenderdøgn.

Klokka 01:00 natt til den 15. er en innlogging 23:00 kvelden før to timer
siden — altså «dager = 0» — og raden sa **«I dag 23:00»**, 22 timer inn i
framtida. Samme feil den andre veien: 26 timer siden ble «I går» når det
var to kalenderdøgn.

**Hvorfor det sto så lenge:** funksjonen lyver bare mellom midnatt og
samme klokkeslett neste dag. Resten av døgnet faller de to måtene å telle
på sammen.

**Og testene påsto den gale oppførselen.** `NAA_TID` var
`2026-09-12T22:00:00Z` — som er *midnatt den 13. i Oslo*. Fixturen sto
midt i det ene vinduet der feilen viser seg, og de tre assertionene var
skrevet ut fra det koden gjorde. De feilet i det fiksen kom, og det var
riktig av dem.

**Ingen andre steder har den.** `utenGamle` bruker forløpt tid som en
terskel, og `timeAgo` sier «3d siden» uten å påstå noe om kalenderen.
`sistInneTekst` var den eneste som oversetter til kalenderord, og det er
nettopp der forløpte døgn ikke holder.

---

## 14. september 2026 — én kamp igjen i fanen

**Meldt som:** «dumt at man ser kun en kamp når det er slutten av en
runde. Jeg er nysgjerrig på kampene framover.»

**Årsak:** ingen feil. Fanen het «Neste runde» og gjorde nøyaktig det den
sa — `nesteRunde()` plukket runden til den første kampen som kom. Var
runden nesten ferdigspilt, var det én kamp igjen å plukke, og helgen etter
lå i svaret uten å bli tegnet.

**Fanget av:** en leser. Ingen test kunne fange dette: hver eneste test ga
fanen en full runde, som er akkurat den tilstanden der oppførselen ser
riktig ut. Testene sa noe sant om koden og ingenting om uka.

**Rettet:** hele vinduet vises, med en overskrift per runde
([ADR 0017](adr/0017-kampene-framover.md)). Kildene sendte de tjue kampene
hele tiden, så det kostet ingenting på døgnkvoten.

**Og stubben i vennetesten svarte likt uansett hvilke id-er den ble spurt
om.** Med et vindu stort nok til å buntes ga det den samme raden én gang
per bunt — «Kari og Kari» i lista. Samme lærdom som `somTjenesten()` under:
en stubb som er enig med koden i stedet for med tjenesten beviser
ingenting.

---

## 14. september 2026 — «blir med»-lista hadde aldri virket

**Meldt som:** «ser i base at bob og rune skal på andys pub, men de ser
det ikke i appen.»

**Årsak:** `tolkSvar` ble kjørt **to ganger**. `svar.mjs` tolker
PostgREST-radene (`kamp_id`) før den svarer; `fotball.js` tolket svaret
én gang til. Andre gang fantes ikke `kamp_id` — feltet het `kampId` — så
kamp-id-en ble tom. Hver rad ble nøklet under «», og oppslaget traff
aldri noe. Slik siden `599b4ea`, den første «jeg blir med»-commiten.

**Hvorfor det tok tre dager:** alt utenfor appen var friskt hele tiden —
riktig nøkkel ut, begge radene tilbake, komplett RLS. Hvert lag så
riktig ut for seg selv. Feilen lå i skjøten mellom to lag som begge var
«ferdige».

**Hvorfor 412 tester ikke så det:** stubben svarte med `kamp_id` — formen
i *basen* — mens tjenesten svarer med `kampId`. Stubben var skrevet ut
fra samme tankefeil som koden. `somTjenesten()` i testrammen gjør nå
omformingen tjenesten gjør.

**Det som til slutt fant den:** å reprodusere med ekte data — runden og
radene, mot appen i headless Chromium — framfor å lese koden. To
hypoteser før det var feil, og begge var forklaringer som *passet*.

> **En stubb som er enig med feilen din beviser ingenting.**

---

## 14. september 2026 — kilden nummererte kampene hver sin vei

**Årsak:** `id` var `fixture.id` fra API-Football eller `idEvent` fra
TheSportsDB. Kilden byttes av seg selv, og hvert bytte gjorde lagrede
rader usynlige. Se [ADR 0008](adr/0008-kampnokkel.md).

**Merk:** dette var en ekte latent feil, men den var *ikke* årsaken til
det som ble meldt inn samme dag. Den ble funnet mens vi lette etter noe
annet, og rettet fordi den ville slått til.

---

## 14. september 2026 — «to hamburgermenyer»

Menyen byttet innhold etter hvilken visning du sto i — kategorier i
nyheter, ligaer i fotball. Én knapp, to verdener, avhengig av en tilstand
du ikke ser mens menyen er åpen. De *så* ut som to.

Nå står «Tabell» og «Kamper» som brikker på emnene, og `visMeny()` har
ingen gren på visning. Ligaene byttes i `#ligaVelger`, der man alt står.

---

## 13. september 2026 — fem feil på én dag i «jeg blir med»

| Meldt som | Årsak |
|---|---|
| «Jeg markerte pub tidligere i dag. Ser ikke nå hvor jeg skal gå.» | `tegnSvar()` tegnet ikke et **åpent** kort på nytt når svarene landet |
| «Jeg blir ofte logget ut» | `refresh_token` ble kastet; tokenet varer én time |
| Delingsteksten manglet stedet | `bruker` ble tom ved fornying, så `egetSvar()` fant ingenting |
| «ser lite forskjell på en pub som er markert eller ikke» | farge alene; man trykker igjen for å sjekke og melder seg av |
| «de ser ikke hverandre» | `svarnavn` fulgte telefonen, ikke kontoen — to kontoer, ett navn |

**Og den systemiske:** appen sa «Du har planlagt å dra til Grønland
Boulebar & Spiseri» mens `/api/svar` svarte `{"svar":[]}`. En skriving
som svarer 200 er ikke bevis på at raden ligger der. `settSvar` leser nå
kampen tilbake to ganger — som deg, og som hvem som helst — og
forskjellen mellom de to er diagnosen.

En RLS-regel som mangler gir **null rader, ikke en feil**. En stille tom
liste er ikke til å skille fra «ingen har svart».

---

## 13. september 2026 — seks grupper pubforslag

Forslagene sto i en gruppe per kilde, med hver sin overskrift. Samme pub
sto i tre av dem, og den ene gruppa som faktisk svarte på kampen druknet.
Nå: én rangert liste, og rekkefølgen *er* svaret.

Samme dag: krysset i menyen ligger under statuslinja på iPhone, der
tommelen ikke rekker. Menyen har nå to veier ut.

---

## 13. september 2026 — testtallet løy

Et redigeringsskript feilet, testene kjørte mot den gamle fila, og alt så
grønt ut. Derfor telles tallene av testene selv, og derfor er tallet
sjekken på at en ny test faktisk kjørte.

> **Grønt på en test som aldri kjørte er verre enn rødt.**

---

## 13. september 2026 — fire ting sto i veien for PIN-innloggingen

Ingen av dem var i koden:

- **Hemmelighetsskanningen stoppet deployen.** `PIN_PEPPER` var satt til
  noe som finnes som tekst i repoet. `netlify.toml` holder nå `docs/` og
  `test/` utenfor, men fiksen er en lang tilfeldig verdi.
- **Scope på miljøvariablene.** En variabel som bare gjelder «Builds» ser
  ikke funksjonen ved kjøring. Den må ha Functions med.
- **Supabase lagrer ikke provider-innstillinger på bryteren.** «Confirm
  email» ble slått av uten Save, og sto tilbake som før.
- **Settings er delt opp hos Supabase.** Nøklene ligger under *API Keys*,
  ikke på den gamle `/settings/api`.

---

## 11. september 2026 — nøkkelen med ett siffer for lite

TheSportsDB svarte 400 fra begge utgavene. `forsok` viste det, og det var
det som pekte på nøkkelen framfor koden.

---

## Eldre, uten dato

- **`.kamp-delt` mot `.kamp-del`.** Vokteren som sjekker at trykkflata
  aldri maler noe, matcher selektorer på tekst — og `.kamp-del` er en bit
  av `.kamp-delt`. To navn én bokstav fra hverandre betydde helt ulike
  ting. **CI fanget det, ikke den lokale kjøringen:** en
  `pull_request`-kjøring tester grenen flettet med `main`.
- **Overpass svarte 406.** Kallet må bære `Accept: application/json`;
  uten den kommer en HTML-feilside.
- **Summen av trege tjenere ble større enn fristen.** Netlify avbryter en
  funksjon etter ti sekunder. Alt kappløper nå innenfor én frist, og den
  første som svarer vinner. Uten det fikk leseren Netlifys feilside i
  stedet for vårt svar — uten `forsok`, som er det eneste som sier hvem
  som sviktet.
- **`boks.feil` ble gjort til én streng.** Da forsvant den andre feilen
  når både arenaen og «nær deg» sviktet. Den er en **liste**.
- **To tester passerte av feil grunn:** rulletesten sjekket `scrollTop`
  der den var null uansett, og høydetesten kjørte i et vindu der taket
  aldri bandt.
- **Et bilde som må hentes over nettet fryser den virtuelle tida i
  testrammen** — samme felle som posisjonsoppslaget. Testsiden
  rapporterer da ingenting i det hele tatt.
