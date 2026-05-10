const storagePrefix = "image-generate-web-tool:";
const engineStorageKey = `${storagePrefix}active-engine`;
const configProfilesStorageKey = `${storagePrefix}config-profiles`;

const forms = Array.from(document.querySelectorAll(".engine-form"));
const engineButtons = Array.from(document.querySelectorAll("[data-engine-tab]"));
const resetButtons = Array.from(document.querySelectorAll("[data-reset-form]"));
const configSections = Array.from(document.querySelectorAll("[data-config-section]"));
const configToggleRows = Array.from(document.querySelectorAll("[data-config-toggle]"));
const fileInputs = Array.from(document.querySelectorAll('input[type="file"][data-limit]'));
const clearReferenceButtons = Array.from(document.querySelectorAll("[data-clear-reference]"));
const toggleSecretButtons = Array.from(document.querySelectorAll("[data-toggle-secret]"));

const statusBanner = document.getElementById("status-banner");
const resultTitle = document.getElementById("result-title");
const resultMeta = document.getElementById("result-meta");
const resultDetailsModal = document.getElementById("result-details-modal");
const resultDetailsSummary = document.getElementById("result-details-summary");
const resultGallery = document.getElementById("result-gallery");
const messageList = document.getElementById("message-list");
const metaJson = document.getElementById("meta-json");
const clearResultsButton = document.getElementById("clear-results");
const openResultDetailsButton = document.getElementById("open-result-details");
const copyMetaButton = document.getElementById("copy-meta");
const queuePanel = document.getElementById("queue-panel");
const queueSummary = document.getElementById("queue-summary");
const queueList = document.getElementById("queue-list");
const clearQueueButton = document.getElementById("clear-queue");
const queueToggleChip = document.getElementById("queue-toggle-chip");
const assetShelf = document.getElementById("asset-shelf");
const assetSummary = document.getElementById("asset-summary");
const assetStrip = document.getElementById("asset-strip");
const clearAssetsButton = document.getElementById("clear-assets");
const openOutputsFolderButton = document.getElementById("open-outputs-folder");

const openHistoryModalButton = document.getElementById("open-history-modal");
const historyModal = document.getElementById("history-modal");
const closeHistoryButtons = Array.from(document.querySelectorAll("[data-close-history]"));
const refreshHistoryButton = document.getElementById("refresh-history");
const historyList = document.getElementById("history-list");
const historyDetail = document.getElementById("history-detail");
const historyCount = document.getElementById("history-count");
const historySummary = document.getElementById("history-modal-summary");
const historySearchInput = document.getElementById("history-search");
const historyEngineFilter = document.getElementById("history-engine-filter");

const openConfigModalButton = document.getElementById("open-config-modal");
const loadConfigDefaultsButton = document.getElementById("load-config-defaults");
const saveConfigQuickButton = document.getElementById("save-config-quick");
const configModal = document.getElementById("config-modal");
const closeConfigButtons = Array.from(document.querySelectorAll("[data-close-config]"));
const exportConfigButton = document.getElementById("export-config");
const clearLocalConfigButton = document.getElementById("clear-local-config");
const triggerImportConfigButton = document.getElementById("trigger-import-config");
const importConfigInput = document.getElementById("import-config-input");
const loadDefaultsModalButton = document.getElementById("load-defaults-modal");
const saveConfigFileButton = document.getElementById("save-config-file");
const configFeedback = document.getElementById("config-feedback");
const configProfileNameInput = document.getElementById("config-profile-name");
const saveConfigProfileButton = document.getElementById("save-config-profile");
const saveConfigFileButtonInline = document.getElementById("save-config-file");
const configProfileList = document.getElementById("config-profile-list");
const configProfilePreview = document.getElementById("config-profile-preview");
const configEngineButtons = Array.from(document.querySelectorAll("[data-config-engine]"));
const configGptModel = document.getElementById("config-gpt-model");
const configGptBase = document.getElementById("config-gpt-base");
const configBananaModel = document.getElementById("config-banana-model");
const configBananaBase = document.getElementById("config-banana-base");

const progressPanel = document.getElementById("generation-progress");
const progressLabel = document.getElementById("progress-label");
const progressElapsed = document.getElementById("progress-elapsed");
const progressFill = document.getElementById("progress-fill");
const progressTrack = document.querySelector(".progress-track");
const progressNote = document.getElementById("progress-note");

const imageLightbox = document.getElementById("image-lightbox");
const imageLightboxImage = document.getElementById("image-lightbox-img");
const imageLightboxTitle = document.getElementById("image-lightbox-title");
const imageLightboxCaption = document.getElementById("image-lightbox-caption");
const imageLightboxStage = document.getElementById("image-lightbox-stage");
const imageLightboxZoomValue = document.getElementById("image-lightbox-zoom-value");
const lightboxZoomButtons = Array.from(document.querySelectorAll("[data-lightbox-zoom]"));
const closeLightboxButtons = Array.from(document.querySelectorAll("[data-close-lightbox]"));
const closeDetailsModalButtons = Array.from(document.querySelectorAll("[data-close-details-modal]"));
const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const confirmModalPreview = document.getElementById("confirm-modal-preview");
const confirmModalConfirmButton = document.getElementById("confirm-modal-confirm");
const cancelConfirmButtons = Array.from(document.querySelectorAll("[data-confirm-cancel]"));
const sizeModal = document.getElementById("size-modal");
const openSizeModalButtons = Array.from(document.querySelectorAll("[data-open-size-modal]"));
const closeSizeModalButtons = Array.from(document.querySelectorAll("[data-close-size-modal]"));
const sizeModeButtons = Array.from(document.querySelectorAll("[data-size-mode]"));
const sizeModePanels = Array.from(document.querySelectorAll("[data-size-panel]"));
const sizeModalCurrent = document.getElementById("size-modal-current");
const sizeResolutionButtons = Array.from(document.querySelectorAll("[data-size-resolution]"));
const sizeRatioButtons = Array.from(document.querySelectorAll("[data-size-ratio]"));
const sizeModalWidth = document.getElementById("size-modal-width");
const sizeModalHeight = document.getElementById("size-modal-height");
const sizeModalHint = document.getElementById("size-modal-hint");
const sizeModalResult = document.getElementById("size-modal-result");
const sizeModalResultNote = document.getElementById("size-modal-result-note");
const sizeModalApplyButton = document.getElementById("size-modal-apply");
const apiModal = document.getElementById("api-modal");
const openApiModalButtons = Array.from(document.querySelectorAll("[data-open-api-modal]"));
const closeApiModalButtons = Array.from(document.querySelectorAll("[data-close-api-modal]"));
const apiModalCurrent = document.getElementById("api-modal-current");
const apiModalEndpoint = document.getElementById("api-modal-endpoint");
const apiModalFormat = document.getElementById("api-modal-format");
const apiModalResult = document.getElementById("api-modal-result");
const apiModalApplyButton = document.getElementById("api-modal-apply");

let activeEngine = "gpt-image-2";
let lastMetaPayload = null;
let activeObjectUrls = [];
let progressTimer = null;
let progressStartedAt = 0;
let lastFocusedBeforeLightbox = null;
let lightboxZoom = 1;
let lightboxPanX = 0;
let lightboxPanY = 0;
let lightboxDragState = null;
let lastFocusedBeforeDetailsModal = null;
let lastFocusedBeforeConfigModal = null;
let lastFocusedBeforeHistoryModal = null;
let lastFocusedBeforeConfirmModal = null;
let lastFocusedBeforeSizeModal = null;
let activeSizeForm = null;
let activeSizeMode = "auto";
let activeSizeResolution = "1024";
let activeSizeRatio = "1:1";
let lastFocusedBeforeApiModal = null;
let activeApiForm = null;
let confirmModalResolver = null;
let generationQueue = [];
let activeQueueJob = null;
let queueJobId = 0;
let queueCollapsed = true;
let assetHistory = [];
let historyEntries = [];
let selectedHistoryId = "";
let filteredHistoryEntries = [];
let openHistoryDeleteMenuId = "";
const gatewayFailureCounts = new Map();
const referenceFileStore = new WeakMap();
const referencePreviewUrls = new WeakMap();
let activeConfigEngine = "gpt-image-2";
const maxAssetHistory = 60;
const maxVisibleQueueJobs = 8;
const minLightboxZoom = 1;
const maxLightboxZoom = 8;
const lightboxZoomStep = 1.25;
const customSizeStep = 16;
const customSizeMaxEdge = 3840;
const customSizeMinPixels = 655360;
const customSizeMaxPixels = 8294400;
const customSizeMaxRatio = 3;
const connectionFieldNames = new Set(["api_key", "api_base_url", "base_url", "model", "model_type"]);
const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const fieldHints = {
  prompt: "描述画面内容、构图、风格和细节，是生图最核心的输入。",
  negative_prompt: "告诉模型尽量避免什么，比如低质量、模糊、畸形手指。",
  poster_text: "逐字填写必须出现在图里的文字。只写“需要一些文字”时，模型常会选择不写字。",
  batch_size: "Banana 一次连续请求的批次数，数值越大等待越久。",
  n: "GPT Image 2 一次返回的图片数量，越多越容易超时。",
  seed: "-1 表示随机；固定数字可以尽量复现相似结果。",
  aspect_ratio: "Banana 的画面比例；Auto 会跟随参考图或交给模型判断。",
  image_size: "Banana 的输出分辨率档位，越高越慢。",
  size: "GPT Image 2 的输出尺寸；选择 custom 时才会使用右侧自定义尺寸。",
  custom_size: "仅尺寸选择 custom 时生效；分别输入宽和高，工具会自动合成接口需要的尺寸。",
  quality: "生成质量档位；auto 表示不向上游发送该参数，兼容性更好。",
  style_preset: "预设风格，会给模型一个额外的整体视觉方向。",
  response_format: "接口返回图片的方式；auto 表示交给上游决定。",
  api_endpoint: "接口类型；auto 会在无参考图时走 generations，有参考图时走 edits。",
  edit_mode: "生成或编辑参考图的模式。",
  reference_strength: "参考图影响强度，数值越高越贴近参考图。",
  timeout: "等待上游接口返回的最长秒数。",
  timeout_seconds: "关闭无限超时后，Banana 每批请求最多等待的秒数。",
  top_p: "控制采样多样性，越高越发散，越低越稳定。",
};

const optionHints = {
  aspect_ratio: {
    Auto: "自动比例：有参考图时优先跟随参考图，否则交给模型判断。",
    "1:1": "正方形，适合头像、图标、封面主体。",
    "1:4": "极窄竖图，适合长条海报或卷轴。",
    "1:8": "超长竖图，适合特殊长幅构图。",
    "4:1": "极宽横图，适合横幅、壁纸局部和长图。",
    "8:1": "超宽横图，适合超长横幅。",
    "9:16": "手机竖屏比例。",
    "16:9": "常见横屏比例，适合视频封面和桌面壁纸。",
    "21:9": "电影感超宽画幅。",
    "2:3": "竖向海报比例。",
    "3:2": "相机照片常见横向比例。",
    "3:4": "竖向图片，适合人物和商品。",
    "4:3": "经典横向图片比例。",
    "4:5": "社媒竖图比例。",
    "5:4": "轻微横向比例。",
  },
  image_size: {
    "无": "不向 Banana 追加分辨率要求。",
    "1K": "较快、较省，适合草稿。",
    "2K": "平衡质量和速度，默认推荐。",
    "4K": "更高分辨率，但更慢、更容易超时。",
  },
  size: {
    auto: "自动尺寸：由上游接口决定最终尺寸。",
    "1024x1024": "方图，小尺寸，速度相对更稳。",
    "1536x1024": "横图，适合封面、产品和场景。",
    "1024x1536": "竖图，适合人物、海报和手机图。",
    "1536x864": "16:9 横屏，适合视频封面和宽屏预览。",
    "2048x2048": "大方图，质量更高但更慢。",
    "2048x1152": "2K 横屏，适合壁纸和大封面。",
    "3840x2160": "4K 横屏，容易变慢或超时。",
    "2160x3840": "4K 竖屏，容易变慢或超时。",
    custom: "使用右侧自定义尺寸，宽高必须符合接口限制。",
  },
  quality: {
    auto: "不发送 quality 字段，适合不完全兼容的代理接口。",
    low: "低质量：更快，适合试构图。",
    medium: "中等质量：速度和细节折中。",
    high: "高质量：细节更好，但更慢、更容易超时。",
  },
  style_preset: {
    none: "不套预设风格，完全按提示词和参考图决定。",
    photographic: "写实摄影风，接近真实相机拍摄。",
    "digital-art": "数字绘画/概念设计风，适合插画和海报。",
    anime: "动画/二次元风格。",
    "3d-render": "三维渲染质感，适合产品、角色和立体场景。",
    "oil-painting": "油画笔触和传统绘画质感。",
    watercolor: "水彩晕染、轻柔纸面质感。",
    sketch: "草图/线稿感，适合构图草案。",
  },
  response_format: {
    auto: "不发送 response_format 字段，让上游自己决定返回格式。",
    url: "返回图片链接；网页后端会尝试下载并保存到 outputs。",
    b64_json: "返回 base64 图片数据；更稳定但响应体更大。",
  },
  api_endpoint: {
    auto: "自动选择：没有参考图走 generations，有参考图走 edits。",
    "/v1/images/generations": "纯图片生成接口；强制使用时参考图会按旧代理 JSON image 数组发送。",
    "/v1/images/edits": "图片编辑接口，需要至少一张参考图，会用 multipart 上传图片。",
    "/v1/responses": "Responses 接口，兼容 output/result 这类返回结构。",
  },
  edit_mode: {
    generate: "纯生成模式，主要根据提示词出图。",
    reference: "参考图模式，会更重视上传的参考图。",
    outpaint: "扩图/补画模式，适合沿参考图边缘延展画面。",
  },
};

function getEngineLabel(engine) {
  if (engine === "banana") {
    return "Banana Gemini";
  }
  if (engine === "gpt-image-2") {
    return "GPT Image 2";
  }
  return "未知引擎";
}

function getControlHelp(control) {
  const name = control?.name;
  if (!name) {
    return "";
  }

  if (control.tagName === "SELECT") {
    const optionHelp = optionHints[name]?.[control.value];
    if (optionHelp) {
      return optionHelp;
    }
  }

  return fieldHints[name] || "";
}

function syncOptionHelp(select) {
  if (!select || select.tagName !== "SELECT") {
    return;
  }

  const hints = optionHints[select.name] || {};
  Array.from(select.options).forEach((option) => {
    const hint = hints[option.value] || hints[option.textContent] || "";
    if (hint) {
      option.title = hint;
      option.dataset.help = hint;
    }
  });

  const helpText = getControlHelp(select);
  select.title = helpText || fieldHints[select.name] || "";

  const field = select.closest(".field");
  if (!field) {
    return;
  }

  field.querySelector("[data-option-help]")?.remove();
}

function syncParameterHints(root = document) {
  root.querySelectorAll(".field input, .field textarea, .field select").forEach((control) => {
    const help = getControlHelp(control);
    if (help) {
      control.title = help;
      control.closest(".field")?.setAttribute("title", help);
    }
    if (control.tagName === "SELECT") {
      syncOptionHelp(control);
    }
  });

  root.querySelectorAll(".toggle input").forEach((control) => {
    const help = fieldHints[control.name];
    if (help) {
      control.closest(".toggle")?.setAttribute("title", help);
    }
  });
}

