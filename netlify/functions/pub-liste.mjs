// Rettelsene som ligger oppa puber.js (#80).
//
// **Fila er grunnfjellet.** Den ligger i koden, virker uten nettverk, og
// er det leseren ser om Supabase er nede. Den ble aldri skrevet herfra og
// blir det ikke na heller. Basen barer bare rettelsene oppa, og appen
// slar dem sammen selv — derfor svarer GET med rettelsene alene, ikke med
// en ferdig liste. Et svar som var hele lista, ville gjort funksjonen til
// det skjoreste leddet i noe som i dag ikke kan ryke.
//
// Skrivingen gar med **skriverens egen okt**, som i visninger og
// kampsvar. Ingen service_role-nokkel her: ADMIN_PASSORD er doren til
// skjemaet, og RLS slar opp uid-en i visning_skrivere. To lasser, og den
// som holder er databasens (ADR 0018, ADR 0020).
//
// Oppslaget mot OpenStreetMap ligger ogsa her, bak passordet. Overpass
// ber om fair use, og et navnesok som hvem som helst kunne kjort er et
// sok noen kommer til a kjore tusen ganger.

import {
  tolkPubRader, pubRadTilBase, sjekkPubRad,
  osmNavnSporring, tolkNavnTreff, OVERPASS_SPEIL, overpassHeadere,
  osmAdresseSporring, tolkAdresseTreff, delAdresse, SOK_SEKUNDER,
  rammeFor, bynavn,
  overpassFeiltekst,
} from "../../pub-data.js";

const TABELL = "puber";
const FELT = "nokkel,navn,bydel,adresse,lat,lon,type,lag,kilde,sikkerhet,sjekket,merknad,fjernet";
// Kort levetid med vilje. En rettelse skal vaere ute mens admin fortsatt
// sitter med portalen apen; et dogn — som pubene rundt arenaen har — ville
// gjort «lagret» til en pastand admin ikke kunne etterprove.
export const LEVETID_PUBLISTE = 120;
// Fristen folger sporringens egen timeout, med et halvt sekund pa toppen
// for reise og oppkobling. De sto som to tall for, og de sa ikke det
// samme: sporringen ba om tolv sekunder mens vi la pa etter seks. Da var
// det vi som ga opp — men meldingen sa «Fikk ikke svar fra
// OpenStreetMap», og pekte pa feil part.
export const SOK_FRIST = SOK_SEKUNDER * 1000 + 500;

export default async (req) => {
  const mangler = manglerIOppsettet();

  if (req.method === "GET") return hentListe(mangler);
  if (req.method !== "POST") return svar({ feil: "Bruk GET eller POST" }, 405, 0);
  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503, 0);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400, 0);
  }

  // Sammenlikner hele lengden uansett, sa svartiden ikke rooper hvor mange
  // tegn som stemte. Sjekken skjer for alt annet: et feil passord nar
  // aldri verken Supabase eller Overpass.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401, 0);
  }

  if (inn.handling === "liste") return hentListe(mangler, true);
  if (inn.handling === "sok") return sokNavn(inn);
  if (inn.handling === "sok-adresse") return sokAdresse(inn);
  return lagre(inn);
};

/* ---------- lesing ---------- */

// Uten oppsett: tom liste, ikke feil. Da star fila alene, som for — og
// det er noyaktig den egenskapen ved fila som er verdt mest.
async function hentListe(mangler, ferskt) {
  if (mangler.length) {
    return svar({ puber: [], klar: false, mangler }, 200, ferskt ? 0 : LEVETID_PUBLISTE);
  }

  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&order=navn&limit=500", null, null);
  if (!r.ok) {
    // Feilsvar caches aldri: ellers laser et blaff seg fast i kanten.
    return svar({ puber: [], klar: true, feil: feilTekst(r), forsok: r.forsok }, 200, 0);
  }
  return svar({ puber: tolkPubRader(r.json), klar: true }, 200, ferskt ? 0 : LEVETID_PUBLISTE);
}

/* ---------- skriving ---------- */

