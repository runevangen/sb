#!/usr/bin/env node
// Regresjonstester for Sportsbibelen-appen.
//
//   node test/run.mjs
//
// Ingen avhengigheter. Testene lastes inn i en kopi av index.html med et
// mocket window.fetch, kjores i headless Chromium og rapporterer via
// exit-kode. Sett CHROME hvis nettleseren ligger et annet sted.

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "index.html"), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "sb-test-"));

const KANDIDATER = [
  process.env.CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const CHROME = KANDIDATER.find((p) => existsSync(p));
if (!CHROME) {
  console.error("Fant ingen Chromium. Sett CHROME til en kjorbar nettleser.");
  process.exit(2);
}

// Felles hjelpere som injiseres i hver testside.
const HARNESS = `
  var T = [];
  function ok(navn, betingelse, detalj) {
    T.push({ navn: navn, ok: !!betingelse, detalj: String(detalj === undefined ? "" : detalj) });
  }
  function ferdig() {
    document.documentElement.setAttribute("data-result", JSON.stringify(T));
  }
  function sekvens() {
    return Array.prototype.map.call(document.getElementById("feed").children, function (n) {
      if (n.classList.contains("hero")) return "topp";
      if (n.classList.contains("row")) return "sak";
      if (n.classList.contains("ad-banner")) return "banner";
      if (n.classList.contains("ad-stripe")) return "stripe";
      return "?";
    }).join(" ");
  }
  window.plausible = function () {};
`;

function avkod(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// storrelse settes der vindushoyden er en del av det som testes. Standard
// er nettleserens eget vindu; hoydetesten trenger et telefonformat for at
// taket pa kortet i det hele tatt skal binde.
function kjor(navn, skript, storrelse) {
  const fil = join(tmp, navn + ".html");
  writeFileSync(fil, app.replace("<head>", "<head>\n<script>" + HARNESS + skript + "<\/script>"));
  const argv = [
    "--no-sandbox", "--disable-gpu", "--force-prefers-reduced-motion",
    "--virtual-time-budget=12000", "--dump-dom",
  ];
  if (storrelse) argv.push("--window-size=" + storrelse);
  argv.push("file://" + fil);
  const dom = execFileSync(CHROME, argv,
    { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "ignore"] });

  const treff = dom.match(/data-result="([^"]*)"/);
  if (!treff) throw new Error(navn + ": testsiden rapporterte ingenting");
  return JSON.parse(avkod(treff[1]));
}

/* ---------------- felles testdata ---------------- */

const FELLES = `
  function wpTid(msSiden) {
    // WordPress leverer date_gmt uten tidssone.
    return new Date(Date.now() - msSiden).toISOString().replace(/\\.\\d+Z$/, "");
  }
  function lagSaker(n) {
    return Array.from({ length: n }, function (_, i) {
      return {
        id: i, slug: "sak-" + i,
        // date er sidens lokale tid, med vilje satt fem timer feil. Brukes
        // den i stedet for date_gmt, slar tidsstempeltesten ut.
        date: new Date(Date.now() - 2 * 3600000 + 5 * 3600000).toISOString().replace(/\\.\\d+Z$/, ""),
        date_gmt: wpTid(2 * 3600000),
        modified_gmt: "2026-01-01T00:00:00",
        link: "https://sportsbibelen.no/" + i,
        title: { rendered: "Sak " + (i + 1) },
        excerpt: { rendered: "Utdrag" },
        content: { rendered: "<p>Tekst</p>" },
        _embedded: { "wp:term": [[{ name: "Fotball" }]] }
      };
    });
  }
  var KATEGORIER = [{ id: 7, name: "Fotball", count: 412 }];
`;

function mockFetch(saker) {
  return `
  window.__kall = [];
  window.fetch = function (u) {
    u = String(u);
    window.__kall.push(u.indexOf("_fields=") > -1 ? "sjekk" : "full");
    var svar;
    if (u.indexOf("/wp-api/categories") === 0) svar = KATEGORIER;
    else if (u.indexOf("_fields=") > -1) svar = ${saker}.map(function (p) { return { id: p.id, modified_gmt: p.modified_gmt }; });
    else svar = ${saker};
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };`;
}

