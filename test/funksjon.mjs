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
import { OVERPASS_SPEIL, SOK_TAK } from "../pub-data.js";
import visninger from "../netlify/functions/visninger.mjs";
import pubForslag from "../netlify/functions/pub-forslag.mjs";
import pubListe, { SOK_FRIST } from "../netlify/functions/pub-liste.mjs";
import konto from "../netlify/functions/konto.mjs";
import brukere from "../netlify/functions/brukere.mjs";
import svarfunksjon from "../netlify/functions/svar.mjs";

// SUITEN SETTER SITT EGET MILJO, framfor a arve maskinens.
//
// Flere tester dekker veien NAR en nokkel mangler — testnokkelen «3» mot
// TheSportsDB, 503 uten adminpassord, 503 uten Supabase-oppsett. De satte
// ikke variablene til noe; de stolte pa at de var tomme, og det holdt sa
// lenge suiten kjorte lokalt og i CI, der ingen av dem finnes.
//
// Det holdt ikke i Netlifys byggemilje, der alle de ekte nokkelene er satt.
// Tre tester feilet: de ba om v1 med testnokkelen og fikk v2 med den ekte,
// fordi THESPORTSDB_KEY sto der. Oppdaget da de to raske suitene ble gjort
// til byggekommando (#77) — en port som feiler av miljoet den star i, er
// verre enn ingen port.
//
// Tester som trenger en variabel satt, setter den selv. Derfor er
// baselinja tom, og den er nodt til a settes her, for den forste testen.
[
  "THESPORTSDB_KEY", "API_FOOTBALL_KEY", "api_football_key",
  "ADMIN_PASSORD", "PIN_PEPPER", "MET_KONTAKT",
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY",
].forEach((navn) => { delete process.env[navn]; });

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
ok("tabellen caches pa kanten i seks timer", kant.indexOf("s-maxage=21600") > -1, kant);
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
ok("resultater caches i tre timer",
   (r.headers.get("Netlify-CDN-Cache-Control") || "").indexOf("s-maxage=10800") > -1,
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
// «application/json» var grunnen til 406-en, ikke botemidlet: Overpass
// merker ikke svaret som JSON pa HTTP-niva, og strengt om JSON er a be om
// noe den ikke har. Formatet bestemmes av sporringen.
ok("Overpass hevder ingenting om formatet, og vi identifiserer oss",
   overpass.opsjoner.headers["Accept"] === "*/*" &&
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

// Avbrutt, ikke avvist med en kode: da avviser AbortController ALLE
// kallene med det SAMME feilobjektet. Notatene ble hentet derfra for, og
// da skrev hvert speil over det forrige — lista sto med ett speil to
// ganger og et annet ikke i det hele tatt. Meldt fra portalen 17.
// september 2026, og den samme feilen lever her, i den leserne treffer.
const DELT_ABORT = Object.assign(new Error("This operation was aborted"),
  { name: "AbortError" });
kall = [];
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  if (String(url).indexOf("entur.io") > -1) {
    return new Response(JSON.stringify(ENTUR_SVAR), { status: 200 });
  }
  throw DELT_ABORT;
};
r = await puber(be("/api/puber?arena=Lerkendal"));
const avbrutt = await r.json();
const OSM_KILDER = avbrutt.forsok.filter((f) => f.kilde.indexOf("Overpass") === 0)
  .map((f) => f.kilde);
ok("en avbrutt runde gir ett notat per speil",
   OSM_KILDER.length === OVERPASS_SPEIL.length, JSON.stringify(OSM_KILDER));
ok("og ingen tjener star oppfort to ganger",
   new Set(OSM_KILDER).size === OVERPASS_SPEIL.length, OSM_KILDER.join(" | "));
ok("rekkefolgen folger speillista ogsa nar alle ble avbrutt",
   OSM_KILDER.join("|") === OVERPASS_SPEIL.map((u) => "Overpass " + new URL(u).host).join("|"),
   OSM_KILDER.join(" | "));

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

// Lagret var GitHub til 15. september 2026: hver lagring en commit i
// visninger.js. Na er det Supabase (#79), og skrivingen gar med **admins
// egen okt** — ikke med en nokkel. ADMIN_PASSORD er vart eget passord, og
// Supabase vet ikke hva det er; databasen slar opp uid-en i
// visning_skrivere. Det er de to lassene disse testene skiller.

const PASSORD = "et-langt-adminpassord";
const OKT_TOKEN = "okt-token-fra-appen";

// Stubben svarer som PostgREST: DELETE gir 204 uten kropp, POST med
// Prefer: return=representation gir radene tilbake.
// Hvilke rader et PostgREST-filter i URL-en treffer. Stubben ma kunne
// dette: tjenesten leser tilbake med den SAMME avgrensningen den skrev
// med, og en stubb som svarer alt uansett filter ville vist en diff mot
// andre pubers rader — altsa vaert enig med en feil vi ikke har.
function treffer(url, rad) {
  const pub = url.match(/pub=eq\.([^&]*)/);
  if (pub && decodeURIComponent(pub[1]) !== rad.pub) return false;
  const ider = url.match(/kamp_id=in\.\(([^)]*)\)/);
  if (ider) {
    const lista = ider[1].split(",").map(decodeURIComponent);
    if (lista.indexOf(String(rad.kamp_id)) === -1) return false;
  }
  const foer = url.match(/dato=lt\.([^&]*)/);
  if (foer && !(String(rad.dato) < decodeURIComponent(foer[1]))) return false;
  return true;
}

// En liten tabell, ikke et fast svar. Tjenesten leser tilbake etter at
// den har skrevet — bade for a bevise at raden ligger der, og for a gi
// portalen hele lista for kampene. En stubb som svarer det samme foer og
// etter skrivingen kan ikke si noe om det.
//
// `skrivIngenting` er tilfellet der skrivepolicyen mangler: POST svarer
// pent, og ingenting blir lagret.
function stubVisninger(rader, status, skrivIngenting) {
  const kall = [];
  let tabell = (rader || []).map((r) => Object.assign({}, r));
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    const u = String(url);
    kall.push({ url: u, metode: o.method || "GET", opsjoner: o });
    if (status && status !== 200) {
      return new Response(JSON.stringify({ message: "nei", code: status === 503 ? "42P01" : "x" }),
        { status: status === 503 ? 400 : status });
    }
    if (o.method === "DELETE") {
      tabell = tabell.filter((r) => !treffer(u, r));
      return new Response(null, { status: 204 });
    }
    if (o.method === "POST") {
      const inn = JSON.parse(o.body);
      if (!skrivIngenting) tabell = tabell.concat(inn);
      return new Response(JSON.stringify(skrivIngenting ? [] : inn), { status: 201 });
    }
    return new Response(JSON.stringify(tabell.filter((r) => treffer(u, r))), { status: 200 });
  };
  return kall;
}

