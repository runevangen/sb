# 0025 — Feil og ønsker går i en kø, og leseren ser svaret

## Kontekst
Den eneste veien fra en leser til den som drifter appen var å kjenne noen
som kjente noen. Meldt 27. september 2026: «gi feedback til admin for feil
og ønsker om endringer på app». Det som kom inn til da, kom som
skjermbilder i en chat — og skjermbildet var ofte hele opplysningen om
*hvor* feilen var.

## Beslutning
Kontosiden får «Meld feil eller ønske». Meldingen går i tabellen
`tilbakemelding` i Supabase, skrevet med leserens egen økt, og portalen
får en kø — «Feil og ønsker» — med tre svar: Lest, Fikset, Ikke nå.
Svaret står under «Dine meldinger» på leserens kontoside.

## Konsekvens

### Bare innlogget
Kontoen er sperren mot spam. Uten den måtte vi talt IP-adresser eller
satt en CAPTCHA fra en tredjepart, og begge er sporing
([ADR 0004](0004-ingen-statistikk.md)). Det bryter ikke
[ADR 0009](0009-fornavn-og-pin.md): ingenting du *leser* er låst, og å
sende noe til oss har alltid krevd en konto — samme regel som
pubforslagene.

### Det som følger med står i skjemaet
Skjermen du sto på og versjonen følger med, i ord («Fotball › Eliteserien
› Tabell · versjon 2026.09.27»), og de står synlige over sendknappen med
en knapp som fjerner dem. En opplysning vi sender om deg, skal du kunne
lese og slette før den går — samme regel som posisjonen i pubforslaget.
Ingen nettleser, ingen skjermstørrelse, ingen logg: det ville vært en
teller vi fører.

### Svaret er synlig for den som sendte
En innsending uten svar tilbake er et hull i veggen, og folk slutter å
kaste ting i det. «Sendt» blir «Lest» når noen har sett den, og «Fikset»
eller «Ikke nå» når det er bestemt. «Ikke nå» er med vilje ikke «Avvist»:
et ønske vi ikke gjør denne måneden er ikke et dårlig ønske.

### RLS er låsen, ikke funksjonen
Leseren kan bare sette inn i eget navn, med status `ny`, og bare lese sine
egne. Oppdatering og lesing av alle krever en uid i `visning_skrivere`,
som resten av portalen. Funksjonen har ingen `service_role`
([ADR 0010](0010-ingen-service-role.md)).

### Slettes med kontoen
`on delete cascade` mot `auth.users`. Sletter du kontoen, går meldingene
dine med — og `personvern.html` sier det.