async function lagre(inn) {
  const token = String(inn.token || "");
  if (!token) {
    return svar({
      feil: "Logg inn i appen først. Lagringen går med din egen økt, ikke"
        + " med en nøkkel — og da må databasen vite hvem du er.",
    }, 401, 0);
  }

  const problemer = sjekkPubRad(inn.pub);
  if (problemer.length) return svar({ feil: problemer[0], problemer }, 400, 0);

  const rad = pubRadTilBase(inn.pub);
  const r = await hosSupabase("POST",
    "/rest/v1/" + TABELL + "?on_conflict=nokkel&select=" + FELT, [rad], token,
    { "Prefer": "resolution=merge-duplicates,return=representation" });
  if (!r.ok) return feilSvar(r);

  // En skriving som svarer 200 er ikke bevis pa at raden ligger der.
  // Samme lekse som kampsvar: mangler skrivepolicyen, ser svaret
  // vellykket ut mens ingenting ble lagret.
  const skrevet = tolkPubRader(r.json);
  if (!skrevet.length) {
    return svar({
      feil: "Ingenting ble lagret. Skrivingen svarte " + r.status
        + ", men ingen rad kom tilbake. Står du i visning_skrivere?",
      forsok: r.forsok,
    }, 502, 0);
  }

  return svar({
    ok: true,
    pub: skrevet[0],
    merknad: rad.fjernet
      ? "«" + rad.navn + "» er tatt ut av lista. Raden i puber.js står"
        + " urørt — den er bare skjult."
      : "Lagret. Endringen er ute for leserne innen " + LEVETID_PUBLISTE
        + " sekunder — ingen utrulling å vente på.",
  }, 200, 0);
}

/* ---------- oppslag i OpenStreetMap ---------- */

// Byen soket skal lete i. Ukjent by er ikke en stille tilbakefall til
// Oslo: da ville portalen svart «fant ingenting» om et sted som star der,
// bare i en annen by — og det er nettopp feilen som gjorde at en RBK-pub
// ikke kunne foeres inn.
function rammeAv(inn) {
  const valgt = String((inn && inn.by) || "").trim();
  if (!valgt) return { ramme: rammeFor("oslo") };
  const ramme = rammeFor(valgt);
  if (!ramme) return { feil: "Ukjent by. Velg en av: " + bynavn().join(", ") + "." };
  return { ramme };
}

async function sokNavn(inn) {
  const valg = rammeAv(inn);
  if (valg.feil) return svar({ feil: valg.feil }, 400, 0);
  const sporring = osmNavnSporring(inn.navn, valg.ramme);
  if (!sporring) {
    return svar({ feil: "Skriv minst ett ord på tre bokstaver å søke etter." }, 400, 0);
  }
  return kjorSok(sporring, tolkNavnTreff, { by: valg.ramme.navn });
}

// Adressesoket. Navnesoket finner ikke et sted OSM ikke kjenner navnet
// pa — og det er de sma stedene, nettopp de admin ma foere inn for hand.
// Huset star der likevel: norske adresser i OSM kommer fra Kartverket.
async function sokAdresse(inn) {
  const valg = rammeAv(inn);
  if (valg.feil) return svar({ feil: valg.feil }, 400, 0);
  const sporring = osmAdresseSporring(inn.adresse, valg.ramme);
  if (!sporring) {
    return svar({ feil: "Skriv en gate, gjerne med husnummer — «Berglyveien 4J»." }, 400, 0);
  }
  // Uten husnummer kan en gate gi mange hus, og da er det ikke soket som
  // er darlig — det er sporsmalet. Det skal sies, ikke gjettes rundt.
  const delt = delAdresse(inn.adresse);
  return kjorSok(sporring, tolkAdresseTreff,
    { utenNummer: !delt.nummer, by: valg.ramme.navn });
}

