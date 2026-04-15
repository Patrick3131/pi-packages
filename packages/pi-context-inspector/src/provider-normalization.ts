import { estimateTokens } from "./parser.js";
import type {
  PayloadNormalizationResult,
  PayloadNormalizedMessage,
  PayloadNormalizedSection,
  PayloadNormalizedTool,
  ProviderFamily,
  ProviderShapeCaveat,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function measureSection(label: string, text: string, raw?: unknown): PayloadNormalizedSection {
  return {
    label,
    text,
    chars: text.length,
    tokens: estimateTokens(text),
    raw,
  };
}

function measureMessage(index: number, role: string, text: string, raw?: unknown): PayloadNormalizedMessage {
  return {
    index,
    role,
    label: `${role} #${String(index + 1)}`,
    text,
    chars: text.length,
    tokens: estimateTokens(text),
    raw,
  };
}

function pushMessageIfMeaningful(
  messages: PayloadNormalizedMessage[],
  index: number,
  role: string,
  text: string,
  raw?: unknown
): void {
  const trimmed = text.trim();
  if (!trimmed && role === "unknown") {
    return;
  }
  messages.push(measureMessage(index, role, text, raw));
}

function measureTool(index: number, name: string, description: string, raw?: unknown): PayloadNormalizedTool {
  const serialized = JSON.stringify(
    {
      name,
      description,
      raw,
    },
    null,
    2
  );
  return {
    index,
    name,
    description,
    serialized,
    chars: serialized.length,
    tokens: estimateTokens(serialized),
    raw,
  };
}

function textFromParts(parts: unknown[], caveats: Set<ProviderShapeCaveat>): string {
  const values: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      values.push(part);
      continue;
    }
    if (!isRecord(part)) {
      continue;
    }
    const candidate =
      asText(part.text) ||
      asText(part.input_text) ||
      asText(part.content) ||
      asText(part.output_text) ||
      asText(part.reasoning);
    if (candidate) {
      values.push(candidate);
    } else if (part.type === "text" || part.type === "input_text" || part.type === "output_text") {
      const text = asText((part as { text?: unknown }).text);
      if (text) {
        values.push(text);
      }
    } else {
      caveats.add("non-text-content-omitted");
      caveats.add("multimodal-content-approximate");
    }
  }
  return values.join("\n\n").trim();
}

function textFromUnknownContent(content: unknown, caveats: Set<ProviderShapeCaveat>): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return textFromParts(content, caveats);
  }
  if (isRecord(content)) {
    if (Array.isArray(content.parts)) {
      return textFromParts(content.parts, caveats);
    }
    if (Array.isArray(content.content)) {
      return textFromParts(content.content, caveats);
    }
    return asText(content.text) || asText(content.content);
  }
  return "";
}

function detectProviderFamily(payload: Record<string, unknown>): ProviderFamily {
  if (Array.isArray(payload.input) || payload.instructions !== undefined) {
    return "openai-responses";
  }
  if (Array.isArray(payload.contents) || payload.system_instruction !== undefined) {
    return "gemini";
  }
  if (payload.system !== undefined && Array.isArray(payload.messages)) {
    return "anthropic";
  }
  if (Array.isArray(payload.messages)) {
    return "openai-chat";
  }
  return "unknown";
}

function normalizeAnthropic(payload: Record<string, unknown>, caveats: Set<ProviderShapeCaveat>): PayloadNormalizationResult {
  const system: PayloadNormalizedSection[] = [];
  const messages: PayloadNormalizedMessage[] = [];
  const tools: PayloadNormalizedTool[] = [];

  if (typeof payload.system === "string") {
    system.push(measureSection("system", payload.system, payload.system));
  } else if (Array.isArray(payload.system)) {
    const text = textFromParts(payload.system, caveats);
    if (text) {
      system.push(measureSection("system", text, payload.system));
    }
  } else {
    caveats.add("top-level-system-missing");
  }

  if (Array.isArray(payload.messages)) {
    payload.messages.forEach((message, index) => {
      if (!isRecord(message)) {
        return;
      }
      const role = asText(message.role) || "unknown";
      const text = textFromUnknownContent(message.content, caveats);
      pushMessageIfMeaningful(messages, index, role, text, message);
      if (role === "system") {
        caveats.add("system-in-message");
      }
    });
  }

  if (Array.isArray(payload.tools)) {
    payload.tools.forEach((tool, index) => {
      if (!isRecord(tool)) {
        return;
      }
      tools.push(measureTool(index, asText(tool.name) || `tool-${String(index + 1)}`, asText(tool.description), tool));
    });
  }

  return {
    providerFamily: "anthropic",
    modelId: asText(payload.model) || undefined,
    status: caveats.has("top-level-system-missing") || caveats.has("non-text-content-omitted") ? "partial" : "full",
    system,
    messages,
    tools,
    otherFields: buildOtherFields(payload, ["model", "system", "messages", "tools"]),
    caveats: [...caveats],
  };
}

