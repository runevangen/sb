#!/usr/bin/env node
// Hva TheSportsDB faktisk gir oss — med DIN nøkkel, mot den ekte tjenesten.
//
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs eliteserien premier
//   node verktoy/tsdbsjekk.mjs                    # testnøkkelen «3»
//
// Hvorfor dette finnes.
//
// To spørsmål sto åpne 21. september 2026, og begge er spørsmål om DATA,
// ikke om kode:
//
//   1. Kan vi vise ALLE runder i Resultater for årets sesong?
//      `eventspastleague.php` gir bare det nyeste. Et sesongendepunkt
//      finnes i dokumentasjonen — men dokumentasjon er ikke et svar.
//   2. Har vi toppscorere?
//      API-Footballs gratisnivå dekker 2022–2024, så årets tall må
//      komme herfra om de skal komme.
//
// Det kan ingen test svare på. En stubb vet bare det vi alt trodde, og
// nettopp den fella står i docs/testing.md. Dette skriptet spør
// tjenesten og viser deg svaret — rått nok til at du ser hva som mangler.
//
// Kjøres for hånd, som resten av verktoy/. Det er fire kall per liga; en
// skraper i CI er en skraper noen kjører tusen ganger.

import { LIGAER, ligaFor, sesongFor, tsdbSesong, tsdbHeadere } from "../fotball-data.js";

const ROT = "https://www.thesportsdb.com";
const NOKKEL = process.env.THESPORTSDB_KEY || process.env.thesportsdb_key || "";
const bedt = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ligaer = (bedt.length ? bedt : Object.keys(LIGAER))
  .map((n) => [n, ligaFor(n)])
  .filter(([, l]) => l && l.tsdb);

// Adressene vi vil prøve. `sti` bygges per liga, for sesongen vi står i.
//
// v2 og v1 er to ulike utgaver, og Patreon-nøkler finnes i begge — derfor
// prøves begge, som funksjonen selv gjør. Uten nøkkel gir v1 testnøkkelen
// «3», som kapper svarene; da er et lite svar ikke et nei, bare et kappet
// ja. Det står i utskrifta, så ingen leser en kapping som en mangel.
const PROVER = [
  { navn: "hele sesongen (v2)", felt: "schedule",
    sti: (l, s) => "/api/v2/json/schedule/league/" + l.tsdb + "/" + encodeURIComponent(s),
    versjon: "v2" },
  { navn: "hele sesongen (v1)", felt: "events",
    sti: (l, s) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/eventsseason.php?id=" + l.tsdb + "&s=" + encodeURIComponent(s),
    versjon: "v1" },
  { navn: "toppscorere (v2)", felt: "*",
    sti: (l, s) => "/api/v2/json/lookup/league_topscorers/" + l.tsdb + "/" + encodeURIComponent(s),
    versjon: "v2" },
  { navn: "det vi bruker i dag (v1)", felt: "events",
    sti: (l) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/eventspastleague.php?id=" + l.tsdb,
    versjon: "v1" },
];

function enc(s) { return encodeURIComponent(s); }

// Adressen slik den kan vises. v1 legger noekkelen i STIEN, og en
// noekkel som havner i en terminal er en noekkel som havner i et
// skjermbilde — samme grunn som at funksjonen holder den ute av `forsok`.
function trygg(url) {
  if (!NOKKEL) return url;
  return url.split(enc(NOKKEL)).join("‹nøkkel›").split(NOKKEL).join("‹nøkkel›");
}

// Hva svaret faktisk BAR, ikke hva det het. En tom liste og en 404 er to
// ulike ting, og en nøkkel som ikke rekker til er en tredje — de krever
// hver sin handling, så de skal ikke se like ut på skjermen.
async function prov(p, liga, sesong) {
  const url = ROT + p.sti(liga, sesong);
  try {
    const r = await fetch(url, { headers: tsdbHeadere(NOKKEL, p.versjon) });
    if (!r.ok) {
      return { linje: "HTTP " + r.status + " " + r.statusText, url: trygg(url) };
    }
    const tekst = await r.text();
    let json;
    try { json = JSON.parse(tekst); }
    catch (e) {
      return { linje: "svarte noe som ikke er JSON (" + tekst.slice(0, 60) + "…)",
               url: trygg(url) };
    }

    // Feltnavnet varierer mellom utgavene. «*» betyr: finn den første
    // nøkkelen som bærer en liste, og si hva den het — vi leter etter om
    // dataene FINNES, ikke etter et navn vi alt hadde gjettet.
    let felt = p.felt, liste = json && json[felt];
    if (felt === "*" || !Array.isArray(liste)) {
      felt = Object.keys(json || {}).find((k) => Array.isArray(json[k]));
      liste = felt ? json[felt] : null;
    }
    if (!Array.isArray(liste)) {
      return { linje: "ingen liste i svaret (nøkler: "
        + Object.keys(json || {}).join(", ") + ")", url: trygg(url) };
    }
    return { linje: liste.length + " rader i «" + felt + "»", liste, felt };
  } catch (err) {
    return { linje: "fikk ikke svar: " + err.message, url: trygg(url) };
  }
}

// Runder er hele poenget med spørsmål 1: en sesong uten rundetall kan
// ikke grupperes, og da er «alle runder» ikke mulig uansett hvor mange
// kamper som kommer.
function runder(liste) {
  const sett = new Set();
  (liste || []).forEach((r) => {
    const n = r && (r.intRound !== undefined ? r.intRound : r.strRound);
    if (n !== undefined && n !== null && String(n) !== "") sett.add(String(n));
  });
  return sett;
}

console.log(NOKKEL
  ? "Med THESPORTSDB_KEY satt.\n"
  : "UTEN nøkkel — testnøkkelen «3» kapper svarene. Et lite tall under er\n"
    + "en kapping, ikke en mangel. Sett THESPORTSDB_KEY for et ekte svar.\n");

for (const [navn, liga] of ligaer) {
  const sesong = tsdbSesong(liga);
  console.log("## " + liga.navn + "  (tsdb " + liga.tsdb + ", sesong " + sesong
    + ", vi står i " + sesongFor(liga) + ")");

  for (const p of PROVER) {
    const svar = await prov(p, liga, sesong);
    console.log("   " + p.navn.padEnd(26) + svar.linje);
    // Adressen ved feil, saa du kan lime den i en nettleser og se selv.
    // Ved suksess ville den bare vaert stoy.
    if (svar.url) console.log("      " + svar.url);

    if (svar.liste && svar.liste.length) {
      const r = runder(svar.liste);
      if (p.navn.indexOf("sesong") > -1 || p.navn.indexOf("i dag") > -1) {
        console.log("      runder: " + (r.size
          ? r.size + " ulike (" + Array.from(r).slice(0, 4).join(", ")
            + (r.size > 4 ? ", …" : "") + ")"
          : "INGEN rundetall — kan ikke grupperes"));
      }
      // Feltnavnene på første rad. Det er dem en parser må treffe, og de
      // er ikke til å gjette: v1 og v2 heter ikke det samme.
      console.log("      felt: " + Object.keys(svar.liste[0]).slice(0, 12).join(", "));
    }
  }
  console.log("");
}