// Som stubVisninger, men den skiller de to tabellene fra hverandre:
// visninger og puber leses begge med GET, og en stubb som svarer det
// samme pa begge ville ikke vist at det er to kall.
function stubMedPubtabell(pubRader, pubFeiler) {
  const kall = [];
  // Visninger-tabellen er levende her ogsa: leser tjenesten tilbake etter
  // en skriving, ma den finne det den nettopp la inn.
  let tabell = [];
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    const u = String(url);
    kall.push({ url: u, metode: o.method || "GET", opsjoner: o });
    if (u.indexOf("/puber?") > -1) {
      if (pubFeiler) return new Response(JSON.stringify({ message: "nei" }), { status: 500 });
      return new Response(JSON.stringify(pubRader || []), { status: 200 });
    }
    if (o.method === "DELETE") {
      tabell = tabell.filter((r) => !treffer(u, r));
      return new Response(null, { status: 204 });
    }
    if (o.method === "POST") {
      tabell = tabell.concat(JSON.parse(o.body));
      return new Response(o.body, { status: 201 });
    }
    return new Response(JSON.stringify(tabell.filter((r) => treffer(u, r))), { status: 200 });
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

const ADMIN_KAMPER = [
  { id: 11, hjemme: "Brann", borte: "Bodo/Glimt", dato: "2126-09-13T15:00:00Z" },
  { id: 12, hjemme: "Molde", borte: "Rosenborg", dato: "2126-09-14T17:00:00Z" },
];

function lagre(ekstra) {
  return adminBe(Object.assign({
    passord: PASSORD, token: OKT_TOKEN, pub: "Carls",
    kampIder: ["2126-09-13-brann-bodoglimt"], kamper: ADMIN_KAMPER,
  }, ekstra || {}));
}

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
kall = stubVisninger([]);
r = await visninger(lagre());
const uoppsatt = await r.json();
ok("uten oppsett svarer portalen 503", r.status === 503, r.status);
ok("og sier hvilke variabler som mangler",
   uoppsatt.feil.indexOf("ADMIN_PASSORD") > -1 && uoppsatt.feil.indexOf("SUPABASE_URL") > -1,
   uoppsatt.feil);
ok("ingenting ble sendt noe sted", kall.length === 0, kall.length);

// Portalen sporr om oppsettet for den viser noe. Da star det der for
// kampene er krysset av, ikke etter.
r = await visninger(adminBe(null, "GET"));
const uklar = await r.json();
ok("GET sier fra at portalen ikke er klar", r.status === 200 && uklar.klar === false, r.status);
ok("og navngir alle tre", uklar.mangler.length === 3, JSON.stringify(uklar.mangler));

process.env.ADMIN_PASSORD = PASSORD;
process.env.SUPABASE_URL = "https://prosjekt.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-nokkel";

// GET henter ogsa lista: portalen trenger den for a krysse av det som
// alt star lagret. Fila i repoet gjorde den jobben for.
kall = stubVisninger([{ pub: "Carls", kamp_id: "2126-09-13-brann-bodoglimt",
  kamp: "Brann – Bodø/Glimt", dato: "2126-09-13T15:00:00Z", satt: "2026-09-11T10:00:00Z" }]);
r = await visninger(adminBe(null, "GET"));
const klar = await r.json();
ok("GET sier at portalen er klar", r.status === 200 && klar.klar === true, JSON.stringify(klar));
ok("og gir lista som alt star lagret",
   klar.visninger.length === 1 && klar.visninger[0].kampId === "2126-09-13-brann-bodoglimt",
   JSON.stringify(klar.visninger));

r = await visninger(adminBe(null, "PUT"));
ok("andre metoder avvises", r.status === 405, r.status);

kall = stubVisninger([]);
r = await visninger(adminBe({ handling: "sjekk", passord: "feil" }));
ok("feil passord slipper ikke inn", r.status === 401, r.status);
ok("og nar aldri Supabase", kall.length === 0, kall.length);
r = await visninger(adminBe({ handling: "sjekk", passord: PASSORD }));
ok("riktig passord apner portalen", r.status === 200 && (await r.json()).ok === true, r.status);
ok("og sjekken skriver ingenting", kall.length === 0, kall.length);

kall = stubVisninger([]);
r = await visninger(lagre({ passord: "feil" }));
ok("en lagring med feil passord avvises", r.status === 401, r.status);
ok("og den nar heller ikke Supabase", kall.length === 0, kall.length);

// Uten okt er det ingenting a skrive med, og da skal det sta hvorfor —
// ikke 401 pa noe som ser ut som passordet.
kall = stubVisninger([]);
r = await visninger(lagre({ token: "" }));
const utenOkt = await r.json();
ok("uten okt avvises lagringen", r.status === 401, r.status);
ok("og meldinga ber deg logge inn i appen",
   utenOkt.feil.indexOf("Logg inn i appen") > -1, utenOkt.feil);
ok("uten a rore Supabase", kall.length === 0, kall.length);

kall = stubVisninger([]);
r = await visninger(lagre({ pub: "Utepils AS" }));
ok("en pub som ikke star i publista avvises", r.status === 400, r.status);

// Et sted admin la inn i editoren i dag star ikke i fila (#80). «Ukjent
// pub» ma sporre den sammensatte lista — ellers ville en lagring pa et
// sted som star i velgeren, blitt avvist med en melding ingen forstar.
kall = stubMedPubtabell([{ nokkel: "utepils as", navn: "Utepils AS",
  bydel: "Sentrum", adresse: "Storgata 1", lat: 59.913, lon: 10.74,
  type: "pub", lag: [], kilde: "https://utepils.no/", sikkerhet: "bekreftet",
  sjekket: "2026-09-16", fjernet: false }]);
r = await visninger(lagre({ pub: "Utepils AS" }));
ok("men et sted som bare star i basen slipper gjennom", r.status === 200, r.status);
// Med ?. og ikke uten: en test som kaster, river hele suiten med seg, og
// da star alt etter den ukjort. Gront pa en test som aldri kjorte er
// verre enn rodt — og en test som drepte de neste to hundre er verst.
const pubOppslag = kall.find((k) => k.url.indexOf("/puber?") > -1);
ok("og publista leses uten okt, som alt annet som kan leses uten konto",
   !!pubOppslag && !pubOppslag.opsjoner.headers["Authorization"],
   JSON.stringify(pubOppslag && pubOppslag.opsjoner.headers));

// Svikter oppslaget, star fila alene. Da er det verste som skjer at et
// sted lagt inn i dag ikke kan velges enda — bedre enn at ingen kan lagre.
kall = stubMedPubtabell(null, true);
r = await visninger(lagre());
ok("en pub fra fila lagres selv om publista ikke svarer", r.status === 200, r.status);

kall = stubVisninger([]);
r = await visninger(lagre());
const lagret = await r.json();
ok("en lagring svarer 200", r.status === 200 && lagret.ok === true, r.status + " " + JSON.stringify(lagret));
ok("svaret sier hva som ble lagret",
   lagret.pub === "Carls" && lagret.valgt === 1, JSON.stringify(lagret));

// Okten gar som Bearer, anon-nokkelen som apikey. Databasen setter
// satt_av fra okten — sender funksjonen den selv, kan en feil her skrive
// i en annens navn.
const skriv = kall.find((k) => k.metode === "POST");
ok("skrivingen gar med admins egen okt",
   skriv.opsjoner.headers["Authorization"] === "Bearer " + OKT_TOKEN,
   skriv.opsjoner.headers["Authorization"]);
ok("og med anon-nokkelen som apikey",
   skriv.opsjoner.headers["apikey"] === "anon-nokkel");
ok("raden sender aldri satt_av",
   JSON.parse(skriv.opsjoner.body).every((v) => !("satt_av" in v)), skriv.opsjoner.body);
ok("adminpassordet nar aldri Supabase",
   kall.every((k) => (k.opsjoner.body || "").indexOf(PASSORD) === -1
     && JSON.stringify(k.opsjoner.headers || {}).indexOf(PASSORD) === -1));
ok("passordet lekker heller ikke ut til portalen",
   JSON.stringify(lagret).indexOf(PASSORD) === -1);

// Ingenting ble fjernet her, sa ingenting skal slettes. Vi slettet alle
// radene og skrev dem pa nytt for; da fikk rader som ikke var endret nytt
// `satt` og ny `satt_av`. Meldt 18. september 2026.
const slettinger = kall.filter((k) => k.metode === "DELETE"
  && k.url.indexOf("dato=lt.") === -1);
ok("en ren tilfoyelse sletter ingenting",
   slettinger.length === 0, slettinger.map((k) => k.url).join(" | "));
// Lest for skrevet: uten a vite hva som la der, kan ingen regne ut hva
// som faktisk endrer seg.
ok("tjenesten leser hva som ligger der for den skriver",
   kall.indexOf(kall.find((k) => k.metode === "GET"
     && k.url.indexOf("/visninger?") > -1)) < kall.indexOf(skriv),
   kall.map((k) => k.metode).join(","));
ok("og leser tilbake etterpa, som bevis pa at raden ligger der",
   kall.filter((k) => k.metode === "GET" && k.url.indexOf("/visninger?") > -1).length === 2,
   kall.map((k) => k.metode + " " + k.url.split("?")[0]).join(" | "));
ok("kvitteringen sier hva som faktisk skjedde",
   lagret.lagtTil === 1 && lagret.fjernet === 0 && lagret.uendret === 0 &&
   lagret.merknad.indexOf("La til 1 kamp") === 0, JSON.stringify(lagret));

/* ---- bare det som endrer seg skrives (meldt 18. september 2026) ---- */

// «Jeg kommer inn, fem kamper er markert, jeg legger til én, og da star
// det 6 lagret. Egentlig sa lagrer bruker 1 da.»
const STOD_FRA_FOR = [
  { pub: "Carls", kamp_id: "2126-09-13-brann-bodoglimt", kamp: "Brann – Bodo/Glimt",
    dato: "2126-09-13T17:00:00+00:00", satt: "2026-09-01T10:00:00Z" },
];
kall = stubVisninger(STOD_FRA_FOR);
r = await visninger(lagre());
const lagtTil = await r.json();
ok("en kamp som alt sto der skrives ikke pa nytt",
   lagtTil.lagtTil === 0 && lagtTil.uendret === 1, JSON.stringify(lagtTil));
ok("og ingen POST gar ut nar ingenting er nytt",
   kall.filter((k) => k.metode === "POST").length === 0,
   kall.map((k) => k.metode).join(","));
// Det er dette som var den stille feilen: `satt` ble overskrevet pa rader
// ingen hadde rort, sa feltet sa «sist noen trykket lagre» framfor «nar
// kampen ble satt» — og i den siste admins navn.
ok("og `satt` star urort pa raden som ikke ble endret",
   lagtTil.visninger[0].satt === "2026-09-01T10:00:00Z",
   JSON.stringify(lagtTil.visninger[0]));
ok("kvitteringen sier at ingenting var endret",
   lagtTil.merknad.indexOf("Ingenting var endret") === 0, lagtTil.merknad);

// Fjerning: bare den ene raden, og bare for denne puben.
const TO_STO = STOD_FRA_FOR.concat([
  { pub: "Carls", kamp_id: "2126-09-14-molde-rosenborg", kamp: "Molde – Rosenborg",
    dato: "2126-09-14T17:00:00+00:00", satt: "2026-09-01T10:00:00Z" },
  // En annen pub, samme kamp. Den skal ikke rores.
  { pub: "Utepils AS", kamp_id: "2126-09-14-molde-rosenborg", kamp: "Molde – Rosenborg",
    dato: "2126-09-14T17:00:00+00:00", satt: "2026-09-01T10:00:00Z" },
]);
kall = stubVisninger(TO_STO);
r = await visninger(lagre());
const fjernet = await r.json();
ok("den som ble tatt bort slettes",
   fjernet.fjernet === 1 && fjernet.uendret === 1 && fjernet.lagtTil === 0,
   JSON.stringify(fjernet));
const enSletting = kall.filter((k) => k.metode === "DELETE"
  && k.url.indexOf("dato=lt.") === -1);
ok("og slettingen navngir bare den ene kampen",
   enSletting.length === 1 &&
   enSletting[0].url.indexOf("2126-09-14-molde-rosenborg") > -1 &&
   enSletting[0].url.indexOf("2126-09-13-brann-bodoglimt") === -1,
   enSletting.map((k) => k.url).join(" | "));
ok("og bare for denne puben",
   enSletting[0].url.indexOf("pub=eq.Carls") > -1, enSletting[0].url);
// En annen pubs rad pa den samme kampen skal sta igjen. Det var dette
// avgrensningen alltid har handlet om.
ok("en annen pub sin rad pa samme kamp star igjen",
   fjernet.visninger.every((v) => v.pub === "Carls") &&
   fjernet.visninger.length === 1, JSON.stringify(fjernet.visninger));
ok("kvitteringen sier bade hva som gikk og hva som sto",
   fjernet.merknad.indexOf("fjernet 1 kamp") > -1 &&
   fjernet.merknad.indexOf("1 kamp sto fra før") > -1, fjernet.merknad);

// En skriving som svarer 200 er ikke bevis pa at raden ligger der. Samme
// lekse som kampsvar: mangler skrivepolicyen, ser svaret vellykket ut
// mens ingenting ble lagret.
kall = stubVisninger([], 200, true);
r = await visninger(lagre());
const tomt = await r.json();
ok("et tomt svar pa skrivingen meldes som feil", r.status === 502, r.status);
ok("og peker pa lista over skrivere",
   tomt.feil.indexOf("visning_skrivere") > -1, tomt.feil);

kall = stubVisninger([], 503);
r = await visninger(lagre());
const visningTabell = await r.json();
ok("mangler tabellen, star det hva som mangler",
   r.status === 503 && visningTabell.feil.indexOf("visninger") > -1, visningTabell.feil);

kall = stubVisninger([], 403);
r = await visninger(lagre());
const nektet = await r.json();
ok("nekter databasen skrivingen, sies det med ord",
   r.status === 401 && nektet.feil.indexOf("visning_skrivere") > -1, nektet.feil);

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

/* ---------------- steder lesere sender inn (#80) ---------------- */

// En ko, ikke lista. Innsendingen gar med leserens egen okt; koen leses
// med ADMIN_PASSORD **og** en okt som star i visning_skrivere.

const FORSLAG_OKT = "lesers-okt-token";

function stubForslag(rader, status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    kall.push({ url: String(url), metode: o.method || "GET", opsjoner: o });
    if (status && status !== 200) {
      return new Response(JSON.stringify({ message: "nei", code: status === 503 ? "42P01" : "x" }),
        { status: status === 503 ? 400 : status });
    }
    if (o.method === "POST" || o.method === "PATCH") {
      return new Response(JSON.stringify(rader === undefined
        ? [{ id: "11111111-2222-3333-4444-555555555555", navn: "Bar Boca",
             adresse: "Storgata 1", viser_fotball: true, status: "ny" }]
        : rader), { status: 201 });
    }
    return new Response(JSON.stringify(rader || []), { status: 200 });
  };
  return kall;
}

