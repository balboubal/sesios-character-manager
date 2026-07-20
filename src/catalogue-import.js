export const ITEM_IMPORT_FIELDS = Object.freeze([
  { key: "name", label: "Item", kind: "string", required: true, aliases: ["name", "item", "item name"] },
  { key: "rarity", label: "Rarity", kind: "string", aliases: ["rarity"] },
  { key: "type", label: "Type", kind: "string", aliases: ["type", "item type"] },
  { key: "physicalDamage", label: "Phys Dmg", kind: "damage", aliases: ["phys dmg", "physical dmg", "physical damage", "phys damage"] },
  { key: "magicalDamage", label: "Mag Dmg", kind: "damage", aliases: ["mag dmg", "magic dmg", "magical dmg", "magical damage", "magic damage"] },
  { key: "criticalChance", label: "CR%", kind: "percent", aliases: ["cr", "cr%", "crit", "crit%", "crit chance", "critical chance", "critical strike chance"] },
  { key: "strength", label: "STR", kind: "stat", aliases: ["str", "strength"] },
  { key: "speed", label: "SPD", kind: "stat", aliases: ["spd", "speed"] },
  { key: "vitality", label: "VIT", kind: "stat", aliases: ["vit", "vitality"] },
  { key: "intelligence", label: "INT", kind: "stat", aliases: ["int", "intelligence"] },
  { key: "awareness", label: "AWR", kind: "stat", aliases: ["awr", "awareness"] },
  { key: "talent", label: "TAL", kind: "stat", aliases: ["tal", "talent"] },
  { key: "luck", label: "LUCK", kind: "stat", aliases: ["luck", "lck"] },
  { key: "armor", label: "AC", kind: "stat", aliases: ["ac", "armor", "armour"] },
  { key: "resistance", label: "RES", kind: "stat", aliases: ["res", "resistance", "resist"] },
  { key: "evasion", label: "Evasion", kind: "stat", aliases: ["evasion", "eva"] },
  { key: "durability", label: "Durability", kind: "number", minimum: 0, aliases: ["durability", "dur"] },
  { key: "damageReflection", label: "Dmg Ref", kind: "number", aliases: ["dmg ref", "damage ref", "damage reflection", "reflection"] },
  { key: "healthRegeneration", label: "HP Regen", kind: "number", aliases: ["hp regen", "health regen", "health regeneration", "regen"] },
  { key: "focus", label: "Focus", kind: "number", aliases: ["focus", "foc"] },
  { key: "weight", label: "Weight", kind: "number", minimum: 0, aliases: ["weight", "wt"] },
  { key: "value", label: "Value", kind: "number", minimum: 0, aliases: ["value", "cost", "price"] },
  { key: "goldMultiplier", label: "GoldMulti", kind: "percent", aliases: ["goldmulti", "gold multi", "gold multiplier"] },
  { key: "xpMultiplier", label: "XpMulti", kind: "percent", aliases: ["xpmulti", "xp multi", "xp multiplier", "experience multiplier"] },
  { key: "tags", label: "Tags", kind: "text", aliases: ["tags", "tag", "traits", "notes"] },
]);

export const ITEM_IMPORT_HEADER = ITEM_IMPORT_FIELDS.map((field) => field.label).join("\t");

const FIELD_BY_KEY = new Map(ITEM_IMPORT_FIELDS.map((field) => [field.key, field]));
const HEADER_ALIASES = new Map();
ITEM_IMPORT_FIELDS.forEach((field) => {
  [field.label, field.key, ...(field.aliases || [])].forEach((alias) => {
    HEADER_ALIASES.set(normalizeHeader(alias), field.key);
  });
});

const DEFAULT_ITEM = Object.freeze({
  name: "",
  rarity: "",
  type: "",
  physicalDamage: "–",
  magicalDamage: "–",
  criticalChance: 0,
  strength: "–",
  speed: "–",
  vitality: "–",
  intelligence: "–",
  awareness: "–",
  talent: "–",
  luck: "–",
  armor: "–",
  resistance: "–",
  evasion: "–",
  durability: 0,
  damageReflection: 0,
  healthRegeneration: 0,
  focus: 0,
  weight: 0,
  value: 0,
  goldMultiplier: 0,
  xpMultiplier: 0,
  tags: "",
});

