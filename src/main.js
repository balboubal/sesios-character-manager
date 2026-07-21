import "./styles.css";
import { initialAuthType, supabase } from "./supabase.js";
import {
  blankCatalogueEntry,
  buildWorkbookCataloguePayload,
  catalogueDefinitions,
  catalogueLabel,
  catalogueSingular,
  cloneDefaultCharacterState,
} from "./workbook.js";
import {
  buildItemImportPlan,
  createBulkImportPayload,
  ITEM_IMPORT_HEADER,
  parseSpreadsheetItems,
} from "./catalogue-import.js";
import {
  clearPortalLocation,
  isNewerCharacterRecord,
  loadPortalLocation,
  savePortalLocation,
  shouldSynchronizeForAuthChange,
} from "./session-state.js";

const root = document.getElementById("app");
const toastRegion = document.getElementById("toast-region");
const characterSelect = "id,owner_id,name,state,created_at,updated_at,updated_by";
const application = {
  loading: true,
  session: null,
  profile: null,
  profiles: [],
  campaign: null,
  characters: [],
  catalogues: [],
  view: "characters",
  activeCharacterId: null,
  sheetReady: false,
  passwordFlow: initialAuthType === "invite" || initialAuthType === "recovery",
  setupError: null,
  modal: null,
  catalogueCategory: "items",
  catalogueQuery: "",
  catalogueLimit: 80,
  pendingSave: null,
  saveTimer: null,
  savePromise: null,
  loadVersion: 0,
  portalLocationRestored: false,
  authSyncTimer: null,
  checkingForUpdates: false,
  updateCheckPromise: null,
  remoteUpdate: null,
  saveConflict: null,
  realtimeChannel: null,
  realtimeCharacterId: null,
  realtimeStatus: "idle",
  realtimeGeneration: 0,
  pollingTimer: null,
  pollingIntervalMs: 60_000,
  lastAutomaticUpdateCheckAt: 0,
  lastToastedRemoteVersions: new Map(),
  activeSave: null,
  sheetFlushSequence: 0,
  sheetFlushRequests: new Map(),
};

root.addEventListener("click", handleClick);
root.addEventListener("submit", handleSubmit);
root.addEventListener("change", handleChange);
root.addEventListener("input", handleInput);
window.addEventListener("message", handleSheetMessage);
document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("focus", handleWindowFocus);
window.addEventListener("pagehide", handlePageHide);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && application.modal) {
    application.modal = null;
    render();
  }
});

initialize();

async function initialize() {
  const { data, error } = await supabase.auth.getSession();
  if (error) showToast(error.message, "error");
  application.session = data.session;
  await synchronizeSession();

  supabase.auth.onAuthStateChange(handleAuthStateChange);
}

function handleAuthStateChange(event, session) {
  const previousUserId = application.session?.user?.id || null;
  const nextUserId = session?.user?.id || null;
  const wasPasswordFlow = application.passwordFlow;
  application.session = session;

  // Recovery links fire PASSWORD_RECOVERY; invite links fire SIGNED_IN with
  // the token in the URL. Both require the password-setup screen.
  if (event === "PASSWORD_RECOVERY") application.passwordFlow = true;
  if (
    event === "SIGNED_IN" &&
    (initialAuthType === "invite" || initialAuthType === "recovery")
  ) {
    application.passwordFlow = true;
  }

  const passwordFlowStarted = !wasPasswordFlow && application.passwordFlow;
  if (
    !shouldSynchronizeForAuthChange({
      event,
      previousUserId,
      nextUserId,
      passwordFlowStarted,
    })
  ) {
    return;
  }

  if (previousUserId !== nextUserId) {
    application.portalLocationRestored = false;
    application.activeCharacterId = null;
    application.view = "characters";
    application.remoteUpdate = null;
    application.saveConflict = null;
    application.lastToastedRemoteVersions.clear();
  }
  if (event === "SIGNED_OUT") clearPortalLocation(window.sessionStorage, previousUserId);
  requestSessionSynchronization();
}

function requestSessionSynchronization() {
  window.clearTimeout(application.authSyncTimer);
  application.authSyncTimer = window.setTimeout(() => synchronizeSession(), 0);
}

async function synchronizeSession() {
  const version = ++application.loadVersion;
  application.loading = true;
  application.setupError = null;
  render();

  if (!application.session) {
    application.profile = null;
    application.profiles = [];
    application.campaign = null;
    application.characters = [];
    application.catalogues = [];
    application.remoteUpdate = null;
    application.saveConflict = null;
    application.loading = false;
    render();
    return;
  }

  if (application.passwordFlow) {
    application.loading = false;
    render();
    return;
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,display_name,role,created_at,updated_at")
      .eq("id", application.session.user.id)
      .single();
    if (profileError) throw profileError;
    if (version !== application.loadVersion) return;
    application.profile = profile;
    await loadCampaignData(version);
  } catch (error) {
    if (version !== application.loadVersion) return;
    application.setupError = error;
  } finally {
    if (version === application.loadVersion) {
      application.loading = false;
      render();
    }
  }
}

async function loadCampaignData(version = application.loadVersion) {
  const requests = [
    supabase.from("campaign_settings").select("id,name,description,updated_at").eq("id", 1).single(),
    supabase
      .from("characters")
      .select(characterSelect)
      .order("updated_at", { ascending: false }),
    supabase
      .from("catalogue_entries")
      .select("id,category,stable_key,sort_order,data,created_at,updated_at")
      .order("category")
      .order("sort_order"),
  ];
  if (isDm()) {
    requests.push(
      supabase
        .from("profiles")
        .select("id,email,display_name,role,created_at,updated_at")
        .order("display_name"),
    );
  }

  const [campaignResult, characterResult, catalogueResult, profilesResult] = await Promise.all(requests);
  const firstError = [campaignResult, characterResult, catalogueResult, profilesResult]
    .filter(Boolean)
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;
  if (version !== application.loadVersion) return;

  application.campaign = campaignResult.data;
  application.characters = characterResult.data || [];
  application.catalogues = catalogueResult.data || [];
  application.profiles = isDm() ? profilesResult.data || [] : [application.profile];

  restorePortalLocation();

  if (
    application.activeCharacterId &&
    !application.characters.some((character) => character.id === application.activeCharacterId)
  ) {
    application.activeCharacterId = null;
    application.view = "characters";
    application.remoteUpdate = null;
    application.saveConflict = null;
    rememberPortalLocation();
  }
}

function restorePortalLocation() {
  if (application.portalLocationRestored) return;
  application.portalLocationRestored = true;
  const userId = application.session?.user?.id;
  const saved = loadPortalLocation(window.sessionStorage, userId);
  if (!saved) return;
  if (!application.characters.some((character) => character.id === saved.activeCharacterId)) return;
  application.activeCharacterId = saved.activeCharacterId;
  application.view = "editor";
}

function rememberPortalLocation() {
  savePortalLocation(
    window.sessionStorage,
    application.session?.user?.id,
    application.view,
    application.activeCharacterId,
  );
}

function isDm() {
  return application.profile?.role === "dm";
}

function render() {
  if (application.loading) {
    root.innerHTML = `
      <div class="boot-screen" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <p>Opening the campaign…</p>
      </div>`;
    synchronizeCharacterMonitoring();
    return;
  }
  if (!application.session) {
    renderLogin();
    synchronizeCharacterMonitoring();
    return;
  }
  if (application.passwordFlow) {
    renderPasswordSetup();
    synchronizeCharacterMonitoring();
    return;
  }
  if (application.setupError) {
    renderSetupError();
    synchronizeCharacterMonitoring();
    return;
  }

  const campaignName = application.campaign?.name || "World of Sesios";
  root.innerHTML = `
    <div class="portal-shell">
      <aside class="portal-sidebar" aria-label="Campaign navigation">
        <div class="portal-brand">
          <span class="brand-rune" aria-hidden="true">S</span>
          <span><strong>${escapeHtml(campaignName)}</strong><small>Character Manager</small></span>
        </div>
        <nav class="portal-nav">
          ${navigationButton("characters", "Characters", "◈")}
          ${isDm() ? navigationButton("catalogues", "Catalogues", "◆") : ""}
          ${isDm() ? navigationButton("players", "Players", "◇") : ""}
          ${isDm() ? navigationButton("settings", "Campaign", "⚑") : ""}
        </nav>
        <div class="account-card">
          <span class="role-badge">${isDm() ? "DM" : "Player"}</span>
          <strong>${escapeHtml(application.profile.display_name || application.profile.email)}</strong>
          <small>${escapeHtml(application.profile.email)}</small>
          <button class="text-button" type="button" data-action="sign-out">Sign out</button>
        </div>
      </aside>
      <div class="portal-stage">
        <header class="portal-header">
          <div>
            <span class="eyebrow">${isDm() ? "Dungeon Master" : "Private player area"}</span>
            <h1>${escapeHtml(viewTitle())}</h1>
          </div>
          <div class="portal-header-actions">
            <div class="header-role"><span class="status-dot"></span>Invite-only campaign</div>
            <button class="mobile-signout" type="button" data-action="sign-out">Sign out</button>
          </div>
        </header>
        <main class="portal-main" id="app-main" tabindex="-1">
          ${renderView()}
        </main>
      </div>
    </div>
    ${renderModal()}`;

  if (application.view === "editor") {
    application.sheetReady = false;
  }
  synchronizeCharacterMonitoring();
}

function renderLogin() {
  root.innerHTML = `
    <main class="auth-layout" id="app-main">
      <section class="auth-story" aria-labelledby="welcome-title">
        <div class="story-rune" aria-hidden="true">S</div>
        <p class="eyebrow">World of Sesios</p>
        <h1 id="welcome-title">Your character’s story, kept private.</h1>
        <p>Open the complete Amutsu record, with workbook calculations preserved and changes saved securely online.</p>
        <ul class="feature-list">
          <li>Players see only their own characters</li>
          <li>The DM manages the campaign and catalogues</li>
          <li>Access is available by invitation only</li>
        </ul>
      </section>
      <section class="auth-card" aria-labelledby="login-title">
        <p class="eyebrow">Campaign access</p>
        <h2 id="login-title">Sign in</h2>
        <p class="muted">Use the email address that received your invitation.</p>
        <form id="login-form" class="stack-form">
          <label>Email address<input id="login-email" name="email" type="email" autocomplete="email" required /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="button button-primary" type="submit">Sign in</button>
          <button class="text-button centered" type="button" data-action="reset-password">Forgot your password?</button>
        </form>
        <div class="invite-note"><strong>No public registration</strong><span>Ask the DM for an invitation if you do not have an account.</span></div>
      </section>
    </main>`;
}

