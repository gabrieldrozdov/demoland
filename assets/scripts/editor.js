const colors = ['red', 'blue', 'purple', 'yellow', 'green', 'pink'];
const container = document.querySelector('.container');

// Search params
const pageHref = window.location.search;
const searchParams = new URLSearchParams(pageHref.substring(pageHref.indexOf('?')));

// ———————————————————————————————————
// TOOLTIPS
// ———————————————————————————————————

// Add event listeners for all tooltip-related items
window.addEventListener('mousemove', (e) => {positionTooltip(e)});
function refreshTooltips() {
	for (let btn of document.querySelectorAll('[data-tooltip-text]')) {
		btn.addEventListener('mouseenter', (e) => {setTooltip(e, btn)})
		btn.addEventListener('mouseleave', () => {hideTooltip()})
	}
}
refreshTooltips();

// Wait until mouse moved before showing tooltip
setTimeout(() => {
	window.addEventListener('mousemove', showTooltip);
}, 100)
function showTooltip() {
	const tooltipContainer = document.querySelector('.tooltip-container');
	tooltipContainer.style.opacity = 1;
	window.removeEventListener('mousemove', showTooltip);
}

// Move tooltip
function positionTooltip(e) {
	let tooltip = document.querySelector('.tooltip');
	if (tooltip.dataset.direction == 'left') {
		tooltip.style.right = '';
		tooltip.style.top = e.clientY + "px";
		tooltip.style.bottom = '';
		tooltip.style.left = e.clientX + "px";
	} else if (tooltip.dataset.direction == 'right') {
		tooltip.style.top = e.clientY + "px";
		tooltip.style.right = window.innerWidth*2-e.clientX + "px"; // *2 for overflow fix
		tooltip.style.bottom = '';
		tooltip.style.left = '';
	} else if (tooltip.dataset.direction == 'top') {
		tooltip.style.top = e.clientY + "px";
		tooltip.style.right = '';
		tooltip.style.bottom = '';
		tooltip.style.left = e.clientX + "px";

		// Prevent cropping
		let rect = tooltip.getBoundingClientRect();
		let diffRight = window.innerWidth - rect.right - 16;
		if (diffRight < 0) {
			tooltip.style.left = e.clientX+diffRight + "px";
		}
		let diffLeft = rect.left - 16;
		if (diffLeft < 0) {
			tooltip.style.left = `${e.clientX-diffLeft}px`;
		}
	} else if (tooltip.dataset.direction == 'bottom') {
		tooltip.style.top = '';
		tooltip.style.right = '';
		tooltip.style.bottom = window.innerHeight-e.clientY + "px";
		tooltip.style.left = e.clientX + "px";

		// Prevent cropping
		let rect = tooltip.getBoundingClientRect();
		let diffRight = window.innerWidth - rect.right - 16;
		if (diffRight < 0) {
			tooltip.style.left = e.clientX+diffRight + "px";
		}
		let diffLeft = rect.left - 16;
		if (diffLeft < 0) {
			tooltip.style.left = `${e.clientX-diffLeft}px`;
		}
	}
}

// Set tooltip content and type
function setTooltip(e, btn) {
	let tooltip = document.querySelector('.tooltip');
	e.stopPropagation();
	tooltip.dataset.hide = 0;
	tooltip.querySelector('p').innerText = btn.dataset.tooltipText;
	tooltip.dataset.direction = btn.dataset.tooltipDirection;
}

// Hide tooltip
function hideTooltip() {
	let tooltip = document.querySelector('.tooltip');
	tooltip.dataset.hide = 1;
}

// ———————————————————————————————————
// PANELS
// ———————————————————————————————————

