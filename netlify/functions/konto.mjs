// Innlogging med fornavn og PIN.
//
// Hvorfor ikke engangskode pa e-post: koden virker, men avsenderen ma
// ligge pa et verifisert domene for at noen andre enn kontoeieren skal
// fa den. Domenet er ikke kjopt enda. Hele e-postinnloggingen —
// funksjonen, malene og oppsettet — star komplett pa grenen
// `epost-innlogging`, klar til a hentes fram. Dette er innloggingen for
// testperioden.
//
// Hvorfor en tjeneste og ikke egen kode: en innlogging er nok
// kryptografi og sperring av gjentatte forsok til at egenskrevet er feil
// sted a spare. Supabase Auth gjor den jobben — og den ma gjore den her,
// ikke i telefonen: skriver du fornavnet og PIN-en pa en annen telefon,
// skal du vaere inne der ogsa.
//
// Hvorfor kallet gar herfra og ikke fra nettleseren: da snakker appen
// bare med sitt eget domene. Ingen tredjepartsskript i index.html, ingen
// informasjonskapsel fra noen andre, og nokkelen nar aldri leseren —
// samme regel som for API-Football. Og pepperet (se pinPassord) finnes
// bare her.
//
// Miljoet: SUPABASE_URL, SUPABASE_ANON_KEY og PIN_PEPPER. Uten dem
// svarer funksjonen 503 og sier hvilken som mangler, som visninger.mjs.
// Husk at funksjonene leser miljoet ved utrulling: en ny variabel krever
// en ny deploy, og miljovariabler er versalfolsomme.
//
// Hva vi lagrer om en leser: fornavnet, hos Supabase. Ingen adresse,
// ingenting annet, og ingenting her.

import { tolkPinOkt, normaliserPinNavn, gyldigPinNavn, normaliserPin, gyldigPin,
         pinEpost, pinPassord, PIN_MIN, PIN_MAKS } from "../../pin-data.js";

export default async (req) => {
  const mangler = manglerIOppsettet();

  // Appen sporr om oppsettet for den viser innloggingen. Uten dette far
  // leseren et skjema som ikke kan virke, og en feil forst etter at
  // navnet og PIN-en er skrevet inn. Svaret royper ingenting: navnene pa
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

  if (inn.handling === "logg-inn") return loggInn(inn);
  if (inn.handling === "slett") return slettMeg(inn);
  return svar({ feil: "Ukjent handling" }, 400);
};

/* ---------- handlingene ---------- */

// Ett kall for de fleste, to for den forste gangen.
//
// Vi kan ikke sporre tjenesten om navnet finnes — det ville vaert et
// oppslagsverk over hvem som bruker appen, og det ville kostet et kall
// uansett. I stedet prover vi a logge inn forst, fordi det er det
// vanligste, og lager kontoen bare hvis innloggingen ikke gikk.
async function loggInn(inn) {
  const navn = normaliserPinNavn(inn.navn);
  const pin = normaliserPin(inn.pin);
  if (!gyldigPinNavn(navn)) return svar({ feil: "Skriv fornavnet ditt" }, 400);
  if (!gyldigPin(pin)) {
    return svar({ feil: "PIN-en er " + PIN_MIN + " til " + PIN_MAKS + " siffer" }, 400);
  }

  const epost = pinEpost(navn);
  const passord = pinPassord(pin, process.env.PIN_PEPPER);

  const inne = await hosSupabase("/auth/v1/token?grant_type=password",
    { email: epost, password: passord });
  // 200 uten token er ikke en innlogging. Vi krever token-et framfor a
  // stole pa statuskoden: et svar vi ikke kjenner igjen skal falle videre
  // til a lage kontoen, ikke bli en 502 pa noe som kanskje gikk bra.
  if (inne.ok && inne.json && inne.json.access_token) return pinOkt(inne, navn);

  // En avvisning betyr ett av to: navnet finnes ikke enda, eller PIN-en
  // er feil. Utenfra ser de like ut, sa vi prover a lage kontoen. En
  // tjenestefeil eller en sperre skal derimot ikke legge en runde til pa
  // noe som alt er galt et annet sted.
  if (!(inne.status > 0 && inne.status < 500 && inne.status !== 429)) return pinFeil(inne);

  const ny = await hosSupabase("/auth/v1/signup", { email: epost, password: passord });
  ny.forsok = inne.forsok.concat(ny.forsok);

  if (ny.ok && ny.json && ny.json.access_token) return pinOkt(ny, navn);

  // Supabase svarer 200 uten okt i to tilfeller, og de betyr helt ulike
  // ting. Skillet er `identities`: en tom liste er tjenestens mate a
  // svare «denne finnes alt» uten a rope det. Er lista der og full, er
  // det e-postbekreftelse som star pa — og den kan ikke sta pa her,
  // siden adressen ikke er en ekte adresse.
  if (ny.ok) {
    const identiteter = ny.json && ny.json.user && ny.json.user.identities;
    if (Array.isArray(identiteter) && identiteter.length === 0) return navnetErTatt(navn, ny);
    return svar({
      feil: "Innloggingen krever at e-postbekreftelse er slått av i Supabase."
        + " Det står i docs/nokler-og-tokens.md.",
      forsok: ny.forsok,
    }, 503);
  }

  if (alleredeTatt(ny)) return navnetErTatt(navn, ny);
  return pinFeil(ny);
}

