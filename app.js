// Appen. Lastes som modul, sa den kjorer etter at DOM-en finnes.
//
// De rene hjelpefunksjonene ligger i lib.js for a kunne enhetstestes uten
// nettleser. Alt her nede rorer DOM, nettverk eller lagring.

import { safeUrl, videoUrl, postDate, timeAgo, feedSignature, internSlug } from "./lib.js";

// Bytt WP_HOST til din egen WordPress-side når som helst.
const WP_HOST  = "https://sportsbibelen.no";
const WP_QUERY = "?_embed=1&per_page=12&orderby=date&order=desc";
const WP_URL   = WP_HOST + "/wp-json/wp/v2/posts" + WP_QUERY;

// Feeden hentes fra første kilde som svarer med gyldig JSON.
//  1. Samme domene via Netlify-proxyen (se netlify.toml) — ingen tredjepart,
//     ingen CORS-problemer. Dette er den normale veien.
//  2. Direkte mot WordPress som reserve. Virker kun hvis serveren sender
//     Access-Control-Allow-Origin, men koster ingenting å forsøke hvis
//     proxyen skulle svikte.
//
// Den tidligere offentlige CORS-proxyen er fjernet med vilje: den var
// ratelimitet og uten SLA, og var årsaken til at feeden ble stående tom.
function catParam(categoryId) {
  return categoryId ? "&categories=" + encodeURIComponent(categoryId) : "";
}

function postSources(categoryId, sideNr) {
  let q = WP_QUERY + catParam(categoryId);
  if (sokeord) q += "&search=" + encodeURIComponent(sokeord);
  if (sideNr && sideNr > 1) q += "&page=" + sideNr;
  return sourcesFor(q);
}

// Samme vindu som feeden, men kun id og endringstidspunkt. _fields kutter
// svaret fra full brodtekst for tolv saker til noen fa hundre byte, sa
// dette er billig nok til a kjore hvert femte minutt.
const SIG_QUERY = "?per_page=12&orderby=date&order=desc&_fields=id,modified_gmt";

function signatureSources(categoryId) {
  let q = SIG_QUERY + catParam(categoryId);
  if (sokeord) q += "&search=" + encodeURIComponent(sokeord);
  return sourcesFor(q);
}

function sourcesFor(query) {
  return [
    { name: "Netlify-proxy (/wp-api)", url: "/wp-api/posts" + query },
    { name: "Direkte mot WordPress",   url: WP_HOST + "/wp-json/wp/v2/posts" + query }
  ];
}


// Menyen bygges av kategoriene. WordPress sitt menyendepunkt
// (/wp/v2/menu-items) krever normalt innlogging, mens kategoriene er
// offentlige — og pa en nyhetsside er de i praksis toppmenyen.
// Har dere en handplukket meny som avviker, kan den settes her i stedet.
const MENU_OVERRIDE = null;   // f.eks. [{ id: 12, name: "Fotball" }, …]

const CAT_QUERY = "?per_page=20&orderby=count&order=desc&hide_empty=true";

function categorySources() {
  return [
    { name: "Netlify-proxy (/wp-api)", url: "/wp-api/categories" + CAT_QUERY },
    { name: "Direkte mot WordPress",   url: WP_HOST + "/wp-json/wp/v2/categories" + CAT_QUERY }
  ];
}

const REQUEST_TIMEOUT_MS = 12000;
const REFRESH_MS = 5 * 60 * 1000;

let hasContent = false;
let lastFocused = null;
let activeCategory = null;      // null = alle saker
let lastSignature = null;
let alleSaker = [];             // det som ligger i feeden na, pa tvers av sider
let side = 1;
let flereFinnes = true;
let sokeord = "";
let harPushet = false;
const PER_SIDE = 12;
const WP_VERT = new URL(WP_HOST).hostname;       // feedens tilstand ved forrige vellykkede lasting
let menuLoaded = false;

/* ---------- små DOM-hjelpere ---------- */

// Alt tekstinnhold settes via textContent, aldri via innerHTML. Det er det
// som gjør feeden trygg selv om innholdet kommer via en tredjepartsproxy.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}


function imageEl(url, lazy) {
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.loading = lazy ? "lazy" : "eager";
  return img;
}

/* ---------- innholdshjelpere ---------- */

// WordPress leverer titler som HTML. Vi henter ut ren tekst med textContent,
// som allerede dekoder entiteter én gang — å dekode en gang til ville gjort
// "&lt;img onerror=...&gt;" om til en levende tag igjen.
function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
}



function timeEl(post, className) {
  const date = postDate(post);
  const node = el("time", className, timeAgo(date));
  if (date) node.dateTime = date.toISOString();
  return node;
}

