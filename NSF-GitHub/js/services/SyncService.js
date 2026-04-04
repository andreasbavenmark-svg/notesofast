// ─── SyncService.js ─────────────────────────────────────────────────────────
// Hanterar Firebase-auth (Google Sign-In) och Firestore-synkronisering.
// Är av-stängd om FIREBASE_CONFIG.apiKey är tomt (offline-only-läge).

class SyncService {
  constructor() {
    this.auth        = null;
    this.db          = null;
    this.user        = null;
    this.ready       = false;
    this.onAuthChange = null; // sätts av app.js
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  init(config) {
    if (!config?.apiKey) {
      console.info("[NSF Sync] Ingen Firebase-config — kör offline-only.");
      return;
    }
    try {
      firebase.initializeApp(config);
    } catch (_) {
      // Redan initierad (t.ex. hot reload)
    }
    this.auth = firebase.auth();
    this.db   = firebase.firestore();

    this.auth.onAuthStateChanged(async (user) => {
      this.user  = user;
      this.ready = !!user;
      if (user) {
        console.info("[NSF Sync] Inloggad som", user.email, "— synkar...");
        await this._pullAll();
      }
      if (this.onAuthChange) this.onAuthChange(user);
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async signIn() {
    if (!this.auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    return this.auth.signInWithPopup(provider);
  }

  async signOut() {
    if (!this.auth) return;
    this.ready = false;
    return this.auth.signOut();
  }

  // ── Push (lokal → Firestore) ────────────────────────────────────────────────

  push(collection, item) {
    if (!this.ready || !item?.id) return;
    this._col(collection).doc(item.id).set(item).catch(e =>
      console.warn("[NSF Sync] push misslyckades:", e)
    );
  }

  remove(collection, id) {
    if (!this.ready || !id) return;
    this._col(collection).doc(id).delete().catch(e =>
      console.warn("[NSF Sync] remove misslyckades:", e)
    );
  }

  // ── Pull (Firestore → lokal IndexedDB) ─────────────────────────────────────

  async _pullAll() {
    await Promise.all([
      this._pullCollection("notes",    storage.getAllNotes.bind(storage)),
      this._pullCollection("projects", storage.getAllProjects.bind(storage)),
      this._pullCollection("areas",    storage.getAllAreas.bind(storage)),
    ]);

    // Ladda om state från lokal DB (nu ihopslaget med remote)
    state.notes    = await storage.getAllNotes();
    state.projects = await storage.getAllProjects();
    state.areas    = await storage.getAllAreas();
  }

  async _pullCollection(name, getAllLocal) {
    // 1. Hämta allt från Firestore
    let snap;
    try {
      snap = await this._col(name).get();
    } catch (e) {
      console.warn("[NSF Sync] pull misslyckades för", name, e);
      return;
    }

    // 2. Merge: remote vinner om den är nyare
    for (const doc of snap.docs) {
      const remote = doc.data();
      const local  = await storage._get(name, remote.id);
      const remoteNewer = !local || (remote.updatedAt ?? "") >= (local.updatedAt ?? "");
      if (remoteNewer) {
        await storage._put(name, remote); // direkt till IDB, ingen sync-loop
      }
    }

    // 3. Push lokala objekt som inte finns i Firestore (skapade offline)
    const remoteIds = new Set(snap.docs.map(d => d.id));
    const localAll  = await getAllLocal();
    for (const item of localAll) {
      if (!remoteIds.has(item.id)) {
        this.push(name, item);
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _col(name) {
    return this.db.collection(`users/${this.user.uid}/${name}`);
  }
}

const syncService = new SyncService();
