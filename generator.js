const introTitle = `Welcome to <span>DEMOLAND</span>, a bookstore that runs on code and teaches it too!`;
const introSubtitle = `
	<p>
		Learn how to code websites using HTML, CSS, and JavaScript right in your web browser! Open a book to read chapters full of interactive demos you can edit and test without leaving this site.
	</p>
	<p>
		Interested in diving deeper into learning design and development? Visit <a href="https://gdwithgd.com/" target="_blank">GD&nbsp;with&nbsp;GD</a> for more resources!
	</p>
`;
const info = `
	<p>
		Hi there! I’m Gabriel, and I made <a href="https://gdwithgd.com/" target="_blank">GD&nbsp;with&nbsp;GD</a> and DEMOLAND. I created this site because I needed a website to easily share code demos with my students. There are products out there that let you do this, but this one’s entirely open-source, which means that it’s free to run and you can launch your own DEMOLAND if you’d like!
	</p>
	<p>
		The site’s still a work-in-progress, but in a future version I’ll include instructions on how to launch your own version. In the meantime, you can check out the <a href="https://github.com/gabrieldrozdov/demoland" target="_blank">GitHub repository</a> to see this site’s code!
	</p>
	<div class="info-divider"></div>
	<p class="info-credits">
		<strong>Credits</strong>
	</p>
	<p class="info-credits">
		DEMOLAND was developed by <a href="https://gdwithgd.com/" target="_blank">GD with GD</a> / <a href="https://gabrieldrozdov.com/" target="_blank">Gabriel Drozdov</a>. The site uses <a href="https://toomuchtype.com/" target="_blank">Limkin by Too Much Type</a> and <a href="https://vercel.com/font" target="_blank">Geist Mono</a>. Code editors are built using <a href='https://codemirror.net/5/' target="_blank">CodeMirror 5</a>.
	</p>
	<p class="info-credits">
		If you launch your own DEMOLAND, I’d appreciate it if you left these credits in! And <a href="mailto:gabriel@noreplica.com">send me an email</a> if you’ve got questions or want to share your own DEMOLAND with me!
	</p>
`;

const fs = require('fs');

// Get JSON
const overviewData = require('./overview.json');

