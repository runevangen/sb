// Appen. Lastes som modul, sa den kjorer etter at DOM-en finnes.
//
// De rene hjelpefunksjonene ligger i lib.js for a kunne enhetstestes uten
// nettleser. Alt her nede rorer DOM, nettverk eller lagring.

import { safeUrl, videoUrl, postDate, timeAgo, feedSignature, internSlug, rangerTreff, listeTekst }
  from "./lib.js";
import { LIGAER, tolkFotballHash, fotballHash, tolkKamplenke,
         ligaForKategori } from "./fotball-data.js";
import { ofteBrukt, noterPub } from "./pub-data.js";
import { maskerEpost, oktGyldig, kanFornyes, maaFornyes,
         FORNY_MARGIN } from "./konto-data.js";
import { normaliserPinNavn, gyldigPinNavn, normaliserPin, gyldigPin, PIN_MIN,
         rensLag, flettLag, sammeLag, sjekkPinBytte }
  from "./pin-data.js";
import { normaliserNavn } from "./svar-data.js";
import { initFotball, visFotball, merkFavoritter } from "./fotball.js";

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

// Et sok sorteres etter relevans hos WordPress, ikke dato. Ellers ville
// de tolv nyeste sakene som nevner laget i forbifarten fylt forste side,
// mens saken som handler om laget la pa side to. Innenfor siden legger
// rangerTreff() tittelen overst (se lib.js).
function sokParam(q) {
  if (!sokeord) return q;
  return q.replace("orderby=date", "orderby=relevance") +
    "&search=" + encodeURIComponent(sokeord);
}

function postSources(categoryId, sideNr) {
  let q = sokParam(WP_QUERY + catParam(categoryId));
  if (sideNr && sideNr > 1) q += "&page=" + sideNr;
  return sourcesFor(q);
}

// Samme vindu som feeden, men kun id og endringstidspunkt. _fields kutter
// svaret fra full brodtekst for tolv saker til noen fa hundre byte, sa
// dette er billig nok til a kjore hvert femte minutt.
const SIG_QUERY = "?per_page=12&orderby=date&order=desc&_fields=id,modified_gmt";