function syncSecretToggle(button) {
  const wrapper = button?.closest?.(".secret-input-wrap");
  const input = wrapper?.querySelector?.("[data-secret-input]");
  if (!button || !input) {
    return;
  }

  const visible = input.type === "text";
  button.classList.toggle("is-visible", visible);
  button.setAttribute("aria-pressed", visible ? "true" : "false");
  button.setAttribute("aria-label", visible ? "隐藏 API Key" : "显示 API Key");
  button.title = visible ? "隐藏当前 API Key" : "显示当前 API Key";
}

function toggleSecretInput(button) {
  const wrapper = button?.closest?.(".secret-input-wrap");
  const input = wrapper?.querySelector?.("[data-secret-input]");
  if (!input) {
    return;
  }

  input.type = input.type === "password" ? "text" : "password";
  syncSecretToggle(button);
  input.focus();
}

function setActiveEngine(engine) {
  activeEngine = engine;
  localStorage.setItem(engineStorageKey, engine);

  engineButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.engineTab === engine);
  });

  forms.forEach((form) => {
    form.classList.toggle("active", form.dataset.engine === engine);
    requestAnimationFrame(() => updateFormScrollState(form));
  });

  syncConfigStatus();
}

function storageKey(formId) {
  return `${storagePrefix}${formId}`;
}

function collectFormState(form) {
  const payload = {};
  syncCustomSizeInputs(form);

  Array.from(form.elements).forEach((element) => {
    if (!element.name || element.type === "file") {
      return;
    }

    if (element.type === "checkbox") {
      payload[element.name] = element.checked;
      return;
    }

    payload[element.name] = element.value;
  });

  return payload;
}

function getReusableFormState(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([key]) => !connectionFieldNames.has(String(key).toLowerCase()))
  );
}

function applyFormState(form, payload = {}) {
  Array.from(form.elements).forEach((element) => {
    if (!element.name || element.type === "file" || !(element.name in payload)) {
      return;
    }

    if (element.type === "checkbox") {
      element.checked = Boolean(payload[element.name]);
      return;
    }

    element.value = payload[element.name];
  });
}

function saveFormState(form) {
  localStorage.setItem(storageKey(form.id), JSON.stringify(collectFormState(form)));
  syncConfigStatus();
}

function restoreFormState(form) {
  const raw = localStorage.getItem(storageKey(form.id));
  if (!raw) {
    updateFileSummary(form);
    return;
  }

  try {
    applyFormState(form, JSON.parse(raw));
  } catch (error) {
    console.warn("表单状态恢复失败:", error);
  }

  updateFileSummary(form);
}

function resetForm(formId) {
  const form = document.getElementById(formId);
  if (!form) {
    return;
  }

  form.reset();
  const referenceInput = form.querySelector('input[type="file"][data-limit]');
  if (referenceInput) {
    writeReferenceFiles(referenceInput, []);
  }
  localStorage.removeItem(storageKey(form.id));
  updateFileSummary(form);
  renderReferencePreview(form);
  syncCustomSizeState(form);
  syncTimeoutState(form);
  syncParameterHints(form);
  syncConfigSections(form, { forceOpenIfEmpty: true });
}

function updateFileSummary(form) {
  const input = form.querySelector('input[type="file"][data-limit]');
  const summary = form.querySelector("[data-file-summary]");
  if (!input || !summary) {
    return;
  }

  const fileCount = getStoredReferenceFiles(input).length;
  const limit = Number(input.dataset.limit || 0);

  if (fileCount === 0) {
    summary.textContent = limit ? `最多 ${limit} 张，支持多次追加` : "还没有添加参考图";
    return;
  }

  summary.textContent = limit ? `已添加 ${fileCount} / ${limit} 张，继续点击可追加` : `已添加 ${fileCount} 张参考图`;
}

function formatEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.host || raw;
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${host}${path}`;
  } catch (error) {
    return raw.replace(/^https?:\/\//i, "");
  }
}

function setConfigSectionCollapsed(section, collapsed) {
  section.dataset.collapsed = collapsed ? "true" : "false";

  const toggleRow = section.querySelector("[data-config-toggle]");
  const action = section.querySelector("[data-config-action]");

  if (toggleRow) {
    toggleRow.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  if (action) {
    action.textContent = collapsed ? "展开" : "收起";
  }
}

function toggleConfigSection(section, forceCollapsed) {
  const currentCollapsed = section.dataset.collapsed === "true";
  const nextCollapsed = typeof forceCollapsed === "boolean" ? forceCollapsed : !currentCollapsed;
  setConfigSectionCollapsed(section, nextCollapsed);
  requestAnimationFrame(() => updateFormScrollState(section.closest("form")));
}

function syncConfigSection(section, options = {}) {
  const form = section.closest("form");
  if (!form) {
    return;
  }

  const keyName = section.dataset.keyName;
  const baseName = section.dataset.baseName;
  const modelName = section.dataset.modelName;
  const stateNode = section.querySelector("[data-config-state]");
  const summaryNode = section.querySelector("[data-config-summary]");

  const keyValue = String(form.elements.namedItem(keyName)?.value || "").trim();
  const baseValue = String(form.elements.namedItem(baseName)?.value || "").trim();
  const modelValue = String(form.elements.namedItem(modelName)?.value || "").trim();
  const ready = Boolean(keyValue);

  section.dataset.ready = ready ? "true" : "false";

  if (stateNode) {
    stateNode.textContent = ready ? "已配置" : "待填写";
  }

  if (summaryNode) {
    if (ready) {
      const parts = [formatEndpoint(baseValue), modelValue].filter(Boolean);
      summaryNode.textContent = parts.length ? parts.join(" / ") : "已填写连接参数";
    } else {
      summaryNode.textContent = "填写 API Key、Base URL 和模型名";
    }
  }

  if (options.autoCollapse && ready && baseValue && modelValue) {
    setConfigSectionCollapsed(section, true);
  }

  if (options.forceOpenIfEmpty && !ready) {
    setConfigSectionCollapsed(section, false);
  }
}

function syncConfigSections(form, options = {}) {
  form.querySelectorAll("[data-config-section]").forEach((section) => {
    syncConfigSection(section, options);
  });
}

function getCustomSizeElements(form) {
  return {
    sizeSelect: form.elements.namedItem("size"),
    hiddenInput: form.querySelector("[data-custom-size-input]"),
    widthInput: form.querySelector("[data-custom-size-width]"),
    heightInput: form.querySelector("[data-custom-size-height]"),
    field: form.querySelector("[data-custom-size-field]"),
    hint: form.querySelector("[data-custom-size-hint]"),
  };
}

function getSizeSummaryText(form) {
  const sizeValue = String(form?.elements?.namedItem("size")?.value || "auto");
  if (sizeValue.toLowerCase() === "custom") {
    const parsed = syncCustomSizeInputs(form);
    return parsed ? formatCustomSize(parsed.width, parsed.height) : "custom";
  }
  return sizeValue;
}

function updateSizeSummary(form) {
  const summary = form?.querySelector?.("[data-size-summary]");
  if (summary) {
    summary.textContent = getSizeSummaryText(form);
  }
}

function getApiSummaryText(form) {
  const format = String(form?.elements?.namedItem("response_format")?.value || "auto");
  const endpoint = String(form?.elements?.namedItem("api_endpoint")?.value || "auto");
  return `${endpoint.replace("/v1/images/", "").replace("/v1/", "")} / ${format}`;
}

function updateApiSummary(form) {
  const summary = form?.querySelector?.("[data-api-summary]");
  if (summary) {
    summary.textContent = getApiSummaryText(form);
  }
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function getSizePresetParts(sizeValue) {
  const parsed = parseCustomSizeText(sizeValue);
  if (!parsed) {
    return { resolution: "1024", ratio: "1:1" };
  }
  const divisor = gcd(parsed.width, parsed.height);
  const ratio = `${parsed.width / divisor}:${parsed.height / divisor}`;
  return {
    resolution: String(Math.max(parsed.width, parsed.height)),
    ratio,
  };
}

function resolvePresetSizeInfo(resolution, ratio) {
  const presetMap = {
    "1024|1:1": "1024x1024",
    "1024|3:2": "1536x1024",
    "1024|2:3": "1024x1536",
    "1024|16:9": "1536x864",
    "1024|9:16": "864x1536",
    "1024|4:3": "1536x1152",
    "1024|3:4": "1152x1536",
    "1024|21:9": "2016x864",
    "2048|1:1": "2048x2048",
    "2048|16:9": "2048x1152",
    "2048|9:16": "1152x2048",
    "3840|16:9": "3840x2160",
    "3840|9:16": "2160x3840",
  };
  const mapped = presetMap[`${resolution}|${ratio}`];
  if (mapped) {
    return { value: mapped, capped: false };
  }
  const [ratioWidth, ratioHeight] = String(ratio || "1:1").split(":").map((value) => Number(value));
  const requestedLongEdge = Number(resolution || 1024);
  if (!ratioWidth || !ratioHeight || !requestedLongEdge) {
    return { value: "1024x1024", capped: false };
  }
  const longToShortRatio = Math.max(ratioWidth, ratioHeight) / Math.min(ratioWidth, ratioHeight);
  const maxLongEdgeByPixels = Math.floor(Math.sqrt(customSizeMaxPixels * longToShortRatio));
  const longEdge = nearestCustomSizeStep(Math.min(requestedLongEdge, customSizeMaxEdge, maxLongEdgeByPixels));
  const landscape = ratioWidth >= ratioHeight;
  const width = landscape ? longEdge : nearestCustomSizeStep((longEdge * ratioWidth) / ratioHeight);
  const height = landscape ? nearestCustomSizeStep((longEdge * ratioHeight) / ratioWidth) : longEdge;
  const capped = longEdge < requestedLongEdge;
  return { value: formatCustomSize(width, height), capped };
}

function resolvePresetSize(resolution, ratio) {
  return resolvePresetSizeInfo(resolution, ratio).value;
}

function setButtonGroupValue(buttons, dataKey, value) {
  buttons.forEach((button) => {
    const active = String(button.dataset[dataKey] || "") === String(value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function parseCustomSizeText(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d+)\s*[xX×]\s*(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function formatCustomSize(width, height) {
  return `${width}x${height}`;
}

function nearestCustomSizeStep(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return customSizeStep;
  }

  return Math.min(customSizeMaxEdge, Math.max(customSizeStep, Math.round(numberValue / customSizeStep) * customSizeStep));
}

function getRecommendedCustomSize(width, height) {
  return {
    width: nearestCustomSizeStep(width),
    height: nearestCustomSizeStep(height),
  };
}

function getCustomSizeValidation(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, message: "请输入宽和高两个正整数。" };
  }

  if (width > customSizeMaxEdge || height > customSizeMaxEdge) {
    return { ok: false, message: `宽高都不能超过 ${customSizeMaxEdge}。` };
  }

  if (width % customSizeStep !== 0 || height % customSizeStep !== 0) {
    const recommended = getRecommendedCustomSize(width, height);
    return {
      ok: false,
      message: `宽高都需要是 ${customSizeStep} 的倍数，建议 ${formatCustomSize(recommended.width, recommended.height)}。`,
      recommended,
    };
  }

  const pixels = width * height;
  if (pixels < customSizeMinPixels) {
    return { ok: false, message: "尺寸太小，请提高宽或高。" };
  }

  if (pixels > customSizeMaxPixels) {
    return { ok: false, message: "尺寸太大，请降低宽或高。" };
  }

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > customSizeMaxRatio) {
    return { ok: false, message: `宽高比例不能超过 ${customSizeMaxRatio}:1。` };
  }

  return { ok: true, message: `将使用 ${formatCustomSize(width, height)}。` };
}

function syncCustomSizeInputs(form) {
  const { hiddenInput, widthInput, heightInput } = getCustomSizeElements(form);
  if (!hiddenInput || !widthInput || !heightInput) {
    return null;
  }

  const hiddenValue = hiddenInput.value.trim();
  const visibleWidth = widthInput.value.trim();
  const visibleHeight = heightInput.value.trim();
  const visibleValue = visibleWidth && visibleHeight ? formatCustomSize(visibleWidth, visibleHeight) : "";
  const hiddenChangedExternally =
    hiddenValue && hiddenInput.dataset.syncedValue !== hiddenValue && hiddenValue !== visibleValue;

  if (hiddenChangedExternally) {
    const parsed = parseCustomSizeText(hiddenValue);
    if (parsed) {
      widthInput.value = String(parsed.width);
      heightInput.value = String(parsed.height);
    }
  } else if (visibleWidth || visibleHeight) {
    hiddenInput.value = formatCustomSize(visibleWidth, visibleHeight);
  }

  hiddenInput.dataset.syncedValue = hiddenInput.value.trim();
  return parseCustomSizeText(hiddenInput.value);
}

function syncCustomSizeState(form) {
  const sizeSelect = form.elements.namedItem("size");
  const { hiddenInput, widthInput, heightInput, field, hint } = getCustomSizeElements(form);
  if (!sizeSelect || !hiddenInput || !widthInput || !heightInput) {
    updateSizeSummary(form);
    return { ok: true, message: "" };
  }

  const enabled = String(sizeSelect.value || "").toLowerCase() === "custom";
  const parsed = syncCustomSizeInputs(form);
  hiddenInput.disabled = !enabled;
  widthInput.disabled = !enabled;
  heightInput.disabled = !enabled;
  field?.classList.toggle("field-disabled", !enabled);
  widthInput.title = "宽度，必须是 16 的倍数。";
  heightInput.title = "高度，必须是 16 的倍数。";

  if (!enabled) {
    field?.classList.remove("is-invalid");
    if (hint) {
      hint.textContent = "custom 后生效，宽高需为 16 的倍数。";
    }
    updateSizeSummary(form);
    return { ok: true, message: "" };
  }

  const validation = parsed
    ? getCustomSizeValidation(parsed.width, parsed.height)
    : { ok: false, message: "请输入宽和高两个数字，例如 1536 和 864。" };

  field?.classList.toggle("is-invalid", !validation.ok);
  if (hint) {
    hint.textContent = validation.message;
  }

  updateSizeSummary(form);
  return validation;
}

function setSizeModalMode(mode) {
  activeSizeMode = mode || "auto";
  sizeModeButtons.forEach((button) => {
    const active = button.dataset.sizeMode === activeSizeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  sizeModePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.sizePanel === activeSizeMode);
  });
  updateSizeModalPreview();
}

function getSizeModalValue() {
  if (activeSizeMode === "auto") {
    return "auto";
  }
  if (activeSizeMode === "preset") {
    return resolvePresetSize(activeSizeResolution, activeSizeRatio);
  }
  const width = Number(sizeModalWidth?.value || 0);
  const height = Number(sizeModalHeight?.value || 0);
  const validation = getCustomSizeValidation(width, height);
  const next = validation.recommended || { width, height };
  return formatCustomSize(next.width, next.height);
}

function updateSizeModalPreview() {
  const value = getSizeModalValue();
  if (sizeModalResult) {
    sizeModalResult.textContent = value;
  }
  if (sizeModalResultNote) {
    const info = activeSizeMode === "preset" ? resolvePresetSizeInfo(activeSizeResolution, activeSizeRatio) : null;
    sizeModalResultNote.textContent = info?.capped ? "已按总像素上限自动收敛到可用尺寸。" : "";
  }
  setButtonGroupValue(sizeResolutionButtons, "sizeResolution", activeSizeResolution);
  setButtonGroupValue(sizeRatioButtons, "sizeRatio", activeSizeRatio);
  if (!sizeModalHint || activeSizeMode !== "custom") {
    return;
  }
  const width = Number(sizeModalWidth?.value || 0);
  const height = Number(sizeModalHeight?.value || 0);
  const validation = getCustomSizeValidation(width, height);
  sizeModalHint.textContent = validation.message;
  sizeModalHint.classList.toggle("is-invalid", !validation.ok);
}

function openSizeModal(form) {
  if (!sizeModal || !form) {
    return;
  }
  activeSizeForm = form;
  lastFocusedBeforeSizeModal = document.activeElement;
  const sizeValue = String(form.elements.namedItem("size")?.value || "auto").toLowerCase();
  const parsed = syncCustomSizeInputs(form) || { width: 1536, height: 864 };
  if (sizeModalCurrent) {
    sizeModalCurrent.textContent = `当前：${getSizeSummaryText(form)}`;
  }
  if (sizeValue !== "auto" && sizeValue !== "custom") {
    const parts = getSizePresetParts(form.elements.namedItem("size").value);
    activeSizeResolution = parts.resolution;
    activeSizeRatio = parts.ratio;
  }
  if (sizeModalWidth) {
    sizeModalWidth.value = String(parsed.width);
  }
  if (sizeModalHeight) {
    sizeModalHeight.value = String(parsed.height);
  }
  setSizeModalMode(sizeValue === "custom" ? "custom" : sizeValue === "auto" ? "auto" : "preset");
  sizeModal.hidden = false;
  requestAnimationFrame(() => sizeModal.querySelector("[data-size-mode].active")?.focus());
}

function closeSizeModal() {
  if (!sizeModal) {
    return;
  }
  sizeModal.hidden = true;
  activeSizeForm = null;
  lastFocusedBeforeSizeModal?.focus?.();
}

function applySizeModal() {
  if (!activeSizeForm) {
    return;
  }
  const sizeSelect = activeSizeForm.elements.namedItem("size");
  const { hiddenInput, widthInput, heightInput } = getCustomSizeElements(activeSizeForm);
  if (!sizeSelect) {
    return;
  }

  if (activeSizeMode === "custom") {
    const width = Number(sizeModalWidth?.value || 0);
    const height = Number(sizeModalHeight?.value || 0);
    const validation = getCustomSizeValidation(width, height);
    if (!validation.ok && !validation.recommended) {
      setStatus("error", validation.message);
      updateSizeModalPreview();
      return;
    }
    const next = validation.recommended || { width, height };
    sizeSelect.value = "custom";
    if (widthInput) widthInput.value = String(next.width);
    if (heightInput) heightInput.value = String(next.height);
    if (hiddenInput) hiddenInput.value = formatCustomSize(next.width, next.height);
  } else {
    const nextValue = activeSizeMode === "auto" ? "auto" : resolvePresetSize(activeSizeResolution, activeSizeRatio);
    const hasNativeOption = Array.from(sizeSelect.options || []).some((option) => option.value === nextValue);
    if (hasNativeOption) {
      sizeSelect.value = nextValue;
    } else {
      const parsed = parseCustomSizeText(nextValue);
      if (parsed) {
        sizeSelect.value = "custom";
        if (widthInput) widthInput.value = String(parsed.width);
        if (heightInput) heightInput.value = String(parsed.height);
        if (hiddenInput) hiddenInput.value = nextValue;
      } else {
        sizeSelect.value = "auto";
      }
    }
  }

  syncCustomSizeState(activeSizeForm);
  saveFormState(activeSizeForm);
  closeSizeModal();
}

function updateApiModalPreview() {
  const endpoint = String(apiModalEndpoint?.value || "auto");
  const format = String(apiModalFormat?.value || "auto");
  if (apiModalResult) {
    apiModalResult.textContent = `${endpoint.replace("/v1/images/", "").replace("/v1/", "")} / ${format}`;
  }
}

function openApiModal(form) {
  if (!apiModal || !form) {
    return;
  }
  activeApiForm = form;
  lastFocusedBeforeApiModal = document.activeElement;
  const endpoint = String(form.elements.namedItem("api_endpoint")?.value || "auto");
  const format = String(form.elements.namedItem("response_format")?.value || "auto");
  if (apiModalEndpoint) apiModalEndpoint.value = endpoint;
  if (apiModalFormat) apiModalFormat.value = format;
  if (apiModalCurrent) apiModalCurrent.textContent = `当前：${getApiSummaryText(form)}`;
  updateApiModalPreview();
  apiModal.hidden = false;
  requestAnimationFrame(() => apiModalEndpoint?.focus?.());
}

function closeApiModal() {
  if (!apiModal) {
    return;
  }
  apiModal.hidden = true;
  activeApiForm = null;
  lastFocusedBeforeApiModal?.focus?.();
}

function applyApiModal() {
  if (!activeApiForm) {
    return;
  }
  const endpointSelect = activeApiForm.elements.namedItem("api_endpoint");
  const formatSelect = activeApiForm.elements.namedItem("response_format");
  if (endpointSelect && apiModalEndpoint) {
    endpointSelect.value = apiModalEndpoint.value;
  }
  if (formatSelect && apiModalFormat) {
    formatSelect.value = apiModalFormat.value;
  }
  updateApiSummary(activeApiForm);
  saveFormState(activeApiForm);
  closeApiModal();
}

function syncTimeoutState(form) {
  const toggle = form.querySelector("[data-timeout-toggle]");
  const timeoutInput = form.querySelector("[data-timeout-input]");
  const timeoutField = form.querySelector("[data-timeout-field]");
  if (!toggle || !timeoutInput) {
    return;
  }

  const enabled = !toggle.checked;
  timeoutInput.disabled = !enabled;
  timeoutField?.classList.toggle("is-infinite", !enabled);
  timeoutInput.hidden = !enabled;
}

function getFormScrollRegion(form) {
  return form?.querySelector("[data-form-scroll]") || form;
}

function updateFormScrollState(form) {
  if (!form) {
    return;
  }

  const scrollRegion = getFormScrollRegion(form);
  const scrollable = scrollRegion.scrollHeight > scrollRegion.clientHeight + 8;
  const atTop = scrollRegion.scrollTop <= 4;
  const atBottom = scrollRegion.scrollTop + scrollRegion.clientHeight >= scrollRegion.scrollHeight - 8;

  form.dataset.scrollable = scrollable ? "true" : "false";
  form.dataset.atTop = atTop ? "true" : "false";
  form.dataset.atBottom = atBottom ? "true" : "false";
  scrollRegion.dataset.scrollable = form.dataset.scrollable;
  scrollRegion.dataset.atTop = form.dataset.atTop;
  scrollRegion.dataset.atBottom = form.dataset.atBottom;
}

function refreshFormScrollStates() {
  forms.forEach((form) => {
    requestAnimationFrame(() => updateFormScrollState(form));
  });
}

function revokeReferencePreview(form) {
  const urls = referencePreviewUrls.get(form) || [];
  urls.forEach((url) => URL.revokeObjectURL(url));
  referencePreviewUrls.set(form, []);
}

function getReferenceFileKey(file) {
  return [file.name, file.size, file.lastModified].join("|");
}

function getReferenceLimit(input) {
  return Number(input?.dataset?.limit || 0);
}

function getStoredReferenceFiles(input) {
  if (!referenceFileStore.has(input)) {
    referenceFileStore.set(input, Array.from(input.files || []).filter(isImageFile));
  }

  return referenceFileStore.get(input) || [];
}

function isImageFile(file) {
  return Boolean(file && String(file.type || "").startsWith("image/"));
}

function writeReferenceFiles(input, files) {
  const nextFiles = [];
  const seen = new Set();
  const limit = getReferenceLimit(input);
  let duplicateCount = 0;
  let rejectedCount = 0;
  let limitSkippedCount = 0;

  Array.from(files || []).forEach((file) => {
    if (!isImageFile(file)) {
      rejectedCount += 1;
      return;
    }

    const key = getReferenceFileKey(file);
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }

    if (limit && nextFiles.length >= limit) {
      limitSkippedCount += 1;
      return;
    }

    seen.add(key);
    nextFiles.push(file);
  });

  const dataTransfer = new DataTransfer();
  nextFiles.forEach((file) => dataTransfer.items.add(file));
  input.files = dataTransfer.files;
  referenceFileStore.set(input, nextFiles);

  return {
    files: nextFiles,
    duplicateCount,
    rejectedCount,
    limitSkippedCount,
  };
}

function syncReferenceUi(input) {
  const form = input.closest("form");
  if (!form) {
    return;
  }

  updateFileSummary(form);
  renderReferencePreview(form);
  saveFormState(form);
}

function appendReferenceFiles(input, incomingFiles, { announce = true } = {}) {
  const incoming = Array.from(incomingFiles || []);
  if (!incoming.length) {
    syncReferenceUi(input);
    return;
  }

  const previousFiles = getStoredReferenceFiles(input);
  const previousCount = previousFiles.length;
  const result = writeReferenceFiles(input, [...previousFiles, ...incoming]);
  const currentCount = result.files.length;
  syncReferenceUi(input);

  if (!announce) {
    return;
  }

  const limit = getReferenceLimit(input);
  if (result.limitSkippedCount > 0) {
    setStatus("error", `参考图最多 ${limit} 张，多出的图片没有加入。`);
    return;
  }

  if (result.rejectedCount > 0 && currentCount === previousCount) {
    setStatus("error", "只支持添加图片文件。");
    return;
  }

  if (currentCount > previousCount) {
    setStatus("success", `已添加 ${currentCount - previousCount} 张参考图，当前共 ${currentCount}${limit ? ` / ${limit}` : ""} 张。`);
    return;
  }

  if (result.duplicateCount > 0) {
    setStatus("idle", "这些参考图已经在列表里了，没有重复添加。");
  }
}

function removeReferenceFile(input, keyToRemove) {
  const nextFiles = getStoredReferenceFiles(input).filter((file) => getReferenceFileKey(file) !== keyToRemove);
  writeReferenceFiles(input, nextFiles);
  syncReferenceUi(input);
  setStatus("idle", `已移除 1 张参考图，当前共 ${nextFiles.length} 张。`);
}

function moveReferenceFile(input, fromIndex, toIndex) {
  const files = getStoredReferenceFiles(input);
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= files.length ||
    toIndex >= files.length
  ) {
    return;
  }

  const nextFiles = [...files];
  const [movedFile] = nextFiles.splice(fromIndex, 1);
  nextFiles.splice(toIndex, 0, movedFile);
  writeReferenceFiles(input, nextFiles);
  syncReferenceUi(input);
  setStatus("idle", "参考图顺序已更新。");
}

function clearReferenceFiles(input, { announce = true } = {}) {
  writeReferenceFiles(input, []);
  syncReferenceUi(input);
  if (announce) {
    setStatus("idle", "参考图已经清空。");
  }
}

function renderReferencePreview(form) {
  const input = form.querySelector('input[type="file"][data-limit]');
  const container = form.querySelector("[data-reference-preview]");
  if (!input || !container) {
    return;
  }

  revokeReferencePreview(form);
  container.innerHTML = "";
  container.classList.remove("has-items");

  const files = getStoredReferenceFiles(input);
  if (!files.length) {
    return;
  }

  const previewUrls = [];

  files.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);

    const item = document.createElement("div");
    item.className = "reference-preview-item";
    item.title = file.name;
    item.tabIndex = 0;
    item.draggable = true;
    item.dataset.referenceIndex = String(index);
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `放大参考图 ${file.name}`);
    item.addEventListener("click", () => {
      openLightbox({
        src: url,
        title: file.name,
        caption: `参考图 ${index + 1} / ${files.length}`,
      });
    });
    item.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveReferenceFile(input, index, event.key === "ArrowLeft" ? index - 1 : index + 1);
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openLightbox({
        src: url,
        title: file.name,
        caption: `参考图 ${index + 1} / ${files.length}`,
      });
    });
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      container.querySelectorAll(".reference-preview-item.is-drop-target").forEach((target) => {
        target.classList.remove("is-drop-target");
      });
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      item.classList.add("is-drop-target");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-target");
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("is-drop-target");
      const fromIndex = Number(event.dataTransfer.getData("text/plain"));
      moveReferenceFile(input, fromIndex, index);
    });

    const image = document.createElement("img");
    image.src = url;
    image.alt = file.name;
    image.loading = "lazy";

    const badge = document.createElement("span");
    badge.className = "reference-preview-index";
    badge.textContent = String(index + 1);

    const removeButton = document.createElement("button");
    removeButton.className = "reference-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "x";
    removeButton.setAttribute("aria-label", `移除参考图 ${file.name}`);
    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeReferenceFile(input, getReferenceFileKey(file));
    });

    item.append(image, badge, removeButton);
    container.append(item);
  });

  referencePreviewUrls.set(form, previewUrls);
  container.classList.add("has-items");
}

function setStatus(kind, text) {
  statusBanner.className = `status-banner ${kind}`;
  statusBanner.textContent = text;
}

function setConfigFeedback(kind, text) {
  if (!configFeedback) {
    setStatus(kind, text);
    return;
  }

  configFeedback.className = `config-feedback ${kind}`;
  configFeedback.textContent = text;
}

function stripHtml(value) {
  const raw = String(value || "");
  if (!raw.includes("<")) {
    return raw.trim();
  }

  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").trim() : "";
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title && !text.toLowerCase().includes(title.toLowerCase()) ? `${title} - ${text}` : title || text;
}

function normalizeErrorMessage(value) {
  const text = stripHtml(value).replace(/\s+/g, " ").trim();
  if (!text) {
    return "请求失败，但没有返回具体错误。";
  }

  if (/504|gateway time-out|gateway timeout/i.test(text)) {
    return "上游接口网关超时（504）。这通常是当前 Base URL 或它后面的生成服务长时间没有响应，不是网页表单本身坏了。可以稍后重试，或降低尺寸/质量/数量。";
  }

  return text.length > 700 ? `${text.slice(0, 700).trim()}...` : text;
}

async function readResponsePayload(response) {
  const rawText = await response.text();
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return {
      message: rawText,
      raw_response: rawText,
    };
  }
}

function getResponseErrorMessage(payload, fallback) {
  const detail = payload?.detail;
  if (Array.isArray(detail)) {
    return normalizeErrorMessage(detail.map((item) => item?.msg || JSON.stringify(item)).join("; "));
  }

  if (detail && typeof detail === "object") {
    return normalizeErrorMessage(JSON.stringify(detail));
  }

  return normalizeErrorMessage(detail || payload?.message || payload?.error || payload?.raw_response || fallback);
}

function getRequestFailureKey(form, engine) {
  if (!form) {
    return engine || "unknown";
  }

  const baseValue = String(form.elements.namedItem(engine === "banana" ? "api_base_url" : "base_url")?.value || "").trim();
  const modelValue = String(form.elements.namedItem(engine === "banana" ? "model_type" : "model")?.value || "").trim();
  return [engine, baseValue, modelValue].filter(Boolean).join("|");
}

function clearGatewayFailure(key) {
  if (key) {
    gatewayFailureCounts.delete(key);
  }
}

function annotateGatewayFailure(message, key) {
  if (!/504|网关超时|gateway/i.test(message || "")) {
    return message;
  }

  const nextCount = (gatewayFailureCounts.get(key) || 0) + 1;
  gatewayFailureCounts.set(key, nextCount);
  if (nextCount < 2) {
    return message;
  }

  return `${message} 这个接口地址已经连续 ${nextCount} 次 504，基本可以按上游代理或模型服务超时处理；建议先换一个 Base URL，或把质量/尺寸/数量降下来再试。`;
}

function getProgressState(elapsedSeconds) {
  if (elapsedSeconds < 2) {
    return {
      percent: 12,
      label: "提交请求",
      note: "正在把参数、提示词和参考图交给本地后端。",
    };
  }

  if (elapsedSeconds < 12) {
    return {
      percent: Math.min(42, 18 + elapsedSeconds * 2),
      label: "等待上游响应",
      note: "请求已经发出，正在等待生图接口接收任务。",
    };
  }

  if (elapsedSeconds < 45) {
    return {
      percent: Math.min(78, 42 + (elapsedSeconds - 12) * 1.1),
      label: "模型生成中",
      note: "高质量、大尺寸或带参考图时会更久；页面仍在等待接口返回。",
    };
  }

  return {
    percent: Math.min(92, 78 + (elapsedSeconds - 45) * 0.18),
    label: "仍在等待",
    note: "上游接口还没有返回。如果最终出现 504，通常是代理或生成服务超时。",
  };
}

function updateProgress(state) {
  if (!progressPanel || !progressFill || !progressTrack || !progressLabel || !progressElapsed || !progressNote) {
    return;
  }

  progressPanel.hidden = false;
  progressLabel.textContent = state.label;
  progressElapsed.textContent = `${Math.max(0, Math.floor((Date.now() - progressStartedAt) / 1000))} 秒`;
  progressNote.textContent = state.note;
  progressFill.style.width = `${Math.max(0, Math.min(100, state.percent))}%`;
  progressTrack.setAttribute("aria-valuenow", String(Math.round(state.percent)));
}

function startGenerationProgress(engine) {
  progressStartedAt = Date.now();
  window.clearInterval(progressTimer);
  updateProgress({
    percent: 8,
    label: engine === "banana" ? "Banana Gemini 准备中" : "GPT Image 2 准备中",
    note: "正在整理表单参数。",
  });

  progressTimer = window.setInterval(() => {
    const elapsedSeconds = (Date.now() - progressStartedAt) / 1000;
    updateProgress(getProgressState(elapsedSeconds));
  }, 500);
}

function finishGenerationProgress(kind, note) {
  window.clearInterval(progressTimer);
  progressTimer = null;

  if (!progressPanel) {
    return;
  }

  const isSuccess = kind === "success";
  if (isSuccess) {
    resetGenerationProgress();
    return;
  }

  updateProgress({
    percent: 96,
    label: "请求结束",
    note,
  });
  progressPanel.dataset.state = kind;
}

function resetGenerationProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
  progressStartedAt = 0;

  if (progressPanel) {
    progressPanel.hidden = true;
    progressPanel.dataset.state = "idle";
  }
  if (progressFill) {
    progressFill.style.width = "0%";
  }
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", "0");
  }
}

function renderMeta(meta) {
  const entries = Object.entries(meta || {});
  if (!entries.length) {
    resultMeta.innerHTML = "";
    return;
  }

  resultMeta.innerHTML = entries
    .map(([key, value]) => {
      const printableValue = Array.isArray(value) ? value.join(", ") : String(value);
      return `
        <div class="meta-chip">
          <span class="meta-label">${key}</span>
          <span class="meta-value">${escapeHtml(printableValue)}</span>
        </div>
      `;
    })
    .join("");
}

function updateResultDetailsSummary(meta = {}, messages = []) {
  if (!resultDetailsSummary) {
    return;
  }

  const metaCount = Object.keys(meta || {}).length;
  const messageCount = (Array.isArray(messages) ? messages : []).filter(Boolean).length;

  if (!metaCount && !messageCount) {
    resultDetailsSummary.textContent = "没有额外详情";
    return;
  }

  resultDetailsSummary.textContent = `${metaCount} 条元数据 / ${messageCount} 条返回信息`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatHistoryTime(value) {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHistoryPrompt(entry) {
  return String(entry?.prompt || "").trim() || "没有提示词记录";
}

function getHistoryEngineLabel(entry) {
  return getEngineLabel(entry?.engine || "");
}

function getHistoryImageSrc(image) {
  return image?.saved_url || image?.src || "";
}

function getHistoryImageName(image, index = 0) {
  return image?.name || image?.saved_name || `history-${index + 1}.png`;
}

function getHistoryImageSize(image) {
  const dimensions = image?.dimensions || {};
  if (dimensions.width && dimensions.height) {
    return `${dimensions.width}x${dimensions.height}`;
  }
  return "";
}

function getHistoryModel(entry) {
  const meta = entry?.meta || {};
  return meta.model || meta.model_type || entry?.form_state?.model || entry?.form_state?.model_type || "";
}

function normalizeHistoryBadgeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getHistoryMetaBadges(entry, options = {}) {
  const meta = entry?.meta || {};
  const firstImage = entry?.images?.[0] || {};
  const engineLabel = getHistoryEngineLabel(entry);
  const modelLabel = getHistoryModel(entry);
  const engineKey = normalizeHistoryBadgeText(engineLabel);
  const modelKey = normalizeHistoryBadgeText(modelLabel);
  const values = [
    engineLabel,
    modelKey && modelKey !== engineKey ? modelLabel : "",
    meta.size || meta.image_size || getHistoryImageSize(firstImage),
    formatHistoryTime(entry?.created_at),
  ];
  const seen = new Set();
  return values.filter((value, index) => {
    if (!value || (options.compact && index === 2)) {
      return false;
    }
    const key = normalizeHistoryBadgeText(value);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createHistoryBadge(text, variant = "") {
  const badge = document.createElement("span");
  badge.className = variant ? `history-badge ${variant}` : "history-badge";
  badge.textContent = text;
  return badge;
}

function printableHistoryValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null || typeof value === "undefined" || value === "") {
    return "-";
  }
  return String(value);
}

async function copyTextToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("success", successMessage);
  } catch (error) {
    setStatus("error", "复制失败，可能是浏览器权限限制。");
  }
}

function createDownloadLink(src, name) {
  const anchor = document.createElement("a");
  anchor.href = src;
  anchor.download = name;
  anchor.className = "download-button";
  anchor.textContent = "下载";
  return anchor;
}

function createOpenLink(src) {
  const anchor = document.createElement("a");
  anchor.href = src;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.className = "open-button";
  anchor.textContent = "打开";
  return anchor;
}

function getHistorySearchText(entry) {
  return [
    getHistoryPrompt(entry),
    entry?.negative_prompt,
    entry?.engine,
    getHistoryModel(entry),
    ...(entry?.images || []).map((image) => `${getHistoryImageName(image)} ${image?.saved_path || ""}`),
    ...Object.values(entry?.meta || {}),
  ]
    .filter((value) => typeof value !== "undefined" && value !== null)
    .join(" ")
    .toLowerCase();
}

function getFilteredHistoryEntries() {
  const keyword = String(historySearchInput?.value || "").trim().toLowerCase();
  const engine = String(historyEngineFilter?.value || "all");
  return historyEntries.filter((entry) => {
    const entryEngine = String(entry?.engine || "unknown");
    const engineMatched =
      engine === "all" ||
      (engine === "favorite" && entry.favorite) ||
      entryEngine === engine ||
      (engine === "unknown" && !["gpt-image-2", "banana"].includes(entryEngine));
    if (!engineMatched) {
      return false;
    }
    return !keyword || getHistorySearchText(entry).includes(keyword);
  });
}

function getHistoryFavoriteLabel(entry) {
  return entry?.favorite ? "取消收藏" : "收藏";
}

function historyStarIcon(filled = false) {
  return `
    <svg class="history-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path ${filled ? 'fill="currentColor"' : 'fill="none"'} d="m12 3.3 2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.4-4.2 6-.9L12 3.3Z" />
    </svg>
  `;
}

function historyTrashIcon() {
  return `
    <svg class="history-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M18.5 6 17.6 19.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5.5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  `;
}

