// Fotballmodulen (beta): alt som rorer DOM.
//
// De rene funksjonene ligger i fotball-data.js og deles med
// Netlify-funksjonen, slik at formen pa dataene er definert ett sted.
//
// Modulen eier ikke ruting. Trykk pa en liga eller en fane gar tilbake til
// app.js gjennom naviger(), som setter adressen — da virker tilbakeknappen
// likt her som i resten av appen.

import { LIGAER, DELER, DEL_NAVN, HVOR, STED_MAKS, delingstekst,
         kamplenke, invitasjonstekst } from "./fotball-data.js";
import { tolkSvar, perKamp, blirMedTekst, egetSvar, gyldigNavn, normaliserNavn, NAVN_MAKS }
  from "./svar-data.js";
import { overpassSporring, tolkPuber, rundPosisjon, avstandtekst,
         OVERPASS_SPEIL, overpassHeadere, kuraterteNaer, merkKuraterte } from "./pub-data.js";
import { PUBER_OSLO } from "./puber-oslo.js";
import { VISNINGER } from "./visninger.js";
import { bekreftetFor, merkBekreftet } from "./visning-data.js";
import { arenaFor } from "./vaer-data.js";

// Kuraterte steder vi stoler pa. «usikker» vises ikke: et sted vi ikke
// tor sta inne for, er verre enn ett forslag faerre.
const KJENTE = PUBER_OSLO.filter((p) => p.sikkerhet !== "usikker");
const KJENT_RADIUS = 1500;
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
// Innlogging og navn eies ogsa av app.js: modulen sporr bare om okta og
// om navnet vennene ser.
let konto = { okt: () => null, navn: () => "", settNavn: () => {} };
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