export function defaultImportedItem() {
  return { ...DEFAULT_ITEM };
}

export function normalizeItemName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export function parseSpreadsheetItems(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  if (!source.trim()) {
    return emptyParseResult("Paste a header row and at least one item row.");
  }

  const delimiter = source.includes("\t") ? "\t" : ",";
  const matrix = parseDelimitedText(source, delimiter);
  while (matrix.length && matrix[matrix.length - 1].every((cell) => !String(cell).trim())) matrix.pop();
  if (matrix.length < 2) {
    return emptyParseResult("Include the spreadsheet header row and at least one item row.");
  }

  const headers = matrix[0].map((value) => String(value || "").trim());
  const mappedColumns = [];
  const mappedFields = new Set();
  const unknownHeaders = [];
  const duplicateHeaders = [];

  headers.forEach((header, columnIndex) => {
    if (!header) return;
    const key = HEADER_ALIASES.get(normalizeHeader(header));
    if (!key) {
      unknownHeaders.push(header);
      return;
    }
    if (mappedFields.has(key)) {
      duplicateHeaders.push(header);
      return;
    }
    mappedFields.add(key);
    mappedColumns.push({ columnIndex, key, header });
  });

  const globalErrors = [];
  const globalWarnings = [];
  if (!mappedFields.has("name")) {
    globalErrors.push('No item-name column was found. Use a header such as "Item" or "Name".');
  }
  if (unknownHeaders.length) {
    globalWarnings.push(`${unknownHeaders.length} unrecognized column${unknownHeaders.length === 1 ? " was" : "s were"} ignored.`);
  }
  if (duplicateHeaders.length) {
    globalWarnings.push(`${duplicateHeaders.length} duplicate mapped column${duplicateHeaders.length === 1 ? " was" : "s were"} ignored.`);
  }

  const rows = [];
  matrix.slice(1).forEach((cells, rowIndex) => {
    const sourceRow = rowIndex + 2;
    if (cells.every((cell) => !String(cell || "").trim())) return;
    const values = {};
    const errors = [];
    const warnings = [];

    mappedColumns.forEach(({ columnIndex, key, header }) => {
      const field = FIELD_BY_KEY.get(key);
      const converted = convertItemValue(cells[columnIndex], field);
      if (converted.error) errors.push(`${header}: ${converted.error}`);
      else values[key] = converted.value;
      if (converted.warning) warnings.push(`${header}: ${converted.warning}`);
    });

    const name = String(values.name || "").trim();
    if (!name) errors.push("Item name is required.");
    if (!String(values.type || "").trim()) warnings.push("Type is blank.");

    rows.push({
      sourceRow,
      values,
      errors: unique(errors),
      warnings: unique(warnings),
      rawCells: cells,
    });
  });

  if (!rows.length) globalErrors.push("No non-empty item rows were found.");

  return {
    delimiter,
    headers,
    mappedColumns,
    mappedFields: [...mappedFields],
    unknownHeaders: unique(unknownHeaders),
    duplicateHeaders: unique(duplicateHeaders),
    globalErrors,
    globalWarnings,
    rows,
  };
}

