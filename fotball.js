// Fotballmodulen (beta): alt som rorer DOM.
//
// De rene funksjonene ligger i fotball-data.js og deles med
// Netlify-funksjonen, slik at formen pa dataene er definert ett sted.
//
// Modulen eier ikke ruting. Trykk pa en liga eller en fane gar tilbake til
// app.js gjennom naviger(), som setter adressen — da virker tilbakeknappen
// likt her som i resten av appen.

import { LIGAER, DELER, DEL_NAVN } from "./fotball-data.js";
import { timeAgo } from "./lib.js";

let naviger = () => {};
let sokEtterLag = () => {};
// Favorittlag eies av app.js (det er lagring). Modulen far bare to
// sporsmal: er dette laget valgt, og bytt.
let favoritter = { er: () => false, veksle: () => false };
let aktivLiga = "eliteserien";
let aktivDel = "tabell";

// Hentede datasett, med tidspunkt. Et fanebytte fram og tilbake skal ikke
// koste et nytt kall — kanten har allerede svart en gang.
const husket = new Map();
const HUSKE_MS = 10 * 60 * 1000;

function el(tag, klasse, tekst) {
  const node = document.createElement(tag);
  if (klasse) node.className = klasse;
  if (tekst != null) node.textContent = tekst;
  return node;
}

/* ---------- oppsett ---------- */

export function initFotball(paNavigering, paLagsok, paFavoritt) {
  naviger = paNavigering;
  if (paLagsok) sokEtterLag = paLagsok;
  if (paFavoritt) favoritter = paFavoritt;

  const ligaer = document.getElementById("ligaVelger");
  Object.keys(LIGAER).forEach((nokkel) => {
    ligaer.appendChild(velgerknapp(nokkel, LIGAER[nokkel].navn,
      () => naviger(nokkel, aktivDel)));
  });

  const faner = document.getElementById("fotballFaner");
  DELER.forEach((del) => {
    faner.appendChild(velgerknapp(del, DEL_NAVN[del],
      () => naviger(aktivLiga, del)));
  });
}

function velgerknapp(verdi, navn, ved) {
  const knapp = el("button", "segment-del", navn);
  knapp.type = "button";
  knapp.dataset.verdi = verdi;
  knapp.addEventListener("click", ved);
  return knapp;
}

function merk(rot, verdi) {
  rot.querySelectorAll(".segment-del").forEach((knapp) => {
    if (knapp.dataset.verdi === verdi) knapp.setAttribute("aria-current", "true");
    else knapp.removeAttribute("aria-current");
  });
}

/* ---------- visning ---------- */

export async function visFotball(liga, del) {
  aktivLiga = liga;
  aktivDel = del;
  merk(document.getElementById("ligaVelger"), liga);
  merk(document.getElementById("fotballFaner"), del);

  const rot = document.getElementById("fotballInnhold");
  const nokkel = liga + "/" + del;
  const lagret = husket.get(nokkel);

  if (lagret && Date.now() - lagret.hentet < HUSKE_MS) {
    tegn(rot, del, lagret.data);
    return;
  }

  rot.replaceChildren(tilstand("Henter " + DEL_NAVN[del].toLowerCase() + " …"));

  try {
    const data = await hent(liga, del);
    // Rakk leseren a bytte fane mens vi hentet, skal ikke det gamle svaret
    // overskrive det nye.
    husket.set(nokkel, { data, hentet: Date.now() });
    if (aktivLiga !== liga || aktivDel !== del) return;
    tegn(rot, del, data);
  } catch (err) {
    if (aktivLiga !== liga || aktivDel !== del) return;
    console.error("[Sportsbibelen] fotball · " + nokkel + " feilet:", err);
    rot.replaceChildren(tilstand(err.message || "Klarte ikke å hente data."));
  }
}

async function hent(liga, del) {
  const respons = await fetch("/api/fotball/" + del + "?liga=" + encodeURIComponent(liga),
    { headers: { "Accept": "application/json" } });

  let data = null;
  try {
    data = JSON.parse(await respons.text());
  } catch (err) {
    throw new Error("Uventet svar fra tjenesten.");
  }

  // Funksjonen legger feilen i kroppen. Uten denne sjekken ville en tom
  // tabell sett ut som en liga uten kamper.
  if (!respons.ok || !data || data.feil) {
    throw new Error((data && data.feil) || "Tjenesten svarte " + respons.status + ".");
  }
  return data;
}

function tilstand(tekst) {
  const boks = el("div", "state");
  boks.appendChild(el("p", null, tekst));
  return boks;
}

function tegn(rot, del, data) {
  const deler = [];
  const sesong = sesongmerke(data);
  if (sesong) deler.push(sesong);
  if (del === "tabell") deler.push(tabell(data.tabell || []));
  else deler.push(kampliste(data.kamper || [], del, data));
  deler.push(stempel(data));
  rot.replaceChildren(...deler);
  rot.scrollTop = 0;
}

// Sist oppdatert star nederst og ikke i toppen: det er en fotnote om
// dataene, ikke en overskrift.
function stempel(data) {
  const rad = el("p", "fotball-stempel");
  const tid = data.oppdatert ? new Date(data.oppdatert) : null;
  const nar = tid && !Number.isNaN(tid.getTime()) ? timeAgo(tid) : "ukjent tid";
  rad.appendChild(el("span", null, "Oppdatert " + nar));
  rad.appendChild(el("span", "fotball-kilde", "API-Football"));
  return rad;
}

// Sesongen star over innholdet, ikke under: er tabellen fra en annen
// sesong enn den vi star i, ma det sta for man leser tallene — ikke etter.
function sesongmerke(data) {
  if (!data.sesong) return null;
  const rad = el("p", "fotball-sesong");
  rad.appendChild(el("span", null, "Sesong " + data.sesong));
  if (data.sisteSesong === false) {
    rad.appendChild(el("span", "fotball-gammel", "ikke inneværende"));
  }
  return rad;
}

