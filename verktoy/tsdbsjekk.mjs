#!/usr/bin/env node
// Hva TheSportsDB faktisk gir oss — med DIN nøkkel, mot den ekte tjenesten.
//
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs
//   THESPORTSDB_KEY=… node verktoy/tsdbsjekk.mjs eliteserien premier
//   node verktoy/tsdbsjekk.mjs                    # testnøkkelen «3»
//
// Du trenger ingen id-er. Skriptet plukker dem ut av svarene sine egne:
// kampene bærer lag-id-en, spillerlista bærer spiller-id-en.
//
//   …  --lag=133604        overstyr: prøv dette laget
//   …  --spiller=34145937  overstyr: prøv denne spilleren
//
// Finner den ingen id — fordi et kall over sviktet — hoppes prøven over
// framfor å bli prøvd med et oppdiktet tall. «404 på id 0» ser ut som et
// nei til endepunktet, og det er en annen sak enn at vi ikke spurte.
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
const flagg = process.argv.slice(2).filter((a) => a.startsWith("--"));
const bedt = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// Lag- og spiller-id kjenner vi ikke fra fila: ingenting i repoet baerer
// dem. De maa komme fra deg, og uten dem hoppes de to siste provene over
// framfor aa bli provd med en oppdiktet id.
function flaggverdi(navn) {
  const t = flagg.find((f) => f.indexOf("--" + navn + "=") === 0);
  return t ? t.split("=").slice(1).join("=") : "";
}
// Id-ene PLUKKES ut av svarene underveis, ikke skrives inn for haand.
//
// Forste utgave krevde --lag= og --spiller=, og ba deg finne dem paa
// thesportsdb.com. Det er ikke en oppgave, det er en antydning: hvilket
// lag, hvor i sida staar id-en, og hvordan vet du at den er riktig?
//
// Kampene vi alt henter BAERER lag-id-en (`idHomeTeam`), og spillerlista
// for et lag baerer spiller-id-en. Kjeden er dermed gratis — ingen ekstra
// kall, og ingenting aa slaa opp. Flaggene staar igjen som overstyring
// for den som vil prove et bestemt lag.
let LAG_ID = flaggverdi("lag");
let SPILLER_ID = flaggverdi("spiller");
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
  // FORST, og det er ikke tilfeldig: dette er kallet vi vet virker i dag.
  // Svaret baerer lag-id-en resten av kjeden trenger, saa den staar
  // stodig selv om provene under svikter.
  { navn: "det vi bruker i dag (v1)", felt: "events",
    sti: (l) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/eventspastleague.php?id=" + l.tsdb,
    versjon: "v1" },
  { navn: "hele sesongen (v2)", felt: "schedule",
    sti: (l, s) => "/api/v2/json/schedule/league/" + l.tsdb + "/" + encodeURIComponent(s),
    versjon: "v2" },
  { navn: "hele sesongen (v1)", felt: "events",
    sti: (l, s) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/eventsseason.php?id=" + l.tsdb + "&s=" + encodeURIComponent(s),
    versjon: "v1" },
  // GJETNING. Navnet er ikke fra et svar vi har sett — det er formet som
  // de andre v2-oppslagene. Svarer den 404, er det ikke et nei til
  // toppscorere, bare et nei til dette navnet.
  { navn: "toppscorere, gjettet (v2)", felt: "*",
    sti: (l, s) => "/api/v2/json/lookup/league_topscorers/" + l.tsdb + "/" + encodeURIComponent(s),
    versjon: "v2" },
  // Spillerne i et lag. Dette er forutsetningen for at
  // `lookupplayerstats.php` kan brukes til noe som helst paa liganiva:
  // den er noklet paa idPlayer, saa noen maa si hvem spillerne ER.
  // Kjores bare med --lag=<idTeam>, for vi kjenner ingen lag-id fra fila.
  { navn: "spillerne i et lag (v1)", felt: "player", lagId: true,
    sti: (l, s, lag) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/lookup_all_players.php?id=" + enc(lag),
    versjon: "v1" },
  // Adressen du spurte om. Noklet paa idPlayer — den svarer paa «hvordan
  // har DENNE spilleren gjort det», ikke «hvem leder ligaen». Her maales
  // det som faktisk avgjor om den er til nytte: baerer svaret MAAL per
  // sesong, og staar sesongen paa raden?
  { navn: "én spillers statistikk (v1)", felt: "*", spillerId: true,
    sti: (l, s, lag, spiller) => "/api/v1/json/" + enc(NOKKEL || "3")
      + "/lookupplayerstats.php?id=" + enc(spiller),
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
  const url = ROT + p.sti(liga, sesong, LAG_ID, SPILLER_ID);
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
// Forste verdi i lista som baerer en av disse noklene. Vi leter paa flere
// navn med vilje: v1 og v2 heter ikke det samme, og en id vi ikke fant er
// en prove vi hopper over — ikke en prove vi gjor med et gjettet tall.
function plukkId(liste, nokler) {
  for (const rad of liste || []) {
    for (const n of nokler) {
      if (rad && rad[n] !== undefined && rad[n] !== null && String(rad[n]) !== "") {
        return String(rad[n]);
      }
    }
  }
  return "";
}

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
    // En prove som krever en id vi ikke har, hoppes over — ikke provd med
    // et oppdiktet tall. «404 paa id 0» ville sett ut som et nei til
    // endepunktet, og det er en annen sak enn at vi ikke spurte.
    if (p.lagId && !LAG_ID) {
      console.log("   " + p.navn.padEnd(30)
        + "hoppet over — fant ingen lag-id i kamplistene over");
      continue;
    }
    if (p.spillerId && !SPILLER_ID) {
      console.log("   " + p.navn.padEnd(30)
        + "hoppet over — fant ingen spiller-id i laglista over");
      continue;
    }
    const svar = await prov(p, liga, sesong);
    console.log("   " + p.navn.padEnd(30) + svar.linje);
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

      // Kjeden: en kampliste baerer et lag, en spillerliste baerer en
      // spiller. Plukkes bare naar du ikke har gitt en selv.
      if (!LAG_ID && (p.felt === "events" || p.felt === "schedule")) {
        LAG_ID = plukkId(svar.liste, ["idHomeTeam", "idTeam", "idAwayTeam"]);
        if (LAG_ID) console.log("      → lag-id plukket herfra: " + LAG_ID);
      }
      if (!SPILLER_ID && p.lagId) {
        SPILLER_ID = plukkId(svar.liste, ["idPlayer"]);
        if (SPILLER_ID) console.log("      → spiller-id plukket herfra: " + SPILLER_ID);
      }

      // For spillerstatistikk er det ÉN ting som avgjor om den er til
      // nytte: baerer raden maal, og staar sesongen paa den? Uten begge
      // kan den ikke bli en toppscorerliste uansett hvor mange kall vi
      // bruker. Vi leter paa innhold, ikke paa et feltnavn vi har gjettet.
      if (p.spillerId) {
        const felt = Object.keys(svar.liste[0]);
        const maal = felt.filter((k) => /goal/i.test(k));
        const sesongfelt = felt.filter((k) => /season/i.test(k));
        console.log("      mål-felt:    " + (maal.join(", ") || "INGEN"));
        console.log("      sesong-felt: " + (sesongfelt.join(", ") || "INGEN"));
        console.log("      første rad:  "
          + JSON.stringify(svar.liste[0]).slice(0, 220));
      }
    }
  }
  console.log("");
}
