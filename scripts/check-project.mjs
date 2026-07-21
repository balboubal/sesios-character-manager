import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  buildItemImportPlan,
  createBulkImportPayload,
  ITEM_IMPORT_FIELDS,
  ITEM_IMPORT_HEADER,
  parseSpreadsheetItems,
} from "../src/catalogue-import.js";
import {
  adjustCharacterExperience,
  CHARACTER_XP_LEVELS,
  experienceProgress,
  normalizeCharacterExperienceState,
} from "../src/experience.js";
import {
  clearPortalLocation,
  isNewerCharacterRecord,
  loadPortalLocation,
  savePortalLocation,
  shouldSynchronizeForAuthChange,
} from "../src/session-state.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/catalogue-import.js",
  "src/experience.js",
  "src/styles.css",
  "src/session-state.js",
  "src/workbook-defaults.json",
  "public/sheet/index.html",
  "public/sheet/data.js",
  "public/sheet/engine.js",
  "public/sheet/script.js",
  "supabase/migrations/20260717000000_initial_schema.sql",
  "supabase/migrations/20260717001000_seed_catalogues.sql",
  "supabase/migrations/20260720000000_enable_character_realtime.sql",
  "supabase/migrations/20260720001000_bulk_import_catalogue_items.sql",
  "supabase/migrations/20260721000000_hearthcraft_cooking_metadata.sql",
  "supabase/migrations/20260721001000_hearthcraft_ingredient_catalogue.sql",
  "supabase/migrations/20260721002000_hearthcraft_ingredient_pantry_and_region_rules.sql",
  "supabase/migrations/20260721003000_crafters_ledger_overhaul.sql",
  "supabase/functions/invite-player/index.ts",
  "README.md",
];

requiredFiles.forEach((file) => {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
});

assert.equal(CHARACTER_XP_LEVELS.length, 21, "Character XP must define Levels 0-20");
assert.deepEqual(
  CHARACTER_XP_LEVELS.slice(0, 4).map((entry) => [entry.level, entry.totalXp, entry.xpToNext]),
  [[0, 0, 25], [1, 25, 45], [2, 70, 60], [3, 130, 90]],
  "Opening XP thresholds do not match the campaign table",
);
assert.deepEqual(
  experienceProgress(96),
  { totalXp: 96, level: 2, currentXp: 26, requiredXp: 60, nextLevel: 3, percent: 43.333333333333336, isMaxLevel: false },
  "Current-level XP progress is incorrect",
);
const legacyXpState = { character: { level: 5 } };
assert.equal(normalizeCharacterExperienceState(legacyXpState).totalXp, 350, "Legacy levels must migrate to their minimum cumulative XP");
const adjustedXpState = { character: { level: 0, experience: 20 } };
const adjustedXp = adjustCharacterExperience(adjustedXpState, 10);
assert.equal(adjustedXp.after.level, 1, "XP additions must level characters automatically");
assert.equal(adjustedXp.after.currentXp, 5, "XP overflow must carry into the next level");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "public/sheet/data.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(path.join(root, "public/sheet/engine.js"), "utf8"), context);
const workbook = context.window.AMUTSU_DATA;
assert.equal(workbook.items.length, 267, "Workbook item catalogue changed unexpectedly");
assert.equal(workbook.traits.length, 41, "Workbook trait catalogue changed unexpectedly");
assert.equal(workbook.conditions.length, 27, "Workbook condition catalogue changed unexpectedly");
assert.ok(workbook.defaultState.character, "Default character state is missing");
assert.ok(workbook.defaultState.cooking, "Default Cooking progression state is missing");
assert.equal(workbook.food.cooking.levels.length, 6, "Cooking progression must include Levels 0-5");
assert.equal(workbook.food.cooking.kit.bonus, 25, "Cooking Kit bonus must remain +25");
assert.equal(workbook.food.cooking.kit.cost, 20, "Cooking Kit must cost 20 GP");
assert.equal(workbook.food.cooking.kit.costUnit, "GP", "Cooking Kit price unit must be GP");
assert.equal(workbook.defaultState.schemaVersion, 7, "Character XP progression requires schema 7");
assert.equal(workbook.defaultState.character.name, "", "Fresh character defaults must not contain the former test character name");
assert.equal(workbook.defaultState.character.className, "", "Fresh characters must not begin with a test class");
assert.equal(workbook.defaultState.character.experience, 0, "Fresh characters must begin with 0 XP");
assert.equal(workbook.defaultState.inventory.length, 0, "Fresh characters must begin with an empty inventory");
assert.equal(Object.values(workbook.defaultState.currency).every((value) => value === 0), true, "Fresh characters must begin with no test currency");
assert.equal(Object.values(workbook.defaultState.skills).every((skill) => skill.proficient === false && skill.bonus === 0), true, "Fresh characters must begin without test proficiencies");
assert.deepEqual(
  JSON.parse(JSON.stringify(workbook.defaultState.abilityBaseScores)),
  { strength: 0, speed: 0, vitality: 0, intelligence: 0, awareness: 0, talent: 0 },
  "Fresh state must include per-character base ability score storage",
);
assert.equal(workbook.defaultState.cooking.homeRegion, "Asura", "Cooking home region must have a valid default");
assert.equal(Object.keys(workbook.defaultState.cooking.ingredientPantry).length, 0, "Ingredient pantry must start empty");
assert.equal(workbook.defaultState.cooking.cookingKitOwned, false, "Cooking Kit ownership must start false");
assert.equal(workbook.defaultState.cooking.ownedUtensils.length, 0, "Specialty utensils must start unowned");
assert.ok(workbook.food.dishes.some((dish) => dish.rareDangerous === true && dish.dc === 70), "Rare or dangerous dish override metadata is missing");
assert.ok(workbook.food.dishes.some((dish) => dish.legendary === true && dish.dc === 85), "Legendary Masterchef dish metadata is missing");
assert.equal(workbook.food.ingredients.length, 115, "The complete Hearthcraft ingredient catalogue must contain 115 entries");
assert.ok(workbook.food.ingredients.some((entry) => entry.name === "Charcoal Root" && entry.region === "Fittoa"), "Fittoan ingredient reference is missing");
assert.ok(workbook.food.ingredients.some((entry) => entry.name === "Bellfin Salt" && entry.category === "Fishery Product"), "Fishery product reference is missing");
assert.ok(workbook.food.dishes.every((dish) => Array.isArray(dish.ingredients) && dish.ingredients.length), "Every Hearthcraft dish must link to key ingredients");
assert.equal(workbook.crafting.materials.length, 99, "The Crafter's Ledger must include 99 material records");
assert.equal(workbook.crafting.recipes.length, 91, "The Crafter's Ledger must include 91 recipes");
assert.equal(workbook.crafting.legendaryConcepts.length, 7, "The Crafter's Ledger must include seven Legendary concepts");
assert.ok(workbook.defaultState.crafting, "Default crafting state is missing");
assert.equal(Object.keys(workbook.defaultState.crafting.materialInventory).length, 0, "Crafting material inventory must start empty");
assert.deepEqual(JSON.parse(JSON.stringify(workbook.defaultState.crafting.legendaryProject)), { conceptId: "", customName: "", designComplete: false, assemblyComplete: false, awakeningComplete: false, notes: "" }, "Legendary Project tracker defaults are incomplete");
assert.equal(workbook.crafting.recipes.every((recipe) => Array.isArray(recipe.requirements) && recipe.requirements.length >= 1 && recipe.requirements.length <= 4), true, "Every recipe must use one to four concise material requirement lines");
assert.ok(workbook.crafting.recipes.some((recipe) => recipe.blueprintRequired && recipe.rarity === "Rare"), "Rare recipe blueprint rules are missing");

