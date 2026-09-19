// Rene funksjoner for pubene rundt kampen. Ingen DOM, ingen nettverk.
//
// Kilden er OpenStreetMap via Overpass. Lisensen (ODbL) krever synlig
// kreditering: «© OpenStreetMap-bidragsytere» star der pubene vises.

// Samme normalisering som lagnavn: sma bokstaver, norske tegn foldet,
// tegnsetting fjernet. Da er «O'Reilly's» og «OReillys» samme sted.
import { normaliserLagnavn, sesongFor, ligaFor } from "./fotball-data.js";

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
// den vil ha en User-Agent som sier hvem vi er. Nettleseren forbyr oss a
// sette User-Agent, sa den settes bare serverside.
//
// Accept er «*/*», ikke «application/json». Det sto som application/json
// i to uker, og overpass-api.de svarte 406 pa hvert eneste kall — 472 ms,
// hver gang, sa raskt at det aldri sa ut som en nedetid. Overpass
// forhandler innhold pa HTTP-niva og merker ikke svaret som JSON selv om
// «[out:json]» star i sporringen; ber vi strengt om JSON, er det ingenting
// den kan gi oss. Formatet bestemmes av sporringen, ikke av denne
// headeren, sa det er ingenting a hevde her.
//
// Accept-Encoding settes ikke: setter vi den selv, slutter Node a pakke
// ut svaret for oss, og da feiler json(). Bade Node og nettleseren
// setter en fornuftig verdi uten var hjelp.
export function overpassHeadere(serverside) {
  const h = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "*/*",
  };
  if (serverside) h["User-Agent"] = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";
  return h;
}

// Overpass svarer med en HTML-side nar noe er galt, og den ekte grunnen
// star et stykke ned i den. De forste 80 tegnene er alltid «<!DOCTYPE
// html PUBLIC …» — altsa det samme uansett hva som feilet, og dermed
// ingenting. Her hentes teksten ut, og feilsetningen framfor resten.
export function overpassFeiltekst(tekst, maks) {
  const ren = String(tekst || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:quot|apos|amp|lt|gt|nbsp);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!ren) return "";
  // «Error: line 1: parse error» er det vi er ute etter. Star det der,
  // droppes alt foran — resten er den samme standardteksten hver gang.
  const traff = ren.match(/Error\s*:?\s*(.+)$/i);
  return (traff ? traff[1] : ren).slice(0, maks || 120).trim();
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
//
// Sekundene sier hvor lenge den som kaller faktisk venter. De sto som en
// fast tolv her mens tjenesten la pa etter 7,5 og appen etter 8 — vi ba
// om noe vi ikke tenkte a vente pa, og da var det vi som ga opp mens
// meldingen pekte pa Overpass.
export function overpassSporring(lat, lon, radius, sekunder) {
  return "[out:json][timeout:" + Math.max(1, Math.floor(sekunder || 8)) +
    '];nwr["amenity"~"^(pub|bar)$"](around:' +
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
// Den kuraterte lista i puber.js er nettopp det OSM ikke kan si.
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

// Byene appen kjenner. Lista gjor to jobber, og det er med vilje én
// liste: den setter en falsk posisjon (`falskPosisjon`), og den er
// rammene portalen far lagre steder innenfor (`rammeFor`, `byFor`).
//
// Het TESTBYER til 18. september 2026, og det navnet ble usant i det
// portalen begynte a lagre mot den. En RBK-pub i Trondheim er ikke en
// test.
//
// Koordinatene er sentrum, ikke stadion: det er der folk star nar de
// leter etter en pub. Skal du teste rundt en arena, er `arenaFor()` den
// som kjenner dem — og da tar `?posisjon=67.28,14.40` det ogsa.
export const BYER = {
  oslo: { navn: "Oslo", lat: 59.911, lon: 10.750 },
  bergen: { navn: "Bergen", lat: 60.393, lon: 5.325 },
  trondheim: { navn: "Trondheim", lat: 63.430, lon: 10.395 },
  bodo: { navn: "Bodø", lat: 67.280, lon: 14.405 },
  stavanger: { navn: "Stavanger", lat: 58.970, lon: 5.733 },
  tromso: { navn: "Tromsø", lat: 69.649, lon: 18.956 },
};

// Hvor langt fra sentrum en by strekker seg her. Femten kilometer er
// omtrent den gamle Oslo-ramma, og den holdt alle radene i fila.
//
// Tallet er en vakt mot skrivefeil, ikke en grense for hvor folk bor: et
// koordinat med lat og lon byttet om havner i Indiahavet, og DET er det
// som skal stoppes. En pub tjue kilometer ut er et sjeldnere problem enn
// et koordinat som er tastet feil, og den kan fortsatt foeres inn ved a
// utvide tallet her — ett sted, for alle byene.
export const BY_RADIUS_KM = 15;

// Ramma rundt en by, som en boks. Lengdegradene smalner mot polene, sa
// boksen regnes ut framfor a skrives inn: en fast bredde i grader ville
// gitt Tromso en boks tre ganger sa bred som Oslos, malt i kilometer.
export function rammeFor(nokkel, km = BY_RADIUS_KM) {
  const by = BYER[normaliserLagnavn(nokkel || "")];
  if (!by) return null;
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((by.lat * Math.PI) / 180));
  return {
    navn: by.navn,
    lat: [rundNed(by.lat - dLat), rundOpp(by.lat + dLat)],
    lon: [rundNed(by.lon - dLon), rundOpp(by.lon + dLon)],
  };
}

