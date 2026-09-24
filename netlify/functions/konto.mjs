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
// Hva vi lagrer om en leser: fornavnet og favorittlagene, hos Supabase,
// i brukerens egne metadata. Ingen adresse, ingenting annet, og ingenting
// her.

import { tolkPinOkt, normaliserPinNavn, gyldigPinNavn, normaliserPin, gyldigPin,
         pinEpost, pinSlug, pinPassord, PIN_MIN, PIN_MAKS,
         rensLag, sjekkPinBytte } from "../../pin-data.js";

import { tjenestensOrd, diagnosekropp }
  from "../../tjeneste-data.js";
// Supabase Auth har med vilje ingen «finnes denne?»-vei utenfra, og vi
// har ingen service_role-nokkel til admin-veien. Derfor en liten tabell
// med bare slugen: den sier om et fornavn er tatt, og ingenting mer.
// Fremmednokkelen star med on delete cascade, sa den kan aldri pasta at
// et navn er tatt av en konto som er slettet.
const KONTOLISTE = "pin_kontoer";

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

  if (inn.handling === "finnes") return finnesNavnet(inn);
  if (inn.handling === "logg-inn") return loggInn(inn);
  if (inn.handling === "slett") return slettMeg(inn);
  if (inn.handling === "forny") return fornyOkt(inn);
  if (inn.handling === "lagre-lag") return lagreLag(inn);
  if (inn.handling === "bytt-pin") return byttPin(inn);
  return svar({ feil: "Ukjent handling" }, 400);
};

/* ---------- handlingene ---------- */

// Fornyelsen: bytt en fornyer i et ferskt tilgangstoken.
//
// Uten denne varer en innlogging én time, og appen ba om PIN-en pa nytt
// hver gang — det var det «jeg blir ofte logget ut» var. Fornyeren
// roterer hos Supabase, sa svaret barer en ny som ma lagres i stedet for
// den gamle; den brukte er dod i samme oyeblikk.
//
// PIN-en tastes ikke her, og pepperet rores ikke: fornyeren *er*
// beviset. Den kom fra en innlogging som hadde begge deler.
async function fornyOkt(inn) {
  const fornyer = String(inn.fornyer || "");
  if (!fornyer) return svar({ feil: "Mangler fornyer" }, 400);

  const r = await hosSupabase("/auth/v1/token?grant_type=refresh_token",
    { refresh_token: fornyer });

  // En avvist fornyer er ikke en feil a prove pa nytt: den er brukt,
  // trukket tilbake eller utlopt, og da ma PIN-en tastes. Appen skal
  // logge ut framfor a sta og prove.
  if (!(r.ok && r.json && r.json.access_token)) {
    if (r.status > 0 && r.status < 500) {
      return svar({ feil: "Innloggingen er utløpt. Logg inn på nytt.",
                    utlogget: true, forsok: r.forsok }, 401);
    }
    return pinFeil(r);
  }

  // Navnet star hos tjenesten som metadata, skrevet slik personen selv
  // skrev det. Kontoer laget for vi sendte det med har det ikke, og da er
  // navnet appen alt kjenner det naermeste vi kommer.
  const fraTjenesten = r.json.user && r.json.user.user_metadata
    && r.json.user.user_metadata.navn;
  return pinOkt(r, normaliserPinNavn(fraTjenesten || inn.navn || ""));
}

