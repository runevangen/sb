# Hendelser

Det som gikk galt, hva som faktisk var årsaken, og hva som fanget det.

Loggen står her og ikke i `CLAUDE.md` fordi den er *historie*, ikke
regler. Reglene som kom ut av hver hendelse står i `CLAUDE.md` eller i en
[ADR](adr/README.md). Men historien er verdt å ha: nesten hver eneste av
disse så ut som noe annet enn den var.

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
