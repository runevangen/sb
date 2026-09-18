-- Sportsbibelen — alt som må kjøres i Supabase, i rekkefølge.
--
-- Lim hele fila inn i Supabase → SQL Editor → Run. Den kan kjøres flere
-- ganger: alt er «if not exists» eller «or replace», så en ny kjøring
-- retter opp uten å ødelegge noe som finnes.
--
-- Forklaringen på hvorfor hver bit finnes står i nokler-og-tokens.md.
-- Denne fila er bare selve kjøringen.
--
-- To ting må også stilles i panelet, og SQL kan ikke gjøre dem:
--   1. Authentication → Sign In / Providers → Email: slå AV «Confirm email».
--      Adressen vi lager av fornavnet er en nøkkel, ikke en postkasse —
--      det kommer aldri noen e-post å bekrefte.
--   2. Netlify → Environment variables: PIN_PEPPER, SUPABASE_URL,
--      SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, ADMIN_PASSORD.
--      Så: Deploys → Trigger deploy. Funksjonene leser miljøet ved
--      utrulling, så en ny variabel gjør ingenting før det.


-- ---------------------------------------------------------------
-- 1. pin_kontoer — hvilke fornavn er tatt
-- ---------------------------------------------------------------
-- Innloggingen spør om navnet er ledig FØR PIN-en tastes, fordi en ny
-- PIN da må gjentas: vi har ingen e-post å sende en ny kode til.
-- Supabase Auth har ingen «finnes denne?»-vei utenfra, derfor denne.
-- `on delete cascade` gjør at lista ikke kan lyve om et navn som er
-- slettet.

create table if not exists pin_kontoer (
  slug   text primary key check (char_length(slug) between 2 and 24),
  bruker uuid not null default auth.uid()
         references auth.users (id) on delete cascade,
  laget  timestamptz not null default now()
);

alter table pin_kontoer enable row level security;

drop policy if exists "les for alle" on pin_kontoer;
create policy "les for alle" on pin_kontoer
  for select using (true);

drop policy if exists "før opp eget navn" on pin_kontoer;
create policy "før opp eget navn" on pin_kontoer
  for insert to authenticated with check (bruker = auth.uid());


-- ---------------------------------------------------------------
-- 2. kampsvar — hvem blir med på kampen
-- ---------------------------------------------------------------
-- Leses av alle (appen skal kunne leses uten konto), skrives bare i
-- ditt eget navn. `bruker` settes av databasen fra økten; funksjonen
-- sender den aldri selv.

create table if not exists kampsvar (
  id        uuid primary key default gen_random_uuid(),
  kamp_id   text not null,
  bruker    uuid not null default auth.uid()
            references auth.users (id) on delete cascade,
  navn      text not null check (char_length(navn) between 1 and 24),
  hvor      text check (hvor in ('hjemme', 'pub', 'stadion')),
  sted      text check (char_length(sted) <= 60),
  opprettet timestamptz not null default now(),
  unique (kamp_id, bruker)
);

alter table kampsvar enable row level security;

drop policy if exists "les for alle" on kampsvar;
create policy "les for alle" on kampsvar
  for select using (true);

drop policy if exists "skriv eget svar" on kampsvar;
create policy "skriv eget svar" on kampsvar
  for insert to authenticated with check (bruker = auth.uid());

drop policy if exists "endre eget svar" on kampsvar;
create policy "endre eget svar" on kampsvar
  for update to authenticated using (bruker = auth.uid())
  with check (bruker = auth.uid());

drop policy if exists "slett eget svar" on kampsvar;
create policy "slett eget svar" on kampsvar
  for delete to authenticated using (bruker = auth.uid());


-- ---------------------------------------------------------------
-- 3. slett_meg() — du sletter kontoen din selv
-- ---------------------------------------------------------------
-- Å slette en bruker krever normalt en service_role-nøkkel som kan
-- slette hvem som helst. Den finnes ikke i appen. I stedet ligger
-- sletteretten her, begrenset til den som ber om den: funksjonen tar
-- ikke imot noen id, så selv en feil i konto.mjs kan ikke slette en
-- annens konto. Radene i kampsvar og pin_kontoer følger med gjennom
-- on delete cascade.

create or replace function public.slett_meg()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.slett_meg() from public, anon;
grant execute on function public.slett_meg() to authenticated;


