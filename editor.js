// ———————————————————————————
// EDITOR
// all third-party editor dependencies are bundled into a single self-hosted es module (lib/codemirror.js) so the site never loads anything from a cdn — see lib/README.md to regenerate it
// the `marked` markdown renderer is gone: demo info is pre-rendered to html at build time and baked into the page
// ———————————————————————————
import {
	EditorState,
	EditorSelection,
	Compartment,
	RangeSetBuilder,
	StateField,
	StateEffect,
	MapMode,
	EditorView,
	lineNumbers,
	highlightActiveLine,
	highlightActiveLineGutter,
	drawSelection,
	keymap,
	Decoration,
	ViewPlugin,
	WidgetType,
	gutter,
	GutterMarker,
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	indentMore,
	indentLess,
	invertedEffects,
	undo,
	redo,
	undoDepth,
	redoDepth,
	indentOnInput,
	syntaxHighlighting,
	HighlightStyle,
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentUnit,
	tags,
	html,
	css,
	javascript,
	json,
	closeBrackets,
	closeBracketsKeymap,
	autocompletion,
	completionKeymap,
	indentationMarkers,
	oneDarkTheme,
	jsBeautify,
	acorn
} from "./lib/codemirror.js";
import { lintFile, renderLintMsg } from "./parts/lint.js?v=901ba4f4";
import { mediaKind, createMediaView } from "./parts/media.js?v=0f837142";
import { assemblePreview, buildDoc, resolveFile } from "./parts/preview.js?v=fd3c8cc7";
import { readEmbed } from "./parts/embed.js?v=208ec094";
import { strBytes, makeZip } from "./parts/zip.js?v=d12a0d56";
import { fileIconSvg } from "./parts/icons.js?v=785950c8";
import { mdToHtml } from "./parts/markdown.js?v=d8515f10";

// the CodeMirror language for a file's kind (html keeps tag auto-closing)
function languageExt(lang, autoCloseOn) {
	if (lang === "css") return css();
	if (lang === "javascript") return javascript();
	if (lang === "html") return html({ autoCloseTags: autoCloseOn });
	if (lang === "json") return json();
	return []; // media / text: no language parser
}

let frame = document.getElementById("preview-frame");
let logEl = document.getElementById("console-log");
let timer,
	delay = 150,
	paused = false;

function addLine(level, text) {
	const marks = { log: "", warn: "\u26A0", error: "\u2715", input: "\u203A", result: "\u2039" };
	let row = document.createElement("div");
	row.className = `ln ${level}`;
	let markSpan = document.createElement("span");
	markSpan.className = "mark";
	markSpan.textContent = marks[level] || "";
	let bodySpan = document.createElement("span");
	bodySpan.textContent = text;
	row.append(markSpan, bodySpan);
	logEl.append(row);
	logEl.scrollTop = logEl.scrollHeight;
}

// eval queue: hold console commands until the iframe bridge is live
let frameReady = false,
	evalQueue = [];
function flushQueue() {
	while (evalQueue.length && frame.contentWindow)
		frame.contentWindow.postMessage({ __cm6eval: true, code: evalQueue.shift() }, "*");
}
function sendEval(code) {
	if (frameReady && frame.contentWindow) frame.contentWindow.postMessage({ __cm6eval: true, code: code }, "*");
	else evalQueue.push(code);
}

window.addEventListener("message", function (e) {
	const d = e.data;
	if (!d) return;
	if (d.__cm6ready) {
		frameReady = true;
		flushQueue();
		return;
	}
	if (d.__cm6) {
		addLine(d.level, d.text);
		return;
	}
	if (typeof d.__cm6nav === "string") {
		navigatePreview(d.__cm6nav);
		return;
	}
});

// a link to another local page inside the preview shows that page (an html file in this demo); non-local or non-html targets are ignored as a broken link
function navigatePreview(href) {
	const f = resolveFile(previewEntry, href, files); // resolve relative to the shown page
	if (f && f.lang === "html") {
		previewEntry = f.name;
		render();
		renderTabs();
	}
}

// render assembles the preview from all files (keeping the active file in sync with the editor text passed in), then injects the console/anchor shims; referenced font files are prefetched same-origin from this page and cached as data urls, and when one resolves we re-render so the sandboxed preview can use it
function ensureFontData() {
	if (typeof fetch !== "function") return; // no fetch available: fonts fall back to their URL
	files.forEach(function (f) {
		if (f.lang !== "media" || mediaKind(f.name) !== "font") return;
		let s = f.src;
		if (!s || /^data:/i.test(s) || mediaCache[s]) return; // no src, inline already, or in-flight/done
		mediaCache[s] = "pending";
		fetch(s)
			.then(function (r) {
				return r.ok ? r.blob() : null;
			})
			.then(function (blob) {
				if (!blob) {
					mediaCache[s] = "failed";
					return;
				}
				let fr = new FileReader();
				fr.onload = function () {
					mediaCache[s] = String(fr.result);
					render();
				};
				fr.onerror = function () {
					mediaCache[s] = "failed";
				};
				fr.readAsDataURL(blob);
			})
			.catch(function () {
				mediaCache[s] = "failed";
			});
	});
}
// "Currently previewing: <file>" bar — shown only for multi-file demos
var previewNowEl = document.getElementById("preview-now"),
	previewNowFile = document.getElementById("preview-now-file");
function updatePreviewNow() {
	if (!previewNowEl) return;
	const multi = demoIsMulti || files.length > 1;
	previewNowEl.hidden = !multi;
	if (multi && previewNowFile) previewNowFile.textContent = previewEntry;
}
// the preview assembler asks here for a cached font data URL (fonts must be inlined; see ensureFontData)
function fontDataUrl(src) {
	const c = mediaCache[src];
	return c && c !== "pending" && c !== "failed" ? c : null;
}
function render(doc) {
	updatePreviewNow();
	if (!runEnabled) return;
	if (typeof doc === "string" && files[activeFile]) files[activeFile].content = doc;
	ensureFontData();
	clearTimeout(timer);
	frameReady = false;
	const html = buildDoc(assemblePreview(files, previewEntry, fontDataUrl), files, previewEntry);
	// recreate the iframe every render: assigning srcdoc to a persistent iframe pushes a browser session-history entry each time, so after a few keystrokes the editor page is buried under dozens of preview states and back/forward gets stuck cycling through them — a freshly-inserted iframe's initial load replaces instead of pushing, keeping the top-level history clean, and cloneNode preserves the style (zoom/size)
	let fresh = frame.cloneNode(false);
	fresh.removeAttribute("src");
	fresh.srcdoc = html;
	frame.parentNode.replaceChild(fresh, frame);
	frame = fresh;
}
function schedule(doc) {
	clearTimeout(timer);
	if (paused) return;
	timer = setTimeout(function () {
		render(doc);
	}, delay);
}

// console input
let input = document.getElementById("console-input");
let hist = [],
	historyIndex = -1;
input.addEventListener("keydown", function (e) {
	if (e.key === "Enter") {
		const code = input.value.trim();
		if (!code) return;
		addLine("input", code);
		hist.push(code);
		historyIndex = hist.length;
		input.value = "";
		sendEval(code);
	} else if (e.key === "ArrowUp") {
		if (historyIndex > 0) {
			historyIndex--;
			input.value = hist[historyIndex];
			e.preventDefault();
		}
	} else if (e.key === "ArrowDown") {
		if (historyIndex < hist.length - 1) {
			historyIndex++;
			input.value = hist[historyIndex];
		} else {
			historyIndex = hist.length;
			input.value = "";
		}
	}
});
document.getElementById("console-clear").addEventListener("click", function () {
	logEl.innerHTML = "";
});

// ———————————————————————————
// MULTI-FILE MODEL
// files are baked into #demo-files (one <textarea class="demo-file"> each); one codemirror view edits the active file and the tab bar swaps which file that is
// `starter` is the entry file's code, seeding the view and the offline fallback
// ———————————————————————————
function readFiles() {
	const out = [],
		box = document.getElementById("demo-files");
	if (box)
		Array.prototype.forEach.call(box.querySelectorAll("textarea.demo-file"), function (t) {
			out.push({
				name: t.getAttribute("data-name") || "index.html",
				lang: t.getAttribute("data-lang") || "html",
				content: t.value,
				src: t.getAttribute("data-src") || ""
			});
		});
	if (!out.length) out.push({ name: "index.html", lang: "html", content: "" });
	return out;
}
const demoFilesBox = document.getElementById("demo-files");
var demoEntry = (demoFilesBox && demoFilesBox.getAttribute("data-entry")) || "index.html";
var demoIsMulti = !!(demoFilesBox && demoFilesBox.getAttribute("data-multi") === "1");
var allowAddFiles = !!(demoFilesBox && demoFilesBox.getAttribute("data-allow-add") === "1");
var files = readFiles();
var activeFile = Math.max(
	0,
	files.findIndex(function (f) {
		return f.name === demoEntry;
	})
);
const starter = files[activeFile] ? files[activeFile].content : "";
var states = []; // one EditorState per file (parallel to `files`) -> per-file undo
var switching = false; // true while swapping files, so the preview doesn't re-run
var previewEntry = demoEntry; // which page the preview currently shows (for multi-page nav)
var mediaCache = {}; // font src URL -> data URL (fetched for the sandboxed preview)

// ———————————————————————————
// INDENTATION ON WRAPPED LINES
// measure each line's leading-whitespace width (columns, tabs expanded) and apply a hanging indent: text-indent pulls the first visual line back so it still starts at the normal left padding, while padding-left pushes wrapped continuation lines in to align under the first non-whitespace char
// the indent width is in pixels from cm's own measured character width, not the `ch` unit — `ch` is the width of "0", which can differ from the space-based tab stops cm renders; padding-left is base + indent (not just indent) so the line's normal left gap survives
// ———————————————————————————
const LINE_PAD = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cm-line-pad")) || 6;
function leadingCols(text, tabSize) {
	let cols = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === " ") cols++;
		else if (ch === "\t") cols += tabSize - (cols % tabSize);
		else break;
	}
	return cols;
}
const wrapIndent = ViewPlugin.fromClass(
	function (view) {
		function build(view) {
			const tab = view.state.tabSize;
			const cw = view.defaultCharacterWidth; // px per character, as CM measures it
			const b = new RangeSetBuilder();
			for (let r = 0; r < view.visibleRanges.length; r++) {
				const range = view.visibleRanges[r];
				for (let pos = range.from; pos <= range.to;) {
					const line = view.state.doc.lineAt(pos);
					const cols = leadingCols(line.text, tab);
					if (cols > 0) {
						const px = cols * cw;
						b.add(
							line.from,
							line.from,
							Decoration.line({
								attributes: {
									style: `text-indent:-${px.toFixed(2)}px; padding-left:${(px + LINE_PAD).toFixed(2)}px;`
								}
							})
						);
					}
					pos = line.to + 1;
				}
			}
			return b.finish();
		}
		this.decorations = build(view);
		this.update = function (u) {
			if (u.docChanged || u.viewportChanged || u.geometryChanged) this.decorations = build(u.view);
		};
	},
	{
		decorations: function (v) {
			return v.decorations;
		}
	}
);

var WRAP_ON = [EditorView.lineWrapping, wrapIndent];

// ———————————————————————————
// LINE ANNOTATIONS
// gutter pins + collapsible callouts: notes are anchored to 1-based line numbers, swapped per demo, and collapsed by default so the code stays clean — a pin shows in the gutter and clicking it expands a styled callout under that line
// internally each note is anchored to a document position held in one StateField, so on every edit its position is mapped through the change set and the note rides along as lines are added or removed above it; when a note's own line is removed (see lineRemoved) the note is dropped, which also closes it, and an invertedEffects hook re-adds dropped notes when the deletion is undone
// each note keeps a stable id and its own open flag
// ———————————————————————————
var setAnnotations = StateEffect.define(); // value: [{id,text,line,open}] — seed a demo (line -> pos here)
const toggleAnno = StateEffect.define(); // value: annotation id
const setAllAnno = StateEffect.define(); // value: boolean (open / close all remaining notes)
const readdAnnos = StateEffect.define({
	// re-add notes on undo (positions map through later edits)
	map: function (annos, changes) {
		return annos.map(function (a) {
			return { id: a.id, text: a.text, from: changes.mapPos(a.from, 1), open: a.open };
		});
	}
});

// a note's line counts as "removed" if either end of the line it sat on was deleted — TrackDel only flags a position when it is strictly inside a deletion, so checking both the line start and end catches deleting the line from either boundary
function lineRemoved(tr, anno) {
	const line = tr.startState.doc.lineAt(anno.from);
	if (tr.changes.mapPos(line.from, 1, MapMode.TrackDel) == null) return true;
	if (line.to > line.from && tr.changes.mapPos(line.to, -1, MapMode.TrackDel) == null) return true;
	return false;
}

var annoField = StateField.define({
	create: function () {
		return [];
	}, // [{id,text,from,open}]
	update: function (list, tr) {
		let next = list;
		if (tr.docChanged) {
			next = [];
			for (let i = 0; i < list.length; i++) {
				if (lineRemoved(tr, list[i])) continue; // this note's line was removed -> drop it (undo can re-add)
				next.push({
					id: list[i].id,
					text: list[i].text,
					from: tr.changes.mapPos(list[i].from, 1),
					open: list[i].open
				});
			}
		}
		for (let k = 0; k < tr.effects.length; k++) {
			var e = tr.effects[k];
			if (e.is(setAnnotations)) {
				next = (e.value || []).map(function (a) {
					const ln = Math.max(1, Math.min(a.line || 1, tr.state.doc.lines));
					return { id: a.id, text: a.text, from: tr.state.doc.line(ln).from, open: !!a.open };
				});
			} else if (e.is(toggleAnno)) {
				next = next.map(function (a) {
					return a.id === e.value ? { id: a.id, text: a.text, from: a.from, open: !a.open } : a;
				});
			} else if (e.is(setAllAnno)) {
				next = next.map(function (a) {
					return { id: a.id, text: a.text, from: a.from, open: e.value };
				});
			} else if (e.is(readdAnnos)) {
				next = next.concat(
					e.value.map(function (a) {
						return { id: a.id, text: a.text, from: a.from, open: false };
					})
				);
			}
		}
		return next;
	}
});
// undo of a line-removing edit re-adds the notes it dropped (at their old positions)
const annoUndo = invertedEffects.of(function (tr) {
	if (!tr.docChanged) return [];
	const dropped = tr.startState.field(annoField).filter(function (a) {
		return lineRemoved(tr, a);
	});
	return dropped.length
		? [
				readdAnnos.of(
					dropped.map(function (a) {
						return { id: a.id, text: a.text, from: a.from, open: a.open };
					})
				)
			]
		: [];
});
function annoAtLine(state, ln) {
	const list = state.field(annoField);
	for (let i = 0; i < list.length; i++) if (state.doc.lineAt(list[i].from).number === ln) return list[i];
	return null;
}

function AnnoWidget(a) {
	this.a = a;
}
AnnoWidget.prototype = Object.create(WidgetType.prototype);
AnnoWidget.prototype.eq = function (o) {
	return o.a.id === this.a.id && o.a.text === this.a.text;
};
AnnoWidget.prototype.ignoreEvent = function () {
	return true;
};
AnnoWidget.prototype.toDOM = function () {
	let el = document.createElement("div");
	el.className = "cm-anno";
	let inner = document.createElement("div");
	inner.className = "cm-anno-inner";
	let b = document.createElement("div");
	b.className = "cm-anno-text";
	b.innerHTML = this.a.text || "";
	inner.append(b);
	if (standaloneMode) {
		const id = this.a.id;
		const acts = document.createElement("div");
		acts.className = "dlg-actions";
		acts.style.cssText = "justify-content:flex-start;margin-top:12px";
		acts.innerHTML = `<button type="button" class="ctrl" data-note-act="edit">${ACT_ICONS.rename}<span>Edit note</span></button><button type="button" class="ctrl" data-note-act="remove">${ACT_ICONS.trash}<span>Remove note</span></button>`;
		acts.querySelector('[data-note-act="edit"]').onclick = function () {
			openNoteDialog(id, 0);
		};
		acts.querySelector('[data-note-act="remove"]').onclick = function () {
			removeNote(id);
		};
		inner.append(acts);
	}
	el.append(inner);
	return el;
};

function annoDecos(state) {
	const ranges = [];
	state.field(annoField).forEach(function (a) {
		if (!a.open) return;
		const line = state.doc.lineAt(a.from);
		ranges.push(Decoration.line({ class: "cm-anno-line" }).range(line.from)); // highlight the line an open note points at
		ranges.push(Decoration.widget({ widget: new AnnoWidget(a), block: true, side: 1 }).range(line.to));
	});
	return Decoration.set(ranges, true); // second arg: sort the ranges for us
}
const annoDecoField = StateField.define({
	create: function (state) {
		return annoDecos(state);
	},
	update: function (deco, tr) {
		if (tr.docChanged || tr.effects.length) return annoDecos(tr.state);
		return deco;
	},
	provide: function (f) {
		return EditorView.decorations.from(f);
	}
});

// syntax warnings (lint): highlight the offending line(s)
var setLint = StateEffect.define(); // value: sorted array of doc offsets, one per issue
const lintLineField = StateField.define({
	create: function () {
		return Decoration.none;
	},
	update: function (deco, tr) {
		deco = deco.map(tr.changes);
		for (let i = 0; i < tr.effects.length; i++) {
			if (tr.effects[i].is(setLint)) {
				var b = new RangeSetBuilder();
				var seen = {};
				tr.effects[i].value.forEach(function (pos) {
					let line = tr.state.doc.lineAt(Math.max(0, Math.min(pos, tr.state.doc.length)));
					if (seen[line.from]) return; // one decoration per line
					seen[line.from] = 1;
					b.add(line.from, line.from, Decoration.line({ class: "cm-lint-line" }));
				});
				deco = b.finish();
			}
		}
		return deco;
	},
	provide: function (f) {
		return EditorView.decorations.from(f);
	}
});

function PinMarker(open, empty) {
	this.open = open;
	this.empty = empty;
}
PinMarker.prototype = Object.create(GutterMarker.prototype);
PinMarker.prototype.toDOM = function () {
	let s = document.createElement("span");
	s.className = `cm-anno-pin${this.open ? " open" : ""}${this.empty ? " empty" : ""}`;
	s.innerHTML =
		'<svg viewBox="0 0 100 100"><path d="M64.14,90l25.86-25.86V10H10v80h54.14ZM60,80v-20h20l-20,20ZM20,80V20h60v30h-30v30h-30Z"/></svg>';
	return s;
};
var annoGutter = gutter({
	class: "cm-anno-gutter",
	lineMarker: function (view, line) {
		const a = annoAtLine(view.state, view.state.doc.lineAt(line.from).number);
		if (a) return new PinMarker(!!a.open, false);
		// the blank editor offers a faint pin on every line, as somewhere to hang a new note
		return standaloneMode ? new PinMarker(false, true) : null;
	},
	lineMarkerChange: function (u) {
		return u.docChanged || u.startState.field(annoField) !== u.state.field(annoField);
	},
	initialSpacer: function () {
		return new PinMarker(false);
	}, // stable gutter width
	domEventHandlers: {
		mousedown: function (view, line) {
			const ln = view.state.doc.lineAt(line.from).number;
			const a = annoAtLine(view.state, ln);
			if (a) {
				view.dispatch({ effects: toggleAnno.of(a.id) }); // a note already lives here, so just show or hide it
				return true;
			}
			if (!standaloneMode) return false;
			openNoteDialog(null, ln);
			return true;
		}
	}
});

// keep callouts sized to the visible editor width, so they fit on screen even with wrapping off and the line scrolled horizontally
const calloutSizer = ViewPlugin.fromClass(function (view) {
	function sync(view) {
		const scroller = view.scrollDOM;
		const gutters = scroller.querySelector(".cm-gutters");
		const gw = gutters ? gutters.offsetWidth : 0;
		view.dom.style.setProperty("--cm-gw", `${gw}px`);
		view.dom.style.setProperty("--cm-callout-w", `${Math.max(120, scroller.clientWidth - gw)}px`);
	}
	sync(view);
	this.update = function (u) {
		if (u.geometryChanged) sync(u.view);
	};
});

// the pin gutter is added per-demo via a compartment, so demos with no annotations get no gutter at all (and no reserved width), while the state field and decorations stay live and the setAllAnno dispatches stay harmless no-ops on note-less demos
var annoGutterComp = new Compartment();
var annoExt = [annoField, annoUndo, annoDecoField, calloutSizer, annoGutterComp.of([]), lintLineField];

var wrapComp = new Compartment();
var highlightComp = new Compartment();
var fontComp = new Compartment();
var autoCloseComp = new Compartment();
var autoCompleteComp = new Compartment();
var themeComp = new Compartment();
var indentComp = new Compartment();
var langComp = new Compartment(); // the active file's language (swapped on tab change)
var historyComp = new Compartment(); // reset per file so undo doesn't cross a tab switch
function fontTheme(px) {
	return EditorView.theme({ "&": { fontSize: `${px}px` } });
}
// bracket/quote closing (the HTML tag auto-close lives in the language, see languageExt)
function autoClose(on) {
	return on ? closeBrackets() : [];
}

function lsGet(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		return null;
	}
}
function lsSet(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch (e) {}
}

