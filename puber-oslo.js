// Puber i Oslo der man kan regne med a fa se fotball.
//
// OpenStreetMap vet at et sted er en pub, men ikke om de viser fotball.
// Det er den vurderingen ingen maskin gir oss, og derfor denne fila.
// Den ligger i koden og virker uten nettverk — verdt mye her, der
// Overpass har vaert det skjoreste leddet.
//
// SLIK VEDLIKEHOLDES DEN
// - kilde: en lenke som faktisk sier at stedet viser fotball. Uten
//   kilde, ingen rad.
// - sikkerhet: "bekreftet" (stedets egen side, eller to uavhengige
//   kilder), "sannsynlig" (en kilde), "usikker" (omtalt, men tynt).
//   Visningen bruker bare de to forste.
// - sjekket: datoen noen sist sa etter. En udatert rad er verre enn
//   ingen rad — Oslos uteliv flytter seg fort. Scotsman flyttet i 2024.
// - lat/lon: ANSLAG fra gateadressen, ikke oppmalt. Godt nok til a
//   sortere etter avstand, ikke godt nok til a navigere etter. Stemmer
//   navnet med et treff fra OpenStreetMap, brukes OSMs koordinat.
//
// Kildene er samlet 11. september 2026 fra stedenes egne sider,
// VisitOslo, supporterklubbene og lokalpressen. Adressene bor klikkes
// gjennom for de regnes som sikre; se merknad der de er omstridte.

