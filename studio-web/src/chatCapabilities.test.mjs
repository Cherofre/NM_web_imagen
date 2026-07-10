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