// ———————————————————————————
// EMBED MODE
// a url `embed` token (e.g. ep.n1.pc.auto.ro) renders the app as a slim widget: no controls panel, spines or resizers, a thin top toolbar instead, only the chosen panels, fixed prefs (autocomplete off; syntax/auto-close/wrap on; 14px; 150ms), and localStorage ignored entirely
// token format, each segment optional and a missing one turning that feature off: i = info panel, c0/c1/c2 = code + notes / code + notes open / code with no notes, p0/p1/p2 = preview + console / preview only / console only, ro = read-only, d = show dimensions (only when a live preview iframe is shown)
// any url with an `embed` param is an embed; a token with no recognized codes falls back to the default full 3-panel embed
// ———————————————————————————
function prefersLight() {
	try {
		return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches;
	} catch (e) {
		return false;
	}
}
var embed = readEmbed();
var embedMode = !!embed;
var runEnabled = !embedMode || embed.preview; // does the code execute / a preview render?
var notesEnabled = !embedMode || embed.notes; // are annotation dots/callouts present?
if (embedMode) allowAddFiles = false; // embeds are read-only: no add / delete / rename / reorder
if (embedMode) {
	document.body.classList.add("embed");
	document.body.classList.toggle("emb-no-info", !embed.info);
	document.body.classList.toggle("emb-no-code", !embed.code);
	document.body.classList.toggle("emb-no-preview", !embed.preview);
	if (embed.preview && embed.content === "c") {
		// console-only embed: reuse the main-site "preview disabled" layout
		document.body.classList.add("cfg-console-only");
		var pdOverlay = document.getElementById("preview-disabled");
		if (pdOverlay) pdOverlay.hidden = false;
	}
	document.body.classList.toggle("emb-no-console", embed.preview && embed.content === "p");
	document.body.classList.toggle("emb-no-dim", embed.preview && !embed.dimensions);
	document.body.classList.add(`emb-cols-${embed.info ? 1 : 0}${embed.code ? 1 : 0}${embed.preview ? 1 : 0}`);
	// in an info-panel embed the demo title shouldn't open the nav popup — make it inert
	let idh = document.querySelector(".info-demo-head");
	if (idh) {
		idh.onclick = null;
		idh.removeAttribute("data-nav-open");
		idh.removeAttribute("role");
		idh.removeAttribute("tabindex");
		idh.removeAttribute("title");
	}
}

// ———————————————————————————
// PER-DEMO CONFIG
// baked into #demo-config: console mode, setting defaults and locks, info-only; locked settings show their button disabled
// ———————————————————————————
function readDemoConfig() {
	const el = document.getElementById("demo-config");
	if (!el || !el.textContent.trim()) return {};
	try {
		return JSON.parse(el.textContent);
	} catch (e) {
		return {};
	}
}
var demoCfg = readDemoConfig();
const cfgSettings = demoCfg.settings || {},
	cfgLock = demoCfg.lock || [];
function cfgLocked(key) {
	return cfgLock.indexOf(key) >= 0;
}
function cfgInit(key, dflt) {
	return typeof cfgSettings[key] === "boolean" ? cfgSettings[key] : dflt;
}
const zoomEnabled = cfgInit("zoom", true);
// which panels to show, from CONFIG.panels (info/code/preview booleans + console) — if info, code and preview are all off, show all three
const panelsCfg = demoCfg.panels && typeof demoCfg.panels === "object" ? demoCfg.panels : {};
let showInfo = panelsCfg.info !== false,
	showCode = panelsCfg.code !== false;
// the console lives inside the preview panel: true shows it, false hides it — turning the preview off while leaving the console on gives a "console-only" panel, where the preview iframe is hidden behind the console and the console fills the panel on its own
const consoleCfg = panelsCfg.console;
const consoleOnly = panelsCfg.preview === false && consoleCfg === true;
// the preview PANEL still has to exist to host a console-only view
let showPreview = panelsCfg.preview !== false || consoleOnly;
if (!showInfo && !showCode && !showPreview) {
	showInfo = showCode = showPreview = true;
}
const consoleMode = consoleOnly ? "only" : "open";
const hideConsole = consoleCfg === false;
document.body.classList.toggle("cfg-hide-info", !showInfo);
document.body.classList.toggle("cfg-hide-code", !showCode);
document.body.classList.toggle("cfg-hide-preview", !showPreview);
document.body.classList.toggle("cfg-hide-console", hideConsole);
document.body.classList.toggle("cfg-solo", (showInfo ? 1 : 0) + (showCode ? 1 : 0) + (showPreview ? 1 : 0) === 1);

// code theme (dark only)
var highlighting = cfgInit("syntax", embedMode ? true : lsGet("lp-highlight") !== "0"); // default on, persisted across demos

function codeThemeExt() {
	return oneDarkTheme;
}

// class-based syntax highlighting: every token type gets a `.tok-*` class so the colors live in style.css (see its "syntax highlighting" section) rather than being baked in here
var tokenHighlight = HighlightStyle.define([
	{ tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], class: "tok-keyword" },
	{ tag: [tags.string, tags.special(tags.string), tags.regexp], class: "tok-string" },
	{ tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: "tok-comment" },
	{ tag: [tags.number, tags.integer, tags.float], class: "tok-number" },
	{ tag: [tags.bool, tags.atom, tags.null], class: "tok-atom" },
	{
		tag: [tags.operator, tags.derefOperator, tags.compareOperator, tags.arithmeticOperator, tags.logicOperator],
		class: "tok-operator"
	},
	{ tag: [tags.variableName, tags.name], class: "tok-variable" },
	{ tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], class: "tok-def" },
	{ tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: "tok-function" },
	{ tag: [tags.propertyName], class: "tok-property" },
	{ tag: [tags.typeName, tags.namespace], class: "tok-type" },
	{ tag: [tags.className], class: "tok-class" },
	{ tag: [tags.tagName], class: "tok-tag" },
	{ tag: [tags.angleBracket], class: "tok-bracket-html" },
	{ tag: [tags.attributeName], class: "tok-attr" },
	{ tag: [tags.attributeValue], class: "tok-attr-value" },
	{ tag: [tags.punctuation, tags.separator], class: "tok-punct" },
	{ tag: [tags.bracket, tags.squareBracket, tags.paren, tags.brace], class: "tok-bracket" },
	{ tag: [tags.meta, tags.processingInstruction], class: "tok-meta" },
	{ tag: [tags.link, tags.url], class: "tok-link" },
	{ tag: [tags.heading], class: "tok-heading" },
	{ tag: [tags.emphasis], class: "tok-emphasis" },
	{ tag: [tags.strong], class: "tok-strong" },
	{ tag: [tags.invalid], class: "tok-invalid" }
]);
function highlightExt() {
	return highlighting ? syntaxHighlighting(tokenHighlight) : [];
}
function indentExt() {
	const line = "#33374a";
	const active = "#7c6aff";
	return indentationMarkers({
		highlightActiveBlock: true,
		colors: { light: line, dark: line, activeLight: active, activeDark: active }
	});
}

// Mod-D: with no selection, select the word under the cursor; with a selection, add the next occurrence of that text as another cursor (wrapping around) — implemented inline so we don't depend on @codemirror/search
function selectNextOccurrence(view) {
	var state = view.state,
		sel = state.selection,
		main = sel.main;
	if (main.empty) {
		const word = state.wordAt(main.head);
		if (!word) return false;
		view.dispatch({ selection: EditorSelection.range(word.from, word.to) });
		return true;
	}
	var query = state.sliceDoc(main.from, main.to);
	if (!query) return false;
	const doc = state.doc.toString();
	const taken = function (i) {
		return sel.ranges.some(function (r) {
			return r.from === i && r.to === i + query.length;
		});
	};
	const start = sel.ranges.reduce(function (m, r) {
		return Math.max(m, r.to);
	}, 0);
	let i = doc.indexOf(query, start);
	if (i < 0) i = doc.indexOf(query, 0); // wrap to the top
	while (i >= 0 && taken(i)) i = doc.indexOf(query, i + 1);
	if (i < 0) return false;
	const ranges = sel.ranges.concat(EditorSelection.range(i, i + query.length));
	view.dispatch({ selection: EditorSelection.create(ranges, ranges.length - 1), scrollIntoView: true });
	return true;
}

// restore persisted editor settings (remembered across demos via localStorage; embeds are fixed presentations and ignore them), threaded into the initial compartment values below so there is no resize or reflow flash
const savedFs = parseInt(lsGet("lp-fs"), 10);
var startFs = !embedMode && savedFs >= 9 && savedFs <= 28 ? savedFs : 14;
var startWrap = cfgInit("wrap", embedMode ? true : lsGet("lp-wrap") !== "0"); // wrap is on by default
var startAutoClose = cfgInit("autoclose", embedMode ? true : lsGet("lp-autoclose") !== "0"); // default on
var startComplete = cfgInit("autocomplete", embedMode ? false : lsGet("lp-autocomplete") !== "0"); // default on
const startWarnings = cfgInit("warnings", embedMode ? false : lsGet("lp-warnings") !== "0"); // default on, off in embeds

