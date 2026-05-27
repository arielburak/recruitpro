// Persistent draft helpers for /jobs/new. Survives navigation,
// tab close, refresh, browser restart — until the user submits or
// explicitly clears the form.
//
// Two stores because the data has two shapes:
//   - Form fields (title, description, location, …): JSON-serialisable.
//     Lives in localStorage under JOB_DRAFT_KEY.
//   - JD upload (File / Blob): not serialisable. Lives in IndexedDB
//     because that's the only browser storage that holds binary
//     payloads keyed by string.
//
// Both stores are scoped per-browser, not per-user. A recruiter
// sharing a workstation with someone else would see the other
// person's draft on reload; that's an acceptable trade for the
// MVP given the rest of the app is multi-tenant by org context.

export const JOB_DRAFT_KEY = "newJobDraft";

export type JobDraft = {
  title: string;
  titleFromDoc: boolean;
  description: string;
  descriptionFromDoc: boolean;
  location: string;
  workMode: string;
  currency: string;
  feeType: string;
  feeAmount: string;
  termsAutoFilled: boolean;
  parseStatus: string;
  jdFileName?: string | null;
};

// ── Form-fields draft (localStorage) ─────────────────────────────────

export function saveJobDraft(draft: JobDraft) {
  try {
    localStorage.setItem(JOB_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage can be unavailable (private window, quota) — silent.
  }
}

export function loadJobDraft(): JobDraft | null {
  try {
    const raw = localStorage.getItem(JOB_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JobDraft;
  } catch {
    return null;
  }
}

export function clearJobDraft() {
  try {
    localStorage.removeItem(JOB_DRAFT_KEY);
  } catch {}
}

// ── JD file draft (IndexedDB) ────────────────────────────────────────

const DB_NAME = "recruitpro-drafts";
const STORE = "job-draft-files";
const KEY = "current-jd";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveJdFile(file: File): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadJdFile(): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<File | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result;
        // IndexedDB hands back a File-like blob. Cast back to File so
        // consumers get name/size/type the same as a fresh upload.
        resolve(v instanceof File ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function clearJdFile(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
