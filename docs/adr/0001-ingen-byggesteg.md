# 0001 — Ingen byggesteg

## Kontekst
Appen er vanlig ES-moduler servert som de er. Ingen bundler, ingen
transpilering, ingen `node_modules` i det som rulles ut.

## Beslutning
Det blir slik. Nettleseren får filene slik de står i repoet.

## Konsekvens
- Det du leser i repoet er det som kjører. Ingen kildekart, ingen
  «hvorfor ser den kompilerte fila annerledes ut».
- Alt som trenger et byggesteg er utelukket. Bildeutsnittene i `bilder/`
  ligger derfor ferdig beskåret, ett per form — nettleseren skal ikke
  skalere et kvadratisk bilde ned til et band.
- Testene kan importere de samme modulene appen bruker, uten verktøy.
- Prisen er at vi ikke får typesjekking eller treristing. Det er en
  akseptert kostnad på et prosjekt i denne størrelsen.
