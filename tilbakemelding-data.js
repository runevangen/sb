// Feil og ønsker fra leserne: rene funksjoner. Ingen DOM, ingen nettverk,
// ingen lagring — delt mellom appen, Netlify-funksjonen og testene.
//
// Samme form som pubforslagene: en ko i portalen, skrevet med leserens
// egen okt, og bare innlogget. Kontoen er sperren mot spam; uten den matte
// vi talt IP-adresser, og det er sporing (ADR 0004).
//
// Blir appen og tjenesten uenige om hva en gyldig melding er, far leseren
// «noe er galt» om noe som stemmer. Derfor star reglene her, ett sted.

export const ARTER = { feil: "Feil", onske: "Ønske" };

export const TEKST_MIN = 5;
export const TEKST_MAKS = 1000;
export const SKJERM_MAKS = 80;
export const VERSJON_MAKS = 20;

// Hvor mange meldinger portalen henter om gangen. Blir koen lengre, er det
// et signal i seg selv.
export const TILBAKEMELDING_MAKS = 200;

export const STATUSER = ["ny", "lest", "fikset", "ikke-na"];

// Hva leseren ser pa kontosiden. «Ny» er et ord for den som behandler;
// for den som sendte, er meldingen «Sendt» til noen har sett den.
export const STATUS_LESER = {
  "ny": "Sendt", "lest": "Lest", "fikset": "Fikset", "ikke-na": "Ikke nå",
};

// Og knappene i portalen. «Ny» er ingen handling: en melding blir ikke ny
// igjen av at noen har sett den.
export const STATUS_HANDLING = { "lest": "Lest", "fikset": "Fikset", "ikke-na": "Ikke nå" };

// Hva som er galt, som en liste. Tom liste er alt i orden — samme form som
// sjekkForslag og sjekkPubliste.
export function sjekkTilbakemelding(inn) {
  const feil = [];
  const art = String((inn && inn.art) || "");
  const tekst = String((inn && inn.tekst) || "").trim();
  if (!Object.prototype.hasOwnProperty.call(ARTER, art)) feil.push("Velg om det er en feil eller et ønske.");
  if (tekst.length < TEKST_MIN) feil.push("Skriv litt om hva det gjelder.");
  else if (tekst.length > TEKST_MAKS) feil.push("Meldingen er for lang — kort den ned til " + TEKST_MAKS + " tegn.");
  return feil;
}

// Raden slik tjenesten sender den. `sendt_av` og `status` star IKKE her:
// databasen setter den forste fra okten og den andre fra sin default, og
// skriveregelen krever begge. Sendte funksjonen dem, kunne en feil her
// skrive i en annens navn — eller melde noe som alt fikset.
//
// Skjerm og versjon blir med bare nar de er satt: leseren sa dem i
// skjemaet og kunne fjerne dem, og en tom streng er ikke det samme som
// «fjernet».
export function tilbakemeldingRad(inn) {
  const rad = {
    art: String(inn.art),
    tekst: String(inn.tekst).trim().slice(0, TEKST_MAKS),
  };
  const skjerm = String((inn && inn.skjerm) || "").trim();
  const versjon = String((inn && inn.versjon) || "").trim();
  if (skjerm) rad.skjerm = skjerm.slice(0, SKJERM_MAKS);
  if (versjon) rad.versjon = versjon.slice(0, VERSJON_MAKS);
  return rad;
}

// Radene fra basen, i den formen appen og portalen leser. Tal alt: et
// svar vi ikke kjenner, blir en tom liste, ikke et krasj.
export function tolkTilbakemeldinger(json) {
  return (Array.isArray(json) ? json : []).filter((r) => r && r.id).map((r) => ({
    id: String(r.id),
    art: Object.prototype.hasOwnProperty.call(ARTER, r.art) ? r.art : "feil",
    tekst: String(r.tekst || ""),
    skjerm: r.skjerm ? String(r.skjerm) : "",
    versjon: r.versjon ? String(r.versjon) : "",
    sendtAv: r.sendt_av ? String(r.sendt_av) : "",
    sendt: r.sendt ? String(r.sendt) : "",
    status: STATUSER.indexOf(r.status) > -1 ? r.status : "ny",
    behandlet: r.behandlet ? String(r.behandlet) : "",
  }));
}

// Koen i portalen: de nye forst, og eldst forst blant dem — koen er
// arbeid som ligger, ikke et varsel. Det som er behandlet, star under,
// nyeste forst: det er det du husker.
export function sorterTilbakemeldinger(liste) {
  const tid = (r) => Date.parse(r.sendt) || 0;
  return (liste || []).slice().sort((a, b) => {
    const an = a.status === "ny", bn = b.status === "ny";
    if (an !== bn) return an ? -1 : 1;
    return an ? tid(a) - tid(b) : tid(b) - tid(a);
  });
}

// Hvor leseren sto, i ord. Følger med meldingen bare hvis leseren lar den
// sta — den star synlig i skjemaet, med en knapp som fjerner den.
//
// `filter` er soket eller emnet i nyhetene; `sak` er en apen sak. Ingen av
// dem lagres noe annet sted: dette er det leseren selv sa, i det de sendte.
export function skjermTekst(s) {
  const t = s || {};
  let tekst;
  if (t.visning === "fotball") {
    tekst = ["Fotball", t.liga, t.del].filter(Boolean).join(" › ");
  } else {
    tekst = "Nyheter" + (t.filter ? " › " + t.filter : "");
  }
  return tekst.slice(0, SKJERM_MAKS);
}
