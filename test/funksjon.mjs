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
ok("bare den forste runden er med", nes.kamper.length === 2, nes.kamper.length);
ok("lagnavn i kampene oversettes ogsa", nes.kamper[0].borte === "Bodø/Glimt", nes.kamper[0].borte);
ok("runden navngis i svaret", nes.runde === "Runde 21", nes.runde);

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
ok("bare forste runde er med", arets.kamper.length === 2 && arets.runde === "Runde 21",
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
ok("v2-svaret leses", r.status === 200 && v2.kilde === "TheSportsDB" && v2.kamper.length === 2,
   JSON.stringify([r.status, v2.kilde, v2.kamper && v2.kamper.length]));
ok("forsokene star i svaret, uten adresser",
   Array.isArray(v2.forsok) && v2.forsok.length === 1 && v2.forsok[0].status === 200 &&
   JSON.stringify(v2.forsok).indexOf("http") === -1, JSON.stringify(v2.forsok));

// Nokkelen er en v1-nokkel: v2 avviser den. Da proves v1 med nokkelen i
// adressen, og svaret forteller begge forsokene.
global.fetch = async (url, opsjoner) => {
  kall.push({ url: String(url), opsjoner: opsjoner || {} });
  const u = String(url);
  if (u.indexOf("/api/v2/") > -1) return new Response("{}", { status: 401 });
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

/* ---------------- rapport ---------------- */

const antall = 82;
console.log("\n" + (antall - feilet) + " av " + antall + " funksjonstester passerte");
process.exit(feilet ? 1 : 0);
