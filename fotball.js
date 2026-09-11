// Fotballmodulen (beta): alt som rorer DOM.
//
// De rene funksjonene ligger i fotball-data.js og deles med
// Netlify-funksjonen, slik at formen pa dataene er definert ett sted.
//
// Modulen eier ikke ruting. Trykk pa en liga eller en fane gar tilbake til
// app.js gjennom naviger(), som setter adressen — da virker tilbakeknappen
// likt her som i resten av appen.

import { LIGAER, DELER, DEL_NAVN, HVOR, delingstekst, fotballHash } from "./fotball-data.js";
import { overpassSporring, tolkPuber, rundPosisjon, avstandtekst,
         OVERPASS_SPEIL, overpassHeadere } from "./pub-data.js";
import { timeAgo } from "./lib.js";

let naviger = () => {};
let sokEtterLag = () => {};
// Favorittlag eies av app.js (det er lagring). Modulen far bare to
// sporsmal: er dette laget valgt, og bytt.
let favoritter = { er: () => false, veksle: () => false };
// Deling eies ogsa av app.js: samme delingsmeny og samme utklippstavle-
// fallback som «Del appen». Svarer med hva som skjedde.
let deling = async () => "feil";
// Dine puber eies av app.js (det er lagring): lista, og noter en brukt.
let puber = { liste: () => [], noter: () => {} };
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

export function initFotball(paNavigering, paLagsok, paFavoritt, paDeling, paPuber) {
  naviger = paNavigering;
  if (paLagsok) sokEtterLag = paLagsok;
  if (paFavoritt) favoritter = paFavoritt;
  if (paDeling) deling = paDeling;
  if (paPuber) puber = paPuber;

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
  rad.appendChild(el("span", "fotball-kilde", data.kilde || "API-Football"));
  // METs lisens krever kreditering der dataene vises.
  if (data.del === "neste" && data.sisteSesong !== false) {
    rad.appendChild(el("span", "fotball-kilde", "Vær: MET Norway"));
  }
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

  // Deling gjelder kamper som faktisk skal spilles. En runde fra i fjor
  // er ingenting a avtale rundt.
  const delbar = del === "neste" && data && data.sisteSesong !== false;

  const liste = el("ul", "kamper");
  let forrigeDag = null;

  kamper.forEach((kamp) => {
    const dag = dagtekst(kamp.dato);
    if (dag !== forrigeDag) {
      forrigeDag = dag;
      const skille = el("li", "kamp-dag", dag);
      liste.appendChild(skille);
    }
    liste.appendChild(kamprad(kamp, del, delbar));
  });

  if (del === "neste" && !delbar) {
    liste.appendChild(el("li", "kamp-notis",
      "Deling av kamper kommer når terminlisten for i år er på plass."));
  }
  return liste;
}

/* ---------- deling: hvor ser du kampen? ---------- */

// Ett panel om gangen. Apnes et nytt, lukkes det forrige — listen skal
// ikke fylles med halvferdige valg.
let apentPanel = null;

function delKnapp(kamp, rad) {
  const knapp = el("button", "kamp-del");
  knapp.type = "button";
  knapp.setAttribute("aria-label", "Del kampen " + kamp.hjemme + " – " + kamp.borte);
  knapp.setAttribute("aria-expanded", "false");
  knapp.title = "Hvor ser du kampen? Del med vennene dine";
  knapp.appendChild(el("span", null, "↗"));
  knapp.addEventListener("click", () => {
    if (apentPanel && apentPanel.knapp === knapp) { lukkPanel(); return; }
    lukkPanel();
    const panel = delPanel(kamp);
    rad.insertAdjacentElement("afterend", panel);
    knapp.setAttribute("aria-expanded", "true");
    apentPanel = { panel, knapp };
    panel.querySelector(".hvor-valg").focus();
  });
  return knapp;
}

function lukkPanel() {
  if (!apentPanel) return;
  apentPanel.panel.remove();
  apentPanel.knapp.setAttribute("aria-expanded", "false");
  apentPanel = null;
}