function signatureSources(categoryId) {
  return sourcesFor(sokParam(SIG_QUERY + catParam(categoryId)));
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
let kategorier = null;          // hentet meny, sa den kan tegnes pa nytt uten a hentes
let toppTekst = "";             // det som star i toppfeltet nar du er i nyheter
let aktivVisning = "nyheter";   // "nyheter" eller "fotball"
let fotballLiga = "eliteserien";
let fotballDel = "tabell";

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
//
// <template> parser inert, som i sanitizeHtml under, og av samme grunn.
// Et <div> ville faktisk **lastet** bildet i "<img src=… onerror=…>" — det
// skjer også i et element som aldri settes inn i dokumentet, og da fyrer
// onerror. Vi kastet innholdet rett etterpå og beholdt bare teksten, så
// koden hadde alt kjørt når vi trodde vi var ferdige med å rense.
// <template> legger innholdet i et DocumentFragment som aldri henter noe.
function stripHtml(html) {
  if (!html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return (tpl.content.textContent || "").trim();
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

// Hendelsene appen sender. Uten et statistikkskript lastet er dette en
// tom operasjon — besok telles av Netlify Analytics, som maler pa
// serveren og ikke ser noe herfra.
//
// Kallene star igjen med vilje: de er merkelapper pa det som er verdt a
// vite, og de koster ingenting sa lenge ingen lytter. Skal de samles inn
// igjen, er det ett skript i index.html og ingenting her.
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

// Messenger-brukernavnet til den som selger annonsene — det som står
// etter m.me/, og det samme som står etter facebook.com/ i profilen
// hans. Står det tomt, blir knappen ren tekst framfor en død lenke: en
// knapp som ikke går noe sted er verre enn ingen knapp.
const MESSENGER = "premern";

// **Ingen oppdiktet annonsør, og ingen spøk.** To ting har gått ut herfra,
// av samme grunn.
//
// Fram til 16. september 2026 sto NORDBANE, PADELHUSET, SPRINTA og TRIBUNE
// i feeden, tydelig merket «Reklame» og fullstendig oppfunnet (#25). Ingen
// ble lurt — men en oppdiktet annonsør i prod er en påstand om et
// samarbeid som ikke finnes, og det er nøyaktig den slags påstand appen
// ellers er nøye på å ikke fortelle.
//
// Fram til 21. september sto sju spøker om Ullevålseter, og de to første
// plassene i rotasjonen var blant dem. De var ærlige — merket «Spøk», og
// de kalte seg aldri reklame. Men **den første annonsen en leser møtte var
// en vits**, og en plass som skal selges kan ikke bruke førsteinntrykket
// på noe annet. Fjorten plasser der halvparten spøker leses som en app
// som ikke mener alvor med plassen den selger.
//
// **Merket lever videre.** `EGNE_MERKER.spok`, `.ad-spok` og reglene i
// `run.mjs` står urørt, så en vits kan legges inn igjen ved å sette
// `merke: "spok"` på en rad. Det som er borte er dataene, ikke muligheten.
//
// Nå er hver plass vår egen («Ledig plass»). Når en ekte annonse skal inn,
// får raden en `brand` og ingen `merke` — da sier den «Reklame», og
// formatet er det samme som står her.
//
// Begge tekstformatene er med, `banner` og `stripe`: de er fasongene en
// ekte annonsør kan kjøpe, og en fasong ingen bruker er en fasong ingen
// ser. Nå selger de seg selv.
//
// Rekkefølgen i lista bestemmer blandingen: plassene kommer etter hver
// fjerde sak, så to kan stå på samme skjerm. Tre like bokser etter
// hverandre leses som støy; tre ulike leses som tre plasser. Derfor
// veksler bildekortene og tekstformatene, og de tre fasongene på kortet
// — portrett, bred, høy — kommer hver for seg.
//
// Ansiktet er poenget. Det er en person man skal sende en melding til,
// ikke et skjema — og da skal man se hvem.
const ADS = [
  {
    merke: "ledig",
    format: "kort",
    form: "portrett",
    bilde: "/bilder/prem-portrett.jpg",
    bredde: 400,
    hoyde: 400,
    alt: "Prem",
    headline: "Her kunne det stått noe om deg.",
    cta: "Ta en prat med Prem"
  },
  {
    merke: "ledig",
    format: "kort",
    form: "bred",
    bilde: "/bilder/prem-bred.jpg",
    bredde: 1000,
    hoyde: 562,
    alt: "Prem",
    headline: "Vil du nå folk som leser om norsk fotball?",
    cta: "Snakk med Prem"
  },
  {
    merke: "ledig",
    format: "banner",
    headline: "Her kunne annonsen din stått.",
    cta: "Ta en prat med Prem"
  },
  {
    merke: "ledig",
    format: "kort",
    form: "hoy",
    bilde: "/bilder/prem-hoy.jpg",
    bredde: 800,
    hoyde: 1000,
    alt: "Prem",
    headline: "Se for deg merket ditt her.",
    cta: "Send Prem en melding"
  },
  {
    merke: "ledig",
    format: "stripe",
    headline: "Denne linja er til salgs.",
    sub: "Smalt format, midt i lesingen"
  },
  {
    merke: "ledig",
    format: "banner",
    headline: "Én plass, midt i det folk leser.",
    cta: "Snakk med Prem"
  },
  {
    merke: "ledig",
    format: "stripe",
    headline: "Ett hakk mindre enn et kort, ett hakk mer enn ingenting.",
    sub: "Ta en prat om plassen"
  }
];

// **Hva plassen ER står i `merke`; hvilken FASONG den har står i
// `format`.** De to var ett felt til 16. september 2026, og da kunne ikke
// en ledig plass ha bannerets fasong: «ledig» betydde både «vår egen» og
// «bildekort». Det holdt så lenge de oppdiktede annonsørene fylte de to
// tekstformatene — og i det de gikk ut (#25), sto fasongene uten noen som
// kunne bruke dem.
//
// `merke` uten treff i EGNE_MERKER er en ekte annonsør: da står det
// «Reklame», og `brand` er navnet deres.
function buildAd(ad, slot) {
  const merking = EGNE_MERKER[ad.merke];
  if (ad.format === "kort") return egenPlass(ad, merking, slot);

  const box = el("div", "ad-" + ad.format);
  box.setAttribute("role", "group");
  // Merkingen må også nå skjermlesere, ikke bare øyet — og den må si
  // sant: «ledig» er vår egen plass, ikke en annonsørs.
  box.setAttribute("aria-label", merking ? merking.lest : "Reklame fra " + ad.brand);
  const etikett = merking ? merking.merke : "Reklame";

  if (ad.format === "stripe") {
    const top = el("div", "ad-top");
    top.appendChild(el("span", "ad-label", etikett));
    // Annonsørens navn står bare når det finnes en annonsør. På vår egen
    // plass er det ingen å navngi, og «LEDIG PLASS» to ganger på samme
    // linje sier ikke mer enn én gang.
    if (ad.brand) top.appendChild(el("span", "ad-brand", ad.brand));
    box.appendChild(top);
    box.appendChild(el("p", "ad-headline", ad.headline));
    if (ad.sub) box.appendChild(el("span", "ad-sub", ad.sub));
  } else {
    box.appendChild(el("span", "ad-label", etikett));
    // Plassholder-flate. Ekte annonsemateriell settes inn her — og på vår
    // egen plass er det nettopp den flata som er varen.
    box.appendChild(el("div", "ad-creative", ad.brand || "DIN ANNONSE HER"));
    const body = el("div", "ad-body");
    body.appendChild(el("p", "ad-headline", ad.headline));
    // Vår egen plass får en ekte knapp, som bildekortene. En annonsørs
    // oppfordring er deres tekst, ikke en lenke til oss.
    if (ad.cta) body.appendChild(merking ? messengerKnapp(ad.cta) : el("span", "ad-cta", ad.cta));
    box.appendChild(body);
  }

  track("Annonse vist", { annonsor: ad.brand || etikett, plass: String(slot) });
  return box;
}

// Vår egen plass, i tre former. Innholdet er det samme og står i samme
// rekkefølge i lesingen — merket, setningen, knappen — så de tre er én
// annonse i tre fasonger, ikke tre ulike annonser.
//
// I det høye kortet ligger teksten oppå bildet; i de to andre ved siden
// av eller under det.
// De to plassene som er våre egne, og hva de kaller seg. Merket står som
// data framfor som if-er inne i tegningen: legger vi til en tredje, er
// det én linje her — og da er det umulig å legge til en plass uten å ta
// stilling til hva den sier at den er.
//
// Oppslaget går på `merke`, ikke på `format`. En plass kan være vår egen i
// hvilken som helst fasong — bildekort, banner eller stripe — og en rad
// uten `merke` er en ekte annonsør.
//
// «Spøk» er ikke pedanteri. Ullevålseter er et ekte sted, og en tulle-
// annonse merket «Reklame» ville påstått at de har kjøpt plassen. Det er
// nøyaktig løgnen appen ellers er nøye på å ikke fortelle — og vitsen
// blir ikke dårligere av at det står hva den er.
const EGNE_MERKER = {
  ledig: { merke: "Ledig plass", lest: "Ledig annonseplass" },
  spok: { merke: "Spøk", lest: "Spøk, ikke en ekte annonse" }
};

function egenPlass(ad, merking, slot) {
  const boks = el("div", "ad-ledig ad-ledig-" + ad.form);
  if (ad.merke === "spok") boks.classList.add("ad-spok");
  boks.setAttribute("role", "group");
  boks.setAttribute("aria-label", merking.lest);
  boks.appendChild(annonseBilde(ad));

  const kropp = el("div", "ad-ledig-kropp");
  if (ad.form === "hoy") kropp.classList.add("ad-ledig-overlegg");
  kropp.appendChild(el("span", "ad-label", merking.merke));
  kropp.appendChild(el("p", "ad-headline", ad.headline));
  // Oppsettet står i overskriften, poenget på linja under. Delt i to er
  // vitsen en vits; i én setning er den en opplysning.
  if (ad.sub) kropp.appendChild(el("span", "ad-sub", ad.sub));
  kropp.appendChild(messengerKnapp(ad.cta));
  boks.appendChild(kropp);

  track("Annonse vist", { annonsor: merking.merke, plass: String(slot) });
  return boks;
}

// Bildet i en av våre egne plasser. Bredden og høyden står på taggen, så
// plassen er satt av før bildet er lastet: uten dem vokser annonsen og
// dytter saken man holder på å lese nedover. Samme grunn som at været
// hentes først når en kamp åpnes.
//
// `alt` står på annonsen, ikke her. Det var «Prem» i koden så lenge alle
// bildene var av ham, og det ble feil i det øyeblikket et skilt kom inn i
// lista — en skjermleser som sier «Prem» om et treskilt er verre enn
// ingenting.
function annonseBilde(ad) {
  const bilde = el("img", "ad-ledig-bilde");
  bilde.src = ad.bilde;
  bilde.width = ad.bredde;
  bilde.height = ad.hoyde;
  bilde.alt = ad.alt;
  bilde.loading = "lazy";
  bilde.decoding = "async";
  return bilde;
}

// Messengers direktelenke er m.me/<brukernavn>. Den åpner appen om den
// er installert, og nettutgaven om ikke — ingen mellomside, ingen
// innlogging først.
//
// Uten brukernavn blir den ren tekst. En knapp som ser ut som en knapp og
// ikke går noe sted, er verre enn en setning som bare står der.
function messengerKnapp(tekst) {
  if (!MESSENGER) return el("span", "ad-cta", tekst);

  const lenke = el("a", "ad-cta", tekst + " →");
  lenke.href = "https://m.me/" + encodeURIComponent(MESSENGER);
  // Meldingen skrives i Messenger, ikke her: appen blir stående bak, og
  // rel-en hindrer at den nye fanen kan røre den.
  lenke.target = "_blank";
  lenke.rel = "noopener noreferrer";
  lenke.addEventListener("click", () => track("Annonseplass klikket"));
  return lenke;
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
        const rad = sakLenke("relatert-rad", sak, () => {
          closeDetail();
          visArtikkel(sak);
        });
        rad.appendChild(el("span", "relatert-navn", getTitle(sak)));
        rad.appendChild(timeEl(sak, "relatert-tid"));
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
  // Visningen forst: en tilbakeknapp fra fotball til nyheter skal bytte
  // fane, ikke bare lukke et eventuelt artikkeloverlegg.
  const rute = tolkFotballHash(location.hash);
  if (rute) visFane("fotball", rute.liga, rute.del);
  else if (aktivVisning === "fotball") visFane("nyheter");

  const slug = slugFraHash();
  if (!slug) {
    harPushet = false;
    closeDetail();
    return;
  }
  apneSlug(slug);
});

/* ---------- rendering ---------- */

function renderFeed(saker, opts) {
  const behold = opts && opts.behold;
  const feed = document.getElementById("feed");
  const forrigeRull = feed.scrollTop;
  feed.replaceChildren();

  // Under et sok star saken med treff i tittelen overst — ogsa som
  // toppsak. Rangeres her og ikke der dataene hentes, sa «Vis flere»
  // rangerer hele lista pa nytt og ikke bare den nye siden. Uten sok
  // loftes favorittlagene, men bare saker som handler om dem (terskel 2).
  const posts = sokeord
    ? rangerTreff(saker, sokeord)
    : rangerTreff(saker, favorittlag(), 2);

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

  // Rekkefolgen er endret, og det skal sta hvorfor. Linja er en vei til
  // tabellen, der valget gjores om.
  if (!sokeord && favorittlag().length) feed.appendChild(favorittLinje());

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

function favorittLinje() {
  const knapp = el("button", "favoritt-linje");
  knapp.type = "button";
  knapp.appendChild(el("span", "favoritt-stjerne", "★"));
  knapp.appendChild(el("span", null, listeTekst(favorittlag()) + " øverst"));
  knapp.title = "Velg lag i tabellen";
  knapp.addEventListener("click", () => settFane("fotball", fotballLiga, "tabell"));
  return knapp;
}

// Adressen en sak har. Samme form som visArtikkel() pusher, og den staar
// ETT sted: sto den begge steder, kunne kortet peke ett sted og
// historikken et annet — og da ville «kopier lenkeadresse» gitt en adresse
// appen ikke kjente igjen.
function sakHash(post) {
  return "#/sak/" + encodeURIComponent(post.slug || String(post.id));
}

// Kortene var <button> til 22. september 2026, og da fantes ikke «apne i
// ny fane», «kopier lenkeadresse» eller statuslinja som viser hvor du er
// pa vei (#146). Ruten fantes hele tiden — det var bare ingen lenke som
// bar den.
//
// **preventDefault bare pa et vanlig venstreklikk.** Ctrl, Cmd, Shift,
// midtklikk og hoyreklikk skal ga til nettleseren; fanger vi dem, har vi
// gitt lenka med den ene handa og tatt ny fane med den andre — og det var
// nettopp det som manglet.
function sakLenke(klasse, post, apne) {
  const a = el("a", klasse);
  a.href = sakHash(post);
  a.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    apne(a);
  });
  return a;
}

function buildHero(post) {
  const button = sakLenke("card-btn hero", post, (a) => visArtikkel(post, a));

  const img = getImage(post);
  if (img) button.appendChild(imageEl(img, false));

  const overlay = el("div", "hero-overlay");
  const cat = getCategory(post);
  if (cat) overlay.appendChild(el("span", "cat-pill", cat));
  overlay.appendChild(el("h2", "hero-title", getTitle(post)));
  overlay.appendChild(timeEl(post, "meta"));
  button.appendChild(overlay);
  return button;
}

function buildRow(post) {
  const button = sakLenke("card-btn row", post, (a) => visArtikkel(post, a));

  const img = getImage(post);
  button.appendChild(img ? imageEl(img, true) : el("div", "thumb-empty"));

  const body = el("div", "row-body");
  const cat = getCategory(post);
  if (cat) body.appendChild(el("span", "row-cat", cat));
  body.appendChild(el("h3", "row-title", getTitle(post)));
  body.appendChild(timeEl(post, "row-meta"));
  button.appendChild(body);
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

// `tema` er «lys», «svart» eller «system». Feltet het `svart` og var
// boolsk til 21. september 2026 — to verdier holdt sa lenge det fantes to
// valg. `temaAv()` leser begge former, sa en leser som har valgt morkt
// for beholder det. Vi skriver aldri `svart` igjen: to felt om det samme
// er to sannheter, og den gamle ville blitt staaende og lyve.
function temaAv(lagret) {
  const v = lagret || {};
  if (v.tema === "lys" || v.tema === "svart" || v.tema === "system") return v.tema;
  // Gammel form. Fraveret av feltet betyr lyst, som for.
  return v.svart ? "svart" : "lys";
}

// Hva temaet BETYR akkurat na. «system» er det eneste valget som kan
// svare ulikt fra minutt til minutt, og det er derfor dette er en
// funksjon og ikke en verdi vi lagrer: et lagret svar ville vaert riktig
// da det ble skrevet og usant da telefonen byttet.
function morktNa(tema) {
  if (tema === "svart") return true;
  if (tema !== "system") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (err) {
    // Ingen matchMedia: «folg systemet» har ingenting a folge, og lyst er
    // det appen ser ut som uten et valg.
    return false;
  }
}

function readPrefs() {
  try {
    const lagret = JSON.parse(localStorage.getItem(PREF_KEY)) || {};
    lagret.tema = temaAv(lagret);
    delete lagret.svart;
    return lagret;
  } catch (err) {
    return { tema: "lys" };
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

// `data-theme` er fortsatt bare «svart» eller ingenting. Det er med
// vilje: CSS-en har ETT sted som vet hvordan morkt ser ut, og «folg
// systemet» skal ikke bli et andre. JS regner ut HVILKET tema som
// gjelder; CSS-en far vite resultatet.
// Alternativet var en `@media (prefers-color-scheme: dark)`-blokk med de
// samme tretti variablene en gang til — og da ville et nytt token maattet
// legges inn to steder for aa gjelde begge veier.
function applyPrefs(value) {
  const root = document.documentElement;
  const tema = temaAv(value);

  if (morktNa(tema)) root.setAttribute("data-theme", "svart");
  else root.removeAttribute("data-theme");

  if (value.stor) root.setAttribute("data-font", "stor");
  else root.removeAttribute("data-font");

  // aria-current, ikke aria-pressed: dette er et valg mellom flere
  // alternativer, ikke uavhengige av- og pa-brytere. Markeringen folger
  // VALGET, ikke resultatet: staar du pa «Følg systemet» en mork kveld,
  // er det den knappen som er valgt — ikke «Mørkt», som du ikke har
  // trykket pa.
  merkSegment("temaLys", tema === "lys");
  merkSegment("temaSvart", tema === "svart");
  merkSegment("temaSystem", tema === "system");
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

/* ---------- favorittlag ---------- */

// Lagres i samme objekt som tema og skrift, og virker uten konto. Navnet
// er redaksjonens skrivemate (se fotball-data.js), sa det samme ordet gir
// treff i feeden.
//
// Er du logget inn, far kontoen en kopi (`sendLag`), og det er kontoen
// som er fasit mellom telefonene. Telefonens liste er den som tegnes —
// ogsa nar nettet er borte — og kontoen er den som flytter den.

function favorittlag() {
  return Array.isArray(prefs.lag) ? prefs.lag : [];
}

function erFavoritt(lag) {
  return favorittlag().indexOf(lag) > -1;
}

function vekslFavoritt(lag) {
  const valgt = !erFavoritt(lag);
  prefs.lag = valgt
    ? favorittlag().concat([lag])
    : favorittlag().filter((n) => n !== lag);
  savePrefs(prefs);
  track(valgt ? "Favorittlag valgt" : "Favorittlag fjernet", { lag });
  // Feeden star bak fanen. Bygg den om na, sa den er riktig nar leseren
  // kommer tilbake — men ikke over en feilmelding.
  if (hasContent) renderFeed(alleSaker, { behold: true });
  // Usendt fra trykket av, ikke fra et kall som feilet: lukkes appen i
  // pustet for sendingen, skal neste apning vite at kontoen ligger bak.
  if (kontoOkt) {
    prefs.lagUsendt = true;
    savePrefs(prefs);
    planleggLagSending();
    visKontoLag();
  }
  return valgt;
}

// Lista byttes ut av kontoen, ikke av en stjerne. Samme ombygging av
// feeden, men ingen sending tilbake: det var kontoen som sa det.
function settFavorittlag(liste) {
  const ny = rensLag(liste);
  if (sammeLag(ny, favorittlag())) return;
  prefs.lag = ny;
  savePrefs(prefs);
  if (hasContent) renderFeed(alleSaker, { behold: true });
  merkFavoritter();
  visKontoLag();
}

// Sendingen til kontoen. Et lite pust forst: tre stjerner pa rad er én
// endring for leseren, og skal vaere ett kall. Og bare ett av gangen —
// to samtidige kunne landet i feil rekkefolge, og da vant den eldste.
//
// Svikter den, star `lagUsendt` til neste gang appen kommer fram, og
// linja i kontopanelet sier det. Stjerna blir staende: valget ditt gjelder
// pa denne telefonen uansett, det er bare kopien som ikke kom fram.
let lagKlokke = null;
let lagSendes = false;
let lagIgjen = false;

function planleggLagSending() {
  if (!kontoOkt) return;
  if (lagKlokke) clearTimeout(lagKlokke);
  lagKlokke = setTimeout(() => { lagKlokke = null; sendLag(); }, 400);
}

async function sendLag() {
  if (!kontoOkt) return;
  if (lagSendes) { lagIgjen = true; return; }
  lagSendes = true;
  visKontoLag();
  try {
    if (maaFornyes(kontoOkt)) await fornyOkt();
    if (!kontoOkt) return;
    const data = await kontoKall({ handling: "lagre-lag", token: kontoOkt.token,
      lag: favorittlag() });
    // Det kontoen svarte, ikke det vi sendte. Er de ulike, har tjenesten
    // renset noe — og da er det dens versjon som finnes pa neste telefon.
    prefs.lagUsendt = false;
    if (!lagIgjen && Array.isArray(data.lag)) settFavorittlag(data.lag);
    savePrefs(prefs);
  } catch (err) {
    prefs.lagUsendt = true;
    savePrefs(prefs);
  } finally {
    lagSendes = false;
    visKontoLag();
    if (lagIgjen) { lagIgjen = false; sendLag(); }
  }
}

// Kontoens liste, slik den kom med en innlogging, en fornying eller et
// PIN-bytte. `lag` er udefinert nar kontoen aldri har lagret noen, og det
// er noe annet enn en tom liste: da er telefonens den eneste som finnes.
//
// **Forste mote flettes** (`flettLag`): ved innlogging, og forste gang en
// telefon som alt var innlogget for denne utrullingen treffer kontoen.
// Ingen av listene er feil der, og en telefon som tomte kontoen fordi den
// selv ikke hadde valgt noe, ville tatt stjernene fra den andre.
//
// **Etterpa er kontoen fasit** — unntatt nar det ligger en endring her som
// aldri kom fram (`lagUsendt`). Da vinner telefonen, for den er nyere enn
// det kontoen vet.
function mottaKontoLag(lag, vedInnlogging) {
  const kjent = Array.isArray(lag);
  if (vedInnlogging || prefs.lagPaKonto !== true) {
    const flettet = flettLag(kjent ? lag : [], favorittlag());
    settFavorittlag(flettet);
    prefs.lagPaKonto = true;
    savePrefs(prefs);
    if (!kjent || !sammeLag(flettet, lag)) sendLag();
  } else if (prefs.lagUsendt || !kjent) {
    sendLag();
  } else {
    settFavorittlag(lag);
  }
  visKontoLag();
}

// Linja i kontopanelet. Fire tilstander, og hver sier det som faktisk er
// sant akkurat na — «folger kontoen» star forst nar kontoen har svart.
function visKontoLag() {
  const linje = document.getElementById("kontoLag");
  if (!kontoOkt || kontoByttar) { linje.hidden = true; return; }
  linje.hidden = false;
  const lag = favorittlag();
  if (!lag.length && prefs.lagPaKonto === true && !prefs.lagUsendt && !lagSendes) {
    linje.textContent = "Ingen favorittlag. Velg med ☆ i tabellen.";
    return;
  }
  const hva = lag.length ? "★ " + listeTekst(lag) : "Ingen favorittlag";
  let status = " — følger kontoen.";
  if (lagSendes || lagKlokke) status = " — lagres på kontoen …";
  else if (prefs.lagUsendt) status = " — ikke lagret på kontoen ennå.";
  else if (prefs.lagPaKonto !== true) status = " — henter fra kontoen …";
  linje.textContent = hva + status;
}

// Okta lagres uten lista. Den bor i visningsvalgene; en kopi i okta ville
// vaert to sannheter om det samme, og den ene ville blitt gammel.
function utenLag(okt) {
  const kopi = Object.assign({}, okt);
  delete kopi.lag;
  delete kopi.andreUt;
  delete kopi.forsok;
  return kopi;
}

/* ---------- dine puber ---------- */

// Pubene leseren har delt fra for, lagret lokalt som favorittlagene: ett
// objekt, en nokkel, ingen konto. Den som brukes oftest star forst.

function dinePuber() {
  return ofteBrukt(prefs.puber);
}

function noterDinPub(navn) {
  prefs.puber = noterPub(prefs.puber, navn);
  savePrefs(prefs);
  track("Pub delt", { pub: String(navn).slice(0, 40) });
}

// Navnet vennene ser nar du blir med pa en kamp. Det ligger med
// visningsvalgene, ikke i okta — da star det der ogsa neste gang, uten
// et kall.
//
// Men fornavnet du logget inn med er alt det navnet: PIN-innloggingen
// ber om nyaktig det samme. Star det ingenting lagret, star derfor
// kontonavnet der ferdig, sa den som nettopp logget inn ikke skriver
// navnet sitt to ganger. Skriver hen noe annet, vinner det — det er
// lagret med vilje, og feltet er fortsatt sannheten.
function svarNavn() {
  const bruker = (kontoOkt && kontoOkt.bruker) || "";
  // Navnet hoerer til kontoen, ikke til telefonen. Uten `svarnavnFor` ble
  // det staende igjen etter en utlogging, og neste som logget inn i samme
  // nettleser skrev raden sin med forrige persons navn — to kontoer, to
  // rader, ett navn. Det ser ut som at ingen ser hverandre.
  const lagret = prefs.svarnavnFor && prefs.svarnavnFor === bruker
    ? normaliserNavn(prefs.svarnavn || "") : "";
  if (lagret) return lagret;
  return normaliserNavn((kontoOkt && kontoOkt.navn) || "");
}

function settSvarNavn(navn) {
  prefs.svarnavn = normaliserNavn(navn);
  // Hvem navnet ble skrevet av. Er det en annen som er logget inn na,
  // gjelder det ikke lenger.
  prefs.svarnavnFor = (kontoOkt && kontoOkt.bruker) || "";
  savePrefs(prefs);
}

function glemSvarNavn() {
  delete prefs.svarnavn;
  delete prefs.svarnavnFor;
  savePrefs(prefs);
}

// Et segment velger en verdi, det veksler ikke. Da kan den som allerede
// star der trykkes uten at noe skrives eller spores.
function settVisning(felt, verdi, hendelse, navn) {
  if (prefs[felt] === verdi) return;
  prefs[felt] = verdi;
  applyPrefs(prefs);
  savePrefs(prefs);
  track(hendelse, navn);
}

// Tre valg, ett felt. Lista er data framfor tre naer-identiske kall:
// en fjerde mulighet en dag er en linje her, ikke en kopi til.
[["temaLys", "lys"], ["temaSvart", "svart"], ["temaSystem", "system"]]
  .forEach(([id, tema]) => {
    document.getElementById(id).addEventListener("click", () =>
      settVisning("tema", tema, "Tema byttet", { tema }));
  });

// Bytter telefonen mellom lyst og morkt mens appen staar apen, skal
// «Folg systemet» folge med. Uten dette gjelder valget forst neste gang
// sida lastes — og et valg som heter «folg systemet» og ikke folger det,
// er en knapp som lover noe den ikke gir.
// Lytteren staar alltid paa; `applyPrefs` gjor ingenting naar temaet ikke
// er «system», sa den koster ingenting for de to andre valgene.
try {
  const systemet = window.matchMedia("(prefers-color-scheme: dark)");
  const folg = () => { if (temaAv(prefs) === "system") applyPrefs(prefs); };
  if (systemet.addEventListener) systemet.addEventListener("change", folg);
  else if (systemet.addListener) systemet.addListener(folg);
} catch (err) {
  // Ingen matchMedia: «folg systemet» svarer lyst, og gjor det stille.
}

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
  const q = document.getElementById("sokFelt").value.trim();
  startSok(q, "Sok");
});

// Ett sted for alle sok, sa et lagnavn fra tabellen oppforer seg nøyaktig
// som et sok skrevet i feltet — samme nullstilling, samme toppfelt, samme
// vei tilbake.
function startSok(q, hendelse) {
  sokeord = q;
  // Et sok gar pa tvers av kategorier. Ellers ville treffene stilltiende
  // vaert begrenset til den kategorien man tilfeldigvis sto i.
  activeCategory = null;
  lastSignature = null;
  document.getElementById("sokFelt").value = q;

  merkValgtKategori(null);
  toppTekst = q ? "Søk: " + q : "";
  // Sok gjelder nyheter. Star du i fotball, skal treffene ogsa vises.
  if (aktivVisning !== "nyheter") settFane("nyheter");
  else visToppTekst();
  track(q ? hendelse : "Sok tomt", { ord: q.slice(0, 40) });
  closeMenu();
  loadFeed();
}

/* ---------- del og installer ---------- */

const DEL_TEKST = "Sportsbibelen — siste nytt fra sportens verden";
let installasjonsvarsel = null;

// `lenke` gjor URL-en til en ekte <a> framfor tekst i et avsnitt.
// «Kopier lenken selv: https://…» sto som ren tekst, og det er nettopp
// den beskjeden som kommer NAR utklippstavla sviktet — da er teksten det
// eneste leseren har, og en URL man ikke kan trykke pa eller kopiere er
// ingen vei videre. Pa en telefon er alternativet a merke tekst i et
// 12px-avsnitt med fingeren.
// Bygget med createElement, aldri innerHTML: URL-en er var egen, men
// regelen om at fremmed HTML ikke parses star uansett, og et unntak er
// noe noen kopierer.
function visNotat(tekst, lenke) {
  settNotat(document.getElementById("actionNote"), tekst, lenke);
}

// Skriver et notat med URL-en som en ekte <a>. Delt mellom menyens
// #actionNote og artikkelens egen kvittering: begge sier det samme naar
// utklippstavla sviktet, og to kopier ville rukket aa bli uenige.
// Bygget med createElement, aldri innerHTML: URL-en er var egen, men
// regelen om at fremmed HTML ikke parses staar uansett, og et unntak er
// noe noen kopierer.
function settNotat(notat, tekst, lenke) {
  notat.textContent = tekst || "";
  if (tekst && lenke) {
    notat.appendChild(document.createTextNode(" "));
    const a = el("a", "action-note-lenke", lenke);
    a.href = lenke;
    // Egen side, sa den som leser ikke mister det hen holdt pa med.
    a.target = "_blank";
    a.rel = "noopener";
    notat.appendChild(a);
  }
  notat.hidden = !tekst;
}

function alleredeInstallert() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

function erIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Ett sted for all deling: appen fra menyen, en kamp fra fotball. Svarer
// «delt», «kopiert», «avbrutt» eller «feil», sa den som kaller kan si
// noe riktig til leseren der leseren star.
async function delTekst(data, hendelse) {
  try {
    if (navigator.share) {
      await navigator.share(data);
      track(hendelse, { metode: "deling" });
      return "delt";
    }
    // Ingen delingsmeny: legg teksten på utklippstavlen i stedet.
    await navigator.clipboard.writeText(data.text ? data.text : data.url);
    track(hendelse, { metode: "utklippstavle" });
    return "kopiert";
  } catch (err) {
    // Avbrutt deling er ikke en feil, men manglende utklippstavle er noe
    // leseren må kunne komme videre fra.
    if (err && err.name === "AbortError") return "avbrutt";
    return "feil";
  }
}

document.getElementById("shareBtn").addEventListener("click", async () => {
  const data = { title: "Sportsbibelen", text: DEL_TEKST, url: location.origin + "/" };
  const utfall = await delTekst(data, "App delt");
  // Lenka staar paa begge: nar kopieringen gikk, er den kvitteringen paa
  // HVA som ligger paa utklippstavla; nar den sviktet, er den det eneste
  // leseren har.
  if (utfall === "kopiert") visNotat("Lenken er kopiert:", data.url);
  else if (utfall === "feil") visNotat("Kopier lenken selv:", data.url);
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

/* ---------- filterbrikken i toppfeltet ---------- */

// Toppfeltet viste hva som filtrerte feeden, men ikke veien ut: et sok
// ble stande til man apnet menyen og fant «Alle saker». Na er teksten en
// knapp med kryss. I fotball er den ren tekst — ligaen er ikke et filter
// man fjerner, den byttes.
function visToppTekst() {
  const tag = document.getElementById("filterTag");

  if (aktivVisning === "fotball") {
    tag.replaceChildren(document.createTextNode(LIGAER[fotballLiga].navn));
    return;
  }
  if (!toppTekst) {
    tag.replaceChildren();
    return;
  }

  const knapp = el("button", "filter-chip");
  knapp.type = "button";
  knapp.setAttribute("aria-label", toppTekst + " — trykk for å vise alle saker");
  knapp.appendChild(el("span", "filter-navn", toppTekst));

  const kryss = el("span", "filter-kryss", "×");
  kryss.setAttribute("aria-hidden", "true");
  knapp.appendChild(kryss);

  knapp.addEventListener("click", visAlleSaker);
  tag.replaceChildren(knapp);
}

function visAlleSaker() {
  sokeord = "";
  activeCategory = null;
  lastSignature = null;
  toppTekst = "";
  document.getElementById("sokFelt").value = "";

  merkValgtKategori(null);
  visToppTekst();
  track("Filter fjernet");
  loadFeed();
}

/* ---------- visninger ---------- */

// Nyheter og fotball bytter plass i det samme kortet. Begge ligger i
// DOM-en hele tiden; det er billigere enn a bygge feeden pa nytt hver
// gang, og rulleposisjonen i den star igjen der leseren forlot den.
function settFane(visning, liga, del) {
  const adresse = visning === "fotball"
    ? fotballHash(liga || fotballLiga, del || fotballDel)
    : location.pathname + location.search;

  // pushState, ikke replaceState: tilbakeknappen skal ta deg dit du kom
  // fra, slik den gjor nar en artikkel apnes.
  if (location.href !== new URL(adresse, location.href).href) {
    history.pushState({ visning }, "", adresse);
  }
  track("Fane valgt", { fane: visning });
  visFane(visning, liga, del);
}

function visFane(visning, liga, del) {
  aktivVisning = visning;
  if (visning === "fotball") {
    fotballLiga = liga || fotballLiga;
    fotballDel = del || fotballDel;
  }

  document.getElementById("feed").hidden = visning !== "nyheter";
  document.getElementById("fotball").hidden = visning !== "fotball";

  merkFane("fanenNyheter", visning === "nyheter");
  merkFane("fanenFotball", visning === "fotball");

  visToppTekst();
  // Adressen tolkes her, ikke i modulen: ruting er app.js sin jobb. Kom
  // leseren fra en delt lenke, folger kampen med inn.
  if (visning === "fotball") visFotball(fotballLiga, fotballDel, tolkKamplenke(location.hash));

  // Menyen beskriver den visningen du star i. Star den apen nar du bytter,
  // skal innholdet folge med.
  if (document.getElementById("menuPanel").classList.contains("open")) visMeny();
}

function merkFane(id, aktiv) {
  const knapp = document.getElementById(id);
  if (aktiv) knapp.setAttribute("aria-current", "true");
  else knapp.removeAttribute("aria-current");
}

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
      kategorier = cats;
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

// Menyen er den samme uansett hvor du star.
//
// For byttet den innhold — kategorier i nyheter, ligaer i fotball — og
// det var samme knapp som ga to verdener, avhengig av en tilstand du
// ikke ser mens menyen er apen. Det leses som to menyer, og ble meldt
// som det.
//
// Ligaene er ikke borte: de byttes i #ligaVelger i selve
// fotballvisningen, der man alt star nar man skal bytte liga, og
// snarveiene pa emneradene er veien inn dit. Menyen skulle aldri vaert
// det andre stedet.
function visMeny() {
  if (kategorier) renderMenu(kategorier);
  loadMenu();
}


function renderMenu(categories) {
  const list = document.getElementById("menuList");
  list.replaceChildren();

  list.appendChild(menuEntry({ id: null, name: "Alle saker" }));
  categories.forEach((cat) => list.appendChild(menuEntry(cat)));
}

function menuEntry(cat) {
  const item = document.createElement("li");
  item.className = "menu-rad";
  const button = el("button", "menu-item");
  button.type = "button";
  button.dataset.catId = cat.id ? String(cat.id) : "";
  button.appendChild(el("span", null, cat.name || "Uten navn"));

  const treff = ligaForKategori(cat.name);

  // Saksantallet viker for snarveiene: to tall pa samme rad, der det ene
  // er en telling og det andre er knapper, blir stoy pa en telefon.
  if (typeof cat.count === "number" && !treff) {
    button.appendChild(el("span", "count", String(cat.count)));
  }

  if ((cat.id || null) === activeCategory) {
    button.setAttribute("aria-current", "true");
  }

  button.addEventListener("click", () => selectCategory(cat));
  item.appendChild(button);

  // Handler kategorien om en liga vi har data for, star tabellen og
  // kampene som snarveier pa samme rad. De er soesken til hovedknappen,
  // ikke barn: en knapp i en knapp finnes ikke, og raden ville da hatt
  // ett malpunkt som betydde tre ting.
  if (treff) item.appendChild(ligaSnarveier(treff));
  return item;
}

// «Tabell» og «Kamper» ved siden av emnet. Rekkefolgen er den samme som i
// fotballfanen, sa den som har vaert der kjenner den igjen.
function ligaSnarveier(treff) {
  const boks = el("div", "menu-snarvei");
  [["Tabell", "tabell"], ["Kamper", "neste"]].forEach(([tekst, del]) => {
    const knapp = el("button", "snarvei-knapp", tekst);
    knapp.type = "button";
    knapp.setAttribute("aria-label", tekst + " for " + treff.liga.navn);
    // Ingen stopPropagation: brikkene er soesken til emneknappen, ikke
    // barn av den, sa et trykk her passerer den aldri. Legger noen dem
    // inni knappen igjen, filtrerer feeden seg i bakgrunnen mens
    // fotballfanen apner — og da slar nettlesertesten ut.
    knapp.addEventListener("click", () => {
      settFane("fotball", treff.nokkel, del);
      closeMenu();
    });
    boks.appendChild(knapp);
  });
  return boks;
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
  toppTekst = id ? cat.name : "";
  visToppTekst();

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
  visMeny();
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

/* ---------- konto ---------- */

// Innlogging er forste steg mot a se hvem som blir med pa kampen, og mot
// at valgene dine folger deg mellom telefoner (#24) og at pubene skriver
// selv (#65). Den gjor ingenting alene enda, og det star i panelet —
// en knapp som ser ut som den gir noe, og ikke gir det, er verre enn en
// knapp som sier hva den er.
//
// Okta ligger lokalt, som visningsvalgene. Vi har ingen server som
// husker deg; vi har en tjeneste som utsteder okta, og en kopi av den
// her sa du slipper a logge inn ved hver apning.
const KONTO_KEY = "sb-konto";

// Hva innlogging er, sagt likt i begge tilstandene. Appen skal leses og
// fotballen folges uten konto — innlogging er for det som gar til noen
// andre: a dele hvor du ser kampen, og a ta med favorittlagene mellom
// telefoner. Star det ikke her, tror leseren at knappen er en port.
//
// Fornavn og PIN, ikke engangskode pa e-post: koden krever en avsender pa
// et verifisert domene, og domenet er ikke kjopt enda. E-postinnloggingen
// star komplett pa grenen `epost-innlogging`.
const KONTO_TEKST = {
  navn: "Du trenger ikke konto for å lese eller følge fotballen — alt det"
    + " virker uten. Innlogging er for å dele hvor du ser kampen, og for å"
    + " ta med favorittlagene dine mellom telefoner. Skriv fornavnet ditt:"
    + " det er det vennene ser.",
  // Den som lager en PIN her, kan ikke be om en ny. Det skal stå før den
  // tastes, ikke etter.
  ny: "PIN-en er en lett sperre mellom folk som deler en telefon, ikke ekte"
    + " sikkerhet — ingenting i appen er låst bak den. Men vi har ingen"
    + " e-post å sende deg en ny med, så skriv den to ganger, og bruk en du"
    + " ikke bruker andre steder.",
  kjent: "Skriv PIN-en du valgte. Er du ikke denne personen, bytt navn."
    + " Favorittlagene og «jeg blir med» følger kontoen, ikke telefonen.",
  // Det som skjer med de andre telefonene, sagt for det skjer. Den som
  // bytter fordi noen andre kan PIN-en, skal vite at de er ute; den som
  // bytter av andre grunner, skal ikke bli overrasket av en utlogging pa
  // nettbrettet.
  bytt: "Alle andre telefoner der du er logget inn, blir logget ut. Denne"
    + " blir stående innlogget. Vi har ingen e-post å sende en ny PIN til,"
    + " så skriv den nye to ganger.",
};

let kontoOkt = lesKonto();
let kontoOppsett = null;

// Hvilket steg panelet star pa: «navn», «ny» (navnet er ledig, PIN-en
// lages) eller «kjent» (navnet finnes, PIN-en skrives). Steget avgjor
// hva knappen heter og om «Gjenta» star der — og det er `finnes`-kallet
// som setter det, ikke noe appen gjetter.
let kontoSteg = "navn";
let kontoNavnet = "";
// Innlogget har panelet to tilstander: knappene, eller skjemaet som
// bytter PIN.
let kontoByttar = false;

function lesKonto() {
  let lagret = null;
  try {
    lagret = JSON.parse(localStorage.getItem(KONTO_KEY));
  } catch (err) {
    return null;
  }
  // Et utlopt tilgangstoken er ikke det samme som a vaere logget ut.
  // Barer okta en fornyer, er du fortsatt logget inn pa denne telefonen —
  // det er bare ferskvaren som er gammel, og den byttes uten at PIN-en
  // tastes. Ryddet vi den her, var nettopp det som gjorde at man ble
  // logget ut hver time.
  if (!oktGyldig(lagret) && !kanFornyes(lagret)) {
    try { localStorage.removeItem(KONTO_KEY); } catch (err) { /* privat modus */ }
    return null;
  }
  return lagret;
}

// Fornyelsen, og klokka som holder den i gang.
//
// Supabase gir et tilgangstoken som varer én time. Fornyes det for det
// ryker, merker ingen at det var innom; gjor vi ikke det, ba appen om
// PIN-en pa nytt hver time. Fornyeren roterer, sa svaret barer en ny som
// ma lagres i stedet for den gamle.
let fornyerKlokke = null;
let fornyerGar = null;

async function fornyOkt() {
  // Ett forsok om gangen: to samtidige ville brukt den samme fornyeren,
  // og den andre ville fatt den avvist fordi den forste nettopp brukte
  // den opp.
  if (fornyerGar) return fornyerGar;
  if (!kanFornyes(kontoOkt)) return null;

  // Eget kall framfor kontoKall: den kaster pa feil, og da forsvinner
  // forskjellen mellom «fornyeren er avvist» og «nettet blafret». Den
  // forskjellen er hele poenget — den ene skal logge deg ut, den andre
  // skal ikke rore noe.
  fornyerGar = (async () => {
    let data = null;
    try {
      const respons = await fetch("/api/konto", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          handling: "forny", fornyer: kontoOkt.fornyer, navn: kontoOkt.navn,
        }),
      });
      data = JSON.parse(await respons.text());
    } catch (err) {
      // Nettverksblaff eller uleselig svar: la okta sta. Neste apning
      // prover igjen, og til da er du fortsatt logget inn her.
      return null;
    }

    // Tjenesten svarer med okta flatt, ikke pakket inn.
    if (data && data.token) {
      // Identiteten endrer seg ikke av en fornying. Barer ikke svaret
      // bruker-id-en — den star i `user` hos Supabase, og den trenger
      // ikke folge med pa en fornying — beholdes den vi hadde. Uten den
      // vet ikke appen hvilken rad i «blir med»-lista som er din: stedet
      // star umerket, kortet sier ingenting om hvor du skal, og
      // delingsteksten mister stedet. Det var nettopp det som skjedde.
      const fornyet = utenLag(data);
      if (!fornyet.bruker && kontoOkt.bruker) fornyet.bruker = kontoOkt.bruker;
      if (!fornyet.navn && kontoOkt.navn) fornyet.navn = kontoOkt.navn;
      lagreKonto(fornyet);
      planleggFornying();
      // Fornyingen er runden der en annen telefons endring kommer hit.
      mottaKontoLag(data.lag, false);
      return fornyet;
    }
    // Bare en avvist fornyer betyr utlogget: den er brukt, trukket
    // tilbake eller utlopt, og da hjelper det ikke a prove igjen.
    if (data && data.utlogget) {
      lagreKonto(null);
      visHvem();
      tegnKonto();
    }
    return null;
  })().finally(() => { fornyerGar = null; });

  return fornyerGar;
}

// Fornyes mens appen star apen, sa et trykk etter en time ikke moter et
// dodt token.
function planleggFornying() {
  if (fornyerKlokke) clearTimeout(fornyerKlokke);
  fornyerKlokke = null;
  if (!kanFornyes(kontoOkt)) return;

  const utloper = Date.parse(kontoOkt.utloper);
  if (Number.isNaN(utloper)) return;
  // Minst et halvt minutt fram: en klokke som ringer med en gang ville
  // blitt en lokke.
  const om = Math.max(30000, utloper - FORNY_MARGIN - Date.now());
  fornyerKlokke = setTimeout(() => { fornyOkt(); }, om);
}

function lagreKonto(okt) {
  kontoOkt = okt;
  try {
    if (okt) localStorage.setItem(KONTO_KEY, JSON.stringify(okt));
    else localStorage.removeItem(KONTO_KEY);
  } catch (err) {
    // Privat modus: okta gjelder da bare denne okta i nettleseren, og
    // det er greit.
  }
}

// Hvem du er, pa hovedskjermen. «Er jeg logget inn?» skal ikke kreve at
// man apner menyen for a finne ut av det — og etter en innlogging skal
// svaret sta der med en gang, ikke bak et trykk til.
function visHvem() {
  const merke = document.getElementById("hvemTag");
  const navn = kontoOkt && (kontoOkt.navn || "");
  merke.hidden = !navn;
  merke.textContent = navn || "";
  if (navn) merke.setAttribute("aria-label", "Logget inn som " + navn + ". Åpne kontoen.");
}

function kontoSvar(tekst) {
  document.getElementById("kontoSvar").textContent = tekst || "";
}

// Menyen viser hvem du er, ikke bare at du er noen. Med PIN er det
// fornavnet — det samme navnet vennene ser i «blir med»-lista, sa de to
// ikke kan bli to ulike ting. En okt fra e-postinnloggingen kan ligge
// igjen i en telefon; da star adressen maskert, som for, fordi appen
// leses i en sofa med flere i.
//
// Utlogget tegnes ett av tre steg. Panelet er lite, sa bare det som
// hoerer til steget star der: ett felt, en knapp, en setning.
function visKonto() {
  const tekst = document.getElementById("kontoBtnTekst");
  const hvem = document.getElementById("kontoHvem");
  const navn = document.getElementById("kontoNavn");
  const pin = document.getElementById("kontoPin");
  const pin2 = document.getElementById("kontoPin2");
  const send = document.getElementById("kontoSend");
  const bytt = document.getElementById("kontoBytt");
  const ut = document.getElementById("kontoUt");
  const slett = document.getElementById("kontoSlett");
  const par = document.getElementById("kontoPar");
  const note = document.getElementById("kontoNote");
  const byttPin = document.getElementById("kontoByttPin");
  const pinSkjema = document.getElementById("kontoPinSkjema");

  visHvem();

  if (kontoOkt) {
    tekst.textContent = kontoOkt.navn || maskerEpost(kontoOkt.epost);
    hvem.hidden = true;
    navn.hidden = true;
    pin.hidden = true;
    pin2.hidden = true;
    send.hidden = true;
    bytt.hidden = true;
    par.hidden = kontoByttar;
    ut.hidden = false;
    slett.hidden = false;
    // Bytt PIN krever navnet: det er det PIN-en proves mot. En gammel okt
    // fra e-postinnloggingen har ingen PIN a bytte.
    byttPin.hidden = !kontoOkt.navn;
    pinSkjema.hidden = !kontoByttar;
    // Ingen setning her. Du trykket pa ditt eget navn — at du er logget
    // inn er ikke en nyhet, og teksten gjorde bunnen av menyen nesten
    // dobbelt sa hoy som emnelista over den. Unntaket er PIN-byttet: det
    // som skjer med de andre telefonene skal sta for du trykker.
    note.hidden = !kontoByttar;
    if (kontoByttar) note.textContent = KONTO_TEKST.bytt;
    visKontoLag();
    return;
  }

  kontoByttar = false;
  byttPin.hidden = true;
  pinSkjema.hidden = true;
  document.getElementById("kontoLag").hidden = true;

  tekst.textContent = "Logg inn";
  note.hidden = false;
  par.hidden = true;
  ut.hidden = true;
  slett.hidden = true;
  slett.dataset.sikker = "nei";
  slett.textContent = "Slett kontoen min";
  send.hidden = false;

  const paNavn = kontoSteg === "navn";
  hvem.hidden = paNavn;
  hvem.textContent = paNavn ? "" : kontoNavnet;
  navn.hidden = !paNavn;
  pin.hidden = paNavn;
  // «Gjenta» star bare nar en PIN lages. Den som skriver en PIN hen alt
  // har, skal ikke skrive den to ganger.
  pin2.hidden = kontoSteg !== "ny";
  bytt.hidden = paNavn;

  send.textContent = paNavn ? "Fortsett"
    : (kontoSteg === "ny" ? "Opprett konto" : "Logg inn");
  note.textContent = KONTO_TEKST[kontoSteg];
}

// Tilbake til navnefeltet. Bytter du navn, er ingenting av det du skrev i
// PIN-feltene lenger ditt — de tommes, sa neste navn ikke arver forrige
// PIN.
function kontoTilbake() {
  kontoSteg = "navn";
  kontoNavnet = "";
  document.getElementById("kontoPin").value = "";
  document.getElementById("kontoPin2").value = "";
  visKonto();
  kontoSvar("");
  document.getElementById("kontoNavn").focus();
}

// Oppsettet sjekkes nar panelet apnes, ikke nar leseren trykker Send:
// far du vite at innloggingen ikke er satt opp forst etter at adressen
// er skrevet inn, er skrivingen gjort til ingen nytte. Samme grep som i
// adminportalen.
async function sjekkKontoOppsett() {
  if (kontoOppsett) return kontoOppsett;
  try {
    const respons = await fetch("/api/konto", { headers: { "Accept": "application/json" } });
    kontoOppsett = JSON.parse(await respons.text());
  } catch (err) {
    return null;
  }
  if (kontoOppsett && kontoOppsett.klar === false) {
    kontoSvar("Innloggingen er ikke satt opp: " + (kontoOppsett.mangler || []).join(" og ")
      + " mangler i Netlify-miljøet.");
  }
  return kontoOppsett;
}

async function kontoKall(kropp) {
  const respons = await fetch("/api/konto", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(kropp),
  });
  let data = null;
  try {
    data = JSON.parse(await respons.text());
  } catch (err) {
    throw new Error("Uventet svar fra innloggingen.");
  }
  if (!respons.ok || !data || data.feil) {
    throw new Error(((data && data.feil) || "Innloggingen svarte " + respons.status + ".")
      + tjenestenSa(data));
  }
  return data;
}

// «Navnet eller PIN-en stemmer ikke» alene sender leseren — og den som
// satte opp tjenesten — ut på leting i et panel som ikke sier noe.
// Funksjonen bærer tjenestens egen melding i `forsok`, så den settes inn
// her, som i pubforslagene. Verken pepperet, nøkkelen eller adressen vi
// lager av navnet ligger i `forsok`.
function tjenestenSa(data) {
  const sist = ((data && data.forsok) || []).filter(Boolean).pop();
  if (!sist) return "";
  const detalj = sist.melding || sist.utfall || "";
  if (!detalj && !sist.status) return "";
  return " (" + (sist.status ? "svarte " + sist.status : "") +
    (detalj ? (sist.status ? ": " : "") + detalj : "") + ")";
}

// To steg: navnet forst, PIN-en etterpa.
//
// Hvorfor ikke ett: er navnet nytt, *lages* en PIN na, og da ma den
// gjentas — vi har ingen e-post a sende en ny kode til, sa en feiltastet
// PIN ved opprettelse ville gjort kontoen utilgjengelig og navnet brent.
// Og den som kommer tilbake skal fa «skriv PIN-en din», ikke et skjema
// som ser ut som en registrering.
async function kontoSteget() {
  if (kontoSteg === "navn") return kontoNavnSteget();
  return kontoPinSteget();
}

async function kontoNavnSteget() {
  const send = document.getElementById("kontoSend");
  const feltNavn = document.getElementById("kontoNavn");
  const navn = normaliserPinNavn(feltNavn.value);

  if (!gyldigPinNavn(navn)) {
    kontoSvar("Skriv fornavnet ditt.");
    feltNavn.focus();
    return;
  }

  send.disabled = true;
  try {
    const data = await kontoKall({ handling: "finnes", navn });
    kontoNavnet = data.navn || navn;
    kontoSteg = data.finnes ? "kjent" : "ny";
    visKonto();
    kontoSvar("");
    document.getElementById("kontoPin").focus();
  } catch (err) {
    kontoSvar(err.message);
  } finally {
    send.disabled = false;
  }
}

async function kontoPinSteget() {
  const send = document.getElementById("kontoSend");
  const feltPin = document.getElementById("kontoPin");
  const feltPin2 = document.getElementById("kontoPin2");
  const pin = normaliserPin(feltPin.value);

  if (!gyldigPin(pin)) {
    kontoSvar("PIN-en er minst " + PIN_MIN + " siffer.");
    feltPin.focus();
    return;
  }
  // Sjekken skjer her, ikke hos tjenesten: to ulike PIN-er er ikke noe
  // tjenesten kan se, og en konto laget med feil PIN er ikke til a rette
  // opp.
  if (kontoSteg === "ny" && pin !== normaliserPin(feltPin2.value)) {
    kontoSvar("De to PIN-ene er ikke like.");
    feltPin2.value = "";
    feltPin2.focus();
    return;
  }

  send.disabled = true;
  try {
    const okt = await kontoKall({ handling: "logg-inn", navn: kontoNavnet, pin });
    lagreKonto(utenLag(okt));
    mottaKontoLag(okt.lag, true);
    // PIN-en skal ikke sta igjen i feltene etterpa.
    feltPin.value = "";
    feltPin2.value = "";
    kontoSteg = "navn";
    visKonto();
    kontoSvar("Logget inn som " + (okt.navn || kontoNavnet) + ".");
    track("Logget inn");
    // Du er ferdig her. Menyen og panelet lukkes, sa du star igjen pa
    // hovedskjermen — med fornavnet ditt i toppfeltet, som er svaret pa
    // «gikk det bra?». A bli staende i et panel som ikke har mer a si,
    // er et trykk til uten grunn.
    lukkKontoPanel();
    closeMenu();
  } catch (err) {
    kontoSvar(err.message);
  } finally {
    send.disabled = false;
  }
}

// Favorittlagene blir staende pa telefonen: de virket for du logget inn,
// og de virker etter. Det som glemmes er at de har mott en konto — neste
// som logger inn her, far dem flettet inn som ved en hvilken som helst
// innlogging, og ikke skrevet over av en konto de aldri tilhorte.
function glemKontoLag() {
  delete prefs.lagPaKonto;
  delete prefs.lagUsendt;
  savePrefs(prefs);
  if (lagKlokke) clearTimeout(lagKlokke);
  lagKlokke = null;
}

function loggUt() {
  lagreKonto(null);
  glemKontoLag();
  kontoByttar = false;
  // Navnet vennene ser folger kontoen. Blir det staende, skriver neste
  // som logger inn i samme nettleser raden sin med forrige persons navn.
  glemSvarNavn();
  kontoSteg = "navn";
  kontoNavnet = "";
  document.getElementById("kontoPin").value = "";
  document.getElementById("kontoPin2").value = "";
  visKonto();
  kontoSvar("Logget ut.");
  track("Logget ut");
}

function lukkKontoPanel() {
  document.getElementById("kontoPanel").hidden = true;
  document.getElementById("kontoBtn").setAttribute("aria-expanded", "false");
}

// Fornavnet i toppfeltet er en knapp: den apner menyen med kontopanelet
// ute, sa «logg ut» og «slett kontoen» er ett trykk unna der du ser navnet.
document.getElementById("hvemTag").addEventListener("click", () => {
  lukkPinBytte();
  openMenu();
  const panel = document.getElementById("kontoPanel");
  panel.hidden = false;
  document.getElementById("kontoBtn").setAttribute("aria-expanded", "true");
  kontoSvar("");
  visKonto();
});

document.getElementById("menuLukk").addEventListener("click", closeMenu);

document.getElementById("kontoBtn").addEventListener("click", () => {
  const panel = document.getElementById("kontoPanel");
  const knapp = document.getElementById("kontoBtn");
  const apen = !panel.hidden;
  panel.hidden = apen;
  knapp.setAttribute("aria-expanded", apen ? "false" : "true");
  if (apen) return;
  lukkPinBytte();
  kontoSvar("");
  visKonto();
  sjekkKontoOppsett();
  // Star panelet pa PIN-steget fra forrige apning, er navnefeltet skjult:
  // fokus skal treffe det feltet som faktisk star der.
  if (!kontoOkt) {
    document.getElementById(kontoSteg === "navn" ? "kontoNavn" : "kontoPin").focus();
  }
});

document.getElementById("kontoSend").addEventListener("click", kontoSteget);
document.getElementById("kontoBytt").addEventListener("click", kontoTilbake);
document.getElementById("kontoUt").addEventListener("click", loggUt);

// Bytt PIN. Skjemaet tar plassen til knappene, ikke en rad til under dem:
// panelet er alt det storste i footeren.
const PIN_FELT = ["kontoPinNa", "kontoPinNy", "kontoPinNy2"];

function tomPinFelt() {
  PIN_FELT.forEach((id) => { document.getElementById(id).value = ""; });
}

// Panelet apner alltid pa knappene. Et halvutfylt PIN-skjema fra sist
// skal ikke sta og vente — og PIN-ene skal ikke ligge igjen i feltene.
function lukkPinBytte() {
  kontoByttar = false;
  tomPinFelt();
}

function settPinBytte(apen) {
  kontoByttar = apen;
  tomPinFelt();
  kontoSvar("");
  visKonto();
  if (apen) document.getElementById("kontoPinNa").focus();
}

async function byttPin() {
  if (!kontoOkt) return;
  const lagre = document.getElementById("kontoPinLagre");
  const [na, ny, ny2] = PIN_FELT.map((id) => document.getElementById(id).value);

  const feil = sjekkPinBytte(na, ny, ny2);
  if (feil) {
    kontoSvar(feil);
    // Fokus dit feilen er: den gamle, den nye, eller gjentakelsen.
    const felt = !gyldigPin(na) ? "kontoPinNa"
      : (!gyldigPin(ny) || normaliserPin(ny) === normaliserPin(na)) ? "kontoPinNy" : "kontoPinNy2";
    if (felt === "kontoPinNy2") document.getElementById(felt).value = "";
    document.getElementById(felt).focus();
    return;
  }

  lagre.disabled = true;
  try {
    const okt = await kontoKall({ handling: "bytt-pin", navn: kontoOkt.navn,
      pin: normaliserPin(na), nyPin: normaliserPin(ny) });
    // Okta byttes ut: den gamle er logget ut sammen med de andre
    // telefonene, og dette er innloggingen denne fortsetter med.
    const nyOkt = utenLag(okt);
    if (!nyOkt.bruker && kontoOkt.bruker) nyOkt.bruker = kontoOkt.bruker;
    lagreKonto(nyOkt);
    planleggFornying();
    mottaKontoLag(okt.lag, false);
    kontoByttar = false;
    tomPinFelt();
    visKonto();
    // Byttet er gjort uansett. Gikk utloggingen av de andre galt, er det
    // det som skal sta — ikke at alt gikk bra, og ikke at byttet feilet.
    kontoSvar(okt.andreUt === false
      ? "PIN-en er byttet. Men andre telefoner kan fortsatt være innlogget"
        + tjenestenSa(okt) + "."
      : "PIN-en er byttet. Andre telefoner er logget ut.");
    track("PIN byttet");
  } catch (err) {
    kontoSvar(err.message);
  } finally {
    lagre.disabled = false;
  }
}

document.getElementById("kontoByttPin").addEventListener("click", () => settPinBytte(true));
document.getElementById("kontoPinAvbryt").addEventListener("click", () => settPinBytte(false));
document.getElementById("kontoPinLagre").addEventListener("click", byttPin);
PIN_FELT.forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); byttPin(); }
  });
});

