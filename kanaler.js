// Hvilken kanal eller strommetjeneste som sender ligaen.
//
// Rettighetene er en egenskap ved LIGAEN, ikke ved kampen: Eliteserien
// gar samme sted hele sesongen. Fem ligaer er dermed fem rader, og de
// endres omtrent en gang i aret — ikke per kamp. Derfor ligger dette i
// koden og ikke i en base: en adminportal for fem rader som endres en
// gang i sesongen er mer a vedlikeholde enn den sparer.
//
// Samme regel som puber-kontakt.js, og av samme grunn: INGENTING HERFRA
// VISES I APPEN FOR DET ER VERIFISERT. kanalFor() i fotball-data.js gir
// bare ut rader der bade kilde og sjekket star. En feil kanal er verre
// enn ingen: leseren kjoper et abonnement hen ikke trenger, eller gar
// glipp av kampen fordi vi sa feil sted.
//
// sjekkKanalliste() haandhever det motsatte ogsa: star det et kanalnavn
// UTEN kilde og dato, slar testene ut. Da er det umulig a foere opp en
// kanal uten a si hvor den er hentet fra og naar noen sa den.
//
// Radene star tomme med vilje. Det er samme valg som `kategorier` i
// LIGAER: vi vet ikke sikkert hva som gjelder, og en oppdiktet oppfoering
// ville sett ut som en opplysning som virker.
//
// ANTAKELSER, IKKE DATA. En modell med kunnskapskutt i mai 2026 tror
// foelgende, og tar antakelig feil pa flere av dem — norske
// sportsrettigheter flytter seg, og de tre sydeuropeiske er jeg minst
// sikker pa. Bruk dette som et sted a begynne a lete, aldri som svaret:
//
//     eliteserien  TV 2 Play
//     premier      TV 2 Play
//     laliga       ?
//     bundesliga   ?
//     seriea       ?
//
// Slik fylles en rad ut:
//
//     eliteserien: {
//       kanal: "TV 2 Play",
//       kilde: "https://www.tv2.no/…",     // der det faktisk star
//       sjekket: "2026-09-14",             // dagen DU sa det selv
//     },

export const KANALER = {
  eliteserien: { kanal: null, kilde: null, sjekket: null },
  premier: { kanal: null, kilde: null, sjekket: null },
  laliga: { kanal: null, kilde: null, sjekket: null },
  bundesliga: { kanal: null, kilde: null, sjekket: null },
  seriea: { kanal: null, kilde: null, sjekket: null },
};