// Steg ett: er navnet nytt eller kjent?
//
// Appen ma vite det for PIN-en skrives, av en grunn som ikke er kosmetisk:
// er navnet nytt, *lages* en PIN na, og da ma den gjentas. En feiltastet
// PIN ved opprettelse er ikke til a rette opp — vi har ingen e-post a
// sende en ny kode til. Kontoen ville vaert utilgjengelig og navnet
// brent.
//
// At vi svarer pa dette i det hele tatt, er et valg: e-postadresser sier
// vi aldri noe om, men et fornavn i en vennegjeng er ingen hemmelighet,
// og vi sier fra om at det er tatt uansett. Det star i CLAUDE.md.
//
// Navnet sendes som POST og ikke i en adresse: en sporring havner i
// tilgangsloggene hos alle ledd underveis, og et fornavn hoerer ikke
// hjemme der.
async function finnesNavnet(inn) {
  const navn = normaliserPinNavn(inn.navn);
  if (!gyldigPinNavn(navn)) return svar({ feil: "Skriv fornavnet ditt" }, 400);

  const r = await iKontolista("GET",
    "?select=slug&slug=eq." + encodeURIComponent(pinSlug(navn)) + "&limit=1", null, null);
  if (!r.ok) return listeFeil(r);
  return svar({ navn, finnes: Array.isArray(r.json) && r.json.length > 0 }, 200);
}

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

  // Navnet folger med som metadata, skrevet slik personen selv skrev
  // det. Adressen barer bare slugen («bjoernaage»), og den er riktig men
  // ikke pen — adminportalen skal vise «Bjørn Åge».
  const ny = await hosSupabase("/auth/v1/signup", {
    email: epost,
    password: passord,
    data: { navn },
  });
  ny.forsok = inne.forsok.concat(ny.forsok);

  if (ny.ok && ny.json && ny.json.access_token) return pinOkt(ny, navn, true);

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

  // Supabase prover a sende en e-post, og det gjor den bare hvis
  // e-postbekreftelse star pa. Da kommer feilen som 500 «Error sending
  // confirmation email» — ikke som 200-svaret over, fordi den ryker i
  // e-postsendingen for den rekker a svare noe fornuftig.
  //
  // «Innloggingen svarte ikke. Prov igjen om litt» ville sendt leseren ut
  // pa a vente pa noe som aldri gar over av seg selv. Dette er en
  // innstilling, og da skal det sta hvilken.
  if (proverASendeEpost(ny)) return bekreftelseStarPa(ny);

  return pinFeil(ny);
}

// «Error sending confirmation email», «Error sending magic link email».
// Vi matcher pa formen framfor den ene setningen: tjenesten har flere av
// dem, og de betyr det samme her.
function proverASendeEpost(r) {
  return /sending\b.*\bemail|smtp/i.test(r.melding || "");
}