function forslagBe(kropp) {
  return new Request("https://mvp-sb.netlify.app/api/pub-forslag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kropp),
  });
}

const ET_FORSLAG = { token: FORSLAG_OKT, navn: "Bar Boca", adresse: "Storgata 1",
  viserFotball: true };

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
kall = stubForslag();
r = await pubForslag(forslagBe(ET_FORSLAG));
ok("uten oppsett svarer innsendingen 503", r.status === 503, r.status);
ok("og ingenting ble sendt noe sted", kall.length === 0, kall.length);

process.env.ADMIN_PASSORD = PASSORD;
process.env.SUPABASE_URL = "https://prosjekt.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-nokkel";

// Uten okt er det ingenting a skrive med, og da skal det sta hvorfor.
kall = stubForslag();
r = await pubForslag(forslagBe(Object.assign({}, ET_FORSLAG, { token: "" })));
const utenInnlogging = await r.json();
ok("uten innlogging avvises innsendingen", r.status === 401, r.status);
ok("og meldinga ber deg logge inn",
   utenInnlogging.feil.indexOf("Logg inn") > -1, utenInnlogging.feil);
ok("uten a rore Supabase", kall.length === 0, kall.length);

// Samme sjekk som appen gjor, fra den samme fila.
kall = stubForslag();
r = await pubForslag(forslagBe(Object.assign({}, ET_FORSLAG, { adresse: "" })));
ok("uten adresse avvises forslaget", r.status === 400, r.status);
ok("og det nar ikke basen", kall.length === 0, kall.length);

