// ———————————————————————————
// PAGE CHROME
// shared by every page (landing pages + editor pages) — a classic script that runs before the editor module and independently of it, so the topbar, nav popup and shortcuts stay interactive even when editor.js fails to load
// everything it needs is baked into the html by build.mjs: [data-nav-href="url"] navigates there on click, [data-nav-open] opens the nav popup, [data-nav-reload] reloads the page; the popup markup and info panel are pre-rendered, so nothing here builds dom
// ———————————————————————————
(function () {
	function byId(id) {
		return document.getElementById(id);
	}
	function lsSet(k, v) {
		try {
			localStorage.setItem(k, v);
		} catch (e) {}
	}
	function each(sel, fn) {
		Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
	}
	const embed = document.body.classList.contains("embed");

	// (cross-document page transitions were removed — buggy on back/forward and not worth the complexity)

	// ———————————————————————————
	// NAV POPUP
	// markup pre-rendered into #nav-body by the build
	// ———————————————————————————
	var overlay = byId("nav-overlay"),
		dialog = byId("nav-dialog"),
		navBody = byId("nav-body");
	var prevFocus = null;
	var tipSuppressActive = 0; // tooltips stay hidden until this timestamp (see the tooltip section)
	function focusables() {
		return dialog
			? Array.prototype.slice
					.call(
						dialog.querySelectorAll(
							'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
						)
					)
					.filter(function (e) {
						return e.offsetWidth || e.offsetHeight || e.getClientRects().length;
					})
			: [];
	}
	function openNav() {
		if (!overlay) return;
		suppressTooltips(250); // hide the menu-button tooltip; don't let it re-fire behind the overlay
		prevFocus = document.activeElement;
		overlay.hidden = false;
		(dialog || focusables()[0]).focus();
		const active = navBody && navBody.querySelector(".nc-demo-item.active");
		if (active)
			requestAnimationFrame(function () {
				if (active.scrollIntoView) active.scrollIntoView({ block: "center" });
			});
		else if (navBody) navBody.scrollTop = 0;
		requestAnimationFrame(updateNavSticky);
	}
	function closeNav() {
		if (!overlay) return;
		overlay.hidden = true;
		suppressTooltips(300); // hiding the overlay re-exposes the button under the cursor -> swallow that synthetic hover
		if (prevFocus && prevFocus.focus) prevFocus.focus();
		prevFocus = null;
	}

	// ———————————————————————————
	// STICKY BOOK-NAME HEADING
	// baked by the build; here we only show/hide it
	// ———————————————————————————
	var navSticky = dialog && dialog.querySelector(".nav-sticky");
	var navTitleEl = navBody && navBody.querySelector(".nav-title");
	if (dialog && navSticky && navTitleEl) {
		dialog.addEventListener("scroll", updateNavSticky, { passive: true });
		window.addEventListener("resize", updateNavSticky);
	}
	function updateNavSticky() {
		if (!navSticky || !navTitleEl) return;
		const padTop = parseFloat(getComputedStyle(dialog).paddingTop) || 0;
		const stickAt = dialog.getBoundingClientRect().top + padTop; // where sticky elements settle
		navSticky.classList.toggle("show", navTitleEl.getBoundingClientRect().bottom < stickAt);
	}

	// ———————————————————————————
	// TOPBAR WIRING
	// declarative; the targets are baked by build.mjs
	// ———————————————————————————
	each("[data-nav-href]", function (el) {
		const u = el.getAttribute("data-nav-href");
		if (el.tagName === "A")
			el.setAttribute("href", u); // <a> crumbs/arrows become real links (native navigation)
		else
			el.onclick = function () {
				if (u) location.href = u;
			};
	});
	each("[data-nav-open]", function (el) {
		if (embed && el.classList.contains("info-demo-head")) return; // embed: the demo title is inert, never a nav trigger
		el.onclick = openNav;
	});
	each("[data-nav-reload]", function (el) {
		el.onclick = function () {
			location.reload();
		};
	});

	let closeBtn = byId("nav-close");
	if (closeBtn) closeBtn.onclick = closeNav;
	if (overlay) {
		overlay.addEventListener("click", function (e) {
			if (e.target === overlay) closeNav();
		});
		overlay.addEventListener("keydown", function (e) {
			if (e.key !== "Tab" || overlay.hidden) return;
			const f = focusables();
			if (!f.length) return;
			const first = f[0],
				last = f[f.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		});
		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !overlay.hidden) closeNav();
		});
	}

	// ———————————————————————————
	// SHORTCUTS
	// collapse + os toggle, editor pages only (guarded)
	// ———————————————————————————
	const sec = byId("info-shortcuts");
	if (sec) {
		let head = sec.querySelector(".sc-head");
		Array.prototype.forEach.call(sec.querySelectorAll(".sc-os"), function (b) {
			b.onclick = function (e) {
				e.stopPropagation();
				const os = b.getAttribute("data-os");
				document.body.classList.toggle("sc-win", os === "win");
				if (!embed) lsSet("lp-sc-os", os);
			};
		});
		if (head)
			head.onclick = function () {
				const collapsed = document.body.classList.toggle("sc-collapsed");
				if (!embed) lsSet("lp-sc-collapse", collapsed ? "1" : "0");
			};
	}

	// ———————————————————————————
	// CONFETTI
	// the footer button loads canvas-confetti (self-hosted) on first click
	// ———————————————————————————
	each("[data-confetti]", function (btn) {
		let roundedRect = null; // cached custom shape (built once confetti is loaded)
		function brandColors() {
			const cs = getComputedStyle(document.documentElement);
			return ["--pink", "--green", "--blue", "--yellow", "--purple", "--red"]
				.map(function (n) {
					return cs.getPropertyValue(n).trim();
				})
				.filter(Boolean);
		}
		// the sounds live next to the confetti script, so the same base path finds them at any page depth
		function playSound(name, delayMs) {
			const src = (btn.getAttribute("data-confetti") || "").replace(
				/lib\/confetti\.js.*$/,
				`assets/sounds/${name}.mp3`
			);
			setTimeout(function () {
				try {
					const a = new Audio(src);
					a.volume = 0.7;
					const p = a.play();
					if (p && p.catch) p.catch(function () {}); // a browser that blocks autoplay just stays quiet
				} catch (e) {}
			}, delayMs);
		}
		btn.addEventListener("click", function () {
			playSound("pop", 0);
			playSound("yay", 140);
			function fire() {
				if (!window.confetti) return;
				if (!roundedRect && window.confetti.shapeFromPath) {
					try {
						roundedRect = window.confetti.shapeFromPath({
							path: "M1,0 H11 A1,1 0 0 1 12,1 V5 A1,1 0 0 1 11,6 H1 A1,1 0 0 1 0,5 V1 A1,1 0 0 1 1,0 Z"
						});
					} catch (e) {}
				}
				window.confetti({
					particleCount: 160,
					spread: 360, // burst out in every direction
					startVelocity: 42,
					ticks: 220,
					origin: { x: 0.5, y: 0.5 }, // from the middle of the screen
					colors: brandColors(),
					shapes: roundedRect ? [roundedRect] : ["square"],
					scalar: 1.1
				});
			}
			if (window.confetti) return fire();
			if (btn.dataset.loading) return; // a load is already in flight
			btn.dataset.loading = "1";
			let s = document.createElement("script");
			s.src = btn.getAttribute("data-confetti");
			s.onload = function () {
				btn.dataset.loading = "";
				fire();
			};
			s.onerror = function () {
				btn.dataset.loading = "";
			};
			document.head.appendChild(s);
		});
	});

	// ———————————————————————————
	// TOOLTIPS
	// any element with a data-tooltip attribute gets a hover/focus tooltip that picks the side with room and clamps itself on screen; delegated, so elements added later work too
	// ———————————————————————————
	var tip = null,
		tipTarget = null;
	function tooltipEl() {
		if (tip) return tip;
		tip = document.createElement("div");
		tip.id = "tooltip";
		tip.setAttribute("role", "tooltip");
		tip.hidden = true;
		document.body.appendChild(tip);
		return tip;
	}
	function showTooltip(target) {
		const text = target.getAttribute("data-tooltip");
		if (!text) return;
		tipTarget = target;
		let t = tooltipEl();
		t.className = "";
		t.textContent = text;
		t.style.left = "0px";
		t.style.top = "0px"; // neutral spot for a clean measurement
		t.hidden = false; // make it measurable
		void t.offsetWidth; // force a synchronous reflow with the new content
		const GAP = 8,
			r = target.getBoundingClientRect();
		const tw = t.offsetWidth,
			th = t.offsetHeight,
			vw = window.innerWidth,
			vh = window.innerHeight;
		// data-tooltip-side pins the tooltip to one side; otherwise take the first side with room for it
		const side =
			target.getAttribute("data-tooltip-side") ||
			(r.top - th - GAP >= 0
				? "top"
				: r.bottom + th + GAP <= vh
					? "bottom"
					: r.left - tw - GAP >= 0
						? "left"
						: r.right + tw + GAP <= vw
							? "right"
							: "bottom");
		let left, top;
		if (side === "top") {
			left = r.left + r.width / 2 - tw / 2;
			top = r.top - th - GAP;
		} else if (side === "bottom") {
			left = r.left + r.width / 2 - tw / 2;
			top = r.bottom + GAP;
		} else if (side === "left") {
			left = r.left - tw - GAP;
			top = r.top + r.height / 2 - th / 2;
		} else {
			left = r.right + GAP;
			top = r.top + r.height / 2 - th / 2;
		}
		left = Math.max(GAP, Math.min(left, vw - tw - GAP));
		top = Math.max(GAP, Math.min(top, vh - th - GAP));
		t.className = `tt-${side}`;
		t.style.left = `${left}px`;
		t.style.top = `${top}px`;
	}
	function hideTooltip() {
		tipTarget = null;
		if (tip) {
			tip.hidden = true;
			tip.className = "";
		}
	}
	function closestTip(node) {
		return node && node.closest ? node.closest("[data-tooltip]") : null;
	}
	// briefly refuse to show tooltips (and hide any showing one) around clicks and when an overlay opens or closes, so a tooltip never pops up from a hover the user didn't make: clicking a button that opens an overlay on top of it fires no mouseout, and closing that overlay re-exposes the button under a still-stationary cursor
	function suppressTooltips(ms) {
		tipSuppressActive = Date.now() + ms;
		hideTooltip();
	}
	document.addEventListener("mouseover", function (e) {
		if (Date.now() < tipSuppressActive) return;
		const el = closestTip(e.target);
		if (el && el !== tipTarget) showTooltip(el);
	});
	document.addEventListener("mouseout", function (e) {
		const el = closestTip(e.target);
		if (el && el === tipTarget && !el.contains(e.relatedTarget)) hideTooltip();
	});
	document.addEventListener(
		"mousedown",
		function () {
			suppressTooltips(250);
		},
		true
	);
	document.addEventListener("focusin", function (e) {
		if (Date.now() < tipSuppressActive) return;
		const el = closestTip(e.target);
		// keyboard focus only: a click focuses too, and coming back from another app refocuses whatever was clicked — which would pop that button's tooltip up over the dialog it opened
		if (el && e.target.matches && e.target.matches(":focus-visible")) showTooltip(el);
	});
	document.addEventListener("focusout", hideTooltip);
	window.addEventListener("blur", hideTooltip);
	window.addEventListener("scroll", hideTooltip, true);
	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") hideTooltip();
	});
})();
