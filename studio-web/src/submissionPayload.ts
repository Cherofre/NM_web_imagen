export type GptSubmissionConfig = Record<string, string | number | boolean>;
export type BananaSubmissionConfig = Record<string, string | number | boolean>;

export type SubmissionFields = Array<[string, string]>;

export function buildSubmissionFields(
  engine: "gpt-image-2" | "banana",
  prompt: string,
  gpt: GptSubmissionConfig,
  banana: BananaSubmissionConfig,
  gptTextDraft?: { context_prompt?: string; negative_prompt?: string; poster_text?: string },
): SubmissionFields {
  const fields: SubmissionFields = [];
  if (engine === "banana") {
    Object.entries(banana).forEach(([key, value]) => {
      fields.push([key, String(value)]);
    });
    fields.push(["prompt", prompt]);
    if (gptTextDraft?.context_prompt) {
      fields.push(["context_prompt", gptTextDraft.context_prompt]);
    }
    return fields;
  }

  Object.entries(gpt).forEach(([key, value]) => {
    fields.push([key, String(value)]);
  });
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
