// ———————————————————————————
// LINT ENGINE
// pure, dom-free analysis for the four editor languages (html, css, js, json); each entry point takes source text and returns a sorted list of diagnostics { off, line, kind, msg }, while editor.js owns the ui (the lint bar, jump-to-line and the toggle)
// exports: lintFile(text, lang) analyses one file and returns diagnostics, renderLintMsg(msg) turns a diagnostic message into safe html with <code> spans
// ———————————————————————————
import { acorn } from "../lib/codemirror.js";

// lint messages mark code spans two ways: symbols the author wrapped in "double quotes", and symbols wrapped with the C() marker (for characters awkward to quote, like " itself, or for raw parser output) — renderLintMsg escapes the text then turns both forms into <code>…</code>, using marker control chars that never appear in prose
const CODE_A = "",
	CODE_B = "";
function C(s) {
	return CODE_A + s + CODE_B;
}
// wrap the `'token'` / `` `token` `` symbols a parser (acorn, JSON.parse) puts in its own error text — those are the "console errors" that leak into lint messages
function codifyRaw(s) {
	return String(s)
		.replace(/`([^`]+)`/g, function (_, g) {
			return C(g);
		})
		.replace(/'([^']*)'/g, function (_, g) {
			return C(g);
		});
}
function quoteCode(s) {
	return s.replace(/"([^"]*)"/g, "<code>$1</code>");
} // "sym" -> <code>sym</code>
function renderLintMsg(raw) {
	const esc = String(raw).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	// split on marker-wrapped code spans so the double-quote transform never runs INSIDE one
	let parts = esc.split(CODE_A),
		out = quoteCode(parts[0]);
	for (let i = 1; i < parts.length; i++) {
		const bi = parts[i].indexOf(CODE_B);
		if (bi === -1) {
			out += quoteCode(parts[i]);
			continue;
		} // unbalanced marker: treat as text
		out += `<code>${parts[i].slice(0, bi)}</code>${quoteCode(parts[i].slice(bi + 1))}`;
	}
	return out;
}

function lineNo(text, off) {
	// 1-based line for a char offset
	let n = 1,
		lim = Math.min(off, text.length);
	for (let i = 0; i < lim; i++) if (text.charCodeAt(i) === 10) n++;
	return n;
}
function tidyJsMsg(m) {
	return String(m).replace(/\s*\(\d+:\d+\)\s*$/, "");
} // drop acorn's "(line:col)"
function friendlyJs(msg) {
	// turn acorn's wording into something a beginner can act on
	const m = String(msg);
	if (/unterminated string/i.test(m)) return "This text is missing its closing quote.";
	if (/unterminated template/i.test(m)) return `This template string is missing its closing backtick (${C("`")}).`;
	if (/unterminated comment/i.test(m)) return `This comment is missing ${C("*/")} to end it.`;
	if (/unexpected end of input/i.test(m))
		return `The code ends sooner than expected, you may be missing a closing ${C(")")}, ${C("]")} or ${C("}.")}`;
	if (/unexpected token/i.test(m))
		return `Unexpected symbol here, check for a missing or extra character (like ${C(",")}, ${C(";")}, ${C(")")} or ${C("}")}).`;
	if (/unexpected character/i.test(m)) return "There's an unexpected character here.";
	if (/has already been declared/i.test(m)) return "This name is already used, pick a different variable name.";
	if (/missing \) after argument list/i.test(m))
		return `Missing ${C(")")} symbol, check the parentheses on this function call.`;
	if (/assigning to rvalue/i.test(m)) return `Can't assign to this, check the left side of the ${C("=")}.`;
	if (/await is only valid/i.test(m)) return `${C("await")} can only be used inside an async function.`;
	return codifyRaw(tidyJsMsg(m)); // fallback: acorn's message, minus the (line:col), symbols codified
}

