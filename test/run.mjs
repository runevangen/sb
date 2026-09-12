#!/usr/bin/env node
// Regresjonstester for Sportsbibelen-appen.
//
//   node test/run.mjs
//
// Ingen avhengigheter. Testene lastes inn i en kopi av index.html med et
// mocket window.fetch, kjores i headless Chromium og rapporterer via
// exit-kode. Sett CHROME hvis nettleseren ligger et annet sted.

import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

const kjorProsess = promisify(execFile);
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "index.html"), "utf8");
const adminSide = readFileSync(join(root, "admin.html"), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "sb-test-"));

// Testsidene serveres over HTTP, ikke fra file://. Modul-script blokkeres
// av CORS pa file://-opphav, sa appen ville aldri lastet. HTTP gjor i
// tillegg testmiljoet likere produksjon: absolutte stier som /app.css
// loser seg som de skal.
// Tegnsettet star i headeren, ikke bare i <meta charset>: det injiserte
// testskriptet skyver meta-taggen forbi de forste 1024 bytene, og da
// gjetter nettleseren. Lokalt gjettet den riktig, pa CI ble «føles» til
// «fÃ¸les». HTTP-headeren vinner over gjetting.
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
};

function startTjener() {
  const tjener = createServer((req, res) => {
    const sti = decodeURIComponent(req.url.split("?")[0]);
    // Testsidene ligger i temp; alt annet hentes fra repoet. En test kan
    // ogsa legge sin egen utgave av en modul i temp — da vinner den. Det
    // er slik en datafil som visninger.js kan fylles i en test uten at
    // det som star i repoet endres.
    const rel = sti.replace(/^\/+/, "");
    const iTmp = join(tmp, rel);
    const fil = existsSync(iTmp) ? iTmp : join(root, rel);
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

  // Ingen test skal sporre telefonen om ekte posisjon. Uten dette henger
  // headless Chromium pa CI: posisjonsoppslaget venter pa et nettkall som
  // aldri kommer, og virtuell tid star stille sa lenge det star pa.
  // Tester som trenger en posisjon overstyrer denne selv.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (ok, feil) {
      if (feil) feil({ code: 1, message: "Stubbet: ingen posisjon i test" });
    };
  }
`;

function avkod(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// storrelse settes der vindushoyden er en del av det som testes. Standard
// er nettleserens eget vindu; hoydetesten trenger et telefonformat for at
// taket pa kortet i det hele tatt skal binde.
async function kjor(navn, skript, storrelse, kilde) {
  const fil = join(tmp, navn + ".html");
  // Standard er appen selv; admin-portalen er en egen side og sendes inn.
  const side = kilde || app;
  // Skriptet legges etter <meta charset>, sa tegnsettet star forst i fila
  // ogsa for den som leser den uten headeren.
  const meta = side.match(/<meta charset="utf-8">/i);
  const merke = meta ? meta[0] : "<head>";
  writeFileSync(fil, side.replace(merke, merke + "\n<script>" + HARNESS + skript + "<\/script>"));

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

      // Lange lagnavn brytes over to linjer, sa selv stor skrift far plass.
      document.documentElement.setAttribute("data-font", "stor");
      ok("stor skrift far ogsa plass nar navnene brytes",
         skall.scrollWidth <= skall.clientWidth, skall.scrollWidth + " av " + skall.clientWidth);
      // Blir feltet likevel for smalt — en eldre telefon, en enda storre
      // skrift — ma det rulle: .phone klipper alt som stikker utenfor, sa
      // uten rulling ville de siste kolonnene bare vaert borte, og det ser
      // likt ut i DOM-en. Feltet gjores smalere her for a tvinge det fram.
      skall.style.width = "220px";
      ok("et smalere felt gjor tabellen bredere enn feltet",
         skall.scrollWidth > skall.clientWidth, skall.scrollWidth + " av " + skall.clientWidth);
      // scrollLeft virker fra skript ogsa med overflow: hidden, sa det
      // alene beviser ikke at leseren kan dra. Stilen ma sjekkes i tillegg.
      ok("feltet er rullbart for leseren, ikke bare for skript",
         ["auto", "scroll"].indexOf(getComputedStyle(skall).overflowX) > -1,
         getComputedStyle(skall).overflowX);
      skall.scrollLeft = 999;
      ok("feltet lar seg rulle sidelengs", skall.scrollLeft > 0, skall.scrollLeft);
      var sisteKol = document.querySelector(".tabell tbody tr .kol-poeng").getBoundingClientRect();
      var feltet = skall.getBoundingClientRect();
      ok("poengkolonnen er innenfor skjermen etter rulling",
         sisteKol.right <= feltet.right + 1, Math.round(sisteKol.right) + " av " + Math.round(feltet.right));
      skall.scrollLeft = 0;
      skall.style.width = "";
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
    // Ligaen byttes, den fjernes ikke. Da skal den heller ikke ha kryss.
    ok("ligaen er ren tekst, ikke en filterbrikke",
       !document.querySelector("#filterTag .filter-chip"));

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
  // En sak lenger nede i feeden handler faktisk om laget. Etter et lagsok
  // skal den sta overst — som toppsak — ikke der datoen tilfeldigvis
  // plasserer den.
  saker[7].title.rendered = "Brann-jubel i Bergen";
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
         document.querySelector("#filterTag .filter-navn").textContent === "Søk: Brann",
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
      // Relevans, ikke dato: ellers fyller de tolv nyeste sakene som
      // nevner laget i forbifarten forste side.
      ok("soket sorteres etter relevans hos WordPress",
         window.__sokUrl.indexOf("orderby=relevance") > -1 &&
         window.__sokUrl.indexOf("orderby=date") === -1, window.__sokUrl);
      ok("saken med laget i tittelen er toppsak",
         document.querySelector(".hero-title").textContent === "Brann-jubel i Bergen",
         document.querySelector(".hero-title").textContent);

      // Veien ut av soket. Uten den blir feeden stande filtrert til man
      // apner menyen og finner «Alle saker».
      var brikke = document.querySelector("#filterTag .filter-chip");
      ok("filteret er en knapp med kryss",
         brikke && brikke.tagName === "BUTTON" &&
         brikke.textContent.indexOf("×") > -1, brikke && brikke.textContent);

      var forT\u00f8mming = window.__sokUrl;
      brikke.click();
      setTimeout(function () {
        ok("brikken forsvinner nar filteret er borte",
           !document.querySelector("#filterTag .filter-chip"),
           document.getElementById("filterTag").textContent);
        ok("sokefeltet tommes ogsa",
           document.getElementById("sokFelt").value === "",
           document.getElementById("sokFelt").value);
        ok("feeden hentes uten sok",
           window.__sokUrl !== forT\u00f8mming && window.__sokUrl.indexOf("search=") === -1,
           window.__sokUrl);
        ok("uten sok sorteres feeden etter dato igjen",
           window.__sokUrl.indexOf("orderby=date") > -1, window.__sokUrl);
        ok("uten sok er nyeste sak toppsak igjen",
           document.querySelector(".hero-title").textContent === "Sak 1",
           document.querySelector(".hero-title").textContent);
        ferdig();
      }, 700);
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

/* ---------------- 11. favorittlag ---------------- */

// Stjernen i tabellen velger laget; valget lagres lokalt og lofter sakene
// om laget i feeden bak fanen — men bare saker som handler om det.
const SAK_11 = await kjor("favorittlag", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  saker[7].title.rendered = "Brann-jubel i Bergen";
  // Nevnes bare i forbifarten. Skal ikke skyve dagens toppsak nedover.
  saker[9].excerpt.rendered = "Brann nevnes i en bisetning";
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/eliteserien/tabell";
  function topp() { return document.querySelector(".hero-title").textContent; }
  function andre() { return document.querySelector(".row .row-title").textContent; }
  function lagredeLag() { return (JSON.parse(localStorage.getItem("sb-visning")) || {}).lag || []; }

  // Et unntak underveis skal bli en testfeil med melding, ikke en side
  // som rapporterer ingenting.
  window.addEventListener("load", function () { setTimeout(function () { try {
    var stjerner = document.querySelectorAll(".tabell .lag-stjerne");
    var rader = document.querySelectorAll(".tabell tbody tr");
    ok("hvert lag har en stjerne", stjerner.length === 3, stjerner.length);
    ok("ingen er valgt fra start",
       Array.prototype.every.call(stjerner, function (s) { return s.getAttribute("aria-pressed") === "false"; }));
    // Stjernen har ingen tekst, sa lagnavnet i cellen star rent.
    ok("lagnavnet i cellen er fortsatt rent",
       rader[1].querySelector(".kol-lag").textContent === "Brann",
       rader[1].querySelector(".kol-lag").textContent);
    ok("uten favoritt er nyeste sak toppsak", topp() === "Sak 1", topp());
    ok("ingen favorittlinje uten valg", !document.querySelector(".favoritt-linje"));

    stjerner[1].click();   // Brann
    ok("stjernen markeres som valgt", stjerner[1].getAttribute("aria-pressed") === "true");
    ok("knappen forteller hva neste trykk gjor",
       stjerner[1].getAttribute("aria-label") === "Slutt å følge Brann",
       stjerner[1].getAttribute("aria-label"));
    ok("valget lagres lokalt", lagredeLag().length === 1 && lagredeLag()[0] === "Brann", JSON.stringify(lagredeLag()));

    // Feeden ligger bak fanen og skal allerede vaere bygget om.
    ok("saken om laget er toppsak", topp() === "Brann-jubel i Bergen", topp());
    ok("favorittlinja viser laget",
       (document.querySelector(".favoritt-linje") || {}).textContent.indexOf("Brann øverst") > -1,
       (document.querySelector(".favoritt-linje") || {}).textContent);
    ok("sak som bare nevner laget i forbifarten loftes ikke", andre() === "Sak 1", andre());

    // Linja er veien tilbake til tabellen, der valget gjores om.
    document.getElementById("fanenNyheter").click();
    document.querySelector(".favoritt-linje").click();
    ok("favorittlinja forer til tabellen",
       !document.getElementById("fotball").hidden && location.hash === "#/fotball/eliteserien/tabell",
       location.hash);

    stjerner[1].click();   // av igjen
    ok("stjernen kan slas av", stjerner[1].getAttribute("aria-pressed") === "false");
    ok("lagringen tommes", lagredeLag().length === 0, JSON.stringify(lagredeLag()));
    ok("uten favoritt er nyeste sak toppsak igjen", topp() === "Sak 1", topp());
    ok("favorittlinja forsvinner", !document.querySelector(".favoritt-linje"));
    } catch (e) { ok("ingen unntak underveis", false, e.message + " @ " + (e.stack || "").split("\\n")[1]); }
    ferdig();
  }, 900); });
`);

