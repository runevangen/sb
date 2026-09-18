// Adminportalen: hvem har logget inn, nar, og PIN-en deres.
//
// **Dette er det ene stedet i prosjektet som har en service_role-nokkel,
// og det er et bevisst brudd pa en regel som ellers gjelder overalt.**
// Regelen finnes fordi en feil i `konto.mjs` eller `svar.mjs` ikke skal
// kunne skrive i en annens navn — de har derfor ingen slik nokkel, og
// skal aldri fa en. Men a slette en annens konto og a sette en annens
// PIN *er* a handle pa vegne av andre. Det kan ikke gjores uten
// admin-tilgang: Supabase Auth har ingen annen vei, og en
// `security definer`-funksjon ville bare flyttet den samme makta inn i
// databasen, med en hemmelighet i et SQL-argument i stedet.
//
// Sa: nokkelen finnes her, i denne fila, og ingen andre steder. Den
// importeres ikke, den deles ikke, og fila gjor ikke annet enn dette.
// Hver eneste handling krever ADMIN_PASSORD, sammenliknet i konstant tid,
// som i visninger.mjs — et feil passord nar aldri Supabase.
//
// Miljoet: SUPABASE_URL, SUPABASE_SERVICE_KEY og ADMIN_PASSORD. Uten dem
// svarer funksjonen 503 og sier hvilken som mangler. Husk at funksjonene
// leser miljoet ved utrulling: en ny variabel krever en ny deploy.

import { tolkBrukere, normaliserPin, gyldigPin, pinPassord, PIN_MIN, PIN_MAKS }
  from "../../pin-data.js";

// Supabase gir hoyst dette i ett kall. Testgruppa er en vennegjeng; blir
// den storre enn dette, er lista feil verktoy uansett.
const PER_SIDE = 200;

export default async (req) => {
  const mangler = manglerIOppsettet();

  // Portalen sporr om oppsettet for den viser noe. Svaret royper
  // ingenting: navnene pa miljovariablene star i repoet fra for.
  if (req.method === "GET") return svar({ klar: mangler.length === 0, mangler }, 200);
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);
  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  // Sammenlikner hele lengden uansett, sa svartiden ikke royper hvor
  // mange tegn som stemte. Og dette skjer for noe som helst annet:
  // et feil passord skal aldri fore til et kall mot Supabase.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }

  if (inn.handling === "liste") return hentBrukere();
  if (inn.handling === "pin") return settPin(inn);
  if (inn.handling === "slett") return slettBruker(inn);
  return svar({ feil: "Ukjent handling" }, 400);
};

/* ---------- handlingene ---------- */

// Forste palogging kommer rett fra Supabase: `created_at`, og kontoen
// lages ved forste innlogging, sa de to er samme oyeblikk. Vi teller ikke
// selv — et tall vi forer selv ville kunne gli fra virkeligheten.
//
// «Sist inne» kommer fra oktene, ikke fra `last_sign_in_at`. Det feltet er
// sist noen TASTET PIN-en, og appen holder telefonen innlogget med
// roterende fornyere: en som er innom hver dag kan sta med en dato uker
// tilbake. Meldt fra portalen to dager pa rad, begge gangene av en som var
// innlogget i det oyeblikket han leste «2 dager siden».
//
// Ogsa dette er Supabases eget bokholderi: GoTrue skriver
// `sessions.refreshed_at` fordi den MA for a holde folk innlogget. Vi
// begynner ikke a telle noe. ADR 0021.
async function hentBrukere() {
  const r = await hosSupabase("GET", "/auth/v1/admin/users?page=1&per_page=" + PER_SIDE);
  if (!r.ok) return tjenestefeil(r, "Fikk ikke hentet brukerne");

  // Oktene er et TILLEGG: feiler de, star lista der uten «sist inne»
  // framfor at hele portalen ryker. Men det skal sies at den mangler —
  // en tom kolonne er ikke til a skille fra «ingen har vaert inne».
  const okter = await hosSupabase("POST", "/rest/v1/rpc/sist_inne", {});
  const kart = okter.ok && Array.isArray(okter.json)
    ? okter.json.reduce((m, r2) => Object.assign(m, { [r2.bruker]: r2.sist_aktiv }), {})
    : null;

  return svar(Object.assign(
    { brukere: tolkBrukere(r.json, undefined, kart || {}) },
    kart ? {} : { oktfeil: "Fikk ikke hentet øktene. «Sist inne» står tomt.",
                  forsok: okter.forsok },
  ), 200);
}

