#!/usr/bin/env node
// Regresjonstester for Sportsbibelen-appen.
//
//   node test/run.mjs
//
// Ingen avhengigheter. Testene lastes inn i en kopi av index.html med et
// mocket window.fetch, kjores i headless Chromium og rapporterer via
// exit-kode. Sett CHROME hvis nettleseren ligger et annet sted.

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

const kjorProsess = promisify(execFile);
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "index.html"), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "sb-test-"));

// Testsidene serveres over HTTP, ikke fra file://. Modul-script blokkeres
// av CORS pa file://-opphav, sa appen ville aldri lastet. HTTP gjor i
// tillegg testmiljoet likere produksjon: absolutte stier som /app.css
// loser seg som de skal.
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json",
};

function startTjener() {
  const tjener = createServer((req, res) => {
    const sti = decodeURIComponent(req.url.split("?")[0]);
    // Testsidene ligger i temp; alt annet hentes fra repoet.
    const rot = sti.endsWith(".html") ? tmp : root;
    const fil = join(rot, sti.replace(/^\/+/, ""));
    try {
      const innhold = readFileSync(fil);
      const type = MIME[fil.slice(fil.lastIndexOf("."))] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(innhold);
    } catch (err) {
      res.writeHead(404).end("ikke funnet");
    }
  });
  return new Promise((ok) => tjener.listen(0, "127.0.0.1", () => ok(tjener)));
}

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
      if (n.classList.contains("vis-flere")) return "mer";
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
async function kjor(navn, skript, storrelse) {
  const fil = join(tmp, navn + ".html");
  writeFileSync(fil, app.replace("<head>", "<head>\n<script>" + HARNESS + skript + "<\/script>"));

  const argv = [
    // --dump-dom virker bare i hodelos modus. Lokalt er binaerfila ofte
    // headless_shell, som alltid er hodelos, men pa en CI-runner er det en
    // full nettleser som uten dette prover a apne et vindu og feiler.
    "--headless=new",
    "--no-sandbox", "--disable-gpu", "--force-prefers-reduced-motion",
    "--virtual-time-budget=12000", "--dump-dom",
  ];
  if (storrelse) argv.push("--window-size=" + storrelse);
  argv.push("http://127.0.0.1:" + PORT + "/" + navn + ".html");

  let dom;
  try {
    dom = (await kjorProsess(CHROME, argv, { maxBuffer: 64e6 })).stdout;
  } catch (err) {
    const detalj = (err.stderr || "").toString().trim().split("\n").slice(-6).join("\n");
    throw new Error(navn + ": nettleseren feilet (" + CHROME + ")\n" + detalj);
  }

  const treff = dom.match(/data-result="([^"]*)"/);
  if (!treff) throw new Error(navn + ": testsiden rapporterte ingenting");
  return JSON.parse(avkod(treff[1]));
}

const tjener = await startTjener();
const PORT = tjener.address().port;

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

const SAK_1 = await kjor("feed", FELLES + `
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
       sekvens() === "topp sak sak sak banner sak sak sak sak stripe sak sak sak sak mer", sekvens());

    // Intensjonen er at feeden ikke skal avsluttes med reklame. "Vis flere"
    // er en knapp, ikke innhold, sa den ser vi bort fra her.
    var innhold = sekvens().split(" ").filter(function (n) { return n !== "mer"; });
    ok("ingen annonse nederst",
       innhold[innhold.length - 1] === "sak", innhold[innhold.length - 1]);
    ferdig();
  }, 900); });
`);

/* ---------------- 2. rensing av artikkel-HTML ---------------- */

const SAK_2 = await kjor("artikkel", FELLES + `
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

const SAK_3 = await kjor("oppdatering", FELLES + `
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
    app.loadFeed();

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
    app.loadFeed({ silent: true });

    setTimeout(function () {
      ok("oppdatering rorer ikke feeden mens leseren star nede",
         f.firstElementChild.__merke === "original");
      ok("ingen forespørsel i det hele tatt nar leseren star nede",
         window.__kall.length === 0, window.__kall.join(","));

      f.scrollTop = 0;
      window.__kall = [];
      app.loadFeed({ silent: true });

      setTimeout(function () {
        ok("uendret feed hentes ikke pa nytt",
           window.__kall.join(",") === "sjekk", window.__kall.join(","));

        saker[0].modified_gmt = "2026-02-02T00:00:00";
        window.__kall = [];
        app.loadFeed({ silent: true });

        setTimeout(function () {
          ok("endret feed hentes pa nytt",
             window.__kall.join(",") === "sjekk,full", window.__kall.join(","));
          ferdig();
        }, 600);
      }, 600);
    }, 600);
  }
