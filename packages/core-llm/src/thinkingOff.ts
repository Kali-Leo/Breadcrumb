/**
 * Purpose: the request fields that turn a model's own deliberation off. Several providers ship
 * it on by default, and it is billed: the tokens the model spends thinking are charged at the
 * output rate, and the provider also prepends its own instructions to the prompt.
 *
 * Measured against deepseek-v4-flash on short prompts: leaving it on took input from 18 to 97
 * tokens and output from 14 to 29, of which 10 were deliberation — 3.1x the cost of the same
 * answer. Breadcrumb prices every feature from prompts that carry none of this, so a request
 * that leaves it on charges the learner several times what the spending page told them.
 *
 * The field name differs per provider and an unknown field is a 400 on some of them, so this
 * is keyed off the model name, the way the browser scripts do it. A model nobody here knows
 * gets nothing extra, which is the safe default: at worst it deliberates and costs more, and
 * that shows up in the ledger rather than breaking the call.
 * Main exports: thinkingOffFields.
 */
export function thinkingOffFields(model: string): Readonly<Record<string, unknown>> {
  const name = model.toLowerCase();
  if (name.startsWith("deepseek")) return { thinking: { type: "disabled" } };
  // Qwen3 and its distillations, wherever they are hosted. Left on, a batch takes about
  // ninety seconds and the answer overruns max_tokens mid-JSON.
  if (/qwen3/.test(name)) return { enable_thinking: false };
  return {};
}
