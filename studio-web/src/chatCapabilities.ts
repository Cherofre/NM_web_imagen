type SubmitMode = "generate" | "chat";

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