function closeHistoryDeleteMenu() {
  if (!openHistoryDeleteMenuId) {
    return;
  }
  openHistoryDeleteMenuId = "";
  renderHistoryList();
}

function setHistoryEmpty(message = "选择一条历史记录查看图片、提示词和参数。") {
  if (!historyDetail) {
    return;
  }
  historyDetail.innerHTML = `
    <div class="history-empty">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderHistoryList() {
  if (!historyList || !historyCount || !historySummary) {
    return;
  }

  filteredHistoryEntries = getFilteredHistoryEntries();
  historyList.innerHTML = "";
  historyCount.textContent = historyEntries.length
    ? `显示 ${filteredHistoryEntries.length} / ${historyEntries.length} 条历史，点击记录查看详情。`
    : "还没有历史记录。";
  historySummary.textContent = historyEntries.length
    ? "历史记录会保存在 web_tool/outputs/history.json。"
    : "生成成功后会自动写入 outputs/history.json。";

  if (!historyEntries.length) {
    setHistoryEmpty("还没有历史记录。旧 outputs 图片会作为“参数未知”的记录显示。");
    return;
  }

  if (!filteredHistoryEntries.length) {
    selectedHistoryId = "";
    setHistoryEmpty("没有匹配的历史记录。换个关键词或筛选条件试试。");
    return;
  }

  if (!selectedHistoryId || !filteredHistoryEntries.some((entry) => entry.id === selectedHistoryId)) {
    selectedHistoryId = filteredHistoryEntries[0].id;
  }

  filteredHistoryEntries.forEach((entry) => {
    const firstImage = entry.images?.[0] || {};
    const item = document.createElement("div");
    item.className = `history-item ${entry.id === selectedHistoryId ? "active" : ""}`;
    item.addEventListener("click", () => {
      selectedHistoryId = entry.id;
      renderHistoryList();
      renderHistoryDetail(entry);
    });

    const selectButton = document.createElement("button");
    selectButton.className = "history-item-select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-label", `查看历史记录 ${formatHistoryTime(entry.created_at)}`);

    const thumb = document.createElement("div");
    thumb.className = "history-item-thumb";
    const image = document.createElement("img");
    image.src = getHistoryImageSrc(firstImage);
    image.alt = getHistoryImageName(firstImage);
    image.loading = "lazy";
    thumb.append(image);

    const main = document.createElement("div");
    main.className = "history-item-main";

    const prompt = document.createElement("p");
    prompt.className = "history-item-prompt";
    prompt.textContent = getHistoryPrompt(entry);

    const badges = document.createElement("div");
    badges.className = "history-badges";
    getHistoryMetaBadges(entry, { compact: true }).forEach((text, index) => {
      badges.append(createHistoryBadge(text, index < 2 ? "" : "neutral"));
    });
    if (entry.legacy) {
      badges.append(createHistoryBadge("参数未知", "neutral"));
    }
    main.append(prompt, badges);
    selectButton.append(thumb, main);
    selectButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedHistoryId = entry.id;
      renderHistoryList();
      renderHistoryDetail(entry);
    });

    const quickActions = document.createElement("div");
    quickActions.className = "history-item-actions";

    const favoriteButton = document.createElement("button");
    favoriteButton.className = entry.favorite
      ? "history-icon-button history-favorite-button active"
      : "history-icon-button history-favorite-button";
    favoriteButton.type = "button";
    favoriteButton.innerHTML = historyStarIcon(Boolean(entry.favorite));
    favoriteButton.title = entry.favorite ? "取消收藏" : "收藏";
    favoriteButton.disabled = Boolean(entry.legacy);
    favoriteButton.setAttribute("aria-label", `${entry.favorite ? "取消收藏" : "收藏"} ${formatHistoryTime(entry.created_at)}`);
    favoriteButton.setAttribute("aria-pressed", entry.favorite ? "true" : "false");
    favoriteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openHistoryDeleteMenuId = "";
      toggleHistoryFavorite(entry);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "history-icon-button history-delete-button";
    deleteButton.type = "button";
    deleteButton.innerHTML = historyTrashIcon();
    deleteButton.title = "删除选项";
    deleteButton.setAttribute("aria-label", `打开删除选项 ${formatHistoryTime(entry.created_at)}`);
    deleteButton.setAttribute("aria-expanded", openHistoryDeleteMenuId === entry.id ? "true" : "false");
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openHistoryDeleteMenuId = openHistoryDeleteMenuId === entry.id ? "" : entry.id;
      renderHistoryList();
    });

    quickActions.append(favoriteButton, deleteButton);
    if (openHistoryDeleteMenuId === entry.id) {
      const menu = document.createElement("div");
      menu.className = "history-delete-menu";
      if (!entry.legacy) {
        const historyOnlyButton = document.createElement("button");
        historyOnlyButton.type = "button";
        historyOnlyButton.textContent = "删除历史";
        historyOnlyButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openHistoryDeleteMenuId = "";
          deleteHistoryEntry(entry);
        });
        menu.append(historyOnlyButton);
      }
      const deleteFilesButton = document.createElement("button");
      deleteFilesButton.type = "button";
      deleteFilesButton.className = "danger";
      deleteFilesButton.textContent = entry.legacy ? "删除图片文件" : "彻底删除";
      deleteFilesButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openHistoryDeleteMenuId = "";
        deleteHistoryEntry(entry, { deleteFiles: true });
      });
      menu.append(deleteFilesButton);
      quickActions.append(menu);
    }
    item.append(selectButton, quickActions);
    historyList.append(item);
  });

  const selectedEntry = filteredHistoryEntries.find((entry) => entry.id === selectedHistoryId);
  renderHistoryDetail(selectedEntry || filteredHistoryEntries[0]);
}

function renderHistoryParamGrid(container, params, options = {}) {
  const excludeKeys = new Set((options.excludeKeys || []).map((key) => String(key).toLowerCase()));
  const emptyText = options.emptyText || "没有可复用参数。";
  const entries = Object.entries(params || {}).filter(
    ([key, value]) => typeof value !== "undefined" && !excludeKeys.has(String(key).toLowerCase())
  );
  if (!entries.length) {
    container.innerHTML = `<p class="history-empty-inline">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "history-param-grid";
  entries.forEach(([key, value]) => {
    const item = document.createElement("div");
    item.className = "meta-chip";
    item.innerHTML = `
      <span class="meta-label">${escapeHtml(key)}</span>
      <span class="meta-value">${escapeHtml(printableHistoryValue(value))}</span>
    `;
    grid.append(item);
  });
  container.replaceChildren(grid);
}

