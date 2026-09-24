// Innlogging med fornavn og PIN: de rene funksjonene. Ingen DOM, ingen
// nettverk, ingen lagring — delt mellom app.js og
// netlify/functions/konto.mjs, sa begge sider er enige om hva et gyldig
// navn og en gyldig PIN er. Blir de uenige, far leseren «feil PIN» pa en
// PIN som stemmer. Det kostet en kveld sist, med engangskoden.
//
// Hvorfor fornavn og PIN og ikke e-post: koden pa e-post krever en
// avsender pa et verifisert domene, og det domenet er ikke kjopt enda.
// Hele e-postinnloggingen star komplett pa grenen `epost-innlogging`,
// klar til a hentes fram. Dette er innloggingen for testperioden: to
// felt, ingen innboks, og fornavnet er likevel det vennene ser.
//
// Paret fornavn + PIN er kontoen. Skriver du de samme to pa en annen
// telefon, er du inne der ogsa — det er hele poenget, og det er derfor
// identiteten ma finnes hos tjenesten og ikke bare i telefonen.

import { oktUtloper } from "./konto-data.js";

// Fire siffer er det telefonen har laert folk a forvente. Vi stopper
// ikke den som vil ha seks, men vi krever ikke mer enn fire: en PIN som
// er vanskelig a huske blir skrevet ned, og det er ingen forbedring.
export const PIN_MIN = 4;
export const PIN_MAKS = 6;

// Fornavn, ikke fullt navn. Det er navnet vennene ser i «blir med»-lista
// fra for, sa det er navnet som alt er i bruk.
export const NAVN_MAKS = 24;

// Kontoen ligger hos Supabase Auth, og Supabase Auth kjenner
// e-postadresser. Navnet blir derfor en adresse pa et domene som er vart
// og som ingen kan motta post pa. Ingen e-post sendes noe sted; adressen
// er en nokkel, ikke en postkasse — og den vises aldri i appen.
export const PIN_DOMENE = "pin.mvp-sb.netlify.app";

// Navnet skrives av et menneske pa en telefon. Et mellomrom pa slutten
// og to mellomrom inni skal ikke gi en ny konto.
export function normaliserPinNavn(verdi) {
  return String(verdi == null ? "" : verdi).replace(/\s+/g, " ").trim().slice(0, NAVN_MAKS);
}

// Nokkelen til kontoen. Den ma vaere den samme hver gang, ogsa nar «Ola»
// skrives «ola» pa neste telefon — ellers far samme person to kontoer og
// mister svarene sine. Norske bokstaver foldes med vilje for de strippes:
// uten foldingen ville «Bjorn» og «Bjørn» blitt «bjrn» begge to, og to
// ulike navn samme konto.
export function pinSlug(navn) {
  return normaliserPinNavn(navn)
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, NAVN_MAKS);
}

// To bokstaver er nok — «Jo» er et fornavn. Men et navn som bare er
// tegnsetting blir en tom nokkel, og en tom nokkel er alles konto.
export function gyldigPinNavn(verdi) {
  return pinSlug(verdi).length >= 2;
}

export function pinEpost(navn, domene = PIN_DOMENE) {
  return pinSlug(navn) + "@" + domene;
}

// PIN-en tastes pa et talltastatur. Et mellomrom mellom sifrene skal
// ikke stoppe en innlogging.
export function normaliserPin(verdi) {
  return String(verdi == null ? "" : verdi).replace(/\D+/g, "").slice(0, PIN_MAKS);
}

export function gyldigPin(verdi) {
  const n = normaliserPin(verdi).length;
  return n >= PIN_MIN && n <= PIN_MAKS;
}

// Passordet hos tjenesten er PIN-en pluss en hemmelighet som bare
// funksjonen kjenner (PIN_PEPPER i Netlify-miljoet). To grunner, og
// begge er konkrete:
//
//   1. Fire siffer er 10 000 forsok. Uten pepperet kunne hvem som helst
//      gjette dem rett mot Supabase sitt eget endepunkt. Med pepperet
//      ma gjettingen gjennom var egen funksjon, pa vart eget domene.
//   2. Supabase krever minst seks tegn i et passord. En PIN pa fire er
//      kortere enn det, og ville blitt avvist.
//
// Dette gjor ikke en PIN pa fire siffer til et passord, og det later vi
// ikke som. Ingenting er last bak innloggingen: det verste en som kommer
// seg inn kan gjore, er a skrive «jeg blir med» i en annens navn.
// Pepperet ma settes for den forste kontoen lages, og kan ikke endres
// etterpa uten a lase alle ut.
export function pinPassord(pin, pepper) {
  return normaliserPin(pin) + ":" + String(pepper == null ? "" : pepper);
}

