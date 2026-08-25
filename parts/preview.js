// ———————————————————————————
// PREVIEW BUILDER
// turns the demo's files into one runnable, sandboxed document; pure and editor-free, since the file list, entry page and cached font data are passed in and editor.js owns the iframe, the console ui and the render loop
// exports: assemblePreview(files, entryName, fontDataUrl) inlines local css/js/media into one html string, buildDoc(assembledHtml, files, entryName) injects the loop guard and the console/anchor/fetch shims, resolveFile(baseName, ref, list) does a folder-aware lookup of a referenced file
// ———————————————————————————
import { mediaKind } from "./media.js?v=0f837142";

// split on purpose (not a template literal): a whole "</script>" in this source would close the host script tag when a page inlines this module
const OPEN = "<scr" + "ipt>";
const CLOSE = "</scr" + "ipt>";

// ———————————————————————————
// LOOP GUARD
// injected into the preview: __lp(id) runs at the top of every loop body and throws once a loop passes its time budget, turning an infinite loop into a catchable error instead of a frozen tab
// ———————————————————————————
const GUARD = `window.__lp_s={};window.__lp_l={};
	window.__lp=function(id){var n=Date.now();
	if(window.__lp_l[id]===undefined||n-window.__lp_l[id]>100)window.__lp_s[id]=n;
	window.__lp_l[id]=n;
	if(n-window.__lp_s[id]>1000){throw new Error('Possible infinite loop - a loop ran for over 1s and was stopped.');}};`;

// ———————————————————————————
// CONSOLE + EVAL BRIDGE
// injected into the preview
// ———————————————————————————
const BRIDGE = `(function(){
	  function ser(v){try{
	    if(v===undefined)return 'undefined'; if(v===null)return 'null';
	    if(typeof v==='string')return v;
	    if(typeof v==='function')return v.toString().split('{')[0].trim();
	    if(v&&v.nodeType)return '<'+v.nodeName.toLowerCase()+'>';
	    if(v instanceof Error)return v.name+': '+v.message;
	    if(typeof v==='object')return JSON.stringify(v);
	    return String(v);
	  }catch(e){return String(v);}}
	  function join(a){return [].map.call(a,ser).join(' ');}
	  var evalLogged=false;
	  function send(level,text){parent.postMessage({__cm6:true,level:level,text:text},'*');}
	  ['log','info','warn','error','debug'].forEach(function(m){
	    var o=console[m];
	    console[m]=function(){evalLogged=true;send(m==='info'||m==='debug'?'log':m,join(arguments));if(o)o.apply(console,arguments);};
	  });
	  window.addEventListener('error',function(e){send('error',e.message+(e.lineno?'  (line '+e.lineno+')':''));});
	  window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error','Uncaught (in promise) '+(r&&r.message?r.message:ser(r)));});
	  window.addEventListener('message',function(e){var d=e.data;if(!d||!d.__cm6eval)return;
	    evalLogged=false;
	    try{var res=(0,eval)(d.code);
	      if(!(res===undefined&&evalLogged))send('result',ser(res));}
	    catch(err){send('error',err.name+': '+err.message);}});
	  parent.postMessage({__cm6ready:true},'*');
	})();`;

// ———————————————————————————
// LINK HANDLING
// injected into the preview, which runs from an about:srcdoc document where links can't resolve normally: same-page "#section" links scroll within the preview, links to another local file (e.g. about.html) are posted to the parent which re-assembles that page, and external urls behave normally
// ———————————————————————————
const ANCHORS = `(function(){document.addEventListener('click',function(e){
	  var a=e.target&&e.target.closest&&e.target.closest('a[href]');
	  if(!a)return; var href=a.getAttribute('href');
	  if(!href)return;
	  if(href.charAt(0)==='#'){e.preventDefault();
	    if(href==='#'){var r=document.scrollingElement||document.documentElement;if(r)r.scrollTo({top:0});return;}
	    var id=decodeURIComponent(href.slice(1));
	    var t=document.getElementById(id)||(document.getElementsByName(id)||[])[0];
	    if(t&&t.scrollIntoView)t.scrollIntoView({block:'start'});return;}
	  if(/^(https?:|data:|blob:|mailto:|tel:|\\/\\/)/i.test(href))return;
	  e.preventDefault(); parent.postMessage({__cm6nav:href},'*');
	},true);})();`;

