#!/usr/bin/env node
// Enhetstester for de rene funksjonene i lib.js.
//
//   node test/unit.mjs
//
// Ingen nettleser. Disse dekker logikk som ikke rorer DOM, og kjorer pa
// millisekunder framfor de titalls sekundene nettlesertestene bruker.
// Alt som trenger DOM ligger i test/run.mjs.

import { safeUrl, videoUrl, postDate, timeAgo, feedSignature } from "../lib.js";

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

/* ---------------- rapport ---------------- */

const antall = 31;
console.log("\n" + (antall - feilet) + " av " + antall + " enhetstester passerte");
process.exit(feilet ? 1 : 0);