// Resize panels
let resizers = document.querySelectorAll('.resizer');
for (let resizer of resizers) {
	resizer.addEventListener('mousedown', (e) => {startResize(e, resizer)});
}
function startResize(e1, resizer) {
	document.addEventListener('mousemove', updateResize);
	document.addEventListener('mouseup', endResize);
	disableIframes();

	let x1 = e1.clientX;
	let col1, col2;

	if (resizer.id == 'resizer1') {
		col1 = document.querySelector('#info');
		if (openPanels['editor']) {
			col2 = document.querySelector('#editor');
		} else if (openPanels['preview']) {
			col2 = document.querySelector('#preview');
		}
	} else if (resizer.id == 'resizer2') {
		if (openPanels['editor']) {
			col1 = document.querySelector('#editor');
		} else if (openPanels['info']) {
			col1 = document.querySelector('#info');
		}
		col2 = document.querySelector('#preview');
	}

	let offset1 = parseFloat(col1.dataset.offset);
	let offset2 = parseFloat(col2.dataset.offset);

	function updateResize(e2) {
		let x2 = e2.clientX;
		let delta = x2 - x1;
		let defaultSize = 100/openPanelsLength;
		if (delta > 0 && offset2+defaultSize < 15) {
			return
		} else if (delta < 0 && offset1+defaultSize < 15) {
			return
		}
		let deltaPercent = (delta/window.innerWidth)*100;
		offset1 += deltaPercent;
		offset2 -= deltaPercent;
		col1.dataset.offset = offset1;
		col2.dataset.offset = offset2;
		col1.style.width = `calc(calc(calc(100% - ${(openPanelsLength-1)*8}px) / ${openPanelsLength}) + ${offset1}%)`;
		col2.style.width = `calc(calc(calc(100% - ${(openPanelsLength-1)*8}px) / ${openPanelsLength}) + ${offset2}%)`;
		x1 = x2;
	}

	function endResize() {
		document.removeEventListener('mousemove', updateResize);
		document.removeEventListener('mouseup', endResize);
		enableIframes();
		cm.refresh();
	}
}

// Toggle panels to hide/show
let openPanels = {
	'info': true,
	'editor': true,
	'preview': true
}
let openPanelsLength = 3;
function togglePanel(target) {
	let panel = document.querySelector("#"+target);
	let toggle = document.querySelector('#toggle-'+target);
	if (openPanels[target]) {
		openPanels[target] = false;
		panel.dataset.hide = 1;
		toggle.dataset.active = 0;
	} else {
		openPanels[target] = true;
		panel.dataset.hide = 0;
		toggle.dataset.active = 1;
	}
	resetPanels();
}

// Open all panels
function openAllPanels() {
	openPanels = {
		'info': true,
		'editor': true,
		'preview': true
	}
	const panelInfo = document.querySelector("#info");
	const toggleInfo = document.querySelector('#toggle-info');
	panelInfo.dataset.hide = 0;
	toggleInfo.dataset.active = 1;
	const panelEditor = document.querySelector("#editor");
	const toggleEditor = document.querySelector('#toggle-editor');
	panelEditor.dataset.hide = 0;
	toggleEditor.dataset.active = 1;
	const panelPreview = document.querySelector("#preview");
	const togglePreview = document.querySelector('#toggle-preview');
	panelPreview.dataset.hide = 0;
	togglePreview.dataset.active = 1;
}

// Reset panel sizes
function resetPanels() {
	openPanelsLength = 3;
	let emptyNotice = document.querySelector('.panel-empty');
	for (let panel of Object.keys(openPanels)) {
		if (!openPanels[panel]) {
			openPanelsLength--;
		}
	}
	if (openPanelsLength == 0) {
		// Show empty notice
		emptyNotice.dataset.hide = 0;
	} else {
		// Hide empty notice
		emptyNotice.dataset.hide = 1;

		// Calculate correct widths
		for (let panel of document.querySelectorAll('.panel')) {
			panel.style.width = `calc(calc(100% - ${(openPanelsLength-1)*8}px) / ${openPanelsLength})`;
			panel.dataset.offset = 0;
		}
	
		// Show relevant resizers
		let resizer1 = document.querySelector('#resizer1');
		let resizer2 = document.querySelector('#resizer2');
		resizer1.dataset.hide = 1;
		resizer2.dataset.hide = 1;
		if (openPanels['info'] && (openPanels['editor'] || openPanels['preview'])) {
			resizer1.dataset.hide = 0;
		}
		if (openPanels['editor'] && openPanels['preview']) {
			resizer2.dataset.hide = 0;
		}
	}
	cm.refresh();
}

// Disable iframes on any drag event
function disableIframes() {
	for (let iframe of document.querySelectorAll('iframe')) {
		iframe.style.pointerEvents = 'none';
	}
}
function enableIframes() {
	for (let iframe of document.querySelectorAll('iframe')) {
		iframe.style.pointerEvents = '';
	}
}

// ———————————————————————————————————
// CONTENT
// ———————————————————————————————————