// the full extension set for a file's EditorState, parameterised by its language — every file gets its own state so undo/redo is per-file, while settings live in compartments and are re-synced to the active state on each tab switch
function editorExtensions(lang) {
	return [
		EditorState.allowMultipleSelections.of(true), // Mod-D adds cursors; without this they collapse to one
		themeComp.of(codeThemeExt()),
		fontComp.of(fontTheme(startFs)),
		indentUnit.of("\t"),
		indentComp.of(indentExt()),
		lineNumbers(),
		highlightActiveLine(),
		highlightActiveLineGutter(),
		annoExt,
		drawSelection(),
		foldGutter(),
		historyComp.of(history()),
		indentOnInput(),
		bracketMatching(),
		langComp.of(languageExt(lang, startAutoClose)),
		autoCloseComp.of(autoClose(startAutoClose)),
		autoCompleteComp.of(startComplete ? autocompletion() : []),
		highlightComp.of(highlightExt()),
		wrapComp.of(startWrap ? WRAP_ON : []),
		embedMode && embed.readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
		keymap.of(
			[
				indentWithTab,
				{ key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
				{ key: "Mod-]", run: indentMore, preventDefault: true },
				{ key: "Mod-[", run: indentLess, preventDefault: true }
			].concat(closeBracketsKeymap, completionKeymap, defaultKeymap, historyKeymap, foldKeymap)
		),
		EditorView.updateListener.of(function (u) {
			if (u.docChanged && !switching) {
				// real edit (not a tab switch): re-run + re-lint
				const doc = u.state.doc.toString();
				if (files[activeFile]) files[activeFile].content = doc;
				// editing an HTML file brings it into the preview (so you see what you're editing)
				const af = files[activeFile];
				if (af && af.lang === "html" && af.name !== previewEntry) {
					previewEntry = af.name;
					renderTabs();
				}
				schedule(doc);
				setDirty(filesDirty());
				scheduleLint();
			}
			// re-sync the notes buttons whenever the annotation set changes
			if (u.startState.field(annoField) !== u.state.field(annoField)) setNotesBtns(u.state);
			// undo/redo availability can change on any transaction (edit, undo, redo)
			if (u.docChanged || u.transactions.length) setUndoRedoBtns(u.state);
			// line/column + selection readout
			if (u.docChanged || u.selectionSet) updateCursorPos(u.state);
			// keep the simulated scrollbars in step with content / geometry / scroll
			if (syncScrollbars && (u.docChanged || u.geometryChanged || u.viewportChanged)) syncScrollbars();
		})
	];
}

var syncScrollbars = null; // set up right after the view exists (see setupScrollbars)

var view = new EditorView({
	state: EditorState.create({
		doc: starter,
		extensions: editorExtensions(files[activeFile] ? files[activeFile].lang : "html")
	}),
	parent: document.getElementById("code-wrap")
});

// ———————————————————————————
// SIMULATED SCROLLBARS
// codemirror has no built-in styled scrollbar, so we hide the native ones in css and overlay our own on .cm-scroller
// the vertical bar always tracks vertical overflow; the horizontal bar only appears when the content is wider than the viewport, i.e. when line wrap is off
// ———————————————————————————
syncScrollbars = (function setupScrollbars() {
	var sc = view.scrollDOM; // .cm-scroller (the element that actually scrolls)
	var host = view.dom; // .cm-editor (positioned; holds the overlays)
	var MIN = 24; // minimum thumb length in px
	function mk(cls) {
		let d = document.createElement("div");
		d.className = cls;
		return d;
	}
	var vbar = mk("cm-vbar"),
		vthumb = mk("cm-vthumb");
	vbar.appendChild(vthumb);
	var hbar = mk("cm-hbar"),
		hthumb = mk("cm-hthumb");
	hbar.appendChild(hthumb);
	host.appendChild(vbar);
	host.appendChild(hbar);

	function sync() {
		const ch = sc.clientHeight,
			sh = sc.scrollHeight,
			st = sc.scrollTop;
		const cw = sc.clientWidth,
			sw = sc.scrollWidth,
			sl = sc.scrollLeft;
		const vNeed = sh - ch > 1,
			hNeed = sw - cw > 1;
		vbar.style.display = vNeed ? "block" : "none";
		hbar.style.display = hNeed ? "block" : "none";
		host.classList.toggle("cm-both-bars", vNeed && hNeed);
		if (vNeed) {
			const vt = vbar.clientHeight; // read after display/class set
			const th = Math.max(MIN, Math.round((vt * ch) / sh));
			const top = sh - ch ? (vt - th) * (st / (sh - ch)) : 0;
			vthumb.style.height = `${th}px`;
			vthumb.style.transform = `translateY(${top}px)`;
		}
		if (hNeed) {
			const ht = hbar.clientWidth;
			const tw = Math.max(MIN, Math.round((ht * cw) / sw));
			const left = sw - cw ? (ht - tw) * (sl / (sw - cw)) : 0;
			hthumb.style.width = `${tw}px`;
			hthumb.style.transform = `translateX(${left}px)`;
		}
	}

	// drag a thumb -> scroll proportionally
	function drag(thumb, vertical) {
		thumb.addEventListener("pointerdown", function (e) {
			e.preventDefault();
			thumb.classList.add("dragging");
			try {
				thumb.setPointerCapture(e.pointerId);
			} catch (err) {}
			var start = vertical ? e.clientY : e.clientX;
			var startScroll = vertical ? sc.scrollTop : sc.scrollLeft;
			function move(ev) {
				const barLen = vertical ? vbar.clientHeight : hbar.clientWidth;
				const view_ = vertical ? sc.clientHeight : sc.clientWidth;
				const total = vertical ? sc.scrollHeight : sc.scrollWidth;
				const th = Math.max(MIN, Math.round((barLen * view_) / total));
				const range = barLen - th;
				if (range <= 0) return;
				const delta = (vertical ? ev.clientY : ev.clientX) - start;
				const next = startScroll + delta * ((total - view_) / range);
				if (vertical) sc.scrollTop = next;
				else sc.scrollLeft = next;
			}
			function up(ev) {
				thumb.classList.remove("dragging");
				try {
					thumb.releasePointerCapture(e.pointerId);
				} catch (err) {}
				document.removeEventListener("pointermove", move);
				document.removeEventListener("pointerup", up);
			}
			document.addEventListener("pointermove", move);
			document.addEventListener("pointerup", up);
		});
	}
	drag(vthumb, true);
	drag(hthumb, false);

	sc.addEventListener("scroll", sync, { passive: true });
	if (typeof ResizeObserver === "function") {
		try {
			new ResizeObserver(sync).observe(sc);
		} catch (err) {}
	}
	requestAnimationFrame(sync);
	return sync;
})();

// ———————————————————————————
// SYNTAX WARNINGS (LINT)
// static, beginner-focused checks on the editor's text — nothing is executed, so every line number maps to what the student sees
// html: mismatched, stray or unclosed tags, unterminated comments, unclosed attribute quotes, missing ">"; css: missing colon, empty property or value, likely-missing semicolon, unbalanced braces, unterminated comment or string; js: each inline <script> parsed with acorn for an exact offset
// results show in a chip at the bottom-left of the editor (click the count for the full list); each offending line is tinted and clicking it jumps there
// ———————————————————————————
var lintBar = document.getElementById("lint-bar");
var lintListOpen = false;

function jumpToOffset(off) {
	const pos = Math.max(0, Math.min(off, view.state.doc.length));
	const line = view.state.doc.lineAt(pos);
	view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
	view.focus();
}
function closeLintList() {
	lintListOpen = false;
	let l = document.getElementById("lint-list");
	if (l) l.hidden = true;
}

function lintRow(d, cls) {
	let row = document.createElement("button");
	row.type = "button";
	row.className = cls;
	row.title = `Jump to line ${d.line}`;
	let head = document.createElement("span");
	head.className = "lint-head";
	head.textContent = `${d.kind}  issue on line ${d.line}`;
	let msg = document.createElement("span");
	msg.className = "lint-msg";
	msg.innerHTML = renderLintMsg(d.msg);
	row.appendChild(head);
	row.appendChild(msg);
	return row;
}

function updateLintBar(diags) {
	if (!lintBar) return;
	lintBar.textContent = "";
	if (!diags.length) {
		lintBar.hidden = true;
		lintListOpen = false;
		return;
	}
	lintBar.hidden = false;

	// the single-warning chip (first issue + an optional "N issues" toggle)
	let chipRow = document.createElement("div");
	chipRow.className = "lint-chip-row";
	const d0 = diags[0];
	let jump = lintRow(d0, "lint-jump");
	jump.onclick = function () {
		jumpToOffset(d0.off);
	};
	chipRow.appendChild(jump);

	if (diags.length > 1) {
		let more = document.createElement("button");
		more.type = "button";
		more.className = "lint-more";
		more.title = "Show all issues";
		more.textContent = `${diags.length} issues`;
		let list = document.createElement("div");
		list.id = "lint-list";
		list.hidden = !lintListOpen;
		diags.forEach(function (d) {
			let row = lintRow(d, "lint-listrow");
			row.onclick = function () {
				jumpToOffset(d.off);
				closeLintList();
			};
			list.appendChild(row);
		});
		more.onclick = function () {
			lintListOpen = !lintListOpen;
			list.hidden = !lintListOpen;
		};
		chipRow.appendChild(more);
		lintBar.appendChild(list); // full list sits ABOVE the chip (column flex)
		lintBar.appendChild(chipRow);
	} else {
		lintListOpen = false;
		lintBar.appendChild(chipRow);
	}
}

var warningsOn = startWarnings;
function clearLint() {
	view.dispatch({ effects: setLint.of([]) });
	updateLintBar([]);
	closeLintList();
}
function runLint() {
	if (!view) return;
	if (files[activeFile] && files[activeFile].lang === "media") {
		clearLint();
		return;
	} // nothing to lint
	if (!warningsOn) {
		clearLint();
		return;
	}
	const diags = lintFile(view.state.doc.toString(), files[activeFile] ? files[activeFile].lang : "html");
	view.dispatch({
		effects: setLint.of(
			diags.map(function (d) {
				return d.off;
			})
		)
	});
	updateLintBar(diags);
}
var lintTimer = null;
function scheduleLint() {
	clearTimeout(lintTimer);
	lintTimer = setTimeout(runLint, 350);
}
document.addEventListener("click", function (e) {
	if (lintListOpen && lintBar && !lintBar.contains(e.target)) closeLintList();
});
document.addEventListener("keydown", function (e) {
	if (e.key === "Escape" && lintListOpen) closeLintList();
});

let warnBtn = document.getElementById("t-warnings");
if (warnBtn) {
	warnBtn.classList.toggle("on", warningsOn);
	warnBtn.onclick = function () {
		warningsOn = !warningsOn;
		warnBtn.classList.toggle("on", warningsOn);
		if (!embedMode) lsSet("lp-warnings", warningsOn ? "1" : "0");
		if (warningsOn) runLint();
		else clearLint();
	};
}
runLint(); // initial pass

// font size via the theme compartment -> cm re-measures and the gutter realigns instantly
var fsReadout = document.getElementById("fs-readout"),
	fontSize = startFs;
function setFs(size) {
	fontSize = Math.max(9, Math.min(28, size));
	fsReadout.textContent = fontSize;
	view.dispatch({ effects: fontComp.reconfigure(fontTheme(fontSize)) });
}
fsReadout.textContent = fontSize;
document.getElementById("fs-range").value = fontSize;
document.getElementById("fs-range").addEventListener("input", function (e) {
	setFs(parseInt(e.target.value, 10));
	if (!embedMode) lsSet("lp-fs", fontSize);
});

var autoClosing = startAutoClose,
	acBtn = document.getElementById("t-autoclose");
acBtn.classList.toggle("on", autoClosing);
acBtn.onclick = function () {
	autoClosing = !autoClosing;
	acBtn.classList.toggle("on", autoClosing);
	view.dispatch({
		effects: [
			autoCloseComp.reconfigure(autoClose(autoClosing)),
			langComp.reconfigure(languageExt(files[activeFile].lang, autoClosing))
		]
	});
	if (!embedMode) lsSet("lp-autoclose", autoClosing ? "1" : "0");
};

var wrapping = startWrap,
	wrapBtn = document.getElementById("t-wrap");
wrapBtn.classList.toggle("on", wrapping);
wrapBtn.onclick = function () {
	wrapping = !wrapping;
	wrapBtn.classList.toggle("on", wrapping);
	view.dispatch({ effects: wrapComp.reconfigure(wrapping ? WRAP_ON : []) });
	if (!embedMode) lsSet("lp-wrap", wrapping ? "1" : "0");
};

let hlBtn = document.getElementById("t-highlight");
hlBtn.classList.toggle("on", highlighting);
hlBtn.onclick = function () {
	highlighting = !highlighting;
	hlBtn.classList.toggle("on", highlighting);
	view.dispatch({ effects: highlightComp.reconfigure(highlightExt()) });
	if (!embedMode) lsSet("lp-highlight", highlighting ? "1" : "0");
};

var completing = startComplete,
	acmpBtn = document.getElementById("t-autocomplete");
acmpBtn.classList.toggle("on", completing);
acmpBtn.onclick = function () {
	completing = !completing;
	acmpBtn.classList.toggle("on", completing);
	view.dispatch({ effects: autoCompleteComp.reconfigure(completing ? autocompletion() : []) });
	if (!embedMode) lsSet("lp-autocomplete", completing ? "1" : "0");
};

// locked settings (from the demo config): the button looks disabled but stays hoverable so the site tooltip can explain why, and its click becomes a no-op
function lockBtn(key, btn) {
	if (!btn || !cfgLocked(key)) return;
	btn.classList.add("locked");
	btn.removeAttribute("title");
	btn.setAttribute("data-tooltip", "Setting locked for the current demo");
	btn.onclick = function (e) {
		if (e) e.preventDefault();
	};
}
lockBtn("warnings", warnBtn);
lockBtn("autoclose", acBtn);
lockBtn("wrap", wrapBtn);
lockBtn("syntax", hlBtn);
lockBtn("autocomplete", acmpBtn);

// reformat: tidy the html with js-beautify, matching the editor's tab indent
const beautify = jsBeautify.default || jsBeautify; // js-beautify: { html, css, js }
const beautifyHtml = beautify.html || beautify.html_beautify;
const beautifyCss = beautify.css || beautify.css_beautify;
const beautifyJs = beautify.js || beautify.js_beautify;
function prettifierFor(lang) {
	if (lang === "css") return beautifyCss;
	if (lang === "javascript") return beautifyJs;
	if (lang === "html") return beautifyHtml;
	return null; // json / media / text: leave as-is
}
document.getElementById("t-reformat").onclick = function () {
	const pretty = prettifierFor(files[activeFile] ? files[activeFile].lang : "html");
	if (typeof pretty !== "function") return;
	let code = view.state.doc.toString(),
		out;
	try {
		out = pretty(code, {
			indent_with_tabs: true,
			indent_size: 1,
			preserve_newlines: true,
			max_preserve_newlines: 2,
			wrap_line_length: 0,
			end_with_newline: false,
			indent_inner_html: true
		});
	} catch (e) {
		return;
	}
	if (out == null || out === code) return;
	const anchor = Math.min(view.state.selection.main.anchor, out.length);
	view.dispatch({
		changes: { from: 0, to: view.state.doc.length, insert: out },
		selection: { anchor: anchor }
	});
};
lockBtn("prettify", document.getElementById("t-reformat")); // after the onclick above, so the lock's no-op wins

// ———————————————————————————
// PREVIEW CONTROLS
// mirrored between the settings popup and the dimensions bar (pause / re-run / delay / zoom)
// ———————————————————————————
let pausedOverlay = document.getElementById("preview-paused");
const previewWrap = document.getElementById("preview-frame-wrap");
let scale = embedMode ? 1 : parseFloat(lsGet("lp-scale")) || 1;
if (!(scale === 0.5 || scale === 1 || scale === 2)) scale = 1;
if (!zoomEnabled) scale = 1; // zoom disabled for this demo: pin at 1x

function eachById(ids, fn) {
	ids.forEach(function (id) {
		const el = document.getElementById(id);
		if (el) fn(el);
	});
}

function syncPause() {
	eachById(["t-pause", "ph-pause"], function (b) {
		b.classList.toggle("on", paused);
		b.innerHTML = paused
			? '<svg viewBox="0 0 100 100"><polygon points="29.5 82.5 29.5 17.5 74.5 50 29.5 82.5"/></svg><span>Resume</span>'
			: '<svg viewBox="0 0 100 100"><path d="M40,85.23h-10V14.77h10v70.46ZM70,14.77h-10v70.46h10V14.77Z"/></svg><span>Pause</span>';
	});
	if (pausedOverlay) pausedOverlay.hidden = !paused;
}
if (pausedOverlay)
	pausedOverlay.onclick = function () {
		setPaused(false);
	}; // click the dimmed overlay to resume
function setPaused(isPaused) {
	paused = isPaused;
	syncPause();
	if (!paused) render(view.state.doc.toString());
}
function setDelay(ms) {
	delay = ms;
	eachById(["delay", "ph-delay"], function (s) {
		s.value = String(ms);
		let v = s.parentNode && s.parentNode.querySelector(".dsel-val"); // sync the visible small label
		if (v && s.options[s.selectedIndex]) v.textContent = s.options[s.selectedIndex].textContent;
	});
	if (!embedMode) lsSet("lp-delay", String(ms));
}
function rerun() {
	render(view.state.doc.toString());
}

function layoutPreview() {
	if (!previewWrap || !frame) return;
	const wrapWidth = previewWrap.clientWidth,
		wrapHeight = previewWrap.clientHeight;
	if (!wrapWidth || !wrapHeight) return;
	const frameWidth = Math.round(wrapWidth / scale),
		frameHeight = Math.round(wrapHeight / scale);
	frame.style.width = `${frameWidth}px`;
	frame.style.height = `${frameHeight}px`;
	frame.style.transform = scale === 1 ? "none" : `scale(${scale})`;
	if (dimsEl) dimsEl.innerHTML = `${`<span>Dimensions</span><span>` + frameWidth} × ${frameHeight}</span>`;
}
function applyScale(scaleValue) {
	scale = scaleValue;
	layoutPreview();
	Array.prototype.forEach.call(document.querySelectorAll(".zoom-opt"), function (b) {
		b.classList.toggle("on", parseFloat(b.getAttribute("data-scale")) === scale);
	});
	if (!embedMode) lsSet("lp-scale", String(scaleValue));
}

// wire both copies of each control
eachById(["t-pause", "ph-pause"], function (b) {
	b.onclick = function () {
		setPaused(!paused);
	};
});
eachById(["t-rerun", "ph-rerun"], function (b) {
	b.onclick = rerun;
});
eachById(["delay", "ph-delay"], function (s) {
	s.onchange = function (e) {
		setDelay(parseInt(e.target.value, 10));
	};
});
Array.prototype.forEach.call(document.querySelectorAll(".zoom-opt"), function (b) {
	b.onclick = function () {
		applyScale(parseFloat(b.getAttribute("data-scale")));
	};
});
// zoom locked or disabled for this demo: neutralize the buttons (kept hoverable for the tooltip)
if (cfgLocked("zoom") || !zoomEnabled)
	Array.prototype.forEach.call(document.querySelectorAll(".zoom-opt"), function (b) {
		b.classList.add("locked");
		b.removeAttribute("title");
		b.setAttribute("data-tooltip", "Setting locked for the current demo");
		b.onclick = function (e) {
			if (e) e.preventDefault();
		};
	});

(function () {
	const sd = parseInt(lsGet("lp-delay"), 10);
	if (!embedMode && !isNaN(sd)) setDelay(sd);
	else setDelay(delay);
})();
syncPause();

// ———————————————————————————
// THREE-PANEL SIZING
// info (wInfo) | editor (flex, fills the gap) | preview (wPrev); each panel's minimum width is its label spine (--strip), so a panel can be squeezed down to just its spine but never vanishes
// when the editor reaches that floor and you keep dragging, the handle pushes into the far panel — preview for the left handle, info for the right handle — down to its spine too
// ———————————————————————————
const resizerRight = document.getElementById("resizer-right");
const mainEl = document.getElementById("main");
let infoPanelEl = document.getElementById("info-panel");
let previewPanel = document.getElementById("preview-panel");
const STRIP = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strip")) || 30;
// read from the same custom property the css sizes the panel with, so it is right whatever the page loaded at — measuring the panel would pick up the mobile layout's full-width value
const INFO_W = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--info-w")) || 360;
let wInfo = 0,
	wPrev = 0,
	lastTotal = 0;
// code hidden (info+preview): the preview flex-fills and the right resizer sizes the fixed-width info panel instead of the preview
const hideCodeLayout =
	document.body.classList.contains("cfg-hide-code") && !document.body.classList.contains("cfg-solo");
function panelTotal() {
	return mainEl.clientWidth - 12;
} // minus the two 6px resizers
function applyPanels() {
	infoPanelEl.style.width = `${Math.round(wInfo)}px`;
	previewPanel.style.width = `${Math.round(wPrev)}px`;
}
// keep all three panels >= STRIP (editor = total - wInfo - wPrev)
function clampPanels() {
	const total = panelTotal(),
		budget = total - STRIP; // editor needs >= STRIP
	wInfo = Math.max(STRIP, wInfo);
	wPrev = Math.max(STRIP, wPrev);
	if (wInfo + wPrev > budget) {
		const s = budget / (wInfo + wPrev);
		wInfo = Math.max(STRIP, wInfo * s);
		wPrev = Math.max(STRIP, wPrev * s);
	}
}
// the default layout is a rule, not a pair of remembered widths: the info panel takes its css width (360px), except on narrower windows (< 1080px) where that eats too much room and it takes a third instead, and the editor and preview split what is left — worked out fresh each time so a reset after a window resize gives what a fresh load at this size would
function defaultPanels() {
	const total = panelTotal();
	const info = window.innerWidth < 1080 ? total / 3 : INFO_W;
	return { info: info, prev: (total - info) / 2 };
}
function initPanels() {
	const def = defaultPanels();
	wInfo = def.info;
	wPrev = def.prev;
	clampPanels();
	applyPanels();
	lastTotal = panelTotal();
}

// click a spine label to maximize that panel (the other two collapse to their spines); click the active spine again to restore the previous layout
let maximized = null,
	restoreInfo = 0,
	restorePrev = 0;
const spines = Array.prototype.slice.call(document.querySelectorAll(".panel-spine"));
function updateSpines() {
	spines.forEach(function (s) {
		s.classList.toggle("active", s.dataset.panel === maximized);
	});
}
function setMaxLayout(which) {
	const total = panelTotal();
	if (which === "info") {
		wInfo = total - 2 * STRIP;
		wPrev = STRIP;
	} else if (which === "code") {
		wInfo = STRIP;
		wPrev = STRIP;
	} else {
		wInfo = STRIP;
		wPrev = total - 2 * STRIP;
	}
}
function maximizePanel(which) {
	if (maximized === which) {
		// toggle off -> remembered layout
		wInfo = restoreInfo;
		wPrev = restorePrev;
		maximized = null;
	} else {
		if (maximized === null) {
			restoreInfo = wInfo;
			restorePrev = wPrev;
		}
		setMaxLayout(which);
		maximized = which;
	}
	clampPanels();
	applyPanels();
	updateSpines();
	view.requestMeasure();
}
function clearMax() {
	if (maximized !== null) {
		maximized = null;
		updateSpines();
	}
}
spines.forEach(function (s) {
	s.addEventListener("click", function () {
		maximizePanel(s.dataset.panel);
	});
});
function resetPanels() {
	// restore the original column sizes
	clearMax();
	const def = defaultPanels();
	wInfo = def.info;
	wPrev = def.prev;
	clampPanels();
	applyPanels();
	view.requestMeasure();
	// also restore the console: expand it if collapsed and clear any dragged height
	if (consoleEl) {
		consoleEl.classList.remove("collapsed");
		consoleEl.style.height = ""; // revert to the CSS default height
		savedConsoleH = "";
		if (cResizer) cResizer.style.display = "";
	}
}
document.getElementById("t-reset-layout").onclick = resetPanels;
// ctrl-enter does the same from the keyboard (listed in the shortcuts panel)
window.addEventListener("keydown", function (e) {
	if (e.key !== "Enter" || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
	e.preventDefault();
	resetPanels();
});

// reset settings: restore every editor / preview / view setting to its default
function resetSettings() {
	// view
	setFs(14);
	document.getElementById("fs-range").value = 14;
	if (!embedMode) lsSet("lp-fs", 14);
	wrapping = true;
	wrapBtn.classList.add("on");
	view.dispatch({ effects: wrapComp.reconfigure(WRAP_ON) });
	if (!embedMode) lsSet("lp-wrap", "1");
	highlighting = true;
	hlBtn.classList.add("on");
	if (!embedMode) lsSet("lp-highlight", "1");
	// editor
	autoClosing = true;
	acBtn.classList.add("on");
	view.dispatch({
		effects: [
			autoCloseComp.reconfigure(autoClose(true)),
			langComp.reconfigure(languageExt(files[activeFile].lang, true))
		]
	});
	if (!embedMode) lsSet("lp-autoclose", "1");
	completing = true;
	acmpBtn.classList.add("on");
	view.dispatch({ effects: autoCompleteComp.reconfigure(autocompletion()) });
	if (!embedMode) lsSet("lp-autocomplete", "1");
	if (warnBtn) {
		warningsOn = true;
		warnBtn.classList.add("on");
		if (!embedMode) lsSet("lp-warnings", "1");
	}
	// preview
	setDelay(150);
	setPaused(false);
	applyScale(1);
	// re-apply theme / highlight / indent together, then re-lint + re-run the preview
	view.dispatch({
		effects: [
			themeComp.reconfigure(codeThemeExt()),
			highlightComp.reconfigure(highlightExt()),
			indentComp.reconfigure(indentExt())
		]
	});
	if (warningsOn) runLint();
	else clearLint();
	render(view.state.doc.toString());
}
document.getElementById("t-reset-settings").onclick = resetSettings;

let draggingR = false,
	grabR = 0;
resizerRight.addEventListener("pointerdown", function (e) {
	draggingR = true;
	clearMax();
	document.body.classList.add("draggingR");
	const rr = resizerRight.getBoundingClientRect();
	grabR = e.clientX - (rr.left + rr.width / 2); // keep the grab point under the cursor
	resizerRight.setPointerCapture(e.pointerId);
});
resizerRight.addEventListener("pointermove", function (e) {
	if (!draggingR) return;
	const rect = mainEl.getBoundingClientRect(),
		total = panelTotal();
	if (hideCodeLayout) {
		// divider sizes the info panel; preview flex-fills
		wInfo = Math.max(STRIP, Math.min(total - STRIP, e.clientX - grabR - rect.left));
		applyPanels();
		return;
	}
	wPrev = Math.max(STRIP, Math.min(total - 2 * STRIP, rect.right - (e.clientX - grabR)));
	if (wInfo + wPrev > total - STRIP) wInfo = total - STRIP - wPrev; // code at spine -> push info
	applyPanels();
});
function endDrag(event) {
	if (!draggingR) return;
	draggingR = false;
	document.body.classList.remove("draggingR");
	try {
		resizerRight.releasePointerCapture(event.pointerId);
	} catch (_) {}
	view.requestMeasure();
}
resizerRight.addEventListener("pointerup", endDrag);
resizerRight.addEventListener("pointercancel", endDrag);

// on window resize, scale the columns proportionally instead of letting the editor absorb the whole change — scaling the two side widths by the change in total width keeps all three ratios fixed, since the editor is the remainder and scales by the same factor automatically
let wasMobile = (window.matchMedia && matchMedia("(max-width: 600px)").matches) || false;
window.addEventListener("resize", function () {
	if (embedMode) return; // embed layout is CSS-driven; no JS sizing model
	const isMobile = window.matchMedia && matchMedia("(max-width: 600px)").matches;
	if (isMobile) {
		wasMobile = true;
		return;
	} // mobile is the tabbed CSS layout — leave the px model alone
	const total = panelTotal();
	if (wasMobile) {
		// coming back to desktop: give all three panels an equal third
		wasMobile = false;
		maximized = null;
		updateSpines();
		const def = defaultPanels();
		wInfo = def.info;
		wPrev = def.prev;
		restoreInfo = wInfo;
		restorePrev = wPrev;
		clampPanels();
		applyPanels();
		view.requestMeasure();
		lastTotal = total;
		return;
	}
	if (lastTotal > 0 && total > 0) {
		const scaleFactor = total / lastTotal;
		restoreInfo *= scaleFactor;
		restorePrev *= scaleFactor; // keep the remembered layout proportional too
		if (!maximized) {
			wInfo *= scaleFactor;
			wPrev *= scaleFactor;
		}
	}
	if (maximized) setMaxLayout(maximized); // re-fill the maximized panel for the new width
	clampPanels();
	applyPanels();
	lastTotal = total;
});

// live preview dimensions + zoom — a ResizeObserver catches every cause of a size change
var dimsEl = document.getElementById("preview-dims");
const ro = new ResizeObserver(function () {
	layoutPreview();
});
ro.observe(previewWrap || frame);
applyScale(scale); // initial sizing + light up the matching zoom toggle

// resize the console by dragging its top edge
var cResizer = document.getElementById("console-resizer");
var consoleEl = document.getElementById("console");
const previewEl = document.getElementById("preview-panel");
// console-only (preview disabled behind an overlay, console fills the panel)
if (consoleMode === "only") {
	document.body.classList.add("cfg-console-only");
	var pdOverlay = document.getElementById("preview-disabled");
	if (pdOverlay) pdOverlay.hidden = false;
}
let draggingC = false,
	grabC = 0;
cResizer.addEventListener("pointerdown", function (e) {
	draggingC = true;
	document.body.classList.add("draggingC");
	const cr = cResizer.getBoundingClientRect();
	grabC = e.clientY - (cr.top + cr.height / 2); // keep the grab point under the cursor
	cResizer.setPointerCapture(e.pointerId);
});
cResizer.addEventListener("pointermove", function (e) {
	if (!draggingC) return;
	const rect = previewEl.getBoundingClientRect();
	const h = Math.max(96, Math.min(rect.height * 0.75, rect.bottom - (e.clientY - grabC))); // keep head+input visible; <= 75% of preview
	consoleEl.style.height = `${h}px`;
});
function endV(event) {
	if (!draggingC) return;
	draggingC = false;
	document.body.classList.remove("draggingC");
	try {
		cResizer.releasePointerCapture(event.pointerId);
	} catch (_) {}
}
cResizer.addEventListener("pointerup", endV);
cResizer.addEventListener("pointercancel", endV);

// collapse / expand the console by clicking its head (the clear button, which lives in the head, is excluded and hidden while collapsed)
const consoleHead = document.getElementById("console-head");
var savedConsoleH = "";
consoleHead.addEventListener("click", function (e) {
	if (e.target.closest("#console-clear")) return; // clearing isn't collapsing
	if (document.body.classList.contains("emb-iframe-hidden")) return; // console-only embed: nothing to collapse into
	if (document.body.classList.contains("cfg-console-only")) return; // console-only demo: keep it open
	const collapsing = !consoleEl.classList.contains("collapsed");
	if (collapsing) {
		savedConsoleH = consoleEl.style.height;
		consoleEl.style.height = "";
	} else {
		consoleEl.style.height = savedConsoleH || "";
	}
	consoleEl.classList.toggle("collapsed", collapsing);
	cResizer.style.display = collapsing ? "none" : "";
});

// ———————————————————————————
// DEMO LOADING
// the demo's code, info and notes are all baked into this page by build.mjs — nothing is fetched and there is no json bundle: the code lives in the #demo-code textarea (read as `starter`), the info-panel html is baked into #info-body, and any line annotations are in the #demo-notes json script
// navigation (topbar crumbs, prev/next, the nav popup) is wired by chrome.js, independently of this module
// ———————————————————————————
let infoBody = document.getElementById("info-body");
const resizerLeft = document.getElementById("resizer-left");
var notesBtn = document.getElementById("ed-notes");
var notesDelBtn = document.getElementById("ed-notes-del"); // blank editor only
var undoBtn = document.getElementById("t-undo");
var redoBtn = document.getElementById("t-redo");
const tbDemoName = document.querySelector("#tb-demo .tb-name");
const shellEl = document.getElementById("shell");
const standaloneMode = !!(shellEl && shellEl.classList.contains("standalone"));
const standaloneFileName = "";
var fileTabsEl = document.getElementById("file-tabs");
const codeWrap = document.getElementById("code-wrap"); // holds the CodeMirror view; hidden for media files
// media files show a preview pane instead of the editor (see parts/media.js)
var mediaCtl = createMediaView(codeWrap, function () {
	if (view)
		requestAnimationFrame(function () {
			try {
				view.requestMeasure();
			} catch (e) {}
		});
});
function showMediaView(f) {
	mediaCtl.showMediaView(f);
}
function hideMediaView() {
	mediaCtl.hideMediaView();
}
let tabDrag = null; // active tab-reorder pointer drag state, or null
let suppressTabClick = false; // ignore the click that ends a reorder drag
var setMobileTab = null; // set by the mobile tab-switcher; switches the visible panel on mobile
// a new pointer gesture on the tab strip clears the reorder-click guard, so only the
// click emitted by the drag itself is swallowed — a later tap always switches tabs.
if (fileTabsEl)
	fileTabsEl.addEventListener(
		"pointerdown",
		function () {
			suppressTabClick = false;
		},
		true
	);
var originals = {}; // file name -> original content (for the unsaved-edits check)
var allNotes = []; // every annotation across files, each carrying a `file`
var dirty = false;

// info-panel HTML is baked in; this only writes the occasional dev/error notice
function setInfoMessage(text) {
	infoBody.innerHTML = `<p>${String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
}

function langForName(name) {
	const ext = (String(name).split(".").pop() || "").toLowerCase();
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
			"m4v"
		].indexOf(ext) >= 0
	)
		return "media";
	return "html";
}
function filesDirty() {
	return files.some(function (f) {
		return f.content !== originals[f.name];
	});
}
function setDirty(isDirty) {
	dirty = isDirty;
}

// annotations that belong to a file (default file = the entry); seeded for the field
function annotationsFor(name) {
	return allNotes.filter(function (a) {
		return a && (a.file || demoEntry) === name;
	});
}
function seedNotes(name) {
	// notes open by default from the embed token (embeds) or the demo config (normal pages)
	const expandAll = notesEnabled && (embedMode ? embed.notesExp : !!demoCfg.notesExpanded);
	const list = notesEnabled ? annotationsFor(name) : [];
	return list.map(function (a, i) {
		return { id: i, text: a.text, line: a.line, open: expandAll ? true : !!a.open };
	});
}

// the live setting values as reconfigure effects, re-applied to the active state on each tab switch so every file reflects the latest wrap/font/etc.
function settingEffects(lang) {
	return [
		themeComp.reconfigure(codeThemeExt()),
		fontComp.reconfigure(fontTheme(fontSize)),
		indentComp.reconfigure(indentExt()),
		langComp.reconfigure(languageExt(lang, autoClosing)),
		autoCloseComp.reconfigure(autoClose(autoClosing)),
		autoCompleteComp.reconfigure(completing ? autocompletion() : []),
		highlightComp.reconfigure(highlightExt()),
		wrapComp.reconfigure(wrapping ? WRAP_ON : [])
	];
}

// a fresh EditorState for a file: its own document, undo history and seeded notes
function makeState(file) {
	const seeded = seedNotes(file.name);
	const st = EditorState.create({ doc: file.content, extensions: editorExtensions(file.lang) });
	return st.update({
		effects: [
			setAnnotations.of(seeded),
			// the blank editor always keeps the gutter, since every line can take a note
			annoGutterComp.reconfigure(standaloneMode || seeded.length ? annoGutter : [])
		]
	}).state;
}

// make file `idx` active: swap in its state (created lazily) and re-sync settings, with `switching` keeping the state swap from re-running the preview or marking dirty
function activateFile(idx) {
	if (!files[idx]) return;
	const f = files[idx];
	if (f.lang === "media") {
		// media files show a preview, not the code editor
		showMediaView(f);
		runLint(); // clears any leftover diagnostics
		setNotesBtns();
		setUndoRedoBtns();
		return;
	}
	hideMediaView();
	if (!states[idx]) states[idx] = makeState(files[idx]);
	switching = true;
	view.setState(states[idx]);
	view.dispatch({ effects: settingEffects(f.lang) });
	switching = false;
	setNotesBtns();
	setUndoRedoBtns();
	updateCursorPos(view.state);
	if (syncScrollbars) requestAnimationFrame(syncScrollbars);
}
// "Ln #, Col #" (and, when a selection is active, "(# Lns, # Chars)")
var cursorPosEl = document.getElementById("cursor-pos");
function updateCursorPos(state) {
	if (!cursorPosEl || !state) return;
	const sel = state.selection.main,
		headLine = state.doc.lineAt(sel.head);
	// column counts tab stops, not raw characters, so a leading tab reads as Col 5 (not Col 2)
	let tabSize = state.tabSize || 4,
		col = 0,
		upto = headLine.text.slice(0, sel.head - headLine.from);
	for (let ci = 0; ci < upto.length; ci++) col += upto.charCodeAt(ci) === 9 ? tabSize - (col % tabSize) : 1;
	let txt = `Ln ${headLine.number}, Col ${col + 1}`;
	if (!sel.empty) {
		const chars = sel.to - sel.from;
		const lines = state.doc.lineAt(sel.to).number - state.doc.lineAt(sel.from).number + 1;
		txt += `, (${lines} Ln${lines === 1 ? "" : "s"}, ${chars} Char${chars === 1 ? "" : "s"})`;
	}
	cursorPosEl.textContent = txt;
}
updateCursorPos(view.state); // initial readout

// media preview pane (image / audio / video / font specimen)

var tabScrollRO = null;
// simulated horizontal scrollbar for the tab strip (the native bar is hidden) — the thumb is draggable by mouse and touch, clicking the track jumps, and it hides when there is no overflow
function wireTabScrollbar(scroll, bar, thumb) {
	function update() {
		const sw = scroll.scrollWidth,
			cw = scroll.clientWidth;
		if (sw <= cw + 1) {
			bar.hidden = true;
			return;
		}
		bar.hidden = false;
		const track = bar.clientWidth,
			tw = Math.max(24, (cw / sw) * track);
		thumb.style.width = `${tw}px`;
		const maxScroll = sw - cw,
			maxThumb = track - tw;
		thumb.style.transform = `translateX(${maxScroll ? (scroll.scrollLeft / maxScroll) * maxThumb : 0}px)`;
	}
	scroll.addEventListener("scroll", update);
	var dragging = false,
		startX = 0,
		startScroll = 0;
	thumb.addEventListener("pointerdown", function (e) {
		dragging = true;
		startX = e.clientX;
		startScroll = scroll.scrollLeft;
		try {
			thumb.setPointerCapture(e.pointerId);
		} catch (_) {}
		e.preventDefault();
		e.stopPropagation();
	});
	thumb.addEventListener("pointermove", function (e) {
		if (!dragging) return;
		const sw = scroll.scrollWidth,
			cw = scroll.clientWidth,
			tw = thumb.offsetWidth;
		const maxScroll = sw - cw,
			maxThumb = bar.clientWidth - tw,
			dx = e.clientX - startX;
		scroll.scrollLeft = startScroll + (maxThumb ? (dx / maxThumb) * maxScroll : 0);
	});
	function end(e) {
		dragging = false;
		try {
			thumb.releasePointerCapture(e.pointerId);
		} catch (_) {}
	}
	thumb.addEventListener("pointerup", end);
	thumb.addEventListener("pointercancel", end);
	bar.addEventListener("pointerdown", function (e) {
		if (e.target === thumb) return;
		const tw = thumb.offsetWidth,
			maxThumb = bar.clientWidth - tw,
			maxScroll = scroll.scrollWidth - scroll.clientWidth;
		const pos = e.clientX - bar.getBoundingClientRect().left - tw / 2;
		scroll.scrollLeft = maxThumb ? (Math.max(0, Math.min(maxThumb, pos)) / maxThumb) * maxScroll : 0;
	});
	requestAnimationFrame(update);
	if (tabScrollRO) tabScrollRO.disconnect();
	try {
		tabScrollRO = new ResizeObserver(update);
		tabScrollRO.observe(scroll);
	} catch (_) {}
}

function renderTabs() {
	if (!fileTabsEl) return;
	const show = demoIsMulti || files.length > 1 || allowAddFiles;
	fileTabsEl.hidden = !show;
	fileTabsEl.classList.toggle("reorderable", allowAddFiles); // enables touch-drag (touch-action)
	const oldScroll = fileTabsEl.querySelector(".ft-scroll");
	const prevScrollLeft = oldScroll ? oldScroll.scrollLeft : 0; // keep scroll position across rebuilds
	fileTabsEl.textContent = "";
	if (!show) return;

	let row = document.createElement("div");
	row.className = "ft-row";
	let scroll = document.createElement("div");
	scroll.className = "ft-scroll";
	row.appendChild(scroll);
	files.forEach(function (f, i) {
		const isEntry = f.name === demoEntry;
		let tab = document.createElement("button");
		tab.type = "button";
		tab.className = `file-tab${i === activeFile ? " active" : ""}${isEntry ? " is-entry" : ""}`;
		let icon = document.createElement("span");
		icon.className = "file-tab-icon";
		icon.innerHTML = fileIconSvg(f, isEntry);
		tab.appendChild(icon);
		let name = document.createElement("span");
		name.className = "file-tab-name";
		name.textContent = f.name;
		tab.appendChild(name);
		tab.onclick = function () {
			switchFile(i);
		};
		if (allowAddFiles && f.name !== demoEntry) {
			// the main entry file can't be renamed
			let pen = document.createElement("span");
			pen.className = "file-tab-edit";
			pen.innerHTML =
				"<svg viewBox='0 0 100 100'><path d='M59.07,12.65L16.64,55.08v28.27h28.29l42.43-42.42-28.29-28.28ZM40.79,73.36l-14.15-14.14L59.07,26.78l14.14,14.15-32.42,32.43Z'/></svg>";
			pen.title = "Rename file";
			pen.onclick = function (e) {
				e.stopPropagation();
				openFileDialog("rename", i);
			};
			tab.appendChild(pen);
		}
		if (allowAddFiles && f.name !== demoEntry) {
			let del = document.createElement("span");
			del.className = "file-tab-del";
			del.innerHTML =
				'<svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg>';
			del.title = "Delete file";
			del.onclick = function (e) {
				e.stopPropagation();
				deleteFile(i);
			};
			tab.appendChild(del);
		}
		// reorder by dragging (mouse + touch); the leftmost tab (the entry) stays planted
		if (allowAddFiles && i !== 0) wireTabDrag(tab, i);
		scroll.appendChild(tab);
	});
	if (allowAddFiles) {
		// add + upload stay pinned to the right, outside the scroll strip
		let actions = document.createElement("div");
		actions.className = "ft-actions";
		let add = document.createElement("button");
		add.type = "button";
		add.className = "file-tab file-tab-add";
		add.innerHTML =
			'<svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg>';
		add.title = "Add a file";
		add.onclick = addFile;
		actions.appendChild(add);
		let up = document.createElement("button");
		up.type = "button";
		up.className = "file-tab file-tab-upload";
		up.innerHTML =
			'<svg viewBox="0 0 100 100"><polygon points="27.5 32.5 50 10 72.5 32.5 65.43 39.57 55 29.14 55 70 45 70 45 29.14 34.57 39.57 27.5 32.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>';
		up.title = "Upload files, a folder, or media";
		up.onclick = function (e) {
			e.stopPropagation();
			openUploadMenu(up);
		};
		actions.appendChild(up);
		row.appendChild(actions);
	}
	fileTabsEl.appendChild(row);
	scroll.scrollLeft = prevScrollLeft; // restore (clicking a tab no longer jumps to the left)

	let bar = document.createElement("div");
	bar.className = "ft-scrollbar";
	bar.hidden = true;
	let thumb = document.createElement("div");
	thumb.className = "ft-thumb";
	bar.appendChild(thumb);
	fileTabsEl.appendChild(bar);
	wireTabScrollbar(scroll, bar, thumb);
	renderInfoFiles(); // keep the info panel's "Files in this demo" tree in sync
}

// ———————————————————————————
// FILES IN THIS DEMO
// the info panel's dynamic file tree, rebuilt from the live files[] whenever tabs change so add, remove and reorder are reflected
// loose files keep tab order and folders group at the end alphabetically; file names are clickable (they open in the code panel) and the previewed html file gets a "Now Previewing" badge
// ———————————————————————————
function escHtml(s) {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function infoFileNodes(names) {
	const root = { children: [], map: {} };
	names.forEach(function (path) {
		let node = root,
			acc = "";
		String(path)
			.split("/")
			.forEach(function (seg) {
				acc = acc ? `${acc}/${seg}` : seg;
				let child = node.map[seg];
				if (!child) {
					child = { name: seg, path: acc, children: [], map: {}, order: node.children.length };
					node.map[seg] = child;
					node.children.push(child);
				}
				node = child;
			});
	});
	(function sortRec(nodes) {
		nodes.sort(function (a, b) {
			const af = a.children.length > 0,
				bf = b.children.length > 0;
			if (af !== bf) return af ? 1 : -1; // files before folders
			if (af && bf) return a.name.localeCompare(b.name); // folders: alphabetical
			return a.order - b.order; // files: keep tab order
		});
		nodes.forEach(function (n) {
			sortRec(n.children);
		});
	})(root.children);
	return root.children;
}
var lastFilesSig = null;
function markActiveInfoFile(pre) {
	pre = pre || document.getElementById("info-filetree");
	if (!pre) return;
	const active = files[activeFile] ? files[activeFile].name : null;
	Array.prototype.forEach.call(pre.querySelectorAll(".ftree-file"), function (b) {
		b.classList.toggle("active", b.getAttribute("data-file") === active);
	});
}
function renderInfoFiles() {
	let pre = document.getElementById("info-filetree");
	if (!pre) return;
	const sig = files
		.map(function (f) {
			return f.name;
		})
		.join("\n");
	if (sig === lastFilesSig) {
		markActiveInfoFile(pre);
		return;
	} // set unchanged: just refresh the active marker
	lastFilesSig = sig;
	const lines = [];
	(function walk(children, prefix) {
		children.forEach(function (n, idx) {
			const last = idx === children.length - 1;
			const isFolder = n.children.length > 0;
			const branch = escHtml(prefix + (last ? "└─ " : "├─ "));
			if (isFolder) {
				lines.push(`${branch}<span class="ftree-folder">${escHtml(n.name)}/</span>`);
				walk(n.children, prefix + (last ? "   " : "│  "));
			} else {
				lines.push(
					`${branch}<button type="button" class="ftree-file" data-file="${escHtml(n.path).replace(/"/g, "&quot;")}">${escHtml(n.name)}</button>`
				);
			}
		});
	})(
		infoFileNodes(
			files.map(function (f) {
				return f.name;
			})
		),
		""
	);
	pre.innerHTML = lines.join("\n");
	markActiveInfoFile(pre);
	if (!pre.dataset.wired) {
		// one delegated click handler survives re-renders
		pre.dataset.wired = "1";
		pre.addEventListener("click", function (e) {
			const b = e.target && e.target.closest && e.target.closest(".ftree-file");
			if (!b) return;
			const idx = files.findIndex(function (f) {
				return f.name === b.getAttribute("data-file");
			});
			if (idx >= 0) {
				switchFile(idx);
				if (setMobileTab) setMobileTab("code"); // on mobile, reveal the code panel
			}
		});
	}
}
// bring the active tab into view in the (horizontally scrolling) tab strip
function scrollActiveTabIntoView() {
	let scroll = fileTabsEl && fileTabsEl.querySelector(".ft-scroll");
	const active = scroll && scroll.querySelector(".file-tab.active");
	if (!scroll || !active) return;
	const sr = scroll.getBoundingClientRect(),
		ar = active.getBoundingClientRect();
	if (ar.left < sr.left) scroll.scrollLeft -= sr.left - ar.left + 8;
	else if (ar.right > sr.right) scroll.scrollLeft += ar.right - sr.right + 8;
}

