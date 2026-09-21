// Rene funksjoner for fotballmodulen (beta).
//
// Samme grunn som lib.js: ingen DOM, ingen nettverk, ingen lagring, sa de
// kan testes i Node pa millisekunder. Fila importeres bade av
// Netlify-funksjonen og av nettleserkoden, slik at formen pa dataene er
// definert ett sted og ikke kan gli fra hverandre.

// ---------------------------------------------------------------------
// Sporten en liga hoerer til.
//
// Alt som er fotballspesifikt i hentingen samles her, sa den generiske
// maskineriet — funksjonen, cachen, sesongvinduet, kvoteregningen — ikke
// kjenner fotball i det hele tatt. Skal handball inn en dag, er det en
// oppforing til her og ingenting i netlify/functions/fotball.mjs:
// API-Sports har en egen tjeneste per sport, pa samme konto, med samme
// header og sin egen dognkvote pa hundre.
//
// Filene heter fortsatt fotball-*. Den dagen sport nummer to kommer,
// flyttes denne tabellen og de generiske funksjonene til sport-data.js —
// a dope om fem filer na, for en sport ingen har bedt om, ville vaert a
// betale for noe vi ikke vet at vi vil ha.
export const SPORTER = {
  fotball: {
    navn: "Fotball",
    tjeneste: "API-Football",
    api: "https://v3.football.api-sports.io",
    // Miljovariabler er versalfolsomme pa Linux, og navnet er lett a
    // taste i feil skrivemate. Begge godtas, sa en riktig satt nokkel
    // ikke leses som en manglende nokkel.
    nokkelnavn: ["API_FOOTBALL_KEY", "api_football_key"],
    // Gratisnivaet dekker bare disse sesongene, og svarer «season, try
    // from 2022 to 2024» pa alt utenfor. Hver sport har sitt eget vindu.
    sesongvindu: { fra: 2022, til: 2024 },
    // Adressen og formen pa svaret er det som faktisk skiller en sport
    // fra en annen hos API-Sports. Begge er funksjonsdeklarasjoner
    // lenger nede i fila; de heises, sa referansen her er trygg.
    sti: apiSti,
    tolkTabell,
    tolkKamper,
  },
};

// Datasettet slik visningen vil ha det, uansett sport. Ren funksjon, sa
// den kan testes uten a kalle noe: det var den ene biten av formingen
// som bare fantes inne i Netlify-funksjonen.
export function tolkDatasett(sport, del, json) {
  const s = sport || SPORTER.fotball;
  if (del === "tabell") return { tabell: s.tolkTabell(json) };
  if (del === "resultater") {
    // Nyeste forst: API-et gir de siste kampene i stigende rekkefolge.
    const kamper = s.tolkKamper(json).slice().sort(
      (a, b) => String(b.dato).localeCompare(String(a.dato)));
    // Rundene i samme rekkefolge som kampene — nyeste forst. Visningen
    // trenger dem for aa kunne vise den siste runden framme og resten bak
    // en knapp; uten dem matte den regne dem ut selv, og da hadde to
    // steder svart paa «hvilke runder finnes».
    //
    // Samme form som `kommendeKamper` gir for «neste», med vilje: én
    // visning leser begge.
    const runder = [];
    kamper.forEach((k) => {
      if (k.runde && runder.indexOf(k.runde) === -1) runder.push(k.runde);
    });
    return { kamper, runde: runder[0] || "", runder };
  }
  return kommendeKamper(s.tolkKamper(json));
}

// Hele vinduet av kommende kamper, ikke bare forste runde: bade
// adminportalen og leseren skal kunne se lenger fram enn til neste helg.
// «runde» er den forste, som for, sa en eldre utrullet app fortsatt viser
// noe riktig; «runder» er alle, i rekkefolge.
export function kommendeKamper(alle) {
  const kamper = (alle || []).slice().sort(
    (a, b) => String(a.dato).localeCompare(String(b.dato)));
  const runder = [];
  kamper.forEach((k) => {
    if (k.runde && runder.indexOf(k.runde) === -1) runder.push(k.runde);
  });
  // runde er forste runde, som for: en eldre utgave av appen leser den
  // og skal fortsatt vise noe riktig.
  return { kamper, runde: runder[0] || "", runder };
}

// Sporten ligaen hoerer til. Ligaer uten sport er fotball: det var det
// eneste som fantes da feltet ble innfort, og en manglende verdi skal
// ikke bli en feil i en funksjon som kjorer i prod.
export function sportFor(liga) {
  const nokkel = (liga && liga.sport) || "fotball";
  return SPORTER[nokkel] || SPORTER.fotball;
}

export const LIGAER = {
  // sesong: "kalender" for ligaer som spilles innenfor ett ar,
  // "host-var" for dem som krysser nyttar. API-Football vil ha aret
  // sesongen startet i begge tilfeller.
  // tsdb: ligaens id hos TheSportsDB, som gir kommende kamper for
  // inneværende sesong gratis nar API-Footballs vindu ikke gjor det.
  // kategorier: navn i nyhetsmenyen som betyr denne ligaen. Navnet i
  // «navn» teller alltid med, sa lista her er bare for det som heter noe
  // annet hos redaksjonen. Tom i dag med vilje: vi vet ikke hva
  // kategoriene faktisk heter, og en oppdiktet oppforing ville sett ut
  // som en kobling som virker.
  eliteserien: { id: 103, tsdb: 4358, navn: "Eliteserien", land: "Norge", sesong: "kalender", kategorier: [] },
  premier: { id: 39, tsdb: 4328, navn: "Premier League", land: "England", sesong: "host-var", kategorier: [] },
  laliga: { id: 140, tsdb: 4335, navn: "La Liga", land: "Spania", sesong: "host-var", kategorier: [] },
  bundesliga: { id: 78, tsdb: 4331, navn: "Bundesliga", land: "Tyskland", sesong: "host-var", kategorier: [] },
  seriea: { id: 135, tsdb: 4332, navn: "Serie A", land: "Italia", sesong: "host-var", kategorier: [] },
};