function getImage(post) {
  const embedded = post._embedded || {};
  const media = embedded["wp:featuredmedia"] && embedded["wp:featuredmedia"][0];
  return safeUrl(media && media.source_url);
}

function getCategory(post) {
  const embedded = post._embedded || {};
  const terms = embedded["wp:term"] && embedded["wp:term"][0];
  return terms && terms.length > 0 ? stripHtml(terms[0].name) : null;
}

function getTitle(post) {
  return stripHtml(post.title && post.title.rendered) || "Uten tittel";
}

/* ---------- statistikk ---------- */

// Sender en hendelse hvis Plausible er lastet, og gjør ingenting hvis den
// ikke er det. Appen skal aldri feile fordi statistikk mangler.
function track(event, props) {
  try {
    if (typeof window.plausible === "function") {
      window.plausible(event, props ? { props: props } : undefined);
    }
  } catch (err) {
    /* statistikk skal aldri velte lesingen */
  }
}

/* ---------- rensing av artikkel-HTML ---------- */

// Artikkelteksten fra WordPress er HTML, og skal rendres som HTML. Derfor
// er dette en allowlist, ikke en blocklist: en tag slipper gjennom bare
// hvis den star her. En ukjent tag blir aldri sluppet gjennom fordi den
// tilfeldigvis manglet pa en liste over farlige ting.
const ALLOWED = {
  P: [], BR: [], HR: [], DIV: [], SPAN: [],
  STRONG: [], B: [], EM: [], I: [], U: [], S: [], SUP: [], SUB: [], MARK: [],
  H2: [], H3: [], H4: [], H5: [], H6: [],
  UL: [], OL: [], LI: [],
  BLOCKQUOTE: [], PRE: [], CODE: [],
  FIGURE: [], FIGCAPTION: [],
  TABLE: [], THEAD: [], TBODY: [], TFOOT: [], TR: [], TH: [], TD: [],
  A: ["href", "data-slug"],
  IMG: ["src", "alt"],
  IFRAME: ["src", "title", "allowfullscreen"]
};



// Disse fjernes med innholdet sitt. For alle andre ukjente tagger beholder
// vi teksten inni, men kaster selve elementet.
const DROPPED = {
  SCRIPT: 1, STYLE: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1,
  BASE: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1,
  NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, MATH: 1
};

function sanitizeHtml(html) {
  // <template> parser HTML uten a aktivere noe: bilder lastes ikke, og
  // onerror utloses ikke. Et vanlig <div> ville faktisk lastet bildene
  // mens vi holdt pa a rense dem.
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  cleanChildren(tpl.content);
  return tpl.content;
}

function cleanChildren(root) {
  Array.prototype.slice.call(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();           // kommentarer og alt annet rart
      return;
    }

    const tag = node.tagName.toUpperCase();

    if (DROPPED[tag]) {
      node.remove();
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) {
      cleanChildren(node);
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      return;
    }

    // Fjerner alle attributter som ikke star pa listen. Det tar blant
    // annet alle on*-handlere og style i ett jafs.
    const allowed = ALLOWED[tag];
    Array.prototype.slice.call(node.attributes).forEach((attr) => {
      if (allowed.indexOf(attr.name.toLowerCase()) === -1) {
        node.removeAttribute(attr.name);
      }
    });

    if (tag === "A") {
      const href = safeUrl(node.getAttribute("href"));
      if (href) {
        node.setAttribute("href", href);
        // Lenker til vare egne saker apnes i appen. href beholdes, sa
        // lenken virker hvis noe skulle feile, og lang-trykk og "apne i ny
        // fane" oppforer seg normalt.
        const intern = internSlug(href, WP_VERT);
        if (intern) {
          node.setAttribute("data-slug", intern);
        } else {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      } else {
        node.removeAttribute("href");
      }
    }

    if (tag === "IMG") {
      const src = safeUrl(node.getAttribute("src"));
      if (!src) {
        node.remove();
        return;
      }
      node.setAttribute("src", src);
      node.setAttribute("loading", "lazy");
    }

    if (tag === "IFRAME") {
      const src = videoUrl(node.getAttribute("src"));
      if (!src) {
        node.remove();      // alt annet enn YouTube og Vimeo faller bort
        return;
      }
      node.setAttribute("src", src);
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      node.setAttribute("allowfullscreen", "");
    }

    cleanChildren(node);
  });
}

