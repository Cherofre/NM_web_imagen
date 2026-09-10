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
  assert.match(cssBlock(".composer"), /--composer-prompt-height:\s*148px;/);
  assert.match(cssBlock(".composer-inner"), /display:\s*grid;[\s\S]*grid-template-rows:\s*auto minmax\(0, var\(--composer-prompt-height\)\);[\s\S]*width:\s*100%;[\s\S]*margin-inline:\s*0;/);
  assert.match(cssBlock(".composer-top"), /display:\s*grid;[\s\S]*gap:\s*8px;[\s\S]*min-height:\s*0;/);
  assert.match(appSource, /<button\s+type="button"\s+className="composer-resize-handle"[\s\S]*?<div className="composer-inner">\s*<div className="composer-top">\s*\{references\.length > 0 && \(/);
  assert.doesNotMatch(appSource, /<div className="composer-input">\s*<button\s+type="button"\s+className="composer-resize-handle"/);
  assert.match(cssBlock(".composer-input"), /align-items:\s*stretch;[\s\S]*min-height:\s*0;/);
  assert.match(cssBlock(".composer-resize-handle"), /position:\s*absolute;[\s\S]*top:\s*-10px;[\s\S]*left:\s*0;[\s\S]*right:\s*0;[\s\S]*height:\s*20px;[\s\S]*cursor:\s*ns-resize;/);
  assert.match(cssBlock(".composer-resize-handle::before"), /left:\s*0;[\s\S]*right:\s*0;[\s\S]*height:\s*1px;[\s\S]*background:\s*transparent;/);
  assert.match(cssBlock(".composer-resize-handle span"), /width:\s*52px;[\s\S]*height:\s*4px;/);
  assert.match(css, /\.composer-resize-handle:hover::before,[\s\S]*\.composer-resize-handle:focus-visible::before,[\s\S]*\.composer-resize-handle:active::before\s*\{[^}]*background:\s*rgba\(28, 25, 23, 0\.12\);/);
  assert.match(cssBlock(".composer-textarea-wrap"), /height:\s*100%;[\s\S]*min-height:\s*118px;/);
  assert.doesNotMatch(cssBlock(".composer-textarea-wrap"), /max-height:/);
  assert.match(cssBlock(".composer-prompt-actions"), /position:\s*absolute;[\s\S]*bottom:\s*12px;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(cssBlock(".session-prompt-button"), /grid-template-columns:\s*auto minmax\(0, 1fr\);[\s\S]*min-height:\s*36px;/);
  assert.match(cssBlock(".session-prompt-button-summary"), /text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(cssBlock(".composer-textarea-wrap"), /resize:\s*vertical;/);
  assert.match(cssBlock(".composer-input textarea"), /width:\s*100%;/);
  assert.match(cssBlock(".composer-input textarea"), /height:\s*100%;/);
  assert.doesNotMatch(appSource, /className="composer-reset-button"/);
  assert.doesNotMatch(css, /\.composer-reset-button\s*\{/);
  assert.match(cssBlock(".submit-button"), /grid-row:\s*1;[\s\S]*align-self:\s*end;/);
  assert.match(cssBlock(".drawer-actions"), /justify-content:\s*flex-end;/);
  assert.match(cssBlock(".session-prompt-drawer"), /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(css, /\.composer-top-actions\s*\{/);
  assert.doesNotMatch(css, /\.session-prompt-pill\s*\{/);
  assert.doesNotMatch(css, /\.composer-textarea-meta\s*\{/);
});

test("reference switch cancel uses the same dismiss path as backdrop and close", () => {
  assert.match(appSource, /function cancelPendingSessionSwitch\(\) \{\s*setPendingSessionSwitch\(null\);\s*\}/);
  assert.equal((appSource.match(/onClick=\{cancelPendingSessionSwitch\}/g) || []).length, 3);
  assert.doesNotMatch(appSource, /switchToSession\(pendingSessionSwitch\.nextSessionId, "cancel"\)/);
});

test("turn deletion is guarded, explicit, and visually secondary until hover", () => {
  assert.match(appSource, /function deleteTurn\(sessionId: string, turn: ConversationTurn\)/);
  assert.match(appSource, /hasActiveQueueJobForTurn\(queueJobs, sessionId, turn\.id\)/);
  assert.match(appSource, /confirm\(t\("turn\.deleteConfirm"\)\)/);
  assert.match(appSource, /resolveTurnDeletion\(current, sessionId, turn\.id, updatedAt\)/);
  assert.match(appSource, /turnMaskPayloadsRef\.current\.delete\(turn\.id\)/);
  assert.match(appSource, /className="danger-action"[\s\S]*onClick=\{\(\) => deleteTurn\(activeSession\.id, turn\)\}/);
  assert.match(cssBlock(".turn-user-actions button.danger-action"), /background:\s*rgba\(255, 255, 255, 0\.72\);[\s\S]*color:\s*var\(--muted-strong\);/);
  assert.match(css, /\.turn-user-actions button\.danger-action:hover:not\(:disabled\),[\s\S]*color:\s*var\(--danger\);/);
  assert.match(i18nSource, /"turn\.deleteConfirm": "删除这一轮对话？生成图片仍保留在历史和输出文件夹中。"/);
  assert.match(i18nSource, /"status\.turnBusy"/);
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

test("session cards keep text selection and dead padding from swallowing clicks", () => {
  assert.match(appSource, /className="session-open"[\s\S]*aria-current=\{session\.id === activeSessionId \? "page" : undefined\}[\s\S]*onClick=\{\(\) => requestSessionSwitch\(session\.id\)\}/);
  assert.match(cssBlock(".session-card"), /position:\s*relative;/);
  assert.match(cssBlock(".session-open"), /position:\s*relative;[\s\S]*cursor:\s*pointer;[\s\S]*user-select:\s*none;/);
  assert.match(cssBlock(".session-open::before"), /content:\s*"";[\s\S]*top:\s*-6px;[\s\S]*right:\s*-7px;[\s\S]*bottom:\s*-6px;[\s\S]*left:\s*-6px;/);
  assert.match(cssBlock(".session-open span,\n.session-open small"), /pointer-events:\s*none;/);
  assert.match(cssBlock(".session-open:active"), /background:\s*#f5f5f4;/);
  assert.match(cssBlock(".session-card > button:last-child"), /position:\s*relative;[\s\S]*z-index:\s*2;/);
});

test("session deletion requires confirmation and explains what remains", () => {
  assert.match(appSource, /function deleteSession\(sessionId: string\)[\s\S]*hasActiveQueueJobForSession\(queueJobs, sessionId\)[\s\S]*confirm\(t\("session\.deleteConfirm", \{ title: localizeSessionTitle\(session\.title, t\) \}\)\)/);
  assert.match(i18nSource, /"session\.deleteConfirm": "删除会话「\{title\}」？其中的对话会被删除，生成图片仍保留在历史和存图夹中。"/);
  assert.match(i18nSource, /"session\.deleteConfirm": "Delete chat \\\"\{title\}\\\"\? Its messages will be deleted, but generated images will remain in history and the output folder\."/);
});

test("advanced parameter toggles align to input height without stretching", () => {
  assert.match(cssBlock(".settings-grid"), /align-items:\s*start;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*align-self:\s*end;[\s\S]*height:\s*42px;[\s\S]*min-height:\s*42px;/);
  assert.match(css, /\.toggle\s*\{[\s\S]*box-sizing:\s*border-box;/);
});

test("queue entry stays compact and uses neutral status styling", () => {
  assert.match(cssBlock(".queue-anchor"), /height:\s*0;[\s\S]*pointer-events:\s*none;/);
  assert.match(cssBlock(".queue-capsule"), /position:\s*absolute;[\s\S]*right:\s*0;[\s\S]*min-height:\s*34px;[\s\S]*border-radius:\s*12px;[\s\S]*background:\s*rgba\(255, 255, 255, 0\.94\);[\s\S]*color:\s*var\(--ink\);[\s\S]*pointer-events:\s*auto;/);
  assert.doesNotMatch(css, /\.queue-capsule::before\s*\{/);
  assert.doesNotMatch(css, /queue-capsule-breathe/);
  assert.match(cssBlock(".queue-capsule-label"), /letter-spacing:\s*0;/);
  assert.match(cssBlock(".queue-capsule-count"), /background:\s*#efefed;[\s\S]*color:\s*var\(--ink\);/);
  assert.match(cssBlock(".queue-capsule-dot"), /width:\s*7px;[\s\S]*height:\s*7px;/);
  assert.match(cssBlock(".queue-capsule-dot.active"), /background:\s*#2563eb;/);
  assert.match(cssBlock(".queue-capsule-dot.done"), /background:\s*#a8a29e;/);
  assert.match(cssBlock(".queue-popover"), /position:\s*absolute;[\s\S]*top:\s*44px;[\s\S]*right:\s*0;[\s\S]*pointer-events:\s*auto;/);
  assert.match(appSource, /const QUEUE_POPOVER_DEFAULT_WIDTH = 366;/);
  assert.match(appSource, /const QUEUE_POPOVER_DEFAULT_HEIGHT = 310;/);
  assert.match(appSource, /function clampQueuePopoverSize\(width: number, height: number\)/);
  assert.match(appSource, /const \[queuePopoverSize, setQueuePopoverSize\]/);
  assert.match(appSource, /const queuePopoverStyle: CSSProperties = \{[\s\S]*"--queue-popover-width": `\$\{queuePopoverSize\.width\}px`,[\s\S]*"--queue-popover-height": `\$\{queuePopoverSize\.height\}px`,/);
  assert.match(cssBlock(".queue-popover"), /grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*width:\s*min\(var\(--queue-popover-width, 366px\), calc\(100vw - 52px\)\);[\s\S]*height:\s*min\(var\(--queue-popover-height, 310px\), calc\(100vh - 240px\)\);[\s\S]*overflow:\s*hidden;/);
  assert.match(cssBlock(".queue-popover"), /background:\s*#fff;/);
  assert.doesNotMatch(css, /\.queue-popover::before\s*\{/);
  assert.match(cssBlock(".queue-popover-head"), /position:\s*relative;[\s\S]*z-index:\s*1;[\s\S]*padding:\s*2px 2px 10px;/);
  assert.match(cssBlock(".queue-popover-head h3"), /font-size:\s*18px;/);
  assert.match(cssBlock(".queue-job-icon"), /border-radius:\s*999px;/);
  assert.match(cssBlock(".queue-job-thumb"), /width:\s*44px;[\s\S]*height:\s*44px;/);
  assert.match(cssBlock(".queue-list"), /gap:\s*8px;[\s\S]*align-content:\s*start;[\s\S]*grid-auto-rows:\s*max-content;[\s\S]*min-height:\s*0;[\s\S]*padding:\s*10px 2px 14px;[\s\S]*overflow:\s*auto;[\s\S]*border-top:\s*1px solid rgba\(148, 163, 184, 0\.16\);/);
  assert.match(css, /\.queue-job\s*\{[\s\S]*position:\s*relative;[\s\S]*padding:\s*9px 10px;[\s\S]*border:\s*1px solid var\(--line\);[\s\S]*border-radius:\s*12px;[\s\S]*background:\s*#fff;/);
  assert.match(cssBlock(".queue-job-main-button strong,\n.queue-job-main-button span"), /display:\s*block;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
  assert.doesNotMatch(css, /\.queue-job::before\s*\{/);
  assert.match(cssBlock(".queue-job.running"), /border-color:\s*rgba\(37, 99, 235, 0\.28\);/);
  assert.match(cssBlock(".queue-job.error"), /border-color:\s*rgba\(220, 38, 38, 0\.24\);/);
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
  assert.match(appSource, /className=\{jobImages\.length > 1 \? "queue-job-thumb multi" : "queue-job-thumb"\}/);
  assert.match(appSource, /className="queue-job-main-button"/);
  assert.match(appSource, /onClick=\{\(\) => jumpToQueueJob\(job\)\}/);
  assert.match(appSource, /className="queue-capsule-label">\{activeQueueCount \? t\("queue\.label"\) : t\("queue\.recent"\)\}/);
  assert.match(appSource, /className="queue-capsule-count">\{activeQueueCount \|\| queueJobs\.length\}/);
  assert.match(appSource, /className=\{`queue-capsule \$\{activeQueueCount \? "active" : ""\}`\.trim\(\)\}/);
  assert.match(appSource, /className=\{activeQueueCount \? "queue-capsule-dot active" : "queue-capsule-dot done"\}/);
});

test("composer height persists as a browser layout preference", () => {
  assert.match(appSource, /const composerPromptHeightStorageKey = "image-generate-web-tool:studio-composer-prompt-height";/);
  assert.match(appSource, /function readStoredComposerPromptHeight\(\)[\s\S]*localStorage\.getItem\(composerPromptHeightStorageKey\)/);
  assert.match(appSource, /const initialComposerPromptHeight = useRef\(readStoredComposerPromptHeight\(\)\);/);
  assert.match(appSource, /const \[composerPromptHeightPreference, setComposerPromptHeightPreference\] = useState\(\(\) => initialComposerPromptHeight\.current\);/);
  assert.match(appSource, /const \[composerViewportHeight, setComposerViewportHeight\] = useState/);
  assert.match(appSource, /window\.addEventListener\("resize", updateComposerViewportHeight\);/);
  assert.match(appSource, /localStorage\.setItem\(composerPromptHeightStorageKey, String\(Math\.round\(value\)\)\)/);
  assert.match(appSource, /localStorage\.removeItem\(composerPromptHeightStorageKey\)/);
  assert.match(appSource, /function endComposerResize[\s\S]*saveStoredComposerPromptHeight\(composerPromptHeightPreferenceRef\.current\)/);
  assert.match(appSource, /onKeyDown=\{resizeComposerFromKeyboard\}/);
  assert.match(appSource, /onDoubleClick=\{resetPromptHeight\}/);
  assert.match(appSource, /if \(event\.key === "Home"\) \{[\s\S]*resetPromptHeight\(\)/);
  assert.match(appSource, /aria-keyshortcuts="Home"/);
  assert.match(appSource, /role="separator"[\s\S]*aria-valuenow=\{composerPromptHeight\}/);
  assert.match(i18nSource, /"composer\.resizeHint": "拖动调整输入区高度，双击恢复默认"/);
  assert.match(i18nSource, /"composer\.resizeHint": "Drag to resize input height, double-click to reset"/);
  assert.doesNotMatch(i18nSource, /composer\.resetHeightShort/);
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
  assert.match(appSource, /requestCancel:\s*async \(\) => \{[\s\S]*await apiFetch\(cancelJobUrl\(job\.id\),\s*\{\s*method:\s*"POST"\s*\}\)[\s\S]*if \(!response\.ok\) throw new Error[\s\S]*return response\.json/);
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
  assert.match(appSource, /function openPreviewImages\(images: GeneratedImage\[\], index = 0, historyContext\?: PreviewHistoryContext\)/);
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
  assert.match(appSource, /import \{[\s\S]*advanceSessionServerBaseline,[\s\S]*buildSessionSavePayload,[\s\S]*normalizeSessionRevision,[\s\S]*reconcileSessionConflictState,[\s\S]*runSessionSaveWithRetry,[\s\S]*shouldSkipSessionSave,[\s\S]*\} from "\.\/sessionRevision";/);
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
    loadSource.indexOf("if (!advancedBaseline.accepted) return;") < loadSource.indexOf("setSessions(mergedSessions);"),
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

test("session startup merges local and server state while save success adopts only safe canonical references", () => {
  assert.match(appSource, /const sessionBaselineStorageKey = "image-generate-web-tool:studio-session-server-baseline-v1";/);
  assert.match(appSource, /function loadPersistedSessionBaselineMarkers\(\)[\s\S]*normalizePersistedBaselineMarkers/);
  assert.match(appSource, /function persistSessionBaselineMarkers\([\s\S]*buildPersistedBaselineMarkers\([\s\S]*localStorage\.setItem\(sessionBaselineStorageKey/);
  assert.match(appSource, /catch \{[\s\S]*localStorage\.removeItem\(sessionBaselineStorageKey\)/);

  const loadStart = appSource.indexOf("async function loadServerSessions()");
  const loadEnd = appSource.indexOf("void loadServerSessions();", loadStart);
  const loadSource = appSource.slice(loadStart, loadEnd);
  assert.match(loadSource, /const persistedBaselineMarkers = loadPersistedSessionBaselineMarkers\(\);/);
  assert.match(loadSource, /reconcileInitialSessionState\(\{[\s\S]*baselineMarkers: persistedBaselineMarkers,[\s\S]*localSessions,[\s\S]*serverSessions: normalized\.sessions,[\s\S]*serverRevision: normalized\.revision/);
  assert.match(loadSource, /persistSessionBaselineMarkers\(\s*normalized\.revision,\s*normalized\.activeSessionId,\s*normalized\.sessions,?\s*\)/);
  assert.match(loadSource, /sessionStateMatchesSnapshot\(\{[\s\S]*snapshotSessions: normalized\.sessions,[\s\S]*snapshotActiveSessionId: normalized\.activeSessionId/);
  assert.doesNotMatch(loadSource, /setSessions\(normalized\.sessions\)/);

  const saveStart = appSource.indexOf("async function saveStudioSessionsOnce(");
  const saveEnd = appSource.indexOf("useEffect(() =>", saveStart);
  const saveSource = appSource.slice(saveStart, saveEnd);
  const successStart = saveSource.indexOf('if (result.kind === "success")');
  const exhaustedStart = saveSource.indexOf('if (result.kind === "exhausted")', successStart);
  const successSource = saveSource.slice(successStart, exhaustedStart);
  assert.match(successSource, /persistSessionBaselineMarkers\(\s*normalized\.revision,\s*normalized\.activeSessionId,\s*normalized\.sessions,?\s*\)/);
  assert.match(successSource, /const currentMatchesSent = sessionStateMatchesSnapshot\(\{[\s\S]*snapshotSessions: result\.state\.sessions,[\s\S]*snapshotActiveSessionId: result\.state\.activeSessionId/);
  assert.match(successSource, /applyCanonicalReferenceUpdates\(\{[\s\S]*currentSessions: sessionsRef\.current,[\s\S]*sentSessions: result\.state\.sessions,[\s\S]*serverSessions: normalized\.sessions/);
  assert.match(successSource, /if \(canonical\.changed\) \{[\s\S]*sessionsRef\.current = canonical\.sessions;[\s\S]*setSessions\(canonical\.sessions\);/);
  assert.match(successSource, /if \(currentMatchesSent\) \{[\s\S]*skipNextSessionSaveRef\.current = \{ sessions: canonical\.sessions, activeSessionId: canonicalActiveSessionId \};/);
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
  assert.match(appSource, /className="generation-settings-trigger"/);
  assert.match(appSource, /className="generation-count-alert"/);
  assert.match(cssBlock(".generation-count-alert"), /background:\s*var\(--warning-bg\);[\s\S]*color:\s*var\(--warning\);/);
  assert.doesNotMatch(css, /count-trigger-alert/);
  assert.match(css, /\.multi-image-confirm-drawer\s*\{[\s\S]*max-width:\s*420px;/);
});

test("config drawer exposes an obvious add-profile action", () => {
  assert.match(appSource, /function addConfigProfile\(engine: Engine\)/);
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
  assert.match(appSource, /async function runDiagnostics\(engine: Engine = activeEngine\)/);
  assert.match(appSource, /function closeConnectionDrawer\(\)/);
  assert.match(appSource, /setDiagnosticsResult\(null\);[\s\S]*setConnectionOpen\(false\);/);
  assert.match(appSource, /function clearDiagnosticsResult\(\)/);
  assert.match(appSource, /selectConfigProfile\(profile: ConfigProfile\)[\s\S]*clearDiagnosticsResult\(\);/);
  assert.match(appSource, /apiFetch\("\/api\/diagnostics"/);
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
  assert.match(appSource, /downloadImage\(previewImage\.src, previewImage\.name\)/);
  assert.match(appSource, /pathname\.startsWith\("\/outputs\/"\)/);
  assert.match(appSource, /parsed\.searchParams\.set\("download", "1"\)/);
  assert.match(appSource, /saveImageAs\(src, name\)/);
  assert.match(appSource, /openDownloadsFolder\(\)/);
  assert.match(appSource, /<div className="lightbox-zoom-tools" aria-label=\{t\("preview\.zoomControls"\)\}>/);
  assert.match(appSource, /aria-label=\{t\("preview\.zoomIn"\)\}/);
  assert.match(appSource, /aria-label=\{t\("preview\.zoomOut"\)\}/);
  assert.match(appSource, /title=\{t\("preview\.fit"\)\}/);
  assert.match(appSource, /\{Math\.round\(previewZoom \* 100\)\}%/);
  const headerStart = appSource.indexOf("downloadImage(previewImage.src, previewImage.name)");
  const headerEnd = appSource.indexOf("</span>", headerStart);
  assert.notEqual(headerStart, -1, "Missing preview header action area");
  assert.notEqual(headerEnd, -1, "Missing preview header action close");
  assert.doesNotMatch(appSource.slice(headerStart, headerEnd), /aria-label="缩小图片"|aria-label="放大图片"|title="适配窗口"|title="原始大小"/);
  assert.match(cssBlock(".lightbox-zoom-tools"), /position:\s*absolute;[\s\S]*right:\s*14px;[\s\S]*bottom:\s*14px;/);
  assert.match(cssBlock(".lightbox-card"), /width:\s*min\(1760px,\s*calc\(100vw - 24px\)\);/);
  assert.match(cssBlock(".lightbox-card"), /height:\s*min\(1100px,\s*calc\(100vh - 24px\)\);/);
  assert.match(cssBlock(".lightbox-stage"), /overflow:\s*hidden;[\s\S]*cursor:\s*zoom-in;/);
  assert.match(cssBlock(".lightbox-stage img"), /scale\(var\(--preview-zoom, 1\)\);/);
});

test("download notice offers a localized folder action after saving", () => {
  assert.match(appSource, /const \[noticeAction, setNoticeAction\] = useState<"open-downloads" \| null>\(null\);/);
  assert.match(appSource, /if \(isDesktopRuntime\(\)\) \{\s*setNoticeWithAction\(t\("status\.downloaded"\), "open-downloads"\);\s*\} else \{\s*setNotice\(t\("status\.downloaded"\)\);/);
  assert.match(appSource, /async function openDownloadFolderFromNotice\(\)[\s\S]*const opened = await openDownloadsFolder\(\);[\s\S]*if \(opened\) setNotice\(""\);/);
  assert.match(appSource, /noticeAction === "open-downloads"[\s\S]*className="toast-action"[\s\S]*t\("status\.openDownloads"\)/);
  const imageMenuStart = appSource.indexOf('className="image-more-menu"');
  const imageMenuEnd = appSource.indexOf('</div>', imageMenuStart);
  assert.notEqual(imageMenuStart, -1, "Missing image more menu");
  assert.doesNotMatch(appSource.slice(imageMenuStart, imageMenuEnd), /openDownloadsFolder/);
  assert.match(cssBlock(".toast-action"), /background:\s*var\(--ink\);[\s\S]*color:\s*#fff;[\s\S]*white-space:\s*nowrap;/);
  assert.match(i18nSource, /"image\.saveAs": "另存为…"/);
  assert.match(i18nSource, /"image\.saveAs": "Save as…"/);
  assert.match(i18nSource, /"status\.openDownloads": "打开文件夹"/);
  assert.match(i18nSource, /"status\.openDownloads": "Open folder"/);
});

test("image preview canvas supports wheel zoom and drag panning", () => {
  assert.match(appSource, /const \[previewPan, setPreviewPan\] = useState\(\{ x: 0, y: 0 \}\);/);
  assert.match(appSource, /function handlePreviewWheel\(event: WheelEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function startPreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function movePreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /function endPreviewPan\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(appSource, /onWheel=\{handlePreviewWheel\}/);
  assert.match(appSource, /onPointerDown=\{startPreviewPan\}/);
  assert.match(appSource, /onDoubleClick=\{handlePreviewDoubleClick\}/);
  assert.match(appSource, /"--preview-pan-x": `\$\{previewPan\.x\}px`/);
  assert.match(appSource, /"--preview-pan-y": `\$\{previewPan\.y\}px`/);
  assert.match(cssBlock(".lightbox-stage.is-zoomed"), /cursor:\s*grab;/);
  assert.match(cssBlock(".lightbox-stage.is-dragging"), /cursor:\s*grabbing;/);
  assert.match(cssBlock(".lightbox-stage img"), /translate3d\(var\(--preview-pan-x, 0px\), var\(--preview-pan-y, 0px\), 0\) scale\(var\(--preview-zoom, 1\)\);/);
});

test("image preview zoom controls keep clicks out of canvas dragging and expose interaction feedback", () => {
  assert.match(appSource, /function isPreviewControlTarget\(target: EventTarget \| null\)/);
  assert.match(appSource, /if \(isPreviewControlTarget\(event\.target\)\) return;/);
  assert.match(appSource, /function handlePreviewDoubleClick\(event: ReactMouseEvent<HTMLDivElement>\)/);
  assert.match(appSource, /handlePreviewDoubleClick[\s\S]*if \(isPreviewControlTarget\(event\.target\)\) return;[\s\S]*resetPreviewCanvas\(\);/);
  assert.match(appSource, /onDoubleClick=\{handlePreviewDoubleClick\}/);
  assert.doesNotMatch(appSource, /onDoubleClick=\{resetPreviewCanvas\}/);
  assert.doesNotMatch(appSource, /onMouseDown=\{startPreviewMousePan\}/);
  assert.doesNotMatch(appSource, /function startPreviewMousePan/);
  assert.match(appSource, /\{Math\.round\(previewZoom \* 100\)\}%/);
  assert.match(cssBlock(".lightbox-zoom-tools"), /z-index:\s*4;[\s\S]*pointer-events:\s*auto;/);
  assert.match(css, /\.lightbox-zoom-tools button:hover:not\(:disabled\)[\s\S]*background:\s*rgba\(255, 255, 255, 0\.14\);/);
  assert.match(css, /\.lightbox-zoom-tools button:active:not\(:disabled\)[\s\S]*transform:\s*translateY\(1px\);/);
  assert.match(css, /\.lightbox-zoom-tools button:focus-visible[\s\S]*outline:\s*2px solid #fff;/);
});

test("save-like actions are visually primary and clear", () => {
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*border-color:\s*rgba\(17, 17, 17, 0\.32\);[\s\S]*background:\s*#111;/);
  assert.match(css, /button\.primary-action,\s*\.header-actions button\.primary-action,\s*\.drawer-actions button\.primary-action,\s*\.composer-popover button\.primary-action\s*\{[\s\S]*color:\s*#fff;/);
  assert.doesNotMatch(appSource, /清空 GPT 辅助项/);
  assert.match(appSource, /t\("sessionPrompt\.clearGpt"\)/);
});

test("results actions expose clear labels and output dimensions", () => {
  assert.match(appSource, /function imageDimensionsLabel\(image\?: GeneratedImage \| null\)/);
  assert.match(appSource, /function sharedImageDimensionsLabel\(images: GeneratedImage\[\]\)[\s\S]*labels\.every\(\(label\) => label === firstLabel\)/);
  assert.match(appSource, /function requestedSizeLabel\(entry: HistoryEntry\)/);
  assert.match(appSource, /function dimensionMismatchLabel\(entry: HistoryEntry, image\?: GeneratedImage \| null\)/);
  assert.match(appSource, /<span>\{t\("image\.continueEdit"\)\}<\/span>/);
  assert.match(appSource, /<span>\{t\("preview\.editMask"\)\}<\/span>/);
  assert.match(appSource, /className="image-download-action"[\s\S]*aria-label=\{t\("image\.download"\)\}/);
  assert.match(appSource, /<span>\{t\("image\.copyPrompt"\)\}<\/span>/);
  assert.match(appSource, /<span>\{t\("image\.applyPrompt"\)\}<\/span>/);
  assert.match(appSource, /<span>\{t\("reference\.addAsReference"\)\}<\/span>/);
  assert.match(appSource, /<span>\{t\("image\.open"\)\}<\/span>/);
  assert.match(appSource, /className="image-dimensions"/);
  assert.match(appSource, /className="response-meta"[\s\S]*sharedImageDimensionsLabel\(turn\.images\)[\s\S]*turn\.elapsedSeconds/);
  assert.match(appSource, /\{!sharedImageDimensionsLabel\(turn\.images\) && dimensions && \(\s*<figcaption>\s*<small className="image-dimensions">\{dimensions\}<\/small>/);
  assert.doesNotMatch(appSource, /<figcaption>\s*<span>\{name\}<\/span>/);
  assert.match(appSource, /className="preview-title-meta"/);
  assert.match(css, /(?:^|\n)\.image-actions\s*\{[^}]*overflow:\s*visible;/);
  assert.match(css, /(?:^|\n)\.image-card\s*\{[^}]*overflow:\s*visible;/);
});

test("result image actions use image-corner actions plus one compact footer row", () => {
  assert.match(appSource, /className="image-preview-wrap"/);
  assert.match(appSource, /className="image-overlay-actions"/);
  assert.match(appSource, /className="image-mask-action"/);
  assert.match(appSource, /className="image-download-action"/);
  assert.match(appSource, /<details className="image-more-actions">/);
  assert.match(appSource, /className="image-more-menu"/);
  assert.match(appSource, /<Ellipsis size=\{15\} \/>/);
  assert.doesNotMatch(appSource, /MoreHorizontal/);
  assert.match(css, /(?:^|\n)\.image-card\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.match(css, /(?:^|\n)\.image-preview\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*var\(--radius-md\);[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--line\);/);
  assert.match(css, /(?:^|\n)\.image-preview:hover,\s*\.image-preview:focus-visible\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--line-strong\), 0 2px 8px rgba\(15, 23, 42, 0\.1\);/);
  assert.match(css, /(?:^|\n)\.image-card figcaption\s*\{[\s\S]*padding:\s*7px 2px 0;/);
  assert.match(cssBlock(".image-preview-wrap"), /position:\s*relative;[\s\S]*overflow:\s*visible;/);
  assert.match(
    css,
    /(?:^|\n)\.image-overlay-actions\s*\{[^}]*position:\s*absolute;[^}]*left:\s*10px;[^}]*right:\s*10px;[^}]*bottom:\s*10px;[^}]*justify-content:\s*space-between;/
  );
  assert.match(css, /(?:^|\n)\.image-actions\s*\{[^}]*position:\s*relative;[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/);
  assert.match(css, /(?:^|\n)\.image-grid\.single \.image-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*width:\s*100%;/);
  assert.match(cssBlock(".image-more-menu"), /position:\s*absolute;[\s\S]*bottom:\s*calc\(100% \+ 6px\);[\s\S]*display:\s*grid;/);
  assert.match(cssBlock(".turn-images.collapsed .image-actions"), /display:\s*none;/);
  assert.match(cssBlock(".turn-images.collapsed .image-overlay-actions"), /display:\s*none;/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-overlay-actions"), /display:\s*flex;/);
});

test("more action menus close after outside clicks, Escape, and completed actions", () => {
  assert.match(appSource, /const ACTION_MENU_SELECTOR = "details\.header-more-menu, details\.image-more-actions";/);
  assert.match(appSource, /const OPEN_ACTION_MENU_SELECTOR = "details\.header-more-menu\[open\], details\.image-more-actions\[open\]";/);
  assert.match(appSource, /function closeOpenActionMenus\(except\?: Node \| null\) \{[\s\S]*querySelectorAll<HTMLDetailsElement>\(OPEN_ACTION_MENU_SELECTOR\)[\s\S]*menu\.open = false;/);
  assert.match(appSource, /document\.addEventListener\("pointerdown", onActionMenuPointerDown\);/);
  assert.match(appSource, /document\.addEventListener\("click", onActionMenuClick\);/);
  assert.match(appSource, /const menu = target\.closest<HTMLDetailsElement>\(ACTION_MENU_SELECTOR\);[\s\S]*const action = target\.closest\("button, a"\);[\s\S]*menu\.open = false;/);
  const keyHandlerStart = appSource.indexOf("function onKeyDown(event: globalThis.KeyboardEvent)");
  const keyHandlerEnd = appSource.indexOf("window.addEventListener(\"keydown\", onKeyDown)", keyHandlerStart);
  assert.match(appSource.slice(keyHandlerStart, keyHandlerEnd), /if \(closeOpenActionMenus\(\)\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*return;/);
});

test("internal image dragging requires deliberate hold and movement", () => {
  assert.match(appSource, /import \{ shouldAllowInternalImageDrag, type InternalImageDragIntent \} from "\.\/imageDragIntent";/);
  assert.match(appSource, /const internalImageDragIntentRef = useRef<\(InternalImageDragIntent & \{ pointerId: number \}\) \| null>\(null\);/);
  assert.match(appSource, /function startInternalImageDragIntent\(event: ReactPointerEvent<HTMLElement>\)[\s\S]*pointerId: event\.pointerId[\s\S]*startedAt: performance\.now\(\)/);
  assert.match(appSource, /function gateInternalImageDrag\(event: DragEvent<HTMLElement>\)[\s\S]*shouldAllowInternalImageDrag\(intent, performance\.now\(\)\)[\s\S]*event\.preventDefault\(\)[\s\S]*event\.dataTransfer\.effectAllowed = "copy";/);
  assert.match(appSource, /onPointerDownCapture=\{startInternalImageDragIntent\}[\s\S]*onPointerUpCapture=\{clearInternalImageDragIntent\}[\s\S]*onPointerCancelCapture=\{clearInternalImageDragIntent\}[\s\S]*onDragStartCapture=\{gateInternalImageDrag\}/);
  assert.doesNotMatch(appSource, /draggable=\{false\}/);
  assert.doesNotMatch(cssBlock("img"), /-webkit-user-drag:\s*none;/);
  assert.match(appSource, /className="reference-drag-handle"[\s\S]*draggable[\s\S]*onDragStart=\{\(event\) => onReferenceDragStart\(event, index\)\}/);
});

test("single results stay compact and use the lightbox instead of inline expansion", () => {
  assert.match(appSource, /function resultImageStyle\(image\?: GeneratedImage\): CSSProperties/);
  assert.match(appSource, /"--result-aspect": `\$\{width\} \/ \$\{height\}`/);
  assert.match(appSource, /function resultImageOrientation\(image\?: GeneratedImage\)/);
  assert.match(appSource, /function isTurnExpanded\(turn: ConversationTurn\) \{\s*if \(turn\.images\.length === 1\) return false;\s*return expandedTurns\[turn\.id\] \?\? false;/);
  assert.match(appSource, /style=\{resultImageStyle\(image\)\}/);
  assert.match(appSource, /title=\{t\("history\.previewImage"\)\}/);
  assert.match(appSource, /turn\.images\.length > 1 && \(\s*<button type="button" className="image-toggle"/);
  assert.doesNotMatch(appSource, /t\("image\.expandOne"\)/);
  assert.match(css, /(?:^|\n)\.image-preview\s*\{[^}]*aspect-ratio:\s*var\(--result-aspect, 1 \/ 1\);/);
  assert.match(cssBlock(".turn-images.expanded .image-preview img"), /object-fit:\s*contain;/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-preview"), /aspect-ratio:\s*var\(--result-aspect, 1 \/ 1\);/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-preview img"), /object-fit:\s*contain;/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-actions"), /display:\s*grid;/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-card"), /flex:\s*none;[\s\S]*width:\s*min\(280px, 100%\);/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-card.result-portrait"), /width:\s*min\(220px, 100%\);/);
  assert.match(cssBlock(".turn-images.collapsed .image-grid.single .image-card.result-landscape"), /width:\s*min\(400px, 100%\);/);
  assert.match(cssBlock(".image-grid.single .image-card.result-portrait"), /width:\s*min\(320px, 100%\);/);
  assert.match(cssBlock(".image-grid.single .image-card.result-landscape"), /width:\s*min\(520px, 100%\);/);
  assert.match(appSource, /turn\.images\.length === 1 \? "single-result" : "multi-result"/);
  assert.match(cssBlock(".turn-images.multi-result .image-toggle"), /grid-row:\s*1;/);
  assert.match(cssBlock(".turn-images.multi-result .image-grid"), /grid-row:\s*2;/);
  assert.match(cssBlock(".turn-images.expanded .image-preview"), /max-height:\s*min\(600px, 64vh\);/);
  assert.doesNotMatch(i18nSource, /"image\.expandOne"/);
});

test("expanding multi-image results brings the image grid into view", () => {
  assert.match(appSource, /const turnImageGridRefs = useRef<Record<string, HTMLDivElement \| null>>\(\{\}\);/);
  assert.match(appSource, /function toggleTurnExpanded\(turnId: string\)[\s\S]*const willExpand = !\(expandedTurns\[turnId\] \?\? false\);[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*scrollIntoView\(\{[\s\S]*block: "start",[\s\S]*inline: "nearest",[\s\S]*\}\)/);
  assert.match(appSource, /ref=\{\(node\) => \{[\s\S]*turnImageGridRefs\.current\[turn\.id\] = node;[\s\S]*\}\}[\s\S]*className=\{turn\.images\.length === 1 \? "image-grid single" : "image-grid"\}/);
  assert.match(cssBlock(".turn-images.expanded .image-grid"), /scroll-margin-top:\s*12px;/);
});

test("sidebar, conversation, composer and header use the simplified hierarchy", () => {
  assert.match(appSource, /className="sidebar-list-section"/);
  assert.match(cssBlock(".sidebar-list-section"), /grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*min-height:\s*0;/);
  const sidebarStart = appSource.indexOf('<div className="sidebar-actions">');
  const sidebarEnd = appSource.indexOf('</div>', sidebarStart);
  assert.notEqual(sidebarStart, -1);
  assert.doesNotMatch(appSource.slice(sidebarStart, sidebarEnd), /app\.newChat/);
  assert.match(appSource, /className="conversation-flow"/);
  assert.match(cssBlock(".conversation-flow"), /width:\s*100%;[\s\S]*margin-inline:\s*0;/);
  assert.match(appSource, /className="composer-inner"/);
  assert.match(appSource, /<details className="header-more-menu">/);
  assert.match(appSource, /t\("app\.clearCurrentConversation"\)/);
  assert.doesNotMatch(appSource.slice(appSource.indexOf('<div className="header-actions">'), appSource.indexOf('</header>')), /onClick=\{\(\) => void saveConfig\(\)\}/);
  assert.match(cssBlock(".header-more-panel .danger-action"), /color:\s*var\(--danger\);/);
});

test("composer keeps size directly accessible and groups only quality with count", () => {
  assert.match(appSource, /useState<"size" \| "settings" \| "model" \| null>/);
  assert.match(appSource, /openComposerPopover\("size"\)/);
  assert.match(appSource, /openComposerPopover\("settings"\)/);
  assert.match(appSource, /className="size-settings-trigger"/);
  assert.match(appSource, /className="composer-popover size-settings-popover"/);
  assert.match(appSource, /className="generation-settings-trigger"/);
  assert.match(appSource, /className="composer-popover generation-settings-popover"/);
  assert.match(appSource, /className="generation-settings-section size-settings-section"/);
  assert.match(appSource, /className="generation-settings-section quality-settings-section"/);
  assert.match(appSource, /className="generation-settings-section count-settings-section"/);
  const sizePopoverStart = appSource.indexOf('className="composer-popover size-settings-popover"');
  const settingsTriggerStart = appSource.indexOf('className="generation-settings-trigger"', sizePopoverStart);
  const sizePopoverSource = appSource.slice(sizePopoverStart, settingsTriggerStart);
  assert.match(sizePopoverSource, /size-settings-section/);
  assert.doesNotMatch(sizePopoverSource, /quality-settings-section|count-settings-section/);
  const settingsPopoverStart = appSource.indexOf('className="composer-popover generation-settings-popover"');
  const advancedStart = appSource.indexOf('setAdvancedOpen\(true\)', settingsPopoverStart);
  const settingsPopoverSource = appSource.slice(settingsPopoverStart, advancedStart);
  assert.match(settingsPopoverSource, /quality-settings-section/);
  assert.match(settingsPopoverSource, /count-settings-section/);
  assert.doesNotMatch(settingsPopoverSource, /size-settings-section/);
  assert.doesNotMatch(appSource, /openComposerPopover\("quality"\)|openComposerPopover\("count"\)/);
  assert.match(i18nSource, /"composer\.generationSettings": "生成设置"/);
  assert.match(i18nSource, /"composer\.generationSettings": "Generation settings"/);
});

test("advanced parameters omit controls already exposed in the composer", () => {
  const gptSettingsStart = appSource.indexOf("function GptSettings");
  const bananaSettingsStart = appSource.indexOf("function BananaSettings", gptSettingsStart);
  const gptSettingsSource = appSource.slice(gptSettingsStart, bananaSettingsStart);
  const bananaSettingsSource = appSource.slice(bananaSettingsStart, appSource.indexOf("export default App", bananaSettingsStart));

  assert.doesNotMatch(gptSettingsSource, /settings\.size|settings\.customSize|settings\.quality|settings\.count/);
  assert.match(gptSettingsSource, /settings\.seed/);
  assert.match(gptSettingsSource, /settings\.stylePreset/);
  assert.match(gptSettingsSource, /settings\.timeout/);

  assert.doesNotMatch(bananaSettingsSource, /settings\.batchSize|composer\.aspect|composer\.resolution/);
  assert.match(bananaSettingsSource, /settings\.seed/);
  assert.match(bananaSettingsSource, /Top-P/);
  assert.match(bananaSettingsSource, /settings\.timeout/);
});

test("shape hierarchy keeps pills for switches and regular controls compact", () => {
  assert.match(cssBlock(":root"), /--radius-xl:\s*22px;[\s\S]*--radius-lg:\s*18px;[\s\S]*--radius-md:\s*14px;[\s\S]*--radius-sm:\s*10px;/);
  assert.match(css, /\.icon-button,\s*\.new-session-button,[\s\S]*\.panel-title button\s*\{[^}]*border-radius:\s*var\(--radius-sm\);/);
  assert.match(cssBlock(".sidebar-tabs"), /border-radius:\s*999px;/);
  assert.match(cssBlock(".mode-tabs"), /border-radius:\s*999px;/);
  assert.match(cssBlock(".submit-mode-switch"), /border-radius:\s*999px;/);
  assert.match(cssBlock(".submit-mode-switch button.active"), /background:\s*#fff;[\s\S]*color:\s*var\(--ink\);/);
  assert.match(css, /\.floating-tooltip,\s*\.inline-tooltip\s*\{[^}]*max-width:\s*min\(280px, calc\(100vw - 40px\)\);/);
  assert.match(i18nSource, /"composer\.advancedTooltip": "种子、风格、超时等较少使用的设置。"/);
  assert.match(i18nSource, /"composer\.advancedTooltip": "Less common settings such as seed, style, and timeout\."/);
});

test("header distinguishes image and chat models with current reasoning controls", () => {
  assert.match(appSource, /const gptChatModelOptions = \["gpt-5\.6-sol", "gpt-5\.6-terra", "gpt-5\.6-luna", "gpt-5\.5", "gpt-5\.4", "gpt-5\.2", "custom"\];/);
  assert.match(appSource, /const gptReasoningOptions = \["auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"\];/);
  assert.match(appSource, /chat_model: "gpt-5\.6-sol",\s*chat_model_options: "",\s*chat_enabled: "0",\s*reasoning_effort: "auto",/);
  assert.match(appSource, /chat_model: value\.chat_model === "gpt-5\.6" \? "gpt-5\.6-sol"/);
  assert.match(appSource, /function chatModelOptionLabel\(value: string\)[\s\S]*config\.chatModelSol[\s\S]*config\.chatModelTerra[\s\S]*config\.chatModelLuna/);
  assert.doesNotMatch(appSource, /gptChatModelOptions = \[[^\]]*"gpt-5\.6"/);
  assert.match(appSource, /const activeModelSummary = activeEngine === "gpt-image-2"[\s\S]*t\("config\.gptModelSummary", \{ image: gptForm\.model, chat: gptForm\.chat_model \}\)/);
  assert.match(appSource, /<small>\{activeModelSummary \|\| t\("config\.modelName"\)\}<\/small>/);
  assert.match(appSource, /<Field label=\{t\("config\.chatModel"\)\} help=\{t\("config\.chatModelHelp"\)\}>/);
  assert.match(appSource, /<Field label=\{t\("config\.reasoning"\)\} help=\{t\("config\.reasoningHelp"\)\}>/);
  assert.match(i18nSource, /"config\.gptModelSummary": "生图 \{image\} · 聊天 \{chat\}"/);
  assert.match(i18nSource, /"config\.chatModelHelp": "请选择实际聊天模型。Sol、Terra 和 Luna 的速度、质量与成本取向不同；这里只影响聊天，不会替换生图模型。"/);
  assert.doesNotMatch(i18nSource, /config\.chatModelAlias/);
  assert.match(i18nSource, /"config\.chatModelSol": "gpt-5\.6-sol（旗舰）"/);
  assert.match(i18nSource, /"config\.chatModelTerra": "gpt-5\.6-terra（质量与成本均衡）"/);
  assert.match(i18nSource, /"config\.chatModelLuna": "gpt-5\.6-luna（速度与成本优先）"/);
  assert.match(i18nSource, /"config\.reasoningHelp": "自动不会发送思考强度，由上游模型采用自己的默认值。不同模型支持范围不同，若接口报参数错误请改为自动。"/);
  assert.match(i18nSource, /"option\.max": "最高"/);
  assert.match(i18nSource, /"option\.max": "Max"/);
});

test("composer labels clarify custom size apply and keep expand copy short", () => {
  assert.match(appSource, /\{t\("composer\.applyCustomSize"\)\}/);
  assert.match(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPromptShort"\)\}/);
  assert.doesNotMatch(appSource, /className="prompt-expand-label-full">\{t\("composer\.expandPrompt"\)\}/);
});

test("history uses one compact and full surface with an in-window detail", () => {
  assert.match(appSource, /const \[historySurface, setHistorySurface\] = useState<HistorySurfaceState>/);
  assert.doesNotMatch(appSource, /const \[historyBrowserOpen, setHistoryBrowserOpen\]/);
  assert.doesNotMatch(appSource, /const \[historyViewMode, setHistoryViewMode\]/);
  assert.match(appSource, /const \[historyFavoriteFilter, setHistoryFavoriteFilter\]/);
  assert.match(appSource, /const \[historyDateFilter, setHistoryDateFilter\]/);
  assert.match(appSource, /const \[historyEngineFilter, setHistoryEngineFilter\]/);
  assert.match(appSource, /function filteredHistoryEntries\(/);
  assert.match(appSource, /const HISTORY_QUICK_ENTRY_LIMIT = 12;/);
  assert.match(appSource, /const recentHistoryEntries = recentHistoryEntriesWithImages\(history, HISTORY_QUICK_ENTRY_LIMIT\);/);
  assert.doesNotMatch(appSource, /latestHistoryEntryWithImages|const latestHistoryEntry/);
  assert.match(appSource, /className="history-quick-popover"/);
  assert.match(appSource, /recentHistoryEntries\.map\(\(entry\) =>/);
  assert.match(appSource, /const image = entry\.images\?\.\[0\];/);
  assert.match(appSource, /className="history-quick-count"/);
  assert.match(appSource, /openPreviewImages\(entry\.images \|\| \[\], 0, \{/);
  assert.match(appSource, /className="history-quick-expand"/);
  assert.match(appSource, /className="history-browser-grid"/);
  assert.doesNotMatch(appSource, /history-browser-list/);
  assert.match(appSource, /t\("history\.browser"\)/);
  assert.match(appSource, /t\("history\.quickTitle"\)/);
  assert.match(appSource, /t\("history\.quickSummary"/);
  assert.match(appSource, /t\("history\.expandBrowser"\)/);
  assert.match(appSource, /t\("history\.backToBrowser"\)/);
  assert.match(appSource, /t\("history\.removeRecord"\)/);
  assert.match(appSource, /t\("history\.deleteFiles"\)/);
  assert.match(appSource, /query\.set\("delete_files", "true"\)/);
  assert.match(appSource, /function openHistoryContext\(entry: HistoryEntry, origin: HistoryOrigin = "browser"\) \{[\s\S]*setHistorySurface\(\{ mode: "browser", detailId: entry\.id, origin \}\);/);
  assert.match(appSource, /historyRestoreScrollRef\.current = true;[\s\S]*setHistorySurface\(\{ mode: "browser", detailId: entry\.id, origin \}\);/);
  assert.match(appSource, /if \(historyBrowserScrollRef\.current\) \{[\s\S]*historyBrowserScrollRef\.current\.scrollTop = historyBrowserScrollTopRef\.current;/);
  assert.match(appSource, /className="history-browser-card-main"[\s\S]*onClick=\{\(\) => openHistoryContext\(entry\)\}/);
  assert.match(appSource, /historySurface\.mode === "browser" && historyDetail/);
  assert.doesNotMatch(appSource, /\{historyDetail && \(\s*<div className="history-detail-shell">/);
  assert.match(appSource, /className="history-more-trigger"[\s\S]*openHistoryActionMenu\(event, entry, "browser"\)/);
  assert.match(appSource, /className=\{`history-action-popover \$\{historyActionMenu\.placement\}`\}/);
  assert.match(appSource, /className=\{entry\.favorite \? "history-browser-favorite active" : "history-browser-favorite"\}/);
  assert.match(appSource, /<Heart size=\{15\} fill=\{entry\.favorite \? "currentColor" : "none"\} \/>/);
  assert.match(appSource, /className="history-browser-batch-preview"[\s\S]*entry\.images\?\.slice\(0, 4\)\.map/);
  assert.doesNotMatch(appSource, /history-browser-context-hint/);
  assert.match(cssBlock(".history-browser"), /width:\s*min\(1120px, calc\(100vw - 32px\)\);/);
  assert.match(cssBlock(".history-browser-grid"), /grid-template-columns:\s*repeat\(auto-fill, minmax\(230px, 1fr\)\);/);
  assert.match(cssBlock(".history-browser-batch-preview"), /display:\s*grid;[\s\S]*aspect-ratio:\s*4 \/ 3;/);
  assert.match(cssBlock(".history-browser-favorite"), /position:\s*absolute;[\s\S]*top:\s*6px;[\s\S]*right:\s*6px;/);
  assert.match(cssBlock(".history-browser-batch-image img"), /object-fit:\s*contain;/);
  assert.match(cssBlock(".history-browser-card-main strong"), /white-space:\s*normal;[\s\S]*-webkit-line-clamp:\s*2;/);
  assert.match(cssBlock(".history-browser-actions"), /display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(cssBlock(".history-quick-popover"), /position:\s*fixed;[\s\S]*z-index:\s*58;/);
  assert.match(cssBlock(".history-quick-count"), /position:\s*absolute;[\s\S]*border-radius:\s*999px;/);
  assert.match(css, /(?:^|\n)\.lightbox\s*\{\s*z-index:\s*60;\s*\}/);
  assert.match(i18nSource, /"history\.quickTitle": "最近历史"/);
  assert.match(i18nSource, /"history\.quickSummary": "最近 \{shown\} 条 · 共 \{total\} 条"/);
});

test("history browser keeps heavy lists responsive and closes from Escape", () => {
  const keyHandlerStart = appSource.indexOf("function onKeyDown(event: globalThis.KeyboardEvent)");
  const keyHandlerEnd = appSource.indexOf("window.addEventListener(\"keydown\", onKeyDown)", keyHandlerStart);
  assert.notEqual(keyHandlerStart, -1, "Missing global Escape handler");
  assert.notEqual(keyHandlerEnd, -1, "Missing global Escape registration");
  assert.match(appSource.slice(keyHandlerStart, keyHandlerEnd), /if \(previewImage\) \{[\s\S]*closePreviewImage\(\);[\s\S]*return;/);
  assert.match(appSource.slice(keyHandlerStart, keyHandlerEnd), /escapeHistorySurface\(\);/);
  assert.match(appSource, /function escapeHistorySurface\(\) \{[\s\S]*historySurfaceAfterEscape\(historySurface\)[\s\S]*historyQuickTriggerRef\.current\?\.focus\(\)/);
  assert.match(appSource, /onKeyDown=\{handleHistorySurfaceKeyDown\}/);
  assert.match(appSource, /const HISTORY_BROWSER_PAGE_SIZE = 80;/);
  assert.match(appSource, /const \[historyBrowserLimit, setHistoryBrowserLimit\] = useState\(HISTORY_BROWSER_PAGE_SIZE\);/);
  assert.match(appSource, /const visibleHistory = filteredHistory\.slice\(0, historyBrowserLimit\);/);
  assert.match(appSource, /if \(historySurface\.mode === "browser"\) setHistoryBrowserLimit\(HISTORY_BROWSER_PAGE_SIZE\);/);
  assert.match(appSource, /visibleHistory\.map\(\(entry\) =>/);
  assert.doesNotMatch(appSource, /filteredHistory\.map\(\(entry\) =>/);
  assert.match(appSource, /className="history-browser-more"/);
  assert.match(appSource, /t\("history\.loadMore"\)/);
  assert.match(cssBlock(".history-browser-more"), /justify-self:\s*center;/);
  assert.match(i18nSource, /"history\.loadMore": "加载更多"/);
  assert.match(i18nSource, /"history\.loadMore": "Load more"/);
});

test("history sidebar previews multi-image records as compact batches", () => {
  assert.match(appSource, /const imageCount = images\.length;/);
  assert.match(appSource, /className="history-thumb" data-image-count=\{Math\.min\(imageCount, 4\)\}/);
  assert.match(appSource, /images\.slice\(0, 4\)\.map\(\(image, index\) =>/);
  assert.match(appSource, /className="history-thumb-count"/);
  assert.match(cssBlock('.history-thumb[data-image-count="2"]'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.history-thumb\[data-image-count="3"\],\s*\.history-thumb\[data-image-count="4"\]\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(cssBlock(".history-thumb-count"), /position:\s*absolute;[\s\S]*border-radius:\s*999px;/);
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
  assert.match(cssBlock(".sidebar-actions button"), /flex:\s*1 1 0;[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*34px;[\s\S]*border-radius:\s*var\(--radius-sm\);/);
  assert.match(appSource, /className="history-quick-trigger"/);
  assert.match(appSource, /<FolderOpen size=\{15\} \/> \{t\("app\.outputFolder"\)\}[\s\S]*className="history-quick-trigger"/);
  assert.match(appSource, /className="history-list-head"[\s\S]*className="history-refresh-button"/);
  assert.match(appSource, /className="history-quick-action"[\s\S]*t\("history\.applyShort"\)/);
  assert.match(appSource, /className="history-quick-action"[\s\S]*t\("history\.useReferenceShort"\)/);
  assert.match(appSource, /className="history-more-trigger"[\s\S]*openHistoryActionMenu\(event, entry, "sidebar"\)/);
  assert.match(appSource, /className=\{entry\.favorite \? "history-favorite-button active" : "history-favorite-button"\}/);
  assert.doesNotMatch(appSource, /<Star/);
  assert.match(appSource, /const \[historyActionMenu, setHistoryActionMenu\] = useState<HistoryActionMenuState \| null>\(null\);/);
  assert.match(appSource, /if \(historyActionMenu\?\.entryId === entry\.id && historyActionMenu\.source === source\) \{[\s\S]*setHistoryActionMenu\(null\);[\s\S]*return;/);
  assert.match(appSource, /target\.closest\("\.history-action-popover"\)[\s\S]*target\.closest\("\.history-more-trigger"\)[\s\S]*setHistoryActionMenu\(null\);/);
  assert.match(appSource, /window\.addEventListener\("scroll", closeForViewportChange, true\);/);
  assert.match(cssBlock(".history-card"), /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(cssBlock(".history-tools"), /grid-column:\s*1;[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(cssBlock(".history-action-popover"), /position:\s*fixed;[\s\S]*z-index:\s*95;[\s\S]*width:\s*min\(224px, calc\(100vw - 16px\)\);/);
  assert.match(css, /\.history-favorite-button\.active,\s*\.history-browser-favorite\.active\s*\{[^}]*background:\s*var\(--panel-soft\);[^}]*color:\s*var\(--ink\);/);
  assert.doesNotMatch(css, /\.history-favorite-button\.active,\s*\.history-browser-favorite\.active\s*\{[^}]*#dc2626/);
  assert.doesNotMatch(css, /\.history-more-actions\[open\][\s\S]*flex-basis:\s*100%;/);
  const historyMenuStart = appSource.indexOf("{historyActionMenu && historyActionEntry && (");
  const historySurfaceStart = appSource.indexOf('{historySurface.mode === "browser" && (', historyMenuStart);
  assert.notEqual(historySurfaceStart, -1, "Missing unified history browser surface");
  assert.doesNotMatch(appSource.slice(historyMenuStart, historySurfaceStart), /toggleFavorite/);
  assert.match(i18nSource, /"history\.applyShort": "套用"/);
  assert.match(i18nSource, /"history\.useReferenceShort": "参考图"/);
  assert.match(i18nSource, /"history\.applyShort": "Apply"/);
  assert.match(i18nSource, /"history\.useReferenceShort": "Reference"/);
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
  assert.match(cssBlockIn(tablet, ".workspace-header"), /display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(190px, 246px\);[\s\S]*grid-template-areas:\s*"title utilities"\s*"mode connection";/);
  assert.match(cssBlockIn(tablet, ".workspace-title"), /grid-area:\s*title;/);
  assert.match(cssBlockIn(tablet, ".workspace-controls"), /display:\s*contents;/);
  assert.match(cssBlockIn(tablet, ".mode-tabs"), /grid-area:\s*mode;[\s\S]*width:\s*fit-content;[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*visible;/);
  assert.match(cssBlockIn(tablet, ".connection-button"), /grid-area:\s*connection;[\s\S]*justify-self:\s*end;[\s\S]*width:\s*100%;/);
  assert.match(cssBlockIn(tablet, ".header-actions"), /grid-area:\s*utilities;[\s\S]*justify-self:\s*end;[\s\S]*width:\s*auto;/);
  assert.match(cssBlockIn(tablet, ".composer"), /position:\s*sticky;[\s\S]*bottom:\s*0;/);
  assert.match(cssBlockIn(tablet, ".composer-toolbar"), /flex-wrap:\s*wrap;[\s\S]*overflow-y:\s*visible;/);
  assert.doesNotMatch(cssBlockIn(tablet, ".composer-toolbar"), /overflow-y:\s*auto;/);
  assert.match(cssBlockIn(phone, ".history-sidebar"), /width:\s*min\(284px, calc\(100vw - 54px\)\);/);
  assert.match(cssBlockIn(phone, ".workspace-header"), /grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*grid-template-areas:\s*"title utilities"\s*"mode mode"\s*"connection connection";/);
  assert.match(cssBlockIn(phone, ".mode-tabs"), /width:\s*100%;/);
  assert.match(cssBlockIn(phone, ".mode-tabs button"), /flex:\s*1 1 0;[\s\S]*min-width:\s*0;/);
  assert.match(cssBlockIn(phone, ".connection-button"), /justify-self:\s*stretch;[\s\S]*max-width:\s*none;/);
  assert.doesNotMatch(phone, /\.history-tools\s*\{[^}]*grid-template-columns:\s*1fr;/);
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

  assert.match(appSource, /useState<"size" \| "settings" \| "model" \| null>/);
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
  assert.match(appSource, /onClick=\{\(\) => void continueFromTurn\(turn, image, index\)\} disabled=\{referenceActionsDisabled\}/);
  assert.match(appSource, /onClick=\{\(\) => void addOutputAsReference\(src, name\)\} disabled=\{referenceActionsDisabled\}/);
  assert.match(appSource, /disabled=\{referenceActionsDisabled \|\| !imageSrc\(historyDetail\.images\?\.\[0\]\)\}/);
  assert.match(appSource, /title=\{t\("preview\.useReference"\)\} disabled=\{referenceActionsDisabled\}/);
});