function rundNed(n) { return Math.floor(n * 1000) / 1000; }
function rundOpp(n) { return Math.ceil(n * 1000) / 1000; }

// Byen et punkt ligger i, eller null. Brukt av vakta: en rad skal ligge i
// EN av byene, og hvilken trenger ingen a skrive ned — koordinatet sier
// det. Et felt ved siden av kunne vaert uenig med tallene.
export function byFor(lat, lon) {
  return Object.keys(BYER).find((n) => iRamme({ lat, lon }, rammeFor(n))) || null;
}

function iRamme(p, r) {
  if (!r || !p) return false;
  return p.lat >= r.lat[0] && p.lat <= r.lat[1]
      && p.lon >= r.lon[0] && p.lon <= r.lon[1];
}

// Navnene, slik de skrives for et menneske: «Oslo, Bergen, Trondheim …».
export function bynavn() {
  return Object.keys(BYER).map((n) => BYER[n].navn);
}

// Ligger punktet innenfor ramma vi fikk — eller, uten en ramme, i noen av
// byene i det hele tatt?
function iEnRamme(p, ramme) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  if (ramme) return iRamme(p, ramme);
  return byFor(p.lat, p.lon) !== null;
}

// Vokter formen sa hvem som helst kan redigere lista uten a odelegge
// appen. Gir en liste med det som er galt; tom liste betyr at alt er bra.
export function sjekkPubliste(liste, ramme) {
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
    // Uten en ramme skal raden ligge i EN av byene vi kjenner. Med en
    // ramme gjelder bare den — det er soket i portalen, som leter i én by
    // om gangen.
    //
    // Ramma var Oslo alene til 18. september 2026, og den hardkodede
    // boksen sto inni denne funksjonen. Da kunne en RBK-pub i Trondheim
    // ikke lagres i det hele tatt: vakta sa «koordinatene ligger utenfor
    // omradet» om et koordinat som var helt riktig, og forslaget ble
    // staende i koen som om ingen hadde provd. Appen svarte alt i flere
    // byer — `BYER` er den samme lista `falskPosisjon` bruker — og
    // portalen var det siste stedet som trodde alt var Oslo.
    if (!iEnRamme(p, ramme)) {
      feil.push(hvor + ": koordinatene ligger utenfor "
        + (ramme ? "omradet" : bynavn().join(", ")));
    }
    if (PUBTYPER.indexOf(p.type) === -1) feil.push(hvor + ": ukjent type " + p.type);
    if (PUBSIKKERHET.indexOf(p.sikkerhet) === -1) feil.push(hvor + ": ukjent sikkerhet " + p.sikkerhet);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.sjekket))) feil.push(hvor + ": sjekket er ikke en dato");
    if (p.kilde !== undefined && p.kilde !== "" && !kildeHolder(p.kilde)) {
      feil.push(hvor + ": kilde sier ikke hvordan vi vet det"
        + " (en lenke, eller minst " + KILDE_MIN_ORD + " ord)");
    }
    // Ligaflagget er en pastand om virkeligheten, og da gjelder samme
    // krav som ellers her: kilde og dato. Uten dem viser appen det ikke
    // (`ligaflaggGjelder` stopper det), men da hadde portalen lagret noe
    // som aldri kom fram — og admin ville trodd flagget sto. Et felt som
    // ma fylles ut, sier det for du trykker lagre.
    sjekkLigaflagg(p.ligaer).forEach((f) => feil.push(hvor + ": " + f));
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

