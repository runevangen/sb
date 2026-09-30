// Adminloggen: hvem var inne i portalen, og hva har skjedd siden sist.
// Rene funksjoner — ingen DOM, ingen nettverk, ingen lagring — delt mellom
// portalen, Netlify-funksjonen og testene.
//
// To spørsmål som deler én rad. «Hvem har brukt adminkontoen?» svares av at
// hver innlogging er en rad. «Hva har skjedd siden sist jeg var inne?»
// svares av at raden også husker hva portalen viste da — og da er neste
// innlogging en sammenlikning mellom to rader, ikke et klokkeslett.
//
// Dette er ikke telling av lesere (ADR 0004). Bare de få som står i
// `visning_skrivere` kommer inn i loggen, og den finnes for at admin skal
// kunne svare på hvem som gjorde hva — ikke for å måle bruk.

export const LOGG_MAKS = 50;
export const VERSJON_MAKS = 20;
export const ANTALL_MAKS = 500;

// Formen på en versjon i `versjoner.js`: ÅÅÅÅ.MM.DD. Sammenliknes som tekst,
// og det går fordi månedene og dagene er nullfylt.
const VERSJON_FORM = /^\d{4}\.\d{2}\.\d{2}$/;

// Hva lista sto på da portalen ble åpnet: nyeste versjon, og hvor mange
// linjer den hadde. **Antallet er poenget.** Én oppføring per dag betyr at
// en endring som lander klokka 16 havner under samme nummer som den
// klokka 10 — og bare et klokkeslett eller et versjonsnummer ville sagt at
// intet er nytt.
//
// Reglen den hviler på, står øverst i `versjoner.js`: nye linjer legges til
// nederst i dagens oppføring, så rekkefølgen er tiden.
export function versjonStand(versjoner) {
  const liste = Array.isArray(versjoner) ? versjoner : [];
  const nyeste = liste[0];
  if (!nyeste) return { versjon: "", antall: 0 };
  return {
    versjon: String(nyeste.versjon || ""),
    antall: Array.isArray(nyeste.endringer) ? nyeste.endringer.length : 0,
  };
}

// Det som er nytt siden `sist` — {versjon, antall} fra forrige innlogging.
//
//   null        ingen forrige innlogging: det finnes ikke noe «siden sist»,
//               og alt i lista kalt «nytt» ville vært en påstand uten grunn.
//   []          ingenting har skjedd.
//   [{versjon, endringer}]   nyeste først, bare de nye linjene.
//
// En versjon som er eldre enn det forrige innlogging så, er aldri nytt. Det
// gjelder også en `sist` som peker på en versjon lista ikke har: en
// forhåndsvisning kan ha vist en dag som ikke er flettet, og da skal
// prod-portalen ikke late som alt er nytt.
export function nyeEndringer(versjoner, sist) {
  if (!sist || !VERSJON_FORM.test(String(sist.versjon || ""))) return null;
  const liste = Array.isArray(versjoner) ? versjoner : [];
  const antallSett = Math.max(0, Number(sist.antall) || 0);
  const ut = [];

  liste.forEach((v) => {
    const nr = String(v && v.versjon || "");
    const linjer = Array.isArray(v && v.endringer) ? v.endringer : [];
    if (nr > sist.versjon) {
      if (linjer.length) ut.push({ versjon: nr, endringer: linjer.slice() });
    } else if (nr === sist.versjon) {
      const nye = linjer.slice(antallSett);
      if (nye.length) ut.push({ versjon: nr, endringer: nye });
    }
  });
  return ut;
}

// Antall nye linjer, for overskriften. Teller linjer, ikke dager: «3 nye
// ting» sier mer enn «1 ny versjon».
export function antallNye(nye) {
  return (nye || []).reduce((sum, v) => sum + v.endringer.length, 0);
}

// Hva portalen sender når den er åpnet. Samme regler som tjenesten, fra
// samme fil: blir de uenige, sier portalen «logget» om noe basen avviser.
export function sjekkInnlogging(inn) {
  const feil = [];
  const versjon = String((inn && inn.versjon) || "");
  const antall = inn ? inn.antall : undefined;
  if (!VERSJON_FORM.test(versjon) || versjon.length > VERSJON_MAKS) {
    feil.push("Versjonen har feil form.");
  }
  if (!Number.isInteger(antall) || antall < 0 || antall > ANTALL_MAKS) {
    feil.push("Antallet endringer har feil form.");
  }
  return feil;
}

// Raden slik tjenesten skriver den. `bruker` og `tid` står IKKE her:
// databasen setter den første fra økta og den andre fra klokka si, og
// skriveregelen krever at den første er din egen. Sendte funksjonen dem,
// kunne en feil skrive i en annens navn — og en logg der hvem som helst kan
// påstå å være noen andre, er verre enn ingen.
export function loggRad(inn) {
  return { versjon: String(inn.versjon), antall: inn.antall };
}

// Radene fra basen, i den formen portalen leser. Tåler tull.
export function tolkAdminLogg(json) {
  return (Array.isArray(json) ? json : []).filter((r) => r && r.id && r.bruker).map((r) => ({
    id: String(r.id),
    bruker: String(r.bruker),
    tid: r.tid ? String(r.tid) : "",
    versjon: r.versjon ? String(r.versjon) : "",
    antall: Number.isInteger(r.antall) ? r.antall : 0,
  }));
}

// Den forrige innloggingen din, av radene for deg nyeste først. Den nyeste
// er den du nettopp skrev; den forrige er nummer to.
export function forrigeInnlogging(rader, innlogging) {
  const dine = (rader || []).filter((r) => innlogging && r.bruker === innlogging.bruker
    && r.id !== innlogging.id);
  return dine.length ? dine[0] : null;
}