// Sletting er endelig, sa den krever to trykk: det forste sier hva som
// kommer til a skje, det andre gjor det. Ingen dialogboks — den ville
// blitt et hinder a klikke bort framfor en setning a lese.
document.getElementById("kontoSlett").addEventListener("click", async () => {
  const knapp = document.getElementById("kontoSlett");
  if (knapp.dataset.sikker !== "ja") {
    knapp.dataset.sikker = "ja";
    knapp.textContent = "Ja, slett alt. Dette kan ikke angres";
    kontoSvar("Fornavnet ditt og alle «jeg blir med» forsvinner, og navnet"
      + " blir ledig for andre. Trykk en gang til.");
    return;
  }

  knapp.disabled = true;
  try {
    await kontoKall({ handling: "slett", token: kontoOkt && kontoOkt.token });
    lagreKonto(null);
    glemKontoLag();
    glemSvarNavn();
    kontoSteg = "navn";
    kontoNavnet = "";
    document.getElementById("kontoNavn").value = "";
    document.getElementById("kontoPin").value = "";
    document.getElementById("kontoPin2").value = "";
    visKonto();
    kontoSvar("Kontoen er slettet.");
    track("Konto slettet");
  } catch (err) {
    kontoSvar(err.message);
  } finally {
    knapp.disabled = false;
  }
});
// Enter i et felt skal gjore det samme som knappen: feltene ligger ikke i
// et skjema, fordi et skjema i menyen ville sendt sokeskjemaet.
["kontoNavn", "kontoPin", "kontoPin2"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); kontoSteget(); }
  });
});

