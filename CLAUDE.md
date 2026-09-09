# Sportsbibelen — nyhetsapp

Enkeltfil-app (`index.html`) som viser saker fra sportsbibelen.no.
Ingen byggesteg. Hostes på Netlify som prosjektet `mvp-sb`.

## Slik vil jeg ha svar

- **Still spørsmål som kan klikkes.** Bruk AskUserQuestion med konkrete
  alternativer, ikke åpne spørsmål i brødteksten.
- **Avslutt hvert svar med en statusblokk** som inneholder:
  - hva som er siste nytt (hva du nettopp endret),
  - hvor jeg finner det (prod-URL, branch, PR),
  - om du venter på meg eller ikke.

## Arkitektur

- Feeden hentes fra WordPress REST via en proxy på eget domene.
  Reglene ligger i `netlify.toml` og er bevisst smale: kun `/posts` og
  `/categories`, aldri wildcard mot `wp/v2` — det ville åpnet en vei inn
  til `/users`, som lister brukernavn.
- Ingenting skal kreve endringer på sportsbibelen.no.
- Artikkel-HTML renses med en allowlist før den vises. Ukjente tagger
  pakkes ut til tekst. Utvid allowlisten framfor å lage unntak.
- Fargene ligger som CSS-variabler i `:root`. Et tema overstyrer kun
  variabler. Tekst som ligger oppå bildegradienten bruker `--on-overlay`,
  ikke temaets tekstfarge — gradienten er mørk i begge temaer.
- Tekststørrelser skaleres av `--fs`. Avstander og rammer skaleres ikke.

## Testing

Ingen testsuite. Endringer verifiseres i headless Chromium:
`/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`
med mocket `window.fetch`. Merk at `--virtual-time-budget` ikke driver
CSS-transisjoner fram; bruk `--force-prefers-reduced-motion` for
skjermbilder av animerte paneler.
