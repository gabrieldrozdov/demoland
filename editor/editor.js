const colors = ['red', 'blue', 'purple', 'yellow', 'green', 'pink'];
const container = document.querySelector('.container');

// ————————————————————————————————————————————————————————————
// TOOLTIPS
// ————————————————————————————————————————————————————————————

// Add event listeners for all tooltip-related items
window.addEventListener('mousemove', (e) => {positionTooltip(e)});
function refreshTooltips() {
	for (let btn of document.querySelectorAll('[data-tooltip-text]')) {
		btn.addEventListener('mouseenter', (e) => {setTooltip(e, btn)})
		btn.addEventListener('mouseleave', () => {hideTooltip()})
	}
}
refreshTooltips();

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
	} else if (tooltip.dataset.direction == 'bottom') {
		tooltip.style.top = '';
		tooltip.style.right = '';
		tooltip.style.bottom = window.innerHeight-e.clientY + "px";
		tooltip.style.left = e.clientX + "px";
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

// ————————————————————————————————————————————————————————————
// PANELS
// ————————————————————————————————————————————————————————————

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
		// let offset1Percent = ((offset1/window.innerWidth)*100).toFixed(2);
		// let offset2Percent = ((offset2/window.innerWidth)*100).toFixed(2);
		col1.dataset.offset = offset1;
		col2.dataset.offset = offset2;
		col1.style.width = `calc(${100/openPanelsLength}% + ${offset1}%)`;
		col2.style.width = `calc(${100/openPanelsLength}% + ${offset2}%)`;
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
			panel.style.width = 100/openPanelsLength + '%';
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

// ————————————————————————————————————————————————————————————
// CONTENT
// ————————————————————————————————————————————————————————————

// Generate editor
let cm;
let activeChapter = 'demoland';
let activeDemo = 'hello';
function generateEditor() {
	const editor = document.querySelector('.editor-content');
	cm = CodeMirror(editor, {
		mode: "htmlmixed",
		value: '<h1>Hello World!</h1>',
		autoCloseTags: true,
		autoCloseBrackets: true,
		matchBrackets: true,
		smartIndent: true,
		lineNumbers: true,
		tabSize: 2,
		showHint: true,
		extraKeys: {
			"Ctrl-Space": "autocomplete",
			"Ctrl-[": "indentLess",
			"Ctrl-]": "indentMore",
			'Cmd-/': 'toggleComment',
			'Ctrl-/': 'toggleComment',
		},
		lineWrapping: false,
		theme: "gdwithgd",
	});
	cm.on("change", updatePreview);

	// Initialize page with demo (load requested demo if applicable)
	const pageHref = window.location.search;
	const searchParams = new URLSearchParams(pageHref.substring(pageHref.indexOf('?')));
	if (searchParams.has('chapter') && searchParams.has('demo')) {
		urlChapter = searchParams.get('chapter');
		urlDemo = searchParams.get('demo');
		fetchDemo(urlChapter, urlDemo);
	} else {
		fetchDemo("demoland", "hello");
	}
}
generateEditor();

// Fetch demo and populate editor
let infoContent = "";
let codeContent = "";
async function fetchDemo(chapter, demo) {
	activeChapter = chapter;
	activeDemo = demo;
	const newtab = document.querySelector('#newtab');
	newtab.href = `demos/${activeChapter}/${activeDemo}.html`;
	fetchInfo();
}
async function fetchInfo() {
	try {
		let responseInfo = await fetch(`demos/${activeChapter}/${activeDemo}-info.html`);
		responseInfo.text().then((text) => {
			infoContent = text;
			const info = document.querySelector('.info-content');
			info.innerHTML = infoContent;
			fetchCode();
		});
	}
	catch(e) {
		fetchDemo("demoland", "hello");
	}
}
async function fetchCode() {
	try {
		let responseCode = await fetch(`demos/${activeChapter}/${activeDemo}.html`);
		if (responseCode.status != 200) {
			throw new Error('File not found');
		}
		responseCode.text().then((code) => {
			codeContent = code;
			container.dataset.loading = 0;
			cm.setValue(codeContent);
			cm.refresh();
		});
	}
	catch(e) {
		alert("Something went wrong while trying to load the file! Try checking your Internet connection and refreshing the page.");
	}
}

// Reset back to stored code
function resetDemo() {
	const info = document.querySelector(".info-container");
	info.scrollTop = 0;
	cm.setValue(codeContent);
	cm.refresh();
}

// Update preview when changes made in editor
let update;
function updatePreview() {
	clearTimeout(update);
	const preview = document.querySelector('.preview-content');
	const previewDelay = document.querySelector(".preview-delay");
	const previewDelayTimerInside = document.querySelector(".preview-delay-timer-inside");
	previewDelayTimerInside.style.animationName = "unset";

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
					parentConsole.innerHTML += '<div class="editor-console-log-out" style="color: var(--primary);">Error: ' + message + '</div>';
					originalError.apply(console, arguments);
					parentConsole.scrollTop = parentConsole.scrollHeight;
				};

				window.onerror = function(message, source, lineno, colno, error) {
					const parentConsole = parent.document.querySelector('.editor-console-log');
					parentConsole.innerHTML += '<div class="editor-console-log-out" style="color: var(--primary);">Uncaught Error: ' + message + '</div>';
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

// Editor controls
let lineWrap = false;
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
}
let editorFontsize = 14;
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
}
function editorReset() {
	resetDemo();
	openAllPanels();
	resetPanels();
}
function editorDownload() {
	let codeBlob = new Blob([ cm.getValue()], { type: 'text/html' })
	blobURL = URL.createObjectURL(codeBlob);
	let tempLink = document.createElement("a");
	tempLink.href = blobURL;
	tempLink.download = activeDemo;
	tempLink.click();
}
let delay = false;
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
}
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
	} else {
		toggleConsole.dataset.active = 0;
		editor.dataset.console = 0;
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
			consoleLog.innerHTML += `<div class="editor-console-log-out" style="color: var(--primary);">${error.message}</div>`;
		}
		consoleLog.scrollTop = consoleLog.scrollHeight;
		consoleInput.value = "";
    }
})

// Fix CodeMirror text not aligning with cursor
window.addEventListener('focus', () => {cm.refresh()});

// Warning before closing the tab
window.addEventListener('beforeunload', function (e) {
	e.preventDefault();
	e.returnValue = '';
});

// TODO
// help popup
// new homepage
// new catalog json?
// styles for info panel
	// something to track the unit you're in?
// how to determine what color the editor should use?