// Info navbar
function openChapter() {
	const infoNav = document.querySelector('.info-nav');
	const infoNavDemos = document.querySelector('.info-nav-demos');
	if (parseInt(infoNav.dataset.active) == 1) {
		infoNav.dataset.active = 0;
		infoNavDemos.dataset.active = 0;
	} else {
		infoNav.dataset.active = 1;
		infoNavDemos.dataset.active = 1;
	}
}

// Generate editor
let cm;
let consoleActive = false;
let lineWrap = false;
let editorFontsize = 14;
let delay = false;
let paused = false;
let currentSettings = {
	"console": undefined,
	"linewrapping": undefined,
	"fontsize": undefined,
	"delay": undefined,
	"paused": undefined
};
function generateEditor() {
	// Detect editor settings
	if (searchParams.has('console')) {
		if (searchParams.get('console') == "true") {
			consoleActive = true;
			editorRefreshConsole();
			currentSettings['console'] = consoleActive;
		}
	}
	if (searchParams.has('linewrapping')) {
		if (searchParams.get('linewrapping') == "true") {
			lineWrap = true;
			editorRefreshWrapping();
			currentSettings['linewrapping'] = lineWrap;
		}
	}
	if (searchParams.has('fontsize')) {
		if (parseInt(searchParams.get('fontsize')) != undefined ) {
			editorFontsize = parseInt(searchParams.get('fontsize'));
			if (isNaN(editorFontsize)) {
				editorFontsize = 14;
			}
			editorRefreshFontsize();
			currentSettings['fontsize'] = editorFontsize;
		}
	}
	if (searchParams.has('delay')) {
		if (searchParams.get('delay') == "true") {
			delay = true;
			editorRefreshDelay();
			currentSettings['delay'] = delay;
		}
	}
	if (searchParams.has('paused')) {
		if (searchParams.get('paused') == "true") {
			paused = true;
			editorRefreshPause();
			currentSettings['paused'] = paused;
		}
	}
	
	const editor = document.querySelector('.editor-content');
	cm = CodeMirror(editor, {
		mode: "htmlmixed",
		value: '<h1>Hello World!</h1>',
		autoCloseTags: true,
		autoCloseBrackets: true,
		matchBrackets: true,
		smartIndent: true,
		indentWithTabs: true,
		lineNumbers: true,
		tabSize: 4,
		indentUnit: 4,
		showHint: true,
		extraKeys: {
			"Ctrl-Space": "autocomplete",
			"Ctrl-[": "indentLess",
			"Ctrl-]": "indentMore",
			'Cmd-/': 'toggleComment',
			'Ctrl-/': 'toggleComment',
		},
		lineWrapping: lineWrap,
		theme: "gdwithgd",
	});
	cm.on("change", updatePreview);

	// Detect chapter
	if (searchParams.has('chapter')) {
		activeChapter = searchParams.get('chapter');
	} else {
		// Default to first chapter and demo if not chapter available
		activeChapter = Object.keys(bookData)[0];
	}

	// Detect demo
	if (searchParams.has('demo')) {
		activeDemo = searchParams.get('demo');
	} else {
		// Default to first demo if none selected
		activeDemo = Object.keys(bookData[activeChapter]['demos'])[0];
	}

	fetchInfo();
	populateInfo();

	window.addEventListener("focus", cm.refresh());

	cm.on("renderLine", function(cm, line, elmnt) {
		let tabs = CodeMirror.countColumn(line.text, null, 1);
		elmnt.style.textIndent = `-${tabs*2.4}em`;
		elmnt.style.paddingLeft = `calc(${tabs*2.4}em + 4px)`;
	});
	cm.refresh();
}

// Fetch relevant JSON file and find demo information
let overviewData, bookData, activeBook, activeChapter, activeDemo;
async function fetchOverview() {
	// Fetch overview data
	try {
		let response = await fetch(`../overview.json`);
		response.json().then((json) => {
			overviewData = json;
			fetchData();
		});
	}
	catch(e) {
		alert("Something went wrong while trying to load the file! Try checking your Internet connection, refreshing the page, or making sure there are no typos in the URL.");
	}
}
async function fetchData() {
	// Read URL to detect which book to fetch
	if (searchParams.has('book')) {
		activeBook = searchParams.get('book');
	} else {
		// Default to tutorial if no book available
		activeBook = 'tutorial';
	}

	// Fetch book data
	console.log
	try {
		let response = await fetch(`../demos/${activeBook}/${activeBook}.json`);
		response.json().then((json) => {
			bookData = json;
			generateEditor();
		});
	}
	catch(e) {
		alert("Something went wrong while trying to load the file! Try checking your Internet connection, refreshing the page, or making sure there are no typos in the URL.");
	}
}
fetchOverview();

