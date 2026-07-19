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
vm.runInNewContext(fs.readFileSync(path.join(root, "public/sheet/engine.js"), "utf8"), context);
const workbook = context.window.AMUTSU_DATA;
assert.equal(workbook.items.length, 267, "Workbook item catalogue changed unexpectedly");
assert.equal(workbook.traits.length, 41, "Workbook trait catalogue changed unexpectedly");
assert.equal(workbook.conditions.length, 27, "Workbook condition catalogue changed unexpectedly");
assert.ok(workbook.defaultState.character, "Default character state is missing");

const bridge = fs.readFileSync(path.join(root, "public/sheet/script.js"), "utf8");
assert.match(bridge, /amutsu:state-change/, "Online character save bridge is missing");
assert.match(bridge, /amutsu:load/, "Online character load bridge is missing");
assert.match(bridge, /data-hearth-eat/, "Hearth meal checkbox handler is missing");
assert.match(bridge, /add-inventory-slot/, "Add inventory slot control is missing");
assert.match(bridge, /remove-inventory-slot/, "Remove inventory slot control is missing");
assert.match(bridge, /path === "inventory"/, "Dynamic inventory persistence hook is missing");
assert.match(bridge, /metric-icon/, "Primary-stat icons are missing");
assert.match(bridge, /personality-chip/, "Compact personality-trait display is missing");
assert.match(bridge, /remove-trait/, "Personality-trait removal control is missing");
assert.match(bridge, /path === "personality"/, "Dynamic personality persistence hook is missing");
assert.doesNotMatch(
  bridge,
  /data-bind="personality\.\$\{index\}\.cost"/,
  "Personality costs should remain hidden on the character sheet",
);