function delPanel(kamp) {
  const panel = el("li", "kamp-panel");
  panel.appendChild(el("p", "kamp-panel-tittel", "Hvor ser du kampen?"));

  let hvor = null;
  const valg = el("div", "hvor-liste");
  const pubFelt = el("input", "kamp-pub");
  pubFelt.type = "text";
  pubFelt.placeholder = "Hvilken pub?";
  pubFelt.setAttribute("aria-label", "Hvilken pub?");
  pubFelt.maxLength = 60;
  pubFelt.hidden = true;
  const forslag = pubForslag(kamp, pubFelt);
  forslag.hidden = true;
  const send = el("button", "kamp-send", "Del");
  send.type = "button";
  send.disabled = true;
  const svar = el("p", "kamp-svar");
  svar.setAttribute("aria-live", "polite");

  // Stadion far navnet sitt nar vi har det: «på Lerkendal» sier mer enn
  // «på stadion».
  const navn = { hjemme: "Hjemme", pub: "På pub",
                 stadion: kamp.arena ? "På " + kamp.arena : "På stadion" };
  Object.keys(HVOR).forEach((nokkel) => {
    const b = el("button", "hvor-valg", navn[nokkel]);
    b.type = "button";
    b.dataset.hvor = nokkel;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      hvor = nokkel;
      valg.querySelectorAll(".hvor-valg").forEach((k) =>
        k.setAttribute("aria-pressed", k === b ? "true" : "false"));
      pubFelt.hidden = nokkel !== "pub";
      forslag.hidden = nokkel !== "pub";
      if (nokkel === "pub") { fyllForslag(forslag, kamp); pubFelt.focus(); }
      send.disabled = false;
      svar.textContent = "";
    });
    valg.appendChild(b);
  });

  send.addEventListener("click", async () => {
    if (!hvor) return;
    const url = location.origin + location.pathname + fotballHash(aktivLiga, "neste");
    // Vaeret er allerede hentet for linja under kampen; er det ikke der,
    // deles teksten uten. Ingen skal vente pa MET for a sende en melding.
    const vaer = kamp.arena ? await hentVaer(kamp) : null;
    const tekst = delingstekst(kamp, hvor, pubFelt.value.trim(), url, vaer && vaer.tekst);
    send.disabled = true;
    const utfall = await deling(tekst, url);
    send.disabled = false;
    if (utfall === "delt" || utfall === "kopiert") {
      // En delt pub er en pub leseren bruker. Neste gang star den forst.
      if (hvor === "pub" && pubFelt.value.trim()) puber.noter(pubFelt.value.trim());
    }
    if (utfall === "delt") { lukkPanel(); return; }
    if (utfall === "kopiert") svar.textContent = "Kopiert. Lim inn i chatten.";
    else if (utfall !== "avbrutt") svar.textContent = "Fikk ikke delt. Kopier teksten selv: " + tekst;
  });

  panel.appendChild(valg);
  panel.appendChild(forslag);
  panel.appendChild(pubFelt);
  panel.appendChild(send);
  panel.appendChild(svar);
  return panel;
}

/* ---------- pubforslag ---------- */

// Fire svar pa «hvilken pub?»: dine, naer deg, ved stadion, ved
// holdeplassen. Alle er knapper som fyller feltet — feltet er fortsatt
// sannheten, sa en pub som ikke star i lista kan skrives.
const puberHusket = new Map();

function pubForslag(kamp, pubFelt) {
  const boks = el("div", "pub-forslag");
  boks.dataset.arena = kamp.arena || "";
  boks.pubFelt = pubFelt;
  return boks;
}

function fyllForslag(boks, kamp) {
  if (boks.dataset.fylt) return;
  boks.dataset.fylt = "1";
  boks.replaceChildren();

  // Naer deg forst, og hentet med en gang: kampen spilles ofte et annet
  // sted enn der man ser den. Posisjonen gar rett til OpenStreetMap og
  // aldri innom oss, og den rundes til rundt hundre meter forst.
  // Trykket som valgte «pa pub» er handlingen telefonen krever for a
  // sporre om posisjon, sa den kan hentes na framfor etter et trykk til.
  const naer = el("div", "pub-gruppe");
  const knapp = el("button", "pub-naer", "Puber nær deg");
  knapp.type = "button";
  knapp.addEventListener("click", () => hentNaerDeg(naer, knapp, boks.pubFelt));
  naer.appendChild(knapp);
  naer.appendChild(el("p", "pub-note", "Posisjonen sendes til OpenStreetMap, ikke til oss."));
  boks.appendChild(naer);
  hentNaerDeg(naer, knapp, boks.pubFelt);

  const dine = puber.liste();
  if (dine.length) boks.appendChild(pubGruppe("Dine puber", dine.map((p) => ({ navn: p.navn })), boks.pubFelt));

  const rundt = el("div", "pub-rundt");
  boks.appendChild(rundt);
  if (kamp.arena) {
    // Aldri stille: star det ingenting her, skal det sta hvorfor — og
    // hvem som sviktet, sa det kan meldes videre uten a grave i logger.
    rundt.appendChild(el("p", "pub-note pub-venter", "Finner puber ved " + kamp.arena + " …"));
    hentPuberRundt(kamp.arena).then((data) => {
      rundt.replaceChildren();
      if (!data || data.feil) {
        rundt.appendChild(el("p", "pub-note pub-feil",
          "Fikk ikke hentet puber ved " + kamp.arena + hvemSviktet(data) + ". Skriv puben selv."));
        return;
      }
      (data.grupper || []).forEach((g) => rundt.appendChild(pubGruppe(g.tittel, g.puber, boks.pubFelt)));
      if (data.grupper && data.grupper.length) {
        rundt.appendChild(el("p", "pub-note", "© OpenStreetMap-bidragsytere"));
      } else {
        rundt.appendChild(el("p", "pub-note", "Fant ingen puber i nærheten av " + kamp.arena + "."));
      }
    });
  }
}

