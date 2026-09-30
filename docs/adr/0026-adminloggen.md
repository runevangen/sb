# 0026 — Adminloggen: hvem var inne, og hva er nytt siden sist

## Kontekst
Portalen åpnes med `ADMIN_PASSORD`, som er delt. Den sier at noen kjente
passordet — ikke hvem. Skriving er alt merket med den som gjorde den
(`satt_av`, `foreslatt_av`, `sendt_av`), men *lesing* og det å åpne portalen
var anonymt. Meldt 30. september 2026: «vi må logge hvem som har brukt
admin-kontoen», og den som kommer inn skal få se hva som har skjedd siden
sist.

## Beslutning
Hver innlogging i portalen er en rad i `admin_logg`, skrevet med den
innloggedes egen økt. Raden husker nyeste versjon i `versjoner.js` og hvor
mange linjer den oppføringen hadde. Neste innlogging sammenlikner med
forrige rad og viser det som er nytt, øverst, i «Nytt siden sist».
Seksjonen «Adminlogg» viser de siste femti innloggingene med navn.

## Konsekvens

### Portalen åpner bare når raden ligger der
Passordet alene sier ikke hvem. En logg over «noen» er verre enn ingen, så
innloggingen avvises uten en økt: portalen sier «logg inn i appen først» og
åpner ikke. Det er et brudd med regelen om at portalen *leser* stedene uten
en økt — den ble laget fordi lesingen er offentlig og en utløpt økt stengte
admin ute fra data ingen skjuler. Her er spørsmålet hvem, og det kan bare
økta svare på. En admin med utløpt økt åpner appen én gang, og økta fornyes.

### Loggen er bare å legge til
Ingen policy for oppdatering eller sletting: en innlogget økt kan verken
endre eller fjerne en rad, heller ikke sin egen. Den som har SQL-editoren
kan fortsatt — det er databaseeieren, ikke portalen. Skriving krever en rad
i `visning_skrivere`, så loggen fylles ikke av hvem som helst med en konto.

### Antallet linjer, ikke bare datoen
Versjonen er datoen, og det er én oppføring per dag. Endrer noe seg klokka
16 etter at du var inne klokka 10, står den nye linjen under samme nummer.
Raden husker derfor antall linjer, og nye linjer legges **nederst** i dagens
oppføring. Ordenen mellom dagene holdes av en vakt i `unit.mjs`.

### Dette er ikke telling av lesere
[ADR 0004](0004-ingen-statistikk.md) gjelder dem som leser appen, og står.
Loggen rører bare de få som står i `visning_skrivere`, og den finnes for at
admin skal kunne svare på hvem som gjorde hva. Personvernsida sier det.

### Slettes med kontoen
`on delete cascade`, som resten: personvernsida lover at det som hører til
kontoen går med den. En uid uten navn som blir liggende etter en som ba om å
bli glemt, er nettopp det løftet sier ikke skal skje. Prisen er at loggen
mister radene til en admin som sletter kontoen sin.

### Hva som ikke logges
Bare innloggingen, ikke hva du gjorde etterpå. Det du skriver er merket
med deg alt: `satt_av`, `foreslatt_av` og `sendt_av` står i hver sin tabell.
