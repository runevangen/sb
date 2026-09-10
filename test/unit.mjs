#!/usr/bin/env node
// Enhetstester for de rene funksjonene i lib.js.
//
//   node test/unit.mjs
//
// Ingen nettleser. Disse dekker logikk som ikke rorer DOM, og kjorer pa
// millisekunder framfor de titalls sekundene nettlesertestene bruker.
// Alt som trenger DOM ligger i test/run.mjs.

import { safeUrl, videoUrl, postDate, timeAgo, feedSignature, internSlug,
         foldTekst, treffScore, rangerTreff, listeTekst } from "../lib.js";
import { LIGAER, ligaFor, sesongFor, tolkTabell, apiFeil, kallPerDogn, LEVETID,
         apiSti, tolkKamper, nesteRunde, tolkFotballHash, fotballHash,
         tilgjengeligSesong, SESONGVINDU, redaksjonsnavn, normaliserLagnavn,
         tsdbSti, tolkKamperTsdb, tolkTabellTsdb, tsdbSesong, delingstekst, tidstekst, HVOR }
  from "../fotball-data.js";

import { ARENAER, arenaFor, vaerSti, foltTemp, tolkVarsel, klerad, vaertekst }
  from "../vaer-data.js";

let feilet = 0;

function ok(navn, betingelse, detalj) {
  if (betingelse) {
    console.log("  ok   " + navn);
  } else {
    feilet++;
    console.log("  FEIL " + navn + (detalj !== undefined ? "  (fikk: " + detalj + ")" : ""));
  }
}

const BASE = "https://mvp-sb.netlify.app/";

/* ---------------- safeUrl ---------------- */

ok("https slipper gjennom",
   safeUrl("https://sportsbibelen.no/bilde.jpg", BASE) === "https://sportsbibelen.no/bilde.jpg");
ok("http slipper gjennom",
   safeUrl("http://sportsbibelen.no/a", BASE) === "http://sportsbibelen.no/a");
ok("javascript: blokkeres", safeUrl("javascript:alert(1)", BASE) === null);
ok("data: blokkeres", safeUrl("data:text/html,<script>", BASE) === null);
ok("relativ sti loses mot grunnadressen",
   safeUrl("bilde.jpg", BASE) === "https://mvp-sb.netlify.app/bilde.jpg");
ok("tom verdi gir null", safeUrl("", BASE) === null && safeUrl(null, BASE) === null);
// safeUrl skal stoppe farlige protokoller, ikke validere at en sti gir
// mening. "://" loser seg til en ufarlig sti pa eget domene, og det er
// riktig oppforsel - den forste versjonen av denne testen antok null.
ok("soppel kaster ikke, og blir pa http(s)",
   safeUrl("://", BASE).indexOf("https://") === 0, safeUrl("://", BASE));
ok("javascript: blokkeres ogsa med innledende mellomrom",
   safeUrl("  javascript:alert(1)", BASE) === null);
ok("protokollrelativ URL beholdes som https",
   safeUrl("//example.no/x", BASE) === "https://example.no/x");

/* ---------------- videoUrl ---------------- */

ok("YouTube-embed slipper gjennom",
   videoUrl("https://www.youtube.com/embed/abc", BASE) !== null);
ok("Vimeo-spiller slipper gjennom",
   videoUrl("https://player.vimeo.com/video/1", BASE) !== null);
ok("forfalsket vertsnavn blokkeres",
   videoUrl("https://youtube.com.angriper.no/x", BASE) === null,
   videoUrl("https://youtube.com.angriper.no/x", BASE));
ok("vertsnavn som delstreng blokkeres",
   videoUrl("https://ondsinnet.no/?u=youtube.com", BASE) === null);
ok("http mot videovert blokkeres",
   videoUrl("http://www.youtube.com/embed/abc", BASE) === null);
ok("fremmed domene blokkeres",
   videoUrl("https://evil.example/x", BASE) === null);

/* ---------------- postDate ---------------- */

ok("date_gmt tolkes som UTC",
   postDate({ date_gmt: "2026-09-09T09:48:00", date: "2026-09-09T11:48:00" }).toISOString()
     === "2026-09-09T09:48:00.000Z");
ok("faller tilbake til date nar date_gmt mangler",
   postDate({ date: "2026-09-09T11:48:00" }) instanceof Date);
ok("ugyldig dato gir null",
   postDate({ date_gmt: "ikke en dato" }) === null);

/* ---------------- timeAgo ---------------- */

const NAA = Date.parse("2026-09-09T12:00:00Z");
const forSiden = (ms) => timeAgo(new Date(NAA - ms), NAA);

ok("under ett minutt", forSiden(30 * 1000) === "nå nettopp", forSiden(30 * 1000));
ok("minutter", forSiden(30 * 60000) === "30 min siden", forSiden(30 * 60000));
ok("timer", forSiden(5 * 3600000) === "5t siden", forSiden(5 * 3600000));
ok("dager", forSiden(3 * 86400000) === "3d siden", forSiden(3 * 86400000));
ok("over en uke gir dato, ikke dogn",
   forSiden(30 * 86400000).indexOf("d siden") === -1, forSiden(30 * 86400000));
ok("framtidig dato faller ikke gjennom",
   timeAgo(new Date(NAA + 3600000), NAA) === "nå nettopp");

