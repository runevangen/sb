// Rene funksjoner for pubene rundt kampen. Ingen DOM, ingen nettverk.
//
// Kilden er OpenStreetMap via Overpass. Lisensen (ODbL) krever synlig
// kreditering: «© OpenStreetMap-bidragsytere» star der pubene vises.

// Samme normalisering som lagnavn: sma bokstaver, norske tegn foldet,
// tegnsetting fjernet. Da er «O'Reilly's» og «OReillys» samme sted.
import { normaliserLagnavn } from "./fotball-data.js";

// Overpass-tjenerne vi prover, i rekkefolge. Hovedtjeneren er raskest og
// naermest kilden, men avviser mye; speilene er mildere. Alle tre snakker
// samme sprak, sa et svar fra et speil er like godt.
// Tjenerne sporres samtidig, ikke etter tur: den forste som svarer
// vinner, og resten avbrytes. Etter tur ble summen av tre trege tjenere
// storre enn fristen, og da kom ingenting. Kappløp koster noen ekstra
// kall, men svaret caches et dogn per arena, sa det blir noen hundre
// kall i dognet totalt — godt innenfor det Overpass ber om.
export const OVERPASS_SPEIL = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

// Hovedtjeneren svarer 406 «Not Acceptable» nar den ikke liker headerne:
// den vil ha et Accept som sier hva vi tar imot, og en User-Agent som
// sier hvem vi er. Nettleseren forbyr oss a sette User-Agent, sa den
// settes bare serverside.
//
// Accept-Encoding settes ikke: setter vi den selv, slutter Node a pakke
// ut svaret for oss, og da feiler json(). Bade Node og nettleseren
// setter en fornuftig verdi uten var hjelp.
export function overpassHeadere(serverside) {
  const h = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };
  if (serverside) h["User-Agent"] = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";
  return h;
}

// Netlify gir en funksjon ti sekunder. Tre tjenere etter hverandre uten
// frist sprenger det, og da far leseren Netlifys egen feilside i stedet
// for vart svar — uten et ord om hvem som sviktet. Hver tjener far
// derfor sin egen frist, under en samlet frist for hele kallet.
export function restTid(frist, naa, tak) {
  return Math.max(0, Math.min(tak, frist - naa));
}

// Overpass-sporring: puber og barer innen radius meter fra et punkt.
// «out center» gir tagger og koordinater, og ett punkt ogsa for bygninger
// tegnet som flater. «out center tags» — som sto her forst — avviser
// Overpass med 406, og «tags» ville uansett droppet koordinatene.
export function overpassSporring(lat, lon, radius) {
  return '[out:json][timeout:12];nwr["amenity"~"^(pub|bar)$"](around:' +
    Math.round(radius) + "," + Number(lat).toFixed(3) + "," + Number(lon).toFixed(3) +
    ");out center;";
}

// Tre desimaler er rundt 100 meter. Nok til a finne en pub, og ikke nok
// til a si hvor noen bor.
export function rundPosisjon(lat, lon) {
  return { lat: Number(Number(lat).toFixed(3)), lon: Number(Number(lon).toFixed(3)) };
}