// FLIP: record each tab's screen x before a reorder, then animate from old to new.
function captureTabRects() {
	let m = {};
	fileTabEls().forEach(function (t) {
		let n = t.querySelector(".file-tab-name");
		if (n) m[n.textContent] = t.getBoundingClientRect().left;
	});
	return m;
}
function flipTabs(before) {
	const moved = [];
	fileTabEls().forEach(function (t) {
		const n = t.querySelector(".file-tab-name");
		if (!n) return;
		const old = before[n.textContent];
		if (old == null) return;
		const delta = old - t.getBoundingClientRect().left;
		if (!delta) return;
		t.style.transition = "none";
		t.style.transform = `translateX(${delta}px)`;
		moved.push(t);
	});
	if (!moved.length) return;
	requestAnimationFrame(function () {
		moved.forEach(function (t) {
			t.style.transition = "transform .18s ease";
			t.style.transform = "";
			t.addEventListener("transitionend", function h() {
				t.style.transition = "";
				t.removeEventListener("transitionend", h);
			});
		});
	});
}

// remember the active file's latest state + text (call before changing activeFile)
function stashActive() {
	if (files[activeFile] && files[activeFile].lang === "media") return; // media has no editor state
	states[activeFile] = view.state;
	if (files[activeFile]) files[activeFile].content = view.state.doc.toString();
}

function switchFile(idx) {
	if (suppressTabClick) {
		suppressTabClick = false;
		return;
	} // this click ended a reorder drag
	if (idx < 0 || idx >= files.length) return;
	if (idx !== activeFile) {
		stashActive();
		activeFile = idx;
		activateFile(idx);
	}
	// clicking an HTML tab also loads that page into the preview (a way back to any page)
	const f = files[idx];
	if (f && f.lang === "html" && f.name !== previewEntry) {
		previewEntry = f.name;
		render();
	}
	renderTabs();
	requestAnimationFrame(scrollActiveTabIntoView); // reveal the tab if it's off-screen in the strip
	runLint();
}

function addFile() {
	openFileDialog("new");
}

// create a brand-new empty file and make it active; a new HTML page is previewed at once
function createFile(name) {
	stashActive();
	const lang = langForName(name);
	files.push({ name: name, lang: lang, content: "" });
	states.push(null);
	activeFile = files.length - 1;
	activateFile(activeFile);
	if (lang === "html") previewEntry = name; // instantly show the new page
	renderTabs();
	runLint();
	render();
	setDirty(filesDirty());
	requestAnimationFrame(scrollActiveTabIntoView); // reveal the freshly-added tab in the strip
}

// rename file `idx`, moving its name-keyed bookkeeping (originals, notes, entry refs); returns false and leaves an error in the dialog if the new name collides
function renameFile(idx, newName) {
	let f = files[idx];
	if (!f) return;
	newName = String(newName).trim().replace(/^\/+/, "");
	if (!newName || newName === f.name) return true;
	if (
		files.some(function (x, j) {
			return j !== idx && x.name === newName;
		})
	) {
		fileDlgError(`A file called “${newName}” already exists.`);
		return false;
	}
	const old = f.name;
	stashActive(); // capture live edits before rebuilding state
	if (Object.prototype.hasOwnProperty.call(originals, old)) {
		originals[newName] = originals[old];
		delete originals[old];
	}
	allNotes.forEach(function (a) {
		if (a && (a.file || demoEntry) === old) a.file = newName;
	});
	if (demoEntry === old) demoEntry = newName;
	if (previewEntry === old) previewEntry = newName;
	f.name = newName;
	f.lang = langForName(newName);
	states[idx] = null; // rebuild so the language extension matches the new ext
	if (idx === activeFile) activateFile(idx);
	renderTabs();
	runLint();
	render();
	setDirty(filesDirty());
	return true;
}

// move a tab (file `from`) to position `to` — index 0 (the entry) is planted, so neither the entry moves nor anything lands before it
function moveFile(from, to, before) {
	if (from < 1 || from === to) return;
	to = Math.max(1, Math.min(files.length - 1, to));
	if (from === to) return;
	stashActive();
	before = before || captureTabRects(); // reshuffle animation baseline
	const activeF = files[activeFile];
	const f = files.splice(from, 1)[0],
		s = states.splice(from, 1)[0];
	files.splice(to, 0, f);
	states.splice(to, 0, s);
	activeFile = files.indexOf(activeF);
	renderTabs();
	flipTabs(before);
}
function clearDropMarks() {
	Array.prototype.forEach.call(fileTabsEl.querySelectorAll(".drop-target"), function (t) {
		t.classList.remove("drop-target");
	});
}
function fileTabEls() {
	return Array.prototype.slice.call(
		fileTabsEl.querySelectorAll(".file-tab:not(.file-tab-add):not(.file-tab-upload)")
	);
}
// target slot for the pointer, computed from a static snapshot of the tabs' original positions (tabDrag.rects) rather than elementFromPoint on the live dom, which jitters as tabs animate; returns an index in [1 .. len-1], since index 0 (entry) is planted
function dragTargetIndex(x) {
	let rects = tabDrag.rects,
		from = tabDrag.from,
		to = from,
		i;
	if (x < rects[from].left + rects[from].width / 2) {
		// moving left
		for (i = from - 1; i >= 1; i--) {
			if (x < rects[i].left + rects[i].width / 2) to = i;
			else break;
		}
	} else {
		// moving right
		for (i = from + 1; i < rects.length; i++) {
			if (x > rects[i].left + rects[i].width / 2) to = i;
			else break;
		}
	}
	return Math.max(1, to);
}
// pointer-based tab reordering: works for both mouse and touch (html5 drag doesn't fire on touch), with a small movement threshold distinguishing a reorder from a tap so tapping a tab still switches to it; the leftmost tab (entry) is never a drop target
function wireTabDrag(tab, i) {
	tab.addEventListener("pointerdown", function (e) {
		if (e.button != null && e.button > 0) return; // ignore right/middle
		if (e.target.closest && e.target.closest(".file-tab-del, .file-tab-edit")) return;
		if (i === 0) return; // entry planted
		tabDrag = { id: e.pointerId, from: i, startX: e.clientX, active: false, el: tab };
		document.addEventListener("pointermove", onTabPointerMove, true);
		document.addEventListener("pointerup", onTabPointerUp, true);
		document.addEventListener("pointercancel", onTabPointerUp, true);
	});
}
// while dragging, shift the other tabs to open a gap where the dragged tab would land — the gap width is the dragged tab's width, so the in-between tabs stay contiguous
function applyDragShift(to) {
	const from = tabDrag.from,
		W = tabDrag.width;
	tabDrag.tabs.forEach(function (t, i) {
		if (i === from) return; // the dragged tab follows the pointer
		const shift = to > from && i > from && i <= to ? -W : to < from && i >= to && i < from ? W : 0;
		t.style.transform = shift ? `translateX(${shift}px)` : "";
	});
}
function onTabPointerMove(e) {
	if (!tabDrag || e.pointerId !== tabDrag.id) return;
	if (!tabDrag.active) {
		if (Math.abs(e.clientX - tabDrag.startX) < 6) return; // below threshold: still a tap
		tabDrag.active = true;
		tabDrag.tabs = fileTabEls(); // snapshot of the order
		// static geometry, stored as plain mutable objects so edge auto-scroll can shift them
		tabDrag.rects = tabDrag.tabs.map(function (t) {
			const r = t.getBoundingClientRect();
			return { left: r.left, right: r.right, width: r.width };
		});
		tabDrag.scroll = fileTabsEl.querySelector(".ft-scroll"); // the horizontally-scrollable strip
		// the slot a tab occupies is its width PLUS the flex gap between tabs; shifting by
		// only the width leaves a gap-sized (1px) discrepancy, so include the gap.
		const gap = tabDrag.rects.length > 1 ? Math.max(0, tabDrag.rects[1].left - tabDrag.rects[0].right) : 0;
		tabDrag.width = (tabDrag.rects[tabDrag.from] ? tabDrag.rects[tabDrag.from].width : 0) + gap;
		tabDrag.tabs.forEach(function (t, i) {
			if (i !== tabDrag.from) t.style.transition = "transform .15s ease";
		});
		tabDrag.el.style.transition = "none";
		tabDrag.el.classList.add("dragging");
		try {
			tabDrag.el.setPointerCapture(tabDrag.id);
		} catch (_) {}
	}
	e.preventDefault();
	tabDrag.lastX = e.clientX;
	setDraggedTransform(e.clientX);
	applyDragShift(dragTargetIndex(e.clientX));
	maybeEdgeScroll();
}
// position the dragged tab under the cursor, clamped to stay inside the visible strip so it can't fly off past the last tab when the pointer runs beyond the strip's edge
function setDraggedTransform(x) {
	if (!tabDrag || !tabDrag.rects) return;
	const layoutLeft = tabDrag.rects[tabDrag.from].left,
		w = tabDrag.rects[tabDrag.from].width;
	const cr = tabDrag.scroll ? tabDrag.scroll.getBoundingClientRect() : null;
	let vpLeft = layoutLeft + (x - tabDrag.startX);
	if (cr) vpLeft = Math.max(cr.left, Math.min(cr.right - w, vpLeft));
	tabDrag.el.style.transform = `translateX(${vpLeft - layoutLeft}px)`;
}
// while reordering, if the pointer nears either edge of the tab strip, scroll it so more tabs come into view — rects and the dragged tab's anchor are shifted by the scroll amount so the static-geometry drop targeting stays correct
function edgeScrollStep() {
	if (!tabDrag || !tabDrag.active || !tabDrag.scroll) {
		if (tabDrag) tabDrag.scrollRAF = 0;
		return;
	}
	let sc = tabDrag.scroll,
		r = sc.getBoundingClientRect(),
		EDGE = 40,
		x = tabDrag.lastX,
		dir = 0;
	if (x < r.left + EDGE) dir = -1;
	else if (x > r.right - EDGE) dir = 1;
	// only keep scrolling while a real tab is still clipped on that side; this ignores any trailing add/upload buttons, so you can't scroll into empty space past the last tab
	const rects = tabDrag.rects;
	const moreRight = rects.length && rects[rects.length - 1].right > r.right - 1;
	const moreLeft = rects.length && rects[0].left < r.left + 1;
	if (!dir || (dir < 0 && !moreLeft) || (dir > 0 && !moreRight)) {
		tabDrag.scrollRAF = 0;
		return;
	}
	const before = sc.scrollLeft,
		maxScroll = sc.scrollWidth - sc.clientWidth;
	sc.scrollLeft = Math.max(0, Math.min(maxScroll, before + dir * 12));
	const moved = sc.scrollLeft - before;
	if (!moved) {
		tabDrag.scrollRAF = 0;
		return;
	} // hit the scroll limit
	tabDrag.startX -= moved; // keep the dragged tab under the cursor
	rects.forEach(function (rc) {
		rc.left -= moved;
		rc.right -= moved;
	});
	setDraggedTransform(tabDrag.lastX);
	applyDragShift(dragTargetIndex(tabDrag.lastX));
	tabDrag.scrollRAF = requestAnimationFrame(edgeScrollStep);
}
function maybeEdgeScroll() {
	if (!tabDrag || tabDrag.scrollRAF || !tabDrag.scroll) return;
	const r = tabDrag.scroll.getBoundingClientRect(),
		EDGE = 40,
		x = tabDrag.lastX;
	if (x < r.left + EDGE || x > r.right - EDGE) tabDrag.scrollRAF = requestAnimationFrame(edgeScrollStep);
}
function stopEdgeScroll() {
	if (tabDrag && tabDrag.scrollRAF) {
		cancelAnimationFrame(tabDrag.scrollRAF);
		tabDrag.scrollRAF = 0;
	}
}
function from2(d) {
	return d.from;
}
function onTabPointerUp(e) {
	if (!tabDrag || e.pointerId !== tabDrag.id) return;
	stopEdgeScroll();
	document.removeEventListener("pointermove", onTabPointerMove, true);
	document.removeEventListener("pointerup", onTabPointerUp, true);
	document.removeEventListener("pointercancel", onTabPointerUp, true);
	const wasActive = tabDrag.active,
		from = tabDrag.from;
	if (wasActive) {
		const to = dragTargetIndex(e.clientX);
		suppressTabClick = true; // swallow the click this drag emits; the next pointerdown clears it
		const before = captureTabRects(); // animate from the current (shifted) layout
		if (to !== from) moveFile(from, to, before);
		else {
			renderTabs();
			flipTabs(before);
		} // no move: slide everything back
	}
	tabDrag = null;
}