/* ---------------- feedSignature ---------------- */

const feed = [
  { id: 1, modified_gmt: "2026-01-01T00:00:00" },
  { id: 2, modified_gmt: "2026-01-02T00:00:00" },
  { id: 3, modified_gmt: "2026-01-03T00:00:00" },
];

ok("lik feed gir lik signatur",
   feedSignature(feed) === feedSignature(feed.slice()));
ok("redigert sak endrer signaturen",
   feedSignature(feed) !== feedSignature([{ ...feed[0], modified_gmt: "2026-02-02T00:00:00" }, feed[1], feed[2]]));
ok("ny rekkefolge endrer signaturen",
   feedSignature(feed) !== feedSignature([feed[1], feed[0], feed[2]]));
ok("fjernet sak endrer signaturen",
   feedSignature(feed) !== feedSignature([feed[0], feed[1]]));
ok("ny sak endrer signaturen",
   feedSignature(feed) !== feedSignature(feed.concat({ id: 4, modified_gmt: "x" })));
ok("faller tilbake til date_gmt nar modified_gmt mangler",
   feedSignature([{ id: 1, date_gmt: "2026-01-01T00:00:00" }]) === "1:2026-01-01T00:00:00");

/* ---------------- internSlug ---------------- */

const VERT = "sportsbibelen.no";

ok("egen artikkel gir slug",
   internSlug("https://sportsbibelen.no/brann-snudde-kampen/", VERT) === "brann-snudde-kampen");
ok("www teller som samme vert",
   internSlug("https://www.sportsbibelen.no/en-sak/", VERT) === "en-sak");
ok("datoprefiks hopper til sluggen",
   internSlug("https://sportsbibelen.no/2026/09/09/en-sak/", VERT) === "en-sak");
ok("fremmed domene gir null",
   internSlug("https://vg.no/en-sak/", VERT) === null);
ok("forsiden gir null", internSlug("https://sportsbibelen.no/", VERT) === null);
ok("kategoriside gir null",
   internSlug("https://sportsbibelen.no/category/fotball/", VERT) === null);
ok("forfatterside gir null",
   internSlug("https://sportsbibelen.no/author/kjetil/", VERT) === null);
ok("rent tall er datosegment, ikke slug",
   internSlug("https://sportsbibelen.no/2026/09/", VERT) === null);
ok("soppel gir null, ikke unntak", internSlug("ikke en url", VERT) === null);

/* ---------------- fotball: ligaer og sesong ---------------- */

ok("kjent liga slas opp", ligaFor("eliteserien").id === 103);
ok("ukjent liga gir null, ikke unntak", ligaFor("serie-a") === null);
// Uten hasOwnProperty-sjekken ville "constructor" gitt en funksjon tilbake.
ok("arvede navn er ikke ligaer", ligaFor("constructor") === null);

const JANUAR = new Date(Date.UTC(2026, 0, 15));
const AUGUST = new Date(Date.UTC(2026, 7, 15));

ok("Eliteserien folger kalenderaret",
   sesongFor(LIGAER.eliteserien, JANUAR) === 2026 &&
   sesongFor(LIGAER.eliteserien, AUGUST) === 2026,
   sesongFor(LIGAER.eliteserien, JANUAR));
ok("Premier League i januar horer til fjorarets sesong",
   sesongFor(LIGAER.premier, JANUAR) === 2025, sesongFor(LIGAER.premier, JANUAR));
ok("Premier League i august har startet ny sesong",
   sesongFor(LIGAER.premier, AUGUST) === 2026, sesongFor(LIGAER.premier, AUGUST));
// Skillet gar ved 1. juli. Juni og juli ligger pa hver sin side av det, og
// pinner grensen: uten dem passerer testene ogsa om den flyttes en maned.
ok("30. juni horer enna til forrige sesong",
   sesongFor(LIGAER.premier, new Date(Date.UTC(2026, 5, 30))) === 2025,
   sesongFor(LIGAER.premier, new Date(Date.UTC(2026, 5, 30))));
ok("1. juli er ny sesong",
   sesongFor(LIGAER.premier, new Date(Date.UTC(2026, 6, 1))) === 2026,
   sesongFor(LIGAER.premier, new Date(Date.UTC(2026, 6, 1))));

/* ---------------- fotball: sesongvinduet ---------------- */

// Gratisnivaet svarer "season, try from 2022 to 2024" pa alt utenfor
// vinduet. Da skal vi be om den nyeste sesongen abonnementet gir, ikke
// vise leseren en feil vedkommende ikke kan gjore noe med.
const VINDU = { fra: 2022, til: 2024 };
ok("sesong etter vinduet klemmes ned til taket",
   tilgjengeligSesong(LIGAER.eliteserien, new Date(Date.UTC(2026, 4, 1)), VINDU) === 2024,
   tilgjengeligSesong(LIGAER.eliteserien, new Date(Date.UTC(2026, 4, 1)), VINDU));
ok("sesong for vinduet klemmes opp til gulvet",
   tilgjengeligSesong(LIGAER.eliteserien, new Date(Date.UTC(2019, 4, 1)), VINDU) === 2022,
   tilgjengeligSesong(LIGAER.eliteserien, new Date(Date.UTC(2019, 4, 1)), VINDU));
ok("sesong inne i vinduet star urort",
   tilgjengeligSesong(LIGAER.eliteserien, new Date(Date.UTC(2023, 4, 1)), VINDU) === 2023);