// ———————————————————————————
// HTML
// tag balance + structure
// ———————————————————————————
const HTML_VOID = {
	area: 1,
	base: 1,
	br: 1,
	col: 1,
	embed: 1,
	hr: 1,
	img: 1,
	input: 1,
	link: 1,
	meta: 1,
	param: 1,
	source: 1,
	track: 1,
	wbr: 1
};
// elements whose closing tag is optional — never reported as "unclosed"
const HTML_OPTIONAL = {
	html: 1,
	head: 1,
	body: 1,
	p: 1,
	li: 1,
	dt: 1,
	dd: 1,
	tr: 1,
	td: 1,
	th: 1,
	thead: 1,
	tbody: 1,
	tfoot: 1,
	caption: 1,
	colgroup: 1,
	option: 1,
	optgroup: 1,
	rp: 1,
	rt: 1
};
const HTML_RAW = { script: 1, style: 1, textarea: 1, title: 1 }; // contents aren't markup

// parse one tag's attribute region; flag duplicates, missing "=", empty values, stray quotes
function checkAttrs(s, base, tagName, diags) {
	function ws(c) {
		return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
	}
	let i = 0,
		n = s.length,
		seen = {};
	while (i < n) {
		while (i < n && ws(s[i])) i++;
		if (i >= n) break;
		const c = s[i];
		if (c === "/" || c === ">") {
			i++;
			continue;
		}
		if (c === '"' || c === "'") {
			// a quoted value where a name should be
			diags.push({
				off: base + i,
				kind: "HTML",
				msg: `Looks like a "=" is missing before this value (write it as ${C('name="value"')})`
			});
			const qe0 = s.indexOf(c, i + 1);
			if (qe0 === -1) break;
			i = qe0 + 1;
			continue;
		}
		if (c === "=") {
			diags.push({ off: base + i, kind: "HTML", msg: 'This "=" has no attribute name before it' });
			i++;
			continue;
		}
		const m = /^[^\s=\/>"']+/.exec(s.slice(i));
		if (!m) {
			i++;
			continue;
		}
		let aname = m[0].toLowerCase(),
			nameOff = base + i;
		i += m[0].length;
		if (seen[aname])
			diags.push({
				off: nameOff,
				kind: "HTML",
				msg: `The "${aname}" attribute is set more than once on this tag`
			});
		seen[aname] = 1;
		while (i < n && ws(s[i])) i++;
		if (s[i] === "=") {
			i++;
			while (i < n && ws(s[i])) i++;
			if (i >= n || s[i] === ">") {
				diags.push({ off: nameOff, kind: "HTML", msg: `"${aname}" has an "=" but no value after it` });
				break;
			}
			if (s[i] === '"' || s[i] === "'") {
				const qc = s[i],
					qe = s.indexOf(qc, i + 1);
				if (qe === -1) {
					diags.push({
						off: base + i,
						kind: "HTML",
						msg: `The value for "${aname}" is missing its closing quote`
					});
					break;
				}
				i = qe + 1;
			} else {
				const um = /^[^\s>]+/.exec(s.slice(i));
				i += um ? um[0].length : 1;
			}
		}
	}
}

function lintHtml(text, diags) {
	let i = 0,
		n = text.length,
		stack = [],
		k,
		k2,
		s;
	while (i < n) {
		const lt = text.indexOf("<", i);
		if (lt === -1) break;
		if (text.slice(lt, lt + 4) === "<!--") {
			// comment
			const ce = text.indexOf("-->", lt + 4);
			if (ce === -1) {
				diags.push({ off: lt, kind: "HTML", msg: `This comment is missing ${C("-->")} at the end` });
				break;
			}
			i = ce + 3;
			continue;
		}
		if (text[lt + 1] === "!") {
			const de = text.indexOf(">", lt + 1);
			if (de === -1) break;
			i = de + 1;
			continue;
		} // <!doctype …>
		if (text[lt + 1] === "?") {
			const pe = text.indexOf(">", lt + 1);
			if (pe === -1) break;
			i = pe + 1;
			continue;
		} // <? … ?>

		const closing = text[lt + 1] === "/";
		const nameStart = lt + (closing ? 2 : 1);
		const nm = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(text.slice(nameStart, nameStart + 64));
		if (!nm) {
			i = lt + 1;
			continue;
		} // a lone "<" — too noisy to flag
		const name = nm[0].toLowerCase();

		// walk to the tag's ">", respecting quoted attribute values
		let j = nameStart + nm[0].length,
			quote = "",
			selfClose = false,
			ch;
		while (j < n) {
			ch = text[j];
			if (quote) {
				if (ch === quote) quote = "";
				j++;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				j++;
				continue;
			}
			if (ch === ">") break;
			if (ch === "/") selfClose = true;
			else if (ch.trim()) selfClose = false;
			j++;
		}
		if (j >= n) {
			if (quote)
				diags.push({
					off: lt,
					kind: "HTML",
					msg: `A quote here is missing a matching ${C('"')} or ${C("'")}.`
				});
			else
				diags.push({
					off: lt,
					kind: "HTML",
					msg: `This ${C(`<${name}>`)} tag is missing its closing ${C(">")}.`
				});
			break;
		}
		const tagEnd = j + 1;

		if (closing) {
			let idx = -1;
			for (k = stack.length - 1; k >= 0; k--)
				if (stack[k].name === name) {
					idx = k;
					break;
				}
			if (idx === -1) {
				if (!HTML_OPTIONAL[name] && !HTML_VOID[name])
					diags.push({
						off: lt,
						kind: "HTML",
						msg: `There's a closing ${C(`</${name}>`)} here, but no ${C(`<${name}>`)} was opened.`
					});
			} else {
				for (k2 = stack.length - 1; k2 > idx; k2--)
					if (!HTML_OPTIONAL[stack[k2].name])
						diags.push({
							off: stack[k2].off,
							kind: "HTML",
							msg: `This ${C(`<${stack[k2].name}>`)} is missing a matching ${C(`</${stack[k2].name}>`)}.`
						});
				stack.length = idx;
			}
			i = tagEnd;
			continue;
		}

		if (!closing) checkAttrs(text.slice(nameStart + nm[0].length, j), nameStart + nm[0].length, name, diags);

		if (HTML_RAW[name] && !selfClose) {
			// skip raw text to the matching close
			const cre = new RegExp(`</${name}\\s*>`, "i");
			const rest = text.slice(tagEnd),
				cm = cre.exec(rest);
			if (cm) {
				i = tagEnd + cm.index + cm[0].length;
				continue;
			}
			diags.push({
				off: lt,
				kind: "HTML",
				msg: `This ${C(`<${name}>`)} is missing a matching ${C(`</${name}>`)}.`
			});
			break;
		}
		if (!HTML_VOID[name] && !selfClose) {
			if (HTML_OPTIONAL[name] && stack.length && stack[stack.length - 1].name === name) stack.pop(); // <li>…<li>
			stack.push({ name: name, off: lt });
		}
		i = tagEnd;
	}
	for (s = 0; s < stack.length; s++)
		if (!HTML_OPTIONAL[stack[s].name])
			diags.push({
				off: stack[s].off,
				kind: "HTML",
				msg: `This ${C(`<${stack[s].name}>`)} is missing a matching ${C(`</${stack[s].name}>`)}.`
			});
}

// ———————————————————————————
// CSS
// declaration-level checks
// ———————————————————————————
function cssTopColons(decl) {
	// count ":" not inside (...) or strings; record the first
	let depth = 0,
		q = "",
		first = -1,
		count = 0,
		c;
	for (let i = 0; i < decl.length; i++) {
		c = decl[i];
		if (q) {
			if (c === q) q = "";
			continue;
		}
		if (c === '"' || c === "'") {
			q = c;
			continue;
		}
		if (c === "(") depth++;
		else if (c === ")") {
			if (depth) depth--;
		} else if (c === ":" && depth === 0) {
			if (first === -1) first = i;
			count++;
		}
	}
	return { first: first, count: count };
}
function cssIsGroupAt(pre) {
	// at-rule whose block holds rules/keyframes, not declarations
	return /^\s*@(media|supports|document|-moz-document|container|layer|scope|keyframes|-webkit-keyframes|-moz-keyframes|font-feature-values)\b/i.test(
		pre
	);
}
// a small list used ONLY to suggest a correction for a typo'd property
const CSS_COMMON = [
	"color",
	"background",
	"background-color",
	"background-image",
	"background-size",
	"background-position",
	"background-repeat",
	"border",
	"border-radius",
	"border-color",
	"border-width",
	"border-style",
	"border-top",
	"border-bottom",
	"border-left",
	"border-right",
	"outline",
	"margin",
	"margin-top",
	"margin-bottom",
	"margin-left",
	"margin-right",
	"padding",
	"padding-top",
	"padding-bottom",
	"padding-left",
	"padding-right",
	"width",
	"height",
	"min-width",
	"max-width",
	"min-height",
	"max-height",
	"box-sizing",
	"display",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"float",
	"clear",
	"flex",
	"flex-direction",
	"flex-wrap",
	"flex-grow",
	"flex-shrink",
	"flex-basis",
	"justify-content",
	"align-items",
	"align-self",
	"align-content",
	"gap",
	"row-gap",
	"column-gap",
	"order",
	"grid",
	"grid-template-columns",
	"grid-template-rows",
	"grid-template-areas",
	"grid-column",
	"grid-row",
	"grid-area",
	"grid-gap",
	"font",
	"font-size",
	"font-family",
	"font-weight",
	"font-style",
	"line-height",
	"text-align",
	"text-decoration",
	"text-transform",
	"text-indent",
	"letter-spacing",
	"word-spacing",
	"white-space",
	"color",
	"opacity",
	"visibility",
	"overflow",
	"overflow-x",
	"overflow-y",
	"z-index",
	"cursor",
	"pointer-events",
	"transition",
	"transition-duration",
	"transition-property",
	"transform",
	"transform-origin",
	"animation",
	"box-shadow",
	"text-shadow",
	"content",
	"list-style",
	"list-style-type",
	"vertical-align",
	"object-fit",
	"filter",
	"backdrop-filter",
	"aspect-ratio"
];
function cssEditDist(a, b) {
	let m = a.length,
		n = b.length,
		i,
		j,
		prev = [],
		cur = [];
	if (Math.abs(m - n) > 2) return 99;
	for (j = 0; j <= n; j++) prev[j] = j;
	for (i = 1; i <= m; i++) {
		cur[0] = i;
		for (j = 1; j <= n; j++)
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur.slice();
	}
	return prev[n];
}
function cssSuggest(pn) {
	let best = null,
		bd = 3,
		d,
		i;
	for (i = 0; i < CSS_COMMON.length; i++) {
		d = cssEditDist(pn, CSS_COMMON[i]);
		if (d < bd) {
			bd = d;
			best = CSS_COMMON[i];
		}
	}
	return best ? `, did you mean "${best}"?` : "";
}
// names that are real but only inside an at-rule (@font-face, @page, @property, @counter-style), which CSS.supports doesn't know as properties — accepted anywhere, so a block the checker can't place never flags them
const CSS_DESCRIPTORS = new Set(
	`src unicode-range font-display ascent-override descent-override line-gap-override size-adjust font-named-instance
		size marks bleed page-orientation syntax inherits initial-value system symbols additive-symbols negative prefix suffix range pad speak-as fallback`.split(
		/\s+/
	)
);
function cssPropKnown(pn) {
	if (CSS_DESCRIPTORS.has(pn)) return true;
	// ask the browser itself whether this property exists
	try {
		if (typeof CSS === "undefined" || !CSS.supports) return true; // can't check -> don't flag
		return CSS.supports(pn, "inherit") || CSS.supports(pn, "initial");
	} catch (e) {
		return true;
	}
}
function cssCheckDecl(seg, segOff, base, diags, checkProps) {
	const origLead = seg.length - seg.replace(/^\s+/, "").length;
	const off = base + segOff + origLead;
	const d = seg
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/^\s+/, "")
		.replace(/\s+$/, ""); // strip comments + trim
	if (!d || d[0] === "@") return;
	const col = cssTopColons(d);
	if (col.count === 0) {
		diags.push({
			off: off,
			kind: "CSS",
			msg: `Missing a colon (${C(":")}) between the property and its value.`
		});
		return;
	}
	const prop = d.slice(0, col.first).replace(/^\s+|\s+$/g, "");
	const val = d.slice(col.first + 1).replace(/^\s+|\s+$/g, "");
	if (!prop) diags.push({ off: off, kind: "CSS", msg: "There's no property name before the colon." });
	else if (!val) diags.push({ off: off, kind: "CSS", msg: "There's no value after the colon." });
	else if (col.count > 1)
		diags.push({
			off: off,
			kind: "CSS",
			msg: `A semicolon (${C(";")}) may be missing at the end of a property definition.`
		});
	else if (
		checkProps &&
		/^[a-zA-Z-][a-zA-Z0-9-]*$/.test(prop) &&
		prop[0] !== "-" &&
		!cssPropKnown(prop.toLowerCase())
	)
		diags.push({
			off: off,
			kind: "CSS",
			msg: `"${prop}" isn't a CSS property your browser recognizes${cssSuggest(prop.toLowerCase())}.`
		});
}
function lintCssBlock(css, base, diags) {
	let i = 0,
		n = css.length,
		depth = 0,
		paren = 0,
		declBlock = [],
		propCheck = [],
		braceOff = [],
		segStart = 0,
		c,
		nx;
	while (i < n) {
		c = css[i];
		nx = css[i + 1];
		if (c === "/" && nx === "*") {
			const e = css.indexOf("*/", i + 2);
			if (e === -1) {
				diags.push({ off: base + i, kind: "CSS", msg: `This comment is missing ${C("*/")} to end it` });
				return;
			}
			i = e + 2;
			continue;
		}
		if (c === '"' || c === "'") {
			const qq = css.indexOf(c, i + 1);
			if (qq === -1) {
				diags.push({ off: base + i, kind: "CSS", msg: "This text is missing its closing quote." });
				return;
			}
			i = qq + 1;
			continue;
		}
		if (c === "(") {
			paren++;
			i++;
			continue;
		}
		if (c === ")") {
			if (paren) paren--;
			i++;
			continue;
		}
		if (paren > 0) {
			i++;
			continue;
		} // ignore ; { } : inside (...) e.g. url(data:…;…)
		if (c === "{") {
			const pre = css.slice(segStart, i),
				isDecl = !cssIsGroupAt(pre);
			declBlock.push(isDecl);
			// normal selector block, not @font-face/@page descriptors — comments are stripped first, so one sitting just above an @font-face doesn't hide the @
			propCheck.push(isDecl && pre.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s+/, "")[0] !== "@");
			braceOff.push(i);
			depth++;
			segStart = i + 1;
			i++;
			continue;
		}
		if (c === "}") {
			if (depth === 0) {
				diags.push({
					off: base + i,
					kind: "CSS",
					msg: `There's an extra ${C("}")} here with no matching ${C("{")}.`
				});
				segStart = i + 1;
				i++;
				continue;
			}
			if (declBlock[declBlock.length - 1])
				cssCheckDecl(css.slice(segStart, i), segStart, base, diags, propCheck[propCheck.length - 1]);
			depth--;
			declBlock.pop();
			propCheck.pop();
			braceOff.pop();
			segStart = i + 1;
			i++;
			continue;
		}
		if (c === ";") {
			if (depth > 0 && declBlock[declBlock.length - 1])
				cssCheckDecl(css.slice(segStart, i), segStart, base, diags, propCheck[propCheck.length - 1]);
			segStart = i + 1;
			i++;
			continue;
		}
		i++;
	}
	if (depth > 0)
		diags.push({ off: base + braceOff[0], kind: "CSS", msg: `This block is missing a ${C("}")} at the end.` });
}

