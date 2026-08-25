// ———————————————————————————
// MEDIA PREVIEW PANE
// shows an image, audio, video or font file in place of the code editor with a meta bar (type · size · dimensions/duration)
// mediaKind(name) maps an extension to a kind; createMediaView(codeWrap, onShown) returns { showMediaView, hideMediaView }, with onShown running after the code editor is revealed again so it can re-measure
// ———————————————————————————

export function mediaKind(name) {
	const ext = (String(name).split(".").pop() || "").toLowerCase();
	if (["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp"].indexOf(ext) >= 0) return "image";
	if (["woff", "woff2", "ttf", "otf"].indexOf(ext) >= 0) return "font";
	if (["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"].indexOf(ext) >= 0) return "audio";
	// only the formats a browser will actually play: .mov and .ogv are hit and miss across browsers, so they are not treated as video
	if (["mp4", "webm", "m4v"].indexOf(ext) >= 0) return "video";
	return "other";
}
function hashStr(s) {
	let h = 0,
		i;
	for (i = 0; i < s.length; i++) {
		h = (h << 5) - h + s.charCodeAt(i);
		h |= 0;
	}
	return Math.abs(h);
}
function humanSize(bytes) {
	if (bytes == null) return "";
	let u = ["B", "KB", "MB", "GB"],
		i = 0,
		n = bytes;
	while (n >= 1024 && i < u.length - 1) {
		n /= 1024;
		i++;
	}
	return `${i === 0 ? n : n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
function fmtDur(sec) {
	if (!isFinite(sec)) return "";
	sec = Math.round(sec);
	const m = Math.floor(sec / 60),
		s = sec % 60;
	return `${m}:${s < 10 ? `0${s}` : s}`;
}
function specificType(name) {
	const ext = (String(name).split(".").pop() || "").toLowerCase();
	return (
		{
			png: "PNG image",
			jpg: "JPEG image",
			jpeg: "JPEG image",
			gif: "GIF image",
			svg: "SVG image",
			webp: "WebP image",
			avif: "AVIF image",
			ico: "Icon",
			bmp: "Bitmap image",
			woff: "WOFF font",
			woff2: "WOFF2 font",
			ttf: "TrueType font",
			otf: "OpenType font",
			mp3: "MP3 audio",
			wav: "WAV audio",
			ogg: "Ogg audio",
			oga: "Ogg audio",
			m4a: "M4A audio",
			aac: "AAC audio",
			flac: "FLAC audio",
			mp4: "MP4 video",
			webm: "WebM video",
			mov: "QuickTime video",
			m4v: "M4V video",
			ogv: "Ogg video"
		}[ext] || (ext ? `${ext.toUpperCase()} file` : "File")
	);
}

export function createMediaView(codeWrap, onCodeShown) {
	let mediaView = null,
		mediaGen = 0;
	function ensureMediaView() {
		if (mediaView) return mediaView;
		mediaView = document.createElement("div");
		mediaView.id = "media-view";
		mediaView.hidden = true;
		const host = document.getElementById("code-scroll") || (codeWrap && codeWrap.parentNode);
		if (host) host.appendChild(mediaView);
		return mediaView;
	}
	function showMediaView(f) {
		ensureMediaView();
		if (!mediaView) return;
		const kind = mediaKind(f.name),
			src = f.src || "";
		let stage;
		if (kind === "image") stage = '<div class="mv-stage"><img class="mv-img" alt=""></div>';
		else if (kind === "audio") stage = '<div class="mv-stage"><audio class="mv-audio" controls></audio></div>';
		else if (kind === "video") stage = '<div class="mv-stage"><video class="mv-video" controls></video></div>';
		else if (kind === "font")
			stage =
				'<div class="mv-stage mv-fontstage"><div class="mv-specimen"><div class="mv-spec-big">Aa Bb Cc</div><div class="mv-spec-mid">The quick brown fox jumps over the lazy dog.</div><div class="mv-spec-small">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</div></div></div>';
		else stage = '<div class="mv-stage"><div class="mv-other">No preview available for this file type.</div></div>';
		mediaView.innerHTML = `${stage}<div class="mv-meta"></div>`;
		let metaEl = mediaView.querySelector(".mv-meta");
		// meta: specific file type, size, and dimensions/duration — size and dims arrive async, so a generation token stops a late callback from writing onto a different file's view
		let gen = ++mediaGen,
			meta = { type: specificType(f.name), size: "", dim: "" };
		function paintMeta() {
			if (gen === mediaGen && metaEl)
				metaEl.textContent = [meta.type, meta.size, meta.dim].filter(Boolean).join("  ·  ");
		}
		paintMeta();
		if (src && typeof fetch === "function") {
			fetch(src)
				.then(function (r) {
					return r.ok ? r.blob() : null;
				})
				.then(function (b) {
					if (b) {
						meta.size = humanSize(b.size);
						paintMeta();
					}
				})
				.catch(function () {});
		}
		// note: each block uses its own variable — a shared one would be reassigned by the later querySelector calls, leaving every load callback reading the wrong (null) element
		function cantPlay(node) {
			// unplayable codec (e.g. many .mov files): show a clear note
			let stg = mediaView.querySelector(".mv-stage");
			if (stg)
				stg.innerHTML = `<div class="mv-other">This ${mediaKind(f.name) === "video" ? "video" : "audio"} can't be previewed in the browser (try MP4 or WebM).</div>`;
		}
		let imgEl = mediaView.querySelector(".mv-img");
		if (imgEl && src) {
			imgEl.addEventListener("load", function () {
				if (imgEl.naturalWidth) {
					meta.dim = `${imgEl.naturalWidth}×${imgEl.naturalHeight}`;
					paintMeta();
				}
			});
			imgEl.src = src;
		}
		let auEl = mediaView.querySelector(".mv-audio");
		if (auEl && src) {
			auEl.addEventListener("loadedmetadata", function () {
				meta.dim = fmtDur(auEl.duration);
				paintMeta();
			});
			auEl.addEventListener("error", function () {
				cantPlay(auEl);
			});
			auEl.src = src;
		}
		let vidEl = mediaView.querySelector(".mv-video");
		if (vidEl && src) {
			vidEl.addEventListener("loadedmetadata", function () {
				const d = vidEl.videoWidth ? `${vidEl.videoWidth}×${vidEl.videoHeight}` : "";
				meta.dim = [d, fmtDur(vidEl.duration)].filter(Boolean).join("  ·  ");
				paintMeta();
			});
			vidEl.addEventListener("error", function () {
				cantPlay(vidEl);
			});
			vidEl.src = src;
		}
		if (kind === "font" && src) {
			// load the font same-origin in this page and show a specimen
			const fam = `mvfont-${hashStr(src)}`;
			let st = document.createElement("style");
			st.textContent = `@font-face{font-family:'${fam}';src:url("${src.replace(/"/g, "%22")}");}`;
			mediaView.appendChild(st);
			let spec = mediaView.querySelector(".mv-specimen");
			if (spec) spec.style.fontFamily = `'${fam}', system-ui, sans-serif`;
		}
		if (codeWrap) codeWrap.hidden = true;
		mediaView.hidden = false;
		document.body.classList.add("viewing-media"); // hides #code-toggles (no editor settings apply)
	}
	function hideMediaView() {
		if (mediaView) mediaView.hidden = true;
		document.body.classList.remove("viewing-media");
		if (codeWrap && codeWrap.hidden) {
			codeWrap.hidden = false;
			if (onCodeShown) onCodeShown();
		}
	}
	return { showMediaView: showMediaView, hideMediaView: hideMediaView };
}
