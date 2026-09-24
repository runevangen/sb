#!/usr/bin/env node
// Enhetstester for de rene funksjonene i lib.js.
//
//   node test/unit.mjs
//
// Ingen nettleser. Disse dekker logikk som ikke rorer DOM, og kjorer pa
// millisekunder framfor de titalls sekundene nettlesertestene bruker.
// Alt som trenger DOM ligger i test/run.mjs.

import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { safeUrl, videoUrl, postDate, timeAgo, feedSignature, internSlug,
         foldTekst, treffScore, rangerTreff, listeTekst } from "../lib.js";
import { LIGAER, ligaFor, sesongFor, tolkTabell, apiFeil, kallPerDogn, LEVETID,
         SPORTER, sportFor, tolkDatasett, kommendeKamper, kallPerSport, DOGNKVOTE,
         ligaForKategori,
         apiSti, tolkKamper, kampeneFramover, tolkFotballHash, fotballHash,
         tilgjengeligSesong, SESONGVINDU, redaksjonsnavn, normaliserLagnavn,
         tsdbSti, tsdbHeadere, tolkKamperTsdb, tolkTabellTsdb, tsdbSesong, TSDB_MINST, delingstekst, tidstekst, HVOR,
         FANER, DELER, DEL_NAVN,
         kamplenke, tolkKamplenke, invitasjonstekst, stedtekst, STED_MAKS,
         kampNokkel, gyldigKampId, kanalFor, sjekkKanalliste,
         tsdbSondeStier, tsdbForsteListe, tsdbSondeFunn, tsdbPlukkId,
         tsdbSondeParset }
  from "../fotball-data.js";

import { normaliserEpost, gyldigEpost, normaliserKode, gyldigKode, maskerEpost,
         oktUtloper, oktGyldig, tolkOkt, kanFornyes, maaFornyes,
         FORNY_MARGIN } from "../konto-data.js";

import { normaliserPinNavn, pinSlug, gyldigPinNavn, pinEpost, normaliserPin, gyldigPin,
         pinPassord, tolkPinOkt, tolkBrukere, sistInneTekst,
         PIN_MIN, PIN_MAKS, PIN_DOMENE,
         rensLag, flettLag, sammeLag, sjekkPinBytte, LAG_MAKS } from "../pin-data.js";

import { erLaget, ligaForLag, plasseringFor, avstandTekst, spilteFor, formFor,
         kommendeFor } from "../mittlag-data.js";

import { normaliserNavn, gyldigNavn, svarRad, tolkSvar, perKamp, blirMedTekst,
         egetSvar, loftMedSvar, bareMedSvar, stederFraSvar, perSted,
         stedNokkel, blirMedLinje, mittSted, NAVN_MAKS,
         navnIRad, NAVN_I_RAD } from "../svar-data.js";

import { ARENAER, arenaFor, vaerSti, foltTemp, tolkVarsel, klerad, vaertekst }
  from "../vaer-data.js";

import { overpassSporring, rundPosisjon, avstandM, avstandtekst, tolkPuber, enturNaermest,
         tolkHoldeplasser, grupperPuber, ofteBrukt, noterPub,
         rangerForslag, FORSLAG_MAKS, stampuberFor, FORSLAG_KILDER,
         sorterForslag, NAER_MAKS, ANDRE_MAKS,
         falskPosisjon, BYER,
         OVERPASS_SPEIL, overpassHeadere, restTid,
         sjekkPubliste, kuraterteNaer, kuraterteIByen, merkKuraterte, merkAntatte,
         ligaflaggGjelder, ligapuberAv, ligamerkeTekst, sjekkLigaflagg,
         ligaflaggTilBase,
         sjekkKontaktliste, kontaktFor, finnKontakt, KONTAKT_FELT, kildeHolder,
         pubNokkel, tolkPubRader, pubRadTilBase, slaSammenPuber, sjekkPubRad,
         osmNavnVask, osmNavnSporring, tolkNavnTreff, PUBTYPER, PUBSIKKERHET,
         delAdresse, osmAdresseSporring, tolkAdresseTreff, koordinatFraLenke,
         kartLenke,
         SOK_SEKUNDER, SOK_TAK, overpassFeiltekst,
         OSLO_RAMME, rammeFor, byFor, bynavn, BY_RADIUS_KM,
         posisjonsfeil, sokKuraterte } from "../pub-data.js";
import { PUBER_KONTAKT } from "../puber-kontakt.js";
import { KANALER } from "../kanaler.js";
import { KURATERTE } from "../puber.js";
import { tjenestensOrd, diagnosekropp } from "../tjeneste-data.js";
import { sjekkForslag, forslagRad, tolkForslag, alleredeILista, publisteRad,
         erTips, forslagVekt, sorterForslagKo }
  from "../pub-forslag-data.js";
import { sjekkVisninger, visningerFor, slaSammen, tolkVisninger, visningRad, kampIderFor,
         bekreftetFor, merkBekreftet, visningsHint, rundeTall,
         visningsDiff, lagreKnappTekst, rundeKnappTekst,
         avkreftetFor, utenAvkreftede } from "../visning-data.js";

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
const HOST_TID = new Date(Date.UTC(2026, 8, 10));
// Med nokkel: v2, og nokkelen star ikke i adressen — den gar i en header.
ok("v2 for neste",
   tsdbSti("neste", LIGAER.premier, "hemmelig", undefined, "v2") === "/api/v2/json/schedule/next/league/4328",
   tsdbSti("neste", LIGAER.premier, "hemmelig", undefined, "v2"));
// Resultater spor om HELE sesongen, ikke de forrige kampene.
//
// `schedule/previous/league` ga femten hendelser, og da sa fanen «kun
// siste runde». Malt med sonden 21. september 2026: sesongsvaret er 240
// rader, 30 ulike runder, 168 spilte med resultat. De uspilte siles i
// funksjonen, ikke i adressen.
ok("v2 for resultater spor om hele sesongen",
   tsdbSti("resultater", LIGAER.eliteserien, "hemmelig", HOST_TID, "v2")
     === "/api/v2/json/schedule/league/4358/2026",
   tsdbSti("resultater", LIGAER.eliteserien, "hemmelig", HOST_TID, "v2"));
ok("og ikke om de forrige kampene",
   tsdbSti("resultater", LIGAER.eliteserien, "hemmelig", HOST_TID, "v2")
     .indexOf("previous") === -1);
ok("v2 for tabellen, med sesongen i stien",
   tsdbSti("tabell", LIGAER.eliteserien, "hemmelig", new Date(Date.UTC(2026, 8, 10)), "v2") === "/api/v2/json/lookup/table/4358/2026",
   tsdbSti("tabell", LIGAER.eliteserien, "hemmelig", new Date(Date.UTC(2026, 8, 10)), "v2"));
ok("v2 har aldri nokkelen i adressen",
   ["tabell", "resultater", "neste"].every((d) => tsdbSti(d, LIGAER.eliteserien, "hemmelig", undefined, "v2").indexOf("hemmelig") === -1));
// v1 med nokkel: Patreon gir ogsa en «production key» for de gamle
// adressene, med nokkelen i stien.
ok("v1 med nokkel legger den i adressen, url-kodet",
   tsdbSti("neste", LIGAER.premier, "a b", undefined, "v1") === "/api/v1/json/a%20b/eventsnextleague.php?id=4328",
   tsdbSti("neste", LIGAER.premier, "a b", undefined, "v1"));
ok("nokkelen gar i X-API-KEY bare for v2",
   tsdbHeadere("hemmelig", "v2")["X-API-KEY"] === "hemmelig" && !("X-API-KEY" in tsdbHeadere("hemmelig", "v1")));
ok("uten nokkel sendes ingen X-API-KEY", !("X-API-KEY" in tsdbHeadere("", "v2")) && !("X-API-KEY" in tsdbHeadere()));
ok("liga uten TheSportsDB-id gir null", tsdbSti("neste", { id: 1 }) === null);
ok("ukjent datasett gir null", tsdbSti("toppscorere", LIGAER.eliteserien) === null);
ok("v1 for resultater spor ogsa om sesongen",
   tsdbSti("resultater", LIGAER.eliteserien, "", HOST_TID)
     === "/api/v1/json/3/eventsseason.php?id=4358&s=2026",
   tsdbSti("resultater", LIGAER.eliteserien, "", HOST_TID));
// Et sesongsvar er 240 rader for Eliteserien. Et svar pa 15 er derfor
// ikke en liten sesong — det er en kappet en, og et avkortet svar ma
// ikke vises som om det var helt.
ok("og grensa for et helt svar folger med opp",
   TSDB_MINST.resultater >= 20, TSDB_MINST.resultater);
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
// v2 legger lista under et annet navn. Vi tar den forste lista vi finner.
ok("v2-formen med lookup leses ogsa", tolkTabellTsdb({ lookup: [RAD] })[0].lag === "Bodø/Glimt");
ok("ukjent navn pa lista leses nar det er den eneste", tolkTabellTsdb({ standings: [RAD] })[0].lag === "Bodø/Glimt");
ok("tomt objekt er tom tabell", tolkTabellTsdb({}).length === 0);
ok("v2-formen med schedule leses ogsa",
   tolkKamperTsdb({ schedule: [hendelse()] })[0].hjemme === "Brann");
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

const PUBEN = delingstekst(KAMPEN, "pub", "Pub X", "https://x/#/fotball/eliteserien/neste");
ok("teksten har kamp, tid, sted, sporsmal og lenke",
   PUBEN.indexOf("Brann – Bodø/Glimt") > -1 && PUBEN.indexOf(NAAR) > -1 &&
   PUBEN.indexOf("Jeg ser den på Pub X.") > -1 && PUBEN.indexOf("Hvor ser du?") > -1 &&
   PUBEN.indexOf("https://x/#/fotball/eliteserien/neste") > -1, PUBEN);
ok("pub uten navn", delingstekst(KAMPEN, "pub", "", "").indexOf("Jeg ser den på pub.") > -1);
ok("stadion far arenaens navn",
   delingstekst(KAMPEN, "stadion", "", "").indexOf("Jeg ser den på Brann Stadion.") > -1);
ok("stadion uten arena",
   delingstekst({ hjemme: "A", borte: "B" }, "stadion", "", "").indexOf("Jeg ser den på stadion.") > -1);
ok("ukjent sted utelates", delingstekst(KAMPEN, "rart", "", "").indexOf("Jeg ser") === -1);
ok("uten lenke ender teksten med sporsmalet",
   /Hvor ser du\?$/.test(delingstekst(KAMPEN, "pub", "", "")));
// «hjemme» er borte: kampkortet er en liste over steder man kan dra, og
// sofaen er ikke et motested. Et gammelt svar faller til null framfor a
// bli tegnet som et sted.
ok("HVOR har bare stedene man kan dra til",
   Object.keys(HVOR).join(",") === "pub,stadion");

/* ---------------- deling: lenka til kampen ---------------- */

// Lenka pekte forst pa hele runden, og mottakeren matte finne kampen
// selv. Na barer den kampen, svaret og stedet — og en eldre app ser
// fortsatt bare #/fotball/<liga>/neste.
const LENKE = kamplenke("eliteserien", { id: 7 }, "pub", "Andy's Pub");
ok("lenka starter som en vanlig runde-lenke",
   LENKE.indexOf("#/fotball/eliteserien/neste?") === 0, LENKE);
ok("gamle apper ser fortsatt riktig liga og del",
   tolkFotballHash(LENKE).liga === "eliteserien" && tolkFotballHash(LENKE).del === "neste",
   JSON.stringify(tolkFotballHash(LENKE)));

const TOLKET = tolkKamplenke(LENKE);
ok("kampen, svaret og stedet kommer tilbake ut",
   TOLKET.kampId === "7" && TOLKET.hvor === "pub" && TOLKET.sted === "Andy's Pub",
   JSON.stringify(TOLKET));
ok("en lenke uten kamp er ingen invitasjon",
   tolkKamplenke("#/fotball/eliteserien/neste") === null);
ok("en artikkellenke er ingen invitasjon",
   tolkKamplenke("#/sak/en-sak?kamp=7") === null);
// «hvor» kommer fra en adresse hvem som helst kan skrive: bare de tre
// svarene vi kjenner slipper inn, og stedet kappes som i feltet.
ok("ukjent svar forkastes",
   tolkKamplenke("#/fotball/eliteserien/neste?kamp=7&hvor=rart").hvor === null);
ok("et altfor langt stedsnavn kappes",
   tolkKamplenke("#/fotball/eliteserien/neste?kamp=7&hvor=pub&sted=" +
     encodeURIComponent("A".repeat(200))).sted.length === STED_MAKS);
ok("stedet folger bare med nar man ser den pa pub",
   kamplenke("eliteserien", { id: 7 }, "hjemme", "Andy's Pub").indexOf("sted=") === -1,
   kamplenke("eliteserien", { id: 7 }, "hjemme", "Andy's Pub"));

// Samme sted, samme ord: teksten som sendes og linja mottakeren leser
// beskriver stedet likt, fordi begge gar gjennom stedtekst().
ok("stedet skrives likt i begge ender",
   delingstekst(KAMPEN, "pub", "Pub X", "").indexOf(stedtekst(KAMPEN, "pub", "Pub X")) > -1 &&
   invitasjonstekst(KAMPEN, "pub", "Pub X") === "Delt med deg: noen ser kampen på Pub X.",
   invitasjonstekst(KAMPEN, "pub", "Pub X"));
ok("invitasjonen navngir arenaen nar avsenderen er pa stadion",
   invitasjonstekst(KAMPEN, "stadion", "") === "Delt med deg: noen ser kampen på Brann Stadion.",
   invitasjonstekst(KAMPEN, "stadion", ""));
ok("uten svar star invitasjonen likevel",
   invitasjonstekst(KAMPEN, null, "") === "Delt med deg.",
   invitasjonstekst(KAMPEN, null, ""));

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

/* ---------------- puber ---------------- */

ok("Overpass-sporringen har radius og tre desimaler",
   overpassSporring(63.41264, 10.4, 800, 7) === '[out:json][timeout:7];nwr["amenity"~"^(pub|bar)$"](around:800,63.413,10.400);out center;',
   overpassSporring(63.41264, 10.4, 800, 7));
// Sporringen ber om den tida den som kaller faktisk venter. Sto det en
// fast tolv her mens tjenesten la pa etter 7,5, var vi den som ga opp —
// og meldingen pekte pa Overpass.
ok("sporringen ber om den tida vi faktisk venter",
   overpassSporring(59.9, 10.7, 800, 7).indexOf("[timeout:7]") > -1 &&
   overpassSporring(59.9, 10.7, 800, 8).indexOf("[timeout:8]") > -1,
   overpassSporring(59.9, 10.7, 800, 7).slice(0, 24));

// «application/json» sto her i to uker, med en kommentar som sa at den
// loste 406-en. Den gjorde det motsatte: overpass-api.de svarte 406 pa
// hvert eneste kall, pa 472 ms, sa raskt at det aldri sa ut som nedetid.
// Overpass merker ikke svaret som JSON pa HTTP-niva selv om «[out:json]»
// star i sporringen, sa strengt om JSON er a be om noe den ikke har.
// Formatet bestemmes av sporringen; her er det ingenting a hevde.
ok("Accept hevder ingenting om formatet", overpassHeadere(false)["Accept"] === "*/*" &&
   overpassHeadere(true)["Accept"] === "*/*", JSON.stringify(overpassHeadere(true)));
// Nettleseren forbyr oss a sette User-Agent.
ok("nettleseren far bare det den har lov til a sette",
   !("User-Agent" in overpassHeadere(false)), JSON.stringify(overpassHeadere(false)));
ok("serverside identifiserer vi oss",
   overpassHeadere(true)["User-Agent"].indexOf("sportsbibelen") === 0);
// Setter vi Accept-Encoding selv, slutter Node a pakke ut svaret, og
// json() feiler pa en gzippet kropp.
ok("Accept-Encoding settes ikke av oss",
   !("Accept-Encoding" in overpassHeadere(true)) && !("Accept-Encoding" in overpassHeadere(false)));
// Netlify gir funksjonen ti sekunder. Uten frist per tjener sprenger tre
// trege tjenere den, og leseren far Netlifys feilside i stedet for vart
// svar — uten et ord om hvem som sviktet.
ok("frist per tjener, men aldri over det som er igjen",
   restTid(1000, 0, 3000) === 1000 && restTid(9000, 0, 3000) === 3000, restTid(1000, 0, 3000));
ok("tiden ute gir null", restTid(500, 900, 3000) === 0 && restTid(500, 500, 3000) === 0);

ok("flere tjenere a prove, alle over https",
   OVERPASS_SPEIL.length >= 2 && OVERPASS_SPEIL.every((u) => u.indexOf("https://") === 0 && u.indexOf("/interpreter") > -1),
   OVERPASS_SPEIL.join(" "));

ok("posisjonen rundes til tre desimaler",
   rundPosisjon(59.9138688, 10.7522454).lat === 59.914 && rundPosisjon(59.9138688, 10.7522454).lon === 10.752);
// Lerkendal til Trondheim torg er rundt 2,3 km.
const LERK = { lat: 63.413, lon: 10.406 };
ok("avstanden regnes i meter", Math.abs(avstandM(LERK, { lat: 63.430, lon: 10.395 }) - 1970) < 60,
   avstandM(LERK, { lat: 63.430, lon: 10.395 }));
ok("avstand skrives kort", avstandtekst(243) === "240 m" && avstandtekst(1250) === "1,3 km" && avstandtekst(NaN) === "");

const OSM = { elements: [
  { type: "node", id: 1, lat: 63.4140, lon: 10.4070, tags: { amenity: "pub", name: "Lerkendal Pub", opening_hours: "Mo-Su 12:00-01:00" } },
  { type: "way", id: 2, center: { lat: 63.4200, lon: 10.3950 }, tags: { amenity: "bar", name: "Bybar" } },
  { type: "node", id: 3, lat: 63.4141, lon: 10.4071, tags: { amenity: "pub", name: "lerkendal pub" } },
  { type: "node", id: 4, lat: 63.4150, lon: 10.4080, tags: { amenity: "pub" } },
  { type: "node", id: 5, tags: { amenity: "pub", name: "Uten sted" } },
] };
const PUBER = tolkPuber(OSM, LERK);
ok("puber leses med navn, punkt og avstand, naermest forst",
   PUBER.length === 2 && PUBER[0].navn === "Lerkendal Pub" && PUBER[0].avstand < 200 &&
   PUBER[0].tider === "Mo-Su 12:00-01:00" && PUBER[1].navn === "Bybar", JSON.stringify(PUBER));
ok("flater far punktet fra center", PUBER[1].lat === 63.42);
ok("uten navn eller uten punkt faller bort, dobbelt navn en gang", PUBER.length === 2);
ok("uventet svar kaster", kaster(() => tolkPuber({ nope: 1 })) && kaster(() => tolkPuber(null)));

ok("Entur-sporringen ber om holdeplasser rundt punktet",
   enturNaermest(63.413, 10.406, 700).indexOf("nearest(latitude: 63.4130, longitude: 10.4060, maximumDistance: 700") > -1 &&
   enturNaermest(63.413, 10.406, 700).indexOf("filterByPlaceTypes: [stopPlace]") > -1);
const ENTUR = { data: { nearest: { edges: [
  { node: { distance: 120, place: { id: "NSR:StopPlace:1", name: "Lerkendal stadion", latitude: 63.4138, longitude: 10.4050 } } },
  { node: { distance: 120, place: { id: "NSR:StopPlace:1b", name: "Lerkendal stadion", latitude: 63.4138, longitude: 10.4052 } } },
  { node: { distance: 480, place: { id: "NSR:StopPlace:2", name: "Nardo", latitude: 63.4110, longitude: 10.4130 } } },
  { node: { distance: 500, place: {} } },
] } } };
const HOLD = tolkHoldeplasser(ENTUR);
ok("holdeplasser leses, samme navn en gang, tomme faller bort",
   HOLD.length === 2 && HOLD[0].navn === "Lerkendal stadion" && HOLD[0].avstand === 120 && HOLD[1].navn === "Nardo",
   JSON.stringify(HOLD));
ok("uten svar fra Entur er lista tom", tolkHoldeplasser(null).length === 0 && tolkHoldeplasser({ errors: [] }).length === 0);

const ALLE = [
  { navn: "Lerkendal Pub", lat: 63.4140, lon: 10.4070 },
  { navn: "Nardo Bar", lat: 63.4112, lon: 10.4128 },
  { navn: "Langt unna", lat: 63.4300, lon: 10.3900 },
];
const GRUPPER = grupperPuber(ALLE, Object.assign({ navn: "Lerkendal" }, LERK), HOLD);
ok("ved stadion: innen 800 m, naermest forst",
   GRUPPER[0].tittel === "Ved Lerkendal" && GRUPPER[0].puber.map((p) => p.navn).join(",") === "Lerkendal Pub,Nardo Bar",
   JSON.stringify(GRUPPER[0]));
ok("ved holdeplass: innen 300 m fra den",
   GRUPPER.some((g) => g.tittel === "Ved Nardo" && g.puber.length === 1 && g.puber[0].navn === "Nardo Bar"),
   JSON.stringify(GRUPPER));
ok("holdeplass uten puber rundt gir ingen gruppe, og langt unna er ikke med",
   JSON.stringify(GRUPPER).indexOf("Langt unna") === -1);

let dine = noterPub([], "Pub X", 1000);
dine = noterPub(dine, "Bar Y", 2000);
dine = noterPub(dine, "pub x", 3000);
ok("en delt pub telles, uavhengig av store og sma bokstaver",
   dine.length === 2 && dine[0].navn === "Pub X" && dine[0].antall === 2 && dine[0].sist === 3000, JSON.stringify(dine));
ok("oftest brukt forst, sa sist brukt", ofteBrukt(dine)[0].navn === "Pub X" &&
   ofteBrukt([{ navn: "A", antall: 1, sist: 1 }, { navn: "B", antall: 1, sist: 2 }])[0].navn === "B");
ok("tomt navn endrer ingenting", noterPub(dine, "  ").length === 2);
ok("hoyst fem forslag", ofteBrukt(Array.from({ length: 9 }, (_, i) => ({ navn: "P" + i, antall: i }))).length === 5);
ok("odelagt lagring gir tom liste", ofteBrukt("rart").length === 0 && ofteBrukt([null, { antall: 3 }]).length === 0);

/* ---------------- kuratert publiste ---------------- */

// Vokteren skal holde lista redigerbar for hvem som helst. Den ekte
// lista ma passere; da slar en feilskrevet rad ut i testene framfor i
// appen.
ok("den kuraterte lista holder formen", sjekkPubliste(KURATERTE).length === 0,
   sjekkPubliste(KURATERTE).join(" | "));
ok("lista har innhold og er datert",
   KURATERTE.length >= 20 && KURATERTE.every((p) => p.sjekket >= "2026-01-01"),
   KURATERTE.length);
// Én regel for fila og for basen. Den var «ma vaere en URL» til
// 16. september 2026, og det stengte ute den lille puben uten nettside.
// Na er den «si hvordan vi vet det» — en lenke, eller en setning.
ok("hver rad sier hvordan vi vet det",
   KURATERTE.every((p) => kildeHolder(p.kilde)),
   KURATERTE.filter((p) => !kildeHolder(p.kilde)).map((p) => p.navn).join(", "));

function rad(endring) {
  return Object.assign({ navn: "Testpuben", bydel: "Sentrum", adresse: "Gata 1",
    lat: 59.913, lon: 10.74, type: "pub", kilde: "https://eksempel.no",
    sikkerhet: "bekreftet", sjekket: "2026-09-11" }, endring);
}
ok("en riktig rad gir ingen feil", sjekkPubliste([rad()]).length === 0, sjekkPubliste([rad()]));
ok("manglende felt fanges", sjekkPubliste([rad({ kilde: "" })])[0].indexOf("mangler kilde") > -1,
   sjekkPubliste([rad({ kilde: "" })]));
// Ramma var Oslo alene til 18. september 2026. Da var lat 63.43 —
// Trondheim — «utenfor omradet», og en RBK-pub kunne ikke lagres.
ok("en rad i en annen by vi kjenner slipper gjennom",
   sjekkPubliste([rad({ lat: 63.4305, lon: 10.3951 })]).length === 0,
   sjekkPubliste([rad({ lat: 63.4305, lon: 10.3951 })]).join(" | "));
// Vakta er mot skrivefeil, og den viktigste er lat og lon byttet om: da
// havner en Oslo-pub i Somalia, og tallene ser fortsatt riktige ut.
// Joinet, ikke [0]: en tom liste er nettopp det denne testen skal fange,
// og da skal den si «fanget ingenting» framfor a velte pa undefined.
ok("koordinat utenfor alle byene fanges",
   sjekkPubliste([rad({ lat: 10.74, lon: 59.913 })]).join(" | ").indexOf("utenfor") > -1,
   sjekkPubliste([rad({ lat: 10.74, lon: 59.913 })]).join(" | ") || "(ingen feil)");
ok("og meldinga sier hvilke byer som finnes",
   sjekkPubliste([rad({ lat: 48.85, lon: 2.35 })]).join(" | ").indexOf("Trondheim") > -1,
   sjekkPubliste([rad({ lat: 48.85, lon: 2.35 })]).join(" | ") || "(ingen feil)");
// Med en ramme gjelder bare den: det er soket i portalen, som leter i én
// by om gangen.
ok("en oppgitt ramme snevrer inn igjen",
   sjekkPubliste([rad({ lat: 63.4305, lon: 10.3951 })], rammeFor("oslo")).length === 1,
   sjekkPubliste([rad({ lat: 63.4305, lon: 10.3951 })], rammeFor("oslo")).join(" | "));
ok("ukjent type og sikkerhet fanges",
   sjekkPubliste([rad({ type: "kafe" })]).length === 1 &&
   sjekkPubliste([rad({ sikkerhet: "kanskje" })]).length === 1);
// En udatert rad er verre enn ingen rad: Oslos uteliv flytter seg fort.
ok("dato som ikke er en dato fanges",
   sjekkPubliste([rad({ sjekket: "i fjor" })])[0].indexOf("ikke en dato") > -1);
// Et ikke-svar fanges, et svar slipper gjennom. Formen kan ikke skille en
// god kilde fra en darlig — men den kan skille et svar fra et ikke-svar.
// join(), ikke [0]: en assertion som plukker fra en tom liste kaster, og
// da river den de neste to hundre med seg framfor a bli rod. Samme felle
// som ble lagt i hendelsesloggen 16. september — og skrevet pa nytt her
// samme dag, sa den star igjen.
ok("en kilde som ikke sier noe fanges",
   sjekkPubliste([rad({ kilde: "ok" })]).join(" | ").indexOf("hvordan vi vet det") > -1,
   sjekkPubliste([rad({ kilde: "ok" })]).join(" | "));
ok("og en kilde pa to ord er fortsatt for lite",
   sjekkPubliste([rad({ kilde: "sa en venn" })]).length === 1);
ok("men en setning som sier hvordan holder",
   sjekkPubliste([rad({ kilde: "Var innom 16.09.2026, storskjerm i baren" })]).length === 0,
   sjekkPubliste([rad({ kilde: "Var innom 16.09.2026, storskjerm i baren" })]).join(" | "));
