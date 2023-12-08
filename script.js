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
// TABS
// ————————————————————————————————————————————————————————————

// Refresh tab event listeners
function refreshTabs() {
	for (let tab of document.querySelectorAll('.tab')) {
		tab.querySelector('.tab-close').addEventListener('click', (e) => {closeTab(e, tab)});
		tab.addEventListener('click', () => {selectTab(tab)});
		tab.addEventListener('mousedown', (e) => {dragTab(e, tab)});
	}
}
refreshTabs();

// Close tab
function closeTab(e, tab) {
	e.stopPropagation();
	if (parseInt(tab.dataset.active) == 1) {
		tab.remove();
		let tabs = document.querySelectorAll('.tab');
		if (tabs.length >= 1) {
			selectTab(tabs[0]);
		}
	} else {
		tab.remove();
	}
}

// Switch to tab
function selectTab(tab) {
	for (let tab of document.querySelectorAll('.tab')) {
		tab.dataset.active = 0;
	}
	tab.dataset.active = 1;

	// Set new active color
	let container = document.querySelector('.container');
	container.dataset.color = tab.dataset.color;

	// TODO: this
}

// Drag to reorder tabs
function dragTab(e1, tab) {
	document.addEventListener('mousemove', updateDrag);
	document.addEventListener('mouseup', endDrag);
	disableIframes();
	let x1 = e1.clientX;
	let tabWidth = tab.offsetWidth + 4;
	let delta = 0;

	// Calculate index
	let tabs = document.querySelector('.tabs');
	let index1 = Array.prototype.indexOf.call(tabs.children, tab);
	let reposition = 0;

	function updateDrag(e2) {
		// Move tab
		let x2 = e2.clientX;
		delta += x2 - x1;
		tab.style.transform = `translateX(${delta}px)`;
		x1 = x2;

		// Detect tab position
		let left1 = tab.getBoundingClientRect().left;
		reposition = 0;
		for (let otherTab of document.querySelectorAll('.tab')) {
			if (otherTab == tab) {
				continue
			}

			let index2 = Array.prototype.indexOf.call(tabs.children, otherTab);
			let left2 = otherTab.getBoundingClientRect().left;
			if (left2 < left1 && index2 > index1) {
				otherTab.style.transform = `translateX(-${tabWidth}px)`;
				reposition++;
			} else if (left2 > left1 && index2 < index1) {
				otherTab.style.transform = `translateX(${tabWidth}px)`;
				reposition--;
			} else {
				otherTab.style.transform = ``;
			}
		}
	}

	function endDrag() {
		// Remove listeners
		document.removeEventListener('mousemove', updateDrag);
		document.removeEventListener('mouseup', endDrag);
		enableIframes();

		// Remove temp styles
		for (let tab of document.querySelectorAll('.tab')) {
			tab.style.transform = ``;
		}

		// Update positioning
		let newPosition = reposition + index1;
		if (newPosition == index1) {
			return
		} else if (newPosition < index1) {
			tabs.insertBefore(tab, tabs.children[reposition + index1]);
		} else {
			tabs.insertBefore(tab, tabs.children[reposition + index1 + 1]);
		}
	}
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
		if (openPanels['files']) {
			col2 = document.querySelector('#files');
		} else if (openPanels['editor']) {
			col2 = document.querySelector('#editor');
		} else if (openPanels['preview']) {
			col2 = document.querySelector('#preview');
		}
	} else if (resizer.id == 'resizer2') {
		if (openPanels['files']) {
			col1 = document.querySelector('#files');
		} else if (openPanels['info']) {
			col1 = document.querySelector('#info');
		}
		if (openPanels['editor']) {
			col2 = document.querySelector('#editor');
		} else if (openPanels['preview']) {
			col2 = document.querySelector('#preview');
		}
	} else if (resizer.id == 'resizer3') {
		if (openPanels['editor']) {
			col1 = document.querySelector('#editor');
		} else if (openPanels['files']) {
			col1 = document.querySelector('#files');
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
	}
}

// Toggle panels to hide/show
let openPanels = {
	'info': true,
	'files': true,
	'editor': true,
	'preview': true
}
let openPanelsLength = 4;
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