const stylesheet = fs.readFileSync(path.join(root, "public/sheet/styles.css"), "utf8");
assert.match(stylesheet, /\.ability-grid\s*{[^}]*repeat\(6,/s, "Ability scores are not full-width");
assert.match(stylesheet, /\.metric-icon\s*{/, "Primary-stat icon styling is missing");
assert.match(stylesheet, /\.personality-compact\s*{/, "Compact trait styling is missing");

const inventoryEngine = context.window.AmutsuEngine;
const defaultInventory = workbook.defaultState.inventory;
const expandedInventory = [
  ...defaultInventory,
  { name: "Extra Rope", quantity: 2, equipped: false, weightOverride: 3 },
  inventoryEngine.createInventoryEntry(),
];
const mergedInventory = inventoryEngine.mergeInventorySlots(defaultInventory, expandedInventory);
assert.equal(mergedInventory.length, defaultInventory.length + 2);
assert.equal(mergedInventory.at(-2).name, "Extra Rope");
assert.equal(mergedInventory.at(-2).quantity, 2);
assert.equal(inventoryEngine.mergeInventorySlots(defaultInventory, []).length, 0);
const expandedCharacterState = JSON.parse(JSON.stringify(workbook.defaultState));
expandedCharacterState.inventory = mergedInventory;
assert.equal(
  inventoryEngine.calculate(expandedCharacterState, workbook).inventory.rows.length,
  defaultInventory.length + 2,
);

const dynamicInventoryState = {
  inventory: [{ name: "Dagger", quantity: 1, equipped: false, weightOverride: null }],
};
assert.equal(inventoryEngine.addInventoryItem(dynamicInventoryState, "Forgery Kit"), true);
assert.equal(dynamicInventoryState.inventory.length, 2);
assert.equal(dynamicInventoryState.inventory[1].name, "Forgery Kit");
assert.equal(inventoryEngine.addInventoryItem(dynamicInventoryState, "Dagger"), true);
assert.equal(dynamicInventoryState.inventory.length, 2);
assert.equal(dynamicInventoryState.inventory[0].quantity, 2);
inventoryEngine.addInventorySlot(dynamicInventoryState);
assert.equal(dynamicInventoryState.inventory.length, 3);
assert.ok(inventoryEngine.removeInventorySlot(dynamicInventoryState, 1));
assert.equal(dynamicInventoryState.inventory.length, 2);
assert.equal(dynamicInventoryState.inventory.some((entry) => entry.name === "Forgery Kit"), false);

const personalityEngine = context.window.AmutsuEngine;
const personalityState = JSON.parse(JSON.stringify(workbook.defaultState));
let personalityResult = personalityEngine.calculatePersonality(personalityState, workbook);
assert.equal(personalityResult.total, 70, "Default personality budget must retain workbook costs");
assert.equal(personalityResult.limit, 70);
assert.equal(personalityResult.atLimit, true);
assert.equal(personalityResult.overLimit, false);

let traitEditResult = personalityEngine.addPersonalityTrait(personalityState, workbook, "Brave");
assert.equal(traitEditResult.added, false);
assert.equal(traitEditResult.reason, "limit");
traitEditResult = personalityEngine.removePersonalityTrait(personalityState, 0);
assert.equal(traitEditResult.removed, true);
assert.equal(traitEditResult.name, "Greedy");
traitEditResult = personalityEngine.addPersonalityTrait(personalityState, workbook, "Chaste");
assert.equal(traitEditResult.added, true);
assert.equal(traitEditResult.total, 65);
traitEditResult = personalityEngine.addPersonalityTrait(
  personalityState,
  workbook,
  "Master Manipulator",
);
assert.equal(traitEditResult.added, false);
assert.equal(traitEditResult.reason, "duplicate");

const sixLowCostTraits = ["Chaste", "Content", "Fickle", "Humble", "Patient", "Temperate"];
const dynamicPersonalityState = {
  personality: sixLowCostTraits.map((name) => ({ name, cost: 5 })),
};
traitEditResult = personalityEngine.addPersonalityTrait(
  dynamicPersonalityState,
  workbook,
  "Trusting",
);
assert.equal(traitEditResult.added, true, "Trait budget, not six fixed slots, should set the limit");
assert.equal(dynamicPersonalityState.personality.length, 7);
assert.equal(traitEditResult.total, 35);
assert.equal(
  personalityEngine.mergePersonalitySlots(workbook.defaultState.personality, []).length,
  0,
  "Removing every personality trait must persist",
);
assert.equal(
  personalityEngine.mergePersonalitySlots(
    workbook.defaultState.personality,
    dynamicPersonalityState.personality,
  ).length,
  7,
  "Expanded personality selections must persist",
);

const applyHearthMealEdit = context.window.AmutsuEngine.applyHearthMealEdit;
const mealState = () => ({
  hearth: {
    restCycle: 8,
    log: [{ rest: "", day: "", dish: "Broth", eaten: false, boonUsed: false }],
  },
  hunger: { days: [{ day: 2 }, { day: "" }, { day: 6 }, { day: "bad" }, { day: 9 }] },
});

const loggedMeal = mealState();
let mealEditResult = applyHearthMealEdit(loggedMeal, 0, true);
assert.equal(mealEditResult.accepted, true);
assert.equal(mealEditResult.reason, "logged");
assert.equal(loggedMeal.hearth.log[0].eaten, true);
assert.equal(loggedMeal.hearth.log[0].rest, 8);
assert.equal(loggedMeal.hearth.log[0].day, 9);

const clearedMeal = mealState();
clearedMeal.hearth.log[0] = {
  rest: 7,
  day: 12,
  dish: "Broth",
  eaten: true,
  boonUsed: true,
};
mealEditResult = applyHearthMealEdit(clearedMeal, 0, false);
assert.equal(mealEditResult.accepted, true);
assert.equal(mealEditResult.reason, "cleared");
assert.equal(clearedMeal.hearth.log[0].eaten, false);
assert.equal(clearedMeal.hearth.log[0].rest, "");
assert.equal(clearedMeal.hearth.log[0].day, "");
assert.equal(clearedMeal.hearth.log[0].boonUsed, true);

const missingDish = mealState();
missingDish.hearth.log[0].dish = "";
mealEditResult = applyHearthMealEdit(missingDish, 0, true);
assert.equal(mealEditResult.accepted, false);
assert.equal(mealEditResult.reason, "missing-dish");
assert.equal(missingDish.hearth.log[0].eaten, false);

const missingDay = mealState();
missingDay.hunger.days = [{ day: "" }, { day: "invalid" }];
mealEditResult = applyHearthMealEdit(missingDay, 0, true);
assert.equal(mealEditResult.accepted, false);
assert.equal(mealEditResult.reason, "missing-day");
assert.equal(missingDay.hearth.log[0].eaten, false);

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
