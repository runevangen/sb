// Admin-portalen. Enkel med vilje: logg inn, velg pub, kryss av kamper,
// lagre.
//
// Den skriver ikke selv — den sender valget til /api/visninger, som er
// det eneste stedet passordet finnes. Portalen kan ligge apent; uten
// passord skjer ingenting.
//
// **To lasser, og den som holder er databasens.** ADMIN_PASSORD er doren
// til skjemaet. Selve skrivingen gar med din egen okt fra appen, og RLS
// slar opp uid-en i visning_skrivere — passordet vart betyr ingenting
// for Supabase (#79). Derfor ma du vaere logget inn i appen for a lagre.
//
// Passordet forst: resten av portalen ligger skjult til tjenesten har
// godtatt det. Det er ikke sikkerheten — den ligger i funksjonen og i
// basen — men det er ordenen. Den som apner
// sida skal se ett felt, ikke et skjema hen ikke kan lagre. Og det
// sparer et kall mot API-Football per apning: kvoten er hundre i dognet.
//
// Passordet ligger i en variabel her, ikke i sessionStorage: en
// oppfriskning er billigere enn et passord som blir liggende.

import { KURATERTE } from "./puber.js";
import { oktGyldig, kanFornyes } from "./konto-data.js";
import { LIGAER, kampNokkel } from "./fotball-data.js";
import { sistInneTekst, PIN_MIN, PIN_MAKS } from "./pin-data.js";
import { publisteRad, alleredeILista } from "./pub-forslag-data.js";
import { PUBTYPER, PUBSIKKERHET, pubNokkel, sjekkPubRad, slaSammenPuber,
  koordinatFraLenke, BYER, byFor, PUBLISTE_FELT } from "./pub-data.js";
import { visningsHint, rundeTall, lagreKnappTekst } from "./visning-data.js";

const felt = (id) => document.getElementById(id);
let kamper = [];
let passord = "";

// Avkryssingene slik de sist ble lagret, som en signatur. Meldt 17.
// september 2026: «Jeg trykker lagre, far beskjed at de er lagret, sa
// dukker lagre-knappen opp igjen.» Den gjorde det: boksene sto uroert, og
// knappen sa fortsatt «Lagre 5 kamper». En knapp som ser ut som den har
// arbeid a gjore, nar den ikke har det, er en kvittering som trekker seg
// selv tilbake.
//
// Signaturen settes to steder: etter en vellykket lagring, og nar lista
// tegnes — det som star der da, kom fra basen og ER det lagrede.
let lagretSignatur = null;

function valgtSignatur() {
  return alleBokser().filter((b) => b.checked).map((b) => b.value).sort().join("|");
}

// Rettelsene som ligger oppa puber.js, slik de sist ble lest (#80).
// Den sammensatte lista regnes av denne og fila, aldri lagret for seg: to
// lister som kan gli fra hverandre er nettopp det ett sted skal slippe.
// Star her framfor nede hos editoren fordi pubvelgeren leses av den for
// portalen er apnet, og en `let` lenger nede ville vaert i dodsonen da.
let pubRettelser = [];

// Visningene som alt star lagret. La i visninger.js og fulgte med
// utrullingen til 15. september 2026 (#79); na hentes de ved apning.
let visninger = [];

// Okten din, den samme appen bruker. Portalen ligger pa samme domene, sa
// den kan lese den — og det er nettopp poenget med a skrive med din egen
// okt framfor med en nokkel: databasen avgjor om du far lov, ikke vi.
const KONTO_KEY = "sb-konto";

function lesOkt() {
  let lagret = null;
  try {
    lagret = JSON.parse(localStorage.getItem(KONTO_KEY));
  } catch (err) {
    return null;
  }
  // Samme skille som i appen: et utlopt tilgangstoken er ikke det samme
  // som a vaere logget ut. Portalen fornyer ikke selv — da ma du apne
  // appen — men den skal si det framfor a pasta at du er logget ut.
  if (!oktGyldig(lagret) && !kanFornyes(lagret)) return null;
  return lagret;
}

/* ---------- pubvelgeren ---------- */

// «usikker» vises ikke i appen, og skal da ikke kunne settes her heller.
//
// Velgeren tegnes to ganger: en gang av fila alene, sa den star der med
// det samme, og en gang til nar rettelsene fra basen har landet (#80).
// Ellers kunne et sted du nettopp la inn, ikke velges — og et sted du tok
// ut, fortsatt velges.
let PUBER = [];

function tegnPubvelger() {
  const valgt = felt("pub").value;
  PUBER = slaSammenPuber(KURATERTE, pubRettelser)
    .filter((p) => p.sikkerhet !== "usikker")
    .slice()
    .sort((a, b) => a.navn.localeCompare(b.navn, "nb"));

  felt("pub").textContent = "";
  PUBER.forEach((p) => {
    const valg = document.createElement("option");
    valg.value = p.navn;
    valg.textContent = p.navn + (p.bydel ? " (" + p.bydel + ")" : "");
    felt("pub").appendChild(valg);
  });
  // Puben admin sto pa skal bli staende. Er den tatt ut av lista, faller
  // valget til den forste — og da er det riktig at kampene tegnes pa nytt.
  if (valgt && PUBER.some((p) => p.navn === valgt)) felt("pub").value = valgt;
  else if (valgt) tegnKamper();
}

tegnPubvelger();
felt("pub").addEventListener("change", tegnKamper);

/* ---------- ligavelgeren ---------- */

// Ligaene kommer fra fotballmodulen, ikke fra en egen liste her: kampene
// admin krysser av er de samme kommende kampene fotballfanen viser, og
// da skal ikke de to listene kunne gli fra hverandre.
Object.keys(LIGAER).forEach((nokkel) => {
  const valg = document.createElement("option");
  valg.value = nokkel;
  valg.textContent = LIGAER[nokkel].navn + " (" + LIGAER[nokkel].land + ")";
  felt("liga").appendChild(valg);
});
felt("liga").addEventListener("change", () => { if (passord) hentKamper(); });

/* ---------- adgang ---------- */

// Sporr tjenesten om den i det hele tatt er satt opp, for admin har
// gjort noe. Mangler ADMIN_PASSORD eller GITHUB_TOKEN, star det her —
// med navnet pa den som mangler — framfor a mote admin som «Portalen er
// ikke satt opp» etter at kampene er krysset av.
sjekkOppsett();

async function sjekkOppsett() {
  try {
    const respons = await fetch("/api/visninger", { headers: { "Accept": "application/json" } });
    const data = JSON.parse(await respons.text());
    // Bare et tydelig nei skal stenge knappen. Svarer en eldre utrulling
    // noe annet pa GET, lar vi innloggingen forsoke.
    if (Array.isArray(data.visninger)) visninger = data.visninger;
    if (data.klar !== false) return;
    visAdgang(data.feil || "Portalen er ikke satt opp.", "feil");
    felt("loggInn").disabled = true;
  } catch (err) {
    // Nettverksfeil her skal ikke lase portalen.
  }
}

felt("loggInn").addEventListener("click", loggInn);
felt("passord").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); loggInn(); }
});
felt("loggUt").addEventListener("click", () => location.reload());

