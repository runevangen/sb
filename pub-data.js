// Rene funksjoner for pubene rundt kampen. Ingen DOM, ingen nettverk.
//
// Kilden er OpenStreetMap via Overpass. Lisensen (ODbL) krever synlig
// kreditering: «© OpenStreetMap-bidragsytere» star der pubene vises.

// Samme normalisering som lagnavn: sma bokstaver, norske tegn foldet,
// tegnsetting fjernet. Da er «O'Reilly's» og «OReillys» samme sted.
import { normaliserLagnavn } from "./fotball-data.js";

// Overpass-tjenerne vi prover, i rekkefolge. Hovedtjeneren er raskest og
// naermest kilden, men avviser mye; speilene er mildere. Alle tre snakker
// samme sprak, sa et svar fra et speil er like godt.
// Tjenerne sporres samtidig, ikke etter tur: den forste som svarer
// vinner, og resten avbrytes. Etter tur ble summen av tre trege tjenere
// storre enn fristen, og da kom ingenting. Kappløp koster noen ekstra
// kall, men svaret caches et dogn per arena, sa det blir noen hundre
// kall i dognet totalt — godt innenfor det Overpass ber om.
export const OVERPASS_SPEIL = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

// Hovedtjeneren svarer 406 «Not Acceptable» nar den ikke liker headerne:
// den vil ha et Accept som sier hva vi tar imot, og en User-Agent som
// sier hvem vi er. Nettleseren forbyr oss a sette User-Agent, sa den
// settes bare serverside.
//
// Accept-Encoding settes ikke: setter vi den selv, slutter Node a pakke
// ut svaret for oss, og da feiler json(). Bade Node og nettleseren
// setter en fornuftig verdi uten var hjelp.
export function overpassHeadere(serverside) {
  const h = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };
  if (serverside) h["User-Agent"] = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";
  return h;
}

// Netlify gir en funksjon ti sekunder. Tre tjenere etter hverandre uten
// frist sprenger det, og da far leseren Netlifys egen feilside i stedet
// for vart svar — uten et ord om hvem som sviktet. Hver tjener far
// derfor sin egen frist, under en samlet frist for hele kallet.
export function restTid(frist, naa, tak) {
  return Math.max(0, Math.min(tak, frist - naa));
}

// Overpass-sporring: puber og barer innen radius meter fra et punkt.
// «out center» gir tagger og koordinater, og ett punkt ogsa for bygninger
// tegnet som flater. «out center tags» — som sto her forst — avviser
// Overpass med 406, og «tags» ville uansett droppet koordinatene.
export function overpassSporring(lat, lon, radius) {
  return '[out:json][timeout:12];nwr["amenity"~"^(pub|bar)$"](around:' +
    Math.round(radius) + "," + Number(lat).toFixed(3) + "," + Number(lon).toFixed(3) +
    ");out center;";
}

// Tre desimaler er rundt 100 meter. Nok til a finne en pub, og ikke nok
// til a si hvor noen bor.
export function rundPosisjon(lat, lon) {
  return { lat: Number(Number(lat).toFixed(3)), lon: Number(Number(lon).toFixed(3)) };
}

