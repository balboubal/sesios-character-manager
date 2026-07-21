-- Add Cooking Check metadata used by the interactive Hearthcraft station.
-- This changes catalogue JSON only and is safe to run repeatedly.

with recipe_metadata(name, difficulty, dc, cooking_time, specialty_utensil, preparation_class) as (
  values
    ('Lysael Glassfin Parcels', 'Regional', 50, '1 hour', '', 'standard'),
    ('Vellhorn Cloud Curd', 'Regional', 50, '1 hour', '', 'standard'),
    ('Brumox Winter Pot', 'Regional', 50, '1 hour', '', 'standard'),
    ('Hrimchar Smoke-Cakes', 'Regional', 50, '1 hour', 'Smoking Rack', 'standard'),
    ('Hushback Silver-Reed Broth', 'Rare or Dangerous', 70, '2 hours', 'Silver Reed', 'dangerous'),
    ('Telleth Bellbread ⚠', 'Rare or Dangerous', 70, '2 hours', 'Resonance-Safe Knife', 'dangerous'),
    ('Duskhide Marrow Tartine', 'Rare or Dangerous', 70, '2 hours', 'Bone-Roasting Pan', 'dangerous'),
    ('Blackwake Vigil Soup', 'Regional', 50, '1 hour', '', 'standard'),
    ('Azurefin Nayara Skewers', 'Regional', 50, '1 hour', '', 'standard'),
    ('Reedhorn Yoghurt Hearthbread', 'Regional', 50, '1 hour', '', 'standard'),
    ('Vaelwyn Bark-Honey Dumplings', 'Regional', 50, '1 hour', 'Leaf-Steaming Basket', 'standard'),
    ('Qasira Well-Bowl', 'Regional', 50, '1 hour', '', 'standard'),
    ('Gorak Ash-Roast', 'Rare or Dangerous', 70, '2 hours', '', 'dangerous'),
    ('Iril Candle-Pear ✦', 'Masterwork or Unstable', 85, '2 hours', 'Sealed Glass Vessel', 'masterwork')
)
update public.catalogue_entries as catalogue
set data = catalogue.data || jsonb_build_object(
  'difficulty', recipe_metadata.difficulty,
  'dc', recipe_metadata.dc,
  'time', recipe_metadata.cooking_time,
  'specialtyUtensil', recipe_metadata.specialty_utensil,
  'preparationClass', recipe_metadata.preparation_class
)
from recipe_metadata
where catalogue.category = 'food_dishes'
  and catalogue.data ->> 'name' = recipe_metadata.name;

-- Refresh the generated Hearthcraft rule rows without touching DM-created custom rules.
with rule_metadata(sort_order, rule_name, rule_value) as (
  values
    (0, 'Cooking Check', 'd100 + Cooking Skill + Hearthcraft Level Bonus + situational modifiers'),
    (1, 'Complete Cooking Kit', '+25 to the Cooking Check'),
    (2, 'Proficient Assistant', '+10; only one assistant may help'),
    (3, 'Advantage & Disadvantage', 'Professional kitchen grants Advantage. Poor fire, dirty water, heavy weather, or a missing specialty utensil may impose Disadvantage.'),
    (4, 'Unfamiliar Recipe', '+10 DC without a written recipe or local instruction'),
    (5, 'Serving Size', 'Up to 4 servings normally. Preparing 5-8 servings adds +10 DC.'),
    (6, 'Hearth Boon Limit', 'One Hearth Boon per creature per long rest'),
    (7, 'Cooking XP', '1 XP for a successful DC 35+ meal, plus 1 XP if new, dangerous, regional, or under pressure. Maximum 2 XP per long rest.'),
    (8, 'Failed Cooking', 'Failure creates an edible ordinary meal with no Hearth Boon. Natural 1-5 spoils the ingredients.')
)
update public.catalogue_entries as catalogue
set
  sort_order = rule_metadata.sort_order,
  data = jsonb_build_object('rule', rule_metadata.rule_name, 'value', rule_metadata.rule_value)
from rule_metadata
where catalogue.category = 'food_rules'
  and catalogue.stable_key = 'food_rules:' || rule_metadata.sort_order::text;

with rule_metadata(sort_order, rule_name, rule_value) as (
  values
    (0, 'Cooking Check', 'd100 + Cooking Skill + Hearthcraft Level Bonus + situational modifiers'),
    (1, 'Complete Cooking Kit', '+25 to the Cooking Check'),
    (2, 'Proficient Assistant', '+10; only one assistant may help'),
    (3, 'Advantage & Disadvantage', 'Professional kitchen grants Advantage. Poor fire, dirty water, heavy weather, or a missing specialty utensil may impose Disadvantage.'),
    (4, 'Unfamiliar Recipe', '+10 DC without a written recipe or local instruction'),
    (5, 'Serving Size', 'Up to 4 servings normally. Preparing 5-8 servings adds +10 DC.'),
    (6, 'Hearth Boon Limit', 'One Hearth Boon per creature per long rest'),
    (7, 'Cooking XP', '1 XP for a successful DC 35+ meal, plus 1 XP if new, dangerous, regional, or under pressure. Maximum 2 XP per long rest.'),
    (8, 'Failed Cooking', 'Failure creates an edible ordinary meal with no Hearth Boon. Natural 1-5 spoils the ingredients.')
)
insert into public.catalogue_entries (category, stable_key, sort_order, data)
select
  'food_rules',
  'food_rules:' || rule_metadata.sort_order::text,
  rule_metadata.sort_order,
  jsonb_build_object('rule', rule_metadata.rule_name, 'value', rule_metadata.rule_value)
from rule_metadata
where not exists (
  select 1
  from public.catalogue_entries existing
  where existing.category = 'food_rules'
    and existing.stable_key = 'food_rules:' || rule_metadata.sort_order::text
);