async function loggInn() {
  const forsok = felt("passord").value;
  if (!forsok) { visAdgang("Skriv passordet først.", "feil"); felt("passord").focus(); return; }
  felt("loggInn").disabled = true;
  visAdgang("Sjekker …", "");
  try {
    const respons = await fetch("/api/visninger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handling: "sjekk", passord: forsok }),
    });
    const data = JSON.parse(await respons.text());
    if (!respons.ok || data.feil) {
      visAdgang(data.feil || ("Tjenesten svarte " + respons.status), "feil");
      felt("loggInn").disabled = false;
      return;
    }
  } catch (err) {
    visAdgang("Fikk ikke sjekket passordet: " + err.message, "feil");
    felt("loggInn").disabled = false;
    return;
  }

  // Feltet tommes: passordet lever i variabelen, ikke i DOM-en.
  passord = forsok;
  felt("passord").value = "";
  felt("passord").disabled = true;
  felt("loggInn").hidden = true;
  felt("loggUt").hidden = false;
  felt("adgangHint").textContent = "Passordet ligger bare i denne fanen, til du logger ut eller lukker den.";
  visAdgang("Innlogget.", "ok");
  felt("portal").hidden = false;
  hentKamper();
  hentBrukere();
  hentForslag();
  hentSteder();
}

function visAdgang(tekst, art) {
  const m = felt("adgangMelding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}

/* ---------- brukerne ---------- */

// Hvem har logget inn, nar kom de forst, og nar logget de sist inn.
// Tallene kommer fra Supabase selv, ikke fra noe vi teller: en teller vi
// forer selv ville kunne gli fra virkeligheten uten at noen merket det.
//
// Det gjor at kolonnen er PALOGGING og ikke bruk: appen holder telefonen
// innlogget med roterende fornyere, og en fornying rorer ikke
// last_sign_in_at. Derfor heter kolonnen «Sist palogget» i portalen.
//
// Nokkelen som trengs for a se og endre andres kontoer ligger bare i
// /api/brukere. Portalen sender passordet og far en liste; den ser aldri
// noen PIN, for PIN-er ligger hashet hos Supabase. Admin kan sette en
// ny, ikke lese den gamle.
async function brukerKall(kropp) {
  const respons = await fetch("/api/brukere", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(Object.assign({ passord }, kropp)),
  });
  let data = null;
  try {
    data = JSON.parse(await respons.text());
  } catch (err) {
    throw new Error("Uventet svar fra brukerlista.");
  }
  if (!respons.ok || !data || data.feil) {
    throw new Error((data && data.feil) || ("Tjenesten svarte " + respons.status + "."));
  }
  return data;
}

async function hentBrukere() {
  felt("brukerHint").textContent = "Henter brukerne …";
  felt("brukerHint").hidden = false;
  try {
    const data = await brukerKall({ handling: "liste" });
    tegnBrukere(data.brukere || []);
    // Oktene er et tillegg til lista, sa et feilet oktkall velter ikke
    // portalen. Men en tom kolonne er ikke til a skille fra «ingen har
    // vaert inne», og da skal det sta hvorfor.
    felt("brukerOktfeil").hidden = !data.oktfeil;
    felt("brukerOktfeil").textContent = data.oktfeil || "";
  } catch (err) {
    felt("brukere").hidden = true;
    felt("brukerHint").textContent = err.message;
  }
}

/* ---------- foreslatte steder (#80) ---------- */

// Koen, ikke lista. puber.js baerer en redaksjonell vurdering, og
// hver rad har kilde og sjekket — derfor skriver ingenting her til fila.
// Portalen gir raden ferdig formet; et menneske limer den inn, slar opp
// koordinatene og setter kilden.
async function forslagKall(kropp) {
  const okt = lesOkt();
  if (!okt || !okt.token) {
    throw new Error("Logg inn i appen først. Køen leses med din egen økt.");
  }
  const respons = await fetch("/api/pub-forslag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ passord, token: okt.token }, kropp)),
  });
  const data = JSON.parse(await respons.text());
  if (!respons.ok || !data || data.feil) {
    const err = new Error((data && data.feil)
      || ("Tjenesten svarte " + respons.status + "."));
    // `forsok` er tjenestens egne ord om hvem som svarte hva. Den ble
    // kastet her for, og da sto admin igjen med «Fikk ikke svar fra
    // OpenStreetMap» uten a kunne se om det var en tjener som var nede,
    // en sporring som ble avvist, eller var egen frist som lop ut.
    err.forsok = (data && data.forsok) || [];
    throw err;
  }
  return data;
}

async function hentForslag() {
  felt("forslagHint").textContent = "Henter forslagene …";
  felt("forslagHint").hidden = false;
  try {
    const data = await forslagKall({ handling: "liste" });
    tegnForslag(data.forslag || []);
  } catch (err) {
    felt("forslagListe").textContent = "";
    felt("forslagHint").textContent = err.message;
  }
}

// Koen slik den sist ble hentet. Holdes fordi en lagring i stedskjemaet
// ma kunne finne forslaget den svarer pa — se merkForslagLagtInn.
let forslagKo = [];

function tegnForslag(liste) {
  forslagKo = Array.isArray(liste) ? liste : [];
  const boks = felt("forslagListe");
  boks.textContent = "";

  // Behandlede rader blir staende i basen, men koen viser bare det som
  // gjenstar: en liste som vokser med gamle avgjorelser blir ikke lest.
  const nye = liste.filter((f) => f.status === "ny");
  if (!nye.length) {
    felt("forslagHint").hidden = false;
    felt("forslagHint").textContent = liste.length
      ? "Ingen nye forslag. " + liste.length + " er behandlet."
      : "Ingen har foreslått et sted ennå.";
    return;
  }
  felt("forslagHint").hidden = true;

  nye.forEach((f) => {
    const rad = document.createElement("div");
    rad.className = "forslag";

    const tittel = document.createElement("p");
    tittel.className = "forslag-navn";
    tittel.textContent = f.navn;
    if (alleredeILista(f.navn, KURATERTE)) {
      const merke = document.createElement("span");
      merke.className = "forslag-merke";
      merke.textContent = "står allerede i lista";
      tittel.appendChild(merke);
    }
    rad.appendChild(tittel);

    const under = document.createElement("p");
    under.className = "forslag-under";
    under.textContent = f.adresse
      + (f.viserFotball ? " · viser fotball" : " · uvisst om de viser fotball")
      + (f.merknad ? " · " + f.merknad : "");
    rad.appendChild(under);

    // Raden ferdig formet, for den som vil flytte stedet helt inn i
    // puber.js. lat/lon og kilde star tomme med vilje: de ma slas
    // opp, og oppdiktede tall ville vaert verre enn ingen rad.
    //
    // Editoren under er den korte veien, og den vanlige. Fila er for det
    // som skal sta ogsa nar Supabase er nede.
    const kode = document.createElement("pre");
    kode.className = "forslag-kode";
    kode.textContent = publisteRad(f);
    rad.appendChild(kode);

    const knapper = document.createElement("div");
    knapper.className = "forslag-knapper";

    // Forslaget rett inn i skjemaet, med navn og adresse fylt ut. Dette
    // er det eneste stedet et forslag og lista motes — og det er et
    // menneske som trykker, med koordinater og kilde igjen a fylle.
    // ADR 0019 star: det finnes ingen vei fra skjemaet pa nettet og rett
    // inn i det leseren ser.
    const iEditor = document.createElement("button");
    iEditor.className = "lenke";
    iEditor.type = "button";
    iEditor.textContent = "Åpne i editoren";
    iEditor.addEventListener("click", () => {
      apneSted({
        navn: f.navn,
        adresse: f.adresse,
        type: f.viserFotball ? "sportsbar" : "pub",
        merknad: f.merknad,
      }, "");
      felt("stedSkjema").scrollIntoView({ block: "center" });
    });
    knapper.appendChild(iEditor);

    const lagtInn = document.createElement("button");
    lagtInn.className = "lenke";
    lagtInn.type = "button";
    lagtInn.textContent = "Lagt inn";
    lagtInn.addEventListener("click", () => behandleForslag(f, "lagt-inn"));

    const avvis = document.createElement("button");
    avvis.className = "lenke";
    avvis.type = "button";
    avvis.textContent = "Avvis";
    avvis.addEventListener("click", () => behandleForslag(f, "avvist"));

    knapper.appendChild(lagtInn);
    knapper.appendChild(avvis);
    rad.appendChild(knapper);
    boks.appendChild(rad);
  });
}