function renderHistoryDetail(entry) {
  if (!historyDetail) {
    return;
  }

  if (!entry) {
    setHistoryEmpty();
    return;
  }

  const promptText = getHistoryPrompt(entry);
  const negativeText = String(entry.negative_prompt || "").trim();
  const wrapper = document.createElement("div");
  wrapper.className = "history-detail";

  const title = document.createElement("div");
  title.className = "history-detail-title";
  const titleText = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = getHistoryEngineLabel(entry);
  const badges = document.createElement("div");
  badges.className = "history-badges";
  getHistoryMetaBadges(entry).forEach((text, index) => {
    badges.append(createHistoryBadge(text, index < 2 ? "" : "neutral"));
  });
  titleText.append(heading, badges);

  const actions = document.createElement("div");
  actions.className = "history-detail-actions";
  const favoriteButton = document.createElement("button");
  favoriteButton.className = entry.favorite ? "history-tool-button history-favorite-active" : "history-tool-button";
  favoriteButton.type = "button";
  favoriteButton.textContent = getHistoryFavoriteLabel(entry);
  favoriteButton.disabled = Boolean(entry.legacy);
  favoriteButton.title = entry.legacy ? "旧输出图片不是 history.json 记录，不能收藏。" : "切换这条历史记录的收藏状态";
  favoriteButton.addEventListener("click", () => toggleHistoryFavorite(entry));

  const copyButton = document.createElement("button");
  copyButton.className = "history-tool-button";
  copyButton.type = "button";
  copyButton.textContent = "复制提示词";
  copyButton.addEventListener("click", () => copyTextToClipboard(promptText, "历史提示词已复制。"));

  const applyButton = document.createElement("button");
  applyButton.className = "history-tool-button";
  applyButton.type = "button";
  applyButton.textContent = "套用参数";
  const reusableFormState = getReusableFormState(entry.form_state || {});
  applyButton.disabled = !Object.keys(reusableFormState).length;
  applyButton.title = applyButton.disabled ? "旧输出没有可套用参数" : "把这条历史的提示词和参数填回表单";
  applyButton.addEventListener("click", () => applyHistoryEntry(entry));
  const deleteFilesButton = document.createElement("button");
  deleteFilesButton.className = "history-tool-button history-danger-tool";
  deleteFilesButton.type = "button";
  deleteFilesButton.textContent = entry.legacy ? "删除图片文件" : "彻底删除";
  deleteFilesButton.title = entry.legacy ? "删除 outputs 里的这张旧输出图片。" : "删除历史记录，并删除 outputs 里的图片文件";
  deleteFilesButton.addEventListener("click", () => deleteHistoryEntry(entry, { deleteFiles: true }));
  actions.append(favoriteButton, copyButton, applyButton, deleteFilesButton);
  title.append(titleText, actions);

  const imageGrid = document.createElement("div");
  imageGrid.className = "history-image-grid";
  (entry.images || []).forEach((image, index) => {
    const imageSrc = getHistoryImageSrc(image);
    const imageName = getHistoryImageName(image, index);
    const imageCaption = image.saved_path || `${getHistoryEngineLabel(entry)} · ${formatHistoryTime(entry.created_at)}`;
    const item = document.createElement("div");
    item.className = "history-image-item";

    const button = document.createElement("button");
    button.className = "history-image-button";
    button.type = "button";
    button.setAttribute("aria-label", `放大历史图片 ${imageName}`);
    button.addEventListener("click", () => {
      openLightbox({
        src: imageSrc,
        title: imageName,
        caption: imageCaption,
      });
    });
    const img = document.createElement("img");
    img.src = imageSrc;
    img.alt = imageName;
    img.loading = "lazy";
    button.append(img);

    const imageActions = document.createElement("div");
    imageActions.className = "history-image-actions";
    const zoomButton = document.createElement("button");
    zoomButton.className = "ghost-button ghost-button-small";
    zoomButton.type = "button";
    zoomButton.textContent = "放大";
    zoomButton.addEventListener("click", () => {
      openLightbox({
        src: imageSrc,
        title: imageName,
        caption: imageCaption,
      });
    });
    imageActions.append(zoomButton, createOpenLink(imageSrc));
    item.append(button, imageActions);
    imageGrid.append(item);
  });

  const promptBox = document.createElement("section");
  promptBox.className = "history-prompt-box";
  promptBox.innerHTML = `<h4>提示词</h4><p>${escapeHtml(promptText)}</p>`;
  if (negativeText) {
    const negative = document.createElement("div");
    negative.className = "history-negative-prompt";
    negative.innerHTML = `<h5>负面提示词</h5><p>${escapeHtml(negativeText)}</p>`;
    promptBox.append(negative);
  }

  const paramsBox = document.createElement("section");
  paramsBox.className = "history-params-box";
  const paramsTitle = document.createElement("h4");
  paramsTitle.textContent = "参数";
  const paramsContent = document.createElement("div");
  paramsBox.append(paramsTitle, paramsContent);
  renderHistoryParamGrid(paramsContent, reusableFormState, {
    excludeKeys: ["prompt", "negative_prompt"],
    emptyText: "提示词已单独展示，没有额外参数。",
  });

  const metaBox = document.createElement("section");
  metaBox.className = "history-params-box";
  const metaTitle = document.createElement("h4");
  metaTitle.textContent = "返回摘要";
  const metaContent = document.createElement("div");
  metaBox.append(metaTitle, metaContent);
  renderHistoryParamGrid(metaContent, entry.meta || {});

  wrapper.append(title, imageGrid, promptBox, paramsBox, metaBox);
  historyDetail.replaceChildren(wrapper);
}

async function toggleHistoryFavorite(entry) {
  if (!entry?.id || entry.legacy) {
    setStatus("error", "这条历史记录不能收藏。");
    return;
  }

  try {
    const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}?limit=160`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ favorite: !entry.favorite }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "更新收藏失败");
    }

    historyEntries = Array.isArray(payload.entries) ? payload.entries : [];
    selectedHistoryId = entry.id;
    renderHistoryList();
    setStatus("success", payload.entry?.favorite ? "已收藏这条历史。" : "已取消收藏。");
  } catch (error) {
    setStatus("error", error.message || "更新收藏失败。");
  }
}

async function deleteHistoryEntry(entry, options = {}) {
  if (!entry?.id) {
    setStatus("error", "这条历史记录没有可删除的 ID。");
    return;
  }

  if (entry.legacy && !options.deleteFiles) {
    setStatus("error", "旧输出图片不是 history.json 记录，不能只从历史中删除。");
    return;
  }

  const deleteFiles = Boolean(options.deleteFiles);
  const promptPreview = getHistoryPrompt(entry).slice(0, 120);
  const confirmed = await requestThemeConfirm({
    title: deleteFiles ? "彻底删除这条历史和图片？" : "确定删除这条历史记录？",
    message: deleteFiles ? "会删除历史索引，并尝试删除 outputs 里的图片文件。这个操作不可恢复。" : "只会删除历史索引，不会删除 outputs 里的图片文件。",
    preview: promptPreview || "这条记录没有提示词预览。",
    confirmText: deleteFiles ? "彻底删除" : "确定删除",
    confirmTitle: deleteFiles ? "删除历史和图片文件" : "删除这条历史记录",
  });
  if (!confirmed) {
    return;
  }

  try {
    const params = new URLSearchParams({ limit: "160" });
    if (deleteFiles) {
      params.set("delete_files", "true");
    }
    if (deleteFiles && entry.legacy) {
      const legacyPath = entry.images?.find((image) => image?.saved_path)?.saved_path || "";
      if (legacyPath) {
        params.set("legacy_path", legacyPath);
      }
    }
    const response = await fetch(`/api/history/${encodeURIComponent(entry.id)}?${params.toString()}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "删除历史失败");
    }

    historyEntries = Array.isArray(payload.entries) ? payload.entries : [];
    if (selectedHistoryId === entry.id) {
      selectedHistoryId = historyEntries[0]?.id || "";
    }
    renderHistoryList();
    const deletedCount = Array.isArray(payload.deleted_files) ? payload.deleted_files.length : 0;
    if (deleteFiles && !deletedCount) {
      setStatus("error", "历史记录已移除，但没有删到图片文件。请刷新历史后再试。");
      return;
    }
    setStatus("success", deleteFiles ? `历史记录已删除，已删除 ${deletedCount} 个图片文件。` : "历史记录已删除，outputs 里的图片文件已保留。");
  } catch (error) {
    setStatus("error", error.message || "删除历史失败。");
  }
}

async function loadHistoryEntries(options = {}) {
  const { silent = false } = options;
  if (!silent && historyCount) {
    historyCount.textContent = "正在读取历史...";
  }

  try {
    const response = await fetch("/api/history?limit=160");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "读取历史失败");
    }
    historyEntries = Array.isArray(payload.entries) ? payload.entries : [];
    renderHistoryList();
  } catch (error) {
    if (!silent) {
      setHistoryEmpty(error.message || "读取历史失败。");
      setStatus("error", error.message || "读取历史失败。");
    }
  }
}

function openHistoryModal() {
  if (!historyModal) {
    return;
  }

  lastFocusedBeforeHistoryModal = document.activeElement;
  historyModal.hidden = false;
  document.body.classList.add("lightbox-open");
  loadHistoryEntries();
  refreshHistoryButton?.focus?.();
}

function closeHistoryModal(options = {}) {
  if (!historyModal || historyModal.hidden) {
    return;
  }

  const { restoreFocus = true } = options;
  historyModal.hidden = true;
  document.body.classList.remove("lightbox-open");
  if (restoreFocus) {
    lastFocusedBeforeHistoryModal?.focus?.();
  }
  lastFocusedBeforeHistoryModal = null;
}

function applyHistoryEntry(entry) {
  const formId = entry?.engine === "gpt-image-2" ? "gpt-image-2-form" : "banana-form";
  const form = document.getElementById(formId);
  const formState = getReusableFormState(entry?.form_state || {});
  if (!form || !Object.keys(formState).length) {
    setStatus("error", "这条历史没有可套用的参数。");
    return;
  }

  applyFormState(form, formState);
  saveFormState(form);
  updateFileSummary(form);
  renderReferencePreview(form);
  syncCustomSizeState(form);
  syncTimeoutState(form);
  syncParameterHints(form);
  syncConfigSections(form, { autoCollapse: true, forceOpenIfEmpty: true });
  setActiveEngine(form.dataset.engine);
  closeHistoryModal();
  setStatus("success", "历史参数已套用到表单，连接配置和模型不会被历史记录覆盖。");
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getLightboxActualZoom() {
  if (!imageLightboxImage || !imageLightboxImage.naturalWidth || !imageLightboxImage.offsetWidth) {
    return 2;
  }

  const widthRatio = imageLightboxImage.naturalWidth / imageLightboxImage.offsetWidth;
  const heightRatio = imageLightboxImage.naturalHeight / imageLightboxImage.offsetHeight;
  return clampNumber(Math.max(widthRatio, heightRatio, 1), minLightboxZoom, maxLightboxZoom);
}

function clampLightboxPan() {
  if (!imageLightboxStage || !imageLightboxImage || lightboxZoom <= minLightboxZoom) {
    lightboxPanX = 0;
    lightboxPanY = 0;
    return;
  }

  const stageRect = imageLightboxStage.getBoundingClientRect();
  const maxX = Math.max(0, (imageLightboxImage.offsetWidth * lightboxZoom - stageRect.width) / 2 + 24);
  const maxY = Math.max(0, (imageLightboxImage.offsetHeight * lightboxZoom - stageRect.height) / 2 + 24);
  lightboxPanX = clampNumber(lightboxPanX, -maxX, maxX);
  lightboxPanY = clampNumber(lightboxPanY, -maxY, maxY);
}

function renderLightboxTransform() {
  if (!imageLightboxImage || !imageLightboxStage) {
    return;
  }

  clampLightboxPan();
  imageLightboxImage.style.setProperty("--lightbox-zoom", String(lightboxZoom));
  imageLightboxImage.style.setProperty("--lightbox-pan-x", `${lightboxPanX}px`);
  imageLightboxImage.style.setProperty("--lightbox-pan-y", `${lightboxPanY}px`);
  imageLightboxStage.classList.toggle("is-zoomed", lightboxZoom > minLightboxZoom + 0.01);

  if (imageLightboxZoomValue) {
    imageLightboxZoomValue.textContent = lightboxZoom <= minLightboxZoom + 0.01 ? "适配" : `${Math.round(lightboxZoom * 100)}%`;
  }
}

function setLightboxZoom(nextZoom) {
  const previousZoom = lightboxZoom;
  lightboxZoom = clampNumber(nextZoom, minLightboxZoom, maxLightboxZoom);

  if (lightboxZoom <= minLightboxZoom + 0.01) {
    lightboxPanX = 0;
    lightboxPanY = 0;
  } else if (previousZoom > minLightboxZoom) {
    const ratio = lightboxZoom / previousZoom;
    lightboxPanX *= ratio;
    lightboxPanY *= ratio;
  }

  renderLightboxTransform();
}

function resetLightboxZoom() {
  lightboxZoom = minLightboxZoom;
  lightboxPanX = 0;
  lightboxPanY = 0;
  lightboxDragState = null;
  imageLightboxStage?.classList.remove("is-dragging");
  renderLightboxTransform();
}

function handleLightboxZoomAction(action) {
  if (action === "in") {
    setLightboxZoom(lightboxZoom * lightboxZoomStep);
  } else if (action === "out") {
    setLightboxZoom(lightboxZoom / lightboxZoomStep);
  } else if (action === "actual") {
    setLightboxZoom(getLightboxActualZoom());
  } else {
    resetLightboxZoom();
  }
}

function handleLightboxWheel(event) {
  if (!imageLightbox || imageLightbox.hidden) {
    return;
  }

  event.preventDefault();
  setLightboxZoom(lightboxZoom * (event.deltaY < 0 ? lightboxZoomStep : 1 / lightboxZoomStep));
}

function startLightboxDrag(event) {
  if (event.button !== 0 || lightboxZoom <= minLightboxZoom + 0.01 || !imageLightboxStage) {
    return;
  }

  event.preventDefault();
  lightboxDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panX: lightboxPanX,
    panY: lightboxPanY,
  };
  imageLightboxStage.classList.add("is-dragging");
  imageLightboxStage.setPointerCapture?.(event.pointerId);
}

function moveLightboxDrag(event) {
  if (!lightboxDragState || lightboxDragState.pointerId !== event.pointerId) {
    return;
  }

  lightboxPanX = lightboxDragState.panX + event.clientX - lightboxDragState.startX;
  lightboxPanY = lightboxDragState.panY + event.clientY - lightboxDragState.startY;
  renderLightboxTransform();
}

function endLightboxDrag(event) {
  if (!lightboxDragState || lightboxDragState.pointerId !== event.pointerId) {
    return;
  }

  imageLightboxStage?.classList.remove("is-dragging");
  imageLightboxStage?.releasePointerCapture?.(event.pointerId);
  lightboxDragState = null;
}

function handleLightboxDoubleClick() {
  if (lightboxZoom <= minLightboxZoom + 0.01) {
    setLightboxZoom(Math.max(2, getLightboxActualZoom()));
  } else {
    resetLightboxZoom();
  }
}

function handleLightboxKeyboard(event) {
  if (!imageLightbox || imageLightbox.hidden) {
    return false;
  }

  if (event.target?.matches?.("input, textarea, select")) {
    return false;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    handleLightboxZoomAction("in");
    return true;
  }

  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    handleLightboxZoomAction("out");
    return true;
  }

  if (event.key === "0") {
    event.preventDefault();
    resetLightboxZoom();
    return true;
  }

  if (event.key === "1") {
    event.preventDefault();
    handleLightboxZoomAction("actual");
    return true;
  }

  if (lightboxZoom > minLightboxZoom + 0.01 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const panStep = event.shiftKey ? 80 : 36;
    if (event.key === "ArrowUp") {
      lightboxPanY += panStep;
    } else if (event.key === "ArrowDown") {
      lightboxPanY -= panStep;
    } else if (event.key === "ArrowLeft") {
      lightboxPanX += panStep;
    } else {
      lightboxPanX -= panStep;
    }
    renderLightboxTransform();
    return true;
  }

  return false;
}

