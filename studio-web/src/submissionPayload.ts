export type GptSubmissionConfig = Record<string, string | number | boolean>;
export type BananaSubmissionConfig = Record<string, string | number | boolean>;

export type SubmissionFields = Array<[string, string]>;

/**
 * Local bookkeeping fields that live in the connection form but are not
 * generation parameters. `model_options` caches the upstream model catalogue so
 * the profile can offer a switcher; sending it would only add kilobytes to
 * every multipart request.
 */
const NON_SUBMISSION_KEYS = new Set(["model_options"]);

export function buildSubmissionFields(
  engine: "gpt-image-2" | "banana",
  prompt: string,
  gpt: GptSubmissionConfig,
  banana: BananaSubmissionConfig,
  gptTextDraft?: { context_prompt?: string; negative_prompt?: string; poster_text?: string },
): SubmissionFields {
  const fields: SubmissionFields = [];
  const pushConfig = (config: Record<string, string | number | boolean>) => {
    Object.entries(config).forEach(([key, value]) => {
      if (NON_SUBMISSION_KEYS.has(key)) return;
      fields.push([key, String(value)]);
    });
  };
  if (engine === "banana") {
    pushConfig(banana);
    fields.push(["prompt", prompt]);
    if (gptTextDraft?.context_prompt) {
      fields.push(["context_prompt", gptTextDraft.context_prompt]);
    }
    return fields;
  }

  pushConfig(gpt);
  fields.push(["prompt", prompt]);
  if (gptTextDraft?.context_prompt) {
    fields.push(["context_prompt", gptTextDraft.context_prompt]);
  }
  if (gptTextDraft?.negative_prompt) {
    fields.push(["negative_prompt", gptTextDraft.negative_prompt]);
  }
  if (gptTextDraft?.poster_text) {
    fields.push(["poster_text", gptTextDraft.poster_text]);
  }
  return fields;
}
