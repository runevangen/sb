// Admin-portalens lagring: skriver visninger.js til GitHub.
//
// Hvorfor GitHub og ikke et ekte lager: fila skal ligge i koden, slik
// puber-oslo.js gjor, sa leseren ser hvem som viser kampen uten et
// nettkall. Da blir hver lagring en commit, med historikk og mulighet
// til a rette for hand. Det koster en utrulling per lagring — greit sa
// lenge det er en admin. Skal puber skrive selv (#65), ma dette byttes
// mot et lager som talér mange skrivere.
//
// Passordet ligger i ADMIN_PASSORD, tokenet i GITHUB_TOKEN. Tokenet skal
// vaere finkornet og bare ha skrivetilgang til innhold i dette ene
// repoet. Uten begge svarer funksjonen 503, og sier hvilken som mangler.
// Et GET spor bare om oppsettet: portalen bruker det til a si fra for
// admin har gjort jobben, framfor etterpa.

import { PUBER_OSLO } from "../../puber-oslo.js";
import {
  sjekkVisninger, slaSammen, utenGamle, visningerFil, lesVisninger,
} from "../../visning-data.js";

const GITHUB = "https://api.github.com";
const REPO = process.env.GITHUB_REPO || "runevangen/sb";
const GREN = process.env.GITHUB_BRANCH || "main";
const STI = "visninger.js";
const IDENTITET = "sportsbibelen-app/1.0 https://mvp-sb.netlify.app";

export default async (req) => {
  const mangler = manglerIOppsettet();

  // Portalen sporr om oppsettet for den viser noe som helst. Far admin
  // forst vite at portalen ikke er satt opp nar hen trykker Lagre, er
  // valget allerede gjort en gang til ingen nytte. Svaret rooper
  // ingenting: navnene pa miljovariablene star i repoet fra for.
  if (req.method === "GET") return svar({ klar: mangler.length === 0, mangler }, 200);
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);

  if (mangler.length) return svar({ feil: oppsettTekst(mangler), mangler }, 503);
  const passord = process.env.ADMIN_PASSORD;
  const token = process.env.GITHUB_TOKEN;

  let inn;
  try {
    inn = await req.json();
  } catch (err) {
    return svar({ feil: "Uleselig forespørsel" }, 400);
  }

  // Sammenlikner hele lengden uansett, sa svartiden ikke rooper hvor
  // mange tegn som stemte.
  if (!likeStrenger(String(inn.passord || ""), passord)) {
    return svar({ feil: "Feil passord" }, 401);
  }

  // Innloggingen: portalen viser ingenting for passordet er godtatt.
  // Den gir ingen annen tilgang enn et POST uten «sjekk» ville gitt —
  // den flytter bare svaret dit admin er, fra Lagre til innloggingen.
  if (inn.handling === "sjekk") return svar({ ok: true }, 200);

  const pub = String(inn.pub || "");
  const kamper = Array.isArray(inn.kamper) ? inn.kamper : [];
  const valgte = Array.isArray(inn.kampIder) ? inn.kampIder : [];
  if (!pub || !kamper.length) return svar({ feil: "Mangler pub eller kamper" }, 400);
  if (!PUBER_OSLO.some((p) => p.navn === pub)) return svar({ feil: "Ukjent pub" }, 400);

  let naa;
  try {
    naa = await hentFila(token);
  } catch (err) {
    console.error("[visninger] klarte ikke lese fila:", err);
    return svar({ feil: "Fikk ikke lest visninger.js: " + kort(err) }, 502);
  }

  const oppdatert = utenGamle(slaSammen(naa.liste, pub, valgte, kamper), Date.now(), 2);
  const problemer = sjekkVisninger(oppdatert, PUBER_OSLO.map((p) => p.navn));
  if (problemer.length) return svar({ feil: "Ugyldige visninger", problemer }, 400);

  try {
    await skrivFila(token, visningerFil(oppdatert), naa.sha, pub, valgte.length);
  } catch (err) {
    console.error("[visninger] klarte ikke skrive fila:", err);
    return svar({ feil: "Fikk ikke lagret: " + kort(err) }, 502);
  }

  return svar({
    ok: true,
    pub,
    valgt: valgte.length,
    totalt: oppdatert.length,
    merknad: "Lagret. Endringen er ute i appen når utrullingen er ferdig, om et minutt eller to.",
  }, 200);
};

async function hentFila(token) {
  const respons = await fetch(
    GITHUB + "/repos/" + REPO + "/contents/" + STI + "?ref=" + encodeURIComponent(GREN),
    { headers: githubHodet(token) });
  if (!respons.ok) throw new Error("HTTP " + respons.status);
  const json = await respons.json();
  const tekst = Buffer.from(String(json.content || ""), "base64").toString("utf8");
  return { sha: json.sha, liste: lesVisninger(tekst) };
}

async function skrivFila(token, innhold, sha, pub, antall) {
  const respons = await fetch(GITHUB + "/repos/" + REPO + "/contents/" + STI, {
    method: "PUT",
    headers: Object.assign(githubHodet(token), { "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: "Visninger: " + pub + " viser " + antall + " kamper",
      content: Buffer.from(innhold, "utf8").toString("base64"),
      sha,
      branch: GREN,
    }),
  });
  if (!respons.ok) {
    const kropp = (await respons.text().catch(() => "")).replace(/\s+/g, " ").trim();
    throw new Error("HTTP " + respons.status + (kropp ? " " + kropp.slice(0, 120) : ""));
  }
}

function githubHodet(token) {
  return {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": IDENTITET,
  };
}

// Uten begge hemmelighetene kan portalen ingenting, og da skal det sta
// hvilken som mangler. «Portalen er ikke satt opp» alene sender admin
// til a lete i koden etter noe som star i Netlify-panelet.
function manglerIOppsettet() {
  const mangler = [];
  if (!process.env.ADMIN_PASSORD) mangler.push("ADMIN_PASSORD");
  if (!process.env.GITHUB_TOKEN) mangler.push("GITHUB_TOKEN");
  return mangler;
}

function oppsettTekst(mangler) {
  return "Portalen er ikke satt opp: " + mangler.join(" og ")
    + " mangler i Netlify-miljøet. Sett " + (mangler.length > 1 ? "dem" : "den")
    + " under Site configuration →"
    + " Environment variables, og rull ut på nytt (Deploys → Trigger deploy):"
    + " funksjonene leser miljøet ved utrulling.";
}

// Konstant tid: en sammenlikning som stopper ved forste avvik, forteller
// hvor langt en gjetning kom.
function likeStrenger(a, b) {
  const lengde = Math.max(a.length, b.length);
  let ulikt = a.length ^ b.length;
  for (let i = 0; i < lengde; i += 1) {
    ulikt |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return ulikt === 0;
}

function kort(err) {
  return String((err && err.message) || err).slice(0, 120);
}

function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/visninger" };