async function behandleForslag(f, status) {
  const m = felt("forslagMelding");
  m.textContent = "Lagrer …";
  m.className = "melding";
  try {
    await forslagKall({ handling: "behandle", id: f.id, status });
    m.textContent = status === "lagt-inn"
      ? "«" + f.navn + "» er merket som lagt inn. Sjekk at stedet står under"
        + " Steder — merket forsvinner herfra uansett, og det er ikke det"
        + " samme som at raden finnes."
      : "«" + f.navn + "» er avvist.";
    m.className = "melding ok";
    hentForslag();
  } catch (err) {
    m.textContent = err.message;
    m.className = "melding feil";
  }
}

function tegnBrukere(liste) {
  const kropp = felt("brukerRader");
  kropp.textContent = "";

  if (!liste.length) {
    felt("brukere").hidden = true;
    felt("brukerHint").hidden = false;
    felt("brukerHint").textContent =
      "Ingen har logget inn ennå. Kontoen lages første gang noen skriver"
      + " fornavn og PIN i appen.";
    return;
  }

  liste.forEach((b) => kropp.appendChild(brukerRad(b)));
  felt("brukere").hidden = false;
  felt("brukerHint").hidden = false;
  // «Sortert etter hvem som var inne sist» sto her mens lista var sortert
  // pa PIN-datoen. Na er den sortert pa oktene, og setningen er sann.
  felt("brukerHint").textContent = liste.length === 1
    ? "Én bruker."
    : liste.length + " brukere. Øverst den som sist hadde appen i gang.";
}

function brukerRad(b) {
  const rad = document.createElement("tr");

  rad.appendChild(celle("td", "navn", b.navn));
  // Etiketten folger cella. Under 560 px faller `thead` bort og hver
  // bruker blir et kort — da er «12. sep. 2026» uten et ord foran seg to
  // datoer uten navn.
  const forst = celle("td", "tid", sistInneTekst(b.forst));
  forst.setAttribute("data-merke", "Første gang");
  rad.appendChild(forst);
  // «Sist inne» er okta, ikke PIN-datoen. Finnes ingen levende okt, star
  // det ingenting — en tom kolonne med en forklaring er aerligere enn a
  // fylle den med et tall som betyr noe annet.
  const sist = celle("td", "tid", b.aktiv
    ? sistInneTekst(b.aktiv)
    : "Ingen økt i live");
  sist.setAttribute("data-merke", "Sist inne");
  // PIN-datoen er ikke borte, den er bare ikke det kolonnen handler om.
  // Den er det du trenger nar noen har glemt PIN-en og du lurer pa om de
  // har vaert innom siden du ga dem en ny.
  sist.title = b.sist
    ? "Tastet PIN-en sist: " + sistInneTekst(b.sist)
    : "Har aldri tastet PIN-en";
  // «Jeg er inne men det star 2 dager siden.» Begge deler er sant, og det
  // er nettopp forvirringen: du er innlogget na, og feltet ved siden av er
  // sist du TASTET PIN-en. Appen holder telefonen innlogget med roterende
  // fornyere, og en fornying rorer ikke last_sign_in_at.
  //
  // Vi begynner ikke a telle bruk for a gjore tallet til noe annet — det
  // ville vaert sporingen ADR 0004 forbyr. Men den ene raden vi kan si noe
  // sant om uten a maale noe, er din egen: okta ligger i denne
  // nettleseren, og uid-en i den er den samme som i lista.
  const okt = lesOkt();
  if (okt && okt.bruker && String(okt.bruker) === String(b.id)) {
    const deg = document.createElement("span");
    deg.className = "deg";
    deg.textContent = " — det er deg, innlogget nå";
    sist.appendChild(deg);
  }
  rad.appendChild(sist);

  const valg = celle("td", "valg", "");

  // Ny PIN: feltet og knappen star sammen, sa det er tydelig at de to
  // horer til hverandre og til denne raden.
  const pinFelt = document.createElement("input");
  pinFelt.type = "text";
  pinFelt.inputMode = "numeric";
  pinFelt.maxLength = PIN_MAKS;
  pinFelt.placeholder = "Ny PIN";
  pinFelt.setAttribute("aria-label", "Ny PIN for " + b.navn);

  const settKnapp = document.createElement("button");
  settKnapp.type = "button";
  settKnapp.textContent = "Sett";
  settKnapp.addEventListener("click", async () => {
    const pin = String(pinFelt.value || "").replace(/\D+/g, "");
    if (pin.length < PIN_MIN) {
      visBruker("PIN-en er minst " + PIN_MIN + " siffer.", "feil");
      pinFelt.focus();
      return;
    }
    settKnapp.disabled = true;
    try {
      await brukerKall({ handling: "pin", id: b.id, pin });
      pinFelt.value = "";
      // PIN-en star i klartekst her, en gang, fordi admin ma kunne si den
      // videre. Den kan ikke leses igjen etterpa — heller ikke av oss.
      visBruker(b.navn + " har nå PIN " + pin + ". Si den videre nå; den kan ikke leses igjen.", "ok");
    } catch (err) {
      visBruker(err.message, "feil");
    } finally {
      settKnapp.disabled = false;
    }
  });

  // Sletting er endelig, sa den krever to trykk: det forste sier hva som
  // kommer til a skje, det andre gjor det. Samme grep som i appen.
  const slettKnapp = document.createElement("button");
  slettKnapp.type = "button";
  slettKnapp.className = "slett";
  slettKnapp.textContent = "Slett";
  slettKnapp.dataset.sikker = "nei";
  slettKnapp.addEventListener("click", async () => {
    if (slettKnapp.dataset.sikker !== "ja") {
      slettKnapp.dataset.sikker = "ja";
      slettKnapp.textContent = "Slett for godt";
      visBruker("Sletter " + b.navn + ", alle «jeg blir med»-svarene, og gjør"
        + " fornavnet ledig igjen. Trykk en gang til.", "feil");
      return;
    }
    slettKnapp.disabled = true;
    try {
      await brukerKall({ handling: "slett", id: b.id });
      visBruker(b.navn + " er slettet. Fornavnet er ledig igjen.", "ok");
      hentBrukere();
  hentForslag();
    } catch (err) {
      visBruker(err.message, "feil");
      slettKnapp.disabled = false;
    }
  });

  valg.appendChild(pinFelt);
  valg.appendChild(settKnapp);
  valg.appendChild(slettKnapp);
  rad.appendChild(valg);
  return rad;
}

function celle(tag, klasse, tekst) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  el.textContent = tekst;
  return el;
}

