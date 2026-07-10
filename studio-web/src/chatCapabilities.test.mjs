import test from "node:test";
import assert from "node:assert/strict";

const capabilities = await import("./chatCapabilities.ts");

test("referencesForSubmitMode drops every chat reference and preserves generation references", () => {
  const references = [{ name: "one.png" }, { name: "two.png" }];

  assert.deepEqual(capabilities.referencesForSubmitMode("chat", references), []);
  assert.strictEqual(capabilities.referencesForSubmitMode("generate", references), references);
});

test("referenceUiState disables chat intake and explains retained existing references", () => {
  assert.deepEqual(capabilities.referenceUiState("chat", 2), {
    canAdd: false,
    noticeKey: "reference.chatNotSent",
  });
  assert.deepEqual(capabilities.referenceUiState("chat", 0), {
    canAdd: false,
    noticeKey: null,
  });
  assert.deepEqual(capabilities.referenceUiState("generate", 2), {
    canAdd: true,
    noticeKey: null,
  });
});

test("loadReferenceForCurrentMode blocks chat before invoking the loader", async () => {
  let calls = 0;

  const outcome = await capabilities.loadReferenceForCurrentMode(
    () => "chat",
    async () => {
      calls += 1;
      return "unused";
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(outcome, { blocked: true });
});

test("loadReferenceForCurrentMode rejects a deferred result after mode switches to chat", async () => {
  let mode = "generate";
  let resolveLoader;
  let started = false;
  const deferred = new Promise((resolve) => {
    resolveLoader = resolve;
  });

  const pending = capabilities.loadReferenceForCurrentMode(
    () => mode,
    () => {
      started = true;
      return deferred;
    },
  );
  assert.equal(started, true);
  mode = "chat";
  resolveLoader("late-image");

  assert.deepEqual(await pending, { blocked: true });
});

test("loadReferenceForCurrentMode accepts a result while mode stays generate", async () => {
  const result = { name: "accepted.png" };

  assert.deepEqual(
    await capabilities.loadReferenceForCurrentMode(() => "generate", async () => result),
    { blocked: false, result },
  );
});