ok("en lenke holder som for", kildeHolder("https://eksempel.no"));
ok("og tom kilde melder «mangler», ikke «hvordan»",
   sjekkPubliste([rad({ kilde: "" })]).length === 1 &&
   sjekkPubliste([rad({ kilde: "" })]).join(" | ").indexOf("mangler kilde") > -1,
   sjekkPubliste([rad({ kilde: "" })]).join(" | "));
ok("samme sted to ganger fanges",
   sjekkPubliste([rad(), rad({ navn: "testpuben" })]).some((f) => f.indexOf("to ganger") > -1));
ok("noe annet enn en liste fanges", sjekkPubliste("nei").length === 1);

// Uten nettverk i det hele tatt: lista alene svarer «hva er i naerheten».
const OSLO_S = { lat: 59.911, lon: 10.750 };
const NAER = kuraterteNaer(KURATERTE, OSLO_S, 1500);
ok("kuraterte steder i naerheten, naermest forst",
   NAER.length > 3 && NAER.every((p, i) => i === 0 || p.avstand >= NAER[i - 1].avstand),
   NAER.slice(0, 3).map((p) => p.navn + " " + p.avstand).join(", "));
ok("alle innenfor radien", NAER.every((p) => p.avstand <= 1500));
ok("et sted langt unna er ikke med",
   kuraterteNaer(KURATERTE, { lat: 63.413, lon: 10.406 }, 1500).length === 0);
ok("tom liste eller ingen posisjon gir ingenting",
   kuraterteNaer([], OSLO_S, 1500).length === 0 && kuraterteNaer(KURATERTE, null, 1500).length === 0);

// OpenStreetMap vet at det er en pub; lista vet at de viser fotball.
const FRA_OSM = [{ navn: "Carls", lat: 59.927, lon: 10.778 }, { navn: "Ukjent Bar", lat: 59.9, lon: 10.7 }];
const MERKET = merkKuraterte(FRA_OSM, KURATERTE);
ok("kjente steder merkes, resten star urort",
   MERKET[0].viserFotball === true && MERKET[0].lag.indexOf("Brann") > -1 &&
   MERKET[1].viserFotball === undefined, JSON.stringify(MERKET));
ok("tom kuratert liste endrer ingenting", merkKuraterte(FRA_OSM, []) === FRA_OSM);

// «Dine puber» baerer BARE et navn: dinePuber() lagrer {navn, antall,
// sist} i nettleseren. Uten koordinat ga avstandTil() null, naerNok()
// svarte ja, og Andy's Pub sto blant stedene naer en leser i Trondheim —
// 390 km unna, uten by og uten km. Tallene sto i puber.js hele tiden.
const BARE_NAVN = merkKuraterte([{ navn: "Andy's Pub" }], KURATERTE);
ok("en rad med bare et navn far koordinatet fra lista",
   Number.isFinite(BARE_NAVN[0].lat) && Number.isFinite(BARE_NAVN[0].lon),
   JSON.stringify(BARE_NAVN[0]));
ok("og bydelen, sa raden kan si hvor den er",
   BARE_NAVN[0].bydel === "Sentrum", BARE_NAVN[0].bydel);

// Men bare det som MANGLER fylles. Et treff fra kartet baerer sitt eget
// punkt, og de to kan peke pa hver sin inngang — det er OSM-punktet raden
// ble funnet paa.
//
// Punktet her er med vilje ET ANNET enn fila sitt. Forste utkast brukte
// karttreffets egne tall fra FRA_OSM, som er NOYAKTIG de samme som i
// puber.js — og da sto testen gronn ogsa naar koden overskrev. Ikke still
// scenen der svaret er opplagt: se docs/testing.md.
const OSM_ANNET = merkKuraterte([{ navn: "Carls", lat: 59.1, lon: 10.1 }], KURATERTE);
ok("et karttreff beholder sitt eget koordinat",
   OSM_ANNET[0].lat === 59.1 && OSM_ANNET[0].lon === 10.1,
   OSM_ANNET[0].lat + ", " + OSM_ANNET[0].lon);
// Bydelen er den samme regelen: fila sin brukes bare naar raden mangler.
const OSM_BYDEL = merkKuraterte([{ navn: "Carls", bydel: "Et annet sted" }], KURATERTE);
ok("og sin egen bydel", OSM_BYDEL[0].bydel === "Et annet sted", OSM_BYDEL[0].bydel);

// Og et sted vi ikke kjenner far ingenting. Da VET vi ikke, og da skal
// ingenting dempes: se naerNok i fotball.js.
const UTENFOR_LISTA = merkKuraterte([{ navn: "Kroa til Kari" }], KURATERTE);
ok("et sted utenfor lista far verken merke eller koordinat",
   UTENFOR_LISTA[0].viserFotball === undefined &&
   UTENFOR_LISTA[0].lat === undefined,
   JSON.stringify(UTENFOR_LISTA[0]));

/* ---------------- visninger ---------------- */

const VKAMPER = [
  { id: 11, hjemme: "Brann", borte: "Bodø/Glimt", dato: "2026-09-13T15:00:00Z" },
  { id: 12, hjemme: "Molde", borte: "Rosenborg", dato: "2026-09-14T17:00:00Z" },
];
const VNAA = Date.parse("2026-09-11T10:00:00Z");

const SATT = slaSammen("Carls", ["2026-09-13-brann-bodoglimt"], VKAMPER, VNAA);
ok("en valgt kamp blir en visning",
   SATT.length === 1 && SATT[0].pub === "Carls" &&
   SATT[0].kamp === "Brann – Bodø/Glimt" && SATT[0].satt === new Date(VNAA).toISOString(),
   JSON.stringify(SATT));
// Ikke kildens id: en id herfra pekte pa ingenting sa snart runden kom
// fra den andre kilden, og «denne kampen vises pa» forsvant.
ok("visningen lagres pa kampens nokkel, ikke pa id-en",
   SATT[0].kampId === "2026-09-13-brann-bodoglimt", SATT[0].kampId);

// Avkrysningene kommer som nokler fra portalen, i den rekkefolgen admin
// trykket. Radene sorteres pa dato uansett.
const TO = slaSammen("Carls",
  ["2026-09-14-molde-rosenborg", "2026-09-13-brann-bodoglimt"], VKAMPER, VNAA);
ok("bare de avkryssede blir rader",
   TO.length === 2 && TO.every((v) => v.pub === "Carls"), JSON.stringify(TO));
ok("lista er sortert pa dato",
   TO[0].kampId === "2026-09-13-brann-bodoglimt" && TO[1].kampId === "2026-09-14-molde-rosenborg",
   TO.map((v) => v.dato).join(","));
// Tall-id-en fra den gamle visninger.js er borte med fila. En avkrysning
// som bare barer kildens id velger derfor ingenting — den kan ikke
// oppsta fra portalen, og skal ikke bli en rad ved et uhell.
ok("kildens id alene velger ingenting", slaSammen("Carls", [11], VKAMPER, VNAA).length === 0);
ok("ingen avkrysninger gir ingen rader", slaSammen("Carls", [], VKAMPER, VNAA).length === 0);

// Radene slik de star i basen: med nokkel.
const ALLE_VISNINGER = [
  { pub: "Lincoln Pub", kampId: "2026-09-13-brann-bodoglimt", kamp: "Brann – Bodø/Glimt",
    dato: "2026-09-13T15:00:00Z", satt: "x" },
  { pub: "Carls", kampId: "2026-10-01-a-b", kamp: "Gammel", dato: "2026-10-01T15:00:00Z", satt: "x" },
];
ok("visninger for en kamp finnes",
   visningerFor(VKAMPER[0], ALLE_VISNINGER).length === 1 &&
   visningerFor(VKAMPER[0], ALLE_VISNINGER)[0].pub === "Lincoln Pub");
ok("en rad med kildens id treffer ikke",
   visningerFor(VKAMPER[0], [{ pub: "Lincoln Pub", kampId: 11, kamp: "x",
     dato: VKAMPER[0].dato, satt: "x" }]).length === 0);
ok("ingen visninger gir tom liste",
   visningerFor(VKAMPER[1], ALLE_VISNINGER).length === 0 &&
   visningerFor(null, ALLE_VISNINGER).length === 0);

// Lesersiden: hvem viser denne kampen, med det vi ellers vet om stedet.
const BEK = bekreftetFor(VKAMPER[0], ALLE_VISNINGER, KURATERTE);
ok("bekreftede puber hentes for kampen", BEK.length === 1 && BEK[0].navn === "Lincoln Pub",
   JSON.stringify(BEK.map((p) => p.navn)));
ok("og de er merket som bekreftet", BEK[0].bekreftet === true);
ok("de barer med seg det vi vet om stedet fra publista",
   typeof BEK[0].lat === "number" && !!BEK[0].bydel, JSON.stringify(BEK[0]));
// En pub som er tatt ut av publista skal ikke forsvinne stumt.
const UKJENT = bekreftetFor(VKAMPER[0],
   [{ pub: "Nedlagt Pub", kampId: "2026-09-13-brann-bodoglimt", kamp: "x",
      dato: "2026-09-20T15:00:00Z", satt: "x" }], KURATERTE);
ok("en pub utenfor publista star med navnet sitt",
   UKJENT.length === 1 && UKJENT[0].navn === "Nedlagt Pub" && UKJENT[0].bekreftet === true);

// Samme pub kan dukke opp i flere grupper, og skal se lik ut overalt.
const BEK_MERKET = merkBekreftet(
   [{ navn: "Lincoln Pub" }, { navn: "Carls" }], BEK);
ok("bekreftet settes pa treff som star i lista", BEK_MERKET[0].bekreftet === true);
ok("og ikke pa de andre", BEK_MERKET[1].bekreftet === undefined);
ok("merkingen folder skrivematen",
   merkBekreftet([{ navn: "lincoln pub" }], BEK)[0].bekreftet === true);
ok("uten bekreftede skjer ingenting",
   merkBekreftet([{ navn: "Carls" }], []).length === 1 &&
   merkBekreftet([{ navn: "Carls" }], [])[0].bekreftet === undefined);

const PUBNAVN = KURATERTE.map((p) => p.navn);
ok("gyldige visninger gir ingen feil", sjekkVisninger(SATT, PUBNAVN).length === 0,
   sjekkVisninger(SATT, PUBNAVN).join(" | "));
// Navnene i raden til stedet. Kortet svarer pa «hvor skal jeg?», sa det
// er deg selv man leter etter i lista — derfor staar du forst, og heter
// «Du».
// tolkSvar ma tale a kjores to ganger.
//
// Dette er testen som manglet, og den manglet fra dag én. Funksjonen
// deles mellom tjenesten og appen, og begge kjorer den: svar.mjs tolker
// PostgREST-radene (kamp_id) for den svarer, og fotball.js tolker svaret
// én gang til. Andre gang fantes ikke kamp_id — feltet het kampId — sa
// kamp-id-en ble tom, hver rad ble noklet under «», og «blir med»-lista
// var usynlig for alle, bestandig.
const FRA_BASEN = [{ kamp_id: "2026-09-14-bodoglimt-sandefjord", navn: "Rune",
  hvor: "pub", sted: "Andy's Pub", bruker: "u-1" }];
const EN_GANG = tolkSvar(FRA_BASEN);
const TO_GANGER = tolkSvar(EN_GANG);
ok("tjenesten tolker basens rad", EN_GANG[0].kampId === "2026-09-14-bodoglimt-sandefjord",
   JSON.stringify(EN_GANG[0]));
ok("og appen kan tolke svaret én gang til uten a miste kampen",
   TO_GANGER[0].kampId === "2026-09-14-bodoglimt-sandefjord", JSON.stringify(TO_GANGER[0]));
ok("to ganger gir noyaktig det samme som én",
   JSON.stringify(TO_GANGER) === JSON.stringify(EN_GANG),
   JSON.stringify(EN_GANG) + " vs " + JSON.stringify(TO_GANGER));
// En rad uten kamp i det hele tatt skal fortsatt bli tom, ikke
// «undefined»: den skal falle utenfor ethvert oppslag.
ok("en rad uten kamp gir tom id",
   tolkSvar([{ navn: "Rune", bruker: "u-1" }])[0].kampId === "");

function nrad(navn, bruker) {
  return { kampId: "k", navn, bruker, hvor: "pub", sted: "Pub X" };
}
const NR_FOLK = [nrad("Per", "u2"), nrad("Line", "u3"), nrad("Ida", "u4"),
                 nrad("Kari", "u5"), nrad("Mats", "u6"), nrad("Anna", "u7"),
                 nrad("Rune", "u1")];
const NR_MEG = navnIRad(NR_FOLK, "u1");
ok("du staar forst i raden, og heter «Du»", NR_MEG.navn[0] === "Du", NR_MEG.navn.join(","));
ok("ditt eget navn staar ikke ogsa",
   NR_MEG.navn.indexOf("Rune") === -1, NR_MEG.navn.join(","));
// Er det flere enn det er plass til, vises én faerre enn taket: ellers
// tar «+1 andre» like mye plass som navnet den skjulte.
ok("de som ikke far plass telles",
   NR_MEG.navn.length === NAVN_I_RAD - 1 && NR_MEG.flere === 3,
   NR_MEG.navn.length + " + " + NR_MEG.flere);
const NR_FAA = navnIRad(NR_FOLK.slice(0, 3), "u9");
ok("er det faa nok, telles ingen",
   NR_FAA.navn.length === 3 && NR_FAA.flere === 0, JSON.stringify(NR_FAA));
ok("er du ikke der selv, staar bare navnene",
   NR_FAA.navn.indexOf("Du") === -1, NR_FAA.navn.join(","));
// Et navn som ikke er et navn skal ikke fylle en plass i raden.
ok("rader uten et gyldig navn faller ut",
   navnIRad([nrad("•••", "u2"), nrad("Per", "u3")], "u1").navn.join(",") === "Per");
ok("ingen svar gir ingen navn", navnIRad([], "u1").navn.length === 0);

function vrad(endring) {
  return Object.assign({ pub: "Carls", kampId: 11, kamp: "A – B",
    dato: "2026-09-13T15:00:00Z", satt: "2026-09-11T10:00:00Z" }, endring);
}
ok("ukjent pub fanges", sjekkVisninger([vrad({ pub: "Utepils AS" })], PUBNAVN)[0].indexOf("ukjent pub") > -1);
ok("manglende felt fanges", sjekkVisninger([vrad({ kamp: "" })], PUBNAVN)[0].indexOf("mangler kamp") > -1);
ok("kampId med ugyldig form fanges",
   sjekkVisninger([vrad({ kampId: "2026-09-13-a,b" })], PUBNAVN)
     .some((f) => f.indexOf("ugyldig form") > -1));
ok("en nokkel er en gyldig kampId",
   sjekkVisninger([vrad({ kampId: "2026-09-13-brann-bodoglimt" })], PUBNAVN).length === 0);
ok("ugyldig dato fanges",
   sjekkVisninger([vrad({ dato: "snart" })], PUBNAVN)[0].indexOf("ikke en dato") > -1);
ok("samme pub og kamp to ganger fanges",
   sjekkVisninger([vrad(), vrad()], PUBNAVN).some((f) => f.indexOf("to ganger") > -1));
ok("noe annet enn en liste fanges", sjekkVisninger("nei", PUBNAVN).length === 1);

// Radene kommer fra PostgREST na, ikke fra en fil i repoet (#79).
//
// **Ma tale a kjores to ganger**, og det er ikke pedanteri: nøyaktig den
// feilen gjorde «blir med»-lista usynlig for alle i tre dager. Tjenesten
// tolker radene for den svarer, appen tolker svaret en gang til — og
// andre gang finnes ikke `kamp_id`, feltet heter `kampId`.
const VISNING_FRA_BASEN = [{ pub: "Carls", kamp_id: "2026-09-13-brann-molde",
  kamp: "Brann – Molde", dato: "2026-09-13T15:00:00Z", satt: "2026-09-11T10:00:00Z" }];
const EN = tolkVisninger(VISNING_FRA_BASEN);
ok("radene fra basen far appens form", EN.length === 1 && EN[0].kampId === "2026-09-13-brann-molde",
   JSON.stringify(EN));
ok("to kjoringer gir det samme som en",
   JSON.stringify(tolkVisninger(EN)) === JSON.stringify(EN), JSON.stringify(tolkVisninger(EN)));
ok("en rad uten pub eller kamp faller ut",
   tolkVisninger([{ pub: "", kamp_id: "x" }, { pub: "Carls" }]).length === 0);
ok("ingenting gir tom liste, ikke unntak", tolkVisninger().length === 0);

// Den andre veien: satt_av star aldri her. Databasen setter den fra
// okten, som `bruker` i kampsvar — sender funksjonen den selv, kan en
// feil der skrive i en annens navn.
const VISNING_RAD = visningRad({ pub: "Carls", kampId: "2026-09-13-brann-molde",
  kamp: "Brann – Molde", dato: "2026-09-13T15:00:00Z", satt: "2026-09-11T10:00:00Z" });
ok("raden til basen bruker kamp_id",
   VISNING_RAD.kamp_id === "2026-09-13-brann-molde", JSON.stringify(VISNING_RAD));
ok("og sender aldri satt_av",
   !("satt_av" in VISNING_RAD) && !("bruker" in VISNING_RAD), Object.keys(VISNING_RAD).join(","));

// Kampene som sto pa skjermen. Tjenesten rydder puben sine rader for
// akkurat disse, og ingen andre — samme avgrensning som slaSammen.
ok("kamp-id-ene hentes ut av kampene",
   kampIderFor([{ nokkel: "a-b" }, { id: 7 }]).join(",") === "a-b,7",
   kampIderFor([{ nokkel: "a-b" }, { id: 7 }]).join(","));
ok("kamper uten id gir ingen id", kampIderFor([{}]).length === 0);

/* ---------------- steder lesere sender inn (#80) ---------------- */

// Sjekken deles mellom appen og tjenesten. Blir de to uenige om hva et
// gyldig navn er, far leseren «noe er galt» pa noe som stemmer — det
// kostet en kveld sist, da appen kappet en attesifret kode til seks.
ok("et fullt forslag er gyldig",
   sjekkForslag({ navn: "Bar Boca", adresse: "Thorvald Meyers gate 30" }).length === 0,
   sjekkForslag({ navn: "Bar Boca", adresse: "Thorvald Meyers gate 30" }).join(" | "));
ok("uten navn sier den hva som mangler",
   sjekkForslag({ adresse: "Storgata 1" })[0].indexOf("navnet") > -1,
   sjekkForslag({ adresse: "Storgata 1" })[0]);
// Adressen er ikke pynt: koordinatene er anslag fra gateadressen, og uten
// den kan ikke stedet sorteres etter avstand.
ok("uten adresse sier den hvorfor den trengs",
   sjekkForslag({ navn: "Bar Boca" })[0].indexOf("finner stedet") > -1,
   sjekkForslag({ navn: "Bar Boca" })[0]);
ok("mellomrom alene er ikke et navn",
   sjekkForslag({ navn: "   ", adresse: "Storgata 1" }).length === 1);
ok("for langt navn fanges",
   sjekkForslag({ navn: "a".repeat(81), adresse: "Storgata 1" })[0].indexOf("for langt") > -1);
ok("ingenting gir en liste med feil, ikke unntak", sjekkForslag().length === 2);

// Databasen setter foreslatt_av fra okten og status fra sin egen default.
// Sender funksjonen dem selv, kan en feil her skrive i en annens navn —
// eller melde et forslag som ferdig behandlet.
const FRAD = forslagRad({ navn: "  Bar Boca  ", adresse: " Thorvald Meyers gate 30 ",
  viserFotball: true, merknad: "  Storskjerm i kjelleren  " });
ok("navn og adresse trimmes", FRAD.navn === "Bar Boca" && FRAD.adresse === "Thorvald Meyers gate 30",
   JSON.stringify(FRAD));
ok("raden sender aldri foreslatt_av eller status",
   !("foreslatt_av" in FRAD) && !("status" in FRAD), Object.keys(FRAD).join(","));
ok("tom merknad blir null, ikke tom streng",
   forslagRad({ navn: "A", adresse: "B" }).merknad === null);

// Ma tale a kjores to ganger: tjenesten tolker radene for den svarer,
// portalen tolker svaret en gang til.
const FRA_KO = [{ id: "a-b", navn: "Bar Boca", adresse: "Storgata 1",
  viser_fotball: true, merknad: "", foreslatt: "2026-09-15T08:00:00Z", status: "ny" }];
const KO_EN = tolkForslag(FRA_KO);
ok("radene fra basen far appens form",
   KO_EN.length === 1 && KO_EN[0].viserFotball === true, JSON.stringify(KO_EN));
ok("to kjoringer gir det samme som en",
   JSON.stringify(tolkForslag(KO_EN)) === JSON.stringify(KO_EN), JSON.stringify(tolkForslag(KO_EN)));
ok("en ukjent status faller til ny",
   tolkForslag([{ navn: "A", status: "tullete" }])[0].status === "ny");
ok("en rad uten navn faller ut", tolkForslag([{ navn: "" }]).length === 0);

// Samme folding som lagnavnene: «Andys Pub» og «Andy's Pub» er ett sted.
ok("et sted som alt star i lista kjennes igjen",
   alleredeILista("andys pub", [{ navn: "Andy's Pub" }]));
ok("og et nytt sted gjor det ikke",
   !alleredeILista("Bar Boca", [{ navn: "Andy's Pub" }]));
ok("tomt navn treffer ingenting", !alleredeILista("", [{ navn: "Andy's Pub" }]));

// Raden portalen gir deg. Koen skriver ikke til fila — det er hele
// poenget — sa teksten ma vaere klar til a limes inn, og ma holde formen
// sjekkPubliste vokter nar koordinater og kilde er fylt ut.
const LIMES = publisteRad({ navn: "Bar Boca", adresse: "Storgata 1" },
  Date.UTC(2026, 8, 15));
ok("raden baerer navnet og adressen",
   LIMES.indexOf('"Bar Boca"') > -1 && LIMES.indexOf('"Storgata 1"') > -1, LIMES);
ok("og dagens dato som sjekket", LIMES.indexOf('"2026-09-15"') > -1, LIMES);
// Oppdiktede koordinater ville vaert verre enn ingen rad: de ser riktige
// ut og sorterer feil.
ok("koordinatene star tomme, ikke gjettet",
   LIMES.indexOf("lat: 0, lon: 0") > -1 && LIMES.indexOf("kilde: \"\"") > -1, LIMES);
// Teksten havner i en fil som kjores som kode.
const OND_PUB = publisteRad({ navn: '" };evil()//', adresse: "A" });
ok("anforselstegn i et navn bryter ikke ut av strengen",
   OND_PUB.indexOf('\\"') > -1, OND_PUB);
ok("en merknad blir med nar den finnes",
   publiste_med_merknad().indexOf("Storskjerm") > -1, publiste_med_merknad());
function publiste_med_merknad() {
  return publisteRad({ navn: "A", adresse: "B", merknad: "Storskjerm" });
}

/* ---- tipset om at stedet ikke viser fotball ---- */

// ADR 0022 satte et gjettet sted inn i lista, merket som antatt. Uten en
// vei tilbake er det gjetning med bedre typografi — og lista blir
// daarligere for hver by vi fyller. Dette er veien tilbake.
//
// `viser_fotball` hadde to verdier og tre betydninger: portalen viste
// `false` som «uvisst om de viser fotball», et ord dataene aldri sa. Ingen
// rad i basen har noen gang vaert `false`, og boksen som kunne satt den er
// ute av appen. Na er `false` tipset.
ok("en uttrykt false er et tips", erTips({ viserFotball: false }));
ok("true er ikke et tips", !erTips({ viserFotball: true }));
// Den viktigste: et felt som MANGLER skal ikke leses som et tips. En glemt
// linje hos den som kaller, ville ellers sagt at stedet er feil.
ok("og et felt som mangler er ingenting", !erTips({ navn: "A" }));
ok("null er ikke et tips", !erTips(null));

// Samme vakt i raden som gar til basen: bare en uttrykt false skriver false.
ok("forslagRad gjor ikke en glemt linje til et tips",
   forslagRad({ navn: "A", adresse: "B" }).viser_fotball === true,
   JSON.stringify(forslagRad({ navn: "A", adresse: "B" })));
ok("og en uttrykt false blir staaende",
   forslagRad({ navn: "A", adresse: "B", viserFotball: false }).viser_fotball === false);

// Vekta: et tips om noe vi GJETTET paa koster oss ingenting aa ta imot, et
// tips om noe noen har staatt i doera paa krever en vurdering. Den leses av
// LISTA — `sikkerhet` staar der, og et felt ved siden av i koen kunne vaert
// uenig med den.
const LISTA_NA = [
  { navn: "Gjettepuben", sikkerhet: "usikker" },
  { navn: "Andy's Pub", sikkerhet: "bekreftet" },
];
ok("tips om et antatt sted veier tyngst",
   forslagVekt({ navn: "Gjettepuben", viserFotball: false }, LISTA_NA) === 0);
ok("tips om et bekreftet sted er en vurdering",
   forslagVekt({ navn: "Andy's Pub", viserFotball: false }, LISTA_NA) === 1);
// Foldes navnet ikke, ville «andys pub» falt i lag 1 fordi lista sier
// «Andy's Pub» — samme folding som alleredeILista.
ok("og navnet foldes som ellers",
   forslagVekt({ navn: "andys pub", viserFotball: false }, LISTA_NA) === 1);
ok("et tips om et sted vi ikke har er ogsa bare et tips",
   forslagVekt({ navn: "Ukjent", viserFotball: false }, LISTA_NA) === 1);
ok("og et vanlig forslag staar bakerst",
   forslagVekt({ navn: "Gjettepuben", viserFotball: true }, LISTA_NA) === 2);

// Koen: tipsene forst, og ELDST forst innenfor hvert lag. Koen er arbeid
// som ligger, ikke et varsel — et forslag som stadig skyves ned av nyere
// blir aldri behandlet.
const KOEN = sorterForslagKo([
  { navn: "Nytt sted", viserFotball: true, foreslatt: "2026-09-01" },
  { navn: "Andy's Pub", viserFotball: false, foreslatt: "2026-09-10" },
  { navn: "Gjettepuben", viserFotball: false, foreslatt: "2026-09-19" },
  { navn: "Gjettepuben", viserFotball: false, foreslatt: "2026-09-12" },
], LISTA_NA);
ok("tipsene om antatte steder staar forst",
   KOEN[0].foreslatt === "2026-09-12" && KOEN[1].foreslatt === "2026-09-19",
   KOEN.map((f) => f.navn + "/" + f.foreslatt).join(" "));
ok("saa tipset som krever en vurdering",
   KOEN[2].navn === "Andy's Pub", KOEN[2].navn);
ok("og forslaget bakerst, selv om det er eldst",
   KOEN[3].navn === "Nytt sted", KOEN[3].navn);
ok("koen rorer ikke lista den far",
   (function () {
     const inn = [{ navn: "B", viserFotball: true, foreslatt: "2" },
                  { navn: "A", viserFotball: false, foreslatt: "1" }];
     sorterForslagKo(inn, LISTA_NA);
     return inn[0].navn === "B";
   })());
ok("tomt inn gir tomt ut", sorterForslagKo(null, LISTA_NA).length === 0);

/* ---------------- sonden mot TheSportsDB ---------------- */