kall = stubForslag();
r = await pubForslag(forslagBe(ET_FORSLAG));
const sendt = await r.json();
ok("et fullt forslag lagres", r.status === 200 && sendt.ok === true,
   r.status + " " + JSON.stringify(sendt));
ok("svaret sier at noen skal se pa det",
   sendt.merknad.indexOf("sjekket adressen") > -1, sendt.merknad);
const skrivKall = kall.find((k) => k.metode === "POST");
ok("skrivingen gar med leserens egen okt",
   skrivKall.opsjoner.headers["Authorization"] === "Bearer " + FORSLAG_OKT,
   skrivKall.opsjoner.headers["Authorization"]);
ok("og raden sender aldri foreslatt_av eller status",
   !("foreslatt_av" in JSON.parse(skrivKall.opsjoner.body))
   && !("status" in JSON.parse(skrivKall.opsjoner.body)), skrivKall.opsjoner.body);

// En skriving som svarer 200 er ikke bevis pa at raden ligger der.
kall = stubForslag([]);
r = await pubForslag(forslagBe(ET_FORSLAG));
ok("et tomt svar pa skrivingen meldes som feil", r.status === 502, r.status);

// Koen: passordet forst, og det nar aldri Supabase nar det er feil.
kall = stubForslag();
r = await pubForslag(forslagBe({ handling: "liste", passord: "feil", token: FORSLAG_OKT }));
ok("feil passord slipper ikke inn i koen", r.status === 401, r.status);
ok("og nar aldri Supabase", kall.length === 0, kall.length);

kall = stubForslag();
r = await pubForslag(forslagBe({ handling: "liste", passord: PASSORD, token: "" }));
ok("riktig passord uten okt slipper heller ikke inn", r.status === 401, r.status);
ok("og nar heller ikke Supabase", kall.length === 0, kall.length);

kall = stubForslag([{ id: "11111111-2222-3333-4444-555555555555", navn: "Bar Boca",
  adresse: "Storgata 1", viser_fotball: true, foreslatt: "2026-09-15T08:00:00Z", status: "ny" }]);
r = await pubForslag(forslagBe({ handling: "liste", passord: PASSORD, token: FORSLAG_OKT }));
const koen = await r.json();
ok("koen leses med bade passord og okt",
   r.status === 200 && koen.forslag.length === 1, r.status + " " + JSON.stringify(koen));
ok("og den leses med admins egen okt",
   kall[0].opsjoner.headers["Authorization"] === "Bearer " + FORSLAG_OKT);
ok("adminpassordet nar aldri Supabase",
   kall.every((k) => JSON.stringify(k.opsjoner).indexOf(PASSORD) === -1));

// Id-en gar inn i en adresse, sa den sjekkes mot formen en uuid har.
kall = stubForslag();
r = await pubForslag(forslagBe({ handling: "behandle", passord: PASSORD,
  token: FORSLAG_OKT, id: "ikke-en-uuid", status: "avvist" }));
ok("en id som ikke er en uuid avvises", r.status === 400, r.status);
ok("og den nar ikke basen", kall.length === 0, kall.length);

// «ny» er default i basen. A sette den herfra ville vaert a melde noe
// ubehandlet som behandlet, og det er ingen gyldig handling.
kall = stubForslag();
r = await pubForslag(forslagBe({ handling: "behandle", passord: PASSORD,
  token: FORSLAG_OKT, id: "11111111-2222-3333-4444-555555555555", status: "ny" }));
ok("status ny kan ikke settes herfra", r.status === 400, r.status);

kall = stubForslag([{ id: "11111111-2222-3333-4444-555555555555", navn: "Bar Boca",
  adresse: "Storgata 1", status: "lagt-inn" }]);
r = await pubForslag(forslagBe({ handling: "behandle", passord: PASSORD,
  token: FORSLAG_OKT, id: "11111111-2222-3333-4444-555555555555", status: "lagt-inn" }));
ok("et forslag kan merkes som lagt inn",
   r.status === 200 && (await r.json()).ok === true, r.status);
ok("og det gar som PATCH pa den ene id-en",
   kall[0].metode === "PATCH" && kall[0].url.indexOf("id=eq.11111111") > -1, kall[0].url);

kall = stubForslag([], 503);
r = await pubForslag(forslagBe(ET_FORSLAG));
const utenForslagTabell = await r.json();
ok("mangler tabellen, star det hva som mangler",
   r.status === 503 && utenForslagTabell.feil.indexOf("pub_forslag") > -1,
   utenForslagTabell.feil);

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

/* ---------------- innlogging ---------------- */