// Haversine, i meter. Bra nok pa avstander en gar.
export function avstandM(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function avstandtekst(m) {
  if (!Number.isFinite(m)) return "";
  if (m < 1000) return Math.round(m / 10) * 10 + " m";
  return (m / 1000).toFixed(1).replace(".", ",") + " km";
}

// Pubene ut av Overpass-svaret, med avstand fra senter, naermest forst.
// Uten navn er en pub ingenting a skrive i en chat; de faller bort. Samme
// navn to ganger (bygning og inngang) blir en.
export function tolkPuber(json, senter) {
  if (!json || !Array.isArray(json.elements)) throw new Error("Uventet svar fra Overpass");
  const sett = new Set();
  const puber = [];
  for (const e of json.elements) {
    const tags = (e && e.tags) || {};
    const navn = String(tags.name || "").trim().slice(0, 60);
    if (!navn) continue;
    const lat = e.lat !== undefined ? e.lat : e.center && e.center.lat;
    const lon = e.lon !== undefined ? e.lon : e.center && e.center.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const nokkel = navn.toLowerCase();
    if (sett.has(nokkel)) continue;
    sett.add(nokkel);
    puber.push({
      navn, lat, lon,
      avstand: senter ? avstandM(senter, { lat, lon }) : null,
      tider: tags.opening_hours ? String(tags.opening_hours).slice(0, 80) : "",
    });
  }
  return puber.sort((a, b) => (a.avstand || 0) - (b.avstand || 0));
}

// Entur JourneyPlanner: holdeplassene naermest et punkt. Bare stopPlace,
// ikke enkeltstolper, sa «Lerkendal» kommer en gang.
export function enturNaermest(lat, lon, radius) {
  return "{ nearest(latitude: " + Number(lat).toFixed(4) + ", longitude: " + Number(lon).toFixed(4) +
    ", maximumDistance: " + Math.round(radius) + ", maximumResults: 4, filterByPlaceTypes: [stopPlace])" +
    " { edges { node { distance place { ... on StopPlace { id name latitude longitude } } } } } }";
}

export function tolkHoldeplasser(json) {
  const kanter = json && json.data && json.data.nearest && json.data.nearest.edges;
  if (!Array.isArray(kanter)) return [];
  const sett = new Set();
  const ut = [];
  for (const k of kanter) {
    const p = k && k.node && k.node.place;
    if (!p || !p.name || !Number.isFinite(p.latitude)) continue;
    const navn = String(p.name).slice(0, 60);
    if (sett.has(navn)) continue;
    sett.add(navn);
    ut.push({ navn, lat: p.latitude, lon: p.longitude, avstand: Math.round(k.node.distance || 0) });
  }
  return ut;
}

// Grupperer pubene: ved stadion (innen 800 m) og ved hver holdeplass
// (innen 300 m). En pub kan sta i begge; det er to svar pa to sporsmal.
export function grupperPuber(puber, arena, holdeplasser) {
  const grupper = [];
  const vedStadion = puber.filter((p) => avstandM(arena, p) <= 800)
    .map((p) => Object.assign({}, p, { avstand: avstandM(arena, p) }))
    .sort((a, b) => a.avstand - b.avstand);
  if (vedStadion.length) grupper.push({ tittel: "Ved " + arena.navn, puber: vedStadion.slice(0, 6) });
  for (const h of holdeplasser || []) {
    const ved = puber.filter((p) => avstandM(h, p) <= 300)
      .map((p) => Object.assign({}, p, { avstand: avstandM(h, p) }))
      .sort((a, b) => a.avstand - b.avstand);
    if (ved.length) grupper.push({ tittel: "Ved " + h.navn, puber: ved.slice(0, 4) });
  }
  return grupper;
}

/* ---------- kuraterte puber ---------- */

// OpenStreetMap vet at et sted er en pub, men ikke om de viser fotball.
// Den kuraterte lista i puber-oslo.js er nettopp det OSM ikke kan si.
// Den ligger i koden, sa den virker uten nettverk — og det er verdt mye
// her, der Overpass har vist seg a vaere det skjoreste leddet.
//
// sjekket-datoen er det viktigste feltet: en liste uten dato ratner uten
// at noen merker det.
export const PUBLISTE_FELT = ["navn", "bydel", "lat", "lon", "type", "kilde", "sikkerhet", "sjekket"];
export const PUBTYPER = ["sportsbar", "supporterpub", "pub"];
export const PUBSIKKERHET = ["bekreftet", "sannsynlig", "usikker"];

// Hva som teller som kilde.
//
// Den var en URL til 16. september 2026, og det var for strengt. Regelen
// er «kilde og dato», ikke «lenke og dato» — og den sma puben i
// Torggata har ingen nettside. En rad du selv sto i, er bedre dokumentert
// enn en nettside som ikke er rort siden 2019.
//
// Feltet vises aldri for leseren. Det er et revisjonsfelt for den som
// vedlikeholder lista, og da trenger det ikke vaere klikkbart — det
// trenger a svare pa *hvordan vet vi det*.
//
// Terskelen er tre ord og tolv tegn. «ok» og «ja» sier ingenting; «Var
// innom 16.09.2026, storskjerm i baren» sier alt. Formen kan ikke skille
// en god kilde fra en darlig, men den kan skille et svar fra et ikke-svar.
export const KILDE_MIN_TEGN = 12;
export const KILDE_MIN_ORD = 3;

export function kildeHolder(kilde) {
  const tekst = String(kilde == null ? "" : kilde).trim();
  if (!tekst) return false;
  if (tekst.indexOf("http") === 0) return true;
  return tekst.length >= KILDE_MIN_TEGN &&
    tekst.split(/\s+/).filter(Boolean).length >= KILDE_MIN_ORD;
}

// Vokter formen sa hvem som helst kan redigere lista uten a odelegge
// appen. Gir en liste med det som er galt; tom liste betyr at alt er bra.
export function sjekkPubliste(liste, ramme) {
  const r = ramme || { lat: [59.80, 60.05], lon: [10.45, 10.95] };
  const feil = [];
  if (!Array.isArray(liste)) return ["Lista er ikke en liste"];
  const sett = new Set();
  liste.forEach((p, i) => {
    const hvor = "rad " + (i + 1) + " (" + ((p && p.navn) || "uten navn") + ")";
    if (!p || typeof p !== "object") { feil.push(hvor + ": ikke et objekt"); return; }
    PUBLISTE_FELT.forEach((felt) => {
      if (p[felt] === undefined || p[felt] === "") feil.push(hvor + ": mangler " + felt);
    });
    const nokkel = normaliserLagnavn(p.navn);
    if (nokkel && sett.has(nokkel)) feil.push(hvor + ": samme navn to ganger");
    sett.add(nokkel);
    if (!(p.lat >= r.lat[0] && p.lat <= r.lat[1]) || !(p.lon >= r.lon[0] && p.lon <= r.lon[1])) {
      feil.push(hvor + ": koordinatene ligger utenfor omradet");
    }
    if (PUBTYPER.indexOf(p.type) === -1) feil.push(hvor + ": ukjent type " + p.type);
    if (PUBSIKKERHET.indexOf(p.sikkerhet) === -1) feil.push(hvor + ": ukjent sikkerhet " + p.sikkerhet);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.sjekket))) feil.push(hvor + ": sjekket er ikke en dato");
    if (p.kilde !== undefined && p.kilde !== "" && !kildeHolder(p.kilde)) {
      feil.push(hvor + ": kilde sier ikke hvordan vi vet det"
        + " (en lenke, eller minst " + KILDE_MIN_ORD + " ord)");
    }
  });
  return feil;
}