// ———————————————————————————
// NEW-FILE / RENAME DIALOG
// reuses the .dlg-* styling; built lazily
// ———————————————————————————
var fileDlg = null,
	fileDlgMode = "new",
	fileDlgIdx = -1,
	fileDlgExt = ".html",
	fileDlgLocked = null;
function buildFileDialog() {
	let overlay = document.createElement("div");
	overlay.id = "file-overlay";
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="File">
		<div class="dlg-head"><span id="file-dlg-title">New file</span><button type="button" id="file-dlg-x" title="Close"><svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg></button></div>
		<div class="dlg-body">
		<div class="dlg-field"><span class="dlg-label">Name</span><div>
		<input type="text" id="file-dlg-name" class="mf-text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your file name here!">
		<div class="mf-hint">Write <code>/</code> to put a file in a folder. For example, <code>pages/contact</code> makes <code>contact.html</code> inside a <code>pages</code> folder.</div>
		</div></div>
		<div class="dlg-field" id="file-dlg-extrow"><span class="dlg-label">Type</span><div class="mf-seg" id="file-dlg-seg">
		<button type="button" class="mf-seg-btn" data-ext=".html">.html</button>
		<button type="button" class="mf-seg-btn" data-ext=".css">.css</button>
		<button type="button" class="mf-seg-btn" data-ext=".js">.js</button>
		<button type="button" class="mf-seg-btn" data-ext=".json">.json</button>
		</div></div>
		<div class="dlg-field"><span class="dlg-label" id="file-dlg-final-lbl">Output</span><div class="mf-final" id="file-dlg-final"></div></div>
		<div class="mf-error" id="file-dlg-err" hidden></div>
		</div>
		<div class="dlg-actions"><button type="button" class="ctrl" id="file-dlg-cancel"><svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg><span>Cancel</span></button><button type="button" class="ctrl" id="file-dlg-ok"><svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg><span>Create file</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	fileDlg = overlay;
	const nameEl = overlay.querySelector("#file-dlg-name");
	Array.prototype.forEach.call(overlay.querySelectorAll(".mf-seg-btn"), function (b) {
		b.onclick = function () {
			setFileExt(b.getAttribute("data-ext"));
			nameEl.focus();
		};
	});
	nameEl.addEventListener("input", updateFileFinal);
	nameEl.addEventListener("keydown", function (e) {
		if (e.key === "Enter") {
			e.preventDefault();
			fileDlgSubmit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			closeFileDialog();
		}
	});
	overlay.querySelector("#file-dlg-x").onclick = closeFileDialog;
	overlay.querySelector("#file-dlg-cancel").onclick = closeFileDialog;
	overlay.querySelector("#file-dlg-ok").onclick = fileDlgSubmit;
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeFileDialog();
	});
}
function setFileExt(ext) {
	fileDlgExt = ext;
	Array.prototype.forEach.call(fileDlg.querySelectorAll(".mf-seg-btn"), function (b) {
		b.classList.toggle("active", b.getAttribute("data-ext") === ext);
	});
	updateFileFinal();
}
function fileDlgBase() {
	return fileDlg.querySelector("#file-dlg-name").value.trim().replace(/^\/+/, "");
}
function hasTypedExt(base) {
	return /\.[A-Za-z0-9]+$/.test(base.split("/").pop() || "");
}
var CREATABLE_EXTS = [".html", ".css", ".js", ".json"]; // the only extensions files can be created/renamed with
// returns the typed extension only if it's one we allow (lowercased); otherwise null
function typedAllowedExt(base) {
	const m = (base.split("/").pop() || "").match(/\.[A-Za-z0-9]+$/);
	return m && CREATABLE_EXTS.indexOf(m[0].toLowerCase()) >= 0 ? m[0].toLowerCase() : null;
}
function fileDlgFinalName() {
	const base = fileDlgBase();
	if (!base) return "";
	if (fileDlgLocked) return base.replace(/\.[A-Za-z0-9]+$/, "") + fileDlgLocked; // media: extension is fixed
	const typed = typedAllowedExt(base);
	if (typed) return base.replace(/\.[A-Za-z0-9]+$/, typed); // a valid typed extension wins (normalised to lowercase)
	return base + fileDlgExt; // anything else (e.g. ".hmtl", ".demo", or none) -> append the chosen type
}
function updateFileFinal() {
	let base = fileDlgBase(),
		extrow = fileDlg.querySelector("#file-dlg-extrow");
	if (fileDlgLocked) {
		extrow.hidden = true;
	} // media keeps its type
	else {
		extrow.hidden = false;
		extrow.style.opacity = typedAllowedExt(base) ? ".25" : "";
	} // only a valid typed ext overrides the picker
	fileDlg.querySelector("#file-dlg-final").textContent = fileDlgFinalName();
	fileDlgError("");
}
function fileDlgError(msg) {
	let e = fileDlg && fileDlg.querySelector("#file-dlg-err");
	if (!e) return;
	e.textContent = msg || "";
	e.hidden = !msg;
}
function openFileDialog(mode, idx) {
	if (!fileDlg) buildFileDialog();
	fileDlgMode = mode;
	fileDlgIdx = idx == null ? -1 : idx;
	let nameEl = fileDlg.querySelector("#file-dlg-name");
	fileDlg.querySelector("#file-dlg-title").innerHTML =
		mode === "rename"
			? '<svg viewBox="0 0 100 100"><path d="M59.07,12.65L16.64,55.08v28.27h28.29l42.43-42.42-28.29-28.28ZM40.79,73.36l-14.15-14.14L59.07,26.78l14.14,14.15-32.42,32.43Z"/></svg><span>Rename file</span>'
			: '<svg viewBox="0 0 100 100"><path d="m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z"/></svg><span>New file</span>';
	fileDlg.querySelector("#file-dlg-ok").innerHTML =
		mode === "rename"
			? '<svg viewBox="0 0 100 100"><path d="M59.07,12.65L16.64,55.08v28.27h28.29l42.43-42.42-28.29-28.28ZM40.79,73.36l-14.15-14.14L59.07,26.78l14.14,14.15-32.42,32.43Z"/></svg><span>Rename</span>'
			: '<svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg><span>Create file</span>';
	if (mode === "rename") {
		const nm = (files[idx] && files[idx].name) || "";
		const isMedia = !!(files[idx] && files[idx].lang === "media");
		const m = nm.match(/^(.*)(\.[A-Za-z0-9]+)$/);
		if (isMedia && m) {
			fileDlgLocked = m[2].toLowerCase();
			nameEl.value = m[1];
		} // media: lock the extension
		else if (m && CREATABLE_EXTS.indexOf(m[2].toLowerCase()) >= 0) {
			fileDlgLocked = null;
			nameEl.value = m[1];
			setFileExt(m[2].toLowerCase());
		} else {
			fileDlgLocked = null;
			nameEl.value = nm;
			setFileExt(".html");
		}
	} else {
		fileDlgLocked = null;
		nameEl.value = "";
		setFileExt(".html");
	}
	fileDlgError("");
	updateFileFinal();
	fileDlg.hidden = false;
	setTimeout(function () {
		nameEl.focus();
		nameEl.select();
	}, 0);
}
function closeFileDialog() {
	if (fileDlg) fileDlg.hidden = true;
}
// reject illegal characters and path-only names (e.g. "folder/.html" with no real filename)
function fileNameError(name) {
	if (!name) return "Enter a file name.";
	if (/[\\:*?"<>|\x00-\x1f]/.test(name)) return "That name has characters that aren’t allowed.";
	const segs = name.split("/");
	for (let i = 0; i < segs.length; i++) {
		const s = segs[i].trim();
		if (i < segs.length - 1) {
			if (!s || /^\.+$/.test(s)) return "Folder names can’t be empty.";
		} else {
			const m = s.match(/^(.*)\.[^.]+$/),
				base = m ? m[1] : s; // strip the extension
			if (!base || /^\.+$/.test(base)) return "Enter a name for the file, not just a path.";
		}
	}
	return null;
}
function fileDlgSubmit() {
	const name = fileDlgFinalName();
	const err = fileNameError(name);
	if (err) {
		fileDlgError(err);
		return;
	}
	if (fileDlgMode === "rename") {
		if (renameFile(fileDlgIdx, name) !== false) closeFileDialog();
	} else {
		if (
			files.some(function (f) {
				return f.name === name;
			})
		) {
			fileDlgError(`A file called “${name}” already exists.`);
			return;
		}
		createFile(name);
		closeFileDialog();
	}
}

function deleteFile(idx) {
	const f = files[idx];
	if (!f || f.name === demoEntry) return;
	if (!window.confirm(`Delete “${f.name}”?`)) return;
	if (idx !== activeFile) stashActive();
	const wasPreview = f.name === previewEntry;
	files.splice(idx, 1);
	states.splice(idx, 1);
	if (idx < activeFile || activeFile >= files.length) activeFile = Math.max(0, activeFile - 1);
	if (wasPreview) {
		// the previewed page was deleted -> fall back to the entry (or first html)
		previewEntry = files.some(function (x) {
			return x.name === demoEntry;
		})
			? demoEntry
			: (
					files.filter(function (x) {
						return x.lang === "html";
					})[0] ||
					files[0] ||
					{}
				).name || demoEntry;
	}
	activateFile(activeFile);
	renderTabs();
	runLint();
	render();
	setDirty(filesDirty());
}

// this page's line annotations (baked as JSON by the build; empty when none)
function readNotes() {
	const scriptEl = document.getElementById("demo-notes");
	if (!scriptEl || !scriptEl.textContent.trim()) return [];
	try {
		return JSON.parse(scriptEl.textContent);
	} catch (e) {
		console.error("demo-notes JSON error:", e);
		return [];
	}
}

// load this page's demo: files from #demo-files, notes from #demo-notes — the standalone editor additionally wires upload and drag-and-drop
function loadDemo() {
	files = readFiles();
	demoEntry =
		(demoFilesBox && demoFilesBox.getAttribute("data-entry")) || (files[0] && files[0].name) || "index.html";
	previewEntry = demoEntry;
	activeFile = Math.max(
		0,
		files.findIndex(function (f) {
			return f.name === demoEntry;
		})
	);
	states = files.map(function () {
		return null;
	}); // per-file states, created on demand
	originals = {};
	files.forEach(function (f) {
		originals[f.name] = f.content;
	});
	allNotes = notesEnabled ? readNotes() : [];
	activateFile(activeFile);
	renderTabs();
	infoBody.scrollTop = 0;
	setDirty(false);
	render();
	if (allowAddFiles) setupUpload(); // upload works on the standalone editor and any allowAdd demo
}

// ———————————————————————————
// UPLOAD
// wired on any file-creating page (standalone or an allowAdd demo): a small menu (files / folder) plus whole-page drag-and-drop both feed the same confirm dialog, opened from the tab-bar upload button and the standalone toolbar
// ———————————————————————————
var UPLOAD_ACCEPT =
	".html,.htm,.css,.js,.mjs,.png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.ico,.bmp,.woff,.woff2,.ttf,.otf,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.mp4,.webm,.mov,.m4v,.ogv";
var uploadWired = false,
	upMenu = null,
	upMenuAnchor = null,
	upFileInput = null,
	upDirInput = null;
function ensureUploadInputs() {
	if (upFileInput) return;
	upFileInput = document.getElementById("tb-file") || document.createElement("input");
	upFileInput.type = "file";
	upFileInput.hidden = true;
	upFileInput.setAttribute("multiple", "");
	upFileInput.setAttribute("accept", UPLOAD_ACCEPT);
	if (!upFileInput.parentNode) document.body.appendChild(upFileInput);
	upFileInput.onchange = function () {
		if (upFileInput.files && upFileInput.files.length) openDropConfirm(inputFilesToRecords(upFileInput.files));
		upFileInput.value = "";
		closeUploadMenu();
	};
	upDirInput = document.createElement("input");
	upDirInput.type = "file";
	upDirInput.hidden = true;
	upDirInput.setAttribute("webkitdirectory", "");
	upDirInput.setAttribute("directory", "");
	document.body.appendChild(upDirInput);
	upDirInput.onchange = function () {
		if (upDirInput.files && upDirInput.files.length) openDropConfirm(inputFilesToRecords(upDirInput.files));
		upDirInput.value = "";
		closeUploadMenu();
	};
}
function closeUploadMenu() {
	if (upMenu) upMenu.hidden = true;
}
function buildUploadMenu() {
	upMenu = document.createElement("div");
	upMenu.className = "mf-menu";
	upMenu.hidden = true;
	upMenu.innerHTML =
		'<button type="button" data-act="files">Upload files\u2026</button><button type="button" data-act="folder">Upload folder\u2026</button>';
	document.body.appendChild(upMenu);
	upMenu.querySelector('[data-act="files"]').onclick = function () {
		ensureUploadInputs();
		upFileInput.value = "";
		upFileInput.click();
	};
	upMenu.querySelector('[data-act="folder"]').onclick = function () {
		ensureUploadInputs();
		upDirInput.value = "";
		upDirInput.click();
	};
	document.addEventListener("mousedown", function (e) {
		if (upMenu && !upMenu.hidden && !upMenu.contains(e.target) && e.target !== upMenuAnchor) closeUploadMenu();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") closeUploadMenu();
	});
}
function openUploadMenu(anchor) {
	ensureUploadInputs();
	if (!upMenu) buildUploadMenu();
	if (upMenu.hidden) {
		upMenuAnchor = anchor;
		const r = anchor.getBoundingClientRect();
		upMenu.style.left = `${Math.max(4, r.left)}px`;
		upMenu.style.top = `${r.bottom + 4}px`;
		upMenu.hidden = false;
	} else closeUploadMenu();
}
function setupUpload() {
	if (uploadWired) return;
	uploadWired = true;
	ensureUploadInputs();
	// whole-page drag-and-drop zone
	function hasFiles(event) {
		const types = event.dataTransfer && event.dataTransfer.types;
		return types && (types.indexOf ? types.indexOf("Files") > -1 : types.contains && types.contains("Files"));
	}
	let depth = 0;
	document.addEventListener(
		"dragenter",
		function (e) {
			if (hasFiles(e)) {
				depth++;
				document.body.classList.add("drag-over");
			}
		},
		true
	);
	document.addEventListener(
		"dragover",
		function (e) {
			if (hasFiles(e)) e.preventDefault();
		},
		true
	);
	document.addEventListener(
		"dragleave",
		function () {
			depth = Math.max(0, depth - 1);
			if (!depth) document.body.classList.remove("drag-over");
		},
		true
	);
	document.addEventListener(
		"drop",
		function (e) {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			depth = 0;
			document.body.classList.remove("drag-over");
			collectDrop(e.dataTransfer).then(openDropConfirm);
		},
		true
	);
	// standalone toolbar buttons (present only on the blank editor)
	let uploadBtn = document.getElementById("tb-upload");
	if (uploadBtn) {
		uploadBtn.onclick = function (e) {
			e.stopPropagation();
			openUploadMenu(uploadBtn);
		};
	} // text/title are baked into the template (no runtime relabel flash)
	let downloadBtn = document.getElementById("tb-download");
	if (downloadBtn) downloadBtn.onclick = downloadAll;
}

// ———————————————————————————
// DRAG-AND-DROP
// files and folders: collect, confirm, then add or replace
// ———————————————————————————
// what an upload accepts — video is limited to what a browser will actually play, so .mov and .ogv are left out
var VALID_UP =
	/\.(demo|html?|css|m?js|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|mp3|wav|ogg|oga|m4a|aac|flac|mp4|webm|m4v)$/i;
function readAllEntries(reader) {
	// a DirectoryReader yields children in batches
	return new Promise(function (resolve) {
		let all = [];
		(function next() {
			reader.readEntries(
				function (batch) {
					if (!batch || !batch.length) return resolve(all);
					all = all.concat(Array.prototype.slice.call(batch));
					next();
				},
				function () {
					resolve(all);
				}
			);
		})();
	});
}
function walkEntry(entry, prefix) {
	// -> [{ path, file }]
	return new Promise(function (resolve) {
		if (!entry) return resolve([]);
		if (entry.isFile) {
			entry.file(
				function (file) {
					resolve([{ path: prefix + entry.name, file: file }]);
				},
				function () {
					resolve([]);
				}
			);
		} else if (entry.isDirectory) {
			readAllEntries(entry.createReader()).then(function (children) {
				Promise.all(
					children.map(function (c) {
						return walkEntry(c, `${prefix + entry.name}/`);
					})
				).then(function (lists) {
					resolve([].concat.apply([], lists));
				});
			});
		} else resolve([]);
	});
}
function collectDrop(dt) {
	// handles folders via the entries API, falls back to a flat list
	const items = dt && dt.items ? Array.prototype.slice.call(dt.items) : [];
	const entries = items
		.map(function (it) {
			return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
		})
		.filter(Boolean);
	if (entries.length) {
		return Promise.all(
			entries.map(function (en) {
				return walkEntry(en, "");
			})
		).then(function (lists) {
			let flat = [].concat.apply([], lists);
			// dropping a single folder: strip its own name so its contents land at the project root
			if (entries.length === 1 && entries[0].isDirectory) {
				const top = `${entries[0].name}/`;
				flat = flat.map(function (r) {
					return { path: r.path.indexOf(top) === 0 ? r.path.slice(top.length) : r.path, file: r.file };
				});
			}
			return flat;
		});
	}
	const flat0 = dt && dt.files ? Array.prototype.slice.call(dt.files) : [];
	return Promise.resolve(
		flat0.map(function (f) {
			return { path: f.webkitRelativePath || f.name, file: f };
		})
	);
}
// records from an <input> file list (multiple files or a webkitdirectory folder pick)
function inputFilesToRecords(fileList) {
	let recs = Array.prototype.slice.call(fileList || []).map(function (f) {
		return { path: f.webkitRelativePath || f.name, file: f };
	});
	// a folder pick prefixes every path with the folder name; strip a single shared top folder
	let tops = {};
	recs.forEach(function (r) {
		let seg = r.path.split("/");
		if (seg.length > 1) tops[seg[0]] = 1;
	});
	const keys = Object.keys(tops);
	if (
		keys.length === 1 &&
		recs.every(function (r) {
			return r.path.indexOf(`${keys[0]}/`) === 0;
		})
	) {
		const pre = `${keys[0]}/`;
		recs = recs.map(function (r) {
			return { path: r.path.slice(pre.length), file: r.file };
		});
	}
	return recs;
}
function readText(file) {
	return new Promise(function (res) {
		let r = new FileReader();
		r.onload = function () {
			res(String(r.result || ""));
		};
		r.onerror = function () {
			res("");
		};
		r.readAsText(file);
	});
}
function readDataUrl(file) {
	return new Promise(function (res) {
		let r = new FileReader();
		r.onload = function () {
			res(String(r.result || ""));
		};
		r.onerror = function () {
			res("");
		};
		r.readAsDataURL(file);
	});
}
function baseName(p) {
	return String(p).split("/").pop();
}
// read each valid dropped or picked file — code files as text, media files as a data url, since an uploaded media file has no server url and carries its own data; `isMedia` files are placed under a user-chosen media folder in the confirm dialog
function openDropConfirm(records) {
	const valid = (records || []).filter(function (r) {
		return VALID_UP.test(r.path);
	});
	const ignored = (records || []).length - valid.length;
	if (!valid.length) {
		alert("No supported files were found. You can add HTML, CSS, JS, images, fonts, audio or video.");
		return;
	}
	Promise.all(
		valid.map(function (r) {
			const path = r.path.replace(/^\/+/, ""),
				lang = langForName(path);
			if (lang === "media")
				return readDataUrl(r.file).then(function (d) {
					return { name: path, base: baseName(path), lang: "media", src: d, content: "", isMedia: true };
				});
			return readText(r.file).then(function (t) {
				// a .demo holds a whole project, so it is flagged here and unpacked when the drop is applied
				return { name: path, lang: lang, content: t, isMedia: false, isDemo: /\.demo$/i.test(path) };
			});
		})
	).then(function (loaded) {
		// the .demo leads the list, since it decides what the project becomes
		loaded.sort(function (a, b) {
			return (b.isDemo ? 1 : 0) - (a.isDemo ? 1 : 0);
		});
		showDropDialog(loaded, ignored);
	});
}

var dropDlg = null,
	dropLoaded = null;
function pathPrefixVal() {
	const el = dropDlg && dropDlg.querySelector("#drop-mediafolder");
	return el ? el.value.trim().replace(/^\/+|\/+$/g, "") : "";
}
// final project path: the chosen folder is prepended to every file — media files flatten to just their name under it, code files keep their relative path under it
function finalDropName(item) {
	const p = pathPrefixVal();
	const rest = item.isMedia ? item.base : item.name;
	return (p ? `${p}/` : "") + rest;
}
function buildDropDialog() {
	let overlay = document.createElement("div");
	overlay.id = "drop-overlay";
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Add dropped files">
		<div class="dlg-head"><span id="drop-title">Add files</span><button type="button" id="drop-x" title="Close"><svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg></button></div>
		<div class="dlg-body">
		<div class="dlg-field" id="drop-mediafolder-row" hidden><span class="dlg-label">File path</span><div><input type="text" id="drop-mediafolder" class="mf-text" autocomplete="off" spellcheck="false" placeholder="Enter a file path here!"><div class="dlg-hint">Folder to place the uploaded files in, like <code>images</code> or <code>fonts</code>. Reference files by this path in your code.</div></div></div>
		<div class="mf-note" id="drop-ignored" hidden></div>
		<div class="mf-droplist" id="drop-list"></div>
		<div class="dlg-hint"><code>Replace Existing</code> removes all existing files and replaces them with your uploaded files. If the uploaded files don’t contain an <code>index.html</code> file, the existing <code>index.html</code> file will remain as the project’s homepage.</div><div class="dlg-hint"><code>Add to Project</code> adds the uploaded files to your project. Files with the same name as existing files are replaced.</div>
		</div>
		<div class="dlg-actions"><button type="button" class="ctrl" id="drop-cancel"><svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg><span>Cancel</span></button><button type="button" class="ctrl" id="drop-replace"><svg viewBox="0 0 100 100"><path d="m50,13.871c-9.554,0-18.232,3.755-24.655,9.86v-11.668h-9.998v28.284s28.284,0,28.284,0v-9.999h-12.258c4.831-4.656,11.394-7.525,18.628-7.525,14.835,0,26.859,12.024,26.859,26.859s-12.024,26.859-26.859,26.859-26.859-12.024-26.859-26.859h-8.953c0,19.777,16.035,35.812,35.812,35.812s35.812-16.035,35.812-35.812S69.777,13.871,50,13.871Z"/></svg><span>Replace Existing</span></button><button type="button" class="ctrl" id="drop-add"><svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg><span>Add to Project</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	dropDlg = overlay;
	overlay.querySelector("#drop-x").onclick = closeDropDialog;
	overlay.querySelector("#drop-cancel").onclick = closeDropDialog;
	overlay.querySelector("#drop-add").onclick = function () {
		const over = (dropLoaded || []).filter(function (l) {
			const nm = finalDropName(l);
			return files.some(function (f) {
				return f.name === nm;
			});
		}).length;
		if (over > 0 && !window.confirm(`${over} existing file${over === 1 ? "" : "s"} will be overwritten. Continue?`))
			return;
		applyDroppedFiles(false);
		closeDropDialog();
	};
	overlay.querySelector("#drop-replace").onclick = function () {
		if (!window.confirm("Replace all current files with the dropped ones? This can’t be undone.")) return;
		applyDroppedFiles(true);
		closeDropDialog();
	};
	overlay.querySelector("#drop-mediafolder").addEventListener("input", renderDropList); // reflow media names live
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeDropDialog();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && dropDlg && !dropDlg.hidden) closeDropDialog();
	});
}
function closeDropDialog() {
	if (dropDlg) dropDlg.hidden = true;
	dropLoaded = null;
}
function renderDropList() {
	dropDlg.querySelector("#drop-list").innerHTML = dropLoaded
		.map(function (f) {
			const nm = finalDropName(f),
				over = files.some(function (x) {
					return x.name === nm;
				});
			return `<div class="mf-drop-item${over ? " over" : ""}"><span class="mf-drop-name">${escHtml(nm)}${over ? ' <span class="mf-drop-flag">replaces existing</span>' : ""}</span><span class="mf-drop-lang">${f.lang}</span></div>`;
		})
		.join("");
}
function showDropDialog(loaded, ignored) {
	if (!dropDlg) buildDropDialog();
	dropLoaded = loaded;
	dropDlg.querySelector("#drop-mediafolder-row").hidden = !loaded.length; // a file-path field for every upload
	let mfEl = dropDlg.querySelector("#drop-mediafolder");
	if (
		!mfEl.value &&
		loaded.every(function (l) {
			return l.isMedia;
		})
	)
		mfEl.value = ""; // media-only default
	renderDropList();
	let note = dropDlg.querySelector("#drop-ignored");
	const demoDrop = droppedDemo();
	const lines = [];
	if (demoDrop) {
		const others = loaded.filter(function (l) {
			return !l.isDemo && !l.isMedia;
		}).length;
		lines.push(
			`“${demoDrop.name}” holds a whole demo. Its code, notes and description are what will be used${others ? `, so the other ${others} code file${others === 1 ? "" : "s"} here will be ignored` : ""}. Media files are still added.`
		);
	}
	if (ignored > 0) lines.push(`${ignored} unsupported file${ignored === 1 ? "" : "s"} ignored.`);
	note.hidden = !lines.length;
	note.textContent = lines.join(" ");
	dropDlg.querySelector("#drop-title").innerHTML =
		`<svg viewBox="0 0 100 100"><path d="m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z"/></svg><span>Add ${loaded.length} file${loaded.length === 1 ? "" : "s"}</span>`;
	dropDlg.hidden = false;
}
// the .demo in the current drop, if there is one
function droppedDemo() {
	return (dropLoaded || []).filter(function (l) {
		return l.isDemo;
	})[0];
}
function applyDroppedFiles(replace) {
	if (!dropLoaded || !dropLoaded.length) return;
	const demoDrop = droppedDemo();
	if (demoDrop) {
		const parsed = parseDemoFile(demoDrop.content);
		if (!parsed.files.length) {
			alert(`“${demoDrop.name}” doesn’t contain any files.`);
			return;
		}
		const media = dropLoaded
			.filter(function (l) {
				return l.isMedia;
			})
			.map(function (l) {
				return { name: finalDropName(l), lang: "media", content: "", src: l.src || "" };
			});
		stashActive();
		// replace drops whatever was here; add keeps the files the demo doesn't mention
		const kept = replace
			? []
			: files.filter(function (f) {
					return !parsed.files.some(function (d) {
						return d.name === f.name;
					});
				});
		installDemo(kept.concat(parsed.files, media), parsed.entry, parsed.notes, parsed.info);
		savedDemoName = "";
		setDemoName(slugToName(demoDrop.name));
		savedState = demoSnapshot();
		closeDropDialog();
		return;
	}
	const resolved = dropLoaded.map(function (l) {
		return { name: finalDropName(l), lang: l.lang, content: l.content || "", src: l.src || "" };
	});
	stashActive();
	if (replace) {
		// if the dropped set has no index.html/entry, keep the current main entry file as-is
		const hasEntry = resolved.some(function (f) {
			return f.name === "index.html" || f.name === demoEntry;
		});
		const kept = hasEntry
			? []
			: files
					.filter(function (f) {
						return f.name === demoEntry;
					})
					.map(function (f) {
						return { name: f.name, lang: f.lang, content: f.content, src: f.src };
					});
		files = kept.concat(
			resolved.map(function (f) {
				return { name: f.name, lang: f.lang, content: f.content, src: f.src };
			})
		);
		const entryF =
			files.filter(function (f) {
				return f.name === demoEntry;
			})[0] ||
			files.filter(function (f) {
				return f.name === "index.html";
			})[0] ||
			files.filter(function (f) {
				return f.lang === "html";
			})[0] ||
			files[0];
		demoEntry = entryF ? entryF.name : "index.html";
		previewEntry = demoEntry;
		states = files.map(function () {
			return null;
		});
		originals = {};
		files.forEach(function (f) {
			originals[f.name] = f.content;
		});
		activeFile = Math.max(0, files.indexOf(entryF));
		activateFile(activeFile);
		renderTabs();
		runLint();
		render();
		setDirty(false);
		requestAnimationFrame(scrollActiveTabIntoView);
	} else {
		let lastName = null;
		resolved.forEach(function (nf) {
			let k = files.findIndex(function (f) {
				return f.name === nf.name;
			});
			if (k >= 0) {
				files[k].content = nf.content;
				files[k].lang = nf.lang;
				files[k].src = nf.src;
				states[k] = null;
			} else {
				files.push({ name: nf.name, lang: nf.lang, content: nf.content, src: nf.src });
				states.push(null);
			}
			lastName = nf.name;
		});
		// open the uploaded file (the last one, if several) in the code/media panel
		const li =
			lastName != null
				? files.findIndex(function (f) {
						return f.name === lastName;
					})
				: -1;
		if (li >= 0) activeFile = li;
		activateFile(activeFile);
		renderTabs();
		runLint();
		render();
		setDirty(filesDirty());
		requestAnimationFrame(scrollActiveTabIntoView); // scroll the opened tab into view
	}
}

