// ─── StorageService.js ──────────────────────────────────────────────────────
// All data går via den här klassen. Laddas som vanligt script.

class StorageService {
  constructor() { this.db = null; }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("notsofast-v2", 1);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("notes")) {
          const s = db.createObjectStore("notes", { keyPath: "id" });
          s.createIndex("rootId",    "rootId",    { unique: false });
          s.createIndex("projectId", "projectId", { unique: false });
          s.createIndex("areaId",    "areaId",    { unique: false });
          s.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("areas")) {
          db.createObjectStore("areas", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", { keyPath: "id" });
        }
      };

      req.onsuccess  = (e) => { this.db = e.target.result; resolve(this); };
      req.onerror    = ()  => reject(req.error);
    });
  }

  getAllNotes()   { return this._getAll("notes"); }
  getNote(id)    { return this._get("notes", id); }
  deleteNote(id) {
    window.syncService?.remove("notes", id);
    return this._delete("notes", id);
  }

  saveNote(note) {
    note.updatedAt = new Date().toISOString();
    window.syncService?.push("notes", note);
    return this._put("notes", note);
  }

  getAllProjects()      { return this._getAll("projects"); }
  saveProject(project) {
    window.syncService?.push("projects", project);
    return this._put("projects", project);
  }
  deleteProject(id) {
    window.syncService?.remove("projects", id);
    return this._delete("projects", id);
  }

  getAllAreas()   { return this._getAll("areas"); }
  saveArea(area) {
    window.syncService?.push("areas", area);
    return this._put("areas", area);
  }
  deleteArea(id) {
    window.syncService?.remove("areas", id);
    return this._delete("areas", id);
  }

  saveAudio(id, blob) {
    return this._put("audio", { id, blob, createdAt: new Date().toISOString() });
  }
  getAudio(id)    { return this._get("audio", id); }
  deleteAudio(id) { return this._delete("audio", id); }

  _getAll(store) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  }
  _get(store, id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  }
  _put(store, item) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  _delete(store, id) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }
}