`, "390,844");

/* ---------------- 4. ruting, paginering og interne lenker ---------------- */

const SAK_4 = await kjor("ruting", FELLES + `
  var saker = lagSaker(12);
  saker[0].content.rendered =
    "<p>Se ogsa <a href=\\"https://sportsbibelen.no/annen-sak/\\">denne saken</a> " +
    "og <a href=\\"https://vg.no/noe/\\">en ekstern</a>.</p>";
  var side2 = lagSaker(12).map(function (p, i) { p.id = 100 + i; p.slug = "side2-" + i; return p; });

  window.__kall = [];
  window.fetch = function (u) {
    u = String(u);
    window.__kall.push(u);
    var svar;
    if (u.indexOf("/wp-api/categories") === 0) svar = KATEGORIER;
    else if (u.indexOf("slug=annen-sak") > -1) {
      var s = lagSaker(1)[0]; s.slug = "annen-sak"; s.id = 999;
      s.title = { rendered: "Den andre saken" };
      svar = [s];
    }
    else if (u.indexOf("page=2") > -1) svar = side2;
    else if (u.indexOf("_fields=") > -1) svar = saker.map(function (p) { return { id: p.id, modified_gmt: p.modified_gmt }; });
    else svar = saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };

  window.addEventListener("load", function () { setTimeout(function () {
    var feed = document.getElementById("feed");

    // --- paginering ---
    var forSider = feed.querySelectorAll(".row").length;
    feed.scrollTop = 300;
    document.querySelector(".vis-flere").click();

    setTimeout(function () {
      var etterSider = feed.querySelectorAll(".row").length;
      ok("Vis flere legger til flere saker", etterSider > forSider,
         forSider + " -> " + etterSider);
      ok("henter side 2, ikke side 1 pa nytt",
         window.__kall.filter(function (u) { return u.indexOf("page=2") > -1; }).length === 1);
      ok("paginering beholder rulleposisjonen", feed.scrollTop > 100, feed.scrollTop);

      // --- ruting: apne en sak ---
      document.querySelector(".hero").click();
      setTimeout(function () {
        ok("artikkel gir egen adresse", location.hash.indexOf("#/sak/") === 0, location.hash);

        // --- interne lenker markeres, eksterne ikke ---
        var intern = document.querySelector(".detail-content a[data-slug]");
        var ekstern = document.querySelector('.detail-content a[target="_blank"]');
        ok("intern lenke merkes for apning i appen",
           !!intern && intern.dataset.slug === "annen-sak",
           intern ? intern.dataset.slug : "mangler");
        ok("ekstern lenke apnes fortsatt utenfor",
           !!ekstern && ekstern.href.indexOf("vg.no") > -1);

        // --- tilbakeknappen ---
        // Uten vakten navigerer history.back() bort fra testsiden hvis
        // ruteren er odelagt, og da gar alle resultatene tapt. Da feiler
        // suiten med en krasj i stedet for en navngitt pastand.
        if (location.hash.indexOf("#/sak/") !== 0) { ferdig(); return; }
        history.back();
        setTimeout(function () {
          ok("tilbakeknappen lukker artikkelen",
             !document.getElementById("detailWrap").classList.contains("open"));
          ok("tilbakeknappen forlater ikke artikkeladressen bak seg",
             location.hash.indexOf("#/sak/") !== 0, location.hash);
          ferdig();
        }, 400);
      }, 500);
    }, 600);
  }, 900); });