// De kuraterte stedene innen radius, naermest forst. Ingen nettverk.
export function kuraterteNaer(liste, senter, radius) {
  if (!Array.isArray(liste) || !senter) return [];
  return liste
    .map((p) => Object.assign({}, p, { avstand: avstandM(senter, p) }))
    .filter((p) => p.avstand <= radius)
    .sort((a, b) => a.avstand - b.avstand);
}

// Merker treff fra OpenStreetMap som vi vet viser fotball. Da star
// «viser fotball» pa de vi er sikre pa, uten a skjule resten.
export function merkKuraterte(puber, liste) {
  if (!Array.isArray(liste) || !liste.length) return puber;
  const kjent = new Map();
  liste.forEach((p) => kjent.set(normaliserLagnavn(p.navn), p));
  return puber.map((p) => {
    const traff = kjent.get(normaliserLagnavn(p.navn));
    return traff ? Object.assign({}, p, { viserFotball: true, lag: traff.lag || [] }) : p;
  });
}

/* ---------- ett sporsmal, ett svar ---------- */

// Hvor mange forslag som star framme. Resten ligger bak «Flere forslag»,
// sa ingenting forsvinner — men seks er sa mange som lar seg lese pa en
// telefon uten a rulle.
export const FORSLAG_MAKS = 6;

// Rekkefolgen kildene rangeres i. Den er svaret: det som gjelder *denne
// kampen* forst, sa det du selv har brukt, sa steder vi vet viser
// fotball, sa resten fra kartet.
export const FORSLAG_KILDER = [
  "bekreftede", "dine", "kjenteNaer", "kjenteVedArena", "naerDeg", "vedArena",
];