// At et fornavn er tatt, sier vi rett ut. Det er det motsatte av hva vi
// gjor med e-postadresser — men et fornavn i en vennegjeng er ikke en
// hemmelighet, og alternativet er at «Ola» far «feil PIN» uten a fa vite
// at det er en annen Ola som har navnet.
function navnetErTatt(navn, r) {
  return svar({
    feil: "«" + navn + "» er tatt. Er PIN-en feil, eller skal du velge et annet navn?",
    forsok: r.forsok,
  }, 401);
}

function alleredeTatt(r) {
  const kode = (r.json && (r.json.error_code || r.json.code)) || "";
  return kode === "user_already_exists" || kode === "email_exists"
    || /already registered|already exists/i.test(r.melding || "");
}

function pinOkt(r, navn) {
  let okt;
  try {
    okt = tolkPinOkt(r.json, navn);
  } catch (err) {
    console.error("[konto] uventet svar fra innloggingen:", err);
    return svar({ feil: "Uventet svar fra innloggingen", forsok: r.forsok }, 502);
  }
  // Adressen vi laget av navnet folger ikke med. Appen trenger den ikke,
  // og «ola@pin.mvp-sb.netlify.app» i menyen er ingenting a vise noen.
  return svar(okt, 200);
}

function pinFeil(r) {
  if (r.status === 429) {
    return svar({ feil: "For mange forsøk. Vent et minutt og prøv igjen." }, 429);
  }
  if (r.status >= 500 || r.status === 0) {
    console.error("[konto] innlogging feilet:", r.status, r.melding);
    return svar({ feil: "Innloggingen svarte ikke. Prøv igjen om litt.", forsok: r.forsok }, 502);
  }
  // Tjenestens egen melding folger med i `forsok`, som i pubforslagene:
  // da kan en feil leses fra nettleseren framfor a graves fram av
  // funksjonsloggen. Hverken pepperet eller adressen ligger der.
  return svar({ feil: "Navnet eller PIN-en stemmer ikke.", forsok: r.forsok }, 401);
}

// Sletting av egen konto. Normalt krever det admin-tilgang hos Supabase,
// og en service_role-nokkel som kan slette hvem som helst — den finnes
// ikke her, med vilje. I stedet ligger det en databasefunksjon
// (`slett_meg`) som sletter raden i auth.users der id-en er din egen, og
// bare den. Den kalles med leserens egen okt, sa selv en feil her kan
// ikke slette en annens konto.
//
// Radene i kampsvar folger med: fremmednokkelen star med on delete
// cascade. En sletting er derfor hel — kontoen og svarene forsvinner
// samtidig, og fornavnet blir ledig for noen andre.
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
  // Pepperet er ikke valgfritt: uten det er passordet hos tjenesten fire
  // siffer, og Supabase krever seks tegn. Da ville den forste
  // innloggingen feilet med en melding om passordlengde, og ingen ville
  // skjont hvorfor.
  if (!process.env.PIN_PEPPER) mangler.push("PIN_PEPPER");
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