// Ligaen en nyhetskategori handler om, eller null.
//
// Matcher pa navnet, foldet med samme normaliserLagnavn som lagnavnene:
// heter kategorien «Eliteserien», treffer den uten at noen har fort opp
// noe. Heter den noe annet, foeres det navnet i «kategorier» pa ligaen —
// ett sted, og det eneste stedet.
//
// Ingen treff er et helt normalt svar: «Kommentar» og «Podkast» er
// kategorier uten tabell, og da skal raden se ut som en vanlig rad.
export function ligaForKategori(navn) {
  const leit = normaliserLagnavn(navn);
  if (!leit) return null;
  const treff = Object.keys(LIGAER).find((nokkel) => {
    const liga = LIGAER[nokkel];
    if (normaliserLagnavn(liga.navn) === leit) return true;
    return (liga.kategorier || []).some((a) => normaliserLagnavn(a) === leit);
  });
  return treff ? { nokkel: treff, liga: LIGAER[treff] } : null;
}

// Slar opp en liga fra nokkelen i adressen. Ukjent nokkel gir null, sa
// hverken funksjonen eller visningen trenger a gjette.
export function ligaFor(nokkel) {
  return Object.prototype.hasOwnProperty.call(LIGAER, nokkel) ? LIGAER[nokkel] : null;
}

// Sesongtallet API-et vil ha. For host-var-ligaer horer januar 2026 til
// sesongen som startet i 2025; skillet settes i juli, som er for forste
// serierunde i de ligaene vi viser.
export function sesongFor(liga, naa) {
  const dato = naa || new Date();
  const ar = dato.getUTCFullYear();
  if (!liga || liga.sesong !== "host-var") return ar;
  return dato.getUTCMonth() >= 6 ? ar : ar - 1;
}

// Gratisnivaet dekker bare et vindu av sesonger, og svarer "season, try
// from 2022 to 2024" pa alt utenfor. Vi ber derfor om den nyeste
// sesongen abonnementet faktisk gir, framfor a vise en feilmelding
// leseren ikke kan gjore noe med.
//
// Tallene eies na av sporten: utvides abonnementet, star de i SPORTER.
// Navnet her star igjen fordi det er det testene og resten av koden
// kjenner, og fordi et fotballtall som het noe annet ville vaert en
// omdoping uten gevinst. sportFor(liga).sesongvindu er veien for den som
// ikke vet hvilken sport det gjelder.
export const SESONGVINDU = SPORTER.fotball.sesongvindu;

// Den ekte sesongen om abonnementet dekker den, ellers naermeste kant av
// vinduet. Skille mellom de to hoerer hjemme i visningen, ikke her: den
// som ser en tabell skal fa vite hvilken sesong den er fra.
export function tilgjengeligSesong(liga, naa, vindu) {
  const ramme = vindu || SESONGVINDU;
  const ekte = sesongFor(liga, naa);
  if (ekte < ramme.fra) return ramme.fra;
  if (ekte > ramme.til) return ramme.til;
  return ekte;
}

// Gratisnivaet gir 100 kall i dognet, og levetidene er prisen vi betaler
// for antall ligaer. To ligaer med tabell hver tredje time og resultater
// hver time kostet 36 kall hver — 72 av hundre, og en tredje liga ville
// sprengt taket. Fem ligaer ma derfor ned i 16 hver: tabell hver sjette
// time (4), resultater hver tredje (8), neste runde hver sjette (4).
// 5 x 16 = 80.
//
// Resultatene star fortsatt ferskest av de tre — det er dem leserne
// kommer tilbake for — men en tabell som er tre timer gammel og en som er
// seks er samme tabell mellom rundene. Skal en sjette liga inn, er det
// disse tallene som ma gi etter, ikke kvoten: enhetstesten regner det ut
// og slar ut foer det skjer.
export const LEVETID = {
  tabell: 6 * 3600,
  resultater: 3 * 3600,
  neste: 6 * 3600,
};

// Gratisnivaet gir hundre kall i dognet — **per sport**. Hver tjeneste
// hos API-Sports har sin egen konto-nokkel og sin egen bote, sa en
// handballiga stjeler ingenting fra fotballen.
export const DOGNKVOTE = 100;

// Verste tilfelle: cachen tommes akkurat nar levetiden lopet ut, hele
// dognet. Brukes av testen som vokter kvoten nar en liga legges til.
export function kallPerDogn(antallLigaer) {
  const perLiga = Object.keys(LEVETID)
    .reduce((sum, del) => sum + Math.ceil(86400 / LEVETID[del]), 0);
  return perLiga * antallLigaer;
}

// Det samme, men fordelt pa sport — som kvoten faktisk er. En liste som
// teller alle ligaer i en bote ville sagt at en handballiga sprengte
// fotballens kvote, og det gjor den ikke.
export function kallPerSport(ligaer) {
  const alle = ligaer || LIGAER;
  const ut = {};
  Object.keys(alle).forEach((navn) => {
    const sport = (alle[navn] && alle[navn].sport) || "fotball";
    ut[sport] = (ut[sport] || 0) + 1;
  });
  Object.keys(ut).forEach((sport) => { ut[sport] = kallPerDogn(ut[sport]); });
  return ut;
}

