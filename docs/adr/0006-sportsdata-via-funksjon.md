# 0006 — Sportsdata via Netlify-funksjon, ikke redirect

## Kontekst
API-Sports krever en hemmelig header. En redirect i `netlify.toml` kan
ikke sette en.

## Beslutning
`netlify/functions/fotball.mjs` henter dataene. Nøkkelen når aldri
nettleseren. Adressen settes av `export const config` i funksjonen, ikke
av en ny regel i `netlify.toml` — se [0003](0003-smal-wordpress-proxy.md).

## Konsekvens
- **Sporten ligger i `SPORTER` i `fotball-data.js`, ikke i funksjonen.**
  Adresse, miljøvariabelnavn, sesongvindu, sti og parsere står som én
  oppføring; ligaen peker på sin sport. Funksjonen slår opp
  `sportFor(liga)`. En ny sport er én oppføring i `SPORTER` og én i
  `LIGAER`.
- Filene heter fortsatt `fotball-*`. Den dagen sport nummer to kommer,
  flyttes tabellen til `sport-data.js` — å døpe om fem filer nå, for en
  sport ingen har bedt om, er å betale for noe vi ikke vet at vi vil ha.
- **Døgnkvoten er per sport.** Hver tjeneste har egen kontonøkkel og egen
  bøtte på hundre. `kallPerSport()` fordeler, og en enhetstest sjekker
  hver bøtte for seg.
- Caching skjer på Netlifys kant med `Netlify-CDN-Cache-Control` og
  `durable` — én delt cache i stedet for én per region. Levetidene står i
  `LEVETID`.
- **Feilsvar caches aldri** (`no-store`). Ellers ville et blaff låst seg
  fast i timevis.
- API-et svarer 200 også når noe er galt, og legger feilen i `errors`.
  `tolkTabell` kaster på det framfor å vise en tom tabell.
- Uten nøkkel svarer funksjonen 503 med en synlig melding.

## Formingen ligger i de rene funksjonene
`tolkDatasett()` og `kommendeKamper()` står i `fotball-data.js`, ikke
inne i Netlify-funksjonen. Det var den siste biten av formingen som bare
fantes der, og som derfor bare kunne testes med et stubbet `fetch` — nå
er den dekket av enhetstester på millisekunder, inkludert at resultater
går nyeste først mens kommende går eldste først.

## Tabellen
- **Lagmerket kostet ingen kall** (#33). Begge kildene bærer det i
  tabellsvaret (`team.logo` / `strBadge`), og begge parserne har plukket
  det ut hele tiden — det var bare aldri tegnet. Bildet ligger hos
  kilden: `referrerpolicy` holder adressen vår for oss selv, `alt` er tom
  (navnet står like ved), og målene står på taggen så raden ikke hopper.
  Svikter adressen, fjernes bildet — et knust ikon sier ingenting.
  `godtattMerke()` godtar `https://` og `data:image/`; http ville blitt
  blokkert som blandet innhold uansett.
- **Lagnavnet er en knapp, ikke en klikkbar rad**: den nås med tastatur og
  leses opp som noe man kan trykke på. Den kaller samme `startSok` som
  søkefeltet, så et lagsøk oppfører seg som et søk man skriver selv.
- Tabellen viser **alle** kolonnene. Et langt lagnavn brytes over to
  linjer framfor å gjøre tabellen bredere enn telefonen. Blir feltet
  likevel for smalt, ruller tabellen vannrett i sitt eget felt: `.phone`
  klipper alt som stikker utenfor, så et felt uten `overflow-x` ville
  skjult de siste kolonnene uten vei tilbake.
