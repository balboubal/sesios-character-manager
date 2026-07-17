import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/workbook-defaults.json",
  "public/sheet/index.html",
  "public/sheet/data.js",
  "public/sheet/engine.js",
  "public/sheet/script.js",
  "supabase/migrations/20260717000000_initial_schema.sql",
  "supabase/migrations/20260717001000_seed_catalogues.sql",
  "supabase/functions/invite-player/index.ts",
  "README.md",
];

requiredFiles.forEach((file) => {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
});

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "public/sheet/data.js"), "utf8"), context);
const workbook = context.window.AMUTSU_DATA;
assert.equal(workbook.items.length, 267, "Workbook item catalogue changed unexpectedly");
assert.equal(workbook.traits.length, 41, "Workbook trait catalogue changed unexpectedly");
assert.equal(workbook.conditions.length, 27, "Workbook condition catalogue changed unexpectedly");
assert.ok(workbook.defaultState.character, "Default character state is missing");

const bridge = fs.readFileSync(path.join(root, "public/sheet/script.js"), "utf8");
assert.match(bridge, /amutsu:state-change/, "Online character save bridge is missing");
assert.match(bridge, /amutsu:load/, "Online character load bridge is missing");

const browserSources = [
  fs.readFileSync(path.join(root, "src/main.js"), "utf8"),
  fs.readFileSync(path.join(root, "src/config.js"), "utf8"),
].join("\n");
assert.doesNotMatch(
  browserSources,
  /service[_-]?role/i,
  "A service-role reference must never be present in browser code",
);

const schema = fs.readFileSync(
  path.join(root, "supabase/migrations/20260717000000_initial_schema.sql"),
  "utf8",
);
for (const table of ["profiles", "characters", "catalogue_entries", "campaign_settings"]) {
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
}
assert.match(schema, /characters_select_owner_or_dm/i);
assert.match(schema, /characters_delete_owner_or_dm/i);

console.log("Project checks passed.");
