// ———————————————————————————
// DEV PAGE
// the site manager on /dev/: every demo on the site, by book and chapter, opened from and saved back to its own .demo file. it only does anything with `node dev.mjs` running (see dev.mjs), and only /dev/ ever loads it
// collection.json is the shape of the whole site; the tree held here is a working copy of it. every change edits the copy and sends the whole thing back, which the server writes and rebuilds from — then the list is redrawn from what's on disk, not from what we hoped we wrote
// a draft is a .demo in demos/drafts/ that collection.json doesn't point at, so the build never sees it. it joins the site by being dragged into a chapter, and a demo dragged back to the drafts leaves the site
// files look after themselves: every time collection.json is saved, dev.mjs moves each demo (and its media folder) to demos/<book>/<chapter>/<demo>.demo, so this side only ever changes the collection and follows the open demo to wherever it went
// ———————————————————————————
let api = null;

let collection = null; // the working copy of collection.json
let demos = {}; // every .demo under demos/: file -> { modified, bytes, title, files }
let drafts = []; // the draft files, newest first
let connected = false;
let current = null; // the file the open demo saves to, or null for a demo that hasn't been saved anywhere yet

const DRAFTS = "demos/drafts";
// the blank editor's starting demo, which /editor/ and new demos are made from
const TEMPLATE = "demos/template.demo";
const PALETTE = ["pink", "green", "blue", "yellow", "purple", "red"];
const RECENT_COUNT = 10;
// folders a book id would collide with: source folders, and pages the build makes outside any book
const RESERVED = ["assets", "demos", "lib", "parts", "editor", "dev", "info", "node_modules", "_dev"];

// which books are folded shut, remembered between visits
let folded = new Set();
// what's typed in the manager's search box
let query = "";
try {
	folded = new Set(JSON.parse(localStorage.getItem("dev-folded") || "[]"));
} catch (e) {}
function rememberFolded() {
	try {
		localStorage.setItem("dev-folded", JSON.stringify(Array.from(folded)));
	} catch (e) {}
}

