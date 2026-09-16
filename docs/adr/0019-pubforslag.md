# 0019 — Lesere kan foreslå steder, men ikke legge dem inn

## Kontekst
`puber-oslo.js` vokser bare når noen redigerer en fil og pusher. Leseren
som står på en pub som viser kampen, og som ikke finnes i lista, har ingen
vei til å si fra — annet enn å skrive navnet i feltet i kampkortet, der det
blir stående for hen alene (#80).

Lista er samtidig appens beste kort når Overpass er nede: «Kjent for å vise
fotball» står også da, fordi vurderingen ligger i koden.

> **Utvidet av [ADR 0020](0020-stedene-i-portalen.md), 16. september 2026.**
> Regelen under står: et forslag fra en leser blir aldri en rad av seg
> selv. Det som endret seg er hvor admin limer — i portalen framfor i en
> koderedigerer, og oppå fila framfor inni den.

## Beslutning
Et forslag går i en **kø**, ikke i lista. Tabellen `pub_forslag` i Supabase
tar imot; adminportalen viser køen og gir raden ferdig formet. **Ingenting
skriver til `puber-oslo.js`.** Et menneske limer raden inn, slår opp
koordinatene og setter kilden.

## Konsekvens

### Køen er en kanal, ikke en skriver
Det er hele poenget. Hver rad i lista har `kilde` og `sjekket`, og
`sjekkPubliste()` vokter det. En rad som kom inn uten at noen så på den,
ville brutt nettopp den regelen — og da er lista ikke lenger verdt å stole
på når alt annet er nede.

`publisteRad()` former teksten. `lat`, `lon` og `kilde` står **tomme** med
vilje: de må slås opp, og oppdiktede tall ville vært verre enn ingen rad —
de ser riktige ut og sorterer feil.

### Tre valg som ble tatt, og hva de kostet
- **Kø framfor rett i lista.** Prisen er at du må godkjenne hver rad.
- **Bare navn og adresse.** Leseren sender **ikke** posisjonen sin. Da står
  `personvern.html` urørt, og påstanden om at posisjonen går rett fra
  nettleseren til OpenStreetMap og aldri innom oss er fortsatt sann.
  Koordinatene slås opp ved godkjenning, som i dag: anslag fra
  gateadressen, gode nok til å sortere etter avstand.
- **Innlogging kreves.** Et lite hinder, men det gir et navn på raden —
  og uten navn er en åpen skrivevei en vei inn for søppel.

### Skrivingen går med leserens egen økt
Som i `visninger` og `kampsvar`. Ingen `service_role`-nøkkel her, med
vilje: da kan heller ikke en feil i denne fila sende inn i en annens navn.
Databasen setter `foreslatt_av` med `default auth.uid()` — og defaulten er
halvparten av regelen, slik `satt_av` viste da den sto tom i et døgn.

Køen leses med `ADMIN_PASSORD` **og** en økt som står i
`visning_skrivere`. Passordet er vårt; Supabase vet ikke hva det er.

### Leseren skal slippe unødvendig arbeid
Står stedet allerede i lista — under et navn som skrives litt annerledes —
sier appen det uten å sende noe. `alleredeILista()` folder navnet med
`normaliserLagnavn`, samme mekanisme som lagnavnene, så «Andys Pub» og
«Andy's Pub» er ett sted.

### Skjemaet ligger nederst, ikke framme
Bak lenka til stedene, under feltet der man alt har skrevet et navn selv.
Det er der man oppdager at stedet mangler. De fleste kamper trenger det
ikke, og kortet var allerede fullt.

### Hva som ble vurdert og valgt bort
- **Flytte hele `puber-oslo.js` til Supabase.** Da forsvinner det som gjør
  lista verdt noe: vurderingen i koden, som står når nettet ikke gjør det.
- **Overpass-oppslag på navnet.** Ville gitt koordinater gratis, men
  Overpass har vært det skjøreste leddet i hele appen — og da står
  innsendingen stille når den er nede.
- **Åpent for alle.** Lavest terskel, men ingen navn på noe, og søppel må
  ryddes for hånd.

### Testen som måtte skrives om
Første nettlesertest slettet økten fra `localStorage` midt i kjøringen og
ventet at appen skulle nekte. Den gjorde ikke det — appen leser økten ved
oppstart og holder den i minnet, så det var ingen utlogging. Testen sto
rødt på noe som virker. Utlogget testes nå på sin egen side, som starter
uten økt.
