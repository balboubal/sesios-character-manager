export const CHARACTER_XP_LEVELS = Object.freeze([
  Object.freeze({ level: 0, totalXp: 0, xpToNext: 25 }),
  Object.freeze({ level: 1, totalXp: 25, xpToNext: 45 }),
  Object.freeze({ level: 2, totalXp: 70, xpToNext: 60 }),
  Object.freeze({ level: 3, totalXp: 130, xpToNext: 90 }),
  Object.freeze({ level: 4, totalXp: 220, xpToNext: 130 }),
  Object.freeze({ level: 5, totalXp: 350, xpToNext: 160 }),
  Object.freeze({ level: 6, totalXp: 510, xpToNext: 210 }),
  Object.freeze({ level: 7, totalXp: 720, xpToNext: 380 }),
  Object.freeze({ level: 8, totalXp: 1100, xpToNext: 420 }),
  Object.freeze({ level: 9, totalXp: 1520, xpToNext: 560 }),
  Object.freeze({ level: 10, totalXp: 2080, xpToNext: 680 }),
  Object.freeze({ level: 11, totalXp: 2760, xpToNext: 940 }),
  Object.freeze({ level: 12, totalXp: 3700, xpToNext: 1260 }),
  Object.freeze({ level: 13, totalXp: 4960, xpToNext: 1740 }),
  Object.freeze({ level: 14, totalXp: 6700, xpToNext: 2260 }),
  Object.freeze({ level: 15, totalXp: 8960, xpToNext: 2740 }),
  Object.freeze({ level: 16, totalXp: 11700, xpToNext: 3360 }),
  Object.freeze({ level: 17, totalXp: 15060, xpToNext: 4040 }),
  Object.freeze({ level: 18, totalXp: 19100, xpToNext: 4860 }),
  Object.freeze({ level: 19, totalXp: 23960, xpToNext: 5500 }),
  Object.freeze({ level: 20, totalXp: 29460, xpToNext: 0 }),
]);

export const MAX_CHARACTER_LEVEL = CHARACTER_XP_LEVELS.at(-1).level;
export const MAX_CHARACTER_XP = CHARACTER_XP_LEVELS.at(-1).totalXp;

export function experienceForLevel(level) {
  const normalized = Math.max(0, Math.min(MAX_CHARACTER_LEVEL, Math.floor(Number(level) || 0)));
  return CHARACTER_XP_LEVELS[normalized].totalXp;
}

export function normalizeExperience(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_CHARACTER_XP, Math.floor(numeric)));
}

export function experienceProgress(value) {
  const totalXp = normalizeExperience(value);
  let tier = CHARACTER_XP_LEVELS[0];
  for (const candidate of CHARACTER_XP_LEVELS) {
    if (candidate.totalXp > totalXp) break;
    tier = candidate;
  }
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
  };
}

export function normalizeCharacterExperienceState(state) {
  if (!state || typeof state !== "object") return experienceProgress(0);
  if (!state.character || typeof state.character !== "object") state.character = {};
  const hasStoredExperience = Object.prototype.hasOwnProperty.call(state.character, "experience") &&
    Number.isFinite(Number(state.character.experience));
  const totalXp = hasStoredExperience
    ? normalizeExperience(state.character.experience)
    : experienceForLevel(state.character.level);
  const progress = experienceProgress(totalXp);
  state.character.experience = progress.totalXp;
  state.character.level = progress.level;
  return progress;
}

export function adjustCharacterExperience(state, delta) {
  const before = normalizeCharacterExperienceState(state);
  const after = experienceProgress(before.totalXp + Math.trunc(Number(delta) || 0));
  state.character.experience = after.totalXp;
  state.character.level = after.level;
  return { before, after, applied: after.totalXp - before.totalXp };
}
