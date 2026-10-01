// Rene hjelpefunksjoner uten DOM-avhengighet.
//
// De ligger her og ikke i app.js av en grunn: da kan de importeres direkte
// i Node og testes pa millisekunder, i stedet for a kreve at en hel
// nettleser starter og rendrer appen.

// Slipper kun gjennom http og https, sa en manipulert respons ikke kan
// smugle inn javascript:-URL-er i src eller href.
export function safeUrl(value, base) {
  if (!value) return null;
  const grunn = base ||
    (typeof location !== "undefined" ? location.href : "https://sportsbibelen.no/");
  try {
    const u = new URL(value, grunn);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null;
  } catch (err) {
    return null;
  }
}

// iframe er den farligste taggen vi slipper gjennom, sa src ma peke pa et
// av disse vertsnavnene. Sammenligningen gar mot hele hostname, ikke en
// delstreng: ellers ville youtube.com.angriper.no sluppet gjennom.
export const VIDEO_HOSTS = [
  "youtube.com", "www.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
  "player.vimeo.com", "vimeo.com"
];

export function videoUrl(value, base) {
  const url = safeUrl(value, base);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return VIDEO_HOSTS.indexOf(parsed.hostname.toLowerCase()) === -1 ? null : url;
  } catch (err) {
    return null;
  }
}

// WordPress leverer `date` i sidens lokale tid uten tidssone. Brukes den,
// tolkes den som leserens lokale tid og bommer med hele UTC-avviket.
// `date_gmt` er UTC og gir riktig tidspunkt for alle.
export function postDate(post) {
  const raw = post.date_gmt ? post.date_gmt + "Z" : post.date;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function timeAgo(date, naa) {
  if (!date) return "";
  const mins = Math.floor(((naa || Date.now()) - date.getTime()) / 60000);
  if (mins < 1) return "nå nettopp";
  if (mins < 60) return mins + " min siden";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "t siden";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d siden";
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

// Fanger nye saker, redigerte saker, ny rekkefolge og saker som er
// fjernet - alt som ville endret feeden.
export function feedSignature(list) {
  return list.map((post) =>
    String(post.id) + ":" + (post.modified_gmt || post.date_gmt || "")
  ).join(",");
}

// Henter artikkel-sluggen ut av en lenke til vart eget nettsted.
// WordPress-permalenker kan ha datoprefiks eller ikke, sa vi tar siste
// meningsfulle segment. Peker lenken et annet sted, eller pa forsiden,
// gir den null og lenken skal apnes utenfor appen som for.
export function internSlug(url, vertsnavn) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return null;
  }
  const vert = (parsed.hostname || "").toLowerCase().replace(/^www\./, "");
  if (vert !== vertsnavn.toLowerCase().replace(/^www\./, "")) return null;

  const deler = parsed.pathname.split("/").filter(Boolean);
  if (!deler.length) return null;

  const siste = deler[deler.length - 1];
  // Kategorisider, forfattersider og arkiv er ikke artikler.
  if (["category", "author", "tag", "page", "feed", "wp-json"].indexOf(deler[0]) !== -1) return null;
  // Rene tall er datosegmenter, ikke en slug.
  if (/^\d+$/.test(siste)) return null;
  return siste;
}


/* ---------- sok ---------- */

// WordPress-soket leter i tittel og brodtekst med samme vekt. Nevnes et lag
// bare i forbifarten i en sak om noe annet, teller det som treff pa linje
// med en sak som handler om laget. Rangeringen under legger tittelen
// overst, sa det leseren sokte etter er det som star forst.
//
// Samme mekanisme skal brukes til a lofte favorittlag i feeden (#24), sa
// den tar en liste og et ord, ikke en DOM.

// Sammenlikningsform: sma bokstaver, norske tegn foldet til ascii sa
// «Bodø» og «Bodo» er det samme ordet, HTML-tagger og entiteter fjernet.
// Titler fra WordPress kommer som HTML («Bod&#248;/Glimt»), sa uten
// foldingen ville et sok fra tabellen bommet pa sin egen tittel.
export function foldTekst(verdi) {
  return String(verdi === undefined || verdi === null ? "" : verdi)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;|[\u2013\u2014]/g, "-")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