// Populate info and editor panels
let infoContent = "";
let codeContent = "";
function populateInfo() {
	let chapter = bookData[activeChapter];

	// Set newtab URL
	const newtab = document.querySelector('#newtab');
	newtab.href = `../demos/${activeBook}/${activeChapter}/${activeDemo}.html`;

	// Populate chapter nav
	let demos = chapter['demos'];
	let infoNavTemp = '';
	let demoIndex = 0;
	let index = 0;
	for (let key of Object.keys(demos)) {
		let demo = demos[key];
		if (key == activeDemo) {
			demoIndex = index;
		}
		infoNavTemp += `
			<div class="info-nav-demo" style="--primary: ${demo['color']};">
				<a href="./?book=${activeBook}&chapter=${activeChapter}&demo=${key}" class="info-nav-demo-link">
					<div class="info-nav-demo-link-number">${index+1}</div>
					<div class="info-nav-demo-link-name">${demo['name']}</div>
				</a>
				<a href="./?book=${activeBook}&chapter=${activeChapter}&demo=${key}" target="_blank" class="info-nav-demo-newtab">
					<svg viewBox="0 0 100 100"><path d="M58.18,10h31.82v31.82h-9.999v-14.75l-28.892,28.892-7.071-7.071,28.892-28.892h-14.75v-9.999ZM80,51.82v28.18H20V20h28.18v-10H10v80h80v-38.18h-10Z"/></svg>
				</a>
			</div>
		`;
		index++;
	}
	const infoNavDemos = document.querySelector('.info-nav-demos');
	infoNavDemos.innerHTML = infoNavTemp;

	// Info and title
	const infoNavCurrentNumber = document.querySelector('.info-nav-current-number');
	infoNavCurrentNumber.innerText = demoIndex+1;
	const infoNavCurrentName = document.querySelector('.info-nav-current-name');
	infoNavCurrentName.innerText = bookData[activeChapter]['demos'][activeDemo]['name'];
	const titleBook = document.querySelector('.title-book');
	titleBook.innerHTML = `
		<svg viewBox="0 0 100 100"><path d="m25,5c-5.52,0-10,4.48-10,10v70c0,5.52,4.48,10,10,10h60V5H25Zm50,80H28c-2.76,0-5-2.24-5-5s2.24-5,5-5h47v10Zm0-20H28V15h47v50Z"/><rect x="38" y="25" width="27" height="10"/></svg>
		<span>${overviewData[activeBook]['title']}</span>
	`;
	titleBook.href = `../#${activeBook}`;

	// Generate chapters in title bar
	const title = document.querySelector('.title');
	for (let chapterKey of Object.keys(bookData)) {
		let chapter = bookData[chapterKey];
		let firstDemo = Object.keys(chapter['demos'])[0];
		let chapterSubtitle = '';
		if (chapter['subtitle'] != '') {
			chapterSubtitle = `<span class="title-chapter-subtitle">${chapter['subtitle']}</span>`;
		}
		let active = 0;
		if (chapterKey == activeChapter) {
			active = 1;
		}
		if (chapter['color'] == 'rainbow') {
			title.innerHTML += `
				<a class="title-chapter title-chapter-rainbow" href="./?book=${activeBook}&chapter=${chapterKey}&demo=${firstDemo}" data-active="${active}">
					${chapterSubtitle}
					<span class="title-chapter-title">${chapter['title']}</span>
				</a>
			`;
		} else {
			title.innerHTML += `
				<a class="title-chapter" href="./?book=${activeBook}&chapter=${chapterKey}&demo=${firstDemo}" style="--primary: ${chapter['color']};" data-active="${active}">
					${chapterSubtitle}
					<span class="title-chapter-title">${chapter['title']}</span>
				</a>
			`;
		}
	}

	// Info next shortcut
	const infoNext = document.querySelector('.info-next');
	if (demoIndex < Object.keys(demos).length-1) {
		infoNext.innerHTML = `Click here to continue to the next demo!`;
		let key = Object.keys(demos)[demoIndex+1];
		infoNext.href = `./?book=${activeBook}&chapter=${activeChapter}&demo=${key}`;
	} else {
		infoNext.innerHTML = `<span>You finished reading this chapter!</span> Click here to open a different chapter.`;
		infoNext.href = `../#${activeBook}`;
	}

	// Navigate between demos
	const infoNavPrev = document.querySelector('#info-nav-prev');
	const infoNavNext = document.querySelector('#info-nav-next');
	if (demoIndex == 0) {
		infoNavPrev.dataset.active = 0;
	} else {
		let key = Object.keys(demos)[demoIndex-1];
		infoNavPrev.href = `./?book=${activeBook}&chapter=${activeChapter}&demo=${key}`;
	}
	if (demoIndex == index-1) {
		infoNavNext.dataset.active = 0;
	} else {
		let key = Object.keys(demos)[demoIndex+1];
		infoNavNext.href = `./?book=${activeBook}&chapter=${activeChapter}&demo=${key}`;
	}
	
	// Set color
	const container = document.querySelector('.container');
	container.style.setProperty('--primary', `${demos[activeDemo]['color']}`);

	// Update favicon to match demo color
	const head = document.querySelector('head');
	const headFaviconColor = document.createElement('link');
	headFaviconColor.rel = "icon";
	headFaviconColor.type = "png";
	let favicon = 'white';
	if (demos[activeDemo]['color'] == "var(--pink)") {
		favicon = 'pink';
	} else if (demos[activeDemo]['color'] == "var(--green)") {
		favicon = 'green';
	} else if (demos[activeDemo]['color'] == "var(--blue)") {
		favicon = 'blue';
	} else if (demos[activeDemo]['color'] == "var(--yellow)") {
		favicon = 'yellow';
	} else if (demos[activeDemo]['color'] == "var(--purple)") {
		favicon = 'purple';
	} else if (demos[activeDemo]['color'] == "var(--red)") {
		favicon = 'red';
	}
	headFaviconColor.href = `/assets/meta/favicon-${favicon}.png`;
	head.appendChild(headFaviconColor);

	// Add current demo settings to all chapter links
	for (let link of document.querySelectorAll('.info-nav a')) {
		link.addEventListener('click', (e) => {
			e.preventDefault();

			// Format settings
			let formattedSettings = "";
			for (let setting of Object.keys(currentSettings)) {
				if (currentSettings[setting] != undefined) {
					formattedSettings += `&${setting}=${currentSettings[setting]}`;
				}
			}

			// Open link with current settings
			if (link.target == "_blank") {
				window.open(`${link.href}${formattedSettings}`, "_blank");
			} else {
				window.open(`${link.href}${formattedSettings}`, "_self");
			}
		})
	}

	// Add current demo settings to all book links
	for (let link of document.querySelectorAll('.title-chapter')) {
		link.addEventListener('click', (e) => {
			e.preventDefault();

			// Format settings
			let formattedSettings = "";
			for (let setting of Object.keys(currentSettings)) {
				if (currentSettings[setting] != undefined) {
					formattedSettings += `&${setting}=${currentSettings[setting]}`;
				}
			}

			// Open link with current settings
			if (link.target == "_blank") {
				window.open(`${link.href}${formattedSettings}`, "_blank");
			} else {
				window.open(`${link.href}${formattedSettings}`, "_self");
			}
		})
	}
}
async function fetchInfo() {
	try {
		let responseInfo = await fetch(`../demos/${activeBook}/${activeChapter}/${activeDemo}-info.html`);
		responseInfo.text().then((text) => {
			infoContent = text;
			const info = document.querySelector('.info-content');
			info.innerHTML += infoContent;
			fetchCode();
		});
	}
	catch(e) {
		alert('Something went wrong! We couldn’t find your demo for some reason. Try going back to the homepage and starting over!')
	}
}
async function fetchCode() {
	try {
		let responseCode = await fetch(`../demos/${activeBook}/${activeChapter}/${activeDemo}.html`);
		if (responseCode.status != 200) {
			throw new Error('File not found');
		}
		responseCode.text().then((code) => {
			codeContent = code;
			cm.setValue(codeContent);
			cm.refresh();
			container.dataset.loading = 0;

			// Attempt to fix alignment issues
			setTimeout(() => {cm.refresh()}, 100)
		});
	}
	catch(e) {
		alert("Something went wrong! We couldn’t find your demo for some reason. Try going back to the homepage and starting over!");
	}
}