// API-Football svarer 200 ogsa nar noe er galt, og legger feilen i
// errors: tom liste nar alt er bra, et objekt med meldinger nar det ikke
// er det. En manglende nokkel ser ellers ut som en tom tabell.
export function apiFeil(json) {
  if (!json || typeof json !== "object") return "Tomt svar";
  const feil = json.errors;
  if (Array.isArray(feil)) return feil.length ? String(feil[0]).slice(0, 200) : null;
  if (feil && typeof feil === "object") {
    const nokler = Object.keys(feil);
    if (!nokler.length) return null;
    return (nokler[0] + ": " + String(feil[nokler[0]])).slice(0, 200);
  }
  return null;
}

// Plukker tabellen ut av svaret og beholder bare feltene visningen bruker.
// Uventet form skal stoppe her, i funksjonen, framfor a bli en tom tabell
// hos leseren.
export function tolkTabell(json) {
  const feil = apiFeil(json);
  if (feil) throw new Error(feil);

  const forste = Array.isArray(json.response) ? json.response[0] : null;
  const grupper = forste && forste.league && forste.league.standings;
  if (!Array.isArray(grupper) || !Array.isArray(grupper[0]) || !grupper[0].length) {
    throw new Error("Uventet svar: fant ingen tabell");
  }

  // Flere grupper betyr cupspill. Ligaene vi viser har en.
  return grupper[0].map(tabellrad);
}

// Datasettene modulen viser, i den rekkefolgen fanene star.
export const DELER = ["tabell", "resultater", "neste"];

// Fanene i visningen. «venner» star med her og ikke i DELER, fordi DELER
// er datasettene funksjonen serverer — den validerer `del` mot lista, og
// et fjerde navn der ville blitt en rute som feiler i apiSti. Vennefanen
// henter ingenting eget: den slar sammen ligaenes neste runder.
export const FANER = DELER.concat(["venner"]);

export const DEL_NAVN = {
  tabell: "Tabell",
  resultater: "Resultater",
  neste: "Kommende",
  venner: "Venner",
};

// Adressen hos API-Football for hvert datasett. Bygges her, ikke i
// funksjonen, sa den kan kontrolleres uten a kalle noe.
export function apiSti(del, liga, sesong) {
  const felles = "league=" + liga.id + "&season=" + sesong;
  if (del === "tabell") return "/standings?" + felles;
  // Resultater: HELE sesongen, ikke de ti siste.
  //
  // Det sto `&last=10` her, som er godt over én runde i Eliteserien — og
  // da sa fanen «kun siste runde», meldt 21. september 2026. Det koster
  // ingen ekstra kall aa droppe det: samme endepunkt, samme ene
  // foresporsel, bare et storre svar. `tolkKamper` skreller det ned til
  // visningsfeltene for noe caches, saa det leseren laster vokser lite.
  //
  // `next=20` paa neste staar: dét er et vindu FRAMOVER, og en sesong
  // som ikke er spilt enda er ikke en liste noen blar i.
  if (del === "resultater") return "/fixtures?" + felles + "&status=FT";
  if (del === "neste") return "/fixtures?" + felles + "&status=NS&next=20";
  return null;
}

// Kampene fra /fixtures, redusert til det visningen bruker.
export function tolkKamper(json) {
  const feil = apiFeil(json);
  if (feil) throw new Error(feil);
  if (!json || !Array.isArray(json.response)) {
    throw new Error("Uventet svar: fant ingen kamper");
  }
  return json.response.map(kamp).filter((k) => k.hjemme && k.borte);
}

function kamp(rad) {
  const info = (rad && rad.fixture) || {};
  const lag = (rad && rad.teams) || {};
  const mal = (rad && rad.goals) || {};
  const kode = (info.status && info.status.short) || "";
  const ut = {
    id: tall(info.id),
    dato: info.date || null,
    runde: tekst(rad && rad.league && rad.league.round),
    hjemme: redaksjonsnavn(tekst(lag.home && lag.home.name)),
    borte: redaksjonsnavn(tekst(lag.away && lag.away.name)),
    arena: tekst(info.venue && info.venue.name),
    malHjemme: maal(mal.home),
    malBorte: maal(mal.away),
    // AET og PEN er ferdigspilt de ogsa. Uten dem ville en cupkamp avgjort
    // etter ekstraomganger sett ut som at den ikke var spilt.
    spilt: kode === "FT" || kode === "AET" || kode === "PEN",
  };
  ut.nokkel = kampNokkel(ut);
  return ut;
}

function maal(verdi) {
  return verdi === null || verdi === undefined ? null : tall(verdi);
}

/* ---------- TheSportsDB ---------- */