export const PUBER_OSLO = [
  /* ---------- sentrum ---------- */
  { navn: "Bohemen Sportspub", bydel: "Sentrum", adresse: "Arbeidergata 2",
    lat: 59.9138, lon: 10.7358, type: "supporterpub", lag: ["Vålerenga", "Tottenham"],
    kilde: "https://www.bohemen.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Scotsman", bydel: "Sentrum", adresse: "Karl Johans gate 35",
    lat: 59.9133, lon: 10.7412, type: "supporterpub", lag: ["Manchester United", "Bodø/Glimt"],
    kilde: "https://scotsman.no/red-army-oslo/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Flyttet fra nr. 17 i 2024; eldre oppslagsverk har feil adresse." },
  { navn: "Dr. Jekyll's Pub", bydel: "Sentrum", adresse: "Klingenberggata 4",
    lat: 59.9128, lon: 10.7330, type: "supporterpub", lag: ["Leeds United"],
    kilde: "https://jekylls.no/sport-pa-storskjerm/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Egen sportsbar i kjelleren." },
  { navn: "The Dubliner Folk Pub", bydel: "Sentrum", adresse: "Rådhusgata 28",
    lat: 59.9095, lon: 10.7405, type: "pub", lag: [],
    kilde: "https://www.visitoslo.com/eat/the-dubliner-folk-pub", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "O'Learys Vika", bydel: "Sentrum", adresse: "Olav Vs gate 1",
    lat: 59.9135, lon: 10.7290, type: "sportsbar", lag: [],
    kilde: "https://olearys.com/en-no/vika-oslo/sportz/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Proud Mary Pub", bydel: "Sentrum", adresse: "Nedre Vollgate 19",
    lat: 59.9122, lon: 10.7385, type: "pub", lag: [],
    kilde: "https://proudmarypub.no/oslo", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Storkamper; ikke nødvendigvis hver serierunde." },
  { navn: "Andy's Pub", bydel: "Sentrum", adresse: "Stortingsgata 8",
    lat: 59.9135, lon: 10.7340, type: "sportsbar", lag: [],
    kilde: "https://www.andyspub.no/", sikkerhet: "sannsynlig", sjekket: "2026-09-11",
    merknad: "Tre ulike adresser i oppslagsverk. Denne er stedets egen." },
  { navn: "Trafalgar Sportsbar", bydel: "Sentrum", adresse: "Keysers gate 1",
    lat: 59.9180, lon: 10.7385, type: "sportsbar", lag: [],
    kilde: "https://www.tripadvisor.com/Restaurant_Review-g190479-d10276123-Reviews-Trafalgar_Sports_Bar-Oslo_Eastern_Norway.html",
    sikkerhet: "sannsynlig", sjekket: "2026-09-11" },

  /* ---------- Grønland og Oslo S ---------- */
  { navn: "The Toucan Public House", bydel: "Grønland", adresse: "Brugata 11",
    lat: 59.9137, lon: 10.7590, type: "sportsbar", lag: [],
    kilde: "https://toucanpub.no/sportskalender/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Egen sportskalender på nett." },
  { navn: "Grønland Boulebar & Spiseri", bydel: "Grønland", adresse: "Grønlandsleiret 27",
    lat: 59.9120, lon: 10.7640, type: "pub", lag: [],
    kilde: "https://gronlandboule.no/sportskalender/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Bernie's", bydel: "Grønland", adresse: "Schweigaards gate 50B",
    lat: 59.9095, lon: 10.7690, type: "sportsbar", lag: [],
    kilde: "https://bernies.no/live-sport/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "O'Learys Oslo Sentralstasjon", bydel: "Sentrum", adresse: "Jernbanetorget 1",
    lat: 59.9110, lon: 10.7500, type: "sportsbar", lag: ["Brann"],
    kilde: "https://olearys.com/en-no/sentralstasjon-oslo/sports/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Samlingssted for Brann Bataljon Øst." },
  { navn: "Queen's Pub & Piano Bar", bydel: "Grønland", adresse: "Brugata 14",
    lat: 59.9138, lon: 10.7595, type: "pub", lag: [],
    kilde: "https://www.queenspuboslo.no/", sikkerhet: "sannsynlig", sjekket: "2026-09-11" },

  /* ---------- Grünerløkka ---------- */
  { navn: "Pokalen Vulkan", bydel: "Grünerløkka", adresse: "Vulkan 26",
    lat: 59.9225, lon: 10.7510, type: "sportsbar", lag: [],
    kilde: "https://pokalenpub.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Uteskjerm om sommeren." },
  { navn: "O'Reilly's Irish Pub", bydel: "Grünerløkka", adresse: "Markveien 35B",
    lat: 59.9205, lon: 10.7570, type: "sportsbar", lag: [],
    kilde: "https://www.oreillys.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "O'Connor's Irish Pub", bydel: "Grünerløkka", adresse: "Korsgata 31",
    lat: 59.9235, lon: 10.7555, type: "sportsbar", lag: [],
    kilde: "https://oconnors.no/oslo/sportskalender/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "Sport 33", bydel: "Grünerløkka", adresse: "Thorvald Meyers gate 33D",
    lat: 59.9205, lon: 10.7585, type: "sportsbar", lag: [],
    kilde: "https://www.instagram.com/sport33oslo/", sikkerhet: "sannsynlig", sjekket: "2026-09-11" },

  /* ---------- Bjørvika ---------- */
  { navn: "Pokalen Barcode", bydel: "Bjørvika", adresse: "Dronning Eufemias gate 40",
    lat: 59.9080, lon: 10.7590, type: "sportsbar", lag: [],
    kilde: "https://www.facebook.com/PokalenBarcode/", sikkerhet: "sannsynlig", sjekket: "2026-09-11" },

  /* ---------- Majorstuen og Frogner ---------- */
  { navn: "The Highbury Pub", bydel: "Majorstuen", adresse: "Bogstadveien 50",
    lat: 59.9285, lon: 10.7165, type: "supporterpub", lag: ["Arsenal", "Barcelona"],
    kilde: "https://www.highbury.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },
  { navn: "The Old Irish Pub Majorstuen", bydel: "Majorstuen", adresse: "Kirkeveien 64A",
    lat: 59.9290, lon: 10.7145, type: "pub", lag: [],
    kilde: "https://oldirishpub.no/nb/page/sportsbar-majorstuen", sikkerhet: "bekreftet", sjekket: "2026-09-11" },

  /* ---------- St. Hanshaugen og Bislett ---------- */
  { navn: "Store Stå Pub", bydel: "Bislett", adresse: "Ved Bislett stadion",
    lat: 59.9245, lon: 10.7330, type: "sportsbar", lag: [],
    kilde: "https://vmkart.no/sted/347-store-staa-pub/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Gateadresse ikke funnet; koordinatet er Bislett." },
  { navn: "Kickoff Sportsbar", bydel: "St. Hanshaugen", adresse: "Waldemar Thranes gate 65",
    lat: 59.9260, lon: 10.7510, type: "sportsbar", lag: [],
    kilde: "https://www.yelp.no/biz/kickoff-sportsbar-oslo", sikkerhet: "sannsynlig", sjekket: "2026-09-11",
    merknad: "Facebook-siden heter «Kjellandsportsbar». Kan ha flyttet." },

  /* ---------- Torshov og Carl Berner ---------- */
  { navn: "Carls", bydel: "Carl Berner", adresse: "Trondheimsveien 113",
    lat: 59.9270, lon: 10.7780, type: "sportsbar", lag: ["Brann", "Liverpool"],
    kilde: "https://www.carls.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Omtalt som Norges største fotballpub." },
  { navn: "Lincoln Pub", bydel: "Torshov", adresse: "Vogts gate 43",
    lat: 59.9330, lon: 10.7680, type: "sportsbar", lag: [],
    kilde: "https://www.lincolnpub.no/", sikkerhet: "bekreftet", sjekket: "2026-09-11" },

  /* ---------- Vålerenga ---------- */
  { navn: "Vålerenga Vertshus", bydel: "Vålerenga", adresse: "Hedmarksgata 1A",
    lat: 59.9085, lon: 10.7860, type: "supporterpub", lag: ["Vålerenga"],
    kilde: "https://www.visitoslo.com/en/product/?tlp=3166693&name=Valerenga-Vertshus",
    sikkerhet: "bekreftet", sjekket: "2026-09-11",
    merknad: "Bussavganger til VIFs hjemmekamper." },

  /* ---------- Aker Brygge ---------- */
  { navn: "Lekter'n", bydel: "Aker Brygge", adresse: "Stranden 3",
    lat: 59.9095, lon: 10.7280, type: "pub", lag: [],
    kilde: "https://www.lektern.no/", sikkerhet: "sannsynlig", sjekket: "2026-09-11",
    merknad: "Sesongsted ute; storkamper framfor hver serierunde." },
];
