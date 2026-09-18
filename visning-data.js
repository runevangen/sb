// Rene funksjoner for visninger: hvilke puber viser hvilke kamper.
// Ingen DOM, ingen nettverk, ingen lagring.

import { normaliserLagnavn, kampNokkel, gyldigKampId } from "./fotball-data.js";

// Kampens identitet, som i fotball.js: nokkelen, ikke kildens id.
// Sto det en id her, forsvant «denne kampen vises pa» i det
// oyeblikket runden kom fra den andre kilden.
function nokkelFor(kamp) {
  if (!kamp) return "";
  return String(kamp.nokkel || kampNokkel(kamp) || (kamp.id == null ? "" : kamp.id));
}

// Nokkelen er det eneste som treffer. Radene i basen skrives alltid med
// nokkel; den gamle tall-id-en fra visninger.js i repoet er borte med
// fila (#79), og en gren som ogsa godtok den var en gren ingen rad
// lenger tok.
function samme(kamp, v) {
  const n = nokkelFor(kamp);
  return !!n && String(v.kampId) === n;
}

export const VISNING_FELT = ["pub", "kampId", "kamp", "dato", "satt"];

// Kamp-id-ene for kampene som sto pa skjermen. Tjenesten trenger dem for
// a rydde bort puben sine rader for akkurat de kampene, og ingen andre.
export function kampIderFor(kamper) {
  return (kamper || []).map(nokkelFor).filter(Boolean);
}

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
    if (!gyldigKampId(v.kampId)) feil.push(hvor + ": kampId har ugyldig form");
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
  return alle.filter((v) => samme(kamp, v));
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

// Radene en pub far for de kampene admin krysset av, sortert pa dato.
// Avkrysningene kommer som nokler fra portalen. Det som alt star i basen
// rores ikke her: visninger.mjs sletter og skriver bare forskjellen
// (visningsDiff), sa en kamp som ikke var pa skjermen star som for.
export function slaSammen(pub, valgteIder, kamper, naa) {
  const tid = new Date(naa || Date.now()).toISOString();
  const valgt = (valgteIder || []).map(String);
  return (kamper || [])
    .filter((k) => valgt.indexOf(nokkelFor(k)) > -1)
    .map((k) => ({
      pub,
      kampId: nokkelFor(k),
      kamp: k.hjemme + " – " + k.borte,
      dato: k.dato,
      satt: tid,
    }))
    .sort((a, b) => String(a.dato).localeCompare(String(b.dato)));
}

/* ---------- fra lageret ---------- */

// Radene slik PostgREST gir dem, formet som appen vil ha dem.
//
// **Ma tale a kjores to ganger.** Funksjonen deles mellom tjenesten og
// appen, og det var nettopp det som veltet «blir med»-lista: `svar.mjs`
// tolket radene for den svarte, `fotball.js` tolket svaret en gang til,
// og andre gang fantes ikke `kamp_id` — feltet het `kampId`. Hver rad ble
// noklet under «», og lista var usynlig for alle i tre dager. Derfor
// leses begge formene her, og en enhetstest krever at to kjoringer gir
// noyaktig det samme som en.
export function tolkVisninger(rader) {
  return (Array.isArray(rader) ? rader : []).map((r) => ({
    pub: String((r && r.pub) || ""),
    kampId: String((r && (r.kamp_id != null ? r.kamp_id : r.kampId)) || ""),
    kamp: String((r && r.kamp) || ""),
    dato: (r && r.dato) || "",
    satt: (r && r.satt) || "",
  })).filter((v) => v.pub && v.kampId);
}

// Den andre veien: en rad klar for tjenesten. `satt_av` star ikke her:
// databasen setter den fra okten med `default auth.uid()`, som `bruker` i
// kampsvar. Funksjonen sender den aldri selv, sa en feil her kan ikke
// skrive i en annens navn — og defaulten er halvparten av det: uten den
// blir kolonnen bare staende tom, og det sto den i ett dogn.
export function visningRad(v) {
  return {
    pub: String(v.pub),
    kamp_id: String(v.kampId),
    kamp: String(v.kamp || ""),
    dato: v.dato || null,
    satt: v.satt || new Date().toISOString(),
  };
}