// unsaved-edits guard (used by the reset button + the beforeunload prompt)
function confirmDiscard() {
	if (!dirty) return true;
	return window.confirm("You’ve edited this demo. Discard your changes?");
}

// the nav popup (open/close, focus trap, scroll-to-active) and the top-titlebar crumbs + prev/next arrows are wired by chrome.js — a classic script that runs before this module and independently of it, so navigation keeps working even if codemirror fails to load; the popup markup itself is pre-rendered into #nav-body by the build

// mobile: a single panel shows at a time, switched by the tab bar under the topbar (css hides the inactive panels below 600px; on desktop the tabs are hidden)
(function () {
	const tabs = document.getElementById("mobile-tabs");
	if (!tabs) return;
	var btns = tabs.querySelectorAll(".m-tab");
	// which panels exist (embeds may include only some)
	var avail = embedMode
		? { info: !!embed.info, code: !!embed.code, preview: !!embed.preview }
		: { info: showInfo, code: showCode, preview: showPreview };
	function setTab(tab) {
		document.body.classList.remove("m-tab-info", "m-tab-code", "m-tab-preview");
		document.body.classList.add(`m-tab-${tab}`);
		Array.prototype.forEach.call(btns, function (b) {
			b.classList.toggle("on", b.getAttribute("data-tab") === tab);
		});
		if (tab === "code")
			requestAnimationFrame(function () {
				view.requestMeasure();
			}); // re-measure now it's visible
	}
	Array.prototype.forEach.call(btns, function (b) {
		b.onclick = function () {
			setTab(b.getAttribute("data-tab"));
		};
	});
	setMobileTab = function (tab) {
		if (avail[tab]) setTab(tab);
	}; // expose for the info-panel file list
	// start on the first panel this view actually has (info on the full site; the
	// first included panel in an embed)
	setTab(avail.info ? "info" : avail.code ? "code" : "preview");
})();

// reset every file to its original (guarded); drops any files the learner added
function resetDemo(guard) {
	if (guard && !confirmDiscard()) return;
	files = files.filter(function (f) {
		return originals[f.name] != null;
	});
	files.forEach(function (f) {
		f.content = originals[f.name];
	});
	states = files.map(function () {
		return null;
	}); // rebuild states fresh from the originals
	previewEntry = demoEntry;
	if (activeFile >= files.length) activeFile = Math.max(0, files.length - 1);
	activateFile(activeFile);
	renderTabs();
	runLint();
	setDirty(false);
	render();
}
document.getElementById("t-reset").onclick = function () {
	resetDemo(true);
};

// reset the whole demo: rebuild the file list from what the build baked into the page, so files the learner added are gone and any they deleted are back
function resetDemoFiles(guard) {
	if (guard && !confirmDiscard()) return;
	files = readFiles();
	previewEntry = demoEntry;
	activeFile = Math.max(
		0,
		files.findIndex(function (f) {
			return f.name === demoEntry;
		})
	);
	states = files.map(function () {
		return null;
	});
	originals = {};
	files.forEach(function (f) {
		originals[f.name] = f.content;
	});
	allNotes = notesEnabled ? readNotes() : [];
	activateFile(activeFile);
	renderTabs();
	runLint();
	setDirty(false);
	render();
}
var resetDemoBtn = document.getElementById("t-reset-demo");
if (resetDemoBtn) {
	// a single-file demo has nothing to restore past its code, which the Code reset already covers
	if (!demoIsMulti) resetDemoBtn.hidden = true;
	else
		resetDemoBtn.onclick = function () {
			resetDemoFiles(true);
		};
}

// download the active file's current code (a multi-file zip is a future step)
function downloadHtml(name) {
	const active = files[activeFile] || { content: view.state.doc.toString() };
	const blob = new Blob([active.content], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	let anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name || "index.html";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(function () {
		URL.revokeObjectURL(url);
	}, 1000);
}
function downloadName() {
	if (standaloneMode && standaloneFileName) return standaloneFileName;
	return (files[activeFile] && files[activeFile].name) || "index.html";
}
// download: a lone code file downloads as-is, otherwise everything is zipped — media files are fetched from their real url and bundled as bytes, and skipped if unreachable
function downloadAll() {
	stashActive(); // make sure the active file's edits are saved
	// the blank editor always zips, so the .demo file rides along even when the project is down to one file
	if (!standaloneMode && files.length <= 1 && !(files[0] && files[0].lang === "media")) {
		downloadHtml(downloadName());
		return;
	}
	const base = standaloneMode
		? slugName(demoName || "project")
		: (location.pathname.split("/").pop() || "demo").replace(/\.html?$/i, "");
	zipDemo(files, base, standaloneMode ? toDemoFile(files, collectNotes(), infoMd) : "");
}
// a demo name as a file name: lowercase, spaces to hyphens, anything else dropped
function slugName(name) {
	return (
		String(name || "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "demo"
	);
}
// zip a list of files and hand it to the browser — media is fetched back from its own url, and anything unreachable is left out
function zipDemo(list, baseName, demoText) {
	Promise.all(
		list.map(function (f) {
			if (f.lang !== "media") return Promise.resolve({ name: f.name, bytes: strBytes(f.content) });
			if (!f.src) return Promise.resolve(null);
			return fetch(f.src)
				.then(function (r) {
					return r.ok ? r.arrayBuffer() : null;
				})
				.then(function (buf) {
					return buf ? { name: f.name, bytes: new Uint8Array(buf) } : null;
				})
				.catch(function () {
					return null;
				});
		})
	).then(function (entries) {
		entries = entries.filter(Boolean);
		// the blank editor also ships the whole demo as one .demo file, ready to drop into a book
		if (demoText) entries.push({ name: `${baseName}.demo`, bytes: strBytes(demoText) });
		const url = URL.createObjectURL(makeZip(entries));
		let anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `${baseName}.zip`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 1000);
	});
}
document.getElementById("t-download").onclick = downloadAll;

// warn before losing edits on refresh or close
window.addEventListener("beforeunload", function (e) {
	if (!embedMode && dirty) {
		e.preventDefault();
		e.returnValue = "";
	}
});

// in-app navigation links (topbar crumbs + prev/next arrows, the info "next" link, and the nav-popup links) are real <a> elements wired by chrome.js, so a click navigates natively and would only ever raise the browser's generic unload prompt — intercept the click first so we can show our own, friendlier "discard your changes?" warning, and if the user agrees clear the dirty flag so the generic prompt doesn't also fire
document.addEventListener(
	"click",
	function (e) {
		if (embedMode || !dirty) return;
		const t = e.target,
			a =
				t && t.closest
					? t.closest("a.tb-seg[href], a.tb-arrow[href], a.info-next[href], #nav-overlay a[href]")
					: null;
		if (!a) return;
		if (confirmDiscard())
			setDirty(false); // agreed to discard: allow the navigation, silence beforeunload
		else e.preventDefault(); // keep editing
	},
	true
);

// resize the info panel by dragging the line between it and the code panel
let draggingL = false,
	grabL = 0;
resizerLeft.addEventListener("pointerdown", function (e) {
	draggingL = true;
	clearMax();
	document.body.classList.add("draggingL");
	const lr = resizerLeft.getBoundingClientRect();
	grabL = e.clientX - (lr.left + lr.width / 2); // keep the grab point under the cursor
	resizerLeft.setPointerCapture(e.pointerId);
});
resizerLeft.addEventListener("pointermove", function (e) {
	if (!draggingL) return;
	const rect = mainEl.getBoundingClientRect(),
		T = panelTotal();
	wInfo = Math.max(STRIP, Math.min(T - 2 * STRIP, e.clientX - grabL - rect.left));
	if (wInfo + wPrev > T - STRIP) wPrev = T - STRIP - wInfo; // code at spine -> push preview
	applyPanels();
});
function endI(event) {
	if (!draggingL) return;
	draggingL = false;
	document.body.classList.remove("draggingL");
	try {
		resizerLeft.releasePointerCapture(event.pointerId);
	} catch (_) {}
	view.requestMeasure();
}
resizerLeft.addEventListener("pointerup", endI);
resizerLeft.addEventListener("pointercancel", endI);

// notes: the "notes" button opens every note when any are closed and hides them all when they are already all open; it only lights up while all are showing, and clicking individual pins re-syncs it via the updateListener
function allNotesOpen(state) {
	const list = state.field(annoField);
	return (
		list.length > 0 &&
		list.every(function (a) {
			return a.open;
		})
	);
}
function setNotesBtns(state) {
	if (!notesBtn) return; // may fire before the button ref is set
	state = state || view.state;
	const count = state.field(annoField).length;
	notesBtn.hidden = count === 0; // hide once every note is edited away
	const allOpen = allNotesOpen(state);
	notesBtn.classList.toggle("on", allOpen);
	const embedNotesBtn = document.getElementById("eb-notes");
	if (embedNotesBtn) embedNotesBtn.classList.toggle("on", allOpen);
	// only the blank editor can write notes, so only it can clear them — greyed out like undo/redo when there is nothing to do
	if (notesDelBtn) {
		notesDelBtn.hidden = !standaloneMode;
		notesDelBtn.disabled = count === 0;
	}
}
function toggleNotes() {
	view.dispatch({ effects: setAllAnno.of(!allNotesOpen(view.state)) });
	// the updateListener re-syncs the button once the annoField changes
}
notesBtn.onclick = toggleNotes;
// clear every note in the file that is open, after asking
if (notesDelBtn)
	notesDelBtn.onclick = function () {
		const count = view.state.field(annoField).length;
		if (!count) return;
		const name = files[activeFile] ? files[activeFile].name : "this file";
		if (!window.confirm(`Delete all ${count} note${count === 1 ? "" : "s"} in “${name}”? This can’t be undone.`))
			return;
		applyNotes([]);
		view.focus();
	};

// ———————————————————————————
// UNDO / REDO
// per-file: each file has its own EditorState history
// ———————————————————————————
function setUndoRedoBtns(state) {
	state = state || view.state;
	const canU = undoDepth(state) > 0,
		canR = redoDepth(state) > 0;
	if (undoBtn) {
		undoBtn.classList.toggle("active", canU);
		undoBtn.disabled = !canU;
	}
	if (redoBtn) {
		redoBtn.classList.toggle("active", canR);
		redoBtn.disabled = !canR;
	}
}
if (undoBtn)
	undoBtn.onclick = function () {
		undo(view);
		view.focus();
	};
if (redoBtn)
	redoBtn.onclick = function () {
		redo(view);
		view.focus();
	};
setUndoRedoBtns();

// ———————————————————————————
// SETTINGS POPUP
// anchored to the code-panel "settings" button
// ———————————————————————————
(function () {
	var pop = document.getElementById("settings-popup");
	var btn = document.getElementById("ed-settings");
	let closeBtn = document.getElementById("sp-close");
	if (!pop || !btn) return;
	function open() {
		pop.hidden = false;
		btn.classList.add("on");
	}
	function close() {
		pop.hidden = true;
		btn.classList.remove("on");
	}
	btn.addEventListener("mousedown", function (e) {
		e.stopPropagation();
	});
	btn.onclick = function (e) {
		e.stopPropagation();
		if (pop.hidden) open();
		else close();
	};
	if (closeBtn) closeBtn.onclick = close;
	// mousedown inside keeps it open; pressing the mouse anywhere else closes it
	pop.addEventListener("mousedown", function (e) {
		e.stopPropagation();
	});
	document.addEventListener("mousedown", function () {
		if (!pop.hidden) close();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !pop.hidden) close();
	});
})();

