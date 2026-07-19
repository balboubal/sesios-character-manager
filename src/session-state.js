export const portalLocationStorageKey = "sesios-character-manager:portal-location:v1";

function readStoredJson(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function loadPortalLocation(storage, userId) {
  const saved = readStoredJson(storage, portalLocationStorageKey);
  if (!saved || saved.userId !== userId || saved.view !== "editor") return null;
  const activeCharacterId = String(saved.activeCharacterId || "").trim();
  return activeCharacterId ? { view: "editor", activeCharacterId } : null;
}

export function savePortalLocation(storage, userId, view, activeCharacterId) {
  if (!storage || !userId) return false;
  const payload = {
    userId,
    view: view === "editor" ? "editor" : "characters",
    activeCharacterId: view === "editor" ? String(activeCharacterId || "") : "",
  };
  try {
    storage.setItem(portalLocationStorageKey, JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

export function clearPortalLocation(storage, userId) {
  if (!storage) return false;
  const saved = readStoredJson(storage, portalLocationStorageKey);
  if (userId && saved?.userId && saved.userId !== userId) return false;
  try {
    storage.removeItem(portalLocationStorageKey);
    return true;
  } catch (error) {
    return false;
  }
}

export function shouldSynchronizeForAuthChange({
  event,
  previousUserId,
  nextUserId,
  passwordFlowStarted = false,
}) {
  if (passwordFlowStarted || event === "PASSWORD_RECOVERY") return true;
  if (event === "SIGNED_OUT") return previousUserId !== null || nextUserId !== null;
  return previousUserId !== nextUserId;
}

export function isNewerCharacterRecord(candidate, current) {
  if (!candidate?.updated_at) return false;
  if (!current?.updated_at) return true;
  const candidateTime = Date.parse(candidate.updated_at);
  const currentTime = Date.parse(current.updated_at);
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
    if (candidateTime !== currentTime) return candidateTime > currentTime;
  }
  return String(candidate.updated_at) > String(current.updated_at);
}
