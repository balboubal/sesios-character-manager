-- Sesios Character Manager database schema
-- This project intentionally has one campaign and permanently deletes characters.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'player' check (role in ('player', 'dm')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default 'World of Sesios',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  state jsonb not null,
  created_by uuid not null references public.profiles (id),
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_owner_id_idx on public.characters (owner_id);
create index if not exists characters_updated_at_idx on public.characters (updated_at desc);

create table if not exists public.catalogue_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  category text not null check (
    category in (
      'traits',
      'conditions',
      'items',
      'food_dishes',
      'food_ingredients',
      'food_rules',
      'crafting_sections',
      'crafting_materials',
      'crafting_recipes'
    )
  ),
  stable_key text not null,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, stable_key)
);

create index if not exists catalogue_entries_category_sort_idx
  on public.catalogue_entries (category, sort_order, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists campaign_settings_set_updated_at on public.campaign_settings;
create trigger campaign_settings_set_updated_at
before update on public.campaign_settings
for each row execute function public.set_updated_at();

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

drop trigger if exists catalogue_entries_set_updated_at on public.catalogue_entries;
create trigger catalogue_entries_set_updated_at
before update on public.catalogue_entries
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@invalid.local'),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles if the first DM account was created before this migration ran.
insert into public.profiles (id, email, display_name, role)
select
  id,
  coalesce(email, id::text || '@invalid.local'),
  coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(email, ''), '@', 1)),
  'player'
from auth.users
on conflict (id) do nothing;

create or replace function public.is_dm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'dm'
  );
$$;

revoke all on function public.is_dm() from public;
grant execute on function public.is_dm() to authenticated;

alter table public.profiles enable row level security;
alter table public.campaign_settings enable row level security;
alter table public.characters enable row level security;
alter table public.catalogue_entries enable row level security;

drop policy if exists "profiles_select_self_or_dm" on public.profiles;
create policy "profiles_select_self_or_dm"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or public.is_dm());

drop policy if exists "profiles_update_dm" on public.profiles;
create policy "profiles_update_dm"
on public.profiles for update
to authenticated
using (public.is_dm())
with check (role in ('player', 'dm'));

drop policy if exists "campaign_select_authenticated" on public.campaign_settings;
create policy "campaign_select_authenticated"
on public.campaign_settings for select
to authenticated
using (true);

drop policy if exists "campaign_update_dm" on public.campaign_settings;
create policy "campaign_update_dm"
on public.campaign_settings for update
to authenticated
using (public.is_dm())
with check (id = 1);

drop policy if exists "characters_select_owner_or_dm" on public.characters;
create policy "characters_select_owner_or_dm"
on public.characters for select
to authenticated
using (owner_id = (select auth.uid()) or public.is_dm());

drop policy if exists "characters_insert_owner_or_dm" on public.characters;
create policy "characters_insert_owner_or_dm"
on public.characters for insert
to authenticated
with check (
  (owner_id = (select auth.uid()) or public.is_dm())
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

drop policy if exists "characters_update_owner_or_dm" on public.characters;
create policy "characters_update_owner_or_dm"
on public.characters for update
to authenticated
using (owner_id = (select auth.uid()) or public.is_dm())
with check (
  (owner_id = (select auth.uid()) or public.is_dm())
  and updated_by = (select auth.uid())
);

drop policy if exists "characters_delete_owner_or_dm" on public.characters;
create policy "characters_delete_owner_or_dm"
on public.characters for delete
to authenticated
using (owner_id = (select auth.uid()) or public.is_dm());

drop policy if exists "catalogues_select_authenticated" on public.catalogue_entries;
create policy "catalogues_select_authenticated"
on public.catalogue_entries for select
to authenticated
using (true);

drop policy if exists "catalogues_insert_dm" on public.catalogue_entries;
create policy "catalogues_insert_dm"
on public.catalogue_entries for insert
to authenticated
with check (
  public.is_dm()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

drop policy if exists "catalogues_update_dm" on public.catalogue_entries;
create policy "catalogues_update_dm"
on public.catalogue_entries for update
to authenticated
using (public.is_dm())
with check (public.is_dm() and updated_by = (select auth.uid()));

drop policy if exists "catalogues_delete_dm" on public.catalogue_entries;
create policy "catalogues_delete_dm"
on public.catalogue_entries for delete
to authenticated
using (public.is_dm());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.campaign_settings to authenticated;
grant update on public.campaign_settings to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.catalogue_entries to authenticated;

insert into public.campaign_settings (id, name, description)
values (1, 'World of Sesios', '')
on conflict (id) do nothing;

