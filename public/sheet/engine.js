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

  function numberValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value !== "string" || value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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
    const rule = CLASS_RULES[className] || CLASS_RULES.Rogue;
    const {
      level,
      vitality,
      proficiency,
      spellcastingModifier,
      equipmentSums,
      bonuses,
      speedModifier,
    } = context;

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

    const fullSpellDamage =
      proficiency + spellcastingModifier + equipmentSums.magicalDamage + bonuses.spellDamage;
    let spellDamage;
    if (rule.spellDamage === "half") {
      spellDamage = excelRoundDown(fullSpellDamage / 2, 0);
    } else if (rule.spellDamage === "cleric") {
      spellDamage = proficiency + equipmentSums.magicalDamage + bonuses.spellDamage + 1;
    } else if (rule.spellDamage === "equipmentOnly") {
      spellDamage = equipmentSums.magicalDamage + bonuses.spellDamage;
    } else {
      spellDamage = fullSpellDamage;
    }

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

  function calculateHunger(state) {
    const days = state.hunger?.days || [];
    let previousFood = numberValue(state.hunger?.startingRations);
    let previousHunger = 0;
    let populatedCount = 0;
    const results = days.map((day, index) => {
      if (isBlank(day.day)) {
        return { foodLeft: "", hunger: "", condition: "" };
      }
      populatedCount += 1;
      const gained = numberValue(day.foodGained);
      const eaten = numberValue(day.rationsEaten);
      const foodLeft = Math.max(0, previousFood + gained - eaten);
      const hunger = eaten >= 1 && previousFood + gained >= eaten ? 0 : previousHunger + 1;

      let condition = hungerCondition(hunger);
      if (index === 11) {
        if (isBlank(day.foodGained)) {
          condition = "";
        } else if (foodLeft >= 1 && previousHunger + eaten >= foodLeft) {
          condition = 0;
        } else {
          condition = "#VALUE!";
        }
      }

      previousFood = foodLeft;
      previousHunger = hunger;
      return { foodLeft, hunger, condition };
    });

    const currentFood = populatedCount ? previousFood : numberValue(state.hunger?.startingRations);
    const currentHunger = populatedCount ? previousHunger : 0;
    return {
      rows: results,
      currentFood,
      hunger: currentHunger,
      effect: hungerEffect(currentHunger),
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

      let effect;
      if (dishCount > numberValue(acquired[dishName])) {
        effect = "NO SERVING LEFT";
      } else if (restCount > 1) {
        effect = "MEAL EATEN: Hearth Boon already used this rest";
      } else {
        effect = dishesByName.get(dishName)?.effect || "#N/A";
      }
      return { effect };
    });

    const currentRest = String(state.hearth?.restCycle ?? "");
    const currentEntries = log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => String(entry.rest ?? "") === currentRest && entry.eaten === true);
    const activeEntry = currentEntries.find(({ entry }) => entry.boonUsed !== true);
    const status = currentEntries.length === 0 ? "AVAILABLE" : activeEntry ? "ACTIVE" : "USED";
    const activeMeal = activeEntry?.entry.dish || "None";
    const activeEffect = activeEntry ? rows[activeEntry.index].effect : "No active Hearth Boon";

    const pantry = data.food.dishes.map((dish) => {
      const consumed = dishConsumed.get(dish.name) || 0;
      const quantity = numberValue(acquired[dish.name]);
      return { ...dish, acquired: quantity, eaten: consumed, left: Math.max(0, quantity - consumed) };
    });

    return { rows, status, activeMeal, activeEffect, pantry };
  }

  function calculate(state, data) {
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
      abilityScores[definition.id] =
        definition.base + equipmentBonus + numberValue(state.abilityBonuses?.[definition.id]);
    });

    const abilityModifiers = {};
    const abilityCosts = {};
    Object.entries(abilityScores).forEach(([key, value]) => {
      abilityModifiers[key] = abilityModifier(value);
      abilityCosts[key] = abilityCost(value);
    });

    const level = numberValue(state.character?.level);
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
    const spellDamage = classStats.spellDamage + bonuses.spellDamage;
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
      hunger,
      hearth,
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