/* ---------------- 1. feed, tidsstempler, annonser, XSS i tittel ---------------- */

const SAK_1 = kjor("feed", FELLES + `
  var saker = lagSaker(12);
  // Slik WordPress returnerer en tittel som bokstavelig inneholder en img-tag.
  saker[0].title.rendered = "&lt;img src=x onerror=&quot;document.body.setAttribute('pwned','ja')&quot;&gt; Toppsak";
  ` + mockFetch("saker") + `
  window.addEventListener("load", function () { setTimeout(function () {
    var topp = document.querySelector(".hero-title");
    ok("tittel-XSS kjorer ikke kode", !document.body.hasAttribute("pwned"));
    ok("tittel-XSS vises som tekst", topp.textContent.indexOf("<img") === 0, topp.textContent.slice(0, 24));

    var tid = document.querySelector(".hero-overlay time");
    ok("tidsstempel bruker date_gmt", tid.textContent === "2t siden", tid.textContent);

    ok("annonse etter hver fjerde sak",
       sekvens() === "topp sak sak sak banner sak sak sak sak stripe sak sak sak sak", sekvens());
    ok("ingen annonse nederst",
       document.getElementById("feed").lastElementChild.classList.contains("row"));
    ferdig();
  }, 900); });
`);

/* ---------------- 2. rensing av artikkel-HTML ---------------- */

const SAK_2 = kjor("artikkel", FELLES + `
  var saker = lagSaker(3);
  saker[0].content.rendered =
    "<h2>Mellomtittel</h2><p>Brann <strong>2-0</strong>.</p>" +
    new Array(40).join("<p>Et avsnitt som gjor artikkelen lang nok til a kunne rulles.</p>") +
    "<script>document.body.setAttribute('pwned','ja')<\\/script>" +
    "<img src=x onerror=\\"document.body.setAttribute('pwned2','ja')\\">" +
    "<a href=\\"javascript:document.body.setAttribute('pwned3','ja')\\">Klikk</a>" +
    "<iframe src=\\"https://www.youtube.com/embed/abc\\"><\\/iframe>" +
    "<iframe src=\\"https://youtube.com.angriper.no/x\\"><\\/iframe>" +
    "<iframe src=\\"https://evil.example/x\\"><\\/iframe>";
  ` + mockFetch("saker") + `
  window.addEventListener("load", function () { setTimeout(function () {
    document.querySelector(".hero").click();
    setTimeout(function () {
      var kort = document.getElementById("detailCard");
      var rullbart = Math.round(kort.scrollHeight - kort.clientHeight);
      // Uten rulling er scrollTop null uansett, og testen beviser ingenting.
      ok("artikkelen er lang nok til a kunne rulles", rullbart > 200, rullbart);
      ok("artikkelen starter pa toppen", kort.scrollTop === 0,
         "scrollTop=" + Math.round(kort.scrollTop) + " av " + rullbart);
      ok("lukkeknapp i hjornet finnes", !!document.querySelector(".corner-close"));

      var art = document.querySelector(".detail-content");
      var rammer = Array.prototype.map.call(art.querySelectorAll("iframe"), function (f) { return f.getAttribute("src"); });
      ok("artikkel-HTML kjorer ingen kode",
         !document.body.hasAttribute("pwned") && !document.body.hasAttribute("pwned2") && !document.body.hasAttribute("pwned3"));
      ok("redaksjonelt innhold beholdes", !!art.querySelector("h2") && !!art.querySelector("strong"));
      ok("javascript-lenke mister href", !art.querySelector("a[href]"));
      // Fokusfella: handteren kaller preventDefault og flytter fokus selv,
      // sa en utsendt Tab-hendelse tester den fullt ut.
      var felt = document.querySelectorAll(".detail-shell a[href], .detail-shell button");
      felt[felt.length - 1].focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      ok("fokus vandrer ikke ut av artikkelen",
         document.activeElement === felt[0],
         document.activeElement.className || document.activeElement.tagName);

      ok("YouTube slipper gjennom", rammer.length === 1 && rammer[0].indexOf("https://www.youtube.com/embed/") === 0, rammer.join(","));
      ok("forfalsket videovert blokkeres", rammer.join(",").indexOf("angriper") === -1, rammer.join(","));
      ferdig();
    }, 500);
  }, 900); });
`);