`);

/* ---------------- 5. visningsvalg ---------------- */

const SAK_5 = await kjor("visning", FELLES + `
  var saker = lagSaker(12);
  ` + mockFetch("saker") + `
  function aktiv(id) { return document.getElementById(id).getAttribute("aria-current") === "true"; }
  // Statistikkroket star her fordi denne bolken kjorer for app.js lastes.
  var sporet = [];
  window.plausible = function (navn) { sporet.push(navn); };

  window.addEventListener("load", function () { setTimeout(function () {
    document.getElementById("menuBtn").click();
    setTimeout(function () {
      ok("lyst er markert som aktivt fra start", aktiv("temaLys") && !aktiv("temaSvart"));
      ok("normal skrift er markert fra start", aktiv("skriftNormal") && !aktiv("skriftStor"));

      var tittelFor = getComputedStyle(document.querySelector(".row-title")).fontSize;

      document.getElementById("temaSvart").click();
      ok("valg av morkt bytter tema",
         document.documentElement.getAttribute("data-theme") === "svart");
      ok("markeringen folger valget", aktiv("temaSvart") && !aktiv("temaLys"));

      document.getElementById("skriftStor").click();
      var tittelEtter = getComputedStyle(document.querySelector(".row-title")).fontSize;
      ok("valg av stor skrift forstorrer teksten",
         parseFloat(tittelEtter) > parseFloat(tittelFor), tittelFor + " -> " + tittelEtter);
      ok("skriftmarkeringen folger valget", aktiv("skriftStor") && !aktiv("skriftNormal"));

      // A velge det man allerede har skal ikke endre noe, og heller ikke
      // sende en hendelse: tilstanden alene kan ikke skille de to, siden
      // et nytt valg av samme verdi gir samme resultat uansett.
      var antallFor = sporet.filter(function (n) { return n === "Tema byttet"; }).length;
      document.getElementById("temaSvart").click();
      var antallEtter = sporet.filter(function (n) { return n === "Tema byttet"; }).length;
      ok("a velge samme igjen er en ikke-handling",
         document.documentElement.getAttribute("data-theme") === "svart" &&
         aktiv("temaSvart") && antallEtter === antallFor,
         antallFor + " -> " + antallEtter);

      document.getElementById("temaLys").click();
      ok("valg av lyst gar tilbake",
         !document.documentElement.getAttribute("data-theme") && aktiv("temaLys"));
      ok("skriftvalget star igjen nar temaet byttes", aktiv("skriftStor"));

      ferdig();
    }, 500);
  }, 900); });
`);

/* ---------------- 6. fotball (beta) ---------------- */

// Fotballdata, i den formen Netlify-funksjonen leverer dem.
const FOTBALL = `
  var TABELL = [
    { plass: 1, lag: "Bodo/Glimt", kamper: 30, seier: 21, uavgjort: 5, tap: 4,
      scoret: 74, sluppet: 33, differanse: 41, poeng: 68 },
    { plass: 2, lag: "Brann", kamper: 30, seier: 18, uavgjort: 6, tap: 6,
      scoret: 55, sluppet: 33, differanse: 22, poeng: 60 },
    { plass: 3, lag: "Kristiansund Ballklubb Elite", kamper: 30, seier: 9, uavgjort: 8, tap: 13,
      scoret: 40, sluppet: 48, differanse: -8, poeng: 35 }
  ];
  var RESULTATER = [
    { id: 1, dato: "2026-09-08T17:00:00+00:00", runde: "Runde 20", hjemme: "Molde",
      borte: "Rosenborg", malHjemme: 2, malBorte: 2, spilt: true },
    { id: 2, dato: "2026-09-06T15:00:00+00:00", runde: "Runde 19", hjemme: "Brann",
      borte: "Viking", malHjemme: 1, malBorte: 0, spilt: true }
  ];
  var KOMMENDE = [
    { id: 3, dato: "2026-09-20T17:00:00+00:00", runde: "Runde 21", hjemme: "Brann",
      borte: "Bodo/Glimt", malHjemme: null, malBorte: null, spilt: false },
    { id: 4, dato: "2026-09-21T17:00:00+00:00", runde: "Runde 21", hjemme: "Molde",
      borte: "Rosenborg", malHjemme: null, malBorte: null, spilt: false }
  ];
