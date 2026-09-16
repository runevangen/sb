# 0020 — Stedene redigeres i portalen (utvider 0019)

## Kontekst
[ADR 0019](0019-pubforslag.md) satte en kø foran lista: et forslag fra en
leser blir aldri en rad av seg selv. Den regelen står, og den er riktig.

Men den sa ingenting om hvor *admin* skulle lime. Og svaret var: i en
koderedigerer. Portalen ga deg raden ferdig formet, og så måtte du åpne
`puber-oslo.js`, finne riktig sted i fila, lime, slå opp koordinatene,
finne en kilde, committe og vente på en utrulling. Meldingen i portalen sa
det rett ut: «Husk å lime raden inn i puber-oslo.js — den havner ikke der
av seg selv.»

Det er seks steg og en kontekstbytte for å legge til én pub. I praksis
betyr det at det ikke blir gjort.

Samme form som #79: lagringen av «hvem viser kampen» lå i repoet, og
flyttet til Supabase da det ble tydelig at en commit er feil sted for data
som endrer seg. Forskjellen her er at fila også har en jobb å gjøre.

## Beslutning
Fila er **grunnfjellet**. Supabase-tabellen `puber` bærer **rettelsene
oppå**. Appen slår dem sammen selv, med `slaSammenPuber()`.

Editoren ligger i adminportalen, under Steder. Den skriver aldri i
`puber-oslo.js`.

## Konsekvens

### Hvorfor fila blir liggende
Den kunne vært tømt og flyttet i sin helhet. Den ble ikke det, av én grunn:
lista er appens beste kort når alt annet er nede. «Kjent for å vise
fotball» står også når Overpass er nede, fordi vurderingen ligger i koden —
og det er den egenskapen som er verdt mest ved lista.

Flyttet vi alt til Supabase, ville et blaff hos dem tatt stedene med seg.
`/api/pub-liste` er derfor et tillegg som kan ryke uten at noe forsvinner:
svarer den ikke, står fila alene, og appen sier ingenting. Det er riktig
her — lista er ikke hele visningen, og en feilmelding over stedene ville
sagt at noe mangler i det vanlige tilfellet der ingenting gjør det.

### Hele rader, ikke felt for felt
En rettelse erstatter **hele** raden fra fila. Halve rader fra to kilder er
ikke til å lese tilbake: sto adressen i fila og koordinatet i basen, ville
ingen visst hvilken av dem som var sjekket sist — og `sjekket`-datoen er
det viktigste feltet i lista.

### `fjernet` framfor sletting
Et sted som har lagt ned kan ikke fjernes ved å la være å skrive: raden
står jo i fila. Derfor bærer tabellen et `fjernet`-flagg som tar raden ut
av sammenslåingen. Fila røres ikke, og det går an å angre.

### Nøkkelen er navnet foldet
`pubNokkel()` er `normaliserLagnavn()`: «Andy's Pub» og «Andys Pub» er ett
sted. Samme grep som [kampnøkkelen](0008-kampnokkel.md) — det som slås opp
går på nøkkelen, aldri på det som ble skrevet inn. Uten det ville en
rettelse blitt en ny rad ved siden av den gamle.

Endrer du navnet på en rad som finnes, sier portalen fra framfor å lage en
ny rad. Navnet er nøkkelen, og det skal sies før det skjer.

### Kilde og dato slipper fortsatt ingen rad gjennom
`sjekkPubRad()` er `sjekkPubliste()` for én rad, og den kjøres av både
portalen og tjenesten — fra den samme fila, så de to ikke kan bli uenige.
`check`-en i `docs/oppsett.sql` er den som holder når noen skriver rett mot
basen.

**Men kilden er ikke en URL lenger.** Den var det til editoren hadde vært
i bruk en dag, og da viste det seg at kravet stengte ute nettopp de
stedene lista er til for: den lille puben i Torggata med storskjerm og
ingen nettside.

Regelen har alltid sagt «kilde og dato», ikke «lenke og dato». URL-en var
en tilnærming, og en dårlig en — en nettside fra 2019 ser ut som en kilde
uten å være det, mens «Var innom 16.09.2026, storskjerm i baren» er en
kilde uten å se ut som en.

Feltet vises aldri for leseren. Det er et revisjonsfelt for den som skal
sjekke raden om et år, og da trenger det ikke være klikkbart — det trenger
å svare på *hvordan vet vi det*.

`kildeHolder()` godtar en lenke, eller minst tre ord og tolv tegn. Formen
kan ikke skille en god kilde fra en dårlig; den kan skille et svar fra et
ikke-svar. «ok» faller, «så en venn» faller, en setning står.

Én regel for fila og for basen. To lister som er uenige om hva en gyldig
rad er, er akkurat det sammenslåingen skal slippe — og en rad skal kunne
flyttes fra basen og inn i fila uten å sjekkes på nytt. `check`-en i SQL-en
er med vilje litt løsere (den teller mellomrom, ikke ord): et bakstegg som
er strengere enn appen, avviser rader appen nettopp godtok, og da får den
som lagret en feilmelding som ikke stemmer.

En **fjernet** rad slipper med navnet alene. Det eneste den sier er at
stedet ikke skal vises, og da er det ingen opplysning om virkeligheten å
sette en kilde bak.

### Koordinatene slås opp, ikke gjettes
Kommentaren i `puber-oslo.js` har alltid sagt at OSMs koordinat brukes når
navnet stemmer. Editoren gjør nettopp det, med et navnesøk mot Overpass —
maskinen gjør oppslaget, mennesket velger treffet. Søket ligger bak
`ADMIN_PASSORD`: Overpass ber om fair use, og et søk hvem som helst kunne
kjørt er et søk noen kjører tusen ganger.

Treffet fyller koordinat, adresse og eventuelt nettsted. **Navnet røres
ikke** — det er nøkkelen, og OSM skriver ikke alltid det vi skriver.

### Skrivingen går med din egen økt
Ingen `service_role`-nøkkel ([ADR 0010](0010-ingen-service-role.md)), og
ingen ny hemmelighet. `ADMIN_PASSORD` er døren til skjemaet; RLS slår opp
uid-en i `visning_skrivere`. To låser, og den som holder er databasens —
samme oppsett som [ADR 0018](0018-visninger-i-supabase.md).

`endret` og `endret_av` settes av en trigger, ikke av en default. En
default gjelder bare ved insert, og en upsert treffer update-grenen hver
gang en rad rettes. Det var nøyaktig feilen i `satt_av`: «funksjonen sender
den aldri selv» er bare halve regelen.

### ADR 0019 står
Det finnes fortsatt ingen vei fra et skjema på nettet og rett inn i det
leseren ser. Køen er køen, og «Åpne i editoren» fyller navn og adresse i et
skjema et menneske må gjøre ferdig — med koordinat, kilde og dato. Det som
endret seg er hvor limingen skjer, ikke hvem som limer.

### Det som kommer over nettet, lander etter at visningen står ferdig
Stedene er tredje datakilde i dette prosjektet som gjør det, og de to
første kostet hver sin feil. `KJENTE` i `fotball.js` er derfor ikke en
`const` lenger, og et kort som alt står åpent tegnes om i
`tegnKjenteIgjen()` når rettelsene lander.

### Cachen er kort
120 sekunder i kanten. En rettelse skal være ute mens admin fortsatt sitter
med portalen åpen; et døgn — som pubene rundt arenaen har — ville gjort
«lagret» til en påstand admin ikke kunne etterprøve.
