// Innlogging med engangskode pa e-post.
//
// Hvorfor en tjeneste og ikke egen kode: en innlogging er nok
// kryptografi, e-postsending og sperring av gjentatte forsok til at
// egenskrevet er feil sted a spare. Supabase Auth gjor den jobben.
//
// Hvorfor kallet gar herfra og ikke fra nettleseren: da snakker appen
// bare med sitt eget domene. Ingen tredjepartsskript i index.html, ingen
// informasjonskapsel fra noen andre, og nokkelen nar aldri leseren —
// samme regel som for API-Football.
//
// Miljoet: SUPABASE_URL og SUPABASE_ANON_KEY. Uten dem svarer funksjonen
// 503 og sier hvilken som mangler, som visninger.mjs. Husk at
// funksjonene leser miljoet ved utrulling: en ny variabel krever en ny
// deploy, og miljovariabler er versalfolsomme.
//
// Hva vi lagrer om en leser: e-postadressen, hos Supabase. Ingenting
// annet, og ingenting her. Det star ogsa i innloggingen, der leseren
// skriver adressen.

import { normaliserEpost, gyldigEpost, normaliserKode, gyldigKode, tolkOkt }
  from "../../konto-data.js";

// Rekkefolgen er den vi tror er vanligst forst, sa de fleste
// innloggingene koster ett kall.
const KODETYPER = ["email", "magiclink", "signup"];

export default async (req) => {
  const mangler = manglerIOppsettet();

  // Appen sporr om oppsettet for den viser innloggingen. Uten dette far
  // leseren et skjema som ikke kan virke, og en feil forst etter at
  // adressen er skrevet inn. Svaret rooper ingenting: navnene pa
  // miljovariablene star i repoet fra for.
  if (req.method === "GET") return svar({ klar: mangler.length === 0, mangler }, 200);
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);
  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  if (inn.handling === "kode") return sendKode(inn);
  if (inn.handling === "logg-inn") return loggInn(inn);
  if (inn.handling === "hvem") return hvem(inn);
  if (inn.handling === "slett") return slettMeg(inn);
  return svar({ feil: "Ukjent handling" }, 400);
};

/* ---------- handlingene ---------- */

// Svaret er det samme enten adressen finnes fra for eller ikke: ellers
// er innloggingen et oppslagsverk over hvem som bruker appen.
async function sendKode(inn) {
  const epost = normaliserEpost(inn.epost);
  if (!gyldigEpost(epost)) return svar({ feil: "Skriv en e-postadresse" }, 400);

  const r = await hosSupabase("/auth/v1/otp", {
    email: epost,
    create_user: true,
  });

  // 429 er den ene feilen leseren kan gjore noe med: vente. Resten
  // skiller vi ikke pa utad — en tjenestefeil skal ikke bli en
  // beskjed om hvem som har konto.
  if (r.status === 429) {
    return svar({ feil: "For mange forsøk. Vent et minutt og prøv igjen." }, 429);
  }
  if (!r.ok) {
    console.error("[konto] otp feilet:", r.status, r.melding);
    return svar({ feil: "Fikk ikke sendt koden. Prøv igjen om litt.", forsok: r.forsok }, 502);
  }
  return svar({ sendt: true }, 200);
}

async function loggInn(inn) {
  const epost = normaliserEpost(inn.epost);
  const kode = normaliserKode(inn.kode);
  if (!gyldigEpost(epost)) return svar({ feil: "Skriv en e-postadresse" }, 400);
  if (!gyldigKode(kode)) return svar({ feil: "Skriv sifrene fra e-posten" }, 400);

  // Supabase lagrer koden ulikt etter hvilken vei adressen kom inn: en
  // adresse som ikke fantes fra for far den som «signup», en som finnes
  // som «magiclink», og nyere utgaver godtar «email» som fellesnavn.
  // Utenfra ser alle tre like ut: en kode slatt opp med feil type og en
  // kode som faktisk er feil gir samme 403. Vi kan altsa ikke vite
  // hvilken det er for vi har prov d, og leseren skal ikke trenge a vite
  // det heller.
  //
  // Bare avvisninger gir et forsok til. En tjenestefeil (5xx) eller en
  // sperre (429) skal aldri legge en runde til pa noe som alt er galt et
  // annet sted.
  let r = null;
  for (const type of KODETYPER) {
    const forsok = await hosSupabase("/auth/v1/verify", {
      email: epost,
      token: kode,
      type,
    });
    if (forsok.ok) { r = forsok; break; }

    if (r) forsok.forsok = r.forsok.concat(forsok.forsok);
    r = forsok;
    if (!(r.status > 0 && r.status < 500 && r.status !== 429)) break;
  }

  // Feil kode og utlopt kode far samme svar: at en kode fantes er i seg
  // selv noe om adressen.
  if (!r.ok) {
    if (r.status === 429) {
      return svar({ feil: "For mange forsøk. Vent et minutt og prøv igjen." }, 429);
    }
    if (r.status >= 500) {
      console.error("[konto] verify feilet:", r.status, r.melding);
      return svar({ feil: "Innloggingen svarte ikke. Prøv igjen om litt.", forsok: r.forsok }, 502);
    }
    // Tjenestens egen melding folger med. Den skiller ikke pa feil og
    // utlopt kode — det er samme setning begge veier — sa den roper
    // ingenting om adressen. Men den skiller pa om avvisningen kom fra
    // verify i det hele tatt, og hvilke typer som ble prov d, og det er
    // forskjellen pa a lete og a vite.
    return svar({ feil: "Koden stemmer ikke, eller den er for gammel.",
      forsok: r.forsok }, 401);
  }

  let okt;
  try {
    okt = tolkOkt(r.json);
  } catch (err) {
    console.error("[konto] uventet svar fra verify:", err);
    return svar({ feil: "Uventet svar fra innloggingen" }, 502);
  }
  return svar(okt, 200);
}

