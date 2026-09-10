// Henter fotballdata fra API-Football og legger Netlifys varige cache
// foran.
//
// Nokkelen ligger i miljovariabelen API_FOOTBALL_KEY og forlater aldri
// denne funksjonen: nettleseren snakker bare med oss, aldri med API-et.
// Det er ogsa derfor dette er en funksjon og ikke en redirect slik
// WordPress-proxyen i netlify.toml er — en redirect kan ikke sette en
// hemmelig header.
//
// Adressene defineres av config nederst, ikke av nye regler i
// netlify.toml. Da holder redirect-reglene seg like smale som for.

import {
  ligaFor, sesongFor, tilgjengeligSesong, apiSti, tolkTabell, tolkKamper,
  nesteRunde, LEVETID, DELER, tsdbSti, tolkKamperTsdb,
} from "../../fotball-data.js";

const API = "https://v3.football.api-sports.io";
const TSDB = "https://www.thesportsdb.com";

// Miljovariabler er versalfolsomme pa Linux, og navnet er lett a taste i
// feil skrivemate. Begge godtas, sa en riktig satt nokkel ikke leses som
// en manglende nokkel.
const NOKKELNAVN = ["API_FOOTBALL_KEY", "api_football_key"];

function apiNokkel() {
  for (const navn of NOKKELNAVN) {
    if (process.env[navn]) return process.env[navn];
  }
  return null;
}

export default async (req) => {
  const url = new URL(req.url);
  const del = url.pathname.split("/").filter(Boolean).pop();
  if (DELER.indexOf(del) === -1) return svar({ feil: "Ukjent datasett" }, 404, 0);

  const ligaNokkel = url.searchParams.get("liga") || "";
  const liga = ligaFor(ligaNokkel);
  if (!liga) return svar({ feil: "Ukjent liga" }, 400, 0);

  const nokkel = apiNokkel();
  if (!nokkel) return svar({ feil: "Tjenesten mangler API-nokkel" }, 503, 0);

  // Abonnementet dekker ikke alle sesonger. Vi ber om den nyeste det gir,
  // og sier fra i svaret nar det ikke er den vi star i.
  const sesong = tilgjengeligSesong(liga);
  const naSesong = sesongFor(liga);

  // Neste runde for en sesong abonnementet ikke dekker: prov TheSportsDB
  // forst, som gir arets kamper gratis. Svikter den — nettverk, uventet
  // form, ingen kamper — far leseren det API-Football har, som for.
  if (del === "neste" && sesong !== naSesong && liga.tsdb) {
    const arets = await hentTsdb(liga);
    if (arets && arets.length) {
      const kommende = nesteRunde(arets);
      return svar({
        liga: liga.navn, ligaNokkel, land: liga.land,
        sesong: naSesong, sisteSesong: true, del, kilde: "TheSportsDB",
        oppdatert: new Date().toISOString(),
        kamper: kommende, runde: kommende[0].runde,
      }, 200, LEVETID[del]);
    }
  }

  let json;
  try {
    const respons = await fetch(API + apiSti(del, liga, sesong), {
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

  let innhold;
  try {
    innhold = tolk(del, json);
  } catch (err) {
    console.error("[fotball] uventet svar:", err);
    return svar({ feil: err.message }, 502, 0);
  }

  return svar(Object.assign({
    liga: liga.navn,
    ligaNokkel,
    land: liga.land,
    sesong,
    sisteSesong: sesong === naSesong,
    del,
    kilde: "API-Football",
    oppdatert: new Date().toISOString(),
  }, innhold), 200, LEVETID[del]);
};

// null ved enhver feil: den som kaller har en vei videre uansett.
async function hentTsdb(liga) {
  try {
    const respons = await fetch(TSDB + tsdbSti(liga, process.env.THESPORTSDB_KEY), {
      headers: { "Accept": "application/json" },
    });
    if (!respons.ok) throw new Error("HTTP " + respons.status);
    return tolkKamperTsdb(await respons.json()).filter((k) => !k.spilt);
  } catch (err) {
    console.error("[fotball] TheSportsDB feilet, bruker API-Football:", err);
    return null;
  }
}

function tolk(del, json) {
  if (del === "tabell") return { tabell: tolkTabell(json) };
  if (del === "resultater") {
    // Nyeste forst: API-et gir de siste kampene i stigende rekkefolge.
    const kamper = tolkKamper(json).slice().sort(
      (a, b) => String(b.dato).localeCompare(String(a.dato)));
    return { kamper };
  }
  const kommende = nesteRunde(tolkKamper(json));
  return { kamper: kommende, runde: kommende.length ? kommende[0].runde : "" };
}

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

export const config = {
  path: ["/api/fotball/tabell", "/api/fotball/resultater", "/api/fotball/neste"],
};