function openLightbox({ src, title, caption }) {
  if (!imageLightbox || !imageLightboxImage || !imageLightboxTitle || !imageLightboxCaption || !src) {
    return;
  }

  lastFocusedBeforeLightbox = document.activeElement;
  resetLightboxZoom();
  imageLightboxImage.src = src;
  imageLightboxImage.alt = title || "图片预览";
  imageLightboxTitle.textContent = title || "预览图片";
  imageLightboxCaption.textContent = `${caption || "图片预览"} · 滚轮缩放，双击切换放大，放大后拖拽查看细节。`;
  imageLightbox.hidden = false;
  document.body.classList.add("lightbox-open");

  imageLightboxStage?.focus?.();
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(modalFocusableSelector)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    return element.getClientRects().length > 0 || element === document.activeElement;
  });
}

function trapFocusInContainer(event, container) {
  if (event.key !== "Tab" || !container) {
    return false;
  }

  const focusableElements = getFocusableElements(container);
  if (!focusableElements.length) {
    return false;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    firstElement.focus();
    return true;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return true;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
    return true;
  }

  return false;
}

function closeLightbox() {
  if (!imageLightbox || imageLightbox.hidden) {
    return;
  }

  imageLightbox.hidden = true;
  resetLightboxZoom();
  imageLightboxImage.src = "";
  document.body.classList.remove("lightbox-open");
  lastFocusedBeforeLightbox?.focus?.();
  lastFocusedBeforeLightbox = null;
}

function openResultDetailsModal() {
  if (!resultDetailsModal) {
    return;
  }

  lastFocusedBeforeDetailsModal = document.activeElement;
  resultDetailsModal.hidden = false;
  document.body.classList.add("lightbox-open");
  resultDetailsModal.querySelector("[data-close-details-modal]:not(.details-modal-backdrop)")?.focus?.();
}

function closeResultDetailsModal(options = {}) {
  if (!resultDetailsModal || resultDetailsModal.hidden) {
    return;
  }

  const { restoreFocus = true } = options;
  resultDetailsModal.hidden = true;
  document.body.classList.remove("lightbox-open");
  if (restoreFocus) {
    lastFocusedBeforeDetailsModal?.focus?.();
  }
  lastFocusedBeforeDetailsModal = null;
}

function revokeObjectUrls() {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];
}

function dataUrlToObjectUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    return {
      url: dataUrl,
      mimeType: "application/octet-stream",
      byteSize: null,
      sourceKind: "unknown",
    };
  }

  const mimeType = match[1] || "application/octet-stream";
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  activeObjectUrls.push(objectUrl);

  return {
    url: objectUrl,
    mimeType,
    byteSize: blob.size,
    sourceKind: "data-url",
  };
}

function prepareImagesForDisplay(images) {
  return (Array.isArray(images) ? images : []).map((image, index) => {
    const prepared = {
      ...image,
      name: image?.name || `image-${index + 1}.png`,
      originalSrc: image?.src || "",
      savedSrc: image?.saved_url || "",
      savedPath: image?.saved_path || "",
    };

    if (prepared.savedSrc) {
      prepared.previewSrc = prepared.savedSrc;
      prepared.downloadHref = prepared.savedSrc;
      prepared.openHref = prepared.savedSrc;
      prepared.byteSize = null;
      prepared.sourceKind = "saved-output";
      return prepared;
    }

    if (typeof prepared.originalSrc === "string" && prepared.originalSrc.startsWith("data:")) {
      const objectData = dataUrlToObjectUrl(prepared.originalSrc);
      prepared.previewSrc = objectData.url;
      prepared.downloadHref = objectData.url;
      prepared.openHref = objectData.url;
      prepared.byteSize = objectData.byteSize;
      prepared.sourceKind = objectData.sourceKind;
      prepared.mime_type = prepared.mime_type || objectData.mimeType;
      return prepared;
    }

    prepared.previewSrc = prepared.originalSrc;
    prepared.downloadHref = prepared.originalSrc;
    prepared.openHref = prepared.originalSrc;
    prepared.byteSize = null;
    prepared.sourceKind = /^https?:/i.test(prepared.originalSrc) ? "remote-url" : "inline-url";
    return prepared;
  });
}

function buildDisplayPayload(payload, preparedImages) {
  const meta = payload?.meta || {};
  return {
    ok: Boolean(payload?.ok),
    engine: payload?.engine || activeEngine,
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    meta,
    images: preparedImages.map((image) => ({
      name: image.name,
      mime_type: image.mime_type || "unknown",
      source: image.source || "result",
      source_kind: image.sourceKind,
      byte_size: image.byteSize,
      saved_url: image.savedSrc || image.saved_url || "",
      saved_path: image.savedPath || image.saved_path || "",
    })),
  };
}

function renderGalleryPlaceholder(mode = "idle") {
  const content =
    mode === "loading"
      ? `
        <div class="empty-state empty-state-live">
          <p>正在生成中。</p>
          <p>上一次的结果已经收起，新的图片返回后会自动显示。</p>
        </div>
      `
      : mode === "empty"
      ? `
        <div class="empty-state">
          <p>这次没有拿到图片。</p>
          <p>可以看看下面的返回信息，通常会给出失败原因。</p>
        </div>
      `
      : `
        <div class="empty-state">
          <p>暂时还没有图片。</p>
          <p>点击“开始生成”后会显示预览和下载。</p>
        </div>
      `;

  resultGallery.className = "gallery-grid empty";
  resultGallery.innerHTML = content;
}

function renderImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    renderGalleryPlaceholder("empty");
    return;
  }

  resultGallery.className = "gallery-grid";
  resultGallery.innerHTML = "";

  images.forEach((image, index) => {
    const card = document.createElement("article");
    card.className = "gallery-card";

    const media = document.createElement("div");
    media.className = "gallery-card-media";

    const previewButton = document.createElement("button");
    previewButton.className = "image-preview-button";
    previewButton.type = "button";
    previewButton.setAttribute("aria-label", `放大生成结果 ${index + 1}`);

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = image.name || `生成结果 ${index + 1}`;
    img.src = image.previewSrc || image.src;
    previewButton.addEventListener("click", () => {
      openLightbox({
        src: image.previewSrc || image.src,
        title: image.name || `生成结果 ${index + 1}`,
        caption: `${image.source || "result"} · 点击背景或按 Esc 关闭。`,
      });
    });

    const body = document.createElement("div");
    body.className = "gallery-card-body";

    const top = document.createElement("div");
    top.className = "gallery-card-top";

    const title = document.createElement("p");
    title.className = "gallery-card-title";
    title.textContent = image.name || `image-${index + 1}.png`;

    top.append(title);

    const actions = document.createElement("div");
    actions.className = "gallery-actions gallery-actions-floating";
    actions.append(createDownloadLink(image.downloadHref || image.previewSrc || image.src, image.name || `image-${index + 1}.png`));
    actions.append(createOpenLink(image.openHref || image.previewSrc || image.src));

    const sourceTag = document.createElement("span");
    sourceTag.className = "source-tag source-tag-floating";
    sourceTag.textContent = image.source || "result";

    const previewHint = document.createElement("span");
    previewHint.className = "preview-hint";
    previewHint.textContent = "点击放大";

    body.append(top);
    previewButton.append(img);
    media.append(previewButton, sourceTag, actions, previewHint);
    card.append(media, body);
    resultGallery.append(card);
  });
}

function renderAssetHistory() {
  if (!assetStrip || !assetSummary) {
    return;
  }

  if (!assetHistory.length) {
    assetStrip.className = "asset-strip empty";
    assetStrip.innerHTML = "<p>暂无最近生成。</p>";
    assetSummary.textContent = "本页生成会沉淀为缩略图，完整记录点右上角“历史”。";
    return;
  }

  assetStrip.className = "asset-strip";
  assetSummary.textContent = `已保留 ${assetHistory.length} 张最近生成，点击缩略图可放大，完整记录点“历史”。`;
  assetStrip.innerHTML = "";

  assetHistory.forEach((asset) => {
    const item = document.createElement("button");
    item.className = "asset-thumb";
    item.type = "button";
    item.title = `${asset.name}\n${asset.savedPath || "已保存到 outputs"}`;
    item.setAttribute("aria-label", `放大素材 ${asset.name}`);
    item.addEventListener("click", () => {
      openLightbox({
        src: asset.src,
        title: asset.name,
        caption: asset.savedPath || asset.caption,
      });
    });

    const img = document.createElement("img");
    img.src = asset.src;
    img.alt = asset.name;
    img.loading = "lazy";

    const badge = document.createElement("span");
    badge.className = "asset-thumb-badge";
    badge.textContent = asset.engineLabel;

    item.append(img, badge);
    assetStrip.append(item);
  });
}

function appendAssetHistory(images, payload, job) {
  if (!Array.isArray(images) || !images.length) {
    return;
  }

  const engine = payload?.engine || job?.engine || activeEngine;
  const engineLabel = getEngineLabel(engine);
  const createdAt = Date.now();
  const entries = images
    .map((image, index) => {
      const src = image.savedSrc || image.saved_url || image.openHref || image.previewSrc || image.src;
      if (!src) {
        return null;
      }
      if (String(src).startsWith("blob:")) {
        return null;
      }

      return {
        id: `${createdAt}-${index}-${Math.random().toString(16).slice(2)}`,
        src,
        downloadHref: image.downloadHref || src,
        name: image.saved_name || image.name || `image-${index + 1}.png`,
        engineLabel,
        prompt: job?.prompt || "",
        savedPath: image.savedPath || image.saved_path || "",
        caption: `${engineLabel} · ${job?.prompt || "本次生成"}`,
        createdAt,
      };
    })
    .filter(Boolean);

  if (!entries.length) {
    return;
  }

  assetHistory = [...entries, ...assetHistory].slice(0, maxAssetHistory);
  renderAssetHistory();
}

function clearAssetHistory() {
  assetHistory = [];
  renderAssetHistory();
  setStatus("idle", "最近生成缩略图已经清空，本地 outputs 文件不会被删除。");
}

async function openOutputsFolder() {
  if (!openOutputsFolderButton) {
    return;
  }

  const previousText = openOutputsFolderButton.textContent;
  openOutputsFolderButton.disabled = true;
  openOutputsFolderButton.textContent = "打开中";
  try {
    const response = await fetch("/api/open-outputs", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "打开文件夹失败");
    }
    setStatus("success", `已打开 ${payload.path || "outputs"} 文件夹。`);
  } catch (error) {
    setStatus("error", error.message || "打开 outputs 文件夹失败");
  } finally {
    openOutputsFolderButton.disabled = false;
    openOutputsFolderButton.textContent = previousText || "打开文件夹";
  }
}

function syncQueueCollapseState() {
  if (!queuePanel || !queueList) {
    return;
  }

  queuePanel.dataset.collapsed = queueCollapsed ? "true" : "false";
  queuePanel.setAttribute("aria-expanded", queueCollapsed ? "false" : "true");
  queuePanel.title = queueCollapsed ? "点击展开任务队列" : "点击折叠任务队列";
  queueList.hidden = queueCollapsed;

  if (queueToggleChip) {
    queueToggleChip.textContent = queueCollapsed ? "展开" : "收起";
  }
}

function setQueueCollapsed(collapsed) {
  queueCollapsed = Boolean(collapsed);
  syncQueueCollapseState();
}

function toggleQueueCollapsed() {
  setQueueCollapsed(!queueCollapsed);
}

function isInteractiveQueueTarget(target) {
  if (target === queuePanel) {
    return false;
  }

  const interactiveTarget = target?.closest?.(
    "button, a, input, select, textarea, summary, [role='button'], [data-no-queue-toggle]"
  );
  return Boolean(interactiveTarget && interactiveTarget !== queuePanel);
}

function renderMessages(messages) {
  const items = Array.isArray(messages) ? messages.filter(Boolean) : [];
  if (!items.length) {
    messageList.innerHTML = "<li>没有额外返回信息。</li>";
    return;
  }

  messageList.innerHTML = items.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
}

function getPromptSnippet(form) {
  const prompt = String(form.elements.namedItem("prompt")?.value || "").trim();
  if (!prompt) {
    return "未填写提示词";
  }
  return prompt.length > 42 ? `${prompt.slice(0, 42)}...` : prompt;
}

function prepareResultForNewGeneration(job) {
  revokeObjectUrls();
  lastMetaPayload = null;
  resultTitle.textContent = `${getEngineLabel(job.engine)} 生成中`;
  renderMeta({});
  renderMessages([]);
  updateResultDetailsSummary({}, []);
  renderGalleryPlaceholder("loading");
  closeResultDetailsModal({ restoreFocus: false });
  metaJson.textContent = "暂无元数据";
  setStatus("loading", `正在执行队列 #${job.id}：${getEngineLabel(job.engine)}。`);
  startGenerationProgress(job.engine);
}

function renderQueue() {
  if (!queuePanel || !queueList || !queueSummary) {
    return;
  }

  const visibleJobs = generationQueue.slice(-maxVisibleQueueJobs).reverse();
  const queuedCount = generationQueue.filter((job) => job.status === "queued").length;
  const doneCount = generationQueue.filter((job) => job.status === "done").length;
  const errorCount = generationQueue.filter((job) => job.status === "error").length;
  const removableCount = doneCount + errorCount;
  const runningCount = activeQueueJob ? 1 : 0;

  queuePanel.hidden = generationQueue.length === 0 && !activeQueueJob;
  queueSummary.textContent =
    runningCount || queuedCount
      ? `${runningCount ? "1 个生成中" : "没有生成中"}，${queuedCount} 个排队`
      : `已完成 ${doneCount} 个任务，失败 ${errorCount} 个`;

  if (clearQueueButton) {
    clearQueueButton.disabled = removableCount === 0;
    clearQueueButton.title =
      removableCount > 0 ? `清除 ${removableCount} 个已结束任务` : "没有可清除的已结束任务";
  }

  queueList.innerHTML = "";
  visibleJobs.forEach((job) => {
    const item = document.createElement("div");
    item.className = `queue-item ${job.status}`;

    const main = document.createElement("div");
    main.className = "queue-item-main";

    const title = document.createElement("strong");
    title.textContent = `#${job.id} ${getEngineLabel(job.engine)}`;

    const prompt = document.createElement("span");
    prompt.textContent = job.prompt;

    const status = document.createElement("em");
    status.textContent =
      job.status === "running"
        ? "生成中"
        : job.status === "queued"
        ? "排队中"
        : job.status === "done"
        ? "完成"
        : "失败";

    const actions = document.createElement("div");
    actions.className = "queue-item-actions";
    actions.append(status);

    if (job.status === "queued") {
      const removeButton = document.createElement("button");
      removeButton.className = "queue-remove-button";
      removeButton.type = "button";
      removeButton.textContent = "移除";
      removeButton.setAttribute("aria-label", `移除队列任务 #${job.id}`);
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeQueuedJob(job.id);
      });
      actions.append(removeButton);
    }

    main.append(title, prompt);
    item.append(main, actions);
    queueList.append(item);
  });

  syncQueueCollapseState();
}

