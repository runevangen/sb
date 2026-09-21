# 0023 — Et tips kan ta et sted ut

## Kontekst
[ADR 0022](0022-antatte-steder.md) satte et gjettet sted inn i lista med
sitt eget merke og sine egne ord. Den sa selv at den var **halvparten**:

> Uten en vei for «de viser ikke fotball her» er dette bare gjetning med
> bedre typografi.

Dette er den andre halvparten. Uten den blir lista dårligere for hver by
vi fyller: antakelsene hoper seg opp, og ingen av dem kan bli motsagt.

## Beslutning
**En leser kan si fra at et antatt sted ikke viser fotball, og tipset går i
den samme køen som forslagene — øverst.**

### Feltet
`pub_forslag.viser_fotball === false` **er** tipset. Ingen ny kolonne.

Feltet hadde to verdier og tre betydninger: `true` var «de viser fotball»,
og portalen viste `false` som «uvisst om de viser fotball» — et ord dataene
aldri sa. Ingen rad i basen har noen gang vært `false`, og
avkryssingsboksen som kunne satt den er tatt ut av appen: står du i døra på
en pub og melder den inn, er svaret på «viser de fotball» at du bruker den
knappen.

Da er `false` ledig, og den betyr det den ser ut som. Ett felt, én
betydning per verdi.

`forslagRad()` skriver bare `false` når feltet uttrykkelig er `false` — sto
det `!!inn.viserFotball`, ville en glemt linje hos den som kaller blitt et
tips om at stedet er feil.

### Knappen
«De viser ikke fotball» står **bare på et antatt sted**, og bare for den
som er logget inn.

Bare på et antatt sted, fordi et sted noen har stått i døra på ikke skal
kunne rettes bort av et trykk fra en som gikk forbi — og et sted vi har
gjettet på skal kunne det, for vi har ingenting å forsvare. Bare innlogget,
fordi databasen setter `foreslatt_av` fra økta: en knapp som ikke kan
levere er verre enn ingen. Samme grunn som `tilbyForslag()` tier utlogget.

### Køen
`sorterForslagKo()` setter tipsene først, og eldst først innenfor hvert
lag. Vekta har tre trinn:

| | |
|---|---|
| 0 | tips om et sted vi **gjettet** på — gratis å ta imot |
| 1 | tips om et sted noen har **stått i døra** på — to kilder er uenige |
| 2 | et sted noen foreslår at vi legger inn |

Vekta leses av **lista**, ikke av raden: `sikkerhet` står i `puber`, og et
felt ved siden av i køen kunne vært uenig med den. Og av den
**sammenslåtte** lista — et antatt sted i en ny by ligger i basen, ikke i
fila, og det er nettopp de radene tipsene handler om.

## Konsekvens

### Sløyfa lukkes av lagringen, ikke av et trykk til
«Ta stedet ut» åpner stedet i editoren med haken satt. Den lagrer ikke:
[ADR 0019](0019-pubforslag.md) og [ADR 0020](0020-stedene-i-portalen.md)
står, og et tips fra en forbipasserende er ikke et unntak fra dem — det er
grunnen til at de finnes.

Men **lagringen merker køen**, og den vet nå hvilken rad den svarer på:
tas stedet ut, er det tipset som er besvart; blir det stående, er det
forslaget. Det sto `p.fjernet ? null` der — riktig da køen bare kunne si
«ta dette inn», og en fjerning svarte ingen. Merket vi begge, ville en
redigering stilt tipset som om noen hadde vurdert det.

### Leseren får vite hva som skjer
«Takk. Vi tar stedet ut hvis du har rett — til da står det der, merket som
antatt.» Stedet **står i lista** mens vi ser på det, og et «vi ser på det»
uten den setningen er et løfte vi ikke holder før neste gang et menneske
åpner køen.

### Hva som blir dårligere
Et tips kan være feil, eller vondt ment. Vakta er at ingenting skjer av seg
selv: et menneske ser tipset, og et menneske tar stedet ut. Og den er
sterkere for de radene det gjelder mest — et tips om et bekreftet sted
kommer opp som «vurder», ikke som noe å trykke bort.

Køen kan vokse. Det er et signal i seg selv, som `FORSLAG_MAKS` alltid har
vært ment å være.
