// Hva TheSportsDB faktisk gir oss — spurt fra portalen.
//
// Verktoyet `verktoy/tsdbsjekk.mjs` gjor det samme fra en maskin. Denne
// finnes fordi den som eier prosjektet sitter med en telefon: det er
// ingen terminal der, og en oppgave som krever en er ingen oppgave.
//
// **Nokkelen blir her.** v1 legger den i STIEN, og skulle den samme
// sporringa gjores fra en nettleser, matte nokkelen vaert limt inn i
// adressefeltet — og da ligger den i historikken, i en logg, og i hvert
// skjermbilde noen tar. Funksjonen leser den fra miljoet, som alle de
// andre, og svaret baerer den aldri.
//
// Bak ADMIN_PASSORD, som `pub-liste`. Ikke fordi svaret er hemmelig, men
// fordi hvert trykk koster seks kall mot en tjeneste som ber om fair use
// — og et endepunkt hvem som helst kan trykke pa, er et endepunkt noen
// kommer til a trykke pa tusen ganger.

import { ligaFor, sesongFor, tsdbSesong, tsdbHeadere,
         tsdbSondeStier, tsdbForsteListe, tsdbSondeFunn, tsdbPlukkId,
         tsdbSondeParset }
  from "../../fotball-data.js";

const ROT = "https://www.thesportsdb.com";

export default async (req) => {
  if (req.method !== "POST") return svar({ feil: "Bruk POST" }, 405);

  let inn;
  try { inn = await req.json(); }
  catch (err) { return svar({ feil: "Uleselig forespørsel" }, 400); }

  if (!process.env.ADMIN_PASSORD) {
    return svar({ feil: "Tjenesten mangler ADMIN_PASSORD" }, 503);
  }
  // Konstant tid, som i pub-liste: en sammenlikning som stopper ved
  // forste avvik, forteller hvor langt en gjetning kom.
  if (!likeStrenger(String(inn.passord || ""), process.env.ADMIN_PASSORD)) {
    return svar({ feil: "Feil passord" }, 401);
  }

  const liga = ligaFor(String(inn.liga || "eliteserien"));
  if (!liga || !liga.tsdb) return svar({ feil: "Ukjent liga" }, 400);

  const nokkel = process.env.THESPORTSDB_KEY || process.env.thesportsdb_key || "";
  const sesong = tsdbSesong(liga);
  const ider = { lag: "", spiller: "" };
  const prover = [];

  // Stiene bygges pa nytt for hver prove, for kjeden fyller `ider`
  // underveis: en prove som krever en lag-id, skal fa den forrige fant.
  const antall = tsdbSondeStier(liga, sesong, nokkel, ider).length;
  for (let i = 0; i < antall; i += 1) {
    const p = tsdbSondeStier(liga, sesong, nokkel, ider)[i];
    if (p.krever && !ider[p.krever]) {
      prover.push({ navn: p.navn, gjetning: !!p.gjetning,
        utfall: "hoppet over", hvorfor: "fant ingen " + p.krever + "-id i svarene over" });
      continue;
    }
    const r = await hent(p, nokkel);
    prover.push(r);
    // Kjeden: en kampliste baerer et lag, en spillerliste en spiller.
    if (r.liste && p.gir && !ider[p.gir]) {
      ider[p.gir] = tsdbPlukkId(r.liste, p.gir);
      if (ider[p.gir]) r.plukket = p.gir + "-id: " + ider[p.gir];
    }
    delete r.liste;
  }

  return svar({
    liga: liga.navn, sesong, staarI: sesongFor(liga),
    // Sier om svarene er kappet, sa et lite tall ikke leses som en mangel.
    nokkel: nokkel ? "satt" : "mangler — testnøkkelen «3» kapper svarene",
    prover,
  }, 200);
};

// Ett kall, og hva svaret BAR. En tom liste, en 404 og en nokkel som
// ikke rekker til er tre ulike ting, og de krever hver sin handling — sa
// de skal ikke se like ut for den som leser.
async function hent(p, nokkel) {
  const ut = { navn: p.navn, gjetning: !!p.gjetning };
  try {
    const r = await fetch(ROT + p.sti, { headers: tsdbHeadere(nokkel, p.versjon) });
    if (!r.ok) {
      ut.utfall = "HTTP " + r.status;
      ut.hvorfor = p.gjetning
        ? "adressen er en gjetning — dette er et nei til navnet, ikke til dataene"
        : r.statusText || "";
      return ut;
    }
    const tekst = await r.text();
    let json;
    try { json = JSON.parse(tekst); }
    catch (e) {
      ut.utfall = "ikke JSON";
      ut.hvorfor = tekst.slice(0, 80);
      return ut;
    }
    const treff = tsdbForsteListe(json, p.felt);
    if (!treff) {
      ut.utfall = "ingen liste i svaret";
      ut.hvorfor = "nøkler: " + Object.keys(json || {}).join(", ");
      return ut;
    }
    const funn = tsdbSondeFunn(treff.liste);
    ut.utfall = funn.rader + " rader i «" + treff.felt + "»";
    // Kjor VAAR EGEN parser mot svaret. Feltnavnene alene svarer ikke paa
    // om fanen faktisk kan tegnes — det gjor dette.
    if (p.felt === "events" || p.felt === "schedule") ut.parset = tsdbSondeParset(json);
    ut.felt = funn.felt.slice(0, 12);
    if (p.gir === "lag" || p.felt === "events") ut.runder = funn.runder;
    if (p.maaler === "mal") {
      ut.maalfelt = funn.maalfelt;
      ut.sesongfelt = funn.sesongfelt;
      // Selve avgjorelsen, skrevet ut. Den som leser skal slippe a utlede
      // den av to lister med feltnavn.
      ut.duger = funn.maalfelt.length && funn.sesongfelt.length
        ? "JA — raden bærer både mål og sesong"
        : "NEI — mangler " + (funn.maalfelt.length ? "sesong" : "mål") + " på raden";
      ut.forsteRad = JSON.stringify(treff.liste[0] || {}).slice(0, 300);
    }
    ut.liste = treff.liste;
    return ut;
  } catch (err) {
    ut.utfall = "fikk ikke svar";
    ut.hvorfor = err.message;
    return ut;
  }
}

function likeStrenger(a, b) {
  const fasit = String(b == null ? "" : b);
  const lengde = Math.max(a.length, fasit.length);
  let ulikt = a.length ^ fasit.length;
  for (let i = 0; i < lengde; i += 1) {
    ulikt |= (a.charCodeAt(i) || 0) ^ (fasit.charCodeAt(i) || 0);
  }
  return ulikt === 0;
}

// Aldri cachet. Sonden spor hva som finnes NA, og et svar som ligger i
// kanten er et svar pa hva som fantes sist noen trykket.
function svar(kropp, status) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8",
               "Cache-Control": "no-store" },
  });
}

export const config = { path: "/api/tsdb-sonde" };