// En sporring mot alle speilene samtidig. Den forste som svarer vinner;
// resten forklares i `forsok`, som er det eneste stedet admin kan se
// HVORFOR et sok ikke ga noe.
async function kjorSok(sporring, tolk, ekstra) {
  const styring = new AbortController();
  const vakt = setTimeout(() => styring.abort(), SOK_FRIST);
  const kropp = "data=" + encodeURIComponent(sporring);
  // Notatene eies her, ett per speil, og fylles pa plass.
  //
  // De ble hentet fra avvisningene for, og det loy: nar AbortController
  // avbryter, avvises ALLE kallene med det samme feilobjektet. Et notat
  // hengt pa det ble overskrevet av neste, og lista sto da med ett speil
  // to ganger og et annet ikke i det hele tatt — med samme tid pa begge.
  // En diagnostikk som forveksler to tjenere er verre enn ingen.
  const forsok = OVERPASS_SPEIL.map((adresse) =>
    ({ kilde: "Overpass " + new URL(adresse).host }));
  const alle = OVERPASS_SPEIL.map((adresse, i) =>
    enTjener(adresse, kropp, styring.signal, tolk, forsok[i]));

  let vinner = null;
  try {
    vinner = await Promise.any(alle);
  } catch (err) {
    // Alle feilet. Hver enkelt forklares i forsok-lista under.
  }
  clearTimeout(vakt);
  styring.abort();
  await Promise.allSettled(alle);

  if (!vinner) {
    return svar({ feil: "Fikk ikke svar fra OpenStreetMap. Tast koordinatene selv,"
      + " eller lim inn en kartlenke.", forsok }, 502, 0);
  }
  return svar(Object.assign({ treff: vinner.treff, kilde: "OpenStreetMap", forsok },
    ekstra || {}), 200, 0);
}

function enTjener(adresse, kropp, signal, tolk, notat) {
  const vert = new URL(adresse).host;
  const startet = Date.now();
  return (async () => {
    const respons = await fetch(adresse, {
      method: "POST", headers: overpassHeadere(true), body: kropp, signal,
    });
    notat.status = respons.status;
    if (!respons.ok) {
      // Feilsiden er HTML, og de forste 80 tegnene er alltid «<!DOCTYPE
      // html PUBLIC …». Grunnen star lenger nede, og det er den vi vil ha.
      const melding = overpassFeiltekst(await respons.text().catch(() => ""));
      if (melding) notat.melding = melding;
      throw new Error("HTTP " + respons.status);
    }
    const treff = (tolk || tolkNavnTreff)(await respons.json(), 8);
    notat.antall = treff.length;
    notat.ms = Date.now() - startet;
    return { notat, treff };
  })().catch((err) => {
    console.error("[pub-liste] Overpass " + vert + " feilet:", err);
    notat.utfall = String((err && err.message) || err).slice(0, 80);
    notat.ms = Date.now() - startet;
    throw err instanceof Error ? err : new Error(String(err));
  });
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
  // Egen okt ved skriving. Ved lesing sendes ingen: lista skal kunne
  // leses uten konto, som alt annet i appen.
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

function feilTekst(r) {
  const kode = (r.json && r.json.code) || "";
  if (kode === "42P01" || /does not exist/i.test(r.melding || "")) {
    return "Tabellen «" + TABELL + "» finnes ikke i Supabase ennå."
      + " SQL-en står i docs/oppsett.sql.";
  }
  if (r.status === 401 || r.status === 403) {
    return "Økten gjelder ikke lenger, eller du står ikke i visning_skrivere."
      + " Logg inn i appen på nytt, og se docs/oppsett.sql for lista.";
  }
  return "Fikk ikke svar fra lageret. Prøv igjen om litt.";
}

function feilSvar(r) {
  const kode = (r.json && r.json.code) || "";
  if (kode === "42P01" || /does not exist/i.test(r.melding || "")) {
    return svar({ feil: feilTekst(r), forsok: r.forsok }, 503, 0);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({ feil: feilTekst(r), forsok: r.forsok }, 401, 0);
  }
  console.error("[pub-liste] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: feilTekst(r), forsok: r.forsok }, 502, 0);
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
  return "Stedredigeringen er ikke satt opp: " + mangler.join(" og ")
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

function svar(kropp, status, levetid) {
  const headere = { "Content-Type": "application/json; charset=utf-8" };
  if (levetid > 0) {
    headere["Cache-Control"] = "public, max-age=0, must-revalidate";
    headere["Netlify-CDN-Cache-Control"] =
      "public, durable, s-maxage=" + levetid + ", stale-while-revalidate=600";
  } else {
    headere["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(kropp), { status, headers: headere });
}

export const config = { path: "/api/pub-liste" };
