// Kontaktopplysninger om pubene i puber-oslo.js: telefon, e-post,
// adresse, mat, apningstider, bordbestilling, aldersgrense og skjermer.
//
// EGEN FIL, med vilje. puber-oslo.js baerer en redaksjonell vurdering —
// viser dette stedet fotball? — som star seg over tid. Et telefonnummer
// gjor ikke det. De to raatner i ulikt tempo og skal kunne vedlikeholdes
// hver for seg.
//
// INGENTING HER VISES I APPEN FOR DET ER VERIFISERT.
// Hvert felt baerer kilden og et ordrett sitat fra det som faktisk sto
// der. Har en person klikket seg gjennom og sett opplysningen med egne
// oyne, settes verifisert til datoen det skjedde. kontaktFor() i
// pub-data.js gir bare ut felt som har den datoen. Uten den er raden
// et forslag, ikke et faktum — og et feil telefonnummer til en ekte
// bedrift er verre enn ingen.
//
// tillit: hvor mange uavhengige kilder som sa det samme. 1 betyr at
// ingen bekreftet det. Felt som ikke ble funnet, star ikke her i det
// hele tatt.
//
// Samlet inn 11. september 2026. Merk: innsamlingen naadde ingen av
// pubenes egne sider — nettverket slapp bare sok igjennom — sa sitatene
// er slik de sto i soketreffet, ikke lest fra kilden selv. Det er
// nettopp derfor ingenting er verifisert enna.

