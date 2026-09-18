// Admin-portalens lagring: hvilke kamper pubene viser.
//
// Lagret var GitHub til 15. september 2026: hver lagring var en commit i
// visninger.js, med historikk og mulighet til a rette for hand. To ting
// veltet det (#79). GITHUB_TOKEN kan skrive kode, ikke bare data — en
// feil her kunne endret appen. Og funksjonen leste sha, flettet og skrev
// tilbake, sa to samtidige lagringer lot den ene tape stille. Med én
// admin var det teoretisk; med puber som skriver selv (#65) er det ikke
// det, og pubene kan uansett ikke skrive til repoet.
//
// Na er lagret Supabase, som kampsvar — og skrivingen gar med **leserens
// egen okt**, ikke med en nokkel som kan skrive hva som helst. Det er
// verdt a si hvorfor, siden ADMIN_PASSORD ser ut som at det burde holde:
// passordet er vart, og Supabase vet ikke hva det er. Databasen trenger
// sin egen identitet for a slippe en skriving gjennom RLS. Alternativene
// var a la anon skrive (da er tabellen apen for hvem som helst som
// kjenner nokkelen), en security definer-funksjon med passordet som
// argument (samme makt, bare flyttet inn i basen — avvist for
// brukere.mjs av nettopp den grunnen), eller en service_role-nokkel til
// (regelen er at det er én fil som har en).
//
// Derfor: RLS slar opp uid-en i visning_skrivere. ADMIN_PASSORD star
// igjen som doren til skjemaet, ikke til skrivingen — to lasser, og den
// som faktisk holder er databasens.

import { PUBER_OSLO } from "../../puber-oslo.js";
import { slaSammenPuber, tolkPubRader } from "../../pub-data.js";
import {
  sjekkVisninger, slaSammen, tolkVisninger, visningRad, kampIderFor,
  visningsDiff,
} from "../../visning-data.js";

const TABELL = "visninger";
// Stedene admin har rettet i portalen ligger her (#80). «Ukjent pub» ma
// sporre den sammensatte lista, ikke fila alene: et sted som ble lagt inn
// i editoren for fem minutter siden, star ikke i fila — og en lagring som
// ble avvist med «Ukjent pub» pa et sted som star i velgeren, ville vaert
// ubegripelig.
const PUBTABELL = "puber";
// Hele raden, ikke bare navnet. slaSammenPuber bytter ut hele raden fra
// fila, sa en halv rad herfra ville gjort en rettet pub til et navn uten
// koordinat. Her trengs bare navnene — men en liste som ikke er hel, er
// en felle for neste som leser den.
const PUBFELT = "nokkel,navn,bydel,adresse,lat,lon,type,lag,kilde,sikkerhet,sjekket,merknad,fjernet";
const FELT = "pub,kamp_id,kamp,dato,satt";
// Rader for kamper som er spilt for lenge siden har ingen verdi, og lista
// ville vokst uten ende. Ryddes hver gang admin lagrer, som for.
const RYDD_DAGER = 2;

export default async (req) => {
  const mangler = manglerIOppsettet();

  // Portalen sporr om oppsettet for den viser noe som helst. Far admin
  // forst vite at portalen ikke er satt opp nar hen trykker Lagre, er
  // valget allerede gjort en gang til ingen nytte. Svaret rooper
  // ingenting: navnene pa miljovariablene star i repoet fra for.
  if (req.method === "GET") return hentOppsett(mangler);
  if (req.method !== "POST") return svar({ feil: "Bruk GET eller POST" }, 405);

  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  // Sammenlikner hele lengden uansett, sa svartiden ikke rooper hvor
  // mange tegn som stemte. Sjekken skjer for alt annet: et feil passord
  // nar aldri Supabase.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }

  // Innloggingen: portalen viser ingenting for passordet er godtatt.
  if (inn.handling === "sjekk") return svar({ ok: true }, 200);

  return lagre(inn);
};

/* ---------- lesing ---------- */

