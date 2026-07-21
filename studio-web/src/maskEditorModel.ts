export type ReferenceFileIdentity = {
  name?: string;
  size?: number;
  lastModified?: number;
  type?: string;
};

export type MaskEncoding = "standard" | "compat";

export type MaskAttachment<FileType extends ReferenceFileIdentity = File> = {
  baseFingerprint: string;
  baseFile: FileType;
  maskFile: FileType;
  previewFile?: FileType;
  coverage?: number;
  encoding?: MaskEncoding;
};

export function normalizeMaskEncoding(value: unknown): MaskEncoding {
  return value === "compat" ? "compat" : "standard";
}

export function maskAlphaSelectsPixel(alpha: number, encoding: MaskEncoding) {
  const normalizedAlpha = Math.max(0, Math.min(255, Number(alpha) || 0));
  return encoding === "compat" ? normalizedAlpha >= 128 : normalizedAlpha < 128;
}

export function maskPromptHasSpecificTarget(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return false;
  const patterns = [
    "(?:改成|换成|换为|替换成|替换为|改为|调整为|设置为|变成|变得|做成)([^。！？\\n]{2,})",
    "(?:添加|增加|删除|移除|擦除|去掉)([^。！？\\n]{1,})",
    "\\b(?:replace|change|turn|convert|transform)\\b.+?\\b(?:with|to|into)\\b\\s+([^.!?\\n]+)",
    "\\b(?:add|remove|erase|delete)\\b\\s+([^.!?\\n]+)",
  ];
  const vagueTarget = /^(?:(?:(?:另(?:一)?|一|其他|不同|新)?(?:个|种)?(?:的)?(?:风格|样式|效果|内容|画面)(?:一下)?|一下)|(?:a|an)?(?:another|different|new)?(?:style|look|effect|something)?)$/iu;
  for (const source of patterns) {
    const pattern = new RegExp(source, "giu");
    for (const match of text.matchAll(pattern)) {
      const target = String(match[1] || "").split(/[,，;；](?=其余|其他|人物|主体|未涂|遮罩外|选区外)/u, 1)[0];
      const compact = target.replace(/[^0-9A-Za-z\p{Script=Han}]+/gu, "").toLowerCase();
      if (compact.length >= 2 && !vagueTarget.test(compact)) return true;
    }
  }
  return false;
}

export function maskPreviewDimensions(width: number, height: number, maxEdge = 384) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const safeMaxEdge = Math.max(1, Math.floor(Number(maxEdge) || 1));
  if (!safeWidth || !safeHeight) return { width: 0, height: 0 };
  const scale = Math.min(1, safeMaxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function referenceFileFingerprint(file: ReferenceFileIdentity | null | undefined) {
  if (!file) return "";
  return [
    String(file.name || ""),
    Number(file.size || 0),
    Number(file.lastModified || 0),
    String(file.type || ""),
  ].join("\u0000");
}

export function referencesWithMaskBase<FileType>(
  references: readonly FileType[],
  base: FileType,
  limit = 16,
) {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
  return [base, ...references.filter((file) => file !== base)].slice(0, normalizedLimit);
}

export function maskEditorCapability(engine: string, mode: string, referenceCount: number) {
  if (engine !== "gpt-image-2") {
    return { available: false, reasonKey: "mask.gptOnly" };
  }
  if (mode !== "generate") {
    return { available: false, reasonKey: "mask.generateOnly" };
  }
  if (referenceCount < 1) {
    return { available: false, reasonKey: "mask.addBaseFirst" };
  }
  return { available: true, reasonKey: null };
}

export function activeMaskAttachment<FileType extends ReferenceFileIdentity>(
  attachment: MaskAttachment<FileType> | null | undefined,
  references: readonly FileType[],
) {
  if (!attachment || references.length === 0) return null;
  if (references[0] !== attachment.baseFile) return null;
  return referenceFileFingerprint(references[0]) === attachment.baseFingerprint
    ? attachment
    : null;
}

export function resolveMaskEndpoint(apiEndpoint: string, hasMask: boolean) {
  const normalized = String(apiEndpoint || "auto").trim() || "auto";
  if (!hasMask) return normalized;
  if (normalized === "auto" || normalized === "/v1/images/edits") {
    return "/v1/images/edits";
  }
  throw new Error("遮罩只支持 GPT 图片编辑接口，请使用 auto 或 /v1/images/edits");
}

export function appendGenerationFiles(
  formData: FormData,
  references: readonly File[],
  maskFile?: File | null,
) {
  references.forEach((file) => formData.append("reference_files", file));
  if (maskFile) {
    formData.append("mask_file", maskFile);
  }
  return formData;
}
