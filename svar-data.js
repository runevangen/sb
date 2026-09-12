// «Jeg blir med»: de rene funksjonene. Ingen DOM, ingen nettverk, ingen
// lagring — delt mellom app.js, fotball.js og netlify/functions/svar.mjs,
// sa en rad ser lik ut uansett hvem som former den.
//
// Dette er svaret delingslenka ba om. Teksten som gikk ut i chatten
// spurte «Hvor ser du?», og til na hadde det sporsmalet ingen vei
// tilbake til appen. Na har det det, for den som er logget inn.

import { listeTekst } from "./lib.js";
import { HVOR, stedtekst } from "./fotball-data.js";

// Navnet vennene ser. Ikke e-postadressen: den er var, ikke deres.
export const NAVN_MAKS = 24;

// Flere enn dette i en gruppechat er ikke en gruppechat. Grensa finnes
// for at en kamp ikke skal kunne fylles opp av en robot.
export const SVAR_MAKS = 60;

export function normaliserNavn(verdi) {
  return String(verdi == null ? "" : verdi).replace(/\s+/g, " ").trim().slice(0, NAVN_MAKS);
}

// Et navn ma ha en bokstav eller et tall i seg. Ellers er «•••» et navn,
// og lista blir uleselig for alle andre.
export function gyldigNavn(verdi) {
  const n = normaliserNavn(verdi);
  return n.length > 0 && /[\p{L}\p{N}]/u.test(n);
}

// Raden vi skriver. Brukeren settes av databasen fra okta, ikke herfra:
// sender vi den selv, kan hvem som helst skrive i en annens navn.
export function svarRad(kampId, navn, hvor, sted) {
  const rad = { kamp_id: String(kampId), navn: normaliserNavn(navn) };
  if (HVOR[hvor]) rad.hvor = hvor;
  if (hvor === "pub" && sted) rad.sted = String(sted).slice(0, 60);
  return rad;
}

// Svarene fra databasen, formet til det visningen trenger. Ukjente rader
// og rader uten navn faller bort framfor a tegne et tomt navn i lista.
export function tolkSvar(rader) {
  if (!Array.isArray(rader)) return [];
  return rader
    .filter((r) => r && gyldigNavn(r.navn))
    .slice(0, SVAR_MAKS)
    .map((r) => ({
      kampId: String(r.kamp_id == null ? "" : r.kamp_id),
      navn: normaliserNavn(r.navn),
      hvor: HVOR[r.hvor] ? r.hvor : null,
      sted: r.sted ? String(r.sted).slice(0, 60) : "",
      bruker: r.bruker ? String(r.bruker) : "",
    }));
}

// Svarene gruppert per kamp, sa en runde hentes i ett kall og deles ut
// til radene etterpa.
export function perKamp(svar) {
  const kart = new Map();
  (svar || []).forEach((s) => {
    if (!kart.has(s.kampId)) kart.set(s.kampId, []);
    kart.get(s.kampId).push(s);
  });
  return kart;
}

// «Tre blir med: Ola, Kari og Per». Tallet forst, fordi det er det man
// leser nar man blar; navnene fordi det er dem man ser etter.
export function blirMedTekst(svar) {
  const liste = (svar || []).filter((s) => gyldigNavn(s.navn));
  if (!liste.length) return "";
  const navn = listeTekst(liste.map((s) => s.navn));
  return liste.length === 1
    ? navn + " blir med"
    : liste.length + " blir med: " + navn;
}

// Hva den ene sa, skrevet ut: «Ola ser den på Andy's Pub». Brukes i
// tittelen pa lista, sa et sted som er avtalt ikke bare star som et navn.
export function svartekst(svar, kamp) {
  if (!svar || !gyldigNavn(svar.navn)) return "";
  const hvor = stedtekst(kamp, svar.hvor, svar.sted);
  return hvor ? svar.navn + " ser den " + hvor : svar.navn + " blir med";
}

// Ditt eget svar, om du har gitt et. Brukeren er id-en fra okta — to
// personer kan hete det samme, og navnet er ikke identitet.
export function egetSvar(svar, bruker) {
  if (!bruker) return null;
  return (svar || []).find((s) => s.bruker && s.bruker === bruker) || null;
}