// Host-var-ligaer skal klemmes etter sesongen sin, ikke etter kalenderaret.
ok("host-var-liga klemmes etter sesongen",
   tilgjengeligSesong(LIGAER.premier, new Date(Date.UTC(2025, 0, 15)), VINDU) === 2024,
   tilgjengeligSesong(LIGAER.premier, new Date(Date.UTC(2025, 0, 15)), VINDU));
ok("vinduet har en fra og en til", SESONGVINDU.fra < SESONGVINDU.til);

/* ---------------- sok: rangering av treff ---------------- */

function sak(id, tittel, dato, utdrag, innhold) {
  return { id, date_gmt: dato, title: { rendered: tittel },
           excerpt: { rendered: utdrag || "" }, content: { rendered: innhold || "" } };
}

ok("HTML-tagger fjernes for sammenlikning",
   foldTekst("<p>Brann <b>vant</b></p>") === "brann vant", foldTekst("<p>Brann <b>vant</b></p>"));
// WordPress sender titler som HTML: «Bodø» kommer som «Bod&#248;».
ok("numeriske entiteter dekodes",
   foldTekst("Bod&#248;/Glimt") === "bodo/glimt", foldTekst("Bod&#248;/Glimt"));
ok("norske tegn foldes", foldTekst("Vålerenga–Tromsø") === "valerenga-tromso",
   foldTekst("Vålerenga–Tromsø"));
ok("tomt gir tomt", foldTekst(null) === "" && foldTekst(undefined) === "");

const TITTEL   = sak(1, "Fulham slo Brentford", "2026-09-01T10:00:00");
const TITTEL2  = sak(2, "Stor kveld for Fulham", "2026-09-05T10:00:00");
const ORDENE   = sak(3, "Manchester feirer, City jubler", "2026-09-06T10:00:00");
const KROPPEN  = sak(4, "Premier League-runden", "2026-09-08T10:00:00",
                     "", "<p>Arsenal vant. Fulham tapte hjemme.</p>");
const INGEN    = sak(5, "Eliteserien i dag", "2026-09-09T10:00:00", "<p>Brann vant.</p>");

ok("treff i tittelen gir 3", treffScore(TITTEL, "Fulham") === 3, treffScore(TITTEL, "Fulham"));
ok("alle ordene i tittelen, men spredt, gir 2",
   treffScore(ORDENE, "Manchester City") === 2, treffScore(ORDENE, "Manchester City"));
ok("ett ord alene gir ikke 2 for spredte ord",
   treffScore(ORDENE, "City") === 3, treffScore(ORDENE, "City"));
ok("treff bare i brodteksten gir 1", treffScore(KROPPEN, "Fulham") === 1, treffScore(KROPPEN, "Fulham"));
ok("ingen treff gir 0", treffScore(INGEN, "Fulham") === 0, treffScore(INGEN, "Fulham"));
ok("sok med norske tegn treffer tittel uten",
   treffScore(sak(6, "Bodo/Glimt vant", "2026-09-01T10:00:00"), "Bodø/Glimt") === 3);
ok("sok uten norske tegn treffer tittel med",
   treffScore(sak(7, "Bod&#248;/Glimt vant", "2026-09-01T10:00:00"), "Bodo/Glimt") === 3);
ok("store og sma bokstaver er det samme", treffScore(TITTEL, "fulham") === 3);
ok("tomt sokeord gir 0", treffScore(TITTEL, "") === 0 && treffScore(TITTEL, "  ") === 0);
ok("sak uten felter kaster ikke", treffScore({}, "Fulham") === 0);

// Nyeste forst er utgangspunktet. Etter rangering star tittel-treffene
// forst (nyeste av dem overst), sa brodtekst-treffet, og til slutt sakene
// uten treff — fortsatt nyeste forst seg imellom.
const FEED = [INGEN, KROPPEN, ORDENE, TITTEL2, TITTEL];
const RANGERT = rangerTreff(FEED, "Fulham");
ok("tittel-treff forst, sa brodtekst, sa resten etter dato",
   RANGERT.map((p) => p.id).join(",") === "2,1,4,5,3", RANGERT.map((p) => p.id).join(","));
ok("rangering endrer ikke original-lista",
   FEED[0].id === 5, FEED[0].id);
ok("tomt sokeord gir lista urort", rangerTreff(FEED, "") === FEED && rangerTreff(FEED, null) === FEED);
// Sortering er stabil: uten dato og med lik score skal rekkefolgen sta.
const UDATERT = [sak(8, "A", null), sak(9, "B", null), sak(10, "C", null)];
ok("lik score og ingen dato beholder rekkefolgen",
   rangerTreff(UDATERT, "x").map((p) => p.id).join(",") === "8,9,10",
   rangerTreff(UDATERT, "x").map((p) => p.id).join(","));

/* ---------------- favorittlag: flere ord og terskel ---------------- */

// Flere favorittlag: det beste treffet teller.
ok("liste med ord gir beste treff",
   treffScore(TITTEL, ["Viking", "Fulham"]) === 3, treffScore(TITTEL, ["Viking", "Fulham"]));
ok("tom liste gir 0", treffScore(TITTEL, []) === 0);

