/**
 * IndexedDB-based storage for user-uploaded PDFs.
 * PDFs are stored locally and never sent to the backend.
 * This allows bioRxiv users to upload their own PDF copies
 * while still viewing shared annotations.
 */

const DB_NAME = 'pubdiscuss-pdfs';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

interface PdfRecord {
  paperId: string;
  blob: Blob;
  uploadedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'paperId' });
      }
    };
  });
}

/**
 * Store a PDF blob for a given paper ID.
 * Overwrites any existing PDF for this paper.
 */
export async function storePdf(paperId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const record: PdfRecord = {
      paperId,
      blob,
      uploadedAt: Date.now(),
    };
    
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    
    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieve a stored PDF blob for a given paper ID.
 * Returns null if no PDF is stored.
 */
export async function getPdf(paperId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(paperId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const record = request.result as PdfRecord | undefined;
      resolve(record?.blob ?? null);
    };
    
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a stored PDF for a given paper ID.
 */
export async function deletePdf(paperId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(paperId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    
    tx.oncomplete = () => db.close();
  });
}

/**
 * Check if a PDF exists for a given paper ID.
 */
export async function hasPdf(paperId: string): Promise<boolean> {
  const blob = await getPdf(paperId);
  return blob !== null;
}