-- ---------------------------------------------------------------
-- 4. visninger — hvilke kamper pubene viser
-- ---------------------------------------------------------------
-- Lå i visninger.js i repoet til 15. september 2026. Hver lagring var en
-- commit, med historikk og mulighet til å rette for hånd — og det var
-- riktig så lenge det var få rader og én admin. To ting veltet det (#79):
-- GITHUB_TOKEN kan skrive kode, ikke bare data, og to samtidige
-- lagringer lot den ene tape stille.
--
-- Skrivingen går med **leserens egen økt**, som i kampsvar. ADMIN_PASSORD
-- er vårt eget passord, og Supabase vet ikke hva det er: databasen
-- trenger sin egen identitet for å slippe en skriving gjennom. Derfor
-- slår RLS opp uid-en i visning_skrivere.

-- Hvem som får skrive. Ingen skrivepolicy med vilje: raden føres inn her,
-- i SQL, av en som allerede har tilgang til basen — ikke fra appen. Det
-- er nettopp poenget, at lista ikke kan utvides av noen som bare er
-- logget inn.
create table if not exists visning_skrivere (
  bruker   uuid primary key references auth.users (id) on delete cascade,
  navn     text,
  lagt_til timestamptz not null default now()
);

alter table visning_skrivere enable row level security;

-- Du ser din egen rad, og bare den.
drop policy if exists "se min egen skriverett" on visning_skrivere;
create policy "se min egen skriverett" on visning_skrivere
  for select to authenticated using (bruker = auth.uid());

create table if not exists visninger (
  id      uuid primary key default gen_random_uuid(),
  pub     text not null check (char_length(pub) between 1 and 80),
  kamp_id text not null check (char_length(kamp_id) between 1 and 80),
  kamp    text check (char_length(kamp) <= 120),
  dato    timestamptz,
  satt    timestamptz not null default now(),
  -- Default, ikke bare en referanse: uten den sto satt_av null pa hver
  -- eneste rad, ogsa de som ble skrevet med en okt. Funksjonen sender
  -- den aldri selv — som `bruker` i kampsvar — sa det er databasen som
  -- ma sette den, eller sa blir den ikke satt.
  satt_av uuid default auth.uid() references auth.users (id) on delete set null,
  unique (pub, kamp_id)
);

alter table visninger enable row level security;

-- Lesing for alle: «denne kampen vises på Lincoln Pub» skal stå for den
-- som blar gjennom runden, uten konto.
drop policy if exists "les for alle" on visninger;
create policy "les for alle" on visninger
  for select using (true);

drop policy if exists "skriv som skriver" on visninger;
create policy "skriv som skriver" on visninger
  for insert to authenticated with check (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "endre som skriver" on visninger;
create policy "endre som skriver" on visninger
  for update to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "slett som skriver" on visninger;
create policy "slett som skriver" on visninger
  for delete to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

create index if not exists visninger_kamp_id_idx on visninger (kamp_id);

-- For baser som alt har tabellen fra 15. september 2026, da defaulten
-- manglet. Trygg a kjore om igjen.
alter table visninger alter column satt_av set default auth.uid();

-- Den første skriveren må føres inn for hånd. Bytt ut id-en med din egen
-- fra Authentication → Users, eller slå den opp på fornavnet:
--
--   insert into visning_skrivere (bruker, navn)
--   select id, raw_user_meta_data->>'navn' from auth.users
--   where email = 'rune@pin.mvp-sb.netlify.app'
--   on conflict (bruker) do nothing;


-- ---------------------------------------------------------------
-- 5. pub_forslag — steder lesere sender inn
-- ---------------------------------------------------------------
-- En kø, ikke lista. puber-oslo.js bærer en redaksjonell vurdering, og
-- hver rad har kilde og sjekket. En rad som kom inn uten at noen så på
-- den, bryter nettopp det sjekkPubliste() vokter — så et forslag havner
-- her, og blir en ekte rad først når en person har limt den inn (#80).

create table if not exists pub_forslag (
  id            uuid primary key default gen_random_uuid(),
  navn          text not null check (char_length(navn) between 2 and 80),
  adresse       text not null check (char_length(adresse) between 2 and 120),
  viser_fotball boolean not null default false,
  merknad       text check (char_length(merknad) <= 300),
  -- Settes av databasen fra økten, som satt_av i visninger. Funksjonen
  -- sender den aldri selv — og defaulten er halvparten av det.
  foreslatt_av  uuid default auth.uid() references auth.users (id) on delete set null,
  foreslatt     timestamptz not null default now(),
  status        text not null default 'ny'
                check (status in ('ny', 'lagt-inn', 'avvist')),
  behandlet     timestamptz,
  behandlet_av  uuid references auth.users (id) on delete set null
);

alter table pub_forslag enable row level security;

-- Send inn: den som er logget inn, i sitt eget navn.
drop policy if exists "send inn i eget navn" on pub_forslag;
create policy "send inn i eget navn" on pub_forslag
  for insert to authenticated with check (foreslatt_av = auth.uid());

-- Les: dine egne forslag, og alt for den som skal behandle dem. Et
-- forslag er ikke offentlig før noen har sett på det.
drop policy if exists "les egne og alle for skrivere" on pub_forslag;
create policy "les egne og alle for skrivere" on pub_forslag
  for select to authenticated using (
    foreslatt_av = auth.uid()
    or exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "behandle som skriver" on pub_forslag;
create policy "behandle som skriver" on pub_forslag
  for update to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "slett som skriver" on pub_forslag;
create policy "slett som skriver" on pub_forslag
  for delete to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

create index if not exists pub_forslag_status_idx on pub_forslag (status, foreslatt);


-- ---------------------------------------------------------------
-- 6. puber — rettelsene som ligger oppå puber-oslo.js
-- ---------------------------------------------------------------
-- **Fila er grunnfjellet.** puber-oslo.js ligger i koden, virker uten
-- nettverk, og er det leseren ser om Supabase er nede. Den skrives aldri
-- herfra. Denne tabellen bærer bare rettelsene oppå, og appen slår dem
-- sammen selv (ADR 0020).
--
-- Regelen fra ADR 0019 står: et forslag fra en leser er ikke en rad.
-- pub_forslag over er fortsatt køen, og ingen rad flytter seg derfra og
-- hit av seg selv. Det som endret seg er hvor admin limer — i portalen
-- framfor i en koderedigerer. Vurderingen er den samme, og den er et
-- menneskes.
--
-- Nøkkelen er navnet foldet, ikke navnet: «Andy's Pub» og «Andys Pub» er
-- ett sted. Samme grep som kampNokkel — det som slås opp går på nøkkelen,
-- aldri på det som ble skrevet inn.

create table if not exists puber (
  nokkel     text primary key check (char_length(nokkel) between 1 and 80),
  navn       text not null check (char_length(navn) between 2 and 80),
  bydel      text not null default '',
  adresse    text not null default '',
  lat        double precision,
  lon        double precision,
  type       text not null default 'pub'
             check (type in ('sportsbar', 'supporterpub', 'pub')),
  lag        text[] not null default '{}',
  -- Kilde og dato er ikke pynt. Oslos uteliv flytter seg fort, og en
  -- udatert rad er verre enn ingen rad. sjekkPubRad() i appen slipper
  -- ingen rad gjennom uten dem; sjekken her er den som holder når noen
  -- skriver rett mot basen.
  --
  -- Kilden er en lenke ELLER en setning. Den måtte være en URL til
  -- 16. september 2026, og det stengte ute den lille puben uten nettside.
  -- Feltet vises aldri for leseren — det svarer på «hvordan vet vi det»,
  -- og «Var innom 16.09.2026, storskjerm i baren» svarer på det.
  kilde      text not null default '',
  sikkerhet  text not null default 'bekreftet'
             check (sikkerhet in ('bekreftet', 'sannsynlig', 'usikker')),
  sjekket    date,
  merknad    text check (char_length(merknad) <= 300),
  -- Et sted som har lagt ned skal kunne forsvinne fra portalen. Raden i
  -- fila står, så det holder ikke å la være å skrive — den må skjules.
  fjernet    boolean not null default false,
  -- Baksteget. kildeHolder() i pub-data.js er den ekte regelen, og den
  -- kjøres av både portalen og tjenesten fra samme fil. Denne er litt
  -- løsere med vilje: '% % %' teller mellomrom, ikke ord. Et baksteg som
  -- er strengere enn appen, avviser rader appen nettopp godtok — og da
  -- får den som lagret en feilmelding som ikke stemmer.
  constraint puber_kilde_og_dato check (
    fjernet or (
      sjekket is not null and lat is not null and lon is not null
      and (kilde like 'http%'
           or (char_length(kilde) >= 12 and kilde like '% % %'))
    )
  ),
  endret     timestamptz not null default now(),
  -- Settes av databasen fra økten, som satt_av i visninger.
  endret_av  uuid default auth.uid() references auth.users (id) on delete set null
);

alter table puber enable row level security;

-- Les: alle, uten konto. Lista er det appen viser, og ingenting i appen
-- er låst bak innlogging.
drop policy if exists "les for alle" on puber;
create policy "les for alle" on puber
  for select to anon, authenticated using (true);

drop policy if exists "skriv som skriver" on puber;
create policy "skriv som skriver" on puber
  for insert to authenticated with check (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "endre som skriver" on puber;
create policy "endre som skriver" on puber
  for update to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

drop policy if exists "slett som skriver" on puber;
create policy "slett som skriver" on puber
  for delete to authenticated using (
    exists (select 1 from visning_skrivere s where s.bruker = auth.uid()));

-- En default gjelder bare ved insert. Upserten fra /api/pub-liste treffer
-- update-grenen hver gang en rad rettes, og da ville «endret» stått stille
-- på datoen raden ble laget, og «endret_av» pekt på den som la den inn
-- første gang. Det var nøyaktig feilen i satt_av: «funksjonen sender den
-- aldri selv» er bare halve regelen — den andre halvparten er at
-- databasen faktisk setter den, hver gang.
--
-- `set search_path = ''` og fullt kvalifiserte navn: uten det avgjor
-- kallerens egen search_path hvilken `now()` som kjores, og en funksjon
-- som utloses av hver eneste skriving er feil sted a la det sta apent.
-- Supabase' egen linter melder det som function_search_path_mutable.
create or replace function puber_endret() returns trigger
  language plpgsql security invoker
  set search_path = '' as $$
begin
  new.endret := pg_catalog.now();
  new.endret_av := auth.uid();
  return new;
end;
$$;

drop trigger if exists puber_endret_trigger on puber;
create trigger puber_endret_trigger before insert or update on puber
  for each row execute function puber_endret();


-- For baser som fikk tabellen 16. september 2026, da kilden måtte være en
-- URL. Trygg å kjøre om igjen.
alter table puber drop constraint if exists puber_check;
alter table puber drop constraint if exists puber_kilde_og_dato;
alter table puber add constraint puber_kilde_og_dato check (
  fjernet or (
    sjekket is not null and lat is not null and lon is not null
    and (kilde like 'http%'
         or (char_length(kilde) >= 12 and kilde like '% % %'))
  )
);


-- ---------------------------------------------------------------
-- 8. sist inne — når økta sist ble fornyet
-- ---------------------------------------------------------------
--
-- `last_sign_in_at` er sist noen TASTET PIN-en. Appen holder telefonen
-- innlogget med roterende fornyere, og en fornying rører ikke det feltet:
-- en som er innom hver dag kan stå med en dato uker tilbake. Meldt fra
-- portalen 16. og 17. september 2026, begge gangene av en som var
-- innlogget i det øyeblikket han leste «2 dager siden».
--
-- `auth.sessions.refreshed_at` er det som faktisk beveger seg. Vi fører
-- ingenting nytt: GoTrue skriver feltet fordi det MÅ for å holde folk
-- innlogget, og det er den samme grunnen `last_sign_in_at` finnes.
--
-- **`refreshed_at` er `timestamp without time zone`.** Verdien er UTC,
-- men bærer ikke zone. Uten `at time zone 'utc'` bruker Postgres tjenerens
-- egen sone når den støper om. Målt 17. september er den sonen UTC, så
-- castingen gir samme verdi i dag — den står der for å gjøre riktigheten
-- uavhengig av en innstilling ingen av oss eier.
--
-- `auth` nås ikke utenfra: PostgREST eksponerer bare `public`. Funksjonen
-- ligger derfor her, og bare service-nøkkelen slipper til — den samme ene
-- nøkkelen `brukere.mjs` alt har (ADR 0010). En innlogget bruker skal
-- ikke kunne spørre når naboen sist var inne.
create or replace function public.sist_inne()
returns table (bruker uuid, sist_aktiv timestamptz)
language sql
security definer
set search_path = ''
as $$
  select s.user_id,
         max(coalesce(s.refreshed_at at time zone 'utc', s.created_at))
  from auth.sessions s
  group by s.user_id;
$$;

revoke all on function public.sist_inne() from public, anon, authenticated;
grant execute on function public.sist_inne() to service_role;
