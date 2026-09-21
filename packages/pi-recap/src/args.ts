export interface RecapArgs {
	help: boolean;
	limit?: number;
	preview?: number;
	full: boolean;
	messages: boolean;
	text: boolean;
	open: boolean;
	summarize: boolean;
	model?: string;
	yes: boolean;
	auto?: "on" | "off" | "status";
	errors: string[];
}

export const RECAP_HELP = [
	"/recap — render this session as user questions with short, expandable answers.",
	"",
	"Usage: /recap [options]",
	"  --limit <n>          Keep only the last n exchanges",
	"  --preview <chars>    Collapsed answer preview length (default 320)",
	"  --full               Do not shorten answers",
	"  --messages           Plain transcript: full answers, no tool lines, no summaries",
	"  --text               Write a plain-text recap instead of HTML",
	"  --no-open            Do not open the browser",
	"  --summarize          Add a cached model-written TL;DR per exchange",
	"  --model <provider/id> Model used for --summarize",
	"  --yes                Skip the summarize cost confirmation",
	"  auto on|off|status   Keep summaries fresh after every turn",
	"  help                 Show this help",
	"  --help               Show this help",
	"",
	"Generated recap files are deleted after 14 days (configure with",
	"PI_RECAP_RETENTION_DAYS or the retentionDays setting; 0 keeps them).",
	"",
	"Alias: /user-messages",
].join("\n");

function tokenize(raw: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: string | null = null;
	for (const char of raw) {
		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}

function parsePositiveInt(raw: string, flag: string, errors: string[]): number | undefined {
	if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
		errors.push(`${flag} expects a positive integer`);
		return undefined;
	}
	return Number(raw);
}

export function parseRecapArgs(raw: string): RecapArgs {
	const args: RecapArgs = {
		help: false,
		full: false,
		messages: false,
		text: false,
		open: true,
		summarize: false,
		yes: false,
		errors: [],
	};

	const tokens = tokenize(raw);
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		const equals = token.startsWith("--") ? token.indexOf("=") : -1;
		const flag = equals > 0 ? token.slice(0, equals) : token;
		const inline = equals > 0 ? token.slice(equals + 1) : undefined;
		const takeValue = (): string | undefined => {
			if (inline !== undefined) return inline;
			const next = tokens[index + 1];
			if (next === undefined) return undefined;
			index++;
			return next;
		};

		switch (flag) {
			case "--help":
			case "-h":
				args.help = true;
				break;
			case "--model": {
				const value = takeValue();
				if (!value) args.errors.push("--model expects a value");
				else args.model = value;
				break;
			}
			case "--limit": {
				const value = takeValue();
				if (value === undefined) args.errors.push("--limit expects a positive integer");
				else args.limit = parsePositiveInt(value, "--limit", args.errors);
				break;
			}
			case "--preview": {
				const value = takeValue();
				if (value === undefined) args.errors.push("--preview expects a positive integer");
				else args.preview = parsePositiveInt(value, "--preview", args.errors);
				break;
			}
			case "--full":
				args.full = true;
				break;
			case "--messages":
				args.messages = true;
				break;
			case "--text":
				args.text = true;
				break;
			case "--open":
				args.open = true;
				break;
			case "--no-open":
				args.open = false;
				break;
			case "--summarize":
				args.summarize = true;
				break;
			case "--yes":
			case "-y":
				args.yes = true;
				break;
			case "auto": {
				const value = takeValue() ?? "";
				if (value === "on" || value === "off" || value === "status") args.auto = value;
				else args.errors.push(`unknown auto action: ${value}`);
				break;
			}
			case "help":
				args.help = true;
				break;
			default:
				if (token.startsWith("-")) args.errors.push(`unknown flag: ${token}`);
				else args.errors.push(`unexpected argument: ${token}`);
		}
	}

	return args;
}
