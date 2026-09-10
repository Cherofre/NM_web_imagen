import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfigPayload,
  deriveConfigDisplayName,
  normalizeConfigProfiles,
  profileFormSnapshot,
} from "./configProfiles.ts";

const gptForm = {
  api_key: "sk",
  base_url: "https://api.openai.com/v1",
  model: "gpt-image-2",
  chat_model: "gpt-5.4",
  reasoning_effort: "auto",
};

const bananaForm = {
  api_key: "banana",
  api_base_url: "https://banana.example.cn/v1",
  model_type: "gemini-3-pro-image-preview",
};

test("deriveConfigDisplayName uses custom name before URL short name", () => {
  assert.equal(deriveConfigDisplayName("公司接口", "https://api.openai.com/v1", "gpt-image-2"), "公司接口");
  assert.equal(deriveConfigDisplayName("", "https://api.openai.com/v1", "gpt-image-2"), "api.openai");
  assert.equal(deriveConfigDisplayName("", "http://192.168.1.20:8000/v1", "gpt-image-2"), "192.168.1.20:8000");
});

test("normalizeConfigProfiles wraps legacy config forms into default profiles", () => {
  const result = normalizeConfigProfiles(
    {
      forms: {
        "gpt-image-2-form": gptForm,
        "banana-form": bananaForm,
      },
    },
    gptForm,
    bananaForm,
  );

  assert.equal(result.activeProfileIds["gpt-image-2"], "gpt-image-2-default");
  assert.equal(result.profiles.find((item) => item.id === "gpt-image-2-default")?.name, "api.openai");
  assert.equal(result.profiles.find((item) => item.id === "banana-default")?.name, "banana.example");
});

test("buildConfigPayload keeps forms for v1.0.2 compatibility", () => {
  const result = normalizeConfigProfiles(
    {
      active_profile_ids: { "gpt-image-2": "gpt-work", banana: "banana-work" },
      profiles: [
        { id: "gpt-work", engine: "gpt-image-2", name: "公司接口", form: gptForm },
        { id: "banana-work", engine: "banana", name: "备用号", form: bananaForm },
      ],
    },
    gptForm,
    bananaForm,
  );

  const payload = buildConfigPayload("gpt-image-2", result.profiles, result.activeProfileIds, gptForm, bananaForm);

  assert.equal(payload.version, 2);
  assert.equal(payload.forms["gpt-image-2-form"].base_url, "https://api.openai.com/v1");
  assert.equal(payload.profiles[0].name, "公司接口");
});

test("switching profiles never inherits another relay's cached model list", () => {
  const current = { ...gptForm, model: "flare", model_options: "flare\nsunburst" };

  const withoutCatalogue = profileFormSnapshot(current, {
    api_key: "sk-other",
    base_url: "https://other.example/v1",
  });
  assert.equal(withoutCatalogue.base_url, "https://other.example/v1");
  assert.equal(withoutCatalogue.model, "flare");
  assert.equal(withoutCatalogue.model_options, "", "a fresh profile must start with an empty catalogue");

  const withCatalogue = profileFormSnapshot(current, {
    api_key: "sk-third",
    base_url: "https://third.example/v1",
    model: "alpha",
    model_options: "alpha\nbeta",
  });
  assert.equal(withCatalogue.model_options, "alpha\nbeta");

  const explicitlyEmpty = profileFormSnapshot(current, { model_options: "" });
  assert.equal(explicitlyEmpty.model_options, "");
});
