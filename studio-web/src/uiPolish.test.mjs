import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");

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
  const escaped = selector
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*");
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
  assert.ok(fs.existsSync(path.join(assetsDir, "index-Dr4xysUg.css")));
  assert.ok(fs.existsSync(path.join(assetsDir, "index-CnP0RvwW.js")));
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
  assert.match(appSource, /const queueCancellationSettlementsRef = useRef<Map<string, Promise<unknown>>>\(new Map\(\)\);/);
  assert.match(appSource, /const pendingQueueRemovalsRef = useRef<Map<string, Promise<void>>>\(new Map\(\)\);/);
  assert.match(appSource, /return cancelJobThenRemove\(\{[\s\S]*settle:\s*\(\) => settleQueueJobCancellation\(job\),/);
  assert.match(appSource, /queueAbortControllersRef/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.cancel"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.retry"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.applyPrompt"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(appSource, /aria-label=\{`\$\{t\("queue\.remove"\)\} \$\{job\.prompt \|\| t\("submit\.generate"\)\}`\}/);
  assert.match(cssBlock(".queue-job-actions"), /display:\s*flex;[\s\S]*gap:\s*4px;/);
  assert.match(cssBlock(".queue-job-actions button"), /width:\s*26px;[\s\S]*height:\s*26px;/);
});

test("clear completed queue jobs reuses removal settlement and runtime cleanup", () => {
  assert.match(appSource, /function clearQueueJobRuntime\(jobId: string\)[\s\S]*queueCancellationSettlementsRef\.current\.delete\(jobId\);[\s\S]*pendingQueueRemovalsRef\.current\.delete\(jobId\);[\s\S]*cancelingQueueJobsRef\.current\.delete\(jobId\);[\s\S]*delete queueAbortControllersRef\.current\[jobId\];[\s\S]*delete queuePayloadsRef\.current\[jobId\];/);
  assert.match(appSource, /function removeQueueJob\(job: QueueJob\)[\s\S]*return cancelJobThenRemove\(\{[\s\S]*remove:\s*\(\) => \{[\s\S]*clearQueueJobRuntime\(jobId\);[\s\S]*setQueueJobs\(\(items\) => items\.filter\(\(item\) => item\.id !== jobId\)\);/);
  assert.match(appSource, /function clearCompletedQueueJobs\(\)[\s\S]*void removeCompletedQueueJobs\(queueJobs, removeQueueJob\);/);
  assert.match(appSource, /onClick=\{clearCompletedQueueJobs\}>\{t\("queue\.clearCompleted"\)\}<\/button>/);
  assert.match(appSource, /onClick=\{\(\) => void removeQueueJob\(job\)\}/);
  assert.doesNotMatch(appSource, /onClick=\{\(\) => setQueueJobs\(\(items\) => items\.filter\(\(job\) => job\.status === "queued" \|\| job\.status === "running"\)\)\}/);
});

test("queue and chat requests share backend job cancellation protocol", () => {
  assert.match(appSource, /import \{ appendJobId, cancelJobThenRemove, cancellationNotice, cancelJobUrl, removeCompletedQueueJobs, settleQueueCancellation, withJobId \} from "\.\/jobProtocol";/);
  assert.match(appSource, /function createFormData\([\s\S]*jobId: string,[\s\S]*return appendJobId\(data, jobId\);/);
  assert.match(appSource, /function createChatPayload\([\s\S]*jobId: string,[\s\S]*return withJobId\(/);
  assert.match(appSource, /createFormData\([\s\S]*payload\.posterText,[\s\S]*payload\.jobId,[\s\S]*\)/);
  assert.match(appSource, /createChatPayload\([\s\S]*chatContextMessages,[\s\S]*queueJobId,[\s\S]*\)/);

  const cancelStart = appSource.indexOf("async function cancelQueueJob(job: QueueJob)");
  const cancelEnd = appSource.indexOf("function retryQueueJob", cancelStart);
  const cancelSource = appSource.slice(cancelStart, cancelEnd);
  assert.notEqual(cancelStart, -1, "cancelQueueJob must be async");
  assert.match(appSource, /function settleQueueJobCancellation\(job: QueueJob\)[\s\S]*return settleQueueCancellation\(\{/);
  assert.match(cancelSource, /await settleQueueJobCancellation\(job\)/);
  assert.match(cancelSource, /cancellationNotice\(language\)/);
  assert.match(appSource, /requestCancel:\s*async \(\) => \{[\s\S]*await fetch\(cancelJobUrl\(job\.id\),\s*\{\s*method:\s*"POST"\s*\}\)[\s\S]*if \(!response\.ok\) throw new Error[\s\S]*return response\.json/);
  assert.match(appSource, /abort:\s*\(\) => abortController\?\.abort\(\)/);
  assert.match(appSource, /cleanup:\s*\(\) => \{[\s\S]*delete queueAbortControllersRef\.current\[job\.id\];[\s\S]*delete queuePayloadsRef\.current\[job\.id\];/);
  assert.match(appSource, /onClick=\{\(\) => void cancelQueueJob\(job\)\}/);

  assert.match(appSource, /if \(responsePayload\.canceled === true\)/);
  const chatStart = appSource.indexOf('if (currentMode === "chat")');
  const chatEnd = appSource.indexOf("let submitGptForm", chatStart);
  const chatSource = appSource.slice(chatStart, chatEnd);
  assert.match(chatSource, /if \(payload\.canceled === true\)/);
  assert.match(chatSource, /status:\s*"error"[\s\S]*error:\s*t\("status\.chatCanceled"\)/);
  assert.match(i18nSource, /"status\.queueCanceled": "已在本地取消队列任务"/);
  assert.match(i18nSource, /"status\.queueCanceled": "Queue job canceled locally"/);
  assert.match(i18nSource, /"status\.chatCanceled": "聊天已取消"/);
  assert.match(i18nSource, /"status\.chatCanceled": "Chat canceled"/);
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

test("session persistence defers heavy storage work while typing", () => {
  const effectStart = appSource.indexOf("if (!sessionsHydratedRef.current) return undefined;");
  const timerStart = appSource.indexOf("sessionSaveTimerRef.current = window.setTimeout", effectStart);
  const cleanupStart = appSource.indexOf("return () =>", timerStart);
  assert.notEqual(effectStart, -1, "Missing session persistence effect");
  assert.notEqual(timerStart, -1, "Missing debounced session persistence timer");
  assert.notEqual(cleanupStart, -1, "Missing session persistence cleanup");

  const beforeTimer = appSource.slice(effectStart, timerStart);
  const timerBody = appSource.slice(timerStart, cleanupStart);
  assert.doesNotMatch(beforeTimer, /compactSessionsForStorage\(sessions\)/);
  assert.doesNotMatch(beforeTimer, /localStorage\.setItem\(sessionsStorageKey/);
  assert.match(timerBody, /localStorage\.setItem\(sessionsStorageKey, JSON\.stringify\(compactSessionsForStorage\(sessions\)\)\)/);
  assert.match(timerBody, /void saveStudioSessionsOnce\(compactSessionsForStorage\(sessions\), activeSessionId\)/);
});

test("session persistence keeps one atomic server baseline and ignores stale responses", () => {
  assert.match(appSource, /import \{ advanceSessionServerBaseline, buildSessionSavePayload, normalizeSessionRevision, reconcileSessionConflictState, runSessionSaveWithRetry, shouldSkipSessionSave \} from "\.\/sessionRevision";/);
  assert.match(appSource, /function normalizeSessionStatePayload\([\s\S]*revision:\s*normalizeSessionRevision\(source\.revision\)/);
  assert.match(appSource, /const sessionsRef = useRef<WorkbenchSession\[\]>\(sessions\);/);
  assert.match(appSource, /const sessionServerBaselineRef = useRef<\{[\s\S]*revision: number;[\s\S]*sessions: WorkbenchSession\[\];[\s\S]*\}>\(\{[\s\S]*revision: 1,[\s\S]*sessions: \[\],[\s\S]*\}\);/);
  assert.doesNotMatch(appSource, /sessionRevisionRef/);
  assert.doesNotMatch(appSource, /sessionBaselineRef/);
  assert.match(appSource, /const skipNextSessionSaveRef = useRef<\{ sessions: WorkbenchSession\[\]; activeSessionId: string \} \| null>\(null\);/);
  assert.match(appSource, /sessionsRef\.current = sessions;/);

  const saveStart = appSource.indexOf("async function saveStudioSessionsOnce(");
  const saveEnd = appSource.indexOf("useEffect(() =>", saveStart);
  const saveSource = appSource.slice(saveStart, saveEnd);
  assert.notEqual(saveStart, -1, "Missing bounded session save helper");
  assert.match(saveSource, /await runSessionSaveWithRetry\(\{/);
  assert.match(saveSource, /initialState:\s*\{ sessions: localSessions, activeSessionId: activeId \}/);
  assert.match(saveSource, /send:\s*async \(state, _attempt\) => \{[\s\S]*buildSessionSavePayload\(sessionServerBaselineRef\.current\.revision, state\.activeSessionId, state\.sessions\)/);
  assert.match(saveSource, /resolveConflict:\s*\(response\) => \{/);
  assert.match(saveSource, /const currentPayload = response\.payload\.current;/);
  assert.match(saveSource, /const latestLocalSessions = compactSessionsForStorage\(sessionsRef\.current\);/);
  assert.match(saveSource, /function applySessionConflictCurrent\(/);
  assert.match(saveSource, /reconcileSessionConflictState\(\{[\s\S]*baseline: sessionServerBaselineRef\.current,[\s\S]*localSessions: latestLocalSessions,[\s\S]*serverSessions: normalizedCurrent\.sessions,[\s\S]*serverRevision: normalizedCurrent\.revision,/);
  assert.match(saveSource, /sessionServerBaselineRef\.current = \{[\s\S]*revision: reconciled\.baseline\.revision,[\s\S]*sessions: compactSessionsForStorage\(reconciled\.baseline\.sessions\),[\s\S]*\};/);

  const reconcileStart = saveSource.indexOf("const reconciled = reconcileSessionConflictState");
  const staleGuardStart = saveSource.indexOf("if (!reconciled.accepted)", reconcileStart);
  const conflictSetSessionsStart = saveSource.indexOf("setSessions(mergedSessions);", reconcileStart);
  assert.notEqual(staleGuardStart, -1, "Missing stale conflict guard");
  assert.ok(staleGuardStart < conflictSetSessionsStart, "Stale conflicts must return before updating session UI");
  assert.match(saveSource.slice(staleGuardStart, conflictSetSessionsStart), /return \{[\s\S]*sessions: latestLocalSessions,[\s\S]*activeSessionId: latestActiveSessionId,[\s\S]*\};/);

  const successStart = saveSource.indexOf('if (result.kind === "success")');
  const exhaustedStart = saveSource.indexOf('if (result.kind === "exhausted")', successStart);
  const successSource = saveSource.slice(successStart, exhaustedStart);
  assert.match(successSource, /advanceSessionServerBaseline\(\{[\s\S]*baseline: sessionServerBaselineRef\.current,[\s\S]*serverRevision: normalized\.revision,[\s\S]*serverSessions: normalized\.sessions,[\s\S]*\}\)/);
  assert.match(successSource, /if \(!advancedBaseline\.accepted\) return;/);
  assert.ok(
    successSource.indexOf("if (!advancedBaseline.accepted) return;") < successSource.indexOf("sessionServerBaselineRef.current ="),
    "A stale save success must return before replacing the server baseline",
  );
  assert.match(saveSource, /if \(result\.kind === "exhausted"\) \{[\s\S]*applySessionConflictCurrent\(current\);[\s\S]*setNotice\(t\("status\.sessionConflictRefresh"\)\);[\s\S]*return;/);

  const loadStart = appSource.indexOf("async function loadServerSessions()");
  const loadEnd = appSource.indexOf("void loadServerSessions();", loadStart);
  const loadSource = appSource.slice(loadStart, loadEnd);
  assert.match(loadSource, /advanceSessionServerBaseline\(\{[\s\S]*baseline: sessionServerBaselineRef\.current,[\s\S]*serverRevision: normalized\.revision,[\s\S]*serverSessions: normalized\.sessions,[\s\S]*\}\)/);
  assert.match(loadSource, /if \(!advancedBaseline\.accepted\) return;/);
  assert.ok(
    loadSource.indexOf("if (!advancedBaseline.accepted) return;") < loadSource.indexOf("sessionServerBaselineRef.current ="),
    "A stale initial snapshot must return before replacing the server baseline",
  );
  assert.ok(
    loadSource.indexOf("if (!advancedBaseline.accepted) return;") < loadSource.indexOf("setSessions(normalized.sessions);"),
    "A stale initial snapshot must return before replacing session UI",
  );
  assert.match(saveSource, /skipNextSessionSaveRef\.current = \{ sessions: mergedSessions, activeSessionId: mergedActiveSessionId \};/);
  assert.match(saveSource, /setSessions\(mergedSessions\);/);
  assert.match(saveSource, /return \{[\s\S]*sessions:\s*compactSessionsForStorage\(mergedSessions\),[\s\S]*activeSessionId:\s*mergedActiveSessionId/);
  assert.match(saveSource, /if \(result\.kind === "exhausted"\) \{[\s\S]*setNotice\(t\("status\.sessionConflictRefresh"\)\)/);
  assert.match(saveSource, /if \(result\.kind === "unresolved"\) \{[\s\S]*setNotice\(t\("status\.sessionSaveFailed"\)\)/);
  assert.doesNotMatch(saveSource, /for \(let attempt = 0; attempt < 2;/);
  assert.doesNotMatch(saveSource, /(?:return|await)\s+saveStudioSessionsOnce\(/);
  assert.match(saveSource, /catch \(error\) \{[\s\S]*setNotice\(error instanceof Error && error\.message \? error\.message : t\("status\.sessionSaveFailed"\)\);/);

  assert.match(appSource, /const skipSave = skipNextSessionSaveRef\.current;[\s\S]*skipNextSessionSaveRef\.current = null;[\s\S]*if \(shouldSkipSessionSave\(skipSave, sessions, activeSessionId\)\) \{[\s\S]*return undefined;/);
  assert.match(i18nSource, /"status\.sessionConflictRefresh": "会话已在其他页面更新；自动合并重试仍冲突，请刷新页面后再继续。"/);
  assert.match(i18nSource, /"status\.sessionConflictRefresh": "This chat changed in another tab\. Automatic merge still conflicted; refresh the page before continuing\."/);
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

test("results actions expose stable tooltips and output dimensions", () => {
  assert.match(appSource, /function imageDimensionsLabel\(image\?: GeneratedImage \| null\)/);
  assert.match(appSource, /function requestedSizeLabel\(entry: HistoryEntry\)/);
  assert.match(appSource, /function dimensionMismatchLabel\(entry: HistoryEntry, image\?: GeneratedImage \| null\)/);
  assert.match(appSource, /tooltipProps\(t\("image\.copyPrompt"\)\)/);
  assert.match(appSource, /tooltipProps\(t\("image\.applyPrompt"\)\)/);
  assert.match(appSource, /tooltipProps\(t\("image\.continueEdit"\)\)/);
  assert.match(appSource, /tooltipProps\(t\("reference\.addAsReference"\)\)/);
  assert.match(appSource, /tooltipProps\(t\("image\.download"\)\)/);
  assert.match(appSource, /tooltipProps\(t\("image\.open"\)\)/);
  assert.match(appSource, /className="image-dimensions"/);
  assert.match(appSource, /className="preview-title-meta"/);
  assert.match(cssBlock(".image-actions"), /overflow:\s*visible;/);
  assert.match(cssBlock(".image-card"), /overflow:\s*visible;/);
});

test("result image actions use a persistent floating toolbar below the image", () => {
  assert.match(appSource, /className="image-preview-wrap"/);
  assert.doesNotMatch(appSource, /className="image-more-menu"/);
  assert.doesNotMatch(appSource, /MoreHorizontal/);
  assert.match(cssBlock(".image-card"), /border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /(?:^|\n)\.image-preview\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*border:\s*1px solid var\(--line\);[\s\S]*border-radius:\s*18px;/);
  assert.match(css, /(?:^|\n)\.image-card figcaption\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*padding:\s*48px 10px 10px;/);
  assert.match(cssBlock(".image-preview-wrap"), /position:\s*relative;[\s\S]*overflow:\s*visible;/);
  assert.match(cssBlock(".image-actions"), /position:\s*absolute;[\s\S]*top:\s*calc\(100% \+ 6px\);[\s\S]*width:\s*min\(180px, calc\(100% - 8px\)\);[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\);[\s\S]*opacity:\s*1;[\s\S]*pointer-events:\s*auto;/);
  assert.doesNotMatch(cssBlock(".image-actions"), /bottom:/);
  assert.doesNotMatch(cssBlock(".image-actions"), /pointer-events:\s*none;/);
  assert.doesNotMatch(css, /\.image-card:hover \.image-actions,\s*\.image-card:focus-within \.image-actions\s*\{/);
  assert.match(css, /\.image-actions button,\s*\.image-actions a\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*height:\s*26px;/);
  assert.match(cssBlock(".turn-images.collapsed .image-card figcaption"), /padding:\s*40px 7px 8px;/);
  assert.match(cssBlock(".turn-images.collapsed .image-actions"), /width:\s*min\(142px, calc\(100% - 6px\)\);[\s\S]*top:\s*calc\(100% \+ 6px\);/);
  assert.doesNotMatch(cssBlock(".turn-images.collapsed .image-actions"), /bottom:/);
});

test("composer labels clarify custom size apply and keep expand copy short", () => {
  assert.match(appSource, /\{t\("composer\.applyCustomSize"\)\}/);
  assert.match(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPromptShort"\)\}/);
  assert.doesNotMatch(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPrompt"\)\}/);
});

test("history browser supports list grid filters and destructive delete copy", () => {
  assert.match(appSource, /const \[historyBrowserOpen, setHistoryBrowserOpen\]/);
  assert.match(appSource, /const \[historyViewMode, setHistoryViewMode\]/);
  assert.match(appSource, /const \[historyFavoriteFilter, setHistoryFavoriteFilter\]/);
  assert.match(appSource, /const \[historyDateFilter, setHistoryDateFilter\]/);
  assert.match(appSource, /const \[historyEngineFilter, setHistoryEngineFilter\]/);
  assert.match(appSource, /function filteredHistoryEntries\(/);
  assert.match(appSource, /className=\{historyViewMode === "grid" \? "history-browser-grid" : "history-browser-list"\}/);
  assert.match(appSource, /t\("history\.browser"\)/);
  assert.match(appSource, /t\("history\.listMode"\)/);
  assert.match(appSource, /t\("history\.gridMode"\)/);
  assert.match(appSource, /t\("history\.removeRecord"\)/);
  assert.match(appSource, /t\("history\.deleteFiles"\)/);
  assert.match(appSource, /query\.set\("delete_files", "true"\)/);
  assert.match(cssBlock(".history-browser"), /width:\s*min\(1120px, calc\(100vw - 32px\)\);/);
  assert.match(cssBlock(".history-browser-grid"), /grid-template-columns:\s*repeat\(auto-fill, minmax\(150px, 1fr\)\);/);
  const phone = mediaBlock("max-width: 560px");
  assert.match(phone, /\.history-browser-list \.history-browser-card\s*\{[\s\S]*grid-template-columns:\s*64px minmax\(0, 1fr\);/);
  assert.match(phone, /\.history-browser-list \.history-browser-actions\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*justify-content:\s*flex-start;/);
});

test("history browser keeps heavy lists responsive and closes from Escape", () => {
  const keyHandlerStart = appSource.indexOf("function onKeyDown(event: globalThis.KeyboardEvent)");
  const keyHandlerEnd = appSource.indexOf("window.addEventListener(\"keydown\", onKeyDown)", keyHandlerStart);
  assert.notEqual(keyHandlerStart, -1, "Missing global Escape handler");
  assert.notEqual(keyHandlerEnd, -1, "Missing global Escape registration");
  assert.match(appSource.slice(keyHandlerStart, keyHandlerEnd), /if \(previewImage\) \{[\s\S]*closePreviewImage\(\);[\s\S]*return;/);
  assert.match(appSource.slice(keyHandlerStart, keyHandlerEnd), /setHistoryBrowserOpen\(false\);/);
  assert.match(appSource, /const HISTORY_BROWSER_PAGE_SIZE = 80;/);
  assert.match(appSource, /const \[historyBrowserLimit, setHistoryBrowserLimit\] = useState\(HISTORY_BROWSER_PAGE_SIZE\);/);
  assert.match(appSource, /const visibleHistory = filteredHistory\.slice\(0, historyBrowserLimit\);/);
  assert.match(appSource, /if \(historyBrowserOpen\) setHistoryBrowserLimit\(HISTORY_BROWSER_PAGE_SIZE\);/);
  assert.match(appSource, /visibleHistory\.map\(\(entry\) =>/);
  assert.doesNotMatch(appSource, /filteredHistory\.map\(\(entry\) =>/);
  assert.match(appSource, /className="history-browser-more"/);
  assert.match(appSource, /t\("history\.loadMore"\)/);
  assert.match(cssBlock(".history-browser-more"), /justify-self:\s*center;/);
  assert.match(i18nSource, /"history\.loadMore": "加载更多"/);
  assert.match(i18nSource, /"history\.loadMore": "Load more"/);
});

test("modal shells share direct center placement", () => {
  assert.match(css, /\.drawer-shell,\s*\.history-detail-shell,\s*\.lightbox\s*\{[\s\S]*display:\s*grid;[\s\S]*place-items:\s*center;/);
  assert.doesNotMatch(cssBlock(".drawer-shell"), /place-items:\s*center;/);
  assert.doesNotMatch(cssBlock(".history-detail-shell"), /place-items:\s*center;/);
  assert.match(css, /(?:^|\n)\.lightbox\s*\{\s*z-index:\s*60;\s*\}/);
});

test("history delete actions are visually distinct", () => {
  assert.match(appSource, /className="history-tool-remove"/);
  assert.match(appSource, /className="history-tool-danger"/);
  assert.match(appSource, /<ListX size=\{14\} \/>/);
  assert.match(appSource, /className="history-browser-action-remove"/);
  assert.match(appSource, /className="history-browser-action-remove"[\s\S]*<X size=\{14\} \/>/);
  assert.match(appSource, /className="history-browser-action-danger"/);
  assert.match(cssBlock(".history-tool-remove"), /color:\s*var\(--muted-strong\);/);
  assert.match(cssBlock(".history-tool-danger"), /border-color:\s*rgba\(180, 35, 24, 0\.22\);[\s\S]*background:\s*#fff5f5;[\s\S]*color:\s*var\(--danger\);/);
  assert.match(cssBlock(".history-browser-action-danger"), /border-color:\s*rgba\(180, 35, 24, 0\.22\);[\s\S]*background:\s*#fff5f5;[\s\S]*color:\s*var\(--danger\);/);
});

test("outputs entry uses localized finished-image folder copy", () => {
  assert.match(i18nSource, /"app\.outputFolder": "存图夹"/);
  assert.match(i18nSource, /"app\.openOutputFolder": "打开存图夹"/);
  assert.match(i18nSource, /"history\.browser": "历史窗"/);
  assert.match(i18nSource, /"history\.closeBrowser": "关闭历史窗"/);
  assert.match(i18nSource, /"history\.allEngines": "全部模型"/);
  assert.match(i18nSource, /"history\.engineFilter": "模型筛选"/);
  assert.match(i18nSource, /"history\.allEngines": "All models"/);
  assert.match(i18nSource, /"history\.engineFilter": "Model filter"/);
  assert.doesNotMatch(i18nSource, /成图目录|浏览历史|历史浏览器/);
  assert.match(appSource, /t\("app\.outputFolder"\)/);
  assert.match(appSource, /t\("app\.openOutputFolder"\)/);
  assert.match(appSource, /<FolderOpen size=\{15\} \/> \{t\("app\.outputFolder"\)\}/);
  assert.doesNotMatch(appSource, /<FolderOpen size=\{15\} \/> outputs/);
});

test("banana history exposes requested image size and aspect ratio", () => {
  assert.match(appSource, /const bananaSize = String\(entry\.meta\?\.image_size \|\| entry\.form_state\?\.image_size \|\| ""\)\.trim\(\);/);
  assert.match(appSource, /const bananaAspect = String\(entry\.meta\?\.aspect_ratio \|\| entry\.form_state\?\.aspect_ratio \|\| ""\)\.trim\(\);/);
  assert.match(appSource, /return \[bananaSize, bananaAspect\]\.filter\(\(item\) => item && item !== "auto" && item !== "无"\)\.join\(" \/ "\);/);
});

test("history sidebar actions read as a compact tool group", () => {
  assert.match(cssBlock(".sidebar-actions"), /display:\s*flex;[\s\S]*gap:\s*6px;/);
  assert.match(cssBlock(".sidebar-actions button"), /flex:\s*1 1 0;[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*34px;[\s\S]*border-radius:\s*999px;/);
  assert.doesNotMatch(css, /\.sidebar-action-output\s*\{/);
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
  assert.match(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPromptShort"\)\}/);
  assert.match(appSource, /className="prompt-expand-label-short">\{t\("composer\.expandPromptShort"\)\}/);
  assert.match(cssBlock(".prompt-expand-label-short"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".prompt-expand-label-full"), /display:\s*none;/);
  assert.match(cssBlockIn(phone, ".prompt-expand-label-short"), /display:\s*inline;/);
  assert.match(cssBlockIn(phone, ".composer-input"), /grid-template-columns:\s*minmax\(0, 1fr\) 52px;/);
  assert.match(cssBlockIn(phone, ".submit-button"), /grid-column:\s*2;[\s\S]*width:\s*52px;/);
});

test("composer hides unsupported controls and keeps chat reference behavior truthful", () => {
  assert.match(appSource, /import \{ loadReferenceForCurrentMode, referenceUiState, referencesForSubmitMode \} from "\.\/chatCapabilities";/);
  assert.match(appSource, /const referenceState = referenceUiState\(submitMode, references\.length\);/);
  assert.match(appSource, /disabled=\{!referenceState\.canAdd\}/);
  assert.match(appSource, /referenceState\.noticeKey &&[\s\S]*t\(referenceState\.noticeKey\)/);
  assert.match(appSource, /function onPaste\(event: ClipboardEvent<HTMLElement>\)/);
  assert.match(appSource, /onPaste=\{onPaste\}/);
  assert.match(appSource, /if \(!referenceUiState\(submitModeRef\.current, references\.length\)\.canAdd\)/);
  assert.match(appSource, /const currentReferences = referencesForSubmitMode\(currentMode, overrides\.references \|\| references\);/);

  const chatBranchStart = appSource.indexOf('if (currentMode === "chat")');
  const generateBranchStart = appSource.indexOf("let submitGptForm = currentGptForm", chatBranchStart);
  const chatBranch = appSource.slice(chatBranchStart, generateBranchStart);
  assert.doesNotMatch(chatBranch, /createReferenceSnapshots/);
  assert.doesNotMatch(chatBranch, /referenceSnapshots/);
  assert.match(chatBranch, /reference_count:\s*0/);
  assert.match(chatBranch, /setNotice\(t\("status\.chatReplied"\)\)/);

  assert.match(appSource, /useState<"size" \| "quality" \| "count" \| null>/);
  assert.doesNotMatch(appSource, /openComposerPopover\("edit"\)/);
  assert.doesNotMatch(appSource, /openComposerPopover\("strength"\)/);
  assert.doesNotMatch(appSource, /t\("composer\.editMode"\)/);
  assert.doesNotMatch(appSource, /t\("composer\.referenceStrength"\)/);
});

test("async reference reuse checks the latest mode and disables every reference action in chat", () => {
  assert.match(appSource, /import \{ loadReferenceForCurrentMode, referenceUiState, referencesForSubmitMode \} from "\.\/chatCapabilities";/);
  assert.match(appSource, /const submitModeRef = useRef\(submitMode\);/);
  assert.match(appSource, /submitModeRef\.current = submitMode;/);
  assert.match(appSource, /referenceUiState\(submitModeRef\.current, references\.length\)\.canAdd/);
  assert.match(appSource, /loadReferenceForCurrentMode\(\(\) => submitModeRef\.current, async \(\) =>/);

  const outputStart = appSource.indexOf("async function addOutputAsReference");
  const outputEnd = appSource.indexOf("function selectEngine", outputStart);
  const outputSource = appSource.slice(outputStart, outputEnd);
  assert.match(outputSource, /loadReferenceForCurrentMode/);
  assert.match(outputSource, /if \(outcome\.blocked\)[\s\S]*t\("reference\.chatNotSent"\)/);
  assert.match(outputSource, /return appendReferenceFiles\(\[outcome\.result\], "outputs"\);/);

  const copyStart = appSource.indexOf("async function copyReferencesFromTurn");
  const copyEnd = appSource.indexOf("async function regenerateFromTurn", copyStart);
  const copySource = appSource.slice(copyStart, copyEnd);
  assert.match(copySource, /loadReferenceForCurrentMode/);
  assert.match(copySource, /if \(outcome\.blocked\)[\s\S]*t\("reference\.chatNotSent"\)/);

  const continueStart = appSource.indexOf("async function continueFromTurn");
  const continueEnd = appSource.indexOf("return (", continueStart);
  const continueSource = appSource.slice(continueStart, continueEnd);
  assert.match(continueSource, /referenceUiState\(submitModeRef\.current, references\.length\)/);
  assert.match(continueSource, /const accepted = await addOutputAsReference/);
  assert.match(continueSource, /if \(accepted\) \{[\s\S]*t\("reference\.releaseAsContext"\)/);

  assert.match(appSource, /const referenceActionsDisabled = !referenceState\.canAdd;/);
  assert.match(appSource, /title=\{t\("history\.useReference"\)\} disabled=\{!src \|\| referenceActionsDisabled\}/);
  assert.match(appSource, /disabled=\{referenceActionsDisabled \|\| !turn\.referenceSnapshots\?\.some/);
  assert.match(appSource, /aria-label=\{t\("image\.continueEdit"\)\}[\s\S]*disabled=\{referenceActionsDisabled\}/);
  assert.match(appSource, /aria-label=\{t\("reference\.addAsReference"\)\}[\s\S]*disabled=\{referenceActionsDisabled\}/);
  assert.match(appSource, /disabled=\{referenceActionsDisabled \|\| !imageSrc\(historyDetail\.images\?\.\[0\]\)\}/);
  assert.match(appSource, /title=\{t\("preview\.useReference"\)\} disabled=\{referenceActionsDisabled\}/);
});