function renderPasswordSetup() {
  root.innerHTML = `
    <main class="auth-layout" id="app-main">
      <section class="auth-story" aria-labelledby="password-welcome">
        <div class="story-rune" aria-hidden="true">S</div>
        <p class="eyebrow">Invitation accepted</p>
        <h1 id="password-welcome">Secure your campaign account.</h1>
        <p>Choose a password with at least eight characters. You will use it for future visits.</p>
      </section>
      <section class="auth-card" aria-labelledby="password-title">
        <p class="eyebrow">Final step</p>
        <h2 id="password-title">Set your password</h2>
        <form id="password-form" class="stack-form">
          <label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <label>Confirm password<input name="confirmation" type="password" minlength="8" autocomplete="new-password" required /></label>
          <button class="button button-primary" type="submit">Save password and continue</button>
        </form>
      </section>
    </main>`;
}

function renderSetupError() {
  root.innerHTML = `
    <main class="centered-page" id="app-main">
      <section class="setup-card">
        <span class="warning-symbol" aria-hidden="true">!</span>
        <p class="eyebrow">One-time setup required</p>
        <h1>The application is built, but its database tables are not ready.</h1>
        <p>Run the SQL files in <code>supabase/migrations</code> in filename order, then reload this page.</p>
        <details><summary>Technical message</summary><pre>${escapeHtml(friendlyError(application.setupError))}</pre></details>
        <div class="button-row">
          <button class="button button-primary" type="button" data-action="retry-setup">Try again</button>
          <button class="button button-quiet" type="button" data-action="sign-out">Sign out</button>
        </div>
      </section>
    </main>`;
}

function navigationButton(view, label, icon) {
  const active = application.view === view || (view === "characters" && application.view === "editor");
  return `<button class="portal-nav-link ${active ? "is-active" : ""}" type="button" data-view="${view}" ${active ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`;
}

function viewTitle() {
  if (application.view === "editor") return activeCharacter()?.name || "Character";
  return {
    characters: isDm() ? "Campaign characters" : "My characters",
    catalogues: "Catalogue editor",
    players: "Players and invitations",
    settings: "Campaign settings",
  }[application.view] || "Characters";
}

function renderView() {
  if (application.view === "editor") return renderEditor();
  if (application.view === "catalogues") return isDm() ? renderCatalogues() : renderForbidden();
  if (application.view === "players") return isDm() ? renderPlayers() : renderForbidden();
  if (application.view === "settings") return isDm() ? renderSettings() : renderForbidden();
  return renderCharacters();
}

function renderCharacters() {
  const cards = application.characters.map((character) => {
    const owner = ownerProfile(character.owner_id);
    return `
      <article class="character-card">
        <div class="character-card-top">
          <span class="character-glyph" aria-hidden="true">${escapeHtml((character.name || "?").slice(0, 1).toUpperCase())}</span>
          <span class="privacy-chip">${isDm() ? escapeHtml(owner?.display_name || owner?.email || "Unassigned") : "Private"}</span>
        </div>
        <h2>${escapeHtml(character.name)}</h2>
        <p>${escapeHtml(characterDescription(character))}</p>
        <small>Updated ${escapeHtml(formatDate(character.updated_at))}</small>
        <div class="card-actions">
          <button class="button button-primary" type="button" data-action="open-character" data-character-id="${character.id}">Open character</button>
          <button class="icon-button danger" type="button" data-action="delete-character" data-character-id="${character.id}" aria-label="Permanently delete ${escapeHtml(character.name)}">×</button>
        </div>
      </article>`;
  }).join("");

  return `
    <section class="page-intro">
      <div><p class="eyebrow">One campaign</p><h2>${isDm() ? "Every campaign character" : "Characters assigned to you"}</h2><p>${isDm() ? "Open and edit any record, or assign a new character to a player." : "Only you and the DM can see or edit these records."}</p></div>
      <button class="button button-primary" type="button" data-action="new-character">Create character</button>
    </section>
    ${cards ? `<div class="character-grid">${cards}</div>` : `
      <div class="empty-panel"><span aria-hidden="true">◈</span><h2>No characters yet</h2><p>Create the first character to open a fresh Amutsu sheet.</p><button class="button button-primary" type="button" data-action="new-character">Create character</button></div>`}`;
}

function renderEditor() {
  const character = activeCharacter();
  if (!character) return `<div class="empty-panel"><h2>Character not found</h2><button class="button button-primary" type="button" data-view="characters">Back to characters</button></div>`;
  const ownerSelect = isDm() ? `
    <label class="compact-field">Owner
      <select data-action="change-owner" data-character-id="${character.id}">
        ${application.profiles.filter((profile) => profile.role === "player" || profile.id === character.owner_id).map((profile) => `<option value="${profile.id}" ${profile.id === character.owner_id ? "selected" : ""}>${escapeHtml(profile.display_name || profile.email)}</option>`).join("")}
      </select>
    </label>` : "";
  return `
    <section class="editor-wrap">
      <div class="editor-toolbar">
        <button class="button button-quiet" type="button" data-view="characters">← Characters</button>
        <div class="editor-context"><strong>${escapeHtml(character.name)}</strong><span id="online-save-state" role="status">Saved online</span></div>
        <div class="editor-sync-actions">
          <span class="editor-live-state" data-realtime-status="${escapeHtml(application.realtimeStatus)}"><span class="editor-live-dot" aria-hidden="true"></span><span data-realtime-label>${escapeHtml(realtimeStatusLabel())}</span></span>
          <button class="button button-quiet button-compact" type="button" data-action="check-character-updates" ${application.checkingForUpdates ? "disabled" : ""}>${application.checkingForUpdates ? "Checking…" : "Check for updates"}</button>
        </div>
        ${ownerSelect}
      </div>
      <div class="editor-update-region" id="editor-update-region" aria-live="polite">${renderRemoteUpdateNotice()}</div>
      <iframe class="sheet-frame" id="sheet-frame" src="/sheet/index.html?embedded=1&amp;characterId=${encodeURIComponent(character.id)}&amp;viewerRole=${isDm() ? "dm" : "player"}" title="${escapeHtml(character.name)} character sheet"></iframe>
    </section>`;
}

function renderRemoteUpdateNotice() {
  const remote = application.remoteUpdate;
  if (!remote || remote.id !== application.activeCharacterId) return "";
  const conflicted = hasPendingLocalChanges(remote.id) || application.saveConflict?.characterId === remote.id;
  const heading = conflicted
    ? "Newer changes conflict with local edits"
    : "Newer character changes are available";
  const detail = conflicted
    ? `Changed elsewhere ${formatDate(remote.updated_at)}. Autosave is paused so your local edits cannot overwrite the newer version.`
    : `Changed elsewhere ${formatDate(remote.updated_at)}. Your current page and scroll position will be preserved.`;
  return `<div class="editor-update-banner" role="status">
    <div><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(detail)}</span></div>
    <button class="button button-primary button-compact" type="button" data-action="load-remote-update">Load changes</button>
  </div>`;
}

function updateRemoteUpdateInterface() {
  const region = document.getElementById("editor-update-region");
  if (region) region.innerHTML = renderRemoteUpdateNotice();
  const button = root.querySelector('[data-action="check-character-updates"]');
  if (button) {
    button.disabled = application.checkingForUpdates;
    button.textContent = application.checkingForUpdates ? "Checking…" : "Check for updates";
  }
  const liveState = root.querySelector("[data-realtime-status]");
  if (liveState) {
    liveState.dataset.realtimeStatus = application.realtimeStatus;
    const label = liveState.querySelector("[data-realtime-label]");
    if (label) label.textContent = realtimeStatusLabel();
  }
}

function renderCatalogues() {
  const categoryRows = application.catalogues.filter((row) => row.category === application.catalogueCategory);
  const query = application.catalogueQuery.trim().toLowerCase();
  const filtered = query
    ? categoryRows.filter((row) => JSON.stringify(row.data).toLowerCase().includes(query))
    : categoryRows;
  const visible = filtered.slice(0, application.catalogueLimit);

  return `
    <section class="page-intro">
      <div><p class="eyebrow">DM controls</p><h2>Edit every catalogue field</h2><p>Changes are visible in every character sheet as soon as it is reopened or refreshed.</p></div>
      <div class="page-intro-actions">
        ${application.catalogueCategory === "items" ? `<button class="button button-quiet" type="button" data-action="bulk-import-items">Bulk import</button>` : ""}
        <button class="button button-primary" type="button" data-action="new-catalogue-entry">Add ${escapeHtml(catalogueSingular(application.catalogueCategory))}</button>
      </div>
    </section>
    <div class="catalogue-layout">
      <nav class="catalogue-tabs" aria-label="Catalogue categories">
        ${catalogueDefinitions.map((definition) => {
          const count = application.catalogues.filter((row) => row.category === definition.key).length;
          return `<button type="button" class="catalogue-tab ${definition.key === application.catalogueCategory ? "is-active" : ""}" data-catalogue-category="${definition.key}"><span>${escapeHtml(definition.label)}</span><small>${count}</small></button>`;
        }).join("")}
      </nav>
      <section class="catalogue-content" aria-labelledby="catalogue-heading">
        <div class="catalogue-bar"><div><h2 id="catalogue-heading">${escapeHtml(catalogueLabel(application.catalogueCategory))}</h2><span>${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}</span></div><label class="search-field"><span class="visually-hidden">Search catalogue</span><input id="catalogue-search" type="search" value="${escapeHtml(application.catalogueQuery)}" placeholder="Search this catalogue" /></label></div>
        <div class="catalogue-list">
          ${visible.map(renderCatalogueRow).join("") || `<div class="empty-panel compact"><h3>No matching entries</h3><p>Change the search or add a new entry.</p></div>`}
        </div>
        ${visible.length < filtered.length ? `<button class="button button-quiet load-more" type="button" data-action="load-more-catalogue">Show more</button>` : ""}
      </section>
    </div>`;
}