function visBruker(tekst, art) {
  const m = felt("brukerMelding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}

/* ---------- kampene ---------- */

async function hentKamper() {
  const liga = felt("liga").value || Object.keys(LIGAER)[0];
  kamper = [];
  felt("lagre").disabled = true;
  felt("kamper").replaceChildren(melding("Henter kamper …"));
  felt("kampHint").textContent = "";
  try {
    const respons = await fetch("/api/fotball/neste?liga=" + encodeURIComponent(liga),
      { headers: { "Accept": "application/json" } });
    const data = JSON.parse(await respons.text());
    if (data.feil) throw new Error(data.feil);
    kamper = data.kamper || [];
    // Funksjonen gir hele vinduet av kommende kamper, ikke bare neste
    // runde: en pub som vet hva den viser om to uker, skal kunne fore det
    // inn na. Leseren ser fortsatt en runde om gangen.
    const runder = data.runder && data.runder.length
      ? data.runder
      : (data.runde ? [data.runde] : []);
    felt("kampHint").textContent = runder.length
      ? runder.length + (runder.length === 1 ? " runde" : " runder") +
        " framover (" + runder.join(", ") + "), sesong " + data.sesong +
        ". Kilde: " + (data.kilde || "ukjent") + "."
      : "";
    if (data.sisteSesong === false) {
      felt("kampHint").textContent += " Merk: dette er ikke inneværende sesong.";
    }
  } catch (err) {
    felt("kamper").replaceChildren(melding("Fikk ikke hentet kamper: " + err.message));
    return;
  }
  tegnKamper();
}

function tegnKamper() {
  const liste = felt("kamper");
  liste.replaceChildren();
  // Over den tidlige returnen: overskrifta handler om puben, ikke om
  // hvorvidt ligaen har kamper. Under den ville den statt igjen med
  // forrige pub i en liga uten kommende kamper.
  settKamptittel();
  if (!kamper.length) {
    liste.appendChild(melding("Ingen kommende kamper i denne ligaen."));
    return;
  }
  const pub = felt("pub").value;
  const alt = visninger.filter((v) => v.pub === pub).map((v) => String(v.kampId));
  // Hvor mange av dem som faktisk star i lista under. Totalen alene svarte
  // ikke pa sporsmalet admin har — *ble det jeg lagret staende?* — og den
  // talte pa tvers av ligaer mens boksene viste én.
  const iLista = kamper.filter((k) => alt.indexOf(String(kampNokkel(k))) > -1
    || alt.indexOf(String(k.id)) > -1).length;
  felt("pubHint").textContent = visningsHint(alt.length, iLista, pub);

  let sisteRunde = null;
  kamper.forEach((k) => {
    // En overskrift per runde: krysser du av tjue kamper i strekk, skal du
    // se hvor den ene runden slutter og den neste begynner.
    if (k.runde && k.runde !== sisteRunde) {
      sisteRunde = k.runde;
      const skille = document.createElement("li");
      skille.className = "runde-skille";
      skille.textContent = k.runde;
      // Tallet star her fordi lista er lengre enn skjermen. Uten det ma
      // admin rulle gjennom hele for a vite om noe er krysset av lenger
      // nede — og tre synlige avkryssinger av fem ser ut som tap.
      const tall = document.createElement("span");
      tall.className = "runde-tall";
      skille.appendChild(tall);
      liste.appendChild(skille);
    }
    const rad = document.createElement("li");
    const merke = document.createElement("label");
    merke.className = "kamp";
    const boks = document.createElement("input");
    boks.type = "checkbox";
    boks.value = kampNokkel(k) || String(k.id);
    boks.checked = alt.indexOf(boks.value) > -1;
    const tekst = document.createElement("span");
    tekst.className = "kamp-navn";
    tekst.textContent = k.hjemme + " – " + k.borte;
    const tid = document.createElement("span");
    tid.className = "kamp-tid";
    tid.textContent = nar(k.dato) + (k.arena ? " · " + k.arena : "");
    tekst.appendChild(tid);
    merke.appendChild(boks);
    merke.appendChild(tekst);
    rad.appendChild(merke);
    liste.appendChild(rad);
  });
  // Det som star avkrysset na, kom fra basen. Da er det ogsa det lagrede.
  lagretSignatur = valgtSignatur();
  oppdaterLagreknapp();
}

// «Lagre» alene sier ikke hva den lagrer. Antallet og pubnavnet gjor at du
// ser hva du er i ferd med a gjore for du gjor det — og fanger den ene
// feilen som ellers er usynlig: feil pub valgt.
function settKamptittel() {
  const pub = felt("pub").value;
  felt("kampTittel").textContent = pub ? "Kamper " + pub + " viser" : "Kamper";
}

// Tallene per runde regnes av boksene selv, ikke av et tall vi forer:
// en teller ved siden av sannheten glir fra den.
function oppdaterRundetall() {
  let skille = null;
  let valgt = 0;
  let alle = 0;
  const skriv = () => {
    if (skille) skille.querySelector(".runde-tall").textContent = rundeTall(valgt, alle);
  };
  Array.from(felt("kamper").children).forEach((rad) => {
    if (rad.classList.contains("runde-skille")) {
      skriv();
      skille = rad;
      valgt = 0;
      alle = 0;
      return;
    }
    const boks = rad.querySelector(".kamp input");
    if (!boks) return;
    alle += 1;
    if (boks.checked) valgt += 1;
  });
  skriv();
}

function oppdaterLagreknapp() {
  oppdaterRundetall();
  const knapp = felt("lagre");
  const pub = felt("pub").value;
  const bokser = alleBokser();
  const antall = bokser.filter((b) => b.checked).length;
  if (!pub || !bokser.length) {
    knapp.textContent = "Lagre";
    knapp.disabled = true;
    return;
  }
  // Knappen sier hva trykket kommer til a GJORE, ikke hvor mange kamper
  // som star avkrysset. Meldt 18. september 2026: «Jeg legger til én, og
  // da star det 6 lagret. Egentlig sa lagrer bruker 1 da.»
  const for_ = new Set((lagretSignatur || "").split("|").filter(Boolean));
  const na = new Set(bokser.filter((b) => b.checked).map((b) => b.value));
  const lagt = [...na].filter((v) => !for_.has(v)).length;
  const fjernet = [...for_].filter((v) => !na.has(v)).length;

  knapp.textContent = lagreKnappTekst(lagt, fjernet, antall, pub);
  knapp.disabled = !lagt && !fjernet;
}

function nar(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "ukjent tid";
  return d.toLocaleString("nb-NO", {
    weekday: "long", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo",
  });
}

function melding(tekst) {
  const rad = document.createElement("li");
  const p = document.createElement("p");
  p.className = "hint";
  p.textContent = tekst;
  rad.appendChild(p);
  return rad;
}

/* ---------- kryss av ---------- */

function alleBokser() {
  return Array.from(document.querySelectorAll(".kamp input"));
}
felt("merkAlle").addEventListener("click", () => {
  alleBokser().forEach((b) => { b.checked = true; });
  oppdaterLagreknapp();
});
felt("merkIngen").addEventListener("click", () => {
  alleBokser().forEach((b) => { b.checked = false; });
  oppdaterLagreknapp();
});
// Hvert eneste kryss, ikke bare de to knappene over: teksten skal alltid
// si det samme som boksene. Lyttes pa lista framfor pa hver boks, sa den
// ogsa gjelder rader som tegnes senere.
felt("kamper").addEventListener("change", oppdaterLagreknapp);

/* ---------- lagring ---------- */

felt("lagre").addEventListener("click", async () => {
  if (!passord) { vis("Logg inn først.", "feil"); felt("passord").focus(); return; }

  // Skrivingen gar med din egen okt, ikke med en nokkel — databasen slar
  // opp uid-en i visning_skrivere og avgjor om den slipper gjennom. Uten
  // en okt er det ingenting a sende, og da skal det sta hvorfor framfor
  // at tjenesten svarer 401 pa noe som ser ut som passordet.
  const okt = lesOkt();
  if (!okt || !okt.token) {
    vis("Du må være logget inn i appen for å lagre. Åpne mvp-sb.netlify.app,"
      + " logg inn med fornavn og PIN, og kom tilbake hit.", "feil");
    return;
  }

  const valgte = alleBokser().filter((b) => b.checked).map((b) => b.value);
  felt("lagre").disabled = true;
  vis("Lagrer …", "");
  try {
    const respons = await fetch("/api/visninger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passord,
        token: okt.token,
        pub: felt("pub").value,
        kampIder: valgte,
        // Kampene sendes med, sa funksjonen slipper a hente dem pa nytt
        // og vi er sikre pa at det er de samme som sto pa skjermen.
        kamper: kamper.map((k) => ({ id: k.id, nokkel: kampNokkel(k),
          hjemme: k.hjemme, borte: k.borte, dato: k.dato })),
      }),
    });
    const data = JSON.parse(await respons.text());
    // 401 betyr to ulike ting na, og de krever hver sin handling.
    // Passordet er portalens dor; okten er databasens. A sende admin
    // tilbake til passordfeltet fordi Supabase-okten var utlopt, ville
    // vaert a be om noe som ikke hjelper.
    if (respons.status === 401 && /passord/i.test(String(data.feil || ""))) {
      // Passordet er byttet mens fanen sto apen. Da er innloggingen
      // ikke lenger sann, og skjemaet skal ikke se ut som om den er det.
      passord = "";
      vis("Passordet ble ikke godtatt. Logg inn på nytt.", "feil");
      visAdgang("Logg inn på nytt.", "feil");
      felt("passord").disabled = false;
      felt("loggInn").disabled = false;
      felt("loggInn").hidden = false;
      felt("loggUt").hidden = true;
      felt("portal").hidden = true;
    } else if (!respons.ok || data.feil) {
      vis(data.feil || ("Tjenesten svarte " + respons.status), "feil");
    } else {
      // Lista holdes i takt med det som faktisk ble skrevet, sa et bytte
      // av liga og tilbake viser avkrysningene som star i basen — ikke de
      // som sto der da portalen ble apnet.
      if (Array.isArray(data.visninger)) {
        const pubNa = felt("pub").value;
        const rort = kamper.map((k) => String(kampNokkel(k)));
        visninger = visninger
          .filter((v) => v.pub !== pubNa || rort.indexOf(String(v.kampId)) === -1)
          .concat(data.visninger);
      }
      // Det som nettopp gikk gjennom er det lagrede. Uten denne linja star
      // knappen igjen og ber om et trykk til, rett under kvitteringen som
      // sier at den er ferdig.
      lagretSignatur = valgtSignatur();
      vis(data.merknad || "Lagret.", "ok");
    }
  } catch (err) {
    vis("Fikk ikke lagret: " + err.message, "feil");
  }
  // Ikke `disabled = false` rett ut: da ville knappen bedt om et trykk
  // den nettopp har fatt. oppdaterLagreknapp avgjor ut fra signaturen.
  oppdaterLagreknapp();
});