function normalizeOpenAIChat(payload: Record<string, unknown>, caveats: Set<ProviderShapeCaveat>): PayloadNormalizationResult {
  const system: PayloadNormalizedSection[] = [];
  const messages: PayloadNormalizedMessage[] = [];
  const tools: PayloadNormalizedTool[] = [];

  if (Array.isArray(payload.messages)) {
    payload.messages.forEach((message, index) => {
      if (!isRecord(message)) {
        return;
      }
      const role = asText(message.role) || "unknown";
      const text = textFromUnknownContent(message.content, caveats);
      if (role === "system" || role === "developer") {
        system.push(measureSection(`${role} #${String(index + 1)}`, text, message));
        caveats.add("system-in-message");
      } else {
        pushMessageIfMeaningful(messages, index, role, text, message);
      }
    });
  }

  if (system.length === 0) {
    caveats.add("top-level-system-missing");
  }

  if (Array.isArray(payload.tools)) {
    payload.tools.forEach((tool, index) => {
      if (!isRecord(tool)) {
        return;
      }
      if (isRecord(tool.function)) {
        tools.push(
          measureTool(
            index,
            asText(tool.function.name) || `tool-${String(index + 1)}`,
            asText(tool.function.description),
            tool
          )
        );
      } else {
        caveats.add("tools-provider-specific");
        tools.push(measureTool(index, asText(tool.name) || `tool-${String(index + 1)}`, asText(tool.description), tool));
      }
    });
  }

  return {
    providerFamily: "openai-chat",
    modelId: asText(payload.model) || undefined,
    status: caveats.size > 0 ? "partial" : "full",
    system,
    messages,
    tools,
    otherFields: buildOtherFields(payload, ["model", "messages", "tools"]),
    caveats: [...caveats],
  };
}

function normalizeOpenAIResponses(payload: Record<string, unknown>, caveats: Set<ProviderShapeCaveat>): PayloadNormalizationResult {
  const system: PayloadNormalizedSection[] = [];
  const messages: PayloadNormalizedMessage[] = [];
  const tools: PayloadNormalizedTool[] = [];
  const consumedKeys = ["model", "input", "instructions", "tools"];

  const instructionsText = textFromUnknownContent(payload.instructions, caveats);
  if (instructionsText) {
    system.push(measureSection("instructions (top-level)", instructionsText, payload.instructions));
  }

  if (typeof payload.input === "string") {
    pushMessageIfMeaningful(messages, 0, "user", payload.input, payload.input);
  } else if (Array.isArray(payload.input)) {
    payload.input.forEach((message, index) => {
      if (typeof message === "string") {
        pushMessageIfMeaningful(messages, index, "user", message, message);
        return;
      }
      if (!isRecord(message)) {
        return;
      }
      const role = asText(message.role) || "unknown";
      const text = textFromUnknownContent(message.content ?? message.input ?? message, caveats);
      if (role === "system" || role === "developer") {
        system.push(measureSection(`${role} #${String(index + 1)}`, text, message));
        caveats.add("system-in-message");
      } else {
        pushMessageIfMeaningful(messages, index, role, text, message);
      }
    });
  }

  if (system.length === 0) {
    caveats.add("top-level-system-missing");
  }

  if (Array.isArray(payload.tools)) {
    payload.tools.forEach((tool, index) => {
      if (!isRecord(tool)) {
        return;
      }
      if (isRecord(tool.function)) {
        tools.push(
          measureTool(
            index,
            asText(tool.function.name) || `tool-${String(index + 1)}`,
            asText(tool.function.description),
            tool
          )
        );
      } else {
        tools.push(measureTool(index, asText(tool.name) || `tool-${String(index + 1)}`, asText(tool.description), tool));
      }
    });
  }

  return {
    providerFamily: "openai-responses",
    modelId: asText(payload.model) || undefined,
    status: caveats.has("non-text-content-omitted") || caveats.has("multimodal-content-approximate") ? "partial" : "full",
    system,
    messages,
    tools,
    otherFields: buildOtherFields(payload, consumedKeys),
    caveats: [...caveats],
  };
}

