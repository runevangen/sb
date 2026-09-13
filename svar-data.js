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
  // Stedet lagres for bade pub og stadion: lista nederst i kampkortet
  // grupperer vennene etter sted, og «på stadion» er ikke et sted a mote
  // noen — «på Lerkendal» er det.
  if (HVOR[hvor] && sted) rad.sted = String(sted).slice(0, 60);
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

// Kampene noen har sagt at de blir med pa, forst.
//
// En runde er en tidsrekke, og den skal den vaere — men star det folk pa
// to av ti kamper, er det de to man leter etter. De loftes, tidsrekka
// beholdes innenfor hver gruppe, og at rekkefolgen er endret sies med en
// linje over lista. Samme grep som favorittlagene i feeden: ingenting
// skjules, sa det trengs ingen vei ut — men leseren skal se hvorfor
// rekkefolgen ikke er den hen ventet.
export function loftMedSvar(kamper, kart) {
  const liste = Array.isArray(kamper) ? kamper : [];
  const med = [];
  const uten = [];
  liste.forEach((k) => {
    const svar = (kart && kart.get(String(k.id))) || [];
    (svar.length ? med : uten).push(k);
  });
  return { kamper: med.concat(uten), loftet: med.length };
}

// Bare kampene noen blir med pa, eldste forst. Grunnlaget for en egen
// visning: det er ei liste som er tom til noen svarer, og da er nettopp
// den lista hele poenget.
export function bareMedSvar(kamper, kart) {
  return (Array.isArray(kamper) ? kamper : [])
    .filter((k) => ((kart && kart.get(String(k.id))) || []).length > 0)
    .slice()
    .sort((a, b) => String(a.dato || "").localeCompare(String(b.dato || "")));
}

// Ditt eget svar, om du har gitt et. Brukeren er id-en fra okta — to
// personer kan hete det samme, og navnet er ikke identitet.
export function egetSvar(svar, bruker) {
  if (!bruker) return null;
  return (svar || []).find((s) => s.bruker && s.bruker === bruker) || null;
}

/* ---------- stedene i kampkortet ---------- */

// Stedene noen alt har sagt at de skal til.
//
// De horer med blant stedene du kan velge, og ikke bare som en linje
// nederst: er det en pub ingen har meldt inn og ingen kart kjenner, men
// to venner skal dit, er den det mest relevante stedet pa hele kortet.
// Nokkelen er stedet normalisert, sa «Lincoln pub» og «Lincoln Pub» er
// ett sted — ellers ville lista hatt to chips for samme pub.
export function stederFraSvar(svar) {
  const sett = new Map();
  (Array.isArray(svar) ? svar : []).forEach((s) => {
    if (!s || !HVOR[s.hvor] || !s.sted) return;
    const nokkel = stedNokkel(s.sted);
    if (!nokkel || sett.has(nokkel)) return;
    sett.set(nokkel, { hvor: s.hvor, navn: String(s.sted) });
  });
  return Array.from(sett.values());
}

// Vennene gruppert etter stedet de skal til: «Lincoln Pub — Ola og Kari».
//
// Et navn uten et sted sier ikke hvor man moter noen, og det var alt
// lista under kampen sa. Den som ikke har valgt et sted star sist, uten
// overskrift: hen blir med, men sa ikke hvor.
export function perSted(svar, kamp) {
  const grupper = new Map();
  const uten = [];
  (Array.isArray(svar) ? svar : []).forEach((s) => {
    if (!s || !gyldigNavn(s.navn)) return;
    const tekst = stedtekst(kamp, s.hvor, s.sted);
    if (!tekst) { uten.push(normaliserNavn(s.navn)); return; }
    // Nokkelen er teksten, ikke stedet: to som skrev «Lincoln Pub» og
    // «lincoln pub» skal sta i samme gruppe, og gruppa skal hete det den
    // forste skrev.
    const nokkel = stedNokkel(tekst);
    if (!grupper.has(nokkel)) grupper.set(nokkel, { sted: tekst, navn: [] });
    grupper.get(nokkel).navn.push(normaliserNavn(s.navn));
  });

  // Flest forst: stedet de fleste skal til er det man leter etter.
  const liste = Array.from(grupper.values())
    .sort((a, b) => b.navn.length - a.navn.length);
  if (uten.length) liste.push({ sted: "", navn: uten });
  return liste;
}

// Sma bokstaver, norske tegn foldet, alt annet enn bokstaver og tall
// vekk. Samme grep som lagnavnene: lista skal ikke fa to rader for det
// samme stedet fordi noen skrev en apostrof.
export function stedNokkel(verdi) {
  return String(verdi == null ? "" : verdi)
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
