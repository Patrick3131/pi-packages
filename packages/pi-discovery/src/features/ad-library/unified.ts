import { Type, type Static } from "typebox";
import {
  linkedinParameters,
  linkedinResponse,
  validCompanyReference,
} from "./linkedin-schema.js";
import { metaResponse } from "./definitions.js";

const fields = linkedinParameters.properties;
const platform = Type.Union([Type.Literal("meta"), Type.Literal("linkedin")], {
  description: "Ad library to search.",
});
const parameters = Type.Object(
  {
    platform,
    keyword: Type.Optional({
      ...fields.keyword,
      description: "Search ads by topic or phrase.",
    }),
    page_id: Type.Optional({
      ...fields.page_id,
      description: "Numeric advertiser page ID on this platform.",
    }),
    domain: Type.Optional(
      Type.String({
        minLength: 3,
        maxLength: 253,
        description:
          "Meta only. Advertiser website hostname, e.g. example.com.",
      }),
    ),
    active_only: Type.Optional(
      Type.Boolean({
        description: "Meta only. Limit results to active ads (default true).",
      }),
    ),
    account_owner: Type.Optional({
      ...fields.account_owner,
      description: "LinkedIn only. Advertiser account name, e.g. Microsoft.",
    }),
    linkedin_url: Type.Optional({
      ...fields.linkedin_url,
      description:
        "LinkedIn only. Company slug or company URL, with or without https://. Use account_owner for a display name.",
    }),
    payer: Type.Optional({
      ...fields.payer,
      description: "LinkedIn only. Find or filter ads by paying entity.",
    }),
    country: Type.Optional({
      ...fields.country,
      description:
        "Two-letter lookup country (default US). LinkedIn also accepts ALL.",
    }),
    date_option: Type.Optional({
      ...fields.date_option,
      description:
        "LinkedIn only. Search period. Choose custom-date-range for explicit dates.",
    }),
    start_date: Type.Optional({
      ...fields.start_date,
      description: "LinkedIn custom range. First day, YYYY-MM-DD.",
    }),
    end_date: Type.Optional({
      ...fields.end_date,
      description:
        "LinkedIn custom range. Last day, before today; at most 364 days inclusive.",
    }),
    sort: Type.Optional({
      ...fields.sort,
      description: "LinkedIn only. Order by newest (default) or oldest.",
    }),
    include_transparency: Type.Optional({
      ...fields.include_transparency,
      description:
        "LinkedIn only. Fetch detail pages for payer, dates, impressions and targeting disclosures (default false).",
    }),
    max_ads: Type.Optional({
      ...fields.max_ads,
      description:
        "Requested maximum, 1–300. Default and minimum effective limit: Meta 10, LinkedIn 24.",
    }),
    timeout_ms: Type.Optional({
      ...fields.timeout_ms,
      description: "Server time budget in milliseconds (default 120000).",
    }),
    cursor: Type.Optional({
      ...fields.cursor,
      description:
        "Opaque continuation token. Pass the returned next_request unchanged.",
    }),
  },
  { additionalProperties: false },
);

export type AdLibraryToolParams = Static<typeof parameters>;
export const adLibraryDefinition = {
  name: "ad_library",
  label: "Ad Library",
  description:
    "Search Meta or LinkedIn ads by keyword or advertiser to find ad copy, creatives, and advertiser details.",
  parameters,
  outputSchema: Type.Object({
    platform,
    status: Type.Union(
      ["ok", "partial", "not_found", "ambiguous", "error"].map((value) =>
        Type.Literal(value),
      ),
    ),
    response: Type.Optional(Type.Union([metaResponse, linkedinResponse])),
    error: Type.Optional(
      Type.Object({ code: Type.String() }, { additionalProperties: true }),
    ),
    next_request: Type.Optional(parameters),
  }),
};

export function inputCorrection(p: AdLibraryToolParams): string | undefined {
  if (p.platform === "meta") {
    const linkedinField = [
      "account_owner",
      "linkedin_url",
      "payer",
      "date_option",
      "start_date",
      "end_date",
      "sort",
      "include_transparency",
    ].find((key) => key in p);
    if (linkedinField)
      return `${linkedinField} is LinkedIn-only. For Meta, use keyword, domain or page_id.`;
    if (
      [p.keyword, p.domain, p.page_id].filter((v) => v !== undefined).length !==
      1
    )
      return "For Meta, supply exactly one of keyword, domain or page_id.";
    if (p.domain && p.cursor)
      return "Start a page_id search to paginate a resolved Meta advertiser.";
    if (p.country?.toUpperCase() === "ALL")
      return "Choose a two-letter country for Meta.";
    return;
  }
  if (p.domain !== undefined || p.active_only !== undefined)
    return "For LinkedIn, use account_owner for an advertiser name or linkedin_url for a company page. domain and active_only are Meta-only.";
  if (
    [p.keyword, p.page_id, p.linkedin_url].filter((v) => v !== undefined)
      .length > 1
  )
    return "Choose at most one LinkedIn keyword, page_id or linkedin_url.";
  if (
    ![p.keyword, p.page_id, p.linkedin_url, p.payer, p.account_owner].some(
      (v) => v?.trim(),
    )
  )
    return "Supply a LinkedIn keyword, page_id, linkedin_url, payer or account_owner.";
  if (p.linkedin_url && !validCompanyReference(p.linkedin_url.trim()))
    return /linkedin\.com\/in\//i.test(p.linkedin_url)
      ? "This is a personal profile. Use a company slug or company URL, or account_owner to search an advertiser name."
      : "Use a LinkedIn company URL or company slug. Use account_owner for a display name.";
  if (p.start_date || p.end_date || p.date_option === "custom-date-range") {
    if (!(p.start_date && p.end_date && p.date_option === "custom-date-range"))
      return "Supply date_option custom-date-range with both start_date and end_date.";
    const dates = [p.start_date, p.end_date].map(
      (value) => new Date(value + "T00:00:00Z"),
    );
    if (
      dates.some(
        (d, i) =>
          !Number.isFinite(d.getTime()) ||
          d.toISOString().slice(0, 10) !== [p.start_date, p.end_date][i],
      ) ||
      p.start_date > p.end_date ||
      p.end_date >= new Date().toISOString().slice(0, 10) ||
      dates[1].getTime() - dates[0].getTime() > 363 * 86400000
    )
      return "Use valid, ordered dates ending before today and spanning at most 364 days inclusive.";
  }
}