export function initFotball(paNavigering, paLagsok, paFavoritt, paDeling, paPuber, paKonto) {
  naviger = paNavigering;
  if (paLagsok) sokEtterLag = paLagsok;
  if (paFavoritt) favoritter = paFavoritt;
  if (paDeling) deling = paDeling;
  if (paPuber) puber = paPuber;
  if (paKonto) konto = paKonto;

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

// invitasjon: kampen, svaret og stedet fra en delt lenke, tolket av
// app.js. Modulen eier ikke ruting og leser derfor ikke adressen selv.
export async function visFotball(liga, del, invitasjon) {
  aktivLiga = liga;
  aktivDel = del;
  merk(document.getElementById("ligaVelger"), liga);
  merk(document.getElementById("fotballFaner"), del);

  const rot = document.getElementById("fotballInnhold");
  const nokkel = liga + "/" + del;
  const lagret = husket.get(nokkel);

  if (lagret && Date.now() - lagret.hentet < HUSKE_MS) {
    tegn(rot, del, lagret.data);
    visInvitasjon(rot, del, lagret.data, invitasjon);
    hentSvar(rot, del, lagret.data);
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
    visInvitasjon(rot, del, data, invitasjon);
    hentSvar(rot, del, data);
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

// En knapp som ligger utstrakt over hele kamplinja. Raden kan ikke selv
// bli en <button>: den inneholder pubnavn-knappen, og en knapp i en
// knapp finnes ikke. Da er dette den ene maten a gjore hele linja
// trykkbar uten a miste tastaturet — ett mal per kamp, lest opp som
// lagene og sporsmalet.
function delKnapp(kamp, rad) {
  const knapp = el("button", "kamp-del");
  knapp.type = "button";
  knapp.setAttribute("aria-label", kamp.hjemme + " – " + kamp.borte + ". Hvor ser du kampen?");
  knapp.setAttribute("aria-expanded", "false");
  knapp.title = "Hvor ser du kampen? Del med vennene dine";
  knapp.addEventListener("click", () => {
    if (apentPanel && apentPanel.knapp === knapp) { lukkPanel(); return; }
    lukkPanel();
    rad.classList.add("valgt");
    // Vaeret hentes forst her. For sto det under hver eneste kamp i
    // runden, og ti kamper ble ti kall mot MET for leseren hadde trykket
    // pa noe — og raden vokste og hoppet mens den ble lest. Na gjelder
    // det den ene kampen man faktisk lurer pa. hentVaer husker per kamp,
    // sa a apne den samme igjen koster ingenting.
    if (kamp.arena) rad.appendChild(vaerlinje(kamp));
    const panel = delPanel(kamp);
    rad.appendChild(panel);
    knapp.setAttribute("aria-expanded", "true");
    apentPanel = { panel, knapp, rad };
    panel.querySelector(".hvor-valg").focus();
  });
  return knapp;
}

function lukkPanel() {
  if (!apentPanel) return;
  apentPanel.panel.remove();
  if (apentPanel.rad) {
    apentPanel.rad.classList.remove("valgt");
    const vaer = apentPanel.rad.querySelector(".kamp-vaer");
    if (vaer) vaer.remove();
  }
  apentPanel.knapp.setAttribute("aria-expanded", "false");
  apentPanel = null;
}

// Apner delingspanelet pa en rad med svaret ferdig valgt. To veier inn
// hit: linja som sier hvem som viser kampen, og invitasjonen fra en delt
// lenke. Begge har allerede svart «hvor» for leseren, og begge skal lande
// i det samme panelet — ellers finnes det to mater a dele pa.
function apnePanelMed(rad, hvor, sted) {
  const knapp = rad && rad.querySelector(".kamp-del");
  if (!knapp) return null;
  if (knapp.getAttribute("aria-expanded") !== "true") knapp.click();

  const panel = apentPanel && apentPanel.panel;
  if (!panel) return null;

  const valg = panel.querySelector(".hvor-valg[data-hvor=\"" + hvor + "\"]");
  if (valg) valg.click();
  if (hvor === "pub" && sted) {
    const felt = panel.querySelector(".kamp-pub");
    felt.value = sted;
    felt.dispatchEvent(new Event("input"));
  }
  return panel;
}

function delPanel(kamp) {
  const panel = el("div", "kamp-panel");
  panel.appendChild(el("p", "kamp-panel-tittel", "Hvor ser du kampen?"));

  let hvor = null;
  const valg = el("div", "hvor-liste");
  const pubFelt = el("input", "kamp-pub");
  pubFelt.type = "text";
  pubFelt.placeholder = "Hvilken pub?";
  pubFelt.setAttribute("aria-label", "Hvilken pub?");
  pubFelt.maxLength = STED_MAKS;
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
    // Lenka barer kampen, svaret og stedet: mottakeren skal lande pa
    // kampen det gjelder, ikke i en runde hen ma lete i.
    const url = location.origin + location.pathname +
      kamplenke(aktivLiga, kamp, hvor, pubFelt.value.trim());
    // Vaeret er hentet da raden ble apnet, og husket per kamp; er det ikke der,
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
  // To veier ut av det samme sporsmalet: si det til lista, eller si det
  // i chatten. Lista star forst fordi den er den som svarer tilbake.
  panel.appendChild(blirMedDel(kamp, () => hvor, () => pubFelt.value.trim()));
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
  // Kjente fotballpuber star over de andre og trenger ingenting fra
  // nettet: lista ligger i koden. Nar Overpass er nede, er dette det
  // eneste som fortsatt virker.
  // Aller forst: pubene som har sagt at de viser nettopp denne kampen.
  // Det er den eneste gruppa som svarer pa sporsmalet direkte — resten
  // er steder som pleier a vise fotball. Lista ligger i koden, sa den
  // star der uten et eneste nettkall.
  const bekreftede = bekreftetFor(kamp, VISNINGER, KJENTE);
  if (bekreftede.length) {
    const bek = pubGruppe("Viser denne kampen", bekreftede, boks.pubFelt);
    bek.classList.add("pub-gruppe-bekreftet");
    bek.appendChild(el("p", "pub-note", "Meldt inn til oss. Ring gjerne og hør før du drar."));
    boks.appendChild(bek);
  }

  const kjent = el("div", "pub-gruppe");
  boks.appendChild(kjent);

  const naer = el("div", "pub-gruppe");
  const knapp = el("button", "pub-naer", "Puber nær deg");
  knapp.type = "button";
  knapp.addEventListener("click", () => hentNaerDeg(naer, knapp, boks.pubFelt, kjent, bekreftede));
  naer.appendChild(knapp);
  naer.appendChild(el("p", "pub-note", "Posisjonen sendes til OpenStreetMap, ikke til oss."));
  boks.appendChild(naer);
  hentNaerDeg(naer, knapp, boks.pubFelt, kjent, bekreftede);

  const dine = puber.liste();
  if (dine.length) {
    boks.appendChild(pubGruppe("Dine puber",
      merkBekreftet(dine.map((p) => ({ navn: p.navn })), bekreftede), boks.pubFelt));
  }

  // Ved arenaen: ogsa uten nettverk, for de arenaene lista dekker.
  const arena = arenaFor(kamp.arena);
  if (arena) {
    const vedArena = kuraterteNaer(KJENTE, arena, KJENT_RADIUS);
    if (vedArena.length) {
      boks.appendChild(pubGruppe("Fotballpuber ved " + arena.navn,
        merkBekreftet(vedArena.slice(0, 5), bekreftede), boks.pubFelt));
    }
  }

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
      (data.grupper || []).forEach((g) =>
        rundt.appendChild(pubGruppe(g.tittel,
          merkBekreftet(merkKuraterte(g.puber, KJENTE), bekreftede), boks.pubFelt)));
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
    // Bekreftet star forst av merkene: det svarer pa kampen, ikke bare
    // pa stedet. Stjerna er merket for «denne kampen vises her», ballen
    // for «stedet pleier a vise fotball».
    if (p.bekreftet) {
      b.classList.add("bekreftet");
      const stjerne = el("span", "pub-bekreftet", "★");
      stjerne.setAttribute("aria-label", "viser denne kampen");
      b.appendChild(stjerne);
    }
    // Et sted vi vet viser fotball, blant treff vi bare vet er puber.
    if (p.viserFotball || p.sikkerhet) {
      const merke = el("span", "pub-merke", "⚽");
      merke.setAttribute("aria-label", "kjent for å vise fotball");
      b.appendChild(merke);
      const lag = (p.lag || []).join(", ");
      b.title = lag ? "Kjent for å vise fotball. Stampub for " + lag + "." : "Kjent for å vise fotball.";
    }
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

function hentNaerDeg(gruppe, knapp, pubFelt, kjentBoks, bekreftede) {
  if (!navigator.geolocation) { visPubFeil(gruppe, "Ingen posisjon tilgjengelig."); return; }
  knapp.disabled = true;
  knapp.textContent = "Finner puber …";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const p = rundPosisjon(pos.coords.latitude, pos.coords.longitude);
    // Kjente fotballpuber forst, og med en gang: lista ligger i koden,
    // sa denne star der ogsa nar Overpass ikke svarer.
    if (kjentBoks) {
      const naere = kuraterteNaer(KJENTE, p, KJENT_RADIUS);
      if (naere.length) {
        kjentBoks.replaceChildren();
        kjentBoks.appendChild(pubGruppe("Kjent for å vise fotball",
          merkBekreftet(naere.slice(0, 6), bekreftede), pubFelt));
      }
    }
    const nokkel = p.lat + "," + p.lon;
    try {
      if (!naerHusket.has(nokkel)) naerHusket.set(nokkel, naerePuber(p));
      const liste = (await naerHusket.get(nokkel)).slice(0, 6);
      knapp.remove();
      if (!liste.length) { visPubFeil(gruppe, "Fant ingen puber innen 800 m."); return; }
      gruppe.replaceChildren();
      gruppe.appendChild(pubGruppe("Nær deg", merkBekreftet(liste, bekreftede), pubFelt));
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

// Raden er en beholder, ikke et rutenett: rammen rundt den valgte kampen
// skal omslutte alt som horer til den — vaeret, puben og panelet. Selve
// kamplinja er rutenettet, og bare den dekkes av trykkflata.
function kamprad(kamp, del, delbar) {
  const rad = el("li", delbar ? "kamp delbar" : "kamp");
  // Id-en pa raden, sa en delt lenke finner igjen kampen sin i runden.
  if (kamp.id != null) rad.dataset.kamp = String(kamp.id);

  const linje = el("div", "kamp-linje");
  linje.appendChild(el("span", "kamp-lag", kamp.hjemme));

  if (del === "resultater" && kamp.malHjemme !== null) {
    linje.appendChild(el("span", "kamp-tall", kamp.malHjemme + " – " + kamp.malBorte));
  } else {
    linje.appendChild(el("span", "kamp-tall", klokke(kamp.dato)));
  }

  linje.appendChild(el("span", "kamp-lag kamp-borte", kamp.borte));
  if (delbar) {
    // Pilen er dekor na, ikke malet: den viser at raden kan apnes, og
    // hvilken vei den star. Trykkflata under er det man faktisk treffer.
    const pil = el("span", "kamp-pil", "›");
    pil.setAttribute("aria-hidden", "true");
    linje.appendChild(pil);
    linje.appendChild(delKnapp(kamp, rad));
  }
  rad.appendChild(linje);
  if (delbar) {
    const viser = viserlinje(kamp);
    if (viser) rad.appendChild(viser);
  }
  return rad;
}

// «Denne kampen vises på: Lincoln Pub» rett under kampen, ikke bare inne
// i delingspanelet: den som blar gjennom runden skal se det uten a apne
// noe. Navnet er en knapp som apner panelet med puben ferdig valgt —
// linja svarer pa sporsmalet og tar deg videre til a dele det.
function viserlinje(kamp) {
  const bekreftede = bekreftetFor(kamp, VISNINGER, KJENTE);
  if (!bekreftede.length) return null;
  const linje = el("div", "kamp-viser");
  const merke = el("span", "kamp-viser-merke", "★");
  merke.setAttribute("aria-hidden", "true");
  linje.appendChild(merke);
  linje.appendChild(el("span", "kamp-viser-tekst", "Denne kampen vises på: "));
  bekreftede.forEach((p, i) => {
    if (i) linje.appendChild(el("span", "kamp-viser-tekst", ", "));
    const knapp = el("button", "kamp-viser-pub", p.navn);
    knapp.type = "button";
    knapp.title = "Meldt inn til oss. Trykk for å dele at du ser kampen her.";
    knapp.addEventListener("click", (e) => {
      e.stopPropagation();
      apnePanelMed(knapp.closest(".kamp"), "pub", p.navn);
    });
    linje.appendChild(knapp);
  });
  return linje;
}

/* ---------- hvem blir med ---------- */

// Svaret delingslenka ba om. Teksten i chatten spurte «Hvor ser du?», og
// til na hadde det sporsmalet ingen vei tilbake til appen.
//
// Hele runden hentes i ett kall: ti kamper skal ikke bli ti kall. Lista
// star under kampen, sa den som blar ser den uten a apne noe — samme
// grunn som for «denne kampen vises pa».
let sisteSvar = [];

async function hentSvar(rot, del, data) {
  if (del !== "neste" || !data || !Array.isArray(data.kamper)) return;

  const ider = data.kamper.map((k) => k.id).filter((id) => id != null);
  if (!ider.length) return;

  try {
    const respons = await fetch("/api/svar?kamper=" + encodeURIComponent(ider.join(",")),
      { headers: { "Accept": "application/json" } });
    const json = JSON.parse(await respons.text());
    // Stille her, med vilje: lista er et tillegg til kampen, ikke kampen.
    // En feilmelding under hver eneste rad ville dekket over runden. Den
    // som faktisk trykker «Jeg blir med», far beskjed — det er der man
    // venter et svar.
    if (!respons.ok || json.feil) return;
    sisteSvar = tolkSvar(json.svar);
  } catch (err) {
    return;
  }
  tegnSvar(rot);
}

function tegnSvar(rot) {
  const kart = perKamp(sisteSvar);
  Array.from(rot.querySelectorAll(".kamp")).forEach((rad) => {
    const gammel = rad.querySelector(".kamp-blirmed");
    if (gammel) gammel.remove();

    const svar = kart.get(String(rad.dataset.kamp || "")) || [];
    const tekst = blirMedTekst(svar);
    if (!tekst) return;

    const linje = el("div", "kamp-blirmed");
    const merke = el("span", "kamp-blirmed-merke", "✓");
    merke.setAttribute("aria-hidden", "true");
    linje.appendChild(merke);
    linje.appendChild(el("span", null, tekst));

    // Linja horer til kampen, ikke til panelet: den skal sta over
    // panelet nar det er apent, sa rekkefolgen blir lik med og uten.
    const panel = rad.querySelector(".kamp-panel");
    if (panel) rad.insertBefore(linje, panel);
    else rad.appendChild(linje);
  });
}

async function svarTjeneste(kropp) {
  const respons = await fetch("/api/svar", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(kropp),
  });
  let json = null;
  try {
    json = JSON.parse(await respons.text());
  } catch (err) {
    throw new Error("Uventet svar fra tjenesten.");
  }
  if (!respons.ok || !json || json.feil) {
    throw new Error((json && json.feil) || "Tjenesten svarte " + respons.status + ".");
  }
  return json;
}

// Delen av panelet som svarer for deg selv. Utlogget star det hva som
// mangler og at resten virker uansett — innlogging er ikke en port inn i
// appen, bare veien til a stille seg pa lista.
function blirMedDel(kamp, lesHvor, lesSted) {
  const boks = el("div", "kamp-blirmed-valg");
  const okt = konto.okt();

  if (!okt) {
    boks.appendChild(el("p", "kamp-note",
      "Logg inn i menyen for å si at du blir med. Å dele kampen virker uansett."));
    return boks;
  }

  const navnFelt = el("input", "kamp-navn");
  navnFelt.type = "text";
  navnFelt.placeholder = "Navnet vennene ser";
  navnFelt.setAttribute("aria-label", "Navnet vennene ser");
  navnFelt.maxLength = NAVN_MAKS;
  navnFelt.value = konto.navn();

  const knapp = el("button", "kamp-blimed");
  knapp.type = "button";
  const svar = el("p", "kamp-svar");
  svar.setAttribute("aria-live", "polite");

  // Har du alt svart, er knappen en angreknapp. To knapper ville betydd
  // at man kan bli med to ganger.
  const tegnKnapp = () => {
    const mitt = egetSvar(sisteSvar.filter((s) => s.kampId === String(kamp.id)),
      okt.bruker);
    knapp.textContent = mitt ? "Jeg blir ikke med likevel" : "Jeg blir med";
    knapp.dataset.med = mitt ? "ja" : "nei";
    navnFelt.hidden = !!mitt;
    return mitt;
  };
  tegnKnapp();

  knapp.addEventListener("click", async () => {
    const mitt = knapp.dataset.med === "ja";
    const navn = normaliserNavn(navnFelt.value);
    if (!mitt && !gyldigNavn(navn)) {
      svar.textContent = "Skriv navnet vennene ser deg som.";
      navnFelt.focus();
      return;
    }

    knapp.disabled = true;
    try {
      if (mitt) {
        await svarTjeneste({ handling: "fjern", token: okt.token, kampId: kamp.id });
        sisteSvar = sisteSvar.filter(
          (s) => !(s.kampId === String(kamp.id) && s.bruker === okt.bruker));
        svar.textContent = "Du står ikke på lista lenger.";
      } else {
        konto.settNavn(navn);
        const json = await svarTjeneste({
          token: okt.token, kampId: kamp.id, navn,
          hvor: lesHvor(), sted: lesSted(),
        });
        const mine = tolkSvar(json.svar);
        sisteSvar = sisteSvar.filter(
          (s) => !(s.kampId === String(kamp.id) && s.bruker === okt.bruker)).concat(mine);
        svar.textContent = "Du står på lista.";
      }
      tegnKnapp();
      tegnSvar(document.getElementById("fotballInnhold"));
    } catch (err) {
      svar.textContent = err.message;
    } finally {
      knapp.disabled = false;
    }
  });

  boks.appendChild(navnFelt);
  boks.appendChild(knapp);
  // Lista kan leses uten konto, og da leses navnet ogsa av andre enn
  // vennegruppa. Det skal sta her, der navnet skrives — ikke i en
  // erklaering ingen apner.
  boks.appendChild(el("p", "kamp-note",
    "Navnet er synlig for alle som åpner kampen. Fornavn holder."));
  boks.appendChild(svar);
  return boks;
}

/* ---------- invitasjonen fra en delt lenke ---------- */

// Kom leseren hit fra en delt lenke, skal kampen det gjelder sta fram, og
// svaret vaere ett trykk unna. Uten dette lander mottakeren i runden og
// ma finne kampen selv — og da er delingen bare en lenke til appen.
//
// Finner vi ikke kampen, sier vi ingenting: runden star der som for. En
// feilmelding om en kamp som er spilt ferdig hjelper ingen.
function visInvitasjon(rot, del, data, invitasjon) {
  if (!invitasjon || del !== "neste") return;

  const kamp = ((data && data.kamper) || [])
    .find((k) => String(k.id) === String(invitasjon.kampId));
  if (!kamp) return;

  const rad = Array.from(rot.querySelectorAll(".kamp"))
    .find((r) => r.dataset.kamp === String(kamp.id));
  if (!rad) return;

  rad.classList.add("kamp-invitert");

  const linje = el("div", "kamp-invitasjon");
  linje.appendChild(el("span", "kamp-invitasjon-tekst",
    invitasjonstekst(kamp, invitasjon.hvor, invitasjon.sted)));

  // Svaret starter der avsenderen er: a bli med er det vanligste svaret,
  // og det skal koste ett trykk. Et annet sted velges i panelet som for.
  if (rad.querySelector(".kamp-del")) {
    const svar = el("button", "kamp-invitasjon-svar", "Svar");
    svar.type = "button";
    svar.title = "Si hvor du ser kampen";
    svar.addEventListener("click",
      () => apnePanelMed(rad, invitasjon.hvor || "pub", invitasjon.sted));
    linje.appendChild(svar);
  }
  rad.appendChild(linje);

  // En runde er ti kamper lang. Den delte skal vaere den man ser.
  if (rad.scrollIntoView) rad.scrollIntoView({ block: "center" });
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
