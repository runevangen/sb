# ADR 0024 — Favorittlagene følger kontoen, og PIN-en kan byttes

**24. september 2026.** Gjelder. Utvider [0009](0009-fornavn-og-pin.md)
og [0014](0014-feed-og-favoritter.md).

## Problemet

Innloggingen har sagt det samme siden den kom:

> «Innlogging er for å dele hvor du ser kampen, og for å ta med
> favorittlagene dine mellom telefoner.»
>
> «Favorittlagene og «jeg blir med» følger kontoen, ikke telefonen.»

Den første halvdelen var sann. Den andre var det ikke: `prefs.lag` lå i
`localStorage`, sammen med tema og skriftstørrelse, og ingenting sendte den
noe sted. Personvernsida sa i tillegg «Favorittlag … bare i din egen
nettleser» — to steder i samme app sa hver sin ting, og det var
personvernsida som hadde rett.

Funnet da «Mitt lag» ble drøftet: en side om *ditt* lag bygget på en konto
som ikke visste hvilket lag det var, ville arvet feilen.

Og PIN-en kunne ikke byttes av den som eide den. Bare admin kunne sette en
ny, og da fikk du den av den som satte den.

## Avgjørelsen

### Favorittlagene

**De ligger i `user_metadata.lag` hos Supabase Auth**, skrevet med
brukerens egen økt (`PUT /auth/v1/user`). Ingen `service_role`
([ADR 0010](0010-ingen-service-role.md)), ingen ny tabell, ingen RLS å
holde i takt, og de forsvinner med kontoen uten at noe må huske å slette
dem. En tabell ville gitt en rad per konto og en regel til om hvem som kan
lese den.

**Telefonens liste er den som tegnes; kontoen er den som flytter den.**
Favorittlagene virker uten konto, og skal fortsatt gjøre det
([ADR 0009](0009-fornavn-og-pin.md): ingenting er låst bak innlogging).

Tre regler, og hver av dem stopper en konkret feil:

1. **Første møte flettes** (`flettLag`): ved innlogging, og første gang en
   telefon som var innlogget *før* denne utrullingen treffer kontoen.
   Kontoens lag først, telefonens nye bak. Uten flettingen ville telefon nr.
   to — som aldri hadde valgt noe — tømt kontoen for telefon nr. éns lag.
2. **Etterpå er kontoen fasit** — ellers kunne et lag du fjernet på én
   telefon aldri forsvinne: den andre ville lagt det tilbake ved hver
   fornying.
3. **Unntatt når en endring aldri kom fram** (`lagUsendt`). Da er
   telefonen nyere enn kontoen, og den vinner. Flagget settes ved
   *trykket*, ikke når kallet feiler: lukkes appen i pustet før sendingen,
   skal neste åpning vite det.

**«Aldri lagret» er ikke «ingen lag».** `tolkPinOkt` setter `lag` bare når
feltet finnes hos tjenesten. Ga begge en tom liste, ville den første
fornyingen etter utrullingen tømt stjernene til alle som hadde valgt lag
før. Samme vakt i `lagreLag`: et svar uten lista er en feil, ikke `[]`.

**Lista bor i visningsvalgene, ikke i økta.** `utenLag()` tar den ut før
økta lagres. To kopier er to sannheter.

**Utlogget blir lagene stående** på telefonen — de virket før du logget
inn — men telefonen glemmer at de har møtt en konto. Neste som logger inn
her, får dem flettet inn som ved en hvilken som helst innlogging.

**Linja i kontopanelet sier hvor lista står**: «følger kontoen», «lagres
…», «henter fra kontoen …» eller «ikke lagret på kontoen ennå». Et løfte du
ikke kan se er holdt, er et du må tro på. Den kostet 26 px i footeren, og
taket i `run.mjs` gikk fra 280 til 300 med begrunnelsen skrevet ved siden
av.

### Bytt PIN

**Den gamle PIN-en kreves, og den prøves med en innlogging.** PIN-en er en
sperre mellom folk som deler en telefon — det er det eneste den er — og
kunne den byttes uten den gamle, kunne hvem som helst med telefonen i hånda
ta kontoen. Økta appen alt har beviser at telefonen en gang var logget inn,
ikke at den som holder den nå kan PIN-en.

Innloggingen gir dessuten en **fersk** økt, og det er den som bytter
passordet. Står *Secure password change* på i Supabase, krever tjenesten en
nylig innlogging for et passordbytte — og en økt som er fornyet i tre uker
er ikke det.

**Alle andre økter logges ut** (`/auth/v1/logout?scope=others`). Den
vanlige grunnen til å bytte er at noen andre kan PIN-en, og da er en telefon
som fortsatt er inne det ene som ikke skal overleve byttet. Det står i
skjemaet *før* du trykker. Økta fra innloggingen over er ikke «en annen»,
så appen får den tilbake og fortsetter med den.

**Går utloggingen galt etter at byttet gikk**, er PIN-en likevel byttet, og
svaret sier begge deler: «PIN-en er byttet. Men andre telefoner kan
fortsatt være innlogget (…)». Ikke at byttet feilet, og ikke ingenting.

## Det vi ikke gjorde

- **Glemt PIN** er fortsatt admin sin jobb. Vi har ingen e-post å sende en
  ny til.
- **Bytte navn.** Navnet *er* kontoen (`pinSlug` → adressen hos Supabase),
  så et nytt navn er en ny konto med en flytting av svarene. Det koster mer
  enn det gir.
- **Hente lista oftere enn fornyingen.** En endring på én telefon når den
  andre ved neste fornying — når appen åpnes etter at tokenet har gått ut,
  og ellers innen en time. Et eget kall ved hver åpning ville rotert
  fornyeren oftere uten å gjøre noe svar sannere.