// Svaret fra Supabase, formet til det appen trenger. Navnet folger med
// fra feltet leseren skrev i, ikke fra adressen: adressen er en nokkel
// vi laget, og «ola@pin.mvp-sb.netlify.app» er ikke noe a vise noen.
//
// Kaster framfor a gi fra seg en halv okt: en okt uten token ville sett
// ut som innlogget helt til det forste kallet feilet.
export function tolkPinOkt(json, navn, naa = Date.now()) {
  const token = json && json.access_token;
  const rent = normaliserPinNavn(navn);
  if (!token || !gyldigPinNavn(rent)) throw new Error("Uventet svar fra innloggingen");

  const okt = {
    token,
    navn: rent,
    // Id-en, ikke navnet, er den du er: to kan hete det samme, og lista
    // over hvem som blir med sammenliknes pa id.
    bruker: String((json.user && json.user.id) || ""),
    utloper: oktUtloper(json.expires_in, naa) || oktUtloper(3600, naa),
    // Fornyeren er det som gjor telefonen til en telefon du er logget
    // inn pa. Tilgangstokenet over varer én time — det er ferskvare — og
    // uten denne ble man logget ut hver time. Den byttes inn i et nytt
    // token uten at PIN-en tastes pa nytt.
    fornyer: String((json && json.refresh_token) || ""),
  };
  // Favorittlagene, slik kontoen husker dem. Bare nar feltet FINNES hos
  // tjenesten: en konto som aldri har lagret lag, og en som har fjernet
  // alle, er to ulike svar. Det forste betyr «ta telefonens», det andre
  // «ingen». Ga de begge en tom liste, ville den forste fornyingen etter
  // denne utrullingen tomt stjernene til alle som hadde valgt lag for.
  const meta = json.user && json.user.user_metadata;
  if (meta && Array.isArray(meta.lag)) okt.lag = rensLag(meta.lag);
  return okt;
}

/* ---------- favorittlagene pa kontoen ---------- */

// Lista skrives av appen, men leses tilbake fra en tjeneste der brukeren
// selv kan skrive hva som helst i sine egne metadata. Den renses derfor
// begge veier, med den samme funksjonen: det appen sender og det den far
// tilbake skal se likt ut, ellers sier sammenlikningen «endret» om noe som
// ikke er det.
//
// Taket er romslig. Ingen folger tjue lag; en liste pa tjue er en feil et
// sted, og da skal den ikke vokse videre.
export const LAG_MAKS = 20;
export const LAGNAVN_MAKS = 60;

export function rensLag(liste) {
  if (!Array.isArray(liste)) return [];
  const sett = [];
  liste.forEach((n) => {
    if (typeof n !== "string") return;
    const navn = n.replace(/\s+/g, " ").trim().slice(0, LAGNAVN_MAKS);
    if (navn && sett.indexOf(navn) === -1) sett.push(navn);
  });
  return sett.slice(0, LAG_MAKS);
}

// Innloggingen er ett oyeblikk der to lister moter hverandre: det kontoen
// husker, og det du valgte pa denne telefonen for du logget inn. Ingen av
// dem er feil, sa begge beholdes — kontoens forst, i den rekkefolgen den
// har, og telefonens nye bak.
//
// Bare ved innlogging. Etter det er kontoen fasit: sto flettingen ogsa pa
// fornyingen, kunne et lag du fjernet pa én telefon aldri forsvinne — den
// andre ville lagt det tilbake hver time.
export function flettLag(kontoen, telefonen) {
  return rensLag(rensLag(kontoen).concat(rensLag(telefonen)));
}

export function sammeLag(a, b) {
  return JSON.stringify(rensLag(a)) === JSON.stringify(rensLag(b));
}

/* ---------- bytt PIN ---------- */

// Hva som ma sta for en PIN kan byttes, sagt ett sted for appen og
// funksjonen. Tom streng betyr at det kan sendes.
//
// Den gamle kreves. PIN-en er en sperre mellom folk som deler en telefon
// — det er det eneste den er — og kunne den byttes uten den gamle, kunne
// hvem som helst med telefonen i handa ta kontoen fra deg.
//
// `gjenta` er valgfri her fordi funksjonen ikke far den: den sjekkes i
// appen, der to felt faktisk finnes. Sendes den, sjekkes den.
export function sjekkPinBytte(gammel, ny, gjenta) {
  if (!gyldigPin(gammel)) return "Skriv PIN-en du har nå.";
  if (!gyldigPin(ny)) return "Den nye PIN-en er " + PIN_MIN + " til " + PIN_MAKS + " siffer.";
  if (normaliserPin(ny) === normaliserPin(gammel)) {
    return "Den nye PIN-en er den samme som den gamle.";
  }
  if (gjenta !== undefined && normaliserPin(ny) !== normaliserPin(gjenta)) {
    return "De to nye PIN-ene er ikke like.";
  }
  return "";
}

/* ---------- brukerlista i adminportalen ---------- */