function removeQueuedJob(jobId) {
  const job = generationQueue.find((item) => item.id === jobId);
  if (!job) {
    renderQueue();
    return;
  }
  if (job.status !== "queued") {
    setStatus("idle", job.status === "running" ? "正在生成的任务暂时不能移除。" : "这个任务已经结束，可以清空队列。");
    return;
  }

  generationQueue = generationQueue.filter((item) => item.id !== jobId);
  setStatus("success", `已移除队列任务 #${jobId}。`);
  renderQueue();
  processNextQueuedJob();
}

function clearFinishedQueueJobs() {
  const beforeCount = generationQueue.length;
  generationQueue = generationQueue.filter((job) => job.status === "queued" || job.status === "running");
  const removedCount = beforeCount - generationQueue.length;
  if (removedCount > 0) {
    setStatus("success", `已清除 ${removedCount} 个已结束队列任务。`);
  } else {
    setStatus("idle", activeQueueJob ? "当前任务仍在生成中。" : "没有可清除的队列任务。");
  }
  renderQueue();
}

function removeSuccessfulQueueJob(job) {
  if (!job || job.status !== "done") {
    return;
  }
  generationQueue = generationQueue.filter((item) => item !== job);
}

function enqueueGeneration(form) {
  const engine = form.dataset.engine;
  const customSizeValidation = syncCustomSizeState(form);
  if (!customSizeValidation.ok) {
    setStatus("error", customSizeValidation.message);
    form.querySelector("[data-custom-size-width]")?.focus();
    return;
  }

  const input = form.querySelector('input[type="file"][data-limit]');
  const limit = Number(input?.dataset.limit || 0);
  const fileCount = input?.files?.length || 0;

  if (limit && fileCount > limit) {
    setStatus("error", `参考图数量超出限制，当前 ${fileCount} 张，最多 ${limit} 张。`);
    return;
  }

  const job = {
    id: (queueJobId += 1),
    engine,
    formData: new FormData(form),
    failureKey: getRequestFailureKey(form, engine),
    prompt: getPromptSnippet(form),
    status: "queued",
    createdAt: Date.now(),
    message: "",
  };

  generationQueue.push(job);
  setStatus("loading", activeQueueJob ? `已加入队列 #${job.id}，会在当前任务后自动开始。` : `已加入队列 #${job.id}，马上开始。`);
  renderQueue();
  processNextQueuedJob();
}

async function processNextQueuedJob() {
  if (activeQueueJob) {
    return;
  }

  const nextJob = generationQueue.find((job) => job.status === "queued");
  if (!nextJob) {
    renderQueue();
    return;
  }

  activeQueueJob = nextJob;
  nextJob.status = "running";
  nextJob.startedAt = Date.now();
  renderQueue();
  await runQueueJob(nextJob);
}

async function runQueueJob(job) {
  prepareResultForNewGeneration(job);

  try {
    const response = await fetch(`/api/generate/${job.engine}`, {
      method: "POST",
      body: job.formData,
    });

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(getResponseErrorMessage(payload, `请求失败（HTTP ${response.status}）`));
    }

    if (payload?.raw_response) {
      throw new Error(getResponseErrorMessage(payload, "接口返回了非 JSON 内容"));
    }

    revokeObjectUrls();
    clearGatewayFailure(job.failureKey);
    const preparedImages = prepareImagesForDisplay(payload.images || []);
    appendAssetHistory(preparedImages, payload, job);
    lastMetaPayload = buildDisplayPayload(payload, preparedImages);
    job.status = payload.ok ? "done" : "error";
    job.message = payload.ok ? `返回 ${preparedImages.length} 张图片` : "没有拿到图片";
    if (payload.ok) {
      removeSuccessfulQueueJob(job);
    }
    resultTitle.textContent = payload.ok ? "生成完成" : "请求完成，但没有图片";
    setStatus(
      payload.ok ? "success" : "error",
      payload.ok
        ? `成功返回 ${preparedImages.length} 张图片，用时 ${payload.meta?.elapsed_seconds ?? "-"} 秒，已自动保存到 outputs。`
        : "接口返回了结果，但没有拿到图片，请展开详情查看返回信息。"
    );
    finishGenerationProgress(payload.ok ? "success" : "error", payload.ok ? "图片已经保存到 outputs，可以点击预览放大。" : "请求完成但没有拿到图片。");

    renderMeta(payload.meta || {});
    renderImages(preparedImages);
    renderMessages(payload.messages || []);
    updateResultDetailsSummary(payload.meta || {}, payload.messages || []);
    closeResultDetailsModal({ restoreFocus: false });
    metaJson.textContent = JSON.stringify(lastMetaPayload, null, 2);
    if (payload.history_entry || (historyModal && !historyModal.hidden)) {
      await loadHistoryEntries({ silent: true });
    }
  } catch (error) {
    const message = annotateGatewayFailure(normalizeErrorMessage(error.message || "请求失败"), job.failureKey);
    revokeObjectUrls();
    job.status = "error";
    job.message = message;
    lastMetaPayload = null;
    renderMeta({});
    renderGalleryPlaceholder("empty");
    renderMessages([message]);
    updateResultDetailsSummary({}, [message]);
    closeResultDetailsModal({ restoreFocus: false });
    metaJson.textContent = JSON.stringify({ ok: false, error: message }, null, 2);
    resultTitle.textContent = "生成失败";
    setStatus("error", message);
    finishGenerationProgress("error", message);
  } finally {
    activeQueueJob = null;
    renderQueue();
    processNextQueuedJob();
  }
}

function submitForm(event) {
  event.preventDefault();
  enqueueGeneration(event.currentTarget);
}

function clearResults() {
  revokeObjectUrls();
  lastMetaPayload = null;
  resultTitle.textContent = "等待生成";
  renderMeta({});
  renderGalleryPlaceholder("idle");
  renderMessages([]);
  updateResultDetailsSummary({}, []);
  closeResultDetailsModal({ restoreFocus: false });
  metaJson.textContent = "暂无元数据";
  resetGenerationProgress();
  setStatus("idle", "就绪");
}

function closeConfirmModal(result = false, options = {}) {
  if (!confirmModal) {
    return;
  }

  const { restoreFocus = true } = options;
  const resolver = confirmModalResolver;
  confirmModalResolver = null;
  confirmModal.hidden = true;
  if (restoreFocus) {
    lastFocusedBeforeConfirmModal?.focus?.();
  }
  lastFocusedBeforeConfirmModal = null;
  if (resolver) {
    resolver(Boolean(result));
  }
}

function requestThemeConfirm(options = {}) {
  if (!confirmModal || !confirmModalTitle || !confirmModalMessage || !confirmModalConfirmButton || !confirmModalPreview) {
    return Promise.resolve(false);
  }

  if (confirmModalResolver) {
    closeConfirmModal(false, { restoreFocus: false });
  }

  lastFocusedBeforeConfirmModal = document.activeElement;
  confirmModalTitle.textContent = options.title || "确定继续？";
  confirmModalMessage.textContent = options.message || "这一步需要确认后才会执行。";
  confirmModalConfirmButton.textContent = options.confirmText || "确定";
  confirmModalConfirmButton.title = options.confirmTitle || options.confirmText || "确定";

  const preview = String(options.preview || "").trim();
  confirmModalPreview.hidden = !preview;
  confirmModalPreview.textContent = preview;

  confirmModal.hidden = false;
  confirmModalConfirmButton.focus();

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
  });
}

function openConfigModal() {
  if (!configModal) {
    return;
  }

  lastFocusedBeforeConfigModal = document.activeElement;
  syncConfigStatus();
  configModal.hidden = false;
  configModal.querySelector("[data-close-config]")?.focus?.();
}

function closeConfigModal(options = {}) {
  if (!configModal) {
    return;
  }

  const { restoreFocus = true } = options;
  configModal.hidden = true;
  if (restoreFocus) {
    lastFocusedBeforeConfigModal?.focus?.();
  }
  lastFocusedBeforeConfigModal = null;
}

function hasSavedBrowserConfig() {
  return forms.some((form) => Boolean(localStorage.getItem(storageKey(form.id)))) || Boolean(localStorage.getItem(engineStorageKey));
}

function readConfigProfiles() {
  try {
    const payload = JSON.parse(localStorage.getItem(configProfilesStorageKey) || "[]");
    return Array.isArray(payload) ? payload.filter((item) => item && typeof item === "object") : [];
  } catch (error) {
    return [];
  }
}

function writeConfigProfiles(profiles) {
  localStorage.setItem(configProfilesStorageKey, JSON.stringify(profiles));
  renderConfigProfiles();
}

function renderConfigProfiles() {
  if (!configProfileList) {
    return;
  }

  const profiles = readConfigProfiles();
  configProfileList.innerHTML = "";
  if (!profiles.length) {
    configProfileList.innerHTML = `<p class="config-profile-empty">还没有保存配置方案。</p>`;
    return;
  }

  profiles.forEach((profile) => {
    const item = document.createElement("div");
    item.className = "config-profile-item";
    const main = document.createElement("div");
    main.className = "config-profile-main";
    const title = document.createElement("strong");
    title.textContent = profile.name || "未命名方案";
    const meta = document.createElement("span");
    meta.textContent = `${getEngineLabel(profile.payload?.active_engine || "gpt-image-2")} · ${formatHistoryTime(profile.updated_at || profile.created_at)}`;
    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "config-profile-actions";
    const loadButton = document.createElement("button");
    loadButton.className = "ghost-button ghost-button-small";
    loadButton.type = "button";
    loadButton.textContent = "加载";
    loadButton.addEventListener("click", () => loadConfigProfile(profile.id));
    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button danger-button-small";
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => deleteConfigProfile(profile.id));
    actions.append(loadButton, deleteButton);

    item.append(main, actions);
    configProfileList.append(item);
  });
}

function getFormValue(form, name) {
  return String(form?.elements?.namedItem(name)?.value || "").trim();
}

function getCurrentConfigSummary() {
  const gptForm = document.getElementById("gpt-image-2-form");
  const bananaForm = document.getElementById("banana-form");
  const gptModel = getFormValue(gptForm, "model") || "未填写模型";
  const bananaModel = getFormValue(bananaForm, "model_type") || "未填写模型";
  const gptEndpoint = formatEndpoint(getFormValue(gptForm, "base_url")) || "未填写地址";
  const bananaEndpoint = formatEndpoint(getFormValue(bananaForm, "api_base_url")) || "未填写地址";
  const gptKeyReady = Boolean(getFormValue(gptForm, "api_key"));
  const bananaKeyReady = Boolean(getFormValue(bananaForm, "api_key"));
  const activeModel = activeConfigEngine === "banana" ? bananaModel : gptModel;
  const activeBase = activeConfigEngine === "banana" ? bananaEndpoint : gptEndpoint;
  const activeKeyState = activeConfigEngine === "banana" ? bananaKeyReady : gptKeyReady;
  const activeForm = activeConfigEngine === "banana" ? bananaForm : gptForm;
  const prompt = getPromptSnippet(activeForm);
  const suggestedName = [getEngineLabel(activeConfigEngine), activeModel || "默认模型"].filter(Boolean).join(" - ");
  return {
    activeEngineLabel: getEngineLabel(activeConfigEngine),
    gpt: {
      label: "GPT Image 2",
      model: gptModel,
      endpoint: gptEndpoint,
      keyState: gptKeyReady ? "API Key 已填写" : "API Key 未填写",
    },
    banana: {
      label: "Banana Gemini",
      model: bananaModel,
      endpoint: bananaEndpoint,
      keyState: bananaKeyReady ? "API Key 已填写" : "API Key 未填写",
    },
    active: {
      label: getEngineLabel(activeConfigEngine),
      model: activeModel,
      endpoint: activeBase,
      keyState: activeKeyState ? "API Key 已填写" : "API Key 未填写",
      prompt,
    },
    suggestedName,
  };
}

function renderConfigProfilePreview() {
  if (!configProfilePreview) {
    return;
  }
  const summary = getCurrentConfigSummary();
  configEngineButtons.forEach((button) => {
    const active = button.dataset.configEngine === activeConfigEngine;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (configGptModel) {
    configGptModel.textContent = summary.gpt.model;
  }
  if (configGptBase) {
    configGptBase.textContent = summary.gpt.endpoint;
  }
  if (configBananaModel) {
    configBananaModel.textContent = summary.banana.model;
  }
  if (configBananaBase) {
    configBananaBase.textContent = summary.banana.endpoint;
  }
  configProfilePreview.innerHTML = `
    <div class="config-preview-engine active">
      <span>${escapeHtml(summary.active.label)}</span>
      <strong>${escapeHtml(summary.active.model)}</strong>
      <em>${escapeHtml(summary.active.endpoint)}</em>
      <small>${escapeHtml(summary.active.keyState)}</small>
    </div>
  `;
  if (configProfileNameInput && !configProfileNameInput.value.trim()) {
    configProfileNameInput.placeholder = `建议：${summary.suggestedName}`;
  }
}

function saveConfigProfile() {
  const summary = getCurrentConfigSummary();
  const name = String(configProfileNameInput?.value || "").trim() || summary.suggestedName;
  if (!name) {
    setConfigFeedback("error", "先给配置方案起个名字。");
    configProfileNameInput?.focus?.();
    return;
  }

  const now = new Date().toISOString();
  const profiles = readConfigProfiles();
  const existingIndex = profiles.findIndex((profile) => String(profile.name || "").trim() === name);
  const nextProfile = {
    id: existingIndex >= 0 ? profiles[existingIndex].id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    created_at: existingIndex >= 0 ? profiles[existingIndex].created_at : now,
    updated_at: now,
    payload: buildConfigProfilePayload(),
    engine: activeConfigEngine,
  };
  if (existingIndex >= 0) {
    profiles[existingIndex] = nextProfile;
  } else {
    profiles.unshift(nextProfile);
  }
  writeConfigProfiles(profiles.slice(0, 30));
  configProfileNameInput.value = "";
  setConfigFeedback("success", `配置方案“${name}”已保存到当前浏览器。`);
}

function loadConfigProfile(profileId) {
  const profile = readConfigProfiles().find((item) => item.id === profileId);
  if (!profile?.payload) {
    setConfigFeedback("error", "没有找到这个配置方案。");
    return;
  }
  applyConfigPayload(profile.payload);
  setConfigFeedback("success", `已加载配置方案“${profile.name || "未命名方案"}”。`);
  setStatus("success", "配置方案已加载到表单。");
}

async function deleteConfigProfile(profileId) {
  const profiles = readConfigProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    renderConfigProfiles();
    return;
  }
  const confirmed = await requestThemeConfirm({
    title: "删除这个配置方案？",
    message: "只会删除浏览器里保存的方案，不影响当前表单和 config.local.json。",
    preview: profile.name || "未命名方案",
    confirmText: "删除方案",
    confirmTitle: "删除配置方案",
  });
  if (!confirmed) {
    return;
  }
  writeConfigProfiles(profiles.filter((item) => item.id !== profileId));
  setConfigFeedback("success", `配置方案“${profile.name || "未命名方案"}”已删除。`);
}

function syncConfigStatus() {
  renderConfigProfilePreview();
  renderConfigProfiles();
}

function setActiveConfigEngine(engine) {
  activeConfigEngine = engine === "banana" ? "banana" : "gpt-image-2";
  renderConfigProfilePreview();
}

function buildConfigPayload() {
  const connectionForms = Object.fromEntries(
    forms.map((form) => {
      const fullState = collectFormState(form);
      const connectionState = Object.fromEntries(
        Object.entries(fullState).filter(([key]) => connectionFieldNames.has(String(key).toLowerCase()))
      );
      return [form.id, connectionState];
    })
  );
  return {
    version: 1,
    active_engine: activeEngine,
    forms: connectionForms,
  };
}

function buildConfigProfilePayload() {
  const targetFormId = activeConfigEngine === "banana" ? "banana-form" : "gpt-image-2-form";
  return {
    version: 1,
    profile_kind: "connection",
    active_engine: activeConfigEngine,
    forms: Object.fromEntries(
      forms
        .filter((form) => form.id === targetFormId)
        .map((form) => {
        const fullState = collectFormState(form);
        const connectionState = Object.fromEntries(
          Object.entries(fullState).filter(([key]) => connectionFieldNames.has(String(key).toLowerCase()))
        );
        return [form.id, connectionState];
      })
    ),
  };
}

function applyConfigPayload(payload, { save = true } = {}) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const formPayloads =
    payload.forms && typeof payload.forms === "object"
      ? payload.forms
      : {
          "banana-form": payload["banana-form"] || payload.banana || {},
          "gpt-image-2-form": payload["gpt-image-2-form"] || payload["gpt-image-2"] || payload.gpt_image_2 || {},
        };

  forms.forEach((form) => {
    const formPayload = formPayloads[form.id];
    if (!formPayload || typeof formPayload !== "object") {
      return;
    }

    applyFormState(form, formPayload);
    updateFileSummary(form);
    renderReferencePreview(form);
    syncCustomSizeState(form);
    syncTimeoutState(form);
    syncParameterHints(form);
    syncConfigSections(form, { autoCollapse: true, forceOpenIfEmpty: true });
    if (save) {
      saveFormState(form);
    }
  });

  if (payload.active_engine) {
    setActiveEngine(payload.active_engine);
  }
}