// De kuraterte stedene i SAMME BY som deg, naermest forst. Radiusen er
// en sirkel, og en by er ikke det: star du fire kilometer ut, faller
// steder i din egen by utenfor `kuraterteNaer` enda de apenbart er et
// svar. Da sto det ingenting igjen for en by med ett kuratert sted.
//
// Den star ETTER de geografiske kildene og FOR karttreffene, av samme
// grunn som stampubene: et kuratert sted tvers over byen er et darligere
// svar enn en fotballpub i nabogata, men et bedre svar enn en tilfeldig
// bar Overpass fant.
//
// Til forskjell fra stampubene **baerer den avstand**, og derfor blir den
// ogsa staende nar posisjonen kommer. Det var nettopp den manglende
// avstanden som gjorde en stampub i en annen by til et darlig svar; her
// er byen den samme som din, og tallet star pa brikka.
//
// Uten en by a sta i er det ingenting a si: `byFor()` svarer null utenfor
// de seks, og da er det `kuraterteNaer` og kartet som gjelder.
export function kuraterteIByen(liste, senter) {
  if (!Array.isArray(liste) || !senter) return [];
  const by = byFor(senter.lat, senter.lon);
  if (!by) return [];
  return liste
    .filter((p) => p && byFor(p.lat, p.lon) === by)
    .map((p) => Object.assign({}, p, { avstand: avstandM(senter, p) }))
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

/* ---------- stampubene for lagene som spiller ---------- */

// De kuraterte stedene nadde bare fram gjennom et geografisk filter:
// `kjenteNaer` krever posisjonen din, `kjenteVedArena` krever at arenaen
// er en vi kjenner. Er kampen utenlandsk OG du sier nei til posisjon,
// finnes lista var ikke — selv om den ligger i koden og er det sterkeste
// redaksjonelle signalet vi har.
//
// `lag` i puber.js svarer pa kampen uten a vite hvor du er: spiller
// Brann, er Brann-stampuben et godt forslag enten du star i Oslo eller
// ikke. Det er den samme opplysningen ⚽-merket alt baerer — den var bare
// ikke en vei INN i lista.
//
// Navnene foldes med normaliserLagnavn, som ellers: «Vaalerenga» fra
// kilden og «Valerenga» i fila er samme lag, og en liste som ikke visste
// det ville truffet ingenting.
// Foldingen er STRENGERE her enn normaliserLagnavn, og den ekstra biten
// er «aa» → «a». Grunnen: dette er det forste stedet i appen der lagnavn
// fra API-et moter lagnavn skrevet av redaksjonen. Kilden sier
// «Vaalerenga», fila sier «Valerenga», og normaliserLagnavn gir
// «vaalerenga» mot «valerenga» — to ulike lag, sa vidt den vet.
// («Bodo/Glimt» mot «Bodo/Glimt» gar bra; o-en foldes alt.)
//
// Den ekstra foldingen ligger HER og ikke i normaliserLagnavn, og det er
// ikke smak: normaliserLagnavn gar inn i kampNokkel(), som er id-en alt
// lagret, oppslatt og delt star pa (ADR 0008). Endrer vi den, endrer vi
// nokkelen til hver eneste rad som alt ligger i basen. Et sammenlikning
// som bare gjelder her, hoerer hjemme her.
function lagnokkel(navn) {
  return normaliserLagnavn(navn || "").replace(/aa/g, "a");
}

export function stampuberFor(kamp, kjente) {
  if (!kamp) return [];
  const lagene = [kamp.hjemme, kamp.borte].map(lagnokkel).filter(Boolean);
  if (!lagene.length) return [];
  return (Array.isArray(kjente) ? kjente : []).filter((p) =>
    (p && Array.isArray(p.lag) ? p.lag : [])
      .some((l) => lagene.indexOf(lagnokkel(l)) > -1));
}

/* ---------- ett sporsmal, ett svar ---------- */

// Hvor mange forslag som star framme. Resten ligger bak «Flere forslag»,
// sa ingenting forsvinner — men seks er sa mange som lar seg lese pa en
// telefon uten a rulle.
export const FORSLAG_MAKS = 6;

// Rekkefolgen kildene rangeres i. Den er svaret: det som gjelder *denne
// kampen* forst, sa det du selv har brukt, sa steder vi vet viser
// fotball, sa resten fra kartet.
// «stampuber» star ETTER de geografiske kildene og FOR de rene
// karttreffene. Den fyller hullet der geografien ikke gir noe — ikke
// foran den der den gjor det: en stampub tvers over byen er et darligere
// svar enn en fotballpub i nabogata. Sto den forst, gikk den foran, og en
// test fanget nettopp det.
export const FORSLAG_KILDER = [
  "bekreftede", "ligapuber", "dine", "kjenteNaer", "kjenteVedArena",
  "stampuber", "kjenteIByen", "naerDeg", "vedArena",
];

// «ligapuber» star rett ETTER `bekreftede` og for alt annet. Den svarer
// pa KAMPEN — «dette stedet sender Eliteserien» — mens de geografiske
// kildene bare svarer pa stedet. Bare ★ er sterkere: der har et menneske
// sett pa nettopp denne kampen.
//
// Den er likevel ikke en ny vei INN i lista. Kandidatene kommer fra de
// geografiske kildene, og kilden siler dem. Et sted i Oslo som sender
// Eliteserien er ikke et svar for den som star i Trondheim, og uten den
// silinga var vi tilbake til feilen stampubene ble tommet for a unnga.

// «kjenteIByen» og «stampuber» motes aldri i den samme lista, og det er
// ikke tilfeldig: stampubene tommes i det en posisjon lander, og
// kjenteIByen krever en posisjon for a vite hvilken by du star i. De
// dekker hver sin halvdel av det samme hullet — den ene uten posisjon,
// den andre med.

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
      // Ligamerket ma samles som de andre: vinner `bekreftede` plassen,
      // ligger flagget i en kilde lenger ned, og uten dette forsvant det.
      if (p.senderLigaen && !eks.senderLigaen) eks.senderLigaen = p.senderLigaen;
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

/* ---------- ligaene et sted sender ---------- */

// «Viser alt»-flagget, meldt 19. september 2026. Formen er ikke «viser
// alle kamper», for det kan nesten ingen: kamper KOLLIDERER. Tre
// Eliteserie-kamper kl. 15 blir tre pastander der et sted med én skjerm
// bare kan innfri én. Pastanden er derfor pa LIGANIVA — «vi sender
// Eliteserien» — og det er noe et sted faktisk kan si sant.
//
// Samme innsikt som kanaler.js: «Rettighetene er en egenskap ved LIGAEN,
// ikke ved kampen.» Det gjelder stedet som viser dem ogsa.
//
// MERKET ER SVAKERE ENN ★, og det er hele poenget. ★ betyr «admin
// krysset av denne kampen» — datert, signert, per kamp. Lot vi flagget
// produsere ★, ville merket stille blitt omdefinert til «noen sa en gang
// at de pleier», pa kamper ingen har sett pa.
//
// FORELDELSEN ER DET FARLIGSTE. Hver annen opplysning her doer av seg
// selv: en avkryssing doer nar kampen er spilt. Et staende flagg doer
// aldri — stedet mister rettighetene, bygger om, legger ned sportsrommet,
// og flagget lover kamper i manedsvis.
//
// Derfor utloper det ved SESONGSLUTT, og det trengs ikke en eneste ny
// dato for a regne det ut: `sesongFor()` vet alt forskjellen pa en
// kalenderliga og en host-var-liga, med juli som skille. Et flagg gjelder
// sa lenge sesongen det ble sjekket i, fortsatt er den vi star i.
//
//     Eliteserien sjekket 19.09.2026 → utloper ved nyttar
//     Premier League sjekket 19.09.2026 → overlever nyttar, utloper i juli
//
// Én funksjon, to riktige svar, og ingen egen utlopsdato som kan gli fra
// den appen ellers regner med.
export function ligaflaggGjelder(ligaer, nokkel, naa) {
  if (!ligaer || typeof ligaer !== "object" || !nokkel) return false;
  const sender = Array.isArray(ligaer.sender) ? ligaer.sender : [];
  if (sender.indexOf(nokkel) === -1) return false;
  // Kilde og dato, som for kanalene og kontaktfeltene: en pastand om
  // virkeligheten uten «hvordan vet vi det» slipper ikke gjennom.
  if (!kildeHolder(ligaer.kilde)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ligaer.sjekket || ""))) return false;

  const liga = ligaFor(nokkel);
  if (!liga) return false;
  const sjekket = new Date(String(ligaer.sjekket) + "T12:00:00Z");
  if (Number.isNaN(sjekket.getTime())) return false;
  return sesongFor(liga, sjekket) === sesongFor(liga, naa || new Date());
}