// Kategorier og stikkord slik WordPress legger dem ved (_embed). Et lag
// som star som kategori pa saken er et sikrere tegn enn at navnet star i
// teksten, og koster ingenting a sjekke.
function termer(post) {
  const grupper = post && post._embedded && post._embedded["wp:term"];
  if (!Array.isArray(grupper)) return [];
  return grupper.flat().map((t) => foldTekst(t && t.name)).filter(Boolean);
}

// 3: tittelen har hele uttrykket, eller saken er kategorisert med det.
// 2: tittelen har alle ordene, men ikke samlet. 1: bare utdraget eller
// brodteksten har det. 0: ingen treff.
//
// Flere ord — en liste med favorittlag — gir det beste treffet av dem.
export function treffScore(post, ord) {
  if (Array.isArray(ord)) {
    return ord.reduce((best, o) => Math.max(best, treffScore(post, o)), 0);
  }
  const uttrykk = foldTekst(ord);
  if (!uttrykk) return 0;
  const tittel = foldTekst(post && post.title && post.title.rendered);
  if (tittel.indexOf(uttrykk) > -1) return 3;
  if (termer(post).indexOf(uttrykk) > -1) return 3;
  const ordene = uttrykk.split(" ");
  if (ordene.length > 1 && ordene.every((o) => tittel.indexOf(o) > -1)) return 2;
  const kropp = foldTekst(post && post.excerpt && post.excerpt.rendered) + " " +
    foldTekst(post && post.content && post.content.rendered);
  return kropp.indexOf(uttrykk) > -1 ? 1 : 0;
}

// Hoyest score forst; like score beholder nyeste forst. Sorteringen er
// stabil, sa to saker med samme score og samme tidspunkt star som for.
// Tomt sokeord gir lista urort — da er det ingenting a rangere etter.
//
// terskel er den laveste scoren som teller. Et sok vil ha alt (1): leseren
// ba om det ordet. Favorittlag vil bare ha saker som handler om laget (2):
// ellers ville en sak som nevner laget i forbifarten skjovet dagens
// toppsak nedover, uten at leseren ser hvorfor.
export function rangerTreff(posts, ord, terskel) {
  const ordene = (Array.isArray(ord) ? ord : [ord]).filter((o) => foldTekst(o));
  if (!ordene.length) return posts;
  const minst = terskel || 1;
  return posts
    .map((post, i) => {
      const score = treffScore(post, ordene);
      return { post, i, score: score >= minst ? score : 0,
               tid: (postDate(post) || new Date(0)).getTime() };
    })
    .sort((a, b) => b.score - a.score || b.tid - a.tid || a.i - b.i)
    .map((r) => r.post);
}

// Hvor mange saker rangerTreff() faktisk loftet. Samme terskel, samme
// poengsum — ett sted a regne, sa linja som sier «øverst» og lista som
// sorteres aldri kan bli uenige om hva som er lofta.
export function antallLoftet(posts, ord, terskel) {
  const ordene = (Array.isArray(ord) ? ord : [ord]).filter((o) => foldTekst(o));
  if (!ordene.length) return 0;
  const minst = terskel || 1;
  return (posts || []).filter((post) => treffScore(post, ordene) >= minst).length;
}

// «Brann», «Brann og Viking», «Brann, Viking og Molde».
export function listeTekst(navn) {
  const l = (navn || []).filter(Boolean);
  if (l.length < 2) return l.join("");
  return l.slice(0, -1).join(", ") + " og " + l[l.length - 1];
}

/* ---------- bilder: riktig størrelse, ikke originalen (#141) ---------- */

