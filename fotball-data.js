// Rene funksjoner for fotballmodulen (beta).
//
// Samme grunn som lib.js: ingen DOM, ingen nettverk, ingen lagring, sa de
// kan testes i Node pa millisekunder. Fila importeres bade av
// Netlify-funksjonen og av nettleserkoden, slik at formen pa dataene er
// definert ett sted og ikke kan gli fra hverandre.

export const LIGAER = {
  // sesong: "kalender" for ligaer som spilles innenfor ett ar,
  // "host-var" for dem som krysser nyttar. API-Football vil ha aret
  // sesongen startet i begge tilfeller.
  eliteserien: { id: 103, navn: "Eliteserien", land: "Norge", sesong: "kalender" },
  premier: { id: 39, navn: "Premier League", land: "England", sesong: "host-var" },
};

// Slar opp en liga fra nokkelen i adressen. Ukjent nokkel gir null, sa
// hverken funksjonen eller visningen trenger a gjette.
export function ligaFor(nokkel) {
  return Object.prototype.hasOwnProperty.call(LIGAER, nokkel) ? LIGAER[nokkel] : null;
}

// Sesongtallet API-et vil ha. For host-var-ligaer horer januar 2026 til
// sesongen som startet i 2025; skillet settes i juli, som er for forste
// serierunde i de ligaene vi viser.
export function sesongFor(liga, naa) {
  const dato = naa || new Date();
  const ar = dato.getUTCFullYear();
  if (!liga || liga.sesong !== "host-var") return ar;
  return dato.getUTCMonth() >= 6 ? ar : ar - 1;
}

// Gratisnivaet gir 100 kall i dognet. Tre datasett for to ligaer, hvert
// oppfrisket hver time, ville blitt 144 — over taket for noen har apnet
// appen to ganger. Levetidene under gir 72, og lar tabellen stivne litt
// framfor resultatene, som er det leserne kommer tilbake for.
export const LEVETID = {
  tabell: 3 * 3600,
  resultater: 1 * 3600,
  neste: 6 * 3600,
};

// Verste tilfelle: cachen tommes akkurat nar levetiden lopet ut, hele
// dognet. Brukes av testen som vokter kvoten nar en liga legges til.
export function kallPerDogn(antallLigaer) {
  const perLiga = Object.keys(LEVETID)
    .reduce((sum, del) => sum + Math.ceil(86400 / LEVETID[del]), 0);
  return perLiga * antallLigaer;
}

// API-Football svarer 200 ogsa nar noe er galt, og legger feilen i
// errors: tom liste nar alt er bra, et objekt med meldinger nar det ikke
// er det. En manglende nokkel ser ellers ut som en tom tabell.
export function apiFeil(json) {
  if (!json || typeof json !== "object") return "Tomt svar";
  const feil = json.errors;
  if (Array.isArray(feil)) return feil.length ? String(feil[0]).slice(0, 200) : null;
  if (feil && typeof feil === "object") {
    const nokler = Object.keys(feil);
    if (!nokler.length) return null;
    return (nokler[0] + ": " + String(feil[nokler[0]])).slice(0, 200);
  }
  return null;
}

// Plukker tabellen ut av svaret og beholder bare feltene visningen bruker.
// Uventet form skal stoppe her, i funksjonen, framfor a bli en tom tabell
// hos leseren.
export function tolkTabell(json) {
  const feil = apiFeil(json);
  if (feil) throw new Error(feil);

  const forste = Array.isArray(json.response) ? json.response[0] : null;
  const grupper = forste && forste.league && forste.league.standings;
  if (!Array.isArray(grupper) || !Array.isArray(grupper[0]) || !grupper[0].length) {
    throw new Error("Uventet svar: fant ingen tabell");
  }

  // Flere grupper betyr cupspill. Ligaene vi viser har en.
  return grupper[0].map(tabellrad);
}

function tabellrad(rad) {
  const alle = (rad && rad.all) || {};
  const mal = alle.goals || {};
  return {
    plass: tall(rad && rad.rank),
    lag: tekst(rad && rad.team && rad.team.name),
    merke: (rad && rad.team && rad.team.logo) || null,
    kamper: tall(alle.played),
    seier: tall(alle.win),
    uavgjort: tall(alle.draw),
    tap: tall(alle.lose),
    scoret: tall(mal.for),
    sluppet: tall(mal.against),
    differanse: tall(rad && rad.goalsDiff),
    poeng: tall(rad && rad.points),
  };
}

function tall(verdi) {
  const n = Number(verdi);
  return Number.isFinite(n) ? n : 0;
}

// Lagnavn havner i DOM som tekst, men lengden kuttes her: et manipulert
// eller uventet langt navn skal ikke kunne sprenge tabellraden.
function tekst(verdi) {
  return String(verdi === undefined || verdi === null ? "" : verdi).slice(0, 40);
}