// walk js and insert __lp() guards at the top of each loop body, skipping strings and comments so we don't corrupt them
function protectLoops(code) {
	let out = "",
		i = 0,
		n = code.length,
		id = 0,
		st = "code";
	const word = /[A-Za-z0-9_$]/,
		ws = /\s/;
	while (i < n) {
		const c = code[i];
		if (st === "code") {
			if (c === "/" && code[i + 1] === "/") {
				st = "line";
				out += c;
				i++;
				continue;
			}
			if (c === "/" && code[i + 1] === "*") {
				st = "block";
				out += c;
				i++;
				continue;
			}
			if (c === '"') {
				st = "dq";
				out += c;
				i++;
				continue;
			}
			if (c === "'") {
				st = "sq";
				out += c;
				i++;
				continue;
			}
			if (c === "`") {
				st = "tpl";
				out += c;
				i++;
				continue;
			}
			if ((c === "f" || c === "w" || c === "d") && (i === 0 || !word.test(code[i - 1]))) {
				const rest = code.slice(i);
				const kw = /^for\b/.test(rest)
					? "for"
					: /^while\b/.test(rest)
						? "while"
						: /^do\b/.test(rest)
							? "do"
							: null;
				if (kw) {
					out += kw;
					i += kw.length;
					while (i < n && ws.test(code[i])) {
						out += code[i];
						i++;
					}
					if (kw !== "do" && code[i] === "(") {
						let depth = 0;
						do {
							const cc = code[i];
							out += cc;
							if (cc === "(") depth++;
							else if (cc === ")") depth--;
							i++;
						} while (i < n && depth > 0);
						while (i < n && ws.test(code[i])) {
							out += code[i];
							i++;
						}
					}
					if (code[i] === "{") {
						out += `{window.__lp(${id++});`;
						i++;
					}
					continue;
				}
			}
			out += c;
			i++;
		} else if (st === "sq") {
			out += c;
			if (c === "\\") {
				out += code[i + 1] || "";
				i += 2;
				continue;
			}
			if (c === "'") st = "code";
			i++;
		} else if (st === "dq") {
			out += c;
			if (c === "\\") {
				out += code[i + 1] || "";
				i += 2;
				continue;
			}
			if (c === '"') st = "code";
			i++;
		} else if (st === "tpl") {
			out += c;
			if (c === "\\") {
				out += code[i + 1] || "";
				i += 2;
				continue;
			}
			if (c === "`") st = "code";
			i++;
		} else if (st === "line") {
			out += c;
			if (c === "\n") st = "code";
			i++;
		} else if (st === "block") {
			out += c;
			if (c === "*" && code[i + 1] === "/") {
				out += "/";
				i += 2;
				st = "code";
				continue;
			}
			i++;
		}
	}
	return out;
}

// built from split pieces so the literal tag sequence never appears in this source
const RE_SCRIPT = new RegExp("(<scr" + "ipt\\b[^>]*>)([\\s\\S]*?)(</scr" + "ipt>)", "gi");

// rewrite inline script-tag bodies with loop protection (best-effort; falls back on error)
function guardScripts(doc) {
	return doc.replace(RE_SCRIPT, function (m, open, body, close) {
		if (/\bsrc\s*=/.test(open)) return m; // external script: leave alone
		try {
			return open + protectLoops(body) + close;
		} catch (e) {
			return m;
		}
	});
}

function buildDoc(doc, files, previewEntry) {
	const guarded = guardScripts(doc);
	const inject = OPEN + GUARD + BRIDGE + ANCHORS + fetchShim(files, previewEntry) + CLOSE;
	if (/<head[^>]*>/i.test(guarded))
		return guarded.replace(/<head[^>]*>/i, function (mm) {
			return mm + inject;
		});
	if (/<html[^>]*>/i.test(guarded))
		return guarded.replace(/<html[^>]*>/i, function (mm) {
			return mm + inject;
		});
	return inject + guarded;
}