function vis(tekst, art) {
  const m = felt("melding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}

/* ---------- stedene (#80) ---------- */

// **Fila er grunnfjellet.** puber.js ligger i koden, virker uten
// nettverk, og er det leseren ser om Supabase er nede. Editoren skriver
// aldri i den. Det som lagres her er rettelsene oppa — et nytt sted, en
// adresse som flyttet, et sted som la ned — og appen slar dem sammen
// selv. ADR 0020.
//
// Regelen fra ADR 0019 star: et forslag fra en leser er ikke en rad.
// Koen over er fortsatt koen, og ingen rad flytter seg derfra og hit av
// seg selv. Det som endret seg er hvor du limer.

// Nøkkelen til raden som redigeres, eller "" for et nytt sted.
let stedRedigeres = "";

function stedFelt() {
  return {
    navn: felt("stedNavn").value,
    bydel: felt("stedBydel").value,
    adresse: felt("stedAdresse").value,
    lat: felt("stedLat").value === "" ? NaN : Number(felt("stedLat").value),
    lon: felt("stedLon").value === "" ? NaN : Number(felt("stedLon").value),
    type: felt("stedType").value,
    lag: felt("stedLag").value.split(",").map((l) => l.trim()).filter(Boolean),
    kilde: felt("stedKilde").value,
    sikkerhet: felt("stedSikkerhet").value,
    sjekket: felt("stedSjekket").value,
    merknad: felt("stedMerknad").value,
    fjernet: felt("stedFjernet").checked,
  };
}

function fyllSted(p) {
  felt("stedNavn").value = (p && p.navn) || "";
  felt("stedBydel").value = (p && p.bydel) || "";
  felt("stedAdresse").value = (p && p.adresse) || "";
  felt("stedLat").value = (p && Number.isFinite(p.lat) && p.lat) ? p.lat : "";
  felt("stedLon").value = (p && Number.isFinite(p.lon) && p.lon) ? p.lon : "";
  felt("stedType").value = (p && p.type) || "pub";
  felt("stedLag").value = ((p && p.lag) || []).join(", ");
  felt("stedKilde").value = (p && p.kilde) || "";
  felt("stedSikkerhet").value = (p && p.sikkerhet) || "bekreftet";
  // Datoen er den som skal rettes oftest, og den skal si *na* — ikke
  // datoen raden ble skrevet forrige gang. Ser du pa stedet i dag, er
  // det i dag du har sjekket det.
  felt("stedSjekket").value = new Date().toISOString().slice(0, 10);
  felt("stedMerknad").value = (p && p.merknad) || "";
  felt("stedFjernet").checked = !!(p && p.fjernet);
  felt("stedTreff").textContent = "";
  felt("stedSokHint").hidden = true;
}

// PUBTYPER og PUBSIKKERHET kommer fra pub-data.js, ikke fra en liste her:
// blir de to uenige, kan portalen lagre en type appen ikke tegner.
PUBTYPER.forEach((t) => {
  const valg = document.createElement("option");
  valg.value = t;
  valg.textContent = t;
  felt("stedType").appendChild(valg);
});
PUBSIKKERHET.forEach((sk) => {
  const valg = document.createElement("option");
  valg.value = sk;
  valg.textContent = sk + (sk === "usikker" ? " (vises ikke i appen)" : "");
  felt("stedSikkerhet").appendChild(valg);
});

/* ---------------- feltene som MA fylles ut ---------------- */

// Hvilket felt i skjemaet som svarer til hvert navn i PUBLISTE_FELT.
//
// Merkingen leses UT AV den lista, ikke skrevet ved siden av den: legges
// et felt til der, skal stjerna folge. Et navn uten en id her blir
// staaende i `umerket`, og en test slaar ut framfor at et pakrevd felt
// star umerket i portalen.
const PAKREVD_ID = {
  navn: "stedNavn",
  bydel: "stedBydel",
  lat: "stedLat",
  lon: "stedLon",
  type: "stedType",
  kilde: "stedKilde",
  sikkerhet: "stedSikkerhet",
  sjekket: "stedSjekket",
};

// Et felt som ma fylles ut, skal SI det — ikke avsloere det etter at du
// har trykket lagre. «kilde» og «sjekket» er de to som oftest mangler, og
// begge ser ut som noe man kan hoppe over.
//
// Stjerna er for oyet og er aria-hidden: skjermleseren far
// `aria-required`, og «stjerne» lest hoyt for hvert felt er stoy.
function merkPakrevde() {
  const umerket = [];
  PUBLISTE_FELT.forEach((navnet) => {
    const id = PAKREVD_ID[navnet];
    const inn = id ? document.getElementById(id) : null;
    const merke = id ? document.querySelector('label[for="' + id + '"]') : null;
    if (!inn || !merke) { umerket.push(navnet); return; }
    inn.setAttribute("aria-required", "true");
    if (merke.querySelector(".pakrevd")) return;
    const stjerne = document.createElement("span");
    stjerne.className = "pakrevd";
    stjerne.textContent = "*";
    stjerne.setAttribute("aria-hidden", "true");
    merke.appendChild(stjerne);
  });
  // Testen leser denne: er den ikke tom, star et pakrevd felt umerket.
  felt("stedSkjema").dataset.umerket = umerket.join(",");
}

// Tas stedet UT av lista, kreves bare navnet — sjekkPubRad slipper en
// fjernet rad gjennom pa navnet alene, fordi det eneste den sier er at
// stedet ikke skal vises. Da ville atte stjerner vaert usant, og
// forklaringa sier hva som gjelder.
function oppdaterPakrevdTekst() {
  const ut = felt("stedFjernet").checked;
  felt("stedSkjema").classList.toggle("tatt-ut", ut);
  felt("stedPakrevdNote").textContent = ut
    ? "Stedet tas ut av lista. Da holder det med navnet."
    : "Felt merket * må fylles ut.";
}

merkPakrevde();

function apneSted(p, nokkel) {
  stedRedigeres = nokkel || "";
  fyllSted(p);
  settBy(p);
  // fyllSted setter haken uten a utlose `change`. Apner du et sted som alt
  // er tatt ut, ville forklaringa ellers sagt «ma fylles ut» om felt som
  // ikke kreves — og et skjema som lyver om sine egne krav er verre enn et
  // som ikke sier noe.
  oppdaterPakrevdTekst();
  felt("stedSkjema").hidden = false;
  felt("stedAvbryt").hidden = false;
  stedMelding("", "");
  // Oppslagene hoerer til stedet som var apent. Uten dette ville treffene
  // fra forrige sted statt igjen under et nytt navn.
  nullstillOppslag();
  felt("stedNavn").focus();
}

// Byene i velgeren kommer fra BYER, ikke fra en liste her: legges en by
// til der, star den i portalen uten at noen husker dette stedet.
function fyllByer() {
  const v = felt("stedBy");
  if (v.options.length) return;
  Object.keys(BYER).forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = BYER[n].navn;
    v.appendChild(o);
  });
}