/* ---------- henting ---------- */

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// Kaster med en beskrivende melding i stedet for å svelge feilen, slik at
// en tom feed faktisk kan feilsøkes.
async function fetchList(url, extra) {
  const options = {
    headers: { "Accept": "application/json" },
    signal: timeoutSignal(REQUEST_TIMEOUT_MS)
  };
  if (extra && extra.cache) options.cache = extra.cache;

  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const preview = text.slice(0, 70).replace(/\s+/g, " ");
    throw new Error("Svaret var ikke JSON (fikk: " + preview + "…)");
  }

  if (data && !Array.isArray(data) && data.code) {
    throw new Error("WordPress svarte med feilen «" + data.code + "»");
  }
  if (!Array.isArray(data)) {
    throw new Error("Forventet en liste med artikler, fikk " + typeof data);
  }
  return data;
}

// Hvor nar toppen leseren ma vaere for at en bakgrunnsoppdatering skal
// fa bygge feeden pa nytt.
const TOP_THRESHOLD = 40;

// Henter kun id og endringstidspunkt for de samme tolv sakene og
// sammenligner med forrige lasting. Klarer vi ikke å sjekke, sier vi at
// noe kan være nytt og henter alt som før — sjekken skal aldri kunne
// fryse feeden fast.
async function nothingNew() {
  if (!lastSignature) return false;

  for (const source of signatureSources(activeCategory)) {
    try {
      // Ingen mellomlagring på selve sjekken: et cachet svar ville sagt
      // «uendret» i det uendelige.
      const list = await fetchList(source.url, { cache: "no-store" });
      return feedSignature(list) === lastSignature;
    } catch (err) {
      console.error("[Sportsbibelen] endringssjekk · " + source.name + " feilet:", err);
    }
  }
  return false;
}

async function loadFeed(options) {
  const silent = options && options.silent;
  const feed = document.getElementById("feed");

  if (silent && hasContent) {
    // Står leseren nede i listen, lar vi feeden være. Ellers ville nye
    // saker blitt lagt inn over vedkommende, som da blir stående igjen
    // langt nede i en liste som har endret seg under føttene på dem.
    if (feed.scrollTop > TOP_THRESHOLD) return;

    // Er ingenting endret, er det ingen grunn til å hente tolv saker med
    // full brødtekst på nytt.
    if (await nothingNew()) return;
  }

  if (!silent) {
    const loading = el("div", "state");
    loading.appendChild(el("p", null, "Henter nyheter …"));
    feed.setAttribute("aria-busy", "true");
    feed.replaceChildren(loading);
  }

  const problems = [];
  for (const source of postSources(activeCategory)) {
    try {
      const posts = await fetchList(source.url);
      side = 1;
      flereFinnes = posts.length >= PER_SIDE;
      alleSaker = posts;
      renderFeed(posts);
      lastSignature = feedSignature(posts);
      hasContent = posts.length > 0;
      feed.setAttribute("aria-busy", "false");
      return;
    } catch (err) {
      console.error("[Sportsbibelen] " + source.name + " feilet:", err);
      problems.push(source.name + " — " + (err && err.message ? err.message : String(err)));
    }
  }

  feed.setAttribute("aria-busy", "false");
  // Uten en kjent tilstand må neste oppdatering hente alt.
  lastSignature = null;

  // Gjør feilen synlig i statistikken, slik at vi oppdager en feed som
  // slutter å virke uten å vente på at noen melder fra.
  track("Feed feilet", { årsak: (problems[0] || "ukjent").slice(0, 80) });

  // Ved bakgrunnsoppdatering beholder vi det som allerede står på skjermen.
  if (silent && hasContent) return;
  showError(problems);
}

/* ---------- annonser ---------- */

// Én annonseplass etter hver fjerde sak, med toppsaken talt som den
// første. Feeden henter tolv saker, så det gir to plasser per lasting.
const ADS_EVERY = 4;

// Plassholdere. Annonsørene her er oppdiktede. Når ekte annonser skal inn,
// erstattes denne listen av data fra annonsesystemet — formatet er det
// samme, og rekkefølgen i listen bestemmer blandingen av de to formatene.
const ADS = [
  {
    format: "banner",
    brand: "NORDBANE",
    headline: "Tre måneder trening. Ingen binding.",
    cta: "Se tilbudet"
  },
  {
    format: "stripe",
    brand: "PADELHUSET",
    headline: "Fire nye baner åpner i Bergen i oktober",
    sub: "Book time · padelhuset.no"
  },
  {
    format: "banner",
    brand: "SPRINTA",
    headline: "Nye Sprinta Terreng. Bygget for norsk høst.",
    cta: "Se skoene"
  },
  {
    format: "stripe",
    brand: "TRIBUNE",
    headline: "Billetter til høstens toppkamper",
    sub: "tribune.no"
  }
];