function renderCatalogueRow(row) {
  return `
    <article class="catalogue-row">
      <div><strong>${escapeHtml(catalogueEntryTitle(row))}</strong><p>${escapeHtml(catalogueEntrySummary(row))}</p></div>
      <div class="row-actions">
        <button class="button button-quiet" type="button" data-action="edit-catalogue-entry" data-entry-id="${row.id}">Edit</button>
        <button class="icon-button danger" type="button" data-action="delete-catalogue-entry" data-entry-id="${row.id}" aria-label="Delete ${escapeHtml(catalogueEntryTitle(row))}">×</button>
      </div>
    </article>`;
}

function renderPlayers() {
  return `
    <div class="split-page">
      <section class="panel-card">
        <p class="eyebrow">Invite-only registration</p>
        <h2>Invite a player</h2>
        <p class="muted">They receive a private email link and choose their password after opening it.</p>
        <form id="invite-form" class="stack-form">
          <label>Player name<input name="displayName" type="text" autocomplete="name" placeholder="Optional" /></label>
          <label>Email address<input name="email" type="email" autocomplete="email" required /></label>
          <button class="button button-primary" type="submit">Send invitation</button>
        </form>
      </section>
      <section class="panel-card wide">
        <div class="section-heading"><div><p class="eyebrow">Campaign access</p><h2>${application.profiles.length} accounts</h2></div></div>
        <div class="people-list">
          ${application.profiles.map((profile) => `<article class="person-row"><span class="person-avatar">${escapeHtml((profile.display_name || profile.email).slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(profile.display_name || profile.email)}</strong><small>${escapeHtml(profile.email)}</small></div><span class="role-badge">${profile.role === "dm" ? "DM" : "Player"}</span></article>`).join("")}
        </div>
      </section>
    </div>`;
}

function renderSettings() {
  return `
    <section class="panel-card settings-card">
      <p class="eyebrow">Single campaign</p>
      <h2>Campaign details</h2>
      <p class="muted">These details appear for every player. This application intentionally supports one campaign.</p>
      <form id="campaign-form" class="stack-form">
        <label>Campaign name<input name="name" type="text" maxlength="120" value="${escapeHtml(application.campaign?.name || "")}" required /></label>
        <label>Description<textarea name="description" rows="6" maxlength="2000">${escapeHtml(application.campaign?.description || "")}</textarea></label>
        <button class="button button-primary" type="submit">Save campaign</button>
      </form>
    </section>`;
}

function renderForbidden() {
  return `<div class="empty-panel"><span aria-hidden="true">⚑</span><h2>DM access required</h2><p>Your account cannot open this area.</p><button class="button button-primary" type="button" data-view="characters">Return to characters</button></div>`;
}

function renderModal() {
  if (!application.modal) return "";
  if (application.modal.type === "character") return renderCharacterModal();
  if (application.modal.type === "catalogue") return renderCatalogueModal();
  if (application.modal.type === "bulk-items") return renderBulkItemsModal();
  return "";
}

function renderCharacterModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="character-modal-title" data-modal-panel>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button>
        <p class="eyebrow">New record</p><h2 id="character-modal-title">Create a character</h2>
        <form id="character-form" class="stack-form">
          <label>Character name<input name="name" type="text" maxlength="120" autocomplete="off" required autofocus /></label>
          ${isDm() ? `<label>Assign to player<select name="ownerId" required>${application.profiles.filter((profile) => profile.role === "player").map((profile) => `<option value="${profile.id}">${escapeHtml(profile.display_name || profile.email)}</option>`).join("")}</select></label>` : ""}
          <div class="button-row"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Create and open</button></div>
        </form>
      </section>
    </div>`;
}

function renderCatalogueModal() {
  const row = application.modal.row;
  const data = application.catalogueCategory === "food_dishes"
    ? normalizeDishCatalogueData(application.modal.data)
    : application.catalogueCategory === "crafting_materials"
      ? normalizeCraftingMaterialData(application.modal.data)
      : application.catalogueCategory === "crafting_recipes"
        ? normalizeCraftingRecipeData(application.modal.data)
        : application.modal.data;
  const fields = Object.entries(data).map(([key, value]) => renderCatalogueField(key, value)).join("");
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="catalogue-modal-title" data-modal-panel>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button>
        <p class="eyebrow">${row ? "Edit" : "New"} ${escapeHtml(catalogueSingular(application.catalogueCategory))}</p>
        <h2 id="catalogue-modal-title">${escapeHtml(row ? catalogueEntryTitle(row) : `Add to ${catalogueLabel(application.catalogueCategory)}`)}</h2>
        <form id="catalogue-form" class="dynamic-form">
          ${fields || `<p>No editable fields were found.</p>`}
          <div class="button-row form-span"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save entry</button></div>
        </form>
      </section>
    </div>`;
}

function renderBulkItemsModal() {
  const modal = application.modal;
  const rawText = modal.rawText || "";
  const duplicateMode = modal.duplicateMode || "upsert";
  const parsed = modal.parsed || null;
  const itemRows = application.catalogues.filter((row) => row.category === "items");
  const plan = parsed ? buildItemImportPlan(parsed, itemRows, duplicateMode) : null;
  const importCount = plan ? plan.counts.insert + plan.counts.update : 0;

  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-card modal-import" role="dialog" aria-modal="true" aria-labelledby="bulk-item-modal-title" data-modal-panel>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close">×</button>
        <p class="eyebrow">Spreadsheet workflow</p>
        <h2 id="bulk-item-modal-title">Bulk import items</h2>
        <p class="modal-lead">Copy the header row and item rows from Excel or Google Sheets, then paste them below. Tabs separate columns and each spreadsheet row becomes one item.</p>
        <form id="bulk-item-form" class="bulk-import-form">
          <div class="bulk-import-toolbar">
            <label>Duplicate handling
              <select name="duplicateMode">
                <option value="upsert" ${duplicateMode === "upsert" ? "selected" : ""}>Add new and update matching names</option>
                <option value="add-only" ${duplicateMode === "add-only" ? "selected" : ""}>Add new only and skip existing names</option>
                <option value="create-all" ${duplicateMode === "create-all" ? "selected" : ""}>Create every row as a new item</option>
              </select>
            </label>
            <div class="bulk-import-help">
              <strong>Matching rule</strong>
              <span>Names are compared case-insensitively after trimming extra spaces.</span>
            </div>
          </div>
          <label class="bulk-paste-field">Paste spreadsheet cells
            <textarea name="pasteData" rows="11" spellcheck="false" placeholder="Item&#9;Rarity&#9;Type&#9;Phys Dmg&#9;...">${escapeHtml(rawText)}</textarea>
          </label>
          <div class="bulk-import-actions">
            <button class="button button-quiet" type="button" data-action="copy-item-import-headers">Copy supported header row</button>
            <button class="button button-quiet" type="submit" name="intent" value="preview">Preview data</button>
          </div>
          ${parsed ? renderBulkItemPreview(parsed, plan) : renderBulkItemInstructions()}
          <div class="button-row bulk-import-footer">
            <button class="button button-quiet" type="button" data-action="close-modal">Cancel</button>
            ${parsed ? `<button class="button button-primary" type="submit" name="intent" value="import" ${importCount ? "" : "disabled"}>Import ${importCount} item${importCount === 1 ? "" : "s"}</button>` : ""}
          </div>
        </form>
      </section>
    </div>`;
}

function renderBulkItemInstructions() {
  return `<section class="bulk-import-instructions">
    <strong>Your existing sheet format is supported</strong>
    <p>Recognized columns include Item, Rarity, Type, Phys Dmg, Mag Dmg, CR%, STR, SPD, VIT, INT, AWR, TAL, LUCK, AC, RES, Evasion, Durability, Dmg Ref, HP Regen, Focus, Weight, Value, GoldMulti, XpMulti, and Tags.</p>
    <ul>
      <li>Percentage cells such as 5% are stored as 0.05.</li>
      <li>Dashes and blank statistic cells are treated as no bonus.</li>
      <li>Commas inside Tags or damage descriptions remain inside the same cell.</li>
      <li>Unknown columns are ignored and listed in the preview.</li>
    </ul>
    <details class="bulk-header-details"><summary>View the supported header row</summary><code>${escapeHtml(ITEM_IMPORT_HEADER)}</code></details>
  </section>`;
}

function renderBulkItemPreview(parsed, plan) {
  const notices = [...parsed.globalErrors, ...parsed.globalWarnings];
  if (parsed.unknownHeaders.length) notices.push(`Ignored columns: ${parsed.unknownHeaders.join(", ")}.`);
  if (parsed.duplicateHeaders.length) notices.push(`Duplicate columns ignored: ${parsed.duplicateHeaders.join(", ")}.`);
  const prioritized = [...plan.entries].sort((left, right) => {
    const rank = { error: 0, skip: 1, update: 2, insert: 3 };
    return rank[left.action] - rank[right.action] || left.sourceRow - right.sourceRow;
  });
  const visibleEntries = prioritized.slice(0, 120);
  const hiddenCount = Math.max(0, plan.entries.length - visibleEntries.length);

  return `<section class="bulk-preview" aria-live="polite">
    <div class="bulk-summary" aria-label="Import summary">
      ${bulkSummaryMetric("Rows", plan.counts.total, "neutral")}
      ${bulkSummaryMetric("New", plan.counts.insert, "insert")}
      ${bulkSummaryMetric("Updates", plan.counts.update, "update")}
      ${bulkSummaryMetric("Skipped", plan.counts.skip, "skip")}
      ${bulkSummaryMetric("Errors", plan.counts.error, "error")}
    </div>
    ${notices.length ? `<div class="bulk-notices">${notices.map((notice) => `<p>${escapeHtml(notice)}</p>`).join("")}</div>` : ""}
    <div class="bulk-preview-table-wrap">
      <table class="bulk-preview-table">
        <thead><tr><th>Sheet row</th><th>Status</th><th>Item</th><th>Rarity</th><th>Type</th><th>Physical damage</th><th>Weight</th><th>Value</th><th>Notes</th></tr></thead>
        <tbody>${visibleEntries.map(renderBulkItemPreviewRow).join("")}</tbody>
      </table>
    </div>
    ${hiddenCount ? `<p class="bulk-preview-limit">${hiddenCount} additional ready row${hiddenCount === 1 ? " is" : "s are"} not shown. All valid rows will still be imported.</p>` : ""}
  </section>`;
}

function bulkSummaryMetric(label, value, tone) {
  return `<div class="bulk-summary-metric is-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderBulkItemPreviewRow(entry) {
  const data = entry.data || entry.values || {};
  const status = {
    insert: "Add",
    update: "Update",
    skip: "Skip",
    error: "Error",
  }[entry.action] || entry.action;
  const notes = [...entry.errors, ...entry.warnings].join(" ") || (entry.action === "update" ? "Matches an existing item name." : "Ready.");
  return `<tr class="bulk-row is-${escapeHtml(entry.action)}">
    <td>${escapeHtml(entry.sourceRow)}</td>
    <td><span class="bulk-status is-${escapeHtml(entry.action)}">${escapeHtml(status)}</span></td>
    <td>${escapeHtml(data.name || "Unnamed")}</td>
    <td>${escapeHtml(data.rarity || "-")}</td>
    <td>${escapeHtml(data.type || "-")}</td>
    <td>${escapeHtml(data.physicalDamage || "-")}</td>
    <td>${escapeHtml(data.weight ?? "-")}</td>
    <td>${escapeHtml(data.value ?? "-")}</td>
    <td>${escapeHtml(notes)}</td>
  </tr>`;
}

