// Hvilke kamper pubene viser. Skrives av admin-portalen pa /admin.html,
// ikke for hand — men fila er lesbar og kan rettes for hand om noe gar
// galt.
//
// Den ligger i koden, som puber-oslo.js, av samme grunn: da trenger
// leseren ingen nettkall for a se hvem som viser kampen, og historikken
// star i git. Det koster en utrulling per lagring, som er greit sa lenge
// det er en admin. Skal puber skrive selv (#65), ma dette flyttes til et
// ekte lager.
//
// Lista er gyldig JSON med vilje: da kan funksjonen lese tilbake den
// ekte tilstanden fra GitHub framfor a stole pa en utrullet kopi, som
// ville vaert utdatert mellom to lagringer.
//
// pub ma stemme med et navn i puber-oslo.js. kampId er id-en fra
// terminlisten. kamp og dato star her for at fila skal vaere lesbar
// alene; det er kampId som gjelder.

export const VISNINGER = [
  {"pub":"Andy's Pub","kampId":2399155,"kamp":"Lillestrøm – Vålerenga","dato":"2026-09-12T14:00:00Z","satt":"2026-09-11T13:13:49.919Z"},
  {"pub":"Andy's Pub","kampId":2399156,"kamp":"Rosenborg – Tromsø","dato":"2026-09-12T16:00:00Z","satt":"2026-09-11T13:13:49.919Z"},
  {"pub":"Andy's Pub","kampId":2399151,"kamp":"Bodø/Glimt – Sandefjord","dato":"2026-09-14T17:00:00Z","satt":"2026-09-11T13:13:49.919Z"}
];