// Stiene og malingen ligger i fotball-data.js og ikke i verktoyet, fordi
// TO ting spor: verktoy/tsdbsjekk.mjs fra en maskin, og /api/tsdb-sonde
// fra portalen. Sto de hver for seg, ville de svart ulikt pa det samme.
const SONDE = tsdbSondeStier(LIGAER.eliteserien, "2026", "hemmelig", {});
ok("sonden prover seks adresser", SONDE.length === 6, SONDE.length);
// Kallet vi VET virker staar forst, og det er ikke tilfeldig: svaret
// baerer lag-id-en resten av kjeden trenger. Sto det sist, rok kjeden
// hver gang gjetningene over svarte 404 — uten at noe var galt.
ok("det vi bruker i dag staar forst",
   SONDE[0].sti.indexOf("eventspastleague") > -1, SONDE[0].sti);
ok("og den gir lag-id-en videre", SONDE[0].gir === "lag", SONDE[0].gir);
// En gjetning skal VISE at den er en gjetning. En 404 pa et navn vi fant
// paa, er ikke et nei til dataene.
ok("v2-toppscorer er merket som en gjetning",
   SONDE.filter((p) => p.gjetning).length === 1 &&
   SONDE.find((p) => p.gjetning).sti.indexOf("topscorers") > -1);
ok("spillerstatistikken krever en spiller-id",
   SONDE.find((p) => p.sti.indexOf("lookupplayerstats") > -1).krever === "spiller");
// Nokkelen gar i stien pa v1, og det er nettopp derfor sporringa ikke
// kan gjores fra en nettleser.
ok("nokkelen star i v1-stien, ikke i v2",
   SONDE[0].sti.indexOf("hemmelig") > -1 &&
   SONDE.find((p) => p.versjon === "v2").sti.indexOf("hemmelig") === -1);
ok("en liga uten tsdb-id gir ingen adresser",
   tsdbSondeStier({ navn: "X" }, "2026", "k", {}).length === 0);

// Feltnavnet varierer mellom utgavene, sa vi leter etter om dataene
// FINNES framfor etter et navn vi alt hadde gjettet.
ok("forste liste finnes uansett hva den heter",
   tsdbForsteListe({ tullete: [1, 2] }, "events").felt === "tullete");
ok("men det onskede feltet vinner nar det er der",
   tsdbForsteListe({ events: [1], annet: [2, 3] }, "events").felt === "events");
ok("ingen liste gir null", tsdbForsteListe({ events: null }, "events") === null);

// DET SOM AVGJOR: baerer raden mal, og staar sesongen pa den? Uten begge
// kan den ikke bli en toppscorerliste uansett hvor mange kall vi bruker.
const STATS = tsdbSondeFunn([{ idPlayer: "1", strSeason: "2026", intGoals: "12" }]);
ok("malfeltet finnes pa innhold, ikke pa et gjettet navn",
   STATS.maalfelt.join(",") === "intGoals", STATS.maalfelt.join(","));
ok("og sesongfeltet likesa",
   STATS.sesongfelt.join(",") === "strSeason", STATS.sesongfelt.join(","));
ok("en rad uten mal sier det",
   tsdbSondeFunn([{ idPlayer: "1", strSeason: "2026" }]).maalfelt.length === 0);

// Runder avgjor om «alle runder» er mulig i det hele tatt: en sesong
// uten rundetall kan ikke grupperes, uansett hvor mange kamper som kom.
ok("rundene telles, unike",
   tsdbSondeFunn([{ intRound: "23" }, { intRound: "23" }, { intRound: "22" }]).runder === 2);
ok("og en sesong uten rundetall gir null",
   tsdbSondeFunn([{ idEvent: "1" }, { idEvent: "2" }]).runder === 0);
ok("tomt inn kaster ikke", tsdbSondeFunn(null).rader === 0);

// Kjeden: id-ene plukkes ut av svarene, sa ingen maa finne dem for hand.
ok("lag-id plukkes ut av en kampliste",
   tsdbPlukkId([{ idHomeTeam: "133604" }], "lag") === "133604");
ok("spiller-id ut av en spillerliste",
   tsdbPlukkId([{ idPlayer: "34145937" }], "spiller") === "34145937");
ok("og en liste uten id gir tom streng, ikke et gjettet tall",
   tsdbPlukkId([{ strPlayer: "Ola" }], "spiller") === "");

// Feltnavnene alene svarer ikke.
//
// Sonden viser de tolv forste, og `intHomeScore` var ikke blant dem i
// sesongsvaret 21. september 2026. «Er feltene der» er dessuten feil
// sporsmal — det riktige er om VAAR EGEN parser gir kamper vi kan VISE.
const SESONGSVAR = { events: [
  { idEvent: "1", intRound: "23", strHomeTeam: "Brann", strAwayTeam: "Viking",
    intHomeScore: "2", intAwayScore: "1", strTimestamp: "2026-09-20T17:00:00",
    strStatus: "Match Finished" },
  { idEvent: "2", intRound: "30", strHomeTeam: "Molde", strAwayTeam: "Rosenborg",
    intHomeScore: null, intAwayScore: null, strTimestamp: "2026-11-20T17:00:00" },
] };
const PARSET = tsdbSondeParset(SESONGSVAR, Date.UTC(2026, 8, 25));
ok("sonden kjorer den ekte parseren", PARSET.kamper === 2, PARSET.kamper);
// Hele sesongen kommer i ett svar, ogsa kamper som ikke er spilt. Skal
// den bli en resultatliste, ma de skilles — og tallet sier om de kan det.
ok("og skiller spilte fra uspilte", PARSET.spilt === 1, PARSET.spilt);
ok("og teller dem med resultat", PARSET.medResultat === 1, PARSET.medResultat);
ok("og dem med rundetall", PARSET.medRunde === 2, PARSET.medRunde);
// Et tall kan vaere riktig av feil grunn; en rad kan leses.
ok("og viser en ferdig rad",
   PARSET.prove === "Runde 23: Brann 2–1 Viking  (2026-09-20)", PARSET.prove);

// DET SOM AVSLORER et svar uten resultater: null i stillinga. Uten dette
// ville et sesongsvar uten `intHomeScore` sett helt i orden ut — 240
// kamper, 30 runder — og Resultater blitt tom.
const UTEN_MAL = tsdbSondeParset({ events: [
  { idEvent: "1", intRound: "23", strHomeTeam: "Brann", strAwayTeam: "Viking",
    strTimestamp: "2026-09-20T17:00:00" }] }, Date.UTC(2026, 8, 25));
ok("et svar uten resultater avslores",
   UTEN_MAL.kamper === 1 && UTEN_MAL.spilt === 0 && UTEN_MAL.medResultat === 0,
   JSON.stringify(UTEN_MAL));
ok("og raden viser null der stillinga skulle statt",
   UTEN_MAL.prove.indexOf("null–null") > -1, UTEN_MAL.prove);

// En parser som kaster skal si det, ikke se ut som null kamper.
ok("en parser som kaster sier hva den sa",
   !!tsdbSondeParset({ tullete: 1 }).feil, JSON.stringify(tsdbSondeParset({ tullete: 1 })));

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
// for kort eller en liga lagt til uten a regne pa det. Tallet regnes av
// de ligaene som faktisk star i LIGAER, ikke av et tall skrevet inn her:
// et tall her ville blitt staende nar en liga kom til.
ok("ligaene vi har holder seg under dognkvoten",
   kallPerDogn(Object.keys(LIGAER).length) <= DOGNKVOTE,
   kallPerDogn(Object.keys(LIGAER).length));
// Det omvendte vernet. Kvoten kan alltid holdes ved a la alt bli gammelt,
// og da star testen over gronn mens tabellen er et dogn gammel. Et halvt
// dogn er taket: lenger, og tallene er ikke lenger dagens.
ok("og ingen levetid er sa lang at tallene blir gamle",
   Object.keys(LEVETID).every((del) => LEVETID[del] <= 12 * 3600),
   JSON.stringify(LEVETID));
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
// Resultater spor om HELE sesongen. `&last=10` sto her, og ti kamper er
// godt over én runde i Eliteserien — da sa fanen «kun siste runde», meldt
// 21. september 2026. Det koster ingen ekstra kall: samme endepunkt,
// samme ene foresporsel.
ok("resultater spor om alle spilte kamper i sesongen",
   apiSti("resultater", LIGAER.premier, 2026) ===
     "/fixtures?league=39&season=2026&status=FT",
   apiSti("resultater", LIGAER.premier, 2026));
ok("og kapper dem ikke til et vindu",
   apiSti("resultater", LIGAER.premier, 2026).indexOf("last=") === -1,
   apiSti("resultater", LIGAER.premier, 2026));
// `next` paa neste staar: dét er et vindu FRAMOVER, og en sesong som ikke
// er spilt enda er ingen liste noen blar i.
ok("neste spor om de kommende",
   apiSti("neste", LIGAER.premier, 2026).indexOf("status=NS&next=") > -1,
   apiSti("neste", LIGAER.premier, 2026));
ok("ukjent datasett gir null", apiSti("toppscorere", LIGAER.premier, 2026) === null);

/* ---------------- kategori til liga ---------------- */

// Snarveiene i menyen henger pa denne: heter kategorien det samme som
// ligaen, trenger ingen a fore opp noe.
ok("kategori med ligaens navn treffer",
   ligaForKategori("Eliteserien").nokkel === "eliteserien" &&
   ligaForKategori("Premier League").nokkel === "premier");
// Samme folding som lagnavnene: skrivematen skal ikke avgjore.
ok("skrivemate og norske tegn avgjor ikke",
   ligaForKategori("eliteserien").nokkel === "eliteserien" &&
   ligaForKategori("ELITESERIEN").nokkel === "eliteserien" &&
   ligaForKategori("Premier-League").nokkel === "premier");
// Ingen treff er et normalt svar, ikke en feil: «Kommentar» har ingen
// tabell, og raden skal da se ut som en vanlig rad.
ok("kategori uten liga gir null",
   ligaForKategori("Kommentar") === null && ligaForKategori("Podkast") === null);
ok("tomt navn gir null",
   ligaForKategori("") === null && ligaForKategori(null) === null &&
   ligaForKategori(undefined) === null);
// Aliaset er veien for kategorier som heter noe annet enn ligaen.
ok("aliaset i kategorier treffer ogsa",
   Object.keys(LIGAER).every((n) => Array.isArray(LIGAER[n].kategorier)),
   Object.keys(LIGAER).map((n) => n + ":" + JSON.stringify(LIGAER[n].kategorier)).join(" "));

/* ---------------- sporten bak ligaen ---------------- */

// Forberedt for sport nummer to: alt som er fotballspesifikt i hentingen
// star i SPORTER, og funksjonen leser det derfra. Testene her er
// sommen — de skal slaa ut hvis noen tar fotball tilbake inn i det
// generiske.
ok("ligaene vare peker pa en sport vi kjenner",
   Object.keys(LIGAER).every((n) => !!sportFor(LIGAER[n])),
   Object.keys(LIGAER).join(","));
ok("sporten baerer adressen, nokkelnavnet og vinduet",
   sportFor(LIGAER.premier).api.indexOf("https://") === 0 &&
   sportFor(LIGAER.premier).nokkelnavn.length > 0 &&
   sportFor(LIGAER.premier).sesongvindu.fra > 2000,
   JSON.stringify(sportFor(LIGAER.premier).nokkelnavn));
// En liga uten sport er fotball: feltet kom til etterpa, og en manglende
// verdi skal ikke bli en feil i en funksjon som kjorer i prod.
ok("liga uten sport faller til fotball",
   sportFor({ id: 1 }) === SPORTER.fotball && sportFor(null) === SPORTER.fotball);
ok("ukjent sport faller til fotball ogsa",
   sportFor({ sport: "curling" }) === SPORTER.fotball);
// Stien og parserne hentes fra sporten, ikke fra en fast import.
ok("sporten bygger sin egen sti",
   sportFor(LIGAER.premier).sti("tabell", LIGAER.premier, 2026) ===
   apiSti("tabell", LIGAER.premier, 2026));

/* ---------------- datasettet, uansett sport ---------------- */

const SVAR_TABELL = { errors: [], response: [{ league: { standings: [[
  { rank: 1, team: { name: "Brann", logo: "https://x.test/b.png" },
    all: { played: 3, win: 2, draw: 1, lose: 0, goals: { for: 5, against: 2 } },
    goalsDiff: 3, points: 7 },
]] } }] };
ok("tabell tolkes gjennom sporten",
   tolkDatasett(sportFor(LIGAER.premier), "tabell", SVAR_TABELL).tabell[0].lag === "Brann");
ok("uten sport brukes fotball, sa en gammel kaller ikke velter",
   tolkDatasett(null, "tabell", SVAR_TABELL).tabell.length === 1);

const SVAR_KAMPER = { errors: [], response: [
  { fixture: { id: 2, date: "2026-09-27T16:00:00+00:00", status: { short: "NS" } },
    league: { round: "Runde 22" }, teams: { home: { name: "Viking" }, away: { name: "Molde" } },
    goals: { home: null, away: null } },
  { fixture: { id: 1, date: "2026-09-20T17:00:00+00:00", status: { short: "NS" } },
    league: { round: "Runde 21" }, teams: { home: { name: "Brann" }, away: { name: "Rosenborg" } },
    goals: { home: null, away: null } },
] };
const nesteSvar = tolkDatasett(sportFor(LIGAER.premier), "neste", SVAR_KAMPER);
ok("neste gir hele vinduet i tidsrekkefolge",
   nesteSvar.kamper.length === 2 && nesteSvar.kamper[0].hjemme === "Brann",
   nesteSvar.kamper.map((k) => k.hjemme).join(","));
ok("og runde er den forste, med runder i rekkefolge",
   nesteSvar.runde === "Runde 21" && nesteSvar.runder.join("|") === "Runde 21|Runde 22",
   JSON.stringify(nesteSvar.runder));
// Resultater skal nyeste forst; kommende skal eldste forst. De to gar
// hver sin vei, og et fortegn pa feil sted bytter dem om.
const resSvar = tolkDatasett(sportFor(LIGAER.premier), "resultater", SVAR_KAMPER);
ok("resultater gar andre veien enn kommende",
   resSvar.kamper[0].hjemme === "Viking", resSvar.kamper.map((k) => k.hjemme).join(","));
ok("kommendeKamper taler en tom liste",
   kommendeKamper([]).kamper.length === 0 && kommendeKamper().runde === "");
ok("en kamp uten runde gir ingen tom rundeoppforing",
   kommendeKamper([{ dato: "2026-01-01" }]).runder.length === 0);

/* ---------------- dognkvoten, per sport ---------------- */

// Kvoten er per sport hos API-Sports: hver tjeneste har sin egen konto og
// sin egen bote. Teller vi alle ligaer i en bote, ville en handballiga
// sett ut som om den sprengte fotballens kvote.
const perSport = kallPerSport();
ok("hver sport holder seg under sin egen dognkvote",
   Object.keys(perSport).every((s) => perSport[s] <= DOGNKVOTE), JSON.stringify(perSport));
ok("og fotballen teller det den faktisk bruker",
   perSport.fotball === kallPerDogn(Object.keys(LIGAER).length), JSON.stringify(perSport));
ok("en sport til deler ikke fotballens bote",
   kallPerSport({ a: { sport: "fotball" }, b: { sport: "handball" } }).fotball ===
   kallPerDogn(1), JSON.stringify(kallPerSport({ a: {}, b: { sport: "handball" } })));

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

// Fanen viste én runde til 14. september 2026, og da runden var nesten
// ferdigspilt sto det én kamp igjen. Hele vinduet vises na — kildene
// sendte de tjue kampene uansett.
const KOMMENDE = tolkKamper(kampsvar([
  lagKamp(4, "2026-09-20T17:00:00+00:00", "Runde 21", "Brann", "Bodo/Glimt"),
  lagKamp(5, "2026-09-21T17:00:00+00:00", "Runde 21", "Molde", "Rosenborg"),
  lagKamp(6, "2026-09-28T17:00:00+00:00", "Runde 22", "Viking", "Sarpsborg"),
]));
const FRAMOVER = kampeneFramover(KOMMENDE);
ok("kampene framover er hele vinduet, ikke forste runde",
   FRAMOVER.length === 3, FRAMOVER.length);
ok("og runden etter er med",
   FRAMOVER[FRAMOVER.length - 1].runde === "Runde 22",
   FRAMOVER[FRAMOVER.length - 1].runde);
// Rekkefolgen er tidsrekka: overskriftene i visningen tegnes nar runden
// skifter, sa en usortert liste ville gitt «Runde 21» to ganger.
ok("eldste forst", FRAMOVER.map((k) => k.dato).join(",") ===
   KOMMENDE.map((k) => k.dato).slice().sort().join(","),
   FRAMOVER.map((k) => k.dato).join(","));
// Kilden eies ikke av oss: en usortert liste skal komme sortert ut.
const USORTERT = kampeneFramover([{ dato: "2026-09-28" }, { dato: "2026-09-20" }]);
ok("en usortert kilde sorteres her", USORTERT[0].dato === "2026-09-20", USORTERT[0].dato);
// Kampene oversettes ogsa, sa hjemme- og bortelag matcher tabellen.
ok("lagnavn i kamper oversettes", KOMMENDE[0].borte === "Bodø/Glimt", KOMMENDE[0].borte);
ok("tom liste gir tom liste", kampeneFramover([]).length === 0);
ok("ingenting gir tom liste, ikke unntak", kampeneFramover().length === 0);

// Kampens nokkel, ikke kildens id.
//
// Dette er testen som manglet, og den manglende testen kostet to dager.
// id-en er info.id fra API-Football eller idEvent fra TheSportsDB — to
// ulike tallrekker — og kilden byttes uten at leseren gjor noe. Sa lenge
// identiteten var id-en, ble hver lagrede rad usynlig i det oyeblikket
// den andre kilden svarte.
const SAMME_AF = tolkKamper(kampsvar([
  lagKamp(981234, "2026-09-13T15:00:00+00:00", "Runde 21", "Brann", "Bodo/Glimt")]))[0];
const SAMME_TS = tolkKamperTsdb({ events: [hendelse()] })[0];
ok("de to kildene gir hver sin id for samme kamp",
   SAMME_AF.id !== SAMME_TS.id, SAMME_AF.id + " vs " + SAMME_TS.id);
ok("men samme nokkel",
   SAMME_AF.nokkel === SAMME_TS.nokkel && SAMME_AF.nokkel === "2026-09-13-brann-bodoglimt",
   SAMME_AF.nokkel + " vs " + SAMME_TS.nokkel);
// Kildene skriver lagnavnet ulikt. Foldingen som finnes for tabellen er
// den samme som gjor at nokkelen holder.
ok("skrivematen pa laget spiller ingen rolle",
   kampNokkel({ hjemme: "Brann", borte: "Bodo/Glimt", dato: "2026-09-13T15:00:00Z" }) ===
   kampNokkel({ hjemme: "Brann", borte: "Bodø/Glimt", dato: "2026-09-13T15:00:00+00:00" }));
// En kamp vi ikke kan navngi far ingen nokkel, og da skrives ingenting:
// en rad under en tom nokkel ville samlet alle slike kamper i én.
ok("uten dato gir ingen nokkel", kampNokkel({ hjemme: "Brann", borte: "Viking" }) === "");
ok("uten lag gir ingen nokkel",
   kampNokkel({ hjemme: "", borte: "Viking", dato: "2026-09-13T15:00:00Z" }) === "");
ok("uten kamp i det hele tatt gir ingen nokkel", kampNokkel(null) === "");

ok("nokkelen er en gyldig kamp-id", gyldigKampId("2026-09-13-brann-bodoglimt"));
// En delt lenke som alt er sendt baerer et tall, og skal fortsatt virke.
ok("en gammel id er ogsa gyldig", gyldigKampId("2399151") && gyldigKampId(2399151));
// Verdien gar inn i en PostgREST-liste. Komma og parentes ville betydd
// noe annet der enn tegn i et navn.
ok("komma slipper ikke gjennom", !gyldigKampId("2026-09-13-brann,bodoglimt"));
ok("parentes slipper ikke gjennom", !gyldigKampId("11)"));
ok("store bokstaver slipper ikke gjennom", !gyldigKampId("2026-09-13-Brann-Bodoglimt"));
ok("tom id slipper ikke gjennom", !gyldigKampId(""));

// Lenka ma baere nokkelen: mottakeren kan fa runden fra den andre kilden.
ok("delingslenka baerer nokkelen, ikke id-en",
   kamplenke("eliteserien", SAMME_AF, "pub", "Carls").indexOf("kamp=2026-09-13-brann-bodoglimt") > -1,
   kamplenke("eliteserien", SAMME_AF, "pub", "Carls"));

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

/* ---------------- innlogging ---------------- */

ok("adressen normaliseres", normaliserEpost("  Leser@Example.NO ") === "leser@example.no",
   normaliserEpost("  Leser@Example.NO "));
ok("en adresse er en adresse", gyldigEpost("leser@example.no") && gyldigEpost("a.b+c@x.co.uk"));
ok("det som apenbart ikke er en adresse stoppes",
   !gyldigEpost("leser") && !gyldigEpost("leser@example") && !gyldigEpost("a b@c.no") &&
   !gyldigEpost("") && !gyldigEpost(null));
ok("en absurd lang adresse stoppes", !gyldigEpost("a".repeat(250) + "@example.no"));

// Koden limes inn fra en e-post, med mellomrom og linjeskift.
ok("koden renses", normaliserKode(" 12 34-56\n") === "123456", normaliserKode(" 12 34-56\n"));
ok("seks siffer er en kode", gyldigKode("123456") && gyldigKode("12 34 56"));
// Lengden stilles i Supabase, og atte er en like gyldig innstilling som
// seks. Hardkodet til seks kappet vi «63738168» til «637381» og fikk 403
// — som ser nyaktig ut som en feil kode.
ok("atte siffer er ogsa en kode",
   gyldigKode("63738168") && normaliserKode("63738168") === "63738168",
   normaliserKode("63738168"));
ok("og ingenting kappes innenfor spennet",
   normaliserKode("1234567890") === "1234567890");
ok("for fa er ikke en kode", !gyldigKode("12345") && !gyldigKode(""));
ok("og over spennet kappes", normaliserKode("123456789012") === "1234567890");

// Hele adressen i menyen er en lekkasje over skulderen.
ok("adressen maskeres", maskerEpost("runevangen@gmail.com") === "ru••••@gmail.com",
   maskerEpost("runevangen@gmail.com"));
ok("en kort adresse maskeres ogsa", maskerEpost("ab@x.no") === "a•@x.no", maskerEpost("ab@x.no"));
ok("maskeringen viser aldri hele navnet",
   maskerEpost("ola@x.no").indexOf("ola") === -1, maskerEpost("ola@x.no"));

const KONTO_NAA = Date.parse("2026-09-11T12:00:00Z");
ok("sekunder blir et tidspunkt",
   oktUtloper(3600, KONTO_NAA) === "2026-09-11T13:00:00.000Z", oktUtloper(3600, KONTO_NAA));
ok("tull gir ingen utlopsdato",
   oktUtloper("snart", KONTO_NAA) === null && oktUtloper(-5, KONTO_NAA) === null);

const GYLDIG = { token: "t", epost: "leser@example.no", utloper: "2026-09-11T13:00:00.000Z" };
ok("en hel okt gjelder", oktGyldig(GYLDIG, KONTO_NAA));
ok("en utlopt okt gjelder ikke", !oktGyldig(GYLDIG, KONTO_NAA + 2 * 3600 * 1000));
// En okt vi ikke kjenner levetiden pa, er ikke en okt vi skal stole pa.
ok("en okt uten utlopsdato gjelder ikke",
   !oktGyldig({ token: "t", epost: "leser@example.no" }, KONTO_NAA));
ok("en okt uten token gjelder ikke",
   !oktGyldig({ epost: "leser@example.no", utloper: GYLDIG.utloper }, KONTO_NAA));
ok("tull i lageret gjelder ikke",
   !oktGyldig(null, KONTO_NAA) && !oktGyldig("noe", KONTO_NAA) && !oktGyldig({}, KONTO_NAA));

ok("svaret fra tjenesten formes til en okt",
   JSON.stringify(tolkOkt({ access_token: "t", expires_in: 3600,
     user: { email: "Leser@Example.no", id: "u-1" } }, KONTO_NAA)) ===
   JSON.stringify({ token: "t", epost: "leser@example.no", bruker: "u-1",
     utloper: "2026-09-11T13:00:00.000Z" }));
// Id-en, ikke adressen, er den du er: adressen skal ikke ligge i en
// liste andre leser.
ok("okta barer bruker-id-en", tolkOkt({ access_token: "t",
   user: { email: "a@b.no", id: "u-2" } }, KONTO_NAA).bruker === "u-2");
// En halv okt ville sett ut som innlogget helt til forste kall feilet.
ok("en okt uten token kastes framfor a gis ut",
   kaster(() => tolkOkt({ user: { email: "leser@example.no" } }, KONTO_NAA)));
ok("en okt uten adresse kastes ogsa",
   kaster(() => tolkOkt({ access_token: "t" }, KONTO_NAA)));
ok("uten levetid far okta en kort en",
   tolkOkt({ access_token: "t", user: { email: "a@b.no" } }, KONTO_NAA).utloper ===
   "2026-09-11T13:00:00.000Z");

// En okt som ikke sier hvem du er, har menyen ingenting a skrive av.
ok("en okt uten navn og uten adresse gjelder ikke",
   !oktGyldig({ token: "t", utloper: GYLDIG.utloper }, KONTO_NAA) &&
   !oktGyldig({ token: "t", navn: "   ", utloper: GYLDIG.utloper }, KONTO_NAA));
// E-postinnloggingen er parkert pa en gren, men okta den lagde ligger
// fortsatt i telefoner som har brukt den.
ok("en okt med navn gjelder, og en med adresse gjor det fortsatt",
   oktGyldig({ token: "t", navn: "Ola", utloper: GYLDIG.utloper }, KONTO_NAA) &&
   oktGyldig(GYLDIG, KONTO_NAA));

/* ---------------- innlogging med fornavn og PIN ---------------- */

ok("navnet renses for det blir en konto",
   normaliserPinNavn("  Ola   Kari \n") === "Ola Kari", normaliserPinNavn("  Ola   Kari \n"));
ok("et altfor langt fornavn kappes", normaliserPinNavn("A".repeat(80)).length === 24);

// Slugen er nokkelen til kontoen. Skrives navnet annerledes pa neste
// telefon, ma det likevel bli samme konto — ellers mister man svarene
// sine ved a skrive «ola» i stedet for «Ola».
ok("samme navn gir samme nokkel uansett skrivemate",
   pinSlug("Ola") === "ola" && pinSlug("  OLA ") === "ola" && pinSlug("oLa") === "ola");
// Foldingen skjer for tegnene strippes. Uten den ville «Bjorn» og
// «Bjørn» blitt «bjrn» begge to — to ulike navn, en konto.
ok("norske bokstaver foldes framfor a forsvinne",
   pinSlug("Bjørn") === "bjoern" && pinSlug("Åge") === "aage" && pinSlug("Kjærsti") === "kjaersti",
   pinSlug("Bjørn") + "," + pinSlug("Åge") + "," + pinSlug("Kjærsti"));
ok("og «Bjorn» og «Bjørn» blir ikke samme konto", pinSlug("Bjorn") !== pinSlug("Bjørn"));
ok("aksenter foldes ogsa", pinSlug("Renée") === "renee", pinSlug("Renée"));
ok("tegnsetting og mellomrom faller bort", pinSlug("Ola-Kari") === "olakari",
   pinSlug("Ola-Kari"));

