# 0016 — Kanalen som sender ligaen

## Kontekst
«Hvor skal du se den?» har to svar. Det ene er et sted man drar til, og
det har kortet dekket ([ADR 0012](0012-kampkortet.md)). Det andre er en
kanal — og for de fleste kamper er det dét svaret som gjelder.

## Beslutning
**Rettighetene er en egenskap ved ligaen, ikke ved kampen.** Eliteserien
går samme sted hele sesongen. Fem ligaer er dermed fem rader i
`kanaler.js`, og de endres omtrent én gang i året.

Derfor ligger det i koden, ikke i en base og ikke bak en adminportal: en
portal for fem rader som endres én gang i sesongen er mer å vedlikeholde
enn den sparer.

## Konsekvens

### Ingenting vises før det er verifisert
Samme regel som `puber-kontakt.js`, og av samme grunn. `kanalFor()` gir
bare ut rader der **både `kilde` og `sjekket`** står. En feil kanal er
verre enn ingen: leseren kjøper enten et abonnement hen ikke trenger,
eller går glipp av kampen fordi vi sa feil sted.

`sjekkKanalliste()` håndhever det motsatte også — står det et kanalnavn
**uten** kilde og dato, slår `unit.mjs` ut mot den ekte fila. Da er det
umulig å føre opp en kanal uten å si hvor den kom fra og når noen så den.

**Radene står tomme i dag.** Det er samme valg som `kategorier` i
`LIGAER`: vi vet ikke sikkert hva som gjelder, og en oppdiktet oppføring
ville sett ut som en opplysning som virker. Fila har fem rader klare og
sier hva hver trenger.

### Kanalen er ingen sted-rad
Den står i kortet, men som en **opplysning** — ingen ramme, ingen knapp,
ikke i `.sted-liste`. En kanal er ikke et møtested, og en rad med «Jeg
skal hit» ville gjenreist «Hjemme», som ADR 0012 fjernet med vilje:
kortet handler om hvor man treffer noen, og sofaen er ikke et sted.

Den står **over** stedene: ser du at kampen sendes, er resten av kortet
et valg om å se den sammen med noen framfor alene.

Datoen står i `title`, ikke på skjermen — som stjerna til pubene. Den som
lurer på hvor ferskt det er, kan se etter; resten skal slippe å lese en
dato de ikke spurte om. Rettighetene flytter seg, så *når noen sist så
etter* er en del av opplysningen.

### Kampen måtte lære hvilken liga den er fra
`aktivLiga` duger ikke: vennefanen blander ligaene i én liste, så den
ville merket en Premier League-kamp med Eliteseriens kanal — en stille
feil opplysning, som er nettopp det vi ikke skal gi.

Stemplingen skjer i `hent(liga, del)` i `fotball.js`, den ene trakta
begge fanene går gjennom. Ikke i parserne: de ser ett datasett om gangen
og vet ikke hvem som spurte.

### Hva som ble vurdert og valgt bort
- **Adminportalen, som pubene.** Ville arvet #79: `GITHUB_TOKEN` kan
  skrive kode, og to samtidige skrivinger kolliderer stille. Og en portal
  per kamp løser et problem vi ikke har — kanalen er per liga.
- **En modell ved visning.** Koster per leser, og en modell som gjetter
  «Viaplay» er nøyaktig løgnen appen ellers er nøye på å ikke fortelle.
- **TheSportsDB `strTvStation`.** Ville kostet null kall om feltet fantes
  i svaret vi alt henter — som lagmerket i #33. **Sjekket 15. september
  2026: det finnes ikke.** Ikke tomt, fraværende. `eventsnextleague.php`
  gir lag, arena, runde, merker og tidspunkt, men ingen kanal.
  `kanaler.js` er dermed sannheten, ikke reserven, og radene må føres inn
  for hånd med kilde og dato.

### Per kamp, den dagen det trengs
En kamp flyttet til en annen kanal, eller en cupkamp, passer ikke i en
liga-tabell. Det er da — og først da — en overstyring per kamp er verdt
noe, og den hører hjemme sammen med visningene. Altså etter #79.