// Én liste, ikke seks grupper.
//
// For sto forslagene i en gruppe per kilde, med hver sin overskrift:
// «Viser denne kampen», «Kjent for a vise fotball», «Naer deg», «Dine
// puber», «Fotballpuber ved <arena>», «Ved stadion», «Ved holdeplassen».
// Det var ikke apenhet, det var stoy — samme pub sto i tre av dem, og
// den ene gruppa som faktisk svarte pa kampen druknet i de andre.
//
// Na havner hver pub ett sted, der den rangerer hoyest, og merkene barer
// det overskriftene sa: ★ for «viser denne kampen», ⚽ for «kjent for a
// vise fotball». De koster ingen linje.
export function rangerForslag(kilder, maks = FORSLAG_MAKS) {
  const sett = new Map();

  FORSLAG_KILDER.forEach((navn) => {
    const liste = (kilder && kilder[navn]) || [];
    (Array.isArray(liste) ? liste : []).forEach((p) => {
      if (!p || !p.navn) return;
      const nokkel = normaliserLagnavn(p.navn);
      if (!nokkel) return;

      const eks = sett.get(nokkel);
      if (!eks) { sett.set(nokkel, Object.assign({}, p)); return; }

      // Samme pub fra flere kilder beholder plassen sin, men samler
      // merkene: et treff fra kartet skal ikke skjule at stedet alt har
      // sagt at det viser kampen. Korteste avstand vinner.
      if (p.bekreftet) eks.bekreftet = true;
      if (p.viserFotball) eks.viserFotball = true;
      if (p.lag && p.lag.length && !(eks.lag && eks.lag.length)) eks.lag = p.lag;
      if (Number.isFinite(p.avstand) &&
          (!Number.isFinite(eks.avstand) || p.avstand < eks.avstand)) {
        eks.avstand = p.avstand;
      }
    });
  });

  const alle = Array.from(sett.values());
  const tak = Number.isFinite(maks) && maks > 0 ? maks : alle.length;
  return { topp: alle.slice(0, tak), resten: alle.slice(tak) };
}

/* ---------- dine puber ---------- */

// Lagres lokalt som [{ navn, antall }]. Den som er brukt oftest star
// forst; ved likt antall den sist brukte.
export function ofteBrukt(liste) {
  return (Array.isArray(liste) ? liste : [])
    .filter((p) => p && p.navn)
    .slice()
    .sort((a, b) => (b.antall || 0) - (a.antall || 0) || (b.sist || 0) - (a.sist || 0))
    .slice(0, 5);
}

export function noterPub(liste, navn, naa) {
  const n = String(navn || "").trim().slice(0, 60);
  if (!n) return Array.isArray(liste) ? liste : [];
  const ut = (Array.isArray(liste) ? liste : []).filter((p) => p && p.navn);
  const tid = naa || Date.now();
  const eks = ut.find((p) => p.navn.toLowerCase() === n.toLowerCase());
  if (eks) { eks.antall = (eks.antall || 0) + 1; eks.sist = tid; }
  else ut.push({ navn: n, antall: 1, sist: tid });
  return ut.slice(-20);
}

/* ---------- kontaktopplysninger ---------- */

// Feltene i puber-kontakt.js. Rekkefolgen er den de vises i.
export const KONTAKT_FELT = [
  "telefon", "epost", "nettside", "adresse",
  "mat", "apningstider", "bordbestilling", "aldersgrense", "skjermer",
];

export const MATVALG = ["full meny", "enkel mat", "ingen mat"];

// Norske nummer skrives i to grupperinger: fasttelefon i par (22 41 62
// 66) og mobil i tre-to-tre (484 06 215). Begge er riktige, sa begge
// godtas — men bare de to, sa en avvikende form blir sett.
const TELEFONFORM = /^\+47 (\d{2} \d{2} \d{2} \d{2}|\d{3} \d{2} \d{3})$/;

