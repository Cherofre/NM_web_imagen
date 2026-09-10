/**
 * Shared credentials across engines.
 *
 * A relay key usually serves both the OpenAI style image endpoints
 * (`gpt-image-2`) and the Gemini style ones (`banana`), and it is normally the
 * same host too. So the *credential layer* — API key plus request address — can be
 * shared between the two engine forms, while the models stay engine specific:
 * the GPT form only knows image and chat models, the Gemini form only knows a
 * Gemini model name.
 *
 * The shared values are mirrored into both forms, so generation, diagnostics,
 * saving and export keep working unchanged and the saved configuration stays
 * complete for other clients such as the classic page.
 */

export type EngineId = "gpt-image-2" | "banana";

/** Where each engine keeps its request address; the key field is shared by name. */
export const CREDENTIAL_URL_FIELD: Record<EngineId, string> = {
  "gpt-image-2": "base_url",
  banana: "api_base_url",
};

/** Form fields that belong to the shared credential layer. */
export const CREDENTIAL_FIELDS = ["api_key", "base_url", "api_base_url"];

type Form = Record<string, unknown>;

/**
 * `"shared"` means "keep the key and the address in step with the other engine",
 * `""` means this form keeps its own. Legacy files stored the source engine name,
 * which meant the same thing, so both are accepted.
 */
export function normalizeCredentialRef(value: unknown): "shared" | "" {
  const text = String(value ?? "").trim();
  if (text === "shared") return "shared";
  return text === "gpt-image-2" || text === "banana" ? "shared" : "";
}

export function isSharedCredential(form: Form | undefined): boolean {
  return normalizeCredentialRef(form?.credential_ref) === "shared";
}

/** Placeholder addresses shipped as defaults: never let them overwrite real ones. */
export function isPlaceholderAddress(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return true;
  return text.includes("example.com") || text.includes("example.org");
}

export function otherEngine(self: EngineId): EngineId {
  return self === "banana" ? "gpt-image-2" : "banana";
}

/**
 * The credential both engines should end up with.
 *
 * The side the user is on wins when it has something real to offer, so turning
 * sharing on from the Gemini page pulls the key and address across from the GPT
 * page (and vice versa) instead of blanking anything out.
 */
export function sharedCredentialPatch(
  self: EngineId,
  forms: Record<EngineId, Form>,
): { api_key: string; base_url: string; api_base_url: string } {
  const other = otherEngine(self);
  const selfForm = forms[self] || {};
  const otherForm = forms[other] || {};
  const selfKey = String(selfForm.api_key ?? "").trim();
  const otherKey = String(otherForm.api_key ?? "").trim();
  const key = selfKey || otherKey;

  const selfUrl = String(selfForm[CREDENTIAL_URL_FIELD[self]] ?? "").trim();
  const otherUrl = String(otherForm[CREDENTIAL_URL_FIELD[other]] ?? "").trim();
  const selfReal = !isPlaceholderAddress(selfUrl);
  const otherReal = !isPlaceholderAddress(otherUrl);
  const url = selfReal ? selfUrl : otherReal ? otherUrl : selfUrl || otherUrl;

  return {
    api_key: key,
    [CREDENTIAL_URL_FIELD[self]]: url,
    [CREDENTIAL_URL_FIELD[other]]: url,
  } as { api_key: string; base_url: string; api_base_url: string };
}

/**
 * Mirror a credential edit onto the other engine while sharing is on.
 * Returns an empty object when there is nothing to mirror.
 */
export function mirroredCredentialPatch(
  self: EngineId,
  patch: Form,
  shared: boolean,
): Form {
  if (!shared) return {};
  const other = otherEngine(self);
  const mirrored: Form = {};
  if ("api_key" in patch) mirrored.api_key = patch.api_key;
  const selfUrlField = CREDENTIAL_URL_FIELD[self];
  const otherUrlField = CREDENTIAL_URL_FIELD[other];
  if (selfUrlField in patch) mirrored[otherUrlField] = patch[selfUrlField];
  if (otherUrlField in patch) mirrored[selfUrlField] = patch[otherUrlField];
  return mirrored;
}

/** Names the app generates for fresh profiles, in both languages. */
const GENERATED_PROFILE_NAME = /^(默认配置|default|新配置\s*\d+|new profile\s*\d+)$/i;

export function isGeneratedProfileName(name: unknown): boolean {
  const text = String(name ?? "").trim();
  return !text || GENERATED_PROFILE_NAME.test(text);
}

/**
 * The name a shared credential should use on both engines.
 *
 * A shared credential is one connection, so it should not appear as "SillyDream"
 * on one tab and "默认配置" on the other: the hand written name wins, and only if
 * neither side has one does the side the user is on decide.
 */
export function sharedProfileName(self: EngineId, names: Record<EngineId, string>): string {
  const selfName = String(names[self] ?? "").trim();
  const otherName = String(names[otherEngine(self)] ?? "").trim();
  if (!isGeneratedProfileName(selfName)) return selfName;
  if (!isGeneratedProfileName(otherName)) return otherName;
  return selfName || otherName;
}

export type CredentialProfileLike = {
  id: string;
  engine: EngineId;
  name: string;
  form: Form;
};

/**
 * The profile on the other engine that this shared credential belongs to.
 *
 * Sharing never overwrites whatever the other engine happens to be using: the
 * credential joins an existing shared profile only when it is clearly the same
 * pair, identified by a persisted opaque credential_pair_id.
 * Missing legacy ids or ambiguous matches require a fresh explicit link.
 */
export function findSharedPartner(
  profiles: CredentialProfileLike[],
  self: EngineId,
  pairId: unknown,
): CredentialProfileLike | null {
  const id = String(pairId || "").trim();
  if (!id) return null;
  const matches = profiles.filter((item) => item.engine === otherEngine(self)
    && isSharedCredential(item.form) && item.form.credential_pair_id === id);
  return matches.length === 1 ? matches[0] : null;
}

/** Credential fields carried over when a shared profile is created on `other`. */
export function sharedPartnerCredentialValues(self: EngineId, patch: Form): Form {
  const other = otherEngine(self);
  const values: Form = {};
  if ("api_key" in patch) values.api_key = patch.api_key;
  const otherUrlField = CREDENTIAL_URL_FIELD[other];
  const selfUrlField = CREDENTIAL_URL_FIELD[self];
  values[otherUrlField] = patch[selfUrlField];
  return values;
}
