const container = document.querySelector('.container');

// Empty demo template
const template = `<style>
	/* Write your CSS here! */
	
</style>
<body>
	<!-- Write your HTML here! -->
	

	<script>
		// Write your JavaScript here!
		
	</script>
</body>`;

// Search params
const pageHref = window.location.search;
const searchParams = new URLSearchParams(pageHref.substring(pageHref.indexOf('?')));

// ———————————————————————————————————
// PANELS
// ———————————————————————————————————

// Resize panels
let resizers = document.querySelectorAll('.resizer');
for (let resizer of resizers) {
	resizer.addEventListener('mousedown', (e) => {startResize(e, resizer)});
	resizer.addEventListener('touchstart', (e) => {startResize(e, resizer)});
}
function startResize(e1, resizer) {
	e1.preventDefault();
	document.addEventListener('mousemove', updateResize);
	document.addEventListener('mouseup', endResize);
	document.addEventListener('touchmove', updateResize);
	document.addEventListener('touchend', endResize);
	disableIframes();

	let x1;
	if (e1.touches != null) {
		x1 = e1.touches[0].clientX;
	} else {
		x1 = e1.clientX;
	}
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
		e2.preventDefault();
		let x2;
		if (e2.touches != null) {
			x2 = e2.touches[0].clientX;
		} else {
			x2 = e2.clientX;
		}
		let delta = x2 - x1;
		let defaultSize = (100/openPanelsLength);
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
		col1.style.width = `calc(calc(calc(100% - ${(openPanelsLength-1)*40}px) / ${openPanelsLength}) + ${offset1}%)`;
		col2.style.width = `calc(calc(calc(100% - ${(openPanelsLength-1)*40}px) / ${openPanelsLength}) + ${offset2}%)`;
		x1 = x2;
	}

	function endResize() {
		document.removeEventListener('mousemove', updateResize);
		document.removeEventListener('mouseup', endResize);
		document.removeEventListener('touchmove', updateResize);
		document.removeEventListener('touchend', endResize);
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
function fullscreenPanel(target) {
	let panel = document.querySelector("#"+target);
	if (parseInt(panel.dataset.fullscreen) == 1) {
		panel.dataset.fullscreen = 0;
	} else {
		panel.dataset.fullscreen = 1;
	}
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
	let empty = document.querySelector('.empty');
	for (let panel of Object.keys(openPanels)) {
		if (!openPanels[panel]) {
			openPanelsLength--;
		}
	}
	if (openPanelsLength == 0) {
		// Show empty notice
		empty.dataset.hide = 0;
	} else {
		// Hide empty notice
		empty.dataset.hide = 1;

		// Calculate correct widths
		for (let panel of document.querySelectorAll('.panel')) {
			panel.style.width = `calc(calc(100% - ${(openPanelsLength-1)*40}px) / ${openPanelsLength})`;
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
		iframe.style.display = 'none';
		iframe.offsetHeight; // Force sync reflow
		iframe.style.display = '';
	}
}

// ———————————————————————————————————
// CONTENT
// ———————————————————————————————————

// Generate editor
let cm;
let update;
let updateCount = 0;
let override = false;
let currentSettings = {
	"console": false,
	"linewrap": false,
	"fontsize": 16,
	"delay": false,
	"paused": false
};
let defaultSettings = {
	"console": false,
	"linewrap": false,
	"fontsize": 16,
	"delay": false,
	"paused": false
};
function generateEditor(blank) {
	// Detect editor settings
	if (searchParams.has('console')) {
		if (searchParams.get('console') == "true") {
			currentSettings['console'] = true;
			editorRefreshConsole();
		}
	}
	if (searchParams.has('linewrap')) {
		if (searchParams.get('linewrap') == "true") {
			currentSettings['linewrap'] = true;
			editorRefreshWrapping();
		}
	}
	if (searchParams.has('fontsize')) {
		if (parseInt(searchParams.get('fontsize')) != undefined ) {
			currentSettings['fontsize'] = parseInt(searchParams.get('fontsize'));
			if (isNaN(currentSettings['fontsize'])) {
				currentSettings['fontsize'] = 16;
			}
			editorRefreshFontsize();
			currentSettings['fontsize'] = currentSettings['fontsize'];
		}
	}
	if (searchParams.has('delay')) {
		if (searchParams.get('delay') == "true") {
			currentSettings['delay'] = true;
			editorRefreshDelay();
		}
	}
	if (searchParams.has('paused')) {
		if (searchParams.get('paused') == "true") {
			currentSettings['paused'] = true;
			editorRefreshPause();
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
		lineWrapping: currentSettings['linewrap'],
		theme: "gdwithgd",
	});
	cm.on("change", updatePreview);

	// Fetch content if not blank editor
	if (blank == true) {
		// Hide unnecessary features
		hideInfo();
		container.dataset.empty = 1;

		// Initialize editor
		cm.setValue(template);
		cm.refresh();
		container.dataset.loading = 0;

		// Attempt to fix CM alignment issues
		setTimeout(() => {cm.refresh()}, 100)
	} else {
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
	}

	// Make tabbed lines appear on continuous indentation
	cm.on("renderLine", function(cm, line, elmnt) {
		let tabs = CodeMirror.countColumn(line.text, null, 1);
		elmnt.style.textIndent = `-${tabs*2.4}em`;
		elmnt.style.paddingLeft = `calc(${tabs*2.4}em + 4px)`;
	});

	window.addEventListener("focus", cm.refresh());
	cm.refresh();
}

// Fetch relevant JSON file and find demo information
let overviewData, bookData, activeBook, activeChapter, activeDemo;
async function fetchOverview() {
	// Read URL to detect which book to fetch
	// If no book, open blank editor
	if (searchParams.has('book')) {
		activeBook = searchParams.get('book');

		// Fetch overview data and check if book exists
		// If not, load blank editor
		try {
			let response = await fetch(`../overview.json`);
			response.json().then((json) => {
				overviewData = json;
				if (Object.keys(overviewData).includes(activeBook)) {
					fetchData();
				} else {
					generateEditor(true);
					alert("This book doesn’t exist! Opening up a blank editor. Head to the homepage to pick another book.");
				}
			});
		}
		catch(e) {
			alert("Something went wrong while trying to load the editor! Try checking your Internet connection, refreshing the page, or making sure there are no typos in the URL.");
		}
		
	} else {
		generateEditor(true);
	}
}
async function fetchData() {
	// Fetch book data
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

// Populate navbar, info panel, editor panel
let infoContent = "";
let codeContent = "";
function populateInfo() {
	let chapter = bookData[activeChapter];

	// Set newtab URL
	const newtab = document.querySelector('#newtab');
	newtab.href = `../demos/${activeBook}/${activeChapter}/${activeDemo}.html`;

	// Populate chapter nav
	let demos = chapter['demos'];
	let navbarDemosTemp = '';
	let demoIndex = 0;
	let index = 0;
	for (let key of Object.keys(demos)) {
		let demo = demos[key];
		if (key == activeDemo) {
			demoIndex = index;
		}
		navbarDemosTemp += `
			<a href="./?book=${activeBook}&chapter=${activeChapter}&demo=${key}" class="navbar-demo">
				<div class="navbar-demo-number">${index+1}</div>
				<div class="navbar-demo-name">${demo['name']}</div>
			</a>
		`;
		index++;
	}
	const navbarDemos = document.querySelector('.navbar-demos');
	navbarDemos.innerHTML = navbarDemosTemp;

	// Navbar content
	const navbarBook = document.querySelector('#navbar-book');
	navbarBook.innerHTML = overviewData[activeBook]['title-plaintext'];

	const navbarChapter = document.querySelector('#navbar-chapter');
	navbarChapter.innerHTML = bookData[activeChapter]['title'];
	const navbarChapterLink = document.querySelector('#navbar-chapter-link');
	const navbarChapterLink2 = document.querySelector('#navbar-chapter-link2');
	navbarChapterLink.href = `../#${activeBook}`;
	navbarChapterLink2.href = `../#${activeBook}`;

	// TODO
	const navbarCurrent = document.querySelector('#navbar-current');
	navbarCurrent.innerHTML = demoIndex+1;
	const navbarTotal = document.querySelector('#navbar-total');
	navbarTotal.innerHTML = Object.keys(bookData[activeChapter]['demos']).length;

	const navbarDemo = document.querySelector('#navbar-demo');
	navbarDemo.innerText = bookData[activeChapter]['demos'][activeDemo]['name'];

	// Info panel next shortcut
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
	const navbarPrev = document.querySelector('#navbar-prev');
	const navbarNext = document.querySelector('#navbar-next');
	if (demoIndex == 0) {
		navbarPrev.dataset.hidden = 1;
	} else {
		let key = Object.keys(demos)[demoIndex-1];
		navbarPrev.href = `./?book=${activeBook}&chapter=${activeChapter}&demo=${key}`;
	}
	if (demoIndex == index-1) {
		navbarNext.dataset.hidden = 1;
	} else {
		let key = Object.keys(demos)[demoIndex+1];
		navbarNext.href = `./?book=${activeBook}&chapter=${activeChapter}&demo=${key}`;
	}

	// Add current demo settings to all chapter links
	for (let link of document.querySelectorAll('.navbar-controls a')) {
		link.addEventListener('click', (e) => {
			e.preventDefault();

			// Format settings
			let formattedSettings = "";
			for (let setting of Object.keys(currentSettings)) {
				if (currentSettings[setting] != defaultSettings[setting]) {
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
	for (let link of document.querySelectorAll('.navbar-demos a')) {
		link.addEventListener('click', (e) => {
			e.preventDefault();

			// Format settings
			let formattedSettings = "";
			for (let setting of Object.keys(currentSettings)) {
				if (currentSettings[setting] != defaultSettings[setting]) {
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
	let responseInfo = await fetch(`../demos/${activeBook}/${activeChapter}/${activeDemo}-info.html`);
	if (responseInfo.status != 200) {
		hideInfo();
		fetchCode();
	} else {
		responseInfo.text().then((text) => {
			infoContent = text;
			const info = document.querySelector('.info-content');
			info.innerHTML += infoContent;
			fetchCode();
		});
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

// Hide info panel if not needed (blank editor or no info file)
function hideInfo() {
	const toggleInfo = document.querySelector(`#toggle-info`);
	toggleInfo.dataset.disabled = 1;
	togglePanel('info');
}

// Toggle navbar demos menu
function toggleNavbarDemos() {
	const navbarDemos = document.querySelector('.navbar-demos');
	const navbarDemosLink = document.querySelector('#navbar-demos');
	if (parseInt(navbarDemos.dataset.active) == 0) {
		navbarDemos.dataset.active = 1;
		navbarDemosLink.dataset.active = 1;
	} else {
		navbarDemos.dataset.active = 0;
		navbarDemosLink.dataset.active = 0;
	}
}

// Pause preview from updating
function editorPause() {
	const togglePause = document.querySelector("#pause");
	if (currentSettings['paused']) {
		currentSettings['paused'] = false;
		togglePause.dataset.active = 0;
	} else {
		currentSettings['paused'] = true;
		togglePause.dataset.active = 1;
	}
	updatePreview();

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("paused", currentSettings['paused']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorRefreshPause() {
	const togglePause = document.querySelector("#pause");
	if (currentSettings['paused']) {
		togglePause.dataset.active = 1;
	} else {
		togglePause.dataset.active = 0;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("paused", currentSettings['paused']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}

// Update preview when changes made in editor
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
	// Allow for override if manually refreshed
	const previewPaused = document.querySelector("#preview-paused");
	if (!override) {
		if (currentSettings['paused']) {
			previewPaused.dataset.active = 1;
			previewDelay.dataset.active = 0;
			return
		} else {
			previewPaused.dataset.active = 0;
		}
	} else {
		currentSettings['paused'] = false;
		previewDelay.dataset.active = 0;
		previewPaused.dataset.active = 0;
		editorRefreshPause();
	}

	// Custom console function
	const consoleLog = document.querySelector('.editor-console-log');
	consoleLog.innerHTML = ``;
	let consoleCode = `
		<script>
			(function() {
			const originalLog = console.log;
			const originalError = console.error;

			console.log = function(...args) {
				parent.document.querySelector('.editor-console-log').innerHTML +=
				'<div class="editor-console-log-out">' + args.join(' ') + '</div>';
				parent.document.querySelector('.editor-console-log').scrollTop = parent.document.querySelector('.editor-console-log').scrollHeight;
				originalLog.apply(console, args);
			}

			console.error = function(...args) {
				parent.document.querySelector('.editor-console-log').innerHTML +=
				'<div class="editor-console-log-out">Error: ' + args.join(' ') + '</div>';
				parent.document.querySelector('.editor-console-log').scrollTop = parent.document.querySelector('.editor-console-log').scrollHeight;
				originalError.apply(console, args);
			}

			window.onerror = function(message, source, lineno, colno, error) {
				parent.document.querySelector('.editor-console-log').innerHTML += '<div class="editor-console-log-out">Uncaught Error: ' + message + ' (line ' + (lineno-63) +': column ' + colno + ')</div>';
				parent.document.querySelector('.editor-console-log').scrollTop = parent.document.querySelector('.editor-console-log').scrollHeight;
				return true; // prevent default browser alert
			}
			})();

			document.addEventListener("DOMContentLoaded", function() {
				for (let link of document.querySelectorAll('a')) {
					let linkURL = link.getAttribute('href');
					if (linkURL.includes('#')) {
						link.addEventListener('click', (e) => {
							e.preventDefault();
							if (linkURL.trim() == "#") {
								return
							}
							let target = document.querySelector(linkURL);
							if (target != undefined) {
								target.scrollIntoView();
							}
						})
					}
				}
			});
		</script>
	`;
	let previewCode = consoleCode + preventInfiniteLoops(cm.getValue());

	// Handle delay
	// Skip if override
	if (!override) {
		if (currentSettings['delay']) {
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
	} else {
		previewDelay.dataset.active = 0;
		preview.srcdoc = previewCode;
	}

	override = false;
}

// Prevent infinite loops inside preview
function preventInfiniteLoops(code) {
	// Track loop counts and enforce timeout
	const safetyWrapper = `
		<script>
			let __loopStart = Date.now();
			let __loopCounter = 0;
			function __loopReset() {
				__loopStart = Date.now();
				__loopCounter = 0;
			}
			function __checkLoop(lineNumber) {
				if (++__loopCounter > 10000) {
				  throw new Error("Infinite loop detected near line " + lineNumber + ": exceeded 10000 iterations");
				}
				if (Date.now() - __loopStart > 2000) {
					throw new Error("Infinite loop detected near line " + lineNumber + ": exceeded 2 seconds");
				}
			}
		</script>
	`;

	// Add code at the *start* of any loop
	code = code.replace(
		/\b(for|while|do)\b\s*(?:await\s+)?\([^)]*\)\s*\{/g,
		match => "__loopReset(); " + match
	  );

	// Replace loop headers and inject line number
	let line = 1;
	code = code.replace(/^.*$/gm, (fullLine) => {
		const loopMatch = fullLine.match(/\b(for|while|do)\b\s*(?:await\s+)?\([^)]*\)\s*\{/);
		if (loopMatch) {
			fullLine = fullLine.replace('{', `{__checkLoop(${line});`);
		}
		line++;
		return fullLine;
	});
  
	return safetyWrapper + "\n" + code;
}

// Editor line wrapping
function editorToggleWrapping() {
	const toggleWrap = document.querySelector("#toggle-wrap");
	if (currentSettings['linewrap']) {
		toggleWrap.dataset.active = 0;
		currentSettings['linewrap'] = false;
	} else {
		toggleWrap.dataset.active = 1;
		currentSettings['linewrap'] = true;
	}
	cm.setOption('lineWrapping', currentSettings['linewrap']);

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("linewrap", currentSettings['linewrap']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorRefreshWrapping() {
	const toggleWrap = document.querySelector("#toggle-wrap");
	if (currentSettings['linewrap']) {
		toggleWrap.dataset.active = 1;
	} else {
		toggleWrap.dataset.active = 0;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("linewrap", currentSettings['linewrap']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}

// Editor font size
function editorFontsizeDown() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	currentSettings['fontsize'] -= 2;
	if (currentSettings['fontsize'] <= 6) {
		currentSettings['fontsize'] = 6;
		toggleFontsizeDown.dataset.disabled = 1;
		toggleFontsizeUp.dataset.disabled = 0;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', currentSettings['fontsize'] + 'px');
	cm.refresh();

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("fontsize", currentSettings['fontsize']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorFontsizeUp() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	currentSettings['fontsize'] += 2;
	if (currentSettings['fontsize'] >= 30) {
		currentSettings['fontsize'] = 30;
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 1;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', currentSettings['fontsize'] + 'px');
	cm.refresh();
	
	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("fontsize", currentSettings['fontsize']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorRefreshFontsize() {
	const editorCM = document.querySelector('.editor-content');
	const toggleFontsizeDown = document.querySelector("#toggle-fontsize-down");
	const toggleFontsizeUp = document.querySelector("#toggle-fontsize-up");
	if (currentSettings['fontsize'] <= 8) {
		currentSettings['fontsize'] = 8;
		toggleFontsizeDown.dataset.disabled = 1;
		toggleFontsizeUp.dataset.disabled = 0;
	} else if (currentSettings['fontsize'] >= 24) {
		currentSettings['fontsize'] = 24;
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 1;
	} else {
		toggleFontsizeDown.dataset.disabled = 0;
		toggleFontsizeUp.dataset.disabled = 0;
	}
	editorCM.style.setProperty('--font-size', currentSettings['fontsize'] + 'px');
	
	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("fontsize", currentSettings['fontsize']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
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
	if (currentSettings['delay']) {
		toggleDelay.dataset.active = 0;
		currentSettings['delay'] = false;
		updatePreview();
	} else {
		toggleDelay.dataset.active = 1;
		currentSettings['delay'] = true;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("delay", currentSettings['delay']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorRefreshDelay() {
	const toggleDelay = document.querySelector("#toggle-delay");
	if (currentSettings['delay']) {
		toggleDelay.dataset.active = 1;
	} else {
		toggleDelay.dataset.active = 0;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("delay", currentSettings['delay']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}

// Rerun current demo
function editorRerun() {
	override = true;
	updatePreview();
}

// Editor console
function editorToggleConsole() {
	const toggleConsole = document.querySelector("#toggle-console");
	const editor = document.querySelector('#editor');
	if (parseInt(editor.dataset.console) == 0) {
		toggleConsole.dataset.active = 1;
		editor.dataset.console = 1;
		currentSettings['console'] = true;
	} else {
		toggleConsole.dataset.active = 0;
		editor.dataset.console = 0;
		currentSettings['console'] = false;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("console", currentSettings['console']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
}
function editorRefreshConsole() {
	const toggleConsole = document.querySelector("#toggle-console");
	const editor = document.querySelector('#editor');
	if (currentSettings['console'] == false) {
		toggleConsole.dataset.active = 0;
		editor.dataset.console = 0;
	} else {
		toggleConsole.dataset.active = 1;
		editor.dataset.console = 1;
	}

	// Update URL params
	const url = new URL(window.location.href);
	const params = new URLSearchParams(url.search);
	params.set("console", currentSettings['console']);
	url.search = params.toString();
	window.history.replaceState({}, '', url);
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

// TODO
// Fix figure code for info panel
// Add ability to hide comments in editor
// Fix anchor links in preview