# ADR 0021 — «Sist inne» leses fra øktene, ikke fra PIN-datoen

**17. september 2026.** Gjelder.

## Problemet

Adminportalen viste `last_sign_in_at` fra Supabase. Det feltet er sist noen
**tastet PIN-en**. Appen holder telefonen innlogget med roterende fornyere
([ADR 0009](0009-fornavn-og-pin.md)), og `grant_type=refresh_token`
oppdaterer ikke feltet — så en som er innom hver dag kan stå med en dato
uker tilbake.

Meldt to dager på rad, begge gangene av en som var innlogget i det
øyeblikket han leste «2 dager siden»:

> «Sist inne-loggen av brukere er feil. Jeg er inne nå og det står 2 dager
> siden.» *(16. september)*

> «Sist pålogget er fortsatt feil. Jeg er inne men det står 2 dager
> siden.» *(17. september)*

16. september ble kolonnen døpt om til «Sist pålogget». Det gjorde
etiketten sann, og lot spørsmålet stå ubesvart: *når var de inne?*

## Det vi først trodde var svaret

At dette ikke gikk an uten å bryte [ADR 0004](0004-ingen-statistikk.md) —
at å vite når noen sist brukte appen, krever at vi begynner å telle bruk.

Det var feil, og det tok et oppslag i databasen å se det. Samme konto:

| Felt | Verdi |
| --- | --- |
| `users.last_sign_in_at` | 14. september |
| `sessions.refreshed_at` | 17. september 21:04 |

## Avgjørelsen

**«Sist inne» kommer fra `auth.sessions.refreshed_at`.**

Skillet som gjør dette forenlig med ADR 0004: vi **fører ingenting**.
GoTrue skriver feltet fordi den *må* for å holde folk innlogget — det er
samme grunn `last_sign_in_at` finnes, og det feltet har vi vist hele tiden.
Forskjellen mellom de to er hvilket av Supabases egne felter vi leser, ikke
om vi har begynt å måle noen.

ADR 0004 forbyr sporing: en teller vi fører selv, en tredjepart som ser
leserne, en informasjonskapsel som følger noen rundt. Ingen av delene skjer
her.

## Hva det faktisk betyr

Tre ting som må stå, ellers blir kolonnen en ny halvsannhet:

- **«Sist appen var i gang», ikke «sist de så på skjermen».** Fornyelsen
  skjer når appen åpnes, og med jevne mellomrom mens den står åpen. En app
  i bakgrunnen kan fornye uten at personen ser noe.
- **Historikken er bare så lang som øktene lever.** Logger noen ut, eller
  går økta ut, forsvinner raden. Da står det «Ingen økt i live» — ikke en
  tom celle, som ikke er til å skille fra «har aldri vært inne».
- **PIN-datoen er ikke borte.** Den ligger i hjelpeteksten på cella, for
  det er den du trenger når noen har glemt PIN-en og du lurer på om de har
  vært innom siden du ga dem en ny.

## Hvordan

`auth` nås ikke utenfra — PostgREST eksponerer bare `public`. Derfor en
`security definer`-funksjon `public.sist_inne()`, med `execute` bare til
`service_role`. Den ene nøkkelen `brukere.mjs` alt har
([ADR 0010](0010-ingen-service-role.md)) er den eneste som slipper til; en
innlogget bruker skal ikke kunne spørre når naboen sist var inne.

**`refreshed_at` er `timestamp without time zone`.** Verdien er UTC, men
bærer ingen zone. Uten `at time zone 'utc'` bruker Postgres tjenerens egen
sone når den støper om til `timestamptz`.

Målt mot basen 17. september: tjenerens sone **er** UTC, så castingen gir
nøyaktig samme verdi i dag. Den står der likevel — ikke fordi den retter
noe nå, men fordi den gjør riktigheten uavhengig av en innstilling ingen av
oss eier. En verdi som er riktig ved et sammentreff, er den typen som
slutter å være det uten at noen rørte koden.

En test kan ikke fange dette her: suitene våre snakker ikke med Postgres.
Derfor står det skrevet i stedet.

Øktkallet er et **tillegg**: feiler det, står brukerlista der uten
kolonnen, og portalen sier at den mangler. En stille tom kolonne ville
ikke vært til å skille fra «ingen har vært inne».

## Hva vi ikke gjorde

- **Ingen ny teller.** Det ville vært ADR 0004-bruddet, og det ville
  dessuten kunnet gli fra virkeligheten uten at noen merket det.
- **Ingen egen tabell over besøk.** Øktene finnes fra før og ryddes av
  Supabase selv.
- **Ingen kolonne til.** To datoer som ligner på hverandre er en invitasjon
  til å lese feil; PIN-datoen står i hjelpeteksten i stedet.

## Følger

`personvern.html` sa at adminsiden viser «når hver av dem logget inn første
og siste gang». Den setningen ble usann i det kolonnen skiftet betydning,
og er rettet — ikke som en ny opplysning, men for å holde en gammel sann.