// Vokter formen, som sjekkPubliste gjor for publista. Tom liste betyr at
// alt er bra. pubnavn er navnene fra puber-oslo.js: kontaktopplysninger
// til en pub vi ikke har, er en skrivefeil — eller en pub som er fjernet
// uten at dette folget med.
export function sjekkKontaktliste(kontakter, pubnavn) {
  if (!kontakter || typeof kontakter !== "object") return ["Kontaktene er ikke et oppslag"];
  const kjent = new Set((pubnavn || []).map(normaliserLagnavn));
  const feil = [];
  Object.keys(kontakter).forEach((navn) => {
    const hvor = navn;
    if (kjent.size && !kjent.has(normaliserLagnavn(navn))) {
      feil.push(hvor + ": ukjent pub");
    }
    const rad = kontakter[navn];
    if (!rad || typeof rad !== "object") { feil.push(hvor + ": ikke et objekt"); return; }
    Object.keys(rad).forEach((felt) => {
      const f = rad[felt];
      const her = hvor + " / " + felt;
      if (KONTAKT_FELT.indexOf(felt) === -1) { feil.push(her + ": ukjent felt"); return; }
      if (!f || typeof f !== "object") { feil.push(her + ": ikke et objekt"); return; }
      if (f.verdi === undefined || f.verdi === null || f.verdi === "") {
        // Et felt uten verdi skal ikke sta i fila i det hele tatt.
        feil.push(her + ": star oppfort uten verdi");
      }
      if ([1, 2].indexOf(f.tillit) === -1) feil.push(her + ": tillit ma vaere 1 eller 2");
      if (String(f.kilde || "").indexOf("http") !== 0) feil.push(her + ": kilde er ikke en lenke");
      if (!String(f.sitat || "").trim()) feil.push(her + ": mangler sitat");
      if (f.verifisert !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.verifisert))) {
        feil.push(her + ": verifisert er ikke en dato");
      }
      if (felt === "telefon" && !TELEFONFORM.test(String(f.verdi))) {
        feil.push(her + ": " + f.verdi + " er ikke et norsk nummer pa kjent form");
      }
      if (felt === "epost" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.verdi))) {
        feil.push(her + ": " + f.verdi + " ser ikke ut som en e-postadresse");
      }
      if (felt === "nettside" && String(f.verdi).indexOf("http") !== 0) {
        feil.push(her + ": nettside er ikke en lenke");
      }
      if (felt === "mat" && MATVALG.indexOf(f.verdi) === -1) feil.push(her + ": ukjent matvalg " + f.verdi);
      if (felt === "bordbestilling" && typeof f.verdi !== "boolean") {
        feil.push(her + ": bordbestilling ma vaere true eller false");
      }
      if (felt === "aldersgrense" && !(Number.isInteger(f.verdi) && f.verdi >= 18 && f.verdi <= 25)) {
        feil.push(her + ": aldersgrense " + f.verdi + " ser feil ut");
      }
    });
  });
  return feil;
}

// Det appen far lov til a vise: bare felt en person har sett med egne
// oyne og datert. Resten er innsamlede forslag, og et feil
// telefonnummer til en ekte bedrift er verre enn ingen. Gir et enkelt
// oppslag — { telefon: "+47 …" } — sa visningen slipper a kjenne til
// kilder og tillit.
export function kontaktFor(navn, kontakter) {
  const rad = finnKontakt(navn, kontakter);
  const ut = {};
  if (!rad) return ut;
  KONTAKT_FELT.forEach((felt) => {
    const f = rad[felt];
    if (f && f.verifisert && f.verdi !== undefined && f.verdi !== null) ut[felt] = f.verdi;
  });
  return ut;
}

// Alt vi har om en pub, verifisert eller ikke, med kilder. For
// gjennomgang og feilsoking — aldri for visningen.
export function finnKontakt(navn, kontakter) {
  if (!navn || !kontakter) return null;
  const leit = normaliserLagnavn(navn);
  const treff = Object.keys(kontakter).find((n) => normaliserLagnavn(n) === leit);
  return treff ? kontakter[treff] : null;
}

/* ---------- lista redigert fra portalen (#80) ---------- */

// Til 16. september 2026 fantes det ingen vei fra et skjema og inn i
// lista, og det var med vilje: `puber-oslo.js` baerer en redaksjonell
// vurdering, og et forslag fra en leser er ikke en rad. ADR 0019.
//
// Den regelen star. Det som endret seg er *hvem* som limer. Ingen leser
// skriver i lista; admin gjor det, og gjor det na i portalen framfor i en
// koderedigerer. Fila er fortsatt grunnfjellet — den virker uten nett, og
// er det leseren ser om Supabase er nede. Basen baerer bare rettelsene
// oppa. ADR 0020.
//
// Nokkelen er navnet foldet, ikke navnet: «Andy's Pub» og «Andys Pub» er
// ett sted, og to rader for det samme stedet er nettopp det en redigert
// liste ikke tale. Samme grep som kampNokkel.
export function pubNokkel(navn) {
  return normaliserLagnavn(navn);
}

