#!/usr/bin/env node
// Hva OpenStreetMap faktisk har av puber i norske byer.
//
//   node verktoy/byersjekk.mjs                 # alle byene i BYER
//   node verktoy/byersjekk.mjs bodo trondheim  # bare noen
//   node verktoy/byersjekk.mjs 67.28,14.40     # et koordinat
//   node verktoy/byersjekk.mjs trondheim --rader   # utkast til puber.js
//
// Hvorfor dette finnes, og hvorfor det ikke er en test:
//
// Pubene «nær deg» kommer fra Overpass, og Overpass svarer på hvor du
// står. Appen er bygd og prøvd i Oslo. Om den er til nytte i Bodø er et
// spørsmål om DATA, ikke om kode: finnes det puber der, er de tagget som
// `amenity=pub|bar`, og er de tagget godt nok til at et navn i lista
// betyr noe?
//
// Det kan ingen test svare på. En test ville stubbet Overpass, og en
// stubb vet bare det vi alt trodde. Dette skriptet spør den ekte
// tjenesten og viser deg svaret.
//
// Nettleseren har `?posisjon=bodo`, som er den samme målingen gjort i den
// ekte appen med den ekte visningen. Dette er den raske veien: ingen
// telefon, ingen klikk, og alle byene i én kjøring.
//
// Kjøres for hånd. Overpass ber om fair use, og en skraper som går i CI er
// en skraper noen kjører tusen ganger.

import { BYER, falskPosisjon, overpassSporring, tolkPuber,
         OVERPASS_SPEIL, overpassHeadere, rundPosisjon } from "../pub-data.js";

const RADIUS = 1200;
const FRIST = 25000;

// Samme rekkefølge som appen bruker: første tjener som svarer vinner.
async function spor(p) {
  const kropp = "data=" + encodeURIComponent(
    overpassSporring(p.lat, p.lon, RADIUS, 20));
  const styring = new AbortController();
  const vakt = setTimeout(() => styring.abort(), FRIST);
  try {
    const alle = OVERPASS_SPEIL.map(async (adresse) => {
      const r = await fetch(adresse, {
        method: "POST", headers: overpassHeadere(true),
        body: kropp, signal: styring.signal,
      });
      if (!r.ok) throw new Error(new URL(adresse).host + " svarte " + r.status);
      return { vert: new URL(adresse).host, json: await r.json() };
    });
    return await Promise.any(alle);
  } finally {
    clearTimeout(vakt);
    styring.abort();
  }
}

// `--rader` skriver utkast til rader i `puber.js` framfor ei liste.
//
// Lista alene er en maaling: finnes det puber her i det hele tatt. Skal
// byen faktisk fylles, trengs koordinatet — og det sto ikke i utskrifta,
// saa hvert sted maatte slaas opp for haand etterpaa.
//
// Utkastet er IKKE en ferdig rad. `lag`, `kilde` og `sikkerhet` staar
// tomme med vilje: det er den redaksjonelle vurderingen, og den er hele
// grunnen til at `puber.js` er kode og ikke en tabell. Overpass vet at
// stedet er en pub. Den vet ikke om de viser fotball.
const flagg = process.argv.slice(2).filter((a) => a.startsWith("--"));
const somRader = flagg.indexOf("--rader") > -1;
const bedt = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const steder = bedt.length
  ? bedt.map((a) => falskPosisjon("?posisjon=" + encodeURIComponent(a))
      || { navn: a, lat: NaN, lon: NaN })
  : Object.values(BYER);

// Ett utkast til rad, i samme form som `puber.js`. Koordinatet kommer fra
// Overpass; resten er ditt.
//
// `sjekket` settes til i dag, for det er i dag du ser paa dette — og en
// dato er en paastand om NAAR noen saa etter, ikke pynt. Blir raden
// liggende til neste uke, skal datoen rettes, ikke staa.
function rad(pub) {
  const iDag = new Date().toISOString().slice(0, 10);
  return "{ navn: " + JSON.stringify(pub.navn) + ", bydel: \"\", adresse: \"\",\n" +
    "    lat: " + pub.lat.toFixed(4) + ", lon: " + pub.lon.toFixed(4) +
    ", type: \"pub\", lag: [],\n" +
    "    kilde: \"\", sikkerhet: \"sannsynlig\", sjekket: " + JSON.stringify(iDag) + " }," +
    (pub.tider ? "   // " + pub.tider : "");
}

console.log(somRader
  ? "Utkast til rader i puber.js. lag, kilde og sikkerhet er dine.\n"
  : "Puber innen " + RADIUS + " m, fra OpenStreetMap.\n");

for (const sted of steder) {
  if (!Number.isFinite(sted.lat)) {
    console.log("## " + sted.navn + "\n   kjenner ikke stedet. Bruk et navn fra"
      + " BYER, eller «59.91,10.75».\n");
    continue;
  }
  const p = rundPosisjon(sted.lat, sted.lon);
  let svar = null;
  try {
    svar = await spor(p);
  } catch (err) {
    const grunn = err && err.errors && err.errors[0];
    console.log("## " + sted.navn + "\n   fikk ikke svar: "
      + String((grunn && grunn.message) || (err && err.message) || err) + "\n");
    continue;
  }
  const liste = tolkPuber(svar.json, p);
  console.log("## " + sted.navn + "  (" + p.lat + ", " + p.lon + ")");
  console.log("   " + liste.length + " treff fra " + svar.vert);
  // Navn og avstand er det appen faktisk viser. Har stedet ingen av
  // delene, ville det stått som en tom knapp — og da er tallet over
  // misvisende.
  if (somRader) {
    // Alle treffene, ikke de tolv forste: her er det du som velger bort.
    liste.forEach((pub) => console.log("  " + rad(pub)));
  } else {
    liste.slice(0, 12).forEach((pub) => {
      console.log("   · " + pub.navn +
        (Number.isFinite(pub.avstand) ? "  " + Math.round(pub.avstand) + " m" : "  uten avstand") +
        "   " + pub.lat.toFixed(4) + ", " + pub.lon.toFixed(4) +
        (pub.tider ? "   " + pub.tider : ""));
    });
    if (liste.length > 12) console.log("   … og " + (liste.length - 12) + " til");
  }
  console.log("");
}