// Pause preview from updating
function editorPause() {
	const togglePause = document.querySelector("#pause");
	if (paused) {
		paused = false;
		togglePause.dataset.active = 0;
	} else {
		paused = true;
		togglePause.dataset.active = 1;
	}
	updatePreview();

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("paused", paused);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['paused'] = paused;
}
function editorRefreshPause() {
	const togglePause = document.querySelector("#pause");
	if (paused) {
		togglePause.dataset.active = 1;
	} else {
		togglePause.dataset.active = 0;
	}
}

// Update preview when changes made in editor
let update;
let updateCount = 0;
function updatePreview() {
	// Add warning before closing the tab if editor changed by user
	if (updateCount > 1) {
		window.addEventListener('beforeunload', function (e) {
			e.preventDefault();
			e.returnValue = '';
		});
	}
	updateCount++;

	clearTimeout(update);
	const preview = document.querySelector('.preview-content');
	const previewDelay = document.querySelector("#preview-delay");
	const previewDelayTimerInside = document.querySelector(".preview-delay-timer-inside");
	previewDelayTimerInside.style.animationName = "unset";

	// Stop update if preview paused
	const previewPaused = document.querySelector("#preview-paused");
	if (paused) {
		previewPaused.dataset.active = 1;
		previewDelay.dataset.active = 0;
		return
	} else {
		previewPaused.dataset.active = 0;
	}

	// Custom console function
	let consoleCode = `
		<script>
			(function() {
				var originalLog = console.log;
				console.log = function() {
					const parentConsole = parent.document.querySelector('.editor-console-log');
					var message = Array.from(arguments).join(' ');
					parentConsole.innerHTML += '<div class="editor-console-log-out">' + message + '</div>';
					originalLog.apply(console, arguments);
					parentConsole.scrollTop = parentConsole.scrollHeight;
				};
	
				var originalError = console.error;
				console.error = function() {
					const parentConsole = parent.document.querySelector('.editor-console-log');
					var message = Array.from(arguments).join(' ');
					parentConsole.innerHTML += '<div class="editor-console-log-out">Error: ' + message + '</div>';
					originalError.apply(console, arguments);
					parentConsole.scrollTop = parentConsole.scrollHeight;
				};

				window.onerror = function(message, source, lineno, colno, error) {
					const parentConsole = parent.document.querySelector('.editor-console-log');
					parentConsole.innerHTML += '<div class="editor-console-log-out">Uncaught Error: ' + message + '</div>';
					// Optionally, you can log the error object for more information
					// console.error(error);
					parentConsole.scrollTop = parentConsole.scrollHeight;
					return true; // Prevent the default browser error handling
				};
			})();
		</script>
	`;
	let codeSplit = cm.getValue().split("</head>");
	let previewCode;
	if (codeSplit.length == 2) {
		previewCode = codeSplit[0] + consoleCode + codeSplit[1];
	} else {
		previewCode = cm.getValue();
	}

	// Handle delay
	if (delay) {
		previewDelay.dataset.active = 1;
		setTimeout(() => {
			previewDelayTimerInside.style.animationName = "preview-delay";
		}, 10)
		update = setTimeout(() => {
			previewDelay.dataset.active = 0;
			preview.srcdoc = previewCode;
		}, 5000);
	} else {
		previewDelay.dataset.active = 0;
		preview.srcdoc = previewCode;
	}
}