// Generate homepage
function generateOverview() {
	// HTML for the overview of all books
	let overview = '';

	// HTML for the individual books
	let books = "";

	// Array containing objects for all demo names and links
	let allDemos = 'const allDemos = [';

	for (let bookKey of Object.keys(overviewData)) {
		let book = overviewData[bookKey];

		// Build book data
		const bookData = require(`./demos/${bookKey}/${bookKey}.json`);
		let bookChapters = '';
		let totalChapters = 0;
		let totalDemos = 0;
		for (let chapterKey of Object.keys(bookData)) {
			let chapter = bookData[chapterKey];
			if (chapter["active"] == false) {
				continue
			}
			totalChapters++;
			
			// Generate demos
			let demos = '';
			let demoIndex = 1;
			for (let demoKey of Object.keys(chapter['demos'])) {
				totalDemos++;
				let demo = chapter['demos'][demoKey];
				demos += `
					<a href="editor/?book=${bookKey}&chapter=${chapterKey}&demo=${demoKey}" class="chapter-demo">
						<div class="chapter-demo-number">${demoIndex}</div>
						<div class="chapter-demo-name">${demo['name']}</div>
					</a>
				`;
				allDemos += `{'name':'${demo['name']}','url':'editor/?book=${bookKey}&chapter=${chapterKey}&demo=${demoKey}'},`;
				demoIndex++;
			}

			// Put it all together
			bookChapters += `
				<section class="chapter" id="${bookKey}-${chapterKey}">
					<div class="chapter-header">
						<a class="chapter-link" href="editor/?book=${bookKey}&chapter=${chapterKey}&demo=${Object.keys(chapter['demos'])[0]}">
							<div class="chapter-subtitle">
								Chapter ${totalChapters}
							</div>
							<h3 class="chapter-title">
								${chapter['title']}
							</h3>
						</a>
						<p class="chapter-desc">
							${chapter['desc']}
						</p>
						<a href="editor/?book=${bookKey}&chapter=${chapterKey}&demo=${Object.keys(chapter['demos'])[0]}" class="chapter-open">
							<span>Open chapter</span>
							<svg viewBox="0 0 100 100"><path d="M25,14.97v70.06l25-21.25,25,21.25V14.97H25ZM66,65.56l-16-13.6-16,13.6V23.97h32v41.59Z"/></svg>
						</a>
					</div>
					<div class="chapter-demos">
						${demos}
					</div>
				</section>
			`;
		}

		// Add to book string
		books += `
			<article class="book" data-active="0" id="${bookKey}">
				<div class="book-content">
					<header class="book-intro">
						<button class="book-intro-return" onclick="openIntro();">
							<svg viewBox="0 0 100 100"><path d="m25,5c-5.52,0-10,4.48-10,10v70c0,5.52,4.48,10,10,10h60V5H25Zm50,80H28c-2.76,0-5-2.24-5-5s2.24-5,5-5h47v10Zm0-20H28V15h47v50Z"></path><rect x="38" y="25" width="27" height="10"></rect></svg>
							<span>View all books</span>
						</button>
						<h2 class="book-intro-title">${book['title']}</h2>
						<div class="book-intro-desc">${book['desc']}</div>
					</header>
					<div class="chapter-grid">
						${bookChapters}
					</div>
				</div>
			</article>
		`;

		// Add book link to overview
		if (book['unlisted'] == true) {
			continue
		}
		let chaptersPlural = '';
		if (totalChapters > 1) {
			chaptersPlural = 's';
		}
		let demosPlural = '';
		if (totalDemos > 1) {
			demosPlural = 's';
		}
		let shortdesc = '';
		if (book['shortdesc'] != '') {
			shortdesc = `<p class="intro-index-link-shortdesc">${book['shortdesc']}</p>`;
		}
		overview += `
			<a href="#${bookKey}" class="intro-index-link" onclick="openBook('${bookKey}');">
				<div class="intro-index-link-main">
					<h3 class="intro-index-link-title">${book['title']}</h3>
					${shortdesc}
				</div>
				<div class="intro-index-link-info">
					<div>${totalChapters} Chapter${chaptersPlural}</div>
					<div>${totalDemos} Demo${demosPlural}</div>
				</div>
			</a>
		`;
	}

	// Put everything together
	let overviewContent = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>DEMOLAND, by GD with GD</title>

			<meta name="author" content="Gabriel Drozdov / GD with GD">
			<meta name="keywords" content="Web Design, Web Development, Creative Coding, Design Education, Code Education, Storytelling, Pedagogy">
			<meta name="description" content="In-browser code editor with a library of tutorials!">
			<meta property="og:url" content="https://demoland.gdwithgd.com/">
			<meta name="og:title" property="og:title" content="Demoland, by GD with GD">
			<meta property="og:description" content="In-browser code editor with a library of tutorials!">
			<meta property="og:image" content="./assets/meta/opengraph.jpg">
			<link rel="icon" type="png" href="./assets/meta/favicon.png">
			<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💻</text></svg>">

			<link rel="stylesheet" href="./assets/styles/home.css">
		</head>
		<body>
			<main class="content">
				<div class="toggles">
					<button onclick="toggleInfo()">
						<svg viewBox="0 0 100 100"><rect x="45" y="40" width="10" height="50"/><circle cx="50" cy="20" r="10"/></svg>
						<span>Info</span>
					</button>
					<a href="editor/?book=tutorial&chapter=tutorial&demo=welcome">
						<svg viewBox="0 0 100 100"><path d="M59,81c0,4.971-4.029,9-9,9s-9-4.029-9-9,4.029-9,9-9,9,4.029,9,9ZM50,10c-13.81,0-25,11.19-25,25h10c0-8.28,6.72-15,15-15s15,6.72,15,15-6.72,15-15,15h-5v15h10v-5.501c11.413-2.316,20-12.402,20-24.499,0-13.81-11.19-25-25-25Z"/></svg>
						<span>Tutorial</span>
					</a>
					<a href="editor/">
						<svg viewBox="0 0 100 100"><polygon points="90 45 55 45 55 10 45 10 45 45 10 45 10 55 45 55 45 90 55 90 55 55 90 55 90 45"/></svg>
						<span>Blank Demo</span>
					</a>
					<a href="https://cheatsheet.gdwithgd.com/" target="_blank">
						<svg viewBox="0 0 100 100"><path d="M59.07,12.65L16.64,55.08v28.27h28.29l42.43-42.42-28.29-28.28ZM40.79,73.36l-14.15-14.14L59.07,26.78l14.14,14.15-32.42,32.43Z"/></svg>
						<span>Cheatsheet</span>
					</a>
				</div>
				<div class="info" data-active="0">
					<button class="info-close" onclick="toggleInfo();">
						<svg viewBox="0 0 100 100"><polygon points="81.82 74.749 57.071 50 81.82 25.251 74.749 18.18 50 42.929 25.251 18.18 18.18 25.251 42.929 50 18.18 74.749 25.251 81.82 50 57.071 74.749 81.82 81.82 74.749"/></svg>
					</button>
					${info}
				</div>

				<div class="intro">
					<div class="intro-content">
						<header class="intro-header">
							<h1 class="intro-title">${introTitle}</h1>
							<div class="intro-subtitle">${introSubtitle}</div>
						</header>
						<nav class="intro-index">
							<h2 class="intro-index-title">
								<svg viewBox="0 0 100 100"><path d="m25,5c-5.52,0-10,4.48-10,10v70c0,5.52,4.48,10,10,10h60V5H25Zm50,80H28c-2.76,0-5-2.24-5-5s2.24-5,5-5h47v10Zm0-20H28V15h47v50Z"/><rect x="38" y="25" width="27" height="10"/></svg>
								<span>Select a book</span>
							</h2>
							${overview}
						</nav>
					</div>
				</div>

				${books}

				<div class="home-vignette"></div>
				<div class="home-books-container">
					<div class="home-books"></div>
				</div>
				<div class="home-books-background-container">
					<div class="home-books-background"></div>
				</div>
				<div class="home-books-background2-container">
					<div class="home-books-background2"></div>
				</div>
			</main>

			<script src="assets/scripts/all-demos.js"></script>
			<script src="assets/scripts/home.js"></script>
		</body>
		</html>
	`;

	// Create homepage file
	fs.writeFile(`index.html`, overviewContent, err => {
		if (err) {
			console.error(err);
		}
	});

	// Create file containing all demo names
	fs.writeFile(`./assets/scripts/all-demos.js`, allDemos+']', err => {
		if (err) {
			console.error(err);
		}
	});
}
generateOverview();