// En tom nokkel ville vaert alles konto.
ok("et navn som bare er tegnsetting er ikke et navn",
   !gyldigPinNavn("•••") && !gyldigPinNavn("") && !gyldigPinNavn(null) && !gyldigPinNavn("  "));
ok("ett tegn er for lite, to er nok", !gyldigPinNavn("J") && gyldigPinNavn("Jo"));

ok("navnet blir en adresse pa vart eget domene",
   pinEpost("Bjørn Åge") === "bjoernaage@" + PIN_DOMENE, pinEpost("Bjørn Åge"));

ok("PIN-en renses", normaliserPin(" 12 34 ") === "1234", normaliserPin(" 12 34 "));
ok("fire siffer er en PIN", gyldigPin("1234") && gyldigPin("12 34"));
ok("seks siffer er ogsa en PIN", gyldigPin("123456"));
ok("tre er for fa", !gyldigPin("123") && !gyldigPin("") && !gyldigPin(null));
ok("og over spennet kappes", normaliserPin("12345678") === "123456" &&
   PIN_MIN === 4 && PIN_MAKS === 6);
ok("bokstaver i PIN-feltet er ikke en PIN", !gyldigPin("abcd"));

// Passordet hos tjenesten er PIN-en pluss et pepper bare funksjonen
// kjenner. To grunner: fire siffer er 10 000 forsok mot Supabase sitt
// eget endepunkt, og Supabase krever minst seks tegn i et passord.
ok("passordet er PIN-en pluss pepperet", pinPassord("1234", "hemmelig") === "1234:hemmelig",
   pinPassord("1234", "hemmelig"));
ok("og er langt nok for Supabase selv med en PIN pa fire",
   pinPassord("1234", "hemmelig").length >= 6);
ok("pepperet gjor to like PIN-er ulike passord",
   pinPassord("1234", "a") !== pinPassord("1234", "b"));

ok("svaret fra tjenesten formes til en okt med navn",
   JSON.stringify(tolkPinOkt({ access_token: "t", expires_in: 3600, refresh_token: "f-1",
     user: { email: "ola@" + PIN_DOMENE, id: "u-1" } }, "  Ola  ", KONTO_NAA)) ===
   JSON.stringify({ token: "t", navn: "Ola", bruker: "u-1",
     utloper: "2026-09-11T13:00:00.000Z", fornyer: "f-1" }),
   JSON.stringify(tolkPinOkt({ access_token: "t", expires_in: 3600, refresh_token: "f-1",
     user: { email: "ola@" + PIN_DOMENE, id: "u-1" } }, "  Ola  ", KONTO_NAA)));

// Fornyeren er det som gjor telefonen til en telefon du er logget inn
// pa. Tilgangstokenet varer én time; uten denne ble man logget ut hver
// time, og det var nettopp det som ble meldt fra prod.
ok("okta barer fornyeren fra tjenesten",
   tolkPinOkt({ access_token: "t", refresh_token: "f-1" }, "Ola", KONTO_NAA).fornyer === "f-1");
ok("og et svar uten fornyer gir en tom, ikke en udefinert",
   tolkPinOkt({ access_token: "t" }, "Ola", KONTO_NAA).fornyer === "");
// Favorittlagene pa kontoen (24. september 2026). Feltet star bare nar
// kontoen HAR lagret en liste: «aldri lagret» og «fjernet alle» er to
// ulike svar, og det forste ma ikke tomme telefonens stjerner.
ok("okta barer kontoens lag nar de finnes",
   JSON.stringify(tolkPinOkt({ access_token: "t",
     user: { user_metadata: { navn: "Ola", lag: [" Brann ", "Brann"] } } }, "Ola", KONTO_NAA).lag) ===
   JSON.stringify(["Brann"]));
ok("og en tom liste er et svar", JSON.stringify(tolkPinOkt({ access_token: "t",
     user: { user_metadata: { lag: [] } } }, "Ola", KONTO_NAA).lag) === "[]");
ok("men en konto uten lista sier ingenting om den",
   !("lag" in tolkPinOkt({ access_token: "t", user: { user_metadata: { navn: "Ola" } } },
     "Ola", KONTO_NAA)));

ok("lista renses: tomme, doble og ikke-tekst ut",
   JSON.stringify(rensLag(["  Brann  ", "", "Brann", 7, null, "Rosenborg   BK"])) ===
   JSON.stringify(["Brann", "Rosenborg BK"]), JSON.stringify(rensLag(["  Brann  ", "Brann"])));
ok("og noe som ikke er en liste blir en tom", rensLag("Brann").length === 0 &&
   rensLag(undefined).length === 0);
ok("lista har et tak",
   rensLag(Array.from({ length: 40 }, (_, i) => "Lag " + i)).length === LAG_MAKS);
// Kontoens forst, i sin rekkefolge; telefonens nye bak. Ingen er feil.
ok("ved innlogging flettes kontoen og telefonen",
   JSON.stringify(flettLag(["Brann", "Molde"], ["Molde", "Rosenborg"])) ===
   JSON.stringify(["Brann", "Molde", "Rosenborg"]),
   JSON.stringify(flettLag(["Brann", "Molde"], ["Molde", "Rosenborg"])));
ok("og en konto uten lag gir telefonens",
   JSON.stringify(flettLag(undefined, ["Brann"])) === JSON.stringify(["Brann"]));
ok("to lister er like nar de renses likt",
   sammeLag([" Brann"], ["Brann"]) && !sammeLag(["Brann"], ["Brann", "Molde"]) &&
   !sammeLag(["Molde", "Brann"], ["Brann", "Molde"]));

// Bytt PIN: den gamle kreves, den nye er gyldig og ny, og gjentas likt.
ok("et gyldig bytte slipper gjennom", sjekkPinBytte("1234", "5678", "5678") === "");
ok("og uten gjenta — funksjonen far den ikke", sjekkPinBytte("1234", "5678") === "");
ok("den gamle PIN-en kreves", sjekkPinBytte("", "5678", "5678").indexOf("du har nå") > -1);
ok("den nye ma vaere en PIN", sjekkPinBytte("1234", "12", "12").indexOf("siffer") > -1);
ok("og ikke den samme som den gamle",
   sjekkPinBytte("1234", "12 34", "1234").indexOf("samme") > -1);
ok("og gjentas likt", sjekkPinBytte("1234", "5678", "5679").indexOf("ikke like") > -1);

// Adressen vi lagde av navnet er en nokkel, ikke noe a vise noen.
ok("okta barer ikke adressen vi lagde",
   JSON.stringify(tolkPinOkt({ access_token: "t", user: { email: "ola@" + PIN_DOMENE } },
     "Ola", KONTO_NAA)).indexOf(PIN_DOMENE) === -1);
// En halv okt ville sett ut som innlogget helt til forste kall feilet.
ok("en okt uten token kastes framfor a gis ut",
   kaster(() => tolkPinOkt({ user: { id: "u-1" } }, "Ola", KONTO_NAA)));
ok("en okt uten navn kastes ogsa",
   kaster(() => tolkPinOkt({ access_token: "t" }, "•", KONTO_NAA)));
ok("uten levetid far ogsa PIN-okta en kort en",
   tolkPinOkt({ access_token: "t" }, "Ola", KONTO_NAA).utloper ===
   "2026-09-11T13:00:00.000Z");

// Et utlopt tilgangstoken er ikke det samme som a vaere logget ut. Var
// de det samme, ble man logget ut hver time — og det var de.
const MED_FORNYER = { token: "t", navn: "Ola", fornyer: "f-1", bruker: "u-1",
                      utloper: new Date(KONTO_NAA + 3600000).toISOString() };
ok("en okt med fornyer kan fornyes", kanFornyes(MED_FORNYER));
ok("en okt uten fornyer kan ikke",
   !kanFornyes({ token: "t", navn: "Ola", utloper: "2030-01-01T00:00:00.000Z" }) &&
   !kanFornyes(null) && !kanFornyes("nei"));

ok("en fersk okt trenger ingen fornying", !maaFornyes(MED_FORNYER, KONTO_NAA));
// Fornyes den for den ryker, merker ingen at den var innom — og et kall
// som starter rett for utlopet rekker fram.
ok("men den fornyes for den ryker, ikke etter",
   maaFornyes(MED_FORNYER, KONTO_NAA + 3600000 - FORNY_MARGIN));
ok("en utlopt okt ma fornyes", maaFornyes(MED_FORNYER, KONTO_NAA + 7200000));
ok("en okt uten fornyer fornyes ikke, uansett hvor gammel",
   !maaFornyes({ token: "t", navn: "Ola", utloper: "2020-01-01T00:00:00.000Z" },
     KONTO_NAA));
// En okt vi ikke kjenner levetiden pa er ikke en okt a stole pa — men
// har den en fornyer, er veien ut a fornye, ikke a logge ut.
ok("ugyldig utlopstid ber om fornying framfor a gjettes pa",
   maaFornyes({ token: "t", navn: "Ola", fornyer: "f-1", bruker: "u-1",
     utloper: "tull" }, KONTO_NAA));

// Uten bruker-id vet ikke appen hvilken rad i «blir med»-lista som er
// din: stedet star umerket, kortet sier ingenting om hvor du skal, og
// delingsteksten mister stedet. Fornyingen er veien til a fa id-en
// tilbake, sa en slik okt er moden uansett hvor fersk den er.
ok("en okt uten bruker-id ma fornyes selv om den er fersk",
   maaFornyes(Object.assign({}, MED_FORNYER, { bruker: "" }), KONTO_NAA));

/* ---------------- kampene noen blir med pa ---------------- */

const RUNDE = [
  { id: 1, dato: "2026-09-20T17:00:00+00:00" },
  { id: 3, dato: "2026-09-21T15:00:00+00:00" },
  { id: 4, dato: "2026-09-22T15:00:00+00:00" },
  { id: 5, dato: "2026-09-19T17:00:00+00:00" },
];
const HVEM = perKamp(tolkSvar([
  { kamp_id: "3", navn: "Ola" }, { kamp_id: "5", navn: "Kari" },
]));

const LOFTET = loftMedSvar(RUNDE, HVEM);
// Star det folk pa to av ti kamper, er det de to man leter etter.
ok("kampene noen blir med pa loftes",
   LOFTET.kamper.map((k) => k.id).join(",") === "3,5,1,4",
   LOFTET.kamper.map((k) => k.id).join(","));
ok("og det sies hvor mange som ble loftet", LOFTET.loftet === 2, LOFTET.loftet);
// Ingenting skjules: det er de samme kampene, i en annen rekkefolge.
ok("alle kampene er fortsatt med", LOFTET.kamper.length === RUNDE.length);
ok("uten svar star runden som den er",
   loftMedSvar(RUNDE, new Map()).kamper.map((k) => k.id).join(",") === "1,3,4,5" &&
   loftMedSvar(RUNDE, new Map()).loftet === 0);
ok("tull inn gir tomt ut",
   loftMedSvar(null, HVEM).kamper.length === 0 && loftMedSvar(RUNDE, null).loftet === 0);

// Egen visning: bare kampene noen blir med pa, eldste forst.
ok("bare kampene med folk, i tidsrekkefolge",
   bareMedSvar(RUNDE, HVEM).map((k) => k.id).join(",") === "5,3",
   bareMedSvar(RUNDE, HVEM).map((k) => k.id).join(","));
ok("uten svar er lista tom", bareMedSvar(RUNDE, new Map()).length === 0);

/* ---- mitt lag (mittlag-data.js) ---- */

// Favorittlaget er redaksjonens navn; kampene barer kildens. Samme
// folding som stampubene, ikke normaliserLagnavn (som gar inn i
// kampNokkel og ikke skal endres).
ok("Vålerenga og Vaalerenga er samme lag", erLaget("Vaalerenga", "Vålerenga"));
ok("Bodø/Glimt og Bodo/Glimt ogsa", erLaget("Bodo/Glimt", "Bodø/Glimt"));
ok("men ulike lag er ulike", !erLaget("Brann", "Bryne") && !erLaget("", ""));

const ML_TABELL = [
  { plass: 1, lag: "Bodø/Glimt", poeng: 57 }, { plass: 2, lag: "Brann", poeng: 53 },
  { plass: 3, lag: "Viking", poeng: 51 }, { plass: 4, lag: "Rosenborg", poeng: 48 },
  { plass: 5, lag: "Molde", poeng: 45 }, { plass: 6, lag: "Tromsø", poeng: 45 },
  { plass: 7, lag: "Bryne", poeng: 40 },
];
ok("ligaen finnes i tabellene",
   ligaForLag("Brann", { premier: [{ lag: "Arsenal" }], eliteserien: ML_TABELL }) === "eliteserien");
ok("og et lag som ikke star noe sted gir ingen liga",
   ligaForLag("Lyn", { eliteserien: ML_TABELL }) === null);

let ml = plasseringFor(ML_TABELL, "Brann");
ok("plassen og antallet lag", ml.rad.plass === 2 && ml.antall === 7);
ok("og avstanden til laget over og under er i poeng",
   avstandTekst(ml) === "4 poeng opp til 1. plass · 2 poeng ned til 3.", avstandTekst(ml));
ml = plasseringFor(ML_TABELL, "Bryne");
ok("nederst er det ingen under", ml.under === null &&
   avstandTekst(ml) === "5 poeng opp til 6. plass", avstandTekst(ml));
// Like poeng skilles pa malforskjell. Da er «0 poeng opp» den sanne
// opplysningen, ikke en feil.
ok("like poeng gir 0 poeng opp",
   avstandTekst(plasseringFor(ML_TABELL, "Tromsø")).indexOf("0 poeng opp til 5. plass") === 0);
ok("forsteplassen har ingen over seg",
   avstandTekst(plasseringFor(ML_TABELL, "Bodø/Glimt")) === "4 poeng ned til 2.");
ok("mangler poengene, star ingenting",
   avstandTekst(plasseringFor([{ plass: 1, lag: "A" }, { plass: 2, lag: "B" }], "B")) === "");
ok("et lag som ikke star i tabellen, har ingen plass", plasseringFor(ML_TABELL, "Lyn") === null);

const ML_KAMPER = [
  { dato: "2026-08-16T16:00:00Z", hjemme: "Brann", borte: "Viking", malHjemme: 4, malBorte: 2 },
  { dato: "2026-09-20T16:00:00Z", hjemme: "Brann", borte: "Molde", malHjemme: 2, malBorte: 1 },
  { dato: "2026-08-23T16:00:00Z", hjemme: "Vaalerenga", borte: "Brann", malHjemme: 2, malBorte: 0 },
  { dato: "2026-09-13T16:00:00Z", hjemme: "Rosenborg", borte: "Brann", malHjemme: 1, malBorte: 1 },
  { dato: "2026-09-06T16:00:00Z", hjemme: "Molde", borte: "Viking", malHjemme: 0, malBorte: 0 },
  // Uspilt, men i resultatlista: hele sesongen kommer med (#134).
  { dato: "2026-10-04T16:00:00Z", hjemme: "Brann", borte: "KFUM Oslo", malHjemme: null, malBorte: null },
  { dato: "2026-09-27T16:00:00Z", hjemme: "Bodø/Glimt", borte: "Brann", malHjemme: null, malBorte: null },
];
const siste = spilteFor(ML_KAMPER, "Brann");
ok("siste kamper er lagets, nyeste forst, og bare de spilte",
   siste.map((f) => f.utfall + ":" + f.mot).join(",") === "V:Molde,U:Rosenborg,T:Vaalerenga,V:Viking",
   siste.map((f) => f.utfall + ":" + f.mot).join(","));
ok("utfallet er sett fra laget, ogsa borte",
   siste[2].hjemme === false && siste[2].utfall === "T");
ok("formen leses eldst til venstre",
   formFor(ML_KAMPER, "Brann").map((f) => f.utfall).join("") === "VTUV",
   formFor(ML_KAMPER, "Brann").map((f) => f.utfall).join(""));
ok("og har et tak", formFor(ML_KAMPER, "Brann", 2).map((f) => f.utfall).join("") === "UV");
const kommende = kommendeFor(ML_KAMPER, "Brann");
ok("kommende er de uten resultat, eldst forst",
   kommende.map((k) => k.mot).join(",") === "Bodø/Glimt,KFUM Oslo" && kommende[0].hjemme === false,
   kommende.map((k) => k.mot).join(","));
ok("tomme og rare lister gir tomme svar",
   spilteFor(null, "Brann").length === 0 && kommendeFor(undefined, "Brann").length === 0);

// Fanene og datasettene er to lister. «venner» henter ingenting eget, og
// et fjerde navn i DELER ville blitt en rute funksjonen godtar og sa
// feiler pa i apiSti.
ok("vennefanen star i FANER, ikke i DELER",
   FANER.indexOf("venner") > -1 && DELER.indexOf("venner") === -1,
   FANER.join(",") + " / " + DELER.join(","));
ok("og fanene er datasettene pluss de to som slar dem sammen",
   FANER.length === DELER.length + 2 && DEL_NAVN.venner === "Venner" &&
   DEL_NAVN.mittlag === "Mitt lag" && DELER.indexOf("mittlag") === -1,
   FANER.join(","));
// En delt lenke til vennefanen skal apne den, ikke falle til tabellen.
ok("ruta kjennes igjen", tolkFotballHash("#/fotball/venner").del === "venner",
   JSON.stringify(tolkFotballHash("#/fotball/venner")));

/* ---------------- ett sporsmal, ett svar ---------------- */

// Rekkefolgen er svaret. Det som gjelder denne kampen forst, sa det du
// selv har brukt, sa steder vi vet viser fotball, sa resten fra kartet.
const RANG = rangerForslag({
  bekreftede: [{ navn: "Lincoln Pub", bekreftet: true }],
  dine: [{ navn: "Andys Pub" }],
  kjenteNaer: [{ navn: "lincoln pub", viserFotball: true, avstand: 120, lag: ["Brann"] },
               { navn: "Sofa & Bar", viserFotball: true, avstand: 300 }],
  naerDeg: [{ navn: "Bar X", avstand: 50 }, { navn: "Bar Y", avstand: 80 },
            { navn: "Bar Z", avstand: 90 }, { navn: "Bar Q", avstand: 95 }],
}, 6);

ok("den som svarer pa kampen star forst", RANG.topp[0].navn === "Lincoln Pub",
   RANG.topp.map((p) => p.navn).join(","));
ok("sa dine, sa de kjente, sa kartet",
   RANG.topp.map((p) => p.navn).join(",") ===
   "Lincoln Pub,Andys Pub,Sofa & Bar,Bar X,Bar Y,Bar Z",
   RANG.topp.map((p) => p.navn).join(","));
// Det var dette som gjorde panelet uleselig: samme pub i tre grupper.
ok("samme pub star ett sted, ikke tre",
   RANG.topp.filter((p) => /lincoln/i.test(p.navn)).length === 1,
   RANG.topp.map((p) => p.navn).join(","));
// Et treff fra kartet skal ikke skjule at stedet alt har sagt at det
// viser kampen — merkene slas sammen.
ok("merkene folger med fra alle kildene",
   RANG.topp[0].bekreftet === true && RANG.topp[0].viserFotball === true &&
   RANG.topp[0].avstand === 120 && RANG.topp[0].lag.join(",") === "Brann",
   JSON.stringify(RANG.topp[0]));
ok("resten ligger igjen, ikke kastet",
   RANG.resten.length === 1 && RANG.resten[0].navn === "Bar Q",
   JSON.stringify(RANG.resten));
ok("seks er taket", FORSLAG_MAKS === 6 && RANG.topp.length === 6, RANG.topp.length);
// «Flere forslag» ber om alt.
ok("uten tak kommer alle med",
   rangerForslag({ naerDeg: [{ navn: "a" }, { navn: "b" }, { navn: "c" }] }, 0).topp.length === 3);
ok("tomt inn gir tomt ut",
   rangerForslag(null).topp.length === 0 && rangerForslag({}).resten.length === 0);

/* ---- stjerne forst, sa avstand, innenfor én liste ---- */

// Kortet har to lister na: stedene naer deg, og pubene i andre byer.
// Sorteringa er den samme i begge, og «forst» betyr forst INNENFOR den
// lista — ikke overst uansett. En bekreftet visning 392 km unna er tatt
// ut for dette, av naerNok i fotball.js.
const SORT = sorterForslag([
  { navn: "Karttreff naer", avstand: 500 },
  { navn: "Bekreftet langt", bekreftet: true, avstand: 9000 },
  { navn: "Min pub", min: true },
  { navn: "Karttreff naermest", avstand: 100 },
]);
ok("den bekreftede star forst, ogsa naar en annen er naermere",
   SORT[0].navn === "Bekreftet langt", SORT.map((p) => p.navn).join(" "));
ok("sa min egen pub, som er et valg jeg alt har tatt",
   SORT[1].navn === "Min pub", SORT.map((p) => p.navn).join(" "));
ok("og resten pa avstand, naermest forst",
   SORT[2].navn === "Karttreff naermest" && SORT[3].navn === "Karttreff naer",
   SORT.map((p) => p.navn).join(" "));

// Ukjent avstand star sist i sitt eget lag. Det er ingen demping — raden
// star der, i gruppa si — men et tall vi ikke har kan ikke sla et tall
// noen andre har.
const SORT_UKJENT = sorterForslag([
  { navn: "Uten avstand" }, { navn: "Med avstand", avstand: 4000 },
]);
ok("uten avstand sorteres sist blant sine egne",
   SORT_UKJENT[0].navn === "Med avstand", SORT_UKJENT.map((p) => p.navn).join(" "));

// Lik avstand ma gi lik rekkefolge hver gang: en liste som stokker seg
// selv mellom to tegninger er en liste du ma lese pa nytt.
const SORT_LIK = sorterForslag([
  { navn: "Bodega", avstand: 300 }, { navn: "Antikvariatet", avstand: 300 },
]);
ok("lik avstand sorteres pa navn, sa lista ikke stokker seg",
   SORT_LIK[0].navn === "Antikvariatet", SORT_LIK.map((p) => p.navn).join(" "));

ok("sorterForslag rorer ikke lista den far",
   (function () {
     const inn = [{ navn: "b", avstand: 2 }, { navn: "a", avstand: 1 }];
     sorterForslag(inn);
     return inn[0].navn === "b";
   })());
ok("tomt inn gir tomt ut", sorterForslag(null).length === 0);

// Tallene star i koden, ett sted, sa lista og «Ekspander lista (N)» ikke
// kan bli uenige om hvor mange som vises.
ok("fire naer deg, fem i andre byer", NAER_MAKS === 4 && ANDRE_MAKS === 5,
   NAER_MAKS + " / " + ANDRE_MAKS);

/* ---- et sted vi har gjettet paa ---- */

// «usikker» falt UT av lista appen leser til 20. september 2026, og da
// var det ingen forskjell for leseren mellom «vi har sett etter og er i
// tvil» og «stedet finnes ikke». Lista var 26 steder, alle i Oslo.
const ANTATT = merkAntatte([
  { navn: "Gjettet", sikkerhet: "usikker" },
  { navn: "Sett etter", sikkerhet: "sannsynlig" },
  { navn: "Statt i dora", sikkerhet: "bekreftet" },
]);
ok("et usikkert sted faller ikke ut lenger", ANTATT.length === 3, ANTATT.length);
ok("det merkes som antatt", ANTATT[0].antatt === true, JSON.stringify(ANTATT[0]));

// Grensa gar ved usikker, ikke ved sannsynlig: det siste betyr at noen
// har sett etter og trodd det, det forste at vi har gjettet.
ok("sannsynlig er ikke en antakelse",
   ANTATT[1].antatt === undefined, JSON.stringify(ANTATT[1]));
ok("og bekreftet heller ikke",
   ANTATT[2].antatt === undefined, JSON.stringify(ANTATT[2]));

// Raden kopieres framfor a rores: KURATERTE er delt, og et flagg satt paa
// den ekte raden ville fulgt med overalt.
ok("merkAntatte rorer ikke lista den far",
   (function () {
     const inn = [{ navn: "Gjettet", sikkerhet: "usikker" }];
     merkAntatte(inn);
     return inn[0].antatt === undefined;
   })());
ok("tomt inn gir tomt ut", merkAntatte(null).length === 0);

/* ---- stampubene for lagene som spiller ---- */

// De kuraterte stedene nadde bare fram gjennom et geografisk filter:
// kjenteNaer krever posisjonen din, kjenteVedArena at arenaen er en vi
// kjenner. Utenlandsk kamp OG nei til posisjon: da fantes ikke lista var,
// enda `lag` i den svarer pa nettopp den kampen.
const STAMPUBER = [
  { navn: "Bohemen Sportspub", lag: ["Vålerenga", "Tottenham"] },
  { navn: "Scotsman", lag: ["Manchester United", "Bodø/Glimt"] },
  { navn: "Sofa & Bar", lag: [] },
  { navn: "Uten lag-felt" },
];
ok("hjemmelaget gir treff",
   stampuberFor({ hjemme: "Tottenham", borte: "Chelsea" }, STAMPUBER)
     .map((p) => p.navn).join(",") === "Bohemen Sportspub",
   JSON.stringify(stampuberFor({ hjemme: "Tottenham", borte: "Chelsea" }, STAMPUBER)));
ok("og bortelaget ogsa",
   stampuberFor({ hjemme: "Brann", borte: "Bodø/Glimt" }, STAMPUBER)
     .map((p) => p.navn).join(",") === "Scotsman");
// «Vaalerenga» fra kilden og «Valerenga» i fila er samme lag. Uten
// foldingen hadde lista truffet ingenting — og det ville sett ut som om
// det bare ikke fantes en stampub.
ok("lagnavnet foldes, sa Vaalerenga treffer Vålerenga",
   stampuberFor({ hjemme: "Vaalerenga", borte: "Molde" }, STAMPUBER)
     .map((p) => p.navn).join(",") === "Bohemen Sportspub",
   JSON.stringify(stampuberFor({ hjemme: "Vaalerenga", borte: "Molde" }, STAMPUBER)));
ok("en kamp uten stampub gir ingen",
   stampuberFor({ hjemme: "Molde", borte: "Sandefjord" }, STAMPUBER).length === 0);
ok("et sted uten lag kommer aldri med",
   stampuberFor({ hjemme: "Tottenham", borte: "Chelsea" }, STAMPUBER)
     .every((p) => p.navn !== "Sofa & Bar" && p.navn !== "Uten lag-felt"));
ok("tull inn kaster ikke",
   stampuberFor(null, STAMPUBER).length === 0 &&
   stampuberFor({ hjemme: "Brann" }, null).length === 0 &&
   stampuberFor({}, STAMPUBER).length === 0);

// Plasseringen er avgjorelsen, ikke bare at kilden finnes: stampubene
// fyller hullet der geografien ikke gir noe — men gar ikke foran den der
// den gjor det. En stampub tvers over byen er et darligere svar enn en
// fotballpub i nabogata.
ok("stampuber star etter de geografiske kildene",
   FORSLAG_KILDER.indexOf("stampuber") > FORSLAG_KILDER.indexOf("kjenteNaer") &&
   FORSLAG_KILDER.indexOf("stampuber") > FORSLAG_KILDER.indexOf("kjenteVedArena"),
   FORSLAG_KILDER.join(","));
