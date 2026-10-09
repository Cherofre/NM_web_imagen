import { useEffect, useRef } from "react";
import { loadEditorDrafts, saveEditorDrafts, type EditorDraftRecord } from "./editorDraftStore";

export function useEditorDrafts(onRestore: (record: EditorDraftRecord) => void, onError: () => void, enabled: boolean) {
  const records = useRef(new Map<string, EditorDraftRecord>());
  const loading = useRef<Promise<void> | null>(null);
  const writes = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(new Set<string>());
  const error = useRef(onError); error.current = onError;
  function load() {
    if (!loading.current) loading.current = loadEditorDrafts().then((items) => {
      items.forEach((r) => { if (!records.current.has(r.sourceKey)) records.current.set(r.sourceKey, r); });
    }).catch(() => { error.current(); });
    return loading.current;
  }
  function flush() {
    clearTimeout(timer.current);
    if (!dirty.current.size) return writes.current;
    const snapshot = structuredClone([...records.current.values()]);
    const changedKeys = new Set(dirty.current);
    dirty.current.clear();
    writes.current = writes.current.then(() => saveEditorDrafts(snapshot, changedKeys)).catch(() => {
      changedKeys.forEach((key) => dirty.current.add(key));
      error.current();
    });
    return writes.current;
  }
  function put(record: EditorDraftRecord) {
    if (record.active) records.current.forEach((r, key) => {
      if (key !== record.sourceKey && r.active) { records.current.set(key, { ...r, active: false }); dirty.current.add(key); }
    });
    records.current.delete(record.sourceKey);
    records.current.set(record.sourceKey, { ...record, updatedAt: Date.now() });
    dirty.current.add(record.sourceKey);
    while (records.current.size > 20) records.current.delete(records.current.keys().next().value!);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 200);
  }
  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    void load().then(() => {
      if (canceled) return;
      const active = [...records.current.values()].filter((r) => r.active).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (active) onRestore(active);
    });
    const save = () => { if (records.current.size) void flush(); };
    const hidden = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => { canceled = true; clearTimeout(timer.current); window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", hidden); };
  }, [enabled]);
  return { records, load, put, flush };
}
