(function bootstrapAmutsuApplication() {
  "use strict";

  const data = window.AMUTSU_DATA;
  const engine = window.AmutsuEngine;
  const storageKey = "amutsu-character-sheet:v2";
  const query = new URLSearchParams(window.location.search);
  const embedded = query.get("embedded") === "1" && window.parent !== window;
  const characterId = String(query.get("characterId") || "").trim();
  const viewerRole = query.get("viewerRole") === "dm" ? "dm" : "player";
  const canEditHistory = viewerRole === "dm";
  const sheetLocationKey = characterId
    ? `sesios-character-manager:sheet-location:v1:${characterId}`
    : "";
  const routes = {
    character: { label: "Character Sheet", render: renderCharacterPage },
    skills: { label: "Skills", render: renderSkillsPage },
    inventory: { label: "Inventory", render: renderInventoryPage },
    spells: { label: "Spells", render: renderSpellsPage },
    survival: { label: "Effects & Survival", render: renderSurvivalPage },
    traits: { label: "Personality Traits", render: renderTraitsPage },
    conditions: { label: "Rules & Conditions", render: renderConditionsPage },
    items: { label: "Item Catalogue", render: renderItemsPage },
    food: { label: "Hearthcraft", render: renderFoodPage },
    crafting: { label: "Crafter’s Ledger", render: renderCraftingPage },
  };
  const sheetLocation = loadSheetLocation();

  const ui = {
    route: routeFromHash(),
    spellLevel: "Cantrips",
    itemLimit: 48,
    foodView: "dishes",
    pantryIngredient: "",
    pantryAmount: 1,
    filters: {
      skillsQuery: "",
      skillsAbility: "All",
      traitsQuery: "",
      traitsGroup: "All",
      conditionsQuery: "",
      conditionsRegion: "All",
      conditionsType: "All",
      itemsQuery: "",
      itemsRarity: "All",
      itemsType: "All",
      foodQuery: "",
      foodRegion: "All",
      ingredientQuery: "",
      ingredientRegion: "All",
      ingredientCategory: "All",
      craftingQuery: "",
      craftingMaterialQuery: "",
      craftingMaterialRarity: "All",
      craftingMaterialTag: "All",
      craftingRecipeQuery: "",
      craftingRecipeCategory: "All",
      craftingRecipeRarity: "All",
      craftingRecipeDiscipline: "All",
    },
    filterTimer: null,
    saveTimer: null,
    locationTimer: null,
    showPantryManager: false,
    showAllSurvivalHistory: false,
    pendingMeal: "",
    editingHistoryId: "",
    showCookingReference: false,
    showCookingHistory: false,
    craftingView: "craft",
    crafting: {
      recipeId: "BSC-01",
      selections: {},
      assistant: false,
      workshop: false,
      lastResult: null,
      recovery: {
        sourceLabel: "Monster or searchable site",
        bonus: 0,
        help: false,
        maximumRarity: "Very Rare",
        materialId: "",
        lastResult: null,
      },
    },
    cooking: {
      recipeKey: "__basic",
      customName: "",
      cookingKit: true,
      ingredientSource: "pantry",
      assistant: false,
      professionalKitchen: false,
      writtenRecipe: true,
      poorConditions: false,
      underPressure: false,
      useCampCook: true,
      useHearthwright: true,
      lastResult: null,
    },
  };

  let state = loadState();
  engine.normalizeCharacterProgression(state);
  engine.normalizeSurvivalState(state);
  engine.reconcileEquipmentWithInventory(state);
  let derived = engine.calculate(state, data);

  const root = document.getElementById("route-root");
  const saveIndicator = document.getElementById("save-indicator");
  const saveText = document.getElementById("save-text");
  const headerCharacterName = document.getElementById("header-character-name");
  const pageEyebrow = document.getElementById("page-eyebrow");
  const mobileRoute = document.getElementById("mobile-route");
  const importFile = document.getElementById("import-file");
  const imageDialog = document.getElementById("image-dialog");
  const resetDialog = document.getElementById("reset-dialog");
  const longRestDialog = document.getElementById("long-rest-dialog");
  const advanceDayDialog = document.getElementById("advance-day-dialog");
  const hearthMealDialog = document.getElementById("hearth-meal-dialog");
  const historyEditDialog = document.getElementById("history-edit-dialog");
  const sheetPlayerBrand = document.getElementById("sheet-player-brand");
  const sheetPlayerInitial = document.getElementById("sheet-player-initial");
  const sheetPlayerName = document.getElementById("sheet-player-name");

  if (!data || !engine || !root) {
    throw new Error("The workbook data or calculation engine failed to load.");
  }

  bindApplicationEvents();
  bindOnlineBridge();
  rememberSheetRoute(ui.route);
  renderRoute({ restoreStoredScroll: true });

  if (embedded) {
    window.parent.postMessage({ type: "amutsu:ready" }, window.location.origin);
  }

  function routeFromHash() {
    const candidate = window.location.hash.replace(/^#/, "");
    if (routes[candidate]) return candidate;
    return routes[sheetLocation.route] ? sheetLocation.route : "character";
  }

  function loadSheetLocation() {
    const fallback = { route: "", scrollPositions: {} };
    if (!sheetLocationKey) return fallback;
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(sheetLocationKey) || "null");
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        route: typeof parsed.route === "string" ? parsed.route : "",
        scrollPositions:
          parsed.scrollPositions && typeof parsed.scrollPositions === "object"
            ? { ...parsed.scrollPositions }
            : {},
      };
    } catch (error) {
      return fallback;
    }
  }

  function writeSheetLocation() {
    if (!sheetLocationKey) return;
    try {
      window.sessionStorage.setItem(sheetLocationKey, JSON.stringify(sheetLocation));
    } catch (error) {
      // Navigation still works when session storage is unavailable.
    }
  }

  function rememberSheetRoute(route) {
    if (!routes[route]) return;
    sheetLocation.route = route;
    writeSheetLocation();
  }

  function rememberSheetScroll(route = ui.route, scrollTop = window.scrollY) {
    if (!routes[route]) return;
    const top = Number(scrollTop);
    sheetLocation.scrollPositions[route] = Number.isFinite(top) ? Math.max(0, top) : 0;
    writeSheetLocation();
  }

  function captureSheetLocation() {
    window.clearTimeout(ui.locationTimer);
    rememberSheetRoute(ui.route);
    rememberSheetScroll(ui.route, window.scrollY);
  }

  function scheduleSheetScrollSave() {
    window.clearTimeout(ui.locationTimer);
    const route = ui.route;
    const scrollTop = window.scrollY;
    ui.locationTimer = window.setTimeout(() => rememberSheetScroll(route, scrollTop), 120);
  }

  function restoreSheetScroll(route = ui.route) {
    const top = Number(sheetLocation.scrollPositions[route]);
    const scrollTop = Number.isFinite(top) ? Math.max(0, top) : 0;
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeWithDefaults(defaultValue, suppliedValue, path = "") {
    if (Array.isArray(defaultValue)) {
      if (path === "activeAilments" && !Array.isArray(suppliedValue)) {
        return undefined;
      }
      if (path === "inventory") {
        return engine.mergeInventorySlots(defaultValue, suppliedValue);
      }
      if (path === "personality") {
        return engine.mergePersonalitySlots(defaultValue, suppliedValue);
      }
      if (
        path === "hunger.days" ||
        path === "hearth.log" ||
        path === "survivalHistory" ||
        path === "cooking.history" ||
        path === "cooking.familiarRecipes" ||
        path === "cooking.ownedUtensils" ||
        path === "crafting.knownBlueprints" ||
        path === "crafting.history"
      ) {
        return clone(Array.isArray(suppliedValue) ? suppliedValue : defaultValue);
      }
      const supplied = Array.isArray(suppliedValue) ? suppliedValue : [];
      return defaultValue.map((item, index) =>
        mergeWithDefaults(item, supplied[index], `${path}.${index}`),
      );
    }
    if (defaultValue && typeof defaultValue === "object") {
      if (
        path === "abilityBaseScores" &&
        (!suppliedValue || typeof suppliedValue !== "object" || Array.isArray(suppliedValue))
      ) {
        // Legacy online characters predate per-character base rolls. Leaving this
        // undefined makes the engine use the original workbook bases for them.
        return undefined;
      }
      const supplied = suppliedValue && typeof suppliedValue === "object" ? suppliedValue : {};
      const merged = {};
      Object.keys(defaultValue).forEach((key) => {
        const childPath = path ? `${path}.${key}` : key;
        merged[key] = mergeWithDefaults(defaultValue[key], supplied[key], childPath);
      });
      if (
        path === "hearth.acquired" ||
        path === "cooking.ingredientPantry" ||
        path === "crafting.materialInventory"
      ) {
        Object.keys(supplied).forEach((key) => {
          if (!(key in merged)) merged[key] = supplied[key];
        });
      }
      if (path === "hunger") {
        if (!Object.hasOwn(supplied, "currentDay")) merged.currentDay = "";
        if (!Object.hasOwn(supplied, "eatRationToday")) delete merged.eatRationToday;
        if (!Object.hasOwn(supplied, "hearthMealsEatenToday")) {
          delete merged.hearthMealsEatenToday;
        }
      }
      return merged;
    }
    if (path === "character.experience" && suppliedValue === undefined) return undefined;
    return suppliedValue === undefined ? defaultValue : suppliedValue;
  }

  function loadState() {
    const fallback = clone(data.defaultState);
    if (embedded) return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const supplied = parsed.state || parsed;
      return mergeWithDefaults(fallback, supplied);
    } catch (error) {
      return fallback;
    }
  }

  function scheduleSave() {
    window.clearTimeout(ui.saveTimer);
    saveIndicator.classList.add("is-saving");
    saveText.textContent = embedded ? "Saving online…" : "Saving…";
    ui.saveTimer = window.setTimeout(flushScheduledSave, 180);
  }

  function flushScheduledSave() {
    if (ui.saveTimer == null) return false;
    window.clearTimeout(ui.saveTimer);
    ui.saveTimer = null;
    if (embedded) {
      window.parent.postMessage(
        { type: "amutsu:state-change", state: clone(state) },
        window.location.origin,
      );
      return true;
    }
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ schemaVersion: state.schemaVersion, savedAt: new Date().toISOString(), state }),
      );
      saveIndicator.classList.remove("is-saving");
      saveText.textContent = "Saved locally";
    } catch (error) {
      saveIndicator.classList.remove("is-saving");
      saveText.textContent = "Local save unavailable";
    }
    return true;
  }

  function bindOnlineBridge() {
    if (!embedded) return;
    const sidebarNote = document.querySelector(".sidebar-foot small");
    if (sidebarNote) sidebarNote.textContent = "Character calculations update automatically";
    saveText.textContent = "Connecting…";

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type === "amutsu:load") {
        captureSheetLocation();
        updateSheetPlayerIdentity(event.data.ownerName);
        applyCataloguePayload(event.data.catalogues);
        state = mergeWithDefaults(clone(data.defaultState), event.data.state || {});
        engine.normalizeCharacterProgression(state);
        engine.normalizeSurvivalState(state);
        recalculate();
        saveIndicator.classList.remove("is-saving");
        saveText.textContent = "Saved online";
        renderRoute({ restoreStoredScroll: true });
      }
      if (event.data?.type === "amutsu:save-status") {
        saveIndicator.classList.toggle("is-saving", event.data.status === "saving");
        saveText.textContent = event.data.message || (event.data.status === "error" ? "Online save failed" : "Saved online");
      }
      if (event.data?.type === "amutsu:flush-request") {
        flushScheduledSave();
        window.parent.postMessage(
          { type: "amutsu:flush-complete", requestId: event.data.requestId },
          window.location.origin,
        );
      }
    });
  }

  function updateSheetPlayerIdentity(value) {
    const name = String(value || "").trim();
    if (!name) return;
    if (sheetPlayerName) sheetPlayerName.textContent = name;
    if (sheetPlayerInitial) sheetPlayerInitial.textContent = name.slice(0, 1).toUpperCase();
    if (sheetPlayerBrand) sheetPlayerBrand.setAttribute("aria-label", `${name} Character Sheet home`);
  }

  function applyCataloguePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (Array.isArray(payload.traits)) data.traits = clone(payload.traits);
    if (Array.isArray(payload.conditions)) data.conditions = clone(payload.conditions);
    if (Array.isArray(payload.items)) data.items = clone(payload.items);
    if (payload.food && typeof payload.food === "object") {
      data.food = { ...data.food, ...clone(payload.food) };
    }
    if (payload.crafting && typeof payload.crafting === "object") {
      const suppliedCrafting = clone(payload.crafting);
      if (!Array.isArray(suppliedCrafting.materials) || !suppliedCrafting.materials.length) delete suppliedCrafting.materials;
      if (!Array.isArray(suppliedCrafting.recipes) || !suppliedCrafting.recipes.length) delete suppliedCrafting.recipes;
      if (!Array.isArray(suppliedCrafting.legendaryConcepts) || !suppliedCrafting.legendaryConcepts.length) delete suppliedCrafting.legendaryConcepts;
      data.crafting = { ...data.crafting, ...suppliedCrafting };
    }
  }

  function getPath(object, path) {
    if (!path) return object;
    return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
  }

  function setPath(object, path, value) {
    const parts = path.split(".");
    let target = object;
    parts.slice(0, -1).forEach((part, index) => {
      if (target[part] == null) {
        target[part] = /^\d+$/.test(parts[index + 1]) ? [] : {};
      }
      target = target[part];
    });
    target[parts[parts.length - 1]] = value;
  }

  function inputValue(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.dataset.valueType === "number" || input.type === "number") {
      return input.value === "" ? "" : Number(input.value);
    }
    return input.value;
  }

  function recalculate() {
    engine.normalizeCharacterProgression(state);
    engine.normalizeSurvivalState(state);
    engine.reconcileEquipmentWithInventory(state);
    derived = engine.calculate(state, data);
  }

  function bindApplicationEvents() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.route));
    });

    document.querySelectorAll("[data-route-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigate(link.dataset.routeLink);
      });
    });

    mobileRoute.addEventListener("change", () => navigate(mobileRoute.value));
    document.getElementById("export-button").addEventListener("click", exportState);
    document.getElementById("import-button").addEventListener("click", () => importFile.click());
    document.getElementById("reset-button").addEventListener("click", requestReset);
    document.getElementById("cancel-reset-button").addEventListener("click", () => resetDialog.close());
    document.getElementById("confirm-reset-button").addEventListener("click", () => {
      resetDialog.close();
      resetState();
    });
    document.getElementById("confirm-long-rest-button").addEventListener("click", confirmLongRest);
    document.getElementById("confirm-advance-day-button").addEventListener("click", confirmAdvanceDay);
    document.getElementById("confirm-hearth-meal-button").addEventListener("click", confirmHearthMeal);
    document.getElementById("save-history-edit-button").addEventListener("click", saveHistoryEdit);
    document.querySelectorAll("[data-survival-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    });
    importFile.addEventListener("change", importState);

    root.addEventListener("input", (event) => {
      const input = event.target.closest("[data-bind]");
      if (input) {
        setPath(state, input.dataset.bind, inputValue(input));
        recalculate();
        refreshComputedBindings();
        scheduleSave();
      }

      const filter = event.target.closest("[data-filter]");
      if (filter) {
        ui.filters[filter.dataset.filter] = filter.value;
        scheduleFilterRender(filter);
      }
    });

    root.addEventListener("change", (event) => {
      const cookingStateControl = event.target.closest("[data-cooking-state]");
      if (cookingStateControl) {
        const key = cookingStateControl.dataset.cookingState;
        state.cooking[key] = cookingStateControl.value;
        ui.cooking.lastResult = null;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const ownedUtensil = event.target.closest("[data-owned-utensil]");
      if (ownedUtensil) {
        const name = ownedUtensil.dataset.ownedUtensil;
        const owned = new Set(state.cooking.ownedUtensils || []);
        if (ownedUtensil.checked) owned.add(name);
        else owned.delete(name);
        state.cooking.ownedUtensils = [...owned].sort((left, right) => left.localeCompare(right));
        ui.cooking.lastResult = null;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const pantryControl = event.target.closest("[data-pantry-control]");
      if (pantryControl) {
        const key = pantryControl.dataset.pantryControl;
        ui[key] = pantryControl.dataset.valueType === "number"
          ? Math.max(1, Math.floor(engine.numberValue(pantryControl.value) || 1))
          : pantryControl.value;
        return;
      }

      const cookingControl = event.target.closest("[data-cooking-control]");
      if (cookingControl) {
        const key = cookingControl.dataset.cookingControl;
        const value = cookingControl.type === "checkbox" ? cookingControl.checked : cookingControl.value;
        ui.cooking[key] = value;
        ui.cooking.lastResult = null;
        renderRoute({ preserveScroll: true });
        return;
      }

      const craftingBonus = event.target.closest("[data-crafting-bonus]");
      if (craftingBonus) {
        state.crafting.disciplineBonuses[craftingBonus.dataset.craftingBonus] = engine.numberValue(craftingBonus.value);
        ui.crafting.lastResult = null;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const craftingTool = event.target.closest("[data-crafting-tool]");
      if (craftingTool) {
        state.crafting.ownedToolKits[craftingTool.dataset.craftingTool] = craftingTool.checked;
        ui.crafting.lastResult = null;
        ui.crafting.recovery.lastResult = null;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const craftingBlueprint = event.target.closest("[data-crafting-blueprint]");
      if (craftingBlueprint) {
        engine.setCraftingBlueprint(state, craftingBlueprint.dataset.craftingBlueprint, craftingBlueprint.checked);
        ui.crafting.lastResult = null;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const craftingRequirement = event.target.closest("[data-crafting-requirement]");
      if (craftingRequirement) {
        ui.crafting.selections[Number(craftingRequirement.dataset.craftingRequirement)] = craftingRequirement.value;
        ui.crafting.lastResult = null;
        renderRoute({ preserveScroll: true });
        return;
      }

      const craftingControl = event.target.closest("[data-crafting-control]");
      if (craftingControl) {
        const key = craftingControl.dataset.craftingControl;
        ui.crafting[key] = craftingControl.type === "checkbox" ? craftingControl.checked : craftingControl.value;
        if (key === "recipeId") ui.crafting.selections = {};
        ui.crafting.lastResult = null;
        renderRoute({ preserveScroll: true });
        return;
      }

      const legendaryProjectControl = event.target.closest("[data-legendary-project-control]");
      if (legendaryProjectControl) {
        const key = legendaryProjectControl.dataset.legendaryProjectControl;
        state.crafting.legendaryProject[key] = legendaryProjectControl.type === "checkbox"
          ? legendaryProjectControl.checked
          : legendaryProjectControl.value;
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        return;
      }

      const recoveryControl = event.target.closest("[data-recovery-control]");
      if (recoveryControl) {
        const key = recoveryControl.dataset.recoveryControl;
        ui.crafting.recovery[key] = recoveryControl.type === "checkbox"
          ? recoveryControl.checked
          : recoveryControl.type === "number"
            ? engine.numberValue(recoveryControl.value)
            : recoveryControl.value;
        if (key !== "materialId") ui.crafting.recovery.lastResult = null;
        renderRoute({ preserveScroll: true });
        return;
      }

      const ailmentSelect = event.target.closest("[data-ailment-select]");
      if (ailmentSelect) {
        const result = engine.setTrackedAilment(
          state,
          Number(ailmentSelect.dataset.ailmentIndex),
          ailmentSelect.value,
        );
        if (!result.accepted) {
          showToast("That ailment slot could not be updated.", "error");
          return;
        }
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        showToast(
          result.resolved
            ? "Ailment resolved and removed."
            : `${result.ailment.name} added at Mark 1.`,
          "success",
        );
        return;
      }

      const inventoryEquipCheckbox = event.target.closest("[data-inventory-equip]");
      if (inventoryEquipCheckbox) {
        const index = Number(inventoryEquipCheckbox.dataset.inventoryEquip);
        const result = applyInventoryEquipToggle(index, inventoryEquipCheckbox.checked);
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });
        if (result?.message) showToast(result.message, result.changed ? "success" : "error");
        return;
      }

      const input = event.target.closest("[data-bind]");
      if (input) {
        setPath(state, input.dataset.bind, inputValue(input));
        recalculate();
        refreshComputedBindings();
        scheduleSave();
      }

      // Note: filter inputs (search boxes and <select> dropdowns) are intentionally
      // NOT handled here. The "input" listener above already updates ui.filters and
      // triggers the surgical results refresh for both typing and <select> changes
      // (select elements fire "input" as well as "change"). Re-running that refresh
      // here too would rebuild the results grid at the exact moment a search box
      // blurs — i.e. the instant the user clicks a result's action button — which
      // silently swallowed that click because the button was destroyed mid-gesture,
      // between mousedown and mouseup.
    });

    root.addEventListener("click", handleRouteAction);

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => imageDialog.close());
    });
    imageDialog.addEventListener("click", (event) => {
      if (event.target === imageDialog) imageDialog.close();
    });
    resetDialog.addEventListener("click", (event) => {
      if (event.target === resetDialog) resetDialog.close();
    });
    [longRestDialog, advanceDayDialog, hearthMealDialog, historyEditDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    window.addEventListener("hashchange", () => {
      const route = routeFromHash();
      if (route !== ui.route) {
        captureSheetLocation();
        ui.route = route;
        rememberSheetRoute(route);
        renderRoute({ restoreStoredScroll: true });
      }
    });
    window.addEventListener("scroll", scheduleSheetScrollSave, { passive: true });
    window.addEventListener("pagehide", () => {
      captureSheetLocation();
      flushScheduledSave();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        captureSheetLocation();
        flushScheduledSave();
      }
    });
  }

  function scheduleFilterRender(input) {
    window.clearTimeout(ui.filterTimer);
    const filterName = input.dataset.filter;
    ui.filterTimer = window.setTimeout(() => {
      updateFilteredResults(filterName);
    }, 120);
  }

  // Updates only the results grid/count for a filter change, instead of
  // re-rendering (and therefore destroying and recreating) the whole page.
  // This is what stops a search box's caret from being reset to position 0
  // on every keystroke, which was causing typed text to appear reversed.
  function updateFilteredResults(filterName) {
    if (ui.route === "traits") {
      renderTraitsResults();
      return;
    }
    if (ui.route === "skills") {
      renderSkillsResults();
      return;
    }
    if (ui.route === "conditions") {
      renderConditionsResults();
      return;
    }
    if (ui.route === "items") {
      renderItemsResults();
      return;
    }
    if (ui.route === "food") {
      if (ui.foodView === "ingredients") renderIngredientResults();
      else renderFoodResults();
      return;
    }
    if (ui.route === "crafting") {
      renderCraftingResults();
      return;
    }
    // Fallback path, kept in case a future filtered page hasn't been
    // migrated to a surgical results-only update yet.
    const active = document.activeElement;
    const selectionStart = active && active.dataset && active.dataset.filter === filterName ? active.selectionStart : null;
    const selectionEnd = active && active.dataset && active.dataset.filter === filterName ? active.selectionEnd : null;
    renderRoute({ preserveScroll: true, restoreFilter: filterName, selectionStart, selectionEnd });
  }

  function renderTraitsResults() {
    const query = ui.filters.traitsQuery.trim().toLowerCase();
    const selectedGroup = ui.filters.traitsGroup;
    const traits = data.traits.filter((trait) => {
      const matchesQuery = !query || `${trait.name} ${trait.benefit} ${trait.drawback}`.toLowerCase().includes(query);
      return matchesQuery && (selectedGroup === "All" || trait.group === selectedGroup);
    });
    const grid = root.querySelector('[data-filter-results="traits"]');
    const count = root.querySelector('[data-filter-count="traits"]');
    if (grid) {
      grid.innerHTML = traits.map(renderTraitCard).join("") ||
        `<div class="empty-state"><strong>No matching traits</strong><span>Change the search or group filter.</span></div>`;
    }
    if (count) count.textContent = `${traits.length} of ${data.traits.length} traits`;
  }

  function renderTraitCard(trait) {
    return `<article class="catalog-card trait-card" data-group="${escapeHtml(trait.group)}">
        <header class="trait-card-head"><div><div class="card-meta"><span class="pill">${escapeHtml(trait.group)}</span></div><h2>${escapeHtml(trait.name)}</h2></div><span class="trait-cost" aria-label="Cost ${escapeHtml(trait.cost)}">${escapeHtml(trait.cost)}</span></header>
        <div class="trait-effect"><strong>Benefit</strong><p>${escapeHtml(trait.benefit)}</p></div>
        <div class="trait-drawback"><strong>Drawback</strong><p>${escapeHtml(trait.drawback)}</p></div>
        <div class="card-actions"><button class="button button-primary button-small" type="button" data-action="add-trait" data-name="${escapeHtml(trait.name)}">Add to character</button></div>
      </article>`;
  }

  function navigate(route) {
    if (!routes[route]) return;
    captureSheetLocation();
    ui.route = route;
    rememberSheetRoute(route);
    if (window.location.hash !== `#${route}`) {
      window.history.pushState(null, "", `#${route}`);
    }
    renderRoute({ restoreStoredScroll: true });
    document.getElementById("main-content").focus({ preventScroll: true });
  }

  function renderRoute(options) {
    const config = options || {};
    const previousScroll = config.preserveScroll ? window.scrollY : 0;
    recalculate();
    root.innerHTML = routes[ui.route].render();
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.route === ui.route);
      if (button.dataset.route === ui.route) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    mobileRoute.value = ui.route;
    pageEyebrow.textContent = routes[ui.route].label;
    headerCharacterName.textContent = state.character.name || "Unnamed Character";
    document.title = `${routes[ui.route].label} · Amutsu`;
    refreshComputedBindings();

    if (config.preserveScroll) {
      window.scrollTo({ top: previousScroll });
    } else if (config.restoreStoredScroll) {
      restoreSheetScroll(ui.route);
    }
    if (config.restoreFilter) {
      window.requestAnimationFrame(() => {
        const input = root.querySelector(`[data-filter="${config.restoreFilter}"]`);
        if (!input) return;
        input.focus({ preventScroll: true });
        if (typeof input.setSelectionRange === "function" && config.selectionStart != null) {
          input.setSelectionRange(config.selectionStart, config.selectionEnd);
        }
      });
    }
  }

  function refreshComputedBindings() {
    root.querySelectorAll("[data-output]").forEach((element) => {
      const value = getPath(derived, element.dataset.output);
      element.textContent = formatOutput(value, element.dataset.format);
    });

    root.querySelectorAll(".ability-score[data-output]").forEach((element) => {
      const value = getPath(derived, element.dataset.output);
      element.dataset.scoreBand = abilityScoreBand(value);
    });

    root.querySelectorAll("[data-metric-note]").forEach((element) => {
      element.textContent = metricNoteText(element.dataset.metricNote);
    });

    root.querySelectorAll("[data-equipment-index]").forEach((element) => {
      const item = derived.equippedItems[Number(element.dataset.equipmentIndex)];
      element.innerHTML = equipmentDetailsMarkup(item);
    });

    root.querySelectorAll("[data-inventory-meta]").forEach((element) => {
      const index = Number(element.dataset.inventoryMeta);
      const row = derived.inventory.rows[index];
      const meta = inventoryRowMeta(row);
      const field = element.dataset.inventoryField;
      element.innerHTML = meta[field] ?? "";
    });

    root.querySelectorAll("[data-inventory-equip]").forEach((checkbox) => {
      const entry = state.inventory[Number(checkbox.dataset.inventoryEquip)];
      checkbox.checked = entry?.equipped === true;
    });

    root.querySelectorAll("[data-roll-result]").forEach((element) => {
      const index = Number(element.dataset.rollResult);
      const result = derived.damageTool.rollResults[index];
      const wrapper = element.closest(".damage-roll");
      const active = index < Math.max(0, Math.min(7, Math.floor(engine.numberValue(state.damageTool.rollCount))));
      element.textContent = active ? result?.label || "FAIL" : "INACTIVE";
      wrapper?.classList.toggle("is-success", active && result?.success === 1);
      wrapper?.classList.toggle("is-fail", active && result?.success !== 1);
      wrapper?.classList.toggle("is-inactive", !active);
      const input = wrapper?.querySelector("input");
      if (input) input.disabled = !active;
    });

    const meter = root.querySelector("[data-encumbrance-meter]");
    if (meter) {
      const maximum = derived.inventory.thresholds.maximum || 1;
      meter.style.width = `${Math.min(100, (derived.inventory.weight / maximum) * 100)}%`;
    }

    root.querySelectorAll("[data-hearth-status]").forEach((element) => {
      element.classList.remove("status-available", "status-active", "status-used");
      element.classList.add(`status-${derived.hearth.status.toLowerCase()}`);
      element.textContent = derived.hearth.status;
    });

    const dayPreview = engine.previewHungerDay(state);
    root.querySelectorAll("[data-day-preview-equation]").forEach((element) => {
      element.textContent = `${dayPreview.currentFood} standard + ${dayPreview.foodGained} gained − ${dayPreview.rationEaten} standard eaten = ${dayPreview.foodAfter} standard; ${dayPreview.hearthRations} Hearth; ${dayPreview.totalAfter} total`;
    });
    root.querySelectorAll("[data-day-preview-condition]").forEach((element) => {
      const hearthNote = dayPreview.hearthMealsEaten
        ? ` · ${dayPreview.hearthMealsEaten} Hearth meal${dayPreview.hearthMealsEaten === 1 ? "" : "s"} eaten today`
        : "";
      element.textContent = `${dayPreview.condition} — ${dayPreview.effect}${hearthNote}`;
    });
    root.querySelectorAll("[data-day-advance-label]").forEach((element) => {
      element.textContent = `Advance to Day ${dayPreview.nextDay}`;
    });
    root.querySelectorAll("[data-ration-toggle]").forEach((element) => {
      element.disabled = dayPreview.availableStandardFood < 1 || dayPreview.hearthMealsEaten > 0;
    });
    root.querySelectorAll("[data-ration-toggle-copy]").forEach((element) => {
      element.textContent = dayPreview.hearthMealsEaten > 0
        ? "A Hearth meal already satisfies today’s ration."
        : dayPreview.availableStandardFood < 1
          ? "No standard ration is available. Eat a meal from the pantry instead."
          : "Consumes one standard ration only.";
    });
    root.querySelectorAll("[data-total-rations]").forEach((element) => {
      element.textContent = formatOutput(derived.hunger.totalRations, "integer");
    });
    root.querySelectorAll("[data-ration-breakdown]").forEach((element) => {
      element.textContent = `${formatOutput(derived.hunger.standardRations, "integer")} standard + ${formatOutput(derived.hunger.hearthRations, "integer")} Hearth`;
    });
    root.querySelectorAll("[data-hearth-selected-preview]").forEach((element) => {
      const selected = data.food.dishes.find((dish) => dish.name === state.hearth.selectedDish);
      element.textContent = selected?.effect || "Choose an owned meal to preview its effect.";
    });
    root.querySelectorAll("[data-eat-selected-meal]").forEach((element) => {
      const selected = derived.hearth.pantry.find(
        (dish) => dish.name === state.hearth.selectedDish && dish.left > 0,
      );
      element.disabled = !selected;
    });

    headerCharacterName.textContent = state.character.name || "Unnamed Character";
  }

  function formatOutput(value, format) {
    if (value === undefined || value === null || Number.isNaN(value)) return "#N/A";
    if (format === "signed") {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? `+${numeric}` : String(value);
    }
    if (format === "percent") return `${engine.formatNumber(Number(value) * 100, 2)}%`;
    if (format === "feet") return `${engine.formatNumber(Number(value), 0)} ft`;
    if (format === "sp") return `${engine.formatNumber(Number(value), 1)} SP`;
    if (format === "kg") return `${engine.formatNumber(Number(value), 1)} kg`;
    if (format === "integer") return engine.formatNumber(Number(value), 0);
    if (format === "decimal") return engine.formatNumber(Number(value), 2);
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function titleCase(value) {
    return String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (character) => character.toUpperCase());
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }

  function renderOptions(options, selected, placeholder) {
    const values = [...options];
    if (selected && !values.includes(selected)) values.unshift(selected);
    const placeholderOption = placeholder != null
      ? `<option value="">${escapeHtml(placeholder)}</option>`
      : "";
    return (
      placeholderOption +
      values
        .map(
          (option) =>
            `<option value="${escapeHtml(option)}" ${String(option) === String(selected) ? "selected" : ""}>${escapeHtml(option)}</option>`,
        )
        .join("")
    );
  }

  function field(label, path, value, options) {
    const config = options || {};
    const id = `field-${slug(path)}`;
    const className = ["field", config.className || ""].filter(Boolean).join(" ");
    const hint = config.hint ? `<small class="field-hint" id="${id}-hint">${escapeHtml(config.hint)}</small>` : "";
    const describedBy = config.hint ? `aria-describedby="${id}-hint"` : "";
    let control;
    if (config.type === "select") {
      control = `<select id="${id}" data-bind="${escapeHtml(path)}" ${describedBy}>${renderOptions(config.options || [], value, config.placeholder)}</select>`;
    } else if (config.type === "textarea") {
      control = `<textarea id="${id}" data-bind="${escapeHtml(path)}" placeholder="${escapeHtml(config.placeholder || "")}" ${describedBy}>${escapeHtml(value)}</textarea>`;
    } else {
      const inputType = config.type || "text";
      const numericAttributes = inputType === "number"
        ? `data-value-type="number" ${config.min != null ? `min="${config.min}"` : ""} ${config.max != null ? `max="${config.max}"` : ""} ${config.step != null ? `step="${config.step}"` : 'step="any"'}`
        : "";
      control = `<input id="${id}" type="${inputType}" data-bind="${escapeHtml(path)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(config.placeholder || "")}" ${numericAttributes} ${describedBy} />`;
    }
    const labelText = label || config.ariaLabel || titleCase(path.split(".").pop());
    const labelClass = label ? "" : ' class="visually-hidden"';
    return `<div class="${className}"><label${labelClass} for="${id}">${escapeHtml(labelText)}</label>${control}${hint}</div>`;
  }

  function output(path, format, className) {
    const value = getPath(derived, path);
    return `<output class="${className || "derived-output"}" data-output="${escapeHtml(path)}" ${format ? `data-format="${format}"` : ""}>${escapeHtml(formatOutput(value, format))}</output>`;
  }

  function checkbox(path, checked, label) {
    const id = `check-${slug(path)}`;
    return `<label class="checkbox-label" for="${id}"><input id="${id}" type="checkbox" data-bind="${escapeHtml(path)}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
  }

  function pageHeading(kicker, title, description, actions) {
    return `<header class="page-heading"><div><p class="page-kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-heading-actions">${actions}</div>` : ""}</header>`;
  }

  function inventoryRowMeta(row) {
    const item = row?.item;
    return {
      rarity: rarityMarkup(item?.rarity),
      type: escapeHtml(item?.type || "-"),
      description: escapeHtml(
        item ? equipmentSummary(item) || item.tags || "Catalogue item" : "Enter a catalogue item name",
      ),
    };
  }

  function equipmentSummary(item) {
    const parts = [item.rarity, item.type];
    if (engine.numberValue(item.armor)) parts.push(`AC +${item.armor}`);
    if (engine.numberValue(item.resistance)) parts.push(`RES +${item.resistance}`);
    if (engine.numberValue(item.evasion)) parts.push(`EVA +${item.evasion}`);
    if (engine.numberValue(item.strength)) parts.push(`STR +${item.strength}`);
    if (engine.numberValue(item.speed)) parts.push(`SPD +${item.speed}`);
    if (engine.numberValue(item.vitality)) parts.push(`VIT +${item.vitality}`);
    return parts.filter(Boolean).join(" · ");
  }

  function equipmentSlotIcon(slotId) {
    const icons = {
      righthand: `<path d="m14.8 4.1 5.1-1.3-1.3 5.1-8.8 8.8-2.5-2.5Z" /><path d="m6.2 13.3 4.5 4.5" /><path d="m5.3 16.8-2.4 2.4" />`,
      lefthand: `<path d="M12 2.8 19.3 6v5.2c0 4.6-2.9 8-7.3 9.7-4.4-1.7-7.3-5.1-7.3-9.7V6Z" /><path d="M12 6.2v10.7" />`,
      headgear: `<path d="M4 13.5V10a8 8 0 0 1 16 0v3.5" /><path d="M4 12.5h4v4H4Zm12 0h4v4h-4Z" /><path d="M8 16.5h8" />`,
      plate: `<path d="m8 3 4 2 4-2 4 4-2.3 3v10H6.3V10L4 7Z" /><path d="M9 5.2 12 9l3-3.8M12 9v11" />`,
      footwear: `<path d="M7.2 3v9.3L4 15.7V20h16v-1.5c0-2-1.8-3.2-4.2-3.2h-2.5l-2.1-3.8V3Z" /><path d="M4 17.2h15" />`,
      trinket: `<path d="m12 3 6.5 6.5L12 21 5.5 9.5Z" /><path d="M5.5 9.5h13M9 9.5 12 3l3 6.5L12 21Z" />`,
      secondarytrinket: `<circle cx="9" cy="12" r="5.2" /><circle cx="15" cy="12" r="5.2" /><path d="m12 5.5 2-2 2 2-2 2Z" />`,
      necklace: `<path d="M5 4.5c.6 6.2 2.8 9.3 7 9.3s6.4-3.1 7-9.3" /><path d="m12 13.8 3 3.1-3 4.1-3-4.1Z" />`,
    };
    const icon = icons[slotId] || icons.trinket;
    return `<span class="equipment-slot-icon is-${slug(slotId)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${icon}</svg></span>`;
  }

  function hasEquipmentStat(value, format) {
    if (format === "raw") {
      const text = String(value ?? "").trim();
      return text !== "" && text !== "-" && text !== "–";
    }
    const numeric = engine.numberValue(value);
    return format === "wholePercent" ? Math.round(numeric) !== 0 : numeric !== 0;
  }

  function formatEquipmentStat(value, format) {
    if (format === "raw") return String(value);
    const numeric = engine.numberValue(value);
    if (format === "fractionPercent") {
      const percentage = numeric * 100;
      return `${percentage > 0 ? "+" : ""}${engine.formatNumber(percentage, 2)}%`;
    }
    if (format === "wholePercent") {
      const percentage = Math.round(numeric);
      return `${percentage > 0 ? "+" : ""}${engine.formatNumber(percentage, 0)}%`;
    }
    if (format === "plain") return engine.formatNumber(numeric, 2);
    return `${numeric > 0 ? "+" : ""}${engine.formatNumber(numeric, 2)}`;
  }

  function equipmentDetailsMarkup(item) {
    if (!item?.name) return `<span class="equipment-empty">No item equipped</span>`;
    const definitions = [
      ["DMG", "Physical damage", item.physicalDamage, "raw"],
      ["MAG", "Magical damage", item.magicalDamage, "raw"],
      ["CRIT", "Critical chance", item.criticalChance, "fractionPercent"],
      ["AC", "Armor", item.armor, "number"],
      ["RES", "Resistance", item.resistance, "number"],
      ["EVA", "Evasion", item.evasion, "number"],
      ["STR", "Strength", item.strength, "number"],
      ["SPD", "Speed", item.speed, "number"],
      ["VIT", "Vitality", item.vitality, "number"],
      ["INT", "Intelligence", item.intelligence, "number"],
      ["AWR", "Awareness", item.awareness, "number"],
      ["TAL", "Talent", item.talent, "number"],
      ["LCK", "Luck", item.luck, "number"],
      ["FOC", "Focus", item.focus, "number"],
      ["REGEN", "Health regeneration", item.healthRegeneration, "number"],
      ["REF", "Damage reflection", item.damageReflection, "number"],
      ["GOLD", "Gold multiplier", item.goldMultiplier, "wholePercent"],
      ["XP", "XP multiplier", item.xpMultiplier, "wholePercent"],
      ["DUR", "Durability", item.durability, "plain"],
    ];
    const badges = definitions
      .filter(([, , value, format]) => hasEquipmentStat(value, format))
      .map(
        ([label, title, value, format]) =>
          `<span class="equipment-stat-badge" title="${escapeHtml(title)}"><b>${escapeHtml(label)}</b><span>${escapeHtml(formatEquipmentStat(value, format))}</span></span>`,
      )
      .join("");
    return `<div class="equipment-item-meta">${rarityMarkup(item.rarity)}<span class="equipment-type">${escapeHtml(item.type || "Item")}</span></div><div class="equipment-bonuses">${badges || `<span class="equipment-no-bonuses">No listed bonuses</span>`}</div>`;
  }

  function rarityMarkup(rarity) {
    if (!rarity) return `<span class="cell-muted">-</span>`;
    return `<span class="rarity rarity-${slug(rarity)}">${escapeHtml(rarity)}</span>`;
  }

  function metricIcon(name) {
    const paths = {
      health: `<path d="M12 20.5 4.4 13A5.3 5.3 0 0 1 12 5.6 5.3 5.3 0 0 1 19.6 13Z" />`,
      mana: `<path d="M12 2.7s6.7 7.5 6.7 12.1a6.7 6.7 0 1 1-13.4 0C5.3 10.2 12 2.7 12 2.7Z" /><path d="M9 16.2c.5 1.2 1.5 1.8 3 1.8" />`,
      armor: `<path d="M12 2.8 19.5 6v5.4c0 4.7-3 8.2-7.5 9.8-4.5-1.6-7.5-5.1-7.5-9.8V6Z" /><path d="M12 6.5v10.3" />`,
      resistance: `<path d="m12 2.8 7.7 4.4v9.6L12 21.2l-7.7-4.4V7.2Z" /><path d="m12 7 1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5Z" />`,
      evasion: `<path d="M20.2 3.8C13 4.8 8 8.6 5.8 15.4L4 20l4.6-1.8C15.4 16 19.2 11 20.2 3.8Z" /><path d="M7 17c2.2-3.1 5.1-5.8 9-8" /><path d="M10 14.1h4.2" />`,
      movement: `<path d="M7.2 3v9.4L4 15.8V20h16v-1.5c0-2-1.8-3.2-4.2-3.2h-2.5l-2.1-3.8V3Z" /><path d="M4 17.2h15.2" />`,
    };
    if (!paths[name]) return "";
    return `<span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths[name]}</svg></span>`;
  }

  function metricNoteText(noteKey) {
    if (noteKey === "health") {
      return `Current ${state.character.currentHitPoints} + ${state.character.temporaryHitPoints} temporary`;
    }
    if (noteKey === "mana") return `Current ${state.character.currentMana}`;
    return "";
  }

  function abilityScoreBand(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return "unrated";
    if (score <= 55) return "low";
    if (score <= 69) return "mid";
    return "high";
  }

  function abilityIcon(name) {
    const icons = {
      strength: `<path d="M7 7.5v9M4.5 9.5v5M2.5 11v2M17 7.5v9M19.5 9.5v5M21.5 11v2M7 12h10" />`,
      speed: `<path d="M4.5 18a8 8 0 1 1 15 0" /><path d="m12 14 4.2-4.2" /><circle cx="12" cy="14" r="1.5" /><path d="M7.1 9.1 5.7 7.7M16.9 9.1l1.4-1.4M12 6V4" />`,
      vitality: `<path d="M12 20.2 4.8 13.1A5 5 0 0 1 12 6.3a5 5 0 0 1 7.2 6.8Z" /><path d="M6.8 12.9h3l1.4-3 2 6 1.4-3h2.7" />`,
      intelligence: `<path d="M8.6 15.8a6.1 6.1 0 1 1 6.8 0c-.9.6-1.4 1.5-1.4 2.4h-4c0-.9-.5-1.8-1.4-2.4Z" /><path d="M9.7 21h4.6M10 18.2h4M12 2V.8M5.4 4.4 4.2 3.2M18.6 4.4l1.2-1.2M3.2 10H1.5M22.5 10h-1.7" />`,
      awareness: `<path d="M2.7 12s3.5-5.1 9.3-5.1 9.3 5.1 9.3 5.1-3.5 5.1-9.3 5.1S2.7 12 2.7 12Z" /><circle cx="12" cy="12" r="3.1" /><circle cx="12" cy="12" r="1" />`,
      talent: `<path d="m12 3 1.8 4.4L18 9.2l-4.2 1.8-1.8 4.4-1.8-4.4L6 9.2l4.2-1.8Z" /><path d="m19 14 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8ZM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6Z" />`,
    };
    if (!icons[name]) return "";
    return `<span class="ability-icon ability-icon-${escapeHtml(name)}" data-ability-icon="${escapeHtml(name)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${icons[name]}</svg></span>`;
  }

  function metricCard(label, path, className, format, note, icon, noteKey) {
    const noteText = noteKey ? metricNoteText(noteKey) : note;
    const noteAttribute = noteKey
      ? ` data-metric-note="${escapeHtml(noteKey)}" aria-live="polite"`
      : "";
    return `<article class="metric-card ${className || ""} ${icon ? "has-icon" : ""}">${metricIcon(icon)}<div class="metric-card-copy"><span class="metric-label">${escapeHtml(label)}</span><strong data-output="${escapeHtml(path)}" ${format ? `data-format="${format}"` : ""}>${escapeHtml(formatOutput(getPath(derived, path), format))}</strong>${noteText ? `<small${noteAttribute}>${escapeHtml(noteText)}</small>` : ""}</div></article>`;
  }

  function characterExperienceMarkup() {
    const experience = derived.experience;
    const progressLabel = experience.isMaxLevel
      ? "Maximum level reached"
      : `${experience.currentXp} / ${experience.requiredXp} XP to Level ${experience.nextLevel}`;
    return `<div class="character-xp-summary">
      <span class="character-level-badge" aria-label="Character level ${experience.level}">${experience.level}</span>
      <div class="character-xp-progress">
        <div class="character-xp-copy"><span>${escapeHtml(progressLabel)}</span><b>${Math.round(experience.percent)}%</b></div>
        <div class="character-xp-track" role="progressbar" aria-label="Current level experience progress" aria-valuemin="0" aria-valuemax="${experience.requiredXp || 1}" aria-valuenow="${experience.isMaxLevel ? 1 : experience.currentXp}"><span style="width: ${experience.percent}%"></span></div>
      </div>
    </div>`;
  }

  function renderCharacterPage() {
    const character = state.character;
    const personality = derived.personality;

    const abilityCards = data.abilityDefinitions
      .map((ability) => {
        const score = derived.abilityScores[ability.id];
        const modifier = derived.abilityModifiers[ability.id];
        const cost = derived.abilityCosts[ability.id];
        const storedBase = state.abilityBaseScores && Object.hasOwn(state.abilityBaseScores, ability.id)
          ? state.abilityBaseScores[ability.id]
          : ability.base;
        return `<article class="ability-card"><div class="ability-top"><div class="ability-identity">${abilityIcon(ability.id)}<div class="ability-name"><span class="ability-abbr">${escapeHtml(ability.abbr)}</span><h3>${escapeHtml(ability.label)}</h3></div></div><strong class="ability-score" data-output="abilityScores.${ability.id}" data-score-band="${abilityScoreBand(score)}">${formatOutput(score, "integer")}</strong></div><div class="ability-meta"><div class="field"><label for="ability-${ability.id}">Bonus</label><input id="ability-${ability.id}" class="number-input" type="number" step="1" data-value-type="number" data-bind="abilityBonuses.${ability.id}" value="${escapeHtml(state.abilityBonuses[ability.id])}" /></div><div class="ability-modifier"><small>Mod</small><strong data-output="abilityModifiers.${ability.id}" data-format="signed">${formatOutput(modifier, "signed")}</strong></div></div><small class="field-hint">Base ${escapeHtml(storedBase)} · Cost ${Number.isNaN(cost) ? "#N/A" : cost}</small></article>`;
      })
      .join("");

    const personalityRows = personality.rows.length
      ? personality.rows
          .map(
            (trait) =>
              `<div class="personality-chip" role="listitem"><span>${escapeHtml(trait.name)}</span><button class="personality-remove" type="button" data-action="remove-trait" data-index="${trait.index}" aria-label="Remove ${escapeHtml(trait.name)}">×</button></div>`,
          )
          .join("")
      : `<div class="personality-empty"><strong>No traits assigned</strong><span>Add traits from the Personality Traits catalogue.</span></div>`;
    const personalityBudgetMessage = personality.overLimit
      ? "Maximum exceeded"
      : personality.atLimit
        ? "Maximum reached"
        : "More traits available";
    const personalityBudgetClass = personality.overLimit
      ? "is-over"
      : personality.atLimit
        ? "is-full"
        : "";

    const bonusFields = Object.entries(state.bonuses)
      .map(([key, value]) => field(titleCase(key), `bonuses.${key}`, value, { type: "number", step: key === "criticalChance" ? 0.01 : 1 }))
      .join("");

    const equipmentRows = data.equipmentSlots
      .map((slot, index) => {
        const selected = state.equipment[slot.id];
        const item = derived.equippedItems[index];
        const slotOptions = equipmentOptionsForSlot(slot.id);
        const hint = slotOptions.length
          ? ""
          : `<small class="field-hint">No matching items in inventory yet.</small>`;
        return `<div class="equipment-row"><div class="equipment-slot">${equipmentSlotIcon(slot.id)}<label for="equipment-${slot.id}">${escapeHtml(slot.label)}</label></div><div class="equipment-row-main"><select class="table-input" id="equipment-${slot.id}" data-bind="equipment.${slot.id}">${renderOptions(slotOptions, selected, "Empty slot")}</select>${hint}<div class="equipment-details" data-equipment-index="${index}">${equipmentDetailsMarkup(item)}</div></div></div>`;
      })
      .join("");

    const saveRows = data.abilityDefinitions
      .map((ability) => {
        const input = state.savingThrows[ability.id];
        return `<div class="save-row"><label for="save-prof-${ability.id}">${escapeHtml(ability.label)}</label>${checkbox(`savingThrows.${ability.id}.proficient`, input.proficient, "Proficient")}<input class="table-input number-input" aria-label="${escapeHtml(ability.label)} saving throw bonus" type="number" step="1" data-value-type="number" data-bind="savingThrows.${ability.id}.bonus" value="${escapeHtml(input.bonus)}" />${output(`savingThrows.${ability.id}`, "signed")}</div>`;
      })
      .join("");

    const damageRolls = state.damageTool.rolls
      .map((roll, index) => {
        const result = derived.damageTool.rollResults[index];
        const active = index < Math.max(0, Math.min(7, Math.floor(engine.numberValue(state.damageTool.rollCount))));
        return `<div class="damage-roll ${active ? result.success ? "is-success" : "is-fail" : "is-inactive"}"><label class="visually-hidden" for="damage-roll-${index}">Accuracy roll ${index + 1}</label><input id="damage-roll-${index}" type="number" min="0" max="99" step="1" data-value-type="number" data-bind="damageTool.rolls.${index}" value="${escapeHtml(roll)}" ${active ? "" : "disabled"} /><output data-roll-result="${index}">${active ? result.label : "INACTIVE"}</output></div>`;
      })
      .join("");

    return `<section class="page" data-page="character">${pageHeading(
      "Character overview",
      "Character Sheet",
      "Live character statistics, equipment, saving throws, resource pools, and combat tools.",
      `<button class="button button-primary" type="button" data-action="print">Print current page</button>`,
    )}
      <section class="hero-record" aria-labelledby="identity-heading"><div class="hero-grid"><div class="identity-title"><p class="overline">Active Character</p><h2 id="identity-heading">${escapeHtml(character.name || "Unnamed Character")}</h2><p>${escapeHtml(character.race || "Unknown race")} · Level ${escapeHtml(derived.experience.level)} ${escapeHtml(character.className)}</p></div><div class="identity-fields">
        ${field("Name", "character.name", character.name)}
        ${field("Race", "character.race", character.race)}
        ${field("Class", "character.className", character.className, { type: "select", options: data.classes.map((profile) => profile.name), placeholder: "Choose class" })}
        ${field("Age", "character.age", character.age, { type: "number", min: 0, step: 1 })}
        ${field("Weight (kg)", "character.weight", character.weight, { type: "number", min: 0, step: 0.1 })}
        ${field("Height (cm)", "character.height", character.height, { type: "number", min: 0, step: 0.1 })}
      </div></div></section>

      <section class="panel character-ability-panel"><div class="panel-heading blue"><h2>Ability Scores</h2><span class="heading-note">Primary scores · modifier · cost</span></div><div class="panel-body"><div class="ability-grid">${abilityCards}</div></div></section>

      <section class="metric-strip section-gap" aria-label="Primary calculated statistics">
        ${metricCard("Max Health", "stats.maxHealth", "is-hp", "integer", "", "health", "health")}
        ${metricCard("Max Mana", "stats.maxMana", "is-mana", "integer", "", "mana", "mana")}
        ${metricCard("Armor", "stats.armor", "is-armor", "integer", "", "armor")}
        ${metricCard("Resistance", "stats.resistance", "is-resistance", "integer", "", "resistance")}
        ${metricCard("Evasion", "stats.evasion", "is-evasion", "integer", "", "evasion")}
        ${metricCard("Movement", "stats.moveSpeed", "is-move", "feet", derived.inventory.encumbranceLevel, "movement")}
      </section>

      <section class="panel personality-panel"><div class="panel-heading amber"><h2>Personality Traits</h2><span class="heading-note">Character profile</span></div><div class="panel-body"><div class="personality-compact"><div class="personality-chip-list" role="list" aria-label="Assigned personality traits">${personalityRows}</div><aside class="personality-controls ${personalityBudgetClass}" aria-label="Personality trait controls" aria-live="polite"><span class="personality-limit-status">${escapeHtml(personalityBudgetMessage)}</span><button class="button button-small button-quiet" type="button" data-route="traits">Browse catalogue</button></aside></div></div></section>

      <div class="layout-grid two section-gap">
        <section class="panel"><div class="panel-heading"><h2>Core Statistics</h2><span class="heading-note">Calculated fields</span></div><div class="panel-body"><dl class="key-value-list">
          <div class="key-value-row character-xp-row"><dt>Level</dt><dd>${characterExperienceMarkup()}</dd></div>
          <div class="key-value-row"><dt>Proficiency Bonus</dt><dd>${output("proficiency", "signed")}</dd></div>
          <div class="key-value-row"><dt>Physical Damage</dt><dd>${output("stats.physicalDamage", "integer")}</dd></div>
          <div class="key-value-row"><dt>Spell Damage</dt><dd>${output("stats.spellDamage", "integer")}</dd></div>
          <div class="key-value-row"><dt>Luck</dt><dd>${output("stats.luck", "integer")}</dd></div>
          <div class="key-value-row"><dt>Focus</dt><dd>${output("stats.focus", "integer")}</dd></div>
          <div class="key-value-row"><dt>Health Regeneration</dt><dd>${output("stats.healthRegeneration", "integer")}</dd></div>
          <div class="key-value-row"><dt>Critical Strike Chance</dt><dd>${output("stats.criticalChance", "percent")}</dd></div>
          <div class="key-value-row"><dt>Spell Save DC</dt><dd>${output("stats.spellSave", "integer")}</dd></div>
          <div class="key-value-row"><dt>Gold Multiplier</dt><dd>${output("stats.goldMultiplierText")}</dd></div>
          <div class="key-value-row"><dt>XP Multiplier</dt><dd>${output("stats.xpMultiplierText")}</dd></div>
        </dl></div></section>
        <section class="panel current-pools-panel"><div class="panel-heading plum"><h2>Current Pools & Bonuses</h2><div class="panel-heading-actions"><span class="heading-note">Editable inputs</span><button class="button button-accent button-small long-rest-button" type="button" data-action="request-long-rest">Long Rest</button></div></div><div class="panel-body"><div class="form-grid four">
          ${field("Current HP", "character.currentHitPoints", character.currentHitPoints, { type: "number", step: 1 })}
          ${field("Temporary HP", "character.temporaryHitPoints", character.temporaryHitPoints, { type: "number", step: 1 })}
          ${field("Current Mana", "character.currentMana", character.currentMana, { type: "number", step: 1 })}
          ${field("Current Focus", "character.currentFocus", character.currentFocus, { type: "number", step: 1 })}
        </div><h3 class="subsection-title">Bonus statistics</h3><div class="form-grid three">${bonusFields}</div></div></section>
      </div>

      <div class="layout-grid main-sidebar section-gap">
        <section class="panel equipment-panel"><div class="panel-heading"><h2>Equipment</h2><span class="heading-note">Equipped item bonuses</span></div><div class="panel-body"><div class="equipment-rows">${equipmentRows}</div></div></section>
        <section class="panel"><div class="panel-heading blue"><h2>Saving Throws & Passives</h2></div><div class="panel-body"><div class="save-rows">${saveRows}</div><h3 class="subsection-title">Passive proficiency</h3><dl class="key-value-list"><div class="key-value-row"><dt>Passive Perception</dt><dd>${output("passives.perception", "integer")}</dd></div><div class="key-value-row"><dt>Passive Insight</dt><dd>${output("passives.insight", "integer")}</dd></div><div class="key-value-row"><dt>Passive Investigation</dt><dd>${output("passives.investigation", "integer")}</dd></div></dl></div></section>
      </div>

      <div class="layout-grid two section-gap">
        <section class="panel"><div class="panel-heading rust"><h2>Damage & Critical Tools</h2><span class="heading-note">Combat rolls</span></div><div class="panel-body"><div class="form-grid four">
          ${field("Damage Multiplier", "damageTool.multiplier", state.damageTool.multiplier, { type: "number", step: 0.1 })}
          ${field("Accuracy Type", "damageTool.accuracyAbility", state.damageTool.accuracyAbility, { type: "select", options: data.abilityDefinitions.map((ability) => ability.abbr) })}
          ${field("Accuracy Debuff", "damageTool.accuracyDebuff", state.damageTool.accuracyDebuff, { type: "number", step: 1 })}
          ${field("Roll Count", "damageTool.rollCount", state.damageTool.rollCount, { type: "number", min: 0, max: 7, step: 1 })}
        </div><div class="inline-fields section-gap"><button class="button button-primary" type="button" data-action="roll-accuracy">Roll d100 checks</button><button class="button button-accent" type="button" data-action="roll-critical">Roll critical</button></div><h3 class="subsection-title">Accuracy rolls</h3><div class="damage-roll-grid">${damageRolls}</div><div class="damage-result"><div><span>Successful Rolls</span><strong data-output="damageTool.successfulRolls">${derived.damageTool.successfulRolls}</strong></div><div><span>Total Damage</span><strong data-output="damageTool.totalDamage" data-format="integer">${formatOutput(derived.damageTool.totalDamage, "integer")}</strong></div><div><span>Critical Roll</span><strong><span data-output="damageTool.criticalRoll">${derived.damageTool.criticalRoll}</span> · <span>${derived.damageTool.criticalStrike ? "CRITICAL" : "Normal"}</span></strong></div></div></div></section>
        <section class="panel"><div class="panel-heading amber"><h2>Details & Appearance</h2></div><div class="panel-body"><div class="form-grid two">
          ${field("Background", "character.background", character.background)}
          ${field("Alignment", "character.alignment", character.alignment, { type: "select", options: data.alignments })}
          ${field("Faith", "character.faith", character.faith, { type: "select", options: data.faiths })}
          ${field("Sanctum", "character.sanctum", character.sanctum, { type: "select", options: data.sanctums })}
          ${field("Eyes", "character.eyes", character.eyes)}
          ${field("Skin", "character.skin", character.skin)}
          ${field("Hair", "character.hair", character.hair)}
          ${field("Additional Features & Traits", "character.features", character.features, { type: "textarea", className: "field-wide" })}
        </div></div></section>
      </div>
    </section>`;
  }

  function computeVisibleSkills() {
    const query = ui.filters.skillsQuery.trim().toLowerCase();
    const selectedAbility = ui.filters.skillsAbility;
    return data.skills.filter((skill) => {
      const matchesQuery = !query || `${skill.name} ${skill.description} ${skill.group}`.toLowerCase().includes(query);
      const matchesAbility = selectedAbility === "All" || skill.group === selectedAbility;
      return matchesQuery && matchesAbility;
    });
  }

  function renderSkillGroupsMarkup(visibleSkills) {
    const groups = unique(visibleSkills.map((skill) => skill.group));
    return groups
      .map((group) => {
        const skills = visibleSkills.filter((skill) => skill.group === group);
        const ability = data.abilityDefinitions.find((definition) => definition.label === group);
        const rows = skills
          .map((skill) => {
            const skillState = state.skills[String(skill.sourceRow)] || { proficient: false, bonus: 0 };
            const tooltip = skill.description
              ? `<button class="tooltip-button" type="button" data-tooltip="${escapeHtml(skill.description)}" aria-label="About ${escapeHtml(skill.name)}">?</button>`
              : "";
            const bonusHint = skill.ignoresBonus ? `<span class="pill pill-amber">Manual bonus not applied</span>` : "";
            return `<div class="skill-row">
              <div class="skill-name"><span>${escapeHtml(skill.name)}</span>${tooltip}${bonusHint}</div>
              ${checkbox(`skills.${skill.sourceRow}.proficient`, skillState.proficient, "Proficient")}
              <label class="visually-hidden" for="skill-bonus-${skill.sourceRow}">Bonus for ${escapeHtml(skill.name)}</label>
              <input class="table-input" id="skill-bonus-${skill.sourceRow}" type="number" step="1" data-value-type="number" data-bind="skills.${skill.sourceRow}.bonus" value="${escapeHtml(skillState.bonus)}" aria-label="Bonus for ${escapeHtml(skill.name)}" />
              <output class="derived-output skill-score" data-output="skills.${skill.sourceRow}" data-format="signed">${escapeHtml(formatOutput(derived.skills[String(skill.sourceRow)], "signed"))}</output>
            </div>`;
          })
          .join("");
        return `<section class="skill-group"><header class="skill-group-header"><h2>${escapeHtml(group)} skills</h2><output>${ability ? escapeHtml(formatOutput(derived.abilityModifiers[ability.id], "signed")) : ""} ability modifier</output></header><div class="skill-list">${rows}</div></section>`;
      })
      .join("");
  }

  // Surgical update for the Skills filters: patches only the results
  // container and match count, so the search input is never torn down and
  // recreated mid-keystroke (which was resetting the caret to position 0 and
  // making typed text appear reversed). Mirrors renderTraitsResults().
  function renderSkillsResults() {
    const visibleSkills = computeVisibleSkills();
    const container = root.querySelector('[data-filter-results="skills"]');
    if (container) {
      container.innerHTML = renderSkillGroupsMarkup(visibleSkills) ||
        `<div class="empty-state"><strong>No matching skills</strong><span>Change the search or ability filter.</span></div>`;
    }
    const count = root.querySelector(".filter-count");
    if (count) count.textContent = `${visibleSkills.length} of ${data.skills.length} skills`;
  }

  function renderSkillsPage() {
    const visibleSkills = computeVisibleSkills();
    const selectedAbility = ui.filters.skillsAbility;
    const groupMarkup = renderSkillGroupsMarkup(visibleSkills);

    return `<section class="page" data-page="skills">${pageHeading(
      "Character abilities",
      "Skills",
      "Track proficiencies, manual bonuses, ability dependencies, and passive scores.",
    )}
      <section class="metric-strip" aria-label="Skill summary">
        ${metricCard("Proficiency", "proficiency", "is-mana", "signed", `Level ${derived.experience.level}`)}
        ${metricCard("Passive Perception", "passives.perception", "is-evasion", "integer")}
        ${metricCard("Passive Insight", "passives.insight", "is-armor", "integer")}
        ${metricCard("Passive Investigation", "passives.investigation", "is-resistance", "integer")}
      </section>
      <div class="filters" role="search">
        <label class="visually-hidden" for="skills-search">Search skills</label><input class="filter-control" id="skills-search" type="search" data-filter="skillsQuery" value="${escapeHtml(ui.filters.skillsQuery)}" placeholder="Search skill names or descriptions" />
        <label class="visually-hidden" for="skills-ability">Filter by ability</label><select class="filter-control" id="skills-ability" data-filter="skillsAbility">${renderOptions(["All", ...data.abilityDefinitions.map((ability) => ability.label)], selectedAbility)}</select>
        <span class="filter-count">${visibleSkills.length} of ${data.skills.length} skills</span>
      </div>
      <div data-filter-results="skills">${groupMarkup || `<div class="empty-state"><strong>No matching skills</strong><span>Change the search or ability filter.</span></div>`}</div>
    </section>`;
  }

  function renderInventoryPage() {
    const itemNames = data.items.map((item) => item.name);
    const itemList = `<datalist id="inventory-item-options">${itemNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>`;
    const rows = state.inventory
      .map((entry, index) => {
        const calculated = derived.inventory.rows[index] || {};
        const meta = inventoryRowMeta(calculated);
        const useOverride = entry.weightOverride !== null && entry.weightOverride !== "";
        const weightControl = useOverride
          ? `<input class="table-input" type="number" min="0" step="0.1" data-value-type="number" data-bind="inventory.${index}.weightOverride" value="${escapeHtml(entry.weightOverride)}" aria-label="Weight override for inventory row ${index + 1}" />`
          : `<output data-output="inventory.rows.${index}.weight" data-format="kg">${escapeHtml(formatOutput(calculated.weight, "kg"))}</output>`;
        return `<tr>
          <td data-label="Item"><label class="visually-hidden" for="inventory-item-${index}">Item ${index + 1}</label><input class="table-input inventory-name-input" id="inventory-item-${index}" list="inventory-item-options" data-bind="inventory.${index}.name" value="${escapeHtml(entry.name)}" /></td>
          <td data-label="Rarity" data-inventory-meta="${index}" data-inventory-field="rarity">${meta.rarity}</td>
          <td data-label="Type" data-inventory-meta="${index}" data-inventory-field="type">${meta.type}</td>
          <td class="cell-description" data-label="Description" data-inventory-meta="${index}" data-inventory-field="description">${meta.description}</td>
          <td class="cell-number" data-label="Quantity"><input class="table-input number-input" type="number" min="0" step="1" data-value-type="number" data-bind="inventory.${index}.quantity" value="${escapeHtml(entry.quantity)}" aria-label="Quantity for inventory row ${index + 1}" /></td>
          <td class="cell-number" data-label="Weight">${weightControl}</td>
          <td class="cell-number" data-label="Value"><output data-output="inventory.rows.${index}.value" data-format="sp">${escapeHtml(formatOutput(calculated.value, "sp"))}</output></td>
          <td data-label="Equipped"><input type="checkbox" data-inventory-equip="${index}" ${entry.equipped ? "checked" : ""} aria-label="Mark inventory row ${index + 1} equipped" /></td>
          <td data-label="Action"><div class="inventory-row-actions"><button class="button button-small button-quiet" type="button" data-action="clear-inventory" data-index="${index}">Clear</button><button class="button button-small button-danger" type="button" data-action="remove-inventory-slot" data-index="${index}" aria-label="Remove inventory slot ${index + 1}">Remove</button></div></td>
        </tr>`;
      })
      .join("");
    const inventoryTable = rows
      ? `<div class="data-table-wrap responsive-card-table"><table class="data-table"><thead><tr><th>Item</th><th>Rarity</th><th>Type</th><th>Description</th><th>Qty</th><th>Weight</th><th>Value</th><th>Equipped</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty-state"><strong>No inventory slots</strong><span>Add an item slot to begin tracking equipment and belongings.</span></div>`;

    const jewelryFields = state.jewelry.map((value, index) => field(`Jewelry ${index + 1}`, `jewelry.${index}`, value)).join("");
    const gemFields = state.gems.map((value, index) => field(`Gem ${index + 1}`, `gems.${index}`, value)).join("");

    return `<section class="page" data-page="inventory">${pageHeading(
      "Character belongings",
      "Inventory",
      "Track equipment, currency, valuables, carry limits, and movement penalties.",
    )}
      <section class="encumbrance-summary" aria-label="Inventory summary">
        <article class="encumbrance-card"><span>Carried weight</span><strong>${output("inventory.weight", "kg")}</strong></article>
        <article class="encumbrance-card"><span>Encumbrance</span><strong>${output("inventory.encumbranceLevel")}</strong></article>
        <article class="encumbrance-card"><span>Movement</span><strong>${output("stats.moveSpeed", "feet")}</strong></article>
        <article class="encumbrance-card"><span>Inventory value</span><strong>${output("inventory.value", "sp")}</strong></article>
      </section>
      <section class="panel section-gap"><div class="panel-heading blue"><h2>Carry thresholds</h2><span class="heading-note">Based on Strength and body weight</span></div><div class="panel-body"><div class="encumbrance-summary">
        <article class="encumbrance-card"><span>Medium</span><strong>${output("inventory.thresholds.medium", "kg")}</strong></article>
        <article class="encumbrance-card"><span>Heavy</span><strong>${output("inventory.thresholds.heavy", "kg")}</strong></article>
        <article class="encumbrance-card"><span>Maximum</span><strong>${output("inventory.thresholds.maximum", "kg")}</strong></article>
        <article class="encumbrance-card"><span>Current Strength</span><strong>${output("abilityScores.strength", "integer")}</strong></article>
      </div><div class="encumbrance-meter" aria-hidden="true"><span data-encumbrance-meter></span></div></div></section>
      <section class="section-gap" aria-labelledby="inventory-table-heading"><h2 class="visually-hidden" id="inventory-table-heading">Inventory entries</h2>${itemList}<div class="inventory-table-toolbar"><div class="inventory-slot-summary"><strong>${state.inventory.length} item ${state.inventory.length === 1 ? "slot" : "slots"}</strong><span>Add or remove slots whenever the character needs more or less space.</span></div><button class="button button-primary" type="button" data-action="add-inventory-slot">Add item slot</button></div>${inventoryTable}</section>
      <div class="layout-grid two section-gap">
        <section class="panel"><div class="panel-heading plum"><h2>Currency</h2><span class="heading-note">1 PP = 100 SP · 1 GP = 10 SP · 1 CP = 0.1 SP</span></div><div class="panel-body"><div class="currency-grid">
          ${field("Copper", "currency.copper", state.currency.copper, { type: "number", min: 0, step: 1 })}
          ${field("Silver", "currency.silver", state.currency.silver, { type: "number", min: 0, step: 1 })}
          ${field("Gold", "currency.gold", state.currency.gold, { type: "number", min: 0, step: 1 })}
          ${field("Platinum", "currency.platinum", state.currency.platinum, { type: "number", min: 0, step: 1 })}
        </div><div class="balance-banner"><span>Total balance</span><strong>${output("inventory.balance", "sp")}</strong></div></div></section>
        <section class="panel"><div class="panel-heading amber"><h2>Valuables</h2><span class="heading-note">Jewelry and gems</span></div><div class="panel-body"><h3 class="subsection-title">Jewelry</h3><div class="form-grid two">${jewelryFields}</div><h3 class="subsection-title">Gems</h3><div class="form-grid two">${gemFields}</div></div></section>
      </div>
    </section>`;
  }

  function renderSpellsPage() {
    const levels = Object.keys(state.spells);
    if (!levels.includes(ui.spellLevel)) ui.spellLevel = levels[0];
    const entries = state.spells[ui.spellLevel];
    const spellFields = [
      ["name", "Name"], ["school", "School"], ["castingTime", "Casting Time"], ["range", "Range"],
      ["areaTargets", "Area / Targets"], ["effect", "Effect"], ["saveAttack", "Save / Attack"], ["duration", "Duration"],
      ["concentration", "Concentration"], ["ritual", "Ritual"], ["components", "Components"], ["cost", "Cost"], ["prepared", "Prepared"],
    ];
    const rows = entries
      .map((entry, rowIndex) => `<tr>${spellFields
        .map(([key, label]) => {
          const path = `spells.${ui.spellLevel}.${rowIndex}.${key}`;
          if (["concentration", "ritual", "prepared"].includes(key)) {
            return `<td data-label="${escapeHtml(label)}"><input type="checkbox" data-bind="${escapeHtml(path)}" ${entry[key] ? "checked" : ""} aria-label="${escapeHtml(label)} for spell row ${rowIndex + 1}" /></td>`;
          }
          const className = key === "name" ? "spell-name" : key === "effect" ? "spell-effect" : "";
          return `<td data-label="${escapeHtml(label)}"><label class="visually-hidden" for="spell-${slug(ui.spellLevel)}-${rowIndex}-${key}">${escapeHtml(label)} for spell row ${rowIndex + 1}</label><input class="table-input ${className}" id="spell-${slug(ui.spellLevel)}-${rowIndex}-${key}" type="text" data-bind="${escapeHtml(path)}" value="${escapeHtml(entry[key])}" /></td>`;
        })
        .join("")}</tr>`)
      .join("");
    const levelNumber = Number((ui.spellLevel.match(/\d+/) || [0])[0]);
    const tierText = levelNumber ? `${(levelNumber + 1) * 10} MP tier` : "At-will cantrips";

    return `<section class="page" data-page="spells">${pageHeading(
      "Character spellbook",
      "Spells",
      "Track prepared spells, casting details, mana tiers, and spell effects.",
    )}
      <section class="spell-toolbar" aria-label="Spellcasting summary">
        ${field("Spellcasting Ability", "character.spellcastingAbility", state.character.spellcastingAbility, { type: "select", options: data.abilityDefinitions.map((ability) => ability.abbr) })}
        <article class="spell-stat"><span>Modifier</span><strong>${output("spellcastingModifier", "signed")}</strong></article>
        <article class="spell-stat"><span>Spell Damage</span><strong>${output("stats.spellDamage", "integer")}</strong></article>
        <article class="spell-stat"><span>Spell Save DC</span><strong>${output("stats.spellSave", "integer")}</strong></article>
        <article class="spell-stat"><span>Maximum Mana</span><strong>${output("stats.maxMana", "integer")}</strong></article>
      </section>
      <div class="tab-list" role="tablist" aria-label="Spell levels">${levels.map((level) => `<button class="tab-button" type="button" role="tab" aria-selected="${level === ui.spellLevel}" data-action="spell-tab" data-level="${escapeHtml(level)}">${escapeHtml(level)}</button>`).join("")}</div>
      <section aria-labelledby="spell-level-title"><header class="spell-level-heading"><h2 id="spell-level-title">${escapeHtml(ui.spellLevel)}</h2><span>${escapeHtml(tierText)} · ${entries.length} entries</span></header><div class="data-table-wrap spell-table-wrap"><table class="data-table spell-table"><thead><tr>${spellFields.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></section>
    </section>`;
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function commitSurvivalChange(message) {
    recalculate();
    scheduleSave();
    renderRoute({ preserveScroll: true });
    showToast(message, "success");
  }

  function requestLongRest() {
    recalculate();
    const preview = document.getElementById("long-rest-preview");
    const activeBoon = derived.hearth.status === "ACTIVE";
    preview.innerHTML = `<dl class="action-preview-list">
      <div><dt>Current HP</dt><dd>${escapeHtml(state.character.currentHitPoints)} → <strong>${escapeHtml(formatOutput(derived.stats.maxHealth, "integer"))}</strong></dd></div>
      <div><dt>Current Mana</dt><dd>${escapeHtml(state.character.currentMana)} → <strong>${escapeHtml(formatOutput(derived.stats.maxMana, "integer"))}</strong></dd></div>
      <div><dt>Hearth Boon</dt><dd>${escapeHtml(derived.hearth.status)} → <strong>AVAILABLE</strong></dd></div>
    </dl>
    <p class="dialog-callout ${activeBoon ? "is-warning" : ""}">${activeBoon ? `Your active ${escapeHtml(derived.hearth.activeMeal)} boon will expire.` : "Temporary HP, Focus, rations, hunger, and the current day will not change."}</p>`;
    openDialog(longRestDialog);
  }

  function confirmLongRest() {
    const result = engine.completeLongRest(state, data);
    longRestDialog.close();
    if (!result.accepted) {
      showToast("The Long Rest could not be completed.", "error");
      return;
    }
    commitSurvivalChange(
      `Long Rest complete. HP restored to ${formatOutput(result.restoredHitPoints, "integer")} and Mana to ${formatOutput(result.restoredMana, "integer")}.`,
    );
  }

  function requestAdvanceDay() {
    const preview = engine.previewHungerDay(state);
    document.getElementById("advance-day-dialog-title").textContent = `Advance to Day ${preview.nextDay}?`;
    const mealText = preview.hearthMealsEaten
      ? `${preview.hearthMealsEaten} Hearth meal${preview.hearthMealsEaten === 1 ? "" : "s"} already eaten today`
      : "No Hearth meal eaten today";
    document.getElementById("advance-day-preview").innerHTML = `<dl class="action-preview-list">
      <div><dt>Standard rations</dt><dd>${preview.currentFood} + ${preview.foodGained} − ${preview.rationEaten} = <strong>${preview.foodAfter}</strong></dd></div>
      <div><dt>Hearth meals</dt><dd>${escapeHtml(mealText)} · <strong>${preview.hearthRations} remaining</strong></dd></div>
      <div><dt>Total rations</dt><dd><strong>${preview.totalAfter}</strong> remaining after advancing</dd></div>
      <div><dt>Hunger</dt><dd>${escapeHtml(derived.hunger.condition)} → <strong>${escapeHtml(preview.condition)}</strong></dd></div>
      <div><dt>Penalty</dt><dd>${escapeHtml(preview.effect)}</dd></div>
    </dl><p class="dialog-callout">The Eat one ration control only consumes a standard ration. Hearth meals must be eaten from the pantry. HP, Mana, Focus, and Hearth Boon availability will not change.</p>`;
    openDialog(advanceDayDialog);
  }

  function confirmAdvanceDay() {
    const result = engine.advanceHungerDay(state);
    advanceDayDialog.close();
    if (!result.accepted) {
      showToast("The day could not be advanced.", "error");
      return;
    }
    commitSurvivalChange(`Day ${result.currentDay} recorded. The journey is now on Day ${result.nextDay}.`);
  }

  function requestHearthMeal(dishName) {
    recalculate();
    const name = String(dishName || state.hearth.selectedDish || "").trim();
    const dish = derived.hearth.pantry.find((entry) => entry.name === name);
    if (!dish || dish.left < 1) {
      showToast("Choose an owned meal with at least one serving remaining.", "error");
      return;
    }
    ui.pendingMeal = name;
    const willActivate = derived.hearth.status === "AVAILABLE";
    document.getElementById("hearth-meal-dialog-title").textContent = willActivate
      ? "Eat and activate Hearth Boon?"
      : "Eat Hearth meal?";
    document.getElementById("hearth-meal-preview").innerHTML = `<div class="meal-confirmation">
      <span class="pantry-region">${escapeHtml(dish.region)}</span>
      <h3>${escapeHtml(dish.name)}</h3>
      <p>${escapeHtml(dish.effect)}</p>
      <strong>${escapeHtml(dish.left)} serving${dish.left === 1 ? "" : "s"} → ${escapeHtml(dish.left - 1)} remaining</strong>
      <p class="dialog-callout ${willActivate ? "" : "is-warning"}">${willActivate ? "This meal counts as today’s ration and activates its Hearth Boon." : `This meal counts as today’s ration. Your boon is already ${escapeHtml(derived.hearth.status.toLowerCase())}, so it will not grant another boon.`}</p>
    </div>`;
    document.getElementById("confirm-hearth-meal-button").textContent = willActivate
      ? "Eat and activate"
      : "Eat meal";
    openDialog(hearthMealDialog);
  }

  function confirmHearthMeal() {
    const result = engine.eatHearthMeal(state, data, ui.pendingMeal);
    hearthMealDialog.close();
    ui.pendingMeal = "";
    if (!result.accepted) {
      const message = result.reason === "no-serving"
        ? "That meal no longer has a serving available."
        : "The meal could not be eaten.";
      showToast(message, "error");
      return;
    }
    commitSurvivalChange(
      result.grantsBoon
        ? `${result.dish.name} eaten, counted as today’s ration, and its Hearth Boon activated.`
        : `${result.dish.name} eaten and counted as today’s ration. No new Hearth Boon was granted this rest.`,
    );
  }

  function requestHistoryEdit(eventId) {
    if (!canEditHistory) return;
    const historyEvent = state.survivalHistory.find((entry) => entry.id === eventId);
    if (!historyEvent) return;
    const fields = document.getElementById("history-edit-fields");
    ui.editingHistoryId = eventId;
    if (historyEvent.type === "day") {
      const source = state.hunger.days.find((entry) => entry.id === historyEvent.sourceId);
      if (!source) return;
      fields.innerHTML = `<div class="form-grid four">
        <div class="field"><label for="history-edit-day">Day</label><input id="history-edit-day" name="day" type="number" min="1" step="1" value="${escapeHtml(source.day)}" /></div>
        <div class="field"><label for="history-edit-food">Standard food gained</label><input id="history-edit-food" name="foodGained" type="number" min="0" step="1" value="${escapeHtml(source.foodGained)}" /></div>
        <div class="field"><label for="history-edit-rations">Standard rations eaten</label><input id="history-edit-rations" name="rationsEaten" type="number" min="0" step="1" value="${escapeHtml(source.rationsEaten)}" /></div>
        <div class="field"><label for="history-edit-hearth-meals">Hearth meals eaten</label><input id="history-edit-hearth-meals" name="hearthMealsEaten" type="number" min="0" step="1" value="${escapeHtml(source.hearthMealsEaten || 0)}" /></div>
      </div>`;
    } else if (historyEvent.type === "hearth-meal") {
      const source = state.hearth.log.find((entry) => entry.id === historyEvent.sourceId);
      if (!source) return;
      fields.innerHTML = `<div class="form-grid two">
        <div class="field"><label for="history-edit-rest">Rest cycle</label><input id="history-edit-rest" name="rest" type="number" min="1" step="1" value="${escapeHtml(source.rest)}" /></div>
        <div class="field"><label for="history-edit-day">Day</label><input id="history-edit-day" name="day" type="number" min="1" step="1" value="${escapeHtml(source.day)}" /></div>
        <div class="field field-wide"><label for="history-edit-dish">Dish</label><select id="history-edit-dish" name="dish">${renderOptions(data.food.dishes.map((dish) => dish.name), source.dish)}</select></div>
        <label class="check-row field-wide"><input type="checkbox" name="boonUsed" ${source.boonUsed ? "checked" : ""} /><span>Boon has been used</span></label>
      </div>`;
    } else {
      showToast("That system event is not editable.", "error");
      return;
    }
    openDialog(historyEditDialog);
  }

  function saveHistoryEdit() {
    if (!canEditHistory || !ui.editingHistoryId) return;
    const values = {};
    historyEditDialog.querySelectorAll("[name]").forEach((input) => {
      values[input.name] = input.type === "checkbox" ? input.checked : input.value;
    });
    const result = engine.editSurvivalHistoryEntry(state, ui.editingHistoryId, values);
    if (!result.accepted) {
      showToast("That history entry could not be updated.", "error");
      return;
    }
    historyEditDialog.close();
    ui.editingHistoryId = "";
    commitSurvivalChange("Journey history entry updated.");
  }

  function renderSurvivalPage() {
    const conditionNames = data.conditions.map((condition) => condition.name);
    const conditionsByName = new Map(data.conditions.map((condition) => [condition.name, condition]));
    const activeEffectRows = state.activeEffects
      .map((effect, index) => `<tr>
        <td data-label="Status"><label class="visually-hidden" for="effect-status-${index}">Status ${index + 1}</label><select class="table-input" id="effect-status-${index}" data-bind="activeEffects.${index}.status">${renderOptions(data.statusOptions, effect.status, "None")}</select></td>
        <td data-label="Duration"><label class="visually-hidden" for="effect-duration-${index}">Duration ${index + 1}</label><select class="table-input" id="effect-duration-${index}" data-bind="activeEffects.${index}.duration">${renderOptions(data.durations, effect.duration, "None")}</select></td>
      </tr>`)
      .join("");

    const ailmentCards = state.activeAilments
      .slice(0, 6)
      .map((ailment, index) => {
        const condition = conditionsByName.get(ailment.name);
        const mark = condition ? Math.min(3, Math.max(1, engine.numberValue(ailment.mark) || 1)) : 0;
        const details = condition
          ? `<div class="ailment-summary">
              <div class="ailment-meta"><span>${escapeHtml(condition.type)}</span><span>${escapeHtml(condition.region)}</span><span>${escapeHtml(condition.save)}</span></div>
              <div class="ailment-mark-effects" aria-label="${escapeHtml(condition.name)} mark effects">
                ${[1, 2, 3].map((markNumber) => `<article class="ailment-mark-effect ${mark === markNumber ? "is-current" : ""}"><span>Mark ${markNumber}</span><p>${escapeHtml(condition[`mark${markNumber}`] || "No recorded effect.")}</p></article>`).join("")}
              </div>
              <div class="ailment-notes"><div><strong>Crisis</strong><p>${escapeHtml(condition.crisis)}</p></div><div><strong>Treatment</strong><p>${escapeHtml(condition.treatment)}</p></div></div>
            </div>`
          : `<div class="ailment-empty-copy">Select an ailment. It begins at Mark 1 automatically.</div>`;
        return `<article class="ailment-tracker-card ${condition ? "has-ailment" : "is-empty"}">
          <header class="ailment-tracker-header">
            <div class="ailment-selector"><label for="ailment-${index}">Ailment ${index + 1}</label><select id="ailment-${index}" data-ailment-select data-ailment-index="${index}">${renderOptions(conditionNames, ailment.name, "None")}</select></div>
            <div class="ailment-mark-stepper" aria-label="Ailment mark controls">
              <button class="mark-step-button" type="button" data-action="change-ailment-mark" data-index="${index}" data-change="-1" ${condition ? "" : "disabled"} aria-label="Reduce or resolve ${escapeHtml(ailment.name || `ailment ${index + 1}`)}">−</button>
              <strong>${condition ? `Mark ${mark}` : "Resolved"}</strong>
              <button class="mark-step-button" type="button" data-action="change-ailment-mark" data-index="${index}" data-change="1" ${condition && mark < 3 ? "" : "disabled"} aria-label="Increase ${escapeHtml(ailment.name || `ailment ${index + 1}`)} mark">+</button>
            </div>
          </header>
          ${details}
        </article>`;
      })
      .join("");

    const dayPreview = engine.previewHungerDay(state);
    const ownedMeals = derived.hearth.pantry.filter((dish) => dish.left > 0);
    const ownedMealNames = ownedMeals.map((dish) => dish.name);
    const selectedMeal = ownedMeals.find((dish) => dish.name === state.hearth.selectedDish);
    const boonStatusClass = `status-${derived.hearth.status.toLowerCase()}`;

    let boonBody;
    if (derived.hearth.status === "AVAILABLE") {
      boonBody = `<div class="boon-state-copy"><span class="condition-chip status-available">Available</span><h3>Hearth Boon Available</h3><p>Select an owned meal to activate its effect. Eating it also satisfies today’s ration without consuming a standard ration.</p></div>
        <div class="boon-activation-controls">
          <label for="owned-hearth-meal">Choose owned meal</label>
          <select id="owned-hearth-meal" data-bind="hearth.selectedDish" ${ownedMeals.length ? "" : "disabled"}>${renderOptions(ownedMealNames, selectedMeal?.name || "", ownedMeals.length ? "Choose a meal" : "No servings available")}</select>
          <p class="boon-effect-preview" data-hearth-selected-preview>${escapeHtml(selectedMeal?.effect || "Choose an owned meal to preview its effect.")}</p>
          <button class="button button-primary" type="button" data-action="request-selected-hearth-meal" data-eat-selected-meal ${selectedMeal ? "" : "disabled"}>Eat and activate</button>
        </div>`;
    } else if (derived.hearth.status === "ACTIVE") {
      boonBody = `<div class="boon-state-copy"><span class="condition-chip status-active">Active</span><h3>${escapeHtml(derived.hearth.activeMeal)}</h3><p>${escapeHtml(derived.hearth.activeEffect)}</p><small>Expires when used or when the next Long Rest is completed.</small></div>
        <div class="boon-state-action"><button class="button button-accent" type="button" data-action="use-hearth-boon">Mark boon as used</button></div>`;
    } else {
      boonBody = `<div class="boon-state-copy"><span class="condition-chip status-used">Used</span><h3>Hearth Boon Used</h3><p>You cannot activate another Hearth Boon until completing a Long Rest. Pantry meals may still be eaten as rations.</p></div>`;
    }

    const pantryCards = ownedMeals
      .map((dish) => `<article class="pantry-card">
        <div class="pantry-card-main"><span class="pantry-region">${escapeHtml(dish.region)}</span><h3>${escapeHtml(dish.name)}</h3><p>${escapeHtml(dish.effect)}</p></div>
        <div class="pantry-card-actions"><strong><span>${escapeHtml(dish.left)}</span> serving${dish.left === 1 ? "" : "s"}</strong><button class="button button-quiet button-small" type="button" data-action="request-hearth-meal" data-name="${escapeHtml(dish.name)}">Eat</button></div>
      </article>`)
      .join("");

    const pantryManager = ui.showPantryManager
      ? `<section class="pantry-manager" aria-label="Add acquired servings"><header><div><h3>Manage Pantry</h3><p>Each added Hearth meal also increases the total ration count by one.</p></div><button class="button button-quiet button-small" type="button" data-action="toggle-pantry-manager">Done</button></header><div class="pantry-manager-grid">${data.food.dishes
          .map((dish) => {
            const pantryDish = derived.hearth.pantry.find((entry) => entry.name === dish.name);
            return `<div class="pantry-manager-row"><div><strong>${escapeHtml(dish.name)}</strong><span>${escapeHtml(dish.region)} · ${escapeHtml(pantryDish?.left || 0)} owned</span></div><button class="button button-small" type="button" data-action="add-pantry-serving" data-name="${escapeHtml(dish.name)}">+ Add serving</button></div>`;
          })
          .join("")}</div></section>`
      : "";

    const allHistory = [...derived.survivalHistory].reverse();
    const visibleHistory = ui.showAllSurvivalHistory ? allHistory : allHistory.slice(0, 5);
    const historyItems = visibleHistory
      .map((entry) => `<li class="history-entry"><span class="history-marker" data-history-type="${escapeHtml(entry.type)}" aria-hidden="true"></span><div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.detail)}</p></div>${canEditHistory && entry.editable ? `<button class="button button-quiet button-small" type="button" data-action="edit-history" data-id="${escapeHtml(entry.id)}">Edit</button>` : ""}</li>`)
      .join("");

    const rationToggleDisabled = dayPreview.availableStandardFood < 1 || dayPreview.hearthMealsEaten > 0;
    const rationToggleCopy = dayPreview.hearthMealsEaten > 0
      ? "A Hearth meal already satisfies today’s ration."
      : dayPreview.availableStandardFood < 1
        ? "No standard ration is available. Eat a meal from the pantry instead."
        : "Consumes one standard ration only.";
    const hearthTodayNote = dayPreview.hearthMealsEaten
      ? ` · ${dayPreview.hearthMealsEaten} Hearth meal${dayPreview.hearthMealsEaten === 1 ? "" : "s"} eaten today`
      : "";

    return `<section class="page" data-page="survival">${pageHeading(
      "Character status",
      "Effects & Survival",
      "Track active effects and progressive ailments first, then resolve food, Hearth meals, and journey days.",
    )}
      <div class="layout-grid two effects-overview-grid">
        <section class="panel"><div class="panel-heading rust"><h2>Active Effects</h2><span class="heading-note">Up to seven tracked effects</span></div><div class="panel-body"><div class="data-table-wrap responsive-card-table"><table class="data-table"><thead><tr><th>Status</th><th>Duration</th></tr></thead><tbody>${activeEffectRows}</tbody></table></div></div></section>
        <section class="panel"><div class="panel-heading blue"><h2>Special Effects</h2><span class="heading-note">Character notes</span></div><div class="panel-body"><div class="effect-grid">
          ${field("Immunities", "specialEffects.immunities", state.specialEffects.immunities, { type: "textarea" })}
          ${field("Vulnerabilities", "specialEffects.vulnerabilities", state.specialEffects.vulnerabilities, { type: "textarea" })}
          ${field("Resistances", "specialEffects.resistances", state.specialEffects.resistances, { type: "textarea" })}
        </div></div></section>
      </div>

      <section class="panel section-gap ailments-panel"><div class="panel-heading plum"><h2>Ailments</h2><span class="heading-note">Mark 1 to Mark 3 · reducing Mark 1 resolves it</span></div><div class="panel-body"><div class="ailment-grid">${ailmentCards}</div></div></section>

      <header class="survival-section-heading section-gap"><div><span>Travel management</span><h2>Survival & Food</h2><p>Standard rations and Hearth meals contribute to the total, but they are consumed through separate controls.</p></div></header>

      <section class="survival-status-grid" aria-label="Current survival status">
        <article class="survival-status-card current-day-card"><span>Current day</span><strong>${escapeHtml(state.hunger.currentDay)}</strong><small>Journey day</small><button class="button button-quiet button-small reset-days-button" type="button" data-action="request-reset-days" ${state.hunger.currentDay === 1 ? "disabled" : ""}>Reset days</button></article>
        <article class="survival-status-card"><span>Total rations</span><strong data-total-rations>${escapeHtml(formatOutput(derived.hunger.totalRations, "integer"))}</strong><small data-ration-breakdown>${escapeHtml(formatOutput(derived.hunger.standardRations, "integer"))} standard + ${escapeHtml(formatOutput(derived.hunger.hearthRations, "integer"))} Hearth</small></article>
        <article class="survival-status-card"><span>Hunger</span><strong>${escapeHtml(derived.hunger.condition)}</strong><small>${escapeHtml(derived.hunger.effect)}</small></article>
        <article class="survival-status-card"><span>Hearth Boon</span><strong class="condition-chip ${boonStatusClass}" data-hearth-status>${escapeHtml(derived.hearth.status)}</strong><small>Rest cycle ${escapeHtml(state.hearth.restCycle)}</small></article>
      </section>

      <div class="layout-grid survival-action-grid section-gap">
        <section class="panel day-dashboard"><div class="panel-heading amber"><h2>Today’s Activity</h2><span class="heading-note">Day ${escapeHtml(dayPreview.currentDay)}</span></div><div class="panel-body">
          <div class="today-controls">
            ${field("Standard food gained today", "hunger.foodGainedToday", state.hunger.foodGainedToday, { type: "number", min: 0, step: 1, hint: "Adds standard rations when the day is completed." })}
            <label class="ration-toggle"><input type="checkbox" data-bind="hunger.eatRationToday" data-ration-toggle ${state.hunger.eatRationToday ? "checked" : ""} ${rationToggleDisabled ? "disabled" : ""} /><span><strong>Eat one standard ration</strong><small data-ration-toggle-copy>${escapeHtml(rationToggleCopy)}</small></span></label>
          </div>
          <div class="day-preview" aria-live="polite"><span>Before advancing</span><strong data-day-preview-equation>${dayPreview.currentFood} standard + ${dayPreview.foodGained} gained − ${dayPreview.rationEaten} standard eaten = ${dayPreview.foodAfter} standard; ${dayPreview.hearthRations} Hearth; ${dayPreview.totalAfter} total</strong><small data-day-preview-condition>${escapeHtml(dayPreview.condition)} — ${escapeHtml(dayPreview.effect)}${escapeHtml(hearthTodayNote)}</small></div>
          <button class="button button-primary advance-day-button" type="button" data-action="request-advance-day"><span data-day-advance-label>Advance to Day ${escapeHtml(dayPreview.nextDay)}</span></button>
        </div></section>

        <section class="panel boon-card"><div class="panel-heading plum"><h2>Hearth Boon</h2><span class="heading-note">One per Long Rest</span></div><div class="panel-body">${boonBody}<button class="text-link-button" type="button" data-route="character">Complete Long Rest from the Character Sheet.</button></div></section>
      </div>

      <section class="panel section-gap pantry-panel"><div class="panel-heading blue"><h2>Pantry</h2><div class="panel-heading-actions"><span class="heading-note">Owned Hearth rations only</span><button class="button button-small button-quiet" type="button" data-action="toggle-pantry-manager">${ui.showPantryManager ? "Close manager" : "Manage Pantry"}</button></div></div><div class="panel-body">${pantryCards ? `<div class="pantry-grid">${pantryCards}</div>` : `<div class="empty-state compact"><strong>Your pantry is empty</strong><span>Add an acquired serving with Manage Pantry.</span></div>`}${pantryManager}</div></section>

      <section class="panel section-gap history-panel"><div class="panel-heading"><h2>Journey & Rest History</h2><span class="heading-note">${allHistory.length} recorded event${allHistory.length === 1 ? "" : "s"}</span></div><div class="panel-body">${historyItems ? `<details class="history-disclosure" ${ui.showAllSurvivalHistory ? "open" : ""}><summary><span>Show journey history</span><small>Latest: ${escapeHtml(allHistory[0]?.title || "No events")}</small></summary><ol class="history-list">${historyItems}</ol></details>` : `<div class="empty-state compact"><strong>No journey events yet</strong><span>Advance a day, eat a Hearth meal, reset the counter, or complete a Long Rest.</span></div>`}<div class="history-actions">${allHistory.length > 5 ? `<button class="button button-quiet button-small" type="button" data-action="toggle-history">${ui.showAllSurvivalHistory ? "Show recent" : "View all"}</button>` : ""}<button class="button button-danger button-small" type="button" data-action="undo-survival" ${allHistory.length ? "" : "disabled"}>Undo last action</button>${canEditHistory ? `<span class="history-dm-note">DM mode: day and meal records can be edited.</span>` : ""}</div></div></section>
    </section>`;
  }

  function renderTraitsPage() {
    const query = ui.filters.traitsQuery.trim().toLowerCase();
    const selectedGroup = ui.filters.traitsGroup;
    const traits = data.traits.filter((trait) => {
      const matchesQuery = !query || `${trait.name} ${trait.benefit} ${trait.drawback}`.toLowerCase().includes(query);
      return matchesQuery && (selectedGroup === "All" || trait.group === selectedGroup);
    });
    const cards = traits.map(renderTraitCard).join("");
    return `<section class="page" data-page="traits">${pageHeading(
      "Trait catalogue",
      "Personality Traits",
      "Browse trait costs, benefits, and drawbacks, then assign them to the character.",
    )}
      <div class="filters" role="search">
        <label class="visually-hidden" for="traits-search">Search traits</label><input class="filter-control" id="traits-search" type="search" data-filter="traitsQuery" value="${escapeHtml(ui.filters.traitsQuery)}" placeholder="Search traits, benefits, or drawbacks" />
        <label class="visually-hidden" for="traits-group">Filter trait group</label><select class="filter-control" id="traits-group" data-filter="traitsGroup">${renderOptions(["All", ...unique(data.traits.map((trait) => trait.group))], selectedGroup)}</select>
        <span class="filter-count" data-filter-count="traits">${traits.length} of ${data.traits.length} traits</span>
      </div>
      <div class="catalog-grid" data-filter-results="traits">${cards || `<div class="empty-state"><strong>No matching traits</strong><span>Change the search or group filter.</span></div>`}</div>
    </section>`;
  }

  function computeFilteredConditions() {
    const query = ui.filters.conditionsQuery.trim().toLowerCase();
    const selectedRegion = ui.filters.conditionsRegion;
    const selectedType = ui.filters.conditionsType;
    return data.conditions.filter((condition) => {
      const haystack = `${condition.id} ${condition.name} ${condition.region} ${condition.type} ${condition.exposure} ${condition.save} ${condition.tags}`.toLowerCase();
      return (!query || haystack.includes(query)) &&
        (selectedRegion === "All" || condition.region === selectedRegion) &&
        (selectedType === "All" || condition.type === selectedType);
    });
  }

  function renderConditionCard(condition) {
    return `<article class="catalog-card condition-card">
        <div class="card-meta"><span class="pill pill-blue">${escapeHtml(condition.region)}</span><span class="pill">${escapeHtml(condition.type)}</span><span class="pill pill-amber">${escapeHtml(condition.id)}</span></div>
        <h2>${escapeHtml(condition.name)}</h2><p><strong>Exposure:</strong> ${escapeHtml(condition.exposure)}</p><p><strong>Save:</strong> ${escapeHtml(condition.save)}</p>
        <div class="condition-stage"><div><strong>Mark I</strong><span>${escapeHtml(condition.mark1)}</span></div><div><strong>Mark II</strong><span>${escapeHtml(condition.mark2)}</span></div><div><strong>Mark III</strong><span>${escapeHtml(condition.mark3)}</span></div><div><strong>Crisis</strong><span>${escapeHtml(condition.crisis)}</span></div></div>
        <p><strong>Treatment:</strong> ${escapeHtml(condition.treatment)}</p><p><strong>Tags:</strong> ${escapeHtml(condition.tags)}</p>
        <div class="card-actions"><button class="button button-primary button-small" type="button" data-action="add-condition" data-name="${escapeHtml(condition.name)}">Track ailment</button></div>
      </article>`;
  }

  // Surgical update for the Conditions filters: patches only the catalogue
  // grid and match count instead of re-rendering the whole page.
  function renderConditionsResults() {
    const conditions = computeFilteredConditions();
    const grid = root.querySelector(".catalog-grid");
    const count = root.querySelector(".filter-count");
    if (grid) {
      grid.innerHTML = conditions.map(renderConditionCard).join("") ||
        `<div class="empty-state"><strong>No matching conditions</strong><span>Change the active filters.</span></div>`;
    }
    if (count) count.textContent = `${conditions.length} of ${data.conditions.length} conditions`;
  }

  function renderConditionsPage() {
    const conditions = computeFilteredConditions();
    const selectedRegion = ui.filters.conditionsRegion;
    const selectedType = ui.filters.conditionsType;
    const conditionCards = conditions.map(renderConditionCard).join("");
    const classProfiles = data.classes
      .map((profile) => {
        const values = derived.allClassStats[profile.name];
        return `<article class="class-profile ${profile.name === state.character.className ? "is-current" : ""}"><h3>${escapeHtml(profile.name)}</h3><dl><dt>Max Health</dt><dd>${escapeHtml(formatOutput(values.maxHealth, "integer"))}</dd><dt>Armor</dt><dd>${escapeHtml(formatOutput(values.armor, "integer"))}</dd><dt>Resistance</dt><dd>${escapeHtml(formatOutput(values.resistance, "integer"))}</dd><dt>Evasion</dt><dd>${escapeHtml(formatOutput(values.evasion, "integer"))}</dd><dt>Spell Save</dt><dd>${escapeHtml(formatOutput(values.spellSave, "integer"))}</dd><dt>Max Mana</dt><dd>${escapeHtml(formatOutput(values.maxMana, "integer"))}</dd><dt>Spell Damage</dt><dd>${escapeHtml(formatOutput(values.spellDamage, "integer"))}</dd></dl></article>`;
      })
      .join("");

    return `<section class="page" data-page="conditions">${pageHeading(
      "Campaign reference",
      "Rules & Conditions",
      "Class calculation references, faith lists, and the complete regional condition catalogue.",
    )}
      <section class="panel"><div class="panel-heading blue"><h2>Class Profiles</h2><span class="heading-note">Calculated using current level, abilities, equipment, and bonuses</span></div><div class="panel-body"><div class="class-profile-grid">${classProfiles}</div></div></section>
      <section class="panel section-gap"><div class="panel-heading amber"><h2>Faiths</h2><span class="heading-note">Available faiths</span></div><div class="panel-body"><div class="faith-list">${data.faiths.map((faith) => `<span class="pill">${escapeHtml(faith)}</span>`).join("")}</div></div></section>
      <h2 class="subsection-title">Condition Catalogue</h2>
      <div class="filters" role="search">
        <label class="visually-hidden" for="conditions-search">Search conditions</label><input class="filter-control" id="conditions-search" type="search" data-filter="conditionsQuery" value="${escapeHtml(ui.filters.conditionsQuery)}" placeholder="Search conditions, exposure, saves, or tags" />
        <label class="visually-hidden" for="conditions-region">Filter region</label><select class="filter-control" id="conditions-region" data-filter="conditionsRegion">${renderOptions(["All", ...unique(data.conditions.map((condition) => condition.region))], selectedRegion)}</select>
        <label class="visually-hidden" for="conditions-type">Filter type</label><select class="filter-control" id="conditions-type" data-filter="conditionsType">${renderOptions(["All", ...unique(data.conditions.map((condition) => condition.type))], selectedType)}</select>
        <span class="filter-count">${conditions.length} of ${data.conditions.length} conditions</span>
      </div>
      <div class="catalog-grid">${conditionCards || `<div class="empty-state"><strong>No matching conditions</strong><span>Change the active filters.</span></div>`}</div>
    </section>`;
  }

  function itemDisplayStats(item) {
    const definitions = [
      ["Damage", item.physicalDamage], ["Magic", item.magicalDamage], ["Critical", engine.numberValue(item.criticalChance) ? `${engine.formatNumber(engine.numberValue(item.criticalChance) * 100, 2)}%` : ""],
      ["Armor", item.armor], ["Resist", item.resistance], ["Evasion", item.evasion], ["Strength", item.strength], ["Speed", item.speed],
      ["Vitality", item.vitality], ["Intellect", item.intelligence], ["Awareness", item.awareness], ["Talent", item.talent], ["Luck", item.luck],
      ["Durability", item.durability], ["Focus", item.focus], ["Regen", item.healthRegeneration], ["Weight", engine.numberValue(item.weight) ? `${item.weight} kg` : ""], ["Value", engine.numberValue(item.value) ? `${item.value} SP` : ""],
    ];
    return definitions
      .filter(([, value]) => value !== "" && value !== "-" && value !== "–" && value !== 0 && value != null)
      .slice(0, 9)
      .map(([label, value]) => `<div class="item-stat"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong></div>`)
      .join("");
  }

  function computeFilteredItems() {
    const query = ui.filters.itemsQuery.trim().toLowerCase();
    const selectedRarity = ui.filters.itemsRarity;
    const selectedType = ui.filters.itemsType;
    const filteredItems = data.items.filter((item) => {
      const haystack = Object.values(item).join(" ").toLowerCase();
      return (!query || haystack.includes(query)) &&
        (selectedRarity === "All" || item.rarity === selectedRarity) &&
        (selectedType === "All" || item.type === selectedType);
    });
    const visibleItems = filteredItems.slice(0, ui.itemLimit);
    return { filteredItems, visibleItems };
  }

  function renderItemCards(visibleItems) {
    return visibleItems
      .map((item) => `<article class="catalog-card item-card" data-rarity="${escapeHtml(item.rarity)}">
        <div class="card-meta">${rarityMarkup(item.rarity)}<span class="pill pill-blue">${escapeHtml(item.type)}</span></div><h2>${escapeHtml(item.name)}</h2>
        <div class="item-stat-grid">${itemDisplayStats(item)}</div><p>${escapeHtml(item.tags || "No tags")}</p>
        <div class="card-actions"><button class="button button-primary button-small" type="button" data-action="add-item" data-name="${escapeHtml(item.name)}">Add to inventory</button><button class="button button-accent button-small" type="button" data-action="equip-item" data-name="${escapeHtml(item.name)}">Equip</button></div>
      </article>`)
      .join("");
  }

  // Surgical update for the Items filters: patches only the catalogue grid,
  // match count, and load-more button instead of re-rendering the whole
  // page (which was destroying and recreating the search input on every
  // keystroke, resetting the caret to position 0 and reversing typed text).
  function renderItemsResults() {
    const { filteredItems, visibleItems } = computeFilteredItems();
    const grid = root.querySelector(".catalog-grid");
    const count = root.querySelector(".filter-count");
    if (grid) {
      grid.innerHTML = renderItemCards(visibleItems) ||
        `<div class="empty-state"><strong>No matching items</strong><span>Change the active filters.</span></div>`;
    }
    if (count) {
      count.textContent = `Showing ${visibleItems.length} of ${filteredItems.length} matches · ${data.items.length} total items`;
    }
    const needsLoadMore = visibleItems.length < filteredItems.length;
    const loadMoreWrap = root.querySelector(".catalog-load-more");
    if (needsLoadMore && !loadMoreWrap) {
      grid?.insertAdjacentHTML(
        "afterend",
        `<div class="catalog-load-more"><button class="button button-primary" type="button" data-action="load-more-items">Load more items</button></div>`,
      );
    } else if (!needsLoadMore && loadMoreWrap) {
      loadMoreWrap.remove();
    }
  }

  function renderItemsPage() {
    const { filteredItems, visibleItems } = computeFilteredItems();
    const selectedRarity = ui.filters.itemsRarity;
    const selectedType = ui.filters.itemsType;
    const cards = renderItemCards(visibleItems);
    return `<section class="page" data-page="items">${pageHeading(
      "Equipment catalogue",
      "Item Catalogue",
      "Browse equipment, item properties, modifiers, and inventory options.",
    )}
      <div class="filters" role="search">
        <label class="visually-hidden" for="items-search">Search items</label><input class="filter-control" id="items-search" type="search" data-filter="itemsQuery" value="${escapeHtml(ui.filters.itemsQuery)}" placeholder="Search names, tags, damage, or modifiers" />
        <label class="visually-hidden" for="items-rarity">Filter rarity</label><select class="filter-control" id="items-rarity" data-filter="itemsRarity">${renderOptions(["All", ...unique(data.items.map((item) => item.rarity))], selectedRarity)}</select>
        <label class="visually-hidden" for="items-type">Filter item type</label><select class="filter-control" id="items-type" data-filter="itemsType">${renderOptions(["All", ...unique(data.items.map((item) => item.type))], selectedType)}</select>
        <span class="filter-count">Showing ${visibleItems.length} of ${filteredItems.length} matches · ${data.items.length} total items</span>
      </div>
      <div class="catalog-grid">${cards || `<div class="empty-state"><strong>No matching items</strong><span>Change the active filters.</span></div>`}</div>
      ${visibleItems.length < filteredItems.length ? `<div class="catalog-load-more"><button class="button button-primary" type="button" data-action="load-more-items">Load more items</button></div>` : ""}
    </section>`;
  }

  function computeFilteredDishes() {
    const query = ui.filters.foodQuery.trim().toLowerCase();
    const selectedRegion = ui.filters.foodRegion;
    return data.food.dishes.filter((dish) => {
      const haystack = `${dish.name} ${dish.region} ${dish.method} ${dish.effect} ${dish.difficulty || ""} ${dish.specialtyUtensil || ""} ${(dish.ingredients || []).join(" ")}`.toLowerCase();
      return (!query || haystack.includes(query)) && (selectedRegion === "All" || dish.region === selectedRegion);
    });
  }

  function dishCookingMeta(dish) {
    return engine.previewCookingCheck(
      state,
      data,
      { ...ui.cooking, recipeKey: dish.name, ingredientSource: "pantry" },
      derived.skills,
    );
  }

  function difficultyTone(key) {
    if (key === "masterwork") return "masterwork";
    if (key === "rare" || key === "dangerous") return "rare";
    if (key === "regional") return "regional";
    if (key === "familiar") return "familiar";
    return "basic";
  }

  function renderFoodCard(dish) {
    const pantry = derived.hearth.pantry.find((entry) => entry.name === dish.name);
    const meta = dishCookingMeta(dish);
    const ingredientLinks = Array.isArray(dish.ingredients) && dish.ingredients.length
      ? `<div class="food-ingredient-list"><strong>Required ingredients</strong><div>${dish.ingredients.map((name) => {
          const owned = Math.max(0, Math.floor(engine.numberValue(state.cooking.ingredientPantry?.[name])));
          return `<button type="button" data-action="show-ingredient" data-name="${escapeHtml(name)}" class="${owned ? "is-owned" : "is-missing"}">${escapeHtml(name)} <small>${owned}</small></button>`;
        }).join("")}</div></div>`
      : "";
    const locked = !meta.levelUnlocked;
    const tone = difficultyTone(meta.difficulty.key);
    return `<article class="catalog-card food-card difficulty-card difficulty-${tone}"><div class="card-meta"><span class="pill pill-blue">${escapeHtml(dish.region)}</span><span class="pill pill-amber">${escapeHtml(dish.cost)} SP ingredients</span><span class="pill difficulty-pill">${escapeHtml(meta.difficulty.label)} · DC ${escapeHtml(meta.dc)}</span><span class="pill">${escapeHtml(pantry?.left || 0)} cooked</span></div><h2>${escapeHtml(dish.name)}${meta.difficulty.key === "masterwork" ? ` <span class="legendary-mark">Legendary</span>` : ""}</h2><p>${escapeHtml(dish.method)}</p>${ingredientLinks}<div class="food-preparation-meta"><span>${escapeHtml(meta.time)}</span><span>Yields ${escapeHtml(meta.baseServings)} serving${meta.baseServings === 1 ? "" : "s"}</span>${dish.specialtyUtensil ? `<span>Requires ${escapeHtml(dish.specialtyUtensil)}</span>` : ""}</div><div class="food-effect"><strong>Hearth Boon</strong><p>${escapeHtml(dish.effect)}</p></div><div class="card-actions"><button class="button button-primary button-small" type="button" data-action="select-cooking-recipe" data-name="${escapeHtml(dish.name)}">${locked ? `View · Level ${meta.requiredLevel}` : "Cook"}</button><button class="button button-quiet button-small" type="button" data-action="add-food" data-name="${escapeHtml(dish.name)}">Add cooked serving</button></div></article>`;
  }

  function renderFoodResults() {
    const dishes = computeFilteredDishes();
    const grid = root.querySelector('[data-food-results="dishes"]');
    const count = root.querySelector('[data-food-count="dishes"]');
    if (grid) {
      grid.innerHTML = dishes.map(renderFoodCard).join("") ||
        `<div class="empty-state"><strong>No matching dishes</strong><span>Change the search or region filter.</span></div>`;
    }
    if (count) count.textContent = `${dishes.length} of ${data.food.dishes.length} dishes`;
  }

  function normalizedIngredientName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function dishesUsingIngredient(ingredientName) {
    const target = normalizedIngredientName(ingredientName);
    return data.food.dishes.filter((dish) =>
      Array.isArray(dish.ingredients) && dish.ingredients.some((name) => normalizedIngredientName(name) === target),
    );
  }

  function computeFilteredIngredients() {
    const query = ui.filters.ingredientQuery.trim().toLowerCase();
    const selectedRegion = ui.filters.ingredientRegion;
    const selectedCategory = ui.filters.ingredientCategory;
    return (data.food.ingredients || []).filter((ingredient) => {
      const haystack = [
        ingredient.name,
        ingredient.category,
        ingredient.region,
        ingredient.mainUse,
        ingredient.secondaryUse,
        ingredient.notes,
        ingredient.source,
        ingredient.marketStatus,
        ingredient.role,
      ].filter(Boolean).join(" ").toLowerCase();
      const regions = String(ingredient.region || "").split(",").map((value) => value.trim());
      return (!query || haystack.includes(query))
        && (selectedRegion === "All" || regions.includes(selectedRegion))
        && (selectedCategory === "All" || ingredient.category === selectedCategory);
    });
  }

  function ingredientExtraRows(ingredient) {
    const rows = [
      ["Source", ingredient.source],
      ["Secondary use", ingredient.secondaryUse],
      ["Market status", ingredient.marketStatus],
      ["Ingredient role", ingredient.role],
    ].filter(([, value]) => String(value || "").trim());
    return rows.length
      ? `<dl class="ingredient-details">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`
      : "";
  }

  function renderIngredientCard(ingredient) {
    const dishes = dishesUsingIngredient(ingredient.name);
    const owned = Math.max(0, Math.floor(engine.numberValue(state.cooking.ingredientPantry?.[ingredient.name])));
    const dishLinks = dishes.length
      ? `<div class="ingredient-recipe-links"><strong>Used in Hearthcraft</strong><div>${dishes.map((dish) => `<button class="button button-quiet button-small" type="button" data-action="select-cooking-recipe" data-name="${escapeHtml(dish.name)}">${escapeHtml(dish.name)}</button>`).join("")}</div></div>`
      : `<div class="ingredient-recipe-links is-empty"><strong>Hearthcraft use</strong><span>No listed recipe currently requires this ingredient.</span></div>`;
    return `<article class="catalog-card ingredient-card" data-ingredient-category="${escapeHtml(ingredient.category)}"><div class="card-meta"><span class="pill pill-blue">${escapeHtml(ingredient.region)}</span><span class="pill pill-amber">${escapeHtml(ingredient.category)}</span><span class="pill pantry-count-pill">${owned} owned</span></div><h2>${escapeHtml(ingredient.name)}</h2><div class="ingredient-main-use"><strong>Main use</strong><p>${escapeHtml(ingredient.mainUse || "Reference ingredient")}</p></div>${ingredientExtraRows(ingredient)}${ingredient.notes ? `<p class="ingredient-notes">${escapeHtml(ingredient.notes)}</p>` : ""}<div class="ingredient-quantity-actions"><button class="button button-primary button-small" type="button" data-action="add-ingredient" data-name="${escapeHtml(ingredient.name)}">Collect +1</button><button class="button button-quiet button-small" type="button" data-action="remove-ingredient" data-name="${escapeHtml(ingredient.name)}" ${owned ? "" : "disabled"}>Remove 1</button></div>${dishLinks}</article>`;
  }

  function renderIngredientResults() {
    const ingredients = computeFilteredIngredients();
    const grid = root.querySelector('[data-food-results="ingredients"]');
    const count = root.querySelector('[data-food-count="ingredients"]');
    if (grid) {
      grid.innerHTML = ingredients.map(renderIngredientCard).join("") ||
        `<div class="empty-state"><strong>No matching ingredients</strong><span>Change the search, region, or category filter.</span></div>`;
    }
    if (count) count.textContent = `${ingredients.length} of ${(data.food.ingredients || []).length} ingredients`;
  }

  function renderHearthcraftViewTabs() {
    const ingredientCount = (data.food.ingredients || []).length;
    const pantryUnits = derived.cooking.ingredientUnits;
    return `<div class="hearthcraft-view-tabs" role="tablist" aria-label="Hearthcraft sections"><button class="tab-button" type="button" role="tab" aria-selected="${ui.foodView === "dishes"}" data-action="switch-hearthcraft-view" data-view="dishes">Cooking & Dishes <span>${data.food.dishes.length}</span></button><button class="tab-button" type="button" role="tab" aria-selected="${ui.foodView === "pantry"}" data-action="switch-hearthcraft-view" data-view="pantry">Ingredient Pantry <span>${pantryUnits}</span></button><button class="tab-button" type="button" role="tab" aria-selected="${ui.foodView === "ingredients"}" data-action="switch-hearthcraft-view" data-view="ingredients">Ingredient Catalogue <span>${ingredientCount}</span></button></div>`;
  }

  function renderHearthcraftProfile() {
    const regions = ["Asura", "Karrnath", "Fittoa", "Shirone", "Ronoa"];
    const utensils = data.food.cooking?.specialtyUtensils || [];
    const kitOwned = derived.cooking.cookingKitOwned;
    const canBuyKit = derived.cooking.coinBalanceSp >= 200;
    return `<section class="panel hearthcraft-profile"><div class="panel-heading blue"><h2>Cook Profile & Equipment</h2><span class="heading-note">Region determines familiarity and difficulty</span></div><div class="panel-body"><div class="hearthcraft-profile-grid"><label class="field"><span>Home Region</span><select data-cooking-state="homeRegion">${regions.map((region) => `<option value="${escapeHtml(region)}" ${state.cooking.homeRegion === region ? "selected" : ""}>${escapeHtml(region)}</option>`).join("")}</select><small>Home dishes are Familiar. Other Central regions are Regional.</small></label><article class="cooking-kit-card ${kitOwned ? "is-owned" : ""}"><div><span>Complete Cooking Kit</span><strong>${kitOwned ? "Owned · +25 Cooking" : "20 GP · 4 kg"}</strong></div>${kitOwned ? `<span class="status-badge status-available">Ready</span>` : `<button class="button button-primary button-small" type="button" data-action="buy-cooking-kit" ${canBuyKit ? "" : "disabled"}>Buy for 20 GP</button>`}</article><article class="coin-purse-card"><span>Available Coin</span><strong>${formatOutput(derived.cooking.coinBalanceSp, "sp")}</strong><small>${escapeHtml(state.currency.silver)} SP · ${escapeHtml(state.currency.gold)} GP · ${escapeHtml(state.currency.platinum)} PP · ${escapeHtml(state.currency.copper)} CP</small></article></div><div class="owned-utensils"><div><strong>Owned Specialty Utensils</strong><span>Tick owned equipment. Missing a required utensil imposes Disadvantage.</span></div><div class="utensil-checkbox-grid">${utensils.map((utensil) => `<label><input type="checkbox" data-owned-utensil="${escapeHtml(utensil.name)}" ${(state.cooking.ownedUtensils || []).includes(utensil.name) ? "checked" : ""} /><span>${escapeHtml(utensil.name)}<small>${escapeHtml(utensil.purpose)}</small></span></label>`).join("")}</div></div></div></section>`;
  }

  function renderIngredientReference() {
    const roles = Array.isArray(data.food.ingredientRoles) ? data.food.ingredientRoles : [];
    const identities = Array.isArray(data.food.regionalIdentity) ? data.food.regionalIdentity : [];
    const suggestions = Array.isArray(data.food.sceneSuggestions) ? data.food.sceneSuggestions : [];
    return `<section class="ingredient-reference panel"><div class="panel-heading amber"><h2>Ingredient Roles & Regional Food</h2><span class="heading-note">Root-Right, Herd-Right, and Tide-Right</span></div><div class="panel-body"><div class="ingredient-role-grid">${roles.map((entry) => `<article><strong>${escapeHtml(entry.role)}</strong><span>${escapeHtml(entry.mainUse)}</span><small>${escapeHtml(entry.dmFunction)}</small></article>`).join("")}</div><details class="regional-food-guide"><summary>Regional food identity and scene suggestions</summary><div class="regional-food-grid">${identities.map((entry) => `<article><strong>${escapeHtml(entry.region)}</strong><span>${escapeHtml(entry.identity)}</span></article>`).join("")}</div>${suggestions.length ? `<div class="scene-ingredient-list">${suggestions.map((entry) => `<div><strong>${escapeHtml(entry.situation)}</strong><span>${escapeHtml(entry.ingredients)}</span></div>`).join("")}</div>` : ""}<p class="ingredient-design-rule">Choose one local animal, one local water ingredient, and one herb or Witness Fruit when the party enters a new region.</p></details></div></section>`;
  }

  function renderIngredientCatalogue() {
    const ingredients = computeFilteredIngredients();
    const allRegions = unique((data.food.ingredients || []).flatMap((ingredient) => String(ingredient.region || "").split(",").map((value) => value.trim())));
    const categories = unique((data.food.ingredients || []).map((ingredient) => ingredient.category));
    return `<div id="ingredient-catalogue">${renderIngredientReference()}<div class="filters section-gap" role="search"><label class="visually-hidden" for="ingredient-search">Search ingredients</label><input class="filter-control" id="ingredient-search" type="search" data-filter="ingredientQuery" value="${escapeHtml(ui.filters.ingredientQuery)}" placeholder="Search ingredients, uses, sources, laws, or notes" /><label class="visually-hidden" for="ingredient-region">Filter ingredient region</label><select class="filter-control" id="ingredient-region" data-filter="ingredientRegion">${renderOptions(["All", ...allRegions], ui.filters.ingredientRegion)}</select><label class="visually-hidden" for="ingredient-category">Filter ingredient category</label><select class="filter-control" id="ingredient-category" data-filter="ingredientCategory">${renderOptions(["All", ...categories], ui.filters.ingredientCategory)}</select><span class="filter-count" data-food-count="ingredients">${ingredients.length} of ${(data.food.ingredients || []).length} ingredients</span></div><div class="catalog-grid ingredient-grid" data-food-results="ingredients">${ingredients.map(renderIngredientCard).join("") || `<div class="empty-state"><strong>No matching ingredients</strong><span>Change the search, region, or category filter.</span></div>`}</div></div>`;
  }

  function renderIngredientPantry() {
    const allIngredients = data.food.ingredients || [];
    if (!ui.pantryIngredient && allIngredients.length) ui.pantryIngredient = allIngredients[0].name;
    const owned = allIngredients
      .map((ingredient) => ({ ...ingredient, quantity: Math.max(0, Math.floor(engine.numberValue(state.cooking.ingredientPantry?.[ingredient.name]))) }))
      .filter((ingredient) => ingredient.quantity > 0)
      .sort((left, right) => left.name.localeCompare(right.name));
    return `<div id="ingredient-pantry"><section class="panel ingredient-pantry-panel"><div class="panel-heading plum"><h2>Ingredient Pantry</h2><span class="heading-note">Collected ingredients are consumed when a Cooking Check is recorded</span></div><div class="panel-body"><div class="ingredient-collect-form"><label class="field"><span>Collected ingredient</span><select data-pantry-control="pantryIngredient">${allIngredients.map((ingredient) => `<option value="${escapeHtml(ingredient.name)}" ${ui.pantryIngredient === ingredient.name ? "selected" : ""}>${escapeHtml(ingredient.name)} · ${escapeHtml(ingredient.region)}</option>`).join("")}</select></label><label class="field"><span>Quantity</span><input type="number" min="1" step="1" data-value-type="number" data-pantry-control="pantryAmount" value="${escapeHtml(ui.pantryAmount)}" /></label><button class="button button-primary" type="button" data-action="add-collected-ingredient">Add collected ingredients</button><button class="button button-quiet" type="button" data-action="switch-hearthcraft-view" data-view="ingredients">Browse catalogue</button></div>${owned.length ? `<div class="owned-ingredient-grid">${owned.map((ingredient) => `<article><div><span>${escapeHtml(ingredient.region)}</span><strong>${escapeHtml(ingredient.name)}</strong></div><div class="owned-ingredient-quantity"><button class="icon-button" type="button" data-action="remove-ingredient" data-name="${escapeHtml(ingredient.name)}" aria-label="Remove one ${escapeHtml(ingredient.name)}">−</button><strong>${ingredient.quantity}</strong><button class="icon-button" type="button" data-action="add-ingredient" data-name="${escapeHtml(ingredient.name)}" aria-label="Add one ${escapeHtml(ingredient.name)}">+</button></div></article>`).join("")}</div>` : `<div class="empty-state"><strong>No ingredients collected</strong><span>Add found ingredients here, or buy a recipe’s ingredient set directly from the Cooking Station.</span></div>`}</div></section></div>`;
  }

  function cookingOutcomeLabel(outcome) {
    return {
      "critical-failure": "Critical Failure",
      failure: "Failure",
      success: "Success",
      "strong-success": "Strong Success",
      "critical-success": "Critical Success",
    }[outcome] || "Cooking Result";
  }

  function cookingOutcomeCopy(result) {
    if (result.outcome === "critical-failure") return "The ingredient set is consumed and spoiled. No servings are created.";
    if (result.outcome === "failure") return `${result.preparedServings} ordinary serving${result.preparedServings === 1 ? "" : "s"} will be added as standard food. No Hearth Boon is created.`;
    if (result.isHearthDish) return `${result.preparedServings} cooked serving${result.preparedServings === 1 ? "" : "s"} will be added to the Hearth pantry.`;
    return `${result.preparedServings} ordinary serving${result.preparedServings === 1 ? "" : "s"} will be added as standard food.`;
  }

  function renderCookingResult(result) {
    if (!result) return `<div class="cooking-result is-empty"><strong>No check rolled</strong><span>Select a recipe and ingredient source, then roll the Cooking Check.</span></div>`;
    if (result.accepted === false) return `<div class="cooking-result is-failure"><strong>Cooking Check unavailable</strong><span>${escapeHtml(result.reason || "The requirements are not met.")}</span></div>`;
    const rollText = result.rolls.length > 1
      ? `${result.rolls.join(" / ")} (${result.rollMode}, kept ${result.naturalRoll})`
      : String(result.naturalRoll);
    const resultClass = result.success ? "is-success" : result.outcome === "critical-failure" ? "is-critical-failure" : "is-failure";
    const rerollAvailable = derived.cooking.rerollAvailable && !result.rerolled && !result.recorded;
    const sourceText = result.ingredientSource === "buy" ? `Buy ingredients for ${result.purchaseCost} SP` : "Use ingredient pantry";
    return `<article class="cooking-result ${resultClass}"><div class="cooking-result-heading"><div><span>${escapeHtml(cookingOutcomeLabel(result.outcome))}</span><strong>${escapeHtml(result.recipeName)}</strong></div><strong class="cooking-total">${escapeHtml(result.total)}</strong></div><dl class="cooking-result-breakdown"><div><dt>Natural roll</dt><dd>${escapeHtml(rollText)}</dd></div><div><dt>Modifier</dt><dd>${result.modifier >= 0 ? "+" : ""}${escapeHtml(result.modifier)}</dd></div><div><dt>Target DC</dt><dd>${escapeHtml(result.dc)}</dd></div><div><dt>Cooking XP</dt><dd>${result.xpAwarded || 0}${result.potentialXp > result.xpAwarded ? " (rest limit)" : ""}</dd></div></dl><p>${escapeHtml(cookingOutcomeCopy(result))}</p><small class="cooking-resource-note">On record: ${escapeHtml(sourceText)}.</small>${result.usedHearthwright ? `<small class="cooking-feature-note">Hearthwright used: this strong success creates 2 extra servings.</small>` : ""}${result.outcome === "critical-success" ? `<small class="cooking-feature-note">Critical success: +1 serving.</small>` : ""}${result.becomesFamiliar ? `<small class="cooking-feature-note">Journeyman: this regional recipe becomes familiar when recorded.</small>` : ""}<div class="cooking-result-actions">${rerollAvailable ? `<button class="button button-accent button-small" type="button" data-action="reroll-cooking-check">Master Cook reroll</button>` : ""}<button class="button button-primary button-small" type="button" data-action="record-cooking-result" ${result.recorded ? "disabled" : ""}>${result.recorded ? "Result recorded" : "Record result & consume ingredients"}</button></div></article>`;
  }

  function renderCookingHistory() {
    const history = derived.cooking.history;
    if (!history.length) return `<div class="empty-state compact"><strong>No cooking history</strong><span>Recorded checks, equipment purchases, and training appear here.</span></div>`;
    const visible = ui.showCookingHistory ? history : history.slice(0, 5);
    const rows = visible.map((entry) => {
      if (entry.type === "training") return `<li><span class="history-marker" aria-hidden="true">XP</span><div><strong>Cooking lesson</strong><p>Gained 1 Cooking XP during Rest ${escapeHtml(entry.restCycle)}.</p></div></li>`;
      if (entry.type === "kit-purchase") return `<li><span class="history-marker" aria-hidden="true">KIT</span><div><strong>Complete Cooking Kit purchased</strong><p>Paid 20 GP and unlocked the +25 Cooking modifier.</p></div></li>`;
      const label = cookingOutcomeLabel(entry.outcome);
      const servingText = entry.pantryAdded
        ? `${entry.pantryAdded} pantry serving${entry.pantryAdded === 1 ? "" : "s"}`
        : `${entry.standardFoodAdded || 0} standard serving${entry.standardFoodAdded === 1 ? "" : "s"}`;
      const resourceText = entry.ingredientSource === "buy"
        ? `${entry.costPaid || 0} SP paid`
        : `${(entry.ingredientsConsumed || []).length} ingredients used`;
      return `<li><span class="history-marker" aria-hidden="true">${escapeHtml(entry.naturalRoll)}</span><div><strong>${escapeHtml(entry.recipeName)} · ${escapeHtml(label)}</strong><p>Total ${escapeHtml(entry.total)} vs DC ${escapeHtml(entry.dc)} · ${escapeHtml(servingText)} · ${escapeHtml(resourceText)} · ${escapeHtml(entry.xpAwarded)} XP${entry.rerolled ? " · rerolled" : ""}</p></div></li>`;
    }).join("");
    return `<ul class="cooking-history-list">${rows}</ul>${history.length > 5 ? `<button class="button button-quiet button-small" type="button" data-action="toggle-cooking-history">${ui.showCookingHistory ? "Show recent" : `View all ${history.length}`}</button>` : ""}`;
  }

  function renderCookingReference() {
    const rules = data.food.cooking || {};
    const kit = rules.kit || {};
    const difficulties = rules.difficulties || [];
    const outcomes = rules.outcomes || [];
    const modifiers = rules.modifiers || [];
    const utensils = rules.specialtyUtensils || [];
    const kitColumns = [["Cookware", kit.contents?.cookware || []], ["Preparation", kit.contents?.preparation || []], ["Field Supplies", kit.contents?.fieldSupplies || []]];
    return `<section class="panel cooking-reference-panel"><div class="panel-heading rust"><h2>Cooking Rules & Equipment</h2><button class="button button-quiet button-small" type="button" data-action="toggle-cooking-reference">${ui.showCookingReference ? "Collapse rules" : "View full rules"}</button></div><div class="panel-body"><div class="cooking-rule-callout"><strong>d100 + Cooking Skill + Hearthcraft Level Bonus + situational modifiers</strong><span>A purchased complete Cooking Kit adds +25.</span></div>${ui.showCookingReference ? `<div class="cooking-reference-grid"><section><h3>Difficulty, Region & Time</h3><div class="reference-table">${difficulties.map((entry) => `<div><strong>DC ${escapeHtml(entry.dc)}</strong><span>${escapeHtml(entry.label)} · ${escapeHtml(entry.recipe)} · ${escapeHtml(entry.time)}</span></div>`).join("")}</div></section><section><h3>Results</h3><div class="reference-table">${outcomes.map((entry) => `<div><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.rule)}</span></div>`).join("")}</div></section><section><h3>Progression Locks</h3><div class="reference-table">${derived.cooking.levels.map((entry) => `<div><strong>Level ${entry.level} · ${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.benefit)}</span></div>`).join("")}</div></section><section><h3>Quick Modifiers</h3><div class="reference-table">${modifiers.map((entry) => `<div><strong>${escapeHtml(entry.situation)}</strong><span>${escapeHtml(entry.rule)}</span></div>`).join("")}</div></section><section><h3>Cooking Kit</h3><div class="kit-summary"><span>Cost ${escapeHtml(kit.cost || 20)} ${escapeHtml(kit.costUnit || "GP")}</span><span>Weight ${escapeHtml(kit.weight || 4)} kg</span><span>+${escapeHtml(kit.bonus || 25)} Cooking</span></div><div class="kit-columns">${kitColumns.map(([title, items]) => `<div><strong>${escapeHtml(title)}</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`).join("")}</div><small>${escapeHtml(kit.excludes || "")}</small></section><section class="reference-span"><h3>Specialty Utensils</h3><div class="specialty-utensil-grid">${utensils.map((utensil) => `<article><strong>${escapeHtml(utensil.name)}</strong><span>${escapeHtml(utensil.purpose)}</span></article>`).join("")}</div></section><section class="reference-span"><h3>Ingredient, Serving & XP Rules</h3><p>Every catalogue recipe consumes one unit of each listed ingredient, or its full listed SP cost. Normal dishes prepare 2 servings. Explicitly dangerous and Legendary dishes prepare 1. A natural 96-100 adds 1 serving.</p><p>Gain 1 XP for successfully preparing a DC 35+ meal, plus 1 XP when it is new, dangerous, regional, foreign, or made under pressure. Maximum 2 Cooking XP per long rest.</p></section></div>` : `<p class="panel-intro">Open the full reference for regional difficulty, progression locks, ingredient use, equipment, serving rules, and Cooking XP.</p>`}</div></section>`;
  }

  function renderCookingStation() {
    const cooking = derived.cooking;
    const preview = engine.previewCookingCheck(state, data, ui.cooking, derived.skills);
    const recipeOptions = [["__basic", "Basic camp meal (DC 20)"], ["__familiar", "Custom familiar dish (Level 1)"], ["__rare", "Custom rare or dangerous dish (Level 4)"], ["__masterwork", "Custom Legendary Masterchef dish (Level 5)"], ...data.food.dishes.map((dish) => [dish.name, dish.name])];
    const progressLabel = cooking.nextLevel ? `${cooking.xp} / ${cooking.nextLevel.threshold} XP to Level ${cooking.nextLevel.level}` : `${cooking.xp} XP · Maximum level`;
    const customRecipe = String(ui.cooking.recipeKey).startsWith("__");
    const familiarChips = cooking.familiarRecipes.length ? cooking.familiarRecipes.map((name) => `<span class="pill pill-blue">${escapeHtml(name)}</span>`).join("") : `<span class="muted-copy">No learned regional recipes yet.</span>`;
    const modifiers = [["Cooking skill", preview.modifierBreakdown.cookingSkill], ["Hearthcraft level", preview.modifierBreakdown.levelBonus], ["Cooking Kit", preview.modifierBreakdown.cookingKit], ["Assistant", preview.modifierBreakdown.assistant]];
    const conditionSummary = [preview.rollMode !== "normal" ? titleCase(preview.rollMode) : "Normal roll", preview.unfamiliarPenalty ? "+10 DC: unfamiliar without guidance" : preview.familiar ? "Learned familiar recipe" : preview.difficultyReason, preview.campCookIgnoredCondition ? "Camp Cook ignored poor conditions" : ""].filter(Boolean).join(" · ");
    const tone = difficultyTone(preview.difficulty.key);
    const ingredientRows = preview.ingredients.length ? preview.ingredients.map((ingredient) => `<li class="${ingredient.owned >= ingredient.required ? "is-ready" : "is-missing"}"><span>${escapeHtml(ingredient.name)}</span><strong>${ingredient.owned}/${ingredient.required}</strong></li>`).join("") : `<li class="is-ready"><span>No tracked catalogue ingredients</span><strong>Ready</strong></li>`;
    const pantryDisabled = preview.isHearthDish && !preview.pantryReady;
    const buyDisabled = preview.isHearthDish && !preview.canAffordIngredients;
    const requirementMessage = !preview.levelUnlocked ? preview.lockReason : !preview.ingredientReady ? (ui.cooking.ingredientSource === "buy" ? `You need ${preview.purchaseCost} SP to buy this ingredient set.` : `Missing: ${preview.missingIngredients.map((entry) => entry.name).join(", ")}.`) : "Ready to cook.";
    return `<section class="panel cooking-station" id="cooking-station"><div class="panel-heading amber"><h2>Cooking Station</h2><span class="heading-note">Ingredients are consumed when the result is recorded</span></div><div class="panel-body"><div class="cooking-station-grid"><aside class="cooking-progression"><div class="cooking-level-heading"><div><span>Cooking Level ${cooking.level}</span><h3>${escapeHtml(cooking.title)}</h3></div><strong>${cooking.totalBonus >= 0 ? "+" : ""}${escapeHtml(cooking.totalBonus)}</strong></div><p>${escapeHtml(cooking.benefit)}</p><div class="cooking-bonus-breakdown"><span>Character Cooking skill <strong>${cooking.skillBonus >= 0 ? "+" : ""}${escapeHtml(cooking.skillBonus)}</strong></span><span>Level bonus <strong>+${escapeHtml(cooking.progressionBonus)}</strong></span></div><div class="cooking-xp-progress"><div><span>${escapeHtml(progressLabel)}</span><span>${escapeHtml(cooking.xpThisRest)}/2 XP this rest</span></div><div class="progress-track"><span style="width:${escapeHtml(cooking.progressPercent)}%"></span></div></div><div class="cooking-progression-actions"><button class="button button-accent button-small" type="button" data-action="grant-cooking-training" ${cooking.xpRemainingThisRest < 1 ? "disabled" : ""}>Record training XP</button><button class="button button-quiet button-small" type="button" data-route="skills">Open Cooking skill</button></div><h4>Learned Familiar Recipes</h4><div class="familiar-recipe-list">${familiarChips}</div><details class="cooking-level-table"><summary>Level progression & recipe access</summary><div>${cooking.levels.map((entry) => `<article class="${entry.level === cooking.level ? "is-current" : cooking.level < entry.level ? "is-locked" : ""}"><strong>Level ${entry.level} · ${escapeHtml(entry.title)}</strong><span>+${entry.bonus} · ${escapeHtml(entry.threshold)} XP</span><p>${escapeHtml(entry.benefit)}</p></article>`).join("")}</div></details></aside><div class="cooking-check-builder"><div class="form-grid two"><label class="field field-wide"><span>Recipe</span><select data-cooking-control="recipeKey">${recipeOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${ui.cooking.recipeKey === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>${customRecipe ? `<label class="field field-wide"><span>Meal name</span><input type="text" data-cooking-control="customName" value="${escapeHtml(ui.cooking.customName)}" placeholder="Name this meal" /></label>` : ""}</div><div class="cooking-recipe-summary difficulty-${tone}"><div><span>${escapeHtml(preview.difficulty.label)}</span><strong>DC ${escapeHtml(preview.dc)}</strong></div><p>${escapeHtml(preview.recipeName)} · ${escapeHtml(preview.time)} · ${escapeHtml(preview.difficultyReason)} · ${escapeHtml(preview.baseServings)} base serving${preview.baseServings === 1 ? "" : "s"}</p>${preview.difficulty.key === "masterwork" ? `<b>Legendary Masterchef Dish</b>` : ""}</div><section class="cooking-ingredient-requirements"><div><h3>Ingredient Set</h3><span>One unit of each ingredient per check</span></div><ul>${ingredientRows}</ul>${preview.isHearthDish ? `<div class="ingredient-source-options"><label class="${pantryDisabled ? "is-disabled" : ""}"><input type="radio" name="ingredient-source" value="pantry" data-cooking-control="ingredientSource" ${ui.cooking.ingredientSource !== "buy" ? "checked" : ""} ${pantryDisabled ? "disabled" : ""} /><span>Use pantry ingredients<small>${preview.pantryReady ? "All ingredients available" : `${preview.missingIngredients.length} missing`}</small></span></label><label class="${buyDisabled ? "is-disabled" : ""}"><input type="radio" name="ingredient-source" value="buy" data-cooking-control="ingredientSource" ${ui.cooking.ingredientSource === "buy" ? "checked" : ""} ${buyDisabled ? "disabled" : ""} /><span>Buy ingredients now<small>${preview.purchaseCost} SP · ${formatOutput(preview.coinBalanceSp, "sp")} available</small></span></label></div>` : ""}</section><div class="cooking-options-grid"><label class="${cooking.cookingKitOwned ? "" : "is-disabled"}"><input type="checkbox" data-cooking-control="cookingKit" ${ui.cooking.cookingKit && cooking.cookingKitOwned ? "checked" : ""} ${cooking.cookingKitOwned ? "" : "disabled"} /><span>Use Complete Cooking Kit <small>${cooking.cookingKitOwned ? "+25" : "Not owned"}</small></span></label><label><input type="checkbox" data-cooking-control="assistant" ${ui.cooking.assistant ? "checked" : ""} /><span>Proficient assistant <small>+10</small></span></label><label><input type="checkbox" data-cooking-control="professionalKitchen" ${ui.cooking.professionalKitchen ? "checked" : ""} /><span>Professional kitchen <small>Advantage</small></span></label><label><input type="checkbox" data-cooking-control="writtenRecipe" ${ui.cooking.writtenRecipe ? "checked" : ""} /><span>Written recipe or local instruction</span></label><label><input type="checkbox" data-cooking-control="poorConditions" ${ui.cooking.poorConditions ? "checked" : ""} /><span>Poor fire, water, or weather <small>Disadvantage</small></span></label><label><input type="checkbox" data-cooking-control="underPressure" ${ui.cooking.underPressure ? "checked" : ""} /><span>Made under pressure <small>Bonus XP trigger</small></span></label>${preview.specialtyUtensil ? `<div class="utensil-readiness ${preview.specialtyPresent ? "is-ready" : "is-missing"}"><span>${escapeHtml(preview.specialtyUtensil)}</span><strong>${preview.specialtyPresent ? "Owned" : "Missing · Disadvantage"}</strong></div>` : ""}${cooking.level >= 2 && ui.cooking.poorConditions ? `<label><input type="checkbox" data-cooking-control="useCampCook" ${ui.cooking.useCampCook ? "checked" : ""} /><span>Use Camp Cook to ignore the condition</span></label>` : ""}${cooking.level >= 4 ? `<label><input type="checkbox" data-cooking-control="useHearthwright" ${ui.cooking.useHearthwright ? "checked" : ""} ${cooking.hearthwrightAvailable ? "" : "disabled"} /><span>Use Hearthwright on a strong success <small>${cooking.hearthwrightAvailable ? "+2 servings" : "Used this rest"}</small></span></label>` : ""}</div><div class="cooking-check-preview"><div><span>Check modifier</span><strong>${preview.modifier >= 0 ? "+" : ""}${escapeHtml(preview.modifier)}</strong></div><p>${modifiers.map(([label, value]) => `${label} ${value >= 0 ? "+" : ""}${value}`).join(" · ")}</p><small>${escapeHtml(conditionSummary)}</small></div><div class="cooking-readiness ${preview.accepted ? "is-ready" : "is-locked"}"><strong>${preview.accepted ? "Requirements met" : "Cannot cook this recipe"}</strong><span>${escapeHtml(requirementMessage)}</span></div><button class="button button-primary cooking-roll-button" type="button" data-action="roll-cooking-check" ${preview.accepted ? "" : "disabled"}>Roll Cooking Check</button>${renderCookingResult(ui.cooking.lastResult)}</div></div><div class="cooking-history"><div class="subsection-heading"><div><h3>Cooking History</h3><span>Ingredients, coin, XP, prepared servings, and feature use</span></div><button class="button button-danger button-small" type="button" data-action="undo-cooking" ${cooking.history.length ? "" : "disabled"}>Undo last</button></div>${renderCookingHistory()}</div></div></section>`;
  }

  function renderFoodPage() {
    const navigation = renderHearthcraftViewTabs();
    const profile = renderHearthcraftProfile();
    if (ui.foodView === "ingredients") return `<section class="page" data-page="food">${pageHeading("Regional cooking", "Hearthcraft", "Browse, collect, and connect the agricultural, herbal, livestock, and fishery ingredients of Sesios.", `<button class="button button-primary" type="button" data-action="switch-hearthcraft-view" data-view="pantry">Open Ingredient Pantry</button>`)}${profile}${navigation}<div id="hearthcraft-view-content">${renderIngredientCatalogue()}</div></section>`;
    if (ui.foodView === "pantry") return `<section class="page" data-page="food">${pageHeading("Regional cooking", "Hearthcraft", "Track collected ingredients before preparing catalogue dishes.", `<button class="button button-primary" type="button" data-action="switch-hearthcraft-view" data-view="dishes">Open Cooking Station</button>`)}${profile}${navigation}<div id="hearthcraft-view-content">${renderIngredientPantry()}</div></section>`;
    const dishes = computeFilteredDishes();
    const selectedRegion = ui.filters.foodRegion;
    const cards = dishes.map(renderFoodCard).join("");
    return `<section class="page" data-page="food">${pageHeading("Regional cooking", "Hearthcraft", "Cook with owned ingredients or purchase an ingredient set, then advance through region-based culinary mastery.", `<button class="button button-primary" type="button" data-route="survival">Open survival tracker</button>`)}${profile}${navigation}<div id="hearthcraft-view-content">${renderCookingStation()}<div class="section-gap">${renderCookingReference()}</div><section class="panel section-gap"><div class="panel-heading blue"><h2>Campaign Hearthcraft Rules</h2><span class="heading-note">DM-editable catalogue notes</span></div><div class="panel-body"><div class="rule-grid">${data.food.rules.map((rule) => `<article class="rule-card"><strong>${escapeHtml(rule.rule)}</strong><span>${escapeHtml(rule.value ?? rule.detail ?? "")}</span></article>`).join("")}</div></div></section><div class="filters section-gap" role="search"><label class="visually-hidden" for="food-search">Search dishes</label><input class="filter-control" id="food-search" type="search" data-filter="foodQuery" value="${escapeHtml(ui.filters.foodQuery)}" placeholder="Search dish names, methods, effects, ingredients, or utensils" /><label class="visually-hidden" for="food-region">Filter region</label><select class="filter-control" id="food-region" data-filter="foodRegion">${renderOptions(["All", ...unique(data.food.dishes.map((dish) => dish.region))], selectedRegion)}</select><span class="filter-count" data-food-count="dishes">${dishes.length} of ${data.food.dishes.length} dishes</span></div><div class="catalog-grid" data-food-results="dishes">${cards || `<div class="empty-state"><strong>No matching dishes</strong><span>Change the search or region filter.</span></div>`}</div></div></section>`;
  }

  const CRAFTING_RARITY_ORDER = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Unique"];

  function craftingRarityRank(rarity) {
    const index = CRAFTING_RARITY_ORDER.indexOf(String(rarity || "Common"));
    return index >= 0 ? index : 0;
  }

  function craftingOutcomeLabel(outcome) {
    return {
      "critical-failure": "Critical Failure",
      "major-failure": "Failure by 20+",
      failure: "Failure",
      success: "Success",
      "strong-success": "Strong Success",
      "critical-success": "Critical Craft",
    }[outcome] || titleCase(outcome || "Result");
  }

  function renderCraftingTabs() {
    const tabs = [
      ["craft", "Craft"],
      ["materials", `Materials (${derived.crafting.totalBundles})`],
      ["recipes", `Recipes (${data.crafting.recipes.length})`],
      ["rules", "Quick Rules"],
    ];
    return `<nav class="crafting-tabs" aria-label="Crafting sections">${tabs.map(([value, label]) => `<button type="button" class="${ui.craftingView === value ? "is-active" : ""}" data-action="switch-crafting-view" data-view="${value}">${escapeHtml(label)}</button>`).join("")}</nav>`;
  }

  function renderCraftingSetup() {
    const rows = derived.crafting.disciplines.map((discipline) => `<article class="crafting-discipline-card"><div><strong>${escapeHtml(discipline.id)}</strong><span>${escapeHtml(discipline.creates)}</span></div><label>Bonus<input type="number" step="1" value="${escapeHtml(discipline.bonus)}" data-crafting-bonus="${escapeHtml(discipline.id)}" /></label><label class="crafting-tool-toggle"><input type="checkbox" data-crafting-tool="${escapeHtml(discipline.id)}" ${discipline.toolOwned ? "checked" : ""} /><span>${escapeHtml(discipline.tool)}<small>${escapeHtml(discipline.costGp)} GP · +25 when owned</small></span></label></article>`).join("");
    return `<section class="panel crafting-setup-panel"><div class="panel-heading"><h2>Crafter Setup</h2><span class="heading-note">One bonus and one tool toggle per discipline</span></div><div class="panel-body"><div class="crafting-discipline-grid">${rows}</div></div></section>`;
  }

  function groupedRecipeOptions(selectedId) {
    const groups = unique(data.crafting.recipes.map((recipe) => recipe.category));
    return groups.map((group) => `<optgroup label="${escapeHtml(group)}">${data.crafting.recipes.filter((recipe) => recipe.category === group).map((recipe) => `<option value="${escapeHtml(recipe.id)}" ${recipe.id === selectedId ? "selected" : ""}>${escapeHtml(recipe.name)} · ${escapeHtml(recipe.rarity)}</option>`).join("")}</optgroup>`).join("");
  }

  function renderCraftingRequirement(requirement) {
    const options = requirement.options;
    const select = options.length
      ? `<select data-crafting-requirement="${requirement.index}">${options.map((material) => `<option value="${escapeHtml(material.id)}" ${material.id === requirement.selectedId ? "selected" : ""}>${escapeHtml(material.name)} · ${escapeHtml(material.rarity)} · ${escapeHtml(material.owned)} owned${material.lowerRarity ? " · +10 DC" : ""}</option>`).join("")}</select>`
      : `<select disabled><option>Missing matching material</option></select>`;
    return `<article class="crafting-requirement ${requirement.ready ? "is-ready" : "is-missing"}"><div><strong>${escapeHtml(requirement.label)} ×${escapeHtml(requirement.requiredQuantity)}</strong><span>${requirement.named ? "Named requirement" : `Tag requirement · ${escapeHtml(requirement.minRarity)} minimum`}</span></div>${select}<b>${requirement.ready ? "Ready" : "Missing"}</b></article>`;
  }

  function renderCraftingResult(result) {
    if (!result) return "";
    const label = craftingOutcomeLabel(result.outcome);
    const className = result.success ? "is-success" : result.outcome === "critical-failure" ? "is-critical-failure" : "is-failure";
    let outcome = "The item was not completed. Materials remain usable.";
    if (result.outcome === "major-failure") outcome = "The item was not completed. One Common or Uncommon bundle will be lost.";
    if (result.outcome === "critical-failure") outcome = "The item was not completed. One non-Unique bundle will be lost and the GM adds a complication.";
    if (result.success) {
      outcome = `${result.outputQuantity} ${result.recipe.name}${result.outputQuantity === 1 ? "" : "s"} will be created.`;
      if (result.halfTime) outcome += " The project takes half the listed time.";
      if (result.masterwork) outcome += " Add a narrative masterwork property with no extra combat power.";
    }
    const rolls = result.rolls.length > 1 ? `${result.rolls.join(" / ")} · kept ${result.naturalRoll}` : String(result.naturalRoll);
    return `<article class="crafting-result ${className}"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(result.total)}</strong></div><p>${escapeHtml(result.recipe.name)} · Natural ${escapeHtml(rolls)} · Modifier ${result.modifier >= 0 ? "+" : ""}${escapeHtml(result.modifier)} · DC ${escapeHtml(result.dc)}</p><b>${escapeHtml(outcome)}</b><button class="button button-primary button-small" type="button" data-action="record-crafting-result" ${result.recorded ? "disabled" : ""}>${result.recorded ? "Result recorded" : "Record result"}</button></article>`;
  }

  function renderCraftingHistory() {
    const history = derived.crafting.history.slice(0, 8);
    if (!history.length) return `<div class="empty-state compact"><strong>No crafting history</strong><span>Recovered bundles and completed checks appear here.</span></div>`;
    return `<ul class="crafting-history-list">${history.map((entry) => entry.type === "recovery"
      ? `<li><span>+1</span><div><strong>${escapeHtml(entry.materialName)}</strong><p>${escapeHtml(entry.sourceLabel)} · Roll ${escapeHtml(entry.total)} · ${escapeHtml(entry.rarity)} award</p></div></li>`
      : `<li><span>${escapeHtml(entry.naturalRoll)}</span><div><strong>${escapeHtml(entry.recipeName)} · ${escapeHtml(craftingOutcomeLabel(entry.outcome))}</strong><p>Total ${escapeHtml(entry.total)} vs DC ${escapeHtml(entry.dc)}${entry.outputQuantity ? ` · ${escapeHtml(entry.outputQuantity)} created` : ""}${entry.masterwork ? " · masterwork property" : ""}</p></div></li>`).join("")}</ul>`;
  }

  function renderCraftingStation() {
    const preview = engine.previewCraftingCheck(state, data, ui.crafting);
    const recipe = preview.recipe;
    if (!recipe) return `<div class="empty-state"><strong>No crafting recipes</strong><span>Add recipes through the DM Catalogue Editor.</span></div>`;
    const requirements = preview.requirements.map(renderCraftingRequirement).join("");
    const status = preview.canAttempt ? "Ready to craft" : preview.lockReason;
    const blueprintControl = preview.blueprintRequired
      ? `<label class="crafting-blueprint-toggle"><input type="checkbox" data-crafting-blueprint="${escapeHtml(recipe.id)}" ${preview.blueprintKnown ? "checked" : ""} /><span>Blueprint known<small>Required for Rare and higher recipes</small></span></label>`
      : `<div class="crafting-blueprint-note"><strong>Blueprint not required</strong><span>Common and Uncommon recipes are generally known.</span></div>`;
    return `<section class="panel crafting-station"><div class="panel-heading rust"><h2>Crafting Station</h2><span class="heading-note">Choose, combine, roll once</span></div><div class="panel-body"><div class="crafting-station-grid"><div class="crafting-builder"><label class="field"><span>Recipe</span><select data-crafting-control="recipeId">${groupedRecipeOptions(recipe.id)}</select></label><article class="crafting-recipe-hero rarity-${slug(recipe.rarity)}"><div><span>${escapeHtml(recipe.category)} · ${escapeHtml(recipe.discipline)}</span><h3>${escapeHtml(recipe.name)}</h3></div><strong>${recipe.project ? "PROJECT" : `DC ${escapeHtml(preview.dc)}`}</strong><p>${escapeHtml(recipe.rarity)} · ${escapeHtml(recipe.time)} · Yield ${escapeHtml(recipe.batchYield)}</p><b>${escapeHtml(recipe.effect)}</b></article><div class="crafting-requirement-list">${requirements}</div>${blueprintControl}<div class="crafting-options"><label><input type="checkbox" data-crafting-control="assistant" ${ui.crafting.assistant ? "checked" : ""} /><span>Proficient assistant<small>+10</small></span></label><label><input type="checkbox" data-crafting-control="workshop" ${ui.crafting.workshop ? "checked" : ""} /><span>Proper workshop<small>Advantage</small></span></label></div><div class="crafting-check-summary"><div><span>Check modifier</span><strong>${preview.modifier >= 0 ? "+" : ""}${escapeHtml(preview.modifier)}</strong></div><p>${escapeHtml(recipe.discipline)} ${preview.disciplineBonus >= 0 ? "+" : ""}${escapeHtml(preview.disciplineBonus)} · Tool ${preview.toolOwned ? "+25" : "not owned"} · ${preview.workshop ? "Advantage" : "Normal roll"}${preview.lowerSubstitute ? " · Lower-rarity substitute +10 DC" : ""}</p></div><div class="crafting-readiness ${preview.canAttempt ? "is-ready" : "is-locked"}"><strong>${preview.canAttempt ? "Requirements met" : "Cannot craft this recipe"}</strong><span>${escapeHtml(status)}</span></div><button class="button button-primary crafting-roll-button" type="button" data-action="roll-crafting-check" ${preview.canAttempt ? "" : "disabled"}>Roll Crafting Check</button>${renderCraftingResult(ui.crafting.lastResult)}</div><aside class="crafting-history"><div class="subsection-heading"><div><h3>Recent Ledger</h3><span>Recovered materials and crafting results</span></div><button class="button button-danger button-small" type="button" data-action="undo-crafting" ${derived.crafting.history.length ? "" : "disabled"}>Undo last</button></div>${renderCraftingHistory()}</aside></div></div></section>`;
  }

  function computeFilteredCraftingMaterials() {
    const query = ui.filters.craftingMaterialQuery.trim().toLowerCase();
    const rarity = ui.filters.craftingMaterialRarity;
    const tag = ui.filters.craftingMaterialTag;
    return data.crafting.materials.filter((material) => {
      const text = `${material.id} ${material.name} ${material.rarity} ${(material.categoryTags || []).join(" ")} ${(material.effectTags || []).join(" ")} ${material.source}`.toLowerCase();
      const tags = [...(material.categoryTags || []), ...(material.effectTags || [])];
      return (!query || text.includes(query)) && (rarity === "All" || material.rarity === rarity) && (tag === "All" || tags.includes(tag));
    });
  }

  function renderCraftingMaterialCards(materials) {
    return materials.map((material) => {
      const quantity = Math.max(0, Math.floor(engine.numberValue(state.crafting.materialInventory[material.id])));
      const tags = [...(material.categoryTags || []), ...(material.effectTags || [])];
      return `<article class="crafting-material-card rarity-${slug(material.rarity)} ${quantity ? "is-owned" : ""}"><header><div><span>${escapeHtml(material.id)}</span><h3>${escapeHtml(material.name)}</h3></div><b>${escapeHtml(material.rarity)}</b></header><p>${escapeHtml(material.source)}</p><div class="crafting-tag-list">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div><footer><button type="button" class="icon-button" data-action="change-crafting-material" data-material-id="${escapeHtml(material.id)}" data-change="-1" ${quantity ? "" : "disabled"}>−</button><strong>${escapeHtml(quantity)}</strong><button type="button" class="icon-button" data-action="change-crafting-material" data-material-id="${escapeHtml(material.id)}" data-change="1">+</button></footer></article>`;
    }).join("");
  }

  function renderCraftingRecovery() {
    const recovery = ui.crafting.recovery;
    const result = recovery.lastResult;
    const eligible = result && result.rarity !== "None"
      ? data.crafting.materials.filter((material) => craftingRarityRank(material.rarity) <= craftingRarityRank(result.rarity))
      : [];
    return `<section class="panel crafting-recovery"><div class="panel-heading amber"><h2>Recover One Material</h2><span class="heading-note">The GM chooses a fitting bundle after the roll</span></div><div class="panel-body"><div class="crafting-recovery-grid"><label>Source<input type="text" value="${escapeHtml(recovery.sourceLabel)}" data-recovery-control="sourceLabel" placeholder="Ashbound Fiend, mine face, ruined workshop…" /></label><label>Survival, Medicine, Investigation, or equivalent bonus<input type="number" step="1" value="${escapeHtml(recovery.bonus)}" data-recovery-control="bonus" /></label><label>Maximum source rarity<select data-recovery-control="maximumRarity">${["Uncommon", "Rare", "Very Rare", "Legendary", "Unique"].map((rarity) => `<option value="${rarity}" ${recovery.maximumRarity === rarity ? "selected" : ""}>${rarity}</option>`).join("")}</select></label><label class="checkbox-field"><input type="checkbox" data-recovery-control="help" ${recovery.help ? "checked" : ""} /><span>Proficient help · +10</span></label><button class="button button-primary" type="button" data-action="roll-crafting-recovery">Roll Recovery</button></div>${result ? `<article class="crafting-recovery-result rarity-${slug(result.rarity)}"><div><span>Natural ${escapeHtml(result.naturalRoll)} · Total ${escapeHtml(result.total)}</span><strong>${escapeHtml(result.rarity === "None" ? "No usable material" : `${result.rarity} bundle`)}</strong></div>${result.rarity !== "None" ? `<label>GM-selected material<select data-recovery-control="materialId">${eligible.map((material) => `<option value="${escapeHtml(material.id)}" ${recovery.materialId === material.id ? "selected" : ""}>${escapeHtml(material.name)} · ${escapeHtml(material.rarity)}</option>`).join("")}</select></label><button class="button button-accent" type="button" data-action="record-crafting-recovery" ${result.recorded ? "disabled" : ""}>${result.recorded ? "Material recorded" : "Add one bundle"}</button>` : `<p>The source yields no useful crafting bundle.</p>`}</article>` : ""}</div></section>`;
  }

  function computeFilteredCraftingRecipes() {
    const query = ui.filters.craftingRecipeQuery.trim().toLowerCase();
    const category = ui.filters.craftingRecipeCategory;
    const rarity = ui.filters.craftingRecipeRarity;
    const discipline = ui.filters.craftingRecipeDiscipline;
    return data.crafting.recipes.filter((recipe) => {
      const text = `${recipe.id} ${recipe.name} ${recipe.category} ${recipe.rarity} ${recipe.discipline} ${recipe.requirementsText} ${recipe.effect}`.toLowerCase();
      return (!query || text.includes(query)) && (category === "All" || recipe.category === category) && (rarity === "All" || recipe.rarity === rarity) && (discipline === "All" || recipe.discipline === discipline);
    });
  }

  function renderCraftingRecipeCards(recipes) {
    return recipes.map((recipe) => {
      const known = state.crafting.knownBlueprints.includes(recipe.id);
      return `<article class="crafting-recipe-card rarity-${slug(recipe.rarity)}"><header><div><span>${escapeHtml(recipe.id)} · ${escapeHtml(recipe.category)}</span><h3>${escapeHtml(recipe.name)}</h3></div><b>${escapeHtml(recipe.rarity)}</b></header><dl><div><dt>Discipline</dt><dd>${escapeHtml(recipe.discipline)}</dd></div><div><dt>DC / Time</dt><dd>${recipe.project ? "Legendary project" : `${escapeHtml(recipe.dc)} · ${escapeHtml(recipe.time)}`}</dd></div><div><dt>Yield</dt><dd>${escapeHtml(recipe.batchYield)}</dd></div></dl><p class="crafting-recipe-materials">${escapeHtml(recipe.requirementsText)}</p><p>${escapeHtml(recipe.effect)}</p><footer>${recipe.blueprintRequired ? `<label><input type="checkbox" data-crafting-blueprint="${escapeHtml(recipe.id)}" ${known ? "checked" : ""} /><span>Blueprint known</span></label>` : `<span class="pill">Generally known</span>`}<button class="button button-primary button-small" type="button" data-action="select-crafting-recipe" data-recipe-id="${escapeHtml(recipe.id)}" ${recipe.project ? "disabled" : ""}>Craft</button></footer></article>`;
    }).join("");
  }

  function renderCraftingMaterialsView() {
    const materials = computeFilteredCraftingMaterials();
    const tags = unique(data.crafting.materials.flatMap((material) => [...(material.categoryTags || []), ...(material.effectTags || [])]));
    return `${renderCraftingRecovery()}<div class="filters section-gap" role="search"><input class="filter-control" type="search" data-filter="craftingMaterialQuery" value="${escapeHtml(ui.filters.craftingMaterialQuery)}" placeholder="Search materials, sources, or tags" /><select class="filter-control" data-filter="craftingMaterialRarity">${renderOptions(["All", ...CRAFTING_RARITY_ORDER], ui.filters.craftingMaterialRarity)}</select><select class="filter-control" data-filter="craftingMaterialTag">${renderOptions(["All", ...tags], ui.filters.craftingMaterialTag)}</select><span class="filter-count">${materials.length} of ${data.crafting.materials.length} materials</span></div><div class="crafting-material-grid" data-crafting-results="materials">${renderCraftingMaterialCards(materials)}</div>`;
  }

  function renderCraftingRecipesView() {
    const recipes = computeFilteredCraftingRecipes();
    return `<div class="filters" role="search"><input class="filter-control" type="search" data-filter="craftingRecipeQuery" value="${escapeHtml(ui.filters.craftingRecipeQuery)}" placeholder="Search recipes, effects, or materials" /><select class="filter-control" data-filter="craftingRecipeCategory">${renderOptions(["All", ...unique(data.crafting.recipes.map((recipe) => recipe.category))], ui.filters.craftingRecipeCategory)}</select><select class="filter-control" data-filter="craftingRecipeRarity">${renderOptions(["All", ...CRAFTING_RARITY_ORDER.slice(0, 5)], ui.filters.craftingRecipeRarity)}</select><select class="filter-control" data-filter="craftingRecipeDiscipline">${renderOptions(["All", ...unique(data.crafting.recipes.map((recipe) => recipe.discipline))], ui.filters.craftingRecipeDiscipline)}</select><span class="filter-count">${recipes.length} of ${data.crafting.recipes.length} recipes</span></div><div class="crafting-recipe-grid" data-crafting-results="recipes">${renderCraftingRecipeCards(recipes)}</div>`;
  }

  function renderLegendaryProjectTracker() {
    const project = derived.crafting.legendaryProject;
    const concepts = data.crafting.legendaryConcepts || [];
    const selected = concepts.find((concept) => concept.id === project.conceptId) || null;
    const completed = [project.designComplete, project.assemblyComplete, project.awakeningComplete].filter(Boolean).length;
    return `<section class="panel crafting-project-tracker"><div class="panel-heading plum"><h2>Legendary Project Tracker</h2><span class="heading-note">${completed}/3 stages complete</span></div><div class="panel-body"><div class="crafting-project-grid"><label>Concept<select data-legendary-project-control="conceptId"><option value="">Choose a concept</option>${concepts.map((concept) => `<option value="${escapeHtml(concept.id)}" ${project.conceptId === concept.id ? "selected" : ""}>${escapeHtml(concept.name)}</option>`).join("")}</select></label><label>Project Name<input type="text" value="${escapeHtml(project.customName)}" data-legendary-project-control="customName" placeholder="Optional custom name" /></label><div class="crafting-project-stage-list"><label class="${project.designComplete ? "is-complete" : ""}"><input type="checkbox" data-legendary-project-control="designComplete" ${project.designComplete ? "checked" : ""} /><span><strong>1. Design · DC 80</strong><small>Intelligence, Awareness, Arcana, or relevant lore.</small></span></label><label class="${project.assemblyComplete ? "is-complete" : ""}"><input type="checkbox" data-legendary-project-control="assemblyComplete" ${project.assemblyComplete ? "checked" : ""} /><span><strong>2. Forging / Assembly · DC 90</strong><small>Use the relevant crafting discipline.</small></span></label><label class="${project.awakeningComplete ? "is-complete" : ""}"><input type="checkbox" data-legendary-project-control="awakeningComplete" ${project.awakeningComplete ? "checked" : ""} /><span><strong>3. Awakening · DC 95</strong><small>Runecraft, Scribing, Religion, Talent, or another fitting check.</small></span></label></div><label class="form-span">Project Notes<textarea rows="4" data-legendary-project-control="notes" placeholder="Components, facility, complications, faction interest…">${escapeHtml(project.notes)}</textarea></label></div>${selected ? `<article class="crafting-project-concept"><span>${escapeHtml(selected.id)}</span><h3>${escapeHtml(selected.name)}</h3><p><strong>Requirements:</strong> ${escapeHtml(selected.requirements)}</p><p><strong>Possible function:</strong> ${escapeHtml(selected.function)}</p></article>` : `<p class="panel-intro">Legendary projects require a Legendary frame, Mythic catalyst, story-bound component, complete blueprint, and world-class facility.</p>`}<div class="button-row"><button class="button button-danger button-small" type="button" data-action="clear-legendary-project" ${project.conceptId || project.customName || project.notes || completed ? "" : "disabled"}>Clear project</button></div></div></section>`;
  }

  function renderCraftingRulesView() {
    const resultRows = [
      ["Natural 1-5", "Lose one non-Unique bundle and trigger a complication."],
      ["Failure by 20+", "Lose one Common or Uncommon bundle."],
      ["Normal failure", "Materials remain usable."],
      ["Success", "Create the listed item."],
      ["Beat DC by 20+", "Half time for permanent items, or +1 consumable."],
      ["Natural 96-100", "+1 consumable, or a narrative masterwork property."],
    ];
    return `<div class="crafting-rules-grid"><section class="panel"><div class="panel-heading"><h2>Three-Step Loop</h2></div><div class="panel-body"><ol class="crafting-loop"><li><strong>Recover</strong><span>Roll once after a meaningful monster or site. Record one bundle.</span></li><li><strong>Combine</strong><span>Choose a recipe and select matching materials.</span></li><li><strong>Craft</strong><span>Roll the discipline once. The site resolves the result.</span></li></ol></div></section><section class="panel"><div class="panel-heading blue"><h2>Rarity and DC</h2></div><div class="panel-body"><div class="reference-table">${Object.entries(data.crafting.rules.rarityDcs).map(([rarity, dc]) => `<div><strong>${escapeHtml(rarity)} · DC ${escapeHtml(dc)}</strong><span>${rarity === "Common" ? "Short rest to 1 day" : rarity === "Uncommon" ? "4 hours to 2 days" : rarity === "Rare" ? "1 to 4 days" : "3 to 10 days"}</span></div>`).join("")}<div><strong>Legendary</strong><span>Three narrative stages, not a normal crafting check.</span></div></div></div></section><section class="panel"><div class="panel-heading rust"><h2>Results</h2></div><div class="panel-body"><div class="reference-table">${resultRows.map(([label, rule]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(rule)}</span></div>`).join("")}</div></div></section><section class="panel"><div class="panel-heading amber"><h2>Substitution</h2></div><div class="panel-body"><p>A matching tag and equal or higher rarity is valid. A lower-rarity substitute adds +10 DC. Named requirements remain specific unless the GM approves otherwise.</p><p>Common binders, fuel, wax, containers, and ordinary thread are treated as workshop supplies and are not tracked.</p></div></section><section class="panel crafting-legendary-panel"><div class="panel-heading plum"><h2>Legendary Projects</h2><span class="heading-note">Design DC 80 · Assembly DC 90 · Awakening DC 95</span></div><div class="panel-body"><div class="legendary-concept-grid">${data.crafting.legendaryConcepts.map((concept) => `<article><span>${escapeHtml(concept.id)}</span><h3>${escapeHtml(concept.name)}</h3><p>${escapeHtml(concept.requirements)}</p><b>${escapeHtml(concept.function)}</b></article>`).join("")}</div></div></section>${renderLegendaryProjectTracker()}</div>`;
  }

  function renderCraftingResults() {
    if (ui.craftingView === "materials") {
      const materials = computeFilteredCraftingMaterials();
      const container = root.querySelector('[data-crafting-results="materials"]');
      if (container) container.innerHTML = renderCraftingMaterialCards(materials);
      const count = root.querySelector(".filter-count");
      if (count) count.textContent = `${materials.length} of ${data.crafting.materials.length} materials`;
      return;
    }
    if (ui.craftingView === "recipes") {
      const recipes = computeFilteredCraftingRecipes();
      const container = root.querySelector('[data-crafting-results="recipes"]');
      if (container) container.innerHTML = renderCraftingRecipeCards(recipes);
      const count = root.querySelector(".filter-count");
      if (count) count.textContent = `${recipes.length} of ${data.crafting.recipes.length} recipes`;
    }
  }

  function renderCraftingPage() {
    const content = ui.craftingView === "materials"
      ? renderCraftingMaterialsView()
      : ui.craftingView === "recipes"
        ? renderCraftingRecipesView()
        : ui.craftingView === "rules"
          ? renderCraftingRulesView()
          : `${renderCraftingSetup()}<div class="section-gap">${renderCraftingStation()}</div>`;
    return `<section class="page" data-page="crafting">${pageHeading(
      "Creation-only system",
      "The Crafter's Ledger",
      "Recover one material bundle, choose a recipe, and resolve the craft with one d100 check.",
      `<button class="button button-primary" type="button" data-action="switch-crafting-view" data-view="materials">Open Materials</button>`,
    )}${renderCraftingTabs()}<div id="crafting-view-content">${content}</div></section>`;
  }


  function chooseEquipmentSlot(item) {
    const type = String(item?.type || "").toLowerCase();
    if (type.includes("head")) return "headgear";
    if (type.includes("torso") || type === "outfit") return "plate";
    if (type.includes("feet")) return "footwear";
    if (type.includes("shield")) return "lefthand";
    if (type.includes("trinket") || type.includes("focus") || type === "item") {
      return state.equipment.trinket ? "secondarytrinket" : "trinket";
    }
    if (type.includes("neck")) return "necklace";
    return state.equipment.righthand ? "lefthand" : "righthand";
  }

  // Mirrors chooseEquipmentSlot's type-matching rules, but the other way
  // round: given a slot, does this catalogue item belong there? Used to
  // filter the equipment dropdowns down to items that actually fit.
  function slotAcceptsItem(slotId, item) {
    const type = String(item?.type || "").toLowerCase();
    switch (slotId) {
      case "headgear":
        return type.includes("head");
      case "plate":
        return type.includes("torso") || type === "outfit";
      case "footwear":
        return type.includes("feet");
      case "necklace":
        return type.includes("neck");
      case "trinket":
      case "secondarytrinket":
        return type.includes("trinket") || type.includes("focus") || type === "item";
      case "lefthand":
        return type.includes("shield") || item.type === "Melee" || item.type === "Ranged";
      case "righthand":
        return item.type === "Melee" || item.type === "Ranged";
      default:
        return true;
    }
  }

  // Returns the distinct item names currently in the character's inventory
  // that fit the given equipment slot, so each slot's dropdown only offers
  // relevant, owned items instead of the entire item catalogue.
  function equipmentOptionsForSlot(slotId) {
    const seen = new Set();
    const names = [];
    const available = new Set(engine.availableInventoryItemNames(state));
    state.inventory.forEach((entry) => {
      const name = String(entry?.name || "").trim();
      if (!name || !available.has(name) || seen.has(name)) return;
      const item = data.items.find((candidate) => candidate.name === name);
      if (item && slotAcceptsItem(slotId, item)) {
        seen.add(name);
        names.push(name);
      }
    });
    return names;
  }

  function applyInventoryEquipToggle(index, checked) {
    const entry = state.inventory[index];
    if (!entry) return { changed: false, message: "That inventory row is no longer available." };

    const itemName = String(entry.name || "").trim();
    if (!itemName) {
      entry.equipped = false;
      return { changed: false, message: "Enter an item name before marking it equipped." };
    }

    if (checked && engine.numberValue(entry.quantity) <= 0) {
      entry.equipped = false;
      return { changed: false, message: `Add at least one ${itemName} before equipping it.` };
    }

    if (!checked) {
      entry.equipped = false;
      let removedFromSlot = false;
      data.equipmentSlots.forEach((slot) => {
        if (state.equipment[slot.id] === itemName) {
          state.equipment[slot.id] = "";
          removedFromSlot = true;
        }
      });
      return {
        changed: true,
        message: removedFromSlot ? `${itemName} unequipped.` : `${itemName} marked as not equipped.`,
      };
    }

    const item = data.items.find((candidate) => candidate.name === itemName);
    if (!item) {
      entry.equipped = false;
      return { changed: false, message: `${itemName} isn't a catalogue item and can't be equipped.` };
    }

    const slot = chooseEquipmentSlot(item);
    const previousItemName = state.equipment[slot];
    if (previousItemName && previousItemName !== item.name) {
      state.inventory.forEach((otherEntry) => {
        if (otherEntry !== entry && otherEntry.name === previousItemName) otherEntry.equipped = false;
      });
    }
    state.equipment[slot] = item.name;
    entry.equipped = true;
    const label = data.equipmentSlots.find((slotDef) => slotDef.id === slot)?.label || titleCase(slot);
    return { changed: true, message: `${item.name} equipped in ${label}.` };
  }

  function handleRouteAction(event) {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      navigate(routeButton.dataset.route);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    let changed = false;
    let message = "";

    if (action === "switch-crafting-view") {
      ui.craftingView = ["craft", "materials", "recipes", "rules"].includes(button.dataset.view) ? button.dataset.view : "craft";
      renderRoute({ preserveScroll: true });
      window.requestAnimationFrame(() => document.getElementById("crafting-view-content")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (action === "change-crafting-material") {
      const result = engine.changeCraftingMaterial(state, button.dataset.materialId, Number(button.dataset.change));
      if (!result.accepted) {
        showToast("That material quantity could not be changed.", "error");
        return;
      }
      ui.crafting.lastResult = null;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      const material = data.crafting.materials.find((entry) => entry.id === result.materialId);
      showToast(`${material?.name || result.materialId}: ${result.quantity} bundle${result.quantity === 1 ? "" : "s"}.`, "success");
      return;
    }
    if (action === "select-crafting-recipe") {
      ui.craftingView = "craft";
      ui.crafting.recipeId = button.dataset.recipeId;
      ui.crafting.selections = {};
      ui.crafting.lastResult = null;
      renderRoute({ preserveScroll: true });
      window.requestAnimationFrame(() => document.querySelector(".crafting-station")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (action === "roll-crafting-check") {
      const result = engine.rollCraftingCheck(state, data, ui.crafting);
      if (!result.accepted) {
        showToast(result.preview?.lockReason || "The crafting requirements are not met.", "error");
        return;
      }
      ui.crafting.selections = { ...result.selections };
      ui.crafting.lastResult = result;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "record-crafting-result") {
      const result = engine.recordCraftingResult(state, data, ui.crafting.lastResult);
      if (!result.accepted) {
        const copy = result.reason === "missing-materials"
          ? "The selected material bundles are no longer available."
          : result.reason === "missing-blueprint"
            ? "This recipe's blueprint is no longer marked as known."
            : "That crafting result could not be recorded.";
        showToast(copy, "error");
        return;
      }
      ui.crafting.lastResult = { ...ui.crafting.lastResult, recorded: true };
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      const entry = result.entry;
      showToast(entry.inventoryAdded ? `${entry.inventoryAdded.quantity} ${entry.inventoryAdded.name}${entry.inventoryAdded.quantity === 1 ? "" : "s"} added to inventory.` : `${craftingOutcomeLabel(entry.outcome)} recorded.`, "success");
      return;
    }
    if (action === "roll-crafting-recovery") {
      ui.crafting.recovery.lastResult = engine.rollCraftingRecovery(state, ui.crafting.recovery);
      ui.crafting.recovery.materialId = "";
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "record-crafting-recovery") {
      const recovery = ui.crafting.recovery;
      const eligible = recovery.lastResult && recovery.lastResult.rarity !== "None"
        ? data.crafting.materials.filter((material) => craftingRarityRank(material.rarity) <= craftingRarityRank(recovery.lastResult.rarity))
        : [];
      const materialId = recovery.materialId || eligible[0]?.id || "";
      const result = engine.recordCraftingRecovery(state, data, recovery.lastResult, materialId);
      if (!result.accepted) {
        showToast(result.reason === "rarity-too-high" ? "That material exceeds the recovered rarity." : "The recovered material could not be recorded.", "error");
        return;
      }
      recovery.lastResult = { ...recovery.lastResult, recorded: true };
      recovery.materialId = materialId;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast(`${result.entry.materialName} added as one material bundle.`, "success");
      return;
    }
    if (action === "undo-crafting") {
      const latest = derived.crafting.history[0];
      if (!latest || !window.confirm(`Undo the latest crafting ledger entry?`)) return;
      const result = engine.undoLastCraftingAction(state);
      if (!result.accepted) {
        const copy = result.reason === "crafted-item-used"
          ? "The crafted inventory quantity has already been used or changed."
          : result.reason === "material-used"
            ? "The recovered material has already been used."
            : "The latest crafting entry cannot be undone.";
        showToast(copy, "error");
        return;
      }
      ui.crafting.lastResult = null;
      ui.crafting.recovery.lastResult = null;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Latest crafting ledger entry undone.", "success");
      return;
    }
    if (action === "clear-legendary-project") {
      if (!window.confirm("Clear the active Legendary Project tracker?")) return;
      state.crafting.legendaryProject = {
        conceptId: "",
        customName: "",
        designComplete: false,
        assemblyComplete: false,
        awakeningComplete: false,
        notes: "",
      };
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Legendary Project tracker cleared.", "success");
      return;
    }
    if (action === "request-long-rest") {
      requestLongRest();
      return;
    }
    if (action === "request-advance-day") {
      requestAdvanceDay();
      return;
    }
    if (action === "request-reset-days") {
      const currentDay = Math.max(1, Math.floor(engine.numberValue(state.hunger.currentDay) || 1));
      if (currentDay === 1) {
        showToast("The day counter is already at Day 1.", "error");
        return;
      }
      if (!window.confirm(`Reset the day counter from Day ${currentDay} to Day 1? Rations, hunger, pantry servings, and journey history will remain unchanged.`)) return;
      const result = engine.resetDayCounter(state);
      if (!result.accepted) {
        showToast("The day counter could not be reset.", "error");
        return;
      }
      commitSurvivalChange(`Day counter reset from Day ${result.previousDay} to Day 1.`);
      return;
    }
    if (action === "request-selected-hearth-meal") {
      requestHearthMeal(state.hearth.selectedDish);
      return;
    }
    if (action === "request-hearth-meal") {
      requestHearthMeal(button.dataset.name);
      return;
    }
    if (action === "toggle-pantry-manager") {
      ui.showPantryManager = !ui.showPantryManager;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "switch-hearthcraft-view") {
      ui.foodView = ["dishes", "pantry", "ingredients"].includes(button.dataset.view) ? button.dataset.view : "dishes";
      renderRoute({ preserveScroll: true });
      window.requestAnimationFrame(() => document.getElementById("hearthcraft-view-content")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (action === "buy-cooking-kit") {
      const result = engine.buyCookingKit(state);
      if (!result.accepted) {
        const copy = result.reason === "already-owned" ? "The Complete Cooking Kit is already owned." : "The character does not have the 20 GP required for a Complete Cooking Kit.";
        showToast(copy, "error");
        return;
      }
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Complete Cooking Kit purchased for 20 GP. The +25 Cooking modifier is now available.", "success");
      return;
    }
    if (action === "add-collected-ingredient") {
      const name = ui.pantryIngredient || data.food.ingredients?.[0]?.name;
      const amount = Math.max(1, Math.floor(engine.numberValue(ui.pantryAmount) || 1));
      if (!name) {
        showToast("Choose an ingredient to add.", "error");
        return;
      }
      state.cooking.ingredientPantry[name] = Math.max(0, Math.floor(engine.numberValue(state.cooking.ingredientPantry[name]))) + amount;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast(`${amount} ${name} added to the ingredient pantry.`, "success");
      return;
    }
    if (action === "add-ingredient" || action === "remove-ingredient") {
      const name = button.dataset.name;
      const current = Math.max(0, Math.floor(engine.numberValue(state.cooking.ingredientPantry[name])));
      const next = action === "add-ingredient" ? current + 1 : Math.max(0, current - 1);
      if (next) state.cooking.ingredientPantry[name] = next;
      else delete state.cooking.ingredientPantry[name];
      ui.cooking.lastResult = null;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast(`${name}: ${next} in the ingredient pantry.`, "success");
      return;
    }
    if (action === "show-ingredient") {
      ui.foodView = "ingredients";
      ui.filters.ingredientQuery = button.dataset.name || "";
      ui.filters.ingredientRegion = "All";
      ui.filters.ingredientCategory = "All";
      renderRoute({ preserveScroll: true });
      window.requestAnimationFrame(() => document.getElementById("ingredient-catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (action === "select-cooking-recipe") {
      ui.foodView = "dishes";
      ui.cooking.recipeKey = button.dataset.name;
      ui.cooking.customName = "";
      ui.cooking.lastResult = null;
      renderRoute({ preserveScroll: true });
      window.requestAnimationFrame(() => document.getElementById("cooking-station")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (action === "roll-cooking-check") {
      const result = engine.rollCookingCheck(state, data, ui.cooking, derived.skills);
      if (!result.accepted) {
        const copy = result.reason === "level-locked"
          ? result.preview?.lockReason || "This recipe is locked by Cooking Level."
          : result.reason === "missing-ingredients"
            ? `Missing ingredients: ${(result.preview?.missingIngredients || []).map((entry) => entry.name).join(", ")}.`
            : "The character cannot afford this recipe’s ingredient set.";
        showToast(copy, "error");
        return;
      }
      ui.cooking.lastResult = result;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "reroll-cooking-check") {
      const result = engine.rerollCookingCheck(state, data, ui.cooking.lastResult, derived.skills);
      if (!result.accepted) {
        showToast(result.reason === "already-used" ? "The Master Cook reroll has already been used this rest." : "The reroll is not available.", "error");
        return;
      }
      ui.cooking.lastResult = result.result;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Master Cook reroll used. The new result must be kept.", "success");
      return;
    }
    if (action === "record-cooking-result") {
      const result = engine.recordCookingResult(state, data, ui.cooking.lastResult, derived.skills);
      if (!result.accepted) {
        const copy = result.reason === "already-recorded"
          ? "That Cooking Check has already been recorded."
          : result.reason === "missing-ingredients"
            ? "The required pantry ingredients are no longer available."
            : result.reason === "insufficient-funds"
              ? "The character no longer has enough coin to buy the ingredient set."
              : result.reason === "level-locked"
                ? "The recipe is no longer unlocked at this Cooking Level."
                : "The Cooking Check could not be recorded.";
        showToast(copy, "error");
        return;
      }
      ui.cooking.lastResult = { ...ui.cooking.lastResult, recorded: true, xpAwarded: result.actualXp };
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      const servingCopy = result.pantryAdded
        ? `${result.pantryAdded} Hearth serving${result.pantryAdded === 1 ? "" : "s"} added to the cooked-meal pantry.`
        : result.standardFoodAdded
          ? `${result.standardFoodAdded} standard serving${result.standardFoodAdded === 1 ? "" : "s"} added to today’s food.`
          : "No servings were created.";
      const resourceCopy = result.costPaid
        ? ` Paid ${result.costPaid} SP for ingredients.`
        : result.consumedIngredients?.length
          ? ` Consumed ${result.consumedIngredients.length} ingredient type${result.consumedIngredients.length === 1 ? "" : "s"}.`
          : "";
      showToast(`${servingCopy}${resourceCopy}${result.actualXp ? ` Gained ${result.actualXp} Cooking XP.` : ""}`, "success");
      return;
    }
    if (action === "grant-cooking-training") {
      const result = engine.grantCookingTrainingXp(state, derived.skills);
      if (!result.accepted) {
        showToast("The 2 XP per long rest limit has already been reached.", "error");
        return;
      }
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Training recorded: gained 1 Cooking XP.", "success");
      return;
    }
    if (action === "undo-cooking") {
      const latest = derived.cooking.history[0];
      const latestLabel = latest?.type === "training" ? "training entry" : latest?.type === "kit-purchase" ? "Cooking Kit purchase" : `result for ${latest?.recipeName}`;
      if (!latest || !window.confirm(`Undo the latest cooking ${latestLabel}?`)) return;
      const result = engine.undoLastCookingAction(state);
      if (!result.accepted) {
        const undoMessage = result.reason === "day-advanced"
          ? "That meal was already incorporated into a completed day and cannot be undone here."
          : result.reason === "servings-consumed"
            ? "One or more prepared servings have already been eaten and cannot be removed."
            : "The latest cooking entry could not be undone.";
        showToast(undoMessage, "error");
        return;
      }
      ui.cooking.lastResult = null;
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast("Latest cooking entry undone.", "success");
      return;
    }
    if (action === "toggle-cooking-reference") {
      ui.showCookingReference = !ui.showCookingReference;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "toggle-cooking-history") {
      ui.showCookingHistory = !ui.showCookingHistory;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "toggle-history") {
      ui.showAllSurvivalHistory = !ui.showAllSurvivalHistory;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "edit-history") {
      requestHistoryEdit(button.dataset.id);
      return;
    }
    if (action === "undo-survival") {
      const latest = derived.survivalHistory.at(-1);
      if (!latest || !window.confirm(`Undo “${latest.title}”?`)) return;
      const result = engine.undoLastSurvivalAction(state);
      if (!result.accepted) {
        showToast("The latest action could not be undone.", "error");
        return;
      }
      commitSurvivalChange(`${latest.title} undone.`);
      return;
    }
    if (action === "use-hearth-boon") {
      const result = engine.markHearthBoonUsed(state, data);
      changed = result.accepted;
      message = result.accepted
        ? `${result.mealEntry.dish} boon marked as used.`
        : "There is no active Hearth Boon to use.";
    }
    if (action === "change-ailment-mark") {
      const result = engine.changeTrackedAilmentMark(
        state,
        Number(button.dataset.index),
        Number(button.dataset.change),
      );
      changed = result.accepted;
      if (result.accepted && result.resolved) {
        message = `${result.resolvedName} resolved and removed.`;
      } else if (result.accepted) {
        message = `${result.ailment.name} set to Mark ${result.mark}.`;
      } else {
        message = "That ailment mark could not be changed.";
      }
    }
    if (action === "add-pantry-serving") {
      const name = button.dataset.name;
      if (data.food.dishes.some((dish) => dish.name === name)) {
        state.hearth.acquired[name] = engine.numberValue(state.hearth.acquired[name]) + 1;
        changed = true;
        message = `One serving of ${name} added to the pantry and total rations.`;
      }
    }
    if (action === "print") {
      window.print();
      return;
    }
    if (action === "spell-tab") {
      ui.spellLevel = button.dataset.level;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "load-more-items") {
      ui.itemLimit += 48;
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === "open-craft-image") {
      if (typeof imageDialog.showModal === "function") imageDialog.showModal();
      else imageDialog.setAttribute("open", "");
      return;
    }
    if (action === "roll-accuracy") {
      const count = Math.max(0, Math.min(7, Math.floor(engine.numberValue(state.damageTool.rollCount))));
      state.damageTool.rolls = state.damageTool.rolls.map((value, index) => index < count ? Math.floor(Math.random() * 100) : "");
      changed = true;
      message = `Rolled ${count} accuracy ${count === 1 ? "check" : "checks"}.`;
    }
    if (action === "roll-critical") {
      state.damageTool.criticalRoll = Math.floor(Math.random() * 100);
      changed = true;
      message = "Critical roll updated.";
    }
    if (action === "clear-inventory") {
      const index = Number(button.dataset.index);
      if (state.inventory[index]) {
        state.inventory[index] = engine.createInventoryEntry();
        changed = true;
        message = `Inventory row ${index + 1} cleared.`;
      }
    }
    if (action === "add-inventory-slot") {
      engine.addInventorySlot(state);
      changed = true;
      message = `Inventory slot ${state.inventory.length} added.`;
    }
    if (action === "remove-inventory-slot") {
      const index = Number(button.dataset.index);
      const entry = state.inventory[index];
      if (entry) {
        const itemName = String(entry.name || "").trim();
        const hasCustomValues =
          itemName ||
          entry.equipped === true ||
          (entry.weightOverride !== null && entry.weightOverride !== "") ||
          engine.numberValue(entry.quantity) !== 1;
        if (
          hasCustomValues &&
          !window.confirm(`Remove ${itemName ? `“${itemName}”` : `inventory slot ${index + 1}`}?`)
        ) {
          return;
        }
        engine.removeInventorySlot(state, index);
        changed = true;
        message = itemName ? `${itemName} removed from inventory.` : `Inventory slot ${index + 1} removed.`;
      }
    }
    if (action === "add-item") {
      changed = engine.addInventoryItem(state, button.dataset.name);
      message = changed ? `${button.dataset.name} added to inventory.` : "The item could not be added.";
    }
    if (action === "equip-item") {
      const item = data.items.find((entry) => entry.name === button.dataset.name);
      const availableItems = engine.availableInventoryItemNames(state);
      if (item && availableItems.includes(item.name)) {
        const slot = chooseEquipmentSlot(item);
        const previousItemName = state.equipment[slot];
        if (previousItemName && previousItemName !== item.name) {
          state.inventory.forEach((entry) => {
            if (entry.name === previousItemName) entry.equipped = false;
          });
        }
        state.equipment[slot] = item.name;
        state.inventory.forEach((entry) => {
          if (entry.name === item.name) entry.equipped = true;
        });
        changed = true;
        const label = data.equipmentSlots.find((entry) => entry.id === slot)?.label || titleCase(slot);
        message = `${item.name} equipped in ${label}.`;
      } else if (item) {
        message = `Add ${item.name} to the inventory before equipping it.`;
      }
    }
    if (action === "add-trait") {
      const result = engine.addPersonalityTrait(state, data, button.dataset.name);
      changed = result.added;
      if (result.added) {
        message = `${button.dataset.name} added to the character.`;
      } else if (result.reason === "limit") {
        message = "Personality trait maximum reached. Remove a trait before adding another.";
      } else if (result.reason === "duplicate") {
        message = `${button.dataset.name} is already assigned to this character.`;
      } else {
        message = "That personality trait could not be added.";
      }
    }
    if (action === "remove-trait") {
      const result = engine.removePersonalityTrait(state, Number(button.dataset.index));
      changed = result.removed;
      message = result.removed
        ? `${result.name} removed from the character.`
        : "That personality trait could not be removed.";
    }
    if (action === "add-condition") {
      const emptyIndex = state.activeAilments.findIndex((entry) => !String(entry.name || "").trim());
      if (emptyIndex >= 0) {
        engine.setTrackedAilment(state, emptyIndex, button.dataset.name);
        changed = true;
        message = `${button.dataset.name} added to ailments at Mark 1.`;
      } else {
        message = "All six ailment slots are occupied.";
      }
    }
    if (action === "add-food") {
      const name = button.dataset.name;
      state.hearth.acquired[name] = engine.numberValue(state.hearth.acquired[name]) + 1;
      changed = true;
      message = `One serving of ${name} added to the pantry and total rations.`;
    }

    if (changed) {
      recalculate();
      scheduleSave();
      renderRoute({ preserveScroll: true });
      showToast(message, "success");
    } else if (message) {
      showToast(message, "error");
    }
  }

  function safeFileName(value) {
    return String(value || "character")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "character";
  }

  function exportState() {
    const payload = {
      application: "Amutsu Character Sheet",
      sourceWorkbook: data.meta.sourceFile,
      schemaVersion: state.schemaVersion,
      exportedAt: new Date().toISOString(),
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(state.character.name)}-amutsu-data.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Character data exported as JSON.", "success");
  }

  async function importState(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const supplied = parsed.state || parsed;
      if (!supplied || typeof supplied !== "object" || !supplied.character) {
        throw new Error("This file does not contain an Amutsu character state.");
      }
      const preservedExperience = engine.normalizeCharacterProgression(clone(state));
      state = mergeWithDefaults(clone(data.defaultState), supplied);
      if (viewerRole !== "dm") {
        if (!state.character || typeof state.character !== "object") state.character = {};
        state.character.experience = preservedExperience.totalXp;
        state.character.level = preservedExperience.level;
      }
      recalculate();
      scheduleSave();
      renderRoute();
      showToast("Character data imported and recalculated.", "success");
    } catch (error) {
      showToast(error.message || "The selected JSON file could not be imported.", "error");
    } finally {
      event.target.value = "";
    }
  }

  function requestReset() {
    if (typeof resetDialog.showModal === "function") {
      resetDialog.showModal();
      return;
    }
    if (window.confirm("Reset this character to its creation state? The name, original base ability rolls, and DM-controlled XP will be preserved.")) resetState();
  }

  function resetState() {
    const preservedName = String(state.character?.name || "").trim();
    const preservedExperience = engine.normalizeCharacterProgression(clone(state));
    const preservedBaseScores = {};
    data.abilityDefinitions.forEach((ability) => {
      const hasStoredBase = state.abilityBaseScores && Object.hasOwn(state.abilityBaseScores, ability.id);
      preservedBaseScores[ability.id] = hasStoredBase
        ? engine.numberValue(state.abilityBaseScores[ability.id])
        : ability.base;
    });

    state = clone(data.defaultState);
    state.character.name = preservedName;
    state.character.experience = preservedExperience.totalXp;
    state.character.level = preservedExperience.level;
    state.abilityBaseScores = preservedBaseScores;
    recalculate();
    if (!embedded) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch (error) {
        // The reset still succeeds in memory when local storage is unavailable.
      }
    }
    scheduleSave();
    renderRoute();
    showToast("Character reset. Name, original base ability rolls, and DM-controlled XP were preserved.", "success");
  }

  function showToast(message, type) {
    const region = document.getElementById("toast-region");
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "is-error" : "is-success"}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }
})();