// En sak kategorisert med laget handler om laget, selv om tittelen ikke
// nevner det.
const KATEGORISERT = sak(11, "Seier i Bergen", "2026-09-07T10:00:00");
KATEGORISERT._embedded = { "wp:term": [[{ name: "Fotball" }, { name: "Brann" }], [{ name: "Eliteserien" }]] };
ok("kategori med lagnavnet gir 3", treffScore(KATEGORISERT, "Brann") === 3,
   treffScore(KATEGORISERT, "Brann"));
ok("annen kategori gir ikke treff", treffScore(KATEGORISERT, "Viking") === 0);

// Terskel 2: en sak som bare nevner laget i brodteksten skal ikke skyve
// dagens toppsak nedover. Uten terskel (soket) skal den det.
const FAV = [INGEN, KROPPEN, TITTEL];
ok("terskel 2 lar brodtekst-treff ligge etter dato",
   rangerTreff(FAV, ["Fulham"], 2).map((p) => p.id).join(",") === "1,5,4",
   rangerTreff(FAV, ["Fulham"], 2).map((p) => p.id).join(","));
ok("uten terskel loftes brodtekst-treffet",
   rangerTreff(FAV, ["Fulham"]).map((p) => p.id).join(",") === "1,4,5",
   rangerTreff(FAV, ["Fulham"]).map((p) => p.id).join(","));
ok("liste med bare tomme ord gir lista urort", rangerTreff(FAV, ["", "  "]) === FAV);

ok("ett lag star alene", listeTekst(["Brann"]) === "Brann", listeTekst(["Brann"]));
ok("to lag bindes med og", listeTekst(["Brann", "Viking"]) === "Brann og Viking");
ok("tre lag: komma, sa og",
   listeTekst(["Brann", "Viking", "Molde"]) === "Brann, Viking og Molde");
ok("ingen lag gir tom tekst", listeTekst([]) === "" && listeTekst(null) === "");

/* ---------------- fotball: TheSportsDB ---------------- */

ok("adressen bruker testnokkelen 3 som standard",
   tsdbSti("neste", LIGAER.eliteserien) === "/api/v1/json/3/eventsnextleague.php?id=4358",
   tsdbSti("neste", LIGAER.eliteserien));
ok("egen nokkel legges i adressen, url-kodet",
   tsdbSti("neste", LIGAER.premier, "a b") === "/api/v1/json/a%20b/eventsnextleague.php?id=4328",
   tsdbSti("neste", LIGAER.premier, "a b"));
ok("liga uten TheSportsDB-id gir null", tsdbSti("neste", { id: 1 }) === null);
ok("ukjent datasett gir null", tsdbSti("toppscorere", LIGAER.eliteserien) === null);
ok("resultater har egen adresse",
   tsdbSti("resultater", LIGAER.eliteserien) === "/api/v1/json/3/eventspastleague.php?id=4358",
   tsdbSti("resultater", LIGAER.eliteserien));
const HOST = new Date(Date.UTC(2026, 8, 10));
ok("tabellen sporr om arets sesong",
   tsdbSti("tabell", LIGAER.eliteserien, "", HOST) === "/api/v1/json/3/lookuptable.php?l=4358&s=2026",
   tsdbSti("tabell", LIGAER.eliteserien, "", HOST));
// Premier League krysser nyttar, og TheSportsDB skriver den «2026-2027».
ok("host-var-sesongen skrives med bindestrek",
   tsdbSesong(LIGAER.premier, HOST) === "2026-2027", tsdbSesong(LIGAER.premier, HOST));
ok("kalendersesongen er bare aret", tsdbSesong(LIGAER.eliteserien, HOST) === "2026");

const RAD = { intRank: "1", strTeam: "Bodo/Glimt", strBadge: "https://x/b.png", intPlayed: "20",
  intWin: "14", intDraw: "3", intLoss: "3", intGoalsFor: "50", intGoalsAgainst: "20",
  intGoalDifference: "30", intPoints: "45" };
const TAB = tolkTabellTsdb({ table: [RAD] })[0];
ok("tabellraden far samme form som API-Footballs",
   TAB.plass === 1 && TAB.lag === "Bodø/Glimt" && TAB.merke === "https://x/b.png" &&
   TAB.kamper === 20 && TAB.seier === 14 && TAB.uavgjort === 3 && TAB.tap === 3 &&
   TAB.scoret === 50 && TAB.sluppet === 20 && TAB.differanse === 30 && TAB.poeng === 45,
   JSON.stringify(TAB));
ok("table: null er tom tabell, ikke feil", tolkTabellTsdb({ table: null }).length === 0);
ok("rad uten lag filtreres bort", tolkTabellTsdb({ table: [{ intRank: "1" }] }).length === 0);
ok("tabell som ikke er liste kaster", kaster(() => tolkTabellTsdb({ table: {} })));

function hendelse(ekstra) {
  return Object.assign({ idEvent: "7", strTimestamp: "2026-09-13T15:00:00", intRound: "21",
    strHomeTeam: "Brann", strAwayTeam: "Bodo/Glimt", strVenue: "Brann Stadion",
    strStatus: "Not Started", intHomeScore: null, intAwayScore: null }, ekstra);
}
const TSDB = tolkKamperTsdb({ events: [hendelse()] })[0];
ok("TheSportsDB-kampen far samme form som API-Footballs",
   TSDB.id === 7 && TSDB.runde === "Runde 21" && TSDB.hjemme === "Brann" &&
   TSDB.arena === "Brann Stadion" && TSDB.spilt === false && TSDB.malHjemme === null,
   JSON.stringify(TSDB));
