// ———————————————————————————
// DEV SERVER
// a local server for running the site from the /dev/ page: `node dev.mjs`, then open http://localhost:5503/dev/
// the /dev/ page notices the server and grows what it can't have on the published site: every demo on the site listed by book and chapter, opening a demo from its own .demo file, saving back to that file, and moving books, chapters and demos around collection.json — every change that touches the site runs build.mjs, so the built pages are current by the time the save reports back
// this file is a tool, not part of the site: github pages serves the built html and never runs any of this. node built-ins only, like build.mjs
// ———————————————————————————
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import {
	readFileSync,
	writeFileSync,
	existsSync,
	statSync,
	readdirSync,
	mkdirSync,
	renameSync,
	copyFileSync,
	unlinkSync,
	rmSync,
	rmdirSync,
	cpSync,
	createReadStream
} from "node:fs";
import { join, resolve, relative, dirname, basename, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// 5503 is the port live server is already set to for this repo (.vscode/settings.json), so the site keeps the address it always had
const PORT = Number(process.argv.find((arg) => /^\d+$/.test(arg))) || 5503;

// by default nothing outside this machine can reach the server. `--lan` opens it to the network to check pages on a phone — writing stays this-computer-only either way
const LAN = process.argv.includes("--lan");

// the one folder anything is written into, and the one kind of file: paths arrive from a browser, and a path from a browser isn't something to hand to writeFileSync unchecked
const WRITABLE = "demos";
// demos that aren't on the site yet: ordinary .demo files that collection.json doesn't point at, so the build never sees them. a draft joins the site by being moved into a chapter
const DRAFTS = "demos/drafts";
const COLL = "collection.json";
// the blank editor's starting demo: not in the collection, but /editor/ and /dev/ are built from it, so saving it rebuilds
const TEMPLATE = "demos/template.demo";

// folders in the repo root that are source, not built output — a book id that matched one of these must never have its "old output" removed
const PROTECTED = new Set([
	"assets",
	"demos",
	"lib",
	"parts",
	"editor",
	"dev",
	"info",
	"node_modules",
	".git",
	".github",
	".vscode"
]);

const TYPES = {
	html: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	js: "text/javascript; charset=utf-8",
	mjs: "text/javascript; charset=utf-8",
	json: "application/json; charset=utf-8",
	demo: "text/plain; charset=utf-8",
	md: "text/plain; charset=utf-8",
	txt: "text/plain; charset=utf-8",
	xml: "application/xml; charset=utf-8",
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	ico: "image/x-icon",
	mp4: "video/mp4",
	webm: "video/webm",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	m4a: "audio/mp4",
	ttf: "font/ttf",
	otf: "font/otf",
	woff: "font/woff",
	woff2: "font/woff2",
	pdf: "application/pdf"
};

// ———————————————————————————
// PATHS
// ———————————————————————————
// a path the browser sent, as a real path inside demos/ ending in .demo — or null. anything that climbs out, or isn't a .demo, is refused rather than quietly corrected
function resolveWritable(given) {
	if (typeof given !== "string" || given === "" || given.includes("\0")) return null;
	const full = resolve(here, normalize(given.replace(/^\/+/, "")));
	if (!full.startsWith(resolve(here, WRITABLE) + sep)) return null;
	if (extname(full).toLowerCase() !== ".demo") return null;
	return full;
}
// the repo-relative form with forward slashes, which is how collection.json writes a demo's "file"
function repoPath(full) {
	return relative(here, full).split(sep).join("/");
}
// never write over something already there — "intro.demo" becomes "intro-2.demo" instead
function freeName(dir, name) {
	const ext = extname(name);
	const stem = basename(name, ext);
	let tried = name;
	let n = 2;
	while (existsSync(join(dir, tried))) tried = `${stem}-${n++}${ext}`;
	return tried;
}

// ———————————————————————————
// WHERE DEMO FILES LIVE
// every demo on the site lives at demos/<book>/<chapter>/<demo>.demo, matching its address, and its media in a folder of the same name beside it (demos/<book>/<chapter>/<demo>/). collection.json says where a demo belongs, and every time it's saved the files are moved to match — so moving or renaming anything on /dev/ keeps the folders tidy on its own, with nothing to tidy by hand
// a MEDIA section's body is the media file's path on the site (see the README), so when a demo's folder moves, the paths in its MEDIA sections are moved with it
// ———————————————————————————
// a demo's media folder: its own path without the .demo
function stemOf(rel) {
	return rel.replace(/\.demo$/i, "");
}
function inside(dirFull, full) {
	return full.startsWith(dirFull + sep);
}
// each MEDIA section's body line, as [line index, path] — the body is the first non-blank line after the header
function mediaLines(lines) {
	const out = [];
	lines.forEach((line, i) => {
		const m = line.match(/^===\s*MEDIA\s+(.+?)\s*===\s*$/i);
		if (!m) return;
		let j = i + 1;
		while (j < lines.length && lines[j].trim() === "") j++;
		if (j < lines.length && !/^===/.test(lines[j]))
			out.push({ index: j, name: m[1].trim(), value: lines[j].trim() });
	});
	return out;
}
// point a demo's MEDIA paths that were inside one folder at another. only the body lines change, so nothing above them moves and note line numbers stay right
function rebaseMedia(full, fromStem, toStem) {
	if (!existsSync(full)) return;
	const text = readFileSync(full, "utf8");
	const lines = text.split("\n");
	let changed = false;
	for (const media of mediaLines(lines)) {
		const lead = media.value.startsWith("/") ? "/" : "";
		const bare = media.value.slice(lead.length);
		if (bare.startsWith(`${fromStem}/`)) {
			lines[media.index] = `${lead}${toStem}/${bare.slice(fromStem.length + 1)}`;
			changed = true;
		}
	}
	if (changed) writeFileSync(full, lines.join("\n"), "utf8");
}
// a demo and its media folder, moved together
function moveBundle(fromRel, toRel) {
	if (fromRel === toRel) return;
	const from = join(here, fromRel);
	const to = join(here, toRel);
	mkdirSync(dirname(to), { recursive: true });
	renameSync(from, to);
	const folder = join(here, stemOf(fromRel));
	const target = join(here, stemOf(toRel));
	if (existsSync(folder) && statSync(folder).isDirectory()) {
		mkdirSync(dirname(target), { recursive: true });
		// a folder already sitting where this one goes is merged into rather than replaced
		if (existsSync(target)) {
			cpSync(folder, target, { recursive: true });
			rmSync(folder, { recursive: true, force: true });
		} else renameSync(folder, target);
	}
	rebaseMedia(to, stemOf(fromRel), stemOf(toRel));
}
// a demo and its media folder, copied — the copy points at its own copies of the media
function copyBundle(fromRel, toRel) {
	mkdirSync(dirname(join(here, toRel)), { recursive: true });
	copyFileSync(join(here, fromRel), join(here, toRel));
	const folder = join(here, stemOf(fromRel));
	if (existsSync(folder) && statSync(folder).isDirectory())
		cpSync(folder, join(here, stemOf(toRel)), { recursive: true });
	rebaseMedia(join(here, toRel), stemOf(fromRel), stemOf(toRel));
}
function deleteBundle(rel) {
	if (existsSync(join(here, rel))) unlinkSync(join(here, rel));
	const folder = join(here, stemOf(rel));
	if (existsSync(folder) && statSync(folder).isDirectory()) rmSync(folder, { recursive: true, force: true });
}
// empty folders left behind by a move go, from the bottom up — but never demos/ or demos/drafts/ themselves
function removeEmptyDirs(dir) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true }))
		if (entry.isDirectory()) removeEmptyDirs(join(dir, entry.name));
	const keep = [resolve(here, WRITABLE), resolve(here, DRAFTS)];
	const left = readdirSync(dir).filter((name) => name !== ".DS_Store");
	if (!left.length && !keep.includes(resolve(dir))) {
		rmSync(join(dir, ".DS_Store"), { force: true });
		rmdirSync(dir);
	}
}
// move every demo in the collection to the path its address says, updating its "file" to match. a demo whose ids aren't plain slugs, or whose file is missing, is left where it is. moves go through a holding folder first, so two demos swapping names can't land on each other
function tidyDemos(collection) {
	const moved = {};
	const plan = [];
	const slug = /^[a-z0-9][a-z0-9_-]*$/i;
	for (const book of collection.books || [])
		for (const chapter of book.chapters || [])
			for (const demo of chapter.demos || []) {
				if (!demo || typeof demo.file !== "string") continue;
				if (![book.id, chapter.id, demo.id].every((id) => typeof id === "string" && slug.test(id))) continue;
				const target = `${WRITABLE}/${book.id}/${chapter.id}/${demo.id}.demo`;
				if (demo.file === target || !resolveWritable(demo.file) || !existsSync(join(here, demo.file))) continue;
				plan.push({ demo, from: demo.file, target });
			}
	if (!plan.length) return moved;
	plan.forEach((step, i) => {
		step.held = `${WRITABLE}/.moving/${i}.demo`;
		moveBundle(step.from, step.held);
	});
	for (const step of plan) {
		const dir = dirname(join(here, step.target));
		const final = repoPath(join(dir, freeName(dir, basename(step.target))));
		moveBundle(step.held, final);
		step.demo.file = final;
		moved[step.from] = final;
		console.log(`   → ${final}`);
	}
	removeEmptyDirs(join(here, WRITABLE));
	return moved;
}