function buildAd(ad, slot) {
  const box = el("div", "ad-" + ad.format);
  box.setAttribute("role", "group");
  // Merkingen må også nå skjermlesere, ikke bare øyet.
  box.setAttribute("aria-label", "Reklame fra " + ad.brand);

  if (ad.format === "stripe") {
    const top = el("div", "ad-top");
    top.appendChild(el("span", "ad-label", "Reklame"));
    top.appendChild(el("span", "ad-brand", ad.brand));
    box.appendChild(top);
    box.appendChild(el("p", "ad-headline", ad.headline));
    if (ad.sub) box.appendChild(el("span", "ad-sub", ad.sub));
  } else {
    box.appendChild(el("span", "ad-label", "Reklame"));
    // Plassholder-flate. Ekte annonsemateriell settes inn her.
    box.appendChild(el("div", "ad-creative", ad.brand));
    const body = el("div", "ad-body");
    body.appendChild(el("p", "ad-headline", ad.headline));
    if (ad.cta) body.appendChild(el("span", "ad-cta", ad.cta));
    box.appendChild(body);
  }

  track("Annonse vist", { annonsor: ad.brand, plass: String(slot) });
  return box;
}

/* ---------- relaterte saker ---------- */

async function visRelaterte(post, boks) {
  const terms = (post._embedded || {})["wp:term"];
  const kategori = terms && terms[0] && terms[0][0];
  if (!kategori || !kategori.id) return;

  const q = "?_embed=1&per_page=3&orderby=date&order=desc"
          + "&categories=" + encodeURIComponent(kategori.id)
          + "&exclude=" + encodeURIComponent(post.id);

  for (const source of sourcesFor(q)) {
    try {
      const saker = await fetchList(source.url);
      if (!saker.length || !boks.isConnected) return;

      boks.appendChild(el("h3", "relatert-tittel", "Mer fra " + kategori.name));
      saker.forEach((sak) => {
        const rad = el("button", "relatert-rad");
        rad.type = "button";
        rad.appendChild(el("span", "relatert-navn", getTitle(sak)));
        rad.appendChild(timeEl(sak, "relatert-tid"));
        rad.addEventListener("click", () => {
          closeDetail();
          visArtikkel(sak);
        });
        boks.appendChild(rad);
      });
      return;
    } catch (err) {
      // Relaterte saker er en bonus. Feiler de, skal artikkelen sta.
      console.error("[Sportsbibelen] relaterte saker feilet:", err);
      return;
    }
  }
}

/* ---------- ruting ---------- */

