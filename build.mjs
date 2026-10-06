#!/usr/bin/env node
// ———————————————————————————
// BUILD
// static-site generator: reads collection.json (books -> chapters -> demos) and every demo file, then writes one seo-friendly html file per demo into the project root at a clean <book>/<chapter>/<demo>.html path
// every page gets its own <title>, meta description, canonical + open graph tags, and its brief rendered into the markup, so crawlers see real content rather than "Loading..."; navigation between demos is plain links between these files, with no ?query routing
// also emits a homepage, sitemap.xml, robots.txt and copies the shared assets; set "siteUrl" in collection.json to the deployed origin so canonical/og/sitemap urls are right
// re-run with `node build.mjs` whenever you add or edit a demo, chapter or book
// ———————————————————————————

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { mdToHtml, treeToHtml, MD_ICONS } from "./parts/markdown.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = "editor.template.html";
const COLL = "collection.json";
const OUTDIR = "."; // generate straight into the project root (no dist/ folder)
const ASSETS = ["style.min.css", "editor.js", "chrome.js", "landing.js"];

// ———————————————————————————
// MINIFICATION
// build output only — the source files stay readable, and there is no bundler or minifier dependency: these are small, string-safe passes
// css is fully minified; html pages are dedented with comments stripped, preserving whitespace that affects rendering and the contents of <script>/<style>/<textarea>/<pre>; editor.js ships as-is, since safely minifying js needs a real parser the no-npm constraint rules out, and it is cache-busted and served gzipped anyway
// ———————————————————————————
function minifyCss(css) {
	let s1 = "",
		i = 0,
		n = css.length,
		q = null,
		c;
	while (i < n) {
		// pass 1: strip /* */ comments (string-aware)
		c = css[i];
		if (q) {
			s1 += c;
			if (c === "\\" && i + 1 < n) {
				s1 += css[i + 1];
				i += 2;
				continue;
			}
			if (c === q) q = null;
			i++;
			continue;
		}
		if (c === '"' || c === "'") {
			q = c;
			s1 += c;
			i++;
			continue;
		}
		if (c === "/" && css[i + 1] === "*") {
			i += 2;
			while (i < n && !(css[i] === "*" && css[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		s1 += c;
		i++;
	}
	let out = "";
	i = 0;
	n = s1.length;
	q = null;
	let punct = "{}:;,>";
	while (i < n) {
		// pass 2: collapse whitespace outside strings
		c = s1[i];
		if (q) {
			out += c;
			if (c === "\\" && i + 1 < n) {
				out += s1[i + 1];
				i += 2;
				continue;
			}
			if (c === q) q = null;
			i++;
			continue;
		}
		if (c === '"' || c === "'") {
			q = c;
			out += c;
			i++;
			continue;
		}
		if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f") {
			let j = i;
			while (j < n && /\s/.test(s1[j])) j++;
			let prev = out.charAt(out.length - 1),
				next = j < n ? s1.charAt(j) : "";
			if (prev && next && punct.indexOf(prev) === -1 && punct.indexOf(next) === -1) out += " ";
			i = j;
			continue;
		}
		out += c;
		i++;
	}
	return out.replace(/;}/g, "}").trim();
}
function minifyHtml(html) {
	let protectedRe = /(<(script|style|textarea|pre)\b[^>]*>[\s\S]*?<\/\2>)/gi;
	let parts = html.split(protectedRe),
		out = "";
	for (let i = 0; i < parts.length; i++) {
		if (parts[i] == null) continue;
		if (i % 3 === 0)
			out += parts[i]
				.replace(/<!--[\s\S]*?-->/g, "")
				.replace(/^[ \t]+/gm, "")
				.replace(/\n{2,}/g, "\n");
		else if (i % 3 === 1) out += parts[i]; // protected block, kept verbatim
	}
	return out.trim();
}

// emit the minified stylesheet the built pages link to (source style.css stays readable)
writeFileSync(join(here, "style.min.css"), minifyCss(readFileSync(join(here, "style.css"), "utf8")));

// ———————————————————————————
// CACHE-BUSTING ES-MODULE IMPORTS
// editor.js is a native module importing the files under parts/ (lint.js, media.js, …); the top-level <script src> is cache-busted with ?v=… but a bare `import "./parts/x.js"` is not, so after editing only a part a returning visitor could load a stale copy
// stamp each parts import with the imported file's content hash — this rewrites the served files in place, is idempotent (an existing ?v= is replaced), and leaves lib/ imports alone
// ———————————————————————————
function fileHash(rel) {
	return createHash("sha1")
		.update(readFileSync(join(here, rel)))
		.digest("hex")
		.slice(0, 8);
}
function resolveModulePath(fromDir, spec) {
	const segs = fromDir ? fromDir.split("/") : [];
	for (const seg of spec.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") segs.pop();
		else segs.push(seg);
	}
	return segs.join("/");
}
function stampModuleImports(rel) {
	const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
	const code = readFileSync(join(here, rel), "utf8");
	const out = code.replace(/from(\s+)(["'])(\.[^"']+?\.js)(?:\?v=[0-9a-f]+)?\2/g, (m, sp, q, spec) => {
		const target = resolveModulePath(dir, spec);
		if (!target.startsWith("parts/") || !existsSync(join(here, target))) return m; // only stamp our parts/*
		return `from${sp}${q}${spec}?v=${fileHash(target)}${q}`;
	});
	if (out !== code) writeFileSync(join(here, rel), out);
}
// stamp parts first (so a part imported by another is hashed after its own imports settle), then editor.js
const partModules = existsSync(join(here, "parts"))
	? readdirSync(join(here, "parts"))
			.filter((f) => f.endsWith(".js"))
			.map((f) => `parts/${f}`)
	: [];
[...partModules, "editor.js"].forEach(stampModuleImports);

// cache-busting: a short content hash per shared asset, appended as ?v=… to every reference, so returning visitors only re-download an asset when its bytes actually change
const assetVer = {};
ASSETS.forEach((a) => {
	try {
		assetVer[a] = createHash("sha1")
			.update(readFileSync(join(here, a)))
			.digest("hex")
			.slice(0, 8);
	} catch {
		assetVer[a] = String(Date.now());
	}
});
const assetVersion = (name) => (assetVer[name] ? `?v=${assetVer[name]}` : "");

let pageTemplate = readFileSync(join(here, TEMPLATE), "utf8");
const collection = JSON.parse(readFileSync(join(here, COLL), "utf8"));
const siteBrand = collection.brand || ""; // e.g. "GD with GD"
const siteTitle = collection.title || ""; // e.g. "Demoland"
const siteName = siteTitle + ", by " + siteBrand || siteTitle || siteBrand; // full name for meta/titles
const siteUrl = (collection.siteUrl || "").replace(/\/+$/, ""); // no trailing slash

// ———————————————————————————
// HELPERS
// ———————————————————————————
const escapeHtml = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// the favicon links every page carries, and the placeholder in editor.template.html they replace (a bare data: icon, so the raw template asks for nothing while it is opened straight off disk)
const FAVICON = `<link rel="icon" type="png" href="/assets/meta/favicon.png">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>\u{1F4BB}</text></svg>">`;
const PLACEHOLDER_ICON = '<link rel="icon" href="data:,">';
// the share card every page points at (1200x630)
const OG_IMAGE_PATH = "/assets/meta/opengraph.png";
const OG_IMAGE = `<meta property="og:image" content="${siteUrl ? siteUrl + OG_IMAGE_PATH : OG_IMAGE_PATH}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="${siteUrl ? siteUrl + OG_IMAGE_PATH : OG_IMAGE_PATH}">`;

// topbar crumb icons — the one place to edit these; every topbar (demo pages, book/chapter landing pages, the standalone editor) pulls its crumb icons from here, and the build only ever rewrites the crumb text (wrapped in .tb-kind-text), so these icons are never overwritten; replace the placeholder <rect>s below with your own svg paths
const ICONS = {
	...MD_ICONS,
	book: '<svg viewBox=\"0 0 100 100\"><path d=\"M25,10c-5.52,0-10,4.48-10,10v60c0,5.52,4.48,10,10,10h60V10H25ZM75,80H28c-2.76,0-5-2.24-5-5s2.24-5,5-5h47v10ZM75,60H28V20h47v40Z\"/><rect x=\"38\" y=\"30\" width=\"27\" height=\"10\"/></svg>',
	chapter:
		'<svg viewBox=\"0 0 100 100\"><path d=\"M25,14.97v70.06l25-21.25,25,21.25V14.97H25ZM66,65.56l-16-13.6-16,13.6V23.97h32v41.59Z\"/></svg>',
	demo: '<svg viewBox=\"0 0 100 100\"><path d=\"m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z\"/></svg>',
	folder: '<svg viewBox=\"0 0 100 100\"><path d=\"m60,30V10H10v80h80V30h-30Zm-40-10h30v10h-30v-10Zm0,60v-40h60v40H20Z\"/></svg>',
	arrowLeft:
		'<svg viewBox=\"0 0 100 100\"><polygon points=\"78.85 55 40.3 55 56.55 71.25 49.48 78.32 21.15 50 49.48 21.68 56.55 28.75 40.3 45 78.85 45 78.85 55\"/></svg>',
	bookmark: '<svg viewBox=\"0 0 100 100\"><path d=\"M14.32,0v100l35.68-30.33,35.68,30.33V0H14.32Z\"/></svg>',
	menu: '<svg viewBox=\"0 0 100 100\"><rect x=\"22.5\" y=\"24.5\" width=\"55\" height=\"10\"/><rect x=\"22.5\" y=\"45\" width=\"55\" height=\"10\"/><rect x=\"22.5\" y=\"65.5\" width=\"55\" height=\"10\"/></svg>',
	info: '<svg viewBox=\"0 0 100 100\"><rect x=\"45\" y=\"40\" width=\"10\" height=\"50\"/><circle cx=\"50\" cy=\"20\" r=\"10\"/></svg>',
	tutorial:
		'<svg viewBox=\"0 0 100 100\"><path d=\"M59,81c0,4.971-4.029,9-9,9s-9-4.029-9-9,4.029-9,9-9,9,4.029,9,9ZM50,10c-13.81,0-25,11.19-25,25h10c0-8.28,6.72-15,15-15s15,6.72,15,15-6.72,15-15,15h-5v15h10v-5.501c11.413-2.316,20-12.402,20-24.499,0-13.81-11.19-25-25-25Z\"/></svg>',
	arrows: '<svg viewBox=\"0 0 100 100\"><polygon points=\"90 50 70 70 62.93 62.93 75.86 50 62.93 37.07 70 30 90 50\"/><polygon points=\"10 50 30 70 37.07 62.93 24.14 50 37.07 37.07 30 30 10 50\"/><rect x=\"8.038\" y=\"45\" width=\"83.925\" height=\"10\" transform=\"translate(110.912 14.088) rotate(104.478)\"/></svg>',
	plus: '<svg viewBox=\"0 0 100 100\"><polygon points=\"90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45\"/></svg>',
	embed: '<svg viewBox=\"0 0 100 100\"><polygon points=\"65 50 65 60 75 60 75 80 25 80 25 60 35 60 35 50 15 50 15 90 85 90 85 50 65 50\"/><polygon points=\"45 29.14 45 70 55 70 55 29.14 65.43 39.57 72.5 32.5 50 10 27.5 32.5 34.57 39.57 45 29.14\"/></svg>',
	confetti:
		'<svg viewBox=\"0 0 100 100\"><rect x=\"12.28\" y=\"56.48\" width=\"20\" height=\"10\" transform=\"translate(-21.83 13.21) rotate(-22.5)\"/><rect x=\"28.52\" y=\"72.72\" width=\"20\" height=\"10\" transform=\"translate(-48.02 83.56) rotate(-67.5)\"/><rect x=\"56.48\" y=\"67.72\" width=\"10\" height=\"20\" transform=\"translate(-25.06 29.44) rotate(-22.5)\"/><rect x=\"72.72\" y=\"51.48\" width=\"10\" height=\"20\" transform=\"translate(-8.82 109.75) rotate(-67.5)\"/><rect x=\"67.72\" y=\"33.52\" width=\"20\" height=\"10\" transform=\"translate(-8.82 32.67) rotate(-22.5)\"/><rect x=\"51.48\" y=\"17.28\" width=\"20\" height=\"10\" transform=\"translate(17.37 70.56) rotate(-67.5)\"/><rect x=\"33.52\" y=\"12.28\" width=\"10\" height=\"20\" transform=\"translate(-5.6 16.44) rotate(-22.5)\"/><rect x=\"17.28\" y=\"28.52\" width=\"10\" height=\"20\" transform=\"translate(-21.83 44.37) rotate(-67.5)\"/><circle cx=\"50\" cy=\"50\" r=\"10\" transform=\"translate(-15.31 22.89) rotate(-22.46)\"/></svg>',
	gd: '<svg viewBox=\"0 0 100 100\"><path d=\"M58.18,10h31.82v31.82h-9.999v-14.75l-28.892,28.892-7.071-7.071,28.892-28.892h-14.75v-9.999ZM80,51.82v28.18H20V20h28.18v-10H10v80h80v-38.18h-10Z\"/></svg>',
	close: '<svg viewBox=\"0 0 100 100\"><polygon points=\"81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749\"/></svg>'
};

// inject attributes onto an element by matching its stable id="…" token, so the injection survives any other attributes the author adds to that element (e.g. a data-tooltip) — matching the whole opening tag would silently miss once the markup changes, leaving the button un-wired
const addAttr = (html, id, attrs) => (attrs ? html.replace(`id="${id}"`, () => `id="${id}" ${attrs}`) : html);

// inject the crumb icons (from ICONS) into the template's tb-seg buttons, with the data-tbico="…" marker on each .tb-kind saying which icon that crumb gets; the icon goes before the .tb-kind span so it becomes its own column (a direct child of .tb-seg) with the kind label and title stacked to its right, and later rewrites only touch the text
pageTemplate = pageTemplate.replace(
	/<span class="tb-kind" data-tbico="(\w+)">/g,
	(_, k) => `${ICONS[k] || ""}<span class="tb-kind">`
);

// bake the collection's brand + title into the template's site crumb so every page built from it (demos + the standalone editor) shows them
pageTemplate = pageTemplate.replace(
	'<span class="tb-kind-text">GD with GD</span></span><span class="tb-name">Demoland</span>',
	() =>
		`<span class="tb-kind-text">${escapeHtml(siteBrand)}</span></span><span class="tb-name">${escapeHtml(siteTitle)}</span>`
);

// parse a .demo file into title / info / html / annotations
// map a filename to the editor language / kind used for highlighting + the preview
function langForFile(name) {
	const ext = (String(name).split(".").pop() || "").toLowerCase();
	if (ext === "html" || ext === "htm") return "html";
	if (ext === "css") return "css";
	if (ext === "js" || ext === "mjs") return "javascript";
	if (ext === "json") return "json";
	if (
		[
			"png",
			"jpg",
			"jpeg",
			"gif",
			"svg",
			"webp",
			"avif",
			"ico",
			"bmp",
			"woff",
			"woff2",
			"ttf",
			"otf",
			"mp3",
			"wav",
			"ogg",
			"oga",
			"m4a",
			"aac",
			"flac",
			"mp4",
			"webm",
			"mov",
			"m4v",
			"ogv"
		].includes(ext)
	)
		return "media";
	return "text";
}

function parseDemo(text) {
	const lines = text.split("\n");
	// a demo is a list of sections whose headers look like "=== KEYWORD ===" or, for named files, "=== FILE name.ext ==="; `first` is the 1-based file line of the section's first content line, used to convert annotation line numbers
	const sections = [];
	let cur = null;
	lines.forEach((line, i) => {
		const m = line.match(/^===\s*([A-Za-z]+)(?:\s+(.+?))?\s*===\s*$/);
		if (m) {
			cur = { key: m[1].toUpperCase(), arg: (m[2] || "").trim(), first: i + 2, lines: [] };
			sections.push(cur);
			return;
		}
		if (cur) cur.lines.push(line);
	});
	const sectionText = (key) => {
		const s = sections.find((x) => x.key === key);
		return s ? s.lines.join("\n") : "";
	};
	const trimBlock = (s) => s.replace(/^\n+/, "").replace(/\n+$/, "");
	// file line of a section's first non-blank content line (rendered line 1 in the editor)
	const firstContentLine = (s) => {
		let lead = 0;
		while (lead < s.lines.length && s.lines[lead].trim() === "") lead++;
		return s.first + lead;
	};

	let config = {};
	const rawConfig = sectionText("CONFIG").trim();
	if (rawConfig) {
		try {
			config = JSON.parse(rawConfig);
		} catch (e1) {
			// tolerate a trailing comma before } or ] — a very common authoring slip that would otherwise silently discard the whole config
			try {
				config = JSON.parse(rawConfig.replace(/,(\s*[}\]])/g, "$1"));
			} catch (e2) {
				console.warn("  ⚠ CONFIG is not valid JSON, ignoring it:", e2.message);
			}
		}
	}

	// build the file list: a "=== FILE name ===" section is a named file, and a legacy "=== HTML ===" section is shorthand for a single index.html (backward compatible)
	const files = [];
	sections.forEach((s) => {
		if (s.key === "FILE" && s.arg)
			files.push({
				name: s.arg,
				lang: langForFile(s.arg),
				content: trimBlock(s.lines.join("\n")),
				firstLine: firstContentLine(s)
			});
		else if (s.key === "HTML")
			files.push({
				name: "index.html",
				lang: "html",
				content: trimBlock(s.lines.join("\n")),
				firstLine: firstContentLine(s)
			});
		// a MEDIA section references a real file on the site — name is its path in the demo project, body is where the file actually lives (linked at build, never inlined)
		else if (s.key === "MEDIA" && s.arg)
			files.push({
				name: s.arg,
				lang: "media",
				src: trimBlock(s.lines.join("\n")).trim(),
				content: "",
				firstLine: firstContentLine(s)
			});
	});
	const hasFileSections = sections.some((s) => s.key === "FILE" || s.key === "MEDIA");

	// entry = the html file the preview runs; it is always index.html, and only if a demo somehow has none do we fall back to the first html file, then the first file
	let entry = "index.html";
	if (!files.some((f) => f.name === entry)) {
		const idx = files.find((f) => f.lang === "html") || files[0];
		entry = idx ? idx.name : "index.html";
	}
	const multi = hasFileSections || files.length > 1; // single === HTML === demos stay single-file
	const allowAdd = config.allowAdd === true;

	// annotation "line" numbers are authored relative to the whole .demo file (what the author sees in their gutter), so convert each to be relative to its file's first rendered line; an annotation may name a `file`, defaulting to the entry file
	let annotations = [];
	try {
		// "NOTES" is the section name; "ANNOTATIONS" is what files written before the rename use
		annotations = JSON.parse((sectionText("NOTES") || sectionText("ANNOTATIONS")).trim() || "[]");
	} catch (e) {}
	annotations = annotations.map((a) => {
		if (!a || typeof a !== "object") return a;
		const fileName = a.file || entry;
		const f = files.find((x) => x.name === fileName);
		const offset = f ? f.firstLine : 1;
		// notes carry only a description now, so an old file's `title` is dropped rather than baked into the page
		const { title, ...rest } = a;
		return { ...rest, file: fileName, line: typeof a.line === "number" ? a.line - offset + 1 : a.line };
	});

	// extra demo options exposed to the editor (baked into #demo-config)
	const configOpts = {
		panels: config.panels && typeof config.panels === "object" ? config.panels : null,
		settings: config.settings && typeof config.settings === "object" ? config.settings : {},
		lock: Array.isArray(config.lock) ? config.lock : [],
		notesExpanded: config.notesExpanded === true // open all notes by default on load
	};

	return {
		title: sectionText("TITLE").trim(),
		info: trimBlock(sectionText("INFO")),
		files,
		entry,
		multi,
		allowAdd,
		annotations,
		configOpts,
		html: (files.find((f) => f.name === entry) || {}).content || "" // legacy convenience
	};
}

function renderFileList(names) {
	// a flat list of file paths -> nested tree, in .demo order
	const root = { name: "", children: [], map: {} };
	(names || []).forEach((path) => {
		let node = root;
		String(path)
			.split("/")
			.forEach((p, idx, arr) => {
				const isFile = idx === arr.length - 1;
				let child = node.map[p];
				if (!child) {
					child = { name: p + (isFile ? "" : "/"), children: [], map: {} };
					node.map[p] = child;
					node.children.push(child);
				}
				node = child;
			});
	});
	// order: loose files first (in .demo order), then folders grouped at the end, alphabetical
	const sortNodes = (nodes) => {
		nodes.sort((a, b) => {
			const af = a.children.length > 0,
				bf = b.children.length > 0;
			if (af !== bf) return af ? 1 : -1;
			if (af && bf) return a.name.localeCompare(b.name);
			return 0; // both files: keep insertion order (stable sort)
		});
		nodes.forEach((n) => sortNodes(n.children));
	};
	sortNodes(root.children);
	return treeToHtml(root.children, "info-filetree"); // the editor repopulates this pre dynamically
}

// render a ```faq fenced block as a click-to-expand accordion — each item's question is a line starting with "Q:" and everything up to the next "Q:" is the answer, rendered as markdown
function plainText(md) {
	return md
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[#>*_`]/g, "")
		.replace(/^\s*[-*]\s+/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}
function metaDesc(brief, fallback) {
	const t = plainText(brief);
	const first = (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
	return (first || fallback || "").slice(0, 158);
}
const payload = (obj) => JSON.stringify(obj).replaceAll("<", "\\u003c");

// ———————————————————————————
// READ THE LIBRARY
// structure + inline demo sources
// ———————————————————————————
let bookN = 0,
	chapN = 0,
	demoN = 0;
const tree = (collection.books || []).map((book) => {
	bookN++;
	return {
		id: book.id,
		title: book.title || "",
		mediaType: book.mediaType || "Book",
		description: book.description || "",
		hidden: book.hidden === true,
		chapters: (book.chapters || []).map((c) => {
			chapN++;
			return {
				id: c.id,
				title: c.title || "",
				description: c.description || "",
				hidden: c.hidden === true,
				demos: (c.demos || []).map((d) => {
					demoN++;
					return {
						id: d.id,
						title: d.title || "",
						hidden: d.hidden === true,
						source: readFileSync(join(here, d.file), "utf8")
					};
				})
			};
		})
	};
});

// "delisting": an item (book / chapter / demo) with "hidden": true in collection.json is dropped from every menu, the prev/next sequence and the sitemap, but its page is still built so a direct link keeps working — it is just unlinked, which shown() / visTree express
const shown = (x) => !x.hidden;
const visTree = tree.filter(shown).map((book) => ({
	...book,
	chapters: book.chapters.filter(shown).map((c) => ({ ...c, demos: c.demos.filter(shown) }))
}));

// project the library into the lite {id, title, mediaType, description, chapters:[{…, demos:[{id,title}]}]} shape the nav popup renders from, where the `keep*` predicates decide which items survive delisting
function projectLibrary(books, keepBook, keepChapter, keepDemo) {
	return books.filter(keepBook).map((b) => ({
		id: b.id,
		title: b.title,
		mediaType: b.mediaType,
		description: b.description,
		chapters: b.chapters
			.filter((c) => keepChapter(b, c))
			.map((c) => ({
				id: c.id,
				title: c.title,
				description: c.description,
				demos: c.demos.filter((d) => keepDemo(b, c, d)).map((d) => ({ id: d.id, title: d.title }))
			}))
	}));
}

// flattened demo sequence
const flat = [];
tree.forEach((b) => b.chapters.forEach((c) => c.demos.forEach((d) => flat.push({ book: b, chapter: c, demo: d }))));

// colour rules (must match editor.js): demos cycle within their book, so the first demo of every book is pink, then green, blue, … — the index is the demo's position inside its own book; books cycle in their own sequence, book 0 pink, book 1 green, …
const PAL = ["--pink", "--green", "--blue", "--yellow", "--purple", "--red"];
const palVar = (i) => `var(${PAL[((i % PAL.length) + PAL.length) % PAL.length]})`;
const keyOf = (b, c, d) => `${b}/${c}/${d}`;
const localIdx = new Map(); // demo key -> its index within its own book
const bookIdx = new Map(); // book id  -> sequential book index
tree.forEach((b, bi) => {
	bookIdx.set(b.id, bi);
	let li = 0;
	b.chapters.forEach((c) => c.demos.forEach((d) => localIdx.set(keyOf(b.id, c.id, d.id), li++)));
});

// per-book navigation sequence: each chapter's intro page, then that chapter's demos — the arrows step through this, so moving past a chapter's last demo lands on the next chapter's intro page rather than silently entering it; bounded to the book (null at the ends), with the intro page at <book>/<chapter>/index.html
const navSeq = new Map();
visTree.forEach((b) => {
	const seq = [];
	b.chapters.forEach((c) => {
		seq.push({ kind: "chapter", chapter: c, path: `${b.id}/${c.id}/` });
		c.demos.forEach((d) => seq.push({ kind: "demo", chapter: c, demo: d, path: `${b.id}/${c.id}/${d.id}.html` }));
	});
	navSeq.set(b.id, seq);
});
const BASE2 = "../../"; // depth-2 pages (demo + chapter intro) reach the site root
function neighbours(bookId, predicate) {
	const seq = navSeq.get(bookId);
	if (!seq) return { prev: null, next: null }; // hidden book -> no sequence
	const i = seq.findIndex(predicate);
	if (i === -1) return { prev: null, next: null }; // hidden item -> no arrows
	const url = (e) => (e ? BASE2 + e.path : null);
	return { prev: url(seq[i - 1]), next: url(seq[i + 1]) };
}

// the neighbouring nav entry (with a human label) in a given direction (+1 / -1), used to bake a "Next" link at the bottom of the info panel
function neighbourEntry(bookId, predicate, dir) {
	const seq = navSeq.get(bookId);
	if (!seq) return null;
	const i = seq.findIndex(predicate);
	if (i === -1) return null;
	const e = seq[i + dir];
	if (!e) return null;
	return { url: BASE2 + e.path, label: e.kind === "demo" ? e.demo.title : e.chapter.title, kind: e.kind };
}

// the library structure (no demo source) that the landing-page nav modal renders from
const libraryBooks = projectLibrary(
	tree,
	shown,
	(b, c) => shown(c),
	(b, c, d) => shown(d)
);

// the site-title crumb that opens the homepage; sits at the far left of every topbar, styled exactly like the book/chapter/demo crumbs ("GD with GD" over "DEMOLAND")
const siteCrumb = (base) =>
	`<a class="tb-seg tb-site" id="tb-site" title="All demos" data-nav-href="${base || ""}"><span class="tb-kind"><span class="tb-kind-text">${escapeHtml(siteBrand)}</span></span><span class="tb-name">${escapeHtml(siteTitle)}</span></a>`;

// one demo link (nc-demo-item), shared by the nav popup, book page and chapter intro — the href varies by page depth so the caller passes the finished href, and num is "chap.demo"
const demoItemHtml = (href, num, title, active = false) =>
	`<a class="nc-demo-item${active ? " active" : ""}" href="${href}"><span class="nc-demo-item-num">${num}</span><span class="nc-demo-item-name">${title}</span></a>`;

// pre-render the nav popup body (all-collections link, book heading, chapters + demos) from the library structure, baked into #nav-body on every page so the menu is real html — chrome.js only opens and closes it, it doesn't build it
function navBodyHtml(books, curBook, curChapter, curDemo, base) {
	base = base || "";
	let book = null;
	for (const b of books || []) {
		if (b.id === curBook) {
			book = b;
			break;
		}
	}
	if (!book) book = (books || [])[0];
	if (!book) return "";
	let out = `<a class="nav-allbooks" href="${base || "./"}">${ICONS.book}<span>All books</span></a>`;
	out += `<div class="nav-header"><a class="nav-heading" href="${base}${book.id}/"><span class="nav-subtitle">${escapeHtml(book.mediaType || "Book")}</span><span class="nav-title">${escapeHtml(book.title)}</span></a>`;
	if (book.description) out += `<div class="nav-desc">${escapeHtml(book.description)}</div>`;
	out += `</div>`;
	(book.chapters || []).forEach((chap, chapterIndex) => {
		out += `<div class="nav-chapter" style="--accent:${palVar(chapterIndex)};"><a class="nc-heading nav-link" href="${base}${book.id}/${chap.id}/"><div class="nc-subtitle">Chapter ${chapterIndex + 1}</div><div class="nc-title">${escapeHtml(chap.title)}</div></a>`;
		if (chap.description) out += `<div class="nc-desc">${escapeHtml(chap.description)}</div>`;
		out += `<div class="nc-demos">`;
		(chap.demos || []).forEach((demo, demoIndex) => {
			const active = book.id === curBook && chap.id === curChapter && demo.id === curDemo;
			out += demoItemHtml(
				`${base}${book.id}/${chap.id}/${demo.id}.html`,
				`${chapterIndex + 1}.${demoIndex + 1}`,
				demo.title,
				active
			);
		});
		out += `</div></div>`;
	});
	return out;
}
// the sticky book-name heading that overlays the top of the nav once you have scrolled past the big title — baked as a sibling of #nav-body inside #nav-dialog so it sticks to the scroll container, links to the book intro, and chrome.js only toggles its .show class
function navStickyHtml(books, curBook, base) {
	base = base || "";
	let book = null;
	for (const b of books || []) {
		if (b.id === curBook) {
			book = b;
			break;
		}
	}
	if (!book) book = (books || [])[0];
	if (!book) return "";
	return `<div class="nav-sticky"><span><a href="${base}${book.id}/"><span class="nav-sticky-label">Current book</span>${escapeHtml(book.title)}</a></span></div>`;
}

// ———————————————————————————
// EMIT
// ———————————————————————————
const outRoot = join(here, OUTDIR);
// output goes into the project root, so never wipe the whole directory (that would delete the source: build.mjs, the template, demos/, etc.) — remove only the artifacts this build owns: each book's generated folder plus the top-level generated files
for (const book of tree) rmSync(join(outRoot, book.id), { recursive: true, force: true });
rmSync(join(outRoot, "editor"), { recursive: true, force: true }); // standalone blank editor
rmSync(join(outRoot, "dev"), { recursive: true, force: true }); // the local-only /dev/ page (gitignored)
for (const fileName of ["index.html", "404.html", "sitemap.xml", "robots.txt"])
	rmSync(join(outRoot, fileName), { force: true });
mkdirSync(outRoot, { recursive: true });

const SEO_RE = /<!--SEO-->[\s\S]*?<!--\/SEO-->/;
const FILES_RE = /<div id="demo-files"[\s\S]*?<\/div>/; // the baked-file container (its textareas hold escaped code, so no nested </div>)
const NOTES_RE = /(<script type="application\/json" id="demo-notes">)([\s\S]*?)(<\/script>)/;
const CONFIG_RE = /(<script type="application\/json" id="demo-config">)([\s\S]*?)(<\/script>)/;

// bake the #demo-files container: one <textarea class="demo-file"> per file, plus data attributes for the entry file / multi-file / allow-add flags
// resolve a MEDIA source to a url usable from the built page — absolute and root-absolute urls pass through, while a bare "path/to/file" is treated as site-root-relative and made relative to the page via `base`, so it works under a sub-path deployment too
function resolveMediaSrc(src, base) {
	if (!src) return "";
	if (/^(https?:|data:|blob:|\/\/|\/)/i.test(src)) return src;
	return (base || "") + src.replace(/^\.?\//, "");
}
function filesContainer(files, entry, multi, allowAdd, base) {
	const textareas = files
		.map((f) =>
			f.lang === "media"
				? `<textarea class="demo-file" data-name="${escapeHtml(f.name)}" data-lang="media" data-src="${escapeHtml(resolveMediaSrc(f.src || f.content || "", base))}" hidden></textarea>`
				: `<textarea class="demo-file" data-name="${escapeHtml(f.name)}" data-lang="${f.lang}" hidden>${escapeHtml(f.content)}</textarea>`
		)
		.join("");
	return `<div id="demo-files" data-entry="${escapeHtml(entry)}" data-multi="${multi ? "1" : "0"}" data-allow-add="${allowAdd ? "1" : "0"}">${textareas}</div>`;
}
const urls = [];

flat.forEach((entry) => {
	const parsed = parseDemo(entry.demo.source);
	const rel = `${entry.book.id}/${entry.chapter.id}/${entry.demo.id}.html`;
	const base = "../../";
	const demoTitle = parsed.title || entry.demo.title;
	const title = [demoTitle, entry.book.title, siteTitle].filter(Boolean).join(" \\ ");
	const desc = metaDesc(parsed.info, entry.chapter.description || entry.book.description || "");
	const canonical = siteUrl ? `${siteUrl}/${rel}` : "";
	// topbar position (baked below so the bar is filled in immediately on load, before JS)
	const visChaps = entry.book.chapters.filter(shown),
		visDemos = entry.chapter.demos.filter(shown);
	const chapPos = visChaps.findIndex((c) => c.id === entry.chapter.id) + 1,
		chapCount = visChaps.length;
	const demoPos = visDemos.findIndex((d) => d.id === entry.demo.id) + 1,
		chapterLen = visDemos.length;

	// info panel: an auto header ("Demo #.#" bubble + the demo name as the h1, clicking opens the menu), then a "Files in this demo" tree for multi-file demos, then the authored brief, then a link to the next item in the sequence
	const nextEntry = neighbourEntry(
		entry.book.id,
		(s) => s.kind === "demo" && s.chapter.id === entry.chapter.id && s.demo.id === entry.demo.id,
		1
	);
	const infoHeader =
		`<div class="info-demo-head" data-nav-open role="button" tabindex="0" title="Open the menu">` +
		`<span class="info-demo-num">${ICONS.demo}<span>Demo ${chapPos}.${demoPos}</span></span>` +
		`<h1 class="info-demo-title">${demoTitle}</h1></div>`;
	const filesBlock = parsed.multi
		? `<div class="info-files"><h3>${ICONS.folder} <span>Files in this demo</span></h3>${renderFileList(parsed.files.map((f) => f.name))}</div>`
		: "";
	const briefMd = parsed.info.replace(/^\s*#\s+[^\n]*\r?\n?/, ""); // drop a leading authored H1
	// the "next" link: next demo or next chapter within the book, or at the end of the book a prompt to start another book
	const nextLink = nextEntry
		? `\n<a class="info-next" href="${nextEntry.url}"><span class="info-next-label">Next ${nextEntry.kind === "chapter" ? "chapter" : "demo"}</span><span class="info-next-title">${escapeHtml(nextEntry.label)}</span>${ICONS.arrowRight}</a>`
		: `\n<a class="info-next" href="${base}"><span class="info-next-label">You finished this book!</span><span class="info-next-title">Start another book</span>${ICONS.arrowRight}</a>`;
	const infoHtml = infoHeader + filesBlock + mdToHtml(briefMd) + nextLink;

	// demo pages no longer carry a per-demo accent; the page accent is the neutral gd-with-gd off-white, and section colours come from css (topbar/info/editor/preview)
	const accent = "var(--off-white)";

	// `books` is the current book's structure, used only to bake the nav popup below — it is no longer shipped as json, so nothing about the library reaches the client except the baked popup markup; delisted items are dropped from the popup except the current demo, so a direct link to an unlisted demo still resolves
	const isCur = (b, c, d) => b.id === entry.book.id && c.id === entry.chapter.id && d.id === entry.demo.id;
	const books = projectLibrary(
		tree,
		(b) => shown(b) || b.id === entry.book.id,
		(b, c) => shown(c) || (b.id === entry.book.id && c.id === entry.chapter.id),
		(b, c, d) => shown(d) || isCur(b, c, d)
	);
	// prev/next for the arrows -- steps through the book sequence (chapter intros + demos)
	const nav = neighbours(
		entry.book.id,
		(s) => s.kind === "demo" && s.chapter.id === entry.chapter.id && s.demo.id === entry.demo.id
	);

	const seo = [
		`<title>${escapeHtml(title)}</title>`,
		`<meta name="description" content="Learn how to code HTML, CSS, and JavaScript to make fun websites!">`,
		canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : "",
		`<meta property="og:type" content="article">`,
		`<meta property="og:title" content="${escapeHtml(title)}">`,
		`<meta property="og:description" content="Learn how to code HTML, CSS, and JavaScript to make fun websites!">`,
		canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : "",
		siteName ? `<meta property="og:site_name" content="${escapeHtml(siteName)}">` : "",
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${escapeHtml(title)}">`,
		`<meta name="twitter:description" content="Learn how to code HTML, CSS, and JavaScript to make fun websites!">`,
		OG_IMAGE,
		FAVICON
	]
		.filter(Boolean)
		.map((s) => `  ${s}`)
		.join("\n");

	let pageHtml = pageTemplate;
	pageHtml = pageHtml.replace(SEO_RE, () => seo);
	pageHtml = pageHtml.replace(PLACEHOLDER_ICON, () => "");
	pageHtml = pageHtml.replace('<html lang="en">', () => `<html lang="en" style="--accent:${accent}">`); // bake accent in -> no flash
	pageHtml = pageHtml.replace(
		'href="style.css"',
		() => `href="${base}style.min.css${assetVersion("style.min.css")}"`
	);
	pageHtml = pageHtml.replace('src="editor.js"', () => `src="${base}editor.js${assetVersion("editor.js")}"`);
	pageHtml = pageHtml.replace('src="chrome.js"', () => `src="${base}chrome.js${assetVersion("chrome.js")}"`);
	pageHtml = pageHtml.replace("<!--FOOTER-->", () => footerHtml(base, false, true)); // demo page: show "Embed this demo"
	// bake the topbar so it is populated immediately (the js that fills it waits on the codemirror imports, which would otherwise leave the bar blank until they load) — nav behaviour is injected on each button's id token, tolerant of extra author attributes like data-tooltip, and the crumb labels are filled via their inner spans
	pageHtml = addAttr(pageHtml, "tb-site", `data-nav-href="${base}"`);
	pageHtml = addAttr(pageHtml, "tb-book", `data-nav-href="${base}${entry.book.id}/"`);
	pageHtml = addAttr(pageHtml, "tb-chapter", `data-nav-href="${base}${entry.book.id}/${entry.chapter.id}/"`);
	pageHtml = addAttr(pageHtml, "tb-demo", "data-nav-open");
	// prev/next are <a>; a real href when there's somewhere to go, else the .tb-disabled class
	pageHtml = nav.prev
		? addAttr(pageHtml, "tb-prev", `data-nav-href="${nav.prev}"`)
		: pageHtml.replace('class="tb-arrow" id="tb-prev"', 'class="tb-arrow tb-disabled" id="tb-prev"');
	pageHtml = nav.next
		? addAttr(pageHtml, "tb-next", `data-nav-href="${nav.next}"`)
		: pageHtml.replace('class="tb-arrow" id="tb-next"', 'class="tb-arrow tb-disabled" id="tb-next"');
	pageHtml = pageHtml.replace(
		'<span class="tb-kind-text">Book</span></span><span class="tb-name"></span>',
		() =>
			`<span class="tb-kind-text">Book</span></span><span class="tb-name">${escapeHtml(entry.book.title)}</span>`
	);
	pageHtml = pageHtml.replace(
		'<span class="tb-kind-text">Chapter</span></span><span class="tb-name"></span>',
		() =>
			`<span class="tb-kind-text">Chapter ${chapPos} of ${chapCount}</span></span><span class="tb-name">${escapeHtml(entry.chapter.title)}</span>`
	);
	pageHtml = pageHtml.replace(
		'<span class="tb-kind-text">Demo</span></span><span class="tb-name"></span>',
		() =>
			`<span class="tb-kind-text">Demo <span class="tb-demo-full">${demoPos} of ${chapterLen}</span><span class="tb-demo-mini">${chapPos}.${demoPos}</span></span></span><span class="tb-name">${entry.demo.title}</span>`
	);
	pageHtml = pageHtml.replace('<div id="info-body"></div>', () => `<div id="info-body">${infoHtml}</div>`);
	pageHtml = pageHtml.replace(
		'<div id="nav-body"></div>',
		() => `<div id="nav-body">${navBodyHtml(books, entry.book.id, entry.chapter.id, entry.demo.id, base)}</div>`
	);
	pageHtml = pageHtml.replace(
		'<button id="nav-close"',
		() => `${navStickyHtml(books, entry.book.id, base)}<button id="nav-close"`
	); // sticky heading sits before the close button
	// the demo's file(s) go into #demo-files, each escaped so it can't break out, and its line annotations (if any) into #demo-notes — no json library bundle
	pageHtml = pageHtml.replace(FILES_RE, () =>
		filesContainer(parsed.files, parsed.entry, parsed.multi, parsed.allowAdd, base)
	);
	pageHtml = pageHtml.replace(
		NOTES_RE,
		(_m, o, _x, c) => o + (parsed.annotations && parsed.annotations.length ? payload(parsed.annotations) : "") + c
	);
	pageHtml = pageHtml.replace(CONFIG_RE, (_m, o, _x, c) => o + payload(parsed.configOpts) + c); // payload() escapes < so a "</script>" in config can't break out

	mkdirSync(join(here, OUTDIR, entry.book.id, entry.chapter.id), { recursive: true });
	writeFileSync(join(here, OUTDIR, rel), minifyHtml(pageHtml));
	if (siteUrl && shown(entry.book) && shown(entry.chapter) && shown(entry.demo)) urls.push(`${siteUrl}/${rel}`);
});

// ———————————————————————————
// COPY SHARED ASSETS
// skipped when the output dir is the source dir
// ———————————————————————————
ASSETS.forEach((a) => {
	const src = join(here, a),
		dst = join(outRoot, a);
	if (existsSync(src) && src !== dst) cpSync(src, dst);
});

// ———————————————————————————
// HOMEPAGE + PER-BOOK SUBPAGES
// ———————————————————————————
const homeDesc = collection.description;

// --- landing pages (book + chapter intro): themed shell with topbar + nav popup ---
const arrowHtml = (url, glyph, t) =>
	url
		? `<a class="tb-arrow" href="${url}" title="${t}">${glyph}</a>`
		: `<span class="tb-arrow tb-disabled" title="${t}">${glyph}</span>`;
// the popup-opening menu button (identical to the editor topbar's) so landing pages share the same left-arrow / right-arrow / menu control cluster
const menuButton = `<button class="tb-arrow" id="tb-menu" data-nav-open title="Menu" data-tooltip="Browse chapters and demos">${ICONS.menu}</button>`;

// the site footer, shared by the editor template and every landing page; `base` makes the internal links resolve from any depth
function footerHtml(base, landing, demo) {
	return `      <footer id="site-footer"${landing ? ' class="footer-landing"' : ""}>
		<a class="footer-link" href="${base}">${ICONS.book}All Books</a>
		<div class="footer-link-divider"></div>
        <a class="footer-link" href="${base}info/">${ICONS.info}What Is DEMOLAND?</a>
		<div class="footer-link-divider"></div>
        <a class="footer-link" href="${base}tutorial/">${ICONS.tutorial}Tutorial</a>
		<div class="footer-link-divider"></div>
        <a class="footer-link" href="${base}cheatsheet/" rel="noopener">${ICONS.arrows}Coding Cheatsheet</a>
		<div class="footer-link-divider"></div>
        <a class="footer-link" href="${base}editor/">${ICONS.plus}Start a new file</a>
		<div class="footer-link-divider"></div>${
			demo
				? `
        <button class="footer-link" id="footer-embed">${ICONS.embed}Embed this demo</button>
		<div class="footer-link-divider"></div>`
				: ""
		}
        <button class="footer-link footer-confetti" data-confetti="${base}lib/confetti.js">${ICONS.confetti}Celebrate</button>
		<div class="footer-link-divider"></div>
        <a class="footer-link" href="https://gdwithgd.com/" target="_blank" rel="noopener">${ICONS.gd}More from GD with GD</a>
      </footer>`;
}

function landingShell({
	base,
	title,
	desc,
	canonical,
	topbar,
	content,
	bundle,
	accent = "var(--off-white)",
	htmlClass = ""
}) {
	return `<!DOCTYPE html>
<html lang="en"${htmlClass ? ` class="${htmlClass}"` : ""} style="--accent:${accent};">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="Learn how to code HTML, CSS, and JavaScript to make fun websites!">
${canonical ? `  <link rel="canonical" href="${canonical}">\n  <meta property="og:url" content="${canonical}">\n` : ""}  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="Learn how to code HTML, CSS, and JavaScript to make fun websites!">
  ${OG_IMAGE}
  <meta name="twitter:card" content="summary_large_image">
  ${FAVICON}
  <link rel="stylesheet" href="${base}style.min.css${assetVersion("style.min.css")}">
</head>
<body>
  <div id="shell">
    <div id="topbar" class="topbar-landing">
${topbar}
    </div>
    <div id="landing">
      <div class="land-wrap">
${content}
      </div>
    </div>
${footerHtml(base, true)}
  </div>
  <div id="nav-overlay" hidden>
    <div id="nav-dialog" role="dialog" aria-modal="true" aria-label="Navigate" tabindex="-1">
      ${navStickyHtml(bundle.books, (bundle.current || {}).book, base)}<button id="nav-close" title="Close">${ICONS.close}</button>
      <div id="nav-body">${navBodyHtml(bundle.books, (bundle.current || {}).book, (bundle.current || {}).chapter, null, base)}</div>
    </div>
  </div>
  <div class="bg"></div>
  <script src="${base}chrome.js${assetVersion("chrome.js")}"></script>
  <script src="${base}landing.js${assetVersion("landing.js")}"></script>
</body>
</html>
`;
}

function bookPage(book) {
	const chapters = book.chapters
		.filter(shown)
		.map((chapter, chapterIndex) => {
			const chapterColor = palVar(chapterIndex); // one accent per chapter (pink, green, blue, ...)
			const demos = chapter.demos
				.filter(shown)
				.map((demo, demoIndex) => {
					return `          ${demoItemHtml(`${chapter.id}/${demo.id}.html`, `${chapterIndex + 1}.${demoIndex + 1}`, demo.title)}`;
				})
				.join("\n");
			return `        <div class="nav-chapter" style="--accent:${chapterColor};">
          <div class="nc-header"><a class="nc-heading" href="${chapter.id}/"><div class="nc-subtitle">Chapter ${chapterIndex + 1}</div><div class="nc-title">${escapeHtml(chapter.title)}</div></a>
${chapter.description ? `          <div class="nc-desc">${escapeHtml(chapter.description)}</div>\n` : ""}</div><div class="nc-demos">${demos}</div>
		  ${ICONS.bookmark}
        </div>`;
		})
		.join("\n");
	const firstChap = book.chapters.filter(shown).find((c) => c.demos.filter(shown).length);
	const topbar = `      <div id="tb-crumbs">
        ${siteCrumb("../")}
        <span class="tb-sep"></span>
        <a class="tb-seg" id="tb-book" data-nav-open>${ICONS.book}<span class="tb-kind"><span class="tb-kind-text">Book</span></span><span class="tb-name">${escapeHtml(book.title)}</span></a>
      </div>
      <div id="tb-right">
        ${arrowHtml(null, ICONS.arrowLeft, "introduction")}
        ${arrowHtml(firstChap ? `${firstChap.id}/` : null, ICONS.arrowRight, "First chapter")}
        ${menuButton}
      </div>
	  <div id="tb-border"></div>`;
	const content = `        <div class="land-header"><a class="land-back" href="../">${ICONS.book}<span>All books</span></a>
		<div class="land-subtitle land-subtitle-intro">${ICONS.book}<span>${escapeHtml(book.mediaType)}</span></div>
        <h1 class="land-title">${escapeHtml(book.title)}</h1>
        ${book.description ? `<p class="land-desc">${book.description}</p>` : ""}</div>
<div class="land-chapters"><h2 class="land-subheading">${ICONS.chapter}<span>Select a chapter</span></h2>${chapters}</div>`;
	return landingShell({
		base: "../",
		htmlClass: "book",
		title: [book.title, siteTitle].filter(Boolean).join(" \\ "),
		desc: book.description || homeDesc,
		canonical: siteUrl ? `${siteUrl}/${book.id}/` : "",
		topbar,
		content,
		bundle: { current: { book: book.id }, books: libraryBooks }
	});
}
tree.forEach((book) => {
	mkdirSync(join(here, OUTDIR, book.id), { recursive: true });
	writeFileSync(join(here, OUTDIR, book.id, "index.html"), minifyHtml(bookPage(book)));
	if (siteUrl && shown(book)) urls.push(`${siteUrl}/${book.id}/`);
});

function chapterIntroPage(book, chapter, chapterIndex, chapTotal) {
	const nav = neighbours(book.id, (s) => s.kind === "chapter" && s.chapter.id === chapter.id);
	const prevUrl = chapterIndex === 0 ? "../" : nav.prev; // first chapter -> back to the book intro page
	const prevTitle = chapterIndex === 0 ? "book introduction" : "previous";
	const demos = chapter.demos
		.filter(shown)
		.map((demo, demoIndex) => {
			return `        ${demoItemHtml(`${demo.id}.html`, `${chapterIndex + 1}.${demoIndex + 1}`, demo.title)}`;
		})
		.join("\n");
	const topbar = `      <div id="tb-crumbs">
        ${siteCrumb("../../")}
        <span class="tb-sep"></span>
        <a class="tb-seg" id="tb-book" data-nav-href="../../${book.id}/">${ICONS.book}<span class="tb-kind"><span class="tb-kind-text">Book</span></span><span class="tb-name">${escapeHtml(book.title)}</span></a>
        <span class="tb-sep"></span>
        <a class="tb-seg" id="tb-chapter" data-nav-open>${ICONS.chapter}<span class="tb-kind"><span class="tb-kind-text">Chapter ${chapterIndex + 1} of ${chapTotal}</span></span><span class="tb-name">${escapeHtml(chapter.title)}</span></a>
      </div>
      <div id="tb-right">
        ${arrowHtml(prevUrl, ICONS.arrowLeft, prevTitle)}
        ${arrowHtml(nav.next, ICONS.arrowRight, "next")}
        ${menuButton}
      </div>
	  <div id="tb-border"></div>`;
	const content = `        <div class="land-header">
		<a class="land-back" href="../">${ICONS.chapter}<span>All chapters</span></a>
		<div class="land-subtitle">${ICONS.chapter}<span>Chapter&nbsp;${chapterIndex + 1}</span></div>
        <h1 class="land-title">${escapeHtml(chapter.title)}</h1>
        ${chapter.description ? `<div class="land-desc">${chapter.description}</div>` : ""}
		</div>
        <div class="land-demos">
		<h2 class="land-subheading">${ICONS.demo}<span>Select a demo</span></h2><div class="land-demos-list">
${demos}
        </div></div>`;
	return landingShell({
		base: "../../",
		htmlClass: "chapter",
		title: [chapter.title, book.title, siteTitle].filter(Boolean).join(" \\ "),
		desc: chapter.description || book.description || homeDesc,
		canonical: siteUrl ? `${siteUrl}/${book.id}/${chapter.id}/` : "",
		topbar,
		content,
		accent: palVar(chapterIndex), // whole page takes the chapter's colour
		bundle: { current: { book: book.id, chapter: chapter.id }, books: libraryBooks }
	});
}
tree.forEach((book) => {
	const visChaps = book.chapters.filter(shown);
	book.chapters.forEach((chapter) => {
		const chapterIndex = visChaps.findIndex((x) => x.id === chapter.id); // position among visible chapters (-1 if hidden)
		mkdirSync(join(here, OUTDIR, book.id, chapter.id), { recursive: true });
		writeFileSync(
			join(here, OUTDIR, book.id, chapter.id, "index.html"),
			minifyHtml(chapterIntroPage(book, chapter, chapterIndex, visChaps.length))
		);
		if (siteUrl && shown(book) && shown(chapter)) urls.push(`${siteUrl}/${book.id}/${chapter.id}/`);
	});
});

// --- homepage: index.html (themed like the landing pages; topbar = just the site title) ---
const homeBooks = visTree
	.map((book) => {
		const nChap = book.chapters.length;
		const nDemo = book.chapters.reduce((m, c) => m + c.demos.length, 0);
		const meta = `<span>${ICONS.chapter}${nChap} chapter${nChap === 1 ? "" : "s"}</span> <span>${ICONS.demo}${nDemo} demo${nDemo === 1 ? "" : "s"}</span>`;
		return `          <a class="nav-book" href="${book.id}/"><div class="nb-info"><div class="nb-num">${ICONS.book}<span>${escapeHtml(book.mediaType)}</span></div><h2 class="nb-title">${escapeHtml(book.title)}</h2><div class="nb-meta">${meta}</div></div>${book.description ? `<div class="nb-desc">${escapeHtml(book.description)}</div>` : ""}</a>`;
	})
	.join("\n");
const home = landingShell({
	base: "",
	htmlClass: "home",
	title: siteName || "Demos",
	desc: homeDesc,
	canonical: siteUrl ? `${siteUrl}/` : "",
	topbar: `      <div id="tb-crumbs">\n        ${siteCrumb("")}\n      </div>\n      <div id="tb-right">\n        <a class="tb-action" href="editor/" title="Open a blank HTML editor">${ICONS.arrows}<span>Open editor</span></a>\n      </div>
  <div id="tb-border"></div>`,
	content: `        <div class="land-header">${siteBrand ? `<div class="land-subtitle">${escapeHtml(siteBrand)}</div>` : ""}<h1 class="land-title">${escapeHtml(siteTitle || "Demos")}</h1>
        ${homeDesc ? `<div class="land-desc">${homeDesc}</div>` : ""}
		</div>
        <div class="land-books"><h2 class="land-subheading">${ICONS.book}<span>Select a book</span></h2>
${homeBooks}
        </div>`,
	bundle: { current: {}, books: libraryBooks }
});
writeFileSync(join(here, OUTDIR, "index.html"), minifyHtml(home));
if (siteUrl) urls.unshift(`${siteUrl}/`);

// ———————————————————————————
// INFO PAGE
// /info/ — an "about" page using homepage formatting, with placeholder copy
// ———————————————————————————
{
	const base = "../";
	const infoContent = `        <div class="land-header">
        <a class="land-back" href="../">${ICONS.book}<span>Browse Demos</span></a>
        <div class="land-subtitle land-subtitle-intro">Info</div>
        <h1 class="land-title">WHAT IS ${escapeHtml(siteTitle)}</h1>
        </div>
        <div class="land-info">
			<section>
				<h2>Who made this site?</h2>
				<p>Hi! I’m <a href="https://gdwithgd.com/" target="_blank">Gabriel</a>! I made DEMOLAND! I’m a designer, developer, and teacher. I made DEMOLAND to make learning and writing code less scary for my students.</p>
			</section>
			<section>
				<h2>How does it work?</h2>
				<p>DEMOLAND lets you read, write, and test code without leaving your web browser. This site features “books” containing collections of code demos.</p>
			</section>
			<section>
				<h2>Who’s this for?</h2>
				<p>I built DEMOLAND for creative people interested in code! DEMOLAND is a place to start experimenting with code without worrying about if it’s 100% “correct” or the best it can be.</p>
			</section>
			<section>
				<h2>Is it worth learning how to code when I can just use AI?</h2>
				<p>YES IT IS!!!! It’s more important than ever to learn how to code now that AI exists. This is because you’re now much more likely to use code than ever before! But regardless of if you’re coding by hand or prompting, you need to understand how code works, how to read it, and how to edit it.</p>
			</section>
			<section>
				<h2>How was this site made?</h2>
				<p>In 2023, I started DEMOLAND and coded the first few versions by hand (with help from the <a href="https://codemirror.net/" target="_blank">CodeMirror</a> library). I rebuilt DEMOLAND in 2026 with a greatly expanded featureset, which I was only able to achieve through the help of AI. I have many conflicted feelings about AI and avoided it for many years. I started using it in 2026 because my students were using it, and while I have many conflicted feelings about its many costs (ethical, environmental, etc.), I would not have been able to build this version of DEMOLAND without it.</p>
			</section>
			<section>
				<h2>Questions?</h2>
				<p>DEMOLAND is part of <a href="https://gdwithgd.com/" target="_blank" rel="noopener">GD&nbsp;with&nbsp;GD</a>. If you want to get in touch, reach out to <a href="mailto:gabriel@noreplica.com" target="_blank">me</a> (Gabriel)!</p>
			</section>
        </div>`;
	const infoPage = landingShell({
		base,
		htmlClass: "info",
		title: [`What Is ${siteTitle}?`].filter(Boolean).join(" | "),
		desc: `What Is ${siteName}`,
		canonical: siteUrl ? `${siteUrl}/info/` : "",
		topbar: `      <div id="tb-crumbs">\n        ${siteCrumb(base)}\n      </div>\n      <div id="tb-right">\n        <a class="tb-action" href="${base}editor/" title="Open a blank HTML editor">Open editor</a>\n      </div>`,
		content: infoContent,
		bundle: { current: {}, books: libraryBooks }
	});
	mkdirSync(join(here, OUTDIR, "info"), { recursive: true });
	writeFileSync(join(here, OUTDIR, "info", "index.html"), minifyHtml(infoPage));
	if (siteUrl) urls.push(`${siteUrl}/info/`);
}

// ———————————————————————————
// 404 PAGE
// info-page styling; hosts serve /404.html for unknown urls
// ———————————————————————————
{
	// root-relative base so the page's assets and links resolve no matter how deep the missing url was (the host shows 404.html but the browser url is the bad path)
	const base = "/";
	const content = `        <div class="land-header">
        <div class="land-subtitle land-subtitle-intro">Page not found</div>
        <h1 class="land-title">404</h1>
        <p class="land-desc">You’re lost! This page doesn’t exist. <a href="/">Head to the homepage.</a></p>
        </div>`;
	const notFound = landingShell({
		base,
		htmlClass: "info notfound",
		title: ["Page not found", siteTitle].filter(Boolean).join(" | "),
		desc: "Page not found",
		canonical: "",
		topbar: `      <div id="tb-crumbs">\n        ${siteCrumb(base)}\n      </div>\n      <div id="tb-right">\n        <a class="tb-action" href="${base}editor/" title="Open a blank HTML editor">Open editor</a>\n      </div>`,
		content,
		bundle: { current: {}, books: libraryBooks }
	});
	writeFileSync(join(here, OUTDIR, "404.html"), minifyHtml(notFound)); // not added to the sitemap
}

// ———————————————————————————
// STANDALONE EDITOR
// a full editor page at /editor/ that isn't part of any book: an html starter with <style>/<script>, the usual editor chrome, and new/save/load/download demo buttons plus drag-and-drop instead of prev/next arrows
// ———————————————————————————
// the blank editor's starting demo is authored as an ordinary .demo file, so it can be edited in the editor itself and dropped back in
const TEMPLATE_PATH = join(here, "demos", "template.demo");
const template = parseDemo(existsSync(TEMPLATE_PATH) ? readFileSync(TEMPLATE_PATH, "utf8") : "");
if (!template.files.length)
	console.warn("! demos/template.demo is missing or empty ~ the blank editor will start with no files");

// the same page is also built a second time at /dev/ — the local-only site manager that `node dev.mjs` serves (see dev.mjs and parts/dev.js). it's the blank editor plus a list of every demo on the site, and saves to the .demo files themselves. dev/ is gitignored, so it never reaches the published site
function standalonePage(dev) {
	const base = "../";
	const seo = [
		dev
			? `<title>Dev \\ ${escapeHtml(siteTitle)}</title>\n  <meta name="robots" content="noindex">`
			: `<title>Editor \\ ${escapeHtml(siteTitle)}</title>`,
		`<meta name="description" content="A blank in-browser HTML, CSS and JavaScript editor with a live preview.">`,
		siteUrl && !dev ? `<link rel="canonical" href="${siteUrl}/editor/">` : "",
		`<meta property="og:title" content="Editor \\ ${escapeHtml(siteTitle)}">`,
		OG_IMAGE,
		`<meta name="twitter:card" content="summary_large_image">`,
		FAVICON
	]
		.filter(Boolean)
		.map((s) => `  ${s}`)
		.join("\n");

	let h = pageTemplate;
	h = h.replace(SEO_RE, () => seo);
	h = h.replace(PLACEHOLDER_ICON, () => "");
	h = h.replace('<html lang="en">', () => `<html lang="en" style="--accent:var(--blue)">`);
	h = h.replace('href="style.css"', () => `href="${base}style.min.css${assetVersion("style.min.css")}"`);
	h = h.replace('src="editor.js"', () => `src="${base}editor.js${assetVersion("editor.js")}"`);
	h = h.replace('src="chrome.js"', () => `src="${base}chrome.js${assetVersion("chrome.js")}"`);
	h = h.replace("<!--FOOTER-->", () => footerHtml(base));
	h = addAttr(h, "tb-site", `data-nav-href="${base}"`);
	// the demo crumb is wired by editor.js to open the saved-demo list
	// the standalone info panel mirrors a demo page's layout: the "Demo" header (its title opens the menu), then the "Files in this demo" tree (it starts multi-file, and the editor repopulates #info-filetree live), then the descriptive brief
	// no book/chapter/demo hierarchy here, so the standalone has no nav menu — the header is inert (not a menu trigger)
	const stHeader = `<div class="info-demo-head"><span class="info-demo-num">${ICONS.demo}<span>Demo</span></span><h1 class="info-demo-title">New Demo</h1></div>`;
	const stFilesBlock = `<div class="info-files"><h3>${ICONS.folder} <span>Files in this demo</span></h3>${renderFileList(template.files.map((f) => f.name))}</div>`;
	const stBrief = template.info.replace(/^\s*#\s+[^\n]*\r?\n?/, ""); // drop an authored H1 (the name is shown in the header)
	// the brief sits in its own container, with its markdown source kept beside it, so the editor can edit and re-render just this part
	h = h.replace(
		'<div id="info-body"></div>',
		() =>
			`<div id="info-body">${stHeader}${stFilesBlock}<div id="info-brief">${mdToHtml(stBrief)}</div><textarea id="demo-info-md" hidden>${escapeHtml(stBrief)}</textarea></div>`
	);
	// standalone has no nav menu: leave #nav-body empty and bake no sticky heading
	h = h.replace(
		'<span class="tb-kind-text">Demo</span></span><span class="tb-name"></span>',
		() => `<span class="tb-kind-text">Demo</span></span><span class="tb-name">New Demo</span>`
	);
	// a single class on #shell drives all the standalone hiding via CSS (no flash); show Upload
	h = h.replace('<div id="shell">', () => `<div id="shell" class="standalone${dev ? " dev" : ""}">`);
	// the standalone toolbar is the only place these show: new / save / load / download
	["tb-new", "tb-save", "tb-load", "tb-download"].forEach((id) => {
		h = h.replace(`<button class="tb-action" id="${id}" hidden`, () => `<button class="tb-action" id="${id}"`);
	});
	// pick a random accent from the palette on each load (pre-paint, so there's no colour flash); /dev/ starts neutral and takes the colour of whichever demo is open
	if (dev) h = h.replace('style="--accent:var(--blue)"', () => 'style="--accent:var(--off-white)"');
	else
		h = h.replace(
			"</head>",
			() =>
				'  <script>(function(){var p=["pink","green","blue","yellow","purple","red"];document.documentElement.style.setProperty("--accent","var(--"+p[Math.floor(Math.random()*p.length)]+")");})();</script>\n</head>'
		);
	h = h.replace(FILES_RE, () => filesContainer(template.files, template.entry, true, true, base));
	// the template's notes are baked in the same way a demo page's are
	h = h.replace(
		NOTES_RE,
		(_m, o, _x, c) =>
			o + (template.annotations && template.annotations.length ? payload(template.annotations) : "") + c
	);

	return h;
}
mkdirSync(join(here, OUTDIR, "editor"), { recursive: true });
writeFileSync(join(here, OUTDIR, "editor", "index.html"), minifyHtml(standalonePage(false)));
if (siteUrl) urls.push(`${siteUrl}/editor/`);
mkdirSync(join(here, OUTDIR, "dev"), { recursive: true });
writeFileSync(join(here, OUTDIR, "dev", "index.html"), minifyHtml(standalonePage(true)));

// ———————————————————————————
// SITEMAP.XML + ROBOTS.TXT
// ———————————————————————————
if (siteUrl) {
	const sm =
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
		`\n</urlset>\n`;
	writeFileSync(join(here, OUTDIR, "sitemap.xml"), sm);
	writeFileSync(join(here, OUTDIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
}

console.log(
	`built ${OUTDIR}/  (homepage + blank editor + ${bookN} book + ${chapN} chapter-intro page(s), ${demoN} demo page(s)${siteUrl ? ", + sitemap/robots" : " — set siteUrl for canonical+sitemap"})`
);
