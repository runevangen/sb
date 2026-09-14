# 0002 — Ruting på hash, ikke sti

## Kontekst
Appen har flere visninger: en sak (`#/sak/<slug>`) og fotballmodulen
(`#/fotball/<liga>/<del>`).

## Beslutning
All ruting går på hash.

## Konsekvens
- En sti ville gitt 404 ved oppfriskning uten en ny regel i
  `netlify.toml`, og den skal holdes smal (se [0003](0003-smal-wordpress-proxy.md)).
- Å åpne en sak legger en tilstand i historikken, så telefonens
  tilbakeknapp lukker artikkelen i stedet for appen.
- `tolkFotballHash` gjenkjenner ledd på **innhold**, ikke rekkefølge, og ukjente ledd
  faller tilbake til standard. En klippet lenke åpner noe framfor
  ingenting.
- Kampen, svaret og stedet ligger i en spørring *etter* hashen
  (`?kamp=…&hvor=pub&sted=…`), ikke som nye ledd i stien: en kamp-id
  ligner verken på en liga eller en del, og en eldre utrullet app ser
  bare `#/fotball/<liga>/neste` og virker fortsatt.