visKonto();

/* ---------- detaljvisning ---------- */

// To knapper, og det er med vilje to. De sender IKKE samme adresse, og
// forskjellen er noe leseren merker — ikke en detalj vi kan velge bort for
// dem:
//
// - **«Del saken»** sender sportsbibelen.no-adressen. Den er den eneste
//   som kan bli et kort med bilde og overskrift der den limes inn, fordi
//   en hash aldri naar en tjener. Leseren havner pa nettsiden.
// - **«Del i appen»** sender app-adressen. Den apner saken her, med
//   feeden rundt — men star naken overalt den limes inn: bare ordet
//   «Sportsbibelen», intet bilde.
//
// Regelen om at to knapper til én ting er én for mye gjelder to knapper
// som gjor det SAMME. Disse svarer pa hvert sitt sporsmal, som de to
// publistene i kampkortet: «send den til noen» og «send dem hit».
// Derfor staar folgen i knappen, ikke bare i navnet.
//
// Mangler post.link, staar «Del saken» ikke der: en knapp som ikke kan
// gjore det den heter er verre enn ingen.
function delRad(post, link) {
  const boks = el("div", "del-boks");
  const rad = el("div", "del-rad");
  const appUrl = location.origin + "/" + sakHash(post);
  const tittel = getTitle(post);

  // Kvitteringen staar HER, ikke i menyens #actionNote. Den ligger inne i
  // menypanelet, som er lukket naar en artikkel er apen — en beskjed
  // leseren aldri ville sett. Samme regel som feilmeldinga om posisjon:
  // den hoerer hjemme der handlingen skjedde.
  const notat = el("p", "del-notat");
  notat.setAttribute("role", "status");
  notat.setAttribute("aria-live", "polite");
  notat.hidden = true;

  if (link) rad.appendChild(delKnapp("Del saken", "går til sportsbibelen.no",
    { title: tittel, text: tittel, url: link }, "Sak delt", notat));

  rad.appendChild(delKnapp("Del i appen", "åpner i Sportsbibelen",
    { title: tittel, text: tittel, url: appUrl }, "Sak delt i appen", notat));

  boks.appendChild(rad);
  boks.appendChild(notat);
  return boks;
}

