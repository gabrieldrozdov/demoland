const fs = require('fs');

// Get JSON
const catalog = require('./catalog.json');

function generateCatalog() {
	let catalogSections = '';
	for (let catalogChapter of Object.keys(catalog)) {
		let entry = catalog[catalogChapter];
		
		// Generate demos
		let demos = '';
		let demoIndex = 1;
		for (let demo of Object.keys(entry['demos'])) {
			let demoInfo = entry['demos'][demo];
			demos += `
				<a href="/editor/?collection=${catalogChapter}&demo=${demo}" class="section-demo" style="--primary: var(--${demoInfo['color']});">
					<div class="section-demo-number">${demoIndex}</div>
					<div class="section-demo-name">${demoInfo['name']}</div>
				</a>
			`;
			demoIndex++;
		}

		// Put it all together
		catalogSections += `
			<section class="section">
				<div class="section-desc">
					<p class="section-subtitle">${entry['subtitle']}</p>
					<h2 class="section-title">${entry['title']}</h2>
					<div class="section-desc-content">
						${entry['desc']}
					</div>
				</div>
				<div class="section-demos">
					<h3 class="section-demos-title">
						<svg viewBox="0 0 100 100"><path d="m60,30V10H10v80h80V30h-30Zm-40-10h30v10h-30v-10Zm0,60v-40h60v40H20Z"/></svg>
						<span>Demos</span>
					</h3>
					<div class="section-demos-links">
						${demos}
					</div>
				</div>
			</section>
		`;
	}

	let catalogContent = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>DEMOLAND</title>
		
			<meta name="author" content="GD with GD">
			<meta name="keywords" content="Web Design, Web Development, Creative Coding, Design Education, Code Education">
			<meta name="description" content="Learn how to code HTML, CSS, and JavaScript right in your web browser!">
			<meta property="og:url" content="https://demoland.gdwithgd.com/">
			<meta name="og:title" property="og:title" content="DEMOLAND">
			<meta property="og:description" content="Learn how to code HTML, CSS, and JavaScript right in your web browser!">
			<meta property="og:image" content="/assets/meta/opengraph.jpg">
			<link rel="icon" type="png" href="/assets/meta/favicon.png">
		
			<link rel="stylesheet" href="style.css">
		</head>
		<body>
			<div class="container">

				<header class="header">
					<div class="header-title-container">
						<svg viewBox="0 0 100 100" class="header-logo"><path d="m25,5c-5.52,0-10,4.48-10,10v70c0,5.52,4.48,10,10,10h60V5H25Zm50,80H28c-2.76,0-5-2.24-5-5s2.24-5,5-5h47v10Zm0-20H28V15h47v50Z"/><rect x="38" y="25" width="27" height="10"/></svg>
						<h1 class="header-title">
							<span class="header-title-small">Welcome to</span>
							<span class="header-title-big">DEMOLAND</span>
						</h1>
					</div>
					<div class="header-desc">
						<p>
							<span class="header-desc-long">HTML, CSS, and JavaScript demos presented entirely within your web browser.</span> By <a href="https://gdwithgd.com/" target="_blank">GD with GD</a>.
						</p>
					</div>
				</header>
			
				<main class="sections">
					${catalogSections}
				</main>

				<nav class="nav">
					<div class="nav-controls">
						<button class="nav-controls-button" onclick="scrollPage(-400);">
							<svg viewBox="0 0 100 100"><polygon points="67.697 28.749 46.445 50 67.697 71.251 60.626 78.322 32.303 50 60.626 21.678 67.697 28.749"/></svg>
						</button>
						<button class="nav-controls-button" onclick="scrollPage(400);">
							<svg viewBox="0 0 100 100"><polygon points="32.303 28.749 53.555 50 32.303 71.251 39.374 78.322 67.697 50 39.374 21.678 32.303 28.749"/></svg>
						</button>
					</div>
				</nav>

			</div>
		
			<script src="script.js"></script>
		</body>
		</html>
	`;

	// Create work file
	fs.writeFile(`index.html`, catalogContent, err => {
		if (err) {
			console.error(err);
		}
	});
}
generateCatalog();