// Appen sporr om okta fortsatt gjelder. Den lokale utlopsdatoen sier bare
// nar vi tror den gikk ut; dette er tjenestens eget svar.
async function hvem(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Mangler økt" }, 400);

  let respons;
  try {
    respons = await fetch(base() + "/auth/v1/user", {
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
      },
    });
  } catch (err) {
    console.error("[konto] user feilet:", err);
    return svar({ feil: "Innloggingen svarte ikke" }, 502);
  }

  if (!respons.ok) return svar({ feil: "Økten gjelder ikke lenger" }, 401);

  const json = await respons.json().catch(() => null);
  const epost = normaliserEpost(json && json.email);
  if (!gyldigEpost(epost)) return svar({ feil: "Økten gjelder ikke lenger" }, 401);
  return svar({ epost }, 200);
}

// Sletting av egen konto. Normalt krever det admin-tilgang hos Supabase,
// og en service_role-nokkel som kan slette hvem som helst — den finnes
// ikke her, med vilje. I stedet ligger det en databasefunksjon
// (`slett_meg`) som sletter raden i auth.users der id-en er din egen, og
// bare den. Den kalles med leserens egen okt, sa selv en feil her kan
// ikke slette en annens konto.
//
// Radene i kampsvar folger med: fremmednokkelen star med on delete
// cascade. En sletting er derfor hel — adressen og navnet forsvinner
// samtidig.
async function slettMeg(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Logg inn først" }, 401);

  const forsok = { kilde: "Supabase", sti: "/rest/v1/rpc/slett_meg" };
  try {
    const respons = await fetch(base() + "/rest/v1/rpc/slett_meg", {
      method: "POST",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: "{}",
    });
    forsok.status = respons.status;

    if (respons.ok) return svar({ slettet: true }, 200);

    const tekst = await respons.text().catch(() => "");
    let json = null;
    try { json = tekst ? JSON.parse(tekst) : null; } catch (err) { json = null; }
    const melding = kortMelding(json) || (json && json.message) || tekst.slice(0, 120);
    if (melding) forsok.melding = melding;

    if (respons.status === 401 || respons.status === 403) {
      return svar({ feil: "Økten gjelder ikke lenger. Logg inn på nytt.", forsok: [forsok] }, 401);
    }
    // 404 fra PostgREST betyr som regel at funksjonen ikke er laget enda.
    if (respons.status === 404) {
      return svar({
        feil: "Slettingen er ikke satt opp i Supabase ennå."
          + " SQL-en står i docs/nokler-og-tokens.md.",
        forsok: [forsok],
      }, 503);
    }
    console.error("[konto] slett feilet:", respons.status, melding);
    return svar({ feil: "Fikk ikke slettet kontoen. Prøv igjen om litt.", forsok: [forsok] }, 502);
  } catch (err) {
    forsok.utfall = String((err && err.message) || err).slice(0, 80);
    console.error("[konto] slett feilet:", err);
    return svar({ feil: "Fikk ikke slettet kontoen. Prøv igjen om litt.", forsok: [forsok] }, 502);
  }
}

/* ---------- tjenesten ---------- */

function base() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

// Ett sted for kallet, sa nokkelen settes likt hver gang og aldri glemmes.
// Feilen fra Supabase leses ut i `forsok` — status og tjenestens egen
// melding, uten nokkel og uten adresser — slik fotball- og
// vaerfunksjonen gjor det: da kan en feil leses fra nettleseren framfor
// a graves fram av funksjonsloggen.
async function hosSupabase(sti, kropp) {
  const forsok = { kilde: "Supabase Auth", sti };
  try {
    const respons = await fetch(base() + sti, {
      method: "POST",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(kropp),
    });
    forsok.status = respons.status;

    const json = await respons.json().catch(() => null);
    const melding = kortMelding(json);
    if (melding) forsok.melding = melding;
    return { ok: respons.ok, status: respons.status, json, melding, forsok: [forsok] };
  } catch (err) {
    forsok.utfall = String((err && err.message) || err).slice(0, 80);
    return { ok: false, status: 0, json: null, melding: forsok.utfall, forsok: [forsok] };
  }
}

// Supabase legger feilen i ulike felt etter hvilket endepunkt det er.
function kortMelding(json) {
  if (!json) return "";
  const tekst = json.error_description || json.msg || json.message || json.error || "";
  return String(tekst).slice(0, 120);
}

/* ---------- oppsett ---------- */

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

function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/konto" };