// «(overpass-api.de svarte 406)» — nok til a se hva som feiler, uten a
// apne funksjonsloggen.
function hvemSviktet(data) {
  const liste = (data && data.forsok) || [];
  const sist = liste.filter((f) => f && f.utfall).pop();
  if (!sist) return "";
  const navn = String(sist.kilde || "").replace(/^Overpass /, "");
  return " (" + navn + (sist.status ? " svarte " + sist.status : ": " + sist.utfall) + ")";
}

function pubGruppe(tittel, liste, pubFelt) {
  const gruppe = el("div", "pub-gruppe");
  gruppe.appendChild(el("p", "pub-gruppe-tittel", tittel));
  const rad = el("div", "pub-liste");
  liste.forEach((p) => {
    const b = el("button", "pub-chip");
    b.type = "button";
    b.appendChild(el("span", null, p.navn));
    if (Number.isFinite(p.avstand)) b.appendChild(el("span", "pub-avstand", avstandtekst(p.avstand)));
    b.addEventListener("click", () => {
      pubFelt.value = p.navn;
      pubFelt.dispatchEvent(new Event("input"));
      // Markerer valget der det ble gjort, og bare der.
      gruppe.closest(".pub-forslag").querySelectorAll(".pub-chip").forEach((k) =>
        k.setAttribute("aria-pressed", k === b ? "true" : "false"));
    });
    b.setAttribute("aria-pressed", "false");
    rad.appendChild(b);
  });
  gruppe.appendChild(rad);
  return gruppe;
}

// Svarer alltid med det funksjonen sa, ogsa nar det er en feil: da star
// forsok-lista der, og visningen kan si hvem som sviktet.
async function hentPuberRundt(arena) {
  if (puberHusket.has(arena)) return puberHusket.get(arena);
  const lofte = (async () => {
    try {
      const respons = await fetch("/api/puber?arena=" + encodeURIComponent(arena),
        { headers: { "Accept": "application/json" } });
      const tekst = await respons.text();
      try {
        return JSON.parse(tekst);
      } catch (err) {
        // Ikke vart svar: da har Netlify avbrutt funksjonen, og vi far
        // deres feilside. Si det, framfor a gjette pa en parsefeil.
        return { feil: "tjenesten svarte " + respons.status,
                 forsok: [{ kilde: "puber", status: respons.status, utfall: "ikke vart svar" }] };
      }
    } catch (err) {
      return { feil: String(err && err.message || err) };
    }
  })();
  puberHusket.set(arena, lofte);
  return lofte;
}

// Overpass rett fra nettleseren, med posisjonen rundet. Svaret husket per
// posisjon sa et nytt trykk ikke koster et nytt kall.
const naerHusket = new Map();