// Hash-ruting, ikke sti-ruting. En sti som /sak/<slug> ville gitt 404 ved
// oppfriskning uten en ny regel i netlify.toml, og den regelen skal holdes
// smal. Hash koster ingenting pa serversiden.
function slugFraHash() {
  const m = location.hash.match(/^#\/sak\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function visArtikkel(post, trigger) {
  const slug = post.slug || String(post.id);
  history.pushState({ slug }, "", "#/sak/" + encodeURIComponent(slug));
  harPushet = true;
  openDetail(post, trigger);
}

function lukkArtikkel() {
  // Lukk med en gang, sa visningen aldri henger etter historikken.
  closeDetail();
  if (harPushet) {
    harPushet = false;
    history.back();
  } else if (slugFraHash()) {
    history.replaceState({}, "", location.pathname + location.search);
  }
}

// Slar opp en sak pa slug: forst blant de som alt er lastet, ellers hentes
// den. Det siste er det som gjor dyplenker og interne lenker mulig.
async function apneSlug(slug, trigger) {
  const kjent = alleSaker.find((p) => p.slug === slug);
  if (kjent) {
    openDetail(kjent, trigger);
    return true;
  }
  for (const source of sourcesFor(WP_QUERY + "&slug=" + encodeURIComponent(slug))) {
    try {
      const treff = await fetchList(source.url);
      if (treff.length) {
        openDetail(treff[0], trigger);
        return true;
      }
    } catch (err) {
      console.error("[Sportsbibelen] oppslag pa slug feilet:", err);
    }
  }
  return false;
}

window.addEventListener("popstate", () => {
  const slug = slugFraHash();
  if (!slug) {
    harPushet = false;
    closeDetail();
    return;
  }
  apneSlug(slug);
});

/* ---------- rendering ---------- */

function renderFeed(posts, opts) {
  const behold = opts && opts.behold;
  const feed = document.getElementById("feed");
  const forrigeRull = feed.scrollTop;
  feed.replaceChildren();

  if (!posts.length) {
    const state = el("div", "state");
    state.appendChild(el("p", null, "Ingen artikler funnet."));
    feed.appendChild(state);
    return;
  }

  // Ny liste, ny start. Uten dette arver den nye feeden rulleposisjonen
  // fra den forrige, som sjelden peker pa det samme innholdet. Ved
  // paginering er det motsatt: da er listen den samme, bare lengre.
  feed.scrollTop = 0;

  feed.appendChild(buildHero(posts[0]));

  const rows = posts.slice(1);
  let shown = 1;      // toppsaken teller som den første saken
  let slot = 0;

  rows.forEach((post, index) => {
    feed.appendChild(buildRow(post));
    shown += 1;

    // Ingen annonse etter siste sak: der ville den bare sett ut som en
    // avslutning på feeden.
    const isLast = index === rows.length - 1;
    if (!isLast && shown % ADS_EVERY === 0) {
      feed.appendChild(buildAd(ADS[slot % ADS.length], slot + 1));
      slot += 1;
    }
  });

  if (flereFinnes) feed.appendChild(byggVisFlere());
  if (behold) feed.scrollTop = forrigeRull;
}

function byggVisFlere() {
  const knapp = el("button", "vis-flere", "Vis flere saker");
  knapp.type = "button";
  knapp.addEventListener("click", async () => {
    knapp.disabled = true;
    knapp.textContent = "Henter …";
    const fikk = await hentFlere();
    if (!fikk) {
      knapp.textContent = "Klarte ikke hente flere";
      knapp.disabled = false;
    }
  });
  return knapp;
}

// Henter neste side og legger den bak den vi har. Feeden bygges om i sin
// helhet, ikke lappes pa, sa annonseplasseringen forblir en regel og ikke
// to kodeveier.
async function hentFlere() {
  for (const source of postSources(activeCategory, side + 1)) {
    try {
      const nye = await fetchList(source.url);
      side += 1;
      flereFinnes = nye.length >= PER_SIDE;
      alleSaker = alleSaker.concat(nye);
      renderFeed(alleSaker, { behold: true });
      track("Flere saker hentet", { side: String(side) });
      return true;
    } catch (err) {
      console.error("[Sportsbibelen] flere saker feilet:", err);
    }
  }
  return false;
}

function buildHero(post) {
  const button = el("button", "card-btn hero");
  button.type = "button";

  const img = getImage(post);
  if (img) button.appendChild(imageEl(img, false));

  const overlay = el("div", "hero-overlay");
  const cat = getCategory(post);
  if (cat) overlay.appendChild(el("span", "cat-pill", cat));
  overlay.appendChild(el("h2", "hero-title", getTitle(post)));
  overlay.appendChild(timeEl(post, "meta"));
  button.appendChild(overlay);

  button.addEventListener("click", () => visArtikkel(post, button));
  return button;
}

function buildRow(post) {
  const button = el("button", "card-btn row");
  button.type = "button";

  const img = getImage(post);
  button.appendChild(img ? imageEl(img, true) : el("div", "thumb-empty"));

  const body = el("div", "row-body");
  const cat = getCategory(post);
  if (cat) body.appendChild(el("span", "row-cat", cat));
  body.appendChild(el("h3", "row-title", getTitle(post)));
  body.appendChild(timeEl(post, "row-meta"));
  button.appendChild(body);

  button.addEventListener("click", () => visArtikkel(post, button));
  return button;
}

function showError(problems) {
  const feed = document.getElementById("feed");
  const state = el("div", "state");
  state.appendChild(el("p", null, "Klarte ikke å hente nyheter akkurat nå."));

  const retry = el("button", "retry-btn", "Prøv igjen");
  retry.type = "button";
  retry.addEventListener("click", () => loadFeed());
  state.appendChild(retry);

  if (problems.length) {
    const details = document.createElement("details");
    details.className = "err-details";
    details.appendChild(el("summary", null, "Tekniske detaljer"));
    problems.forEach((line) => details.appendChild(el("p", "err-line", line)));
    state.appendChild(details);
  }

  feed.replaceChildren(state);
}

/* ---------- visningsvalg ---------- */

const PREF_KEY = "sb-visning";

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function savePrefs(value) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(value));
  } catch (err) {
    // Privat modus eller blokkerte informasjonskapsler: valget gjelder
    // da bare denne økta, og det er greit.
  }
}