// Men foran de rene karttreffene: et sted vi har vurdert redaksjonelt og
// som er kjent for laget, slar en tilfeldig bar Overpass fant.
ok("og for de rene karttreffene",
   FORSLAG_KILDER.indexOf("stampuber") < FORSLAG_KILDER.indexOf("naerDeg") &&
   FORSLAG_KILDER.indexOf("stampuber") < FORSLAG_KILDER.indexOf("vedArena"),
   FORSLAG_KILDER.join(","));

// Uten posisjon og uten kjent arena er stampuben det eneste som star
// igjen. Det er nettopp den situasjonen kilden finnes for.
const UTENLANDSK = rangerForslag({
  bekreftede: [], dine: [], kjenteNaer: [], kjenteVedArena: [],
  stampuber: [{ navn: "Scotsman", viserFotball: true }],
  naerDeg: [], vedArena: [],
}, 6);
ok("uten posisjon og uten arena star stampuben igjen",
   UTENLANDSK.topp.length === 1 && UTENLANDSK.topp[0].navn === "Scotsman",
   JSON.stringify(UTENLANDSK.topp));
/* ---------------- de kuraterte stedene i byen din ---------------- */

// Meldt 19. september 2026: «jeg onsker a fa opp puben uavhengig om den
// har lag RBK eller ikke». Radiusen er en SIRKEL, og en by er ikke det:
// star du fire kilometer ut, faller din egen bys steder utenfor sirkelen
// enda de apenbart er svaret. For en by med ett kuratert sted sto det da
// ingenting igjen.
const I_BYEN = [
  { navn: "RBK-pubben", lat: 63.4286, lon: 10.3641 },   // Trondheim, Ila
  { navn: "Lerkendalkroa", lat: 63.4130, lon: 10.4060 }, // Trondheim, lenger sor
  { navn: "Oslo-puben", lat: 59.9139, lon: 10.7522 },   // Oslo
  { navn: "Uten koordinat" },
];
// Fire og en halv kilometer ost for RBK-pubben, fortsatt i Trondheim.
const UTKANT = { lat: 63.4286, lon: 10.4545 };

const BY_TREFF = kuraterteIByen(I_BYEN, UTKANT);
ok("et sted i byen din kommer med selv om det er utenfor radiusen",
   BY_TREFF.some((p) => p.navn === "RBK-pubben"),
   BY_TREFF.map((p) => p.navn).join(", ") || "(tom)");
ok("og radiusen alene ville ikke tatt det",
   !kuraterteNaer(I_BYEN, UTKANT, 3000).some((p) => p.navn === "RBK-pubben"),
   kuraterteNaer(I_BYEN, UTKANT, 3000).map((p) => p.navn).join(", ") || "(tom)");

// Dette er forskjellen fra stampubene, og grunnen til at denne kilden
// BLIR staende nar posisjonen kommer: et lagtreff baerer ingen avstand,
// et bytreff gjor det.
ok("bytreffet baerer avstanden sin",
   BY_TREFF.every((p) => Number.isFinite(p.avstand)),
   JSON.stringify(BY_TREFF.map((p) => [p.navn, p.avstand])));
ok("og naermeste star forst",
   BY_TREFF.map((p) => p.avstand).every((a, i, r) => i === 0 || r[i - 1] <= a),
   JSON.stringify(BY_TREFF.map((p) => p.avstand)));

// Det som holder kilden aerlig: din by, ikke alle byer. Slapp Oslo-puben
// gjennom her, sto den i Trondheim som om den la i nabogata — nettopp
// den feilen stampubene ble tommet for a unnga.
ok("men steder i en ANNEN by kommer ikke med",
   !BY_TREFF.some((p) => p.navn === "Oslo-puben"),
   BY_TREFF.map((p) => p.navn).join(", "));
ok("og rader uten koordinat heller ikke",
   !BY_TREFF.some((p) => p.navn === "Uten koordinat"),
   BY_TREFF.map((p) => p.navn).join(", "));

// Star du utenfor de seks byene, vet vi ikke hvilken by du er i, og da
// er det ingenting a si. En liste her ville vaert gjetning.
ok("utenfor byene gir den ingenting",
   kuraterteIByen(I_BYEN, { lat: 62.0, lon: 7.0 }).length === 0,
   JSON.stringify(kuraterteIByen(I_BYEN, { lat: 62.0, lon: 7.0 })));
ok("og uten posisjon likesa",
   kuraterteIByen(I_BYEN, null).length === 0 &&
   kuraterteIByen(null, UTKANT).length === 0);

// Plasseringen: etter de geografiske kildene, for karttreffene — samme
// begrunnelse som stampubene. Et kuratert sted tvers over byen slar en
// tilfeldig bar fra kartet, men taper for en fotballpub i nabogata.
ok("kjenteIByen star etter de geografiske kildene",
   FORSLAG_KILDER.indexOf("kjenteIByen") > FORSLAG_KILDER.indexOf("kjenteNaer") &&
   FORSLAG_KILDER.indexOf("kjenteIByen") > FORSLAG_KILDER.indexOf("kjenteVedArena"),
   FORSLAG_KILDER.join(","));
ok("og for de rene karttreffene",
   FORSLAG_KILDER.indexOf("kjenteIByen") < FORSLAG_KILDER.indexOf("naerDeg") &&
   FORSLAG_KILDER.indexOf("kjenteIByen") < FORSLAG_KILDER.indexOf("vedArena"),
   FORSLAG_KILDER.join(","));

// En pub uten navn er ingen pub, og ville blitt en tom knapp.
ok("rader uten navn faller bort",
   rangerForslag({ dine: [{ navn: "" }, { navn: "Ekte pub" }, null] }).topp.length === 1);

/* ---------------- brukerlista i adminportalen ---------------- */

const BRUKERE = tolkBrukere([
  { id: "a", email: "ola@" + PIN_DOMENE, user_metadata: { navn: "Ola" },
    created_at: "2026-09-01T10:00:00Z", last_sign_in_at: "2026-09-11T19:00:00Z" },
  { id: "b", email: "bjoernaage@" + PIN_DOMENE,
    created_at: "2026-09-02T10:00:00Z", last_sign_in_at: "2026-09-12T08:00:00Z" },
  { id: "c", email: "noen@annensteds.no", created_at: "2026-09-03T10:00:00Z" },
  { email: "uten-id@" + PIN_DOMENE },
]);

ok("brukerne formes til det portalen trenger", BRUKERE.length === 2,
   JSON.stringify(BRUKERE));
// Navnet slik personen skrev det ligger i metadata. Uten det er slugen
// det naermeste vi kommer — ikke pent, men riktig, og bedre enn en tom rad.
ok("navnet kommer fra metadata nar det finnes", BRUKERE[1].navn === "Ola",
   BRUKERE[1].navn);
ok("og fra slugen nar det ikke gjor det", BRUKERE[0].navn === "bjoernaage",
   BRUKERE[0].navn);
// Sist palogget forst: det er den lista admin faktisk leser.
ok("sist palogget star overst", BRUKERE[0].id === "b" && BRUKERE[1].id === "a",
   BRUKERE.map((b) => b.id).join(","));
// Kontoen lages ved forste innlogging, sa created_at *er* forste gang.
ok("forste og siste palogging folger med",
   BRUKERE[1].forst === "2026-09-01T10:00:00Z" &&
   BRUKERE[1].sist === "2026-09-11T19:00:00Z",
   JSON.stringify(BRUKERE[1]));
// Ligger det noe annet i Supabase-prosjektet, hoerer det ikke hjemme her.
ok("kontoer som ikke er vare faller bort",
   !BRUKERE.some((b) => b.id === "c"), JSON.stringify(BRUKERE));
ok("og en rad uten id gjor det ogsa", BRUKERE.every((b) => b.id));
ok("tull inn gir en tom liste",
   tolkBrukere(null).length === 0 && tolkBrukere("noe").length === 0);
// Supabase pakker av og til lista i et objekt.
ok("lista kan ligge under users",
   tolkBrukere({ users: [{ id: "a", email: "ola@" + PIN_DOMENE }] }).length === 1);

// 22:00 i Oslo den 12. Sto en stund som 22:00 UTC, som er MIDNATT den
// 13. i Oslo — altsa midt i det ene tidsvinduet der funksjonen loy, og
// testene pastod derfor den gale oppforselen.
const NAA_TID = Date.parse("2026-09-12T20:00:00Z");
ok("i dag vises med klokkeslett",
   sistInneTekst("2026-09-12T19:04:00Z", NAA_TID).indexOf("I dag") === 0,
   sistInneTekst("2026-09-12T19:04:00Z", NAA_TID));
ok("i gar ogsa", sistInneTekst("2026-09-11T19:04:00Z", NAA_TID).indexOf("I går") === 0,
   sistInneTekst("2026-09-11T19:04:00Z", NAA_TID));
ok("lenger tilbake teller dager",
   sistInneTekst("2026-09-09T19:04:00Z", NAA_TID) === "3 dager siden",
   sistInneTekst("2026-09-09T19:04:00Z", NAA_TID));

// «Bruker har vaert inne i dag for tiden er mulig», meldt fra
// adminportalen 15. september 2026.
//
// Klokka 01:00 natt til den 15. i Oslo. En innlogging 23:00 kvelden for
// er to timer siden — og med forlopte doegn (naa - t) / 86400000 ble det
// «I dag 23:00», altsa 22 timer inn i framtida. Klokkeslettet var riktig
// hele tiden; det var kalenderdognet som var regnet ut feil.
const MIDNATT = Date.parse("2026-09-14T23:00:00Z");
ok("en innlogging i gar kveld er i gar, ogsa rett etter midnatt",
   sistInneTekst("2026-09-14T21:00:00Z", MIDNATT) === "I går 23:00",
   sistInneTekst("2026-09-14T21:00:00Z", MIDNATT));
ok("og en tidligere pa samme kveld likesa",
   sistInneTekst("2026-09-14T14:00:00Z", MIDNATT) === "I går 16:00",
   sistInneTekst("2026-09-14T14:00:00Z", MIDNATT));
// Samme feil den andre veien: 26 timer siden er to kalenderdogn, ikke ett.
ok("og forgars blir ikke til i gar",
   sistInneTekst("2026-09-13T21:00:00Z", MIDNATT) === "2 dager siden",
   sistInneTekst("2026-09-13T21:00:00Z", MIDNATT));
// Det som FAKTISK er i dag, skal fortsatt sta som i dag.
ok("et kvarter etter midnatt er i dag",
   sistInneTekst("2026-09-14T22:15:00Z", MIDNATT) === "I dag 00:15",
   sistInneTekst("2026-09-14T22:15:00Z", MIDNATT));
// Sommertid: 25. oktober 2026 gar Oslo fra UTC+2 til UTC+1. Et dogn med
// 25 timer skal fortsatt telle som ett.
ok("dognet teller ett ogsa naar klokka stilles",
   sistInneTekst("2026-10-24T20:00:00Z", Date.parse("2026-10-25T20:00:00Z"))
     .indexOf("I går") === 0,
   sistInneTekst("2026-10-24T20:00:00Z", Date.parse("2026-10-25T20:00:00Z")));
ok("og over en uke blir en dato",
   sistInneTekst("2026-08-01T19:04:00Z", NAA_TID).indexOf("2026") > -1,
   sistInneTekst("2026-08-01T19:04:00Z", NAA_TID));
// En konto som aldri har vaert inne skal gi en strek, ikke «Invalid Date».
ok("ukjent tid gir en strek",
   sistInneTekst("") === "—" && sistInneTekst(null) === "—" && sistInneTekst("tull") === "—",
   sistInneTekst("tull"));

/* ---------------- hvem blir med ---------------- */

ok("navnet renses", normaliserNavn("  Ola   Nordmann \n") === "Ola Nordmann",
   normaliserNavn("  Ola   Nordmann \n"));
ok("et altfor langt navn kappes", normaliserNavn("A".repeat(80)).length === NAVN_MAKS);
// Et navn ma ha en bokstav eller et tall: ellers er «•••» et navn, og
// lista blir uleselig for alle andre.
ok("et navn ma ha noe i seg", gyldigNavn("Ola") && gyldigNavn("K9") &&
   !gyldigNavn("•••") && !gyldigNavn("   ") && !gyldigNavn(""));

// Brukeren settes av databasen fra okta, aldri herfra: ellers kunne hvem
// som helst skrevet i en annens navn.
const SVAR_RAD = svarRad(7, "  Ola  ", "pub", "Andy's Pub");
ok("raden barer kamp, navn og sted",
   SVAR_RAD.kamp_id === "7" && SVAR_RAD.navn === "Ola" && SVAR_RAD.hvor === "pub" && SVAR_RAD.sted === "Andy's Pub",
   JSON.stringify(SVAR_RAD));
ok("raden sier aldri hvem du er", SVAR_RAD.bruker === undefined, JSON.stringify(SVAR_RAD));
// Stedet folger stadion ogsa na. Kortet grupperer vennene etter stedet
// de skal til, og «på stadion» er ikke et sted a mote noen — «på
// Lerkendal» er det.
ok("stadion barer arenaens navn",
   svarRad(7, "Ola", "stadion", "Lerkendal").sted === "Lerkendal",
   JSON.stringify(svarRad(7, "Ola", "stadion", "Lerkendal")));
ok("et ukjent svar utelates", svarRad(7, "Ola", "rart", "").hvor === undefined);

const SVAR_RADER = [
  { kamp_id: 7, navn: "Ola", hvor: "pub", sted: "Andy's Pub", bruker: "u-1" },
  { kamp_id: 7, navn: " Kari ", hvor: "hjemme", bruker: "u-2" },
  { kamp_id: 8, navn: "Per", hvor: null, bruker: "u-3" },
  { kamp_id: 8, navn: "  ", bruker: "u-4" },
  null,
];
const BLIRMED = tolkSvar(SVAR_RADER);
ok("rader uten navn faller bort framfor a tegne et tomt navn",
   BLIRMED.length === 3 && BLIRMED.every((s) => s.navn), JSON.stringify(BLIRMED));
ok("navnet renses ogsa pa vei inn", BLIRMED[1].navn === "Kari", BLIRMED[1].navn);
ok("soppel tolkes til ingenting", tolkSvar(null).length === 0 && tolkSvar("nei").length === 0);

const SVAR_KART = perKamp(BLIRMED);
ok("svarene grupperes per kamp",
   SVAR_KART.get("7").length === 2 && SVAR_KART.get("8").length === 1,
   JSON.stringify(Array.from(SVAR_KART.keys())));

// Tallet forst, fordi det er det man leser nar man blar; navnene fordi
// det er dem man ser etter.
ok("en som blir med far navnet sitt",
   blirMedTekst([BLIRMED[0]]) === "Ola blir med", blirMedTekst([BLIRMED[0]]));
ok("flere far tallet forst",
   blirMedTekst(BLIRMED.slice(0, 2)) === "2 blir med: Ola og Kari",
   blirMedTekst(BLIRMED.slice(0, 2)));
ok("ingen gir ingen linje", blirMedTekst([]) === "" && blirMedTekst(null) === "");

// To kan hete det samme. Id-en fra okta er den du er, ikke navnet.
const MITT_SVAR = egetSvar(BLIRMED, "u-2");
ok("ditt eget svar finnes pa id, ikke pa navn",
   !!MITT_SVAR && MITT_SVAR.navn === "Kari" &&
   // Navnet er ikke identitet: to kan hete det samme.
   egetSvar(BLIRMED, "Kari") === null &&
   egetSvar(BLIRMED, "u-9") === null && egetSvar(BLIRMED, "") === null,
   JSON.stringify(MITT_SVAR));

// «Rune blir med» sier hvem, ikke hvor — og hvor er det man apner kortet
// for a finne ut.
const MIN_RUNDE = tolkSvar([
  { kamp_id: 3, navn: "Rune", hvor: "pub", sted: "Grønland", bruker: "u-1" },
  { kamp_id: 3, navn: "Ola", hvor: "pub", sted: "Andy's Pub", bruker: "u-2" },
  { kamp_id: 3, navn: "Kari", hvor: "pub", sted: "Andy's Pub", bruker: "u-3" },
]);
ok("stedet ditt star forst i linja under kampen",
   blirMedLinje(MIN_RUNDE, "u-1", {}) === "Du skal til Grønland. Ola og Kari blir med.",
   blirMedLinje(MIN_RUNDE, "u-1", {}));
ok("alene star det bare hvor du skal",
   blirMedLinje([MIN_RUNDE[0]], "u-1", {}) === "Du skal til Grønland.",
   blirMedLinje([MIN_RUNDE[0]], "u-1", {}));
// Star du ikke pa lista, er linja som for: tallet forst, sa navnene.
ok("uten deg pa lista er linja som for",
   blirMedLinje(MIN_RUNDE, "u-9", {}) === "3 blir med: Rune, Ola og Kari",
   blirMedLinje(MIN_RUNDE, "u-9", {}));
ok("utlogget ogsa", blirMedLinje(MIN_RUNDE, "", {}).indexOf("3 blir med") === 0);
ok("ingen svar gir ingen linje", blirMedLinje([], "u-1", {}) === "");

// «Du skal til stadion» sier ingenting man ikke visste. Arenaen gjor det.
const PAA_STADION = tolkSvar([
  { kamp_id: 3, navn: "Rune", hvor: "stadion", bruker: "u-1" },
]);
ok("stadion uten navn faller tilbake pa arenaen",
   mittSted(PAA_STADION, "u-1", { arena: "Aspmyra Stadion" }) === "Aspmyra Stadion",
   mittSted(PAA_STADION, "u-1", { arena: "Aspmyra Stadion" }));
ok("og uten arena star det ingen sted framfor et tomt et",
   mittSted(PAA_STADION, "u-1", {}) === "", mittSted(PAA_STADION, "u-1", {}));
ok("den som ikke star pa lista har ingen sted",
   mittSted(MIN_RUNDE, "u-9", {}) === "");

/* ---------------- stedene i kampkortet ---------------- */

// Kortet er en liste over steder man kan dra, og et trykk pa et sted er
// svaret. Da ma stedet vaere én ting: skriver to venner «Lincoln Pub» og
// «lincoln pub», er det samme pub — ellers star det to chips for den.
ok("stedsnokkelen folder skrivematen",
   stedNokkel("Lincoln's Pub") === stedNokkel("lincoln s pub") &&
   stedNokkel("Bodø Café") === "bodoecafe" &&
   stedNokkel("") === "" && stedNokkel(null) === "",
   stedNokkel("Lincoln's Pub") + " / " + stedNokkel("Bodø Café"));

const STED_SVAR = tolkSvar([
  { kamp_id: 7, navn: "Ola", hvor: "pub", sted: "Lincoln Pub", bruker: "u-1" },
  { kamp_id: 7, navn: "Kari", hvor: "pub", sted: "lincoln pub", bruker: "u-2" },
  { kamp_id: 7, navn: "Per", hvor: "stadion", sted: "Lerkendal", bruker: "u-3" },
  { kamp_id: 7, navn: "Nils", hvor: null, bruker: "u-4" },
]);

// Stedene noen alt skal til horer med blant chipene: er det en pub ingen
// har meldt inn og ingen kart kjenner, men to venner skal dit, er den det
// mest relevante stedet pa hele kortet.
const STEDENE = stederFraSvar(STED_SVAR);
ok("stedene noen skal til star én gang hver",
   STEDENE.length === 2 && STEDENE[0].navn === "Lincoln Pub" &&
   STEDENE[0].hvor === "pub" && STEDENE[1].navn === "Lerkendal" &&
   STEDENE[1].hvor === "stadion", JSON.stringify(STEDENE));
ok("et svar uten sted gir ingen chip",
   stederFraSvar([{ navn: "Ola", hvor: null, sted: "" }]).length === 0);
ok("soppel gir ingen steder",
   stederFraSvar(null).length === 0 && stederFraSvar("nei").length === 0);

// «List opp nederst venner som har planlagt turen dit»: stedet forst,
// fordi det er det man leter etter. Flest forst, og den som ikke sa hvor,
// sist — hen blir med, men sa ikke hvor.
const STED_GRUPPER = perSted(STED_SVAR, { arena: "Lerkendal" });
ok("vennene grupperes etter stedet de skal til",
   STED_GRUPPER.length === 3 &&
   STED_GRUPPER[0].sted === "på Lincoln Pub" && STED_GRUPPER[0].navn.join(",") === "Ola,Kari" &&
   STED_GRUPPER[1].sted === "på Lerkendal" && STED_GRUPPER[1].navn.join(",") === "Per",
   JSON.stringify(STED_GRUPPER));
ok("den som ikke sa hvor, star sist og uten sted",
   STED_GRUPPER[2].sted === "" && STED_GRUPPER[2].navn.join(",") === "Nils",
   JSON.stringify(STED_GRUPPER[2]));
ok("ingen svar gir ingen grupper",
   perSted([], {}).length === 0 && perSted(null, {}).length === 0);

/* ---------------- kontaktopplysninger ---------------- */

// Samme vokter-tanke som for publista: den ekte fila ma passere, sa en
// feilskrevet rad slar ut her framfor i appen.
ok("kontaktfila holder formen",
   sjekkKontaktliste(PUBER_KONTAKT, KURATERTE.map((p) => p.navn)).length === 0,
   sjekkKontaktliste(PUBER_KONTAKT, KURATERTE.map((p) => p.navn)).slice(0, 3).join(" | "));
ok("hver pub i kontaktfila finnes i publista",
   Object.keys(PUBER_KONTAKT).length >= 20 &&
   sjekkKontaktliste(PUBER_KONTAKT, KURATERTE.map((p) => p.navn))
     .every((f) => f.indexOf("ukjent pub") === -1),
   Object.keys(PUBER_KONTAKT).length);
