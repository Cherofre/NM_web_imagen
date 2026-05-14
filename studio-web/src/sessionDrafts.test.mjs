import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const moduleUrl = pathToFileURL(path.resolve("src/sessionDrafts.ts")).href;
const drafts = await import(moduleUrl);

test("normalizeSessionWithDrafts adds empty gpt and banana drafts", () => {
  const normalized = drafts.normalizeSessionWithDrafts({
    id: "session-1",
    title: "新对话",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    turns: [],
  });

  assert.deepEqual(normalized.drafts, {
    shared: {
      fixed_prompt: "",
    },
    gpt: {
      prompt: "",
      negative_prompt: "",
      poster_text: "",
    },
    banana: {
      prompt: "",
    },
  });
});

test("applyPromptToDrafts updates only the selected engine prompt", () => {
  const base = drafts.emptySessionDrafts();
  const next = drafts.applyPromptToDrafts("gpt-image-2", base, "蓝色火花");

  assert.equal(next.gpt.prompt, "蓝色火花");
  assert.equal(next.gpt.negative_prompt, "");
  assert.equal(next.shared.fixed_prompt, "");
  assert.equal(next.banana.prompt, "");
});

test("shouldPromptReferenceSwitch only prompts when switching sessions with references", () => {
  assert.equal(drafts.shouldPromptReferenceSwitch(0, "session-2", "session-1"), false);
  assert.equal(drafts.shouldPromptReferenceSwitch(2, "session-1", "session-1"), false);
  assert.equal(drafts.shouldPromptReferenceSwitch(2, "session-2", "session-1"), true);
});

test("resolveReferenceSwitch clears references only when choice is clear", () => {
  const currentReferences = ["a.png", "b.png"];

  assert.deepEqual(drafts.resolveReferenceSwitch("cancel", currentReferences), {
    keepActiveSession: true,
    references: ["a.png", "b.png"],
  });
  assert.deepEqual(drafts.resolveReferenceSwitch("preserve", currentReferences), {
    keepActiveSession: false,
    references: ["a.png", "b.png"],
  });
  assert.deepEqual(drafts.resolveReferenceSwitch("clear", currentReferences), {
    keepActiveSession: false,
    references: [],
  });
});

test("resolveSubmissionDrafts prefers explicit gpt text overrides for regenerate flows", () => {
  const base = {
    shared: {
      fixed_prompt: "偏二次元技能海报，高完成度",
    },
    gpt: {
      prompt: "当前草稿提示词",
      negative_prompt: "旧负面",
      poster_text: "旧文字",
    },
    banana: {
      prompt: "香蕉草稿",
    },
  };

  const resolved = drafts.resolveSubmissionDrafts("gpt-image-2", base, {
    prompt: "这轮重新生成",
    gpt: {
      negative_prompt: "新负面",
      poster_text: "新文字",
    },
  });

  assert.deepEqual(resolved, {
    prompt: "这轮重新生成",
    context_prompt: "偏二次元技能海报，高完成度",
    negative_prompt: "新负面",
    poster_text: "新文字",
  });
});

test("resolveSubmissionDrafts reuses shared fixed prompt for banana generate payloads", () => {
  const base = {
    shared: {
      fixed_prompt: "延续上一轮光效方向",
    },
    gpt: {
      prompt: "蓝色火花",
      negative_prompt: "",
      poster_text: "",
    },
    banana: {
      prompt: "橙色爆炸波",
    },
  };

  const resolved = drafts.resolveSubmissionDrafts("banana", base);

  assert.deepEqual(resolved, {
    prompt: "橙色爆炸波",
    context_prompt: "延续上一轮光效方向",
    negative_prompt: "",
    poster_text: "",
  });
});

test("resolveSessionDeletion clears composer references only when deleting the active session", () => {
  const sessions = [
    {
      id: "session-1",
      title: "一",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
      turns: [],
    },
    {
      id: "session-2",
      title: "二",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
      turns: [],
    },
  ];

  const inactiveDelete = drafts.resolveSessionDeletion(sessions, "session-1", "session-2", () => sessions[0]);
  assert.equal(inactiveDelete.clearReferences, false);
  assert.equal(inactiveDelete.nextActiveSessionId, "session-1");

  const activeDelete = drafts.resolveSessionDeletion(sessions, "session-1", "session-1", () => sessions[0]);
  assert.equal(activeDelete.clearReferences, true);
  assert.equal(activeDelete.nextActiveSessionId, "session-2");
});
