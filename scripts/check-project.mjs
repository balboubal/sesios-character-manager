import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
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
  "src/styles.css",
  "src/session-state.js",
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
assert.match(bridge, /request-long-rest/, "Character Sheet Long Rest control is missing");
assert.match(bridge, /request-advance-day/, "Advance Day control is missing");
assert.match(bridge, /request-selected-hearth-meal/, "Hearth Boon activation control is missing");
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

const portalSource = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const portalStylesheet = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
assert.match(portalSource, /handleAuthStateChange/, "Auth-event gating is missing");
assert.match(portalSource, /document\.addEventListener\("visibilitychange"/, "Return-to-tab update checks are missing");
assert.match(portalSource, /data-action="check-character-updates"/, "Manual update check is missing");
assert.match(portalSource, /data-action="load-remote-update"/, "Remote update loading control is missing");
assert.match(portalSource, /requestSheetSaveFlush/, "Pending iframe edits must flush before update checks");
assert.match(portalSource, /select\("id,updated_at,updated_by"\)/, "Lightweight character version query is missing");
assert.match(portalSource, /characterId=\$\{encodeURIComponent\(character\.id\)\}/, "Character-specific iframe location is missing");
assert.match(portalSource, /viewerRole=\$\{isDm\(\) \? "dm" : "player"\}/, "DM history role bridge is missing");
assert.match(portalStylesheet, /\.editor-update-banner\s*{/, "Remote update banner styling is missing");
assert.match(portalStylesheet, /\.sheet-frame\s*{[^}]*grid-row:\s*3/s, "The iframe must retain the flexible editor grid row");

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

const survivalEngine = context.window.AmutsuEngine;
const legacySurvivalState = JSON.parse(JSON.stringify(workbook.defaultState));
legacySurvivalState.schemaVersion = 1;
delete legacySurvivalState.hunger.currentDay;
delete legacySurvivalState.hunger.foodGainedToday;
delete legacySurvivalState.hunger.eatRationToday;
delete legacySurvivalState.hearth.selectedDish;
delete legacySurvivalState.survivalHistory;
delete legacySurvivalState.survivalHistorySequence;
survivalEngine.normalizeSurvivalState(legacySurvivalState);
assert.equal(legacySurvivalState.schemaVersion, 2, "Legacy survival state must migrate to schema 2");
assert.equal(legacySurvivalState.hunger.days.length, 1, "Blank legacy hunger rows must be removed");
assert.equal(legacySurvivalState.hearth.log.length, 1, "Blank legacy meal rows must be removed");
assert.equal(legacySurvivalState.hunger.currentDay, 2);
assert.equal(legacySurvivalState.survivalHistory.length, 3, "Legacy day, meal, and used-boon events must migrate");

function createActionState() {
  const state = JSON.parse(JSON.stringify(workbook.defaultState));
  state.schemaVersion = 2;
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
    foodGained: 2,
    availableFood: 9,
    rationEaten: 1,
    foodAfter: 8,
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
assert.equal(survivalEngine.calculate(dayActionState, workbook).hunger.currentFood, 8);
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

console.log("Project checks passed.");