function delKnapp(navn, folge, data, hendelse, notat) {
  const b = el("button", "del-knapp");
  b.type = "button";
  b.appendChild(el("span", "del-navn", navn));
  b.appendChild(el("span", "del-folge", folge));
  b.addEventListener("click", async () => {
    const utfall = await delTekst(data, hendelse);
    // Delingsmenyen svarer selv, sa vi sier bare noe naar den ikke fantes.
    // Og lenka er en ekte <a>, av samme grunn som i menyen: teksten er det
    // eneste leseren har naar utklippstavla sviktet.
    settNotat(notat, utfall === "kopiert" ? "Lenken er kopiert:"
      : utfall === "feil" ? "Kopier lenken selv:" : "", data.url);
  });
  return b;
}

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

  body.appendChild(delRad(post, link));

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

// Er tokenet gammelt, fornyes det med en gang appen apnes — og ellers
// settes klokka som holder det ferskt mens appen star apen.
//
// En telefon som var innlogget for favorittlagene fulgte kontoen, har
// aldri mott kontoens liste. Den fornyes med en gang, for fornyingen er
// det som bringer lista — ellers ville panelet sagt «henter» i en time.
if (maaFornyes(kontoOkt) || (kanFornyes(kontoOkt) && prefs.lagPaKonto !== true)) fornyOkt();
else planleggFornying();

