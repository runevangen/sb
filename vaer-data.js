// Rene funksjoner for vaeret pa kampdagen. Ingen DOM, ingen nettverk.
//
// Kilden er MET Norway (Locationforecast 2.0). Den krever en User-Agent
// som sier hvem vi er, og det kan ikke settes fra nettleseren — derfor
// gar kallet gjennom en Netlify-funksjon, som fotballdataene.

import { normaliserLagnavn } from "./fotball-data.js";

// Stadionene, med koordinater til tre desimaler. MET vil ikke ha flere
// («to avoid blocking»), og ±100 m er mer enn nok for et varsel. Tallene
// er skrevet inn for hand og er omtrentlige; Wikidata var ikke nabar da
// lista ble laget. Nokkelen er arenanavnet normalisert; alias dekker det
// API-ene faktisk skriver.
export const ARENAER = [
  { navn: "Lerkendal", lat: 63.413, lon: 10.406, alias: ["lerkendalstadion"] },
  { navn: "Aspmyra", lat: 67.286, lon: 14.386, alias: ["aspmyrastadion"] },
  { navn: "Brann Stadion", lat: 60.365, lon: 5.357, alias: ["brannstadion"] },
  { navn: "SR-Bank Arena", lat: 58.936, lon: 5.732, alias: ["srbankarena", "vikingstadion"] },
  { navn: "Aker Stadion", lat: 62.736, lon: 7.142, alias: ["akerstadion"] },
  { navn: "Romssa Arena", lat: 69.649, lon: 18.938, alias: ["romssaarena", "alfheimstadion", "alfheim"] },
  { navn: "Intility Arena", lat: 59.914, lon: 10.829, alias: ["intilityarena", "valerengakulturogidrettspark"] },
  { navn: "Fredrikstad Stadion", lat: 59.227, lon: 10.952, alias: ["fredrikstadstadion", "nyefredrikstadstadion"] },
  { navn: "Sarpsborg Stadion", lat: 59.283, lon: 11.119, alias: ["sarpsborgstadion"] },
  { navn: "KFUM Arena", lat: 59.912, lon: 10.809, alias: ["kfumarena", "ekebergidrettspark"] },
  { navn: "Briskeby", lat: 60.797, lon: 11.072, alias: ["briskebystadion", "briskebyarena"] },
  { navn: "Nordmøre Stadion", lat: 63.111, lon: 7.730, alias: ["nordmorestadion", "kristiansundstadion"] },
  { navn: "Haugesund Stadion", lat: 59.410, lon: 5.275, alias: ["haugesundstadion", "haugesundsparebankarena"] },
  { navn: "Release Arena", lat: 59.127, lon: 10.217, alias: ["releasearena", "sandefjordarena", "komplettarena"] },
  { navn: "Bryne Stadion", lat: 58.736, lon: 5.654, alias: ["brynestadion", "jaerenstadion"] },
  { navn: "Marienlyst", lat: 59.737, lon: 10.213, alias: ["marienlyststadion"] },
  { navn: "Åråsen", lat: 59.952, lon: 11.040, alias: ["arasenstadion", "arasen"] },
  { navn: "Skagerak Arena", lat: 59.204, lon: 9.599, alias: ["skagerakarena", "oddstadion"] },
  { navn: "Color Line Stadion", lat: 62.470, lon: 6.177, alias: ["colorlinestadion", "aalesundstadion"] },
  { navn: "Nadderud", lat: 59.906, lon: 10.568, alias: ["nadderudstadion"] },
  { navn: "Sør Arena", lat: 58.142, lon: 7.999, alias: ["sorarena", "sparebankensorarena"] },
  { navn: "Consto Arena", lat: 59.750, lon: 10.021, alias: ["constoarena", "mjondalenstadion", "vassengastadion"] },
  { navn: "Extra Arena", lat: 63.427, lon: 10.534, alias: ["extraarena", "ranheimstadion", "dnbarena"] },
  { navn: "Fosshaugane", lat: 61.229, lon: 7.100, alias: ["fosshauganecampus", "fosshaugane"] },
  { navn: "Gjemselund", lat: 60.190, lon: 12.010, alias: ["gjemselundstadion"] },
  { navn: "Jessheim Stadion", lat: 60.144, lon: 11.175, alias: ["jessheimstadion"] },
  { navn: "Levanger Stadion", lat: 63.746, lon: 11.293, alias: ["levangerstadion", "moanstadion"] },
  { navn: "Egersund Idrettspark", lat: 58.452, lon: 5.995, alias: ["egersundidrettspark", "egersundstadion"] },
  { navn: "Melløs", lat: 59.428, lon: 10.680, alias: ["mellosstadion", "mellos"] },
  { navn: "Ullevaal", lat: 59.949, lon: 10.734, alias: ["ullevaalstadion", "ullevalstadion"] },
];

