// Hva en tjeneste faktisk SA, når noe gikk galt.
//
// Rene funksjoner, delt mellom alle Netlify-funksjonene og testene. Den
// samme koden sto som seks kopier av `kortMelding` til 22. september 2026,
// og **de hadde alt glidd**: `brukere` og `konto` leste
// `error_description` først, de fire andre `message`. På en kropp med
// begge feltene ville de sagt to ulike ting om det samme svaret.

// Feltene tjenestene faktisk bruker til en setning ment for et menneske:
//
// - GoTrue (Supabase Auth): `error_description` er setningen, `error` er
//   en kode («invalid_grant»). `msg` brukes av eldre svar.
// - PostgREST: `message` er setningen, ved siden av `details`, `hint` og
//   `code`.
//
// Rekkefølgen setter de to uttrykkelige «beskrivelse»-feltene først og
// den generiske `error` sist, for den er oftest en kode og ikke ord.
const ORDFELT = ["error_description", "message", "msg", "error"];

// Intern: `tjenestensOrd` er den eneste veien inn. Eksportert sto den som
// en funksjon ingen utenfor fila kalte, holdt i live av sine egne tester —
// nettopp det #91 handler om. Rekkefolgen males gjennom `tjenestensOrd`.
function kortMelding(json) {
  if (!json || typeof json !== "object") return "";
  for (const felt of ORDFELT) {
    if (json[felt]) return String(json[felt]).slice(0, 120);
  }
  return "";
}

// **Tjenestens egne ord — eller ingenting.**
//
// Regelen sier at en feilmelding skal bære tjenestens egne ord. Den var
// skrevet om Supabase, som sier «Invalid login credentials». Den gjaldt
// aldri en *maskinkonvolutt*: da innloggingen svarte 522 natt til
// 22. september 2026, sto dette i ansiktet på leseren —
//
//     Innloggingen svarte ikke. Prøv igjen om litt. (svarte 522:
//     {"type":"https://developers.cloudflare.com/support/troubleshoot…
//
// — kappet midt i en streng, og det leses som at noe knakk hos oss. Det
// var Cloudflare som ikke fikk svar fra Supabase bak seg; en
// dokumentasjons-URL i en JSON-konvolutt er ikke ord, og «svarte 522»
// alene sier mer.
//
// Reglene, og hver av dem har en grunn:
//
// 1. **Kjenner vi feltet, er det ord.** Da skal de fram.
// 2. **Parset som JSON, men uten et slikt felt: ingenting.** Da er det en
//    konvolutt fra noe mellom oss og tjenesten — en proxy, en kant, en
//    lastbalanserer — og den har ingen setning å gi leseren.
// 3. **Parset ikke som JSON, og begynner med `<`: ingenting.** En 5xx-side
//    er HTML. Markup er ikke en setning.
// 4. **Ellers er ren tekst ord.** PostgREST og andre svarer av og til en
//    naken setning, og den er verdt å vise.
//
// Kroppen kastes ikke: den som kaller legger den i `forsok.kropp`, så en
// feil fortsatt kan diagnostiseres fra nettleseren framfor å graves fram
// av funksjonsloggen. Den bare *vises* ikke.
export function tjenestensOrd(json, tekst) {
  const kjent = kortMelding(json);
  if (kjent) return kjent;
  if (json) return "";

  const t = String(tekst == null ? "" : tekst).trim();
  if (!t) return "";
  if (t.charAt(0) === "<") return "";
  return t.slice(0, 120);
}

// Kroppen slik den skal ligge i `forsok` for diagnose: kortet, men ikke
// tolket. Tom streng gir `undefined`, så feltet uteblir framfor å stå der
// tomt — et tomt felt leses som «tjenesten sa ingenting», og det er en
// annen påstand enn at vi ikke spurte.
export function diagnosekropp(tekst) {
  const t = String(tekst == null ? "" : tekst).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 200) : undefined;
}