ok("lagnavn oversettes", TSDB.borte === "Bodø/Glimt", TSDB.borte);
// strTimestamp er UTC uten sone. Uten Z ville leseren fatt feil klokkeslett.
ok("tidspunktet far Z", TSDB.dato === "2026-09-13T15:00:00Z", TSDB.dato);
ok("dato og klokkeslett brukes nar strTimestamp mangler",
   tolkKamperTsdb({ events: [hendelse({ strTimestamp: "", dateEvent: "2026-09-13", strTime: "15:00:00" })] })[0].dato
   === "2026-09-13T15:00:00Z");
ok("et tidspunkt som allerede har sone rores ikke",
   tolkKamperTsdb({ events: [hendelse({ strTimestamp: "2026-09-13T17:00:00+02:00" })] })[0].dato
   === "2026-09-13T17:00:00+02:00");
ok("spilt kamp gjenkjennes",
   tolkKamperTsdb({ events: [hendelse({ strStatus: "Match Finished", intHomeScore: "2", intAwayScore: "1" })] })[0].spilt === true);
// Status er ikke alltid fylt ut hos TheSportsDB. Et resultat pa en kamp
// som er spilt etter klokka, er en spilt kamp.
const KLOKKA = Date.parse("2026-09-14T00:00:00Z");
ok("resultat pa en kamp som er spilt teller som spilt",
   tolkKamperTsdb({ events: [hendelse({ strStatus: "", intHomeScore: "2", intAwayScore: "1" })] }, KLOKKA)[0].spilt === true);
ok("resultat pa en kamp fram i tid teller ikke",
   tolkKamperTsdb({ events: [hendelse({ strStatus: "", intHomeScore: "0", intAwayScore: "0" })] },
     Date.parse("2026-09-01T00:00:00Z"))[0].spilt === false);
ok("uten resultat og uten status er kampen ikke spilt",
   tolkKamperTsdb({ events: [hendelse({ strStatus: "" })] }, KLOKKA)[0].spilt === false);
ok("events: null er tom liste, ikke feil", tolkKamperTsdb({ events: null }).length === 0);
ok("hendelse uten lag filtreres bort",
   tolkKamperTsdb({ events: [hendelse({ strHomeTeam: "" })] }).length === 0);
ok("hendelse uten gyldig tid filtreres bort",
   tolkKamperTsdb({ events: [hendelse({ strTimestamp: "i morgen" })] }).length === 0);
ok("tomt svar kaster", kaster(() => tolkKamperTsdb(null)));
ok("events som ikke er liste kaster", kaster(() => tolkKamperTsdb({ events: "rart" })));

/* ---------------- deling: hvor ser du kampen ---------------- */

const KAMPEN = { hjemme: "Brann", borte: "Bodø/Glimt", dato: "2026-09-13T15:00:00Z", arena: "Brann Stadion" };
const NAAR = tidstekst(KAMPEN.dato);
// 15.00 UTC er 17.00 i Norge i september. Teksten skal vise norsk tid
// uansett hvor leseren er.
ok("tidsteksten er norsk tid", /søndag 13\. sep.* kl\. 17[.:]00/.test(NAAR), NAAR);
ok("ugyldig tid gir tom tekst", tidstekst("nei") === "" && tidstekst(null) === "");

const HJEMME = delingstekst(KAMPEN, "hjemme", "", "https://x/#/fotball/eliteserien/neste");
ok("teksten har kamp, tid, sted, sporsmal og lenke",
   HJEMME.indexOf("Brann – Bodø/Glimt") > -1 && HJEMME.indexOf(NAAR) > -1 &&
   HJEMME.indexOf("Jeg ser den hjemme.") > -1 && HJEMME.indexOf("Hvor ser du?") > -1 &&
   HJEMME.indexOf("https://x/#/fotball/eliteserien/neste") > -1, HJEMME);
ok("pub med navn", delingstekst(KAMPEN, "pub", "Pub X", "").indexOf("Jeg ser den på Pub X.") > -1);
ok("pub uten navn", delingstekst(KAMPEN, "pub", "", "").indexOf("Jeg ser den på pub.") > -1);
ok("stadion far arenaens navn",
   delingstekst(KAMPEN, "stadion", "", "").indexOf("Jeg ser den på Brann Stadion.") > -1);
ok("stadion uten arena",
   delingstekst({ hjemme: "A", borte: "B" }, "stadion", "", "").indexOf("Jeg ser den på stadion.") > -1);
ok("ukjent sted utelates", delingstekst(KAMPEN, "rart", "", "").indexOf("Jeg ser") === -1);
ok("uten lenke ender teksten med sporsmalet",
   /Hvor ser du\?$/.test(delingstekst(KAMPEN, "hjemme", "", "")));
ok("HVOR har de tre stedene", Object.keys(HVOR).join(",") === "hjemme,pub,stadion");

/* ---------------- vaer: arena, varsel og klerad ---------------- */

ok("arenaen finnes pa navnet API-ene skriver",
   arenaFor("Lerkendal Stadion").navn === "Lerkendal" && arenaFor("Alfheim Stadion").navn === "Romssa Arena");
