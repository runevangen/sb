// Å legge appen på hjemskjermen: rene funksjoner. Ingen DOM, ingen
// nettverk, ingen lagring — delt mellom appen og testene.
//
// «Installer appen» gjorde ingenting når du trykket på iPhone (#177). Det
// gjorde noe — en 12 px grå linje, langt under knappen — men en knapp som
// svarer så svakt at ingen ser det, er en knapp som ikke svarer.
//
// To ting avgjør hva leseren skal få:
//   * kan nettleseren installere SELV? Da er svaret en dialog, ikke ord.
//   * hvis ikke: hvor finnes knappen leseren skal trykke? Det er ulikt på
//     iPhone og Android, og en veiledning for feil telefon er verre enn ingen.

// Hva som gjelder for denne nettleseren akkurat nå.
//
//   installert  appen kjører fra hjemskjermen — ingenting å tilby
//   prompt      nettleseren har gitt oss en installasjonsdialog
//   ios         iPhone, iPad eller iPod: ingen dialog, bare en veiledning
//   android     Android uten dialog (ennå, eller i en nettleser som ikke gir en)
//   ingen       alt annet — en datamaskin; vi har ikke noe å si
//
// Rekkefølgen er poenget: en installert app skal aldri tilby å installeres,
// og en dialog er alltid bedre enn en veiledning.
export function installTilstand(miljo) {
  const m = miljo || {};
  if (m.standalone) return "installert";
  if (m.harPrompt) return "prompt";
  if (erIos(m)) return "ios";
  if (/android/i.test(String(m.ua || ""))) return "android";
  return "ingen";
}

// iPadOS 13 og nyere kaller seg «Macintosh» i User-Agent, for at nettsider
// skal gi den skrivebordsutgaven. Det som røper den er at en Mac ikke har
// berøringsskjerm. Uten denne sjekken fikk en iPad ingen knapp i det hele
// tatt.
export function erIos(miljo) {
  const m = miljo || {};
  if (/iphone|ipad|ipod/i.test(String(m.ua || ""))) return true;
  return String(m.plattform || "") === "MacIntel" && Number(m.beroring || 0) > 1;
}

// Veiledningen, som data: en tittel og trinnene. Appen tegner den; hva den
// SIER står her, så en test kan holde at iPhone og Android ikke får hverandres.
//
// `ikon` sier hvor et symbol hører hjemme i et trinn. Bokstaven eller
// tegnet leseren leter etter på skjermen er det som gjør et trinn mulig å
// følge — «trykk Del» uten å si hvordan Del ser ut er en gåte.
export function installVeiledning(tilstand) {
  if (tilstand === "ios") {
    return {
      tittel: "Slik legger du appen på hjemskjermen",
      steg: [
        { tekst: "Trykk på Del-knappen — firkanten med en pil opp. Ser du den ikke, trykk på ••• først.", ikon: "del" },
        { tekst: "Bla ned og velg «Legg til på Hjem-skjerm»." },
        { tekst: "Trykk «Legg til» øverst til høyre." },
      ],
    };
  }
  if (tilstand === "android") {
    return {
      tittel: "Slik legger du appen på startskjermen",
      steg: [
        { tekst: "Trykk på menyen i nettleseren — tre prikker, som regel øverst til høyre.", ikon: "meny" },
        { tekst: "Velg «Installer app» eller «Legg til på startskjermen»." },
        { tekst: "Bekreft med «Installer» eller «Legg til»." },
      ],
    };
  }
  return null;
}

// Skal knappen stå framme? Den står der den kan gi noe: en dialog, eller en
// veiledning som passer telefonen. På en datamaskin uten dialog har vi
// ingenting å si, og en knapp som ikke gir noe er verre enn ingen.
export function visInstallKnapp(tilstand) {
  return tilstand === "prompt" || tilstand === "ios" || tilstand === "android";
}

// Hva et trykk skal gjøre. «dialog» bruker nettleserens egen; «veiledning»
// viser trinnene; «ingenting» er en knapp som ikke skulle stått der.
export function installHandling(tilstand) {
  if (tilstand === "prompt") return "dialog";
  if (tilstand === "ios" || tilstand === "android") return "veiledning";
  return "ingenting";
}
