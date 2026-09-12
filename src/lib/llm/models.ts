/**
 * Selectable model tiers per provider — top entry is the highest-spec/highest-cost
 * model, each entry below trades capability for lower token cost. Users pick a
 * tier per provider from 설정 to control API token usage without changing code.
 *
 * IDs below were verified against each provider's live /models list for this
 * project's API keys (2026-09) — don't add an ID here without checking it
 * actually exists first, a guessed one will 404 at request time.
 */
export interface ModelOption {
  id: string;
  label: string;
  /** True on the tier that was already this provider's hardcoded default before per-tier selection existed — keeps existing behavior/cost unchanged for anyone who hasn't picked a tier yet. */
  isDefault?: boolean;
}

export function defaultModelId(options: ModelOption[]): string {
  return options.find((o) => o.isDefault)?.id ?? options[0].id;
}

export const CLAUDE_MODEL_OPTIONS: ModelOption[] = [
  { id: "claude-opus-5", label: "Claude Opus 5 (최고 성능 · 높은 비용)", isDefault: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (균형)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (경량 · 저비용)" },
];

export const GEMINI_MODEL_OPTIONS: ModelOption[] = [
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (최고 성능 · 높은 비용)", isDefault: true },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (균형)" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite (경량 · 저비용)" },
];

export const OPENAI_MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-5.5-pro", label: "GPT-5.5 Pro (최고 성능 · 높은 비용)" },
  { id: "gpt-5.5", label: "GPT-5.5 (균형)", isDefault: true },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano (경량 · 저비용)" },
];
