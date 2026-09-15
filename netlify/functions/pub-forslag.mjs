// Steder lesere sender inn (#80).
//
// **En ko, ikke lista.** puber-oslo.js er kode fordi den baerer en
// redaksjonell vurdering, og «Kjent for a vise fotball» skal sta ogsa nar
// bade Overpass og var egen funksjon er nede. Et forslag herfra blir ikke
// en rad i lista av seg selv — portalen viser koen, og et menneske limer
// raden inn med koordinater, kilde og dato.
//
// Skrivingen gar med **leserens egen okt**, som i visninger og kampsvar.
// Vi har ingen service_role-nokkel her, med vilje: da kan heller ikke en
// feil i denne fila sende inn i en annens navn. Databasen setter
// `foreslatt_av` fra okten.
//
// Lesing av koen krever ADMIN_PASSORD **og** en okt som star i
// visning_skrivere. To lasser, og den som holder er databasens: passordet
// er vart, og Supabase vet ikke hva det er.

import { sjekkForslag, forslagRad, tolkForslag, FORSLAG_MAKS, STATUSER }
  from "../../pub-forslag-data.js";

const TABELL = "pub_forslag";
const FELT = "id,navn,adresse,viser_fotball,merknad,foreslatt,status";

export default async (req) => {
  const mangler = manglerIOppsettet();
  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  if (inn.handling === "liste") return hentKo(inn);
  if (inn.handling === "behandle") return behandle(inn);
  return sendInn(inn);
};

/* ---------- leseren sender inn ---------- */

async function sendInn(inn) {
  const token = String(inn.token || "");
  if (!token) {
    return svar({
      feil: "Logg inn for å sende inn et sted. Da vet vi hvem forslaget"
        + " kommer fra, og du slipper å gjøre det om igjen.",
    }, 401);
  }

  const problemer = sjekkForslag(inn);
  if (problemer.length) return svar({ feil: problemer[0], problemer }, 400);

  const r = await hosSupabase("POST", "/rest/v1/" + TABELL + "?select=" + FELT,
    forslagRad(inn), token, { "Prefer": "return=representation" });
  if (!r.ok) return feilSvar(r);

  // En skriving som svarer 200 er ikke bevis pa at raden ligger der.
  // Samme lekse som kampsvar: mangler skrivepolicyen, ser svaret
  // vellykket ut mens ingenting ble lagret.
  const skrevet = tolkForslag(r.json);
  if (!skrevet.length) {
    return svar({
      feil: "Forslaget ble ikke lagret. Skrivingen svarte " + r.status
        + ", men ingen rad kom tilbake.",
      forsok: r.forsok,
    }, 502);
  }

  return svar({
    ok: true,
    forslag: skrevet[0],
    merknad: "Takk. Vi ser på det, og stedet dukker opp i lista når noen"
      + " har sjekket adressen.",
  }, 200);
}

/* ---------- portalen leser koen ---------- */

async function hentKo(inn) {
  const nekt = adgang(inn);
  if (nekt) return nekt;

  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&order=foreslatt.desc&limit=" + FORSLAG_MAKS,
    null, String(inn.token));
  if (!r.ok) return feilSvar(r);
  return svar({ forslag: tolkForslag(r.json) }, 200);
}

async function behandle(inn) {
  const nekt = adgang(inn);
  if (nekt) return nekt;

  const id = String(inn.id || "");
  // Id-en gar inn i en adresse, sa den sjekkes mot formen en uuid har
  // framfor a stoles pa — selv om den kommer fra lista portalen nettopp
  // fikk. Samme grep som i brukere.mjs.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return svar({ feil: "Ukjent forslag" }, 400);
  }
  const status = String(inn.status || "");
  if (STATUSER.indexOf(status) === -1 || status === "ny") {
    return svar({ feil: "Ukjent status" }, 400);
  }

  const r = await hosSupabase("PATCH",
    "/rest/v1/" + TABELL + "?id=eq." + id + "&select=" + FELT,
    { status, behandlet: new Date().toISOString() },
    String(inn.token), { "Prefer": "return=representation" });
  if (!r.ok) return feilSvar(r);

  const endret = tolkForslag(r.json);
  if (!endret.length) {
    return svar({
      feil: "Ingenting ble endret. Står du i visning_skrivere?",
      forsok: r.forsok,
    }, 502);
  }
  return svar({ ok: true, forslag: endret[0] }, 200);
}

// Passordet apner portalen; okten er den databasen sjekker. Sjekken skjer
// for alt annet: et feil passord nar aldri Supabase.
function adgang(inn) {
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }
  if (!String(inn.token || "")) {
    return svar({
      feil: "Logg inn i appen først. Køen leses med din egen økt, ikke med"
        + " en nøkkel — og da må databasen vite hvem du er.",
    }, 401);
  }
  return null;
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

function feilSvar(r) {
  const kode = (r.json && r.json.code) || "";
  if (kode === "42P01" || /does not exist/i.test(r.melding || "")) {
    return svar({
      feil: "Tabellen «" + TABELL + "» finnes ikke i Supabase ennå."
        + " SQL-en står i docs/oppsett.sql.",
      forsok: r.forsok,
    }, 503);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({
      feil: "Økten gjelder ikke lenger. Logg inn på nytt i appen.",
      forsok: r.forsok,
    }, 401);
  }
  console.error("[pub-forslag] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: "Fikk ikke svar fra lageret. Prøv igjen om litt.", forsok: r.forsok }, 502);
}

function kortMelding(json) {
  if (!json) return "";
  const tekst = json.message || json.error_description || json.msg || json.error || "";
  return String(tekst).slice(0, 120);
}

function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.ADMIN_PASSORD) mangler.push("ADMIN_PASSORD");
  if (!process.env.SUPABASE_URL) mangler.push("SUPABASE_URL");
  if (!process.env.SUPABASE_ANON_KEY) mangler.push("SUPABASE_ANON_KEY");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Innsending er ikke satt opp: " + mangler.join(" og ")
    + " mangler i Netlify-miljøet. Sett " + (mangler.length > 1 ? "dem" : "den")
    + " under Site configuration →"
    + " Environment variables, og rull ut på nytt (Deploys → Trigger deploy):"
    + " funksjonene leser miljøet ved utrulling.";
}

// Konstant tid: en sammenlikning som stopper ved forste avvik, forteller
// hvor langt en gjetning kom.
function likeStrenger(a, b) {
  const fasit = String(b == null ? "" : b);
  const lengde = Math.max(a.length, fasit.length);
  let ulikt = a.length ^ fasit.length;
  for (let i = 0; i < lengde; i += 1) {
    ulikt |= (a.charCodeAt(i) || 0) ^ (fasit.charCodeAt(i) || 0);
  }
  return ulikt === 0;
}

function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/pub-forslag" };
