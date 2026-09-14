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
import vaer from "../netlify/functions/vaer.mjs";
import puber from "../netlify/functions/puber.mjs";
import { OVERPASS_SPEIL } from "../pub-data.js";
import visninger from "../netlify/functions/visninger.mjs";
import konto from "../netlify/functions/konto.mjs";
import brukere from "../netlify/functions/brukere.mjs";
import svarfunksjon from "../netlify/functions/svar.mjs";
import { lesVisninger } from "../visning-data.js";

let feilet = 0;
let kjort = 0;

function ok(navn, betingelse, detalj) {
  kjort++;
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
// adressen og headeren kan kontrolleres. TheSportsDB far sitt eget svar:
// uten et oppgitt svarer den «ingen kamper», sa funksjonen gar videre til
// API-Football som for.
function stub(svar, status, tsdb) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    const erTsdb = String(url).indexOf("thesportsdb.com") > -1;
    const kropp = erTsdb ? (tsdb && tsdb.svar !== undefined ? tsdb.svar : { events: null }) : svar;
    const kode = erTsdb ? (tsdb && tsdb.status) || 200 : status || 200;
    return new Response(JSON.stringify(kropp), {
      status: kode,
      headers: { "Content-Type": "application/json" },
    });
  };
  return kall;
}

function apiKall(kall) {
  return kall.filter((k) => k.url.indexOf("api-sports.io") > -1);
}
function tsdbKall(kall) {
  return kall.filter((k) => k.url.indexOf("thesportsdb.com") > -1);
}

function be(sti) {
  return new Request("https://mvp-sb.netlify.app" + sti);
}

/* ---------------- ukjent liga ---------------- */

process.env.API_FOOTBALL_KEY = NOKKEL;
let kall = stub(SVAR);

let r = await fotball(be("/api/fotball/tabell?liga=serie-a"));
ok("ukjent liga gir 400", r.status === 400, r.status);
ok("ukjent liga sporr ikke API-et", kall.length === 0, kall.length);
ok("feil caches ikke", r.headers.get("Cache-Control") === "no-store",
   r.headers.get("Cache-Control"));

r = await fotball(be("/api/fotball/tabell"));
ok("manglende liga gir 400", r.status === 400, r.status);

/* ---------------- manglende nokkel ---------------- */

delete process.env.API_FOOTBALL_KEY;
delete process.env.api_football_key;
kall = stub(SVAR);
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
ok("uten nokkel svarer tjenesten 503", r.status === 503, r.status);
ok("uten nokkel sporres ikke API-et", kall.length === 0, kall.length);

// Navnet er satt med sma bokstaver i Netlify. Leses bare den store
// skrivematen, svarer tjenesten 503 selv om nokkelen star der.
kall = stub(SVAR);
process.env.api_football_key = NOKKEL;
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
ok("nokkel med sma bokstaver godtas ogsa", r.status === 200, r.status);
ok("den nokkelen brukes i kallet",
   apiKall(kall)[0].opsjoner.headers["x-apisports-key"] === NOKKEL);
delete process.env.api_football_key;

/* ---------------- vanlig svar ---------------- */

process.env.API_FOOTBALL_KEY = NOKKEL;
kall = stub(SVAR);
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
const kropp = await r.json();

ok("tabellen svarer 200", r.status === 200, r.status);
// TheSportsDB provdes forst (stubben svarer «ingen tabell»), sa selve
// API-Football-kallet er ikke det forste.
const api = apiKall(kall)[0];
ok("riktig liga og sesong hentes",
   api.url.indexOf("league=103") > -1 && api.url.indexOf("season=") > -1, api.url);
ok("nokkelen sendes som header",
   api.opsjoner.headers["x-apisports-key"] === NOKKEL);
// Det viktigste i hele funksjonen: nokkelen skal aldri ut til leseren.
ok("nokkelen lekker ikke ut i svaret",
   JSON.stringify(kropp).indexOf(NOKKEL) === -1);
// Svaret gar rett til soket i appen, sa navnet ma vaere redaksjonens.
ok("tabellen er med, med redaksjonens lagnavn",
   Array.isArray(kropp.tabell) && kropp.tabell[0].lag === "Bodø/Glimt",
   JSON.stringify(kropp.tabell));
ok("sist oppdatert folger med", typeof kropp.oppdatert === "string" &&
   !Number.isNaN(Date.parse(kropp.oppdatert)), kropp.oppdatert);

// Abonnementet dekker ikke inneværende sesong. Ber vi om den likevel,
// svarer API-et "season, try from 2022 to 2024" og leseren far ingenting.
const bedtOm = Number((api.url.match(/season=(\d+)/) || [])[1]);
ok("det sporres om en sesong abonnementet dekker",
   bedtOm >= 2022 && bedtOm <= 2024, bedtOm);
ok("sesongen star i svaret", kropp.sesong === bedtOm, kropp.sesong);
// Leseren skal fa vite at tabellen ikke er fra sesongen vi star i.
ok("svaret sier at sesongen ikke er inneværende",
   kropp.sisteSesong === false, String(kropp.sisteSesong));

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

/* ---------------- resultater og neste runde ---------------- */

function kamp(id, dato, runde, hjemme, borte, mh, mb, kode) {
  return {
    fixture: { id, date: dato, status: { short: kode || "NS" } },
    league: { round: runde },
    teams: { home: { name: hjemme }, away: { name: borte } },
    goals: { home: mh === undefined ? null : mh, away: mb === undefined ? null : mb },
  };
}

kall = stub({ errors: [], response: [
  kamp(1, "2026-09-06T15:00:00+00:00", "Runde 19", "Brann", "Viking", 1, 0, "FT"),
  kamp(2, "2026-09-08T17:00:00+00:00", "Runde 20", "Molde", "Rosenborg", 2, 2, "FT"),
] });
r = await fotball(be("/api/fotball/resultater?liga=eliteserien"));
const res = await r.json();
ok("resultater svarer 200", r.status === 200, r.status);
ok("resultater sporr om spilte kamper",
   apiKall(kall)[0].url.indexOf("status=FT") > -1, apiKall(kall)[0].url);
// Nyeste forst: API-et gir dem i stigende rekkefolge, og en resultatliste
// som begynner med den eldste kampen leses feil vei.
ok("nyeste resultat star forst", res.kamper[0].hjemme === "Molde", res.kamper[0].hjemme);
ok("resultater caches en time",
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("s-maxage=3600") > -1,
   r.headers.get("Netlify-CDN-Cache-Control"));

kall = stub({ errors: [], response: [
  kamp(3, "2026-09-20T17:00:00+00:00", "Runde 21", "Brann", "Bodo/Glimt"),
  kamp(4, "2026-09-21T17:00:00+00:00", "Runde 21", "Molde", "Rosenborg"),
  kamp(5, "2026-09-28T17:00:00+00:00", "Runde 22", "Viking", "Sarpsborg"),
] });
r = await fotball(be("/api/fotball/neste?liga=premier"));
const nes = await r.json();
ok("neste runde svarer 200", r.status === 200, r.status);
ok("neste runde sporr om kamper som ikke er spilt",
   apiKall(kall)[0].url.indexOf("status=NS") > -1, apiKall(kall)[0].url);
ok("TheSportsDB ble provd forst for en sesong utenfor vinduet",
   tsdbKall(kall).length === 1 && kall[0].url.indexOf("thesportsdb.com") > -1, kall[0].url);
ok("uten kamper fra TheSportsDB er kilden API-Football",
   nes.kilde === "API-Football" && nes.sisteSesong === false, nes.kilde);
ok("tilbakefallet forklarer forsoket",
   Array.isArray(nes.forsok) && nes.forsok.length === 1 && nes.forsok[0].utfall === "avkortet",
   JSON.stringify(nes.forsok));
// Hele vinduet folger med, ikke bare forste runde: adminportalen skal
// kunne fore inn en kamp som spilles om to uker. Leseren filtrerer til en
// runde i visningen.
ok("hele vinduet av kommende kamper er med", nes.kamper.length === 3, nes.kamper.length);
ok("lagnavn i kampene oversettes ogsa", nes.kamper[0].borte === "Bodø/Glimt", nes.kamper[0].borte);
ok("forste runde navngis som for", nes.runde === "Runde 21", nes.runde);
ok("og rundene star oppfort i rekkefolge",
   Array.isArray(nes.runder) && nes.runder[0] === "Runde 21" && nes.runder.length > 1,
   JSON.stringify(nes.runder));
ok("kampene kommer i tidsrekkefolge",
   nes.kamper.every((k, i) => i === 0 || nes.kamper[i - 1].dato <= k.dato),
   nes.kamper.map((k) => k.dato).join(" "));

/* ---------------- neste runde fra TheSportsDB ---------------- */