// Telefonen fryser tidtakere nar appen ligger i bakgrunnen, sa klokka
// over ringer ikke nar skjermen har vaert av i to timer. Derfor sjekkes
// det ogsa nar appen kommer fram igjen: det er nettopp da man tar den
// opp for a trykke pa noe.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (maaFornyes(kontoOkt)) fornyOkt();
  // En endring som ikke kom fram sist, prover igjen her: det er nettopp
  // da appen tas fram, og det er det linja i panelet lover.
  else if (kontoOkt && prefs.lagUsendt) sendLag();
});

initFotball(
  (liga, del) => settFane("fotball", liga, del),
  // Et lag i tabellen er en inngang til nyhetene om det laget. Sokefeltet
  // finnes allerede, sa dette koster ingen nye kall mot WordPress utover
  // det soket ville kostet uansett.
  (lag) => startSok(lag, "Lagsok"),
  { er: erFavoritt, veksle: vekslFavoritt, liste: favorittlag },
  // «Hvor ser du kampen?» gar inn i gruppechatten leseren allerede har.
  // Ingen konto, ingen lagring: chatten er vennegruppa.
  (tekst, url) => delTekst({ title: "Sportsbibelen", text: tekst, url }, "Kamp delt"),
  { liste: dinePuber, noter: noterDinPub },
  // Innlogging og navn eies av app.js (det er lagring). Modulen far tre
  // sporsmal: har du en okt, hva heter du for vennene, og husk navnet.
  { okt: () => kontoOkt, navn: svarNavn, settNavn: settSvarNavn });

