import {
  AlertCircle,
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Heart,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, FocusEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import {
  GPT_CUSTOM_SIZE_MAX,
  GPT_CUSTOM_SIZE_MAX_PIXELS,
  GPT_CUSTOM_SIZE_MAX_RATIO,
  GPT_CUSTOM_SIZE_MIN,
  GPT_CUSTOM_SIZE_MIN_PIXELS,
  normalizeCustomImageSize,
  parseCustomImageSize,
} from "./sizeRules";
import {
  type GptComposerAspect,
  type GptComposerSizeTier,
  gptComposerAspectOptions,
  gptComposerSizeTiers,
  resolveGptComposerPresetSize,
} from "./sizePresets";

type Engine = "gpt-image-2" | "banana";
type TurnStatus = "running" | "success" | "error";

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
  prompt: string;
  negativePrompt?: string;
  createdAt: string;
  finishedAt?: string;
  status: TurnStatus;
  elapsedSeconds?: number;
  images: GeneratedImage[];
  error?: string;
  meta?: Record<string, unknown>;
};

type TooltipState = {
  text: string;
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
};

type GptForm = {
  api_key: string;
  base_url: string;
  model: string;
  prompt: string;
  negative_prompt: string;
  poster_text: string;
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
  prompt: string;
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
  forms?: {
    "gpt-image-2-form"?: Partial<GptForm>;
    "banana-form"?: Partial<BananaForm>;
  };
  sources?: string[];
};

const sessionStorageKey = "image-generate-web-tool:studio-session";
const sessionsStorageKey = "image-generate-web-tool:studio-sessions";
const activeSessionStorageKey = "image-generate-web-tool:studio-active-session";
const gptStorageKey = "image-generate-web-tool:studio-gpt-form";
const bananaStorageKey = "image-generate-web-tool:studio-banana-form";
const engineStorageKey = "image-generate-web-tool:studio-active-engine";
const maxTurns = 80;

