export interface BaseLines {
  toolLines: string[];
  guidelineLines: string[];
}

export interface TraceLineEvidence {
  line: string;
  tokens: number;
  kind: "tool-line" | "guideline-line";
  contributors: string[];
  bucket: "extension" | "shared" | "built-in" | "unattributed";
}

export interface TraceBucket {
  id: string;
  label: string;
  tokens: number;
  lineCount: number;
  pctOfBase: number;
}

export interface TraceError {
  source: string;
  message: string;
}

export interface BasePromptTraceResult {
  fingerprint: string;
  generatedAt: string;
  baseTokens: number;
  buckets: TraceBucket[];
  evidence: TraceLineEvidence[];
  errors: TraceError[];
}

export interface ExtensionToolContribution {
  toolName: string;
  snippet?: string;
  guidelines: string[];
  extensionPath: string;
}

export interface LoadedExtension {
  path: string;
  tools: Map<
    string,
    {
      definition: { promptSnippet?: string; promptGuidelines?: string[] };
      extensionPath: string;
    }
  >;
}