// Editor line wrapping
function editorToggleWrapping() {
	const toggleWrap = document.querySelector("#toggle-wrap");
	if (lineWrap) {
		toggleWrap.dataset.active = 0;
		lineWrap = false;
	} else {
		toggleWrap.dataset.active = 1;
		lineWrap = true;
	}
	cm.setOption('lineWrapping', lineWrap);

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("linewrapping", lineWrap);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['linewrapping'] = lineWrap;
}
function editorRefreshWrapping() {
	const toggleWrap = document.querySelector("#toggle-wrap");
	if (lineWrap) {
		toggleWrap.dataset.active = 1;
	} else {
		toggleWrap.dataset.active = 0;
	}
}

// Editor font size
function editorFontsizeDown() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	editorFontsize -= 2;
	if (editorFontsize <= 8) {
		editorFontsize = 8;
		toggleFontsizeDown.dataset.disabled = 1;
		toggleFontsizeUp.dataset.disabled = 0;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', editorFontsize + 'px');
	cm.refresh();

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("fontsize", editorFontsize);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['fontsize'] = editorFontsize;
}
function editorFontsizeUp() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	editorFontsize += 2;
	if (editorFontsize >= 24) {
		editorFontsize = 24;
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 1;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', editorFontsize + 'px');
	cm.refresh();
	
	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("fontsize", editorFontsize);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['fontsize'] = editorFontsize;
}
function editorRefreshFontsize() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	if (editorFontsize <= 8) {
		editorFontsize = 8;
		toggleFontsizeDown.dataset.disabled = 1;
		toggleFontsizeUp.dataset.disabled = 0;
	} else if (editorFontsize >= 24) {
		editorFontsize = 24;
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 1;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', editorFontsize + 'px');
}

