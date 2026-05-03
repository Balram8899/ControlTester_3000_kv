export const PROVIDER_MODELS: Record<string, string[]> = {
  gemini: ["gemini-3-flash-preview"],
  openai: ["gpt-5.5", "gpt-5.4"],
  kimi: ["kimi-k2.6"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6"],
  ollama: ["llama3:latest"],
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  ollama: "Ollama",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}
