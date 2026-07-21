import workbookDefaults from "./workbook-defaults.json";

export const catalogueDefinitions = Object.freeze([
  { key: "items", label: "Items", singular: "item" },
  { key: "traits", label: "Personality Traits", singular: "trait" },
  { key: "conditions", label: "Conditions", singular: "condition" },
  { key: "food_dishes", label: "Hearthcraft Dishes", singular: "dish" },
  { key: "food_ingredients", label: "Hearthcraft Ingredients", singular: "ingredient" },
  { key: "food_rules", label: "Hearthcraft Rules", singular: "rule" },
  { key: "crafting_sections", label: "Crafting Sections", singular: "section" },
]);

export function cloneDefaultCharacterState(name = "New Character") {
  const state = structuredClone(workbookDefaults.defaultState);
  state.character.name = name;
  return state;
}

export function catalogueLabel(category) {
  return catalogueDefinitions.find((entry) => entry.key === category)?.label || category;
}

export function catalogueSingular(category) {
  return catalogueDefinitions.find((entry) => entry.key === category)?.singular || "entry";
}

export function buildWorkbookCataloguePayload(rows) {
  const grouped = Object.fromEntries(catalogueDefinitions.map(({ key }) => [key, []]));
  rows.forEach((row) => {
    if (grouped[row.category]) grouped[row.category].push(row);
  });
  Object.values(grouped).forEach((entries) => {
    entries.sort((left, right) => left.sort_order - right.sort_order);
  });

  return {
    traits: grouped.traits.map((row) => row.data),
    conditions: grouped.conditions.map((row) => row.data),
    items: grouped.items.map((row) => row.data),
    food: {
      dishes: grouped.food_dishes.map((row) => row.data),
      ingredients: grouped.food_ingredients.map((row) => row.data),
      rules: grouped.food_rules.map((row) => row.data),
    },
    crafting: {
      sections: grouped.crafting_sections.map((row) => row.data),
    },
  };
}

export function blankCatalogueEntry(category, reference) {
  if (category === "crafting_sections") {
    return { name: "", headers: [], rows: [] };
  }
  if (category === "food_rules") {
    return { rule: "", detail: "" };
  }
  if (category === "food_dishes") {
    return {
      name: "",
      region: "Asura",
      cost: 0,
      time: "1 hour",
      method: "",
      effect: "",
      ingredients: [],
      specialtyUtensil: "",
      preparationClass: "standard",
      rareDangerous: false,
      legendary: false,
      difficulty: "Automatic by Region",
      dc: 0,
    };
  }
  if (category === "food_ingredients") {
    return {
      name: "",
      category: "Herb & Plant",
      region: "",
      mainUse: "",
      secondaryUse: "",
      notes: "",
      source: "",
      marketStatus: "",
      role: "",
    };
  }
  if (!reference || typeof reference !== "object") return { name: "" };

  return Object.fromEntries(
    Object.entries(reference).map(([key, value]) => {
      if (Array.isArray(value)) return [key, []];
      if (value && typeof value === "object") return [key, {}];
      if (typeof value === "number") return [key, 0];
      if (typeof value === "boolean") return [key, false];
      return [key, ""];
    }),
  );
}