// Radene fra PostgREST, formet som lista er formet.
//
// **Ma tale a kjores to ganger.** Tjenesten tolker radene for den svarer,
// portalen tolker svaret en gang til — og andre gang heter feltene alt
// det de skal hete. Den feilen gjorde «blir med»-lista usynlig for alle i
// tre dager.
export function tolkPubRader(rader) {
  return (Array.isArray(rader) ? rader : []).map((r) => ({
    nokkel: String((r && r.nokkel) || pubNokkel((r && r.navn) || "")),
    navn: String((r && r.navn) || ""),
    bydel: String((r && r.bydel) || ""),
    adresse: String((r && r.adresse) || ""),
    lat: Number((r && r.lat) || 0),
    lon: Number((r && r.lon) || 0),
    type: String((r && r.type) || "pub"),
    lag: Array.isArray(r && r.lag) ? r.lag.map(String) : [],
    kilde: String((r && r.kilde) || ""),
    sikkerhet: String((r && r.sikkerhet) || ""),
    sjekket: String((r && r.sjekket) || "").slice(0, 10),
    merknad: String((r && r.merknad) || ""),
    fjernet: !!(r && r.fjernet),
  })).filter((p) => p.nokkel);
}

// Raden slik tjenesten sender den til basen. `endret_av` og `endret` star
// ikke her: databasen setter den forste fra okten og den andre fra now().
// Sender funksjonen dem selv, kan en feil her skrive i en annens navn.
export function pubRadTilBase(p) {
  return {
    nokkel: pubNokkel(p.navn),
    navn: String(p.navn).trim(),
    bydel: String(p.bydel || "").trim(),
    adresse: String(p.adresse || "").trim(),
    lat: Number(p.lat),
    lon: Number(p.lon),
    type: String(p.type || "pub"),
    lag: Array.isArray(p.lag) ? p.lag.map((l) => String(l).trim()).filter(Boolean) : [],
    kilde: String(p.kilde || "").trim(),
    sikkerhet: String(p.sikkerhet || "").trim(),
    sjekket: String(p.sjekket || "").slice(0, 10),
    merknad: String(p.merknad || "").trim() || null,
    fjernet: !!p.fjernet,
  };
}

// Fila nederst, basen oppa.
//
// En rad i basen med samme nokkel erstatter raden i fila — hele raden,
// ikke felt for felt. Halve rader fra to kilder er ikke til a lese
// tilbake: sto adressen i fila og koordinatet i basen, ville ingen visst
// hvilken av dem som var sjekket sist.
//
// `fjernet` tar raden ut. Et sted som har lagt ned skal kunne forsvinne
// fra portalen, og da holder det ikke a la vaere a skrive en rad: raden
// star jo i fila. Fila blir aldri rort herfra.
//
// Rekkefolgen fra fila holdes, og nye rader legges bakerst. Appen sorterer
// etter avstand uansett, men portalen viser dem som de kommer.
export function slaSammenPuber(fila, base) {
  const over = new Map();
  (Array.isArray(base) ? base : []).forEach((p) => {
    if (p && p.nokkel) over.set(p.nokkel, p);
  });

  const ut = [];
  const brukt = new Set();
  (Array.isArray(fila) ? fila : []).forEach((p) => {
    const nokkel = pubNokkel(p.navn);
    brukt.add(nokkel);
    const ny = over.get(nokkel);
    if (!ny) { ut.push(p); return; }
    if (ny.fjernet) return;
    ut.push(utenBasefelt(ny));
  });

  (Array.isArray(base) ? base : []).forEach((p) => {
    if (!p || !p.nokkel || brukt.has(p.nokkel) || p.fjernet) return;
    ut.push(utenBasefelt(p));
  });
  return ut;
}

// Raden slik resten av appen venter den: uten nokkel og uten fjernet.
// De to hoerer lagringen til, og en rad som barer dem ville sett ut som
// noe annet enn radene fra fila.
function utenBasefelt(p) {
  const ut = {
    navn: p.navn, bydel: p.bydel, adresse: p.adresse,
    lat: p.lat, lon: p.lon, type: p.type, lag: p.lag || [],
    kilde: p.kilde, sikkerhet: p.sikkerhet, sjekket: p.sjekket,
  };
  if (p.merknad) ut.merknad = p.merknad;
  return ut;
}

// Hva som er galt med én rad, som en liste. Tom liste betyr at alt er bra
// — samme form som sjekkPubliste, og den samme vurderingen: en rad uten
// kilde og dato slipper ikke gjennom. Den regelen er ikke pynt. Oslos
// uteliv flytter seg fort, og en udatert rad er verre enn ingen rad.
//
// En fjernet rad slipper med navnet alene: det eneste den sier er at
// stedet ikke skal vises, og da er det ingen opplysning om virkeligheten
// a sette en kilde bak.
export function sjekkPubRad(p, ramme) {
  if (!p || typeof p !== "object") return ["Raden er ikke et objekt"];
  if (!pubNokkel(p.navn || "")) return ["Skriv navnet på stedet."];
  if (p.fjernet) return [];
  return sjekkPubliste([pubRadTilBase(p)], ramme)
    .map((f) => f.replace(/^rad 1 \([^)]*\): /, ""));
}