// ———————————————————————————
// JS
// syntax (acorn) + light scope analysis
// ———————————————————————————
// names that are always available in the browser; `in globalThis` covers the rest at runtime
const JS_GLOBALS = new Set(
	`window document console navigator location history screen frames self top parent 
		alert confirm prompt setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame 
		requestIdleCallback queueMicrotask fetch XMLHttpRequest FormData URL URLSearchParams Blob File FileReader Headers Request Response 
		localStorage sessionStorage indexedDB caches Image Audio Option Event CustomEvent MouseEvent KeyboardEvent PointerEvent TouchEvent 
		Element HTMLElement Node NodeList Text Comment DocumentFragment getComputedStyle matchMedia 
		IntersectionObserver ResizeObserver MutationObserver performance crypto CSS DOMParser XMLSerializer TextEncoder TextDecoder 
		WebSocket Worker SharedWorker Notification atob btoa structuredClone scrollTo scrollBy open close postMessage 
		addEventListener removeEventListener dispatchEvent customElements speechSynthesis SpeechSynthesisUtterance 
		AudioContext OfflineAudioContext Path2D devicePixelRatio innerWidth innerHeight outerWidth outerHeight scrollX scrollY 
		Object Array String Number Boolean Symbol BigInt Math JSON Date RegExp Function Promise Map Set WeakMap WeakSet WeakRef Proxy Reflect 
		Error TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError 
		parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI eval 
		NaN Infinity undefined globalThis arguments this 
		ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array`.split(
		/\s+/
	)
);
function isGlobalName(n) {
	if (JS_GLOBALS.has(n)) return true;
	try {
		return typeof globalThis !== "undefined" && n in globalThis;
	} catch (e) {
		return false;
	}
}
function walkAst(node, cb) {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (let a = 0; a < node.length; a++) walkAst(node[a], cb);
		return;
	}
	if (typeof node.type === "string") cb(node);
	for (let k in node) {
		if (k === "type" || k === "start" || k === "end" || k === "loc" || k === "range") continue;
		const v = node[k];
		if (v && typeof v === "object") walkAst(v, cb);
	}
}
function patternNames(node, out) {
	// bound identifier names within a binding pattern
	if (!node) return;
	if (node.type === "Identifier") out.push(node.name);
	else if (node.type === "ObjectPattern")
		node.properties.forEach(function (p) {
			patternNames(p.type === "RestElement" ? p.argument : p.value, out);
		});
	else if (node.type === "ArrayPattern")
		node.elements.forEach(function (e) {
			patternNames(e, out);
		});
	else if (node.type === "AssignmentPattern") patternNames(node.left, out);
	else if (node.type === "RestElement") patternNames(node.argument, out);
}
function paramRefs(p, refs) {
	// reference identifiers inside default values / computed keys of params
	if (!p) return;
	if (p.type === "AssignmentPattern") {
		findRefs(p.right, refs);
		paramRefs(p.left, refs);
	} else if (p.type === "ObjectPattern")
		p.properties.forEach(function (pr) {
			if (pr.type === "RestElement") paramRefs(pr.argument, refs);
			else {
				if (pr.computed) findRefs(pr.key, refs);
				paramRefs(pr.value, refs);
			}
		});
	else if (p.type === "ArrayPattern")
		p.elements.forEach(function (e) {
			paramRefs(e, refs);
		});
	else if (p.type === "RestElement") paramRefs(p.argument, refs);
}
function findRefs(node, refs) {
	// identifiers used as value references (not bindings, keys, or labels)
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		node.forEach(function (c) {
			findRefs(c, refs);
		});
		return;
	}
	switch (node.type) {
		case "Identifier":
			refs.push(node);
			return;
		case "MemberExpression":
			findRefs(node.object, refs);
			if (node.computed) findRefs(node.property, refs);
			return;
		case "Property":
			if (node.computed) findRefs(node.key, refs);
			findRefs(node.value, refs);
			return;
		case "VariableDeclarator":
			findRefs(node.init, refs);
			return;
		case "FunctionDeclaration":
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			if (node.params)
				node.params.forEach(function (p) {
					paramRefs(p, refs);
				});
			findRefs(node.body, refs);
			return;
		case "ClassDeclaration":
		case "ClassExpression":
			if (node.superClass) findRefs(node.superClass, refs);
			findRefs(node.body, refs);
			return;
		case "MethodDefinition":
		case "PropertyDefinition":
			if (node.computed) findRefs(node.key, refs);
			findRefs(node.value, refs);
			return;
		case "LabeledStatement":
			findRefs(node.body, refs);
			return;
		case "BreakStatement":
		case "ContinueStatement":
		case "ThisExpression":
		case "Super":
		case "MetaProperty":
			return;
		case "ImportDeclaration":
			return;
		case "ExportNamedDeclaration":
			if (node.declaration) findRefs(node.declaration, refs);
			return;
		case "ExportDefaultDeclaration":
			findRefs(node.declaration, refs);
			return;
		default:
			for (let k in node) {
				if (k === "type" || k === "start" || k === "end" || k === "loc" || k === "range") continue;
				const v = node[k];
				if (v && typeof v === "object") findRefs(v, refs);
			}
	}
}
function collectBindings(ast, bound, constN, nonConstN) {
	walkAst(ast, function (node) {
		let t = node.type,
			names,
			i;
		if (t === "VariableDeclaration") {
			node.declarations.forEach(function (d) {
				names = [];
				patternNames(d.id, names);
				names.forEach(function (nm) {
					bound.add(nm);
					(node.kind === "const" ? constN : nonConstN).add(nm);
				});
			});
		} else if (t === "FunctionDeclaration" || t === "ClassDeclaration") {
			if (node.id) {
				bound.add(node.id.name);
				nonConstN.add(node.id.name);
			}
		}
		if (
			(t === "FunctionDeclaration" || t === "FunctionExpression" || t === "ArrowFunctionExpression") &&
			node.params
		)
			node.params.forEach(function (p) {
				names = [];
				patternNames(p, names);
				names.forEach(function (nm) {
					bound.add(nm);
					nonConstN.add(nm);
				});
			});
		if (t === "CatchClause" && node.param) {
			names = [];
			patternNames(node.param, names);
			names.forEach(function (nm) {
				bound.add(nm);
				nonConstN.add(nm);
			});
		}
		if (t === "ImportDeclaration")
			node.specifiers.forEach(function (s) {
				if (s.local) {
					bound.add(s.local.name);
					nonConstN.add(s.local.name);
				}
			});
		if (t === "AssignmentExpression" && node.left) {
			names = [];
			patternNames(node.left, names);
			names.forEach(function (nm) {
				bound.add(nm);
			});
		} // implicit globals: defined, but not a declaration
	});
}
function lintJsScripts(text, diags) {
	let scripts = [],
		hasExternalJs = false,
		m;
	const sRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
	while ((m = sRe.exec(text))) {
		const attrs = m[1] || "";
		if (/\btype\s*=\s*("|')?(?!\s*(text\/javascript|application\/javascript|module)\b)/i.test(attrs)) continue; // non-JS type
		if (/\bsrc\s*=/i.test(attrs)) {
			hasExternalJs = true;
			continue;
		} // external file may define globals
		scripts.push({
			code: m[2],
			base: text.indexOf(">", m.index) + 1,
			module: /\btype\s*=\s*["']?module/i.test(attrs)
		});
	}
	const parsed = [],
		bound = new Set(),
		constN = new Set(),
		nonConstN = new Set();
	scripts.forEach(function (sc) {
		let ast = null;
		try {
			ast = acorn.parse(sc.code, {
				ecmaVersion: "latest",
				sourceType: sc.module ? "module" : "script",
				allowReturnOutsideFunction: true,
				allowAwaitOutsideFunction: true
			});
		} catch (err) {
			diags.push({
				off: sc.base + (typeof err.pos === "number" ? err.pos : 0),
				kind: "JS",
				msg: friendlyJs(err.message)
			});
		}
		parsed.push(ast);
		if (ast) collectBindings(ast, bound, constN, nonConstN);
	});
	const constReassign = new Set();
	constN.forEach(function (nm) {
		if (!nonConstN.has(nm)) constReassign.add(nm);
	});
	scripts.forEach(function (sc, idx) {
		const ast = parsed[idx];
		if (!ast) return;
		// reassigning a const
		walkAst(ast, function (node) {
			const id =
				node.type === "AssignmentExpression" && node.left && node.left.type === "Identifier"
					? node.left
					: node.type === "UpdateExpression" && node.argument && node.argument.type === "Identifier"
						? node.argument
						: null;
			if (id && constReassign.has(id.name))
				diags.push({
					off: sc.base + id.start,
					kind: "JS",
					msg: `Can't change "${id.name}" because it was declared with const`
				});
		});
		// names that are never defined anywhere (skip when an external script could define globals)
		if (!hasExternalJs) {
			const refs = [];
			findRefs(ast, refs);
			let seen = {};
			refs.forEach(function (node) {
				let nm = node.name;
				if (seen[nm] || bound.has(nm) || isGlobalName(nm)) return;
				seen[nm] = 1;
				diags.push({
					off: sc.base + node.start,
					kind: "JS",
					msg: `"${nm}" is not defined (check the spelling, or declare it with ${C("let")} or ${C("const")})`
				});
			});
		}
	});
}

// add line numbers, sort by position, drop duplicates
function finalizeDiags(text, diags) {
	diags.forEach(function (d) {
		d.line = lineNo(text, d.off);
	});
	diags.sort(function (a, b) {
		return a.off - b.off;
	});
	let seen = {},
		out = [];
	diags.forEach(function (d) {
		let key = `${d.off}|${d.msg}`;
		if (!seen[key]) {
			seen[key] = 1;
			out.push(d);
		}
	});
	return out;
}
// a full HTML document (with embedded <style>/<script>)
function lintDoc(text) {
	let diags = [],
		m;
	lintHtml(text, diags);
	lintJsScripts(text, diags);
	const styRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
	while ((m = styRe.exec(text))) lintCssBlock(m[1], text.indexOf(">", m.index) + 1, diags);
	return finalizeDiags(text, diags);
}
// a standalone CSS file (the whole file is one stylesheet)
function lintCssFile(text) {
	const diags = [];
	lintCssBlock(text, 0, diags);
	return finalizeDiags(text, diags);
}
// a standalone JS file (parse with acorn; try script then module so either style is fine)
function lintJsFile(text) {
	const opts = { ecmaVersion: "latest", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
	try {
		acorn.parse(text, Object.assign({ sourceType: "script" }, opts));
		return [];
	} catch (e1) {
		try {
			acorn.parse(text, Object.assign({ sourceType: "module" }, opts));
			return [];
		} catch (e2) {
			return finalizeDiags(text, [
				{ off: typeof e2.pos === "number" ? e2.pos : 0, kind: "JS", msg: friendlyJs(e2.message) }
			]);
		}
	}
}
// a standalone json file: scan for the common beginner mistakes (single quotes, trailing commas, comments — each with a clear message and a precise spot), then fall back to JSON.parse for anything structural we didn't name
function jsonErrOff(e, text) {
	const m = /position (\d+)/i.exec(e.message);
	if (m) return +m[1];
	const lc = /line (\d+) column (\d+)/i.exec(e.message);
	if (lc) {
		let ln = +lc[1],
			col = +lc[2],
			off = 0,
			lines = text.split("\n");
		for (let k = 0; k < ln - 1 && k < lines.length; k++) off += lines[k].length + 1;
		return off + col - 1;
	}
	return 0;
}
function friendlyJson(msg) {
	return `This isn't valid JSON: ${codifyRaw(
		String(msg)
			.replace(/^JSON\.parse:\s*/i, "")
			.replace(/\s+of the JSON data\.?$/i, "")
	)}.`;
}
function lintJsonFile(text) {
	if (!text.trim()) return []; // an empty file is fine
	let diags = [],
		i = 0,
		n = text.length,
		inStr = false,
		esc = false;
	function push(off, msg) {
		diags.push({ off: off, kind: "JSON", msg: msg });
	}
	while (i < n) {
		const c = text[i];
		if (inStr) {
			if (esc) {
				esc = false;
				i++;
				continue;
			}
			if (c === "\\") {
				esc = true;
				i++;
				continue;
			}
			if (c === '"') inStr = false;
			i++;
			continue;
		}
		if (c === '"') {
			inStr = true;
			i++;
			continue;
		}
		if (c === "'") {
			push(i, "JSON strings must be wrapped in double quotes, not single quotes.");
			i++;
			while (i < n && text[i] !== "'") {
				if (text[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}
		if (c === "/" && text[i + 1] === "/") {
			push(i, 'JSON doesn\'t allow comments. Remove this "//" comment.');
			while (i < n && text[i] !== "\n") i++;
			continue;
		}
		if (c === "/" && text[i + 1] === "*") {
			push(i, 'JSON doesn\'t allow comments. Remove this "/* */" comment.');
			i += 2;
			while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		if (c === ",") {
			let j = i + 1;
			while (j < n && /\s/.test(text[j])) j++;
			if (text[j] === "}" || text[j] === "]") push(i, `Remove the trailing comma before "${text[j]}".`);
		}
		i++;
	}
	if (!diags.length) {
		try {
			JSON.parse(text);
		} catch (e) {
			push(jsonErrOff(e, text), friendlyJson(e.message));
		}
	}
	return finalizeDiags(text, diags);
}
// lint the given text according to a file's language
function lintFile(text, lang) {
	if (lang === "css") return lintCssFile(text);
	if (lang === "javascript") return lintJsFile(text);
	if (lang === "html") return lintDoc(text);
	if (lang === "json") return lintJsonFile(text);
	return []; // media / text: nothing to lint
}

export { lintFile, renderLintMsg };
