// Adminloggen: hvem var inne i portalen, og hva har skjedd siden sist.
//
// **Loggen skrives med innloggedes egen økt, ikke med en nøkkel.** Samme
// valg som pubforslagene og tilbakemeldingene: ingen service_role her, så
// en feil i denne fila kan ikke skrive i en annens navn. Databasen setter
// `bruker` fra økta og `tid` fra klokka si, og skriveregelen krever at
// `bruker` er deg og at du står i `visning_skrivere` (docs/oppsett.sql,
// del 10). Ingen oppdatering, ingen sletting: loggen er bare å legge til.
//
// **Portalen åpner seg bare når raden ligger der.** ADMIN_PASSORD er en
// delt hemmelighet, og alene sier den ikke hvem som kom inn. Uten en økt vet
// vi ikke hvem det var — og en logg over «noen» er verre enn ingen.
//
// To handlinger, begge bak passordet:
//   innlogget  skriver raden og svarer med forrige innlogging din
//   liste      leser de siste radene, for seksjonen «Adminlogg»

import { sjekkInnlogging, loggRad, tolkAdminLogg, forrigeInnlogging, LOGG_MAKS }
  from "../../admin-logg-data.js";

import { tjenestensOrd, diagnosekropp }
  from "../../tjeneste-data.js";

const TABELL = "admin_logg";
const FELT = "id,bruker,tid,versjon,antall";

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

  // Passordet først, og et feil passord når aldri Supabase.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }
  const token = String(inn.token || "");
  if (!token) {
    return svar({
      feil: "Logg inn i appen først. Portalen logger hvem som er inne, og det"
        + " vet vi bare fra din egen økt.",
    }, 401);
  }

  if (inn.handling === "innlogget") return innlogget(inn, token);
  if (inn.handling === "liste") return liste(token);
  return svar({ feil: "Ukjent handling" }, 400);
};

async function innlogget(inn, token) {
  const problemer = sjekkInnlogging(inn);
  if (problemer.length) return svar({ feil: problemer[0], problemer }, 400);

  const skrevet = await hosSupabase("POST", "/rest/v1/" + TABELL + "?select=" + FELT,
    loggRad(inn), token, { "Prefer": "return=representation" });
  if (!skrevet.ok) return feilSvar(skrevet);

  // En skriving som svarer 200 er ikke bevis på at raden ligger der.
  const rad = tolkAdminLogg(skrevet.json)[0];
  if (!rad) {
    return svar({
      feil: "Innloggingen ble ikke logget. Skrivingen svarte " + skrevet.status
        + ", men ingen rad kom tilbake.",
      forsok: skrevet.forsok,
    }, 502);
  }

  // Forrige innlogging, av radene for samme bruker. uid-en er den basen
  // selv satte, ikke noe appen sa — så ingen kan be om en annens forrige.
  // Svikter lesingen, er du likevel logget: portalen sier at den ikke fikk
  // hentet forrige gang framfor å late som ingenting var nytt.
  const dine = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&bruker=eq." + rad.bruker
      + "&order=tid.desc&limit=2", null, token);
  if (!dine.ok) {
    return svar({
      ok: true, innlogging: rad, forrige: null, forrigeFeil: true,
      forsok: dine.forsok,
    }, 200);
  }
  const forrige = forrigeInnlogging(tolkAdminLogg(dine.json), rad);
  return svar({ ok: true, innlogging: rad, forrige, forrigeFeil: false }, 200);
}

async function liste(token) {
  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&order=tid.desc&limit=" + LOGG_MAKS,
    null, token);
  if (!r.ok) return feilSvar(r);
  return svar({ logg: tolkAdminLogg(r.json) }, 200);
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
        + " SQL-en står i docs/oppsett.sql, del 10.",
      forsok: r.forsok,
    }, 503);
  }
  // Databasen sa nei til raden: du er innlogget, men står ikke i
  // `visning_skrivere`. Det er et annet svar enn en utløpt økt, og krever
  // noe annet av den som leser det — den ene ber deg logge inn på nytt, den
  // andre at noen legger deg til.
  if (kode === "42501" || /row-level security/i.test(r.melding || "")) {
    return svar({
      feil: "Kontoen din har ikke adgang til portalen: den står ikke i"
        + " visning_skrivere. Be en som har adgang om å legge deg til.",
      forsok: r.forsok,
    }, 403);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({
      feil: "Økten gjelder ikke lenger. Åpne appen, vent til navnet ditt står"
        + " øverst, og prøv igjen.",
      forsok: r.forsok,
    }, 401);
  }
  console.error("[admin-logg] " + r.status + ": " + (r.melding || ""));
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
  return "Adminloggen er ikke satt opp: " + mangler.join(" og ")
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

export const config = { path: "/api/admin-logg" };