// Finner arenaen bak et navn slik API-ene skriver det. Ukjent navn gir
// null: da vises ingenting, framfor vaeret et annet sted.
export function arenaFor(navn) {
  const n = normaliserLagnavn(navn);
  if (!n) return null;
  for (const a of ARENAER) {
    const egne = [normaliserLagnavn(a.navn)].concat(a.alias || []);
    if (egne.some((k) => k && (n === k || n.indexOf(k) > -1))) return a;
  }
  return null;
}

// Adressen hos MET. Kun tre desimaler: flere gir ingen bedre varsel, og
// MET ber om det for a kunne cache.
export function vaerSti(arena) {
  return "/weatherapi/locationforecast/2.0/compact?lat=" + arena.lat.toFixed(3) +
    "&lon=" + arena.lon.toFixed(3);
}

// Folt temperatur (JAG/TI-formelen, den MET og yr bruker). Gjelder ved
// 10 grader eller kaldere og litt vind; ellers er den lik lufttemperaturen.
export function foltTemp(temp, vindMs) {
  const t = Number(temp);
  const v = Number(vindMs) * 3.6;   // km/t
  if (!Number.isFinite(t)) return null;
  if (!Number.isFinite(v) || t > 10 || v < 4.8) return Math.round(t);
  const k = Math.pow(v, 0.16);
  return Math.round(13.12 + 0.6215 * t - 11.37 * k + 0.3965 * t * k);
}

// Plukker timen naermest avspark ut av METs timeserie. Mer enn tre timer
// unna er ikke et varsel for kampen, og gir null.
export function tolkVarsel(json, naar) {
  const serie = json && json.properties && json.properties.timeseries;
  if (!Array.isArray(serie) || !serie.length) throw new Error("Uventet svar fra MET");
  const maal = new Date(naar).getTime();
  if (Number.isNaN(maal)) return null;
  let best = null;
  let avstand = Infinity;
  for (const p of serie) {
    const t = Date.parse(p && p.time);
    if (Number.isNaN(t)) continue;
    const d = Math.abs(t - maal);
    if (d < avstand) { avstand = d; best = p; }
  }
  if (!best || avstand > 3 * 3600 * 1000) return null;
  const data = best.data || {};
  const naa = (data.instant && data.instant.details) || {};
  const time = data.next_1_hours || data.next_6_hours || {};
  const temp = Number(naa.air_temperature);
  const vind = Number(naa.wind_speed);
  const nedbor = time.details ? Number(time.details.precipitation_amount) : NaN;
  return {
    tid: best.time,
    temp: Number.isFinite(temp) ? Math.round(temp) : null,
    vind: Number.isFinite(vind) ? Math.round(vind) : null,
    nedbor: Number.isFinite(nedbor) ? nedbor : null,
    symbol: (time.summary && time.summary.symbol_code) || null,
    folt: foltTemp(temp, vind),
  };
}

// Radet. Kort og konkret — det skal inn i en chat, ikke pa et vaerkart.
export function klerad(v) {
  if (!v || v.temp === null) return "";
  const folt = v.folt === null ? v.temp : v.folt;
  const symbol = String(v.symbol || "");
  const sno = /snow|sleet/.test(symbol);
  const regn = !sno && (/rain|drizzle/.test(symbol) || (v.nedbor !== null && v.nedbor >= 0.3));
  let rad;
  if (folt <= -5) rad = "Vinterjakke, lue og votter.";
  else if (folt <= 2) rad = "Tykk jakke og lue.";
  else if (folt <= 8) rad = "Jakke, og gjerne lue.";
  else if (folt <= 14) rad = "Lett jakke eller genser.";
  else if (folt <= 20) rad = "Genser holder.";
  else rad = "T-skjortevær.";
  if (sno) rad += " Det kan snø, ta noe som tåler det.";
  else if (regn) rad += " Ta regnjakke.";
  if (v.vind !== null && v.vind >= 10) rad += " Det blåser friskt.";
  return rad;
}

// «8°, føles som 4°. Regn. Jakke, og gjerne lue. Ta regnjakke.»
export function vaertekst(v) {
  if (!v || v.temp === null) return "";
  let s = v.temp + "°";
  if (v.folt !== null && v.folt !== v.temp) s += ", føles som " + v.folt + "°";
  s += ".";
  const symbol = String(v.symbol || "");
  if (/snow|sleet/.test(symbol)) s += " Snø.";
  else if (/rain|drizzle/.test(symbol)) s += " Regn.";
  else if (/fair|clearsky/.test(symbol)) s += " Sol.";
  const rad = klerad(v);
  return rad ? s + " " + rad : s;
}
