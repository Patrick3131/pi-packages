import { estimateTokens } from "./parser.js";
import type { PayloadAnalysisResult, PayloadNormalizationResult } from "./types.js";

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

export function analyzeNormalizedPayload(
  normalization: PayloadNormalizationResult,
  rawPayload: unknown,
  options?: {
    reportContextUsageTokens?: number;
    captureContextUsageTokens?: number;
  }
): PayloadAnalysisResult {
  const systemChars = sum(normalization.system, (item) => item.chars);
  const systemTokens = sum(normalization.system, (item) => item.tokens);
  const messageChars = sum(normalization.messages, (item) => item.chars);
  const messageTokens = sum(normalization.messages, (item) => item.tokens);
  const toolChars = sum(normalization.tools, (item) => item.chars);
  const toolTokens = sum(normalization.tools, (item) => item.tokens);
  const otherChars = sum(normalization.otherFields, (item) => item.chars);
  const otherTokens = sum(normalization.otherFields, (item) => item.tokens);

  const normalizedPayloadCharsEstimate = systemChars + messageChars + toolChars;
  const normalizedPayloadTokensEstimate = systemTokens + messageTokens + toolTokens;
  const serializedPayload = rawPayload === undefined ? "" : JSON.stringify(rawPayload, null, 2);
  const requestJsonCharsEstimate = serializedPayload.length;
  const requestJsonTokensEstimate = serializedPayload ? estimateTokens(serializedPayload) : 0;
  const requestJsonMinusNormalizedCharsEstimate = Math.max(requestJsonCharsEstimate - normalizedPayloadCharsEstimate, 0);
  const requestJsonMinusNormalizedTokensEstimate = Math.max(requestJsonTokensEstimate - normalizedPayloadTokensEstimate, 0);

  return {
    normalizedPayloadCharsEstimate,
    normalizedPayloadTokensEstimate,
    requestJsonCharsEstimate,
    requestJsonTokensEstimate,
    requestJsonMinusNormalizedCharsEstimate,
    requestJsonMinusNormalizedTokensEstimate,
    sections: {
      system: {
        label: "Normalized system / developer instructions",
        count: normalization.system.length,
        chars: systemChars,
        tokens: systemTokens,
      },
      messages: {
        label: "Normalized conversation messages",
        count: normalization.messages.length,
        chars: messageChars,
        tokens: messageTokens,
      },
      tools: {
        label: "Normalized tools",
        count: normalization.tools.length,
        chars: toolChars,
        tokens: toolTokens,
      },
      otherFields: {
        label: "Unclassified request JSON fields",
        count: normalization.otherFields.length,
        chars: otherChars,
        tokens: otherTokens,
      },
    },
    comparison: {
      normalizedPayloadTokensEstimate,
      requestJsonTokensEstimate,
      requestJsonMinusNormalizedTokensEstimate,
      runtimeContextUsageTokens: options?.reportContextUsageTokens,
      captureTimeContextUsageTokens: options?.captureContextUsageTokens,
      runtimeMinusRequestJsonTokensEstimate:
        options?.reportContextUsageTokens != null
          ? options.reportContextUsageTokens - requestJsonTokensEstimate
          : undefined,
    },
  };
}