ok("norske tegn i arenanavnet er ikke et problem", arenaFor("Åråsen stadion").navn === "Åråsen");
ok("ukjent arena gir null, ikke feil sted", arenaFor("Ukjent Park") === null && arenaFor("") === null);
ok("alle arenaer har koordinater i Norge",
   ARENAER.every((a) => a.lat > 57 && a.lat < 72 && a.lon > 4 && a.lon < 32));
ok("adressen har tre desimaler, som MET ber om",
   vaerSti({ lat: 63.41264, lon: 10.4 }) === "/weatherapi/locationforecast/2.0/compact?lat=63.413&lon=10.400",
   vaerSti({ lat: 63.41264, lon: 10.4 }));

// JAG/TI: 8 grader og 9 m/s foles som 4. Over 10 grader eller i stille
// vaer er folt lik malt.
ok("vind gjor det kaldere", foltTemp(8, 9) === 4, foltTemp(8, 9));
ok("over ti grader er folt lik malt", foltTemp(15, 9) === 15);
ok("stille vaer er folt lik malt", foltTemp(3, 0.5) === 3);
ok("ugyldig temperatur gir null", foltTemp("nei", 3) === null);

function time(t, temp, vind, symbol, nedbor) {
  return { time: t, data: { instant: { details: { air_temperature: temp, wind_speed: vind } },
    next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: nedbor } } } };
}
const MET = { properties: { timeseries: [
  time("2026-09-13T14:00:00Z", 9.2, 8.7, "rain", 1.2),
  time("2026-09-13T15:00:00Z", 8.4, 9.1, "lightrain", 0.4),
  time("2026-09-13T16:00:00Z", 7.9, 9.4, "cloudy", 0),
] } };
const V = tolkVarsel(MET, "2026-09-13T15:10:00Z");
ok("timen naermest avspark velges", V.tid === "2026-09-13T15:00:00Z", V.tid);
ok("verdiene rundes og folt regnes",
   V.temp === 8 && V.vind === 9 && V.nedbor === 0.4 && V.symbol === "lightrain" && V.folt === 4,
   JSON.stringify(V));
ok("mer enn tre timer unna er ikke et varsel for kampen",
   tolkVarsel(MET, "2026-09-20T15:00:00Z") === null);
ok("ugyldig tidspunkt gir null", tolkVarsel(MET, "i morgen") === null);
ok("tomt svar kaster", kaster(() => tolkVarsel({ properties: { timeseries: [] } }, "2026-09-13T15:00:00Z")) &&
   kaster(() => tolkVarsel(null, "2026-09-13T15:00:00Z")));
// Langt fram i tid gir MET bare seks-timers bolker.
const SEKS = { properties: { timeseries: [{ time: "2026-09-13T12:00:00Z", data: {
  instant: { details: { air_temperature: 12, wind_speed: 2 } },
  next_6_hours: { summary: { symbol_code: "fair_day" }, details: { precipitation_amount: 0 } } } }] } };
ok("seks-timers bolken brukes nar timen mangler",
   tolkVarsel(SEKS, "2026-09-13T13:00:00Z").symbol === "fair_day");

ok("kaldt: vinterjakke", klerad({ temp: -2, folt: -8, vind: 5, nedbor: 0, symbol: "cloudy" }).indexOf("Vinterjakke") === 0);
ok("kjolig: jakke og lue", klerad({ temp: 8, folt: 4, vind: 9, nedbor: 0, symbol: "cloudy" }).indexOf("Jakke, og gjerne lue.") === 0);
ok("mildt: genser", klerad({ temp: 17, folt: 17, vind: 2, nedbor: 0, symbol: "cloudy" }) === "Genser holder.");
ok("varmt: t-skjorte", klerad({ temp: 24, folt: 24, vind: 2, nedbor: 0, symbol: "clearsky_day" }) === "T-skjortevær.");
ok("regn gir regnjakke", klerad({ temp: 12, folt: 12, vind: 3, nedbor: 1.0, symbol: "rain" }).indexOf("Ta regnjakke.") > -1);
ok("litt nedbor uten regnsymbol gir ogsa regnjakke",
   klerad({ temp: 12, folt: 12, vind: 3, nedbor: 0.5, symbol: "cloudy" }).indexOf("Ta regnjakke.") > -1);
ok("sno nevnes, ikke regnjakke",
   klerad({ temp: 0, folt: -4, vind: 4, nedbor: 1, symbol: "snow" }).indexOf("snø") > -1 &&
   klerad({ temp: 0, folt: -4, vind: 4, nedbor: 1, symbol: "snow" }).indexOf("regnjakke") === -1);
ok("sterk vind nevnes", klerad({ temp: 10, folt: 6, vind: 12, nedbor: 0, symbol: "cloudy" }).indexOf("blåser") > -1);
ok("uten varsel: tom tekst", klerad(null) === "" && klerad({ temp: null }) === "");

ok("vaerteksten er kort og hel",
   vaertekst(V) === "8°, føles som 4°. Regn. Jakke, og gjerne lue. Ta regnjakke.", vaertekst(V));
ok("lik folt og malt nevner ikke folt",
   vaertekst({ temp: 17, folt: 17, vind: 2, nedbor: 0, symbol: "fair_day" }) === "17°. Sol. Genser holder.",
   vaertekst({ temp: 17, folt: 17, vind: 2, nedbor: 0, symbol: "fair_day" }));