// Oppsettet og lista i ett. Portalen trenger begge ved apning: hva som
// mangler i miljoet, og hva som alt star lagret for puben admin velger.
async function hentOppsett(mangler) {
  if (mangler.length) return svar({ klar: false, mangler, visninger: [] }, 200);

  const r = await hosSupabase("GET",
    "/rest/v1/" + TABELL + "?select=" + FELT + "&order=dato&limit=500", null, null);
  if (!r.ok) {
    return svar({ klar: true, mangler: [], visninger: [], feil: feilTekst(r), forsok: r.forsok }, 200);
  }
  return svar({ klar: true, mangler: [], visninger: tolkVisninger(r.json) }, 200);
}

/* ---------- skriving ---------- */

// «1 kamp», ikke «1 kamper». Star her og ikke i visning-data.js fordi den
// bare brukes til a forme kvitteringen herfra.
function antall(n) {
  return n + (n === 1 ? " kamp" : " kamper");
}

async function lagre(inn) {
  const token = String(inn.token || "");
  if (!token) {
    return svar({
      feil: "Logg inn i appen først. Lagringen går med din egen økt, ikke"
        + " med en nøkkel — og da må databasen vite hvem du er.",
    }, 401);
  }

  const pub = String(inn.pub || "");
  const kamper = Array.isArray(inn.kamper) ? inn.kamper : [];
  const valgte = Array.isArray(inn.kampIder) ? inn.kampIder : [];
  if (!pub || !kamper.length) return svar({ feil: "Mangler pub eller kamper" }, 400);

  const puber = await kjentePuber();
  if (!puber.some((p) => p.navn === pub)) return svar({ feil: "Ukjent pub" }, 400);

  // Radene for denne puben og disse kampene: de avkryssede, med nokkel.
  const nye = slaSammen(pub, valgte, kamper);
  const problemer = sjekkVisninger(nye, puber.map((p) => p.navn));
  if (problemer.length) return svar({ feil: "Ugyldige visninger", problemer }, 400);

  const ider = kampIderFor(kamper);
  if (!ider.length) return svar({ feil: "Kampene mangler id" }, 400);

  // Avgrensningen er den samme som for: puben sine rader for akkurat de
  // kampene som sto pa skjermen, og ingen andre. Da kan to puber settes
  // etter hverandre, og en annen ligas visninger overlever et bytte.
  const omfang = "?pub=eq." + encodeURIComponent(pub) +
    "&kamp_id=in.(" + ider.map(encodeURIComponent).join(",") + ")";

  // Det som ligger der fra for. Meldt 18. september 2026: «Jeg legger til
  // én, og da star det 6 lagret. Egentlig sa lagrer bruker 1 da.»
  //
  // Vi slettet og skrev alle radene pa nytt. De som ikke var endret fikk
  // da nytt `satt` og ny `satt_av` — feltet som skal si NAR noen satte
  // kampen, sa i stedet «sist noen trykket lagre», og i en annens navn.
  // Ingen sa det, for `satt` vises ikke. Et felt som stille blir usant er
  // verre enn et som ropes ut: ingenting avsloerer det.
  const fra = await hosSupabase("GET", "/rest/v1/" + TABELL + omfang +
    "&select=" + FELT, null, token);
  if (!fra.ok) return feilSvar(fra);
  const { nye: skalLegges, fjern, uendret } = visningsDiff(tolkVisninger(fra.json), nye);

  if (fjern.length) {
    const borte = fjern.map((v) => encodeURIComponent(String(v.kampId))).join(",");
    const slett = await hosSupabase("DELETE",
      "/rest/v1/" + TABELL + "?pub=eq." + encodeURIComponent(pub) +
      "&kamp_id=in.(" + borte + ")", null, token);
    if (!slett.ok) return feilSvar(slett);
  }

  if (skalLegges.length) {
    const r = await hosSupabase("POST",
      "/rest/v1/" + TABELL + "?select=" + FELT, skalLegges.map(visningRad), token,
      { "Prefer": "return=representation" });
    if (!r.ok) return feilSvar(r);
  }

  // En skriving som svarer 200 er ikke bevis pa at raden ligger der.
  // Samme lekse som kampsvar: mangler skrivepolicyen, kan svaret se
  // vellykket ut mens ingenting ble lagret. Vi leser tilbake HELE omfanget
  // — bade for a bevise skrivingen og fordi portalen trenger den fulle
  // lista for disse kampene, ikke bare radene som nettopp ble laget.
  const etter = await hosSupabase("GET", "/rest/v1/" + TABELL + omfang +
    "&select=" + FELT, null, token);
  if (!etter.ok) return feilSvar(etter);
  const skrevet = tolkVisninger(etter.json);

  const staar = new Set(skrevet.map((v) => String(v.kampId)));
  const mangler = skalLegges.filter((v) => !staar.has(String(v.kampId)));
  if (mangler.length) {
    return svar({
      feil: "Ingenting ble lagret. Skrivingen svarte ok, men " + mangler.length
        + " av " + skalLegges.length + " rader kom ikke tilbake."
        + " Star du i visning_skrivere?",
      forsok: etter.forsok,
    }, 502);
  }

  // Ryddebøtta til slutt, og en feil her skal ikke velte en lagring som
  // gikk bra: gamle rader er stoy, ikke en feil leseren merker.
  const grense = new Date(Date.now() - RYDD_DAGER * 86400000).toISOString();
  const ryddet = await hosSupabase("DELETE",
    "/rest/v1/" + TABELL + "?dato=lt." + encodeURIComponent(grense), null, token);
  if (!ryddet.ok) console.error("[visninger] rydding feilet: " + (ryddet.melding || ""));

  // Kvitteringen sier hva som faktisk skjedde, ikke hvor mange kamper som
  // sto avkrysset. «Lagret 6 kamper» nar du la til én er sant om det som
  // ble sendt og usant om det du gjorde.
  const deler = [];
  if (skalLegges.length) deler.push("La til " + antall(skalLegges.length));
  if (fjern.length) deler.push("fjernet " + antall(fjern.length));
  const endret = deler.length
    ? deler.join(", ") + "."
    : "Ingenting var endret.";
  const sto = uendret.length ? " " + antall(uendret.length) + " sto fra før." : "";

  return svar({
    ok: true,
    pub,
    valgt: skrevet.length,
    lagtTil: skalLegges.length,
    fjernet: fjern.length,
    uendret: uendret.length,
    visninger: skrevet,
    merknad: endret + sto
      + " Endringen er ute for leserne med det samme — ingen utrulling å"
      + " vente på.",
  }, 200);
}