`;

function mockAlt(saker, fotballFeil) {
  return `
  window.__kall = [];
  window.__fotball = [];
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/fotball/") === 0) {
      window.__fotball.push(u);
      var del = u.split("?")[0].split("/").pop();
      ${fotballFeil ? `
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve(JSON.stringify({ feil: "Fikk ikke svar fra API-Football" })); } });
      ` : `
      var kropp = { liga: "Eliteserien", sesong: 2024, sisteSesong: false, del: del,
                    oppdatert: new Date(Date.now() - 3600000).toISOString() };
      if (del === "tabell") kropp.tabell = TABELL;
      else if (del === "resultater") kropp.kamper = RESULTATER;
      else { kropp.kamper = KOMMENDE; kropp.runde = "Runde 21"; }
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
      `}
    }
    window.__kall.push(u.indexOf("_fields=") > -1 ? "sjekk" : "full");
    window.__sokUrl = u;
    var svar;
    if (u.indexOf("/wp-api/categories") === 0) svar = KATEGORIER;
    else if (u.indexOf("_fields=") > -1) svar = ${saker}.map(function (p) { return { id: p.id, modified_gmt: p.modified_gmt }; });
    else svar = ${saker};
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };`;
}

const SAK_6 = await kjor("fotball", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `

  function synlig(id) { return !document.getElementById(id).hidden; }
  function fane(id) { return document.getElementById(id).getAttribute("aria-current") === "true"; }
  function valgt(rot) {
    var n = document.querySelector("#" + rot + " .segment-del[aria-current='true']");
    return n ? n.dataset.verdi : null;
  }

  window.addEventListener("load", function () { setTimeout(function () {
    ok("appen starter i nyheter", synlig("feed") && !synlig("fotball") && fane("fanenNyheter"));

    document.getElementById("fanenFotball").click();
    setTimeout(function () {
      ok("fotballfanen bytter visning",
         !synlig("feed") && synlig("fotball") && fane("fanenFotball"));
      ok("adressen folger fanen", location.hash.indexOf("#/fotball/") === 0, location.hash);
      ok("tabellen er forstevalget", valgt("fotballFaner") === "tabell", valgt("fotballFaner"));

      var rader = document.querySelectorAll(".tabell tbody tr");
      ok("tabellen har en rad per lag", rader.length === 3, rader.length);
      ok("lagnavnet star i raden",
         rader[0].querySelector(".kol-lag").textContent === "Bodo/Glimt",
         rader[0].querySelector(".kol-lag").textContent);
      ok("poengsummen star sist",
         rader[0].querySelector(".kol-poeng").textContent === "68",
         rader[0].querySelector(".kol-poeng").textContent);
      // Uten fortegnet leses +41 og -8 likt pa et blikk.
      var celler = Array.prototype.map.call(rader[0].querySelectorAll("td"), function (c) { return c.textContent; });
      ok("positiv malforskjell far pluss", celler.indexOf("+41") > -1, celler.join(" "));
      var siste = Array.prototype.map.call(rader[2].querySelectorAll("td"), function (c) { return c.textContent; });
      ok("negativ malforskjell beholder minus", siste.indexOf("-8") > -1, siste.join(" "));

      // Tabellen skal rulle i sitt eget felt. .phone klipper alt som stikker
      // utenfor, sa uten et rullbart felt ville de siste kolonnene bare vaert
      // borte — og det ser likt ut i DOM-en. Derfor rulles det faktisk her.
      var skall = document.querySelector(".tabell-skall");
      // Med normal skrift skal alle atte kolonnene fa plass: poeng er det
      // forste man ser etter, og en tabell man ma dra i for a se det er en
      // darligere tabell.
      ok("alle kolonnene far plass med normal skrift",
         skall.scrollWidth <= skall.clientWidth, skall.scrollWidth + " av " + skall.clientWidth);

      // Med storre skrift gjor de ikke det. Da ma feltet rulle: .phone
      // klipper alt som stikker utenfor, sa uten rulling ville de siste
      // kolonnene bare vaert borte, og det ser likt ut i DOM-en.
      document.documentElement.setAttribute("data-font", "stor");
      ok("storre skrift gjor tabellen bredere enn feltet",
         skall.scrollWidth > skall.clientWidth, skall.scrollWidth + " av " + skall.clientWidth);
      skall.scrollLeft = 999;
      ok("feltet lar seg rulle sidelengs", skall.scrollLeft > 0, skall.scrollLeft);
      var sisteKol = document.querySelector(".tabell tbody tr .kol-poeng").getBoundingClientRect();
      var feltet = skall.getBoundingClientRect();
      ok("poengkolonnen er innenfor skjermen etter rulling",
         sisteKol.right <= feltet.right + 1, Math.round(sisteKol.right) + " av " + Math.round(feltet.right));
      skall.scrollLeft = 0;
      document.documentElement.removeAttribute("data-font");
      ok("siden ruller ikke sidelengs",
         document.documentElement.scrollWidth <= window.innerWidth,
         document.documentElement.scrollWidth + " av " + window.innerWidth);
      // Abonnementet gir ikke inneværende sesong. En tabell fra i fjor som
      // ser ut som arets er verre enn ingen tabell, sa sesongen ma sta over
      // tallene — ikke under dem.
      var merke = document.querySelector(".fotball-sesong");
      ok("sesongen star over tabellen",
         merke.textContent.indexOf("Sesong 2024") === 0, merke.textContent);
      ok("det star at sesongen ikke er inneværende",
         merke.textContent.indexOf("ikke inneværende") > -1, merke.textContent);
      ok("sesongmerket star for tabellen",
         merke.compareDocumentPosition(document.querySelector(".tabell")) &
         Node.DOCUMENT_POSITION_FOLLOWING, "tabellen kom forst");

      ok("sist oppdatert vises",
         document.querySelector(".fotball-stempel").textContent.indexOf("Oppdatert") === 0,
         document.querySelector(".fotball-stempel").textContent);

      // Et lag i tabellen er en inngang til nyhetene om det laget.
      var lagKnapp = document.querySelector(".tabell .lag-knapp");
      ok("lagnavnet er en knapp, ikke bare tekst",
         lagKnapp && lagKnapp.tagName === "BUTTON", lagKnapp && lagKnapp.tagName);

      // Menyen skal beskrive visningen du star i.
      document.getElementById("menuBtn").click();
      setTimeout(function () {
        var punkter = document.querySelectorAll(".menu-item");
        var navn = Array.prototype.map.call(punkter, function (b) { return b.dataset.liga; });
        ok("menyen viser ligaer i fotball", navn.indexOf("premier") > -1, navn.join(","));
        ok("nyhetskategoriene er ute av veien",
           !document.querySelector(".menu-item[data-cat-id]"));
        document.getElementById("menuClose").click();

        document.querySelector("#fotballFaner .segment-del[data-verdi='resultater']").click();
        setTimeout(function () {
          ok("resultatfanen er valgt", valgt("fotballFaner") === "resultater", valgt("fotballFaner"));
          var kamper = document.querySelectorAll(".kamp");
          ok("resultatene listes", kamper.length === 2, kamper.length);
          ok("stillingen star mellom lagene",
             kamper[0].querySelector(".kamp-tall").textContent === "2 – 2",
             kamper[0].querySelector(".kamp-tall").textContent);
          ok("kampene grupperes pa dag",
             document.querySelectorAll(".kamp-dag").length === 2,
             document.querySelectorAll(".kamp-dag").length);

          document.querySelector("#fotballFaner .segment-del[data-verdi='neste']").click();
          setTimeout(function () {
            var neste = document.querySelectorAll(".kamp");
            ok("neste runde listes", neste.length === 2, neste.length);
            // En kamp som ikke er spilt har klokkeslett, ikke resultat.
            ok("kommende kamp viser klokkeslett",
               /^\\d{2}[:.]\\d{2}$/.test(neste[0].querySelector(".kamp-tall").textContent),
               neste[0].querySelector(".kamp-tall").textContent);

            var forFanebytte = window.__fotball.length;
            document.querySelector("#fotballFaner .segment-del[data-verdi='tabell']").click();
            setTimeout(function () {
              ok("fanebytte tilbake henter ikke pa nytt",
                 window.__fotball.length === forFanebytte,
                 forFanebytte + " -> " + window.__fotball.length);

              document.querySelector("#ligaVelger .segment-del[data-verdi='premier']").click();
              setTimeout(function () {
                ok("ny liga hentes", window.__fotball.length > forFanebytte,
                   window.__fotball.join(" "));
                ok("liga folger med i adressen",
                   location.hash.indexOf("premier") > -1, location.hash);

                history.back();
                setTimeout(function () {
                  ok("tilbakeknappen forlater ikke fotball med en gang",
                     synlig("fotball"), location.hash);
                  ferdig();
                }, 300);
              }, 400);
            }, 300);
          }, 400);
        }, 400);
      }, 300);
    }, 500);
  }, 900); });
