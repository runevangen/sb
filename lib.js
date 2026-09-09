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
