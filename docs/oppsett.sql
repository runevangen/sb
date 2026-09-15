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