// Kallet mot Supabase gar fra funksjonen, ikke fra nettleseren: nokkelen
// skal aldri na leseren, og appen skal bare snakke med sitt eget domene.
// visningRader er eget: /api/svar sporr bade kampsvar og visninger i
// samme kall (#79), og en stubb som svarte likt pa begge kunne ikke se
// forskjell pa dem — da hadde testen bevist noe annet enn den trodde.
function stubSupabase(svar, status, visningRader) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    kall.push({ url: String(url), opsjoner: opsjoner || {} });
    if (String(url).indexOf("/visninger") > -1) {
      return new Response(JSON.stringify(visningRader || []), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
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

// Egen stubb for brukerlista. Den generelle gir det samme svaret pa hvert
// kall, og da ville okt-oppslaget fatt brukerlista tilbake som «okter» —
// en stubb som er enig med koden uansett hva den gjor. Her svarer de to
// endepunktene hver for seg, som hos Supabase.
function stubBrukere(brukerRader, oktRader, utfall) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    const u = String(url);
    kall.push({ url: u, opsjoner: opsjoner || {} });
    if (u.indexOf("/rest/v1/rpc/sist_inne") > -1) {
      if (utfall === "okt-nede") {
        return new Response(JSON.stringify({ message: "nei" }), { status: 500 });
      }
      return new Response(JSON.stringify(oktRader || []), { status: 200 });
    }
    return new Response(JSON.stringify(brukerRader || []), { status: 200 });
  };
  return kall;
}

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

/* ---- «sist inne» kommer fra oktene, ikke fra PIN-datoen (ADR 0021) ---- */

// last_sign_in_at er sist noen TASTET PIN-en. En fornyet okt rorer ikke
// feltet, sa en som er innom hver dag kan sta med en dato uker tilbake.
// Meldt to dager pa rad. sessions.refreshed_at er det som beveger seg.
const TO_BRUKERE = [
  { id: BRUKER_ID, email: "ola@pin.mvp-sb.netlify.app",
    user_metadata: { navn: "Ola" },
    created_at: "2026-09-01T10:00:00Z", last_sign_in_at: "2026-09-16T10:00:00Z" },
  { id: "22222222-3333-4444-5555-666666666666", email: "kari@pin.mvp-sb.netlify.app",
    user_metadata: { navn: "Kari" },
    created_at: "2026-08-01T10:00:00Z", last_sign_in_at: "2026-09-14T15:14:27Z" },
];
// Kari tastet PIN-en for Ola, men har appen i gang na. Det er nettopp den
// rekkefolgen den gamle kolonnen fikk feil.
const OKTER = [
  { bruker: "22222222-3333-4444-5555-666666666666", sist_aktiv: "2026-09-17T21:04:29Z" },
];

kall = stubBrukere(TO_BRUKERE, OKTER);
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "liste" }));
const medOkter = await r.json();
ok("oktene hentes fra sist_inne",
   kall.some((k) => k.url.indexOf("/rest/v1/rpc/sist_inne") > -1),
   JSON.stringify(kall.map((k) => k.url)));
ok("og med service-nokkelen, som er den eneste som far",
   kall.filter((k) => k.url.indexOf("sist_inne") > -1)[0]
     .opsjoner.headers.Authorization === "Bearer " + SVC);
ok("okta havner pa riktig bruker",
   medOkter.brukere[0].navn === "Kari" &&
   medOkter.brukere[0].aktiv === "2026-09-17T21:04:29Z",
   JSON.stringify(medOkter.brukere[0]));
// Den uten okt star nederst, og `aktiv` er tom — ikke PIN-datoen. To ulike
// ting i samme felt er nettopp feilen vi kom fra.
ok("den uten okt star nederst med tom aktiv",
   medOkter.brukere[1].navn === "Ola" && medOkter.brukere[1].aktiv === "",
   JSON.stringify(medOkter.brukere[1]));
// PIN-datoen blir staende: den trengs nar noen har glemt PIN-en.
ok("PIN-datoen folger fortsatt med",
   medOkter.brukere[0].sist === "2026-09-14T15:14:27Z" &&
   medOkter.brukere[1].sist === "2026-09-16T10:00:00Z",
   JSON.stringify(medOkter.brukere.map((b) => b.sist)));
ok("og rekkefolgen er oktene, ikke PIN-datoen",
   medOkter.brukere.map((b) => b.navn).join(",") === "Kari,Ola",
   medOkter.brukere.map((b) => b.navn).join(","));
ok("uten oktfeil nar alt gikk bra", medOkter.oktfeil === undefined,
   JSON.stringify(medOkter.oktfeil));

// Oktene er et TILLEGG. Feiler de, skal lista sta — men en tom kolonne er
// ikke til a skille fra «ingen har vaert inne», sa det ma sies.
kall = stubBrukere(TO_BRUKERE, null, "okt-nede");
r = await brukere(brukerBe({ passord: "riktig-passord", handling: "liste" }));
const utenOkter = await r.json();
ok("et feilet oktkall velter ikke brukerlista",
   r.status === 200 && utenOkter.brukere.length === 2, r.status);
ok("men det star at kolonnen mangler",
   String(utenOkter.oktfeil || "").indexOf("Sist inne") > -1, utenOkter.oktfeil);
ok("og tjenestens egne ord folger med",
   Array.isArray(utenOkter.forsok) && utenOkter.forsok.length > 0,
   JSON.stringify(utenOkter.forsok));
ok("ingen far en aktiv-dato de ikke har",
   utenOkter.brukere.every((b) => b.aktiv === ""),
   JSON.stringify(utenOkter.brukere.map((b) => b.aktiv)));
// Nokkelen skal aldri ut, heller ikke i oktfeilen.
ok("service-nokkelen star ikke i feilsvaret",
   JSON.stringify(utenOkter).indexOf(SVC) === -1);
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

kall = stubSupabase(SVAR_RADER, 200, [
  { pub: "Carls", kamp_id: 8, kamp: "A – B", dato: "2126-09-13T15:00:00Z",
    satt: "2026-09-11T10:00:00Z" },
]);
r = await svarfunksjon(svarBe(null, "GET", "/api/svar?kamper=7,8"));
const svarLista = await r.json();
// Ett kall fra leseren. Funksjonen gjor to sporringer mot basen —
// «hvem blir med» og «hvem viser kampen» — men samtidig, og pa de samme
// id-ene. Visningene la i visninger.js og kostet null nettkall til
// 15. september 2026; a gi dem et eget endepunkt ville lagt et kall til
// per fotballvisning, og denne sporringen ber alt om nettopp de kampene.
ok("hele runden hentes i ett kall fra leseren", kall.length === 2, kall.length);
ok("og begge sporringene har de samme kampene i ett filter",
   kall.every((k) => k.url.indexOf("kamp_id=in.(7,8)") > -1),
   kall.map((k) => k.url).join(" | "));
ok("den ene er hvem som blir med, den andre hvem som viser",
   kall.some((k) => k.url.indexOf("/kampsvar") > -1) &&
   kall.some((k) => k.url.indexOf("/visninger") > -1),
   kall.map((k) => k.url).join(" | "));
ok("visningene folger med i svaret",
   svarLista.visninger.length === 1 && svarLista.visninger[0].pub === "Carls",
   JSON.stringify(svarLista.visninger));
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

/* ---------------- /api/pub-liste: stedene admin retter (#80) ------------ */

