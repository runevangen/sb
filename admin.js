// Admin-portalen. Enkel med vilje: logg inn, velg pub, kryss av kamper,
// lagre.
//
// Den skriver ikke selv — den sender valget til /api/visninger, som er
// det eneste stedet passordet og GitHub-tokenet finnes. Portalen kan
// ligge apent; uten passord skjer ingenting.
//
// Passordet forst: resten av portalen ligger skjult til tjenesten har
// godtatt det. Det er ikke sikkerheten — den ligger i funksjonen, som
// krever passordet ved hver skriving — men det er ordenen. Den som apner
// sida skal se ett felt, ikke et skjema hen ikke kan lagre. Og det
// sparer et kall mot API-Football per apning: kvoten er hundre i dognet.
//
// Passordet ligger i en variabel her, ikke i sessionStorage: en
// oppfriskning er billigere enn et passord som blir liggende.

import { PUBER_OSLO } from "./puber-oslo.js";
import { VISNINGER } from "./visninger.js";
import { LIGAER } from "./fotball-data.js";
import { sistInneTekst, PIN_MIN, PIN_MAKS } from "./pin-data.js";

const felt = (id) => document.getElementById(id);
let kamper = [];
let passord = "";

/* ---------- pubvelgeren ---------- */

// «usikker» vises ikke i appen, og skal da ikke kunne settes her heller.
const PUBER = PUBER_OSLO.filter((p) => p.sikkerhet !== "usikker")
  .slice()
  .sort((a, b) => a.navn.localeCompare(b.navn, "nb"));

PUBER.forEach((p) => {
  const valg = document.createElement("option");
  valg.value = p.navn;
  valg.textContent = p.navn + " (" + p.bydel + ")";
  felt("pub").appendChild(valg);
});
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
}

function visAdgang(tekst, art) {
  const m = felt("adgangMelding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}

/* ---------- brukerne ---------- */

// Hvem har logget inn, nar kom de forst, og nar var de sist inne.
// Tallene kommer fra Supabase selv, ikke fra noe vi teller: en teller vi
// forer selv ville kunne gli fra virkeligheten uten at noen merket det.
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
  } catch (err) {
    felt("brukere").hidden = true;
    felt("brukerHint").textContent = err.message;
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
  felt("brukerHint").textContent = liste.length === 1
    ? "Én bruker. Sortert etter hvem som var inne sist."
    : liste.length + " brukere. Sortert etter hvem som var inne sist.";
}

function brukerRad(b) {
  const rad = document.createElement("tr");

  rad.appendChild(celle("td", "navn", b.navn));
  rad.appendChild(celle("td", "tid", sistInneTekst(b.forst)));
  rad.appendChild(celle("td", "tid", sistInneTekst(b.sist)));

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
  if (!kamper.length) {
    liste.appendChild(melding("Ingen kommende kamper i denne ligaen."));
    return;
  }
  const pub = felt("pub").value;
  const alt = VISNINGER.filter((v) => v.pub === pub).map((v) => String(v.kampId));
  felt("pubHint").textContent = alt.length
    ? "Viser " + alt.length + " kamper fra før."
    : "Ingen kamper satt på denne puben ennå.";

  let sisteRunde = null;
  kamper.forEach((k) => {
    // En overskrift per runde: krysser du av tjue kamper i strekk, skal du
    // se hvor den ene runden slutter og den neste begynner.
    if (k.runde && k.runde !== sisteRunde) {
      sisteRunde = k.runde;
      const skille = document.createElement("li");
      skille.className = "runde-skille";
      skille.textContent = k.runde;
      liste.appendChild(skille);
    }
    const rad = document.createElement("li");
    const merke = document.createElement("label");
    merke.className = "kamp";
    const boks = document.createElement("input");
    boks.type = "checkbox";
    boks.value = String(k.id);
    boks.checked = alt.indexOf(String(k.id)) > -1;
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
  felt("lagre").disabled = false;
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
felt("merkAlle").addEventListener("click", () => alleBokser().forEach((b) => { b.checked = true; }));
felt("merkIngen").addEventListener("click", () => alleBokser().forEach((b) => { b.checked = false; }));

/* ---------- lagring ---------- */

felt("lagre").addEventListener("click", async () => {
  if (!passord) { vis("Logg inn først.", "feil"); felt("passord").focus(); return; }

  const valgte = alleBokser().filter((b) => b.checked).map((b) => Number(b.value));
  felt("lagre").disabled = true;
  vis("Lagrer …", "");
  try {
    const respons = await fetch("/api/visninger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passord,
        pub: felt("pub").value,
        kampIder: valgte,
        // Kampene sendes med, sa funksjonen slipper a hente dem pa nytt
        // og vi er sikre pa at det er de samme som sto pa skjermen.
        kamper: kamper.map((k) => ({ id: k.id, hjemme: k.hjemme, borte: k.borte, dato: k.dato })),
      }),
    });
    const data = JSON.parse(await respons.text());
    if (respons.status === 401) {
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
      vis(data.merknad || "Lagret.", "ok");
    }
  } catch (err) {
    vis("Fikk ikke lagret: " + err.message, "feil");
  }
  felt("lagre").disabled = false;
});

function vis(tekst, art) {
  const m = felt("melding");
  m.textContent = tekst;
  m.className = "melding" + (art ? " " + art : "");
}
