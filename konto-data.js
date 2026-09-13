// Innlogging: de rene funksjonene. Ingen DOM, ingen nettverk, ingen
// lagring — de deles av app.js og av netlify/functions/konto.mjs, sa
// begge sider er enige om hva en gyldig adresse, en gyldig kode og en
// utlopt okt er. Blir de uenige, far leseren «feil kode» pa en kode som
// stemmer.
//
// Appen logger na inn med fornavn og PIN (pin-data.js). Adressen og
// engangskoden star igjen her med vilje: e-postinnloggingen er parkert
// pa grenen `epost-innlogging`, ikke kastet, og skal hentes fram nar
// avsenderdomenet er kjopt. Enhetstestene dekker begge halvdeler, sa det
// som star her er fortsatt holdt i orden. `oktGyldig` og `oktUtloper`
// brukes av begge veier.

// Supabase lar deg stille lengden pa engangskoden (Authentication →
// Rate Limits → «Email OTP Length»), og standarden er ikke den samme i
// alle prosjekter. Hardkodet til seks kappet vi en kode pa atte til
// «637381», sendte den, og fikk 403 — som ser nyaktig ut som en feil
// kode. Derfor et spenn, ikke et tall: vi teller ikke sifre for leseren,
// vi tar imot dem.
export const KODE_MIN = 6;
export const KODE_MAKS = 10;

// Adressen skrives av et menneske pa en telefon. Store bokstaver og et
// mellomrom pa slutten skal ikke gi en ny konto.
export function normaliserEpost(verdi) {
  return String(verdi == null ? "" : verdi).trim().toLowerCase();
}

// Bevisst romslig. E-postvalidering som prover a vaere presis avviser
// ekte adresser — det er koden i innboksen som avgjor om adressen
// finnes. Her stopper vi bare det som apenbart ikke er en adresse, sa
// leseren far vite det for hen venter pa en e-post som aldri kommer.
export function gyldigEpost(verdi) {
  const e = normaliserEpost(verdi);
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(e);
}

// Koden limes inn fra en e-post: mellomrom, bindestreker og et
// usynlig linjeskift skal ikke stoppe en innlogging.
export function normaliserKode(verdi) {
  return String(verdi == null ? "" : verdi).replace(/\D+/g, "").slice(0, KODE_MAKS);
}

export function gyldigKode(verdi) {
  const n = normaliserKode(verdi).length;
  return n >= KODE_MIN && n <= KODE_MAKS;
}

// «ru••••@gmail.com». Hele adressen i menyen er en lekkasje over
// skulderen — appen leses i en sofa med flere i.
export function maskerEpost(verdi) {
  const e = normaliserEpost(verdi);
  const krok = e.lastIndexOf("@");
  if (krok < 1) return e;

  const navn = e.slice(0, krok);
  const rest = e.slice(krok);
  if (navn.length <= 2) return navn.slice(0, 1) + "•" + rest;
  return navn.slice(0, 2) + "•".repeat(Math.min(navn.length - 2, 4)) + rest;
}

// Tjenesten svarer med hvor mange sekunder okta varer. Vi lagrer
// tidspunktet i stedet: et tall sekunder er ubrukelig etter en
// omstart av telefonen.
export function oktUtloper(sekunder, naa = Date.now()) {
  const s = Number(sekunder);
  if (!Number.isFinite(s) || s <= 0) return null;
  return new Date(naa + s * 1000).toISOString();
}

// Okta ligger i localStorage og kan vaere hva som helst: skrevet av en
// eldre utgave av appen, halvveis overskrevet, eller utlopt mens
// telefonen la i lomma. Uten et gyldig utlopstidspunkt regnes den som
// utlopt — en okt vi ikke vet levetiden pa, er ikke en okt vi skal
// stole pa.
//
// Okta ma ogsa si hvem du er, sa menyen kan vise det: et navn (PIN-
// innloggingen) eller en adresse (e-postinnloggingen, som ligger pa
// grenen `epost-innlogging`). En okt som bare er et token ser ut som
// innlogget uten a vaere noen, og da har menyen ingenting a skrive.
// Hvor lenge for utlopet okta fornyes. Fornyes den for den ryker, merker
// ingen at den var innom — og et kall som starter rett for utlopet rekker
// fram.
export const FORNY_MARGIN = 5 * 60 * 1000;

// En okt kan fornyes sa lenge den barer en fornyer. Da er du fortsatt
// logget inn pa denne telefonen: det er bare tilgangstokenet som er
// ferskvare, og det byttes uten at PIN-en tastes pa nytt.
//
// Dette er skillet mellom «utlogget» og «tokenet er gammelt», og for det
// fantes var de det samme — derfor ble man logget ut hver time.
export function kanFornyes(okt) {
  return !!(okt && typeof okt === "object" && okt.fornyer && okt.token);
}

// Pa tide a fornye: utlopt, eller sa nar at et kall som starter na kan
// rekke a ryke underveis.
export function maaFornyes(okt, naa = Date.now(), margin = FORNY_MARGIN) {
  if (!kanFornyes(okt)) return false;
  // En okt uten bruker-id er ogsa moden for fornying, uansett hvor fersk
  // den er: uten den vet ikke appen hvilken rad i «blir med»-lista som er
  // din. Stedet ditt star umerket, kortet sier ingenting om hvor du skal,
  // delingsteksten mister stedet, og et nytt trykk melder deg pa igjen
  // framfor a angre. Fornyingen er veien til a fa id-en tilbake.
  if (!okt.bruker) return true;
  const utloper = Date.parse(okt.utloper);
  if (Number.isNaN(utloper)) return true;
  return utloper - margin <= naa;
}

export function oktGyldig(okt, naa = Date.now()) {
  if (!okt || typeof okt !== "object") return false;
  if (!okt.token) return false;
  const navn = typeof okt.navn === "string" ? okt.navn.trim() : "";
  if (!navn && !gyldigEpost(okt.epost)) return false;

  const utloper = Date.parse(okt.utloper);
  return !Number.isNaN(utloper) && utloper > naa;
}

// Svaret fra Supabase, formet til det appen trenger og ikke mer.
// Kaster framfor a gi fra seg en halv okt: en okt uten token ville sett
// ut som innlogget helt til det forste kallet feilet.
export function tolkOkt(json, naa = Date.now()) {
  const token = json && json.access_token;
  const epost = normaliserEpost(json && json.user && json.user.email);
  if (!token || !gyldigEpost(epost)) throw new Error("Uventet svar fra innloggingen");

  // Uten expires_in: en time. Kort nok til at en okt vi ikke kjenner
  // levetiden pa ikke blir stande.
  return {
    token,
    epost,
    // Id-en, ikke adressen, er den du er: to kan hete det samme, og
    // adressen skal ikke ligge i en liste andre leser.
    bruker: String((json.user && json.user.id) || ""),
    utloper: oktUtloper(json.expires_in, naa) || oktUtloper(3600, naa),
  };
}
