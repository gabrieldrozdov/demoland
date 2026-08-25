function generateTitle() {
	let title = document.querySelector(".land-title");
	if (!title) return;
	let words = (title.textContent || "").split(" ");
	let temp = "";
	let index = 0;
	for (let word of words) {
		let wordTemp = "";
		for (let letter of word) {
			wordTemp += `<span style="animation-delay: -${index / 10}s">${letter}</span>`;
			index++;
		}
		temp += `<span>${wordTemp}</span>`;
	}
	title.innerHTML = temp;
}
generateTitle();

// ———————————————————————————
// BACKGROUND FIELD
// dots on a grid that is never filled in, each a colour from the palette — the field crowds the edges of the screen and both thins and darkens toward the middle
// paths wander from dot to dot, drawing themselves across the field and then drawing away again from the tail
// a dot the pointer passes over swells, then eases back down
// ———————————————————————————
(function background() {
	const bg = document.querySelector(".bg");
	if (!bg) return;

	// dots sit on a grid SPACING apart, drawn at DOT_FRAC of that spacing, but the grid is never filled in
	const SPACING_VH = 3.4,
		SPACING_MIN = 20,
		SPACING_MAX = 46,
		DOT_FRAC = 0.2;

	// the field crowds the edges of the screen and thins out toward the middle: a grid point's chance of carrying a dot falls off with how far it is from the nearest edge, never below EDGE_FLOOR
	const EDGE_BIAS = 3,
		EDGE_FLOOR = 0.06;

	// and it darkens the same way — a dot hard against an edge keeps its full colour, one in the middle is MID_DARK of the way to off-black
	const SHADE_LEVELS = 12,
		MID_DARK = 0.82;

	// the pointer swells whichever dot is within HOVER_REACH of it up to HOVER_GROWTH of its resting size, and it decays back over roughly HOVER_TAU seconds
	const HOVER_TAU = 0.7,
		HOVER_REACH = 0.6,
		HOVER_GROWTH = 2.5;

	// moving onto a new dot sends a path out of it, no more often than HOVER_PATH_SEC and never past HOVER_PATH_MAX live paths
	const HOVER_PATH_SEC = 0.15,
		HOVER_PATH_MAX = 28;

	// paths: how many run at once, how fast the head moves in cells per second, how long before the tail follows, and how far they wander
	const PATH_MAX = 14,
		PATH_SPAWN_SEC = 0.3,
		PATH_SPEED = 9,
		PATH_HOLD = 2.5,
		PATH_MIN = 16,
		PATH_MAX_LEN = 60,
		PATH_REACH = 1.7, // how far, in spacings, a path will look for its next dot
		LINE_FRAC = 0.045;

	// ---- resolve colours from the page's CSS (stays in sync with the theme) ----
	const cs = getComputedStyle(document.documentElement);
	function cssVar(name) {
		return cs.getPropertyValue(name).trim();
	}
	function parse(c) {
		c = String(c).trim();
		if (c[0] === "#") {
			if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
			return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
		}
		const m = c.match(/-?\d+(\.\d+)?/g) || [0, 0, 0];
		return [+m[0], +m[1], +m[2]];
	}
	function rgb(a) {
		return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
	}
	function mix(a, b, t) {
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
	}

	const BRAND = ["--pink", "--green", "--blue", "--yellow", "--purple", "--red"].map(function (n) {
		return parse(cssVar(n));
	});
	const OFF_BLACK = parse(cssVar("--off-black") || "#1a1a1a");
	// a colour may be an indirection (var(--pink)); resolve it by reading it back off a hidden probe element
	const probeEl = document.createElement("span");
	probeEl.style.cssText = "position:absolute;visibility:hidden;color:var(--accent)";
	document.body.appendChild(probeEl);
	const ACCENT = parse(getComputedStyle(probeEl).color);
	document.body.removeChild(probeEl);

	// the accents actually used on this page, read off whatever carries an inline --accent (the chapter cards on a book page), so a book with two chapters draws in those two colours
	function pageAccents() {
		const seen = [],
			out = [];
		document.querySelectorAll('[style*="--accent"]').forEach(function (el) {
			const v = getComputedStyle(el).getPropertyValue("--accent").trim();
			if (!v || seen.indexOf(v) >= 0) return;
			seen.push(v);
			probeEl.style.color = v;
			const c = parse(getComputedStyle(probeEl).color);
			// skip the neutral accents (off-white, greys) so a book page draws only in its chapters' actual colours
			if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 20) return;
			out.push(c);
		});
		return out;
	}

	const cls = document.documentElement.classList;
	const mode = cls.contains("book") ? "book" : cls.contains("chapter") ? "chapter" : "home";
	// home draws from the whole palette, a book page from the accents of the chapters on it, and a chapter page from its own single accent
	let COLOURS = BRAND;
	if (mode === "book") {
		document.body.appendChild(probeEl);
		COLOURS = pageAccents();
		document.body.removeChild(probeEl);
	}
	if (mode === "chapter" || !COLOURS.length) COLOURS = [ACCENT];
	// every palette colour at every darkness, built once — index 0 is the edge of the screen, the last is the middle
	const INK = COLOURS.map(function (c) {
		const steps = [];
		for (let i = 0; i < SHADE_LEVELS; i++) {
			steps.push(rgb(mix(OFF_BLACK, c, 1 - (MID_DARK * i) / (SHADE_LEVELS - 1))));
		}
		return steps;
	});
	// 0 hard against an edge, 1 dead centre
	function insetAt(x, y) {
		return Math.min(Math.min(x, viewW - x) / viewW, Math.min(y, viewH - y) / viewH) * 2;
	}

	const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const canvas = document.createElement("canvas");
	canvas.style.cssText = "display:block;width:100%;height:100%";
	bg.appendChild(canvas);
	const ctx = canvas.getContext("2d");

	let viewW = 0,
		viewH = 0,
		spacing = 30,
		cols = 0,
		rows = 0,
		dotX = new Float32Array(0),
		dotY = new Float32Array(0),
		boost = new Float32Array(0),
		colourOf = new Uint8Array(0),
		shadeOf = new Uint8Array(0),
		buckets = [],
		paths = [];

	// every dot sits in a bucket one spacing wide, so finding what is near a point never walks the whole field
	function bucketAt(x, y) {
		const c = Math.min(cols - 1, Math.max(0, (x / spacing) | 0)),
			r = Math.min(rows - 1, Math.max(0, (y / spacing) | 0));
		return r * cols + c;
	}
	// every dot within `reach` of (x, y), as indices
	function near(x, y, reach) {
		const out = [];
		const c0 = Math.max(0, ((x - reach) / spacing) | 0),
			c1 = Math.min(cols - 1, ((x + reach) / spacing) | 0);
		const r0 = Math.max(0, ((y - reach) / spacing) | 0),
			r1 = Math.min(rows - 1, ((y + reach) / spacing) | 0);
		const rr = reach * reach;
		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				const list = buckets[r * cols + c];
				for (let n = 0; n < list.length; n++) {
					const i = list[n];
					const dx = dotX[i] - x,
						dy = dotY[i] - y;
					if (dx * dx + dy * dy <= rr) out.push(i);
				}
			}
		}
		return out;
	}

	function build() {
		spacing = Math.max(SPACING_MIN, Math.min(SPACING_MAX, (SPACING_VH / 100) * viewH));
		cols = Math.max(1, Math.ceil(viewW / spacing));
		rows = Math.max(1, Math.ceil(viewH / spacing));
		buckets = [];
		for (let i = 0; i < cols * rows; i++) buckets.push([]);
		const xs = [],
			ys = [],
			shades = [];
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const x = (c + 0.5) * spacing,
					y = (r + 0.5) * spacing;
				// the grid point only carries a dot if the edge weighting keeps it, so the middle of the screen stays sparse
				const inset = insetAt(x, y);
				if (Math.random() > Math.max(EDGE_FLOOR, Math.pow(1 - inset, EDGE_BIAS))) continue;
				buckets[bucketAt(x, y)].push(xs.length);
				xs.push(x);
				ys.push(y);
				shades.push(Math.min(SHADE_LEVELS - 1, (inset * SHADE_LEVELS) | 0));
			}
		}
		dotX = Float32Array.from(xs);
		dotY = Float32Array.from(ys);
		shadeOf = Uint8Array.from(shades);
		boost = new Float32Array(xs.length);
		colourOf = new Uint8Array(xs.length);
		// each dot keeps its colour for the life of the field
		for (let i = 0; i < colourOf.length; i++) colourOf[i] = (Math.random() * INK.length) | 0;
		paths = [];
	}

	function resize() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		viewW = bg.clientWidth || window.innerWidth;
		viewH = bg.clientHeight || window.innerHeight;
		canvas.width = Math.round(viewW * dpr);
		canvas.height = Math.round(viewH * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		build();
	}

	// a path hops from dot to nearby dot, favouring whatever keeps it going the way it was already heading — `from` starts it at a given dot, otherwise it starts anywhere
	function spawnPath(now, from) {
		if (!dotX.length) return;
		const len = PATH_MIN + ((Math.random() * (PATH_MAX_LEN - PATH_MIN)) | 0);
		let at = from >= 0 ? from : (Math.random() * dotX.length) | 0;
		const pts = [at];
		let dx = 0,
			dy = 0;
		for (let i = 0; i < len; i++) {
			const opts = near(dotX[at], dotY[at], spacing * PATH_REACH);
			let best = -1,
				bestScore = -2;
			for (let k = 0; k < opts.length; k++) {
				const j = opts[k];
				if (j === at || j === pts[pts.length - 2]) continue;
				const vx = dotX[j] - dotX[at],
					vy = dotY[j] - dotY[at];
				const d = Math.hypot(vx, vy) || 1;
				// score is how well this hop continues the last one, jittered so the walk stays unpredictable
				const along = dx || dy ? (vx * dx + vy * dy) / d : 0;
				const score = along + Math.random() * 0.9;
				if (along < -0.2) continue; // never double straight back
				if (score > bestScore) {
					bestScore = score;
					best = j;
				}
			}
			if (best < 0) break;
			const nx = dotX[best] - dotX[at],
				ny = dotY[best] - dotY[at];
			const nd = Math.hypot(nx, ny) || 1;
			dx = nx / nd;
			dy = ny / nd;
			at = best;
			pts.push(at);
		}
		// a dot with nothing next to it has no path to send out
		if (pts.length > 1) paths.push({ pts: pts, t0: now });
	}

	// draw the live stretch of a path: the head runs ahead, and after PATH_HOLD the tail follows and rubs it out
	function drawPath(p, now) {
		const pts = p.pts;
		const head = Math.min((now - p.t0) * PATH_SPEED, pts.length - 1);
		const tail = Math.max(0, (now - p.t0 - PATH_HOLD) * PATH_SPEED);
		if (tail >= pts.length - 1) return false;
		for (let i = Math.floor(tail); i < head; i++) {
			const ax = dotX[pts[i]],
				ay = dotY[pts[i]];
			const bx = dotX[pts[i + 1]],
				by = dotY[pts[i + 1]];
			// the first and last segments are partial, so both ends of the stroke move smoothly
			const f0 = Math.min(1, Math.max(0, tail - i)),
				f1 = Math.min(1, Math.max(0, head - i));
			// each segment carries the colour of the dot it leaves from, so a path changes colour as it travels
			ctx.strokeStyle = INK[colourOf[pts[i]]][shadeOf[pts[i]]];
			ctx.beginPath();
			ctx.moveTo(ax + (bx - ax) * f0, ay + (by - ay) * f0);
			ctx.lineTo(ax + (bx - ax) * f1, ay + (by - ay) * f1);
			ctx.stroke();
		}
		return true;
	}

	let pointerX = -1,
		pointerY = -1;
	window.addEventListener(
		"pointermove",
		function (e) {
			pointerX = e.clientX;
			pointerY = e.clientY;
		},
		{ passive: true }
	);

	let last = 0,
		nextSpawn = 0,
		hoverDot = -1,
		nextHoverPath = 0;
	function render(now, dt) {
		// whatever the pointer is closest to gets pushed back up to full, and moving onto a new dot sends a path out of it
		if (pointerX >= 0) {
			const hit = near(pointerX, pointerY, spacing * HOVER_REACH);
			let nearest = -1,
				best = Infinity;
			for (let k = 0; k < hit.length; k++) {
				const i = hit[k];
				boost[i] = 1;
				const dx = dotX[i] - pointerX,
					dy = dotY[i] - pointerY;
				if (dx * dx + dy * dy < best) {
					best = dx * dx + dy * dy;
					nearest = i;
				}
			}
			if (nearest >= 0 && nearest !== hoverDot && now > nextHoverPath && paths.length < HOVER_PATH_MAX) {
				spawnPath(now, nearest);
				nextHoverPath = now + HOVER_PATH_SEC;
			}
			hoverDot = nearest;
		}
		// every square eases back down to its resting size
		const decay = Math.exp(-dt / HOVER_TAU);
		ctx.clearRect(0, 0, viewW, viewH);
		// paths run underneath, so the dots always sit on top of them
		if (!reduce) {
			ctx.lineWidth = Math.max(0.5, spacing * LINE_FRAC);
			if (now > nextSpawn && paths.length < PATH_MAX) {
				spawnPath(now, -1);
				nextSpawn = now + PATH_SPAWN_SEC;
			}
			paths = paths.filter(function (p) {
				return drawPath(p, now);
			});
		}
		const base = spacing * DOT_FRAC;
		for (let i = 0; i < boost.length; i++) {
			let b = boost[i];
			if (b > 0.002) boost[i] = b *= decay;
			else if (b) boost[i] = b = 0;
			ctx.fillStyle = INK[colourOf[i]][shadeOf[i]];
			// a hovered dot grows out of its resting size and eases back down
			const size = base * (1 + (HOVER_GROWTH - 1) * b);
			ctx.fillRect(dotX[i] - size / 2, dotY[i] - size / 2, size, size);
		}
	}

	function frame(ms) {
		const now = ms / 1000;
		let dt = now - last;
		last = now;
		if (dt > 0.1 || dt < 0) dt = 0; // clamp after a tab-away
		render(now, dt);
		requestAnimationFrame(frame);
	}

	let resizeT;
	window.addEventListener("resize", function () {
		clearTimeout(resizeT);
		resizeT = setTimeout(resize, 150);
	});

	resize();
	requestAnimationFrame(frame);
})();