// Arets kamper, i formen TheSportsDB dokumenterer. strTimestamp er UTC
// uten sone.
function tsdbHendelse(id, ts, runde, hjemme, borte, arena) {
  return { idEvent: String(id), strTimestamp: ts, intRound: String(runde),
           strHomeTeam: hjemme, strAwayTeam: borte, strVenue: arena || "",
           strStatus: "Not Started", intHomeScore: null, intAwayScore: null };
}
const ARETS = { events: [
  tsdbHendelse(11, "2026-09-13T15:00:00", 21, "Brann", "Bodo/Glimt", "Brann Stadion"),
  tsdbHendelse(12, "2026-09-14T17:00:00", 21, "Molde", "Rosenborg", "Aker Stadion"),
  tsdbHendelse(13, "2026-09-20T15:00:00", 22, "Viking", "Sarpsborg 08", "SR-Bank Arena"),
] };
// Gratisnokkelen gir en kamp og fem tabellrader. Det skal ikke vises som
// arets: da star fem lag under «Sesong 2026».
const AVKORTET_NESTE = { events: [ARETS.events[0]] };
function tabellRader(n) {
  return { table: Array.from({ length: n }, (_, i) => ({
    intRank: String(i + 1), strTeam: "Lag " + (i + 1), intPlayed: "20", intWin: "10", intDraw: "5",
    intLoss: "5", intGoalsFor: "30", intGoalsAgainst: "20", intGoalDifference: "10", intPoints: "35" })) };
}

kall = stub(SVAR, 200, { svar: ARETS });
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
const arets = await r.json();
ok("arets neste runde svarer 200", r.status === 200, r.status);
ok("API-Football sporres ikke nar TheSportsDB har kamper",
   apiKall(kall).length === 0, apiKall(kall).length);
ok("testnokkelen 3 brukes uten egen nokkel",
   tsdbKall(kall)[0].url.indexOf("/json/3/eventsnextleague.php?id=4358") > -1, tsdbKall(kall)[0].url);
ok("svaret er merket med kilde og inneværende sesong",
   arets.kilde === "TheSportsDB" && arets.sisteSesong === true &&
   arets.sesong === new Date().getUTCFullYear(), JSON.stringify([arets.kilde, arets.sisteSesong, arets.sesong]));
ok("hele vinduet er med, med forste runde navngitt",
   arets.kamper.length === 3 && arets.runde === "Runde 21",
   arets.kamper.length + " " + arets.runde);
ok("tidspunktet er UTC med sone", arets.kamper[0].dato === "2026-09-13T15:00:00Z", arets.kamper[0].dato);
ok("lagnavn oversettes ogsa herfra", arets.kamper[0].borte === "Bodø/Glimt", arets.kamper[0].borte);
ok("arenaen folger med", arets.kamper[0].arena === "Brann Stadion", arets.kamper[0].arena);
ok("arets kamper caches som neste runde ellers",
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("s-maxage=21600") > -1,
   r.headers.get("Netlify-CDN-Cache-Control"));

// Egen nokkel i miljoet: v2 forst, med nokkelen i en header og aldri i
// adressen. Svaret fra v2 har lista under «schedule».
process.env.THESPORTSDB_KEY = "min-nokkel";
kall = stub(SVAR, 200, { svar: { schedule: ARETS.events } });
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
const v2 = await r.json();
ok("med nokkel proves v2 forst",
   tsdbKall(kall)[0].url.indexOf("/api/v2/json/schedule/next/league/4358") > -1, tsdbKall(kall)[0].url);
ok("nokkelen sendes som X-API-KEY",
   tsdbKall(kall)[0].opsjoner.headers["X-API-KEY"] === "min-nokkel");
ok("nokkelen star ikke i v2-adressen", tsdbKall(kall)[0].url.indexOf("min-nokkel") === -1);
ok("nokkelen lekker ikke ut til leseren", JSON.stringify(v2).indexOf("min-nokkel") === -1);
ok("v2-svaret leses", r.status === 200 && v2.kilde === "TheSportsDB" && v2.kamper.length === 3,
   JSON.stringify([r.status, v2.kilde, v2.kamper && v2.kamper.length]));
ok("forsokene star i svaret, uten adresser",
   Array.isArray(v2.forsok) && v2.forsok.length === 1 && v2.forsok[0].status === 200 &&
   JSON.stringify(v2.forsok).indexOf("http") === -1, JSON.stringify(v2.forsok));

// Nokkelen er en v1-nokkel: v2 avviser den. Da proves v1 med nokkelen i
// adressen, og svaret forteller begge forsokene.
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  const u = String(url);
  if (u.indexOf("/api/v2/") > -1) return new Response('{"error":"Invalid API key"}', { status: 401 });
  if (u.indexOf("/api/v1/json/min-nokkel/") > -1) return new Response(JSON.stringify(ARETS), { status: 200 });
  return new Response(JSON.stringify(SVAR), { status: 200 });
};
kall.length = 0;
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
const v1 = await r.json();
ok("avvist v2 gir v1 med nokkelen i adressen",
   tsdbKall(kall).length === 2 && tsdbKall(kall)[1].url.indexOf("/api/v1/json/min-nokkel/eventsnextleague.php") > -1,
   tsdbKall(kall).map((k) => k.url).join(" | "));
ok("v1-svaret brukes", v1.kilde === "TheSportsDB" && v1.sisteSesong === true, v1.kilde);
ok("begge forsok er forklart, og nokkelen star ikke der",
   v1.forsok.length === 2 && v1.forsok[0].status === 401 && v1.forsok[1].status === 200 &&
   JSON.stringify(v1.forsok).indexOf("min-nokkel") === -1, JSON.stringify(v1.forsok));
ok("tjenestens egen feilmelding folger med",
   v1.forsok[0].melding === '{"error":"Invalid API key"}', v1.forsok[0].melding);
delete process.env.THESPORTSDB_KEY;

// Svikter TheSportsDB — nettverk eller uventet form — far leseren det
// API-Football har, som for. Ingen feil ut.
kall = stub({ errors: [], response: [
  kamp(3, "2024-11-30T17:00:00+00:00", "Runde 30", "Brann", "Bodo/Glimt"),
] }, 200, { svar: { message: "nede" }, status: 500 });
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
const reserve = await r.json();
ok("feil hos TheSportsDB gir API-Footballs svar", r.status === 200 && reserve.kilde === "API-Football",
   r.status + " " + reserve.kilde);
ok("og sier at sesongen ikke er inneværende", reserve.sisteSesong === false);

kall = stub(SVAR, 200, { svar: { events: "rart" } });
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
ok("uventet form fra TheSportsDB gir ogsa API-Footballs svar",
   r.status === 200 && (await r.json()).kilde === "API-Football", r.status);

// Tabellen og resultatene har samme reserve.
const ARETS_TABELL = tabellRader(16);
ARETS_TABELL.table[0].strTeam = "Bodo/Glimt";
ARETS_TABELL.table[0].intPoints = "45";
kall = stub(SVAR, 200, { svar: ARETS_TABELL });
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
const aretsTabell = await r.json();
ok("arets tabell kommer fra TheSportsDB",
   r.status === 200 && aretsTabell.kilde === "TheSportsDB" && aretsTabell.sisteSesong === true,
   JSON.stringify([r.status, aretsTabell.kilde, aretsTabell.sisteSesong]));
ok("tabellen sporr om arets sesong hos TheSportsDB",
   tsdbKall(kall)[0].url.indexOf("lookuptable.php?l=4358&s=" + new Date().getUTCFullYear()) > -1,
   tsdbKall(kall)[0].url);
ok("tabellradene er oversatt og i samme form",
   aretsTabell.tabell.length === 16 && aretsTabell.tabell[0].lag === "Bodø/Glimt" &&
   aretsTabell.tabell[0].poeng === 45, JSON.stringify(aretsTabell.tabell[0]));
ok("API-Football sporres ikke nar tabellen finnes", apiKall(kall).length === 0);

// Gratisnokkelen: fem rader. Ikke arets tabell, men fjorarets hele.
kall = stub(SVAR, 200, { svar: tabellRader(5) });
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
const fem = await r.json();
ok("en avkortet tabell vises ikke som arets",
   r.status === 200 && fem.kilde === "API-Football" && fem.sisteSesong === false,
   JSON.stringify([fem.kilde, fem.sisteSesong]));
ok("API-Football ble spurt i stedet", apiKall(kall).length === 1);

kall = stub({ errors: [], response: [
  kamp(3, "2024-11-30T17:00:00+00:00", "Runde 30", "Brann", "Bodo/Glimt"),
] }, 200, { svar: AVKORTET_NESTE });
r = await fotball(be("/api/fotball/neste?liga=eliteserien"));
const enKamp = await r.json();
ok("en avkortet kampliste vises ikke som arets",
   enKamp.kilde === "API-Football" && enKamp.sisteSesong === false, JSON.stringify([enKamp.kilde, enKamp.sisteSesong]));

kall = stub(SVAR, 200, { svar: { table: null } });
r = await fotball(be("/api/fotball/tabell?liga=eliteserien"));
ok("uten tabell hos TheSportsDB kommer fjorarets fra API-Football",
   r.status === 200 && (await r.json()).kilde === "API-Football", r.status);

