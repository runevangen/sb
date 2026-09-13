// Fotballmodulen (beta): alt som rorer DOM.
//
// De rene funksjonene ligger i fotball-data.js og deles med
// Netlify-funksjonen, slik at formen pa dataene er definert ett sted.
//
// Modulen eier ikke ruting. Trykk pa en liga eller en fane gar tilbake til
// app.js gjennom naviger(), som setter adressen — da virker tilbakeknappen
// likt her som i resten av appen.

import { LIGAER, DELER, FANER, DEL_NAVN, HVOR, STED_MAKS, delingstekst,
         kamplenke, invitasjonstekst, normaliserLagnavn } from "./fotball-data.js";
import { tolkSvar, perKamp, blirMedTekst, egetSvar, gyldigNavn, normaliserNavn,
         loftMedSvar, bareMedSvar, NAVN_MAKS } from "./svar-data.js";
import { overpassSporring, tolkPuber, rundPosisjon, avstandtekst,
         OVERPASS_SPEIL, overpassHeadere, kuraterteNaer, merkKuraterte,
         rangerForslag, FORSLAG_MAKS } from "./pub-data.js";
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
  FANER.forEach((del) => {
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

  // Vennefanen svarer pa tvers av ligaer, sa den har ingen liga og
  // ingen egen henting — den slar sammen de andre.
  if (del === "venner") return visVenner(rot);

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

/* ---------- vennene ---------- */

// Kampene noen har sagt at de blir med pa, pa tvers av ligaer.
//
// Loftingen i Neste runde svarer innenfor én liga. Star Ola pa en
// Premier League-kamp og Kari pa en eliteseriekamp, ser du dem bare ved
// a bytte fane — og det er nettopp det denne fanen finnes for.
//
// «Venner» er alle som er logget inn og har svart. Det star i teksten
// under lista, for navnet lover mer enn det holder til faste
// vennegrupper finnes (#71).
async function visVenner(rot) {
  rot.replaceChildren(tilstand("Ser hvem som blir med …"));

  let runder;
  try {
    // Ligaenes neste runder, samtidig. Svarene caches pa Netlifys kant,
    // sa dette koster ikke et nytt kall mot API-Football per apning —
    // dognkvoten er hundre.
    runder = await Promise.all(Object.keys(LIGAER).map((liga) =>
      hent(liga, "neste").catch(() => null)));
  } catch (err) {
    rot.replaceChildren(tilstand("Klarte ikke å hente kampene."));
    return;
  }
  if (aktivDel !== "venner") return;

  const kamper = [];
  runder.forEach((data) => {
    if (data && Array.isArray(data.kamper)) data.kamper.forEach((k) => kamper.push(k));
  });

  if (!kamper.length) {
    rot.replaceChildren(tilstand("Fant ingen kommende kamper."));
    return;
  }

  // Hvem som blir med, i ett kall for alle ligaene samlet.
  let svar = [];
  try {
    const ider = kamper.map((k) => k.id).filter((id) => id != null);
    const respons = await fetch("/api/svar?kamper=" + encodeURIComponent(ider.join(",")),
      { headers: { "Accept": "application/json" } });
    const json = JSON.parse(await respons.text());
    if (respons.ok && !json.feil) svar = tolkSvar(json.svar);
  } catch (err) {
    // Stille: lista er et tillegg til kampene, ikke kampene.
  }
  if (aktivDel !== "venner") return;

  sisteSvar = svar;
  const med = bareMedSvar(kamper, perKamp(svar));

  if (!med.length) {
    // Tom til noen svarer — og da er nettopp den lista hele poenget. Da
    // skal det sta hva som skal til, ikke bare at det er tomt.
    rot.replaceChildren(tilstand(
      "Ingen har sagt at de blir med ennå. Åpne en kamp under Neste runde"
      + " og si hvor du ser den, så står den her."));
    return;
  }

  rot.replaceChildren(kampliste(med, "neste", { sisteSesong: true }));
  rot.appendChild(el("p", "fotball-stempel",
    "Alle som er logget inn og har svart. Faste vennegrupper kommer."));
  tegnSvar(rot);
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
    const rad = kamprad(kamp, del, delbar);
    // Dagen huskes pa raden: blir lista delt i to bolker senere, ma
    // dagskillene kunne tegnes pa nytt uten a regne dem ut igjen.
    rad.dataset.dag = dag;
    liste.appendChild(rad);
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
    tegnPanelListe(kamp);
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
  // En erklaering, ikke et sporsmal: det du gjor her er a si at du skal
  // se den, og hvor. Sporsmalsformen ga to likestilte knapper nederst —
  // «Del» og «Jeg blir med» — som konkurrerte om a vaere handlingen.
  panel.appendChild(el("p", "kamp-panel-tittel", "Jeg skal se den"));

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
  // Delingen er ikke lenger hovedsaken: den sender beskjeden til
  // gruppechatten, mens lista i appen er det vennene ser nar de apner
  // kampen. Derfor en tekstknapp under, ikke en fylt knapp ved siden av.
  const send = el("button", "kamp-send", "Del i chatten");
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
      const blirMed = panel.querySelector(".kamp-blirmed-valg");
      if (blirMed && blirMed.tegnKnapp) blirMed.tegnKnapp();
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
  // Hovedhandlingen: si at du skal dit. Den star rett under stedet du
  // valgte, ikke nederst etter alle forslagene.
  panel.appendChild(blirMedDel(kamp, () => hvor, () => pubFelt.value.trim()));
  // Og her ser du at det virket: de samme navnene vennene dine ser nar
  // de apner kampen. Uten dette maa man lukke panelet for a se lista.
  panel.appendChild(el("div", "kamp-panel-liste"));
  panel.appendChild(send);
  panel.appendChild(svar);
  return panel;
}

/* ---------- pubforslag ---------- */

// Ett sporsmal — «hvilken pub?» — og ett svar: en rangert liste.
//
// For sto forslagene i seks grupper med hver sin overskrift: «Viser
// denne kampen», «Kjent for a vise fotball», «Naer deg», «Dine puber»,
// «Fotballpuber ved <arena>», «Ved stadion», «Ved holdeplassen». Det var
// ikke apenhet, det var stoy — samme pub sto i tre av dem, og den ene
// gruppa som faktisk svarte pa kampen druknet i resten. Rangeringen
// ligger na i `rangerForslag()` i pub-data.js, og merkene ★ og ⚽ barer
// det overskriftene sa, uten a koste en linje.
//
// Kildene lander til ulik tid — posisjon, kart, arena. Hver legger seg i
// `boks.kilder` og ber om en ny tegning, sa det er ett sted som
// bestemmer hva som star pa skjermen. For oppdaterte fem grupper seg
// selv, hver for seg.
const puberHusket = new Map();

function pubForslag(kamp, pubFelt) {
  const boks = el("div", "pub-forslag");
  boks.dataset.arena = kamp.arena || "";
  boks.pubFelt = pubFelt;
  boks.kilder = {};
  // Hvor mange kilder som fortsatt er underveis. Venter noe, er det for
  // tidlig a si at ingenting finnes.
  boks.venter = 0;
  boks.alt = false;
  // Flere kilder kan svikte hver for seg, og de sviktet av ulik grunn.
  // Én linje, men den navngir begge: det er dette som gjor at en feil kan
  // meldes videre uten a grave i funksjonsloggen.
  boks.feil = [];
  boks.kart = false;
  boks.proveNaer = false;
  return boks;
}

function fyllForslag(boks, kamp) {
  if (boks.dataset.fylt) return;
  boks.dataset.fylt = "1";

  // Pubene som har meldt at de viser nettopp denne kampen. Den eneste
  // kilden som svarer pa kampen framfor pa stedet — derfor forst.
  const bekreftede = bekreftetFor(kamp, VISNINGER, KJENTE);
  boks.kilder.bekreftede = bekreftede;
  // Huskes sa et nytt forsok pa posisjon kan merke treffene likt.
  boks.bekreftede = bekreftede;

  // Dine puber og de kjente ved arenaen ligger i koden: de star der uten
  // et eneste nettkall, ogsa nar Overpass er nede.
  boks.kilder.dine = merkBekreftet(
    puber.liste().map((p) => ({ navn: p.navn })), bekreftede);

  const arena = arenaFor(kamp.arena);
  if (arena) {
    boks.kilder.kjenteVedArena = merkBekreftet(
      kuraterteNaer(KJENTE, arena, KJENT_RADIUS), bekreftede);
  }

  tegnForslag(boks);

  // Naer deg hentes med en gang: kampen spilles ofte et annet sted enn
  // der man ser den. Trykket som valgte «pa pub» er handlingen telefonen
  // krever for a sporre om posisjon, sa den kan hentes na framfor etter
  // et trykk til.
  hentNaerDeg(boks, bekreftede);

  if (kamp.arena) {
    boks.venter += 1;
    hentPuberRundt(kamp.arena).then((data) => {
      boks.venter -= 1;
      if (!data || data.feil) {
        // Aldri stille: star det ingenting, skal det sta hvem som
        // sviktet, sa det kan meldes videre uten a grave i logger.
        boks.feil.push("Fikk ikke puber ved " + kamp.arena + hvemSviktet(data) + ".");
      } else {
        const flate = [];
        (data.grupper || []).forEach((g) => (g.puber || []).forEach((pub) => flate.push(pub)));
        boks.kilder.vedArena = merkBekreftet(merkKuraterte(flate, KJENTE), bekreftede);
        if (flate.length) boks.kart = true;
      }
      tegnForslag(boks);
    });
  }
}

// Ett sted som bestemmer hva som star pa skjermen.
function tegnForslag(boks) {
  const valgt = boks.pubFelt ? normaliserLagnavn(boks.pubFelt.value || "") : "";
  const { topp, resten } = rangerForslag(boks.kilder, boks.alt ? 0 : FORSLAG_MAKS);
  boks.replaceChildren();

  if (topp.length) {
    const rad = el("div", "pub-liste");
    topp.forEach((pub) => rad.appendChild(pubChip(pub, boks, valgt)));
    boks.appendChild(rad);
  }

  boks.appendChild(el("p", "pub-note", notetekst(boks, topp)));

  // Veien tilbake nar posisjonen ble avslatt eller kartet sviktet. Den
  // sto for alltid der; na star den bare nar den har noe a gjore — det
  // var en av de seks tingene som fylte panelet.
  if (boks.proveNaer) {
    const igjen = el("button", "pub-naer", "Puber nær deg");
    igjen.type = "button";
    igjen.addEventListener("click", () => {
      boks.proveNaer = false;
      hentNaerDeg(boks, boks.bekreftede || []);
      tegnForslag(boks);
    });
    boks.appendChild(igjen);
  }

  // Ingenting forsvinner: resten ligger ett trykk unna.
  if (resten.length) {
    const mer = el("button", "pub-mer", "Flere forslag (" + resten.length + ")");
    mer.type = "button";
    mer.addEventListener("click", () => { boks.alt = true; tegnForslag(boks); });
    boks.appendChild(mer);
  }
}

// Én linje, aldri flere. Venter en kilde fortsatt, er det for tidlig a
// si at ingenting finnes; er alt tomt og ingenting venter, star det
// hvorfor. Tre «fant ingen»-linjer, en per kilde, var det som gjorde
// panelet uleselig.
function notetekst(boks, topp) {
  const feil = boks.feil.join(" ");
  if (!topp.length) {
    if (boks.venter > 0) return "Finner puber …";
    return feil || "Fant ingen puber i nærheten. Skriv navnet selv.";
  }
  // Lisensen (ODbL) krever kreditering der treff fra kartet vises.
  const kreditt = boks.kart ? "© OpenStreetMap-bidragsytere. " : "";
  return kreditt + (feil || "Står ikke puben her, skriv den selv.");
}

function pubChip(pub, boks, valgt) {
  const b = el("button", "pub-chip");
  b.type = "button";
  b.appendChild(el("span", null, pub.navn));

  // Bekreftet star forst av merkene: det svarer pa kampen, ikke bare pa
  // stedet. Stjerna er «denne kampen vises her», ballen «stedet pleier a
  // vise fotball».
  if (pub.bekreftet) {
    b.classList.add("bekreftet");
    const stjerne = el("span", "pub-bekreftet", "★");
    stjerne.setAttribute("aria-label", "viser denne kampen");
    b.appendChild(stjerne);
  }
  if (pub.viserFotball || pub.sikkerhet) {
    const merke = el("span", "pub-merke", "⚽");
    merke.setAttribute("aria-label", "kjent for å vise fotball");
    b.appendChild(merke);
    const lag = (pub.lag || []).join(", ");
    b.title = lag ? "Kjent for å vise fotball. Stampub for " + lag + "." : "Kjent for å vise fotball.";
  }
  if (Number.isFinite(pub.avstand)) {
    b.appendChild(el("span", "pub-avstand", avstandtekst(pub.avstand)));
  }

  b.setAttribute("aria-pressed",
    valgt && normaliserLagnavn(pub.navn) === valgt ? "true" : "false");
  b.addEventListener("click", () => {
    boks.pubFelt.value = pub.navn;
    boks.pubFelt.dispatchEvent(new Event("input"));
    boks.querySelectorAll(".pub-chip").forEach((k) =>
      k.setAttribute("aria-pressed", k === b ? "true" : "false"));
  });
  return b;
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

// Overpass rett fra nettleseren, med posisjonen rundet til rundt hundre
// meter. Posisjonen gar aldri innom oss. Svaret huskes per posisjon, sa
// et nytt trykk ikke koster et nytt kall.
const naerHusket = new Map();

function hentNaerDeg(boks, bekreftede) {
  if (!navigator.geolocation) return;
  boks.venter += 1;

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const p = rundPosisjon(pos.coords.latitude, pos.coords.longitude);

    // Kjente fotballpuber naer deg star der med en gang: lista ligger i
    // koden, sa den virker ogsa nar Overpass ikke svarer. Det er verdt
    // mye her, der Overpass har vaert det skjoreste leddet.
    boks.kilder.kjenteNaer = merkBekreftet(
      kuraterteNaer(KJENTE, p, KJENT_RADIUS), bekreftede);
    tegnForslag(boks);

    const nokkel = p.lat + "," + p.lon;
    try {
      if (!naerHusket.has(nokkel)) naerHusket.set(nokkel, naerePuber(p));
      const liste = await naerHusket.get(nokkel);
      boks.kilder.naerDeg = merkBekreftet(merkKuraterte(liste, KJENTE), bekreftede);
      if (liste.length) boks.kart = true;
    } catch (err) {
      naerHusket.delete(nokkel);
      boks.feil.push("Fikk ikke puber nær deg (" +
        String((err && err.message) || err).slice(0, 60) + ").");
      boks.proveNaer = true;
    }
    boks.venter -= 1;
    tegnForslag(boks);
  }, () => {
    // Avslatt posisjon er ikke en feil verdt en linje: resten av lista
    // star der fortsatt, og leseren vet hva hen nettopp sa nei til. Men
    // knappen skal sta der, sa det gar an a ombestemme seg.
    boks.venter -= 1;
    boks.proveNaer = true;
    tegnForslag(boks);
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
  if ((del !== "neste" && del !== "venner") || !data || !Array.isArray(data.kamper)) return;

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
  loftKamper(rot, kart);
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

// Kampene noen blir med pa, loftet opp.
//
// En runde er en tidsrekke, og lista har dagskiller. A stokke om pa den
// flate rekkefolgen ville satt en sondagskamp under fredagsskillet — sa
// i stedet deles lista i to merkede seksjoner, hver med sine egne
// dagskiller. Ingenting dupliseres, og ingenting skjules: det er de
// samme kampene, i to bolker.
//
// Loftingen skjer her og ikke der runden tegnes, fordi svarene kommer
// etterpa: runden star ferdig lenge for vi vet om noen blir med.
function loftKamper(rot, kart) {
  const liste = rot.querySelector(".kamper");
  if (!liste) return;

  // Rader vi har tegnet fra for. Radene flyttes, ikke lages pa nytt:
  // et apent panel og en hentet vaerlinje skal overleve.
  const rader = Array.from(liste.querySelectorAll(".kamp"));
  if (!rader.length) return;

  const { loftet } = loftMedSvar(
    rader.map((r) => ({ id: r.dataset.kamp })), kart);

  // Ingen blir med enda: lista skal sta som runden, uten overskrifter.
  liste.querySelectorAll(".kamp-bolk").forEach((b) => b.remove());
  if (!loftet) {
    if (liste.dataset.loftet) {
      liste.dataset.loftet = "";
      tegnBolker(liste, rader, () => false);
    }
    return;
  }

  liste.dataset.loftet = String(loftet);
  tegnBolker(liste, rader, (rad) => (kart.get(String(rad.dataset.kamp)) || []).length > 0);
}

// Bygger lista pa nytt i riktig rekkefolge, med dagskiller som stemmer
// innenfor hver bolk. Radene gjenbrukes.
function tegnBolker(liste, rader, harSvar) {
  const med = rader.filter(harSvar);
  const uten = rader.filter((r) => !harSvar(r));
  const notis = liste.querySelector(".kamp-notis");

  liste.replaceChildren();

  const bolk = (tittel, gruppe) => {
    if (!gruppe.length) return;
    if (tittel) {
      const h = el("li", "kamp-bolk", tittel);
      liste.appendChild(h);
    }
    let forrigeDag = null;
    gruppe.forEach((rad) => {
      const dag = rad.dataset.dag || "";
      if (dag && dag !== forrigeDag) {
        forrigeDag = dag;
        liste.appendChild(el("li", "kamp-dag", dag));
      }
      liste.appendChild(rad);
    });
  };

  if (med.length) {
    bolk(med.length === 1 ? "Én kamp noen blir med på" :
      med.length + " kamper noen blir med på", med);
    bolk("Resten av runden", uten);
  } else {
    bolk(null, uten);
  }

  if (notis) liste.appendChild(notis);
}

// Lista inne i det apne panelet: de samme navnene vennene dine ser nar
// de apner kampen. Den star her sa du ser at det virket, uten a lukke
// panelet for a lete etter linja under raden.
function tegnPanelListe(kamp) {
  const panel = apentPanel && apentPanel.panel;
  const boks = panel && panel.querySelector(".kamp-panel-liste");
  if (!boks) return;

  const mine = sisteSvar.filter((s) => s.kampId === String(kamp.id));
  const tekst = blirMedTekst(mine);
  boks.replaceChildren();
  if (!tekst) return;

  const merke = el("span", "kamp-blirmed-merke", "✓");
  merke.setAttribute("aria-hidden", "true");
  boks.appendChild(merke);
  boks.appendChild(el("span", null, tekst));
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
    // Fornavn og PIN star med: den som leser dette skal vite at det koster
    // to felt, ikke en e-post og en kode.
    boks.appendChild(el("p", "kamp-note",
      "Logg inn i menyen — et fornavn og en PIN — for å si at du blir med."
      + " Å dele kampen virker uansett."));
    return boks;
  }

  const navnFelt = el("input", "kamp-navn");
  navnFelt.type = "text";
  // Advarselen star i feltet, ikke som en grastripe under: den hoerer
  // hjemme der navnet skrives, og den koster da ingen egen linje.
  navnFelt.placeholder = "Fornavn — vises for andre";
  navnFelt.setAttribute("aria-label",
    "Fornavn. Navnet er synlig for alle som åpner kampen.");
  navnFelt.maxLength = NAVN_MAKS;
  navnFelt.value = konto.navn();

  const knapp = el("button", "kamp-blimed");
  knapp.type = "button";
  const svar = el("p", "kamp-svar");
  svar.setAttribute("aria-live", "polite");

  // Har du alt svart, er knappen en angreknapp. To knapper ville betydd
  // at man kan bli med to ganger.
  // Knappen sier hva den gjor, ikke hva den heter: skal du et sted, skal
  // du «dit»; ser du den hjemme, gjor du ikke det.
  const tegnKnapp = () => {
    const mitt = egetSvar(sisteSvar.filter((s) => s.kampId === String(kamp.id)),
      okt.bruker);
    knapp.textContent = mitt
      ? "Jeg kommer ikke likevel"
      : (lesHvor() === "hjemme" ? "Jeg ser den hjemme" : "Jeg skal dit");
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
      tegnPanelListe(kamp);
    } catch (err) {
      svar.textContent = err.message;
    } finally {
      knapp.disabled = false;
    }
  });

  boks.appendChild(navnFelt);
  boks.appendChild(knapp);
  boks.appendChild(svar);
  // Knappeteksten folger stedet du velger, sa panelet ma tegne den pa
  // nytt nar valget endres.
  boks.tegnKnapp = tegnKnapp;
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
