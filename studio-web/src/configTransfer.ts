/**
 * Config import / export.
 *
 * Sharing a working relay setup should not mean sharing an API key, so the
 * exported file carries every profile, form field and active selection *except*
 * the secrets. Import keeps the keys already stored locally and asks the user to
 * fill in anything that is genuinely new.
 */

export const CONFIG_TRANSFER_KIND = "nm-image-studio-config";
export const CONFIG_TRANSFER_VERSION = 1;
export const CONFIG_IMPORT_MAX_BYTES = 256 * 1024;

/** Secret fields never leave the machine, for either engine form. */
const SECRET_FORM_KEYS = ["api_key", "api_base_url_key", "secret"];

/**
 * The fields a profile actually stores, mirroring `CONFIG_CONNECTION_FIELDS` in
 * `app.py`. Exporting only these keeps the file consistent between profiles and,
 * more importantly, importable: the backend drops everything else when it saves,
 * so shipping generation-only fields would promise more than we can restore.
 */
export const CONFIG_TRANSFER_FORM_KEYS: Record<string, string[]> = {
  "gpt-image-2": [
    "base_url",
    "model",
    "model_options",
    "chat_model",
    "chat_model_options",
    "chat_enabled",
    "reasoning_effort",
    "credential_ref",
    "credential_pair_id",
  ],
  banana: ["api_base_url", "model_type", "model_type_options", "credential_ref", "credential_pair_id"],
};

type Json = Record<string, unknown>;

export type ConfigTransferProfile = {
  id: string;
  engine: string;
  name: string;
  form: Json;
};

export type ConfigTransferPayload = {
  kind: typeof CONFIG_TRANSFER_KIND;
  transfer_version: number;
  app_version: string;
  exported_at: string;
  active_engine: string;
  active_profile_ids: Record<string, string>;
  profiles: ConfigTransferProfile[];
};

export type MergeResult = {
  profiles: ConfigTransferProfile[];
  activeProfileIds: Record<string, string>;
  addedCount: number;
  updatedCount: number;
  keptKeyCount: number;
  keysMissing: number;
};

function isJsonObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formWithoutSecrets(form: unknown, engine?: string): Json {
  if (!isJsonObject(form)) return {};
  const allowed = engine ? CONFIG_TRANSFER_FORM_KEYS[engine] : null;
  const cleaned: Json = {};
  Object.entries(form).forEach(([key, value]) => {
    if (SECRET_FORM_KEYS.includes(key)) return;
    if (allowed && !allowed.includes(key)) return;
    cleaned[key] = value;
  });
  return cleaned;
}

function profileKey(profile: ConfigTransferProfile): string {
  return `${profile.engine}::${profile.id}`;
}

function endpointKey(profile: ConfigTransferProfile): string {
  const raw = String(profile.form.base_url || profile.form.api_base_url || "").trim();
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return "";
    return `${profile.engine}::${url.href.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

/** Everything except the secrets, ready to be written to disk and shared. */
export function buildConfigExport(
  profiles: ConfigTransferProfile[],
  activeProfileIds: Record<string, string>,
  activeEngine: string,
  appVersion: string,
  exportedAt = new Date().toISOString(),
): ConfigTransferPayload {
  return {
    kind: CONFIG_TRANSFER_KIND,
    transfer_version: CONFIG_TRANSFER_VERSION,
    app_version: appVersion,
    exported_at: exportedAt,
    active_engine: activeEngine,
    active_profile_ids: { ...activeProfileIds },
    profiles: profiles.map((profile) => ({
      id: profile.id,
      engine: profile.engine,
      name: profile.name,
      form: formWithoutSecrets(profile.form, profile.engine),
    })),
  };
}

/** Make a profile name safe to use inside a file name on any platform. */
function fileNameSafeSegment(value: string, maxLength = 40): string {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength)
    .replace(/[-.]+$/g, "");
  return cleaned;
}

/**
 * Export file name: `nm-image-studio-config-<profile>-<version>-<date>.json`.
 *
 * The profile name is the one the user recognises the setup by, so a folder of
 * exports stays readable without opening each file; it is optional because the
 * app can be asked to export before any profile has a name.
 */
export function configExportFileName(appVersion: string, profileName = "", stamp = new Date()): string {
  const date = stamp.toISOString().slice(0, 10);
  const name = fileNameSafeSegment(profileName);
  const middle = [name, appVersion || "unknown"].filter(Boolean).join("-");
  return `nm-image-studio-config-${middle}-${date}.json`;
}

/** Parse and validate an imported file. Throws with a user facing message. */
export function parseConfigImport(text: string): ConfigTransferPayload {
  if (text.length > CONFIG_IMPORT_MAX_BYTES) {
    throw new Error("config.importTooLarge");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("config.importInvalid");
  }
  if (!isJsonObject(parsed)) throw new Error("config.importInvalid");
  // Accept both our own wrapper and a raw config.local.json, so an exported file
  // and a hand kept backup are interchangeable.
  const payload = isJsonObject(parsed.config) ? (parsed.config as Json) : parsed;
  const rawProfiles = payload.profiles;
  if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
    throw new Error(parsed.kind === CONFIG_TRANSFER_KIND ? "config.importEmpty" : "config.importInvalid");
  }
  const profiles: ConfigTransferProfile[] = [];
  const seen = new Set<string>();
  rawProfiles.forEach((item, index) => {
    if (!isJsonObject(item)) return;
    const engine = String(item.engine || "").trim();
    if (engine !== "gpt-image-2" && engine !== "banana") return;
    const id = String(item.id || `${engine}-${index + 1}`).trim();
    const key = `${engine}::${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    profiles.push({
      id,
      engine,
      name: String(item.name || "").trim(),
      form: formWithoutSecrets(item.form, engine),
    });
  });
  if (profiles.length === 0) throw new Error("config.importInvalid");
  const rawActive = isJsonObject(payload.active_profile_ids) ? payload.active_profile_ids : {};
  return {
    kind: CONFIG_TRANSFER_KIND,
    transfer_version: Number(payload.transfer_version) || CONFIG_TRANSFER_VERSION,
    app_version: String(payload.app_version || ""),
    exported_at: String(payload.exported_at || ""),
    active_engine: String(payload.active_engine || ""),
    active_profile_ids: Object.fromEntries(
      Object.entries(rawActive).map(([engine, id]) => [engine, String(id)]),
    ),
    profiles,
  };
}