// Gratisnivaet hos API-Football stopper ved SESONGVINDU. TheSportsDB gir
// tabell, siste resultater og neste kamper for inneværende sesong, sa
// fotballfanen kan vaere arets. Sett virke i prod for alle tre.
//
// Men gratisnokkelen («3») kapper svarene: fem rader i tabellen, en kamp
// i listene. Et avkortet svar ma ikke vises som om det var helt — fem
// lag under «Sesong 2026» er verre enn fjorarets fulle tabell. Funksjonen
// bruker derfor bare svar som er store nok til a vaere hele (TSDB_MINST),
// og faller ellers tilbake til API-Football. Med en betalt nokkel
// (THESPORTSDB_KEY) kommer alt: full tabell, hele runder, og dermed
// deling og vaer.
export const TSDB_MINST = { tabell: 10, resultater: 2, neste: 2 };
// To utgaver av API-et. Uten nokkel: v1 med testnokkelen «3» i adressen,
// som kapper svarene. Med nokkel (Patreon): v2, der nokkelen gar i en
// header og aldri i adressen — den skal ikke ende i en logg eller en
// cache-nokkel. v2-formen er fra dokumentasjonen, ikke fra et svar vi
// har sett; parserne under er tolerante, og funksjonen faller tilbake.
// versjon: "v2" bruker nokkelen i header, "v1" legger den i adressen
// (uten nokkel: testnokkelen «3»). Patreon-nokler finnes i begge
// varianter, sa funksjonen prover v2 forst og v1 etterpa.
export function tsdbSti(del, liga, nokkel, naa, versjon) {
  if (!liga || !liga.tsdb) return null;
  if (versjon === "v2") {
    const rot = "/api/v2/json/";
    if (del === "tabell") {
      return rot + "lookup/table/" + liga.tsdb + "/" + encodeURIComponent(tsdbSesong(liga, naa));
    }
    if (del === "resultater") return rot + "schedule/previous/league/" + liga.tsdb;
    if (del === "neste") return rot + "schedule/next/league/" + liga.tsdb;
    return null;
  }
  const rot = "/api/v1/json/" + encodeURIComponent(nokkel || "3") + "/";
  if (del === "tabell") {
    return rot + "lookuptable.php?l=" + liga.tsdb + "&s=" + encodeURIComponent(tsdbSesong(liga, naa));
  }
  if (del === "resultater") return rot + "eventspastleague.php?id=" + liga.tsdb;
  if (del === "neste") return rot + "eventsnextleague.php?id=" + liga.tsdb;
  return null;
}

export function tsdbHeadere(nokkel, versjon) {
  const h = { "Accept": "application/json" };
  if (nokkel && versjon === "v2") h["X-API-KEY"] = nokkel;
  return h;
}

// v1 legger lista i «events» og «table»; v2 bruker andre navn
// («schedule», «lookup»). Vi tar den forste lista vi finner, med de kjente
// navnene forst. null er «ingenting», ikke feil.
function forsteListe(json, navn) {
  for (const n of navn) {
    if (Array.isArray(json[n])) return json[n];
    if (json[n] === null) return [];
  }
  for (const n of Object.keys(json)) {
    if (Array.isArray(json[n])) return json[n];
  }
  return undefined;
}

// TheSportsDB skriver sesongen som «2026» for kalenderligaer og
// «2025-2026» for dem som krysser nyttar.
export function tsdbSesong(liga, naa) {
  const start = sesongFor(liga, naa);
  return liga && liga.sesong === "host-var" ? start + "-" + (start + 1) : String(start);
}

// Tabellen fra lookuptable.php, i samme form som tolkTabell gir. table er
// null nar sesongen ikke finnes hos dem — det er «ingen tabell», ikke feil,
// sa funksjonen kan ga videre til API-Football.
export function tolkTabellTsdb(json) {
  if (!json || typeof json !== "object") throw new Error("Tomt svar fra TheSportsDB");
  const liste = forsteListe(json, ["table", "lookup"]);
  if (liste === undefined) {
    if (Object.keys(json).length === 0) return [];
    throw new Error("Uventet svar fra TheSportsDB");
  }
  return liste.map(tsdbRad).filter((r) => r.lag);
}

function tsdbRad(rad) {
  const r = rad || {};
  return {
    plass: tall(r.intRank),
    lag: redaksjonsnavn(tekst(r.strTeam)),
    merke: r.strBadge || null,
    kamper: tall(r.intPlayed),
    seier: tall(r.intWin),
    uavgjort: tall(r.intDraw),
    tap: tall(r.intLoss),
    scoret: tall(r.intGoalsFor),
    sluppet: tall(r.intGoalsAgainst),
    differanse: tall(r.intGoalDifference),
    poeng: tall(r.intPoints),
  };
}

// Samme form som tolkKamper gir, sa visningen ikke vet hvor kampene kom
// fra. events er null — ikke en tom liste — nar ligaen ikke har flere.
export function tolkKamperTsdb(json, naa) {
  if (!json || typeof json !== "object") throw new Error("Tomt svar fra TheSportsDB");
  const liste = forsteListe(json, ["events", "schedule"]);
  if (liste === undefined) {
    if (Object.keys(json).length === 0) return [];
    throw new Error("Uventet svar fra TheSportsDB");
  }
  return liste.map((e) => tsdbKamp(e, naa)).filter((k) => k.hjemme && k.borte && k.dato);
}

function tsdbKamp(e, naa) {
  const rad = e || {};
  const status = tekst(rad.strStatus);
  const dato = tsdbTid(rad);
  const malHjemme = maal(rad.intHomeScore);
  const malBorte = maal(rad.intAwayScore);
  // Status er ikke alltid fylt ut. Et resultat pa en kamp som er spilt
  // etter klokka, er ogsa en spilt kamp.
  const harResultat = malHjemme !== null && malBorte !== null &&
    dato !== null && Date.parse(dato) < (naa || Date.now());
  const ut = {
    id: tall(rad.idEvent),
    dato,
    runde: rad.intRound ? "Runde " + tekst(rad.intRound) : "",
    hjemme: redaksjonsnavn(tekst(rad.strHomeTeam)),
    borte: redaksjonsnavn(tekst(rad.strAwayTeam)),
    arena: tekst(rad.strVenue),
    malHjemme,
    malBorte,
    spilt: status === "Match Finished" || status === "FT" || harResultat,
  };
  ut.nokkel = kampNokkel(ut);
  return ut;
}