// Svaret fra Supabases admin-API, formet til det portalen trenger og
// ikke mer. Adressen vi lagde av navnet folger ikke med ut — den er en
// nokkel, ikke noe a vise — men navnet gjor det.
//
// Navnet star i `user_metadata.navn`, skrevet slik personen selv skrev
// det. Kontoer laget for vi begynte a sende det med har det ikke, og da
// er slugen fra adressen det naermeste vi kommer: «bjoernaage» er ikke
// pent, men det er riktig, og det er bedre enn en tom rad.
//
// Forste og siste PALOGGING er `created_at` og `last_sign_in_at` — ikke
// forste og siste BRUK. Appen holder telefonen innlogget med roterende
// fornyere, og en fornying oppdaterer ikke last_sign_in_at: den som er
// innom daglig uten a taste PIN-en pa nytt, star med en gammel dato.
// Portalen kaller kolonnen «Sist palogget» av nettopp den grunn.
// Kontoen lages ved forste innlogging, sa de to er nyaktig det de ser ut
// som. En konto som aldri har logget inn finnes ikke.
export function tolkBrukere(rader, domene = PIN_DOMENE, okter) {
  const liste = Array.isArray(rader) ? rader : (rader && rader.users) || [];
  if (!Array.isArray(liste)) return [];
  const aktive = (okter && typeof okter === "object") ? okter : {};

  return liste
    .filter((r) => r && r.id)
    .map((r) => {
      const epost = String(r.email || "");
      const slug = epost.endsWith("@" + domene) ? epost.slice(0, -(domene.length + 1)) : "";
      const meta = r.user_metadata || r.raw_user_meta_data || {};
      return {
        id: String(r.id),
        navn: normaliserPinNavn(meta.navn) || slug,
        slug,
        forst: r.created_at || "",
        // `sist` er palogging: sist noen tastet PIN-en.
        sist: r.last_sign_in_at || "",
        // `aktiv` er sist okta ble fornyet — sist appen faktisk var i gang
        // hos denne personen. De to er ikke det samme, og forskjellen var
        // hele forvirringen: en som er innom hver dag kan ha en `sist` som
        // er uker gammel. Tom streng nar det ikke finnes en levende okt,
        // og det er en opplysning i seg selv.
        aktiv: String(aktive[String(r.id)] || ""),
      };
    })
    // Bare vare egne kontoer. Ligger det noe annet i prosjektet, hoerer
    // det ikke hjemme i denne lista.
    .filter((b) => b.slug)
    // Sortert pa hvem som sist var inne, ikke pa hvem som sist tastet
    // PIN-en: det forste er sporsmalet admin har. Den uten okt faller
    // nederst, ikke overst — `aktiv` er tom, og tom sorterer sist.
    .sort((a, b) => String(b.aktiv || "").localeCompare(String(a.aktiv || ""))
      || String(b.sist || "").localeCompare(String(a.sist || "")));
}

// «I går 21:04». Admin leser dette for a se hvem som faktisk har vaert
// inne, sa en dato uten klokkeslett sier for lite og en ISO-streng for
// mye. Ukjent tid gir en strek, ikke «Invalid Date».
//
// Heter ikke `tidstekst`: det navnet er tatt i fotball-data.js, og star
// for noe helt annet — avsparkstidspunktet for en kamp. To like navn pa
// to ulike ting kostet oss en CI-runde sist (`.kamp-delt`).
export function sistInneTekst(iso, naa = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";

  // Kalenderdogn i Oslo, ikke forlopte 24-timersperioder. Forskjellen er
  // ikke akademisk: (naa - t) / 86400000 ga «I dag 23:00» klokka 01:00
  // natt til dagen etter — et tidspunkt som ikke har vaert enda. Meldt fra
  // adminportalen 15. september 2026 som «bruker har vaert inne i dag for
  // tiden er mulig».
  //
  // Selve klokkeslettet var riktig hele tiden; det er bucketet «i dag /
  // i gar» som var regnet ut feil. Derfor sa den feil bare mellom midnatt
  // og samme klokkeslett neste dag — og derfor sto den sa lenge.
  const dager = osloDogn(naa) - osloDogn(t);
  const klokke = new Date(t).toLocaleTimeString("nb-NO",
    { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
  if (dager === 0) return "I dag " + klokke;
  if (dager === 1) return "I går " + klokke;
  // Negativt betyr en dato fram i tid — klokkeavvik hos tjenesten, eller
  // en rad vi har lest feil. Da er datoen aerligere enn «I dag».
  if (dager > 1 && dager < 7) return dager + " dager siden";
  return new Date(t).toLocaleDateString("nb-NO",
    { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });
}

// Hvilket dogn et tidspunkt tilhorer i Oslo, talt fra epoken. en-CA gir
// datoen pa ISO-form («2026-09-15»), og Date.parse leser en ren dato som
// midnatt UTC — sa differansen blir hele dogn uansett sommertid.
function osloDogn(ms) {
  const dato = new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  return Math.round(Date.parse(dato) / 86400000);
}