// Stedene som sender ligaen denne kampen spilles i. Geografien er ALT
// gjort av den som kaller: et sted i Oslo som sender Eliteserien er ikke
// et svar for den som star i Trondheim, og kilden far derfor kandidatene
// inn framfor a lete i hele lista selv.
export function ligapuberAv(kandidater, kamp, naa) {
  const nokkel = kamp && kamp.liga;
  if (!nokkel) return [];
  return (Array.isArray(kandidater) ? kandidater : [])
    .filter((p) => p && ligaflaggGjelder(p.ligaer, nokkel, naa));
}

// Teksten pa merket. Den NAVNGIR ligaen med vilje: «viser vanligvis
// kamper» ville latt leseren tro det gjaldt kampen hen ser pa, ogsa nar
// stedet ikke sender den ligaen i det hele tatt.
export function ligamerkeTekst(nokkel) {
  const liga = ligaFor(nokkel);
  return liga ? "Sender " + liga.navn : "";
}

/* ---------- nar posisjonen uteblir ---------- */

// Fire helt ulike ting kan ha skjedd, og de krever ulike ting av den som
// leser: et nei kan gjores om, en maling som ikke kom fram kan proves pa
// nytt under apen himmel, og en nettleser uten posisjon kan ingen av
// delene. I appen sto de som ett stille `return` til 19. september 2026,
// og da var «Fant ingen puber i naerheten» det eneste pa skjermen — en
// setning som ikke er sann. Vi fant ingenting fordi vi aldri fikk vite
// hvor «naer» var, og de to er ikke det samme: den forste ber deg skrive
// navnet selv, den andre ber deg trykke ja.
//
// Kodene er nettleserens egne (GeolocationPositionError); 0 er tilfellet
// der API-et ikke finnes i det hele tatt og ingen kode blir gitt.
const POSISJON_GRUNN = {
  0: "Nettleseren gir ikke posisjon",
  1: "Du sa nei til posisjon",
  2: "Telefonen fant ikke posisjonen",
  3: "Posisjonen kom ikke fram i tide",
};

