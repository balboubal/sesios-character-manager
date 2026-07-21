(function attachAmutsuEngine(global) {
  "use strict";

  const CLASS_RULES = {
    Wizard: {
      hpBase: 9,
      hpVitalityRate: 0.04,
      armorBonus: 0,
      resistanceBonus: 1,
      evasionBase: 18,
      includeBonusEvasion: true,
      spellSaveBase: 40,
      manaRate: 3.41863,
      manaBase: 40,
      spellDamage: "full",
    },
    Paladin: {
      hpBase: 13,
      hpVitalityRate: 0.1,
      armorBonus: 1,
      resistanceBonus: 1,
      evasionBase: 14,
      includeBonusEvasion: true,
      spellSaveBase: 30,
      manaRate: 1.71863,
      manaBase: 0,
      spellDamage: "half",
    },
    Cleric: {
      hpBase: 8,
      hpVitalityRate: 0.045,
      armorBonus: 0,
      resistanceBonus: 0,
      evasionBase: 17,
      includeBonusEvasion: true,
      spellSaveBase: 35,
      manaRate: 3.41863,
      manaBase: 40,
      spellDamage: "cleric",
    },
    "Blood Hunter": {
      hpBase: 10,
      hpVitalityRate: 0.08,
      armorBonus: 1,
      resistanceBonus: 0,
      evasionBase: 20,
      includeBonusEvasion: true,
      spellSaveBase: 40,
      manaRate: 1.71863,
      manaBase: 0,
      spellDamage: "half",
    },
    Bard: {
      hpBase: 11,
      hpVitalityRate: 0.07,
      armorBonus: 1,
      resistanceBonus: 1,
      evasionBase: 20,
      includeBonusEvasion: false,
      spellSaveBase: 40,
      manaRate: 3.41863,
      manaBase: 40,
      spellDamage: "full",
    },
    Fighter: {
      hpBase: 12,
      hpVitalityRate: 0.08,
      armorBonus: 2,
      resistanceBonus: 1,
      evasionBase: 15,
      includeBonusEvasion: false,
      spellSaveBase: 30,
      manaRate: 0,
      manaBase: 0,
      spellDamage: "equipmentOnly",
    },
    Rogue: {
      hpBase: 10,
      hpVitalityRate: 0.05,
      armorBonus: 0,
      resistanceBonus: 0,
      evasionBase: 24,
      includeBonusEvasion: false,
      spellSaveBase: 40,
      manaRate: 0,
      manaBase: 0,
      spellDamage: "equipmentOnly",
    },
  };

  const PERSONALITY_TRAIT_LIMIT = 70;
  const CHARACTER_XP_LEVELS = Object.freeze([
    { level: 0, totalXp: 0, xpToNext: 25 },
    { level: 1, totalXp: 25, xpToNext: 45 },
    { level: 2, totalXp: 70, xpToNext: 60 },
    { level: 3, totalXp: 130, xpToNext: 90 },
    { level: 4, totalXp: 220, xpToNext: 130 },
    { level: 5, totalXp: 350, xpToNext: 160 },
    { level: 6, totalXp: 510, xpToNext: 210 },
    { level: 7, totalXp: 720, xpToNext: 380 },
    { level: 8, totalXp: 1100, xpToNext: 420 },
    { level: 9, totalXp: 1520, xpToNext: 560 },
    { level: 10, totalXp: 2080, xpToNext: 680 },
    { level: 11, totalXp: 2760, xpToNext: 940 },
    { level: 12, totalXp: 3700, xpToNext: 1260 },
    { level: 13, totalXp: 4960, xpToNext: 1740 },
    { level: 14, totalXp: 6700, xpToNext: 2260 },
    { level: 15, totalXp: 8960, xpToNext: 2740 },
    { level: 16, totalXp: 11700, xpToNext: 3360 },
    { level: 17, totalXp: 15060, xpToNext: 4040 },
    { level: 18, totalXp: 19100, xpToNext: 4860 },
    { level: 19, totalXp: 23960, xpToNext: 5500 },
    { level: 20, totalXp: 29460, xpToNext: 0 },
  ]);
  const MAX_CHARACTER_LEVEL = CHARACTER_XP_LEVELS[CHARACTER_XP_LEVELS.length - 1].level;
  const MAX_CHARACTER_XP = CHARACTER_XP_LEVELS[CHARACTER_XP_LEVELS.length - 1].totalXp;
  const CENTRAL_COOKING_REGIONS = Object.freeze(["Asura", "Karrnath", "Fittoa", "Shirone", "Ronoa"]);
  const COOKING_LEVELS = Object.freeze([
    { level: 0, title: "Untrained", bonus: 0, threshold: 0, benefit: "Basic camp meals only." },
    { level: 1, title: "Hearthhand", bonus: 5, threshold: 3, benefit: "Cook familiar dishes from your selected home region." },
    { level: 2, title: "Camp Cook", bonus: 10, threshold: 7, benefit: "Cook dishes from other Central Continent regions and ignore one ordinary camp condition." },
    { level: 3, title: "Journeyman", bonus: 15, threshold: 12, benefit: "Cook foreign-continent dishes. A regional recipe becomes familiar after one success." },
    { level: 4, title: "Hearthwright", bonus: 20, threshold: 18, benefit: "Cook explicitly rare or dangerous dishes. Strong success creates 2 extra servings once per long rest." },
    { level: 5, title: "Master Cook", bonus: 25, threshold: 25, benefit: "Cook Legendary Masterchef dishes and reroll one Cooking Check per long rest; use the new result." },
  ]);
  const COOKING_DIFFICULTIES = Object.freeze({
    basic: { key: "basic", label: "Basic", dc: 20, time: "30 minutes", requiredLevel: 0 },
    familiar: { key: "familiar", label: "Familiar", dc: 35, time: "1 hour", requiredLevel: 1 },
    regional: { key: "regional", label: "Regional", dc: 50, time: "1 hour", requiredLevel: 2 },
    rare: { key: "rare", label: "Rare or Dangerous", dc: 70, time: "2 hours", requiredLevel: 3 },
    dangerous: { key: "dangerous", label: "Rare or Dangerous", dc: 70, time: "2 hours", requiredLevel: 4 },
    masterwork: { key: "masterwork", label: "Masterchef Dish · Legendary", dc: 85, time: "2-4 hours", requiredLevel: 5 },
  });

  const CRAFTING_DISCIPLINES = Object.freeze([
    "Alchemy",
    "Forgecraft",
    "Runecraft",
    "Scribing",
    "Fieldcraft",
    "Harvesting",
  ]);
  const CRAFTING_RARITIES = Object.freeze([
    "Common",
    "Uncommon",
    "Rare",
    "Very Rare",
    "Legendary",
    "Unique",
  ]);

  function craftingRarityRank(rarity) {
    const index = CRAFTING_RARITIES.indexOf(String(rarity || "Common"));
    return index >= 0 ? index : 0;
  }

  function ensureCraftingContainers(state) {
    if (!state.crafting || typeof state.crafting !== "object") state.crafting = {};
    if (!state.crafting.materialInventory || typeof state.crafting.materialInventory !== "object" || Array.isArray(state.crafting.materialInventory)) {
      state.crafting.materialInventory = {};
    }
    if (!state.crafting.disciplineBonuses || typeof state.crafting.disciplineBonuses !== "object") {
      state.crafting.disciplineBonuses = {};
    }
    if (!state.crafting.ownedToolKits || typeof state.crafting.ownedToolKits !== "object") {
      state.crafting.ownedToolKits = {};
    }
    if (!Array.isArray(state.crafting.knownBlueprints)) state.crafting.knownBlueprints = [];
    if (!Array.isArray(state.crafting.history)) state.crafting.history = [];
    if (!state.crafting.legendaryProject || typeof state.crafting.legendaryProject !== "object" || Array.isArray(state.crafting.legendaryProject)) {
      state.crafting.legendaryProject = {};
    }
    state.crafting.legendaryProject = {
      conceptId: String(state.crafting.legendaryProject.conceptId || ""),
      customName: String(state.crafting.legendaryProject.customName || ""),
      designComplete: state.crafting.legendaryProject.designComplete === true,
      assemblyComplete: state.crafting.legendaryProject.assemblyComplete === true,
      awakeningComplete: state.crafting.legendaryProject.awakeningComplete === true,
      notes: String(state.crafting.legendaryProject.notes || ""),
    };
    CRAFTING_DISCIPLINES.forEach((discipline) => {
      state.crafting.disciplineBonuses[discipline] = numberValue(state.crafting.disciplineBonuses[discipline]);
      state.crafting.ownedToolKits[discipline] = state.crafting.ownedToolKits[discipline] === true;
    });
    Object.keys(state.crafting.materialInventory).forEach((materialId) => {
      const quantity = Math.max(0, Math.floor(numberValue(state.crafting.materialInventory[materialId])));
      if (quantity) state.crafting.materialInventory[materialId] = quantity;
      else delete state.crafting.materialInventory[materialId];
    });
    state.crafting.sequence = Math.max(0, Math.floor(numberValue(state.crafting.sequence)));
  }

  function nextCraftingId(state, prefix) {
    ensureCraftingContainers(state);
    state.crafting.sequence += 1;
    return `${prefix}-${state.crafting.sequence}`;
  }

  function normalizeCraftingState(state) {
    ensureCraftingContainers(state);
    state.crafting.knownBlueprints = [...new Set(
      state.crafting.knownBlueprints.map((value) => String(value || "").trim()).filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    state.crafting.history = state.crafting.history
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        ...entry,
        id: entry.id || nextCraftingId(state, "craft"),
        createdAt: entry.createdAt || new Date().toISOString(),
      }));
    state.crafting.history.forEach((entry) => {
      const match = String(entry.id || "").match(/-(\d+)$/);
      if (match) state.crafting.sequence = Math.max(state.crafting.sequence, Number(match[1]));
    });
    state.schemaVersion = Math.max(7, Math.floor(numberValue(state.schemaVersion)));
    return state.crafting;
  }

  function craftingMaterialIndex(data) {
    return new Map((data.crafting?.materials || []).map((material) => [String(material.id || ""), material]));
  }

  function craftingMaterialTags(material) {
    return new Set([
      ...(Array.isArray(material?.categoryTags) ? material.categoryTags : []),
      ...(Array.isArray(material?.effectTags) ? material.effectTags : []),
    ].map((tag) => String(tag || "").toLowerCase()));
  }

  function craftingMaterialMatchesAlternative(material, alternative) {
    if (!material || !alternative) return false;
    const materialIds = Array.isArray(alternative.materialIds) ? alternative.materialIds : [];
    if (materialIds.length && !materialIds.includes(material.id)) return false;
    const tags = craftingMaterialTags(material);
    const requiredTags = Array.isArray(alternative.tags) ? alternative.tags : [];
    if (requiredTags.some((tag) => !tags.has(String(tag).toLowerCase()))) return false;
    const anyTags = Array.isArray(alternative.anyTags) ? alternative.anyTags : [];
    if (anyTags.length && !anyTags.some((tag) => tags.has(String(tag).toLowerCase()))) return false;
    return true;
  }

  function craftingMaterialMatchesRequirement(material, requirement) {
    const alternatives = Array.isArray(requirement?.alternatives) ? requirement.alternatives : [];
    return alternatives.some((alternative) => craftingMaterialMatchesAlternative(material, alternative));
  }

  function craftingRequirementOptions(state, data, requirement) {
    const inventory = state.crafting.materialInventory;
    return (data.crafting?.materials || [])
      .filter((material) => numberValue(inventory[material.id]) > 0)
      .filter((material) => craftingMaterialMatchesRequirement(material, requirement))
      .map((material) => ({
        ...material,
        owned: Math.max(0, Math.floor(numberValue(inventory[material.id]))),
        lowerRarity: craftingRarityRank(material.rarity) < craftingRarityRank(requirement.minRarity),
      }))
      .sort((left, right) => {
        const rarityDifference = craftingRarityRank(right.rarity) - craftingRarityRank(left.rarity);
        return rarityDifference || left.name.localeCompare(right.name);
      });
  }

  function calculateCrafting(state, data) {
    normalizeCraftingState(state);
    const materialIndex = craftingMaterialIndex(data);
    const ownedMaterials = Object.entries(state.crafting.materialInventory)
      .map(([materialId, quantity]) => {
        const material = materialIndex.get(materialId);
        if (!material) return null;
        return { ...material, quantity: Math.max(0, Math.floor(numberValue(quantity))) };
      })
      .filter((entry) => entry && entry.quantity > 0)
      .sort((left, right) => left.name.localeCompare(right.name));
    const totalBundles = ownedMaterials.reduce((sum, entry) => sum + entry.quantity, 0);
    const disciplines = (data.crafting?.disciplines || []).map((entry) => ({
      ...entry,
      bonus: numberValue(state.crafting.disciplineBonuses[entry.id]),
      toolOwned: state.crafting.ownedToolKits[entry.id] === true,
    }));
    return {
      ownedMaterials,
      totalBundles,
      knownBlueprints: [...state.crafting.knownBlueprints],
      disciplines,
      history: [...state.crafting.history].reverse(),
      legendaryProject: { ...state.crafting.legendaryProject },
      materialIndex,
    };
  }

  function previewCraftingCheck(state, data, config) {
    const crafting = calculateCrafting(state, data);
    const recipes = data.crafting?.recipes || [];
    const recipe = recipes.find((entry) => entry.id === String(config?.recipeId || "")) || recipes[0] || null;
    if (!recipe) return { accepted: false, reason: "missing-recipe", requirements: [] };
    const selections = config?.selections && typeof config.selections === "object" ? config.selections : {};
    const allocation = new Map();
    const requirements = (recipe.requirements || []).map((requirement, index) => {
      const options = craftingRequirementOptions(state, data, requirement);
      const requested = String(selections[index] || "");
      const selected = options.find((material) => material.id === requested) || options[0] || null;
      if (selected) allocation.set(selected.id, (allocation.get(selected.id) || 0) + Math.max(1, Math.floor(numberValue(requirement.quantity) || 1)));
      return {
        ...requirement,
        index,
        options,
        selected,
        selectedId: selected?.id || "",
        requiredQuantity: Math.max(1, Math.floor(numberValue(requirement.quantity) || 1)),
        lowerRarity: selected?.lowerRarity === true,
      };
    });
    const materialIndex = crafting.materialIndex;
    const allocatedTotals = Object.fromEntries(allocation);
    requirements.forEach((requirement) => {
      const selected = requirement.selected;
      const totalAllocated = selected ? numberValue(allocatedTotals[selected.id]) : 0;
      const owned = selected ? numberValue(state.crafting.materialInventory[selected.id]) : 0;
      requirement.ready = Boolean(selected && owned >= totalAllocated);
      requirement.owned = owned;
      requirement.totalAllocated = totalAllocated;
      requirement.material = selected ? materialIndex.get(selected.id) : null;
    });
    const materialsReady = requirements.every((requirement) => requirement.ready);
    const lowerSubstitute = requirements.some((requirement) => requirement.lowerRarity);
    const blueprintRequired = recipe.blueprintRequired === true;
    const blueprintKnown = !blueprintRequired || state.crafting.knownBlueprints.includes(recipe.id);
    const project = recipe.project === true || recipe.rarity === "Legendary" || numberValue(recipe.dc) <= 0;
    const disciplineBonus = numberValue(state.crafting.disciplineBonuses[recipe.discipline]);
    const toolOwned = state.crafting.ownedToolKits[recipe.discipline] === true;
    const assistant = config?.assistant === true;
    const workshop = config?.workshop === true;
    const modifier = disciplineBonus + (toolOwned ? 25 : 0) + (assistant ? 10 : 0);
    const baseDc = Math.max(0, Math.floor(numberValue(recipe.dc)));
    const dc = baseDc + (lowerSubstitute ? 10 : 0);
    return {
      accepted: materialsReady && blueprintKnown && !project,
      recipe,
      requirements,
      selections: Object.fromEntries(requirements.map((requirement) => [requirement.index, requirement.selectedId])),
      materialsReady,
      blueprintRequired,
      blueprintKnown,
      project,
      lowerSubstitute,
      baseDc,
      dc,
      disciplineBonus,
      toolOwned,
      assistant,
      workshop,
      modifier,
      rollMode: workshop ? "advantage" : "normal",
      canAttempt: materialsReady && blueprintKnown && !project,
      lockReason: project
        ? "Legendary recipes use the three-stage project rules."
        : !blueprintKnown
          ? "This Rare or higher recipe requires a known blueprint."
          : !materialsReady
            ? "One or more required material bundles are missing."
            : "",
      crafting,
      config: {
        recipeId: recipe.id,
        selections: Object.fromEntries(requirements.map((requirement) => [requirement.index, requirement.selectedId])),
        assistant,
        workshop,
      },
    };
  }

  function rollCraftingCheck(state, data, config, randomSource) {
    const preview = previewCraftingCheck(state, data, config);
    if (!preview.canAttempt) return { accepted: false, reason: "requirements", preview };
    const rolls = [randomD100(randomSource)];
    if (preview.rollMode === "advantage") rolls.push(randomD100(randomSource));
    const naturalRoll = preview.rollMode === "advantage" ? Math.max(...rolls) : rolls[0];
    const total = naturalRoll + preview.modifier;
    let outcome = "failure";
    if (naturalRoll <= 5) outcome = "critical-failure";
    else if (naturalRoll >= 96) outcome = "critical-success";
    else if (total >= preview.dc + 20) outcome = "strong-success";
    else if (total >= preview.dc) outcome = "success";
    else if (total <= preview.dc - 20) outcome = "major-failure";
    const success = ["success", "strong-success", "critical-success"].includes(outcome);
    const permanent = preview.recipe.permanent === true;
    const extraOutput = !permanent && ["strong-success", "critical-success"].includes(outcome) ? 1 : 0;
    return {
      accepted: true,
      ...preview,
      rolls,
      naturalRoll,
      total,
      outcome,
      success,
      outputQuantity: success ? Math.max(1, Math.floor(numberValue(preview.recipe.batchYield) || 1)) + extraOutput : 0,
      halfTime: success && outcome === "strong-success" && permanent,
      masterwork: success && outcome === "critical-success" && permanent,
      recorded: false,
    };
  }

  function changeCraftingMaterial(state, materialId, delta) {
    normalizeCraftingState(state);
    const id = String(materialId || "").trim();
    const change = Math.floor(numberValue(delta));
    if (!id || !change) return { accepted: false, reason: "invalid-change" };
    const current = Math.max(0, Math.floor(numberValue(state.crafting.materialInventory[id])));
    const next = Math.max(0, current + change);
    if (next) state.crafting.materialInventory[id] = next;
    else delete state.crafting.materialInventory[id];
    return { accepted: true, materialId: id, previous: current, quantity: next };
  }

  function setCraftingBlueprint(state, recipeId, known) {
    normalizeCraftingState(state);
    const id = String(recipeId || "").trim();
    if (!id) return { accepted: false };
    const next = new Set(state.crafting.knownBlueprints);
    if (known) next.add(id);
    else next.delete(id);
    state.crafting.knownBlueprints = [...next].sort((left, right) => left.localeCompare(right));
    return { accepted: true, known: known === true };
  }

  function applyCraftingMaterialChanges(state, changes, direction) {
    (changes || []).forEach((change) => {
      const quantity = Math.max(0, Math.floor(numberValue(change.quantity)));
      if (!quantity) return;
      changeCraftingMaterial(state, change.materialId, direction * quantity);
    });
  }

  function selectedCraftingMaterialChanges(result) {
    const totals = new Map();
    (result.requirements || []).forEach((requirement) => {
      if (!requirement.selectedId) return;
      totals.set(requirement.selectedId, (totals.get(requirement.selectedId) || 0) + requirement.requiredQuantity);
    });
    return [...totals.entries()].map(([materialId, quantity]) => ({ materialId, quantity }));
  }

  function removeCraftedInventoryQuantity(state, name, quantity) {
    const entry = (state.inventory || []).find((candidate) => candidate.name === name);
    if (!entry) return false;
    const current = Math.max(0, Math.floor(numberValue(entry.quantity)));
    if (current < quantity) return false;
    entry.quantity = current - quantity;
    if (entry.quantity <= 0) Object.assign(entry, createInventoryEntry());
    return true;
  }

  function recordCraftingResult(state, data, result) {
    normalizeCraftingState(state);
    if (!result || result.recorded) return { accepted: false, reason: "already-recorded" };
    const freshPreview = previewCraftingCheck(state, data, result.config || {});
    if (!freshPreview.materialsReady) return { accepted: false, reason: "missing-materials" };
    if (!freshPreview.blueprintKnown) return { accepted: false, reason: "missing-blueprint" };
    const selectedChanges = selectedCraftingMaterialChanges({ requirements: freshPreview.requirements });
    let materialChanges = [];
    let inventoryAdded = null;
    if (result.success) {
      materialChanges = selectedChanges;
      applyCraftingMaterialChanges(state, materialChanges, -1);
      const quantity = Math.max(1, Math.floor(numberValue(result.outputQuantity) || 1));
      for (let index = 0; index < quantity; index += 1) addInventoryItem(state, freshPreview.recipe.name);
      inventoryAdded = { name: freshPreview.recipe.name, quantity };
    } else if (result.outcome === "critical-failure") {
      const loss = selectedChanges.find((change) => {
        const material = freshPreview.crafting.materialIndex.get(change.materialId);
        return material?.rarity !== "Unique";
      });
      if (loss) {
        materialChanges = [{ materialId: loss.materialId, quantity: 1 }];
        applyCraftingMaterialChanges(state, materialChanges, -1);
      }
    } else if (result.outcome === "major-failure") {
      const loss = selectedChanges.find((change) => {
        const material = freshPreview.crafting.materialIndex.get(change.materialId);
        return ["Common", "Uncommon"].includes(material?.rarity);
      });
      if (loss) {
        materialChanges = [{ materialId: loss.materialId, quantity: 1 }];
        applyCraftingMaterialChanges(state, materialChanges, -1);
      }
    }
    const entry = {
      id: nextCraftingId(state, "craft"),
      type: "craft",
      createdAt: new Date().toISOString(),
      recipeId: freshPreview.recipe.id,
      recipeName: freshPreview.recipe.name,
      rarity: freshPreview.recipe.rarity,
      discipline: freshPreview.recipe.discipline,
      naturalRoll: result.naturalRoll,
      rolls: result.rolls,
      total: result.total,
      dc: result.dc,
      outcome: result.outcome,
      outputQuantity: result.success ? result.outputQuantity : 0,
      halfTime: result.halfTime === true,
      masterwork: result.masterwork === true,
      materialChanges,
      inventoryAdded,
    };
    state.crafting.history.push(entry);
    result.recorded = true;
    return { accepted: true, entry, materialChanges, inventoryAdded };
  }

  function craftingRecoveryRarity(total, naturalRoll, maximumRarity) {
    const maximum = String(maximumRarity || "Very Rare");
    const maxRank = craftingRarityRank(maximum);
    let rarity = "None";
    if (total >= 111) rarity = maximum === "Unique" ? "Unique" : "Legendary";
    else if (total >= 96) rarity = "Very Rare";
    else if (total >= 81) rarity = "Rare";
    else if (total >= 61) rarity = "Uncommon";
    else if (total >= 41) rarity = "Common";
    if (naturalRoll <= 5) rarity = rarity === "None" ? "None" : "Common";
    else if (naturalRoll >= 96 && rarity !== "None") {
      rarity = CRAFTING_RARITIES[Math.min(maxRank, craftingRarityRank(rarity) + 1)] || rarity;
    }
    if (rarity !== "None" && craftingRarityRank(rarity) > maxRank) {
      rarity = CRAFTING_RARITIES[maxRank];
    }
    return rarity;
  }

  function rollCraftingRecovery(state, config, randomSource) {
    normalizeCraftingState(state);
    const naturalRoll = randomD100(randomSource);
    const bonus = numberValue(config?.bonus);
    const useKit = state.crafting.ownedToolKits.Harvesting === true && config?.useKit !== false;
    const help = config?.help === true;
    const total = naturalRoll + bonus + (useKit ? 25 : 0) + (help ? 10 : 0);
    const maximumRarity = String(config?.maximumRarity || "Very Rare");
    const rarity = craftingRecoveryRarity(total, naturalRoll, maximumRarity);
    return {
      accepted: true,
      naturalRoll,
      total,
      bonus,
      useKit,
      help,
      maximumRarity,
      rarity,
      sourceLabel: String(config?.sourceLabel || "Recovered source").trim() || "Recovered source",
      recorded: false,
    };
  }

  function recordCraftingRecovery(state, data, result, materialId) {
    normalizeCraftingState(state);
    if (!result || result.recorded) return { accepted: false, reason: "already-recorded" };
    if (result.rarity === "None") return { accepted: false, reason: "no-material" };
    const material = (data.crafting?.materials || []).find((entry) => entry.id === materialId);
    if (!material) return { accepted: false, reason: "missing-material" };
    if (craftingRarityRank(material.rarity) > craftingRarityRank(result.rarity)) {
      return { accepted: false, reason: "rarity-too-high" };
    }
    changeCraftingMaterial(state, material.id, 1);
    const entry = {
      id: nextCraftingId(state, "recover"),
      type: "recovery",
      createdAt: new Date().toISOString(),
      materialId: material.id,
      materialName: material.name,
      quantity: 1,
      rarity: result.rarity,
      naturalRoll: result.naturalRoll,
      total: result.total,
      sourceLabel: result.sourceLabel,
    };
    state.crafting.history.push(entry);
    result.recorded = true;
    return { accepted: true, entry };
  }

  function undoLastCraftingAction(state) {
    normalizeCraftingState(state);
    const entry = state.crafting.history.at(-1);
    if (!entry) return { accepted: false, reason: "empty-history" };
    if (entry.type === "recovery") {
      const current = numberValue(state.crafting.materialInventory[entry.materialId]);
      if (current < numberValue(entry.quantity)) return { accepted: false, reason: "material-used" };
      changeCraftingMaterial(state, entry.materialId, -numberValue(entry.quantity));
    } else if (entry.type === "craft") {
      if (entry.inventoryAdded && !removeCraftedInventoryQuantity(state, entry.inventoryAdded.name, numberValue(entry.inventoryAdded.quantity))) {
        return { accepted: false, reason: "crafted-item-used" };
      }
      applyCraftingMaterialChanges(state, entry.materialChanges, 1);
    }
    state.crafting.history.pop();
    return { accepted: true, entry };
  }

  function numberValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value !== "string" || value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function experienceForLevel(level) {
    const normalized = Math.max(0, Math.min(MAX_CHARACTER_LEVEL, Math.floor(numberValue(level))));
    return CHARACTER_XP_LEVELS[normalized].totalXp;
  }

  function characterExperienceProgress(value) {
    const totalXp = Math.max(0, Math.min(MAX_CHARACTER_XP, Math.floor(numberValue(value))));
    let tier = CHARACTER_XP_LEVELS[0];
    CHARACTER_XP_LEVELS.forEach((candidate) => {
      if (candidate.totalXp <= totalXp) tier = candidate;
    });
    const isMaxLevel = tier.level >= MAX_CHARACTER_LEVEL;
    const currentXp = isMaxLevel ? 0 : totalXp - tier.totalXp;
    const requiredXp = isMaxLevel ? 0 : tier.xpToNext;
    const percent = isMaxLevel
      ? 100
      : Math.max(0, Math.min(100, requiredXp ? (currentXp / requiredXp) * 100 : 0));
    return {
      totalXp,
      level: tier.level,
      currentXp,
      requiredXp,
      nextLevel: isMaxLevel ? null : tier.level + 1,
      percent,
      isMaxLevel,
      levels: CHARACTER_XP_LEVELS,
    };
  }

  function normalizeCharacterProgression(state) {
    if (!state || typeof state !== "object") return characterExperienceProgress(0);
    if (!state.character || typeof state.character !== "object") state.character = {};
    const hasStoredExperience = Object.prototype.hasOwnProperty.call(state.character, "experience") &&
      Number.isFinite(Number(state.character.experience));
    const totalXp = hasStoredExperience
      ? state.character.experience
      : experienceForLevel(state.character.level);
    const progress = characterExperienceProgress(totalXp);
    state.character.experience = progress.totalXp;
    state.character.level = progress.level;
    return progress;
  }

  function isBlank(value) {
    return value === "" || value === null || value === undefined;
  }

  function excelRoundUp(value, digits) {
    const places = Number.isFinite(digits) ? digits : 0;
    const factor = 10 ** places;
    if (!Number.isFinite(value)) return NaN;
    return value >= 0 ? Math.ceil(value * factor) / factor : Math.floor(value * factor) / factor;
  }

  function excelRoundDown(value, digits) {
    const places = Number.isFinite(digits) ? digits : 0;
    const factor = 10 ** places;
    if (!Number.isFinite(value)) return NaN;
    return value >= 0 ? Math.floor(value * factor) / factor : Math.ceil(value * factor) / factor;
  }

  function excelFloor(value, significance) {
    const multiple = Math.abs(numberValue(significance) || 1);
    if (!Number.isFinite(value)) return NaN;
    return Math.floor(value / multiple) * multiple;
  }

  function excelMround(value, multiple) {
    const unit = Math.abs(numberValue(multiple));
    if (!unit || !Number.isFinite(value)) return NaN;
    return Math.round(value / unit) * unit;
  }

  function average(values) {
    const numbers = values.filter((value) => Number.isFinite(value));
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  }

  function formatNumber(value, maximumFractionDigits) {
    if (!Number.isFinite(value)) return "#N/A";
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: maximumFractionDigits == null ? 2 : maximumFractionDigits,
    }).format(value);
  }

  function firstItemIndex(items) {
    const index = new Map();
    items.forEach((item) => {
      const key = String(item.name || "").trim().toLocaleLowerCase("en-US");
      if (!index.has(key)) index.set(key, item);
    });
    return index;
  }

  function itemLookup(index, name) {
    return index.get(String(name || "").trim().toLocaleLowerCase("en-US")) || null;
  }

  function equipmentItems(state, data, itemIndex) {
    return data.equipmentSlots.map((slot) => itemLookup(itemIndex, state.equipment?.[slot.id]));
  }

  function sumItemProperty(items, property, includedIndexes) {
    const allowed = includedIndexes ? new Set(includedIndexes) : null;
    return items.reduce((sum, item, index) => {
      if (!item || (allowed && !allowed.has(index))) return sum;
      return sum + numberValue(item[property]);
    }, 0);
  }

  function abilityModifier(score) {
    const difference = numberValue(score) - 55;
    if (Math.abs(difference) === 0) return 0;
    return excelRoundUp(Math.abs(difference) ** 1.3 / 5, 0) * Math.sign(difference);
  }

  function abilityCost(score) {
    const adjusted = numberValue(score) - 30;
    if (adjusted < 0) return NaN;
    return excelFloor(adjusted ** 1.31, 1);
  }

  function calculateClassProfile(className, context) {
    const {
      level,
      vitality,
      proficiency,
      spellcastingModifier,
      equipmentSums,
      bonuses,
      speedModifier,
    } = context;
    if (!String(className || "").trim()) {
      return {
        maxHealth: bonuses.hitPoints,
        armor: equipmentSums.armor + bonuses.armor,
        resistance: equipmentSums.resistance + bonuses.resistance,
        evasion: Math.max(0, excelRoundDown(equipmentSums.evasion + speedModifier + bonuses.evasion, 0)),
        spellSave: 0,
        maxMana: bonuses.mana,
        spellDamage: level + equipmentSums.magicalDamage + bonuses.spellDamage,
      };
    }
    const rule = CLASS_RULES[className] || CLASS_RULES.Rogue;

    const maxHealth = excelFloor(
      rule.hpBase + level + rule.hpVitalityRate * level * vitality + bonuses.hitPoints,
      1,
    );
    const armor = equipmentSums.armor + bonuses.armor + rule.armorBonus;
    const resistance = equipmentSums.resistance + bonuses.resistance + rule.resistanceBonus;
    const evasion =
      excelRoundDown(
        equipmentSums.evasion + speedModifier + (rule.includeBonusEvasion ? bonuses.evasion : 0),
        0,
      ) + rule.evasionBase;
    const spellSave = excelRoundUp(rule.spellSaveBase + proficiency * 1.5 + spellcastingModifier, 0);
    const maxMana =
      excelMround(rule.manaRate * level ** 1.09414 * 10, 10) + bonuses.mana + rule.manaBase;

    const spellDamage = level + equipmentSums.magicalDamage + bonuses.spellDamage;

    return { maxHealth, armor, resistance, evasion, spellSave, maxMana, spellDamage };
  }

  function hungerCondition(value) {
    if (value === 0) return "Fed";
    if (value === 1) return "Hungry";
    if (value === 2) return "Starving";
    if (value === 3) return "Exhausted";
    if (value >= 4) return "Collapse";
    return "";
  }

  function hungerEffect(value) {
    if (value === 0) return "Fed: No penalty";
    if (value === 1) return "Hungry: No penalty yet";
    if (value === 2) return "Starving: -5 Strength and Vitality checks";
    if (value === 3) return "Exhausted: -10 all checks, Speed halved";
    return "Collapse: Cannot travel until fed";
  }


  function nextCookingId(state, prefix) {
    ensureCookingContainers(state);
    state.cooking.sequence += 1;
    return `${prefix}-${state.cooking.sequence}`;
  }

  function ensureCookingContainers(state) {
    if (!state.cooking || typeof state.cooking !== "object") state.cooking = {};
    if (!Array.isArray(state.cooking.familiarRecipes)) state.cooking.familiarRecipes = [];
    if (!Array.isArray(state.cooking.history)) state.cooking.history = [];
    if (!state.cooking.ingredientPantry || typeof state.cooking.ingredientPantry !== "object" || Array.isArray(state.cooking.ingredientPantry)) {
      state.cooking.ingredientPantry = {};
    }
    if (!Array.isArray(state.cooking.ownedUtensils)) state.cooking.ownedUtensils = [];
    if (!CENTRAL_COOKING_REGIONS.includes(state.cooking.homeRegion)) state.cooking.homeRegion = "Asura";
    state.cooking.cookingKitOwned = state.cooking.cookingKitOwned === true;
    state.cooking.xp = Math.max(0, Math.floor(numberValue(state.cooking.xp)));
    state.cooking.sequence = Math.max(0, Math.floor(numberValue(state.cooking.sequence)));
    state.cooking.rerollUsedRest = Math.max(0, Math.floor(numberValue(state.cooking.rerollUsedRest)));
    state.cooking.hearthwrightUsedRest = Math.max(0, Math.floor(numberValue(state.cooking.hearthwrightUsedRest)));
    Object.keys(state.cooking.ingredientPantry).forEach((name) => {
      const quantity = Math.max(0, Math.floor(numberValue(state.cooking.ingredientPantry[name])));
      if (quantity) state.cooking.ingredientPantry[name] = quantity;
      else delete state.cooking.ingredientPantry[name];
    });
  }

  function cookingLevelForXp(xp) {
    const total = Math.max(0, Math.floor(numberValue(xp)));
    return [...COOKING_LEVELS].reverse().find((entry) => total >= entry.threshold) || COOKING_LEVELS[0];
  }

  function normalizeCookingState(state) {
    ensureCookingContainers(state);
    const existingIds = state.cooking.history.map((entry) => entry?.id);
    existingIds.forEach((id) => {
      const match = String(id || "").match(/-(\d+)$/);
      if (match) state.cooking.sequence = Math.max(state.cooking.sequence, Number(match[1]));
    });
    state.cooking.familiarRecipes = [...new Set(
      state.cooking.familiarRecipes.map((name) => String(name || "").trim()).filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    state.cooking.ownedUtensils = [...new Set(
      state.cooking.ownedUtensils.map((name) => String(name || "").trim()).filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    state.cooking.history = state.cooking.history
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        ...entry,
        id: entry.id || nextCookingId(state, "cook"),
        createdAt: entry.createdAt || new Date().toISOString(),
        restCycle: Math.max(1, Math.floor(numberValue(entry.restCycle) || 1)),
        xpAwarded: Math.max(0, Math.floor(numberValue(entry.xpAwarded))),
      }));
    state.schemaVersion = Math.max(5, Math.floor(numberValue(state.schemaVersion)));
    return state;
  }

  function currencyBalanceInSilver(state) {
    return (
      Math.max(0, Math.floor(numberValue(state.currency?.copper))) * 0.1 +
      Math.max(0, Math.floor(numberValue(state.currency?.silver))) +
      Math.max(0, Math.floor(numberValue(state.currency?.gold))) * 10 +
      Math.max(0, Math.floor(numberValue(state.currency?.platinum))) * 100
    );
  }

  function spendCurrencyInSilver(state, requestedCost) {
    const costSp = Math.max(0, numberValue(requestedCost));
    const targetCopper = Math.round(costSp * 10);
    if (!state.currency || typeof state.currency !== "object") state.currency = {};
    const purse = {
      copper: Math.max(0, Math.floor(numberValue(state.currency.copper))),
      silver: Math.max(0, Math.floor(numberValue(state.currency.silver))),
      gold: Math.max(0, Math.floor(numberValue(state.currency.gold))),
      platinum: Math.max(0, Math.floor(numberValue(state.currency.platinum))),
    };
    const totalCopper = purse.copper + purse.silver * 10 + purse.gold * 100 + purse.platinum * 1000;
    if (totalCopper < targetCopper) return { accepted: false, reason: "insufficient-funds", costSp };
    const previous = { ...purse };
    let remaining = targetCopper;
    while (remaining > 0) {
      if (remaining >= 10 && purse.silver > 0) {
        const used = Math.min(purse.silver, Math.floor(remaining / 10));
        purse.silver -= used;
        remaining -= used * 10;
        continue;
      }
      if (purse.copper > 0) {
        const used = Math.min(purse.copper, remaining);
        purse.copper -= used;
        remaining -= used;
        continue;
      }
      if (remaining < 10 && purse.silver > 0) {
        purse.silver -= 1;
        purse.copper += 10;
        continue;
      }
      if (purse.gold > 0) {
        purse.gold -= 1;
        purse.silver += 10;
        continue;
      }
      if (purse.platinum > 0) {
        purse.platinum -= 1;
        purse.gold += 10;
        continue;
      }
      return { accepted: false, reason: "insufficient-funds", costSp };
    }
    Object.assign(state.currency, purse);
    return { accepted: true, costSp, previous, current: { ...purse } };
  }

  function calculateCooking(state, skillScores) {
    normalizeCookingState(state);
    const xp = state.cooking.xp;
    const level = cookingLevelForXp(xp);
    const nextLevel = COOKING_LEVELS[level.level + 1] || null;
    const currentRest = Math.max(1, Math.floor(numberValue(state.hearth?.restCycle) || 1));
    const xpThisRest = state.cooking.history
      .filter((entry) => entry.restCycle === currentRest)
      .reduce((sum, entry) => sum + Math.max(0, numberValue(entry.xpAwarded)), 0);
    const skillBonus = numberValue(skillScores?.["95"]);
    const progressionBonus = level.bonus;
    return {
      xp,
      level: level.level,
      title: level.title,
      benefit: level.benefit,
      progressionBonus,
      skillBonus,
      totalBonus: skillBonus + progressionBonus,
      levels: COOKING_LEVELS,
      nextLevel,
      xpThisRest: Math.min(2, xpThisRest),
      xpRemainingThisRest: Math.max(0, 2 - xpThisRest),
      currentThreshold: level.threshold,
      nextThreshold: nextLevel?.threshold ?? level.threshold,
      progressCurrent: xp - level.threshold,
      progressRequired: nextLevel ? nextLevel.threshold - level.threshold : 0,
      progressPercent: nextLevel
        ? Math.max(0, Math.min(100, ((xp - level.threshold) / (nextLevel.threshold - level.threshold)) * 100))
        : 100,
      familiarRecipes: [...state.cooking.familiarRecipes],
      homeRegion: state.cooking.homeRegion,
      ingredientPantry: { ...state.cooking.ingredientPantry },
      ingredientUnits: Object.values(state.cooking.ingredientPantry).reduce((sum, value) => sum + numberValue(value), 0),
      cookingKitOwned: state.cooking.cookingKitOwned,
      ownedUtensils: [...state.cooking.ownedUtensils],
      coinBalanceSp: currencyBalanceInSilver(state),
      rerollAvailable: level.level >= 5 && state.cooking.rerollUsedRest !== currentRest,
      hearthwrightAvailable: level.level >= 4 && state.cooking.hearthwrightUsedRest !== currentRest,
      currentRest,
      history: [...state.cooking.history].reverse(),
    };
  }

  function normalizeCookingRegion(region) {
    return String(region || "").trim();
  }

  function inferRecipeDifficulty(dish, homeRegion) {
    const legendary = dish?.legendary === true || Number(dish?.dc) >= 85 || /master|legendary/i.test(String(dish?.difficulty || "")) || String(dish?.preparationClass || "").toLowerCase() === "masterchef";
    if (legendary) return { ...COOKING_DIFFICULTIES.masterwork, legendary: true, explicitlyDangerous: false, reason: "Legendary catalogue dish" };
    const explicitlyDangerous = dish?.rareDangerous === true || String(dish?.preparationClass || "").toLowerCase() === "dangerous";
    if (explicitlyDangerous) return { ...COOKING_DIFFICULTIES.dangerous, legendary: false, explicitlyDangerous: true, reason: "Explicitly rare or dangerous" };
    const region = normalizeCookingRegion(dish?.region);
    if (region === normalizeCookingRegion(homeRegion)) return { ...COOKING_DIFFICULTIES.familiar, legendary: false, explicitlyDangerous: false, reason: "Home-region dish" };
    if (CENTRAL_COOKING_REGIONS.includes(region)) return { ...COOKING_DIFFICULTIES.regional, legendary: false, explicitlyDangerous: false, reason: "Central Continent regional dish" };
    return { ...COOKING_DIFFICULTIES.rare, legendary: false, explicitlyDangerous: false, reason: "Foreign-continent dish" };
  }

  function cookingRecipeFromConfig(state, data, config, cooking) {
    const recipeKey = String(config?.recipeKey || "__basic");
    const customName = String(config?.customName || "").trim();
    const customRecipes = {
      __basic: { name: customName || "Basic camp meal", difficulty: COOKING_DIFFICULTIES.basic, isHearthDish: false, ingredients: [], cost: 0 },
      __familiar: { name: customName || "Familiar household dish", difficulty: COOKING_DIFFICULTIES.familiar, isHearthDish: false, ingredients: [], cost: 0 },
      __rare: { name: customName || "Rare or dangerous dish", difficulty: COOKING_DIFFICULTIES.dangerous, isHearthDish: false, ingredients: [], cost: 0 },
      __masterwork: { name: customName || "Legendary Masterchef dish", difficulty: COOKING_DIFFICULTIES.masterwork, isHearthDish: false, ingredients: [], cost: 0 },
    };
    if (customRecipes[recipeKey]) return { ...customRecipes[recipeKey], dish: null, specialtyUtensil: "" };
    const dish = data.food?.dishes?.find((entry) => entry.name === recipeKey) || null;
    if (!dish) return { ...customRecipes.__basic, name: customName || recipeKey || "Basic camp meal", dish: null, specialtyUtensil: "" };
    return {
      name: dish.name,
      dish,
      difficulty: inferRecipeDifficulty(dish, cooking.homeRegion),
      isHearthDish: true,
      specialtyUtensil: String(dish.specialtyUtensil || ""),
      ingredients: Array.isArray(dish.ingredients) ? [...new Set(dish.ingredients.map((name) => String(name || "").trim()).filter(Boolean))] : [],
      cost: Math.max(0, numberValue(dish.cost)),
    };
  }

  function previewCookingCheck(state, data, config, skillScores) {
    const cooking = calculateCooking(state, skillScores);
    const recipe = cookingRecipeFromConfig(state, data, config, cooking);
    const familiar = cooking.familiarRecipes.includes(recipe.name);
    const regionalNowFamiliar = familiar && recipe.difficulty.key === "regional";
    const effectiveDifficulty = regionalNowFamiliar ? COOKING_DIFFICULTIES.familiar : recipe.difficulty;
    const baseDc = effectiveDifficulty.dc;
    const unfamiliar = !["basic", "familiar"].includes(effectiveDifficulty.key) && !familiar;
    const writtenRecipe = config?.writtenRecipe === true;
    const unfamiliarPenalty = unfamiliar && !writtenRecipe ? 10 : 0;
    const useCookingKit = state.cooking.cookingKitOwned === true && config?.cookingKit !== false;
    const assistant = config?.assistant === true;
    const professionalKitchen = config?.professionalKitchen === true;
    const poorConditions = config?.poorConditions === true;
    const useCampCook = config?.useCampCook !== false && cooking.level >= 2 && poorConditions;
    const specialtyPresent = !recipe.specialtyUtensil || state.cooking.ownedUtensils.includes(recipe.specialtyUtensil);
    const modifier = cooking.totalBonus + (useCookingKit ? 25 : 0) + (assistant ? 10 : 0);
    const advantageSources = professionalKitchen ? ["Professional kitchen"] : [];
    const disadvantageSources = [];
    if (poorConditions && !useCampCook) disadvantageSources.push("Poor fire, water, or weather");
    if (!specialtyPresent) disadvantageSources.push(`Missing ${recipe.specialtyUtensil}`);
    let rollMode = "normal";
    if (advantageSources.length && !disadvantageSources.length) rollMode = "advantage";
    if (disadvantageSources.length && !advantageSources.length) rollMode = "disadvantage";
    const requiredIngredients = recipe.ingredients.map((name) => ({
      name,
      required: 1,
      owned: Math.max(0, Math.floor(numberValue(state.cooking.ingredientPantry[name]))),
    }));
    const missingIngredients = requiredIngredients.filter((entry) => entry.owned < entry.required);
    const ingredientSource = config?.ingredientSource === "buy" ? "buy" : "pantry";
    const pantryReady = !requiredIngredients.length || !missingIngredients.length;
    const canAffordIngredients = currencyBalanceInSilver(state) >= recipe.cost;
    const ingredientReady = !recipe.isHearthDish || (ingredientSource === "buy" ? canAffordIngredients : pantryReady);
    const requiredLevel = effectiveDifficulty.requiredLevel;
    const levelUnlocked = cooking.level >= requiredLevel;
    const canAttempt = levelUnlocked && ingredientReady;
    const baseServings = effectiveDifficulty.key === "dangerous" || effectiveDifficulty.key === "masterwork" ? 1 : 2;
    return {
      accepted: canAttempt,
      recipeKey: String(config?.recipeKey || "__basic"),
      recipeName: recipe.name,
      dish: recipe.dish,
      isHearthDish: recipe.isHearthDish,
      difficulty: effectiveDifficulty,
      originalDifficulty: recipe.difficulty,
      difficultyReason: recipe.difficulty.reason || "Recipe category",
      requiredLevel,
      levelUnlocked,
      lockReason: levelUnlocked ? "" : `Requires Cooking Level ${requiredLevel}`,
      time: recipe.dish?.time || effectiveDifficulty.time,
      specialtyUtensil: recipe.specialtyUtensil,
      specialtyPresent,
      familiar,
      unfamiliar,
      writtenRecipe,
      unfamiliarPenalty,
      servings: baseServings,
      baseServings,
      dc: baseDc + unfamiliarPenalty,
      baseDc,
      modifier,
      modifierBreakdown: {
        cookingSkill: cooking.skillBonus,
        levelBonus: cooking.progressionBonus,
        cookingKit: useCookingKit ? 25 : 0,
        assistant: assistant ? 10 : 0,
      },
      rollMode,
      advantageSources,
      disadvantageSources,
      campCookIgnoredCondition: useCampCook,
      underPressure: config?.underPressure === true,
      useHearthwright: config?.useHearthwright !== false,
      cooking,
      ingredients: requiredIngredients,
      missingIngredients,
      ingredientSource,
      pantryReady,
      ingredientReady,
      canAttempt,
      purchaseCost: recipe.cost,
      canAffordIngredients,
      coinBalanceSp: currencyBalanceInSilver(state),
      config: {
        recipeKey: String(config?.recipeKey || "__basic"),
        customName: String(config?.customName || "").trim(),
        cookingKit: useCookingKit,
        assistant,
        professionalKitchen,
        writtenRecipe,
        poorConditions,
        ingredientSource,
        underPressure: config?.underPressure === true,
        useCampCook: config?.useCampCook !== false,
        useHearthwright: config?.useHearthwright !== false,
      },
    };
  }

  function randomD100(randomSource) {
    const source = typeof randomSource === "function" ? randomSource : Math.random;
    return Math.max(1, Math.min(100, Math.floor(source() * 100) + 1));
  }

  function rollCookingCheck(state, data, config, skillScores, randomSource) {
    const preview = previewCookingCheck(state, data, config, skillScores);
    if (!preview.canAttempt && preview.accepted === false) {
      const reason = !preview.levelUnlocked
        ? "level-locked"
        : preview.ingredientSource === "buy" && !preview.canAffordIngredients
          ? "insufficient-funds"
          : "missing-ingredients";
      return { accepted: false, reason, preview };
    }
    const rolls = [randomD100(randomSource)];
    if (preview.rollMode !== "normal") rolls.push(randomD100(randomSource));
    const naturalRoll = preview.rollMode === "advantage"
      ? Math.max(...rolls)
      : preview.rollMode === "disadvantage"
        ? Math.min(...rolls)
        : rolls[0];
    const total = naturalRoll + preview.modifier;
    let outcome = "failure";
    if (naturalRoll <= 5) outcome = "critical-failure";
    else if (naturalRoll >= 96) outcome = "critical-success";
    else if (total >= preview.dc + 20) outcome = "strong-success";
    else if (total >= preview.dc) outcome = "success";
    const success = ["success", "strong-success", "critical-success"].includes(outcome);
    const useHearthwright =
      outcome === "strong-success" &&
      preview.cooking.hearthwrightAvailable &&
      preview.useHearthwright;
    const extraServings = (outcome === "critical-success" ? 1 : 0) + (useHearthwright ? 2 : 0);
    const preparedServings = outcome === "critical-failure" ? 0 : preview.baseServings + extraServings;
    const bonusXpReason =
      preview.underPressure ||
      preview.unfamiliar ||
      ["regional", "rare", "dangerous", "masterwork"].includes(preview.originalDifficulty.key);
    const potentialXp = success && preview.dc >= 35 ? 1 + (bonusXpReason ? 1 : 0) : 0;
    const xpAwarded = Math.min(preview.cooking.xpRemainingThisRest, potentialXp);
    const becomesFamiliar =
      success &&
      preview.cooking.level >= 3 &&
      preview.originalDifficulty.key === "regional" &&
      !preview.familiar;
    return {
      ...preview,
      accepted: true,
      checkId: `check-${Date.now()}-${Math.floor((typeof randomSource === "function" ? randomSource() : Math.random()) * 1000000)}`,
      rolls,
      naturalRoll,
      total,
      outcome,
      success,
      extraServings,
      preparedServings,
      extraBoonTargets: 0,
      usedHearthwright: useHearthwright,
      potentialXp,
      xpAwarded,
      becomesFamiliar,
      rerolled: false,
      recorded: false,
    };
  }

  function rerollCookingCheck(state, data, previousResult, skillScores, randomSource) {
    normalizeCookingState(state);
    const cooking = calculateCooking(state, skillScores);
    if (!previousResult || previousResult.accepted === false || cooking.level < 5) return { accepted: false, reason: "unavailable" };
    if (!cooking.rerollAvailable) return { accepted: false, reason: "already-used" };
    state.cooking.rerollUsedRest = cooking.currentRest;
    const result = rollCookingCheck(state, data, previousResult.config, skillScores, randomSource);
    if (!result.accepted) return result;
    result.checkId = previousResult.checkId;
    result.rerolled = true;
    return { accepted: true, result };
  }

  function appendCookingHistory(state, entry) {
    normalizeCookingState(state);
    const historyEntry = {
      id: nextCookingId(state, "cook"),
      createdAt: new Date().toISOString(),
      restCycle: Math.max(1, Math.floor(numberValue(state.hearth?.restCycle) || 1)),
      day: Math.max(1, Math.floor(numberValue(state.hunger?.currentDay) || 1)),
      ...entry,
    };
    state.cooking.history.push(historyEntry);
    return historyEntry;
  }

  function recordCookingResult(state, data, result, skillScores) {
    normalizeSurvivalState(state);
    normalizeCookingState(state);
    if (!result?.checkId || result.accepted === false || state.cooking.history.some((entry) => entry.checkId === result.checkId)) {
      return { accepted: false, reason: "already-recorded" };
    }
    const currentPreview = previewCookingCheck(state, data, result.config, skillScores);
    if (!currentPreview.levelUnlocked) return { accepted: false, reason: "level-locked" };
    if (result.ingredientSource === "pantry" && !currentPreview.pantryReady) return { accepted: false, reason: "missing-ingredients" };
    if (result.ingredientSource === "buy" && !currentPreview.canAffordIngredients) return { accepted: false, reason: "insufficient-funds" };
    const cooking = calculateCooking(state, skillScores);
    const previous = {
      xp: state.cooking.xp,
      foodGainedToday: state.hunger.foodGainedToday,
      pantryQuantity: numberValue(state.hearth.acquired[result.recipeName]),
      familiarRecipes: [...state.cooking.familiarRecipes],
      hearthwrightUsedRest: state.cooking.hearthwrightUsedRest,
      ingredientPantry: { ...state.cooking.ingredientPantry },
      currency: { ...state.currency },
    };
    const consumedIngredients = [];
    let costPaid = 0;
    if (result.isHearthDish && result.ingredientSource === "pantry") {
      result.ingredients.forEach((entry) => {
        const remaining = Math.max(0, Math.floor(numberValue(state.cooking.ingredientPantry[entry.name])) - entry.required);
        if (remaining) state.cooking.ingredientPantry[entry.name] = remaining;
        else delete state.cooking.ingredientPantry[entry.name];
        consumedIngredients.push({ name: entry.name, quantity: entry.required });
      });
    } else if (result.isHearthDish && result.ingredientSource === "buy") {
      const payment = spendCurrencyInSilver(state, result.purchaseCost);
      if (!payment.accepted) return payment;
      costPaid = payment.costSp;
    }
    const actualXp = Math.min(cooking.xpRemainingThisRest, Math.max(0, Math.floor(numberValue(result.potentialXp))));
    let pantryAdded = 0;
    let standardFoodAdded = 0;
    if (result.outcome !== "critical-failure") {
      if (result.success && result.isHearthDish) {
        pantryAdded = Math.max(0, Math.floor(numberValue(result.preparedServings)));
        state.hearth.acquired[result.recipeName] = previous.pantryQuantity + pantryAdded;
      } else {
        standardFoodAdded = Math.max(0, Math.floor(numberValue(result.preparedServings)));
        state.hunger.foodGainedToday = Math.max(0, Math.floor(numberValue(state.hunger.foodGainedToday))) + standardFoodAdded;
      }
    }
    state.cooking.xp += actualXp;
    if (result.becomesFamiliar && !state.cooking.familiarRecipes.includes(result.recipeName)) {
      state.cooking.familiarRecipes.push(result.recipeName);
      state.cooking.familiarRecipes.sort((left, right) => left.localeCompare(right));
    }
    if (result.usedHearthwright) state.cooking.hearthwrightUsedRest = cooking.currentRest;
    const historyEntry = appendCookingHistory(state, {
      type: "check",
      checkId: result.checkId,
      recipeName: result.recipeName,
      dc: result.dc,
      difficulty: result.difficulty.label,
      naturalRoll: result.naturalRoll,
      rolls: [...result.rolls],
      total: result.total,
      outcome: result.outcome,
      servingsRequested: result.baseServings,
      servingsPrepared: result.preparedServings,
      pantryAdded,
      standardFoodAdded,
      xpAwarded: actualXp,
      becameFamiliar: result.becomesFamiliar,
      usedHearthwright: result.usedHearthwright,
      rerolled: result.rerolled === true,
      ingredientSource: result.ingredientSource,
      ingredientsConsumed: consumedIngredients,
      costPaid,
      previous,
    });
    return { accepted: true, historyEntry, actualXp, pantryAdded, standardFoodAdded, consumedIngredients, costPaid };
  }

  function buyCookingKit(state) {
    normalizeCookingState(state);
    if (state.cooking.cookingKitOwned) return { accepted: false, reason: "already-owned" };
    const payment = spendCurrencyInSilver(state, 200);
    if (!payment.accepted) return payment;
    const previous = { currency: payment.previous, cookingKitOwned: false };
    state.cooking.cookingKitOwned = true;
    const historyEntry = appendCookingHistory(state, {
      type: "kit-purchase",
      xpAwarded: 0,
      costPaid: 200,
      previous,
    });
    return { accepted: true, historyEntry, costPaid: 200 };
  }

  function grantCookingTrainingXp(state, skillScores) {
    normalizeCookingState(state);
    const cooking = calculateCooking(state, skillScores);
    if (cooking.xpRemainingThisRest < 1) return { accepted: false, reason: "rest-limit" };
    const previous = { xp: state.cooking.xp };
    state.cooking.xp += 1;
    const historyEntry = appendCookingHistory(state, {
      type: "training",
      xpAwarded: 1,
      previous,
    });
    return { accepted: true, historyEntry, xp: state.cooking.xp };
  }

  function undoLastCookingAction(state) {
    normalizeCookingState(state);
    const event = state.cooking.history.at(-1);
    if (!event) return { accepted: false, reason: "empty-history" };
    if (event.type === "check") {
      if (numberValue(event.standardFoodAdded) > 0 && numberValue(state.hunger?.currentDay) !== numberValue(event.day)) {
        return { accepted: false, reason: "day-advanced" };
      }
      if (numberValue(event.pantryAdded) > 0) {
        const consumed = (state.hearth?.log || []).filter(
          (entry) => entry?.eaten === true && entry?.dish === event.recipeName,
        ).length;
        if (consumed > numberValue(event.previous?.pantryQuantity)) {
          return { accepted: false, reason: "servings-consumed" };
        }
      }
      state.cooking.xp = Math.max(0, Math.floor(numberValue(event.previous?.xp)));
      state.hunger.foodGainedToday = Math.max(0, Math.floor(numberValue(event.previous?.foodGainedToday)));
      if (numberValue(event.pantryAdded) > 0) {
        state.hearth.acquired[event.recipeName] = Math.max(0, Math.floor(numberValue(event.previous?.pantryQuantity)));
      }
      state.cooking.familiarRecipes = Array.isArray(event.previous?.familiarRecipes)
        ? [...event.previous.familiarRecipes]
        : state.cooking.familiarRecipes;
      state.cooking.hearthwrightUsedRest = Math.max(0, Math.floor(numberValue(event.previous?.hearthwrightUsedRest)));
      state.cooking.ingredientPantry = event.previous?.ingredientPantry && typeof event.previous.ingredientPantry === "object"
        ? { ...event.previous.ingredientPantry }
        : state.cooking.ingredientPantry;
      if (event.previous?.currency && typeof event.previous.currency === "object") state.currency = { ...event.previous.currency };
    } else if (event.type === "training") {
      state.cooking.xp = Math.max(0, Math.floor(numberValue(event.previous?.xp)));
    } else if (event.type === "kit-purchase") {
      state.cooking.cookingKitOwned = event.previous?.cookingKitOwned === true;
      if (event.previous?.currency && typeof event.previous.currency === "object") state.currency = { ...event.previous.currency };
    } else {
      return { accepted: false, reason: "unsupported" };
    }
    state.cooking.history.pop();
    return { accepted: true, event };
  }

  function calculateHunger(state) {
    const days = state.hunger?.days || [];
    let previousFood = numberValue(state.hunger?.startingRations);
    let previousHunger = 0;
    let populatedCount = 0;
    const results = days.map((day) => {
      if (isBlank(day.day)) {
        return { foodLeft: "", hunger: "", condition: "" };
      }
      populatedCount += 1;
      const gained = Math.max(0, numberValue(day.foodGained));
      const requestedRations = Math.max(0, numberValue(day.rationsEaten));
      const hearthMealsEaten = Math.max(0, numberValue(day.hearthMealsEaten));
      const availableFood = Math.max(0, previousFood + gained);
      const eaten = Math.min(requestedRations, availableFood);
      const foodLeft = Math.max(0, availableFood - eaten);
      const ateToday = eaten >= 1 || hearthMealsEaten >= 1;
      const hunger = ateToday ? 0 : previousHunger + 1;
      const condition = hungerCondition(hunger);

      previousFood = foodLeft;
      previousHunger = hunger;
      return {
        foodLeft,
        hunger,
        condition,
        foodGained: gained,
        rationsEaten: eaten,
        hearthMealsEaten,
      };
    });

    const currentFood = populatedCount ? previousFood : numberValue(state.hunger?.startingRations);
    const currentHunger = populatedCount ? previousHunger : 0;
    return {
      rows: results,
      currentFood,
      hunger: currentHunger,
      condition: hungerCondition(currentHunger),
      effect: hungerEffect(currentHunger),
    };
  }

  function countHearthRations(state) {
    const acquired = state.hearth?.acquired || {};
    const consumedByDish = new Map();
    (state.hearth?.log || []).forEach((entry) => {
      const name = String(entry?.dish || "").trim();
      if (!name || entry?.eaten !== true) return;
      consumedByDish.set(name, (consumedByDish.get(name) || 0) + 1);
    });
    return Object.entries(acquired).reduce((total, [name, quantity]) => {
      const acquiredCount = Math.max(0, Math.floor(numberValue(quantity)));
      const consumedCount = consumedByDish.get(name) || 0;
      return total + Math.max(0, acquiredCount - consumedCount);
    }, 0);
  }

  function previewHungerDay(state) {
    const hunger = calculateHunger(state);
    const currentDay = Math.max(1, Math.floor(numberValue(state.hunger?.currentDay) || 1));
    const foodGained = Math.max(0, Math.floor(numberValue(state.hunger?.foodGainedToday)));
    const availableFood = Math.max(0, hunger.currentFood + foodGained);
    const hearthMealsEaten = Math.max(
      0,
      Math.floor(numberValue(state.hunger?.hearthMealsEatenToday)),
    );
    const hearthRations = countHearthRations(state);
    const rationEaten = state.hunger?.eatRationToday === true && availableFood >= 1 ? 1 : 0;
    const foodAfter = Math.max(0, availableFood - rationEaten);
    const ateToday = rationEaten >= 1 || hearthMealsEaten >= 1;
    const hungerAfter = ateToday ? 0 : hunger.hunger + 1;
    return {
      currentDay,
      nextDay: currentDay + 1,
      currentFood: hunger.currentFood,
      standardRations: hunger.currentFood,
      hearthRations,
      totalRations: hunger.currentFood + hearthRations,
      foodGained,
      availableFood,
      availableStandardFood: availableFood,
      rationEaten,
      hearthMealsEaten,
      ateToday,
      foodAfter,
      totalAfter: foodAfter + hearthRations,
      hungerBefore: hunger.hunger,
      hungerAfter,
      condition: hungerCondition(hungerAfter),
      effect: hungerEffect(hungerAfter),
    };
  }

  function createInventoryEntry(name = "") {
    return {
      name: String(name || ""),
      quantity: 1,
      equipped: false,
      weightOverride: null,
    };
  }

  function mergeInventorySlots(defaultInventory, suppliedInventory) {
    const defaults = Array.isArray(defaultInventory) ? defaultInventory : [];
    const supplied = Array.isArray(suppliedInventory) ? suppliedInventory : defaults;

    return supplied.map((entry, index) => {
      const fallback = defaults[index] || createInventoryEntry();
      const values = entry && typeof entry === "object" ? entry : {};
      return { ...fallback, ...values };
    });
  }

  function addInventorySlot(state) {
    if (!Array.isArray(state.inventory)) state.inventory = [];
    const entry = createInventoryEntry();
    state.inventory.push(entry);
    return entry;
  }

  function removeInventorySlot(state, index) {
    if (!Array.isArray(state.inventory)) return null;
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= state.inventory.length) {
      return null;
    }
    return state.inventory.splice(position, 1)[0] || null;
  }

  function addInventoryItem(state, itemName) {
    const name = String(itemName || "").trim();
    if (!name) return false;
    if (!Array.isArray(state.inventory)) state.inventory = [];

    const existing = state.inventory.find((entry) => entry.name === name);
    if (existing) {
      existing.quantity = Math.max(0, numberValue(existing.quantity)) + 1;
      return true;
    }

    const entry =
      state.inventory.find((candidate) => !String(candidate.name || "").trim()) ||
      addInventorySlot(state);
    Object.assign(entry, createInventoryEntry(name));
    return true;
  }

  function availableInventoryItemNames(state) {
    const seen = new Set();
    const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
    return inventory.reduce((names, entry) => {
      const name = String(entry?.name || "").trim();
      if (!name || numberValue(entry?.quantity) <= 0 || seen.has(name)) return names;
      seen.add(name);
      names.push(name);
      return names;
    }, []);
  }

  function reconcileEquipmentWithInventory(state) {
    const availableNames = availableInventoryItemNames(state);
    const available = new Set(availableNames);
    const clearedSlots = [];
    const equipment = state?.equipment;

    if (!equipment || typeof equipment !== "object") {
      return { availableNames, clearedSlots };
    }

    Object.entries(equipment).forEach(([slot, value]) => {
      const name = String(value || "").trim();
      if (!name || available.has(name)) return;
      equipment[slot] = "";
      clearedSlots.push({ slot, name });
    });

    const equippedNames = new Set(
      Object.values(equipment)
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    if (Array.isArray(state.inventory)) {
      state.inventory.forEach((entry) => {
        const name = String(entry?.name || "").trim();
        entry.equipped = Boolean(name && available.has(name) && equippedNames.has(name));
      });
    }

    return { availableNames, clearedSlots };
  }

  function mergePersonalitySlots(defaultPersonality, suppliedPersonality) {
    const source = Array.isArray(suppliedPersonality)
      ? suppliedPersonality
      : Array.isArray(defaultPersonality)
        ? defaultPersonality
        : [];
    return source.map((entry) => ({
      name: String(entry?.name || ""),
      cost: numberValue(entry?.cost),
    }));
  }

  function calculatePersonality(state, data) {
    const catalogueByName = new Map(
      (data.traits || []).map((trait) => [String(trait.name || ""), trait]),
    );
    const rows = (state.personality || [])
      .map((entry, index) => {
        const name = String(entry?.name || "").trim();
        if (!name) return null;
        const catalogueTrait = catalogueByName.get(name);
        const hasStoredCost = entry?.cost !== undefined && entry?.cost !== null && entry?.cost !== "";
        const cost = numberValue(hasStoredCost ? entry.cost : catalogueTrait?.cost);
        return { index, name, cost };
      })
      .filter(Boolean);
    const total = rows.reduce((sum, entry) => sum + entry.cost, 0);

    return {
      rows,
      total,
      limit: PERSONALITY_TRAIT_LIMIT,
      remaining: Math.max(0, PERSONALITY_TRAIT_LIMIT - total),
      atLimit: total >= PERSONALITY_TRAIT_LIMIT,
      overLimit: total > PERSONALITY_TRAIT_LIMIT,
    };
  }

  function addPersonalityTrait(state, data, traitName) {
    const name = String(traitName || "").trim();
    const trait = (data.traits || []).find((entry) => entry.name === name);
    if (!trait) return { added: false, reason: "missing-trait" };

    const personality = calculatePersonality(state, data);
    if (personality.rows.some((entry) => entry.name === trait.name)) {
      return { added: false, reason: "duplicate", ...personality };
    }

    const nextTotal = personality.total + numberValue(trait.cost);
    if (nextTotal > personality.limit) {
      return { added: false, reason: "limit", nextTotal, ...personality };
    }

    if (!Array.isArray(state.personality)) state.personality = [];
    const empty = state.personality.find((entry) => !String(entry.name || "").trim());
    const target = empty || {};
    if (!empty) state.personality.push(target);

    target.name = trait.name;
    target.cost = numberValue(trait.cost);
    return {
      added: true,
      reason: "added",
      ...calculatePersonality(state, data),
    };
  }

  function removePersonalityTrait(state, index) {
    if (!Array.isArray(state.personality)) return { removed: false, reason: "missing-slot" };
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= state.personality.length) {
      return { removed: false, reason: "missing-slot" };
    }

    const name = String(state.personality[position]?.name || "").trim();
    if (!name) return { removed: false, reason: "empty-slot" };
    state.personality.splice(position, 1);
    return { removed: true, reason: "removed", name };
  }

  function applyHearthMealEdit(state, index, isEating) {
    const entry = state.hearth?.log?.[index];
    if (!entry) return { accepted: false, reason: "missing-row" };

    entry.eaten = isEating === true;
    if (!entry.eaten) {
      entry.rest = "";
      entry.day = "";
      return { accepted: true, reason: "cleared" };
    }

    if (!String(entry.dish || "").trim()) {
      entry.eaten = false;
      return { accepted: false, reason: "missing-dish" };
    }

    const enteredDays = (state.hunger?.days || [])
      .map((day) => day?.day)
      .filter(
        (value) =>
          value !== "" &&
          value !== null &&
          value !== undefined &&
          !Number.isNaN(Number(value)),
      );

    if (enteredDays.length === 0) {
      entry.eaten = false;
      return { accepted: false, reason: "missing-day" };
    }

    entry.rest = state.hearth?.restCycle ?? "";
    entry.day = enteredDays[enteredDays.length - 1];
    return { accepted: true, reason: "logged" };
  }

  function calculateHearth(state, data) {
    const dishesByName = new Map(data.food.dishes.map((dish) => [dish.name, dish]));
    const acquired = state.hearth?.acquired || {};
    const log = state.hearth?.log || [];
    const dishConsumed = new Map();
    const restConsumed = new Map();

    const rows = log.map((entry) => {
      if (!entry.dish || entry.eaten !== true) return { effect: "" };
      const dishName = entry.dish;
      const dishCount = (dishConsumed.get(dishName) || 0) + 1;
      dishConsumed.set(dishName, dishCount);
      const restKey = String(entry.rest ?? "");
      const restCount = (restConsumed.get(restKey) || 0) + 1;
      restConsumed.set(restKey, restCount);
      const boonGranted =
        typeof entry.boonGranted === "boolean" ? entry.boonGranted : restCount === 1;

      let effect;
      if (dishCount > numberValue(acquired[dishName])) {
        effect = "NO SERVING LEFT";
      } else if (!boonGranted) {
        effect = "MEAL EATEN: Hearth Boon already used this rest";
      } else {
        effect = dishesByName.get(dishName)?.effect || "#N/A";
      }
      return { effect, boonGranted };
    });

    const currentRest = String(state.hearth?.restCycle ?? "");
    const currentEntries = log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => String(entry.rest ?? "") === currentRest && entry.eaten === true);
    const boonEntry =
      currentEntries.find(({ entry, index }) => rows[index]?.boonGranted === true) ||
      currentEntries[0];
    const activeEntry = boonEntry && boonEntry.entry.boonUsed !== true ? boonEntry : null;
    const status = !boonEntry ? "AVAILABLE" : activeEntry ? "ACTIVE" : "USED";
    const activeMeal = activeEntry?.entry.dish || "None";
    const activeEffect = activeEntry ? rows[activeEntry.index].effect : "No active Hearth Boon";

    const pantry = data.food.dishes.map((dish) => {
      const consumed = dishConsumed.get(dish.name) || 0;
      const quantity = numberValue(acquired[dish.name]);
      return { ...dish, acquired: quantity, eaten: consumed, left: Math.max(0, quantity - consumed) };
    });

    return {
      rows,
      status,
      activeMeal,
      activeEffect,
      activeIndex: activeEntry?.index ?? -1,
      pantry,
    };
  }

  function ensureSurvivalContainers(state) {
    if (!state.hunger || typeof state.hunger !== "object") state.hunger = {};
    if (!Array.isArray(state.hunger.days)) state.hunger.days = [];
    if (!state.hearth || typeof state.hearth !== "object") state.hearth = {};
    if (!Array.isArray(state.hearth.log)) state.hearth.log = [];
    if (!state.hearth.acquired || typeof state.hearth.acquired !== "object") {
      state.hearth.acquired = {};
    }
    if (!Array.isArray(state.survivalHistory)) state.survivalHistory = [];
    state.survivalHistorySequence = Math.max(
      0,
      Math.floor(numberValue(state.survivalHistorySequence)),
    );
  }

  function normalizeTrackedConditions(state) {
    if (!Array.isArray(state.activeEffects)) state.activeEffects = [];
    const legacyAilments = state.activeEffects.map((entry) => ({
      name: String(entry?.ailment || "").trim(),
      mark: entry?.mark,
    }));
    const suppliedAilments = Array.isArray(state.activeAilments)
      ? state.activeAilments
      : legacyAilments;

    state.activeEffects = Array.from({ length: 7 }, (_, index) => {
      const entry = state.activeEffects[index] || {};
      return {
        ...entry,
        status: String(entry.status || ""),
        duration: String(entry.duration || ""),
      };
    });

    state.activeAilments = Array.from({ length: 7 }, (_, index) => {
      const entry = suppliedAilments[index] || {};
      const name = String(entry.name || entry.ailment || "").trim();
      const parsedMark = Math.floor(numberValue(String(entry.mark || "").match(/\d+/)?.[0]));
      return {
        name,
        mark: name ? Math.min(3, Math.max(1, parsedMark || 1)) : 0,
      };
    });
    return state.activeAilments;
  }

  function setTrackedAilment(state, index, ailmentName) {
    normalizeTrackedConditions(state);
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= state.activeAilments.length) {
      return { accepted: false, reason: "missing-slot" };
    }
    const name = String(ailmentName || "").trim();
    state.activeAilments[position] = { name, mark: name ? 1 : 0 };
    return { accepted: true, resolved: !name, ailment: state.activeAilments[position] };
  }

  function changeTrackedAilmentMark(state, index, change) {
    normalizeTrackedConditions(state);
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= state.activeAilments.length) {
      return { accepted: false, reason: "missing-slot" };
    }
    const ailment = state.activeAilments[position];
    if (!ailment.name) return { accepted: false, reason: "missing-ailment" };
    const delta = Number(change);
    if (!Number.isFinite(delta) || delta === 0) {
      return { accepted: false, reason: "invalid-change" };
    }
    const nextMark = ailment.mark + Math.sign(delta);
    if (nextMark <= 0) {
      const resolvedName = ailment.name;
      state.activeAilments[position] = { name: "", mark: 0 };
      return { accepted: true, resolved: true, resolvedName, mark: 0 };
    }
    ailment.mark = Math.min(3, nextMark);
    return { accepted: true, resolved: false, ailment, mark: ailment.mark };
  }

  function nextSurvivalId(state, prefix) {
    ensureSurvivalContainers(state);
    state.survivalHistorySequence += 1;
    return `${prefix}-${state.survivalHistorySequence}`;
  }

  function appendSurvivalEvent(state, event) {
    ensureSurvivalContainers(state);
    const historyEvent = {
      id: nextSurvivalId(state, "event"),
      createdAt: new Date().toISOString(),
      ...event,
    };
    state.survivalHistory.push(historyEvent);
    return historyEvent;
  }

  function normalizeSurvivalState(state) {
    ensureSurvivalContainers(state);
    normalizeCookingState(state);
    normalizeCraftingState(state);

    const existingIds = [
      ...state.survivalHistory.map((entry) => entry?.id),
      ...state.hunger.days.map((entry) => entry?.id),
      ...state.hearth.log.map((entry) => entry?.id),
    ];
    existingIds.forEach((id) => {
      const match = String(id || "").match(/-(\d+)$/);
      if (match) state.survivalHistorySequence = Math.max(state.survivalHistorySequence, Number(match[1]));
    });

    state.hunger.days = state.hunger.days
      .filter((day) => day && !isBlank(day.day))
      .map((day) => ({
        ...day,
        id: day.id || nextSurvivalId(state, "day"),
        day: Math.max(1, Math.floor(numberValue(day.day) || 1)),
        foodGained: Math.max(0, Math.floor(numberValue(day.foodGained))),
        rationsEaten: Math.max(0, Math.floor(numberValue(day.rationsEaten))),
        hearthMealsEaten: Math.max(0, Math.floor(numberValue(day.hearthMealsEaten))),
        standardRationsRemaining:
          day.standardRationsRemaining === undefined
            ? undefined
            : Math.max(0, Math.floor(numberValue(day.standardRationsRemaining))),
        hearthRationsRemaining:
          day.hearthRationsRemaining === undefined
            ? undefined
            : Math.max(0, Math.floor(numberValue(day.hearthRationsRemaining))),
        totalRationsRemaining:
          day.totalRationsRemaining === undefined
            ? undefined
            : Math.max(0, Math.floor(numberValue(day.totalRationsRemaining))),
      }));

    const restsWithBoon = new Set();
    state.hearth.log = state.hearth.log
      .filter((entry) => entry && entry.eaten === true && String(entry.dish || "").trim())
      .map((entry) => {
        const restKey = String(entry.rest ?? "");
        const inferredBoon = !restsWithBoon.has(restKey);
        if (inferredBoon) restsWithBoon.add(restKey);
        return {
          ...entry,
          id: entry.id || nextSurvivalId(state, "meal"),
          rest: Math.max(1, Math.floor(numberValue(entry.rest) || 1)),
          day: Math.max(1, Math.floor(numberValue(entry.day) || 1)),
          dish: String(entry.dish || "").trim(),
          eaten: true,
          boonGranted:
            typeof entry.boonGranted === "boolean" ? entry.boonGranted : inferredBoon,
          boonUsed: entry.boonUsed === true,
        };
      });

    const lastLoggedDay = state.hunger.days.reduce(
      (latest, day) => Math.max(latest, numberValue(day.day)),
      0,
    );
    const suppliedCurrentDay = Math.floor(numberValue(state.hunger.currentDay));
    state.hunger.currentDay = suppliedCurrentDay >= 1
      ? suppliedCurrentDay
      : Math.max(1, lastLoggedDay + 1);
    state.hunger.foodGainedToday = Math.max(
      0,
      Math.floor(numberValue(state.hunger.foodGainedToday)),
    );
    const suppliedHearthMealsEatenToday = state.hunger.hearthMealsEatenToday;
    state.hunger.hearthMealsEatenToday =
      suppliedHearthMealsEatenToday === undefined ||
      suppliedHearthMealsEatenToday === null ||
      suppliedHearthMealsEatenToday === ""
        ? state.hearth.log.filter(
            (entry) =>
              entry.eaten === true &&
              Math.floor(numberValue(entry.day)) === state.hunger.currentDay,
          ).length
        : Math.max(0, Math.floor(numberValue(suppliedHearthMealsEatenToday)));
    if (typeof state.hunger.eatRationToday !== "boolean") {
      state.hunger.eatRationToday = calculateHunger(state).currentFood > 0;
    }
    if (state.hunger.hearthMealsEatenToday > 0) {
      state.hunger.eatRationToday = false;
    }
    state.hearth.restCycle = Math.max(1, Math.floor(numberValue(state.hearth.restCycle) || 1));
    state.hearth.selectedDish = String(state.hearth.selectedDish || "");
    normalizeTrackedConditions(state);

    if (state.survivalHistory.length === 0) {
      state.hunger.days.forEach((day) => {
        appendSurvivalEvent(state, { type: "day", sourceId: day.id });
      });
      state.hearth.log.forEach((entry) => {
        appendSurvivalEvent(state, {
          type: "hearth-meal",
          sourceId: entry.id,
          activated: entry.boonGranted === true,
        });
        if (entry.boonGranted === true && entry.boonUsed === true) {
          appendSurvivalEvent(state, { type: "boon-used", sourceId: entry.id });
        }
      });
    }

    state.schemaVersion = Math.max(3, Math.floor(numberValue(state.schemaVersion)));
    return state;
  }

  function advanceHungerDay(state) {
    normalizeSurvivalState(state);
    const preview = previewHungerDay(state);
    const dayEntry = {
      id: nextSurvivalId(state, "day"),
      day: preview.currentDay,
      foodGained: preview.foodGained,
      rationsEaten: preview.rationEaten,
      hearthMealsEaten: preview.hearthMealsEaten,
      standardRationsRemaining: preview.foodAfter,
      hearthRationsRemaining: preview.hearthRations,
      totalRationsRemaining: preview.totalAfter,
    };
    state.hunger.days.push(dayEntry);
    state.hunger.currentDay = preview.nextDay;
    state.hunger.foodGainedToday = 0;
    state.hunger.hearthMealsEatenToday = 0;
    state.hunger.eatRationToday = preview.foodAfter > 0;
    const historyEvent = appendSurvivalEvent(state, { type: "day", sourceId: dayEntry.id });
    return { accepted: true, dayEntry, historyEvent, ...preview };
  }

  function resetDayCounter(state) {
    normalizeSurvivalState(state);
    const previousDay = state.hunger.currentDay;
    if (previousDay === 1) return { accepted: false, reason: "already-reset" };
    state.hunger.currentDay = 1;
    const historyEvent = appendSurvivalEvent(state, {
      type: "day-reset",
      previousDay,
      currentDay: 1,
    });
    return { accepted: true, previousDay, currentDay: 1, historyEvent };
  }

  function eatHearthMeal(state, data, dishName) {
    normalizeSurvivalState(state);
    const name = String(dishName || "").trim();
    const hearth = calculateHearth(state, data);
    const dish = hearth.pantry.find((entry) => entry.name === name);
    if (!dish) return { accepted: false, reason: "missing-dish" };
    if (dish.left < 1) return { accepted: false, reason: "no-serving" };

    const grantsBoon = hearth.status === "AVAILABLE";
    const mealEntry = {
      id: nextSurvivalId(state, "meal"),
      rest: state.hearth.restCycle,
      day: state.hunger.currentDay,
      dish: name,
      eaten: true,
      boonGranted: grantsBoon,
      boonUsed: !grantsBoon,
    };
    state.hearth.log.push(mealEntry);
    state.hearth.selectedDish = "";
    state.hunger.hearthMealsEatenToday += 1;
    state.hunger.eatRationToday = false;
    const historyEvent = appendSurvivalEvent(state, {
      type: "hearth-meal",
      sourceId: mealEntry.id,
      activated: grantsBoon,
    });
    return { accepted: true, mealEntry, historyEvent, grantsBoon, dish };
  }

  function markHearthBoonUsed(state, data) {
    normalizeSurvivalState(state);
    const hearth = calculateHearth(state, data);
    if (hearth.status !== "ACTIVE" || hearth.activeIndex < 0) {
      return { accepted: false, reason: "no-active-boon" };
    }
    const mealEntry = state.hearth.log[hearth.activeIndex];
    mealEntry.boonUsed = true;
    const historyEvent = appendSurvivalEvent(state, {
      type: "boon-used",
      sourceId: mealEntry.id,
    });
    return { accepted: true, mealEntry, historyEvent };
  }

  function completeLongRest(state, data) {
    normalizeSurvivalState(state);
    const before = calculate(state, data);
    const previous = {
      currentHitPoints: state.character.currentHitPoints,
      currentMana: state.character.currentMana,
      restCycle: state.hearth.restCycle,
      selectedDish: state.hearth.selectedDish,
      boonStatus: before.hearth.status,
      activeMeal: before.hearth.activeMeal,
    };
    const restoredHitPoints = before.stats.maxHealth;
    const restoredMana = before.stats.maxMana;
    state.character.currentHitPoints = restoredHitPoints;
    state.character.currentMana = restoredMana;
    state.hearth.restCycle = previous.restCycle + 1;
    state.hearth.selectedDish = "";
    const historyEvent = appendSurvivalEvent(state, {
      type: "long-rest",
      restCycle: state.hearth.restCycle,
      previous,
      restoredHitPoints,
      restoredMana,
    });
    return {
      accepted: true,
      historyEvent,
      previous,
      restoredHitPoints,
      restoredMana,
      restCycle: state.hearth.restCycle,
    };
  }

  function undoLastSurvivalAction(state) {
    normalizeSurvivalState(state);
    const event = state.survivalHistory.at(-1);
    if (!event) return { accepted: false, reason: "empty-history" };

    if (event.type === "day") {
      const index = state.hunger.days.findIndex((entry) => entry.id === event.sourceId);
      if (index < 0) return { accepted: false, reason: "missing-source" };
      const [day] = state.hunger.days.splice(index, 1);
      state.hunger.currentDay = day.day;
      state.hunger.foodGainedToday = day.foodGained;
      state.hunger.hearthMealsEatenToday = Math.max(
        0,
        Math.floor(numberValue(day.hearthMealsEaten)),
      );
      state.hunger.eatRationToday = numberValue(day.rationsEaten) >= 1;
    } else if (event.type === "hearth-meal") {
      const index = state.hearth.log.findIndex((entry) => entry.id === event.sourceId);
      if (index < 0) return { accepted: false, reason: "missing-source" };
      state.hearth.log.splice(index, 1);
      state.hunger.hearthMealsEatenToday = Math.max(
        0,
        Math.floor(numberValue(state.hunger.hearthMealsEatenToday)) - 1,
      );
    } else if (event.type === "day-reset") {
      state.hunger.currentDay = Math.max(1, Math.floor(numberValue(event.previousDay) || 1));
    } else if (event.type === "boon-used") {
      const meal = state.hearth.log.find((entry) => entry.id === event.sourceId);
      if (!meal) return { accepted: false, reason: "missing-source" };
      meal.boonUsed = false;
    } else if (event.type === "long-rest") {
      const previous = event.previous || {};
      state.character.currentHitPoints = previous.currentHitPoints;
      state.character.currentMana = previous.currentMana;
      state.hearth.restCycle = previous.restCycle;
      state.hearth.selectedDish = previous.selectedDish || "";
    } else {
      return { accepted: false, reason: "unsupported-event" };
    }

    state.survivalHistory.pop();
    return { accepted: true, event };
  }

  function editSurvivalHistoryEntry(state, eventId, changes) {
    normalizeSurvivalState(state);
    const event = state.survivalHistory.find((entry) => entry.id === eventId);
    if (!event) return { accepted: false, reason: "missing-event" };
    if (event.type === "day") {
      const day = state.hunger.days.find((entry) => entry.id === event.sourceId);
      if (!day) return { accepted: false, reason: "missing-source" };
      day.day = Math.max(1, Math.floor(numberValue(changes.day) || 1));
      day.foodGained = Math.max(0, Math.floor(numberValue(changes.foodGained)));
      day.rationsEaten = Math.max(0, Math.floor(numberValue(changes.rationsEaten)));
      if (changes.hearthMealsEaten !== undefined) {
        day.hearthMealsEaten = Math.max(
          0,
          Math.floor(numberValue(changes.hearthMealsEaten)),
        );
      }
      return { accepted: true, event, source: day };
    }
    if (event.type === "hearth-meal") {
      const meal = state.hearth.log.find((entry) => entry.id === event.sourceId);
      if (!meal) return { accepted: false, reason: "missing-source" };
      meal.rest = Math.max(1, Math.floor(numberValue(changes.rest) || 1));
      meal.day = Math.max(1, Math.floor(numberValue(changes.day) || 1));
      meal.dish = String(changes.dish || meal.dish).trim();
      meal.boonUsed = changes.boonUsed === true;
      return { accepted: true, event, source: meal };
    }
    return { accepted: false, reason: "not-editable" };
  }

  function calculateSurvivalHistory(state, hunger, hearth) {
    const hungerRowsById = new Map(
      (state.hunger?.days || []).map((entry, index) => [entry.id, { entry, result: hunger.rows[index] }]),
    );
    const hearthRowsById = new Map(
      (state.hearth?.log || []).map((entry, index) => [entry.id, { entry, result: hearth.rows[index] }]),
    );
    return (state.survivalHistory || []).map((event) => {
      let title = "Journey event";
      let detail = "";
      let editable = false;
      if (event.type === "day") {
        const source = hungerRowsById.get(event.sourceId);
        if (source) {
          const standardEaten = numberValue(source.result?.rationsEaten ?? source.entry.rationsEaten);
          const hearthEaten = numberValue(
            source.result?.hearthMealsEaten ?? source.entry.hearthMealsEaten,
          );
          const remaining = source.entry.totalRationsRemaining ?? source.result?.foodLeft;
          const eatenParts = [];
          if (standardEaten) {
            eatenParts.push(`${standardEaten} standard ration${standardEaten === 1 ? "" : "s"}`);
          }
          if (hearthEaten) {
            eatenParts.push(`${hearthEaten} Hearth meal${hearthEaten === 1 ? "" : "s"}`);
          }
          title = `Day ${source.entry.day}`;
          detail = `Gained ${numberValue(source.entry.foodGained)} standard ration${numberValue(source.entry.foodGained) === 1 ? "" : "s"}, ate ${eatenParts.join(" and ") || "nothing"}, ${numberValue(remaining)} total remaining, ${source.result?.condition || "Unknown"}`;
          editable = true;
        }
      } else if (event.type === "hearth-meal") {
        const source = hearthRowsById.get(event.sourceId);
        if (source) {
          title = source.entry.dish;
          detail = event.activated
            ? `Hearth Boon activated — ${source.result?.effect || "Effect unavailable"}`
            : "Meal eaten — no new Hearth Boon";
          editable = true;
        }
      } else if (event.type === "boon-used") {
        const source = hearthRowsById.get(event.sourceId);
        title = `${source?.entry?.dish || "Hearth"} boon used`;
        detail = "Hearth Boon availability resets after the next Long Rest.";
      } else if (event.type === "long-rest") {
        title = `Long Rest ${event.restCycle}`;
        detail = `HP restored to ${formatNumber(event.restoredHitPoints, 0)}, Mana restored to ${formatNumber(event.restoredMana, 0)}`;
      } else if (event.type === "day-reset") {
        title = "Day counter reset";
        detail = `Journey day changed from Day ${formatNumber(event.previousDay, 0)} to Day 1. Rations, hunger, and history were preserved.`;
      }
      return { ...event, title, detail, editable };
    });
  }

  function calculate(state, data) {
    const experience = normalizeCharacterProgression(state);
    const itemIndex = firstItemIndex(data.items);
    const equippedItems = equipmentItems(state, data, itemIndex);
    const equipmentSums = {
      strength: sumItemProperty(equippedItems, "strength"),
      speed: sumItemProperty(equippedItems, "speed"),
      vitality: sumItemProperty(equippedItems, "vitality", [0, 1, 2, 3, 4, 5, 6]),
      intelligence: sumItemProperty(equippedItems, "intelligence"),
      awareness: sumItemProperty(equippedItems, "awareness"),
      talent: sumItemProperty(equippedItems, "talent"),
      luck: sumItemProperty(equippedItems, "luck"),
      armor: sumItemProperty(equippedItems, "armor"),
      resistance: sumItemProperty(equippedItems, "resistance"),
      evasion: sumItemProperty(equippedItems, "evasion"),
      durability: sumItemProperty(equippedItems, "durability"),
      focus: sumItemProperty(equippedItems, "focus"),
      healthRegeneration: sumItemProperty(equippedItems, "healthRegeneration"),
      damageReflection: sumItemProperty(equippedItems, "damageReflection"),
      physicalDamage: sumItemProperty(equippedItems, "physicalDamage"),
      magicalDamage: sumItemProperty(equippedItems, "magicalDamage"),
      criticalChance: sumItemProperty(equippedItems, "criticalChance"),
      goldMultiplier: sumItemProperty(equippedItems, "goldMultiplier"),
      xpMultiplier: sumItemProperty(equippedItems, "xpMultiplier"),
    };

    const abilityScores = {};
    data.abilityDefinitions.forEach((definition) => {
      let equipmentBonus;
      if (definition.id === "talent") {
        equipmentBonus = equipmentSums.awareness;
      } else {
        equipmentBonus = equipmentSums[definition.id];
      }
      const hasStoredBase = state.abilityBaseScores &&
        Object.prototype.hasOwnProperty.call(state.abilityBaseScores, definition.id);
      const baseScore = hasStoredBase
        ? numberValue(state.abilityBaseScores[definition.id])
        : definition.base;
      abilityScores[definition.id] =
        baseScore + equipmentBonus + numberValue(state.abilityBonuses?.[definition.id]);
    });

    const abilityModifiers = {};
    const abilityCosts = {};
    Object.entries(abilityScores).forEach(([key, value]) => {
      abilityModifiers[key] = abilityModifier(value);
      abilityCosts[key] = abilityCost(value);
    });

    const level = experience.level;
    const proficiency = level + 1;
    const spellAbility = String(state.character?.spellcastingAbility || "AWR").toLowerCase();
    const spellKey = {
      str: "strength",
      spd: "speed",
      vit: "vitality",
      int: "intelligence",
      awr: "awareness",
      tal: "talent",
    }[spellAbility] || "awareness";
    const spellcastingModifier = abilityModifiers[spellKey];
    const bonuses = {
      physicalDamage: numberValue(state.bonuses?.physicalDamage),
      hitPoints: numberValue(state.bonuses?.hitPoints),
      spellDamage: numberValue(state.bonuses?.spellDamage),
      armor: numberValue(state.bonuses?.armor),
      resistance: numberValue(state.bonuses?.resistance),
      evasion: numberValue(state.bonuses?.evasion),
      focus: numberValue(state.bonuses?.focus),
      criticalChance: numberValue(state.bonuses?.criticalChance),
      mana: numberValue(state.bonuses?.mana),
      moveSpeed: numberValue(state.bonuses?.moveSpeed),
    };

    const classContext = {
      level,
      vitality: abilityScores.vitality,
      proficiency,
      spellcastingModifier,
      equipmentSums,
      bonuses,
      speedModifier: abilityModifiers.speed,
    };
    const classStats = calculateClassProfile(state.character?.className, classContext);
    const allClassStats = {};
    Object.keys(CLASS_RULES).forEach((className) => {
      allClassStats[className] = calculateClassProfile(className, classContext);
    });

    const physicalDamage = level + bonuses.physicalDamage + equipmentSums.physicalDamage;
    const spellDamage = classStats.spellDamage;
    const evasion = (classStats.evasion > 0 ? classStats.evasion : 0) + bonuses.evasion;
    // Armor and resistance bonuses are already included by calculateClassProfile.
    // Re-adding them here doubled the selected bonus, while Rogue resistance also
    // inherited armor. Keep these as the finalized, independent class totals.
    const armor = classStats.armor;
    const resistance = classStats.resistance;
    const maxMana = classStats.maxMana + bonuses.mana;
    const focus = 4 + equipmentSums.focus + bonuses.focus;
    const criticalChance = 0.05 + equipmentSums.criticalChance + bonuses.criticalChance;

    const inventoryRows = (state.inventory || []).map((entry) => {
      const item = itemLookup(itemIndex, entry.name);
      const quantity = numberValue(entry.quantity);
      const calculatedWeight = item ? numberValue(item.weight) * quantity : 0;
      const weight = entry.weightOverride == null ? calculatedWeight : numberValue(entry.weightOverride);
      const value = item ? numberValue(item.value) * quantity : 0;
      return { ...entry, item, quantity, weight, value };
    });
    const inventoryWeight = inventoryRows.reduce((sum, row) => sum + row.weight, 0);
    const inventoryValue = inventoryRows.reduce((sum, row) => sum + row.value, 0);
    const currencyValue =
      numberValue(state.currency?.copper) * 0.1 +
      numberValue(state.currency?.silver) +
      numberValue(state.currency?.gold) * 10 +
      numberValue(state.currency?.platinum) * 100;
    const valuablesValue = [...(state.jewelry || []), ...(state.gems || [])].reduce(
      (sum, value) => sum + numberValue(value),
      0,
    );
    const totalBalance = currencyValue + inventoryValue + valuablesValue;

    const mediumEncumbrance = excelRoundUp(
      abilityScores.strength * 0.5 + numberValue(state.character?.weight) * 0.1,
      0,
    );
    const heavyEncumbrance = mediumEncumbrance * 2;
    const maximumEncumbrance = mediumEncumbrance * 3;
    const unencumberedMove =
      31 + bonuses.moveSpeed - excelRoundDown(numberValue(state.character?.weight) / 70, 0);
    let moveSpeed = unencumberedMove;
    let encumbranceLevel = "Light";
    if (inventoryWeight >= maximumEncumbrance) {
      moveSpeed = 0;
      encumbranceLevel = "Maximum";
    } else if (inventoryWeight >= heavyEncumbrance) {
      moveSpeed = excelRoundDown(unencumberedMove / 2, 0);
      encumbranceLevel = "Heavy";
    } else if (inventoryWeight >= mediumEncumbrance) {
      moveSpeed = excelRoundDown((unencumberedMove * 2) / 3, 0);
      encumbranceLevel = "Medium";
    }

    const skillScores = {};
    data.skills.forEach((skill) => {
      const input = state.skills?.[String(skill.sourceRow)] || {};
      const bonus = skill.ignoresBonus ? 0 : numberValue(input.bonus);
      skillScores[String(skill.sourceRow)] =
        abilityModifiers[skill.ability] + (input.proficient ? proficiency : 0) + bonus;
    });
    const cooking = calculateCooking(state, skillScores);
    const crafting = calculateCrafting(state, data);
    const savingThrows = {};
    data.abilityDefinitions.forEach((ability) => {
      const input = state.savingThrows?.[ability.id] || {};
      savingThrows[ability.id] =
        abilityModifiers[ability.id] + (input.proficient ? proficiency : 0) + numberValue(input.bonus);
    });

    const passivePerception = excelRoundUp(
      50 + average([skillScores["88"], skillScores["89"], skillScores["90"]]),
      0,
    );
    const passiveInsight = excelRoundUp(
      50 + average([skillScores["79"], skillScores["80"], skillScores["81"], skillScores["82"]]),
      0,
    );
    const passiveInvestigation = excelRoundUp(
      50 + average([skillScores["67"], skillScores["68"], skillScores["69"]]),
      0,
    );

    const accuracyKey = {
      STR: "strength",
      SPD: "speed",
      VIT: "vitality",
      INT: "intelligence",
      AWR: "awareness",
      TAL: "talent",
    }[state.damageTool?.accuracyAbility] || "strength";
    const accuracyScore = abilityScores[accuracyKey];
    const accuracyDebuff = numberValue(state.damageTool?.accuracyDebuff);
    const rollResults = (state.damageTool?.rolls || []).map((roll) => {
      const success = 100 - (accuracyScore - accuracyDebuff) > numberValue(roll) ? 0 : 1;
      return { roll, success, label: success ? "SUCCESS" : "FAIL" };
    });
    const successfulRolls = rollResults.reduce((sum, result) => sum + result.success, 0);
    const rollCount = numberValue(state.damageTool?.rollCount);
    const totalDamage = rollCount
      ? excelFloor(
          numberValue(state.damageTool?.multiplier) * physicalDamage * (successfulRolls / rollCount),
          1,
        )
      : NaN;
    const criticalRoll = numberValue(state.damageTool?.criticalRoll);
    const criticalStrike = criticalRoll <= criticalChance;

    const personality = calculatePersonality(state, data);
    const hunger = calculateHunger(state);
    const hearth = calculateHearth(state, data);
    hunger.standardRations = hunger.currentFood;
    hunger.hearthRations = hearth.pantry.reduce((sum, dish) => sum + numberValue(dish.left), 0);
    hunger.totalRations = hunger.standardRations + hunger.hearthRations;
    const survivalHistory = calculateSurvivalHistory(state, hunger, hearth);

    return {
      itemIndex,
      equippedItems,
      equipmentSums,
      abilityScores,
      abilityModifiers,
      abilityCosts,
      classStats,
      allClassStats,
      proficiency,
      experience,
      spellcastingModifier,
      stats: {
        maxHealth: classStats.maxHealth,
        physicalDamage,
        spellDamage,
        evasion,
        armor,
        resistance,
        maxMana,
        luck: 50 + equipmentSums.luck,
        focus,
        healthRegeneration: equipmentSums.healthRegeneration,
        criticalChance,
        spellSave: classStats.spellSave,
        moveSpeed,
        goldMultiplierText: `${formatNumber(equipmentSums.goldMultiplier, 0)}%`,
        xpMultiplierText: `${formatNumber(equipmentSums.xpMultiplier, 0)}%`,
      },
      inventory: {
        rows: inventoryRows,
        weight: inventoryWeight,
        value: inventoryValue,
        balance: totalBalance,
        thresholds: {
          medium: mediumEncumbrance,
          heavy: heavyEncumbrance,
          maximum: maximumEncumbrance,
        },
        encumbranceLevel,
      },
      skills: skillScores,
      savingThrows,
      passives: {
        perception: passivePerception,
        insight: passiveInsight,
        investigation: passiveInvestigation,
      },
      damageTool: {
        rollResults,
        successfulRolls,
        totalDamage,
        criticalRoll,
        criticalStrike,
      },
      personality,
      cooking,
      crafting,
      hunger,
      hearth,
      survivalHistory,
    };
  }

  global.AmutsuEngine = {
    calculate,
    createInventoryEntry,
    mergeInventorySlots,
    addInventorySlot,
    removeInventorySlot,
    addInventoryItem,
    availableInventoryItemNames,
    reconcileEquipmentWithInventory,
    mergePersonalitySlots,
    calculatePersonality,
    addPersonalityTrait,
    removePersonalityTrait,
    applyHearthMealEdit,
    normalizeTrackedConditions,
    setTrackedAilment,
    changeTrackedAilmentMark,
    normalizeSurvivalState,
    normalizeCharacterProgression,
    characterExperienceProgress,
    normalizeCookingState,
    normalizeCraftingState,
    calculateCrafting,
    previewCraftingCheck,
    rollCraftingCheck,
    recordCraftingResult,
    changeCraftingMaterial,
    setCraftingBlueprint,
    rollCraftingRecovery,
    recordCraftingRecovery,
    undoLastCraftingAction,
    calculateCooking,
    previewCookingCheck,
    rollCookingCheck,
    rerollCookingCheck,
    recordCookingResult,
    grantCookingTrainingXp,
    undoLastCookingAction,
    buyCookingKit,
    currencyBalanceInSilver,
    spendCurrencyInSilver,
    previewHungerDay,
    advanceHungerDay,
    resetDayCounter,
    eatHearthMeal,
    markHearthBoonUsed,
    completeLongRest,
    undoLastSurvivalAction,
    editSurvivalHistoryEntry,
    numberValue,
    formatNumber,
    abilityModifier,
    abilityCost,
    excelRoundUp,
    excelRoundDown,
    excelFloor,
    excelMround,
  };
})(window);