/* ---------- tabell ---------- */

const KOLONNER = [
  ["#", "plass"], ["Lag", "lag"], ["K", "kamper"], ["V", "seier"],
  ["U", "uavgjort"], ["T", "tap"], ["MF", "differanse"], ["P", "poeng"],
];

function tabell(rader) {
  if (!rader.length) return tilstand("Ingen tabell tilgjengelig for denne sesongen.");

  // Alle atte kolonnene far plass pa en telefon med normal skrift. Med
  // storre skrift eller lange lagnavn gjor de ikke det, og da ruller
  // tabellen i sitt eget felt — aldri hele siden.
  const skall = el("div", "tabell-skall");
  const tab = el("table", "tabell");

  const hode = el("tr");
  KOLONNER.forEach(([navn, felt]) => {
    const celle = el("th", felt === "lag" ? "kol-lag" : null, navn);
    celle.scope = "col";
    hode.appendChild(celle);
  });
  const thead = el("thead");
  thead.appendChild(hode);
  tab.appendChild(thead);

  const kropp = el("tbody");
  rader.forEach((rad) => {
    const tr = el("tr");
    KOLONNER.forEach(([, felt]) => {
      if (felt === "lag") {
        const td = el("td", "kol-lag");
        td.scope = "row";
        // En knapp, ikke en klikkbar rad: den nas med tastatur, leses opp
        // som noe man kan trykke pa, og lar resten av raden markeres som
        // vanlig tekst.
        const knapp = el("button", "lag-knapp", rad.lag);
        knapp.type = "button";
        knapp.title = "Søk i nyhetene etter " + rad.lag;
        knapp.addEventListener("click", () => sokEtterLag(rad.lag));
        const celle = el("div", "lag-celle");
        celle.appendChild(knapp);
        celle.appendChild(stjerne(rad.lag));
        td.appendChild(celle);
        tr.appendChild(td);
        return;
      }
      const verdi = felt === "differanse" && rad.differanse > 0
        ? "+" + rad.differanse : String(rad[felt]);
      tr.appendChild(el("td", felt === "poeng" ? "kol-poeng" : null, verdi));
    });
    kropp.appendChild(tr);
  });
  tab.appendChild(kropp);
  skall.appendChild(tab);
  return skall;
}

// Stjernen velger laget som favoritt. En egen knapp ved siden av navnet,
// ikke en del av det: navnet soker, stjernen folger. aria-pressed, ikke
// aria-current — dette er en av/pa-bryter per lag, ikke et valg mellom
// lagene. Ingen tekst i knappen, sa lagnavnet i cellen star rent.
function stjerne(lag) {
  const knapp = el("button", "lag-stjerne");
  knapp.type = "button";
  knapp.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
    + '<path d="M10 1.8l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.8l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z"/></svg>';
  merkStjerne(knapp, lag, favoritter.er(lag));
  knapp.addEventListener("click", () => merkStjerne(knapp, lag, favoritter.veksle(lag)));
  return knapp;
}

function merkStjerne(knapp, lag, valgt) {
  knapp.setAttribute("aria-pressed", valgt ? "true" : "false");
  knapp.setAttribute("aria-label", (valgt ? "Slutt å følge " : "Følg ") + lag);
  knapp.title = valgt ? "Favorittlag — trykk for å fjerne" : "Sett som favorittlag";
}

/* ---------- kamper ---------- */

function kampliste(kamper, del, data) {
  if (!kamper.length) {
    return tilstand(tomtekst(del, data));
  }

  const liste = el("ul", "kamper");
  let forrigeDag = null;

  kamper.forEach((kamp) => {
    const dag = dagtekst(kamp.dato);
    if (dag !== forrigeDag) {
      forrigeDag = dag;
      const skille = el("li", "kamp-dag", dag);
      liste.appendChild(skille);
    }
    liste.appendChild(kamprad(kamp, del));
  });
  return liste;
}

// En ferdigspilt sesong har ingen neste runde, og det er noe annet enn at
// oppsettet ikke er klart. Sier vi det siste, ser det ut som en feil.
function tomtekst(del, data) {
  if (del === "resultater") return "Ingen spilte kamper enda.";
  if (data && data.sisteSesong === false) {
    return "Sesong " + data.sesong + " er ferdigspilt. Ingen flere kamper i denne.";
  }
  return "Ingen kamper er satt opp.";
}

function kamprad(kamp, del) {
  const rad = el("li", "kamp");
  rad.appendChild(el("span", "kamp-lag", kamp.hjemme));

  if (del === "resultater" && kamp.malHjemme !== null) {
    rad.appendChild(el("span", "kamp-tall", kamp.malHjemme + " – " + kamp.malBorte));
  } else {
    rad.appendChild(el("span", "kamp-tall", klokke(kamp.dato)));
  }

  rad.appendChild(el("span", "kamp-lag kamp-borte", kamp.borte));
  return rad;
}

// Datoene kommer som ISO med sone fra API-et. new Date tolker dem riktig,
// og toLocaleString gir leserens egen tid — ikke serverens.
function dagtekst(iso) {
  const dato = iso ? new Date(iso) : null;
  if (!dato || Number.isNaN(dato.getTime())) return "Ukjent dato";
  return dato.toLocaleDateString("nb-NO",
    { weekday: "long", day: "numeric", month: "short" });
}

function klokke(iso) {
  const dato = iso ? new Date(iso) : null;
  if (!dato || Number.isNaN(dato.getTime())) return "–";
  return dato.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
