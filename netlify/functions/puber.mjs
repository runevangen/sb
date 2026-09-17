// Pubene rundt en arena, fra OpenStreetMap (Overpass) og holdeplassene
// rundt den fra Entur, med Netlifys varige cache foran.
//
// Adressen: /api/puber?arena=<navn>. Arenaene star fast, sa hver er en
// cache-nokkel med et dogns levetid: Overpass og Entur sporres hoyst en
// gang i dognet per arena, uansett hvor mange som apner appen pa kampdag.
// Overpass ber om nettopp det (fair use), og Entur vil ha ET-Client-Name.
//
// «Naer deg» gar ikke herfra: leserens posisjon skal ikke innom oss.
// Den sporringen gar rett fra nettleseren til Overpass.

import { arenaFor } from "../../vaer-data.js";
import {
  overpassSporring, tolkPuber, enturNaermest, tolkHoldeplasser, grupperPuber,
  OVERPASS_SPEIL, overpassHeadere, restTid, overpassFeiltekst,
} from "../../pub-data.js";

const ENTUR = "https://api.entur.io/journey-planner/v3/graphql";
export const LEVETID_PUBER = 86400;
const IDENTITET = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";

// Netlify avbryter funksjonen etter ti sekunder. Vi holder oss godt
// innenfor, sa svaret vart — og forsok-lista i det — rekker ut.
const SAMLET_FRIST = 7500;
// Sporringen ber Overpass om nettopp den tida vi tenker a vente. Ba vi om
// mer, ville vi vaert den som la pa — med en melding som pekte pa den
// andre parten.
const SOK_SEKUNDER = Math.floor(SAMLET_FRIST / 1000);
const PER_TJENER = 3000;

function medFrist(ms) {
  const styring = new AbortController();
  const vakt = setTimeout(() => styring.abort(), ms);
  return {
    signal: styring.signal,
    ferdig: () => clearTimeout(vakt),
    // Stopper de som fortsatt holder pa, nar vi allerede har et svar.
    stopp: () => styring.abort(),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const arena = arenaFor(url.searchParams.get("arena") || "");
  if (!arena) return svar({ feil: "Ukjent arena" }, 400, 0);

  // De to kildene vet ingenting om hverandre, sa de sporres samtidig:
  // da bruker kallet tiden til den tregeste, ikke summen av begge.
  // 1200 m dekker bade stadion (800) og holdeplassene rundt (700 + 300).
  const frist = Date.now() + SAMLET_FRIST;
  const enturForsok = [];
  const pubForsok = [];
  const [holdeplasser, puber] = await Promise.all([
    hentHoldeplasser(arena, enturForsok, frist),
    hentPuber(arena, pubForsok, frist),
  ]);
  // Fast rekkefolge i forsok, uansett hvem som ble ferdig forst.
  const forsok = enturForsok.concat(pubForsok);
  if (!puber) return svar({ feil: "Fikk ikke svar fra OpenStreetMap", forsok }, 502, 0);

  return svar({
    arena: arena.navn,
    grupper: grupperPuber(puber, arena, holdeplasser),
    holdeplasser,
    kilde: "OpenStreetMap",
    forsok,
    oppdatert: new Date().toISOString(),
  }, 200, LEVETID_PUBER);
};

// Svikter Entur, er det fortsatt puber ved stadion. Tom liste, aldri feil.
async function hentHoldeplasser(arena, forsok, frist) {
  const notat = { kilde: "Entur nearest" };
  const vakt = medFrist(restTid(frist, Date.now(), PER_TJENER));
  try {
    const respons = await fetch(ENTUR, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ET-Client-Name": "sportsbibelen-app",
                 "User-Agent": IDENTITET },
      body: JSON.stringify({ query: enturNaermest(arena.lat, arena.lon, 700) }),
      signal: vakt.signal,
    });
    notat.status = respons.status;
    if (!respons.ok) throw new Error("HTTP " + respons.status);
    const liste = tolkHoldeplasser(await respons.json());
    notat.antall = liste.length;
    forsok.push(notat);
    return liste;
  } catch (err) {
    console.error("[puber] Entur feilet:", err);
    notat.utfall = String(err && err.message || err).slice(0, 80);
    forsok.push(notat);
    return [];
  } finally {
    vakt.ferdig();
  }
}

// Sporr alle tjenerne samtidig. Den forste som svarer med puber vinner,
// og resten avbrytes — da settler de med en gang, sa forsok-lista blir
// komplett uten a vente pa de trege. null nar ingen svarte.
async function hentPuber(arena, forsok, frist) {
  const sporring = "data=" + encodeURIComponent(overpassSporring(arena.lat, arena.lon, 1200, SOK_SEKUNDER));
  const vakt = medFrist(restTid(frist, Date.now(), SAMLET_FRIST));
  // Notatene eies her, ett per speil, og fylles pa plass.
  //
  // De ble hentet fra avvisningene for, og det loy: nar AbortController
  // avbryter, avvises ALLE kallene med det samme feilobjektet. Et notat
  // hengt pa det ble overskrevet av neste, og lista sto da med ett speil
  // to ganger og et annet ikke i det hele tatt — med samme tid pa begge.
  // En diagnostikk som forveksler to tjenere er verre enn ingen.
  const notater = OVERPASS_SPEIL.map((adresse) =>
    ({ kilde: "Overpass " + new URL(adresse).host }));
  const alle = OVERPASS_SPEIL.map((adresse, i) =>
    enTjener(adresse, sporring, arena, vakt.signal, notater[i]));

  let vinner = null;
  try {
    vinner = await Promise.any(alle);
  } catch (err) {
    // Alle feilet. Hver enkelt forklares i forsok-lista under.
  }
  vakt.ferdig();
  vakt.stopp();

  // Rekkefolgen folger OVERPASS_SPEIL, ikke hvem som ble ferdig forst.
  await Promise.allSettled(alle);
  notater.forEach((n) => forsok.push(n));
  return vinner ? vinner.liste : null;
}

function enTjener(adresse, sporring, arena, signal, notat) {
  const vert = new URL(adresse).host;
  const startet = Date.now();
  return (async () => {
    const respons = await fetch(adresse, {
      method: "POST", headers: overpassHeadere(true), body: sporring, signal,
    });
    notat.status = respons.status;
    if (!respons.ok) {
      const kropp = await respons.text().catch(() => "");
      const melding = overpassFeiltekst(kropp);
      if (melding) notat.melding = melding;
      throw new Error("HTTP " + respons.status);
    }
    const liste = tolkPuber(await respons.json(), arena);
    notat.antall = liste.length;
    notat.ms = Date.now() - startet;
    return { notat, liste };
  })().catch((err) => {
    console.error("[puber] Overpass " + vert + " feilet:", err);
    notat.utfall = String(err && err.message || err).slice(0, 80);
    notat.ms = Date.now() - startet;
    throw err instanceof Error ? err : new Error(String(err));
  });
}

function svar(kropp, status, levetid) {
  const headere = { "Content-Type": "application/json; charset=utf-8" };
  if (levetid > 0) {
    headere["Cache-Control"] = "public, max-age=0, must-revalidate";
    headere["Netlify-CDN-Cache-Control"] =
      "public, durable, s-maxage=" + levetid + ", stale-while-revalidate=86400";
  } else {
    headere["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(kropp), { status, headers: headere });
}

export const config = { path: "/api/puber" };