// strTimestamp er UTC uten sone («2026-09-13T15:00:00»). Uten Z ville
// new Date lest den som leserens lokale tid og bommet med to timer.
function tsdbTid(rad) {
  let t = tekst(rad.strTimestamp);
  if (!t && rad.dateEvent) t = tekst(rad.dateEvent) + "T" + (tekst(rad.strTime) || "00:00:00");
  if (!t) return null;
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t += "Z";
  return Number.isNaN(Date.parse(t)) ? null : t;
}

/* ---------- deling ---------- */

// Teksten som gar inn i gruppechatten. Ren funksjon, sa den kan testes:
// den er det leseren faktisk sender, og en feil her er synlig for andre.
// «hjemme» sto her til kampkortet ble skrevet om. Na er kortet en liste
// over steder man kan dra — puber og stadion — og a se den hjemme er
// ikke et sted a mote noen. Det var ogsa det eneste svaret som ikke sa
// noe om hvor du er: «Ola blir med (hjemme)» ga vennene ingenting.
//
// Rader som alt star i basen med hvor='hjemme' faller til null her, sa
// personen fortsatt star pa lista — bare uten et sted. Det er riktig:
// hen sa aldri at hen skulle noe sted.
export const HVOR = {
  pub: "på pub",
  stadion: "på stadion",
};

// Lengste stedsnavn vi tar imot — bade i feltet og fra en delt lenke.
// Et navn lenger enn dette er ikke et pubnavn.
export const STED_MAKS = 60;

// «på Andy\'s Pub», «hjemme», «på Brann Stadion». Ett sted, fordi to
// steder sier det ulikt til slutt: teksten som deles og linja mottakeren
// leser skal beskrive det samme stedet med de samme ordene.
export function stedtekst(kamp, hvor, sted) {
  if (hvor === "pub" && sted) return "på " + sted;
  if (hvor === "stadion" && (sted || (kamp && kamp.arena))) {
    return "på " + (sted || kamp.arena);
  }
  return HVOR[hvor] || "";
}

export function delingstekst(kamp, hvor, sted, url, vaer) {
  const naar = tidstekst(kamp && kamp.dato);
  const hvorTekst = stedtekst(kamp, hvor, sted);
  return "⚽ " + kamp.hjemme + " – " + kamp.borte + (naar ? ", " + naar : "") + "." +
    (hvorTekst ? " Jeg ser den " + hvorTekst + "." : "") +
    (vaer ? " Været ved avspark: " + vaer : "") +
    " Hvor ser du?" + (url ? " " + url : "");
}