const ARETS_RESULTATER = { events: [
  Object.assign(tsdbHendelse(21, "2026-09-06T15:00:00", 19, "Brann", "Viking"),
    { strStatus: "Match Finished", intHomeScore: "1", intAwayScore: "0" }),
  Object.assign(tsdbHendelse(22, "2026-09-08T17:00:00", 20, "Molde", "Rosenborg"),
    { strStatus: "Match Finished", intHomeScore: "2", intAwayScore: "2" }),
  tsdbHendelse(23, "2026-09-13T15:00:00", 21, "Viking", "Molde"),   // ikke spilt
] };
kall = stub(SVAR, 200, { svar: ARETS_RESULTATER });
r = await fotball(be("/api/fotball/resultater?liga=eliteserien"));
const aretsRes = await r.json();
ok("arets resultater kommer fra TheSportsDB",
   r.status === 200 && aretsRes.kilde === "TheSportsDB", JSON.stringify([r.status, aretsRes.kilde]));
ok("resultater sporr eventspastleague",
   tsdbKall(kall)[0].url.indexOf("eventspastleague.php?id=4358") > -1, tsdbKall(kall)[0].url);
ok("bare spilte kamper, nyeste forst",
   aretsRes.kamper.length === 2 && aretsRes.kamper[0].hjemme === "Molde" &&
   aretsRes.kamper[0].malHjemme === 2 && aretsRes.kamper[0].spilt === true,
   JSON.stringify(aretsRes.kamper));

// Ett resultat er et avkortet svar, ikke arets resultater.
kall = stub({ errors: [], response: [
  kamp(1, "2024-11-30T17:00:00+00:00", "Runde 30", "Brann", "Viking", 1, 0, "FT"),
] }, 200, { svar: { events: [ARETS_RESULTATER.events[0]] } });
r = await fotball(be("/api/fotball/resultater?liga=eliteserien"));
ok("ett resultat fra TheSportsDB gir fjorarets fra API-Football",
   (await r.json()).kilde === "API-Football");

/* ---------------- ukjent datasett ---------------- */

kall = stub(SVAR);
r = await fotball(be("/api/fotball/toppscorere?liga=premier"));
ok("ukjent datasett gir 404", r.status === 404, r.status);
ok("ukjent datasett sporr ikke API-et", kall.length === 0, kall.length);

/* ---------------- vaer ---------------- */

function metSvar() {
  return { properties: { timeseries: [
    { time: "2026-09-13T15:00:00Z", data: { instant: { details: { air_temperature: 8.4, wind_speed: 9.1 } },
      next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.4 } } } },
  ] } };
}

kall = stub(metSvar());
r = await vaer(be("/api/vaer?arena=Ukjent%20Park&naar=2026-09-13T15:00:00Z"));
ok("ukjent arena gir 400", r.status === 400, r.status);
ok("ukjent arena sporr ikke MET", kall.length === 0, kall.length);
ok("feil caches ikke", r.headers.get("Cache-Control") === "no-store");
r = await vaer(be("/api/vaer?arena=Lerkendal&naar=snart"));
ok("ugyldig tidspunkt gir 400", r.status === 400, r.status);

kall = stub(metSvar());
r = await vaer(be("/api/vaer?arena=Lerkendal%20Stadion&naar=2026-09-13T15:00:00Z"));
const v = await r.json();
ok("vaeret svarer 200", r.status === 200, r.status);
// MET krever a vite hvem som sporr, og blokkerer uten.
ok("MET far en User-Agent som identifiserer appen",
   String(kall[0].opsjoner.headers["User-Agent"]).indexOf("sportsbibelen-app") === 0 &&
   String(kall[0].opsjoner.headers["User-Agent"]).indexOf("mvp-sb.netlify.app") > -1,
   kall[0].opsjoner.headers["User-Agent"]);
ok("koordinatene har tre desimaler",
   kall[0].url.indexOf("lat=63.413&lon=10.406") > -1, kall[0].url);
ok("svaret har tekst, rad og kilde",
   v.tekst.indexOf("8°, føles som 4°") === 0 && v.rad.indexOf("Ta regnjakke.") > -1 &&
   v.kilde === "MET Norway" && v.arena === "Lerkendal", JSON.stringify(v));
ok("vaeret caches en time pa kanten",
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("s-maxage=3600") > -1 &&
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("durable") > -1,
   r.headers.get("Netlify-CDN-Cache-Control"));

// Kampen er lenger fram enn varselet rekker: et gyldig, tomt svar.
kall = stub(metSvar());
r = await vaer(be("/api/vaer?arena=Lerkendal&naar=2026-09-25T15:00:00Z"));
const langt = await r.json();
ok("ingen varsel sa langt fram er 200 med tom tekst",
   r.status === 200 && langt.tekst === "" && typeof langt.grunn === "string", JSON.stringify(langt));

kall = stub({ message: "nede" }, 503);
r = await vaer(be("/api/vaer?arena=Lerkendal&naar=2026-09-13T15:00:00Z"));
ok("feil hos MET gir 502 uten cache",
   r.status === 502 && r.headers.get("Cache-Control") === "no-store", r.status);
const metFeil = await r.json();
ok("feilsvaret forklarer forsoket med status og METs melding",
   metFeil.forsok && metFeil.forsok.status === 503 && metFeil.forsok.melding === '{"message":"nede"}' &&
   metFeil.forsok.utfall === "HTTP 503", JSON.stringify(metFeil.forsok));

/* ---------------- puber ---------------- */

const OSM_SVAR = { elements: [
  { type: "node", id: 1, lat: 63.4140, lon: 10.4070, tags: { amenity: "pub", name: "Lerkendal Pub" } },
  { type: "node", id: 2, lat: 63.4112, lon: 10.4128, tags: { amenity: "bar", name: "Nardo Bar" } },
] };
const ENTUR_SVAR = { data: { nearest: { edges: [
  { node: { distance: 480, place: { id: "NSR:StopPlace:2", name: "Nardo", latitude: 63.4110, longitude: 10.4130 } } },
] } } };
function stubPuber(osm, osmStatus, entur, enturStatus) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    const u = String(url);
    if (u.indexOf("entur.io") > -1) return new Response(JSON.stringify(entur), { status: enturStatus || 200 });
    return new Response(typeof osm === "string" ? osm : JSON.stringify(osm), { status: osmStatus || 200 });
  };
  return kall;
}

function osmKall(kall) {
  return kall.filter((k) => k.url.indexOf("entur.io") === -1);
}

kall = stubPuber(OSM_SVAR, 200, ENTUR_SVAR, 200);
r = await puber(be("/api/puber?arena=Ukjent"));
ok("ukjent arena gir 400 uten kall", r.status === 400 && kall.length === 0, r.status + " " + kall.length);

kall = stubPuber(OSM_SVAR, 200, ENTUR_SVAR, 200);
r = await puber(be("/api/puber?arena=Lerkendal%20Stadion"));
const pub = await r.json();
ok("puber svarer 200", r.status === 200, r.status);
const entur = kall.find((k) => k.url.indexOf("entur.io") > -1);
const overpass = kall.find((k) => k.url.indexOf("overpass-api.de") > -1);
ok("Entur far ET-Client-Name", entur && entur.opsjoner.headers["ET-Client-Name"] === "sportsbibelen-app");
ok("Overpass sporres rundt arenaen med 1200 m",
   overpass && decodeURIComponent(overpass.opsjoner.body).indexOf("around:1200,63.413,10.406") > -1,
   overpass && decodeURIComponent(overpass.opsjoner.body));
// Uten Accept svarer hovedtjeneren 406 og vi far ingen puber.
ok("Overpass far Accept og identifiserer oss",
   overpass.opsjoner.headers["Accept"] === "application/json" &&
   String(overpass.opsjoner.headers["User-Agent"]).indexOf("sportsbibelen") === 0,
   JSON.stringify(overpass.opsjoner.headers));
// Alle sporres samtidig; den forste som svarer vinner.
ok("alle tjenerne sporres samtidig",
   osmKall(kall).length === OVERPASS_SPEIL.length, osmKall(kall).length);
ok("hver tjener star i forsok, i fast rekkefolge",
   pub.forsok.slice(1).map((f) => f.kilde).join(",") ===
   OVERPASS_SPEIL.map((u) => "Overpass " + new URL(u).host).join(","),
   JSON.stringify(pub.forsok.map((f) => f.kilde)));
ok("svaret er gruppert ved stadion og ved holdeplass",
   pub.grupper.length === 2 && pub.grupper[0].tittel === "Ved Lerkendal" && pub.grupper[1].tittel === "Ved Nardo" &&
   pub.grupper[1].puber[0].navn === "Nardo Bar", JSON.stringify(pub.grupper));
ok("kilden er OpenStreetMap og hvert forsok star der",
   pub.kilde === "OpenStreetMap" && pub.forsok.length === 1 + OVERPASS_SPEIL.length,
   JSON.stringify(pub.forsok));
ok("puber caches et dogn pa kanten",
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("s-maxage=86400") > -1 &&
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("durable") > -1);

// Entur nede: fortsatt puber ved stadion.
kall = stubPuber(OSM_SVAR, 200, { message: "nede" }, 503);
r = await puber(be("/api/puber?arena=Lerkendal"));
const utenEntur = await r.json();
ok("uten Entur er det fortsatt puber ved stadion",
   r.status === 200 && utenEntur.grupper.length === 1 && utenEntur.grupper[0].tittel === "Ved Lerkendal" &&
   utenEntur.forsok[0].status === 503, JSON.stringify(utenEntur.forsok));