// shortcuts (collapse + os toggle) are wired by chrome.js
if (embedMode) {
	let ebReset = document.getElementById("eb-reset");
	let ebRerun = document.getElementById("eb-rerun");
	let ebOpen = document.getElementById("eb-open");
	ebReset.style.display = embed.readonly || !embed.code ? "none" : ""; // reset only matters for an editable code panel
	ebRerun.style.display = runEnabled ? "" : "none";
	ebReset.onclick = function () {
		resetDemo(false);
	};
	ebRerun.onclick = function () {
		render(view.state.doc.toString());
	};
	const originalUrl = new URL(location.href);
	originalUrl.searchParams.delete("embed");
	ebOpen.href = originalUrl.toString();
	ebOpen.target = "_blank";
	ebOpen.rel = "noopener";
}

// ———————————————————————————
// EMBED DIALOG
// builds the iframe snippet
// ———————————————————————————
(function () {
	var overlay = document.getElementById("embed-overlay");
	var dInfo = document.getElementById("dlg-info"),
		dCode = document.getElementById("dlg-code"),
		dPreview = document.getElementById("dlg-preview");
	var dConsole = document.getElementById("dlg-console"),
		consoleL = document.getElementById("dlg-console-l");
	var dNotes = document.getElementById("dlg-notes"),
		dNotesExp = document.getElementById("dlg-notes-exp");
	var dReadonly = document.getElementById("dlg-readonly"),
		codeEl = document.getElementById("embed-code");
	var embedURL = document.getElementById("embed-url");
	var dDim = document.getElementById("dlg-dim"),
		dimL = document.getElementById("dlg-dim-l");
	var notesL = document.getElementById("dlg-notes-l"),
		notesExpL = document.getElementById("dlg-notesexp-l");
	const inputs = Array.prototype.slice.call(document.querySelectorAll("#embed-dialog input"));

	// the demo's real capabilities: a live preview iframe (absent on a console-only demo) and a console (absent when the console is hidden) — preview and console are separate checkboxes now, so preview only / console only / both fall out of which are checked
	var demoPreview = showPreview && consoleMode !== "only";
	var demoConsole = showPreview && !hideConsole;
	function embedLock(chk, ok) {
		if (chk && !ok) {
			chk.checked = false;
			chk.disabled = true;
			const l = chk.closest("label");
			if (l) l.classList.add("disabled");
		}
	}
	// reset every control to its default; called when the dialog opens so it starts fresh
	function resetEmbed() {
		dInfo.checked = showInfo;
		dCode.checked = showCode;
		dPreview.checked = demoPreview;
		dConsole.checked = demoConsole;
		dNotes.checked = true;
		dNotesExp.checked = false;
		dReadonly.checked = false;
		dDim.checked = demoPreview;
		embedLock(dInfo, showInfo);
		embedLock(dCode, showCode);
		embedLock(dPreview, demoPreview);
		embedLock(dConsole, demoConsole);
		refresh();
	}

	// token format: i . c0|c1|c2 . p0|p1|p2 . ro . d, where an absent code means that feature is off — i = info panel, c = code + notes, c1 = code + notes open by default, c2 = code with no notes, p = preview + console, p1 = preview only, p2 = console only, ro = read-only, d = show dimensions (only when a live preview iframe is shown)
	function token(cfg) {
		const parts = [];
		if (cfg.info) parts.push("i");
		if (cfg.code) parts.push(cfg.notes ? (cfg.notesExp ? "c1" : "c") : "c2"); // default code+notes -> bare "c"
		if (cfg.preview || cfg.console) parts.push(cfg.preview && cfg.console ? "p" : cfg.preview ? "p1" : "p2"); // default preview+console -> bare "p"
		if (cfg.readonly) parts.push("ro");
		if (cfg.dim && cfg.preview) parts.push("d");
		return parts.join(".");
	}
	function refresh() {
		// at least one panel must be embedded
		if (!dInfo.checked && !dCode.checked && !dPreview.checked && !dConsole.checked) {
			if (!dCode.disabled) dCode.checked = true;
			else if (!dPreview.disabled) dPreview.checked = true;
			else if (!dConsole.disabled) dConsole.checked = true;
			else if (!dInfo.disabled) dInfo.checked = true;
		}
		notesL.classList.toggle("disabled", !dCode.checked);
		dNotes.disabled = !dCode.checked;
		const notesOff = !dCode.checked || !dNotes.checked;
		notesExpL.classList.toggle("disabled", notesOff);
		dNotesExp.disabled = notesOff;
		// dimensions only matter when the live preview iframe is shown
		const dimOff = !dPreview.checked;
		dimL.classList.toggle("disabled", dimOff);
		dDim.disabled = dimOff;
		// read-only only matters when the code panel (the only editable thing) is embedded
		const roOff = !dCode.checked;
		const roL = dReadonly.closest("label");
		if (roL) roL.classList.toggle("disabled", roOff);
		dReadonly.disabled = roOff;
		if (roOff) dReadonly.checked = false;

		const cfg = {
			info: dInfo.checked,
			code: dCode.checked,
			preview: dPreview.checked,
			console: dConsole.checked,
			notes: dNotes.checked,
			notesExp: dNotesExp.checked,
			readonly: dReadonly.checked,
			dim: dDim.checked
		};
		const pageUrl = location.href.split("#")[0].split("?")[0];
		const height = 480;
		codeEl.value = `<iframe src="${pageUrl}?embed=${token(cfg)}" width="100%" height="${height}" style="border:1px solid #1a1a1a;" loading="lazy"></iframe>`;
		embedURL.textContent = `${pageUrl}?embed=${token(cfg)}`;
	}
	inputs.forEach(function (el) {
		el.addEventListener("change", refresh);
	});

	function close() {
		overlay.hidden = true;
	}
	function openEmbed() {
		let sp = document.getElementById("settings-popup");
		if (sp) sp.hidden = true; // close settings when opening embed
		const sb = document.getElementById("ed-settings");
		if (sb) sb.classList.remove("on");
		resetEmbed();
		overlay.hidden = false; // always start from defaults
	}
	let embedBtn = document.getElementById("t-embed");
	if (embedBtn) embedBtn.onclick = openEmbed;
	let footerEmbed = document.getElementById("footer-embed"); // "Embed this demo" in the footer
	if (footerEmbed) footerEmbed.onclick = openEmbed;
	document.getElementById("embed-close").onclick = close;
	overlay.addEventListener("click", function (e) {
		if (e.target === overlay) close();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !overlay.hidden) close();
	});
	document.getElementById("embed-copy").onclick = function () {
		codeEl.focus();
		codeEl.select();
		var btn = document.getElementById("embed-copy"),
			// only the label changes, so the icon stays put while it reads "Copied!"
			slot = btn.querySelector("span") || btn,
			label = slot.textContent;
		function done() {
			slot.textContent = "Copied!";
			setTimeout(function () {
				slot.textContent = label;
			}, 1200);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(codeEl.value).then(done, function () {
				try {
					document.execCommand("copy");
					done();
				} catch (_) {}
			});
		} else {
			try {
				document.execCommand("copy");
				done();
			} catch (_) {}
		}
	};
	resetEmbed(); // apply defaults + locks once up front
})();

// ———————————————————————————
// DEMO NOTES
// on the blank editor every line carries a pin: a faint one opens a dialog to write a note, and a real one shows or hides the note it belongs to
// notes travel with the demo, and their text takes ``` around anything that should read as code
// ———————————————————————————
const FOLDER_ICON =
	'<svg viewBox="0 0 100 100"><path d="m60,30V10H10v80h80V30h-30Zm-40-10h30v10h-30v-10Zm0,60v-40h60v40H20Z"/></svg>';
const NOTE_ICON =
	'<svg viewBox="0 0 100 100"><path d="M64.14,90l25.86-25.86V10H10v80h54.14ZM60,80v-20h20l-20,20ZM20,80V20h60v30h-30v30h-30Z"/></svg>';

// note text is stored as html, so ``` fences become <code> on the way in and back to ``` when the note is opened for editing
function noteToHtml(source) {
	return escHtml(source)
		.replace(/```([\s\S]*?)```/g, "<code>$1</code>")
		.replace(/\n/g, "<br>");
}
function noteToSource(html) {
	return String(html || "")
		.replace(/<code>([\s\S]*?)<\/code>/g, "```$1```")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

// the active file's notes in the shape setAnnotations wants
function activeNotes() {
	return view.state.field(annoField).map(function (a) {
		return { id: a.id, text: a.text, line: view.state.doc.lineAt(a.from).number, open: a.open };
	});
}
function applyNotes(list) {
	view.dispatch({ effects: [setAnnotations.of(list), annoGutterComp.reconfigure(annoGutter)] });
}
// every note across every file, with the line it sits on — a file that was never opened still has its seeded notes
function collectNotes() {
	stashActive();
	const out = [];
	files.forEach(function (f, i) {
		const st = states[i];
		if (!st) {
			allNotes.forEach(function (n) {
				if ((n.file || demoEntry) === f.name) out.push({ file: f.name, line: n.line, text: n.text });
			});
			return;
		}
		st.field(annoField).forEach(function (a) {
			out.push({ file: f.name, line: st.doc.lineAt(a.from).number, text: a.text });
		});
	});
	return out;
}
function removeNote(id) {
	applyNotes(
		activeNotes().filter(function (n) {
			return n.id !== id;
		})
	);
}

let noteDlg = null,
	noteEditId = null, // the note being edited, or null when writing a new one
	noteLine = 1;
function buildNoteDialog() {
	const overlay = document.createElement("div");
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Note">
		<div class="dlg-head">${NOTE_ICON}<span id="note-heading">Write a note</span><button type="button" id="note-x" title="Close">${ACT_ICONS.erase}</button></div>
		<div class="dlg-body">
		<div class="dlg-field"><span class="dlg-label">Description</span><div>
			<textarea id="note-text" class="mf-text" spellcheck="false" placeholder="What is this line doing?" style="width:100%;min-height:140px;resize:vertical;line-height:1.5em"></textarea>
			<div class="mf-hint">Wrap anything in <code>\`\`\`</code> to show it as code, like <code>\`\`\`&lt;h1&gt;\`\`\`</code>.</div>
		</div></div>
		</div>
		<div class="dlg-actions"><button type="button" class="ctrl" id="note-cancel">${ACT_ICONS.erase}<span>Cancel</span></button><button type="button" class="ctrl" id="note-save">${ACT_ICONS.check}<span>Save</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	noteDlg = overlay;
	overlay.querySelector("#note-x").onclick = closeNoteDialog;
	overlay.querySelector("#note-cancel").onclick = closeNoteDialog;
	overlay.querySelector("#note-save").onclick = commitNote;
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeNoteDialog();
	});
}
function closeNoteDialog() {
	if (noteDlg) noteDlg.hidden = true;
}
function commitNote() {
	const text = noteToHtml(noteDlg.querySelector("#note-text").value);
	const list = activeNotes();
	if (noteEditId === null) {
		const nextId = list.reduce(function (m, n) {
			return Math.max(m, n.id + 1);
		}, 0);
		list.push({ id: nextId, text: text, line: noteLine, open: true });
	} else {
		for (let i = 0; i < list.length; i++) {
			if (list[i].id === noteEditId) {
				list[i] = { id: list[i].id, text: text, line: list[i].line, open: true };
			}
		}
	}
	applyNotes(list);
	closeNoteDialog();
}
// `id` is null for a new note on line `line`, or the id of the note being rewritten
function openNoteDialog(id, line) {
	if (!noteDlg) buildNoteDialog();
	noteEditId = id;
	noteLine = line || 1;
	const existing =
		id === null
			? null
			: activeNotes().find(function (n) {
					return n.id === id;
				});
	noteDlg.querySelector("#note-heading").textContent = existing ? "Edit note" : "Write a note";
	noteDlg.querySelector("#note-text").value = existing ? noteToSource(existing.text) : "";
	noteDlg.hidden = false;
	noteDlg.querySelector("#note-text").focus();
}

// ———————————————————————————
// DEMO DESCRIPTION
// the blank editor's info panel can be rewritten in place: the brief flips between its rendered self and the markdown behind it, and whatever it says travels with the demo when it is saved
// ———————————————————————————
// the extras this markdown understands beyond the ordinary kind, each shown next to what it turns into
const SHORTCODES = [
	{ label: "Headings", source: ["## A section heading", "", "### A smaller heading"].join("\n") },
	{ label: "Bold and italic", source: "This is **bold** and this is *italic*." },
	{ label: "Code", source: "Call `document.querySelector()` to find an element." },
	{ label: "Link", source: "Read [the MDN docs](https://developer.mozilla.org) for more." },
	{ label: "Button link", source: "[[Read the guide]](https://example.com)" },
	{ label: "Bulleted list", source: ["- First thing", "- Second thing", "- Third thing"].join("\n") },
	{ label: "Numbered list", source: ["1. First thing", "2. Second thing", "3. Third thing"].join("\n") },
	{ label: "Blockquote", source: "> Every demo is a page you can take apart." },
	{
		label: "Questions and answers",
		source: [
			"```faq",
			"Q: What is a shortcode?",
			"A small piece of markdown that turns into something richer.",
			"Q: Where can I use them?",
			"Anywhere in this description.",
			"```"
		].join("\n")
	},
	{
		label: "File tree",
		source: ["```tree", "index.html", "style.css", "images/", "\timages/logo.png", "```"].join("\n")
	}
];

// everything about a demo in the format build.mjs reads: one section per file, then the notes (their lines counted from the top of this file), then the description
function toDemoFile(list, notes, info) {
	const lines = [];
	const startOf = {};
	list.forEach(function (f) {
		if (f.lang === "media") {
			lines.push(`=== MEDIA ${f.name} ===`, f.src || "");
			return;
		}
		lines.push(`=== FILE ${f.name} ===`);
		startOf[f.name] = lines.length + 1;
		String(f.content || "")
			.split("\n")
			.forEach(function (l) {
				lines.push(l);
			});
	});
	if (notes && notes.length) {
		// notes come out grouped by file, in the order the files appear above, and by line within each file
		const order = {};
		list.forEach(function (f, i) {
			order[f.name] = i;
		});
		const sorted = notes.slice().sort(function (a, b) {
			const fa = order[a.file] === undefined ? list.length : order[a.file];
			const fb = order[b.file] === undefined ? list.length : order[b.file];
			return fa - fb || (a.line || 1) - (b.line || 1);
		});
		lines.push(
			"=== NOTES ===",
			JSON.stringify(
				sorted.map(function (n) {
					return {
						line: (startOf[n.file] || 1) + (n.line || 1) - 1,
						file: n.file,
						text: n.text
					};
				}),
				null,
				"\t"
			)
		);
	}
	if (info && info.trim()) lines.push("=== INFO ===", info.trim());
	return `${lines.join("\n")}\n`;
}

// read a .demo file: the sections build.mjs parses, minus the build-only CONFIG block
function trimBlank(s) {
	return String(s).replace(/^\n+|\n+$/g, "");
}
function parseDemoFile(text) {
	const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
	const sections = [];
	let cur = null;
	lines.forEach(function (l, i) {
		const m = l.match(/^===\s*([A-Za-z]+)(?:\s+(.+?))?\s*===\s*$/);
		if (m) {
			cur = { key: m[1].toUpperCase(), arg: m[2] ? m[2].trim() : "", lines: [], first: i + 2 };
			sections.push(cur);
		} else if (cur) cur.lines.push(l);
	});
	const out = { files: [], notes: [], info: "", entry: "index.html" };
	const startOf = {};
	sections.forEach(function (s) {
		if ((s.key === "FILE" && s.arg) || s.key === "HTML") {
			const name = s.key === "HTML" ? "index.html" : s.arg;
			let lead = 0;
			while (lead < s.lines.length && !s.lines[lead].trim()) lead++;
			startOf[name] = s.first + lead; // where this file's first real line sits in the .demo
			out.files.push({ name: name, lang: langForName(name), content: trimBlank(s.lines.join("\n")), src: "" });
		} else if (s.key === "MEDIA" && s.arg) {
			out.files.push({ name: s.arg, lang: "media", src: trimBlank(s.lines.join("\n")).trim(), content: "" });
		} else if (s.key === "NOTES" || s.key === "ANNOTATIONS") {
			try {
				out.notes = JSON.parse(s.lines.join("\n")) || [];
			} catch (e) {
				out.notes = []; // a broken notes block just means no notes
			}
		} else if (s.key === "INFO") out.info = trimBlank(s.lines.join("\n"));
	});
	if (
		!out.files.some(function (f) {
			return f.name === out.entry;
		})
	) {
		const first =
			out.files.filter(function (f) {
				return f.lang === "html";
			})[0] || out.files[0];
		out.entry = first ? first.name : "index.html";
	}
	// annotation lines are counted from the top of the .demo, so bring each one back to its own file
	out.notes = out.notes.map(function (n) {
		const file = n.file || out.entry;
		return {
			file: file,
			text: n.text,
			line: Math.max(1, (n.line || 1) - (startOf[file] || 1) + 1)
		};
	});
	return out;
}

// a dropped file name back to something readable for the demo's name
function slugToName(fileName) {
	return String(fileName)
		.replace(/^.*\//, "")
		.replace(/\.demo$/i, "")
		.replace(/[-_]+/g, " ")
		.trim();
}

let defaultInfoMd = "", // the description this page was built with, and what a new demo goes back to
	infoMd = "";

function briefEl() {
	return document.getElementById("info-brief");
}
// the brief as it reads, with the button that opens it for editing
function renderBrief() {
	const el = briefEl();
	if (!el) return;
	el.innerHTML = `${mdToHtml(infoMd)}<div class="dlg-actions" style="justify-content:flex-start;margin-top:16px"><button type="button" class="ctrl" id="info-edit">${ACT_ICONS.rename}<span>Edit this description</span></button></div>`;
	el.querySelector("#info-edit").onclick = editBrief;
}
// the same brief as plain markdown, with save, cancel and the shortcode reference under it
function editBrief() {
	const el = briefEl();
	if (!el) return;
	el.innerHTML = `<textarea id="info-md" class="mf-text" spellcheck="false" style="width:100%;min-height:320px;resize:vertical;line-height:1.5em"></textarea>
		<div class="dlg-actions" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px">
		<button type="button" class="ctrl" id="info-save">${ACT_ICONS.check}<span>Save</span></button>
		<button type="button" class="ctrl" id="info-cancel">${ACT_ICONS.erase}<span>Cancel</span></button>
		<button type="button" class="ctrl" id="info-codes">${ACT_ICONS.code}<span>Shortcodes</span></button>
		</div>`;
	const box = el.querySelector("#info-md");
	box.value = infoMd;
	box.focus();
	el.querySelector("#info-save").onclick = function () {
		infoMd = box.value;
		renderBrief();
	};
	el.querySelector("#info-cancel").onclick = renderBrief;
	el.querySelector("#info-codes").onclick = openShortcodes;
}

// the blocks a brief renders into are styled by rules scoped to #info-body, so copy those rules onto .md-preview once — that way the dialog's previews match the real thing without a second set of styles to maintain
let stylesMirrored = false;
function mirrorInfoStyles() {
	if (stylesMirrored) return;
	stylesMirrored = true;
	let css = "";
	Array.prototype.forEach.call(document.styleSheets, function (sheet) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch (e) {
			return; // a stylesheet from another origin can't be read
		}
		Array.prototype.forEach.call(rules, function (rule) {
			if (rule.selectorText && rule.selectorText.indexOf("#info-body") >= 0) {
				css += `${rule.cssText.replace(/#info-body/g, ".md-preview")}\n`;
			}
		});
	});
	const tag = document.createElement("style");
	tag.textContent = css;
	document.head.appendChild(tag);
}