// Hvert eneste felt skal baere hvor det kom fra. Uten det er det en
// pastand, ikke en opplysning.
ok("alt som star der har kilde og sitat",
   Object.values(PUBER_KONTAKT).every((rad) =>
     Object.values(rad).every((f) => /^https?:\/\//.test(f.kilde) && String(f.sitat).trim())));

function kontakt(endring) {
  return { "Testpuben": Object.assign({
    telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://eksempel.no", sitat: "Tlf: 22 41 62 66" },
  }, endring) };
}
const TESTNAVN = ["Testpuben"];
ok("en riktig rad gir ingen feil", sjekkKontaktliste(kontakt(), TESTNAVN).length === 0,
   sjekkKontaktliste(kontakt(), TESTNAVN));
// Mobil skrives tre-to-tre, fasttelefon i par. Begge er riktige.
ok("mobilnummer godtas",
   sjekkKontaktliste(kontakt({ telefon: { verdi: "+47 484 06 215", tillit: 1, kilde: "https://a.no", sitat: "x" } }), TESTNAVN).length === 0);
ok("nummer pa fremmed form fanges",
   sjekkKontaktliste(kontakt({ telefon: { verdi: "22416266", tillit: 1, kilde: "https://a.no", sitat: "x" } }), TESTNAVN)[0]
     .indexOf("ikke et norsk nummer") > -1);
ok("epost uten krull fanges",
   sjekkKontaktliste(kontakt({ epost: { verdi: "post.eksempel.no", tillit: 1, kilde: "https://a.no", sitat: "x" } }), TESTNAVN)
     .some((f) => f.indexOf("e-postadresse") > -1));
ok("ukjent matvalg fanges",
   sjekkKontaktliste(kontakt({ mat: { verdi: "pizza", tillit: 1, kilde: "https://a.no", sitat: "x" } }), TESTNAVN)
     .some((f) => f.indexOf("ukjent matvalg") > -1));
ok("kilde uten lenke fanges",
   sjekkKontaktliste(kontakt({ telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "sa en venn", sitat: "x" } }), TESTNAVN)
     .some((f) => f.indexOf("ikke en lenke") > -1));
ok("felt uten sitat fanges",
   sjekkKontaktliste(kontakt({ telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://a.no", sitat: "" } }), TESTNAVN)
     .some((f) => f.indexOf("mangler sitat") > -1));
ok("ukjent felt fanges",
   sjekkKontaktliste({ "Testpuben": { parkering: { verdi: "ja" } } }, TESTNAVN)[0].indexOf("ukjent felt") > -1);
ok("pub som ikke finnes i publista fanges",
   sjekkKontaktliste(kontakt(), ["En annen pub"]).some((f) => f.indexOf("ukjent pub") > -1));
ok("noe annet enn et oppslag fanges", sjekkKontaktliste("nei").length === 1);

// Det appen far vise: bare det en person har sett og datert.
ok("uverifisert star ikke til visning", Object.keys(kontaktFor("Testpuben", kontakt())).length === 0);
ok("verifisert slipper gjennom",
   kontaktFor("Testpuben", kontakt({
     telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://a.no", sitat: "x", verifisert: "2026-09-11" },
   })).telefon === "+47 22 41 62 66");
ok("bare det verifiserte feltet, ikke naboene",
   Object.keys(kontaktFor("Testpuben", kontakt({
     telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://a.no", sitat: "x", verifisert: "2026-09-11" },
     epost: { verdi: "post@eksempel.no", tillit: 1, kilde: "https://a.no", sitat: "x" },
   }))).join(",") === "telefon");
ok("verifisert som ikke er en dato fanges",
   sjekkKontaktliste(kontakt({ telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://a.no", sitat: "x", verifisert: "i gar" } }), TESTNAVN)
     .some((f) => f.indexOf("ikke en dato") > -1));
// Navnet slas opp foldet, som ellers i prosjektet.
ok("oppslaget taler skrivemate", !!finnKontakt("testpuben", kontakt()));
ok("ukjent pub gir ingenting",
   finnKontakt("Finnes Ikke", kontakt()) === null &&
   Object.keys(kontaktFor("Finnes Ikke", kontakt())).length === 0);
// Ingenting er verifisert enna: appen skal derfor ikke vise noe.
ok("ingenting i den ekte fila vises for noen har sett etter",
   Object.keys(PUBER_KONTAKT).every((n) => Object.keys(kontaktFor(n, PUBER_KONTAKT)).length === 0));
ok("feltlista er den fila bruker",
   Object.values(PUBER_KONTAKT).every((rad) =>
     Object.keys(rad).every((f) => KONTAKT_FELT.indexOf(f) > -1)));

/* ---------------- kanalen som sender ligaen ---------------- */

// Samme regel som kontaktopplysningene: en rad uten kilde og dato er et
// forslag, ikke en opplysning, og den skal aldri na leseren.
const KANAL_OK = { kanal: "TV 2 Play", kilde: "https://www.tv2.no/", sjekket: "2026-09-14" };

ok("en verifisert rad gir kanalen",
   kanalFor("eliteserien", { eliteserien: KANAL_OK }).kanal === "TV 2 Play");
// Denne het en gang «radene i den ekte fila star tomme til noen har sett
// etter», og den passerte fordi fila var tom den dagen den ble skrevet.
// Det var en TILSTAND kodet som en regel, og den brakk i det oyeblikket
// noen gjorde det fila finnes for: fem rader fort inn, og main ble rod.
//
// Regelen som faktisk gjelder er den samme uansett hvor mange rader som
// er fylt ut: en rad slipper gjennom nar ALLE tre star, og ikke ellers.
ok("den ekte fila slipper gjennom noyaktig de radene som er komplette",
   Object.keys(KANALER).every((liga) => {
     const rad = KANALER[liga];
     const komplett = !!(rad.kanal && rad.kilde && rad.sjekket);
     return (kanalFor(liga, KANALER) !== null) === komplett;
   }),
   Object.keys(KANALER).map((l) =>
     l + "=" + (kanalFor(l, KANALER) ? "vises" : "skjult")).join(" "));

// Hver av de tre manglene for seg. Uten dette kunne vokteren fange to av
// dem og slippe den tredje gjennom.
ok("uten kilde gir ingen kanal",
   kanalFor("a", { a: { ...KANAL_OK, kilde: null } }) === null);
ok("uten dato gir ingen kanal",
   kanalFor("a", { a: { ...KANAL_OK, sjekket: null } }) === null);
ok("uten kanalnavn gir ingenting",
   kanalFor("a", { a: { ...KANAL_OK, kanal: null } }) === null);

// Ukjent liga gir ingenting, ikke feil kanal — som ukjent arena i vaeret.
ok("ukjent liga gir null framfor feil kanal",
   kanalFor("handball", { eliteserien: KANAL_OK }) === null);
ok("uten liga og uten liste faller den pent",
   kanalFor(null, { eliteserien: KANAL_OK }) === null &&
   kanalFor("eliteserien", null) === null &&
   kanalFor(undefined, undefined) === null);

// Vokteren mot den EKTE fila, som publista og kontaktfila.
ok("kanalfila holder formen",
   sjekkKanalliste(KANALER, LIGAER).length === 0,
   sjekkKanalliste(KANALER, LIGAER).slice(0, 3).join(" | "));
ok("hver liga vi viser har en rad a fylle ut",
   Object.keys(LIGAER).every((liga) => KANALER[liga] !== undefined),
   Object.keys(LIGAER).filter((l) => !KANALER[l]).join(", "));

// Den viktigste regelen: et kanalnavn UTEN kilde og dato skal sla ut i
// testene. Da er det umulig a fore opp en kanal uten a si hvor den kom
// fra — og det er hele forskjellen pa en opplysning og en pastand.
ok("et kanalnavn uten kilde og dato slar ut",
   sjekkKanalliste({ eliteserien: { kanal: "Viaplay", kilde: null, sjekket: null } }, LIGAER)
     .some((f) => f.indexOf("uten kilde og dato") > -1));
ok("en kilde som ikke er en lenke slar ut",
   sjekkKanalliste({ eliteserien: { ...KANAL_OK, kilde: "tv2.no" } }, LIGAER)
     .some((f) => f.indexOf("ikke en lenke") > -1));
ok("en dato pa feil form slar ut",
   sjekkKanalliste({ eliteserien: { ...KANAL_OK, sjekket: "14.09.2026" } }, LIGAER)
     .some((f) => f.indexOf("ikke en dato") > -1));
ok("en ukjent liga i kanalfila slar ut",
   sjekkKanalliste({ handball: KANAL_OK }, LIGAER)
     .some((f) => f.indexOf("ukjent liga") > -1));
ok("et ukjent felt slar ut",
   sjekkKanalliste({ eliteserien: { ...KANAL_OK, pris: 449 } }, LIGAER)
     .some((f) => f.indexOf("ukjent felt") > -1));
ok("en tom kanalstreng slar ut framfor a bli en tom linje",
   sjekkKanalliste({ eliteserien: { ...KANAL_OK, kanal: "  " } }, LIGAER)
     .some((f) => f.indexOf("star oppfort tom") > -1));

/* ---------------- skallet i service workeren ---------------- */

// Hver modul appen importerer MA staa i SKALL. Mangler en, feiler
// c.addAll() i sin helhet — og da er ikke bare den ene visningen borte
// uten nett, hele skallet er det. Kommentaren i sw.js sier det; denne
// testen haandhever det.
//
// Lista vedlikeholdes for hand, sa dette er nettopp feilen en ny fil
// forer til: kanaler.js ble lagt til og glemt, og ingenting sa fra.
const KILDER = ["app.js", "fotball.js", "pub-data.js", "fotball-data.js", "lib.js",
                "visning-data.js", "svar-data.js", "konto-data.js", "pin-data.js",
                "vaer-data.js"];
const importert = new Set();
KILDER.forEach((fil) => {
  const tekst = readFileSync(new URL("../" + fil, import.meta.url), "utf8");
  for (const m of tekst.matchAll(/from\s+"\.\/([a-z0-9-]+\.js)"/g)) importert.add(m[1]);
});
const skall = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const iSkall = new Set(Array.from(skall.matchAll(/"\/([a-z0-9-]+\.js)"/g), (m) => m[1]));
const utenfor = [...importert].filter((f) => !iSkall.has(f));

ok("hver modul appen importerer ligger i service workerens skall",
   utenfor.length === 0, "mangler i SKALL: " + utenfor.join(", "));
ok("testen fant faktisk noen importer a sjekke",
   importert.size >= 10, importert.size);

/* ---------------- tjenestens ord, og konvolutten ---------------- */

// Den ekte kroppen fra natt til 22. september 2026. Innloggingen svarte
// 522, og dette sto i ansiktet pa leseren — kappet midt i en streng, og
// det leses som at noe knakk hos oss.
const CF_522 = JSON.stringify({
  type: "https://developers.cloudflare.com/support/troubleshooting/"
      + "http-status-codes/cloudflare-5xx-errors/error-522/",
  title: "Connection timed out",
  status: 522,
});

ok("en Cloudflare-konvolutt er ikke ord",
   tjenestensOrd(JSON.parse(CF_522), CF_522) === "",
   tjenestensOrd(JSON.parse(CF_522), CF_522));

// Og det er nettopp `title` som gjor den lumsk: den SER ut som en melding.
// Men «Connection timed out» er kantens ord om seg selv, ikke tjenestens
// om det vi spurte om — og felt vi ikke kjenner slipper ikke gjennom.
ok("heller ikke feltene den har som ligner",
   tjenestensOrd({ title: "Connection timed out", detail: "noe" }, "{}") === "");

// Supabases egne ord skal fortsatt fram. Det er hele grunnen til at
// `forsok` finnes.
ok("GoTrue sin setning slipper gjennom",
   tjenestensOrd({ error: "invalid_grant", error_description: "Invalid login credentials" },
     "{}") === "Invalid login credentials");
ok("og PostgREST sin",
   tjenestensOrd({ message: "relation \"pin_kontoer\" does not exist", code: "42P01" },
     "{}").indexOf("does not exist") > -1);
ok("og den eldre msg-formen",
   tjenestensOrd({ msg: "JWT expired" }, "{}") === "JWT expired");

// En HTML-side er ikke en setning. 5xx fra en kant kommer ofte slik.
ok("en HTML-side er ikke ord",
   tjenestensOrd(null, "<html><head><title>522</title>") === "");

// Men naken tekst er ord: PostgREST svarer av og til en ren setning.
ok("naken tekst er ord",
   tjenestensOrd(null, "  duplicate key value violates unique constraint  ")
     === "duplicate key value violates unique constraint");
ok("og ingenting er ingenting", tjenestensOrd(null, "") === "");
ok("og null taler det", tjenestensOrd(null, null) === "");

// Ett sted for rekkefolgen. Seks kopier hadde alt glidd: to leste
// error_description forst, fire message. Pa en kropp med BEGGE sa de to
// ulike ting om det samme svaret.
ok("error_description gar foran message",
   tjenestensOrd({ message: "kode", error_description: "setningen" }, "{}") === "setningen");
ok("og error kommer sist, for den er oftest en kode",
   tjenestensOrd({ error: "invalid_grant", msg: "Sier hva som skjedde" }, "{}")
     === "Sier hva som skjedde");

// Lengden: en melding som sprenger boksen er ikke lesbar.
ok("meldinga kappes pa 120 tegn",
   tjenestensOrd({ message: "x".repeat(300) }, "{}").length === 120);

// Kroppen kastes ikke — den flyttes. Uten dette byttet vi stoy mot
// blindhet: en 522-konvolutt sier HVOR det stoppet.
ok("kroppen blir med for diagnose",
   String(diagnosekropp(CF_522)).indexOf("cloudflare") > -1, diagnosekropp(CF_522));
ok("pa én linje, sa den kan leses i et felt",
   diagnosekropp("to\n  linjer") === "to linjer", diagnosekropp("to\n  linjer"));
// undefined, ikke "": et tomt felt leses som «tjenesten sa ingenting», og
// det er en annen pastand enn at vi ikke spurte.
ok("og en tom kropp gir ingen felt i det hele tatt",
   diagnosekropp("") === undefined && diagnosekropp(null) === undefined);

/* ---------------- folg systemet (#148) ---------------- */

// Temaet regnes ut TO steder: i app.js, og i forhandsskriptet i
// index.html som ma kjore for forste maling. Duplikatet er med vilje —
// app.js er en modul og kommer for sent til a hindre et glimt av feil
// tema — men to kopier av en regel glir fra hverandre, og her ville
// folgen vaert nettopp det glimtet skriptet finnes for a unnga.
//
// run.mjs maaler at appen svarer riktig. Denne holder at det andre stedet
// stiller de samme sporsmalene.
const INDEKS = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const APPKODE = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const FORHAND = INDEKS.slice(0, INDEKS.indexOf("</script>"));

ok("forhandsskriptet leser det nye temafeltet", /lagret\.tema/.test(FORHAND));
ok("og den gamle boolske formen, sa et valg fra for ikke ryker",
   /lagret\.svart/.test(FORHAND));
ok("og det sporr systemet nar valget er «system»",
   /prefers-color-scheme: dark/.test(FORHAND) && /"system"/.test(FORHAND));
ok("begge stedene spor om det samme",
   /prefers-color-scheme: dark/.test(APPKODE));

// Lytteren som gjor at «folg systemet» folger et bytte mens appen staar
// apen. run.mjs naar den ikke — lytteren henger pa det ekte
// matchMedia-objektet fra sidelastingen — sa dette er det eneste som
// sier fra om den forsvinner.
ok("appen lytter etter at systemet bytter",
   /addEventListener\("change"/.test(APPKODE) || /addListener/.test(APPKODE));

// Og den gamle formen skrives aldri tilbake: to felt om det samme er to
// sannheter, og den gamle ville blitt staende og lyve.
ok("readPrefs kaster det gamle feltet", /delete\s+lagret\.svart/.test(APPKODE));

/* ---------------- spoken som ikke lenger star i lista (#25) ---------------- */

// Sju spoker sto i ADS til 21. september 2026. De gikk ut fordi de to
// forste annonseplassene var vitser, og den plassen skal selge seg selv.
//
// **Merket ble staende.** Kommentaren over ADS lover at en vits kan legges
// inn igjen ved a sette `merke: "spok"` pa en rad — og det loftet holder
// bare sa lenge apparatet finnes. Ingen data bruker det lenger, sa
// ingenting i appen ville sagt fra om noen ryddet det bort som dodt. Da
// ville kommentaren blitt usann uten at en eneste test falt.
//
// run.mjs holder reglene for hvordan en spok SKAL se ut. Denne holder at
// det i det hele tatt gar an a lage en.
const APPJS = readFileSync(new URL("../app.js", import.meta.url), "utf8");

ok("merket «Spok» star fortsatt i EGNE_MERKER",
   /spok:\s*\{[^}]*merke:\s*"Spøk"[^}]*lest:\s*"Spøk, ikke en ekte annonse"/.test(APPJS),
   APPJS.indexOf("EGNE_MERKER") > -1 ? "EGNE_MERKER finnes, men uten spok" : "EGNE_MERKER borte");
ok("og en rad med merke spok far fortsatt klassen .ad-spok",
   /merke\s*===\s*"spok"[\s\S]{0,80}ad-spok/.test(APPJS));

// Og den andre halvdelen: ingen rad i ADS bruker det na. Star det en spok
// her mens run.mjs krever at feeden ikke har noen, er de to uenige om det
// samme — og da faller run.mjs med en melding om DOM framfor om dataene.
const ADSBLOKK = APPJS.slice(APPJS.indexOf("const ADS = ["),
                             APPJS.indexOf("\n];", APPJS.indexOf("const ADS = [")));
ok("ingen annonseplass er merket spok",
   ADSBLOKK.indexOf('merke: "spok"') === -1);
ok("og testen leste faktisk annonselista",
   ADSBLOKK.split('merke: "ledig"').length - 1 >= 5,
   ADSBLOKK.split('merke: "ledig"').length - 1);

/* ---------------- stedene admin retter (#80) ---------------- */

// Fila er grunnfjellet, basen barer rettelsene oppa. Det som testes her er
// selve sammenslaingen: at en rettelse erstatter hele raden, at et fjernet
// sted forsvinner, og at et nytt legges til — uten at fila rores.
const PUBFILA = [
  { navn: "Andy's Pub", bydel: "Sentrum", adresse: "Stortingsgata 8",
    lat: 59.9135, lon: 10.7340, type: "sportsbar", lag: [],
    kilde: "https://www.andyspub.no/", sikkerhet: "sannsynlig", sjekket: "2026-09-11" },
  { navn: "Scotsman", bydel: "Sentrum", adresse: "Karl Johans gate 35",
    lat: 59.9133, lon: 10.7412, type: "supporterpub", lag: ["Bod\u00f8/Glimt"],
    kilde: "https://scotsman.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
];

ok("nokkelen folder navnet, som lagnavn",
   pubNokkel("Andy's Pub") === pubNokkel("Andys Pub") && pubNokkel("Andy's Pub") !== "",
   pubNokkel("Andy's Pub"));
ok("et navn uten bokstaver gir ingen nokkel", pubNokkel("  ") === "" && pubNokkel(null) === "");

const PUBBASE = tolkPubRader([
  { nokkel: pubNokkel("Andys Pub"), navn: "Andy's Pub", bydel: "Sentrum",
    adresse: "Stortingsgata 10", lat: 59.9136, lon: 10.7341, type: "sportsbar",
    lag: ["Arsenal"], kilde: "https://www.andyspub.no/sport", sikkerhet: "bekreftet",
    sjekket: "2026-09-16", merknad: "Flyttet to nummer opp.", fjernet: false },
  { nokkel: pubNokkel("Scotsman"), navn: "Scotsman", fjernet: true },
  { nokkel: pubNokkel("Ny Pub"), navn: "Ny Pub", bydel: "Grunerlokka",
    adresse: "Thorvald Meyers gate 1", lat: 59.9230, lon: 10.7590, type: "pub",
    lag: [], kilde: "https://nypub.no/", sikkerhet: "bekreftet", sjekket: "2026-09-16" },
]);

const PUBSAMMEN = slaSammenPuber(PUBFILA, PUBBASE);
ok("en rettelse erstatter raden fra fila",
   PUBSAMMEN[0].navn === "Andy's Pub" && PUBSAMMEN[0].adresse === "Stortingsgata 10" &&
   PUBSAMMEN[0].sikkerhet === "bekreftet" && PUBSAMMEN[0].sjekket === "2026-09-16",
   JSON.stringify(PUBSAMMEN[0]));
// Hele raden, ikke felt for felt: halve rader fra to kilder er ikke til a
// lese tilbake. Laget fra basen star, laget fra fila er borte.
ok("og erstatter hele raden, ikke felt for felt",
   PUBSAMMEN[0].lag.join(",") === "Arsenal", JSON.stringify(PUBSAMMEN[0].lag));
ok("et fjernet sted forsvinner fra lista",
   !PUBSAMMEN.some((p) => p.navn === "Scotsman"), PUBSAMMEN.map((p) => p.navn).join(", "));
ok("et nytt sted legges bakerst",
   PUBSAMMEN[PUBSAMMEN.length - 1].navn === "Ny Pub", PUBSAMMEN.map((p) => p.navn).join(", "));
ok("den sammensatte lista holder formen sjekkPubliste krever",
   sjekkPubliste(PUBSAMMEN).length === 0, sjekkPubliste(PUBSAMMEN).join(" | "));
// Nokkelen er navnet foldet: apostrofen i basen er ikke den samme som i
// fila, og de skal likevel vaere ett sted.
ok("apostrofen skiller ikke to rader fra hverandre",
   PUBSAMMEN.filter((p) => pubNokkel(p.navn) === pubNokkel("Andys Pub")).length === 1);
ok("fila selv rores aldri",
   PUBFILA[0].adresse === "Stortingsgata 8" && PUBFILA.length === 2, PUBFILA[0].adresse);
ok("tom base gir lista fra fila, uendret",
   slaSammenPuber(PUBFILA, []).length === 2 &&
   slaSammenPuber(PUBFILA, null)[0].adresse === "Stortingsgata 8");
ok("nokkelen og fjernet folger ikke med ut",
   PUBSAMMEN.every((p) => p.nokkel === undefined && p.fjernet === undefined),
   JSON.stringify(PUBSAMMEN[0]));

// Ma tale a kjores to ganger: tjenesten tolker radene for den svarer, og
// portalen tolker svaret en gang til.
ok("tolkPubRader talar a kjores to ganger",
   JSON.stringify(tolkPubRader(PUBBASE)) === JSON.stringify(PUBBASE));
ok("og gir nokkel til en rad som kom uten",
   tolkPubRader([{ navn: "Uten Nokkel" }])[0].nokkel === pubNokkel("Uten Nokkel"));
ok("en rad uten navn faller ut", tolkPubRader([{ navn: "" }, null]).length === 0);

// Kilde og dato er ikke pynt. En udatert rad er verre enn ingen rad.
ok("en rad uten kilde slipper ikke gjennom",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { kilde: "" })).length > 0,
   sjekkPubRad(Object.assign({}, PUBBASE[0], { kilde: "" })).join(" | "));
// Den lille puben uten nettside skal kunne foeres inn. Editoren og fila
// bruker samme vokter, sa de kan ikke bli uenige om hva som holder.
ok("men en rad med en setning som kilde gjor det",
   sjekkPubRad(Object.assign({}, PUBBASE[0],
     { kilde: "Var innom 16.09.2026, storskjerm i baren" })).length === 0,
   sjekkPubRad(Object.assign({}, PUBBASE[0],
     { kilde: "Var innom 16.09.2026, storskjerm i baren" })).join(" | "));
ok("en rad uten dato slipper ikke gjennom",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { sjekket: "" })).length > 0);
ok("en rad i Trondheim slipper gjennom",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { lat: 63.4305, lon: 10.3951 })).length === 0,
   sjekkPubRad(Object.assign({}, PUBBASE[0], { lat: 63.4305, lon: 10.3951 })).join(" | "));
ok("en rad utenfor alle byene slipper ikke gjennom",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { lat: 48.85, lon: 2.35 })).length > 0);
ok("en ukjent type slipper ikke gjennom",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { type: "kafe" })).length > 0);
ok("en hel rad slipper gjennom", sjekkPubRad(PUBBASE[0]).length === 0,
   sjekkPubRad(PUBBASE[0]).join(" | "));
// Det eneste en fjernet rad sier er at stedet ikke skal vises. Da er det
// ingen opplysning om virkeligheten a sette en kilde bak.
ok("en fjernet rad slipper med navnet alene",
   sjekkPubRad({ navn: "Scotsman", fjernet: true }).length === 0,
   sjekkPubRad({ navn: "Scotsman", fjernet: true }).join(" | "));
ok("men en fjernet rad uten navn gjor ikke det",
   sjekkPubRad({ navn: "", fjernet: true }).length === 1);
// Feilen skal kunne leses av et menneske i portalen, ikke bare av koden.
ok("feilen sier hva som mangler, uten radnummer",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { kilde: "" })).join(" | ") === "mangler kilde",
   sjekkPubRad(Object.assign({}, PUBBASE[0], { kilde: "" })).join(" | "));

ok("raden til basen barer verken endret_av eller endret",
   pubRadTilBase(PUBBASE[0]).endret_av === undefined &&
   pubRadTilBase(PUBBASE[0]).endret === undefined,
   Object.keys(pubRadTilBase(PUBBASE[0])).join(","));
ok("og setter nokkelen selv, fra navnet",
   pubRadTilBase({ navn: "Andys Pub" }).nokkel === pubNokkel("Andy's Pub"));
ok("en tom merknad blir null, ikke tom streng",
   pubRadTilBase({ navn: "X", merknad: "  " }).merknad === null);
ok("typene og sikkerhetene er de samme som lista bruker",
   PUBTYPER.indexOf("sportsbar") > -1 && PUBSIKKERHET.indexOf("bekreftet") > -1);

/* ---- oppslaget i OpenStreetMap ---- */

// Overpass' eget sprak har bade hermetegn og regex. Et navn som
// «O'Leary's "Vika"» ville ellers brutt sporringen — eller vaert en vei
// til a skrive sin egen.
ok("hermetegn og apostrof vaskes bort for sporringen",
   osmNavnVask('O\'Leary\'s "Vika"').indexOf('"') === -1 &&
   osmNavnVask('O\'Leary\'s "Vika"').indexOf("'") === -1,
   osmNavnVask('O\'Leary\'s "Vika"'));
ok("og norske bokstaver blir staende", osmNavnVask("Blå Grønland") === "Blå Grønland",
   osmNavnVask("Blå Grønland"));
// Klassen var en handskrevet liste med norske tegn til 17. september 2026,
// og da falt alt annet ut som mellomrom. To ekte steder i Oslo ble
// usokbare: «Grünerløkka» ble «Gr nerløkka», «Café Sara» ble «Caf Sara».
// Nå er regelen «en bokstav, uansett sprak».
ok("og bokstaver fra andre sprak ogsa",
   osmNavnVask("Grünerløkka") === "Grünerløkka" &&
   osmNavnVask("Café Sara") === "Café Sara",
   osmNavnVask("Grünerløkka") + " | " + osmNavnVask("Café Sara"));
// Det som *skal* vaskes bort er det som kan bryte Overpass' egen
// sporring: hermetegn, apostrof, bakoverstrek.
ok("men tegnsetting slipper fortsatt ikke gjennom",
   /^[0-9A-Za-zÀ-ÿ ]+$/.test(osmNavnVask("Grünerløkka \\ \"x\" 'y'")),
   osmNavnVask("Grünerløkka \\ \"x\" 'y'"));
const PUBSPOR = osmNavnSporring("The Dubliner Folk Pub");
// Ett filter per ord. Overpass ANDer flere filtre pa samme nokkel, sa det
// betyr det samme som et regex med lookahead — men lookahead krever et
// regex-bygg som ikke alle speilene har, og overpass.osm.ch svarte HTTP
// 400 pa hvert eneste sok.
ok("sporringen krever alle ordene, i hvilken som helst rekkefolge",
   PUBSPOR.indexOf('["name"~"Dubliner",i]') > -1 &&
   PUBSPOR.indexOf('["name"~"Folk",i]') > -1, PUBSPOR);
// Sjekken ma vaere pa HELE filteret, ikke pa ordet: «Pub» star i
// «["name"~"Dubliner",i]» ogsa, og en indexOf("Pub") ville vaert gronn
// uansett hva koden gjorde.
ok("korte biter som «The» og «Pub» teller ikke med",
   PUBSPOR.indexOf('["name"~"The",i]') === -1 &&
   PUBSPOR.indexOf('["name"~"Pub",i]') === -1, PUBSPOR);
// Lookahead er ute overalt, ikke bare i det ene ordet vi ser etter.
ok("og ingen lookahead er igjen i sporringen",
   PUBSPOR.indexOf("(?=") === -1 &&
   osmAdresseSporring("Berglyveien 4J").indexOf("(?=") === -1, PUBSPOR);
// Apostrofen deler framfor a forsvinne: «OLearys» ville ikke truffet
// «O'Learys» i OpenStreetMap, men «Learys» gjor.
ok("apostrofen deler navnet framfor a lime det sammen",
   osmNavnSporring("O'Learys Vika").indexOf('["name"~"Learys",i]') > -1 &&
   osmNavnSporring("O'Learys Vika").indexOf('["name"~"OLearys",i]') === -1,
   osmNavnSporring("O'Learys Vika"));
ok("et navn med bare korte biter bruker den lengste alene",
   osmNavnSporring("Kro & Co") === osmNavnSporring("Kro"),
   osmNavnSporring("Kro & Co"));
ok("og sporringen holder seg innenfor Oslo som default",
   PUBSPOR.indexOf("(" + OSLO_RAMME.lat[0] + "," + OSLO_RAMME.lon[0]) > -1, PUBSPOR);
// Uten dette lette portalen bare i Oslo, og en RBK-pub i Trondheim kunne
// ikke finnes i det hele tatt — feltet for koordinater sto tomt, og
// lagringen avviste raden som fulgte.
ok("en annen by gir en annen boks",
   osmNavnSporring("RBK Pub", rammeFor("trondheim")).indexOf("(63.295,10.093") > -1,
   osmNavnSporring("RBK Pub", rammeFor("trondheim")));
ok("et navn uten ord a soke pa gir ingen sporring",
   osmNavnSporring("a b") === "" && osmNavnSporring("") === "");

const PUBTREFF = tolkNavnTreff({ elements: [
  { type: "node", lat: 59.9135, lon: 10.7340,
    tags: { name: "Andy's Pub", amenity: "bar", "addr:street": "Stortingsgata",
            "addr:housenumber": "8", website: "https://www.andyspub.no/" } },
  { type: "way", center: { lat: 59.9133, lon: 10.7412 },
    tags: { name: "Scotsman", amenity: "pub" } },
  { type: "node", lat: 59.9, lon: 10.7, tags: { amenity: "bar" } },
] }, 8);
ok("et treff barer navn, koordinat og adresse",
   PUBTREFF[0].navn === "Andy's Pub" && PUBTREFF[0].adresse === "Stortingsgata 8" &&
   PUBTREFF[0].lat === 59.9135, JSON.stringify(PUBTREFF[0]));
// «out center» gir ett punkt ogsa for bygninger tegnet som flater. Uten
// det ville halve treffene manglet koordinat.
ok("en flate gir punktet sitt fra center",
   PUBTREFF[1].lat === 59.9133 && PUBTREFF[1].lon === 10.7412, JSON.stringify(PUBTREFF[1]));
ok("et treff uten navn faller ut", PUBTREFF.length === 2, PUBTREFF.length);
// OSM sier «bar»; om det er en sportsbar hos oss er en vurdering, og den
// er det admin som gjor.
ok("slaget fra OSM oversettes ikke til var egen type",
   PUBTREFF[0].slag === "bar" && PUBTREFF[0].type === undefined, PUBTREFF[0].slag);
ok("taket pa antall treff holdes",
   tolkNavnTreff({ elements: PUBTREFF.concat(PUBTREFF).map((t) =>
     ({ lat: t.lat, lon: t.lon, tags: { name: t.navn } })) }, 3).length === 3);

/* ---------------- adressen som vei til koordinatet ---------------- */

// Navnesoket finner ikke et sted OSM ikke kjenner navnet pa, og det er
// de sma stedene — nettopp de admin ma foere inn for hand. Meldt 16.
// september 2026: «Berglyveien 4J», ingen koordinater, ingen vei videre.
ok("husnummeret skilles fra gata",
   JSON.stringify(delAdresse("Berglyveien 4J")) === '{"gate":"Berglyveien","nummer":"4J"}',
   JSON.stringify(delAdresse("Berglyveien 4J")));
ok("en gate med flere ord holder sammen",
   delAdresse("Karl Johans gate 1").gate === "Karl Johans gate",
   JSON.stringify(delAdresse("Karl Johans gate 1")));
ok("en gate uten nummer er en gate",
   delAdresse("Grensen").gate === "Grensen" && delAdresse("Grensen").nummer === "");
// «4J» alene er ikke en adresse. Uten denne ville den blitt slatt opp som
// gatenavn, og et tomt svar ser ut som «huset finnes ikke».
ok("et husnummer alene er ingen adresse",
   delAdresse("4J") === null && delAdresse("12") === null && delAdresse("") === null);