`, "390,844");   // telefonbredde: det er der tabellen ma rulle

/* ---------------- 7. fotball: dyplenke og feil ---------------- */

const SAK_7 = await kjor("fotball-lenke", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/premier/neste";

  window.addEventListener("load", function () { setTimeout(function () {
    ok("dyplenke apner fotball", !document.getElementById("fotball").hidden);
    var fane = document.querySelector("#fotballFaner .segment-del[aria-current='true']");
    ok("dyplenke velger riktig fane", fane.dataset.verdi === "neste", fane.dataset.verdi);
    var liga = document.querySelector("#ligaVelger .segment-del[aria-current='true']");
    ok("dyplenke velger riktig liga", liga.dataset.verdi === "premier", liga.dataset.verdi);
    ok("ligaen star i toppfeltet",
       document.getElementById("filterTag").textContent === "Premier League",
       document.getElementById("filterTag").textContent);

    document.getElementById("fanenNyheter").click();
    setTimeout(function () {
      ok("veien tilbake til nyheter virker", !document.getElementById("feed").hidden);
      // Feeden lastes selv om appen apnet i fotball, sa byttet er umiddelbart.
      ok("feeden sto klar bak fanen", document.querySelectorAll(".row").length > 0,
         document.querySelectorAll(".row").length);
      ferdig();
    }, 400);
  }, 900); });
`);