let codesDlg = null;
function buildShortcodes() {
	const overlay = document.createElement("div");
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.style.setProperty("--accent", "var(--red)"); // the shortcode reference is red
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Shortcodes">
		<div class="dlg-head">${ACT_ICONS.code}<span>Shortcodes</span><button type="button" id="codes-x" title="Close">${ACT_ICONS.erase}</button></div>
		<div class="dlg-body">${SHORTCODES.map(function (sc) {
			// the source and what it renders into, side by side, one shortcode per row
			return `<div class="dlg-field dlg-shortcode" style="grid-template-columns:1fr;gap:8px"><span class="dlg-label">${sc.label}</span><div class="dlg-codepair"><pre class="dlg-code"><code>${escHtml(sc.source)}</code></pre><div class="md-preview">${mdToHtml(sc.source)}</div></div></div>`;
		}).join("")}</div>
		</div>`;
	mirrorInfoStyles();
	document.body.appendChild(overlay);
	codesDlg = overlay;
	overlay.querySelector("#codes-x").onclick = closeShortcodes;
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeShortcodes();
	});
}
function closeShortcodes() {
	if (codesDlg) codesDlg.hidden = true;
}
function openShortcodes() {
	if (!codesDlg) buildShortcodes();
	codesDlg.hidden = false;
}

// ———————————————————————————
// SAVED DEMOS
// the blank editor at /editor/ keeps demos in the browser's localStorage: new, save and load sit in the topbar, and cmd-s or ctrl-s saves without opening anything
// ———————————————————————————
const STORE_KEY = "demoland-editor-demos";
// the icons on each saved demo's actions, in the same flat 100x100 style as the rest of the interface
const ACT_ICONS = {
	open: '<svg viewBox="0 0 100 100"><path d="m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z"/></svg>',
	// the same pencil the file tabs use for renaming
	rename: '<svg viewBox="0 0 100 100"><path d="M59.07,12.65L16.64,55.08v28.27h28.29l42.43-42.42-28.29-28.28ZM40.79,73.36l-14.15-14.14L59.07,26.78l14.14,14.15-32.42,32.43Z"/></svg>',
	// the same trash can the console's clear button uses, for anything that actually deletes
	trash: '<svg viewBox="0 0 100 100"><polygon points="79.92 10 78.67 20 71.17 80 28.83 80 22.48 29.23 20.08 10 10 10 20 90 80 90 90 10 79.92 10"/><polygon points="67.34 30 68.59 20 31.41 20 32.66 30 67.34 30"/><polygon points="62.34 70 63.59 60 36.41 60 37.66 70 62.34 70"/><polygon points="66.09 40 33.91 40 35.16 50 64.84 50 66.09 40"/></svg>',
	// the tick that confirms a save
	check: '<svg viewBox="0 0 100 100"><polygon points="82.93 20 38.32 65.86 17.07 44.61 10 51.68 38.32 80 90 27.07 82.93 20"/></svg>',
	duplicate:
		'<svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg>',
	download:
		'<svg viewBox="0 0 100 100"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>',
	code: '<svg viewBox="0 0 100 100"><polygon points="90 50 70 70 62.93 62.93 75.86 50 62.93 37.07 70 30 90 50"/><polygon points="10 50 30 70 37.07 62.93 24.14 50 37.07 37.07 30 30 10 50"/><rect x="8.038" y="45" width="83.925" height="10" transform="translate(110.912 14.088) rotate(104.478)"/></svg>',
	erase: '<svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg>'
};
const NEW_DEMO_WARNING =
	"There are unsaved changes! Creating a new demo will erase your old code. Do you still want to create a new demo?";
const OPEN_DEMO_WARNING =
	"There are unsaved changes! Opening a demo will erase your old code. Do you still want to open a demo?";

let savedDemoName = "", // the name this demo was last saved under, empty until it has been saved once
	demoName = "", // what it is called right now, which is a proposed name until it has been saved
	savedState = ""; // the snapshot it was saved at, so an edit since then counts as unsaved

// the name shows in the info panel heading and in the topbar crumb
function setDemoName(name) {
	demoName = name;
	const heading = document.querySelector(".info-demo-title");
	if (heading) heading.textContent = name;
	const crumb = document.querySelector("#tb-demo .tb-name");
	if (crumb) crumb.textContent = name;
}

function storeRead() {
	try {
		const map = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
		return map && typeof map === "object" ? map : {};
	} catch (e) {
		return {}; // unreadable or blocked storage behaves like an empty shelf
	}
}
function storeWrite(map) {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(map));
		return true;
	} catch (e) {
		window.alert(
			"There wasn’t room to save this demo. Delete a saved demo, or remove some uploaded media, and try again."
		);
		return false;
	}
}

// what gets written to storage, and the yardstick for "has this changed since the last save"
function demoSnapshot() {
	if (files[activeFile]) files[activeFile].content = view.state.doc.toString();
	return JSON.stringify({
		info: infoMd,
		notes: collectNotes(),
		entry: previewEntry,
		files: files.map(function (f) {
			return { name: f.name, lang: f.lang, content: f.content, src: f.src || "" };
		})
	});
}
function demoUnsaved() {
	return demoSnapshot() !== savedState;
}
// "New Demo 1", then the first number that isn't taken
function nextDemoName() {
	const map = storeRead();
	let n = 1;
	while (map[`New Demo ${n}`]) n++;
	return `New Demo ${n}`;
}
// everything that follows the name a demo is saved under: its link in the address bar, and what clicking its name does
function syncDemoIdentity(name) {
	if (!standaloneMode) return;
	syncNameTips();
	const url = new URL(location.href);
	if (name) url.searchParams.set("demo", slugName(name));
	else url.searchParams.delete("demo");
	// window.history, not the bare name — codemirror's history() extension is imported under it
	window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
// the saved demo whose slug matches ?demo=, or empty if there is no match
function demoFromUrl() {
	const want = new URLSearchParams(location.search).get("demo");
	if (!want) return "";
	const map = storeRead();
	return (
		Object.keys(map).find(function (k) {
			return slugName(k) === slugName(want);
		}) || ""
	);
}

// the demo name says what clicking it will do, which depends on whether the demo has been saved yet
function syncNameTips() {
	if (!standaloneMode) return;
	const text = savedDemoName ? "Rename this demo" : "Save this demo";
	[document.getElementById("tb-demo"), document.querySelector(".info-demo-head")].forEach(function (el) {
		if (!el) return;
		el.title = text;
		el.setAttribute("data-tooltip", text);
	});
}

// a short "Demo saved!" bubble under the save button, for a save that skipped the dialog
let savedToastT = null;
function flashSaved() {
	const anchor = document.getElementById("tb-save");
	if (!anchor) return;
	let toast = document.getElementById("save-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "save-toast";
		toast.textContent = "Demo saved!";
		document.body.appendChild(toast);
	}
	const box = anchor.getBoundingClientRect();
	toast.style.top = `${box.bottom + 4}px`;
	toast.style.left = `${box.left}px`;
	toast.style.width = `${box.width}px`;
	toast.classList.add("show");
	clearTimeout(savedToastT);
	savedToastT = setTimeout(function () {
		toast.classList.remove("show");
	}, 2000);
}

function saveDemo(name) {
	const snap = JSON.parse(demoSnapshot());
	const map = storeRead();
	map[name] = {
		name: name,
		entry: snap.entry,
		files: snap.files,
		info: snap.info,
		notes: snap.notes,
		saved: Date.now()
	};
	if (!storeWrite(map)) return false;
	savedDemoName = name;
	setDemoName(name);
	syncDemoIdentity(name);
	savedState = demoSnapshot();
	setDirty(false);
	return true;
}
// swap the whole file list for another one, the same way loadDemo swaps in the baked one
function installDemo(list, entry, notes, info) {
	if (!list || !list.length) return;
	files = list.map(function (f) {
		return { name: f.name, lang: f.lang, content: f.content || "", src: f.src || "" };
	});
	demoEntry = entry && originalsHas(files, entry) ? entry : files[0].name;
	previewEntry = demoEntry;
	activeFile = Math.max(
		0,
		files.findIndex(function (f) {
			return f.name === demoEntry;
		})
	);
	states = files.map(function () {
		return null;
	});
	originals = {};
	files.forEach(function (f) {
		originals[f.name] = f.content;
	});
	infoMd = typeof info === "string" ? info : defaultInfoMd;
	allNotes = notes || []; // every file's state is rebuilt below, so this is what they seed from
	renderBrief();
	activateFile(activeFile);
	renderTabs();
	runLint();
	setDirty(false);
	render();
}
function openSavedDemo(name) {
	const rec = storeRead()[name];
	if (!rec || !rec.files || !rec.files.length) return;
	installDemo(rec.files, rec.entry, rec.notes, rec.info);
	savedDemoName = name;
	setDemoName(name);
	syncDemoIdentity(name);
	savedState = demoSnapshot();
}
function originalsHas(list, name) {
	return list.some(function (f) {
		return f.name === name;
	});
}
function newDemo() {
	if (demoUnsaved() && !window.confirm(NEW_DEMO_WARNING)) return;
	resetDemoFiles(false);
	setDemoName(nextDemoName());
	allNotes = [];
	infoMd = defaultInfoMd;
	renderBrief();
	savedDemoName = "";
	syncDemoIdentity("");
	savedState = demoSnapshot();
}

// ---- save dialog (built lazily, same shell as the file dialog) ----
let saveDlg = null;
function buildSaveDialog() {
	const overlay = document.createElement("div");
	overlay.id = "save-overlay";
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.style.setProperty("--accent", "var(--yellow)"); // saving and loading demos are yellow
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Save demo">
		<div class="dlg-head">${ACT_ICONS.open}<span>Save demo</span><button type="button" id="save-x" title="Close">${ACT_ICONS.erase}</button></div>
		<div class="dlg-body">
		<div class="dlg-field"><span class="dlg-label">Name</span><div>
			<input type="text" id="save-name" class="mf-text" autocomplete="off" spellcheck="false" placeholder="Name this demo">
			<div class="mf-hint" id="save-note"></div>
		</div></div>
		<div class="mf-error" id="save-err" hidden></div>
		</div>
		<div class="dlg-actions"><button type="button" class="ctrl" id="save-cancel">${ACT_ICONS.erase}<span>Cancel</span></button><button type="button" class="ctrl" id="save-ok">${ACT_ICONS.check}<span>Save demo</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	saveDlg = overlay;
	overlay.querySelector("#save-x").onclick = closeSaveDialog;
	overlay.querySelector("#save-cancel").onclick = closeSaveDialog;
	overlay.querySelector("#save-ok").onclick = commitSave;
	overlay.querySelector("#save-name").addEventListener("input", syncSaveNote);
	overlay.querySelector("#save-name").addEventListener("keydown", function (e) {
		if (e.key === "Enter") commitSave();
		if (e.key === "Escape") closeSaveDialog();
	});
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeSaveDialog();
	});
}
// say plainly whether this name is free or already taken, since saving over a demo replaces it
function syncSaveNote() {
	const value = saveDlg.querySelector("#save-name").value.trim();
	const note = saveDlg.querySelector("#save-note");
	const map = storeRead();
	if (!value) note.textContent = "Give this demo a name!";
	else if (map[value])
		note.textContent = `WARNING: You already have a demo called “${value}”. Saving will replace it!`;
	else
		note.textContent =
			"Give this demo a name! Enter a new name save a new demo, or enter an existing name to replace an old demo. Demos are saved in this browser.";
}
function commitSave() {
	const input = saveDlg.querySelector("#save-name");
	const err = saveDlg.querySelector("#save-err");
	const name = input.value.trim();
	if (!name) {
		err.textContent = "Give this demo a name.";
		err.hidden = false;
		input.focus();
		return;
	}
	if (saveDemo(name)) closeSaveDialog();
}
function closeSaveDialog() {
	if (saveDlg) saveDlg.hidden = true;
}
function openSaveDialog() {
	if (!saveDlg) buildSaveDialog();
	const input = saveDlg.querySelector("#save-name");
	// a demo that has been saved before comes back with its own name filled in
	input.value = demoName || nextDemoName();
	syncSaveNote();
	saveDlg.querySelector("#save-err").hidden = true;
	saveDlg.hidden = false;
	input.focus();
	input.select();
}

// ---- rename dialog ----
// used from the demo name in the topbar and the info panel, and from the load list, where it hands back afterwards
let renameDlg = null,
	renameFor = "",
	renameBack = null;
function buildRenameDialog() {
	const overlay = document.createElement("div");
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.style.setProperty("--accent", "var(--yellow)");
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Rename demo">
		<div class="dlg-head">${ACT_ICONS.rename}<span>Rename demo</span><button type="button" id="rename-x" title="Close">${ACT_ICONS.erase}</button></div>
		<div class="dlg-body">
		<div class="dlg-field"><span class="dlg-label">Name</span><div>
			<input type="text" id="rename-name" class="mf-text" autocomplete="off" spellcheck="false" placeholder="Name this demo">
			<div class="mf-hint" id="rename-note"></div>
		</div></div>
		</div>
		<div class="dlg-actions"><button type="button" class="ctrl" id="rename-cancel">${ACT_ICONS.erase}<span>Cancel</span></button><button type="button" class="ctrl" id="rename-ok">${ACT_ICONS.check}<span>Rename</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	renameDlg = overlay;
	overlay.querySelector("#rename-x").onclick = cancelRename;
	overlay.querySelector("#rename-cancel").onclick = cancelRename;
	overlay.querySelector("#rename-ok").onclick = commitRename;
	overlay.querySelector("#rename-name").addEventListener("input", syncRenameNote);
	overlay.querySelector("#rename-name").addEventListener("keydown", function (e) {
		if (e.key === "Enter") commitRename();
		if (e.key === "Escape") cancelRename();
	});
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) cancelRename();
	});
}
// say plainly whether this name is taken, since saving over a demo replaces it
function syncRenameNote() {
	const value = renameDlg.querySelector("#rename-name").value.trim();
	const note = renameDlg.querySelector("#rename-note");
	const map = storeRead();
	if (!value) note.textContent = "Give this demo a name!";
	else if (value === renameFor) note.textContent = "This is the demo’s current name.";
	else if (map[value]) note.textContent = `You already have a demo called “${value}”. Renaming will replace it.`;
	else note.textContent = "This name is valid! No other saved demo has this name.";
}
function closeRenameDialog() {
	if (renameDlg) renameDlg.hidden = true;
}
function cancelRename() {
	closeRenameDialog();
	if (renameBack) renameBack();
}
function commitRename() {
	const next = renameDlg.querySelector("#rename-name").value.trim();
	if (!next) return;
	if (next !== renameFor) {
		const map = storeRead();
		if (map[renameFor]) {
			map[next] = Object.assign({}, map[renameFor], { name: next });
			delete map[renameFor];
			storeWrite(map);
		}
		// the open demo follows its own name, whether or not it has been saved yet
		if (savedDemoName === renameFor) {
			savedDemoName = next;
			syncDemoIdentity(next);
		}
		if (demoName === renameFor) setDemoName(next);
	}
	cancelRename();
}
function openRenameDialog(target, back) {
	if (!renameDlg) buildRenameDialog();
	renameFor = target;
	renameBack = back || null;
	const input = renameDlg.querySelector("#rename-name");
	input.value = target;
	syncRenameNote();
	renameDlg.hidden = false;
	input.focus();
	input.select();
}

// every saved demo in one zip, a .demo file each — media rides along inside them as data urls
function downloadAllDemos() {
	const map = storeRead();
	const names = Object.keys(map);
	if (!names.length) return;
	const taken = {};
	const entries = names.map(function (name) {
		const rec = map[name];
		let base = slugName(name);
		// two demos can slug to the same thing, so the second one gets a number
		if (taken[base]) base = `${base}-${taken[base]++}`;
		else taken[base] = 2;
		return {
			name: `${base}.demo`,
			bytes: strBytes(toDemoFile(rec.files || [], rec.notes || [], rec.info || ""))
		};
	});
	const url = URL.createObjectURL(makeZip(entries));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "demos.zip";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(function () {
		URL.revokeObjectURL(url);
	}, 1000);
}
// wipe the whole store, after saying plainly how much is about to go
function eraseAllDemos() {
	const map = storeRead();
	const n = Object.keys(map).length;
	if (!n) return;
	if (!window.confirm(`Erase all ${n} saved demo${n === 1 ? "" : "s"}? This can't be undone.`)) return;
	storeWrite({});
	// nothing is saved any more, so the open demo has to ask for a name again
	savedDemoName = "";
	syncDemoIdentity("");
	renderLoadList();
}

// ---- load dialog ----
let loadDlg = null;
function buildLoadDialog() {
	const overlay = document.createElement("div");
	overlay.id = "load-overlay";
	overlay.className = "mf-overlay";
	overlay.hidden = true;
	overlay.style.setProperty("--accent", "var(--yellow)");
	overlay.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="Load demo">
		<div class="dlg-head">${FOLDER_ICON}<span>Load demo</span><button type="button" id="load-x" title="Close">${ACT_ICONS.erase}</button></div>
		<div class="dlg-body"><div class="demo-list" id="load-list"></div></div>
		<div class="dlg-actions" id="load-all"><button type="button" class="ctrl" id="load-download-all">${ACT_ICONS.download}<span>Download all demos</span></button><button type="button" class="ctrl" id="load-erase-all">${ACT_ICONS.trash}<span>Erase all demos</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	loadDlg = overlay;
	overlay.querySelector("#load-x").onclick = closeLoadDialog;
	overlay.querySelector("#load-download-all").onclick = downloadAllDemos;
	overlay.querySelector("#load-erase-all").onclick = eraseAllDemos;
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeLoadDialog();
	});
	// the list is the whole dialog, so escape is what closes it besides the x
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && !overlay.hidden) closeLoadDialog();
	});
	overlay.querySelector("#load-list").addEventListener("click", function (e) {
		const row = e.target.closest("[data-demo]");
		if (!row) return;
		const name = row.getAttribute("data-demo");
		const button = e.target.closest("[data-act]");
		// the row itself opens the demo; the buttons along its bottom do everything else
		const act = button ? button.getAttribute("data-act") : "open";
		if (act === "open") {
			closeLoadDialog();
			openSavedDemo(name);
			return;
		}
		const map = storeRead();
		if (!map[name]) return;
		if (act === "download") {
			zipDemo(
				map[name].files,
				slugName(name),
				toDemoFile(map[name].files, map[name].notes || [], map[name].info || "")
			);
			return;
		}
		if (act === "rename") {
			closeLoadDialog();
			openRenameDialog(name, function () {
				renderLoadList();
				loadDlg.hidden = false;
			});
			return;
		}
		if (act === "duplicate") {
			let copy = `${name} copy`;
			let n = 2;
			while (map[copy]) copy = `${name} copy ${n++}`; // never quietly write over an existing copy
			map[copy] = Object.assign({}, map[name], { name: copy, saved: Date.now() });
			storeWrite(map);
		}
		if (act === "erase") {
			if (!window.confirm(`Erase “${name}”? This can’t be undone.`)) return;
			delete map[name];
			// the demo it was saved as is gone, so the next save has to ask for a name again
			if (savedDemoName === name) {
				savedDemoName = "";
				syncDemoIdentity("");
			}
			storeWrite(map);
		}
		renderLoadList();
	});
}
function closeLoadDialog() {
	if (loadDlg) loadDlg.hidden = true;
}
// the day and time a demo was last saved
function savedStamp(ms) {
	const d = new Date(ms || 0);
	const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
	return `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
// the five actions along the bottom of every saved demo, three to a row
function loadActions() {
	return `<div class="demo-acts">${[
		["open", "Open", "open"],
		["rename", "Rename", "rename"],
		["duplicate", "Duplicate", "duplicate"],
		["download", "Download", "download"],
		["erase", "Erase", "trash"]
	]
		.map(function (a) {
			return `<button type="button" class="ctrl" data-act="${a[0]}" title="${a[1]}">${ACT_ICONS[a[2]]}<span>${a[1]}</span></button>`;
		})
		.join("")}</div>`;
}
function renderLoadList() {
	const map = storeRead();
	// most recently saved first
	const list = Object.keys(map)
		.map(function (k) {
			return map[k];
		})
		.sort(function (a, b) {
			return (b.saved || 0) - (a.saved || 0);
		});
	loadDlg.querySelector("#load-list").innerHTML = list.length
		? list
				.map(function (rec) {
					const names = (rec.files || []).map(function (f) {
						return escHtml(f.name);
					});
					return `<div class="demo-item" data-demo="${escHtml(rec.name)}"><span class="demo-name">${escHtml(rec.name)}</span><span class="demo-date">${savedStamp(rec.saved)}</span><span class="demo-filelist">${names.length} file${names.length === 1 ? "" : "s"} · ${names.join(", ")}</span>${loadActions()}</div>`;
				})
				.join("")
		: '<div class="demo-empty">You haven’t saved any demos yet! Write some code, and then click “Save Demo” to add to this list.</div>';
	loadDlg.querySelector("#load-all").hidden = !list.length;
}
function openLoadDialog() {
	if (demoUnsaved() && !window.confirm(OPEN_DEMO_WARNING)) return;
	if (!loadDlg) buildLoadDialog();
	renderLoadList();
	loadDlg.hidden = false;
}

if (standaloneMode) {
	const baked = document.getElementById("demo-info-md");
	defaultInfoMd = baked ? baked.value : "";
	infoMd = defaultInfoMd;
	renderBrief();
	const newBtn = document.getElementById("tb-new");
	if (newBtn) newBtn.onclick = newDemo;
	const saveBtn = document.getElementById("tb-save");
	if (saveBtn)
		saveBtn.onclick = function () {
			if (savedDemoName) {
				if (saveDemo(savedDemoName)) flashSaved();
			} else openSaveDialog();
		};
	const loadBtn = document.getElementById("tb-load");
	if (loadBtn) loadBtn.onclick = openLoadDialog;
	setDemoName(nextDemoName());
	// the demo's name is the affordance wherever it shows: it names a demo that has never been saved, and renames one that has
	const nameHere = function () {
		if (savedDemoName) openRenameDialog(demoName, null);
		else openSaveDialog();
	};
	const crumb = document.getElementById("tb-demo");
	if (crumb) crumb.onclick = nameHere;
	// the whole header block is the target, not just the title line
	const heading = document.querySelector(".info-demo-head");
	if (heading) {
		heading.onclick = nameHere;
		heading.setAttribute("data-tooltip-side", "bottom");
		heading.setAttribute("role", "button");
		heading.setAttribute("tabindex", "0");
		heading.addEventListener("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				nameHere();
			}
		});
	}
	syncNameTips();
	// the toolbar drops to short labels once the layout goes mobile, at the same width the topbar collapses
	const TB_LABELS = {
		"tb-new": ["New Demo", "New"],
		"tb-save": ["Save Demo", "Save"],
		"tb-load": ["Load Demo", "Load"],
		"tb-download": ["Download Demo", "Download"]
	};
	const narrow = window.matchMedia("(max-width: 800px)");
	function syncToolbarLabels() {
		Object.keys(TB_LABELS).forEach(function (id) {
			const el = document.getElementById(id);
			const label = el && el.querySelector("span");
			if (label) label.textContent = TB_LABELS[id][narrow.matches ? 1 : 0];
		});
	}
	syncToolbarLabels();
	if (narrow.addEventListener) narrow.addEventListener("change", syncToolbarLabels);
	else narrow.addListener(syncToolbarLabels);
	// cmd-s / ctrl-s saves straight over the demo's own name, or opens the dialog if it has never been saved
	window.addEventListener("keydown", function (e) {
		if ((e.key !== "s" && e.key !== "S") || !(e.metaKey || e.ctrlKey) || e.altKey) return;
		e.preventDefault();
		if (savedDemoName) {
			if (saveDemo(savedDemoName)) flashSaved();
		} else openSaveDialog();
	});
	document.addEventListener("keydown", function (e) {
		if (e.key !== "Escape") return;
		closeSaveDialog();
		closeLoadDialog();
		closeShortcodes();
		closeRenameDialog();
	});
}

if (!embedMode) initPanels(); // embed layout is CSS-driven, no JS sizing model
loadDemo(); // synchronous: renders the baked demo immediately
if (standaloneMode) savedState = demoSnapshot(); // the blank starter counts as saved, so an untouched page isn't "unsaved"
// a ?demo=<slug> in the address bar opens that saved demo, once the baked starter is in place for it to replace
if (standaloneMode) {
	const linked = demoFromUrl();
	if (linked) openSavedDemo(linked);
}
window.__cmReady = true;
requestAnimationFrame(function () {
	document.body.classList.add("ready");
});
