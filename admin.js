// Admin-portalen. Enkel med vilje: velg pub, kryss av kamper, lagre.
//
// Den skriver ikke selv — den sender valget til /api/visninger, som er
// det eneste stedet passordet og GitHub-tokenet finnes. Portalen kan
// ligge apent; uten passord skjer ingenting.

import { PUBER_OSLO } from "./puber-oslo.js";
import { VISNINGER } from "./visninger.js";
import { LIGAER } from "./fotball-data.js";

const felt = (id) => document.getElementById(id);
let kamper = [];

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
felt("liga").addEventListener("change", hentKamper);

/* ---------- kampene ---------- */

hentKamper();

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
  const passord = felt("passord").value;
  if (!passord) { vis("Skriv passordet først.", "feil"); felt("passord").focus(); return; }

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
    if (!respons.ok || data.feil) {
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
