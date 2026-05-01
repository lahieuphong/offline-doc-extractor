export type ScannerTransferItemPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

const DB_NAME = "offline_doc_extractor";
const DB_VERSION = 1;
const STORE_NAME = "scanner_transfer_items";
const FILE_STORE_NAME = "scanner_transfer_files";
const RESULT_STORE_NAME = "review_result_payloads";
const MARKER_PREFIX = "__scanner_idb__:";
const RESULT_MARKER_PREFIX = "__review_result_idb__:";

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

function openScannerTransferDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(RESULT_STORE_NAME)) {
        db.createObjectStore(RESULT_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể mở IndexedDB"));
  });
}

export function buildScannerTransferIdbMarker(id: string): string {
  return `${MARKER_PREFIX}${id}`;
}

export function parseScannerTransferIdbMarker(raw: string): string | null {
  if (!raw.startsWith(MARKER_PREFIX)) return null;
  return raw.slice(MARKER_PREFIX.length) || null;
}

export async function saveScannerTransferItemsToIdb(items: ScannerTransferItemPayload[]): Promise<string> {
  const db = await openScannerTransferDb();
  const id = `scanner_transfer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(items, id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể lưu dữ liệu chuyển trang"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Lưu dữ liệu bị hủy"));
  });

  db.close();
  return id;
}

export async function loadScannerTransferItemsFromIdb(id: string): Promise<ScannerTransferItemPayload[] | null> {
  const db = await openScannerTransferDb();

  const result = await new Promise<ScannerTransferItemPayload[] | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const value = request.result;
      resolve(Array.isArray(value) ? (value as ScannerTransferItemPayload[]) : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Không thể đọc dữ liệu chuyển trang"));
  });

  db.close();
  return result;
}

export async function removeScannerTransferItemsFromIdb(id: string): Promise<void> {
  const db = await openScannerTransferDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể xóa dữ liệu chuyển trang"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Xóa dữ liệu bị hủy"));
  });

  db.close();
}

export function shouldFallbackToIdb(error: unknown): boolean {
  return isQuotaExceededError(error);
}

export function buildReviewResultIdbMarker(id: string): string {
  return `${RESULT_MARKER_PREFIX}${id}`;
}

export function parseReviewResultIdbMarker(raw: string): string | null {
  if (!raw.startsWith(RESULT_MARKER_PREFIX)) return null;
  return raw.slice(RESULT_MARKER_PREFIX.length) || null;
}

export async function saveScannerFilesBatchToIdb(files: File[]): Promise<string> {
  const db = await openScannerTransferDb();
  const id = `scanner_files_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FILE_STORE_NAME);
    store.put(files, id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể lưu file tạm"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Lưu file tạm bị hủy"));
  });

  db.close();
  return id;
}

export async function loadScannerFilesBatchFromIdb(id: string): Promise<File[] | null> {
  const db = await openScannerTransferDb();

  const result = await new Promise<File[] | null>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readonly");
    const store = transaction.objectStore(FILE_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const value = request.result;
      resolve(Array.isArray(value) ? (value as File[]) : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Không thể đọc file tạm"));
  });

  db.close();
  return result;
}

export async function removeScannerFilesBatchFromIdb(id: string): Promise<void> {
  const db = await openScannerTransferDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FILE_STORE_NAME);
    store.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể xóa file tạm"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Xóa file tạm bị hủy"));
  });

  db.close();
}

export async function saveReviewResultPayloadToIdb(payload: unknown): Promise<string> {
  const db = await openScannerTransferDb();
  const id = `review_result_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RESULT_STORE_NAME);
    store.put(payload, id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể lưu kết quả bóc tách"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Lưu kết quả bóc tách bị hủy"));
  });

  db.close();
  return id;
}

export async function loadReviewResultPayloadFromIdb<T>(id: string): Promise<T | null> {
  const db = await openScannerTransferDb();

  const result = await new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RESULT_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Không thể đọc kết quả bóc tách"));
  });

  db.close();
  return result;
}

export async function removeReviewResultPayloadFromIdb(id: string): Promise<void> {
  const db = await openScannerTransferDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RESULT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RESULT_STORE_NAME);
    store.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Không thể xóa kết quả bóc tách"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Xóa kết quả bóc tách bị hủy"));
  });

  db.close();
}
