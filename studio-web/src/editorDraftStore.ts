import type { ImageEditAction, ImageEditorDraft } from "./imageEditorModel";
import type { MaskEditorDraft } from "./MaskEditor";
import type { MaskEncoding } from "./maskEditorModel";

// Keep image bytes out of localStorage (and out of connection/config exports).
export type EditorDraftRecord = {
  version: 1;
  sourceKey: string;
  imageSourceKey?: string;
  file: Blob;
  name: string;
  lastModified: number;
  action: ImageEditAction;
  active: boolean;
  updatedAt: number;
  drafts: Partial<Record<ImageEditAction, ImageEditorDraft>>;
  mask?: MaskEditorDraft;
  initialMaskFile?: Blob;
  initialEncoding?: MaskEncoding;
  returnTo?: "preview" | "conversation";
};

export function validEditorDraft(value: unknown): value is EditorDraftRecord {
  try {
  const r = value as EditorDraftRecord | null;
  if (r) JSON.stringify([r.drafts, r.mask]); // Reject corrupt cyclic metadata before accounting or restoration.
  return Boolean(r && r.version === 1 && typeof r.sourceKey === "string" && r.sourceKey.length
    && r.file instanceof Blob && r.file.size <= 25 * 1024 * 1024 && typeof r.name === "string"
    && Number.isFinite(r.lastModified) && Number.isFinite(r.updatedAt)
    && ["annotate", "comment", "local", "erase", "background"].includes(r.action)
    && typeof r.active === "boolean" && r.drafts && typeof r.drafts === "object"
    && (r.imageSourceKey === undefined || typeof r.imageSourceKey === "string")
    && (r.returnTo === undefined || r.returnTo === "preview" || r.returnTo === "conversation")
    && Object.values(r.drafts).every((draft) => draft && Array.isArray(draft.objects)
      && typeof draft.prompt === "string" && draft.objects.every((object) => object
        && typeof object.id === "string" && typeof object.text === "string"
        && Number.isFinite(object.width) && Array.isArray(object.points)
        && ["pen", "text", "rect", "ellipse", "arrow", "comment", "eraser"].includes(object.kind)
        && object.points.length > 0 && object.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))))
    && (!r.initialMaskFile || (r.initialMaskFile instanceof Blob && r.initialMaskFile.size <= 25 * 1024 * 1024))
    && (!r.mask || (typeof r.mask.instructions === "string" && ["local", "erase"].includes(r.mask.intent)
      && ["standard", "compat"].includes(r.mask.encoding) && Array.isArray(r.mask.commands)
      && r.mask.commands.every((c) => c && (c.kind === "clear" || c.kind === "fill"
        || (c.kind === "stroke" && ["brush", "eraser"].includes(c.tool) && Number.isFinite(c.size)
          && Array.isArray(c.points) && c.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))))))));
  } catch { return false; }
}

export function retainedEditorDrafts(values: unknown[]) {
  let bytes = 0;
  return values.filter(validEditorDraft).sort((a, b) => b.updatedAt - a.updatedAt).filter((r, index) => {
    bytes += r.file.size + (r.initialMaskFile?.size || 0) + new Blob([JSON.stringify([r.drafts, r.mask])]).size;
    return index < 20 && bytes <= 150 * 1024 * 1024;
  });
}

export function editorDraftFile(record: EditorDraftRecord) {
  return new File([record.file], record.name, { type: record.file.type, lastModified: record.lastModified });
}

export function editorDraftReturnTarget(record: EditorDraftRecord): "preview" | "conversation" {
  if (record.returnTo) return record.returnTo;
  // Pre-navigation drafts from a failed turn used these stable identifiers.
  return /^(submitted|restored):/.test(record.sourceKey) ? "conversation" : "preview";
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("studio-image-editor-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "sourceKey" });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft database blocked"));
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

export async function loadEditorDrafts() {
  const db = await openDatabase();
  return new Promise<EditorDraftRecord[]>((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").getAll();
    tx.oncomplete = () => resolve(retainedEditorDrafts(request.result));
    tx.onabort = () => reject(tx.error || new Error("Draft read aborted"));
  });
}

export async function saveEditorDrafts(records: EditorDraftRecord[], changedKeys?: Set<string>) {
  const db = await openDatabase();
  const retained = retainedEditorDrafts(records);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      try {
        const retainedKeys = new Set(retained.map((record) => record.sourceKey));
        keys.result.forEach((key) => { if (!retainedKeys.has(String(key))) store.delete(key); });
        // Updating a short note must not rewrite every retained original image.
        retained.forEach((record) => { if (!changedKeys || changedKeys.has(record.sourceKey)) store.put(record); });
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Draft save aborted"));
  });
}
