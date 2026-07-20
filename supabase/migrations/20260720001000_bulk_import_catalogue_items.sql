-- Atomic DM-only bulk import for item catalogue rows.
-- The browser prepares insert/update actions after preview and validation.

create or replace function public.bulk_import_catalogue_items(p_rows jsonb)
returns setof public.catalogue_entries
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor uuid := auth.uid();
  entry jsonb;
  action_name text;
  item_data jsonb;
  target_id uuid;
  next_sort_order integer;
  changed public.catalogue_entries%rowtype;
begin
  if actor is null or not public.is_dm() then
    raise exception 'DM access required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Bulk item payload must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'No item rows were supplied';
  end if;

  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'A maximum of 1000 item rows may be imported at once';
  end if;

  select coalesce(max(sort_order), -1) + 1
  into next_sort_order
  from public.catalogue_entries
  where category = 'items';

  for entry in select value from jsonb_array_elements(p_rows)
  loop
    action_name := entry ->> 'action';
    item_data := entry -> 'data';

    if jsonb_typeof(item_data) <> 'object' then
      raise exception 'Every imported row must include item data';
    end if;

    if length(btrim(coalesce(item_data ->> 'name', ''))) = 0 then
      raise exception 'Every imported item requires a name';
    end if;

    if action_name = 'update' then
      begin
        target_id := (entry ->> 'id')::uuid;
      exception when others then
        raise exception 'An imported update row has an invalid item id';
      end;

      update public.catalogue_entries
      set data = item_data,
          updated_by = actor
      where id = target_id
        and category = 'items'
      returning * into changed;

      if not found then
        raise exception 'An item selected for update no longer exists';
      end if;

      return next changed;
    elsif action_name = 'insert' then
      insert into public.catalogue_entries (
        category,
        stable_key,
        sort_order,
        data,
        created_by,
        updated_by
      ) values (
        'items',
        'items:' || extensions.gen_random_uuid()::text,
        next_sort_order,
        item_data,
        actor,
        actor
      )
      returning * into changed;

      next_sort_order := next_sort_order + 1;
      return next changed;
    else
      raise exception 'Unsupported bulk item action: %', coalesce(action_name, '(missing)');
    end if;
  end loop;
end;
$$;

revoke all on function public.bulk_import_catalogue_items(jsonb) from public;
grant execute on function public.bulk_import_catalogue_items(jsonb) to authenticated;