// Feeden lastet `media.source_url` — originalen, opptil 2560×1440 — til et
// bilde som vises i 76×76. WordPress legger ferdige størrelser ved hver
// fil (`media_details.sizes`), så svaret var alt i hånda; vi leste bare
// ikke det.
//
// **Nøkkelnavnene leses ikke.** «thumbnail» og «medium_large» er
// WordPress-standard, men et tema kan legge til egne («post-thumbnail»,
// «1536x1536»), og en liste over navn vi kjenner ville mangle noen. Hver
// størrelse bærer sin egen bredde, høyde og adresse, og det er dem vi
// velger på.
//
// `css` er hvor bredt bildet vises, `maks` er den største versjonen vi
// vil ha på listen — tre ganger skjermbredden er det en telefon kan bruke,
// og alt over det er bytes uten skarphet. Appen er 390 px bred også på en
// stor skjerm (`.phone`), så «hero» og «sak» deler tallene.
export const BILDE_BRUK = {
  rad:  { css: 76,  maks: 450,  sizes: "76px" },
  hero: { css: 390, maks: 1200, sizes: "(min-width: 390px) 390px, 100vw" },
  sak:  { css: 390, maks: 1200, sizes: "(min-width: 390px) 390px, 100vw" },
};

// Forholdet bredde/høyde kan avvike så mye fra originalens før en versjon
// regnes som et utsnitt. WordPress beskjærer «thumbnail» til et kvadrat, og
// et kvadrat i lista for en bred hero ville blitt valgt av nettleseren på
// feil grunnlag — den teller bare bredde.
const FORHOLD_TOLERANSE = 0.06;