// «søndag 13. sep. kl. 17.00» i norsk tid, uansett hvor leseren er.
// Kampene spilles i Norge, og det er den tiden avtalen gjelder.
export function tidstekst(iso) {
  const dato = iso ? new Date(iso) : null;
  if (!dato || Number.isNaN(dato.getTime())) return "";
  const dag = dato.toLocaleDateString("nb-NO",
    { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Oslo" });
  const kl = dato.toLocaleTimeString("nb-NO",
    { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
  return dag + " kl. " + kl;
}

// Kampene framover, eldste forst — hele vinduet, ikke bare forste runde.
//
// Visningen viste én runde til 14. september 2026. Det var riktig helt til
// runden var nesten ferdigspilt: da sto det én kamp igjen i fanen, og
// ingenting om helgen etter. Meldt fra faktisk bruk med de ordene — «dumt
// at man ser kun en kamp naar det er slutten av en runde».
//
// Kildene gir tjue kamper uansett (`next=20`, TheSportsDBs `schedule/next`),
// sa dette koster ingenting pa dognkvoten: det er det samme svaret, bare
// uten at halvparten kastes i nettleseren.
export function kampeneFramover(kamper) {
  return (kamper || []).slice().sort(
    (a, b) => String(a.dato).localeCompare(String(b.dato)));
}

// Ruting for modulen: #/fotball/<liga>/<del>, begge valgfrie. Ukjente ledd
// faller tilbake til standard i stedet for a gi en tom visning, sa en
// gammel eller klippet lenke fortsatt apner noe.
export function tolkFotballHash(hash) {
  const m = String(hash || "").match(/^#\/fotball(?:\/([^/?#]+))?(?:\/([^/?#]+))?/);
  if (!m) return null;

  const ledd = [m[1], m[2]].filter(Boolean).map(decodeURIComponent);
  let liga = "eliteserien";
  let del = "tabell";

  for (const bit of ledd) {
    if (ligaFor(bit)) liga = bit;
    else if (FANER.indexOf(bit) !== -1) del = bit;
  }
  return { liga, del };
}

export function fotballHash(liga, del) {
  return "#/fotball/" + encodeURIComponent(liga) + "/" + encodeURIComponent(del);
}

/* ---------- lenka til en enkelt kamp ---------- */

// Delingslenka pekte forst pa hele runden: den som trykket landet i en
// liste pa ti kamper og matte finne igjen den det gjaldt — uten sted og
// uten vaer. Kampen, svaret og stedet star derfor i en sporring etter
// hashen, ikke som nye ledd i stien: tolkFotballHash kjenner igjen ledd
// pa innhold, og en kamp-id ligner verken pa en liga eller en del. En
// eldre utgave av appen ser bare #/fotball/<liga>/neste og apner runden
// som for, sa en lenke som allerede er sendt fortsetter a virke.
export function kamplenke(liga, kamp, hvor, sted) {
  const sok = new URLSearchParams();
  // Nokkelen, ikke kildens id: lenka skal apne den samme kampen ogsa hos
  // en mottaker som far runden fra den andre kilden.
  const id = kamp ? (kamp.nokkel || kampNokkel(kamp) || (kamp.id == null ? "" : kamp.id)) : "";
  if (id) sok.set("kamp", String(id));
  if (HVOR[hvor]) sok.set("hvor", hvor);
  // Stedet folger begge svarene na, ikke bare puben: stadion er et sted
  // pa linje med pubene, og «på Lerkendal» sier mer enn «på stadion».
  if (HVOR[hvor] && sted) sok.set("sted", String(sted).slice(0, STED_MAKS));
  const hale = sok.toString();
  return fotballHash(liga, "neste") + (hale ? "?" + hale : "");
}

// Bare kamp-id-en ma vaere der: et sted uten kamp er ingenting a peke pa.
// «hvor» valideres mot de tre svarene vi kjenner, og stedet kappes som i
// feltet — det kommer fra en adresse hvem som helst kan skrive.
export function tolkKamplenke(hash) {
  const rute = tolkFotballHash(hash);
  if (!rute) return null;
  const skille = String(hash).indexOf("?");
  if (skille === -1) return null;

  const sok = new URLSearchParams(String(hash).slice(skille + 1));
  const id = sok.get("kamp");
  if (!id) return null;

  const hvor = sok.get("hvor");
  return {
    liga: rute.liga,
    kampId: id.slice(0, STED_MAKS),
    hvor: HVOR[hvor] ? hvor : null,
    sted: (sok.get("sted") || "").trim().slice(0, STED_MAKS),
  };
}

// Linja over kampen nar leseren kom hit fra en delt lenke. «Noen», ikke
// et navn: vi vet ikke hvem som delte, og et gjettet navn ville vaert
// verre enn a si det som det er.
export function invitasjonstekst(kamp, hvor, sted) {
  const hvorTekst = stedtekst(kamp, hvor, sted);
  return hvorTekst
    ? "Delt med deg: noen ser kampen " + hvorTekst + "."
    : "Delt med deg.";
}

/* ---------- lagnavn ---------- */

// API-Football skriver lagnavn uten norske bokstaver: "Bodo/Glimt",
// "Tromso", "Lillestrom". Redaksjonen skriver dem riktig. Sendes API-ets
// form rett inn i nyhetssoket, gir det null treff — og det ser ut som at
// det ikke finnes saker om laget.
//
// Nokkelen er navnet normalisert: sma bokstaver, norske tegn foldet til
// ascii, alt annet enn bokstaver og tall fjernet. Da treffer bade
// "Bodo/Glimt", "Bodø/Glimt" og "Bodo Glimt" samme rad, og lista er
// robust mot at API-et endrer skrivemate. Ukjente navn gar uendret
// gjennom. Kun lag der API-ets form faktisk avviker star her.
const REDAKSJONSNAVN = {
  bodoglimt: "Bodø/Glimt",
  tromso: "Tromsø",
  lillestrom: "Lillestrøm",
  stromsgodset: "Strømsgodset",
  valerenga: "Vålerenga",
  mjondalen: "Mjøndalen",
  stabaek: "Stabæk",
};

export function normaliserLagnavn(navn) {
  return String(navn || "")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
    .replace(/[^a-z0-9]/g, "");
}

// Kampens egen nokkel, ikke kildens id.
//
// id-en pa en kamp er info.id fra API-Football eller idEvent fra
// TheSportsDB — to helt ulike tallrekker skrevet inn i samme kolonne. Og
// kilden byttes av seg selv: TheSportsDB sporres forst og faller tilbake
// til API-Football nar den svikter eller svarer for kort (TSDB_MINST),
// kant-cachen holder i tre timer, og en utrulling tommer den. Ingen av
// delene er noe leseren gjor.
//
// Nar kilden byttet, ble hver eneste lagrede rad usynlig: kampen fantes,
// raden fantes, men id-en den ble skrevet under stemte ikke med id-en
// runden viste. Meldt fra prod 14. september 2026 — og beviset sto i
// basen. Samme person, samme pub, to rader fem timer fra hverandre:
// skrivingen er en upsert mot (kamp_id, bruker), sa to rader er to
// id-er, ikke to kamper.
//
// Nokkelen er derfor noe ved kampen selv: dagen og de to lagene.
// Lagnavnene er alt forent pa tvers av kildene av redaksjonsnavn() og
// normaliserLagnavn() — de finnes nettopp fordi de to skriver
// «Bodo/Glimt» ulikt — sa mekanismen var der hele tiden, den var bare
// aldri brukt pa identiteten.
//
// Dagen regnes i UTC fra det samme tidspunktet begge kildene oppgir.
// TheSportsDB mangler av og til klokkeslettet og faller til midnatt;
// det holder seg innenfor samme dag for kamper i disse ligaene. Ligaen
// star ikke i nokkelen: to lag moter ikke hverandre to ganger pa én dag,
// og et liganavn de to skriver ulikt ville bare flyttet problemet.
export function kampNokkel(kamp) {
  if (!kamp) return "";
  const hjemme = normaliserLagnavn(redaksjonsnavn(String(kamp.hjemme || "")));
  const borte = normaliserLagnavn(redaksjonsnavn(String(kamp.borte || "")));
  const tid = Date.parse(kamp.dato);
  if (!hjemme || !borte || Number.isNaN(tid)) return "";
  return new Date(tid).toISOString().slice(0, 10) + "-" + hjemme + "-" + borte;
}

// En gyldig kamp-id. Nye er nokler («2026-09-14-bodoglimt-sandefjord»),
// gamle er tall — og begge slipper gjennom, for en delt lenke som alt er
// sendt baerer den gamle formen og skal fortsatt apne kampen.
//
// Tegnsettet er smalt med vilje: verdien gar inn i en PostgREST-liste
// (`kamp_id=in.(...)`), der komma og parentes ville betydd noe annet enn
// tegn i et navn.
export function gyldigKampId(verdi) {
  return /^[a-z0-9-]{1,64}$/.test(String(verdi == null ? "" : verdi));
}

export function redaksjonsnavn(navn) {
  const nokkel = normaliserLagnavn(navn);
  return Object.prototype.hasOwnProperty.call(REDAKSJONSNAVN, nokkel)
    ? REDAKSJONSNAVN[nokkel]
    : navn;
}

function tabellrad(rad) {
  const alle = (rad && rad.all) || {};
  const mal = alle.goals || {};
  return {
    plass: tall(rad && rad.rank),
    // Oversettes her, i det ene stedet dataene formes, sa bade tabellen,
    // kamplistene og soket ser samme navn.
    lag: redaksjonsnavn(tekst(rad && rad.team && rad.team.name)),
    merke: (rad && rad.team && rad.team.logo) || null,
    kamper: tall(alle.played),
    seier: tall(alle.win),
    uavgjort: tall(alle.draw),
    tap: tall(alle.lose),
    scoret: tall(mal.for),
    sluppet: tall(mal.against),
    differanse: tall(rad && rad.goalsDiff),
    poeng: tall(rad && rad.points),
  };
}

function tall(verdi) {
  const n = Number(verdi);
  return Number.isFinite(n) ? n : 0;
}

// Lagnavn havner i DOM som tekst, men lengden kuttes her: et manipulert
// eller uventet langt navn skal ikke kunne sprenge tabellraden.
function tekst(verdi) {
  return String(verdi === undefined || verdi === null ? "" : verdi).slice(0, 40);
}

// ---------- kanalen som sender ligaen ----------

// Kanalen leseren skal se, eller null. Gir bare ut rader der bade kilde
// og sjekket star — samme regel som kontaktFor() i pub-data.js, og av
// samme grunn: en feil kanal er verre enn ingen. Leseren kjoper enten et
// abonnement hen ikke trenger, eller gar glipp av kampen fordi vi sa
// feil sted.
//
// Ukjent liga gir null, ikke feil kanal. Det er samme valg som ukjent
// arena i vaer-data.js: ingenting er et riktig svar, noe galt er ikke.
export function kanalFor(liga, kanaler) {
  const rad = kanaler && liga ? kanaler[liga] : null;
  if (!rad || !rad.kanal || !rad.kilde || !rad.sjekket) return null;
  return { kanal: rad.kanal, kilde: rad.kilde, sjekket: rad.sjekket };
}

// Vokter formen pa KANALER, og kjores av unit.mjs mot den EKTE fila, som
// sjekkPubliste og sjekkKontaktliste. En feilskrevet rad skal sla ut i
// testene framfor i appen.
//
// Den viktigste regelen her er den siste: star det et kanalnavn, MAA det
// staa en kilde og en dato. Da er det umulig a foere opp en kanal uten a
// si hvor den kommer fra og naar noen sa den — og en tom rad er et
// gyldig, aerlig svar.
export function sjekkKanalliste(kanaler, ligaer) {
  if (!kanaler || typeof kanaler !== "object") return ["Kanalene er ikke et oppslag"];
  const kjent = ligaer ? Object.keys(ligaer) : [];
  const feil = [];
  Object.keys(kanaler).forEach((liga) => {
    const rad = kanaler[liga];
    if (kjent.length && kjent.indexOf(liga) === -1) feil.push(liga + ": ukjent liga");
    if (!rad || typeof rad !== "object") { feil.push(liga + ": ikke et objekt"); return; }
    Object.keys(rad).forEach((felt) => {
      if (["kanal", "kilde", "sjekket"].indexOf(felt) === -1) {
        feil.push(liga + " / " + felt + ": ukjent felt");
      }
    });
    if (rad.kanal !== null && typeof rad.kanal !== "string") {
      feil.push(liga + ": kanal ma vaere tekst eller null");
    }
    if (rad.kanal !== null && !String(rad.kanal).trim()) {
      feil.push(liga + ": kanal star oppfort tom — bruk null");
    }
    if (rad.kilde !== null && String(rad.kilde || "").indexOf("http") !== 0) {
      feil.push(liga + ": kilde er ikke en lenke");
    }
    if (rad.sjekket !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(rad.sjekket))) {
      feil.push(liga + ": sjekket er ikke en dato");
    }
    if (rad.kanal && (!rad.kilde || !rad.sjekket)) {
      feil.push(liga + ": " + rad.kanal + " star uten kilde og dato");
    }
  });
  return feil;
}

/* ---------- sonden mot TheSportsDB ---------- */

// Hva TheSportsDB faktisk gir oss — spurt for hand, ikke av CI.
//
// To sporsmal sto apne 21. september 2026, og begge er sporsmal om DATA:
// kan vi vise ALLE runder i Resultater for arets sesong, og har vi
// toppscorere i det hele tatt? Ingen test kan svare: en stubb vet bare
// det vi alt trodde, og nettopp den fella star i docs/testing.md.
//
// Stiene og malingen ligger HER og ikke i verktoyet, fordi to ting spor:
// `verktoy/tsdbsjekk.mjs` fra en maskin, og `/api/tsdb-sonde` fra
// portalen — for den som sitter med en telefon. Sto de hver for seg,
// ville de to svart ulikt pa det samme sporsmalet, og da er sonden verre
// enn ingen sonde.
//
// `ider` er lag og spiller PLUKKET ut av svarene underveis. Kampene
// baerer idHomeTeam, spillerlista baerer idPlayer, sa kjeden koster ingen
// ekstra kall og krever ingenting av den som spor.
export function tsdbSondeStier(liga, sesong, nokkel, ider) {
  if (!liga || !liga.tsdb) return [];
  const id = ider || {};
  const v1 = "/api/v1/json/" + encodeURIComponent(nokkel || "3") + "/";
  const s = encodeURIComponent(sesong);
  return [
    // FORST, og det er ikke tilfeldig: dette er kallet vi bruker i dag.
    // Svaret baerer lag-id-en resten av kjeden trenger, sa den star
    // stodig selv om provene under svikter.
    { navn: "det vi bruker i dag", felt: "events", versjon: "v1",
      gir: "lag", sti: v1 + "eventspastleague.php?id=" + liga.tsdb },
    { navn: "hele sesongen (v2)", felt: "schedule", versjon: "v2",
      gir: "lag", sti: "/api/v2/json/schedule/league/" + liga.tsdb + "/" + s },
    { navn: "hele sesongen (v1)", felt: "events", versjon: "v1",
      gir: "lag", sti: v1 + "eventsseason.php?id=" + liga.tsdb + "&s=" + s },
    // GJETNING. Navnet er formet som de andre v2-oppslagene — det er ikke
    // fra et svar vi har sett. Svarer den 404, er det ikke et nei til
    // toppscorere, bare et nei til dette navnet.
    { navn: "toppscorere, gjettet (v2)", felt: "*", versjon: "v2", gjetning: true,
      sti: "/api/v2/json/lookup/league_topscorers/" + liga.tsdb + "/" + s },
    { navn: "spillerne i et lag", felt: "player", versjon: "v1",
      krever: "lag", gir: "spiller",
      sti: v1 + "lookup_all_players.php?id=" + encodeURIComponent(id.lag || "") },
    // Adressen som ble foreslatt. Noklet pa idPlayer — den svarer pa
    // «hvordan har DENNE spilleren gjort det», ikke «hvem leder ligaen».
    { navn: "én spillers statistikk", felt: "*", versjon: "v1",
      krever: "spiller", maaler: "mal",
      sti: v1 + "lookupplayerstats.php?id=" + encodeURIComponent(id.spiller || "") },
  ];
}

// Den forste noekkelen i svaret som baerer en liste.
//
// Feltnavnet varierer mellom utgavene, sa vi leter etter om dataene
// FINNES framfor etter et navn vi alt hadde gjettet. Returnerer navnet
// ogsa, for det er det en parser ma treffe senere.
export function tsdbForsteListe(json, onsket) {
  if (!json || typeof json !== "object") return null;
  if (onsket && onsket !== "*" && Array.isArray(json[onsket])) {
    return { felt: onsket, liste: json[onsket] };
  }
  const felt = Object.keys(json).find((k) => Array.isArray(json[k]));
  return felt ? { felt, liste: json[felt] } : null;
}

// Hva svaret BAR. Ikke hva det het.
//
// For spillerstatistikken er det ÉN ting som avgjor om den er til nytte:
// baerer raden MAAL, og staar SESONGEN pa den? Uten begge kan den ikke
// bli en toppscorerliste uansett hvor mange kall vi bruker. Vi leter pa
// innhold, ikke pa feltnavn vi har gjettet.
export function tsdbSondeFunn(liste) {
  const rader = Array.isArray(liste) ? liste : [];
  const ut = { rader: rader.length, felt: [], runder: 0, maalfelt: [], sesongfelt: [] };
  if (!rader.length) return ut;
  ut.felt = Object.keys(rader[0] || {});
  ut.maalfelt = ut.felt.filter((k) => /goal/i.test(k));
  ut.sesongfelt = ut.felt.filter((k) => /season/i.test(k));
  // Runder avgjor om «alle runder» er mulig i det hele tatt: en sesong
  // uten rundetall kan ikke grupperes, uansett hvor mange kamper som kom.
  const sett = new Set();
  rader.forEach((r) => {
    const n = r && (r.intRound !== undefined ? r.intRound : r.strRound);
    if (n !== undefined && n !== null && String(n) !== "") sett.add(String(n));
  });
  ut.runder = sett.size;
  return ut;
}

// Lag- og spiller-id plukket ut av en liste vi alt har hentet.
export function tsdbPlukkId(liste, slag) {
  const nokler = slag === "spiller"
    ? ["idPlayer"]
    : ["idHomeTeam", "idTeam", "idAwayTeam"];
  for (const rad of Array.isArray(liste) ? liste : []) {
    for (const n of nokler) {
      if (rad && rad[n] !== undefined && rad[n] !== null && String(rad[n]) !== "") {
        return String(rad[n]);
      }
    }
  }
  return "";
}