const gptSizeOptions = ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x864", "2048x2048", "2048x1152", "3840x2160", "2160x3840", "custom"];
const gptSizePresetOptions = gptSizeOptions.filter((item) => item !== "custom");
const gptQualityOptions = ["auto", "low", "medium", "high"];
const gptQualityLabels: Record<string, string> = {
  auto: "自动",
  low: "低",
  medium: "中",
  high: "高",
};
const gptEditModeOptions = ["generate", "reference", "outpaint"];
const gptEditModeLabels: Record<string, string> = {
  generate: "生成",
  reference: "参考",
  outpaint: "扩图",
};
const bananaAspectOptions = ["Auto", "1:1", "1:4", "1:8", "4:1", "8:1", "9:16", "16:9", "21:9", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4"];
const bananaImageSizeOptions = ["无", "1K", "2K", "4K"];

type PreviewImage = {
  src: string;
  name: string;
  objectUrl?: boolean;
};

function createEmptySession(title = "新对话"): WorkbenchSession {
  const now = new Date().toISOString();
  return {
    id: makeId("session"),
    title,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

const defaultGptForm: GptForm = {
  api_key: "",
  base_url: "https://gpt-image-api.example.com",
  model: "gpt-image-2",
  prompt: "",
  negative_prompt: "",
  poster_text: "",
  size: "auto",
  custom_size: "1536x864",
  quality: "high",
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
  prompt: "",
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

const inspirationPrompts = [
  {
    title: "收藏版角色海报",
    prompt:
      "一个收藏版叙事海报，中心是强辨识度的象征性轮廓，内部展开完整主题宇宙，纸张颗粒、水彩晕染、电影级光影、高级留白。",
  },
  {
    title: "博物馆中文图鉴",
    prompt:
      "青花瓷博物馆图鉴式中文信息图，中心主体清晰，左侧结构拆解，右侧材质和纹样说明，简体中文标注，米白纸张质感。",
  },
  {
    title: "次世代游戏截图",
    prompt:
      "次世代开放世界赛车游戏实机截图，深圳夜景，高楼天际线，湿润路面反射，速度感，真实车辆材质，电影级构图。",
  },
];

function engineLabel(engine: Engine | string) {
  return engine === "banana" ? "Banana Gemini" : "GPT Image 2";
}

function makeId(prefix: string) {
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
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

function compactGeneratedImage(image: GeneratedImage): GeneratedImage {
  const compact: GeneratedImage = {
    id: image.id,
    name: image.name,
    saved_name: image.saved_name,
    saved_url: image.saved_url,
    saved_path: image.saved_path,
    url: image.url,
    mime_type: image.mime_type,
  };
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined && value !== "")) as GeneratedImage;
}

function compactTurn(turn: ConversationTurn): ConversationTurn {
  return {
    ...turn,
    images: turn.images.map(compactGeneratedImage),
  };
}

function compactSessionsForStorage(sessions: WorkbenchSession[]) {
  return sortSessionsNewestFirst(sessions).slice(0, 80).map((session) => ({
    ...session,
    turns: session.turns.slice(-maxTurns).map(compactTurn),
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
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function sessionTitleFromTurns(turns: ConversationTurn[]) {
  const firstPrompt = turns.find((turn) => turn.prompt.trim())?.prompt.trim();
  if (!firstPrompt) return "新对话";
  return firstPrompt.length > 24 ? `${firstPrompt.slice(0, 24)}...` : firstPrompt;
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

function configIssues(engine: Engine, gpt: GptForm, banana: BananaForm) {
  const issues: string[] = [];
  if (engine === "banana") {
    if (!banana.api_key.trim()) issues.push("API Key");
    if (isPlaceholderValue(banana.api_base_url, defaultBananaForm.api_base_url)) issues.push("API 请求地址");
    if (!banana.model_type.trim()) issues.push("模型名");
  } else {
    if (!gpt.api_key.trim()) issues.push("API Key");
    if (isPlaceholderValue(gpt.base_url, defaultGptForm.base_url)) issues.push("API 请求地址");
    if (!gpt.model.trim()) issues.push("模型名");
  }
  return issues;
}

function normalizeSessions(value: unknown): WorkbenchSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<WorkbenchSession>;
      const turns = Array.isArray(source.turns) ? source.turns.slice(-maxTurns).map(compactTurn) : [];
      const now = new Date().toISOString();
      return {
        id: typeof source.id === "string" && source.id ? source.id : makeId("session"),
        title: typeof source.title === "string" && source.title ? source.title : sessionTitleFromTurns(turns),
        createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
        updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
        turns,
      } satisfies WorkbenchSession;
    })
    .filter((item): item is WorkbenchSession => Boolean(item));
}

function loadWorkbenchSessionState() {
  let sessions: WorkbenchSession[] = [];
  try {
    sessions = normalizeSessions(JSON.parse(localStorage.getItem(sessionsStorageKey) || "[]"));
  } catch {
    sessions = [];
  }

  if (sessions.length === 0) {
    try {
      const legacyTurns = JSON.parse(localStorage.getItem(sessionStorageKey) || "[]");
      if (Array.isArray(legacyTurns) && legacyTurns.length > 0) {
        const now = new Date().toISOString();
        sessions = [{
          id: makeId("session"),
          title: sessionTitleFromTurns(legacyTurns),
          createdAt: legacyTurns[0]?.createdAt || now,
          updatedAt: legacyTurns[legacyTurns.length - 1]?.finishedAt || legacyTurns[legacyTurns.length - 1]?.createdAt || now,
          turns: legacyTurns.slice(-maxTurns),
        }];
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

function normalizeGptForm(value: Partial<GptForm> = {}): GptForm {
  const normalizedSize = normalizeCustomImageSize(value.custom_size || defaultGptForm.custom_size).value;
  return {
    ...defaultGptForm,
    ...value,
    custom_size: normalizedSize,
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

function getPrompt(engine: Engine, gpt: GptForm, banana: BananaForm) {
  return engine === "banana" ? banana.prompt : gpt.prompt;
}

function setPrompt(engine: Engine, value: string, setGpt: (value: GptForm) => void, gpt: GptForm, setBanana: (value: BananaForm) => void, banana: BananaForm) {
  if (engine === "banana") {
    setBanana({ ...banana, prompt: value });
  } else {
    setGpt({ ...gpt, prompt: value });
  }
}

function buildConfigPayload(activeEngine: Engine, gpt: GptForm, banana: BananaForm) {
  return {
    version: 1,
    active_engine: activeEngine,
    forms: {
      "gpt-image-2-form": {
        api_key: gpt.api_key.trim(),
        base_url: gpt.base_url.trim(),
        model: gpt.model.trim(),
      },
      "banana-form": {
        api_key: banana.api_key.trim(),
        api_base_url: banana.api_base_url.trim(),
        model_type: banana.model_type.trim(),
      },
    },
  };
}

function createFormData(engine: Engine, gpt: GptForm, banana: BananaForm, references: File[]) {
  const data = new FormData();
  const source = engine === "banana" ? banana : { ...gpt, custom_size: normalizeCustomImageSize(gpt.custom_size).value };
  Object.entries(source).forEach(([key, value]) => {
    data.append(key, String(value));
  });
  references.forEach((file) => data.append("reference_files", file));
  return data;
}

const gptHistoryKeys: Array<keyof GptForm> = [
  "prompt",
  "negative_prompt",
  "poster_text",
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
  "prompt",
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

function App() {
  const initialSessionState = useRef(loadWorkbenchSessionState());
  const [activeEngine, setActiveEngine] = useState<Engine>(() => {
    const saved = localStorage.getItem(engineStorageKey);
    return saved === "banana" ? "banana" : "gpt-image-2";
  });
  const [gptForm, setGptForm] = useState<GptForm>(() => loadJson(gptStorageKey, defaultGptForm));
  const [bananaForm, setBananaForm] = useState<BananaForm>(() => loadJson(bananaStorageKey, defaultBananaForm));
  const [references, setReferences] = useState<File[]>([]);
  const [sessions, setSessions] = useState<WorkbenchSession[]>(() => initialSessionState.current.sessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialSessionState.current.activeSessionId);
  const [sidebarMode, setSidebarMode] = useState<"sessions" | "history">("sessions");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [composerPopover, setComposerPopover] = useState<"size" | "quality" | "edit" | "strength" | "count" | null>(null);
  const [historyDetail, setHistoryDetail] = useState<HistoryEntry | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [draggedReferenceIndex, setDraggedReferenceIndex] = useState<number | null>(null);
  const [referenceDropIndex, setReferenceDropIndex] = useState<number | null>(null);
  const [sizeAdjustmentNotice, setSizeAdjustmentNotice] = useState("");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [customSizeDraft, setCustomSizeDraft] = useState<{ width: string; height: string }>(() => {
    const parsed = parseCustomImageSize(loadJson<GptForm>(gptStorageKey, defaultGptForm).custom_size);
    return { width: String(parsed.width), height: String(parsed.height) };
  });
  const [gptComposerSizeTier, setGptComposerSizeTier] = useState<GptComposerSizeTier>("auto");
  const [gptComposerAspect, setGptComposerAspect] = useState<GptComposerAspect>("1:1");
  const [hasPromptedForConfig, setHasPromptedForConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const composerToolsRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);
  const customSizeDraftRef = useRef(customSizeDraft);
  const gptComposerSizeTierRef = useRef<GptComposerSizeTier>(gptComposerSizeTier);
  const gptComposerAspectRef = useRef<GptComposerAspect>(gptComposerAspect);
  const tooltipTimerRef = useRef<number | null>(null);

  const activePrompt = getPrompt(activeEngine, gptForm, bananaForm);
  const activeModel = activeEngine === "banana" ? bananaForm.model_type : gptForm.model;
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0] || createEmptySession();
  const turns = activeSession.turns;
  const sortedSessions = sortSessionsNewestFirst(sessions);
  const activeConfigIssues = configIssues(activeEngine, gptForm, bananaForm);
  const hasCompleteConfig = activeConfigIssues.length === 0;
  const configStatusText = hasCompleteConfig ? "配置已完成" : `缺少 ${activeConfigIssues.join("、")}`;
  const configButtonLabel = hasCompleteConfig ? activeModel || "模型名" : "检查配置";

  useEffect(() => {
    localStorage.setItem(gptStorageKey, JSON.stringify(gptForm));
  }, [gptForm]);

  useEffect(() => {
    localStorage.setItem(bananaStorageKey, JSON.stringify(bananaForm));
  }, [bananaForm]);

  useEffect(() => {
    localStorage.setItem(engineStorageKey, activeEngine);
  }, [activeEngine]);

  useEffect(() => {
    if (composerPopover === "size") return;
    const parsed = parseCustomImageSize(gptForm.custom_size);
    const nextDraft = { width: String(parsed.width), height: String(parsed.height) };
    customSizeDraftRef.current = nextDraft;
    setCustomSizeDraft(nextDraft);
  }, [composerPopover, gptForm.custom_size]);

  useEffect(() => {
    gptComposerSizeTierRef.current = gptComposerSizeTier;
  }, [gptComposerSizeTier]);

  useEffect(() => {
    gptComposerAspectRef.current = gptComposerAspect;
  }, [gptComposerAspect]);

  useEffect(() => {
    try {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(sessions)));
    } catch {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(compactSessionsForStorage(sessions).map((session) => ({ ...session, turns: session.turns.map((turn) => ({ ...turn, images: [] })) }))));
      setNotice("会话图片引用过多，已只保留文字上下文");
    }
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(activeSessionStorageKey, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAdvancedOpen(false);
      setConnectionOpen(false);
      setRenameOpen(false);
      setHistoryDetail(null);
      closePreviewImage();
      setComposerPopover(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    setNotice(`当前配置不完整：${activeConfigIssues.join("、")}`);
  }, [connectionOpen, hasCompleteConfig, hasPromptedForConfig]);

  async function loadDefaults() {
    try {
      const response = await fetch("/api/config/defaults");
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as ConfigPayload;
      const nextEngine = payload.active_engine === "banana" || payload.active_engine === "gpt-image-2" ? payload.active_engine : activeEngine;
      const nextGpt = normalizeGptForm({ ...gptForm, ...(payload.forms?.["gpt-image-2-form"] || {}) });
      const nextBanana = normalizeBananaForm({ ...bananaForm, ...(payload.forms?.["banana-form"] || {}) });
      setGptForm(nextGpt);
      setBananaForm(nextBanana);
      if (payload.active_engine === "banana" || payload.active_engine === "gpt-image-2") {
        setActiveEngine(payload.active_engine);
      }
      const issues = configIssues(nextEngine, nextGpt, nextBanana);
      if (!hasPromptedForConfig) {
        setHasPromptedForConfig(true);
        if (issues.length > 0) {
          setConnectionOpen(true);
          setNotice(`请先补全接口配置：${issues.join("、")}`);
        } else {
          setNotice(payload.sources?.length ? `已读取 ${payload.sources.join("、")}` : "已读取后端默认配置");
        }
      } else {
        setNotice(payload.sources?.length ? `已读取 ${payload.sources.join("、")}` : "已读取后端默认配置");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取默认配置失败");
      if (!hasPromptedForConfig) {
        setHasPromptedForConfig(true);
        setConnectionOpen(true);
      }
    }
  }

  async function saveConfig() {
    try {
      const response = await fetch("/api/config/local-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfigPayload(activeEngine, gptForm, bananaForm)),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setNotice(`已保存到 ${payload.path || "config.local.json"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存配置失败");
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
      setNotice(error instanceof Error ? error.message : "读取历史失败");
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
      setNotice(error instanceof Error ? error.message : "收藏失败");
    }
  }

  async function deleteHistory(entry: HistoryEntry) {
    if (!confirm("删除这条历史记录？不会清空当前会话。")) return;
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}?limit=160`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setHistory(Array.isArray(payload.entries) ? payload.entries : history.filter((item) => item.id !== entry.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败");
    }
  }

  function updateActiveSession(updater: (session: WorkbenchSession) => WorkbenchSession) {
    setSessions((current) => {
      const exists = current.some((session) => session.id === activeSessionId);
      const base = exists ? current : [activeSession, ...current];
      return sortSessionsNewestFirst(base.map((session) => (session.id === activeSessionId ? updater(session) : session)));
    });
  }

  function createSessionFromPrompt(prompt = "") {
    const session = createEmptySession(prompt ? sessionTitleFromTurns([{ id: "draft", engine: activeEngine, prompt, createdAt: new Date().toISOString(), status: "success", images: [] }]) : `新对话 ${sessions.length + 1}`);
    setSessions((current) => sortSessionsNewestFirst([session, ...current]).slice(0, 80));
    setActiveSessionId(session.id);
    return session;
  }

  function deleteSession(sessionId: string) {
    setSessions((current) => {
      if (current.length <= 1) {
        const replacement = createEmptySession();
        setActiveSessionId(replacement.id);
        return [replacement];
      }
      const next = current.filter((session) => session.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[0].id);
      }
      return sortSessionsNewestFirst(next);
    });
  }

  function applyHistory(entry: HistoryEntry) {
    const formState = entry.form_state || {};
    if (entry.engine === "banana") {
      setActiveEngine("banana");
      setBananaForm((current) => normalizeBananaForm({ ...current, ...pickHistoryState<BananaForm>(formState, bananaHistoryKeys) }));
    } else {
      setActiveEngine("gpt-image-2");
      setGptForm((current) => normalizeGptForm({ ...current, ...pickHistoryState<GptForm>(formState, gptHistoryKeys) }));
    }
    setNotice("已套用历史参数，连接配置保持当前值");
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function appendReferenceFiles(files: File[], sourceLabel = "参考图") {
    const incoming = files.filter((file) => file.type.startsWith("image/"));
    if (incoming.length === 0) {
      setNotice("没有找到可添加的图片文件");
      return;
    }
    const limit = activeEngine === "banana" ? 14 : 16;
    const available = Math.max(0, limit - references.length);
    const added = Math.min(incoming.length, available);
    if (added === 0) {
      setNotice(`参考图已达到 ${limit} 张上限`);
      return;
    }
    setReferences((current) => {
      const next = [...current, ...incoming].slice(0, limit);
      return next;
    });
    setNotice(added < incoming.length ? `${sourceLabel}已加入 ${added} 张，已达到 ${limit} 张上限` : `${sourceLabel}已加入 ${incoming.length} 张`);
  }

  function onReferenceChange(event: ChangeEvent<HTMLInputElement>) {
    appendReferenceFiles(Array.from(event.target.files || []), "参考图");
    event.target.value = "";
  }

  function previewReference(file: File) {
    const src = URL.createObjectURL(file);
    openPreviewImage({ src, name: file.name, objectUrl: true });
  }

  function openPreviewImage(next: PreviewImage) {
    setPreviewImage((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.src);
      return next;
    });
  }

  function closePreviewImage() {
    setPreviewImage((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.src);
      return null;
    });
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
    setNotice(`参考图已移动到第 ${toIndex + 1} 位`);
  }

  function nudgeReference(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    moveReference(index, nextIndex);
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

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      dragDepthRef.current += 1;
      setDragActive(true);
    }
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (hasDraggedReference(event)) return;
    event.preventDefault();
    event.stopPropagation();
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
    appendReferenceFiles(Array.from(event.dataTransfer.files || []), "拖入图片");
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    setAdvancedOpen(false);
    setConnectionOpen(false);
    setRenameOpen(false);
    setHistoryDetail(null);
    closePreviewImage();
    setComposerPopover(null);
  }

  async function addOutputAsReference(src: string, name: string) {
    if (!isSameOriginOutput(src)) {
      setNotice("只有同源 outputs 图片可以作为参考图继续生成");
      return;
    }
    try {
      const response = await fetch(src, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], name.replace(/[\\/:*?"<>|]+/g, "-") || "reference.png", {
        type: blob.type || "image/png",
        lastModified: Date.now(),
      });
      appendReferenceFiles([file], "outputs 图片");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "添加参考图失败");
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!hasCompleteConfig) {
      setConnectionOpen(true);
      setNotice(`请先补全接口配置：${activeConfigIssues.join("、")}`);
      return;
    }
    let submitGptForm = gptForm;
    if (activeEngine === "gpt-image-2") {
      const normalized = normalizeCustomSize(false);
      if (normalized?.notice) setNotice(normalized.notice);
      submitGptForm = { ...gptForm, custom_size: normalized.value };
    }
    const prompt = activePrompt.trim();
    if (!prompt) {
      setNotice("请先填写提示词");
      promptRef.current?.focus();
      return;
    }

    const turnId = makeId("turn");
    const createdAt = new Date().toISOString();
    let targetSessionId = activeSessionId;
    if (!activeSession || !sessions.some((session) => session.id === activeSessionId)) {
      const created = createSessionFromPrompt(prompt);
      targetSessionId = created.id;
    }
    const turn: ConversationTurn = {
      id: turnId,
      engine: activeEngine,
      prompt,
      negativePrompt: gptForm.negative_prompt,
      createdAt,
      status: "running",
      images: [],
      meta: { model: activeModel, reference_count: references.length },
    };
    setSessions((current) =>
      current.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              title: session.turns.length === 0 || session.title === "新对话" ? sessionTitleFromTurns([turn]) : session.title,
              updatedAt: createdAt,
              turns: [...session.turns, turn].slice(-maxTurns),
            }
          : session,
      ),
    );
    setBusy(true);
    setStatus(`${engineLabel(activeEngine)} 生成中`);
    const startedAt = performance.now();

    try {
      const response = await fetch(`/api/generate/${activeEngine}`, {
        method: "POST",
        body: createFormData(activeEngine, submitGptForm, bananaForm, references),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
      const elapsed = Number(payload.meta?.elapsed_seconds) || (performance.now() - startedAt) / 1000;
      const images = Array.isArray(payload.images) ? payload.images : [];
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
                        status: payload.ok ? "success" : "error",
                        finishedAt: new Date().toISOString(),
                        elapsedSeconds: elapsed,
                        images,
                        error: payload.ok ? "" : "接口返回了结果，但没有拿到图片",
                        meta: payload.meta || item.meta,
                      }
                    : item,
                ),
              }
            : session,
        ),
      );
      setStatus(payload.ok ? `返回 ${images.length} 张图片` : "请求完成但没有图片");
      setNotice(payload.ok ? "图片已保存到 outputs" : "请查看返回信息");
      if (payload.history_entry) {
        void loadHistory();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
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
      setStatus("生成失败");
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function openOutputs() {
    try {
      const response = await fetch("/api/open-outputs", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      setNotice("已请求打开 outputs 文件夹");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "打开 outputs 失败");
    }
  }

  function copyPrompt(prompt: string) {
    void navigator.clipboard?.writeText(prompt);
    setNotice("提示词已复制");
  }

  function clearCurrentSession() {
    updateActiveSession((session) => ({
      ...session,
      title: "新对话",
      updatedAt: new Date().toISOString(),
      turns: [],
    }));
    setReferences([]);
    setStatus("就绪");
    setNotice("已清空当前会话");
    setExpandedTurns({});
  }

  function startFreshSession() {
    const session = createEmptySession(`新对话 ${sessions.length + 1}`);
    setSessions((current) => sortSessionsNewestFirst([session, ...current]).slice(0, 80));
    setActiveSessionId(session.id);
    setReferences([]);
    setStatus("就绪");
    setSidebarMode("sessions");
    if (activeEngine === "banana") {
      setBananaForm({ ...bananaForm, prompt: "" });
    } else {
      setGptForm({ ...gptForm, prompt: "" });
    }
    setNotice("已新建对话");
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function openRenameSession() {
    setSessionTitleDraft(activeSession.title || "新对话");
    setRenameOpen(true);
  }

  function renameActiveSession() {
    const title = sessionTitleDraft.trim();
    if (!title) {
      setNotice("会话名不能为空");
      return;
    }
    updateActiveSession((session) => ({
      ...session,
      title,
      updatedAt: new Date().toISOString(),
    }));
    setRenameOpen(false);
    setNotice("已修改会话名");
  }

  function applyPrompt(prompt: string) {
    if (activeEngine === "banana") {
      setBananaForm({ ...bananaForm, prompt });
    } else {
      setGptForm({ ...gptForm, prompt });
    }
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function currentSizeLabel() {
    if (activeEngine === "banana") return `${bananaForm.aspect_ratio} · ${bananaForm.image_size}`;
    return gptForm.size === "custom" ? `${customSizeDraftRef.current.width || "?"}x${customSizeDraftRef.current.height || "?"}` : gptForm.size;
  }

  function currentQualityLabel() {
    return gptQualityLabels[gptForm.quality] || gptForm.quality;
  }

  function currentCountLabel() {
    return activeEngine === "banana" ? `${bananaForm.batch_size} 张` : `${gptForm.n} 张`;
  }

  function currentEditModeLabel() {
    return gptEditModeLabels[gptForm.edit_mode] || gptForm.edit_mode;
  }

  function currentStrengthLabel() {
    return `${Math.round(gptForm.reference_strength * 100)}%`;
  }

  function gptComposerPresetValue(tier = gptComposerSizeTier, aspect = gptComposerAspect) {
    return resolveGptComposerPresetSize(tier, aspect);
  }

  function applyGptComposerSize(tier: GptComposerSizeTier, aspect = gptComposerAspect) {
    gptComposerSizeTierRef.current = tier;
    gptComposerAspectRef.current = aspect;
    setGptComposerSizeTier(tier);
    setGptComposerAspect(aspect);
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
    setSizeAdjustmentNotice(normalized.notice);
  }

  function isTurnExpanded(turn: ConversationTurn) {
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
    gptComposerSizeTierRef.current = "auto";
    setGptComposerSizeTier("auto");
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
    if (normalized.notice) {
      setSizeAdjustmentNotice(normalized.notice);
      setNotice(normalized.notice);
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
    const firstImage = entry.images?.[0];
    const src = imageSrc(firstImage);
    if (src) {
      openPreviewImage({ src, name: imageName(firstImage) });
    }
  }

  function continueFromTurn(turn: ConversationTurn, image?: GeneratedImage, index = 0) {
    const src = imageSrc(image);
    const name = imageName(image, index);
    applyPrompt(turn.prompt);
    if (src) {
      void addOutputAsReference(src, name);
    }
    setNotice(src ? "已把这轮作为继续编辑的上下文" : "已套用这一轮提示词");
  }

  return (
    <main
      className={`studio-shell ${historyCollapsed ? "history-is-collapsed" : ""} ${dragActive ? "is-dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            <strong>松开添加为参考图</strong>
            <span>支持拖入一张或多张图片到网页或输入区</span>
          </div>
        </div>
      )}
      <aside className={`history-sidebar ${historyCollapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-top">
          <button className="icon-button" type="button" onClick={() => setHistoryCollapsed(!historyCollapsed)} aria-label="切换历史栏">
            {historyCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {!historyCollapsed && (
            <div>
              <p>{sidebarMode === "sessions" ? "浏览器本地" : "本地历史文件"}</p>
              <h1>{sidebarMode === "sessions" ? "对话" : "历史素材"}</h1>
            </div>
          )}
        </div>
        {!historyCollapsed && (
          <>
            <button className="new-session-button" type="button" onClick={startFreshSession}>
              <MessageSquarePlus size={16} /> 新建会话
            </button>
            <div className="sidebar-tabs" role="tablist" aria-label="左侧列表">
              <button type="button" className={sidebarMode === "sessions" ? "active" : ""} onClick={() => setSidebarMode("sessions")}>
                会话
              </button>
              <button type="button" className={sidebarMode === "history" ? "active" : ""} onClick={() => setSidebarMode("history")}>
                历史
              </button>
            </div>
            <div className="sidebar-actions">
              {sidebarMode === "history" ? (
                <button type="button" onClick={() => void loadHistory()}>
                  <RefreshCw size={15} /> 刷新
                </button>
              ) : (
                <button type="button" onClick={startFreshSession}>
                  <MessageSquarePlus size={15} /> 新对话
                </button>
              )}
              <button type="button" onClick={() => void openOutputs()}>
                <FolderOpen size={15} /> outputs
              </button>
            </div>
            <div className="history-count">
              {sidebarMode === "sessions" ? `${sessions.length} 个会话` : historyLoading ? "读取中..." : `${history.length} 条历史`}
            </div>
            {sidebarMode === "sessions" ? (
              <div className="session-list">
                {sortedSessions.map((session) => (
                  <article className={session.id === activeSessionId ? "session-card active" : "session-card"} key={session.id}>
                    <button type="button" className="session-open" onClick={() => setActiveSessionId(session.id)}>
                      <span>{session.title || "新对话"}</span>
                      <small>{formatTime(session.updatedAt)} · {session.turns.length} 轮</small>
                    </button>
                    <button type="button" title="删除会话" aria-label="删除会话" onClick={() => deleteSession(session.id)}>
                      <Trash2 size={14} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="history-list">
                {history.length === 0 ? (
                  <div className="empty-history">生成成功后会出现在这里。</div>
                ) : (
                  history.map((entry) => {
                    const firstImage = entry.images?.[0];
                    const src = imageSrc(firstImage);
                    return (
                      <article className="history-card" key={entry.id}>
                        <button className="history-open" type="button" onClick={() => setHistoryDetail(entry)}>
                          <span className="history-thumb" aria-hidden="true">
                            {src ? <img src={src} alt="" loading="lazy" /> : <span>无图</span>}
                          </span>
                          <span className="history-main">
                            <span className="history-row">
                              <span>{engineLabel(entry.engine || "gpt-image-2")}</span>
                              <span>{formatTime(entry.created_at)}</span>
                            </span>
                            <span className="history-prompt">{entry.prompt || "没有提示词"}</span>
                          </span>
                        </button>
                        <div className="history-tools">
                          <button type="button" onClick={() => openHistoryPreview(entry)} title="预览图片" disabled={!src}>
                            <ExternalLink size={14} />
                          </button>
                          <button type="button" onClick={() => applyHistory(entry)} title="套用参数">
                            <RotateCcw size={14} />
                          </button>
                          <button type="button" onClick={() => void toggleFavorite(entry)} title={entry.favorite ? "取消收藏" : "收藏"}>
                            {entry.favorite ? <Star size={14} fill="currentColor" /> : <Heart size={14} />}
                          </button>
                          <button type="button" onClick={() => src && void addOutputAsReference(src, imageName(firstImage))} title="作为参考图" disabled={!src}>
                            <ImagePlus size={14} />
                          </button>
                          <button type="button" onClick={() => void deleteHistory(entry)} title="删除历史">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <div className="workspace-kicker">
              <span>本地会话</span>
              <span>{turns.length} 轮</span>
            </div>
            <div className="title-line">
              <h2>{activeSession.title || "图片工作台"}</h2>
              <button type="button" onClick={openRenameSession} title="修改会话名" aria-label="修改会话名">
                <PencilLine size={15} />
              </button>
            </div>
          </div>
          <div className="workspace-controls">
            <div className="mode-tabs" role="tablist" aria-label="选择引擎">
              <button type="button" className={activeEngine === "gpt-image-2" ? "active" : ""} onClick={() => setActiveEngine("gpt-image-2")}>
                GPT Image 2
              </button>
              <button type="button" className={activeEngine === "banana" ? "active" : ""} onClick={() => setActiveEngine("banana")}>
                Banana Gemini
              </button>
            </div>
            <div className="header-actions">
              <span className={busy ? "status-chip busy" : hasCompleteConfig ? "status-chip ready" : "status-chip warning"} title={busy ? status : configStatusText}>
                {busy ? <Loader2 size={14} className="spin" /> : hasCompleteConfig ? <Check size={14} /> : <AlertCircle size={14} />}
                {busy ? status : configStatusText}
              </span>
              <button
                type="button"
                className={hasCompleteConfig ? "connection-button configured" : "connection-button needs-config"}
                onClick={() => setConnectionOpen(true)}
                title={hasCompleteConfig ? "配置 API 请求地址、Key 和模型" : `配置未完成：${activeConfigIssues.join("、")}`}
              >
                <Settings2 size={16} />
                <span>{configButtonLabel}</span>
              </button>
              <button type="button" onClick={() => void saveConfig()}>保存配置</button>
              <button type="button" onClick={clearCurrentSession} disabled={turns.length === 0 && references.length === 0}>清空</button>
            </div>
          </div>
        </header>

        <section className="conversation-canvas">
          {turns.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={32} />
              <h2>准备创作</h2>
              <p>这是一个新的对话。写下第一条提示词后，后续修改会持续追加在这里。</p>
              <div className="prompt-examples">
                {inspirationPrompts.map((item) => (
                  <button type="button" key={item.title} onClick={() => applyPrompt(item.prompt)}>
                    <strong>{item.title}</strong>
                    <span>{item.prompt.slice(0, 56)}...</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn, turnIndex) => (
              <article className="turn" key={turn.id}>
                <div className="user-bubble">
                  <div className="bubble-meta">{formatTime(turn.createdAt)} · {engineLabel(turn.engine)}</div>
                  <p>{turn.prompt}</p>
                </div>
                <div className={`studio-response ${turn.status}`}>
                  <div className="response-avatar"><Sparkles size={18} /></div>
                  <div className="response-body">
                    <div className="response-head">
                      <strong>{turn.status === "running" ? "正在生成" : turn.status === "success" ? "生成完成" : "生成失败"}</strong>
                      <div className="response-meta">
                        <span>{turn.meta?.model ? String(turn.meta.model) : engineLabel(turn.engine)}</span>
                        {turn.elapsedSeconds ? <span>{turn.elapsedSeconds.toFixed(turn.elapsedSeconds < 10 ? 1 : 0)} 秒</span> : null}
                        <span>#{turnIndex + 1}</span>
                      </div>
                    </div>
                    {turn.status === "running" && (
                      <div className="loading-card">
                        <Loader2 className="spin" size={20} /> 正在等待上游返回图片
                      </div>
                    )}
                    {turn.error && <div className="error-card">{turn.error}</div>}
                    {turn.images.length > 0 && (
                      <div className={isTurnExpanded(turn) ? "turn-images expanded" : "turn-images collapsed"}>
                        <div className={turn.images.length === 1 ? "image-grid single" : "image-grid"}>
                        {turn.images.map((image, index) => {
                          const src = imageSrc(image);
                          const name = imageName(image, index);
                          return (
                            <figure className="image-card" key={`${turn.id}-${index}`}>
                              <button type="button" className="image-preview" onClick={() => openPreviewImage({ src, name })}>
                                <img src={src} alt={name} loading="lazy" />
                              </button>
                              <figcaption>
                                <span>{name}</span>
                                <div>
                                  <button type="button" title="复制提示词" onClick={() => copyPrompt(turn.prompt)}><Copy size={14} /></button>
                                  <button type="button" title="套用提示词" onClick={() => applyPrompt(turn.prompt)}><RotateCcw size={14} /></button>
                                  <button type="button" title="继续编辑" onClick={() => continueFromTurn(turn, image, index)}><MessageSquarePlus size={14} /></button>
                                  <button type="button" title="作为参考图" onClick={() => void addOutputAsReference(src, name)}><ImagePlus size={14} /></button>
                                  <a href={src} download={name} title="下载"><Download size={14} /></a>
                                  <a href={src} target="_blank" rel="noreferrer" title="打开"><ExternalLink size={14} /></a>
                                </div>
                              </figcaption>
                            </figure>
                          );
                        })}
                        </div>
                        <button type="button" className="image-toggle" onClick={() => toggleTurnExpanded(turn.id)}>
                          {isTurnExpanded(turn) ? "收起图片" : `展开 ${turn.images.length} 张图片`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <form
          className={dragActive ? "composer is-drop-target" : "composer"}
          onSubmit={(event) => void submit(event)}
        >
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
                    title="拖拽调整顺序"
                  >
                    <span
                      className="reference-drag-handle"
                      draggable
                      onDragStart={(event) => onReferenceDragStart(event, index)}
                      onDragEnd={onReferenceDragEnd}
                      title="拖动排序"
                    >
                      ⋮⋮
                    </span>
                    <button type="button" className="reference-preview" onClick={() => previewReference(file)} title="预览参考图">
                      <img src={src} alt={file.name} onLoad={() => URL.revokeObjectURL(src)} />
                    </button>
                    <span>{file.name}</span>
                    <div className="reference-order">
                      <button type="button" onClick={() => nudgeReference(index, -1)} disabled={index === 0} title="前移参考图">←</button>
                      <button type="button" onClick={() => nudgeReference(index, 1)} disabled={index === references.length - 1} title="后移参考图">→</button>
                    </div>
                    <button type="button" className="reference-remove" onClick={() => setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="移除参考图">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="composer-toolbar" ref={composerToolsRef}>
            <button type="button" onClick={() => fileInputRef.current?.click()} {...tooltipProps("添加参考图，也可以直接把图片拖到网页或输入框。")}>
              <ImagePlus size={16} /> {references.length > 0 ? `参考图 ${references.length}` : "参考图"}
            </button>
            <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={onReferenceChange} />
            <div className="composer-popover-wrap">
              <button
                type="button"
                className={composerPopover === "size" ? "active" : ""}
                onClick={() => openComposerPopover("size")}
                aria-expanded={composerPopover === "size"}
                {...tooltipProps(`GPT Image 2 自定义尺寸：单边不超过 ${GPT_CUSTOM_SIZE_MAX}px，宽高都是 16 倍数，比例不超过 ${GPT_CUSTOM_SIZE_MAX_RATIO}:1，总像素不超过 2880 x 2880。输入时不打断，离开后自动校正。`)}
              >
                尺寸 {currentSizeLabel()}
              </button>
              {composerPopover === "size" && (
                <div className="composer-popover" role="dialog" aria-label="选择尺寸">
                  {activeEngine === "banana" ? (
                    <>
                      <Field label="比例">
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
                      <Field label="图像分辨率">
                        <select value={bananaForm.image_size} onChange={(event) => setBananaForm({ ...bananaForm, image_size: event.target.value })}>
                          {bananaImageSizeOptions.map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <div className="size-preset-section">
                        <div className="preset-row size-tier-row" role="group" aria-label="选择清晰度">
                          {gptComposerSizeTiers.map((tier) => (
                            <button
                              type="button"
                              key={tier}
                              className={gptComposerSizeTier === tier ? "selected" : ""}
                              onClick={() => applyGptComposerSize(tier)}
                            >
                              {tier === "auto" ? "自动" : tier}
                            </button>
                          ))}
                        </div>
                        <div className="preset-row aspect-row" role="group" aria-label="选择比例">
                          {gptComposerAspectOptions.map((aspect) => (
                            <button
                              type="button"
                              key={aspect}
                              className={gptComposerSizeTier !== "auto" && gptComposerAspect === aspect ? "selected" : ""}
                              onClick={() => applyGptComposerSize(gptComposerSizeTierRef.current === "auto" ? "1K" : gptComposerSizeTierRef.current, aspect)}
                            >
                              {aspect}
                            </button>
                          ))}
                        </div>
                        <div className="preset-summary">
                          {gptComposerSizeTier === "auto" ? "自动尺寸由上游决定" : `${gptComposerSizeTier} · ${gptComposerAspect} · ${gptComposerPresetValue()}`}
                        </div>
                      </div>
                      <div className="custom-size-row">
                        <label>
                          <span>宽</span>
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
                          <span>高</span>
                          <input
                            inputMode="numeric"
                            min={GPT_CUSTOM_SIZE_MIN}
                            max={GPT_CUSTOM_SIZE_MAX}
                            value={customSizeDraft.height}
                            onChange={(event) => setCustomSizeDimension("height", event.target.value)}
                            onBlur={handleCustomSizeBlur}
                          />
                        </label>
                        <button type="button" className={gptForm.size === "custom" ? "selected" : ""} onClick={() => normalizeCustomSize()}>
                          应用
                        </button>
                      </div>
                      <div className={sizeAdjustmentNotice ? "size-adjustment-note active" : "size-adjustment-note"} role="status">
                        {sizeAdjustmentNotice || `自定义尺寸单边 ${GPT_CUSTOM_SIZE_MIN}-${GPT_CUSTOM_SIZE_MAX}px，比例不超过 ${GPT_CUSTOM_SIZE_MAX_RATIO}:1，总像素 ${GPT_CUSTOM_SIZE_MIN_PIXELS.toLocaleString("zh-CN")}-${GPT_CUSTOM_SIZE_MAX_PIXELS.toLocaleString("zh-CN")}。离开输入后会自动校正。`}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {activeEngine !== "banana" && (
              <div className="composer-popover-wrap">
                <button
                  type="button"
                  className={composerPopover === "quality" ? "active" : ""}
                  onClick={() => openComposerPopover("quality")}
                  aria-expanded={composerPopover === "quality"}
                  {...tooltipProps("控制生成质量和推理成本。高质量更慢，自动由上游模型决定。")}
                >
                  质量 {currentQualityLabel()}
                </button>
                {composerPopover === "quality" && (
                  <div className="composer-popover compact" role="dialog" aria-label="选择质量">
                    <div className="choice-grid quality">
                      {gptQualityOptions.map((item) => (
                        <button
                          type="button"
                          key={item}
                          className={gptForm.quality === item ? "selected" : ""}
                          onClick={() => setGptForm({ ...gptForm, quality: item })}
                        >
                          {gptQualityLabels[item] || item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeEngine !== "banana" && (
              <>
                <div className="composer-popover-wrap">
                  <button
                    type="button"
                    className={composerPopover === "edit" ? "active" : ""}
                    onClick={() => openComposerPopover("edit")}
                    aria-expanded={composerPopover === "edit"}
                    {...tooltipProps("生成用于纯文本出图；参考会更重视参考图；扩图用于向外补全画面。")}
                  >
                    编辑 {currentEditModeLabel()}
                  </button>
                  {composerPopover === "edit" && (
                    <div className="composer-popover compact" role="dialog" aria-label="选择编辑模式">
                      <div className="choice-grid quality">
                        {gptEditModeOptions.map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={gptForm.edit_mode === item ? "selected" : ""}
                            onClick={() => setGptForm({ ...gptForm, edit_mode: item })}
                          >
                            {gptEditModeLabels[item] || item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="composer-popover-wrap">
                  <button
                    type="button"
                    className={composerPopover === "strength" ? "active" : ""}
                    onClick={() => openComposerPopover("strength")}
                    aria-expanded={composerPopover === "strength"}
                    {...tooltipProps("有参考图时控制模型跟随参考图的力度。越高越贴近参考图，越低越听提示词。")}
                  >
                    参考强度 {currentStrengthLabel()}
                  </button>
                  {composerPopover === "strength" && (
                    <div className="composer-popover compact" role="dialog" aria-label="设置参考强度">
                      <Field label="参考强度">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={gptForm.reference_strength}
                          onChange={(event) => setGptForm({ ...gptForm, reference_strength: Number(event.target.value) })}
                        />
                      </Field>
                      <div className="inline-number-row">
                        <span>{currentStrengthLabel()}</span>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={gptForm.reference_strength}
                          onChange={(event) => setGptForm({ ...gptForm, reference_strength: Math.min(1, Math.max(0, Number(event.target.value))) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="composer-popover-wrap">
              <button
                type="button"
                className={composerPopover === "count" ? "active" : ""}
                onClick={() => openComposerPopover("count")}
                aria-expanded={composerPopover === "count"}
                {...tooltipProps("一次请求生成的图片数量。数量越多等待越久，失败重试成本也更高。")}
              >
                {currentCountLabel()}
              </button>
              {composerPopover === "count" && (
                <div className="composer-popover compact" role="dialog" aria-label="选择数量">
                  <Field label="生成数量">
                    {activeEngine === "banana" ? (
                      <input type="number" min={1} max={8} value={bananaForm.batch_size} onChange={(event) => setBananaForm({ ...bananaForm, batch_size: Number(event.target.value) })} />
                    ) : (
                      <input type="number" min={1} max={10} value={gptForm.n} onChange={(event) => setGptForm({ ...gptForm, n: Number(event.target.value) })} />
                    )}
                  </Field>
                  <div className="choice-grid counts">
                    {(activeEngine === "banana" ? [1, 2, 3, 4, 6, 8] : [1, 2, 3, 4, 6, 8, 10]).map((item) => {
                      const selected = activeEngine === "banana" ? bananaForm.batch_size === item : gptForm.n === item;
                      return (
                        <button
                          type="button"
                          key={item}
                          className={selected ? "selected" : ""}
                          onClick={() => {
                            if (activeEngine === "banana") {
                              setBananaForm({ ...bananaForm, batch_size: item });
                            } else {
                              setGptForm({ ...gptForm, n: item });
                            }
                          }}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => { hideTooltip(); setAdvancedOpen(true); }} {...tooltipProps("打开较少使用的生成控制，例如负面提示词、种子、风格、返回格式和超时。")}>
              高级参数
            </button>
          </div>
          <div className="composer-input">
            <textarea
              ref={promptRef}
              rows={3}
              value={activePrompt}
              placeholder="描述主体、构图、风格、光线、材质和你想保留的细节"
              onChange={(event) => setPrompt(activeEngine, event.target.value, setGptForm, gptForm, setBananaForm, bananaForm)}
            />
            <button className="submit-button" disabled={busy} type="submit" title="开始生成" aria-label="开始生成">
              {busy ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
            </button>
          </div>
        </form>
      </section>

      {renameOpen && (
        <div className="drawer-shell rename-shell">
          <button className="drawer-backdrop" type="button" aria-label="关闭会话重命名" onClick={() => setRenameOpen(false)} />
          <section className="drawer rename-drawer" role="dialog" aria-modal="true" aria-label="修改会话名" tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>浏览器本地会话</p>
                <h2>修改会话名</h2>
              </div>
              <button type="button" onClick={() => setRenameOpen(false)} aria-label="关闭会话重命名" title="关闭"><X size={18} /></button>
            </div>
            <form
              className="rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                renameActiveSession();
              }}
            >
              <Field label="会话名">
                <input autoFocus value={sessionTitleDraft} onChange={(event) => setSessionTitleDraft(event.target.value)} />
              </Field>
              <div className="drawer-actions">
                <button type="submit">保存</button>
                <button type="button" onClick={() => setRenameOpen(false)}>取消</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {connectionOpen && (
        <div className="drawer-shell connection-shell">
          <button className="drawer-backdrop" type="button" aria-label="关闭接口配置" onClick={() => setConnectionOpen(false)} />
          <section className="drawer connection-drawer" role="dialog" aria-modal="true" aria-label="接口配置" tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>API 请求地址 + Key + 模型</p>
                <h2>接口配置</h2>
              </div>
              <button type="button" onClick={() => setConnectionOpen(false)} aria-label="关闭接口配置" title="关闭"><X size={18} /></button>
            </div>
            <div className="connection-fields">
              {!hasCompleteConfig && (
                <div className="config-warning" role="alert">
                  <AlertCircle size={16} />
                  <span>当前缺少 {activeConfigIssues.join("、")}，保存前请补全。</span>
                </div>
              )}
              {activeEngine === "gpt-image-2" ? (
                <>
                  <Field label="API Key"><input type="password" placeholder="sk-..." value={gptForm.api_key} onChange={(event) => setGptForm({ ...gptForm, api_key: event.target.value })} /></Field>
                  <Field label="API 请求地址"><input placeholder="https://.../v1" value={gptForm.base_url} onChange={(event) => setGptForm({ ...gptForm, base_url: event.target.value })} /></Field>
                  <Field label="模型名"><input placeholder="gpt-image-2" value={gptForm.model} onChange={(event) => setGptForm({ ...gptForm, model: event.target.value })} /></Field>
                </>
              ) : (
                <>
                  <Field label="API Key"><input type="password" placeholder="sk-..." value={bananaForm.api_key} onChange={(event) => setBananaForm({ ...bananaForm, api_key: event.target.value })} /></Field>
                  <Field label="API 请求地址"><input placeholder="https://.../v1" value={bananaForm.api_base_url} onChange={(event) => setBananaForm({ ...bananaForm, api_base_url: event.target.value })} /></Field>
                  <Field label="模型名"><input placeholder="gemini-3-pro-image-preview" value={bananaForm.model_type} onChange={(event) => setBananaForm({ ...bananaForm, model_type: event.target.value })} /></Field>
                </>
              )}
            </div>
            <div className="drawer-actions">
              <button type="button" onClick={() => void loadDefaults()}>读取默认值</button>
              <button type="button" onClick={() => void saveConfig()}>保存配置</button>
              <button type="button" onClick={() => setConnectionOpen(false)}>关闭</button>
            </div>
          </section>
        </div>
      )}

      {advancedOpen && (
        <div className="drawer-shell">
          <button className="drawer-backdrop" type="button" aria-label="关闭参数面板" onClick={() => setAdvancedOpen(false)} />
          <section className="drawer" role="dialog" aria-modal="true" aria-label="高级参数" tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="drawer-head">
              <div>
                <p>生成控制</p>
                <h2>高级参数</h2>
              </div>
              <button type="button" onClick={() => setAdvancedOpen(false)} aria-label="关闭参数面板" title="关闭"><X size={18} /></button>
            </div>
            <div className="drawer-actions">
              <button type="button" onClick={() => void loadDefaults()}>读取默认值</button>
              <button type="button" onClick={() => void saveConfig()}>保存到 config.local.json</button>
            </div>
            {activeEngine === "gpt-image-2" ? (
              <GptSettings form={gptForm} onChange={setGptForm} />
            ) : (
              <BananaSettings form={bananaForm} onChange={setBananaForm} />
            )}
          </section>
        </div>
      )}

      {historyDetail && (
        <div className="history-detail-shell">
          <button className="history-detail-backdrop" type="button" aria-label="关闭历史详情" onClick={() => setHistoryDetail(null)} />
          <section className="history-detail" role="dialog" aria-modal="true" aria-label="历史上下文" tabIndex={-1} onKeyDown={closeOnEscape}>
            <div className="history-detail-head">
              <div>
                <p>{formatTime(historyDetail.created_at)} · {engineLabel(historyDetail.engine || "gpt-image-2")}</p>
                <h2>历史上下文</h2>
              </div>
              <button type="button" onClick={() => setHistoryDetail(null)} aria-label="关闭历史详情" title="关闭"><X size={18} /></button>
            </div>
            <div className="history-detail-body">
              <section className="detail-section">
                <h3>提示词</h3>
                <p className="detail-prompt">{historyDetail.prompt || "没有提示词"}</p>
                {historyDetail.negative_prompt && (
                  <>
                    <h3>负面提示词</h3>
                    <p className="detail-prompt muted">{historyDetail.negative_prompt}</p>
                  </>
                )}
              </section>
              {historyDetail.images?.length ? (
                <section className="detail-section">
                  <h3>结果图</h3>
                  <div className="detail-images">
                    {historyDetail.images.map((image, index) => {
                      const src = imageSrc(image);
                      const name = imageName(image, index);
                      return (
                        <button type="button" key={`${historyDetail.id}-${index}`} onClick={() => openPreviewImage({ src, name })}>
                          <img src={src} alt={name} loading="lazy" />
                          <span>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              <section className="detail-section">
                <h3>生成参数</h3>
                <KeyValueGrid value={historyDetail.form_state || {}} />
              </section>
              {historyDetail.meta && Object.keys(historyDetail.meta).length > 0 && (
                <section className="detail-section">
                  <h3>返回信息</h3>
                  <KeyValueGrid value={historyDetail.meta} />
                </section>
              )}
            </div>
            <div className="history-detail-actions">
              <button type="button" onClick={() => applyHistory(historyDetail)}>
                <RotateCcw size={15} /> 套用参数
              </button>
              <button type="button" onClick={() => copyPrompt(historyDetail.prompt || "")} disabled={!historyDetail.prompt}>
                <Copy size={15} /> 复制提示词
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstImage = historyDetail.images?.[0];
                  const src = imageSrc(firstImage);
                  if (src) void addOutputAsReference(src, imageName(firstImage));
                }}
                disabled={!imageSrc(historyDetail.images?.[0])}
              >
                <ImagePlus size={15} /> 作为参考图
              </button>
            </div>
          </section>
        </div>
      )}

      {previewImage && (
        <div className="lightbox">
          <button className="lightbox-backdrop" type="button" onClick={closePreviewImage} aria-label="关闭预览" />
          <div className="lightbox-card" role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={closeOnEscape}>
            <div>
              <strong>{previewImage.name}</strong>
              <span>
                <button type="button" onClick={() => void addOutputAsReference(previewImage.src, previewImage.name)} title="作为参考图"><ImagePlus size={18} /></button>
                <button type="button" onClick={closePreviewImage} aria-label="关闭预览" title="关闭预览"><X size={18} /></button>
              </span>
            </div>
            <img src={previewImage.src} alt={previewImage.name} />
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
  const [tooltip, setTooltip] = useState(false);
  return (
    <label className="field" data-tooltip={help} onPointerEnter={() => help && setTooltip(true)} onPointerLeave={() => setTooltip(false)} onFocus={() => help && setTooltip(true)} onBlur={() => setTooltip(false)}>
      <span>{label}</span>
      {children}
      {help && tooltip && <span className="inline-tooltip" role="tooltip">{help}</span>}
    </label>
  );
}

function Toggle({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const [tooltip, setTooltip] = useState(false);
  return (
    <label className="toggle" data-tooltip={help} onPointerEnter={() => help && setTooltip(true)} onPointerLeave={() => setTooltip(false)} onFocus={() => help && setTooltip(true)} onBlur={() => setTooltip(false)}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
      {help && tooltip && <span className="inline-tooltip" role="tooltip">{help}</span>}
    </label>
  );
}

function KeyValueGrid({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "");
  if (entries.length === 0) {
    return <div className="detail-empty">没有记录额外参数。</div>;
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

function GptSettings({ form, onChange }: { form: GptForm; onChange: (value: GptForm) => void }) {
  const update = <K extends keyof GptForm>(key: K, value: GptForm[K]) => {
    const next = { ...form, [key]: value };
    onChange(key === "custom_size" ? next : normalizeGptForm(next));
  };
  return (
    <div className="settings-grid">
      <Field label="负面提示词" help="用于描述不希望出现在画面里的元素或风格，留空则不附加负面约束。"><textarea rows={2} value={form.negative_prompt} onChange={(event) => update("negative_prompt", event.target.value)} /></Field>
      <Field label="画面文字" help="给模型的文字排版提示，适合海报、标题、中文标注等需要保留文字的场景。"><input value={form.poster_text} onChange={(event) => update("poster_text", event.target.value)} /></Field>
      <Field label="尺寸" help={`选择预设尺寸；自定义尺寸会按官方规则校正：单边不超过 ${GPT_CUSTOM_SIZE_MAX}px，比例不超过 ${GPT_CUSTOM_SIZE_MAX_RATIO}:1，总像素不超过 2880 x 2880。`}>
        <select value={form.size} onChange={(event) => update("size", event.target.value)}>
          {gptSizeOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="自定义尺寸" help="格式为 宽x高，例如 1536x864。提交前会自动修正到 16 倍数和官方尺寸范围。"><input value={form.custom_size} onChange={(event) => update("custom_size", event.target.value)} /></Field>
      <Field label="质量" help="控制生成质量和耗时；高质量更慢，自动则交给上游模型决定。">
        <select value={form.quality} onChange={(event) => update("quality", event.target.value)}>
          {gptQualityOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="数量" help="一次请求生成的图片数量。数量越多等待越久，也更容易触发上游限制。"><input type="number" min={1} max={10} value={form.n} onChange={(event) => update("n", Number(event.target.value))} /></Field>
      <Field label="随机种子" help="-1 表示随机；固定种子可帮助复现相近构图，但不保证完全一致。"><input type="number" value={form.seed} onChange={(event) => update("seed", Number(event.target.value))} /></Field>
      <Field label="风格预设" help="给提示词之外再补一层风格倾向；none 表示不额外指定。">
        <select value={form.style_preset} onChange={(event) => update("style_preset", event.target.value)}>
          {["none", "photographic", "digital-art", "anime", "3d-render", "oil-painting", "watercolor", "sketch"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="接口类型" help="auto 会由后端按参考图和配置选择接口；仅在你明确知道上游兼容接口时手动指定。">
        <select value={form.api_endpoint} onChange={(event) => update("api_endpoint", event.target.value)}>
          {["auto", "/v1/images/generations", "/v1/images/edits", "/v1/responses"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="返回格式" help="auto 保持默认；url 适合上游返回链接，b64_json 适合直接返回图片数据。">
        <select value={form.response_format} onChange={(event) => update("response_format", event.target.value)}>
          {["auto", "url", "b64_json"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="超时" help="单次请求最长等待秒数。网络慢或大图生成可适当调高。"><input type="number" min={1} max={3600} value={form.timeout} onChange={(event) => update("timeout", Number(event.target.value))} /></Field>
      <Toggle label="增强提示词" help="开启后后端会附加更完整的生成提示辅助，适合普通创作；精确提示词可关闭。" checked={form.enhance_prompt} onChange={(value) => update("enhance_prompt", value)} />
      <Toggle label="安全检查" help="保留本地安全检查开关，避免发送明显不合规内容。" checked={form.safety_check} onChange={(value) => update("safety_check", value)} />
      <Toggle label="无限等待" help="开启后不按普通超时中断，适合很慢的上游；失败时可能需要手动刷新。" checked={form.infinite_timeout} onChange={(value) => update("infinite_timeout", value)} />
    </div>
  );
}

function BananaSettings({ form, onChange }: { form: BananaForm; onChange: (value: BananaForm) => void }) {
  const update = <K extends keyof BananaForm>(key: K, value: BananaForm[K]) => onChange({ ...form, [key]: value });
  return (
    <div className="settings-grid">
      <Field label="批量数量" help="Banana 单次请求生成数量。数量越大等待越久，也更容易触发上游限制。"><input type="number" min={1} max={8} value={form.batch_size} onChange={(event) => update("batch_size", Number(event.target.value))} /></Field>
      <Field label="比例" help="选择输出画面比例。Auto 由上游按提示词判断。">
        <select value={form.aspect_ratio} onChange={(event) => update("aspect_ratio", event.target.value)}>
          {bananaAspectOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="图像分辨率" help="选择 Banana 输出分辨率档位；无表示不额外指定。">
        <select value={form.image_size} onChange={(event) => update("image_size", event.target.value)}>
          {bananaImageSizeOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="随机种子" help="-1 表示随机；固定种子可帮助生成相近结果。"><input type="number" value={form.seed} onChange={(event) => update("seed", Number(event.target.value))} /></Field>
      <Field label="Top-P" help="控制采样范围，数值越低越保守。通常保持默认即可。"><input type="number" min={0} max={1} step={0.01} value={form.top_p} onChange={(event) => update("top_p", Number(event.target.value))} /></Field>
      <Field label="超时" help="Banana 请求最长等待秒数。模型慢时可适当调高。"><input type="number" min={60} max={1800} value={form.timeout_seconds} onChange={(event) => update("timeout_seconds", Number(event.target.value))} /></Field>
      <Toggle label="无限等待" help="开启后不按普通超时中断，适合很慢的上游响应。" checked={form.infinite_timeout} onChange={(value) => update("infinite_timeout", value)} />
      <Toggle label="绕过代理" help="让请求跳过本地代理配置，仅在网络环境需要时打开。" checked={form.bypass_proxy} onChange={(value) => update("bypass_proxy", value)} />
      <Toggle label="禁用 SSL 校验" help="仅用于兼容自签名或异常证书环境；正常公网接口建议关闭。" checked={form.disable_ssl} onChange={(value) => update("disable_ssl", value)} />
    </div>
  );
}

export default App;