// Byen soket skal lete i. Har stedet alt et koordinat, er byen gitt av
// tallene — da skal velgeren si det samme, ellers leter «Sla opp» et
// annet sted enn raden ligger.
//
// Koordinatet er fasiten, ikke velgeren: velgeren styrer bare hvor vi
// LETER. Derfor folger den tallene nar de endrer seg, og aldri motsatt —
// to felt som kan si hver sin by ville vaert to sannheter om ett sted.
function settBy(p) {
  fyllByer();
  const fra = p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
    ? byFor(Number(p.lat), Number(p.lon))
    : null;
  if (fra || !felt("stedBy").value) felt("stedBy").value = fra || "oslo";
}

// Kalles hver gang et koordinat lander i skjemaet — tastet, plukket fra
// et treff, eller limt inn som en kartlenke.
function synkBy() {
  settBy({ lat: felt("stedLat").value, lon: felt("stedLon").value });
}

function nullstillOppslag() {
  ["stedSokHint", "stedAdresseHint", "stedLenkeSvar", "stedHerSvar"].forEach((id) => {
    felt(id).textContent = "";
    felt(id).hidden = true;
  });
  ["stedTreff", "stedAdresseTreff"].forEach((id) => { felt(id).textContent = ""; });
  felt("stedLenke").value = "";
}

function lukkSted() {
  stedRedigeres = "";
  felt("stedSkjema").hidden = true;
  felt("stedAvbryt").hidden = true;
}