export const PUBER_KONTAKT = {
  "Bohemen Sportspub": {
    // Adressen stemmer med vår. Motstrid om antall skjermer: én kilde (beerintheevening/Tripadvisor-sammendrag) sa «15 big TV screens», en annen «13 TV screens and a big screen» — jeg valgte den siste fordi den følger av bohemen.no/sevm26-omtalen, men tallet bør bekreftes. Ingen e-postadresse funnet noe s
    telefon: { verdi: "+47 22 41 62 66", tillit: 2, kilde: "https://www.1881.no/restaurant/restaurant-oslo/restaurant-oslo-sentrum/bohemen-sportspub_100660271S1/", sitat: "Telefonnummer (Phone Number): 22 41 62 66" },
    nettside: { verdi: "https://www.bohemen.no/", tillit: 2, kilde: "https://www.bohemen.no/plassbestilling/", sitat: "Plassbestilling – Bohemen sportspub - Oslo" },
    adresse: { verdi: "Arbeidergata 2, 0159 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/bohemen-sportspub-oslo-2", sitat: "BOHEMEN SPORTSPUB - Updated June 2026 - Arbeidergata 2, Oslo, Norway - Sports Bars" },
    mat: { verdi: "ingen mat", tillit: 1, kilde: "https://www.beerintheevening.com/pubs/s/26/2625/Bohemen_Sportspub/Oslo", sitat: "There is no food available, but you can bring food from outside." },
    apningstider: { verdi: "man–tor 14–00.30, fre 14–02, lør 13–02, søn 14–23.30", tillit: 1, kilde: "https://www.tripadvisor.com/Restaurant_Review-g190479-d3803304-Reviews-Bohemen_Sportspub-Oslo_Eastern_Norway.html", sitat: "Monday–Thursday: 2:00 PM–12:30 AM, Friday: 2:00 PM–2:00 AM, Saturday: 1:00 PM–2:00 AM, Sunday: 2:00 PM–11:3…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://www.bohemen.no/plassbestilling/", sitat: "For groups of three or more, it's possible to pre-book tables for matches, with a deadline of 12:00 on the …" },
    skjermer: { verdi: "13 TV-skjermer og storskjerm, kan vise opptil fem kamper samtidig", tillit: 1, kilde: "https://sevm26.no/en/bar/bohemen-sportspub", sitat: "It features 13 TV screens and a big screen showing sporting events, and can show up to five games simultane…" },
  },

  "Scotsman": {
    // Motstrid om adressen: Yelp fører stedet på «Karl Johans gate 17», mens scotsman.no, visitoslo.com, gastroplanner og visitnorway alle sier Karl Johans gate 35 — jeg går for 35, som også er den vi har i dag. Motstrid om telefon: ett treff (proff.no/1881) viste også «23964471»; +47 22 47 44 77 er gjeng
    telefon: { verdi: "+47 22 47 44 77", tillit: 2, kilde: "https://scotsman.no/kontakt-oss/", sitat: "Telephone: +47 22 47 44 77" },
    epost: { verdi: "scotsman@thon.no", tillit: 1, kilde: "https://www.1881.no/bar-og-pub/bar-og-pub-oslo/bar-og-pub-oslo-sentrum/the-scotsman_100129650S6/", sitat: "Email: scotsman@thon.no" },
    nettside: { verdi: "https://scotsman.no/", tillit: 2, kilde: "https://scotsman.no/", sitat: "Forside - Scotsman" },
    adresse: { verdi: "Karl Johans gate 35, 0162 Oslo", tillit: 2, kilde: "https://www.visitoslo.com/eat/the-scotsman", sitat: "Scotsman's address is Karl Johans gate 35, 0162 Oslo" },
    mat: { verdi: "full meny", tillit: 2, kilde: "https://scotsman.no/mat/", sitat: "Scotsman serves delicious pub food daily, and with over 50 years of experience has become one of Oslo's bes…" },
    apningstider: { verdi: "man 11–01, tir–ons 11–02, tor–lør 11–03, søn 12–01", tillit: 2, kilde: "https://scotsman.no/", sitat: "Monday: 11:00-01:00, Tuesday-Wednesday: 11:00-02:00, Thursday-Saturday: 11:00-03:00, Sunday: 12:00-01:00" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://scotsman.no/booking/", sitat: "Booking | Reserver bord | Scotsman" },
    skjermer: { verdi: "kjelleren: åtte 50-tommere; puben: fotball på storskjerm", tillit: 1, kilde: "https://scotsman.no/", sitat: "The Basement: Sports pub with eight 50-inch screens, shuffleboard, pub food and a large selection of beer, …" },
  },

  "Dr. Jekyll's Pub": {
    // Motstrid om åpningstider: én kilde (Tripadvisor/Yelp-sammendrag) ga «Mon–Fri, Sun: 3:00 PM–3:00 AM; Sat: 1:00 PM–3:00 AM», en annen (jekylls.no-omtalen) ga man–ons 16–00, tor–lør 15–03, søn 16–00. Jeg valgte den som var knyttet til stedets egen side, men de spriker mye og bør sjekkes. Bordbestilling
    telefon: { verdi: "+47 22 41 30 44", tillit: 2, kilde: "https://jekylls.no/kontakt-oss/", sitat: "Phone: +47 224 13 044" },
    nettside: { verdi: "https://jekylls.no/", tillit: 2, kilde: "https://jekylls.no/", sitat: "Dr. Jekyll's Pub | Whiskybar og biljard i Oslo sentrum" },
    adresse: { verdi: "Klingenberggata 4, Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/dr-jekylls-pub-oslo", sitat: "DR. JEKYLLS PUB - Updated August 2026 - 26 Photos & 29 Reviews - Klingenberggata 4, Oslo, Norway - Whiskey …" },
    mat: { verdi: "ingen mat", tillit: 1, kilde: "https://givn.no/en/guide/places/oslo/restaurants/drjekyllspub", sitat: "Regarding food, it's worth noting that they don't serve any food." },
    apningstider: { verdi: "man–ons 16–00, tor–lør 15–03, søn 16–00", tillit: 1, kilde: "https://jekylls.no/", sitat: "Opening hours are: Monday–Wednesday 16:00–00:00, Thursday–Saturday 15:00–03:00, and Sunday 16:00–00:00." },
    bordbestilling: { verdi: true, tillit: 2, kilde: "https://jekylls.no/booking/", sitat: "Dr. Jekyll's Pub | Reserver bord, event og smaking | Booking" },
    aldersgrense: { verdi: 20, tillit: 1, kilde: "https://givn.no/en/guide/places/oslo/restaurants/drjekyllspub", sitat: "The age limit is 20 years." },
    skjermer: { verdi: "TV-skjermer i Underground Sportsbar; viser sport på storskjerm", tillit: 1, kilde: "https://jekylls.no/sport-pa-storskjerm/", sitat: "The pub has an Underground Sportsbar with two billiard tables and a full bar with TV screens so you can wat…" },
  },

  "The Dubliner Folk Pub": {
    // E-posten var skjult i treffet (vist som «[email protected]»), så jeg har ingen adresse å oppgi — står som null framfor å gjette på info@dubliner.no. Aldersgrense: én kilde antydet at «evening visits may be limited to adults only», men det er et forbehold og ikke et tall, så feltet står tomt. Skjerme
    telefon: { verdi: "+47 22 33 70 05", tillit: 2, kilde: "https://www.visitoslo.com/eat/the-dubliner-folk-pub", sitat: "Telefon (Phone): 22 33 70 05" },
    nettside: { verdi: "https://www.dubliner.no/", tillit: 2, kilde: "https://www.dubliner.no/", sitat: "The Dubliner" },
    adresse: { verdi: "Rådhusgata 28, 0151 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/the-dubliner-oslo", sitat: "THE DUBLINER - Updated July 2026 - 38 Photos & 23 Reviews - Rådhusgata 28, Oslo, Norway - Irish" },
    mat: { verdi: "full meny", tillit: 2, kilde: "https://www.visitoslo.com/eat/the-dubliner-folk-pub", sitat: "Authentic Irish pub in central Oslo with a large selection of beers and authentic pub fare such as fish & c…" },
    apningstider: { verdi: "man 12–01, tir–tor 12–03, fre–lør 12–03.30, søn 12–01 (kjøkken: hverdager 14–22, lør 12–22, søn 14–21)", tillit: 1, kilde: "https://www.visitoslo.com/eat/the-dubliner-folk-pub", sitat: "Mon - 12:00 pm - 1:00 am, Tue - 12:00 pm - 3:00 am, Wed - 12:00 pm - 3:00 am, Thu - 12:00 pm - 3:00 am, Fri…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://restaurantguru.com/The-Dubliner-Oslo", sitat: "The Dubliner accepts reservations." },
  },

  "O'Learys Vika": {
    // VIKTIG ADRESSEAVVIK: vi har «Olav Vs gate 1», men tre kilder (Mattilsynets smilefjes-register, restaurants10 og O'Learys egen karriereside) fører O'Learys Oslo Vika på Ruseløkkveien 26, 0251 Oslo. Olav Vs gate 1 dukker i treffene opp som et kontorbygg (Holm Eiendom / let.no), ikke som en restauranta
    telefon: { verdi: "+47 484 06 215", tillit: 1, kilde: "https://career.olearys.com/locations/o-learys-oslo-vika", sitat: "Phone: +47 48406215" },
    epost: { verdi: "vika@olearys.no", tillit: 1, kilde: "https://career.olearys.com/locations/o-learys-oslo-vika", sitat: "Email: vika@olearys.no" },
    nettside: { verdi: "https://olearys.com/en-no/vika-oslo/", tillit: 2, kilde: "https://olearys.com/en-no/vika-oslo/", sitat: "Vika, Oslo | O'Learys Norway" },
    adresse: { verdi: "Ruseløkkveien 26, 0251 Oslo", tillit: 2, kilde: "https://smilefjes.mattilsynet.no/spisested/oslo/olearys_vika.Z2312201319271600128GDMCL/", sitat: "O'Learys Vika is located at Ruseløkkveien 26, 0251 Oslo" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://olearys.com/en-no/vika-oslo/food/food-menu/", sitat: "The venue offers a Bostonian inspired menu … offering customers a complete experience with a combination of…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://olearys.com/en-no/vika-oslo/", sitat: "Table Reservations: Reservations are available." },
  },

  "Proud Mary Pub": {
    // Adressen stemmer med vår. «full meny» er satt fordi kilden oppgir egne kjøkkentider 12–22 alle dager og omtaler «pubmat» — men ingen kilde beskriver selve menyen, så skillet mellom «full meny» og «enkel mat» hviler på kjøkkentidene. Vil du være streng, sett feltet til null. Telefonnummeret dukket op
    telefon: { verdi: "+47 22 01 05 10", tillit: 1, kilde: "https://www.visitoslo.com/en/product/?tlp=7537783&name=Proud-Mary-Pub", sitat: "Phone: +47 22 01 05 10" },
    epost: { verdi: "oslo@proudmarypub.no", tillit: 2, kilde: "https://proudmarypub.no/oslo", sitat: "Email: oslo@proudmarypub.no" },
    nettside: { verdi: "https://proudmarypub.no/oslo", tillit: 2, kilde: "https://proudmarypub.no/oslo", sitat: "The pub reinvented - Proud Mary" },
    adresse: { verdi: "Nedre Vollgate 19, 0158 Oslo", tillit: 2, kilde: "https://www.visitnorway.com/listings/proud-mary-pub/281288/", sitat: "Address: Nedre Vollgate 19, 0158 Oslo" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://proudmarypub.no/oslo", sitat: "Monday - Thursday: 12:00 - 03:00 (Kitchen: 12:00 - 22:00), Friday - Sunday: 12:00 - 03:00 (Kitchen: 12:00 -…" },
    apningstider: { verdi: "man–søn 12–03 (kjøkken 12–22)", tillit: 1, kilde: "https://proudmarypub.no/oslo", sitat: "Monday - Thursday: 12:00 - 03:00 (Kitchen: 12:00 - 22:00), Friday - Sunday: 12:00 - 03:00 (Kitchen: 12:00 -…" },
    bordbestilling: { verdi: true, tillit: 2, kilde: "https://proudmarypub.no/oslo/tablebooking", sitat: "Book a table - Proud Mary" },
  },

  "Andy's Pub": {
    // OM DE TO DOMENENE: begge finnes og begge fører til Stortingsgata 8 — det ser altså ut som ett sted med to nettsteder, ikke to puber. andyspuboslo.no («Andy's Pub - Authentic Norwegian Pub in Oslo») har levende undersider (/kontakt, /om-oss) og er den ett treff omtaler som «the official website». and
    telefon: { verdi: "+47 22 42 68 46", tillit: 2, kilde: "https://www.andyspuboslo.no/kontakt", sitat: "Phone: 22 42 68 46" },
    adresse: { verdi: "Stortingsgata 8, 0161 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/andys-pub-oslo", sitat: "ANDY'S PUB - Updated June 2026 - 12 Reviews - Stortingsgata 8, Oslo, Norway - Pubs" },
    mat: { verdi: "enkel mat", tillit: 1, kilde: "https://restaurantguru.com/Andys-Sportspub-and-Pianobar-Oslo/menu", sitat: "Serves sausages and baguette sandwiches" },
    apningstider: { verdi: "søn–fre 15–03, lør 13–03", tillit: 1, kilde: "https://www.andyspuboslo.no/", sitat: "Opening Hours: Sun – Fri: 3:00PM – 3:00AM; Saturday: 1:00PM – 3:00AM" },
    bordbestilling: { verdi: false, tillit: 1, kilde: "https://www.andyspuboslo.no/kontakt", sitat: "They do not take table reservations." },
    skjermer: { verdi: "åtte skjermer og tre store prosjektorer", tillit: 1, kilde: "https://www.andyspuboslo.no/om-oss", sitat: "Official home for the Liverpool Supporter Club with eight screens and three large projectors" },
  },

  "Trafalgar Sportsbar": {
    // TYNNEST AV DE NI, og den eneste uten egen nettside i treffene — alt kommer fra aggregatorer (basset.no, revieweuro, directmap, polomap, sluurpy, menu-world) eller Facebook. MOTSTRID OM TELEFON: tre tall dukket opp — «980 11 756» (flest treff: basset.no, revieweuro, textmap, polomap), «+47 908 08 458
    telefon: { verdi: "+47 980 11 756", tillit: 2, kilde: "https://no.revieweuro.com/oslo/trafalgar-sportsbar-67478", sitat: "Trafalgar Sportsbar, Keysers gate 1, Oslo, Phone +47 98 01 17 56" },
    adresse: { verdi: "Keysers gate 1, 0165 Oslo", tillit: 2, kilde: "https://basset.no/17233691395899847431/", sitat: "Trafalgar Sportsbar - Keysers gate 1, 0165 Oslo" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://no.sluurpy.com/oslo/restaurant/6555829/trafalgar-sports-bar", sitat: "Trafalgar serves typical pub food such as burgers, fish & chips and snacks." },
    apningstider: { verdi: "man–tor 13–01, fre–lør 13–03, søn 13–00", tillit: 1, kilde: "https://directmap.today/oslo/9188", sitat: "Monday-Thursday: 13:00-01:00, Friday: 13:00-03:00, Saturday: 13:00-03:00, Sunday: 13:00-00:00" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://trafalgar-sportsbar.menu-world.com/", sitat: "You can reserve your table by calling them on 98011756." },
  },

  "The Toucan Public House": {
    // Adressen stemmer med vår. MOTSTRID OM ÅPNINGSTIDER: Untappd oppgir man–ons og søn 11–00 og tor–lør 11–03, mens toucanpub.no/resthon.no oppgir man 15–22, tir–ons 15–23, tor 13–00, fre–lør 13–01, søn 13–21. Forskjellen er stor — flere timer i begge ender — og jeg valgte stedets eget/Thons tall. Bør be
    telefon: { verdi: "+47 913 78 153", tillit: 2, kilde: "https://www.resthon.no/en/venues/the-toucan-public-house/", sitat: "phone number +47 91378153" },
    epost: { verdi: "resthon.salg@thon.no", tillit: 1, kilde: "https://toucanpub.no/booking/", sitat: "For more information about food and larger groups, you can contact resthon.salg@thon.no." },
    nettside: { verdi: "https://toucanpub.no/", tillit: 2, kilde: "https://toucanpub.no/", sitat: "The Toucan Public House | Bar og brun pub på Grønland i Oslo" },
    adresse: { verdi: "Brugata 11, 0186 Oslo", tillit: 2, kilde: "https://www.resthon.no/en/venues/the-toucan-public-house/", sitat: "The Toucan Public House is located at Brugata 11, 0186 Oslo" },
    mat: { verdi: "full meny", tillit: 2, kilde: "https://toucanpub.no/mat/", sitat: "They serve delicious classics at friendly prices, ranging from small dishes like crispy chicken wings to la…" },
    apningstider: { verdi: "man 15–22, tir–ons 15–23, tor 13–00, fre–lør 13–01, søn 13–21", tillit: 1, kilde: "https://www.resthon.no/lokaler/the-toucan-public-house/", sitat: "Monday: 15:00 – 22:00, Tuesday – Wednesday: 15:00 – 23:00, Thursday: 13:00 – 00:00, Friday – Saturday: 13:0…" },
    bordbestilling: { verdi: true, tillit: 2, kilde: "https://toucanpub.no/booking/", sitat: "You can book a table at The Toucan for 1-8 people or for 9+ people." },
    skjermer: { verdi: "viser sport på storskjerm", tillit: 2, kilde: "https://toucanpub.no/", sitat: "At The Toucan, you can enjoy live sport on the big screen, one of Oslo's best pub quizzes every Tuesday, gr…" },
  },

  "Grønland Boulebar & Spiseri": {
    // Adressen stemmer med vår. MOTSTRIDENDE ÅPNINGSTIDER: et bredt søk ga «Mandag - onsdag: 16-00, Torsdag: 16-01, Fredag: 16-03, Lørdag: 13-03, Søndag: 15-22», mens et søk begrenset til gronlandboule.no ga tidene som står over. Jeg har ført opp versjonen fra deres eget domene, men de to må sjekkes mot h
    telefon: { verdi: "+47 907 16 527", tillit: 1, kilde: "https://www.tripadvisor.com/Restaurant_Review-g190479-d25093491-Reviews-Gronland_Boulebar_Spiseri-Oslo_Eastern_Norway.html", sitat: "Phone: +47 907 16 527" },
    nettside: { verdi: "https://gronlandboule.no/", tillit: 2, kilde: "https://gronlandboule.no/", sitat: "Grønland Boulebar | Oslos beste utested for spill, mat og ..." },
    adresse: { verdi: "Grønlandsleiret 27, 0190 Oslo", tillit: 2, kilde: "https://www.tripadvisor.com/Restaurant_Review-g190479-d25093491-Reviews-Gronland_Boulebar_Spiseri-Oslo_Eastern_Norway.html", sitat: "Address: Grønlandsleiret 27, Oslo 0190 Norway" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://gronlandboule.no/mat/", sitat: "Mat | Franskinspirert mat på Grønland Boulebar & Spiseri" },
    apningstider: { verdi: "man–tir 15–22, ons–tor 15–23, fre 15–00.30, lør 13–00.30, søn stengt (åpent når de viser Formel 1)", tillit: 1, kilde: "https://gronlandboule.no/", sitat: "Monday – Tuesday: 15:00 – 22:00 / Wednesday – Thursday: 15:00 – 23:00 / Friday: 15:00 – 00:30 / Saturday: 1…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://gronlandboule.no/booking/", sitat: "The website has a booking form at gronlandboule.no/booking/ for table reservations and inquiries." },
    aldersgrense: { verdi: 20, tillit: 1, kilde: "https://gronlandboule.no/", sitat: "Etter klokken 18 er det aldersgrense 20 år" },
    skjermer: { verdi: "sport på storskjerm (antall skjermer ikke oppgitt)", tillit: 1, kilde: "https://gronlandboule.no/sportskalender/", sitat: "Sport på storskjerm - VM 2026, Champions league, Premier league, eliteserien" },
  },

  "Bernie's": {
    // Adressen stemmer med vår. MAT ER MOTSTRIDENDE I SAMME KILDE: «Bernie's tilbyr ... et variert utvalg av drikke og pubmat, inkludert burgere» og rett etterpå «stedet ikke serverer sin egen mat, så du kan bestille fra andre og nyte det med øl». Derfor står mat som null — dette må ringes inn. ÅPNINGSTID
    telefon: { verdi: "+47 92 06 54 83", tillit: 1, kilde: "https://norgeguide.com/oslo/puber-og-olhager/bernies/", sitat: "Bernie's is located at Schweigaards gate 50 B, 0191 Oslo, and their phone number is +47 92 06 54 83." },
    nettside: { verdi: "https://bernies.no/", tillit: 2, kilde: "https://bernies.no/", sitat: "- Bernie’s – Sportsbar og Bydelspub" },
    adresse: { verdi: "Schweigaards gate 50 B, 0191 Oslo", tillit: 2, kilde: "https://yandex.com/maps/org/bernie_s/111685765693/", sitat: "Bernie's, bar, pub, Oslo, Schweigaards Gate, 50B - Maps" },
    skjermer: { verdi: "6 skjermer", tillit: 1, kilde: "https://norgeguide.com/oslo/puber-og-olhager/bernies/", sitat: "Bernie's har 6 skjermer som viser Premier League, Scottish Premiership, EFL Championship, Champions League,…" },
  },

  "O'Learys Oslo Sentralstasjon": {
    // Adressen utdyper vår (Jernbanetorget 1) med etasje: Hovedhallen plan 2. ADVARSEL OM BORDBESTILLING: sitatet om «Book now» sto i et treffsett der den eneste FAQ-sida som kom opp var O'Learys Bø, ikke Oslo S. Det er trolig kjedeomfattende praksis, men det er ikke bekreftet for denne avdelingen — behan
    telefon: { verdi: "+47 480 21 789", tillit: 1, kilde: "https://olearys.com/en-no/sentralstasjon-oslo/", sitat: "Phone Number: +47 480 21 789" },
    nettside: { verdi: "https://olearys.com/en-no/sentralstasjon-oslo/", tillit: 2, kilde: "https://olearys.com/en-no/sentralstasjon-oslo/", sitat: "Sentralstasjon, Oslo | O'Learys Norway" },
    adresse: { verdi: "Hovedhallen plan 2, Jernbanetorget 1, 0154 Oslo", tillit: 1, kilde: "https://oslo-s.no/en/spisesteder/olearys/", sitat: "Location: Hovedhallen plan 2, Jernbanetorget 1, 0154 Oslo, Norway" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://olearys.com/en-no/sentralstasjon-oslo/food/food-menu/", sitat: "The menu includes items such as buffalo wings, parmesan garlic wings, double burgers, various burger option…" },
    apningstider: { verdi: "man–tor 11–24, fre 11–01, lør 12–01, søn 12–24", tillit: 1, kilde: "https://olearys.com/en-no/sentralstasjon-oslo/", sitat: "The restaurant is open Monday-Thursday 11:00 AM - 12:00 AM, Friday 11:00 AM - 1:00 AM, Saturday 12:00 PM - …" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://olearys.com/en-no/boe/faq/", sitat: "You can easily book tables online via their website by going to \"Book now\" and selecting what you want to r…" },
    skjermer: { verdi: "sport på alle skjermer (antall ikke oppgitt)", tillit: 1, kilde: "https://olearys.com/en-no/sentralstasjon-oslo/sports/", sitat: "Oslo's most central sports bar can be found at Oslo S with sports on all screens and a rich and tasty menu." },
  },

  "Queen's Pub & Piano Bar": {
    // TRE ULIKE TELEFONNUMRE I OMLØP: +47 900 62 095 (revieweuro.com, og samme nummer i to søkesammendrag), +4722177026 (Yelp-tittelen) og +47 21 65 90 80 (no.near-place.com-tittelen). Jeg har ført opp 900 62 095 fordi det er det eneste som gikk igjen i mer enn ett treff, men dette må bekreftes mot queens
    telefon: { verdi: "+47 900 62 095", tillit: 1, kilde: "https://no.revieweuro.com/oslo/queens-pub-61684", sitat: "Queens pub, Brugata 14, Oslo, Phone +47 90 06 20 95" },
    nettside: { verdi: "https://www.queenspuboslo.no/", tillit: 2, kilde: "https://www.queenspuboslo.no/", sitat: "Queen's Pub & Piano Bar - Oslo" },
    adresse: { verdi: "Brugata 14, 0186 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/queens-pub-og-pianobar-oslo", sitat: "QUEENS PUB OG PIANOBAR - Updated July 2026 - 14 Photos & 11 Reviews - Brugata 14, Oslo, Norway - +472217702…" },
    apningstider: { verdi: "hver dag 15–03", tillit: 1, kilde: "https://www.queenspuboslo.no/", sitat: "The pub is open daily from 3:00 PM to 3:00 AM, and offers free entry." },
    skjermer: { verdi: "sport vises alltid på skjerm; Premier League og Champions League (antall ikke oppgitt)", tillit: 1, kilde: "https://www.queenspuboslo.no/", sitat: "Sport is always shown on screens, where you can watch both Premier League and Champions League." },
  },

  "Pokalen Vulkan": {
    // SVAR PÅ SPØRSMÅLET OM DE TO POKALEN-STEDENE: de deler nettsted (pokalenpub.no) med hver sin underside — /vulkan/ og /barcode/ — og har hver sin bookingside (/vulkan/booking-vulkan/ og /barcode/booking-barcode/). De har IKKE samme telefon: jeg fant et nummer for Vulkan og ingen for Barcode. E-postene
    telefon: { verdi: "+47 930 40 681", tillit: 1, kilde: "https://directmap.today/en/oslo/7013", sitat: "Telefon: +47 930 40 681" },
    epost: { verdi: "barsjef@pokalenvulkan.no", tillit: 1, kilde: "https://pokalenpub.no/vulkan/booking-vulkan/", sitat: "Email: barsjef@pokalenvulkan.no" },
    nettside: { verdi: "https://pokalenpub.no/", tillit: 2, kilde: "https://pokalenpub.no/", sitat: "Vulkan - Pokalen Pub" },
    adresse: { verdi: "Vulkan 26, Oslo", tillit: 2, kilde: "https://2pos.today/844/15026", sitat: "Pokalen, Vulkan 26, 0175 Oslo, Norge" },
    bordbestilling: { verdi: false, tillit: 1, kilde: "https://pokalenpub.no/vulkan/booking-vulkan/", sitat: "Table reservations are taken at Pokalen Barcode, but at Vulkan it's a drop-in service" },
  },

  "O'Reilly's Irish Pub": {
    // Den best dokumenterte puben i dette settet. Telefonnummeret står ordrett i titlene til to uavhengige aggregatorer (revieweuro.com og textmap.today). «45 TVs» kom både fra et søk begrenset til oreillys.no og fra et bredt søk. Adressen stemmer med vår. MAT ER UAVKLART: én kilde sier både «The pub allo
    telefon: { verdi: "+47 22 37 20 81", tillit: 2, kilde: "https://no.revieweuro.com/oslo/oreillys-irish-pub-104691", sitat: "O'Reillys Irish pub, Markveien 35B, Oslo, Phone +47 22 37 20 81" },
    nettside: { verdi: "https://www.oreillys.no/", tillit: 2, kilde: "https://www.oreillys.no/", sitat: "O'Reilly's Drinking Heaven – Sports bar in Oslo" },
    adresse: { verdi: "Markveien 35B, 0554 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/o-reillys-oslo-2", sitat: "O’REILLYS - Updated August 2026 - 10 Photos & 19 Reviews - Markveien 35B, Oslo, Norway - Sports Bars - Phon…" },
    apningstider: { verdi: "man 17–24, tir–tor 17–01, fre 15–01, lør 13–01, søn 13–24", tillit: 1, kilde: "https://directmap.today/oslo/1973", sitat: "Monday: 17:00 — 00:00, Tuesday: 17:00 — 01:00, Wednesday: 17:00 — 01:00, Thursday: 17:00 — 01:00, Friday: 1…" },
    skjermer: { verdi: "45 TV-er", tillit: 2, kilde: "https://www.oreillys.no/", sitat: "O'Reilly's is a sports bar located on Grünerløkka in Oslo, featuring a warm atmosphere with 45 TVs showing …" },
  },

  "O'Connor's Irish Pub": {
    // ADRESSEAVVIK: kildene sier Korsgata 31A, vi har Korsgata 31. Trolig samme sted, men A-en bør med. E-POSTEN ER IKKE PUBENS EGEN: resthon.salg@thon.no er salgsadressen til Thon/Resthon, som driver stedet (O'Connor's Oslo ligger også under resthon.no). Den duger til lokalbooking, ikke som allmenn konta
    epost: { verdi: "resthon.salg@thon.no", tillit: 1, kilde: "https://oconnors.no/oslo/kontakt-oss/", sitat: "E-post: resthon.salg@thon.no" },
    nettside: { verdi: "https://oconnors.no/oslo/", tillit: 2, kilde: "https://oconnors.no/oslo/", sitat: "O'Connor's Irish Pub Oslo" },
    adresse: { verdi: "Korsgata 31A, 0552 Oslo", tillit: 2, kilde: "https://www.google.com/maps/place/O'Connor's+Irish+Pub+-+Oslo/", sitat: "O'Connor's Irish Pub - Oslo · Korsgata 31A, 0552 Oslo, Norway" },
    mat: { verdi: "enkel mat", tillit: 1, kilde: "https://oconnors.no/oslo/", sitat: "They serve Irish beer and whiskey, classic pub dishes like cottage pie and libapizza, and offer sports on b…" },
    apningstider: { verdi: "man–ons 16–24, tor 16–01, fre 16–03, lør 13–03, søn 15–22", tillit: 1, kilde: "https://oconnors.no/oslo/", sitat: "Monday - Wednesday: 4 PM - midnight, Thursday: 4 PM - 1 AM, Friday: 4 PM - 3 AM, Saturday: 1 PM - 3 AM, Sun…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://oconnors.no/oslo/kontakt-oss/", sitat: "Du kan kontakte dem om du har generelle spørsmål eller for å reservere bord eller lokale." },
    skjermer: { verdi: "sport på storskjerm (antall ikke oppgitt)", tillit: 1, kilde: "https://oconnors.no/oslo/hva-skjer/", sitat: "Hva skjer på O'Connors Oslo? Quiz, livemusikk og sport på storskjerm" },
  },

  "Sport 33": {
    // SVAR PÅ SPØRSMÅLET OM STEDET FINNES: ja, adressen er i drift, men NAVNET ER I ENDRING. Både Google Maps og Apple Maps fører stedet på Thorvald Meyers gate 33D som «Cafe 33 - Sportsbar», og det finnes en egen Facebook-side «Cafe 33 - Sportsbar», samtidig som «Sport 33»-sida (facebook.com/sportspub33)
    telefon: { verdi: "+47 400 94 799", tillit: 1, kilde: "https://textmap.today/en/1266/5832", sitat: "Sport 33, +47 400 94 799, Oslo — TextMap" },
    epost: { verdi: "sportsbar33.oslo@gmail.com", tillit: 1, kilde: "https://maps.apple.com/place?place-id=IFE58C97FF1B5298B", sitat: "Email: sportsbar33.oslo@gmail.com" },
    adresse: { verdi: "Thorvald Meyers gate 33D, 0555 Oslo", tillit: 2, kilde: "https://2pos.today/844/3888", sitat: "Sport 33, Thorvald Meyers gate 33D, 0555 Oslo, Norge" },
    apningstider: { verdi: "man–tor 16–03.30, fre–søn 12.30–03.30", tillit: 1, kilde: "https://directmap.today/oslo/1944", sitat: "Monday-Thursday: 16:00 — 03:30, Friday-Sunday: 12:30 — 03:30" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://directmap.today/oslo/1944", sitat: "The business accepts credit cards and takes reservations." },
    skjermer: { verdi: "mange skjermer (antall ikke oppgitt)", tillit: 1, kilde: "https://maps.apple.com/place?place-id=IFE58C97FF1B5298B", sitat: "The venue offers dine-in and outdoor seating, and has plenty of screens." },
  },

  "Pokalen Barcode": {
    // ADRESSEAVVIK: to uavhengige kilder sier Dronning Eufemias gate 42, vi har 40. Dette bør sjekkes — i Barcode er nabobygg lett å forveksle. Deler nettsted med Pokalen Vulkan (pokalenpub.no) men har egen underside og egen bookingside; se merknaden for Pokalen Vulkan. INGEN TELEFON FUNNET for denne avde
    epost: { verdi: "daniel@pokalenpub.no", tillit: 1, kilde: "https://pokalenpub.no/barcode/booking-barcode/", sitat: "Email for arrangements: daniel@pokalenpub.no" },
    nettside: { verdi: "https://pokalenpub.no/barcode/", tillit: 2, kilde: "https://pokalenpub.no/barcode/booking-barcode/", sitat: "Booking-Barcode - Pokalen Pub" },
    adresse: { verdi: "Dronning Eufemias gate 42, 0191 Oslo", tillit: 2, kilde: "https://www.sluurpy.com/en/oslo/restaurant/8941282/pokalen-barcode", sitat: "Address: Dronning Eufemias gate 42, Oslo 0191, Norway" },
    apningstider: { verdi: "man–ons 16–23, tor 15–23, fre 13–23, lør 14–22, søn stengt", tillit: 1, kilde: "https://mindtrip.ai/restaurant/oslo-norway/pokalen-barcode/re-7fHhYg5B", sitat: "Monday 16:00 - 23:00, Tuesday 16:00 - 23:00, Wednesday 16:00 - 23:00, Thursday 15:00 - 23:00, Friday 13:00 …" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://pokalenpub.no/barcode/booking-barcode/", sitat: "Table reservations are taken at Pokalen Barcode, but at Vulkan it's a drop-in service" },
  },

  "The Highbury Pub": {
    // Mat star som null med vilje: kildene motsier hverandre. En beskriver stedet som lett mat til drikken (light food and drink), mens restaurantguru/tripadvisor beskriver en meny med fish and chips og reinsdyrkjottboller - ikke nok til a velge mellom enkel mat og full meny. Telefonnummeret er likt hos t
    telefon: { verdi: "+47 22 46 17 71", tillit: 2, kilde: "https://no.revieweuro.com/oslo/the-highbury-pub-510191", sitat: "The Highbury Pub, Bogstadveien 50, Oslo, Phone +47 22 46 17 71" },
    epost: { verdi: "highbury@highbury.no", tillit: 1, kilde: "https://www.highbury.no/", sitat: "Email: Highbury@Highbury.no" },
    nettside: { verdi: "https://www.highbury.no/", tillit: 2, kilde: "https://www.highbury.no/", sitat: "Sportspub sentralt i Oslo | The Highbury Pub" },
    adresse: { verdi: "Bogstadveien 50, 0366 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/the-highbury-pub-oslo", sitat: "THE HIGHBURY PUB - Updated May 2026 - 16 Photos & 12 Reviews - Bogstadveien 50, Oslo, Norway - Pubs" },
    apningstider: { verdi: "man 15-24, tir-tor 15-01, fre-lor 13-02, son 14-24", tillit: 2, kilde: "https://alle-apningstider.com/0794699/The_Highbury_Pub", sitat: "Monday 3:00 PM - 12:00 AM, Tuesday-Thursday 3:00 PM - 1:00 AM, Friday-Saturday 1:00 PM - 2:00 AM, Sunday 2:…" },
    aldersgrense: { verdi: 20, tillit: 1, kilde: "https://www.1881.no/bar-og-pub/bar-og-pub-oslo/bar-og-pub-majorstua/the-highbury-pub_100070032S1/", sitat: "There is a 20-year age limit all day." },
    skjermer: { verdi: "viser fotball pa storskjerm (antall ikke oppgitt)", tillit: 1, kilde: "https://bestsportsbars.net/sports-bar/the-highbury-pub/", sitat: "you can watch football matches shown on large screens with others" },
  },

  "The Old Irish Pub Majorstuen": {
    // Telefonnummeret 94879636 star bade pa pubens egen kontaktside og i 180.nos oppforing (The Old Irish Pub Majorstua - 94879636), derfor to kilder. Nummeret er et mobilnummer, sa det er skrevet 3-2-3 (+47 948 79 636) og ikke i parvis landlinjeform. Adressen stemmer med var. Sidene kunne ikke apnes dire
    telefon: { verdi: "+47 948 79 636", tillit: 2, kilde: "https://oldirishpub.no/en/majorstuen/page/kontakt", sitat: "Phone: +4794879636" },
    epost: { verdi: "0364@oldirishpub.no", tillit: 1, kilde: "https://oldirishpub.no/en/majorstuen/page/kontakt", sitat: "Email: 0364@oldirishpub.no" },
    nettside: { verdi: "https://oldirishpub.no/en/majorstuen/page/forside", tillit: 1, kilde: "https://oldirishpub.no/en/majorstuen/page/forside", sitat: "Velkommen til The Old Irish Pub - Majorstuen" },
    adresse: { verdi: "Kirkeveien 64A, 0364 Oslo", tillit: 2, kilde: "https://oldirishpub.no/en/majorstuen/page/kontakt", sitat: "Address: Kirkeveien 64a, 0364 Majorstuen, Oslo" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://evendo.com/locations/norway/oslo/majorstuen/bar/the-old-irish-pub-majorstuen", sitat: "offering everything from classic Irish dishes like shepherd's pie and fish and chips to an array of local N…" },
    apningstider: { verdi: "man-tor 16-03.30, fre-lor 12-03.30, son 12-01.30", tillit: 1, kilde: "https://oldirishpub.no/en/majorstuen/page/aapnings-tider", sitat: "Monday 4 pm-3:30 am, Tuesday 4 pm-3:30 am, Wednesday 4 pm-3:30 am, Thursday 4 pm-3:30 am, Friday 12 pm-3:30…" },
    skjermer: { verdi: "store skjermer, antall ikke oppgitt; viser mest fotball, av og til hockey og tennis", tillit: 1, kilde: "https://oldirishpub.no/en/page/sportsbar-majorstuen", sitat: "They mostly show football, but sometimes also hockey and tennis on the massive screens with a perfect view." },
  },

  "Store Stå Pub": {
    // Adressen: var oppforing sier Ved Bislett stadion, den ekte gateadressen er Thereses gate 51, 0354 Oslo - bekreftet av bade 1881 og gulesider, og visitoslo skriver at puben ligger rett over gata for Bislett stadion. Motstridende telefonnummer: gulesider/1881 gir 478 69 134, mens en annen 180.no-oppfo
    telefon: { verdi: "+47 478 69 134", tillit: 1, kilde: "https://www.gulesider.no/store+st%C3%A5+pub+a%252fs+oslo/84403353/bedrift", sitat: "Telefon: 47 86 91 34" },
    adresse: { verdi: "Thereses gate 51, 0354 Oslo", tillit: 2, kilde: "https://www.1881.no/bar-og-pub/bar-og-pub-oslo/bar-og-pub-majorstua/store-staa-pub-as_100627844S10/", sitat: "Store Stå Pub AS er lokalisert i Thereses gate 51, 0354 Oslo" },
    mat: { verdi: "enkel mat", tillit: 1, kilde: "https://www.facebook.com/storestapub/", sitat: "sports on 8 large screens (2 on the outdoor seating area) and serves Italian pizza" },
    apningstider: { verdi: "son-tor 12-24/01, fre-lor 12-02 (kilden er upresis pa stengetid son-tor)", tillit: 1, kilde: "https://www.visitoslo.com/eat/store-st-pub", sitat: "Sunday through Thursday the pub is open from 12:00 PM to 12:00-1:00 AM, Friday and Saturday from 12:00 PM t…" },
    skjermer: { verdi: "seks storskjermer inne og ute", tillit: 1, kilde: "https://www.visitoslo.com/eat/store-st-pub", sitat: "The pub shows football and other sports on six big screens, both inside and outside" },
  },

  "Kickoff Sportsbar": {
    // Tynn pub. Alt jeg fant star pa Yelp-oppforingen (yelp.no, ikke yelp.com, som er blokkert her) - ingen egen nettside, bare Facebook-siden facebook.com/Kjellandsportsbar. Adressen avviker litt fra var: kilden skriver 65 c, vi har 65. To sok fant ingen apningstider i det hele tatt, sa feltet star tomt 
    telefon: { verdi: "+47 975 11 394", tillit: 1, kilde: "https://www.yelp.no/biz/kickoff-sportsbar-oslo", sitat: "Phone: +47 975 11 394" },
    epost: { verdi: "kjellandkickoff@yahoo.com", tillit: 1, kilde: "https://www.yelp.no/biz/kickoff-sportsbar-oslo", sitat: "Email: kjellandkickoff@yahoo.com" },
    adresse: { verdi: "Waldemar Thranes gate 65 C, 0173 Oslo", tillit: 1, kilde: "https://www.yelp.no/biz/kickoff-sportsbar-oslo", sitat: "Address: Waldemar Thranesgate 65 c, Oslo, Norway" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://www.yelp.no/biz/kickoff-sportsbar-oslo", sitat: "The venue offers reservation possibilities, outdoor seating, and has a DJ." },
  },

  "Carls": {
    // Telefonnummeret er det svakeste funnet her: det dukket opp i ett sokeresultat (Apple Maps/wheree-oppforingen) og ble ikke bekreftet av 1881, gulesider eller carls.no. Bekreft for det vises. Pass pa forveksling: 1881 har en annen oppforing, Berner FC Carls pa Madserud alle 34 med nummer 40 17 34 11 -
    telefon: { verdi: "+47 22 71 93 60", tillit: 1, kilde: "https://carls.wheree.com/", sitat: "Phone: +47 22 71 93 60" },
    nettside: { verdi: "https://www.carls.no/", tillit: 2, kilde: "https://www.carls.no/", sitat: "Carls - Storstua på Carl Berners plass" },
    adresse: { verdi: "Trondheimsveien 113, 0565 Oslo", tillit: 2, kilde: "https://www.tripadvisor.com/Restaurant_Review-g190479-d27648779-Reviews-Carls-Oslo_Eastern_Norway.html", sitat: "Trondheimsveien 113, Oslo 0565 Norway" },
    mat: { verdi: "full meny", tillit: 2, kilde: "https://www.carls.no/faq", sitat: "The restaurant operates Monday 16:00-21:00 (pizza only), Tuesday-Wednesday 16:00-21:00, Thursday-Friday 16:…" },
    apningstider: { verdi: "kafe/bar: man-tir 09-22, ons-tor 09-23, fre 09-01, lor 12-01, son 12-20. Restaurant: man-ons 16-21, tor-fre 16-22, lor 12-22, son 12-20. Vinbar: tir-tor 16-23, fre-lor 16-01, stengt son-man", tillit: 1, kilde: "https://www.carls.no/faq", sitat: "The café/bar operates Monday-Tuesday 09:00-22:00, Wednesday-Thursday 09:00-23:00, Friday 09:00-01:00, Satur…" },
    bordbestilling: { verdi: true, tillit: 1, kilde: "https://www.carls.no/faq", sitat: "You can book tables in the restaurant or wine bar, and for football matches you can book tables for selecte…" },
    skjermer: { verdi: "fotball pa storskjerm", tillit: 2, kilde: "https://vink.aftenposten.no/artikkel/GM4jAB/carls-pa-carl-berner-har-fotball-pa-storskjerm-og-elendig-mat", sitat: "Carls på Carl Berner har fotball på storskjerm og elendig mat" },
  },

  "Lincoln Pub": {
    // Telefon star tomt med vilje: tre kilder gir tre ulike nummer for samme adresse - 908 08 458 (foursquare-treffet), 21 38 89 69 (nicelocal) og 22 37 71 00 (yellowpages, oppfort som Lincoln Gastro Pub). Ingen av dem lot seg bekrefte av en andre kilde, og a velge ett ville vaert a gjette. Merk ogsa at s
    nettside: { verdi: "https://www.lincolnpub.no/", tillit: 1, kilde: "https://www.lincolnpub.no/", sitat: "Velkommen til Lincoln Pub" },
    adresse: { verdi: "Vogts gate 43, 0474 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/lincoln-gastro-pub-oslo-2", sitat: "LINCOLN GASTRO PUB - Vogts Gate 43, Oslo, Norway" },
    mat: { verdi: "full meny", tillit: 2, kilde: "https://www.pilsposten.com/en/oslo/Lincoln%20sportsbar", sitat: "They serve Indian and Pakistani food made from scratch" },
    apningstider: { verdi: "man-tor 15-01, fre-son 12-01", tillit: 2, kilde: "https://nicelocal.no/oslo/restaurants/lincoln_sports_bar/", sitat: "Monday-Thursday: 15:00-01:00, Friday-Saturday: 12:00-01:00, Sunday: 12:00-01:00" },
    skjermer: { verdi: "storskjermer for sport, blant annet Premier League og Champions League", tillit: 1, kilde: "https://www.pilsposten.com/en/oslo/Lincoln%20sportsbar", sitat: "large screens for sports (football from Premier League/Champions League), quizzes on Mondays" },
  },

  "Vålerenga Vertshus": {
    // Adressen stemmer med var (kildene skriver Hedmarksgata 1 A med mellomrom). Stedet har en egen nettside, vvertshus.no, som var oppforing ikke har - den bor erstatte visitoslo-lenken. Telefonnummeret sto i en form uten mellomrom (2268 2342) og er skrevet om til norsk parvis form; bare en kilde ga det.
    telefon: { verdi: "+47 22 68 23 42", tillit: 1, kilde: "https://www.1881.no/bar-og-pub/bar-og-pub-oslo/bar-og-pub-vaalerenga/vaalerenga-vertshus_106538235S1/", sitat: "+47 2268 2342" },
    nettside: { verdi: "https://vvertshus.no/", tillit: 1, kilde: "https://vvertshus.no/", sitat: "Vålerenga Vertshus" },
    adresse: { verdi: "Hedmarksgata 1A, 0658 Oslo", tillit: 2, kilde: "https://www.1881.no/bar-og-pub/bar-og-pub-oslo/bar-og-pub-vaalerenga/vaalerenga-vertshus_106538235S1/", sitat: "Vålerenga Vertshus is located at Hedmarksgata 1 A, 0658 Oslo" },
    mat: { verdi: "enkel mat", tillit: 1, kilde: "https://www.visitoslo.com/en/product/?tlp=3166693&name=Valerenga-Vertshus", sitat: "Vålerenga Vertshus serves pizza, and the bar serves a wide selection of beers, wines, and cocktails" },
    apningstider: { verdi: "man-fre 15-01, lor 12-01, son 12-22", tillit: 1, kilde: "https://www.visitoslo.com/en/product/?tlp=3166693&name=Valerenga-Vertshus", sitat: "Monday-Friday 15:00-01:00, Saturday 12:00-01:00, and Sunday 12:00-22:00" },
    skjermer: { verdi: "fire skjermer", tillit: 1, kilde: "https://www.visitoslo.com/en/product/?tlp=3166693&name=Valerenga-Vertshus", sitat: "They show football, ice hockey, and other sports on their four screens." },
  },

  "Lekter'n": {
    // Sesongapen sommerbar, bekreftet: Lektern er Oslos storste maritime uterestaurant og er apen kun om sommeren. Apningstidene over gjelder sesongen og varierer med vaeret - kilden sier de holder apent sa lenge sola skinner. Fant ingen kilde som oppgir nar sesongen apner og stenger, sa det star ikke her
    telefon: { verdi: "+47 21 52 32 31", tillit: 1, kilde: "https://www.1881.no/restaurant/restaurant-oslo/restaurant-aker-brygge/lektern_100140896S1/", sitat: "Telefon: 21 52 32 31" },
    nettside: { verdi: "https://www.lektern.no/", tillit: 2, kilde: "https://www.lektern.no/", sitat: "Nettsted: www.lektern.no" },
    adresse: { verdi: "Stranden 3, 0250 Oslo", tillit: 2, kilde: "https://www.yelp.com/biz/lektern-oslo", sitat: "LEKTER'N - Stranden 3, Oslo, Norway - Seafood" },
    mat: { verdi: "full meny", tillit: 1, kilde: "https://www.visitoslo.com/eat/lekter-n", sitat: "Lektern er Oslos største maritime uterestaurant" },
    apningstider: { verdi: "man-lor 11-24, son 12-24; varierer med vaeret og de holder som regel apent sa lenge sola skinner", tillit: 1, kilde: "https://www.visitoslo.com/eat/lekter-n", sitat: "Mandag-lørdag: 11:00 - 00:00, Søndag: 12:00 - 00:00. Det er viktig å merke seg at åpningstidene varierer av…" },
    bordbestilling: { verdi: false, tillit: 1, kilde: "https://www.visitoslo.com/eat/lekter-n", sitat: "De tar kun drop-ins, ingen reservasjoner." },
    skjermer: { verdi: "storskjerm ved store fotballarrangement (VM 2026)", tillit: 2, kilde: "https://www.akerbrygge.no/arrangement/vm_lektern", sitat: "VM på Lekter'n - Fotball-VM på storskjerm ved Aker Brygge" },
  },
};
