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