/* ---------------- 12. hvor ser du kampen ---------------- */

// Arets neste runde (fra TheSportsDB) kan deles: velg sted, del inn i
// gruppechatten. Delingsmenyen stubbes, sa teksten kan kontrolleres.
const SAK_12 = await kjor("kamp-deling", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  // Kampene har arena, sa vaeret hentes og star under dem.
  var ARETS = KOMMENDE.map(function (k, i) {
    return Object.assign({}, k, { arena: i === 0 ? "Brann Stadion" : "" });
  });
  window.__vaerKall = 0;
  window.__puberKall = 0;
  window.__overpassKall = 0;
  // Dine puber fra for: Pub X er delt to ganger.
  localStorage.setItem("sb-visning", JSON.stringify({ puber: [{ navn: "Pub X", antall: 2, sist: 1 }] }));
  // Posisjon: Trondheim torg. Tilbakekallet skjer straks.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 63.4305, longitude: 10.3951 } });
  };
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("overpass-api.de") > -1) {
      window.__overpassKall += 1;
      window.__overpassBody = decodeURIComponent(String((o || {}).body || ""));
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [
        { type: "node", id: 9, lat: 63.4310, lon: 10.3960, tags: { amenity: "pub", name: "Torgpuben" } } ] }); } });
    }
    if (u.indexOf("/api/puber?") === 0) {
      window.__puberKall += 1;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ arena: "Brann Stadion", kilde: "OpenStreetMap",
          grupper: [{ tittel: "Ved Brann Stadion", puber: [{ navn: "Stadionpuben", avstand: 240 }] },
                    { tittel: "Ved Brann stadion holdeplass", puber: [{ navn: "Holdeplasskroa", avstand: 90 }] }] })); } });
    }
    if (u.indexOf("/api/vaer?") === 0) {
      window.__vaerKall += 1;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ arena: "Brann Stadion",
          tekst: "8°, føles som 4°. Regn. Jakke, og gjerne lue. Ta regnjakke.", rad: "Ta regnjakke.", kilde: "MET Norway" })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
                    kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
                    kamper: ARETS, runde: "Runde 21" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  window.__delt = null;
  navigator.share = function (d) { window.__delt = d; return Promise.resolve(); };
  location.hash = "#/fotball/eliteserien/neste";

  window.addEventListener("load", function () { setTimeout(function () { try {
    var knapper = document.querySelectorAll(".kamp-del");
    ok("hver kamp i arets runde kan deles", knapper.length === 2, knapper.length);
    ok("kilden star i stempelet",
       document.querySelector(".fotball-kilde").textContent === "TheSportsDB",
       document.querySelector(".fotball-kilde").textContent);
    ok("ingen notis nar deling er mulig", !document.querySelector(".kamp-notis"));

    // Vaeret hentes ikke for noen apner kampen. For sto det under hver
    // eneste kamp i runden, og hver av dem kostet et kall mot MET for
    // leseren hadde trykket pa noe.
    ok("ingen vaerlinje for kampen er apnet",
       document.querySelectorAll(".kamp-vaer").length === 0);
    ok("og MET er ikke sporten gang", window.__vaerKall === 0, window.__vaerKall);
    ok("MET krediteres",
       document.getElementById("fotballInnhold").textContent.indexOf("Vær: MET Norway") > -1);

    // Hele linja er knappen, ikke en pil i hjornet: flata ligger utstrakt
    // over kamplinja, og pilen er dekor som ikke tar imot trykk.
    var linje0 = knapper[0].closest(".kamp").querySelector(".kamp-linje");
    var flate = knapper[0].getBoundingClientRect();
    var linjeMal = linje0.getBoundingClientRect();
    ok("trykkflata dekker hele kamplinja",
       Math.abs(flate.width - linjeMal.width) < 2 && Math.abs(flate.height - linjeMal.height) < 2,
       Math.round(flate.width) + "x" + Math.round(flate.height) + " mot " +
       Math.round(linjeMal.width) + "x" + Math.round(linjeMal.height));
    ok("pilen er dekor, ikke et mal",
       getComputedStyle(linje0.querySelector(".kamp-pil")).pointerEvents === "none");
    // Flata ligger over lagnavnene — den ma, for a fange trykk hvor som
    // helst pa linja. Da kan den aldri male noe selv: pa telefon henger
    // :hover igjen etter et trykk, og en bunnfarge her gjorde lagnavnene
    // borte for godt.
    var arkRegler = [];
    Array.prototype.forEach.call(document.styleSheets, function (ark) {
      try { Array.prototype.push.apply(arkRegler, ark.cssRules); } catch (e) {}
    });
    var flateRegler = arkRegler.filter(function (r) {
      return r.selectorText && r.selectorText.indexOf(".kamp-del") > -1;
    });
    ok("det finnes regler for flata a sjekke", flateRegler.length > 0, flateRegler.length);
    ok("trykkflata maler aldri over lagnavnene",
       flateRegler.every(function (r) {
         var bunn = (r.style.background || "") + " " + (r.style.backgroundColor || "");
         // Ingen regex her: i en template-literal spises bakstreken, og
         // et monster med \\( blir ugyldig og stopper hele testsiden.
         return bunn.indexOf("var(") === -1 && bunn.indexOf("#") === -1 &&
                bunn.indexOf("rgb") === -1 && bunn.indexOf("hsl") === -1;
       }),
       flateRegler.map(function (r) { return r.selectorText + "{" + r.style.background + "}"; }).join(" | "));
    // Og trykket skal lande pa flata uansett hvor pa linja det traff —
    // ogsa midt pa lagnavnet.
    var navnMal = linje0.querySelector(".kamp-lag").getBoundingClientRect();
    var truffet = document.elementFromPoint(navnMal.left + navnMal.width / 2,
                                            navnMal.top + navnMal.height / 2);
    ok("et trykk midt pa lagnavnet treffer flata",
       truffet === knapper[0], truffet && (truffet.className || truffet.tagName));
    var lagNavn = Array.prototype.map.call(linje0.querySelectorAll(".kamp-lag"), function (l) { return l.textContent; });
    ok("ett tastaturmal per kamp, og det sier hvilken kamp",
       knapper[0].getAttribute("aria-label") === lagNavn.join(" – ") + ". Hvor ser du kampen?",
       knapper[0].getAttribute("aria-label"));
    // Et trykk midt pa lagnavnet skal apne kampen, ikke bare pa pilen.
    ok("ingen egen knapp i hjornet a treffe",
       knapper[0].closest(".kamp").querySelectorAll("button.kamp-pil").length === 0);

    knapper[0].click();
    var panel = document.querySelector(".kamp-panel");
    var valgt = knapper[0].closest(".kamp");
    // Rammen skal omslutte alt som horer til kampen, sa panelet ligger
    // inni raden — ikke som en losrevet rad under den.
    ok("trykk apner panelet inne i kampen",
       panel && panel.parentElement === valgt &&
       knapper[0].getAttribute("aria-expanded") === "true");
    ok("den valgte kampen far en ramme rundt seg",
       valgt.classList.contains("valgt") &&
       getComputedStyle(valgt).borderTopWidth !== "0px",
       getComputedStyle(valgt).borderTopWidth);
    ok("og bare den ene", document.querySelectorAll(".kamp.valgt").length === 1);
    // Vaeret kommer forst na, og bare pa kampen som ble apnet.
    ok("vaerlinja kommer nar kampen apnes", valgt.querySelectorAll(".kamp-vaer").length === 1);
    ok("og MET sporres da, en gang", window.__vaerKall === 1, window.__vaerKall);
    ok("ingen andre kamper har fatt vaer",
       document.querySelectorAll(".kamp-vaer").length === 1);
    ok("del er sperret til et sted er valgt", panel.querySelector(".kamp-send").disabled);
    ok("stadion har arenaens navn nar vi har det",
       panel.querySelectorAll(".hvor-valg")[2].textContent === "På Brann Stadion",
       panel.querySelectorAll(".hvor-valg")[2].textContent);

    panel.querySelectorAll(".hvor-valg")[1].click();   // pa pub
    ok("pubfeltet kommer fram", !panel.querySelector(".kamp-pub").hidden);
    ok("del er apnet", !panel.querySelector(".kamp-send").disabled);
    // Forslagene: dine puber forst, knapp for naer deg, og etter hvert
    // ved stadion og ved holdeplassen fra funksjonen.
    var forslag = panel.querySelector(".pub-forslag");
    ok("pubforslagene vises nar pub er valgt", forslag && !forslag.hidden);
    var titler = function () { return Array.prototype.map.call(forslag.querySelectorAll(".pub-gruppe-tittel"), function (t) { return t.textContent; }); };
    // Kampen spilles ofte et annet sted enn der man ser den, sa naer deg
    // hentes med en gang — trykket som valgte «pa pub» er handlingen
    // telefonen krever for a sporre om posisjon.
    ok("naer deg hentes med en gang, uten et trykk til",
       window.__overpassKall === 1, window.__overpassKall);
    ok("dine puber er med", titler().indexOf("Dine puber") > -1, titler().join("|"));
    panel.querySelector(".kamp-pub").value = "Pub X";

    // Et annet panel apnes: det forste skal lukkes.
    knapper[1].click();
    ok("bare ett panel om gangen", document.querySelectorAll(".kamp-panel").length === 1 &&
       knapper[0].getAttribute("aria-expanded") === "false");
    ok("rammen folger med over", document.querySelectorAll(".kamp.valgt").length === 1 &&
       !knapper[0].closest(".kamp").classList.contains("valgt"));
    // Vaeret rydder etter seg: den lukkede kampen skal ikke bli staende
    // med en linje som hoerer til en apen rad.
    ok("vaeret folger den apne kampen",
       knapper[0].closest(".kamp").querySelectorAll(".kamp-vaer").length === 0);
    knapper[0].click();
    panel = document.querySelector(".kamp-panel");
    panel.querySelectorAll(".hvor-valg")[1].click();
    forslag = panel.querySelector(".pub-forslag");

    // Nested tilbakekall ligger utenfor try-en over; hvert far sin egen.
    setTimeout(function () { try {
      // Vaeret fylles nar MET svarer, og bare pa den apne kampen.
      var vaerNa = document.querySelectorAll(".kamp-vaer");
      ok("vaeret star under den apne kampen nar svaret kom",
         vaerNa.length === 1 && !vaerNa[0].hidden &&
         vaerNa[0].textContent.indexOf("8°, føles som 4°") === 0,
         vaerNa.length + " " + (vaerNa[0] ? vaerNa[0].textContent : ""));
      ok("og den star inne i rammen",
         vaerNa[0].closest(".kamp").classList.contains("valgt"));

      var titlerNa = Array.prototype.map.call(forslag.querySelectorAll(".pub-gruppe-tittel"), function (t) { return t.textContent; });
      ok("naer deg star forst", titlerNa[0] === "Nær deg", titlerNa.join("|"));
      ok("naer deg sporr Overpass fra nettleseren med rundet posisjon",
         window.__overpassKall === 1 && window.__overpassBody.indexOf("around:800,63.431,10.395") > -1, window.__overpassBody);
      ok("puber naer deg vises", forslag.textContent.indexOf("Torgpuben") > -1);
      ok("puber ved stadion og ved holdeplassen kommer fra funksjonen",
         titlerNa.indexOf("Ved Brann Stadion") > -1 && titlerNa.indexOf("Ved Brann stadion holdeplass") > -1, titlerNa.join("|"));
      ok("funksjonen spores en gang per arena", window.__puberKall === 1, window.__puberKall);
      ok("OpenStreetMap krediteres", forslag.textContent.indexOf("© OpenStreetMap-bidragsytere") > -1);
      var chip = Array.prototype.find.call(forslag.querySelectorAll(".pub-chip"), function (c) { return c.textContent.indexOf("Stadionpuben") === 0; });
      ok("chipen viser avstand", chip && chip.textContent.indexOf("240 m") > -1, chip && chip.textContent);
      if (chip) chip.click();
      ok("trykk pa en pub fyller feltet", chip && panel.querySelector(".kamp-pub").value === "Stadionpuben" &&
         chip.getAttribute("aria-pressed") === "true");

      panel.querySelector(".kamp-pub").value = "Pub X";
      panel.querySelector(".kamp-send").click();
      setTimeout(function () { try {
        var lagret = (JSON.parse(localStorage.getItem("sb-visning")) || {}).puber || [];
        ok("delt pub telles i dine puber", lagret.length === 1 && lagret[0].navn === "Pub X" && lagret[0].antall === 3,
           JSON.stringify(lagret));
        etterDeling();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    function etterDeling() {
      var d = window.__delt || {};
      ok("teksten som deles har kampen, puben og sporsmalet",
         String(d.text).indexOf("Brann – Bodo/Glimt") > -1 &&
         String(d.text).indexOf("Jeg ser den på Pub X.") > -1 &&
         String(d.text).indexOf("Hvor ser du?") > -1, d.text);
      ok("vaeret er med i teksten som deles",
         String(d.text).indexOf("Været ved avspark: 8°, føles som 4°.") > -1, d.text);
      // Lenka skal apne kampen som ble delt, ikke bare runden: en runde er
      // ti kamper, og mottakeren skal slippe a lete etter den det gjaldt.
      ok("lenken apner kampen som ble delt, med sted og svar",
         String(d.url).indexOf("#/fotball/eliteserien/neste?") > -1 &&
         String(d.url).indexOf("kamp=3") > -1 && String(d.url).indexOf("hvor=pub") > -1 &&
         String(d.url).indexOf("sted=Pub") > -1, d.url);
      ok("panelet lukkes etter deling", !document.querySelector(".kamp-panel"));
      ferdig();
    }
  } catch (e) { ok("ingen unntak underveis", false, e.message + " @ " + (e.stack || "").split("\\n")[1]); ferdig(); }
  }, 1200); });
`);

/* ---------------- 13. fjorarets runde kan ikke deles ---------------- */

const SAK_13 = await kjor("kamp-deling-gammel", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () {
    ok("fjorarets kamper har ingen delingsknapp", !document.querySelector(".kamp-del"));
    var notis = document.querySelector(".kamp-notis");
    ok("det star hvorfor", notis && notis.textContent.indexOf("terminlisten") > -1,
       notis ? notis.textContent : "ingen notis");
    ok("kilden er API-Football nar svaret ikke sier noe annet",
       document.querySelector(".fotball-kilde").textContent === "API-Football");
    ok("fjorarets kamper far ikke vaer", !document.querySelector(".kamp-vaer"));
    ferdig();
  }, 1200); });
`);

/* ---------------- 14. pubforslag nar alt nettverk svikter ---------------- */

// Ingenting skal feile stille: svarer funksjonen feil, star det hvorfor.
// Og det viktigste: den kuraterte lista ligger i koden, sa kjente
// fotballpuber i naerheten star der ogsa nar bade Overpass og var egen
// funksjon er nede. Det var nettopp Overpass som sviktet i prod.
const SAK_14 = await kjor("pub-feil", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Leseren star ved Oslo S. Overpass svarer ikke.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 59.9110, longitude: 10.7500 } });
  };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: false, status: 504, statusText: "Gateway Timeout",
        json: function () { return Promise.reject(new Error("nede")); } });
    }
    if (u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve(JSON.stringify({ feil: "Fikk ikke svar fra OpenStreetMap",
          forsok: [{ kilde: "Overpass overpass-api.de", status: 406, utfall: "HTTP 406" }] })); } });
    }
    if (u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del, kilde: "TheSportsDB",
                    oppdatert: new Date().toISOString(), kamper: ARETS, runde: "Runde 21" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    panel.querySelectorAll(".hvor-valg")[1].click();
    var forslag = panel.querySelector(".pub-forslag");
    setTimeout(function () { try {
      // Uten nettverk i det hele tatt star lista i koden igjen.
      var titler = Array.prototype.map.call(forslag.querySelectorAll(".pub-gruppe-tittel"), function (t) { return t.textContent; });
      ok("kjente fotballpuber vises uten nettverk",
         titler[0] === "Kjent for å vise fotball", titler.join("|"));
      var chips = forslag.querySelectorAll(".pub-chip");
      ok("og de er ekte steder fra lista",
         chips.length > 2 && forslag.textContent.indexOf("O'Learys Oslo Sentralstasjon") > -1,
         chips.length + " " + forslag.textContent.slice(0, 120));
      ok("de er merket som kjent for fotball", !!forslag.querySelector(".pub-merke"));
      ok("naermest star forst",
         chips[0].textContent.indexOf("O'Learys Oslo Sentralstasjon") === 0, chips[0].textContent);

      ok("svikter funksjonen, star det hvorfor",
         forslag.textContent.indexOf("Fikk ikke hentet puber ved Brann Stadion") > -1, forslag.textContent);
      // Hvem som sviktet, sa det kan meldes videre uten a grave i logger.
      ok("og hvem som sviktet",
         forslag.textContent.indexOf("overpass-api.de svarte 406") > -1, forslag.textContent);
      ok("naer deg-knappen star der uansett", !!forslag.querySelector(".pub-naer"));
      // Naer deg feiler, men sier hvem som sviktet.
      ok("naer deg forklarer hvem som sviktet",
         forslag.textContent.indexOf("overpass-api.de svarte 504") > -1, forslag.textContent);
      ok("pubfeltet kan fortsatt brukes", !panel.querySelector(".kamp-pub").hidden);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 15. admin-portalen ---------------- */

// Portalen er en egen side. Den skriver ingenting selv: testen fanger
// POST-en og sjekker at det som sendes er det samme som sto pa skjermen.
const SAK_15 = await kjor("admin", `
  var KAMPER_ES = [
    { id: 501, hjemme: "Rosenborg", borte: "Brann", dato: "2026-09-20T17:00:00+00:00", arena: "Lerkendal Stadion" },
    { id: 502, hjemme: "Vaalerenga", borte: "Bodo/Glimt", dato: "2026-09-21T15:00:00+00:00", arena: "Intility Arena" }
  ];
  var KAMPER_PL = [
    { id: 901, hjemme: "Arsenal", borte: "Liverpool", dato: "2026-09-19T14:00:00+00:00", arena: "Emirates Stadium" }
  ];
  var sendt = null;
  var innlogging = null;
  var bedtOm = [];
  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    bedtOm.push(u);
    if (u.indexOf("/api/fotball/neste") === 0) {
      var pl = u.indexOf("liga=premier") > -1;
      return svar(200, {
        liga: pl ? "Premier League" : "Eliteserien", sesong: 2026, sisteSesong: true,
        kilde: "TheSportsDB", runde: pl ? "Runde 5" : "Runde 21",
        kamper: pl ? KAMPER_PL : KAMPER_ES });
    }
    if (u.indexOf("/api/visninger") === 0) {
      // Uten metode er det oppsett-sporsmalet portalen stiller ved apning.
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      var kropp = JSON.parse(opt.body);
      if (kropp.handling === "sjekk") {
        innlogging = kropp;
        return kropp.passord === "hemmelig"
          ? svar(200, { ok: true })
          : svar(401, { feil: "Feil passord" });
      }
      sendt = kropp;
      return svar(200, { ok: true, pub: sendt.pub, valgt: sendt.kampIder.length,
        merknad: "Lagret " + sendt.kampIder.length + " kamper." });
    }
    return svar(200, {});
  };

  function telt(sti) {
    return bedtOm.filter(function (u) { return u.indexOf(sti) === 0; }).length;
  }

  window.addEventListener("load", function () { setTimeout(function () { try {
    // Passordet forst. Resten av portalen finnes ikke pa skjermen for
    // tjenesten har godtatt det — og da er heller ingen kamper hentet,
    // sa en apning ingen kan lagre fra ikke koster av dognkvoten.
    ok("portalen ligger skjult for innlogging",
       document.getElementById("portal").hidden === true);
    ok("ingen kamper hentes for innlogging", telt("/api/fotball/neste") === 0, bedtOm.join(" "));
    ok("portalen sporr om den er satt opp", telt("/api/visninger") === 1, bedtOm.join(" "));

    var puber = document.getElementById("pub");
    ok("pubene fra lista kan velges", puber.options.length > 10, puber.options.length);
    ok("usikre puber star ikke i lista",
       puber.textContent.indexOf("usikker") === -1);

    var ligaer = document.getElementById("liga");
    ok("ligaene kommer fra fotballmodulen",
       ligaer.options.length === 2 && ligaer.options[0].value === "eliteserien",
       Array.prototype.map.call(ligaer.options, function (o) { return o.value; }).join(","));

    // Uten passord skjer ingenting: portalen ber ikke tjenesten om noe.
    document.getElementById("loggInn").click();
    ok("uten passord sendes ingen innlogging", innlogging === null);
    ok("og det staar hvorfor",
       document.getElementById("adgangMelding").textContent.indexOf("passordet") > -1,
       document.getElementById("adgangMelding").textContent);

    // Feil passord slipper deg ikke inn, og tjenestens svar star der.
    document.getElementById("passord").value = "apneopp";
    document.getElementById("loggInn").click();

    setTimeout(function () { try {
      ok("feil passord holder portalen skjult",
         document.getElementById("portal").hidden === true);
      ok("og tjenestens svar vises",
         document.getElementById("adgangMelding").textContent.indexOf("Feil passord") > -1,
         document.getElementById("adgangMelding").textContent);
      ok("feil passord henter ingen kamper", telt("/api/fotball/neste") === 0, bedtOm.join(" "));

      document.getElementById("passord").value = "hemmelig";
      document.getElementById("loggInn").click();

      setTimeout(function () { try {
        ok("riktig passord apner portalen",
           document.getElementById("portal").hidden === false);
        // Passordet lever i modulen, ikke i DOM-en.
        ok("passordfeltet tommes etter innlogging",
           document.getElementById("passord").value === "");

        // Kampene er hentet fra samme endepunkt som fotballfanen bruker,
        // og forst na.
        ok("kampene hentes fra fotball-funksjonen, etter innlogging",
           telt("/api/fotball/neste") === 1, bedtOm.join(" "));
        var bokser = document.querySelectorAll(".kamp input");
        ok("de kommende kampene er avkryssbare", bokser.length === 2, bokser.length);
        ok("kampen star med lag og tid",
           document.getElementById("kamper").textContent.indexOf("Rosenborg – Brann") > -1,
           document.getElementById("kamper").textContent.slice(0, 120));
        ok("runden og kilden star under lista",
           document.getElementById("kampHint").textContent.indexOf("Runde 21") > -1,
           document.getElementById("kampHint").textContent);

        bokser[0].checked = true;
        document.getElementById("lagre").click();

    setTimeout(function () { try {
      ok("valget sendes til tjenesten", !!sendt);
      ok("bare den avkryssede kampen er med",
         sendt.kampIder.length === 1 && sendt.kampIder[0] === 501, JSON.stringify(sendt.kampIder));
      ok("puben blir med", sendt.pub === puber.value, sendt.pub);
      ok("passordet blir med", sendt.passord === "hemmelig");
      ok("kampene pa skjermen sendes med, sa tjenesten slipper a gjette",
         sendt.kamper.length === 2 && sendt.kamper[0].hjemme === "Rosenborg",
         JSON.stringify(sendt.kamper[0]));
      ok("svaret fra tjenesten vises",
         document.getElementById("melding").textContent.indexOf("Lagret 1 kamper") > -1,
         document.getElementById("melding").textContent);

      // Bytter admin liga, hentes den ligaens kommende kamper.
      ligaer.value = "premier";
      ligaer.dispatchEvent(new Event("change"));
      setTimeout(function () { try {
        ok("liga-bytte henter nye kamper",
           bedtOm[bedtOm.length - 1].indexOf("liga=premier") > -1, bedtOm[bedtOm.length - 1]);
        var nye = document.querySelectorAll(".kamp input");
        ok("og lista er den nye ligaens",
           nye.length === 1 && document.getElementById("kamper").textContent.indexOf("Arsenal") > -1,
           nye.length + " " + document.getElementById("kamper").textContent.slice(0, 80));
        ok("avkryssingen folger ikke med over", nye[0].checked === false);

        document.getElementById("merkAlle").click();
        document.getElementById("lagre").click();
        setTimeout(function () { try {
          ok("«kryss av alle» tar hele den nye ligaen",
             sendt.kampIder.length === 1 && sendt.kampIder[0] === 901, JSON.stringify(sendt.kampIder));
          ferdig();
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 200);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600); });
`, null, adminSide);

/* ---------------- 16. puben bekrefter kampen ---------------- */

// Visningene admin setter skal treffe leseren: pubene som viser nettopp
// denne kampen star over alle andre forslag, og er merket ogsa der de
// dukker opp i en annen gruppe.
//
// visninger.js er tom i repoet. Testen legger sin egen utgave i temp,
// som tjeneren serverer framfor den i repoet.
writeFileSync(join(tmp, "visninger.js"),
  'export const VISNINGER = [\n' +
  '  {"pub":"Lincoln Pub","kampId":3,"kamp":"Brann – Bodo/Glimt",' +
  '"dato":"2026-09-20T17:00:00+00:00","satt":"2026-09-11T10:00:00.000Z"},\n' +
  '  {"pub":"Carls","kampId":4,"kamp":"Molde – Rosenborg",' +
  '"dato":"2026-09-21T17:00:00+00:00","satt":"2026-09-11T10:00:00.000Z"}\n' +
  '];\n');

const SAK_16 = await kjor("pub-bekreftet", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Leseren star ved Lincoln Pub. Overpass svarer med den samme puben,
  // sa den dukker opp bade som bekreftet og som treff naer deg.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 59.9165, longitude: 10.7530 } });
  };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [
        { type: "node", id: 9, lat: 59.9165, lon: 10.7531, tags: { amenity: "pub", name: "Lincoln Pub" } },
        { type: "node", id: 10, lat: 59.9168, lon: 10.7540, tags: { amenity: "pub", name: "Tilfeldig Bar" } } ] }); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del, kilde: "TheSportsDB",
                    oppdatert: new Date().toISOString(), kamper: ARETS, runde: "Runde 21" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    // Linja star pa kampen selv, sa den som blar ser det uten a apne noe.
    var rader = document.querySelectorAll(".kamp.delbar");
    var viser = rader[0].querySelector(".kamp-viser");
    ok("kampen sier selv at den vises et sted", !!viser);
    ok("og hvor", viser.textContent.indexOf("Denne kampen vises på: Lincoln Pub") > -1,
       viser.textContent);
    // Stjerna er merket for «denne kampen vises her»; ballen sier bare at
    // stedet pleier a vise fotball.
    ok("linja er merket med stjerne",
       viser.querySelector(".kamp-viser-merke").textContent === "\u2605",
       viser.querySelector(".kamp-viser-merke").textContent);
    ok("neste kamp har sin egen pub pa raden",
       rader[1].querySelector(".kamp-viser").textContent.indexOf("Carls") > -1,
       rader[1].querySelector(".kamp-viser").textContent);
    // Pubnavnet tar deg videre: panelet apnes med puben valgt.
    rader[0].querySelector(".kamp-viser-pub").click();
    var apnet = document.querySelector(".kamp-panel");
    ok("et trykk pa pubnavnet apner delingspanelet", !!apnet);
    ok("med puben ferdig valgt", apnet.querySelector(".kamp-pub").value === "Lincoln Pub",
       apnet.querySelector(".kamp-pub").value);
    ok("og «pa pub» valgt",
       apnet.querySelectorAll(".hvor-valg")[1].getAttribute("aria-pressed") === "true");
    document.querySelectorAll(".kamp-del")[0].click();

    // Forste kamp: Brann – Bodo/Glimt, som Lincoln Pub viser.
    document.querySelectorAll(".kamp-del")[0].click();
    var panel = document.querySelectorAll(".kamp-panel")[0];
    panel.querySelectorAll(".hvor-valg")[1].click();
    var forslag = panel.querySelector(".pub-forslag");
    setTimeout(function () { try {
      var titler = Array.prototype.map.call(forslag.querySelectorAll(".pub-gruppe-tittel"),
        function (t) { return t.textContent; });
      ok("bekreftede puber star aller forst", titler[0] === "Viser denne kampen", titler.join("|"));
      var bekGruppe = forslag.querySelector(".pub-gruppe-bekreftet");
      var bekChips = bekGruppe.querySelectorAll(".pub-chip");
      ok("bare puben som viser denne kampen star der",
         bekChips.length === 1 && bekChips[0].textContent.indexOf("Lincoln Pub") === 0,
         bekChips.length + " " + bekChips[0].textContent);
      ok("den er merket med stjerne",
         !!bekChips[0].querySelector(".pub-bekreftet")
         && bekChips[0].querySelector(".pub-bekreftet").textContent === "\u2605",
         bekChips[0].textContent);
      ok("og stjerna sier hva den betyr",
         bekChips[0].querySelector(".pub-bekreftet").getAttribute("aria-label") === "viser denne kampen");
      ok("det star hvor opplysningen kommer fra",
         bekGruppe.textContent.indexOf("Meldt inn til oss") > -1, bekGruppe.textContent);
      // En annen pubs kamp skal ikke lekke inn her.
      ok("en annen kamps pub star ikke her",
         bekGruppe.textContent.indexOf("Carls") === -1, bekGruppe.textContent);

      // Samme pub dukker opp naer deg, og skal se lik ut der.
      var naerChips = Array.prototype.filter.call(forslag.querySelectorAll(".pub-chip"),
        function (c) { return c.textContent.indexOf("Lincoln Pub") === 0; });
      ok("puben dukker opp i flere grupper", naerChips.length > 1, naerChips.length);
      ok("og er merket bekreftet i alle",
         naerChips.every(function (c) { return !!c.querySelector(".pub-bekreftet"); }));
      var andre = Array.prototype.filter.call(forslag.querySelectorAll(".pub-chip"),
        function (c) { return c.textContent.indexOf("Tilfeldig Bar") === 0; });
      ok("en pub uten visning er ikke merket",
         andre.length > 0 && !andre[0].querySelector(".pub-bekreftet"), andre.length);

      // Et trykk velger puben som ellers.
      bekChips[0].click();
      ok("et trykk fyller pubfeltet", panel.querySelector(".kamp-pub").value === "Lincoln Pub",
         panel.querySelector(".kamp-pub").value);

      // Andre kamp: en annen pub, og Lincoln skal ikke folge med. Ett
      // panel om gangen, sa det forrige er borte.
      document.querySelectorAll(".kamp-del")[1].click();
      var panel2 = document.querySelector(".kamp-panel");
      ok("bare ett panel er apent", document.querySelectorAll(".kamp-panel").length === 1,
         document.querySelectorAll(".kamp-panel").length);
      panel2.querySelectorAll(".hvor-valg")[1].click();
      setTimeout(function () { try {
        var bek2 = panel2.querySelector(".pub-gruppe-bekreftet");
        ok("neste kamp har sin egen pub",
           bek2 && bek2.textContent.indexOf("Carls") > -1, bek2 ? bek2.textContent : "ingen gruppe");
        ok("og ikke den forriges",
           bek2.querySelectorAll(".pub-chip").length === 1, bek2.textContent);
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

rmSync(join(tmp, "visninger.js"));

/* ---------------- 17. lenka apner kampen som ble delt ---------------- */

const SAK_17 = await kjor("kamp-lenke", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  window.fetch = function (u) {
    u = String(u);
    // Vaer og puber er ikke det som testes her, og et svar som lar vente
    // pa seg stopper den virtuelle tiden.
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 || u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
                    kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
                    kamper: ARETS, runde: "Runde 21" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  // Adressen slik den kommer ut av en deling: kampen, svaret og stedet.
  location.hash = "#/fotball/eliteserien/neste?kamp=4&hvor=pub&sted=Pub%20X";
  window.addEventListener("load", function () { setTimeout(function () { try {
    ok("en delt lenke apner fotballfanen", !document.getElementById("fotball").hidden);
    var merket = document.querySelectorAll(".kamp-invitert");
    ok("bare den delte kampen loftes fram", merket.length === 1, merket.length);
    ok("og det er den lenka pekte pa",
       merket[0].dataset.kamp === "4" && merket[0].textContent.indexOf("Molde") > -1,
       merket[0].dataset.kamp + " " + merket[0].textContent);
    var linje = merket[0].querySelector(".kamp-invitasjon");
    ok("det star hvor avsenderen ser den",
       linje && linje.textContent.indexOf("noen ser kampen på Pub X") > -1,
       linje ? linje.textContent : "ingen linje");

    // Svaret skal koste ett trykk: panelet apnes med avsenderens sted
    // valgt, sa «jeg blir med» ikke krever at pubnavnet skrives pa nytt.
    linje.querySelector(".kamp-invitasjon-svar").click();
    var panel = document.querySelector(".kamp-panel");
    // Panelet ligger inne i den valgte kampen, innenfor rammen.
    ok("svar apner panelet pa den kampen",
       panel && merket[0].contains(panel) && merket[0].classList.contains("valgt"));
    ok("med avsenderens sted ferdig valgt",
       panel.querySelector(".kamp-pub").value === "Pub X" &&
       panel.querySelectorAll(".hvor-valg")[1].getAttribute("aria-pressed") === "true",
       panel.querySelector(".kamp-pub").value);
    // Den som kommer fra en delt lenke er utlogget. Da skal det sta hva
    // som mangler — og at delingen virker uansett.
    ok("utlogget star det hva som skal til for a bli med",
       panel.querySelector(".kamp-blirmed-valg .kamp-note").textContent
         .indexOf("Logg inn i menyen") > -1 &&
       !panel.querySelector(".kamp-blimed"),
       panel.querySelector(".kamp-blirmed-valg").textContent);

    // En lenke til en kamp som ikke star i runden lenger: runden skal sta
    // som for, uten en feilmelding om noe leseren ikke kan gjore noe med.
    location.hash = "#/fotball/eliteserien/neste?kamp=999&hvor=hjemme";
    setTimeout(function () { try {
      ok("en kamp som ikke finnes merker ingenting",
         document.querySelectorAll(".kamp-invitert").length === 0 &&
         document.querySelectorAll(".kamp.delbar").length === 2,
         document.querySelectorAll(".kamp-invitert").length + "/" +
         document.querySelectorAll(".kamp.delbar").length);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 18. innlogging ---------------- */

const SAK_18 = await kjor("innlogging", FELLES + `
  var saker = lagSaker(12);
  window.__konto = [];
  function svarMed(kropp, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200,
      statusText: "OK", text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/konto") === 0) {
      var inn = o && o.body ? JSON.parse(o.body) : null;
      window.__konto.push(inn ? inn.handling : "oppsett");
      if (!inn) return svarMed({ klar: true, mangler: [] });
      if (inn.handling === "kode") return svarMed({ sendt: true });
      if (inn.handling === "logg-inn") {
        if (inn.kode !== "123456") {
          return svarMed({ feil: "Koden stemmer ikke, eller den er for gammel." }, 401);
        }
        return svarMed({ token: "okt-123", epost: inn.epost,
          utloper: new Date(Date.now() + 3600000).toISOString() });
      }
      return svarMed({ feil: "Ukjent handling" }, 400);
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return svarMed(svar);
  };

  window.addEventListener("load", function () { setTimeout(function () { try {
    document.getElementById("menuBtn").click();
    var knapp = document.getElementById("kontoBtn");
    var panel = document.getElementById("kontoPanel");
    ok("menyen har en innlogging", knapp.textContent.indexOf("Logg inn") > -1, knapp.textContent);
    ok("panelet er lukket til man trykker", panel.hidden);
    // Ingenting er last bak innloggingen: feeden star ferdig for noen har
    // logget inn, og det er hele poenget med at knappen star i menyen.
    ok("appen virker utlogget", document.querySelectorAll("#feed .row").length > 0 &&
       !localStorage.getItem("sb-konto"),
       document.querySelectorAll("#feed .row").length);

    knapp.click();
    ok("trykk apner panelet", !panel.hidden && knapp.getAttribute("aria-expanded") === "true");
    // Leseren skal vite hva som lagres for hen skriver adressen, ikke etterpa.
    ok("det star hva vi lagrer",
       document.getElementById("kontoNote").textContent.indexOf("det eneste vi lagrer") > -1,
       document.getElementById("kontoNote").textContent);
    // En knapp i menyen ser ut som en port til noe. Teksten ma si at den
    // ikke er det.
    ok("og at man ikke trenger konto for a bruke appen",
       document.getElementById("kontoNote").textContent.indexOf("trenger ikke konto") > -1,
       document.getElementById("kontoNote").textContent);
    ok("oppsettet sjekkes ved apning", window.__konto.join(",") === "oppsett",
       window.__konto.join(","));

    // En adresse som apenbart ikke er en adresse stoppes for kallet: en
    // e-post som aldri kommer er verre enn en beskjed med en gang.
    document.getElementById("kontoEpost").value = "ikke-en-adresse";
    document.getElementById("kontoSend").click();
    ok("tull i adressefeltet stoppes her",
       document.getElementById("kontoSvar").textContent.indexOf("e-postadresse") > -1 &&
       window.__konto.join(",") === "oppsett",
       document.getElementById("kontoSvar").textContent + " | " + window.__konto.join(","));

    document.getElementById("kontoEpost").value = "Leser@Example.no";
    document.getElementById("kontoSend").click();
    setTimeout(function () { try {
      ok("koden bestilles", window.__konto.join(",") === "oppsett,kode", window.__konto.join(","));
      ok("kodefeltet kommer fram", !document.getElementById("kontoKode").hidden);
      ok("knappen bytter til a logge inn",
         document.getElementById("kontoSend").textContent === "Logg inn",
         document.getElementById("kontoSend").textContent);
      // Adressen maskeres ogsa i kvitteringen: den leses i en sofa med flere i.
      ok("kvitteringen navngir adressen maskert",
         document.getElementById("kontoSvar").textContent.indexOf("le•••@example.no") > -1,
         document.getElementById("kontoSvar").textContent);

      document.getElementById("kontoKode").value = "999999";
      document.getElementById("kontoSend").click();
      setTimeout(function () { try {
        ok("feil kode sier ifra",
           document.getElementById("kontoSvar").textContent.indexOf("stemmer ikke") > -1,
           document.getElementById("kontoSvar").textContent);
        ok("og logger ingen inn", !localStorage.getItem("sb-konto"));

        document.getElementById("kontoKode").value = "12 34 56";
        document.getElementById("kontoSend").click();
        setTimeout(function () { try {
          var lagret = JSON.parse(localStorage.getItem("sb-konto") || "null");
          ok("riktig kode logger inn", lagret && lagret.token === "okt-123",
             JSON.stringify(lagret));
          ok("okta har et utlopstidspunkt", lagret && !isNaN(Date.parse(lagret.utloper)),
             lagret && lagret.utloper);
          ok("menyen viser hvem du er, maskert",
             document.getElementById("kontoBtnTekst").textContent === "le•••@example.no",
             document.getElementById("kontoBtnTekst").textContent);
          // En knapp som ser ut som den gir noe den ikke gir, er verre
          // enn en knapp som sier hva den er.
          ok("og innlogget star det hva innloggingen er til",
             document.getElementById("kontoNote").textContent.indexOf("med eller uten konto") > -1,
             document.getElementById("kontoNote").textContent);

          document.getElementById("kontoUt").click();
          ok("logg ut tommer okta", !localStorage.getItem("sb-konto"));
          ok("og menyen sier logg inn igjen",
             document.getElementById("kontoBtnTekst").textContent === "Logg inn",
             document.getElementById("kontoBtnTekst").textContent);
          ferdig();
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 19. jeg blir med ---------------- */

const SAK_19 = await kjor("blir-med", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Innlogget for appen starter: okta ligger der en tidligere innlogging
  // la den.
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-1",
    epost: "leser@example.no", bruker: "u-1",
    utloper: new Date(Date.now() + 3600000).toISOString() }));

  window.__svar = [];
  window.__lagret = [];
  function svarMed(kropp, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200,
      statusText: "OK", text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      var inn = o && o.body ? JSON.parse(o.body) : null;
      window.__svar.push({ url: u, inn: inn, headere: (o && o.headers) || null });
      if (!inn) return svarMed({ svar: window.__lagret });
      if (inn.handling === "fjern") {
        window.__lagret = [];
        return svarMed({ fjernet: true });
      }
      window.__lagret = [{ kamp_id: String(inn.kampId), navn: inn.navn, hvor: inn.hvor,
        sted: inn.sted, bruker: "u-1" }];
      return svarMed({ svar: window.__lagret });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 || u.indexOf("overpass") > -1) {
      return svarMed({}, 502);
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
                    kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
                    kamper: ARETS, runde: "Runde 21" };
      if (del === "tabell") kropp.tabell = TABELL;
      return svarMed(kropp);
    }
    return svarMed(u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker);
  };
  location.hash = "#/fotball/eliteserien/neste";

  window.addEventListener("load", function () { setTimeout(function () { try {
    // Ti kamper skal ikke bli ti kall.
    var lesekall = window.__svar.filter(function (k) { return !k.inn; });
    ok("hele runden hentes i ett kall", lesekall.length === 1, lesekall.length);
    ok("og med begge kampene", lesekall[0].url.indexOf("kamper=3%2C4") > -1 ||
       lesekall[0].url.indexOf("kamper=3,4") > -1, lesekall[0].url);
    ok("ingen er med enda", !document.querySelector(".kamp-blirmed"));

    var rad = document.querySelectorAll(".kamp.delbar")[0];
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var knapp = panel.querySelector(".kamp-blimed");
    ok("innlogget star knappen der", !!knapp && knapp.textContent === "Jeg blir med",
       knapp ? knapp.textContent : "ingen knapp");
    // Lista leses uten konto, sa navnet leses ogsa av andre enn
    // vennegruppa. Det skal sta der navnet skrives.
    ok("det star at navnet er synlig for andre",
       panel.querySelector(".kamp-blirmed-valg .kamp-note").textContent
         .indexOf("synlig for alle som åpner kampen") > -1,
       panel.querySelector(".kamp-blirmed-valg .kamp-note").textContent);

    // Uten navn blir lista uleselig for de andre.
    knapp.click();
    ok("uten navn sier den ifra",
       panel.querySelector(".kamp-blirmed-valg .kamp-svar").textContent.indexOf("navnet") > -1,
       panel.querySelector(".kamp-blirmed-valg .kamp-svar").textContent);
    ok("og ingenting er sendt", window.__svar.filter(function (k) { return !!k.inn; }).length === 0);

    panel.querySelectorAll(".hvor-valg")[1].click();   // pa pub
    panel.querySelector(".kamp-pub").value = "Pub X";
    panel.querySelector(".kamp-navn").value = " Ola ";
    knapp.click();
    setTimeout(function () { try {
      var skriv = window.__svar.filter(function (k) { return !!k.inn; });
      ok("svaret sendes med okta", skriv.length === 1 && skriv[0].inn.token === "okt-1",
         JSON.stringify(skriv.map(function (k) { return k.inn; })));
      ok("med kamp, navn og sted",
         skriv[0].inn.kampId === 3 && skriv[0].inn.navn === "Ola" &&
         skriv[0].inn.hvor === "pub" && skriv[0].inn.sted === "Pub X",
         JSON.stringify(skriv[0].inn));
      // Navnet skal ikke skrives pa nytt for hver kamp.
      ok("navnet huskes til neste gang",
         (JSON.parse(localStorage.getItem("sb-visning")) || {}).svarnavn === "Ola",
         localStorage.getItem("sb-visning"));

      var linje = rad.querySelector(".kamp-blirmed");
      ok("lista star under kampen", !!linje && linje.textContent.indexOf("Ola blir med") > -1,
         linje ? linje.textContent : "ingen linje");
      // Linja horer til kampen, ikke til panelet: den skal sta over det.
      ok("og over panelet, ikke under",
         linje.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING);
      ok("bare pa den kampen man svarte pa",
         document.querySelectorAll(".kamp-blirmed").length === 1,
         document.querySelectorAll(".kamp-blirmed").length);
      // To «jeg blir med» er en person, ikke to: knappen blir en angreknapp.
      ok("knappen blir en angreknapp",
         knapp.textContent === "Jeg blir ikke med likevel", knapp.textContent);
      ok("og navnefeltet er ute av veien", panel.querySelector(".kamp-navn").hidden);

      knapp.click();
      setTimeout(function () { try {
        var fjern = window.__svar.filter(function (k) { return k.inn && k.inn.handling === "fjern"; });
        ok("angre sender en fjerning med okta",
           fjern.length === 1 && fjern[0].inn.token === "okt-1" && fjern[0].inn.kampId === 3,
           JSON.stringify(fjern.map(function (k) { return k.inn; })));
        ok("og lista under kampen er borte", !rad.querySelector(".kamp-blirmed"));
        ok("knappen er tilbake til a bli med",
           knapp.textContent === "Jeg blir med", knapp.textContent);
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- rapport ---------------- */

const alle = [...SAK_1, ...SAK_2, ...SAK_3, ...SAK_4, ...SAK_5, ...SAK_6, ...SAK_7, ...SAK_8, ...SAK_9, ...SAK_10, ...SAK_11, ...SAK_12, ...SAK_13, ...SAK_14, ...SAK_15, ...SAK_16, ...SAK_17, ...SAK_18, ...SAK_19];
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