// ———————————————————————————
// MEDIA
// a file uploaded or dropped into a demo arrives as a data url inside the .demo text. on save it's written out as a real file in the demo's media folder, and the MEDIA section is pointed at it, so the .demo stays small text and the media is an ordinary file on the site
// anything in that folder no MEDIA section points at any more (a file that was deleted from the demo) is removed
// ———————————————————————————
function extractMedia(full) {
	const rel = repoPath(full);
	const stem = stemOf(rel);
	const folder = join(here, stem);
	const text = readFileSync(full, "utf8");
	const lines = text.split("\n");
	const written = {};
	for (const media of mediaLines(lines)) {
		const m = media.value.match(/^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s);
		if (!m) continue;
		// the name is the file's path inside the demo; it stays inside the demo's own folder however it's spelled
		const safe = media.name
			.replace(/\\/g, "/")
			.split("/")
			.filter((part) => part && part !== "." && part !== "..")
			.join("/");
		const target = resolve(folder, safe);
		if (!safe || !inside(folder, target)) continue;
		const bytes = /;base64/i.test(m[2])
			? Buffer.from(m[3], "base64")
			: Buffer.from(decodeURIComponent(m[3]), "utf8");
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, bytes);
		lines[media.index] = repoPath(target);
		written[media.name] = repoPath(target);
		console.log(`   + ${repoPath(target)} (${Math.max(1, Math.round(bytes.length / 1024))}kb)`);
	}
	if (Object.keys(written).length) writeFileSync(full, lines.join("\n"), "utf8");
	// prune what the demo no longer uses
	if (existsSync(folder) && statSync(folder).isDirectory()) {
		const used = new Set(mediaLines(lines).map((media) => resolve(here, media.value.replace(/^\/+/, ""))));
		(function prune(dir) {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) prune(path);
				else if (entry.name !== ".DS_Store" && !used.has(path)) {
					unlinkSync(path);
					console.log(`   ✗ ${repoPath(path)} (no longer in the demo)`);
				}
			}
		})(folder);
		removeEmptyDirs(folder);
	}
	return written;
}