function normalizeDishCatalogueData(value) {
  const data = value && typeof value === "object" ? structuredClone(value) : {};
  const legendary = data.legendary === true || Number(data.dc) >= 85 || /master|legendary/i.test(String(data.difficulty || "")) || String(data.preparationClass || "").toLowerCase() === "masterchef";
  const rareDangerous = !legendary && (data.rareDangerous === true || String(data.preparationClass || "").toLowerCase() === "dangerous");
  return {
    name: String(data.name || ""),
    region: String(data.region || "Asura"),
    cost: Number(data.cost || 0),
    time: String(data.time || (legendary ? "2-4 hours" : rareDangerous ? "2 hours" : "1 hour")),
    method: String(data.method || ""),
    effect: String(data.effect || ""),
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    specialtyUtensil: String(data.specialtyUtensil || ""),
    preparationClass: legendary ? "masterchef" : rareDangerous ? "dangerous" : String(data.preparationClass || "standard"),
    rareDangerous,
    legendary,
    difficulty: legendary ? "Masterchef Dish · Legendary" : rareDangerous ? "Rare or Dangerous" : "Automatic by Region",
    dc: legendary ? 85 : rareDangerous ? 70 : 0,
  };
}

const CRAFTING_RARITIES = Object.freeze(["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Unique"]);
const CRAFTING_CATEGORIES = Object.freeze(["Basic", "Bomb", "Potion", "Salve", "Coating", "Scroll", "Ink", "Weapon", "Armor", "Shield", "Utility", "Legendary"]);
const CRAFTING_DISCIPLINES = Object.freeze(["Alchemy", "Forgecraft", "Runecraft", "Scribing", "Fieldcraft"]);
const CRAFTING_TIMES = Object.freeze([
  "Short rest",
  "4 hr",
  "4 hours",
  "1 day",
  "2 days",
  "3 days",
  "4 days",
  "7 days",
  "10 days",
  "Project",
  "Three narrative stages",
]);
const CRAFTING_PRIMARY_TAGS = Object.freeze(["Metal", "Hide", "Bone", "Wood", "Fiber", "Stone", "Glass", "Gem", "Organic", "Essence", "Ink", "Salvage"]);
const CRAFTING_EFFECT_TAGS = Object.freeze(["Acid", "Air", "Arcane", "Ash", "Blood", "Cold", "Death", "Divine", "Elemental", "Fey", "Fire", "Force", "Illusion", "Life", "Lightning", "Memory", "Mind", "Necrotic", "Poison", "Radiant", "Resonance", "Shadow", "Soul", "Space", "Spirit", "Storm", "Time", "Venom", "Void", "Ward", "Water"]);

function normalizeStringList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/\n|,/).map((entry) => entry.trim()).filter(Boolean))];
}

function normalizeCraftingMaterialData(value) {
  const data = value && typeof value === "object" ? structuredClone(value) : {};
  return {
    id: String(data.id || ""),
    name: String(data.name || ""),
    rarity: CRAFTING_RARITIES.includes(data.rarity) ? data.rarity : "Common",
    categoryTags: normalizeStringList(data.categoryTags),
    effectTags: normalizeStringList(data.effectTags),
    regions: normalizeStringList(data.regions),
    sourceType: String(data.sourceType || "Other"),
    source: String(data.source || ""),
    description: String(data.description || ""),
    signatureEffect: String(data.signatureEffect || ""),
    maxStack: Math.max(1, Math.floor(Number(data.maxStack || 99))),
  };
}

function craftingCatalogueMaterials() {
  return application.catalogues
    .filter((row) => row.category === "crafting_materials")
    .map((row) => row.data)
    .filter((entry) => entry && typeof entry === "object");
}

function normalizeCraftingPhrase(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function craftingRequirementAlternative(label, materials) {
  let phrase = normalizeCraftingPhrase(label);
  let minRarity = "Common";
  for (const rarity of ["Very Rare", "Legendary", "Rare", "Uncommon"]) {
    if (phrase.toLowerCase().startsWith(`${rarity.toLowerCase()} `)) {
      minRarity = rarity;
      phrase = phrase.slice(rarity.length).trim();
      break;
    }
  }
  phrase = phrase
    .replace(/-tag\b/gi, "")
    .replace(/\bdust\b/gi, "")
    .replace(/\bchosen\b/gi, "")
    .trim();

  const normalized = phrase.toLowerCase();
  const exact = materials.find((material) => {
    const names = [material.id, material.name].map((entry) => String(entry || "").trim().toLowerCase());
    return names.includes(normalized);
  });
  if (exact) {
    return { minRarity, named: true, alternative: { materialIds: [exact.id], tags: [] } };
  }

  const aliasTags = {
    "healing herb": ["Life", "Organic"],
    "purifying material": ["Ward"],
    "purifying salt": ["Ward"],
    "spell catalyst": ["Arcane"],
    "arcane catalyst": ["Arcane"],
    "rare catalyst": [],
    "mythic catalyst": [],
    "celestial catalyst": ["Divine", "Radiant"],
    "volatile material": ["Fire", "Lightning", "Force"],
    "stimulant organic": ["Organic"],
    "monster bile": ["Organic"],
    "monster fang": ["Bone"],
    "monster claw": ["Bone"],
    "dragon scale": ["Hide"],
    "stone powder": ["Stone"],
    "writing surface": ["Fiber"],
    "legendary writing surface": ["Fiber"],
    "elemental material": ["Elemental"],
    "chosen elemental material": ["Elemental"],
  };
  const aliased = aliasTags[normalized];
  if (aliased) {
    return {
      minRarity,
      named: false,
      alternative: aliased.length === 1 ? { materialIds: [], tags: aliased } : { materialIds: [], tags: [], anyTags: aliased },
    };
  }

  const words = normalized
    .replace(/\b(material|catalyst|essence|organic|resin|glass|ink|fiber|hide|metal|stone|gem|bone|wood|salvage)\b/g, (word) => ` ${word} `)
    .split(/[^a-z]+/)
    .filter(Boolean);
  const recognized = [...new Set([...CRAFTING_PRIMARY_TAGS, ...CRAFTING_EFFECT_TAGS]
    .filter((tag) => words.includes(tag.toLowerCase()))
  )];
  if (recognized.length) {
    return {
      minRarity,
      named: false,
      alternative: recognized.length === 1
        ? { materialIds: [], tags: recognized }
        : { materialIds: [], tags: recognized },
    };
  }

  return { minRarity, named: false, alternative: { materialIds: [], tags: [] } };
}

function parseCraftingRequirementsText(value) {
  const materials = craftingCatalogueMaterials();
  const source = String(value || "").trim();
  if (!source) return [];
  return source
    .split(/\n|\s+\+\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => {
      const quantityMatch = part.match(/\bx\s*(\d+)\s*$/i);
      const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;
      const label = normalizeCraftingPhrase(part.replace(/\bx\s*\d+\s*$/i, ""));
      const alternatives = label
        .replace(/,\s*or\s+/gi, " or ")
        .replace(/,/g, " or ")
        .split(/\s+or\s+/i)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => craftingRequirementAlternative(entry, materials));
      const minRarity = alternatives.reduce((best, entry) => {
        const current = CRAFTING_RARITIES.indexOf(entry.minRarity);
        return current > CRAFTING_RARITIES.indexOf(best) ? entry.minRarity : best;
      }, "Common");
      return {
        label,
        quantity,
        minRarity,
        named: alternatives.length > 0 && alternatives.every((entry) => entry.named),
        alternatives: alternatives.map((entry) => entry.alternative),
      };
    });
}

function normalizeCraftingRecipeData(value, options = {}) {
  const data = value && typeof value === "object" ? structuredClone(value) : {};
  const rarity = CRAFTING_RARITIES.includes(data.rarity) ? data.rarity : "Common";
  const project = data.project === true || rarity === "Legendary";
  const requirementsText = String(data.requirementsText || "");
  const suppliedRequirements = Array.isArray(data.requirements) ? data.requirements : [];
  const requirements = options.reparseRequirements || !suppliedRequirements.length
    ? parseCraftingRequirementsText(requirementsText)
    : suppliedRequirements;
  const defaultDc = { Common: 40, Uncommon: 55, Rare: 70, "Very Rare": 85, Legendary: 0, Unique: 0 }[rarity] ?? 40;
  return {
    id: String(data.id || ""),
    name: String(data.name || ""),
    category: CRAFTING_CATEGORIES.includes(data.category) ? data.category : "Basic",
    rarity,
    discipline: CRAFTING_DISCIPLINES.includes(data.discipline) ? data.discipline : "Fieldcraft",
    requirementsText,
    requirements,
    dc: project ? 0 : Math.max(0, Math.floor(Number(data.dc ?? defaultDc))),
    time: String(data.time || (project ? "Three narrative stages" : "4 hours")),
    batchYield: Math.max(1, Math.floor(Number(data.batchYield || 1))),
    effect: String(data.effect || ""),
    saveDc: data.saveDc === "" || data.saveDc == null ? null : Number(data.saveDc),
    blueprintRequired: data.blueprintRequired === true || ["Rare", "Very Rare", "Legendary", "Unique"].includes(rarity),
    attunement: data.attunement === true,
    permanent: data.permanent === true,
    project,
  };
}

function catalogueSelectField(key, label, value, options, hint = "") {
  return `<label>${escapeHtml(label)}<select data-catalogue-field="${escapeHtml(key)}" data-kind="string">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</label>`;
}

