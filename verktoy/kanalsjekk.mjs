#!/usr/bin/env node
// Maler gapet mellom det kanaler.js PASTAR og det som faktisk sendes.
//
//   node verktoy/kanalsjekk.mjs                 # mot prod
//   node verktoy/kanalsjekk.mjs <adresse>       # mot en forhandsvisning
//
// Hvorfor dette finnes, og hvorfor det ikke er en test:
//
// kanaler.js svarer per LIGA. Eliteserien gar samme sted hele sesongen, og
// det dekker de aller fleste kampene. Men ikke alle: en kamp flyttet til en
// sosterkanal, en kamp som ikke sendes, en cupkamp. «Sendes pa TV 2 Play»
// nar den gar pa TV 2 Sport 1 er en liten logn — og sporsmalet er om den er
// stor nok til a rettferdiggjore en ukentlig skraper (#82).
//
// Det sporsmalet kan ikke besvares med kode. Det krever at et menneske
// sammenlikner én runde med virkeligheten. Skriptet gjor det kjedelige:
// henter kampene, setter pa hva vi pastar, og gir deg en liste a fylle ut.
//
// Er avviket null pa en full runde, er skraperen unodvendig og #82 kan
// lukkes. Er det tre av foerti, vet vi hvor mye den er verdt.
//
// Krever nett. Det finnes ingen nokler her: /api/fotball/neste er apent.

import { LIGAER, tidstekst, kanalFor } from "../fotball-data.js";
import { KANALER } from "../kanaler.js";

const BASE = (process.argv[2] || "https://mvp-sb.netlify.app").replace(/\/+$/, "");

async function hent(liga) {
  const svar = await fetch(BASE + "/api/fotball/neste?liga=" + encodeURIComponent(liga),
    { headers: { Accept: "application/json" } });
  const tekst = await svar.text();
  let data;
  try { data = JSON.parse(tekst); } catch { throw new Error("uventet svar: " + tekst.slice(0, 120)); }
  if (!svar.ok || data.feil) throw new Error(data.feil || ("HTTP " + svar.status));
  return data;
}

const rader = [];
const feil = [];

for (const liga of Object.keys(LIGAER)) {
  try {
    const data = await hent(liga);
    // Forste runde, ikke hele vinduet: én runde er det et menneske orker
    // a sjekke mot en programoversikt, og det er nok til a male gapet.
    // Tjenesten gir hele vinduet (ADR 0017), sa utvelgelsen skjer her.
    const forste = data.runde || (data.runder || [])[0] || "";
    const runde = (data.kamper || []).filter((k) => !forste || k.runde === forste);
    const kanal = kanalFor(liga, KANALER);
    runde.forEach((k) => rader.push({
      liga: LIGAER[liga].navn,
      kamp: k.hjemme + " – " + k.borte,
      naar: k.dato ? tidstekst(k.dato) : "?",
      pastand: kanal ? kanal.kanal : "(ingen rad utfylt)",
    }));
  } catch (e) {
    // En liga som svikter skal SIES, ikke utelates stille. Ellers ser
    // listen komplett ut mens en femtedel mangler.
    feil.push(liga + ": " + e.message);
  }
}

if (!rader.length && feil.length) {
  console.error("Ingen kamper hentet.\n  " + feil.join("\n  "));
  process.exit(1);
}

const bredde = (n) => Math.max(...rader.map((r) => r[n].length), n.length);
const b = { kamp: bredde("kamp"), naar: bredde("naar"), pastand: bredde("pastand") };

console.log("\nNeste runde, med det kanaler.js pastar. Fyll ut siste kolonne");
console.log("fra programoversikten, og noter avvik.\n");
console.log("| " + "Liga".padEnd(16) + " | " + "Kamp".padEnd(b.kamp) + " | " +
            "Nar".padEnd(b.naar) + " | " + "Vi pastar".padEnd(b.pastand) + " | Faktisk |");
console.log("|" + "-".repeat(18) + "|" + "-".repeat(b.kamp + 2) + "|" +
            "-".repeat(b.naar + 2) + "|" + "-".repeat(b.pastand + 2) + "|---------|");
rader.forEach((r) => {
  console.log("| " + r.liga.padEnd(16) + " | " + r.kamp.padEnd(b.kamp) + " | " +
              r.naar.padEnd(b.naar) + " | " + r.pastand.padEnd(b.pastand) + " |         |");
});

console.log("\n" + rader.length + " kamper i " +
  (new Set(rader.map((r) => r.liga)).size) + " ligaer.");
if (feil.length) console.log("\nDisse ligaene svarte ikke:\n  " + feil.join("\n  "));
