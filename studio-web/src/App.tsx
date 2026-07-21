import {
  AlertCircle,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock3,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  Heart,
  Images,
  ImagePlus,
  ListX,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { ChangeEvent, ClipboardEvent, type CSSProperties, DragEvent, FocusEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SyntheticEvent, WheelEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  GPT_CUSTOM_SIZE_MAX,
  GPT_CUSTOM_SIZE_MAX_PIXELS,
  GPT_CUSTOM_SIZE_MAX_RATIO,
  GPT_CUSTOM_SIZE_MIN,
  GPT_CUSTOM_SIZE_MIN_PIXELS,
  normalizeCustomImageSize,
  parseCustomImageSize,
} from "./sizeRules";
import { shouldAllowInternalImageDrag, type InternalImageDragIntent } from "./imageDragIntent";
import {
  type GptComposerAspect,
  type GptComposerSizeTier,
  gptComposerAspectOptions,
  gptComposerSizeTiers,
  resolveGptComposerPresetSize,
} from "./sizePresets";
import { deriveGptSizeSelection } from "./gptSizeSelection";
import {
  applyPromptToDrafts,
  emptySessionDrafts,
  getDraftPrompt,
  normalizeSessionWithDrafts,
  resolveReferenceSwitch,
  resolveSessionDeletion,
  resolveSubmissionDrafts,
  shouldPromptReferenceSwitch,
  type ReferenceSwitchChoice,
  type SubmissionDraftOverride,
  type SessionDrafts,
} from "./sessionDrafts";
import { buildSubmissionFields } from "./submissionPayload";
import {
  activeProfileForEngine,
  buildConfigPayload,
  deriveConfigDisplayName,
  normalizeConfigProfiles,
  syncActiveProfileForm,
  type ActiveProfileIds,
  type ConfigProfile,
} from "./configProfiles";
import { normalizeStoredQueueJobs, REFRESH_INTERRUPTED_QUEUE_ERROR, serializeQueueJobs } from "./queuePersistence";
import { appendGenerationQueueJob, nextQueuedGenerationJob } from "./generationQueue";
import {
  hasActiveQueueJobForSession,
  queueJobTargetExists,
  reconcileInterruptedQueueTurns,
} from "./queueSessionBoundaries";
import {
  createTranslator,
  formatUpstreamError,
  LANGUAGE_STORAGE_KEY,
  resolveInitialLanguage,
  type AppLanguage,
} from "./i18n";
import { sanitizeForBrowserStorage, sanitizeStoredJson } from "./clientSafety";
import { loadReferenceForCurrentMode, referenceUiState, referencesForSubmitMode } from "./chatCapabilities";
import { appendJobId, cancelJobThenRemove, cancellationNotice, cancelJobUrl, removeCompletedQueueJobs, settleQueueCancellation, withJobId } from "./jobProtocol";
import { MaskEditor, type MaskEditorResult } from "./MaskEditor";
import {
  activeMaskAttachment,
  appendGenerationFiles,
  maskEditorCapability,
  maskPromptHasSpecificTarget,
  normalizeMaskEncoding,
  referenceFileFingerprint,
  referencesWithMaskBase,
  restoreReusableMaskAttachment,
  resolveMaskEndpoint,
  reusableMaskPayload,
  type MaskAttachment,
  type MaskEncoding,
  type ReusableMaskPayload,
} from "./maskEditorModel";
import {
  historySurfaceAfterEscape,
  positionHistoryQuickPopover,
  recentHistoryEntriesWithImages,
  type HistoryOrigin,
  type HistoryQuickPosition,
  type HistorySurfaceState,
} from "./historySurface";
import {
  advanceSessionServerBaseline,
  applyCanonicalReferenceUpdates,
  buildPersistedBaselineMarkers,
  buildSessionSavePayload,
  normalizePersistedBaselineMarkers,
  normalizeSessionRevision,
  reconcileInitialSessionState,
  reconcileSessionConflictState,
  runSessionSaveWithRetry,
  sessionStateMatchesSnapshot,
  shouldSkipSessionSave,
} from "./sessionRevision";

type Translator = ReturnType<typeof createTranslator>;

type Engine = "gpt-image-2" | "banana";
type TurnStatus = "queued" | "running" | "success" | "error";
type SubmitMode = "generate" | "chat";

type ReferenceSnapshot = {
  id: string;
  name: string;
  size?: number;
  mime_type?: string;
  src?: string;
  dimensions?: { width?: number; height?: number };
};

type GeneratedImage = {
  id?: string;
  name?: string;
  saved_name?: string;
  saved_url?: string;
  saved_path?: string;
  url?: string;
  data_url?: string;
  b64_json?: string;
  mime_type?: string;
  dimensions?: { width?: number; height?: number };
};

type HistoryEntry = {
  id: string;
  engine?: Engine | string;
  prompt?: string;
  negative_prompt?: string;
  created_at?: string;
  favorite?: boolean;
  legacy?: boolean;
  images?: GeneratedImage[];
  meta?: Record<string, unknown>;
  form_state?: Record<string, unknown>;
};

type ConversationTurn = {
  id: string;
  engine: Engine;
  mode?: SubmitMode;
  prompt: string;
  negativePrompt?: string;
  posterText?: string;
  createdAt: string;
  finishedAt?: string;
  status: TurnStatus;
  elapsedSeconds?: number;
  images: GeneratedImage[];
  referenceSnapshots?: ReferenceSnapshot[];
  maskSnapshot?: ReferenceSnapshot;
  reply?: string;
  error?: string;
  meta?: Record<string, unknown>;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SubmitOverrides = {
  mode?: SubmitMode;
  engine?: Engine;
  sessionId?: string;
  prompt?: string;
  draftOverride?: SubmissionDraftOverride;
  references?: File[];
  referenceSnapshots?: ReferenceSnapshot[];
  maskAttachment?: MaskAttachment<File> | null;
  maskSnapshot?: ReferenceSnapshot;
  skipMultiImageConfirm?: boolean;
};

type TooltipState = {
  text: string;
  left: number;
  top: number;
  placement: "top" | "bottom";
};

type InlineTooltipState = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

type WorkbenchSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
  drafts: SessionDrafts;
};

type QueueJob = {
  id: string;
  turnId: string;
  sessionId: string;
  prompt: string;
  engine: Engine;
  configName: string;
  model: string;
  status: "queued" | "running" | "success" | "error" | "canceled";
  createdAt: string;
  finishedAt?: string;
  elapsedSeconds?: number;
  images?: GeneratedImage[];
  error?: string;
};

type GenerationQueuePayload = {
  sessionId: string;
  turnId: string;
  jobId: string;
  engine: Engine;
  prompt: string;
  gptForm: GptForm;
  bananaForm: BananaForm;
  references: File[];
  maskFile?: File;
  maskEncoding?: MaskEncoding;
  contextPrompt: string;
  negativePrompt: string;
  posterText: string;
};

type DiagnosticCapability = "generation" | "chat";

type DiagnosticItem = {
  capability: DiagnosticCapability;
  label?: string;
  ok: boolean;
  endpoint?: string;
  model?: string;
  latency_ms?: number;
  status_code?: number;
  error?: string;
};

type DiagnosticsResult = {
  ok: boolean;
  engine: Engine;
  warning?: string;
  results: DiagnosticItem[];
};

type GptForm = {
  api_key: string;
  base_url: string;
  model: string;
  chat_model: string;
  reasoning_effort: string;
  size: string;
  custom_size: string;
  quality: string;
  n: number;
  seed: number;
  style_preset: string;
  enhance_prompt: boolean;
  safety_check: boolean;
  response_format: string;
  edit_mode: string;
  reference_strength: number;
  timeout: number;
  infinite_timeout: boolean;
  api_endpoint: string;
};

type BananaForm = {
  api_key: string;
  api_base_url: string;
  model_type: string;
  batch_size: number;
  aspect_ratio: string;
  image_size: string;
  seed: number;
  top_p: number;
  timeout_seconds: number;
  infinite_timeout: boolean;
  bypass_proxy: boolean;
  disable_ssl: boolean;
};

type ConfigPayload = {
  active_engine?: Engine;
  active_profile_ids?: Partial<ActiveProfileIds>;
  profiles?: ConfigProfile[];
  forms?: {
    "gpt-image-2-form"?: Partial<GptForm>;
    "banana-form"?: Partial<BananaForm>;
  };
  sources?: string[];
};

const sessionStorageKey = "image-generate-web-tool:studio-session";
const sessionsStorageKey = "image-generate-web-tool:studio-sessions";
const activeSessionStorageKey = "image-generate-web-tool:studio-active-session";
const sessionBaselineStorageKey = "image-generate-web-tool:studio-session-server-baseline-v1";
const gptStorageKey = "image-generate-web-tool:studio-gpt-form";
const bananaStorageKey = "image-generate-web-tool:studio-banana-form";
const engineStorageKey = "image-generate-web-tool:studio-active-engine";
const queueStorageKey = "image-generate-web-tool:studio-queue";
const composerPromptHeightStorageKey = "image-generate-web-tool:studio-composer-prompt-height";
const maxTurns = 80;

const gptSizeOptions = ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x864", "2048x2048", "2048x1152", "3840x2160", "2160x3840", "custom"];
const gptQualityOptions = ["auto", "low", "medium", "high"];
const gptChatModelOptions = ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.2", "custom"];
const gptReasoningOptions = ["auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
const bananaAspectOptions = ["Auto", "1:1", "1:4", "1:8", "4:1", "8:1", "9:16", "16:9", "21:9", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4"];
const bananaImageSizeOptions = ["无", "1K", "2K", "4K"];

type PreviewImage = {
  src: string;
  name: string;
  dimensions?: { width?: number; height?: number };
  requestedSize?: string;
  objectUrl?: boolean;
  sourceFile?: File;
  gallery?: PreviewImage[];
  galleryIndex?: number;
  historyEntryId?: string;
  historyOrigin?: HistoryOrigin;
  isMaskSnapshot?: boolean;
};

type PreviewHistoryContext = {
  historyEntryId: string;
  historyOrigin: HistoryOrigin;
  requestedSize?: string;
};

type HistoryFavoriteFilter = "all" | "favorite";
type HistoryDateFilter = "all" | "today" | "7d" | "30d";
type HistoryEngineFilter = "all" | Engine;
type HistoryActionMenuSource = "sidebar" | "browser";
type HistoryActionMenuState = {
  entryId: string;
  source: HistoryActionMenuSource;
  left: number;
  top: number;
  placement: "above" | "below";
};

type PendingSessionSwitch = {
  nextSessionId: string;
  nextSessionTitle: string;
};

type PendingMultiImageConfirm = {
  count: number;
  engine: Engine;
  overrides: SubmitOverrides;
};

const COMPOSER_PROMPT_DEFAULT_HEIGHT = 148;
const COMPOSER_PROMPT_MIN_HEIGHT = 118;
const COMPOSER_PROMPT_MAX_HEIGHT = 360;
const QUEUE_POPOVER_DEFAULT_WIDTH = 366;
const QUEUE_POPOVER_DEFAULT_HEIGHT = 310;
const QUEUE_POPOVER_MIN_WIDTH = 320;
const QUEUE_POPOVER_MAX_WIDTH = 560;
const QUEUE_POPOVER_MIN_HEIGHT = 220;
const QUEUE_POPOVER_MAX_HEIGHT = 520;
const SIDEBAR_NARROW_QUERY = "(max-width: 920px)";
const HISTORY_BROWSER_PAGE_SIZE = 80;
const HISTORY_QUICK_ENTRY_LIMIT = 12;
const HISTORY_QUICK_POPOVER_SIZE = { width: 340, height: 340 };
const ACTION_MENU_SELECTOR = "details.header-more-menu, details.image-more-actions";
const OPEN_ACTION_MENU_SELECTOR = "details.header-more-menu[open], details.image-more-actions[open]";

function closeOpenActionMenus(except?: Node | null) {
  let closed = false;
  document.querySelectorAll<HTMLDetailsElement>(OPEN_ACTION_MENU_SELECTOR).forEach((menu) => {
    if (except && menu.contains(except)) return;
    menu.open = false;
    closed = true;
  });
  return closed;
}

type SessionPromptEditorDraft = {
  fixed_prompt: string;
  negative_prompt: string;
  poster_text: string;
};

function readFileAsDataUrl(file: File, fallbackError = "Failed to read reference image"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error(fallbackError)));
    reader.readAsDataURL(file);
  });
}

function shouldStartHistoryCollapsed() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(SIDEBAR_NARROW_QUERY).matches;
}

function createEmptySession(title = "新对话"): WorkbenchSession {
  const now = new Date().toISOString();
  return {
    id: makeId("session"),
    title,
    createdAt: now,
    updatedAt: now,
    turns: [],
    drafts: emptySessionDrafts(),
  };
}

const defaultGptForm: GptForm = {
  api_key: "",
  base_url: "https://gpt-image-api.example.com",
  model: "gpt-image-2",
  chat_model: "gpt-5.6",
  reasoning_effort: "auto",
  size: "auto",
  custom_size: "1536x864",
  quality: "auto",
  n: 1,
  seed: -1,
  style_preset: "none",
  enhance_prompt: true,
  safety_check: true,
  response_format: "auto",
  edit_mode: "generate",
  reference_strength: 0.7,
  timeout: 300,
  infinite_timeout: false,
  api_endpoint: "auto",
};

const defaultBananaForm: BananaForm = {
  api_key: "",
  api_base_url: "https://banana-api.example.com",
  model_type: "gemini-3-pro-image-preview",
  batch_size: 1,
  aspect_ratio: "Auto",
  image_size: "2K",
  seed: -1,
  top_p: 0.95,
  timeout_seconds: 60,
  infinite_timeout: true,
  bypass_proxy: false,
  disable_ssl: false,
};

const inspirationPromptKeys = ["characterPoster", "museumGuide", "gameScreenshot"];

function engineLabel(engine: Engine | string) {
  return engine === "banana" ? "Banana Gemini" : "GPT Image 2";
}

function makeId(prefix: string) {
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value?: string, language: AppLanguage = "zh-CN") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function imageSrc(image?: GeneratedImage) {
  if (!image) return "";
  if (image.saved_url) return image.saved_url;
  if (image.url) return image.url;
  if (image.data_url) return image.data_url;
  if (image.b64_json) return `data:${image.mime_type || "image/png"};base64,${image.b64_json}`;
  return "";
}

function imageName(image?: GeneratedImage, index = 0) {
  return image?.saved_name || image?.name || `image-${index + 1}.png`;
}

function imageDimensionsLabel(image?: GeneratedImage | null) {
  const width = Number(image?.dimensions?.width || 0);
  const height = Number(image?.dimensions?.height || 0);
  return width > 0 && height > 0 ? `${width} x ${height}` : "";
}

function sharedImageDimensionsLabel(images: GeneratedImage[]) {
  if (images.length === 0) return "";
  const labels = images.map((image) => imageDimensionsLabel(image));
  const firstLabel = labels[0];
  return firstLabel && labels.every((label) => label === firstLabel) ? firstLabel : "";
}

function resultImageStyle(image?: GeneratedImage): CSSProperties {
  const width = Number(image?.dimensions?.width || 0);
  const height = Number(image?.dimensions?.height || 0);
  if (width <= 0 || height <= 0) return {};
  return { "--result-aspect": `${width} / ${height}` } as CSSProperties;
}

function resultImageOrientation(image?: GeneratedImage) {
  const width = Number(image?.dimensions?.width || 0);
  const height = Number(image?.dimensions?.height || 0);
  if (width <= 0 || height <= 0) return "result-square";
  const ratio = width / height;
  if (ratio < 0.82) return "result-portrait";
  if (ratio > 1.22) return "result-landscape";
  return "result-square";
}

function requestedSizeLabel(entry: HistoryEntry) {
  const metaSize = String(entry.meta?.size || "").trim();
  const formSize = String(entry.form_state?.size || "").trim();
  const customSize = String(entry.form_state?.custom_size || "").trim();
  const value = metaSize && metaSize !== "auto" ? metaSize : formSize === "custom" ? customSize : formSize;
  if (value && value !== "auto") return value.replace(/x/i, " x ");
  const bananaSize = String(entry.meta?.image_size || entry.form_state?.image_size || "").trim();
  const bananaAspect = String(entry.meta?.aspect_ratio || entry.form_state?.aspect_ratio || "").trim();
  return [bananaSize, bananaAspect].filter((item) => item && item !== "auto" && item !== "无").join(" / ");
}

function dimensionMismatchLabel(entry: HistoryEntry, image?: GeneratedImage | null) {
  const actual = imageDimensionsLabel(image);
  const requested = requestedSizeLabel(entry);
  return actual && requested && actual !== requested ? `${requested} -> ${actual}` : "";
}

function filteredHistoryEntries(
  entries: HistoryEntry[],
  favoriteFilter: HistoryFavoriteFilter,
  dateFilter: HistoryDateFilter,
  engineFilter: HistoryEngineFilter,
) {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const minTime = dateFilter === "today"
    ? startOfToday.getTime()
    : dateFilter === "7d"
      ? now - 7 * 24 * 60 * 60 * 1000
      : dateFilter === "30d"
        ? now - 30 * 24 * 60 * 60 * 1000
        : 0;

  return entries.filter((entry) => {
    if (favoriteFilter === "favorite" && !entry.favorite) return false;
    if (engineFilter !== "all" && entry.engine !== engineFilter) return false;
    if (minTime > 0) {
      const timestamp = entry.created_at ? new Date(entry.created_at).getTime() : 0;
      if (!Number.isFinite(timestamp) || timestamp < minTime) return false;
    }
    return true;
  });
}

function compactGeneratedImage(image: GeneratedImage): GeneratedImage {
  const compact: GeneratedImage = {
    id: image.id,
    name: image.name,
    saved_name: image.saved_name,
    saved_url: image.saved_url,
    saved_path: image.saved_path,
    url: image.url,
    mime_type: image.mime_type,
    dimensions: image.dimensions,
  };
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== "")) as GeneratedImage;
}

function compactReferenceSnapshot(snapshot: ReferenceSnapshot, keepSrc = true): ReferenceSnapshot {
  const compact: ReferenceSnapshot = {
    id: snapshot.id,
    name: snapshot.name,
    size: snapshot.size,
    mime_type: snapshot.mime_type,
    src: keepSrc ? snapshot.src : undefined,
    dimensions: snapshot.dimensions,
  };
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== "")) as ReferenceSnapshot;
}

function compactTurn(turn: ConversationTurn, keepReferenceSrc = true): ConversationTurn {
  const compact: ConversationTurn = {
    ...turn,
    images: turn.images.map(compactGeneratedImage),
    referenceSnapshots: turn.referenceSnapshots?.map((snapshot) => compactReferenceSnapshot(snapshot, keepReferenceSrc)),
    maskSnapshot: turn.maskSnapshot ? compactReferenceSnapshot(turn.maskSnapshot, keepReferenceSrc) : undefined,
  };
  if (!compact.posterText) {
    delete compact.posterText;
  }
  return compact;
}

function turnUsesMaskGuidance(turn: ConversationTurn) {
  return Boolean(turn.maskSnapshot || turn.meta?.mask_used || turn.meta?.mask_guidance);
}

function compactInlineText(value: string, limit = 26) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function queueJobTitle(job: QueueJob, fallback: string) {
  return compactInlineText(job.prompt, 24) || fallback;
}

function normalizeComposerPromptHeight(value: number) {
  return Math.min(COMPOSER_PROMPT_MAX_HEIGHT, Math.max(COMPOSER_PROMPT_MIN_HEIGHT, Math.round(value)));
}

function composerPromptMaxHeight(viewportHeight?: number) {
  const resolvedViewportHeight = typeof viewportHeight === "number" && Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : typeof window === "undefined"
    ? 0
    : window.innerHeight;
  const viewportMax = resolvedViewportHeight > 0 ? Math.floor(resolvedViewportHeight * 0.44) : COMPOSER_PROMPT_MAX_HEIGHT;
  return Math.max(COMPOSER_PROMPT_MIN_HEIGHT, Math.min(COMPOSER_PROMPT_MAX_HEIGHT, viewportMax));
}

function clampComposerPromptHeight(value: number, viewportHeight?: number) {
  return Math.min(composerPromptMaxHeight(viewportHeight), normalizeComposerPromptHeight(value));
}

function readStoredComposerPromptHeight() {
  if (typeof localStorage === "undefined") return COMPOSER_PROMPT_DEFAULT_HEIGHT;
  try {
    const raw = localStorage.getItem(composerPromptHeightStorageKey);
    if (!raw) return COMPOSER_PROMPT_DEFAULT_HEIGHT;
    const value = Number(raw);
    return Number.isFinite(value) ? normalizeComposerPromptHeight(value) : COMPOSER_PROMPT_DEFAULT_HEIGHT;
  } catch {
    return COMPOSER_PROMPT_DEFAULT_HEIGHT;
  }
}

function saveStoredComposerPromptHeight(value: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(composerPromptHeightStorageKey, String(Math.round(value)));
  } catch {
    // Layout preferences should never block the composer when browser storage is unavailable.
  }
}

function clearStoredComposerPromptHeight() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(composerPromptHeightStorageKey);
  } catch {
    // Reset still applies in memory when browser storage is unavailable.
  }
}

function clampQueuePopoverSize(width: number, height: number) {
  const viewportWidthMax = typeof window === "undefined" ? QUEUE_POPOVER_MAX_WIDTH : window.innerWidth - 52;
  const viewportHeightMax = typeof window === "undefined" ? QUEUE_POPOVER_MAX_HEIGHT : window.innerHeight - 240;
  const maxWidth = Math.max(QUEUE_POPOVER_MIN_WIDTH, Math.min(QUEUE_POPOVER_MAX_WIDTH, viewportWidthMax));
  const maxHeight = Math.max(QUEUE_POPOVER_MIN_HEIGHT, Math.min(QUEUE_POPOVER_MAX_HEIGHT, viewportHeightMax));
  return {
    width: Math.min(maxWidth, Math.max(QUEUE_POPOVER_MIN_WIDTH, Math.round(width))),
    height: Math.min(maxHeight, Math.max(QUEUE_POPOVER_MIN_HEIGHT, Math.round(height))),
  };
}