// Alle tjenerne nede: feil uten cache, med forklaring per tjener.
kall = stubPuber("<html>Too busy</html>", 504, ENTUR_SVAR, 200);
r = await puber(be("/api/puber?arena=Lerkendal"));
const utenOsm = await r.json();
ok("feil hos alle tjenerne gir 502 uten cache og med melding",
   r.status === 502 && r.headers.get("Cache-Control") === "no-store" &&
   utenOsm.forsok.some((f) => f.kilde.indexOf("Overpass") === 0 && f.status === 504 && f.melding.indexOf("Too busy") > -1),
   JSON.stringify(utenOsm.forsok));
ok("alle tjenerne ble provd", osmKall(kall).length === OVERPASS_SPEIL.length, osmKall(kall).length);

// Hovedtjeneren svarer 406, speilet svarer. Det var dette som skjedde i prod.
kall = [];
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  const u = String(url);
  if (u.indexOf("entur.io") > -1) return new Response(JSON.stringify(ENTUR_SVAR), { status: 200 });
  if (u.indexOf("overpass-api.de") > -1) {
    return new Response("<!DOCTYPE HTML><html>Not Acceptable</html>", { status: 406 });
  }
  return new Response(JSON.stringify(OSM_SVAR), { status: 200 });
};
r = await puber(be("/api/puber?arena=Lerkendal"));
const speil = await r.json();
ok("406 fra hovedtjeneren gar videre til speilet",
   r.status === 200 && speil.grupper.length === 2, r.status + " " + JSON.stringify(speil.forsok));
ok("alle tjenerne star i forsok, med navn og utfall",
   speil.forsok.filter((f) => f.kilde.indexOf("Overpass") === 0).length === OVERPASS_SPEIL.length &&
   speil.forsok.some((f) => f.kilde.indexOf("overpass-api.de") > -1 && f.status === 406) &&
   speil.forsok.some((f) => f.kilde.indexOf("kumi.systems") > -1 && f.antall === 2),
   JSON.stringify(speil.forsok));

// En tjener som aldri svarer skal forlates, ikke ta med seg hele kallet.
// Uten frist ville Netlify avbrutt funksjonen, og da forsvinner ogsa
// forsok-lista som forklarer hva som gikk galt.
kall = [];
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  const u = String(url);
  if (u.indexOf("entur.io") > -1) return new Response(JSON.stringify(ENTUR_SVAR), { status: 200 });
  if (u.indexOf("overpass-api.de") > -1) {
    // Svarer aldri av seg selv. Bare fristen kan avslutte den.
    return new Promise((_, avvis) => {
      const signal = (opsjoner || {}).signal;
      if (!signal) return;
      signal.addEventListener("abort", () => avvis(new Error("This operation was aborted")));
    });
  }
  return new Response(JSON.stringify(OSM_SVAR), { status: 200 });
};
const forTreg = Date.now();
r = await puber(be("/api/puber?arena=Lerkendal"));
const treg = await r.json();
const brukt = Date.now() - forTreg;
ok("en tjener som ikke svarer blir forlatt", r.status === 200 && treg.grupper.length === 2,
   r.status + " " + JSON.stringify(treg.forsok));
ok("og det star i forsok at den ble avbrutt",
   treg.forsok.some((f) => f.kilde.indexOf("overpass-api.de") > -1 && /abort/i.test(String(f.utfall))),
   JSON.stringify(treg.forsok));
// Med kapplop venter vi ikke pa den trege i det hele tatt: en rask
// tjener svarer med en gang, og den trege avbrytes.
ok("en treg tjener forsinker ikke svaret", brukt < 1000, brukt + " ms");
// Entur og Overpass vet ingenting om hverandre og sporres samtidig.
ok("Entur star forst i forsok uansett hvem som ble ferdig forst",
   treg.forsok[0].kilde === "Entur nearest", JSON.stringify(treg.forsok));

/* ---------------- admin: visninger ---------------- */

const PASSORD = "et-langt-adminpassord";
const GHTOKEN = "ghp_hemmelig";

function stubGithub(fila, lesStatus, skrivStatus) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    kall.push({ url: String(url), metode: o.method || "GET", opsjoner: o });
    if (o.method === "PUT") {
      return new Response(JSON.stringify({ commit: { sha: "abc" } }), { status: skrivStatus || 200 });
    }
    return new Response(JSON.stringify({
      sha: "gammel-sha",
      content: Buffer.from(fila, "utf8").toString("base64"),
    }), { status: lesStatus || 200 });
  };
  return kall;
}

function adminBe(kropp, metode) {
  return new Request("https://mvp-sb.netlify.app/api/visninger", {
    method: metode || "POST",
    headers: { "Content-Type": "application/json" },
    body: metode === "GET" ? undefined : JSON.stringify(kropp),
  });
}

const TOM_FIL = "export const VISNINGER = [];\n";
const ADMIN_KAMPER = [
  { id: 11, hjemme: "Brann", borte: "Bodo/Glimt", dato: "2126-09-13T15:00:00Z" },
  { id: 12, hjemme: "Molde", borte: "Rosenborg", dato: "2126-09-14T17:00:00Z" },
];

delete process.env.ADMIN_PASSORD;
delete process.env.GITHUB_TOKEN;
kall = stubGithub(TOM_FIL);
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
const uoppsatt = await r.json();
ok("uten oppsett svarer portalen 503", r.status === 503, r.status);
ok("uten oppsett rores ikke GitHub", kall.length === 0, kall.length);
// «Portalen er ikke satt opp» alene sender admin til a lete i koden
// etter noe som star i Netlify-panelet.
ok("503-svaret navngir det som mangler",
   uoppsatt.feil.indexOf("ADMIN_PASSORD") > -1 && uoppsatt.feil.indexOf("GITHUB_TOKEN") > -1,
   uoppsatt.feil);
ok("og det sier at det ma rulles ut pa nytt",
   uoppsatt.feil.indexOf("Trigger deploy") > -1, uoppsatt.feil);

// Portalen sporr ved apning, sa admin far vite det for kampene er
// krysset av — ikke etterpa.
r = await visninger(adminBe(null, "GET"));
const uklar = await r.json();
ok("GET sier at portalen ikke er klar",
   r.status === 200 && uklar.klar === false, r.status + " " + JSON.stringify(uklar));
ok("og hvilke variabler som mangler",
   uklar.mangler.join(",") === "ADMIN_PASSORD,GITHUB_TOKEN", JSON.stringify(uklar.mangler));

process.env.ADMIN_PASSORD = PASSORD;
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
const halvt = await r.json();
ok("mangler bare tokenet, er det bare det som star",
   halvt.feil.indexOf("GITHUB_TOKEN") > -1 && halvt.feil.indexOf("ADMIN_PASSORD") === -1, halvt.feil);

process.env.GITHUB_TOKEN = GHTOKEN;

r = await visninger(adminBe(null, "GET"));
ok("med begge satt sier GET at portalen er klar", (await r.json()).klar === true);

r = await visninger(adminBe(null, "PUT"));
ok("andre metoder avvises", r.status === 405, r.status);

// Innloggingen: portalen viser ingenting for passordet er godtatt.
kall = stubGithub(TOM_FIL);
r = await visninger(adminBe({ handling: "sjekk", passord: "feil" }));
ok("innlogging med feil passord gir 401", r.status === 401, r.status);
r = await visninger(adminBe({ handling: "sjekk", passord: PASSORD }));
ok("innlogging med riktig passord gir 200", r.status === 200 && (await r.json()).ok === true, r.status);
ok("en innlogging skriver ingenting", kall.length === 0, kall.length);

kall = stubGithub(TOM_FIL);
r = await visninger(adminBe({ passord: "feil", pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
ok("feil passord gir 401", r.status === 401, r.status);
// Et feil passord skal ikke koste et kall mot GitHub.
ok("feil passord rorer ikke GitHub", kall.length === 0, kall.length);

kall = stubGithub(TOM_FIL);
r = await visninger(adminBe({ passord: PASSORD, pub: "Utepils AS", kampIder: [11], kamper: ADMIN_KAMPER }));
ok("ukjent pub gir 400", r.status === 400, r.status);
ok("ukjent pub rorer ikke GitHub", kall.length === 0, kall.length);

kall = stubGithub(TOM_FIL);
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
const lagret = await r.json();
ok("en lagring svarer 200", r.status === 200 && lagret.ok === true, r.status + " " + JSON.stringify(lagret));
ok("svaret sier hva som ble lagret",
   lagret.pub === "Carls" && lagret.valgt === 1 && lagret.totalt === 1, JSON.stringify(lagret));
// Tokenet er det eneste som ikke tåler a lekke.
ok("tokenet lekker ikke ut til portalen", JSON.stringify(lagret).indexOf(GHTOKEN) === -1);
ok("tokenet sendes som Bearer til GitHub",
   kall[0].opsjoner.headers["Authorization"] === "Bearer " + GHTOKEN);
const put = kall.find((k) => k.metode === "PUT");
ok("fila skrives med sha fra lesingen", put && JSON.parse(put.opsjoner.body).sha === "gammel-sha");
ok("commit-meldingen sier hva som skjedde",
   JSON.parse(put.opsjoner.body).message.indexOf("Carls viser 1 kamper") > -1,
   JSON.parse(put.opsjoner.body).message);
const skrevet = Buffer.from(JSON.parse(put.opsjoner.body).content, "base64").toString("utf8");
ok("det som skrives er en gyldig fil vi kan lese tilbake",
   lesVisninger(skrevet).length === 1 &&
   lesVisninger(skrevet)[0].kampId === "2126-09-13-brann-bodoglimt", skrevet);

// Lagringen bygger pa det som star i fila na, ikke pa en utrullet kopi.
kall = stubGithub(TOM_FIL.replace("[]",
  '[{"pub":"Lincoln Pub","kampId":11,"kamp":"A","dato":"2126-09-13T15:00:00Z","satt":"2026-09-11T10:00:00Z"}]'));
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [12], kamper: ADMIN_KAMPER }));
const sammen = Buffer.from(JSON.parse(kall.find((k) => k.metode === "PUT").opsjoner.body).content, "base64").toString("utf8");
ok("en annen pubs visning star igjen",
   lesVisninger(sammen).length === 2 && lesVisninger(sammen).some((v) => v.pub === "Lincoln Pub"),
   sammen);