function renderCatalogueField(key, value) {
  const label = titleCase(key);
  if (application.catalogueCategory === "crafting_materials") {
    if (key === "rarity") return catalogueSelectField(key, "Rarity", value, CRAFTING_RARITIES.map((entry) => [entry, entry]));
    if (["categoryTags", "effectTags", "regions"].includes(key)) {
      const descriptions = {
        categoryTags: "One primary material tag per line, such as Metal, Bone, Gem, or Essence.",
        effectTags: "One effect tag per line, such as Fire, Soul, Memory, or Radiant.",
        regions: "One region or source area per line.",
      };
      return `<label class="form-span">${escapeHtml(label)}<textarea rows="5" data-catalogue-field="${escapeHtml(key)}" data-kind="string-list">${escapeHtml(normalizeStringList(value).join("\n"))}</textarea><small>${escapeHtml(descriptions[key])}</small></label>`;
    }
    if (key === "sourceType") {
      return catalogueSelectField(key, "Source Type", value, ["Mine", "Monster", "Plant", "Battlefield", "Quest", "Ruin", "Trade", "Scavenged", "Salvage", "Unique", "Other"].map((entry) => [entry, entry]));
    }
  }
  if (application.catalogueCategory === "crafting_recipes") {
    if (key === "category") return catalogueSelectField(key, "Recipe Category", value, CRAFTING_CATEGORIES.map((entry) => [entry, entry]));
    if (key === "rarity") return catalogueSelectField(key, "Item Rarity", value, CRAFTING_RARITIES.map((entry) => [entry, entry]));
    if (key === "discipline") return catalogueSelectField(key, "Crafting Discipline", value, CRAFTING_DISCIPLINES.map((entry) => [entry, entry]));
    if (key === "time") return catalogueSelectField(key, "Creation Time", value, CRAFTING_TIMES.map((entry) => [entry, entry]));
    if (key === "dc") {
      return `<label>Crafting DC<select data-catalogue-field="dc" data-kind="number">${[[40, "40 · Common"], [55, "55 · Uncommon"], [70, "70 · Rare"], [85, "85 · Very Rare"], [0, "Project · no single roll"]].map(([dc, text]) => `<option value="${dc}" ${Number(value) === dc ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
    }
    if (key === "requirementsText") {
      return `<label class="form-span">Materials Required<textarea rows="6" spellcheck="false" data-catalogue-field="requirementsText" data-kind="string">${escapeHtml(String(value || ""))}</textarea><small>Use 1 to 4 components. Separate them with + or new lines, for example: Metal x2 + Fire or Lightning x1.</small></label>`;
    }
    if (key === "requirements") return "";
    if (key === "saveDc") {
      return `<label>Save DC<input type="number" min="0" step="1" value="${value == null ? "" : escapeHtml(value)}" data-catalogue-field="saveDc" data-kind="nullable-number" placeholder="Optional" /></label>`;
    }
    if (key === "project") {
      return `<label class="checkbox-field"><input type="checkbox" data-catalogue-field="project" data-kind="boolean" ${value ? "checked" : ""} /><span>Legendary three-stage project</span></label>`;
    }
    if (key === "blueprintRequired") {
      return `<label class="checkbox-field"><input type="checkbox" data-catalogue-field="blueprintRequired" data-kind="boolean" ${value ? "checked" : ""} /><span>Blueprint required</span></label>`;
    }
  }
  if (application.catalogueCategory === "food_dishes") {
    if (key === "region") {
      return catalogueSelectField(key, "Region", value, ["Asura", "Karrnath", "Fittoa", "Shirone", "Ronoa", "Milis", "Begaritt", "Demon Continent", "Heaven Continent"].map((entry) => [entry, entry]));
    }
    if (key === "time") {
      return catalogueSelectField(key, "Cooking Time", value, [["30 minutes", "30 minutes"], ["1 hour", "1 hour"], ["2 hours", "2 hours"], ["2-4 hours", "2-4 hours"]]);
    }
    if (key === "specialtyUtensil") {
      return catalogueSelectField(key, "Specialty Utensil", value, [["", "None"], ["Silver Reed", "Silver Reed"], ["Sealed Glass Vessel", "Sealed Glass Vessel"], ["Leaf-Steaming Basket", "Leaf-Steaming Basket"], ["Resonance-Safe Knife", "Resonance-Safe Knife"], ["Smoking Rack", "Smoking Rack"], ["Bone-Roasting Pan", "Bone-Roasting Pan"]]);
    }
    if (key === "preparationClass") {
      return catalogueSelectField(key, "Preparation Class", value, [["standard", "Standard"], ["dangerous", "Rare or Dangerous"], ["masterchef", "Masterchef / Legendary"]], "Rare and Legendary flags will keep this synchronized.");
    }
    if (key === "difficulty") {
      return catalogueSelectField(key, "Difficulty Rule", value, [["Automatic by Region", "Automatic by player region"], ["Rare or Dangerous", "Rare or Dangerous · DC 70"], ["Masterchef Dish · Legendary", "Masterchef Dish · Legendary · DC 85"]], "The final player DC is calculated from home region unless an override is ticked.");
    }
    if (key === "dc") {
      return `<label>Stored DC<select data-catalogue-field="dc" data-kind="number"><option value="0" ${Number(value) === 0 ? "selected" : ""}>Automatic</option><option value="70" ${Number(value) === 70 ? "selected" : ""}>70 · Rare or Dangerous</option><option value="85" ${Number(value) === 85 ? "selected" : ""}>85 · Legendary Masterchef</option></select><small>Player-region difficulty is calculated automatically for standard dishes.</small></label>`;
    }
    if (key === "ingredients") {
      return `<label class="form-span">Ingredients<textarea rows="8" spellcheck="false" data-catalogue-field="ingredients" data-kind="string-list">${escapeHtml((Array.isArray(value) ? value : []).join("\n"))}</textarea><small>Enter one ingredient catalogue name per line. One unit of each is required per Cooking Check.</small></label>`;
    }
    if (key === "rareDangerous") {
      return `<label class="checkbox-field"><input type="checkbox" data-catalogue-field="${escapeHtml(key)}" data-kind="boolean" ${value ? "checked" : ""} /><span>Rare or Dangerous override · DC 70 · 1 serving</span></label>`;
    }
    if (key === "legendary") {
      return `<label class="checkbox-field"><input type="checkbox" data-catalogue-field="${escapeHtml(key)}" data-kind="boolean" ${value ? "checked" : ""} /><span>Masterchef Dish · Legendary · DC 85 · 1 serving</span></label>`;
    }
  }
  if (typeof value === "boolean") {
    return `<label class="checkbox-field"><input type="checkbox" data-catalogue-field="${escapeHtml(key)}" data-kind="boolean" ${value ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
  }
  if (typeof value === "number") {
    return `<label>${escapeHtml(label)}<input type="number" step="any" value="${escapeHtml(value)}" data-catalogue-field="${escapeHtml(key)}" data-kind="number" /></label>`;
  }
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return `<label class="form-span">${escapeHtml(label)}<textarea rows="8" spellcheck="false" data-catalogue-field="${escapeHtml(key)}" data-kind="json">${escapeHtml(JSON.stringify(value, null, 2))}</textarea><small>JSON structure</small></label>`;
  }
  const text = String(value ?? "");
  const multiline = text.length > 80 || /effect|description|treatment|exposure|method|mark|crisis|tags/i.test(key);
  return multiline
    ? `<label class="form-span">${escapeHtml(label)}<textarea rows="4" data-catalogue-field="${escapeHtml(key)}" data-kind="string">${escapeHtml(text)}</textarea></label>`
    : `<label>${escapeHtml(label)}<input type="text" value="${escapeHtml(text)}" data-catalogue-field="${escapeHtml(key)}" data-kind="string" /></label>`;
}

async function handleClick(event) {
  const categoryButton = event.target.closest("[data-catalogue-category]");
  if (categoryButton) {
    application.catalogueCategory = categoryButton.dataset.catalogueCategory;
    application.catalogueQuery = "";
    application.catalogueLimit = 80;
    render();
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    const nextView = viewButton.dataset.view;
    if (application.view === "editor" && nextView !== "editor") {
      const saved = await flushOpenCharacterSave();
      if (!saved && hasPendingLocalChanges(application.activeCharacterId)) {
        showToast("Resolve the newer character changes before leaving this sheet.", "error");
        return;
      }
    }
    application.view = nextView;
    application.modal = null;
    if (nextView !== "editor") {
      application.remoteUpdate = null;
      application.saveConflict = null;
    }
    rememberPortalLocation();
    render();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "sign-out") {
    const saved = await flushOpenCharacterSave();
    if (!saved && hasPendingLocalChanges(application.activeCharacterId)) {
      showToast("Resolve the newer character changes before signing out.", "error");
      return;
    }
    await supabase.auth.signOut();
    return;
  }
  if (action === "retry-setup") {
    await synchronizeSession();
    return;
  }
  if (action === "check-character-updates") {
    await checkForRemoteCharacterUpdate({ announce: true, force: true, reason: "manual" });
    return;
  }
  if (action === "load-remote-update") {
    await loadRemoteCharacterUpdate();
    return;
  }
  if (action === "reset-password") {
    await requestPasswordReset();
    return;
  }
  if (action === "new-character") {
    if (isDm() && !application.profiles.some((profile) => profile.role === "player")) {
      showToast("Invite a player before assigning a character.", "error");
      application.view = "players";
      rememberPortalLocation();
      render();
      return;
    }
    application.modal = { type: "character" };
    render();
    return;
  }
  if (action === "open-character") {
    await flushOpenCharacterSave();
    application.activeCharacterId = button.dataset.characterId;
    application.view = "editor";
    application.remoteUpdate = null;
    application.saveConflict = null;
    rememberPortalLocation();
    render();
    return;
  }
  if (action === "delete-character") {
    await deleteCharacter(button.dataset.characterId);
    return;
  }
  if (action === "close-modal") {
    // `button` is the nearest [data-action="close-modal"]. The × and Cancel
    // buttons carry that action themselves and sit inside the panel, so they
    // should close. The backdrop also carries it, but a click on a field
    // inside the panel bubbles up to the backdrop — that must NOT close.
    const closeButtonInsidePanel = button.closest("[data-modal-panel]");
    const clickedBackdropDirectly = event.target === button && !button.closest("[data-modal-panel]");
    if (closeButtonInsidePanel || clickedBackdropDirectly) {
      application.modal = null;
      render();
    }
    return;
  }
  if (action === "bulk-import-items") {
    application.modal = {
      type: "bulk-items",
      rawText: "",
      duplicateMode: "upsert",
      parsed: null,
    };
    render();
    return;
  }
  if (action === "copy-item-import-headers") {
    try {
      await copyTextToClipboard(ITEM_IMPORT_HEADER);
      showToast("Supported item headers copied.", "success");
    } catch (error) {
      showToast("The header row could not be copied. Select and copy it from the import instructions instead.", "error");
    }
    return;
  }
  if (action === "new-catalogue-entry") {
    const reference = application.catalogues.find((row) => row.category === application.catalogueCategory)?.data;
    application.modal = {
      type: "catalogue",
      row: null,
      data: blankCatalogueEntry(application.catalogueCategory, reference),
    };
    render();
    return;
  }
  if (action === "edit-catalogue-entry") {
    const row = application.catalogues.find((entry) => entry.id === button.dataset.entryId);
    if (!row) return;
    application.modal = { type: "catalogue", row, data: structuredClone(row.data) };
    render();
    return;
  }
  if (action === "delete-catalogue-entry") {
    await deleteCatalogueEntry(button.dataset.entryId);
    return;
  }
  if (action === "load-more-catalogue") {
    application.catalogueLimit += 80;
    render();
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "login-form") await signIn(form);
  if (form.id === "password-form") await setPassword(form);
  if (form.id === "character-form") await createCharacter(form);
  if (form.id === "catalogue-form") await saveCatalogueEntry(form);
  if (form.id === "bulk-item-form") await handleBulkItemForm(form, event.submitter);
  if (form.id === "invite-form") await invitePlayer(form);
  if (form.id === "campaign-form") await saveCampaign(form);
}

async function handleChange(event) {
  const ownerSelect = event.target.closest('[data-action="change-owner"]');
  if (ownerSelect) await changeCharacterOwner(ownerSelect.dataset.characterId, ownerSelect.value);
}

function handleInput(event) {
  if (event.target.id !== "catalogue-search") return;
  application.catalogueQuery = event.target.value;
  application.catalogueLimit = 80;
  const position = event.target.selectionStart;
  render();
  const search = document.getElementById("catalogue-search");
  search?.focus();
  search?.setSelectionRange(position, position);
}

async function signIn(form) {
  const values = new FormData(form);
  setFormBusy(form, true, "Signing in…");
  const { error } = await supabase.auth.signInWithPassword({
    email: String(values.get("email") || "").trim(),
    password: String(values.get("password") || ""),
  });
  setFormBusy(form, false);
  if (error) showToast(error.message, "error");
}

async function requestPasswordReset() {
  const email = String(document.getElementById("login-email")?.value || "").trim();
  if (!email) {
    showToast("Enter your email address first.", "error");
    document.getElementById("login-email")?.focus();
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) showToast(error.message, "error");
  else showToast("Password reset email sent.", "success");
}

async function setPassword(form) {
  const values = new FormData(form);
  const password = String(values.get("password") || "");
  const confirmation = String(values.get("confirmation") || "");
  if (password !== confirmation) {
    showToast("The passwords do not match.", "error");
    return;
  }
  setFormBusy(form, true, "Saving…");
  const { error } = await supabase.auth.updateUser({ password });
  setFormBusy(form, false);
  if (error) {
    showToast(error.message, "error");
    return;
  }
  application.passwordFlow = false;
  window.history.replaceState({}, document.title, window.location.pathname);
  showToast("Password saved. Welcome to the campaign.", "success");
  await synchronizeSession();
}

async function createCharacter(form) {
  const values = new FormData(form);
  const name = String(values.get("name") || "").trim();
  const ownerId = isDm() ? String(values.get("ownerId") || "") : application.session.user.id;
  const state = cloneDefaultCharacterState(name);
  setFormBusy(form, true, "Creating…");
  const { data, error } = await supabase
    .from("characters")
    .insert({
      owner_id: ownerId,
      name,
      state,
      created_by: application.session.user.id,
      updated_by: application.session.user.id,
    })
    .select(characterSelect)
    .single();
  setFormBusy(form, false);
  if (error) {
    showToast(error.message, "error");
    return;
  }
  application.characters.unshift(data);
  application.modal = null;
  application.activeCharacterId = data.id;
  application.view = "editor";
  application.remoteUpdate = null;
  application.saveConflict = null;
  rememberPortalLocation();
  render();
  showToast(`${name} created.`, "success");
}

async function deleteCharacter(characterId) {
  const character = application.characters.find((entry) => entry.id === characterId);
  if (!character) return;
  const confirmed = window.confirm(
    `Permanently delete ${character.name}? This cannot be undone and no recovery copy will be kept.`,
  );
  if (!confirmed) return;
  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) {
    showToast(error.message, "error");
    return;
  }
  application.characters = application.characters.filter((entry) => entry.id !== characterId);
  if (application.activeCharacterId === characterId) {
    application.activeCharacterId = null;
    application.view = "characters";
    application.remoteUpdate = null;
    application.saveConflict = null;
  }
  rememberPortalLocation();
  render();
  showToast(`${character.name} was permanently deleted.`, "success");
}

async function changeCharacterOwner(characterId, ownerId) {
  const { data, error } = await supabase
    .from("characters")
    .update({ owner_id: ownerId, updated_by: application.session.user.id })
    .eq("id", characterId)
    .select(characterSelect)
    .single();
  if (error) {
    showToast(error.message, "error");
    render();
    return;
  }
  replaceCharacter(data);
  showToast("Character owner updated.", "success");
}


async function handleBulkItemForm(form, submitter) {
  if (application.modal?.type !== "bulk-items") return;
  const values = new FormData(form);
  const rawText = String(values.get("pasteData") || "");
  const duplicateMode = String(values.get("duplicateMode") || "upsert");
  const parsed = parseSpreadsheetItems(rawText);
  const itemRows = application.catalogues.filter((row) => row.category === "items");
  const plan = buildItemImportPlan(parsed, itemRows, duplicateMode);
  application.modal.rawText = rawText;
  application.modal.duplicateMode = duplicateMode;
  application.modal.parsed = parsed;

  if (submitter?.value !== "import") {
    render();
    const firstProblem = root.querySelector(".bulk-row.is-error, .bulk-row.is-skip");
    firstProblem?.scrollIntoView({ block: "nearest" });
    return;
  }

  const payload = createBulkImportPayload(plan);
  if (!payload.length) {
    render();
    showToast("There are no valid item rows to import.", "error");
    return;
  }

  setBulkImportBusy(form, submitter, true);
  const { data, error } = await supabase.rpc("bulk_import_catalogue_items", { p_rows: payload });
  setBulkImportBusy(form, submitter, false);
  if (error) {
    const missingFunction = /bulk_import_catalogue_items|schema cache|PGRST202/i.test(error.message || "");
    showToast(
      missingFunction
        ? "Bulk import is not enabled in Supabase yet. Run the latest bulk-import migration, then try again."
        : error.message,
      "error",
    );
    return;
  }

  const changedRows = Array.isArray(data) ? data : [];
  const changedById = new Map(changedRows.map((row) => [row.id, row]));
  application.catalogues = application.catalogues
    .map((row) => changedById.get(row.id) || row)
    .concat(changedRows.filter((row) => !application.catalogues.some((existing) => existing.id === row.id)))
    .sort((left, right) => left.category.localeCompare(right.category) || left.sort_order - right.sort_order);
  application.modal = null;
  render();
  showToast(`Imported ${plan.counts.insert} new item${plan.counts.insert === 1 ? "" : "s"} and updated ${plan.counts.update}.`, "success");
}

function setBulkImportBusy(form, submitter, busy) {
  form.querySelectorAll("input,select,textarea,button").forEach((control) => {
    control.disabled = busy;
  });
  if (!submitter) return;
  if (!submitter.dataset.originalText) submitter.dataset.originalText = submitter.textContent;
  submitter.textContent = busy ? "Importing items…" : submitter.dataset.originalText;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was blocked.");
}

async function saveCatalogueEntry(form) {
  const data = {};
  try {
    form.querySelectorAll("[data-catalogue-field]").forEach((control) => {
      const key = control.dataset.catalogueField;
      if (control.dataset.kind === "boolean") data[key] = control.checked;
      else if (control.dataset.kind === "number") data[key] = Number(control.value || 0);
      else if (control.dataset.kind === "nullable-number") data[key] = control.value === "" ? null : Number(control.value);
      else if (control.dataset.kind === "json") data[key] = JSON.parse(control.value || "null");
      else if (control.dataset.kind === "string-list") data[key] = [...new Set(control.value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean))];
      else data[key] = control.value;
    });
  } catch (error) {
    showToast(`Invalid JSON: ${error.message}`, "error");
    return;
  }

  if (application.catalogueCategory === "food_dishes") {
    const normalized = normalizeDishCatalogueData(data);
    Object.keys(data).forEach((key) => delete data[key]);
    Object.assign(data, normalized);
  }
  if (application.catalogueCategory === "crafting_materials") {
    if (!data.id) data.id = `MAT-CUSTOM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const normalized = normalizeCraftingMaterialData(data);
    Object.keys(data).forEach((key) => delete data[key]);
    Object.assign(data, normalized);
  }
  if (application.catalogueCategory === "crafting_recipes") {
    if (!data.id) data.id = `REC-CUSTOM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const previousText = String(application.modal.row?.data?.requirementsText || "");
    const normalized = normalizeCraftingRecipeData(data, {
      reparseRequirements: !application.modal.row || previousText !== String(data.requirementsText || ""),
    });
    Object.keys(data).forEach((key) => delete data[key]);
    Object.assign(data, normalized);
    if (data.requirements.length < 1 || data.requirements.length > 4) {
      showToast("Crafting recipes require 1 to 4 material requirement lines.", "error");
      return;
    }
  }

  const existing = application.modal.row;
  setFormBusy(form, true, "Saving…");
  let result;
  if (existing) {
    result = await supabase
      .from("catalogue_entries")
      .update({ data, updated_by: application.session.user.id })
      .eq("id", existing.id)
      .select("id,category,stable_key,sort_order,data,created_at,updated_at")
      .single();
  } else {
    const categoryRows = application.catalogues.filter((row) => row.category === application.catalogueCategory);
    const nextOrder = categoryRows.length
      ? Math.max(...categoryRows.map((row) => row.sort_order)) + 1
      : 0;
    result = await supabase
      .from("catalogue_entries")
      .insert({
        category: application.catalogueCategory,
        stable_key: `${application.catalogueCategory}:${crypto.randomUUID()}`,
        sort_order: nextOrder,
        data,
        created_by: application.session.user.id,
        updated_by: application.session.user.id,
      })
      .select("id,category,stable_key,sort_order,data,created_at,updated_at")
      .single();
  }
  setFormBusy(form, false);
  if (result.error) {
    showToast(result.error.message, "error");
    return;
  }
  if (existing) {
    application.catalogues = application.catalogues.map((row) => row.id === result.data.id ? result.data : row);
  } else {
    application.catalogues.push(result.data);
  }
  application.modal = null;
  render();
  showToast("Catalogue entry saved.", "success");
}

async function deleteCatalogueEntry(entryId) {
  const row = application.catalogues.find((entry) => entry.id === entryId);
  if (!row) return;
  if (!window.confirm(`Delete ${catalogueEntryTitle(row)} from the catalogue?`)) return;
  const { error } = await supabase.from("catalogue_entries").delete().eq("id", entryId);
  if (error) {
    showToast(error.message, "error");
    return;
  }
  application.catalogues = application.catalogues.filter((entry) => entry.id !== entryId);
  render();
  showToast("Catalogue entry deleted.", "success");
}

async function invitePlayer(form) {
  const values = new FormData(form);
  setFormBusy(form, true, "Sending…");
  const { data, error } = await supabase.functions.invoke("invite-player", {
    body: {
      email: String(values.get("email") || "").trim(),
      displayName: String(values.get("displayName") || "").trim(),
    },
  });
  setFormBusy(form, false);
  const message = await functionErrorMessage(error, data);
  if (message) {
    showToast(message, "error");
    return;
  }
  form.reset();
  showToast("Player invitation sent.", "success");
  await loadCampaignData();
  render();
}

async function saveCampaign(form) {
  const values = new FormData(form);
  setFormBusy(form, true, "Saving…");
  const { data, error } = await supabase
    .from("campaign_settings")
    .update({
      name: String(values.get("name") || "").trim(),
      description: String(values.get("description") || "").trim(),
    })
    .eq("id", 1)
    .select("id,name,description,updated_at")
    .single();
  setFormBusy(form, false);
  if (error) {
    showToast(error.message, "error");
    return;
  }
  application.campaign = data;
  render();
  showToast("Campaign details saved.", "success");
}

function handleSheetMessage(event) {
  if (event.origin !== window.location.origin || application.view !== "editor") return;
  const frame = document.getElementById("sheet-frame");
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.data?.type === "amutsu:ready") {
    application.sheetReady = true;
    sendCharacterToSheet();
  }
  if (event.data?.type === "amutsu:state-change" && event.data.state) {
    scheduleCharacterSave(event.data.state);
  }
  if (event.data?.type === "amutsu:flush-complete") {
    const request = application.sheetFlushRequests.get(event.data.requestId);
    if (request) request();
  }
}

function sendCharacterToSheet() {
  const character = activeCharacter();
  const frame = document.getElementById("sheet-frame");
  if (!character || !frame?.contentWindow) return;
  frame.contentWindow.postMessage(
    {
      type: "amutsu:load",
      state: character.state,
      catalogues: buildWorkbookCataloguePayload(application.catalogues),
    },
    window.location.origin,
  );
}

function hasPendingLocalChanges(characterId = application.activeCharacterId) {
  if (!characterId) return false;
  return (
    application.pendingSave?.characterId === characterId ||
    application.activeSave?.characterId === characterId
  );
}

function hasBlockingRemoteUpdate(characterId = application.activeCharacterId) {
  if (!characterId || application.remoteUpdate?.id !== characterId) return false;
  const local = application.characters.find((character) => character.id === characterId);
  return Boolean(local && isNewerCharacterRecord(application.remoteUpdate, local));
}

function pauseCharacterSaveForConflict(remote = application.remoteUpdate) {
  if (!remote || remote.id !== application.activeCharacterId) return;
  application.saveConflict = {
    characterId: remote.id,
    remoteUpdatedAt: remote.updated_at,
  };
  window.clearTimeout(application.saveTimer);
  updateSaveStatus("Save paused: newer changes available", "conflict");
  sendSheetSaveStatus("conflict", "Save paused: newer changes available");
  updateRemoteUpdateInterface();
}

function scheduleCharacterSave(state) {
  const character = activeCharacter();
  if (!character) return;
  application.pendingSave = {
    characterId: character.id,
    state: structuredClone(state),
  };
  window.clearTimeout(application.saveTimer);

  if (hasBlockingRemoteUpdate(character.id)) {
    pauseCharacterSaveForConflict();
    return;
  }

  application.saveConflict = null;
  updateSaveStatus("Saving online…", "saving");
  application.saveTimer = window.setTimeout(flushPendingSave, 500);
}

function requestSheetSaveFlush() {
  const frame = document.getElementById("sheet-frame");
  if (!application.sheetReady || !frame?.contentWindow) return Promise.resolve(false);
  const requestId = ++application.sheetFlushSequence;
  return new Promise((resolve) => {
    const finish = (flushed) => {
      const request = application.sheetFlushRequests.get(requestId);
      if (!request) return;
      window.clearTimeout(request.timeout);
      application.sheetFlushRequests.delete(requestId);
      resolve(flushed);
    };
    const timeout = window.setTimeout(() => finish(false), 500);
    const request = () => finish(true);
    request.timeout = timeout;
    application.sheetFlushRequests.set(requestId, request);
    frame.contentWindow.postMessage(
      { type: "amutsu:flush-request", requestId },
      window.location.origin,
    );
  });
}

async function capturePendingSheetStateForConflict(characterId) {
  await requestSheetSaveFlush();
  if (application.activeCharacterId !== characterId || !hasBlockingRemoteUpdate(characterId)) return;
  if (application.pendingSave?.characterId === characterId) pauseCharacterSaveForConflict();
}

async function flushOpenCharacterSave() {
  await requestSheetSaveFlush();
  return flushPendingSave();
}

async function flushPendingSave() {
  window.clearTimeout(application.saveTimer);
  if (application.savePromise) {
    const saved = await application.savePromise;
    if (saved && application.pendingSave) return flushPendingSave();
    return saved;
  }
  if (!application.pendingSave) return true;
  if (!application.session) return false;

  const pending = application.pendingSave;
  if (hasBlockingRemoteUpdate(pending.characterId)) {
    pauseCharacterSaveForConflict();
    return false;
  }

  const local = application.characters.find((character) => character.id === pending.characterId);
  if (!local?.updated_at) {
    updateSaveStatus("Online save failed", "error");
    sendSheetSaveStatus("error", "Online save failed");
    return false;
  }

  application.pendingSave = null;
  application.activeSave = {
    characterId: pending.characterId,
    expectedUpdatedAt: local.updated_at,
  };
  const savePromise = saveCharacterState(pending, local.updated_at);
  application.savePromise = savePromise;
  let saved = false;
  try {
    saved = await savePromise;
  } finally {
    if (application.savePromise === savePromise) application.savePromise = null;
    if (application.activeSave?.characterId === pending.characterId) application.activeSave = null;
  }
  if (saved && application.pendingSave) return flushPendingSave();
  return saved;
}

async function saveCharacterState(pending, expectedUpdatedAt) {
  const name = String(pending.state?.character?.name || "").trim() || "Unnamed Character";
  let data;
  let error;
  try {
    ({ data, error } = await supabase
      .from("characters")
      .update({
        name,
        state: pending.state,
        updated_by: application.session.user.id,
      })
      .eq("id", pending.characterId)
      .eq("updated_at", expectedUpdatedAt)
      .select(characterSelect)
      .maybeSingle());
  } catch (caughtError) {
    error = caughtError;
  }

  if (error) {
    if (!application.pendingSave) application.pendingSave = pending;
    updateSaveStatus("Online save failed", "error");
    sendSheetSaveStatus("error", "Online save failed");
    showToast(error.message, "error");
    return false;
  }

  if (!data) {
    const { data: latest, error: versionError } = await fetchLatestCharacterVersion(pending.characterId);
    if (!application.pendingSave) application.pendingSave = pending;
    if (versionError) {
      updateSaveStatus("Online save failed", "error");
      sendSheetSaveStatus("error", "Online save failed");
      showToast(versionError.message, "error");
      return false;
    }
    if (latest && isNewerCharacterRecord(latest, { updated_at: expectedUpdatedAt })) {
      registerRemoteCharacterUpdate(latest, { source: "save-conflict" });
      pauseCharacterSaveForConflict(latest);
      return false;
    }
    updateSaveStatus("Character is no longer editable", "error");
    sendSheetSaveStatus("error", "Character is no longer editable");
    showToast("The character changed or is no longer editable. Reload the campaign before saving again.", "error");
    return false;
  }

  replaceCharacter(data);
  if (!hasBlockingRemoteUpdate(data.id)) {
    application.remoteUpdate = null;
    application.saveConflict = null;
  }
  updateRemoteUpdateInterface();
  updateSaveStatus("Saved online", "saved");
  sendSheetSaveStatus("saved", "Saved online");
  return true;
}

function realtimeStatusLabel() {
  return {
    connecting: "Live updates connecting",
    connected: "Live updates connected",
    error: "Live updates reconnecting",
    closed: "Live updates offline",
    idle: "Live updates idle",
  }[application.realtimeStatus] || "Live updates connecting";
}

function synchronizeCharacterMonitoring() {
  const characterId =
    !application.loading &&
    application.session &&
    !application.passwordFlow &&
    !application.setupError &&
    application.view === "editor"
      ? application.activeCharacterId
      : null;

  if (!characterId) {
    stopCharacterMonitoring();
    return;
  }

  if (application.realtimeCharacterId === characterId && application.realtimeChannel) {
    startCharacterPolling();
    updateRemoteUpdateInterface();
    return;
  }

  stopCharacterMonitoring();
  startCharacterPolling();

  const generation = ++application.realtimeGeneration;
  application.realtimeCharacterId = characterId;
  application.realtimeStatus = "connecting";
  const channel = supabase
    .channel(`character-updates:${characterId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "characters",
        filter: `id=eq.${characterId}`,
      },
      handleRealtimeCharacterUpdate,
    )
    .subscribe((status) => {
      if (generation !== application.realtimeGeneration || characterId !== application.realtimeCharacterId) return;
      application.realtimeStatus = {
        SUBSCRIBED: "connected",
        CHANNEL_ERROR: "error",
        TIMED_OUT: "error",
        CLOSED: "closed",
      }[status] || "connecting";
      updateRemoteUpdateInterface();
      if (status === "SUBSCRIBED") {
        void checkForRemoteCharacterUpdate({ force: true, reason: "realtime-connected" });
      }
    });
  application.realtimeChannel = channel;
  updateRemoteUpdateInterface();
}

function stopCharacterMonitoring() {
  window.clearInterval(application.pollingTimer);
  application.pollingTimer = null;
  application.lastAutomaticUpdateCheckAt = 0;
  application.realtimeGeneration += 1;
  const channel = application.realtimeChannel;
  application.realtimeChannel = null;
  application.realtimeCharacterId = null;
  application.realtimeStatus = "idle";
  if (channel) void supabase.removeChannel(channel);
  updateRemoteUpdateInterface();
}

function startCharacterPolling() {
  if (application.pollingTimer) return;
  application.pollingTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void checkForRemoteCharacterUpdate({ reason: "poll" });
  }, application.pollingIntervalMs);
}

