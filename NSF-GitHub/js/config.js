// ─── config.js ──────────────────────────────────────────────────────────────
//
// ── Firebase-konfiguration ───────────────────────────────────────────────────
// Fyll i dina egna värden från Firebase Console (se SETUP.md).
// Lämna apiKey tom ("") för att köra helt offline utan synkronisering.
const FIREBASE_CONFIG = {
  apiKey:            "",
  authDomain:        "",
  projectId:         "",
  storageBucket:     "",
  messagingSenderId: "",
  appId:             "",
};
//

const FEATURES = {
  transcription: false, // true = privat version med Whisper
};

// nav: true  = visas i sidebaren som nav-item
// nav: false = visas bara som separat sektion (Projects)
// expandable = true om det har barn-items (Areas)
const ROOTS = [
  { id: "inbox",    label: "Inbox",    nav: true  },
  { id: "drafts",   label: "Drafts",   nav: true,  expandable: true },
  { id: "area",     label: "Areas",    nav: true,  expandable: true },
  { id: "resource", label: "Resource", nav: true,  expandable: true },
  { id: "archive",  label: "Archive",  nav: true,  expandable: true },
  { id: "projects", label: "Projects", nav: false },
];

const KANBAN_COLUMNS = [
  { id: "inbox", label: "Inbox" },
  { id: "doing", label: "Doing" },
  { id: "done",  label: "Done"  },
];
