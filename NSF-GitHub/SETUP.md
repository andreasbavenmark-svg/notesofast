# NoteSoFast — Setup guide
Hur du hostas appen på GitHub Pages och aktiverar synk via Firebase.
Beräknad tid: **~20 minuter**.

---

## Del 1 — Hosta appen på GitHub Pages

### 1. Skapa ett GitHub-konto
Gå till [github.com](https://github.com) och skapa ett konto om du inte har ett.

### 2. Skapa ett nytt repository
1. Klicka på **+** (övre högra hörnet) → **New repository**
2. Namn: t.ex. `notesofast`
3. Sätt till **Public** (krävs för gratis GitHub Pages)
4. Klicka **Create repository**

### 3. Ladda upp filerna
Du har två alternativ:

**Alternativ A — Drag & drop (enklast)**
1. Öppna ditt nya repository på GitHub
2. Klicka **uploading an existing file**
3. Dra hela `Evernote`-mappen till uppladdningsfältet
4. Klicka **Commit changes**

**Alternativ B — GitHub Desktop**
1. Ladda ner [GitHub Desktop](https://desktop.github.com)
2. Klona ditt repo lokalt
3. Kopiera alla filer från `Evernote`-mappen till repo-mappen
4. Commit + Push via GitHub Desktop

### 4. Aktivera GitHub Pages
1. Gå till ditt repo → **Settings** → **Pages**
2. Under "Source": välj **Deploy from a branch**
3. Branch: **main** / **root** → Spara
4. Efter ~1 minut är appen live på:
   `https://DITT-ANVÄNDARNAMN.github.io/notesofast/`

✅ Appen är nu tillgänglig från alla enheter via webbläsaren.
   På iPhone: öppna URL:en i Safari → dela-knappen → **Lägg till på hemskärmen**.

---

## Del 2 — Aktivera synkronisering med Firebase

### 5. Skapa ett Firebase-projekt
1. Gå till [console.firebase.google.com](https://console.firebase.google.com)
2. Klicka **Add project** → namnge det `notesofast`
3. Avaktivera Google Analytics (behövs inte) → **Create project**

### 6. Aktivera Google Sign-In
1. I Firebase Console → **Authentication** → **Get started**
2. Fliken **Sign-in method** → klicka **Google** → aktivera → Spara

### 7. Skapa Firestore-databas
1. I Firebase Console → **Firestore Database** → **Create database**
2. Välj **Start in production mode** → välj närmaste region (t.ex. `europe-west3`) → **Enable**
3. Gå till fliken **Rules** och klistra in följande:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
4. Klicka **Publish**

### 8. Hämta din Firebase-config
1. I Firebase Console → kugghjulet (⚙️) → **Project settings**
2. Scrolla ner till **Your apps** → klicka **</>** (Web)
3. Ge appen ett namn (t.ex. `NSF Web`) → **Register app**
4. Kopiera `firebaseConfig`-objektet — det ser ut så här:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "notesofast-xxx.firebaseapp.com",
  projectId: "notesofast-xxx",
  storageBucket: "notesofast-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};
```

### 9. Klistra in config i appen
Öppna `js/config.js` och fyll i värdena i `FIREBASE_CONFIG`:

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",          // ← din apiKey
  authDomain:        "notesofast-xxx.firebaseapp.com",
  projectId:         "notesofast-xxx",
  storageBucket:     "notesofast-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc",
};
```

### 10. Lägg till din GitHub Pages-URL som auktoriserad domän
1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Klicka **Add domain**
3. Ange: `DITT-ANVÄNDARNAMN.github.io`
4. Spara

### 11. Publicera uppdateringen
Ladda upp (eller pusha) den uppdaterade `js/config.js` till GitHub.
GitHub Pages uppdateras automatiskt efter ~1 minut.

---

## Klart! Så här funkar det

- **Offline**: appen fungerar helt utan internet (service worker cachelagrar allt)
- **Synk**: i sidebaren finns en knapp **"↗ Sync between devices"**
  - Logga in med Google → alla noter synkas direkt till Firestore
  - Logga in på en annan enhet → same Google-konto → alla noter laddas ner
- **Ny enhet**: öppna URL:en → logga in med Google → klart

## Gratis tier (Firebase)
- **1 GB** Firestore-lagring
- **50 000 läsningar/dag**, **20 000 skrivningar/dag**
- Mer än tillräckligt för personligt bruk
