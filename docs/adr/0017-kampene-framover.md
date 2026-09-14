# 0017 — Kampene framover, ikke bare neste runde

## Kontekst
Fanen het «Neste runde» og viste nøyaktig det: `nesteRunde()` plukket
runden til den første kampen som kom, og kastet resten. Begrunnelsen var
god — ellers ville de siste utsatte kampene fra forrige runde blandet seg
med de første i den neste.

Den var også riktig helt til runden var nesten ferdigspilt. Da sto det
**én kamp** igjen i fanen, og ingenting om helgen etter. Meldt fra faktisk
bruk 14. september 2026: «dumt at man ser kun en kamp når det er slutten
av en runde. Jeg er nysgjerrig på kampene framover.»

## Beslutning
Leseren ser **hele vinduet** av kommende kamper, med en overskrift per
runde. `kampeneFramover()` i `fotball-data.js` erstatter `nesteRunde()` og
gjør bare én ting: sorterer eldste først. Fanen heter «Kommende».

Dette koster **ingenting** på døgnkvoten. Kildene sender tjue kamper
uansett (`next=20` hos API-Football, `schedule/next` hos TheSportsDB), og
har gjort det siden [ADR 0011](0011-visninger-i-repoet.md) flyttet
utvelgelsen ut av funksjonen så adminportalen kunne planlegge lenger fram.
Det er samme svar og samme cache-nøkkel — bare uten at halvparten kastes i
nettleseren.

**Sett virke i prod 14. september 2026**, samme dag det ble meldt.

## Konsekvens

### Runden er en overskrift, ikke en filtreringsregel
`.kamp-runde` tegnes når runden skifter. Uten den er «lørdag 27. sep» det
eneste som skiller neste runde fra den etter, og det er ikke nok når lista
rekker flere helger fram.

Kilder som ikke sender rundetall gir **ingen** overskrift. TheSportsDBs
kommende kamper mangler ofte `intRound`, og en tom «Runde » er verre enn
ingen.

Formen er hairline og `--text-dim`, ikke aksentfargen. Den deler en
tidsrekke, mens `.kamp-bolk` sier at rekkefølgen er *endret* — samme
skille som linja over feeden når favorittlag løftes. To overskrifter i
aksentfarge over hverandre ville sagt det samme to ganger.

### Ingen rundeoverskrift i den løftede bolken
«2 kamper noen blir med på» er plukket **på tvers av** runder. En «Runde
22» over to kamper som tilfeldigvis er fra samme runde ville påstått at
bolken *var* runden. I «Resten av kampene» er rekkefølgen fortsatt
tidsrekka, og der hører skillene hjemme.

Runden ligger i `dataset.runde` på raden, som dagen gjør, så
`tegnBolker()` kan tegne dem på nytt uten å regne dem ut igjen — radene
flyttes, de tegnes ikke på nytt, så et åpent panel og en hentet værlinje
overlever ([ADR 0015](0015-svarene-i-appen.md)).

**Og `loftKamper()` rydder dem ikke bort selv.** Et forsøk på det traff
også stien der ingenting tegnes på nytt, og strippet rundeoverskriftene
fra en liste som sto helt riktig. `tegnBolker()` kaller `replaceChildren()`
og tegner begge skillene selv; det er det ene stedet.

### Taket på tjue id-er holdes nå av buntingen alene
`nesteRunde()` holdt `/api/svar` under `KAMPER_MAKS` av seg selv — men
bare når kampene bar et rundetall, og det var uansett en bivirkning av at
halve vinduet ble kastet. Se [ADR 0015](0015-svarene-i-appen.md): det er
`hentSvarFor()` som deler spørringen, og det er den mekanismen som gjelder.

### Hva som ble vurdert og valgt bort
- **Å beholde én runde og legge til «Vis neste runde».** Et trykk til for
  å svare på et spørsmål leseren allerede hadde stilt ved å åpne fanen.
  Og en knapp som bare finnes fordi noe ble kastet først, er en knapp som
  rydder opp etter oss.
- **Å hente flere enn tjue kamper.** Da hadde det kostet kvote. Tjue er
  det kildene gir gratis, og det rekker to–tre runder i en serie med åtte
  kamper i runden.
- **Å gruppere på dato alene.** Dagskillene finnes allerede, men de sier
  ikke hvilken runde en lørdag hører til. Serien er det leseren orienterer
  seg i.
