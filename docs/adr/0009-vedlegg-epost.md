# 0009, vedlegg — Parkert: engangskoden på e-post

Dette **virket**, sett i prod 12. september 2026 i forhåndsvisningen av
#68: hele kjeden fra e-post til økt, med Resend som avsender, malene med
`{{ .Token }}`, en kode på åtte siffer og oppslaget som `magiclink`.

Det står her fordi det skal hentes fram igjen den dagen et domene er
kjøpt. Hele koden ligger på grenen `epost-innlogging`, og
`konto-data.js` beholder e-posthalvdelen — parkert, ikke kastet, og
holdt i orden av enhetstestene.

## Fire ting sto i veien, og ga alle *den samme* feilen

- **SMS-sperren hos Brevo.** Registreringen krever kode på mobil, og den
  kom aldri. Mailjet og Amazon SES har samme krav. Derfor Resend, som er
  amerikansk — et bevisst kompromiss, tatt fordi EU-alternativene ikke
  lot seg registrere.
- **Låste maler uten egen SMTP.** Standardmalen sender en *lenke*, ikke
  en kode. Rekkefølgen er SMTP først, mal etterpå.
- **Stor R i SMTP-brukernavnet.** Det skal være `resend`, og feltet er
  versalfølsomt som en miljøvariabel.
- **At appen kappet koden til seks siffer.** Kodelengden stilles i
  Supabase (*Authentication* → *Rate Limits* → «Email OTP Length»), og
  dette prosjektet står på åtte. `KODE_MIN` og `KODE_MAKS` er derfor et
  spenn, ikke et tall. Kappet til seks sendte vi «637381» og fikk 403 —
  som ser nøyaktig ut som en feil kode. Det siste var vårt, og det tok en
  kveld.

## To ting til som gjelder den dagen koden hentes fram

- Supabase lagrer engangskoden ulikt etter hvilken vei adressen kom inn
  («signup», «magiclink», «email»), og alle tre gir samme 403 utenfra.
  Derfor prøver funksjonen dem i rekkefølge (`KODETYPER`), og bare
  avvisninger gir et forsøk til.
- Feil kode og utløpt kode får samme svar: at en kode fantes, er i seg
  selv noe om adressen.