/* ---------- sla opp et sted i OpenStreetMap ---------- */

// Portalen skal slippe a gjette koordinater. Kommentaren i puber-oslo.js
// har alltid sagt at OSMs koordinat brukes nar navnet stemmer — dette er
// akkurat det, bare gjort av maskinen framfor for hand.
//
// Navnet vaskes til bokstaver, tall og mellomrom for det settes inn i
// sporringen. Overpass' egen QL har bade hermetegn og regex, og et navn
// som «O'Leary's "Vika"» ville ellers brutt sporringen — eller vaert en
// vei til a skrive sin egen.
//
// Tegnsettingen *deler* framfor a forsvinne, og det er med vilje:
// «O'Learys» blir «O Learys», ikke «OLearys». Det siste ville ikke
// truffet noe som helst — navnet i OpenStreetMap har jo apostrofen. Den
// lange biten star igjen, og den finner stedet.
//
// Norske bokstaver blir staende. De gjorde det ikke da fila her foldet
// dem forst: «Bla Gronland» er verken det ene eller det andre.
export function osmNavnVask(navn) {
  return String(navn || "")
    .replace(/[^0-9A-Za-zAEOAaeoa\u00C6\u00D8\u00C5\u00E6\u00F8\u00E5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// Hvor lang en bit ma vaere for den kreves. «The», «Pub» og «Bar» star i
// halve Oslo: de gjor sporringen strengere uten a gjore den mer
// treffsikker, og «The Dubliner Folk Pub» skal finne «Dubliner Folk Pub».
const SOK_MIN = 4;

// Oslo-ramma, den samme sjekkPubliste bruker. Et sok som treffer en pub i
// Bergen hjelper ingen her.
export const OSLO_RAMME = { lat: [59.80, 60.05], lon: [10.45, 10.95] };

export function osmNavnSporring(navn, ramme) {
  const r = ramme || OSLO_RAMME;
  const biter = osmNavnVask(navn).split(" ").filter(Boolean);
  let ord = biter.filter((o) => o.length >= SOK_MIN);
  // Star det bare korte biter igjen, brukes den lengste av dem alene —
  // men aldri en pa to bokstaver. «(?=.*a)» treffer hver eneste pub i
  // byen, og en liste pa tusen treff er det samme som ingen liste.
  if (!ord.length) {
    const lengst = biter.slice().sort((a, b) => b.length - a.length)[0] || "";
    if (lengst.length < 3) return "";
    ord = [lengst];
  }
  // Alle ordene ma finnes, i hvilken som helst rekkefolge: «Dubliner
  // Folk Pub» skal treffe «The Dubliner», og «Andy's Pub» skal ikke
  // treffe hver eneste pub i byen.
  const monster = ord.map((o) => "(?=.*" + o + ")").join("");
  const boks = "(" + r.lat[0] + "," + r.lon[0] + "," + r.lat[1] + "," + r.lon[1] + ")";
  return '[out:json][timeout:12];nwr["name"~"' + monster + '",i]' + boks + ";out center;";
}

// Treffene, formet som portalen vil ha dem: navn, koordinat og adressen
// OSM har, hvis den har en. Nummeret star etter gata, som i lista.
export function tolkNavnTreff(json, maks) {
  const rader = (json && Array.isArray(json.elements)) ? json.elements : [];
  return rader.map((e) => {
    const t = e.tags || {};
    const punkt = e.center || e;
    const gate = String(t["addr:street"] || "").trim();
    const nr = String(t["addr:housenumber"] || "").trim();
    return {
      navn: String(t.name || "").trim(),
      adresse: gate ? (nr ? gate + " " + nr : gate) : "",
      lat: Number(punkt.lat),
      lon: Number(punkt.lon),
      // amenity sier hva OSM mener stedet er. Den oversettes ikke til var
      // egen type: «bar» i OSM er ikke «sportsbar» hos oss, og den
      // vurderingen er det admin som gjor.
      slag: String(t.amenity || t.shop || "").trim(),
      nettsted: String(t.website || t["contact:website"] || "").trim(),
    };
  }).filter((p) => p.navn && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .slice(0, maks || 8);
}