// Fila nederst, rettelsene oppa. Svikter oppslaget, star fila alene — og
// da er det verste som skjer at et sted lagt inn i dag ikke kan velges
// enda. Det er bedre enn at ingen kan lagre noe.
async function kjentePuber() {
  const r = await hosSupabase("GET",
    "/rest/v1/" + PUBTABELL + "?select=" + PUBFELT + "&limit=500", null, null);
  if (!r.ok) {
    console.error("[visninger] publiste " + r.status + ": " + (r.melding || ""));
    return PUBER_OSLO;
  }
  return slaSammenPuber(PUBER_OSLO, tolkPubRader(r.json));
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
  // viser kampen skal kunne leses uten konto.
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
    return svar({ feil: feilTekst(r), forsok: r.forsok }, 503);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({ feil: feilTekst(r), forsok: r.forsok }, 401);
  }
  console.error("[visninger] " + r.status + ": " + (r.melding || ""));
  return svar({ feil: feilTekst(r), forsok: r.forsok }, 502);
}

function kortMelding(json) {
  if (!json) return "";
  const tekst = json.message || json.error_description || json.msg || json.error || "";
  return String(tekst).slice(0, 120);
}

// Uten disse kan portalen ingenting, og da skal det sta hvilken som
// mangler. «Portalen er ikke satt opp» alene sender admin til a lete i
// koden etter noe som star i Netlify-panelet.
//
// GITHUB_TOKEN star ikke her lenger: lagringen gar ikke via repoet.
function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.ADMIN_PASSORD) mangler.push("ADMIN_PASSORD");
  if (!process.env.SUPABASE_URL) mangler.push("SUPABASE_URL");
  if (!process.env.SUPABASE_ANON_KEY) mangler.push("SUPABASE_ANON_KEY");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Portalen er ikke satt opp: " + mangler.join(" og ")
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

// Aldri cache. Admin skal se det hen nettopp lagret, ikke et svar som
// henger igjen fra forrige runde.
function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/visninger" };