// ———————————————————————————
// SMALL THINGS
// ———————————————————————————
// the editor's escape, plus quotes, since a lot of what's escaped here lands in attributes
function esc(s) {
	return api
		.escHtml(s == null ? "" : String(s))
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
// a slug ends up in a url and a folder name, so it's held to what both can carry
function slugify(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
// "x", then "x-2", "x-3" … until nothing in `taken` has it
function uniqueId(base, taken) {
	const root = slugify(base) || "untitled";
	let id = root;
	let n = 2;
	while (taken.indexOf(id) >= 0) id = `${root}-${n++}`;
	return id;
}
function baseOf(path) {
	return path.replace(/^.*\//, "");
}
// a file name back to something readable, for a draft that doesn't carry a TITLE
function nameFromFile(path) {
	return baseOf(path)
		.replace(/\.demo$/i, "")
		.replace(/[-_]+/g, " ")
		.trim();
}
// how long ago, in the fewest words that are still useful
function ago(ms) {
	const s = Math.max(0, (Date.now() - ms) / 1000);
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
	if (s < 86400 * 7) return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? "" : "s"} ago`;
	return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
// a .demo's TITLE swapped for a new one without touching any other line — note line numbers count from the top of the file, so the title is replaced in place, or added at the very end where it can't move anything
function setTitleInText(text, title) {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const at = lines.findIndex(function (l) {
		return /^===\s*TITLE\s*===\s*$/i.test(l);
	});
	if (at >= 0) {
		let j = at + 1;
		while (j < lines.length && lines[j].trim() === "" && !/^===/.test(lines[j])) j++;
		if (j < lines.length && !/^===/.test(lines[j])) lines[j] = title;
		else lines.splice(at + 1, 0, title);
		return lines.join("\n");
	}
	return `${text.replace(/\n*$/, "")}\n=== TITLE ===\n${title}\n`;
}

// ———————————————————————————
// TALKING TO THE SERVER
// ———————————————————————————
async function post(url, body) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	return response.json();
}
async function refresh() {
	try {
		const result = await (await fetch("/_dev/status", { cache: "no-store" })).json();
		connected = !!result.writing;
		collection = result.collection;
		demos = result.demos || {};
		drafts = result.drafts || [];
		if (result.message) note(result.message, true);
	} catch (e) {
		connected = false;
	}
	render();
	syncLocation();
}
function lostServer() {
	connected = false;
	note("Lost the dev server ~ is `node dev.mjs` still running?", true);
	render();
}
// the whole tree goes back at once and the site is rebuilt from it — everything that changes the site's shape ends here, so this is where a failure has to be reported honestly
async function saveCollection(message) {
	note(`${message || "Saving"}…`);
	let result;
	try {
		result = await post("/_dev/collection", { collection: collection });
	} catch (e) {
		lostServer();
		return false;
	}
	if (result.ok && result.moved) follow(result.moved);
	if (!result.ok) note(result.message || "collection.json wasn’t saved", true);
	else if (result.built) note(`${message || "Saved"} ~ site rebuilt in ${(result.ms / 1000).toFixed(1)}s`);
	else note(`Saved, but the build failed ~ ${result.message}`, true);
	await refresh();
	return !!result.ok;
}
// the open demo moved on disk: keep saving to it where it is now, with its media paths pointing at its media's new folder — which doesn't count as an edit
function follow(moved) {
	if (!current || !moved[current]) return;
	const to = moved[current];
	const edited = api.unsaved();
	api.rebaseMedia(current.replace(/\.demo$/i, ""), to.replace(/\.demo$/i, ""));
	if (!edited) api.markSaved();
	current = to;
	syncLocation();
}
async function fileAction(action, path, to) {
	let result;
	try {
		result = await post("/_dev/file", { action: action, path: path, to: to });
	} catch (e) {
		lostServer();
		return null;
	}
	if (!result.ok) {
		note(result.message || `Couldn’t ${action} ${path}`, true);
		return null;
	}
	if (action === "rename") follow({ [path]: result.path });
	return result;
}
// write a .demo; `create` asks for a new file that never replaces one, and the path it actually landed on comes back
async function writeDemo(path, text, create) {
	let result;
	try {
		result = await post("/_dev/save", { path: path, text: text, create: !!create });
	} catch (e) {
		lostServer();
		return null;
	}
	if (!result.ok) {
		note(result.message || `Couldn’t save ${path}`, true);
		return null;
	}
	return result;
}
async function readDemo(path) {
	const response = await fetch(`/${path}`, { cache: "no-store" });
	if (!response.ok) throw new Error(`${path} isn’t there`);
	return response.text();
}

// ———————————————————————————
// WHERE THINGS ARE
// an address is { b, c, d }: which book, which chapter in it, which demo in that — as far down as the thing goes. it travels through drag and drop as text, so it's only numbers
// ———————————————————————————
function books() {
	return (collection && collection.books) || [];
}
function bookAt(at) {
	return books()[at.b];
}
function chapterAt(at) {
	return bookAt(at).chapters[at.c];
}
function demoAt(at) {
	return chapterAt(at).demos[at.d];
}
function findDemo(file) {
	const list = books();
	for (let b = 0; b < list.length; b++) {
		const chapters = list[b].chapters || [];
		for (let c = 0; c < chapters.length; c++) {
			const items = chapters[c].demos || [];
			for (let d = 0; d < items.length; d++) if (items[d].file === file) return { b: b, c: c, d: d };
		}
	}
	return null;
}
// position among the items that are listed on the site, which is what the site numbers and colours by; an unlisted one falls back to its place in the full list
function shownIndex(list, item) {
	const shown = list.filter(function (x) {
		return !x.hidden;
	});
	const i = shown.indexOf(item);
	return i >= 0 ? i : list.indexOf(item);
}
// colours follow the site's own rules: books cycle the palette by their order, chapters by their order inside their book, and a demo takes its chapter's colour
function bookColor(b) {
	return `var(--${PALETTE[b % PALETTE.length]})`;
}
function chapterColor(at) {
	const chapters = bookAt(at).chapters;
	return `var(--${PALETTE[shownIndex(chapters, chapters[at.c]) % PALETTE.length]})`;
}
function demoNumber(at) {
	const chapter = chapterAt(at);
	const item = demoAt(at);
	if (bookAt(at).hidden || chapter.hidden || item.hidden) return "–";
	return `${shownIndex(bookAt(at).chapters, chapter) + 1}.${shownIndex(chapter.demos, item) + 1}`;
}
// the page a thing is built to
function pageFor(at) {
	const book = bookAt(at);
	if (at.c == null) return `/${book.id}/`;
	if (at.d == null) return `/${book.id}/${chapterAt(at).id}/`;
	return `/${book.id}/${chapterAt(at).id}/${demoAt(at).id}.html`;
}
// what a demo is called: its entry in the collection, or for a draft its TITLE, or its file name
function nameOf(file) {
	if (file === TEMPLATE) return "Blank editor template";
	const at = findDemo(file);
	if (at) return demoAt(at).title || nameFromFile(file);
	return (demos[file] && demos[file].title) || nameFromFile(file);
}
// where a demo with this address belongs — dev.mjs moves files here whenever the collection is saved, so a new file can start here too
function homeFor(b, c, id) {
	return `demos/${books()[b].id}/${books()[b].chapters[c].id}/${id}.demo`;
}

// ———————————————————————————
// THE OPEN DEMO
// ———————————————————————————
// the editor's frame follows what's open: the accent takes the demo's chapter colour, the book and chapter crumbs show where it lives, the info bubble its number, and the address bar remembers it for a reload
function syncLocation() {
	const at = current ? findDemo(current) : null;
	const root = document.documentElement;
	root.style.setProperty("--accent", at ? chapterColor(at) : "var(--off-white)");
	document.getElementById("shell").classList.toggle("dev-placed", !!at);
	const crumb = function (id, kind, name) {
		const el = document.getElementById(id);
		if (!el) return;
		el.querySelector(".tb-kind-text").textContent = kind;
		el.querySelector(".tb-name").textContent = name;
	};
	if (at) {
		crumb("tb-book", bookAt(at).mediaType || "Book", bookAt(at).title);
		crumb("tb-chapter", `Chapter ${shownIndex(bookAt(at).chapters, chapterAt(at)) + 1}`, chapterAt(at).title);
	}
	const bubble = document.querySelector(".info-demo-num span");
	const label = at ? `Demo ${demoNumber(at)}` : current === TEMPLATE ? "Template" : current ? "Draft" : "";
	if (bubble) bubble.textContent = label || "Unsaved demo";
	const kind = document.querySelector("#tb-demo .tb-kind-text");
	if (kind) kind.textContent = label || "Demo";
	const url = new URL(location.href);
	if (current) url.searchParams.set("file", current);
	else url.searchParams.delete("file");
	window.history.replaceState(null, "", url.pathname + url.search + url.hash);
	document.title = `${api.name()} \\ Dev`;
}
async function openFile(file) {
	if (api.unsaved() && !window.confirm("There are unsaved changes! Opening a demo will erase them. Open it anyway?"))
		return false;
	let text;
	try {
		text = await readDemo(file);
	} catch (e) {
		note(e.message, true);
		return false;
	}
	api.openText(text, nameOf(file));
	current = file;
	syncLocation();
	closeManager();
	return true;
}
async function saveCurrent() {
	if (!connected) {
		note("The dev server isn’t running, so there’s nowhere to save to.", true);
		return;
	}
	const name = api.name();
	// a demo that's never been saved becomes a draft
	if (!current) {
		const made = await writeDemo(`${DRAFTS}/${slugify(name) || "new-demo"}.demo`, api.currentText(name), true);
		if (!made) return;
		current = made.path;
		api.relinkMedia(made.media || {});
		api.markSaved();
		note("Saved to drafts");
		await refresh();
		return;
	}
	note("Saving…");
	// the template carries no TITLE — the blank editor names each new demo itself
	const result = await writeDemo(current, api.currentText(current === TEMPLATE ? "" : name), false);
	if (!result) return;
	api.relinkMedia(result.media || {});
	api.markSaved();
	if (result.built) note(`Saved ~ site rebuilt in ${(result.ms / 1000).toFixed(1)}s`);
	else if (result.message) note(`Saved, but the build failed ~ ${result.message}`, true);
	else note(findDemo(current) || current === TEMPLATE ? "Saved" : "Saved to drafts");
	await refresh();
}

// ———————————————————————————
// MAKING THINGS
// ———————————————————————————
// "New Demo", then the first number no draft is using
function nextDraftName() {
	const taken = drafts.map(nameOf);
	if (taken.indexOf("New Demo") < 0) return "New Demo";
	let n = 2;
	while (taken.indexOf(`New Demo ${n}`) >= 0) n++;
	return `New Demo ${n}`;
}
async function newDraft() {
	if (api.unsaved() && !window.confirm("There are unsaved changes! A new demo will erase them. Make one anyway?"))
		return;
	const name = nextDraftName();
	const made = await writeDemo(`${DRAFTS}/${slugify(name)}.demo`, api.templateText(name), true);
	if (!made) return;
	await refresh();
	api.openText(api.templateText(name), name); // the file was just written from this, so there's no need to read it back
	current = made.path;
	syncLocation();
	closeManager();
}
async function newDemoIn(at) {
	if (api.unsaved() && !window.confirm("There are unsaved changes! A new demo will erase them. Make one anyway?"))
		return;
	const chapter = chapterAt(at);
	const id = uniqueId(
		"new-demo",
		chapter.demos.map((x) => x.id)
	);
	const name = "New Demo";
	const made = await writeDemo(homeFor(at.b, at.c, id), api.templateText(name), true);
	if (!made) return;
	chapter.demos.push({ id: id, title: name, file: made.path });
	if (!(await saveCollection(`Added “${name}” to ${chapter.title}`))) return;
	api.openText(api.templateText(name), name);
	current = made.path;
	syncLocation();
	closeManager();
}
async function newChapterIn(b) {
	const book = books()[b];
	const title = "New chapter";
	book.chapters = book.chapters || [];
	// new chapters and books start off the site's menus, so a half-made one doesn't show up on the live site
	book.chapters.push({
		id: uniqueId(
			title,
			book.chapters.map((x) => x.id)
		),
		title: title,
		description: "",
		hidden: true,
		demos: []
	});
	folded.delete(book.id);
	if (await saveCollection(`Added a chapter to ${book.title}`)) openSettings({ b: b, c: book.chapters.length - 1 });
}
async function newBook() {
	const title = "New book";
	const list = books();
	list.push({
		id: uniqueId(title, list.map((x) => x.id).concat(RESERVED)),
		title: title,
		mediaType: "Book",
		description: "",
		hidden: true,
		chapters: []
	});
	if (await saveCollection("Added a book")) openSettings({ b: list.length - 1 });
}

// ———————————————————————————
// CHANGING DEMOS
// ———————————————————————————
async function duplicateDemo(file) {
	const at = findDemo(file);
	const title = `${nameOf(file)} copy`;
	const id = at
		? uniqueId(
				`${demoAt(at).id}-copy`,
				chapterAt(at).demos.map((x) => x.id)
			)
		: null;
	const copied = await fileAction(
		"duplicate",
		file,
		at ? homeFor(at.b, at.c, id) : `${DRAFTS}/${slugify(title)}.demo`
	);
	if (!copied) return;
	// a copy whose file carries a TITLE takes the new name there too, so it doesn't read as the original
	let text = await readDemo(copied.path);
	if (/^===\s*TITLE\s*===\s*$/im.test(text) || !at) {
		text = setTitleInText(text, title);
		await writeDemo(copied.path, text, false);
	}
	if (at) {
		const chapter = chapterAt(at);
		chapter.demos.splice(at.d + 1, 0, { id: id, title: title, file: copied.path });
		await saveCollection(`Duplicated “${nameOf(file)}”`);
	} else {
		note(`Duplicated “${nameOf(file)}”`);
		await refresh();
	}
}
async function deleteDemo(file) {
	const name = nameOf(file);
	if (
		!window.confirm(
			`Delete “${name}”? Its file (${file}) is deleted too. This can’t be undone here, though git still has it.`
		)
	)
		return;
	const at = findDemo(file);
	if (at) {
		chapterAt(at).demos.splice(at.d, 1);
		if (!(await saveCollection(`Deleted “${name}”`))) return;
	}
	if (!(await fileAction("delete", file))) return;
	// the editor keeps what was open, but it no longer has a file to save to
	if (current === file) current = null;
	note(`Deleted “${name}”`);
	await refresh();
}
async function downloadDemo(file) {
	let text;
	try {
		text = await readDemo(file);
	} catch (e) {
		note(e.message, true);
		return;
	}
	const parsed = api.parseDemoFile(text);
	const name = nameOf(file);
	// written out again so the download carries every setting, the same as one from the blank editor
	const full = api.toDemoFile(parsed.files, parsed.notes, parsed.info, {
		title: name,
		config: parsed.config,
		single: parsed.single
	});
	api.zipDemo(parsed.files, api.slugName(name), full);
}

// ———————————————————————————
// MOVING THINGS
// these only change the collection: saving it moves the files to match (see dev.mjs). the one exception is a demo leaving the site, which the collection can't say — that file is moved into demos/drafts/ here
// ———————————————————————————
function moveBook(from, to) {
	const list = books();
	const [book] = list.splice(from, 1);
	list.splice(to > from ? to - 1 : to, 0, book);
	return saveCollection(`Moved ${book.title}`);
}
function moveChapter(from, toBook, toIndex) {
	const source = bookAt(from).chapters;
	const [chapter] = source.splice(from.c, 1);
	const target = books()[toBook];
	target.chapters = target.chapters || [];
	let index = toIndex;
	if (toBook === from.b && toIndex > from.c) index--;
	// a chapter id only has to be unique inside its book, so one moving books may need a new one
	chapter.id = uniqueId(
		chapter.id,
		target.chapters.map((x) => x.id)
	);
	target.chapters.splice(index, 0, chapter);
	folded.delete(target.id);
	return saveCollection(`Moved ${chapter.title}`);
}
function moveDemo(from, to) {
	const source = chapterAt(from).demos;
	const [item] = source.splice(from.d, 1);
	const target = chapterAt(to).demos;
	let index = to.d;
	if (to.b === from.b && to.c === from.c && to.d > from.d) index--;
	if (!(to.b === from.b && to.c === from.c))
		item.id = uniqueId(
			item.id,
			target.map((x) => x.id)
		);
	target.splice(index, 0, item);
	return saveCollection(`Moved “${item.title}”`);
}
// a draft into a chapter: the chapter gets an entry pointing at the draft's file, and saving moves the file in
async function placeDraft(file, to) {
	const chapter = chapterAt(to);
	const name = nameOf(file);
	const id = uniqueId(
		name,
		chapter.demos.map((x) => x.id)
	);
	chapter.demos.splice(to.d, 0, { id: id, title: name, file: file });
	await saveCollection(`Added “${name}” to ${chapter.title}`);
}
// a demo out of the site and back into the drafts. the collection is what knew its name, so the name goes into the file first
async function unplaceDemo(from) {
	const item = demoAt(from);
	let text;
	try {
		text = await readDemo(item.file);
	} catch (e) {
		note(e.message, true);
		return;
	}
	if (!(await writeDemo(item.file, setTitleInText(text, item.title), false))) return;
	const moved = await fileAction("rename", item.file, `${DRAFTS}/${slugify(item.title) || baseOf(item.file)}.demo`);
	if (!moved) return;
	chapterAt(from).demos.splice(from.d, 1);
	await saveCollection(`Moved “${item.title}” to drafts`);
}

// ———————————————————————————
// THE MANAGER
// one wide dialog: recently edited, then drafts, then every book. it's the load screen — "Load Demo" in the topbar opens it, and /dev/ opens it on arrival
// ———————————————————————————
let overlay = null;
let list = null;
let status = null;

function buildManager() {
	overlay = document.createElement("div");
	overlay.className = "mf-overlay";
	overlay.id = "dev-overlay";
	overlay.hidden = true;
	overlay.innerHTML = `<div class="mf-dialog dev-dialog" role="dialog" aria-modal="true" aria-label="All demos">
		<div class="dlg-head">${api.folderIcon}<span>All demos</span><button type="button" id="dev-reload" title="Reload from disk" data-tooltip="Reload from disk">${RELOAD_ICON}</button><button type="button" id="dev-x" title="Close">${api.icons.erase}</button></div>
		<div class="dev-search"><input type="search" id="dev-search" class="mf-text" placeholder="Search demos, chapters and books" autocomplete="off" spellcheck="false"></div>
		<div class="dev-list" id="dev-list"></div>
		<div class="dev-foot"><span class="dev-status" id="dev-status"></span><button type="button" class="ctrl" id="dev-new-book">${api.icons.duplicate}<span>New book</span></button><button type="button" class="ctrl" id="dev-build">${RELOAD_ICON}<span>Rebuild site</span></button></div>
		</div>`;
	document.body.appendChild(overlay);
	list = overlay.querySelector("#dev-list");
	status = overlay.querySelector("#dev-status");
	overlay.querySelector("#dev-x").onclick = closeManager;
	overlay.querySelector("#dev-reload").onclick = refresh;
	overlay.querySelector("#dev-new-book").onclick = newBook;
	overlay.querySelector("#dev-build").onclick = async function () {
		note("Rebuilding…");
		try {
			const result = await post("/_dev/build", {});
			note(
				result.ok
					? `Site rebuilt in ${(result.ms / 1000).toFixed(1)}s`
					: `The build failed ~ ${result.message}`,
				!result.ok
			);
		} catch (e) {
			lostServer();
		}
	};
	overlay.addEventListener("mousedown", function (e) {
		if (e.target === overlay) closeManager();
	});
	list.addEventListener("click", onListClick);
	const search = overlay.querySelector("#dev-search");
	search.addEventListener("input", function () {
		query = search.value;
		render();
		list.scrollTop = 0;
	});
	search.addEventListener("keydown", function (e) {
		// escape clears a search before it closes anything; enter opens the first demo that matches
		if (e.key === "Escape" && search.value) {
			e.stopPropagation();
			search.value = query = "";
			render();
		}
		if (e.key === "Enter") {
			const first = list.querySelector(".dev-demo[data-file]");
			if (first) openFile(first.getAttribute("data-file"));
		}
	});
	wireDrag();
}
function openManager() {
	if (!overlay) buildManager();
	overlay.hidden = false;
	const search = overlay.querySelector("#dev-search");
	search.focus();
	search.select();
	refresh();
}
function closeManager() {
	if (overlay) overlay.hidden = true;
}

const RELOAD_ICON =
	'<svg viewBox="0 0 100 100"><path d="M50.9,85.23h-.32v-8.96c.11.01.21.01.32.01,14.83,0,26.86-12.03,26.86-26.86,0-7.23-2.87-13.8-7.53-18.63v12.26h-10V14.77h28.29v9.99h-11.67c6.1,6.43,9.86,15.11,9.86,24.66,0,19.78-16.04,35.81-35.81,35.81ZM14.45,50.58c0,9.55,3.76,18.23,9.86,24.66h-11.67v9.99h28.29v-28.28h-10v12.26c-4.66-4.83-7.53-11.4-7.53-18.63,0-14.83,12.03-26.86,26.86-26.86.11,0,.21,0,.32.01v-8.96h-.32c-19.77,0-35.81,16.03-35.81,35.81ZM50,50"/></svg>';
const CHEVRON_ICON =
	'<svg viewBox="0 0 100 100"><polygon points="50 70 15 35 22.07 27.93 50 55.86 77.93 27.93 85 35 50 70"/></svg>';
const EXTERNAL_ICON =
	'<svg viewBox="0 0 100 100"><polygon points="26.06 66.86 53.32 39.61 30.34 39.61 30.34 29.61 70.4 29.6 70.39 69.66 60.39 69.66 60.39 46.68 33.14 73.94 26.06 66.86"/></svg>';

// a button along a row: what it does goes in data-act, and onListClick routes it
function act(name, label, icon) {
	return `<button type="button" class="ctrl" data-act="${name}" title="${esc(label)}">${icon}<span>${esc(label)}</span></button>`;
}
// the same, as just its icon: what it does shows as a tooltip, so a row's buttons fit on the row's own line
function iconAct(name, label, icon) {
	return `<button type="button" class="ctrl dev-icon" data-act="${name}" aria-label="${esc(label)}" data-tooltip="${esc(label)}">${icon}</button>`;
}
function tag(text, warn) {
	return `<span class="dev-tag${warn ? " warn" : ""}">${esc(text)}</span>`;
}

// ———————————————————————————
// SEARCH
// every word typed has to appear somewhere in a thing's name, slug, file or file names. a book or chapter that matches shows everything in it; otherwise only the demos that match show, under their chapter and book
// ———————————————————————————
function searching() {
	return query.trim() !== "";
}
function matches() {
	const hay = Array.prototype.join.call(arguments, " ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every(function (word) {
			return hay.indexOf(word) >= 0;
		});
}
function demoMatches(file, item) {
	const info = demos[file] || { files: [] };
	return matches(nameOf(file), item ? item.id : "", file, info.files.join(" "));
}

function render() {
	if (!list) return;
	if (!connected) {
		list.innerHTML = `<div class="dev-empty">The dev server isn’t running, so there’s nothing to load. In a terminal, from the repo folder, run <code>node dev.mjs</code> and open the address it prints.</div>`;
		return;
	}
	if (!collection || !Array.isArray(collection.books)) {
		list.innerHTML = '<div class="dev-empty">collection.json couldn’t be read.</div>';
		return;
	}
	let html = "";
	if (!searching()) html += renderRecent();
	html += renderTemplate();
	html += renderDrafts();
	let shelf = "";
	books().forEach(function (book, b) {
		shelf += renderBook(b);
	});
	if (shelf || !searching()) html += `<div class="dev-heading"><span>Books</span></div>${shelf}`;
	list.innerHTML = html || `<div class="dev-empty">Nothing matches “${esc(query.trim())}”.</div>`;
	markOpen();
}

// the ten files written most recently, wherever they live — a shortcut to them, not a place of their own
function renderRecent() {
	const files = Object.keys(demos)
		.filter(function (file) {
			return findDemo(file) || file.startsWith(`${DRAFTS}/`) || file === TEMPLATE;
		})
		.sort(function (a, b) {
			return demos[b].modified - demos[a].modified;
		})
		.slice(0, RECENT_COUNT);
	if (!files.length) return "";
	return `<div class="dev-heading"><span>Recently edited</span></div><div class="dev-recent">${files
		.map(function (file) {
			const at = findDemo(file);
			const where = at
				? `${bookAt(at).title} › ${chapterAt(at).title}`
				: file === TEMPLATE
					? "Blank editor"
					: "Draft";
			return `<button type="button" class="dev-recent-item" data-file="${esc(file)}" style="--accent:${at ? chapterColor(at) : "var(--off-white)"}"><span class="dev-recent-name">${esc(nameOf(file))}</span><span class="dev-recent-meta">${esc(where)} ~ ${ago(demos[file].modified)}</span></button>`;
		})
		.join("")}</div>`;
}

// the blank editor's template: opened and saved like any demo, but it isn't on the site, so it can't be moved, copied or deleted
function renderTemplate() {
	if (!demos[TEMPLATE] || (searching() && !matches(nameOf(TEMPLATE), TEMPLATE, "template blank editor"))) return "";
	return `<div class="dev-heading"><span>Blank editor</span></div>${demoRow({ file: TEMPLATE, template: true, color: "var(--off-white)", tags: "" })}`;
}

function renderDrafts() {
	const shown = drafts.filter(function (file) {
		return !searching() || demoMatches(file);
	});
	if (searching() && !shown.length) return "";
	let html = `<div class="dev-heading" data-drop="drafts"><span>Drafts</span>${act("new-draft", "New demo", api.icons.duplicate)}</div>`;
	if (!drafts.length)
		html += '<div class="dev-empty" data-drop="drafts">No drafts. Drag a demo here to take it off the site.</div>';
	html += shown
		.map(function (file) {
			return demoRow({ file: file, num: "", color: "var(--off-white)", tags: "" });
		})
		.join("");
	return html;
}

function renderBook(b) {
	const book = books()[b];
	const chapters = book.chapters || [];
	const whole = !searching() || matches(book.title, book.mediaType || "", book.id);
	let inner = "";
	chapters.forEach(function (chapter, c) {
		inner += renderChapter({ b: b, c: c }, whole);
	});
	if (searching() && !whole && !inner) return "";
	// a search opens every book, so nothing that matches is hidden behind a fold
	const shut = folded.has(book.id) && !searching();
	const count = chapters.reduce(function (t, c) {
		return t + (c.demos || []).length;
	}, 0);
	let html = `<div class="dev-book${shut ? " shut" : ""}" style="--accent:${bookColor(b)}">`;
	html += `<div class="dev-row dev-book-row" draggable="true" data-drag='${JSON.stringify({ kind: "book", b: b })}' data-at='${JSON.stringify({ b: b })}'>
		<button type="button" class="dev-fold" data-act="fold" title="${shut ? "Show" : "Hide"} chapters">${CHEVRON_ICON}</button>
		<button type="button" class="dev-row-main" data-act="settings"><span class="dev-kind">${esc(book.mediaType || "Book")}</span><span class="dev-title">${esc(book.title)}</span><span class="dev-meta">${chapters.length} chapter${chapters.length === 1 ? "" : "s"} ~ ${count} demo${count === 1 ? "" : "s"} ~ /${esc(book.id)}/${book.hidden ? tag("Unlisted") : ""}</span></button>
		<div class="dev-hover"><div class="dev-acts">${iconAct("new-chapter", "New chapter", api.icons.duplicate)}${iconAct("page", "View page", EXTERNAL_ICON)}${iconAct("settings", "Settings", api.icons.settings)}</div></div>
	</div>`;
	if (!shut) {
		if (!chapters.length) html += '<div class="dev-empty dev-indent">No chapters yet.</div>';
		html += inner;
	}
	return `${html}</div>`;
}

// `whole` is true when the chapter's book matched the search, so everything in it shows
function renderChapter(at, whole) {
	const chapter = chapterAt(at);
	const items = chapter.demos || [];
	const all = whole || matches(chapter.title, chapter.id);
	const shown = items
		.map(function (item, d) {
			return { item: item, d: d };
		})
		.filter(function (x) {
			return all || demoMatches(x.item.file, x.item);
		});
	if (!all && !shown.length) return "";
	const number = bookAt(at).hidden || chapter.hidden ? "" : `Chapter ${shownIndex(bookAt(at).chapters, chapter) + 1}`;
	let html = `<div class="dev-chapter" style="--accent:${chapterColor(at)}">`;
	html += `<div class="dev-row dev-chapter-row" draggable="true" data-drag='${JSON.stringify({ kind: "chapter", b: at.b, c: at.c })}' data-at='${JSON.stringify(at)}'>
		<button type="button" class="dev-row-main" data-act="settings"><span class="dev-kind">${esc(number || "Chapter")}</span><span class="dev-title">${esc(chapter.title)}</span><span class="dev-meta">${items.length} demo${items.length === 1 ? "" : "s"} ~ /${esc(bookAt(at).id)}/${esc(chapter.id)}/${chapter.hidden ? tag("Unlisted") : ""}</span></button>
		<div class="dev-hover"><div class="dev-acts">${iconAct("new-demo", "New demo", api.icons.duplicate)}${iconAct("page", "View page", EXTERNAL_ICON)}${iconAct("settings", "Settings", api.icons.settings)}</div></div>
	</div>`;
	if (!items.length)
		html += `<div class="dev-empty dev-indent" data-drop-chapter='${JSON.stringify(at)}'>No demos yet. Drag one here, or make a new one.</div>`;
	shown.forEach(function (x) {
		const dat = { b: at.b, c: at.c, d: x.d };
		html += demoRow({
			file: x.item.file,
			at: dat,
			num: demoNumber(dat),
			color: chapterColor(at),
			tags: (x.item.hidden ? tag("Unlisted") : "") + (demos[x.item.file] ? "" : tag("File missing", true))
		});
	});
	return `${html}</div>`;
}

// one demo, on one line: its number and name, and when it was edited. hovering lays its files and buttons over the right end of that same line, so nothing below it moves
function demoRow(o) {
	const info = demos[o.file] || { files: [], modified: 0 };
	const drag = o.at ? { kind: "demo", b: o.at.b, c: o.at.c, d: o.at.d } : { kind: "draft", file: o.file };
	const fileList = `${info.files.length} file${info.files.length === 1 ? "" : "s"}: ${info.files.join(", ")}`;
	const acts = o.template
		? iconAct("open", "Open", api.icons.open) +
			iconAct("download", "Download", api.icons.download) +
			iconAct("page", "View the blank editor", EXTERNAL_ICON)
		: iconAct("open", "Open", api.icons.open) +
			iconAct("settings", "Settings", api.icons.settings) +
			iconAct("duplicate", "Duplicate", api.icons.duplicate) +
			iconAct("download", "Download", api.icons.download) +
			(o.at ? iconAct("page", "View page", EXTERNAL_ICON) : "") +
			iconAct("delete", "Delete", api.icons.trash);
	return `<div class="dev-row dev-demo${o.at ? " dev-indent" : ""}${o.template ? " dev-template" : ""}"${o.template ? "" : ` draggable="true" data-drag='${esc(JSON.stringify(drag))}'`} style="--accent:${o.color}" data-file="${esc(o.file)}"${o.at ? ` data-at='${JSON.stringify(o.at)}'` : ""}>
		<button type="button" class="dev-row-main" data-act="open">${o.num ? `<span class="dev-num">${o.num}</span>` : ""}<span class="dev-title">${esc(nameOf(o.file))}</span><span class="dev-meta">${info.modified ? `edited ${ago(info.modified)}` : ""}${o.tags}</span></button>
		<div class="dev-hover"><span class="dev-files" title="${esc(`${o.file}\n${fileList}`)}">${esc(fileList)}</span><div class="dev-acts">${acts}</div></div>
	</div>`;
}

// the open demo's row is marked, so the list says where you are
function markOpen() {
	if (!list) return;
	list.querySelectorAll("[data-file]").forEach(function (el) {
		el.classList.toggle("open", !!current && el.getAttribute("data-file") === current);
	});
}

function onListClick(e) {
	const recent = e.target.closest(".dev-recent-item");
	if (recent) {
		openFile(recent.getAttribute("data-file"));
		return;
	}
	const button = e.target.closest("[data-act]");
	if (!button) return;
	const name = button.getAttribute("data-act");
	if (name === "new-draft") {
		newDraft();
		return;
	}
	const row = button.closest(".dev-row");
	if (!row) return;
	const at = row.dataset.at ? JSON.parse(row.dataset.at) : null;
	const file = row.getAttribute("data-file");
	if (row.classList.contains("dev-template")) {
		if (name === "open") openFile(file);
		else if (name === "download") downloadDemo(file);
		else if (name === "page") window.open("/editor/", "_blank");
		return;
	}
	if (row.classList.contains("dev-demo")) {
		if (name === "open") openFile(file);
		else if (name === "settings") openSettings(at, file);
		else if (name === "duplicate") duplicateDemo(file);
		else if (name === "download") downloadDemo(file);
		else if (name === "delete") deleteDemo(file);
		else if (name === "page") window.open(pageFor(at), "_blank");
		return;
	}
	if (name === "fold") {
		const id = bookAt(at).id;
		if (folded.has(id)) folded.delete(id);
		else folded.add(id);
		rememberFolded();
		render();
	} else if (name === "settings") openSettings(at);
	else if (name === "page") window.open(pageFor(at), "_blank");
	else if (name === "new-chapter") newChapterIn(at.b);
	else if (name === "new-demo") newDemoIn(at);
}

// ———————————————————————————
// DRAGGING
// html5 drag and drop: books reorder among books; chapters reorder within and across books (dropped on a book, a chapter goes to its end); demos reorder within and across chapters (dropped on a chapter, to its end); drafts drop into chapters the same way, and a demo dropped on the drafts leaves the site
// ———————————————————————————
let dragging = null;

// where a drop would land for the row under the pointer: before or after a row of the same kind, or into a container
function dropFor(e) {
	if (!dragging) return null;
	const target = e.target.closest(".dev-row, [data-drop], [data-drop-chapter]");
	if (!target || !list.contains(target)) return null;
	const box = target.getBoundingClientRect();
	const half = e.clientY < box.top + box.height / 2 ? "before" : "after";
	const kind = dragging.kind;
	if (target.hasAttribute("data-drop-chapter")) {
		return kind === "demo" || kind === "draft"
			? { el: target, where: "into", chapter: JSON.parse(target.getAttribute("data-drop-chapter")) }
			: null;
	}
	if (
		target.getAttribute("data-drop") === "drafts" ||
		(target.classList.contains("dev-demo") && !target.dataset.at && !target.classList.contains("dev-template"))
	) {
		return kind === "demo" ? { el: target, where: "drafts" } : null;
	}
	const at = target.dataset.at ? JSON.parse(target.dataset.at) : null;
	if (!at) return null;
	if (target.classList.contains("dev-book-row")) {
		if (kind === "book") return { el: target, where: half, at: at };
		if (kind === "chapter") return { el: target, where: "into", at: at };
		return null;
	}
	if (target.classList.contains("dev-chapter-row")) {
		if (kind === "chapter") return { el: target, where: half, at: at };
		if (kind === "demo" || kind === "draft") return { el: target, where: "into", at: at };
		return null;
	}
	if (target.classList.contains("dev-demo")) {
		if (kind === "demo" || kind === "draft") return { el: target, where: half, at: at };
	}
	return null;
}
function clearMarks() {
	list.querySelectorAll("[data-mark]").forEach(function (el) {
		el.removeAttribute("data-mark");
	});
}
function wireDrag() {
	list.addEventListener("dragstart", function (e) {
		const row = e.target.closest("[data-drag]");
		if (!row) return;
		dragging = JSON.parse(row.getAttribute("data-drag"));
		row.classList.add("dragging");
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", row.getAttribute("data-drag")); // firefox won't start a drag without something here
	});
	list.addEventListener("dragend", function () {
		dragging = null;
		clearMarks();
		list.querySelectorAll(".dragging").forEach(function (el) {
			el.classList.remove("dragging");
		});
	});
	list.addEventListener("dragover", function (e) {
		const drop = dropFor(e);
		clearMarks();
		if (!drop) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		drop.el.setAttribute("data-mark", drop.where);
		// a long list scrolls itself when a drag nears its top or bottom edge
		const box = list.getBoundingClientRect();
		if (e.clientY < box.top + 40) list.scrollTop -= 12;
		else if (e.clientY > box.bottom - 40) list.scrollTop += 12;
	});
	list.addEventListener("drop", function (e) {
		const drop = dropFor(e);
		const from = dragging;
		clearMarks();
		dragging = null;
		if (!drop || !from) return;
		e.preventDefault();
		applyDrop(from, drop);
	});
}
function applyDrop(from, drop) {
	const after = drop.where === "after" ? 1 : 0;
	if (from.kind === "book") {
		if (drop.at.b === from.b) return;
		moveBook(from.b, drop.at.b + after);
		return;
	}
	if (from.kind === "chapter") {
		if (drop.where === "into") moveChapter(from, drop.at.b, (bookAt(drop.at).chapters || []).length);
		else if (!(drop.at.b === from.b && drop.at.c === from.c)) moveChapter(from, drop.at.b, drop.at.c + after);
		return;
	}
	if (from.kind === "demo" && drop.where === "drafts") {
		unplaceDemo(from);
		return;
	}
	// a demo or draft headed into a chapter: into the end of it, or before / after a demo already there
	let to;
	if (drop.chapter) to = { b: drop.chapter.b, c: drop.chapter.c, d: 0 };
	else if (drop.where === "into") to = { b: drop.at.b, c: drop.at.c, d: chapterAt(drop.at).demos.length };
	else to = { b: drop.at.b, c: drop.at.c, d: drop.at.d + after };
	if (from.kind === "draft") placeDraft(from.file, to);
	else if (!(to.b === from.b && to.c === from.c && (to.d === from.d || to.d === from.d + 1))) moveDemo(from, to);
}

// ———————————————————————————
// SETTINGS PANELS
// clicking a book or chapter (or a demo's settings button) opens its settings over the list: name, slug, description, whether it's listed on the site — and delete, for something with nothing in it
// ———————————————————————————
let panel = null;
function buildPanel() {
	panel = document.createElement("div");
	panel.className = "mf-overlay";
	panel.id = "dev-panel";
	panel.hidden = true;
	document.body.appendChild(panel);
	panel.addEventListener("mousedown", function (e) {
		if (e.target === panel) closePanel();
	});
}
function closePanel() {
	if (panel) panel.hidden = true;
}
function field(label, inner, hint) {
	return `<div class="dlg-field"><span class="dlg-label">${label}</span><div>${inner}${hint ? `<div class="dlg-hint">${hint}</div>` : ""}</div></div>`;
}
function textInput(id, value, placeholder) {
	return `<input type="text" id="${id}" class="mf-text" autocomplete="off" spellcheck="false" value="${esc(value)}" placeholder="${esc(placeholder || "")}">`;
}

// what each kind of thing has to fill in, and how a filled-in form goes back into the collection
function openSettings(at, file) {
	if (!panel) buildPanel();
	let kind, item, siblings, color, heading;
	if (file && !at) {
		kind = "draft";
		color = "var(--off-white)";
		heading = "Draft settings";
	} else if (at.d != null) {
		kind = "demo";
		item = demoAt(at);
		file = item.file;
		siblings = chapterAt(at).demos;
		color = chapterColor(at);
		heading = "Demo settings";
	} else if (at.c != null) {
		kind = "chapter";
		item = chapterAt(at);
		siblings = bookAt(at).chapters;
		color = chapterColor(at);
		heading = "Chapter settings";
	} else {
		kind = "book";
		item = bookAt(at);
		siblings = books();
		color = bookColor(at.b);
		heading = "Book settings";
	}
	const empty =
		kind === "book" ? !(item.chapters || []).length : kind === "chapter" ? !(item.demos || []).length : true;
	const name = kind === "draft" ? nameOf(file) : item.title;
	let fields = field("Name", textInput("dp-title", name));
	if (kind === "book")
		fields += field(
			"Label",
			textInput("dp-kind", item.mediaType || "Book", "Book"),
			"Shown above the book’s name, like “Web Documentation”."
		);
	if (kind !== "draft")
		fields += field(
			"Slug",
			textInput("dp-id", item.id),
			`Part of its address: <span id="dp-url"></span>.${kind === "demo" ? "" : " Changing it moves every page inside it to a new address."}`
		);
	if (kind === "book" || kind === "chapter")
		fields += field(
			"About",
			`<textarea id="dp-desc" class="mf-text dev-textarea" spellcheck="true">${esc(item.description || "")}</textarea>`
		);
	if (kind !== "draft")
		fields += field(
			"Site",
			`<label class="dlg-opt"><input type="checkbox" class="dlg-check" id="dp-listed"${item.hidden ? "" : " checked"}><span class="dlg-mark"></span> Listed on the site</label>`,
			"Unlisted pages are still built and work from a direct link ~ they’re just left out of every menu."
		);
	if (file) fields += field("File", `<code class="dev-path">${esc(file)}</code>`);
	panel.style.setProperty("--accent", color);
	panel.innerHTML = `<div class="mf-dialog" role="dialog" aria-modal="true" aria-label="${heading}">
		<div class="dlg-head">${api.icons.settings}<span>${heading}</span><button type="button" id="dp-x" title="Close">${api.icons.erase}</button></div>
		<div class="dlg-body">${fields}<div class="mf-error" id="dp-err" hidden></div></div>
		<div class="dlg-actions">${act("delete", "Delete", api.icons.trash)}<span class="dev-spacer"></span><button type="button" class="ctrl" id="dp-cancel">${api.icons.erase}<span>Cancel</span></button><button type="button" class="ctrl" id="dp-ok">${api.icons.check}<span>Save</span></button></div>
		</div>`;
	panel.hidden = false;
	const q = function (id) {
		return panel.querySelector(`#${id}`);
	};
	const del = panel.querySelector('[data-act="delete"]');
	if (!empty) {
		del.disabled = true;
		del.title = `Move or delete everything in this ${kind} first`;
		del.setAttribute("data-tooltip", del.title);
	}
	// the slug follows the name until it's been typed in by hand
	let slugTouched = kind === "draft" || slugify(name) !== item.id;
	const syncUrl = function () {
		const url = q("dp-url");
		if (!url) return;
		const id = slugify(q("dp-id").value) || "…";
		const path =
			kind === "book"
				? `/${id}/`
				: kind === "chapter"
					? `/${bookAt(at).id}/${id}/`
					: `/${bookAt(at).id}/${chapterAt(at).id}/${id}.html`;
		url.textContent = path;
	};
	if (q("dp-id")) {
		q("dp-id").addEventListener("input", function () {
			slugTouched = true;
			syncUrl();
		});
		q("dp-title").addEventListener("input", function () {
			if (!slugTouched) {
				q("dp-id").value = slugify(q("dp-title").value);
				syncUrl();
			}
		});
		syncUrl();
	}
	const fail = function (message) {
		const err = q("dp-err");
		err.textContent = message;
		err.hidden = false;
	};
	q("dp-x").onclick = closePanel;
	q("dp-cancel").onclick = closePanel;
	panel.querySelectorAll(".mf-text").forEach(function (input) {
		input.addEventListener("keydown", function (e) {
			if (e.key === "Enter" && input.tagName === "INPUT") q("dp-ok").click(); // escape is handled once, for the whole page, in startDev
		});
	});
	del.onclick = async function () {
		if (!empty) return;
		if (kind === "demo" || kind === "draft") {
			closePanel();
			deleteDemo(file);
			return;
		}
		if (!window.confirm(`Delete “${item.title}”?`)) return;
		siblings.splice(kind === "book" ? at.b : at.c, 1);
		closePanel();
		await saveCollection(`Deleted ${item.title}`);
	};
	q("dp-ok").onclick = async function () {
		const title = q("dp-title").value.trim();
		if (!title) return fail("Give it a name.");
		if (kind === "draft") {
			closePanel();
			await renameFileTitle(file, title);
			return;
		}
		const id = slugify(q("dp-id").value);
		if (!id) return fail("The slug needs at least one letter or number.");
		const taken = siblings
			.filter(function (x) {
				return x !== item;
			})
			.map(function (x) {
				return x.id;
			});
		if (taken.indexOf(id) >= 0) return fail(`Something next to it already has the slug “${id}”.`);
		if (kind === "book" && RESERVED.indexOf(id) >= 0) return fail(`“${id}” is a folder the site already uses.`);
		const before = item.title;
		item.title = title;
		item.id = id;
		if (kind === "book") item.mediaType = q("dp-kind").value.trim() || "Book";
		if (q("dp-desc")) item.description = q("dp-desc").value.trim();
		if (q("dp-listed").checked) delete item.hidden;
		else item.hidden = true;
		closePanel();
		if (kind === "demo") {
			// a TITLE in the demo's own file would override the new name on its page, so it follows along
			const text = await readDemo(file).catch(function () {
				return null;
			});
			if (text && /^===\s*TITLE\s*===\s*$/im.test(text) && title !== before)
				await writeDemo(file, setTitleInText(text, title), false);
			if (file === current) api.setName(title);
		}
		await saveCollection(`Saved ${title}`);
	};
	q("dp-title").focus();
	q("dp-title").select();
}
// a draft's name lives in its own file
async function renameFileTitle(file, title) {
	let text;
	try {
		text = await readDemo(file);
	} catch (e) {
		note(e.message, true);
		return;
	}
	if (!(await writeDemo(file, setTitleInText(text, title), false))) return;
	if (file === current) api.setName(title);
	// a draft's file is named after it, so it follows the new name
	const named = `${DRAFTS}/${slugify(title) || "untitled"}.demo`;
	if (named !== file) await fileAction("rename", file, named);
	note(`Renamed to “${title}”`);
	await refresh();
}

// ———————————————————————————
// STATUS
// one line in the manager's footer, and a toast for when the manager is shut
// ———————————————————————————
let toastT = null;
function note(message, bad) {
	if (status) {
		status.textContent = message;
		status.classList.toggle("bad", !!bad);
	}
	let toast = document.getElementById("dev-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "dev-toast";
		document.body.appendChild(toast);
	}
	toast.textContent = message;
	toast.classList.toggle("bad", !!bad);
	toast.classList.add("show");
	clearTimeout(toastT);
	toastT = setTimeout(
		function () {
			toast.classList.remove("show");
		},
		bad ? 6000 : 2500
	);
}

// ———————————————————————————
// START
// ———————————————————————————
export async function startDev(handles) {
	api = handles;
	// new, save and load in the topbar, the name, and cmd-s now mean the files on disk instead of this browser's storage
	const on = function (id, fn) {
		const el = document.getElementById(id);
		if (el) el.onclick = fn;
	};
	on("tb-new", newDraft);
	on("tb-save", saveCurrent);
	on("tb-load", openManager);
	const settingsHere = function () {
		if (!current) {
			saveCurrent();
			return;
		}
		if (current === TEMPLATE) {
			note("The template has no settings of its own ~ its name and place are fixed.");
			return;
		}
		const at = findDemo(current);
		openSettings(at, at ? null : current);
	};
	on("tb-demo", settingsHere);
	const heading = document.querySelector(".info-demo-head");
	if (heading) heading.onclick = settingsHere;
	on("tb-book", function () {
		const at = current && findDemo(current);
		if (at) openSettings({ b: at.b });
	});
	on("tb-chapter", function () {
		const at = current && findDemo(current);
		if (at) openSettings({ b: at.b, c: at.c });
	});
	const tips = {
		"tb-new": "Start a new draft",
		"tb-save": "Save to this demo’s file",
		"tb-load": "All demos on the site",
		"tb-demo": "This demo’s settings"
	};
	Object.keys(tips).forEach(function (id) {
		const el = document.getElementById(id);
		if (!el) return;
		el.title = tips[id];
		el.setAttribute("data-tooltip", tips[id]);
	});
	window.addEventListener("keydown", function (e) {
		if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey) && !e.altKey) {
			e.preventDefault();
			saveCurrent();
		}
		if (e.key === "Escape") {
			if (panel && !panel.hidden) closePanel();
			else closeManager();
		}
	});
	window.addEventListener("beforeunload", function (e) {
		if (api.unsaved()) {
			e.preventDefault();
			e.returnValue = "";
		}
	});
	api.setName("Unsaved demo");
	// a ?file= in the address bar reopens that demo after a reload; otherwise the list is the first thing on screen. it's read before the first refresh, which rewrites the address bar
	const linked = new URLSearchParams(location.search).get("file");
	await refresh();
	if (linked && demos[linked]) {
		const text = await readDemo(linked).catch(function () {
			return null;
		});
		if (text !== null) {
			api.openText(text, nameOf(linked));
			current = linked;
			syncLocation();
			return;
		}
	}
	openManager();
}