// Download current demo
function editorDownload() {
	let codeBlob = new Blob([ cm.getValue()], { type: 'text/html' })
	blobURL = URL.createObjectURL(codeBlob);
	let tempLink = document.createElement("a");
	tempLink.href = blobURL;
	tempLink.download = activeDemo;
	tempLink.click();
}

// Editor delay
function editorToggleDelay() {
	const toggleDelay = document.querySelector("#toggle-delay");
	if (delay) {
		toggleDelay.dataset.active = 0;
		delay = false;
		updatePreview();
	} else {
		toggleDelay.dataset.active = 1;
		delay = true;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("delay", delay);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['delay'] = delay;
}
function editorRefreshDelay() {
	const toggleDelay = document.querySelector("#toggle-delay");
	if (delay) {
		toggleDelay.dataset.active = 1;
	} else {
		toggleDelay.dataset.active = 0;
	}
}

// Rerun current demo
function editorRerun() {
	updatePreview();
}

// Editor console
function editorToggleConsole() {
	const toggleConsole = document.querySelector("#toggle-console");
	const editor = document.querySelector('#editor');
	if (parseInt(editor.dataset.console) == 0) {
		toggleConsole.dataset.active = 1;
		editor.dataset.console = 1;
		consoleActive = true;
	} else {
		toggleConsole.dataset.active = 0;
		editor.dataset.console = 0;
		consoleActive = false;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("console", consoleActive);
	url.search = params.toString();
	window.history.replaceState({}, '', url);

	// Update current settings
	currentSettings['console'] = consoleActive;
}
function editorRefreshConsole() {
	const toggleConsole = document.querySelector("#toggle-console");
	const editor = document.querySelector('#editor');
	if (consoleActive == false) {
		toggleConsole.dataset.active = 0;
		editor.dataset.console = 0;
	} else {
		toggleConsole.dataset.active = 1;
		editor.dataset.console = 1;
	}
}
const consoleInput = document.querySelector('#console-input');
consoleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
		const preview = document.querySelector('.preview-content');
		const consoleLog = document.querySelector('.editor-console-log');
		consoleLog.innerHTML += `<div class="editor-console-log-in">${consoleInput.value}</div>`;
		try {
			preview.contentWindow.eval(consoleInput.value);
		}
		catch (error) {
			consoleLog.innerHTML += `<div class="editor-console-log-out">${error.message}</div>`;
		}
		consoleLog.scrollTop = consoleLog.scrollHeight;
		consoleInput.value = "";
    }
})

// Cap console at 100 enttires
function checkConsoleLength() {
	const consoleLog = document.querySelector('.editor-console-log');
	if (consoleLog.children.length > 100) {
		consoleLog.children[0].remove();
		checkConsoleLength();
	}
}
let consoleObserver = new MutationObserver(checkConsoleLength);
consoleObserver.observe(document.querySelector('.editor-console-log'), {characterData: false, childList: true, attributes: false});

// Fix CodeMirror text not aligning with cursor
window.addEventListener('focus', () => {cm.refresh()});

// Track preview size
function previewDimensions() {
	const previewContent = document.querySelector(".preview-content");
	const previewWidth = document.querySelector("#preview-width");
	const previewHeight = document.querySelector("#preview-height");
	previewWidth.innerText = previewContent.offsetWidth
	previewHeight.innerText = previewContent.offsetHeight
}
previewDimensions();
new ResizeObserver(previewDimensions).observe(document.querySelector(".preview-content"));