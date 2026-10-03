// Hva som har endret seg, og hvilken sak det svarte på.
//
// **Nummeret er datoen**, `ÅÅÅÅ.MM.DD`. Ingen skjønn, og du ser med én
// gang hvor gammelt det er — et semantisk nummer krever at noen dømmer
// hvor stor endringen var hver gang, og et tall som dømmes feil er verre
// enn ett som bare sier når.
//
// **Én oppføring per dag, ikke per fletting.** Lander fem PR-er samme dag,
// er det fem linjer under den ene datoen. Alternativet var `2026.09.21-2`,
// `-3` og så videre, og da teller nummeret utrullinger framfor å si når —
// som er det eneste en dato er god til.
//
// **Dette er en redaksjonell liste, ikke en logg.** Git har alt loggen.
// Her står bare det en **leser** ville merket: en ny knapp, et svar som
// ble riktig, noe som forsvant. En opprydding uten synlig side hører
// hjemme i historikken, ikke her — ellers drukner det som betyr noe.
//
// **Den sier ingenting om hva som faktisk kjører.** Fila ble med i den
// utrullingen den ble med i, og det er alt den vet. Spørsmålet «ser jeg på
// den nyeste versjonen?» besvares av commit-en, som `verktoy/lag-bygg.mjs`
// stempler inn i `bygg.js` ved utrulling og portalen viser ved siden av
// denne lista. Sto bare denne der, kunne den si 21. september over en app
// som ble bygget den 12.
//
// **Nyeste versjon først — og nye linjer nederst i dagens oppføring.**
// Adminloggen (`admin-logg-data.js`) husker hvor mange linjer nyeste versjon
// hadde da du sist var inne, og regner «nytt siden sist» ut fra det: en linje
// som legges til øverst eller midt i en dag, ville blitt telt som den du
// allerede har sett. En vakt i `unit.mjs` holder rekkefølgen mellom dagene.
export const VERSJONER = [
  {
    versjon: "2026.10.03",
    endringer: [
      { hva: "Sveipet mellom nyhetene og Tabeller og kamper er lettere: det slår til etter en femtedel av skjermbredden (før nesten en tredjedel), og et kort, raskt sveip er nok. Farten måles der fingeren løftes, ikke over hele sveipet, så et hvil før du begynner ikke teller mot deg. Glidet etter slipp er kortere, og kortere jo mindre som er igjen.", issue: 202 },
      { hva: "Forsiden viser tretti saker før «Vis flere saker», mot tolv før — så det er mer å rulle i uten å trykke. Bildene lenger ned lastes etter hvert, som før.", issue: 201 },
    ],
  },
  {
    versjon: "2026.10.01",
    endringer: [
      { hva: "Innloggingen: etter at du har skrevet navnet, står markøren i PIN-feltet, og tastaturet blir oppe på iPhone. Enter i PIN-feltet går videre til «Gjenta» når du lager en ny PIN. «Admin» i menyen åpner et passordfelt der, med tastaturet oppe, og tar deg inn i portalen når du trykker Enter." },
      { hva: "Menyen: «Alle saker» heter «Nyheter», og rett under den står «Tabeller og kamper» (beta). Kategorien «Fotball» heter «Fotballnyheter», for den er nyhetene, ikke tabellene. Fanene nederst er fjernet: begge områdene nås fra hamburgermenyen." },
      { hva: "Sveip: dra fingeren mot venstre for å åpne Tabeller og kamper, og mot høyre for å komme tilbake til nyhetene. Visningen følger fingeren. Menyen virker som før." },
      { hva: "Linja «Rosenborg øverst» (laget du følger) står bare der når en sak om laget faktisk ligger øverst, og sier hvor mange. Før sto den også når ingenting var løftet." },
      { hva: "Første gang du åpner appen på en telefon, står det et lite kort nederst som forklarer sveipet: mot venstre for Tabeller og kamper, mot høyre for å komme tilbake. Det forsvinner av seg selv, og kommer ikke igjen." },
      { hva: "«Installer appen» svarer nå: på iPhone og iPad får du en veiledning rett under knappen, med Del-knappen tegnet, og på Android bruker den installasjonsdialogen når nettleseren gir en, ellers en veiledning for menyen. Er appen alt installert, står ikke knappen der.", issue: 177 },
      { hva: "Portalen: når tastaturet er oppe i stedsskjemaet på en telefon, står en linje med «Lagre stedet» og «Skjul tastaturet» rett over det. Før lå Lagre nederst i skjemaet, bak tastaturet." },
    ],
  },
  {
    versjon: "2026.09.30",
    endringer: [
      { hva: "Søk uten treff har en «Fjern søket»-knapp, en fotballfeil sier «Klarte ikke å hente fotballdata akkurat nå» med «Prøv igjen», og tom «Venner» har en knapp til Kommende.", issue: 181 },
      { hva: "«Logg inn» er en knapp i kampkortet, ikke en setning som peker på menyen: ett trykk, og innloggingen står framme med feltet klart.", issue: 180 },
      { hva: "Navnet ditt i toppfeltet har en rund initial foran seg, lys blå med mørk blå bokstav.", issue: 170 },
      { hva: "Fornavnsfeltet avviser e-postadresser, og en adresse som alt sto som navn vises ikke lenger i «blir med»-lista.", issue: 142 },
      { hva: "Portalen logger hvem som er inne: hver innlogging blir en rad med navn og tidspunkt, og du ser loggen under «Adminlogg». Portalen åpner bare når du er innlogget i appen." },
      { hva: "Når noe har skjedd siden sist du var inne, står det øverst i portalen under «Nytt siden sist»." },
      { hva: "Portalen sier ikke bare «Logg inn i appen først», men har en knapp til appen: innloggingen ligger per adresse, og en forhåndsvisning har ikke den du har i prod." },
      { hva: "Bildene i feeden og i artiklene lastes i riktig størrelse, ikke originalen på flere tusen piksler: en lettere feed, særlig på mobilnett.", issue: 141 },
    ],
  },
  {
    versjon: "2026.09.27",
    endringer: [
      { hva: "«Meld feil eller ønske» på kontosiden: send en feil eller et ønske rett til admin, og se under «Dine meldinger» når den er lest eller fikset. Skjermen og versjonen følger med, synlig, og kan fjernes før du sender." },
      { hva: "Portalen har en ny kø, «Feil og ønsker», med Lest, Fikset og Ikke nå." },
    ],
  },
  {
    versjon: "2026.09.26",
    endringer: [
      { hva: "Ny sonde i portalen under Verktøy: «Hva gir fantasy-API-ene oss?» spør Eliteserien Fantasy og Fantasy Premier League og viser hva som finnes. Bare for admin." },
    ],
  },
  {
    versjon: "2026.09.25",
    endringer: [
      { hva: "Logoen er hjem-knappen: trykk på den, så står du på nyhetene uten søk eller emne, øverst i lista." },
      { hva: "Stjerna i tabellen står helt til venstre, i sin egen kolonne — ikke inntil tallene." },
    ],
  },
  {
    versjon: "2026.09.24",
    endringer: [
      { hva: "Favorittlagene følger kontoen, slik menyen alltid har sagt. Logger du inn på en ny telefon, er stjernene der — og under navnet ditt står det at de er lagret." },
      { hva: "Du kan bytte PIN selv: trykk på navnet ditt og velg «Bytt PIN». Alle andre telefoner blir logget ut." },
      { hva: "Ny fane «Mitt lag» i fotballen: plass i tabellen, form, neste kamp og de siste resultatene for lagene du følger — samlet på ett sted." },
      { hva: "Trykk på navnet ditt oppe til høyre, og du får Mitt lag: lagene dine med plass, form og kamper øverst, og Bytt PIN og Logg ut under. Hamburgeren gir menyen som før." },
      { hva: "Kortet i Mitt lag viser hele tabellen med laget ditt merket, ikke bare de fem radene rundt." },
      { hva: "Menyen er ryddet: kontoen ligger bak navnet ditt og ikke lenger i menyen, og Personvern og Admin er knapper som resten." },
    ],
  },
  {
    versjon: "2026.09.22",
    endringer: [
      { hva: "Hver pub og hvert stadion har fått «Veien dit» — én trykk inn i kartet på telefonen, med sving for sving.", issue: 144 },
      { hva: "Feilmeldinger viser tjenestens egne ord, ikke maskinkonvolutten bak dem. En innlogging som svikter sier «svarte 522» framfor å lime inn en halv JSON-blokk." },
      { hva: "Portalen har fått denne lista, og sier hvilken utrulling du faktisk ser på — hentet fra et stempel som settes ved utrulling, ikke fra et kall som svarte tomt." },
    ],
  },
  {
    versjon: "2026.09.21",
    endringer: [
      { hva: "Saker er ekte lenker: langtrykk gir «Kopier lenke», og en sak kan deles med adressen på nettstedet eller med app-adressen.", issue: 146 },
      { hva: "Telefonrammen forsvinner på brede skjermer, temavelgeren har fått «Auto» som følger systemet, og lenka i delingsfallbacken kan trykkes.", issue: 148 },
      { hva: "Ingen oppdiktet annonsør og ingen spøk i feeden — alle plassene er «Ledig plass».", issue: 25 },
      { hva: "Resultater viser hele sesongen, med siste runde framme og resten bak «Vis tidligere runder».", issue: 134 },
      { hva: "Et sted kan sies imot for én kveld: ligaflagget gjelder sesongen, men «ikke denne kvelden» gjelder kampen.", issue: 139 },
      { hva: "Portalen viser stedene selv når økta fra appen har løpt ut.", issue: 154 },
    ],
  },
];
