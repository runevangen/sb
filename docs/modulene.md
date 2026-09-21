# Modulene

Hva hver fil er, og hvilke regler som holder den oppe.

`CLAUDE.md` sier hva som gjelder på tvers. [`adr/`](adr/README.md) sier
hvorfor de dyre valgene ble tatt. [`hendelser.md`](hendelser.md) sier hva
som gikk galt og når. Denne fila står imellom: regel for regel, fil for
fil, for den som skal endre noe og ikke vet hva som bærer det.

Reglene her er hentet **ut av koden**, ikke skrevet ved siden av den. Står
det noe her som koden ikke gjør, er det koden som har rett og denne fila
som skal rettes. Kommentarene i filene er fortsatt den lengste
begrunnelsen; dette er kartet over dem.

---

## Mønsteret

    *-data.js      rene funksjoner: ingen DOM, ingen nettverk, ingen lagring
    app.js         appen: DOM, nettverk, lagring
    fotball.js     fotballmodulen: DOM
    admin.js       portalen: DOM
    netlify/functions/*.mjs   tjenestene: nøkler, cache, tredjeparter

En regel som både appen og tjenesten må kunne, hører hjemme i en
`*-data.js`. Blir de to uenige om den, får leseren en feilmelding som ikke
stemmer — «feil PIN» på en PIN som er riktig, «noe er galt» på et navn som
er greit. Det har kostet en kveld to ganger: engangskoden appen kappet til
seks sifre, og «blir med»-lista som var usynlig i tre dager.

Tre ting følger av mønsteret:

- **Grenser er konstanter, og de deles.** `KAMPER_MAKS`, `PIN_MIN`,
  `NAVN_MAKS`, `SOK_SEKUNDER`. En grense som står to steder glir fra seg
  selv, og da ber vi om tolv sekunder og legger på etter seks — mens
  meldinga legger skylda på den andre parten.
- **Voktere kjøres mot de ekte filene.** `sjekkPubliste`,
  `sjekkKontaktliste`, `sjekkKanalliste`, `sjekkVisninger`, `sjekkForslag`,
  `sjekkPubRad`. Alle gir en **liste** med det som er galt; tom liste
  betyr at alt er bra. De kjøres av `test/unit.mjs` mot `puber.js`,
  `puber-kontakt.js` og `kanaler.js` selv, så en feilskrevet rad slår ut i
  testene framfor hos leseren.
- **Tolkere må tåle å kjøres to ganger.** `tolkSvar`, `tolkVisninger`,
  `tolkForslag`. Tjenesten tolker radene før den svarer, appen tolker
  svaret én gang til. Andre gang finnes ikke `kamp_id` lenger — feltet
  heter `kampId`. Derfor leses begge formene, og en enhetstest krever at
  to kjøringer gir nøyaktig det samme som én.

---

## De rene modulene

### `lib.js` — feed, søk og rangering

Hjelpefunksjonene til nyhetsdelen. De ligger her og ikke i `app.js` for å
kunne testes i Node på millisekunder.

- **`safeUrl` slipper kun `http` og `https`.** En manipulert respons skal
  ikke kunne smugle `javascript:` inn i `src` eller `href`.
- **`videoUrl` sammenlikner hele `hostname`, ikke en delstreng.** `iframe`
  er den farligste taggen vi slipper gjennom; med delstreng ville
  `youtube.com.angriper.no` sluppet inn.
- **`postDate` bruker `date_gmt`, aldri `date`.** WordPress leverer `date`
  i sidens lokale tid uten tidssone. Brukes den, bommer klokkeslettet med
  hele UTC-avviket for alle lesere.
- **`foldTekst` folder norske tegn til ascii.** Titler fra WordPress kommer
  som HTML (`Bod&#248;/Glimt`), så uten foldingen bommer et søk fra
  tabellen på sin egen tittel.
- **`treffScore` gir 3 for tittel eller kategori, 2 for alle ordene i
  tittelen, 1 for utdrag og brødtekst.** En kategori på saken er et sikrere
  tegn enn at navnet står i teksten, og koster ingenting å sjekke.
- **`rangerTreff` har en terskel, og den er ulik for søk og favoritter.**
  Et søk vil ha alt (1): leseren ba om ordet. Favorittlag vil bare ha saker
  som *handler om* laget (2) — ellers skyves dagens toppsak nedover av en
  sak som nevner laget i forbifarten, uten at leseren ser hvorfor.
  Sorteringen er stabil, og tomt søkeord lar lista stå urørt.

### `fotball-data.js` — formen på sportsdataene

Delt mellom Netlify-funksjonen og nettleseren, så formen er definert ett
sted. [ADR 0006](adr/0006-sportsdata-via-funksjon.md),
[ADR 0007](adr/0007-thesportsdb-forst.md).

- **`kampNokkel()` er kampens identitet, aldri kildens id.**
  [ADR 0008](adr/0008-kampnokkel.md). Nøkkelen er dagen i UTC pluss de to
  lagnavnene, foldet. Ligaen står ikke i den: to lag møter ikke hverandre
  to ganger på én dag, og et liganavn kildene skriver ulikt ville bare
  flyttet problemet.
- **`normaliserLagnavn` kan ikke endres fritt.** Den går inn i
  `kampNokkel()`, og nøkkelen er det hver eneste lagrede rad står på. En
  folding som bare gjelder ett sted, hører hjemme det stedet — se
  `lagnokkel()` i `pub-data.js`.
- **`gyldigKampId` godtar både nøkler og gamle tall.** En delt lenke som
  alt er sendt bærer den gamle formen og skal fortsatt åpne kampen.
  Tegnsettet er smalt fordi verdien går inn i `kamp_id=in.(...)`, der komma
  og parentes betyr noe annet enn tegn i et navn.
- **`redaksjonsnavn()` oversettes ett sted.** I `tabellrad`, der dataene
  formes — så tabellen, kamplistene og søket ser samme navn.
- **`SPORTER` eier alt sportsspesifikt.** Adresse, nøkkelnavn,
  sesongvindu og parsere. En ny sport er en oppføring der, ikke en endring
  i `netlify/functions/fotball.mjs`.
- **`LEVETID` og `DOGNKVOTE` henger sammen, og testen regner det ut.**
  Gratisnivået gir hundre kall i døgnet per sport. Fem ligaer à 16 kall er
  80. Skal en sjette liga inn, er det levetidene som må gi etter — og
  `kallPerSport()` slår ut før det skjer.
- **`TSDB_MINST` finnes fordi et avkortet svar ikke må se helt ut.**
  Gratisnøkkelen hos TheSportsDB kapper til fem tabellrader og én kamp.
  Fem lag under «Sesong 2026» er verre enn fjorårets fulle tabell.
- **`kanalFor()` gir bare ut rader der både kilde og dato står.**
  [ADR 0016](adr/0016-kanalen-som-sender.md). Ukjent liga gir `null`, ikke
  feil kanal — samme valg som ukjent arena i `vaer-data.js`.
- **`kommendeKamper()` gir hele vinduet, ikke én runde.**
  [ADR 0017](adr/0017-kampene-framover.md). `runde` er fortsatt den
  første, så en eldre utrullet app viser noe riktig; `runder` er alle.
- **`tekst()` kapper lagnavn til 40 tegn.** Navnet havner i DOM som tekst,
  men et uventet langt navn skal ikke sprenge tabellraden.

### `pub-data.js` — stedene rundt kampen

Kilden er OpenStreetMap via Overpass. Lisensen (ODbL) krever synlig
kreditering, og den står der pubene vises.

- **Speilene spørres samtidig, ikke etter tur.** Summen av tre trege
  tjenere ble større enn fristen, og da kom ingenting. Kappløpet koster
  noen ekstra kall; svaret caches et døgn per arena.
- **`overpassHeadere(serverside)`: `Accept` er `*/*`.**
  `application/json` sto der i to uker og ga 406 på hvert eneste kall —
  472 ms hver gang, så raskt at det aldri så ut som nedetid. Formatet
  bestemmes av spørringen (`[out:json]`), ikke av headeren.
  `User-Agent` settes bare serverside; nettleseren forbyr det.
  `Accept-Encoding` settes ikke i det hele tatt: gjør vi det, slutter Node
  å pakke ut svaret, og `json()` feiler.
- **`overpassFeiltekst()` hopper over doctypen.** De første 80 tegnene i
  en Overpass-feilside er alltid `<!DOCTYPE html PUBLIC …` — altså det
  samme uansett hva som feilet, og dermed ingenting.
- **`restTid()` gir hver tjener sin egen frist under en samlet frist.**
  Netlify gir funksjonen ti sekunder; uten fristene får leseren Netlifys
  egen feilside uten et ord om hvem som sviktet.
- **`SOK_SEKUNDER` står ett sted og går både i spørringen og i fristen.**
  Sto de hver for seg, ba vi om tolv sekunder og la på etter seks.
- **`rundPosisjon()` runder til tre desimaler — rundt 100 meter.** Nok til
  å finne en pub, ikke nok til å si hvor noen bor.
- **`stampuberFor()` er veien inn som manglet.** De kuraterte stedene nådde
  lenge bare fram gjennom et geografisk filter: `kjenteNaer` krever
  posisjonen din, `kjenteVedArena` at arenaen er kjent. Utenlandsk kamp
  *og* nei til posisjon ga tom liste, enda `lag` i fila svarer på nettopp
  den kampen.
- **`lagnokkel()` folder strengere enn `normaliserLagnavn`.** Kilden
  skriver «Vaalerenga», fila «Vålerenga». Den ekstra foldingen (`aa` → `a`)
  ligger **her og ikke i `normaliserLagnavn`**, fordi den siste går inn i
  `kampNokkel()` — endrer vi den, endrer vi nøkkelen til hver rad som alt
  ligger i basen.
- **`FORSLAG_KILDER` er rekkefølgen, og rekkefølgen er svaret.** Det som
  gjelder *denne kampen* først, så det du selv har brukt, så steder vi vet
  viser fotball, så resten fra kartet. `stampuber` står **etter** de
  geografiske kildene og **før** de rene karttreffene: en stampub tvers
  over byen er et dårligere svar enn en fotballpub i nabogata, men et bedre
  svar enn en tilfeldig bar Overpass fant.
- **`sokKuraterte()` er veien utenom geografien.** Kortet rangerer etter
  hvor du står nå; søket leter i hele den kuraterte lista på navn, bydel og
  by. Det folder med `sokNokkel()` — NFD pluss `\p{M}` — og **ikke** med
  `normaliserLagnavn`, som har en håndskrevet bokstavliste og mistet ü-en i
  «Grünerløkka». Den kan ikke rettes der: den går inn i `kampNokkel()`.
  Navnetreff rangerer over treff på by og bydel; innenfor hver gruppe
  nærmest først, og alfabetisk når vi ikke vet hvor leseren er.
- **`rangerForslag()` gir én liste, ikke seks grupper.** Før sto forslagene
  under hver sin overskrift, samme pub i tre av dem, og den ene gruppa som
  faktisk svarte på kampen druknet. Nå havner hver pub ett sted, og merkene
  ★ og ⚽ bærer det overskriftene sa.
- **★ og ⚽ er to ulike påstander.** ★ betyr «viser denne kampen» og settes
  av admin; ⚽ betyr «kjent for å vise fotball» og kommer fra
  `puber.js`.
- **`kildeHolder()` godtar en lenke *eller* en setning.** Regelen er «kilde
  og dato», ikke «lenke og dato»: små steder har ingen nettside, og «Var
  innom 16.09.2026, storskjerm i baren» er bedre dokumentasjon enn en side
  fra 2019. Terskelen er tre ord og tolv tegn — formen kan ikke skille en
  god kilde fra en dårlig, men den kan skille et svar fra et ikke-svar.
  Feltet vises aldri for leseren.
- **`kontaktFor()` gir bare ut felt med `verifisert`-dato.** Et feil
  telefonnummer til en ekte bedrift er verre enn ingen.
- **`osmNavnVask()` bruker `\p{L}`, ikke en håndskrevet bokstavliste.**
  `A-Za-zæøå` gjorde «Grünerløkka» til «Gr nerløkka». Vask bort det som
  faktisk er farlig — hermetegn, apostrof, bakoverstrek — ikke alt du ikke
  kom på.
- **`osmNavnSporring()` kjeder filtre, den bruker ikke lookahead.**
- **`delAdresse()` tar husnummeret rett etter gata, ikke sist.** Folk
  skriver poststed etter adressen. Leste den siste bit, ble «Torggata 11,
  Oslo» til gata «Torggata 11 Oslo» og null treff.
- **`tolkAdresseTreff()` beholder rader uten `name`.** Et bygg uten navn er
  fortsatt riktig adresse; da er adressen overskriften.
- **`koordinatFraLenke()` tar det kartet faktisk gir deg.** Høyreklikk i
  Google Maps gir et *koordinat*, ikke en lenke — og fra stedskortet med
  parenteser rundt. Funksjonen tåler parenteser, hakeparenteser og
  mellomrom.
- **`slaSammenPuber()` slår sammen hele rader, aldri felt for felt.**
  [ADR 0020](adr/0020-stedene-i-portalen.md). Nøkkelen er navnet foldet
  (`pubNokkel`). Et sted som har lagt ned tas ut med `fjernet`, ikke ved å
  la være å skrive.
- **`BYER` er én liste med to jobber.** Den setter en falsk posisjon
  (`falskPosisjon`), og den er rammene portalen får lagre steder innenfor
  (`rammeFor`, `byFor`). Het `TESTBYER` til 18. september 2026, og det
  navnet ble usant i det portalen begynte å lagre mot den — en RBK-pub i
  Trondheim er ikke en test.
- **`rammeFor()` regner boksen ut, den skriver den ikke inn.**
  Lengdegradene smalner mot polene: en fast bredde i grader ville gitt
  Tromsø en boks tre ganger så bred som Oslos, målt i kilometer.
  `BY_RADIUS_KM` er femten, omtrent den gamle Oslo-ramma.
- **Ramma er en vakt mot skrivefeil, ikke en grense for hvor folk bor.**
  Den viktigste feilen den fanger er lat og lon byttet om: da havner en
  Oslo-pub i Somalia, og begge tallene ser fortsatt riktige ut. En pub
  tjue kilometer ut føres inn ved å utvide `BY_RADIUS_KM` — ett sted, for
  alle byene.
- **Byen lagres ikke på raden.** `byFor()` leser den ut av koordinatet. Et
  felt ved siden av kunne vært uenig med tallene, og da er det to
  sannheter om ett sted. I portalen styrer byvelgeren bare hvor vi
  *leter*, og den følger tallene når de endrer seg — aldri motsatt.
- **`sjekkPubliste()` uten ramme krever at raden ligger i én av byene;
  med ramme gjelder bare den.** Den siste er søket i portalen, som leter i
  én by om gangen.
- **`falskPosisjon()` er et testverktøy som virker i prod.**
  `?posisjon=bodo`. Merket vises på skjermen: «Falsk posisjon: Bodø».

### `svar-data.js` — «jeg blir med»

[ADR 0015](adr/0015-svarene-i-appen.md).

- **`tolkSvar` må tåle å kjøres to ganger.** Se *Mønsteret*. Dette er feilen
  som gjorde lista usynlig for alle i tre dager, og den ble ikke fanget av
  412 nettlesertester fordi stubben svarte med `kamp_id` — formen i basen —
  mens tjenesten svarer med `kampId`. Stubben var skrevet ut fra samme
  tankefeil som koden.
- **`svarRad()` sender ikke `bruker`.** Databasen setter den fra økta. Gjør
  funksjonen det selv, kan en feil her skrive i en annens navn.
- **`KAMPER_MAKS` er delt.** Kjenner ikke den som spør grensa, faller de
  siste kampene stille ut av svaret.
- **`gyldigNavn` krever en bokstav eller et tall.** Ellers er «•••» et
  navn, og lista blir uleselig for alle andre.
- **`navnIRad()` setter deg først, og du heter «Du».** Kortet svarer på
  «hvor skal jeg?». Er det flere enn det er plass til, vises én færre enn
  taket og resten telles — «+1 andre» tar like mye plass som navnet det
  skjulte.
- **`egetSvar()` slår opp på bruker-id, ikke navn.** To personer kan hete
  det samme, og navnet er ikke identitet.
- **`loftMedSvar()` skjuler ingenting.** Kampene noen blir med på løftes,
  tidsrekka beholdes innenfor hver gruppe, og at rekkefølgen er endret sies
  med en linje over lista.

### `visning-data.js` — hvem viser kampen

[ADR 0018](adr/0018-visninger-i-supabase.md).

- **`samme()` treffer bare nøkkelen.** Radene i basen skrives alltid med
  nøkkel; tall-id-en fra den gamle datafila i repoet er borte med fila.
- **`slaSammen()` lager radene for de avkryssede kampene, og ikke mer.**
  Det som alt står i basen rører den ikke: tjenesten skriver bare
  forskjellen (`visningsDiff`), så en kamp lenger nede står som før.
- **`visningsDiff()` er grunnen til at vi ikke skriver alt på nytt.** Vi
  slettet og skrev hele valget før; da fikk rader ingen hadde endret nytt
  `satt` og ny `satt_av`, så feltet som skal si **når** noen satte kampen,
  sa «sist noen trykket lagre» — i den siste admins navn. Ingen så det, for
  `satt` vises ikke. Et felt som stille blir usant er verre enn ett som
  ropes ut.
- **`lagreKnappTekst()` teller endringen, ikke valget.** «Lagre 6 kamper»
  når du la til én er sant om det som sendes og usant om det du gjør.
- **`visningsHint()` sier hvor kampene er, ikke bare hvor mange.** «Viser 5
  kamper fra før» var sant og ubrukelig samtidig: admin så tre avkryssinger
  og sluttet at to var borte. De sto lenger ned enn skjermen rakk. Hintet
  teller også per liga, ikke på tvers — boksene under viser én.
- **`visningRad()` sender ikke `satt_av`.** Databasen setter den fra økta
  med `default auth.uid()`. Uten defaulten sto kolonnen tom i et døgn.

### `konto-data.js` og `pin-data.js` — innlogging

[ADR 0009](adr/0009-fornavn-og-pin.md). Appen logger inn med fornavn og
PIN; e-postinnloggingen står parkert på grenen `epost-innlogging`, ikke
kastet. `oktGyldig` og `oktUtloper` brukes av begge veier.

- **`KODE_MIN`/`KODE_MAKS` er et spenn, ikke et tall.** Supabase lar deg
  stille lengden på engangskoden. Hardkodet til seks kappet vi en kode på
  åtte, sendte den, og fikk 403 — som ser nøyaktig ut som feil kode.
- **`gyldigEpost` er bevisst romslig.** Presis e-postvalidering avviser
  ekte adresser. Det er koden i innboksen som avgjør om adressen finnes.
- **`kanFornyes` er skillet mellom «utlogget» og «tokenet er gammelt».**
  Før det fantes var de det samme, og man ble logget ut hver time.
- **`oktUtloper` lagrer tidspunktet, ikke sekundene.** Et tall sekunder er
  ubrukelig etter en omstart av telefonen.
- **`tolkOkt`/`tolkPinOkt` kaster framfor å gi fra seg en halv økt.** En
  økt uten token ser ut som innlogget helt til første kall feiler.
- **`pinSlug()` folder norske bokstaver før den stripper.** Uten foldingen
  blir «Bjorn» og «Bjørn» begge «bjrn» — to ulike navn, samme konto.
- **`pinPassord()` bruker `PIN_PEPPER`, og pepperet kan ikke endres.** To
  grunner: fire siffer er 10 000 forsøk som ellers kunne gjettes rett mot
  Supabase, og Supabase krever minst seks tegn. Et nytt pepper låser alle
  ute.
- **`PIN_DOMENE` er en nøkkel, ikke en postkasse.** Ingen e-post sendes
  dit, og adressen vises aldri i appen.
- **`tolkBrukere()` skiller pålogging fra bruk.** `created_at` og
  `last_sign_in_at` er første og siste **pålogging**. Appen holder
  telefonen innlogget med roterende fornyere, og en fornying oppdaterer
  ikke `last_sign_in_at`. «Sist inne» kommer derfor fra øktene
  ([ADR 0021](adr/0021-sist-inne-fra-oktene.md)), og PIN-datoen står i
  `title` på samme celle.

### `vaer-data.js` — været ved avspark

[ADR 0013](adr/0013-pubforslag-og-vaer.md).

- **`ARENAER` har tre desimaler, fordi MET ber om det.** «To avoid
  blocking». ±100 m er mer enn nok for et varsel.
- **`arenaFor()` gir `null` på ukjent navn.** Da vises ingenting, framfor
  været et annet sted. Den samme funksjonen er vakta foran `/api/puber`:
  vakta står på `arenaFor(kamp.arena)`, ikke på at navnet finnes — ellers
  blir hver utenlandske kamp ett bortkastet kall og ei linje om at noe
  sviktet.
- **`tolkVarsel()` gir `null` mer enn tre timer fra avspark.** Da er det
  ikke et varsel for kampen.
- **`foltTemp()` er JAG/TI-formelen**, den MET og yr bruker.

### `pub-forslag-data.js` — forslag fra lesere

[ADR 0019](adr/0019-pubforslag.md).

- **Et forslag er ikke en rad i lista.** Innsendinger går i `pub_forslag`,
  og et menneske gjør raden ferdig. Det finnes ingen vei fra et skjema på
  nettet og rett inn i det leseren ser.
- **`forslagRad()` sender verken `foreslatt_av` eller `status`.** Databasen
  setter den første fra økta og den andre fra sin egen default. Sender
  funksjonen dem selv, kan en feil melde et forslag som ferdig behandlet.
- **`publisteRad()` lar `lat`, `lon` og `kilde` stå tomme.** De må slås
  opp, og en rad med oppdiktede tall ville vært verre enn ingen rad.
- **`alleredeILista()` folder som lagnavnene.** «Andys Pub» og «Andy's Pub»
  er samme sted. Et forslag på noe som alt står der er ikke feil — men køen
  skal si fra. **Vakta i appen går motsatt vei for et tips:** det handler om
  et sted som alt står der.
- **`erTips()` leser `viserFotball === false`, og bare en uttrykt `false`.**
  Feltet hadde to verdier og tre betydninger — portalen viste `false` som
  «uvisst om de viser fotball», et ord dataene aldri sa. Boksen som kunne
  satt den er ute av appen, og ingen rad i basen har noen gang vært `false`.
  `forslagRad()` skriver derfor `inn.viserFotball !== false`: sto det
  `!!inn.viserFotball`, ble en glemt linje hos den som kaller et tips om at
  stedet er feil. [ADR 0023](adr/0023-tipset-som-tar-et-sted-ut.md)
- **`forslagVekt()` leser `sikkerhet` av lista, ikke av raden.** Tips om et
  sted vi gjettet på veier tyngst (0), tips om et bekreftet sted er en
  vurdering (1), et forslag står bakerst (2). Sto `sikkerhet` som et felt i
  køen, kunne det vært uenig med `puber`.
- **`sorterForslagKo()` sorterer eldst først innenfor hvert lag.** Køen er
  arbeid som ligger, ikke et varsel — et forslag som stadig skyves ned av
  nyere blir aldri behandlet. Lista den får må være den **sammenslåtte**:
  et antatt sted i en ny by ligger i basen, ikke i fila.

---

## De redaksjonelle filene

Tre filer som ligger i koden fordi de bærer en **vurdering**, ikke data.
De virker uten nettverk, og det er verdt mye der Overpass har vist seg å
være det skjøreste leddet.

### `puber.js`

Grunnfjellet. OpenStreetMap vet at et sted er en pub, men ikke om de viser
fotball.

- **Uten kilde, ingen rad.**
- **`sjekket` er det viktigste feltet.** En udatert rad råtner uten at noen
  merker det. Oslos uteliv flytter seg fort — Scotsman flyttet i 2024.
- **`sikkerhet: "usikker"` vises ikke.** Et sted vi ikke tør stå inne for er
  verre enn ett forslag færre.
- **`lat`/`lon` er anslag fra gateadressen.** Godt nok til å sortere etter
  avstand, ikke godt nok til å navigere etter. Stemmer navnet med et treff
  fra OpenStreetMap, brukes OSMs koordinat.
- **Fila skrives aldri fra nettet.** Rettelsene ligger i `puber` i Supabase
  og legges oppå med `slaSammenPuber()`.
- **Den het puber-oslo.js til 18. september 2026, og navnet var grensa.**
  Ikke i lesingen — `kuraterteNaer()` har alltid regnet avstand, uansett by
  — men i portalen: søket lette i en Oslo-boks, og vakta avviste
  koordinatet som fulgte. Radene er fortsatt nesten alle fra Oslo. Det er
  en opplysning om hvem som har gjort jobben, ikke en regel i koden.

### `puber-kontakt.js`

Kontaktopplysninger, i en **egen fil med vilje**: en redaksjonell vurdering
står seg over tid, et telefonnummer gjør ikke det. De to råtner i ulikt
tempo.

- **Ingenting vises før `verifisert` står.** Hvert felt bærer kilden og et
  ordrett sitat. Uten datoen er raden et forslag, ikke et faktum.
- **`tillit` er antall uavhengige kilder.** 1 betyr at ingen bekreftet det.
- **Felt som ikke ble funnet, står ikke der i det hele tatt.**

### `kanaler.js`

Hvilken kanal som sender ligaen. Rettighetene er en egenskap ved **ligaen**,
ikke ved kampen — fem ligaer er fem rader som endres omtrent én gang i året.
[ADR 0016](adr/0016-kanalen-som-sender.md).

- **Radene står tomme til noen har sjekket.** Ingenting er et ærlig svar;
  feil kanal er det ikke — leseren kjøper et abonnement hen ikke trenger,
  eller går glipp av kampen.
- **Et kanalnavn uten kilde og dato slår ut i testene.** `sjekkKanalliste()`
  kjøres mot den ekte fila.
- **Kommentaren øverst er antakelser, ikke data.** Et sted å begynne å lete,
  aldri svaret. `verktoy/kanalsjekk.mjs` måler gapet.

---

### `versjoner.js`

Hva som har endret seg, og hvilken sak det svarte på. Leses bare av
portalen — en leser har ingen nytte av den.

- **Nummeret er datoen**, `ÅÅÅÅ.MM.DD`. Ingen skjønn: et semantisk nummer
  krever at noen dømmer hvor stor endringen var hver gang, og et tall som
  dømmes feil er verre enn ett som bare sier når.
- **Én oppføring per dag, ikke per fletting.** Fem PR-er samme dag er fem
  linjer under én dato. `2026.09.21-2` ville latt nummeret telle
  utrullinger framfor å si når — det eneste en dato er god til.
- **Redaksjonell, ikke en logg.** Git har loggen. Her står det en
  **leser** ville merket; en opprydding uten synlig side hører hjemme i
  historikken, ellers drukner det som betyr noe.
- **Den sier ingenting om hva som faktisk kjører.** Fila vet bare hva som
  sto i den da den ble bygget. Spørsmålet «ser jeg på det nyeste?»
  besvares av `COMMIT_REF`, som portalen henter ved siden av lista — sto
  bare fila der, kunne den si 21. september over en app bygget den 12.
- **Og den er ikke hemmelig.** Portalen krever passord, men fila serveres
  som all annen JS, og repoet er offentlig. Låsen gjør den vanskelig å
  snuble over, ikke umulig å finne.

---

## Visningen

### `index.html`

- **Temaskriptet må kjøre før rendering.** Ellers blinker feil tema.
- **Ingen tredjepartsskript.** [ADR 0004](adr/0004-ingen-statistikk.md).

### `app.js`

- **Feeden hentes fra proxyen først, WordPress direkte som reserve.** Den
  gamle offentlige CORS-proxyen er fjernet med vilje: ratelimitet, uten
  SLA, og årsaken til at feeden ble stående tom.
- **Alt tekstinnhold settes med `textContent`, aldri `innerHTML`.**
- **Fremmed HTML parses i `<template>`, aldri i et `<div>`.** Gjelder både
  `sanitizeHtml()` og `stripHtml()`. Et `<div>` **laster** bildet i
  `<img src=… onerror=…>` — også i et element som aldri settes inn i
  dokumentet, og også når vi kaster alt utenom teksten rett etterpå.
- **Rensingen er en allowlist.** En ukjent tag slipper aldri gjennom fordi
  den tilfeldigvis manglet på en liste over farlige ting. Utvid lista
  framfor å lage unntak.
- **`stripHtml` dekoder ikke to ganger.** `textContent` dekoder allerede én
  gang; en gang til ville gjort `&lt;img onerror=…&gt;` til en levende tag.
- **Hash-ruting, ikke sti-ruting.** [ADR 0002](adr/0002-hash-ruting.md). En
  sti ville gitt 404 ved oppfriskning uten en ny regel i `netlify.toml`, og
  den regelen skal holdes smal.
- **`track()` er en tom operasjon.** Kallene står igjen som merkelapper på
  det som er verdt å vite, og koster ingenting så lenge ingen lytter.
- **Annonsene: `merke` sier hva plassen *er*, `format` hvilken *fasong* den
  har.** [ADR 0005](adr/0005-egen-annonseplass.md). De to var ett felt til
  16. september 2026, og da kunne ikke en ledig plass ha bannerets fasong.
  Oppslaget går på `merke` i `EGNE_MERKER`, ikke på `format`. **En rad uten
  `merke` er en ekte annonsør, og det finnes ingen ennå.** Merkingen når
  også skjermlesere, ikke bare øyet.
- **«Spøk» er ikke pedanteri.** Ullevålseter er et ekte sted som ikke har
  kjøpt noe. En tulleannonse merket «Reklame» ville påstått det motsatte.
  **Ingen rad bruker merket nå** — de sju vitsene gikk ut 21. september
  2026 fordi de sto først, og den første plassen skal selge plassen. Selve
  merket står: `run.mjs` holder at feeden ikke har en spøk, `unit.mjs` at
  apparatet for å lage en fortsatt finnes. To vakter, fordi bare den ene
  ville latt merket ryke som død kode i stillhet.
- **Bildene i annonsene har bredde og høyde på taggen.** Uten dem vokser
  annonsen og dytter saken man leser nedover. `alt` står på annonsen, ikke
  i koden: en skjermleser som sier «Prem» om et treskilt er verre enn
  ingenting.
- **En knapp uten mål blir ren tekst.** Mangler Messenger-brukernavnet, er
  en død knapp verre enn en setning.
- **Feeden bygges om i sin helhet, aldri lappes på.** Da forblir
  annonseplasseringen én regel og ikke to kodeveier.
- **Bakgrunnsoppdateringen skal aldri kunne fryse feeden.** Klarer vi ikke
  å sjekke, sier vi at noe kan være nytt og henter alt som før.
- **Ny liste, ny rulleposisjon — men ikke ved paginering.** Da er lista den
  samme, bare lengre.
- **Filtrerer noe feeden, står det som en knapp med kryss i toppfeltet.** I
  fotball er den ren tekst: ligaen er ikke et filter man fjerner, den
  byttes.
- **Svarnavnet hører til kontoen, ikke til telefonen.** Uten `svarnavnFor`
  ble navnet stående etter en utlogging, og neste som logget inn i samme
  nettleser skrev raden sin med forrige persons navn.
- **`aria-current`, ikke `aria-pressed`, på segmenter.** Et segment velger
  én av flere, det veksler ikke. Stjerna ved lagnavnet er motsatt:
  `aria-pressed`, fordi den er en av/på-bryter per lag.
- **Terskelen for å krympe toppfeltet har en dødsone.** Uten den blinker
  feltet fram og tilbake, siden krympingen selv flytter innholdet.
- **Ett sted for alle søk, ett sted for all deling.** Et lagnavn fra
  tabellen oppfører seg nøyaktig som et søk skrevet i feltet, og delingen
  svarer «delt», «kopiert», «avbrutt» eller «feil» så den som kaller kan si
  noe riktig.

### `fotball.js`

[ADR 0012](adr/0012-kampkortet.md).

- **Modulen eier ikke ruting, lagring eller innlogging.** Trykk går tilbake
  til `app.js` gjennom `naviger()`, som setter adressen — da virker
  tilbakeknappen likt her som ellers. Favorittlag, dine puber, svarnavn og
  økt eies også av `app.js`.
- **`KJENTE` er ingen `const`.** Rettelsene fra portalen kommer over nettet
  og lander etter at visningen står ferdig. Alt som tegnes av dem må kunne
  tegnes på nytt — `tegnKjenteIgjen()`, som regner om **alle fire** kildene
  som leser `KJENTE`: `bekreftede` (detaljene om stedet slås opp der),
  `kjenteVedArena`, `kjenteNaer` og `stampuber`. Derfor holder boksen på
  `boks.kamp`: tre av de fire regnes ut av kampen.
  Stampubene regnes bare om når vi *ikke* vet hvor du er — kommer en
  posisjon, er de ryddet bort med vilje, og en ny tegning skal ikke vekke
  dem.
- **Rettelsene hentes ved oppstart *og* hver gang appen kommer fram
  igjen.** De ble hentet én gang, i `initFotball()`, og det var runden
  admin → app som falt utenfor — nettopp den runden en rettelse gjøres i.
  En pub lagret i portalen fantes ikke i appen før en ny sidelasting.
  `PUBLISTE_FERSK` er 120 000 ms, samme vindu som `LEVETID_PUBLISTE`:
  kanten svarer med det samme der uansett, så et kall til er ett kall uten
  et nytt svar.
- **Et forsøk som ikke kom fram teller ikke som ferskt.** Da prøves det på
  nytt neste gang du kommer tilbake. En egen sperre hindrer to samtidige
  kall, og hvert nytt forsøk krever at et menneske har byttet fane — det
  er ingen løkke å løpe løpsk i.
- **En tom liste er et svar, ikke et ikke-svar.** Vakta sto på
  `!json.puber.length`, som var likegyldig da lista ble hentet én gang.
  Tas den siste rettelsen bort, skal appen falle tilbake til fila. `klar`
  skiller «ingen rettelser» fra «tjenesten kunne ikke svare».
- **Det som kommer over nettet, lander etter at visningen står ferdig.**
  Alt som tegnes av data fra `/api/svar` må tegnes på nytt i `tegnSvar()`:
  kampraden, den åpne kampen og linjene under. **Tre feil i dette
  prosjektet har vært den samme.**
- **Rettelseslista er stille når den feiler, og det er riktig her.** Fila
  står der uansett. Den som *skriver* en rettelse, får beskjed — det er der
  man venter et svar. Motsatt der lista *er* hele visningen: da må det sies.
- **En knapp i en knapp finnes ikke.** Kamplinja løser trykkflata med en
  utstrakt knapp (`.kamp-del`) framfor å være en selv; stedsraden har en
  knapp inni seg og er derfor ingen knapp.
- **Bekreftede visninger bærer avstand, og de fjerne dempes.**
  `sisteKjentePosisjon` er posisjonen radene tegnes med — `boks.sistePosisjon`
  er per kort, og kortene åpnes etter at radene står. Den settes fra
  `?posisjon=` ved oppstart (koster ingenting, spør ingen) og ellers fra
  `settPosisjon()` første gang et kort får en; da tegnes radene om.
  Spurt blir den i `hentNaerDeg()`, som `fyllForslag()` kaller på trykket
  som **åpner kortet**. Til 20. september 2026 hang `fyllForslag` på
  «Andre fotballpuber», og ble derfor aldri nådd av den som bare lurte på
  hvem som viser kampen.
  Uten kjent avstand står **byen** ved navnet i `stedRad()`: kortet tegnes
  i det posisjonen spørres om, så de første radene står der før svaret
  finnes.
- **`viserlinje()` er borte (21. september 2026).** «Denne kampen vises
  på: …» sto under hver kamprad og skulle svare uten at du åpnet noe. Meldt
  med skjermbilde: fem rader på rad sa «Andy's Pub (Oslo)». Et svar som er
  likt på hver rad svarer ikke. Opplysningen lever i kortet, med avstand og
  by; kampraden bærer bare det som skiller radene.
  Med linja gikk også det ene stedet i `tegnSvar()` som ikke handlet om
  svar — regelen om å tegne om det som lander over nettet står.
- **Kortet har to lister, og `naerNok()` er skillet.** `tegnSteder()`
  tegner stedene nær deg: `stedKilder()` slått sammen med de nære
  forslagene (`slaSammenRader`), merket med `merkKuraterte` i ett kall, og
  sortert av `sorterForslag()`. `tegnForslag()` tegner resten — de fjerne
  — og leser hele `KJENTE`, ikke bare det kildene fant: står du i
  Trondheim svarer ingen geografisk kilde på Oslo.
  **Én vei, ikke to:** `tegnSteder` kaller `tegnForslag`, aldri motsatt.
  `tegnKortet()` er inngangen for alt som lander data, så en kilde som
  kommer sent tegner begge listene.
  Noten er **én** for hele kortet (`panel.note`), og teller radene i
  begge. Taket er `NAER_MAKS` vanlige rader; ditt eget sted og stedene
  noen andre skal til kommer i tillegg.
- **`ligapuberAv()` slipper ikke et antatt sted gjennom.** Kilden ligger
  rett etter `bekreftede`, så en `usikker`-rad med et gyldig ligaflagg
  ville blitt løftet over alt geografisk. Vakta ligger her og ikke i
  merkekjeden: rekkefølgen på tegnene skjuler bare tegnet.
  [ADR 0022](adr/0022-antatte-steder.md)
- **`merkAntatte()` merker framfor å skjule.** `kjenteAv()` filtrerte
  bort `usikker`, og et usikkert sted var da ikke til å skille fra et som
  ikke finnes. Nå setter den `antatt: true`, og `stedRad()` gir raden sitt
  eget merke og ordene «Antatt — ikke bekreftet» — før `viserFotball`-grena,
  ellers hadde ⚽ vunnet. [ADR 0022](adr/0022-antatte-steder.md)
- **`panel.siFra()` er veien tilbake, og `stedRad()` tegner den bare på et
  antatt sted.** Et sted noen har stått i døra på skal ikke kunne rettes bort
  av et trykk fra en som gikk forbi. Utlogget tier knappen, som
  `tilbyForslag()` — databasen setter `foreslatt_av` fra økta.
- **`sendInnSted()` har to modus, og `settModus()` setter ordene og det som
  sendes fra samme tilstand.** `apneMed()` er et forslag, `tipsOm()` et tips;
  sto ordene for seg, kunne skjemaet sagt «send inn et sted» om en melding
  som tar et sted ut. Avkryssingsboksen «De viser fotball» er borte — se
  `erTips()` i `pub-forslag-data.js`.
  [ADR 0023](adr/0023-tipset-som-tar-et-sted-ut.md)
- **`merkKuraterte()` fyller koordinatet når raden mangler det.** Den
  merket bare `viserFotball` og `lag` før, og en rad fra «dine puber» —
  som bærer bare et navn — kom derfor inn uten lat og lon. Bare det som
  mangler fylles: et karttreff beholder sitt eget punkt.
- **`sendInnSted()` tar ingen felt lenger, men `hentPosisjon()`.**
  Knappen `.sted-pavei` leser posisjonen inn i merknadsfeltet. Feltet er
  synlig med vilje, og skjemaet sender `merknad` — som API-et alt tok
  imot, så ingenting i basen måtte endres.
  `naerNok()` svarer **ja når vi ikke vet** — uten posisjon, eller uten
  koordinater på stedet — så ingenting gjemmes i blinde. `NAER_M` er 50 km,
  ikke `NAER_RADIUS`: det siste er gangavstand, og en pub tvers over byen er
  fortsatt et godt svar. Her er en sirkel riktig, til forskjell fra
  `kjenteNaer`: 30 km er den bredeste byen, 160 km det nærmeste bypar, og
  femti ligger rent imellom.
- **Søket ligger på feltet som alt finnes.** `kamp-pub` het «Et annet
  sted?» og var der du skrev et sted vi ikke kjente; nå søker det også i
  lista mens du skriver. To tekstfelt ved siden av hverandre ville krevd at
  du gjettet hvilket som gjorde hva. Søket **erstatter** forslagslista mens
  det er aktivt, og et valg **avslutter** det — satte vi søket til navnet,
  tømte lista seg for hvert treff som kom fra kartet framfor fra vår egen
  liste. `falskmerke()` er skilt ut av `notetekst()` fordi søket har sin
  egen linje og merket gjelder like mye der: avstandene måles fra den
  falske posisjonen.
- **Et trykk på et sted er svaret.** Før var det tre steg og et navnefelt
  på hver kamp. Navnet kommer nå fra innloggingen — et felt man måtte fylle
  ville betydd at «ett trykk» ikke var sant.
- **Har du valgt, minimeres de andre — men ikke der noen skal.** `framme`
  er ditt sted pluss alt med `harFolk`; resten går bak `.sted-mer`.
  Åpen/lukket ligger på `panel.visAlleSteder`, fordi `tegnSteder` kjører på
  hvert svar. `.sted-resten` setter `display: flex` og må derfor si hva
  `[hidden]` betyr.
- **`panel.tilbyForslag()` spør om å sende inn et ukjent sted, etter
  svaret.** Den er stille for stadion, for den utloggede, og for et sted
  `alleredeILista()` kjenner. `sendInnSted()`-boksen eksponerer
  `apneMed(navn)` så tilbudet kan åpne og forhåndsfylle skjemaet som alt
  ligger der — det er én vei inn, ikke et nytt skjema.
- **Knappen heter «Del», ikke «Del i chatten».** Appen har ingen chat, og
  hvor teksten havner er leserens valg i delingsmenyen.
- **«Hjemme» er borte.** Kortet handler om hvor man møter noen, og sofaen
  er ikke et møtested.
- **Et sted fra en lenke blir *pekt ut*, ikke valgt.** Chipen markeres og
  får fokus, så svaret fortsatt koster ett trykk — leserens eget.
- **Skrivingen bytter ut hele kampens rader, ikke bare din.** Tjenesten
  leser tilbake alle radene for å bevise at din landet. Byttet vi bare ut
  din, sto vennene dobbelt til neste henting ryddet opp. Er svaret tomt,
  beholdes det vi hadde: 502 betyr «raden finnes ikke», og en tom liste er
  ikke et bevis.
- **Én linje om at noe mangler, aldri flere.** Venter en kilde fortsatt, er
  det for tidlig å si at ingenting finnes. Tre «fant ingen»-linjer, én per
  kilde, gjorde panelet uleselig.
- **Feilmeldinger bærer tjenestens egne ord**, og klienten viser dem.
  «(overpass-api.de svarte 406)» er nok til å se hva som feiler uten å åpne
  funksjonsloggen. En `forsok` klienten kaster er like god som ingen.
- **«Nær deg» går aldri innom oss.** Spørringen går rett fra nettleseren til
  Overpass, med posisjonen rundet.
- **`naerDegFra()` er én kropp for ekte og falsk posisjon.** Lå oppslaget
  inne i tilbakekallet fra geolocation, måtte en falsk posisjon ha kopiert
  hele kroppen — og to kopier glir fra hverandre.
- **Stampubene ryddes bort når en posisjon lander.** Fila er en Oslo-liste;
  en stampub uten avstand i Bodø er et dårligere svar enn kartet.
- **Lagmerket lastes fra kilden, som fontene.** `referrerpolicy` holder
  adressen vår for oss selv, målene står på taggen så raden ikke hopper, og
  svikter adressen fjernes bildet — et knust ikon sier ingenting om ligaen.
- **Sesongen står over innholdet, ikke under.** Er tabellen fra en annen
  sesong, må det stå før man leser tallene.

### `admin.html` / `admin.js`

[ADR 0018](adr/0018-visninger-i-supabase.md),
[ADR 0020](adr/0020-stedene-i-portalen.md).

- **Seksjonene er sammenleggbare, og mekanikken er appens.**
  `settApen()` skriver `aria-expanded` på knappen og `[hidden]` på panelet
  den peker på med `aria-controls` — samme mønster som `fotball.js`, ikke
  `<details>`. `kroppen()`, `erApen()`, `settApen()`, `apneHvisUrort()` og
  `settTall()` dekker **både** seksjonene og de to trinnene i
  stedsskjemaet: ett sett, fordi to ville glidd fra hverandre.
  Tilstanden bor på knappen, så tegnerne kan røre innholdet i panelet uten
  å rive det opp.
- **`apneHvisUrort()` er køens egen dør.** Den åpner en seksjon som admin
  ikke har trykket på. `rort` settes av klikket, og fra da av er det admin
  som styrer — `tegnForslag` kjøres på nytt hver gang rettelsene lander,
  og en seksjon som åpner seg selv igjen midt i noe du leser er den samme
  feilen `tegnSteder` i appen har kostet oss.
- **`settTall()` skriver tallet i hodet.** `venter` er det som ligger og
  venter på deg — nye rader i køen, en avkryssing du ikke har lagret — og
  står i aksentfargen. Tallet må si det samme som innholdet: `tegnSteder`
  skriver «1 av 27» når bystedfilteret er på, fordi «26» over en liste med
  én rad leses som at de andre er borte. Et feilet kall tømmer tallet:
  et tall som blir stående påstår en liste vi ikke har.
- **`apneSted()` åpner seksjonen skjemaet ligger i.** Køen står i en annen
  seksjon og sender deg hit med «Ta stedet ut» og «Åpne i editoren». Er
  Steder lukket, åpnes stedet et sted ingen ser det, og `scrollIntoView`
  ruller til et skjult element.
- **Skjemaet har to trinn, og `oppdaterTrinn()` teller hva som mangler i
  hvert.** Tellinga leser `[aria-required]` — satt av `merkPakrevde()` ut
  av `PUBLISTE_FELT` — så tallet og stjernene ikke kan si hver sin ting.
  Et nytt sted åpner trinn 1 alene; et sted som finnes åpner begge.
  `stedSkjema.dataset.provd` skiller «ikke fylt ut ennå» fra «prøvde å
  lagre og manglet»: rødt hører til det siste. En feilet `lagreSted()`
  åpner **begge** trinn — å regne ut hvilket den første feilen hører til
  ville vært enda en liste som kan gli fra `PUBLISTE_FELT`.
- **`oppdaterLagreknapp()` skriver også kamphodet.** Samme tall som
  knappen: hva trykket kommer til å gjøre. Lukker du seksjonen med en
  ulagret avkryssing, er hodet det eneste som står igjen.
- **Adgang skjules etter innlogging.** `loggInn()` setter
  `adgang.hidden`; «Logg ut» ligger i `.topp` ved siden av `<h1>`.
- **To låser, og den som holder er databasens.** `ADMIN_PASSORD` er døren
  til skjemaet. Selve skrivingen går med din egen økt fra appen, og RLS
  slår opp uid-en i `visning_skrivere`. Passordet vårt betyr ingenting for
  Supabase — derfor må du være logget inn i appen for å lagre.
- **Passordet ligger i en variabel, ikke i `sessionStorage`.** En
  oppfriskning er billigere enn et passord som blir liggende.
- **Portalen er skjult til tjenesten har godtatt passordet.** Det er ikke
  sikkerheten — den ligger i funksjonen og i basen — men det er ordenen, og
  det sparer et kall mot API-Football per åpning.
- **Knappen sier hva trykket gjør.** `lagreKnappTekst()`.
- **Stedslista filtreres på by.** `byenTil()` leser byen ut av koordinatet
  med `byFor()`; `fyllStedFilter()` bygger velgeren av de byene som har
  rader, med tall, og skjuler hele raden når det finnes færre enn to
  grupper. Rader uten koordinat samles under `UTEN_BY` — et sted som er
  tatt ut kan mangle dem, og det skal fortsatt kunne åpnes. Er den valgte
  byen borte etter en redigering, faller filteret tilbake til alle framfor
  å vise en tom liste uten en vei ut.
- **Feltene som må fylles ut er merket, og merkingen kommer fra
  `PUBLISTE_FELT`.** `merkPakrevde()` går gjennom den lista og setter
  stjerne pluss `aria-required`; `PAKREVD_ID` er bare navn → felt-id. Et
  navn uten id blir stående i `stedSkjema.dataset.umerket`, som en vakt i
  `run.mjs` krever er tom. Merkingen er sann begge veier: adresse, lag og
  merknad er valgfrie og står umerket. Tas stedet ut av lista, holder
  navnet, og `oppdaterPakrevdTekst()` sier det — den kalles både på
  `change` og fra `apneSted()`, fordi `fyllSted` setter haken uten å
  utløse noen hendelse.
- **Koordinatfeltet heter «koordinat eller kartlenke».** Den som sitter med
  tallene skal se at feltet er til dem.
- **Rettelsene skrives som hele rader.** `slaSammenPuber()` slår sammen
  fila og basen; et sted som har lagt ned tas ut med `fjernet`.
- **En lagring merker raden den svarer på.** `merkForslagBehandlet()`
  slår opp køen på navnet foldet, **og på sorten**: tas stedet ut, er det
  tipset som er besvart; blir det stående, er det forslaget. Merket vi
  begge, ville en redigering stilt tipset som om noen hadde vurdert det.
  [ADR 0023](adr/0023-tipset-som-tar-et-sted-ut.md) Før var lagring og merking to handlinger
  for én avgjørelse, og den naturlige er den første — så forslaget ble
  stående i køen etter at stedet var lagt inn. Merkingen henger på
  lagringen og aldri motsatt: [ADR 0019](adr/0019-pubforslag.md) krever at
  et menneske gjør raden ferdig, og det er nettopp det som skjedde —
  koordinater, kilde og dato fylt ut for hånd. «Lagt inn»-knappen står
  igjen for radene som limes rett inn i fila. Bare `ny` merkes: et avvist
  forslag skal ikke vekkes av at noen redigerer stedet et halvt år senere.
- **Byvelgeren styrer søket, ikke raden.** Den følger koordinatet når det
  endrer seg.
- **Køen tegnes om når rettelsene lander.** `tegnForslagIgjen()` kalles fra
  `hentSteder()`: køen tegnes før det kallet er ferdig, og både vekta og
  «står allerede i lista» leses av den sammenslåtte lista. Uten dette sto
  tipset om et antatt sted i en ny by midt i køen som om stedet var
  bekreftet. Samme lekse som `tegnSvar()` i appen.
- **«Ta stedet ut» lagrer ikke.** Den åpner stedet med haken satt, og et
  menneske trykker lagre. Et tips fra en forbipasserende er ikke et unntak
  fra [ADR 0019](adr/0019-pubforslag.md) — det er grunnen til at den finnes.
- **Og kamplista tegnes om sammen med den.** `tegnKamperIgjen()` kalles
  fra samme sted. Ligaflagget bor bare i basen — `puber.js` har ingen
  `ligaer` — så pubraden `tegnKamper` leste før svaret bærer ingen påstand
  å si imot, og «Ikke denne kvelden» uteblir. Men den står over en
  avkryssing som ikke er lagret: `tegnKamper` bygger lista på nytt fra
  `visninger`, og hakene ville ryket.
- **`stedKall()` krever økta bare av de kallene som skriver.**
  `STED_LESER` er de tre som ikke gjør det — `liste`, `sok`,
  `sok-adresse` — og tjenesten krever ingen token for dem. Sto kravet på
  hele funksjonen, mistet en admin med utløpt økt hele rettelseslaget:
  pubvelgeren sto igjen med de 26 stedene i fila, og ingen av dem bærer et
  ligaflagg. Portalen fornyer ikke økta selv, så den tilstanden er den
  vanlige, ikke den sjeldne.

### `personvern.html`

Hva vi lagrer, hvor, hvor lenge, og hvordan du blir kvitt det. En egen
side, ikke et avsnitt i menyen.

- **Den beskriver det som faktisk skjer, ikke det som er lov.** Lagringen
  står felt for felt: hva som ligger i telefonen, hva som ligger hos
  Supabase, og hva den som drifter appen kan se.
- **Endrer lagringen seg, endres sida i samme commit.** En
  personvernerklæring som ligger etter koden er en påstand som er blitt
  usann uten at noen sa det. Det er derfor «sist inne»
  ([ADR 0021](adr/0021-sist-inne-fra-oktene.md)) ble vurdert mot denne
  sida før den ble bygget: en økt-tabell Supabase fører uansett er ikke en
  ny opplysning om noen, og da hadde sida allerede rett.
- **Navnet er synlig for andre, og det står der.** Fornavnet i «blir
  med»-lista er det andre lesere ser.

### `app.css`

- **Farger er CSS-variabler i `:root`; et tema overstyrer kun variabler.**
  Tekst oppå bildegradienten bruker `--on-overlay`.
- **`--fs` skalerer tekst. Avstander og rammer skaleres ikke.**
- **Felt er minst 16 px.** Safari på iPhone zoomer inn av seg selv når du
  fokuserer et felt med mindre skrift, og etter zoomen er sida pannbar
  sidelengs. Meldt to ganger som «jeg kan scrolle skjermen til venstre og
  høyre»; begge ganger lette jeg etter noe som var for bredt. Det var
  forstørrelsen, ikke bredden. To vakter i `run.mjs` måler `font-size` på
  hvert `input`, `select` og `textarea`.
- **Hver regel som setter `display`, må si hva `[hidden]` betyr.**
  `display: flex` slår `[hidden]` fra nettleserens eget stilark, og da står
  et element framme som koden tror den har skjult.

### `sw.js`

- **Nett først, cache som reserve.** Skallet caches, aldri `/api/`: feeden
  har sin egen ferskhetslogikk, og en cache oppå ville gitt to sannheter om
  hva som er nyeste sak.
- **Hver modul appen importerer må stå i `SKALL`.** Mangler én, feiler hele
  `app.js` uten nett — ikke bare den ene visningen.
- **Cache-navnet bumpes ved endring.** `sb-skall-vN`.

---

## Tjenestene

Felles for alle: **nøkler forlater aldri funksjonen**, feilsvar caches
aldri (`no-store`), og miljøet leses **ved utrulling** — en ny variabel
krever en ny deploy, og navnene er versalfølsomme.
Se [`nokler-og-tokens.md`](nokler-og-tokens.md).

- **`fotball.mjs`** — sportsdata med Netlifys varige cache foran. Kjenner
  ingen sport: alt står i `SPORTER`. Er en funksjon og ikke en redirect
  fordi en redirect ikke kan sette en hemmelig header
  ([ADR 0006](adr/0006-sportsdata-via-funksjon.md)). Adressene defineres av
  `config` nederst, ikke av nye regler i `netlify.toml`.
- **`vaer.mjs`** — MET krever en `User-Agent` som sier hvem som spør, og den
  kan ikke settes fra nettleseren. Ingen nøkkel, men CC BY 4.0 krever
  kreditering, og den står i visningen. Én cache-nøkkel per kamp.
- **`puber.mjs`** — Overpass og Entur, én cache-nøkkel per arena med et
  døgns levetid. «Nær deg» går **ikke** herfra: leserens posisjon skal ikke
  innom oss.
- **`svar.mjs`** — leses av alle, skrives bare av den som er logget inn.
  Skrivingen går med leserens egen økt; databasen setter `bruker`.
  **En skriving som svarer 200 er ikke bevis på at raden ligger der:**
  `settSvar` leser tilbake to ganger — som deg og som hvem som helst — og
  forskjellen er diagnosen. Rir med på visningene: `/api/svar` spør alt om
  de samme kampene.
- **`visninger.mjs`** — lagret var GitHub til 15. september 2026; en commit
  per lagring, med en token som kunne skrive kode og en fletting som lot
  samtidige lagringer tape stille. Nå Supabase, med skriverens egen økt.
  **Skriver bare det som endrer seg** (`visningsDiff`), og leser hele
  omfanget tilbake som bevis.
- **`konto.mjs`** — innloggingen. Kallet går herfra så appen bare snakker
  med sitt eget domene, og `PIN_PEPPER` finnes bare her.
- **`brukere.mjs`** — **det ene stedet med en `service_role`-nøkkel**, og et
  bevisst brudd på [ADR 0010](adr/0010-ingen-service-role.md): å slette en
  annens konto eller sette en annens PIN *er* å handle på vegne av andre, og
  Supabase Auth har ingen annen vei. Nøkkelen importeres ikke og deles
  ikke. Hver handling krever `ADMIN_PASSORD`, sammenliknet i konstant tid.
  **Og siden #140: en ekte Supabase-økt i tillegg**, hvis uid står i
  `ADMIN_UID`. `slippInn()` spør `/auth/v1/user` med **anon**-nøkkelen som
  `apikey` og leserens eget token som `Bearer` — spørsmålet er «hvem er
  denne økta», og service_role ville svart uansett hvem som spurte.
  Sjekken ligger før dispatchen, så et avvist kall aldri når Supabase
  Auth; det gjelder alle tre handlingene, ikke bare lesingen.
  Lista ligger i miljøet og ikke i `visning_skrivere`, som er ment å vokse
  med pubene i #65; mangler `ADMIN_UID`, stenger funksjonen med 503.
  «Sist inne» kommer fra `public.sist_inne()` som et **tillegg**: svikter
  den, står kolonnen tom og resten står.
- **`pub-forslag.mjs`** — en kø, ikke lista. Skrivingen går med leserens
  egen økt; lesing av køen krever `ADMIN_PASSORD` **og** en økt i
  `visning_skrivere`.
- **`pub-liste.mjs`** — rettelsene oppå `puber.js`. **GET svarer med
  rettelsene alene, ikke med en ferdig liste:** et svar som var hele lista
  ville gjort funksjonen til det skjøreste leddet i noe som i dag ikke kan
  ryke. Oppslaget mot OpenStreetMap ligger også her, bak passordet —
  Overpass ber om fair use, og et navnesøk som hvem som helst kunne kjørt
  er et søk noen kommer til å kjøre tusen ganger. Notatene per speil eies
  av den som kaller: `AbortController` avviser alle kallene med **samme**
  feilobjekt, så et notat skrevet på feilen ville overskrevet de andre.
- **`tsdbsonde.mjs`** — hva TheSportsDB faktisk gir oss, spurt fra
  portalen. Samme spørsmål som `verktoy/tsdbsjekk.mjs`, og **samme stier**:
  begge leser `tsdbSondeStier()` i `fotball-data.js`. Sto de hver for seg,
  ville de to svart ulikt på det samme, og da er sonden verre enn ingen.
  **Nøkkelen blir på serveren.** v1 legger den i *stien*, så den samme
  spørringa gjort fra en nettleser ville lagt nøkkelen i historikken, i en
  logg og i hvert skjermbilde noen tar. Funksjonen leser den fra miljøet
  og svaret bærer den aldri.
  Bak `ADMIN_PASSORD`, som `pub-liste`. Ikke fordi svaret er hemmelig, men
  fordi hvert trykk koster seks kall mot en tjeneste som ber om fair use.
  Den finnes i tillegg til verktøyet fordi den som eier prosjektet sitter
  med en telefon: en oppgave som krever en terminal er ingen oppgave.

---

## Verktøyene

`verktoy/` kjøres for hånd, ikke av CI. De trenger nett og svarer på
spørsmål kode ikke kan svare på alene.

- **`kanalsjekk.mjs`** — henter neste runde og setter på hva `kanaler.js`
  påstår, som en liste et menneske fyller ut fra programoversikten. Er
  avviket null på en full runde, er skraperen unødvendig. En liga som
  svikter **sies**, ikke utelates stille.
- **`byersjekk.mjs`** — spør Overpass hva som finnes i en by, så en
  falsk posisjon kan sammenliknes med virkeligheten.
  **`--rader` skriver utkast til rader i `puber.js`.** Lista alene er en
  måling — finnes det puber her i det hele tatt — men uten koordinatet
  måtte hvert sted slås opp for hånd etterpå, og det er nettopp jobben
  som skal gjøres når en by skal fylles. Utkastet er **ikke** en ferdig
  rad: `lag`, `kilde` og `sikkerhet` står tomme med vilje. Overpass vet at
  stedet er en pub; den vet ikke om de viser fotball, og det er den
  vurderingen som gjør `puber.js` til kode framfor en tabell.
- **`kamper()` deler resultater i to bolker.** Siste runde framme, resten i
  en egen `ul` bak «Vis tidligere runder (N)» — hele sesongen kommer nå fra
  API-et, og hundre og åtti rader er ingen liste. Skillet går på **runden**,
  ikke på et tak, så en runde aldri deles i to. Knappen teller runder.
  **En rad uten rundetall blir stående framme:** bak knappen ville den vært
  skjult av en opplysning vi ikke har, uten overskrift og uten å telle med.
  Samme regel som `naerNok()`.
- **`tsdbsjekk.mjs`** — spør TheSportsDB hva den faktisk gir oss, med den
  nøkkelen som er satt. **Seks adresser per liga**, og de svarer på to
  ulike spørsmål: hele sesongen (v2 og v1) og det vi bruker i dag er
  *resultatlista*; toppscorere, spillerne i et lag og én spillers
  statistikk er *toppscorerlista*. Det sto «fire» til 21. september 2026
  — de to spillerkallene kom til da toppscorer-spørsmålet ble stilt, og
  tallet ble liggende igjen. Et dokument som beskriver en sonde som ikke
  finnes lenger, er verre enn ett som tier: det leses som en fasit. Utskrifta sier hvor mange rader som
  kom, **hvilke felt første rad hadde**, og hvor mange ulike runder som er
  representert — det siste avgjør om «alle runder» er mulig i det hele
  tatt. En sesong uten rundetall kan ikke grupperes.
  Det kan ingen test svare på: en stubb vet bare det vi alt trodde, og
  nettopp den fella står i [`testing.md`](testing.md). Uten nøkkel brukes
  testnøkkelen «3», og da sier utskrifta at et lite tall er en *kapping*,
  ikke en mangel.
  **Nøkkelen maskeres i adressene som skrives ut.** v1 legger den i stien,
  og en nøkkel i en terminal er en nøkkel i et skjermbilde.
  **Den kjører vår egen parser mot svaret.** Feltnavnene alene svarer ikke:
  sonden viser de tolv første, og `intHomeScore` var ikke blant dem i
  sesongsvaret 21. september 2026. «Er feltene der» er dessuten feil
  spørsmål — det riktige er om `tolkKamperTsdb()` gir kamper vi kan
  **vise**. `tsdbSondeParset()` teller kamper, spilte, med resultat og med
  runde, og skriver ut én ferdig rad: et tall kan være riktig av feil
  grunn, en rad kan leses.
  **Stiene ligger i `fotball-data.js`, ikke her.** Skriptet er et skall
  rundt `tsdbSondeStier()`, `tsdbForsteListe()`, `tsdbSondeFunn()` og
  `tsdbPlukkId()` — de samme `/api/tsdb-sonde` leser. En vakt i
  `unit.mjs` slår ut om en av dem skriver en adresse selv: det sto som en
  påstand i en PR-tekst 21. september 2026 og var usant da den ble
  skrevet, så vakta finnes fordi påstanden ikke holdt seg selv.
- **`lag-pdf.mjs`** — lager PDF av et dokument i `docs/` med Chromium og
  ingenting annet, så et sammendrag kan sendes som vedlegg. Oversetter
  bare det Markdown-en i `docs/` faktisk bruker; en pakke for resten
  ville vært prosjektets første npm-avhengighet, for et vedlegg.
  **Et skjermbilde og et diagram er ikke samme slags bilde.** `78mm` er
  bredden på en telefon, og en tegning presset ned i den er en boks med
  seks ord i, uleselig. Regelen slår på filendelsen: `.svg` i
  `docs/bilder/` er tegninger, og de får tekstbredden.
  **`--sideskift` er et valg per dokument, ikke en stil for alle.** Et
  sammendrag skal flyte; et opplæringshefte leses avsnitt for avsnitt, og
  da er luften nederst på sida en marg framfor et hull. Flagget gir ny
  side per `##`, men ikke foran den første — ellers står tittelsida alene.

---

## Regler som går på tvers

- **Ingenting skal kreve endringer på sportsbibelen.no.**
- **Ingenting er låst bak innlogging.**
  [ADR 0009](adr/0009-fornavn-og-pin.md).
- **Ingen sporing, ingen informasjonskapsler, ingen samtykkebanner.**
  [ADR 0004](adr/0004-ingen-statistikk.md). Vi **fører** ingen teller. Å
  lese et felt Supabase skriver uansett er noe annet
  ([ADR 0021](adr/0021-sist-inne-fra-oktene.md)).
- **Proxyen er smal**: kun `/posts` og `/categories`, aldri wildcard mot
  `wp/v2` — det åpner en vei inn til `/users`.
  [ADR 0003](adr/0003-smal-wordpress-proxy.md).
- **Si hva noe er.** Et annonsekort sier «Reklame», «Ledig plass» eller
  «Spøk». En knapp som ser ut som den gir noe den ikke gir, er verre enn en
  som sier hva den er.
- **Opplysninger om virkeligheten trenger kilde og dato**, og voktere
  håndhever det mot de ekte filene.
- **En stille tom liste er ikke til å skille fra «ingen svarte».**
- **Et felt som stille blir usant er verre enn ett som ropes ut.**