// ———————————————————————————
// BUILDING
// ———————————————————————————
// build.mjs runs as its own process, so every build reads collection.json fresh
function runBuild() {
	return new Promise((done) => {
		const started = Date.now();
		execFile(
			process.execPath,
			["build.mjs"],
			{ cwd: here, maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const ms = Date.now() - started;
				if (error) {
					const message =
						(stderr || error.message || "")
							.trim()
							.split("\n")
							.filter((line) => line.trim() !== "")
							.pop() || "the build failed";
					console.log(`   ✗ build failed ~ ${message}`);
					done({ ok: false, ms, message });
					return;
				}
				done({ ok: true, ms, message: "" });
			}
		);
	});
}
// saves can come in faster than a build finishes, so builds queue rather than run over each other
let chain = Promise.resolve();
function rebuild() {
	chain = chain.then(runBuild, runBuild);
	return chain;
}

// ———————————————————————————
// WHAT THE SITE IS MADE OF
// ———————————————————————————
// every .demo under demos/, with when it was last written and what's in it — the /dev/ page uses this to list drafts, sort "recently edited", say which files a demo has without opening it, and notice a demo collection.json points at that isn't there
function demoFiles() {
	const out = {};
	(function walk(dir) {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".demo")) {
				const stat = statSync(full);
				out[repoPath(full)] = {
					modified: stat.mtimeMs,
					bytes: stat.size,
					...demoSummary(readFileSync(full, "utf8"))
				};
			}
		}
	})(join(here, WRITABLE));
	return out;
}
// a demo's title and file names, read off its section headers without parsing the rest
function demoSummary(text) {
	const files = [];
	let title = "";
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	lines.forEach((line, i) => {
		const m = line.match(/^===\s*([A-Za-z]+)(?:\s+(.+?))?\s*===\s*$/);
		if (!m) return;
		const key = m[1].toUpperCase();
		if (key === "HTML") files.push("index.html");
		else if ((key === "FILE" || key === "MEDIA") && m[2]) files.push(m[2].trim());
		else if (key === "TITLE") {
			let j = i + 1;
			while (j < lines.length && lines[j].trim() === "") j++;
			if (j < lines.length && !/^===/.test(lines[j])) title = lines[j].trim();
		}
	});
	return { title, files };
}
function readCollection() {
	return JSON.parse(readFileSync(join(here, COLL), "utf8"));
}

