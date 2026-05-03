import assert from "node:assert/strict";

import { PROVIDER_MODELS, providerLabel } from "./llm-provider-models";

assert.equal(PROVIDER_MODELS.kimi[0], "kimi-k2.6");
assert.equal(PROVIDER_MODELS.deepseek[0], "deepseek-v4-pro");
assert.ok(PROVIDER_MODELS.deepseek.includes("deepseek-v4-flash"));
assert.ok(PROVIDER_MODELS.deepseek.includes("deepseek-reasoner"));
assert.equal(providerLabel("deepseek"), "DeepSeek");
assert.equal(providerLabel("kimi"), "Kimi");

console.log("llm provider models ok");
