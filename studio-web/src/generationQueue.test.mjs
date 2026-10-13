import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createTranslator } from "./i18n.ts";
import { reconcileInterruptedQueueTurns } from "./queueSessionBoundaries.ts";
import {
  appendGenerationQueueJob,
  nextGenerationJobStatus,
  nextQueuedGenerationJob,
  hasRunningGenerationJob,
} from "./generationQueue.ts";

test("new generation jobs wait when another generation is running", () => {
  const jobs = [
    { id: "job-running", status: "running", createdAt: "2026-05-26T08:00:00.000Z" },
  ];

  assert.equal(nextGenerationJobStatus(jobs), "queued");
});

test("new generation jobs can start when no generation is running", () => {
  const jobs = [
    { id: "job-done", status: "success", createdAt: "2026-05-26T08:00:00.000Z" },
  ];

  assert.equal(nextGenerationJobStatus(jobs), "running");
});

test("scheduler starts the oldest queued job first", () => {
  const jobs = [
    { id: "job-newer", status: "queued", createdAt: "2026-05-26T08:02:00.000Z" },
    { id: "job-running", status: "success", createdAt: "2026-05-26T08:00:00.000Z" },
    { id: "job-older", status: "queued", createdAt: "2026-05-26T08:01:00.000Z" },
  ];

  assert.equal(nextQueuedGenerationJob(jobs)?.id, "job-older");
});

test("scheduler does not start queued jobs while one is running", () => {
  const jobs = [
    { id: "job-newer", status: "queued", createdAt: "2026-05-26T08:02:00.000Z" },
    { id: "job-running", status: "running", createdAt: "2026-05-26T08:00:00.000Z" },
    { id: "job-older", status: "queued", createdAt: "2026-05-26T08:01:00.000Z" },
  ];

  assert.equal(hasRunningGenerationJob(jobs), true);
  assert.equal(nextQueuedGenerationJob(jobs), undefined);
});