function heltall(x) {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Bildet for en sak, i den formen `<img>` trenger: `{src, srcset, sizes,
// width, height}` — eller null når saken ikke har et bilde.
//
// Mangler `media_details.sizes`, er originalen svaret, som før. Et bilde
// uten størrelser er ikke et bilde som mangler.
export function bildeFor(post, bruk) {
  const oppsett = BILDE_BRUK[bruk] || BILDE_BRUK.hero;
  const emb = (post && post._embedded) || {};
  const media = emb["wp:featuredmedia"] && emb["wp:featuredmedia"][0];
  const original = safeUrl(media && media.source_url);
  if (!original) return null;

  const detaljer = (media && media.media_details) || {};
  const origB = heltall(detaljer.width);
  const origH = heltall(detaljer.height);
  const forhold = origB && origH ? origB / origH : 0;

  const liste = [];
  const sett = {};
  const sizes = detaljer.sizes && typeof detaljer.sizes === "object" ? detaljer.sizes : {};
  Object.keys(sizes).forEach((nokkel) => {
    const s = sizes[nokkel] || {};
    const url = safeUrl(s.source_url);
    const b = heltall(s.width);
    const h = heltall(s.height);
    if (!url || !b || !h || sett[url]) return;
    if (b > oppsett.maks) return;
    // Bredde i motsetning til kvadrat: et utsnitt er ikke samme bilde.
    // Raden vises som kvadrat uansett (`object-fit: cover`), så der er
    // alle forhold gode nok.
    if (bruk !== "rad" && forhold && Math.abs(b / h - forhold) / forhold > FORHOLD_TOLERANSE) return;
    sett[url] = true;
    liste.push({ url, width: b, height: h });
  });
  liste.sort((a, b) => a.width - b.width);

  if (!liste.length) {
    return { src: original, srcset: "", sizes: "", width: origB, height: origH };
  }

  // Den minste som dekker dobbel tetthet; ingen som gjør det, gir den
  // største vi har. Nettleseren velger selv blant `srcset` — `src` er det
  // den som ikke forstår `srcset` får.
  const passer = liste.find((b) => b.width >= oppsett.css * 2) || liste[liste.length - 1];
  return {
    src: passer.url,
    srcset: liste.length > 1
      ? liste.map((b) => b.url + " " + b.width + "w").join(", ") : "",
    sizes: liste.length > 1 ? oppsett.sizes : "",
    width: passer.width,
    height: passer.height,
  };
}

// `srcset` fra artikkelteksten, renset. **Alt eller ingenting:** hver
// kandidat er en adresse pluss en bredde- eller tetthetsangivelse, og hver
// adresse må være http(s). Feiler én, forkastes hele lista og `src` står
// igjen — en halv liste kunne pekt nettleseren til en adresse vi ikke har
// vurdert, og en adresse med komma i seg ville blitt kuttet i to.
export function renSrcset(verdi, base) {
  const tekst = String(verdi == null ? "" : verdi).trim();
  if (!tekst) return null;
  const ut = [];
  const deler = tekst.split(",");
  for (let i = 0; i < deler.length; i += 1) {
    const biter = deler[i].trim().split(/\s+/);
    if (biter.length < 1 || biter.length > 2) return null;
    const url = safeUrl(biter[0], base);
    if (!url) return null;
    if (biter.length === 2 && !/^(\d+w|\d+(\.\d+)?x)$/.test(biter[1])) return null;
    ut.push(biter.length === 2 ? url + " " + biter[1] : url);
  }
  return ut.length ? ut.join(", ") : null;
}

// `sizes` er en liste av mediebetingelser og lengder. Det kjører ingenting,
// men det er fritekst fra en fremmed side, så bare tegnene den trenger
// slipper gjennom.
export function renSizes(verdi) {
  const tekst = String(verdi == null ? "" : verdi).trim();
  if (!tekst || tekst.length > 200) return null;
  return /^[A-Za-z0-9\s,()%.:<>=\-+*\/]+$/.test(tekst) ? tekst : null;
}

// `width` og `height` er presentasjonstips som lar nettleseren sette av
// plass før bildet er lastet. Bare hele positive tall.
export function renMaal(verdi) {
  const tekst = String(verdi == null ? "" : verdi).trim();
  if (!/^\d{1,5}$/.test(tekst)) return null;
  const n = Number(tekst);
  return n >= 1 ? String(n) : null;
}

// Navnet appen viser for en kategori fra sportsbibelen.no. Kategorien
// «Fotball» (412 saker) er nyhetene om fotball, ikke fotballmodulen med
// tabeller og kamper, og de to het det samme i menyen. Navnet kan ikke
// endres pa sportsbibelen.no, sa appen viser sitt eget. Alt annet star som
// det kommer.
const VISNINGSNAVN = { fotball: "Fotballnyheter" };

export function kategoriVisningsnavn(navn) {
  const tekst = String(navn == null ? "" : navn);
  const nokkel = tekst.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(VISNINGSNAVN, nokkel) ? VISNINGSNAVN[nokkel] : tekst;
}

// ---------- sveip mellom nyheter og fotball ----------
//
// Beslutningene bak sveipet er rene, sa de kan males uten en finger:
// DOM-koden i app.js male bare leser koordinater og kaller dem.

export const SVEIP_KANT = 24;       // px fra skjermkanten som ikke teller som start
export const SVEIP_FORSTE = 10;     // px for fingeren har sagt hvilken vei den skal
export const SVEIP_ANDEL = 0.3;     // brokdel av bredden som er nok uten fart
export const SVEIP_FART = 0.5;      // px/ms som er nok etter 40 px
export const SVEIP_MINST = 40;      // px som ma til for at fart teller

// Er dette et vannrett sveip, et loddrett (rulling), eller for tidlig a si?
// Vannrett krever klart mer sideveis enn opp/ned: et skratt sveip er en
// rulling som skled.
export function sveipRetning(dx, dy) {
  const x = Math.abs(dx), y = Math.abs(dy);
  if (Math.max(x, y) < SVEIP_FORSTE) return "vent";
  return x > y * 1.5 ? "vannrett" : "loddrett";
}

// Hvilken visning et sveip fra `visning` leder til, eller null.
// Fingeren mot venstre apner fotballen, mot hogre tar deg tilbake — som en
// side som ligger til hogre for nyhetene.
export function sveipMal(visning, dx) {
  if (visning === "nyheter" && dx < 0) return "fotball";
  if (visning === "fotball" && dx > 0) return "nyheter";
  return null;
}

// Begynner sveipet langt nok inne fra begge kantene? iOS bruker venstre kant
// til «tilbake», og et sveip der skal vaere nettleserens.
export function sveipStartOk(x, venstre, hoyre) {
  return x - venstre >= SVEIP_KANT && hoyre - x >= SVEIP_KANT;
}

// Skal sveipet fullfores nar fingeren slippes, eller gar visningen tilbake?
// Langt nok, eller kort og raskt.
export function sveipFullfor(dx, bredde, ms) {
  const lengde = Math.abs(dx);
  if (!(bredde > 0)) return false;
  if (lengde >= bredde * SVEIP_ANDEL) return true;
  return lengde >= SVEIP_MINST && ms > 0 && lengde / ms >= SVEIP_FART;
}