function handleRealtimeCharacterUpdate(payload) {
  const remote = payload?.new;
  if (!remote?.id || remote.id !== application.activeCharacterId) return;
  if (
    application.activeSave?.characterId === remote.id &&
    remote.updated_by === application.session?.user?.id
  ) {
    return;
  }
  registerRemoteCharacterUpdate(remote, { source: "realtime" });
}

function registerRemoteCharacterUpdate(remote, { source = "unknown" } = {}) {
  const local = activeCharacter();
  if (!remote?.id || !local || remote.id !== local.id || !isNewerCharacterRecord(remote, local)) {
    return false;
  }

  if (!application.remoteUpdate || isNewerCharacterRecord(remote, application.remoteUpdate)) {
    application.remoteUpdate = remote;
  }

  const version = String(application.remoteUpdate.updated_at || "");
  if (application.lastToastedRemoteVersions.get(remote.id) !== version) {
    application.lastToastedRemoteVersions.set(remote.id, version);
    showToast("Newer character changes are available.");
  }

  if (hasPendingLocalChanges(remote.id)) pauseCharacterSaveForConflict(application.remoteUpdate);
  updateRemoteUpdateInterface();
  if (source !== "save-conflict") void capturePendingSheetStateForConflict(remote.id);
  return true;
}

