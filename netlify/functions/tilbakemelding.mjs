// Feil og ønsker fra leserne.
//
// **En ko i portalen, ikke en sak pa GitHub.** Repoet er offentlig, og det
// en leser skriver om en feil de mote, er ikke vart a publisere. Admin
// gjor en melding til en sak selv, om den skal bli en.
//
// Skrivingen gar med **leserens egen okt**, som pubforslagene: ingen
// service_role her, sa en feil i denne fila kan ikke sende i en annens
// navn. Databasen setter `sendt_av` fra okten og `status` fra sin
// default, og skriveregelen krever begge (docs/oppsett.sql, del 9).
//
// Fire handlinger:
//   send     leseren sender inn          okt
//   mine     leseren ser sine egne        okt
//   liste    portalen leser koen          ADMIN_PASSORD + okt i visning_skrivere
//   behandle portalen setter status       ADMIN_PASSORD + okt i visning_skrivere

import { sjekkTilbakemelding, tilbakemeldingRad, tolkTilbakemeldinger,
         TILBAKEMELDING_MAKS, STATUSER }
  from "../../tilbakemelding-data.js";

import { tjenestensOrd, diagnosekropp }
  from "../../tjeneste-data.js";

const TABELL = "tilbakemelding";
const FELT = "id,art,tekst,skjerm,versjon,sendt_av,sendt,status,behandlet";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (inn.handling === "send") return send(inn);
  if (inn.handling === "mine") return mine(inn);
  if (inn.handling === "liste") return hentKo(inn);
  if (inn.handling === "behandle") return behandle(inn);
  return svar({ feil: "Ukjent handling" }, 400);
};

/* ---------- leseren ---------- */

async function send(inn) {
  const token = String(inn.token || "");
  if (!token) {
    return svar({
      feil: "Logg inn for å sende. Da vet vi hvem vi kan spørre om mer, og"
        + " du ser hva som skjedde med meldingen din.",
    }, 401);
  }

  const problemer = sjekkTilbakemelding(inn);
  if (problemer.length) return svar({ feil: problemer[0], problemer }, 400);

  const r = await hosSupabase("POST", "/rest/v1/" + TABELL + "?select=" + FELT,
    tilbakemeldingRad(inn), token, { "Prefer": "return=representation" });
  if (!r.ok) return feilSvar(r);

  // En skriving som svarer 200 er ikke bevis pa at raden ligger der.
  const skrevet = tolkTilbakemeldinger(r.json);
  if (!skrevet.length) {
    return svar({
      feil: "Meldingen ble ikke lagret. Skrivingen svarte " + r.status
        + ", men ingen rad kom tilbake.",
      forsok: r.forsok,
    }, 502);
  }
  return svar({ ok: true, melding: skrevet[0] }, 200);
}

// Dine egne. Skriveregelen gir en vanlig leser bare sine egne uansett;
// filteret pa `sendt_av` er for den som ogsa er admin, og som ellers ville
// sett hele koen under navnet sitt. Id-en kommer fra appen og kan bare
// snevre inn — basen slipper aldri ut mer enn okten gir.
async function mine(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Logg inn for å se meldingene dine." }, 401);
  const bruker = String(inn.bruker || "");
  if (!UUID.test(bruker)) return svar({ feil: "Ukjent bruker" }, 400);

  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&sendt_av=eq." + bruker
      + "&order=sendt.desc&limit=20",
    null, token);
  if (!r.ok) return feilSvar(r);
  return svar({ meldinger: tolkTilbakemeldinger(r.json) }, 200);
}

/* ---------- portalen ---------- */

async function hentKo(inn) {
  const nekt = adgang(inn);
  if (nekt) return nekt;

  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&order=sendt.desc&limit=" + TILBAKEMELDING_MAKS,
    null, String(inn.token));
  if (!r.ok) return feilSvar(r);
  return svar({ meldinger: tolkTilbakemeldinger(r.json) }, 200);
}

async function behandle(inn) {
  const nekt = adgang(inn);
  if (nekt) return nekt;

  const id = String(inn.id || "");
  // Id-en gar inn i en adresse, sa den sjekkes mot formen en uuid har.
  if (!UUID.test(id)) return svar({ feil: "Ukjent melding" }, 400);
  const status = String(inn.status || "");
  if (STATUSER.indexOf(status) === -1 || status === "ny") {
    return svar({ feil: "Ukjent status" }, 400);
  }

  const r = await hosSupabase("PATCH",
    "/rest/v1/" + TABELL + "?id=eq." + id + "&select=" + FELT,
    { status, behandlet: new Date().toISOString() },
    String(inn.token), { "Prefer": "return=representation" });
  if (!r.ok) return feilSvar(r);

  const endret = tolkTilbakemeldinger(r.json);
  if (!endret.length) {
    return svar({
      feil: "Ingenting ble endret. Står du i visning_skrivere?",
      forsok: r.forsok,
    }, 502);
  }
  return svar({ ok: true, melding: endret[0] }, 200);
}

// Passordet apner portalen; okten er den databasen sjekker. Sjekken skjer
// for alt annet: et feil passord nar aldri Supabase.
function adgang(inn) {
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }
  if (!String(inn.token || "")) {
    return svar({
      feil: "Logg inn i appen først. Meldingene leses med din egen økt, ikke"
        + " med en nøkkel — og da må databasen vite hvem du er.",
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
    const melding = tjenestensOrd(json, tekst);
    if (melding) forsok.melding = melding;
    // Kroppen blir med for diagnose selv naar den ikke er ord: en
    // 522-konvolutt sier HVOR det stoppet. Den staar i `kropp`, ikke i
    // `melding`, sa `tjenestenSa()` i appen ikke limer den inn i det
    // leseren ser — det var nettopp det som skjedde 22. september 2026.
    else forsok.kropp = diagnosekropp(tekst);
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
        + " SQL-en står i docs/oppsett.sql, del 9.",
      forsok: r.forsok,
    }, 503);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({
      feil: "Økten gjelder ikke lenger. Logg inn på nytt i appen.",
      forsok: r.forsok,
    }, 401);
  }
  console.error("[tilbakemelding] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: "Fikk ikke svar fra lageret. Prøv igjen om litt.", forsok: r.forsok }, 502);
}

function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.ADMIN_PASSORD) mangler.push("ADMIN_PASSORD");
  if (!process.env.SUPABASE_URL) mangler.push("SUPABASE_URL");
  if (!process.env.SUPABASE_ANON_KEY) mangler.push("SUPABASE_ANON_KEY");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Tilbakemeldinger er ikke satt opp: " + mangler.join(" og ")
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

export const config = { path: "/api/tilbakemelding" };