// Haversine, i meter. Bra nok pa avstander en gar.
export function avstandM(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function avstandtekst(m) {
  if (!Number.isFinite(m)) return "";
  if (m < 1000) return Math.round(m / 10) * 10 + " m";
  return (m / 1000).toFixed(1).replace(".", ",") + " km";
}

// Pubene ut av Overpass-svaret, med avstand fra senter, naermest forst.
// Uten navn er en pub ingenting a skrive i en chat; de faller bort. Samme
// navn to ganger (bygning og inngang) blir en.
export function tolkPuber(json, senter) {
  if (!json || !Array.isArray(json.elements)) throw new Error("Uventet svar fra Overpass");
  const sett = new Set();
  const puber = [];
  for (const e of json.elements) {
    const tags = (e && e.tags) || {};
    const navn = String(tags.name || "").trim().slice(0, 60);
    if (!navn) continue;
    const lat = e.lat !== undefined ? e.lat : e.center && e.center.lat;
    const lon = e.lon !== undefined ? e.lon : e.center && e.center.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const nokkel = navn.toLowerCase();
    if (sett.has(nokkel)) continue;
    sett.add(nokkel);
    puber.push({
      navn, lat, lon,
      avstand: senter ? avstandM(senter, { lat, lon }) : null,
      tider: tags.opening_hours ? String(tags.opening_hours).slice(0, 80) : "",
    });
  }
  return puber.sort((a, b) => (a.avstand || 0) - (b.avstand || 0));
}

// Entur JourneyPlanner: holdeplassene naermest et punkt. Bare stopPlace,
// ikke enkeltstolper, sa «Lerkendal» kommer en gang.
export function enturNaermest(lat, lon, radius) {
  return "{ nearest(latitude: " + Number(lat).toFixed(4) + ", longitude: " + Number(lon).toFixed(4) +
    ", maximumDistance: " + Math.round(radius) + ", maximumResults: 4, filterByPlaceTypes: [stopPlace])" +
    " { edges { node { distance place { ... on StopPlace { id name latitude longitude } } } } } }";
}

export function tolkHoldeplasser(json) {
  const kanter = json && json.data && json.data.nearest && json.data.nearest.edges;
  if (!Array.isArray(kanter)) return [];
  const sett = new Set();
  const ut = [];
  for (const k of kanter) {
    const p = k && k.node && k.node.place;
    if (!p || !p.name || !Number.isFinite(p.latitude)) continue;
    const navn = String(p.name).slice(0, 60);
    if (sett.has(navn)) continue;
    sett.add(navn);
    ut.push({ navn, lat: p.latitude, lon: p.longitude, avstand: Math.round(k.node.distance || 0) });
  }
  return ut;
}

// Grupperer pubene: ved stadion (innen 800 m) og ved hver holdeplass
// (innen 300 m). En pub kan sta i begge; det er to svar pa to sporsmal.
export function grupperPuber(puber, arena, holdeplasser) {
  const grupper = [];
  const vedStadion = puber.filter((p) => avstandM(arena, p) <= 800)
    .map((p) => Object.assign({}, p, { avstand: avstandM(arena, p) }))
    .sort((a, b) => a.avstand - b.avstand);
  if (vedStadion.length) grupper.push({ tittel: "Ved " + arena.navn, puber: vedStadion.slice(0, 6) });
  for (const h of holdeplasser || []) {
    const ved = puber.filter((p) => avstandM(h, p) <= 300)
      .map((p) => Object.assign({}, p, { avstand: avstandM(h, p) }))
      .sort((a, b) => a.avstand - b.avstand);
    if (ved.length) grupper.push({ tittel: "Ved " + h.navn, puber: ved.slice(0, 4) });
  }
  return grupper;
}

/* ---------- kuraterte puber ---------- */

// OpenStreetMap vet at et sted er en pub, men ikke om de viser fotball.
// Den kuraterte lista i puber-oslo.js er nettopp det OSM ikke kan si.
// Den ligger i koden, sa den virker uten nettverk — og det er verdt mye
// her, der Overpass har vist seg a vaere det skjoreste leddet.
//
// sjekket-datoen er det viktigste feltet: en liste uten dato ratner uten
// at noen merker det.
export const PUBLISTE_FELT = ["navn", "bydel", "lat", "lon", "type", "kilde", "sikkerhet", "sjekket"];
export const PUBTYPER = ["sportsbar", "supporterpub", "pub"];
export const PUBSIKKERHET = ["bekreftet", "sannsynlig", "usikker"];

// Vokter formen sa hvem som helst kan redigere lista uten a odelegge
// appen. Gir en liste med det som er galt; tom liste betyr at alt er bra.
export function sjekkPubliste(liste, ramme) {
  const r = ramme || { lat: [59.80, 60.05], lon: [10.45, 10.95] };
  const feil = [];
  if (!Array.isArray(liste)) return ["Lista er ikke en liste"];
  const sett = new Set();
  liste.forEach((p, i) => {
    const hvor = "rad " + (i + 1) + " (" + ((p && p.navn) || "uten navn") + ")";
    if (!p || typeof p !== "object") { feil.push(hvor + ": ikke et objekt"); return; }
    PUBLISTE_FELT.forEach((felt) => {
      if (p[felt] === undefined || p[felt] === "") feil.push(hvor + ": mangler " + felt);
    });
    const nokkel = normaliserLagnavn(p.navn);
    if (nokkel && sett.has(nokkel)) feil.push(hvor + ": samme navn to ganger");
    sett.add(nokkel);
    if (!(p.lat >= r.lat[0] && p.lat <= r.lat[1]) || !(p.lon >= r.lon[0] && p.lon <= r.lon[1])) {
      feil.push(hvor + ": koordinatene ligger utenfor omradet");
    }
    if (PUBTYPER.indexOf(p.type) === -1) feil.push(hvor + ": ukjent type " + p.type);
    if (PUBSIKKERHET.indexOf(p.sikkerhet) === -1) feil.push(hvor + ": ukjent sikkerhet " + p.sikkerhet);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.sjekket))) feil.push(hvor + ": sjekket er ikke en dato");
    if (String(p.kilde).indexOf("http") !== 0) feil.push(hvor + ": kilde er ikke en lenke");
  });
  return feil;
}

// De kuraterte stedene innen radius, naermest forst. Ingen nettverk.
export function kuraterteNaer(liste, senter, radius) {
  if (!Array.isArray(liste) || !senter) return [];
  return liste
    .map((p) => Object.assign({}, p, { avstand: avstandM(senter, p) }))
    .filter((p) => p.avstand <= radius)
    .sort((a, b) => a.avstand - b.avstand);
}

// Merker treff fra OpenStreetMap som vi vet viser fotball. Da star
// «viser fotball» pa de vi er sikre pa, uten a skjule resten.
export function merkKuraterte(puber, liste) {
  if (!Array.isArray(liste) || !liste.length) return puber;
  const kjent = new Map();
  liste.forEach((p) => kjent.set(normaliserLagnavn(p.navn), p));
  return puber.map((p) => {
    const traff = kjent.get(normaliserLagnavn(p.navn));
    return traff ? Object.assign({}, p, { viserFotball: true, lag: traff.lag || [] }) : p;
  });
}

/* ---------- dine puber ---------- */

// Lagres lokalt som [{ navn, antall }]. Den som er brukt oftest star
// forst; ved likt antall den sist brukte.
export function ofteBrukt(liste) {
  return (Array.isArray(liste) ? liste : [])
    .filter((p) => p && p.navn)
    .slice()
    .sort((a, b) => (b.antall || 0) - (a.antall || 0) || (b.sist || 0) - (a.sist || 0))
    .slice(0, 5);
}

export function noterPub(liste, navn, naa) {
  const n = String(navn || "").trim().slice(0, 60);
  if (!n) return Array.isArray(liste) ? liste : [];
  const ut = (Array.isArray(liste) ? liste : []).filter((p) => p && p.navn);
  const tid = naa || Date.now();
  const eks = ut.find((p) => p.navn.toLowerCase() === n.toLowerCase());
  if (eks) { eks.antall = (eks.antall || 0) + 1; eks.sist = tid; }
  else ut.push({ navn: n, antall: 1, sist: tid });
  return ut.slice(-20);
}
