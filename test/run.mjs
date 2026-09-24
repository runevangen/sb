#!/usr/bin/env node
// Regresjonstester for Sportsbibelen-appen.
//
//   node test/run.mjs
//
// Ingen avhengigheter. Testene lastes inn i en kopi av index.html med et
// mocket window.fetch, kjores i headless Chromium og rapporterer via
// exit-kode. Sett CHROME hvis nettleseren ligger et annet sted.
//
// Scenene kjores flere om gangen — hver er sin egen nettleserprosess med
// sin egen tjener, sa de kan ikke se hverandre. SAMTIDIG styrer hvor
// mange; SAMTIDIG=1 kjorer dem etter tur, som for.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

const kjorProsess = promisify(execFile);
import { tmpdir, availableParallelism } from "node:os";
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
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
};

// En tjener per scene, med scenens egen mappe foran repoet. Da kan en
// scene legge sin egen utgave av en modul der — slik kanaler.js fylles i
// kanal-testen — uten at noen annen scene som kjorer samtidig ser den.
function startTjener(mappe) {
  const tjener = createServer((req, res) => {
    const sti = decodeURIComponent(req.url.split("?")[0]);
    // Testsiden og scenens egne filer ligger i mappa; alt annet hentes
    // fra repoet.
    const rel = sti.replace(/^\/+/, "");
    const iMappa = join(mappe, rel);
    const fil = existsSync(iMappa) ? iMappa : join(root, rel);
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
      if (n.classList.contains("ad-ledig")) {
        // Spokene barer de samme fasong-klassene som den ledige plassen,
        // sa fasongen alene sier ikke hva kortet er.
        var slag = n.classList.contains("ad-spok") ? "spok" : "ledig";
        if (n.classList.contains("ad-ledig-portrett")) return slag + "-portrett";
        if (n.classList.contains("ad-ledig-bred")) return slag + "-bred";
        if (n.classList.contains("ad-ledig-hoy")) return slag + "-hoy";
      }
      if (n.classList.contains("vis-flere")) return "mer";
      return "?";
    }).join(" ");
  }
  window.plausible = function () {};

  // Fra basens form til tjenestens form. /api/svar tolker radene fra
  // PostgREST for den svarer, sa svaret barer kampId — ikke kamp_id.
  // Stubbene holdt lenge pa basens form, og da testet vi noe tjenesten
  // aldri sender: feilen som gjorde «blir med»-lista usynlig i prod lot
  // seg ikke se herfra. En stubb som er enig med feilen din beviser
  // ingenting.
  function somTjenesten(rader) {
    return (rader || []).map(function (r) {
      return { kampId: String(r.kamp_id == null ? r.kampId : r.kamp_id),
        navn: r.navn, hvor: r.hvor, sted: r.sted, bruker: r.bruker };
    });
  }

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

// Hvor mange scener som kjorer samtidig. Hver scene er en egen
// Chromium-prosess, og det er oppstarten av den som koster — ikke den
// virtuelle tida, som hopper over all venting. Fire til seks om gangen
// gir nesten like mange ganger raskere pa en maskin med kjerner nok;
// GitHub-runneren har fire.
const SAMTIDIG = Number(process.env.SAMTIDIG) || Math.max(2, Math.min(6, availableParallelism()));
let opptatt = 0;
const koen = [];
function ledigPlass() {
  if (opptatt < SAMTIDIG) { opptatt += 1; return Promise.resolve(); }
  return new Promise((ok) => koen.push(ok));
}
function frigiPlass() {
  const neste = koen.shift();
  if (neste) neste(); else opptatt -= 1;
}

// storrelse settes der vindushoyden er en del av det som testes. Standard
// er nettleserens eget vindu; hoydetesten trenger et telefonformat for at
// taket pa kortet i det hele tatt skal binde.
//
// filer er scenens egne utgaver av moduler, {"kanaler.js": innhold}, og
// serveres bare til denne scenen.
//
// Kallet returnerer med en gang; selve kjoringen venter pa ledig plass,
// og rapporten nederst venter pa alle. Ingenting mellom to scener kan
// derfor regne med at den forrige er ferdig — det en scene trenger,
// sendes inn.
async function kjor(navn, skript, storrelse, kilde, filer) {
  await ledigPlass();
  try {
    return await kjorScene(navn, skript, storrelse, kilde, filer || {});
  } finally {
    frigiPlass();
  }
}

async function kjorScene(navn, skript, storrelse, kilde, filer) {
  const mappe = join(tmp, navn);
  mkdirSync(mappe, { recursive: true });
  const fil = join(mappe, navn + ".html");
  // Standard er appen selv; admin-portalen er en egen side og sendes inn.
  let side = kilde || app;
  // Fontene fra Google hentes pa nytt i hver ferske nettleserprofil, og
  // det er ekte nettverk: virtuell tid star stille mens de lastes, sa de
  // kostet mer enn selve testen. Ingen test ser pa fonter. Lenkene tas ut
  // av testkopien; reservefontene i app.css gjelder.
  side = side.replace(/^[ \t]*<link[^>]*fonts\.g(oogleapis|static)\.com[^>]*>[ \t]*\n?/gim, "");
  // Skriptet legges etter <meta charset>, sa tegnsettet star forst i fila
  // ogsa for den som leser den uten headeren.
  const meta = side.match(/<meta charset="utf-8">/i);
  const merke = meta ? meta[0] : "<head>";
  writeFileSync(fil, side.replace(merke, merke + "\n<script>" + HARNESS + skript + "<\/script>"));
  Object.keys(filer).forEach((rel) => writeFileSync(join(mappe, rel), filer[rel]));

  const tjener = await startTjener(mappe);
  try {
    return await iNettleseren(navn, storrelse, tjener.address().port);
  } finally {
    tjener.close();
  }
}

async function iNettleseren(navn, storrelse, PORT) {
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
  // En kategori som heter det samme som en liga, og en som ikke gjor det:
  // den forste skal fa snarveier til tabell og kamper, den andre ikke.
  var KATEGORIER = [
    { id: 7, name: "Fotball", count: 412 },
    { id: 8, name: "Eliteserien", count: 203 },
    { id: 9, name: "Kommentar", count: 31 }
  ];
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

  // Den over er entitetskodet, og textContent dekoder den én gang — det har
  // alltid virket. Denne er en **levende** tag, slik den ser ut om noen
  // skriver den i WordPress framfor a la editoren kode den. En slik gikk
  // rett inn i et <div> i stripHtml(), og et <div> parser ikke inert: det
  // aktiverer det det leser, ogsa i et element som aldri settes inn i
  // dokumentet. Vi kastet innholdet rett etterpa og beholdt bare teksten,
  // sa det som ble aktivert hadde alt kjort nar vi trodde vi var ferdige.
  //
  // Prøven er et egendefinert element og ikke <img src=… onerror=…>, som er
  // den ekte trusselen. Grunnen er malbarhet: en bildelasting fyrer fra en
  // dekodetrad, og under --virtual-time-budget rekker den ikke alltid a
  // fyre i det hele tatt — en test som noen ganger sier «ingen kode kjorte»
  // fordi bildet aldri ble lest, beviser ingenting. Et egendefinert element
  // bygges **synkront** av parseren, og det er samme egenskap som avgjor
  // begge: <template>-innhold hoerer til et dokument uten nettleserkontekst,
  // sa der skjer ingen av delene.
  window.__bygd = [];
  customElements.define("x-pwn", class extends HTMLElement {
    constructor() { super(); window.__bygd.push(this.getAttribute("merke") || "?"); }
  });
  saker[1].title.rendered = '<x-pwn merke="tittel"></x-pwn> Andre sak';

  // Kontrollen er det som gjor assertionen under verdt noe: samme HTML i
  // et <div>, slik stripHtml() gjorde det for. Bygges den ikke her, sier
  // ikke testen noe om <template> heller — da er det proven som er daarlig,
  // ikke koden som er trygg.
  var kontroll = document.createElement("div");
  kontroll.innerHTML = '<x-pwn merke="kontroll"></x-pwn>';
  ` + mockFetch("saker") + `
  window.addEventListener("load", function () { setTimeout(function () {
    var topp = document.querySelector(".hero-title");
    ok("tittel-XSS kjorer ikke kode", !document.body.hasAttribute("pwned"));
    ok("kontrollen bygges, sa vektoren er ekte i denne nettleseren",
       window.__bygd.indexOf("kontroll") > -1, window.__bygd.join(","));
    ok("en levende tag i tittelen aktiveres ikke",
       window.__bygd.indexOf("tittel") === -1, window.__bygd.join(","));
    ok("og ingenting av den star igjen i dokumentet",
       document.querySelectorAll("x-pwn").length === 0,
       document.querySelectorAll("x-pwn").length);
    // Fiksen skal ikke endre det leseren ser: teksten er den samme.
    ok("tittelen vises fortsatt som tekst",
       document.body.textContent.indexOf("Andre sak") > -1);
    ok("tittel-XSS vises som tekst", topp.textContent.indexOf("<img") === 0, topp.textContent.slice(0, 24));

    var tid = document.querySelector(".hero-overlay time");
    ok("tidsstempel bruker date_gmt", tid.textContent === "2t siden", tid.textContent);

    ok("annonse etter hver fjerde sak",
       sekvens() === "topp sak sak sak ledig-portrett sak sak sak sak ledig-bred sak sak sak sak mer",
       sekvens());

    // Den forste plassen selger plassen. Sju spoker sto forst i rotasjonen
    // til 21. september 2026, og da var det forste en leser motte en vits —
    // pa den ene plassen som skal overbevise noen om a kjope den (#25).
    var forste = document.querySelector(".ad-ledig");
    ok("den forste annonseplassen er ingen spok",
       !forste.classList.contains("ad-spok"), forste.className);
    ok("og den sier at plassen er ledig, bade for oyet og for skjermleseren",
       forste.querySelector(".ad-label").textContent === "Ledig plass" &&
       forste.getAttribute("aria-label") === "Ledig annonseplass" &&
       forste.textContent.indexOf("Reklame") === -1,
       forste.querySelector(".ad-label").textContent + " / " +
       forste.getAttribute("aria-label"));
    // Bildet tar plassen sin for det er lastet: uten mal vokser annonsen
    // og dytter saken man holder pa a lese nedover.
    var bilde = forste.querySelector(".ad-ledig-bilde");
    ok("bildet tar plassen sin for det er lastet",
       bilde.getAttribute("width") === "400" && bilde.getAttribute("height") === "400",
       bilde.getAttribute("width") + "x" + bilde.getAttribute("height"));
    ok("og det beskriver seg selv",
       (bilde.getAttribute("alt") || "").trim().length > 0,
       bilde.getAttribute("alt"));

    // Intensjonen er at feeden ikke skal avsluttes med reklame. "Vis flere"
    // er en knapp, ikke innhold, sa den ser vi bort fra her.
    var innhold = sekvens().split(" ").filter(function (n) { return n !== "mer"; });
    ok("ingen annonse nederst",
       innhold[innhold.length - 1] === "sak", innhold[innhold.length - 1]);
    ferdig();
  }, 900); });
`);

/* ---------------- 1b. de tre formene pa den ledige plassen ---------------- */

// Annonseplassene kommer etter hver fjerde sak, sa to av dem kan sta pa
// samme skjerm. Tre like bokser leses som stoy; tre ulike leses som tre
// plasser. Testen blar gjennom feeden til alle tre har vaert innom.
const SAK_1B = kjor("annonse-varianter", FELLES + `
  // Hver side gir tolv nye saker, sa «Vis flere» kan trykkes sa mange
  // ganger vi trenger for a komme forbi alle annonseplassene.
  var side = 0;
  window.fetch = function (u) {
    u = String(u);
    var svar;
    if (u.indexOf("/wp-api/categories") === 0) svar = KATEGORIER;
    else if (u.indexOf("_fields=") > -1) svar = [];
    else {
      side += 1;
      svar = lagSaker(12).map(function (p, i) {
        p.id = side * 100 + i; p.slug = "s" + side + "-" + i; return p;
      });
    }
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };

  function blaVidere(igjen, ferdigMed) {
    var knapp = document.querySelector(".vis-flere");
    if (!igjen || !knapp) { ferdigMed(); return; }
    knapp.click();
    setTimeout(function () { blaVidere(igjen - 1, ferdigMed); }, 250);
  }

  window.addEventListener("load", function () { setTimeout(function () {
    blaVidere(4, function () { try {
      // Spokene barer de samme fasong-klassene, sa uten :not(.ad-spok)
      // kan denne fa en spok i fanget og passere av feil grunn.
      var vaar = function (f) {
        return document.querySelector(".ad-ledig:not(.ad-spok).ad-ledig-" + f);
      };
      var former = ["portrett", "bred", "hoy"];
      var funnet = former.filter(function (f) { return !!vaar(f); });
      ok("alle tre formene dukker opp nar man blar",
         funnet.length === 3, funnet.join(",") + " av " + former.join(","));

      // Formene skal vaere ulike fasonger, ikke tre like bokser: de tre
      // bruker tre ulike bildefiler.
      var bilder = former.map(function (f) {
        var b = vaar(f) && vaar(f).querySelector(".ad-ledig-bilde");
        return b ? b.getAttribute("src") : "";
      });
      ok("hver form har sitt eget bilde",
         bilder[0] !== bilder[1] && bilder[1] !== bilder[2] && bilder[0] !== bilder[2],
         bilder.join(" | "));

      // Det som ma stemme pa alle tre, uansett fasong. Spokene er egne
      // kort med sitt eget merke, og telles for seg under.
      var alle = document.querySelectorAll(".ad-ledig:not(.ad-spok)");
      var feil = [];
      Array.prototype.forEach.call(alle, function (a) {
        var bilde = a.querySelector(".ad-ledig-bilde");
        var kall = a.querySelector(".ad-cta");
        if (a.getAttribute("aria-label") !== "Ledig annonseplass") feil.push("aria");
        if (a.textContent.indexOf("Reklame") > -1) feil.push("reklame");
        if (a.querySelector(".ad-label").textContent !== "Ledig plass") feil.push("merke");
        if (!bilde || bilde.getAttribute("alt") !== "Prem") feil.push("alt");
        if (!bilde.getAttribute("src")) feil.push("src");
        // Uten bredde og hoyde pa taggen vokser annonsen nar bildet lastes,
        // og dytter saken man holder pa a lese nedover.
        if (!bilde.getAttribute("width") || !bilde.getAttribute("height")) feil.push("mal");
        if (bilde.getAttribute("loading") !== "lazy") feil.push("lazy");
        if (!kall || kall.tagName !== "A") feil.push("lenke");
        else if (kall.href.indexOf("https://m.me/") !== 0) feil.push("m.me");
        else if (kall.target !== "_blank" || kall.rel.indexOf("noopener") === -1) feil.push("rel");
      });
      ok("og alle tre er merket, bemannet og lenket likt",
         alle.length >= 3 && feil.length === 0,
         alle.length + " plasser, feil: " + (feil.join(",") || "ingen"));

      // Det hoye kortet legger teksten oppa bildet. Da ma den bruke
      // --on-overlay: gradienten er mork i begge temaer, sa temaets egen
      // tekstfarge ville forsvunnet i den pa lyst tema.
      var hoy = document.querySelector(".ad-ledig-hoy .ad-headline");
      var over = document.querySelector(".ad-ledig-overlegg");
      ok("teksten i det hoye kortet ligger oppa en gradient",
         !!over && getComputedStyle(over).backgroundImage.indexOf("gradient") > -1,
         over ? getComputedStyle(over).backgroundImage.slice(0, 40) : "ingen overlegg");
      ok("og den er lys nok til a leses mot den",
         getComputedStyle(hoy).color === "rgb(255, 255, 255)",
         getComputedStyle(hoy).color);

      // **Ingen oppdiktet annonsor i feeden.** NORDBANE, PADELHUSET,
      // SPRINTA og TRIBUNE sto her til 16. september 2026, merket
      // «Reklame» og fullstendig oppfunnet (#25). En slik rad er en
      // pastand om et samarbeid som ikke finnes.
      //
      // Testen sjekker regelen, ikke de fire navnene: hver plass i feeden
      // ma si enten «Ledig plass» eller «Spok». Et navn hadde gatt an a
      // bytte uten a bryte noe.
      var plasser = document.querySelectorAll(
        "#feed > .ad-banner, #feed > .ad-stripe, #feed > .ad-ledig");
      var merkeFeil = [];
      Array.prototype.forEach.call(plasser, function (a) {
        var e = a.querySelector(".ad-label");
        var m = e ? e.textContent : "";
        if (m !== "Ledig plass" && m !== "Spøk") merkeFeil.push(m || "uten merke");
      });
      ok("ingen plass i feeden pastar a vaere reklame fra noen",
         plasser.length >= 4 && merkeFeil.length === 0,
         plasser.length + " plasser, merker: " + (merkeFeil.join(",") || "bare vare egne"));

      // De to tekstformatene ble ikke slettet da de oppdiktede gikk ut.
      // De er fasongene en ekte annonsor kan kjope, og en fasong ingen
      // bruker er en fasong ingen ser — sa na selger de seg selv.
      var banner = document.querySelector("#feed > .ad-banner");
      var stripe = document.querySelector("#feed > .ad-stripe");
      ok("banneret og stripa star fortsatt i feeden", !!banner && !!stripe,
         String(!!banner) + " " + String(!!stripe));
      // Merkingen er data, ikke en if inne i tegningen: bade bildekortet
      // og de to tekstformatene slar opp i EGNE_MERKER pa merke.
      var tekstFeil = [];
      [banner, stripe].forEach(function (a) {
        if (!a) { tekstFeil.push("mangler"); return; }
        if (a.getAttribute("aria-label") !== "Ledig annonseplass") tekstFeil.push("aria");
        if (a.textContent.indexOf("Reklame") > -1) tekstFeil.push("reklame");
      });
      // Bannerets flate er varen: der ekte annonsemateriell skal sta, star
      // det hva plassen er til. Stripa navngir ingen annonsor — det finnes
      // ingen a navngi.
      var flate = banner && banner.querySelector(".ad-creative");
      ok("bannerets flate sier hva plassen er til",
         !!flate && flate.textContent === "DIN ANNONSE HER",
         flate ? flate.textContent : "ingen flate");
      ok("stripa navngir ingen annonsor",
         !!stripe && !stripe.querySelector(".ad-brand"),
         stripe && stripe.querySelector(".ad-brand")
           ? stripe.querySelector(".ad-brand").textContent : "ingen");
      // Var egen plass far en ekte knapp, ogsa i tekstformatene. En span
      // som ser ut som en knapp og ikke gar noe sted, er verre enn tekst.
      var bk = banner && banner.querySelector(".ad-cta");
      if (!bk || bk.tagName !== "A") tekstFeil.push("lenke");
      else if (bk.href.indexOf("https://m.me/") !== 0) tekstFeil.push("m.me");
      else if (bk.target !== "_blank" || bk.rel.indexOf("noopener") === -1) tekstFeil.push("rel");
      ok("og tekstplassene er merket og lenket som bildekortene",
         tekstFeil.length === 0, tekstFeil.join(",") || "ingen");

      // Spokene. Ullevalseter er et ekte sted, og en tulleannonse merket
      // «Reklame» ville pastatt at de har kjopt plassen — nøyaktig lognen
      // appen ellers er noye pa a ikke fortelle. Vitsen blir ikke darligere
      // av at det star hva den er.
      // Sju spoker sto her til 21. september 2026 (#25). Reglene under blir
      // staende: lokka er tom na, og beskytter vitsen igjen den dagen en
      // rad far merke "spok". Et krav om at det FINNES en spok ville
      // vaert et krav om at dataene aldri endres.
      var spok = document.querySelectorAll(".ad-spok");
      ok("ingen spok i feeden", spok.length === 0, spok.length);
      var spokFeil = [];
      Array.prototype.forEach.call(spok, function (a) {
        if (a.querySelector(".ad-label").textContent !== "Spøk") spokFeil.push("merke");
        if (a.getAttribute("aria-label") !== "Spøk, ikke en ekte annonse") spokFeil.push("aria");
        // Det viktigste: den skal aldri kalle seg reklame, verken for oyet
        // eller for skjermlesere.
        if (a.textContent.indexOf("Reklame") > -1) spokFeil.push("reklame");
        if ((a.getAttribute("aria-label") || "").indexOf("Reklame") > -1) spokFeil.push("aria-reklame");
        // Og den skal ikke pasta at plassen er ledig: det er to ulike ting.
        if (a.textContent.indexOf("Ledig plass") > -1) spokFeil.push("ledig");
        // Spokene er hovedannonsene na, sa knappene deres ma vaere like
        // trygge som de ledige plassenes: ekte lenke, ny fane, noopener.
        var k = a.querySelector(".ad-cta");
        if (!k || k.tagName !== "A") spokFeil.push("lenke");
        else if (k.href.indexOf("https://m.me/") !== 0) spokFeil.push("m.me");
        else if (k.target !== "_blank" || k.rel.indexOf("noopener") === -1) spokFeil.push("rel");
        // Oppsett og poeng pa hver sin linje — det er det som gjor en vits
        // til en vits framfor en opplysning.
        if (!a.querySelector(".ad-sub")) spokFeil.push("poeng");
      });
      ok("en spok sier at den er en spok, aldri at den er reklame",
         spokFeil.length === 0, spokFeil.join(",") || "ingen");

      // alt-teksten ligger pa annonsen, ikke i koden. Den sto som «Prem»
      // sa lenge alle bildene var av ham, og ble feil i det oyeblikket et
      // treskilt kom inn i lista: en skjermleser som sier «Prem» om et
      // skilt er verre enn ingenting.
      var altFeil = [];
      Array.prototype.forEach.call(document.querySelectorAll(".ad-ledig-bilde"),
        function (b) {
          var a = b.getAttribute("alt");
          if (!a) { altFeil.push("tom"); return; }
          // Et skilt skal ikke leses opp som en person.
          if (b.getAttribute("src").indexOf("skilt") > -1 &&
              a.toLowerCase().indexOf("skilt") === -1) {
            altFeil.push("skiltet heter «" + a + "»");
          }
        });
      ok("hvert bilde beskriver seg selv, ogsa de som ikke er av Prem",
         altFeil.length === 0, altFeil.join(", ") || "ingen");

      // En vits er delt i oppsett og poeng. I én setning er den en
      // opplysning. Star det ingen spok, er det ingenting a male — og det
      // er tilstanden na.
      var utenPoeng = [];
      Array.prototype.forEach.call(spok, function (a) {
        if (!a.querySelector(".ad-sub")) utenPoeng.push(a.textContent.slice(0, 40));
      });
      ok("en vits star med oppsett og poeng pa hver sin linje",
         utenPoeng.length === 0, utenPoeng.join(", ") || "ingen spok a male");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } });
  }, 700); });
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

    // Telefonrammen pa brede skjermer (#148). Maalt i CSS-en framfor pa
    // skjermen, og det er ikke latskap: window-size-flagget binder ikke
    // lokalt og pa CI — se kommentaren i tabell-scenen lenger nede — sa en
    // test som satte vinduet til 1200 px ville malt hvilken Chromium som
    // kjorte. Her leses regelen ut av arket: at den finnes, hva den gjor,
    // og — viktigst — at den IKKE rorer bredden eller flex-oppsettet, som
    // er det rulling, meny og tabbar henger pa.
    var bred = null;
    Array.prototype.forEach.call(document.styleSheets, function (ark) {
      var regler;
      try { regler = ark.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(regler || [], function (r) {
        if (r.type === CSSRule.MEDIA_RULE &&
            String(r.conditionText || r.media.mediaText).indexOf("min-width: 900px") > -1) {
          bred = r;
        }
      });
    });
    ok("det finnes en regel for brede skjermer", !!bred);

    var telefonRegel = null;
    if (bred) {
      Array.prototype.forEach.call(bred.cssRules, function (r) {
        if (r.selectorText === ".phone") telefonRegel = r;
      });
    }
    var st = telefonRegel && telefonRegel.style;
    // CSSOM normaliserer: «0» leses tilbake som «0px». Testen var rod pa
    // nettopp det for den ble rettet — og da var det pastanden som tok
    // feil, ikke regelen.
    function nullVerdi(v) { return v === "0" || v === "0px"; }
    ok("og den tar bort kanten og hjornene",
       !!st && nullVerdi(st.getPropertyValue("border")) &&
       nullVerdi(st.getPropertyValue("border-radius")),
       st ? st.cssText : "fant ingen .phone-regel");
    ok("og luften rundt",
       !!bred && Array.prototype.some.call(bred.cssRules, function (r) {
         return r.selectorText === "body" && nullVerdi(r.style.getPropertyValue("padding"));
       }),
       bred ? Array.prototype.map.call(bred.cssRules, function (r) {
         return r.selectorText; }).join(", ") : "");
    // Bredden og flex-oppsettet er arkitektur, ikke pynt: rores de, ruller
    // ikke feeden lenger, og menyen dekker skjermen framfor appen.
    ok("men lar bredden og oppsettet staa",
       !!st && !st.getPropertyValue("width") && !st.getPropertyValue("display") &&
       !st.getPropertyValue("overflow") && !st.getPropertyValue("flex-direction"),
       st ? st.cssText : "");

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

const SAK_4 = kjor("ruting", FELLES + `
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
      // Saker som ekte lenker (#146). Ruten fantes fra for; det som manglet
      // var en <a> som bar den.
      var helt = document.querySelector(".hero");
      var rad1 = document.querySelector(".row");
      ok("toppsaken er en lenke, ikke en knapp",
         helt.tagName === "A" && helt.getAttribute("href").indexOf("#/sak/") === 0,
         helt.tagName + " " + helt.getAttribute("href"));
      ok("og radene er det ogsa",
         rad1.tagName === "A" && rad1.getAttribute("href").indexOf("#/sak/") === 0,
         rad1.tagName + " " + rad1.getAttribute("href"));

      // Det som gjor lenka verdt noe: Ctrl/Cmd/Shift/midtklikk skal ga til
      // nettleseren. Fanger vi dem, har vi gitt lenka med den ene handa og
      // tatt «apne i ny fane» med den andre.
      var ctrl = new MouseEvent("click",
        { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
      rad1.dispatchEvent(ctrl);
      ok("ctrl-klikk overlates til nettleseren", !ctrl.defaultPrevented);
      var midt = new MouseEvent("click",
        { bubbles: true, cancelable: true, button: 1 });
      rad1.dispatchEvent(midt);
      ok("og midtklikk likesa", !midt.defaultPrevented);
      // Og artikkelen skal IKKE ha apnet seg av de to.
      ok("ingen av dem apnet artikkelen i appen",
         document.getElementById("detailWrap").className.indexOf("open") === -1,
         document.getElementById("detailWrap").className);

      var vanlig = new MouseEvent("click",
        { bubbles: true, cancelable: true, button: 0 });
      helt.dispatchEvent(vanlig);
      ok("men et vanlig venstreklikk fanges av appen", vanlig.defaultPrevented);

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

        // Naar en artikkel staar apen: er menyknappen i det hele tatt
        // naabar? Issue #148 ba om at «Del appen» skulle bli
        // kontekstsensitiv naar en sak er apen — men .detail-wrap er
        // fixed og dekker hele skjermen, saa knappen kan vaere skjult
        // bak den. MAALT, ikke resonnert: en kode ingen kan naa er en
        // kode som raatner.
        var mKnapp = document.getElementById("menuBtn");
        var r = mKnapp.getBoundingClientRect();
        var paToppen = document.elementFromPoint(
          Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        var naabar = mKnapp === paToppen || mKnapp.contains(paToppen);
        ok("menyknappen er dekket mens en artikkel staar apen",
           !naabar, paToppen ? (paToppen.id || paToppen.className || paToppen.tagName) : "ingenting");

        // Delingsknappene i den apne saken (#146). To, og de sender ikke
        // samme adresse — det er hele grunnen til at de er to.
        var delKnapper = document.querySelectorAll(".del-knapp");
        ok("saken har to delingsknapper", delKnapper.length === 2, delKnapper.length);
        // Null-sikkert hele veien. Mangler en knapp, skal disse FEILE —
        // ikke kaste. En test som kaster velter scenen, og da forsvinner
        // alle paastandene etter den ogsa; sabotasjen jeg brukte for aa
        // proeve dem gjorde nettopp det, og sa ut som «ingenting falt».
        var navn = Array.prototype.map.call(delKnapper, function (b) {
          var n = b.querySelector(".del-navn");
          return n ? n.textContent : ""; });
        ok("og de heter ikke det samme",
           navn.length === 2 && navn[0] !== navn[1] &&
           navn.indexOf("Del saken") > -1 && navn.indexOf("Del i appen") > -1,
           navn.join(" / ") || "ingen knapper");
        // Folgen staar i knappen. To knapper som bare het «Del» ville
        // vaert det ene tilfellet regelen forbyr.
        var folger = Array.prototype.map.call(delKnapper, function (b) {
          var f = b.querySelector(".del-folge");
          return f ? f.textContent : ""; });
        ok("og hver av dem sier hvor lenka forer",
           folger.length === 2 && folger[0].length > 0 && folger[1].length > 0 &&
           folger[0] !== folger[1],
           folger.join(" / ") || "ingen knapper");

        // Kvitteringen skal staa I artikkelen. #actionNote ligger inne i
        // menypanelet, som er lukket her — en beskjed leseren aldri ville
        // sett. Maalt ved aa stenge begge delingsveiene og trykke.
        navigator.share = undefined;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: function () { return Promise.reject(new Error("nei")); } }
        });
        if (delKnapper[0]) delKnapper[0].click();

        setTimeout(function () { try {
          var notat = document.querySelector(".del-notat");
          ok("kvitteringen staar i artikkelen, ikke i menyen",
             !!notat && !notat.hidden && notat.textContent.indexOf("Kopier lenken selv") === 0,
             notat ? (notat.hidden ? "skjult" : notat.textContent.slice(0, 40)) : "fant den ikke");
          var lenka = notat && notat.querySelector("a");
          ok("og lenka der er en ekte <a>, som i menyen",
             !!lenka && lenka.tagName === "A" && lenka.getAttribute("href").length > 0,
             lenka ? lenka.getAttribute("href") : "ingen lenke");
          // «Del saken» skal sende nettstedets adresse — den ene som kan
          // bli et kort med bilde der den limes inn.
          ok("«Del saken» sender adressen pa nettstedet",
             !!lenka && lenka.getAttribute("href").indexOf("sportsbibelen.no") > -1,
             lenka ? lenka.getAttribute("href") : "");
        } catch (e) { ok("ingen unntak i delingsraden", false, e.message); } }, 200);

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

const SAK_5 = kjor("visning", FELLES + `
  var saker = lagSaker(12);
  ` + mockFetch("saker") + `
  function aktiv(id) { return document.getElementById(id).getAttribute("aria-current") === "true"; }
  // Statistikkroket star her fordi denne bolken kjorer for app.js lastes.
  var sporet = [];
  window.plausible = function (navn) { sporet.push(navn); };

  window.addEventListener("load", function () { setTimeout(function () {
    document.getElementById("menuBtn").click();
    setTimeout(function () {
      // Snarveiene: emnet til venstre, tabell og kamper til hoyre — men
      // bare pa de emnene som faktisk er en liga vi har data for.
      var rader = document.querySelectorAll(".menu-rad");
      var elite = Array.prototype.find.call(rader, function (r) {
        var b = r.querySelector(".menu-item");
        return b && b.textContent.indexOf("Eliteserien") === 0;
      });
      var kommentar = Array.prototype.find.call(rader, function (r) {
        var b = r.querySelector(".menu-item");
        return b && b.textContent.indexOf("Kommentar") === 0;
      });
      ok("kategorien som er en liga far to snarveier",
         !!elite && elite.querySelectorAll(".snarvei-knapp").length === 2,
         elite && elite.querySelectorAll(".snarvei-knapp").length);
      ok("og de heter det samme som fanene",
         !!elite && Array.prototype.map.call(elite.querySelectorAll(".snarvei-knapp"),
           function (b) { return b.textContent; }).join("|") === "Tabell|Kamper",
         elite && elite.textContent);
      ok("kategorien uten liga far ingen",
         !!kommentar && kommentar.querySelectorAll(".snarvei-knapp").length === 0);
      var antallCelle = kommentar && kommentar.querySelector(".count");
      ok("og beholder saksantallet sitt",
         !!antallCelle && antallCelle.textContent === "31",
         kommentar && kommentar.textContent);
      // En knapp i en knapp finnes ikke: snarveiene er soesken til
      // hovedknappen, ikke barn av den.
      ok("ingen knapp ligger inni en annen knapp i menyen",
         document.querySelectorAll("#menuPanel button button").length === 0,
         document.querySelectorAll("#menuPanel button button").length);

      // Lenka til portalen heter det samme som sida den apner. «Hvem viser
      // kampen (admin)» beskrev en seksjon av portalen, ikke portalen.
      var adminLenke = Array.prototype.filter.call(
        document.querySelectorAll(".admin-lenke"),
        function (a) { return a.getAttribute("href") === "/admin.html"; })[0];
      ok("lenka til portalen heter Admin",
         !!adminLenke && adminLenke.textContent.trim() === "Admin",
         adminLenke && adminLenke.textContent);
      // Personvern star forst: den gjelder alle som apner menyen.
      ok("og personvern star forst av de to",
         document.querySelector(".admin-lenke").getAttribute("href") === "/personvern.html",
         document.querySelector(".admin-lenke").getAttribute("href"));

      // **Seksten piksler.** Safari pa iPhone zoomer inn av seg selv nar du
      // fokuserer et felt med mindre skrift, og etter den zoomen er sida
      // pannbar sidelengs. Meldt i portalen 18. september; appen hadde det
      // samme — PIN-feltet pa 13 px og sokefeltet pa 13,5.
      var smaa = [];
      Array.prototype.forEach.call(
        document.querySelectorAll("input, select, textarea"), function (e) {
          if (e.type === "checkbox" || e.type === "radio") return;
          var px = parseFloat(getComputedStyle(e).fontSize);
          if (!(px >= 16)) smaa.push((e.id || e.className || e.tagName) + " " + px + "px");
        });
      ok("ingen felt i appen er sa sma at iPhone zoomer inn i dem",
         smaa.length === 0, smaa.join(", "));

      // Footeren tok 38 % av menyen pa en telefon med stor skrift, og da
      // sto det siste emnet halvt under kanten. Malt med A+ og med
      // «Installer appen» synlig, som er det verste tilfellet: begge
      // knappene og alle lenkene inne samtidig.
      document.documentElement.style.setProperty("--fs", "1.15");
      document.getElementById("installBtn").hidden = false;
      // Malt i piksler og ikke i prosent av panelet: panelhoyden folger
      // testvinduet, og da hadde terskelen sagt noe om vinduet framfor om
      // footeren. Den var 277 px for og er 196 na; taket er 220.
      var footerH = document.querySelector(".menu-actions").getBoundingClientRect().height;
      ok("footeren tar ikke en tredel av menyen", footerH < 220, Math.round(footerH));

      // Del og Installer star pa samme linje. Uten det er footeren en rad
      // hoyere, og raden er det emnelista mister.
      var del = document.getElementById("shareBtn").getBoundingClientRect();
      var inst = document.getElementById("installBtn").getBoundingClientRect();
      ok("del og installer star pa samme linje",
         Math.abs(del.top - inst.top) < 2,
         Math.round(del.top) + " mot " + Math.round(inst.top));

      // Og nar installasjon ikke tilbys — som er det vanlige — skal «Del
      // appen» ta hele bredden framfor a sta pa halve med et hull ved
      // siden av. Det er derfor de ligger i flex og ikke i to kolonner.
      document.getElementById("installBtn").hidden = true;
      var par = document.querySelector(".action-par").getBoundingClientRect();
      var alene = document.getElementById("shareBtn").getBoundingClientRect();
      ok("del appen tar hele bredden nar installer er skjult",
         Math.abs(alene.width - par.width) < 2,
         Math.round(alene.width) + " av " + Math.round(par.width));
      document.documentElement.style.removeProperty("--fs");
      var forsteBrikke = elite && elite.querySelector(".snarvei-knapp");
      ok("snarveien sier hvilken liga den gjelder",
         !!forsteBrikke &&
         String(forsteBrikke.getAttribute("aria-label")).indexOf("Eliteserien") > -1,
         forsteBrikke && forsteBrikke.getAttribute("aria-label"));

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

      // «Folg systemet» (#148). Systemet stubbes framfor a emuleres: det
      // er matchMedia appen faktisk spor, og et stubbet svar kan settes
      // begge veier i samme kjoring — en emulert skjerm kan ikke det.
      var ekteMM = window.matchMedia;
      function settSystem(morkt) {
        window.matchMedia = function (q) {
          if (String(q).indexOf("prefers-color-scheme: dark") > -1) {
            return { matches: morkt, addEventListener: function () {},
                     addListener: function () {} };
          }
          return ekteMM.call(window, q);
        };
      }

      settSystem(true);
      document.getElementById("temaSystem").click();
      ok("folg systemet blir morkt nar systemet er morkt",
         document.documentElement.getAttribute("data-theme") === "svart",
         String(document.documentElement.getAttribute("data-theme")));
      // Markeringen folger VALGET, ikke resultatet. Sto den pa «Mørkt»,
      // ville skjermen sagt at du hadde trykket pa noe du ikke har — og
      // du ville ikke funnet veien tilbake til det du faktisk valgte.
      ok("og det er «Auto» som er markert, ikke «Mørkt»",
         aktiv("temaSystem") && !aktiv("temaSvart") && !aktiv("temaLys"));

      // Samme valg, lyst system. Den samme knappen skal gi motsatt svar —
      // det er hele poenget med den.
      settSystem(false);
      document.getElementById("temaLys").click();
      document.getElementById("temaSystem").click();
      ok("og lyst nar systemet er lyst",
         !document.documentElement.getAttribute("data-theme") && aktiv("temaSystem"),
         String(document.documentElement.getAttribute("data-theme")));

      // At appen folger et systembytte MENS den staar apen, maales ikke
      // her: lytteren ble hengt paa det ekte matchMedia-objektet da sida
      // lastet, og stubben over naar den ikke. En test som klikket seg
      // fram til morkt igjen ville bare gjentatt pastanden over og sett ut
      // som dekning den ikke ga. En vakt i unit.mjs holder at lytteren
      // finnes; at den fyrer, er ikke maalt.
      window.matchMedia = ekteMM;
      document.getElementById("temaLys").click();

      // Den gamle boolske formen. En leser som valgte morkt for
      // 21. september 2026 har {svart: true} liggende, og skal fortsatt
      // fa morkt — ikke lyst fordi feltet byttet navn.
      var lagretNa = JSON.parse(localStorage.getItem("sb-visning") || "{}");
      ok("det gamle feltet skrives ikke tilbake",
         !("svart" in lagretNa), Object.keys(lagretNa).join(","));
      ok("og temaet lagres som et ord, ikke en bryter",
         lagretNa.tema === "lys", String(lagretNa.tema));

      // Snarveien skal ta deg til fotballfanen — og bare dit. Uten
      // stopPropagation ville trykket ogsa telt som et trykk pa emnet, og
      // feeden hadde filtrert seg i bakgrunnen mens fanen apnet.
      var rader = document.querySelectorAll(".menu-rad");
      var elite = Array.prototype.find.call(rader, function (r) {
        var b = r.querySelector(".menu-item");
        return b && b.textContent.indexOf("Eliteserien") === 0;
      });
      var sokFor = window.__sokUrl;
      // Null-sikkert: en test som kaster velter sida, og da forsvinner
      // alle pastandene etter den ogsa. Den skal feile, ikke krasje.
      var snarvei = forsteBrikke;
      ok("det finnes en snarvei a trykke pa", !!snarvei);
      if (snarvei) snarvei.click();

      setTimeout(function () { try {
        ok("snarveien apner fotballvisningen",
           !!snarvei && !document.getElementById("fotball").hidden &&
           document.getElementById("feed").hidden);
        ok("og pa den ligaen raden gjaldt",
           location.hash.indexOf("#/fotball/eliteserien/tabell") === 0, location.hash);
        ok("menyen lukker seg etter trykket",
           document.getElementById("menuPanel").className.indexOf("open") === -1,
           document.getElementById("menuPanel").className);
        // Emnet skal ikke vaere valgt: du ba om tabellen, ikke om saker.
        ok("feeden filtreres ikke i bakgrunnen",
           window.__sokUrl === sokFor, sokFor + " -> " + window.__sokUrl);

        // «Del appen» uten delingsmeny OG uten utklippstavle. Da sier
        // notatet «Kopier lenken selv: …», og til 21. september 2026 sto
        // URL-en der som ren tekst i et 12px-avsnitt — i nettopp det
        // tilfellet der teksten er det ENESTE leseren har. Meldt i #148.
        //
        // Begge veiene stenges med vilje: er bare den ene stengt, tar den
        // andre over og vi maaler en annen gren enn den vi tror.
        navigator.share = undefined;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: function () { return Promise.reject(new Error("nei")); } }
        });
        document.getElementById("shareBtn").click();

        setTimeout(function () { try {
          var notat = document.getElementById("actionNote");
          var a = notat.querySelector("a");
          ok("lenken i fallbacken er en ekte lenke, ikke tekst",
             !!a && a.tagName === "A", notat.textContent.slice(0, 60));
          // href OG tekst: en lenke som viser noe annet enn den peker paa
          // er verre enn tekst, og teksten er det man merker og kopierer.
          ok("og den peker paa appen, med adressen som tekst",
             !!a && a.href.indexOf(location.origin) === 0 &&
             a.textContent.indexOf(location.origin) === 0,
             a ? a.getAttribute("href") + " / " + a.textContent : "fant ingen lenke");
          // Trykkflate: notatet er 12px, og en lenke pa 12px uten luft er
          // ikke noe man treffer med en finger.
          var h = a ? a.getBoundingClientRect().height : 0;
          ok("og den er stor nok til aa treffes med en finger", h >= 24, Math.round(h));
          ok("setningen foran staar fortsatt",
             notat.textContent.indexOf("Kopier lenken selv") === 0,
             notat.textContent.slice(0, 40));
          ferdig();
        } catch (e) { ok("ingen unntak i delingsfallbacken", false, e.message); ferdig(); } }, 200);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    }, 500);
  }, 900); });
`);

/* ---------------- 6. fotball (beta) ---------------- */

// Fotballdata, i den formen Netlify-funksjonen leverer dem.
const FOTBALL = `
  var TABELL = [
    // Merket kommer fra kilden, ikke fra oss. Radene her dekker de tre
    // tilfellene: et merke vi stoler pa, ingenting, og en adresse som
    // ikke er https — den siste skal ikke tegnes i det hele tatt.
    // Bildet er innebygd, ikke en adresse: et bilde som ma hentes over
    // nettet fryser den virtuelle tida, og testsiden rapporterer aldri.
    { plass: 1, lag: "Bodo/Glimt", kamper: 30, seier: 21, uavgjort: 5, tap: 4,
      scoret: 74, sluppet: 33, differanse: 41, poeng: 68,
      merke: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" },
    { plass: 2, lag: "Brann", kamper: 30, seier: 18, uavgjort: 6, tap: 6,
      scoret: 55, sluppet: 33, differanse: 22, poeng: 60, merke: null },
    { plass: 3, lag: "Kristiansund Ballklubb Elite", kamper: 30, seier: 9, uavgjort: 8, tap: 13,
      scoret: 40, sluppet: 48, differanse: -8, poeng: 35,
      merke: "http://eksempel.test/kbk.png" }
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
      borte: "Rosenborg", malHjemme: null, malBorte: null, spilt: false },
    // Funksjonen gir hele vinduet, ikke bare forste runde: admin skal
    // kunne fore inn en kamp som spilles om to uker. Leseren skal
    // fortsatt bare se den forste runden — den utvelgelsen skjer i
    // visningen, og det er nettopp den forskjellen testene vokter.
    { id: 5, dato: "2026-09-27T16:00:00+00:00", runde: "Runde 22", hjemme: "Viking",
      borte: "Lillestrom", malHjemme: null, malBorte: null, spilt: false }
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

const SAK_6 = kjor("fotball", FELLES + FOTBALL + `
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
      // Lagmerket (#33). Det laa i dataene hele tiden — begge parserne
      // plukket det ut — men ble aldri tegnet. Ingen nye kall.
      var merke0 = rader[0].querySelector(".lag-merke");
      ok("laget med merke far merket ved navnet",
         !!merke0 && String(merke0.getAttribute("src")).indexOf("data:image/gif") === 0,
         merke0 && merke0.getAttribute("src"));
      ok("merket star inne i lagknappen, sa det folger navnet",
         !!merke0 && merke0.closest(".lag-knapp") !== null);
      // Navnet star like ved: leses merket opp i tillegg, sier
      // skjermleseren laget to ganger.
      ok("merket er stumt for skjermlesere", !!merke0 && merke0.getAttribute("alt") === "");
      // Uten mal har raden ingen hoyde for bildet er lastet, og tabellen
      // hopper mens den leses.
      ok("merket har mal pa taggen",
         !!merke0 && merke0.getAttribute("width") === "18" &&
         merke0.getAttribute("height") === "18");
      ok("og laster ikke for det trengs",
         !!merke0 && merke0.getAttribute("loading") === "lazy" &&
         merke0.getAttribute("referrerpolicy") === "no-referrer");
      ok("laget uten merke star med navnet sitt likevel",
         !rader[1].querySelector(".lag-merke") &&
         rader[1].querySelector(".kol-lag").textContent === "Brann",
         rader[1].querySelector(".kol-lag").textContent);
      // En adresse som ikke er https skal ikke lastes fra appen.
      ok("et merke uten https tegnes ikke", !rader[2].querySelector(".lag-merke"));

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

      // Menyen skal vaere den samme uansett hvor du star. For byttet den
      // innhold her — ligaer i stedet for kategorier — og samme knapp ga
      // to verdener, avhengig av en tilstand man ikke ser mens menyen er
      // apen.
      document.getElementById("menuBtn").click();
      setTimeout(function () {
        ok("menyen viser de samme emnene i fotball som i nyheter",
           !!document.querySelector(".menu-item[data-cat-id]"),
           document.getElementById("menuList").textContent.slice(0, 80));
        // Ligaene er ikke borte — de byttes der man alt star.
        var ligaKnapper = document.querySelectorAll("#ligaVelger .segment-del");
        ok("ligaene byttes i fotballvisningen, ikke i menyen",
           ligaKnapper.length === 5, ligaKnapper.length);

        // Fem ligaer far ikke plass pa én linje pa en telefon, og en
        // kapsel med overflow:hidden kappet den siste — «Serie A» sto
        // halvt utenfor kanten. Testen kjorer i 390 px med vilje: i et
        // bredt vindu ville alle fem fatt plass, og assertionene under
        // hadde statt gronne uansett hva CSS-en sa.
        var velger = document.getElementById("ligaVelger");
        var rammeH = velger.getBoundingClientRect();
        var utenfor = Array.prototype.filter.call(ligaKnapper, function (k) {
          var r = k.getBoundingClientRect();
          return r.right > rammeH.right + 1 || r.left < rammeH.left - 1;
        });
        ok("ingen liga blir kuttet av kanten",
           utenfor.length === 0,
           Array.prototype.map.call(utenfor, function (k) {
             return k.textContent; }).join(","));
        // Og de ligger faktisk pa flere linjer, ikke bare presset sammen.
        var linjer = [];
        Array.prototype.forEach.call(ligaKnapper, function (k) {
          if (linjer.indexOf(k.offsetTop) === -1) linjer.push(k.offsetTop);
        });
        ok("de brytes over flere linjer nar de ma",
           linjer.length > 1, linjer.join(","));
        // Og de blases ikke opp. .fotball-topp gir segmentknapper flex:1,
        // som er riktig pa én linje — men nar lista bryter, far den siste
        // linja ofte ett navn, og da ble «Serie A» en pille pa hele
        // bredden. Det leses som en feil, ikke som en liga.
        var bredest = 0;
        Array.prototype.forEach.call(ligaKnapper, function (k) {
          bredest = Math.max(bredest, k.getBoundingClientRect().width);
        });
        ok("en liga alene pa siste linje fyller ikke bredden",
           bredest < rammeH.width * 0.6,
           Math.round(bredest) + " av " + Math.round(rammeH.width));
        // Tallet alene ville statt gront om en liga byttet plass med en
        // annen, sa en av de nye navngis.
        ok("og de nye ligaene star i velgeren",
           !!document.querySelector("#ligaVelger .segment-del[data-verdi='laliga']"),
           document.getElementById("ligaVelger").textContent);
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
            ok("kampene framover listes", neste.length === 3, neste.length);
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

const SAK_7 = kjor("fotball-lenke", FELLES + FOTBALL + `
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

const SAK_8 = kjor("fotball-feil", FELLES + FOTBALL + `
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

const SAK_9 = kjor("fotball-lagsok", FELLES + FOTBALL + `
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
const SAK_10 = kjor("fotball-ferdig", FELLES + FOTBALL + `
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
const SAK_11 = kjor("favorittlag", FELLES + FOTBALL + `
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
const SAK_12 = kjor("kamp-deling", FELLES + FOTBALL + `
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
    ok("hver kommende kamp kan deles", knapper.length === 3, knapper.length);
    // Tjenesten gir hele vinduet — tre kamper over to runder — og leseren
    // ser hele. Var runden nesten ferdigspilt, sto det én kamp i fanen og
    // ingenting om helgen etter.
    var tekstNa = document.getElementById("fotballInnhold").textContent;
    ok("runden etter er ogsa med",
       tekstNa.indexOf("Brann") > -1 && tekstNa.indexOf("Molde") > -1 &&
       tekstNa.indexOf("Viking") > -1, tekstNa.slice(0, 200));
    // Uten den er «lordag 27. sep» det eneste som skiller de to rundene.
    var runder = Array.prototype.map.call(document.querySelectorAll(".kamp-runde"),
      function (r) { return r.textContent; });
    ok("og hver runde har sin egen overskrift",
       runder.length === 2 && runder[0] === "Runde 21" && runder[1] === "Runde 22",
       runder.join("|"));
    // Overskriften star over kampene sine, ikke nederst i lista.
    var forsteBarn = document.querySelector(".kamper").firstElementChild;
    ok("runden star over sin egen dag",
       !!forsteBarn && forsteBarn.classList.contains("kamp-runde"),
       forsteBarn ? forsteBarn.className : "tom");
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
       knapper[0].getAttribute("aria-label") === lagNavn.join(" – ") + ". Hvor skal du se den?",
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
    // Kortet er en liste over steder man kan dra, ikke tre valg og et
    // felt. Overskrifta sier hva lista under er; lagene er overskrifta pa
    // kampen og star i linja over.
    ok("kortet sporr etter stedet",
       panel.querySelector(".kamp-panel-tittel").textContent === "Hvor skal du se den?",
       panel.querySelector(".kamp-panel-tittel").textContent);
    // «Stadion er et valg pa linje med puber. En plass man kan dra.»
    var steder = function () {
      return Array.prototype.map.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn")
          ? c.querySelector(".sted-navn").textContent : ""; });
    };
    ok("stadion star som et sted man kan dra til",
       steder().indexOf("Brann Stadion") > -1, steder().join("|"));

    // Stedene staar FRAMME i kortet na. «Puber som pleier a vise fotball»
    // var en lenke du maatte legge merke til, med forslagslista, soeket og
    // innsendingsskjemaet bak seg — og den er borte (20. september 2026).
    ok("stedene staar framme, ikke bak en lenke",
       !panel.querySelector(".pub-apne") && !panel.querySelector(".pub-utvidet"),
       panel.querySelector(".pub-apne") ? "lenka staar der" : "");
    // Lista over andre byer er det eneste som fortsatt er lukket: for en
    // kamp i kveld er den ikke et svar.
    var apne = panel.querySelector(".sted-andre-apne");
    ok("puber i andre byer ligger bak en knapp",
       !!apne && apne.getAttribute("aria-expanded") === "false" &&
       apne.textContent === "Trykk her for puber i andre byer",
       apne ? apne.textContent : "ingen knapp");
    // Og kildene hentes naar kortet apnes. Motsatt av for: da kostet et
    // trykk paa kortet ingenting, men posisjonen kom aldri — og uten den
    // sto en bekreftet visning 392 km unna oeverst.
    ok("kildene hentes naar kortet apnes",
       window.__overpassKall > 0 || window.__puberKall > 0,
       window.__overpassKall + "/" + window.__puberKall);

    apne.click();
    ok("knappen ekspanderer de andre byene",
       apne.getAttribute("aria-expanded") === "true" &&
       !panel.querySelector(".pub-forslag").hidden);
    // Ett sporsmal, ett svar: en rangert liste, ikke seks grupper.
    var forslag = panel;
    ok("pubforslagene star der da", forslag && !forslag.hidden);
    var navnene = function () {
      return Array.prototype.map.call(forslag.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector("span").textContent; });
    };
    // Kampen spilles ofte et annet sted enn der man ser den, sa naer deg
    // hentes med en gang — trykket som apnet lista er handlingen telefonen
    // krever for a sporre om posisjon.
    ok("naer deg hentes med en gang, uten et trykk til",
       window.__overpassKall === 1, window.__overpassKall);
    // To lister, ikke seks grupper: stedene naer deg, og pubene i andre
    // byer. Det var de seks gruppene med hver sin overskrift som gjorde
    // panelet uleselig — og «andre byer» svarer paa et annet spoersmaal
    // enn «hvor skal jeg», saa den er ikke en gruppe til av det samme.
    ok("stedene staar i to lister, ikke i grupper",
       panel.querySelectorAll(".sted-liste").length === 2,
       panel.querySelectorAll(".sted-liste").length);
    ok("dine puber er med", navnene().indexOf("Pub X") > -1, navnene().join("|"));

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
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    forslag = panel;

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

      // Bare lista over stedene naer deg: den andre svarer paa noe annet,
      // og teller ikke mot taket her.
      // Bare lista over stedene naer deg, og bare de VANLIGE radene: ditt
      // eget sted og stedene noen andre skal til kommer i tillegg til
      // taket, og skal ikke telles mot det.
      var naeListe = panel.querySelector(".sted-liste");
      // .sted-resten ligger INNE i .sted-liste: radene bak «Ekspander
      // lista» er ikke framme, og skal ikke telles som om de var det.
      var alleRader = Array.prototype.filter.call(
        naeListe.querySelectorAll(".sted-rad-kort"),
        function (c) { return !c.closest(".sted-resten"); });
      var na = alleRader.map(function (c) {
        return c.querySelector(".sted-navn").textContent; });
      var vanlige = alleRader.filter(function (c) {
        return !c.classList.contains("valgt") && !c.querySelector(".sted-rad-folk");
      });
      ok("naer deg sporr Overpass fra nettleseren med rundet posisjon",
         window.__overpassKall === 1 && window.__overpassBody.indexOf("around:800,63.431,10.395") > -1, window.__overpassBody);
      ok("puber naer deg vises", na.indexOf("Torgpuben") > -1, na.join("|"));
      ok("puber ved stadion og ved holdeplassen kommer fra funksjonen",
         na.indexOf("Stadionpuben") > -1, na.join("|"));
      // Taket finnes for at lista skal kunne leses pa en telefon.
      ok("hoyst fire vanlige steder staar framme, saa «Ekspander lista»",
         vanlige.length <= 4, vanlige.length + " av " + na.length);
      // Det var dette som gjorde panelet uleselig: samme pub i flere lister.
      ok("ingen pub star der to ganger",
         na.length === na.filter(function (n, i) { return na.indexOf(n) === i; }).length,
         na.join("|"));
      ok("funksjonen spores en gang per arena", window.__puberKall === 1, window.__puberKall);
      ok("OpenStreetMap krediteres", forslag.textContent.indexOf("© OpenStreetMap-bidragsytere") > -1);
      var chip = Array.prototype.find.call(forslag.querySelectorAll(".sted-rad-kort"), function (c) { return c.textContent.indexOf("Stadionpuben") === 0; });
      ok("chipen viser avstand", chip && chip.textContent.indexOf("240 m") > -1, chip && chip.textContent);

      // «Nar jeg trykker pa en pub sa bekrefter jeg at jeg planlegger a se
      // den der.» Utlogget kan ingen stille seg pa lista — det ma noen ha
      // sagt — men stedet er valgt, og kampen deles med det i teksten.
      // Delingen gar til gruppechatten, ikke til oss, og krevde aldri en
      // konto.
      // Chipene tegnes pa nytt etter hvert trykk — ett sted bestemmer hva
      // som star pa skjermen — sa noden ma hentes igjen, ikke gjenbrukes.
      var finnChip = function (navn) {
        return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
          function (c) { return c.textContent.indexOf(navn) === 0; });
      };
      if (chip) chip.querySelector(".sted-knapp").click();
      var pubX = finnChip("Pub X");
      if (pubX) pubX.querySelector(".sted-knapp").click();
      var valgtChip = finnChip("Pub X");
      // Raden er merket valgt. Den var en chip med aria-pressed for; na er
      // den en rad med en knapp inni, og merket ligger paa raden.
      ok("stedet man trykker pa blir valgt",
         valgtChip && valgtChip.classList.contains("valgt"),
         valgtChip && valgtChip.className);
      ok("og utlogget star det hvorfor man ikke kommer pa lista",
         panel.querySelector(".kamp-svar").textContent.indexOf("Logg inn") === 0,
         panel.querySelector(".kamp-svar").textContent);
      ok("men lista er ikke en port: kortet lover ikke noe annet",
         panel.querySelector(".kamp-note").textContent.indexOf("virker uansett") > -1,
         panel.querySelector(".kamp-note").textContent);

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
         String(d.url).indexOf("kamp=2026-09-20-brann-bodoglimt") > -1 && String(d.url).indexOf("hvor=pub") > -1 &&
         String(d.url).indexOf("sted=Pub") > -1, d.url);
      ok("panelet lukkes etter deling", !document.querySelector(".kamp-panel"));
      ferdig();
    }
  } catch (e) { ok("ingen unntak underveis", false, e.message + " @ " + (e.stack || "").split("\\n")[1]); ferdig(); }
  }, 1200); });
`);

/* ------- 12B. en utenlandsk arena er ingen feil ------- */

// «Fikk ikke puber ved Stadio Pierluigi Penzo» sto i kortet pa hver eneste
// Serie A-kamp til 17. september 2026. Ingenting hadde sviktet: vaer-data
// kjenner tretti norske stadion, /api/puber svarer «Ukjent arena» pa alt
// annet, og vakta sto pa at *navnet* fantes framfor pa at vi kjente det.
//
// En leser i Oslo skal uansett ikke pa pub i Venezia. For de kampene er
// det stedene naer deg som er svaret.
const SAK_12C = kjor("utenlandsk-arena", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) {
    return Object.assign({}, k, { arena: "Stadio Pierluigi Penzo" });
  });
  window.__puberKall = 0;
  window.__puberArena = "";
  // Leseren star i Oslo sentrum, ikke i Venezia.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 59.9139, longitude: 10.7522 } });
  };
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("overpass-api.de") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [
        { type: "node", id: 9, lat: 59.9142, lon: 10.7530, tags: { amenity: "pub", name: "Kvadraturkroa" } } ] }); } });
    }
    if (u.indexOf("/api/puber?") === 0) {
      window.__puberKall += 1;
      window.__puberArena = u;
      // Det ekte svaret pa en arena funksjonen ikke kjenner.
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve(JSON.stringify({ feil: "Ukjent arena" })); } });
    }
    if (u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ klar: true, puber: [] })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Serie A", sesong: 2026, sisteSesong: true, del: del,
                    kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
                    kamper: ARETS, runde: "Runde 5" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/seriea/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    ok("kampen kan apnes", !!panel);
    if (!panel) { ferdig(); return; }

    // Stadionraden blir staende: kampen spilles et sted, og det er en
    // opplysning. Den er bare ikke noe vi kan lete etter puber rundt.
    var steder = Array.prototype.map.call(panel.querySelectorAll(".sted-navn"),
      function (n) { return n.textContent; });
    ok("stadion star som et sted man kan dra til",
       steder.indexOf("Stadio Pierluigi Penzo") > -1, steder.join("|"));

    var apne = panel.querySelector(".pub-apne");
    if (apne) apne.click();
    setTimeout(function () { try {
      var forslag = panel;
      var tekst = forslag ? forslag.textContent : "";
      // Kjernen: kallet gjores ikke, sa det finnes ingen feil a melde.
      ok("funksjonen spores aldri om en arena vi ikke kjenner",
         window.__puberKall === 0, window.__puberKall + " " + window.__puberArena);
      ok("og kortet pastar ikke at noe sviktet",
         tekst.indexOf("Fikk ikke puber") === -1, tekst.slice(0, 160));
      // Det som *er* svaret pa en utenlandsk kamp: stedene naer deg. De
      // kuraterte Oslo-pubene rangerer over treffene fra kartet, sa de
      // seks som star framme er dem — kartreffet ligger bak «Flere
      // forslag», og taket er der for at lista skal kunne leses.
      ok("de kuraterte pubene naer deg star framme",
         tekst.indexOf("Toucan") > -1, tekst.slice(0, 200));
      var mer = forslag && forslag.querySelector(".pub-mer");
      if (mer) mer.click();
      var alt = forslag ? forslag.textContent : "";
      ok("og treffet fra kartet ligger bak «Flere forslag»",
         alt.indexOf("Kvadraturkroa") > -1, alt.slice(0, 260));
      // Lisensen krever kreditering der treff fra kartet vises.
      ok("OpenStreetMap krediteres nar kartet ga noe",
         alt.indexOf("© OpenStreetMap-bidragsytere") > -1, alt.slice(-120));
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ---------------- 13. fjorarets runde kan ikke deles ---------------- */

const SAK_13 = kjor("kamp-deling-gammel", FELLES + FOTBALL + `
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
const SAK_14 = kjor("pub-feil", FELLES + FOTBALL + `
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
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      // Uten nettverk i det hele tatt star lista i koden igjen. Det er
      // verdt mye her, der Overpass har vaert det skjoreste leddet.
      var chips = forslag.querySelectorAll(".sted-rad-kort");
      ok("kjente fotballpuber vises uten nettverk",
         chips.length > 2 && forslag.textContent.indexOf("O'Learys Oslo Sentralstasjon") > -1,
         chips.length + " " + forslag.textContent.slice(0, 120));
      ok("de er merket som kjent for fotball", !!forslag.querySelector(".pub-merke"),
         forslag.querySelector(".sted-rad-kort") ? forslag.querySelector(".sted-rad-kort").innerHTML.slice(0, 160) : "ingen rad");
      ok("naermest star forst",
         chips[0].textContent.indexOf("O'Learys Oslo Sentralstasjon") > -1, chips[0].textContent);

      // Stadionraden. Leseren staar ved Oslo S, kampen gaar i Bergen —
      // og raden SKAL staa der likevel: hvor kampen spilles er en
      // opplysning, ikke et soek.
      //
      // Det er ogsaa vakta mot fiksen for «vei til stadion». Foerste
      // utkast la «lat»/«lon» paa stadionraden i «stedKilder» for aa faa
      // et punkt aa lenke til — og da ville «naerNok()» filtrert bort
      // arenaen paa hver eneste bortekamp. Punktet slaas derfor opp i
      // ARENAER naar lenka lages, og naar aldri raddataene.
      var stadion = Array.prototype.find.call(chips, function (c) {
        return c.querySelector(".sted-navn") &&
               c.querySelector(".sted-navn").textContent === "Brann Stadion"; });
      ok("stadionraden staar der selv om kampen er i en annen by", !!stadion,
         Array.prototype.map.call(chips, function (c) { return c.textContent; }).join(" | ").slice(0, 200));
      // Brann Stadion: 60.365, 5.357 i ARENAER. «Vei til stadion» var
      // halve bestillingen i #144.
      var stadionVei = stadion && stadion.querySelector(".sted-kart");
      ok("og veien dit er slaatt opp i ARENAER",
         !!stadionVei && stadionVei.getAttribute("href").indexOf("60.365%2C5.357") > -1,
         stadionVei ? stadionVei.getAttribute("href") : "ingen lenke");
      ok("svikter funksjonen, star det hvorfor",
         forslag.textContent.indexOf("Fikk ikke puber ved Brann Stadion") > -1, forslag.textContent);
      // Hvem som sviktet, sa det kan meldes videre uten a grave i logger.
      ok("og hvem som sviktet",
         forslag.textContent.indexOf("overpass-api.de svarte 406") > -1, forslag.textContent);
      // Knappen star ikke for alltid lenger — men den star nar posisjonen
      // eller kartet sviktet, sa det gar an a prove igjen.
      ok("naer deg-knappen star der nar den trengs", !!forslag.querySelector(".pub-naer"));
      // Naer deg feiler, men sier hvem som sviktet.
      ok("naer deg forklarer hvem som sviktet",
         forslag.textContent.indexOf("overpass-api.de svarte 504") > -1, forslag.textContent);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 14D. rettelsen som kom mens appen sto apen ---------------- */

// Meldt 18. september 2026: «Fikk til aa lagre rbk poebb. Men den dukker
// ikke opp i andre puber da jeg er innom Trondheim naa.»
//
// Raden var riktig, sammenslaingen virket, og avstanden var null — lista
// var bare hentet ÉN GANG, ved sidelasting, og det var foer admin lagret.
// Runden admin → app er nettopp den runden en rettelse gjoeres i, og den
// var den ene runden appen ikke sa.
const SAK_14D = kjor("pub-rettelse-i-bakgrunnen", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // Leseren star i Ila, samme punkt raden lagres med.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 63.4286, longitude: 10.3641 } });
  };
  var RBK = { nokkel: "rbkpubben", navn: "RBK-pubben", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false };
  // Det portalen har lagret akkurat na. Byttes underveis i testen.
  window.__iBasen = [];
  window.__listeKall = 0;
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      window.__listeKall += 1;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: window.__iBasen })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
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

  // Appen tror den er borte og kommer tilbake. Ferskhetsvinduet males i
  // Date.now(), sa klokka flyttes framfor a vente to minutter.
  var ekteNa = Date.now;
  function kommTilbake(sekunder) {
    var frem = ekteNa() + (sekunder || 0) * 1000;
    Date.now = function () { return frem; };
    document.dispatchEvent(new Event("visibilitychange"));
  }

  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    ok("kampen kan apnes", !!panel);
    if (!panel) { ferdig(); return; }
    var apne = panel.querySelector(".pub-apne");
    if (apne) apne.click();

    setTimeout(function () { try {
      var forslag = panel;
      ok("lista er hentet én gang ved oppstart", window.__listeKall === 1, window.__listeKall);
      ok("og puben finnes ikke enna",
         forslag.textContent.indexOf("RBK-pubben") === -1, forslag.textContent.slice(0, 160));

      // Admin lagrer i portalen mens kortet star apent.
      window.__iBasen = [RBK];
      kommTilbake(130);

      setTimeout(function () { try {
        ok("appen henter pa nytt nar den kommer fram igjen",
           window.__listeKall === 2, window.__listeKall);
        // Kortet sto apent hele tiden: det er tegnet om, ikke lastet om.
        ok("og puben star i det apne kortet",
           forslag.textContent.indexOf("RBK-pubben") > -1, forslag.textContent.slice(0, 260));
        ok("med avstand, ikke bare navn",
           forslag.textContent.indexOf("m unna") > -1 || forslag.textContent.indexOf(" m") > -1,
           forslag.textContent.slice(0, 260));

        // Et nytt bytte innenfor ferskhetsvinduet skal ikke koste et kall:
        // kanten svarer med det samme i det vinduet uansett.
        kommTilbake(140);
        setTimeout(function () { try {
          ok("men ikke pa nytt innenfor ferskhetsvinduet",
             window.__listeKall === 2, window.__listeKall);

          // Tas den siste rettelsen bort, er det tomme svaret det RIKTIGE
          // svaret. Sto sperra pa «tom liste», ble raden staende for evig.
          window.__iBasen = [];
          kommTilbake(400);
          setTimeout(function () { try {
            ok("en tom liste henter ogsa", window.__listeKall === 3, window.__listeKall);
            ok("og da faller puben ut igjen",
               forslag.textContent.indexOf("RBK-pubben") === -1,
               forslag.textContent.slice(0, 260));
            Date.now = ekteNa;
            ferdig();
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ---------------- 15. admin-portalen ---------------- */

// Portalen er en egen side. Den skriver ingenting selv: testen fanger
// POST-en og sjekker at det som sendes er det samme som sto pa skjermen.
/* ---------------- 14B. stampuben nar geografien ikke gir noe ---------------- */

// Drodlet fram 18. september 2026: «andre fotballpuber — skulle ikke det
// vaere puber som ligger i lista men ikke har bekreftet at de viser
// kampen?»
//
// De sto der alt, men bare gjennom et geografisk filter: kjenteNaer
// krever posisjonen din, kjenteVedArena at arenaen er en vi kjenner. Her
// er BEGGE stengt — utenlandsk kamp, og posisjon avslatt — og da fantes
// ikke den kuraterte lista i det hele tatt, enda «lag» i den svarer pa
// nettopp denne kampen.
const SAK_14B = kjor("pub-stampub", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  // Tottenham–Chelsea pa et stadion arenaFor() ikke kjenner: ingen norsk
  // arena, altsa ingen kjenteVedArena.
  var ARETS = KOMMENDE.map(function (k, i) {
    return i === 0
      ? Object.assign({}, k, { hjemme: "Tottenham", borte: "Chelsea",
                               arena: "Tottenham Hotspur Stadium" })
      : Object.assign({}, k, { arena: "" });
  });
  // Posisjon avslatt. Da er kjenteNaer tom ogsa.
  navigator.geolocation.getCurrentPosition = function (ok, feil) {
    feil({ code: 1, message: "avslatt" });
  };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: false, status: 504, statusText: "Gateway Timeout",
        json: function () { return Promise.reject(new Error("nede")); } });
    }
    if (u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve(JSON.stringify({ feil: "Ukjent arena" })); } });
    }
    if (u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Premier League", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/premier/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var navnene = Array.prototype.map.call(
        forslag.querySelectorAll(".sted-rad-kort"), function (c) { return c.textContent; });
      // Bohemen er stampub for Tottenham. Uten denne kilden star lista tom
      // her: ingen posisjon, ingen kjent arena, Overpass nede.
      ok("stampuben for laget star der uten posisjon og uten kjent arena",
         navnene.some(function (n) { return n.indexOf("Bohemen Sportspub") > -1; }),
         navnene.join(" | ") || "(tom liste)");
      // Merket er det samme ⚽ som ellers: «kjent for a vise fotball».
      // Stjerna ville lovet at stedet har bekreftet nettopp denne kampen,
      // og det har ingen gjort her.
      ok("den er merket kjent for fotball, ikke som bekreftet",
         !!forslag.querySelector(".pub-merke") &&
         !forslag.querySelector(".pub-bekreftet"),
         navnene.join(" | "));
      // Og bare lagene som spiller: en Leeds-stampub svarer ikke pa
      // Tottenham–Chelsea, og ville vaert stoy i en liste som ellers er tom.
      ok("men ikke stampuber for lag som ikke spiller",
         !navnene.some(function (n) { return n.indexOf("Dr. Jekyll") === 0; }),
         navnene.join(" | "));

      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14C. falsk posisjon ---------------- */

// Meldt 18. september 2026: «vi ma finne ut hvordan vi kan teste det sa
// reelt som mulig uten a ha noen fysisk der.»
//
// Scenen star i Bodo. Telefonen sier NEI til posisjon — den falske skal
// sla gjennom likevel, ellers er den ubrukelig for den som har avslatt
// stedstjenester en gang og ikke husker hvordan man angrer.
const SAK_14C = kjor("pub-falsk-posisjon", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  navigator.geolocation.getCurrentPosition = function (ok, feil) {
    feil({ code: 1, message: "avslatt" });
  };
  history.replaceState(null, "", location.pathname + "?posisjon=bodo");
  window.__overpassKropp = "";
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      window.__overpassKropp = String((opt && opt.body) || "");
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [
          { type: "node", lat: 67.2805, lon: 14.4055,
            tags: { name: "Bryggerikaia", amenity: "pub" } }
        ] }); } });
    }
    if (u.indexOf("/api/vaer?") === 0 || u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 21" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var navnene = Array.prototype.map.call(
        forslag.querySelectorAll(".sted-rad-kort"), function (c) { return c.textContent; });
      // Koordinatet ma reise helt fram til Overpass. Star det ikke i
      // sporringen, malte vi Oslo og trodde vi malte Bodo.
      ok("koordinatet reiser helt fram til Overpass",
         decodeURIComponent(window.__overpassKropp).indexOf("67.28") > -1,
         decodeURIComponent(window.__overpassKropp).slice(0, 90));
      ok("og treffet derfra star i lista",
         navnene.some(function (n) { return n.indexOf("Bryggerikaia") === 0; }),
         navnene.join(" | ") || "(tom)");
      // De kuraterte stedene er i Oslo, 1500 km unna. Star de her, brukte
      // vi ikke den falske posisjonen i det hele tatt.
      ok("og Oslo-stedene star ikke i Bodo",
         !navnene.some(function (n) { return n.indexOf("O'Learys") === 0; }),
         navnene.join(" | "));
      // Den slar gjennom selv om telefonen sa nei.
      ok("den virker selv om telefonen avslo posisjon", navnene.length > 0,
         navnene.join(" | "));
      // Og den sier det, hele tiden. En app som viser puber et annet sted
      // enn du er, og tier om det, sier noe usant med sin egen liste.
      var note = forslag.querySelector(".pub-note").textContent;
      ok("og skjermen sier at posisjonen er falsk",
         note.indexOf("Falsk posisjon: Bodø") === 0, note);
      // Krediteringa star fortsatt: treffene kommer fra kartet.
      ok("kartet krediteres som ellers",
         note.indexOf("OpenStreetMap") > -1, note);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14E. radiusen for «naer deg» ---------------- */

// Meldt 19. september 2026: en RBK-pub lagret i portalen dukket ikke opp
// i appen fra Trondheim. Malt: 1545 meter fra sentrum, mot en radius pa
// 1500. Den bommet med 45 meter.
//
// Tallet sto som ETT for «naer deg» og «ved arenaen», og de to tale ikke
// det samme tallet: tre kilometer fra deg er noe du kan forkaste selv,
// tre kilometer fra stadion gjor overskriften usann. Scenen star 2,1 km
// nord for Majorstuen — ingenting innenfor 1500, tre steder innenfor
// 3000. Settes NAER_RADIUS tilbake til 1500, blir lista tom.
const SAK_14E = kjor("pub-naer-radius", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=59.9479,10.7145");
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      // Kartet gir ingenting. Star det noe i lista, kom det fra fila.
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/vaer?") === 0 || u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ puber: [] })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var navnene = Array.prototype.map.call(
        forslag.querySelectorAll(".sted-rad-kort"), function (c) { return c.textContent; });
      // 2689 m fra Oslo sentrum, 2,1 km fra der vi star. Under den gamle
      // radiusen pa 1500 fantes den ikke.
      ok("et kuratert sted 2,1 km unna star i lista",
         navnene.some(function (n) { return n.indexOf("The Old Irish Pub Majorstuen") > -1; }),
         navnene.join(" | ") || "(tom liste)");
      // Avstanden ma vaere pa brikka: en lengre liste er bare aerlig sa
      // lenge leseren ser hvor langt det er og kan forkaste den selv.
      var avstander = Array.prototype.map.call(
        forslag.querySelectorAll(".sted-avstand"), function (a) { return a.textContent; });
      ok("og den baerer avstanden sin, sa den kan forkastes",
         avstander.length > 0 && avstander.join("").length > 0,
         avstander.join(" | ") || "(ingen avstander)");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14H. rettelsen sett fra sentrum ---------------- */

// Den meldte saken, med raden slik /api/pub-liste faktisk leverer den.
//
// SAK_14D dekket den samme raden og var gronn hele tida — men den star i
// DORA til puben, «samme punkt raden lagres med», altsa null meter unna.
// Den beviste at sammenslainga virker, ikke at stedet nas fra der en
// leser star. Her star scenen i Trondheim sentrum, 1545 meter unna, og
// det var nettopp de meterne som manglet.
const SAK_14H = kjor("pub-rettelse-fra-sentrum", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // Trondheim sentrum, slik BYER definerer det.
  history.replaceState(null, "", location.pathname + "?posisjon=63.43,10.395");
  var RBK = { nokkel: "rbkpobbogsant", navn: "RBK. Pøbb og sånt", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      // Kartet gir ingenting: star puben der, kom den fra rettelsene.
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: [RBK] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var tekst = forslag.textContent;
      // Dette er hele saken: raden er riktig, sammenslainga virker, og
      // likevel sto den ikke der — 45 meter for langt unna.
      ok("en rettelse fra portalen nas fra sentrum, ikke bare fra dora",
         tekst.indexOf("Pøbb") > -1, tekst.slice(0, 260) || "(tomt panel)");
      // Og den bærer avstanden sin, sa det gar an a vurdere den.
      var avstand = forslag.querySelector(".sted-avstand");
      ok("og den viser hvor langt det er",
         !!avstand && avstand.textContent.length > 0,
         avstand ? avstand.textContent : "(ingen avstand)");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14F. hvorfor posisjonen uteble ---------------- */

// Meldt 19. september 2026: «undersok hvorfor posisjon ikke slo inn».
// Det lot seg ikke undersoke fra skjermen, og DET var feilen. Nei,
// tidsavbrudd og «fant ikke posisjonen» ble handtert likt og stille, og
// da sto «Fant ingen puber i naerheten» igjen som eneste forklaring — en
// setning som ikke er sann nar vi aldri fikk vite hvor «naer» var.
const SAK_14F = kjor("pub-posisjon-hvorfor", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // Tidsavbrudd, ikke avslag: kode 3. Stuben modellerer nettleserens eget
  // svar, ikke var handtering av det.
  navigator.geolocation.getCurrentPosition = function (ok_, feil) {
    feil({ code: 3, message: "timeout" });
  };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/vaer?") === 0 || u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ puber: [] })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var note = forslag.querySelector(".pub-note").textContent;
      // Et tidsavbrudd er ikke et nei. La den skylda pa leseren, leter
      // hen etter en innstilling hen aldri rorte.
      ok("et tidsavbrudd sier at posisjonen ikke kom fram",
         note.indexOf("kom ikke fram i tide") > -1, note);
      ok("og legger ikke skylda pa leseren",
         note.indexOf("Du sa nei") === -1, note);
      // Den gamle setningen er usann her: vi fant ingenting fordi vi
      // aldri fikk vite hvor «naer» var.
      ok("og staar ikke lenger som «fant ingen puber»",
         note.indexOf("Fant ingen puber") === -1, note);
      // Knappen star: et tidsavbrudd kan proves om igjen.
      ok("og veien tilbake star der",
         !!forslag.querySelector(".pub-naer"), note);

      // Na sier telefonen ja. Den gamle setningen ma VEK — den var sann
      // da den ble skrevet og er usann na. Dette er hele grunnen til at
      // posisjonsfeilen er sitt eget felt og ikke en rad i boks.feil.
      navigator.geolocation.getCurrentPosition = function (ok_) {
        ok_({ coords: { latitude: 59.9139, longitude: 10.7522, accuracy: 20 } });
      };
      forslag.querySelector(".pub-naer").click();
      setTimeout(function () { try {
        var etterpa = panel.querySelector(".pub-note").textContent;
        ok("og forsvinner nar posisjonen kommer",
           etterpa.indexOf("kom ikke fram i tide") === -1, etterpa);
        var navnene = Array.prototype.map.call(
          panel.querySelectorAll(".sted-rad-kort"),
          function (c) { return c.textContent; });
        ok("og da star stedene naer deg der",
           navnene.length > 0, navnene.join(" | ") || "(tom liste)");
        ferdig();
      } catch (e) { ok("ingen unntak etter nytt forsok", false, e.message); ferdig(); } }, 600);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14G. nettleseren uten posisjon ---------------- */

// Det stilleste tilfellet av alle: `if (!navigator.geolocation) return;`.
// Ingen setning, og ingen knapp — for det finnes ingenting a prove om
// igjen. Da sto panelet der og sa «Fant ingen puber i naerheten» om en
// maling som aldri ble forsokt.
const SAK_14G = kjor("pub-ingen-geolocation", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // Nettleseren har ikke API-et i det hele tatt.
  try {
    Object.defineProperty(navigator, "geolocation",
      { value: undefined, configurable: true });
  } catch (e) { /* lar seg ikke fjerne her */ }
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/vaer?") === 0 || u.indexOf("/api/puber?") === 0) {
      return Promise.resolve({ ok: false, status: 400, statusText: "Bad Request",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ puber: [] })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var note = forslag.querySelector(".pub-note").textContent;
      ok("en nettleser uten posisjon sier at det er nettleseren",
         note.indexOf("Nettleseren gir ikke posisjon") > -1, note);
      // Og ingen knapp: den ville lovet et nytt forsok som ikke finnes.
      ok("og tilbyr ingen knapp som ikke kan gi noe",
         !forslag.querySelector(".pub-naer"), note);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14I. stedene i byen din ---------------- */

// Meldt 19. september 2026: «jeg onsker a fa opp puben uavhengig om den
// har lag RBK eller ikke. Det er en pub som er satt opp som plass som
// viser kamper.»
//
// Radiusen er en SIRKEL, og en by er ikke det. Scenen star 4,5 km ost
// for RBK-puben, fortsatt godt inne i Trondheim: `kjenteNaer` gir
// ingenting der, og for denne kilden fantes stedet ikke.
const SAK_14I = kjor("pub-kjente-i-byen", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=63.4286,10.4545");
  var RBK = { nokkel: "rbkpobbogsant", navn: "RBK. Pøbb og sånt", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: [RBK] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var tekst = forslag.textContent;
      // Kampen er en hvilken som helst Eliteserie-kamp, og raden har
      // lag: []. Star puben her, kom den verken fra lag eller fra radius.
      ok("et sted i byen din star der selv om det er utenfor radiusen",
         tekst.indexOf("Pøbb") > -1, tekst.slice(0, 260) || "(tomt panel)");
      // Og avstanden star pa: det er forskjellen fra et lagtreff, og
      // grunnen til at kilden far bli staende nar posisjonen finnes.
      var avstand = forslag.querySelector(".sted-avstand");
      ok("og den baerer avstanden sin",
         !!avstand && avstand.textContent.indexOf("km") > -1,
         avstand ? avstand.textContent : "(ingen avstand)");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14J. den femte kilden som leser KJENTE ---------------- */

// `tegnKjenteIgjen()` ma regne om HVER kilde som leser KJENTE. Fella har
// kostet tre ganger i dette prosjektet, og `kjenteIByen` er den femte —
// altsa nok en sjanse til a glemme en. Her lander en rettelse MENS kortet
// star apent, og stedet ligger utenfor radiusen: bare bykilden kan finne
// det, sa testen svarer pa om nettopp den ble regnet om.
const SAK_14J = kjor("pub-i-byen-etterpa", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=63.4286,10.4545");
  var RBK = { nokkel: "rbkpobbogsant", navn: "RBK. Pøbb og sånt", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false };
  // Tomt til a begynne med: rettelsen kommer forst nar du har vaert borte.
  window.__iBasen = [];
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: window.__iBasen })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  var ekteNa = Date.now;
  function kommTilbake(sekunder) {
    var frem = ekteNa() + (sekunder || 0) * 1000;
    Date.now = function () { return frem; };
    document.dispatchEvent(new Event("visibilitychange"));
  }
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      ok("stedet star ikke der for rettelsen er lagret",
         forslag.textContent.indexOf("Pøbb") === -1,
         forslag.textContent.slice(0, 160));

      // Admin lagrer i portalen, og du bytter tilbake til appen.
      window.__iBasen = [RBK];
      kommTilbake(130);

      setTimeout(function () { try {
        var etterpa = panel.textContent;
        // Stedet ligger 4,5 km unna: kjenteNaer nar det ikke. Star det
        // her, ble kjenteIByen regnet om sammen med de andre.
        ok("og bykilden regnes om nar rettelsen lander i et apent kort",
           etterpa.indexOf("Pøbb") > -1, etterpa.slice(0, 260) || "(tomt panel)");
        ferdig();
      } catch (e) { ok("ingen unntak etter rettelsen", false, e.message); ferdig(); } }, 700);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ---------------- 14K. stedet som sender ligaen ---------------- */

// «Viser alt»-flagget, meldt 19. september 2026 — men pa LIGANIVA, for
// kamper kolliderer. Stedet har lag: [] og er ikke krysset av for denne
// kampen; eneste grunn til at det loftes er flagget.
const SAK_14K = kjor("pub-sender-ligaen", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=63.4286,10.3641");
  var IDAG = new Date().toISOString().slice(0, 10);
  var RBK = { nokkel: "rbkpobbogsant", navn: "RBK. Pøbb og sånt", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  // Et OSLO-sted med noyaktig samme flagg. Det ma IKKE stå her: et sted
  // som sender Eliteserien er ikke et svar for den som star i Trondheim.
  // Flagget lofter stedene som svarer pa kampen, det apner ingen ny dor.
  var OSLO = { nokkel: "oslostedet", navn: "Oslo-stedet", bydel: "Sentrum",
    adresse: "Gata 1", lat: 59.9139, lon: 10.7522, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: [RBK, OSLO] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    var panel = document.querySelector(".kamp-panel");
    // Etter #127 star de naere stedene FRAMME — «Andre fotballpuber» er
    // bare der nar det finnes noe a folde ut. Stedet her ligger i dora,
    // sa knappen trenger ikke finnes.
    var apne = panel.querySelector(".pub-apne");
    if (apne) apne.click();
    setTimeout(function () { try {
      var forslag = panel;
      ok("stedet med ligaflagg star der",
         forslag.textContent.indexOf("Pøbb") > -1,
         forslag.textContent.slice(0, 200) || "(tomt)");
      // Merket NAVNGIR ligaen. «Viser vanligvis kamper» ville latt
      // leseren tro det gjaldt kampen hen ser pa.
      var merke = forslag.querySelector(".pub-liga");
      ok("og baerer et merke som navngir ligaen",
         !!merke && merke.getAttribute("aria-label") === "Sender Eliteserien",
         merke ? merke.getAttribute("aria-label") : "(intet merke)");
      // Merket er ikke stjerna: ingen har krysset av denne kampen.
      ok("men ikke stjerna — ingen har sett pa denne kampen",
         !forslag.querySelector(".pub-bekreftet"), forslag.textContent.slice(0, 200));
      // DEN VIKTIGSTE: flagget er ikke en ny dor inn i lista. Oslo-stedet
      // har nøyaktig samme flagg, og skal likevel ikke sta her — ellers
      // er vi tilbake til feilen stampubene ble tommet for a unnga.
      ok("men et sted i en ANNEN by kommer ikke med pa flagget alene",
         forslag.textContent.indexOf("Oslo-stedet") === -1,
         forslag.textContent.slice(0, 260));
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

/* ------------- 14L. «ikke denne kvelden» ------------- */

// Hullet ligaflagget lagde. 📺 «Sender Eliteserien» er en staende pastand
// om sesongen, og stedet er stengt nettopp denne kvelden. Uten en vei til
// a si det, var eneste utvei a ta HELE flagget bort.
const SAK_14L = kjor("pub-ikke-denne-kvelden", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=63.4286,10.3641");
  var IDAG = new Date().toISOString().slice(0, 10);
  var RBK = { nokkel: "rbkpobbogsant", navn: "RBK. Pøbb og sånt", bydel: "Ila",
    adresse: "Gata 2", lat: 63.4286, lon: 10.3641, type: "sportsbar", lag: [],
    kilde: "Var innom 18.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: "2026-09-18", merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  // Nei-et gjelder den FORSTE kampen. Den andre skal beholde merket sitt —
  // ellers har vi bare skrudd av flagget med en omvei.
  // Nei-et gjelder BARE den forste kampen. Star merket igjen pa den
  // andre, er nei-et per kamp — og det var hele poenget. Slo det ut alle,
  // hadde vi bare skrudd av flagget med en omvei.
  window.__visninger = [
    { pub: "RBK. Pøbb og sånt", kamp_id: "2026-09-20-brann-bodoglimt",
      kamp: "Brann – Bodo/Glimt", viser: false },
  ];
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: [RBK] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: window.__visninger })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({
          liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
          kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
          kamper: ARETS, runde: "Runde 5" })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rader = document.querySelectorAll(".kamp.delbar");
    var forste = rader[0];
    forste.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var apne = panel.querySelector(".pub-apne");
    if (apne) apne.click();
    setTimeout(function () { try {
      // Kampen stedet sa nei til: stedet star der fortsatt (det ligger
      // femti meter unna), men UTEN 📺 — flagget er sagt imot.
      ok("stedet star der fortsatt",
         panel.textContent.indexOf("Pøbb") > -1,
         panel.textContent.slice(0, 200) || "(tomt)");
      ok("men merket er borte for kampen stedet sa nei til",
         !panel.querySelector(".pub-liga"),
         panel.textContent.slice(0, 240));

      // Og den NESTE kampen: samme sted, samme flagg, ingen nei.
      forste.querySelector(".kamp-del").click();
      rader[1].querySelector(".kamp-del").click();
      var panel2 = document.querySelectorAll(".kamp-panel")[0];
      var apne2 = panel2.querySelector(".pub-apne");
      if (apne2) apne2.click();
      setTimeout(function () { try {
        ok("men merket star pa den neste kampen",
           !!panel2.querySelector(".pub-liga"),
           panel2.textContent.slice(0, 240) || "(tomt)");
        ferdig();
      } catch (e) { ok("ingen unntak pa kamp to", false, e.message); ferdig(); } }, 700);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`);

const SAK_15 = kjor("admin", `
  // Skrivingen gar med admins egen okt na (#79), ikke med en nokkel:
  // RLS slar opp uid-en i visning_skrivere, og ADMIN_PASSORD betyr
  // ingenting for Supabase. Uten en okt i localStorage skal portalen si
  // fra framfor a sende noe — det testes lenger nede.
  // Uid-en er den samme som Kari sin i brukerlista under: den raden er
  // «deg», og portalen skal si det ved siden av «Sist palogget». En uid
  // som ikke likner en ekte ville gjort merket umulig a teste.
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer",
      bruker: "11111111-2222-3333-4444-555555555555", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var KAMPER_ES = [
    { id: 501, hjemme: "Rosenborg", borte: "Brann", dato: "2026-09-20T17:00:00+00:00", arena: "Lerkendal Stadion", runde: "Runde 21" },
    { id: 502, hjemme: "Vaalerenga", borte: "Bodo/Glimt", dato: "2026-09-21T15:00:00+00:00", arena: "Intility Arena", runde: "Runde 21" },
    // Runde 22: en pub som vet hva den viser om to uker, skal kunne fore
    // det inn na. For stoppet lista ved neste runde.
    { id: 503, hjemme: "Viking", borte: "Lillestrom", dato: "2026-09-27T16:00:00+00:00", arena: "SR-Bank Arena", runde: "Runde 22" }
  ];
  var KAMPER_PL = [
    { id: 901, hjemme: "Arsenal", borte: "Liverpool", dato: "2026-09-19T14:00:00+00:00", arena: "Emirates Stadium" }
  ];
  var sendt = null;
  var innlogging = null;
  var bedtOm = [];
  var brukerKall = [];

  // Et tidspunkt som ALLTID ligger i samme Oslo-dogn som naa.
  //
  // Sto som Date.now() - 3600000, og testen krevde «I dag». Mellom midnatt
  // og 01:00 i Oslo er én time siden i GAAR, og da sto testen rod mens
  // koden var riktig — osloDogn i pin-data.js regner nettopp
  // kalenderdogn, og gjor det rett. CI kjorer i UTC, saa dette traff
  // mellom 22 og 23 UTC hvert dogn.
  //
  // Det er samme felle som feilen kolonnen ble laget for: «I dag 23:00»
  // klokka 01:00 natt til dagen etter. Et dogn er ikke 24 timer bakover.
  function iDagIOslo(msTilbake) {
    var naa = Date.now();
    // sv-SE gir «2026-09-21 00:04:12» — ISO-liknende, og lokaliseringen
    // er det eneste vi trenger fra den.
    var iOslo = new Date(naa).toLocaleString("sv-SE", { timeZone: "Europe/Oslo" });
    var kl = iOslo.split(" ")[1].split(":");
    var sidenMidnatt = ((+kl[0] * 60 + +kl[1]) * 60 + +kl[2]) * 1000;
    // Ett minutt etter midnatt er grensa: da staar klokkeslettet fortsatt
    // i dag, og testen maaler bucketet, ikke tallet.
    return naa - Math.min(msTilbake, Math.max(0, sidenMidnatt - 60000));
  }
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
        runder: pl ? ["Runde 5"] : ["Runde 21", "Runde 22"],
        kamper: pl ? KAMPER_PL : KAMPER_ES });
    }
    if (u.indexOf("/api/brukere") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      var bk = JSON.parse(opt.body);
      brukerKall.push(bk);
      if (bk.passord !== "hemmelig") return svar(401, { feil: "Feil passord" });
      if (bk.handling === "liste") {
        // «sist» er PIN-datoen, «aktiv» er okta. Kari tastet PIN-en for
        // fem dager siden og har appen i gang na; Ola har ingen levende
        // okt. Nettopp den forskjellen kolonnen finnes for (ADR 0021).
        return svar(200, { brukere: [
          { id: "11111111-2222-3333-4444-555555555555", navn: "Kari", slug: "kari",
            forst: "2026-09-01T10:00:00Z", sist: "2026-09-12T19:00:00Z",
            aktiv: new Date(iDagIOslo(3600000)).toISOString() },
          { id: "66666666-7777-8888-9999-000000000000", navn: "Ola", slug: "ola",
            forst: "2026-08-20T10:00:00Z", sist: "2026-08-20T10:00:00Z", aktiv: "" }
        ] });
      }
      if (bk.handling === "pin") return svar(200, { ok: true });
      if (bk.handling === "slett") return svar(200, { slettet: true });
      return svar(400, { feil: "Ukjent handling" });
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
    // Brukerlista er den mest folsomme delen av portalen. Ingenting derfra
    // skal hentes for passordet er godtatt.
    ok("ingen brukere hentes for innlogging", brukerKall.length === 0,
       JSON.stringify(brukerKall));

    var puber = document.getElementById("pub");
    ok("pubene fra lista kan velges", puber.options.length > 10, puber.options.length);
    ok("usikre puber star ikke i lista",
       puber.textContent.indexOf("usikker") === -1);

    var ligaer = document.getElementById("liga");
    var ligaVerdier = Array.prototype.map.call(ligaer.options, function (o) { return o.value; });
    ok("ligaene kommer fra fotballmodulen",
       ligaVerdier.length === 5 && ligaVerdier[0] === "eliteserien" &&
       ligaVerdier.indexOf("laliga") > -1, ligaVerdier.join(","));

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
        ok("hele vinduet er avkryssbart, ikke bare neste runde",
           bokser.length === 3, bokser.length);
        var skiller = document.querySelectorAll(".runde-skille");
        // Overskrifta baerer bade rundenavnet og hvor mange som er valgt i
        // den, sa sjekken er pa at navnet star forst — ikke pa hele
        // teksten. Tallet har sin egen test i 15D.
        ok("hver runde far sin egen overskrift",
           skiller.length === 2 && skiller[0].textContent.indexOf("Runde 21") === 0 &&
           skiller[1].textContent.indexOf("Runde 22") === 0,
           Array.prototype.map.call(skiller, function (r) { return r.textContent; }).join("|"));
        ok("kampen to uker fram er med",
           document.getElementById("kamper").textContent.indexOf("Viking") > -1);
        ok("og hintet sier hvor langt fram lista gar",
           document.getElementById("kampHint").textContent.indexOf("2 runder framover") > -1,
           document.getElementById("kampHint").textContent);
        ok("kampen star med lag og tid",
           document.getElementById("kamper").textContent.indexOf("Rosenborg – Brann") > -1,
           document.getElementById("kamper").textContent.slice(0, 120));
        ok("runden og kilden star under lista",
           document.getElementById("kampHint").textContent.indexOf("Runde 21") > -1,
           document.getElementById("kampHint").textContent);

        // BRUKERVENNLIGHET (meldt 16. september 2026): «Lagre» la i en egen
        // seksjon nederst, etter Foreslatte steder, Steder og Brukere — tre
        // seksjoner som ikke har noe med den a gjore — mens den lagret
        // kampene her oppe. «Kryss av alle» la samme sted: en knapp som
        // opererer pa en liste du ikke ser mens du trykker den.
        var kampSeksjon = document.getElementById("kamper").closest("section");
        ok("lagreknappen star i seksjonen den lagrer",
           kampSeksjon.contains(document.getElementById("lagre")));
        ok("og kryss-av-knappene ved lista de krysser av",
           kampSeksjon.contains(document.getElementById("merkAlle")) &&
           kampSeksjon.contains(document.getElementById("merkIngen")));
        // Klebrig: med tjue kamper er knappen ute av syne nar du er ferdig.
        ok("handlingsraden folger med nar lista ruller",
           getComputedStyle(document.querySelector(".handling")).position === "sticky",
           getComputedStyle(document.querySelector(".handling")).position);

        // Feil pub valgt er den ene feilen som ellers er usynlig til etter
        // lagring: pub-velgeren er en egen seksjon over lista.
        ok("overskrifta sier hvilken pub du krysser av for",
           document.getElementById("kampTittel").textContent === "Kamper " + puber.value + " viser",
           document.getElementById("kampTittel").textContent);

        bokser[0].checked = true;
        bokser[0].dispatchEvent(new Event("change", { bubbles: true }));
        // «Lagre» alene sier ikke hva den lagrer. Og fra 18. september
        // sier den hva trykket GJOR, ikke hvor mange som star avkrysset:
        // «Lagre 6 kamper» nar du la til én er sant om det som sendes og
        // usant om det du gjor. Denne puben har ingenting fra for, sa én
        // avkrysning er én tilfoyelse.
        ok("knappen sier hva trykket gjor, og for hvem",
           document.getElementById("lagre").textContent === "Legg til 1 kamp for " + puber.value,
           document.getElementById("lagre").textContent);
        bokser[1].checked = true;
        bokser[1].dispatchEvent(new Event("change", { bubbles: true }));
        ok("og teller riktig i flertall",
           document.getElementById("lagre").textContent === "Legg til 2 kamper for " + puber.value,
           document.getElementById("lagre").textContent);
        bokser[1].checked = false;
        bokser[1].dispatchEvent(new Event("change", { bubbles: true }));
        // Denne puben har ingenting lagret fra for. Da er null avkrysset
        // det samme som det som star i basen, og «Fjern alle kamper» ville
        // lovet en fjerning som ikke ville fjernet noe.
        //
        // Har puben kamper lagret, betyr null avkrysset noe annet — a ta
        // dem bort — og da sier knappen nettopp det. Den tilstanden er
        // voktet i 15D, som har visninger fra for.
        document.getElementById("merkIngen").click();
        ok("uten kryss og uten noe lagret er det ingenting a gjore",
           document.getElementById("lagre").textContent === "Ingen kamper satt for " + puber.value &&
           document.getElementById("lagre").disabled === true,
           document.getElementById("lagre").textContent);

        bokser[0].checked = true;
        bokser[0].dispatchEvent(new Event("change", { bubbles: true }));
        document.getElementById("lagre").click();

    setTimeout(function () { try {
      ok("valget sendes til tjenesten", !!sendt);
      ok("bare den avkryssede kampen er med",
         sendt.kampIder.length === 1 && sendt.kampIder[0] === "2026-09-20-rosenborg-brann",
         JSON.stringify(sendt.kampIder));
      ok("puben blir med", sendt.pub === puber.value, sendt.pub);
      ok("passordet blir med", sendt.passord === "hemmelig");
      // Passordet apner skjemaet; okten er den databasen faktisk sjekker.
      ok("og okten din, som er den databasen sjekker",
         sendt.token === "okt-token", sendt.token);
      // Alle kampene pa skjermen sendes med, ogsa de i runden etter:
      // slaSammen rorer bare dem, og en kamp admin fjernet avkryssingen
      // pa skal faktisk bli fjernet.
      ok("kampene pa skjermen sendes med, sa tjenesten slipper a gjette",
         sendt.kamper.length === 3 && sendt.kamper[0].hjemme === "Rosenborg" &&
         sendt.kamper[2].hjemme === "Viking",
         JSON.stringify(sendt.kamper.map(function (k) { return k.hjemme; })));
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
             sendt.kampIder.length === 1 &&
             sendt.kampIder[0] === "2026-09-19-arsenal-liverpool", JSON.stringify(sendt.kampIder));

          /* ---- brukerne ---- */

          var rader = document.querySelectorAll("#brukerRader tr");
          ok("brukerne star i portalen etter innlogging", rader.length === 2, rader.length);
          // Ikke «det ene kallet»: portalen henter ogsa versjonen ved
          // innlogging (22. september 2026), og en test som teller kall
          // maalte hvor mange handlinger som fantes framfor det den ville
          // vite. Det den vil vite er at HVERT kall baerer passordet.
          var listeKall = brukerKall.filter(function (k) {
            return k.handling === "liste"; });
          ok("og passordet ble sendt med",
             listeKall.length === 1 && listeKall[0].passord === "hemmelig",
             JSON.stringify(brukerKall));
          ok("og ingen av kallene gaar uten passord og okt",
             brukerKall.length > 0 && brukerKall.every(function (k) {
               return k.passord === "hemmelig" && !!k.token; }),
             JSON.stringify(brukerKall.map(function (k) { return k.handling; })));
          ok("raden viser navnet",
             rader[0].querySelector(".navn").textContent === "Kari",
             rader[0].querySelector(".navn").textContent);
          // Forst og sist er to ulike kolonner: admin skal kunne se hvem som
          // aldri kom tilbake etter forste gang.
          var tider = rader[0].querySelectorAll(".tid");
          ok("og bade forste gang og sist inne",
             tider.length === 2 && tider[1].textContent.indexOf("I dag") === 0,
             tider[1] && tider[1].textContent);
          ok("en ISO-streng star aldri pa skjermen",
             document.getElementById("brukere").textContent.indexOf("T10:00:00Z") === -1,
             document.getElementById("brukere").textContent.slice(0, 120));
          // Kolonnen er last_sign_in_at: sist noen tastet PIN-en. En fornyet
          // okt rorer ikke feltet, sa «Sist inne» pastod bruk vi ikke maler —
          // og en som var innlogget i det oyeblikket leste «2 dager siden».
          // Overskriften ma si palogging, og siden ma forklare forskjellen.
          var hoder = document.querySelectorAll("#brukere thead th");
          var hodetekst = Array.prototype.map.call(hoder, function (h) {
            return h.textContent.trim();
          }).join("|");
          // Fra 17. september er «Sist inne» sant: kolonnen leser oktene,
          // ikke PIN-datoen (ADR 0021).
          ok("kolonnen heter det feltet faktisk er",
             hodetekst.indexOf("Sist inne") !== -1 &&
             hodetekst.indexOf("Sist pålogget") === -1, hodetekst);
          var brukerAvsnitt = document.querySelectorAll("#brukere");
          var seksjon = brukerAvsnitt[0].closest("section").textContent;
          ok("og siden sier hva det er, og hva det ikke er",
             seksjon.indexOf("sist appen var i gang") !== -1 &&
             seksjon.indexOf("ikke sist de tastet PIN-en") !== -1,
             seksjon.slice(0, 260));

          // Timen som gikk er okta, ikke PIN-datoen fra 12. september.
          // Leste cella «sist», ville det statt en dato flere dager
          // tilbake — og det var hele feilen som ble meldt to dager pa rad.
          var inneCelle = rader[0].querySelectorAll(".tid")[1];
          ok("cella viser okta, ikke PIN-datoen",
             inneCelle.textContent.indexOf("I dag") === 0, inneCelle.textContent);
          // PIN-datoen er ikke borte — den trengs nar noen har glemt sin.
          ok("PIN-datoen ligger i hjelpeteksten",
             (inneCelle.title || "").indexOf("Tastet PIN-en sist") === 0,
             inneCelle.title);
          // Uten en levende okt star det noe, ikke ingenting: en tom celle
          // er ikke til a skille fra «har aldri vaert inne».
          var utenOkt = rader[1].querySelectorAll(".tid")[1];
          ok("uten okt star det at det ikke finnes en",
             utenOkt.textContent.indexOf("Ingen økt i live") === 0,
             utenOkt.textContent);
          ok("og PIN-datoen star likevel i hjelpeteksten",
             (utenOkt.title || "").indexOf("Tastet PIN-en sist") === 0, utenOkt.title);

          // «Jeg er inne men det star 2 dager siden.» Begge deler er sant:
          // du er innlogget na, og feltet er sist du TASTET PIN-en. Den ene
          // raden vi kan si noe sant om uten a male noe, er din egen —
          // okta ligger i denne nettleseren, og uid-en er den samme.
          var deg = document.querySelectorAll("#brukere .deg");
          ok("din egen rad sier at det er deg", deg.length === 1, deg.length);
          ok("og at du er innlogget na",
             !!deg[0] && deg[0].textContent.indexOf("innlogget nå") > -1,
             deg[0] && deg[0].textContent);
          // Den ma sta ved siden av datoen den svarer pa, ikke ved navnet.
          ok("merket star i palogget-cella, ikke ved navnet",
             !!deg[0] && deg[0].closest("td").className === "tid" &&
             deg[0].closest("td").getAttribute("data-merke") === "Sist inne",
             deg[0] && deg[0].closest("td").className);
          // Bare din egen: et merke pa alles rader ville pastatt at alle er
          // innlogget, og det vet vi ingenting om.
          ok("og bare pa din egen rad",
             rader[0].querySelectorAll(".deg").length +
             rader[1].querySelectorAll(".deg").length === 1,
             rader[0].querySelectorAll(".deg").length + " og " +
             rader[1].querySelectorAll(".deg").length);

          // Sida heter «Admin», ikke noe lengre.
          ok("sida heter Admin", document.title === "Admin", document.title);
          ok("og overskrifta ogsa",
             document.querySelector("h1").textContent === "Admin",
             document.querySelector("h1").textContent);
          // To pastander sto i undertittelen og var ikke sanne lenger.

          // **Seksten piksler.** Safari pa iPhone zoomer inn av seg selv
          // nar du fokuserer et felt med mindre skrift enn 16 px, og etter
          // den zoomen er hele sida pannbar sidelengs.
          //
          // Meldt to ganger som «jeg kan scrolle skjermen til venstre og
          // hoyre». Forste gang lette jeg etter noe som var for bredt, og
          // brukertabellen VAR det — men etter at den var rettet, sto
          // feilen der fortsatt. Andre gang malte jeg hvert eneste element
          // og fant ingenting over 320 px. Layouten var riktig hele tiden;
          // det var forstoerrelsen.
          //
          // Derfor maler denne skriftstoerrelse framfor bredde: bredden var
          // aldri problemet, og en vakt som maler feil ting er en vakt som
          // sier «alt er bra» mens telefonen gjor noe annet.
          //
          // Seksjonene er sammenleggbare fra 21. september 2026, og de
          // fleste star lukket. Begge vaktene her maler HELE portalen, sa
          // alt apnes foerst: en vakt som bare maler det som tilfeldigvis
          // er framme, maler ikke portalen — den maler dagens tilstand,
          // og sier «alt er bra» om et felt som star en knapp unna.
          function apneAlt(rot) {
            Array.prototype.forEach.call(
              rot.querySelectorAll(".seksjon-hode, .trinn-hode"), function (h) {
                h.setAttribute("aria-expanded", "true");
                var kropp = rot.querySelector("#" + h.getAttribute("aria-controls"))
                  || (rot.getElementById && rot.getElementById(h.getAttribute("aria-controls")));
                if (kropp) kropp.hidden = false;
              });
            // Stedsskjemaet ligger bak «Nytt sted» og er det lengste i
            // portalen. Det er nettopp det som ma males.
            var skjema = rot.querySelector("#stedSkjema");
            if (skjema) skjema.hidden = false;
          }
          apneAlt(document);

          var smaaFelt = [];
          Array.prototype.forEach.call(
            document.querySelectorAll("input, select, textarea"), function (e) {
              if (e.type === "checkbox" || e.type === "radio") return;
              var px = parseFloat(getComputedStyle(e).fontSize);
              if (!(px >= 16)) {
                smaaFelt.push((e.id || e.className || e.tagName) + " " + px + "px");
              }
            });
          ok("ingen felt er sa sma at iPhone zoomer inn i dem",
             smaaFelt.length === 0, smaaFelt.join(", "));
          // Tallet leses av MARKUPEN, ikke skrevet som 5: det sto slik, og
          // gled i det en seksjon kom til (22. september 2026, versjonen).
          // Det testen vil vite er at ALLE er apne — «5» var bare hvor
          // mange som fantes den dagen.
          var alleKropper = document.querySelectorAll(".seksjon-kropp").length;
          var apneKropper = document.querySelectorAll(".seksjon-kropp:not([hidden])").length;
          ok("og de ble malt med alt apent, ikke bare det som sto framme",
             alleKropper > 0 && apneKropper === alleKropper,
             apneKropper + " av " + alleKropper + " apne");

          // Sida skal fa plass pa en telefon. Meldt 17. september 2026:
          // «Den er los pa mobil, dvs jeg kan scrolle hele skjermen til
          // venstre og hoyre.» Brukertabellen trengte 457 px; en iPhone 13
          // mini gir 343.
          //
          // Males i en boks med kjent bredde, ikke mot viewporten:
          // --window-size binder ikke likt lokalt og pa CI, og en test som
          // maler et vindu den ikke styrer, maler ingenting. 320 px er
          // smalere enn noen iPhone i bruk, sa det er margin i tallet.
          var maleboks = document.createElement("div");
          maleboks.style.cssText = "width:320px;position:absolute;left:0;top:0;" +
            "visibility:hidden;overflow:visible;";
          var kopi = document.querySelector("main").cloneNode(true);
          kopi.style.maxWidth = "320px";
          // Kopien ogsa: et skjult panel har ingen bredde, og da ville
          // vakta sagt at portalen far plass fordi mesteparten av den ikke
          // ble tegnet.
          apneAlt(kopi);
          maleboks.appendChild(kopi);
          document.body.appendChild(maleboks);
          var trengs = kopi.scrollWidth;
          // Hva som er for bredt, ikke bare at noe er det: uten navnet er
          // meldinga et tall uten et sted a lete.
          var verstinger = [];
          Array.prototype.forEach.call(kopi.querySelectorAll("*"), function (e) {
            var r = e.getBoundingClientRect();
            if (r.width > 321) {
              verstinger.push(e.tagName + (e.id ? "#" + e.id : "") +
                " (" + Math.round(r.width) + " px)");
            }
          });
          maleboks.remove();
          ok("hele portalen far plass i 320 px, uten a rulle sidelengs",
             trengs <= 320, trengs + " px: " + verstinger.slice(0, 4).join(", "));

          // Ny PIN. En for kort PIN skal stoppes her, ikke hos tjenesten.
          var pinFelt = rader[0].querySelector("input");
          var settKnapp = rader[0].querySelectorAll("button")[0];
          pinFelt.value = "12";
          settKnapp.click();
          // «Stoppes i portalen» betyr at ingen PIN ble sendt — ikke at
          // det bare fantes ett kall. Det sto som brukerKall.length === 1,
          // og gled i det portalen fikk enda en handling.
          ok("en for kort PIN stoppes i portalen",
             !brukerKall.some(function (k) { return k.handling === "pin"; }) &&
             document.getElementById("brukerMelding").textContent.indexOf("minst") > -1,
             document.getElementById("brukerMelding").textContent);

          pinFelt.value = "45 67";
          settKnapp.click();
          setTimeout(function () { try {
            var satt = brukerKall[brukerKall.length - 1];
            ok("en gyldig PIN sendes, renset, med id og passord",
               satt.handling === "pin" && satt.pin === "4567" &&
               satt.id === "11111111-2222-3333-4444-555555555555" &&
               satt.passord === "hemmelig", JSON.stringify(satt));
            // Admin ma kunne si PIN-en videre: den kan ikke leses igjen.
            ok("og den nye PIN-en star pa skjermen en gang",
               document.getElementById("brukerMelding").textContent.indexOf("4567") > -1,
               document.getElementById("brukerMelding").textContent);
            ok("feltet tommes etterpa", pinFelt.value === "", pinFelt.value);

            // Sletting er endelig, sa den krever to trykk.
            var forStatus = brukerKall.length;
            var slettKnapp = rader[0].querySelectorAll("button")[1];
            slettKnapp.click();
            ok("forste trykk sletter ingenting", brukerKall.length === forStatus,
               brukerKall.length + " mot " + forStatus);
            ok("og sier hva som kommer til a skje",
               document.getElementById("brukerMelding").textContent.indexOf("ledig igjen") > -1,
               document.getElementById("brukerMelding").textContent);

            slettKnapp.click();
            setTimeout(function () { try {
              var slett = brukerKall.filter(function (k) { return k.handling === "slett"; });
              ok("andre trykk sletter, pa den ene id-en",
                 slett.length === 1 &&
                 slett[0].id === "11111111-2222-3333-4444-555555555555",
                 JSON.stringify(slett));
              ok("og lista hentes pa nytt etterpa",
                 brukerKall.filter(function (k) { return k.handling === "liste"; }).length === 2,
                 JSON.stringify(brukerKall.map(function (k) { return k.handling; })));

              // Uten okt er det ingenting a skrive med. Passordet apner
              // skjemaet, men det er databasen som avgjor skrivingen —
              // og da skal portalen si det framfor a sende noe som blir
              // avvist med 401 pa noe som ser ut som passordet.
              try { localStorage.removeItem("sb-konto"); } catch (e) { /* privat modus */ }
              sendt = null;
              // Knappen er avslatt sa lenge boksene star som de ble lagret.
              // Et kryss forst, sa det faktisk finnes noe a lagre — ellers
              // tester vi at en avslatt knapp ikke sender, og det er en
              // annen sak enn at vakta mot manglende okt virker.
              var enBoks = document.querySelectorAll(".kamp input")[0];
              enBoks.checked = !enBoks.checked;
              enBoks.dispatchEvent(new Event("change", { bubbles: true }));
              document.getElementById("lagre").click();
              setTimeout(function () { try {
                ok("uten innlogging i appen sendes ingen lagring", !sendt, JSON.stringify(sendt));
                ok("og portalen sier hvorfor",
                   document.getElementById("melding").textContent.indexOf("logget inn i appen") > -1,
                   document.getElementById("melding").textContent);
                ferdig();
              } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 200);
            } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 200);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 600); });
`, null, adminSide);

/* ---------------- 15B. stedredigeringen i portalen ---------------- */

// Egen side framfor flere lag inni SAK_15: det som testes her er en annen
// seksjon, og en test som ligger sju tilbakekall dypt er ikke til a rette.
//
// Fila er grunnfjellet. Editoren skriver rettelsene oppa, og portalen skal
// vise begge deler — hva som star i puber.js, og hva som er rettet
// herfra (#80, ADR 0020).
const SAK_15B = kjor("admin-steder", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var stedKall = [];
  var lagret = [];
  // Koen, med et forslag som svarer til stedet som lagres lenger nede.
  var forslagKall = [];
  var koen = [{ id: 7, navn: "Bar Boca", adresse: "Thorvald Meyers gate 30",
                viserFotball: true, merknad: "", foreslatt: "2026-09-18", status: "ny" }];
  // Basen barer én rettelse fra for: Scotsman er tatt ut av lista.
  var iBasen = [{ nokkel: "scotsman", navn: "Scotsman", fjernet: true }];

  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-liste") === 0) {
      var k = JSON.parse(opt.body);
      stedKall.push(k);
      if (k.handling === "liste") return svar(200, { puber: iBasen, klar: true });
      if (k.handling === "sok") {
        return svar(200, { kilde: "OpenStreetMap", treff: [
          { navn: "Bar Boca", adresse: "Thorvald Meyers gate 30", lat: 59.9231,
            lon: 10.7588, slag: "bar", nettsted: "https://barboca.no/" }
        ] });
      }
      lagret.push(k.pub);
      iBasen = iBasen.concat([Object.assign({ nokkel: k.pub.navn.toLowerCase() }, k.pub)]);
      return svar(200, { ok: true, pub: k.pub, merknad: "Lagret." });
    }
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { ok: true });
    }
    if (u.indexOf("/api/brukere") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { brukere: [] });
    }
    if (u.indexOf("/api/pub-forslag") === 0) {
      var f = JSON.parse((opt || {}).body || "{}");
      forslagKall.push(f);
      if (f.handling === "behandle") {
        koen = koen.map(function (r) {
          return r.id === f.id ? Object.assign({}, r, { status: f.status }) : r;
        });
        return svar(200, { ok: true });
      }
      return svar(200, { forslag: koen });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kamper: [], runder: [] });
    }
    return svar(200, {});
  };

  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();

    setTimeout(function () { try {
      var rader = felt("stedListe").querySelectorAll("li");
      ok("stedene star i portalen", rader.length > 20, rader.length);
      ok("og hinten sier hvor mange som er rettet herfra",
         felt("stedHint").textContent.indexOf("1 er rettet herfra") > -1,
         felt("stedHint").textContent);

      // Fila nederst, basen oppa. Scotsman er tatt ut, men raden skal
      // fortsatt kunne apnes — ellers er det ingen vei tilbake.
      var tekst = felt("stedListe").textContent;
      ok("et sted som er tatt ut er merket", tekst.indexOf("tatt ut") > -1, tekst.slice(0, 200));
      ok("og det star bare én gang",
         tekst.split("Scotsman").length - 1 === 1, tekst.split("Scotsman").length - 1);

      // Pubvelgeren over skal si det samme som lista: et sted som er tatt
      // ut kan ikke velges. To lister som er uenige er verre enn én.
      var velger = felt("pub");
      var navnene = Array.prototype.map.call(velger.options, function (o) { return o.value; });
      ok("pubvelgeren mister stedet som er tatt ut",
         navnene.indexOf("Scotsman") === -1, navnene.slice(0, 5).join(", "));
      ok("men beholder resten av lista", navnene.length > 20, navnene.length);

      // Skjemaet star ikke framme uoppfordret.
      // Filter paa by. Meldt 19. september 2026: lista vokser med hver by,
      // og seksogtjue rader er ikke noe man leser seg gjennom for a finne
      // den ene i Trondheim.
      //
      // Velgeren bygges av koordinatene som faktisk ligger i lista: en by
      // uten steder er et valg som ikke gir noe.
      var filterRad = felt("stedFilterRad");
      var velger = felt("stedFilterBy");
      ok("filteret staar der naar det finnes mer enn én gruppe",
         filterRad.hidden === false, "skjult");
      var valgene = Array.prototype.map.call(velger.options,
        function (o) { return o.textContent; });
      ok("alle-valget teller radene", valgene[0].indexOf("Alle byer (") === 0, valgene.join(" | "));
      ok("og Oslo staar med sitt eget tall",
         valgene.some(function (t) { return t.indexOf("Oslo (") === 0; }), valgene.join(" | "));
      // Scotsman er tatt ut og har ingen koordinater i det hele tatt. En
      // rad som er tatt ut slipper gjennom paa navnet alene, saa den KAN
      // mangle dem — og et filter som skjuler den, har tatt den ut av
      // portalen.
      ok("og radene uten koordinat har sin egen gruppe",
         valgene.some(function (t) { return t.indexOf("Uten koordinat (") === 0; }),
         valgene.join(" | "));

      var antallRader = function () { return felt("stedListe").querySelectorAll("li").length; };
      var alleRader = antallRader();
      velger.value = "oslo";
      velger.dispatchEvent(new Event("change"));
      ok("ett valg snevrer lista inn", antallRader() < alleRader,
         antallRader() + " av " + alleRader);
      ok("og Scotsman-raden som er tatt ut er ute av den",
         felt("stedListe").textContent.indexOf("tatt ut") === -1,
         felt("stedListe").textContent.slice(0, 120));
      // Tallet som staar, maa vaere tallet som vises: «26 steder i lista»
      // over en liste med ett sted leses som at de andre er borte.
      ok("og hinten sier hva som vises, ikke hva lista inneholder",
         felt("stedHint").textContent.indexOf("Viser ") === 0 &&
         felt("stedHint").textContent.indexOf("i Oslo") > -1,
         felt("stedHint").textContent);

      velger.value = "uten";
      velger.dispatchEvent(new Event("change"));
      ok("radene uten koordinat kan naas",
         felt("stedListe").textContent.indexOf("Scotsman") > -1,
         felt("stedListe").textContent.slice(0, 120));

      velger.value = "";
      velger.dispatchEvent(new Event("change"));
      ok("og alt kommer tilbake", antallRader() === alleRader,
         antallRader() + " av " + alleRader);

      // Feltene som MA fylles ut, skal SI det — ikke avsloere det etter at
      // du har trykket lagre. Meldt 19. september 2026.
      //
      // Lista leses ut av PUBLISTE_FELT i pub-data.js, ikke skrevet ved
      // siden av den. Star det et navn der uten et felt i skjemaet, blir
      // det staaende i dataset.umerket — og denne testen er hele grunnen
      // til at feltet finnes.
      ok("hvert pakrevd felt i PUBLISTE_FELT er merket",
         felt("stedSkjema").dataset.umerket === "",
         "umerket: " + felt("stedSkjema").dataset.umerket);
      var merket = function (id) {
        var l = document.querySelector('label[for="' + id + '"]');
        return !!l && !!l.querySelector(".pakrevd");
      };
      ok("navn, bydel og koordinatene er merket",
         merket("stedNavn") && merket("stedBydel") &&
         merket("stedLat") && merket("stedLon"));
      // Kilde og sjekket er de to som oftest mangler, og begge ser ut som
      // noe man kan hoppe over. De er nettopp de som ikke er pynt.
      ok("og kilde, sjekket, type og sikkerhet",
         merket("stedKilde") && merket("stedSjekket") &&
         merket("stedType") && merket("stedSikkerhet"));
      // Og merkingen ma vaere SANN: adressen, laget og merknaden slipper
      // gjennom validatoren uten verdi. En stjerne der ville sagt at noe
      // kreves som ikke gjor det.
      ok("men ikke feltene som faktisk er valgfrie",
         !merket("stedAdresse") && !merket("stedLag") && !merket("stedMerknad"),
         "adresse " + merket("stedAdresse") + ", lag " + merket("stedLag") +
         ", merknad " + merket("stedMerknad"));
      // Byen styrer bare soket og lagres ikke, sa den kreves ikke.
      ok("og ikke byvelgeren, som ikke lagres", !merket("stedBy"));
      ok("skjermleseren far det samme som oyet",
         felt("stedKilde").getAttribute("aria-required") === "true" &&
         felt("stedAdresse").getAttribute("aria-required") === null,
         felt("stedKilde").getAttribute("aria-required"));
      ok("og forklaringa staar over skjemaet",
         felt("stedPakrevdNote").textContent.indexOf("må fylles ut") > -1,
         felt("stedPakrevdNote").textContent);

      // Tas stedet ut av lista, kreves bare navnet: sjekkPubRad slipper en
      // fjernet rad gjennom pa navnet alene. Da er atte stjerner usant.
      felt("stedFjernet").checked = true;
      felt("stedFjernet").dispatchEvent(new Event("change"));
      ok("tas stedet ut, sier forklaringa at navnet holder",
         felt("stedPakrevdNote").textContent.indexOf("holder det med navnet") > -1,
         felt("stedPakrevdNote").textContent);
      felt("stedFjernet").checked = false;
      felt("stedFjernet").dispatchEvent(new Event("change"));
      ok("og tilbake igjen nar det ikke tas ut",
         felt("stedPakrevdNote").textContent.indexOf("må fylles ut") > -1,
         felt("stedPakrevdNote").textContent);

      // Apner du et sted som ALT er tatt ut, setter fyllSted haken uten a
      // utlose change. Da ville forklaringa sagt «ma fylles ut» om felt
      // som ikke kreves — et skjema som lyver om sine egne krav.
      var utRad = Array.prototype.find.call(felt("stedListe").querySelectorAll("li"),
        function (li) { return li.textContent.indexOf("tatt ut") > -1; });
      if (utRad) {
        utRad.querySelector("button").click();
        ok("apner du et sted som alt er tatt ut, sier forklaringa det med en gang",
           felt("stedPakrevdNote").textContent.indexOf("holder det med navnet") > -1,
           felt("stedPakrevdNote").textContent);
        felt("stedAvbryt").click();
      } else {
        ok("apner du et sted som alt er tatt ut, sier forklaringa det med en gang",
           false, "fant ingen rad som er tatt ut");
      }

      ok("skjemaet er skjult til man ber om det", felt("stedSkjema").hidden === true);
      felt("stedNytt").click();
      ok("nytt sted apner skjemaet", felt("stedSkjema").hidden === false);
      ok("og feltene er tomme", felt("stedNavn").value === "" && felt("stedKilde").value === "");
      // Ser du pa stedet i dag, er det i dag du har sjekket det.
      ok("men datoen star pa i dag",
         felt("stedSjekket").value === new Date().toISOString().slice(0, 10),
         felt("stedSjekket").value);

      // Kilde og dato er ikke pynt: en udatert rad er verre enn ingen rad.
      felt("stedNavn").value = "Bar Boca";
      felt("stedBydel").value = "Gr\u00fcnerl\u00f8kka";
      felt("stedLagre").click();

      setTimeout(function () { try {
        ok("en rad uten kilde lagres ikke", lagret.length === 0, JSON.stringify(lagret));
        ok("og det star hva som mangler",
           felt("stedMelding").textContent.indexOf("kilde") > -1,
           felt("stedMelding").textContent);
        ok("meldinga er merket som feil",
           felt("stedMelding").className.indexOf("feil") > -1, felt("stedMelding").className);

        // Oppslaget i OpenStreetMap. Koordinatet er det vi kom for.
        felt("stedSok").click();
        setTimeout(function () { try {
          var treff = felt("stedTreff").querySelectorAll("button");
          ok("navnesoket gir treff", treff.length === 1, treff.length);
          ok("og soket gikk med navnet fra feltet",
             stedKall.filter(function (k) { return k.handling === "sok"; })[0].navn === "Bar Boca");

          treff[0].click();
          ok("treffet fyller koordinatene",
             felt("stedLat").value === "59.9231" && felt("stedLon").value === "10.7588",
             felt("stedLat").value + ", " + felt("stedLon").value);
          ok("og adressen", felt("stedAdresse").value === "Thorvald Meyers gate 30",
             felt("stedAdresse").value);
          // Navnet er nokkelen. OSM skriver ikke alltid det vi skriver, og
          // et navn som endrer seg her ville laget en ny rad.
          ok("men rorer ikke navnet", felt("stedNavn").value === "Bar Boca", felt("stedNavn").value);

          felt("stedKilde").value = "https://barboca.no/";
          felt("stedLagre").click();
          setTimeout(function () { try {
            ok("en hel rad lagres", lagret.length === 1, JSON.stringify(lagret));
            ok("med kilde og dato",
               lagret[0].kilde === "https://barboca.no/" && !!lagret[0].sjekket,
               JSON.stringify(lagret[0]));
            ok("og med lista tegnet pa nytt etterpa",
               stedKall.filter(function (k) { return k.handling === "liste"; }).length === 2,
               stedKall.length);
            ok("skjemaet lukkes nar raden er lagret", felt("stedSkjema").hidden === true);

            // Meldt 18. september 2026: «Jeg provde a lagre RBK pobb og
            // sant. Men ser den fortsatt i forslagskasse.» Lagringen og
            // merkingen var to handlinger for én avgjorelse, og den
            // naturlige er lagringen. Na henger merkingen paa den.
            var behandlet = forslagKall.filter(function (f) {
              return f.handling === "behandle";
            });
            ok("forslaget merkes nar stedet lagres",
               behandlet.length === 1 && behandlet[0].status === "lagt-inn",
               JSON.stringify(behandlet));
            ok("og det er forslaget med samme navn som merkes",
               behandlet.length === 1 && behandlet[0].id === 7,
               JSON.stringify(behandlet));
            ok("og meldinga sier det",
               felt("stedMelding").textContent.indexOf("køen er merket") > -1,
               felt("stedMelding").textContent);
            // Det som kommer over nettet, lander etter at visningen star
            // ferdig: det nye stedet skal vaere valgbart uten en ny apning.
            var etter = Array.prototype.map.call(felt("pub").options, function (o) { return o.value; });
            ok("og det nye stedet kan velges med det samme",
               etter.indexOf("Bar Boca") > -1, etter.slice(-3).join(", "));

            // Navnet er nokkelen. Endres det pa en rad som finnes, blir
            // raden en ny rad — og den gamle star igjen.
            var forsok = lagret.length;
            var knapper = felt("stedListe").querySelectorAll("button");
            knapper[0].click();
            felt("stedNavn").value = "Et helt annet navn";
            felt("stedLagre").click();
            setTimeout(function () { try {
              ok("et nytt navn pa en rad som finnes lagres ikke",
                 lagret.length === forsok, JSON.stringify(lagret));
              ok("og det star hvorfor",
                 felt("stedMelding").textContent.indexOf("nøkkelen") > -1,
                 felt("stedMelding").textContent);
              ferdig();
            } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 200);
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 200);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`, null, adminSide);

/* ---------------- 15C. veien til et koordinat ---------------- */

// Meldt 16. september 2026: «Far ikke svar, dermed ikke lagret da vi ikke
// har koordinater.» Navnesoket var den eneste veien, og det finner ikke
// et sted OpenStreetMap ikke kjenner navnet pa — som er de sma stedene,
// nettopp de admin ma foere inn for hand. Na er det tre veier, og den
// siste av dem spor ingen.
//
// Egen side, som 15B: en test sju tilbakekall dypt er ikke til a rette.
const SAK_15C = kjor("admin-koordinat", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var stedKall = [];
  // Huset slik Overpass gir det: ingen name, bare addr-taggene. Det er
  // nettopp den raden navnesoket kaster.
  var HUSET = { navn: "Berglyveien 4J", adresse: "Berglyveien 4J",
                lat: 59.8432, lon: 10.7988, slag: "" };
  var adresseSvar = { kode: 200, kropp: { kilde: "OpenStreetMap", treff: [HUSET] } };

  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-liste") === 0) {
      var k = JSON.parse(opt.body);
      stedKall.push(k);
      if (k.handling === "liste") return svar(200, { puber: [], klar: true });
      if (k.handling === "sok") {
        // Navnesoket finner ingenting: stedet star ikke i OSM med navn.
        return svar(200, { kilde: "OpenStreetMap", treff: [] });
      }
      if (k.handling === "sok-adresse") return svar(adresseSvar.kode, adresseSvar.kropp);
      return svar(200, { ok: true, pub: k.pub, merknad: "Lagret." });
    }
    if (u.indexOf("/api/visninger") === 0) return svar(200, { klar: true, mangler: [] });
    if (u.indexOf("/api/brukere") === 0) return svar(200, { klar: true, mangler: [] });
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kamper: [], runder: [] });
    }
    return svar(200, {});
  };

  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();

    setTimeout(function () { try {
      // Ingen rettelser i denne scenen, sa alle radene staar i puber.js og
      // ligger i Oslo. Én gruppe er ikke et valg: en velger som bare kan si
      // det den alt viser, er en kontroll uten et valg.
      ok("filteret staar ikke der naar alt er i én by",
         felt("stedFilterRad").hidden === true,
         Array.prototype.map.call(felt("stedFilterBy").options,
           function (o) { return o.textContent; }).join(" | "));

      felt("stedNytt").click();
      felt("stedNavn").value = "RBK. Pøbb og sånt";
      felt("stedAdresse").value = "Berglyveien 4J";

      // 0. «Jeg star her». Den eneste veien inn som virker i Google
      //    Maps-appen: den lange URL-en med koordinatet i finnes bare i
      //    en nettleser med adressefelt (#116).
      var forHer = stedKall.length;
      navigator.geolocation.getCurrentPosition = function (ok_) {
        ok_({ coords: { latitude: 63.4341806, longitude: 10.401078, accuracy: 12 } });
      };
      felt("stedHer").click();
      ok("posisjonen fyller koordinatene",
         felt("stedLat").value === "63.4342" && felt("stedLon").value === "10.4011",
         felt("stedLat").value + ", " + felt("stedLon").value);
      ok("og gjorde det uten a sporre noen tjeneste",
         stedKall.length === forHer, stedKall.length + " mot " + forHer);
      // Trykker du knappen, *er* du der — og det er noyaktig det kilden
      // skal svare pa.
      ok("kilden fylles med at du var innom",
         felt("stedKilde").value.indexOf("Var innom") === 0,
         felt("stedKilde").value);
      // Ingen regex her: en bakoverstrek i en template-streng er borte
      // for nettleseren ser den, sa «\d» blir «d» og monsteret treffer
      // ingenting. Tredje gang den fella slar til i dette prosjektet —
      // og den enkle regelen er a la vaere a skrive bakoverstrek i det
      // hele tatt, ikke a telle dem riktig.
      var datoen = felt("stedKilde").value.replace("Var innom ", "");
      ok("og datoen star pa norsk form i setningen",
         datoen.length === 10 && datoen.split(".").length === 3 &&
         datoen.split(".")[2].length === 4, felt("stedKilde").value);
      // Et punkt med to kilometers usikkerhet er en bygning et annet sted
      // i byen. Fire desimaler ser like presise ut uansett.
      ok("noyaktigheten star i svaret",
         felt("stedHerSvar").textContent.indexOf("12 meter") > -1,
         felt("stedHerSvar").textContent);

      // En kilde som star der fra for er en vurdering. Den skal ikke
      // skrives over av var egen setning.
      felt("stedKilde").value = "https://rbkpub.no/sport";
      felt("stedHer").click();
      ok("en kilde som star der fra for rores ikke",
         felt("stedKilde").value === "https://rbkpub.no/sport",
         felt("stedKilde").value);

      // Avslatt posisjon er ikke en feil, det er et svar — og det krever
      // noe annet av den som leser meldinga.
      navigator.geolocation.getCurrentPosition = function (ok_, nei) {
        nei({ code: 1, message: "User denied Geolocation" });
      };
      felt("stedHer").click();
      ok("nei til posisjon sier hva du kan gjore i stedet",
         felt("stedHerSvar").textContent.indexOf("sa nei til posisjon") > -1 &&
         felt("stedHerSvar").textContent.indexOf("lim det inn") > -1,
         felt("stedHerSvar").textContent);
      felt("stedKilde").value = "";

      // 1. Kartlenka. Den spor ingen, og virker ogsa nar Overpass er nede
      //    — det er hele grunnen til at den finnes.
      var forLenke = stedKall.length;
      felt("stedLenke").value =
        "https://www.google.com/maps/place/X/@59.9,10.7,15z/data=!3m1!4b1!4m6!3d59.84321!4d10.79876";
      felt("stedLenkeLes").click();
      ok("en kartlenke fyller koordinatene",
         felt("stedLat").value === "59.8432" && felt("stedLon").value === "10.7988",
         felt("stedLat").value + ", " + felt("stedLon").value);
      ok("og gjorde det uten a sporre noen",
         stedKall.length === forLenke, stedKall.length + " mot " + forLenke);
      ok("svaret sier hva som ble hentet",
         felt("stedLenkeSvar").textContent.indexOf("59.8432") > -1,
         felt("stedLenkeSvar").textContent);
      ok("og at det kom fra ei lenke nar det gjorde det",
         felt("stedLenkeSvar").textContent.indexOf("fra lenka") > -1,
         felt("stedLenkeSvar").textContent);
      // Forklaringen ma sta igjen: den sier hvilke lenker som virker.
      ok("og forklaringen star fortsatt",
         felt("stedLenkeHint").textContent.indexOf("Google Maps") > -1,
         felt("stedLenkeHint").textContent);

      // Det som faktisk ligger pa utklippstavla nar man hoyreklikker i
      // Google Maps er et *koordinat*, ikke en lenke — og fra stedskortet
      // kommer det med parenteser rundt. Meldt 18. september 2026.
      felt("stedLat").value = "";
      felt("stedLon").value = "";
      felt("stedLenke").value = "(59.8339740, 10.8062285)";
      felt("stedLenkeLes").click();
      ok("et koordinat med parenteser rundt fyller feltene",
         felt("stedLat").value === "59.8340" && felt("stedLon").value === "10.8062",
         felt("stedLat").value + ", " + felt("stedLon").value);
      // Svaret sa «fra lenka» uansett hva som ble limt inn. Den som limte
      // to tall leste da at appen trodde hen gjorde noe annet.
      ok("og svaret sier at det kom fra et koordinat, ikke fra ei lenke",
         felt("stedLenkeSvar").textContent.indexOf("koordinatet du limte inn") > -1,
         felt("stedLenkeSvar").textContent);
      // Etiketten sa «en kartlenke», og den som satt med et koordinat
      // leste at feltet ikke var for hen.
      ok("og etiketten sier at koordinat duger",
         document.querySelector("label[for=stedLenke]").textContent
           .indexOf("koordinat") > -1,
         document.querySelector("label[for=stedLenke]").textContent);

      var kort = felt("stedLenke");
      kort.value = "https://maps.app.goo.gl/abc123";
      felt("stedLenkeLes").click();
      ok("en kortlenke sier hva som er galt med den",
         felt("stedLenkeSvar").textContent.indexOf("Kortlenker") === 0,
         felt("stedLenkeSvar").textContent);

      // 1b. Byen soket leter i. Meldt 18. september 2026: en RBK-pub ble
      //     foreslatt, og portalen kunne verken finne den eller lagre den
      //     — soket var bundet til Oslo, og vakta avviste koordinatet som
      //     fulgte. Forslaget ble staende i koen som om ingen hadde provd.
      ok("byvelgeren har alle byene vi kjenner",
         felt("stedBy").options.length === 6, felt("stedBy").options.length);
      ok("og Trondheim er en av dem",
         Array.prototype.some.call(felt("stedBy").options,
           function (o) { return o.textContent === "Trondheim"; }));

      // Koordinatet er fasiten, ikke velgeren: limes et Trondheim-punkt
      // inn, skal «Sla opp» lete der raden faktisk ligger.
      felt("stedLat").value = "";
      felt("stedLon").value = "";
      felt("stedLenke").value = "(63.4305, 10.3951)";
      felt("stedLenkeLes").click();
      ok("byen folger koordinatet som ble limt inn",
         felt("stedBy").value === "trondheim", felt("stedBy").value);

      // Og den folger et koordinat som tastes for hand.
      felt("stedLat").value = "59.9135";
      felt("stedLat").dispatchEvent(new Event("input"));
      felt("stedLon").value = "10.7340";
      felt("stedLon").dispatchEvent(new Event("input"));
      ok("og et koordinat som tastes inn",
         felt("stedBy").value === "oslo", felt("stedBy").value);

      // 2. Navnesoket: ingen treff, og det skal sies med utveiene.
      felt("stedLat").value = "";
      felt("stedLon").value = "";
      felt("stedSok").click();
      setTimeout(function () { try {
        ok("navnesoket sier at det ikke fant noe",
           felt("stedSokHint").textContent.indexOf("Ingen treff") === 0,
           felt("stedSokHint").textContent);
        // «Ingen treff pa RBK Pub» er sant i Oslo og usant i Trondheim.
        // Uten byen i meldinga slutter man at stedet ikke finnes.
        ok("og hvilken by den lette i",
           felt("stedSokHint").textContent.indexOf("Oslo") > -1,
           felt("stedSokHint").textContent);
        ok("og peker pa kartlenka som utvei",
           felt("stedSokHint").textContent.indexOf("kartlenke") > -1,
           felt("stedSokHint").textContent);

        // 3. Adressesoket. Huset star i OSM selv om puben ikke gjor det.
        felt("stedSokAdresse").click();
        setTimeout(function () { try {
          var sendt = stedKall.filter(function (k) { return k.handling === "sok-adresse"; });
          ok("adressesoket gikk med adressen fra feltet",
             sendt.length === 1 && sendt[0].adresse === "Berglyveien 4J",
             JSON.stringify(sendt));
          var treff = felt("stedAdresseTreff").querySelectorAll("button");
          ok("og gir et treff", treff.length === 1, treff.length);

          treff[0].click();
          ok("treffet fyller koordinatene",
             felt("stedLat").value === "59.8432" && felt("stedLon").value === "10.7988",
             felt("stedLat").value + ", " + felt("stedLon").value);
          // Navnet er nokkelen. Huset heter «Berglyveien 4J» i OSM, og et
          // navn som endret seg her ville laget en helt annen rad.
          ok("men rorer ikke navnet",
             felt("stedNavn").value === "RBK. Pøbb og sånt", felt("stedNavn").value);

          // 4. Det admin faktisk motte: alle speilene feilet. Da er
          //    tjenestens egne ord om hvert speil det eneste sporet.
          adresseSvar = { kode: 502, kropp: {
            feil: "Fikk ikke svar fra OpenStreetMap. Tast koordinatene selv, eller lim inn en kartlenke.",
            forsok: [
              { kilde: "Overpass overpass-api.de", utfall: "This operation was aborted", ms: 6003 },
              { kilde: "Overpass overpass.kumi.systems", status: 504, ms: 1200 },
            ],
          } };
          felt("stedSokAdresse").click();
          setTimeout(function () { try {
            ok("en feil vises med tjenestens egen melding",
               felt("stedAdresseHint").textContent.indexOf("Fikk ikke svar") === 0,
               felt("stedAdresseHint").textContent);
            var linjer = felt("stedAdresseTreff").textContent;
            ok("og hvert speil star med sitt eget utfall",
               linjer.indexOf("overpass-api.de") > -1 &&
               linjer.indexOf("kumi.systems") > -1, linjer);
            ok("aborten star med sine egne ord",
               linjer.indexOf("aborted") > -1, linjer);
            ok("og statuskoden fra det andre speilet",
               linjer.indexOf("504") > -1, linjer);
            // Uten dette er «Fikk ikke svar» like forenlig med at Overpass
            // er nede som med at var egen frist lop ut, og den forskjellen
            // er hele diagnosen.
            ok("de gamle treffene star ikke igjen under feilmeldinga",
               felt("stedAdresseTreff").querySelectorAll("button").length === 0,
               felt("stedAdresseTreff").querySelectorAll("button").length);

            // Et nytt sted skal ikke arve forrige steds oppslag.
            felt("stedNytt").click();
            ok("et nytt sted starter uten treffene fra det forrige",
               felt("stedAdresseTreff").textContent === "" &&
               felt("stedAdresseHint").hidden === true &&
               felt("stedLenke").value === "",
               felt("stedAdresseTreff").textContent);
            ferdig();
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`, null, adminSide);

/* ---------------- 15D. star det jeg lagret fortsatt der ---------------- */

// Meldt 17. september 2026: «Nar jeg kommer tilbake pa admin ser det sann
// ut. Selv om jeg lagret sist gang.» Tre avkryssinger var synlige, hinten
// sa fem, og de to siste sto lenger ned enn skjermen rakk.
//
// Ingenting var borte. Men «Viser 5 kamper fra for» svarte ikke pa
// sporsmalet admin faktisk hadde — *ble det jeg lagret staende?* — og
// talte i tillegg pa tvers av ligaer mens boksene viste en liga.
// Portalveien for «Ikke denne kvelden». Knappen ble bygget, testet fra
// APPSIDEN — der en ferdig `viser: false`-rad ble stubbet inn — og var
// uraakelig i portalen: `k.liga` settes i fotball.js, ikke av tjenesten,
// og admin.js glemte det. Da fikk `ligaflaggGjelder` undefined inn og
// svarte nei hver gang.
//
// Halve rundturen var testet, og PR-en sa at hullet var tettet.
const SAK_15F = kjor("admin-ikke-denne-kvelden", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var IDAG = new Date().toISOString().slice(0, 10);
  // Ett sted MED ligaflagg, ett uten. Knappen skal skille dem.
  var MED = { nokkel: "medflagg", navn: "Sportsbaren Bodø", bydel: "Sentrum",
    adresse: "Gata 1", lat: 67.2828, lon: 14.3756, type: "sportsbar", lag: [],
    kilde: "Var innom 21.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: IDAG, merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  var UTEN = { nokkel: "utenflagg", navn: "Uten flagg", bydel: "Sentrum",
    adresse: "Gata 2", lat: 67.2830, lon: 14.3760, type: "sportsbar", lag: [],
    kilde: "Var innom 21.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: IDAG, merknad: "", fjernet: false };

  var KAMPER_ES = [
    { id: 601, hjemme: "Rosenborg", borte: "Brann", dato: "2026-10-20T17:00:00+00:00",
      arena: "Lerkendal Stadion", runde: "Runde 21" },
    { id: 602, hjemme: "Viking", borte: "Molde", dato: "2026-10-21T17:00:00+00:00",
      arena: "SR-Bank Arena", runde: "Runde 21" }
  ];
  window.__sendt = null;
  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [], visninger: [] });
      var kropp = JSON.parse(opt.body);
      if (kropp.handling === "sjekk") {
        return kropp.passord === "hemmelig" ? svar(200, { ok: true })
          : svar(401, { feil: "Feil passord" });
      }
      window.__sendt = kropp;
      return svar(200, { ok: true, pub: kropp.pub, visninger: [], merknad: "Lagret." });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kilde: "TheSportsDB", runde: "Runde 21",
        runder: ["Runde 21"], kamper: KAMPER_ES });
    }
    if (u.indexOf("/api/brukere") === 0) return svar(200, { klar: true, mangler: [] });
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    if (u.indexOf("/api/pub-liste") === 0) return svar(200, { puber: [MED, UTEN], klar: true });
    return svar(200, {});
  };
  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();
    setTimeout(function () { try {
      felt("pub").value = "Sportsbaren Bodø";
      felt("pub").dispatchEvent(new Event("change"));

      var knapper = felt("kamper").querySelectorAll(".kamp-nei");
      ok("et sted med ligaflagg far knappen pa hver kamp",
         knapper.length === 2, knapper.length + " knapper");
      ok("og den sier hva trykket gjor",
         knapper[0].textContent === "Ikke denne kvelden", knapper[0].textContent);

      // Trykket: raden dempes, og lagreknappen ma se at noe er endret.
      knapper[0].click();
      ok("trykket snur teksten",
         knapper[0].textContent === "Viser ikke" &&
         knapper[0].getAttribute("aria-pressed") === "true", knapper[0].textContent);
      ok("og lagreknappen vet at noe er endret",
         felt("lagre").disabled === false, felt("lagre").textContent);

      // Et ja og et nei er motsatte pastander om den samme kampen.
      var boks = felt("kamper").querySelectorAll(".kamp input")[0];
      boks.checked = true;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("et ja slar av nei-et pa samme kamp",
         knapper[0].dataset.nei !== "1", knapper[0].textContent);

      // Og tilbake: nei-et slar av haken.
      knapper[0].click();
      ok("og nei-et slar av haken",
         boks.checked === false, String(boks.checked));

      felt("lagre").click();
      setTimeout(function () { try {
        ok("nei-et sendes som sin egen liste",
           !!window.__sendt && window.__sendt.neiIder.length === 1 &&
           window.__sendt.kampIder.length === 0,
           JSON.stringify(window.__sendt && {
             ja: window.__sendt.kampIder, nei: window.__sendt.neiIder }));

        // DEN VIKTIGSTE: uten et flagg er det ingenting a si imot.
        felt("pub").value = "Uten flagg";
        felt("pub").dispatchEvent(new Event("change"));
        ok("et sted UTEN ligaflagg far ingen knapp",
           felt("kamper").querySelectorAll(".kamp-nei").length === 0,
           felt("kamper").querySelectorAll(".kamp-nei").length + " knapper");
        ferdig();
      } catch (e) { ok("ingen unntak etter lagring", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak i portalen", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300); });
`, null, adminSide);

// Portalen har passordet, men INGEN okt i nettleseren. Det er runden
// admin gar oftest: passordet ligger i fana, mens okta fra appen er
// utlopt — portalen fornyer den ikke selv. Kravet sto pa HELE stedKall,
// og da falt stedene fra portalen ut av bade lista og pubvelgeren. Ingen
// pubrad bar ligaflagget, for det bor bare i basen, og «Ikke denne
// kvelden» kunne ikke sta noe sted uansett hvor riktig knappen var
// bygget. Meldt 21. september 2026: «ser ingen forskjell pa admin?»
const SAK_15H = kjor("admin-uten-okt", `
  try { localStorage.removeItem("sb-konto"); } catch (e) { /* privat modus */ }

  var IDAG = new Date().toISOString().slice(0, 10);
  var MED = { nokkel: "sportsbaren-bodo", navn: "Sportsbaren Bodø", bydel: "Sentrum",
    adresse: "Gata 1", lat: 67.2828, lon: 14.3756, type: "sportsbar", lag: [],
    kilde: "Var innom 21.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: IDAG, merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  var KAMPER = [
    { id: 701, hjemme: "Bodø/Glimt", borte: "Brann", dato: "2026-10-20T17:00:00+00:00",
      arena: "Aspmyra Stadion", runde: "Runde 21" },
    { id: 702, hjemme: "Viking", borte: "Molde", dato: "2026-10-21T17:00:00+00:00",
      arena: "SR-Bank Arena", runde: "Runde 21" }
  ];
  window.__liste = null;
  window.__lagret = null;
  window.__brukerPost = null;
  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [], visninger: [] });
      var v = JSON.parse(opt.body);
      if (v.handling === "sjekk") {
        return v.passord === "hemmelig" ? svar(200, { ok: true }) : svar(401, { feil: "Feil passord" });
      }
      return svar(200, { ok: true, pub: v.pub, visninger: [], merknad: "Lagret." });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kilde: "TheSportsDB", runde: "Runde 21",
        runder: ["Runde 21"], kamper: KAMPER });
    }
    if (u.indexOf("/api/brukere") === 0) {
      if (opt && opt.method === "POST") window.__brukerPost = JSON.parse(opt.body);
      return svar(200, { klar: true, mangler: [] });
    }
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    if (u.indexOf("/api/pub-liste") === 0) {
      var kropp = JSON.parse(opt.body);
      // Stubben modellerer TJENESTEN, ikke klienten: «liste» svarer uten
      // en token — appen henter den samme lista med en naken GET — og
      // bare lagringen slar opp uid-en. Sto kravet i stubben ogsa, malte
      // testen var egen feil og ville vaert gronn uansett.
      if (kropp.handling === "liste") {
        window.__liste = kropp;
        return svar(200, { puber: [MED], klar: true });
      }
      if (!kropp.token) {
        return svar(401, { feil: "Logg inn i appen først. Lagringen går med din egen økt." });
      }
      window.__lagret = kropp;
      return svar(200, { ok: true, merknad: "Lagret." });
    }
    return svar(200, {});
  };
  function felt(id) { return document.getElementById(id); }
  function pubValg() {
    return Array.prototype.map.call(felt("pub").options, function (o) { return o.value; });
  }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();
    setTimeout(function () { try {
      ok("stedene hentes uten en økt — kallet leser bare",
         !!window.__liste, JSON.stringify(window.__liste));

      // Og motsatt vei for BRUKERLISTA. De to ser like ut og er ikke det:
      // stedene er offentlige data tjenesten gir uten en token, mens hver
      // handling i brukerlista handler paa vegne av andre mennesker. Den
      // krever okta, og sier det (#140).
      ok("men brukerlista krever den, og sier det",
         felt("brukerHint").textContent.indexOf("Logg inn i appen") > -1,
         felt("brukerHint").textContent);
      ok("og den sporr ikke tjenesten i det hele tatt",
         window.__brukerPost === null, JSON.stringify(window.__brukerPost));
      ok("og stedet fra portalen star i pubvelgeren",
         pubValg().indexOf("Sportsbaren Bodø") > -1, pubValg().length + " valg");

      felt("pub").value = "Sportsbaren Bodø";
      felt("pub").dispatchEvent(new Event("change"));
      ok("sa ligaflagget nar fram, og knappen star pa hver kamp",
         felt("kamper").querySelectorAll(".kamp-nei").length === 2,
         felt("kamper").querySelectorAll(".kamp-nei").length + " knapper");

      // Men LAGRINGEN krever fortsatt okta, og sier det for den sender.
      felt("stedNytt").click();
      felt("stedNavn").value = "Ny Bar";
      felt("stedBydel").value = "Sentrum";
      felt("stedLat").value = "63.4305";
      felt("stedLon").value = "10.3951";
      felt("stedType").value = "pub";
      felt("stedSikkerhet").value = "bekreftet";
      felt("stedKilde").value = "Var innom 21.09.2026, storskjerm i baren";
      felt("stedLagre").click();
      setTimeout(function () { try {
        ok("men lagringen krever okta, og sier det",
           felt("stedMelding").textContent.indexOf("Logg inn i appen") > -1,
           felt("stedMelding").textContent);
        ok("og da ble ingenting sendt",
           window.__lagret === null, JSON.stringify(window.__lagret));
        ferdig();
      } catch (e) { ok("ingen unntak etter lagring", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak i portalen", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300); });
`, null, adminSide);

// Rettelsene lander ETTER at kamplista star ferdig. Den runden har kostet
// oss tre feil for — `tegnSvar()` i appen, `tegnKjenteIgjen()` i kortet —
// og her er det ligaflagget som uteblir: `puber.js` har ingen `ligaer`,
// sa pubraden `tegnKamper` leste bar ingen pastand a si imot.
//
// Stedet er en RETTELSE av den forste puben i fila, sa velgeren star pa
// den hele veien. Da er det ingen ting som tegner lista om — uten at noen
// gjor det med vilje.
const SAK_15I = kjor("admin-rettelsen-lander-sist", `
  try { localStorage.removeItem("sb-konto"); } catch (e) { /* privat modus */ }

  var IDAG = new Date().toISOString().slice(0, 10);
  var RETTET = { nokkel: "andyspub", navn: "Andy's Pub", bydel: "Sentrum",
    adresse: "Gata 1", lat: 59.9127, lon: 10.7461, type: "sportsbar", lag: [],
    kilde: "Var innom 21.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
    sjekket: IDAG, merknad: "", fjernet: false,
    ligaer: { sender: ["eliteserien"],
              kilde: "Ringte dem og spurte om ligaen", sjekket: IDAG } };
  var KAMPER = [
    { id: 801, hjemme: "Rosenborg", borte: "Brann", dato: "2026-10-20T17:00:00+00:00",
      arena: "Lerkendal Stadion", runde: "Runde 21" },
    { id: 802, hjemme: "Viking", borte: "Molde", dato: "2026-10-21T17:00:00+00:00",
      arena: "SR-Bank Arena", runde: "Runde 21" }
  ];
  window.__tidlig = null;
  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  function sent(status, kropp, ms) {
    return new Promise(function (r) {
      setTimeout(function () {
        r({ ok: status < 400, status: status, text: function () {
          return Promise.resolve(JSON.stringify(kropp)); } });
      }, ms);
    });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [], visninger: [] });
      var v = JSON.parse(opt.body);
      if (v.handling === "sjekk") {
        return v.passord === "hemmelig" ? svar(200, { ok: true }) : svar(401, { feil: "Feil passord" });
      }
      return svar(200, { ok: true, pub: v.pub, visninger: [], merknad: "Lagret." });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kilde: "TheSportsDB", runde: "Runde 21",
        runder: ["Runde 21"], kamper: KAMPER });
    }
    if (u.indexOf("/api/brukere") === 0) return svar(200, { klar: true, mangler: [] });
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    // Rettelsene kommer sist. Det er den ene rekkefolgen som avslorer om
    // kamplista tegnes om nar de lander.
    if (u.indexOf("/api/pub-liste") === 0) return sent(200, { puber: [RETTET], klar: true }, 300);
    return svar(200, {});
  };
  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();
    // Forst: kampene star tegnet, rettelsene er ikke kommet ennaa.
    setTimeout(function () { try {
      window.__tidlig = felt("kamper").querySelectorAll(".kamp-nei").length;
      ok("for rettelsene har landet star kampene der, uten knapp",
         felt("kamper").querySelectorAll(".kamp input").length === 2 &&
         window.__tidlig === 0, "kamper tegnet, " + window.__tidlig + " knapper");
      ok("og velgeren star pa den puben rettelsen gjelder",
         felt("pub").value === "Andy's Pub", felt("pub").value);

      // Og sa lander de — uten at noen rorer velgeren.
      setTimeout(function () { try {
        ok("nar rettelsene lander, tegnes kamplista om med flagget",
           felt("kamper").querySelectorAll(".kamp-nei").length === 2,
           felt("kamper").querySelectorAll(".kamp-nei").length + " knapper");
        ok("og velgeren star pa den samme puben",
           felt("pub").value === "Andy's Pub", felt("pub").value);
        ferdig();
      } catch (e) { ok("ingen unntak etter rettelsene", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak i portalen", false, e.message); ferdig(); } }, 200);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300); });
`, null, adminSide);

// Den andre lasa trenger en LISTE over hvem som slipper inn, og den ligger
// i ADMIN_UID i Netlify. Mangler den, stenger tjenesten — riktig vei, for
// en las uten liste apner for alle. Men verdien som skal inn er admins
// egen konto-id, og den kan tjenesten ikke vite: den vet bare at
// variabelen er tom. Portalen vet det, for id-en staar i okta.
//
// Uten dette er meldinga «sett ADMIN_UID» uten aa si til hva, og svaret
// ligger et sted admin ikke kommer til fra en telefon.
const SAK_15J = kjor("admin-uid-mangler", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer",
      bruker: "99999999-8888-7777-6666-555555555555", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  window.__sendt = null;
  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [], visninger: [] });
      var v = JSON.parse(opt.body);
      if (v.handling === "sjekk") {
        return v.passord === "hemmelig" ? svar(200, { ok: true }) : svar(401, { feil: "Feil passord" });
      }
      return svar(200, { ok: true, pub: v.pub, visninger: [], merknad: "Lagret." });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kilde: "TheSportsDB", runde: "Runde 21",
        runder: ["Runde 21"], kamper: [] });
    }
    // Tjenestens egne ord, slik oppsettTekst former dem.
    if (u.indexOf("/api/brukere") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: false, mangler: ["ADMIN_UID"] });
      window.__sendt = JSON.parse(opt.body);
      return svar(503, {
        feil: "Brukerlista er ikke satt opp: ADMIN_UID mangler i Netlify-miljøet.",
        mangler: ["ADMIN_UID"],
      });
    }
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    if (u.indexOf("/api/pub-liste") === 0) return svar(200, { puber: [], klar: true });
    return svar(200, {});
  };
  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();
    setTimeout(function () { try {
      ok("okta sendes med til brukerlista",
         !!window.__sendt && window.__sendt.token === "okt-token",
         JSON.stringify(window.__sendt));
      var hint = felt("brukerHint").textContent;
      ok("meldinga fra tjenesten staar", hint.indexOf("ADMIN_UID") > -1, hint);
      ok("og portalen sier hvilken verdi som skal inn",
         hint.indexOf("99999999-8888-7777-6666-555555555555") > -1, hint);
      ok("lista staar ikke der som om den var hel",
         felt("brukere").hidden === true, "synlig");
      ferdig();
    } catch (e) { ok("ingen unntak i portalen", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300); });
`, null, adminSide);

const SAK_15D = kjor("admin-lagret-star", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var KAMPER_ES = [
    { id: 501, hjemme: "Rosenborg", borte: "Brann", dato: "2026-09-20T17:00:00+00:00",
      arena: "Lerkendal Stadion", runde: "Runde 21" },
    { id: 502, hjemme: "Vaalerenga", borte: "Bodo/Glimt", dato: "2026-09-21T15:00:00+00:00",
      arena: "Intility Arena", runde: "Runde 21" },
    { id: 503, hjemme: "Viking", borte: "Lillestrom", dato: "2026-09-27T16:00:00+00:00",
      arena: "SR-Bank Arena", runde: "Runde 22" },
    // Ikke lagret fra for. Den finnes sa scenen kan gjore det som ble
    // meldt: komme inn til noen avkryssede, og legge til én.
    { id: 504, hjemme: "Stromsgodset", borte: "Sarpsborg 08",
      dato: "2026-09-28T18:00:00+00:00", arena: "Marienlyst", runde: "Runde 22" }
  ];
  var VISNINGER = [
    { pub: "Andy's Pub", kampId: "2026-09-20-rosenborg-brann" },
    { pub: "Andy's Pub", kampId: "2026-09-21-vaalerenga-bodoglimt" },
    { pub: "Andy's Pub", kampId: "2026-09-27-viking-lillestrom" }
  ];

  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") {
        return svar(200, { klar: true, mangler: [], visninger: VISNINGER });
      }
      var kropp = JSON.parse(opt.body);
      if (kropp.handling === "sjekk") {
        return kropp.passord === "hemmelig" ? svar(200, { ok: true })
          : svar(401, { feil: "Feil passord" });
      }
      return svar(200, { ok: true, pub: kropp.pub, visninger: [], merknad: "Lagret." });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kilde: "TheSportsDB", runde: "Runde 21",
        runder: ["Runde 21", "Runde 22"], kamper: KAMPER_ES });
    }
    if (u.indexOf("/api/brukere") === 0) return svar(200, { klar: true, mangler: [] });
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: [] });
    if (u.indexOf("/api/pub-liste") === 0) return svar(200, { puber: [], klar: true });
    return svar(200, {});
  };

  function felt(id) { return document.getElementById(id); }
  function rundeTekst() {
    return Array.prototype.map.call(
      felt("kamper").querySelectorAll(".runde-skille"),
      function (r) { return r.textContent; }).join(" | ");
  }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();

    setTimeout(function () { try {
      felt("pub").value = "Andy's Pub";
      felt("pub").dispatchEvent(new Event("change"));

      var bokser = felt("kamper").querySelectorAll(".kamp input");
      ok("alle fire kampene er tegnet", bokser.length === 4, bokser.length);
      ok("og de tre som er lagret er krysset av",
         bokser[0].checked && bokser[1].checked && bokser[2].checked && !bokser[3].checked,
         Array.prototype.map.call(bokser, function (b) { return b.checked; }).join(","));

      // Meldt 18. september 2026, i innsenderens egne ord: «Jeg kommer
      // inn, fem kamper er markert, jeg legger til én, og da star det 6
      // lagret. Egentlig sa lagrer bruker 1 da.»
      bokser[3].checked = true;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("én lagt til sier «Legg til 1 kamp», ikke «Lagre 4»",
         felt("lagre").textContent === "Legg til 1 kamp for Andy's Pub",
         felt("lagre").textContent);
      // Og ett vekk i tillegg: to ulike handlinger i samme trykk, og
      // begge ma sies.
      bokser[0].checked = false;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("en tilfoyelse og en fjerning sier begge deler",
         felt("lagre").textContent === "Legg til 1 kamp og fjern 1 for Andy's Pub",
         felt("lagre").textContent);
      // Tilbake til utgangspunktet: da er det ingenting a lagre.
      bokser[3].checked = false;
      bokser[0].checked = true;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("og tilbake til start er det ingenting a gjore",
         felt("lagre").textContent === "Lagret for Andy's Pub" &&
         felt("lagre").disabled === true, felt("lagre").textContent);

      // Sporsmalet admin har er «ble det jeg lagret staende», ikke «hvor
      // mange er det». Hinten ma svare pa det forste.
      ok("hinten sier at alle star i lista under",
         felt("pubHint").textContent.indexOf("alle i lista under") > -1,
         felt("pubHint").textContent);
      ok("og navngir puben, sa feil pub valgt synes her ogsa",
         felt("pubHint").textContent.indexOf("Andy's Pub") === 0,
         felt("pubHint").textContent);

      // Tallet per runde er hele poenget: lista er lengre enn skjermen, og
      // tre synlige avkryssinger av fem ser ut som tap uten det.
      ok("hver runde sier hvor mange som er valgt i den",
         rundeTekst().indexOf("2 av 2 valgt") > -1 &&
         rundeTekst().indexOf("1 av 2 valgt") > -1, rundeTekst());

      // Tallet telles av boksene, ikke fort ved siden av dem.
      bokser[0].checked = false;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("tallet folger boksene med det samme",
         rundeTekst().indexOf("1 av 2 valgt") > -1, rundeTekst());
      // Tre sto lagret, én er tatt vekk: knappen sier fjerningen, ikke
      // de to som blir igjen.
      ok("og knappen sier hva som er endret, ikke hva som star igjen",
         felt("lagre").textContent === "Fjern 1 kamp for Andy's Pub",
         felt("lagre").textContent);

      felt("merkIngen").click();
      ok("null valgt star som null, ikke som tomt",
         rundeTekst().indexOf("0 av 2 valgt") > -1, rundeTekst());
      // Denne puben HAR kamper lagret. Da er null avkrysset ikke «lagre
      // ingenting» — det er a ta dem bort, og knappen ma si det.
      ok("uten kryss sier den at den fjerner, nar det er noe a fjerne",
         felt("lagre").textContent === "Fjern alle kamper for Andy's Pub" &&
         felt("lagre").disabled === false, felt("lagre").textContent);

      // Knappen per runde, meldt 19. september 2026. «Kryss av alle»
      // finnes fra for og tar HELE vinduet; denne tar én runde, og
      // teksten ma si hva trykket gjor — ikke hvor mye som star.
      var skille1 = felt("kamper").querySelectorAll(".runde-skille")[0];
      var rundeknapp = skille1.querySelector(".runde-alle");
      ok("hver runde har sin egen kryss-av-knapp",
         !!rundeknapp, skille1.textContent);
      ok("og uten kryss sier den at den tar hele runden",
         rundeknapp.textContent === "Kryss av alle 2", rundeknapp.textContent);
      rundeknapp.click();
      ok("trykket krysser av runden — og BARE den",
         rundeTekst().indexOf("2 av 2 valgt") > -1 &&
         rundeTekst().indexOf("0 av 2 valgt") > -1, rundeTekst());
      // Na er runden full, og da er neste trykk det motsatte. Sto det
      // fortsatt «Kryss av alle», lovet knappen noe den ikke gjor.
      ok("og da snur knappen til a fjerne",
         rundeknapp.textContent === "Fjern alle 2", rundeknapp.textContent);
      // Teksten ma folge haken ogsa nar du krysser av for hand.
      felt("kamper").querySelectorAll(".kamp input")[0].checked = false;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      ok("et handsatt kryss teller med i knappeteksten",
         rundeknapp.textContent === "Kryss av 1 til", rundeknapp.textContent);
      rundeknapp.click();

      felt("merkAlle").click();
      ok("og «kryss av alle» fyller dem igjen",
         rundeTekst().indexOf("2 av 2 valgt") > -1, rundeTekst());
      // «Kryss av alle» tar med den fjerde ogsa, og den var aldri lagret.
      // Da er det én tilfoyelse, ikke «ingenting a lagre» — og knappen
      // skal si det.
      ok("kryss av alle pa en liste med en ulagret sier at den legger til",
         felt("lagre").textContent === "Legg til 1 kamp for Andy's Pub",
         felt("lagre").textContent);
      felt("kamper").querySelectorAll(".kamp input")[3].checked = false;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      // Tilbake til det som sto lagret: da er det ingenting a lagre, og
      // knappen skal si det framfor a be om et trykk som ikke endrer noe.
      // Meldt 17. september 2026: «Jeg trykker lagre, far beskjed at de er
      // lagret, sa dukker lagre-knappen opp igjen.»
      ok("boksene som de ble lagret gir en knapp som sier lagret",
         felt("lagre").textContent === "Lagret for Andy's Pub" &&
         felt("lagre").disabled === true, felt("lagre").textContent);

      // Og etter en EKTE lagring, ikke bare et kryss tilbake til
      // utgangspunktet. Det var dette som ble meldt 17. september 2026:
      // «Jeg trykker lagre 5 kamper, far beskjed at de er lagret, sa
      // dukker lagre-knappen opp igjen.» Kvitteringen og knappen sa to
      // ulike ting om den samme handlingen.
      var enBoks = felt("kamper").querySelectorAll(".kamp input")[0];
      enBoks.checked = false;
      felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
      // Tre sto lagret; ett kryss vekk er én fjerning, ikke «lagre 2».
      ok("et kryss fjernet gir en knapp som sier at den fjerner én",
         felt("lagre").disabled === false &&
         felt("lagre").textContent === "Fjern 1 kamp for Andy's Pub",
         felt("lagre").textContent);
      felt("lagre").click();
      setTimeout(function () { try {
        ok("lagringen gikk gjennom",
           felt("melding").textContent.indexOf("Lagret") > -1, felt("melding").textContent);
        ok("og knappen sier det samme som kvitteringen",
           felt("lagre").textContent === "Lagret for Andy's Pub",
           felt("lagre").textContent);
        ok("den ber ikke om et trykk til",
           felt("lagre").disabled === true, felt("lagre").disabled);

        // Endrer du noe etterpa, er det noe a lagre igjen.
        enBoks.checked = true;
        felt("kamper").dispatchEvent(new Event("change", { bubbles: true }));
        // Den ene som ble fjernet, legges tilbake: én tilfoyelse.
        ok("en ny endring vekker knappen igjen",
           felt("lagre").disabled === false &&
           felt("lagre").textContent === "Legg til 1 kamp for Andy's Pub",
           felt("lagre").textContent);
        videre();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);

    function videre() { try {
      // En pub uten noe satt skal si nettopp det.
      var andre = null;
      var valg = felt("pub").options;
      for (var i = 0; i < valg.length; i++) {
        if (valg[i].value !== "Andy's Pub") { andre = valg[i].value; break; }
      }
      felt("pub").value = andre;
      felt("pub").dispatchEvent(new Event("change"));
      ok("en pub uten kamper sier det med ord",
         felt("pubHint").textContent.indexOf("Ingen kamper satt") === 0,
         felt("pubHint").textContent);
      ok("og ingen boks star krysset av",
         !Array.prototype.some.call(felt("kamper").querySelectorAll(".kamp input"),
           function (b) { return b.checked; }));
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`, null, adminSide);

/* ---------------- 15E. tipset i koen ---------------- */

// ADR 0022 satte et gjettet sted inn i lista, merket som antatt. Den halve
// avgjorelsen: uten en vei tilbake er det gjetning med bedre typografi.
//
// Her er den andre halvparten, sett fra portalen. Tre ting skal holde:
// tipset staar FORST (det er den raden som er usann), det ser ut som noe
// annet enn et forslag, og lagringen som tar stedet ut er det som merker
// tipset — ikke et ekstra trykk.
const SAK_15E = kjor("admin-tips", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var lagret = [];
  var forslagKall = [];

  // Det antatte stedet ligger i BASEN, ikke i fila — det er veien et sted i
  // en ny by kommer inn. Vekta maa derfor leses av den sammenslatte lista;
  // mot puber.js alene fantes ikke stedet.
  var iBasen = [{ nokkel: "gjettepuben", navn: "Gjettepuben", bydel: "Midtbyen",
                  adresse: "Munkegata 1", lat: 63.4310, lon: 10.3955, type: "pub",
                  lag: [], kilde: "Antatt fra kartet", sikkerhet: "usikker",
                  sjekket: "2026-09-20", fjernet: false }];

  // Tre rader i koen, med vilje i gal rekkefolge: det nyeste forslaget
  // forst, tipset om det antatte stedet sist.
  var koen = [
    { id: 1, navn: "Nytt sted", adresse: "Storgata 1", viserFotball: true,
      merknad: "", foreslatt: "2026-09-01", status: "ny" },
    { id: 2, navn: "Andy's Pub", adresse: "Storgata 2", viserFotball: false,
      merknad: "", foreslatt: "2026-09-10", status: "ny" },
    { id: 3, navn: "Gjettepuben", adresse: "Munkegata 1", viserFotball: false,
      merknad: "Var der i går, ingen skjerm", foreslatt: "2026-09-19", status: "ny" },
  ];

  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-liste") === 0) {
      var k = JSON.parse(opt.body);
      if (k.handling === "liste") return svar(200, { puber: iBasen, klar: true });
      if (k.handling === "sok") return svar(200, { kilde: "OpenStreetMap", treff: [] });
      lagret.push(k.pub);
      iBasen = iBasen.map(function (r) {
        return r.nokkel === "gjettepuben"
          ? Object.assign({}, r, k.pub, { nokkel: "gjettepuben" }) : r; });
      return svar(200, { ok: true, pub: k.pub, merknad: "Lagret." });
    }
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { ok: true });
    }
    if (u.indexOf("/api/brukere") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { brukere: [] });
    }
    if (u.indexOf("/api/pub-forslag") === 0) {
      var f = JSON.parse((opt || {}).body || "{}");
      forslagKall.push(f);
      if (f.handling === "behandle") {
        koen = koen.map(function (r) {
          return r.id === f.id ? Object.assign({}, r, { status: f.status }) : r; });
        return svar(200, { ok: true });
      }
      return svar(200, { forslag: koen });
    }
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", kamper: [], runder: [] });
    }
    return svar(200, {});
  };

  function felt(id) { return document.getElementById(id); }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();

    setTimeout(function () { try {
      var rader = felt("forslagListe").querySelectorAll(".forslag");
      ok("alle tre radene staar i koen", rader.length === 3, rader.length);
      if (rader.length !== 3) { ferdig(); return; }

      // Kjernen i sorteringen: tipset om stedet vi GJETTET paa er den
      // raden som er usann akkurat na, og den skal staa forst. Sto koen
      // usortert, sto «Nytt sted» der — det eldste, og det minst viktige.
      ok("tipset om det antatte stedet staar forst",
         rader[0].querySelector(".forslag-navn").textContent.indexOf("Gjettepuben") === 0,
         rader[0].querySelector(".forslag-navn").textContent);
      ok("saa tipset som krever en vurdering",
         rader[1].querySelector(".forslag-navn").textContent.indexOf("Andy's Pub") === 0,
         rader[1].querySelector(".forslag-navn").textContent);
      ok("og forslaget bakerst, selv om det er eldst",
         rader[2].querySelector(".forslag-navn").textContent.indexOf("Nytt sted") === 0,
         rader[2].querySelector(".forslag-navn").textContent);

      // Et tips skal ikke se ut som et forslag. «uvisst om de viser
      // fotball» sto her for viser_fotball = false — et ord dataene
      // aldri sa.
      ok("tipset er merket som et tips",
         rader[0].className.indexOf("forslag-tips") > -1, rader[0].className);
      ok("og sier med ord hva det paastar",
         rader[0].querySelector(".forslag-under").textContent
           .indexOf("de viser ikke fotball") > -1,
         rader[0].querySelector(".forslag-under").textContent);
      ok("og at stedet var antatt, ikke sjekket",
         rader[0].querySelector(".forslag-under").textContent.indexOf("antatt") > -1,
         rader[0].querySelector(".forslag-under").textContent);
      ok("mens tipset om et bekreftet sted ber om en vurdering",
         rader[1].querySelector(".forslag-under").textContent.indexOf("vurder") > -1,
         rader[1].querySelector(".forslag-under").textContent);
      ok("forslaget er ikke merket som tips",
         rader[2].className.indexOf("forslag-tips") === -1, rader[2].className);

      // Raden klar til aa limes inn peker stikk motsatt vei for et tips:
      // det ber ikke om en ny rad, det sier at en rad vi har er usann.
      ok("et tips far ingen klar-til-a-lime rad",
         !rader[0].querySelector(".forslag-kode"));
      ok("mens forslaget far den", !!rader[2].querySelector(".forslag-kode"));

      // Knappene sier hva trykket gjor. «Lagt inn» om et tips ville sagt at
      // vi la inn noe, naar vi tok noe ut.
      var knapper0 = rader[0].querySelectorAll(".forslag-knapper button");
      var tekster0 = Array.prototype.map.call(knapper0, function (b) { return b.textContent; });
      ok("tipset har «Ta stedet ut»", tekster0.indexOf("Ta stedet ut") > -1, tekster0.join(" | "));
      ok("og ikke «Apne i editoren»",
         tekster0.indexOf("Åpne i editoren") === -1, tekster0.join(" | "));
      ok("og «Avvis» heter at stedet blir staaende",
         tekster0.indexOf("Stedet blir stående") > -1, tekster0.join(" | "));

      // «Ta stedet ut» aapner stedet med haken satt. Den LAGRER ikke:
      // ADR 0019 og 0020 star, og et tips fra en forbipasserende er ikke et
      // unntak fra dem — det er grunnen til at de finnes.
      knapper0[0].click();
      setTimeout(function () { try {
        ok("skjemaet aapnes med stedet i", felt("stedNavn").value === "Gjettepuben",
           felt("stedNavn").value);
        ok("og haken for «tatt ut» satt", felt("stedFjernet").checked === true);
        ok("men ingenting er lagret av seg selv", lagret.length === 0,
           JSON.stringify(lagret));
        // Skjemaet maa si sant om sine egne krav: tas stedet ut, holder
        // navnet — og atte stjerner ville vaert usant.
        ok("og forklaringa sier at navnet holder",
           felt("stedPakrevdNote").textContent.indexOf("holder det med navnet") > -1,
           felt("stedPakrevdNote").textContent);

        felt("stedLagre").click();
        setTimeout(function () { try {
          ok("lagringen tar stedet ut",
             lagret.length === 1 && lagret[0].fjernet === true, JSON.stringify(lagret));

          // Hele sloyfa: lagringen ER svaret paa tipset, sa tipset skal
          // vaere merket uten et trykk til. Sto p.fjernet ? null igjen,
          // ble tipset staaende i koen etter at stedet var tatt ut.
          var behandlet = forslagKall.filter(function (k) {
            return k.handling === "behandle"; });
          ok("og merker tipset den svarer paa",
             behandlet.length === 1 && behandlet[0].id === 3,
             JSON.stringify(behandlet));
          ok("og sier at det var et tips, ikke et forslag lagt inn",
             felt("stedMelding").textContent.indexOf("Tipset i køen") > -1,
             felt("stedMelding").textContent);
          ferdig();
        } catch (e) { ok("ingen unntak i lagringen", false, e.message); ferdig(); } }, 400);
      } catch (e) { ok("ingen unntak i skjemaet", false, e.message); ferdig(); } }, 200);
    } catch (e) { ok("ingen unntak i koen", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`, null, adminSide);

/* ---------------- 15G. portalen sammenlagt ---------------- */

// Portalen var sju seksjoner, alle apne samtidig, og stedsskjemaet alene
// var 201 av 288 linjer markup i den. Meldt 21. september 2026: «Admin
// menyen er blitt veldig lang og uoversiktelig.»
//
// Egen scene framfor flere lag inni SAK_15: det som testes her er
// mekanikken som holder resten sammen, og den skal kunne rettes uten a
// grave seg gjennom sju tilbakekall.
//
// Det som maa vaere sant:
//   - hodet baerer et tall, for uten det er en lukket seksjon en du glemmer
//   - koen apner seg selv naar den har noe i seg
//   - koen apner Steder-seksjonen naar den sender deg dit
//   - trinn 2 skjuler aldri at noe kreves
const SAK_15G = kjor("admin-seksjoner", `
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-admin", navn: "Rune",
      utloper: Date.now() + 3600000,
    }));
  } catch (e) { /* privat modus */ }

  var KAMPER = [
    { id: 501, hjemme: "Rosenborg", borte: "Brann",
      dato: "2026-09-20T17:00:00+00:00", arena: "Lerkendal Stadion", runde: "Runde 21" }
  ];
  // Koen har ett forslag. Den skal apne seg selv av det.
  var koen = [{ id: 7, navn: "Bar Boca", adresse: "Thorvald Meyers gate 30",
                merknad: "", foreslatt: "2026-09-18", status: "ny" }];
  var iBasen = [];

  function svar(status, kropp) {
    return Promise.resolve({ ok: status < 400, status: status, text: function () {
      return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/fotball") === 0) {
      return svar(200, { liga: "Eliteserien", sesong: 2026, kilde: "TheSportsDB",
                         runde: "Runde 21", runder: ["Runde 21"], kamper: KAMPER });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      var k = JSON.parse(opt.body);
      if (k.handling === "liste") return svar(200, { puber: iBasen, klar: true });
      return svar(200, { ok: true, pub: k.pub, merknad: "Lagret." });
    }
    if (u.indexOf("/api/pub-forslag") === 0) return svar(200, { forslag: koen });
    if (u.indexOf("/api/brukere") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { brukere: [
        { id: "u-1", navn: "Kari", slug: "kari", forst: "2026-09-01T10:00:00Z",
          sist: "2026-09-12T19:00:00Z", aktiv: "" },
        { id: "u-2", navn: "Ola", slug: "ola", forst: "2026-08-20T10:00:00Z",
          sist: "2026-08-20T10:00:00Z", aktiv: "" }
      ] });
    }
    if (u.indexOf("/api/visninger") === 0) {
      if (!opt || opt.method !== "POST") return svar(200, { klar: true, mangler: [] });
      return svar(200, { ok: true, visninger: [] });
    }
    return svar(200, {});
  };

  function felt(id) { return document.getElementById(id); }
  function apen(id) { return felt(id).getAttribute("aria-expanded") === "true"; }

  window.addEventListener("load", function () { setTimeout(function () { try {
    felt("passord").value = "hemmelig";
    felt("loggInn").click();

    setTimeout(function () { try {
      // Adgang er ferdig med seg selv. Seksjonen sto igjen som fem rader
      // med ett deaktivert felt — en boks pa linje med Kamper og Steder,
      // om noe som ikke er en oppgave.
      ok("adgangsseksjonen er borte etter innlogging",
         felt("adgang").hidden === true, "star fortsatt");
      ok("og «Logg ut» staar oppe ved tittelen",
         felt("loggUt").hidden === false &&
         felt("loggUt").closest(".topp") !== null,
         felt("loggUt").parentElement.className);

      // Alle ligger lukket, kampene med. De sto framme fordi de var det
      // du kom for — sant sa lenge kamp for kamp var eneste mate a si hva
      // et sted viser. Ligaflagget dekker sesongen na, og lista her er
      // den du apner nar noe avviker fra den.
      ok("kampene er lukket ogsa", !apen("kampHode"), "apen");
      ok("stedene er lukket", !apen("stedHode"), "apen");
      ok("brukerne er lukket", !apen("brukerHode"), "apen");
      ok("verktoyet er lukket", !apen("verktoyHode"), "apen");
      ok("versjonen er lukket", !apen("versjonHode"), "apen");

      // Versjonen. To halvdeler som svarer paa hvert sitt sporsmal:
      // lista sier HVA som endret seg, commit-en om du ser paa det
      // nyeste. Lista tegnes med en gang — den ligger i en fil — mens
      // commit-en maa hentes.
      // Formen sjekkes uten regex: bakstreker spises av scene-literalen,
      // og /\d/ blir til /d/ — testen var rod paa «2026.09.21» av nettopp
      // den grunnen for den ble skrevet om. Fella staar i testing.md.
      function erTall(t) {
        return t.length > 0 && t.split("").every(function (c) {
          return c >= "0" && c <= "9"; });
      }
      var vBiter = felt("versjonTall").textContent.split(".");
      ok("nyeste versjon staar i hodet, sa en lukket seksjon sier noe",
         vBiter.length === 3 && vBiter[0].length === 4 && vBiter[1].length === 2 &&
         vBiter[2].length === 2 && vBiter.every(erTall),
         felt("versjonTall").textContent);
      var vLi = felt("versjonListe").querySelectorAll("li");
      ok("og lista har endringer i seg", vLi.length >= 1, vLi.length);
      // Issue-nummeret er en LENKE, ikke et tall: staar det «#146» uten
      // vei videre, maa du lete det opp selv.
      var vIssue = felt("versjonListe").querySelector(".versjon-issue");
      ok("issue-nummeret kan trykkes",
         !!vIssue && vIssue.tagName === "A" &&
         vIssue.getAttribute("href").indexOf("/issues/") > -1,
         vIssue ? vIssue.getAttribute("href") : "fant ingen");
      // ALLE, ikke bare den forste. En oppforing uten issue er lov — de to
      // forste fra 22. september 2026 har ingen, fordi de kom fra en
      // samtale og ikke fra en sak — men da skal det staa INGEN lenke,
      // ikke en som sier «#undefined».
      var issueFeil = [];
      Array.prototype.forEach.call(
        felt("versjonListe").querySelectorAll(".versjon-issue"), function (a) {
          var t = a.textContent;
          if (t.charAt(0) !== "#" || !erTall(t.slice(1))) issueFeil.push(t);
          if (a.getAttribute("href").indexOf("/issues/") === -1) issueFeil.push(t + " uten sti");
        });
      ok("og hvert issue-nummer ser ut som et issue-nummer",
         !!vIssue && issueFeil.length === 0, issueFeil.join(", ") || "ingen");

      // Byggestempelet. Det er den halvdelen som svarer paa «ser jeg paa
      // det nyeste?» — og den kom fra en funksjon som svarte null hver
      // gang, fordi Netlifys lese-variabler finnes i BYGGEMILJOET og ikke
      // i funksjonenes kjoretid. Meldt 22. september 2026:
      // «Byggemiljoet oppgir ingen commit».
      //
      // Scenen serverer sin egen bygg.js, slik verktoy/lag-bygg.mjs
      // skriver den ved en utrulling. Fila hentes med en dynamisk import,
      // saa linja staar paa «Henter …» til den har landet — og DET er
      // signalet vi venter paa. En fast frist ville malt hvor rask
      // maskinen er; CI er tregere enn min, og en test som er gronn her og
      // rod der sier ingenting om koden. Taket paa et halvt sekund ligger
      // godt innenfor scenens egen ferdig(), saa et stempel som aldri
      // lander gir roder — ikke pastander som kommer for sent til aa telle.
      var stempelForsok = 0;
      (function ventPaaStempel() {
        var kj = felt("versjonKjorer").textContent;
        if (kj.indexOf("Henter") > -1 && stempelForsok++ < 20) {
          setTimeout(ventPaaStempel, 25);
          return;
        }
        try {
          ok("byggestempelet sier hvilken commit dette er",
             kj.indexOf("a36dea5") > -1, kj);
          // Sju tegn, ikke fortti: en full sha er ikke noe et menneske
          // sammenlikner, og de sju forste holder til aa kjenne den igjen.
          ok("og det er de sju forste, ikke hele",
             kj.indexOf("a36dea534225") === -1, kj);
          // Prod skal IKKE si «forhandsvisning» — det er hele skillet.
          ok("og sier ikke forhandsvisning naar konteksten er production",
             kj.toLowerCase().indexOf("forhandsvisning") === -1, kj);
          ok("og hovedgrenen navngis ikke, for den er det vanlige",
             kj.indexOf("gren main") === -1, kj);
          // Tidspunktet leses av et menneske: en ISO-streng svarer ikke paa
          // «er dette fra i dag».
          ok("og naar det ble rullet ut, i ord",
             kj.indexOf("rullet ut") > -1 && kj.indexOf("2026-09-22T") === -1, kj);
        } catch (e) { ok("ingen unntak i byggestempelet", false, e.message); }
      })();
      ok("og panelene folger hodene sine",
         felt("kampKropp").hidden === true && felt("stedKropp").hidden === true &&
         felt("brukerKropp").hidden === true && felt("verktoyKropp").hidden === true,
         "panel og hode er uenige");

      // Pila ogsa. Den sto pa «.seksjon-hode» alene, sa trinnhodene i
      // stedsskjemaet pekte «lukket» over et apent trinn — et tegn som
      // sier noe annet enn tilstanden det beskriver.
      function pila(id) {
        return getComputedStyle(felt(id).querySelector(".seksjon-pil")).transform;
      }
      ok("pila snur i et apent seksjonshode", pila("forslagHode") !== "none",
         pila("forslagHode"));
      ok("og staar uvendt i et lukket", pila("stedHode") === "none", pila("stedHode"));

      // Koen apner seg selv fordi den har noe i seg. Tallet er grunnen
      // til at de ANDRE kan ligge lukket.
      ok("koen apner seg selv naar den har et forslag", apen("forslagHode"), "lukket");
      ok("og tallet staar i hodet", felt("forslagTall").textContent === "1",
         felt("forslagTall").textContent);
      ok("og er merket som noe som venter",
         felt("forslagTall").classList.contains("venter"), felt("forslagTall").className);
      ok("brukerne teller sine egne", felt("brukerTall").textContent === "2",
         felt("brukerTall").textContent);
      ok("og stedene sine", Number(felt("stedTall").textContent) > 20,
         felt("stedTall").textContent);

      // Et trykk styrer, begge veier.
      felt("forslagHode").click();
      ok("ett trykk lukker koen", !apen("forslagHode"), "fortsatt apen");
      felt("stedHode").click();
      ok("og et annet apner stedene", apen("stedHode"), "fortsatt lukket");

      // Trinn 2 er lukket for et NYTT sted: det er tomt, og et tomt trinn
      // er ingenting a se paa.
      felt("stedNytt").click();
      ok("skjemaet staar framme", felt("stedSkjema").hidden === false, "skjult");
      ok("trinn 1 er apent for et nytt sted", apen("trinn1Hode"), "lukket");
      ok("og trinn 2 er lukket", !apen("trinn2Hode"), "apent");
      // Og trinnhodene har den samme pila som seksjonene.
      ok("pila snur i et apent trinnhode", pila("trinn1Hode") !== "none", pila("trinn1Hode"));
      ok("og staar uvendt i et lukket", pila("trinn2Hode") === "none", pila("trinn2Hode"));
      // Men det skjuler ikke at noe kreves. Type og sikkerhet har
      // forhandsvalg, og sjekket fylles med dagens dato av fyllSted — da
      // staar kilde igjen som det ene som mangler.
      ok("og hodet sier hvor mange felt som mangler i det",
         felt("trinn2Tall").textContent.indexOf("felt mangler") > -1,
         felt("trinn2Tall").textContent);
      // Men ikke i rodt ennaa: et nytt sted er tomt, og en advarsel om noe
      // du ikke har gjort leses som en feil du har gjort.
      ok("og staar ikke som en feil for du har provd a lagre",
         !felt("trinn2Tall").classList.contains("mangler"), felt("trinn2Tall").className);

      // Tallet folger det du skriver, og aria-required er kilden — den
      // samme opplysningen stjerna staar for.
      var forKilde = felt("trinn2Tall").textContent;
      felt("stedKilde").value = "Var innom 20.09.2026, storskjerm i baren";
      felt("stedKilde").dispatchEvent(new Event("input", { bubbles: true }));
      ok("tallet folger feltene du fyller",
         felt("trinn2Tall").textContent !== forKilde,
         forKilde + " -> " + felt("trinn2Tall").textContent);

      // Trinn 1 mangler bydel, lat og lon. Lagring skal aapne BEGGE
      // trinn: meldinga navngir et felt, og en melding som peker inn i
      // noe du ikke ser er verre enn ingen.
      felt("stedNavn").value = "Bar Boca";
      felt("stedNavn").dispatchEvent(new Event("input", { bubbles: true }));
      felt("trinn1Hode").click();
      ok("trinn 1 kan lukkes", !apen("trinn1Hode"), "fortsatt apent");
      felt("stedLagre").click();

      setTimeout(function () { try {
        ok("en feilet lagring apner trinnet feilen ligger i",
           apen("trinn1Hode") && apen("trinn2Hode"),
           "trinn1 " + apen("trinn1Hode") + ", trinn2 " + apen("trinn2Hode"));
        ok("og sier hva som mangler",
           felt("stedMelding").textContent.indexOf("mangler") > -1,
           felt("stedMelding").textContent);
        // NAA er det en mangel: skjemaet ble bedt om noe det ikke kunne
        // gjore, og da skal tallet si det med farge og ikke bare telle.
        ok("og tallet i hodet staar som en mangel etterpa",
           felt("trinn1Tall").classList.contains("mangler"), felt("trinn1Tall").className);

        // Tas stedet UT, holder navnet — og da er «2 felt mangler» usant.
        felt("stedFjernet").checked = true;
        felt("stedFjernet").dispatchEvent(new Event("change", { bubbles: true }));
        ok("et sted som tas ut krever ingen flere felt",
           felt("trinn1Tall").textContent === "" && felt("trinn2Tall").textContent === "",
           felt("trinn1Tall").textContent + " / " + felt("trinn2Tall").textContent);

        // Koen sender deg til skjemaet, og skjemaet ligger i en ANNEN
        // seksjon. Er den lukket, apnes stedet et sted ingen ser det — og
        // scrollIntoView ruller til et skjult element.
        felt("stedAvbryt").click();
        felt("stedHode").click();
        ok("stedene er lukket igjen", !apen("stedHode"), "apen");
        felt("forslagHode").click();
        var iEditor = Array.prototype.filter.call(
          felt("forslagListe").querySelectorAll("button"),
          function (b) { return b.textContent === "Åpne i editoren"; })[0];
        ok("koen har knappen inn i editoren", !!iEditor, "fant den ikke");
        iEditor.click();
        ok("og den apner seksjonen skjemaet ligger i", apen("stedHode"), "fortsatt lukket");
        ok("saa skjemaet faktisk er synlig", felt("stedSkjema").hidden === false, "skjult");

        // Et sted som ALT finnes apner begge trinn: verdiene staar der,
        // og et lukket trinn ville skjult raden slik den er.
        felt("stedAvbryt").click();
        var rediger = felt("stedListe").querySelectorAll("button")[0];
        rediger.click();
        ok("et sted som finnes apner begge trinn",
           apen("trinn1Hode") && apen("trinn2Hode"),
           "trinn1 " + apen("trinn1Hode") + ", trinn2 " + apen("trinn2Hode"));

        // Krysser du av en kamp og lukker seksjonen, gaar bade knappen og
        // kvitteringen ut av syne. Tallet i hodet er det som staar igjen.
        felt("stedAvbryt").click();
        // Et lukket kamphode maa baere seksjonen, sa det staar hva som ER
        // satt naar ingenting er ulagret. Et tomt hode over tjue kamper
        // og to kryss er en seksjon du glemmer.
        var kampTall = felt("kampTall").textContent;
        ok("kamphodet sier hva som er satt naar ingenting er endret",
           kampTall.indexOf(" av ") > -1 && kampTall.slice(-5) === " satt",
           kampTall);
        ok("og det staar ikke som noe som venter pa deg",
           !felt("kampTall").classList.contains("venter"),
           felt("kampTall").className);
        var boks = document.querySelectorAll(".kamp input")[0];
        ok("det finnes en kamp a krysse av", !!boks, "ingen kamper");
        boks.checked = true;
        boks.dispatchEvent(new Event("change", { bubbles: true }));
        ok("en ulagret endring staar i kamphodet",
           felt("kampTall").textContent === "1 ulagret endring",
           felt("kampTall").textContent);
        ok("og den er merket som noe som venter",
           felt("kampTall").classList.contains("venter"), felt("kampTall").className);
        ferdig();
      } catch (e) { ok("ingen unntak i skjemaet", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak i portalen", false, e.message); ferdig(); } }, 600);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400); });
`, null, adminSide, {
  // Byggestempelet slik `verktoy/lag-bygg.mjs` skriver det ved en
  // utrulling. Scenens egen fil: den finnes ikke i repoet, for den
  // er generert og staar i .gitignore.
  "bygg.js": 'export const BYGG = {"tid":"2026-09-22T01:00:00.000Z",'
    + '"commit":"a36dea534225cd7801df92dc570dd017080ce7ed",'
    + '"gren":"main","kontekst":"production","utrulling":"6ab1d31b"};',
});

/* ---------------- 16. puben bekrefter kampen ---------------- */

// Visningene admin setter skal treffe leseren: pubene som viser nettopp
// denne kampen star over alle andre forslag, og er merket ogsa der de
// dukker opp i en annen gruppe.
//
// Visningene la i visninger.js i repoet til 15. september 2026 og fulgte
// med utrullingen; na kommer de fra Supabase, pa lasset i /api/svar
// (#79). Stubben under svarer derfor som **tjenesten** gjor — med
// `kampId`, ikke `kamp_id` som star i basen. Den retningen er ikke
// pedanteri: en stubb skrevet ut fra basen framfor ut fra svaret var
// grunnen til at 412 tester ikke sa at «blir med»-lista aldri hadde
// virket.
const VISNINGER_FRA_TJENESTEN = [
  { pub: "Lincoln Pub", kampId: "2026-09-20-brann-bodoglimt", kamp: "Brann – Bodo/Glimt",
    dato: "2026-09-20T17:00:00+00:00", satt: "2026-09-11T10:00:00.000Z" },
  { pub: "Carls", kampId: "2026-09-21-molde-rosenborg", kamp: "Molde – Rosenborg",
    dato: "2026-09-21T17:00:00+00:00", satt: "2026-09-11T10:00:00.000Z" },
];

/* ------- 16C. en bekreftet visning 392 km unna ------- */

// Meldt 20. september 2026, med skjermbilde: «hvorfor kommer bernies opp
// naar jeg er i trondheim».
//
// Fordi kilden svarer paa KAMPEN og kjenner ingen geografi. Bernie's paa
// Gronland i Oslo hadde meldt inn kampen, og sto derfor oeverst som svaret
// paa «hvor skal du se den?» — 392 km unna. Regelen var riktig saa lenge
// lista var Oslo.
const SAK_16C = kjor("bekreftet-langt-unna", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var VISNINGER = [
    { pub: "Bernie's", kampId: "2026-09-20-brann-bodoglimt", kamp: "Brann – Bodo/Glimt",
      dato: "2026-09-20T17:00:00+00:00", satt: "2026-09-11T10:00:00.000Z" }
  ];
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // Leseren staar i Trondheim. Bernie's staar i puber.js, paa Gronland.
  history.replaceState(null, "", location.pathname + "?posisjon=trondheim");
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: VISNINGER })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("/api/pub-liste") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelectorAll(".kamp.delbar")[0];

    // Linja «Denne kampen vises paa: …» sto her, og fem rader paa rad sa
    // det samme navnet. Den er borte (21. september 2026); kampraden
    // baerer bare det som SKILLER radene.
    ok("kampraden navngir ingen pub",
       !rad.querySelector(".kamp-viser") &&
       rad.textContent.indexOf("vises på") === -1,
       rad.textContent.slice(0, 160));

    // Og opplysningen er ikke borte — den staar i kortet, der den kom med
    // avstand og by. Det er hele grunnen til at linja kunne fjernes.
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    setTimeout(function () { try {
      var stedChip = function (navn) {
        return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
          function (c) { return c.querySelector(".sted-navn") &&
            c.querySelector(".sted-navn").textContent === navn; });
      };
      var bernies = stedChip("Bernie's");
      ok("raden finnes i kortet", !!bernies, "ingen rad");
      ok("men ligger i lista over andre byer",
         !!bernies && !!bernies.closest(".sted-andre"),
         bernies ? bernies.className : "");
      // Avstanden staar paa raden: «Bernie's» og «Bernie's 392 km» er to
      // ulike svar, og bare det andre kan leses.
      ok("og avstanden staar paa den",
         !!bernies && !!bernies.querySelector(".sted-avstand") &&
         bernies.querySelector(".sted-avstand").textContent.indexOf("km") > -1,
         bernies && bernies.querySelector(".sted-avstand")
           ? bernies.querySelector(".sted-avstand").textContent : "ingen avstand");

      // #144 ba om kart. Det ble en lenke inn i telefonens eget kart:
      // et innebygd kart ville vaert foerste tredjepartsskript, og en
      // fliseserver ville sett IP og utsnitt for hver leser.
      var vei = bernies && bernies.querySelector(".sted-kart");
      ok("og veien dit staar paa raden", !!vei,
         bernies ? bernies.innerHTML.slice(0, 200) : "ingen rad");
      // Bernie's staar paa Gronland: 59.9095, 10.7690. At det er STEDETS
      // punkt og ikke et hvilket som helst, er hele forskjellen paa en
      // lenke som virker og en som sender deg et annet sted.
      ok("med stedets eget punkt i adressen",
         !!vei && vei.getAttribute("href").indexOf("59.9095%2C10.769") > -1,
         vei ? vei.getAttribute("href") : "ingen lenke");
      // **Og aldri hvor LESEREN staar.** Kartappen regner fra telefonens
      // egen posisjon, som leseren alt har gitt den. Sto «origin» i
      // adressen, sendte vi fra oss noe vi ikke trenger aa sende.
      ok("og ikke hvor leseren staar",
         !!vei && vei.getAttribute("href").indexOf("origin") === -1,
         vei ? vei.getAttribute("href") : "ingen lenke");
      // En ekte <a>, ikke en knapp: langtrykk gir «Kopier lenke», som for
      // sakene. Og SOESKEN av «Jeg skal hit» — en knapp i en knapp finnes
      // ikke.
      ok("den er en lenke, ikke en knapp i en knapp",
         !!vei && vei.tagName === "A" && !vei.closest("button"),
         vei ? vei.tagName + " i " + (vei.closest("button") ? "knapp" : "rad") : "ingen");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ------- 16D. sok i lista: i Trondheim, men i Oslo paa fredag ------- */

// Meldt 20. september 2026: «Jeg er i dag i Trondheim men planlegger kamp
// om 3 dager. Da er jeg i Oslo. Saa da meg ogsaa kunne trykke paa andre
// plasser eller puber.»
//
// Kortet rangerer etter hvor du staar NAA. For en kamp i kveld er det
// riktig; for en kamp om tre dager er det en gjetning, og for den som
// reiser feil gjetning. Soket er veien utenom geografien.
const SAK_16D = kjor("sted-sok", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=trondheim");
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("/api/pub-liste") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelectorAll(".kamp.delbar")[0];
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();

    setTimeout(function () { try {
      var forslag = panel;
      var naere = function () {
        return Array.prototype.map.call(
          panel.querySelectorAll(".sted-liste .sted-rad-kort"),
          function (c) { return c.textContent; }).join(" | ");
      };
      var fjerne = function () {
        return Array.prototype.map.call(
          panel.querySelectorAll(".sted-andre .sted-rad-kort"),
          function (c) { return c.textContent; }).join(" | ");
      };

      // Leseren staar i Trondheim. Lista over stedene naer deg svarer paa
      // det, og skal ikke ha en Oslo-pub i seg.
      ok("ingen Oslo-pub blant stedene naer deg",
         naere().indexOf("Andy") === -1, naere() || "(tom)");

      // Men kampen er om tre dager, og da er du i Oslo. Soket «Skriv
      // stedet du skal» var svaret til 20. september 2026 — det krevde at
      // du visste hva stedet het. Lista over andre byer krever ingenting.
      // Lista viser fem, saa «Ekspander lista». Ingenting forsvinner.
      var merAndre = panel.querySelector(".sted-andre .pub-mer");
      ok("og en knapp teller resten", !!merAndre,
         merAndre ? merAndre.textContent : "ingen knapp");
      if (merAndre) merAndre.click();
      ok("men de staar i lista over andre byer",
         fjerne().indexOf("Andy") > -1, fjerne().slice(0, 200) || "(tom)");
      // Avstanden staar paa raden, saa 391 km er noe du kan forkaste selv.
      ok("og avstanden staar paa dem", fjerne().indexOf("km") > -1,
         fjerne().slice(0, 200));

      // Den falske posisjonen gjelder like mye her: avstandene males fra
      // den, og en app som tier om det lyver med sin egen liste.
      ok("og merket for falsk posisjon staar i noten",
         forslag.querySelector(".pub-note").textContent.indexOf("Falsk posisjon") === 0,
         forslag.querySelector(".pub-note").textContent);

      // Og du kan si at du skal dit. Det var hele grunnen til at de fjerne
      // ble en LISTE og ikke en opplysning.
      var andyRad = Array.prototype.find.call(
        panel.querySelectorAll(".sted-andre .sted-rad-kort"),
        function (c) { return c.textContent.indexOf("Andy") > -1; });
      ok("og en pub i en annen by kan svares paa",
         !!andyRad && !!andyRad.querySelector(".sted-knapp"),
         andyRad ? andyRad.textContent : "ingen rad");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ------- 16E. posisjonen ble aldri spurt om ------- */

// Meldt 20. september 2026, med skjermbilde, igjen: «Bernie kommer opp og
// jeg er i Trondheim.»
//
// Filteret fra 16C var pa plass og virket. Det fikk bare aldri vite hvor
// leseren sto: posisjonen ble hentet i hentNaerDeg(), som henger bak
// «Andre fotballpuber» — ett trykk LENGER INN enn kortet. Uten posisjon
// svarer naerNok() ja (ukjent avstand demper ingenting), og Bernie's sto
// oeverst som svaret paa «hvor skal du se den?».
//
// Alle de sju posisjonstestene var groenne, for de setter ?posisjon= i
// URL-en — og den snarveien setter posisjonen ved oppstart, foer noe kort
// aapnes. De beviste at filteret virker naar posisjonen finnes, og
// ingenting om veien dit. Denne scenen har derfor INGEN ?posisjon=.
const SAK_16E = kjor("posisjon-ved-kortapning", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var VISNINGER = [
    { pub: "Bernie's", kampId: "2026-09-20-brann-bodoglimt", kamp: "Brann – Bodo/Glimt",
      dato: "2026-09-20T17:00:00+00:00", satt: "2026-09-11T10:00:00.000Z" }
  ];
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });

  // Telefonen svarer ikke av seg selv: vi holder paa tilbakekallet, sa
  // scenen kan se hva skjermen sier BADE for og etter at posisjonen lander.
  var spurt = 0;
  var gi = null;
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    getCurrentPosition: function (traff) { spurt += 1; gi = traff; }
  } });

  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: VISNINGER })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("/api/pub-liste") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelectorAll(".kamp.delbar")[0];
    ok("runden staar tegnet", !!rad);
    if (!rad) { ferdig(); return; }

    // Regelen som ikke skal vike: vi ber ALDRI om posisjon for a tegne en
    // rad. Runden staar ferdig, og telefonen er ikke spurt om noe.
    ok("ingen ber om posisjon for a tegne runden", spurt === 0, "spurt " + spurt);

    // Regelen «byen ved navnet naar avstanden er ukjent» sto ogsa i linja
    // under kampraden. Den er borte; regelen lever i KORTET, og maales
    // rett under naar det aapnes.

    // Trykket som apner kortet ER handlingen telefonen krever.
    rad.querySelector(".kamp-del").click();
    ok("og kortet spor om posisjon naar det apnes", spurt === 1, "spurt " + spurt);

    var panel = document.querySelector(".kamp-panel");
    var stedChip = function (navn) {
      return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === navn; });
    };
    var bernies = stedChip("Bernie's");
    ok("raden staar i kortet mens vi venter paa svaret", !!bernies, "ingen rad");
    ok("med byen paa, ikke bare navnet",
       !!bernies && !!bernies.querySelector(".sted-by") &&
       bernies.querySelector(".sted-by").textContent === "Oslo",
       bernies && bernies.querySelector(".sted-by")
         ? bernies.querySelector(".sted-by").textContent : "ingen by");

    // Na svarer telefonen: leseren staar i Trondheim.
    ok("telefonen har et tilbakekall a svare med", !!gi, "ingen");
    if (!gi) { ferdig(); return; }
    gi({ coords: { latitude: 63.4305, longitude: 10.3951 } });

    setTimeout(function () { try {
      // Kampraden navngir ingen pub — hverken for eller etter at
      // posisjonen lander. Den baerer bare det som skiller radene.
      var rad2 = document.querySelectorAll(".kamp.delbar")[0];
      ok("kampraden navngir fortsatt ingen pub",
         rad2.textContent.indexOf("vises på") === -1,
         rad2.textContent.slice(0, 160));

      var panel2 = document.querySelector(".kamp-panel");
      var bernies2 = panel2 && Array.prototype.find.call(
        panel2.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === "Bernie's"; });
      ok("og raden i kortet gaar til andre byer",
         !!bernies2 && !!bernies2.closest(".sted-andre"),
         bernies2 ? bernies2.className : "ingen rad");
      ok("med avstanden paa, ikke byen",
         !!bernies2 && !!bernies2.querySelector(".sted-avstand"),
         bernies2 && bernies2.querySelector(".sted-avstand")
           ? bernies2.querySelector(".sted-avstand").textContent : "ingen avstand");
      ferdig();
    } catch (e) { ok("ingen unntak etter posisjonen", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ------- 16F. en pub du har delt for, i en annen by ------- */

// Meldt 20. september 2026 med skjermbilde fra Trondheim: «Puber ikke i
// by burde markeres.» Andy's Pub sto under «Kampen vises hos:» uten by og
// uten km — midt blant stedene naer deg, 390 km unna.
//
// Aarsaken: «dine puber» baerer BARE et navn. dinePuber() lagrer
// {navn, antall, sist} i nettleseren, saa raden kom inn uten lat og lon.
// Da ga avstandTil() null og naerNok() svarte ja — riktig regel, men den
// gjelder naar vi ikke KAN vite, og tallene sto i puber.js hele tiden.
const SAK_16F = kjor("din-pub-annen-by", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  // En pub du har delt for. Den staar i puber.js, i Oslo — men det du har
  // lagret er navnet og ingenting annet.
  localStorage.setItem("sb-visning", JSON.stringify({
    puber: [{ navn: "Andy's Pub", antall: 3, sist: 2 }] }));
  history.replaceState(null, "", location.pathname + "?posisjon=trondheim");
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("/api/pub-liste") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelectorAll(".kamp.delbar")[0].querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    setTimeout(function () { try {
      var finn = function (velger) {
        return Array.prototype.find.call(panel.querySelectorAll(velger),
          function (c) { return c.querySelector(".sted-navn") &&
            c.querySelector(".sted-navn").textContent === "Andy's Pub"; });
      };

      // Kjernen: den skal IKKE staa blant stedene naer deg.
      ok("din egen pub i en annen by staar ikke blant de naere",
         !finn(".sted-liste:not(.pub-forslag .sted-liste) .sted-rad-kort"),
         panel.querySelector(".sted-liste").textContent.slice(0, 160));

      var fjern = finn(".sted-andre .sted-rad-kort");
      ok("men i lista over puber i andre byer", !!fjern,
         panel.querySelector(".sted-andre").textContent.slice(0, 160) || "(tom)");
      if (!fjern) { ferdig(); return; }

      // Og den kan leses: byen og avstanden staar paa raden. «Andy's Pub»
      // og «Andy's Pub Oslo 390 km» er to ulike svar.
      ok("med byen paa raden",
         !!fjern.querySelector(".sted-by") &&
         fjern.querySelector(".sted-by").textContent === "Oslo",
         fjern.querySelector(".sted-by")
           ? fjern.querySelector(".sted-by").textContent : "ingen by");
      ok("og avstanden",
         !!fjern.querySelector(".sted-avstand") &&
         fjern.querySelector(".sted-avstand").textContent.indexOf("km") > -1,
         fjern.querySelector(".sted-avstand")
           ? fjern.querySelector(".sted-avstand").textContent : "ingen avstand");

      // Merket foelger med fra fila: den er kuratert, saa ⚽ staar der.
      ok("og merket for at den viser fotball", !!fjern.querySelector(".pub-merke"),
         fjern.innerHTML.slice(0, 120));
      ferdig();
    } catch (e) { ok("ingen unntak i kortet", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ------- 16G. et sted vi har gjettet paa ------- */

// «usikker» falt ut av lista appen leser til 20. september 2026, og da var
// det ingen forskjell for leseren mellom «vi har sett etter og er i tvil»
// og «stedet finnes ikke». Lista var 26 steder, alle i Oslo, og resten av
// landet fikk «Fant ingen puber» — ikke fordi vi hadde undersokt.
//
// Na staar de der, med sine egne ord. Raden kommer fra portalen, som er
// veien et sted i en ny by faktisk kommer inn.
const SAK_16G = kjor("antatt-sted", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=trondheim");
  // Slik PostgREST sender raden videre gjennom /api/pub-liste.
  // Raden baerer et GYLDIG ligaflagg — kilde og dato paa plass. Det er
  // nettopp den kombinasjonen flettinga 21. september 2026 maatte avgjore:
  // et sted vi har gjettet paa, som noen har krysset av for en hel liga.
  var I_BASEN = [{ navn: "Gjettepuben", bydel: "Midtbyen",
    adresse: "Munkegata 1", lat: 63.4310, lon: 10.3955, type: "pub", lag: [],
    kilde: "Antatt fra kartet, ikke sjekket", sikkerhet: "usikker",
    sjekket: "2026-09-20", fjernet: false,
    ligaer: { sender: ["eliteserien"], kilde: "https://example.test/tv",
              sjekket: "2026-09-20" } }];
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: I_BASEN })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelectorAll(".kamp.delbar")[0].querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    setTimeout(function () { try {
      var rad = Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === "Gjettepuben"; });

      // Kjernen: den skal staa der i det hele tatt.
      ok("et usikkert sted staar i kortet", !!rad,
         panel.textContent.slice(0, 200));
      if (!rad) { ferdig(); return; }

      // Og den skal si hva den er. Et merke alene er en konvensjon du maa
      // laere; her er det nettopp forbeholdet som er poenget.
      ok("med ord som sier at den er antatt",
         !!rad.querySelector(".sted-antatt-tekst") &&
         rad.querySelector(".sted-antatt-tekst").textContent
           .indexOf("ikke bekreftet") > -1,
         rad.querySelector(".sted-antatt-tekst")
           ? rad.querySelector(".sted-antatt-tekst").textContent : "ingen ord");

      // Og den skal IKKE baere det samme merket som et sted noen har
      // sjekket. ⚽ er «kjent for aa vise fotball» — det er en paastand.
      ok("og ikke merket for kjent fotballpub",
         !rad.querySelector(".pub-merke") && !!rad.querySelector(".sted-antatt-merke"),
         rad.innerHTML.slice(0, 140));

      // Stjerna er en helt annen paastand og maa heller ikke laane seg ut.
      ok("og ikke stjerna heller", !rad.querySelector(".pub-bekreftet"));

      // Og HELLER IKKE 📺, enda raden baerer et gyldig ligaflagg.
      //
      // «Sender Eliteserien» er den sterkeste paastanden et sted kan baere
      // uten at et menneske har sett paa nettopp denne kampen, og
      // usikker betyr at vi ikke har sjekket at stedet viser fotball i
      // det hele tatt. Vant 📺, sto en gjetning og lovet en hel liga.
      ok("og ikke ligamerket, enda flagget staar paa raden",
         !rad.querySelector(".pub-liga"), rad.innerHTML.slice(0, 200));
      ok("ordene om antakelsen staar fortsatt",
         !!rad.querySelector(".sted-antatt-tekst"));
      ferdig();
    } catch (e) { ok("ingen unntak i kortet", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);


/* ------- 16H. veien tilbake fra en antakelse ------- */

// ADR 0022 satte et gjettet sted inn i lista med sine egne ord. Uten en vei
// tilbake er det gjetning med bedre typografi, og lista blir daarligere for
// hver by vi fyller. Dette er veien tilbake, sett fra leseren.
//
// Fire ting skal holde: knappen staar BARE paa et antatt sted, den fyller
// skjemaet med stedet, den sender viserFotball: false — som ER tipset — og
// vakta mot «det stedet staar allerede i lista» maa gaa motsatt vei her.
const SAK_16H = kjor("antatt-si-fra", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "" }); });
  history.replaceState(null, "", location.pathname + "?posisjon=trondheim");
  window.__forslag = [];
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-1", navn: "Rune",
      utloper: Date.now() + 3600000 }));
  } catch (e) { /* privat modus */ }

  // To steder fra portalen: ett vi har GJETTET paa, og ett noen har staatt i
  // doera paa. Bare det forste skal kunne rettes bort av et trykk.
  var I_BASEN = [
    { navn: "Gjettepuben", bydel: "Midtbyen", adresse: "Munkegata 1",
      lat: 63.4310, lon: 10.3955, type: "pub", lag: [],
      kilde: "Antatt fra kartet, ikke sjekket", sikkerhet: "usikker",
      sjekket: "2026-09-20", fjernet: false },
    { navn: "Sjekkepuben", bydel: "Midtbyen", adresse: "Munkegata 3",
      lat: 63.4312, lon: 10.3957, type: "sportsbar", lag: [],
      kilde: "Var innom 20.09.2026, storskjerm i baren", sikkerhet: "bekreftet",
      sjekket: "2026-09-20", fjernet: false },
  ];
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-forslag") === 0) {
      window.__forslag.push(JSON.parse((opt || {}).body || "{}"));
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { ok: true, merknad: "Takk. Vi ser på det." })); } });
    }
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200, json: function () {
        return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { klar: true, puber: I_BASEN })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelectorAll(".kamp.delbar")[0].querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    setTimeout(function () { try {
      function radFor(navn) {
        return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
          function (c) { return c.querySelector(".sted-navn") &&
            c.querySelector(".sted-navn").textContent === navn; });
      }
      var antatt = radFor("Gjettepuben");
      var sjekket = radFor("Sjekkepuben");
      ok("begge stedene staar i kortet", !!antatt && !!sjekket,
         panel.textContent.slice(0, 200));
      if (!antatt || !sjekket) { ferdig(); return; }

      // Kjernen: knappen staar paa antakelsen, og BARE der. Et sted noen
      // har staatt i doera paa skal ikke kunne rettes bort av et trykk fra
      // en som gikk forbi.
      var nei = antatt.querySelector(".sted-si-fra");
      ok("det antatte stedet har en vei tilbake", !!nei,
         antatt.textContent);
      ok("og den sier hva den paastar",
         !!nei && nei.textContent.indexOf("viser ikke fotball") > -1,
         nei ? nei.textContent : "ingen knapp");
      ok("det bekreftede stedet har den ikke",
         !sjekket.querySelector(".sted-si-fra"), sjekket.innerHTML.slice(0, 160));
      if (!nei) { ferdig(); return; }

      nei.click();
      var skjema = panel.querySelector(".sted-forslag-skjema");
      var felter = skjema.querySelectorAll(".konto-felt");
      ok("skjemaet aapnes", skjema.hidden === false, skjema.hidden ? "skjult" : "framme");
      // Fylt fra raden var: leseren skal ikke skrive inn et navn vi alt har,
      // og en skrivefeil der ville gjort tipset umulig aa knytte til stedet.
      ok("med stedet fylt inn", felter[0].value === "Gjettepuben", felter[0].value);
      ok("og adressen vi har", felter[1].value === "Munkegata 1", felter[1].value);
      // Skjemaet maa si HVILKEN av de to handlingene det er. To ulike
      // handlinger i samme felt, og et skjema som ikke sier hvilken, er
      // verre enn to skjemaer.
      var tittel = skjema.querySelector(".sted-forslag-tittel");
      ok("og skjemaet sier at dette er et tips",
         !!tittel && !tittel.hidden &&
         tittel.textContent.indexOf("Gjettepuben") > -1,
         tittel ? tittel.textContent : "ingen tittel");
      ok("og at et menneske tar stedet ut",
         skjema.querySelector(".sted-forslag-note").textContent
           .indexOf("tar et menneske det ut") > -1,
         skjema.querySelector(".sted-forslag-note").textContent);

      skjema.querySelector(".konto-send").click();
      setTimeout(function () { try {
        // Vakta mot «det stedet staar allerede i lista» maa gaa MOTSATT vei
        // her: et tips handler om et sted som alt staar der. Stod den som
        // for, ble den ene meldinga vi trenger for aa rette lista avvist.
        ok("tipset sendes selv om stedet staar i lista",
           window.__forslag.length === 1, JSON.stringify(window.__forslag));
        var f = window.__forslag[0] || {};
        // DETTE er tipset: viser_fotball === false, ett felt med én
        // betydning per verdi, og ingen ny kolonne aa holde i takt.
        ok("og det er viserFotball: false som baerer det",
           f.viserFotball === false, JSON.stringify(f));
        ok("med navnet paa stedet", f.navn === "Gjettepuben", f.navn);
        ok("og med din egen okt", f.token === "okt-token", f.token);
        // Stedet staar i lista mens vi ser paa det, og det skal leseren
        // vite — ellers er svaret et loefte vi ikke holder.
        ok("svaret sier at stedet staar der til noen har sett paa det",
           skjema.querySelector(".kamp-svar").textContent.indexOf("står det der") > -1,
           skjema.querySelector(".kamp-svar").textContent);

        // Og skjemaet skal ikke bli staaende i tipsmodus: neste gang du
        // melder inn et sted, er det et forslag.
        panel.querySelector(".sted-pavei").click();
        ok("skjemaet faller tilbake til et vanlig forslag",
           skjema.querySelector(".sted-forslag-tittel").hidden === true,
           skjema.querySelector(".sted-forslag-tittel").textContent);
        ok("og knappen heter det igjen",
           skjema.querySelector(".konto-send").textContent === "Send inn",
           skjema.querySelector(".konto-send").textContent);
        ferdig();
      } catch (e) { ok("ingen unntak i sendingen", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak i kortet", false, e.message); ferdig(); } }, 900);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ------- 16B. rettelsene fra portalen treffer leseren ------- */

// Det som kommer over nettet, lander etter at visningen star ferdig.
// Stedene er tredje datakilde som gjor det (#80), og de to forste kostet
// hver sin feil: raden som aldri fikk «vises pa», og kortet som sto med
// gamle svar. Derfor svarer /api/pub-liste her **for sent med vilje** —
// etter at kortet er tegnet — og testen ser om kortet tegnes om.
const SAK_16B = kjor("pub-rettelser", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Leseren star midt i Kvadraturen. The Toucan star i puber.js
  // 463 meter unna; Nystedet finnes bare i basen.
  navigator.geolocation.getCurrentPosition = function (ok) {
    ok({ coords: { latitude: 59.9165, longitude: 10.7530 } });
  };
  var pubListeSvart = false;
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/pub-liste") === 0) {
      // Sent nok til at kortet rekker a bli tegnet forst.
      return new Promise(function (los) {
        setTimeout(function () {
          pubListeSvart = true;
          los({ ok: true, status: 200, statusText: "OK", text: function () {
            return Promise.resolve(JSON.stringify({ klar: true, puber: [
              // Nokkelen star ikke her med vilje: tabellen garanterer at
              // den er navnet foldet, og en handskrevet nokkel ville
              // modellert det jeg trodde koden gjor framfor det basen
              // faktisk barer. Den feilen kostet en runde her.
              { navn: "Nystedet", bydel: "Sentrum",
                adresse: "Kirkegata 1", lat: 59.9163, lon: 10.7528,
                type: "sportsbar", lag: [], kilde: "https://nystedet.no/",
                sikkerhet: "bekreftet", sjekket: "2026-09-16", fjernet: false },
              { navn: "The Toucan Public House", fjernet: true }
            ] })); } });
        }, 1500);
      });
    }
    if (u.indexOf("overpass") > -1 || u.indexOf("/api/puber?") === 0 ||
        u.indexOf("/api/vaer?") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
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
  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelector(".kamp.delbar");
    var del = rad && rad.querySelector(".kamp-del");
    if (del) del.click();
    // Forslagene ligger bak en lenke i kortet, og ingenting hentes for
    // den apnes. Ingen hermetegn i en selektor her: en bakoverstrek i en
    // template-streng er borte for nettleseren ser den, og da dor sida.
    var apne = document.querySelector(".sted-andre-apne");
    if (apne) apne.click();

    setTimeout(function () { try {
      // Stedene staar framme i kortet na, ikke bak en lenke — sa det er
      // hele panelet som skal maales, ikke boksen som laa bak den.
      var boks = document.querySelector(".kamp-panel");
      ok("kortet star med kjente steder for rettelsene har landet",
         !!boks && !pubListeSvart, String(!!boks) + " " + pubListeSvart);
      var for_ = boks ? boks.textContent : "";
      ok("og The Toucan er ett av dem", for_.indexOf("Toucan") > -1, for_.slice(0, 200));
      ok("mens Nystedet ikke finnes enda", for_.indexOf("Nystedet") === -1);

      // Na lander rettelsene, pa et kort som alt star ferdig.
      setTimeout(function () { try {
        ok("rettelsene har landet", pubListeSvart);
        var etter = document.querySelector(".kamp-panel");
        var tekst = etter ? etter.textContent : "";
        ok("stedet som bare star i basen dukker opp pa kortet",
           tekst.indexOf("Nystedet") > -1, tekst.slice(0, 300));
        // Et sted som la ned skal forsvinne, ogsa fra et kort som alt er
        // tegnet. Ellers star det til kortet lukkes.
        ok("og stedet som er tatt ut forsvinner fra det",
           tekst.indexOf("Toucan") === -1, tekst.slice(0, 300));
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500); });
`);

const SAK_16 = kjor("pub-bekreftet", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var VISNINGER = ${JSON.stringify(VISNINGER_FRA_TJENESTEN)};`  + `
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
    // Visningene rir med pa /api/svar, som «hvem blir med».
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: VISNINGER })); } });
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
    // «Denne kampen vises paa: Lincoln Pub» sto under hver kamprad til
    // 21. september 2026. Meldt med skjermbilde: fem rader paa rad sa
    // «Andy's Pub (Oslo)». Et svar som er likt paa hver rad svarer ikke —
    // det staar i veien for det som SKILLER radene.
    var rader = document.querySelectorAll(".kamp.delbar");
    ok("ingen kamprad navngir en pub",
       !document.querySelector(".kamp-viser") &&
       rader[0].textContent.indexOf("vises på") === -1,
       rader[0].textContent.slice(0, 160));
    ok("heller ikke den neste, som har sin egen",
       rader[1].textContent.indexOf("Carls") === -1,
       rader[1].textContent.slice(0, 160));

    // Opplysningen er ikke borte. Den staar i kortet, og det er hele
    // grunnen til at linja kunne fjernes.
    document.querySelectorAll(".kamp-del")[0].click();
    var apnet = document.querySelector(".kamp-panel");
    ok("kortet apnes fra kampraden", !!apnet);
    if (!apnet) { ferdig(); return; }
    // Én liste, og den spor. «Disse viser kampen» over hele lista ville
    // pastatt at arenaen og en pub ingen har meldt inn viser den — og det
    // er nettopp den merkingen appen ellers holder ren.
    ok("overskrifta spor, den pastar ingenting",
       apnet.querySelector(".kamp-panel-tittel").textContent === "Hvor skal du se den?",
       apnet.querySelector(".kamp-panel-tittel").textContent);
    document.querySelectorAll(".kamp-del")[0].click();

    // Forste kamp: Brann – Bodo/Glimt, som Lincoln Pub viser.
    document.querySelectorAll(".kamp-del")[0].click();
    var panel = document.querySelectorAll(".kamp-panel")[0];

    // Lenka «Andre fotballpuber» er borte (20. september 2026). Det som
    // laa bak den staar framme, og det eneste som fortsatt er lukket er
    // pubene i andre byer — som svarer paa noe annet enn «hvor skal jeg».
    var lenka = panel.querySelector(".sted-andre-apne");
    ok("den lukkede lista heter «Trykk her for puber i andre byer»",
       !!lenka && lenka.textContent === "Trykk her for puber i andre byer",
       lenka ? lenka.textContent : "ingen knapp");
    var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
    var forslag = panel;
    setTimeout(function () { try {
      var chips = forslag.querySelectorAll(".sted-rad-kort");
      // Den eneste kilden som svarer pa *kampen* framfor pa stedet —
      // derfor forst i rangeringen.
      ok("puben som viser denne kampen star aller forst",
         chips[0].textContent.indexOf("Lincoln Pub") > -1, chips[0].textContent);
      ok("den er merket med stjerne",
         !!chips[0].querySelector(".pub-bekreftet")
         && chips[0].querySelector(".pub-bekreftet").textContent === "\u2605",
         chips[0].textContent);
      ok("og stjerna sier hva den betyr",
         chips[0].querySelector(".pub-bekreftet").getAttribute("aria-label") === "viser denne kampen");
      // En annen pubs kamp skal ikke lekke inn.
      ok("en annen kamps pub star ikke merket her",
         !Array.prototype.some.call(chips, function (c) {
           return c.textContent.indexOf("Carls") === 0 && !!c.querySelector(".pub-bekreftet");
         }), forslag.textContent.slice(0, 120));

      // Samme pub kommer fra flere kilder, men skal sta ett sted — og i
      // ÉN av de to listene, ikke i begge.
      var lincoln = Array.prototype.filter.call(
        panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === "Lincoln Pub"; });
      ok("puben star ett sted, ikke i flere lister", lincoln.length === 1, lincoln.length);
      // Ingenting forsvinner: resten ligger ett trykk unna. Knappen heter
      // «Ekspander lista (N)» i begge listene.
      var mer = panel.querySelector(".sted-mer") ||
                panel.querySelector(".sted-andre .pub-mer");
      ok("resten ligger bak «Ekspander lista»",
         !!mer && mer.textContent.indexOf("Ekspander lista") === 0,
         mer ? mer.textContent : panel.textContent.slice(0, 80));
      var forTrykk = Array.prototype.filter.call(
        panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return !c.closest(".sted-resten"); }).length;
      if (mer) mer.click();
      var alle = panel.querySelectorAll(".sted-rad-kort");
      var etterTrykk = Array.prototype.filter.call(alle,
        function (c) { return !c.closest(".sted-resten") ||
          !c.closest(".sted-resten").hidden; }).length;
      ok("og trykket henter dem fram", etterTrykk > forTrykk,
         forTrykk + " → " + etterTrykk);
      var andre = Array.prototype.filter.call(alle,
        function (c) { return c.textContent.indexOf("Tilfeldig Bar") === 0; });
      ok("en pub uten visning er ikke merket",
         andre.length > 0 && !andre[0].querySelector(".pub-bekreftet"), andre.length);
      chips = forslag.querySelectorAll(".sted-rad-kort");

      // Et trykk velger puben — ett trykk, ett sted, ogsa i forslagslista.
      // Ett trykk, ett sted: raden ER svaret. Til 20. september 2026 fylte
      // trykket et tekstfelt du maatte trykke en gang til for aa bruke.
      chips[0].querySelector(".sted-knapp").click();
      // Radene tegnes pa nytt etter hvert trykk, sa noden ma hentes igjen.
      var valgtRad = Array.prototype.find.call(
        panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === "Lincoln Pub"; });
      ok("et trykk velger puben",
         !!valgtRad && valgtRad.classList.contains("valgt"),
         valgtRad ? valgtRad.className : "ingen rad");

      // Andre kamp: en annen pub, og Lincoln skal ikke folge med. Ett
      // panel om gangen, sa det forrige er borte.
      document.querySelectorAll(".kamp-del")[1].click();
      var panel2 = document.querySelector(".kamp-panel");
      ok("bare ett panel er apent", document.querySelectorAll(".kamp-panel").length === 1,
         document.querySelectorAll(".kamp-panel").length);
      var _andre2 = panel2.querySelector(".sted-andre-apne"); if (_andre2) _andre2.click();
      setTimeout(function () { try {
        var chips2 = panel2.querySelectorAll(".sted-rad-kort");
        ok("neste kamp har sin egen pub forst",
           chips2.length > 0 && chips2[0].textContent.indexOf("Carls") > -1 &&
           !!chips2[0].querySelector(".pub-bekreftet"),
           chips2.length ? chips2[0].textContent : "ingen chips");
        // Forrige kamps pub skal ikke folge med som bekreftet hit.
        var merket2 = Array.prototype.filter.call(chips2,
          function (c) { return !!c.querySelector(".pub-bekreftet"); });
        ok("og ikke den forriges",
           merket2.length === 1 && merket2[0].textContent.indexOf("Lincoln") === -1,
           merket2.map(function (c) { return c.textContent; }).join("|"));
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);


/* ---------------- 17. lenka apner kampen som ble delt ---------------- */

const SAK_17 = kjor("kamp-lenke", FELLES + FOTBALL + `
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
    // Lenka i adressen baerer den gamle tallformen, slik alle lenker som
    // alt er sendt gjor. Den skal fortsatt apne kampen — men kampen baerer
    // na sin egen nokkel, ikke kildens id.
    ok("og det er den lenka pekte pa",
       merket[0].dataset.kamp === "2026-09-21-molde-rosenborg" && merket[0].textContent.indexOf("Molde") > -1,
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
    // Avsenderens sted star i kortet selv om ingen har meldt inn puben og
    // ingen kart kjenner den: den som delte skal dit, og da er det stedet
    // det mest relevante pa hele kortet. Det blir pekt ut, ikke valgt —
    // svaret skal mottakeren gi selv, med ett trykk.
    var pekt = panel.querySelector(".sted-rad-kort.pekt");
    ok("med avsenderens sted pekt ut",
       pekt && pekt.querySelector(".sted-navn").textContent === "Pub X" &&
       pekt.querySelector(".sted-knapp").getAttribute("aria-pressed") === "false",
       pekt ? pekt.textContent : "ingen pekt rad");
    ok("og fokus star pa knappen i den, sa svaret koster ett trykk",
       document.activeElement === pekt.querySelector(".sted-knapp"),
       document.activeElement && document.activeElement.className);
    // Den som kommer fra en delt lenke er utlogget. Da skal det sta hva
    // som mangler — og at resten virker uansett.
    ok("utlogget star det hva som skal til for a bli med",
       panel.querySelector(".kamp-note").textContent.indexOf("Logg inn i menyen") > -1 &&
       panel.querySelector(".kamp-note").textContent.indexOf("virker uansett") > -1,
       panel.querySelector(".kamp-note").textContent);

    // Trykker du pa et sted uten a vaere logget inn, skal du fa vite det
    // der og da — og stedet skal ikke se ut som den gronne bekreftelsen pa
    // at du star pa lista. Et sted som ser valgt ut nar ingenting er
    // lagret, sier at det virket.
    pekt.querySelector(".sted-knapp").click();
    ok("et trykk utlogget sier at det krever innlogging",
       panel.querySelector(".kamp-svar").textContent.indexOf("Logg inn i menyen") === 0,
       panel.querySelector(".kamp-svar").textContent);
    ok("og det sier hva stedet da er godt for",
       panel.querySelector(".kamp-svar").textContent.indexOf("deler kampen") > -1,
       panel.querySelector(".kamp-svar").textContent);
    // Ingen bakstreker her: i en template-literal spises de, og selektoren
    // blir ugyldig og stopper hele testsiden. Enkeltfnutter inni.
    var delevalg = panel.querySelector(".sted-rad-kort.valgt");
    ok("stedet er merket som et delingsvalg, ikke som en plass pa lista",
       delevalg && delevalg.classList.contains("kun-deling"),
       delevalg ? delevalg.className : "ingen valgt rad");
    // Knappen lover ikke at du staar paa lista, for det gjor du ikke.
    ok("og knappen sier at det bare er valgt for deling",
       delevalg.querySelector(".sted-knapp").textContent === "Valgt for deling",
       delevalg.querySelector(".sted-knapp").textContent);
    ok("og det ser ikke ut som den gronne bekreftelsen",
       getComputedStyle(delevalg).backgroundColor !== "rgb(31, 122, 77)",
       getComputedStyle(delevalg).backgroundColor);
    ok("skjermleseren far ogsa vite at det bare deles",
       delevalg.querySelector(".sted-knapp").getAttribute("aria-label")
         .indexOf("Deles:") === 0,
       delevalg.querySelector(".sted-knapp").getAttribute("aria-label"));

    // En lenke til en kamp som ikke star i runden lenger: runden skal sta
    // som for, uten en feilmelding om noe leseren ikke kan gjore noe med.
    location.hash = "#/fotball/eliteserien/neste?kamp=999&hvor=hjemme";
    setTimeout(function () { try {
      ok("en kamp som ikke finnes merker ingenting",
         document.querySelectorAll(".kamp-invitert").length === 0 &&
         document.querySelectorAll(".kamp.delbar").length === 3,
         document.querySelectorAll(".kamp-invitert").length + "/" +
         document.querySelectorAll(".kamp.delbar").length);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 18. innlogging med fornavn og PIN ---------------- */

const SAK_18 = kjor("innlogging", FELLES + `
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
      if (inn.handling === "slett") return svarMed({ slettet: true });
      if (inn.handling === "lagre-lag") return svarMed({ lag: inn.lag });
      // «Ola» finnes fra for, «Kari» er ledig.
      if (inn.handling === "finnes") {
        return svarMed({ navn: inn.navn, finnes: inn.navn === "Ola" });
      }
      if (inn.handling === "logg-inn") {
        if (inn.pin !== "1234") {
          return svarMed({ feil: "Navnet eller PIN-en stemmer ikke.",
            forsok: [{ kilde: "Supabase Auth", status: 400,
              melding: "Invalid login credentials" }] }, 401);
        }
        // Kontoen husker Viking fra en annen telefon.
        return svarMed({ token: "okt-123", navn: inn.navn, bruker: "u-1",
          utloper: new Date(Date.now() + 3600000).toISOString(), lag: ["Viking"] });
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
    var feltNavn = document.getElementById("kontoNavn");
    var feltPin = document.getElementById("kontoPin");
    var feltPin2 = document.getElementById("kontoPin2");
    var send = document.getElementById("kontoSend");
    var bytt = document.getElementById("kontoBytt");
    ok("menyen har en innlogging", knapp.textContent.indexOf("Logg inn") > -1, knapp.textContent);
    ok("panelet er lukket til man trykker", panel.hidden);
    // Ingenting er last bak innloggingen: feeden star ferdig for noen har
    // logget inn, og det er hele poenget med at knappen star i menyen.
    ok("appen virker utlogget", document.querySelectorAll("#feed .row").length > 0 &&
       !localStorage.getItem("sb-konto"),
       document.querySelectorAll("#feed .row").length);

    // Krysset i toppen ligger under statuslinja pa iPhone. Den andre
    // veien ut star nederst, der tommelen er.
    ok("menyen har en lukkeknapp nederst ogsa",
       !!document.getElementById("menuLukk"));
    document.getElementById("menuLukk").click();
    ok("og den lukker menyen",
       !document.getElementById("menuPanel").classList.contains("open"));
    document.getElementById("menuBtn").click();

    knapp.click();
    ok("trykk apner panelet", !panel.hidden && knapp.getAttribute("aria-expanded") === "true");
    // Steg en er ett felt. Et panel med to felt og en knapp ser ut som en
    // registrering; dette ser ut som et sporsmal.
    ok("forst star bare navnefeltet",
       !feltNavn.hidden && feltPin.hidden && feltPin2.hidden && bytt.hidden,
       feltPin.hidden + " " + feltPin2.hidden);
    ok("og knappen sier at det kommer mer", send.textContent === "Fortsett",
       send.textContent);
    // En knapp i menyen ser ut som en port til noe. Teksten ma si at den
    // ikke er det.
    ok("det star at man ikke trenger konto for a bruke appen",
       document.getElementById("kontoNote").textContent.indexOf("trenger ikke konto") > -1,
       document.getElementById("kontoNote").textContent);
    ok("og at fornavnet er det vennene ser",
       document.getElementById("kontoNote").textContent.indexOf("vennene ser") > -1,
       document.getElementById("kontoNote").textContent);
    ok("oppsettet sjekkes ved apning", window.__konto.join(",") === "oppsett",
       window.__konto.join(","));

    // Et navn som bare er tegnsetting ville blitt en tom nokkel, og en tom
    // nokkel er alles konto. Det stoppes for kallet.
    feltNavn.value = "•";
    send.click();
    ok("tull i navnefeltet stoppes her",
       document.getElementById("kontoSvar").textContent.indexOf("fornavnet") > -1 &&
       window.__konto.join(",") === "oppsett",
       document.getElementById("kontoSvar").textContent + " | " + window.__konto.join(","));

    // Et ledig navn: da lages PIN-en na, og da ma den gjentas.
    feltNavn.value = "  Kari ";
    send.click();
    setFo(function () {
      ok("et ledig navn spor om en ny PIN",
         send.textContent === "Opprett konto" && !feltPin2.hidden,
         send.textContent + " " + feltPin2.hidden);
      ok("navnet du skrev star som overskrift",
         document.getElementById("kontoHvem").textContent === "Kari" &&
         !document.getElementById("kontoHvem").hidden,
         document.getElementById("kontoHvem").textContent);
      ok("og navnefeltet er ute av veien", feltNavn.hidden);
      // Den som lager en PIN her kan ikke be om en ny. Det ma sta for den
      // tastes, ikke etter.
      ok("det star hvorfor PIN-en ma gjentas",
         document.getElementById("kontoNote").textContent.indexOf("ingen e-post") > -1,
         document.getElementById("kontoNote").textContent);
      ok("og at den ikke er ekte sikkerhet",
         document.getElementById("kontoNote").textContent.indexOf("ikke ekte sikkerhet") > -1,
         document.getElementById("kontoNote").textContent);
      ok("det er veien tilbake til navnet", !bytt.hidden);

      // To ulike PIN-er ma stoppes her: tjenesten kan ikke se det, og en
      // konto laget med feil PIN er ikke til a rette opp.
      feltPin.value = "1234";
      feltPin2.value = "1235";
      send.click();
      ok("to ulike PIN-er stoppes for kontoen lages",
         document.getElementById("kontoSvar").textContent.indexOf("ikke like") > -1 &&
         window.__konto.indexOf("logg-inn") === -1,
         document.getElementById("kontoSvar").textContent + " | " + window.__konto.join(","));
      ok("og gjenta-feltet tommes, ikke det forste",
         feltPin2.value === "" && feltPin.value === "1234", feltPin.value);

      // Bytt navn: PIN-ene skal ikke folge med til neste navn.
      bytt.click();
      ok("bytt navn gar tilbake til navnefeltet",
         !feltNavn.hidden && feltPin.hidden && bytt.hidden);
      ok("og tommer det som var tastet", feltPin.value === "" && feltPin2.value === "");

      // Et navn som er tatt: da skal det ikke sta «lag en PIN».
      feltNavn.value = "Ola";
      send.click();
      setFo(function () {
        ok("et kjent navn ber om PIN-en du har",
           send.textContent === "Logg inn" && feltPin2.hidden,
           send.textContent + " " + feltPin2.hidden);
        ok("og sier ingenting om a lage en ny",
           document.getElementById("kontoNote").textContent.indexOf("PIN-en du valgte") > -1,
           document.getElementById("kontoNote").textContent);

        feltPin.value = "9999";
        send.click();
        setFo(function () {
          var feiltekst = document.getElementById("kontoSvar").textContent;
          ok("feil PIN sier ifra, med tjenestens egen melding",
             feiltekst.indexOf("stemmer ikke") > -1 && feiltekst.indexOf("svarte 400") > -1 &&
             feiltekst.indexOf("Invalid login credentials") > -1, feiltekst);
          ok("og logger ingen inn", !localStorage.getItem("sb-konto"));

          feltPin.value = "12 34";
          send.click();
          setFo(function () {
            var lagret = JSON.parse(localStorage.getItem("sb-konto") || "null");
            ok("riktig PIN logger inn", lagret && lagret.token === "okt-123",
               JSON.stringify(lagret));
            ok("okta barer fornavnet", lagret && lagret.navn === "Ola", lagret && lagret.navn);
            // Favorittlagene kommer med innloggingen, men bor i
            // visningsvalgene — ikke i okta, der de ville blitt en kopi.
            ok("kontoens favorittlag kommer med innloggingen",
               JSON.stringify((JSON.parse(localStorage.getItem("sb-visning") || "{}")).lag) ===
               JSON.stringify(["Viking"]), localStorage.getItem("sb-visning"));
            ok("og legges ikke i okta", localStorage.getItem("sb-konto").indexOf("Viking") === -1,
               localStorage.getItem("sb-konto"));
            ok("okta har et utlopstidspunkt", lagret && !isNaN(Date.parse(lagret.utloper)),
               lagret && lagret.utloper);
            ok("menyen viser fornavnet",
               document.getElementById("kontoBtnTekst").textContent === "Ola",
               document.getElementById("kontoBtnTekst").textContent);
          // Etter innlogging er du ferdig i panelet. Menyen lukkes, og
          // svaret pa «gikk det bra?» star i toppfeltet — ikke bak et
          // trykk til.
          ok("menyen lukkes etter innlogging",
             !document.getElementById("menuPanel").classList.contains("open") &&
             document.getElementById("kontoPanel").hidden === true);
          var hvem = document.getElementById("hvemTag");
          ok("og fornavnet star pa hovedskjermen",
             !hvem.hidden && hvem.textContent === "Ola", hvem.textContent);
          // Merket er en knapp: den apner menyen med kontoen ute, sa
          // «logg ut» er ett trykk fra der du ser navnet.
          hvem.click();
          ok("merket apner kontoen igjen",
             document.getElementById("menuPanel").classList.contains("open") &&
             document.getElementById("kontoPanel").hidden === false);
          // Det finnes bare én meny. Apnet fra navnet sa den ut som en
          // egen, storre variant: setningen «du er logget inn» og to
          // knapper stablet gjorde footeren 350 px mot hamburgerens 196.
          // Malt med A+, som footertesten over. Var 265 med taket 280.
          // 24. september 2026 kom linja om favorittlagene (18 px + gap),
          // og taket gikk til 300: den er stedet du SER at lagene folger
          // kontoen, som menyen har lovet siden innloggingen kom. Tre
          // knapper pa rad kostet ingenting — «Slett kontoen min» brakk
          // over to linjer med lik bredde, og fikk plassen sin av at
          // bredden na folger teksten. Na 291.
          document.documentElement.style.setProperty("--fs", "1.15");
          var kontoFooter = document.querySelector(".menu-actions").getBoundingClientRect().height;
          var utR = document.getElementById("kontoUt").getBoundingClientRect();
          var slettR = document.getElementById("kontoSlett").getBoundingClientRect();
          document.documentElement.style.removeProperty("--fs");
          ok("kontoen apnet fra navnet blaser ikke opp footeren",
             kontoFooter < 300, Math.round(kontoFooter));
          // Stablet er de en rad til, og raden er det emnelista mister.
          ok("logg ut og slett star pa samme linje",
             Math.abs(utR.top - slettR.top) < 2,
             Math.round(utR.top) + " mot " + Math.round(slettR.top));
            // Vi lager en adresse av navnet for a snakke med tjenesten. Den
            // skal aldri vises noe sted, og ikke ligge i telefonen heller.
            ok("og aldri adressen vi lagde av navnet",
               document.body.textContent.indexOf("pin.mvp-sb") === -1 &&
               localStorage.getItem("sb-konto").indexOf("pin.mvp-sb") === -1);
            ok("PIN-feltene tommes etter innlogging",
               feltPin.value === "" && feltPin2.value === "", feltPin.value);
            // Innlogget star setningen ikke der. Den fortalte deg at du
            // var logget inn, rett etter at du trykket pa ditt eget navn,
            // og den kostet 135 px nederst i menyen.
            ok("og innlogget star ingen setning i kontopanelet",
               document.getElementById("kontoNote").hidden === true &&
               document.getElementById("kontoNote").offsetHeight === 0,
               document.getElementById("kontoNote").textContent);

            // Sletting er endelig, sa den krever to trykk: det forste sier
            // hva som kommer til a skje, det andre gjor det.
            var slett = document.getElementById("kontoSlett");
            ok("slett-knappen star der nar man er logget inn", !slett.hidden);
            slett.click();
            ok("forste trykk sletter ingenting",
               window.__konto.indexOf("slett") === -1 && !!localStorage.getItem("sb-konto"),
               window.__konto.join(","));
            ok("og sier at fornavnet blir ledig for andre",
               document.getElementById("kontoSvar").textContent.indexOf("ledig") > -1,
               document.getElementById("kontoSvar").textContent);
            ok("og hva som kommer til a skje",
               slett.textContent.indexOf("kan ikke angres") > -1, slett.textContent);

            document.getElementById("kontoUt").click();
            ok("logg ut tommer okta", !localStorage.getItem("sb-konto"));
            ok("og fornavnet forsvinner fra toppfeltet",
               document.getElementById("hvemTag").hidden,
               document.getElementById("hvemTag").textContent);
            ok("og menyen sier logg inn igjen",
               document.getElementById("kontoBtnTekst").textContent === "Logg inn",
               document.getElementById("kontoBtnTekst").textContent);
            // En utlogging skal legge panelet tilbake pa steg en, ikke la
            // forrige persons navn sta som overskrift.
            ok("og panelet star pa navnesteget igjen",
               !feltNavn.hidden && feltPin.hidden &&
               document.getElementById("kontoHvem").hidden);
            ok("utlogging nullstiller slettingen",
               document.getElementById("kontoSlett").hidden &&
               document.getElementById("kontoSlett").textContent === "Slett kontoen min",
               document.getElementById("kontoSlett").textContent);
            ferdig();
          });
        });
      });
    });
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });

  // Hvert kall er en runde i mikrooppgavekoen. Ett sted for ventingen, sa
  // lagene under ikke blir seks nivaer av setTimeout.
  function setFo(f) {
    setTimeout(function () {
      try { f(); } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); }
    }, 300);
  }
`);

/* ---------------- 18c. favorittlagene folger kontoen, og PIN-en byttes ---------------- */

// Menyen har lovet «favorittlagene folger kontoen, ikke telefonen» siden
// innloggingen kom. Til 24. september 2026 la de i nettleseren og ble
// aldri sendt noe sted. Her gar hele runden: en telefon som var innlogget
// for utrullingen moter kontoen, lista flettes, en stjerne sendes, en
// sending som svikter sier det og prover igjen, og PIN-en byttes.
const SAK_18C = kjor("favoritter-og-pin", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  // Innlogget fra for, med et ferskt token: ingen fornying er «pa tide».
  // Telefonen har valgt Molde, kontoen husker Brann fra en annen telefon.
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-1", navn: "Ola",
    bruker: "u-1", fornyer: "forny-1",
    utloper: new Date(Date.now() + 3600000).toISOString() }));
  localStorage.setItem("sb-visning", JSON.stringify({ lag: ["Molde"] }));
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/eliteserien/tabell";
  var grunn = window.fetch;
  window.__konto = [];
  window.__lagFeil = false;
  function svarMed(kropp, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200,
      statusText: "OK", text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/konto") !== 0) return grunn(u, o);
    var inn = o && o.body ? JSON.parse(o.body) : null;
    window.__konto.push(inn || { handling: "oppsett" });
    if (!inn) return svarMed({ klar: true, mangler: [] });
    // Kontoen svarer etter at tabellen er tegnet, som pa en telefon: det
    // er da stjernene ma merkes pa nytt.
    if (inn.handling === "forny") {
      return new Promise(function (ferdigSvar) { setTimeout(function () {
        window.__tabellForForny = document.querySelectorAll(".tabell .lag-stjerne").length;
        ferdigSvar(svarMed({ token: "okt-2", navn: "Ola", bruker: "u-1", fornyer: "forny-2",
          utloper: new Date(Date.now() + 3600000).toISOString(), lag: ["Brann"] }));
      }, 500); });
    }
    if (inn.handling === "lagre-lag") {
      if (window.__lagFeil) {
        return svarMed({ feil: "Fikk ikke lagret favorittlagene på kontoen.",
          forsok: [{ kilde: "Supabase Auth", status: 500 }] }, 502);
      }
      return svarMed({ lag: inn.lag });
    }
    if (inn.handling === "bytt-pin") {
      if (inn.pin !== "1234") return svarMed({ feil: "PIN-en du har nå stemmer ikke." }, 401);
      return svarMed({ token: "etter-bytte", navn: "Ola", bruker: "", fornyer: "forny-ny",
        utloper: new Date(Date.now() + 3600000).toISOString(), andreUt: true, lag: ["Brann", "Molde"] });
    }
    return svarMed({ feil: "Ukjent handling" }, 400);
  };
  function prefs() { return JSON.parse(localStorage.getItem("sb-visning") || "{}"); }
  function handlinger(h) { return window.__konto.filter(function (k) { return k.handling === h; }); }
  function linje() { return document.getElementById("kontoLag"); }
  // Hentes nar de brukes: sena kjorer for markupen er lest.
  var panel, side;
  window.addEventListener("DOMContentLoaded", function () {
    panel = document.getElementById("menuPanel");
    side = document.getElementById("kontoSide");
  });
  // Tegnet pa skjermen: et element under en skjult forelder har ingen bokser.
  function vises(id) { return document.getElementById(id).getClientRects().length > 0; }
  function steg(f, ms) {
    setTimeout(function () {
      try { f(); } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); }
    }, ms || 700);
  }

  window.addEventListener("load", function () { steg(function () {
    // En telefon som var innlogget for denne utrullingen, har aldri mott
    // kontoens liste. Den fornyes ved oppstart selv om tokenet er ferskt.
    ok("forste mote med kontoen henter lista med en gang",
       handlinger("forny").length === 1, handlinger("forny").length);
    // Ingen av listene er feil: kontoens forst, telefonens nye bak.
    ok("kontoens og telefonens lag flettes",
       JSON.stringify(prefs().lag) === JSON.stringify(["Brann", "Molde"]), JSON.stringify(prefs().lag));
    var sendt = handlinger("lagre-lag");
    ok("og den flettede lista sendes til kontoen",
       sendt.length === 1 && JSON.stringify(sendt[0].lag) === JSON.stringify(["Brann", "Molde"]) &&
       sendt[0].token === "okt-2", JSON.stringify(sendt));
    // Lista bor i visningsvalgene, ikke i okta: to kopier er to sannheter.
    // Tabellen sto framme for kontoen svarte. Stjerna ved Brann skal
    // folge lista, ikke det den var da tabellen ble tegnet.
    ok("tabellen sto framme for kontoen svarte", window.__tabellForForny === 3,
       window.__tabellForForny);
    ok("stjernene i tabellen merkes av kontoens liste",
       document.querySelectorAll(".tabell .lag-stjerne")[1].getAttribute("aria-pressed") === "true",
       document.querySelectorAll(".tabell .lag-stjerne")[1].getAttribute("aria-pressed"));
    ok("okta lagres uten lista",
       (localStorage.getItem("sb-konto") || "").indexOf("lag") === -1,
       localStorage.getItem("sb-konto"));

    // Det synlige beviset, der brukeren ser det: under navnet.
    document.getElementById("hvemTag").click();
    ok("kontoen viser favorittlagene",
       !linje().hidden && linje().textContent.indexOf("Brann og Molde") > -1, linje().textContent);
    ok("og at de folger kontoen", linje().textContent.indexOf("følger kontoen") > -1,
       linje().textContent);
    // Veien til Mitt lag star i den samme linja, ikke i raden med knappene:
    // en fjerde knapp der gjorde bunnen av menyen 308 px mot taket pa 300.
    var til = document.getElementById("kontoMittLag");
    ok("linja om lagene har veien til Mitt lag",
       !!til && til.parentNode === linje() && til.textContent === "Mitt lag →",
       til ? til.textContent : "fant den ikke");
    ok("og den er en knapp, ikke tekst man ma gjette er trykkbar",
       !!til && til.tagName === "BUTTON" && til.type === "button", til && til.tagName);

    // Navnet apner kontosiden, ikke menyen. Til 24.09.2026 ga navnet og
    // hamburgeren det samme skjermbildet, med kontoen nederst under tjue
    // emner.
    ok("navnet apner kontosiden, ikke menyen",
       panel.classList.contains("open") && panel.classList.contains("konto-modus") &&
       !side.hidden && panel.getAttribute("aria-label") === "Kontoen din",
       panel.className + " " + panel.getAttribute("aria-label"));
    // Én overskrift, ikke to pa rad: «Kontoen din» over «Mitt lag» kostet
    // en hel rad over kortene.
    ok("toppraden heter Mitt lag, og det star ingen overskrift til under",
       panel.querySelector(".menu-title").textContent === "Mitt lag" &&
       !side.querySelector("h1, h2"),
       panel.querySelector(".menu-title").textContent);
    ok("sok, emner og deling viker for den",
       !vises("menuList") && !vises("sokForm") && !vises("shareBtn") && !vises("kontoBtn"));
    ok("og kontoen star under kortene, med Bytt PIN",
       vises("kontoPanel") && vises("kontoByttPin") && vises("kontoUt") &&
       side.getBoundingClientRect().bottom <= document.getElementById("kontoPanel").getBoundingClientRect().top + 1);
    ok("lenka til Mitt lag viker, for kortene star rett over den", !vises("kontoMittLag"));

    // En stjerne i tabellen gar til kontoen, etter et lite pust.
    var stjerner = document.querySelectorAll(".tabell .lag-stjerne");
    stjerner[0].click();   // Bodo/Glimt
    ok("mens den sendes, sier linja det og ikke mer",
       linje().textContent.indexOf("lagres") > -1, linje().textContent);
    steg(function () {
      var sist = handlinger("lagre-lag").pop();
      ok("en ny stjerne sendes til kontoen",
         sist && JSON.stringify(sist.lag) === JSON.stringify(["Brann", "Molde", "Bodo/Glimt"]),
         JSON.stringify(sist));
      // Kortene er de samme som i fanen, og de folger lista mens siden star
      // apen: stjerna over ble satt etter at siden var tegnet.
      var kort = side.querySelectorAll(".mittlag-kort .mittlag-navn");
      var navn = Array.prototype.map.call(kort, function (k) { return k.textContent; });
      ok("kontosiden viser lagkortene, ogsa for stjerna som kom etter",
         JSON.stringify(navn) === JSON.stringify(["Brann", "Molde", "Bodo/Glimt"]), JSON.stringify(navn));
      ok("med plassen i tabellen, som i fanen",
         !!side.querySelector(".mittlag-kort .mittlag-plass"));
      var stempel = side.querySelector(".fotball-stempel");
      ok("og stempelet peker ikke pa faner som ikke star over",
         !!stempel && stempel.textContent.indexOf("fanene under Fotball") > -1,
         stempel && stempel.textContent);
      ok("og linja sier at den folger kontoen igjen",
         linje().textContent.indexOf("følger kontoen") > -1 && !prefs().lagUsendt,
         linje().textContent);

      // Sendingen svikter: stjerna blir staende, og linja sier det.
      window.__lagFeil = true;
      stjerner[0].click();   // Bodo/Glimt av
      steg(function () {
        ok("en sending som svikter tar ikke stjerna",
           JSON.stringify(prefs().lag) === JSON.stringify(["Brann", "Molde"]),
           JSON.stringify(prefs().lag));
        ok("men den sier at kontoen ikke har den",
           linje().textContent.indexOf("ikke lagret på kontoen") > -1 && prefs().lagUsendt === true,
           linje().textContent);

        // Neste gang appen tas fram, provest den igjen.
        window.__lagFeil = false;
        var for_ = handlinger("lagre-lag").length;
        document.dispatchEvent(new Event("visibilitychange"));
        steg(function () {
          ok("den provest igjen nar appen kommer fram",
             handlinger("lagre-lag").length === for_ + 1 && !prefs().lagUsendt,
             handlinger("lagre-lag").length + " " + for_);
          ok("og linja er sann igjen", linje().textContent.indexOf("følger kontoen") > -1,
             linje().textContent);
          byttPinRunden();
        });
      });
    });
  }, 1200); });

  function byttPinRunden() {
    var knapp = document.getElementById("kontoByttPin");
    var skjema = document.getElementById("kontoPinSkjema");
    var na = document.getElementById("kontoPinNa");
    var ny = document.getElementById("kontoPinNy");
    var ny2 = document.getElementById("kontoPinNy2");
    var lagre = document.getElementById("kontoPinLagre");
    var svar = document.getElementById("kontoSvar");
    ok("innlogget star «Bytt PIN» ved siden av logg ut", !knapp.hidden && skjema.hidden);
    var knappR = knapp.getBoundingClientRect();
    var utR = document.getElementById("kontoUt").getBoundingClientRect();
    ok("pa samme linje, ikke en rad til", Math.abs(knappR.top - utR.top) < 2,
       Math.round(knappR.top) + " mot " + Math.round(utR.top));

    knapp.click();
    ok("trykk bytter knappene ut med skjemaet",
       !skjema.hidden && document.getElementById("kontoPar").hidden && linje().hidden);
    // Det som skjer med de andre telefonene, skal sta for du trykker.
    var note = document.getElementById("kontoNote");
    ok("og sier at de andre telefonene logges ut",
       !note.hidden && note.textContent.indexOf("andre telefoner") > -1, note.textContent);
    ok("den gamle PIN-en er et eget felt, som telefonen kan fylle",
       na.getAttribute("autocomplete") === "current-password" &&
       ny.getAttribute("autocomplete") === "new-password");

    na.value = "1234"; ny.value = "1234"; ny2.value = "1234";
    lagre.click();
    ok("samme PIN som for stoppes her", svar.textContent.indexOf("samme") > -1 &&
       handlinger("bytt-pin").length === 0, svar.textContent);

    ny.value = "5678"; ny2.value = "5679";
    lagre.click();
    ok("to ulike nye stoppes ogsa", svar.textContent.indexOf("ikke like") > -1 &&
       ny2.value === "" && handlinger("bytt-pin").length === 0, svar.textContent);

    na.value = "9999"; ny2.value = "5678";
    lagre.click();
    steg(function () {
      ok("feil gammel PIN sier ifra", svar.textContent.indexOf("stemmer ikke") > -1 &&
         localStorage.getItem("sb-konto").indexOf("etter-bytte") === -1, svar.textContent);
      ok("og skjemaet star, sa du kan prove igjen", !skjema.hidden);
      // Lukkes menyen midt i, skal PIN-ene ikke ligge igjen til neste gang.
      document.getElementById("menuLukk").click();
      document.getElementById("hvemTag").click();
      ok("apnes panelet pa nytt, star knappene og feltene er tomme",
         skjema.hidden && !document.getElementById("kontoPar").hidden && na.value === "",
         skjema.hidden + " " + na.value);
      knapp.click();
      ny.value = "5678"; ny2.value = "5678";

      na.value = "1234";
      lagre.click();
      steg(function () {
        var b = handlinger("bytt-pin").pop();
        ok("byttet sender navnet og begge PIN-ene",
           b && b.navn === "Ola" && b.pin === "1234" && b.nyPin === "5678", JSON.stringify(b));
        var okt = JSON.parse(localStorage.getItem("sb-konto") || "null");
        // Den gamle okta er logget ut med de andre; dette er den nye.
        ok("den nye okta tar over", okt && okt.token === "etter-bytte" &&
           okt.fornyer === "forny-ny", JSON.stringify(okt));
        ok("og bruker-id-en overlever", okt && okt.bruker === "u-1", okt && okt.bruker);
        ok("svaret sier at andre telefoner er logget ut",
           svar.textContent.indexOf("PIN-en er byttet") > -1 &&
           svar.textContent.indexOf("logget ut") > -1, svar.textContent);
        ok("feltene tommes og knappene kommer tilbake",
           na.value === "" && ny.value === "" && ny2.value === "" && skjema.hidden &&
           !document.getElementById("kontoPar").hidden && note.hidden);

        // Hamburgeren gir menyen, ogsa rett etter kontosiden.
        document.getElementById("menuLukk").click();
        document.getElementById("menuBtn").click();
        ok("hamburgeren apner menyen, ikke kontosiden",
           !panel.classList.contains("konto-modus") && side.hidden && vises("menuList") &&
           panel.querySelector(".menu-title").textContent === "Meny" &&
           document.getElementById("menuLukk").textContent === "Lukk menyen");
        if (document.getElementById("kontoPanel").hidden) document.getElementById("kontoBtn").click();
        ok("og der star veien til Mitt lag i linja", vises("kontoMittLag"));

        // Trykket pa «Mitt lag →»: menyen lukkes, og du star pa fanen.
        document.getElementById("kontoMittLag").click();
        ok("Mitt lag-lenka lukker menyen",
           !document.getElementById("menuPanel").classList.contains("open"));
        ok("og apner fotballen",
           document.getElementById("fotball").hidden === false &&
           document.getElementById("feed").hidden === true);
        ok("pa fanen Mitt lag, og adressen sier det",
           location.hash.slice(-8) === "/mittlag", location.hash);
        var fane = document.querySelector("#fotballFaner [aria-current='true']");
        ok("og fanen er merket som den du star i",
           !!fane && fane.dataset.verdi === "mittlag", fane && fane.dataset.verdi);

        // En lenke i kortene bytter visning bak panelet, og da lukkes det.
        document.getElementById("hvemTag").click();
        steg(function () {
        location.hash = "#/fotball/eliteserien/tabell";
        steg(function () {
        ok("en lenke i kortene som bytter visning, lukker kontosiden",
           !panel.classList.contains("open") && location.hash.indexOf("/tabell") > -1,
           location.hash);
        document.getElementById("hvemTag").click();
        steg(function () {
        var sok = side.querySelector(".mittlag-sok");
        ok("kortene har knappene sine ogsa her", !!sok && sok.textContent === "Saker om Brann",
           sok && sok.textContent);
        sok.click();
        ok("et trykk i kortene lukker kontosiden", !panel.classList.contains("open"));
        ok("og gjor det knappen lover", document.getElementById("feed").hidden === false &&
           document.getElementById("sokFelt").value === "Brann",
           document.getElementById("sokFelt").value);

        // Utlogget blir lagene staende pa telefonen, men glemmer kontoen.
        document.getElementById("hvemTag").click();
        document.getElementById("kontoUt").click();
        ok("logger du ut fra kontosiden, tar menyen over",
           panel.classList.contains("open") && !panel.classList.contains("konto-modus") &&
           side.hidden && vises("menuList") && vises("kontoBtn"));
        ok("utlogget blir favorittlagene staende",
           JSON.stringify(prefs().lag) === JSON.stringify(["Brann", "Molde"]),
           JSON.stringify(prefs()));
        ok("men telefonen glemmer at de har mott en konto",
           prefs().lagPaKonto === undefined && prefs().lagUsendt === undefined, JSON.stringify(prefs()));
        ok("og utlogget star verken linja eller bytt PIN",
           linje().hidden && knapp.hidden && skjema.hidden);
        ok("og heller ikke veien til Mitt lag, som star i linja",
           linje().hidden && linje().contains(document.getElementById("kontoMittLag")));
        ferdig();
        });
        });
        });
      });
    });
  }
`);

/* ---------------- 19. jeg blir med ---------------- */

const SAK_19 = kjor("blir-med", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Innlogget for appen starter: okta ligger der en tidligere innlogging
  // la den. Med fornavn og PIN barer okta fornavnet, ikke en adresse.
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-1",
    navn: "Ola", bruker: "u-1",
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
      if (!inn) return svarMed({ svar: somTjenesten(window.__lagret) });
      if (inn.handling === "fjern") {
        // Reglene i databasen slipper bare gjennom din egen rad, sa en
        // fjerning kan ikke rore andres. Stubben ma speile det, ellers
        // tester vi noe tjenesten aldri gjor.
        window.__lagret = window.__lagret.filter(function (r) { return r.bruker !== "u-1"; });
        return svarMed({ fjernet: true });
      }
      // En upsert bytter ut din egen rad og lar de andres sta. Stubben ma
      // speile det, ellers tester vi noe tjenesten aldri gjor.
      window.__lagret = window.__lagret
        .filter(function (r) { return r.bruker !== "u-1"; })
        .concat([{ kamp_id: String(inn.kampId), navn: inn.navn, hvor: inn.hvor,
          sted: inn.sted, bruker: "u-1" }]);
      // Skrivingen leser hele kampen tilbake, sa svaret barer alle radene.
      // Det tomme svaret finnes fordi tjenesten en gang stolte pa
      // representasjonen fra upserten.
      return svarMed({ svar: window.__tomRepresentasjon ? [] : somTjenesten(window.__lagret) });
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
    // Nokler, ikke kildens id-er: se kampNokkel() i fotball-data.js.
    ok("og med begge kampene",
       lesekall[0].url.indexOf("2026-09-20-brann-bodoglimt") > -1 &&
       lesekall[0].url.indexOf("2026-09-21-molde-rosenborg") > -1, lesekall[0].url);
    ok("ingen er med enda", !document.querySelector(".kamp-blirmed"));

    var rad = document.querySelectorAll(".kamp.delbar")[0];
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");

    // Ett trykk, ett sted. Navnefeltet og «Jeg skal dit»-knappen er borte:
    // navnet kommer fra innloggingen — det er alt det samme fornavnet — og
    // et felt man matte fylle for trykket virket ville betydd at «ett
    // trykk» ikke var sant.
    // Stadion er et sted pa linje med pubene: «en plass man kan dra».
    var stedChip = function (navn) {
      return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === navn; });
    };
    var arena = stedChip("Brann Stadion");
    ok("stadion star som et sted",
       !!arena && arena.querySelector(".sted-knapp").getAttribute("aria-pressed") === "false",
       arena ? arena.textContent : "ingen arena-rad");
    ok("og knappen sier hva et trykk gjor",
       arena.querySelector(".sted-knapp").textContent === "Jeg skal hit" &&
       arena.querySelector(".sted-knapp").getAttribute("aria-label") ===
         "Jeg skal til Brann Stadion",
       arena.querySelector(".sted-knapp").getAttribute("aria-label"));

    // Et sted vi ikke har i lista. Feltet du kunne skrive det i gikk ut
    // med «Andre fotballpuber» 20. september 2026 — men veien finnes
    // fortsatt: et sted fra en DELT LENKE staar som en rad i kortet, og
    // den raden kan svares paa som alle andre.
    rad.dataset.pektSted = "Pub X";
    rad.dataset.pektHvor = "pub";
    panel.tegnSteder();
    var pubX0 = stedChip("Pub X");
    ok("et sted fra en delt lenke staar som en rad", !!pubX0, "ingen rad");
    pubX0.querySelector(".sted-knapp").click();
    setTimeout(function () { try {
      var skriv = window.__svar.filter(function (k) { return !!k.inn; });
      ok("svaret sendes med okta", skriv.length === 1 && skriv[0].inn.token === "okt-1",
         JSON.stringify(skriv.map(function (k) { return k.inn; })));
      ok("med kamp, navn og sted",
         skriv[0].inn.kampId === "2026-09-20-brann-bodoglimt" && skriv[0].inn.navn === "Ola" &&
         skriv[0].inn.hvor === "pub" && skriv[0].inn.sted === "Pub X",
         JSON.stringify(skriv[0].inn));
      // Navnet kommer fra innloggingen og lagres med visningsvalgene, sa
      // det ikke hentes pa nytt for hver kamp.
      ok("navnet fra innloggingen huskes",
         (JSON.parse(localStorage.getItem("sb-visning")) || {}).svarnavn === "Ola",
         localStorage.getItem("sb-visning"));
      ok("og det star hva du nettopp planla",
         panel.querySelector(".kamp-svar").textContent === "Du har planlagt å dra til Pub X.",
         panel.querySelector(".kamp-svar").textContent);

      // Stedet du skal til er raden som er merket, og folka star i den.
      var pubX = stedChip("Pub X");
      ok("stedet du valgte star som valgt i kortet",
         pubX && pubX.classList.contains("valgt"),
         pubX ? pubX.className : "ingen rad");
      // Fargen alene var ikke nok: «ser lite forskjell pa en pub som er
      // markert eller ikke» — og da trykker man en gang til for a sjekke,
      // og melder seg av uten a se det. Na staar det pa knappen.
      ok("og knappen sier med ord at et trykk melder deg av",
         pubX.querySelector(".sted-knapp").textContent === "Meld deg av",
         pubX.querySelector(".sted-knapp").textContent);
      ok("skjermleseren far det samme",
         pubX.querySelector(".sted-knapp").getAttribute("aria-label")
           .indexOf("melde deg av") > -1,
         pubX.querySelector(".sted-knapp").getAttribute("aria-label"));
      // Folka staar i raden til stedet, ikke i en egen liste nederst:
      // stedet og hvem som er der er én ting.
      ok("og raden sier hvem som skal dit — du forst",
         pubX.querySelector(".sted-rad-folk").textContent.indexOf("Du") === 0,
         pubX.querySelector(".sted-rad-folk").textContent);

      // Minimeringa er taket na. «Har du valgt et sted, minimeres de
      // andre» og «hoyst fire rader» var to regler om det samme, og
      // 20. september 2026 vant taket: lista har samme hoyde for og etter
      // at du har svart. Ditt eget sted og stedene noen andre skal til
      // faller aldri bak knappen — det er ikke en rad blant mange.
      ok("ditt eget sted star framme", !pubX.closest(".sted-resten"),
         pubX.className);
      var arenaEtter = stedChip("Brann Stadion");
      ok("og med faerre enn fire steder er ingenting minimert",
         !!arenaEtter && !arenaEtter.closest(".sted-resten") &&
         !panel.querySelector(".sted-mer"),
         panel.querySelector(".sted-mer")
           ? panel.querySelector(".sted-mer").textContent : "ingen knapp");

      // «Vi kjenner ikke stedet. Send det inn?»
      //
      // Skjemaet har staatt der hele tiden, bak «Mangler stedet? Send det
      // inn.» — en knapp du maa legge merke til. Oeyeblikket stedet
      // faktisk mangler, er oeyeblikket du nettopp sa at du skal dit.
      var tilbud = panel.querySelector(".sted-tilbud");
      ok("appen tilbyr a sende inn et sted vi ikke kjenner",
         !!tilbud && tilbud.hidden === false, tilbud ? "skjult" : "ingen linje");
      ok("og den navngir stedet",
         tilbud.textContent.indexOf("Pub X") > -1, tilbud.textContent);
      var tilbudKnapp = tilbud ? tilbud.querySelector(".sted-tilbud-knapp") : null;
      if (tilbudKnapp) {
        tilbudKnapp.click();
        var skjema = panel.querySelector(".sted-forslag-skjema");
        ok("knappen apner skjemaet", skjema.hidden === false);
        ok("med navnet ferdig utfylt",
           skjema.querySelector("input[type=text]").value === "Pub X",
           skjema.querySelector("input[type=text]").value);
        ok("og tilbudet forsvinner nar det er tatt imot", tilbud.hidden === true);
      } else {
        ok("knappen apner skjemaet", false, "ingen knapp");
        ok("med navnet ferdig utfylt", false, "ingen knapp");
        ok("og tilbudet forsvinner nar det er tatt imot", false, "ingen knapp");
      }

      // Sportsbibelen har ingen chat. En knapp som navngir noe appen ikke
      // har, lover et sted a sende den.
      ok("delingsknappen heter «Del»",
         panel.querySelector(".kamp-send").textContent === "Del",
         panel.querySelector(".kamp-send").textContent);

      // «Ola blir med» sier hvem, ikke hvor — og hvor er det man apner
      // kortet for a finne ut. Star du selv pa lista, leses stedet ditt
      // forst, sa du ser det mens du blar uten a apne noe.
      var linje = rad.querySelector(".kamp-blirmed");
      ok("linja under kampen sier hvor du skal",
         !!linje && linje.textContent.indexOf("Du skal til Pub X.") > -1,
         linje ? linje.textContent : "ingen linje");
      // Kortet trenger ingen egen «Du skal til X»-linje lenger: raden sier
      // det selv, og den sier det tydeligere enn en setning under lista.
      // Star det folk pa to av ti kamper, er det de to man leter etter.
      // Runden deles i to merkede bolker framfor a stokkes om flatt:
      // dagskillene ville ellers havnet pa feil kamper.
      var bolker = Array.prototype.map.call(document.querySelectorAll(".kamp-bolk"),
        function (b) { return b.textContent; });
      ok("kampen med folk far en egen bolk overst",
         bolker.length === 2 && bolker[0].indexOf("blir med på") > -1 &&
         bolker[1] === "Resten av kampene", bolker.join("|"));
      var forste = document.querySelector(".kamper").querySelector(".kamp-bolk, .kamp");
      ok("og bolken star forst i lista",
         forste && forste.classList.contains("kamp-bolk"),
         forste ? forste.className : "tom");
      // Raden flyttes, ikke tegnes pa nytt: det apne panelet skal overleve.
      ok("panelet overlever loftingen", !!rad.querySelector(".kamp-panel"));
      ok("og raden ligger i den forste bolken",
         rad.previousElementSibling &&
         (rad.previousElementSibling.classList.contains("kamp-dag") ||
          rad.previousElementSibling.classList.contains("kamp-bolk")),
         rad.previousElementSibling ? rad.previousElementSibling.className : "ingen");
      // Vennene staar i raden til stedet sitt, ikke i en egen liste
      // nederst: stedet og hvem som er der er én ting, og det er hele
      // sporsmalet man aapnet kortet for aa faa svar paa.
      var minRad = stedChip("Pub X");
      ok("vennene star i raden til stedet de skal til",
         minRad && minRad.querySelector(".sted-rad-folk").textContent === "Du",
         minRad ? minRad.textContent : "ingen rad");
      // Og lista nederst staar tom: ingen har svart uten aa si hvor.
      ok("og lista nederst er tom nar alle sa hvor",
         panel.querySelector(".kamp-panel-liste").textContent === "",
         panel.querySelector(".kamp-panel-liste").textContent);
      // Linja horer til kampen, ikke til panelet: den skal sta over det.
      ok("og over panelet, ikke under",
         linje.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING);
      ok("bare pa den kampen man svarte pa",
         document.querySelectorAll(".kamp-blirmed").length === 1,
         document.querySelectorAll(".kamp-blirmed").length);

      // To «jeg blir med» er en person, ikke to: et nytt trykk pa det
      // samme stedet er angreknappen.
      stedChip("Pub X").querySelector(".sted-knapp").click();
      setTimeout(function () { try {
        var fjern = window.__svar.filter(function (k) { return k.inn && k.inn.handling === "fjern"; });
        ok("et nytt trykk pa stedet sender en fjerning med okta",
           fjern.length === 1 && fjern[0].inn.token === "okt-1" &&
           fjern[0].inn.kampId === "2026-09-20-brann-bodoglimt",
           JSON.stringify(fjern.map(function (k) { return k.inn; })));
        ok("og lista under kampen er borte", !rad.querySelector(".kamp-blirmed"));
        // Ingen igjen som blir med: runden skal se ut som en runde igjen.
        ok("bolkene forsvinner nar ingen blir med",
           document.querySelectorAll(".kamp-bolk").length === 0,
           document.querySelectorAll(".kamp-bolk").length);
        ok("og det star at du ikke skal dit likevel",
           panel.querySelector(".kamp-svar").textContent === "Du skal ikke dit likevel.",
           panel.querySelector(".kamp-svar").textContent);
        ok("stedet star ikke lenger som valgt",
           stedChip("Pub X").querySelector(".sted-knapp").getAttribute("aria-pressed") === "false",
           stedChip("Pub X").querySelector(".sted-knapp").getAttribute("aria-pressed"));
        ok("og ingen staar lenger i raden",
           !stedChip("Pub X").querySelector(".sted-rad-folk"),
           stedChip("Pub X").textContent);

        // Og sa den som kostet en runde i prod: en upsert som ikke endret
        // noe kan svare med tom representasjon. Bygger vi lista pa det
        // svaret alene, forsvinner din egen rad lokalt selv om skrivingen
        // gikk bra — uten linja under kampen, uten tellingen pa stedet og
        // uten deg i lista nederst. Derfor hentes kampens svar pa nytt.
        window.__tomRepresentasjon = true;
        stedChip("Pub X").querySelector(".sted-knapp").click();
        setTimeout(function () { try {
          ok("et tomt svar pa skrivingen mister deg ikke",
             !!rad.querySelector(".kamp-blirmed") &&
             rad.querySelector(".kamp-blirmed").textContent.indexOf("Du skal til Pub X") > -1,
             rad.querySelector(".kamp-blirmed")
               ? rad.querySelector(".kamp-blirmed").textContent : "ingen linje");
          ok("stedet star fortsatt som valgt",
             stedChip("Pub X").querySelector(".sted-knapp").getAttribute("aria-pressed") === "true",
             stedChip("Pub X").querySelector(".sted-knapp").getAttribute("aria-pressed"));
          ok("og du star i raden til stedet",
             stedChip("Pub X").querySelector(".sted-rad-folk").textContent.indexOf("Du") > -1,
             stedChip("Pub X").textContent);
          // Vennene som har svart siden runden ble hentet kommer med i
          // samme oppfriskning — det er derfor den finnes.
          window.__lagret = window.__lagret.concat([{ kamp_id: "2026-09-20-brann-bodoglimt", navn: "Kari",
            hvor: "pub", sted: "Pub X", bruker: "u-2" }]);
          stedChip("Pub X").querySelector(".sted-knapp").click();
          setTimeout(function () { try {
            // Du gikk av lista, sa linja i kortet skal ikke lenger pasta
            // at du skal noe sted.
            ok("og nar du gar av lista, star ikke raden lenger som valgt",
               !stedChip("Pub X").classList.contains("valgt"),
               stedChip("Pub X").className);
            ok("venner som svarte etterpa dukker opp i kortet",
               stedChip("Pub X").querySelector(".sted-rad-folk")
                 .textContent.indexOf("Kari") > -1,
               stedChip("Pub X").textContent);
            // Og din egen fjerning tok bare din egen rad.
            ok("og din egen fjerning rorte ikke hennes",
               stedChip("Pub X").querySelector(".sted-rad-folk")
                 .textContent.indexOf("Du") === -1,
               stedChip("Pub X").textContent);

            // Skrivingen leser hele kampen tilbake for a bevise at din rad
            // landet, og de andre folger med. Byttes bare din ut, blir de
            // andre lagt oppa dem som alt la der.
            stedChip("Pub X").querySelector(".sted-knapp").click();
            setTimeout(function () { try {
              var tekst = stedChip("Pub X").querySelector(".sted-rad-folk").textContent;
              var antall = tekst.split("Kari").length - 1;
              ok("vennene star én gang, ikke to, etter en skriving",
                 antall === 1, antall + " ganger: " + tekst);
              ok("og du star der selv", tekst.indexOf("Du") > -1, tekst);
              ferdig();
            } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
            return;
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
        return;
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 18b. navnet folger kontoen, ikke telefonen ---------------- */

// Meldt fra prod 13. september 2026: «Har opprettet testbruker og satt
// begge pa samme kamp og pub. Men de ser ikke hverandre.»
//
// «Navnet vennene ser» la i nettleseren og ble ikke tomt ved utlogging.
// Logget man inn som en annen i samme nettleser, skrev den nye kontoen
// raden sin med forrige persons navn: to kontoer, to rader, ett navn.
const SAK_18B = kjor("navn-per-konto", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  // Ola er logget inn og har svart fra for — navnet ligger i nettleseren.
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-ola", navn: "Ola",
    bruker: "u-ola", fornyer: "f-ola",
    utloper: new Date(Date.now() + 3600000).toISOString() }));
  localStorage.setItem("sb-visning", JSON.stringify({ svarnavn: "Ola", svarnavnFor: "u-ola" }));

  window.__skrevet = [];
  function svarMed(kropp, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200,
      statusText: "OK", text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    var inn = o && o.body ? JSON.parse(o.body) : null;
    if (u.indexOf("/api/konto") === 0) {
      if (!inn) return svarMed({ klar: true, mangler: [] });
      if (inn.handling === "finnes") return svarMed({ navn: inn.navn, finnes: true });
      if (inn.handling === "logg-inn") {
        // Kari er en annen konto: en annen bruker-id.
        return svarMed({ token: "okt-kari", navn: inn.navn, bruker: "u-kari",
          fornyer: "f-kari", utloper: new Date(Date.now() + 3600000).toISOString() });
      }
      return svarMed({ feil: "Ukjent handling" }, 400);
    }
    if (u.indexOf("/api/svar") === 0) {
      if (inn) { window.__skrevet.push(inn); return svarMed({ svar: [] }); }
      return svarMed({ svar: [] });
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
    // Ola logger ut. Navnet skal ikke bli staende i telefonen.
    document.getElementById("menuBtn").click();
    document.getElementById("kontoBtn").click();
    document.getElementById("kontoUt").click();
    var visning = JSON.parse(localStorage.getItem("sb-visning") || "{}");
    ok("navnet forsvinner ved utlogging",
       !visning.svarnavn && !visning.svarnavnFor, JSON.stringify(visning));

    // Kari logger inn i samme nettleser.
    document.getElementById("kontoNavn").value = "Kari";
    document.getElementById("kontoSend").click();
    setTimeout(function () { try {
      document.getElementById("kontoPin").value = "1234";
      document.getElementById("kontoSend").click();
      setTimeout(function () { try {
        ok("Kari er logget inn",
           document.getElementById("hvemTag").textContent === "Kari",
           document.getElementById("hvemTag").textContent);

        // Og svarer pa en kamp.
        var rad = document.querySelectorAll(".kamp.delbar")[0];
        rad.querySelector(".kamp-del").click();
        var panel = document.querySelector(".kamp-panel");
        var arena = Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
          function (c) { return c.querySelector(".sted-navn").textContent === "Brann Stadion"; });
        arena.querySelector(".sted-knapp").click();
        setTimeout(function () { try {
          var skriv = window.__skrevet.filter(function (k) { return !k.handling; });
          // Dette var feilen: raden ble skrevet med «Ola».
          ok("Karis rad skrives med Karis navn",
             skriv.length === 1 && skriv[0].navn === "Kari",
             JSON.stringify(skriv.map(function (k) { return k.navn; })));
          ok("og med Karis egen okt",
             skriv[0].token === "okt-kari", skriv[0].token);
          ferdig();
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 19a. kortet apnet for svarene landet ---------------- */

// Meldt fra prod 13. september 2026: «Jeg markerte pub tidligere i dag.
// Ser ikke na hvor jeg skal ga.»
//
// Svarene hentes etter at runden star ferdig. Apner man en kamp med det
// samme — som man gjor nar man apner appen for a sjekke hvor man skal —
// var kortet ferdig tegnet for svarene kom, og ingenting tegnet det pa
// nytt. Stedet sto umerket, og kortet sa ingenting om hvor man skulle.
const SAK_19A = kjor("kort-for-svar", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-1", navn: "Ola",
    bruker: "u-1", fornyer: "f-1",
    utloper: new Date(Date.now() + 3600000).toISOString() }));

  // Svaret ligger i basen fra for — det ble skrevet en annen dag.
  var LAGRET = [{ kamp_id: "2026-09-20-brann-bodoglimt", navn: "Ola", hvor: "pub", sted: "Pub X", bruker: "u-1" },
                { kamp_id: "2026-09-20-brann-bodoglimt", navn: "Kari", hvor: "pub", sted: "Pub X", bruker: "u-2" }];
  window.__slippSvar = null;
  function svarMed(kropp) {
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      // Svaret holdes tilbake til testen slipper det: sa apner vi kampen
      // imens, nettopp slik en leser gjor.
      return new Promise(function (slipp) {
        window.__slippSvar = function () { slipp(svarMed({ svar: somTjenesten(LAGRET) })); };
      });
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
      return svarMed(kropp);
    }
    return svarMed(u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker);
  };
  location.hash = "#/fotball/eliteserien/neste";

  window.addEventListener("load", function () { setTimeout(function () { try {
    // Kampen apnes mens svarene fortsatt henger.
    var rad = document.querySelectorAll(".kamp.delbar")[0];
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var stedChip = function (navn) {
      return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn").textContent === navn; });
    };
    ok("kortet star apent for svarene har landet",
       !!panel && !stedChip("Pub X"), panel ? "apent" : "ikke apent");

    window.__slippSvar();
    setTimeout(function () { try {
      // Dette var feilen: kortet ble aldri tegnet pa nytt.
      var min = stedChip("Pub X");
      ok("stedet du skal til blir merket nar svarene lander",
         min && min.classList.contains("valgt"), min ? min.className : "ingen rad");
      ok("og knappen sier at du kan melde deg av",
         min.querySelector(".sted-knapp").textContent === "Meld deg av",
         min.querySelector(".sted-knapp").textContent);
      // Vennene skal ogsa komme, ikke bare merkingen av raden.
      ok("og vennene star i raden sammen med deg",
         min.querySelector(".sted-rad-folk").textContent.indexOf("Kari") > -1 &&
         min.querySelector(".sted-rad-folk").textContent.indexOf("Du") === 0,
         min.querySelector(".sted-rad-folk").textContent);
      // Og linja under kampen, som er den man ser mens man blar.
      ok("linja under kampen sier hvor du skal, ikke bare hvem",
         rad.querySelector(".kamp-blirmed").textContent.indexOf("Du skal til Pub X.") > -1,
         rad.querySelector(".kamp-blirmed").textContent);
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

/* ---------------- 19d. har du valgt, er de andre i veien ---------------- */

// Meldt 19. september 2026: «Har jeg valgt en pub, saa kan de andre
// minimiseres. Om noen venner har valgt annen pub saa kan de pubene
// vises.»
//
// Det er to paastander, og den andre er den viktige: stedene der noen
// andre skal, er det eneste som kan endre svaret ditt. At det finnes fire
// puber til, er det ikke.
const SAK_19D = kjor("sted-minimering", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  localStorage.setItem("sb-konto", JSON.stringify({ token: "okt-1", navn: "Ola",
    bruker: "u-1", fornyer: "f-1",
    utloper: new Date(Date.now() + 3600000).toISOString() }));

  // Du skal til Pub X. Kari skal et helt annet sted.
  window.__lagret = [
    { kamp_id: "2026-09-20-brann-bodoglimt", navn: "Ola", hvor: "pub", sted: "Pub X", bruker: "u-1" },
    { kamp_id: "2026-09-20-brann-bodoglimt", navn: "Kari", hvor: "pub", sted: "Karis Kjeller", bruker: "u-2" }
  ];
  function svarMed(kropp) {
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      var inn = o && o.body ? JSON.parse(o.body) : null;
      if (inn && inn.handling === "fjern") {
        window.__lagret = window.__lagret.filter(function (r) { return r.bruker !== "u-1"; });
        return svarMed({ fjernet: true });
      }
      if (inn) {
        window.__lagret = window.__lagret
          .filter(function (r) { return r.bruker !== "u-1"; })
          .concat([{ kamp_id: String(inn.kampId), navn: inn.navn, hvor: inn.hvor,
            sted: inn.sted, bruker: "u-1" }]);
      }
      return svarMed({ svar: somTjenesten(window.__lagret) });
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
      return svarMed(kropp);
    }
    return svarMed(u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker);
  };
  location.hash = "#/fotball/eliteserien/neste";

  window.addEventListener("load", function () { setTimeout(function () { try {
    var rad = document.querySelectorAll(".kamp.delbar")[0];
    rad.querySelector(".kamp-del").click();
    var panel = document.querySelector(".kamp-panel");
    var stedChip = function (navn) {
      return Array.prototype.find.call(panel.querySelectorAll(".sted-rad-kort"),
        function (c) { return c.querySelector(".sted-navn") &&
          c.querySelector(".sted-navn").textContent === navn; });
    };

    ok("ditt eget sted star framme",
       !!stedChip("Pub X") && !stedChip("Pub X").closest(".sted-resten"),
       stedChip("Pub X") ? stedChip("Pub X").className : "ingen rad");
    // Kjernen i det som ble meldt: stedet Kari skal til er det eneste
    // ANDRE som fortsatt svarer paa «hvor moter jeg noen».
    ok("og stedet en venn skal til blir staaende",
       !!stedChip("Karis Kjeller") && !stedChip("Karis Kjeller").closest(".sted-resten"),
       stedChip("Karis Kjeller") ? stedChip("Karis Kjeller").className : "ingen rad");
    ok("med navnet hennes i raden",
       stedChip("Karis Kjeller").querySelector(".sted-rad-folk")
         .textContent.indexOf("Kari") > -1,
       stedChip("Karis Kjeller").textContent);
    // Stadion staar framme ogsa etter at du har valgt: taket er tre rader
    // unna, og et svar minimerer ingenting lenger (20. september 2026).
    ok("mens stadion blir staaende",
       !!stedChip("Brann Stadion") && !stedChip("Brann Stadion").closest(".sted-resten"),
       stedChip("Brann Stadion") ? stedChip("Brann Stadion").className : "ingen rad");
    ok("og ingen knapp teller noe som ikke er minimert",
       !panel.querySelector(".sted-mer"),
       panel.querySelector(".sted-mer")
         ? panel.querySelector(".sted-mer").textContent : "ingen knapp");

    // Angrer du, staar alt fortsatt framme — nettopp fordi taket, ikke
    // svaret, avgjor hva som vises.
    stedChip("Pub X").querySelector(".sted-knapp").click();
    setTimeout(function () { try {
      // Taket avgjor, ikke svaret: lista ser lik ut for og etter. Ditt
      // eget sted og stedet Kari skal til staar framme uansett.
      ok("melder du deg av, staar de samme stedene framme",
         !!stedChip("Pub X") && !stedChip("Pub X").closest(".sted-resten") &&
         !!stedChip("Karis Kjeller") &&
         !stedChip("Karis Kjeller").closest(".sted-resten"),
         stedChip("Pub X") ? stedChip("Pub X").className : "ingen rad");
      ok("og stadion star framme igjen",
         !!stedChip("Brann Stadion") && !stedChip("Brann Stadion").closest(".sted-resten"));
      // Tilbudet om a sende inn stedet horer til et svar. For det kan
      // testes at det RYDDES, maa det ha vaert framme — en test som
      // sjekker at noe er skjult uten at det noen gang sto framme, er
      // gronn uansett hva koden gjor.
      // Et sted vi ikke kjenner kommer inn fra en DELT LENKE. Feltet man
      // kunne skrive det i gikk ut 20. september 2026, men raden fra lenka
      // gjor det ikke — og den kan svares paa som alle andre.
      var kampRad = panel.closest(".kamp");
      kampRad.dataset.pektSted = "Ukjent Kro";
      kampRad.dataset.pektHvor = "pub";
      panel.tegnSteder();
      stedChip("Ukjent Kro").querySelector(".sted-knapp").click();
      setTimeout(function () { try {
        var tilbud = panel.querySelector(".sted-tilbud");
        ok("et ukjent sted gir tilbudet",
           tilbud.hidden === false && tilbud.textContent.indexOf("Ukjent Kro") > -1,
           tilbud.hidden ? "skjult" : tilbud.textContent);

        // Angrer du, er det ikke lenger et sted du skal — og da er det
        // ikke lenger et sted vi skal be deg melde inn.
        stedChip("Ukjent Kro").querySelector(".sted-knapp").click();
        setTimeout(function () { try {
          ok("og det ryddes bort nar du melder deg av",
             tilbud.hidden === true, tilbud.textContent);

          // Det motsatte: sier du at du skal til et sted som ALT staar i
          // puber.js, er det ingenting a melde inn. Uten den vakta ville
          // appen bedt deg sende inn en pub den selv har i lista.
          //
          // Raden finnes uten noen delt lenke — den er kuratert, og ⚽ er
          // nettopp merket for det. Testen plukker den paa merket framfor
          // paa et navn, saa den ikke avhenger av hvilken pub som ligger
          // naermest i akkurat denne scenen.
          var kjentRad = Array.prototype.find.call(
            panel.querySelectorAll(".sted-rad-kort"),
            function (c) { return !!c.querySelector(".pub-merke"); });
          ok("en kuratert pub staar i kortet", !!kjentRad, "ingen kuratert rad");
          if (!kjentRad) { ferdig(); return; }
          var kjentNavn = kjentRad.querySelector(".sted-navn").textContent;
          kjentRad.querySelector(".sted-knapp").click();
          setTimeout(function () { try {
            ok("svaret gikk gjennom",
               panel.querySelector(".kamp-svar").textContent
                 .indexOf(kjentNavn) > -1,
               panel.querySelector(".kamp-svar").textContent);
            ok("men et sted vi alt kjenner tilbys ikke",
               tilbud.hidden === true, tilbud.textContent);
            ferdig();
          } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
      return;
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700); });
`);

/* ---------------- 19b. et gammelt token logger deg ikke ut ---------------- */

// Supabase gir et tilgangstoken som varer én time. Appen kastet
// fornyeren og ryddet okta med en gang tokenet var utlopt — sa man ble
// logget ut hver time, og matte taste PIN-en pa nytt. Meldt fra prod
// 13. september 2026.
//
// Okta i telefonen har et utlopt token og en fornyer. Det er ikke det
// samme som a vaere logget ut: du er fortsatt logget inn her, det er bare
// ferskvaren som er gammel.
function fornySide(fornyerSvar) {
  return FELLES + `
  var saker = lagSaker(12);
  localStorage.setItem("sb-konto", JSON.stringify({ token: "gammelt", navn: "Rune",
    bruker: "u-1", fornyer: "forny-1",
    utloper: new Date(Date.now() - 60000).toISOString() }));

  window.__forny = [];
  window.fetch = function (u, o) {
    u = String(u);
    if (u.indexOf("/api/konto") === 0) {
      var inn = o && o.body ? JSON.parse(o.body) : null;
      if (inn && inn.handling === "forny") {
        window.__forny.push(inn);
        return (${fornyerSvar})();
      }
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ klar: true, mangler: [] })); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };
`;
}

const SAK_19B = kjor("fornying", fornySide(`function () {
  // Uten bruker-id i svaret: Supabase trenger ikke sende brukerobjektet
  // med pa en fornying, og da ma appen beholde den den hadde.
  // (Ingen bakflutt her: den avslutter template-literalen rundt.)
  return Promise.resolve({ ok: true, status: 200, statusText: "OK",
    text: function () { return Promise.resolve(JSON.stringify({
      token: "ferskt", navn: "Rune", bruker: "", fornyer: "forny-2",
      utloper: new Date(Date.now() + 3600000).toISOString() })); } });
}`) + `
  window.addEventListener("load", function () { setTimeout(function () { try {
    ok("et utlopt token ber om fornying ved oppstart",
       window.__forny.length === 1, window.__forny.length);
    // PIN-en tastes ikke pa nytt: fornyeren *er* beviset.
    ok("og den sender fornyeren, ikke PIN-en",
       window.__forny[0].fornyer === "forny-1" &&
       JSON.stringify(window.__forny[0]).indexOf("pin") === -1,
       JSON.stringify(window.__forny[0]));

    var lagret = JSON.parse(localStorage.getItem("sb-konto") || "null");
    ok("det ferske tokenet lagres", lagret && lagret.token === "ferskt",
       JSON.stringify(lagret));
    // Fornyeren roterer: den brukte er dod i samme oyeblikk, sa den nye
    // ma lagres i stedet. Blir den gamle staende, blir neste fornying
    // avvist og man er like langt.
    ok("og den nye fornyeren erstatter den brukte",
       lagret && lagret.fornyer === "forny-2", lagret && lagret.fornyer);
    // Identiteten endrer seg ikke av en fornying. Mistes bruker-id-en,
    // vet ikke appen hvilken rad i «blir med»-lista som er din: stedet
    // star umerket, kortet sier ingenting om hvor du skal, og
    // delingsteksten mister stedet.
    ok("bruker-id-en overlever en fornying som ikke barer den",
       lagret && lagret.bruker === "u-1", lagret && lagret.bruker);
    // Det synlige beviset: du er fortsatt logget inn.
    var merke = document.getElementById("hvemTag");
    ok("du star fortsatt som innlogget",
       !merke.hidden && merke.textContent === "Rune",
       merke.hidden + " " + merke.textContent);
    ferdig();
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`);

/* ---------------- 19c. en avvist fornyer logger deg ut ---------------- */

// En avvist fornyer er noe annet enn et nettverksblaff: den er brukt,
// trukket tilbake eller utlopt, og da hjelper det ikke a prove igjen.
// Appen skal logge ut framfor a sta og prove.
const SAK_19C = kjor("fornying-avvist", fornySide(`function () {
  return Promise.resolve({ ok: false, status: 401, statusText: "Unauthorized",
    text: function () { return Promise.resolve(JSON.stringify({
      feil: "Innloggingen er utløpt. Logg inn på nytt.", utlogget: true })); } });
}`) + `
  window.addEventListener("load", function () { setTimeout(function () { try {
    ok("en avvist fornyer prover ikke om igjen",
       window.__forny.length === 1, window.__forny.length);
    ok("og den logger deg ut",
       !localStorage.getItem("sb-konto"), localStorage.getItem("sb-konto"));
    var merke = document.getElementById("hvemTag");
    ok("merket i toppfeltet forsvinner", merke.hidden, merke.textContent);
    // Resten av appen skal sta som for: ingenting er last bak innlogging.
    ok("og feeden star der som om ingenting hendte",
       document.querySelectorAll(".row").length > 0,
       document.querySelectorAll(".row").length);
    ferdig();
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`);

/* ---------------- 20c. mitt lag ---------------- */

// Alt appen vet om favorittlaget, samlet — plukket ut av de samme
// svarene fanene over henter. Mockens fotballsvar er likt for alle ligaer,
// sa Eliteserien (forst i rekkefolgen) er der Brann finnes.
const SAK_20C = kjor("mitt-lag", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  localStorage.setItem("sb-visning", JSON.stringify({ lag: ["Brann", "Lyn"] }));
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/mittlag";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var faner = document.querySelectorAll("#fotballFaner .segment-del");
    var fane = faner[faner.length - 1];
    ok("fanen heter Mitt lag og star sist", fane.dataset.verdi === "mittlag" &&
       fane.textContent === "Mitt lag", fane.textContent);
    ok("og en lenke apner den", fane.getAttribute("aria-current") === "true");

    var kort = document.querySelectorAll(".mittlag-kort");
    ok("ett kort per favorittlag", kort.length === 2, kort.length);
    var brann = kort[0];
    ok("kortet navngir laget og ligaen",
       brann.querySelector(".mittlag-navn").textContent === "Brann" &&
       brann.querySelector(".mittlag-liga").textContent === "Eliteserien",
       brann.querySelector(".mittlag-liga").textContent);
    ok("plassen i tall", brann.querySelector(".mittlag-plass").textContent ===
       "2. plass av 3 · 60 poeng · 30 kamper", brann.querySelector(".mittlag-plass").textContent);
    ok("og hva som skiller laget fra de rundt",
       brann.querySelector(".mittlag-avstand").textContent ===
       "8 poeng opp til 1. plass · 25 poeng ned til 3.",
       brann.querySelector(".mittlag-avstand").textContent);

    // Formen: bare Branns kamper. Molde–Rosenborg er ikke deres.
    var form = brann.querySelectorAll(".mittlag-form .mittlag-utfall");
    ok("formen er lagets egne kamper", form.length === 1 && form[0].textContent === "V",
       form.length);
    ok("og ordet star for skjermleseren, ikke bare fargen",
       form[0].getAttribute("aria-label") === "Seier mot Viking", form[0].getAttribute("aria-label"));

    ok("neste kamp er lagets",
       brann.querySelector(".mittlag-kamp").textContent === "Brann – Bodo/Glimt",
       brann.querySelector(".mittlag-kamp").textContent);
    // Mockens sesong er ikke inneværende. Da skal kortet si det for
    // tallene leses, og en kamp fra i fjor er ingenting a avtale rundt.
    ok("en gammel sesong sier fra",
       brann.querySelector(".mittlag-merknad").textContent === "Sesong 2024 — ikke inneværende.",
       brann.querySelector(".mittlag-merknad") && brann.querySelector(".mittlag-merknad").textContent);
    ok("og gir ingen lenke til a avtale kampen", !brann.querySelector(".mittlag-lenke"));

    var egen = brann.querySelector(".mittlag-egen");
    ok("tabellen merker laget", egen &&
       egen.querySelector(".lag-navn").textContent === "Brann",
       egen && egen.textContent);
    ok("og stjerna der er tent", egen.querySelector(".lag-stjerne").getAttribute("aria-pressed") === "true");

    ok("siste kamper viser resultatet",
       brann.querySelector(".mittlag-bolk .mittlag-motstander").textContent === "Brann 1–0 Viking",
       brann.querySelector(".mittlag-bolk .mittlag-motstander").textContent);

    // Et lag vi ikke finner, forsvinner ikke — det sier hvorfor.
    ok("et lag vi ikke finner star med forklaring",
       kort[1].querySelector(".mittlag-navn").textContent === "Lyn" &&
       kort[1].querySelector(".mittlag-merknad").textContent.indexOf("Fant ikke laget") === 0,
       kort[1].textContent);

    // Ingen nye kall: bare de tre datasettene fanene alt henter.
    var deler = window.__fotball.map(function (u) { return u.split("?")[0].split("/").pop(); });
    ok("siden henter bare det fanene alt henter",
       deler.every(function (d) { return d === "tabell" || d === "resultater" || d === "neste"; }) &&
       deler.filter(function (d) { return d === "tabell"; }).length === 5,
       deler.join(","));

    brann.querySelector(".mittlag-sok").click();
    ok("«Saker om Brann» soker i nyhetene",
       document.getElementById("sokFelt").value === "Brann", document.getElementById("sokFelt").value);
    ferdig();
  } catch (e) { ok("ingen unntak underveis", false, e.message + " @ " + (e.stack || "").split("\\n")[1]); ferdig(); } }, 1200); });
`);

// Uten favoritt er siden en forklaring og en vei, ikke en tom flate. Og
// svikter en del, sier kortet hvilken — «ingen kamper» ville vaert usant.
const SAK_20D = kjor("mitt-lag-tom", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `
  var grunn = window.fetch;
  window.fetch = function (u, o) {
    // Inneværende sesong her, sa kampen kan avtales.
    if (String(u).indexOf("/api/fotball/neste") === 0) {
      return grunn(u, o).then(function (r) { return r.text().then(function (t) {
        var d = JSON.parse(t); d.sisteSesong = true;
        return { ok: true, status: 200, statusText: "OK",
          text: function () { return Promise.resolve(JSON.stringify(d)); } };
      }); });
    }
    if (String(u).indexOf("/api/fotball/resultater") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve(JSON.stringify({ feil: "Fikk ikke svar fra TheSportsDB" })); } });
    }
    return grunn(u, o);
  };
  // Sju lag, ikke tre: kortet skal vise hele tabellen, og et utsnitt pa
  // fem rader er ikke til a skille fra hele nar tabellen er kortere.
  TABELL.push(
    { plass: 4, lag: "Viking", kamper: 30, seier: 9, uavgjort: 7, tap: 14, scoret: 38,
      sluppet: 45, differanse: -7, poeng: 34, merke: null },
    { plass: 5, lag: "Molde", kamper: 30, seier: 9, uavgjort: 6, tap: 15, scoret: 36,
      sluppet: 44, differanse: -8, poeng: 33, merke: null },
    { plass: 6, lag: "Rosenborg", kamper: 30, seier: 8, uavgjort: 7, tap: 15, scoret: 35,
      sluppet: 47, differanse: -12, poeng: 31, merke: null },
    { plass: 7, lag: "Lillestrom", kamper: 30, seier: 5, uavgjort: 5, tap: 20, scoret: 28,
      sluppet: 60, differanse: -32, poeng: 20, merke: null });
  location.hash = "#/fotball/mittlag";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rot = document.getElementById("fotballInnhold");
    ok("uten favoritt star det hva som skal til",
       rot.textContent.indexOf("Du følger ingen lag ennå") > -1, rot.textContent);
    rot.querySelector(".mittlag-til-tabell").click();
    setTimeout(function () { try {
      ok("og knappen gar til tabellen", location.hash.indexOf("/tabell") > -1, location.hash);
      document.querySelectorAll(".tabell .lag-stjerne")[1].click();   // Brann
      location.hash = "#/fotball/eliteserien/mittlag";
      setTimeout(function () { try {
        var kort = document.querySelector(".mittlag-kort");
        ok("en ny stjerne gir et kort", kort &&
           kort.querySelector(".mittlag-navn").textContent === "Brann");
        ok("en del som svikter, sier det med tjenestens ord",
           kort.textContent.indexOf("Fikk ikke hentet resultatene: Fikk ikke svar fra TheSportsDB") > -1,
           kort.textContent);
        ok("og resten av kortet star", !!kort.querySelector(".mittlag-plass") &&
           !!kort.querySelector(".mittlag-kamp"));
        var rader = kort.querySelectorAll(".mittlag-tabell tbody tr");
        ok("kortet viser hele tabellen, ikke fem rader rundt laget", rader.length === 7,
           rader.length);
        ok("med overskriften Tabellen og laget merket",
           kort.querySelector(".mittlag-tabell .mittlag-del").textContent === "Tabellen" &&
           rader[1].classList.contains("mittlag-egen"),
           kort.querySelector(".mittlag-tabell .mittlag-del").textContent);
        // Veien videre er kortet der kampen avtales — en ekte lenke.
        var lenke = kort.querySelector(".mittlag-lenke");
        ok("neste kamp lenker til kampen i Kommende",
           lenke && lenke.tagName === "A" &&
           lenke.getAttribute("href").indexOf("#/fotball/eliteserien/neste?kamp=") === 0,
           lenke && lenke.getAttribute("href"));
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1000); });
`);

/* ---------------- 20. vennefanen ---------------- */

// Kampene noen blir med pa, pa tvers av ligaer. Loftingen i Kommende
// svarer innenfor én liga; denne fanen finnes for det som ligger i en
// annen.
const SAK_20 = kjor("venner", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  var PL = [{ id: 901, hjemme: "Arsenal", borte: "Liverpool",
              dato: "2026-09-19T14:00:00+00:00", arena: "Emirates Stadium",
              runde: "Runde 5" }];
  // Funksjonen gir hele vinduet av kommende kamper — tjue — sa
  // adminportalen kan planlegge lenger fram enn til neste helg. Her er
  // det tre runder a atte, som i en ekte serie.
  var VINDU = [];
  for (var vr = 5; vr <= 7; vr++) {
    for (var vk = 0; vk < 8; vk++) {
      VINDU.push({ id: 1000 + vr * 10 + vk, hjemme: "Lag " + vk, borte: "Lag " + (vk + 8),
        dato: "2026-09-" + (14 + (vr - 5) * 7) + "T17:00:00+00:00",
        runde: "Runde " + vr, arena: "Brann Stadion" });
    }
  }
  window.__svarKall = 0;
  window.__spurte = [];
  window.__ligaer = [];
  window.__harSvar = true;

  function svarMed(kropp) {
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      window.__svarKall++;
      // Tjenesten svarer bare om kampene den faktisk ble spurt om.
      // Svarte stubben likt uansett, ville buntingen gitt Karis rad én
      // gang per bunt — «Kari og Kari» i lista, og en test som beviste
      // noe annet enn den trodde.
      var bedt = decodeURIComponent(u.split("kamper=")[1] || "").split(",");
      window.__spurte = window.__spurte.concat(bedt);
      // Svaret ligger pa Premier League-kampen, ikke i eliteserien: det
      // er nettopp den en fane per liga ikke ville vist.
      return svarMed({ svar: window.__harSvar &&
        bedt.indexOf("2026-09-19-arsenal-liverpool") > -1
        ? [{ kampId: "2026-09-19-arsenal-liverpool", navn: "Kari", hvor: "pub",
            sted: "Andys", bruker: "u-2" }]
        : [] });
    }
    if (u.indexOf("/api/fotball/neste") === 0) {
      // Stubben svarer per liga. Lot den alt som ikke var Premier League
      // fa det samme vinduet, ville de tre ovrige ligaene gitt de samme
      // kamp-id-ene om igjen — og «Kari og Kari» i lista.
      var nokkel = (decodeURIComponent(u).split("liga=")[1] || "").split("&")[0];
      window.__ligaer.push(nokkel);
      var egne = nokkel === "premier" ? PL : nokkel === "eliteserien" ? VINDU : [];
      return svarMed({ liga: nokkel, sesong: 2026,
        sisteSesong: true, kilde: "TheSportsDB", runde: "Runde 5", kamper: egne });
    }
    if (u.indexOf("/api/fotball") === 0) return svarMed({ kamper: [] });
    if (u.indexOf("/api/vaer") === 0) return svarMed({ timer: [] });
    if (u.indexOf("/api/puber") === 0) return svarMed({ grupper: [] });
    return svarMed(u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker);
  };

  location.hash = "#/fotball/venner";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var faner = document.querySelectorAll("#fotballFaner .segment-del");
    // Fem faner: de tre datasettene, venner og mitt lag.
    ok("vennefanen star i segmentet", faner.length === 5 &&
       faner[3].dataset.verdi === "venner", faner.length);
    ok("og en delt lenke apner den",
       faner[3].getAttribute("aria-current") === "true",
       faner[3].getAttribute("aria-current"));

    var rot = document.getElementById("fotballInnhold");
    // Begge ligaene sporres, ellers er fanen bare Kommende om igjen.
    ok("begge ligaenes runder hentes",
       window.__ligaer.indexOf("eliteserien") > -1 &&
       window.__ligaer.indexOf("premier") > -1, window.__ligaer.join(","));
    // 25 kamper — 24 i eliteserien, én i Premier League. Tjue id-er er
    // taket per kall, sa dette er to bunter. Poenget er at det ikke blir
    // ett kall per kamp.
    ok("hvem som blir med buntes, ikke ett kall per kamp",
       window.__svarKall === 2, window.__svarKall);
    ok("alle kampene pa skjermen er sport om",
       window.__spurte.length === 25, window.__spurte.length);
    // Fanen slar sammen ligaene. Kappes spørringen framfor a deles, faller
    // den siste ligaen stille ut — og det er nettopp den fanen finnes for.
    ok("Premier League-kampen er med i sporringen",
       window.__spurte.indexOf("2026-09-19-arsenal-liverpool") > -1,
       window.__spurte.length + " id-er, siste: " + window.__spurte.slice(-3).join(","));

    var rader = rot.querySelectorAll(".kamp");
    ok("bare kampen noen blir med pa star der", rader.length === 1, rader.length);
    ok("og det er den fra den andre ligaen",
       rot.textContent.indexOf("Arsenal") > -1 && rot.textContent.indexOf("Rosenborg") === -1,
       rot.textContent.slice(0, 100));
    ok("med lista over hvem som blir med",
       rot.textContent.indexOf("Kari blir med") > -1, rot.textContent.slice(0, 160));
    // Navnet lover mer enn det holder til vennegrupper finnes.
    ok("det star hvem «venner» er i dag",
       rot.textContent.indexOf("Alle som er logget inn") > -1, rot.textContent.slice(-120));

    // Tom til noen svarer — og da skal det sta hva som skal til.
    window.__harSvar = false;
    document.querySelector("#fotballFaner .segment-del[data-verdi='tabell']").click();
    setTimeout(function () { try {
      document.querySelector("#fotballFaner .segment-del[data-verdi='venner']").click();
      setTimeout(function () { try {
        ok("tom liste sier hva som skal til",
           rot.textContent.indexOf("Åpne en kamp under Kommende") > -1,
           rot.textContent.slice(0, 160));
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`);

/* ---------------- 20B. vennefanen: taket og feilen ---------------- */

// To ting fanen ikke kunne se selv.
//
// nesteRunde() holder rundevisningen under taket pa tjue id-er — men bare
// nar kampene baerer et rundetall. TheSportsDBs kommende kamper gjor ikke
// alltid det, og uten det er «neste runde» hele vinduet. Da blir to ligaer
// tjueen id-er, tjenesten kapper ved tjue, og den siste ligaen faller
// stille ut.
//
// Og feiler kallet, sto det «ingen har sagt at de blir med ennå» — en
// pastand om noe vi ikke vet. I rundevisningen er lista et tillegg til
// kampen og tausheten riktig; her er lista hele visningen.
const SAK_20B = kjor("venner-tak", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  // Uten rundetall, som TheSportsDB gir dem: tjue kamper i ett vindu.
  var VINDU = [];
  for (var vk = 0; vk < 20; vk++) {
    VINDU.push({ id: 2000 + vk, hjemme: "Lag " + vk, borte: "Lag " + (vk + 20),
      dato: "2026-09-15T17:00:00+00:00", runde: "", arena: "Brann Stadion" });
  }
  var PL = [{ id: 901, hjemme: "Arsenal", borte: "Liverpool",
              dato: "2026-09-19T14:00:00+00:00", arena: "Emirates Stadium",
              runde: "" }];

  window.__svarKall = 0;
  window.__spurte = [];
  window.__svarFeiler = false;

  function svarMed(kropp) {
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
  }
  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      window.__svarKall++;
      if (window.__svarFeiler) {
        return Promise.resolve({ ok: false, status: 503, statusText: "Service Unavailable",
          text: function () { return Promise.resolve(JSON.stringify(
            { feil: "Tabellen «kampsvar» finnes ikke. Kjor docs/oppsett.sql i Supabase." })); } });
      }
      // Tjenesten kapper ved tjue id-er, og kappingen er stille: id-ene
      // etter den tjuende gir ingen feil, de gir ingen rader. Stubben ma
      // gjore det samme, ellers kan testen ikke se kappingen.
      var bedt = decodeURIComponent(u.split("kamper=")[1] || "").split(",").slice(0, 20);
      window.__spurte = window.__spurte.concat(bedt);
      return svarMed({ svar: bedt.indexOf("2026-09-19-arsenal-liverpool") > -1
        ? [{ kampId: "2026-09-19-arsenal-liverpool", navn: "Kari", hvor: "pub",
            sted: "Andys", bruker: "u-2" }]
        : [] });
    }
    if (u.indexOf("/api/fotball/neste") === 0) {
      var pl = u.indexOf("liga=premier") > -1;
      return svarMed({ liga: pl ? "Premier League" : "Eliteserien", sesong: 2026,
        sisteSesong: true, kilde: "TheSportsDB", kamper: pl ? PL : VINDU });
    }
    if (u.indexOf("/api/fotball") === 0) return svarMed({ kamper: [] });
    if (u.indexOf("/api/vaer") === 0) return svarMed({ timer: [] });
    if (u.indexOf("/api/puber") === 0) return svarMed({ grupper: [] });
    return svarMed(u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker);
  };

  location.hash = "#/fotball/venner";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var rot = document.getElementById("fotballInnhold");

    ok("uten rundetall deles sporringen framfor a kappes",
       window.__svarKall > 1, window.__svarKall);
    ok("og kampen i den andre ligaen blir faktisk spurt om",
       window.__spurte.indexOf("2026-09-19-arsenal-liverpool") > -1,
       window.__spurte.length + " id-er, siste: " + window.__spurte.slice(-3).join(","));
    ok("sa den star i lista", rot.textContent.indexOf("Arsenal") > -1,
       rot.textContent.slice(0, 140));
    ok("med den som blir med, én gang", rot.textContent.indexOf("Kari blir med") > -1 &&
       rot.textContent.indexOf("Kari og Kari") === -1, rot.textContent.slice(0, 200));

    // Feiler kallet, er ikke lista tom — vi vet ikke hva som star i den.
    window.__svarFeiler = true;
    document.querySelector("#fotballFaner .segment-del[data-verdi='tabell']").click();
    setTimeout(function () { try {
      document.querySelector("#fotballFaner .segment-del[data-verdi='venner']").click();
      setTimeout(function () { try {
        ok("en feil sier hva tjenesten sa",
           rot.textContent.indexOf("kampsvar") > -1, rot.textContent.slice(0, 200));
        ok("og pastar ikke at ingen blir med",
           rot.textContent.indexOf("Ingen har sagt at de blir med") === -1,
           rot.textContent.slice(0, 200));
        ferdig();
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`);

/* ---------------- 21. kanalen som sender kampen ---------------- */

// kanaler.js star tom i repoet: ingen rad har kilde og dato, sa
// ingenting skal vises. Testen sender med sin egen utgave, som scenens
// tjener serverer framfor den i repoet — bare til denne scenen.
//
// To ligaer med vilje: én verifisert og én uten dato. Da ser testen
// bade at en verifisert rad vises, og at en udatert IKKE gjor det — og
// den andre halvdelen er den viktigste.
const KANALER_TEST =
  'export const KANALER = {\n' +
  '  eliteserien: { kanal: "TV 2 Play", kilde: "https://www.tv2.no/", sjekket: "2026-09-14" },\n' +
  '  premier: { kanal: "Viaplay", kilde: null, sjekket: null },\n' +
  '  laliga: { kanal: null, kilde: null, sjekket: null },\n' +
  '  bundesliga: { kanal: null, kilde: null, sjekket: null },\n' +
  '  seriea: { kanal: null, kilde: null, sjekket: null }\n' +
  '};\n';

const SAK_21 = kjor("kanal", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  var bedtOm = [];
  window.fetch = function (u) {
    u = String(u);
    bedtOm.push(u);
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var liga = (u.split("liga=")[1] || "eliteserien").split("&")[0];
      var kropp = { liga: liga, sesong: 2026, sisteSesong: true, del: del, kilde: "TheSportsDB",
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
    // Ingenting hentes for kanalen: den ligger i koden, ikke bak et kall.
    // Sprekker dette, har noen lagt den bak et endepunkt uten a si fra.
    ok("kanalen koster ingen nettkall",
       bedtOm.every(function (u) { return u.indexOf("kanal") === -1; }),
       bedtOm.filter(function (u) { return u.indexOf("kanal") > -1; }).join(" "));

    // Linja star i kortet, ikke i kampraden: raden baerer alt tid, vaer,
    // pub-linje og «blir med»-linje.
    ok("kanalen star ikke i kampraden", !document.querySelector(".kamp-linje .kamp-kanal"));

    document.querySelectorAll(".kamp-del")[0].click();
    var panel = document.querySelector(".kamp-panel");
    var kanal = panel.querySelector(".kamp-kanal");
    ok("kortet sier hvilken kanal som sender", !!kanal);
    ok("og hvilken", kanal.textContent.indexOf("Sendes på TV 2 Play") > -1, kanal.textContent);

    // Den staar OVER stedene: ser du at kampen sendes, er resten av
    // kortet et valg om a se den sammen med noen framfor alene.
    var liste = panel.querySelector(".sted-liste");
    ok("kanalen star over stedene",
       kanal.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING);

    // Og den er INGEN sted-rad. En kanal er ikke et motested — det var
    // nettopp «Hjemme», som er tatt ut med vilje. En rad med «Jeg skal
    // hit» ville gjenreist den.
    ok("kanalen er ingen sted-rad man kan melde seg pa",
       !kanal.classList.contains("sted-rad-kort") &&
       !kanal.querySelector("button") &&
       !liste.contains(kanal));

    // Datoen staar i title, ikke pa skjermen: den som lurer pa hvor
    // ferskt det er kan se etter, resten skal slippe.
    ok("naar noen sist sa etter staar i title",
       kanal.title.indexOf("2026-09-14") > -1, kanal.title);

    // Skjermleseren skal ikke lese emojien som et ord i tillegg.
    ok("skjermleseren far én setning",
       kanal.getAttribute("aria-label") === "Kampen sendes på TV 2 Play",
       kanal.getAttribute("aria-label"));

    // DEN VIKTIGSTE: Premier League har et kanalnavn i fila, men hverken
    // kilde eller dato. Da skal den ikke vises. En feil kanal er verre
    // enn ingen — leseren kjoper et abonnement hen ikke trenger, eller
    // gar glipp av kampen fordi vi sa feil sted.
    location.hash = "#/fotball/premier/neste";
    setTimeout(function () { try {
      document.querySelectorAll(".kamp-del")[0].click();
      var udatert = document.querySelector(".kamp-panel");
      ok("en kanal uten kilde og dato vises ikke",
         !udatert.querySelector(".kamp-kanal"),
         udatert.querySelector(".kamp-kanal")
           ? udatert.querySelector(".kamp-kanal").textContent : "");
      // Og kortet virker som for: kanalen er et tillegg, ikke en
      // forutsetning.
      ok("kortet staar likevel ferdig",
         udatert.querySelector(".kamp-panel-tittel").textContent === "Hvor skal du se den?");
      ferdig();
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 700);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`, null, null, { "kanaler.js": KANALER_TEST });

/* ---------------- 22. foreslatte steder (#80) ---------------- */

// Star du pa en pub som ikke finnes i lista, hadde du til na ingen vei til
// a si fra. Skjemaet ligger nederst i pubdelen av kortet — der man alt har
// skrevet et navn selv, og der stedet mangler.
const SAK_22 = kjor("pub-forslag", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  window.__forslag = [];
  try {
    localStorage.setItem("sb-konto", JSON.stringify({
      token: "okt-token", fornyer: "fornyer", bruker: "u-1", navn: "Rune",
      utloper: Date.now() + 3600000 }));
  } catch (e) { /* privat modus */ }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-forslag") === 0) {
      window.__forslag.push(JSON.parse((opt || {}).body || "{}"));
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { ok: true, merknad: "Takk. Vi ser på det." })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
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

  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp.delbar .kamp-del").click();
    setTimeout(function () { try {
      var panel = document.querySelector(".kamp-panel");
      // Skjulingen ligger i .sted-forslag-skjema, ikke i at elementet
      // mangler — sa testen maler synlighet, ikke tilstedevaerelse. Forste
      // utkast sto rodt pa noe som virket.
      var skjulte = panel && panel.querySelector(".sted-forslag-skjema");
      ok("skjemaet star ikke framme uoppfordret", !!skjulte && skjulte.hidden,
         skjulte ? "synlig" : "ingen panel");

      setTimeout(function () { try {
        // «Jeg er paa pub, legg inn her» staar nederst i kortet na, ikke
        // bak to knapper. Skjemaet apnes av den.
        var pavei = panel.querySelector(".sted-pavei");
        ok("og veien inn staar nederst i kortet", !!pavei,
           pavei ? pavei.textContent : "ingen knapp");
        if (!pavei) { ferdig(); return; }

        pavei.click();
        var skjema = panel.querySelector(".sted-forslag-skjema");
        var felter = skjema.querySelectorAll(".konto-felt");
        ok("og skjemaet star framme etterpa", skjema.hidden === false,
           skjema.hidden ? "skjult" : "framme");
        felter[0].value = "Bar Boca";
        ok("navnet kan skrives", felter[0].value === "Bar Boca", felter[0].value);

        // Adressen er ikke pynt: uten den kan ikke stedet sorteres etter
        // avstand. Sjekken er den samme fila tjenesten bruker.
        skjema.querySelector(".konto-send").click();
        ok("uten adresse sendes ingenting", window.__forslag.length === 0,
           JSON.stringify(window.__forslag));
        ok("og det star hvorfor adressen trengs",
           skjema.querySelector(".kamp-svar").textContent.indexOf("finner stedet") > -1,
           skjema.querySelector(".kamp-svar").textContent);

        // Et sted som alt star i lista er ikke feil, men unodvendig arbeid.
        felter[0].value = "Andys Pub";
        felter[1].value = "Storgata 1";
        skjema.querySelector(".konto-send").click();
        ok("et sted som alt star i lista sendes ikke", window.__forslag.length === 0,
           JSON.stringify(window.__forslag));
        ok("og det sies med ord",
           skjema.querySelector(".kamp-svar").textContent.indexOf("allerede i lista") > -1,
           skjema.querySelector(".kamp-svar").textContent);

        felter[0].value = "Bar Boca";
        felter[1].value = "Thorvald Meyers gate 30";
        skjema.querySelector(".konto-send").click();
        setTimeout(function () { try {
          ok("et fullt forslag sendes", window.__forslag.length === 1,
             JSON.stringify(window.__forslag));
          var f = window.__forslag[0] || {};
          ok("med navn og adresse",
             f.navn === "Bar Boca" && f.adresse === "Thorvald Meyers gate 30", JSON.stringify(f));
          // Skrivingen gar med leserens egen okt, ikke med en nokkel.
          ok("og med din egen okt", f.token === "okt-token", f.token);
          ok("svaret fra tjenesten vises",
             skjema.querySelector(".kamp-svar").textContent.indexOf("Takk") > -1,
             skjema.querySelector(".kamp-svar").textContent);
          ok("og feltene tommes sa det samme ikke sendes to ganger",
             felter[0].value === "" && felter[1].value === "",
             felter[0].value + "|" + felter[1].value);
          ferdig();
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);

// Utlogget: egen side, ikke samme. Appen leser okten ved oppstart, sa a
// slette den fra localStorage midt i en test er ingen utlogging — den
// oversatte bare til at konto.okt() fortsatt svarte. Testen sto rodt pa
// noe som virker, og det var testen som var feil.
const SAK_22B = kjor("pub-forslag-utlogget", FELLES + FOTBALL + `
  var saker = lagSaker(12);
  var ARETS = KOMMENDE.map(function (k) { return Object.assign({}, k, { arena: "Brann Stadion" }); });
  window.__forslag = [];
  try { localStorage.removeItem("sb-konto"); } catch (e) { /* privat modus */ }
  window.fetch = function (u, opt) {
    u = String(u);
    if (u.indexOf("/api/pub-forslag") === 0) {
      window.__forslag.push(JSON.parse((opt || {}).body || "{}"));
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { ok: true, merknad: "Takk. Vi ser på det." })); } });
    }
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify({ svar: [], visninger: [] })); } });
    }
    if (u.indexOf("overpass") > -1) {
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve({ elements: [] }); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0) {
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

  location.hash = "#/fotball/eliteserien/neste";
  window.addEventListener("load", function () { setTimeout(function () { try {
    document.querySelector(".kamp.delbar .kamp-del").click();
    setTimeout(function () { try {
      var panel = document.querySelector(".kamp-panel");
      var _andre = panel.querySelector(".sted-andre-apne"); if (_andre) _andre.click();
      setTimeout(function () { try {
        panel.querySelector(".sted-pavei").click();
        var skjema = panel.querySelector(".sted-forslag-skjema");
        var felter = skjema.querySelectorAll(".konto-felt");
        felter[0].value = "Bar Boca";
        felter[1].value = "Thorvald Meyers gate 30";
        skjema.querySelector(".konto-send").click();
        setTimeout(function () { try {
          ok("utlogget sendes ingenting", window.__forslag.length === 0,
             JSON.stringify(window.__forslag));
          ok("og det star at man ma logge inn forst",
             skjema.querySelector(".kamp-svar").textContent.indexOf("Logg inn") > -1,
             skjema.querySelector(".kamp-svar").textContent);
          // Ingenting er last bak innlogging: kortet og stedene star som for.
          ok("men stedene i kortet star som for",
             !!panel.querySelector(".sted-liste"), "ingen stedliste");
          ferdig();
        } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 300);
      } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 400);
    } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 500);
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 1200); });
`);


/* ---------------- 24. resultater: hele sesongen ---------------- */

// Meldt 21. september 2026: «Hva koster det aa gaa tilbake alle runder
// der? Naa ser vel kun siste runde.»
//
// Fanen sporte om `&last=10`, og ti kamper er godt over én runde i
// Eliteserien. Na kommer hele sesongen i det samme ene kallet. Ved runde
// 23 er det over halvannet hundre rader, saa siste runde staar framme og
// resten ligger bak en knapp.
const SAK_24 = kjor("resultater-alle-runder", FELLES + FOTBALL + `
  var saker = lagSaker(12);

  // Fire runder, nyeste forst — slik /api/fotball/resultater gir dem.
  // To kamper i hver, saa «en runde deles ikke i to» kan males.
  var ALLE = [];
  for (var r = 23; r >= 20; r--) {
    // En kamp uten rundetall, midt i lista. Ikke forst: da ville
    // sisteRunde blitt tom og hele grupperinga slatt av, og det er en
    // annen sak enn den denne raden maaler.
    if (r === 22) {
      ALLE.push({ id: 999, dato: "2026-09-16T17:00:00+00:00", runde: "",
        hjemme: "Viking", borte: "Bryne", malHjemme: 1, malBorte: 1, spilt: true });
    }
    for (var i = 0; i < 2; i++) {
      ALLE.push({ id: r * 10 + i,
        dato: "2026-09-" + (String(r - 5 + i).padStart(2, "0")) + "T17:00:00+00:00",
        runde: "Runde " + r,
        hjemme: i ? "Molde" : "Brann", borte: i ? "Rosenborg" : "Viking",
        malHjemme: 2, malBorte: i, spilt: true });
    }
  }

  window.fetch = function (u) {
    u = String(u);
    if (u.indexOf("/api/svar") === 0) {
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(
          { svar: [], visninger: [] })); } });
    }
    if (u.indexOf("/api/fotball/") === 0) {
      var del = u.split("?")[0].split("/").pop();
      var kropp = { liga: "Eliteserien", sesong: 2026, sisteSesong: true, del: del,
                    kilde: "TheSportsDB", oppdatert: new Date().toISOString(),
                    kamper: del === "resultater" ? ALLE : KOMMENDE,
                    runde: "Runde 23" };
      if (del === "tabell") kropp.tabell = TABELL;
      return Promise.resolve({ ok: true, status: 200, statusText: "OK",
        text: function () { return Promise.resolve(JSON.stringify(kropp)); } });
    }
    if (u.indexOf("/api/puber?") === 0 || u.indexOf("/api/vaer?") === 0 ||
        u.indexOf("/api/pub-liste") === 0) {
      return Promise.resolve({ ok: false, status: 502, statusText: "Bad Gateway",
        text: function () { return Promise.resolve("{}"); } });
    }
    var svar = u.indexOf("/wp-api/categories") === 0 ? KATEGORIER : saker;
    return Promise.resolve({ ok: true, status: 200, statusText: "OK",
      text: function () { return Promise.resolve(JSON.stringify(svar)); } });
  };

  location.hash = "#/fotball/eliteserien/resultater";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var liste = document.querySelector(".kamper");
    ok("resultatfanen staar", !!liste);
    if (!liste) { ferdig(); return; }

    // Kjernen i det som ble meldt: alle fire rundene ER hentet. Sto
    // «&last=10» igjen, kom det bare én.
    ok("hele sesongen er hentet, ikke bare siste runde",
       document.querySelectorAll(".kamp").length === 9,
       document.querySelectorAll(".kamp").length);

    // Men ikke alle staar framme. Siste runde gjor.
    var tidligere = document.querySelector(".kamp-tidligere");
    ok("de tidligere rundene ligger for seg", !!tidligere);
    if (!tidligere) { ferdig(); return; }
    ok("og er skjult til du trykker", tidligere.hidden === true);

    var framme = Array.prototype.filter.call(
      document.querySelectorAll(".kamp"),
      function (k) { return !k.closest(".kamp-tidligere"); });
    ok("bare siste runde staar framme, pluss den uten rundetall",
       framme.length === 3, framme.length);
    // En runde skal ikke deles i to av et tak: skillet gaar paa RUNDEN,
    // ikke paa et antall rader.
    ok("og det er hele runden, ikke et avkappet antall",
       framme.filter(function (k) { return k.dataset.runde === "Runde 23"; })
         .length === 2,
       framme.map(function (k) { return k.dataset.runde; }).join(","));

    // Overskrifta staar over runden — den sto bare paa «neste» for.
    var overskrift = liste.querySelector(".kamp-runde");
    ok("runden har en overskrift ogsaa i resultater",
       !!overskrift && overskrift.textContent === "Runde 23",
       overskrift ? overskrift.textContent : "ingen");

    // Knappen teller RUNDER, ikke kamper: det er runder du blar i.
    var knapp = document.querySelector(".kamp-tidligere-apne");
    ok("knappen sier hvor mange runder som ligger bak",
       !!knapp && knapp.textContent === "Vis tidligere runder (3)",
       knapp ? knapp.textContent : "ingen knapp");
    if (!knapp) { ferdig(); return; }
    ok("og sier at den er lukket",
       knapp.getAttribute("aria-expanded") === "false");

    knapp.click();
    ok("ett trykk viser dem", tidligere.hidden === false);
    ok("og knappen snur", knapp.textContent === "Skjul tidligere runder",
       knapp.textContent);
    ok("og sier at den er apen",
       knapp.getAttribute("aria-expanded") === "true");
    ok("alle tre tidligere runder har hver sin overskrift",
       tidligere.querySelectorAll(".kamp-runde").length === 3,
       tidligere.querySelectorAll(".kamp-runde").length);
    // Nyeste forst, ogsaa bak knappen: en sesong leses bakover herfra.
    ok("i rekkefolge, nyeste forst",
       Array.prototype.map.call(tidligere.querySelectorAll(".kamp-runde"),
         function (h) { return h.textContent; }).join(",") ===
         "Runde 22,Runde 21,Runde 20",
       Array.prototype.map.call(tidligere.querySelectorAll(".kamp-runde"),
         function (h) { return h.textContent; }).join(","));

    // En rad UTEN rundetall blir staaende framme.
    //
    // Fanget av en sabotasje 21. september 2026: uten runde-sjekken i
    // plasseringa havnet den bak knappen — uten overskrift, og uten aa
    // telle med i tallet paa knappen. Skjult av en opplysning vi ikke
    // har. Samme regel som naerNok(): en liste som gjemmer noe fordi den
    // mangler opplysninger, gjemmer det uten grunn.
    var utenRunde = Array.prototype.filter.call(
      document.querySelectorAll(".kamp"),
      function (k) { return k.dataset.runde === ""; });
    ok("kampen uten rundetall staar framme, ikke bak knappen",
       utenRunde.length === 1 && !utenRunde[0].closest(".kamp-tidligere"),
       utenRunde.length + " uten runde, "
         + (utenRunde[0] ? (utenRunde[0].closest(".kamp-tidligere") ? "bak" : "framme") : "-"));

    // Resultatrader er ikke delbare — det er de aldri blitt, og en
    // sesong tilbake i tid er ingenting aa avtale rundt.
    ok("en spilt kamp er ikke delbar",
       !document.querySelector(".kamp.delbar") &&
       !document.querySelector(".kamp-del"));
    // Og stillingen staar der resultatet skal staa.
    ok("stillingen staar mellom lagene",
       framme[0].querySelector(".kamp-tall").textContent === "2 – 0",
       framme[0].querySelector(".kamp-tall").textContent);
    ferdig();
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`);

/* ---------------- 22. tabellen pa en ekte iPhone ---------------- */

// «Ma scrolle skjermen til siden for a se poeng» — meldt fra prod
// 16. september 2026, testet pa iPhone.
//
// Det fantes alt en test som sa at alle atte kolonnene far plass. Den
// passerte, og den tok feil om to ting:
//
//   VINDUET. Den kjorer i standard headless-vindu, der .phone far hele
//   sine 390 px. En iPhone 13 mini er 375 px BREDT TOTALT, og body har
//   10 px luft pa hver side — altsa 355 px til kortet. Testen malte en
//   bredde ingen telefon gir.
//
//   NAVNENE. Tre rader: «Bodo/Glimt», «Brann», «Rosenborg». Eliteserien
//   har «Kristiansund BK» og «Sarpsborg 08», og lagkolonnen er den ene
//   som far vokse.
//
// Og siden den forrige testen ble skrevet, kom lagmerket (#33): 18 px
// bilde pluss 6 px mellomrom i hver eneste rad i den kolonnen. Ingen
// justerte bredden etterpa.
//
// Denne kjorer derfor i 375 px med alle seksten lagene.
const ELITESERIEN = [
  "Bodo/Glimt", "Brann", "Rosenborg", "Molde", "Viking", "Lillestrom",
  "Tromso", "Sarpsborg 08", "Kristiansund BK", "Stromsgodset", "HamKam",
  "Fredrikstad", "Sandefjord", "KFUM Oslo", "Haugesund", "Bryne",
];

const SAK_23 = kjor("tabell-iphone", FELLES + `
  var TABELL = [
${ELITESERIEN.map((lag, i) => `    { plass: ${i + 1}, lag: ${JSON.stringify(lag)}, kamper: 30, seier: ${21 - i}, uavgjort: 5,\n      tap: ${4 + i}, scoret: ${74 - i * 3}, sluppet: ${33 + i}, differanse: ${41 - i * 4}, poeng: ${68 - i * 3},\n      merke: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" },`).join("\n")}
  ];
  var RESULTATER = []; var KOMMENDE = [];
  var saker = lagSaker(12);
  ` + mockAlt("saker") + `
  location.hash = "#/fotball/eliteserien/tabell";
  window.addEventListener("load", function () { setTimeout(function () { try {
    var skall = document.querySelector(".tabell-skall");
    var kort = document.querySelector(".phone");

    // Bredden settes HER, ikke av --window-size. Flagget slar ikke gjennom
    // likt overalt: lokalt er binaerfila ofte headless_shell, pa en
    // CI-runner er det ekte Chrome, og der ble kortet 390 px uansett hva
    // vinduet sa. Da malte vokteren runneren framfor koden.
    //
    // 355 px er det en iPhone 13 mini faktisk gir: 375 px skjerm minus
    // body-luft pa 10 px i hver side. Samme grep som rulletesten lenger
    // oppe, som setter feltbredden selv for a tvinge fram det smale
    // tilfellet.
    kort.style.width = "355px";

    // Og vokteren ma fortsatt finnes: uten den kunne testen passere fordi
    // feltet var bredt, som den forrige tabelltesten gjorde i to dager.
    // Na sjekker den FELTET, som er det tabellen faktisk ma passe i.
    ok("tabellfeltet er sa smalt som pa en iPhone 13 mini",
       skall.clientWidth > 0 && skall.clientWidth <= 320,
       skall.clientWidth + " px");

    ok("alle seksten lagene er tegnet",
       document.querySelectorAll(".tabell tbody tr").length === 16,
       document.querySelectorAll(".tabell tbody tr").length);

    // Selve feilen: poeng er det forste man ser etter i en tabell, og en
    // tabell man ma dra i for a se det er en darligere tabell.
    ok("tabellen far plass uten a rulle sidelengs",
       skall.scrollWidth <= skall.clientWidth,
       skall.scrollWidth + " av " + skall.clientWidth);

    // Og konkret: staar poengkolonnen innenfor feltet uten a rulle?
    var poeng = document.querySelector(".tabell tbody tr .kol-poeng");
    var feltet = skall.getBoundingClientRect();
    ok("poengkolonnen er synlig uten a dra",
       poeng.getBoundingClientRect().right <= feltet.right + 1,
       Math.round(poeng.getBoundingClientRect().right) + " mot feltets " + Math.round(feltet.right));

    // Og med margin. Dette er dagens lekse: forste utgave passerte lokalt
    // med 310 px felt og feilet pa CI med «322 av 310» — tolv piksler, og
    // hele forskjellen var fontmetrikk. Runneren har andre fonter enn min
    // maskin, og layouten hadde null slingringsmonn.
    //
    // 320 px kort er smalere enn noen iPhone i bruk. Far tabellen plass
    // DER, kan ikke en font som tegner litt bredere velte den.
    kort.style.width = "320px";
    ok("og med margin: ogsa smalere enn noen iPhone i bruk",
       skall.scrollWidth <= skall.clientWidth,
       skall.scrollWidth + " av " + skall.clientWidth);
    kort.style.width = "355px";

    ferdig();
  } catch (e) { ok("ingen unntak underveis", false, e.message); ferdig(); } }, 900); });
`, "375,780");

/* ---------------- rapport ---------------- */

// Scenene er satt i gang over; her ventes det pa alle. Rekkefolgen i
// rapporten er filas, uansett hvilken som ble ferdig forst.
const alle = (await Promise.all([SAK_1, SAK_1B, SAK_2, SAK_3, SAK_4, SAK_5, SAK_6, SAK_7, SAK_8, SAK_9, SAK_10, SAK_11, SAK_12, SAK_12C, SAK_13, SAK_14, SAK_14B, SAK_14C, SAK_14D, SAK_14E, SAK_14F, SAK_14G, SAK_14H, SAK_14I, SAK_14J, SAK_14K, SAK_14L, SAK_15, SAK_15B, SAK_15C, SAK_15D, SAK_15E, SAK_15F, SAK_15G, SAK_15H, SAK_15I, SAK_15J, SAK_16, SAK_16B, SAK_16C, SAK_16D, SAK_16E, SAK_16F, SAK_16G, SAK_16H, SAK_17, SAK_18, SAK_18B, SAK_18C, SAK_19, SAK_19A, SAK_19D, SAK_19B, SAK_19C, SAK_20, SAK_20B, SAK_20C, SAK_20D, SAK_21, SAK_22, SAK_22B, SAK_23, SAK_24])).flat();
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