function hentNaerDeg(gruppe, knapp, pubFelt) {
  if (!navigator.geolocation) { visPubFeil(gruppe, "Ingen posisjon tilgjengelig."); return; }
  knapp.disabled = true;
  knapp.textContent = "Finner puber …";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const p = rundPosisjon(pos.coords.latitude, pos.coords.longitude);
    const nokkel = p.lat + "," + p.lon;
    try {
      if (!naerHusket.has(nokkel)) naerHusket.set(nokkel, naerePuber(p));
      const liste = (await naerHusket.get(nokkel)).slice(0, 6);
      knapp.remove();
      if (!liste.length) { visPubFeil(gruppe, "Fant ingen puber innen 800 m."); return; }
      gruppe.replaceChildren();
      gruppe.appendChild(pubGruppe("Nær deg", liste, pubFelt));
      gruppe.appendChild(el("p", "pub-note", "© OpenStreetMap-bidragsytere"));
    } catch (err) {
      naerHusket.delete(nokkel);
      knapp.disabled = false;
      knapp.textContent = "Puber nær deg";
      visPubFeil(gruppe, "Fikk ikke svar fra OpenStreetMap (" +
        String(err && err.message || err).slice(0, 40) + "). Prøv igjen.");
    }
  }, () => {
    knapp.disabled = false;
    knapp.textContent = "Puber nær deg";
    visPubFeil(gruppe, "Fikk ikke posisjonen. Skriv puben selv.");
  }, { maximumAge: 300000, timeout: 10000 });
}

// Samme tjenere som funksjonen bruker, og de sporres samtidig: den
// forste som svarer vinner, resten avbrytes. Etter tur ble summen av
// trege tjenere lengre enn noen gidder a vente. Posisjonen gar rett
// herfra, aldri innom oss.
async function naerePuber(p) {
  const styring = typeof AbortController === "function" ? new AbortController() : null;
  const vakt = setTimeout(() => styring && styring.abort(), 8000);
  const kropp = "data=" + encodeURIComponent(overpassSporring(p.lat, p.lon, 800));
  const alle = OVERPASS_SPEIL.map((adresse) => (async () => {
    const respons = await fetch(adresse, {
      method: "POST",
      headers: overpassHeadere(false),
      body: kropp,
      signal: styring ? styring.signal : undefined,
    });
    if (!respons.ok) throw new Error(new URL(adresse).host + " svarte " + respons.status);
    return tolkPuber(await respons.json(), p);
  })());
  try {
    return await Promise.any(alle);
  } catch (err) {
    // AggregateError: ta den forste grunnen, den sier nok.
    const grunn = err && err.errors && err.errors[0];
    throw grunn || err;
  } finally {
    clearTimeout(vakt);
    if (styring) styring.abort();
  }
}

function visPubFeil(gruppe, tekst) {
  let note = gruppe.querySelector(".pub-feil");
  if (!note) { note = el("p", "pub-note pub-feil"); gruppe.appendChild(note); }
  note.textContent = tekst;
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

function kamprad(kamp, del, delbar) {
  const rad = el("li", delbar ? "kamp delbar" : "kamp");
  rad.appendChild(el("span", "kamp-lag", kamp.hjemme));

  if (del === "resultater" && kamp.malHjemme !== null) {
    rad.appendChild(el("span", "kamp-tall", kamp.malHjemme + " – " + kamp.malBorte));
  } else {
    rad.appendChild(el("span", "kamp-tall", klokke(kamp.dato)));
  }

  rad.appendChild(el("span", "kamp-lag kamp-borte", kamp.borte));
  if (delbar) {
    rad.appendChild(delKnapp(kamp, rad));
    if (kamp.arena) rad.appendChild(vaerlinje(kamp));
  }
  return rad;
}

/* ---------- vaeret ved avspark ---------- */

// Hentet per kamp, husket per kamp: et fanebytte skal ikke koste nye
// kall. Kanten cacher uansett, men leseren skal slippe a se «henter».
const vaerHusket = new Map();

function vaerlinje(kamp) {
  const linje = el("div", "kamp-vaer");
  linje.hidden = true;
  hentVaer(kamp).then((v) => {
    if (!v || !v.tekst) { linje.remove(); return; }
    linje.textContent = v.tekst;
    linje.title = "Varsel for " + v.arena + " ved avspark. Basert på data fra MET Norway.";
    linje.hidden = false;
  });
  return linje;
}

async function hentVaer(kamp) {
  const nokkel = kamp.id + "@" + kamp.dato;
  if (vaerHusket.has(nokkel)) return vaerHusket.get(nokkel);
  const lofte = (async () => {
    try {
      const respons = await fetch("/api/vaer?arena=" + encodeURIComponent(kamp.arena) +
        "&naar=" + encodeURIComponent(kamp.dato), { headers: { "Accept": "application/json" } });
      if (!respons.ok) return null;
      const data = JSON.parse(await respons.text());
      return data && !data.feil ? data : null;
    } catch (err) {
      return null;
    }
  })();
  vaerHusket.set(nokkel, lofte);
  return lofte;
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