// Meldt 17. september 2026: adressesoket ga null treff pa et innsendt
// forslag. Nummeret ble lest som *siste* bit, sa alt som kom etter havnet
// i gatenavnet — og «Torggata 11 Oslo» finnes ikke som gate noe sted.
// Folk skriver poststed etter adressen; et innsendt forslag gjor det
// nesten alltid.
ok("poststed etter adressen kastes",
   delAdresse("Torggata 11, Oslo").gate === "Torggata" &&
   delAdresse("Torggata 11, Oslo").nummer === "11",
   JSON.stringify(delAdresse("Torggata 11, Oslo")));
ok("og postnummer med poststed ogsa",
   delAdresse("Torggata 11, 0181 Oslo").gate === "Torggata" &&
   delAdresse("Torggata 11, 0181 Oslo").nummer === "11",
   JSON.stringify(delAdresse("Torggata 11, 0181 Oslo")));
// Nummeret star rett etter gata, og gata kan ha flere ord for det.
ok("en flerordsgate med poststed holder fortsatt sammen",
   delAdresse("Thorvald Meyers gate 30, Oslo").gate === "Thorvald Meyers gate",
   JSON.stringify(delAdresse("Thorvald Meyers gate 30, Oslo")));
// «Vs» i «Olav Vs gate» er ingen bokstav bak et tall, sa den skal ikke
// leses som husnummer.
ok("et ord midt i gatenavnet er ikke et husnummer",
   delAdresse("Olav Vs gate 1").gate === "Olav Vs gate" &&
   delAdresse("Olav Vs gate 1").nummer === "1",
   JSON.stringify(delAdresse("Olav Vs gate 1")));

const ADRSPOR = osmAdresseSporring("Berglyveien 4J");
ok("adressesporringen sporr pa begge taggene",
   ADRSPOR.indexOf('["addr:street"~"^Berglyveien$",i]') > -1 &&
   ADRSPOR.indexOf('["addr:housenumber"~"^4J$",i]') > -1, ADRSPOR);
// Forankret med ^$: «Berglyveien» skal ikke dra med seg «Berglyveien
// Terrasse», som er en annen gate.
ok("gata er forankret, ikke bare et delstreng-sok",
   ADRSPOR.indexOf('"^Berglyveien$"') > -1, ADRSPOR);
ok("og sporringen holder seg innenfor Oslo som default",
   ADRSPOR.indexOf("(" + OSLO_RAMME.lat[0] + "," + OSLO_RAMME.lon[0]) > -1, ADRSPOR);
ok("og en adresse kan sokes opp i en annen by",
   osmAdresseSporring("Nordre gate 1", rammeFor("trondheim")).indexOf("(63.295,10.093") > -1,
   osmAdresseSporring("Nordre gate 1", rammeFor("trondheim")));
ok("uten nummer star gata alene",
   osmAdresseSporring("Grensen").indexOf("addr:housenumber") === -1,
   osmAdresseSporring("Grensen"));
ok("en adresse uten gate gir ingen sporring",
   osmAdresseSporring("4J") === "" && osmAdresseSporring("") === "");

// Et hus har som regel ingen `name`. Navnesoket kaster de radene — her er
// de hele poenget.
const HUS = { elements: [
  { lat: 59.84, lon: 10.79, tags: { "addr:street": "Berglyveien", "addr:housenumber": "4J" } },
  { lat: 59.85, lon: 10.78, tags: { name: "Puben", "addr:street": "Grensen" } },
] };
ok("et hus uten navn faller ikke ut av adressesoket",
   tolkAdresseTreff(HUS).length === 2, tolkAdresseTreff(HUS).length);
ok("og adressen star som overskrift nar navnet mangler",
   tolkAdresseTreff(HUS)[0].navn === "Berglyveien 4J",
   tolkAdresseTreff(HUS)[0].navn);
ok("mens et navn som finnes blir staende",
   tolkAdresseTreff(HUS)[1].navn === "Puben", tolkAdresseTreff(HUS)[1].navn);
// Navnesoket skal fortsatt kaste dem: der er en rad uten navn stoy.
ok("navnesoket kaster den samme raden",
   tolkNavnTreff(HUS).length === 1, tolkNavnTreff(HUS).length);

/* ---------------- koordinat fra en kartlenke ---------------- */

// Den eneste veien til et koordinat som ikke trenger at noen svarer.
ok("google-lenka gir stedets eget punkt, ikke kartets midtpunkt",
   JSON.stringify(koordinatFraLenke(
     "https://www.google.com/maps/place/Pub/@59.91111,10.71111,15z/data=!3m1!4b1!4m6!3d59.92222!4d10.72222"))
   === '{"lat":59.92222,"lon":10.72222}',
   JSON.stringify(koordinatFraLenke(
     "https://www.google.com/maps/place/Pub/@59.91111,10.71111,15z/data=!3m1!4b1!4m6!3d59.92222!4d10.72222")));
ok("uten stedspunkt duger kartets midtpunkt",
   koordinatFraLenke("https://www.google.com/maps/@59.91111,10.71111,17z").lat === 59.91111);
ok("openstreetmap sin markor leses",
   koordinatFraLenke("https://www.openstreetmap.org/?mlat=59.9139&mlon=10.7522").lon === 10.7522);
ok("og kartutsnittet nar markoren mangler",
   koordinatFraLenke("https://www.openstreetmap.org/#map=19/59.9139/10.7522").lat === 59.9139);
ok("to tall limt inn rett fra et kart duger ogsa",
   koordinatFraLenke("59.9139, 10.7522").lon === 10.7522);
// Meldt 18. september 2026: «Googlemaps gir meg denne (59.8339740,
// 10.8062285)». Parentesene kommer med nar punktet kopieres fra
// stedskortet, og anker-^-et gjorde dem til «Fant ingen koordinater» —
// pa et koordinat som sto rett foran den som limte det inn.
ok("parenteser rundt koordinatet er ingen hindring",
   koordinatFraLenke("(59.8339740, 10.8062285)").lat === 59.833974 &&
   koordinatFraLenke("(59.8339740, 10.8062285)").lon === 10.8062285,
   JSON.stringify(koordinatFraLenke("(59.8339740, 10.8062285)")));
ok("og hakeparenteser heller ikke",
   koordinatFraLenke("[59.8339740, 10.8062285]").lat === 59.833974);
ok("mellomrom rundt det hele gjor ingenting",
   koordinatFraLenke("  (59.8339740,10.8062285)  ").lon === 10.8062285);
// Vakta skal fortsatt holde: to tall uten sammenheng er ikke et koordinat
// bare fordi de star i en tekst.
ok("men tall midt i en setning er fortsatt ingen koordinater",
   !!koordinatFraLenke("puben apnet i 1959.9139 og 10.7522 er ikke noe").feil ||
   koordinatFraLenke("puben apnet i 1959.9139 og 10.7522 er ikke noe").lat === undefined,
   JSON.stringify(koordinatFraLenke("puben apnet i 1959.9139 og 10.7522 er ikke noe")));
// En kortlenke baerer ingen koordinater i det hele tatt. «Fant ingenting»
// ville sendt admin ut for a lete etter noe som ikke er der.
ok("en kortlenke sier hva som er galt med den",
   (koordinatFraLenke("https://maps.app.goo.gl/abc123").feil || "").indexOf("Kortlenker") === 0,
   JSON.stringify(koordinatFraLenke("https://maps.app.goo.gl/abc123")));
ok("og noe som ikke er en lenke sier det ogsa",
   !!koordinatFraLenke("hei").feil && !koordinatFraLenke("hei").lat);
ok("tomt inn gir ingenting ut", koordinatFraLenke("") === null);

// Fristen og sporringens egen timeout var to tall, og de sa ikke det
// samme: vi la pa etter seks sekunder mens sporringen ba om tolv. Da var
// det vi som ga opp — men meldingen sa «Fikk ikke svar fra OpenStreetMap».
ok("sporringen ber om den tida tjenesten faktisk venter",
   osmNavnSporring("Dubliner").indexOf("[timeout:" + SOK_SEKUNDER + "]") > -1 &&
   osmAdresseSporring("Grensen").indexOf("[timeout:" + SOK_SEKUNDER + "]") > -1,
   osmNavnSporring("Dubliner").slice(0, 30));

/* ---------------- hva portalen sier om det som alt er satt ---------------- */

// Meldt 17. september 2026: admin sa tre avkryssinger, hinten sa fem, og
// sluttet at to var borte. Ingenting var borte — de to sto lenger ned enn
// skjermen rakk. «Viser 5 kamper fra for» var sant og ubrukelig pa samme
// tid: den svarte ikke pa sporsmalet admin faktisk hadde, *ble det jeg
// lagret staende?*
ok("star alle i lista, sies det",
   visningsHint(5, 5, "Andys Pub") === "Andys Pub viser 5 kamper fra før, alle i lista under.",
   visningsHint(5, 5, "Andys Pub"));
// Det gamle tallet talte pa tvers av ligaer mens boksene viste én. Har
// puben to kamper i Premier League, sa hinten fem der Eliteserien kunne
// vise tre — og forskjellen sa ut som tap.
ok("ligger noen i en annen liga, star det hvor mange",
   visningsHint(5, 3, "Andys Pub").indexOf("3 i denne ligaen, 2 i en annen") > -1,
   visningsHint(5, 3, "Andys Pub"));
ok("ingen i denne ligaen sies uten a telle til null",
   visningsHint(2, 0, "Andys Pub").indexOf("ingen av dem i denne ligaen") > -1 &&
   visningsHint(2, 0, "Andys Pub").indexOf("0 i denne") === -1,
   visningsHint(2, 0, "Andys Pub"));
ok("ingenting satt sier nettopp det",
   visningsHint(0, 0, "Andys Pub") === "Ingen kamper satt på denne puben ennå.",
   visningsHint(0, 0, "Andys Pub"));
ok("én kamp boyes som én",
   visningsHint(1, 1, "Andys Pub").indexOf("1 kamp fra") > -1 &&
   visningsHint(1, 1, "Andys Pub").indexOf("kamper") === -1,
   visningsHint(1, 1, "Andys Pub"));
// Uten pub star setningen fortsatt: pubvelgeren kan vaere tom.
ok("uten pubnavn star setningen likevel",
   visningsHint(3, 3, "").indexOf("Viser 3 kamper") === 0, visningsHint(3, 3, ""));

// Tallet over hver runde. Uten det ma admin rulle gjennom hele lista for
// a vite om noe er krysset av lenger nede.
ok("rundetallet sier valgt av totalt", rundeTall(3, 6) === "3 av 6 valgt", rundeTall(3, 6));
ok("en runde uten kamper far ingen tekst", rundeTall(0, 0) === "", rundeTall(0, 0));

// Knappen som krysser av en hel runde. Samme regel som lagreKnappTekst:
// den sier hva trykket GJOR, ikke hvor mye som star avkrysset. «Kryss av
// alle 8» nar tre alt star, er usant om handlingen — den legger til fem.
ok("ingenting avkrysset: trykket tar hele runden",
   rundeKnappTekst(0, 8) === "Kryss av alle 8", rundeKnappTekst(0, 8));
ok("noe avkrysset: trykket teller det som MANGLER",
   rundeKnappTekst(3, 8) === "Kryss av 5 til", rundeKnappTekst(3, 8));
ok("alt avkrysset: trykket fjerner i stedet",
   rundeKnappTekst(8, 8) === "Fjern alle 8", rundeKnappTekst(8, 8));
// En runde med én kamp er ikke «alle 1».
ok("én kamp far entall",
   rundeKnappTekst(0, 1) === "Kryss av kampen" &&
   rundeKnappTekst(1, 1) === "Fjern kampen",
   rundeKnappTekst(0, 1) + " / " + rundeKnappTekst(1, 1));
ok("en tom runde gir ingen knappetekst", rundeKnappTekst(0, 0) === "");
// Flere avkrysset enn det finnes bokser skal ikke gi «Kryss av -1 til».
ok("tull inn gir ikke en negativ opptelling",
   rundeKnappTekst(9, 8) === "Fjern alle 8", rundeKnappTekst(9, 8));

/* ---------------- falsk posisjon, for a teste andre byer ---------------- */

// Pubene «naer deg» kommer fra Overpass, og Overpass svarer pa hvor du
// star. Appen er bygd og prov i Oslo. Meldt 18. september 2026: «vi ma
// finne ut hvordan vi kan teste det sa reelt som mulig uten a ha noen
// fysisk der.»
ok("en by gir koordinatet sitt",
   falskPosisjon("?posisjon=bodo").navn === "Bodø" &&
   falskPosisjon("?posisjon=bodo").lat === BYER.bodo.lat,
   JSON.stringify(falskPosisjon("?posisjon=bodo")));
// Den som taster dette pa en telefon skal slippe a treffe o-en.
ok("navnet foldes, sa Bodø og bodo er samme by",
   falskPosisjon("?posisjon=Bodø").lat === falskPosisjon("?posisjon=bodo").lat);
ok("og store bokstaver spiller ingen rolle",
   falskPosisjon("?posisjon=TRONDHEIM").navn === "Trondheim");
ok("et koordinat gar ogsa",
   falskPosisjon("?posisjon=67.28,14.40").lat === 67.28 &&
   falskPosisjon("?posisjon=67.28,14.40").kilde === "koordinat",
   JSON.stringify(falskPosisjon("?posisjon=67.28,14.40")));
ok("parameteren finnes ogsa blant andre",
   falskPosisjon("?a=1&posisjon=bergen&b=2").navn === "Bergen");
// Null nar det ikke er satt, og null nar det er tull: a late som ville
// gitt et tomt pubsok uten at noen skjonte hvorfor.
ok("uten parameteren er det ingen falsk posisjon",
   falskPosisjon("") === null && falskPosisjon(null) === null &&
   falskPosisjon("?liga=premier") === null);
ok("en ukjent by er ingen posisjon", falskPosisjon("?posisjon=maanen") === null);
ok("og et tall utenfor kloden er det heller ikke",
   falskPosisjon("?posisjon=999,999") === null &&
   falskPosisjon("?posisjon=91,0") === null &&
   falskPosisjon("?posisjon=0,181") === null);
ok("en tom verdi gir null", falskPosisjon("?posisjon=") === null);
// Byene ma ha ekte koordinater, ellers maler skriptet feil sted.
ok("alle testbyene har et koordinat i Norge",
   Object.values(BYER).every((b) =>
     b.lat > 57 && b.lat < 72 && b.lon > 4 && b.lon < 32 && b.navn),
   JSON.stringify(Object.values(BYER).map((b) => b.navn)));

/* ---------------- ligaene et sted sender ---------------- */

// Meldt 19. september 2026: «viser alt flagg ma vi snakke om». Det ble
// ikke «viser alt», for kamper KOLLIDERER: tre Eliteserie-kamper kl. 15
// blir tre pastander der et sted med én skjerm bare kan innfri én.
// Pastanden ligger derfor pa liganiva.
/* ------------- «ikke denne kvelden» ------------- */

// Hullet ligaflagget lagde: 📺 «Sender Eliteserien» er en STAENDE pastand
// om sesongen, og den kunne ikke sies imot for den ene kvelden stedet er
// stengt. Eneste utvei var a ta hele flagget bort — og det ville vaert
// usant resten av sesongen.
const NKAMP = { hjemme: "Rosenborg", borte: "Brann",
                nokkel: "2026-10-01-rosenborg-brann", liga: "eliteserien" };
const NVISNINGER = [
  { pub: "Ja-puben", kampId: "2026-10-01-rosenborg-brann", viser: true },
  { pub: "Nei-puben", kampId: "2026-10-01-rosenborg-brann", viser: false },
  { pub: "Annen kamp", kampId: "2026-10-02-viking-molde", viser: false },
];

ok("et nei er ikke en bekreftelse",
   bekreftetFor(NKAMP, NVISNINGER, []).map((p) => p.navn).join(",") === "Ja-puben",
   bekreftetFor(NKAMP, NVISNINGER, []).map((p) => p.navn).join(",") || "(tom)");
ok("og nei-ene kan slas opp for seg",
   avkreftetFor(NKAMP, NVISNINGER).map((v) => v.pub).join(",") === "Nei-puben",
   avkreftetFor(NKAMP, NVISNINGER).map((v) => v.pub).join(",") || "(tom)");
// Et nei gjelder én kamp, ikke stedet. Sto det pa stedet, var vi tilbake
// til a ta hele flagget bort.
ok("et nei pa en ANNEN kamp rorer ikke denne",
   avkreftetFor(NKAMP, NVISNINGER).length === 1);

// Det nei-et faktisk gjor: tar stedet ut av lista for nettopp den kampen.
const NLISTE = [{ navn: "Ja-puben" }, { navn: "Nei-puben" }, { navn: "Uten mening" }];
ok("stedet som sa nei star ikke i lista",
   utenAvkreftede(NLISTE, avkreftetFor(NKAMP, NVISNINGER))
     .map((p) => p.navn).join(",") === "Ja-puben,Uten mening",
   utenAvkreftede(NLISTE, avkreftetFor(NKAMP, NVISNINGER)).map((p) => p.navn).join(","));
ok("og uten nei rores lista ikke",
   utenAvkreftede(NLISTE, []).length === 3);
// Foldingen ma vaere den samme som ellers, ellers slipper «Nei-Puben»
// gjennom fordi den er skrevet med stor P.
ok("navnet foldes som ellers",
   utenAvkreftede([{ navn: "NEI-PUBEN" }],
     [{ pub: "nei-puben" }]).length === 0);

// tolkVisninger ma baere fortegnet — og en rad fra for kolonnen fantes
// sa ja. Bare et uttrykkelig `false` er et nei.
ok("en rad uten feltet betyr ja",
   tolkVisninger([{ pub: "P", kamp_id: "k" }])[0].viser === true);
ok("og bare et uttrykkelig false er et nei",
   tolkVisninger([{ pub: "P", kamp_id: "k", viser: false }])[0].viser === false &&
   tolkVisninger([{ pub: "P", kamp_id: "k", viser: true }])[0].viser === true);

// slaSammen lager begge slag, og et ja vinner om portalen sender begge.
const NRADER = slaSammen("Carls", ["2026-09-13-brann-bodoglimt"], VKAMPER, VNAA,
                         ["2026-09-14-molde-rosenborg"]);
ok("bade ja og nei blir rader",
   NRADER.length === 2 && NRADER.some((r) => r.viser === true) &&
   NRADER.some((r) => r.viser === false),
   JSON.stringify(NRADER.map((r) => [r.kampId, r.viser])));
// VKAMPER har to kamper, og begge fikk en mening her. Den tredje
// paastanden er at et TOMT valg ikke lager rader — ingen mening er ingen
// rad, og det er hele grunnen til at nei-ene er en egen liste.
ok("og uten noen mening blir det ingen rader",
   slaSammen("Carls", [], VKAMPER, VNAA, []).length === 0);

// Diffen ma se et fortegn som snur. Sto den bare pa kampId, ble «ikke
// denne kvelden» lagret som «ingen endring» og nadde aldri basen.
const NDFOR = [{ kampId: "a", viser: true }, { kampId: "b", viser: true }];
const NDTIL = [{ kampId: "a", viser: false }, { kampId: "b", viser: true }];
const NDIFF = visningsDiff(NDFOR, NDTIL);
ok("et ja som blir et nei er en ENDRING",
   NDIFF.endret.length === 1 && NDIFF.endret[0].kampId === "a",
   JSON.stringify(NDIFF.endret));
ok("og den som sto likt er uendret",
   NDIFF.uendret.length === 1 && NDIFF.uendret[0].kampId === "b");
ok("uendret teller ikke den som snudde",
   !NDIFF.uendret.some((v) => v.kampId === "a"), JSON.stringify(NDIFF.uendret));
ok("nye og fjern virker som for",
   visningsDiff([], NDTIL).nye.length === 2 &&
   visningsDiff(NDFOR, []).fjern.length === 2);

const LIGADAG = (s) => new Date(s + "T12:00:00Z");
const FLAGG = {
  sender: ["eliteserien", "premier"],
  kilde: "Ringte 19.09.2026, de sender alle Eliteserie-kamper",
  sjekket: "2026-09-19",
};

ok("et flagg gjelder ligaen det ble satt for",
   ligaflaggGjelder(FLAGG, "eliteserien", LIGADAG("2026-09-19")) === true);
ok("men ikke en liga det ikke nevner",
   ligaflaggGjelder(FLAGG, "laliga", LIGADAG("2026-09-19")) === false);

// FORELDELSEN. Dette er hele grunnen til at flagget er trygt: hver annen
// opplysning her doer av seg selv, men et staende flagg doer aldri.
// sesongFor() kjenner alt forskjellen, sa det trengs ingen egen dato.
ok("Eliteserien gjelder ut aret",
   ligaflaggGjelder(FLAGG, "eliteserien", LIGADAG("2026-12-31")) === true);
ok("og er utlopt ved nyttar",
   ligaflaggGjelder(FLAGG, "eliteserien", LIGADAG("2027-01-01")) === false,
   "kalenderliga skal doe ved arsskiftet");
// Premier League er host-var: den SKAL overleve nyttar, ellers hadde
// flagget dodd midt i sesongen.
ok("Premier League overlever nyttar",
   ligaflaggGjelder(FLAGG, "premier", LIGADAG("2027-01-01")) === true);
ok("og utloper forst i juli",
   ligaflaggGjelder(FLAGG, "premier", LIGADAG("2027-06-30")) === true &&
   ligaflaggGjelder(FLAGG, "premier", LIGADAG("2027-07-01")) === false);

// Kilde og dato, som for kanalene og kontaktfeltene. Uten dem er det en
// pastand ingen kan etterproeve, og da vises den ikke.
ok("et flagg uten kilde gjelder ikke",
   ligaflaggGjelder({ sender: ["eliteserien"], sjekket: "2026-09-19" },
                    "eliteserien", LIGADAG("2026-09-19")) === false);
ok("og et uten dato heller ikke",
   ligaflaggGjelder({ sender: ["eliteserien"], kilde: "Ringte dem og spurte" },
                    "eliteserien", LIGADAG("2026-09-19")) === false);
ok("tull inn kaster ikke",
   ligaflaggGjelder(null, "eliteserien", LIGADAG("2026-09-19")) === false &&
   ligaflaggGjelder(FLAGG, "", LIGADAG("2026-09-19")) === false &&
   ligaflaggGjelder(FLAGG, "finnesikke", LIGADAG("2026-09-19")) === false);

// Kilden siler KANDIDATER — den leter ikke selv. Geografien er gjort av
// den som kaller, sa et Oslo-sted ikke blir et svar i Trondheim.
const KANDIDATER = [
  { navn: "Med flagg", ligaer: FLAGG },
  { navn: "Uten flagg" },
  { navn: "Utlopt flagg", ligaer: Object.assign({}, FLAGG, { sjekket: "2025-09-19" }) },
];
const LIGAPUBER = ligapuberAv(KANDIDATER, { liga: "eliteserien" }, LIGADAG("2026-09-19"));
ok("bare stedene med et gyldig flagg kommer med",
   LIGAPUBER.map((p) => p.navn).join(",") === "Med flagg",
   LIGAPUBER.map((p) => p.navn).join(",") || "(tom)");
ok("en kamp uten liga gir ingen",
   ligapuberAv(KANDIDATER, {}, LIGADAG("2026-09-19")).length === 0);

// Et ANTATT sted kan ikke sende en liga.
//
// Avgjort i flettinga 21. september 2026, da ligaflagget og de antatte
// stedene motte hverandre. Kilden ligger rett etter `bekreftede`, saa uten
// dette ville en gjetning blitt LOFTET over alt geografisk — et sted vi
// ikke har sjekket i det hele tatt, staaende der det sterkeste svaret
// skulle vaert.
//
// Det holdt ikke aa sette «?» foran 📺 i merkekjeden: rekkefolgen i lista
// avgjores her, ikke av hvilket tegn raden faar.
const ANTATT_MED_FLAGG = ligapuberAv(
  [{ navn: "Gjettepuben", sikkerhet: "usikker", ligaer: FLAGG },
   { navn: "Sjekkepuben", sikkerhet: "bekreftet", ligaer: FLAGG },
   { navn: "Sett etter", sikkerhet: "sannsynlig", ligaer: FLAGG }],
  { liga: "eliteserien" }, LIGADAG("2026-09-19"));
ok("et antatt sted sender ingen liga, flagg eller ei",
   ANTATT_MED_FLAGG.map((p) => p.navn).indexOf("Gjettepuben") === -1,
   ANTATT_MED_FLAGG.map((p) => p.navn).join(",") || "(tom)");
// Grensa gaar ved `usikker`, som ellers: `sannsynlig` betyr at noen har
// sett etter og trodd det, og det er nok til aa baere et flagg noen har
// datert og kildebelagt.
ok("men et sannsynlig og et bekreftet gjor",
   ANTATT_MED_FLAGG.length === 2,
   ANTATT_MED_FLAGG.map((p) => p.navn).join(",") || "(tom)");

// Merket NAVNGIR ligaen. «Viser vanligvis kamper» ville latt leseren tro
// det gjaldt kampen hen ser pa, ogsa nar stedet ikke sender den ligaen.
ok("merket navngir ligaen",
   ligamerkeTekst("eliteserien") === "Sender Eliteserien",
   ligamerkeTekst("eliteserien"));
ok("og en ukjent liga gir ingen tekst", ligamerkeTekst("tulleliga") === "");

// Plasseringen: rett etter bekreftede, for alt annet. Bare ★ er
// sterkere — der har et menneske sett pa nettopp denne kampen.
ok("ligapuber star rett etter bekreftede",
   FORSLAG_KILDER.indexOf("ligapuber") === FORSLAG_KILDER.indexOf("bekreftede") + 1,
   FORSLAG_KILDER.join(","));
ok("og foran alle de geografiske",
   FORSLAG_KILDER.indexOf("ligapuber") < FORSLAG_KILDER.indexOf("kjenteNaer") &&
   FORSLAG_KILDER.indexOf("ligapuber") < FORSLAG_KILDER.indexOf("naerDeg"),
   FORSLAG_KILDER.join(","));

// Vakta: krysser du av en liga uten kilde, skal portalen si fra FOR
// lagring. Uten dette ville raden blitt lagret og aldri vist — og admin
// trodd flagget sto.
ok("et flagg uten kilde stoppes av vakta",
   sjekkLigaflagg({ sender: ["eliteserien"], sjekket: "2026-09-19" }).length === 1);
ok("en ukjent liga stoppes ogsa",
   sjekkLigaflagg({ sender: ["tulleliga"], kilde: "Ringte dem og spurte",
                    sjekket: "2026-09-19" }).join(",").indexOf("ukjent liga") === 0);
// Ingen ligaer krysset av er INGEN pastand, og da kreves ingenting.
ok("men ingen ligaer krever ingenting",
   sjekkLigaflagg({ sender: [] }).length === 0 &&
   sjekkLigaflagg(null).length === 0);

// Lagringa: et tomt flagg og «ingen pastand» skal bli den samme raden.
ok("et tomt flagg lagres som ingenting",
   ligaflaggTilBase({ sender: [] }) === null &&
   ligaflaggTilBase({ sender: ["tulleliga"] }) === null);
ok("og ukjente ligaer siles bort for lagring",
   JSON.stringify(ligaflaggTilBase({ sender: ["eliteserien", "tulleliga"],
     kilde: "Ringte dem og spurte", sjekket: "2026-09-19" }).sender) ===
   JSON.stringify(["eliteserien"]));
