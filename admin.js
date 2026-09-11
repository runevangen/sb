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
}

function visAdgang(tekst, art) {
  const m = felt("adgangMelding");
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
    felt("kampHint").textContent = data.runde
      ? data.runde + ", sesong " + data.sesong + ". Kilde: " + (data.kilde || "ukjent") + "."
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

  kamper.forEach((k) => {
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
