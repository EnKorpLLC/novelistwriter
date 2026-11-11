"use client";

/**
 * Where recordings live: a real folder on the narrator's computer (Chrome and Edge), or the browser's private
 * storage everywhere else. Nothing here is uploaded.
 */

type PermissionMode = { mode: "readwrite" };
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: PermissionMode) => Promise<PermissionState>;
  requestPermission?: (d: PermissionMode) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandle>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: "readwrite" }) => Promise<DirHandle> };

export type AudioStore = { kind: "folder" | "browser"; root: DirHandle; label: string };

export function supportsFolders() {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/* ---------- Remembering the chosen folder (folder handles can be kept in IndexedDB) ---------- */

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nw-audio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("folders");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function remember(projectId: string, handle: DirHandle | null) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    if (handle) tx.objectStore("folders").put(handle, projectId);
    else tx.objectStore("folders").delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function recall(projectId: string): Promise<DirHandle | null> {
  const db = await idb();
  return new Promise((resolve) => {
    const req = db.transaction("folders").objectStore("folders").get(projectId);
    req.onsuccess = () => resolve((req.result as DirHandle) || null);
    req.onerror = () => resolve(null);
  });
}

/** Ask for a folder (must come from a click). */
export async function chooseFolder(projectId: string): Promise<AudioStore> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This browser can't save to a folder. Use Chrome or Edge, or keep recordings in the browser.");
  const root = await picker({ id: "nw-audio", mode: "readwrite" });
  await remember(projectId, root);
  return { kind: "folder", root, label: root.name };
}

/**
 * The folder chosen last time. Browsers ask again for permission after a restart; `needsClick` means
 * the narrator has to press a button so we can ask.
 */
export async function restoreFolder(projectId: string, fromClick = false): Promise<AudioStore | { needsClick: true; label: string } | null> {
  const root = await recall(projectId).catch(() => null);
  if (!root) return null;
  const state = (await root.queryPermission?.({ mode: "readwrite" })) || "granted";
  if (state === "granted") return { kind: "folder", root, label: root.name };
  if (!fromClick) return { needsClick: true, label: root.name };
  const asked = (await root.requestPermission?.({ mode: "readwrite" })) || "denied";
  return asked === "granted" ? { kind: "folder", root, label: root.name } : null;
}

export async function forgetFolder(projectId: string) {
  await remember(projectId, null).catch(() => null);
}

/** The browser's own private storage: works everywhere, but clearing site data deletes it. */
export async function browserStore(projectId: string): Promise<AudioStore> {
  if (!navigator.storage?.getDirectory) throw new Error("This browser can't store recordings. Use Chrome or Edge on a computer.");
  const top = (await navigator.storage.getDirectory()) as DirHandle;
  const audio = await top.getDirectoryHandle("nw-audio", { create: true });
  const root = (await audio.getDirectoryHandle(projectId, { create: true })) as DirHandle;
  // Ask the browser not to clear it under storage pressure. Some browsers prompt for this, so it never blocks
  void navigator.storage.persist?.().catch(() => false);
  return { kind: "browser", root, label: "this browser" };
}

/* ---------- Files ---------- */

/** "chapter-03" style folder per chapter, so the folder makes sense in any audio editor. */
export function chapterFolder(index: number) {
  return `chapter-${String(index + 1).padStart(2, "0")}`;
}

/** Mastered, store-ready files go here, next to the raw recordings. */
export const EXPORT_FOLDER = "export";

/** Removes every file in a folder (used to clear old exports before a full export). */
export async function clearFolder(store: AudioStore, folder: string) {
  try {
    const dir = (await dirFor(store.root, [folder], false)) as DirHandle;
    if (!dir.values) return;
    const names: string[] = [];
    for await (const h of dir.values()) if (h.kind === "file") names.push(h.name);
    for (const n of names) await dir.removeEntry(n);
  } catch {
    /* nothing there yet */
  }
}

/** Every file in one folder. */
export async function folderFiles(store: AudioStore, folder: string): Promise<File[]> {
  try {
    const dir = (await dirFor(store.root, [folder], false)) as DirHandle;
    const out: File[] = [];
    if (dir.values) for await (const h of dir.values()) if (h.kind === "file") out.push(await (h as FileSystemFileHandle).getFile());
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function dirFor(root: DirHandle, parts: string[], create: boolean) {
  let d: FileSystemDirectoryHandle = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

export async function saveFile(store: AudioStore, folder: string, name: string, blob: Blob) {
  const dir = await dirFor(store.root, [folder], true);
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readFile(store: AudioStore, folder: string, name: string): Promise<File | null> {
  try {
    const dir = await dirFor(store.root, [folder], false);
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export async function deleteFile(store: AudioStore, folder: string, name: string) {
  try {
    const dir = await dirFor(store.root, [folder], false);
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** Every file, for the backup zip. */
export async function allFiles(store: AudioStore): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  async function walk(dir: DirHandle, prefix: string) {
    if (!dir.values) return;
    for await (const h of dir.values()) {
      if (h.kind === "file") out.push({ path: `${prefix}${h.name}`, file: await (h as FileSystemFileHandle).getFile() });
      else await walk(h as DirHandle, `${prefix}${h.name}/`);
    }
  }
  await walk(store.root, "");
  return out;
}
