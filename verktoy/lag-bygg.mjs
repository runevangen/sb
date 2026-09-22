// Stempler inn hvilken utrulling dette er, mens byggemiljøet fortsatt vet
// det.
//
// **Hvorfor dette må skje ved bygging, ikke ved kall.** Første forsøk lot
// `/api/brukere` lese `process.env.COMMIT_REF` når portalen spurte.
// Funksjonen svarte `null` hver gang, og portalen sa ærlig fra:
// «Byggemiljøet oppgir ingen commit». Grunnen er at Netlifys
// lese-variabler — `COMMIT_REF`, `BRANCH`, `CONTEXT`, `DEPLOY_ID` — finnes
// i **byggemiljøet**, ikke i funksjonenes kjøretid. De er der akkurat nå,
// mens denne fila kjører, og borte etterpå.
//
// Så vi skriver dem ned mens vi har dem. `bygg.js` er en generert fil:
// den ligger i `.gitignore`, finnes ikke lokalt, og lages på nytt ved hver
// utrulling.
//
// **Ingenting her er hemmelig.** En commit-sha står i git-historikken, og
// repoet er offentlig. Portalen krever passord for å *vise* den, som for
// resten av seksjonen — det gjør den vanskelig å snuble over, ikke umulig
// å finne, og den forskjellen skal ikke pyntes på.
//
// Kjøres av byggekommandoen i `netlify.toml`, etter testene: feiler
// portene, skal ingenting publiseres, og da er det heller ingenting å
// stemple.

import { writeFileSync } from "node:fs";

// Bare det som svarer på «ser jeg på det nyeste?». Ingen nøkler, ingen
// adresser — fila serveres til nettleseren.
const FELT = ["COMMIT_REF", "BRANCH", "CONTEXT", "DEPLOY_ID"];

function les(navn) {
  const v = String(process.env[navn] || "").trim();
  return v || null;
}

const bygg = { tid: new Date().toISOString() };
for (const navn of FELT) bygg[navn.toLowerCase()] = les(navn);

// `commit_ref` → `commit`: navnet i fila er Netlifys, navnet i appen er
// vårt. Ett sted å oversette, framfor at portalen kjenner Netlifys ord.
const ut = {
  tid: bygg.tid,
  commit: bygg.commit_ref,
  gren: bygg.branch,
  kontekst: bygg.context,
  utrulling: bygg.deploy_id,
};

// Hvor fila skal. Standard er rota, og det er det utrullingen bruker.
// Argumentet finnes for én grunn: `unit.mjs` kjører dette skriptet på
// ekte og leser det som kom ut — en test som stubbet svaret ville vært
// enig med feilen, og det var nettopp en slik test som lot
// «Byggemiljøet oppgir ingen commit» rulle ut.
const mal = process.argv[2]
  ? new URL(process.argv[2], "file://" + process.cwd() + "/")
  : new URL("../bygg.js", import.meta.url);

writeFileSync(
  mal,
  "// Generert av verktoy/lag-bygg.mjs ved utrulling. Ikke rediger, og\n" +
  "// ikke commit — fila staar i .gitignore.\n" +
  "export const BYGG = " + JSON.stringify(ut, null, 2) + ";\n",
);

const kjent = Object.keys(ut).filter((n) => ut[n]).length;
console.log("[bygg] stemplet " + kjent + " av " + Object.keys(ut).length +
  " felt: " + JSON.stringify(ut));
