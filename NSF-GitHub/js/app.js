// ─── app.js ─────────────────────────────────────────────────────────────────
// NoteSoFast v2 — kräver att config.js och service-filerna laddats först.

// ── Services ─────────────────────────────────────────────────────────────────
const storage       = new StorageService();
const recorder      = new RecordingService();
const transcription = new TranscriptionService({ enabled: FEATURES.transcription });

// ── DOM-refs ──────────────────────────────────────────────────────────────────
const quickCaptureInput  = document.querySelector("#quick-capture-input");
const captureBtn         = document.querySelector("#capture-btn");
const recordBtn          = document.querySelector("#record-btn");
const saveStatusEl       = document.querySelector("#save-status");
const searchInput        = document.querySelector("#search-input");
const brandMark          = document.querySelector("#brand-mark");
const brandPopup         = document.querySelector("#brand-popup");

const rootTree           = document.querySelector("#root-tree");
const projectList        = document.querySelector("#project-list");
const addProjectBtn      = document.querySelector("#add-project-btn");
const exportBtn          = document.querySelector("#export-btn");
const importFileInput    = document.querySelector("#import-file-input");

const emptyState         = document.querySelector("#empty-state");
const workspaceView      = document.querySelector("#workspace-view");
const workspaceTitle     = document.querySelector("#workspace-title");
const workspaceMeta      = document.querySelector("#workspace-meta");
const workspaceCount     = document.querySelector("#workspace-count");
const workspaceColumns   = document.querySelector(".workspace-columns");

const noteGrid           = document.querySelector("#note-grid");
const noteView           = document.querySelector("#note-view");
const noteTitle          = document.querySelector("#note-title");
const noteMeta           = document.querySelector("#note-meta");
const noteContent        = document.querySelector("#note-content");
// note-edit-toggle borttagen — redigering startar direkt vid klick
const noteEditor         = document.querySelector("#note-editor");
const noteEditorActionsTop = document.querySelector("#note-editor-actions-top");
const editNoteBody       = document.querySelector("#edit-note-body");
const doneNoteEdit       = document.querySelector("#done-note-edit");

const kanbanBoard        = document.querySelector("#kanban-board");

const recordingPanel     = document.querySelector("#recording-panel");
const recordingElapsed   = document.querySelector("#recording-elapsed");
const recordingStatus    = document.querySelector("#recording-status");

const attachmentsSection = document.querySelector("#attachments-section");
const attachmentList     = document.querySelector("#attachment-list");

const kanbanBackdrop     = document.querySelector("#kanban-backdrop");
const noteModalClose     = document.querySelector("#note-modal-close");

const folderPicker       = document.querySelector("#folder-picker");
const folderPickerHeader = document.querySelector("#folder-picker-header");
const folderPickerList   = document.querySelector("#folder-picker-list");

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  notes:             [],
  projects:          [],
  areas:             [],
  selectedRoot:      "inbox",
  selectedProjectId: null,
  selectedAreaId:    null,
  selectedNoteId:    null,
  editingNoteId:     null,
  draggingNoteId:    null,
  autosaveTimer:     null,
  objectUrls:        [],
  kbLevel:           "notes",   // "notes" | "folders" | "roots"
  kbFocusedId:       null,
};

const BRAND_MESSAGES = [
  "Sluta knappa runt och lek. Skriv ner det som ar viktigt i stallet.",
  "Fanga tanken direkt innan den forsvinner.",
  "En snabb not nu sparar dig tio minuters letande senare.",
  "Inbox ar till for att fa in saker snabbt. Sortera sen.",
];

let brandMessageIndex = 0;
let brandPopupTimer = null;

// Typeahead-sökning från sidebaren (bokstavstangenter → sök bland noter)
let sidebarTypeBuffer = "";
let sidebarTypeTimer  = null;

// Tillbaka-navigering: minns var man var när man lämnade notes-nivån
let navReturn     = null;  // { root, areaId, noteId }
let navReturnTime = 0;
const NAV_RETURN_MS = 25000; // 25 sekunder

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await storage.init();
    await migrateFromV1();

    state.notes    = await storage.getAllNotes();
    state.projects = await storage.getAllProjects();
    state.areas    = await storage.getAllAreas();

    setupMobileUI();
    bindEvents();
    selectRoot("inbox");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    // ── Sync (Firebase) ────────────────────────────────────────────────────
    syncService.onAuthChange = (user) => {
      renderSyncStatus(user);
      if (user) {
        // Rita om vyn med de nyimporterade remote-noterna
        renderSidebar();
        renderCurrentView();
      }
    };
    syncService.init(window.FIREBASE_CONFIG);
    renderSyncStatus(null); // visa "Sign in"-knapp direkt

  } catch (err) {
    console.error("NoteSoFast bootstrap error:", err);
  }
}

function renderSyncStatus(user) {
  const el = document.getElementById("sidebar-sync");
  if (!el) return;
  if (!window.FIREBASE_CONFIG?.apiKey) {
    el.innerHTML = ""; // Ingen Firebase-config — dölj hela blocket
    return;
  }
  if (user) {
    el.innerHTML = `
      <div class="sync-signed-in">
        <span class="sync-avatar">${(user.displayName ?? user.email ?? "?")[0].toUpperCase()}</span>
        <span class="sync-name">${user.displayName ?? user.email}</span>
        <button class="sync-signout-btn" id="sync-signout-btn">Sign out</button>
      </div>`;
    document.getElementById("sync-signout-btn").addEventListener("click", () => syncService.signOut());
  } else {
    el.innerHTML = `
      <button class="sync-signin-btn" id="sync-signin-btn">
        ↗ Sync between devices
      </button>`;
    document.getElementById("sync-signin-btn").addEventListener("click", () =>
      syncService.signIn().catch(e => console.warn("Sign-in avbröts:", e))
    );
  }
}

// ── Mobil-UI ──────────────────────────────────────────────────────────────────
function isMobile() { return window.innerWidth <= 768; }

