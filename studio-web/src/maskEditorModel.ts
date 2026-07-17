export type ReferenceFileIdentity = {
  name?: string;
  size?: number;
  lastModified?: number;
  type?: string;
};

export type MaskAttachment<FileType extends ReferenceFileIdentity = File> = {
  baseFingerprint: string;
  baseFile: FileType;
  maskFile: FileType;
  coverage?: number;
};

export function referenceFileFingerprint(file: ReferenceFileIdentity | null | undefined) {
  if (!file) return "";
  return [
    String(file.name || ""),
    Number(file.size || 0),
    Number(file.lastModified || 0),
    String(file.type || ""),
  ].join("\u0000");
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
