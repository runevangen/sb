# 0003 — Proxyen mot WordPress er smal

## Kontekst
Feeden hentes fra WordPress REST på sportsbibelen.no, gjennom en proxy på
vårt eget domene.

## Beslutning
Reglene i `netlify.toml` slipper gjennom **kun** `/posts` og
`/categories`. Aldri wildcard mot `wp/v2`.

## Konsekvens
- Et wildcard ville åpnet en vei inn til `/users`, som lister brukernavn.
- Hver ny rute er en bevisst beslutning, ikke noe som følger med.
- Ingenting skal kreve endringer på sportsbibelen.no. Appen er en leser,
  ikke en integrasjon.