// Vaeret gar inn i delingsteksten nar det finnes, og utelates nar ikke.
ok("delingsteksten far vaeret for sporsmalet",
   delingstekst(KAMPEN, "hjemme", "", "", "8°. Regn.").indexOf("Været ved avspark: 8°. Regn. Hvor ser du?") > -1);
ok("uten vaer er teksten som for",
   delingstekst(KAMPEN, "hjemme", "", "", "").indexOf("Været") === -1);

/* ---------------- fotball: lagnavn ---------------- */

ok("norske tegn foldes til ascii i nokkelen",
   normaliserLagnavn("Bodø/Glimt") === "bodoglimt", normaliserLagnavn("Bodø/Glimt"));
ok("skilletegn og mellomrom faller bort",
   normaliserLagnavn("Bodo / Glimt") === "bodoglimt", normaliserLagnavn("Bodo / Glimt"));
ok("æ blir ae, ikke a", normaliserLagnavn("Stabæk") === "stabaek", normaliserLagnavn("Stabæk"));

// Samme rad uansett hvordan API-et skriver det. Lista skal ikke ga i
// stykker om de begynner a sende norske bokstaver selv.
ok("API-ets form oversettes", redaksjonsnavn("Bodo/Glimt") === "Bodø/Glimt");
ok("riktig form star igjen som riktig", redaksjonsnavn("Bodø/Glimt") === "Bodø/Glimt");
ok("annen tegnsetting treffer ogsa", redaksjonsnavn("Bodo Glimt") === "Bodø/Glimt");
ok("Tromso blir Tromsø", redaksjonsnavn("Tromso") === "Tromsø");
ok("Lillestrom blir Lillestrøm", redaksjonsnavn("Lillestrom") === "Lillestrøm");
ok("Valerenga blir Vålerenga", redaksjonsnavn("Valerenga") === "Vålerenga");
ok("ukjent navn gar uendret gjennom",
   redaksjonsnavn("Manchester City") === "Manchester City");
ok("tomt navn gir tomt navn, ikke unntak", redaksjonsnavn("") === "");
// Uten hasOwnProperty-sjekken ville "constructor" gitt en funksjon.
ok("arvede navn oversettes ikke",
   redaksjonsnavn("constructor") === "constructor", redaksjonsnavn("constructor"));

/* ---------------- fotball: dognkvoten ---------------- */

// Gratisnivaet gir 100 kall i dognet. Slar denne ut, er en levetid satt
// for kort eller en liga lagt til uten a regne pa det.
ok("to ligaer holder seg under dognkvoten",
   kallPerDogn(2) <= 100, kallPerDogn(2));
ok("en tredje liga sprenger den, og skal merkes her",
   kallPerDogn(3) > 100, kallPerDogn(3));
ok("resultater friskes opp oftere enn tabellen",
   LEVETID.resultater < LEVETID.tabell);

/* ---------------- fotball: tolkning av svaret ---------------- */

const SVAR = {
  errors: [],
  response: [{
    league: {
      id: 103, name: "Eliteserien", season: 2026,
      standings: [[
        { rank: 1, team: { name: "Bodo/Glimt", logo: "https://media.api-sports.io/1.png" },
          points: 68, goalsDiff: 41,
          all: { played: 30, win: 21, draw: 5, lose: 4, goals: { for: 74, against: 33 } } },
        { rank: 2, team: { name: "Brann" }, points: 60, goalsDiff: 22,
          all: { played: 30, win: 18, draw: 6, lose: 6, goals: { for: 55, against: 33 } } },
      ]],
    },
  }],
};

const TABELL = tolkTabell(SVAR);
ok("tabellen far en rad per lag", TABELL.length === 2, TABELL.length);
// API-et skriver "Bodo/Glimt"; redaksjonen skriver "Bodø/Glimt". Sendes
// API-ets form inn i nyhetssoket, gir det null treff.
ok("lagnavnet oversettes til redaksjonens skrivemate",
   TABELL[0].lag === "Bodø/Glimt", TABELL[0].lag);
ok("lag uten avvik gar uendret gjennom", TABELL[1].lag === "Brann", TABELL[1].lag);

ok("plassering og poeng leses ut",
   TABELL[0].plass === 1 && TABELL[0].poeng === 68, JSON.stringify(TABELL[0]));
ok("V-U-T og mal leses ut",
   TABELL[0].seier === 21 && TABELL[0].uavgjort === 5 && TABELL[0].tap === 4 &&
   TABELL[0].scoret === 74 && TABELL[0].sluppet === 33);
ok("manglende merke gir null, ikke undefined", TABELL[1].merke === null);

// API-et svarer 200 med feilen i kroppen. Uten denne sjekken ville en
// manglende nokkel sett ut som en tom tabell.
ok("feil i kroppen fanges", apiFeil({ errors: { token: "Missing application key." } })
   === "token: Missing application key.");
ok("tom feilliste er ingen feil", apiFeil({ errors: [] }) === null);

ok("feilsvar kaster i stedet for a gi tom tabell",
   kaster(() => tolkTabell({ errors: { token: "Missing application key." } })));
ok("svar uten tabell kaster", kaster(() => tolkTabell({ errors: [], response: [] })));
ok("soppel kaster", kaster(() => tolkTabell(null)));

