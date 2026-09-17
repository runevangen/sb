# Hendelser

Det som gikk galt, hva som faktisk var årsaken, og hva som fanget det.

Loggen står her og ikke i `CLAUDE.md` fordi den er *historie*, ikke
regler. Reglene som kom ut av hver hendelse står i `CLAUDE.md` eller i en
[ADR](adr/README.md). Men historien er verdt å ha: nesten hver eneste av
disse så ut som noe annet enn den var.

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
