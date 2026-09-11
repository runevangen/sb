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
  OVERPASS_SPEIL, overpassHeadere, restTid,
} from "../../pub-data.js";

const ENTUR = "https://api.entur.io/journey-planner/v3/graphql";
export const LEVETID_PUBER = 86400;
const IDENTITET = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";

// Netlify avbryter funksjonen etter ti sekunder. Vi holder oss godt
// innenfor, sa svaret vart — og forsok-lista i det — rekker ut.
const SAMLET_FRIST = 8000;
const PER_TJENER = 3000;

function medFrist(ms) {
  const styring = new AbortController();
  const vakt = setTimeout(() => styring.abort(), ms);
  return { signal: styring.signal, ferdig: () => clearTimeout(vakt) };
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

// Prover tjenerne i tur, hver med sin frist. Forste som svarer med puber
// vinner; hvert forsok forklares i forsok-lista. null nar ingen svarte.
async function hentPuber(arena, forsok, frist) {
  const sporring = "data=" + encodeURIComponent(overpassSporring(arena.lat, arena.lon, 1200));
  for (const adresse of OVERPASS_SPEIL) {
    const vert = new URL(adresse).host;
    const notat = { kilde: "Overpass " + vert };
    const ms = restTid(frist, Date.now(), PER_TJENER);
    if (!ms) {
      forsok.push(Object.assign(notat, { utfall: "tiden var ute" }));
      break;
    }
    const vakt = medFrist(ms);
    const startet = Date.now();
    try {
      const respons = await fetch(adresse, {
        method: "POST", headers: overpassHeadere(true), body: sporring, signal: vakt.signal,
      });
      notat.status = respons.status;
      if (!respons.ok) {
        const kropp = (await respons.text().catch(() => "")).replace(/\s+/g, " ").trim();
        if (kropp) notat.melding = kropp.slice(0, 80);
        throw new Error("HTTP " + respons.status);
      }
      const liste = tolkPuber(await respons.json(), arena);
      notat.antall = liste.length;
      notat.ms = Date.now() - startet;
      forsok.push(notat);
      return liste;
    } catch (err) {
      console.error("[puber] Overpass " + vert + " feilet:", err);
      notat.utfall = String(err && err.message || err).slice(0, 80);
      notat.ms = Date.now() - startet;
      forsok.push(notat);
    } finally {
      vakt.ferdig();
    }
  }
  return null;
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
