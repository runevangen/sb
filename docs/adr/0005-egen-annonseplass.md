# 0005 — Den ledige plassen er vår egen, og merkes ikke som reklame

## Kontekst
`ADS` i `app.js` inneholdt tre slags kort: fire oppdiktede annonsører
(#25), vår egen ledige plass, og sju spøker. I dag står bare den ledige
plassen igjen, i sju utgaver.

> **Endret 16. september 2026.** De oppdiktede annonsørene er ute. En
> oppdiktet annonsør i prod er en påstand om et samarbeid som ikke
> finnes, og det er nøyaktig den slags påstand appen ellers er nøye på å
> ikke fortelle. Hver plass er nå enten vår egen eller en spøk. Raden med
> «Reklame» står igjen i tabellen fordi den er det en **ekte** annonsør
> får — den er bare ikke i bruk.

> **Endret 21. september 2026.** Spøkene er ute også. De var ærlige —
> merket «Spøk», og de kalte seg aldri reklame — men de sto **først** i
> rotasjonen, og da var det første en leser møtte en vits. Sju av fjorten
> plasser spøkte. En app som vil selge en plass kan ikke bruke
> førsteinntrykket på noe annet, og halvparten vitser leses som at den
> ikke mener alvor med plassen den selger.
>
> **Merket lever videre.** `EGNE_MERKER.spok`, `.ad-spok` og reglene i
> `run.mjs` står urørt: en vits kommer tilbake ved å sette `merke: "spok"`
> på en rad. Det er dataene som er borte, ikke muligheten — og en vakt i
> `unit.mjs` slår ut om noen rydder apparatet bort som dødt.

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
- **Spøkene sto først i rotasjonen**, fordi en vits bak fire
  annonseplasser er en vits ingen leser. Det var riktig om vitsen og galt
  om plassen: argumentet gjelder like fullt for det som skal selge, og der
  er det sterkere. Den første plassen er derfor en ledig plass, og en
  vits som legges inn igjen hører lenger ned.
- **Begge halvdelene av vakta måles.** `run.mjs` holder at ingen plass i
  feeden er en spøk; `unit.mjs` holder at apparatet for å lage en fortsatt
  finnes. Sto bare den første, kunne merket forsvinne som død kode uten at
  noe sa fra — og løftet om at vitsen kan komme tilbake ville blitt usant
  i stillhet.
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