// Reset panel sizes (auto-reset on window resize)
function resetPanels() {
	openPanelsLength = 4;
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
		let resizer3 = document.querySelector('#resizer3');
		resizer1.dataset.hide = 1;
		resizer2.dataset.hide = 1;
		resizer3.dataset.hide = 1;
		if (openPanels['info'] && (openPanels['files'] || openPanels['editor'] || openPanels['preview'])) {
			resizer1.dataset.hide = 0;
		}
		if (openPanels['files'] && (openPanels['editor'] || openPanels['preview'])) {
			resizer2.dataset.hide = 0;
		}
		if (openPanels['editor'] &&  openPanels['preview']) {
			resizer3.dataset.hide = 0;
		}
	}
}
// window.addEventListener('resize', resetPanels);

// ————————————————————————————————————————————————————————————
// EDITOR PANEL
// ————————————————————————————————————————————————————————————

// Create CodeMirror editor
let cm;
let activeEditor = 'index.html';
let activePreview = 'index.html';
function generateEditor() {
	let editor = document.querySelector('.editor-content');
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
		extraKeys: {"Ctrl-Space": "autocomplete"},
		lineWrapping: true,
		theme: "gdwithgd",
		// TODO add comment shortcut
	});
}
generateEditor();

// Switch editor out for another file
async function loadEditor(file) {
	activeEditor = file;

	// Set correct syntax highlighting
	let type = file.split('.').pop();
	if (type == 'html') {
		cm.setOption("mode", 'htmlmixed');
	} else if (type == 'css') {
		cm.setOption("mode", 'css');
	} else if (type == 'js') {
		cm.setOption("mode", 'javascript');
	}

	// Update the (fake) URL
	let url = document.querySelector('.editor-file-url');
	url.innerText = file;

	// Pull data from blob and populate editor
	fetch(chapterData[activeEditor]['blob'])
		.then((response) => response.text())
		.then(code => {
			cm.off("change", updateBlob);
			cm.setValue(code)
			cm.on("change", updateBlob);
			updatePreview();
		})
}

// Update blob related to current live editor
function updateBlob() {
	// chapterData[activeEditor]['blob'].revokeObjectURL();
	let updatedBlob = new Blob([cm.getValue()], {
		type: 'text/plain'
	});
	const objectURL = URL.createObjectURL(updatedBlob);
	chapterData[activeEditor]['blob'] = objectURL;
	updatePreview();
}

function updatePreview() {
	const preview = document.querySelector('.preview-content');

	fetch(chapterData[activePreview]['blob'])
		.then((response) => response.text())
		.then(code => {
			// preview.srcdoc = code;
			preview.contentWindow.document.body.innerHTML = code;
			fixLinks();
		})
}

function loadPreview(file) {
	activePreview = file;
	updatePreview();

	// Update the (fake) URL
	let url = document.querySelector('.preview-file-url');
	url.innerText = file;
}

function fixLinks() {
	let preview = document.querySelector('.preview-content');

	// Fancy blob stuff to redirect URLs
	let iframeBody = preview.contentWindow.document.body;
	for (let link of iframeBody.querySelectorAll('[href]')) {
		let fileName = link.href.split('/').pop();
		if (Object.keys(chapterData).includes(fileName)) {
			link.href = chapterData[fileName]['blob'];
		}
	}
	for (let link of iframeBody.querySelectorAll('[src]')) {
		let fileName = link.src.split('/').pop();
		if (Object.keys(chapterData).includes(fileName)) {
			link.src = chapterData[fileName]['blob'];
		}
	}

	// Run JavaScript inside of iframe
	let scripts = preview.contentWindow.document.querySelectorAll('script');
	for (let script of scripts) {
		let newScript = document.createElement("script");

		Array.from(script.attributes).forEach( attr => {
			newScript.setAttribute(attr.name, attr.value) 
		});

		const scriptText = document.createTextNode(script.innerHTML);
		newScript.appendChild(scriptText);

		script.parentNode.replaceChild(newScript, script);
	}
	
	// TODO: issue with let statements

	// TODO for <a> tags
	// currently just loading in the text,
	// when clicked, need to use js to fetch blob text and then insert as html
	// add event listener to the previewing file path

	// TODO: catch all errors from this
}

// Look at original URL and re-create blob
function restoreOriginal(file) {
	fetch(chapterData[file]['original'])
		.then((response) => response.blob())
		.then(myBlob => {
			const objectURL = URL.createObjectURL(myBlob);
			chapterData[file]['blob'] = objectURL;
			loadEditor(activeEditor);
		})
}

