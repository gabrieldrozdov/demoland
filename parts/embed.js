// ———————————————————————————
// EMBED MODE
// reads the ?embed= url token and returns which panels and features a slim embed shows; segments are i · c|c0|c1|c2 · p|p0|p1|p2 · ro · d (each optional, a missing one turns that feature off, see readEmbed), and any ?embed with no recognized code falls back to the full 3-panel embed
// ———————————————————————————
const DEFAULT_EMBED = {
	info: true,
	code: true,
	preview: true,
	notes: true,
	notesExp: false,
	content: "pc",
	readonly: false,
	dimensions: true,
	accentColor: null
};
export function readEmbed() {
	let p = new URLSearchParams(location.search),
		v = p.get("embed");
	if (v == null && location.hash) {
		try {
			v = new URLSearchParams(location.hash.replace(/^#/, "")).get("embed");
		} catch (e) {}
	}
	if (v == null) return null; // no `embed` param at all -> not an embed
	let info = false,
		code = false,
		notes = false,
		notesExp = false;
	let previewPanel = false,
		content = "pc",
		ro = false,
		dim = false,
		recognized = false;
	String(v)
		.split(".")
		.forEach(function (s) {
			if (s === "i") {
				info = true;
				recognized = true;
			} else if (s === "c" || s === "c0") {
				code = true;
				notes = true;
				notesExp = false;
				recognized = true;
			} // bare c == c0
			else if (s === "c1") {
				code = true;
				notes = true;
				notesExp = true;
				recognized = true;
			} else if (s === "c2") {
				code = true;
				notes = false;
				recognized = true;
			} else if (s === "p" || s === "p0") {
				previewPanel = true;
				content = "pc";
				recognized = true;
			} // bare p == p0
			else if (s === "p1") {
				previewPanel = true;
				content = "p";
				recognized = true;
			} else if (s === "p2") {
				previewPanel = true;
				content = "c";
				recognized = true;
			} else if (s === "ro") {
				ro = true;
				recognized = true;
			} else if (s === "d") {
				dim = true;
				recognized = true;
			}
		});
	if (!recognized) return DEFAULT_EMBED; // any ?embed with a garbage/empty token -> default
	return {
		info: info,
		code: code,
		preview: previewPanel,
		notes: code && notes,
		notesExp: code && notes && notesExp,
		content: content,
		readonly: ro,
		dimensions: dim && previewPanel && content !== "c", // dimensions hidden when the preview is disabled
		accentColor: null
	};
}
