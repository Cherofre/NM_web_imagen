import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");

function cssBlock(selector) {
  const escaped = selector
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

function mediaBlock(query) {
  const start = css.indexOf(`@media (${query})`);
  assert.notEqual(start, -1, `Missing media query ${query}`);
  const next = css.indexOf("@media", start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

function cssBlockIn(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test("text settings actions keep their button on one line and expose focus styling", () => {
  assert.match(cssBlock(".composer"), /--composer-prompt-height:\s*148px;[\s\S]*grid-template-rows:\s*auto minmax\(0, var\(--composer-prompt-height\)\);/);
  assert.match(cssBlock(".composer-top"), /display:\s*grid;[\s\S]*gap:\s*8px;[\s\S]*min-height:\s*0;/);
  assert.match(appSource, /<div className="composer-top">\s*\{references\.length > 0 && \(/);
  assert.match(appSource, /<\/div>\s*<button\s+type="button"\s+className="composer-resize-handle"/);
  assert.match(cssBlock(".composer-input"), /align-items:\s*stretch;[\s\S]*min-height:\s*0;/);
  assert.match(cssBlock(".composer-resize-handle"), /position:\s*absolute;[\s\S]*top:\s*-9px;[\s\S]*right:\s*18px;[\s\S]*cursor:\s*ns-resize;/);
  assert.match(cssBlock(".composer-textarea-wrap"), /height:\s*100%;[\s\S]*min-height:\s*118px;/);
  assert.doesNotMatch(cssBlock(".composer-textarea-wrap"), /max-height:/);
  assert.match(cssBlock(".composer-prompt-actions"), /position:\s*absolute;[\s\S]*bottom:\s*12px;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(cssBlock(".session-prompt-button"), /grid-template-columns:\s*auto minmax\(0, 1fr\);[\s\S]*min-height:\s*36px;/);
  assert.match(cssBlock(".session-prompt-button-summary"), /text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(cssBlock(".composer-textarea-wrap"), /resize:\s*vertical;/);
  assert.match(cssBlock(".composer-input textarea"), /width:\s*100%;/);
  assert.match(cssBlock(".composer-input textarea"), /height:\s*100%;/);
  assert.match(cssBlock(".composer-reset-button"), /position:\s*absolute;[\s\S]*top:\s*12px;[\s\S]*right:\s*18px;[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;/);
  assert.match(cssBlock(".submit-button"), /grid-row:\s*1;[\s\S]*align-self:\s*end;/);
  assert.match(cssBlock(".drawer-actions"), /justify-content:\s*flex-end;/);
  assert.match(cssBlock(".session-prompt-drawer"), /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(css, /\.composer-top-actions\s*\{/);
  assert.doesNotMatch(css, /\.session-prompt-pill\s*\{/);
  assert.doesNotMatch(css, /\.composer-textarea-meta\s*\{/);
});

test("release package keeps previous hashed assets as cache fallbacks", () => {
  const assetsDir = path.resolve("..", "static", "studio", "assets");
  assert.ok(fs.existsSync(path.join(assetsDir, "index-8pzV_2va.css")));
  assert.ok(fs.existsSync(path.join(assetsDir, "index-BiyMHVvw.js")));
  assert.ok(fs.existsSync(path.join(assetsDir, "index-D6wyuxyS.css")));
  assert.ok(fs.existsSync(path.join(assetsDir, "index-DjJyEBb1.js")));
});

test("floating tooltip uses stronger readable styling", () => {
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*background:\s*rgba\(17, 17, 17, 0\.96\);/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*color:\s*#f8fafc;/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*font-size:\s*13px;/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[\s\S]*font-weight:\s*700;/);
  assert.match(cssBlock(".inline-tooltip"), /position:\s*fixed;/);
  assert.match(cssBlock(".inline-tooltip.top"), /transform:\s*translate\(-50%, calc\(-100% \+ 4px\)\);/);
});

test("advanced parameter toggles align to input height without stretching", () => {
  assert.match(cssBlock(".settings-grid"), /align-items:\s*start;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*align-self:\s*end;[\s\S]*height:\s*42px;[\s\S]*min-height:\s*42px;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*box-sizing:\s*border-box;/);
});

test("queue entry floats as a glass capsule without pushing conversation layout", () => {
  assert.match(cssBlock(".queue-anchor"), /height:\s*0;[\s\S]*pointer-events:\s*none;/);
  assert.match(cssBlock(".queue-capsule"), /position:\s*absolute;[\s\S]*right:\s*0;[\s\S]*min-height:\s*32px;[\s\S]*border-radius:\s*999px;[\s\S]*background:\s*rgba\(72, 76, 84, 0\.54\);[\s\S]*backdrop-filter:\s*blur\(20px\) saturate\(1\.35\);/);
  assert.match(cssBlock(".queue-capsule"), /pointer-events:\s*auto;/);
  assert.doesNotMatch(cssBlock(".queue-capsule"), /background:\s*rgba\(255, 255, 255, 0\.78\)/);
  assert.match(cssBlock(".queue-capsule::before"), /content:\s*"";[\s\S]*inset:\s*1px;[\s\S]*border-radius:\s*inherit;[\s\S]*background:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.24\), rgba\(255, 255, 255, 0\.04\)\);/);
  assert.match(cssBlock(".queue-capsule.active"), /animation:\s*queue-capsule-breathe 2\.4s ease-in-out infinite;/);
  assert.match(css, /@keyframes queue-capsule-breathe[\s\S]*0%[\s\S]*100%[\s\S]*box-shadow:[\s\S]*50%[\s\S]*box-shadow:/);
  assert.match(cssBlock(".queue-capsule-label"), /letter-spacing:\s*0;/);
  assert.match(cssBlock(".queue-capsule-count"), /background:\s*rgba\(255, 255, 255, 0\.2\);/);
  assert.match(cssBlock(".queue-capsule-dot"), /width:\s*7px;[\s\S]*height:\s*7px;[\s\S]*background:\s*#2563eb;[\s\S]*box-shadow:\s*0 0 0 5px rgba\(37, 99, 235, 0\.12\);/);
  assert.match(cssBlock(".queue-capsule-dot.done"), /background:\s*rgba\(34, 197, 94, 0\.72\);/);
  assert.match(cssBlock(".queue-popover"), /position:\s*absolute;[\s\S]*top:\s*44px;[\s\S]*right:\s*0;[\s\S]*pointer-events:\s*auto;/);
  assert.match(appSource, /const QUEUE_POPOVER_DEFAULT_WIDTH = 366;/);
  assert.match(appSource, /const QUEUE_POPOVER_DEFAULT_HEIGHT = 310;/);
  assert.match(appSource, /function clampQueuePopoverSize\(width: number, height: number\)/);
  assert.match(appSource, /const \[queuePopoverSize, setQueuePopoverSize\]/);
  assert.match(appSource, /const queuePopoverStyle: CSSProperties = \{[\s\S]*"--queue-popover-width": `\$\{queuePopoverSize\.width\}px`,[\s\S]*"--queue-popover-height": `\$\{queuePopoverSize\.height\}px`,/);
  assert.match(cssBlock(".queue-popover"), /grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*width:\s*min\(var\(--queue-popover-width, 366px\), calc\(100vw - 52px\)\);[\s\S]*height:\s*min\(var\(--queue-popover-height, 310px\), calc\(100vh - 240px\)\);[\s\S]*overflow:\s*hidden;/);
  assert.match(cssBlock(".queue-popover"), /background:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.96\), rgba\(248, 250, 252, 0\.92\)\);[\s\S]*backdrop-filter:\s*blur\(22px\) saturate\(1\.18\);/);
  assert.match(cssBlock(".queue-popover::before"), /content:\s*"";[\s\S]*height:\s*58px;[\s\S]*background:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.68\), rgba\(255, 255, 255, 0\)\);/);
  assert.match(cssBlock(".queue-popover-head"), /position:\s*relative;[\s\S]*z-index:\s*1;[\s\S]*padding:\s*2px 2px 10px;/);
  assert.match(cssBlock(".queue-popover-head h3"), /font-size:\s*18px;/);
  assert.match(cssBlock(".queue-job-icon"), /border-radius:\s*999px;/);
  assert.match(cssBlock(".queue-job-thumb"), /width:\s*44px;[\s\S]*height:\s*44px;/);
  assert.match(cssBlock(".queue-list"), /gap:\s*8px;[\s\S]*align-content:\s*start;[\s\S]*grid-auto-rows:\s*max-content;[\s\S]*min-height:\s*0;[\s\S]*padding:\s*10px 2px 14px;[\s\S]*overflow:\s*auto;[\s\S]*border-top:\s*1px solid rgba\(148, 163, 184, 0\.16\);/);
  assert.match(css, /\.queue-job\s*\{[\s\S]*position:\s*relative;[\s\S]*padding:\s*9px 10px 9px 12px;[\s\S]*border:\s*1px solid rgba\(148, 163, 184, 0\.18\);[\s\S]*border-radius:\s*14px;[\s\S]*background:\s*rgba\(255, 255, 255, 0\.66\);/);
  assert.match(cssBlock(".queue-job-main-button strong,\n.queue-job-main-button span"), /display:\s*block;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
  assert.match(cssBlock(".queue-job::before"), /content:\s*"";[\s\S]*left:\s*0;[\s\S]*width:\s*3px;[\s\S]*background:\s*rgba\(148, 163, 184, 0\.45\);/);
  assert.match(cssBlock(".queue-job.running::before"), /background:\s*#2563eb;/);
  assert.match(cssBlock(".queue-job.error::before"), /background:\s*#ef4444;/);
  assert.match(appSource, /className="queue-popover-resize-handle"/);
  assert.match(appSource, /onPointerDown=\{startQueuePopoverResize\}/);
  assert.match(appSource, /onPointerMove=\{dragQueuePopoverResize\}/);
  assert.match(appSource, /onPointerUp=\{endQueuePopoverResize\}/);
  assert.match(cssBlock(".queue-popover-resize-handle"), /position:\s*absolute;[\s\S]*bottom:\s*6px;[\s\S]*left:\s*6px;[\s\S]*z-index:\s*3;[\s\S]*cursor:\s*nesw-resize;/);
  assert.match(appSource, /<h3>\{t\("queue\.title"\)\}<\/h3>/);
  assert.match(appSource, /function queueJobTitle\(job: QueueJob, fallback: string\)/);
  assert.match(appSource, /const jobTitle = queueJobTitle\(job, t\("queue\.unnamed"\)\);/);
  assert.ok(appSource.includes('const jobMeta = [job.configName, job.model].filter(Boolean).join(" / ");'));
  assert.match(appSource, /const jobElapsed = job\.elapsedSeconds \? \(language === "en" \? `\$\{Math\.round\(job\.elapsedSeconds\)\}s` : `\$\{Math\.round\(job\.elapsedSeconds\)\} 秒`\) : "";/);
  assert.match(appSource, /<strong>\{jobTitle\}<\/strong>/);
  assert.ok(appSource.includes('<span>{job.status === "queued" ? `${jobMeta} · ${t("queue.queued")}` : jobElapsed ? `${jobMeta} · ${jobElapsed}` : jobMeta}</span>'));
  assert.match(appSource, /t\("queue\.waiting"\)/);
  assert.match(appSource, /compactInlineText\(job\.prompt, 24\) \|\| fallback/);
  assert.doesNotMatch(appSource, /<strong>生成图片<\/strong>/);
  assert.doesNotMatch(appSource, /job\.status === "running" \? "生成中"/);
  assert.doesNotMatch(appSource, /job\.status === "error" \? "失败"/);
  assert.doesNotMatch(appSource, /<small>\{Math\.round\(job\.elapsedSeconds\)\} 秒<\/small>/);
  assert.match(appSource, /className=\{jobImages\.length > 1 \? "queue-job-thumb multi" : "queue-job-thumb"\}/);
  assert.match(appSource, /className="queue-job-main-button"/);
  assert.match(appSource, /onClick=\{\(\) => jumpToQueueJob\(job\)\}/);
  assert.match(appSource, /className="queue-capsule-label">\{t\("queue\.label"\)\}/);
  assert.match(appSource, /className="queue-capsule-count">\{queueJobs\.length\}/);
  assert.match(appSource, /className=\{`queue-capsule \$\{activeQueueCount \? "active" : ""\}`\.trim\(\)\}/);
  assert.match(appSource, /className=\{runningQueueCount \? "queue-capsule-dot running" : "queue-capsule-dot done"\}/);
  assert.doesNotMatch(appSource.slice(appSource.indexOf('className="queue-capsule"'), appSource.indexOf("</button>", appSource.indexOf('className="queue-capsule"'))), /ChevronDown|queue-capsule-state|Loader2/);
});

test("queue rows expose cancel retry apply and remove controls", () => {
  assert.match(appSource, /function cancelQueueJob\(job: QueueJob\)/);
  assert.match(appSource, /function retryQueueJob\(job: QueueJob\)/);
  assert.match(appSource, /function applyQueueJob\(job: QueueJob\)/);
  assert.match(appSource, /function removeQueueJob\(job: QueueJob\)/);
  assert.match(appSource, /if \(job\.status === "queued" \|\| job\.status === "running"\) \{[\s\S]*cancelQueueJob\(job\);/);
  assert.match(appSource, /queueAbortControllersRef/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.cancel"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.retry"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.applyPrompt"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.remove"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(cssBlock(".queue-job-actions"), /display:\s*flex;[\s\S]*gap:\s*4px;/);
  assert.match(cssBlock(".queue-job-actions button"), /width:\s*26px;[\s\S]*height:\s*26px;/);
});

test("queue rows show multi-image results as a thumbnail collage", () => {
  assert.match(appSource, /type PreviewImage = \{[\s\S]*gallery\?: PreviewImage\[\];[\s\S]*galleryIndex\?: number;/);
  assert.match(appSource, /function openPreviewImages\(images: GeneratedImage\[\], index = 0\)/);
  assert.match(appSource, /function shiftPreviewImage\(direction: -1 \| 1\)/);
  assert.match(appSource, /const jobImages = job\.images \|\| \[\];/);
  assert.match(appSource, /const previewImages = jobImages\.slice\(0, 4\);/);
  assert.match(appSource, /className=\{jobImages\.length > 1 \? "queue-job-thumb multi" : "queue-job-thumb"\}/);
  assert.match(appSource, /onClick=\{\(\) => openPreviewImages\(jobImages\)\}/);
  assert.match(appSource, /previewImages\.map\(\(image, index\) =>/);
  assert.match(appSource, /jobImages\.length > 1 && <span className="queue-job-thumb-count">\{language === "en" \? `\$\{jobImages\.length\}` : `\$\{jobImages\.length\} 张`\}<\/span>/);
  assert.match(appSource, /previewImage\.gallery && previewImage\.gallery\.length > 1/);
  assert.match(appSource, /function handlePreviewKeyDown\(event: KeyboardEvent<HTMLDivElement>\)/);
  assert.match(appSource, /window\.addEventListener\("keydown", onPreviewKeyDown\)/);
  assert.match(appSource, /event\.key === "ArrowLeft"[\s\S]*shiftPreviewImage\(-1\)/);
  assert.match(appSource, /event\.key === "ArrowRight"[\s\S]*shiftPreviewImage\(1\)/);
  assert.match(appSource, /onKeyDown=\{handlePreviewKeyDown\}/);
  assert.match(appSource, /aria-label=\{t\("preview\.previous"\)\}/);
  assert.match(appSource, /aria-label=\{t\("preview\.next"\)\}/);
  assert.match(cssBlock(".queue-job-thumb.multi"), /display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(cssBlock(".queue-job-thumb-count"), /position:\s*absolute;[\s\S]*right:\s*3px;[\s\S]*bottom:\s*3px;/);
  assert.match(cssBlock(".lightbox-gallery-button"), /position:\s*absolute;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/);
  assert.match(cssBlock(".lightbox-gallery-button.previous"), /left:\s*14px;/);
  assert.match(cssBlock(".lightbox-gallery-button.next"), /right:\s*14px;/);
});

test("queue jobs persist in browser storage across refreshes", () => {
  assert.match(appSource, /queueStorageKey/);
  assert.match(appSource, /if \(Array\.isArray\(fallback\)\) \{/);
  assert.match(appSource, /return \(Array\.isArray\(parsed\) \? parsed : fallback\) as T;/);
  assert.match(appSource, /normalizeStoredQueueJobs\(loadJson\(queueStorageKey, \[\]\)\)/);
  assert.match(appSource, /serializeQueueJobs\(queueJobs\)/);
  assert.match(appSource, /localStorage\.setItem\(queueStorageKey, serializeQueueJobs\(queueJobs\)\)/);
});

test("generation queue does not block additional generation submissions", () => {
  const chatBranchStart = appSource.indexOf('if (currentMode === "chat")');
  const generateBranchStart = appSource.indexOf("let submitGptForm = currentGptForm", chatBranchStart);
  const submitEnd = appSource.indexOf("async function openOutputs", generateBranchStart);
  assert.notEqual(chatBranchStart, -1, "Missing chat branch");
  assert.notEqual(generateBranchStart, -1, "Missing generation branch");
  assert.notEqual(submitEnd, -1, "Missing submit end marker");
  assert.match(appSource.slice(chatBranchStart, generateBranchStart), /setBusy\(true\)/);
  assert.doesNotMatch(appSource.slice(generateBranchStart, submitEnd), /setBusy\(true\)/);
  assert.match(appSource, /disabled=\{busy\}/);
});

test("multi-image count is prominent and asks for confirmation", () => {
  assert.match(appSource, /skipMultiImageConfirm\?: boolean;/);
  assert.match(appSource, /const \[pendingMultiImageConfirm, setPendingMultiImageConfirm\]/);
  assert.match(appSource, /function generationCountFor\(engine: Engine, gpt: GptForm, banana: BananaForm\)/);
  assert.match(appSource, /function currentCountLabel\(\)[\s\S]*return t\("composer\.count", \{ count: generationCountFor\(activeEngine, gptForm, bananaForm\) \}\);/);
  assert.match(appSource, /function confirmMultiImageGeneration\(\)/);
  assert.match(appSource, /function resetMultiImageCount\(\)/);
  assert.match(appSource, /if \(currentMode !== "chat"\) \{[\s\S]*if \(generationCount > 1 && !overrides\.skipMultiImageConfirm/);
  assert.match(appSource, /t\("multiImage\.title", \{ count: pendingMultiImageConfirm\.count \}\)/);
  assert.match(appSource, /t\("multiImage\.warning"\)/);
  assert.match(appSource, /t\("multiImage\.confirm", \{ count: pendingMultiImageConfirm\.count \}\)/);
  assert.match(appSource, /t\("multiImage\.reset"\)/);
  assert.match(appSource, /t\("multiImage\.skipThisSession"\)/);
  assert.match(appSource, /className=\{`count-trigger \$\{generationCountFor\(activeEngine, gptForm, bananaForm\) > 1 \? "count-trigger-alert" : ""\} \$\{composerPopover === "count" \? "active" : ""\}`\.trim\(\)\}/);
  assert.match(cssBlock(".composer-toolbar button.count-trigger"), /gap:\s*6px;/);
  assert.match(cssBlock(".composer-toolbar button.count-trigger-alert"), /background:\s*#111;[\s\S]*color:\s*#fff;/);
  assert.match(css, /\.multi-image-confirm-drawer\s*\{[\s\S]*max-width:\s*420px;/);
});

test("config drawer exposes an obvious add-profile action", () => {
  assert.match(appSource, /function addConfigProfile\(\)/);
  assert.match(appSource, /className="profile-add-button"/);
  assert.match(appSource, /\{t\("config\.add"\)\}/);
  assert.match(cssBlock(".profile-add-button"), /border-style:\s*dashed;/);
  assert.match(cssBlock(".profile-add-button"), /min-height:\s*42px;/);
});

test("config drawer exposes a guarded delete-profile action", () => {
  assert.match(appSource, /function deleteConfigProfile\(profile: ConfigProfile\)/);
  assert.match(appSource, /className=\{selected \? "profile-row selected" : "profile-row"\}/);
  assert.match(appSource, /className="profile-delete-button"/);
  assert.match(appSource, /aria-label=\{t\("config\.deleteProfileAria", \{ name: profile\.name \|\| t\("queue\.unnamed"\) \}\)\}/);
  assert.match(appSource, /title=\{canDeleteProfile \? t\("config\.delete"\) : t\("config\.keepOne"\)\}/);
  assert.match(appSource, /disabled=\{!canDeleteProfile\}/);
  assert.match(cssBlock(".profile-row"), /grid-template-columns:\s*minmax\(0, 1fr\) 30px;/);
  assert.match(cssBlock(".profile-delete-button"), /width:\s*30px;[\s\S]*height:\s*30px;[\s\S]*border:\s*0;/);
  assert.match(cssBlock(".profile-delete-button:hover:not(:disabled)"), /color:\s*#b91c1c;/);
});

test("config drawer exposes separate generation and chat diagnostics", () => {
  assert.match(appSource, /type DiagnosticCapability = "generation" \| "chat";/);
  assert.match(appSource, /async function runDiagnostics\(\)/);
  assert.match(appSource, /function closeConnectionDrawer\(\)/);
  assert.match(appSource, /setDiagnosticsResult\(null\);[\s\S]*setConnectionOpen\(false\);/);
  assert.match(appSource, /function clearDiagnosticsResult\(\)/);
  assert.match(appSource, /selectConfigProfile\(profile: ConfigProfile\)[\s\S]*clearDiagnosticsResult\(\);/);
  assert.match(appSource, /fetch\("\/api\/diagnostics"/);
  assert.match(appSource, /t\("config\.testConnection"\)/);
  assert.match(appSource, /className=\{diagnosticsResult\.ok \? "diagnostics-panel ok" : "diagnostics-panel warning"\}/);
  assert.match(appSource, /diagnosticsResult\.results\.map\(\(item\) =>/);
  assert.match(appSource, /item\.capability === "generation" \? t\("config\.generation"\) : t\("config\.chat"\)/);
  assert.match(appSource, /diagnosticsResult\.warning/);
  assert.match(cssBlock(".diagnostics-panel"), /display:\s*grid;[\s\S]*gap:\s*10px;/);
  assert.match(cssBlock(".diagnostics-grid"), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(cssBlock(".diagnostics-card"), /border-radius:\s*12px;/);
  assert.match(cssBlock(".diagnostics-card.ok"), /border-color:\s*rgba\(8, 116, 67, 0\.22\);/);
  assert.match(cssBlock(".diagnostics-card.warning"), /border-color:\s*rgba\(185, 28, 28, 0\.22\);/);
});

test("image previews expose download and canvas zoom controls", () => {
  assert.match(appSource, /<a href=\{previewImage\.src\} download=\{previewImage\.name\}/);
  assert.match(appSource, /<div className="lightbox-zoom-tools" aria-label=\{t\("preview\.zoomControls"\)\}>/);
  assert.match(appSource, /aria-label=\{t\("preview\.zoomIn"\)\}/);
  assert.match(appSource, /aria-label=\{t\("preview\.zoomOut"\)\}/);
  assert.match(appSource, /title=\{t\("preview\.fit"\)\}/);
  assert.match(appSource, /title=\{t\("preview\.original"\)\}/);
  const headerStart = appSource.indexOf("<a href={previewImage.src} download={previewImage.name}");
  const headerEnd = appSource.indexOf("</span>", headerStart);
  assert.notEqual(headerStart, -1, "Missing preview header action area");
  assert.notEqual(headerEnd, -1, "Missing preview header action close");
  assert.doesNotMatch(appSource.slice(headerStart, headerEnd), /aria-label="缩小图片"|aria-label="放大图片"|title="适配窗口"|title="原始大小"/);
  assert.match(cssBlock(".lightbox-zoom-tools"), /position:\s*absolute;[\s\S]*right:\s*14px;[\s\S]*bottom:\s*14px;/);
  assert.match(cssBlock(".lightbox-stage"), /overflow:\s*hidden;[\s\S]*cursor:\s*zoom-in;/);
  assert.match(cssBlock(".lightbox-stage img"), /scale\(var\(--preview-zoom, 1\)\);/);
});

test("image preview canvas supports wheel zoom and drag panning", () => {
  assert.match(appSource, /const \[previewPan, setPreviewPan\] = useState\(\{ x: 0, y: 0 \}\);/);
  assert.match(appSource, /function handlePreviewWheel\(event: WheelEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function startPreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function movePreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function endPreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /onWheel=\{handlePreviewWheel\}/);
  assert.match(appSource, /onPointerDown=\{startPreviewPan\}/);
  assert.match(appSource, /onDoubleClick=\{resetPreviewCanvas\}/);
  assert.match(appSource, /"--preview-pan-x": `\$\{previewPan\.x\}px`/);
  assert.match(appSource, /"--preview-pan-y": `\$\{previewPan\.y\}px`/);
  assert.match(cssBlock(".lightbox-stage.is-zoomed"), /cursor:\s*grab;/);
  assert.match(cssBlock(".lightbox-stage.is-dragging"), /cursor:\s*grabbing;/);
  assert.match(cssBlock(".lightbox-stage img"), /translate3d\(var\(--preview-pan-x, 0px\), var\(--preview-pan-y, 0px\), 0\) scale\(var\(--preview-zoom, 1\)\);/);
});

test("save-like actions are visually primary and clear", () => {
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*border-color:\s*rgba\(17, 17, 17, 0\.32\);[\s\S]*background:\s*#111;/);
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*color:\s*#fff;/);
  assert.doesNotMatch(appSource, /清空 GPT 辅助项/);
  assert.match(appSource, /t\("sessionPrompt\.clearGpt"\)/);
});

test("narrow layout keeps sessions as a left drawer and pins composer to the bottom", () => {
  const tablet = mediaBlock("max-width: 920px");
  const phone = mediaBlock("max-width: 560px");
  assert.match(appSource, /const SIDEBAR_NARROW_QUERY = "\(max-width: 920px\)";/);
  assert.match(appSource, /function shouldStartHistoryCollapsed\(\)[\s\S]*window\.matchMedia\(SIDEBAR_NARROW_QUERY\)\.matches/);
  assert.match(appSource, /const \[historyCollapsed, setHistoryCollapsed\] = useState\(\(\) => shouldStartHistoryCollapsed\(\)\);/);
  assert.match(appSource, /const media = window\.matchMedia\(SIDEBAR_NARROW_QUERY\);[\s\S]*if \(event\.matches\) \{[\s\S]*setHistoryCollapsed\(true\);/);
  assert.match(appSource, /className="history-sidebar-backdrop"/);
  assert.match(appSource, /aria-label=\{t\("app\.closeSidebar"\)\}/);
  assert.match(appSource, /onClick=\{\(\) => setHistoryCollapsed\(true\)\}/);
  assert.match(cssBlock(".history-sidebar-backdrop"), /display:\s*none;/);
  assert.match(cssBlockIn(tablet, ".history-sidebar-backdrop"), /position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*40;[\s\S]*display:\s*block;[\s\S]*background:\s*rgba\(28, 25, 23, 0\.14\);/);
  assert.match(cssBlockIn(tablet, ".history-sidebar"), /position:\s*fixed;[\s\S]*left:\s*10px;[\s\S]*bottom:\s*10px;[\s\S]*width:\s*min\(300px, calc\(100vw - 56px\)\);/);
  assert.match(cssBlockIn(tablet, ".composer"), /position:\s*sticky;[\s\S]*bottom:\s*0;/);
  assert.match(cssBlockIn(tablet, ".composer-toolbar"), /flex-wrap:\s*wrap;[\s\S]*overflow-y:\s*visible;/);
  assert.doesNotMatch(cssBlockIn(tablet, ".composer-toolbar"), /overflow-y:\s*auto;/);
  assert.match(cssBlockIn(phone, ".history-sidebar"), /width:\s*min\(284px, calc\(100vw - 54px\)\);/);
  assert.match(cssBlockIn(phone, ".composer-input textarea"), /padding-bottom:\s*98px;/);
  assert.match(cssBlockIn(phone, ".composer-prompt-actions"), /grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*gap:\s*6px;[\s\S]*align-items:\s*stretch;/);
  assert.match(cssBlockIn(phone, ".prompt-expand-button"), /justify-self:\s*end;[\s\S]*min-height:\s*32px;/);
  assert.match(appSource, /className="session-prompt-label-full">\{t\("composer\.sessionPrompt"\)\}/);
  assert.match(appSource, /className="session-prompt-label-short">\{t\("composer\.sessionPromptShort"\)\}/);
  assert.match(appSource, /className="session-prompt-summary-full">\{sessionPromptSummary \|\| t\("composer\.sessionPromptUnset"\)\}/);
  assert.match(appSource, /className="session-prompt-summary-short">\{sessionPromptSummary \|\| t\("composer\.sessionPromptUnsetShort"\)\}/);
  assert.match(cssBlock(".session-prompt-label-short,\n.session-prompt-summary-short"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".session-prompt-label-full,\n  .session-prompt-summary-full"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".session-prompt-label-short,\n  .session-prompt-summary-short"), /display:\s*inline;/);
  assert.match(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPrompt"\)\}/);
  assert.match(appSource, /className="prompt-expand-label-short">\{t\("composer\.expandPromptShort"\)\}/);
  assert.match(cssBlock(".prompt-expand-label-short"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".prompt-expand-label-full"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".prompt-expand-label-short"), /display:\s*inline;/);
  assert.match(cssBlockIn(phone, ".composer-input"), /grid-template-columns:\s*minmax\(0, 1fr\) 52px;/);
  assert.match(cssBlockIn(phone, ".submit-button"), /grid-column:\s*2;[\s\S]*width:\s*52px;/);
});
