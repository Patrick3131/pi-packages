import { Type } from "typebox";
import { CrawlEvidenceSchema } from "./evidence";

export const cardExtractionSchema = Type.Object({
  name: Type.String(),
  baseSelector: Type.String({ description: "CSS selector identifying repeated cards" }),
  fields: Type.Array(Type.Object({
    name: Type.String(), selector: Type.String({ description: "CSS selector relative to each card; empty selects the card" }),
    type: Type.Union([Type.Literal("text"), Type.Literal("attribute")]),
    attribute: Type.Optional(Type.String()),
  }, { additionalProperties: false }), { minItems: 1 }),
}, { additionalProperties: false });
export const crawlInteractToolDefinition = {
  name: "crawl_interact",
  label: "Interact with Website",
  description: "Navigate and interact in one fresh remote browser context. Click, scroll, wait or execute browser JavaScript, then capture complete pre/post source artifacts. No browser state is reused. JavaScript-influenced content is labeled and requires independent corroboration for factual saves. A lost response may leave effects unconfirmed: never automatically replay. Egress remains server-managed.",
  promptSnippet: "Expand dynamic content or execute browser JavaScript through the remote service; inspect saved source with crawl_read.",
  parameters: Type.Object({
    url: Type.String(),
    actions: Type.Optional(Type.Array(Type.Union([
      Type.Object({ type: Type.Literal("click"), selector: Type.String() }),
      Type.Object({ type: Type.Literal("scroll"), x: Type.Optional(Type.Number()), y: Type.Optional(Type.Number()) }),
      Type.Object({ type: Type.Literal("wait"), milliseconds: Type.Number({ minimum: 0 }) }),
      Type.Object({ type: Type.Literal("waitForSelector"), selector: Type.String() }),
      Type.Object({ type: Type.Literal("evaluate"), script: Type.String() }),
    ]))),
    scripts: Type.Optional(Type.Array(Type.String(), { description: "Browser JavaScript executed after the convenience actions" })),
    waitForSelector: Type.Optional(Type.String()),
    selector: Type.Optional(Type.String({ description: "Optional CSS region; uncropped source is preserved" })),
    excludeSelector: Type.Optional(Type.String({ description: "Remove matching regions only from the derived view" })),
    extractionSchema: Type.Optional(cardExtractionSchema),
    format: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("text"), Type.Literal("links")])),
    includeLinks: Type.Optional(Type.Boolean()),
    save: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
    returnMode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("inline"), Type.Literal("files")])),
    maxCharsPerPage: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    maxCharsPerCall: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }),
  structuredOutputSchema: CrawlEvidenceSchema,
};
