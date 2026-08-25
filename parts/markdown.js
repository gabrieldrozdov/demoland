// ———————————————————————————
// MARKDOWN
// the small markdown renderer behind every demo brief, shared by the build and the editor so a description looks the same whether it was baked at build time or typed into the info panel
// on top of ordinary markdown it understands three shortcodes: [[Label]](url) for a big button, a ```tree fenced block for a file tree, and a ```faq fenced block for a click-to-expand accordion
// ———————————————————————————
const escapeHtml = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// the icons the renderer bakes into its output; build.mjs spreads these into its own icon set so there is one copy
export const MD_ICONS = {
	arrowRight:
		'<svg viewBox=\"0 0 100 100\"><polygon points=\"21.15 45 59.7 45 43.45 28.75 50.52 21.68 78.85 50 50.52 78.32 43.45 71.25 59.7 55 21.15 55 21.15 45\"/></svg>',
	extLink:
		'<svg viewBox=\"0 0 100 100\"><polygon points=\"26.06 66.86 53.32 39.61 30.34 39.61 30.34 29.61 70.4 29.6 70.39 69.66 60.39 69.66 60.39 46.68 33.14 73.94 26.06 66.86\"/></svg>',
	chevron:
		'<svg viewBox=\"0 0 100 100\"><polygon points=\"71.25 32.3 50 53.55 28.75 32.3 21.68 39.37 50 67.7 78.32 39.37 71.25 32.3\"/></svg>'
};

// minimal markdown -> html for the static brief (the client still renders the live brief with full marked; this just needs to be reasonable for crawlers)
function renderInline(text) {
	text = escapeHtml(text);
	text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
	text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	text = text.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
	text = text.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		(_, t, u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`
	);
	return text;
}
// a "big button" call-to-action link, authored on its own line as [[Label]](url) — external urls (http, mailto, //) open in a new tab and get a ↗ arrow, internal ones (e.g. another demo path) open in the same tab, and consecutive buttons flow in a row
const BUTTON_RE = /^\s*\[\[([^\]]+)\]\]\(([^)]+)\)\s*$/;
function renderButton(label, url) {
	url = url.trim();
	const ext = /^(https?:|mailto:|\/\/)/i.test(url);
	const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
	const arrow = ext ? MD_ICONS.extLink : "";
	return `<a class="md-button" href="${escapeHtml(url)}"${attrs}><span>${renderInline(label.trim())}</span>${arrow}</a>`;
}
// render a ```tree fenced block as a file tree: indentation (tabs or 2 spaces per level) defines nesting, a name ending in "/" or having children is a folder, connector lines (├─ └─ │) are drawn, and folder vs file names get distinct classes for styling
// render a node tree ({name, children}) as a <pre> with ├─ └─ │ connectors
export function treeToHtml(children, id) {
	const isFolder = (n) => /\/$/.test(n.name) || n.children.length > 0;
	const out = [];
	const walk = (nodes, prefix) =>
		nodes.forEach((n, idx) => {
			const last = idx === nodes.length - 1;
			const nm = `${escapeHtml(String(n.name).replace(/\/$/, ""))}${isFolder(n) ? "/" : ""}`;
			out.push(
				`${escapeHtml(prefix + (last ? "└─ " : "├─ "))}<span class="ftree-${isFolder(n) ? "folder" : "file"}">${nm}</span>`
			);
			if (n.children.length) walk(n.children, prefix + (last ? "   " : "│  "));
		});
	walk(children, "");
	return `<pre class="filetree"${id ? ` id="${id}"` : ""}>${out.join("\n")}</pre>`;
}
function renderFileTree(lines) {
	// a ```tree fenced block: 2-space (or tab) indentation = nesting
	const root = { children: [] },
		byDepth = [root];
	lines
		.filter((l) => l.trim() !== "")
		.forEach((l) => {
			const exp = l.replace(/\t/g, "  ");
			const depth = Math.floor(exp.match(/^ */)[0].length / 2);
			const node = { name: exp.trim(), children: [] };
			(byDepth[depth] || root).children.push(node);
			byDepth[depth + 1] = node;
			byDepth.length = depth + 2;
		});
	return treeToHtml(root.children);
}
function renderFaq(lines) {
	const items = [];
	let cur = null;
	lines.forEach((l) => {
		const m = l.match(/^\s*Q:\s*(.*)$/);
		if (m) {
			cur = { q: m[1], a: [] };
			items.push(cur);
		} else if (cur) cur.a.push(l);
	});
	if (!items.length) return "";
	return `<div class="faq">${items
		.map(
			(it) =>
				`<details class="faq-item"><summary class="faq-q">${renderInline(it.q)}${MD_ICONS.chevron}</summary><div class="faq-a">${mdToHtml(it.a.join("\n").replace(/^\n+|\n+$/g, ""))}</div></details>`
		)
		.join("")}</div>`;
}

export function mdToHtml(md) {
	const lines = md.split("\n");
	let out = "",
		i = 0;
	const isBreak = (l) => /^\s*$/.test(l) || BUTTON_RE.test(l) || /^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>)/.test(l);
	while (i < lines.length) {
		const line = lines[i];
		if (/^```/.test(line)) {
			const lang = (line.match(/^```(\w*)/) || [])[1] || "";
			i++;
			const code = [];
			while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
			i++;
			out += `${
				lang === "tree"
					? renderFileTree(code)
					: lang === "faq"
						? renderFaq(code)
						: `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`
			}\n`;
			continue;
		}
		if (BUTTON_RE.test(line)) {
			const btns = [];
			while (i < lines.length && BUTTON_RE.test(lines[i])) {
				const m = lines[i].match(BUTTON_RE);
				btns.push(renderButton(m[1], m[2]));
				i++;
			}
			out += `<div class="md-buttons">${btns.join("")}</div>\n`;
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			const n = h[1].length;
			out += `<h${n}>` + renderInline(h[2].trim()) + `</h${n}>\n`;
			i++;
			continue;
		}
		if (/^\s*>\s?/.test(line)) {
			const q = [];
			while (i < lines.length && /^\s*>\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
			out += `<blockquote>\n${mdToHtml(q.join("\n"))}\n</blockquote>\n`;
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			const it = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
				it.push(renderInline(lines[i++].replace(/^\s*[-*]\s+/, "")));
			out += `<ul class="md-ul">${it.map((t) => `<li><span class="md-ul-bullet">${MD_ICONS.arrowRight}</span><span class="md-li">${t}</span></li>`).join("")}</ul>\n`;
			continue;
		}
		if (/^\s*\d+\.\s+/.test(line)) {
			const it = [];
			while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]))
				it.push(renderInline(lines[i++].replace(/^\s*\d+\.\s+/, "")));
			out += `<ol class="md-ol">${it.map((t, idx) => `<li><span class="md-ol-bullet">${idx + 1}</span><span class="md-li">${t}</span></li>`).join("")}</ol>\n`;
			continue;
		}
		if (/^\s*$/.test(line)) {
			i++;
			continue;
		}
		const para = [line];
		i++;
		while (i < lines.length && !isBreak(lines[i])) para.push(lines[i++]);
		out += `<p>${renderInline(para.join(" "))}</p>\n`;
	}
	return out.trim();
}