kall = stubGithub(TOM_FIL, 404);
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
ok("far vi ikke lest fila, gir det 502 med grunn",
   r.status === 502 && (await r.json()).feil.indexOf("404") > -1, r.status);

kall = stubGithub(TOM_FIL, 200, 409);
r = await visninger(adminBe({ passord: PASSORD, pub: "Carls", kampIder: [11], kamper: ADMIN_KAMPER }));
ok("far vi ikke skrevet, gir det 502 med grunn",
   r.status === 502 && (await r.json()).feil.indexOf("409") > -1, r.status);

delete process.env.ADMIN_PASSORD;
delete process.env.GITHUB_TOKEN;

/* ---------------- innlogging ---------------- */

// Kallet mot Supabase gar fra funksjonen, ikke fra nettleseren: nokkelen
// skal aldri na leseren, og appen skal bare snakke med sitt eget domene.
function stubSupabase(svar, status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    return new Response(JSON.stringify(svar === undefined ? {} : svar), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return kall;
}

function kontoBe(kropp, metode) {
  return new Request("https://mvp-sb.netlify.app/api/konto", {
    method: metode || "POST",
    headers: { "Content-Type": "application/json" },
    body: metode === "GET" ? undefined : JSON.stringify(kropp),
  });
}

const SUPA_NOKKEL = "hemmelig-anon-nokkel";
const PEPPER = "hemmelig-pepper";
const OKT = {
  access_token: "okt-token-123",
  expires_in: 3600,
  refresh_token: "forny-1",
  user: { email: "ola@pin.mvp-sb.netlify.app", id: "u-1" },
};

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.PIN_PEPPER;

kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "1234" }));
const kontoUoppsatt = await r.json();
ok("uten oppsett svarer innloggingen 503", r.status === 503, r.status);
ok("uten oppsett rores ikke tjenesten", kall.length === 0, kall.length);
ok("503-svaret navngir det som mangler",
   kontoUoppsatt.feil.indexOf("SUPABASE_URL") > -1 &&
   kontoUoppsatt.feil.indexOf("SUPABASE_ANON_KEY") > -1, kontoUoppsatt.feil);
// Uten pepperet blir passordet hos tjenesten fire siffer, og Supabase
// krever seks tegn. Da feiler den forste innloggingen med en melding om
// passordlengde, og ingen skjonner hvorfor. Derfor skal den star i lista.
ok("og at pepperet mangler", kontoUoppsatt.feil.indexOf("PIN_PEPPER") > -1,
   kontoUoppsatt.feil);
ok("og at det ma rulles ut pa nytt",
   kontoUoppsatt.feil.indexOf("Trigger deploy") > -1, kontoUoppsatt.feil);

// Appen sporr ved apning, sa det star for navnet er skrevet inn.
r = await konto(kontoBe(null, "GET"));
const kontoUklar = await r.json();
ok("GET sier at innloggingen ikke er klar",
   r.status === 200 && kontoUklar.klar === false, JSON.stringify(kontoUklar));
ok("og hvilke variabler som mangler",
   kontoUklar.mangler.join(",") === "SUPABASE_URL,SUPABASE_ANON_KEY,PIN_PEPPER",
   JSON.stringify(kontoUklar.mangler));

process.env.SUPABASE_URL = "https://prosjekt.supabase.co/";
process.env.SUPABASE_ANON_KEY = SUPA_NOKKEL;
process.env.PIN_PEPPER = PEPPER;

// Den vanligste innloggingen: noen som har vaert her for. Ett kall.
kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "logg-inn", navn: "  Ola ", pin: "12 34" }));
const okt = await r.json();
ok("fornavn og PIN gir en okt", r.status === 200 && okt.token === "okt-token-123",
   r.status + " " + JSON.stringify(okt));
ok("okta barer navnet, ikke adressen vi lagde", okt.navn === "Ola" &&
   JSON.stringify(okt).indexOf("pin.mvp-sb.netlify.app") === -1, JSON.stringify(okt));
ok("en som har logget inn for koster ett kall", kall.length === 1, kall.length);
// Fornyeren er det som gjor telefonen til en telefon du er logget inn pa.
// Uten den varer innloggingen én time, og da ble PIN-en bedt om pa nytt.
ok("okta barer fornyeren fra tjenesten", okt.fornyer === "forny-1", JSON.stringify(okt));

// Skragestreken pa slutten av SUPABASE_URL skal ikke gi //auth.
ok("adressen til tjenesten er hel",
   kall[0].url === "https://prosjekt.supabase.co/auth/v1/token?grant_type=password",
   kall[0].url);
// Navnet ma bli samme nokkel uansett skrivemate, ellers mister man
// svarene sine ved a skrive «ola» pa neste telefon.
ok("navnet blir en adresse pa vart eget domene",
   JSON.parse(kall[0].opsjoner.body).email === "ola@pin.mvp-sb.netlify.app",
   kall[0].opsjoner.body);
// Pepperet er det eneste som holder fire siffer fra a vaere fire siffer
// mot Supabase sitt eget endepunkt.
ok("PIN-en sendes med pepperet pa",
   JSON.parse(kall[0].opsjoner.body).password === "1234:" + PEPPER,
   kall[0].opsjoner.body);
ok("nokkelen gar til tjenesten, ikke til leseren",
   kall[0].opsjoner.headers.apikey === SUPA_NOKKEL &&
   JSON.stringify(okt).indexOf(SUPA_NOKKEL) === -1);
// Pepperet er en hemmelighet. Det skal aldri ligge i et svar leseren ser
// — heller ikke i `forsok`.
ok("og pepperet aldri til leseren", JSON.stringify(okt).indexOf(PEPPER) === -1,
   JSON.stringify(okt));
ok("svaret caches aldri",
   r.headers.get("Cache-Control") === "no-store", r.headers.get("Cache-Control"));

// Fornyelsen: bytt fornyeren i et ferskt token, uten at PIN-en tastes.
kall = stubSupabase({ access_token: "okt-token-456", expires_in: 3600,
  refresh_token: "forny-2",
  user: { email: "ola@pin.mvp-sb.netlify.app", id: "u-1",
          user_metadata: { navn: "Ola" } } });
r = await konto(kontoBe({ handling: "forny", fornyer: "forny-1", navn: "Ola" }));
const fornyet = await r.json();
ok("en fornyer gir et ferskt token", r.status === 200 && fornyet.token === "okt-token-456",
   r.status + " " + JSON.stringify(fornyet));
ok("og den gar til grant_type=refresh_token",
   kall[0].url === "https://prosjekt.supabase.co/auth/v1/token?grant_type=refresh_token",
   kall[0].url);
ok("fornyeren sendes med, PIN-en og pepperet ikke",
   JSON.parse(kall[0].opsjoner.body).refresh_token === "forny-1" &&
   kall[0].opsjoner.body.indexOf(PEPPER) === -1 &&
   kall[0].opsjoner.body.indexOf("password") === -1,
   kall[0].opsjoner.body);
// Fornyeren roterer hos Supabase: den brukte er dod, sa den nye ma
// lagres i stedet. Barer ikke svaret den, blir neste fornying avvist.
ok("den nye fornyeren folger med tilbake", fornyet.fornyer === "forny-2",
   JSON.stringify(fornyet));
// Navnet star hos tjenesten, skrevet slik personen selv skrev det.
ok("navnet hentes fra tjenesten, ikke fra det appen sendte",
   fornyet.navn === "Ola", fornyet.navn);
ok("og adressen vi lagde folger fortsatt ikke med",
   JSON.stringify(fornyet).indexOf("pin.mvp-sb.netlify.app") === -1,
   JSON.stringify(fornyet));

