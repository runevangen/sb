# 0018 — «Hvem viser kampen» i Supabase, skrevet med din egen økt

Erstatter [ADR 0011](0011-visninger-i-repoet.md).

## Kontekst
0011 la visningene i `visninger.js` i repoet. Det var riktig: få rader, én
admin, ingen database — og leseren fikk «denne kampen vises på Lincoln
Pub» uten et eneste nettkall, fordi fila fulgte med utrullingen.

To ting veltet det (#79). `GITHUB_TOKEN` kan skrive **kode**, ikke bare
data — en feil i funksjonen kunne endret appen, ikke bare lista. Og
lagringen leste sha, flettet og skrev tilbake, så to samtidige skrivinger
lot den ene tape stille. Med én admin var det teoretisk. Med puber som
skriver selv ([#65](https://github.com/runevangen/sb/issues/65)) er det
ikke det — og pubene kan uansett ikke få skrivetilgang til repoet.

## Beslutning
Tabellen `visninger` i Supabase, med RLS som `kampsvar`. Lesing for alle.
**Skrivingen går med skriverens egen økt**, og databasen slår opp uid-en i
`visning_skrivere`.

## Konsekvens

### Hvorfor ikke «bak ADMIN_PASSORD», slik issuen sa
Fordi `ADMIN_PASSORD` er vårt eget passord, og Supabase vet ikke hva det
er. Databasen trenger sin egen identitet for å slippe en skriving gjennom
RLS. De tre andre veiene ble vurdert og valgt bort:

- **La `anon` skrive.** Da er tabellen i praksis åpen for hvem som helst
  som kjenner anon-nøkkelen. En feil pubvisning er verre enn ingen — samme
  regel som `kontaktFor()` og `kanalFor()`.
- **`security definer`-funksjon med passordet som argument.** Flytter den
  samme makta inn i basen, med en hemmelighet i et SQL-argument. Avvist for
  `brukere.mjs` av nettopp den grunnen ([ADR 0010](0010-ingen-service-role.md)).
- **En `service_role`-nøkkel til.** Regelen er at det er **én** fil som
  har en.

Og en fjerde: **en egen Supabase-konto for portalen.** Den virker, men
koster to nye hemmeligheter for å fjerne én. Vi la til null.

`ADMIN_PASSORD` står igjen som døren til skjemaet, ikke til skrivingen. To
låser, og den som holder er databasens.

### Prisen: du må være logget inn i appen for å lagre
`admin.html` ligger på samme domene som appen, så portalen leser økten fra
`localStorage`. Uten en økt sier den det med ord framfor å sende noe som
blir avvist. Det er en ny ting admin må gjøre — og det er formen #65
trenger uansett, siden pubene der skal skrive i sitt eget navn.

`visning_skrivere` har **ingen skrivepolicy**, med vilje: raden føres inn
i SQL av en som allerede har tilgang til basen. Lista over hvem som får
skrive kan ikke utvides av noen som bare er logget inn.

### Leseren mistet en kilde som kostet null kall — og fikk den tilbake gratis
Dette er den delen som ikke sto i issuen. Fila lå i service worker-cachen
og virket uten nett. Et eget `/api/visninger` for lesing ville lagt ett
kall til per fotballvisning.

Derfor rir visningene med på **`/api/svar`**, som allerede spør om nøyaktig
de samme kamp-id-ene, én gang per runde. Funksjonen gjør to spørringer mot
basen, samtidig, og leseren gjør like mange kall som før. De to tingene som
står under kampraden — «3 blir med» og «vises på Lincoln Pub» — kommer nå
fra ett svar.

Visningene er et **tillegg**: svikter de mens `kampsvar` svarer, står
runden med «blir med»-lista og uten stjerner. En tom visningsliste ser ut
som «ingen har meldt inn», og det er det normale svaret.

### Det som kommer over nettet, lander etter at runden står ferdig
Og det er tredje gang den fella slår til i dette prosjektet. `viserlinje()`
ble tegnet i `kamprad()`, altså før svaret kom — linja ville aldri dukket
opp. `tegnSvar()` tegner den derfor på nytt, som den gjør for
«blir med»-linja og for et åpent kort. I `delPanel()` er `bekreftede` en
**funksjon**, ikke en verdi, av samme grunn: et kort som ble åpnet før
svaret landet ville ellers stått med det tomme svaret for alltid.

### Hva som går tapt
Historikken i git, og muligheten til å rette fila for hånd. Begge er
reelle, og det var nettopp derfor 0011 valgte repoet. Til gjengjeld er
endringen ute for leserne **med det samme** — ingen utrulling å vente på —
og `visning-data.js` består: `slaSammen`, `sjekkVisninger` og
`bekreftetFor` er rene funksjoner og bryr seg ikke om hvor radene kommer
fra.

`GITHUB_TOKEN` kreves ikke lenger av noen funksjon. Den ble stående i
Netlify-miljøet med vilje: #80 foreslår en innsendingsvei som også skriver
til repoet, og en nøkkel som må settes tilbake om to uker er verre enn en
som ligger ubrukt. Den dagen #80 lander et annet sted, skal den slettes.
