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

// 3: tittelen har hele uttrykket. 2: tittelen har alle ordene, men ikke
// samlet. 1: bare utdraget eller brodteksten har det. 0: ingen treff.
export function treffScore(post, ord) {
  const uttrykk = foldTekst(ord);
  if (!uttrykk) return 0;
  const tittel = foldTekst(post && post.title && post.title.rendered);
  if (tittel.indexOf(uttrykk) > -1) return 3;
  const ordene = uttrykk.split(" ");
  if (ordene.length > 1 && ordene.every((o) => tittel.indexOf(o) > -1)) return 2;
  const kropp = foldTekst(post && post.excerpt && post.excerpt.rendered) + " " +
    foldTekst(post && post.content && post.content.rendered);
  return kropp.indexOf(uttrykk) > -1 ? 1 : 0;
}

// Hoyest score forst; like score beholder nyeste forst. Sorteringen er
// stabil, sa to saker med samme score og samme tidspunkt star som for.
// Tomt sokeord gir lista urort — da er det ingenting a rangere etter.
export function rangerTreff(posts, ord) {
  if (!ord || !foldTekst(ord)) return posts;
  return posts
    .map((post, i) => ({ post, i, score: treffScore(post, ord),
                         tid: (postDate(post) || new Date(0)).getTime() }))
    .sort((a, b) => b.score - a.score || b.tid - a.tid || a.i - b.i)
    .map((r) => r.post);
}