function applyPrefs(value) {
  const root = document.documentElement;

  if (value.svart) root.setAttribute("data-theme", "svart");
  else root.removeAttribute("data-theme");

  if (value.stor) root.setAttribute("data-font", "stor");
  else root.removeAttribute("data-font");

  // aria-current, ikke aria-pressed: dette er et valg mellom to
  // alternativer, ikke to uavhengige av- og pa-brytere.
  merkSegment("temaLys", !value.svart);
  merkSegment("temaSvart", !!value.svart);
  merkSegment("skriftNormal", !value.stor);
  merkSegment("skriftStor", !!value.stor);
}

function merkSegment(id, aktiv) {
  const b = document.getElementById(id);
  if (aktiv) b.setAttribute("aria-current", "true");
  else b.removeAttribute("aria-current");
}

const prefs = readPrefs();
applyPrefs(prefs);

// Et segment velger en verdi, det veksler ikke. Da kan den som allerede
// star der trykkes uten at noe skrives eller spores.
function settVisning(felt, verdi, hendelse, navn) {
  if (prefs[felt] === verdi) return;
  prefs[felt] = verdi;
  applyPrefs(prefs);
  savePrefs(prefs);
  track(hendelse, navn);
}

document.getElementById("temaLys").addEventListener("click", () =>
  settVisning("svart", false, "Tema byttet", { tema: "lyst" }));

document.getElementById("temaSvart").addEventListener("click", () =>
  settVisning("svart", true, "Tema byttet", { tema: "svart" }));

document.getElementById("skriftNormal").addEventListener("click", () =>
  settVisning("stor", false, "Skriftstørrelse byttet", { størrelse: "normal" }));

document.getElementById("skriftStor").addEventListener("click", () =>
  settVisning("stor", true, "Skriftstørrelse byttet", { størrelse: "stor" }));

/* ---------- toppfeltet krymper ved rulling ---------- */

// Terskelen har en dodsone: uten den ville feltet blinke fram og tilbake
// nar leseren star akkurat pa grensen, siden krympingen selv flytter
// innholdet noen piksler.
const KRYMP_NED = 64;
const KRYMP_OPP = 20;

function folgMedPaRulling() {
  const feed = document.getElementById("feed");
  const telefon = document.querySelector(".phone");

  feed.addEventListener("scroll", () => {
    const y = feed.scrollTop;
    if (y > KRYMP_NED) telefon.classList.add("komprimert");
    else if (y < KRYMP_OPP) telefon.classList.remove("komprimert");
  }, { passive: true });
}

folgMedPaRulling();

/* ---------- sok ---------- */

document.getElementById("sokForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const felt = document.getElementById("sokFelt");
  const q = felt.value.trim();

  sokeord = q;
  // Et sok gar pa tvers av kategorier. Ellers ville treffene stilltiende
  // vaert begrenset til den kategorien man tilfeldigvis sto i.
  activeCategory = null;
  lastSignature = null;

  merkValgtKategori(null);
  document.getElementById("filterTag").textContent = q ? "Søk: " + q : "";
  track(q ? "Sok" : "Sok tomt", { ord: q.slice(0, 40) });
  closeMenu();
  loadFeed();
});

/* ---------- del og installer ---------- */

const DEL_TEKST = "Sportsbibelen — siste nytt fra sportens verden";
let installasjonsvarsel = null;

function visNotat(tekst) {
  const notat = document.getElementById("actionNote");
  notat.textContent = tekst;
  notat.hidden = !tekst;
}

function alleredeInstallert() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

function erIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

document.getElementById("shareBtn").addEventListener("click", async () => {
  const data = { title: "Sportsbibelen", text: DEL_TEKST, url: location.origin + "/" };
  try {
    if (navigator.share) {
      await navigator.share(data);
      track("App delt", { metode: "deling" });
      return;
    }
    // Ingen delingsmeny: legg lenken på utklippstavlen i stedet.
    await navigator.clipboard.writeText(data.url);
    visNotat("Lenken er kopiert: " + data.url);
    track("App delt", { metode: "utklippstavle" });
  } catch (err) {
    // Avbrutt deling er ikke en feil, men manglende utklippstavle er noe
    // leseren må kunne komme videre fra.
    if (err && err.name === "AbortError") return;
    visNotat("Kopier lenken selv: " + data.url);
  }
});

const installKnapp = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  // Vi vil vise vår egen knapp i menyen, ikke nettleserens banner.
  e.preventDefault();
  installasjonsvarsel = e;
  if (!alleredeInstallert()) installKnapp.hidden = false;
});

// iOS har ingen installasjonshendelse. Der er eneste vei en instruksjon.
if (erIos() && !alleredeInstallert()) {
  installKnapp.hidden = false;
}