// Fila er grunnfjellet. Funksjonen svarer med rettelsene *alene*, ikke med
// en ferdig liste — et svar som var hele lista ville gjort funksjonen til
// det skjoreste leddet i noe som i dag ikke kan ryke.

const STED_OKT = "admins-okt-token";
const EN_RAD = {
  nokkel: "andys pub", navn: "Andy\u0027s Pub", bydel: "Sentrum",
  adresse: "Stortingsgata 8", lat: 59.9135, lon: 10.734, type: "sportsbar",
  lag: [], kilde: "https://www.andyspub.no/", sikkerhet: "bekreftet",
  sjekket: "2026-09-16", merknad: null, fjernet: false,
};
const ET_STED = {
  navn: "Andy\u0027s Pub", bydel: "Sentrum", adresse: "Stortingsgata 8",
  lat: 59.9135, lon: 10.734, type: "sportsbar", lag: [],
  kilde: "https://www.andyspub.no/", sikkerhet: "bekreftet", sjekket: "2026-09-16",
};

function stubSteder(rader, status) {
  const kall = [];
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    kall.push({ url: String(url), metode: o.method || "GET", opsjoner: o });
    if (String(url).indexOf("overpass") > -1) {
      return new Response(JSON.stringify({ elements: [
        { type: "node", lat: 59.9135, lon: 10.734,
          tags: { name: "Andy\u0027s Pub", amenity: "bar" } },
      ] }), { status: 200 });
    }
    if (status && status !== 200) {
      return new Response(JSON.stringify({ message: "nei", code: status === 503 ? "42P01" : "x" }),
        { status: status === 503 ? 400 : status });
    }
    return new Response(JSON.stringify(rader === undefined ? [EN_RAD] : rader),
      { status: o.method === "POST" ? 201 : 200 });
  };
  return kall;
}

// Egen stubb for Overpass. Den modellerer svaret Overpass gir — et hus
// uten `name`, med addr-taggene — ikke koden som leser det. Stubben over
// gir alltid en navngitt pub, og en pub er akkurat det adressesoket IKKE
// finner: hadde vi brukt den, ville testen vaert enig med feilen.
function stubOverpass(elementer, utfall) {
  const kall = [];
  // Ett feilobjekt, delt av alle kallene. Det er ikke en forenkling — det
  // er slik en AbortController faktisk avviser: signalets `reason` er ett
  // objekt, og hvert eneste fetch avvises med nettopp det. Stubben
  // modellerer svaret, ikke koden som leser det.
  const enDeltAbort = Object.assign(new Error("This operation was aborted"),
    { name: "AbortError" });
  global.fetch = async (url, opsjoner) => {
    const o = opsjoner || {};
    kall.push({ url: String(url), metode: o.method || "GET", opsjoner: o });
    if (String(url).indexOf("overpass") > -1) {
      if (utfall === "nede") return new Response("Gateway Timeout", { status: 504 });
      if (utfall === "kastet") throw new Error("fetch failed");
      if (utfall === "avbrutt") throw enDeltAbort;
      if (utfall === "feilside") {
        // Hele sida, ikke bare feillinja. Preamblet er poenget: det er
        // det som fyller de forste 80 tegnene, og som gjorde at admin sa
        // «<!DOCTYPE HTML PUBLIC …» der grunnen skulle statt. En kortere
        // stubb ville overlevd nettopp den feilen.
        return new Response('<?xml version="1.0" encoding="UTF-8"?>\n'
          + '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"'
          + ' "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
          + '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">\n'
          + "<head><title>OSM3S Response</title></head>\n<body>\n"
          + "<p>The data included in this document is from www.openstreetmap.org."
          + " The data is made available under ODbL.</p>\n"
          + '<p><strong style="color:#FF0000">Error</strong>: line 1: parse error:'
          + ' Unknown type "(?=" </p>\n</body>\n</html>', { status: 400 });
      }
      return new Response(JSON.stringify({ elements: elementer || [] }), { status: 200 });
    }
    return new Response(JSON.stringify([EN_RAD]), { status: 200 });
  };
  return kall;
}

function stedBe(kropp) {
  return new Request("https://mvp-sb.netlify.app/api/pub-liste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kropp),
  });
}

function stedGet() {
  return new Request("https://mvp-sb.netlify.app/api/pub-liste");
}

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

// Uten oppsett: tom liste, ikke feil. Da star fila alene, som for — og det
// er noyaktig den egenskapen ved fila som er verdt mest.
kall = stubSteder();
r = await pubListe(stedGet());
let stedSvar = await r.json();
ok("uten oppsett svarer lesingen 200 med tom liste",
   r.status === 200 && stedSvar.puber.length === 0 && stedSvar.klar === false,
   r.status + " " + JSON.stringify(stedSvar));
ok("og ingenting ble sporret", kall.length === 0, kall.length);

process.env.ADMIN_PASSORD = PASSORD;
process.env.SUPABASE_URL = "https://prosjekt.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-nokkel";

kall = stubSteder();
r = await pubListe(stedGet());
stedSvar = await r.json();
ok("lesingen gir rettelsene, ikke en ferdig liste",
   r.status === 200 && stedSvar.puber.length === 1 &&
   stedSvar.puber[0].navn === "Andy\u0027s Pub", JSON.stringify(stedSvar));
// Ingenting i appen er last bak innlogging, og lista er det appen viser.
ok("og den leses uten okt",
   !kall[0].opsjoner.headers["Authorization"], JSON.stringify(kall[0].opsjoner.headers));
ok("lesingen caches i kanten, kort",
   /s-maxage=120/.test(r.headers.get("Netlify-CDN-Cache-Control") || "") &&
   /durable/.test(r.headers.get("Netlify-CDN-Cache-Control") || ""),
   r.headers.get("Netlify-CDN-Cache-Control"));

// Feilsvar caches aldri: ellers laser et blaff seg fast i kanten.
kall = stubSteder(null, 500);
r = await pubListe(stedGet());
stedSvar = await r.json();
ok("en feil mot basen gir tom liste og en forklaring",
   r.status === 200 && stedSvar.puber.length === 0 && !!stedSvar.feil,
   JSON.stringify(stedSvar));
ok("og den caches aldri",
   (r.headers.get("Cache-Control") || "").indexOf("no-store") > -1,
   r.headers.get("Cache-Control"));

// Passordet forst, og det nar aldri Supabase nar det er feil.
kall = stubSteder();
r = await pubListe(stedBe({ passord: "feil", token: STED_OKT, pub: ET_STED }));
ok("feil passord lagrer ingenting", r.status === 401, r.status);
ok("og nar aldri Supabase", kall.length === 0, kall.length);

// Passordet er doren til skjemaet. Skrivingen er databasens.
kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: "", pub: ET_STED }));
stedSvar = await r.json();
ok("riktig passord uten okt lagrer heller ingenting", r.status === 401, r.status);
ok("og meldinga sier at okten er det som mangler",
   stedSvar.feil.indexOf("din egen økt") > -1, stedSvar.feil);
ok("og heller ikke det nar Supabase", kall.length === 0, kall.length);