const bridge = fs.readFileSync(path.join(root, "public/sheet/script.js"), "utf8");
assert.match(bridge, /amutsu:state-change/, "Online character save bridge is missing");
assert.match(bridge, /amutsu:load/, "Online character load bridge is missing");
assert.match(bridge, /abilityBaseScores/, "Per-character base ability score support is missing");
assert.match(bridge, /characterExperienceMarkup/, "Character-level XP progress display is missing");
assert.match(bridge, /DM-controlled XP/, "Reset and import handling must preserve DM-controlled XP");
assert.doesNotMatch(bridge, /data-bind="character\.level"/, "Character level must not remain player-editable");
assert.match(bridge, /Character reset\. Name, original base ability rolls, and DM-controlled XP were preserved\./, "Reset must preserve the creation identity, base rolls, and XP");
assert.match(bridge, /amutsu-character-sheet:v2/, "Standalone test-character local storage must be retired");
assert.match(bridge, /request-long-rest/, "Character Sheet Long Rest control is missing");
assert.match(bridge, /request-advance-day/, "Advance Day control is missing");
assert.match(bridge, /request-reset-days/, "Reset days control is missing");
assert.match(bridge, /request-selected-hearth-meal/, "Hearth Boon activation control is missing");
assert.match(bridge, /Cooking Station/, "Interactive Cooking Station is missing");
assert.match(bridge, /roll-cooking-check/, "Cooking Check roll control is missing");
assert.match(bridge, /record-cooking-result/, "Cooking result recording is missing");
assert.match(bridge, /grant-cooking-training/, "Cooking training XP control is missing");
assert.match(bridge, /Master Cook reroll/, "Master Cook reroll control is missing");
assert.match(bridge, /Cooking Rules & Equipment/, "Full cooking rules reference is missing");
assert.match(bridge, /Ingredient Catalogue/, "Hearthcraft ingredient catalogue tab is missing");
assert.match(bridge, /Ingredient Pantry/, "Player ingredient pantry tab is missing");
assert.match(bridge, /buy-cooking-kit/, "Cooking Kit purchase control is missing");
assert.match(bridge, /data-action="add-ingredient"/, "Ingredient collection controls are missing");
assert.match(bridge, /cooking\.homeRegion/, "Player home-region selector is missing");
assert.match(bridge, /cooking\.ownedUtensils/, "Owned specialty-utensil controls are missing");
assert.match(bridge, /ingredientSource/, "Pantry-versus-purchase cooking source is missing");
assert.match(bridge, /Cannot cook this recipe/, "Cooking progression locks are missing");
assert.match(bridge, /Legendary Masterchef Dish/, "Legendary dish display is missing");
assert.match(bridge, /path === "cooking\.ingredientPantry"/, "Dynamic ingredient pantry persistence hook is missing");
assert.match(bridge, /path === "cooking\.ownedUtensils"/, "Dynamic utensil ownership persistence hook is missing");
assert.match(bridge, /renderIngredientCard/, "Ingredient catalogue cards are missing");
assert.match(bridge, /data-action="show-ingredient"/, "Dish-to-ingredient navigation is missing");
assert.match(bridge, /data-food-results="ingredients"/, "Ingredient filter results container is missing");
assert.match(bridge, /path === "cooking\.history"/, "Dynamic Cooking history persistence hook is missing");
assert.match(bridge, /The Crafter's Ledger/, "Interactive Crafter's Ledger page is missing");
assert.match(bridge, /Crafting Station/, "Crafting Station is missing");
assert.match(bridge, /Recover One Material/, "Material recovery workflow is missing");
assert.match(bridge, /roll-crafting-check/, "Crafting Check action is missing");
assert.match(bridge, /record-crafting-result/, "Crafting result recording is missing");
assert.match(bridge, /record-crafting-recovery/, "Recovered material recording is missing");
assert.match(bridge, /data-crafting-requirement/, "Recipe material selectors are missing");
assert.match(bridge, /data-crafting-blueprint/, "Blueprint ownership controls are missing");
assert.match(bridge, /undo-crafting/, "Crafting ledger undo is missing");
assert.match(bridge, /path === "crafting\.materialInventory"/, "Dynamic crafting material inventory persistence hook is missing");
assert.match(bridge, /path === "crafting\.knownBlueprints"/, "Dynamic blueprint persistence hook is missing");
assert.match(bridge, /path === "crafting\.history"/, "Dynamic crafting history persistence hook is missing");
assert.match(bridge, /Legendary Project Tracker/, "Legendary project tracker is missing");
assert.match(bridge, /data-legendary-project-control/, "Legendary project stage controls are missing");
assert.match(bridge, /clear-legendary-project/, "Legendary project reset control is missing");
assert.match(bridge, /data-ailment-select/, "Dedicated ailment selectors are missing");
assert.match(
  bridge,
  /path === "activeAilments" && !Array\.isArray\(suppliedValue\)/,
  "Legacy combined effect and ailment rows must survive default-state merging",
);
assert.match(bridge, /change-ailment-mark/, "Ailment mark controls are missing");
assert.match(bridge, /ailment-mark-effects/, "Ailment mark descriptions are missing");
assert.match(bridge, /Eat one standard ration/, "Standard-ration-only control is missing");
assert.ok(
  bridge.indexOf('h2>Active Effects') < bridge.indexOf('h2>Survival & Food'),
  "Effects and ailments must appear before survival and food",
);
assert.match(bridge, /undo-survival/, "Survival history undo control is missing");
assert.match(bridge, /<details class="history-disclosure"/, "Journey history must be collapsible");
assert.match(bridge, /path === "hunger\.days"/, "Dynamic journey-day persistence hook is missing");
assert.match(bridge, /path === "hearth\.log"/, "Dynamic meal-log persistence hook is missing");
assert.match(bridge, /path === "survivalHistory"/, "Dynamic survival-history persistence hook is missing");
assert.match(bridge, /path === "hearth\.acquired"/, "DM-added pantry dish persistence hook is missing");
assert.doesNotMatch(bridge, /data-hearth-eat/, "The fixed meal-log checkbox UI must be removed");
assert.doesNotMatch(bridge, /Thirty-day journey log/, "The fixed thirty-day tracker must be removed");
assert.match(bridge, /add-inventory-slot/, "Add inventory slot control is missing");
assert.match(bridge, /remove-inventory-slot/, "Remove inventory slot control is missing");
assert.match(bridge, /path === "inventory"/, "Dynamic inventory persistence hook is missing");
assert.match(bridge, /metric-icon/, "Primary-stat icons are missing");
assert.match(bridge, /personality-chip/, "Compact personality-trait display is missing");
assert.match(bridge, /remove-trait/, "Personality-trait removal control is missing");
assert.match(bridge, /path === "personality"/, "Dynamic personality persistence hook is missing");
assert.match(bridge, /equipmentSlotIcon/, "Equipment slot icons are missing");
assert.match(bridge, /equipmentDetailsMarkup/, "Clear equipment bonus details are missing");
assert.match(bridge, /data-metric-note/, "Live resource-caption bindings are missing");
assert.match(bridge, /function abilityScoreBand\(value\)/, "Ability score color-band logic is missing");
assert.match(bridge, /function abilityIcon\(name\)/, "Ability score icon renderer is missing");
for (const ability of ["strength", "speed", "vitality", "intelligence", "awareness", "talent"]) {
  assert.ok(bridge.includes(`${ability}: \`<`), `Missing ${ability} ability icon`);
}
assert.match(bridge, /data-ability-icon=/, "Ability icon hooks are missing");
assert.match(bridge, /if \(score <= 55\) return "low";/, "Scores through 55 must use the low band");
assert.match(bridge, /if \(score <= 69\) return "mid";/, "Scores from 56 through 69 must use the middle band");
assert.match(
  bridge,
  /element\.dataset\.scoreBand = abilityScoreBand\(value\)/,
  "Ability score colors must refresh when calculated values change",
);
assert.match(
  bridge,
  /availableItems\.includes\(item\.name\)/,
  "Catalogue equip actions must require an available inventory item",
);
assert.match(
  bridge,
  /new Set\(engine\.availableInventoryItemNames\(state\)\)/,
  "Equipment dropdowns must use positive-quantity inventory items",
);
assert.match(bridge, /window\.sessionStorage/, "Per-character sheet location storage is missing");
assert.match(bridge, /scrollPositions/, "Per-route scroll restoration is missing");
assert.match(bridge, /amutsu:flush-request/, "The embedded sheet save-flush request handler is missing");
assert.match(bridge, /amutsu:flush-complete/, "The embedded sheet save-flush acknowledgement is missing");
assert.match(
  bridge,
  /renderRoute\(\{ restoreStoredScroll: true \}\)/,
  "Sheet reloads must restore the saved route scroll position",
);
assert.doesNotMatch(
  bridge,
  /The source stores these eight item names|Parity mode retains|source row 12 anomaly|source rows/,
  "Developer-only conversion notes must not be shown to players",
);
assert.doesNotMatch(
  bridge,
  /data-bind="personality\.\$\{index\}\.cost"/,
  "Personality costs should remain hidden on the character sheet",
);

const stylesheet = fs.readFileSync(path.join(root, "public/sheet/styles.css"), "utf8");
assert.match(stylesheet, /\.ability-grid\s*{[^}]*repeat\(6,/s, "Ability scores are not full-width");
assert.match(stylesheet, /\.ability-score\[data-score-band="low"\]\s*{/, "Low-score styling is missing");
assert.match(stylesheet, /\.ability-score\[data-score-band="mid"\]\s*{/, "Middle-score styling is missing");
assert.match(stylesheet, /\.ability-score\[data-score-band="high"\]\s*{/, "High-score styling is missing");
assert.match(stylesheet, /--score-low:\s*#ff5757;/i, "Low scores must use the requested red");
assert.match(stylesheet, /--score-mid:\s*#ffde59;/i, "Middle scores must use the requested yellow");
assert.match(stylesheet, /--score-high:\s*#00bf63;/i, "High scores must use the requested green");
assert.match(stylesheet, /\.ability-icon\s*{/, "Ability icon tile styling is missing");
assert.match(stylesheet, /\.ability-icon svg\s*{/, "Ability icon artwork styling is missing");
assert.match(stylesheet, /\.ability-score\s*{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/s, "Ability scores must be centered in their boxes");
assert.doesNotMatch(stylesheet, /\.ability-score\[data-score-band="mid"\]\s*{[^}]*background:\s*#303727/s, "Middle scores must not use the old dark background");
assert.match(stylesheet, /\.metric-icon\s*{/, "Primary-stat icon styling is missing");
assert.match(stylesheet, /\.personality-compact\s*{/, "Compact trait styling is missing");
assert.match(stylesheet, /\.equipment-slot-icon\s*{/, "Equipment icon styling is missing");
assert.match(stylesheet, /\.equipment-stat-badge\s*{/, "Equipment bonus badge styling is missing");
assert.match(stylesheet, /\.survival-status-grid\s*{/, "Survival dashboard styling is missing");
assert.match(stylesheet, /\.pantry-grid\s*{/, "Owned pantry card styling is missing");
assert.match(stylesheet, /\.history-list\s*{/, "Journey history styling is missing");
assert.match(stylesheet, /\.current-pools-panel \.long-rest-button/, "Mobile Long Rest styling is missing");
assert.match(stylesheet, /\.ailment-grid\s*{/, "Dedicated ailment layout styling is missing");
assert.match(stylesheet, /\.ailment-mark-stepper\s*{/, "Ailment mark stepper styling is missing");
assert.match(stylesheet, /\.reset-days-button/, "Reset days button styling is missing");
assert.match(stylesheet, /\.cooking-station-grid\s*\{/, "Cooking Station layout styling is missing");
assert.match(stylesheet, /\.cooking-options-grid\s*\{/, "Cooking modifier controls styling is missing");
assert.match(stylesheet, /\.cooking-reference-grid\s*\{/, "Cooking rules reference styling is missing");
assert.match(stylesheet, /\.ingredient-grid\s*\{/, "Ingredient catalogue grid styling is missing");
assert.match(stylesheet, /\.food-ingredient-list\s*\{/, "Dish ingredient-link styling is missing");
assert.match(stylesheet, /\.ingredient-role-grid\s*\{/, "Ingredient role reference styling is missing");
assert.match(stylesheet, /\.ingredient-pantry-panel \.panel-body\s*\{/, "Ingredient pantry styling is missing");
assert.match(stylesheet, /\.utensil-checkbox-grid\s*\{/, "Specialty utensil ownership styling is missing");
assert.match(stylesheet, /\.difficulty-rare\s*\{/, "Rare or dangerous purple styling is missing");
assert.match(stylesheet, /\.difficulty-masterwork\s*\{/, "Legendary Masterchef gold styling is missing");
assert.match(stylesheet, /\.crafting-tabs\s*\{/, "Crafter's Ledger tab styling is missing");
assert.match(stylesheet, /\.crafting-station-grid\s*\{/, "Crafting Station layout styling is missing");
assert.match(stylesheet, /\.crafting-material-grid[\s,]/, "Crafting material catalogue styling is missing");
assert.match(stylesheet, /\.crafting-recipe-grid[\s,]/, "Crafting recipe catalogue styling is missing");
assert.match(stylesheet, /\.crafting-recovery-grid\s*\{/, "Crafting recovery layout styling is missing");
assert.match(stylesheet, /\.crafting-project-tracker\s*\{/, "Legendary project tracker styling is missing");
assert.match(stylesheet, /\.crafting-project-stage-list\s*\{/, "Legendary project stage styling is missing");
assert.match(stylesheet, /\.character-xp-summary\s*\{/, "Character XP progress styling is missing");
assert.match(stylesheet, /\.character-xp-track\s*\{/, "Character XP bar styling is missing");

const workbookSource = fs.readFileSync(path.join(root, "src/workbook.js"), "utf8");
assert.match(workbookSource, /food_ingredients/, "DM-editable Hearthcraft Ingredients catalogue is missing");
assert.match(workbookSource, /ingredients: grouped\.food_ingredients/, "Ingredient catalogue payload bridge is missing");
assert.match(workbookSource, /crafting_materials/, "DM-editable Crafting Materials catalogue is missing");
assert.match(workbookSource, /crafting_recipes/, "DM-editable Crafting Recipes catalogue is missing");
assert.match(workbookSource, /materials: grouped\.crafting_materials/, "Crafting material payload bridge is missing");
assert.match(workbookSource, /recipes: grouped\.crafting_recipes/, "Crafting recipe payload bridge is missing");

const portalSource = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
assert.match(portalSource, /What are your base ability scores\?/, "Character creation must request the six base ability rolls");
assert.match(portalSource, /name="base-\$\{key\}"/, "Creation modal must render a base-score input for each ability");
for (const ability of ["strength", "speed", "vitality", "intelligence", "awareness", "talent"]) {
  assert.ok(portalSource.includes(`["${ability}"`), `Missing ${ability} creation definition`);
}
assert.match(portalSource, /cloneDefaultCharacterState\(name, baseAbilityScores\)/, "New character creation must store the supplied base rolls");
assert.match(portalSource, /navigationButton\("experience", "Experience"/, "DM Experience navigation is missing");
assert.match(portalSource, /function renderExperience\(/, "DM character XP section is missing");
assert.match(portalSource, /adjustCharacterExperience\(/, "DM XP adjustment workflow is missing");
assert.match(portalSource, /Players cannot edit these values/, "DM-only XP ownership copy is missing");
assert.match(portalSource, /authoritativeExperience/, "Player sheet saves must preserve authoritative DM XP");
assert.match(portalSource, /data-action="bulk-import-items"/, "Item bulk-import action is missing");
assert.match(portalSource, /id="bulk-item-form"/, "Item bulk-import form is missing");
assert.match(portalSource, /bulk_import_catalogue_items/, "Atomic bulk-import RPC call is missing");
assert.match(portalSource, /Copy supported header row/, "Spreadsheet header helper is missing");
assert.match(portalSource, /normalizeDishCatalogueData/, "Hearthcraft dish metadata normalization is missing");
assert.match(portalSource, /Rare or Dangerous override/, "DM rare or dangerous checkbox is missing");
assert.match(portalSource, /Masterchef Dish · Legendary/, "DM Legendary Masterchef checkbox is missing");
assert.match(portalSource, /catalogueSelectField\(key, "Specialty Utensil"/, "Fixed Hearthcraft metadata must use dropdown controls");
assert.match(portalSource, /normalizeCraftingMaterialData/, "Crafting Material editor normalization is missing");
assert.match(portalSource, /normalizeCraftingRecipeData/, "Crafting Recipe editor normalization is missing");
assert.match(portalSource, /parseCraftingRequirementsText/, "Simple recipe requirement parsing is missing");
assert.match(portalSource, /Materials Required/, "Crafting Recipe material input is missing");
const portalStylesheet = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
assert.match(portalSource, /handleAuthStateChange/, "Auth-event gating is missing");
assert.match(portalSource, /document\.addEventListener\("visibilitychange"/, "Return-to-tab update checks are missing");
assert.match(portalSource, /window\.addEventListener\("focus"/, "Window-focus update checks are missing");
assert.match(portalSource, /data-action="check-character-updates"/, "Manual update check is missing");
assert.match(portalSource, /data-action="load-remote-update"/, "Remote update loading control is missing");
assert.match(portalSource, /requestSheetSaveFlush/, "Pending iframe edits must support explicit flush and conflict capture");
assert.match(portalSource, /select\("id,updated_at,updated_by"\)/, "Lightweight character version query is missing");
assert.match(portalSource, /\.channel\(`character-updates:\$\{characterId\}`\)/, "Character Realtime channel is missing");
assert.match(portalSource, /"postgres_changes"/, "Postgres Changes subscription is missing");
assert.match(portalSource, /pollingIntervalMs:\s*60_000/, "The 60-second polling fallback is missing");
assert.match(portalSource, /lastToastedRemoteVersions:\s*new Map\(\)/, "Per-version toast deduplication is missing");
assert.match(portalSource, /\.eq\("updated_at", expectedUpdatedAt\)/, "Optimistic save conflict detection is missing");
assert.match(portalSource, /Save paused: newer changes available/, "Conflict-paused save status is missing");
assert.doesNotMatch(
  portalSource.match(/async function performRemoteCharacterUpdateCheck\(reason\)[\s\S]*?\n}/)?.[0] || "",
  /flushOpenCharacterSave/,
  "Remote version checks must not flush stale local edits before comparing versions",
);
assert.match(portalSource, /characterId=\$\{encodeURIComponent\(character\.id\)\}/, "Character-specific iframe location is missing");
assert.match(portalSource, /viewerRole=\$\{isDm\(\) \? "dm" : "player"\}/, "DM history role bridge is missing");
assert.match(portalStylesheet, /\.editor-update-banner\s*{/, "Remote update banner styling is missing");
assert.match(portalStylesheet, /\.editor-live-state\s*{/, "Realtime connection-state styling is missing");
assert.match(portalStylesheet, /\.sheet-frame\s*{[^}]*grid-row:\s*3/s, "The iframe must retain the flexible editor grid row");
assert.match(portalStylesheet, /\.xp-admin-row\s*\{/, "DM XP row styling is missing");
assert.match(portalStylesheet, /\.xp-progress-track\s*\{/, "DM XP progress bar styling is missing");

const sheetHtml = fs.readFileSync(path.join(root, "public/sheet/index.html"), "utf8");
for (const dialogId of ["long-rest-dialog", "advance-day-dialog", "hearth-meal-dialog", "history-edit-dialog"]) {
  assert.match(sheetHtml, new RegExp(`id="${dialogId}"`), `Missing ${dialogId}`);
}
assert.doesNotMatch(
  sheetHtml,
  /Source workbook:|Workbook logic preserved|Restore original workbook values/,
  "Developer-only workbook notes must not appear in the player shell",
);

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

const equipmentInventoryState = {
  inventory: [
    { name: "Dagger", quantity: 1, equipped: false },
    { name: "Dagger", quantity: 2, equipped: false },
    { name: "Shock Maul", quantity: 0, equipped: true },
    { name: "Imani's Pendant", quantity: 1, equipped: false },
    { name: "", quantity: 1, equipped: false },
  ],
  equipment: {
    righthand: "Dagger",
    lefthand: "Shock Maul",
    trinket: "Imani's Pendant",
    necklace: "Missing Item",
  },
};
const availableEquipmentNames = inventoryEngine.availableInventoryItemNames(equipmentInventoryState);
assert.deepEqual(Array.from(availableEquipmentNames), ["Dagger", "Imani's Pendant"]);
const reconciledEquipment = inventoryEngine.reconcileEquipmentWithInventory(equipmentInventoryState);
assert.equal(reconciledEquipment.clearedSlots.length, 2);
assert.equal(equipmentInventoryState.equipment.righthand, "Dagger");
assert.equal(equipmentInventoryState.equipment.lefthand, "");
assert.equal(equipmentInventoryState.equipment.trinket, "Imani's Pendant");
assert.equal(equipmentInventoryState.equipment.necklace, "");
assert.equal(equipmentInventoryState.inventory[0].equipped, true);
assert.equal(equipmentInventoryState.inventory[1].equipped, true);
assert.equal(equipmentInventoryState.inventory[2].equipped, false);
assert.equal(equipmentInventoryState.inventory[3].equipped, true);

const baseDefenseState = JSON.parse(JSON.stringify(workbook.defaultState));
const baseDefense = inventoryEngine.calculate(baseDefenseState, workbook);
assert.equal(baseDefense.stats.goldMultiplierText, "0%", "Gold multiplier should use whole-percent display");

const armorBonusState = JSON.parse(JSON.stringify(baseDefenseState));
armorBonusState.bonuses.armor = 1;
const armorBonusResult = inventoryEngine.calculate(armorBonusState, workbook);
assert.equal(armorBonusResult.stats.armor, baseDefense.stats.armor + 1);
assert.equal(
  armorBonusResult.stats.resistance,
  baseDefense.stats.resistance,
  "Armor bonus must not change resistance",
);

const resistanceBonusState = JSON.parse(JSON.stringify(baseDefenseState));
resistanceBonusState.bonuses.resistance = 1;
const resistanceBonusResult = inventoryEngine.calculate(resistanceBonusState, workbook);
assert.equal(resistanceBonusResult.stats.armor, baseDefense.stats.armor);
assert.equal(resistanceBonusResult.stats.resistance, baseDefense.stats.resistance + 1);

const splitDefenseState = JSON.parse(JSON.stringify(baseDefenseState));
Object.keys(splitDefenseState.equipment).forEach((slot) => {
  splitDefenseState.equipment[slot] = "";
});
splitDefenseState.equipment.headgear = "Asuran Guard Visor";
const splitDefenseResult = inventoryEngine.calculate(splitDefenseState, workbook);
assert.equal(splitDefenseResult.stats.armor, 2);
assert.equal(
  splitDefenseResult.stats.resistance,
  1,
  "Rogue resistance must use equipment resistance rather than equipment armor",
);

const personalityEngine = context.window.AmutsuEngine;
const personalityState = JSON.parse(JSON.stringify(workbook.defaultState));
let personalityResult = personalityEngine.calculatePersonality(personalityState, workbook);
assert.equal(personalityResult.total, 0, "Fresh characters must begin without personality traits");
assert.equal(personalityResult.limit, 70);
assert.equal(personalityResult.atLimit, false);
assert.equal(personalityResult.overLimit, false);

let traitEditResult = personalityEngine.addPersonalityTrait(personalityState, workbook, "Brave");
assert.equal(traitEditResult.added, true);
assert.equal(traitEditResult.total, 10);
traitEditResult = personalityEngine.removePersonalityTrait(personalityState, 0);
assert.equal(traitEditResult.removed, true);
assert.equal(traitEditResult.name, "Brave");
traitEditResult = personalityEngine.addPersonalityTrait(personalityState, workbook, "Chaste");
assert.equal(traitEditResult.added, true);
assert.equal(traitEditResult.total, 5);
traitEditResult = personalityEngine.addPersonalityTrait(
  personalityState,
  workbook,
  "Master Manipulator",
);
assert.equal(traitEditResult.added, true);
assert.equal(traitEditResult.total, 40);

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

const survivalEngine = context.window.AmutsuEngine;
const legacySurvivalState = JSON.parse(JSON.stringify(workbook.defaultState));
legacySurvivalState.schemaVersion = 1;
delete legacySurvivalState.hunger.currentDay;
delete legacySurvivalState.hunger.foodGainedToday;
delete legacySurvivalState.hunger.eatRationToday;
delete legacySurvivalState.hunger.hearthMealsEatenToday;
legacySurvivalState.hunger.days = [
  { day: 1, foodGained: 3, rationsEaten: 1 },
  { day: "", foodGained: "", rationsEaten: "" },
];
delete legacySurvivalState.hearth.selectedDish;
legacySurvivalState.hearth.log = [
  { rest: 1, day: 1, dish: "Hushback Silver-Reed Broth", eaten: true, boonUsed: true },
  { rest: "", day: "", dish: "", eaten: false, boonUsed: false },
];
delete legacySurvivalState.activeAilments;
legacySurvivalState.activeEffects[1].ailment = "Fittoan Ash-Sickness";
legacySurvivalState.activeEffects[1].mark = "Mark 2";
delete legacySurvivalState.survivalHistory;
delete legacySurvivalState.survivalHistorySequence;
survivalEngine.normalizeSurvivalState(legacySurvivalState);
assert.equal(legacySurvivalState.schemaVersion, 7, "Legacy state must migrate to schema 7");
assert.equal(legacySurvivalState.hunger.days.length, 1, "Blank legacy hunger rows must be removed");
assert.equal(legacySurvivalState.hearth.log.length, 1, "Blank legacy meal rows must be removed");
assert.equal(legacySurvivalState.hunger.currentDay, 2);
assert.equal(legacySurvivalState.hunger.hearthMealsEatenToday, 0);
assert.equal(legacySurvivalState.activeAilments[1].name, "Fittoan Ash-Sickness");
assert.equal(legacySurvivalState.activeAilments[1].mark, 2);
assert.equal(legacySurvivalState.survivalHistory.length, 3, "Legacy day, meal, and used-boon events must migrate");

function createActionState() {
  const state = JSON.parse(JSON.stringify(workbook.defaultState));
  state.schemaVersion = 7;
  state.abilityBaseScores = { strength: 60, speed: 60, vitality: 60, intelligence: 60, awareness: 60, talent: 60 };
  state.character.className = "Wizard";
  state.character.currentHitPoints = 12;
  state.character.temporaryHitPoints = 9;
  state.character.currentMana = 4;
  state.character.currentFocus = 6;
  state.hunger = {
    startingRations: 7,
    currentDay: 12,
    foodGainedToday: 2,
    eatRationToday: true,
    hearthMealsEatenToday: 0,
    days: [],
  };
  state.hearth = {
    restCycle: 5,
    selectedDish: "",
    log: [],
    acquired: { ...workbook.defaultState.hearth.acquired, "Hushback Silver-Reed Broth": 2 },
  };
  state.survivalHistory = [];
  state.survivalHistorySequence = 0;
  survivalEngine.normalizeSurvivalState(state);
  return state;
}

const dayActionState = createActionState();
const dayPreview = survivalEngine.previewHungerDay(dayActionState);
assert.deepEqual(
  JSON.parse(JSON.stringify(dayPreview)),
  {
    currentDay: 12,
    nextDay: 13,
    currentFood: 7,
    standardRations: 7,
    hearthRations: 2,
    totalRations: 9,
    foodGained: 2,
    availableFood: 9,
    availableStandardFood: 9,
    rationEaten: 1,
    hearthMealsEaten: 0,
    ateToday: true,
    foodAfter: 8,
    totalAfter: 10,
    hungerBefore: 0,
    hungerAfter: 0,
    condition: "Fed",
    effect: "Fed: No penalty",
  },
);
const resourcesBeforeDay = {
  hp: dayActionState.character.currentHitPoints,
  mana: dayActionState.character.currentMana,
  focus: dayActionState.character.currentFocus,
  rest: dayActionState.hearth.restCycle,
};
let survivalResult = survivalEngine.advanceHungerDay(dayActionState);
assert.equal(survivalResult.accepted, true);
assert.equal(dayActionState.hunger.days.length, 1);
assert.equal(dayActionState.hunger.currentDay, 13);
assert.equal(dayActionState.hunger.foodGainedToday, 0);
assert.equal(dayActionState.hunger.hearthMealsEatenToday, 0);
assert.equal(survivalEngine.calculate(dayActionState, workbook).hunger.currentFood, 8);
assert.equal(survivalEngine.calculate(dayActionState, workbook).hunger.totalRations, 10);
assert.equal(
  survivalEngine.calculate(dayActionState, workbook).hearth.pantry.find((dish) => dish.name === "Hushback Silver-Reed Broth").left,
  2,
  "Eating one standard ration must not consume a Hearth meal",
);
assert.deepEqual(
  {
    hp: dayActionState.character.currentHitPoints,
    mana: dayActionState.character.currentMana,
    focus: dayActionState.character.currentFocus,
    rest: dayActionState.hearth.restCycle,
  },
  resourcesBeforeDay,
  "Advance Day must not restore resources or change the rest cycle",
);
survivalResult = survivalEngine.undoLastSurvivalAction(dayActionState);
assert.equal(survivalResult.accepted, true);
assert.equal(dayActionState.hunger.days.length, 0);
assert.equal(dayActionState.hunger.currentDay, 12);
assert.equal(dayActionState.hunger.foodGainedToday, 2);
assert.equal(dayActionState.hunger.hearthMealsEatenToday, 0);

const resetDayState = createActionState();
const resetBefore = survivalEngine.calculate(resetDayState, workbook);
survivalResult = survivalEngine.resetDayCounter(resetDayState);
assert.equal(survivalResult.accepted, true);
assert.equal(resetDayState.hunger.currentDay, 1);
assert.equal(survivalEngine.calculate(resetDayState, workbook).hunger.totalRations, resetBefore.hunger.totalRations);
assert.equal(survivalEngine.calculate(resetDayState, workbook).hunger.hunger, resetBefore.hunger.hunger);
assert.equal(resetDayState.survivalHistory.at(-1).type, "day-reset");
survivalEngine.undoLastSurvivalAction(resetDayState);
assert.equal(resetDayState.hunger.currentDay, 12);

const restActionState = createActionState();
const calculatedBeforeRest = survivalEngine.calculate(restActionState, workbook);
const survivalBeforeRest = {
  currentDay: restActionState.hunger.currentDay,
  food: calculatedBeforeRest.hunger.currentFood,
  hunger: calculatedBeforeRest.hunger.hunger,
  temporaryHp: restActionState.character.temporaryHitPoints,
  focus: restActionState.character.currentFocus,
  pantry: JSON.stringify(restActionState.hearth.acquired),
};
survivalResult = survivalEngine.completeLongRest(restActionState, workbook);
assert.equal(survivalResult.accepted, true);
assert.equal(restActionState.character.currentHitPoints, calculatedBeforeRest.stats.maxHealth);
assert.equal(restActionState.character.currentMana, calculatedBeforeRest.stats.maxMana);
assert.equal(restActionState.hearth.restCycle, 6);
assert.deepEqual(
  {
    currentDay: restActionState.hunger.currentDay,
    food: survivalEngine.calculate(restActionState, workbook).hunger.currentFood,
    hunger: survivalEngine.calculate(restActionState, workbook).hunger.hunger,
    temporaryHp: restActionState.character.temporaryHitPoints,
    focus: restActionState.character.currentFocus,
    pantry: JSON.stringify(restActionState.hearth.acquired),
  },
  survivalBeforeRest,
  "Long Rest must preserve day, food, hunger, temporary HP, Focus, and pantry quantities",
);
survivalEngine.undoLastSurvivalAction(restActionState);
assert.equal(restActionState.character.currentHitPoints, 12);
assert.equal(restActionState.character.currentMana, 4);
assert.equal(restActionState.hearth.restCycle, 5);

const boonActionState = createActionState();
survivalResult = survivalEngine.eatHearthMeal(
  boonActionState,
  workbook,
  "Hushback Silver-Reed Broth",
);
assert.equal(survivalResult.accepted, true);
assert.equal(survivalResult.grantsBoon, true);
let boonDerived = survivalEngine.calculate(boonActionState, workbook);
assert.equal(boonDerived.hearth.status, "ACTIVE");
assert.equal(boonDerived.hearth.pantry.find((dish) => dish.name === "Hushback Silver-Reed Broth").left, 1);
assert.equal(boonDerived.hunger.standardRations, 7, "Eating a Hearth meal must not consume a standard ration");
assert.equal(boonDerived.hunger.hearthRations, 1);
assert.equal(boonDerived.hunger.totalRations, 8);
assert.equal(boonActionState.hunger.hearthMealsEatenToday, 1);
assert.equal(boonActionState.hunger.eatRationToday, false);
assert.equal(survivalEngine.previewHungerDay(boonActionState).rationEaten, 0);
assert.equal(survivalEngine.previewHungerDay(boonActionState).condition, "Fed");
survivalResult = survivalEngine.markHearthBoonUsed(boonActionState, workbook);
assert.equal(survivalResult.accepted, true);
assert.equal(survivalEngine.calculate(boonActionState, workbook).hearth.status, "USED");
survivalResult = survivalEngine.eatHearthMeal(
  boonActionState,
  workbook,
  "Hushback Silver-Reed Broth",
);
assert.equal(survivalResult.accepted, true, "A meal may still be eaten after the boon is used");
assert.equal(survivalResult.grantsBoon, false, "A second meal in the same rest must not grant a boon");
assert.equal(survivalEngine.calculate(boonActionState, workbook).hearth.status, "USED");
survivalResult = survivalEngine.eatHearthMeal(
  boonActionState,
  workbook,
  "Hushback Silver-Reed Broth",
);
assert.equal(survivalResult.accepted, false);
assert.equal(survivalResult.reason, "no-serving");
survivalEngine.completeLongRest(boonActionState, workbook);
boonDerived = survivalEngine.calculate(boonActionState, workbook);
assert.equal(boonDerived.hearth.status, "AVAILABLE", "Long Rest must reset Hearth Boon availability");
assert.equal(boonDerived.hearth.activeMeal, "None", "Long Rest must clear the active meal display");

const ailmentState = createActionState();
let ailmentResult = survivalEngine.setTrackedAilment(ailmentState, 0, "Fittoan Ash-Sickness");
assert.equal(ailmentResult.accepted, true);
assert.equal(ailmentState.activeAilments[0].mark, 1, "New ailments must begin at Mark 1");
ailmentResult = survivalEngine.changeTrackedAilmentMark(ailmentState, 0, 1);
assert.equal(ailmentState.activeAilments[0].mark, 2);
ailmentResult = survivalEngine.changeTrackedAilmentMark(ailmentState, 0, -1);
assert.equal(ailmentState.activeAilments[0].mark, 1);
ailmentResult = survivalEngine.changeTrackedAilmentMark(ailmentState, 0, -1);
assert.equal(ailmentResult.resolved, true);
assert.equal(ailmentState.activeAilments[0].name, "");
assert.equal(ailmentState.activeAilments[0].mark, 0);

const hearthOnlyState = createActionState();
hearthOnlyState.hunger.startingRations = 0;
hearthOnlyState.hunger.foodGainedToday = 0;
hearthOnlyState.hunger.eatRationToday = true;
survivalEngine.normalizeSurvivalState(hearthOnlyState);
assert.equal(survivalEngine.previewHungerDay(hearthOnlyState).rationEaten, 0);
survivalEngine.eatHearthMeal(hearthOnlyState, workbook, "Hushback Silver-Reed Broth");
assert.equal(survivalEngine.previewHungerDay(hearthOnlyState).condition, "Fed");
assert.equal(survivalEngine.calculate(hearthOnlyState, workbook).hunger.standardRations, 0);

const dynamicJourneyState = createActionState();
dynamicJourneyState.hunger.startingRations = 100;
dynamicJourneyState.hunger.foodGainedToday = 0;
for (let index = 0; index < 35; index += 1) {
  survivalEngine.advanceHungerDay(dynamicJourneyState);
}
assert.equal(dynamicJourneyState.hunger.days.length, 35, "Journey history must not have a 30-day limit");
assert.equal(dynamicJourneyState.survivalHistory.length, 35, "History must grow dynamically");
const firstDayEvent = dynamicJourneyState.survivalHistory[0];
survivalResult = survivalEngine.editSurvivalHistoryEntry(dynamicJourneyState, firstDayEvent.id, {
  day: 12,
  foodGained: 5,
  rationsEaten: 1,
});
assert.equal(survivalResult.accepted, true);
assert.equal(dynamicJourneyState.hunger.days[0].foodGained, 5, "DM history edits must update source data");



function stockRecipeIngredients(state, dishName) {
  const dish = workbook.food.dishes.find((entry) => entry.name === dishName);
  assert.ok(dish, `Missing test dish ${dishName}`);
  dish.ingredients.forEach((name) => {
    state.cooking.ingredientPantry[name] = 1;
  });
}

function cookingConfig(recipeKey, overrides = {}) {
  return {
    recipeKey,
    customName: "",
    cookingKit: false,
    assistant: false,
    professionalKitchen: false,
    writtenRecipe: true,
    poorConditions: false,
    ingredientSource: "pantry",
    underPressure: false,
    useCampCook: true,
    useHearthwright: true,
    ...overrides,
  };
}

const cookingState = createActionState();
Object.assign(cookingState.cooking, {
  xp: 3,
  homeRegion: "Asura",
  cookingKitOwned: true,
  familiarRecipes: [],
  ingredientPantry: {},
  ownedUtensils: [],
  history: [],
  sequence: 0,
  rerollUsedRest: 0,
  hearthwrightUsedRest: 0,
});
stockRecipeIngredients(cookingState, "Lysael Glassfin Parcels");
survivalEngine.normalizeCookingState(cookingState);
let cookingDerived = survivalEngine.calculate(cookingState, workbook);
assert.equal(cookingDerived.cooking.level, 1, "3 Cooking XP must grant Hearthhand");
assert.equal(
  cookingDerived.cooking.totalBonus,
  cookingDerived.skills["95"] + 5,
  "Cooking Checks must combine the character Cooking skill and level bonus",
);
let cookingRoll = survivalEngine.rollCookingCheck(
  cookingState,
  workbook,
  cookingConfig("Lysael Glassfin Parcels", { cookingKit: true, assistant: true, underPressure: true }),
  cookingDerived.skills,
  () => 0.8,
);
assert.equal(cookingRoll.accepted, true);
assert.equal(cookingRoll.difficulty.key, "familiar", "Home-region dishes must be familiar difficulty");
assert.equal(cookingRoll.naturalRoll, 81);
assert.equal(cookingRoll.modifierBreakdown.cookingKit, 25);
assert.equal(cookingRoll.modifierBreakdown.assistant, 10);
assert.equal(cookingRoll.outcome, "strong-success");
assert.equal(cookingRoll.preparedServings, 2, "A normal Cooking Check must prepare 2 servings");
let cookingRecord = survivalEngine.recordCookingResult(
  cookingState,
  workbook,
  cookingRoll,
  cookingDerived.skills,
);
assert.equal(cookingRecord.accepted, true);
assert.equal(cookingRecord.pantryAdded, 2, "Successful Hearthcraft must add 2 prepared servings to the meal pantry");
assert.equal(cookingRecord.actualXp, 2, "A pressured success may grant 2 XP");
assert.equal(cookingState.cooking.ingredientPantry["Glassfin Carp"], undefined, "Cooking must consume one of each required ingredient");
assert.equal(survivalEngine.calculate(cookingState, workbook).cooking.xpThisRest, 2);
assert.equal(
  survivalEngine.grantCookingTrainingXp(cookingState, cookingDerived.skills).accepted,
  false,
  "Cooking XP must be limited to 2 per long rest",
);

const criticalCookingState = createActionState();
criticalCookingState.cooking.xp = 3;
stockRecipeIngredients(criticalCookingState, "Lysael Glassfin Parcels");
survivalEngine.normalizeCookingState(criticalCookingState);
const criticalDerived = survivalEngine.calculate(criticalCookingState, workbook);
const criticalRoll = survivalEngine.rollCookingCheck(
  criticalCookingState,
  workbook,
  cookingConfig("Lysael Glassfin Parcels"),
  criticalDerived.skills,
  () => 0.97,
);
assert.equal(criticalRoll.outcome, "critical-success");
assert.equal(criticalRoll.preparedServings, 3, "Critical success must add exactly 1 serving");

const ordinaryCookingState = createActionState();
ordinaryCookingState.cooking.xp = 3;
survivalEngine.normalizeCookingState(ordinaryCookingState);
const ordinaryDerived = survivalEngine.calculate(ordinaryCookingState, workbook);
const failedMeal = survivalEngine.rollCookingCheck(
  ordinaryCookingState,
  workbook,
  cookingConfig("__familiar", { customName: "Ration stew" }),
  ordinaryDerived.skills,
  () => 0.1,
);
assert.equal(failedMeal.success, false);
const foodBeforeCooking = ordinaryCookingState.hunger.foodGainedToday;
const failedRecord = survivalEngine.recordCookingResult(ordinaryCookingState, workbook, failedMeal, ordinaryDerived.skills);
assert.equal(failedRecord.standardFoodAdded, 2, "Failed edible meals must create 2 ordinary servings");
assert.equal(ordinaryCookingState.hunger.foodGainedToday, foodBeforeCooking + 2);

const regionalLockState = createActionState();
regionalLockState.cooking.xp = 3;
stockRecipeIngredients(regionalLockState, "Brumox Winter Pot");
survivalEngine.normalizeCookingState(regionalLockState);
let regionalDerived = survivalEngine.calculate(regionalLockState, workbook);
let regionalPreview = survivalEngine.previewCookingCheck(
  regionalLockState,
  workbook,
  cookingConfig("Brumox Winter Pot"),
  regionalDerived.skills,
);
assert.equal(regionalPreview.difficulty.key, "regional");
assert.equal(regionalPreview.requiredLevel, 2);
assert.equal(regionalPreview.levelUnlocked, false, "Hearthhand cannot cook another Central-region dish");
regionalLockState.cooking.xp = 7;
regionalDerived = survivalEngine.calculate(regionalLockState, workbook);
regionalPreview = survivalEngine.previewCookingCheck(regionalLockState, workbook, cookingConfig("Brumox Winter Pot"), regionalDerived.skills);
assert.equal(regionalPreview.levelUnlocked, true, "Camp Cook must unlock other Central-region dishes");
assert.equal(regionalPreview.dc, 50);

const foreignLockState = createActionState();
foreignLockState.cooking.xp = 7;
stockRecipeIngredients(foreignLockState, "Gorak Ash-Roast");
survivalEngine.normalizeCookingState(foreignLockState);
let foreignDerived = survivalEngine.calculate(foreignLockState, workbook);
let foreignPreview = survivalEngine.previewCookingCheck(foreignLockState, workbook, cookingConfig("Gorak Ash-Roast"), foreignDerived.skills);
assert.equal(foreignPreview.difficulty.key, "rare");
assert.equal(foreignPreview.requiredLevel, 3);
assert.equal(foreignPreview.levelUnlocked, false);
assert.equal(foreignPreview.baseServings, 2, "Foreign dishes still prepare 2 servings unless explicitly dangerous");
foreignLockState.cooking.xp = 12;
foreignDerived = survivalEngine.calculate(foreignLockState, workbook);
foreignPreview = survivalEngine.previewCookingCheck(foreignLockState, workbook, cookingConfig("Gorak Ash-Roast"), foreignDerived.skills);
assert.equal(foreignPreview.levelUnlocked, true, "Journeyman must unlock foreign-continent dishes");

const dangerousState = createActionState();
dangerousState.cooking.xp = 12;
stockRecipeIngredients(dangerousState, "Hushback Silver-Reed Broth");
survivalEngine.normalizeCookingState(dangerousState);
let dangerousDerived = survivalEngine.calculate(dangerousState, workbook);
let dangerousPreview = survivalEngine.previewCookingCheck(dangerousState, workbook, cookingConfig("Hushback Silver-Reed Broth"), dangerousDerived.skills);
assert.equal(dangerousPreview.difficulty.key, "dangerous");
assert.equal(dangerousPreview.requiredLevel, 4);
assert.equal(dangerousPreview.levelUnlocked, false, "Journeyman cannot cook explicitly dangerous dishes");
assert.equal(dangerousPreview.baseServings, 1, "Explicitly dangerous dishes prepare only 1 serving");
dangerousState.cooking.xp = 18;
dangerousState.cooking.ownedUtensils = ["Silver Reed"];
dangerousDerived = survivalEngine.calculate(dangerousState, workbook);
dangerousPreview = survivalEngine.previewCookingCheck(dangerousState, workbook, cookingConfig("Hushback Silver-Reed Broth"), dangerousDerived.skills);
assert.equal(dangerousPreview.levelUnlocked, true, "Hearthwright must unlock explicitly dangerous dishes");
assert.equal(dangerousPreview.specialtyPresent, true);
assert.equal(dangerousPreview.rollMode, "normal");

dangerousState.cooking.ownedUtensils = [];
dangerousPreview = survivalEngine.previewCookingCheck(dangerousState, workbook, cookingConfig("Hushback Silver-Reed Broth"), dangerousDerived.skills);
assert.equal(dangerousPreview.rollMode, "disadvantage", "Missing a specialty utensil must impose disadvantage");

const legendaryState = createActionState();
legendaryState.cooking.xp = 18;
stockRecipeIngredients(legendaryState, "Iril Candle-Pear ✦");
survivalEngine.normalizeCookingState(legendaryState);
let legendaryDerived = survivalEngine.calculate(legendaryState, workbook);
let legendaryPreview = survivalEngine.previewCookingCheck(legendaryState, workbook, cookingConfig("Iril Candle-Pear ✦"), legendaryDerived.skills);
assert.equal(legendaryPreview.difficulty.key, "masterwork");
assert.equal(legendaryPreview.difficulty.legendary, true);
assert.equal(legendaryPreview.requiredLevel, 5);
assert.equal(legendaryPreview.levelUnlocked, false);
assert.equal(legendaryPreview.dc, 85);
assert.equal(legendaryPreview.time, "2-4 hours");
assert.equal(legendaryPreview.baseServings, 1);
legendaryState.cooking.xp = 25;
legendaryDerived = survivalEngine.calculate(legendaryState, workbook);
legendaryPreview = survivalEngine.previewCookingCheck(legendaryState, workbook, cookingConfig("Iril Candle-Pear ✦"), legendaryDerived.skills);
assert.equal(legendaryPreview.levelUnlocked, true, "Master Cook must unlock Legendary dishes");

const journeymanState = createActionState();
journeymanState.cooking.xp = 12;
stockRecipeIngredients(journeymanState, "Brumox Winter Pot");
survivalEngine.normalizeCookingState(journeymanState);
const journeymanDerived = survivalEngine.calculate(journeymanState, workbook);
const regionalSuccess = survivalEngine.rollCookingCheck(
  journeymanState,
  workbook,
  cookingConfig("Brumox Winter Pot"),
  journeymanDerived.skills,
  () => 0.9,
);
assert.equal(regionalSuccess.becomesFamiliar, true, "Journeyman success must familiarize a regional recipe");
survivalEngine.recordCookingResult(journeymanState, workbook, regionalSuccess, journeymanDerived.skills);
assert.ok(journeymanState.cooking.familiarRecipes.includes("Brumox Winter Pot"));
const familiarPreview = survivalEngine.previewCookingCheck(journeymanState, workbook, cookingConfig("Brumox Winter Pot", { ingredientSource: "buy" }), journeymanDerived.skills);
assert.equal(familiarPreview.baseDc, 35, "A familiar regional recipe must use the familiar DC");

const hearthwrightState = createActionState();
hearthwrightState.cooking.xp = 18;
hearthwrightState.cooking.cookingKitOwned = true;
hearthwrightState.cooking.ownedUtensils = ["Silver Reed"];
stockRecipeIngredients(hearthwrightState, "Hushback Silver-Reed Broth");
survivalEngine.normalizeCookingState(hearthwrightState);
const hearthwrightDerived = survivalEngine.calculate(hearthwrightState, workbook);
const hearthwrightRoll = survivalEngine.rollCookingCheck(
  hearthwrightState,
  workbook,
  cookingConfig("Hushback Silver-Reed Broth", { cookingKit: true }),
  hearthwrightDerived.skills,
  () => 0.8,
);
assert.equal(hearthwrightRoll.usedHearthwright, true);
assert.equal(hearthwrightRoll.preparedServings, 3, "Hearthwright strong success must add 2 to a dangerous dish's 1 serving");
survivalEngine.recordCookingResult(hearthwrightState, workbook, hearthwrightRoll, hearthwrightDerived.skills);
assert.equal(survivalEngine.calculate(hearthwrightState, workbook).cooking.hearthwrightAvailable, false);

const paymentState = createActionState();
paymentState.cooking.xp = 3;
paymentState.currency = { copper: 0, silver: 0, gold: 1, platinum: 0 };
survivalEngine.normalizeCookingState(paymentState);
const paymentDerived = survivalEngine.calculate(paymentState, workbook);
const paidRoll = survivalEngine.rollCookingCheck(
  paymentState,
  workbook,
  cookingConfig("Lysael Glassfin Parcels", { ingredientSource: "buy" }),
  paymentDerived.skills,
  () => 0.9,
);
assert.equal(paidRoll.accepted, true);
const paidRecord = survivalEngine.recordCookingResult(paymentState, workbook, paidRoll, paymentDerived.skills);
assert.equal(paidRecord.costPaid, 7, "Buying ingredients must charge the dish's SP price");
assert.deepEqual(paymentState.currency, { copper: 0, silver: 3, gold: 0, platinum: 0 }, "Payments must spend silver first and break higher coins when required");

const insufficientState = createActionState();
insufficientState.cooking.xp = 3;
insufficientState.currency = { copper: 0, silver: 0, gold: 0, platinum: 0 };
survivalEngine.normalizeCookingState(insufficientState);
const insufficientDerived = survivalEngine.calculate(insufficientState, workbook);
const insufficientRoll = survivalEngine.rollCookingCheck(
  insufficientState,
  workbook,
  cookingConfig("Lysael Glassfin Parcels", { ingredientSource: "buy" }),
  insufficientDerived.skills,
  () => 0.9,
);
assert.equal(insufficientRoll.accepted, false);
assert.equal(insufficientRoll.reason, "insufficient-funds");

const kitState = createActionState();
kitState.currency = { copper: 0, silver: 0, gold: 20, platinum: 0 };
survivalEngine.normalizeCookingState(kitState);
const kitPurchase = survivalEngine.buyCookingKit(kitState);
assert.equal(kitPurchase.accepted, true);
assert.equal(kitPurchase.costPaid, 200, "Cooking Kit must cost 20 GP or 200 SP");
assert.equal(kitState.cooking.cookingKitOwned, true);
assert.deepEqual(kitState.currency, { copper: 0, silver: 0, gold: 0, platinum: 0 });
assert.equal(survivalEngine.undoLastCookingAction(kitState).accepted, true, "Cooking Kit purchase must be undoable");
assert.equal(kitState.cooking.cookingKitOwned, false);
assert.equal(JSON.stringify(kitState.currency), JSON.stringify({ copper: 0, silver: 0, gold: 20, platinum: 0 }));

const masterCookState = createActionState();
masterCookState.cooking.xp = 25;
stockRecipeIngredients(masterCookState, "Lysael Glassfin Parcels");
survivalEngine.normalizeCookingState(masterCookState);
const masterDerived = survivalEngine.calculate(masterCookState, workbook);
const firstMasterRoll = survivalEngine.rollCookingCheck(masterCookState, workbook, cookingConfig("Lysael Glassfin Parcels"), masterDerived.skills, () => 0.4);
const rerollResult = survivalEngine.rerollCookingCheck(masterCookState, workbook, firstMasterRoll, masterDerived.skills, () => 0.9);
assert.equal(rerollResult.accepted, true, "Master Cook must be able to reroll once per long rest");
assert.equal(rerollResult.result.rerolled, true);
assert.equal(survivalEngine.calculate(masterCookState, workbook).cooking.rerollAvailable, false);
assert.equal(
  survivalEngine.rerollCookingCheck(masterCookState, workbook, rerollResult.result, masterDerived.skills, () => 0.2).accepted,
  false,
  "Master Cook cannot reroll twice in the same rest",
);


const craftingEngine = context.window.AmutsuEngine;
const craftingState = JSON.parse(JSON.stringify(workbook.defaultState));
craftingEngine.normalizeCraftingState(craftingState);
assert.equal(craftingState.schemaVersion, 7);
craftingEngine.changeCraftingMaterial(craftingState, "MAT-001", 1);
craftingEngine.changeCraftingMaterial(craftingState, "MAT-008", 1);
craftingState.crafting.disciplineBonuses.Fieldcraft = 10;
craftingState.crafting.ownedToolKits.Fieldcraft = true;
let craftingPreview = craftingEngine.previewCraftingCheck(craftingState, workbook, {
  recipeId: "BSC-01",
  selections: { 0: "MAT-001", 1: "MAT-008" },
  assistant: false,
  workshop: false,
});
assert.equal(craftingPreview.canAttempt, true, "Owned matching bundles must unlock a recipe");
assert.equal(craftingPreview.dc, 40);
assert.equal(craftingPreview.modifier, 35, "Discipline and correct tool kit bonuses must combine");
let craftingRoll = craftingEngine.rollCraftingCheck(craftingState, workbook, craftingPreview.config, () => 0.49);
assert.equal(craftingRoll.outcome, "strong-success");
assert.equal(craftingRoll.outputQuantity, 2, "A strong consumable craft must create one extra unit");
let craftingRecord = craftingEngine.recordCraftingResult(craftingState, workbook, craftingRoll);
assert.equal(craftingRecord.accepted, true);
assert.equal(craftingState.crafting.materialInventory["MAT-001"], undefined);
assert.equal(craftingState.crafting.materialInventory["MAT-008"], undefined);
assert.equal(craftingState.inventory.find((entry) => entry.name === "Ammunition Bundle")?.quantity, 2);
assert.equal(craftingEngine.undoLastCraftingAction(craftingState).accepted, true);
assert.equal(craftingState.crafting.materialInventory["MAT-001"], 1);
assert.equal(craftingState.crafting.materialInventory["MAT-008"], 1);
assert.equal(craftingState.inventory.some((entry) => entry.name === "Ammunition Bundle"), false);

const normalFailureState = JSON.parse(JSON.stringify(workbook.defaultState));
craftingEngine.changeCraftingMaterial(normalFailureState, "MAT-001", 1);
craftingEngine.changeCraftingMaterial(normalFailureState, "MAT-008", 1);
craftingRoll = craftingEngine.rollCraftingCheck(normalFailureState, workbook, {
  recipeId: "BSC-01",
  selections: { 0: "MAT-001", 1: "MAT-008" },
}, () => 0.3);
assert.equal(craftingRoll.outcome, "failure");
craftingEngine.recordCraftingResult(normalFailureState, workbook, craftingRoll);
assert.equal(normalFailureState.crafting.materialInventory["MAT-001"], 1, "Normal failure must preserve materials");
assert.equal(normalFailureState.crafting.materialInventory["MAT-008"], 1, "Normal failure must preserve materials");

const majorFailureState = JSON.parse(JSON.stringify(workbook.defaultState));
craftingEngine.changeCraftingMaterial(majorFailureState, "MAT-001", 1);
craftingEngine.changeCraftingMaterial(majorFailureState, "MAT-008", 1);
craftingRoll = craftingEngine.rollCraftingCheck(majorFailureState, workbook, {
  recipeId: "BSC-01",
  selections: { 0: "MAT-001", 1: "MAT-008" },
}, () => 0.1);
assert.equal(craftingRoll.outcome, "major-failure");
craftingEngine.recordCraftingResult(majorFailureState, workbook, craftingRoll);
assert.equal(
  Number(majorFailureState.crafting.materialInventory["MAT-001"] || 0) + Number(majorFailureState.crafting.materialInventory["MAT-008"] || 0),
  1,
  "Failure by 20+ must lose exactly one Common or Uncommon bundle",
);

const blueprintState = JSON.parse(JSON.stringify(workbook.defaultState));
craftingEngine.changeCraftingMaterial(blueprintState, "MAT-001", 1);
craftingEngine.changeCraftingMaterial(blueprintState, "MAT-029", 1);
craftingPreview = craftingEngine.previewCraftingCheck(blueprintState, workbook, {
  recipeId: "UTL-02",
  selections: { 0: "MAT-001", 1: "MAT-029" },
});
assert.equal(craftingPreview.blueprintRequired, true);
assert.equal(craftingPreview.canAttempt, false);
assert.match(craftingPreview.lockReason, /blueprint/i);
craftingEngine.setCraftingBlueprint(blueprintState, "UTL-02", true);
craftingPreview = craftingEngine.previewCraftingCheck(blueprintState, workbook, {
  recipeId: "UTL-02",
  selections: { 0: "MAT-001", 1: "MAT-029" },
});
assert.equal(craftingPreview.canAttempt, true, "Known blueprint and sufficient cumulative bundles must unlock a Rare recipe");

const projectState = JSON.parse(JSON.stringify(workbook.defaultState));
craftingPreview = craftingEngine.previewCraftingCheck(projectState, workbook, { recipeId: "SCR-05" });
assert.equal(craftingPreview.project, true);
assert.equal(craftingPreview.canAttempt, false, "Legendary projects must not use a normal one-roll craft");

const recoveryState = JSON.parse(JSON.stringify(workbook.defaultState));
let recoveryRoll = craftingEngine.rollCraftingRecovery(recoveryState, {
  bonus: 0,
  help: false,
  maximumRarity: "Rare",
  sourceLabel: "Ruined laboratory",
}, () => 0.99);
assert.equal(recoveryRoll.rarity, "Rare", "Natural 96-100 must respect the source rarity cap");
const uniqueRecoveryRoll = craftingEngine.rollCraftingRecovery(recoveryState, { bonus: 20, maximumRarity: "Unique", sourceLabel: "Named mythic creature" }, () => 0.99);
assert.equal(uniqueRecoveryRoll.rarity, "Unique", "A 111+ result from a Unique source must support a Unique bundle");
let recoveryRecord = craftingEngine.recordCraftingRecovery(recoveryState, workbook, recoveryRoll, "MAT-015");
assert.equal(recoveryRecord.accepted, true);
assert.equal(recoveryState.crafting.materialInventory["MAT-015"], 1);
assert.equal(craftingEngine.undoLastCraftingAction(recoveryState).accepted, true);
assert.equal(recoveryState.crafting.materialInventory["MAT-015"], undefined);

const spreadsheetPaste = [
  "Item\tRarity\tType\tPhys Dmg\tMag Dmg\tCR%\tSTR\tSPD\tWeight\tValue\tGoldMulti\tTags",
  "Club\tCommon\tMelee\t1d4 Bludgeoning\t-\t0%\t1\t-\t1.2\t10\t0%\tLight, Bludgeoning",
  "Dagger of the Viper\tUncommon\tMelee\t1d4 Piercing\t1d6 Poison\t5%\t-\t1\t0.5\t1,200\t10%\tFinesse, Light",
].join("\n");
const parsedItems = parseSpreadsheetItems(spreadsheetPaste);
assert.equal(parsedItems.globalErrors.length, 0, "Valid spreadsheet paste must parse without global errors");
assert.equal(parsedItems.rows.length, 2, "Spreadsheet rows were not detected");
assert.equal(parsedItems.rows[1].values.criticalChance, 0.05, "Critical percentages must convert to decimals");
assert.equal(parsedItems.rows[1].values.goldMultiplier, 0.1, "Multiplier percentages must convert to decimals");
assert.equal(parsedItems.rows[1].values.value, 1200, "Formatted numeric values must be normalized");
assert.equal(parsedItems.rows[0].values.speed, "–", "Dash statistics must remain no-bonus markers");
assert.match(ITEM_IMPORT_HEADER, /Phys Dmg\tMag Dmg\tCR%/, "Supported spreadsheet header is incomplete");

const importPlan = buildItemImportPlan(
  parsedItems,
  [{ id: "existing-club", sort_order: 0, data: { name: "Club", type: "Melee", durability: 60 } }],
  "upsert",
);
assert.equal(importPlan.counts.update, 1, "Matching names must be prepared as updates");
assert.equal(importPlan.counts.insert, 1, "New names must be prepared as inserts");
assert.equal(importPlan.entries[0].data.durability, 60, "Unmapped existing fields must survive partial spreadsheet updates");
const bulkPayload = createBulkImportPayload(importPlan);
assert.equal(bulkPayload.length, 2, "Bulk payload must contain every actionable row");
assert.equal(bulkPayload[0].id, "existing-club", "Update payload must retain the existing item id");

const completeWorkbookPaste = [
  ITEM_IMPORT_HEADER,
  ...workbook.items.map((item) => ITEM_IMPORT_FIELDS.map((field) => {
    const value = item[field.key];
    if (value == null) return "";
    if (field.kind === "percent" && typeof value === "number") return `${value * 100}%`;
    return String(value);
  }).join("\t")),
].join("\n");
const completeWorkbookParse = parseSpreadsheetItems(completeWorkbookPaste);
assert.equal(completeWorkbookParse.rows.length, workbook.items.length, "The full item catalogue must paste without losing rows");
assert.equal(completeWorkbookParse.globalErrors.length, 0, "The full item catalogue paste must have no global errors");
assert.equal(completeWorkbookParse.rows.filter((row) => row.errors.length).length, 0, "Every workbook item field must be accepted by the importer");

const duplicatePaste = parseSpreadsheetItems("Item\tType\nEcho Blade\tMelee\nEcho Blade\tMelee");
const duplicatePlan = buildItemImportPlan(duplicatePaste, [], "upsert");
assert.equal(duplicatePlan.counts.skip, 1, "Earlier duplicate pasted names must be skipped in update mode");
assert.equal(duplicatePlan.counts.insert, 1, "The final duplicate pasted row must remain actionable");
const createAllPlan = buildItemImportPlan(duplicatePaste, [], "create-all");
assert.equal(createAllPlan.counts.insert, 2, "Create-all mode must preserve intentional duplicate names");

const browserSources = [
  portalSource,
  fs.readFileSync(path.join(root, "src/config.js"), "utf8"),
].join("\n");
assert.doesNotMatch(
  browserSources,
  /service[_-]?role/i,
  "A service-role reference must never be present in browser code",
);

function createMemoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
}

const portalStorage = createMemoryStorage();
assert.equal(savePortalLocation(portalStorage, "player-1", "editor", "character-9"), true);
assert.deepEqual(loadPortalLocation(portalStorage, "player-1"), {
  view: "editor",
  activeCharacterId: "character-9",
});
assert.equal(loadPortalLocation(portalStorage, "player-2"), null);
assert.equal(savePortalLocation(portalStorage, "player-1", "characters", "character-9"), true);
assert.equal(loadPortalLocation(portalStorage, "player-1"), null);
savePortalLocation(portalStorage, "player-1", "editor", "character-9");
assert.equal(clearPortalLocation(portalStorage, "player-2"), false);
assert.ok(loadPortalLocation(portalStorage, "player-1"));
assert.equal(clearPortalLocation(portalStorage, "player-1"), true);
assert.equal(loadPortalLocation(portalStorage, "player-1"), null);

assert.equal(
  shouldSynchronizeForAuthChange({
    event: "TOKEN_REFRESHED",
    previousUserId: "player-1",
    nextUserId: "player-1",
  }),
  false,
  "Token refreshes for the same user must not rebuild the editor",
);
assert.equal(
  shouldSynchronizeForAuthChange({
    event: "SIGNED_IN",
    previousUserId: "player-1",
    nextUserId: "player-1",
  }),
  false,
  "Repeated same-user sign-in events must not rebuild the editor",
);
assert.equal(
  shouldSynchronizeForAuthChange({
    event: "SIGNED_IN",
    previousUserId: null,
    nextUserId: "player-1",
  }),
  true,
);
assert.equal(
  shouldSynchronizeForAuthChange({
    event: "SIGNED_IN",
    previousUserId: "player-1",
    nextUserId: "dm-1",
  }),
  true,
);
assert.equal(
  shouldSynchronizeForAuthChange({
    event: "SIGNED_OUT",
    previousUserId: "player-1",
    nextUserId: null,
  }),
  true,
);
assert.equal(
  shouldSynchronizeForAuthChange({
    event: "PASSWORD_RECOVERY",
    previousUserId: "player-1",
    nextUserId: "player-1",
  }),
  true,
);
assert.equal(
  isNewerCharacterRecord(
    { updated_at: "2026-07-20T10:00:01.000Z" },
    { updated_at: "2026-07-20T10:00:00.000Z" },
  ),
  true,
);
assert.equal(
  isNewerCharacterRecord(
    { updated_at: "2026-07-20T10:00:00.000Z" },
    { updated_at: "2026-07-20T10:00:00.000Z" },
  ),
  false,
);
assert.equal(
  isNewerCharacterRecord(
    { updated_at: "2026-07-20T10:00:00.123456+00:00" },
    { updated_at: "2026-07-20T10:00:00.123111+00:00" },
  ),
  true,
  "Sub-millisecond database updates must be compared without losing precision",
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

const realtimeMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260720000000_enable_character_realtime.sql"),
  "utf8",
);
assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.characters/i);
assert.match(realtimeMigration, /pg_publication_tables/i);

const bulkImportMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260720001000_bulk_import_catalogue_items.sql"),
  "utf8",
);
assert.match(bulkImportMigration, /create or replace function public\.bulk_import_catalogue_items/i);
assert.match(bulkImportMigration, /security definer/i);
assert.match(bulkImportMigration, /not public\.is_dm\(\)/i);
assert.match(bulkImportMigration, /jsonb_array_length\(p_rows\) > 1000/i);
assert.match(bulkImportMigration, /grant execute on function public\.bulk_import_catalogue_items\(jsonb\) to authenticated/i);

const hearthcraftPantryMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260721002000_hearthcraft_ingredient_pantry_and_region_rules.sql"),
  "utf8",
);
assert.match(hearthcraftPantryMigration, /rareDangerous/i);
assert.match(hearthcraftPantryMigration, /legendary/i);
assert.match(hearthcraftPantryMigration, /Home Region/i);
assert.match(hearthcraftPantryMigration, /20 GP/i);

console.log("Project checks passed.");
