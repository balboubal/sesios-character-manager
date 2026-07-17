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

const root = document.getElementById("app");
const toastRegion = document.getElementById("toast-region");
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
  loadVersion: 0,
};

root.addEventListener("click", handleClick);
root.addEventListener("submit", handleSubmit);
root.addEventListener("change", handleChange);
root.addEventListener("input", handleInput);
window.addEventListener("message", handleSheetMessage);
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

  supabase.auth.onAuthStateChange((event, session) => {
    application.session = session;
    if (event === "PASSWORD_RECOVERY") application.passwordFlow = true;
    window.setTimeout(() => synchronizeSession(), 0);
  });
}

async function synchronizeSession() {
  const version = ++application.loadVersion;
  application.loading = true;
  application.setupError = null;
  render();

  if (!application.session) {
    application.profile = null;
    application.profiles = [];
    application.characters = [];
    application.catalogues = [];
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
      .select("id,owner_id,name,state,created_at,updated_at")
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

  if (
    application.activeCharacterId &&
    !application.characters.some((character) => character.id === application.activeCharacterId)
  ) {
    application.activeCharacterId = null;
    application.view = "characters";
  }
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
    return;
  }
  if (!application.session) {
    renderLogin();
    return;
  }
  if (application.passwordFlow) {
    renderPasswordSetup();
    return;
  }
  if (application.setupError) {
    renderSetupError();
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
        <p>Run the two SQL files in <code>supabase/migrations</code> in filename order, then reload this page.</p>
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
        ${ownerSelect}
      </div>
      <iframe class="sheet-frame" id="sheet-frame" src="/sheet/index.html?embedded=1" title="${escapeHtml(character.name)} character sheet"></iframe>
    </section>`;
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
      <button class="button button-primary" type="button" data-action="new-catalogue-entry">Add ${escapeHtml(catalogueSingular(application.catalogueCategory))}</button>
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
  const data = application.modal.data;
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

function renderCatalogueField(key, value) {
  const label = titleCase(key);
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
    application.view = viewButton.dataset.view;
    application.modal = null;
    render();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "sign-out") {
    await flushPendingSave();
    await supabase.auth.signOut();
    return;
  }
  if (action === "retry-setup") {
    await synchronizeSession();
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
      render();
      return;
    }
    application.modal = { type: "character" };
    render();
    return;
  }
  if (action === "open-character") {
    await flushPendingSave();
    application.activeCharacterId = button.dataset.characterId;
    application.view = "editor";
    render();
    return;
  }
  if (action === "delete-character") {
    await deleteCharacter(button.dataset.characterId);
    return;
  }
  if (action === "close-modal") {
    if (event.target.closest("[data-modal-panel]") && event.target === button.closest("[data-modal-panel]")) return;
    application.modal = null;
    render();
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
    .select("id,owner_id,name,state,created_at,updated_at")
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
  }
  render();
  showToast(`${character.name} was permanently deleted.`, "success");
}

async function changeCharacterOwner(characterId, ownerId) {
  const { data, error } = await supabase
    .from("characters")
    .update({ owner_id: ownerId, updated_by: application.session.user.id })
    .eq("id", characterId)
    .select("id,owner_id,name,state,created_at,updated_at")
    .single();
  if (error) {
    showToast(error.message, "error");
    render();
    return;
  }
  replaceCharacter(data);
  showToast("Character owner updated.", "success");
}

async function saveCatalogueEntry(form) {
  const data = {};
  try {
    form.querySelectorAll("[data-catalogue-field]").forEach((control) => {
      const key = control.dataset.catalogueField;
      if (control.dataset.kind === "boolean") data[key] = control.checked;
      else if (control.dataset.kind === "number") data[key] = Number(control.value || 0);
      else if (control.dataset.kind === "json") data[key] = JSON.parse(control.value || "null");
      else data[key] = control.value;
    });
  } catch (error) {
    showToast(`Invalid JSON: ${error.message}`, "error");
    return;
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

function scheduleCharacterSave(state) {
  const character = activeCharacter();
  if (!character) return;
  application.pendingSave = {
    characterId: character.id,
    state: structuredClone(state),
  };
  updateSaveStatus("Saving online…", "saving");
  window.clearTimeout(application.saveTimer);
  application.saveTimer = window.setTimeout(flushPendingSave, 500);
}

async function flushPendingSave() {
  window.clearTimeout(application.saveTimer);
  if (!application.pendingSave || !application.session) return;
  const pending = application.pendingSave;
  application.pendingSave = null;
  const name = String(pending.state?.character?.name || "").trim() || "Unnamed Character";
  const { data, error } = await supabase
    .from("characters")
    .update({
      name,
      state: pending.state,
      updated_by: application.session.user.id,
    })
    .eq("id", pending.characterId)
    .select("id,owner_id,name,state,created_at,updated_at")
    .single();

  if (error) {
    application.pendingSave = pending;
    updateSaveStatus("Online save failed", "error");
    sendSheetSaveStatus("error", "Online save failed");
    showToast(error.message, "error");
    return;
  }
  replaceCharacter(data);
  updateSaveStatus("Saved online", "saved");
  sendSheetSaveStatus("saved", "Saved online");
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