// Kilde og dato er ikke pynt. Samme sjekk som appen gjor, fra samme fil.
kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT,
  pub: Object.assign({}, ET_STED, { kilde: "" }) }));
ok("en rad uten kilde avvises", r.status === 400, r.status);
ok("og den nar ikke basen", kall.length === 0, kall.length);

kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT,
  pub: Object.assign({}, ET_STED, { sjekket: "" }) }));
ok("en rad uten dato avvises ogsa", r.status === 400, r.status);

// Kilden er en lenke ELLER en setning. Den matte vaere en URL til
// 16. september 2026, og det stengte ute den lille puben uten nettside.
kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT,
  pub: Object.assign({}, ET_STED,
    { kilde: "Var innom 16.09.2026, storskjerm i baren" }) }));
ok("men en setning som kilde slipper gjennom", r.status === 200, r.status);
const setningSkriv = kall.find((k) => k.metode === "POST");
ok("og setningen star i raden som lagres",
   !!setningSkriv &&
   JSON.parse(setningSkriv.opsjoner.body)[0].kilde.indexOf("storskjerm") > -1,
   setningSkriv && setningSkriv.opsjoner.body);

// Et ikke-svar er fortsatt et ikke-svar.
kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT,
  pub: Object.assign({}, ET_STED, { kilde: "ok" }) }));
stedSvar = await r.json();
ok("en kilde som ikke sier noe avvises", r.status === 400, r.status);
ok("og meldinga sier hva som mangler",
   stedSvar.feil.indexOf("hvordan vi vet det") > -1, stedSvar.feil);
ok("uten a na basen", kall.length === 0, kall.length);

kall = stubSteder();
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT, pub: ET_STED }));
stedSvar = await r.json();
ok("en hel rad lagres", r.status === 200 && stedSvar.ok === true,
   r.status + " " + JSON.stringify(stedSvar));
let stedSkriv = kall.find((k) => k.metode === "POST");
ok("skrivingen gar med admins egen okt",
   stedSkriv.opsjoner.headers["Authorization"] === "Bearer " + STED_OKT,
   stedSkriv.opsjoner.headers["Authorization"]);
// Adminpassordet er vart. Supabase vet ikke hva det er, og skal ikke fa
// vite det heller.
ok("adminpassordet nar aldri Supabase",
   kall.every((k) => JSON.stringify(k.opsjoner).indexOf(PASSORD) === -1));
ok("og raden sender aldri endret_av eller endret",
   !("endret_av" in JSON.parse(stedSkriv.opsjoner.body)[0]) &&
   !("endret" in JSON.parse(stedSkriv.opsjoner.body)[0]), stedSkriv.opsjoner.body);
// Nokkelen er navnet foldet. Uten upsert pa den blir en rettelse en ny rad.
ok("skrivingen er en upsert pa nokkelen",
   stedSkriv.url.indexOf("on_conflict=nokkel") > -1 &&
   /merge-duplicates/.test(stedSkriv.opsjoner.headers["Prefer"] || ""),
   stedSkriv.url + " " + stedSkriv.opsjoner.headers["Prefer"]);
ok("og lagringen caches aldri",
   (r.headers.get("Cache-Control") || "").indexOf("no-store") > -1);

// En skriving som svarer 200 er ikke bevis pa at raden ligger der.
kall = stubSteder([]);
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT, pub: ET_STED }));
stedSvar = await r.json();
ok("et tomt svar pa skrivingen meldes som feil", r.status === 502, r.status);
ok("og meldinga peker pa visning_skrivere",
   stedSvar.feil.indexOf("visning_skrivere") > -1, stedSvar.feil);

// Et sted som la ned skal kunne tas ut. Raden i fila star; den skjules.
kall = stubSteder([Object.assign({}, EN_RAD, { fjernet: true })]);
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT,
  pub: { navn: "Andy\u0027s Pub", fjernet: true } }));
stedSvar = await r.json();
ok("en fjernet rad lagres med navnet alene", r.status === 200 && stedSvar.ok === true,
   r.status + " " + JSON.stringify(stedSvar));
ok("og svaret sier at fila star urort",
   stedSvar.merknad.indexOf("puber-oslo.js") > -1, stedSvar.merknad);

// Mangler tabellen, star det hva som mangler — og hvor SQL-en er.
kall = stubSteder(null, 503);
r = await pubListe(stedBe({ passord: PASSORD, token: STED_OKT, pub: ET_STED }));
stedSvar = await r.json();
ok("mangler tabellen, star det hvor SQL-en er",
   r.status === 503 && stedSvar.feil.indexOf("oppsett.sql") > -1, stedSvar.feil);

// Oppslaget i OpenStreetMap ligger bak passordet: Overpass ber om fair
// use, og et sok hvem som helst kunne kjort er et sok noen kjorer tusen
// ganger.
kall = stubSteder();
r = await pubListe(stedBe({ handling: "sok", passord: "feil", navn: "Andy" }));
ok("navnesoket ligger bak passordet", r.status === 401, r.status);
ok("og nar aldri Overpass", kall.length === 0, kall.length);

kall = stubSteder();
r = await pubListe(stedBe({ handling: "sok", passord: PASSORD, navn: "a" }));
ok("et navn uten noe a soke pa avvises", r.status === 400, r.status);
ok("og nar heller ikke Overpass", kall.length === 0, kall.length);

kall = stubSteder();
r = await pubListe(stedBe({ handling: "sok", passord: PASSORD, navn: "Andys Pub" }));
stedSvar = await r.json();
ok("et navnesok gir treff med koordinat",
   r.status === 200 && stedSvar.treff.length === 1 &&
   stedSvar.treff[0].lat === 59.9135, JSON.stringify(stedSvar));
ok("alle speilene sporres samtidig",
   kall.length === OVERPASS_SPEIL.length, kall.length);
ok("og svaret krediterer OpenStreetMap", stedSvar.kilde === "OpenStreetMap");

// Adressesoket. Navnesoket finner ikke et sted OSM ikke kjenner navnet pa,
// og det er de sma stedene — nettopp de admin ma foere inn for hand.
// Meldt 16. september 2026: «Berglyveien 4J», ingen vei til koordinatet.
const ET_HUS = [{ type: "node", lat: 59.8432, lon: 10.7988,
  tags: { "addr:street": "Berglyveien", "addr:housenumber": "4J" } }];

kall = stubOverpass(ET_HUS);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: "feil", adresse: "Berglyveien 4J" }));
ok("adressesoket ligger bak passordet", r.status === 401, r.status);
ok("og nar aldri Overpass", kall.length === 0, kall.length);

kall = stubOverpass(ET_HUS);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD, adresse: "4J" }));
ok("et husnummer uten gate avvises", r.status === 400, r.status);
ok("og nar heller ikke Overpass", kall.length === 0, kall.length);

kall = stubOverpass(ET_HUS);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
stedSvar = await r.json();
ok("et adressesok gir treff med koordinat",
   r.status === 200 && stedSvar.treff.length === 1 &&
   stedSvar.treff[0].lat === 59.8432, JSON.stringify(stedSvar));