// Sesongen lagres ikke: den leses av sjekket. To felt kunne sagt hver
// sin sesong om det samme flagget.
ok("sesongen lagres ikke som et eget felt",
   ligaflaggTilBase(FLAGG).sesong === undefined,
   JSON.stringify(ligaflaggTilBase(FLAGG)));

/* ---------------- nar posisjonen uteblir ---------------- */

// Meldt 19. september 2026: «undersok hvorfor posisjon ikke slo inn».
// Det gikk ikke an a undersoke fra skjermen, og DET var feilen: appen
// handterte nei, tidsavbrudd og «fant ikke posisjonen» likt og stille.
// Fire ulike arsaker ma gi fire ulike setninger, ellers er sporsmalet
// ubesvarlig for den som star der.
const GRUNNER = [0, 1, 2, 3].map((k) => posisjonsfeil(k));
ok("hver arsak far sin egen setning",
   new Set(GRUNNER).size === 4, GRUNNER.join(" | "));

ok("et nei sier at det var DU som sa nei",
   posisjonsfeil(1).indexOf("Du sa nei") === 0, posisjonsfeil(1));

ok("et tidsavbrudd legger ikke skylda pa deg",
   posisjonsfeil(3).indexOf("Du sa nei") === -1 &&
   posisjonsfeil(3).indexOf("kom ikke fram i tide") > 0, posisjonsfeil(3));

ok("en nettleser uten posisjon sier at det er nettleseren",
   posisjonsfeil(0).indexOf("Nettleseren") === 0, posisjonsfeil(0));

// En ukjent kode er fortsatt et svar. Kastet den, eller ga den tom
// streng, ville skjermen vaert like taus som for.
ok("en ukjent kode gir likevel en setning",
   posisjonsfeil(99).length > 10 && posisjonsfeil(undefined).length > 10,
   posisjonsfeil(99) + " | " + posisjonsfeil(undefined));

// Hver setning ma si hva som mangler pa skjermen, ikke bare hva som
// skjedde: «Du sa nei til posisjon» alene forklarer ikke den tomme lista.
ok("hver setning navngir det som uteblir",
   GRUNNER.concat([posisjonsfeil(99)])
     .every((t) => t.indexOf("nær deg") > 0), GRUNNER.join(" | "));

/* ---------------- hva en lagring faktisk endrer ---------------- */

// Meldt 18. september 2026: «Jeg kommer inn, fem kamper er markert, jeg
// legger til én, og da star det 6 lagret. Egentlig sa lagrer bruker 1 da.»
const FRA_FOR = [{ kampId: "a" }, { kampId: "b" }];
const ONSKET = [{ kampId: "b" }, { kampId: "c" }];
const DIFF = visningsDiff(FRA_FOR, ONSKET);
ok("bare det som ikke sto der fra for er nytt",
   DIFF.nye.length === 1 && DIFF.nye[0].kampId === "c", JSON.stringify(DIFF.nye));
ok("bare det som falt ut skal fjernes",
   DIFF.fjern.length === 1 && DIFF.fjern[0].kampId === "a", JSON.stringify(DIFF.fjern));
// Den uendrede er hele poenget: den skal verken slettes eller skrives, sa
// `satt` og `satt_av` star som de sto.
ok("og den som sto der og fortsatt star, er uendret",
   DIFF.uendret.length === 1 && DIFF.uendret[0].kampId === "b",
   JSON.stringify(DIFF.uendret));
ok("ingen endring gir tre tomme lister unntatt uendret",
   visningsDiff(FRA_FOR, FRA_FOR).nye.length === 0 &&
   visningsDiff(FRA_FOR, FRA_FOR).fjern.length === 0 &&
   visningsDiff(FRA_FOR, FRA_FOR).uendret.length === 2);
ok("tomt fra for gjor alt nytt",
   visningsDiff([], ONSKET).nye.length === 2 && visningsDiff([], ONSKET).fjern.length === 0);
ok("tomt onske fjerner alt",
   visningsDiff(FRA_FOR, []).fjern.length === 2 && visningsDiff(FRA_FOR, []).nye.length === 0);
ok("tull inn kaster ikke", visningsDiff(null, null).nye.length === 0);

// Knappen sier hva trykket kommer til a GJORE. «Lagre 6 kamper» nar du la
// til én er sant om det som sendes og usant om det du gjor.
ok("en tilfoyelse sier at den legger til",
   lagreKnappTekst(1, 0, 6, "Carls") === "Legg til 1 kamp for Carls",
   lagreKnappTekst(1, 0, 6, "Carls"));
ok("flertall boyes",
   lagreKnappTekst(3, 0, 8, "Carls").indexOf("3 kamper") > -1,
   lagreKnappTekst(3, 0, 8, "Carls"));
ok("en fjerning sier at den fjerner",
   lagreKnappTekst(0, 2, 4, "Carls") === "Fjern 2 kamper for Carls",
   lagreKnappTekst(0, 2, 4, "Carls"));
// Fjerner du de siste, er det en annen handling enn a fjerne noen.
ok("de siste som fjernes far sine egne ord",
   lagreKnappTekst(0, 3, 0, "Carls") === "Fjern alle kamper for Carls",
   lagreKnappTekst(0, 3, 0, "Carls"));
ok("begge deler pa en gang sier begge deler",
   lagreKnappTekst(1, 2, 5, "Carls") === "Legg til 1 kamp og fjern 2 for Carls",
   lagreKnappTekst(1, 2, 5, "Carls"));
ok("ingen endring sier at det er lagret",
   lagreKnappTekst(0, 0, 5, "Carls") === "Lagret for Carls",
   lagreKnappTekst(0, 0, 5, "Carls"));
// Tomt og lagret er ikke det samme som lagret: uten kamper ville «Lagret
// for Carls» pastatt at noe ligger der.
ok("tomt og uendret sier at ingenting er satt",
   lagreKnappTekst(0, 0, 0, "Carls") === "Ingen kamper satt for Carls",
   lagreKnappTekst(0, 0, 0, "Carls"));
ok("uten pubnavn star teksten likevel",
   lagreKnappTekst(1, 0, 1, "") === "Legg til 1 kamp",
   lagreKnappTekst(1, 0, 1, ""));

/* ---------------- det Overpass faktisk sier nar den nekter ---------------- */

// Meldt 17. september 2026, fra portalen, med linjene under soket:
//
//   Overpass overpass-api.de · HTTP 406 · <!DOCTYPE HTML PUBLIC "-//W3C…
//   Overpass overpass.osm.ch  · HTTP 400 · <?xml version="1.0" encoding…
//
// Statuskoden kom fram. Grunnen gjorde det ikke: de forste 80 tegnene av
// en feilside er alltid doctypen, altsa det samme uansett hva som feilet.
const OSM_FEILSIDE = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"'
  + ' "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n<html><head>'
  + "<title>OSM3S Response</title></head><body>\n"
  + "<p>The data included in this document is from www.openstreetmap.org.</p>\n"
  + '<p><strong style="color:#FF0000">Error</strong>: line 1: parse error:'
  + ' Unknown type "(?=" </p>\n</body></html>';
ok("feilsiden gir grunnen, ikke doctypen",
   overpassFeiltekst(OSM_FEILSIDE).indexOf("parse error") > -1,
   overpassFeiltekst(OSM_FEILSIDE));
ok("og doctypen er ute av den",
   overpassFeiltekst(OSM_FEILSIDE).indexOf("DOCTYPE") === -1,
   overpassFeiltekst(OSM_FEILSIDE));
// Star det ingen «Error:», er hele teksten det beste vi har.
ok("en side uten feilord gir teksten som star der",
   overpassFeiltekst("<html><body>Not Acceptable</body></html>") === "Not Acceptable",
   overpassFeiltekst("<html><body>Not Acceptable</body></html>"));
ok("et tomt svar gir en tom melding, ikke «undefined»",
   overpassFeiltekst("") === "" && overpassFeiltekst(null) === "");
ok("og lengden har et tak",
   overpassFeiltekst("Error: " + "a".repeat(400)).length === 120,
   overpassFeiltekst("Error: " + "a".repeat(400)).length);

// Atte sekunder, ikke seks: to av fire speil ble avbrutt midt i arbeidet
// pa 6480 ms. Men fristen kan ikke ete opp Netlifys ti sekunder heller —
// da far admin Netlifys feilside framfor var, uten et ord om hvem som
// sviktet, som er nettopp det `forsok` finnes for.
ok("og den er lang nok til at et speil rekker a svare",
   SOK_SEKUNDER * 1000 > 6480, SOK_SEKUNDER * 1000);

/* ---------------- sok i den kuraterte lista ---------------- */

// Kortet rangerer etter hvor du staar NAA. Meldt 20. september 2026: «jeg
// er i dag i Trondheim men planlegger kamp om 3 dager. Da er jeg i Oslo.»
// Da er ingen av de geografiske kildene et svar, og stedet du leter etter
// finnes i lista uten a vaere naaabart.
const SOKBARE = [
  { navn: "Andy's Pub", bydel: "Sentrum", lat: 59.9135, lon: 10.7340,
    type: "sportsbar", kilde: "https://x.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Pokalen Vulkan", bydel: "Gr\u00fcnerl\u00f8kka", lat: 59.9230, lon: 10.7510,
    type: "pub", kilde: "https://x.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Lerkendal Pub", bydel: "Lerkendal", lat: 63.4126, lon: 10.4076,
    type: "pub", kilde: "https://x.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  // Heter «Sentrum» og ligger LENGER unna enn Andy's, som bare har det som
  // bydel. Uten navneregelen ville Andy's staatt forst.
  { navn: "Sentrum Sportsbar", bydel: "Frogner", lat: 59.9000, lon: 10.7000,
    type: "sportsbar", kilde: "https://x.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
];
const TRH = { lat: 63.430, lon: 10.395 };
const navnene = (t) => t.map((p) => p.navn).join(", ");

// Alle tre Oslo-stedene, naermest forst — Pokalen ligger lengst nord.
ok("sok paa bynavn gir stedene i den byen",
   navnene(sokKuraterte(SOKBARE, "oslo", TRH))
     === "Pokalen Vulkan, Andy's Pub, Sentrum Sportsbar",
   navnene(sokKuraterte(SOKBARE, "oslo", TRH)));
// Ingen rad baerer byen som et felt — byFor leser den ut av koordinatet.
ok("og byen staar ikke paa raden",
   SOKBARE.every((p) => p.by === undefined));
ok("sok paa navn treffer navnet",
   navnene(sokKuraterte(SOKBARE, "andy", TRH)) === "Andy's Pub",
   navnene(sokKuraterte(SOKBARE, "andy", TRH)));
ok("sok paa bydel treffer bydelen",
   navnene(sokKuraterte(SOKBARE, "lerkendal", TRH)) === "Lerkendal Pub",
   navnene(sokKuraterte(SOKBARE, "lerkendal", TRH)));

// normaliserLagnavn har en handskrevet bokstavliste, og u staar ikke i
// den: «Grunerlokka» ble «grnerlokka», og et sok paa bydelen ga null
// treff. Den kan ikke rettes der — den gaar inn i kampNokkel (ADR 0008) —
// sa soket har sin egen folding.
ok("bokstaver soket ikke kjenner folder likevel",
   navnene(sokKuraterte(SOKBARE, "grunerlokka", TRH)) === "Pokalen Vulkan",
   navnene(sokKuraterte(SOKBARE, "grunerlokka", TRH)));
ok("og skrevet med tegnene over gir det samme",
   navnene(sokKuraterte(SOKBARE, "gr\u00fcnerl\u00f8kka", TRH)) === "Pokalen Vulkan");
ok("normaliserLagnavn ville mistet u-en",
   normaliserLagnavn("Gr\u00fcnerl\u00f8kka") === "grnerlokka",
   normaliserLagnavn("Gr\u00fcnerl\u00f8kka"));

// Flere ord: alle maa finnes, i hvilken som helst rekkefolge.
ok("flere ord krever alle", 
   navnene(sokKuraterte(SOKBARE, "pub sentrum", TRH)) === "Andy's Pub",
   navnene(sokKuraterte(SOKBARE, "pub sentrum", TRH)));

// Treff paa NAVNET rangerer over treff paa by eller bydel: skriver du
// «sentrum», leter du etter et sted som heter det — ikke etter alt som
// ligger i den bydelen.
//
// Sentrum Sportsbar ligger LENGER unna enn Andy's, som bare har «Sentrum»
// som bydel. Uten navneregelen ville avstanden satt Andy's forst, og
// testen ville ikke kunne skille de to reglene fra hverandre.
const SOKRANG = sokKuraterte(SOKBARE, "sentrum", TRH);
ok("navnetreff staar over treff paa bydel",
   navnene(SOKRANG) === "Sentrum Sportsbar, Andy's Pub", navnene(SOKRANG));
ok("og avstanden sier at det ikke var den som avgjorde",
   SOKRANG[0].avstand > SOKRANG[1].avstand,
   Math.round(SOKRANG[0].avstand) + " mot " + Math.round(SOKRANG[1].avstand));
// Naermest forst BLANT navnetreffene: Lerkendal er i Trondheim.
ok("og naermest forst der navnet treffer begge",
   navnene(sokKuraterte(SOKBARE, "pub", TRH)) === "Lerkendal Pub, Andy's Pub",
   navnene(sokKuraterte(SOKBARE, "pub", TRH)));

// Et treff paastaar ingenting om avstand — den staar paa, sa den som
// leser kan forkaste den selv.
ok("treffene baerer avstand naar vi vet hvor leseren er",
   Number.isFinite(sokKuraterte(SOKBARE, "andy", TRH)[0].avstand));
ok("og ingen avstand naar vi ikke vet",
   sokKuraterte(SOKBARE, "andy", null)[0].avstand === undefined);
// Uten posisjon er rekkefolgen alfabetisk, ikke fila sin: lista skal se
// lik ut hver gang.
ok("uten posisjon er rekkefolgen alfabetisk",
   navnene(sokKuraterte(SOKBARE, "pub", null)) === "Andy's Pub, Lerkendal Pub",
   navnene(sokKuraterte(SOKBARE, "pub", null)));

ok("tomt sok gir ingenting a vise",
   sokKuraterte(SOKBARE, "", TRH).length === 0 &&
   sokKuraterte(SOKBARE, "   ", TRH).length === 0);
ok("og et sok uten treff gir tom liste, ikke en feil",
   sokKuraterte(SOKBARE, "finnesikke", TRH).length === 0);

/* ---------------- dokumentasjonen holder folge ---------------- */

// docs/modulene.md er kartet over reglene som gjelder INNE i en fil.
// Kartet er bare verdt noe sa lenge det dekker terrenget: en ny modul som
// ikke star der, er en modul ingen vet reglene for.
//
// Derfor leses filene fra disken, ikke fra en liste her. En liste ville
// matte vedlikeholdes ved siden av dokumentet, og da er det to steder som
// kan ligge etter i stedet for ett — samme feil som testtallene gjorde
// for de ble talt.
const dokument = readFileSync(new URL("../docs/modulene.md", import.meta.url), "utf8");

function filerI(mappe, ender) {
  return readdirSync(new URL("../" + mappe, import.meta.url))
    .filter((f) => ender.some((e) => f.endsWith(e)))
    .map((f) => (mappe === "." ? f : mappe + "/" + f));
}

const SKAL_DOKUMENTERES = filerI(".", [".js", ".css", ".html"])
  .concat(filerI("netlify/functions", [".mjs"]))
  .concat(filerI("verktoy", [".mjs"]))
  .filter((f) => f !== "sw-registrering.js");

const udokumentert = SKAL_DOKUMENTERES.filter((f) => {
  const navn = f.split("/").pop();
  return dokument.indexOf(navn) === -1;
});

ok("hver fil i appen er omtalt i docs/modulene.md",
   udokumentert.length === 0, "mangler: " + udokumentert.join(", "));
ok("testen fant faktisk filer a kreve dokumentasjon for",
   SKAL_DOKUMENTERES.length >= 25, SKAL_DOKUMENTERES.length);

/* ---- sonden spor fra to steder, men med ETT sett stier ---- */

// `verktoy/tsdbsjekk.mjs` spor fra en maskin, `/api/tsdb-sonde` fra
// portalen. Stiene ligger i fotball-data.js, og det er hele poenget:
// sto de hver for seg, ville de to svart ulikt pa det samme sporsmalet —
// og en sonde som er uenig med seg selv er verre enn ingen sonde.
//
// Dette sto som en paastand i en PR-tekst 21. september 2026, og var
// USANT da den ble skrevet: verktoyet hadde fortsatt sin egen liste, og
// to kopier la i main i en time. Vakta finnes fordi paastanden ikke holdt
// seg selv.
const SONDE_VERKTOY = readFileSync(new URL("../verktoy/tsdbsjekk.mjs", import.meta.url), "utf8");
const SONDE_FUNKSJON = readFileSync(new URL("../netlify/functions/tsdbsonde.mjs", import.meta.url), "utf8");
ok("verktoyet henter stiene fra fotball-data.js",
   SONDE_VERKTOY.indexOf("tsdbSondeStier") > -1);
ok("og funksjonen gjor det samme",
   SONDE_FUNKSJON.indexOf("tsdbSondeStier") > -1);
// Det er kopien som er faren, ikke importen. En adresse skrevet i en av
// dem er en adresse som kan gli fra den andre.
ok("og ingen av dem skriver en egen adresse",
   SONDE_VERKTOY.indexOf("thesportsdb.com/api") === -1 &&
   SONDE_VERKTOY.indexOf(".php?id=") === -1 &&
   SONDE_FUNKSJON.indexOf(".php?id=") === -1,
   "verktoy: " + (SONDE_VERKTOY.indexOf(".php?id=") > -1) +
   ", funksjon: " + (SONDE_FUNKSJON.indexOf(".php?id=") > -1));

// Den andre veien: dokumentet skal ikke vise til filer som er borte. En
// regel for en fil som ikke finnes lenger er verre enn ingen regel — den
// leses som om den fortsatt gjelder.
//
// Sjekken gar pa navn i baklenker, og det gir konvensjonen: et filnavn i
// `kode` er en peker og ma finnes; et gammelt navn i en setning om
// historien skrives uten dem. «Den het puber-oslo.js til 18. september»
// er prosa om noe som var, ikke en henvisning til noe som er.
const nevnte = new Set(Array.from(
  dokument.matchAll(/`([a-z0-9./-]+\.(?:js|mjs|css|html|sql|md|toml))`/g), (m) => m[1]));
// Dokumentet skriver filnavn slik en leser gjor: `run.mjs`, ikke
// `test/run.mjs`. Et bart navn slas derfor opp i mappene det kan ligge i.
const MAPPER = ["", "docs/", "netlify/functions/", "verktoy/", "test/"];
const finnes = (f) => MAPPER.some((m) => existsSync(new URL("../" + m + f, import.meta.url)));

// En GENERERT fil finnes ikke lokalt, og det er ikke det samme som at den
// er borte. `bygg.js` lages av byggekommandoen ved hver utrulling og har
// aldri ligget i repoet — en regel om den er like gyldig for det.
//
// Unntaket leses ut av `.gitignore`, ikke skrevet her: en liste ved siden
// av ville vaert enda et sted som kan ligge etter, og det er akkurat den
// feilen resten av denne seksjonen finnes for aa hindre. Bare bare navn,
// ikke monstre — en `*` er en regel om mange filer, og det er ikke en fil
// noen kan vise til.
const GITIGNORE = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const GENERERTE = new Set(GITIGNORE.split("\n")
  .map((l) => l.trim())
  .filter((l) => l && l.charAt(0) !== "#" && !/[*?\[\]/]/.test(l)));

const borte = [...nevnte].filter((f) => !finnes(f) && !GENERERTE.has(f));

ok("og dokumentet viser ikke til filer som er borte",
   borte.length === 0, "finnes ikke: " + borte.join(", "));
// Uten den sjekken ville unntaket over vaert en bakdor: en tom eller
// ulest .gitignore slipper alt gjennom, og da maaler ikke vakta noe.
ok("og unntaket for genererte filer fant faktisk .gitignore",
   GENERERTE.has("bygg.js"), [...GENERERTE].join(", "));

/* ---------------- veien dit ---------------- */

// #144 ba om «kart med pubene og vei til stadion». Det ble en LENKE inn i
// telefonens eget kart framfor et kart i appen: et innebygd kart ville
// vært første tredjepartsskript, og en fliseserver ville sett IP og
// utsnitt for hver leser som åpner et kampkort.

ok("et sted med punkt faar en vei dit",
   kartLenke(63.4305, 10.3951)
     .indexOf("destination=63.4305%2C10.3951") > -1, kartLenke(63.4305, 10.3951));

// **Bare destinasjonen, aldri leserens eget punkt.** Uten `origin` regner
// kartappen fra telefonens egen posisjon, som leseren alt har gitt
// kartleverandoren. Sto den i adressen, hadde vi sendt fra oss hvor
// leseren er — og det er hele forskjellen paa en lenke og et kart.
ok("og adressen baerer ikke hvor leseren staar",
   kartLenke(63.4305, 10.3951).indexOf("origin") === -1,
   kartLenke(63.4305, 10.3951));

// Uten punkt: ingen lenke. Samme regel som avstanden, som bare staar paa
// raden der vi kjenner den.
ok("uten koordinat blir det ingen lenke",
   kartLenke(undefined, undefined) === "" && kartLenke(null, null) === "");

// **Og et felt som mangler er ikke null grader.** `Number(null)` er 0, og
// 0 er et gyldig koordinat — saa en rad uten `lat` ville faatt en lenke til
// Guineabukta. Fanget da funksjonen ble proevd foerste gang, ikke av at
// noen tenkte paa det.
ok("en halv rad sender ingen til Guineabukta",
   kartLenke(null, 10.39) === "" && kartLenke("", 10.39) === "" &&
   kartLenke(false, 10.39) === "",
   [kartLenke(null, 10.39), kartLenke("", 10.39), kartLenke(false, 10.39)].join(" | "));

// Tall som streng er det basen og fila gir oss om hverandre.
ok("men et tall skrevet som streng er et tall",
   kartLenke("63.43", "10.39").indexOf("63.43%2C10.39") > -1,
   kartLenke("63.43", "10.39"));

// Lat og lon byttet om er den vanligste skrivefeilen — samme feil
// `rammeFor()` finnes for. Her ville den sendt leseren til havs.
ok("og et koordinat utenfor kloden er en skrivefeil, ikke et sted",
   kartLenke(91, 10) === "" && kartLenke(63, 181) === "");

// Stadionraden slaar opp punktet sitt i ARENAER. Vakta her er at de
// tretti arenaene FAKTISK baerer et punkt — uten det er «vei til stadion»
// en lenke som aldri kan lages, og det var halve bestillingen i #144.
const utenPunkt = ARENAER.filter((a) => !kartLenke(a.lat, a.lon));
ok("hver arena vi kjenner kan gi en vei dit",
   ARENAER.length >= 25 && utenPunkt.length === 0,
   "uten punkt: " + utenPunkt.map((a) => a.navn).join(", "));

/* ---------------- byggestempelet ---------------- */

// `verktoy/lag-bygg.mjs` kjøres **på ekte** her, med miljøet satt, og det
// som kom ut leses tilbake. Det er hele poenget: forrige utgave av dette
// stempelet hadde en grønn test som dekket begge utfall av at
// `COMMIT_REF` manglet — og aldri målte om variabelen fantes der koden
// kjørte. En stubb kan ikke stille det spørsmålet; den er enig med feilen.
//
// Skriptet trenger verken nett eller nøkler, så det hører hjemme i den
// raske suiten — som også er porten foran prod.
const BYGG_UT = tmpdir() + "/sb-bygg-" + process.pid + ".js";

function stempleMed(miljo) {
  execFileSync(process.execPath,
    [new URL("../verktoy/lag-bygg.mjs", import.meta.url).pathname, BYGG_UT],
    { env: Object.assign({}, process.env, miljo), stdio: "pipe" });
  return readFileSync(BYGG_UT, "utf8");
}

let stempel = stempleMed({
  COMMIT_REF: "a36dea534225cd7801df92dc570dd017080ce7ed",
  BRANCH: "main",
  CONTEXT: "production",
  DEPLOY_ID: "6ab1d31b",
});

ok("stempelet baerer commit-en byggemiljoet oppgir",
   stempel.indexOf("a36dea534225cd7801df92dc570dd017080ce7ed") > -1, stempel);
ok("og konteksten, sa en forhandsvisning kan skilles fra prod",
   stempel.indexOf('"kontekst": "production"') > -1, stempel);
// Netlifys navn er `COMMIT_REF` og `BRANCH`; appens er `commit` og
// `gren`. Oversettelsen skjer HER, ett sted, framfor at portalen maa
// kjenne Netlifys ord.
ok("og navnene er vare egne, ikke Netlifys",
   stempel.indexOf('"commit"') > -1 && stempel.indexOf('"gren"') > -1 &&
   stempel.indexOf("COMMIT_REF") === -1, stempel);
// Fila serveres til nettleseren. Ingen nokler, ingen adresser — bare de
// fem feltene som svarer paa «ser jeg paa det nyeste?».
ok("og ingenting annet fra miljoet blir med",
   stempel.indexOf("PIN_PEPPER") === -1 &&
   stempel.indexOf("riktig-passord") === -1, stempel);

// Uten miljoet: `null`, ikke en tom streng som ser ut som en verdi. Og
// `tid` staar likevel — vi vet alltid naar vi stemplet.
stempel = stempleMed({ COMMIT_REF: "", BRANCH: "", CONTEXT: "", DEPLOY_ID: "" });
ok("uten byggemiljo blir commit null, ikke en tom streng",
   stempel.indexOf('"commit": null') > -1, stempel);
ok("men tidspunktet staar likevel",
   /"tid": "\d{4}-\d{2}-\d{2}T/.test(stempel), stempel);

// **Og feltene maa vaere de portalen leser.** Dette er vakta mot at de to
// glir fra hverandre: skrev skriptet `sha` mens `admin.js` leste `commit`,
// ville hver eneste test vaert gronn og linja staatt tom i prod — samme
// klasse feil som den som ble meldt 22. september 2026.
const ADMIN_KILDE = readFileSync(new URL("../admin.js", import.meta.url), "utf8");
// Variabelen heter `stempel` og ikke `b` nettopp for denne vaktas skyld:
// en enkeltbokstav ville truffet hver annen `b.noe` i fila, og en vakt som
// maaler feil ting er verre enn ingen.
const LEST = new Set(Array.from(
  ADMIN_KILDE.matchAll(/\bstempel\.([a-z]+)\b/g), (m) => m[1]));
const uskrevne = [...LEST].filter((f) => stempel.indexOf('"' + f + '"') === -1);
ok("portalen leser bare felt stempelet faktisk skriver",
   LEST.size > 0 && uskrevne.length === 0,
   "leser: " + [...LEST].join(", ") + " | mangler: " + uskrevne.join(", "));

rmSync(BYGG_UT, { force: true });

/* ---------------- rapport ---------------- */

// Tallet telles, ikke skrives: en hardkodet sum sa 271 mens 279 testet
// kjorte, og da sier tallet ingenting om at en test er lagt til.
console.log("\n" + (kjort - feilet) + " av " + kjort + " enhetstester passerte");
process.exit(feilet ? 1 : 0);