installKnapp.addEventListener("click", async () => {
  if (installasjonsvarsel) {
    installasjonsvarsel.prompt();
    const svar = await installasjonsvarsel.userChoice;
    track("Installasjon", { valg: svar.outcome });
    installasjonsvarsel = null;
    if (svar.outcome === "accepted") installKnapp.hidden = true;
    return;
  }
  visNotat("Trykk Del nederst i Safari, og velg «Legg til på Hjem-skjerm».");
  track("Installasjon", { valg: "ios-veiledning" });
});

window.addEventListener("appinstalled", () => {
  installKnapp.hidden = true;
  visNotat("");
  track("Installasjon", { valg: "fullfort" });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Appen skal virke uten. Da er den bare ikke installerbar.
      console.error("[Sportsbibelen] service worker feilet:", err);
    });
  });
}

// En delegert lytter, ikke en per lenke: innholdet byttes ut hver gang en
// artikkel apnes.
document.getElementById("detailCard").addEventListener("click", async (e) => {
  const lenke = e.target.closest("a[data-slug]");
  if (!lenke) return;
  e.preventDefault();
  const slug = lenke.dataset.slug;
  const fikk = await apneSlug(slug);
  if (fikk) {
    history.pushState({ slug }, "", "#/sak/" + encodeURIComponent(slug));
    harPushet = true;
    track("Intern lenke apnet", { artikkel: slug });
  } else {
    // Fant vi den ikke, skal leseren fortsatt komme dit.
    window.open(lenke.href, "_blank", "noopener");
  }
});

/* ---------- meny ---------- */

async function loadMenu() {
  if (menuLoaded) return;

  const list = document.getElementById("menuList");

  if (MENU_OVERRIDE) {
    renderMenu(MENU_OVERRIDE);
    menuLoaded = true;
    return;
  }

  for (const source of categorySources()) {
    try {
      const cats = await fetchList(source.url);
      renderMenu(cats);
      menuLoaded = true;
      return;
    } catch (err) {
      console.error("[Sportsbibelen] meny · " + source.name + " feilet:", err);
    }
  }

  // Menyen er en bekvemmelighet. Feiler den, skal feeden fortsatt virke,
  // sa vi lar "Alle saker" sta igjen alene.
  renderMenu([]);
  const note = document.createElement("li");
  note.appendChild(el("p", "menu-state", "Klarte ikke å hente kategoriene."));
  list.appendChild(note);
}

function renderMenu(categories) {
  const list = document.getElementById("menuList");
  list.replaceChildren();

  list.appendChild(menuEntry({ id: null, name: "Alle saker" }));
  categories.forEach((cat) => list.appendChild(menuEntry(cat)));
}

function menuEntry(cat) {
  const item = document.createElement("li");
  const button = el("button", "menu-item");
  button.type = "button";
  button.dataset.catId = cat.id ? String(cat.id) : "";
  button.appendChild(el("span", null, cat.name || "Uten navn"));

  if (typeof cat.count === "number") {
    button.appendChild(el("span", "count", String(cat.count)));
  }

  if ((cat.id || null) === activeCategory) {
    button.setAttribute("aria-current", "true");
  }

  button.addEventListener("click", () => selectCategory(cat));
  item.appendChild(button);
  return item;
}

