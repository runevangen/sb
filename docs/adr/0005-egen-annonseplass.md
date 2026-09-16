# 0005 — Den ledige plassen er vår egen, og merkes ikke som reklame

## Kontekst
`ADS` i `app.js` inneholdt tre slags kort: fire oppdiktede annonsører
(#25), vår egen ledige plass, og sju spøker.

> **Endret 16. september 2026.** De oppdiktede annonsørene er ute. En
> oppdiktet annonsør i prod er en påstand om et samarbeid som ikke
> finnes, og det er nøyaktig den slags påstand appen ellers er nøye på å
> ikke fortelle. Hver plass er nå enten vår egen eller en spøk. Raden med
> «Reklame» står igjen i tabellen fordi den er det en **ekte** annonsør
> får — den er bare ikke i bruk.

## Beslutning
Hvert kort sier hva det **er**. `EGNE_MERKER` holder merkene som data,
ikke som `if`-er inne i tegningen.

| Kortet | Merket | `aria-label` |
|---|---|---|
| Ledig plass | «Ledig plass» | «Ledig annonseplass» |
| Spøk | «Spøk» | «Spøk, ikke en ekte annonse» |
| Ekte annonsør | «Reklame» | «Reklame fra ‹navn›» |

### Merket og fasongen er to felt
`merke` sier hva plassen er; `format` sier hvilken fasong den har —
`kort` (bilde), `banner` eller `stripe`. De var **ett** felt til de
oppdiktede annonsørene gikk ut, og da viste det seg hvorfor det ikke
holdt: `"ledig"` betydde både «vår egen» og «bildekort», så en ledig
plass kunne ikke ha bannerets fasong.

De to tekstformatene ble ikke slettet da de ble tomme. De er fasongene en
ekte annonsør kan kjøpe, og en fasong ingen bruker er en fasong ingen ser
— og en kodesti ingen kaller, er død kode som venter på å ryke. Nå selger
de seg selv: banneret viser «DIN ANNONSE HER» der annonsematerialet skal
stå, og stripa navngir ingen annonsør, fordi det ikke finnes noen.

En rad **uten** `merke` er en ekte annonsør. Da sier den «Reklame», og
`brand` er navnet deres.

## Konsekvens
- Å merke vår egen tekst som reklame fra en annonsør ville vært å lyve i
  akkurat den merkingen appen ellers er nøye på — og
  markedsføringsloven ber om det motsatte.
- Spøkene bruker samme fasong og samme ansikt, men Ullevålseter er et
  ekte sted: en tulleannonse merket «Reklame» ville påstått at de har
  kjøpt plassen. Vitsen blir ikke dårligere av at det står hva den er.
- Merket som data gjør det umulig å legge til en plass uten å ta
  stilling til hva den sier at den er. Nettlesertester slår ut hvis en
  spøk noen gang kaller seg reklame, for øyet eller for skjermleseren.
- **Spøkene står først i rotasjonen.** En vits bak fire annonseplasser er
  en vits ingen leser.
- `alt` står på annonsen, ikke i koden: den var hardkodet «Prem» til et
  treskilt kom inn i lista. En skjermleser som sier «Prem» om et skilt er
  verre enn ingenting.

## Formen, og hvorfor den varierer
Plassen står i **tre former**, og ansiktet er poenget: det er en person
man skal sende en melding til, ikke et skjema, så man skal se hvem.
`form` velger fasongen, og de tre står spredt utover `ADS` med vilje —
plassene kommer etter hver fjerde sak, så to kan stå på samme skjerm.
Tre like bokser leses som støy, tre ulike som tre plasser.

- `portrett`: rundt bilde ved siden av teksten, som i en kontaktliste.
- `bred`: 16:9-band over teksten. Bannerannonsenes egen flate er 120 px
  høy, og et ansikt får ikke plass der — kuttet ville gått gjennom haka.
  Vår egen plass trenger ikke følge deres mål.
- `hoy`: bildet er flata, teksten oppå gradienten nederst. Derfor
  `--on-overlay`, ikke temaets tekstfarge: gradienten er mørk i begge
  temaer.

Skiltet får det høye kortet og ikke bandet: det er høyere enn et
16:9-utsnitt tar, så et band ville kuttet «sportsstue». Fasongen følger
motivet, ikke omvendt.

Bredde og høyde står på hver `<img>`: uten dem vokser annonsen når bildet
lastes, og dytter saken man holder på å lese nedover.

Oppsettet står i overskriften og poenget på `sub`-linja under. Delt i to
er vitsen en vits; i én setning er den en opplysning.

## Kontaktpunktet
`MESSENGER` i `app.js` er brukernavnet etter `m.me/` — det samme som står
etter `facebook.com/` i profilen. Står det tomt, blir knappen ren tekst
framfor en død lenke. Lenka åpner i ny fane med `noopener`, så den nye
fanen ikke kan røre appen bak.