/* ---------- hva portalen sier om det som alt er satt ---------- */

// «Viser 5 kamper fra for» var sant og ubrukelig pa samme tid. Meldt 17.
// september 2026: admin sa tre avkryssinger, hinten sa fem, og sluttet at
// to var borte. De to sto lenger ned enn skjermen rakk.
//
// Tallet alene svarer ikke pa sporsmalet admin faktisk har — *ble det jeg
// lagret staende?* Det gjor et tall som sier hvor de er.
//
// Og det gamle tallet talte pa tvers av ligaer mens boksene under viste
// én. Har puben to kamper i Premier League, sa hinten fem der Eliteserien
// kunne vise tre — og forskjellen sa ut som tap.
export function visningsHint(antall, iLista, pub) {
  const hvem = pub ? pub + " viser " : "Viser ";
  if (!antall) return "Ingen kamper satt på denne puben ennå.";
  const kamp = (n) => n + (n === 1 ? " kamp" : " kamper");
  if (iLista >= antall) {
    return hvem + kamp(antall) + " fra før, "
      + (antall === 1 ? "og den står" : "alle i lista") + " under.";
  }
  const andre = antall - iLista;
  // Star ingen av dem i denne ligaen, er «0 i denne ligaen» en omvei.
  if (!iLista) {
    return hvem + kamp(antall) + " fra før, ingen av dem i denne ligaen.";
  }
  return hvem + kamp(antall) + " fra før — " + iLista + " i denne ligaen, "
    + andre + " i en annen.";
}

// Antall valgte i en runde, til overskrifta over den. Uten dette ma admin
// rulle gjennom hele lista for a vite om noe er krysset av lenger nede.
export function rundeTall(valgt, alle) {
  if (!alle) return "";
  return valgt + " av " + alle + " valgt";
}

/* ---------- hva en lagring faktisk endrer ---------- */

// Meldt 18. september 2026: «Jeg kommer inn, fem kamper er markert, jeg
// legger til én, og da står det 6 lagret. Egentlig så lagrer bruker 1 da.»
//
// Det var sant to ganger. Knappen talte hele valget framfor endringen —
// og tjenesten skrev hele valget, ogsa de fem radene som alt la der. De
// fikk nytt `satt` og ny `satt_av` hver gang noen lagret, sa feltet som
// skal si NAR noen satte kampen, sa i stedet «sist noen trykket lagre».
// Ingen sa det, for `satt` vises ikke — men et felt som stille blir usant
// er verre enn et som ropes ut, fordi ingenting avsloerer det.
export function visningsDiff(fraFor, onsket) {
  const har = new Set((Array.isArray(fraFor) ? fraFor : []).map((v) => String(v.kampId)));
  const vil = new Set((Array.isArray(onsket) ? onsket : []).map((v) => String(v.kampId)));
  return {
    nye: (Array.isArray(onsket) ? onsket : []).filter((v) => !har.has(String(v.kampId))),
    fjern: (Array.isArray(fraFor) ? fraFor : []).filter((v) => !vil.has(String(v.kampId))),
    uendret: (Array.isArray(fraFor) ? fraFor : []).filter((v) => vil.has(String(v.kampId))),
  };
}

// Knappen sier hva trykket kommer til a gjore, ikke hvor mange kamper som
// star avkrysset. «Lagre 6 kamper» nar du la til én er sant om det som
// sendes og usant om det du gjor.
export function lagreKnappTekst(lagt, fjernet, igjen, pub) {
  const til = pub ? " for " + pub : "";
  const kamp = (n) => n + (n === 1 ? " kamp" : " kamper");
  if (!lagt && !fjernet) {
    return igjen ? "Lagret" + til : "Ingen kamper satt" + til;
  }
  if (lagt && !fjernet) return "Legg til " + kamp(lagt) + til;
  if (!lagt && fjernet) {
    // Fjerner du de siste, er det en annen handling enn a fjerne noen av
    // dem — og den fortjener sine egne ord.
    return igjen ? "Fjern " + kamp(fjernet) + til : "Fjern alle kamper" + til;
  }
  return "Legg til " + kamp(lagt) + " og fjern " + fjernet + til;
}
