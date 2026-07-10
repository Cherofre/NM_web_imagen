type SubmitMode = "generate" | "chat";

export type ReferenceLoadOutcome<T> =
  | { blocked: true }
  | { blocked: false; result: T };

export function referencesForSubmitMode<T>(mode: SubmitMode, references: T[]): T[] {
  return mode === "chat" ? [] : references;
}

export function referenceUiState(mode: SubmitMode, referenceCount: number) {
  if (mode === "chat") {
    return {
      canAdd: false,
      noticeKey: referenceCount > 0 ? "reference.chatNotSent" : null,
    } as const;
  }

  return {
    canAdd: true,
    noticeKey: null,
  } as const;
}

export async function loadReferenceForCurrentMode<T>(
  getMode: () => SubmitMode,
  loader: () => Promise<T>,
): Promise<ReferenceLoadOutcome<T>> {
  if (getMode() === "chat") return { blocked: true };
  const result = await loader();
  if (getMode() === "chat") return { blocked: true };
  return { blocked: false, result };
}