function kaster(fn) {
  try { fn(); return false; } catch (err) { return true; }
}

/* ---------------- fotball: adresser hos API-et ---------------- */

ok("tabell spor om standings",
   apiSti("tabell", LIGAER.premier, 2026) === "/standings?league=39&season=2026",
   apiSti("tabell", LIGAER.premier, 2026));
// last og next gir et vindu rundt naet. Uten dem ville hele sesongen blitt
// hentet for a vise ti kamper.
ok("resultater spor om de siste spilte",
   apiSti("resultater", LIGAER.premier, 2026).indexOf("status=FT&last=10") > -1,
   apiSti("resultater", LIGAER.premier, 2026));
ok("neste spor om de kommende",
   apiSti("neste", LIGAER.premier, 2026).indexOf("status=NS&next=") > -1,
   apiSti("neste", LIGAER.premier, 2026));
ok("ukjent datasett gir null", apiSti("toppscorere", LIGAER.premier, 2026) === null);

/* ---------------- fotball: kamper ---------------- */

function kampsvar(rader) {
  return { errors: [], response: rader };
}

function lagKamp(id, dato, runde, hjemme, borte, mh, mb, kode) {
  return {
    fixture: { id, date: dato, status: { short: kode || "NS" } },
    league: { round: runde },
    teams: { home: { name: hjemme }, away: { name: borte } },
    goals: { home: mh === undefined ? null : mh, away: mb === undefined ? null : mb },
  };
}

const KAMPER = tolkKamper(kampsvar([
  lagKamp(1, "2026-09-08T17:00:00+00:00", "Runde 20", "Brann", "Viking", 2, 1, "FT"),
  lagKamp(2, "2026-09-08T19:00:00+00:00", "Runde 20", "Molde", "Valerenga", 0, 0, "AET"),
]));

ok("kampene tolkes", KAMPER.length === 2, KAMPER.length);
ok("lag og mal leses ut",
   KAMPER[0].hjemme === "Brann" && KAMPER[0].borte === "Viking" &&
   KAMPER[0].malHjemme === 2 && KAMPER[0].malBorte === 1);
// Uten AET og PEN ville en kamp avgjort etter ekstraomganger sett ut som
// at den ikke var spilt.
ok("ekstraomganger teller som spilt", KAMPER[1].spilt === true);
ok("kamp uten lag faller ut",
   tolkKamper(kampsvar([lagKamp(3, "2026-09-08T17:00:00+00:00", "Runde 20", "", "Viking")])).length === 0);
ok("feil i kroppen kaster ogsa for kamper",
   kaster(() => tolkKamper({ errors: { token: "Missing application key." } })));

// Neste runde er runden til forste kommende kamp, ikke de N neste
// kampene: ellers ville en utsatt kamp fra forrige runde blandet seg inn.
const KOMMENDE = tolkKamper(kampsvar([
  lagKamp(4, "2026-09-20T17:00:00+00:00", "Runde 21", "Brann", "Bodo/Glimt"),
  lagKamp(5, "2026-09-21T17:00:00+00:00", "Runde 21", "Molde", "Rosenborg"),
  lagKamp(6, "2026-09-28T17:00:00+00:00", "Runde 22", "Viking", "Sarpsborg"),
]));
const NESTE = nesteRunde(KOMMENDE);
ok("neste runde tar bare den forste runden", NESTE.length === 2, NESTE.length);
ok("neste runde er den som kommer forst", NESTE[0].runde === "Runde 21", NESTE[0].runde);
// Kampene oversettes ogsa, sa hjemme- og bortelag matcher tabellen.
ok("lagnavn i kamper oversettes", KOMMENDE[0].borte === "Bodø/Glimt", KOMMENDE[0].borte);
ok("tom liste gir tom runde", nesteRunde([]).length === 0);

/* ---------------- fotball: ruting ---------------- */

ok("naken fotballenke gir standardvalg",
   JSON.stringify(tolkFotballHash("#/fotball")) ===
   JSON.stringify({ liga: "eliteserien", del: "tabell" }),
   JSON.stringify(tolkFotballHash("#/fotball")));
ok("liga og del leses ut",
   tolkFotballHash("#/fotball/premier/resultater").liga === "premier" &&
   tolkFotballHash("#/fotball/premier/resultater").del === "resultater");
// Leddene kjennes igjen pa innhold, ikke pa rekkefolge, sa en lenke med
// bare det ene leddet fortsatt apner riktig sted.
ok("del alene virker", tolkFotballHash("#/fotball/neste").del === "neste");
ok("liga alene virker", tolkFotballHash("#/fotball/premier").liga === "premier");
ok("ukjent ledd faller tilbake, ikke tomt",
   tolkFotballHash("#/fotball/serie-a/toppscorere").liga === "eliteserien");
ok("artikkelruter er ikke fotballruter", tolkFotballHash("#/sak/en-sak") === null);
ok("tom hash er ikke en fotballrute", tolkFotballHash("") === null);
ok("hash bygges tilbake til samme rute",
   tolkFotballHash(fotballHash("premier", "neste")).del === "neste");

/* ---------------- rapport ---------------- */

const antall = 196;
console.log("\n" + (antall - feilet) + " av " + antall + " enhetstester passerte");
process.exit(feilet ? 1 : 0);
