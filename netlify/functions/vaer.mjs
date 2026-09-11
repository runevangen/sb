// Vaeret ved avspark, fra MET Norway, med Netlifys varige cache foran.
//
// MET krever en User-Agent som sier hvem som sporr. Den kan ikke settes
// fra nettleseren, sa kallet gar herfra — samme grunn som for
// fotballfunksjonen. Ingen nokkel, men lisensen (CC BY 4.0) krever
// kreditering, og den star i visningen.
//
// Adressen: /api/vaer?arena=<navn>&naar=<iso>. Cache-nokkelen er adressen,
// sa hver kamp er en nokkel, og MET sporres hoyst en gang i timen per kamp
// uansett hvor mange som apner appen.

import { arenaFor, vaerSti, tolkVarsel, vaertekst, klerad } from "../../vaer-data.js";

const MET = "https://api.met.no";
export const LEVETID_VAER = 3600;

// Identifiserer appen, ikke en person. MET_KONTAKT kan legges til i
// miljoet om MET vil ha en adresse a ta kontakt pa.
function userAgent() {
  const kontakt = process.env.MET_KONTAKT ? " " + process.env.MET_KONTAKT : "";
  return "sportsbibelen-app/1.0 https://mvp-sb.netlify.app" + kontakt;
}

export default async (req) => {
  const url = new URL(req.url);
  const arena = arenaFor(url.searchParams.get("arena") || "");
  if (!arena) return svar({ feil: "Ukjent arena" }, 400, 0);

  const naar = url.searchParams.get("naar") || "";
  if (Number.isNaN(Date.parse(naar))) return svar({ feil: "Ugyldig tidspunkt" }, 400, 0);

  let json;
  const forsok = { kilde: "MET Locationforecast", arena: arena.navn };
  try {
    const respons = await fetch(MET + vaerSti(arena), {
      headers: { "User-Agent": userAgent(), "Accept": "application/json" },
    });
    forsok.status = respons.status;
    if (!respons.ok) {
      // MET sier hvorfor i kroppen (403 uten User-Agent, 422 ved feil
      // koordinater). De forste tegnene er nok.
      const kropp = (await respons.text().catch(() => "")).replace(/\s+/g, " ").trim();
      if (kropp) forsok.melding = kropp.slice(0, 80);
      throw new Error("HTTP " + respons.status);
    }
    json = await respons.json();
  } catch (err) {
    console.error("[vaer] henting feilet:", err);
    forsok.utfall = String(err && err.message || err).slice(0, 80);
    return svar({ feil: "Fikk ikke svar fra MET", forsok }, 502, 0);
  }

  let varsel;
  try {
    varsel = tolkVarsel(json, naar);
  } catch (err) {
    console.error("[vaer] uventet svar:", err);
    return svar({ feil: err.message }, 502, 0);
  }

  // Ingen varsel sa langt fram er et gyldig svar, og kan caches: det
  // endrer seg ikke for MET har kommet lenger fram i tid.
  return svar(Object.assign({
    arena: arena.navn,
    kilde: "MET Norway",
    oppdatert: new Date().toISOString(),
  }, varsel ? Object.assign({}, varsel, { tekst: vaertekst(varsel), rad: klerad(varsel) })
            : { tekst: "", rad: "", grunn: "Ingen varsel så langt fram ennå." }),
  200, LEVETID_VAER);
};

function svar(kropp, status, levetid) {
  const headere = { "Content-Type": "application/json; charset=utf-8" };
  if (levetid > 0) {
    headere["Cache-Control"] = "public, max-age=0, must-revalidate";
    headere["Netlify-CDN-Cache-Control"] =
      "public, durable, s-maxage=" + levetid + ", stale-while-revalidate=86400";
  } else {
    headere["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(kropp), { status, headers: headere });
}

export const config = { path: "/api/vaer" };