function handleVisibilityChange() {
  rememberPortalLocation();
  if (document.visibilityState === "hidden") {
    void flushOpenCharacterSave();
    return;
  }
  if (document.visibilityState === "visible") {
    void checkForRemoteCharacterUpdate({ force: true, reason: "visibility" });
  }
}

function handleWindowFocus() {
  if (document.visibilityState !== "visible") return;
  void checkForRemoteCharacterUpdate({ reason: "focus" });
}

function handlePageHide() {
  rememberPortalLocation();
  void flushOpenCharacterSave();
}

async function fetchLatestCharacterVersion(characterId) {
  return supabase
    .from("characters")
    .select("id,updated_at,updated_by")
    .eq("id", characterId)
    .maybeSingle();
}

async function fetchLatestCharacterRecord(characterId) {
  return supabase
    .from("characters")
    .select(characterSelect)
    .eq("id", characterId)
    .maybeSingle();
}

async function checkForRemoteCharacterUpdate({ announce = false, force = false, reason = "automatic" } = {}) {
  if (application.updateCheckPromise) {
    const existingResult = await application.updateCheckPromise;
    if (announce) announceUpdateCheckResult(existingResult);
    return existingResult;
  }
  if (application.view !== "editor" || !application.session || !activeCharacter()) {
    const skipped = { status: "skipped" };
    if (announce) announceUpdateCheckResult(skipped);
    return skipped;
  }

  const now = Date.now();
  if (!force && now - application.lastAutomaticUpdateCheckAt < 2_000) {
    return { status: "throttled" };
  }
  application.lastAutomaticUpdateCheckAt = now;
  application.checkingForUpdates = true;
  updateRemoteUpdateInterface();
  const checkPromise = performRemoteCharacterUpdateCheck(reason).catch((error) => ({
    status: "error",
    error,
  }));
  application.updateCheckPromise = checkPromise;
  let result;
  try {
    result = await checkPromise;
  } finally {
    if (application.updateCheckPromise === checkPromise) application.updateCheckPromise = null;
    application.checkingForUpdates = false;
    updateRemoteUpdateInterface();
  }
  if (announce) announceUpdateCheckResult(result);
  return result;
}