function downloadFile(file) {

}

// TODO: add fullscreen and linewrap toggles, maybe also font size?
// // Line wrapping
// let targetBtnWrap = targetContent.querySelector('.editor-btn-wrap');
// let targetWrap = true;
// targetBtnWrap.addEventListener('click', toggleWrap);
// function toggleWrap() {
// 	targetWrap = !targetWrap;
// 	targetCodeMirror.setOption('lineWrapping', targetWrap);
// }

// ————————————————————————————————————————————————————————————
// HELPER FUNCTIONS
// ————————————————————————————————————————————————————————————

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
// POPULATE ALL DATA
// ————————————————————————————————————————————————————————————

let catalog, activeCollection, activeChapter;
async function initialize() {
	const response = await fetch('catalog.json');
	catalog = await response.json();
	openCollection('test-collection');

	// TODO
	// populate index with all titles and descriptions
	// when clicked on, open collection
}
initialize();

let colors = ['red', 'blue', 'purple', 'yellow', 'green', 'pink']
function openCollection(collection) {
	activeCollection = collection;

	let catalogEntry = catalog[collection];
	let temp = '';
	let tabNumber = 0;
	let firstChapter = '';
	for (let chapter of Object.keys(catalogEntry['chapters'])) {
		let tabState = 0;
		let chapterTitle = catalogEntry['chapters'][chapter]['title'];
		if (tabNumber == 0) {
			firstChapter = chapter;
			tabState = 1;
		}
		temp += `
			<div class="tab" data-active="${tabState}" data-color="${colors[tabNumber%6]}">
				<div class="tab-title">${chapterTitle}</div>
				<div class="tab-close"><svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg></div>
			</div>
		`;
		tabNumber++;
	}

	let tabs = document.querySelector('.tabs');
	tabs.innerHTML = temp;
	refreshTabs();
	
	openChapter(firstChapter);
}

let chapterData = {};
let projectData = new Map();
let waitForBlobs;
let loadedBlobs = 0;
async function openChapter(chapter) {
	activeChapter = chapter;
	let entry = catalog[activeCollection]['chapters'][chapter];

	// Populate info panel
	const info = await fetch(`/catalog/${activeCollection}/${chapter}/info.html`);
	infoText = await info.text();
	let infoContent = document.querySelector('.info-content');
	infoContent.innerHTML = infoText;

	// Populate files panel, add events, create data map
	let files = entry['files'];
	chapterData = {};
	let temp = getFiles(files, '');
	let filesContent = document.querySelector('.files-content');
	filesContent.innerHTML = temp;
	refreshTooltips();

	// Load first file into editor and preview
	fetchData();
	let waitForBlobs = setInterval(() => {
		if (loadedBlobs == Object.keys(chapterData).length) {
			loadEditor('index.html');
			loadPreview('index.html');
			clearInterval(waitForBlobs);
		}
	})
}

function fetchData() {
	activeEditor = 'index.html';
	activePreview = 'index.html';
	for (let key of Object.keys(chapterData)) {
		let path = chapterData[key]['original'];
		fetch(path)
			.then((response) => response.blob())
			.then((myBlob) => {
				const objectURL = URL.createObjectURL(myBlob);
				chapterData[key]['blob'] = objectURL;
				loadedBlobs++;
			})
			.catch((err) => {
				clearInterval(waitForBlobs);
				console.log('TODO: blob never loaded!')
			})
	}
}

