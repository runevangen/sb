// Steder lesere sender inn: rene funksjoner. Ingen DOM, ingen nettverk,
// ingen lagring — delt mellom appen, Netlify-funksjonen og testene.
//
// Lista i puber.js er kode, og det er med vilje: den baerer en
// redaksjonell vurdering, og «Kjent for a vise fotball» star ogsa nar bade
// Overpass og var egen funksjon er nede. Et forslag herfra gar derfor i en
// ko, ikke i lista. Det er forst nar en person har sett pa raden at den
// far kilde og sjekket og blir en ekte rad (#80).

import { normaliserLagnavn } from "./fotball-data.js";

export const NAVN_MIN = 2;
export const NAVN_MAKS = 80;
export const ADRESSE_MIN = 2;
export const ADRESSE_MAKS = 120;
export const MERKNAD_MAKS = 300;

// Hvor mange forslag portalen henter om gangen. Koen er ikke ment a vokse
// seg lang — blir den det, er det et signal i seg selv.
export const FORSLAG_MAKS = 100;

export const STATUSER = ["ny", "lagt-inn", "avvist"];

// Hva som er galt med et forslag, som en liste. Tom liste betyr at alt er
// bra — samme form som sjekkPubliste og sjekkVisninger.
//
// Delt mellom appen og funksjonen med vilje: blir de to uenige om hva et
// gyldig navn er, far leseren «noe er galt» pa noe som stemmer. Det kostet
// en kveld sist, da appen kappet en attesifret engangskode til seks.
export function sjekkForslag(inn) {
  const feil = [];
  const navn = String((inn && inn.navn) || "").trim();
  const adresse = String((inn && inn.adresse) || "").trim();
  const merknad = String((inn && inn.merknad) || "").trim();

  if (navn.length < NAVN_MIN) feil.push("Skriv navnet på stedet.");
  else if (navn.length > NAVN_MAKS) feil.push("Navnet er for langt.");

  // Adressen er ikke pynt: koordinatene i lista er anslag fra
  // gateadressen, og uten den kan ikke raden sorteres etter avstand.
  if (adresse.length < ADRESSE_MIN) feil.push("Skriv gateadressen, så vi finner stedet.");
  else if (adresse.length > ADRESSE_MAKS) feil.push("Adressen er for lang.");

  if (merknad.length > MERKNAD_MAKS) feil.push("Merknaden er for lang.");

  return feil;
}

// Raden slik tjenesten sender den til basen. `foreslatt_av` og `status`
// star ikke her: databasen setter den forste fra okten og den andre fra
// sin egen default. Sender funksjonen dem selv, kan en feil her skrive i
// en annens navn — eller melde et forslag som ferdig behandlet.
export function forslagRad(inn) {
  return {
    navn: String(inn.navn).trim().slice(0, NAVN_MAKS),
    adresse: String(inn.adresse).trim().slice(0, ADRESSE_MAKS),
    viser_fotball: !!inn.viserFotball,
    merknad: String((inn && inn.merknad) || "").trim().slice(0, MERKNAD_MAKS) || null,
  };
}

// Radene fra PostgREST, formet som appen vil ha dem.
//
// **Ma tale a kjores to ganger.** Tjenesten tolker radene for den svarer,
// portalen tolker svaret en gang til — og andre gang finnes ikke
// `viser_fotball`, feltet heter `viserFotball`. Nettopp den feilen gjorde
// «blir med»-lista usynlig for alle i tre dager.
export function tolkForslag(rader) {
  return (Array.isArray(rader) ? rader : []).map((r) => ({
    id: String((r && r.id) || ""),
    navn: String((r && r.navn) || ""),
    adresse: String((r && r.adresse) || ""),
    viserFotball: !!(r && (r.viser_fotball !== undefined ? r.viser_fotball : r.viserFotball)),
    merknad: String((r && r.merknad) || ""),
    foreslatt: (r && r.foreslatt) || "",
    status: STATUSER.indexOf(String((r && r.status) || "")) > -1 ? String(r.status) : "ny",
  })).filter((f) => f.navn);
}

// Er stedet alt i lista? Sammenlikner med samme folding som lagnavnene, sa
// «Andys Pub» og «Andy's Pub» er det samme stedet. Et forslag pa noe som
// alt star der, er ikke feil — men koen skal si fra, sa den som behandler
// slipper a lete.
export function alleredeILista(navn, puber) {
  const leit = normaliserLagnavn(navn);
  if (!leit) return false;
  return (puber || []).some((p) => normaliserLagnavn(p.navn) === leit);
}

// Raden slik den skal se ut i puber.js, klar til a limes inn.
//
// Koen skriver **ikke** til fila. Det er hele poenget: det finnes ingen vei
// fra et skjema pa nettet og rett inn i det leseren ser, og det er den
// egenskapen ved lista som er verdt mest. Portalen gir teksten; et
// menneske limer den inn, fyller koordinatene og setter kilden.
//
// lat/lon og kilde star med vilje tomme: de ma slas opp, og en rad med
// oppdiktede tall ville vaert verre enn ingen rad.
export function publisteRad(forslag, naa) {
  const dato = new Date(naa || Date.now()).toISOString().slice(0, 10);
  const merknad = String((forslag && forslag.merknad) || "").trim();
  const linjer = [
    "{ navn: " + JSON.stringify(String(forslag.navn).trim()) + ", bydel: \"\", adresse: "
      + JSON.stringify(String(forslag.adresse).trim()) + ",",
    "  lat: 0, lon: 0, type: \"pub\", lag: [],",
    "  kilde: \"\", sikkerhet: \"bekreftet\", sjekket: " + JSON.stringify(dato),
  ];
  if (merknad) {
    linjer[linjer.length - 1] += ",";
    linjer.push("  merknad: " + JSON.stringify(merknad));
  }
  return linjer.join("\n") + " },";
}
