import { useEffect, useRef, useState } from "react";
import { ImageEditor, type ImageEditorSubmission } from "./ImageEditor";
import { MaskEditor, type MaskEditorResult, type MaskEditorDraft } from "./MaskEditor";
import type { ImageEditAction, ImageEditorDraft } from "./imageEditorModel";
import type { MaskEncoding } from "./maskEditorModel";

type Mode = "annotate" | "comment" | "local" | "background";
type Props = {
  file: File;
  action: ImageEditAction;
  language: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  initialMaskFile?: Blob;
  initialEncoding?: MaskEncoding;
  getDraft?: (mode: ImageEditAction) => ImageEditorDraft | undefined;
  onDraft?: (mode: ImageEditAction, draft: ImageEditorDraft) => void;
  maskDraft?: MaskEditorDraft;
  onMaskDraft?: (draft: MaskEditorDraft) => void;
  onMode?: (mode: ImageEditAction) => void;
  onApply: (result: MaskEditorResult) => void;
  onRemove?: () => void;
  onClose: () => void;
  onSent: () => void;
  onSend: (submission: ImageEditorSubmission) => Promise<boolean>;
};

export function ImageEditorWorkspace(props: Props) {
  const initial = props.action === "erase" ? "local" : props.action;
  const [mode, setMode] = useState<Mode>(initial);
  const [visited, setVisited] = useState<Mode[]>([initial]);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const en = props.language === "en";
  useEffect(() => { props.onMode?.(mode); }, [mode]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[data-active="true"] [role="dialog"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  const navigation = <nav className="image-editor-modes" aria-label={en ? "Editing mode" : "编辑模式"}>
    {([ ["annotate", "标注", "Annotate"], ["comment", "位置评论", "Comments"], ["local", "局部修改", "Local edit"], ["background", "移除背景", "Background"] ] as const).map(([id, zh, english]) =>
      <button type="button" key={id} aria-pressed={mode === id} disabled={busy} onClick={() => { setVisited((items) => items.includes(id) ? items : [...items, id]); setMode(id); }}>{en ? english : zh}</button>)}
  </nav>;
  // Keep visited canvases mounted: mode switches retain notes, selection, undo and zoom.
  return <div ref={root}>{visited.map((item) => <div key={item} data-active={item === mode} style={{ display: item === mode ? "contents" : "none" }}>
    {item === "local" ? <MaskEditor unified english={en} navigation={navigation} initialIntent={props.action === "erase" ? "erase" : "local"}
      file={props.file} initialMaskFile={props.initialMaskFile} initialEncoding={props.initialEncoding} t={props.t}
      draft={props.maskDraft} onDraft={props.onMaskDraft}
      onBusyChange={setBusy} onCancel={props.onClose} onApply={props.onApply} onRemove={props.onRemove}
      onSend={async (result, prompt, intent) => {
        const sent = await props.onSend({ action: intent, prompt, references: [result.baseFile], maskFile: result.maskFile, maskEncoding: result.encoding, previewFile: result.previewFile });
        if (sent) props.onSent();
        return sent;
      }} /> : <ImageEditor file={props.file} action={item} language={props.language} navigation={navigation} onBusyChange={setBusy}
      draft={props.getDraft?.(item)} onDraft={(draft) => props.onDraft?.(item, draft)} onClose={props.onClose} onSent={props.onSent} onSend={props.onSend} />}
  </div>)}</div>;
}
