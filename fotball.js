// Fotballmodulen (beta): alt som rorer DOM.
//
// De rene funksjonene ligger i fotball-data.js og deles med
// Netlify-funksjonen, slik at formen pa dataene er definert ett sted.
//
// Modulen eier ikke ruting. Trykk pa en liga eller en fane gar tilbake til
// app.js gjennom naviger(), som setter adressen — da virker tilbakeknappen
// likt her som i resten av appen.

import { LIGAER, DELER, FANER, DEL_NAVN, HVOR, STED_MAKS, delingstekst,
         kamplenke, invitasjonstekst, stedtekst, kampeneFramover,
         kampNokkel, kanalFor } from "./fotball-data.js";
import { tolkSvar, perKamp, blirMedTekst, egetSvar, gyldigNavn, normaliserNavn,
         loftMedSvar, bareMedSvar, stederFraSvar, perSted, KAMPER_MAKS,
         stedNokkel, blirMedLinje, mittSted, navnIRad } from "./svar-data.js";
import { overpassSporring, tolkPuber, rundPosisjon, avstandtekst,
         OVERPASS_SPEIL, overpassHeadere, kuraterteNaer, merkKuraterte,
         rangerForslag, FORSLAG_MAKS, tolkPubRader, slaSammenPuber }
  from "./pub-data.js";
import { PUBER_OSLO } from "./puber-oslo.js";
import { sjekkForslag, alleredeILista, NAVN_MAKS, ADRESSE_MAKS }
  from "./pub-forslag-data.js";
import { bekreftetFor, merkBekreftet, tolkVisninger } from "./visning-data.js";
import { arenaFor } from "./vaer-data.js";
import { KANALER } from "./kanaler.js";

// Kuraterte steder vi stoler pa. «usikker» vises ikke: et sted vi ikke
// tor sta inne for, er verre enn ett forslag faerre.
//
// Fila er grunnfjellet og star her uten et eneste nettkall. Oppa den
// legger seg rettelsene admin har gjort i portalen — nye steder, en
// adresse som flyttet, et sted som la ned (#80, ADR 0020). De kommer over
// nettet, og derfor er dette ikke en const lenger: alt som tegnes av den,
// ma kunne tegnes pa nytt nar de lander.
let KJENTE = kjenteAv(PUBER_OSLO);
const KJENT_RADIUS = 1500;

function kjenteAv(liste) {
  return liste.filter((p) => p.sikkerhet !== "usikker");
}
import { timeAgo, listeTekst } from "./lib.js";

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

  hentPubRettelser();
}

// Rettelsene admin har gjort i portalen (#80).
//
// **Stille nar den feiler, og det er riktig her.** Lista er ikke hele
// visningen — fila star der uansett, med alle radene sine. En feilmelding
// over stedene ville sagt at noe mangler, i det vanlige tilfellet der
// ingenting gjor det. Den som *skriver* en rettelse, far beskjed; det er
// der man venter et svar.
async function hentPubRettelser() {
  let json = null;
  try {
    const respons = await fetch("/api/pub-liste", { headers: { "Accept": "application/json" } });
    json = JSON.parse(await respons.text());
  } catch (err) {
    return;
  }
  if (!json || json.feil || !Array.isArray(json.puber) || !json.puber.length) return;

  KJENTE = kjenteAv(slaSammenPuber(PUBER_OSLO, tolkPubRader(json.puber)));
  tegnKjenteIgjen();
}