/* ---------------- 3. rulling og endringssjekk ---------------- */

const SAK_3 = kjor("oppdatering", FELLES + `
  var saker = lagSaker(12);
  ` + mockFetch("saker") + `
  window.addEventListener("load", function () { setTimeout(function () {
    var f = document.getElementById("feed");
    var telefon = document.querySelector(".phone");
    var topp = document.querySelector(".header");

    var kortH = Math.round(telefon.getBoundingClientRect().height);
    ok("kortet fyller hoyden", Math.abs(kortH - (window.innerHeight - 20)) <= 2,
       kortH + " av " + (window.innerHeight - 20));

    var toppFor = Math.round(topp.getBoundingClientRect().height);
    f.scrollTop = 200;
    f.dispatchEvent(new Event("scroll"));
    var toppEtter = Math.round(topp.getBoundingClientRect().height);
    ok("toppfeltet krymper ved rulling", toppEtter < toppFor,
       toppFor + " -> " + toppEtter);

    f.scrollTop = 0;
    f.dispatchEvent(new Event("scroll"));
    ok("toppfeltet kommer tilbake pa toppen",
       Math.round(topp.getBoundingClientRect().height) === toppFor);

    // Rull ned og hent en ny liste. Uten nullstillingen arver den nye
    // listen posisjonen fra den forrige. A sjekke scrollTop rett etter
    // forste lasting beviser ingenting: der er den null uansett.
    f.scrollTop = f.scrollHeight;
    var forSpranget = f.scrollTop;
    loadFeed();

    setTimeout(function () {
      ok("rullet ned for ny lasting", forSpranget > 100, forSpranget);
      ok("ny liste starter pa toppen", f.scrollTop === 0, f.scrollTop);
      steg2();
    }, 600);
  }, 900); });

  function steg2() {
    var f = document.getElementById("feed");
    f.firstElementChild.__merke = "original";
    f.scrollTop = f.scrollHeight;
    window.__kall = [];
    loadFeed({ silent: true });

    setTimeout(function () {
      ok("oppdatering rorer ikke feeden mens leseren star nede",
         f.firstElementChild.__merke === "original");
      ok("ingen forespørsel i det hele tatt nar leseren star nede",
         window.__kall.length === 0, window.__kall.join(","));

      f.scrollTop = 0;
      window.__kall = [];
      loadFeed({ silent: true });

      setTimeout(function () {
        ok("uendret feed hentes ikke pa nytt",
           window.__kall.join(",") === "sjekk", window.__kall.join(","));

        saker[0].modified_gmt = "2026-02-02T00:00:00";
        window.__kall = [];
        loadFeed({ silent: true });

        setTimeout(function () {
          ok("endret feed hentes pa nytt",
             window.__kall.join(",") === "sjekk,full", window.__kall.join(","));
          ferdig();
        }, 600);
      }, 600);
    }, 600);
  }
`, "390,844");

/* ---------------- rapport ---------------- */

const alle = [...SAK_1, ...SAK_2, ...SAK_3];
let feilet = 0;

for (const t of alle) {
  if (t.ok) {
    console.log("  ok   " + t.navn);
  } else {
    feilet++;
    console.log("  FEIL " + t.navn + (t.detalj ? "  (fikk: " + t.detalj + ")" : ""));
  }
}

console.log("\n" + (alle.length - feilet) + " av " + alle.length + " tester passerte");
process.exit(feilet ? 1 : 0);