function setupMobileUI() {
  if (!isMobile()) return;

  // ── Backdrop för sidebar ──
  const backdrop = document.createElement("div");
  backdrop.className = "mobile-sidebar-backdrop";
  backdrop.id = "mobile-sidebar-backdrop";
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", closeMobileSidebar);

  // Cancel-knapp inuti sidebar
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "mobile-sidebar-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeMobileSidebar);
  document.querySelector(".sidebar").appendChild(cancelBtn);

  // ── Toppbar: ersätt med menyknapp vänster + logo ──
  const topBar = document.querySelector(".top-bar");
  const menuBtn = document.createElement("button");
  menuBtn.className = "mobile-menu-btn";
  menuBtn.id = "mobile-menu-btn";
  menuBtn.setAttribute("aria-label", "Meny");
  menuBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5"  width="16" height="1.8" rx="0.9" fill="currentColor"/>
    <rect x="2" y="9.1" width="16" height="1.8" rx="0.9" fill="currentColor"/>
    <rect x="2" y="13.2" width="16" height="1.8" rx="0.9" fill="currentColor"/>
  </svg>`;
  menuBtn.addEventListener("click", openMobileSidebar);
  topBar.prepend(menuBtn);

  // Göm originella top-right-group (quick capture + knappar)
  topBar.querySelector(".top-right-group")?.style.setProperty("display", "none");

  // ── Bottom bar: Record ──
  const bottomBar = document.createElement("div");
  bottomBar.className = "mobile-bottom-bar";
  bottomBar.id = "mobile-bottom-bar";
  bottomBar.innerHTML = `
    <button class="mobile-record-btn" id="mobile-record-btn">Record</button>
  `;
  document.body.appendChild(bottomBar);
  bottomBar.querySelector("#mobile-record-btn").addEventListener("click", () => toggleRecording());

  // ── Tillbaka-knapp i note-header ──
  const noteHeader = document.querySelector(".note-header");
  const backBtn = document.createElement("button");
  backBtn.className = "note-header-back";
  backBtn.id = "note-header-back";
  backBtn.innerHTML = "← Back";
  backBtn.addEventListener("click", closeMobileNote);
  noteHeader.prepend(backBtn);
}

// Inject capture-widget överst i workspace (mobil)
function renderMobileCaptureWidget() {
  if (!isMobile()) return;
  // Ta bort ev. existerande
  document.querySelector(".mobile-capture-widget")?.remove();

  // Bygg platsrubrik (liten, sekundär)
  const root     = ROOTS.find(r => r.id === state.selectedRoot);
  const areaName = state.selectedAreaId
    ? state.areas.find(a => a.id === state.selectedAreaId)?.name
    : null;
  const locationLabel = areaName ?? root?.label ?? "";

  const aggregated      = isAggregatedView();
  const existingFolders = aggregated ? getFolders(state.selectedRoot) : [];

  const widget = document.createElement("div");
  widget.className = "mobile-capture-widget";
  widget.innerHTML = `
    <textarea class="mobile-capture-textarea" placeholder="Write before it disappears..." rows="3"></textarea>
    <p class="mobile-capture-location">${esc(locationLabel)}</p>
    ${aggregated ? `
      <div class="mobile-capture-folder-picker hidden">
        <p class="mobile-capture-folder-label">Save to folder:</p>
        <div class="mobile-capture-folder-chips">
          ${existingFolders.map(f => `<button class="mobile-capture-chip" data-area-id="${esc(f.id)}" type="button">${esc(f.name)}</button>`).join("")}
          <button class="mobile-capture-chip mobile-capture-chip-new" type="button">+ New folder</button>
        </div>
        <input class="mobile-capture-folder-input hidden" type="text" placeholder="Folder name…" />
      </div>` : ""}
    <button class="mobile-capture-done" type="button">Done — Save note</button>
  `;

  const textarea      = widget.querySelector(".mobile-capture-textarea");
  const doneBtn       = widget.querySelector(".mobile-capture-done");
  const folderPicker  = widget.querySelector(".mobile-capture-folder-picker");
  const folderInput   = widget.querySelector(".mobile-capture-folder-input");

  let selectedAreaId = null;

  if (aggregated) {
    // Välj befintlig mapp
    widget.querySelectorAll(".mobile-capture-chip:not(.mobile-capture-chip-new)").forEach(chip => {
      chip.addEventListener("click", () => {
        widget.querySelectorAll(".mobile-capture-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        selectedAreaId = chip.dataset.areaId;
        folderInput.classList.add("hidden");
        folderInput.value = "";
      });
    });
    // Skapa ny mapp
    widget.querySelector(".mobile-capture-chip-new")?.addEventListener("click", () => {
      widget.querySelectorAll(".mobile-capture-chip").forEach(c => c.classList.remove("selected"));
      widget.querySelector(".mobile-capture-chip-new").classList.add("selected");
      selectedAreaId = null;
      folderInput.classList.remove("hidden");
      folderInput.focus();
    });
  }

  textarea.addEventListener("input", () => {
    const hasText = textarea.value.trim().length > 0;
    doneBtn.classList.toggle("visible", hasText);
    if (folderPicker) folderPicker.classList.toggle("hidden", !hasText);
    // Autogrow
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });

  doneBtn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text || doneBtn.disabled) return;
    doneBtn.disabled = true;
    doneBtn.textContent = "Saving…";

    if (aggregated) {
      // No folder selected → highlight picker
      if (!selectedAreaId && !folderInput?.value.trim()) {
        folderPicker.style.outline = "2px solid var(--c-accent)";
        folderPicker.style.borderRadius = "8px";
        doneBtn.disabled = false;
        doneBtn.textContent = "Done — Save note";
        return;
      }
      folderPicker.style.outline = "";

      let areaId = selectedAreaId;
      if (!areaId) {
        const area = { id: crypto.randomUUID(), name: folderInput.value.trim(), rootId: state.selectedRoot, createdAt: new Date().toISOString() };
        await storage.saveArea(area);
        state.areas.push(area);
        areaId = area.id;
        renderSidebar();
      }
      state.selectedAreaId = areaId;
      textarea.value = "";
      textarea.style.height = "auto";
      doneBtn.disabled = false;
      doneBtn.textContent = "Done — Save note";
      doneBtn.classList.remove("visible");
      folderPicker.classList.add("hidden");
      selectedAreaId = null;
      const note = await createNoteInRoot(state.selectedRoot, { content: `<p>${text.replace(/\n/g, "</p><p>")}</p>`, areaId }, { open: false });
      document.querySelector(`[data-id="${note.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    textarea.value = "";
    textarea.style.height = "auto";
    doneBtn.disabled = false;
    doneBtn.textContent = "Done — Save note";
    doneBtn.classList.remove("visible");
    const note = await createNoteInRoot(
      state.selectedRoot,
      { content: `<p>${text.replace(/\n/g, "</p><p>")}</p>`, areaId: state.selectedAreaId ?? null },
      { open: false }
    );
    document.querySelector(`[data-id="${note.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Sätt in längst upp i workspace, före workspace-header
  const workspaceView = document.querySelector("#workspace-view");
  workspaceView?.prepend(widget);
}

function openMobileSidebar() {
  document.querySelector(".sidebar").classList.add("mobile-open");
  document.querySelector("#mobile-sidebar-backdrop")?.classList.add("visible");
}

function closeMobileSidebar() {
  document.querySelector(".sidebar").classList.remove("mobile-open");
  document.querySelector("#mobile-sidebar-backdrop")?.classList.remove("visible");
}

function openMobileNote() {
  if (!isMobile()) return;
  document.querySelector("#note-view").classList.add("mobile-note-open");
}

function closeMobileNote() {
  // I kanban-läge: stäng modalen ordentligt (sparar, rensar backdrop etc.)
  if (noteView.classList.contains("kanban-modal")) {
    closeKanbanModal();
  }
  noteView.classList.remove("mobile-note-open");
  state.selectedNoteId = null;
  document.querySelectorAll(".note-card").forEach(el => el.classList.remove("active"));
}

// ── Datamigrering v1 → v2 ────────────────────────────────────────────────────
async function migrateFromV1() {
  if (localStorage.getItem("nsf-migrated-v2")) return;

  const rawNotebooks = localStorage.getItem("evernote-arkiv-notebooks-v2");
  const rawSpaces    = localStorage.getItem("evernote-arkiv-spaces-v1");
  if (!rawNotebooks) { localStorage.setItem("nsf-migrated-v2", "1"); return; }

  const notebooks = JSON.parse(rawNotebooks) ?? [];
  const spaces    = JSON.parse(rawSpaces)    ?? [];

  let oldNotes = [];
  try { oldNotes = await readOldIndexedDB(); } catch (_) {}

  // Areas från gamla notebooks
  const areaMap = {};
  for (const nb of notebooks) {
    if (nb.rootId !== "area") continue;
    await storage.saveArea({ id: nb.id, name: nb.name, createdAt: nb.createdAt ?? new Date().toISOString() });
    areaMap[nb.id] = nb.id;
  }

  // Projects från gamla spaces
  const projectMap = {};
  for (const sp of spaces) {
    await storage.saveProject({ id: sp.id, name: sp.name, createdAt: sp.createdAt ?? new Date().toISOString() });
    projectMap[sp.id] = sp.id;
  }

  // Migrera noter
  const rootMap = { inbox: "inbox", projects: "drafts", area: "area", resource: "resource", archive: "archive" };
  for (const note of oldNotes) {
    const nb        = notebooks.find(n => n.id === note.notebookId);
    const oldRootId = nb?.rootId ?? "inbox";
    const newRootId = note.spaceId ? "projects" : (rootMap[oldRootId] ?? "inbox");

    await storage.saveNote(createNote({
      id:         note.id,
      title:      note.title      ?? "",
      content:    note.content    ?? "",
      createdAt:  note.createdAt  ?? new Date().toISOString(),
      updatedAt:  note.updatedAt  ?? new Date().toISOString(),
      rootId:     newRootId,
      areaId:     newRootId === "area"     ? (areaMap[note.notebookId]    ?? null) : null,
      projectId:  note.spaceId             ? (projectMap[note.spaceId]    ?? null) : null,
      status:     note.spaceId             ? "inbox"                               : null,
      audioId:    note.audioId    ?? null,
      transcript: note.transcript ?? null,
      resources:  note.resources  ?? [],
    }));
  }

  localStorage.setItem("nsf-migrated-v2", "1");
}

function readOldIndexedDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("evernote-arkiv-v2", 1);
    req.onerror = () => resolve([]);
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("notes")) { resolve([]); return; }
      const get = db.transaction("notes", "readonly").objectStore("notes").getAll();
      get.onsuccess = () => resolve(get.result ?? []);
      get.onerror   = () => resolve([]);
    };
  });
}

// ── Note factory ──────────────────────────────────────────────────────────────
function createNote(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), title: "", content: "",
    createdAt: now, updatedAt: now,
    rootId: "inbox", projectId: null, areaId: null,
    status: null, audioId: null, transcript: null, resources: [],
    ...overrides,
  };
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  brandMark?.addEventListener("click", handleBrandClick);
  document.addEventListener("click", handleBrandOutsideClick);
  // Quick capture — texten hamnar i innehållet, titeln förblir tom ("Namnlös anteckning")
  quickCaptureInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const text = quickCaptureInput.value.trim();
    if (!text) return;
    quickCaptureInput.value = "";
    createNoteInRoot("inbox", { content: `<p>${text}</p>` });
  });

  captureBtn.addEventListener("click", () => startNewNote());
  recordBtn.addEventListener("click",  () => toggleRecording());
  searchInput.addEventListener("input", () => renderCurrentView());

  doneNoteEdit.addEventListener("click", () => commitEdit());

  // Klick på titel eller innehåll startar redigering direkt
  noteTitle.addEventListener("click",   () => { if (!state.editingNoteId) startEditing(state.selectedNoteId); });
  noteContent.addEventListener("click", () => { if (!state.editingNoteId) startEditing(state.selectedNoteId); });

  // Autosave under skrivning (byter INTE tillbaka till read-mode)
  editNoteBody.addEventListener("input", scheduleAutosave);
  noteTitle.addEventListener("input",    scheduleAutosave);

  // Enter i titelfältet → hoppa till anteckningsfältet (istället för radbrytning)
  noteTitle.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    editNoteBody.focus();
    // Placera markören i slutet av befintligt innehåll
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editNoteBody);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  });

  // Editor toolbar
  document.querySelector(".editor-toolbar")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-command]");
    if (!btn) return;
    e.preventDefault();
    document.execCommand(btn.dataset.command, false, null);
    editNoteBody.focus();
  });

  addProjectBtn.addEventListener("click", () => promptCreate("project"));

  // Export / Import
  exportBtn.addEventListener("click", exportData);
  importFileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) importData(files);
    importFileInput.value = ""; // återställ så samma fil kan importeras igen
  });

  // Kanban modal: stäng med X-knapp eller klick på backdrop
  noteModalClose.addEventListener("click", closeKanbanModal);
  kanbanBackdrop.addEventListener("click", closeKanbanModal);

  // Kanban statusväljare: flytta note till vald kolumn
  document.querySelector("#kanban-status-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".kanban-status-btn");
    if (!btn || !state.selectedNoteId) return;
    const note = state.notes.find(n => n.id === state.selectedNoteId);
    if (!note) return;
    note.status    = btn.dataset.status;
    note.updatedAt = new Date().toISOString();
    storage.saveNote(note);
    // Uppdatera aktiv knapp direkt
    document.querySelectorAll(".kanban-status-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.status === note.status)
    );
    renderKanban();
  });

  // Stäng folder-picker
  document.addEventListener("click", (e) => {
    if (!folderPicker.contains(e.target)) closeFolderPicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeFolderPicker(); closeKanbanModal(); }

    // Tangentbordsnavigering — ej aktiv när man skriver
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
    if (state.editingNoteId) return;

    const key = e.key;

    const navRoots = ROOTS.filter(r => r.nav);

    // ── Typeahead från sidebaren ──────────────────────────────────────────────
    // Fånga bokstäver/siffror/mellanslag när vi är i sidebar-nivå
    if (state.kbLevel !== "notes" && key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      sidebarTypeBuffer += key.toLowerCase();
      clearTimeout(sidebarTypeTimer);
      sidebarTypeTimer = setTimeout(() => { sidebarTypeBuffer = ""; }, 3000);

      // Alla ord i bufferten måste finnas någonstans i noten (ej nödvändigtvis intill varandra)
      const words = sidebarTypeBuffer.trim().split(/\s+/).filter(Boolean);
      const match = getVisibleNotes().find(n => {
        const text = ((n.title ?? "") + " " + (n.content ?? "")).toLowerCase().replace(/<[^>]*>/g, " ");
        return words.every(w => text.includes(w));
      });
      if (match) {
        clearKbFocus();              // kbLevel → "notes", ring tas bort
        selectNote(match.id);        // noten blir helröd, sidebaren visar ring
        noteGrid.querySelector(`[data-id="${match.id}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }

    if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(key)) return;

    // Pil nollställer typeahead-bufferten
    sidebarTypeBuffer = "";
    clearTimeout(sidebarTypeTimer);

    e.preventDefault();

    // ── Hjälp: gå in i notes-nivån med ev. tillbaka-minne ────────────────────
    const goToNotes = (rootId, areaId = null) => {
      const fresh = !navReturn
        || (Date.now() - navReturnTime) >= NAV_RETURN_MS
        || navReturn.root !== rootId
        || navReturn.areaId !== areaId;

      selectRoot(rootId, null, areaId);
      clearKbFocus();

      if (!fresh && navReturn.noteId) {
        // Återvänd till exakt samma note
        const restored = state.notes.find(n => n.id === navReturn.noteId);
        if (restored) {
          selectNote(restored.id);
          noteGrid.querySelector(`[data-id="${restored.id}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          navReturn = null;
          return;
        }
      }
      navReturn = null;
      // Annars: hoppa till första note i listan
      const first = getVisibleNotes()[0];
      if (first) {
        selectNote(first.id);
        noteGrid.querySelector(`[data-id="${first.id}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    if (key === "ArrowUp" || key === "ArrowDown") {
      const dir = key === "ArrowDown" ? 1 : -1;

      if (state.kbLevel === "notes") {
        const visible = getVisibleNotes();
        if (!state.selectedNoteId) {
          // Ingen note vald → flytta fokus upp/ned bland sidebar-roots
          const idx  = navRoots.findIndex(r => r.id === state.selectedRoot);
          const next = navRoots[Math.max(0, Math.min(navRoots.length - 1, idx + dir))];
          if (next) setKbFocus("roots", next.id);
          return;
        }
        const idx  = visible.findIndex(n => n.id === state.selectedNoteId);
        const next = visible[idx + dir];
        if (!next) return;
        selectNote(next.id);
        noteGrid.querySelector(`[data-id="${next.id}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

      } else if (state.kbLevel === "folders") {
        const folders = getFolders(state.selectedRoot);
        const idx  = folders.findIndex(f => f.id === state.kbFocusedId);
        const next = folders[Math.max(0, Math.min(folders.length - 1, idx + dir))];
        if (next && next.id !== state.kbFocusedId) setKbFocus("folders", next.id);

      } else if (state.kbLevel === "roots") {
        const idx  = navRoots.findIndex(r => r.id === state.kbFocusedId);
        const next = navRoots[Math.max(0, Math.min(navRoots.length - 1, idx + dir))];
        if (next && next.id !== state.kbFocusedId) setKbFocus("roots", next.id);
      }

    } else if (key === "ArrowLeft") {
      if (state.kbLevel === "notes") {
        // Spara position för tillbaka-navigering
        navReturn     = { root: state.selectedRoot, areaId: state.selectedAreaId, noteId: state.selectedNoteId };
        navReturnTime = Date.now();
        const root    = ROOTS.find(r => r.id === state.selectedRoot);
        const folders = root?.expandable ? getFolders(root.id) : [];
        if (folders.length > 0) {
          setKbFocus("folders", state.selectedAreaId ?? folders[0].id);
        } else {
          setKbFocus("roots", state.selectedRoot);
        }
      } else if (state.kbLevel === "folders") {
        setKbFocus("roots", state.selectedRoot);
      }
      // kbLevel "roots" → inget åt vänster

    } else if (key === "ArrowRight") {
      if (state.kbLevel === "notes") {
        // Från notes-vy utan vald note → välj första note
        if (!state.selectedNoteId) {
          const first = getVisibleNotes()[0];
          if (first) {
            selectNote(first.id);
            noteGrid.querySelector(`[data-id="${first.id}"]`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
        // Note redan vald → ingen åtgärd (höger gör ingenting)

      } else if (state.kbLevel === "roots") {
        const root    = ROOTS.find(r => r.id === state.kbFocusedId);
        if (!root) return;
        const folders = root?.expandable ? getFolders(root.id) : [];
        if (folders.length > 0) {
          // Expanderbar root → switcha till den rooten (renderar undermappar) + gå in i mappnivån
          if (state.selectedRoot !== root.id) {
            state.selectedRoot      = root.id;
            state.selectedAreaId    = null;
            state.selectedNoteId    = null;
            state.editingNoteId     = null;
            renderCurrentView();
          }
          const focusId = (navReturn?.root === root.id && navReturn?.areaId)
            ? (getFolders(root.id).find(f => f.id === navReturn.areaId)?.id ?? folders[0].id)
            : folders[0].id;
          setKbFocus("folders", focusId);
        } else {
          goToNotes(root.id);
        }

      } else if (state.kbLevel === "folders") {
        goToNotes(state.selectedRoot, state.kbFocusedId);
      }

    } else if (key === "Enter") {
      if (state.kbLevel === "folders") {
        goToNotes(state.selectedRoot, state.kbFocusedId);
      } else if (state.kbLevel === "roots") {
        const root    = ROOTS.find(r => r.id === state.kbFocusedId);
        if (!root) return;
        const folders = root?.expandable ? getFolders(root.id) : [];
        if (folders.length > 0) {
          if (state.selectedRoot !== root.id) {
            state.selectedRoot      = root.id;
            state.selectedAreaId    = null;
            state.selectedNoteId    = null;
            state.editingNoteId     = null;
            renderCurrentView();
          }
          const focusId = (navReturn?.root === root.id && navReturn?.areaId)
            ? (getFolders(root.id).find(f => f.id === navReturn.areaId)?.id ?? folders[0].id)
            : folders[0].id;
          setKbFocus("folders", focusId);
        } else {
          goToNotes(root.id);
        }
      }
    }
  });

  recorder.onStateChange = handleRecordingState;
}

function handleBrandClick(event) {
  event.stopPropagation();
  if (!brandPopup) return;
  const message = BRAND_MESSAGES[brandMessageIndex % BRAND_MESSAGES.length];
  brandMessageIndex += 1;
  brandPopup.textContent = message;
  brandPopup.classList.remove("hidden");
  clearTimeout(brandPopupTimer);
  brandPopupTimer = setTimeout(() => {
    brandPopup.classList.add("hidden");
  }, 6200);
}

function handleBrandOutsideClick(event) {
  if (!brandPopup || brandPopup.classList.contains("hidden")) return;
  if (brandMark?.contains(event.target) || brandPopup.contains(event.target)) return;
  brandPopup.classList.add("hidden");
}

// ── Tangentbordsfokus-hjälpare ────────────────────────────────────────────────
function setKbFocus(level, id) {
  state.kbLevel     = level;
  state.kbFocusedId = id;
  // renderSidebar baka nu in kb-focus direkt i klassnamnen — inget manuellt classList.add behövs
  renderSidebar();
  // Sidebar har fokus → aktiv note-card ska visa röd ring, inte solid
  document.querySelectorAll(".note-card.active").forEach(el => el.classList.add("ring"));
  // Scrolla kb-fokuserat element till synhåll
  const sel = level === "roots"
    ? `[data-root-id="${id}"]`
    : `[data-area-id="${id}"]`;
  rootTree.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearKbFocus() {
  // Notes har fokus igen → ta bort ring-stilen från note-cards
  document.querySelectorAll(".note-card").forEach(el => el.classList.remove("ring"));
  state.kbLevel     = "notes";
  state.kbFocusedId = null;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function selectRoot(rootId, projectId = null, areaId = null) {
  const rootDef = ROOTS.find(r => r.id === rootId);

  // Mobil + expanderbar root utan specifik undermapp →
  // expandera bara trädet i sidebaren, stäng den INTE än
  if (isMobile() && rootDef?.expandable && !areaId && !projectId) {
    state.selectedRoot = rootId;
    renderSidebar();
    return;
  }

  state.selectedRoot      = rootId;
  state.selectedProjectId = projectId;
  state.selectedAreaId    = areaId;
  state.selectedNoteId    = null;
  state.editingNoteId     = null;
  state.kbLevel           = "notes";
  state.kbFocusedId       = null;
  document.querySelectorAll(".note-card").forEach(el => el.classList.remove("ring"));

  renderSidebar();
  renderCurrentView();
  closeMobileSidebar();
}

function selectNote(noteId) {
  state.selectedNoteId = noteId;
  state.editingNoteId  = null;

  // Uppdatera aktiv markering
  document.querySelectorAll(".note-card").forEach(el =>
    el.classList.toggle("active", el.dataset.id === noteId)
  );
  document.querySelectorAll(".kanban-card").forEach(el =>
    el.classList.toggle("active", el.dataset.noteId === noteId)
  );

  // Sidebar behöver re-renderas för att uppdatera has-note (ring vs solid)
  renderSidebar();

  renderNoteDetail(noteId);
  openMobileNote(); // på mobil: glida in note från höger

  // Kanban-läge: visa som flytande modal + starta redigering direkt
  if (state.selectedRoot === "projects" && state.selectedProjectId) {
    noteView.classList.add("kanban-modal");
    kanbanBackdrop.classList.remove("hidden");
    // Byt ✕-knapp till "Done"-knapp
    noteModalClose.textContent = "Done";
    noteModalClose.classList.add("done-btn");
    noteModalClose.classList.remove("hidden");
    // Auto-starta redigering
    setTimeout(() => startEditing(noteId), 30);
  } else {
    // Vanligt läge: starta redigering direkt
    setTimeout(() => startEditing(noteId), 30);
  }
}

function closeKanbanModal() {
  // Spara pågående redigering innan stängning (data går aldrig förlorad)
  if (state.editingNoteId) {
    const note = state.notes.find(n => n.id === state.editingNoteId);
    if (note) {
      note.title   = noteTitle.textContent.trim();
      note.content = editNoteBody.innerHTML;
      note.updatedAt = new Date().toISOString();
      storage.saveNote(note);
      refreshNoteCard(note);
    }
  }
  clearTimeout(state.autosaveTimer);
  exitEditMode();

  noteView.classList.add("hidden");
  noteView.classList.remove("kanban-modal");
  kanbanBackdrop.classList.add("hidden");

  // Återställ knappen till ✕ för nästa gång
  noteModalClose.textContent = "✕";
  noteModalClose.classList.remove("done-btn");
  noteModalClose.classList.add("hidden");

  state.selectedNoteId = null;
  document.querySelectorAll(".kanban-card").forEach(el => el.classList.remove("active"));
  renderKanban();
}

function renderCurrentView() {
  const isKanban = state.selectedRoot === "projects" && state.selectedProjectId;

  workspaceColumns.classList.toggle("kanban-mode", isKanban);

  // Stäng eventuell öppen modal när vi byter vy (spara data)
  if (!isKanban && noteView.classList.contains("kanban-modal")) {
    closeKanbanModal();
  }

  document.querySelector(".workspace-list-section").classList.toggle("hidden", isKanban);
  kanbanBoard.classList.toggle("hidden", !isKanban);

  if (isKanban) {
    const project = state.projects.find(p => p.id === state.selectedProjectId);
    workspaceTitle.textContent = project?.name ?? "Project";
    workspaceMeta.textContent  = "";
    workspaceCount.textContent = "";
    showWorkspace();
    renderKanban();
  } else {
    renderNoteList();
  }
}

function showWorkspace() {
  emptyState.classList.add("hidden");
  workspaceView.classList.remove("hidden");
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  rootTree.innerHTML = "";

  for (const root of ROOTS) {
    if (!root.nav) continue; // Projects hanteras separat som sektion

    const count    = countForRoot(root.id);
    const isActive = state.selectedRoot === root.id && !state.selectedProjectId;
    const btn      = document.createElement("button");
    const rootIsActive  = isActive && !state.selectedAreaId;
    const rootKbFocused = state.kbLevel === "roots" && state.kbFocusedId === root.id;
    const rootHasNote   = rootIsActive && !rootKbFocused && !!state.selectedNoteId && (
      state.kbLevel === "notes"
        ? true
        : (state.kbFocusedId != null && state.kbFocusedId !== root.id)
    );
    btn.className = "tree-button"
      + (rootIsActive  ? " active"   : "")
      + (rootHasNote   ? " has-note" : "")
      + (rootKbFocused ? " kb-focus" : "");
    btn.type           = "button";
    btn.dataset.rootId = root.id;
    const isExpanded = root.expandable && state.selectedRoot === root.id;
    const chevron    = root.expandable ? `<span class="tree-chevron">${isExpanded ? "▾" : "▸"}</span>` : "";
    btn.innerHTML    = `<span class="tree-label">${root.label}</span>${chevron}<span class="tree-count">${count || ""}</span>`;
    btn.addEventListener("click",     () => selectRoot(root.id));
    btn.addEventListener("dragover",  handleRootDragOver);
    btn.addEventListener("dragleave", handleRootDragLeave);
    btn.addEventListener("drop",      (e) => handleRootDrop(e, root));

    const node = document.createElement("div");
    node.className = "tree-node";
    node.appendChild(btn);

    // Expandable roots: visa undermappar som barn-items (bara för vald root)
    if (root.expandable && state.selectedRoot === root.id) {
      const folders = getFolders(root.id);
      const childrenEl = document.createElement("div");
      childrenEl.className = "tree-children";

      for (const folder of folders) {
        const count2       = state.notes.filter(n => n.areaId === folder.id).length;
        const isActive     = state.selectedAreaId === folder.id;
        const childBtn     = document.createElement("button");
        const childKbFocused = state.kbLevel === "folders" && state.kbFocusedId === folder.id;
        const childHasNote   = isActive && !childKbFocused && !!state.selectedNoteId && (
          state.kbLevel === "notes"
            ? true
            : (state.kbFocusedId != null && state.kbFocusedId !== folder.id)
        );
        childBtn.className = "tree-button tree-child"
          + (isActive        ? " active"   : "")
          + (childHasNote    ? " has-note" : "")
          + (childKbFocused  ? " kb-focus" : "");
        childBtn.type           = "button";
        childBtn.dataset.areaId = folder.id;
        childBtn.innerHTML      = `<span class="tree-label">${esc(folder.name)}</span><span class="tree-count">${count2 || ""}</span>`;
        childBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectRoot(root.id, null, folder.id);
        });
        // Drag-stöd: släpp direkt på undermapp → flytta dit
        childBtn.addEventListener("dragover",  (e) => { if (!state.draggingNoteId) return; e.preventDefault(); childBtn.classList.add("drag-over"); });
        childBtn.addEventListener("dragleave", () => childBtn.classList.remove("drag-over"));
        childBtn.addEventListener("drop",      (e) => {
          e.preventDefault(); e.stopPropagation();
          childBtn.classList.remove("drag-over");
          const noteId = state.draggingNoteId;
          if (!noteId) return;
          moveNoteToRoot(noteId, root.id, { areaId: folder.id });
        });
        childrenEl.appendChild(childBtn);
      }

      // + New folder
      const folderLabel = root.id === "area" ? "area" : "folder";
      const addBtn = document.createElement("button");
      addBtn.className   = "tree-button tree-child tree-add";
      addBtn.type        = "button";
      addBtn.innerHTML   = `<span class="tree-label">+ New ${folderLabel}</span>`;
      addBtn.addEventListener("click", (e) => { e.stopPropagation(); promptCreate("folder", root.id); });
      childrenEl.appendChild(addBtn);

      node.appendChild(childrenEl);
    }

    rootTree.appendChild(node);
  }

  renderProjectList();
}

function renderProjectList() {
  projectList.innerHTML = "";
  for (const proj of state.projects) {
    const count = state.notes.filter(n => n.projectId === proj.id).length;
    const btn   = document.createElement("button");
    btn.className = "space-button" + (state.selectedProjectId === proj.id ? " active" : "");
    btn.type      = "button";
    btn.innerHTML = `<span class="space-name">${esc(proj.name)}</span><span class="space-meta">${count || ""}</span>`;
    btn.addEventListener("click", () => selectRoot("projects", proj.id));

    // Drag-and-drop: släpp en note direkt på ett project → hamnar i inbox-kolumnen
    btn.addEventListener("dragover",  (e) => { if (!state.draggingNoteId) return; e.preventDefault(); btn.classList.add("drag-over"); });
    btn.addEventListener("dragleave", ()  => btn.classList.remove("drag-over"));
    btn.addEventListener("drop",      (e) => {
      e.preventDefault();
      btn.classList.remove("drag-over");
      const noteId = state.draggingNoteId;
      if (!noteId) return;
      moveNoteToRoot(noteId, "projects", { projectId: proj.id, status: "inbox" });
      selectRoot("projects", proj.id);
    });

    projectList.appendChild(btn);
  }
}

// (Areas renderas nu inline i renderSidebar() som barn-items)

// ── Note list ─────────────────────────────────────────────────────────────────
function renderNoteList() {
  showWorkspace();
  renderMobileCaptureWidget();

  const notes      = getVisibleNotes();
  const root       = ROOTS.find(r => r.id === state.selectedRoot);
  const aggregated = isAggregatedView();
  const areaName   = state.selectedAreaId
    ? state.areas.find(a => a.id === state.selectedAreaId)?.name
    : null;

  workspaceTitle.textContent = areaName ?? root?.label ?? "";
  workspaceMeta.textContent  = "";
  workspaceCount.textContent = `${notes.length} notes`;

  noteGrid.innerHTML = "";

  // Aggregated view: info banner
  if (aggregated) {
    const hint = document.createElement("div");
    hint.className = "aggregate-hint";
    hint.innerHTML = `<span>Select a folder in the sidebar to create notes. Showing all notes across ${root?.label}'s subfolders.</span>`;
    noteGrid.appendChild(hint);
  }

  // Behåll note-vyn om en note redan är vald
  if (!state.selectedNoteId) noteView.classList.add("hidden");

  for (const note of notes) {
    const btn = document.createElement("button");
    btn.className  = "note-card" + (note.id === state.selectedNoteId ? " active" : "");
    btn.type       = "button";
    btn.draggable  = true;
    btn.dataset.id = note.id;

    // I aggregerad vy: visa vilken undermapp anteckningen tillhör
    const folderName = aggregated && note.areaId
      ? state.areas.find(a => a.id === note.areaId)?.name ?? null
      : null;
    const folderBadge = folderName
      ? `<span class="note-card-folder">${esc(folderName)}</span>`
      : "";

    btn.innerHTML = `
      <span class="note-card-title">${esc(note.title) || "<em>Untitled</em>"}</span>
      ${folderBadge}
      <span class="note-card-body">${esc(stripHtml(note.content)).slice(0, 120)}</span>
      <span class="note-card-meta">${formatRelative(note.updatedAt)}</span>
    `;
    btn.addEventListener("click",     () => selectNote(note.id));
    btn.addEventListener("dragstart", (e) => {
      state.draggingNoteId = note.id;
      e.dataTransfer.effectAllowed = "move";

      // Minimal ghost-bild med bara titeln
      const ghost = document.createElement("div");
      ghost.className   = "drag-ghost";
      ghost.textContent = note.title || "Untitled";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 16, 20);
      setTimeout(() => { ghost.remove(); btn.classList.add("dragging"); }, 0);
    });
    btn.addEventListener("dragend", () => {
      state.draggingNoteId = null;
      btn.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    });
    noteGrid.appendChild(btn);
  }

  // Empty state
  if (notes.length === 0 && !aggregated) {
    const isEmpty = document.createElement("div");
    isEmpty.className = "note-list-empty";
    const term = searchInput.value.trim();
    isEmpty.innerHTML = term
      ? `<p class="note-list-empty-title">No notes found</p><p class="note-list-empty-sub">Nothing matches "<em>${esc(term)}</em>"</p>`
      : `<p class="note-list-empty-title">No notes yet</p><p class="note-list-empty-sub">Capture something to get started.</p>`;
    noteGrid.appendChild(isEmpty);
  }
}

function getVisibleNotes() {
  const term = searchInput.value.trim().toLowerCase();
  const root = ROOTS.find(r => r.id === state.selectedRoot);
  return state.notes
    .filter(n => {
      if (state.selectedProjectId) return n.projectId === state.selectedProjectId;
      if (state.selectedAreaId)    return n.areaId    === state.selectedAreaId;
      // Expanderbara roots utan vald undermapp = aggregerad vy.
      // Visa BARA noter som faktiskt bor i en undermapp (areaId satt).
      // Lösa noter utan undermapp filtreras bort — de tillhör ingen giltig plats.
      if (root?.expandable) return n.rootId === state.selectedRoot && n.areaId != null;
      return n.rootId === state.selectedRoot;
    })
    .filter(n => !term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

// Är aktuell root en expanderbar root utan vald undermapp?
function isAggregatedView() {
  const root = ROOTS.find(r => r.id === state.selectedRoot);
  return !!(root?.expandable && !state.selectedAreaId && !state.selectedProjectId);
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function renderKanban() {
  kanbanBoard.innerHTML = "";
  const term = searchInput.value.trim().toLowerCase();

  for (const col of KANBAN_COLUMNS) {
    let colNotes = state.notes.filter(n =>
      n.projectId === state.selectedProjectId && (n.status ?? "inbox") === col.id
    );
    if (term) colNotes = colNotes.filter(n => n.title.toLowerCase().includes(term));

    const colEl    = document.createElement("div");
    colEl.className      = "kanban-column";
    colEl.dataset.status = col.id;

    const header = document.createElement("div");
    header.className = "kanban-column-header";
    header.innerHTML = `
      <span class="kanban-column-title">${col.label}</span>
      <span class="kanban-column-count">${colNotes.length || ""}</span>
    `;

    const cardsEl = document.createElement("div");
    cardsEl.className      = "kanban-cards";
    cardsEl.dataset.status = col.id;
    colNotes.forEach(n => cardsEl.appendChild(buildKanbanCard(n)));
    if (colNotes.length === 0) {
      const empty = document.createElement("p");
      empty.className   = "kanban-empty";
      empty.textContent = term ? "No matches" : "Nothing here";
      cardsEl.appendChild(empty);
    }

    const addBtn = document.createElement("button");
    addBtn.className   = "kanban-add-btn";
    addBtn.type        = "button";
    addBtn.textContent = "+ Add note";
    addBtn.addEventListener("click", () => createNoteInProject(state.selectedProjectId, col.id));

    colEl.addEventListener("dragover",  (e) => { e.preventDefault(); colEl.classList.add("kanban-drag-over"); });
    colEl.addEventListener("dragleave", ()  => colEl.classList.remove("kanban-drag-over"));
    colEl.addEventListener("drop",      (e) => handleKanbanDrop(e, col.id, colEl));

    colEl.appendChild(header);
    colEl.appendChild(cardsEl);
    colEl.appendChild(addBtn);
    kanbanBoard.appendChild(colEl);
  }
}

function buildKanbanCard(note) {
  const card = document.createElement("div");
  card.className      = "kanban-card" + (note.id === state.selectedNoteId ? " active" : "");
  card.draggable      = true;
  card.dataset.noteId = note.id;
  card.innerHTML      = `<span class="kanban-card-title">${esc(note.title) || "Untitled"}</span>`;
  if (note.audioId) card.innerHTML += `<span class="kanban-card-audio">🎤</span>`;

  card.addEventListener("click",     () => selectNote(note.id));
  card.addEventListener("dragstart", (e) => {
    state.draggingNoteId = note.id;
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.className   = "drag-ghost";
    ghost.textContent = note.title || "Untitled";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 16, 20);
    setTimeout(() => { ghost.remove(); card.classList.add("dragging"); }, 0);
  });
  card.addEventListener("dragend", () => {
    state.draggingNoteId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".kanban-drag-over").forEach(el => el.classList.remove("kanban-drag-over"));
  });
  return card;
}

function handleKanbanDrop(e, newStatus, colEl) {
  e.preventDefault();
  colEl.classList.remove("kanban-drag-over");
  const noteId = state.draggingNoteId;
  if (!noteId) return;

  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;

  if (note.rootId !== "projects") {
    note.rootId    = "projects";
    note.projectId = state.selectedProjectId;
  }
  note.status = newStatus;
  storage.saveNote(note);
  renderKanban();
  renderSidebar();
}

// ── Note detail ───────────────────────────────────────────────────────────────
function renderNoteDetail(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) { noteView.classList.add("hidden"); return; }

  // Avbryt ev pågående redigering utan att byta note
  exitEditMode();
  noteView.classList.remove("hidden");

  noteTitle.contentEditable = "false";
  noteTitle.textContent     = note.title || "Untitled";
  noteMeta.textContent      = formatRelative(note.updatedAt);
  noteContent.innerHTML     = linkifyHtml(note.content || "");
  activateEmbeds(noteContent);
  noteContent.classList.remove("hidden");

  // Kanban statusväljare — visa bara i kanban-projektvy
  const kanbanStatusBar = document.querySelector("#kanban-status-bar");
  const isKanban = state.selectedRoot === "projects" && !!state.selectedProjectId;
  kanbanStatusBar.classList.toggle("hidden", !isKanban);
  if (isKanban) {
    const currentStatus = note.status ?? "inbox";
    kanbanStatusBar.querySelectorAll(".kanban-status-btn").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.status === currentStatus)
    );
  }

  // Transcript
  document.querySelector("#transcript-section")?.remove();
  if (note.transcript) {
    const sec = document.createElement("section");
    sec.id = "transcript-section";
    sec.className = "transcript-section";
    sec.innerHTML = `<h4>Transcript</h4><p>${esc(note.transcript)}</p>`;
    noteContent.after(sec);
  }

  renderAttachments(note);
}

function renderAttachments(note) {
  if (!note.resources?.length && !note.audioId) {
    attachmentsSection.classList.add("hidden");
    return;
  }
  attachmentsSection.classList.remove("hidden");
  attachmentList.innerHTML = "";

  if (note.audioId) {
    storage.getAudio(note.audioId).then(entry => {
      if (!entry?.blob) return;
      const url   = URL.createObjectURL(entry.blob);
      state.objectUrls.push(url);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src      = url;
      audio.className = "note-audio-player";
      attachmentList.prepend(audio);
    });
  }

  for (const res of (note.resources ?? [])) {
    const card = document.createElement("article");
    card.className = "attachment-card";
    card.innerHTML = `
      <div>
        <h5 class="attachment-name">${esc(res.fileName ?? "File")}</h5>
        <p class="attachment-meta">${esc(res.mime ?? "")} · ${formatBytes(res.size ?? 0)}</p>
      </div>
    `;
    attachmentList.appendChild(card);
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function startEditing(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  state.editingNoteId = noteId;

  noteContent.classList.add("hidden");
  noteEditor.classList.remove("hidden");
  noteEditorActionsTop.classList.remove("hidden");

  noteTitle.contentEditable = "true";
  noteTitle.textContent     = note.title;
  editNoteBody.innerHTML    = note.content;
  editNoteBody.classList.remove("hidden");

  noteTitle.focus();
}

// Done = spara direkt + lämna redigeringsläge
function commitEdit() {
  const note = state.notes.find(n => n.id === state.editingNoteId);
  if (!note) return;
  clearTimeout(state.autosaveTimer);
  note.title   = noteTitle.textContent.trim();
  note.content = editNoteBody.innerHTML;
  note.updatedAt = new Date().toISOString();
  storage.saveNote(note).then(() => {
    setSaveStatus("Saved ✓");
    exitEditMode();
    renderNoteDetail(note.id);
    refreshNoteCard(note);
  });
}

// Tyst autosave — byter INTE tillbaka till read-mode
function autosave() {
  const note = state.notes.find(n => n.id === state.editingNoteId);
  if (!note) return;
  note.title   = noteTitle.textContent.trim();
  note.content = editNoteBody.innerHTML;
  note.updatedAt = new Date().toISOString();
  storage.saveNote(note).then(() => setSaveStatus("Saved ✓"));
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  setSaveStatus("Saving…");
  state.autosaveTimer = setTimeout(autosave, 900);
}

function exitEditMode() {
  state.editingNoteId = null;
  clearTimeout(state.autosaveTimer);
  noteEditor.classList.add("hidden");
  noteEditorActionsTop.classList.add("hidden");
  editNoteBody.classList.add("hidden");
  noteContent.classList.remove("hidden");
  noteTitle.contentEditable = "false";
}

function setSaveStatus(msg) {
  // Keep the topbar element in sync (used by some callers to check state)
  saveStatusEl.textContent = msg;

  // Toast notification
  let toast = document.querySelector(".save-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "save-toast";
    document.body.appendChild(toast);
  }
  clearTimeout(toast._timer);
  toast.textContent = msg;
  toast.classList.add("visible");
  toast._timer = setTimeout(() => {
    toast.classList.remove("visible");
    saveStatusEl.textContent = "";
  }, msg === "Saving…" ? 10000 : 2000);
}

function refreshNoteCard(note) {
  // Uppdatera i lista
  const card = noteGrid.querySelector(`[data-id="${note.id}"]`);
  if (card) {
    card.querySelector(".note-card-title").innerHTML = esc(note.title) || "<em>Untitled</em>";
    card.querySelector(".note-card-body").textContent = stripHtml(note.content).slice(0, 120);
    card.querySelector(".note-card-meta").textContent = formatRelative(note.updatedAt);
  }
  // Uppdatera titel i kanban-kort
  const kanbanCard = kanbanBoard.querySelector(`[data-note-id="${note.id}"] .kanban-card-title`);
  if (kanbanCard) kanbanCard.textContent = note.title || "Untitled";
}

// ── Create notes ──────────────────────────────────────────────────────────────
async function createNoteInRoot(rootId, overrides = {}, { open = true } = {}) {
  // Om en undermapp är vald, tilldela anteckningen till den mappen
  const areaId = (state.selectedAreaId && state.selectedRoot === rootId)
    ? state.selectedAreaId : null;
  const note = createNote({ rootId, areaId, ...overrides });
  state.notes.unshift(note);
  await storage.saveNote(note);
  if (state.selectedRoot !== rootId) selectRoot(rootId);
  else renderNoteList();
  if (open) {
    selectNote(note.id);
    startEditing(note.id);
  }
  return note;
}

async function createNoteInProject(projectId, status = "inbox") {
  const note = createNote({ rootId: "projects", projectId, status });
  state.notes.unshift(note);
  await storage.saveNote(note);
  renderKanban();
  renderSidebar();
  selectNote(note.id);
  startEditing(note.id);
  return note;
}

function startNewNote() {
  if (state.selectedRoot === "projects" && state.selectedProjectId) {
    createNoteInProject(state.selectedProjectId, "inbox");
    return;
  }
  // Expanderbar root utan vald undermapp → notera kan inte skapas löst
  if (isAggregatedView()) {
    const root    = ROOTS.find(r => r.id === state.selectedRoot);
    const folders = getFolders(state.selectedRoot);
    if (folders.length === 0) {
      // Inga undermappar finns än — skapa en direkt
      promptCreate("folder", state.selectedRoot);
    } else {
      // Uppmana användaren att välja en undermapp i sidebaren
      flashHint(`Select a folder under ${root?.label} in the sidebar to add notes.`);
    }
    return;
  }
  createNoteInRoot(state.selectedRoot);
}

// Visa ett kort, icke-blockerande tips-meddelande
function flashHint(msg) {
  let el = document.querySelector(".flash-hint");
  if (!el) {
    el = document.createElement("div");
    el.className = "flash-hint";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("flash-hint--show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("flash-hint--show"), 3200);
}

// ── Create project / folder ───────────────────────────────────────────────────
function promptCreate(type, rootId = "area") {
  const isProject = type === "project";
  const label     = isProject ? "project" : "folder";
  const title     = isProject ? "New project" : "New folder";
  const placeholder = isProject ? "Project name…" : "Folder name…";

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;display:flex;align-items:center;justify-content:center;";

  const dialog = document.createElement("div");
  dialog.style.cssText = "background:var(--c-card);border-radius:var(--r-lg);padding:28px 32px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.25);";
  dialog.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:1rem;font-weight:700;">${title}</h3>
    <input id="_create_input" type="text" placeholder="${placeholder}"
      style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:var(--r-md);font-size:0.9rem;outline:none;background:var(--c-bg);color:var(--c-text);">
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="_create_confirm" style="flex:1;padding:9px;border:none;border-radius:var(--r-md);background:var(--c-text);color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;">Create</button>
      <button id="_create_cancel"  style="flex:1;padding:9px;border:1px solid var(--c-border);border-radius:var(--r-md);background:transparent;font-size:0.9rem;cursor:pointer;color:var(--c-text-2);">Cancel</button>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const input   = dialog.querySelector("#_create_input");
  const confirm = dialog.querySelector("#_create_confirm");
  const cancel  = dialog.querySelector("#_create_cancel");

  // Fokusera input direkt
  setTimeout(() => input.focus(), 30);

  // Highlighta bekräfta-knappen när input har värde
  input.addEventListener("input", () => {
    confirm.style.opacity = input.value.trim() ? "1" : "0.45";
  });
  confirm.style.opacity = "0.45";

  const close = () => document.body.removeChild(overlay);

  const submit = async () => {
    const name = input.value.trim();
    if (!name) return;
    close();
    const entity = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    if (isProject) {
      await storage.saveProject(entity);
      state.projects.push(entity);
      selectRoot("projects", entity.id);
    } else {
      entity.rootId = rootId;
      await storage.saveArea(entity);
      state.areas.push(entity);
      selectRoot(rootId, null, entity.id);
    }
    renderSidebar();
  };

  confirm.addEventListener("click", submit);
  cancel.addEventListener("click",  close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  submit();
    if (e.key === "Escape") close();
  });
}

// ── Drag & drop (list → sidebar) ──────────────────────────────────────────────
function handleRootDragOver(e)  { if (!state.draggingNoteId) return; e.preventDefault(); e.currentTarget.classList.add("drag-over"); }
function handleRootDragLeave(e) { e.currentTarget.classList.remove("drag-over"); }

function handleRootDrop(e, root) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const noteId = state.draggingNoteId;
  if (!noteId) return;
  if (root.id === "projects") {
    showProjectPicker(noteId, e.currentTarget);
  } else if (root.expandable) {
    // Expanderbara roots kräver att man väljer en undermapp
    const folders = getFolders(root.id);
    showAreaPicker(noteId, root, e.currentTarget);
  } else {
    moveNoteToRoot(noteId, root.id);
  }
}

function moveNoteToRoot(noteId, rootId, extra = {}) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  Object.assign(note, { rootId, projectId: null, areaId: null, status: null, ...extra });
  storage.saveNote(note);
  renderNoteList();
  renderSidebar();
}

// ── Project picker ────────────────────────────────────────────────────────────
function showProjectPicker(noteId, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  folderPicker.style.top  = `${rect.top}px`;
  folderPicker.style.left = `${Math.min(rect.right + 6, window.innerWidth - 290)}px`;
  folderPickerHeader.textContent = "Move to project…";
  folderPickerList.innerHTML = "";

  if (!state.projects.length) {
    folderPickerList.innerHTML = `<p class="folder-picker-empty">No projects yet.</p>`;
  } else {
    for (const proj of state.projects) {
      const btn = document.createElement("button");
      btn.className   = "folder-picker-item";
      btn.type        = "button";
      btn.textContent = proj.name;
      btn.addEventListener("click", () => {
        moveNoteToRoot(noteId, "projects", { projectId: proj.id, status: "inbox" });
        closeFolderPicker();
      });
      folderPickerList.appendChild(btn);
    }
  }
  folderPicker.classList.remove("hidden");
  _pickerKbCleanup = attachPickerKeyboard(folderPickerList);
}

let _pickerKbCleanup = null;

function closeFolderPicker() {
  folderPicker.classList.add("hidden");
  if (_pickerKbCleanup) { _pickerKbCleanup(); _pickerKbCleanup = null; }
}

// Tangentbordsnavigering + typeahead för en picker-lista
function attachPickerKeyboard(listEl) {
  let typeahead = "";
  let typeaheadTimer = null;

  // Bara de "riktiga" valen — inte "+ Ny mapp"-knappen
  const navItems = () => Array.from(listEl.querySelectorAll(".folder-picker-item:not(.folder-picker-new)"));

  const setHighlight = (el) => {
    listEl.querySelectorAll(".folder-picker-item").forEach(i => i.classList.remove("picker-active"));
    if (el) { el.classList.add("picker-active"); el.scrollIntoView({ block: "nearest" }); }
  };

  // Markera första objekt direkt
  const first = navItems()[0];
  if (first) setHighlight(first);

  const handler = (e) => {
    if (folderPicker.classList.contains("hidden")) return;
    const all    = navItems();
    const active = listEl.querySelector(".folder-picker-item.picker-active");
    const idx    = active ? all.indexOf(active) : -1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      typeahead = ""; clearTimeout(typeaheadTimer);
      setHighlight(all[Math.min(idx + 1, all.length - 1)]);

    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      typeahead = ""; clearTimeout(typeaheadTimer);
      setHighlight(all[Math.max(idx - 1, 0)]);

    } else if (e.key === "Enter") {
      e.preventDefault();
      active?.click();

    } else if (e.key === "Escape") {
      closeFolderPicker();

    } else if (e.key.length === 1 && /[a-zA-ZåäöÅÄÖ0-9]/.test(e.key)) {
      typeahead += e.key.toLowerCase();
      clearTimeout(typeaheadTimer);
      // Nollställ typeahead efter 3 s inaktivitet (eller direkt vid piltangent)
      typeaheadTimer = setTimeout(() => { typeahead = ""; }, 3000);
      const match = all.find(item => item.textContent.trim().toLowerCase().startsWith(typeahead));
      if (match) setHighlight(match);
    }
  };

  document.addEventListener("keydown", handler);
  return () => { document.removeEventListener("keydown", handler); clearTimeout(typeaheadTimer); };
}

function showAreaPicker(noteId, root, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  folderPicker.style.top  = `${rect.top}px`;
  folderPicker.style.left = `${Math.min(rect.right + 6, window.innerWidth - 290)}px`;
  folderPickerHeader.textContent = `Move to folder in ${root.label}…`;
  folderPickerList.innerHTML = "";

  const folders = getFolders(root.id);

  if (folders.length === 0) {
    const empty = document.createElement("p");
    empty.className   = "folder-picker-empty";
    empty.textContent = "No folders yet";
    folderPickerList.appendChild(empty);
  } else {
    for (const folder of folders) {
      const btn = document.createElement("button");
      btn.className   = "folder-picker-item";
      btn.type        = "button";
      btn.textContent = folder.name;
      btn.addEventListener("click", () => {
        moveNoteToRoot(noteId, root.id, { areaId: folder.id });
        closeFolderPicker();
      });
      folderPickerList.appendChild(btn);
    }
  }

  // "+ Ny mapp"-knapp alltid längst ner
  const newBtn = document.createElement("button");
  newBtn.className   = "folder-picker-item folder-picker-new";
  newBtn.type        = "button";
  newBtn.textContent = `+ New folder in ${root.label}`;
  newBtn.addEventListener("click", async () => {
    closeFolderPicker();
    // Öppna skapandedialogens popup och vänta på att mappen skapas
    // Sedan flytta noten dit automatiskt
    const before = state.areas.map(a => a.id);
    promptCreate("folder", root.id);
    // Vänta tills en ny mapp dyker upp i state.areas, flytta sedan noten dit
    const check = setInterval(() => {
      const added = state.areas.find(a => !before.includes(a.id) && (a.rootId ?? "area") === root.id);
      if (added) {
        clearInterval(check);
        moveNoteToRoot(noteId, root.id, { areaId: added.id });
      }
    }, 200);
    setTimeout(() => clearInterval(check), 30000);
  });
  folderPickerList.appendChild(newBtn);

  folderPicker.classList.remove("hidden");
  _pickerKbCleanup = attachPickerKeyboard(folderPickerList);
}

// ── Recording ─────────────────────────────────────────────────────────────────
async function toggleRecording() {
  if (recorder.isRecording) {
    const blob = await recorder.stop();
    if (!blob) return;

    const audioId = crypto.randomUUID();
    await storage.saveAudio(audioId, blob);

    let note = state.notes.find(n => n.id === state.selectedNoteId);
    if (!note) {
      note = await createNoteInRoot(state.selectedRoot, { title: "Voice note" });
    }
    note.audioId = audioId;

    if (FEATURES.transcription) {
      try { const t = await transcription.transcribe(blob); if (t) note.transcript = t; } catch (_) {}
    }

    await storage.saveNote(note);
    renderNoteDetail(note.id);
  } else {
    try { await recorder.start(); }
    catch (err) { alert("Mikrofon ej tillgänglig: " + err.message); }
  }
}

function handleRecordingState(s, payload) {
  if (s === "recording") {
    recordBtn.textContent = "⏹ Stop";
    recordingPanel?.classList.remove("hidden");
    if (recordingElapsed) recordingElapsed.textContent = "00:00";
    if (recordingStatus)  recordingStatus.textContent  = "Recording…";
  }
  if (s === "tick") {
    const sec = payload;
    if (recordingElapsed) recordingElapsed.textContent =
      `${String(Math.floor(sec / 60)).padStart(2,"0")}:${String(sec % 60).padStart(2,"0")}`;
  }
  if (s === "stopped" || s === "cancelled") {
    recordBtn.textContent = "Record";
    recordingPanel?.classList.add("hidden");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Hämta undermappar för en root, alltid i alfabetisk ordning
function getFolders(rootId) {
  return state.areas
    .filter(a => (a.rootId ?? "area") === rootId)
    .sort((a, b) => a.name.localeCompare(b.name, "sv", { sensitivity: "base" }));
}

function countForRoot(rootId) {
  if (rootId === "projects") return state.notes.filter(n => n.rootId === "projects").length;
  return state.notes.filter(n => n.rootId === rootId).length;
}

function formatRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-SE", { day: "numeric", month: "short" });
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html ?? "";
  return d.textContent ?? "";
}

function esc(str) {
  return (str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Gör råa URL:er i HTML-innehåll klickbara (skippar befintliga <a>-taggar)
function linkifyHtml(html) {
  if (!html) return "";
  const URL_RE = /(https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+)/g;
  const div = document.createElement("div");
  div.innerHTML = html;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      URL_RE.lastIndex = 0;
      if (!URL_RE.test(text)) return;
      URL_RE.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = URL_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement("a");
        a.href      = m[1];
        a.target    = "_blank";
        a.rel       = "noopener noreferrer";
        a.textContent = m[1];
        frag.appendChild(a);
        last = m.index + m[1].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === "A" || tag === "SCRIPT" || tag === "STYLE") return; // skippa
    Array.from(node.childNodes).forEach(walk);
  }

  Array.from(div.childNodes).forEach(walk);
  return div.innerHTML;
}

// ── Embed-aktivering (Twitter/X) ──────────────────────────────────────────────
function activateEmbeds(container) {
  const TWEET_RE = /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i;

  container.querySelectorAll("a[href]").forEach(a => {
    const m = a.href.match(TWEET_RE);
    if (!m) return;
    const tweetUrl = `https://x.com/${m[2]}/status/${m[3]}`;

    // Wrapper för begränsad bredd + "Öppna på X"-länk
    const wrapper = document.createElement("div");
    wrapper.className = "tweet-embed-wrapper";

    const bq = document.createElement("blockquote");
    bq.className = "twitter-tweet";
    bq.setAttribute("data-dnt", "true");
    bq.setAttribute("data-theme", "light");
    bq.innerHTML = `<a href="${tweetUrl}"></a>`;

    const openLink = document.createElement("a");
    openLink.href      = tweetUrl;
    openLink.target    = "_blank";
    openLink.rel       = "noopener noreferrer";
    openLink.className = "tweet-open-link";
    openLink.textContent = "Öppna på X för att se video ↗";

    wrapper.appendChild(bq);
    wrapper.appendChild(openLink);

    const parent = a.parentNode;
    if (parent.tagName === "P" && parent.textContent.trim() === a.textContent.trim()) {
      parent.replaceWith(wrapper);
    } else {
      a.replaceWith(wrapper);
    }
  });

  if (!container.querySelector(".twitter-tweet")) return;

  if (window.twttr?.widgets) {
    window.twttr.widgets.load(container);
  } else if (!document.querySelector("script[src*='platform.twitter.com/widgets']")) {
    const s = document.createElement("script");
    s.src     = "https://platform.twitter.com/widgets.js";
    s.async   = true;
    s.charset = "utf-8";
    document.head.appendChild(s);
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────

function exportData() {
  const payload = {
    version:    2,
    app:        "NoteSoFast",
    exportedAt: new Date().toISOString(),
    notes:      state.notes,
    projects:   state.projects,
    areas:      state.areas,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `notsofast-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Visar ett enkelt destinations-val innan import
function pickImportDestination() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;display:flex;align-items:center;justify-content:center;";

    const dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--c-card);border-radius:var(--r-lg);padding:28px 32px;width:300px;box-shadow:0 20px 60px rgba(0,0,0,0.25);";
    dialog.innerHTML = `
      <h3 style="margin:0 0 6px;font-size:1rem;font-weight:700;">Import to</h3>
      <p style="margin:0 0 18px;color:var(--c-text-2);font-size:0.85rem;">Choose which section the notes should go into</p>
      <div id="_imp_opts" style="display:flex;flex-direction:column;gap:8px;"></div>
      <button id="_imp_cancel" style="margin-top:14px;width:100%;padding:8px;border:1px solid var(--c-border);border-radius:var(--r-md);background:transparent;cursor:pointer;color:var(--c-text-2);font-size:0.875rem;">Cancel</button>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const opts = dialog.querySelector("#_imp_opts");
    const navRoots = ROOTS.filter(r => r.nav && r.id !== "projects");
    navRoots.forEach(root => {
      const btn = document.createElement("button");
      btn.textContent = root.label;
      btn.style.cssText = "padding:10px 16px;border:1px solid var(--c-border);border-radius:var(--r-md);background:var(--c-bg);cursor:pointer;text-align:left;font-size:0.9rem;font-weight:500;transition:background 0.1s;";
      btn.onmouseenter = () => btn.style.background = "var(--c-surface)";
      btn.onmouseleave = () => btn.style.background = "var(--c-bg)";
      btn.onclick = () => { document.body.removeChild(overlay); resolve(root.id); };
      opts.appendChild(btn);
    });

    const cancel = () => { document.body.removeChild(overlay); resolve(null); };
    dialog.querySelector("#_imp_cancel").onclick = cancel;
    overlay.onclick = (e) => { if (e.target === overlay) cancel(); };
  });
}

async function importData(files) {
  const rootId = await pickImportDestination();
  if (!rootId) return; // avbruten

  let imported = 0;
  for (const file of files) {
    try {
      if (file.name.endsWith(".json")) {
        imported += await importJSON(file, rootId);
      } else if (file.name.endsWith(".enex")) {
        imported += await importENEX(file, rootId);
      }
    } catch (err) {
      console.error("Import error:", err);
      alert(`Failed to import ${file.name}: ${err.message}`);
    }
  }

  if (imported > 0) {
    state.notes    = await storage.getAllNotes();
    state.projects = await storage.getAllProjects();
    state.areas    = await storage.getAllAreas();
    renderSidebar();
    renderCurrentView();
    setSaveStatus(`Imported ${imported} notes`);
  }
}

async function importJSON(file, targetRootId = "inbox") {
  const data = JSON.parse(await file.text());
  let count  = 0;

  // Format v2 (NoteSoFast export) — flytta noter till vald mapp
  if (data.version === 2) {
    for (const area of (data.areas ?? [])) {
      await storage.saveArea(area);
    }
    for (const proj of (data.projects ?? [])) {
      await storage.saveProject(proj);
    }
    for (const note of (data.notes ?? [])) {
      await storage.saveNote({ ...note, rootId: targetRootId });
      count++;
    }
    return count;
  }

  // Okänt format — försök importera noter
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item.id && (item.title !== undefined || item.content !== undefined)) {
        await storage.saveNote(createNote({ ...item, rootId: targetRootId }));
        count++;
      }
    }
  }
  return count;
}

async function importENEX(file, targetRootId = "inbox") {
  const text   = await file.text();
  const parser = new DOMParser();
  const xml    = parser.parseFromString(text, "text/xml");
  const nodes  = Array.from(xml.querySelectorAll("note"));
  let count    = 0;

  for (const node of nodes) {
    const title     = node.querySelector("title")?.textContent ?? "";
    const created   = node.querySelector("created")?.textContent;
    const updated   = node.querySelector("updated")?.textContent;
    const contentEl = node.querySelector("content");

    // ENEX innehåller ENML — extrahera texten
    let content = "";
    if (contentEl?.textContent) {
      const enml = new DOMParser().parseFromString(contentEl.textContent, "text/html");
      content = enml.body.innerHTML || "";
    }

    const iso = (str) => {
      if (!str) return new Date().toISOString();
      // ENEX: 20231201T120000Z → ISO
      const m = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
      return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
    };

    await storage.saveNote(createNote({
      title,
      content,
      createdAt: iso(created),
      updatedAt: iso(updated),
      rootId:    targetRootId,
    }));
    count++;
  }
  return count;
}

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrap();
