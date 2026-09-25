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
// Nyeste først.
export const VERSJONER = [
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
