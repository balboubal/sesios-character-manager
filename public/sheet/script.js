(function bootstrapAmutsuApplication() {
  "use strict";

  const data = window.AMUTSU_DATA;
  const engine = window.AmutsuEngine;
  const storageKey = "amutsu-character-sheet:v1";
  const query = new URLSearchParams(window.location.search);
  const embedded = query.get("embedded") === "1" && window.parent !== window;
  const characterId = String(query.get("characterId") || "").trim();
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
    crafting: { label: "Crafting Catalogue", render: renderCraftingPage },
  };
  const sheetLocation = loadSheetLocation();

  const ui = {
    route: routeFromHash(),
    spellLevel: "Cantrips",
    itemLimit: 48,
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
      craftingQuery: "",
    },
    filterTimer: null,
    saveTimer: null,
    locationTimer: null,
  };

  let state = loadState();
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
      if (path === "inventory") {
        return engine.mergeInventorySlots(defaultValue, suppliedValue);
      }
      if (path === "personality") {
        return engine.mergePersonalitySlots(defaultValue, suppliedValue);
      }
      const supplied = Array.isArray(suppliedValue) ? suppliedValue : [];
      return defaultValue.map((item, index) =>
        mergeWithDefaults(item, supplied[index], `${path}.${index}`),
      );
    }
    if (defaultValue && typeof defaultValue === "object") {
      const supplied = suppliedValue && typeof suppliedValue === "object" ? suppliedValue : {};
      const merged = {};
      Object.keys(defaultValue).forEach((key) => {
        const childPath = path ? `${path}.${key}` : key;
        merged[key] = mergeWithDefaults(defaultValue[key], supplied[key], childPath);
      });
      return merged;
    }
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
        applyCataloguePayload(event.data.catalogues);
        state = mergeWithDefaults(clone(data.defaultState), event.data.state || {});
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

  function applyCataloguePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (Array.isArray(payload.traits)) data.traits = clone(payload.traits);
    if (Array.isArray(payload.conditions)) data.conditions = clone(payload.conditions);
    if (Array.isArray(payload.items)) data.items = clone(payload.items);
    if (payload.food && typeof payload.food === "object") {
      data.food = { ...data.food, ...clone(payload.food) };
    }
    if (payload.crafting && typeof payload.crafting === "object") {
      data.crafting = { ...data.crafting, ...clone(payload.crafting) };
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

      const hearthMealCheckbox = event.target.closest("[data-hearth-eat]");
      if (hearthMealCheckbox) {
        const result = engine.applyHearthMealEdit(
          state,
          Number(hearthMealCheckbox.dataset.hearthEat),
          hearthMealCheckbox.checked,
        );
        recalculate();
        scheduleSave();
        renderRoute({ preserveScroll: true });

        if (!result.accepted) {
          const message = {
            "missing-dish": "Choose a dish before marking this meal eaten.",
            "missing-day": "Enter a valid travel day in the Hunger Tracker before logging a meal.",
            "missing-row": "That meal row is no longer available. Refresh and try again.",
          }[result.reason];
          showToast(message || "The meal could not be logged.", "error");
        }
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
      renderFoodResults();
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
    const grid = root.querySelector(".catalog-grid");
    const count = root.querySelector(".filter-count");
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
    if (score < 55) return "low";
    if (score <= 70) return "mid";
    return "high";
  }

  function abilityIcon(name) {
    const icons = {
      strength: `<path d="M5.3 17.6c2.2-1.8 3.3-4.1 3.4-7l2.5 1.6 2.1-4.7 2.6 1.1-1.2 3.8 2.8.5c1.7.3 2.7 1.7 2.2 3.3-.7 2.5-3.3 4.1-7.2 4.1H8.2c-1.4 0-2.6-1.1-2.9-2.7Z" /><path d="m8.7 10.6-2.5-1.3-1.6 2.8" />`,
      speed: `<path d="m14.1 3.4-8 10.4h5.5l-1.5 6.8 8-10.4h-5.5Z" /><path d="M4 7.3h4.1M3 11h3.2M4.5 16.7h3.1" />`,
      vitality: `<path d="M12 20.5 4.7 13.3A5 5 0 0 1 12 6.5a5 5 0 0 1 7.3 6.8Z" /><path d="M6.8 13h3l1.4-3 2 6 1.3-3h2.7" />`,
      intelligence: `<path d="M9.4 4.1A3.2 3.2 0 0 0 6.3 7.3 3.5 3.5 0 0 0 5 13.8 3.3 3.3 0 0 0 8.2 18a3.2 3.2 0 0 0 3.8 2.1V6.8a2.7 2.7 0 0 0-2.6-2.7Z" /><path d="M14.6 4.1a3.2 3.2 0 0 1 3.1 3.2 3.5 3.5 0 0 1 1.3 6.5 3.3 3.3 0 0 1-3.2 4.2 3.2 3.2 0 0 1-3.8 2.1V6.8a2.7 2.7 0 0 1 2.6-2.7Z" /><path d="M7.1 9.2c1.1-.2 2 .1 2.7 1M16.9 9.2c-1.1-.2-2 .1-2.7 1M7.5 15.2c1-.5 1.8-.5 2.7.1M16.5 15.2c-1-.5-1.8-.5-2.7.1" />`,
      awareness: `<path d="M2.8 12s3.4-5.2 9.2-5.2 9.2 5.2 9.2 5.2-3.4 5.2-9.2 5.2S2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8V12l2.1 1.4" />`,
      talent: `<circle cx="12" cy="8" r="2.2" /><path d="M7.4 19.5v-3.1c0-2.1 1.8-3.8 4-3.8h1.2c2.2 0 4 1.7 4 3.8v3.1M9.1 14.1 6.3 17M14.9 14.1l2.8 2.9" /><path d="m5.3 5.2.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5Zm12.8.8.6 1.2 1.3.6-1.3.6-.6 1.2-.6-1.2-1.3-.6 1.3-.6Z" />`,
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

  function renderCharacterPage() {
    const character = state.character;
    const personality = derived.personality;

    const abilityCards = data.abilityDefinitions
      .map((ability) => {
        const score = derived.abilityScores[ability.id];
        const modifier = derived.abilityModifiers[ability.id];
        const cost = derived.abilityCosts[ability.id];
        return `<article class="ability-card"><div class="ability-top"><div class="ability-identity">${abilityIcon(ability.id)}<div class="ability-name"><span class="ability-abbr">${escapeHtml(ability.abbr)}</span><h3>${escapeHtml(ability.label)}</h3></div></div><strong class="ability-score" data-output="abilityScores.${ability.id}" data-score-band="${abilityScoreBand(score)}">${formatOutput(score, "integer")}</strong></div><div class="ability-meta"><div class="field"><label for="ability-${ability.id}">Bonus</label><input id="ability-${ability.id}" class="number-input" type="number" step="1" data-value-type="number" data-bind="abilityBonuses.${ability.id}" value="${escapeHtml(state.abilityBonuses[ability.id])}" /></div><div class="ability-modifier"><small>Mod</small><strong data-output="abilityModifiers.${ability.id}" data-format="signed">${formatOutput(modifier, "signed")}</strong></div></div><small class="field-hint">Base ${ability.base} · Cost ${Number.isNaN(cost) ? "#N/A" : cost}</small></article>`;
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
      <section class="hero-record" aria-labelledby="identity-heading"><div class="hero-grid"><div class="identity-title"><p class="overline">Active Character</p><h2 id="identity-heading">${escapeHtml(character.name || "Unnamed Character")}</h2><p>${escapeHtml(character.race || "Unknown race")} · Level ${escapeHtml(character.level)} ${escapeHtml(character.className)}</p></div><div class="identity-fields">
        ${field("Name", "character.name", character.name)}
        ${field("Race", "character.race", character.race)}
        ${field("Class", "character.className", character.className, { type: "select", options: data.classes.map((profile) => profile.name) })}
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
          <div class="key-value-row"><dt>Level</dt><dd>${field("", "character.level", character.level, { type: "number", min: 0, step: 1, ariaLabel: "Level" })}</dd></div>
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
        <section class="panel"><div class="panel-heading plum"><h2>Current Pools & Bonuses</h2><span class="heading-note">Editable inputs</span></div><div class="panel-body"><div class="form-grid four">
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
        ${metricCard("Proficiency", "proficiency", "is-mana", "signed", `Level ${state.character.level}`)}
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
        <section class="panel"><div class="panel-heading plum"><h2>Currency</h2><span class="heading-note">1 PP = 1000 SP · 1 GP = 100 SP · 1 CP = 0.1 SP</span></div><div class="panel-body"><div class="currency-grid">
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

  function renderSurvivalPage() {
    const conditionNames = data.conditions.map((condition) => condition.name);
    const activeEffectRows = state.activeEffects
      .map((effect, index) => `<tr>
        <td data-label="Status"><label class="visually-hidden" for="effect-status-${index}">Status ${index + 1}</label><select class="table-input" id="effect-status-${index}" data-bind="activeEffects.${index}.status">${renderOptions(data.statusOptions, effect.status, "None")}</select></td>
        <td data-label="Duration"><label class="visually-hidden" for="effect-duration-${index}">Duration ${index + 1}</label><select class="table-input" id="effect-duration-${index}" data-bind="activeEffects.${index}.duration">${renderOptions(data.durations, effect.duration, "None")}</select></td>
        <td data-label="Ailment"><label class="visually-hidden" for="effect-ailment-${index}">Ailment ${index + 1}</label><select class="table-input" id="effect-ailment-${index}" data-bind="activeEffects.${index}.ailment">${renderOptions(conditionNames, effect.ailment, "None")}</select></td>
        <td data-label="Mark"><label class="visually-hidden" for="effect-mark-${index}">Mark ${index + 1}</label><input class="table-input" id="effect-mark-${index}" type="text" data-bind="activeEffects.${index}.mark" value="${escapeHtml(effect.mark)}" /></td>
      </tr>`)
      .join("");

    const hungerRows = state.hunger.days
      .map((day, index) => `<tr>
        <td data-label="Day"><input class="table-input" type="number" min="0" step="1" data-value-type="number" data-bind="hunger.days.${index}.day" value="${escapeHtml(day.day)}" aria-label="Hunger day ${index + 1}" /></td>
        <td data-label="Food Gained"><input class="table-input" type="number" step="1" data-value-type="number" data-bind="hunger.days.${index}.foodGained" value="${escapeHtml(day.foodGained)}" aria-label="Food gained on hunger row ${index + 1}" /></td>
        <td data-label="Rations Eaten"><input class="table-input" type="number" min="0" step="1" data-value-type="number" data-bind="hunger.days.${index}.rationsEaten" value="${escapeHtml(day.rationsEaten)}" aria-label="Rations eaten on hunger row ${index + 1}" /></td>
        <td class="cell-number" data-label="Food Left"><output data-output="hunger.rows.${index}.foodLeft">${escapeHtml(formatOutput(derived.hunger.rows[index]?.foodLeft))}</output></td>
        <td class="cell-number" data-label="Hunger"><output data-output="hunger.rows.${index}.hunger">${escapeHtml(formatOutput(derived.hunger.rows[index]?.hunger))}</output></td>
        <td data-label="Condition"><output data-output="hunger.rows.${index}.condition">${escapeHtml(formatOutput(derived.hunger.rows[index]?.condition))}</output></td>
      </tr>`)
      .join("");

    const pantryRows = derived.hearth.pantry
      .map((dish, index) => `<tr>
        <td data-label="Dish">${escapeHtml(dish.name)}</td>
        <td data-label="Region">${escapeHtml(dish.region)}</td>
        <td class="cell-number" data-label="Acquired"><input class="table-input" type="number" min="0" step="1" data-value-type="number" data-bind="hearth.acquired.${escapeHtml(dish.name)}" value="${escapeHtml(state.hearth.acquired[dish.name])}" aria-label="Servings acquired for ${escapeHtml(dish.name)}" /></td>
        <td class="cell-number" data-label="Eaten"><output data-output="hearth.pantry.${index}.eaten" data-format="integer">${escapeHtml(formatOutput(dish.eaten, "integer"))}</output></td>
        <td class="cell-number" data-label="Left"><output data-output="hearth.pantry.${index}.left" data-format="integer">${escapeHtml(formatOutput(dish.left, "integer"))}</output></td>
      </tr>`)
      .join("");

    const hearthRows = state.hearth.log
      .map((entry, index) => `<tr>
        <td data-label="Rest"><input class="table-input" type="number" min="0" step="1" data-value-type="number" data-bind="hearth.log.${index}.rest" value="${escapeHtml(entry.rest)}" aria-label="Rest cycle for meal row ${index + 1}" /></td>
        <td data-label="Day"><input class="table-input" type="number" min="0" step="1" data-value-type="number" data-bind="hearth.log.${index}.day" value="${escapeHtml(entry.day)}" aria-label="Day for meal row ${index + 1}" /></td>
        <td data-label="Dish"><select class="table-input" data-bind="hearth.log.${index}.dish" aria-label="Dish for meal row ${index + 1}">${renderOptions(data.food.dishes.map((dish) => dish.name), entry.dish, "None")}</select></td>
        <td data-label="Eaten"><input type="checkbox" data-hearth-eat="${index}" ${entry.eaten ? "checked" : ""} aria-label="Meal eaten for row ${index + 1}" /></td>
        <td data-label="Boon Used"><input type="checkbox" data-bind="hearth.log.${index}.boonUsed" ${entry.boonUsed ? "checked" : ""} aria-label="Hearth boon used for row ${index + 1}" /></td>
        <td class="cell-description" data-label="Resolved Effect"><output data-output="hearth.rows.${index}.effect">${escapeHtml(formatOutput(derived.hearth.rows[index]?.effect))}</output></td>
      </tr>`)
      .join("");

    return `<section class="page" data-page="survival">${pageHeading(
      "Character status",
      "Effects & Survival",
      "Active conditions, hunger progression, regional meals, serving limits, and Hearth Boon state.",
    )}
      <section class="summary-band" aria-label="Survival summary">
        <article class="summary-band-card"><span>Food remaining</span><strong>${output("hunger.currentFood", "integer")}</strong></article>
        <article class="summary-band-card"><span>Hunger effect</span><strong>${output("hunger.effect")}</strong></article>
        <article class="summary-band-card"><span>Hearth Boon</span><strong class="condition-chip" data-hearth-status>${escapeHtml(derived.hearth.status)}</strong></article>
      </section>
      <div class="layout-grid two">
        <section class="panel"><div class="panel-heading rust"><h2>Active Effects</h2><span class="heading-note">Up to seven tracked effects</span></div><div class="panel-body"><div class="data-table-wrap responsive-card-table"><table class="data-table"><thead><tr><th>Status</th><th>Duration</th><th>Ailment</th><th>Mark</th></tr></thead><tbody>${activeEffectRows}</tbody></table></div></div></section>
        <section class="panel"><div class="panel-heading blue"><h2>Special Effects</h2><span class="heading-note">Free-form notes</span></div><div class="panel-body"><div class="effect-grid">
          ${field("Immunities", "specialEffects.immunities", state.specialEffects.immunities, { type: "textarea" })}
          ${field("Vulnerabilities", "specialEffects.vulnerabilities", state.specialEffects.vulnerabilities, { type: "textarea" })}
          ${field("Resistances", "specialEffects.resistances", state.specialEffects.resistances, { type: "textarea" })}
        </div></div></section>
      </div>
      <section class="panel section-gap"><div class="panel-heading amber"><h2>Hunger Tracker</h2><span class="heading-note">Thirty-day journey log</span></div><div class="panel-body"><div class="inline-fields">${field("Starting Rations", "hunger.startingRations", state.hunger.startingRations, { type: "number", min: 0, step: 1 })}</div><div class="data-table-wrap responsive-card-table section-gap"><table class="data-table"><thead><tr><th>Day</th><th>Food Gained</th><th>Rations Eaten</th><th>Food Left</th><th>Hunger</th><th>Condition</th></tr></thead><tbody>${hungerRows}</tbody></table></div></div></section>
      <section class="panel section-gap"><div class="panel-heading plum"><h2>Hearthcraft Tracker</h2><span class="heading-note">One boon per rest cycle</span></div><div class="panel-body"><div class="form-grid three">
        ${field("Current Rest Cycle", "hearth.restCycle", state.hearth.restCycle, { type: "number", min: 0, step: 1 })}
        <div class="field"><span class="field-label">Active Meal</span><output class="derived-output" data-output="hearth.activeMeal">${escapeHtml(derived.hearth.activeMeal)}</output></div>
        <div class="field"><span class="field-label">Active Effect</span><output class="derived-output" data-output="hearth.activeEffect">${escapeHtml(derived.hearth.activeEffect)}</output></div>
      </div><h3 class="subsection-title">Pantry</h3><div class="data-table-wrap responsive-card-table"><table class="data-table"><thead><tr><th>Dish</th><th>Region</th><th>Acquired</th><th>Eaten</th><th>Left</th></tr></thead><tbody>${pantryRows}</tbody></table></div><h3 class="subsection-title">Meal log</h3><div class="data-table-wrap responsive-card-table"><table class="data-table"><thead><tr><th>Rest</th><th>Day</th><th>Dish</th><th>Eaten</th><th>Boon Used</th><th>Resolved Effect</th></tr></thead><tbody>${hearthRows}</tbody></table></div></div></section>
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
        <span class="filter-count">${traits.length} of ${data.traits.length} traits</span>
      </div>
      <div class="catalog-grid">${cards || `<div class="empty-state"><strong>No matching traits</strong><span>Change the search or group filter.</span></div>`}</div>
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
      const haystack = `${dish.name} ${dish.region} ${dish.method} ${dish.effect}`.toLowerCase();
      return (!query || haystack.includes(query)) && (selectedRegion === "All" || dish.region === selectedRegion);
    });
  }

  function renderFoodCard(dish) {
    const pantry = derived.hearth.pantry.find((entry) => entry.name === dish.name);
    return `<article class="catalog-card food-card"><div class="card-meta"><span class="pill pill-blue">${escapeHtml(dish.region)}</span><span class="pill pill-amber">${escapeHtml(dish.cost)} SP</span><span class="pill">${escapeHtml(pantry?.left || 0)} left</span></div><h2>${escapeHtml(dish.name)}</h2><p>${escapeHtml(dish.method)}</p><div class="food-effect"><strong>Hearth Boon</strong><p>${escapeHtml(dish.effect)}</p></div><div class="card-actions"><button class="button button-primary button-small" type="button" data-action="add-food" data-name="${escapeHtml(dish.name)}">Add serving</button></div></article>`;
  }

  // Surgical update for the Hearthcraft filters: patches only the
  // catalogue grid and match count instead of re-rendering the whole page.
  function renderFoodResults() {
    const dishes = computeFilteredDishes();
    const grid = root.querySelector(".catalog-grid");
    const count = root.querySelector(".filter-count");
    if (grid) {
      grid.innerHTML = dishes.map(renderFoodCard).join("") ||
        `<div class="empty-state"><strong>No matching dishes</strong><span>Change the search or region filter.</span></div>`;
    }
    if (count) count.textContent = `${dishes.length} of ${data.food.dishes.length} dishes`;
  }

  function renderFoodPage() {
    const dishes = computeFilteredDishes();
    const selectedRegion = ui.filters.foodRegion;
    const cards = dishes.map(renderFoodCard).join("");
    return `<section class="page" data-page="food">${pageHeading(
      "Regional cooking",
      "Hearthcraft",
      "Regional dishes, cooking checks, serving costs, and Hearth Boon effects.",
      `<button class="button button-primary" type="button" data-route="survival">Open survival tracker</button>`,
    )}
      <section class="panel"><div class="panel-heading amber"><h2>Hearthcraft Rules</h2><span class="heading-note">Cooking and rest rules</span></div><div class="panel-body"><div class="rule-grid">${data.food.rules.map((rule) => `<article class="rule-card"><strong>${escapeHtml(rule.rule)}</strong><span>${escapeHtml(rule.value)}</span></article>`).join("")}</div></div></section>
      <div class="filters section-gap" role="search">
        <label class="visually-hidden" for="food-search">Search dishes</label><input class="filter-control" id="food-search" type="search" data-filter="foodQuery" value="${escapeHtml(ui.filters.foodQuery)}" placeholder="Search dish names, methods, or effects" />
        <label class="visually-hidden" for="food-region">Filter region</label><select class="filter-control" id="food-region" data-filter="foodRegion">${renderOptions(["All", ...unique(data.food.dishes.map((dish) => dish.region))], selectedRegion)}</select>
        <span class="filter-count">${dishes.length} of ${data.food.dishes.length} dishes</span>
      </div>
      <div class="catalog-grid">${cards || `<div class="empty-state"><strong>No matching dishes</strong><span>Change the search or region filter.</span></div>`}</div>
    </section>`;
  }

  function computeFilteredCraftingSections() {
    const query = ui.filters.craftingQuery.trim().toLowerCase();
    return data.crafting.sections
      .map((section) => {
        const rows = section.rows.filter((row) => !query || `${section.name} ${section.headers.join(" ")} ${row.join(" ")}`.toLowerCase().includes(query));
        return { ...section, rows };
      })
      .filter((section) => section.rows.length || (!query && section.headers.length));
  }

  function renderCraftingSectionsMarkup(sections) {
    return sections
      .map((section) => `<section class="craft-section"><h2>${escapeHtml(section.name)}</h2><div class="craft-rows">
        <div class="craft-row craft-headers" style="--craft-columns: ${section.headers.length}">${section.headers.map((header) => `<span>${escapeHtml(header)}</span>`).join("")}</div>
        ${section.rows.map((row) => `<div class="craft-row" style="--craft-columns: ${section.headers.length}">${section.headers.map((header, index) => `<span data-label="${escapeHtml(header)}">${escapeHtml(row[index] ?? "")}</span>`).join("")}</div>`).join("")}
      </div></section>`)
      .join("");
  }

  // Surgical update for the Crafting Catalogue filter: patches only the
  // results container and match count instead of re-rendering the whole page.
  function renderCraftingResults() {
    const sections = computeFilteredCraftingSections();
    const container = root.querySelector(".skill-groups");
    const count = root.querySelector(".filter-count");
    const matchedRows = sections.reduce((sum, section) => sum + section.rows.length, 0);
    if (container) {
      container.innerHTML = renderCraftingSectionsMarkup(sections) ||
        `<div class="empty-state"><strong>No matching crafting records</strong><span>Change the search terms.</span></div>`;
    }
    if (count) count.textContent = `${matchedRows} matching rows in ${sections.length} sections`;
  }

  function renderCraftingPage() {
    const sections = computeFilteredCraftingSections();
    const sectionMarkup = renderCraftingSectionsMarkup(sections);
    const matchedRows = sections.reduce((sum, section) => sum + section.rows.length, 0);
    return `<section class="page" data-page="crafting">${pageHeading(
      "Crafting reference",
      "Crafting Catalogue",
      "Browse structured recipes and the illustrated crafting reference.",
    )}
      <figure class="craft-reference"><img src="assets/craftable-equipment-catalogue.webp" alt="Craftable equipment, consumables, alchemy, recipe, and legendary crafting reference" /><button class="button button-primary" type="button" data-action="open-craft-image">View full size</button></figure>
      <div class="filters" role="search"><label class="visually-hidden" for="crafting-search">Search crafting catalogue</label><input class="filter-control" id="crafting-search" type="search" data-filter="craftingQuery" value="${escapeHtml(ui.filters.craftingQuery)}" placeholder="Search materials, recipes, sources, or uses" /><span class="filter-count">${matchedRows} matching rows in ${sections.length} sections</span></div>
      <div class="skill-groups">${sectionMarkup || `<div class="empty-state"><strong>No matching crafting records</strong><span>Change the search terms.</span></div>`}</div>
    </section>`;
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
      const empty = state.activeEffects.find((entry) => !String(entry.ailment || "").trim());
      if (empty) {
        empty.ailment = button.dataset.name;
        changed = true;
        message = `${button.dataset.name} added to active effects.`;
      } else {
        message = "All seven active effect slots are occupied.";
      }
    }
    if (action === "add-food") {
      const name = button.dataset.name;
      state.hearth.acquired[name] = engine.numberValue(state.hearth.acquired[name]) + 1;
      changed = true;
      message = `One serving of ${name} added.`;
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
      state = mergeWithDefaults(clone(data.defaultState), supplied);
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
    if (window.confirm("Reset every editable field to the original character values?")) resetState();
  }

  function resetState() {
    state = clone(data.defaultState);
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
    showToast("Original character values restored.", "success");
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