function getFiles(files, path) {
	let temp = '';
	for (let file of files) {
		let type = '';
		let controls = '';
		let icon = `
			<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m80,35.858l-25.858-25.858H20v80h60v-54.142Zm-10,4.142h-20v-20l20,20Zm0,40H30V20h10v30h30v30Z"/></svg>
		`;
		if (typeof(file) == 'string') {
			type = file.split('.').pop();

			chapterData[path+file] = {
				'original': '/catalog/'+activeCollection+"/"+activeChapter+"/"+path+file
			}

			// Build elements
			if (type == 'html') {
				icon = `
					<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m45,15v30h-10v-10h-10v10h-10V15h10v10h10v-10h10Zm10,0v10h10v20h10v-20h10v-10h-30Zm10,60v-20h-10v30h30v-10h-20Zm-30-20l-2,7h-6l-2-7h-10v30h8l1-17h1l2,10h6l2-10h1l1,17h8v-30h-10Z"/></svg>
				`;
				controls += `
					<svg onclick="loadEditor('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Editor" data-tooltip-direction="right"><polygon points="90 50 70 70 62.93 62.93 75.86 50 62.93 37.07 70 30 90 50"/><polygon points="10 50 30 70 37.07 62.93 24.14 50 37.07 37.07 30 30 10 50"/><rect x="8.038" y="45" width="83.925" height="10" transform="translate(110.912 14.088) rotate(104.478)"/></svg>
					<svg onclick="loadPreview('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Preview" data-tooltip-direction="right"><path d="m90,82.929l-25.552-25.552c3.492-4.904,5.552-10.898,5.552-17.376,0-16.569-13.431-30-30-30s-30,13.431-30,30,13.431,30,30,30c6.479,0,12.473-2.061,17.376-5.552l25.552,25.552,7.071-7.071ZM20,40c0-11.046,8.954-20,20-20s20,8.954,20,20-8.954,20-20,20-20-8.954-20-20Z"/></svg>
					<svg onclick="restoreOriginal('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Undo All Edits" data-tooltip-direction="right"><path d="m50,13.871c-9.554,0-18.232,3.755-24.655,9.86v-11.668h-9.998v28.284s28.284,0,28.284,0v-9.999h-12.258c4.831-4.656,11.394-7.525,18.628-7.525,14.835,0,26.859,12.024,26.859,26.859s-12.024,26.859-26.859,26.859-26.859-12.024-26.859-26.859h-8.953c0,19.777,16.035,35.812,35.812,35.812s35.812-16.035,35.812-35.812S69.777,13.871,50,13.871Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'css') {
				icon = `
					<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m30,30v10h-10v20h10v10H10V30h20Zm10,20h10v-10h10v-10h-20v20Zm50-10v-10h-20v20h10v-10h10Zm-20,20v10h20v-20h-10v10h-10Zm-30,0v10h20v-20h-10v10h-10Z"/></svg>
				`;
				controls += `
					<svg onclick="loadEditor('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Editor" data-tooltip-direction="right"><polygon points="90 50 70 70 62.93 62.93 75.86 50 62.93 37.07 70 30 90 50"/><polygon points="10 50 30 70 37.07 62.93 24.14 50 37.07 37.07 30 30 10 50"/><rect x="8.038" y="45" width="83.925" height="10" transform="translate(110.912 14.088) rotate(104.478)"/></svg>
					<svg onclick="restoreOriginal('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Undo All Edits" data-tooltip-direction="right"><path d="m50,13.871c-9.554,0-18.232,3.755-24.655,9.86v-11.668h-9.998v28.284s28.284,0,28.284,0v-9.999h-12.258c4.831-4.656,11.394-7.525,18.628-7.525,14.835,0,26.859,12.024,26.859,26.859s-12.024,26.859-26.859,26.859-26.859-12.024-26.859-26.859h-8.953c0,19.777,16.035,35.812,35.812,35.812s35.812-16.035,35.812-35.812S69.777,13.871,50,13.871Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'js') {
				icon = `
					<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m70,40v10h-15v-20h30v10h-15Zm-35,20H15v10h30V30h-10v30Zm20,0v10h30v-20h-15v10h-15Z"/></svg>
				`;
				controls += `
					<svg onclick="loadEditor('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Editor" data-tooltip-direction="right"><polygon points="90 50 70 70 62.93 62.93 75.86 50 62.93 37.07 70 30 90 50"/><polygon points="10 50 30 70 37.07 62.93 24.14 50 37.07 37.07 30 30 10 50"/><rect x="8.038" y="45" width="83.925" height="10" transform="translate(110.912 14.088) rotate(104.478)"/></svg>
					<svg onclick="restoreOriginal('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Undo All Edits" data-tooltip-direction="right"><path d="m50,13.871c-9.554,0-18.232,3.755-24.655,9.86v-11.668h-9.998v28.284s28.284,0,28.284,0v-9.999h-12.258c4.831-4.656,11.394-7.525,18.628-7.525,14.835,0,26.859,12.024,26.859,26.859s-12.024,26.859-26.859,26.859-26.859-12.024-26.859-26.859h-8.953c0,19.777,16.035,35.812,35.812,35.812s35.812-16.035,35.812-35.812S69.777,13.871,50,13.871Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'jpg' || type == 'png' || type == 'svg' || type == 'gif') {
				icon = `
					<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m10,20v60h80V20H10Zm70,50l-20-20-20,20h-20V30h60v40Z" stroke-width="0"/><circle cx="36" cy="46" r="10"/></svg>
				`;
				controls += `
					<svg onclick="loadPreview('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Preview" data-tooltip-direction="right"><path d="m90,82.929l-25.552-25.552c3.492-4.904,5.552-10.898,5.552-17.376,0-16.569-13.431-30-30-30s-30,13.431-30,30,13.431,30,30,30c6.479,0,12.473-2.061,17.376-5.552l25.552,25.552,7.071-7.071ZM20,40c0-11.046,8.954-20,20-20s20,8.954,20,20-8.954,20-20,20-20-8.954-20-20Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'mp3' || type == 'wav') {
				controls += `
					<svg onclick="loadPreview('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Preview" data-tooltip-direction="right"><path d="m90,82.929l-25.552-25.552c3.492-4.904,5.552-10.898,5.552-17.376,0-16.569-13.431-30-30-30s-30,13.431-30,30,13.431,30,30,30c6.479,0,12.473-2.061,17.376-5.552l25.552,25.552,7.071-7.071ZM20,40c0-11.046,8.954-20,20-20s20,8.954,20,20-8.954,20-20,20-20-8.954-20-20Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'pdf' || type == "txt" || type == "json") {
				controls += `
					<svg onclick="loadPreview('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="View in Preview" data-tooltip-direction="right"><path d="m90,82.929l-25.552-25.552c3.492-4.904,5.552-10.898,5.552-17.376,0-16.569-13.431-30-30-30s-30,13.431-30,30,13.431,30,30,30c6.479,0,12.473-2.061,17.376-5.552l25.552,25.552,7.071-7.071ZM20,40c0-11.046,8.954-20,20-20s20,8.954,20,20-8.954,20-20,20-20-8.954-20-20Z"/></svg>
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			} else if (type == 'otf' || type == 'ttf' || type == 'woff' || type == 'woff2') {
				controls += `
					<svg onclick="downloadFile('${path+file}')" viewBox="0 0 100 100" data-tooltip-text="Download File" data-tooltip-direction="right"><polygon points="72.5 47.5 50 70 27.5 47.5 34.57 40.43 45 50.86 45 10 55 10 55 50.86 65.43 40.43 72.5 47.5"/><polygon points="80 65 80 80 20 80 20 65 10 65 10 90 90 90 90 65 80 65"/></svg>
				`;
			}

			temp += `
				<div class="files-file">
					${icon}
					<p class="files-file-name">${file}</p>
					<div class="files-file-controls">
						${controls}
					</div>
				</div>
			`
		} else {
			type = 'folder';
			temp += `
				<div class="files-file files-folder">
					<svg class="files-file-icon" viewBox="0 0 100 100"><path d="m60,30V10H10v80h80V30h-30Zm-40-10h30v10h-30v-10Zm0,60v-40h60v40H20Z"/></svg>
					<p class="files-file-name">${file['name']}/</p>
				</div>
				<div class="files-indent">
			`
			temp += getFiles(file['files'], path + file['name'] + '/');
			temp += `</div>`;
		}
	}
	return temp
}

// BIG TODOS (in order)
// 1. instead of collections, just have projects
// 2. no open collection function, just open project function
// 3. change chapterdata object to projectdata map (account for all open projects?)
// 4. add extra blob that contains altered code for fixed links
	// will need to handle this for all blob files (recursive link fixing)
// 5. make it so that blobs are removed from memory when a new one is created
	// revoke objecturl?
// 6. get terminal to work
// 7. get 404s to work properly
// 8. get new chapter to load when link clicked

// SMALL TODOS:
// download blob function
	// need to investigate zipping https://stackoverflow.com/questions/17274655/how-to-download-zip-and-save-multiple-files-with-javascript-and-get-progress
// code editor wrapping
// code editor comment shortcut
// font size + and -
// fullscreen code editor
// preview files other than code correctly
	// maybe create blobs for those files too?
// dont rerun code when switching file

// DREAM TODOS:
// add loading to code editor