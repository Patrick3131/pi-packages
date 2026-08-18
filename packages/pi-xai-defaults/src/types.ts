export const XAI_DEFAULT_TOOL_KEYS = [
	"web_search",
	"xai_generate_text",
	"xai_x_search",
	"xai_multi_agent",
	"xai_deep_research",
	"xai_code_execution",
	"xai_generate_image",
	"xai_edit_image",
	"xai_image_to_video",
	"xai_analyze_image",
	"xai_critique",
] as const;

export type XaiDefaultToolKey = (typeof XAI_DEFAULT_TOOL_KEYS)[number];

export type XaiDefaultsTools = Record<XaiDefaultToolKey, boolean>;

export type XaiDefaultsConfig = {
	enabled: boolean;
	tools: XaiDefaultsTools;
};
