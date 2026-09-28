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

// Feltene en toppscorerliste trenger. Toppscorer sto som et nei i
// docs/nokler-og-tokens.md: TheSportsDB krevde ett kall per spiller, rundt
// 416 for én liga mot en kvote på hundre i døgnet. bootstrap-static gir
// ALLE spillerne i ett svar — står disse to feltene på raden, er hele
// lista ett kall unna. Det er det sonden skal svare på.
export const TOPPSCORER_FELT = ["goals_scored", "assists"];

// Hvor mange med flest mål sonden viser. Tre er nok til å se om tallene
// ligner virkeligheten; en hel liste er en funksjon, ikke en sonde.
const TOPPSCORER_VIS = 3;

function liste(x) {
  return Array.isArray(x) ? x.filter(Boolean) : [];
}

function tall(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Ett sted, så eksempelet og toppscorerne aldri skriver navnet ulikt.
function spillernavn(s) {
  return s.web_name || [s.first_name, s.second_name].filter(Boolean).join(" ");
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

  // **Hvilke lag som faktisk har spillere.** Eliteserien Fantasy svarte
  // 28. september 2026 med 32 lag i en liga med 16. Tallet alene kan ikke
  // si hvorfor: 538 spillere på 16 lag er 34 per lag, omtrent som FPL (667
  // på 20), og da er det trolig 16 lag UTEN spillere — fjorårets, eller
  // plassholdere. Det er en antakelse. Navnene i hver gruppe er det som
  // avgjør den, i ett trykk, uansett hvilken vei svaret går.
  const perLag = {};
  spillere.forEach((s) => {
    if (s.team != null) perLag[s.team] = (perLag[s.team] || 0) + 1;
  });
  const lagnavnFor = (l) => l.name || l.short_name || ("id " + l.id);
  const lagMed = lag.filter((l) => perLag[l.id]).map(lagnavnFor);
  const lagUten = lag.filter((l) => !perLag[l.id]).map(lagnavnFor);

  // **Toppscorer: finnes feltene, og ser tallene riktige ut?** Sjekkes mot
  // ALLE feltene på raden, ikke de seksten som skrives ut: de første
  // handler om pris, og det var nøyaktig den fella TheSportsDB-sonden gikk
  // i — `intHomeScore` sto ikke blant feltene den viste.
  const toppscorerMangler = TOPPSCORER_FELT.filter((f) => felt.indexOf(f) === -1);
  const toppscorere = toppscorerMangler.length ? [] : spillere
    .map((s) => ({ s, mal: tall(s.goals_scored) }))
    .filter((x) => x.mal !== null && x.mal > 0)
    // Likt antall mål: flest målgivende først. En ekte toppscorerliste
    // har sine egne regler for likhet; sonden trenger bare en rekkefølge
    // som ikke hopper mellom to trykk.
    .sort((a, b) => (b.mal - a.mal) ||
      ((tall(b.s.assists) || 0) - (tall(a.s.assists) || 0)))
    .slice(0, TOPPSCORER_VIS)
    .map((x) => ({
      navn: spillernavn(x.s),
      lag: lagNavn[x.s.team] || "",
      mal: x.mal,
      malgivende: tall(x.s.assists),
    }));

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
    // Hvor mange det er i alt. Uten den leses seksten felt om pris som
    // «det er det raden har».
    feltAntall: felt.length,
    mangler,
    lagMed,
    lagUten,
    toppscorere,
    toppscorer: !spillere.length
      ? "NEI — ingen spillere i svaret"
      : toppscorerMangler.length
        ? "NEI — mangler " + toppscorerMangler.join(", ") + " på raden"
        : toppscorere.length
          ? "JA — raden bærer mål og målgivende, for alle i ett kall"
          // Feltene står der, men ingen har scoret: før første runde, eller
          // et felt som alltid er null. Begge er et nei til en liste i dag.
          : "NEI — feltene står der, men ingen har mål",
    duger: !spillere.length
      ? "NEI — ingen spillere i svaret"
      : mangler.length
        ? "NEI — mangler " + mangler.join(", ") + " på raden"
        : "JA — raden bærer pris, poeng totalt og poeng i runden",
    eksempel: best ? {
      navn: spillernavn(best),
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
    // Et funn fra en eldre tjeneste har ikke disse feltene. Da står
    // linjene ikke der, framfor å si «0 med spillere» om noe som ikke ble
    // talt.
    if (Array.isArray(f.lagMed)) {
      ut.push("  lag med spillere (" + f.lagMed.length + "): " + (f.lagMed.join(", ") || "ingen"));
      if (f.lagUten && f.lagUten.length) {
        ut.push("  lag uten spillere (" + f.lagUten.length + "): " + f.lagUten.join(", "));
      }
    }
    if (f.naa) ut.push("  nå: " + f.naa);
    if (f.neste) ut.push("  neste: " + f.neste.navn + (f.neste.frist ? ", frist " + f.neste.frist : ""));
    if (f.eksempel) {
      const e = f.eksempel;
      ut.push("  flest poeng: " + e.navn + (e.lag ? " (" + e.lag + ")" : "")
        + (e.poeng !== null ? " · " + e.poeng + " poeng" : "")
        + (e.pris !== null ? " · " + String(e.pris).replace(".", ",") + " mill." : "")
        // Komma, som prisen på samme linje. Kilden sender «66.3» som
        // streng; «12,7 mill. · valgt av 66.3 %» var to skrivemåter i
        // én setning.
        + (e.eierandel ? " · valgt av " + String(e.eierandel).replace(".", ",") + " %" : ""));
    }
    if (f.felt.length) {
      ut.push("  felt" + (f.feltAntall ? " (" + f.felt.length + " av " + f.feltAntall + ")" : "")
        + ": " + f.felt.join(", "));
    }
    ut.push("  DUGER: " + f.duger);
    if (Array.isArray(f.toppscorere) && f.toppscorere.length) {
      ut.push("  flest mål: " + f.toppscorere.map((t) =>
        t.navn + (t.lag ? " (" + t.lag + ")" : "") + " " + t.mal + " mål"
        + (t.malgivende !== null ? ", " + t.malgivende + " målgivende" : "")).join(" · "));
    }
    if (f.toppscorer) ut.push("  TOPPSCORER: " + f.toppscorer);
  });
  return ut.join("\n");
}