// En avvist fornyer er ikke noe a prove pa nytt: den er brukt, trukket
// tilbake eller utlopt. Da ma appen logge ut framfor a sta og prove.
kall = stubSupabase({ error: "invalid_grant", error_description: "Refresh Token Not Found" }, 400);
r = await konto(kontoBe({ handling: "forny", fornyer: "gammel", navn: "Ola" }));
const avvist = await r.json();
ok("en avvist fornyer svarer 401 og sier at du er logget ut",
   r.status === 401 && avvist.utlogget === true, r.status + " " + JSON.stringify(avvist));
ok("og ber deg logge inn framfor a prove igjen",
   avvist.feil.indexOf("Logg inn") > -1, avvist.feil);

// Uten fornyer rores ikke tjenesten i det hele tatt.
kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "forny", navn: "Ola" }));
ok("en fornying uten fornyer nar aldri tjenesten",
   r.status === 400 && kall.length === 0, r.status + " " + kall.length);

// Tilbake til innloggingen: testene under leser `kall` fra den.
kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "logg-inn", navn: "  Ola ", pin: "12 34" }));

ok("samme navn gir samme konto uansett skrivemate",
   JSON.parse(stubSupabase(OKT) && kall[0].opsjoner.body).email ===
   JSON.parse((await (async () => {
     const k = stubSupabase(OKT);
     await konto(kontoBe({ handling: "logg-inn", navn: "OLA", pin: "1234" }));
     return k[0].opsjoner.body;
   })())).email);

// Et navn som bare er tegnsetting ville blitt en tom nokkel, og en tom
// nokkel er alles konto.
kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "logg-inn", navn: "•", pin: "1234" }));
ok("et navn som ikke er et navn stoppes her",
   r.status === 400 && kall.length === 0, r.status + " " + kall.length);

kall = stubSupabase(OKT);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "12" }));
ok("en for kort PIN stoppes her", r.status === 400 && kall.length === 0,
   r.status + " " + kall.length);

// Forste gang: innloggingen avvises fordi kontoen ikke finnes enda, og da
// lages den i samme kall. Leseren skal ikke trenge a vite om hen
// registrerer seg eller logger inn.
let steg = 0;
kall = [];
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  steg++;
  const feil = { error_code: "invalid_credentials", msg: "Invalid login credentials" };
  if (steg === 1) {
    return new Response(JSON.stringify(feil),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }
  // Tredje kall er foringen i kontolista, som svarer 201 uten kropp.
  if (steg >= 3) return new Response(null, { status: 201 });
  return new Response(JSON.stringify(OKT),
    { status: 200, headers: { "Content-Type": "application/json" } });
};
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "1234" }));
ok("et nytt navn far en konto i samme kall",
   r.status === 200 && (await r.json()).navn === "Ola", r.status);
ok("og kontoen lages hos tjenesten, ikke her",
   kall[1].url.indexOf("/auth/v1/signup") > -1, kall[1].url);
ok("med samme adresse og samme passord som innloggingen provde",
   JSON.parse(kall[1].opsjoner.body).email === JSON.parse(kall[0].opsjoner.body).email &&
   JSON.parse(kall[1].opsjoner.body).password === JSON.parse(kall[0].opsjoner.body).password,
   kall[1].opsjoner.body);
// Adressen barer bare slugen. Navnet slik personen skrev det folger med
// som metadata, sa adminportalen kan vise «Bjørn Åge» og ikke
// «bjoernaage».
ok("og med navnet slik det ble skrevet",
   JSON.parse(kall[1].opsjoner.body).data.navn === "Ola", kall[1].opsjoner.body);
// Uten foringen ville neste person som skriver «Ola» fatt «lag en PIN» pa
// et navn som er tatt — og det er den ene feilen vi ikke kan rette opp.
ok("og navnet fores opp i kontolista",
   kall.length === 3 && kall[2].url.indexOf("/rest/v1/pin_kontoer") > -1 &&
   JSON.parse(kall[2].opsjoner.body).slug === "ola",
   kall.length + " " + (kall[2] && kall[2].url));
// Raden skrives med leserens egen okt, ikke med en nokkel som kan skrive
// hva som helst: reglene i databasen slipper bare gjennom din egen rad.
ok("med leserens egen okt, og uten a si hvem brukeren er",
   kall[2].opsjoner.headers.Authorization === "Bearer okt-token-123" &&
   JSON.parse(kall[2].opsjoner.body).bruker === undefined,
   JSON.stringify(kall[2].opsjoner.headers));

// Steg én i appen: er navnet nytt eller kjent? Uten dette vet ikke
// panelet om det skal be om «Gjenta PIN-en».
kall = stubSupabase([{ slug: "ola" }]);
r = await konto(kontoBe({ handling: "finnes", navn: "  OLA " }));
const finnesSvar = await r.json();
ok("et navn som er tatt sier fra for PIN-en tastes",
   r.status === 200 && finnesSvar.finnes === true, r.status + " " + JSON.stringify(finnesSvar));
ok("og navnet kommer renset tilbake", finnesSvar.navn === "OLA", finnesSvar.navn);
// Slaas opp pa slugen, ikke pa navnet: «Ola» og «ola» er samme konto.
ok("oppslaget gar pa slugen",
   kall[0].url.indexOf("slug=eq.ola") > -1, kall[0].url);

kall = stubSupabase([]);
r = await konto(kontoBe({ handling: "finnes", navn: "Nykar" }));
ok("et ledig navn sier ogsa fra",
   r.status === 200 && (await r.json()).finnes === false, r.status);

kall = stubSupabase({});
r = await konto(kontoBe({ handling: "finnes", navn: "•" }));
ok("et navn som ikke er et navn stoppes for oppslaget",
   r.status === 400 && kall.length === 0, r.status + " " + kall.length);

// Den som setter opp prosjektet trenger a hore nyaktig dette.
kall = stubSupabase({ code: "42P01", message: "relation \"pin_kontoer\" does not exist" }, 404);
r = await konto(kontoBe({ handling: "finnes", navn: "Ola" }));
const utenListe = await r.json();
ok("uten tabellen star det hva som mangler",
   r.status === 503 && utenListe.feil.indexOf("pin_kontoer") > -1 &&
   utenListe.feil.indexOf("docs/nokler-og-tokens.md") > -1,
   r.status + " " + utenListe.feil);

// Navnet finnes med en annen PIN. Det sier vi rett ut: et fornavn i en
// vennegjeng er ingen hemmelighet, og alternativet er at «Ola» far «feil
// PIN» uten a fa vite at det er en annen Ola som har navnet.
kall = stubSupabase({ error_code: "user_already_exists", msg: "User already registered" }, 400);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "9999" }));
const tatt = await r.json();
ok("et navn som er tatt sier det",
   r.status === 401 && tatt.feil.indexOf("er tatt") > -1, r.status + " " + tatt.feil);
ok("og navngir navnet, sa man kan velge et annet", tatt.feil.indexOf("Ola") > -1, tatt.feil);
ok("begge forsokene star i forsok", (tatt.forsok || []).length === 2,
   JSON.stringify(tatt.forsok));

// De to kallene svarer ulikt, sa stubben ma skille dem: innloggingen
// avvises, og det er signup-svaret vi vil se pa.
function stubAvvistDeretter(svar, status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    const forst = kall.length === 1;
    return new Response(JSON.stringify(forst
      ? { error_code: "invalid_credentials", msg: "Invalid login credentials" }
      : svar), {
      status: forst ? 400 : (status || 200),
      headers: { "Content-Type": "application/json" },
    });
  };
  return kall;
}

// Supabase svarer ogsa 200 med en tom identitetsliste nar navnet finnes.
// Det er tjenestens mate a svare «denne finnes alt» uten a rope det.
kall = stubAvvistDeretter({ user: { id: "u-1", identities: [] } });
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "9999" }));
ok("et 200-svar uten identiteter betyr ogsa at navnet er tatt",
   r.status === 401 && (await r.json()).feil.indexOf("er tatt") > -1, r.status);

// Samme svar, men med en identitet: da er det e-postbekreftelse som star
// pa, og den kan ikke sta pa her — adressen er ikke en ekte adresse.
kall = stubAvvistDeretter({ user: { id: "u-1", identities: [{ id: "i-1" }] } });
r = await konto(kontoBe({ handling: "logg-inn", navn: "Nykar", pin: "1234" }));
const ubekreftet = await r.json();
ok("en okt som aldri kom sier hva som ma slas av i Supabase",
   r.status === 503 && ubekreftet.feil.indexOf("e-postbekreftelse") > -1,
   r.status + " " + ubekreftet.feil);
ok("og hvor det star", ubekreftet.feil.indexOf("docs/nokler-og-tokens.md") > -1,
   ubekreftet.feil);

// Star e-postbekreftelse pa, ryker signup i e-postsendingen for den
// rekker a svare 200 uten okt. Da kommer en 500 — og «prov igjen om
// litt» ville sendt leseren ut pa a vente pa noe som aldri gar over av
// seg selv.
kall = stubAvvistDeretter({ msg: "Error sending confirmation email" }, 500);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Nykar", pin: "1234" }));
const epostfeil = await r.json();
ok("en feilet e-postsending sier hvilken innstilling det er",
   r.status === 503 && epostfeil.feil.indexOf("Confirm email") > -1,
   r.status + " " + epostfeil.feil);
