# 0014 — Feeden, søket og favorittlagene

## Kontekst
Et søk på et lagnavn ga de tolv nyeste sakene som nevnte laget i
forbifarten.

## Beslutning
Søket sorteres etter **relevans** hos WordPress (`orderby=relevance`),
ikke dato. Innenfor det som er hentet legger `rangerTreff()` i `lib.js`
tittel-treff øverst, så brødtekst-treff, så resten — nyeste først
innenfor hver gruppe.

## Konsekvens
- Rangeringen skjer i `renderFeed`, **ikke** der dataene hentes, så «Vis
  flere» rangerer hele lista på nytt.
- Sammenlikningen folder norske tegn og HTML-entiteter, så «Bodø/Glimt»
  treffer tittelen «Bod&#248;/Glimt».
- **Favorittlag** velges med stjernen i tabellen og lagres lokalt
  (`sb-visning`, feltet `lag`). Ingen konto, ingen data hos oss. Feeden
  løfter sakene med samme `rangerTreff()`, men med **terskel 2**: bare
  saker som har laget i tittelen eller som kategori. En sak som nevner
  laget i forbifarten skal ikke skyve dagens toppsak nedover.
- At rekkefølgen er endret **står som en linje øverst**, og linja er en
  knapp til tabellen der valget gjøres om. Samme grep som bolkene i
  «neste runde».
- Et søk overstyrer favorittene.
- Innlogging (#24) er dermed en synkroniseringssak, ikke en forutsetning.
- Lenker i artikkelteksten til vårt eget domene får `data-slug` og åpnes i
  appen. `href` beholdes, så lenken virker om noe feiler, og lang-trykk
  oppfører seg normalt.

## Menyen
**Den er den samme uansett hvor du står, og emnene bærer snarveiene.**
Den byttet innhold før — kategorier i nyheter, ligaer i fotball — og det
var én knapp som ga to verdener, avhengig av en tilstand du ikke ser mens
menyen er åpen.

- «Tabell» og «Kamper» står som brikker på de emnene som faktisk er en
  liga vi har data for. `visMeny()` har ingen gren på visning.
  `renderLigameny()` er slettet.
- Ligaene byttes i `#ligaVelger` i selve fotballvisningen, der man alt
  står når man skal bytte liga.
- `ligaForKategori()` matcher på **navnet** med samme `normaliserLagnavn`
  som lagnavnene: heter kategorien «Eliteserien», treffer den uten at noen
  har ført opp noe. Heter den noe annet, føres navnet i `kategorier` på
  ligaen — ett sted. **Lista er tom i dag med vilje:** vi vet ikke hva
  kategoriene faktisk heter, og en oppdiktet oppføring ville sett ut som
  en kobling som virker. Ingen treff er et normalt svar.
- Brikkene er **søsken** til emneknappen, ikke barn. Derfor trenger de
  ingen `stopPropagation` — et trykk på en brikke passerer aldri
  emneknappen. Legger noen dem inni knappen igjen, filtrerer feeden seg i
  bakgrunnen mens fotballfanen åpner, og to nettlesertester slår ut.
- Saksantallet viker for snarveiene på de radene som har dem.
- Menyen har **to veier ut**: krysset i hjørnet og en bred knapp nederst.
  Krysset ligger under statuslinja på iPhone, der tommelen ikke rekker.
