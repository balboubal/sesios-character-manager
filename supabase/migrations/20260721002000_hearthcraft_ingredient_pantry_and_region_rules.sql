-- Hearthcraft ingredient pantry, region-based difficulty, progression locks,
-- fixed serving yields, and Legendary Masterchef metadata.
-- Character pantry, equipment ownership, and home region remain inside the
-- existing character-state JSON and require no new database columns.

begin;

update public.catalogue_entries as catalogue
set data = catalogue.data || jsonb_build_object(
  'rareDangerous', case
    when catalogue.data ->> 'name' in (
      'Hushback Silver-Reed Broth',
      'Telleth Bellbread ⚠',
      'Duskhide Marrow Tartine'
    ) then true
    else false
  end,
  'legendary', case
    when catalogue.data ->> 'name' = 'Iril Candle-Pear ✦' then true
    else false
  end,
  'difficulty', case
    when catalogue.data ->> 'name' = 'Iril Candle-Pear ✦'
      then 'Masterchef Dish · Legendary'
    when catalogue.data ->> 'name' in (
      'Hushback Silver-Reed Broth',
      'Telleth Bellbread ⚠',
      'Duskhide Marrow Tartine'
    ) then 'Rare or Dangerous'
    else 'Automatic by Region'
  end,
  'dc', case
    when catalogue.data ->> 'name' = 'Iril Candle-Pear ✦' then 85
    when catalogue.data ->> 'name' in (
      'Hushback Silver-Reed Broth',
      'Telleth Bellbread ⚠',
      'Duskhide Marrow Tartine'
    ) then 70
    else 0
  end,
  'preparationClass', case
    when catalogue.data ->> 'name' = 'Iril Candle-Pear ✦' then 'masterchef'
    when catalogue.data ->> 'name' in (
      'Hushback Silver-Reed Broth',
      'Telleth Bellbread ⚠',
      'Duskhide Marrow Tartine'
    ) then 'dangerous'
    else 'standard'
  end,
  'time', case
    when catalogue.data ->> 'name' = 'Iril Candle-Pear ✦' then '2-4 hours'
    when catalogue.data ->> 'name' in (
      'Hushback Silver-Reed Broth',
      'Telleth Bellbread ⚠',
      'Duskhide Marrow Tartine'
    ) then '2 hours'
    else coalesce(nullif(catalogue.data ->> 'time', ''), '1 hour')
  end
)
where catalogue.category = 'food_dishes';

with rule_metadata(sort_order, rule_name, rule_value) as (
  values
    (0, 'Home Region', 'Select Asura, Karrnath, Fittoa, Shirone, or Ronoa. Home-region dishes are Familiar (DC 35).'),
    (1, 'Regional & Foreign Dishes', 'Other Central Continent dishes are Regional (DC 50). Milis, Begaritt, Demon Continent, and Heaven Continent dishes are Rare or Dangerous (DC 70).'),
    (2, 'Progression Locks', 'Level 1 unlocks home dishes, Level 2 Central regional dishes, Level 3 foreign dishes, Level 4 explicitly dangerous dishes, and Level 5 Legendary Masterchef dishes.'),
    (3, 'Ingredient Requirement', 'A catalogue dish requires one unit of every listed ingredient. Use owned pantry ingredients or buy the full ingredient set for the listed SP cost.'),
    (4, 'Serving Yield', 'One ingredient set normally prepares 2 servings. Explicitly dangerous and Legendary dishes prepare 1 serving. A natural 96-100 creates +1 serving.'),
    (5, 'Cooking Kit', 'A complete Cooking Kit costs 20 GP and grants +25 to the Cooking Check.'),
    (6, 'Proficient Assistant', '+10; only one assistant may help.'),
    (7, 'Advantage & Disadvantage', 'Professional kitchen grants Advantage. Poor conditions or a missing required specialty utensil impose Disadvantage.'),
    (8, 'Cooking XP', '1 XP for a successful DC 35+ meal, plus 1 XP if new, dangerous, regional, foreign, or made under pressure. Maximum 2 XP per long rest.'),
    (9, 'Failed Cooking', 'Failure creates an edible ordinary meal with no Hearth Boon. Natural 1-5 spoils the ingredients.')
)
insert into public.catalogue_entries (category, stable_key, sort_order, data)
select
  'food_rules',
  'food_rules:' || rule_metadata.sort_order::text,
  rule_metadata.sort_order,
  jsonb_build_object('rule', rule_metadata.rule_name, 'value', rule_metadata.rule_value)
from rule_metadata
on conflict (category, stable_key) do update
set
  sort_order = excluded.sort_order,
  data = excluded.data,
  updated_at = timezone('utc', now());

commit;