test("queue trimming preserves active jobs before trimming finished history", () => {
  const finished = Array.from({ length: 30 }, (_, index) => ({
    id: `job-finished-${index}`,
    status: "success",
    createdAt: `2026-05-26T08:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const running = { id: "job-running", status: "running", createdAt: "2026-05-26T07:00:00.000Z" };
  const next = { id: "job-new", status: "queued", createdAt: "2026-05-26T09:00:00.000Z" };

  const jobs = appendGenerationQueueJob([running, ...finished], next, 30);

  assert.equal(jobs.length, 30);
  assert.ok(jobs.some((job) => job.id === "job-running"));
  assert.ok(jobs.some((job) => job.id === "job-new"));
});

const appSource = fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
let hydrationLiveTurns;
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers[node.name.text] = ts.transpileModule(node.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "liveTurns" && node.initializer?.getText(ast).includes("liveChatTurnsRef")) {
    hydrationLiveTurns = ts.transpileModule(`(${node.initializer.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }
  ts.forEachChild(node, collect);
}
collect(ast);

test("actual partial-success completion retains images and reports X/Y in both languages without retrying", async () => {
  for (const language of ["zh-CN", "en"]) {
    const images = [{ saved_url: "/outputs/mock-1.png" }, { saved_url: "/outputs/mock-2.png" }];
    let requests = 0;
    const ctx = { Date, performance, AbortController, DOMException, language, t: createTranslator(language),
      queuePayloadsRef: { current: { job: { sessionId: "session", turnId: "turn", engine: "gpt-image-2", references: [], prompt: "synthetic" } } },
      cancelingQueueJobsRef: { current: new Set() }, queueAbortControllersRef: { current: {} }, queueProcessingRef: { current: "job" },
      sessions: [{ id: "session", turns: [{ id: "turn", status: "queued", meta: {} }] }],
      setSessions(fn) { ctx.sessions = fn(ctx.sessions); }, updateQueueJob(_id, patch) { ctx.job = { ...ctx.job, ...patch }; },
      setStatus(value) { ctx.status = value; }, setNotice(value) { ctx.notice = value; },
      engineLabel: () => "GPT", createFormData: () => ({}), stickToConversationEndIfNearBottom() {},
      notifyDesktopGeneration(_title, body) { ctx.notification = body; },
      async apiFetch() { requests++; return { ok: true, async json() { return { ok: true, images, meta: { partial_result: true, n: 4, image_count: 2 } }; } }; },
    };
    vm.createContext(ctx);
    for (const name of ["partialGenerationMessage", "runQueuedGenerationJob"]) vm.runInContext(handlers[name], ctx);
    await ctx.runQueuedGenerationJob("job");
    const expected = ctx.t("status.generationPartial", { count: 2, requested: 4 });
    assert.equal(ctx.status, expected); assert.equal(ctx.notice, expected); assert.equal(ctx.notification, expected);
    assert.equal(ctx.job.status, "success"); assert.equal(ctx.job.images, images);
    assert.equal(ctx.sessions[0].turns[0].status, "success"); assert.equal(ctx.sessions[0].turns[0].images, images);
    assert.equal(requests, 1); assert.equal(ctx.queuePayloadsRef.current.job, undefined);
    assert.equal(ctx.partialGenerationMessage({ partial_result: true, n: 2 }, 2, ctx.t), "");
    assert.equal(ctx.partialGenerationMessage({ partial_result: true, n: "invalid" }, 1, ctx.t), "");
  }
  assert.match(appSource, /partialGenerationMessage\(turn\.meta, turn\.images\.length, t\)/);
  assert.match(appSource, /partialGenerationMessage\(jobTurn\?\.meta, jobImages\.length, t\)/);
});

test("actual generation admission rejects the 81st live payload before creating a turn or starting a request", async () => {
  const ctx = { Date, activeSessionId: "session", submitMode: "generate", activeEngine: "gpt-image-2", activeSession: { drafts: {} },
    sessions: [{ id: "session", drafts: {} }], gptForm: {}, bananaForm: {}, references: [], maskAttachment: null,
    referencesForSubmitMode: (_mode, files) => files, activeMaskAttachment: () => null, configIssues: () => [],
    generationCountFor: () => 1, resolveSubmissionDrafts: () => ({ prompt: "synthetic", context_prompt: "", negative_prompt: "", poster_text: "" }),
    makeId: (prefix) => prefix, normalizeCustomSize: () => ({ value: "1024x1024" }), resolveMaskEndpoint() {},
    createReferenceSnapshots: async () => [], MAX_ACTIVE_QUEUE_JOBS: 80,
    queuePayloadsRef: { current: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`job-${i}`, {}])) },
    setNotice(value) { ctx.notice = value; }, t: createTranslator("zh-CN"),
    setSessions() { throw new Error("must not create an orphan turn"); }, apiFetch() { throw new Error("must not generate"); },
  };
  vm.createContext(ctx); vm.runInContext(handlers.submit, ctx);
  assert.equal(await ctx.submit(), undefined);
  assert.equal(ctx.notice, ctx.t("status.queueLimit", { limit: 80 }));
});

test("a late startup session response preserves this window's newly running chat and chat cleanup removes live protection", async () => {
  for (const failure of [false, true]) {
    let finish;
    const ctx = { Date, clientId: "client", activeSessionId: "session", submitMode: "chat", activeEngine: "gpt-image-2",
      activeSession: { drafts: {} }, sessions: [{ id: "session", title: "named", turns: [], drafts: {} }], gptForm: {}, bananaForm: {}, references: [], maskAttachment: null,
      referencesForSubmitMode: (_mode, files) => files, activeMaskAttachment: () => null, configIssues: () => [], generationCountFor: () => 1,
      resolveSubmissionDrafts: () => ({ prompt: "synthetic chat" }), makeId: (prefix) => prefix, maxTurns: 80,
      queuePayloadsRef: { current: {} }, liveChatTurnsRef: { current: new Set() },
      setSessions(fn) { ctx.sessions = fn(ctx.sessions); }, isDefaultSessionTitle: () => false, sessionTitleFromTurns: () => "synthetic chat",
      jumpToConversationEnd() {}, applyPrompt() {}, setTimeout() {}, promptRef: { current: null }, setBusy() {},
      setStatus() {}, setNotice() {}, stickToConversationEndIfNearBottom() {},
      t: createTranslator("zh-CN"), engineLabel: () => "GPT", performance,
      buildChatContextMessages: () => [], createChatPayload: () => ({}),
      apiFetch: () => new Promise((resolve) => { finish = resolve; }),
    };
    vm.createContext(ctx); vm.runInContext(handlers.submit, ctx);
    const pending = ctx.submit();
    assert.equal(ctx.liveChatTurnsRef.current.has("session:turn"), true);
    assert.equal(Object.keys(ctx.queuePayloadsRef.current).length, 0);
    const liveTurns = vm.runInContext(hydrationLiveTurns, ctx);
    const hydrated = reconcileInterruptedQueueTurns(ctx.sessions, [], "client", liveTurns);
    assert.equal(hydrated[0].turns[0].status, "running", "late startup hydration must not mark a currently pending chat interrupted");
    finish({ ok: !failure, json: async () => failure ? { detail: "synthetic failure" } : { reply: "synthetic reply" } });
    await pending;
    assert.equal(ctx.liveChatTurnsRef.current.size, 0);
    assert.equal(ctx.sessions[0].turns[0].status, failure ? "error" : "success");
  }
});