// ———————————————————————————
// REQUESTS
// ———————————————————————————
function send(response, status, body, type) {
	// the whole point of this server is seeing a change immediately
	response.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
	response.end(body);
}
function sendJSON(response, status, value) {
	send(response, status, JSON.stringify(value), TYPES.json);
}
function readBody(request, limit) {
	return new Promise((done, fail) => {
		const chunks = [];
		let size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				fail(new Error("that’s too large to send"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => {
			try {
				done(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
			} catch (error) {
				fail(new Error("the request wasn’t readable"));
			}
		});
		request.on("error", fail);
	});
}
// writing is this-computer-only even when the server is open to the network
function local(request) {
	const address = request.socket.remoteAddress || "";
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function handleAPI(request, response, url) {
	if (url.pathname === "/_dev/status" && request.method === "GET") {
		let collection = null;
		let message = "";
		try {
			collection = readCollection();
		} catch (error) {
			// the one failure the page can't work around, so it says so rather than showing an empty site
			message = `collection.json couldn’t be read ~ ${error.message}`;
		}
		const demos = demoFiles();
		const drafts = Object.keys(demos)
			.filter((file) => file.startsWith(`${DRAFTS}/`))
			.sort((a, b) => demos[b].modified - demos[a].modified);
		sendJSON(response, 200, { ok: true, writing: local(request), collection, demos, drafts, message });
		return;
	}

	if (!local(request)) {
		sendJSON(response, 403, { ok: false, message: "demos can only be changed from this computer" });
		return;
	}

	// write a .demo. `create` means this is a new demo: it never replaces a file that's already there, and comes back with the name it actually got
	if (url.pathname === "/_dev/save" && request.method === "POST") {
		const body = await readBody(request, 64 * 1024 * 1024);
		let file = resolveWritable(body.path);
		if (!file) {
			sendJSON(response, 400, { ok: false, message: `only .demo files inside ${WRITABLE}/ can be saved` });
			return;
		}
		if (typeof body.text !== "string") {
			sendJSON(response, 400, { ok: false, message: "nothing to save" });
			return;
		}
		mkdirSync(dirname(file), { recursive: true });
		if (body.create) file = join(dirname(file), freeName(dirname(file), basename(file)));
		const existed = existsSync(file);
		writeFileSync(file, body.text, "utf8");
		console.log(`   ${existed ? "✎" : "+"} ${repoPath(file)}`);
		const media = extractMedia(file);
		// a draft isn't on the site, so writing one can't change anything the build makes — and neither can a demo the collection doesn't point at. the template is the exception: /editor/ and /dev/ are built from it
		const listed =
			repoPath(file) === TEMPLATE || JSON.stringify(readCollection()).includes(JSON.stringify(repoPath(file)));
		const build = listed ? await rebuild() : { ok: false, ms: 0, message: "" };
		sendJSON(response, 200, {
			ok: true,
			path: repoPath(file),
			created: !existed,
			media: media,
			built: build.ok,
			ms: build.ms,
			message: build.message
		});
		return;
	}

	// the whole of collection.json at once: the page holds the tree it's editing and sends it back entire, so there's no merge to get wrong here
	if (url.pathname === "/_dev/collection" && request.method === "POST") {
		const body = await readBody(request, 8 * 1024 * 1024);
		const next = body.collection;
		if (!next || typeof next !== "object" || !Array.isArray(next.books)) {
			sendJSON(response, 400, { ok: false, message: "that isn’t a collection" });
			return;
		}
		const file = join(here, COLL);
		let before = null;
		try {
			before = readCollection();
		} catch (error) {
			// nothing readable there before, which is fine
		}
		// a copy of what was there goes beside it (gitignored), since one bad write would otherwise take the shape of the whole site with it
		if (existsSync(file)) copyFileSync(file, `${file}.backup`);
		// the files follow the collection before it's written, so the "file" of every demo that moved is already its new path
		const moved = tidyDemos(next);
		writeFileSync(file, `${JSON.stringify(next, null, "\t")}\n`, "utf8");
		console.log(`   ✎ ${COLL}`);
		removeStaleBooks(before, next);
		const build = await rebuild();
		sendJSON(response, 200, { ok: true, moved: moved, built: build.ok, ms: build.ms, message: build.message });
		return;
	}

	// renaming, copying and deleting .demo files, each with its media folder. the collection entry that points at a file is the page's to change; this is only the file
	if (url.pathname === "/_dev/file" && request.method === "POST") {
		const body = await readBody(request, 64 * 1024);
		const file = resolveWritable(body.path);
		if (!file) {
			sendJSON(response, 400, { ok: false, message: `only .demo files inside ${WRITABLE}/ can be changed` });
			return;
		}
		if (body.action === "delete") {
			if (repoPath(file) === TEMPLATE) {
				sendJSON(response, 400, { ok: false, message: "the blank editor needs its template" });
				return;
			}
			if (existsSync(file)) {
				deleteBundle(repoPath(file));
				removeEmptyDirs(join(here, WRITABLE));
				console.log(`   ✗ ${repoPath(file)}`);
			}
			sendJSON(response, 200, { ok: true });
			return;
		}
		if (body.action !== "rename" && body.action !== "duplicate") {
			sendJSON(response, 400, { ok: false, message: "that isn’t something to do to a demo" });
			return;
		}
		const to = resolveWritable(body.to);
		if (!to) {
			sendJSON(response, 400, { ok: false, message: "that isn’t a place a demo can go" });
			return;
		}
		if (!existsSync(file)) {
			sendJSON(response, 400, { ok: false, message: `${repoPath(file)} isn’t there` });
			return;
		}
		if (to === file) {
			sendJSON(response, 200, { ok: true, path: repoPath(file) });
			return;
		}
		// a name already taken gets a number rather than swallowing the demo that's there
		mkdirSync(dirname(to), { recursive: true });
		const free = join(dirname(to), freeName(dirname(to), basename(to)));
		if (body.action === "rename") {
			moveBundle(repoPath(file), repoPath(free));
			removeEmptyDirs(join(here, WRITABLE));
		} else copyBundle(repoPath(file), repoPath(free));
		console.log(`   ${body.action === "rename" ? "→" : "+"} ${repoPath(free)}`);
		sendJSON(response, 200, { ok: true, path: repoPath(free) });
		return;
	}

	if (url.pathname === "/_dev/build" && request.method === "POST") {
		const build = await rebuild();
		sendJSON(response, 200, { ok: build.ok, ms: build.ms, message: build.message });
		return;
	}

	sendJSON(response, 404, { ok: false, message: "no such endpoint" });
}

// build.mjs clears out each current book's folder before writing it again, but a book that was renamed or removed leaves its old folder of built pages behind — which would then get committed and deployed. a folder only goes if it was a book id in the collection a moment ago, isn't a source folder, and has a built index.html in it
function removeStaleBooks(before, after) {
	if (!before || !Array.isArray(before.books)) return;
	const keep = new Set((after.books || []).map((book) => book.id));
	for (const book of before.books) {
		const id = book && book.id;
		if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id) || keep.has(id) || PROTECTED.has(id)) continue;
		const dir = join(here, id);
		if (existsSync(join(dir, "index.html"))) {
			rmSync(dir, { recursive: true, force: true });
			console.log(`   ✗ ${id}/ (old built pages)`);
		}
	}
}

// ———————————————————————————
// THE SITE ITSELF
// ———————————————————————————
function serveStatic(request, response, url) {
	let full;
	try {
		full = resolve(here, normalize(decodeURIComponent(url.pathname).replace(/^\/+/, "")));
	} catch (error) {
		send(response, 400, "bad address");
		return;
	}
	// a request can't reach outside the repo, however it's spelled
	if (full !== here && !full.startsWith(here + sep)) {
		send(response, 403, "no");
		return;
	}
	// a folder means the page inside it, the way github pages serves the built site
	if (existsSync(full) && statSync(full).isDirectory()) full = join(full, "index.html");
	if (!existsSync(full) || !statSync(full).isFile()) {
		const missing = join(here, "404.html");
		if (existsSync(missing)) send(response, 404, readFileSync(missing), TYPES.html);
		else send(response, 404, `not found: ${url.pathname}`);
		return;
	}
	const type = TYPES[extname(full).slice(1).toLowerCase()] || "application/octet-stream";
	response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
	createReadStream(full).pipe(response);
}

const server = createServer((request, response) => {
	const url = new URL(request.url, `http://localhost:${PORT}`);
	if (url.pathname.startsWith("/_dev/")) {
		handleAPI(request, response, url).catch((error) => {
			sendJSON(response, 400, { ok: false, message: error.message || "that didn’t work" });
		});
		return;
	}
	serveStatic(request, response, url);
});

server.on("error", (error) => {
	if (error.code === "EADDRINUSE") {
		console.log(`\n   port ${PORT} is already taken ~ live server is probably still running on it.`);
		console.log(`   stop it, or start this on another port: node dev.mjs 5504\n`);
		process.exit(1);
	}
	throw error;
});

// one build up front, so /dev/ exists and matches the current source before anything is opened
rebuild().then((build) => {
	if (!build.ok) console.log("   the first build failed ~ /dev/ may be missing or out of date");
	server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
		console.log(`\n   🧪 demoland ~ http://localhost:${PORT}/`);
		console.log(`   🛠️  dev page ~ http://localhost:${PORT}/dev/`);
		console.log(
			`   ${LAN ? "open to the network for previewing; demos can still only be changed from this computer" : "this computer only ~ add --lan to preview on a phone"}`
		);
		console.log("   saving a demo that's on the site rebuilds it. ctrl-c to stop.\n");
	});
});
