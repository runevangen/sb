// «Mitt lag»: de rene funksjonene. Ingen DOM, ingen nettverk, ingen
// lagring — delt mellom fotball.js og testene.
//
// Siden samler det appen alt vet om favorittlaget ditt: plassen i
// tabellen, formen, neste kamp og de siste. **Den henter ingenting nytt.**
// Tabellen, resultatene og de kommende kampene hentes allerede per liga og
// caches pa Netlifys kant (LEVETID i fotball-data.js), og dognkvoten er
// regnet ut for alle tre delene i alle fem ligaene. Denne fila plukker
// laget ut av svar som finnes fra for.
//
// Navnene kommer fra to kanter. Favorittlaget er det navnet stjerna i
// tabellen sa — redaksjonens skrivemate — mens kamplistene barer kildens.
// «Vålerenga» i tabellen og «Vaalerenga» i en kamp er samme lag, og
// `lagnokkel` er den foldingen som vet det (se stampuberFor i
// pub-data.js, der de to navnene motte hverandre forste gang).

import { lagnokkel } from "./pub-data.js";

export const FORM_ANTALL = 5;
export const SISTE_ANTALL = 5;
export const KOMMENDE_ANTALL = 3;
// To lag over og to under: nok til a se hva som skal til for a klatre og
// hva som puster deg i nakken, og fem rader er en tabell man leser uten a
// rulle.
export const RUNDT = 2;

export const UTFALL_NAVN = { V: "Seier", U: "Uavgjort", T: "Tap" };

export function erLaget(navn, lag) {
  const a = lagnokkel(navn);
  return !!a && a === lagnokkel(lag);
}

// Hvilken liga laget spiller i, lest av tabellene. Favorittlaget lagres
// som et navn og ingenting annet — lista folger kontoen mellom telefoner,
// og et navn er det eneste som er sant uansett hvilken tabell stjerna
// ble trykket i. Ligaen finnes ved a se hvor laget star.
//
// `tabeller` er { liga: rader }. Rekkefolgen er ligaenes, sa to ligaer som
// begge har et lag med samme navn gir den forste — og det er et navn vi
// ikke kan skille pa uansett.
export function ligaForLag(lag, tabeller) {
  const t = tabeller || {};
  return Object.keys(t).find((liga) =>
    (Array.isArray(t[liga]) ? t[liga] : []).some((r) => r && erLaget(r.lag, lag))) || null;
}

// Plassen, og hva som skiller deg fra laget over og laget under.
//
// Poengavstanden regnes av tabellen, ikke av plassen: to lag pa like
// poeng star over hverandre pa malforskjell, og «0 poeng opp» er da den
// sanne opplysningen — ikke en feil.
export function plasseringFor(rader, lag, rundt = RUNDT) {
  const liste = (Array.isArray(rader) ? rader : []).filter(Boolean);
  const i = liste.findIndex((r) => erLaget(r.lag, lag));
  if (i < 0) return null;
  const rad = liste[i];
  // Utsnittet holder fem rader ogsa overst og nederst: forste plass far
  // de fire under seg, ikke bare to.
  const bredde = rundt * 2 + 1;
  const fra = Math.max(0, Math.min(i - rundt, liste.length - bredde));
  const over = i > 0 ? liste[i - 1] : null;
  const under = i < liste.length - 1 ? liste[i + 1] : null;
  return {
    rad,
    antall: liste.length,
    utsnitt: liste.slice(fra, fra + bredde),
    over: over ? { plass: over.plass, poeng: tallEllerNull(over.poeng, rad.poeng) } : null,
    under: under ? { plass: under.plass, poeng: tallEllerNull(rad.poeng, under.poeng) } : null,
  };
}

function tallEllerNull(a, b) {
  return (typeof a === "number" && typeof b === "number") ? a - b : null;
}

// «8 poeng opp til 1. plass · 25 poeng ned til 3.» Mangler poengene, star
// ingenting — et tall vi ikke har, skal ikke bli «0 poeng».
export function avstandTekst(plassering) {
  if (!plassering) return "";
  const deler = [];
  const { over, under } = plassering;
  if (over && over.poeng != null) {
    deler.push(poeng(over.poeng) + " opp til " + over.plass + ". plass");
  }
  if (under && under.poeng != null) {
    deler.push(poeng(under.poeng) + " ned til " + under.plass + ".");
  }
  return deler.join(" · ");
}

function poeng(n) {
  return n + " poeng";
}

// Lagets spilte kamper, nyeste forst, med utfallet sett fra laget.
//
// Bare kamper med mal pa begge sider teller. «Resultater» er hele
// sesongen (#134), og kilden barer ogsa de uspilte — en kamp uten
// resultat er ikke et tap, og den er ikke uavgjort 0–0.
export function spilteFor(kamper, lag, antall = SISTE_ANTALL) {
  return (Array.isArray(kamper) ? kamper : [])
    .filter((k) => k && typeof k.malHjemme === "number" && typeof k.malBorte === "number")
    .filter((k) => erLaget(k.hjemme, lag) || erLaget(k.borte, lag))
    .sort((a, b) => nar(b) - nar(a))
    .slice(0, antall)
    .map((kamp) => {
      const hjemme = erLaget(kamp.hjemme, lag);
      const egne = hjemme ? kamp.malHjemme : kamp.malBorte;
      const deres = hjemme ? kamp.malBorte : kamp.malHjemme;
      return {
        kamp,
        hjemme,
        mot: hjemme ? kamp.borte : kamp.hjemme,
        utfall: egne > deres ? "V" : (egne < deres ? "T" : "U"),
      };
    });
}

// Formen er de siste kampene lest fra venstre mot hoyre — eldst forst, som
// en rekke man leser. Lista over er nyest forst, fordi den er en liste man
// leter i. Samme kamper, to sporsmal.
export function formFor(kamper, lag, antall = FORM_ANTALL) {
  return spilteFor(kamper, lag, antall).reverse();
}

// De neste kampene, eldst forst. En kamp som har fatt resultat er ikke
// kommende, uansett hva datoen sier; en uten dato sorteres sist.
export function kommendeFor(kamper, lag, antall = KOMMENDE_ANTALL) {
  return (Array.isArray(kamper) ? kamper : [])
    .filter((k) => k && !(typeof k.malHjemme === "number" && typeof k.malBorte === "number"))
    .filter((k) => erLaget(k.hjemme, lag) || erLaget(k.borte, lag))
    .sort((a, b) => nar(a, Infinity) - nar(b, Infinity))
    .slice(0, antall)
    .map((kamp) => ({ kamp, hjemme: erLaget(kamp.hjemme, lag),
                      mot: erLaget(kamp.hjemme, lag) ? kamp.borte : kamp.hjemme }));
}

function nar(kamp, ukjent = -Infinity) {
  const t = Date.parse(kamp && kamp.dato);
  return Number.isNaN(t) ? ukjent : t;
}