function summarizeSessionPromptDrafts(drafts: SessionDrafts, t: Translator) {
  return [
    drafts.shared.fixed_prompt ? t("sessionPrompt.summaryFixed", { value: compactInlineText(drafts.shared.fixed_prompt) }) : "",
    drafts.gpt.negative_prompt ? t("sessionPrompt.summaryNegative", { value: compactInlineText(drafts.gpt.negative_prompt) }) : "",
    drafts.gpt.poster_text ? t("sessionPrompt.summaryText", { value: compactInlineText(drafts.gpt.poster_text) }) : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function createSessionPromptEditorDraft(drafts: SessionDrafts): SessionPromptEditorDraft {
  return {
    fixed_prompt: drafts.shared.fixed_prompt,
    negative_prompt: drafts.gpt.negative_prompt,
    poster_text: drafts.gpt.poster_text,
  };
}

function compactSessionsForStorage(sessions: WorkbenchSession[], keepReferenceSrc = true) {
  return sortSessionsNewestFirst(sessions).slice(0, 80).map((session) => ({
    ...session,
    drafts: {
      shared: {
        fixed_prompt: session.drafts.shared.fixed_prompt,
      },
      gpt: {
        prompt: session.drafts.gpt.prompt,
        negative_prompt: session.drafts.gpt.negative_prompt,
        poster_text: session.drafts.gpt.poster_text,
      },
      banana: {
        prompt: session.drafts.banana.prompt,
      },
    },
    turns: session.turns.slice(-maxTurns).map((turn) => compactTurn(turn, keepReferenceSrc)),
  }));
}

function coerceNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (fallback && typeof fallback === "object" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function loadPersistedSessionBaselineMarkers() {
  try {
    const raw = localStorage.getItem(sessionBaselineStorageKey);
    return normalizePersistedBaselineMarkers(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}

function persistSessionBaselineMarkers(
  revision: number,
  activeSessionId: string,
  sessions: WorkbenchSession[],
) {
  const markers = buildPersistedBaselineMarkers({
    revision,
    activeSessionId,
    sessions,
  });
  try {
    localStorage.setItem(sessionBaselineStorageKey, JSON.stringify(markers));
    return markers;
  } catch {
    try {
      localStorage.removeItem(sessionBaselineStorageKey);
    } catch {
      // A missing marker intentionally falls back to the loss-avoiding startup union.
    }
    return null;
  }
}

function loadSanitizedBrowserForm<T>(key: string, fallback: T): T {
  try {
    const sanitized = sanitizeStoredJson(localStorage.getItem(key), fallback);
    localStorage.setItem(key, JSON.stringify(sanitizeForBrowserStorage(sanitized)));
    return sanitized;
  } catch {
    return fallback;
  }
}

function sessionTitleFromTurns(turns: ConversationTurn[], fallback = "新对话") {
  const firstPrompt = turns.find((turn) => turn.prompt.trim())?.prompt.trim();
  if (!firstPrompt) return fallback;
  return firstPrompt.length > 24 ? `${firstPrompt.slice(0, 24)}...` : firstPrompt;
}

function localizeSessionTitle(title: string, t: Translator) {
  const trimmed = title.trim();
  if (trimmed === "新对话" || trimmed === "New chat") {
    return t("session.new");
  }
  const numbered = trimmed.match(/^(?:新对话|New chat) (\d+)$/);
  if (numbered) {
    return t("session.newNumber", { count: numbered[1] });
  }
  return title || t("session.new");
}

function formatStoredErrorMessage(t: Translator, message: string) {
  if (message === REFRESH_INTERRUPTED_QUEUE_ERROR || message === "页面刷新，任务已中断") {
    return t("status.queueInterrupted");
  }
  return formatUpstreamError(t, message);
}

function buildChatContextMessages(turns: ConversationTurn[], currentTurnId: string, t: Translator, limit = 12): ChatMessage[] {
  const context: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.id === currentTurnId) break;
    const prompt = turn.prompt.trim();
    if (prompt) {
      context.push({ role: "user", content: prompt });
    }

    if (turn.reply?.trim()) {
      context.push({ role: "assistant", content: turn.reply.trim() });
      continue;
    }

    if (turn.mode !== "chat" && turn.status === "success") {
      const count = turn.images.length;
      const imageSummary = count > 0 ? t("prompt.imageSummary", { count }) : t("prompt.imageSummaryEmpty");
      const metaMessages = Array.isArray(turn.meta?.messages) ? turn.meta.messages : [];
      const textMessages = metaMessages.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3);
      context.push({
        role: "assistant",
        content: [imageSummary, ...textMessages].join("\n"),
      });
    } else if (turn.error?.trim()) {
      context.push({ role: "assistant", content: t("prompt.previousFailed", { error: formatStoredErrorMessage(t, turn.error.trim()) }) });
    }
  }
  return context.slice(-limit);
}

function buildGenerationContextPrompt(turns: ConversationTurn[], t: Translator, limit = 10) {
  const messages = buildChatContextMessages(turns, "", t, limit);
  if (!messages.length) return "";
  return messages
    .map((message) => {
      const label = message.role === "assistant" ? t("prompt.assistantLabel") : t("prompt.userLabel");
      return `${label}: ${message.content}`;
    })
    .join("\n\n");
}

function runningTurnSeconds(turn: ConversationTurn, nowMs: number) {
  const startedAt = new Date(turn.createdAt).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((nowMs - startedAt) / 1000));
}

function runningTurnMessage(turn: ConversationTurn, nowMs: number, t: Translator) {
  const seconds = runningTurnSeconds(turn, nowMs);
  if (turn.mode === "chat") {
    if (seconds < 4) return t("running.chatShort", { seconds });
    if (seconds < 12) return t("running.chatThinking", { seconds });
    return t("running.chatUpstream", { seconds });
  }
  if (seconds < 6) return t("running.generateSubmit", { seconds });
  if (seconds < 20) return t("running.generateWait", { seconds });
  return t("running.generateLong", { seconds });
}

function sessionTimestamp(session: WorkbenchSession) {
  const time = new Date(session.updatedAt || session.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortSessionsNewestFirst(sessions: WorkbenchSession[]) {
  return [...sessions].sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left));
}

function isPlaceholderValue(value: string, placeholder: string) {
  return value.trim() === "" || value.trim() === placeholder;
}

function configIssues(engine: Engine, gpt: GptForm, banana: BananaForm, t?: Translator) {
  const issues: string[] = [];
  const apiUrlLabel = t ? t("config.apiUrl") : "API 请求地址";
  const modelLabel = t ? t("config.modelName") : "模型名";
  if (engine === "banana") {
    if (!banana.api_key.trim()) issues.push("API Key");
    if (isPlaceholderValue(banana.api_base_url, defaultBananaForm.api_base_url)) issues.push(apiUrlLabel);
    if (!banana.model_type.trim()) issues.push(modelLabel);
  } else {
    if (!gpt.api_key.trim()) issues.push("API Key");
    if (isPlaceholderValue(gpt.base_url, defaultGptForm.base_url)) issues.push(apiUrlLabel);
    if (!gpt.model.trim()) issues.push(modelLabel);
  }
  return issues;
}

function normalizeSessions(value: unknown, queueJobs: QueueJob[] = []): WorkbenchSession[] {
  if (!Array.isArray(value)) return [];
  const sessions = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<WorkbenchSession> & { drafts?: Partial<SessionDrafts> };
      const turns = Array.isArray(source.turns) ? source.turns.slice(-maxTurns).map((turn) => compactTurn(turn)) : [];
      const now = new Date().toISOString();
      return normalizeSessionWithDrafts({
        id: typeof source.id === "string" && source.id ? source.id : makeId("session"),
        title: typeof source.title === "string" && source.title ? source.title : sessionTitleFromTurns(turns),
        createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
        updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
        turns,
        drafts: source.drafts,
      });
    })
    .filter((item): item is WorkbenchSession => Boolean(item));
  return reconcileInterruptedQueueTurns(sessions, queueJobs) as WorkbenchSession[];
}

function loadWorkbenchSessionState(queueJobs: QueueJob[] = []) {
  let sessions: WorkbenchSession[] = [];
  try {
    sessions = normalizeSessions(JSON.parse(localStorage.getItem(sessionsStorageKey) || "[]"), queueJobs);
  } catch {
    sessions = [];
  }

  if (sessions.length === 0) {
    try {
      const legacyTurns = JSON.parse(localStorage.getItem(sessionStorageKey) || "[]");
      if (Array.isArray(legacyTurns) && legacyTurns.length > 0) {
        const now = new Date().toISOString();
        sessions = [normalizeSessionWithDrafts({
          id: makeId("session"),
          title: sessionTitleFromTurns(legacyTurns),
          createdAt: legacyTurns[0]?.createdAt || now,
          updatedAt: legacyTurns[legacyTurns.length - 1]?.finishedAt || legacyTurns[legacyTurns.length - 1]?.createdAt || now,
          turns: legacyTurns.slice(-maxTurns),
        })];
      }
    } catch {
      sessions = [];
    }
  }

  if (sessions.length === 0) {
    sessions = [createEmptySession()];
  }
  sessions = sortSessionsNewestFirst(sessions);

  const savedActive = localStorage.getItem(activeSessionStorageKey);
  const activeSessionId = sessions.some((session) => session.id === savedActive) ? savedActive || sessions[0].id : sessions[0].id;
  return { sessions, activeSessionId };
}

function normalizeSessionStatePayload(payload: unknown, queueJobs: QueueJob[] = []) {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as { revision?: unknown; sessions?: unknown; active_session_id?: unknown; activeSessionId?: unknown };
  if (!Array.isArray(source.sessions)) return null;
  const sessions = normalizeSessions(source.sessions, queueJobs);
  const activeCandidate = typeof source.active_session_id === "string"
    ? source.active_session_id
    : typeof source.activeSessionId === "string"
    ? source.activeSessionId
    : "";
  return {
    sessions,
    activeSessionId: sessions.some((session) => session.id === activeCandidate) ? activeCandidate : sessions[0]?.id || "",
    revision: normalizeSessionRevision(source.revision),
  };
}

function normalizeGptForm(value: Partial<GptForm> = {}): GptForm {
  const normalizedSize = normalizeCustomImageSize(value.custom_size || defaultGptForm.custom_size).value;
  const reasoningEffort = gptReasoningOptions.includes(String(value.reasoning_effort || ""))
    ? String(value.reasoning_effort)
    : defaultGptForm.reasoning_effort;
  return {
    ...defaultGptForm,
    ...value,
    custom_size: normalizedSize,
    chat_model: value.chat_model || defaultGptForm.chat_model,
    reasoning_effort: reasoningEffort,
    n: coerceNumber(value.n, defaultGptForm.n),
    seed: coerceNumber(value.seed, defaultGptForm.seed),
    reference_strength: coerceNumber(value.reference_strength, defaultGptForm.reference_strength),
    timeout: coerceNumber(value.timeout, defaultGptForm.timeout),
    enhance_prompt: coerceBoolean(value.enhance_prompt, defaultGptForm.enhance_prompt),
    safety_check: coerceBoolean(value.safety_check, defaultGptForm.safety_check),
    infinite_timeout: coerceBoolean(value.infinite_timeout, defaultGptForm.infinite_timeout),
  };
}

function normalizeBananaForm(value: Partial<BananaForm> = {}): BananaForm {
  return {
    ...defaultBananaForm,
    ...value,
    batch_size: coerceNumber(value.batch_size, defaultBananaForm.batch_size),
    seed: coerceNumber(value.seed, defaultBananaForm.seed),
    top_p: coerceNumber(value.top_p, defaultBananaForm.top_p),
    timeout_seconds: coerceNumber(value.timeout_seconds, defaultBananaForm.timeout_seconds),
    infinite_timeout: coerceBoolean(value.infinite_timeout, defaultBananaForm.infinite_timeout),
    bypass_proxy: coerceBoolean(value.bypass_proxy, defaultBananaForm.bypass_proxy),
    disable_ssl: coerceBoolean(value.disable_ssl, defaultBananaForm.disable_ssl),
  };
}

function createFormData(
  engine: Engine,
  prompt: string,
  gpt: GptForm,
  banana: BananaForm,
  references: File[],
  maskFile: File | null | undefined,
  maskEncoding: MaskEncoding | null | undefined,
  gptTextDraft: { context_prompt?: string; negative_prompt?: string; poster_text?: string } | undefined,
  jobId: string,
) {
  const data = new FormData();
  const source = engine === "banana" ? banana : { ...gpt, custom_size: normalizeCustomImageSize(gpt.custom_size).value };
  buildSubmissionFields(engine, prompt, source, banana, gptTextDraft).forEach(([key, value]) => {
    data.append(key, String(value));
  });
  appendGenerationFiles(data, references, maskFile);
  if (maskFile) {
    data.append("mask_encoding", normalizeMaskEncoding(maskEncoding));
  }
  return appendJobId(data, jobId);
}

function createChatPayload(
  engine: Engine,
  prompt: string,
  gpt: GptForm,
  banana: BananaForm,
  messages: ChatMessage[],
  jobId: string,
) {
  if (engine === "banana") {
    return withJobId({
      prompt,
      messages,
      api_key: banana.api_key,
      api_base_url: banana.api_base_url,
      model_type: banana.model_type,
      top_p: banana.top_p,
      timeout_seconds: banana.timeout_seconds,
      bypass_proxy: banana.bypass_proxy,
      disable_ssl: banana.disable_ssl,
    }, jobId);
  }
  return withJobId({
    prompt,
    messages,
    api_key: gpt.api_key,
    base_url: gpt.base_url,
    model: gpt.chat_model || gpt.model,
    chat_model: gpt.chat_model,
    reasoning_effort: gpt.reasoning_effort,
    timeout: gpt.timeout,
  }, jobId);
}

function cancellationNoticeFromPayload(payload: unknown, language: AppLanguage) {
  if (payload && typeof payload === "object" && "warning" in payload) {
    const warning = String((payload as { warning?: unknown }).warning || "").trim();
    if (warning && warning.length <= 400) return warning;
  }
  return cancellationNotice(language);
}

function createDiagnosticPayload(engine: Engine, gpt: GptForm, banana: BananaForm) {
  if (engine === "banana") {
    return {
      engine,
      api_key: banana.api_key,
      api_base_url: banana.api_base_url,
      model_type: banana.model_type,
      timeout_seconds: banana.timeout_seconds,
      bypass_proxy: banana.bypass_proxy,
      disable_ssl: banana.disable_ssl,
      checks: ["generation", "chat"],
    };
  }
  return {
    engine,
    api_key: gpt.api_key,
    base_url: gpt.base_url,
    model: gpt.model,
    chat_model: gpt.chat_model,
    reasoning_effort: gpt.reasoning_effort,
    timeout: gpt.timeout,
    checks: ["generation", "chat"],
  };
}

const gptHistoryKeys: Array<keyof GptForm> = [
  "chat_model",
  "reasoning_effort",
  "size",
  "custom_size",
  "quality",
  "n",
  "seed",
  "style_preset",
  "enhance_prompt",
  "safety_check",
  "response_format",
  "edit_mode",
  "reference_strength",
  "timeout",
  "infinite_timeout",
  "api_endpoint",
];

const bananaHistoryKeys: Array<keyof BananaForm> = [
  "batch_size",
  "aspect_ratio",
  "image_size",
  "seed",
  "top_p",
  "timeout_seconds",
  "infinite_timeout",
  "bypass_proxy",
  "disable_ssl",
];

function pickHistoryState<T extends Record<string, unknown>>(source: Record<string, unknown>, keys: Array<keyof T>) {
  return keys.reduce((next, key) => {
    const name = String(key);
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      next[name] = source[name];
    }
    return next;
  }, {} as Record<string, unknown>);
}

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return payload.detail || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function isSameOriginOutput(src: string) {
  try {
    const url = new URL(src, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/outputs/");
  } catch {
    return false;
  }
}

function isPreviewControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, .lightbox-zoom-tools"));
}