function bekreftelseStarPa(r) {
  return svar({
    feil: "Supabase prøvde å sende en e-post, og det gjør den bare hvis"
      + " e-postbekreftelse står på. Slå av «Confirm email» under"
      + " Authentication → Sign In / Providers → Email — husk Save —"
      + " og prøv igjen. Adressen vi lager av fornavnet er en nøkkel,"
      + " ikke en postkasse.",
    forsok: r.forsok,
  }, 503);
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

async function pinOkt(r, navn, erNy) {
  let okt;
  try {
    okt = tolkPinOkt(r.json, navn);
  } catch (err) {
    console.error("[konto] uventet svar fra innloggingen:", err);
    return svar({ feil: "Uventet svar fra innloggingen", forsok: r.forsok }, 502);
  }

  // En fersk konto fores opp i kontolista, sa neste som skriver det
  // navnet far vite at det er tatt — og sa den som skriver *sitt eget*
  // navn neste gang far «skriv PIN-en din» og ikke «lag en PIN».
  //
  // Raden skrives med leserens egen okt, ikke med en nokkel som kan
  // skrive hva som helst: reglene i databasen slipper bare gjennom en rad
  // der brukeren er deg. Feiler den, er du likevel logget inn — kontoen
  // finnes hos Supabase uansett hva denne lista sier — sa vi logger det
  // og gar videre framfor a rulle tilbake noe vi ikke kan rulle tilbake.
  if (erNy) {
    const fort = await iKontolista("POST", "", { slug: pinSlug(navn) }, okt.token);
    if (!fort.ok) console.error("[konto] fikk ikke fort opp navnet:", fort.status, fort.melding);
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

// Favorittlagene pa kontoen.
//
// Menyen har sagt «favorittlagene folger kontoen, ikke telefonen» siden
// innloggingen kom, og til 24. september 2026 var det ikke sant: lagene
// la i nettleseren, sammen med tema og skriftstorrelse, og ingenting sendte
// dem noe sted. Logget du inn pa en ny telefon, var stjernene borte.
//
// De ligger i `user_metadata.lag`, ikke i en egen tabell. Supabase lar
// brukeren skrive sine egne metadata med sin egen okt — ingen
// service_role, ingen RLS a holde i takt — og de forsvinner med kontoen
// uten at noe ma huske a slette dem. En tabell ville gitt en rad per
// konto og en regel til om hvem som kan lese den.
//
// Tjenesten fletter metadata pa toppnivaet: `navn` blir staende nar vi
// skriver `lag`. Svaret er brukeren slik den ligger ETTER skrivingen, og
// det er det appen far tilbake — ikke det den sendte. En skriving som
// svarer 200 er ikke bevis pa at raden ligger der.
async function lagreLag(inn) {
  const token = String(inn.token || "");
  if (!token) return svar({ feil: "Logg inn først" }, 401);
  const lag = rensLag(inn.lag);

  const r = await hosSupabase("/auth/v1/user", { data: { lag } }, { metode: "PUT", token });
  if (r.ok && r.json) {
    const meta = r.json.user_metadata || (r.json.user && r.json.user.user_metadata) || {};
    // Et svar uten lista er ikke «ingen lag». Sa vi det, ville appen tomt
    // stjernene pa telefonen for et svar vi ikke kjente igjen.
    if (!Array.isArray(meta.lag)) {
      return svar({ feil: "Uventet svar fra kontoen", forsok: r.forsok }, 502);
    }
    return svar({ lag: rensLag(meta.lag) }, 200);
  }
  if (r.status === 401 || r.status === 403) {
    return svar({ feil: "Økten gjelder ikke lenger. Logg inn på nytt.", forsok: r.forsok }, 401);
  }
  console.error("[konto] lagre-lag feilet:", r.status, r.melding);
  return svar({ feil: "Fikk ikke lagret favorittlagene på kontoen.", forsok: r.forsok },
    r.status === 429 ? 429 : 502);
}

// Bytt PIN.
//
// Den gamle PIN-en kreves, og den provest pa den eneste maten tjenesten
// kan prove den: en innlogging. Det gir oss en fersk okt, og det er den
// som bytter passordet. To grunner til ikke a bruke okta appen alt har:
//
//   1. Okta beviser at telefonen en gang var logget inn, ikke at den som
//      holder den na kan PIN-en. Det er hele jobben PIN-en har.
//   2. Supabase kan kreve at et passordbytte skjer kort tid etter en
//      innlogging («Secure password change»). En okt som ble fornyet i
//      tre uker er ikke det; en som ble til for et halvt sekund siden er.
//
// Etterpa logges ALLE ANDRE okter ut. Den vanlige grunnen til a bytte PIN
// er at noen andre kan den, og da er en telefon som fortsatt er inne det
// ene som ikke skal overleve byttet. Okta vi lagde over er ikke «en
// annen», sa den er den appen far tilbake — ogsa telefonen du sto pa ble
// logget ut, og dette er innloggingen den fortsetter med.
async function byttPin(inn) {
  const navn = normaliserPinNavn(inn.navn);
  if (!gyldigPinNavn(navn)) return svar({ feil: "Logg inn først" }, 401);
  const feil = sjekkPinBytte(inn.pin, inn.nyPin);
  if (feil) return svar({ feil }, 400);

  const pepper = process.env.PIN_PEPPER;
  const inne = await hosSupabase("/auth/v1/token?grant_type=password",
    { email: pinEpost(navn), password: pinPassord(inn.pin, pepper) });
  if (!(inne.ok && inne.json && inne.json.access_token)) {
    if (inne.status === 429 || inne.status >= 500 || inne.status === 0) return pinFeil(inne);
    return svar({ feil: "PIN-en du har nå stemmer ikke.", forsok: inne.forsok }, 401);
  }
  const token = inne.json.access_token;

  const byttet = await hosSupabase("/auth/v1/user",
    { password: pinPassord(inn.nyPin, pepper) }, { metode: "PUT", token });
  let forsok = inne.forsok.concat(byttet.forsok);
  if (!byttet.ok) {
    console.error("[konto] bytt-pin feilet:", byttet.status, byttet.melding);
    return svar({ feil: "Fikk ikke byttet PIN-en. Den gamle gjelder fortsatt.", forsok },
      byttet.status === 429 ? 429 : 502);
  }

  // PIN-en ER byttet her, uansett hva som skjer videre. Gar utloggingen
  // av de andre galt, er det det svaret skal si — ikke at byttet feilet,
  // og ikke ingenting.
  const ut = await hosSupabase("/auth/v1/logout?scope=others", {}, { token });
  forsok = forsok.concat(ut.forsok);
  if (!ut.ok) console.error("[konto] fikk ikke logget ut andre okter:", ut.status, ut.melding);

  let okt;
  try {
    okt = tolkPinOkt(inne.json, navn);
  } catch (err) {
    return svar({ feil: "Uventet svar fra innloggingen", forsok }, 502);
  }
  okt.andreUt = ut.ok;
  if (!ut.ok) okt.forsok = forsok;
  return svar(okt, 200);
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
    const melding = tjenestensOrd(json, tekst);
    if (melding) forsok.melding = melding;
    // Kroppen blir med for diagnose selv naar den ikke er ord: en
    // 522-konvolutt sier HVOR det stoppet. Den staar i `kropp`, ikke i
    // `melding`, sa `tjenestenSa()` i appen ikke limer den inn i det
    // leseren ser — det var nettopp det som skjedde 22. september 2026.
    else forsok.kropp = diagnosekropp(tekst);

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
//
// Med `token` gar kallet som den innloggede brukeren — det er slik en
// bruker endrer sitt eget passord og sine egne metadata uten at vi har en
// nokkel som kan endre hvem som helst sine.
async function hosSupabase(sti, kropp, valg = {}) {
  const forsok = { kilde: "Supabase Auth", sti };
  const headere = {
    "apikey": process.env.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (valg.token) headere.Authorization = "Bearer " + valg.token;
  try {
    const respons = await fetch(base() + sti, {
      method: valg.metode || "POST",
      headers: headere,
      body: JSON.stringify(kropp),
    });
    forsok.status = respons.status;

    // Leses som TEKST og parses her, som `iKontolista`. Den sto med
    // `respons.json()` til 22. september 2026, og da fantes ingen kropp aa
    // legge i `forsok` naar svaret ikke var ord — de to veiene inn til
    // Supabase gjorde ulike ting med det samme problemet.
    const tekst = await respons.text().catch(() => "");
    let json = null;
    try { json = tekst ? JSON.parse(tekst) : null; } catch (err) { json = null; }
    const melding = tjenestensOrd(json, tekst);
    if (melding) forsok.melding = melding;
    else forsok.kropp = diagnosekropp(tekst);
    return { ok: respons.ok, status: respons.status, json, melding, forsok: [forsok] };
  } catch (err) {
    forsok.utfall = String((err && err.message) || err).slice(0, 80);
    return { ok: false, status: 0, json: null, melding: forsok.utfall, forsok: [forsok] };
  }
}

// Kontolista ligger i PostgREST, ikke i Auth, sa den har sin egen vei inn.
// Lesing gar uten okt — hvem som helst skal kunne fa vite at et navn er
// tatt — og skriving med leserens egen, som i svar.mjs.
async function iKontolista(metode, hale, kropp, token) {
  const forsok = { kilde: "Supabase", tabell: KONTOLISTE };
  const headere = {
    "apikey": process.env.SUPABASE_ANON_KEY,
    "Accept": "application/json",
  };
  if (token) headere.Authorization = "Bearer " + token;
  if (kropp) headere["Content-Type"] = "application/json";

  try {
    const respons = await fetch(base() + "/rest/v1/" + KONTOLISTE + hale, {
      method: metode,
      headers: headere,
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
    forsok.status = respons.status;

    const tekst = await respons.text().catch(() => "");
    let json = null;
    try { json = tekst ? JSON.parse(tekst) : null; } catch (err) { json = null; }
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

// PostgREST sier «relation … does not exist» med kode 42P01 nar tabellen
// ikke er laget enda. Det er ikke noe leseren kan gjore med, men det er
// nyaktig det den som setter opp prosjektet trenger a hore — samme grep
// som i svar.mjs.
function listeFeil(r) {
  const kode = (r.json && r.json.code) || "";
  if (kode === "42P01" || /does not exist/i.test(r.melding || "")) {
    return svar({
      feil: "Tabellen «" + KONTOLISTE + "» finnes ikke i Supabase ennå."
        + " SQL-en står i docs/nokler-og-tokens.md.",
      forsok: r.forsok,
    }, 503);
  }
  console.error("[konto] kontolista svarte " + r.status + ": " + (r.melding || ""));
  return svar({ feil: "Innloggingen svarte ikke. Prøv igjen om litt.", forsok: r.forsok }, 502);
}

// Supabase legger feilen i ulike felt etter hvilket endepunkt det er.

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
