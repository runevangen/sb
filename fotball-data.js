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
  // tsdb: ligaens id hos TheSportsDB, som gir kommende kamper for
  // inneværende sesong gratis nar API-Footballs vindu ikke gjor det.
  eliteserien: { id: 103, tsdb: 4358, navn: "Eliteserien", land: "Norge", sesong: "kalender" },
  premier: { id: 39, tsdb: 4328, navn: "Premier League", land: "England", sesong: "host-var" },
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

// Gratisnivaet hos API-Football dekker bare et vindu av sesonger, og
// svarer "season, try from 2022 to 2024" pa alt utenfor. Vi ber derfor om
// den nyeste sesongen abonnementet faktisk gir, framfor a vise en
// feilmelding leseren ikke kan gjore noe med.
//
// Utvides abonnementet, er dette det eneste stedet tallene star.
export const SESONGVINDU = { fra: 2022, til: 2024 };

// Den ekte sesongen om abonnementet dekker den, ellers naermeste kant av
// vinduet. Skille mellom de to hoerer hjemme i visningen, ikke her: den
// som ser en tabell skal fa vite hvilken sesong den er fra.
export function tilgjengeligSesong(liga, naa, vindu) {
  const ramme = vindu || SESONGVINDU;
  const ekte = sesongFor(liga, naa);
  if (ekte < ramme.fra) return ramme.fra;
  if (ekte > ramme.til) return ramme.til;
  return ekte;
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

// Datasettene modulen viser, i den rekkefolgen fanene star.
export const DELER = ["tabell", "resultater", "neste"];

export const DEL_NAVN = {
  tabell: "Tabell",
  resultater: "Resultater",
  neste: "Neste runde",
};

// Adressen hos API-Football for hvert datasett. Bygges her, ikke i
// funksjonen, sa den kan kontrolleres uten a kalle noe.
export function apiSti(del, liga, sesong) {
  const felles = "league=" + liga.id + "&season=" + sesong;
  if (del === "tabell") return "/standings?" + felles;
  // last og next gir oss et vindu rundt naet uten a hente hele sesongen.
  if (del === "resultater") return "/fixtures?" + felles + "&status=FT&last=10";
  if (del === "neste") return "/fixtures?" + felles + "&status=NS&next=20";
  return null;
}

// Kampene fra /fixtures, redusert til det visningen bruker.
export function tolkKamper(json) {
  const feil = apiFeil(json);
  if (feil) throw new Error(feil);
  if (!json || !Array.isArray(json.response)) {
    throw new Error("Uventet svar: fant ingen kamper");
  }
  return json.response.map(kamp).filter((k) => k.hjemme && k.borte);
}

function kamp(rad) {
  const info = (rad && rad.fixture) || {};
  const lag = (rad && rad.teams) || {};
  const mal = (rad && rad.goals) || {};
  const kode = (info.status && info.status.short) || "";
  return {
    id: tall(info.id),
    dato: info.date || null,
    runde: tekst(rad && rad.league && rad.league.round),
    hjemme: redaksjonsnavn(tekst(lag.home && lag.home.name)),
    borte: redaksjonsnavn(tekst(lag.away && lag.away.name)),
    arena: tekst(info.venue && info.venue.name),
    malHjemme: maal(mal.home),
    malBorte: maal(mal.away),
    // AET og PEN er ferdigspilt de ogsa. Uten dem ville en cupkamp avgjort
    // etter ekstraomganger sett ut som at den ikke var spilt.
    spilt: kode === "FT" || kode === "AET" || kode === "PEN",
  };
}

function maal(verdi) {
  return verdi === null || verdi === undefined ? null : tall(verdi);
}

/* ---------- TheSportsDB ---------- */

// Gratisnivaet hos API-Football stopper ved SESONGVINDU. TheSportsDB gir
// tabell, siste resultater og neste kamper for inneværende sesong uten
// nokkel (testnokkel "3"), sa fotballfanen kan vaere arets. Neste runde er
// sett virke i prod; tabell og resultater bygger pa samme dokumentasjon.
// Funksjonen faller tilbake til API-Football om formen ikke stemmer.
export function tsdbSti(del, liga, nokkel, naa) {
  if (!liga || !liga.tsdb) return null;
  const rot = "/api/v1/json/" + encodeURIComponent(nokkel || "3") + "/";
  if (del === "tabell") {
    return rot + "lookuptable.php?l=" + liga.tsdb + "&s=" + encodeURIComponent(tsdbSesong(liga, naa));
  }
  if (del === "resultater") return rot + "eventspastleague.php?id=" + liga.tsdb;
  if (del === "neste") return rot + "eventsnextleague.php?id=" + liga.tsdb;
  return null;
}

// TheSportsDB skriver sesongen som «2026» for kalenderligaer og
// «2025-2026» for dem som krysser nyttar.
export function tsdbSesong(liga, naa) {
  const start = sesongFor(liga, naa);
  return liga && liga.sesong === "host-var" ? start + "-" + (start + 1) : String(start);
}

// Tabellen fra lookuptable.php, i samme form som tolkTabell gir. table er
// null nar sesongen ikke finnes hos dem — det er «ingen tabell», ikke feil,
// sa funksjonen kan ga videre til API-Football.
export function tolkTabellTsdb(json) {
  if (!json || typeof json !== "object") throw new Error("Tomt svar fra TheSportsDB");
  if (json.table === null || json.table === undefined) return [];
  if (!Array.isArray(json.table)) throw new Error("Uventet svar fra TheSportsDB");
  return json.table.map(tsdbRad).filter((r) => r.lag);
}

function tsdbRad(rad) {
  const r = rad || {};
  return {
    plass: tall(r.intRank),
    lag: redaksjonsnavn(tekst(r.strTeam)),
    merke: r.strBadge || null,
    kamper: tall(r.intPlayed),
    seier: tall(r.intWin),
    uavgjort: tall(r.intDraw),
    tap: tall(r.intLoss),
    scoret: tall(r.intGoalsFor),
    sluppet: tall(r.intGoalsAgainst),
    differanse: tall(r.intGoalDifference),
    poeng: tall(r.intPoints),
  };
}

// Samme form som tolkKamper gir, sa visningen ikke vet hvor kampene kom
// fra. events er null — ikke en tom liste — nar ligaen ikke har flere.
export function tolkKamperTsdb(json) {
  if (!json || typeof json !== "object") throw new Error("Tomt svar fra TheSportsDB");
  if (json.events === null || json.events === undefined) return [];
  if (!Array.isArray(json.events)) throw new Error("Uventet svar fra TheSportsDB");
  return json.events.map(tsdbKamp).filter((k) => k.hjemme && k.borte && k.dato);
}

function tsdbKamp(e) {
  const rad = e || {};
  const status = tekst(rad.strStatus);
  return {
    id: tall(rad.idEvent),
    dato: tsdbTid(rad),
    runde: rad.intRound ? "Runde " + tekst(rad.intRound) : "",
    hjemme: redaksjonsnavn(tekst(rad.strHomeTeam)),
    borte: redaksjonsnavn(tekst(rad.strAwayTeam)),
    arena: tekst(rad.strVenue),
    malHjemme: maal(rad.intHomeScore),
    malBorte: maal(rad.intAwayScore),
    spilt: status === "Match Finished" || status === "FT",
  };
}

// strTimestamp er UTC uten sone («2026-09-13T15:00:00»). Uten Z ville
// new Date lest den som leserens lokale tid og bommet med to timer.
function tsdbTid(rad) {
  let t = tekst(rad.strTimestamp);
  if (!t && rad.dateEvent) t = tekst(rad.dateEvent) + "T" + (tekst(rad.strTime) || "00:00:00");
  if (!t) return null;
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t += "Z";
  return Number.isNaN(Date.parse(t)) ? null : t;
}

/* ---------- deling ---------- */

// Teksten som gar inn i gruppechatten. Ren funksjon, sa den kan testes:
// den er det leseren faktisk sender, og en feil her er synlig for andre.
export const HVOR = {
  hjemme: "hjemme",
  pub: "på pub",
  stadion: "på stadion",
};

export function delingstekst(kamp, hvor, sted, url, vaer) {
  const naar = tidstekst(kamp && kamp.dato);
  let hvorTekst = HVOR[hvor] || "";
  if (hvor === "pub" && sted) hvorTekst = "på " + sted;
  if (hvor === "stadion" && (sted || (kamp && kamp.arena))) {
    hvorTekst = "på " + (sted || kamp.arena);
  }
  return "⚽ " + kamp.hjemme + " – " + kamp.borte + (naar ? ", " + naar : "") + "." +
    (hvorTekst ? " Jeg ser den " + hvorTekst + "." : "") +
    (vaer ? " Været ved avspark: " + vaer : "") +
    " Hvor ser du?" + (url ? " " + url : "");
}

// «søndag 13. sep. kl. 17.00» i norsk tid, uansett hvor leseren er.
// Kampene spilles i Norge, og det er den tiden avtalen gjelder.
export function tidstekst(iso) {
  const dato = iso ? new Date(iso) : null;
  if (!dato || Number.isNaN(dato.getTime())) return "";
  const dag = dato.toLocaleDateString("nb-NO",
    { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Oslo" });
  const kl = dato.toLocaleTimeString("nb-NO",
    { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
  return dag + " kl. " + kl;
}

// "Neste runde" er runden til den forste kampen som kommer, ikke de ti
// neste kampene: ellers ville halve neste runde blitt blandet med de siste
// utsatte kampene fra denne.
export function nesteRunde(kamper) {
  if (!kamper.length) return [];
  const sortert = kamper.slice().sort(
    (a, b) => String(a.dato).localeCompare(String(b.dato)));
  const runde = sortert[0].runde;
  return runde ? sortert.filter((k) => k.runde === runde) : sortert;
}

// Ruting for modulen: #/fotball/<liga>/<del>, begge valgfrie. Ukjente ledd
// faller tilbake til standard i stedet for a gi en tom visning, sa en
// gammel eller klippet lenke fortsatt apner noe.
export function tolkFotballHash(hash) {
  const m = String(hash || "").match(/^#\/fotball(?:\/([^/?#]+))?(?:\/([^/?#]+))?/);
  if (!m) return null;

  const ledd = [m[1], m[2]].filter(Boolean).map(decodeURIComponent);
  let liga = "eliteserien";
  let del = "tabell";

  for (const bit of ledd) {
    if (ligaFor(bit)) liga = bit;
    else if (DELER.indexOf(bit) !== -1) del = bit;
  }
  return { liga, del };
}

export function fotballHash(liga, del) {
  return "#/fotball/" + encodeURIComponent(liga) + "/" + encodeURIComponent(del);
}

/* ---------- lagnavn ---------- */

// API-Football skriver lagnavn uten norske bokstaver: "Bodo/Glimt",
// "Tromso", "Lillestrom". Redaksjonen skriver dem riktig. Sendes API-ets
// form rett inn i nyhetssoket, gir det null treff — og det ser ut som at
// det ikke finnes saker om laget.
//
// Nokkelen er navnet normalisert: sma bokstaver, norske tegn foldet til
// ascii, alt annet enn bokstaver og tall fjernet. Da treffer bade
// "Bodo/Glimt", "Bodø/Glimt" og "Bodo Glimt" samme rad, og lista er
// robust mot at API-et endrer skrivemate. Ukjente navn gar uendret
// gjennom. Kun lag der API-ets form faktisk avviker star her.
const REDAKSJONSNAVN = {
  bodoglimt: "Bodø/Glimt",
  tromso: "Tromsø",
  lillestrom: "Lillestrøm",
  stromsgodset: "Strømsgodset",
  valerenga: "Vålerenga",
  mjondalen: "Mjøndalen",
  stabaek: "Stabæk",
};

export function normaliserLagnavn(navn) {
  return String(navn || "")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
    .replace(/[^a-z0-9]/g, "");
}

export function redaksjonsnavn(navn) {
  const nokkel = normaliserLagnavn(navn);
  return Object.prototype.hasOwnProperty.call(REDAKSJONSNAVN, nokkel)
    ? REDAKSJONSNAVN[nokkel]
    : navn;
}

function tabellrad(rad) {
  const alle = (rad && rad.all) || {};
  const mal = alle.goals || {};
  return {
    plass: tall(rad && rad.rank),
    // Oversettes her, i det ene stedet dataene formes, sa bade tabellen,
    // kamplistene og soket ser samme navn.
    lag: redaksjonsnavn(tekst(rad && rad.team && rad.team.name)),
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
