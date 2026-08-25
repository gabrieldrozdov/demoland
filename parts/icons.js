// ———————————————————————————
// FILE-TYPE ICONS
// for the editor tab bar — small currentColor svgs per file kind plus a "home" icon for the entry file; fileIconSvg(file, isEntry) returns an svg string
// ———————————————————————————
import { mediaKind } from "./media.js?v=0f837142";

// simple currentColor icons per file kind (16x16). The entry file gets a "home" icon.
const TAB_ICONS = {
	home: '<svg viewBox="0 0 100 100"><path d="m50,10L15,45v45h70v-45L50,10Zm-25,70v-30.858l25-25,25,25v30.858H25Z"/></svg>',
	html: '<svg viewBox="0 0 100 100"><path d="m45,15v30h-10v-10h-10v10h-10V15h10v10h10v-10h10Zm10,0v10h10v20h10v-20h10v-10h-30Zm10,60v-20h-10v30h30v-10h-20Zm-30-20l-2,7h-6l-2-7h-10v30h8l1-17h1l2,10h6l2-10h1l1,17h8v-30h-10Z"/></svg>',
	css: '<svg viewBox="0 0 100 100"><path d="m30,30v10h-10v20h10v10H10V30h20Zm10,20h10v-10h10v-10h-20v20Zm50-10v-10h-20v20h10v-10h10Zm-20,20v10h20v-20h-10v10h-10Zm-30,0v10h20v-20h-10v10h-10Z"/></svg>',
	js: '<svg viewBox="0 0 100 100"><path d="m70,40v10h-15v-20h30v10h-15Zm-35,20H15v10h30V30h-10v30Zm20,0v10h30v-20h-15v10h-15Z"/></svg>',
	json: '<svg viewBox="0 0 100 100"><polygon points="35 35 15 35 15 45 45 45 45 15 35 15 35 35"/><polygon points="55 35 55 45 85 45 85 30 70 30 70 35 55 35"/><polygon points="85 25 85 15 55 15 55 30 70 30 70 25 85 25"/><path d="M15,85h30v-30H15v30ZM25,65h10v10h-10v-10Z"/><polygon points="75 65 65 55 55 55 55 85 65 85 65 75 75 85 85 85 85 55 75 55 75 65"/></svg>',
	font: '<svg viewBox="0 0 100 100"><path d="M55,20h-10l-25,60h10l7.5-18h25l7.5,18h10l-25-60ZM41.67,52l8.33-20,8.33,20h-16.67Z"/></svg>',
	image: '<svg viewBox="0 0 100 100"><path d="m10,20v60h80V20H10Zm70,50l-20-20-20,20h-20V30h60v40Z" stroke-width="0"/><circle cx="36" cy="46" r="10"/></svg>',
	video: '<svg viewBox="0 0 100 100"><polygon points="10 30 10 70 60 70 60 50 60 30 10 30"/><polygon points="60 50 90 80 90 20 60 50"/></svg>',
	audio: '<svg viewBox="0 0 100 100"><polygon points="10 35 10 65 25 65 50 85 50 15 25 35 10 35"/><rect x="60" y="40" width="10" height="20"/><rect x="80" y="30" width="10" height="40"/></svg>',
	file: '<svg viewBox="0 0 100 100"><path d="m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z"/></svg>'
};
export function fileIconSvg(f, isEntry) {
	if (isEntry) return TAB_ICONS.home;
	if (f.lang === "html") return TAB_ICONS.html;
	if (f.lang === "css") return TAB_ICONS.css;
	if (f.lang === "javascript") return TAB_ICONS.js;
	if (f.lang === "json") return TAB_ICONS.json;
	if (f.lang === "media") {
		const k = mediaKind(f.name);
		return TAB_ICONS[k] || TAB_ICONS.file;
	}
	return TAB_ICONS.file;
}
