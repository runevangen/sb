// Rene funksjoner for visninger: hvilke puber viser hvilke kamper.
// Ingen DOM, ingen nettverk, ingen lagring.

import { normaliserLagnavn } from "./fotball-data.js";

export const VISNING_FELT = ["pub", "kampId", "kamp", "dato", "satt"];

// Vokter formen, som sjekkPubliste gjor for publista. Gir en liste med
// det som er galt; tom liste betyr at alt er bra. pubnavn er navnene fra
// puber-oslo.js: en visning pa en pub vi ikke kjenner, er en skrivefeil.
export function sjekkVisninger(liste, pubnavn) {
  if (!Array.isArray(liste)) return ["Visningene er ikke en liste"];
  const kjent = new Set((pubnavn || []).map(normaliserLagnavn));
  const sett = new Set();
  const feil = [];
  liste.forEach((v, i) => {
    const hvor = "rad " + (i + 1) + " (" + ((v && v.pub) || "uten pub") + ")";
    if (!v || typeof v !== "object") { feil.push(hvor + ": ikke et objekt"); return; }
    VISNING_FELT.forEach((felt) => {
      if (v[felt] === undefined || v[felt] === "") feil.push(hvor + ": mangler " + felt);
    });
    if (kjent.size && !kjent.has(normaliserLagnavn(v.pub))) {
      feil.push(hvor + ": ukjent pub");
    }
    if (!Number.isFinite(Number(v.kampId))) feil.push(hvor + ": kampId er ikke et tall");
    if (v.dato && Number.isNaN(Date.parse(v.dato))) feil.push(hvor + ": dato er ikke en dato");
    if (v.satt && Number.isNaN(Date.parse(v.satt))) feil.push(hvor + ": satt er ikke et tidspunkt");
    const nokkel = normaliserLagnavn(v.pub) + "@" + v.kampId;
    if (sett.has(nokkel)) feil.push(hvor + ": samme pub og kamp to ganger");
    sett.add(nokkel);
  });
  return feil;
}

// Pubene som viser en gitt kamp, i den rekkefolgen de ble satt.
export function visningerFor(kamp, alle) {
  if (!kamp || !Array.isArray(alle)) return [];
  return alle.filter((v) => String(v.kampId) === String(kamp.id));
}

// Pubene som har bekreftet denne kampen, med det vi ellers vet om dem
// fra den kuraterte lista — bydel, stamlag, koordinater. Sta navnet i
// visningen ikke igjen i lista, brukes navnet slik det ble skrevet: en
// pub som er fjernet fra publista skal ikke forsvinne stumt.
export function bekreftetFor(kamp, alle, kjente) {
  const kjent = new Map((kjente || []).map((p) => [normaliserLagnavn(p.navn), p]));
  return visningerFor(kamp, alle).map((v) => {
    const pub = kjent.get(normaliserLagnavn(v.pub));
    return Object.assign({}, pub || {}, {
      navn: (pub && pub.navn) || v.pub,
      bekreftet: true,
    });
  });
}

// Merker de av trefftene som har bekreftet kampen, sa en pub naer deg
// ser lik ut uansett hvilken gruppe den dukker opp i. Samme mekanikk som
// merkKuraterte i pub-data.js.
export function merkBekreftet(puber, bekreftede) {
  const sett = new Set((bekreftede || []).map((p) => normaliserLagnavn(p.navn)));
  return (puber || []).map((p) =>
    sett.has(normaliserLagnavn(p.navn)) ? Object.assign({}, p, { bekreftet: true }) : p);
}

// Setter visningene for en pub innenfor et kjent sett kamper, og lar
// alle andre rader sta. Da kan admin rette opp en runde uten a rore
// resten, og uten at en kamp som ikke var pa skjermen forsvinner.
export function slaSammen(alle, pub, valgteIder, kamper, naa) {
  const beholdt = (Array.isArray(alle) ? alle : []).filter((v) => {
    if (normaliserLagnavn(v.pub) !== normaliserLagnavn(pub)) return true;
    return !kamper.some((k) => String(k.id) === String(v.kampId));
  });
  const tid = new Date(naa || Date.now()).toISOString();
  const nye = kamper
    .filter((k) => valgteIder.map(String).indexOf(String(k.id)) > -1)
    .map((k) => ({
      pub,
      kampId: Number(k.id),
      kamp: k.hjemme + " – " + k.borte,
      dato: k.dato,
      satt: tid,
    }));
  return beholdt.concat(nye).sort((a, b) =>
    String(a.dato).localeCompare(String(b.dato)) || String(a.pub).localeCompare(String(b.pub)));
}

// Kamper som allerede er spilt har ingen verdi her, og lista ville vokst
// uten ende. Ryddes hver gang admin lagrer.
export function utenGamle(alle, naa, dager) {
  const grense = (naa || Date.now()) - (dager || 2) * 86400000;
  return (Array.isArray(alle) ? alle : [])
    .filter((v) => !v.dato || Date.parse(v.dato) >= grense);
}

/* ---------- fila ---------- */

const HODE = `// Hvilke kamper pubene viser. Skrives av admin-portalen pa /admin.html,
// ikke for hand — men fila er lesbar og kan rettes for hand om noe gar
// galt.
//
// Den ligger i koden, som puber-oslo.js, av samme grunn: da trenger
// leseren ingen nettkall for a se hvem som viser kampen, og historikken
// star i git. Det koster en utrulling per lagring, som er greit sa lenge
// det er en admin. Skal puber skrive selv (#65), ma dette flyttes til et
// ekte lager.
//
// Lista er gyldig JSON med vilje: da kan funksjonen lese tilbake den
// ekte tilstanden fra GitHub framfor a stole pa en utrullet kopi, som
// ville vaert utdatert mellom to lagringer.
//
// pub ma stemme med et navn i puber-oslo.js. kampId er id-en fra
// terminlisten. kamp og dato star her for at fila skal vaere lesbar
// alene; det er kampId som gjelder.

export const VISNINGER = [`;

// Skriver fila. En rad per linje, sortert, sa en diff i git viser hva
// som faktisk ble endret framfor en omstokking av hele lista.
export function visningerFil(liste) {
  const rader = (liste || []).map((v) => "  " + JSON.stringify({
    pub: String(v.pub),
    kampId: Number(v.kampId),
    kamp: String(v.kamp),
    dato: String(v.dato),
    satt: String(v.satt),
  }));
  return HODE + (rader.length ? "\n" + rader.join(",\n") + "\n" : "") + "];\n";
}

// Leser lista ut igjen. Funksjonen henter fila fra GitHub for a skrive
// den, og ma da vite hva som star der na — ikke hva som var utrullet.
export function lesVisninger(tekst) {
  const s = String(tekst || "");
  const start = s.indexOf("export const VISNINGER = [");
  if (start === -1) throw new Error("Fant ikke VISNINGER i fila");
  const fra = s.indexOf("[", start);
  const til = s.lastIndexOf("]");
  if (til <= fra) throw new Error("Fant ikke slutten pa lista");
  const liste = JSON.parse(s.slice(fra, til + 1));
  if (!Array.isArray(liste)) throw new Error("VISNINGER er ikke en liste");
  return liste;
}
