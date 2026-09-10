export type Engine = "gpt-image-2" | "banana";

export type ConfigForm = Record<string, unknown>;

export type ConfigProfile = {
  id: string;
  engine: Engine;
  name: string;
  form: ConfigForm;
};

export type ActiveProfileIds = Record<Engine, string>;

type ConfigProfilePayload = {
  profiles?: ConfigProfile[];
  active_profile_ids?: Partial<ActiveProfileIds>;
  forms?: {
    "gpt-image-2-form"?: ConfigForm;
    "banana-form"?: ConfigForm;
  };
};

const engineFormIds: Record<Engine, "gpt-image-2-form" | "banana-form"> = {
  "gpt-image-2": "gpt-image-2-form",
  banana: "banana-form",
};

function sanitizeProfileId(value: string, fallback: string) {
  const slug = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function stripUrlToName(url: string, fallback: string) {
  const raw = url.trim();
  if (!raw) return fallback;
  let host = raw;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    host = parsed.host;
  } catch {
    host = raw.replace(/^https?:\/\//i, "").split("/")[0] || raw;
  }
  const hostOnly = host.split(":")[0];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostOnly)) return host;
  const parts = host.split(".").filter(Boolean);
  if (parts.length > 1 && ["com", "cn", "net", "org", "io", "ai", "top", "fun"].includes(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  return parts.join(".") || fallback;
}

export function deriveConfigDisplayName(customName: string | undefined, url: string | undefined, fallback: string) {
  const name = String(customName || "").trim();
  if (name) return name;
  return stripUrlToName(String(url || ""), fallback);
}

function profileNameForForm(engine: Engine, form: ConfigForm, fallback = "默认配置") {
  return deriveConfigDisplayName("", String(engine === "banana" ? form.api_base_url || "" : form.base_url || ""), fallback);
}

export function normalizeConfigProfiles(payload: ConfigProfilePayload, gptForm: ConfigForm, bananaForm: ConfigForm) {
  const profiles: ConfigProfile[] = [];
  const activeProfileIds: ActiveProfileIds = {
    "gpt-image-2": sanitizeProfileId(String(payload.active_profile_ids?.["gpt-image-2"] || ""), "gpt-image-2-default"),
    banana: sanitizeProfileId(String(payload.active_profile_ids?.banana || ""), "banana-default"),
  };

  (Array.isArray(payload.profiles) ? payload.profiles : []).forEach((item, index) => {
    if (!item || (item.engine !== "gpt-image-2" && item.engine !== "banana")) return;
    const fallbackId = `${item.engine}-${index + 1}`;
    const id = sanitizeProfileId(String(item.id || ""), fallbackId);
    const form = { ...(item.form || {}) };
    profiles.push({
      id,
      engine: item.engine,
      name: deriveConfigDisplayName(item.name, String(item.engine === "banana" ? form.api_base_url || "" : form.base_url || ""), "默认配置"),
      form,
    });
  });

  (Object.keys(engineFormIds) as Engine[]).forEach((engine) => {
    const fallbackId = `${engine}-default`;
    const activeId = activeProfileIds[engine];
    const engineProfiles = profiles.filter((item) => item.engine === engine);
    const currentForm = engine === "banana"
      ? { ...(payload.forms?.["banana-form"] || bananaForm) }
      : { ...(payload.forms?.["gpt-image-2-form"] || gptForm) };

    if (engineProfiles.length === 0) {
      profiles.push({
        id: fallbackId,
        engine,
        name: profileNameForForm(engine, currentForm),
        form: currentForm,
      });
      activeProfileIds[engine] = fallbackId;
      return;
    }

    const active = engineProfiles.find((item) => item.id === activeId) || engineProfiles[0];
    activeProfileIds[engine] = active.id;
    active.form = currentForm;
    if (!active.name.trim()) active.name = profileNameForForm(engine, currentForm);
  });

  return { profiles, activeProfileIds };
}

export function activeProfileForEngine(profiles: ConfigProfile[], activeProfileIds: ActiveProfileIds, engine: Engine) {
  return profiles.find((item) => item.engine === engine && item.id === activeProfileIds[engine])
    || profiles.find((item) => item.engine === engine);
}

export function syncActiveProfileForm(
  profiles: ConfigProfile[],
  activeProfileIds: ActiveProfileIds,
  engine: Engine,
  form: ConfigForm,
) {
  const activeProfileId = activeProfileIds[engine];
  return profiles.map((profile) => (
    profile.engine === engine && profile.id === activeProfileId
      ? { ...profile, form: { ...form } }
      : profile
  ));
}

/** Fields that are scoped to a single profile and must never leak across a switch. */
const PROFILE_SCOPED_FORM_KEYS = ["api_key", "credential_ref", "credential_pair_id", "model_options", "model_type_options", "chat_model_options", "chat_enabled"];

/**
 * Form state when switching to another profile.
 *
 * Most fields keep the current value when the target profile does not define
 * them (the drawer treats them as optional), but the cached image model
 * catalogue is per endpoint: a profile that has never fetched one must not
 * inherit the ids of the relay the user is switching away from.
 */
export function profileFormSnapshot<T extends ConfigForm>(current: T, form: ConfigForm): T {
  const next = { ...current, ...form } as T;
  PROFILE_SCOPED_FORM_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(form, key)) {
      (next as ConfigForm)[key] = "";
    }
  });
  return next;
}

export function buildConfigPayload(
  activeEngine: Engine,
  profiles: ConfigProfile[],
  activeProfileIds: ActiveProfileIds,
  gptForm: ConfigForm,
  bananaForm: ConfigForm,
) {
  const nextProfiles = profiles.map((profile) => ({
    ...profile,
    form: profile.engine === "gpt-image-2" && profile.id === activeProfileIds["gpt-image-2"]
      ? { ...gptForm }
      : profile.engine === "banana" && profile.id === activeProfileIds.banana
        ? { ...bananaForm }
        : { ...profile.form },
  }));

  return {
    version: 2,
    active_engine: activeEngine,
    active_profile_ids: activeProfileIds,
    profiles: nextProfiles,
    forms: {
      "gpt-image-2-form": { ...gptForm },
      "banana-form": { ...bananaForm },
    },
  };
}