export function posisjonsfeil(kode) {
  const grunn = POSISJON_GRUNN[kode] || "Fikk ikke posisjonen";
  return grunn + ", så stedene nær deg står ikke her.";
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
// alt er bra. pubnavn er navnene fra puber.js: kontaktopplysninger
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
// lista, og det var med vilje: `puber.js` baerer en redaksjonell
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
    // Ligaflagget kommer som det ligger i basen, eller ikke i det hele
    // tatt. En tom verdi er «ingen pastand», ikke et tomt flagg.
    ligaer: (r && r.ligaer && typeof r.ligaer === "object") ? r.ligaer : null,
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
    // Ligaflagget lagres som det er, eller som null. Et tomt flagg og
    // «ingen pastand» skal vaere den samme raden i basen.
    ligaer: ligaflaggTilBase(p.ligaer),
    fjernet: !!p.fjernet,
  };
}

// Flagget slik det skal ligge: bare kjente liganokler, kilde og dato
// trimmet, og null nar det ikke star igjen noe a pasta. Sesongen lagres
// IKKE — den leses av `sjekket` gjennom sesongFor(), sa to felt aldri kan
// si hver sin sesong om det samme flagget.
export function ligaflaggTilBase(flagg) {
  if (!flagg || typeof flagg !== "object") return null;
  const sender = (Array.isArray(flagg.sender) ? flagg.sender : [])
    .map((n) => String(n).trim())
    .filter((n) => !!ligaFor(n));
  if (!sender.length) return null;
  return {
    sender: Array.from(new Set(sender)),
    kilde: String(flagg.kilde || "").trim(),
    sjekket: String(flagg.sjekket || "").slice(0, 10),
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
  if (p.ligaer) ut.ligaer = p.ligaer;
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

// Vokter ligaflagget. Tom liste betyr at alt er bra — og et flagg som
// ikke finnes er helt greit: de aller fleste steder har ingen.
export function sjekkLigaflagg(flagg) {
  if (flagg === null || flagg === undefined) return [];
  if (typeof flagg !== "object") return ["ligaflagget er ikke et oppslag"];
  const sender = Array.isArray(flagg.sender) ? flagg.sender : [];
  // Ingen ligaer krysset av er ingen pastand, og da kreves ingenting.
  if (!sender.length) return [];

  const feil = [];
  const ukjent = sender.filter((n) => !ligaFor(String(n)));
  if (ukjent.length) feil.push("ukjent liga " + ukjent.join(", "));
  if (!kildeHolder(flagg.kilde)) {
    feil.push("ligaene mangler kilde (en lenke, eller minst "
      + KILDE_MIN_ORD + " ord)");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(flagg.sjekket || ""))) {
    feil.push("ligaene mangler dato");
  }
  return feil;
}

/* ---------- sla opp et sted i OpenStreetMap ---------- */

// Portalen skal slippe a gjette koordinater. Kommentaren i puber.js
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
  // \p{L} er «en bokstav, uansett sprak». Klassen var en handskrevet liste
  // med AEOA og norske tegn til 17. september 2026, og da falt alt annet
  // ut som mellomrom: «Grunerlokka» ble «Gr nerlokka» og «Cafe Sara» ble
  // «Caf Sara» — to steder i Oslo, begge usokbare. Det som ma vaske bort
  // er hermetegn, apostrof og bakoverstrek, og dem slipper \p{L} like lite
  // gjennom som lista gjorde.
  return String(navn || "")
    .replace(/[^0-9\p{L}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// Hvor lang en bit ma vaere for den kreves. «The», «Pub» og «Bar» star i
// halve Oslo: de gjor sporringen strengere uten a gjore den mer
// treffsikker, og «The Dubliner Folk Pub» skal finne «Dubliner Folk Pub».
const SOK_MIN = 4;

// Hvor mange sekunder Overpass far. Tallet star ETT sted fordi det gjorde
// det i to: sporringen ba om «[timeout:12]» mens tjenesten la pa etter
// seks sekunder. Da svarte portalen «Fikk ikke svar fra OpenStreetMap»
// om en tjener som holdt pa a svare — vi var den som ga opp, og
// meldingen la skylda et annet sted.
//
// Atte, ikke seks. Seks var malt for lavt: to av fire speil ble avbrutt
// midt i arbeidet pa 6480 ms mens de to andre svarte med feil. Netlify
// gir funksjonen ti sekunder i alt, sa fristen kan ikke opp uten a spise
// av marginen — SOK_TAK vokter den grensa, og en test slar ut hvis noen
// setter tallet forbi den.
export const SOK_SEKUNDER = 8;

// Netlifys tak for en synkron funksjon. Sprenger vi det, far admin
// Netlifys egen feilside framfor svaret vart — uten et ord om hvem som
// sviktet, som er nettopp det `forsok` finnes for a fortelle.
export const SOK_TAK = 10000;

// Ramma soket faller tilbake pa nar ingen by er valgt. Oslo er der de
// fleste radene star, og en boks er palagt: Overpass uten avgrensning
// leter i hele verden, og «Andy's Pub» finnes i mange land.
//
// Sto her som den ENESTE ramma til 18. september 2026, og da kunne
// portalen ikke finne et sted utenfor Oslo i det hele tatt. `rammeFor()`
// gir de andre byene; denne er defaulten, ikke grensa.
export const OSLO_RAMME = rammeFor("oslo");

function osmHode() {
  return "[out:json][timeout:" + SOK_SEKUNDER + "];";
}

function osmBoks(ramme) {
  const r = ramme || OSLO_RAMME;
  return "(" + r.lat[0] + "," + r.lon[0] + "," + r.lat[1] + "," + r.lon[1] + ")";
}

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
  //
  // Ett filter per ord, ikke ett regex med lookahead. Overpass ANDer
  // flere filtre pa samme nokkel, sa de to formene betyr det samme — men
  // «(?=.*ord)» krever et regex-bygg som stotter lookahead, og
  // overpass.osm.ch svarte HTTP 400 pa hvert eneste sok. Et speil som
  // ikke kan lese sporringen var er et speil vi ikke har. Her er det
  // ingenting a vinne pa den formen: den var kortere a skrive, og det er
  // alt.
  const filtre = ord.map((o) => '["name"~"' + o + '",i]').join("");
  const boks = osmBoks(r);
  return osmHode() + "nwr" + filtre + boks + ";out center;";
}

// Treffene, formet som portalen vil ha dem: navn, koordinat og adressen
// OSM har, hvis den har en. Nummeret star etter gata, som i lista.
function osmRader(json) {
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
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function tolkNavnTreff(json, maks) {
  return osmRader(json).filter((p) => p.navn).slice(0, maks || 8);
}

/* ---------- sla opp en adresse ---------- */

// Navnesoket finner ikke et sted OpenStreetMap ikke kjenner navnet pa, og
// det er de sma stedene — nettopp de admin ma foere inn for hand. Men
// adressen star i OSM likevel: norske adresser er importert fra
// Kartverket, og huset finnes selv om puben i forste etasje ikke gjor
// det. «Berglyveien 4J» gir da koordinatet, og admin skriver navnet selv.
//
// Nummeret skilles fra gata fordi OSM har dem i to tagger. Bokstaven
// hoerer til nummeret: «4J» er husnummeret, ikke «4» pluss noe.
export function delAdresse(adresse) {
  const vasket = osmNavnVask(adresse);
  if (!vasket) return null;
  const biter = vasket.split(" ").filter(Boolean);
  // Nummeret star **rett etter gata**, ikke sist. Det sto «sist» til
  // 17. september 2026, og da veltet alt som kom etter: «Torggata 11,
  // Oslo» ble slatt opp som gata «Torggata 11 Oslo», forankret med ^$, og
  // ga null treff. Et innsendt forslag baerer nesten alltid et poststed
  // eller et postnummer — det er slik folk skriver en adresse.
  //
  // Sa: forste bit pa nummerform avslutter gata, og alt etter den er
  // poststed, postnummer eller «Oslo» og kastes.
  const NUMMER = /^[0-9]+\p{L}?$/u;
  let nummerPa = -1;
  for (let i = 1; i < biter.length; i += 1) {
    if (NUMMER.test(biter[i])) { nummerPa = i; break; }
  }
  const erNummer = nummerPa > -1;
  const gate = (erNummer ? biter.slice(0, nummerPa) : biter).join(" ");
  const siste = erNummer ? biter[nummerPa] : "";
  // Bare et husnummer er ingen adresse. Uten dette ville «4J» blitt slatt
  // opp som gatenavn, og et tomt svar ser ut som «huset finnes ikke».
  // Sjekken ma kjenne igjen nummerformen, ikke bare lete etter en
  // bokstav: «4J» har en.
  const BARE_NUMMER = NUMMER;
  if (!gate || BARE_NUMMER.test(gate)) return null;
  return { gate, nummer: erNummer ? siste : "" };
}

export function osmAdresseSporring(adresse, ramme) {
  const delt = delAdresse(adresse);
  if (!delt) return "";
  const boks = osmBoks(ramme);
  // Forankret med ^$: «Berglyveien» skal ikke treffe «Berglyveien
  // Terrasse». Uten nummer star gata alene, og da kan det bli mange hus —
  // lista kappes, og portalen sier at nummeret gjor soket smalere.
  let filter = 'nwr["addr:street"~"^' + delt.gate + '$",i]';
  if (delt.nummer) filter += '["addr:housenumber"~"^' + delt.nummer + '$",i]';
  return osmHode() + filter + boks + ";out center;";
}

// Et hus har som regel ingen `name`. Navnesoket kaster de radene; her er
// de hele poenget, sa adressen star som overskrift nar navnet mangler.
export function tolkAdresseTreff(json, maks) {
  return osmRader(json)
    .filter((p) => p.adresse || p.navn)
    .map((p) => Object.assign({}, p, { navn: p.navn || p.adresse }))
    .slice(0, maks || 8);
}

/* ---------- koordinat fra en kartlenke ---------- */

// Siste utvei, og den eneste som ikke trenger at OpenStreetMap svarer:
// admin apner stedet i det kartet hen alt bruker og limer inn lenka.
//
// Google legger stedets eget punkt i «!3d…!4d…» og kartets midtpunkt i
// «@…». De er ikke det samme — star du zoomet ut, er midtpunktet et
// stykke unna huset — sa stedets punkt leses forst.
//
// En kortlenke (maps.app.goo.gl) baerer ingen koordinater i det hele
// tatt. Den ma sies ifra om, ikke tolkes som «fant ingenting»: det ene er
// «apne lenka og kopier den lange», det andre er «dette er feil lenke».
export function koordinatFraLenke(tekst) {
  const t = String(tekst || "").trim();
  if (!t) return null;
  if (/(goo\.gl|maps\.app\.goo\.gl|g\.co)\//i.test(t)) {
    return { feil: "Kortlenker bærer ingen koordinater. Åpne den i kartet"
      + " først, og kopier adressen fra adressefeltet." };
  }

  const tall = "(-?\\d{1,3}\\.\\d{3,})";
  const monstre = [
    // Google: stedets eget punkt.
    new RegExp("!3d" + tall + "!4d" + tall),
    // OpenStreetMap: markoren.
    new RegExp("[?&]mlat=" + tall + "&mlon=" + tall, "i"),
    // OpenStreetMap: kartutsnittet, «#map=17/59.91/10.75».
    new RegExp("#map=\\d+/" + tall + "/" + tall, "i"),
    // Google: kartets midtpunkt.
    new RegExp("@" + tall + "," + tall),
    // «geo:», og et par tall limt inn rett fra et kart. Parentesene er
    // med fordi kartene setter dem der: Google gir «(59.833974,
    // 10.806229)» nar punktet kopieres fra stedskortet, og uten dem her
    // sa admin «Fant ingen koordinater» pa et koordinat som sto rett
    // foran hen. Hakeparentes for den som limer fra en liste.
    new RegExp("(?:geo:|[?&]q=|^[\\s(\\[]*)\\s*" + tall + "\\s*[,\\s]\\s*" + tall, "i"),
  ];

  for (const m of monstre) {
    const traff = t.match(m);
    if (traff) {
      const lat = Number(traff[1]);
      const lon = Number(traff[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }
  return { feil: "Fant ingen koordinater i det du limte inn." };
}

/* ---------- falsk posisjon, for a teste andre byer ---------- */

// Pubene rundt deg kommer fra Overpass, og Overpass svarer pa hvor du
// star. Skal noen se hva appen gir i Bodo uten a reise dit, ma posisjonen
// kunne settes. Meldt 18. september 2026: «vi ma finne ut hvordan vi kan
// teste det sa reelt som mulig uten a ha noen fysisk der».
//
// «?posisjon=bodo», «?posisjon=Bodø» eller «?posisjon=67.28,14.40».
//
// Navnet foldes, sa «Bodø» og «bodo» er samme by — den som taster dette
// pa en telefon skal slippe a treffe o-en. Ren funksjon: den leser en
// streng, ikke `location`, sa den kan males uten nettleser.
//
// Null nar ingenting er satt, og null nar verdien er tull. Et tall
// utenfor kloden er ikke en posisjon, og a late som ville gitt et tomt
// pubsok uten at noen skjonte hvorfor.
export function falskPosisjon(sok) {
  const tekst = String(sok || "");
  const treff = tekst.match(/[?&]posisjon=([^&]*)/);
  if (!treff) return null;
  const verdi = decodeURIComponent(treff[1] || "").trim();
  if (!verdi) return null;

  const by = BYER[normaliserLagnavn(verdi)];
  if (by) return { navn: by.navn, lat: by.lat, lon: by.lon, kilde: "by" };

  const tall = verdi.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!tall) return null;
  const lat = Number(tall[1]);
  const lon = Number(tall[2]);
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return null;
  return { navn: lat.toFixed(3) + ", " + lon.toFixed(3), lat, lon, kilde: "koordinat" };
}
