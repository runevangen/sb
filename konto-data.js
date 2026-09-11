// Innlogging: de rene funksjonene. Ingen DOM, ingen nettverk, ingen
// lagring — de deles av app.js og av netlify/functions/konto.mjs, sa
// begge sider er enige om hva en gyldig adresse, en gyldig kode og en
// utlopt okt er. Blir de uenige, far leseren «feil kode» pa en kode som
// stemmer.

export const KODE_SIFRE = 6;

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
  return String(verdi == null ? "" : verdi).replace(/\D+/g, "").slice(0, KODE_SIFRE);
}

export function gyldigKode(verdi) {
  return normaliserKode(verdi).length === KODE_SIFRE;
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
export function oktGyldig(okt, naa = Date.now()) {
  if (!okt || typeof okt !== "object") return false;
  if (!okt.token || !gyldigEpost(okt.epost)) return false;

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
