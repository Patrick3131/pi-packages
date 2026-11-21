import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAdLibrary } from "./features/ad-library/tools.js";
import { registerAmazon } from "./features/amazon/tools.js";
import { registerReddit } from "./features/reddit/tools.js";
import { registerSocial } from "./features/social/tools.js";
import { registerYoutube } from "./features/youtube/tools.js";
import { registerSearxng } from "./features/web-search/tools.js";
import { registerWebAnswer } from "./features/web-answer/tools.js";

export default function discovery(pi: ExtensionAPI): void {
  registerAdLibrary(pi);
  registerAmazon(pi);
  registerReddit(pi);
  registerSocial(pi);
  registerYoutube(pi);
  registerSearxng(pi);
  registerWebAnswer(pi);
}