function App() {
  const initialQueueJobs = useRef(normalizeStoredQueueJobs(loadJson(queueStorageKey, [])) as QueueJob[]);
  const initialSessionState = useRef(loadWorkbenchSessionState(initialQueueJobs.current));
  const initialComposerPromptHeight = useRef(readStoredComposerPromptHeight());
  const [language, setLanguage] = useState<AppLanguage>(() => resolveInitialLanguage(typeof localStorage === "undefined" ? null : localStorage));
  const [activeEngine, setActiveEngine] = useState<Engine>("gpt-image-2");
  const [gptForm, setGptForm] = useState<GptForm>(() => normalizeGptForm(loadSanitizedBrowserForm(gptStorageKey, defaultGptForm)));
  const [bananaForm, setBananaForm] = useState<BananaForm>(() => normalizeBananaForm(loadSanitizedBrowserForm(bananaStorageKey, defaultBananaForm)));
  const [references, setReferences] = useState<File[]>([]);
  const [maskAttachment, setMaskAttachment] = useState<MaskAttachment<File> | null>(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [sessions, setSessions] = useState<WorkbenchSession[]>(() => initialSessionState.current.sessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialSessionState.current.activeSessionId);
  const [submitMode, setSubmitMode] = useState<SubmitMode>("generate");
  const [sidebarMode, setSidebarMode] = useState<"sessions" | "history">("sessions");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySurface, setHistorySurface] = useState<HistorySurfaceState>({ mode: "closed" });
  const [historyQuickPosition, setHistoryQuickPosition] = useState<HistoryQuickPosition | null>(null);
  const [historyFavoriteFilter, setHistoryFavoriteFilter] = useState<HistoryFavoriteFilter>("all");
  const [historyDateFilter, setHistoryDateFilter] = useState<HistoryDateFilter>("all");
  const [historyEngineFilter, setHistoryEngineFilter] = useState<HistoryEngineFilter>("all");
  const [historyBrowserLimit, setHistoryBrowserLimit] = useState(HISTORY_BROWSER_PAGE_SIZE);
  const [historyCollapsed, setHistoryCollapsed] = useState(() => shouldStartHistoryCollapsed());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [activeProfileIds, setActiveProfileIds] = useState<ActiveProfileIds>({
    "gpt-image-2": "gpt-image-2-default",
    banana: "banana-default",
  });
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>(() => initialQueueJobs.current);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<DiagnosticsResult | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorDraft, setPromptEditorDraft] = useState("");
  const [sessionPromptOpen, setSessionPromptOpen] = useState(false);
  const [sessionPromptDraft, setSessionPromptDraft] = useState<SessionPromptEditorDraft>(() => createSessionPromptEditorDraft(initialSessionState.current.sessions[0]?.drafts || emptySessionDrafts()));
  const [composerPromptHeightPreference, setComposerPromptHeightPreference] = useState(() => initialComposerPromptHeight.current);
  const [composerViewportHeight, setComposerViewportHeight] = useState(() => typeof window === "undefined" ? 0 : window.innerHeight);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [composerPopover, setComposerPopover] = useState<"size" | "settings" | null>(null);
  const [historyActionMenu, setHistoryActionMenu] = useState<HistoryActionMenuState | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [previewMaskLoading, setPreviewMaskLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [previewDragging, setPreviewDragging] = useState(false);
  const [queuePopoverSize, setQueuePopoverSize] = useState(() => clampQueuePopoverSize(QUEUE_POPOVER_DEFAULT_WIDTH, QUEUE_POPOVER_DEFAULT_HEIGHT));
  const [dragActive, setDragActive] = useState(false);
  const [draggedReferenceIndex, setDraggedReferenceIndex] = useState<number | null>(null);
  const [referenceDropIndex, setReferenceDropIndex] = useState<number | null>(null);
  const [sizeAdjustmentNotice, setSizeAdjustmentNotice] = useState("");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [pendingSessionSwitch, setPendingSessionSwitch] = useState<PendingSessionSwitch | null>(null);
  const [pendingMultiImageConfirm, setPendingMultiImageConfirm] = useState<PendingMultiImageConfirm | null>(null);
  const [skipMultiImageConfirmForSession, setSkipMultiImageConfirmForSession] = useState(false);
  const [skipMultiImageConfirmChecked, setSkipMultiImageConfirmChecked] = useState(false);
  const [customSizeDraft, setCustomSizeDraft] = useState<{ width: string; height: string }>(() => {
    const parsed = parseCustomImageSize(gptForm.custom_size);
    return { width: String(parsed.width), height: String(parsed.height) };
  });
  const [hasPromptedForConfig, setHasPromptedForConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const t = useMemo(() => createTranslator(language), [language]);
  const listText = (items: string[]) => items.join(language === "en" ? ", " : "、");
  const isDefaultSessionTitle = (title: string) => title === "新对话" || title === "New chat" || title === t("session.new");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptWrapRef = useRef<HTMLDivElement | null>(null);
  const composerResizeRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);
  const composerPromptHeightPreferenceRef = useRef(initialComposerPromptHeight.current);
  const queuePopoverResizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; pointerId: number } | null>(null);
  const previewDialogRef = useRef<HTMLDivElement | null>(null);
  const previewDragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);
  const previewMaskRequestRef = useRef(0);
  const queueAbortControllersRef = useRef<Record<string, AbortController>>({});
  const queuePayloadsRef = useRef<Record<string, GenerationQueuePayload>>({});
  const turnMaskPayloadsRef = useRef<Map<string, ReusableMaskPayload<File>>>(new Map());
  const cancelingQueueJobsRef = useRef<Set<string>>(new Set());
  const queueCancellationSettlementsRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const pendingQueueRemovalsRef = useRef<Map<string, Promise<void>>>(new Map());
  const queueProcessingRef = useRef<string | null>(null);
  const conversationCanvasRef = useRef<HTMLElement | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);
  const composerToolsRef = useRef<HTMLDivElement | null>(null);
  const historyQuickTriggerRef = useRef<HTMLButtonElement | null>(null);
  const historyBrowserScrollRef = useRef<HTMLDivElement | null>(null);
  const historyBrowserScrollTopRef = useRef(0);
  const historyRestoreScrollRef = useRef(false);
  const dragDepthRef = useRef(0);
  const internalImageDragIntentRef = useRef<(InternalImageDragIntent & { pointerId: number }) | null>(null);
  const customSizeDraftRef = useRef(customSizeDraft);
  const tooltipTimerRef = useRef<number | null>(null);
  const sessionsHydratedRef = useRef(false);
  const sessionSaveTimerRef = useRef<number | null>(null);
  const sessionsRef = useRef<WorkbenchSession[]>(sessions);
  const activeSessionIdRef = useRef(activeSessionId);
  const sessionServerBaselineRef = useRef<{
    revision: number;
    sessions: WorkbenchSession[];
  }>({
    revision: 1,
    sessions: [],
  });
  const skipNextSessionSaveRef = useRef<{ sessions: WorkbenchSession[]; activeSessionId: string } | null>(null);
  const initialScrollKeyRef = useRef("");
  const submitModeRef = useRef(submitMode);
  submitModeRef.current = submitMode;
  sessionsRef.current = sessions;
  activeSessionIdRef.current = activeSessionId;
  composerPromptHeightPreferenceRef.current = composerPromptHeightPreference;
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0] || createEmptySession(t("session.new"));
  const activeDrafts = activeSession.drafts;
  const activePrompt = getDraftPrompt(activeEngine, activeDrafts);
  const activeModel = activeEngine === "banana" ? bananaForm.model_type : gptForm.model;
  const activeModelSummary = activeEngine === "gpt-image-2"
    ? t("config.gptModelSummary", { image: gptForm.model, chat: gptForm.chat_model })
    : activeModel;
  const activeProfile = activeProfileForEngine(profiles, activeProfileIds, activeEngine);
  const activeProfileName = deriveConfigDisplayName(
    activeProfile?.name,
    activeEngine === "banana" ? bananaForm.api_base_url : gptForm.base_url,
    activeModel || t("config.label"),
  );
  const activeEngineProfiles = profiles.filter((item) => item.engine === activeEngine);
  const referenceState = referenceUiState(submitMode, references.length);
  const referenceActionsDisabled = !referenceState.canAdd;
  const maskCapability = maskEditorCapability(activeEngine, submitMode, references.length);
  const activeComposerMask = activeMaskAttachment(maskAttachment, references);
  const turns = activeSession.turns;
  const sortedSessions = sortSessionsNewestFirst(sessions);
  const filteredHistory = filteredHistoryEntries(history, historyFavoriteFilter, historyDateFilter, historyEngineFilter);
  const visibleHistory = filteredHistory.slice(0, historyBrowserLimit);
  const recentHistoryEntries = recentHistoryEntriesWithImages(history, HISTORY_QUICK_ENTRY_LIMIT);
  const historyDetail = historySurface.mode === "browser" && historySurface.detailId
    ? history.find((entry) => entry.id === historySurface.detailId) || null
    : null;
  const historyActionEntry = historyActionMenu ? history.find((entry) => entry.id === historyActionMenu.entryId) || null : null;
  const historyActionImage = historyActionEntry?.images?.[0];
  const historyActionSrc = imageSrc(historyActionImage);
  const activeConfigIssues = configIssues(activeEngine, gptForm, bananaForm, t);
  const hasCompleteConfig = activeConfigIssues.length === 0;
  const configButtonLabel = hasCompleteConfig ? `${t("config.label")} · ${activeProfileName}` : t("config.check");
  const hasRunningTurn = turns.some((turn) => turn.status === "running");
  const activeQueueCount = queueJobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const sessionPromptSummary = summarizeSessionPromptDrafts(activeDrafts, t);
  const composerPromptHeight = clampComposerPromptHeight(composerPromptHeightPreference, composerViewportHeight);
  const composerPromptHeightMax = composerPromptMaxHeight(composerViewportHeight);
  const composerPromptStyle: CSSProperties = { "--composer-prompt-height": `${composerPromptHeight}px` } as CSSProperties;
  const queuePopoverStyle: CSSProperties = {
    "--queue-popover-width": `${queuePopoverSize.width}px`,
    "--queue-popover-height": `${queuePopoverSize.height}px`,
  } as CSSProperties;
  const historyQuickStyle: CSSProperties | undefined = historyQuickPosition
    ? { left: historyQuickPosition.left, top: historyQuickPosition.top, width: historyQuickPosition.width }
    : undefined;
  const gptSizeSelection = deriveGptSizeSelection({
    size: gptForm.size,
    custom_size: normalizeCustomImageSize(gptForm.custom_size).value,
  }, {
    autoSummary: t("composer.autoSizeSummary"),
    customPrefix: t("config.custom"),
  });

  async function saveStudioSessionsOnce(localSessions: WorkbenchSession[], activeId: string) {
    try {
      await saveStudioSessionsWithRetry(localSessions, activeId);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : t("status.sessionSaveFailed"));
    }
  }

  async function saveStudioSessionsWithRetry(localSessions: WorkbenchSession[], activeId: string) {
    function applySessionConflictCurrent(
      normalizedCurrent: NonNullable<ReturnType<typeof normalizeSessionStatePayload>>,
    ) {
      const latestLocalSessions = compactSessionsForStorage(sessionsRef.current);
      const latestActiveSessionId = activeSessionIdRef.current;
      const reconciled = reconcileSessionConflictState({
        baseline: sessionServerBaselineRef.current,
        localSessions: latestLocalSessions,
        serverSessions: normalizedCurrent.sessions,
        serverRevision: normalizedCurrent.revision,
      });
      if (!reconciled.accepted) {
        return {
          sessions: latestLocalSessions,
          activeSessionId: latestActiveSessionId,
        };
      }

      const mergedSessions = reconciled.sessions;
      const mergedActiveSessionId = mergedSessions.some((session) => session.id === latestActiveSessionId)
        ? latestActiveSessionId
        : mergedSessions.some((session) => session.id === normalizedCurrent.activeSessionId)
        ? normalizedCurrent.activeSessionId
        : mergedSessions[0]?.id || "";

      sessionServerBaselineRef.current = {
        revision: reconciled.baseline.revision,
        sessions: compactSessionsForStorage(reconciled.baseline.sessions),
      };
      persistSessionBaselineMarkers(
        normalizedCurrent.revision,
        normalizedCurrent.activeSessionId,
        normalizedCurrent.sessions,
      );
      sessionsRef.current = mergedSessions;
      activeSessionIdRef.current = mergedActiveSessionId;
      skipNextSessionSaveRef.current = { sessions: mergedSessions, activeSessionId: mergedActiveSessionId };
      setSessions(mergedSessions);
      setActiveSessionId(mergedActiveSessionId);
      try {
        localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(mergedSessions)));
        localStorage.setItem(activeSessionStorageKey, mergedActiveSessionId);
      } catch {
        setNotice(t("status.sessionTooLarge"));
      }

      return {
        sessions: compactSessionsForStorage(mergedSessions),
        activeSessionId: mergedActiveSessionId,
      };
    }

    const result = await runSessionSaveWithRetry({
      initialState: { sessions: localSessions, activeSessionId: activeId },
      send: async (state, _attempt) => {
        const response = await fetch("/api/studio/sessions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSessionSavePayload(sessionServerBaselineRef.current.revision, state.activeSessionId, state.sessions)),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        return { ok: response.ok, status: response.status, payload };
      },
      resolveConflict: (response) => {
        const currentPayload = response.payload.current;
        const currentRevision = currentPayload && typeof currentPayload === "object"
          ? (currentPayload as { revision?: unknown }).revision
          : undefined;
        const normalizedCurrent = normalizeSessionStatePayload(currentPayload, queueJobs);
        if (!normalizedCurrent || normalizeSessionRevision(currentRevision) !== currentRevision) {
          return null;
        }

        return applySessionConflictCurrent(normalizedCurrent);
      },
    });

    if (result.kind === "success") {
      const normalized = normalizeSessionStatePayload(result.response.payload, queueJobs);
      if (!normalized) {
        setNotice(t("status.sessionSaveFailed"));
        return;
      }
      const advancedBaseline = advanceSessionServerBaseline({
        baseline: sessionServerBaselineRef.current,
        serverRevision: normalized.revision,
        serverSessions: normalized.sessions,
      });
      if (!advancedBaseline.accepted) return;
      sessionServerBaselineRef.current = {
        revision: advancedBaseline.baseline.revision,
        sessions: compactSessionsForStorage(advancedBaseline.baseline.sessions),
      };
      persistSessionBaselineMarkers(
        normalized.revision,
        normalized.activeSessionId,
        normalized.sessions,
      );
      const currentMatchesSent = sessionStateMatchesSnapshot({
        currentSessions: compactSessionsForStorage(sessionsRef.current),
        currentActiveSessionId: activeSessionIdRef.current,
        snapshotSessions: result.state.sessions,
        snapshotActiveSessionId: result.state.activeSessionId,
      });
      const canonical = applyCanonicalReferenceUpdates({
        currentSessions: sessionsRef.current,
        sentSessions: result.state.sessions,
        serverSessions: normalized.sessions,
      });
      if (canonical.changed) {
        const canonicalActiveSessionId = canonical.sessions.some((session) => session.id === activeSessionIdRef.current)
          ? activeSessionIdRef.current
          : canonical.sessions.some((session) => session.id === normalized.activeSessionId)
          ? normalized.activeSessionId
          : canonical.sessions[0]?.id || "";
        sessionsRef.current = canonical.sessions;
        activeSessionIdRef.current = canonicalActiveSessionId;
        if (currentMatchesSent) {
          skipNextSessionSaveRef.current = { sessions: canonical.sessions, activeSessionId: canonicalActiveSessionId };
        }
        setSessions(canonical.sessions);
        setActiveSessionId(canonicalActiveSessionId);
        try {
          localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(canonical.sessions)));
          localStorage.setItem(activeSessionStorageKey, canonicalActiveSessionId);
        } catch {
          // The next debounced save keeps the latest in-memory state when browser storage is full.
        }
        return;
      }
      try {
        localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(sessionsRef.current)));
      } catch {
        // The debounced local fallback already stores a text-only copy when the full payload is too large.
      }
      return;
    }

    if (result.kind === "exhausted") {
      const currentPayload = result.response.payload.current;
      const currentRevision = currentPayload && typeof currentPayload === "object"
        ? (currentPayload as { revision?: unknown }).revision
        : undefined;
      const current = normalizeSessionStatePayload(currentPayload, queueJobs);
      if (current && normalizeSessionRevision(currentRevision) === currentRevision) {
        applySessionConflictCurrent(current);
      }
      setNotice(t("status.sessionConflictRefresh"));
      return;
    }
    if (result.kind === "unresolved") {
      setNotice(t("status.sessionSaveFailed"));
      return;
    }

    const responsePayload = result.response.payload;
    const detail = typeof responsePayload.detail === "string"
      ? responsePayload.detail
      : typeof responsePayload.error === "string"
      ? responsePayload.error
      : `HTTP ${result.response.status}`;
    setNotice(detail || t("status.sessionSaveFailed"));
  }

  useEffect(() => {
    if (!maskAttachment || activeMaskAttachment(maskAttachment, references)) return;
    setMaskAttachment(null);
    setMaskEditorOpen(false);
    setNotice(createTranslator(language)("mask.clearedBaseChanged"));
  }, [language, maskAttachment, references]);

  useEffect(() => {
    const liveTurnIds = new Set(sessions.flatMap((session) => session.turns.map((turn) => turn.id)));
    for (const turnId of turnMaskPayloadsRef.current.keys()) {
      if (!liveTurnIds.has(turnId)) turnMaskPayloadsRef.current.delete(turnId);
    }
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.title = t("app.title");
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateComposerViewportHeight = () => setComposerViewportHeight(window.innerHeight);
    window.addEventListener("resize", updateComposerViewportHeight);
    return () => window.removeEventListener("resize", updateComposerViewportHeight);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(SIDEBAR_NARROW_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setHistoryCollapsed(true);
      }
    };

    if (media.matches) {
      setHistoryCollapsed(true);
    }

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(gptStorageKey, JSON.stringify(sanitizeForBrowserStorage(gptForm)));
  }, [gptForm]);

  useEffect(() => {
    localStorage.setItem(bananaStorageKey, JSON.stringify(sanitizeForBrowserStorage(bananaForm)));
  }, [bananaForm]);

  useEffect(() => {
    localStorage.setItem(engineStorageKey, activeEngine);
  }, [activeEngine]);

  useEffect(() => {
    localStorage.setItem(queueStorageKey, serializeQueueJobs(queueJobs));
  }, [queueJobs]);

  useEffect(() => {
    const nextJob = nextQueuedGenerationJob(queueJobs);
    if (!nextJob || queueProcessingRef.current) return;
    queueProcessingRef.current = nextJob.id;
    void runQueuedGenerationJob(nextJob.id);
  }, [queueJobs]);

  useEffect(() => {
    if (connectionOpen) {
      setApiKeyVisible(false);
    } else {
      setDiagnosticsResult(null);
      setDiagnosticsRunning(false);
    }
  }, [connectionOpen]);

  useEffect(() => {
    if (composerPopover === "size") return;
    const parsed = parseCustomImageSize(gptForm.custom_size);
    const nextDraft = { width: String(parsed.width), height: String(parsed.height) };
    customSizeDraftRef.current = nextDraft;
    setCustomSizeDraft(nextDraft);
  }, [composerPopover, gptForm.custom_size]);

  useEffect(() => {
    setSessionPromptDraft(createSessionPromptEditorDraft(activeDrafts));
  }, [activeDrafts]);

  useEffect(() => {
    let cancelled = false;
    async function loadServerSessions() {
      try {
        const response = await fetch("/api/studio/sessions");
        if (!response.ok) throw new Error(await readError(response));
        const payload = await response.json();
        const normalized = normalizeSessionStatePayload(payload, initialQueueJobs.current);
        if (!cancelled && normalized) {
          const persistedBaselineMarkers = loadPersistedSessionBaselineMarkers();
          const localSessions = compactSessionsForStorage(sessionsRef.current);
          const reconciled = reconcileInitialSessionState({
            baselineMarkers: persistedBaselineMarkers,
            localSessions,
            localActiveSessionId: activeSessionIdRef.current,
            serverSessions: normalized.sessions,
            serverActiveSessionId: normalized.activeSessionId,
            serverRevision: normalized.revision,
          });
          const advancedBaseline = advanceSessionServerBaseline({
            baseline: sessionServerBaselineRef.current,
            serverRevision: normalized.revision,
            serverSessions: normalized.sessions,
          });
          if (!advancedBaseline.accepted) return;
          sessionServerBaselineRef.current = {
            revision: advancedBaseline.baseline.revision,
            sessions: compactSessionsForStorage(advancedBaseline.baseline.sessions),
          };
          persistSessionBaselineMarkers(
            normalized.revision,
            normalized.activeSessionId,
            normalized.sessions,
          );
          const mergedSessions = reconciled.sessions.length > 0
            ? reconciled.sessions
            : [createEmptySession(t("session.new"))];
          const mergedActiveSessionId = mergedSessions.some((session) => session.id === reconciled.activeSessionId)
            ? reconciled.activeSessionId
            : mergedSessions[0]?.id || "";
          if (sessionStateMatchesSnapshot({
            currentSessions: mergedSessions,
            currentActiveSessionId: mergedActiveSessionId,
            snapshotSessions: normalized.sessions,
            snapshotActiveSessionId: normalized.activeSessionId,
          })) {
            skipNextSessionSaveRef.current = {
              sessions: mergedSessions,
              activeSessionId: mergedActiveSessionId,
            };
          }
          sessionsRef.current = mergedSessions;
          activeSessionIdRef.current = mergedActiveSessionId;
          setSessions(mergedSessions);
          setActiveSessionId(mergedActiveSessionId);
          try {
            localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(mergedSessions)));
            localStorage.setItem(activeSessionStorageKey, mergedActiveSessionId);
          } catch {
            // In-memory sessions remain authoritative until a later browser-storage write succeeds.
          }
        }
      } catch {
        // localStorage is still the startup fallback when the backend file is absent or unreadable.
      } finally {
        sessionsHydratedRef.current = true;
      }
    }
    void loadServerSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionsHydratedRef.current) return undefined;
    if (sessionSaveTimerRef.current) window.clearTimeout(sessionSaveTimerRef.current);
    const skipSave = skipNextSessionSaveRef.current;
    skipNextSessionSaveRef.current = null;
    if (shouldSkipSessionSave(skipSave, sessions, activeSessionId)) {
      return undefined;
    }
    sessionSaveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(sessions)));
      } catch {
        localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(sessions, false).map((session) => ({ ...session, turns: session.turns.map((turn) => ({ ...turn, images: [] })) }))));
        setNotice(t("status.sessionTooLarge"));
      }
      void saveStudioSessionsOnce(compactSessionsForStorage(sessions), activeSessionId);
    }, 650);
    return () => {
      if (sessionSaveTimerRef.current) window.clearTimeout(sessionSaveTimerRef.current);
    };
  }, [sessions, activeSessionId]);

  useEffect(() => {
    localStorage.setItem(activeSessionStorageKey, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (turns.length === 0) return;
    const scrollKey = `${activeSessionId}:${turns.length}`;
    if (initialScrollKeyRef.current === scrollKey) return;
    initialScrollKeyRef.current = scrollKey;
    jumpToConversationEnd();
  }, [activeSessionId, turns.length]);

  useEffect(() => {
    if (!hasRunningTurn) return undefined;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTurn]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!previewImage) return undefined;
    const focusFrame = window.requestAnimationFrame(() => previewDialogRef.current?.focus());
    function onPreviewKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftPreviewImage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftPreviewImage(1);
      }
    }
    window.addEventListener("keydown", onPreviewKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onPreviewKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onActionMenuPointerDown(event: globalThis.PointerEvent) {
      closeOpenActionMenus(event.target instanceof Node ? event.target : null);
    }

    function onActionMenuClick(event: globalThis.MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const menu = target.closest<HTMLDetailsElement>(ACTION_MENU_SELECTOR);
      if (!menu || !menu.open) return;
      const action = target.closest("button, a");
      if (!action || (action instanceof HTMLButtonElement && action.disabled)) return;
      menu.open = false;
    }

    document.addEventListener("pointerdown", onActionMenuPointerDown);
    document.addEventListener("click", onActionMenuClick);
    return () => {
      document.removeEventListener("pointerdown", onActionMenuPointerDown);
      document.removeEventListener("click", onActionMenuClick);
    };
  }, []);

  useEffect(() => {
    if (historySurface.mode === "browser") setHistoryBrowserLimit(HISTORY_BROWSER_PAGE_SIZE);
  }, [historySurface.mode, historyFavoriteFilter, historyDateFilter, historyEngineFilter]);

  useEffect(() => {
    if (historySurface.mode !== "browser" || historySurface.detailId || !historyRestoreScrollRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (historyBrowserScrollRef.current) {
        historyBrowserScrollRef.current.scrollTop = historyBrowserScrollTopRef.current;
      }
      historyRestoreScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [historySurface]);

  useEffect(() => {
    if (historySurface.mode !== "quick") return undefined;

    function closeForOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element
        && (target.closest(".history-quick-popover") || target.closest(".history-quick-trigger") || target.closest(".lightbox"))
      ) return;
      setHistorySurface({ mode: "closed" });
      setHistoryQuickPosition(null);
    }

    function closeForViewportResize() {
      setHistorySurface({ mode: "closed" });
      setHistoryQuickPosition(null);
    }

    function closeForViewportScroll(event: Event) {
      const target = event.target;
      if (target instanceof Element && target.closest(".history-quick-popover")) return;
      setHistorySurface({ mode: "closed" });
      setHistoryQuickPosition(null);
    }

    document.addEventListener("pointerdown", closeForOutsidePointer);
    window.addEventListener("resize", closeForViewportResize);
    window.addEventListener("scroll", closeForViewportScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeForOutsidePointer);
      window.removeEventListener("resize", closeForViewportResize);
      window.removeEventListener("scroll", closeForViewportScroll, true);
    };
  }, [historySurface.mode]);

  useEffect(() => {
    if (!historyActionMenu) return undefined;

    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Element && (target.closest(".history-action-popover") || target.closest(".history-more-trigger"))) return;
      setHistoryActionMenu(null);
    }

    function closeForViewportChange() {
      setHistoryActionMenu(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("scroll", closeForViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("scroll", closeForViewportChange, true);
    };
  }, [historyActionMenu]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (historyActionMenu) {
        event.preventDefault();
        setHistoryActionMenu(null);
        return;
      }
      if (closeOpenActionMenus()) {
        event.preventDefault();
        return;
      }
      if (previewImage) {
        event.preventDefault();
        closePreviewImage();
        return;
      }
      const hasSecondarySurface = advancedOpen
        || connectionOpen
        || renameOpen
        || promptEditorOpen
        || sessionPromptOpen
        || Boolean(pendingSessionSwitch)
        || Boolean(pendingMultiImageConfirm)
        || Boolean(composerPopover);
      if (hasSecondarySurface) {
        event.preventDefault();
        setAdvancedOpen(false);
        closeConnectionDrawer();
        setRenameOpen(false);
        setPromptEditorOpen(false);
        setSessionPromptOpen(false);
        setPendingSessionSwitch(null);
        setPendingMultiImageConfirm(null);
        setComposerPopover(null);
        return;
      }
      if (historySurface.mode === "closed") return;
      event.preventDefault();
      escapeHistorySurface();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    advancedOpen,
    composerPopover,
    connectionOpen,
    historyActionMenu,
    historySurface,
    pendingMultiImageConfirm,
    pendingSessionSwitch,
    previewImage,
    promptEditorOpen,
    renameOpen,
    sessionPromptOpen,
  ]);

  useEffect(() => {
    setComposerPopover(null);
    hideTooltip();
  }, [activeEngine]);

  useEffect(() => {
    if (!composerPopover) return undefined;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && composerToolsRef.current?.contains(target)) return;
      closeComposerPopover();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [composerPopover, activeEngine, gptForm.custom_size]);

  useEffect(() => {
    void loadDefaults();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!hasPromptedForConfig || connectionOpen || hasCompleteConfig) return;
    setNotice(t("config.incompleteNotice", { items: listText(activeConfigIssues) }));
  }, [connectionOpen, hasCompleteConfig, hasPromptedForConfig]);

  async function loadDefaults() {
    try {
      clearDiagnosticsResult();
      const response = await fetch("/api/config/defaults");
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as ConfigPayload;
      const nextGpt = normalizeGptForm({ ...gptForm, ...(payload.forms?.["gpt-image-2-form"] || {}) });
      const nextBanana = normalizeBananaForm({ ...bananaForm, ...(payload.forms?.["banana-form"] || {}) });
      const nextProfiles = normalizeConfigProfiles(payload, nextGpt, nextBanana);
      setGptForm(nextGpt);
      setBananaForm(nextBanana);
      setProfiles(nextProfiles.profiles);
      setActiveProfileIds(nextProfiles.activeProfileIds);
      const startupEngine: Engine = "gpt-image-2";
      const issues = configIssues(startupEngine, nextGpt, nextBanana, t);
      if (!hasPromptedForConfig) {
        setHasPromptedForConfig(true);
        if (issues.length > 0) {
          setConnectionOpen(true);
          setNotice(t("config.completeFirst", { items: listText(issues) }));
        } else {
          setNotice(payload.sources?.length ? t("config.loadedSources", { sources: listText(payload.sources) }) : t("config.loadedDefaults"));
        }
      } else {
        setNotice(payload.sources?.length ? t("config.loadedSources", { sources: listText(payload.sources) }) : t("config.loadedDefaults"));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("config.loadDefaultsFailed"));
      if (!hasPromptedForConfig) {
        setHasPromptedForConfig(true);
        setConnectionOpen(true);
      }
    }
  }

  function applyProfileForm(profile: ConfigProfile) {
    if (profile.engine === "banana") {
      setBananaForm((current) => normalizeBananaForm({ ...current, ...(profile.form as Partial<BananaForm>) }));
    } else {
      setGptForm((current) => normalizeGptForm({ ...current, ...(profile.form as Partial<GptForm>) }));
    }
  }

  function clearDiagnosticsResult() {
    setDiagnosticsResult(null);
  }

  function closeConnectionDrawer() {
    setDiagnosticsResult(null);
    setDiagnosticsRunning(false);
    setConnectionOpen(false);
  }

  function updateGptConnectionForm(patch: Partial<GptForm>) {
    clearDiagnosticsResult();
    setGptForm((current) => ({ ...current, ...patch }));
  }

  function updateBananaConnectionForm(patch: Partial<BananaForm>) {
    clearDiagnosticsResult();
    setBananaForm((current) => ({ ...current, ...patch }));
  }

  function selectConfigProfile(profile: ConfigProfile) {
    clearDiagnosticsResult();
    const currentForm = profile.engine === "banana" ? bananaForm : gptForm;
    setProfiles((items) => syncActiveProfileForm(items, activeProfileIds, profile.engine, currentForm));
    setActiveProfileIds((current) => ({ ...current, [profile.engine]: profile.id }));
    applyProfileForm(profile);
  }

  function updateActiveProfileName(name: string) {
    clearDiagnosticsResult();
    const profileId = activeProfileIds[activeEngine];
    setProfiles((items) => items.map((item) => (
      item.engine === activeEngine && item.id === profileId ? { ...item, name } : item
    )));
  }

  function addConfigProfile() {
    clearDiagnosticsResult();
    const id = makeId(`${activeEngine}-profile`);
    const form = activeEngine === "banana"
      ? {
          api_key: bananaForm.api_key.trim(),
          api_base_url: bananaForm.api_base_url.trim(),
          model_type: bananaForm.model_type.trim(),
        }
      : {
          api_key: gptForm.api_key.trim(),
          base_url: gptForm.base_url.trim(),
          model: gptForm.model.trim(),
          chat_model: gptForm.chat_model.trim(),
          reasoning_effort: gptForm.reasoning_effort.trim(),
        };
    setProfiles((items) => [
      ...items,
      {
        id,
        engine: activeEngine,
        name: language === "en"
          ? `New profile ${items.filter((item) => item.engine === activeEngine).length + 1}`
          : `新配置 ${items.filter((item) => item.engine === activeEngine).length + 1}`,
        form,
      },
    ]);
    setActiveProfileIds((current) => ({ ...current, [activeEngine]: id }));
  }

  function deleteConfigProfile(profile: ConfigProfile) {
    clearDiagnosticsResult();
    const sameEngineProfiles = profiles.filter((item) => item.engine === profile.engine);
    if (sameEngineProfiles.length <= 1) {
      setNotice(t("config.keepOne"));
      return;
    }
    if (!confirm(t("config.deleteConfirm", { name: profile.name || t("queue.unnamed") }))) return;

    const remainingProfiles = sameEngineProfiles.filter((item) => item.id !== profile.id);
    const nextActiveProfile = activeProfileIds[profile.engine] === profile.id ? remainingProfiles[0] : null;
    setProfiles((items) => items.filter((item) => item.id !== profile.id));
    if (nextActiveProfile) {
      setActiveProfileIds((current) => ({ ...current, [profile.engine]: nextActiveProfile.id }));
      applyProfileForm(nextActiveProfile);
      setNotice(t("config.deletedSwitched", { name: nextActiveProfile.name || t("config.otherProfile") }));
    } else {
      setNotice(t("config.deleted"));
    }
  }

  async function runDiagnostics() {
    setDiagnosticsRunning(true);
    setDiagnosticsResult(null);
    try {
      const response = await fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDiagnosticPayload(activeEngine, gptForm, bananaForm)),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as DiagnosticsResult;
      setDiagnosticsResult(payload);
      if (payload.ok) {
        setNotice(t("config.diagnosticsAllOk"));
      } else if (payload.warning) {
        setNotice(payload.warning);
      } else {
        setNotice(t("config.diagnosticsNotPassed"));
      }
    } catch (error) {
      setDiagnosticsResult({
        ok: false,
        engine: activeEngine,
        warning: error instanceof Error ? error.message : t("config.diagnosticsFailed"),
        results: [],
      });
      setNotice(error instanceof Error ? error.message : t("config.diagnosticsFailed"));
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  function updateQueueJob(jobId: string, patch: Partial<QueueJob>) {
    setQueueJobs((items) => items.map((item) => (item.id === jobId ? { ...item, ...patch } : item)));
  }

  function jumpToQueueJob(job: QueueJob) {
    setQueueOpen(false);
    if (!queueJobTargetExists(sessions, job)) {
      setNotice(t("status.originalSessionMissingJump"));
      return;
    }
    if (job.sessionId !== activeSessionId) {
      setActiveSessionId(job.sessionId);
    }
    window.setTimeout(() => {
      document.getElementById(`turn-${job.turnId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function markQueueJobCanceled(job: QueueJob) {
    const finishedAt = new Date().toISOString();
    updateQueueJob(job.id, {
      status: "canceled",
      finishedAt,
      error: t("status.generationCanceled"),
    });
    setSessions((current) =>
      current.map((session) =>
        session.id === job.sessionId
          ? {
              ...session,
              updatedAt: finishedAt,
              turns: session.turns.map((turn) =>
                turn.id === job.turnId
                  ? {
                      ...turn,
                      status: "error",
                      finishedAt,
                      error: t("status.generationCanceled"),
                    }
                  : turn,
              ),
            }
          : session,
      ),
    );
    setStatus(t("status.generationCanceled"));
  }

  function settleQueueJobCancellation(job: QueueJob) {
    const abortController = queueAbortControllersRef.current[job.id];
    const fallbackNotice = cancellationNotice(language);
    const requestCancellation = job.status === "running" || job.status === "queued";
    return settleQueueCancellation({
      jobId: job.id,
      pending: queueCancellationSettlementsRef.current,
      requestCancellation,
      markCanceling: () => {
        cancelingQueueJobsRef.current.add(job.id);
        markQueueJobCanceled(job);
        setNotice(fallbackNotice);
      },
      requestCancel: async () => {
        const response = await fetch(cancelJobUrl(job.id), { method: "POST" });
        if (!response.ok) throw new Error("cancel request failed");
        return response.json().catch(() => ({}));
      },
      abort: () => abortController?.abort(),
      cleanup: () => {
        delete queueAbortControllersRef.current[job.id];
        delete queuePayloadsRef.current[job.id];
        if (!abortController) cancelingQueueJobsRef.current.delete(job.id);
      },
    });
  }

  async function cancelQueueJob(job: QueueJob) {
    if (
      job.status !== "running"
      && job.status !== "queued"
      && !queueCancellationSettlementsRef.current.has(job.id)
    ) return;
    const fallbackNotice = cancellationNotice(language);
    try {
      const payload = await settleQueueJobCancellation(job);
      setNotice(cancellationNoticeFromPayload(payload, language));
    } catch {
      setNotice(fallbackNotice);
    }
  }

  function retryQueueJob(job: QueueJob) {
    setQueueOpen(false);
    const targetExists = sessions.some((session) => session.id === job.sessionId);
    if (targetExists) {
      setActiveSessionId(job.sessionId);
    }
    setActiveEngine(job.engine);
    setSubmitMode("generate");
    void submit(undefined, {
      mode: "generate",
      engine: job.engine,
      sessionId: targetExists ? job.sessionId : undefined,
      prompt: job.prompt,
    });
    if (!targetExists) {
      setNotice(t("status.retryInCurrentSession"));
    }
  }

  function applyQueueJob(job: QueueJob) {
    setQueueOpen(false);
    const targetSessionId = sessions.some((session) => session.id === job.sessionId) ? job.sessionId : activeSessionId;
    if (targetSessionId !== job.sessionId) {
      setNotice(t("status.applyInCurrentSession"));
    } else {
      setNotice(t("status.queuePromptApplied"));
    }
    setActiveSessionId(targetSessionId);
    setActiveEngine(job.engine);
    setSubmitMode("generate");
    setSessions((current) =>
      current.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              updatedAt: new Date().toISOString(),
              drafts: applyPromptToDrafts(job.engine, session.drafts, job.prompt),
            }
          : session,
      ),
    );
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  function clearQueueJobRuntime(jobId: string) {
    queueCancellationSettlementsRef.current.delete(jobId);
    pendingQueueRemovalsRef.current.delete(jobId);
    cancelingQueueJobsRef.current.delete(jobId);
    delete queueAbortControllersRef.current[jobId];
    delete queuePayloadsRef.current[jobId];
  }

  function removeQueueJob(job: QueueJob) {
    const jobId = job.id;
    return cancelJobThenRemove({
      jobId,
      pending: pendingQueueRemovalsRef.current,
      settle: () => settleQueueJobCancellation(job),
      remove: () => {
        clearQueueJobRuntime(jobId);
        setQueueJobs((items) => items.filter((item) => item.id !== jobId));
      },
    });
  }

  function clearCompletedQueueJobs() {
    void removeCompletedQueueJobs(queueJobs, removeQueueJob);
  }

  async function saveConfig() {
    try {
      const response = await fetch("/api/config/local-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfigPayload(
          activeEngine,
          profiles,
          activeProfileIds,
          {
            api_key: gptForm.api_key.trim(),
            base_url: gptForm.base_url.trim(),
            model: gptForm.model.trim(),
            chat_model: gptForm.chat_model.trim(),
            reasoning_effort: gptForm.reasoning_effort.trim(),
          },
          {
            api_key: bananaForm.api_key.trim(),
            api_base_url: bananaForm.api_base_url.trim(),
            model_type: bananaForm.model_type.trim(),
          },
        )),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setNotice(t("config.savedTo", { path: payload.path || "config.local.json" }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("config.saveFailed"));
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history?limit=160");
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setHistory(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("history.loadFailed"));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function toggleFavorite(entry: HistoryEntry) {
    if (entry.legacy) return;
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}?limit=160`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !entry.favorite }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setHistory(Array.isArray(payload.entries) ? payload.entries : history);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("history.favoriteFailed"));
    }
  }

  function closeHistorySurface(restoreFocus = true) {
    const shouldRestoreFocus = restoreFocus
      && !(historySurface.mode === "browser" && historySurface.origin === "sidebar");
    setHistoryActionMenu(null);
    historyRestoreScrollRef.current = false;
    setHistorySurface({ mode: "closed" });
    setHistoryQuickPosition(null);
    if (shouldRestoreFocus) window.requestAnimationFrame(() => historyQuickTriggerRef.current?.focus());
  }

  function escapeHistorySurface() {
    const next = historySurfaceAfterEscape(historySurface);
    if (next.mode === "closed") {
      closeHistorySurface();
      return;
    }
    setHistoryActionMenu(null);
    setHistorySurface(next);
    if (next.mode === "quick") {
      window.requestAnimationFrame(() => historyQuickTriggerRef.current?.focus());
    }
  }

  async function toggleHistoryQuick() {
    if (historySurface.mode === "quick") {
      closeHistorySurface();
      return;
    }

    const trigger = historyQuickTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setHistoryQuickPosition(positionHistoryQuickPopover(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      HISTORY_QUICK_POPOVER_SIZE,
    ));
    setHistorySurface({ mode: "quick" });
    if (history.length === 0) {
      await loadHistory();
    }
  }

  async function openHistoryBrowser() {
    setHistoryActionMenu(null);
    historyRestoreScrollRef.current = false;
    setHistoryQuickPosition(null);
    setHistorySurface({ mode: "browser" });
    if (history.length === 0) await loadHistory();
  }

  async function deleteHistory(entry: HistoryEntry, deleteFiles = false) {
    if (!confirm(deleteFiles ? t("history.deleteFilesConfirm") : t("history.removeRecordConfirm"))) return;
    try {
      const firstImage = entry.images?.[0];
      const legacyPath = entry.legacy ? String(firstImage?.saved_path || "") : "";
      const query = new URLSearchParams({ limit: "160" });
      if (deleteFiles) query.set("delete_files", "true");
      if (legacyPath) query.set("legacy_path", legacyPath);
      const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}?${query.toString()}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setHistory(Array.isArray(payload.entries) ? payload.entries : history.filter((item) => item.id !== entry.id));
      if (historySurface.mode === "browser" && historySurface.detailId === entry.id) {
        setHistorySurface({ mode: "browser" });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("history.deleteFailed"));
    }
  }

  function updateActiveSession(updater: (session: WorkbenchSession) => WorkbenchSession) {
    setSessions((current) => {
      const exists = current.some((session) => session.id === activeSessionId);
      const base = exists ? current : [activeSession, ...current];
      return sortSessionsNewestFirst(base.map((session) => (session.id === activeSessionId ? updater(session) : session)));
    });
  }

  function updateActiveSessionDrafts(updater: (drafts: SessionDrafts) => SessionDrafts) {
    updateActiveSession((session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      drafts: updater(session.drafts),
    }));
  }

  function applyPrompt(prompt: string, engine = activeEngine) {
    updateActiveSessionDrafts((drafts) => applyPromptToDrafts(engine, drafts, prompt));
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function openSessionPromptEditor() {
    hideTooltip();
    setSessionPromptDraft(createSessionPromptEditorDraft(activeDrafts));
    setSessionPromptOpen(true);
  }

  function applySessionPromptEditor() {
    updateActiveSessionDrafts((drafts) => ({
      ...drafts,
      shared: {
        ...drafts.shared,
        fixed_prompt: sessionPromptDraft.fixed_prompt,
      },
      gpt: {
        ...drafts.gpt,
        negative_prompt: sessionPromptDraft.negative_prompt,
        poster_text: sessionPromptDraft.poster_text,
      },
    }));
    setSessionPromptOpen(false);
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function resetPromptHeight() {
    composerResizeRef.current = null;
    composerPromptHeightPreferenceRef.current = COMPOSER_PROMPT_DEFAULT_HEIGHT;
    setComposerPromptHeightPreference(COMPOSER_PROMPT_DEFAULT_HEIGHT);
    clearStoredComposerPromptHeight();
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function startComposerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    hideTooltip();
    composerResizeRef.current = {
      startY: event.clientY,
      startHeight: promptWrapRef.current?.getBoundingClientRect().height || composerPromptHeight,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragComposerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = composerResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextHeight = clampComposerPromptHeight(drag.startHeight + drag.startY - event.clientY, composerViewportHeight);
    composerPromptHeightPreferenceRef.current = nextHeight;
    setComposerPromptHeightPreference(nextHeight);
  }

  function endComposerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = composerResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    composerResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    saveStoredComposerPromptHeight(composerPromptHeightPreferenceRef.current);
  }

  function resizeComposerFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      resetPromptHeight();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 16;
    const nextHeight = clampComposerPromptHeight(
      composerPromptHeight + (event.key === "ArrowUp" ? step : -step),
      composerViewportHeight,
    );
    composerPromptHeightPreferenceRef.current = nextHeight;
    setComposerPromptHeightPreference(nextHeight);
    saveStoredComposerPromptHeight(nextHeight);
  }

  function startQueuePopoverResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    queuePopoverResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: queuePopoverSize.width,
      startHeight: queuePopoverSize.height,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragQueuePopoverResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = queuePopoverResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setQueuePopoverSize(clampQueuePopoverSize(drag.startWidth + drag.startX - event.clientX, drag.startHeight + event.clientY - drag.startY));
  }

  function endQueuePopoverResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = queuePopoverResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    queuePopoverResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelPendingSessionSwitch() {
    setPendingSessionSwitch(null);
  }

  function switchToSession(sessionId: string, choice: ReferenceSwitchChoice = "preserve") {
    const resolution = resolveReferenceSwitch(choice, references.map((file) => file.name));
    if (resolution.keepActiveSession) {
      cancelPendingSessionSwitch();
      return;
    }
    if (choice === "clear") {
      setReferences([]);
    }
    cancelPendingSessionSwitch();
    setActiveSessionId(sessionId);
    setSidebarMode("sessions");
  }

  function requestSessionSwitch(nextSessionId: string) {
    if (nextSessionId === activeSessionId) return;
    if (shouldPromptReferenceSwitch(references.length, nextSessionId, activeSessionId)) {
      const nextSession = sessions.find((session) => session.id === nextSessionId);
      setPendingSessionSwitch({
        nextSessionId,
        nextSessionTitle: nextSession ? localizeSessionTitle(nextSession.title, t) : t("session.new"),
      });
      return;
    }
    switchToSession(nextSessionId, "preserve");
  }

  function createSessionFromPrompt(prompt = "") {
    const session = createEmptySession(prompt ? sessionTitleFromTurns([{ id: "draft", engine: activeEngine, prompt, createdAt: new Date().toISOString(), status: "success", images: [] }], t("session.new")) : t("session.newNumber", { count: sessions.length + 1 }));
    setSessions((current) => sortSessionsNewestFirst([session, ...current]).slice(0, 80));
    setActiveSessionId(session.id);
    return session;
  }

  function deleteSession(sessionId: string) {
    if (hasActiveQueueJobForSession(queueJobs, sessionId)) {
      setNotice(t("status.sessionBusy"));
      return;
    }
    setSessions((current) => {
      const resolution = resolveSessionDeletion(current, activeSessionId, sessionId, () => createEmptySession(t("session.new")));
      if (resolution.clearReferences) {
        setReferences([]);
      }
      if (pendingSessionSwitch?.nextSessionId === sessionId) {
        setPendingSessionSwitch(null);
      }
      if (resolution.nextActiveSessionId !== activeSessionId) {
        setActiveSessionId(resolution.nextActiveSessionId);
      }
      return sortSessionsNewestFirst(resolution.sessions);
    });
  }

  function applyHistory(entry: HistoryEntry) {
    const formState = entry.form_state || {};
    if (entry.engine === "banana") {
      setActiveEngine("banana");
      setBananaForm((current) => normalizeBananaForm({ ...current, ...pickHistoryState<BananaForm>(formState, bananaHistoryKeys) }));
      updateActiveSessionDrafts((drafts) => ({
        ...drafts,
        shared: {
          ...drafts.shared,
          fixed_prompt: String(formState.context_prompt || ""),
        },
        banana: {
          ...drafts.banana,
          prompt: String(formState.prompt || entry.prompt || ""),
        },
      }));
    } else {
      setActiveEngine("gpt-image-2");
      setGptForm((current) =>
        normalizeGptForm({
          ...current,
          ...pickHistoryState<GptForm>(formState, gptHistoryKeys.filter((key) => !["prompt", "negative_prompt", "poster_text"].includes(String(key)))),
        }),
      );
      updateActiveSessionDrafts((drafts) => ({
        ...drafts,
        shared: {
          ...drafts.shared,
          fixed_prompt: String(formState.context_prompt || ""),
        },
        gpt: {
          prompt: String(formState.prompt || entry.prompt || ""),
          negative_prompt: String(formState.negative_prompt || entry.negative_prompt || ""),
          poster_text: String(formState.poster_text || ""),
        },
      }));
    }
    setNotice(t("status.historyApplied"));
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function openMaskEditor() {
    if (!maskCapability.available) {
      setNotice(t(maskCapability.reasonKey || "mask.addBaseFirst"));
      return;
    }
    setMaskEditorOpen(true);
  }

  function applyMaskResult(result: MaskEditorResult) {
    const attachment: MaskAttachment<File> = {
      baseFingerprint: referenceFileFingerprint(result.baseFile),
      baseFile: result.baseFile,
      maskFile: result.maskFile,
      previewFile: result.previewFile,
      coverage: result.coverage,
      encoding: result.encoding,
    };
    setReferences((current) => current.length ? [result.baseFile, ...current.slice(1)] : current);
    setMaskAttachment(attachment);
    setMaskEditorOpen(false);
    setNotice(t(result.encoding === "compat" ? "mask.appliedCompat" : "mask.applied"));
  }

  function removeMask() {
    setMaskAttachment(null);
    setMaskEditorOpen(false);
    setNotice(t("mask.removed"));
  }

  function appendReferenceFiles(files: File[], sourceLabel = t("reference.button")) {
    if (!referenceUiState(submitModeRef.current, references.length).canAdd) {
      setNotice(t("reference.chatNotSent"));
      return false;
    }
    const incoming = files.filter((file) => file.type.startsWith("image/"));
    if (incoming.length === 0) {
      setNotice(t("status.noImageFiles"));
      return false;
    }
    const limit = activeEngine === "banana" ? 14 : 16;
    const available = Math.max(0, limit - references.length);
    const added = Math.min(incoming.length, available);
    if (added === 0) {
      setNotice(t("status.referenceLimit", { limit }));
      return false;
    }
    setReferences((current) => {
      const next = [...current, ...incoming].slice(0, limit);
      return next;
    });
    setNotice(added < incoming.length
      ? t("status.referencesAddedLimited", { source: sourceLabel, count: added, limit })
      : t("status.referencesAdded", { source: sourceLabel, count: incoming.length }));
    return true;
  }

  function onReferenceChange(event: ChangeEvent<HTMLInputElement>) {
    appendReferenceFiles(Array.from(event.target.files || []), t("reference.button"));
    event.target.value = "";
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const files = Array.from(event.clipboardData.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    if (!referenceState.canAdd) {
      setNotice(t("reference.chatNotSent"));
      return;
    }
    appendReferenceFiles(files, t("reference.button"));
  }

  function previewReference(file: File) {
    const src = URL.createObjectURL(file);
    openPreviewImage({ src, name: file.name, objectUrl: true, sourceFile: file });
  }

  function openPreviewImage(next: PreviewImage) {
    previewMaskRequestRef.current += 1;
    setPreviewMaskLoading(false);
    setPreviewImage((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.src);
      return next;
    });
    resetPreviewCanvas();
  }

  function openPreviewImages(images: GeneratedImage[], index = 0, historyContext?: PreviewHistoryContext) {
    const gallery = images
      .map<PreviewImage | null>((image, imageIndex) => {
        const src = imageSrc(image);
        return src ? {
          src,
          name: imageName(image, imageIndex),
          dimensions: image.dimensions,
          ...historyContext,
        } : null;
      })
      .filter((image): image is PreviewImage => Boolean(image));
    const galleryIndex = Math.min(Math.max(index, 0), Math.max(gallery.length - 1, 0));
    const selected = gallery[galleryIndex];
    if (!selected) return;
    openPreviewImage({ ...selected, gallery, galleryIndex });
  }

  function shiftPreviewImage(direction: -1 | 1) {
    previewMaskRequestRef.current += 1;
    setPreviewMaskLoading(false);
    setPreviewImage((current) => {
      if (!current?.gallery || current.gallery.length <= 1) return current;
      const galleryIndex = (Number(current.galleryIndex) + direction + current.gallery.length) % current.gallery.length;
      return { ...current.gallery[galleryIndex], gallery: current.gallery, galleryIndex };
    });
    resetPreviewCanvas();
  }

  function closePreviewImage() {
    previewMaskRequestRef.current += 1;
    setPreviewMaskLoading(false);
    setPreviewImage((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.src);
      return null;
    });
    resetPreviewCanvas();
  }

  function resetPreviewCanvas() {
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
    setPreviewDragging(false);
    previewDragRef.current = null;
  }

  function setPreviewZoomLevel(nextZoom: number) {
    const normalized = Math.min(4, Math.max(0.5, Number(nextZoom.toFixed(2))));
    setPreviewZoom(normalized);
    if (normalized <= 1) {
      setPreviewPan({ x: 0, y: 0 });
      setPreviewDragging(false);
      previewDragRef.current = null;
    }
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setPreviewZoomLevel(previewZoom + (event.deltaY < 0 ? 0.2 : -0.2));
  }

  function handlePreviewDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (isPreviewControlTarget(event.target)) return;
    resetPreviewCanvas();
  }

  function startPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (isPreviewControlTarget(event.target)) return;
    if (event.button !== 0 || previewZoom <= 1) return;
    event.preventDefault();
    previewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: previewPan.x,
      panY: previewPan.y,
    };
    setPreviewDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPreviewPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    });
  }

  function endPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    previewDragRef.current = null;
    setPreviewDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function createReferenceSnapshots(files: File[]): Promise<ReferenceSnapshot[]> {
    const snapshots = await Promise.all(
      files.map(async (file, index) => {
        const id = `${file.name}-${file.size}-${file.lastModified}-${index}`;
        try {
          return {
            id,
            name: file.name || `reference-${index + 1}.png`,
            size: file.size,
            mime_type: file.type || "image/png",
            src: await readFileAsDataUrl(file, t("status.readReferenceFailed")),
          } satisfies ReferenceSnapshot;
        } catch {
          return {
            id,
            name: file.name || `reference-${index + 1}.png`,
            size: file.size,
            mime_type: file.type || "image/png",
          } satisfies ReferenceSnapshot;
        }
      }),
    );
    return snapshots.filter((item) => item.name);
  }

  function moveReference(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setReferences((current) => {
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    setNotice(t("status.referenceMoved", { index: toIndex + 1 }));
  }

  function onReferenceDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.stopPropagation();
    setDraggedReferenceIndex(index);
    setReferenceDropIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.setData("application/x-web-imagen-reference", String(index));
  }

  function onReferenceDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    if (draggedReferenceIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setReferenceDropIndex(index);
  }

  function onReferenceDrop(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const fromIndex = draggedReferenceIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (Number.isFinite(fromIndex)) moveReference(fromIndex, index);
    setDraggedReferenceIndex(null);
    setReferenceDropIndex(null);
  }

  function onReferenceDragEnd() {
    setDraggedReferenceIndex(null);
    setReferenceDropIndex(null);
  }

  function hasDraggedReference(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("application/x-web-imagen-reference");
  }

  function startInternalImageDragIntent(event: ReactPointerEvent<HTMLElement>) {
    if (!(event.target instanceof HTMLImageElement) || event.button !== 0) {
      internalImageDragIntentRef.current = null;
      return;
    }
    internalImageDragIntentRef.current = {
      pointerId: event.pointerId,
      startedAt: performance.now(),
    };
  }

  function clearInternalImageDragIntent(event?: ReactPointerEvent<HTMLElement>) {
    const intent = internalImageDragIntentRef.current;
    if (event && intent && intent.pointerId !== event.pointerId) return;
    internalImageDragIntentRef.current = null;
  }

  function gateInternalImageDrag(event: DragEvent<HTMLElement>) {
    if (!(event.target instanceof HTMLImageElement)) return;
    const intent = internalImageDragIntentRef.current;
    const allowed = shouldAllowInternalImageDrag(intent, performance.now());
    if (!allowed) {
      event.preventDefault();
      internalImageDragIntentRef.current = null;
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
  }

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      if (!referenceState.canAdd) {
        setDragActive(false);
        return;
      }
      dragDepthRef.current += 1;
      setDragActive(true);
    }
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!referenceState.canAdd) {
      setDragActive(false);
      return;
    }
    event.dataTransfer.dropEffect = "copy";
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      setDragActive(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (!referenceState.canAdd) {
      setNotice(t("reference.chatNotSent"));
      return;
    }
    appendReferenceFiles(Array.from(event.dataTransfer.files || []), t("reference.droppedSource"));
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setAdvancedOpen(false);
    closeConnectionDrawer();
    setRenameOpen(false);
    setPromptEditorOpen(false);
    setSessionPromptOpen(false);
    setPendingMultiImageConfirm(null);
    setComposerPopover(null);
  }

  function handleHistorySurfaceKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    if (previewImage) {
      event.preventDefault();
      event.stopPropagation();
      closePreviewImage();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    escapeHistorySurface();
  }

  function handlePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      shiftPreviewImage(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      shiftPreviewImage(1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePreviewImage();
    }
  }

  async function outputReferenceFile(src: string, name: string) {
    if (!isSameOriginOutput(src)) throw new Error(t("status.outputOnly"));
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const mimeType = blob.type || "image/png";
    if (!mimeType.startsWith("image/")) throw new Error(t("status.noImageFiles"));
    return new File([blob], name.replace(/[\\/:*?"<>|]+/g, "-") || "reference.png", {
      type: mimeType,
      lastModified: Date.now(),
    });
  }

  async function addOutputAsReference(src: string, name: string) {
    try {
      const outcome = await loadReferenceForCurrentMode(
        () => submitModeRef.current,
        () => outputReferenceFile(src, name),
      );
      if (outcome.blocked) {
        setNotice(t("reference.chatNotSent"));
        return false;
      }
      return appendReferenceFiles([outcome.result], "outputs");
    } catch (error) {
      if (!referenceUiState(submitModeRef.current, references.length).canAdd) {
        setNotice(t("reference.chatNotSent"));
        return false;
      }
      setNotice(error instanceof Error ? error.message : t("status.addReferenceFailed"));
      return false;
    }
  }

  async function editPreviewMask(preview: PreviewImage) {
    if (previewMaskLoading) return;
    const requestId = previewMaskRequestRef.current + 1;
    previewMaskRequestRef.current = requestId;
    setPreviewMaskLoading(true);
    try {
      const file = preview.sourceFile || await outputReferenceFile(preview.src, preview.name);
      if (previewMaskRequestRef.current !== requestId) return;
      if (!file.type.startsWith("image/")) throw new Error(t("status.noImageFiles"));
      const keepCurrentMask = references[0] === file && Boolean(activeMaskAttachment(maskAttachment, references));
      setActiveEngine("gpt-image-2");
      setSubmitMode("generate");
      setReferences((current) => referencesWithMaskBase(current, file, 16));
      if (!keepCurrentMask) setMaskAttachment(null);
      closePreviewImage();
      setMaskEditorOpen(true);
    } catch (error) {
      if (previewMaskRequestRef.current === requestId) {
        setNotice(error instanceof Error && error.message ? error.message : t("status.addReferenceFailed"));
      }
    } finally {
      if (previewMaskRequestRef.current === requestId) {
        setPreviewMaskLoading(false);
      }
    }
  }

  function selectEngine(engine: Engine) {
    setActiveEngine(engine);
    const issues = configIssues(engine, gptForm, bananaForm, t);
    if (issues.length > 0) {
      setConnectionOpen(true);
      setNotice(t("config.completeEngineFirst", { engine: engineLabel(engine), items: listText(issues) }));
    }
  }

  function jumpToConversationEnd() {
    window.requestAnimationFrame(() => {
      const container = conversationCanvasRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
  }

  function stickToConversationEndIfNearBottom(threshold = 180) {
    const container = conversationCanvasRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distance > threshold) return;
    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  async function referenceSnapshotToFile(snapshot: ReferenceSnapshot, index: number) {
    if (!snapshot.src) {
      return null;
    }
    try {
      const response = await fetch(snapshot.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return new File([blob], snapshot.name.replace(/[\\/:*?"<>|]+/g, "-") || `reference-${index + 1}.png`, {
        type: blob.type || snapshot.mime_type || "image/png",
        lastModified: Date.now(),
      });
    } catch {
      return null;
    }
  }

  async function copyReferencesFromTurn(turn: ConversationTurn) {
    const outcome = await loadReferenceForCurrentMode(() => submitModeRef.current, async () => {
      const snapshots = turn.referenceSnapshots || [];
      const files = (await Promise.all(snapshots.map(referenceSnapshotToFile))).filter((file): file is File => Boolean(file));
      return { snapshotCount: snapshots.length, files };
    });
    if (outcome.blocked) {
      setNotice(t("reference.chatNotSent"));
      return false;
    }
    if (!outcome.result.snapshotCount) {
      setNotice(t("status.noReferencesToCopy"));
      return false;
    }
    if (!outcome.result.files.length) {
      setNotice(t("status.referenceOnlyNames"));
      return false;
    }
    return appendReferenceFiles(outcome.result.files, t("reference.turnSource"));
  }

  async function regenerateFromTurn(turn: ConversationTurn) {
    const reusableMask = turnMaskPayloadsRef.current.get(turn.id);
    if (turnUsesMaskGuidance(turn) && !reusableMask) {
      setNotice(t("mask.regenerateUnavailable"));
      return;
    }
    setActiveEngine(turn.engine);
    setSubmitMode("generate");
    updateActiveSessionDrafts((drafts) => {
      const contextPrompt = String(turn.meta?.context_prompt || "");
      if (turn.engine === "banana") {
        return {
          ...drafts,
          shared: {
            ...drafts.shared,
            fixed_prompt: contextPrompt,
          },
          banana: { ...drafts.banana, prompt: turn.prompt },
        };
      }
      return {
        ...drafts,
        shared: {
          ...drafts.shared,
          fixed_prompt: contextPrompt,
        },
        gpt: {
          ...drafts.gpt,
          prompt: turn.prompt,
          negative_prompt: turn.negativePrompt || "",
          poster_text: turn.posterText || "",
        },
      };
    });
    const loadedTurnReferences = await Promise.all((turn.referenceSnapshots || []).map(referenceSnapshotToFile));
    if (reusableMask && !loadedTurnReferences[0]) {
      setNotice(t("mask.regenerateBaseUnavailable"));
      return;
    }
    const turnReferences = loadedTurnReferences.filter((file): file is File => Boolean(file));
    const regeneratedMask = reusableMask
      ? restoreReusableMaskAttachment(reusableMask, turnReferences[0])
      : null;
    if (regeneratedMask) setNotice(t("mask.regenerateWithMask"));
    await submit(undefined, {
      mode: "generate",
      engine: turn.engine,
      prompt: turn.prompt,
      draftOverride: {
        shared: {
          fixed_prompt: String(turn.meta?.context_prompt || ""),
        },
        ...(turn.engine === "gpt-image-2"
          ? {
              gpt: {
                negative_prompt: turn.negativePrompt || "",
                poster_text: turn.posterText || "",
              },
            }
          : {}),
      },
      references: turnReferences,
      referenceSnapshots: turn.referenceSnapshots || [],
      maskAttachment: regeneratedMask,
      maskSnapshot: turn.maskSnapshot,
    });
  }

  function regenerateTurnLabel(turn: ConversationTurn) {
    if (!turnUsesMaskGuidance(turn)) return t("response.regenerate");
    return turnMaskPayloadsRef.current.has(turn.id)
      ? t("mask.regenerateWithMask")
      : t("mask.regenerateNeedsRedraw");
  }

  async function runQueuedGenerationJob(jobId: string) {
    const payload = queuePayloadsRef.current[jobId];
    const canceling = cancelingQueueJobsRef.current.has(jobId);
    if (canceling || !payload) {
      const finishedAt = new Date().toISOString();
      updateQueueJob(jobId, {
        status: "canceled",
        finishedAt,
        error: canceling ? t("status.generationCanceled") : t("status.queueInterrupted"),
      });
      queueProcessingRef.current = null;
      return;
    }

    const startedAt = performance.now();
    const runningAt = new Date().toISOString();
    const abortController = new AbortController();
    queueAbortControllersRef.current[jobId] = abortController;
    updateQueueJob(jobId, { status: "running" });
    setSessions((current) =>
      current.map((session) =>
        session.id === payload.sessionId
          ? {
              ...session,
              updatedAt: runningAt,
              turns: session.turns.map((turn) =>
                turn.id === payload.turnId
                  ? {
                      ...turn,
                      status: "running",
                      createdAt: runningAt,
                    }
                  : turn,
              ),
            }
          : session,
      ),
    );
    setStatus(t("status.generationRunning", { engine: engineLabel(payload.engine) }));

    try {
      const response = await fetch(`/api/generate/${payload.engine}`, {
        method: "POST",
        signal: abortController.signal,
        body: createFormData(
          payload.engine,
          payload.prompt,
          payload.gptForm,
          payload.bananaForm,
          payload.references,
          payload.maskFile,
          payload.maskEncoding,
          {
            context_prompt: payload.contextPrompt,
            negative_prompt: payload.negativePrompt,
            poster_text: payload.posterText,
          },
          payload.jobId,
        ),
      });
      const responsePayload = await response.json().catch(() => ({}));
      if (responsePayload.canceled === true) {
        const elapsed = Number(responsePayload.meta?.elapsed_seconds) || (performance.now() - startedAt) / 1000;
        const finishedAt = new Date().toISOString();
        const canceledMessage = t("status.generationCanceled");
        setSessions((current) =>
          current.map((session) =>
            session.id === payload.sessionId
              ? {
                  ...session,
                  updatedAt: finishedAt,
                  turns: session.turns.map((item) =>
                    item.id === payload.turnId
                      ? {
                          ...item,
                          status: "error",
                          finishedAt,
                          elapsedSeconds: elapsed,
                          error: canceledMessage,
                          meta: {
                            ...(item.meta || {}),
                            ...(responsePayload.meta || {}),
                            context_prompt: payload.contextPrompt,
                          },
                        }
                      : item,
                  ),
                }
              : session,
          ),
        );
        stickToConversationEndIfNearBottom();
        setStatus(canceledMessage);
        setNotice(cancellationNoticeFromPayload(responsePayload, language));
        updateQueueJob(jobId, {
          status: "canceled",
          finishedAt,
          elapsedSeconds: elapsed,
          error: canceledMessage,
        });
        return;
      }
      if (!response.ok) throw new Error(responsePayload.detail || responsePayload.error || `HTTP ${response.status}`);
      const elapsed = Number(responsePayload.meta?.elapsed_seconds) || (performance.now() - startedAt) / 1000;
      const images = Array.isArray(responsePayload.images) ? responsePayload.images : [];
      const finishedAt = new Date().toISOString();
      setSessions((current) =>
        current.map((session) =>
          session.id === payload.sessionId
            ? {
                ...session,
                updatedAt: finishedAt,
                turns: session.turns.map((item) =>
                  item.id === payload.turnId
                    ? {
                        ...item,
                        status: responsePayload.ok ? "success" : "error",
                        finishedAt,
                        elapsedSeconds: elapsed,
                        images,
                        error: responsePayload.ok ? "" : t("status.noImagesFromResponse"),
                        meta: {
                          ...(item.meta || {}),
                          ...(responsePayload.meta || {}),
                          context_prompt: payload.contextPrompt,
                        },
                      }
                    : item,
                ),
              }
            : session,
        ),
      );
      stickToConversationEndIfNearBottom();
      setStatus(responsePayload.ok ? t("status.generationReturned", { count: images.length }) : t("status.generationNoImages"));
      setNotice(responsePayload.ok ? t("status.imagesSaved") : t("status.checkResponse"));
      updateQueueJob(jobId, {
        status: responsePayload.ok ? "success" : "error",
        finishedAt,
        elapsedSeconds: elapsed,
        images,
        error: responsePayload.ok ? "" : t("status.noImagesFromResponse"),
      });
      if (responsePayload.history_entry) {
        void loadHistory();
      }
    } catch (error) {
      const wasCanceled = (error instanceof DOMException && error.name === "AbortError")
        || cancelingQueueJobsRef.current.has(jobId);
      const message = wasCanceled
        ? t("status.generationCanceled")
        : error instanceof Error ? error.message : t("status.generationFailed");
      const finishedAt = new Date().toISOString();
      setSessions((current) =>
        current.map((session) =>
          session.id === payload.sessionId
            ? {
                ...session,
                updatedAt: finishedAt,
                turns: session.turns.map((item) =>
                  item.id === payload.turnId
                    ? {
                        ...item,
                        status: "error",
                        finishedAt,
                        elapsedSeconds: (performance.now() - startedAt) / 1000,
                        error: message,
                      }
                    : item,
                ),
              }
            : session,
        ),
      );
      stickToConversationEndIfNearBottom();
      setStatus(message === t("status.generationCanceled") ? t("status.generationCanceled") : t("status.generationFailed"));
      setNotice(wasCanceled ? cancellationNotice(language) : message);
      updateQueueJob(jobId, {
        status: message === t("status.generationCanceled") ? "canceled" : "error",
        finishedAt,
        elapsedSeconds: (performance.now() - startedAt) / 1000,
        error: message,
      });
    } finally {
      delete queueAbortControllersRef.current[jobId];
      delete queuePayloadsRef.current[jobId];
      cancelingQueueJobsRef.current.delete(jobId);
      queueProcessingRef.current = null;
    }
  }

  async function submit(event?: FormEvent, overrides: SubmitOverrides = {}) {
    event?.preventDefault();
    const currentMode = overrides.mode || submitMode;
    const currentEngine = overrides.engine || activeEngine;
    const requestedSessionId = overrides.sessionId || activeSessionId;
    const requestedSession = sessions.find((session) => session.id === requestedSessionId);
    const currentDrafts = requestedSession?.drafts || activeSession.drafts;
    const currentGptForm = gptForm;
    const currentBananaForm = bananaForm;
    const currentReferences = referencesForSubmitMode(currentMode, overrides.references || references);
    const requestedMaskAttachment = overrides.maskAttachment === undefined ? maskAttachment : overrides.maskAttachment;
    const currentMask = currentEngine === "gpt-image-2" && currentMode === "generate"
      ? activeMaskAttachment(requestedMaskAttachment, currentReferences)
      : null;
    const currentConfigIssues = configIssues(currentEngine, currentGptForm, currentBananaForm, t);
    const currentModel = currentEngine === "banana" ? currentBananaForm.model_type : currentGptForm.model;
    const generationCount = generationCountFor(currentEngine, currentGptForm, currentBananaForm);
    const draftOverride = overrides.draftOverride || {};
    const submissionDrafts = resolveSubmissionDrafts(currentEngine, currentDrafts, {
      ...draftOverride,
      prompt: overrides.prompt ?? draftOverride.prompt,
    });
    const prompt = submissionDrafts.prompt.trim();
    if (!prompt) {
      setNotice(currentMode === "chat" ? t("status.emptyChat") : t("status.emptyPrompt"));
      promptRef.current?.focus();
      return;
    }
    if (currentMask && !maskPromptHasSpecificTarget(`${submissionDrafts.context_prompt}\n${prompt}`)) {
      setNotice(t("mask.promptTargetRequired"));
      promptRef.current?.focus();
      return;
    }

    if (currentMode !== "chat") {
      if (currentConfigIssues.length > 0) {
        setConnectionOpen(true);
        setNotice(t("config.completeFirst", { items: listText(currentConfigIssues) }));
        return;
      }
      if (generationCount > 1 && !overrides.skipMultiImageConfirm && !skipMultiImageConfirmForSession) {
        setComposerPopover(null);
        setSkipMultiImageConfirmChecked(false);
        setPendingMultiImageConfirm({ count: generationCount, engine: currentEngine, overrides });
        return;
      }
    }

    const turnId = makeId("turn");
    const queueJobId = makeId("job");
    const createdAt = new Date().toISOString();
    let targetSessionId = requestedSessionId;
    if (!sessions.some((session) => session.id === targetSessionId)) {
      const created = createSessionFromPrompt(prompt);
      targetSessionId = created.id;
    }

    if (currentMode === "chat") {
      const turn: ConversationTurn = {
        id: turnId,
        engine: currentEngine,
        mode: "chat",
        prompt,
        createdAt,
        status: "running",
        images: [],
        meta: {
          model: currentModel,
          reference_count: 0,
          mode: "chat",
        },
      };
      setSessions((current) =>
        current.map((session) =>
          session.id === targetSessionId
            ? {
                ...session,
                title: session.turns.length === 0 || isDefaultSessionTitle(session.title) ? sessionTitleFromTurns([turn], t("session.new")) : session.title,
                updatedAt: createdAt,
                turns: [...session.turns, turn].slice(-maxTurns),
              }
            : session,
        ),
      );
      jumpToConversationEnd();
      applyPrompt("", currentEngine);
      setTimeout(() => promptRef.current?.focus(), 0);
      setBusy(true);
      setStatus(t("status.chatRunning", { engine: engineLabel(currentEngine) }));
      const startedAt = performance.now();
      try {
        const targetSession = sessions.find((session) => session.id === targetSessionId);
        const chatContextMessages = buildChatContextMessages([...(targetSession?.turns || []), turn], turnId, t);
        const response = await fetch(`/api/chat/${currentEngine}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createChatPayload(
            currentEngine,
            prompt,
            currentGptForm,
            currentBananaForm,
            chatContextMessages,
            queueJobId,
          )),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload.canceled === true) {
          const elapsed = Number(payload.meta?.elapsed_seconds) || (performance.now() - startedAt) / 1000;
          const finishedAt = new Date().toISOString();
          setSessions((current) =>
            current.map((session) =>
              session.id === targetSessionId
                ? {
                    ...session,
                    updatedAt: finishedAt,
                    turns: session.turns.map((item) =>
                      item.id === turnId
                        ? {
                            ...item,
                            status: "error",
                            finishedAt,
                            elapsedSeconds: elapsed,
                            error: t("status.chatCanceled"),
                            meta: payload.meta || item.meta,
                          }
                        : item,
                    ),
                  }
                : session,
            ),
          );
          stickToConversationEndIfNearBottom();
          setStatus(t("status.chatCanceled"));
          setNotice(cancellationNoticeFromPayload(payload, language));
          return;
        }
        if (!response.ok) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
        const reply = typeof payload.reply === "string" && payload.reply.trim() ? payload.reply.trim() : t("status.noChatReply");
        const elapsed = Number(payload.meta?.elapsed_seconds) || (performance.now() - startedAt) / 1000;
        setSessions((current) =>
          current.map((session) =>
            session.id === targetSessionId
              ? {
                  ...session,
                  updatedAt: new Date().toISOString(),
                  turns: session.turns.map((item) =>
                    item.id === turnId
                      ? {
                          ...item,
                          status: "success",
                          finishedAt: new Date().toISOString(),
                          elapsedSeconds: elapsed,
                          reply,
                          meta: payload.meta || item.meta,
                        }
                      : item,
                  ),
                }
              : session,
          ),
        );
        stickToConversationEndIfNearBottom();
        setStatus(t("status.chatReplied"));
        setNotice(t("status.chatReplied"));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("status.chatFailed");
        setSessions((current) =>
          current.map((session) =>
            session.id === targetSessionId
              ? {
                  ...session,
                  updatedAt: new Date().toISOString(),
                  turns: session.turns.map((item) =>
                    item.id === turnId
                      ? {
                          ...item,
                          status: "error",
                          finishedAt: new Date().toISOString(),
                          elapsedSeconds: (performance.now() - startedAt) / 1000,
                          error: message,
                        }
                      : item,
                  ),
                }
              : session,
          ),
        );
        stickToConversationEndIfNearBottom();
        setStatus(t("status.chatFailed"));
        setNotice(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    let submitGptForm = currentGptForm;
    if (currentEngine === "gpt-image-2") {
      const normalized = normalizeCustomSize(false);
      if (normalized?.notice) {
        const notice = formatSizeAdjustmentNotice(normalized);
        if (notice) setNotice(notice);
      }
      submitGptForm = { ...currentGptForm, custom_size: normalized.value };
      try {
        resolveMaskEndpoint(submitGptForm.api_endpoint, Boolean(currentMask));
      } catch {
        setNotice(t("mask.endpointInvalid"));
        return;
      }
    }
    const submissionReferences = currentMask
      ? [currentMask.baseFile, ...currentReferences.slice(1)]
      : currentReferences;
    const referenceSnapshots = overrides.referenceSnapshots || (await createReferenceSnapshots(submissionReferences));
    const maskSnapshot = currentMask
      ? overrides.maskSnapshot || (currentMask.previewFile ? (await createReferenceSnapshots([currentMask.previewFile]))[0] : undefined)
      : undefined;
    const submitNegativePrompt = currentEngine === "gpt-image-2" ? submissionDrafts.negative_prompt : "";
    const submitPosterText = currentEngine === "gpt-image-2" ? submissionDrafts.poster_text : "";
    const submitContextPrompt = submissionDrafts.context_prompt;
    const turn: ConversationTurn = {
      id: turnId,
      engine: currentEngine,
      mode: "generate",
      prompt,
      negativePrompt: submitNegativePrompt,
      posterText: submitPosterText,
      createdAt,
      status: "queued",
      images: [],
      referenceSnapshots,
      maskSnapshot,
      meta: {
        model: currentModel,
        reference_count: submissionReferences.length,
        mask_used: Boolean(currentMask),
        mask_encoding: currentMask?.encoding || "",
        mask_guidance: Boolean(currentMask),
        context_prompt: submitContextPrompt,
        queued_at: createdAt,
      },
    };
    if (currentMask) turnMaskPayloadsRef.current.set(turnId, reusableMaskPayload(currentMask));
    setSessions((current) =>
      current.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              title: session.turns.length === 0 || isDefaultSessionTitle(session.title) ? sessionTitleFromTurns([turn], t("session.new")) : session.title,
              updatedAt: createdAt,
              turns: [...session.turns, turn].slice(-maxTurns),
            }
          : session,
      ),
    );
    jumpToConversationEnd();
    setQueueJobs((items) => appendGenerationQueueJob(items, {
        id: queueJobId,
        turnId,
        sessionId: targetSessionId,
        prompt,
        engine: currentEngine,
        configName: activeProfileName,
        model: currentModel,
        status: "queued" as const,
        createdAt,
      }));
    queuePayloadsRef.current[queueJobId] = {
      sessionId: targetSessionId,
      turnId,
      jobId: queueJobId,
      engine: currentEngine,
      prompt,
      gptForm: submitGptForm,
      bananaForm: currentBananaForm,
      references: [...submissionReferences],
      maskFile: currentMask?.maskFile,
      maskEncoding: currentMask?.encoding,
      contextPrompt: submitContextPrompt,
      negativePrompt: submitNegativePrompt,
      posterText: submitPosterText,
    };
    setQueueOpen(true);
    setStatus(t("status.queuedGeneration"));
  }

  async function openOutputs() {
    try {
      const response = await fetch("/api/open-outputs", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      setNotice(t("status.openOutputsRequested"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("status.openOutputsFailed"));
    }
  }

  function copyPrompt(prompt: string) {
    void navigator.clipboard?.writeText(prompt);
    setNotice(t("status.promptCopied"));
  }

  function clearCurrentSession() {
    if (hasActiveQueueJobForSession(queueJobs, activeSessionId)) {
      setNotice(t("status.currentSessionBusy"));
      return;
    }
    updateActiveSession((session) => ({
      ...session,
      title: t("session.new"),
      updatedAt: new Date().toISOString(),
      turns: [],
      drafts: emptySessionDrafts(),
    }));
    setReferences([]);
    setStatus(t("status.ready"));
    setNotice(t("status.sessionCleared"));
    setExpandedTurns({});
  }

  function startFreshSession() {
    const session = createEmptySession(t("session.newNumber", { count: sessions.length + 1 }));
    setSessions((current) => sortSessionsNewestFirst([session, ...current]).slice(0, 80));
    setActiveSessionId(session.id);
    setReferences([]);
    setStatus(t("status.ready"));
    setSidebarMode("sessions");
    setNotice(t("status.sessionCreated"));
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function openRenameSession() {
    setSessionTitleDraft(localizeSessionTitle(activeSession.title, t));
    setRenameOpen(true);
  }

  function renameActiveSession() {
    const title = sessionTitleDraft.trim();
    if (!title) {
      setNotice(t("status.sessionNameRequired"));
      return;
    }
    updateActiveSession((session) => ({
      ...session,
      title,
      updatedAt: new Date().toISOString(),
    }));
    setRenameOpen(false);
    setNotice(t("status.sessionRenamed"));
  }

  function openPromptEditor() {
    hideTooltip();
    setPromptEditorDraft(activePrompt);
    setPromptEditorOpen(true);
  }

  function applyPromptEditor() {
    applyPrompt(promptEditorDraft, activeEngine);
    setPromptEditorOpen(false);
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function draftGenerationFromContext(turn: ConversationTurn) {
    const turnIndex = turns.findIndex((item) => item.id === turn.id);
    const contextTurns = turnIndex >= 0 ? turns.slice(0, turnIndex + 1) : turns;
    const contextPrompt = buildGenerationContextPrompt(contextTurns, t);
    if (!contextPrompt.trim()) {
      setNotice(t("status.noContextForGeneration"));
      return;
    }
    const prompt = [
      t("prompt.fromContextIntro"),
      "",
      contextPrompt,
      "",
      t("prompt.fromContextOutro")
    ].join("\n");
    setActiveEngine(turn.engine);
    setSubmitMode("generate");
    applyPrompt(prompt, turn.engine);
    setNotice(t("status.contextPromptReady"));
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function submitFromComposerKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || busy) return;
    event.preventDefault();
    void submit();
  }

  function optionLabel(value: string) {
    return t(`option.${value}`) === `option.${value}` ? value : t(`option.${value}`);
  }

  function chatModelOptionLabel(value: string) {
    if (value === "gpt-5.6") return t("config.chatModelAlias");
    if (value === "gpt-5.6-sol") return t("config.chatModelSol");
    if (value === "gpt-5.6-terra") return t("config.chatModelTerra");
    if (value === "gpt-5.6-luna") return t("config.chatModelLuna");
    return value === "custom" ? t("config.custom") : value;
  }

  function bananaImageSizeLabel(value: string) {
    return value === "无" ? t("option.noExtra") : value;
  }

  function formatSizeAdjustmentNotice(normalized: ReturnType<typeof normalizeCustomImageSize>) {
    if (!normalized.notice) return "";
    if (language !== "en") return normalized.notice;
    const reasons: string[] = [];
    if (normalized.clampedToMax) reasons.push(`side at most ${GPT_CUSTOM_SIZE_MAX}`);
    if (normalized.roundedToMultiple) reasons.push("multiples of 16");
    if (normalized.adjustedRatio) reasons.push(`ratio at most ${GPT_CUSTOM_SIZE_MAX_RATIO}:1`);
    if (normalized.adjustedPixelRange === "max") reasons.push("total pixels at most 2880 x 2880");
    if (normalized.adjustedPixelRange === "min") reasons.push(`total pixels at least ${GPT_CUSTOM_SIZE_MIN_PIXELS.toLocaleString("en-US")}`);
    return `Size automatically adjusted to ${normalized.label}${reasons.length ? ` (${reasons.join(", ")})` : ""}`;
  }

  function currentSizeLabel() {
    if (activeEngine === "banana") return `${bananaForm.aspect_ratio} · ${bananaForm.image_size}`;
    if (gptSizeSelection.mode === "auto") return t("option.auto");
    if (gptSizeSelection.mode === "preset" && gptSizeSelection.tier && gptSizeSelection.aspect) {
      return `${gptSizeSelection.tier} · ${gptSizeSelection.aspect}`;
    }
    return t("composer.customSize", { value: gptSizeSelection.value });
  }

  function currentQualityLabel() {
    return optionLabel(gptForm.quality);
  }

  function generationCountFor(engine: Engine, gpt: GptForm, banana: BananaForm) {
    return Math.max(1, Math.round(Number(engine === "banana" ? banana.batch_size : gpt.n) || 1));
  }

  function currentCountLabel() {
    return t("composer.count", { count: generationCountFor(activeEngine, gptForm, bananaForm) });
  }

  function currentGenerationSettingsSummary() {
    return [
      activeEngine === "gpt-image-2" ? currentQualityLabel() : "",
      currentCountLabel(),
    ].filter(Boolean).join(" · ");
  }

  function setGenerationCount(engine: Engine, count: number) {
    const nextCount = Math.max(1, Math.round(Number(count) || 1));
    if (engine === "banana") {
      setBananaForm((current) => ({ ...current, batch_size: Math.min(8, nextCount) }));
    } else {
      setGptForm((current) => ({ ...current, n: Math.min(10, nextCount) }));
    }
  }

  function confirmMultiImageGeneration() {
    if (!pendingMultiImageConfirm) return;
    if (skipMultiImageConfirmChecked) setSkipMultiImageConfirmForSession(true);
    const pending = pendingMultiImageConfirm;
    setPendingMultiImageConfirm(null);
    setSkipMultiImageConfirmChecked(false);
    void submit(undefined, { ...pending.overrides, skipMultiImageConfirm: true });
  }

  function resetMultiImageCount() {
    if (!pendingMultiImageConfirm) return;
    setGenerationCount(pendingMultiImageConfirm.engine, 1);
    setPendingMultiImageConfirm(null);
    setSkipMultiImageConfirmChecked(false);
  }

  function imageExpandLabel(count: number) {
    return t("image.expand", { count });
  }

  function applyGptComposerSize(tier: GptComposerSizeTier, aspect: GptComposerAspect = "1:1") {
    if (tier === "auto") {
      setGptForm({ ...gptForm, size: "auto" });
      setSizeAdjustmentNotice("");
      return;
    }
    const normalized = normalizeCustomImageSize(resolveGptComposerPresetSize(tier, aspect));
    const parsed = parseCustomImageSize(normalized.value);
    const nextDraft = { width: String(parsed.width), height: String(parsed.height) };
    customSizeDraftRef.current = nextDraft;
    setCustomSizeDraft(nextDraft);
    setGptForm({ ...gptForm, size: "custom", custom_size: normalized.value });
    setSizeAdjustmentNotice(formatSizeAdjustmentNotice(normalized));
  }

  function isTurnExpanded(turn: ConversationTurn) {
    if (turn.images.length === 1) return false;
    return expandedTurns[turn.id] ?? false;
  }

  function toggleTurnExpanded(turnId: string) {
    setExpandedTurns((current) => ({ ...current, [turnId]: !(current[turnId] ?? false) }));
  }

  function setCustomSizeDimension(dimension: "width" | "height", value: string) {
    const cleaned = value.replace(/[^\d]/g, "");
    const nextDraft = { ...customSizeDraftRef.current, [dimension]: cleaned };
    customSizeDraftRef.current = nextDraft;
    setCustomSizeDraft(nextDraft);
    setGptForm({ ...gptForm, size: "custom" });
    setSizeAdjustmentNotice("");
  }

  function normalizeCustomSize(activateCustom = true) {
    const draftValue = `${customSizeDraftRef.current.width || "0"}x${customSizeDraftRef.current.height || "0"}`;
    const normalized = normalizeCustomImageSize(draftValue);
    const parsed = parseCustomImageSize(normalized.value);
    const nextDraft = { width: String(parsed.width), height: String(parsed.height) };
    customSizeDraftRef.current = nextDraft;
    setCustomSizeDraft(nextDraft);
    setGptForm((current) => {
      return {
        ...current,
        size: activateCustom || current.size === "custom" ? "custom" : current.size,
        custom_size: normalized.value,
      };
    });
    const notice = formatSizeAdjustmentNotice(normalized);
    if (notice) {
      setSizeAdjustmentNotice(notice);
      setNotice(notice);
    } else {
      setSizeAdjustmentNotice("");
    }
    return normalized;
  }

  function handleCustomSizeBlur(event: FocusEvent<HTMLInputElement>) {
    if (event.currentTarget.closest(".custom-size-row")?.contains(event.relatedTarget as Node | null)) return;
    normalizeCustomSize();
  }

  function closeComposerPopover() {
    if (composerPopover === "size" && activeEngine === "gpt-image-2") {
      normalizeCustomSize(false);
    }
    setComposerPopover(null);
    hideTooltip();
  }

  function hideTooltip() {
    if (tooltipTimerRef.current) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }

  function scheduleTooltip(event: ReactPointerEvent<HTMLElement> | SyntheticEvent<HTMLElement>, text?: string) {
    if (!text) return;
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    const target = event.currentTarget;
    tooltipTimerRef.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const showBelow = rect.top < 72;
      setTooltip({
        text,
        left: Math.min(window.innerWidth - 18, Math.max(18, rect.left + rect.width / 2)),
        top: showBelow ? rect.bottom + 10 : rect.top - 10,
        placement: showBelow ? "bottom" : "top",
      });
    }, 520);
  }

  function openComposerPopover(popover: typeof composerPopover) {
    hideTooltip();
    setComposerPopover((current) => (current === popover ? null : popover));
  }

  function tooltipProps(text?: string) {
    if (!text) return {};
    return {
      "data-tooltip": text,
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => scheduleTooltip(event, text),
      onPointerLeave: hideTooltip,
      onPointerDown: hideTooltip,
      onFocus: (event: SyntheticEvent<HTMLElement>) => scheduleTooltip(event, text),
      onBlur: hideTooltip,
    };
  }

  function openHistoryPreview(entry: HistoryEntry) {
    openPreviewImages(entry.images || [], 0, {
      historyEntryId: entry.id,
      historyOrigin: "sidebar",
      requestedSize: requestedSizeLabel(entry),
    });
  }

  async function continueFromTurn(turn: ConversationTurn, image?: GeneratedImage, index = 0) {
    if (!referenceUiState(submitModeRef.current, references.length).canAdd) {
      setNotice(t("reference.chatNotSent"));
      return;
    }
    const src = imageSrc(image);
    const name = imageName(image, index);
    applyPrompt(turn.prompt);
    if (!src) {
      setNotice(t("reference.appliedPrompt"));
      return;
    }
    const accepted = await addOutputAsReference(src, name);
    if (accepted) {
      setNotice(t("reference.releaseAsContext"));
    }
  }

  function openHistoryContext(entry: HistoryEntry, origin: HistoryOrigin = "browser") {
    setHistoryActionMenu(null);
    if (origin === "browser") {
      historyBrowserScrollTopRef.current = historyBrowserScrollRef.current?.scrollTop || 0;
      historyRestoreScrollRef.current = true;
    } else {
      historyRestoreScrollRef.current = false;
    }
    if (origin !== "quick") setHistoryQuickPosition(null);
    setHistorySurface({ mode: "browser", detailId: entry.id, origin });
  }

  function openPreviewHistoryContext() {
    if (!previewImage?.historyEntryId) return;
    const entry = history.find((item) => item.id === previewImage.historyEntryId);
    if (!entry) return;
    const origin = previewImage.historyOrigin || "browser";
    closePreviewImage();
    openHistoryContext(entry, origin);
  }

  function backToHistoryBrowser() {
    setHistoryQuickPosition(null);
    setHistorySurface({ mode: "browser" });
  }

  function openHistoryActionMenu(event: ReactMouseEvent<HTMLButtonElement>, entry: HistoryEntry, source: HistoryActionMenuSource) {
    if (historyActionMenu?.entryId === entry.id && historyActionMenu.source === source) {
      setHistoryActionMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 224;
    const estimatedHeight = source === "sidebar" ? 150 : 104;
    const placement = window.innerHeight - rect.bottom < estimatedHeight + 12 && rect.top > estimatedHeight + 12 ? "above" : "below";
    setHistoryActionMenu({
      entryId: entry.id,
      source,
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      top: placement === "above" ? rect.top - 6 : rect.bottom + 6,
      placement,
    });
  }

  return (
    <main
      className={`studio-shell ${historyCollapsed ? "history-is-collapsed" : ""} ${dragActive ? "is-dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerDownCapture={startInternalImageDragIntent}
      onPointerUpCapture={clearInternalImageDragIntent}
      onPointerCancelCapture={clearInternalImageDragIntent}
      onDragStartCapture={gateInternalImageDrag}
      onDragEndCapture={() => clearInternalImageDragIntent()}
      onPaste={onPaste}
    >
      {tooltip && (
        <div
          className={`floating-tooltip ${tooltip.placement}`}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          {tooltip.text}
        </div>
      )}
      {dragActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <ImagePlus size={24} />
            <strong>{t("reference.dropTitle")}</strong>
            <span>{t("reference.dropHint")}</span>
          </div>
        </div>
      )}
      {!historyCollapsed && (
        <button
          className="history-sidebar-backdrop"
          type="button"
          aria-label={t("app.closeSidebar")}
          onClick={() => setHistoryCollapsed(true)}
        />
      )}
      <aside className={`history-sidebar ${historyCollapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-top">
          <button className="icon-button" type="button" onClick={() => setHistoryCollapsed(!historyCollapsed)} aria-label={t("app.toggleSidebar")}>
            {historyCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {!historyCollapsed && (
            <div>
              <p>{sidebarMode === "sessions" ? t("app.subtitle.sessions") : t("app.subtitle.history")}</p>
              <h1>{sidebarMode === "sessions" ? t("app.sessions") : t("app.historyAssets")}</h1>
            </div>
          )}
        </div>
        {!historyCollapsed && (
          <>
            <button className="new-session-button" type="button" onClick={startFreshSession}>
              <MessageSquarePlus size={16} /> {t("app.newSession")}
            </button>
            <div className="sidebar-tabs" role="tablist" aria-label={t("app.leftList")}>
              <button type="button" className={sidebarMode === "sessions" ? "active" : ""} onClick={() => setSidebarMode("sessions")}>
                {t("app.sessions")}
              </button>
              <button type="button" className={sidebarMode === "history" ? "active" : ""} onClick={() => setSidebarMode("history")}>
                {t("app.history")}
              </button>
            </div>
            <div className="sidebar-actions">
              <button type="button" onClick={() => void openOutputs()} title={t("app.openOutputFolder")}>
                <FolderOpen size={15} /> {t("app.outputFolder")}
              </button>
              <button
                ref={historyQuickTriggerRef}
                className="history-quick-trigger"
                type="button"
                onClick={() => void toggleHistoryQuick()}
                title={t("history.browser")}
                aria-haspopup="dialog"
                aria-expanded={historySurface.mode !== "closed"}
              >
                <Images size={15} /> {t("history.browser")}
              </button>
            </div>
            <div className="sidebar-list-section">
              <div className="history-list-head">
                <div className="history-count">
                  {sidebarMode === "sessions"
                    ? t("app.chats", { count: sessions.length })
                    : historyLoading ? t("app.loading") : t("app.historyCount", { count: history.length })}
                </div>
                {sidebarMode === "history" && (
                  <button className="history-refresh-button" type="button" onClick={() => void loadHistory()} title={t("app.refresh")} aria-label={t("app.refresh")}>
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
              {sidebarMode === "sessions" ? (
                <div className="session-list">
                  {sortedSessions.map((session) => (
                    <article className={session.id === activeSessionId ? "session-card active" : "session-card"} key={session.id}>
                      <button
                        type="button"
                        className="session-open"
                        aria-current={session.id === activeSessionId ? "page" : undefined}
                        onClick={() => requestSessionSwitch(session.id)}
                      >
                        <span>{localizeSessionTitle(session.title, t)}</span>
                        <small>{formatTime(session.updatedAt, language)} · {t("app.turns", { count: session.turns.length })}</small>
                      </button>
                      <button type="button" title={t("session.delete")} aria-label={t("session.delete")} onClick={() => deleteSession(session.id)}>
                        <Trash2 size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="history-list">
                  {history.length === 0 ? (
                    <div className="empty-history">{t("app.emptyHistory")}</div>
                  ) : (
                    history.map((entry) => {
                      const images = entry.images || [];
                      const firstImage = images[0];
                      const src = imageSrc(firstImage);
                      const imageCount = images.length;
                      return (
                        <article className="history-card" key={entry.id}>
                          <button className="history-open" type="button" onClick={() => openHistoryContext(entry, "sidebar")}>
                            <span className="history-thumb" data-image-count={Math.min(imageCount, 4)} aria-hidden="true">
                              {images.slice(0, 4).map((image, index) => {
                                const src = imageSrc(image);
                                return src ? <img key={`${entry.id}-${index}`} src={src} alt="" loading="lazy" /> : null;
                              })}
                              {!firstImage && <span>{t("app.noImage")}</span>}
                              {imageCount > 1 && <span className="history-thumb-count">{imageCount}</span>}
                            </span>
                            <span className="history-main">
                              <span className="history-row">
                                <span>{engineLabel(entry.engine || "gpt-image-2")}</span>
                                <span>{formatTime(entry.created_at, language)}</span>
                              </span>
                              <span className="history-prompt">{entry.prompt || t("history.noPrompt")}</span>
                            </span>
                          </button>
                          <button
                            className={entry.favorite ? "history-favorite-button active" : "history-favorite-button"}
                            type="button"
                            onClick={() => void toggleFavorite(entry)}
                            title={entry.favorite ? t("history.unfavorite") : t("history.favorite")}
                            aria-label={entry.favorite ? t("history.unfavorite") : t("history.favorite")}
                            aria-pressed={Boolean(entry.favorite)}
                            disabled={entry.legacy}
                          >
                            <Heart size={15} fill={entry.favorite ? "currentColor" : "none"} />
                          </button>
                          <div className="history-tools">
                            <button className="history-quick-action" type="button" onClick={() => applyHistory(entry)} title={t("history.apply")}>
                              <RotateCcw size={14} /> <span>{t("history.applyShort")}</span>
                            </button>
                            <button className="history-quick-action" type="button" onClick={() => src && void addOutputAsReference(src, imageName(firstImage))} title={t("history.useReference")} disabled={!src || referenceActionsDisabled}>
                              <ImagePlus size={14} /> <span>{t("history.useReferenceShort")}</span>
                            </button>
                            <button
                              className="history-more-trigger"
                              type="button"
                              onClick={(event) => openHistoryActionMenu(event, entry, "sidebar")}
                              aria-haspopup="menu"
                              aria-expanded={historyActionMenu?.entryId === entry.id && historyActionMenu.source === "sidebar"}
                              title={t("history.moreActions")}
                            >
                              <Ellipsis size={14} /> <span>{t("history.more")}</span>
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <div className="workspace-kicker">
              <span>{t("app.localChat")}</span>
              <span>{t("app.turns", { count: turns.length })}</span>
            </div>
            <div className="title-line">
              <h2>{localizeSessionTitle(activeSession.title, t) || t("app.title")}</h2>
              <button type="button" onClick={openRenameSession} title={t("session.rename")} aria-label={t("session.rename")}>
                <PencilLine size={15} />
              </button>
            </div>
          </div>
          <div className="workspace-controls">
            <div className="mode-tabs" role="tablist" aria-label={t("app.selectEngine")}>
              <button type="button" className={activeEngine === "gpt-image-2" ? "active" : ""} onClick={() => selectEngine("gpt-image-2")}>
                GPT Image 2
              </button>
              <button type="button" className={activeEngine === "banana" ? "active" : ""} onClick={() => selectEngine("banana")}>
                Banana Gemini
              </button>
            </div>
            <button
              type="button"
              className={hasCompleteConfig ? "connection-button configured" : "connection-button needs-config"}
              onClick={() => setConnectionOpen(true)}
              title={hasCompleteConfig ? t("config.editTitle", { name: activeProfileName, model: activeModelSummary || t("config.modelName") }) : t("config.incompleteTitle", { items: listText(activeConfigIssues) })}
            >
              <PencilLine size={15} />
              <span className="connection-button-text">
                <strong>{configButtonLabel}</strong>
                {hasCompleteConfig && <small>{activeModelSummary || t("config.modelName")}</small>}
              </span>
              <ChevronDown size={14} />
            </button>
            <div className="header-actions">
              <div className="language-switcher" role="group" aria-label={t("language.switcher")}>
                <button type="button" className={language === "zh-CN" ? "active" : ""} onClick={() => setLanguage("zh-CN")}>{t("language.zh")}</button>
                <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>{t("language.en")}</button>
              </div>
              <details className="header-more-menu">
                <summary aria-label={t("app.moreActions")} title={t("app.moreActions")}>
                  <Ellipsis size={18} />
                </summary>
                <div className="header-more-panel">
                  <button
                    type="button"
                    className="danger-action"
                    onClick={(event) => {
                      clearCurrentSession();
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                    disabled={turns.length === 0 && references.length === 0}
                  >
                    <Trash2 size={15} /> {t("app.clearCurrentConversation")}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>

        <section className="conversation-canvas" ref={conversationCanvasRef}>
          {queueJobs.length > 0 && (
            <div className="queue-anchor">
              {queueOpen && (
                <div className="queue-popover" role="region" aria-label={t("queue.title")} style={queuePopoverStyle}>
                  <div className="queue-popover-head">
                    <div>
                      <h3>{t("queue.title")}</h3>
                      <span>{activeQueueCount ? t("queue.active", { count: activeQueueCount }) : t("queue.done", { count: queueJobs.length })}</span>
                    </div>
                    <button type="button" onClick={clearCompletedQueueJobs}>{t("queue.clearCompleted")}</button>
                  </div>
                  <div className="queue-list">
                    {queueJobs.slice(0, 6).map((job) => {
                      const jobImages = job.images || [];
                      const previewImages = jobImages.slice(0, 4);
                      const firstImage = previewImages[0];
                      const thumbSrc = imageSrc(firstImage);
                      const thumbName = imageName(firstImage);
                      const jobTitle = queueJobTitle(job, t("queue.unnamed"));
                      const jobMeta = [job.configName, job.model].filter(Boolean).join(" / ");
                      const jobElapsed = job.elapsedSeconds ? (language === "en" ? `${Math.round(job.elapsedSeconds)}s` : `${Math.round(job.elapsedSeconds)} 秒`) : "";
                      return (
                        <div className={`queue-job ${job.status}`} key={job.id}>
                          {thumbSrc ? (
                            <button type="button" className={jobImages.length > 1 ? "queue-job-thumb multi" : "queue-job-thumb"} onClick={() => openPreviewImages(jobImages)} title={jobImages.length > 1 ? t("queue.viewImages", { count: jobImages.length }) : t("queue.viewImage")}>
                              {previewImages.map((image, index) => {
                                const src = imageSrc(image);
                                const name = imageName(image, index);
                                return src ? <img key={`${job.id}-${index}`} src={src} alt={name} loading="lazy" /> : null;
                              })}
                              {jobImages.length > 1 && <span className="queue-job-thumb-count">{language === "en" ? `${jobImages.length}` : `${jobImages.length} 张`}</span>}
                            </button>
                          ) : (
                            <span className="queue-job-icon">
                              {job.status === "running" ? <Loader2 size={18} className="spin" /> : job.status === "queued" ? <Clock3 size={18} /> : job.status === "error" || job.status === "canceled" ? <X size={18} /> : <Check size={18} />}
                            </span>
                          )}
                          <button type="button" className="queue-job-main-button" onClick={() => jumpToQueueJob(job)} title={t("queue.jump")}>
                            <strong>{jobTitle}</strong>
                            <span>{job.status === "queued" ? `${jobMeta} · ${t("queue.queued")}` : jobElapsed ? `${jobMeta} · ${jobElapsed}` : jobMeta}</span>
                          </button>
                          <div className="queue-job-side">
                            {thumbSrc ? <a href={thumbSrc} download={thumbName} title={t("preview.download")}><Download size={14} /></a> : null}
                          </div>
                          <div className="queue-job-actions" aria-label={t("queue.actions")}>
                            {(job.status === "running" || job.status === "queued") && (
                              <button type="button" onClick={() => void cancelQueueJob(job)} aria-label={`${t("queue.cancel")} ${job.prompt || t("submit.generate")}`} title={t("queue.cancel")}>
                                <X size={13} />
                              </button>
                            )}
                            {(job.status === "success" || job.status === "error" || job.status === "canceled") && (
                              <button type="button" onClick={() => retryQueueJob(job)} aria-label={`${t("queue.retry")} ${job.prompt || t("submit.generate")}`} title={t("queue.retry")}>
                                <RefreshCw size={13} />
                              </button>
                            )}
                            <button type="button" onClick={() => applyQueueJob(job)} aria-label={`${t("queue.applyPrompt")} ${job.prompt || t("submit.generate")}`} title={t("queue.applyPrompt")}>
                              <RotateCcw size={13} />
                            </button>
                            <button type="button" onClick={() => void removeQueueJob(job)} aria-label={`${t("queue.remove")} ${job.prompt || t("submit.generate")}`} title={job.status === "queued" || job.status === "running" ? t("queue.cancelRemove") : t("queue.remove")}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="queue-popover-resize-handle"
                    aria-label={t("queue.resize")}
                    title={t("queue.resize")}
                    onPointerDown={startQueuePopoverResize}
                    onPointerMove={dragQueuePopoverResize}
                    onPointerUp={endQueuePopoverResize}
                    onPointerCancel={endQueuePopoverResize}
                  >
                    <span />
                  </button>
                </div>
              )}
              <button type="button" className={`queue-capsule ${activeQueueCount ? "active" : ""}`.trim()} onClick={() => setQueueOpen((value) => !value)} aria-expanded={queueOpen}>
                <span className={activeQueueCount ? "queue-capsule-dot active" : "queue-capsule-dot done"} aria-hidden="true" />
                <span className="queue-capsule-label">{activeQueueCount ? t("queue.label") : t("queue.recent")}</span>
                <span className="queue-capsule-count">{activeQueueCount || queueJobs.length}</span>
              </button>
            </div>
          )}
          <div className="conversation-flow">
            {turns.length === 0 ? (
              <div className="empty-state">
                <Sparkles size={32} />
                <h2>{t("app.readyToCreate")}</h2>
                <p>{t("app.empty")}</p>
                <div className="prompt-examples">
                  {inspirationPromptKeys.map((key) => {
                    const title = t(`inspiration.${key}.title`);
                    const prompt = t(`inspiration.${key}.prompt`);
                    return (
                    <button type="button" key={key} onClick={() => applyPrompt(prompt)}>
                      <strong>{title}</strong>
                      <span>{prompt.slice(0, 56)}...</span>
                    </button>
                  );
                  })}
                </div>
              </div>
            ) : (
              turns.map((turn, turnIndex) => (
              <article className="turn" id={`turn-${turn.id}`} key={turn.id}>
                <div className="user-bubble">
                  <div className="bubble-meta">
                    {formatTime(turn.createdAt, language)} · {turn.mode === "chat" ? t("submit.chat") : engineLabel(turn.engine)}
                    {turn.referenceSnapshots?.length ? ` · ${t("reference.turnMeta", { count: turn.referenceSnapshots.length })}` : ""}
                  </div>
                  <p>{turn.prompt}</p>
                  {turn.referenceSnapshots?.length || turn.maskSnapshot ? (
                    <div className="turn-reference-strip" aria-label={t("reference.turnCount", { count: turn.referenceSnapshots?.length || 0 })}>
                      {turn.referenceSnapshots?.map((reference, index) => (
                        reference.src ? (
                          <button
                            type="button"
                            className="turn-reference-thumb"
                            key={reference.id || `${turn.id}-reference-${index}`}
                            onClick={() => openPreviewImage({ src: reference.src || "", name: reference.name })}
                            title={reference.name}
                          >
                            <img src={reference.src} alt={reference.name} loading="lazy" />
                          </button>
                        ) : (
                          <span className="turn-reference-file" key={reference.id || `${turn.id}-reference-${index}`} title={reference.name}>
                            {reference.name}
                          </span>
                        )
                      ))}
                      {turn.maskSnapshot?.src && (
                        <button
                          type="button"
                          className="turn-reference-thumb turn-mask-thumb"
                          onClick={() => openPreviewImage({
                            src: turn.maskSnapshot?.src || "",
                            name: t("mask.snapshot"),
                            dimensions: turn.maskSnapshot?.dimensions,
                            isMaskSnapshot: true,
                          })}
                          title={t("mask.viewSnapshot")}
                          aria-label={t("mask.viewSnapshot")}
                        >
                          <img src={turn.maskSnapshot.src} alt="" loading="lazy" />
                          <span>{t("mask.snapshot")}</span>
                        </button>
                      )}
                    </div>
                  ) : null}
                  <div className="turn-user-actions" aria-label={t("response.turnActions")}>
                    <button
                      type="button"
                      onClick={() => void regenerateFromTurn(turn)}
                      title={regenerateTurnLabel(turn)}
                      aria-label={regenerateTurnLabel(turn)}
                      disabled={busy || turn.mode === "chat"}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button type="button" onClick={() => copyPrompt(turn.prompt)} title={t("history.copyPrompt")} aria-label={t("history.copyPrompt")}>
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyReferencesFromTurn(turn)}
                      title={t("reference.copy")}
                      aria-label={t("reference.copy")}
                      disabled={referenceActionsDisabled || !turn.referenceSnapshots?.some((reference) => reference.src)}
                    >
                      <ImagePlus size={14} />
                    </button>
                  </div>
                </div>
                <div className={`studio-response ${turn.status}`}>
                  <div className="response-avatar"><Sparkles size={18} /></div>
                  <div className="response-body">
                    <div className="response-head">
                      <strong>
                        {turn.mode === "chat"
                          ? turn.status === "running"
                            ? t("response.chatting")
                            : turn.status === "queued"
                            ? t("response.waitingChat")
                            : turn.status === "success"
                            ? t("response.chatReplied")
                            : t("response.chatFailed")
                          : turn.status === "queued"
                          ? t("queue.queued")
                          : turn.status === "running"
                          ? t("response.generating")
                          : turn.status === "success"
                          ? t("response.generationComplete")
                          : t("response.generationFailed")}
                      </strong>
                      <div className="response-meta">
                        <span>{turn.meta?.model ? String(turn.meta.model) : engineLabel(turn.engine)}</span>
                        {sharedImageDimensionsLabel(turn.images) && <span>{sharedImageDimensionsLabel(turn.images)}</span>}
                        {turn.elapsedSeconds ? <span>{language === "en" ? `${turn.elapsedSeconds.toFixed(turn.elapsedSeconds < 10 ? 1 : 0)}s` : `${turn.elapsedSeconds.toFixed(turn.elapsedSeconds < 10 ? 1 : 0)} 秒`}</span> : null}
                        {turn.meta?.mask_guidance ? <span>{t("mask.strictBadge")}</span> : null}
                        <span>#{turnIndex + 1}</span>
                      </div>
                    </div>
                    {(turn.status === "queued" || turn.status === "running") && (
                      <div className="loading-card">
                        {turn.status === "queued" ? <Clock3 size={20} /> : <Loader2 className="spin" size={20} />}
                        {turn.status === "queued" ? (turn.mode === "chat" ? t("queue.waitingChat") : t("queue.waiting")) : runningTurnMessage(turn, nowMs, t)}
                      </div>
                    )}
                    {turn.error && <div className="error-card">{formatStoredErrorMessage(t, turn.error)}</div>}
                    {turn.mode === "chat" && turn.reply && (
                      <div className="chat-reply-card">
                        <p>{turn.reply}</p>
                        <div className="chat-reply-actions">
                          <button type="button" onClick={() => draftGenerationFromContext(turn)}>
                            <Sparkles size={14} /> {t("composer.generateFromContext")}
                          </button>
                        </div>
                      </div>
                    )}
                    {turn.images.length > 0 && (
                      <div className={`${isTurnExpanded(turn) ? "turn-images expanded" : "turn-images collapsed"} ${turn.images.length === 1 ? "single-result" : "multi-result"}`}>
                        <div className={turn.images.length === 1 ? "image-grid single" : "image-grid"}>
                        {turn.images.map((image, index) => {
                          const src = imageSrc(image);
                          const name = imageName(image, index);
                          const dimensions = imageDimensionsLabel(image);
                          return (
                            <figure className={`image-card ${resultImageOrientation(image)}`} key={`${turn.id}-${index}`}>
                              <div className="image-preview-wrap">
                                <button type="button" className="image-preview" style={resultImageStyle(image)} onClick={() => openPreviewImage({ src, name, dimensions: image.dimensions })} title={t("history.previewImage")}>
                                  <img src={src} alt={name} loading="lazy" />
                                </button>
                                <div className="image-overlay-actions">
                                  <button
                                    type="button"
                                    className="image-mask-action"
                                    onClick={() => void editPreviewMask({ src, name, dimensions: image.dimensions })}
                                    title={isSameOriginOutput(src) ? t("preview.editMask") : t("status.outputOnly")}
                                    aria-label={t("preview.editMask")}
                                    aria-busy={previewMaskLoading}
                                    disabled={previewMaskLoading || !isSameOriginOutput(src)}
                                  >
                                    {previewMaskLoading ? <Loader2 className="spin" size={14} /> : <PencilLine size={14} />}
                                    <span>{t("preview.editMask")}</span>
                                  </button>
                                  <a className="image-download-action" href={src} download={name} title={t("image.download")} aria-label={t("image.download")}>
                                    <Download size={15} />
                                  </a>
                                </div>
                              </div>
                              {!sharedImageDimensionsLabel(turn.images) && dimensions && (
                                <figcaption>
                                  <small className="image-dimensions">{dimensions}</small>
                                </figcaption>
                              )}
                              <div className="image-actions">
                                <button type="button" onClick={() => void continueFromTurn(turn, image, index)} disabled={referenceActionsDisabled}>
                                  <MessageSquarePlus size={14} /> <span>{t("image.continueEdit")}</span>
                                </button>
                                <details className="image-more-actions">
                                  <summary aria-label={t("image.moreActions")} title={t("image.moreActions")}>
                                    <Ellipsis size={15} /> <span>{t("image.more")}</span>
                                  </summary>
                                  <div className="image-more-menu">
                                    <button type="button" onClick={() => copyPrompt(turn.prompt)}><Copy size={14} /> <span>{t("image.copyPrompt")}</span></button>
                                    <button type="button" onClick={() => applyPrompt(turn.prompt)}><RotateCcw size={14} /> <span>{t("image.applyPrompt")}</span></button>
                                    <button type="button" onClick={() => void addOutputAsReference(src, name)} disabled={referenceActionsDisabled}><ImagePlus size={14} /> <span>{t("reference.addAsReference")}</span></button>
                                    <a href={src} target="_blank" rel="noreferrer"><ExternalLink size={14} /> <span>{t("image.open")}</span></a>
                                  </div>
                                </details>
                              </div>
                            </figure>
                          );
                        })}
                        </div>
                        {turn.images.length > 1 && (
                          <button type="button" className="image-toggle" onClick={() => toggleTurnExpanded(turn.id)}>
                            {isTurnExpanded(turn) ? t("image.collapse") : imageExpandLabel(turn.images.length)}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
              ))
            )}
            <div ref={conversationEndRef} className="conversation-end-anchor" aria-hidden="true" />
          </div>
        </section>

        <form
          className={dragActive ? "composer is-drop-target" : "composer"}
          style={composerPromptStyle}
          onSubmit={(event) => void submit(event)}
        >
          <button
            type="button"
            className="composer-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-valuemin={COMPOSER_PROMPT_MIN_HEIGHT}
            aria-valuemax={composerPromptHeightMax}
            aria-valuenow={composerPromptHeight}
            aria-keyshortcuts="Home"
            onPointerDown={startComposerResize}
            onPointerMove={dragComposerResize}
            onPointerUp={endComposerResize}
            onPointerCancel={endComposerResize}
            onKeyDown={resizeComposerFromKeyboard}
            onDoubleClick={resetPromptHeight}
            title={t("composer.resizeHint")}
            aria-label={t("composer.resize")}
          >
            <span />
          </button>
          <div className="composer-inner">
            <div className="composer-top">
            {references.length > 0 && (
              <div className="reference-strip">
                {references.map((file, index) => {
                  const src = URL.createObjectURL(file);
                  return (
                    <div
                      className={[
                        "reference-chip",
                        draggedReferenceIndex === index ? "is-dragging" : "",
                        referenceDropIndex === index && draggedReferenceIndex !== index ? "is-drop-target" : "",
                      ].filter(Boolean).join(" ")}
                      key={`${file.name}-${index}`}
                      onDragOver={(event) => onReferenceDragOver(event, index)}
                      onDrop={(event) => onReferenceDrop(event, index)}
                      onDragEnd={onReferenceDragEnd}
                      title={t("reference.dragReorder")}
                    >
                      <span
                        className="reference-drag-handle"
                        draggable
                        onDragStart={(event) => onReferenceDragStart(event, index)}
                        onDragEnd={onReferenceDragEnd}
                        title={t("reference.dragSort")}
                      >
                        ⋮⋮
                      </span>
                      <button type="button" className="reference-preview" onClick={() => previewReference(file)} title={t("reference.preview")}>
                        <img src={src} alt={file.name} onLoad={() => URL.revokeObjectURL(src)} />
                      </button>
                      <div className="reference-mask-meta">
                        <span>{file.name}</span>
                        {index === 0 && maskCapability.available && (
                          <span className="reference-mask-badges">
                            <em className="reference-mask-badge">{t("mask.baseBadge")}</em>
                            {activeComposerMask && (
                              <em className="reference-mask-badge is-applied" title={t("mask.strictProtection")}>
                                {t(activeComposerMask.encoding === "compat" ? "mask.compatBadge" : "mask.appliedBadge")}
                              </em>
                            )}
                            <button
                              type="button"
                              className="reference-mask-action"
                              onClick={openMaskEditor}
                              title={activeComposerMask ? t("mask.update") : t("mask.edit")}
                              aria-label={activeComposerMask ? t("mask.update") : t("mask.edit")}
                            >
                              <PencilLine size={13} />
                            </button>
                          </span>
                        )}
                      </div>
                      <button type="button" className="reference-remove" onClick={() => setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))} title={t("reference.remove")}>
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {referenceState.noticeKey && (
              <div className="reference-chat-notice" role="status">
                <AlertCircle size={15} />
                <span>{t(referenceState.noticeKey)}</span>
              </div>
            )}
            <div className="composer-toolbar" ref={composerToolsRef}>
            <div className="submit-mode-switch" role="tablist" aria-label={t("submit.mode")}>
              <button
                type="button"
                className={submitMode === "generate" ? "active" : ""}
                onClick={() => setSubmitMode("generate")}
                aria-selected={submitMode === "generate"}
                title={t("submit.generateTooltip")}
              >
                {t("submit.generate")}
              </button>
              <button
                type="button"
                className={submitMode === "chat" ? "active" : ""}
                onClick={() => setSubmitMode("chat")}
                aria-selected={submitMode === "chat"}
                title={t("submit.chatTooltip")}
              >
                {t("submit.chat")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!referenceState.canAdd}
              title={referenceState.canAdd ? t("reference.addTooltip") : t("reference.chatNotSent")}
              aria-label={referenceState.canAdd ? t("reference.addTooltip") : t("reference.chatNotSent")}
            >
              <ImagePlus size={16} /> {references.length > 0 ? t("reference.count", { count: references.length }) : t("reference.button")}
            </button>
            <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={onReferenceChange} />
            <div className="composer-popover-wrap size-settings-wrap">
              <button
                type="button"
                className="size-settings-trigger"
                onClick={() => openComposerPopover("size")}
                aria-expanded={composerPopover === "size"}
                {...tooltipProps(t("composer.sizeButtonTooltip"))}
              >
                <Maximize2 size={15} />
                <span className="size-settings-label">{t("composer.size")}</span>
                <span className="size-settings-summary">{currentSizeLabel()}</span>
              </button>
              {composerPopover === "size" && (
                <div className="composer-popover size-settings-popover" role="dialog" aria-label={t("composer.sizeDialog")}>
                  <section className="generation-settings-section size-settings-section">
                    <div className="generation-settings-heading">
                      <strong>{t("composer.size")}</strong>
                      <span>{currentSizeLabel()}</span>
                    </div>
                    {activeEngine === "banana" ? (
                      <>
                        <Field label={t("composer.aspect")}>
                          <select value={bananaForm.aspect_ratio} onChange={(event) => setBananaForm({ ...bananaForm, aspect_ratio: event.target.value })}>
                            {bananaAspectOptions.map((item) => <option key={item}>{item}</option>)}
                          </select>
                        </Field>
                        <div className="choice-grid">
                          {bananaAspectOptions.slice(0, 8).map((item) => (
                            <button type="button" key={item} className={bananaForm.aspect_ratio === item ? "selected" : ""} onClick={() => setBananaForm({ ...bananaForm, aspect_ratio: item })}>
                              {item}
                            </button>
                          ))}
                        </div>
                        <Field label={t("composer.resolution")}>
                          <select value={bananaForm.image_size} onChange={(event) => setBananaForm({ ...bananaForm, image_size: event.target.value })}>
                            {bananaImageSizeOptions.map((item) => <option key={item} value={item}>{bananaImageSizeLabel(item)}</option>)}
                          </select>
                        </Field>
                      </>
                    ) : (
                      <>
                        <div className="size-preset-section">
                          <div className="preset-row size-tier-row" role="group" aria-label={t("composer.clarity")}>
                            {gptComposerSizeTiers.map((tier) => (
                              <button
                                type="button"
                                key={tier}
                                className={gptSizeSelection.tier === tier ? "selected" : ""}
                                onClick={() => applyGptComposerSize(tier)}
                              >
                                {tier === "auto" ? t("option.auto") : tier}
                              </button>
                            ))}
                          </div>
                          <div className="preset-row aspect-row" role="group" aria-label={t("composer.aspect")}>
                            {gptComposerAspectOptions.map((aspect) => (
                              <button
                                type="button"
                                key={aspect}
                                className={gptSizeSelection.aspect === aspect ? "selected" : ""}
                                onClick={() => applyGptComposerSize(gptSizeSelection.tier === "auto" || !gptSizeSelection.tier ? "1K" : gptSizeSelection.tier, aspect)}
                              >
                                {aspect}
                              </button>
                            ))}
                          </div>
                          <div className="preset-summary">
                            {gptSizeSelection.summary}
                          </div>
                        </div>
                        <div className="custom-size-row">
                          <label>
                            <span>{t("composer.width")}</span>
                            <input
                              inputMode="numeric"
                              min={GPT_CUSTOM_SIZE_MIN}
                              max={GPT_CUSTOM_SIZE_MAX}
                              value={customSizeDraft.width}
                              onChange={(event) => setCustomSizeDimension("width", event.target.value)}
                              onBlur={handleCustomSizeBlur}
                            />
                          </label>
                          <span className="size-separator">x</span>
                          <label>
                            <span>{t("composer.height")}</span>
                            <input
                              inputMode="numeric"
                              min={GPT_CUSTOM_SIZE_MIN}
                              max={GPT_CUSTOM_SIZE_MAX}
                              value={customSizeDraft.height}
                              onChange={(event) => setCustomSizeDimension("height", event.target.value)}
                              onBlur={handleCustomSizeBlur}
                            />
                          </label>
                          <button
                            type="button"
                            className={`${gptSizeSelection.mode === "custom" ? "selected " : ""}primary-action`}
                            onClick={() => normalizeCustomSize()}
                          >
                            {t("composer.applyCustomSize")}
                          </button>
                        </div>
                        <div className={sizeAdjustmentNotice ? "size-adjustment-note active" : "size-adjustment-note"} role="status">
                          {sizeAdjustmentNotice || t("composer.customSizeHelp", {
                            min: GPT_CUSTOM_SIZE_MIN,
                            max: GPT_CUSTOM_SIZE_MAX,
                            ratio: GPT_CUSTOM_SIZE_MAX_RATIO,
                            minPixels: GPT_CUSTOM_SIZE_MIN_PIXELS.toLocaleString(language === "en" ? "en-US" : "zh-CN"),
                            maxPixels: GPT_CUSTOM_SIZE_MAX_PIXELS.toLocaleString(language === "en" ? "en-US" : "zh-CN"),
                          })}
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}
            </div>
            <div className="composer-popover-wrap generation-settings-wrap">
              <button
                type="button"
                className="generation-settings-trigger"
                onClick={() => openComposerPopover("settings")}
                aria-expanded={composerPopover === "settings"}
                {...tooltipProps(t("composer.generationSettingsTooltip"))}
              >
                <SlidersHorizontal size={15} />
                <span className="generation-settings-label">{t("composer.generationSettings")}</span>
                <span className="generation-settings-summary">{currentGenerationSettingsSummary()}</span>
                {generationCountFor(activeEngine, gptForm, bananaForm) > 1 && (
                  <span className="generation-count-alert" title={t("composer.countTooltip")}>
                    {generationCountFor(activeEngine, gptForm, bananaForm)}
                  </span>
                )}
              </button>
              {composerPopover === "settings" && (
                <div className="composer-popover generation-settings-popover" role="dialog" aria-label={t("composer.generationSettingsDialog")}>
                  {activeEngine !== "banana" && (
                    <section className="generation-settings-section quality-settings-section">
                      <div className="generation-settings-heading">
                        <strong>{t("composer.quality")}</strong>
                        <span>{currentQualityLabel()}</span>
                      </div>
                    <div className="choice-grid quality">
                      {gptQualityOptions.map((item) => (
                        <button
                          type="button"
                          key={item}
                          className={gptForm.quality === item ? "selected" : ""}
                          onClick={() => setGptForm({ ...gptForm, quality: item })}
                        >
                          {optionLabel(item)}
                        </button>
                      ))}
                    </div>
                    </section>
                  )}
                  <section className="generation-settings-section count-settings-section">
                    <div className="generation-settings-heading">
                      <strong>{t("composer.countField")}</strong>
                      <span>{currentCountLabel()}</span>
                    </div>
                  {activeEngine === "banana" ? (
                    <input className="generation-count-input" aria-label={t("composer.countField")} type="number" min={1} max={8} value={bananaForm.batch_size} onChange={(event) => setGenerationCount("banana", Number(event.target.value))} />
                  ) : (
                    <input className="generation-count-input" aria-label={t("composer.countField")} type="number" min={1} max={10} value={gptForm.n} onChange={(event) => setGenerationCount("gpt-image-2", Number(event.target.value))} />
                  )}
                  <div className="choice-grid counts">
                    {(activeEngine === "banana" ? [1, 2, 3, 4, 6, 8] : [1, 2, 3, 4, 6, 8, 10]).map((item) => {
                      const selected = activeEngine === "banana" ? bananaForm.batch_size === item : gptForm.n === item;
                      return (
                        <button
                          type="button"
                          key={item}
                          className={selected ? "selected" : ""}
                          onClick={() => setGenerationCount(activeEngine, item)}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                    {generationCountFor(activeEngine, gptForm, bananaForm) > 1 && (
                      <div className="generation-count-note" role="status">
                        <AlertCircle size={14} /> {t("composer.multiImageNotice")}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
            <button type="button" onClick={() => { hideTooltip(); setAdvancedOpen(true); }} {...tooltipProps(t("composer.advancedTooltip"))}>
              {t("composer.advanced")}
            </button>
            </div>
          </div>
          <div className="composer-input">
            <div className="composer-textarea-wrap" ref={promptWrapRef}>
              <textarea
                ref={promptRef}
                rows={3}
                value={activePrompt}
                placeholder={submitMode === "chat" ? t("composer.chatPlaceholder") : t("composer.generatePlaceholder")}
                onChange={(event) => applyPrompt(event.target.value, activeEngine)}
                onKeyDown={submitFromComposerKey}
              />
              <div className="composer-prompt-actions">
                <button
                  type="button"
                  className={sessionPromptSummary ? "session-prompt-button has-content" : "session-prompt-button"}
                  onClick={openSessionPromptEditor}
                  aria-label={t("composer.openSessionPrompt")}
                  title={sessionPromptSummary || t("composer.sessionPromptEmptyTitle")}
                >
                  <span className="session-prompt-button-title">
                    <span className="session-prompt-label-full">{t("composer.sessionPrompt")}</span>
                    <span className="session-prompt-label-short">{t("composer.sessionPromptShort")}</span>
                  </span>
                  <span className="session-prompt-button-summary">
                    <span className="session-prompt-summary-full">{sessionPromptSummary || t("composer.sessionPromptUnset")}</span>
                    <span className="session-prompt-summary-short">{sessionPromptSummary || t("composer.sessionPromptUnsetShort")}</span>
                  </span>
                </button>
                <button
                  className="prompt-expand-button"
                  type="button"
                  onClick={openPromptEditor}
                  title={t("composer.expandPrompt")}
                  aria-label={t("composer.expandPrompt")}
                >
                  <span className="prompt-expand-label-full">{t("composer.expandPromptShort")}</span>
                  <span className="prompt-expand-label-short">{t("composer.expandPromptShort")}</span>
                </button>
              </div>
            </div>
            <button
              className="submit-button"
              disabled={busy}
              type="submit"
              title={submitMode === "chat" ? t("submit.chatTooltip") : t("submit.startGenerate")}
              aria-label={submitMode === "chat" ? t("submit.chatTooltip") : t("submit.startGenerate")}
            >
              {busy ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
            </button>
          </div>
          </div>
        </form>
      </section>

      {pendingSessionSwitch && (
        <div className="drawer-shell reference-switch-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("session.switchClose")} onClick={cancelPendingSessionSwitch} />
          <section className="drawer reference-switch-drawer" role="dialog" aria-modal="true" aria-label={t("session.switchReferenceTitle")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("session.switchReferenceHint")}</p>
                <h2>{t("session.switchTo", { title: pendingSessionSwitch.nextSessionTitle })}</h2>
              </div>
              <button type="button" onClick={cancelPendingSessionSwitch} aria-label={t("session.switchClose")} title={t("common.close")}><X size={18} /></button>
            </div>
            <div className="config-warning" role="alert">
              <AlertCircle size={16} />
              <span>{t("session.switchWarning", { count: references.length })}</span>
            </div>
            <div className="drawer-actions">
              <button type="button" onClick={() => switchToSession(pendingSessionSwitch.nextSessionId, "preserve")}>{t("session.switchKeep")}</button>
              <button type="button" onClick={() => switchToSession(pendingSessionSwitch.nextSessionId, "clear")}>{t("session.switchClear")}</button>
              <button type="button" onClick={cancelPendingSessionSwitch}>{t("common.cancel")}</button>
            </div>
          </section>
        </div>
      )}

      {pendingMultiImageConfirm && (
        <div className="drawer-shell multi-image-confirm-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("multiImage.close")} onClick={() => setPendingMultiImageConfirm(null)} />
          <section className="drawer multi-image-confirm-drawer" role="dialog" aria-modal="true" aria-label={t("multiImage.aria")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("multiImage.subtitle")}</p>
                <h2>{t("multiImage.title", { count: pendingMultiImageConfirm.count })}</h2>
              </div>
              <button type="button" onClick={() => setPendingMultiImageConfirm(null)} aria-label={t("multiImage.close")} title={t("common.close")}><X size={18} /></button>
            </div>
            <div className="config-warning" role="alert">
              <AlertCircle size={16} />
              <span>{t("multiImage.warning")}</span>
            </div>
            <label className="multi-image-confirm-check">
              <input type="checkbox" checked={skipMultiImageConfirmChecked} onChange={(event) => setSkipMultiImageConfirmChecked(event.target.checked)} />
              <span>{t("multiImage.skipThisSession")}</span>
            </label>
            <div className="drawer-actions">
              <button type="button" className="primary-action" onClick={confirmMultiImageGeneration}>{t("multiImage.confirm", { count: pendingMultiImageConfirm.count })}</button>
              <button type="button" onClick={resetMultiImageCount}>{t("multiImage.reset")}</button>
              <button type="button" onClick={() => setPendingMultiImageConfirm(null)}>{t("common.cancel")}</button>
            </div>
          </section>
        </div>
      )}

      {renameOpen && (
        <div className="drawer-shell rename-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("session.rename")} onClick={() => setRenameOpen(false)} />
          <section className="drawer rename-drawer" role="dialog" aria-modal="true" aria-label={t("session.rename")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("session.local")}</p>
                <h2>{t("session.rename")}</h2>
              </div>
              <button type="button" onClick={() => setRenameOpen(false)} aria-label={t("session.rename")} title={t("common.close")}><X size={18} /></button>
            </div>
            <form
              className="rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                renameActiveSession();
              }}
            >
              <Field label={t("session.name")}>
                <input autoFocus value={sessionTitleDraft} onChange={(event) => setSessionTitleDraft(event.target.value)} />
              </Field>
              <div className="drawer-actions">
                <button type="submit" className="primary-action">{t("common.save")}</button>
                <button type="button" onClick={() => setRenameOpen(false)}>{t("common.cancel")}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {promptEditorOpen && (
        <div className="drawer-shell prompt-editor-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("composer.promptEditorClose")} onClick={() => setPromptEditorOpen(false)} />
          <section className="drawer prompt-editor-drawer" role="dialog" aria-modal="true" aria-label={t("composer.promptEditor")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{submitMode === "chat" ? t("composer.chatContent") : t("composer.generatePrompt")}</p>
                <h2>{t("composer.promptEditor")}</h2>
              </div>
              <button type="button" onClick={() => setPromptEditorOpen(false)} aria-label={t("composer.promptEditorClose")} title={t("common.close")}><X size={18} /></button>
            </div>
            <textarea
              className="prompt-editor-textarea"
              autoFocus
              value={promptEditorDraft}
              onChange={(event) => setPromptEditorDraft(event.target.value)}
            />
            <div className="drawer-actions">
              <button type="button" className="primary-action" onClick={applyPromptEditor}>{t("common.apply")}</button>
              <button type="button" onClick={() => setPromptEditorOpen(false)}>{t("common.cancel")}</button>
            </div>
          </section>
        </div>
      )}

      {sessionPromptOpen && (
        <div className="drawer-shell prompt-editor-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("composer.sessionPrompt")} onClick={() => setSessionPromptOpen(false)} />
          <section className="drawer session-prompt-drawer" role="dialog" aria-modal="true" aria-label={t("composer.sessionPrompt")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("sessionPrompt.subtitle")}</p>
                <h2>{t("composer.sessionPrompt")}</h2>
              </div>
              <button type="button" onClick={() => setSessionPromptOpen(false)} aria-label={t("composer.sessionPrompt")} title={t("common.close")}><X size={18} /></button>
            </div>
            <div className="session-prompt-drawer-note">
              {t("sessionPrompt.note")}
            </div>
            <div className="session-prompt-fields">
              <Field label={t("sessionPrompt.fixed")} help={t("sessionPrompt.fixedHelp")}>
                <textarea value={sessionPromptDraft.fixed_prompt} onChange={(event) => setSessionPromptDraft((current) => ({ ...current, fixed_prompt: event.target.value }))} />
              </Field>
              <Field label={t("sessionPrompt.negative")} help={t("sessionPrompt.negativeHelp")}>
                <textarea value={sessionPromptDraft.negative_prompt} onChange={(event) => setSessionPromptDraft((current) => ({ ...current, negative_prompt: event.target.value }))} />
              </Field>
              <Field label={t("sessionPrompt.posterText")} help={t("sessionPrompt.posterTextHelp")}>
                <input value={sessionPromptDraft.poster_text} onChange={(event) => setSessionPromptDraft((current) => ({ ...current, poster_text: event.target.value }))} />
              </Field>
            </div>
            <div className="drawer-actions session-prompt-actions">
              <button
                type="button"
                onClick={() => setSessionPromptDraft((current) => ({ ...current, fixed_prompt: "" }))}
              >
                {t("sessionPrompt.clearFixed")}
              </button>
              <button
                type="button"
                onClick={() => setSessionPromptDraft((current) => ({ ...current, negative_prompt: "", poster_text: "" }))}
              >
                {t("sessionPrompt.clearGpt")}
              </button>
              <button type="button" className="primary-action" onClick={applySessionPromptEditor}>{t("common.apply")}</button>
              <button type="button" onClick={() => setSessionPromptOpen(false)}>{t("common.cancel")}</button>
            </div>
          </section>
        </div>
      )}

      {connectionOpen && (
        <div className="drawer-shell connection-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("config.drawerAria")} onClick={closeConnectionDrawer} />
          <section className="drawer connection-drawer" role="dialog" aria-modal="true" aria-label={t("config.drawerAria")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("config.drawerHint")}</p>
                <h2>{t("config.drawerTitle")}</h2>
              </div>
              <button type="button" onClick={closeConnectionDrawer} aria-label={t("config.drawerAria")} title={t("common.close")}><X size={18} /></button>
            </div>
            <div className="connection-layout">
              <aside className="profile-list" aria-label={t("config.profileList")}>
                {activeEngineProfiles.map((profile) => {
                  const selected = profile.id === activeProfileIds[activeEngine];
                  const canDeleteProfile = activeEngineProfiles.length > 1;
                  return (
                    <div
                      key={profile.id}
                      className={selected ? "profile-row selected" : "profile-row"}
                    >
                      <button
                        type="button"
                        className={selected ? "profile-item selected" : "profile-item"}
                        onClick={() => selectConfigProfile(profile)}
                      >
                        <span>{profile.name}</span>
                        <small>{profile.engine === "banana" ? "Banana Gemini" : "GPT Image 2"}</small>
                      </button>
                      <button
                        type="button"
                        className="profile-delete-button"
                        onClick={() => deleteConfigProfile(profile)}
                        disabled={!canDeleteProfile}
                        aria-label={t("config.deleteProfileAria", { name: profile.name || t("queue.unnamed") })}
                        title={canDeleteProfile ? t("config.delete") : t("config.keepOne")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="profile-add-button" onClick={addConfigProfile}>
                  <Plus size={15} />
                  <span>{t("config.add")}</span>
                </button>
              </aside>
              <div className="connection-fields">
                {!hasCompleteConfig && (
                  <div className="config-warning" role="alert">
                    <AlertCircle size={16} />
                    <span>{t("config.missing", { items: listText(activeConfigIssues) })}</span>
                  </div>
                )}
                {diagnosticsResult && (
                  <div className={diagnosticsResult.ok ? "diagnostics-panel ok" : "diagnostics-panel warning"}>
                    <div className="diagnostics-panel-head">
                      <strong>{diagnosticsResult.ok ? t("config.diagnosticsOk") : t("config.diagnosticsWarn")}</strong>
                      {diagnosticsResult.warning && <span>{diagnosticsResult.warning}</span>}
                    </div>
                    {diagnosticsResult.results.length > 0 && (
                      <div className="diagnostics-grid">
                        {diagnosticsResult.results.map((item) => (
                          <div className={item.ok ? "diagnostics-card ok" : "diagnostics-card warning"} key={item.capability}>
                            <div className="diagnostics-card-title">
                              <strong>{item.capability === "generation" ? t("config.generation") : t("config.chat")}</strong>
                              <span>{item.ok ? t("config.pass") : t("config.fail")}</span>
                            </div>
                            <small>{item.model || t("config.noModel")} · {item.latency_ms ?? 0}ms</small>
                            {item.endpoint && <code>{item.endpoint}</code>}
                            {item.error && <p>{item.error}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Field label={t("config.name")}><input placeholder={activeProfileName} value={activeProfile?.name || ""} onChange={(event) => updateActiveProfileName(event.target.value)} /></Field>
                {activeEngine === "gpt-image-2" ? (
                  <>
                    <Field label="API Key" help={t("config.apiKeyHelp")}>
                      <div className="secret-input">
                        <input type={apiKeyVisible ? "text" : "password"} placeholder="sk-..." value={gptForm.api_key} onChange={(event) => updateGptConnectionForm({ api_key: event.target.value })} />
                        <button type="button" onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t("config.hideApiKey") : t("config.showApiKey")} title={apiKeyVisible ? t("config.hideApiKey") : t("config.showApiKey")}>
                          {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>
                    <Field label={t("config.baseUrl")}><input placeholder="https://.../v1" value={gptForm.base_url} onChange={(event) => updateGptConnectionForm({ base_url: event.target.value })} /></Field>
                    <Field label={t("config.imageModel")}><input placeholder="gpt-image-2" value={gptForm.model} onChange={(event) => updateGptConnectionForm({ model: event.target.value })} /></Field>
                    <Field label={t("config.chatModel")} help={t("config.chatModelHelp")}>
                      <div className="stacked-field">
                        <select
                          value={gptChatModelOptions.includes(gptForm.chat_model) ? gptForm.chat_model : "custom"}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateGptConnectionForm({ chat_model: value === "custom" ? gptForm.chat_model : value });
                          }}
                        >
                          {gptChatModelOptions.map((item) => (
                            <option key={item} value={item}>{chatModelOptionLabel(item)}</option>
                          ))}
                        </select>
                        <input placeholder={t("config.customChatModel")} value={gptForm.chat_model} onChange={(event) => updateGptConnectionForm({ chat_model: event.target.value })} />
                      </div>
                    </Field>
                    <Field label={t("config.reasoning")} help={t("config.reasoningHelp")}>
                      <select value={gptForm.reasoning_effort} onChange={(event) => updateGptConnectionForm({ reasoning_effort: event.target.value })}>
                        {gptReasoningOptions.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}
                      </select>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="API Key" help={t("config.apiKeyHelp")}>
                      <div className="secret-input">
                        <input type={apiKeyVisible ? "text" : "password"} placeholder="sk-..." value={bananaForm.api_key} onChange={(event) => updateBananaConnectionForm({ api_key: event.target.value })} />
                        <button type="button" onClick={() => setApiKeyVisible((value) => !value)} aria-label={apiKeyVisible ? t("config.hideApiKey") : t("config.showApiKey")} title={apiKeyVisible ? t("config.hideApiKey") : t("config.showApiKey")}>
                          {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>
                    <Field label={t("config.baseUrl")}><input placeholder="https://.../v1" value={bananaForm.api_base_url} onChange={(event) => updateBananaConnectionForm({ api_base_url: event.target.value })} /></Field>
                    <Field label={t("config.modelName")}><input placeholder="gemini-3-pro-image-preview" value={bananaForm.model_type} onChange={(event) => updateBananaConnectionForm({ model_type: event.target.value })} /></Field>
                  </>
                )}
              </div>
            </div>
            <div className="drawer-actions">
              <button type="button" onClick={() => void loadDefaults()}>{t("config.loadDefaults")}</button>
              <span className="diagnostic-billing-note" role="note">{t("config.generationDiagnosticBilling")}</span>
              <button type="button" onClick={() => void runDiagnostics()} disabled={diagnosticsRunning || !hasCompleteConfig}>
                {diagnosticsRunning ? t("config.testing") : t("config.testConnection")}
              </button>
              <button type="button" className="primary-action" onClick={() => void saveConfig()}>{t("config.save")}</button>
              <button type="button" onClick={closeConnectionDrawer}>{t("config.close")}</button>
            </div>
          </section>
        </div>
      )}

      {advancedOpen && (
        <div className="drawer-shell">
          <button className="drawer-backdrop" type="button" aria-label={t("drawer.advancedClose")} onClick={() => setAdvancedOpen(false)} />
          <section className="drawer" role="dialog" aria-modal="true" aria-label={t("composer.advanced")} tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>{t("drawer.advancedSubtitle")}</p>
                <h2>{t("composer.advanced")}</h2>
              </div>
              <button type="button" onClick={() => setAdvancedOpen(false)} aria-label={t("drawer.advancedClose")} title={t("common.close")}><X size={18} /></button>
            </div>
            <div className="drawer-actions">
              <button type="button" onClick={() => void loadDefaults()}>{t("config.loadDefaults")}</button>
              <button type="button" className="primary-action" onClick={() => void saveConfig()}>{t("config.saveToLocal")}</button>
            </div>
            {activeEngine === "gpt-image-2" ? (
              <GptSettings form={gptForm} onChange={setGptForm} t={t} optionLabel={optionLabel} />
            ) : (
              <BananaSettings form={bananaForm} onChange={setBananaForm} t={t} imageSizeLabel={bananaImageSizeLabel} />
            )}
          </section>
        </div>
      )}

      {historySurface.mode === "quick" && historyQuickPosition && (
        <section
          className="history-quick-popover"
          style={historyQuickStyle}
          role="dialog"
          aria-label={t("history.quickTitle")}
        >
          <div className="history-quick-head">
            <div>
              <strong>{t("history.quickTitle")}</strong>
              <span>{t("history.quickSummary", { shown: recentHistoryEntries.length, total: history.length })}</span>
            </div>
            <div className="history-quick-head-actions">
              <button className="history-quick-expand" type="button" onClick={() => void openHistoryBrowser()} title={t("history.expandBrowser")}>
                <Maximize2 size={15} /> <span>{t("history.expandBrowser")}</span>
              </button>
              <button type="button" onClick={() => closeHistorySurface()} aria-label={t("history.closeBrowser")} title={t("common.close")}>
                <X size={16} />
              </button>
            </div>
          </div>
          {historyLoading ? (
            <div className="history-quick-empty">{t("app.loading")}</div>
          ) : recentHistoryEntries.length > 0 ? (
            <div className="history-quick-grid">
              {recentHistoryEntries.map((entry) => {
                const image = entry.images?.[0];
                const src = imageSrc(image);
                const name = imageName(image);
                const imageCount = entry.images?.length || 0;
                return (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => openPreviewImages(entry.images || [], 0, {
                      historyEntryId: entry.id,
                      historyOrigin: "quick",
                      requestedSize: requestedSizeLabel(entry),
                    })}
                    disabled={!src}
                    title={`${formatTime(entry.created_at, language)} · ${engineLabel(entry.engine || "gpt-image-2")} · ${entry.prompt || t("history.noPrompt")}`}
                  >
                    {src ? <img src={src} alt={name} loading="lazy" /> : <span>{t("app.noImage")}</span>}
                    {imageCount > 1 && <span className="history-quick-count">{t("history.imageCount", { count: imageCount })}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="history-quick-empty">{t("app.emptyHistory")}</div>
          )}
        </section>
      )}

      {historyActionMenu && historyActionEntry && (
        <div
          className={`history-action-popover ${historyActionMenu.placement}`}
          style={{ left: historyActionMenu.left, top: historyActionMenu.top }}
          role="menu"
          aria-label={t("history.moreActions")}
        >
          {historyActionMenu.source === "sidebar" ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryActionMenu(null);
                  openHistoryPreview(historyActionEntry);
                }}
                disabled={!historyActionSrc}
              >
                <ExternalLink size={14} /> <span>{t("history.previewImage")}</span>
              </button>
              <button
                className="history-tool-remove"
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryActionMenu(null);
                  void deleteHistory(historyActionEntry, false);
                }}
                disabled={historyActionEntry.legacy}
              >
                <ListX size={14} /> <span>{t("history.removeRecord")}</span>
              </button>
              <button
                className="history-tool-danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryActionMenu(null);
                  void deleteHistory(historyActionEntry, true);
                }}
                disabled={!historyActionSrc}
              >
                <Trash2 size={14} /> <span>{t("history.deleteFiles")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="history-browser-action-remove"
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryActionMenu(null);
                  void deleteHistory(historyActionEntry, false);
                }}
                disabled={historyActionEntry.legacy}
              >
                <X size={14} /> <span>{t("history.removeRecord")}</span>
              </button>
              <button
                className="history-browser-action-danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setHistoryActionMenu(null);
                  void deleteHistory(historyActionEntry, true);
                }}
                disabled={!historyActionSrc}
              >
                <Trash2 size={14} /> <span>{t("history.deleteFiles")}</span>
              </button>
            </>
          )}
        </div>
      )}

      {historySurface.mode === "browser" && (
        <div className="history-detail-shell">
          <button className="history-detail-backdrop" type="button" aria-label={t("history.closeBrowser")} onClick={() => closeHistorySurface()} />
          <section className={historyDetail ? "history-browser is-detail" : "history-browser"} role="dialog" aria-modal="true" aria-label={t("history.browser")} tabIndex={-1} onKeyDown={handleHistorySurfaceKeyDown}>
            {historySurface.mode === "browser" && historyDetail ? (
              <>
                <div className="history-detail-head history-browser-detail-head">
                  <div className="history-detail-heading">
                    <button className="history-back-button" type="button" onClick={backToHistoryBrowser}>
                      <ChevronLeft size={16} /> <span>{t("history.backToBrowser")}</span>
                    </button>
                    <p>{formatTime(historyDetail.created_at, language)} · {engineLabel(historyDetail.engine || "gpt-image-2")}</p>
                    <h2>{t("history.context")}</h2>
                  </div>
                  <button type="button" onClick={() => closeHistorySurface()} aria-label={t("history.closeBrowser")} title={t("common.close")}><X size={18} /></button>
                </div>
                <div className="history-detail-body">
                  <section className="detail-section">
                    <h3>{t("history.prompt")}</h3>
                    <p className="detail-prompt">{historyDetail.prompt || t("history.noPrompt")}</p>
                    {String(historyDetail.form_state?.context_prompt || "") && (
                      <>
                        <h3>{t("history.fixedPrompt")}</h3>
                        <p className="detail-prompt muted">{String(historyDetail.form_state?.context_prompt || "")}</p>
                      </>
                    )}
                    {historyDetail.negative_prompt && (
                      <>
                        <h3>{t("history.negativePrompt")}</h3>
                        <p className="detail-prompt muted">{historyDetail.negative_prompt}</p>
                      </>
                    )}
                  </section>
                  {historyDetail.images?.length ? (
                    <section className="detail-section">
                      <h3>{t("history.resultImages")}</h3>
                      <div className="detail-images">
                        {historyDetail.images.map((image, index) => {
                          const src = imageSrc(image);
                          const name = imageName(image, index);
                          const dimensions = imageDimensionsLabel(image);
                          return (
                            <button type="button" key={`${historyDetail.id}-${index}`} onClick={() => openPreviewImages(historyDetail.images || [], index)} disabled={!src}>
                              {src ? <img src={src} alt={name} loading="lazy" /> : <span>{t("app.noImage")}</span>}
                              {dimensions && <small>{dimensions}</small>}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                  <section className="detail-section">
                    <h3>{t("history.params")}</h3>
                    <KeyValueGrid value={historyDetail.form_state || {}} emptyLabel={t("history.emptyParams")} />
                  </section>
                  {historyDetail.meta && Object.keys(historyDetail.meta).length > 0 && (
                    <section className="detail-section">
                      <h3>{t("history.response")}</h3>
                      <KeyValueGrid value={historyDetail.meta} emptyLabel={t("history.emptyParams")} />
                    </section>
                  )}
                </div>
                <div className="history-detail-actions">
                  <button type="button" onClick={() => applyHistory(historyDetail)}>
                    <RotateCcw size={15} /> {t("history.apply")}
                  </button>
                  <button type="button" onClick={() => copyPrompt(historyDetail.prompt || "")} disabled={!historyDetail.prompt}>
                    <Copy size={15} /> {t("history.copyPrompt")}
                  </button>
                  {historyDetail.images?.length === 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstImage = historyDetail.images?.[0];
                        const src = imageSrc(firstImage);
                        if (src) void addOutputAsReference(src, imageName(firstImage));
                      }}
                      disabled={referenceActionsDisabled || !imageSrc(historyDetail.images?.[0])}
                    >
                      <ImagePlus size={15} /> {t("history.useReference")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="history-detail-head">
                  <div>
                    <p>{t("app.historyCount", { count: filteredHistory.length })}</p>
                    <h2>{t("history.browser")}</h2>
                  </div>
                  <button type="button" onClick={() => closeHistorySurface()} aria-label={t("history.closeBrowser")} title={t("common.close")}><X size={18} /></button>
                </div>
                <div className="history-browser-toolbar">
                  <select value={historyFavoriteFilter} onChange={(event) => setHistoryFavoriteFilter(event.target.value as HistoryFavoriteFilter)} aria-label={t("history.favoriteFilter")}>
                    <option value="all">{t("history.allItems")}</option>
                    <option value="favorite">{t("history.onlyFavorites")}</option>
                  </select>
                  <select value={historyDateFilter} onChange={(event) => setHistoryDateFilter(event.target.value as HistoryDateFilter)} aria-label={t("history.dateFilter")}>
                    <option value="all">{t("history.allDates")}</option>
                    <option value="today">{t("history.today")}</option>
                    <option value="7d">{t("history.last7Days")}</option>
                    <option value="30d">{t("history.last30Days")}</option>
                  </select>
                  <select value={historyEngineFilter} onChange={(event) => setHistoryEngineFilter(event.target.value as HistoryEngineFilter)} aria-label={t("history.engineFilter")}>
                    <option value="all">{t("history.allEngines")}</option>
                    <option value="gpt-image-2">GPT Image 2</option>
                    <option value="banana">Banana Gemini</option>
                  </select>
                  <button type="button" onClick={() => void openOutputs()} title={t("app.openOutputFolder")}><FolderOpen size={15} /> {t("app.outputFolder")}</button>
                </div>
                <div className="history-browser-grid" ref={historyBrowserScrollRef}>
                  {filteredHistory.length === 0 ? (
                    <div className="empty-history">{t("history.noFilteredItems")}</div>
                  ) : visibleHistory.map((entry) => {
                    const firstImage = entry.images?.[0];
                    const actualDimensions = imageDimensionsLabel(firstImage);
                    const requestedSize = requestedSizeLabel(entry);
                    const mismatch = dimensionMismatchLabel(entry, firstImage);
                    return (
                      <article className="history-browser-card" key={entry.id}>
                        <div className="history-browser-batch-preview" data-image-count={Math.min(entry.images?.length || 0, 4)}>
                          {entry.images?.slice(0, 4).map((image, index) => {
                            const src = imageSrc(image);
                            const name = imageName(image, index);
                            const remaining = (entry.images?.length || 0) - 4;
                            return (
                              <button
                                type="button"
                                className="history-browser-batch-image"
                                key={`${entry.id}-${index}`}
                                onClick={() => openPreviewImages(entry.images || [], index, {
                                  historyEntryId: entry.id,
                                  historyOrigin: "browser",
                                  requestedSize: requestedSizeLabel(entry),
                                })}
                                disabled={!src}
                                title={t("history.previewImage")}
                              >
                                {src ? <img src={src} alt={name} loading="lazy" /> : <span>{t("app.noImage")}</span>}
                                {index === 3 && remaining > 0 && <span className="history-browser-batch-more">+{remaining}</span>}
                              </button>
                            );
                          })}
                          {!entry.images?.length && <span className="history-browser-batch-empty">{t("app.noImage")}</span>}
                          <button
                            className={entry.favorite ? "history-browser-favorite active" : "history-browser-favorite"}
                            type="button"
                            onClick={() => void toggleFavorite(entry)}
                            title={entry.favorite ? t("history.unfavorite") : t("history.favorite")}
                            aria-label={entry.favorite ? t("history.unfavorite") : t("history.favorite")}
                            aria-pressed={Boolean(entry.favorite)}
                            disabled={entry.legacy}
                          >
                            <Heart size={15} fill={entry.favorite ? "currentColor" : "none"} />
                          </button>
                        </div>
                        <button type="button" className="history-browser-card-main" onClick={() => openHistoryContext(entry)} title={t("history.openContext")}>
                          <div className="history-browser-meta">
                            <span>{formatTime(entry.created_at, language)}</span>
                            <span>{engineLabel(entry.engine || "gpt-image-2")}</span>
                            {(entry.images?.length || 0) > 1 && <span>{t("history.imageCount", { count: entry.images?.length || 0 })}</span>}
                          </div>
                          <strong>{entry.prompt || t("history.noPrompt")}</strong>
                          <div className="history-browser-dimensions">
                            {actualDimensions && <span>{actualDimensions}</span>}
                            {mismatch ? <span>{t("history.requestedSize", { value: requestedSize })}</span> : requestedSize && !actualDimensions ? <span>{t("history.requestedSize", { value: requestedSize })}</span> : null}
                          </div>
                        </button>
                        <div className="history-browser-actions">
                          <button className="history-browser-quick-action" type="button" onClick={() => applyHistory(entry)} title={t("history.apply")}>
                            <RotateCcw size={14} /> <span>{t("history.applyShort")}</span>
                          </button>
                          <button
                            className="history-more-trigger"
                            type="button"
                            onClick={(event) => openHistoryActionMenu(event, entry, "browser")}
                            aria-haspopup="menu"
                            aria-expanded={historyActionMenu?.entryId === entry.id && historyActionMenu.source === "browser"}
                            title={t("history.moreActions")}
                          >
                            <Ellipsis size={14} /> <span>{t("history.more")}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {visibleHistory.length < filteredHistory.length && (
                    <button
                      type="button"
                      className="history-browser-more"
                      onClick={() => setHistoryBrowserLimit((limit) => Math.min(limit + HISTORY_BROWSER_PAGE_SIZE, filteredHistory.length))}
                    >
                      {t("history.loadMore")}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {maskEditorOpen && references[0] && (
        <MaskEditor
          file={references[0]}
          initialMaskFile={activeComposerMask?.maskFile}
          initialEncoding={activeComposerMask?.encoding}
          t={t}
          onCancel={() => setMaskEditorOpen(false)}
          onApply={applyMaskResult}
          onRemove={activeComposerMask ? removeMask : undefined}
        />
      )}

      {previewImage && (
        <div className="lightbox">
          <button className="lightbox-backdrop" type="button" onClick={closePreviewImage} aria-label={t("preview.close")} />
          <div ref={previewDialogRef} className="lightbox-card" role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={handlePreviewKeyDown}>
            <div>
              <strong>
                {previewImage.gallery && previewImage.gallery.length > 1 ? `${previewImage.name} · ${(previewImage.galleryIndex || 0) + 1}/${previewImage.gallery.length}` : previewImage.name}
                {(previewImage.dimensions || previewImage.requestedSize) && (
                  <small className="preview-title-meta">
                    {previewImage.dimensions ? `${previewImage.dimensions.width} x ${previewImage.dimensions.height}` : ""}
                    {previewImage.requestedSize ? ` · ${t("history.requestedSize", { value: previewImage.requestedSize })}` : ""}
                  </small>
                )}
              </strong>
              <span>
                {previewImage.historyEntryId && (
                  <button
                    type="button"
                    className="preview-history-action"
                    onClick={openPreviewHistoryContext}
                    title={t("preview.viewHistoryDetails")}
                    aria-label={t("preview.viewHistoryDetails")}
                  >
                    <ExternalLink size={16} />
                    <span>{t("preview.viewHistoryDetails")}</span>
                  </button>
                )}
                {!previewImage.isMaskSnapshot && (
                  <button
                    type="button"
                    className="preview-mask-action"
                    onClick={() => void editPreviewMask(previewImage)}
                    title={previewImage.sourceFile || isSameOriginOutput(previewImage.src) ? t("preview.editMask") : t("status.outputOnly")}
                    aria-label={t("preview.editMask")}
                    aria-busy={previewMaskLoading}
                    disabled={previewMaskLoading || (!previewImage.sourceFile && !isSameOriginOutput(previewImage.src))}
                  >
                    {previewMaskLoading ? <Loader2 className="spin" size={16} /> : <PencilLine size={16} />}
                    <span>{t("preview.editMask")}</span>
                  </button>
                )}
                {!previewImage.isMaskSnapshot && (
                  <button type="button" onClick={() => void addOutputAsReference(previewImage.src, previewImage.name)} title={t("preview.useReference")} disabled={referenceActionsDisabled}><ImagePlus size={18} /></button>
                )}
                <a href={previewImage.src} download={previewImage.name} title={t("preview.download")}><Download size={18} /></a>
                <button type="button" onClick={closePreviewImage} aria-label={t("preview.close")} title={t("preview.close")}><X size={18} /></button>
              </span>
            </div>
            <div
              className={`lightbox-stage${previewZoom > 1 ? " is-zoomed" : ""}${previewDragging ? " is-dragging" : ""}`}
              onWheel={handlePreviewWheel}
              onPointerDown={startPreviewPan}
              onPointerMove={movePreviewPan}
              onPointerUp={endPreviewPan}
              onPointerCancel={endPreviewPan}
              onDoubleClick={handlePreviewDoubleClick}
            >
              {previewImage.gallery && previewImage.gallery.length > 1 && (
                <>
                  <button type="button" className="lightbox-gallery-button previous" onClick={() => shiftPreviewImage(-1)} aria-label={t("preview.previous")} title={t("preview.previous")}><ChevronLeft size={22} /></button>
                  <button type="button" className="lightbox-gallery-button next" onClick={() => shiftPreviewImage(1)} aria-label={t("preview.next")} title={t("preview.next")}><ChevronRight size={22} /></button>
                </>
              )}
              <div className="lightbox-zoom-tools" aria-label={t("preview.zoomControls")}>
                <button type="button" onClick={() => setPreviewZoomLevel(previewZoom - 0.25)} aria-label={t("preview.zoomOut")} title={t("preview.zoomOut")}><ZoomOut size={18} /></button>
                <button type="button" onClick={() => setPreviewZoomLevel(previewZoom + 0.25)} aria-label={t("preview.zoomIn")} title={t("preview.zoomIn")}><ZoomIn size={18} /></button>
                <button type="button" onClick={resetPreviewCanvas} title={t("preview.fit")}>{t("preview.fit")}</button>
                <span>{Math.round(previewZoom * 100)}%</span>
              </div>
              <img
                src={previewImage.src}
                alt={previewImage.name}
                style={{
                  "--preview-zoom": previewZoom,
                  "--preview-pan-x": `${previewPan.x}px`,
                  "--preview-pan-y": `${previewPan.y}px`,
                } as CSSProperties}
              />
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}
    </main>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<InlineTooltipState | null>(null);
  const showTooltip = (event: ReactPointerEvent<HTMLElement> | SyntheticEvent<HTMLElement>) => {
    if (!help) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const showBelow = rect.top < 86;
    setTooltip({
      left: Math.min(window.innerWidth - 18, Math.max(18, rect.left + rect.width / 2)),
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      placement: showBelow ? "bottom" : "top",
    });
  };
  const hideInlineTooltip = () => setTooltip(null);
  return (
    <label
      className="field"
      data-tooltip={help}
      aria-describedby={help && tooltip ? tooltipId : undefined}
      onPointerEnter={showTooltip}
      onPointerLeave={hideInlineTooltip}
      onFocus={showTooltip}
      onBlur={hideInlineTooltip}
    >
      <span>{label}</span>
      {children}
      {help && tooltip && (
        <span
          id={tooltipId}
          className={`inline-tooltip ${tooltip.placement}`}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          {help}
        </span>
      )}
    </label>
  );
}

function Toggle({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<InlineTooltipState | null>(null);
  const showTooltip = (event: ReactPointerEvent<HTMLElement> | SyntheticEvent<HTMLElement>) => {
    if (!help) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const showBelow = rect.top < 86;
    setTooltip({
      left: Math.min(window.innerWidth - 18, Math.max(18, rect.left + rect.width / 2)),
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      placement: showBelow ? "bottom" : "top",
    });
  };
  const hideInlineTooltip = () => setTooltip(null);
  return (
    <label
      className="toggle"
      data-tooltip={help}
      aria-describedby={help && tooltip ? tooltipId : undefined}
      onPointerEnter={showTooltip}
      onPointerLeave={hideInlineTooltip}
      onFocus={showTooltip}
      onBlur={hideInlineTooltip}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
      {help && tooltip && (
        <span
          id={tooltipId}
          className={`inline-tooltip ${tooltip.placement}`}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          {help}
        </span>
      )}
    </label>
  );
}

function KeyValueGrid({ value, emptyLabel }: { value: Record<string, unknown>; emptyLabel: string }) {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "");
  if (entries.length === 0) {
    return <div className="detail-empty">{emptyLabel}</div>;
  }
  return (
    <dl className="key-value-grid">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{typeof item === "object" ? JSON.stringify(item) : String(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GptSettings({ form, onChange, t, optionLabel }: { form: GptForm; onChange: (value: GptForm) => void; t: Translator; optionLabel: (value: string) => string }) {
  const update = <K extends keyof GptForm>(key: K, value: GptForm[K]) => {
    const next = { ...form, [key]: value };
    onChange(key === "custom_size" ? next : normalizeGptForm(next));
  };
  return (
    <div className="settings-grid">
      <Field label={t("settings.size")} help={t("settings.sizeHelp", { max: GPT_CUSTOM_SIZE_MAX, ratio: GPT_CUSTOM_SIZE_MAX_RATIO })}>
        <select value={form.size} onChange={(event) => update("size", event.target.value)}>
          {gptSizeOptions.map((item) => <option key={item} value={item}>{item === "auto" ? t("option.auto") : item === "custom" ? t("config.custom") : item}</option>)}
        </select>
      </Field>
      <Field label={t("settings.customSize")} help={t("settings.customSizeHelp")}><input value={form.custom_size} onChange={(event) => update("custom_size", event.target.value)} /></Field>
      <Field label={t("settings.quality")} help={t("settings.qualityHelp")}>
        <select value={form.quality} onChange={(event) => update("quality", event.target.value)}>
          {gptQualityOptions.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}
        </select>
      </Field>
      <Field label={t("settings.count")} help={t("settings.countHelp")}><input type="number" min={1} max={10} value={form.n} onChange={(event) => update("n", Number(event.target.value))} /></Field>
      <Field label={t("settings.seed")} help={t("settings.seedHelp")}><input type="number" value={form.seed} onChange={(event) => update("seed", Number(event.target.value))} /></Field>
      <Field label={t("settings.stylePreset")} help={t("settings.stylePresetHelp")}>
        <select value={form.style_preset} onChange={(event) => update("style_preset", event.target.value)}>
          {["none", "photographic", "digital-art", "anime", "3d-render", "oil-painting", "watercolor", "sketch"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={t("settings.endpoint")} help={t("settings.endpointHelp")}>
        <select value={form.api_endpoint} onChange={(event) => update("api_endpoint", event.target.value)}>
          {["auto", "/v1/images/generations", "/v1/images/edits", "/v1/responses"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={t("settings.responseFormat")} help={t("settings.responseFormatHelp")}>
        <select value={form.response_format} onChange={(event) => update("response_format", event.target.value)}>
          {["auto", "url", "b64_json"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={t("settings.timeout")} help={t("settings.timeoutHelp")}><input type="number" min={1} max={3600} value={form.timeout} onChange={(event) => update("timeout", Number(event.target.value))} /></Field>
      <Toggle label={t("settings.enhancePrompt")} help={t("settings.enhancePromptHelp")} checked={form.enhance_prompt} onChange={(value) => update("enhance_prompt", value)} />
      <Toggle label={t("settings.safetyCheck")} help={t("settings.safetyCheckHelp")} checked={form.safety_check} onChange={(value) => update("safety_check", value)} />
      <Toggle label={t("settings.infiniteTimeout")} help={t("settings.infiniteTimeoutHelp")} checked={form.infinite_timeout} onChange={(value) => update("infinite_timeout", value)} />
    </div>
  );
}

function BananaSettings({ form, onChange, t, imageSizeLabel }: { form: BananaForm; onChange: (value: BananaForm) => void; t: Translator; imageSizeLabel: (value: string) => string }) {
  const update = <K extends keyof BananaForm>(key: K, value: BananaForm[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="settings-grid">
      <Field label={t("settings.batchSize")} help={t("settings.batchSizeHelp")}><input type="number" min={1} max={8} value={form.batch_size} onChange={(event) => update("batch_size", Number(event.target.value))} /></Field>
      <Field label={t("composer.aspect")} help={t("settings.aspectHelp")}>
        <select value={form.aspect_ratio} onChange={(event) => update("aspect_ratio", event.target.value)}>
          {bananaAspectOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={t("composer.resolution")} help={t("settings.imageSizeHelp")}>
        <select value={form.image_size} onChange={(event) => update("image_size", event.target.value)}>
          {bananaImageSizeOptions.map((item) => <option key={item} value={item}>{imageSizeLabel(item)}</option>)}
        </select>
      </Field>
      <Field label={t("settings.seed")} help={t("settings.bananaSeedHelp")}><input type="number" value={form.seed} onChange={(event) => update("seed", Number(event.target.value))} /></Field>
      <Field label="Top-P" help={t("settings.topPHelp")}><input type="number" min={0} max={1} step={0.01} value={form.top_p} onChange={(event) => update("top_p", Number(event.target.value))} /></Field>
      <Field label={t("settings.timeout")} help={t("settings.bananaTimeoutHelp")}><input type="number" min={60} max={1800} value={form.timeout_seconds} onChange={(event) => update("timeout_seconds", Number(event.target.value))} /></Field>
      <Toggle label={t("settings.infiniteTimeout")} help={t("settings.bananaInfiniteTimeoutHelp")} checked={form.infinite_timeout} onChange={(value) => update("infinite_timeout", value)} />
      <Toggle label={t("settings.bypassProxy")} help={t("settings.bypassProxyHelp")} checked={form.bypass_proxy} onChange={(value) => update("bypass_proxy", value)} />
      <Toggle label={t("settings.disableSsl")} help={t("settings.disableSslHelp")} checked={form.disable_ssl} onChange={(value) => update("disable_ssl", value)} />
    </div>
  );
}

export default App;