function exportConfig() {
  const payload = {
    ...buildConfigPayload(),
    exported_at: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "image-generate-web-tool.config.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setStatus("success", "当前配置已经导出成 JSON。");
}

function clearLocalConfig() {
  forms.forEach((form) => {
    localStorage.removeItem(storageKey(form.id));
    form.reset();
    const referenceInput = form.querySelector('input[type="file"][data-limit]');
    if (referenceInput) {
      writeReferenceFiles(referenceInput, []);
    }
    updateFileSummary(form);
    renderReferencePreview(form);
    syncCustomSizeState(form);
    syncTimeoutState(form);
    syncParameterHints(form);
    syncConfigSections(form, { forceOpenIfEmpty: true });
  });

  localStorage.removeItem(engineStorageKey);
  setActiveEngine("gpt-image-2");
  syncConfigStatus();
  setStatus("success", "浏览器里的本地配置已经清空。");
}

async function importConfigFile(file) {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    applyConfigPayload(payload);
    setStatus("success", "JSON 配置已经导入。");
  } catch (error) {
    setStatus("error", `导入配置失败: ${error.message || error}`);
  }
}

async function loadConfigDefaults() {
  try {
    const response = await fetch("/api/config/defaults");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "读取配置失败");
    }

    applyConfigPayload(payload);
    const sourceText = Array.isArray(payload.sources) && payload.sources.length ? `已读取 ${payload.sources.join(" + ")}` : "没有找到环境变量或本地配置文件";
    if (configDefaultState) {
      configDefaultState.textContent = Array.isArray(payload.sources) && payload.sources.length ? payload.sources.join(" + ") : "未找到";
    }
    setStatus("success", `${sourceText}。`);
  } catch (error) {
    if (configDefaultState) {
      configDefaultState.textContent = "读取失败";
    }
    setStatus("error", error.message || "读取配置失败");
  }
}

function syncDroppedFiles(input, incomingFiles) {
  appendReferenceFiles(input, incomingFiles);
}

async function saveConfigFile(triggerButton = saveConfigFileButton) {
  const button = triggerButton || saveConfigFileButton;
  const previousText = button?.textContent || "保存到本地文件";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "保存中...";
    }
    setConfigFeedback("loading", "正在写入 web_tool/config.local.json...");
    const response = await fetch("/api/config/local-file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildConfigPayload()),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "保存本地配置失败");
    }
    setConfigFeedback("success", `已保存到 ${payload.path}`);
    setStatus("success", `配置已保存到本地文件。`);
  } catch (error) {
    setConfigFeedback("error", error.message || "保存本地配置失败");
    setStatus("error", error.message || "保存本地配置失败");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

configToggleRows.forEach((row) => {
  row.addEventListener("click", () => {
    const section = row.closest("[data-config-section]");
    if (section) {
      toggleConfigSection(section);
    }
  });

  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const section = row.closest("[data-config-section]");
    if (section) {
      toggleConfigSection(section);
    }
  });
});

engineButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveEngine(button.dataset.engineTab);
  });
});

forms.forEach((form) => {
  restoreFormState(form);
  renderReferencePreview(form);
  syncConfigSections(form, { autoCollapse: true, forceOpenIfEmpty: true });
  syncCustomSizeState(form);
  updateSizeSummary(form);
  updateApiSummary(form);
  syncTimeoutState(form);
  syncParameterHints(form);
  updateFormScrollState(form);
  getFormScrollRegion(form).addEventListener("scroll", () => updateFormScrollState(form), { passive: true });
  form.addEventListener("submit", submitForm);
  form.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-custom-size-width], [data-custom-size-height]")) {
      syncCustomSizeState(form);
    }
    saveFormState(form);
    syncConfigSections(form);
    syncTimeoutState(form);
    refreshFormScrollStates();
  });
  form.addEventListener("change", (event) => {
    saveFormState(form);
    updateFileSummary(form);
    renderReferencePreview(form);
    syncCustomSizeState(form);
    updateSizeSummary(form);
    updateApiSummary(form);
    syncTimeoutState(form);
    if (event.target?.tagName === "SELECT") {
      syncOptionHelp(event.target);
    }
    syncConfigSections(form, {
      autoCollapse: Boolean(event.target?.closest?.("[data-config-section]")),
      forceOpenIfEmpty: true,
    });
    refreshFormScrollStates();
  });
});

resetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    resetForm(button.dataset.resetForm);
  });
});

clearReferenceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const form = button.closest("form");
    const input = form?.querySelector?.('input[type="file"][data-limit]');
    if (input) {
      clearReferenceFiles(input);
    }
  });
});

fileInputs.forEach((input) => {
  const zone = input.closest(".upload-zone");
  if (!zone) {
    return;
  }

  getStoredReferenceFiles(input);

  input.addEventListener("change", () => {
    appendReferenceFiles(input, input.files);
  });

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragover");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-dragover");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragover");
    syncDroppedFiles(input, event.dataTransfer?.files);
  });
});

toggleSecretButtons.forEach((button) => {
  syncSecretToggle(button);
  button.addEventListener("click", () => toggleSecretInput(button));
});

if (openConfigModalButton) {
  openConfigModalButton.addEventListener("click", openConfigModal);
}

if (openHistoryModalButton) {
  openHistoryModalButton.addEventListener("click", openHistoryModal);
}

if (loadConfigDefaultsButton) {
  loadConfigDefaultsButton.addEventListener("click", loadConfigDefaults);
}

if (saveConfigQuickButton) {
  saveConfigQuickButton.addEventListener("click", () => saveConfigFile(saveConfigQuickButton));
}

closeConfigButtons.forEach((button) => {
  button.addEventListener("click", closeConfigModal);
});

closeHistoryButtons.forEach((button) => {
  button.addEventListener("click", closeHistoryModal);
});

if (refreshHistoryButton) {
  refreshHistoryButton.addEventListener("click", () => loadHistoryEntries());
}

historySearchInput?.addEventListener("input", () => renderHistoryList());
historyEngineFilter?.addEventListener("change", () => renderHistoryList());

document.addEventListener("click", (event) => {
  if (!openHistoryDeleteMenuId) {
    return;
  }
  if (event.target instanceof Element && event.target.closest(".history-item-actions")) {
    return;
  }
  closeHistoryDeleteMenu();
});

openSizeModalButtons.forEach((button) => {
  button.addEventListener("click", () => openSizeModal(button.closest("form")));
});

closeSizeModalButtons.forEach((button) => {
  button.addEventListener("click", closeSizeModal);
});

sizeModeButtons.forEach((button) => {
  button.addEventListener("click", () => setSizeModalMode(button.dataset.sizeMode));
});

sizeResolutionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSizeResolution = String(button.dataset.sizeResolution || "1024");
    updateSizeModalPreview();
  });
});

sizeRatioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSizeRatio = String(button.dataset.sizeRatio || "1:1");
    updateSizeModalPreview();
  });
});

[sizeModalWidth, sizeModalHeight].forEach((input) => {
  input?.addEventListener("input", updateSizeModalPreview);
  input?.addEventListener("change", updateSizeModalPreview);
});

sizeModalApplyButton?.addEventListener("click", applySizeModal);

openApiModalButtons.forEach((button) => {
  button.addEventListener("click", () => openApiModal(button.closest("form")));
});

closeApiModalButtons.forEach((button) => {
  button.addEventListener("click", closeApiModal);
});

[apiModalEndpoint, apiModalFormat].forEach((input) => {
  input?.addEventListener("input", updateApiModalPreview);
  input?.addEventListener("change", updateApiModalPreview);
});

apiModalApplyButton?.addEventListener("click", applyApiModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeHistoryDeleteMenu();
  }
});

if (exportConfigButton) {
  exportConfigButton.addEventListener("click", exportConfig);
}

if (clearLocalConfigButton) {
  clearLocalConfigButton.addEventListener("click", clearLocalConfig);
}

if (triggerImportConfigButton && importConfigInput) {
  triggerImportConfigButton.addEventListener("click", () => {
    importConfigInput.click();
  });
}

if (importConfigInput) {
  importConfigInput.addEventListener("change", async () => {
    await importConfigFile(importConfigInput.files?.[0]);
    importConfigInput.value = "";
  });
}

if (loadDefaultsModalButton) {
  loadDefaultsModalButton.addEventListener("click", loadConfigDefaults);
}

if (saveConfigFileButton) {
  saveConfigFileButton.addEventListener("click", () => saveConfigFile(saveConfigFileButton));
}

saveConfigProfileButton?.addEventListener("click", saveConfigProfile);
configProfileNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveConfigProfile();
  }
});
configEngineButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveConfigEngine(button.dataset.configEngine));
});

clearResultsButton.addEventListener("click", clearResults);
openResultDetailsButton?.addEventListener("click", openResultDetailsModal);
clearQueueButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  clearFinishedQueueJobs();
});
openOutputsFolderButton?.addEventListener("click", openOutputsFolder);
clearAssetsButton?.addEventListener("click", clearAssetHistory);

queuePanel?.addEventListener("click", (event) => {
  if (isInteractiveQueueTarget(event.target)) {
    return;
  }
  toggleQueueCollapsed();
});

queuePanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  if (isInteractiveQueueTarget(event.target) && event.target !== queuePanel) {
    return;
  }
  event.preventDefault();
  toggleQueueCollapsed();
});

window.addEventListener("resize", refreshFormScrollStates);

copyMetaButton.addEventListener("click", async () => {
  const text = lastMetaPayload ? JSON.stringify(lastMetaPayload, null, 2) : metaJson.textContent;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("success", "元数据已经复制到剪贴板。");
  } catch (error) {
    setStatus("error", "复制失败，可能是浏览器权限限制。");
  }
});

document.addEventListener("keydown", (event) => {
  if (confirmModal && !confirmModal.hidden) {
    const confirmCard = confirmModal.querySelector(".confirm-modal-card");
    if (trapFocusInContainer(event, confirmCard)) {
      return;
    }

    if (event.key === "Escape") {
      closeConfirmModal(false);
      return;
    }
  }

  if (sizeModal && !sizeModal.hidden) {
    const sizeCard = sizeModal.querySelector(".size-modal-card");
    if (trapFocusInContainer(event, sizeCard)) {
      return;
    }

    if (event.key === "Escape") {
      closeSizeModal();
      return;
    }
  }

  if (apiModal && !apiModal.hidden) {
    const apiCard = apiModal.querySelector(".api-modal-card");
    if (trapFocusInContainer(event, apiCard)) {
      return;
    }

    if (event.key === "Escape") {
      closeApiModal();
      return;
    }
  }

  if (imageLightbox && !imageLightbox.hidden) {
    const lightboxCard = imageLightbox.querySelector(".image-lightbox-card");
    if (trapFocusInContainer(event, lightboxCard)) {
      return;
    }

    if (handleLightboxKeyboard(event)) {
      return;
    }
  }

  if (resultDetailsModal && !resultDetailsModal.hidden) {
    const detailsCard = resultDetailsModal.querySelector(".details-modal-card");
    if (trapFocusInContainer(event, detailsCard)) {
      return;
    }
  }

  if (historyModal && !historyModal.hidden) {
    const historyCard = historyModal.querySelector(".history-modal-card");
    if (trapFocusInContainer(event, historyCard)) {
      return;
    }
  }

  if (configModal && !configModal.hidden) {
    const configCard = configModal.querySelector(".config-modal-card");
    if (trapFocusInContainer(event, configCard)) {
      return;
    }
  }

  if (event.key === "Escape" && imageLightbox && !imageLightbox.hidden) {
    closeLightbox();
    return;
  }

  if (event.key === "Escape" && resultDetailsModal && !resultDetailsModal.hidden) {
    closeResultDetailsModal();
    return;
  }

  if (event.key === "Escape" && historyModal && !historyModal.hidden) {
    closeHistoryModal();
    return;
  }

  if (event.key === "Escape" && configModal && !configModal.hidden) {
    closeConfigModal();
  }
});

closeDetailsModalButtons.forEach((button) => {
  button.addEventListener("click", closeResultDetailsModal);
});

cancelConfirmButtons.forEach((button) => {
  button.addEventListener("click", () => closeConfirmModal(false));
});

confirmModalConfirmButton?.addEventListener("click", () => closeConfirmModal(true));

closeLightboxButtons.forEach((button) => {
  button.addEventListener("click", closeLightbox);
});

lightboxZoomButtons.forEach((button) => {
  button.addEventListener("click", () => handleLightboxZoomAction(button.dataset.lightboxZoom));
});

imageLightboxStage?.addEventListener("wheel", handleLightboxWheel, { passive: false });
imageLightboxStage?.addEventListener("pointerdown", startLightboxDrag);
imageLightboxStage?.addEventListener("pointermove", moveLightboxDrag);
imageLightboxStage?.addEventListener("pointerup", endLightboxDrag);
imageLightboxStage?.addEventListener("pointercancel", endLightboxDrag);
imageLightboxStage?.addEventListener("dblclick", handleLightboxDoubleClick);
imageLightboxImage?.addEventListener("load", resetLightboxZoom);

window.addEventListener("beforeunload", () => {
  revokeObjectUrls();
  forms.forEach((form) => revokeReferencePreview(form));
});

clearResults();
renderQueue();
renderAssetHistory();
setActiveEngine(localStorage.getItem(engineStorageKey) || activeEngine);
syncConfigStatus();
