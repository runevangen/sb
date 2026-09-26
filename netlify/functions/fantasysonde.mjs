// Hva fantasy-spillene faktisk gir oss — spurt fra portalen.
//
// Samme grunn som /api/tsdb-sonde: den som eier prosjektet sitter med en
// telefon, og en oppgave som krever en terminal er ingen oppgave. Og her
// kommer en til: miljoet koden ble skrevet i nektet begge adressene, sa
// ingen har sett et eneste svar. Sonden spor fra Netlify, som er der appen
// ville spurt fra.
//
// Ingen nokkel. Bak ADMIN_PASSORD likevel, som de andre sondene: ikke
// fordi svaret er hemmelig, men fordi et endepunkt hvem som helst kan
// trykke pa, er et endepunkt noen kommer til a trykke pa tusen ganger —
// mot en tjeneste som ikke er laget for oss.
//
// Ingenting herfra nar leserne. Svaret sier hva som FINNES; om vi far vise
// det, er et sporsmal om vilkarene.

import { FANTASY_KILDER, FANTASY_STI, fantasyFunn } from "../../fantasy-data.js";

// Under Netlifys ti sekunder, med luft til a skrive svaret. De to kildene
// spørres samtidig, sa fristen gjelder hver av dem, ikke summen.
const FRIST_MS = 8000;

export default async (req) => {
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);

  let inn;
  try { inn = await req.json(); }
  catch (err) { return svar({ feil: "Uleselig forespørsel" }, 400); }

  if (!process.env.ADMIN_PASSORD) {
    return svar({ feil: "Tjenesten mangler ADMIN_PASSORD" }, 503);
  }
  // Konstant tid, som i de andre: en sammenlikning som stopper ved
  // forste avvik, forteller hvor langt en gjetning kom.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }

  const kilder = await Promise.all(FANTASY_KILDER.map(sporKilde));
  return svar({ kilder }, 200);
};

// Ett kall, og hva svaret BAR. En nektet forbindelse, en 403 og et svar
// uten spillere er tre ulike ting, og de skal ikke se like ut.
async function sporKilde(k) {
  const ut = { nokkel: k.nokkel, navn: k.navn, adresse: new URL(k.rot).host };
  try {
    const r = await fetch(k.rot + FANTASY_STI, {
      headers: { "Accept": "application/json",
                 "User-Agent": "Sportsbibelen-sonde (mvp-sb.netlify.app)" },
      signal: AbortSignal.timeout(FRIST_MS),
    });
    if (!r.ok) {
      ut.utfall = "svarte HTTP " + r.status;
      ut.hvorfor = r.status === 403
        ? "tjenesten nekter — kanskje Netlifys adresser, kanskje oss"
        : r.statusText || "";
      return ut;
    }
    const tekst = await r.text();
    let json;
    try { json = JSON.parse(tekst); }
    catch (e) {
      ut.utfall = "svarte, men ikke med JSON";
      ut.hvorfor = tekst.trim().charAt(0) === "<" ? "en HTML-side" : tekst.slice(0, 80);
      return ut;
    }
    ut.funn = fantasyFunn(json);
    ut.utfall = "svarte med " + ut.funn.spillere + " spillere";
    return ut;
  } catch (err) {
    ut.utfall = "fikk ikke svar";
    ut.hvorfor = err && err.name === "TimeoutError"
      ? "ga opp etter " + FRIST_MS / 1000 + " sekunder"
      : (err && err.message) || "ukjent feil";
    return ut;
  }
}

function likeStrenger(a, b) {
  const fasit = String(b == null ? "" : b);
  const lengde = Math.max(a.length, fasit.length);
  let ulikt = a.length ^ fasit.length;
  for (let i = 0; i < lengde; i += 1) {
    ulikt |= (a.charCodeAt(i) || 0) ^ (fasit.charCodeAt(i) || 0);
  }
  return ulikt === 0;
}

// Aldri cachet. Sonden spor hva som finnes NA.
function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8",
               "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/fantasy-sonde" };
