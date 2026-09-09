// Henter tabellen fra API-Football og legger Netlifys varige cache foran.
//
// Nokkelen ligger i miljovariabelen FOOTBALL_API_KEY og forlater aldri
// denne funksjonen: nettleseren snakker bare med oss, aldri med API-et.
// Det er ogsa derfor dette er en funksjon og ikke en redirect slik
// WordPress-proxyen i netlify.toml er — en redirect kan ikke sette en
// hemmelig header.
//
// Adressen defineres av config nederst, ikke av en ny regel i
// netlify.toml. Da holder redirect-reglene seg like smale som for.

import { ligaFor, sesongFor, tolkTabell, LEVETID } from "../../fotball-data.js";

const API = "https://v3.football.api-sports.io";

export default async (req) => {
  const url = new URL(req.url);
  const liga = ligaFor(url.searchParams.get("liga") || "");
  if (!liga) return svar({ feil: "Ukjent liga" }, 400, 0);

  const nokkel = process.env.FOOTBALL_API_KEY;
  if (!nokkel) return svar({ feil: "Tjenesten mangler API-nokkel" }, 503, 0);

  const sesong = sesongFor(liga);
  const kilde = API + "/standings?league=" + liga.id + "&season=" + sesong;

  let json;
  try {
    const respons = await fetch(kilde, {
      headers: { "x-apisports-key": nokkel, "Accept": "application/json" },
    });
    if (!respons.ok) throw new Error("HTTP " + respons.status);
    json = await respons.json();
  } catch (err) {
    // Detaljen logges, men sendes ikke ut: den kan inneholde adressen vi
    // kaller, og den trenger ikke leseren a vite.
    console.error("[fotball] henting feilet:", err);
    return svar({ feil: "Fikk ikke svar fra API-Football" }, 502, 0);
  }

  let tabell;
  try {
    tabell = tolkTabell(json);
  } catch (err) {
    console.error("[fotball] uventet svar:", err);
    return svar({ feil: err.message }, 502, 0);
  }

  return svar({
    liga: liga.navn,
    land: liga.land,
    sesong,
    oppdatert: new Date().toISOString(),
    tabell,
  }, 200, LEVETID.tabell);
};

function svar(kropp, status, levetid) {
  const headere = { "Content-Type": "application/json; charset=utf-8" };

  if (levetid > 0) {
    // Nettleseren sporr hver gang, men blir betjent fra Netlifys kant.
    headere["Cache-Control"] = "public, max-age=0, must-revalidate";
    // durable gir en delt cache for hele kanten i stedet for en per node.
    // Uten den ville hver region hentet sitt eget eksemplar, og dognkvoten
    // ganget seg opp med antall regioner leserne kommer fra.
    // stale-while-revalidate: er svaret ferskt nok til a vises mens et nytt
    // hentes, slipper leseren a vente pa API-et i det hele tatt.
    headere["Netlify-CDN-Cache-Control"] =
      "public, durable, s-maxage=" + levetid + ", stale-while-revalidate=86400";
  } else {
    // Feil caches ikke. Ellers ville et blaff last seg fast i timevis.
    headere["Cache-Control"] = "no-store";
  }

  return new Response(JSON.stringify(kropp), { status, headers: headere });
}

export const config = { path: "/api/fotball/tabell" };