function normalizeGemini(payload: Record<string, unknown>, caveats: Set<ProviderShapeCaveat>): PayloadNormalizationResult {
  const system: PayloadNormalizedSection[] = [];
  const messages: PayloadNormalizedMessage[] = [];
  const tools: PayloadNormalizedTool[] = [];

  if (isRecord(payload.system_instruction)) {
    const text = textFromUnknownContent(payload.system_instruction, caveats);
    if (text) {
      system.push(measureSection("system_instruction", text, payload.system_instruction));
    }
  } else {
    caveats.add("top-level-system-missing");
  }

  if (Array.isArray(payload.contents)) {
    payload.contents.forEach((message, index) => {
      if (!isRecord(message)) {
        return;
      }
      const role = (asText(message.role) || "unknown").replace("model", "assistant");
      const text = textFromUnknownContent(message.parts ?? message.content, caveats);
      pushMessageIfMeaningful(messages, index, role, text, message);
    });
  }

  if (Array.isArray(payload.tools)) {
    payload.tools.forEach((toolGroup, index) => {
      if (!isRecord(toolGroup)) {
        return;
      }
      if (Array.isArray(toolGroup.functionDeclarations)) {
        toolGroup.functionDeclarations.forEach((declaration, declarationIndex) => {
          if (!isRecord(declaration)) {
            return;
          }
          tools.push(
            measureTool(
              index + declarationIndex,
              asText(declaration.name) || `tool-${String(index + 1)}`,
              asText(declaration.description),
              declaration
            )
          );
        });
      } else {
        caveats.add("tools-provider-specific");
      }
    });
  }

  return {
    providerFamily: "gemini",
    modelId: asText(payload.model) || undefined,
    status: caveats.size > 0 ? "partial" : "full",
    system,
    messages,
    tools,
    otherFields: buildOtherFields(payload, ["model", "system_instruction", "contents", "tools"]),
    caveats: [...caveats],
  };
}

function buildOtherFields(payload: Record<string, unknown>, consumedKeys: string[]): PayloadNormalizedSection[] {
  const sections: PayloadNormalizedSection[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (consumedKeys.includes(key)) {
      continue;
    }
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    sections.push(measureSection(key, text, value));
  }
  return sections;
}

export function normalizeProviderPayload(payload: unknown): PayloadNormalizationResult {
  if (!isRecord(payload)) {
    return {
      providerFamily: "unknown",
      status: "unknown",
      modelId: undefined,
      system: [],
      messages: [],
      tools: [],
      otherFields: payload === undefined ? [] : [measureSection("raw", JSON.stringify(payload, null, 2), payload)],
      caveats: ["unknown-provider-shape"],
    };
  }

  const caveats = new Set<ProviderShapeCaveat>();
  const family = detectProviderFamily(payload);

  switch (family) {
    case "anthropic":
      return normalizeAnthropic(payload, caveats);
    case "openai-chat":
      return normalizeOpenAIChat(payload, caveats);
    case "openai-responses":
      return normalizeOpenAIResponses(payload, caveats);
    case "gemini":
      return normalizeGemini(payload, caveats);
    default:
      return {
        providerFamily: "unknown",
        status: "unknown",
        modelId: asText(payload.model) || undefined,
        system: [],
        messages: [],
        tools: [],
        otherFields: [measureSection("raw", JSON.stringify(payload, null, 2), payload)],
        caveats: ["unknown-provider-shape"],
      };
  }
}
