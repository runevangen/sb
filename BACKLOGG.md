# Backlogg

Backloggen ligger som **[issues](https://github.com/runevangen/sb/issues)**,
ikke i denne fila. To lister som beskriver det samme, spriker etter et par
uker — og da er begge verdiløse.

Denne fila finnes bare for å peke dit, og for å si hvorfor.

## Slik den er delt

| Merkelapp | Hva det betyr |
|---|---|
| `avklaring` | Venter på en avgjørelse, ikke på kode |
| `prod` | Står ute på `mvp-sb.netlify.app` nå |
| `sikkerhet` | Hører hjemme i wp-admin på sportsbibelen.no, ikke her |
| `fotball` | Fotballmodulen (beta) |
| `uverifisert` | Bygget, men aldri prøvd i virkeligheten |

## Der jeg ville begynt

- **[#25](https://github.com/runevangen/sb/issues/25)** — de oppdiktede
  annonsørene er det eneste punktet som er synlig for ekte lesere nå.
- **[#29](https://github.com/runevangen/sb/issues/29)** — brukernavnene
  på sportsbibelen.no er offentlig lesbare. Det er derfor
  proxy-reglene i `netlify.toml` er smale, og den regelen må stå.
- **[#65](https://github.com/runevangen/sb/issues/65)** — adminportalen
  virker, og pubene er ført inn av oss. Neste steg er at puben fører
  inn selv. Veien dit er kortere nå enn da issuen ble skrevet — men den
  går gjennom **[#79](https://github.com/runevangen/sb/issues/79)**:
  pubene kan ikke skrive til repoet, så visningene må flyttes til
  Supabase først.
- **[#80](https://github.com/runevangen/sb/issues/80)** — og steget før
  #65: at leseren kan sende inn et sted som mangler i lista. #65 er
  puben som bekrefter en kamp; #80 er stedet som i det hele tatt finnes.

Denne lista pekte en stund til #26, som ble lukket samme dag den ble
skrevet — Netlify Analytics ble valgt framfor Plausible. Akkurat den
glidningen er grunnen til at backloggen ligger i issues og ikke her:
sjekk mot issues når noe her ser rart ut, ikke motsatt.

Historikken for denne fila, med den fulle teksten slik den var før
issuene ble laget, ligger i git.