// Det som kommer over nettet, lander etter at visningen star ferdig.
// Et kort som alt er apent har regnet ut sine kjente steder av den gamle
// lista, og de ma regnes om — ellers star et sted som la ned i gar, der
// til kortet lukkes. Tredje gang den fella har kostet noe i dette
// prosjektet.
function tegnKjenteIgjen() {
  Array.from(apneBokser).forEach((boks) => {
    if (!boks.isConnected) { apneBokser.delete(boks); return; }
    const bekreftede = boks.bekreftede || [];
    const arena = arenaFor(boks.dataset.arena || "");
    if (arena) {
      boks.kilder.kjenteVedArena = merkBekreftet(
        kuraterteNaer(KJENTE, arena, KJENT_RADIUS), bekreftede);
    }
    if (boks.sistePosisjon) {
      boks.kilder.kjenteNaer = merkBekreftet(
        kuraterteNaer(KJENTE, boks.sistePosisjon, KJENT_RADIUS), bekreftede);
    }
    tegnForslag(boks);
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

  // Kampen maa vite hvilken liga den kom fra, ellers kan ingen slaa opp
  // kanalen. aktivLiga duger ikke: vennefanen blander ligaene i en liste,
  // sa den ville merket en Premier League-kamp med Eliteseriens kanal —
  // en stille feil opplysning, som er nettopp det vi ikke skal gi.
  //
  // Her, og ikke i parserne: de ser ett datasett om gangen og vet ikke
  // hvem som spurte. hent() er den ene trakta begge fanene gaar gjennom.
  if (Array.isArray(data.kamper)) data.kamper.forEach((k) => { k.liga = liga; });
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
  // Hele vinduet, ikke forste runde. Var runden nesten ferdigspilt, sto
  // det én kamp i fanen og ingenting om helgen etter — og kildene sendte
  // de tjue kampene uansett.
  else if (del === "neste") deler.push(kampliste(kampeneFramover(data.kamper || []), del, data));
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

// Lagmerket ved navnet. Bildet ligger hos kilden, som fontene gjor —
// ingen sporing, ingen informasjonskapsel, og referrerpolicy holder
// adressen var for oss selv. alt er tomt med vilje: navnet star like ved,
// og en skjermleser skal ikke lese laget to ganger.
//
// Malene star pa taggen, ikke bare i CSS: uten dem har raden ingen hoyde
// for bildet er lastet, og tabellen hopper mens den leses. Svikter
// adressen, fjernes bildet — et knust ikon sier ingenting om ligaen.
// Adressen godtas bare som https fra kilden, eller som et innebygd
// bilde. https holder blandet innhold ute: en http-adresse ville blitt
// blokkert av nettleseren uansett, og da er det bedre a la vaere.
// data:image finnes med fordi testene bruker det — et bilde som ma
// hentes over nettet fryser den virtuelle tida i testrammen, og da
// rapporterer siden aldri. Et data:image i en <img> kjorer ingenting.
function godtattMerke(verdi) {
  const a = String(verdi || "");
  return a.indexOf("https://") === 0 || a.indexOf("data:image/") === 0 ? a : null;
}

function lagmerke(rad) {
  const adresse = godtattMerke(rad.merke);
  if (!adresse) return null;
  const bilde = el("img", "lag-merke");
  bilde.src = adresse;
  bilde.alt = "";
  bilde.width = 18;
  bilde.height = 18;
  bilde.loading = "lazy";
  bilde.decoding = "async";
  bilde.referrerPolicy = "no-referrer";
  bilde.addEventListener("error", () => bilde.remove());
  return bilde;
}

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
        const knapp = el("button", "lag-knapp");
        knapp.type = "button";
        knapp.title = "Søk i nyhetene etter " + rad.lag;
        // Merket kostet ingenting a fa tak i: begge kildene bærer det i
        // tabellsvaret, og begge parserne har plukket det ut hele tiden —
        // det var bare aldri tegnet. Ingen nye kall, ingen ny fil.
        const merke = lagmerke(rad);
        if (merke) knapp.appendChild(merke);
        knapp.appendChild(el("span", "lag-navn", rad.lag));
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

// Kampens identitet, overalt der noe lagres, slas opp eller deles:
// nokkelen, ikke kildens id. Se kampNokkel() i fotball-data.js for
// hvorfor — kort sagt fordi de to kildene nummererer hver sin vei, og
// kilden byttes uten at leseren gjor noe.
function kampNokkelFor(kamp) {
  if (!kamp) return "";
  return String(kamp.nokkel || kampNokkel(kamp) || (kamp.id == null ? "" : kamp.id));
}

/* ---------- vennene ---------- */

// Kampene noen har sagt at de blir med pa, pa tvers av ligaer.
//
// Loftingen i Kommende svarer innenfor én liga. Star Ola pa en
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

  // Hele vinduet per liga, som i Kommende. Buntingen i hentSvarFor() er
  // det som holder tjenestens tak pa tjue id-er, sa en liga faller ikke
  // stille ut — og det er nettopp det fanen finnes for.
  const kamper = [];
  runder.forEach((data) => {
    if (data && Array.isArray(data.kamper)) {
      (data.kamper || []).forEach((k) => kamper.push(k));
    }
  });

  if (!kamper.length) {
    rot.replaceChildren(tilstand("Fant ingen kommende kamper."));
    return;
  }

  // Hvem som blir med, for alle ligaene samlet.
  const hentet = await hentSvarFor(kamper.map(kampNokkelFor).filter(Boolean));
  if (aktivDel !== "venner") return;

  // Her er lista hele visningen, ikke et tillegg til kampen. Feiler
  // kallet, skal det sta — «ingen har sagt at de blir med» ville pastatt
  // noe vi ikke vet. Det er samme regel som ellers i appen: en stille tom
  // liste er ikke til a skille fra et tomt svar, og da er det den som
  // leter som betaler.
  if (hentet.feil) {
    rot.replaceChildren(tilstand(hentet.feil));
    return;
  }

  sisteSvar = hentet.svar;
  sisteVisninger = hentet.visninger;
  const med = bareMedSvar(kamper, perKamp(hentet.svar));

  if (!med.length) {
    // Tom til noen svarer — og da er nettopp den lista hele poenget. Da
    // skal det sta hva som skal til, ikke bare at det er tomt.
    rot.replaceChildren(tilstand(
      "Ingen har sagt at de blir med ennå. Åpne en kamp under Kommende"
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
  let forrigeRunde = null;

  kamper.forEach((kamp) => {
    // Runden over dagene: lista rekker na flere helger, og uten den er
    // «lordag 27. sep» det eneste som skiller neste runde fra den etter.
    // Kilder som ikke sender rundetall gir ingen overskrift — en tom
    // «Runde » ville vaert verre enn ingen.
    const runde = del === "neste" ? String(kamp.runde || "") : "";
    if (runde && runde !== forrigeRunde) {
      forrigeRunde = runde;
      forrigeDag = null;
      liste.appendChild(el("li", "kamp-runde", runde));
    }
    const dag = dagtekst(kamp.dato);
    if (dag !== forrigeDag) {
      forrigeDag = dag;
      const skille = el("li", "kamp-dag", dag);
      liste.appendChild(skille);
    }
    const rad = kamprad(kamp, del, delbar);
    // Dagen og runden huskes pa raden: blir lista delt i to bolker senere,
    // ma skillene kunne tegnes pa nytt uten a regnes ut igjen.
    rad.dataset.dag = dag;
    rad.dataset.runde = runde;
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
  knapp.setAttribute("aria-label", kamp.hjemme + " – " + kamp.borte + ". Hvor skal du se den?");
  knapp.setAttribute("aria-expanded", "false");
  knapp.title = "Hvor skal du se den? Se hvem som viser kampen";
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
    // Stedene tegnes forst nar panelet henger i raden: et sted fra en
    // delt lenke ligger pa raden, og den finnes ikke for panelet er
    // festet. Tegnet vi for, ville det stedet mangle i lista.
    panel.tegnSteder();
    tegnPanelListe(kamp);
    // Fokus pa det forste stedet — det er handlingen. Har kampen ingen
    // steder enna, star lenka til forslagene der i stedet.
    const forste = panel.querySelector(".sted-chip") || panel.querySelector(".pub-apne");
    if (forste) forste.focus();
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

// Apner kortet pa en rad med et sted pekt ut. To veier inn hit: linja som
// sier hvem som viser kampen, og invitasjonen fra en delt lenke. Begge
// vet alt hvilket sted det gjelder, og begge skal lande i det samme
// kortet — ellers finnes det to mater a svare pa.
//
// Stedet blir *pekt ut*, ikke valgt: et trykk pa et sted er na svaret
// «jeg skal dit», og det svaret skal leseren gi selv. Derfor markeres
// chipen og far fokus, sa det fortsatt koster ett trykk — hens eget.
function apnePanelMed(rad, hvor, sted) {
  const knapp = rad && rad.querySelector(".kamp-del");
  if (!knapp) return null;

  // Stedet legges pa raden for panelet tegnes: et sted fra en lenke kan
  // vaere en pub ingen har meldt inn og ingen kart kjenner, og da ma den
  // med i lista framfor a forsvinne.
  rad.dataset.pektHvor = HVOR[hvor] ? hvor : "";
  rad.dataset.pektSted = sted ? String(sted).slice(0, STED_MAKS) : "";

  if (knapp.getAttribute("aria-expanded") !== "true") knapp.click();
  else if (apentPanel && apentPanel.panel.tegnSteder) apentPanel.panel.tegnSteder();

  const panel = apentPanel && apentPanel.panel;
  if (!panel) return null;

  // Fokus paa knappen i raden, ikke paa raden: raden er ingen knapp
  // lenger — den har en inni seg — og svaret skal fortsatt koste ett
  // trykk, leserens eget.
  const pekt = panel.querySelector(".sted-rad-kort.pekt .sted-knapp");
  if (pekt) pekt.focus();
  return panel;
}

/* ---------- kampkortet: hvor skal du se den? ---------- */

// Kortet er en liste over steder man kan dra, og et trykk pa et sted er
// svaret: «jeg planlegger a se den der».
//
// For var det tre steg — velg hjemme/pub/stadion, skriv pubnavnet, trykk
// «Jeg skal dit» — og et navnefelt i tillegg, pa hver eneste kamp. Tre
// steg for a si én ting. Na er stedet og svaret det samme trykket, og
// navnet kommer fra innloggingen: det er alt det samme fornavnet.
//
// «Hjemme» er borte. Kortet handler om hvor man moter noen, og sofaen er
// ikke et motested — det var ogsa det eneste svaret som ikke sa noe om
// hvor du er.
function delPanel(kamp) {
  const panel = el("div", "kamp-panel");
  // Kampen huskes pa panelet, sa en ny tegning utenfra — nar svarene
  // lander etter at kortet ble apnet — vet hvilken kamp den gjelder.
  panel.kamp = kamp;
  // En funksjon, ikke en verdi: visningene kommer fra nettet na, og et
  // kort som ble apnet for svaret landet ville ellers statt med det
  // tomme svaret for alltid. tegnSteder() kalles pa nytt av tegnSvar().
  const bekreftede = () => bekreftetFor(kamp, sisteVisninger, KJENTE);

  // Overskrifta i kortet sier hva lista under er. Lagene er overskrifta
  // pa kampen, og de star i linja over — kortet skal ikke ha en tittel
  // til som konkurrerer med dem.
  //
  // Én liste, og den spor. «Disse viser kampen» over hele lista ville
  // pastatt at arenaen og en pub ingen har meldt inn viser den — og det
  // er nettopp den merkingen appen ellers holder ren. Stjerna sier hvem
  // som faktisk har meldt inn, rad for rad, som i forslagslista.
  panel.appendChild(el("p", "kamp-panel-tittel", "Hvor skal du se den?"));

  // Kanalen staar som en opplysning, ikke som en rad man kan melde seg
  // paa. En kanal er ikke et motested — det var nettopp «Hjemme», som er
  // tatt ut med vilje: kortet handler om hvor man treffer noen, og sofaen
  // er ikke et sted. Men den hoerer hjemme i kortet, for spoersmaalet er
  // «hvor skal du se den?», og for de fleste kamper er svaret en kanal.
  //
  // Den staar over stedene, ikke under: ser du at kampen sendes, er
  // resten av kortet et valg om aa se den sammen med noen framfor alene.
  const kanal = kanallinje(kamp);
  if (kanal) panel.appendChild(kanal);

  const steder = el("div", "sted-liste");
  panel.appendChild(steder);

  const melding = el("p", "kamp-svar");
  melding.setAttribute("aria-live", "polite");

  // Et sted du skriver selv. Feltet og forslagene ligger bak lenka
  // under: de fleste kamper trenger dem ikke, og de var storsteparten av
  // stoyen i kortet.
  const pubFelt = el("input", "kamp-pub");
  pubFelt.type = "text";
  pubFelt.placeholder = "Et annet sted?";
  pubFelt.setAttribute("aria-label", "Skriv stedet du skal se kampen");
  pubFelt.maxLength = STED_MAKS;

  const forslag = pubForslag(kamp, pubFelt);
  const egen = el("button", "sted-egen", "Jeg skal hit");
  egen.type = "button";
  egen.disabled = true;
  pubFelt.addEventListener("input", () => {
    egen.disabled = !pubFelt.value.trim();
  });

  const utvidet = el("div", "pub-utvidet");
  utvidet.hidden = true;
  utvidet.appendChild(forslag);
  utvidet.appendChild(pubFelt);
  utvidet.appendChild(egen);
  // Star du pa en pub som ikke finnes i lista, har du til na ikke hatt
  // noen vei til a si fra (#80). Skjemaet star her og ikke lenger opp:
  // det er nettopp nar du har skrevet et navn selv at stedet mangler.
  utvidet.appendChild(sendInnSted(pubFelt));

  // Lenka ut til pubene som pleier a vise fotball. Har ingen meldt inn
  // noe pa denne kampen, er det den eneste veien videre — da sier lenka
  // det, og listen star apen med en gang.
  //
  // Sto «Et annet sted» til 17. september 2026, og det var feil ord.
  // «Et annet sted» hoeres ut som feltet der du skriver noe selv. Det
  // som apner seg er en liste over **fotballpuber som ikke har meldt inn
  // denne kampen** — steder du kan regne med a fa se fotball, bare uten
  // at noen har sagt noe om akkurat denne. Etiketten skal si det.
  //
  // «Andre» star bare nar det finnes en forste: har ingen bekreftet noe,
  // er det ingen a vaere annen enn.
  const apne = el("button", "pub-apne");
  apne.type = "button";
  apne.setAttribute("aria-expanded", "false");
  const apneTekst = () => (bekreftede().length
    ? "Andre fotballpuber" : "Puber som pleier å vise fotball");
  apne.textContent = apneTekst();
  const vis = (pa) => {
    utvidet.hidden = !pa;
    apne.setAttribute("aria-expanded", pa ? "true" : "false");
    apne.textContent = pa ? "Skjul stedene" : apneTekst();
    if (pa) fyllForslag(forslag, kamp);
  };
  apne.addEventListener("click", () => vis(utvidet.hidden));

  panel.appendChild(melding);
  panel.appendChild(apne);
  panel.appendChild(utvidet);

  // Vennene nederst, gruppert etter stedet de skal til: «List opp nederst
  // venner som har planlagt turen dit». Et navn uten et sted sier ikke
  // hvor man moter noen.
  panel.appendChild(el("div", "kamp-panel-liste"));

  // Delingen sender beskjeden til gruppechatten. Lista i kortet er det
  // vennene ser nar de apner kampen, sa dette er en tekstknapp under,
  // ikke en handling som konkurrerer med stedene.
  const send = el("button", "kamp-send", "Del i chatten");
  send.type = "button";
  panel.appendChild(send);

  // Stedet leseren har pekt ut uten a vaere logget inn. A dele kampen i
  // gruppechatten krever ingen konto, og gjorde det aldri — det gar til
  // vennene, ikke til oss. Men det som skal sta pa lista i appen, ma vaere
  // sagt av noen. Sa utlogget velger et trykk et sted, logget inn skriver
  // det ogsa raden.
  let lokaltSted = null;

  // Ett sted som bestemmer hva som star i chip-rada. Logget inn er det
  // svaret tjenesten kjenner — ikke en variabel her, sa den samme kampen
  // i vennefanen viser det samme. Utlogget er det trykket i dette kortet.
  const mitt = () => {
    const okt = konto.okt();
    if (!okt) return lokaltSted;
    return egetSvar(sisteSvar.filter((s) => s.kampId === kampNokkelFor(kamp)),
      okt.bruker);
  };
  panel.settLokalt = (verdi) => { lokaltSted = verdi; };

  // Stedene som er trykket pa i dette kortet. De blir staende som chips
  // sa lenge kortet er apent, ogsa etter at svaret er angret: en chip som
  // forsvinner under fingeren er verre enn en chip for mye — og angrer du,
  // skal veien tilbake vaere den samme.
  const egneSteder = [];
  panel.husk = (hvor, sted) => {
    if (!sted || egneSteder.some((s) => stedNokkel(s.navn) === stedNokkel(sted))) return;
    egneSteder.push({ hvor, navn: sted });
  };

  panel.tegnSteder = () => {
    const rad = panel.closest(".kamp");
    const pekt = rad ? stedNokkel(rad.dataset.pektSted || "") : "";
    const eget = mitt();
    const valgt = eget && eget.sted ? stedNokkel(eget.sted) : "";
    // Utlogget er valget et delingsvalg, ikke en plass pa lista. De to
    // skal ikke se like ut: et sted som ser valgt ut nar ingenting er
    // lagret, sier at det virket.
    const paaLista = !!konto.okt();

    steder.replaceChildren();
    stedKilder(kamp, bekreftede(), rad, egneSteder).forEach((sted) => {
      const nokkel = stedNokkel(sted.navn);
      steder.appendChild(stedRad(kamp, panel, sted, {
        valgt: !!valgt && nokkel === valgt,
        paaLista,
        pekt: !!pekt && nokkel === pekt && nokkel !== valgt,
        melding,
      }));
    });

    // Ingen steder a trykke pa: da er forslagene ikke et tillegg, de er
    // hele svaret, og de skal sta apne.
    if (!steder.children.length && utvidet.hidden) vis(true);

    // Egen linje med «Du skal til X» trengs ikke lenger: raden du staar
    // paa sier det tydeligere enn en setning under lista gjorde. «Du» staar
    // forst blant navnene, knappen sier «Meld deg av», og raden er merket.
    // Linja under kampraden (blirMedLinje) sier det fortsatt med ord for
    // den som blar uten aa aapne kortet.

    // Merkene i forslagslista skal si det samme som chipene over: stedet
    // du alt har sagt at du skal til, er merket der ogsa.
    forslag.mittSted = valgt;
    if (forslag.dataset.fylt) tegnForslag(forslag);

    if (!konto.okt() && !panel.querySelector(".kamp-note")) {
      // Utlogget star det hva som mangler — og at resten virker uansett.
      // Innlogging er ikke en port inn i appen, bare veien til a stille
      // seg pa lista.
      const note = el("p", "kamp-note",
        "Logg inn i menyen — et fornavn og en PIN — for å si at du skal dit."
        + " Å se hvem som blir med, og å dele kampen, virker uansett.");
      panel.insertBefore(note, melding);
    }
  };

  // Et sted du skrev selv. Samme svar som en chip, bare med et navn vi
  // ikke hadde pa lista.
  egen.addEventListener("click", () => {
    const navn = pubFelt.value.trim();
    if (!navn) return;
    svarSted(kamp, panel, "pub", navn, melding);
  });

  // Chipene i forslagslista svarer som chipene over: ett trykk, ett sted.
  forslag.velg = (pub) => {
    pubFelt.value = pub.navn;
    egen.disabled = false;
    svarSted(kamp, panel, "pub", pub.navn, melding);
  };

  send.addEventListener("click", async () => {
    const eget = mitt();
    const hvor = eget && eget.hvor ? eget.hvor : null;
    const sted = eget && eget.sted ? eget.sted : "";
    // Lenka barer kampen, svaret og stedet: mottakeren skal lande pa
    // kampen det gjelder, ikke i en runde hen ma lete i.
    const url = location.origin + location.pathname +
      kamplenke(aktivLiga, kamp, hvor, sted);
    // Vaeret er hentet da raden ble apnet, og husket per kamp; er det ikke
    // der, deles teksten uten. Ingen skal vente pa MET for a sende en
    // melding.
    const vaer = kamp.arena ? await hentVaer(kamp) : null;
    const tekst = delingstekst(kamp, hvor, sted, url, vaer && vaer.tekst);
    send.disabled = true;
    const utfall = await deling(tekst, url);
    send.disabled = false;
    if ((utfall === "delt" || utfall === "kopiert") && hvor === "pub" && sted) {
      // En delt pub er en pub leseren bruker. Neste gang star den forst.
      puber.noter(sted);
    }
    if (utfall === "delt") { lukkPanel(); return; }
    if (utfall === "kopiert") melding.textContent = "Kopiert. Lim inn i chatten.";
    else if (utfall !== "avbrutt") {
      melding.textContent = "Fikk ikke delt. Kopier teksten selv: " + tekst;
    }
  });

  return panel;
}

// Stedene i kortet, i den rekkefolgen de svarer pa kampen:
//
//  1. pubene som har meldt inn at de viser nettopp denne kampen,
//  2. stadion — «en plass man kan dra», pa linje med pubene,
//  3. stedene vennene alt har sagt at de skal til,
//  4. stedet en delt lenke pekte pa.
//
// Deduplisert pa stedet normalisert, sa en pub som bade er meldt inn og
// har folk star én gang. Rekkefolgen bestemmer hvem som vinner merkene:
// den forste utgaven av stedet er den som star.
function stedKilder(kamp, bekreftede, rad, egne) {
  const sett = new Map();
  const legg = (navn, felt) => {
    if (!navn) return;
    const nokkel = stedNokkel(navn);
    if (!nokkel) return;
    const fra = sett.get(nokkel);
    if (fra) { Object.assign(fra, felt, { navn: fra.navn }); return; }
    sett.set(nokkel, Object.assign({ navn: String(navn) }, felt));
  };

  bekreftede.forEach((p) => legg(p.navn, { hvor: "pub", bekreftet: true }));
  if (kamp.arena) legg(kamp.arena, { hvor: "stadion", stadion: true });
  stederFraSvar(sisteSvar.filter((s) => s.kampId === kampNokkelFor(kamp)))
    .forEach((s) => legg(s.navn, { hvor: s.hvor, harFolk: true }));
  (egne || []).forEach((s) => legg(s.navn, { hvor: s.hvor }));
  if (rad && rad.dataset.pektSted) {
    legg(rad.dataset.pektSted, { hvor: rad.dataset.pektHvor || "pub" });
  }
  return Array.from(sett.values());
}

// Ett sted, én rad: navnet, folka som skal dit, og én knapp som sier hva
// den gjor.
//
// Fer var stedet en chip, og trykket paa chipen var hele svaret. Det var
// for lite aa se: «ser lite forskjell paa en pub som er markert eller
// ikke» — og da trykker man en gang til for aa sjekke at det tok, og
// melder seg av uten aa se det. En hake hjalp, men den forklarte ikke hva
// et nytt trykk ville gjore. Knappen sier det med ord.
//
// Og folka staar i raden, ikke i en egen liste nederst. Stedet og hvem
// som er der er én ting — det er hele sporsmalet man aapnet kortet for aa
// faa svar paa.
//
// Raden er derfor ingen knapp. Den har en inni seg, og en knapp i en
// knapp finnes ikke — samme grunn som at kamplinja loser trykkflata med
// en utstrakt knapp framfor aa vaere en selv.
// «Sendes paa TV 2 Play», eller ingenting. Ingenting er det normale til
// noen har verifisert ligaen sin rad i kanaler.js — og ingenting er et
// aerlig svar, mens feil kanal ikke er det.
function kanallinje(kamp) {
  const rad = kanalFor(kamp && kamp.liga, KANALER);
  if (!rad) return null;
  const linje = el("p", "kamp-kanal");
  linje.appendChild(el("span", "kamp-kanal-merke", "📺"));
  linje.appendChild(el("span", "kamp-kanal-navn", "Sendes på " + rad.kanal));
  // Datoen staar i title framfor paa skjermen, som stjerna til pubene:
  // den som lurer paa hvor ferskt det er, kan se etter — resten skal ikke
  // lese en dato de ikke spurte om. Rettighetene flytter seg, sa naar
  // noen sist sa etter er en del av opplysningen.
  linje.title = "Sjekket " + rad.sjekket + ". Rettighetene kan ha endret seg siden.";
  linje.setAttribute("aria-label", "Kampen sendes på " + rad.kanal);
  return linje;
}

function stedRad(kamp, panel, sted, form) {
  const rad = el("div", "sted-rad-kort");
  if (sted.bekreftet) rad.classList.add("bekreftet");
  if (form.pekt) rad.classList.add("pekt");
  if (form.valgt) {
    rad.classList.add("valgt");
    // Valgt uten aa vaere logget inn er et delingsvalg, ikke en plass paa
    // lista. Et sted som ser lagret ut naar ingenting er lagret, sier at
    // det virket.
    if (!form.paaLista) rad.classList.add("kun-deling");
  }

  const venstre = el("div", "sted-rad-venstre");
  const topp = el("div", "sted-rad-topp");

  // Merkene sier hvorfor stedet staar her. Stjerna svarer paa kampen,
  // arenaen paa hvor den spilles.
  if (sted.bekreftet) {
    const merke = el("span", "pub-bekreftet", "★");
    merke.setAttribute("aria-label", "viser denne kampen");
    merke.title = "Meldt inn til oss.";
    topp.appendChild(merke);
  } else if (sted.stadion) {
    const merke = el("span", "sted-merke", "🏟");
    merke.setAttribute("aria-label", "på stadion");
    topp.appendChild(merke);
  }
  topp.appendChild(el("span", "sted-navn", sted.navn));
  venstre.appendChild(topp);

  const folk = sisteSvar.filter((s) => s.kampId === kampNokkelFor(kamp) &&
    s.sted && stedNokkel(s.sted) === stedNokkel(sted.navn));
  const okt = konto.okt();
  const { navn, flere } = navnIRad(folk, okt && okt.bruker);
  if (navn.length) {
    const linje = el("div", "sted-rad-folk");
    navn.forEach((n) => linje.appendChild(el("span", "sted-rad-navn", n)));
    if (flere) linje.appendChild(el("span", "sted-rad-flere", "+" + flere + " andre"));
    linje.setAttribute("aria-label", folk.length === 1 ? "én skal hit"
      : folk.length + " skal hit");
    venstre.appendChild(linje);
  }
  rad.appendChild(venstre);

  // Knappen sier hva trykket gjor, ikke hva stedet er. «Meld deg av» er
  // det som manglet: at et nytt trykk tar deg av lista maa staa, ikke
  // gjettes.
  const b = el("button", "sted-knapp");
  b.type = "button";
  b.textContent = form.valgt
    ? (form.paaLista ? "Meld deg av" : "Valgt for deling")
    : "Jeg skal hit";
  b.setAttribute("aria-pressed", form.valgt ? "true" : "false");
  b.setAttribute("aria-label", form.valgt
    ? (form.paaLista ? "Du skal til " + sted.navn + ". Trykk for å melde deg av."
                     : "Deles: " + sted.navn + ". Trykk for å velge bort.")
    : "Jeg skal til " + sted.navn);
  b.addEventListener("click", () =>
    svarSted(kamp, panel, sted.hvor || "pub", sted.navn, form.melding, form.valgt));
  rad.appendChild(b);
  return rad;
}

// Kampens rader, byttet ut med dem tjenesten nettopp leste tilbake.
//
// Hele kampen, ikke bare din egen rad: skrivingen leser tilbake alle
// radene for a bevise at din landet, og de andre folger med. Byttet vi
// bare ut din, ville de andre blitt lagt oppa dem som alt la der — og da
// sto vennene dobbelt i lista til neste henting ryddet opp.
//
// Er svaret tomt, beholdes det vi hadde: tjenesten svarer 502 nar raden
// ikke finnes, sa en tom liste her er ikke et bevis paa noe.
function leggInnSvar(kampId, ferske) {
  if (!ferske.length) return false;
  sisteSvar = sisteSvar.filter((s) => s.kampId !== String(kampId))
    .concat(ferske.filter((s) => s.kampId === String(kampId)));
  return true;
}

// Kampens svar, hentet pa nytt. Ett kall for én kamp, og bare etter noe
// leseren selv gjorde — runden hentes fortsatt i ett kall.
async function friskeOppSvar(kampId) {
  try {
    const respons = await fetch("/api/svar?kamper=" + encodeURIComponent(kampId),
      { headers: { "Accept": "application/json" } });
    const json = JSON.parse(await respons.text());
    if (!respons.ok || json.feil) return;
    // Bare denne kampens rader byttes ut. Resten av runden star som den var.
    sisteSvar = sisteSvar.filter((s) => s.kampId !== String(kampId))
      .concat(tolkSvar(json.svar).filter((s) => s.kampId === String(kampId)));
  } catch (err) {
    // Stille: skrivingen gikk bra, og det er det meldinga sier. En
    // feilmelding om en oppfriskning ville sagt at noe gikk galt.
  }
}

// Svaret. Ett trykk skriver raden, et nytt trykk pa det samme stedet
// fjerner den.
//
// Navnet kommer fra innloggingen, ikke fra et felt i kortet: det er alt
// det samme fornavnet, og et felt man matte fylle for trykket virket
// ville betydd at «ett trykk» ikke var sant.
async function svarSted(kamp, panel, hvor, sted, melding, avmeld) {
  const okt = konto.okt();
  if (panel.husk) panel.husk(hvor, sted);
  if (!okt) {
    // Utlogget velger trykket stedet uten a skrive noe: da kan kampen
    // deles med stedet i teksten, som den alltid har kunnet. Lista i
    // appen krever at noen har sagt det, og det star her.
    panel.settLokalt(avmeld ? null : { hvor, sted });
    melding.textContent = avmeld ? ""
      : "Logg inn i menyen — et fornavn og en PIN — for å si at du skal hit."
        + " Stedet blir med når du deler kampen.";
    if (panel.tegnSteder) panel.tegnSteder();
    return;
  }
  const navn = normaliserNavn(konto.navn());
  if (!gyldigNavn(navn)) {
    melding.textContent = "Logg inn på nytt — vi mangler fornavnet ditt.";
    return;
  }

  panel.querySelectorAll(".sted-chip, .pub-chip, .sted-egen")
    .forEach((k) => { k.disabled = true; });
  // Leste skrivingen kampen tilbake for oss, trengs ingen oppfriskning:
  // svaret er alt det ferskeste vi kan fa.
  let ferdigLest = false;
  try {
    if (avmeld) {
      await svarTjeneste({ handling: "fjern", token: okt.token, kampId: kampNokkelFor(kamp) });
      sisteSvar = sisteSvar.filter(
        (s) => !(s.kampId === kampNokkelFor(kamp) && s.bruker === okt.bruker));
      panel.settLokalt(null);
      melding.textContent = "Du skal ikke dit likevel.";
    } else {
      konto.settNavn(navn);
      const json = await svarTjeneste({
        token: okt.token, kampId: kampNokkelFor(kamp), navn, hvor, sted,
      });
      ferdigLest = leggInnSvar(kampNokkelFor(kamp), tolkSvar(json.svar));
      panel.settLokalt({ hvor, sted });
      melding.textContent = "Du har planlagt å dra til " + (sted || stedtekst(kamp, hvor, sted)) + ".";
      // Tjenesten sier fra nar raden er skrevet, men ingen andre kan lese
      // den. Da er alt riktig fra din side og likevel usynlig for alle —
      // og det er verre a la det sta som en vellykket lagring.
      if (json.advarsel) melding.textContent += " " + json.advarsel;
    }
    // Hent kampens svar pa nytt nar skrivingen ikke alt ga oss dem. En
    // fjerning svarer bare «fjernet», og da er dette den eneste veien til
    // a vite hva som star igjen.
    //
    // Og det er her vennene kommer inn: har noen svart siden runden ble
    // hentet, star de i kortet med det samme framfor ved neste lasting.
    if (!ferdigLest) await friskeOppSvar(kampNokkelFor(kamp));
    // Rekkefolgen i runden og linja under kampen skal si det samme som
    // kortet: ett svar, ett sted som tegner det.
    tegnSvar(document.getElementById("fotballInnhold"));
    tegnPanelListe(kamp);
    if (panel.tegnSteder) panel.tegnSteder();
  } catch (err) {
    melding.textContent = err.message;
  } finally {
    panel.querySelectorAll(".sted-chip, .pub-chip, .sted-egen")
      .forEach((k) => { k.disabled = false; });
    const felt = panel.querySelector(".kamp-pub");
    const egen = panel.querySelector(".sted-egen");
    if (felt && egen) egen.disabled = !felt.value.trim();
  }
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

// Boksene som star pa skjermen na. Rettelsene fra portalen lander etter
// at kortet er tegnet, og da er det disse som ma tegnes om. Lista lukes
// nar den gas gjennom: et lukket kort er ute av dokumentet.
const apneBokser = new Set();

function pubForslag(kamp, pubFelt) {
  const boks = el("div", "pub-forslag");
  apneBokser.add(boks);
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
  const bekreftede = bekreftetFor(kamp, sisteVisninger, KJENTE);
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
  // Merket folger svaret jeg har gitt, ikke det som star i feltet: et
  // forslag er merket fordi jeg skal dit, ikke fordi jeg skrev navnet.
  const valgt = boks.mittSted || "";
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
    valgt && stedNokkel(pub.navn) === valgt ? "true" : "false");
  // Ett trykk, ett sted — ogsa her. Et forslag oppforer seg som et sted i
  // kortet over: trykket *er* svaret, ikke en utfylling av et felt man
  // ma trykke en gang til for a bruke.
  b.addEventListener("click", () => {
    if (boks.velg) { boks.velg(pub); return; }
    boks.pubFelt.value = pub.navn;
    boks.pubFelt.dispatchEvent(new Event("input"));
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
    boks.sistePosisjon = p;
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
  if (kampNokkelFor(kamp)) rad.dataset.kamp = kampNokkelFor(kamp);
  // Og kampen selv: arenaen trengs for a skrive «Du skal til Aspmyra
  // Stadion» nar noen valgte stadion uten a skrive et navn.
  rad.kamp = kamp;

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

// «Mangler stedet? Send det inn.»
//
// Lista i puber-oslo.js vokser i dag bare nar noen redigerer en fil. Den
// som star pa puben og ser at den ikke finnes der, har ingen vei til a si
// fra — annet enn a skrive navnet i feltet over, der det blir staende for
// hen alene (#80).
//
// Forslaget gar i en ko, ikke i lista. Lista baerer en redaksjonell
// vurdering, og hver rad har kilde og sjekket; en rad som kom inn uten at
// noen sa pa den, ville brutt nettopp det sjekkPubliste() vokter. Det sier
// teksten under knappen med ord, sa ingen tror stedet dukker opp straks.
//
// Skjemaet er skjult til man trykker: de fleste kamper trenger det ikke,
// og footeren i kortet var allerede full.
function sendInnSted(pubFelt) {
  const boks = el("div", "sted-forslag");

  const apne = el("button", "sted-forslag-apne", "Mangler stedet? Send det inn.");
  apne.type = "button";
  apne.setAttribute("aria-expanded", "false");

  const skjema = el("div", "sted-forslag-skjema");
  skjema.hidden = true;

  const navn = el("input", "konto-felt");
  navn.type = "text";
  navn.placeholder = "Navn på stedet";
  navn.setAttribute("aria-label", "Navn på stedet");
  navn.maxLength = NAVN_MAKS;

  // Adressen er ikke pynt. Koordinatene i lista er anslag fra
  // gateadressen, og uten den kan ikke stedet sorteres etter avstand.
  const adresse = el("input", "konto-felt");
  adresse.type = "text";
  adresse.placeholder = "Gateadresse";
  adresse.setAttribute("aria-label", "Gateadresse");
  adresse.maxLength = ADRESSE_MAKS;

  const merke = el("label", "sted-forslag-merke");
  const kryss = el("input");
  kryss.type = "checkbox";
  kryss.checked = true;
  merke.appendChild(kryss);
  merke.appendChild(el("span", null, "De viser fotball"));

  const send = el("button", "konto-send", "Send inn");
  send.type = "button";

  const melding = el("p", "kamp-svar");
  melding.setAttribute("aria-live", "polite");

  const si = (tekst, art) => {
    melding.textContent = tekst;
    melding.className = "kamp-svar" + (art ? " " + art : "");
  };

  skjema.appendChild(navn);
  skjema.appendChild(adresse);
  skjema.appendChild(merke);
  skjema.appendChild(send);
  skjema.appendChild(el("p", "sted-forslag-note",
    "Vi sjekker adressen før stedet havner i lista. Det er derfor den er"
    + " verdt å stole på."));
  skjema.appendChild(melding);

  apne.addEventListener("click", () => {
    const pa = skjema.hidden;
    skjema.hidden = !pa;
    apne.setAttribute("aria-expanded", pa ? "true" : "false");
    if (!pa) return;
    // Har du alt skrevet et navn i feltet over, er det stedet du mener.
    if (!navn.value && pubFelt.value.trim()) navn.value = pubFelt.value.trim();
    navn.focus();
  });

  send.addEventListener("click", async () => {
    const inn = {
      navn: navn.value,
      adresse: adresse.value,
      viserFotball: kryss.checked,
    };

    // Samme sjekk som tjenesten gjor, fra den samme fila: blir de to
    // uenige om hva et gyldig navn er, far leseren «noe er galt» pa noe
    // som stemmer.
    const problemer = sjekkForslag(inn);
    if (problemer.length) { si(problemer[0], "feil"); navn.focus(); return; }

    // Stedet star kanskje der alt, under et navn som skrives litt
    // annerledes. Da er det ingen feil — men det er unodvendig arbeid for
    // begge, og leseren skal slippe a vente pa et svar hen ikke trenger.
    if (alleredeILista(inn.navn, KJENTE)) {
      si("Det stedet står allerede i lista. Finner du det ikke over, er det"
        + " kanskje skrevet litt annerledes.", "");
      return;
    }

    const okt = konto.okt();
    if (!okt || !okt.token) {
      si("Logg inn først, så vet vi hvem forslaget kommer fra. Du finner"
        + " innloggingen i menyen.", "feil");
      return;
    }

    send.disabled = true;
    si("Sender …", "");
    try {
      const respons = await fetch("/api/pub-forslag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ token: okt.token }, inn)),
      });
      const data = JSON.parse(await respons.text());
      if (!respons.ok || data.feil) {
        si(data.feil || ("Tjenesten svarte " + respons.status), "feil");
      } else {
        si(data.merknad || "Takk, vi ser på det.", "ok");
        navn.value = "";
        adresse.value = "";
      }
    } catch (err) {
      si("Fikk ikke sendt inn. Prøv igjen om litt.", "feil");
    }
    send.disabled = false;
  });

  boks.appendChild(apne);
  boks.appendChild(skjema);
  return boks;
}

// «Denne kampen vises på: Lincoln Pub» rett under kampen, ikke bare inne
// i delingspanelet: den som blar gjennom runden skal se det uten a apne
// noe. Navnet er en knapp som apner panelet med puben ferdig valgt —
// linja svarer pa sporsmalet og tar deg videre til a dele det.
function viserlinje(kamp) {
  const bekreftede = bekreftetFor(kamp, sisteVisninger, KJENTE);
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

// Hvilke puber som viser kampene. La i visninger.js og fulgte med
// utrullingen til 15. september 2026 (#79); na kommer den fra Supabase,
// pa lasset i det samme /api/svar-kallet. Tom til det svaret er inne —
// og det er riktig: «ingen har meldt inn» er det normale svaret, sa en
// rad uten stjerne ser ut som en rad, ikke som noe som mangler.
let sisteVisninger = [];

async function hentSvar(rot, del, data) {
  if ((del !== "neste" && del !== "venner") || !data || !Array.isArray(data.kamper)) return;

  // Spor om de kampene som faktisk star pa skjermen — og na er det hele
  // vinduet, ikke forste runde. Taket pa tjue id-er holdes av buntingen i
  // hentSvarFor(), ikke av at lista kappes i forkant: en kamp man kan se
  // skal ha lista si.
  const ider = (data.kamper || []).map(kampNokkelFor).filter(Boolean);
  if (!ider.length) return;

  const hentet = await hentSvarFor(ider);
  // Stille her, med vilje: lista er et tillegg til kampen, ikke kampen.
  // En feilmelding under hver eneste rad ville dekket over runden. Den som
  // faktisk trykker «Jeg blir med», far beskjed — det er der man venter et
  // svar. Vennefanen er det motsatte: der er lista alt som finnes.
  if (hentet.feil) return;
  sisteSvar = hentet.svar;
  sisteVisninger = hentet.visninger;
  tegnSvar(rot);
}

// Svarene for kampene som star pa skjermen, uansett hvor mange de er.
//
// Tjenesten kapper spørringen ved KAMPER_MAKS id-er, og kappingen er
// stille: id-ene etter den tjuende gir ingen feil, de gir ingen rader.
// Buntingen er det eneste som holder taket na. Rundevisningen kappet lista
// til forste runde for, og det holdt den under tjue av seg selv — men bare
// nar kampene baerer et rundetall, som TheSportsDBs kommende kamper ikke
// alltid gjor. Den beskyttelsen var uansett en bivirkning av at halve
// vinduet ble kastet, og vinduet vises i sin helhet fra 14. september 2026.
//
// Sa: spørringen deles opp framfor a kappes. Fem ligaer i vennefanen blir
// fem-seks kall, ikke ett per kamp — og fortsatt ett kall for en vanlig
// runde.
async function hentSvarFor(ider) {
  const bunter = [];
  for (let i = 0; i < ider.length; i += KAMPER_MAKS) {
    bunter.push(ider.slice(i, i + KAMPER_MAKS));
  }

  const svar = [];
  const visninger = [];
  let feil = "";

  await Promise.all(bunter.map(async (bunt) => {
    try {
      const respons = await fetch("/api/svar?kamper=" + encodeURIComponent(bunt.join(",")),
        { headers: { "Accept": "application/json" } });
      const json = JSON.parse(await respons.text());
      if (!respons.ok || json.feil) {
        feil = feil || String(json.feil || "Tjenesten svarte " + respons.status) + hvemSviktet(json);
        return;
      }
      tolkSvar(json.svar).forEach((s) => svar.push(s));
      tolkVisninger(json.visninger).forEach((v) => visninger.push(v));
    } catch (err) {
      feil = feil || "Klarte ikke å hente hvem som blir med.";
    }
  }));

  return { svar, visninger, feil };
}

function tegnSvar(rot) {
  const kart = perKamp(sisteSvar);
  loftKamper(rot, kart);
  Array.from(rot.querySelectorAll(".kamp")).forEach((rad) => {
    const gammel = rad.querySelector(".kamp-blirmed");
    if (gammel) gammel.remove();

    // «Denne kampen vises pa: …» tegnes ogsa her, og ikke bare i
    // kamprad(). Visningene la i koden og fulgte med utrullingen til
    // 15. september 2026; na kommer de over nettet, i det samme svaret,
    // og det lander **etter** at runden star ferdig. Tegnet vi linja bare
    // nar raden lages, ville den aldri dukket opp. Samme felle som det
    // apne kortet under — og den ble fanget av at dette er tredje gang
    // den slar til.
    const gammelViser = rad.querySelector(".kamp-viser");
    if (gammelViser) gammelViser.remove();
    const kampen = radensKamp(rad);
    if (kampen && rad.classList.contains("delbar")) {
      const viser = viserlinje(kampen);
      if (viser) {
        const panel = rad.querySelector(".kamp-panel");
        const blirMed = rad.querySelector(".kamp-blirmed");
        const for_ = blirMed || panel;
        if (for_) rad.insertBefore(viser, for_);
        else rad.appendChild(viser);
      }
    }

    const svar = kart.get(String(rad.dataset.kamp || "")) || [];
    const okt = konto.okt();
    // «Rune blir med» sier hvem, ikke hvor — og hvor er det man apner
    // kortet for a finne ut. Star du selv pa lista, leses stedet ditt
    // forst, sa du ser det mens du blar.
    const tekst = blirMedLinje(svar, okt && okt.bruker, radensKamp(rad));
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

  // Star et kort apent, ma det tegnes pa nytt na. Svarene lander etter at
  // runden star ferdig, sa apner man en kamp med det samme, var stedet
  // man skal til aldri merket — og ingenting i kortet sa hvor man skulle.
  // Det var den halvdelen av feilen som ikke var synlig.
  if (apentPanel && apentPanel.panel.tegnSteder) {
    apentPanel.panel.tegnSteder();
    const kamp = apentPanel.panel.kamp;
    if (kamp) tegnPanelListe(kamp);
  }
}

// Kampen en rad hoerer til. Vaeret og arenaen ligger pa kampobjektet,
// ikke pa raden, sa den huskes der nar raden tegnes.
function radensKamp(rad) {
  return (rad && rad.kamp) || null;
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

  // Ingen blir med enda: lista skal sta som en tidsrekke, uten bolker.
  // Overskriftene ryddes ikke bort her — tegnBolker() bygger lista pa nytt
  // og tegner bade runde- og dagskiller selv. En rydding her traff ogsa
  // stien under, der ingenting tegnes pa nytt, og strippet rundeskillene
  // fra en liste som sto helt riktig.
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

  // medRunder: skal rundeskillene tegnes inni bolken? I den loftede
  // bolken er svaret nei — den er plukket pa tvers av runder, sa «Runde
  // 22» over to kamper som tilfeldigvis er fra samme runde ville sagt at
  // bolken var runden. I resten er rekkefolgen fortsatt tidsrekka, og da
  // hoerer skillene hjemme.
  const bolk = (tittel, gruppe, medRunder) => {
    if (!gruppe.length) return;
    if (tittel) {
      const h = el("li", "kamp-bolk", tittel);
      liste.appendChild(h);
    }
    let forrigeDag = null;
    let forrigeRunde = null;
    gruppe.forEach((rad) => {
      const runde = medRunder ? (rad.dataset.runde || "") : "";
      if (runde && runde !== forrigeRunde) {
        forrigeRunde = runde;
        forrigeDag = null;
        liste.appendChild(el("li", "kamp-runde", runde));
      }
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
      med.length + " kamper noen blir med på", med, false);
    bolk("Resten av kampene", uten, true);
  } else {
    bolk(null, uten, true);
  }

  if (notis) liste.appendChild(notis);
}

// Vennene nederst i kortet, gruppert etter stedet de skal til:
//
//     Lincoln Pub   Ola og Kari
//     Lerkendal     Per
//
// Linja under kampen sier hvor mange og hvem — nok nar man blar. Kortet
// sier hvor man moter dem, og det er sporsmalet man apnet kortet for a
// svare pa. «3 blir med: Ola, Kari og Per» sa ingenting om det.
function tegnPanelListe(kamp) {
  const panel = apentPanel && apentPanel.panel;
  const boks = panel && panel.querySelector(".kamp-panel-liste");
  if (!boks) return;

  boks.replaceChildren();
  const mine = sisteSvar.filter((s) => s.kampId === kampNokkelFor(kamp));

  // Vennene staar naa i raden til stedet de skal til — stedet og folka er
  // én ting. Igjen her staar bare de som sa at de blir med uten aa si
  // hvor: de har ingen rad aa staa i, og skal ikke falle ut av kortet.
  // (Radene som alt ligger i basen med hvor='hjemme' er slike.)
  const uten = perSted(mine, kamp).filter((g) => !g.sted);
  if (!uten.length) return;

  uten.forEach((g) => {
    const rad = el("div", "sted-rad");
    const merke = el("span", "kamp-blirmed-merke", "✓");
    merke.setAttribute("aria-hidden", "true");
    rad.appendChild(merke);
    rad.appendChild(el("span", "sted-rad-navn", listeTekst(g.navn)));
    rad.appendChild(el("span", "sted-rad-uten", "sa ikke hvor"));
    boks.appendChild(rad);
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
    .find((k) => kampNokkelFor(k) === String(invitasjon.kampId) ||
                 String(k.id) === String(invitasjon.kampId));
  if (!kamp) return;

  const rad = Array.from(rot.querySelectorAll(".kamp"))
    .find((r) => r.dataset.kamp === kampNokkelFor(kamp));
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
  const nokkel = kampNokkelFor(kamp) + "@" + kamp.dato;
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