document.getElementById("fanenNyheter").addEventListener("click", () => {
  if (aktivVisning !== "nyheter") settFane("nyheter");
});

document.getElementById("fanenFotball").addEventListener("click", () => {
  if (aktivVisning !== "fotball") settFane("fotball", fotballLiga, fotballDel);
});

// Apner appen pa en fotballenke, star modulen framme med en gang.
const startrute = tolkFotballHash(location.hash);
if (startrute) visFane("fotball", startrute.liga, startrute.del);

// Feeden lastes uansett: den skal sta klar bak fanen, sa et bytte tilbake
// ikke koster en ny henting.
loadFeed().then(() => {
  const slug = slugFraHash();
  if (slug) apneSlug(slug);
});

// Feeden oppdateres i bakgrunnen så lenge fanen er synlig. loadFeed lar
// innholdet stå hvis leseren har scrollet ned i listen.
setInterval(() => {
  // Star du i fotball, skal feeden vaere i fred: den er ikke synlig, og en
  // henting ville brukt nett uten at noen ser resultatet.
  if (!document.hidden && aktivVisning === "nyheter") loadFeed({ silent: true });
}, REFRESH_MS);

// Testflate. Modulen har ingen globale variabler, sa nettlesertestene
// trenger et navngitt sted a na loadFeed fra. Bevisst liten: alt annet
// testes gjennom DOM-en, slik en bruker ville rort det.
window.app = { loadFeed, renderFeed };
