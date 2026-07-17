import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(projectRoot, "public", "sheet", "data.js");
const outputPath = path.join(projectRoot, "src", "workbook-defaults.json");
const seedPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260717001000_seed_catalogues.sql",
);

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, "utf8"), context, { filename: dataPath });
const workbook = context.window.AMUTSU_DATA;

if (!workbook?.defaultState) {
  throw new Error("The workbook data file does not expose AMUTSU_DATA.defaultState.");
}

fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ defaultState: workbook.defaultState }, null, 2)}\n`,
  "utf8",
);

const catalogueCollections = {
  traits: workbook.traits,
  conditions: workbook.conditions,
  items: workbook.items,
  food_dishes: workbook.food.dishes,
  food_rules: workbook.food.rules,
  crafting_sections: workbook.crafting.sections,
};

const migrationHeader = `-- Generated from public/sheet/data.js.\n-- Re-running this migration is safe: existing catalogue rows are left unchanged.\n\n`;
const statements = Object.entries(catalogueCollections).map(([category, entries]) => {
  const payload = JSON.stringify(entries).replaceAll("$catalogue$", "$ catalogue $");
  return `with source_entries as (\n  select value as data, ordinality::integer - 1 as sort_order\n  from jsonb_array_elements($catalogue$${payload}$catalogue$::jsonb) with ordinality\n+)\ninsert into public.catalogue_entries (category, stable_key, sort_order, data)\nselect\n  '${category}',\n  '${category}:' || sort_order::text,\n  sort_order,\n  data\nfrom source_entries\non conflict (category, stable_key) do nothing;`;
});

fs.writeFileSync(seedPath, `${migrationHeader}${statements.join("\n\n")}\n`, "utf8");

console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
console.log(`Generated ${path.relative(projectRoot, seedPath)}`);