ok("og hvor den star", epostfeil.feil.indexOf("Sign In / Providers") > -1,
   epostfeil.feil);
// Tjenestens egen melding folger med, som ellers.
ok("med tjenestens egen melding i forsok",
   JSON.stringify(epostfeil.forsok).indexOf("Error sending confirmation email") > -1,
   JSON.stringify(epostfeil.forsok));

// En tjenestefeil eller en sperre skal ikke legge en runde til pa noe som
// alt er galt et annet sted.
kall = stubSupabase({ msg: "Internal error" }, 500);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "1234" }));
ok("en tjenestefeil lager ingen konto", kall.length === 1 && r.status === 502,
   kall.length + " " + r.status);

kall = stubSupabase({ msg: "rate limit exceeded" }, 429);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "1234" }));
ok("en sperre lager ingen konto heller, og ber deg vente",
   kall.length === 1 && r.status === 429 && (await r.json()).feil.indexOf("Vent") > -1,
   kall.length + " " + r.status);

// Feil PIN pa et navn som finnes: begge veier avvist.
kall = stubSupabase({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
r = await konto(kontoBe({ handling: "logg-inn", navn: "Ola", pin: "9999" }));
const feilPin = await r.json();
ok("feil PIN gir 401", r.status === 401 &&
   feilPin.feil === "Navnet eller PIN-en stemmer ikke.", r.status + " " + feilPin.feil);
ok("tjenestens egen melding folger med avvisningen",
   (feilPin.forsok || []).length === 2 &&
   feilPin.forsok[0].melding.indexOf("Invalid login credentials") > -1,
   JSON.stringify(feilPin.forsok));
// Hverken pepperet eller adressen vi lagde skal kunne leses ut av et
// feilsvar.
ok("og feilsvaret royper verken pepperet eller adressen",
   JSON.stringify(feilPin).indexOf(PEPPER) === -1 &&
   JSON.stringify(feilPin).indexOf("pin.mvp-sb.netlify.app") === -1,
   JSON.stringify(feilPin));

// Sletting av egen konto. Ingen service_role-nokkel finnes her, sa det
// gar gjennom en databasefunksjon som bare kan slette den okta eier.
// PostgREST svarer 204 uten kropp pa en void-funksjon. Et Response med
// 204 kan ikke ha kropp i det hele tatt, sa stubben ma speile det —
// ellers tester vi noe annet enn virkeligheten.
function stubTomt(status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    return new Response(null, { status: status || 204 });
  };
  return kall;
}

kall = stubTomt(204);
r = await konto(kontoBe({ handling: "slett", token: "okt-token-123" }));
ok("kontoen kan slettes", r.status === 200 && (await r.json()).slettet === true, r.status);
ok("slettingen gar til databasefunksjonen",
   kall[0].url.indexOf("/rest/v1/rpc/slett_meg") > -1, kall[0].url);
ok("og med leserens egen okt — aldri en admin-nokkel",
   kall[0].opsjoner.headers.Authorization === "Bearer okt-token-123" &&
   JSON.stringify(kall[0].opsjoner.headers).indexOf("service_role") === -1,
   JSON.stringify(kall[0].opsjoner.headers));

kall = stubTomt(204);
r = await konto(kontoBe({ handling: "slett" }));
ok("uten okt slettes ingenting", r.status === 401 && kall.length === 0,
   r.status + " " + kall.length);

// Den som setter opp prosjektet trenger a hore nyaktig dette.
kall = stubSupabase({ message: "Could not find the function" }, 404);
r = await konto(kontoBe({ handling: "slett", token: "okt-token-123" }));
ok("uten funksjonen i databasen star det hva som mangler",
   r.status === 503 && (await r.json()).feil.indexOf("docs/nokler-og-tokens.md") > -1,
   r.status);

kall = stubSupabase({ message: "JWT expired" }, 401);
r = await konto(kontoBe({ handling: "slett", token: "gammel" }));
ok("en utlopt okt sletter ingenting", r.status === 401, r.status);

r = await konto(kontoBe({ handling: "noe-annet", navn: "Ola", pin: "1234" }));
ok("en ukjent handling avvises", r.status === 400, r.status);

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.PIN_PEPPER;

/* ---------------- brukerlista i adminportalen ---------------- */

function brukerBe(kropp, metode) {
  return new Request("https://mvp-sb.netlify.app/api/brukere", {
    method: metode || "POST",
    headers: { "Content-Type": "application/json" },
    body: metode === "GET" ? undefined : JSON.stringify(kropp),
  });
}

const SVC = "hemmelig-service-nokkel";
const BRUKER_ID = "11111111-2222-3333-4444-555555555555";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.ADMIN_PASSORD;
delete process.env.PIN_PEPPER;

kall = stubSupabase([]);
r = await brukere(brukerBe({ passord: "x", handling: "liste" }));
const brukerUoppsatt = await r.json();
ok("uten oppsett svarer brukerlista 503", r.status === 503, r.status);
ok("uten oppsett rores ikke tjenesten", kall.length === 0, kall.length);
ok("503-svaret navngir det som mangler",
   brukerUoppsatt.feil.indexOf("SUPABASE_SERVICE_KEY") > -1 &&
   brukerUoppsatt.feil.indexOf("ADMIN_PASSORD") > -1 &&
   brukerUoppsatt.feil.indexOf("PIN_PEPPER") > -1, brukerUoppsatt.feil);

r = await brukere(brukerBe(null, "GET"));
ok("GET sier at brukerlista ikke er klar",
   r.status === 200 && (await r.json()).klar === false, r.status);

process.env.SUPABASE_URL = "https://prosjekt.supabase.co/";
process.env.SUPABASE_SERVICE_KEY = SVC;
process.env.ADMIN_PASSORD = "riktig-passord";
process.env.PIN_PEPPER = PEPPER;

// Et feil passord skal aldri fore til et kall mot Supabase. Nokkelen her
// kan gjore hva som helst med hvem som helst; passordet er det eneste som
// star i veien.
kall = stubSupabase([]);
r = await brukere(brukerBe({ passord: "feil", handling: "liste" }));
ok("feil passord gir 401", r.status === 401, r.status);
ok("og narmer seg aldri tjenesten", kall.length === 0, kall.length);

kall = stubSupabase([
  { id: BRUKER_ID, email: "ola@pin.mvp-sb.netlify.app",
    user_metadata: { navn: "Ola" },
    created_at: "2026-09-01T10:00:00Z", last_sign_in_at: "2026-09-11T19:00:00Z" },
]);
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "liste" }));
const brukerLista = await r.json();
ok("riktig passord gir lista", r.status === 200 && brukerLista.brukere.length === 1,
   r.status + " " + JSON.stringify(brukerLista));
ok("med navn, forste og siste palogging",
   brukerLista.brukere[0].navn === "Ola" &&
   brukerLista.brukere[0].forst === "2026-09-01T10:00:00Z" &&
   brukerLista.brukere[0].sist === "2026-09-11T19:00:00Z",
   JSON.stringify(brukerLista.brukere[0]));
ok("lista hentes fra admin-endepunktet",
   kall[0].url.indexOf("/auth/v1/admin/users") > -1, kall[0].url);
// Nokkelen her kan lese og slette hvem som helst. Den skal aldri ut.
ok("service-nokkelen gar til tjenesten, ikke til admin",
   kall[0].opsjoner.headers.Authorization === "Bearer " + SVC &&
   JSON.stringify(brukerLista).indexOf(SVC) === -1,
   JSON.stringify(brukerLista));
ok("og adressen vi lagde av navnet vises ikke",
   JSON.stringify(brukerLista).indexOf("@pin.mvp-sb.netlify.app") === -1,
   JSON.stringify(brukerLista));
ok("svaret caches aldri",
   r.headers.get("Cache-Control") === "no-store", r.headers.get("Cache-Control"));

// Ny PIN til en som har glemt sin. Pepperet ma pa, ellers kommer hen ikke
// inn med PIN-en admin nettopp ga.
kall = stubSupabase({});
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "pin",
  id: BRUKER_ID, pin: "45 67" }));
ok("admin kan sette en ny PIN", r.status === 200, r.status);
ok("og den settes med pepperet pa",
   JSON.parse(kall[0].opsjoner.body).password === "4567:" + PEPPER,
   kall[0].opsjoner.body);
ok("pa den ene brukeren, ikke pa alle",
   kall[0].url.indexOf("/auth/v1/admin/users/" + BRUKER_ID) > -1 &&
   kall[0].opsjoner.method === "PUT", kall[0].url);

kall = stubSupabase({});
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "pin",
  id: BRUKER_ID, pin: "12" }));
ok("en for kort PIN stoppes her", r.status === 400 && kall.length === 0,
   r.status + " " + kall.length);

// Id-en gar inn i en adresse. Den kommer fra lista portalen nettopp fikk,
// men den sjekkes mot formen en uuid har framfor a stoles pa.
kall = stubSupabase({});
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "slett",
  id: "../../noe-annet" }));
ok("en id som ikke er en uuid stoppes for den nar en adresse",
   r.status === 400 && kall.length === 0, r.status + " " + kall.length);

