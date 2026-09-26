// Hva fantasy-spillene gir oss — rene funksjoner, delt av sonden i
// portalen (/api/fantasy-sonde) og testene.
//
// Ingen av API-ene vi betaler for har fantasy-data: API-Football har
// spillerstatistikk, men ingen priser, poeng eller runder, og TheSportsDB
// har ingen av delene. Fantasy Premier League har et apent API uten
// nokkel, og Eliteserien Fantasy kjorer — sa vidt vi vet — pa den samme
// plattformen. **Uoffisielt og udokumentert**, og dataene eies av ligaene.
// Sonden svarer pa hva som finnes; om vi FAR vise det til leserne, er et
// sporsmal om vilkarene, ikke om koden.
//
// Sonden spurte for dette ble skrevet ingen av dem: miljoet koden ble
// skrevet i nektet begge adressene. Feltnavnene under er de kjente fra
// FPL, og hele poenget med sonden er a se om Eliteserien svarer likt.

export const FANTASY_KILDER = [
  { nokkel: "eliteserien", navn: "Eliteserien Fantasy",
    rot: "https://fantasy.eliteserien.no" },
  { nokkel: "premier", navn: "Fantasy Premier League",
    rot: "https://fantasy.premierleague.com" },
];

// Ett kall per kilde. bootstrap-static barer spillerne, lagene og
// rundene i ett svar — et kall til ville bare sagt det samme en gang til.
export const FANTASY_STI = "/api/bootstrap-static/";

// Feltene en rad ma bare for at noe kan bli en fantasy-visning: pris,
// poeng totalt og poeng i runden. Mangler ett, er det statistikk, ikke
// fantasy.
export const FANTASY_KREVER = ["now_cost", "total_points", "event_points"];

function liste(x) {
  return Array.isArray(x) ? x.filter(Boolean) : [];
}

function tall(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Hva svaret BAR, skrevet ut. Tomt, feil form og en ekte liste skal se
// ulike ut for den som leser — de krever hver sin handling.
export function fantasyFunn(json) {
  const j = json && typeof json === "object" ? json : {};
  const spillere = liste(j.elements);
  const lag = liste(j.teams);
  const runder = liste(j.events);

  const felt = spillere.length ? Object.keys(spillere[0]) : [];
  const mangler = FANTASY_KREVER.filter((f) => felt.indexOf(f) === -1);

  const lagNavn = {};
  lag.forEach((l) => { if (l.id != null) lagNavn[l.id] = l.name || l.short_name || ""; });

  const naa = runder.find((r) => r.is_current) || null;
  const neste = runder.find((r) => r.is_next) || null;

  // Den med flest poeng: et eksempel som sier noe, ikke den forste raden,
  // som gjerne er en keeper uten minutter.
  let best = null;
  spillere.forEach((s) => {
    const p = tall(s.total_points);
    if (p === null) return;
    if (!best || p > tall(best.total_points)) best = s;
  });

  return {
    spillere: spillere.length,
    lag: lag.length,
    runder: runder.length,
    naa: naa ? (naa.name || "Runde " + naa.id) : "",
    neste: neste ? { navn: neste.name || "Runde " + neste.id,
                     frist: neste.deadline_time || "" } : null,
    felt: felt.slice(0, 16),
    mangler,
    duger: !spillere.length
      ? "NEI — ingen spillere i svaret"
      : mangler.length
        ? "NEI — mangler " + mangler.join(", ") + " på raden"
        : "JA — raden bærer pris, poeng totalt og poeng i runden",
    eksempel: best ? {
      navn: best.web_name || [best.first_name, best.second_name].filter(Boolean).join(" "),
      lag: lagNavn[best.team] || "",
      // Prisen ligger i tideler: 125 er 12,5 mill.
      pris: tall(best.now_cost) === null ? null : tall(best.now_cost) / 10,
      poeng: tall(best.total_points),
      eierandel: best.selected_by_percent != null ? String(best.selected_by_percent) : "",
    } : null,
  };
}

// Svaret som TEKST, ikke rå JSON: den som trykker skal lese en
// avgjorelse, ikke tolke et datasett.
export function fantasySondeTekst(data) {
  const ut = [];
  (data && data.kilder || []).forEach((k, i) => {
    if (i) ut.push("");
    ut.push(k.navn + " (" + k.adresse + ")");
    ut.push("  " + k.utfall);
    if (k.hvorfor) ut.push("  " + k.hvorfor);
    const f = k.funn;
    if (!f) return;
    ut.push("  spillere: " + f.spillere + " · lag: " + f.lag + " · runder: " + f.runder);
    if (f.naa) ut.push("  nå: " + f.naa);
    if (f.neste) ut.push("  neste: " + f.neste.navn + (f.neste.frist ? ", frist " + f.neste.frist : ""));
    if (f.eksempel) {
      const e = f.eksempel;
      ut.push("  flest poeng: " + e.navn + (e.lag ? " (" + e.lag + ")" : "")
        + (e.poeng !== null ? " · " + e.poeng + " poeng" : "")
        + (e.pris !== null ? " · " + String(e.pris).replace(".", ",") + " mill." : "")
        + (e.eierandel ? " · valgt av " + e.eierandel + " %" : ""));
    }
    if (f.felt.length) ut.push("  felt: " + f.felt.join(", "));
    ut.push("  DUGER: " + f.duger);
  });
  return ut.join("\n");
}