/**
 * Apply an imported file on top of the local config.
 *
 * Non-destructive: profiles that already exist here (same engine + id, or the
 * same endpoint URL) are updated in place, the rest are appended, and nothing
 * local is ever removed. Local API keys always win, so importing a shared file
 * cannot overwrite the key already trusted on this machine.
 */
export function mergeImportedConfig(
  currentProfiles: ConfigTransferProfile[],
  currentActiveProfileIds: Record<string, string>,
  imported: ConfigTransferPayload,
): MergeResult {
  const merged: ConfigTransferProfile[] = currentProfiles.map((profile) => ({
    ...profile,
    form: { ...profile.form },
  }));
  const importedIds = new Map<string, string>();
  let addedCount = 0;
  let updatedCount = 0;
  let keptKeyCount = 0;
  let keysMissing = 0;
  imported.profiles.forEach((profile) => {
    const endpoint = endpointKey(profile);
    const sameId = merged.findIndex((local) => profileKey(local) === profileKey(profile));
    const targetIndex = endpoint && sameId >= 0 && endpointKey(merged[sameId]) === endpoint
      ? sameId
      : endpoint ? merged.findIndex((local) => endpointKey(local) === endpoint) : -1;
    const local = targetIndex >= 0 ? merged[targetIndex] : undefined;
    const localKey = String(local?.form.api_key || "").trim();
    if (localKey) keptKeyCount += 1;
    else keysMissing += 1;
    let id = local?.id || profile.id;
    for (let suffix = 1; !local && merged.some((item) => item.engine === profile.engine && item.id === id); suffix += 1) {
      id = `${profile.id}-import-${suffix}`;
    }
    // Imported connection metadata must never attach to an existing local pair.
    // Each imported profile is independent until explicitly linked on this machine.
    const next = {
      ...profile, id, name: local?.name || profile.name,
      form: { ...profile.form, api_key: localKey, credential_ref: "", credential_pair_id: "" },
    };
    importedIds.set(profileKey(profile), id);
    if (local) {
      // Preserve a valid local pairing only when the endpoint is unchanged.
      next.form.credential_ref = String(local.form.credential_ref || "");
      next.form.credential_pair_id = String(local.form.credential_pair_id || "");
      merged[targetIndex] = next;
      updatedCount += 1;
    } else {
      merged.push(next);
      addedCount += 1;
    }
  });
  const activeProfileIds = { ...currentActiveProfileIds };
  Object.entries(imported.active_profile_ids).forEach(([engine, id]) => {
    const resolved = importedIds.get(`${engine}::${id}`);
    if (resolved) activeProfileIds[engine] = resolved;
  });
  return { profiles: merged, activeProfileIds, addedCount, updatedCount, keptKeyCount, keysMissing };
}
