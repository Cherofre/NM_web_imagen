export type Engine = "gpt-image-2" | "banana";

export type SessionGptDraft = {
  prompt: string;
  negative_prompt: string;
  poster_text: string;
};

export type SessionBananaDraft = {
  prompt: string;
};

export type SessionDrafts = {
  gpt: SessionGptDraft;
  banana: SessionBananaDraft;
};

export type SubmissionDraftOverride = {
  prompt?: string;
  gpt?: Partial<SessionGptDraft>;
};

export type SessionLike = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: Array<{
    id: string;
    engine: Engine;
    prompt: string;
    createdAt: string;
    status: "running" | "success" | "error";
    images: Array<Record<string, unknown>>;
  }>;
};

export type ReferenceSwitchChoice = "preserve" | "clear" | "cancel";

export function emptySessionDrafts(): SessionDrafts {
  return {
    gpt: {
      prompt: "",
      negative_prompt: "",
      poster_text: "",
    },
    banana: {
      prompt: "",
    },
  };
}

export function normalizeSessionWithDrafts(session: SessionLike & { drafts?: Partial<SessionDrafts> }) {
  const defaults = emptySessionDrafts();
  return {
    ...session,
    drafts: {
      gpt: {
        ...defaults.gpt,
        ...(session.drafts?.gpt || {}),
      },
      banana: {
        ...defaults.banana,
        ...(session.drafts?.banana || {}),
      },
    },
  };
}

export function getDraftPrompt(engine: Engine, drafts: SessionDrafts) {
  return engine === "banana" ? drafts.banana.prompt : drafts.gpt.prompt;
}

export function applyPromptToDrafts(engine: Engine, drafts: SessionDrafts, prompt: string): SessionDrafts {
  if (engine === "banana") {
    return {
      ...drafts,
      banana: {
        ...drafts.banana,
        prompt,
      },
    };
  }
  return {
    ...drafts,
    gpt: {
      ...drafts.gpt,
      prompt,
    },
  };
}

export function shouldPromptReferenceSwitch(currentReferenceCount: number, nextSessionId: string, activeSessionId: string) {
  return currentReferenceCount > 0 && nextSessionId !== activeSessionId;
}

export function resolveReferenceSwitch(choice: ReferenceSwitchChoice, currentReferences: string[]) {
  if (choice === "cancel") {
    return { keepActiveSession: true, references: currentReferences };
  }
  if (choice === "clear") {
    return { keepActiveSession: false, references: [] };
  }
  return { keepActiveSession: false, references: currentReferences };
}

export function resolveSubmissionDrafts(engine: Engine, drafts: SessionDrafts, overrides: SubmissionDraftOverride = {}) {
  if (engine === "banana") {
    return {
      prompt: overrides.prompt ?? drafts.banana.prompt,
      negative_prompt: "",
      poster_text: "",
    };
  }

  const gptDraft = {
    ...drafts.gpt,
    ...(overrides.gpt || {}),
  };

  return {
    prompt: overrides.prompt ?? gptDraft.prompt,
    negative_prompt: gptDraft.negative_prompt,
    poster_text: gptDraft.poster_text,
  };
}

export function resolveSessionDeletion<T extends { id: string }>(
  sessions: T[],
  activeSessionId: string,
  targetSessionId: string,
  createReplacement: () => T,
) {
  const exists = sessions.some((session) => session.id === targetSessionId);
  const clearReferences = activeSessionId === targetSessionId;
  if (!exists) {
    return {
      sessions,
      nextActiveSessionId: activeSessionId,
      clearReferences,
    };
  }

  if (sessions.length <= 1) {
    const replacement = createReplacement();
    return {
      sessions: [replacement],
      nextActiveSessionId: replacement.id,
      clearReferences,
    };
  }

  const nextSessions = sessions.filter((session) => session.id !== targetSessionId);
  return {
    sessions: nextSessions,
    nextActiveSessionId: clearReferences ? nextSessions[0]?.id || activeSessionId : activeSessionId,
    clearReferences,
  };
}