// Markerer valgt punkt uten a hente menyen pa nytt. Brukes bade av
// menyvalg og av sok, som nullstiller kategorien.
function merkValgtKategori(id) {
  const wanted = id ? String(id) : "";
  document.querySelectorAll(".menu-item").forEach((btn) => {
    if (btn.dataset.catId === wanted) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
}

function selectCategory(cat) {
  const id = cat.id || null;
  activeCategory = id;
  sokeord = "";
  document.getElementById("sokFelt").value = "";

  merkValgtKategori(id);

  // Vis i toppen hvilken del av feeden man star i.
  const tag = document.getElementById("filterTag");
  tag.textContent = id ? cat.name : "";

  track("Kategori valgt", { kategori: id ? cat.name : "alle" });
  closeMenu();
  loadFeed();
}

function openMenu() {
  const panel = document.getElementById("menuPanel");
  const btn = document.getElementById("menuBtn");
  panel.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  document.getElementById("menuClose").focus();
  track("Meny åpnet");
  loadMenu();
}

function closeMenu() {
  const panel = document.getElementById("menuPanel");
  const btn = document.getElementById("menuBtn");
  if (!panel.classList.contains("open")) return;
  panel.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
  btn.focus();
}

function isMenuOpen() {
  return document.getElementById("menuPanel").classList.contains("open");
}

document.getElementById("menuBtn").addEventListener("click", openMenu);
document.getElementById("menuClose").addEventListener("click", closeMenu);

/* ---------- detaljvisning ---------- */

function openDetail(post, trigger) {
  lastFocused = trigger || document.activeElement;

  const card = document.getElementById("detailCard");
  card.replaceChildren();

  const img = getImage(post);
  if (img) card.appendChild(imageEl(img, false));

  const body = el("div", "detail-body");
  const cat = getCategory(post);
  if (cat) body.appendChild(el("span", "row-cat", cat));

  const title = el("h2", "detail-title", getTitle(post));
  title.id = "detailTitle";
  body.appendChild(title);

  const content = post.content && post.content.rendered;

  if (post.content && post.content.protected) {
    body.appendChild(el("p", "detail-excerpt",
      "Denne artikkelen er passordbeskyttet og kan ikke leses her."));
  } else if (content && content.trim()) {
    const article = el("div", "detail-content");
    article.appendChild(sanitizeHtml(content));
    body.appendChild(article);
  } else {
    // Faller tilbake til utdraget hvis feeden ikke leverer brodtekst.
    const excerpt = stripHtml(post.excerpt && post.excerpt.rendered);
    if (excerpt) body.appendChild(el("p", "detail-excerpt", excerpt));
  }

  const link = safeUrl(post.link);
  if (link) {
    const anchor = el("a", "read-link", "Les på sportsbibelen.no →");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.addEventListener("click", () => {
      track("Les på nettsiden", { artikkel: post.slug || String(post.id || "") });
    });
    body.appendChild(anchor);
  }

  // Relaterte saker holder leseren i appen i stedet for a sende dem
  // tilbake til feeden for a finne noe nytt.
  const relatertBoks = el("div", "relatert");
  body.appendChild(relatertBoks);
  visRelaterte(post, relatertBoks);

  const close = el("button", "close-btn", "Lukk");
  close.type = "button";
  close.addEventListener("click", lukkArtikkel);
  body.appendChild(close);

  card.appendChild(body);
  card.scrollTop = 0;

  // Fokus ma til en knapp som ligger overst. Fokuseres knappen nederst,
  // ruller nettleseren dit for a vise den, og artikkelen apner pa bunnen.
  document.getElementById("cornerClose").focus({ preventScroll: true });

  track("Artikkel åpnet", {
    artikkel: post.slug || String(post.id || ""),
    kategori: cat || "uten kategori"
  });
  document.getElementById("detailWrap").classList.add("open");
}

function closeDetail() {
  document.getElementById("detailWrap").classList.remove("open");
  if (lastFocused && lastFocused.isConnected) lastFocused.focus();
  lastFocused = null;
}

function isDetailOpen() {
  return document.getElementById("detailWrap").classList.contains("open");
}

document.getElementById("cornerClose").addEventListener("click", lukkArtikkel);

document.getElementById("detailWrap").addEventListener("click", (e) => {
  if (e.target.id === "detailWrap") lukkArtikkel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isDetailOpen()) lukkArtikkel();
    else if (isMenuOpen()) closeMenu();
    return;
  }
  if (e.key === "Tab" && isDetailOpen()) fangFokus(e);
});

// Uten dette vandrer tabulator ut av artikkelen og ned i feeden bak
// overlegget, som fortsatt er synlig. Dialogen skal holde pa fokus til
// den lukkes.
function fangFokus(e) {
  const skall = document.querySelector(".detail-shell");
  const felt = skall.querySelectorAll('a[href], button:not([disabled])');
  if (!felt.length) return;

  const forste = felt[0];
  const siste = felt[felt.length - 1];

  // Star fokus utenfor dialogen, hentes det inn igjen.
  if (!skall.contains(document.activeElement)) {
    e.preventDefault();
    forste.focus();
    return;
  }
  if (e.shiftKey && document.activeElement === forste) {
    e.preventDefault();
    siste.focus();
  } else if (!e.shiftKey && document.activeElement === siste) {
    e.preventDefault();
    forste.focus();
  }
}

/* ---------- oppstart ---------- */

// Apner appen pa en dyplenke, apnes den saken med en gang feeden star.
loadFeed().then(() => {
  const slug = slugFraHash();
  if (slug) apneSlug(slug);
});

// Feeden oppdateres i bakgrunnen så lenge fanen er synlig. loadFeed lar
// innholdet stå hvis leseren har scrollet ned i listen.
setInterval(() => {
  if (!document.hidden) loadFeed({ silent: true });
}, REFRESH_MS);

// Testflate. Modulen har ingen globale variabler, sa nettlesertestene
// trenger et navngitt sted a na loadFeed fra. Bevisst liten: alt annet
// testes gjennom DOM-en, slik en bruker ville rort det.
window.app = { loadFeed, renderFeed };
