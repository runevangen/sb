# 0010 — Ingen funksjon har en service_role-nøkkel

## Kontekst
En `service_role`-nøkkel kan skrive hva som helst, i hvem som helst sitt
navn, forbi alle RLS-regler.

## Beslutning
Funksjonene bruker leserens **egen økt** (`Authorization: Bearer`).
Databasen setter `bruker` fra økten, og reglene slipper bare gjennom din
egen rad.

Ett unntak: `netlify/functions/brukere.mjs`.

## Konsekvens
- En feil i `konto.mjs` eller `svar.mjs` kan ikke skrive i en annens navn.
  Det er hele poenget.
- **Du sletter kontoen din selv** gjennom `slett_meg()`, en
  `security definer`-funksjon som sletter raden der id-en er `auth.uid()`
  og ingen andre. Den tar ikke imot noen id, så selv en feil i
  `konto.mjs` kan ikke slette en annens konto. `on delete cascade` tar
  `kampsvar` med.
- **Unntaket er bevisst.** Å sette en annens PIN og slette en annens
  konto *er* å handle på vegne av andre, og Supabase Auth har ingen annen
  vei dit; en `security definer`-funksjon ville bare flyttet den samme
  makta inn i databasen, med en hemmelighet i et SQL-argument i stedet.
  Nøkkelen ligger derfor i den ene fila, importeres ingen steder, og fila
  gjør ikke annet enn dette.
- Hver handling der krever `ADMIN_PASSORD`, sammenliknet i **konstant
  tid**, og sjekken skjer **før** noe som helst annet: et feil passord når
  aldri Supabase. En nettlesertest sjekker at portalen ikke henter en
  eneste bruker før passordet er godtatt.
- **Admin ser aldri en PIN.** De ligger hashet hos Supabase. Admin kan
  sette en ny — og da står den i klartekst på skjermen én gang, fordi den
  må sies videre.
