// Hvem blir med på kampen.
//
// Dette er svaret delingslenka ba om. Teksten som gikk ut i chatten
// spurte «Hvor ser du?», og til nå hadde det spørsmålet ingen vei
// tilbake til appen.
//
// Leses av alle, skrives bare av den som er logget inn. Å se hvem som
// kommer krever ingen konto — appen skal kunne leses uten — men en rad
// skal bare kunne settes i ditt eget navn. Derfor går skrivingen med
// leserens egen økt (`Authorization: Bearer <token>`), ikke med en
// nøkkel som kan skrive hva som helst: databasen setter `bruker` fra
// økten, og reglene der slipper bare gjennom din egen rad. Vi har ingen
// service_role-nøkkel her, med vilje — da kan heller ikke en feil i
// denne fila skrive i en annens navn.
//
// Tabellen og reglene står som SQL i docs/nokler-og-tokens.md. Mangler
// de, svarer funksjonen 503 og sier hva som mangler, framfor å sende en
// PostgREST-feil videre til leseren.

import { tolkSvar, svarRad, gyldigNavn, SVAR_MAKS } from "../../svar-data.js";

const TABELL = "kampsvar";
const FELT = "kamp_id,navn,hvor,sted,bruker";

// En runde er ti kamper. Taket finnes for at adressen ikke skal kunne
// vokse til noe som spør om hele sesongen i ett kall.
const KAMPER_MAKS = 20;

export default async (req) => {
  const mangler = manglerIOppsettet();
  if (req.method === "GET" && mangler.length) {
    return svar({ feil: oppsettTekst(mangler), mangler }, 503);
  }
  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);

  if (req.method === "GET") return hentSvar(new URL(req.url));
  if (req.method !== "POST") return svar({ feil: "Bruk GET eller POST" }, 405);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  if (inn.handling === "fjern") return fjernSvar(inn);
  return settSvar(inn);
};

/* ---------- lesing ---------- */

// Én runde, ett kall: `?kamper=3,4,5`. Ti rader per kamp ville blitt ti
// kall om hver rad spurte for seg.
async function hentSvar(url) {
  const ider = (url.searchParams.get("kamper") || url.searchParams.get("kamp") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,12}$/.test(s))
    .slice(0, KAMPER_MAKS);

  if (!ider.length) return svar({ svar: [] }, 200);

  const sti = "/rest/v1/" + TABELL + "?select=" + FELT +
    "&kamp_id=in.(" + ider.join(",") + ")&limit=" + (SVAR_MAKS * KAMPER_MAKS);

  const r = await hosSupabase("GET", sti, null, null);
  if (!r.ok) return feilSvar(r);
  return svar({ svar: tolkSvar(r.json) }, 200);
}

/* ---------- skriving ---------- */

async function settSvar(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Logg inn for å si at du blir med" }, 401);

  const kampId = String(inn.kampId == null ? "" : inn.kampId);
  if (!/^\d{1,12}$/.test(kampId)) return svar({ feil: "Ukjent kamp" }, 400);
  if (!gyldigNavn(inn.navn)) return svar({ feil: "Skriv navnet vennene ser deg som" }, 400);

  // Upsert: svarer du to ganger pa samme kamp, endrer du svaret ditt.
  // Uten dette ville «jeg blir med» to ganger blitt to personer.
  const sti = "/rest/v1/" + TABELL + "?on_conflict=kamp_id,bruker&select=" + FELT;
  const rad = svarRad(kampId, inn.navn, inn.hvor, inn.sted);

  const r = await hosSupabase("POST", sti, rad, token, {
    "Prefer": "resolution=merge-duplicates,return=representation",
  });
  if (!r.ok) return feilSvar(r);
  return svar({ svar: tolkSvar(r.json) }, 200);
}

// Angre. Reglene i databasen sorger for at det bare er din egen rad som
// forsvinner, uansett hva som star her.
async function fjernSvar(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Logg inn først" }, 401);

  const kampId = String(inn.kampId == null ? "" : inn.kampId);
  if (!/^\d{1,12}$/.test(kampId)) return svar({ feil: "Ukjent kamp" }, 400);

  const r = await hosSupabase("DELETE", "/rest/v1/" + TABELL + "?kamp_id=eq." + kampId,
    null, token);
  if (!r.ok) return feilSvar(r);
  return svar({ fjernet: true }, 200);
}

/* ---------- tjenesten ---------- */

function base() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

async function hosSupabase(metode, sti, kropp, token, ekstra) {
  const forsok = { kilde: "Supabase", tabell: TABELL };
  const headere = {
    "apikey": process.env.SUPABASE_ANON_KEY,
    "Accept": "application/json",
  };
  // Leserens egen okt ved skriving. Ved lesing sendes ingen: hvem som
  // helst skal kunne se hvem som blir med.
  if (token) headere.Authorization = "Bearer " + token;
  if (kropp) headere["Content-Type"] = "application/json";
  Object.assign(headere, ekstra || {});

  try {
    const respons = await fetch(base() + sti, {
      method: metode,
      headers: headere,
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
    forsok.status = respons.status;

    const tekst = await respons.text().catch(() => "");
    let json = null;
    try {
      json = tekst ? JSON.parse(tekst) : null;
    } catch (err) {
      json = null;
    }
    const melding = kortMelding(json) || tekst.slice(0, 120);
    if (melding) forsok.melding = melding;
    return { ok: respons.ok, status: respons.status, json, melding, forsok: [forsok] };
  } catch (err) {
    forsok.utfall = String((err && err.message) || err).slice(0, 80);
    return { ok: false, status: 0, json: null, melding: forsok.utfall, forsok: [forsok] };
  }
}

// PostgREST sier «relation … does not exist» med kode 42P01 nar tabellen
// ikke er laget enda. Det er ikke en feil leseren kan gjore noe med, men
// det er nyaktig det den som setter opp prosjektet trenger a hore.
function feilSvar(r) {
  const kode = (r.json && r.json.code) || "";
  if (kode === "42P01" || /does not exist/i.test(r.melding || "")) {
    return svar({
      feil: "Tabellen «" + TABELL + "» finnes ikke i Supabase ennå."
        + " SQL-en står i docs/nokler-og-tokens.md.",
      forsok: r.forsok,
    }, 503);
  }
  // 401/403 fra databasen betyr at okta ikke gjelder, eller at reglene
  // ikke slipper skrivingen gjennom.
  if (r.status === 401 || r.status === 403) {
    return svar({ feil: "Økten gjelder ikke lenger. Logg inn på nytt.", forsok: r.forsok }, 401);
  }
  console.error("[svar] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: "Fikk ikke svar fra lageret. Prøv igjen om litt.", forsok: r.forsok }, 502);
}

function kortMelding(json) {
  if (!json) return "";
  const tekst = json.message || json.error_description || json.msg || json.error || "";
  return String(tekst).slice(0, 120);
}

function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.SUPABASE_URL) mangler.push("SUPABASE_URL");
  if (!process.env.SUPABASE_ANON_KEY) mangler.push("SUPABASE_ANON_KEY");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Innloggingen er ikke satt opp: " + mangler.join(" og ")
    + " mangler i Netlify-miljøet. Sett " + (mangler.length > 1 ? "dem" : "den")
    + " under Site configuration →"
    + " Environment variables, og rull ut på nytt (Deploys → Trigger deploy):"
    + " funksjonene leser miljøet ved utrulling.";
}

// Aldri cache. Hvem som blir med endrer seg mens man ser pa det, og et
// svar som henger igjen er verre enn ingen liste.
function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/svar" };