async function performRemoteCharacterUpdateCheck(reason) {
  const local = activeCharacter();
  if (!local) return { status: "skipped" };

  const { data, error } = await fetchLatestCharacterVersion(local.id);
  if (error) return { status: "error", error };
  if (!data) return { status: "unavailable" };

  if (isNewerCharacterRecord(data, local)) {
    registerRemoteCharacterUpdate(data, { source: reason });
    return { status: "updated", character: data };
  }

  if (application.remoteUpdate?.id === local.id) {
    application.remoteUpdate = null;
    application.saveConflict = null;
  }
  updateRemoteUpdateInterface();
  return { status: "current" };
}

function announceUpdateCheckResult(result) {
  if (result?.status === "updated" || result?.status === "throttled") return;
  if (result?.status === "current") {
    showToast("This character is up to date.");
    return;
  }
  if (result?.status === "unavailable") {
    showToast("This character is no longer available to this account.", "error");
    return;
  }
  if (result?.status === "error") {
    showToast(result.error?.message || "Updates could not be checked.", "error");
  }
}

function discardPendingCharacterSave(characterId) {
  window.clearTimeout(application.saveTimer);
  if (application.pendingSave?.characterId === characterId) application.pendingSave = null;
  application.saveConflict = null;
}

async function loadRemoteCharacterUpdate() {
  const result = await checkForRemoteCharacterUpdate({ force: true, reason: "load-request" });
  if (result.status !== "updated" || !application.remoteUpdate) {
    if (result.status === "current") showToast("This character is already up to date.");
    else if (result.status !== "skipped") announceUpdateCheckResult(result);
    return;
  }

  const remoteId = application.remoteUpdate.id;
  await requestSheetSaveFlush();
  if (application.savePromise) await application.savePromise;

  if (application.activeCharacterId !== remoteId) return;

  const local = activeCharacter();
  let remote;
  let error;
  try {
    ({ data: remote, error } = await fetchLatestCharacterRecord(remoteId));
  } catch (caughtError) {
    error = caughtError;
  }
  if (error) {
    showToast(error.message || "The newer character could not be loaded.", "error");
    return;
  }
  if (!remote) {
    showToast("This character is no longer available to this account.", "error");
    return;
  }
  if (!isNewerCharacterRecord(remote, local)) {
    application.remoteUpdate = null;
    application.saveConflict = null;
    updateRemoteUpdateInterface();
    showToast("This character is already up to date.");
    return;
  }

  if (hasPendingLocalChanges(remote.id)) {
    const confirmed = window.confirm(
      "Loading the newer character will discard the unsaved edits currently paused in this tab. Continue?",
    );
    if (!confirmed) {
      pauseCharacterSaveForConflict(remote);
      return;
    }
    discardPendingCharacterSave(remote.id);
  }

  replaceCharacter(remote);
  application.remoteUpdate = null;
  application.saveConflict = null;
  updateRemoteUpdateInterface();
  updateEditorCharacterLabels(remote);
  sendCharacterToSheet();
  updateSaveStatus("Saved online", "saved");
  sendSheetSaveStatus("saved", "Saved online");
  showToast("Newer character changes loaded.");
}

function updateEditorCharacterLabels(character) {
  const contextName = root.querySelector(".editor-context strong");
  const pageTitle = root.querySelector(".portal-header h1");
  const frame = document.getElementById("sheet-frame");
  if (contextName) contextName.textContent = character.name;
  if (pageTitle) pageTitle.textContent = character.name;
  if (frame) frame.title = `${character.name} character sheet`;
}

function sendSheetSaveStatus(status, message) {
  const frame = document.getElementById("sheet-frame");
  frame?.contentWindow?.postMessage(
    { type: "amutsu:save-status", status, message },
    window.location.origin,
  );
}

function updateSaveStatus(message, state) {
  const element = document.getElementById("online-save-state");
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function replaceCharacter(character) {
  application.characters = application.characters.map((entry) => entry.id === character.id ? character : entry);
}

function activeCharacter() {
  return application.characters.find((character) => character.id === application.activeCharacterId) || null;
}

function ownerProfile(ownerId) {
  return application.profiles.find((profile) => profile.id === ownerId) || null;
}

function characterDescription(character) {
  const details = character.state?.character || {};
  return [details.race, details.className, details.level ? `Level ${details.level}` : ""].filter(Boolean).join(" · ") || "Amutsu character record";
}

function catalogueEntryTitle(row) {
  const data = row.data || {};
  return data.name || data.id || data.rule || data.title || row.stable_key;
}

function catalogueEntrySummary(row) {
  const data = row.data || {};
  const title = catalogueEntryTitle(row);
  const values = Object.values(data)
    .filter((value) => typeof value === "string" && value && value !== title)
    .slice(0, 2);
  return values.join(" · ").slice(0, 220) || `${Object.keys(data).length} editable fields`;
}

function setFormBusy(form, busy, text) {
  form.querySelectorAll("input,select,textarea,button").forEach((control) => {
    control.disabled = busy;
  });
  const submit = form.querySelector('[type="submit"]');
  if (!submit) return;
  if (!submit.dataset.originalText) submit.dataset.originalText = submit.textContent;
  submit.textContent = busy ? text || "Working…" : submit.dataset.originalText;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "is-error" : "is-success"}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function friendlyError(error) {
  return error?.message || String(error || "Unknown error");
}

async function functionErrorMessage(error, data) {
  if (data?.error) return data.error;
  if (!error) return "";
  try {
    if (error.context instanceof Response) {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    }
  } catch {
    // Fall back to the connector's message when the response is not JSON.
  }
  return error.message || "The invitation could not be sent.";
}

function formatDate(value) {
  if (!value) return "just now";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
