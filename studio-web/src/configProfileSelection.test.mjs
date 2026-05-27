import assert from "node:assert/strict";
import test from "node:test";

import { syncActiveProfileForm } from "./configProfiles.ts";

test("syncActiveProfileForm preserves unsaved edits before switching profiles", () => {
  const profiles = [
    { id: "gpt-a", engine: "gpt-image-2", name: "A", form: { base_url: "https://old.example/v1", model: "old" } },
    { id: "gpt-b", engine: "gpt-image-2", name: "B", form: { base_url: "https://b.example/v1", model: "b" } },
    { id: "banana-a", engine: "banana", name: "Banana", form: { api_base_url: "https://banana.example" } },
  ];

  const updated = syncActiveProfileForm(
    profiles,
    { "gpt-image-2": "gpt-a", banana: "banana-a" },
    "gpt-image-2",
    { base_url: "https://edited.example/v1", model: "edited" },
  );

  assert.deepEqual(updated.find((item) => item.id === "gpt-a")?.form, {
    base_url: "https://edited.example/v1",
    model: "edited",
  });
  assert.deepEqual(updated.find((item) => item.id === "gpt-b")?.form, {
    base_url: "https://b.example/v1",
    model: "b",
  });
});