const SAK_8 = await kjor("fotball-feil", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker", true) + `

  window.addEventListener("load", function () { setTimeout(function () {
    document.getElementById("fanenFotball").click();
    setTimeout(function () {
      var tekst = document.getElementById("fotballInnhold").textContent;
      // En feil skal si fra. En tom tabell ser ut som en liga uten kamper.
      ok("feil fra tjenesten vises", tekst.indexOf("API-Football") > -1, tekst.slice(0, 60));
      ok("ingen tom tabell tegnes", !document.querySelector(".tabell"));
      ferdig();
    }, 600);
  }, 900); });
`);

/* ---------------- 9. lag i tabellen soker i nyhetene ---------------- */

const SAK_9 = await kjor("fotball-lagsok", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/eliteserien/tabell";

  window.addEventListener("load", function () { setTimeout(function () {
    var knapper = document.querySelectorAll(".tabell .lag-knapp");
    ok("hvert lag har en knapp", knapper.length === 3, knapper.length);

    var forSok = window.__kall.length;
    knapper[1].click();   // "Brann"

    setTimeout(function () {
      ok("trykk pa lag bytter til nyheter",
         !document.getElementById("feed").hidden && document.getElementById("fotball").hidden);
      ok("toppfeltet viser soket",
         document.getElementById("filterTag").textContent === "Søk: Brann",
         document.getElementById("filterTag").textContent);
      // Sokefeltet skal vise det samme, sa neste sok kan redigeres framfor
      // a skrives pa nytt.
      ok("sokefeltet fylles med lagnavnet",
         document.getElementById("sokFelt").value === "Brann",
         document.getElementById("sokFelt").value);
      ok("feeden hentes pa nytt", window.__kall.length > forSok,
         forSok + " -> " + window.__kall.length);
      ok("soket gikk mot WordPress med lagnavnet",
         window.__sokUrl.indexOf("search=Brann") > -1, window.__sokUrl);
      ferdig();
    }, 700);
  }, 900); });
`);

/* ---------------- 10. ferdigspilt sesong ---------------- */

// Gratisnivaet gir en sesong som er over. Da har den ingen neste runde, og
// «ingen kamper er satt opp» ville sett ut som en feil hos oss.
const SAK_10 = await kjor("fotball-ferdig", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2024, sisteSesong: false, del: del,
                    oppdatert: new Date().toISOString(), kamper: [] };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";

  window.addEventListener("load", function () { setTimeout(function () {
    var tekst = document.getElementById("fotballInnhold").textContent;
    ok("ferdigspilt sesong forklares", tekst.indexOf("ferdigspilt") > -1, tekst.slice(0, 80));
    ok("sesongen navngis i forklaringen", tekst.indexOf("2024") > -1, tekst.slice(0, 80));
    ok("ingen tom kampliste tegnes", !document.querySelector(".kamper"));
    ferdig();
  }, 1200); });
`);

/* ---------------- rapport ---------------- */

const alle = [...SAK_1, ...SAK_2, ...SAK_3, ...SAK_4, ...SAK_5, ...SAK_6, ...SAK_7, ...SAK_8, ...SAK_9, ...SAK_10];
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
tjener.close();
process.exit(feilet ? 1 : 0);
