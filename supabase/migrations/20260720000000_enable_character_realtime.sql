-- Enable filtered Postgres Changes subscriptions for character updates.
-- Existing row-level security policies continue to control which rows each
-- authenticated user may receive through Supabase Realtime.

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'characters'
  ) then
    execute 'alter publication supabase_realtime add table public.characters';
  end if;
end;
$$;
