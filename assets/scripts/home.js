// Open book
function openBook(key) {
	if (document.querySelector(`#${key}`) == undefined) {
		return
	}

	// Hide all books and intro
	const intro = document.querySelector('.intro');
	intro.dataset.active = 0;
	for (const book of document.querySelectorAll('.book')) {
		book.dataset.active = 0;
	}

	// Activate correct book
	const activeBook = document.querySelector(`#${key}`);
	activeBook.dataset.active = 1;
}

// Return to intro screen
function openIntro() {
	history.replaceState(null, null, ' '); // Update the URL without the hash

	// Hide all books
	for (const book of document.querySelectorAll('.book')) {
		book.dataset.active = 0;
	}

	// Show intro
	const intro = document.querySelector('.intro');
	intro.dataset.active = 1;
}

// Read URL and open relevant book
document.addEventListener("DOMContentLoaded", readHash);
function readHash() {
    const hash = window.location.hash; // Get the hash from the URL
    if (hash) {
        // Remove the '#' symbol
        const id = hash.substring(1);
		openBook(id);
    } else {
		openIntro();
	}

	// Enable transitions
	const body = document.querySelector('body');
	setTimeout(() => {
		body.dataset.initialized = 1;
	}, 50)
}

// Detect user page navigation
window.addEventListener('popstate', readHash);

// Hover effect for chapters in book
let chapters = document.querySelectorAll('.chapter');
for (let chapter of chapters) {
	chapter.addEventListener('mouseenter', () => {
		for (let chapter of chapters) {
			chapter.dataset.active = 0;
		}
		chapter.dataset.active = 1;
	})
	chapter.addEventListener('mouseleave', () => {
		for (let chapter of chapters) {
			chapter.dataset.active = 1;
			chapter.scrollTop = 0;
		}
	})
}

// Books interactive art
function generateBooks() {
	const introBooks = document.querySelector('.intro-books');
	let introBooksTemp = '<div class="intro-books-unit">';
	const demoKeys = Object.keys(allDemos);
	for (let i=0; i<100; i++) {
		const randomKey = demoKeys[Math.floor(Math.random()*demoKeys.length)];
		const randomDemo = allDemos[randomKey];
		introBooksTemp += `<a style='--primary: ${randomDemo['color']}; transform: rotate(${Math.random()*4-2}deg);' class="intro-books-unit-book" href='${randomDemo['url']}' target='_blank'><span>${randomDemo['name']}</span></a>`;
	}
	introBooksTemp += '</div>';
	introBooks.innerHTML = introBooksTemp + introBooksTemp + introBooksTemp;
}
generateBooks();

// Info
function toggleInfo() {
	const info = document.querySelector('.info');
	if (parseInt(info.dataset.active) == 0){
		info.dataset.active = 1;
	} else {
		info.dataset.active = 0;
	}
}