#!/usr/bin/env node
// Tester for Netlify-funksjonen, uten Netlify.
//
//   node test/funksjon.mjs
//
// Funksjonen er en vanlig ESM-modul som tar en Request og gir en Response,
// sa den kan kalles direkte her med et stubbet fetch. Da dekkes det som
// ikke er ren logikk — statuskoder, cache-headere og at nokkelen gar til
// API-et og ikke til leseren — uten a deploye noe.

import fotball from "../netlify/functions/fotball.mjs";

let feilet = 0;

function ok(navn, betingelse, detalj) {
  if (betingelse) {
    console.log("  ok   " + navn);
  } else {
    feilet++;
    console.log("  FEIL " + navn + (detalj !== undefined ? "  (fikk: " + detalj + ")" : ""));
  }
}

const NOKKEL = "hemmelig-testnokkel";

const SVAR = {
  errors: [],
  response: [{
    league: {
      id: 103, name: "Eliteserien", season: 2026,
      standings: [[
        { rank: 1, team: { name: "Bodo/Glimt" }, points: 68, goalsDiff: 41,
          all: { played: 30, win: 21, draw: 5, lose: 4, goals: { for: 74, against: 33 } } },
      ]],
    },
  }],
};

// Stubber globalt fetch og husker hva funksjonen kalte, slik at bade
// adressen og headeren kan kontrolleres.
function stub(svar, status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    return new Response(JSON.stringify(svar), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return kall;
}

function be(sti) {
  return new Request("https://mvp-sb.netlify.app" + sti);
}

/* ---------------- ukjent liga ---------------- */

process.env.FOOTBALL_API_KEY = NOKKEL;
let kall = stub(SVAR);

let r = await fotball(be("/api/fotball/tabell?liga=serie-a"));
ok("ukjent liga gir 400", r.status === 400, r.status);
ok("ukjent liga sporr ikke API-et", kall.length === 0, kall.length);
ok("feil caches ikke", r.headers.get("Cache-Control") === "no-store",
   r.headers.get("Cache-Control"));

r = await fotball(be("/api/fotball/tabell"));
ok("manglende liga gir 400", r.status === 400, r.status);

/* ---------------- manglende nokkel ---------------- */

delete process.env.FOOTBALL_API_KEY;
kall = stub(SVAR);
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
ok("uten nokkel svarer tjenesten 503", r.status === 503, r.status);
ok("uten nokkel sporres ikke API-et", kall.length === 0, kall.length);

/* ---------------- vanlig svar ---------------- */

process.env.FOOTBALL_API_KEY = NOKKEL;
kall = stub(SVAR);
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
const kropp = await r.json();

ok("tabellen svarer 200", r.status === 200, r.status);
ok("riktig liga og sesong hentes",
   kall[0].url.indexOf("league=103") > -1 && kall[0].url.indexOf("season=") > -1, kall[0].url);
ok("nokkelen sendes som header",
   kall[0].opsjoner.headers["x-apisports-key"] === NOKKEL);
// Det viktigste i hele funksjonen: nokkelen skal aldri ut til leseren.
ok("nokkelen lekker ikke ut i svaret",
   JSON.stringify(kropp).indexOf(NOKKEL) === -1);
ok("tabellen er med", Array.isArray(kropp.tabell) && kropp.tabell[0].lag === "Bodo/Glimt",
   JSON.stringify(kropp.tabell));
ok("sist oppdatert folger med", typeof kropp.oppdatert === "string" &&
   !Number.isNaN(Date.parse(kropp.oppdatert)), kropp.oppdatert);

const kant = r.headers.get("Netlify-CDN-Cache-Control") || "";
ok("svaret caches pa kanten i tre timer", kant.indexOf("s-maxage=10800") > -1, kant);
// Uten durable ville hver Netlify-region hentet sitt eget eksemplar, og
// dognkvoten ganget seg opp med antall regioner leserne kommer fra.
ok("cachen er delt for hele kanten", kant.indexOf("durable") > -1, kant);
ok("nettleseren cacher ikke selv",
   (r.headers.get("Cache-Control") || "").indexOf("max-age=0") > -1,
   r.headers.get("Cache-Control"));

/* ---------------- API-et feiler ---------------- */

kall = stub({ message: "rate limit" }, 429);
r = await fotball(be("/api/fotball/tabell?liga=premier"));
ok("feil hos API-et gir 502", r.status === 502, r.status);
ok("feilsvar caches ikke", r.headers.get("Cache-Control") === "no-store",
   r.headers.get("Cache-Control"));

// 200 med feil i kroppen er slik API-Football melder fra om manglende
// nokkel. Da skal det ikke bli en tom tabell som ser riktig ut.
kall = stub({ errors: { token: "Missing application key." } });
r = await fotball(be("/api/fotball/tabell?liga=premier"));
ok("feil i kroppen blir en feil, ikke en tom tabell", r.status === 502, r.status);

/* ---------------- rapport ---------------- */

const antall = 18;
console.log("\n" + (antall - feilet) + " av " + antall + " funksjonstester passerte");
process.exit(feilet ? 1 : 0);