// Huset har ingen `name`. Navnesoket kaster den raden; her er den svaret.
ok("huset uten navn overlever adressesoket",
   stedSvar.treff[0].navn === "Berglyveien 4J", JSON.stringify(stedSvar.treff[0]));
ok("og sporringen spurte pa begge adressetaggene",
   decodeURIComponent(kall[0].opsjoner.body).indexOf('"addr:housenumber"~"^4J$"') > -1,
   decodeURIComponent(kall[0].opsjoner.body));

// Uten husnummer kan en gate gi mange hus. Det er ikke soket som er
// darlig — det er sporsmalet, og det skal sies.
kall = stubOverpass(ET_HUS);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD, adresse: "Berglyveien" }));
stedSvar = await r.json();
ok("en gate uten nummer sier ifra om at soket er vidt",
   stedSvar.utenNummer === true, JSON.stringify(stedSvar));
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
ok("mens en full adresse ikke gjor det",
   (await r.json()).utenNummer === false);

// Det admin faktisk motte: alle fire speilene feilet. Meldinga sa «Fikk
// ikke svar fra OpenStreetMap» — uten et ord om hvem som svarte hva. Uten
// `forsok` er det umulig a vite om Overpass var nede eller om var egen
// frist lop ut, og den forskjellen er hele diagnosen.
kall = stubOverpass(null, "nede");
r = await pubListe(stedBe({ handling: "sok", passord: PASSORD, navn: "Andys Pub" }));
stedSvar = await r.json();
ok("alle speilene nede gir 502", r.status === 502, r.status);
ok("og meldinga peker pa utveiene som finnes",
   stedSvar.feil.indexOf("kartlenke") > -1, stedSvar.feil);
ok("svaret forklarer hvert speil for seg",
   stedSvar.forsok.length === OVERPASS_SPEIL.length, JSON.stringify(stedSvar.forsok));
ok("med tjenestens egen statuskode",
   stedSvar.forsok.every((f) => f.status === 504), JSON.stringify(stedSvar.forsok));
ok("og med navnet pa speilet som feilet",
   stedSvar.forsok.some((f) => f.kilde.indexOf("overpass-api.de") > -1),
   JSON.stringify(stedSvar.forsok));
// En nokkel eller en adresse i forsok-lista ville vaert en lekkasje: den
// leses av hvem som helst som apner portalen.
ok("forsok baerer ingen nokkel",
   JSON.stringify(stedSvar.forsok).indexOf(PASSORD) === -1,
   JSON.stringify(stedSvar.forsok));

// Kastet oppkobling, ikke en statuskode: da er `utfall` det eneste
// sporet, og det ma vaere med.
kall = stubOverpass(null, "kastet");
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
stedSvar = await r.json();
ok("en kastet oppkobling forklares ogsa",
   r.status === 502 && stedSvar.forsok.every((f) => f.utfall),
   JSON.stringify(stedSvar.forsok));

// Et tomt svar er ikke en feil: huset finnes bare ikke i OSM.
kall = stubOverpass([]);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
stedSvar = await r.json();
ok("ingen treff er 200 med tom liste, ikke en feil",
   r.status === 200 && stedSvar.treff.length === 0, r.status + " " + JSON.stringify(stedSvar));

// Meldt 17. september 2026: forsok-lista sto med fire linjer, men
// «overpass.private.coffee» to ganger — med samme tid pa begge — og
// «overpass.kumi.systems» ikke i det hele tatt.
//
// Arsaken: notatene ble hentet fra avvisningene, og en AbortController
// avviser ALLE kallene med det SAMME feilobjektet. `Object.assign(err,
// {notat})` skrev da over det forrige speilets notat, og det siste som
// kom vant — to ganger. En diagnostikk som forveksler to tjenere er
// verre enn ingen: den peker pa feil sted.
kall = stubOverpass(null, "avbrutt");
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
stedSvar = await r.json();
ok("hvert speil star i forsok-lista", stedSvar.forsok.length === OVERPASS_SPEIL.length,
   JSON.stringify(stedSvar.forsok));
const KILDER = stedSvar.forsok.map((f) => f.kilde);
ok("og ingen star der to ganger",
   new Set(KILDER).size === OVERPASS_SPEIL.length, KILDER.join(" | "));
ok("alle fire vertene er med, hver med sitt navn",
   OVERPASS_SPEIL.every((a) => KILDER.indexOf("Overpass " + new URL(a).host) > -1),
   KILDER.join(" | "));
// Rekkefolgen folger OVERPASS_SPEIL, ikke hvem som ble ferdig forst: en
// liste som stokker om seg selv er ikke til a sammenlikne mellom to sok.
ok("rekkefolgen folger speillista",
   KILDER.join("|") === OVERPASS_SPEIL.map((a) => "Overpass " + new URL(a).host).join("|"),
   KILDER.join(" | "));

// Feilsiden er HTML. De forste 80 tegnene er alltid doctypen — altsa det
// samme uansett hva som feilet. Grunnen star lenger nede.
kall = stubOverpass(null, "feilside");
r = await pubListe(stedBe({ handling: "sok", passord: PASSORD, navn: "Andys Pub" }));
stedSvar = await r.json();
ok("en feilside gir grunnen, ikke doctypen",
   stedSvar.forsok.every((f) => (f.melding || "").indexOf("parse error") > -1),
   JSON.stringify(stedSvar.forsok[0]));
ok("og doctypen star ikke i meldinga",
   JSON.stringify(stedSvar.forsok).indexOf("DOCTYPE") === -1,
   JSON.stringify(stedSvar.forsok[0]));
ok("statuskoden star ved siden av",
   stedSvar.forsok.every((f) => f.status === 400), JSON.stringify(stedSvar.forsok[0]));

// «application/json» ga 406 fra hovedtjeneren pa hvert eneste kall.
// Formatet bestemmes av sporringen, ikke av denne headeren.
kall = stubOverpass(ET_HUS);
r = await pubListe(stedBe({ handling: "sok-adresse", passord: PASSORD,
  adresse: "Berglyveien 4J" }));
ok("soket hevder ingenting om formatet i Accept",
   kall.every((k) => (k.opsjoner.headers || {})["Accept"] === "*/*"),
   JSON.stringify((kall[0].opsjoner.headers || {})));
ok("og identifiserer seg med User-Agent",
   kall.every((k) => ((k.opsjoner.headers || {})["User-Agent"] || "")
     .indexOf("sportsbibelen") === 0),
   JSON.stringify((kall[0].opsjoner.headers || {})));

// Fristen ma sta under Netlifys ti sekunder: sprenger vi den, far admin
// Netlifys egen feilside framfor var — uten et ord om hvem som sviktet,
// som er nettopp det forsok-lista finnes for.
ok("fristen holder seg innenfor det Netlify gir, med margin",
   SOK_FRIST <= SOK_TAK - 1000, SOK_FRIST + " mot " + SOK_TAK);

delete process.env.ADMIN_PASSORD;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;

/* ---------------- rapport ---------------- */

// Tallet telles, ikke skrives: en hardkodet sum kan sta stille mens
// tester legges til.
console.log("\n" + (kjort - feilet) + " av " + kjort + " funksjonstester passerte");
process.exit(feilet ? 1 : 0);
