#!/usr/bin/env node
// Hva TheSportsDB faktisk gir oss — med DIN nøkkel, mot den ekte tjenesten.
//
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs eliteserien premier
//   node verktoy/tsdbsjekk.mjs                    # testnøkkelen «3»
//
// Du trenger ingen id-er. Kjeden plukker dem ut av svarene sine egne:
// kampene bærer `idHomeTeam`, spillerlista bærer `idPlayer`.
//
// **Stiene og målingen ligger i `fotball-data.js`, ikke her.**
// To ting spør: dette skriptet fra en maskin, og `/api/tsdb-sonde` fra
// portalen — for den som sitter med en telefon. Sto de hver for seg,
// ville de to svart ulikt på det samme spørsmålet, og da er sonden verre
// enn ingen sonde. Dette er et skall rundt de samme funksjonene.
//
// Hvorfor det ikke er en test: en stubb vet bare det vi alt trodde, og
// nettopp den fella står i docs/testing.md. Kjøres for hånd — det er seks
// kall per liga, og TheSportsDB ber om fair use.

import { LIGAER, ligaFor, sesongFor, tsdbSesong, tsdbHeadere,
         tsdbSondeStier, tsdbForsteListe, tsdbSondeFunn, tsdbPlukkId,
         tsdbSondeParset }
  from "../fotball-data.js";

const ROT = "https://www.thesportsdb.com";
const NOKKEL = process.env.THESPORTSDB_KEY || process.env.thesportsdb_key || "";
const bedt = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ligaer = (bedt.length ? bedt : Object.keys(LIGAER))
  .map((n) => ligaFor(n))
  .filter((l) => l && l.tsdb);

// Adressen slik den kan vises. v1 legger nøkkelen i STIEN, og en nøkkel
// som havner i en terminal er en nøkkel som havner i et skjermbilde —
// samme grunn som at `/api/tsdb-sonde` holder den ute av svaret sitt.
function trygg(sti) {
  if (!NOKKEL) return ROT + sti;
  return ROT + sti.split(encodeURIComponent(NOKKEL)).join("‹nøkkel›")
                  .split(NOKKEL).join("‹nøkkel›");
}

console.log(NOKKEL
  ? "Med THESPORTSDB_KEY satt.\n"
  : "UTEN nøkkel — testnøkkelen «3» kapper svarene. Et lite tall under er\n"
    + "en kapping, ikke en mangel. Sett THESPORTSDB_KEY for et ekte svar.\n");

for (const liga of ligaer) {
  const sesong = tsdbSesong(liga);
  console.log("## " + liga.navn + "  (tsdb " + liga.tsdb + ", sesong " + sesong
    + ", vi står i " + sesongFor(liga) + ")");

  // `ider` fylles underveis: stiene bygges på nytt for hver prøve, så en
  // prøve som krever en lag-id får den forrige fant.
  const ider = { lag: "", spiller: "" };
  const antall = tsdbSondeStier(liga, sesong, NOKKEL, ider).length;

  for (let i = 0; i < antall; i += 1) {
    const p = tsdbSondeStier(liga, sesong, NOKKEL, ider)[i];
    const merke = (p.gjetning ? "? " : "  ") + p.navn;

    // En prøve som krever en id vi ikke har, hoppes over — ikke prøvd med
    // et oppdiktet tall. «404 på id 0» ser ut som et nei til endepunktet,
    // og det er en annen sak enn at vi ikke spurte.
    if (p.krever && !ider[p.krever]) {
      console.log("   " + merke.padEnd(30)
        + "hoppet over — fant ingen " + p.krever + "-id i svarene over");
      continue;
    }

    let json = null, linje = "";
    try {
      const r = await fetch(ROT + p.sti, { headers: tsdbHeadere(NOKKEL, p.versjon) });
      if (!r.ok) {
        linje = "HTTP " + r.status + " " + (r.statusText || "");
      } else {
        const tekst = await r.text();
        try { json = JSON.parse(tekst); }
        catch (e) { linje = "svarte noe som ikke er JSON (" + tekst.slice(0, 60) + "…)"; }
      }
    } catch (err) {
      linje = "fikk ikke svar: " + err.message;
    }

    const treff = json ? tsdbForsteListe(json, p.felt) : null;
    if (!treff) {
      console.log("   " + merke.padEnd(30)
        + (linje || "ingen liste i svaret (nøkler: "
           + Object.keys(json || {}).join(", ") + ")"));
      console.log("      " + trygg(p.sti));
      if (p.gjetning) {
        console.log("      adressen er en gjetning — et nei til navnet, ikke til dataene");
      }
      continue;
    }

    const funn = tsdbSondeFunn(treff.liste);
    console.log("   " + merke.padEnd(30)
      + funn.rader + " rader i «" + treff.felt + "»");
    if (p.gir === "lag" || p.felt === "events") {
      console.log("      runder: " + (funn.runder
        ? funn.runder + " ulike"
        : "INGEN rundetall — kan ikke grupperes"));
    }
    console.log("      felt: " + funn.felt.slice(0, 12).join(", "));

    // VAAR EGEN parser, mot det ekte svaret. Feltnavnene alene svarer
    // ikke paa om fanen kan tegnes — det gjor dette.
    if (p.felt === "events" || p.felt === "schedule") {
      const q = tsdbSondeParset(json);
      console.log("      VÅR PARSER: " + (q.feil ? "kastet — " + q.feil
        : q.kamper + " kamper, " + q.spilt + " spilt, "
          + q.medResultat + " med resultat, " + q.medRunde + " med runde"));
      if (q.prove) console.log("      eksempel: " + q.prove);
    }

    // DET SOM AVGJØR for spillerstatistikken: bærer raden mål, og står
    // sesongen på den? Uten begge kan den ikke bli en toppscorerliste,
    // uansett hvor mange kall vi bruker.
    if (p.maaler === "mal") {
      console.log("      mål-felt:    " + (funn.maalfelt.join(", ") || "INGEN"));
      console.log("      sesong-felt: " + (funn.sesongfelt.join(", ") || "INGEN"));
      console.log("      DUGER: " + (funn.maalfelt.length && funn.sesongfelt.length
        ? "JA — raden bærer både mål og sesong"
        : "NEI — mangler " + (funn.maalfelt.length ? "sesong" : "mål") + " på raden"));
      console.log("      første rad:  " + JSON.stringify(treff.liste[0]).slice(0, 220));
    }

    // Kjeden: en kampliste bærer et lag, en spillerliste en spiller.
    if (p.gir && !ider[p.gir]) {
      ider[p.gir] = tsdbPlukkId(treff.liste, p.gir);
      if (ider[p.gir]) console.log("      → " + p.gir + "-id: " + ider[p.gir]);
    }
  }
  console.log("");
}
