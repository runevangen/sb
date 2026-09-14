# 0004 — Ingen statistikk i det hele tatt

## Kontekst
Nesten alle apper måler bruk. Det koster et skript, en
informasjonskapsel og et samtykkebanner.

## Beslutning
Null sporingsskript, ingen informasjonskapsler, ingen samtykkebanner.

## Konsekvens
- Bruken leses av Usage-grafen i Netlify — båndbredde og forespørsler.
  Grovt, men gratis og allerede der.
- `track()` i `app.js` står igjen som en **tom operasjon**, så de femten
  hendelsene fortsatt er merket i koden. Skal de samles inn en gang, er
  det ett skript i `index.html` og ingen endringer i resten.
- Netlify Analytics ville målt på serveren uten noe skript, men er et
  betalt tillegg per prosjekt. Valgt bort inntil videre.
- Innloggingen endrer ikke dette: den lagrer fornavnet til den som selv
  velger å logge inn, og fortsatt ingenting om alle andre.
