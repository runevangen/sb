#!/usr/bin/env node
// Enhetstester for de rene funksjonene i lib.js.
//
//   node test/unit.mjs
//
// Ingen nettleser. Disse dekker logikk som ikke rorer DOM, og kjorer pa
// millisekunder framfor de titalls sekundene nettlesertestene bruker.
// Alt som trenger DOM ligger i test/run.mjs.

import { safeUrl, videoUrl, postDate, timeAgo, feedSignature, internSlug } from "../lib.js";
import { LIGAER, ligaFor, sesongFor, tolkTabell, apiFeil, kallPerDogn, LEVETID,
         apiSti, tolkKamper, nesteRunde, tolkFotballHash, fotballHash,
         tilgjengeligSesong, SESONGVINDU, redaksjonsnavn, normaliserLagnavn }
  from "../fotball-data.js";

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

const antall = 99;
console.log("\n" + (antall - feilet) + " av " + antall + " enhetstester passerte");
process.exit(feilet ? 1 : 0);