// Ny PIN til en som har glemt sin. Admin far aldri se den gamle — den
// ligger hashet hos Supabase, og det er riktig — sa dette er a sette en
// ny, ikke a lese en.
async function settPin(inn) {
  const id = String(inn.id || "");
  const pin = normaliserPin(inn.pin);
  if (!gyldigId(id)) return svar({ feil: "Ukjent bruker" }, 400);
  if (!gyldigPin(pin)) {
    return svar({ feil: "PIN-en er " + PIN_MIN + " til " + PIN_MAKS + " siffer" }, 400);
  }

  const r = await hosSupabase("PUT", "/auth/v1/admin/users/" + id,
    { password: pinPassord(pin, process.env.PIN_PEPPER) });
  if (!r.ok) return tjenestefeil(r, "Fikk ikke satt ny PIN");
  return svar({ ok: true }, 200);
}

// Sletting er hel: radene i `kampsvar` og `pin_kontoer` folger med
// gjennom on delete cascade, sa fornavnet blir ledig igjen samme
// oyeblikk. Det er den samme slettingen personen selv kan gjore fra
// menyen — dette er bare veien dit for den som ikke far logget inn.
async function slettBruker(inn) {
  const id = String(inn.id || "");
  if (!gyldigId(id)) return svar({ feil: "Ukjent bruker" }, 400);

  const r = await hosSupabase("DELETE", "/auth/v1/admin/users/" + id);
  if (!r.ok) return tjenestefeil(r, "Fikk ikke slettet brukeren");
  return svar({ slettet: true }, 200);
}

/* ---------- tjenesten ---------- */

// Id-en kommer fra lista portalen nettopp fikk, men den gar inn i en
// adresse — sa den sjekkes mot formen en uuid har, framfor a stoles pa.
function gyldigId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function base() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

async function hosSupabase(metode, sti, kropp) {
  const nokkel = process.env.SUPABASE_SERVICE_KEY;
  const forsok = { kilde: "Supabase Auth (admin)", sti: sti.split("?")[0] };
  const headere = {
    "apikey": nokkel,
    "Authorization": "Bearer " + nokkel,
    "Accept": "application/json",
  };
  if (kropp) headere["Content-Type"] = "application/json";

  try {
    const respons = await fetch(base() + sti, {
      method: metode,
      headers: headere,
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
    forsok.status = respons.status;

    const tekst = await respons.text().catch(() => "");
    let json = null;
    try { json = tekst ? JSON.parse(tekst) : null; } catch (err) { json = null; }
    const melding = kortMelding(json) || tekst.slice(0, 120);
    if (melding) forsok.melding = melding;
    return { ok: respons.ok, status: respons.status, json, melding, forsok: [forsok] };
  } catch (err) {
    forsok.utfall = String((err && err.message) || err).slice(0, 80);
    return { ok: false, status: 0, json: null, melding: forsok.utfall, forsok: [forsok] };
  }
}

// Tjenestens egen melding folger med i `forsok`, som ellers i appen —
// men aldri nokkelen. En 401 herfra betyr nesten alltid at
// SUPABASE_SERVICE_KEY er anon-nokkelen ved et uhell; de to ser like ut.
function tjenestefeil(r, hva) {
  if (r.status === 401 || r.status === 403) {
    return svar({
      feil: hva + ": Supabase avviste nøkkelen. Står anon-nøkkelen i"
        + " SUPABASE_SERVICE_KEY? De to ser like ut.",
      forsok: r.forsok,
    }, 502);
  }
  console.error("[brukere] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: hva + ". Prøv igjen om litt.", forsok: r.forsok }, 502);
}

function kortMelding(json) {
  if (!json) return "";
  const tekst = json.error_description || json.msg || json.message || json.error || "";
  return String(tekst).slice(0, 120);
}

// Samme sammenlikning som i visninger.mjs: hele lengden uansett, sa
// svartiden ikke royper hvor mange tegn som stemte.
function likeStrenger(a, b) {
  const fasit = String(b == null ? "" : b);
  const lengde = Math.max(a.length, fasit.length);
  let ulikt = a.length ^ fasit.length;
  for (let i = 0; i < lengde; i += 1) {
    ulikt |= (a.charCodeAt(i) || 0) ^ (fasit.charCodeAt(i) || 0);
  }
  return ulikt === 0;
}

/* ---------- oppsett ---------- */

function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.SUPABASE_URL) mangler.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_KEY) mangler.push("SUPABASE_SERVICE_KEY");
  if (!process.env.ADMIN_PASSORD) mangler.push("ADMIN_PASSORD");
  // Uten pepperet blir en ny PIN satt med feil passord, og personen ville
  // ikke kommet inn med den PIN-en admin nettopp ga dem.
  if (!process.env.PIN_PEPPER) mangler.push("PIN_PEPPER");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Brukerlista er ikke satt opp: " + mangler.join(" og ")
    + " mangler i Netlify-miljøet. Sett " + (mangler.length > 1 ? "dem" : "den")
    + " under Site configuration →"
    + " Environment variables, og rull ut på nytt (Deploys → Trigger deploy):"
    + " funksjonene leser miljøet ved utrulling.";
}

function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/brukere" };