export function buildItemImportPlan(parseResult, existingRows, mode = "upsert") {
  const normalizedMode = ["upsert", "add-only", "create-all"].includes(mode) ? mode : "upsert";
  const existingItems = [...(existingRows || [])]
    .filter((row) => row?.data && typeof row.data === "object")
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  const existingByName = new Map();
  existingItems.forEach((row) => {
    const key = normalizeItemName(row.data.name);
    if (key && !existingByName.has(key)) existingByName.set(key, row);
  });

  const lastPasteIndexByName = new Map();
  if (normalizedMode !== "create-all") {
    parseResult.rows.forEach((row, index) => {
      const key = normalizeItemName(row.values.name);
      if (key) lastPasteIndexByName.set(key, index);
    });
  }

  const entries = parseResult.rows.map((row, index) => {
    const normalizedName = normalizeItemName(row.values.name);
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    if (parseResult.globalErrors.length) errors.push(...parseResult.globalErrors);
    if (errors.length) {
      return { ...row, action: "error", errors: unique(errors), warnings: unique(warnings), data: null, existing: null };
    }

    if (normalizedMode !== "create-all" && lastPasteIndexByName.get(normalizedName) !== index) {
      warnings.push("A later pasted row has the same item name; this earlier row will be skipped.");
      return { ...row, action: "skip", reason: "duplicate-paste", errors: [], warnings: unique(warnings), data: null, existing: null };
    }

    const existing = existingByName.get(normalizedName) || null;
    if (normalizedMode === "add-only" && existing) {
      warnings.push("An existing item has the same name; this row will be skipped.");
      return { ...row, action: "skip", reason: "existing", errors: [], warnings: unique(warnings), data: null, existing };
    }

    const base = existing && normalizedMode === "upsert"
      ? { ...DEFAULT_ITEM, ...existing.data }
      : { ...DEFAULT_ITEM };
    const data = { ...base, ...row.values, name: String(row.values.name).trim() };
    const action = existing && normalizedMode === "upsert" ? "update" : "insert";
    return { ...row, action, errors: [], warnings: unique(warnings), data, existing };
  });

  return {
    mode: normalizedMode,
    entries,
    counts: entries.reduce(
      (counts, entry) => {
        counts.total += 1;
        counts[entry.action] += 1;
        if (entry.warnings.length) counts.warningRows += 1;
        return counts;
      },
      { total: 0, insert: 0, update: 0, skip: 0, error: 0, warningRows: 0 },
    ),
  };
}

export function createBulkImportPayload(plan) {
  return plan.entries
    .filter((entry) => entry.action === "insert" || entry.action === "update")
    .map((entry) => ({
      action: entry.action,
      id: entry.existing?.id || null,
      data: entry.data,
      source_row: entry.sourceRow,
    }));
}

function emptyParseResult(message) {
  return {
    delimiter: "\t",
    headers: [],
    mappedColumns: [],
    mappedFields: [],
    unknownHeaders: [],
    duplicateHeaders: [],
    globalErrors: [message],
    globalWarnings: [],
    rows: [],
  };
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bpercent\b/g, " percent")
    .replace(/\s+/g, " ");
}

function convertItemValue(rawValue, field) {
  const raw = String(rawValue ?? "").trim();
  if (!field) return { value: raw };
  if (field.kind === "string") {
    if (isDash(raw)) return { value: "" };
    return { value: raw };
  }
  if (field.kind === "text") {
    if (isDash(raw)) return { value: "" };
    return { value: raw };
  }
  if (field.kind === "damage") {
    return { value: !raw || isDash(raw) ? "–" : raw };
  }
  if (field.kind === "stat") {
    if (!raw || isDash(raw)) return { value: "–" };
    const number = parseNumericText(raw);
    if (number == null) return { error: `"${raw}" is not a number or dash.` };
    return { value: number };
  }
  if (field.kind === "percent") {
    if (!raw || isDash(raw)) return { value: 0 };
    const percent = parsePercentageText(raw);
    if (percent == null) return { error: `"${raw}" is not a valid percentage or decimal.` };
    return {
      value: percent,
      warning: !raw.includes("%") && Math.abs(percent) > 1
        ? `Stored as ${percent}. Add % if you intended ${percent}%.`
        : "",
    };
  }
  if (field.kind === "number") {
    if (!raw || isDash(raw)) return { value: 0 };
    const number = parseNumericText(raw);
    if (number == null) return { error: `"${raw}" is not a valid number.` };
    if (field.minimum != null && number < field.minimum) {
      return { error: `must be ${field.minimum} or greater.` };
    }
    return { value: number };
  }
  return { value: raw };
}

function parseNumericText(value) {
  const normalized = String(value)
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (!normalized || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsePercentageText(value) {
  const text = String(value).trim();
  const hasPercent = text.includes("%");
  const number = parseNumericText(text.replace(/%/g, ""));
  if (number == null) return null;
  return hasPercent ? number / 100 : number;
}

function isDash(value) {
  return /^[-–—]$/.test(String(value || "").trim());
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell === "") {
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