function stedMelding(tekst, art) {
  const m = felt("stedMelding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}

async function stedKall(kropp) {
  const okt = lesOkt();
  if (!okt || !okt.token) {
    throw new Error("Logg inn i appen først. Lagringen går med din egen økt.");
  }
  const respons = await fetch("/api/pub-liste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ passord, token: okt.token }, kropp)),
  });
  const data = JSON.parse(await respons.text());
  if (!respons.ok || !data || data.feil) {
    const err = new Error((data && data.feil)
      || ("Tjenesten svarte " + respons.status + "."));
    // `forsok` er tjenestens egne ord om hvem som svarte hva. Den ble
    // kastet her for, og da sto admin igjen med «Fikk ikke svar fra
    // OpenStreetMap» uten a kunne se om det var en tjener som var nede,
    // en sporring som ble avvist, eller var egen frist som lop ut.
    err.forsok = (data && data.forsok) || [];
    throw err;
  }
  return data;
}

async function hentSteder() {
  felt("stedHint").textContent = "Henter stedene …";
  felt("stedHint").hidden = false;
  try {
    const data = await stedKall({ handling: "liste" });
    pubRettelser = data.puber || [];
    tegnSteder();
    tegnPubvelger();
  } catch (err) {
    // Fila star uansett, sa lista tegnes med det vi har. Men det skal sta
    // at rettelsene ikke kom: en liste som ser komplett ut mens den ikke
    // er det, er verre enn en som sier ifra.
    pubRettelser = [];
    tegnSteder();
    felt("stedHint").hidden = false;
    felt("stedHint").textContent = "Viser bare puber.js: " + err.message;
  }
}

// Hvilken by en rad ligger i, lest ut av koordinatet. Ingen rad barer
// byen sin som et felt — `byFor()` er fasiten, og et felt ved siden av
// kunne vaert uenig med tallene.
//
// «uten» er ikke en feil: en rad som er TATT UT slipper gjennom paa navnet
// alene (sjekkPubRad), sa den kan mangle koordinater helt. En slik rad maa
// fortsatt kunne aapnes — et filter som skjuler den, har tatt den ut av
// portalen.
const UTEN_BY = "uten";

function byenTil(p) {
  const lat = Number(p && p.lat);
  const lon = Number(p && p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return UTEN_BY;
  return byFor(lat, lon) || UTEN_BY;
}

// Hvilken by som er valgt. Tom streng er alle.
let stedFilter = "";

// Velgeren bygges av det som faktisk ligger i lista, med tall: da ser du
// hvor stedene er framfor a klikke gjennom seks byer for a finne det ut.
function fyllStedFilter(rader) {
  const antall = new Map();
  rader.forEach((p) => {
    const by = byenTil(p);
    antall.set(by, (antall.get(by) || 0) + 1);
  });

  // Rekkefolgen i BYER, ikke i lista: den er den samme hver gang.
  const grupper = Object.keys(BYER).filter((n) => antall.has(n));
  if (antall.has(UTEN_BY)) grupper.push(UTEN_BY);

  // Er den valgte byen borte — siste sted der ble flyttet — faller vi
  // tilbake til alle framfor a vise en tom liste uten en vei ut.
  if (stedFilter && grupper.indexOf(stedFilter) === -1) stedFilter = "";

  const velger = felt("stedFilterBy");
  velger.textContent = "";
  const alle = document.createElement("option");
  alle.value = "";
  alle.textContent = "Alle byer (" + rader.length + ")";
  velger.appendChild(alle);
  grupper.forEach((n) => {
    const valg = document.createElement("option");
    valg.value = n;
    valg.textContent = (n === UTEN_BY ? "Uten koordinat" : BYER[n].navn)
      + " (" + antall.get(n) + ")";
    velger.appendChild(valg);
  });
  velger.value = stedFilter;

  // Én gruppe er ikke et valg. En velger som bare kan si det den alt
  // viser, er en kontroll uten et valg — og da er den i veien.
  felt("stedFilterRad").hidden = grupper.length < 2;
}

function tegnSteder() {
  const liste = felt("stedListe");
  liste.textContent = "";

  const rettet = new Map();
  pubRettelser.forEach((p) => rettet.set(p.nokkel, p));

  // Fila forst, i sin egen rekkefolge, sa det admin alt kjenner igjen
  // star der det pleier. Nye steder legges bakerst av slaSammenPuber.
  const sammen = slaSammenPuber(KURATERTE, pubRettelser);
  const skjulte = pubRettelser.filter((p) => p.fjernet);
  const alle = sammen.concat(skjulte);

  fyllStedFilter(alle);

  const vist = stedFilter ? alle.filter((p) => byenTil(p) === stedFilter) : alle;
  vist.forEach((p) => {
    const nokkel = pubNokkel(p.navn);
    liste.appendChild(stedRad(p, nokkel, rettet.get(nokkel)));
  });

  // Tallet som star, ma vaere tallet som vises. «26 steder i lista» over en
  // liste med ett sted er sant om lista og usant om skjermen, og da leses
  // det som at de andre er borte.
  //
  // «Steder» og «rader» er ikke det samme, og forskjellen er de fjernede:
  // et sted som er tatt ut er ikke i lista, men raden staar her sa den kan
  // aapnes igjen. Ufiltrert teller vi stedene; filtrert teller vi radene,
  // for det er dem filteret gar pa.
  const kilde = pubRettelser.length
    ? pubRettelser.length + " er rettet herfra; resten står i puber.js."
    : "Alle står i puber.js. Ingenting er rettet herfra ennå.";
  const byNavn = stedFilter === UTEN_BY ? "uten koordinat"
    : (BYER[stedFilter] ? "i " + BYER[stedFilter].navn : "");
  felt("stedHint").hidden = false;
  felt("stedHint").textContent = stedFilter
    ? "Viser " + vist.length + " " + byNavn + ", av " + alle.length
      + " rader. " + kilde
    : sammen.length + " steder i lista. " + kilde;
}

function stedRad(p, nokkel, rettelse) {
  const rad = document.createElement("li");

  const navn = document.createElement("span");
  navn.className = "sted-navn";
  navn.textContent = p.navn;

  if (rettelse) {
    const merke = document.createElement("span");
    merke.className = "sted-merke" + (rettelse.fjernet ? " skjult" : "");
    merke.textContent = rettelse.fjernet ? " tatt ut" : " rettet her";
    navn.appendChild(merke);
  }

  const under = document.createElement("span");
  under.className = "sted-under";
  under.textContent = [p.bydel, p.type, p.sikkerhet,
    p.sjekket ? "sjekket " + p.sjekket : "uten dato"].filter(Boolean).join(" · ");
  navn.appendChild(under);
  rad.appendChild(navn);

  const rediger = document.createElement("button");
  rediger.className = "lenke";
  rediger.type = "button";
  rediger.textContent = "Rediger";
  rediger.addEventListener("click", () => apneSted(rettelse || p, nokkel));
  rad.appendChild(rediger);

  return rad;
}

// Et sted som nettopp ble lagret svarer pa et forslag i koen. Da skal
// forslaget merkes, ikke bli staende.
//
// Meldt 18. september 2026: «Jeg provde a lagre RBK pobb og sant. Men ser
// den fortsatt i forslagskasse.» Den gangen var svaret at lagringen ble
// avvist — men selv nar den gar gjennom, ble forslaget staende til noen
// trykket «Lagt inn» i tillegg. To handlinger for én avgjorelse, og den
// naturlige er den forste.
//
// Merkingen henger paa lagringen og ikke motsatt, og det er hele poenget:
// ADR 0019 krever at et menneske gjor raden ferdig, og det er nettopp det
// som nettopp skjedde — koordinater, kilde og dato fylt ut for hand.
// «Lagt inn»-knappen star igjen for radene som ble limt rett inn i fila.
//
// Bare «ny» merkes. Et forslag som alt er avvist skal ikke vekkes til
// live av at noen redigerer stedet et halvt ar senere.
async function merkForslagLagtInn(navn) {
  const treff = forslagKo.filter((f) => f.status === "ny"
    && pubNokkel(f.navn) === pubNokkel(navn));
  if (!treff.length) return null;
  try {
    for (const f of treff) {
      await forslagKall({ handling: "behandle", id: f.id, status: "lagt-inn" });
    }
  } catch (err) {
    // Stedet ER lagret. En feilet merking skal sies, men ikke se ut som at
    // lagringen gikk galt — da ville admin provd igjen pa noe som sto.
    return " Forslaget i køen ble ikke merket: " + err.message;
  }
  hentForslag();
  return " Forslaget i køen er merket som lagt inn.";
}

async function lagreSted() {
  const p = stedFelt();
  const problemer = sjekkPubRad(p);
  if (problemer.length) {
    stedMelding(problemer[0], "feil");
    return;
  }

  // Navnet er nokkelen. Endres det pa en rad som alt finnes, blir raden
  // en ny rad — og den gamle star igjen. Det skal sies for det skjer, ikke
  // oppdages etterpa.
  if (stedRedigeres && pubNokkel(p.navn) !== stedRedigeres) {
    stedMelding("Navnet er nøkkelen. Endrer du det, blir dette et nytt sted,"
      + " og det gamle står igjen. Ta det gamle ut av lista først.", "feil");
    return;
  }

  felt("stedLagre").disabled = true;
  stedMelding("Lagrer …", "");
  try {
    const data = await stedKall({ pub: p });
    // Et sted som er tatt UT av lista svarer ikke pa et forslag om a ta
    // det inn. Da skal koen sta urort.
    const merket = p.fjernet ? null : await merkForslagLagtInn(p.navn);
    stedMelding((data.merknad || "Lagret.") + (merket || ""), "ok");
    lukkSted();
    await hentSteder();
  } catch (err) {
    stedMelding(err.message, "feil");
  }
  felt("stedLagre").disabled = false;
}

// Oppslaget i OpenStreetMap. Kommentaren i puber.js har alltid sagt
// at OSMs koordinat brukes nar navnet stemmer — dette er akkurat det,
// bare gjort av maskinen framfor for hand. Treffet fyller feltene; det
// avgjor ingenting.
//
// To innganger, fordi navnet ikke alltid finnes: OSM kjenner «Berglyveien
// 4J» selv om hen ikke kjenner puben i forste etasje. Norske adresser i
// OSM er importert fra Kartverket, sa huset star der ogsa nar stedet ikke
// gjor det.
// Byen star i meldinga, ikke bare i sporringen. «Ingen treff pa RBK Pub»
// er sant i Oslo og usant i Trondheim, og den som leser den skal se
// hvilken av dem den gjelder — ellers slutter man at stedet ikke finnes.
function valgtBy() {
  const n = felt("stedBy").value || "oslo";
  return { nokkel: n, navn: (BYER[n] || BYER.oslo).navn };
}

async function sokSted() {
  const navn = felt("stedNavn").value.trim();
  const by = valgtBy();
  await kjorOppslag({
    hint: "stedSokHint", liste: "stedTreff",
    kropp: { handling: "sok", navn, by: by.nokkel },
    tomt: "Ingen treff på «" + navn + "» i " + by.navn + ".",
  });
}

async function sokAdresseSted() {
  const adresse = felt("stedAdresse").value.trim();
  const by = valgtBy();
  await kjorOppslag({
    hint: "stedAdresseHint", liste: "stedAdresseTreff",
    kropp: { handling: "sok-adresse", adresse, by: by.nokkel },
    tomt: "Ingen treff på «" + adresse + "» i " + by.navn + ".",
  });
}

async function kjorOppslag(oppsett) {
  const hint = felt(oppsett.hint);
  const liste = felt(oppsett.liste);
  liste.textContent = "";
  hint.hidden = false;
  hint.textContent = "Søker i OpenStreetMap …";

  let data;
  try {
    data = await stedKall(oppsett.kropp);
  } catch (err) {
    hint.textContent = err.message;
    // Tjenestens egne ord om hvert speil. Uten dem er «Fikk ikke svar fra
    // OpenStreetMap» like forenlig med at Overpass er nede som med at var
    // egen frist lop ut — og admin kan ikke vite hvilken det var.
    visForsok(liste, err.forsok);
    return;
  }

  const treff = data.treff || [];
  if (!treff.length) {
    hint.textContent = oppsett.tomt + " Tast koordinatene selv,"
      + " eller lim inn en kartlenke.";
    visForsok(liste, data.forsok);
    return;
  }

  hint.textContent = (treff.length === 1
    ? "Ett treff. Trykk for å fylle inn."
    : treff.length + " treff. Trykk på det som er riktig.")
    + (data.utenNummer ? " Med husnummer blir søket smalere." : "");

  treff.forEach((t) => {
    const rad = document.createElement("li");
    const knapp = document.createElement("button");
    knapp.type = "button";
    knapp.textContent = t.navn;

    const under = document.createElement("span");
    under.className = "sted-under";
    under.textContent = [t.adresse, t.slag,
      t.lat.toFixed(4) + ", " + t.lon.toFixed(4)].filter(Boolean).join(" · ");
    knapp.appendChild(under);

    knapp.addEventListener("click", () => {
      // Navnet rores ikke: OSM skriver «O'Learys» der vi skriver «O'Learys
      // Vika», og navnet er nokkelen. Koordinatet er det vi kom for.
      felt("stedLat").value = t.lat.toFixed(4);
      felt("stedLon").value = t.lon.toFixed(4);
      synkBy();
      if (t.adresse && !felt("stedAdresse").value) felt("stedAdresse").value = t.adresse;
      if (t.nettsted && !felt("stedKilde").value) felt("stedKilde").value = t.nettsted;
      liste.textContent = "";
      hint.textContent = "Hentet fra OpenStreetMap. Sjekk at det stemmer.";
    });

    rad.appendChild(knapp);
    liste.appendChild(rad);
  });
}

// Hvert speil med sitt eget utfall. Rene opplysninger, ingen knapper: de
// er her for a leses, og for at neste melding om «fikk ikke svar» skal
// kunne besvares uten a gjette.
function visForsok(liste, forsok) {
  if (!Array.isArray(forsok) || !forsok.length) return;
  forsok.forEach((f) => {
    const rad = document.createElement("li");
    const linje = document.createElement("span");
    linje.className = "sted-under";
    const deler = [f.kilde];
    if (f.status) deler.push("HTTP " + f.status);
    if (f.utfall) deler.push(f.utfall);
    if (f.melding) deler.push(f.melding);
    if (f.ms !== undefined) deler.push(f.ms + " ms");
    linje.textContent = deler.filter(Boolean).join(" · ");
    rad.appendChild(linje);
    liste.appendChild(rad);
  });
}

// Utveien som ikke spor noen: koordinatet star i lenka admin limer inn.
// Den virker ogsa nar Overpass er nede, og det er hele poenget med den.
function lesKartlenke() {
  // Svaret star i sitt eget felt. Skrev vi over forklaringen, ville den
  // vaert borte for neste sted — og det er den som sier hvilke lenker som
  // virker.
  const ut = felt("stedLenkeSvar");
  ut.hidden = false;
  const limt = felt("stedLenke").value;
  const punkt = koordinatFraLenke(limt);
  if (!punkt || punkt.feil) {
    ut.textContent = (punkt && punkt.feil)
      || "Lim inn et koordinat eller en kartlenke først.";
    return;
  }
  felt("stedLat").value = punkt.lat.toFixed(4);
  felt("stedLon").value = punkt.lon.toFixed(4);
  synkBy();
  // «fra lenka» om et koordinat er en liten losn, men det er en losn: den
  // som limte inn to tall leser at appen tror hen gjorde noe annet, og
  // begynner a lure pa om den forsto det. Feltet tar begge deler, sa
  // svaret ma si hvilken av dem det faktisk var.
  ut.textContent = "Hentet " + punkt.lat.toFixed(4) + ", " + punkt.lon.toFixed(4)
    + (/https?:\/\//i.test(limt) ? " fra lenka." : " fra koordinatet du limte inn.")
    + " Sjekk at det stemmer.";
}

// **Den eneste veien inn som virker i Google Maps-appen.** Den lange
// URL-en med koordinatet i finnes bare i en nettleser med adressefelt; pa
// telefonen far du bare del-lenka, og den baerer ingenting (#116).
//
// Og punktet er bedre enn kartets: Googles eget punkt for et sted ligger
// ofte midt pa bygget, mens du star i dora. Star du der, er telefonen det
// noyaktigste kartet som finnes.
//
// Kilden fylles med det samme. Trykker du knappen, *er* du der — og det
// er noyaktig det kilden skal svare pa. Setningen star apen sa du kan
// skrive videre: «Var innom 19.09.2026, storskjerm i baren».
function hentHer() {
  const ut = felt("stedHerSvar");
  ut.hidden = false;
  if (!navigator.geolocation) {
    ut.textContent = "Denne nettleseren gir oss ingen posisjon."
      + " Tast koordinatet, eller lim det inn under.";
    return;
  }
  ut.textContent = "Spør om posisjonen …";

  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    felt("stedLat").value = lat.toFixed(4);
    felt("stedLon").value = lon.toFixed(4);
    synkBy();

    const idag = new Date().toISOString().slice(0, 10);
    const alt = felt("stedKilde").value.trim();
    // Star det noe der fra for, rores det ikke: en kilde er en vurdering,
    // og a skrive over den med var egen setning ville kastet den.
    if (!alt) felt("stedKilde").value = "Var innom " + norskDato(idag);
    felt("stedSjekket").value = idag;

    // Noyaktigheten er ikke pynt. Et punkt med 2 km usikkerhet er en
    // bygning et annet sted i byen, og da skal det stå — ikke skjules bak
    // fire desimaler som ser like presise ut uansett.
    const meter = Math.round(pos.coords.accuracy || 0);
    ut.textContent = "Hentet " + lat.toFixed(4) + ", " + lon.toFixed(4)
      + (meter ? " (på " + meter + " meter nær)" : "")
      + (alt ? "." : ". Kilden er fylt ut — skriv gjerne videre.");
  }, (err) => {
    // Avslatt posisjon er ikke en feil, det er et svar. De to krever ulike
    // ting av den som leser meldinga.
    ut.textContent = err && err.code === 1
      ? "Du sa nei til posisjon. Tast koordinatet, eller lim det inn under."
      : "Fikk ikke posisjonen (" + ((err && err.message) || "ukjent grunn")
        + "). Prøv igjen, eller lim inn koordinatet under.";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

// «2026-09-19» er riktig, men det er ikke slik noen skriver en dato i en
// setning. Kilden leses av et menneske.
function norskDato(iso) {
  const d = String(iso).split("-");
  return d.length === 3 ? d[2] + "." + d[1] + "." + d[0] : iso;
}

felt("stedHer").addEventListener("click", hentHer);
felt("stedNytt").addEventListener("click", () => apneSted(null, ""));
felt("stedAvbryt").addEventListener("click", lukkSted);
felt("stedLagre").addEventListener("click", lagreSted);
["stedLat", "stedLon"].forEach((id) => felt(id).addEventListener("input", synkBy));
felt("stedSok").addEventListener("click", sokSted);
felt("stedSokAdresse").addEventListener("click", sokAdresseSted);
felt("stedLenkeLes").addEventListener("click", lesKartlenke);
// Enter i et felt skal ikke sende skjemaet noe sted: det finnes ingen
// action, og en navigasjon her ville mistet alt som er tastet.
felt("stedSkjema").addEventListener("submit", (e) => e.preventDefault());
felt("stedFjernet").addEventListener("change", oppdaterPakrevdTekst);
felt("stedFilterBy").addEventListener("change", () => {
  stedFilter = felt("stedFilterBy").value;
  tegnSteder();
});