kall = stubSupabase({});
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "slett", id: BRUKER_ID }));
ok("admin kan slette en bruker",
   r.status === 200 && (await r.json()).slettet === true, r.status);
ok("og slettingen gar pa den ene id-en",
   kall[0].opsjoner.method === "DELETE" &&
   kall[0].url.indexOf("/auth/v1/admin/users/" + BRUKER_ID) > -1, kall[0].url);

// De to nokkelene ser like ut, og anon-nokkelen gir 401 her. Det er den
// feilen som kommer til a skje, sa den skal si hva den er.
kall = stubSupabase({ msg: "User not allowed" }, 401);
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "liste" }));
ok("en avvist nokkel sier at det kanskje er anon-nokkelen",
   r.status === 502 && (await r.json()).feil.indexOf("anon-nøkkelen") > -1, r.status);

r = await brukere(brukerBe({ passord: "riktig-passord", handling: "noe-annet" }));
ok("en ukjent handling avvises", r.status === 400, r.status);

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.ADMIN_PASSORD;
delete process.env.PIN_PEPPER;

/* ---------------- hvem blir med ---------------- */

function svarBe(kropp, metode, adresse) {
  return new Request("https://mvp-sb.netlify.app" + (adresse || "/api/svar"), {
    method: metode || "POST",
    headers: { "Content-Type": "application/json" },
    body: metode === "GET" ? undefined : JSON.stringify(kropp),
  });
}

const SVAR_RADER = [
  { kamp_id: 7, navn: "Ola", hvor: "pub", sted: "Andy's Pub", bruker: "u-1" },
];

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe(null, "GET", "/api/svar?kamper=7"));
ok("uten oppsett svarer lista 503", r.status === 503 && kall.length === 0,
   r.status + " " + kall.length);

process.env.SUPABASE_URL = "https://prosjekt.supabase.co";
process.env.SUPABASE_ANON_KEY = SUPA_NOKKEL;

kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe(null, "GET", "/api/svar?kamper=7,8"));
const svarLista = await r.json();
ok("hele runden hentes i ett kall", kall.length === 1, kall.length);
ok("og med kampene i ett filter",
   kall[0].url.indexOf("kamp_id=in.(7,8)") > -1, kall[0].url);
// A se hvem som blir med krever ingen konto: appen skal kunne leses uten.
ok("lesing sender ingen okt", !kall[0].opsjoner.headers.Authorization,
   JSON.stringify(kall[0].opsjoner.headers));
ok("radene formes for de sendes ut",
   svarLista.svar.length === 1 && svarLista.svar[0].navn === "Ola", JSON.stringify(svarLista));
// Hvem som blir med endrer seg mens man ser pa det.
ok("lista caches aldri", r.headers.get("Cache-Control") === "no-store");

kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe(null, "GET", "/api/svar?kamper=drop%20table"));
ok("tull i kamplista gir tom liste, ikke et kall",
   r.status === 200 && (await r.json()).svar.length === 0 && kall.length === 0,
   kall.length);

// Skriving krever okta, og den gar med som leserens egen: databasen
// setter «bruker» fra den, sa ingen kan skrive i en annens navn.
kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe({ kampId: 7, navn: "Ola" }));
ok("uten okt far man ikke skrive", r.status === 401 && kall.length === 0, r.status);

kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe({ token: "okt-1", kampId: 7, navn: "  ", hvor: "pub" }));
ok("uten navn far man ikke skrive", r.status === 400 && kall.length === 0, r.status);

kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe({ token: "okt-1", kampId: "7; drop", navn: "Ola" }));
ok("en kamp-id som ikke er et tall stoppes her",
   r.status === 400 && kall.length === 0, r.status);

kall = stubSupabase(SVAR_RADER);
r = await svarfunksjon(svarBe({ token: "okt-1", kampId: 7, navn: " Ola ", hvor: "pub",
  sted: "Andy's Pub" }));
// Skrivingen, og sa to lesinger: som deg, og som hvem som helst.
// Statuskoden alene er ikke bevis pa at raden ligger der og kan leses —
// og appen sa «Du har planlagt a dra til …» pa noe som aldri kom fram.
ok("svaret skrives, og leses tilbake to ganger",
   r.status === 200 && kall.length === 3, r.status + " " + kall.length);
ok("med leserens egen okt",
   kall[0].opsjoner.headers.Authorization === "Bearer okt-1",
   JSON.stringify(kall[0].opsjoner.headers));
ok("den ene lesingen er som deg, den andre som alle andre",
   kall[1].opsjoner.headers.Authorization === "Bearer okt-1" &&
   !kall[2].opsjoner.headers.Authorization,
   JSON.stringify([kall[1].opsjoner.headers.Authorization,
                   kall[2].opsjoner.headers.Authorization]));
ok("og uten a si hvem brukeren er — det gjor databasen",
   JSON.parse(kall[0].opsjoner.body).bruker === undefined, kall[0].opsjoner.body);
// To «jeg blir med» pa samme kamp er en person, ikke to.
ok("skrivingen er en upsert",
   kall[0].url.indexOf("on_conflict=kamp_id,bruker") > -1 &&
   String(kall[0].opsjoner.headers.Prefer).indexOf("merge-duplicates") > -1,
   kall[0].url + " " + kall[0].opsjoner.headers.Prefer);

// Meldt fra prod 13. september 2026: appen sa «Du har planlagt a dra til
// Gronland Boulebar & Spiseri», og /api/svar svarte {"svar":[]}. Skrivingen
// meldte suksess pa noe som ikke lag der. Det skal den aldri gjore igjen.
kall = stubSupabase([]);
r = await svarfunksjon(svarBe({ token: "okt-1", kampId: 7, navn: "Ola", hvor: "pub",
  sted: "Andy's Pub" }));
const borte = await r.json();
ok("en skriving som ikke kan leses tilbake meldes som feil, ikke som ok",
   r.status === 502, r.status + " " + JSON.stringify(borte));
ok("og den sier at raden ikke finnes etterpa",
   borte.feil.indexOf("finnes ikke etterpå") > -1, borte.feil);

// Du ser den, men ingen andre gjor det: da er det lesereglen som mangler,
// ikke skrivingen. Uten denne beskjeden ser det ut som at ingen blir med
// pa noe, i all evighet.
let leseKall = 0;
kall = [];
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  const somDeg = !!(opsjoner && opsjoner.headers && opsjoner.headers.Authorization);
  const lesing = (opsjoner && opsjoner.method) === "GET";
  if (lesing) leseKall += 1;
  // Skrivingen og din egen lesing ser raden. Den anonyme ser ingenting.
  const kropp = (!lesing || somDeg) ? SVAR_RADER : [];
  return new Response(JSON.stringify(kropp), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};
r = await svarfunksjon(svarBe({ token: "okt-1", kampId: 7, navn: "Ola", hvor: "pub",
  sted: "Andy's Pub" }));
const bareDeg = await r.json();
ok("ser du den selv, men ingen andre, sies det fra",
   r.status === 200 && !!bareDeg.advarsel, r.status + " " + JSON.stringify(bareDeg));
ok("og advarselen navngir bade tabellen og fiksen",
   bareDeg.advarsel.indexOf("kampsvar") > -1 &&
   bareDeg.advarsel.indexOf("oppsett.sql") > -1, bareDeg.advarsel);
ok("svaret ditt kommer likevel tilbake",
   Array.isArray(bareDeg.svar) && bareDeg.svar.length > 0,
   JSON.stringify(bareDeg.svar));
ok("begge lesingene ble gjort", leseKall === 2, leseKall);

kall = stubSupabase({});
r = await svarfunksjon(svarBe({ handling: "fjern", token: "okt-1", kampId: 7 }));
ok("man kan angre", r.status === 200 && kall[0].opsjoner.method === "DELETE",
   r.status + " " + kall[0].opsjoner.method);
ok("og slettingen gar ogsa med leserens egen okt",
   kall[0].opsjoner.headers.Authorization === "Bearer okt-1");

// Den som setter opp prosjektet trenger a hore nyaktig dette.
kall = stubSupabase({ code: "42P01", message: 'relation "public.kampsvar" does not exist' }, 404);
r = await svarfunksjon(svarBe(null, "GET", "/api/svar?kamper=7"));
const utenTabell = await r.json();
ok("mangler tabellen, star det hva som mangler",
   r.status === 503 && utenTabell.feil.indexOf("kampsvar") > -1 &&
   utenTabell.feil.indexOf("docs/nokler-og-tokens.md") > -1, utenTabell.feil);

kall = stubSupabase({ message: "JWT expired" }, 401);
r = await svarfunksjon(svarBe({ token: "gammel", kampId: 7, navn: "Ola" }));
ok("en utlopt okt sier at man ma logge inn pa nytt",
   r.status === 401 && (await r.json()).feil.indexOf("Logg inn") > -1, r.status);

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

/* ---------------- rapport ---------------- */

// Tallet telles, ikke skrives: en hardkodet sum kan sta stille mens
// tester legges til.
console.log("\n" + (kjort - feilet) + " av " + kjort + " funksjonstester passerte");
process.exit(feilet ? 1 : 0);