// ———————————————————————————
// PREVIEW ASSEMBLER
// multi-file inline-and-shim: given the demo's files and the entry html, inline any referenced local css/js files and rewrite local media to data urls, producing one runnable document; external urls (http/https/data/anchors) are left alone and there is no fetch/module support yet
// ———————————————————————————
function mimeFor(name) {
	const ext = (String(name).split(".").pop() || "").toLowerCase();
	return (
		{
			html: "text/html",
			htm: "text/html",
			css: "text/css",
			js: "text/javascript",
			mjs: "text/javascript",
			json: "application/json",
			svg: "image/svg+xml",
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			webp: "image/webp",
			avif: "image/avif",
			ico: "image/x-icon"
		}[ext] || "application/octet-stream"
	);
}
// ———————————————————————————
// PATH RESOLUTION
// folder-aware: resolve a reference (href/src/url) against a base file's folder, supporting "./", "../", root-relative "/x", bare names, and folder links (a trailing "/" or an extensionless directory) that fall back to that folder's index.html; external urls and "#" anchors return null so they're left untouched
// ———————————————————————————
function dirOf(name) {
	const i = String(name).lastIndexOf("/");
	return i < 0 ? "" : name.slice(0, i + 1);
}
function normRef(baseName, ref) {
	ref = String(ref).split(/[?#]/)[0];
	if (!ref || ref.charAt(0) === "#") return null;
	if (/^(https?:|data:|blob:|mailto:|tel:|\/\/)/i.test(ref)) return null;
	const trailing = /\/$/.test(ref);
	const path = ref.charAt(0) === "/" ? ref.slice(1) : dirOf(baseName) + ref;
	const parts = path.split("/"),
		stack = [];
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (p === "" || p === ".") continue;
		if (p === "..") {
			stack.pop();
			continue;
		}
		stack.push(p);
	}
	return { path: stack.join("/"), folder: trailing };
}
// the file object a reference points at, searched in `list` — a folder link (or a path with no matching file) falls back to <folder>/index.html
function resolveFile(baseName, ref, list) {
	const r = normRef(baseName, ref);
	if (!r) return null;
	function get(n) {
		for (let i = 0; i < list.length; i++) if (list[i].name === n) return list[i];
		return null;
	}
	if (!r.folder && r.path) {
		const exact = get(r.path);
		if (exact) return exact;
	}
	return get(`${r.path ? `${r.path}/` : ""}index.html`) || null;
}

// serve the demo's own text files to the sandboxed preview's fetch() calls (e.g. fetch("data.json")) — a local path resolves to a file in the project, anything external (http/https/data/blob) falls through to the real fetch
function fetchShim(files, previewEntry) {
	let map = {};
	for (let i = 0; i < files.length; i++) {
		let f = files[i];
		if (f.lang === "media") continue;
		map[f.name] = { t: f.content, m: mimeFor(f.name) };
	}
	const payload = JSON.stringify(map).replace(/</g, "\\u003c");
	return `(function(){if(typeof window.fetch!=='function')return;var FILES=${payload},BASE=${JSON.stringify(dirOf(previewEntry))},real=window.fetch.bind(window);function res(u){u=String(u).split(/[?#]/)[0];if(/^(https?:|data:|blob:|\\/\\/)/i.test(u))return null;var path=u.charAt(0)==='/'?u.slice(1):BASE+u,parts=path.split('/'),st=[];for(var i=0;i<parts.length;i++){var p=parts[i];if(p===''||p==='.')continue;if(p==='..'){st.pop();continue;}st.push(p);}return st.join('/');}window.fetch=function(input,init){try{var u=(input&&input.url)?input.url:input,k=res(u);if(k&&Object.prototype.hasOwnProperty.call(FILES,k)){var f=FILES[k];return Promise.resolve(new Response(f.t,{status:200,headers:{'Content-Type':f.m}}));}}catch(e){}return real(input,init);};})();`;
}

function assemblePreview(fileList, entryName, fontDataUrl) {
	let entry = null;
	for (let i = 0; i < fileList.length; i++)
		if (fileList[i].name === entryName) {
			entry = fileList[i];
			break;
		}
	if (!entry)
		for (let j = 0; j < fileList.length; j++)
			if (fileList[j].lang === "html") {
				entry = fileList[j];
				break;
			}
	if (!entry) entry = fileList[0];
	if (!entry) return "";
	let base = entry.name,
		out = entry.content;
	function dataUrl(f) {
		if (f.lang === "media") {
			// fonts are fetched by the parent page and inlined as data urls (see ensureFontData) because the sandboxed preview has an opaque origin, so a cross-origin @font-face url is cors-blocked; images, audio and video load fine cross-origin and keep the real url
			if (f.src && mediaKind(f.name) === "font" && !/^data:/i.test(f.src)) {
				const cached = fontDataUrl && fontDataUrl(f.src);
				if (cached) return cached;
			}
			return f.src || "";
		}
		return `data:${mimeFor(f.name)};charset=utf-8,${encodeURIComponent(f.content)}`;
	}
	// url(...) inside a CSS file resolves relative to that CSS file's own folder
	function rewriteCssUrls(cssText, cssBase) {
		return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (whole, q, ref) {
			const f = resolveFile(cssBase, ref, fileList);
			return f ? `url(${dataUrl(f)})` : whole;
		});
	}
	out = out.replace(/<link\b[^>]*>/gi, function (tag) {
		if (!/rel\s*=\s*["']?\s*stylesheet/i.test(tag)) return tag;
		const m = tag.match(/href\s*=\s*["']([^"']+)["']/i),
			f = m && resolveFile(base, m[1], fileList);
		return f ? `<style>\n${rewriteCssUrls(f.content, f.name)}\n</style>` : tag;
	});
	out = out.replace(/<script\b([^>]*)>\s*<\/script>/gi, function (whole, attrs) {
		const m = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i),
			f = m && resolveFile(base, m[1], fileList);
		if (!f) return whole;
		return `<script${/type\s*=\s*["']?\s*module/i.test(attrs) ? ' type="module"' : ""}>\n${f.content}\n</script>`;
	});
	out = out.replace(
		/(<(?:img|source|audio|video|track|image)\b[^>]*?\b(?:src|href|xlink:href)\s*=\s*["'])([^"']+)(["'])/gi,
		function (whole, a, ref, b) {
			const f = resolveFile(base, ref, fileList);
			return f ? a + dataUrl(f) + b : whole;
		}
	);
	out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (whole, q, ref) {
		const f = resolveFile(base, ref, fileList);
		return f ? `url(${dataUrl(f)})` : whole;
	});
	return out;
}

export { assemblePreview, buildDoc, resolveFile };
