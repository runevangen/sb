> **Erstattet av [ADR 0018](0018-visninger-i-supabase.md)** 15. september 2026.
> Visningene ligger i Supabase nå. Denne står igjen fordi den forklarer
> hvorfor repoet var riktig først, og hva som gikk tapt ved å flytte.

# 0011 — «Hvem viser kampen» lagres som en commit

## Kontekst
Adminportalen fører inn hvilken pub som viser hvilken kamp. Det er få
rader, de endres sjelden, og leseren skal se dem uten et nettkall.

## Beslutning
`/api/visninger` leser `visninger.js` fra GitHub, fletter inn valget med
`slaSammen` i `visning-data.js`, og skriver fila tilbake. Fila er gyldig
JSON inni en `export`, så funksjonen kan lese den **ekte** tilstanden fra
repoet framfor å stole på en utrullet kopi.

## Konsekvens
- En commit utløser en deploy, så endringen er ute etter et minutt eller
  to — og går noe galt, kan fila rettes for hånd. Historikken står i git.
- `slaSammen` rører bare den ene puben og de kampene som sto på skjermen.
  To puber kan settes etter hverandre, og en annen ligas visninger
  overlever et bytte.
- `utenGamle` kaster kamper som er spilt for lenge siden, så lista ikke
  vokser i det uendelige.
- Pubene kommer fra `puber-oslo.js`; en pub som ikke står der, avvises av
  funksjonen. `usikker` vises ikke i appen og kan derfor ikke velges her.
- **Dette er en midlertidig form.** Skal pubene skrive selv (#65), må det
  flyttes til et ekte lager: to samtidige skrivinger kan i dag kollidere
  på sha-en, og `GITHUB_TOKEN` kan skrive kode i repoet.
- Det står «Meldt inn til oss» under gruppa, ikke «Puben bekrefter»:
  inntil pubene skriver selv er det vi som har ført det inn, og leseren
  skal vite forskjellen.

## Portalen
- `admin.html` er en **egen side**, ikke en visning i appen. Den ligger
  under «Del appen» i menyen og er `noindex`.
- **Passordet først:** resten av portalen ligger skjult til tjenesten har
  godtatt det (`handling: "sjekk"`). Skjulingen er ikke sikkerheten — den
  ligger i funksjonen — men den som åpner sida skal se ett felt, ikke et
  skjema hen ikke kan lagre. Det sparer også et kall mot API-Football per
  åpning. Passordet lever i en variabel i modulen, ikke i feltet og ikke i
  `sessionStorage`.
- **Mangler en hemmelighet, svarer funksjonen 503 og sier hvilken.**
  «Portalen er ikke satt opp» alene sender admin til å lete i koden etter
  noe som står i Netlify-panelet. Et `GET` spør bare om oppsettet, og
  portalen gjør det ved åpning.
- Ligaene kommer fra `LIGAER`, ikke fra en egen liste, så de to ikke kan
  gli fra hverandre.
- Id-en går inn i en adresse, så den sjekkes mot formen en uuid har —
  selv om den kommer fra lista portalen nettopp fikk.

## Det leseren ser
To steder. På kampen står «Denne kampen vises på: Lincoln Pub» rett under
raden, så den som blar ser det uten å åpne noe; pubnavnet er en knapp som
åpner kortet med puben ferdig pekt ut. I kortet bærer samme pub samme
stjerne (`merkBekreftet`), så den ser lik ut overalt.

Fargen er `--bekreftet`, egen variabel i begge temaer: `#1F7A4D` er for
mørk på svart. Stjerna sier noe annet enn ballen — ballen betyr at stedet
pleier å vise fotball, stjerna at nettopp denne kampen vises. Stjerna i
tabellen er en tredje ting (favorittlag), og de to møtes aldri på samme
skjerm.

Nettlesertesten legger sin egen `visninger.js` i temp-katalogen, så
lesersiden kan testes med ekte data uten at fila fylles med oppdiktede
puber.
