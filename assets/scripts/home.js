const colors = ['pink', 'green', 'blue', 'yellow', 'purple', 'red'];

// Open book
function openBook(key) {
	history.replaceState(null, null, `#${key}`);

	if (document.querySelector(`#${key}`) == undefined) {
		return
	}

	// Hide all books and intro
	const intro = document.querySelector('.intro');
	intro.dataset.active = 0;
	for (const book of document.querySelectorAll('.book')) {
		book.dataset.active = 0;
	}
	const body = document.querySelector('body');
	body.dataset.intro = 0;

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
	const body = document.querySelector('body');
	body.dataset.intro = 1;
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
	// Foreground (clickable books)
	const homeBooks = document.querySelector('.home-books');
	let homeBooksTemp = '<div class="home-books-unit">';
	const demoKeys = Object.keys(allDemos);
	for (let i=0; i<100; i++) {
		const randomKey = demoKeys[Math.floor(Math.random()*demoKeys.length)];
		const randomDemo = allDemos[randomKey];
		const randomColor = colors[Math.floor(Math.random()*colors.length)];
		homeBooksTemp += `<a style='--primary: var(--${randomColor}); --primary-rgb: var(--${randomColor}-rgb); transform: rotate(${Math.random()*6-3}deg);' class="home-books-unit-book" href='${randomDemo['url']}' target='_blank'><span>${randomDemo['name']}</span></a>`;
	}
	homeBooksTemp += '</div>';
	homeBooks.innerHTML = homeBooksTemp + homeBooksTemp + homeBooksTemp;

	// Background (faded out books)
	const homeBooksBackground = document.querySelector('.home-books-background');
	let homeBooksBackgroundTemp = '<div class="home-books-background-unit">';
	for (let i=0; i<100; i++) {
		const randomKey = demoKeys[Math.floor(Math.random()*demoKeys.length)];
		const randomDemo = allDemos[randomKey];
		const randomColor = colors[Math.floor(Math.random()*colors.length)];
		homeBooksBackgroundTemp += `<div style='--primary: var(--${randomColor}); --primary-rgb: var(--${randomColor}-rgb); transform: rotate(${Math.random()*10-5}deg);' class="home-books-background-unit-book" href='${randomDemo['url']}' target='_blank'><span>${randomDemo['name']}</span></div>`;
	}
	homeBooksBackgroundTemp += '</div>';
	homeBooksBackground.innerHTML = homeBooksBackgroundTemp + homeBooksBackgroundTemp + homeBooksBackgroundTemp;

	// Background2 (more faded out books)
	const homeBooksBackground2 = document.querySelector('.home-books-background2');
	let homeBooksBackground2Temp = '<div class="home-books-background2-unit">';
	for (let i=0; i<100; i++) {
		const randomKey = demoKeys[Math.floor(Math.random()*demoKeys.length)];
		const randomDemo = allDemos[randomKey];
		const randomColor = colors[Math.floor(Math.random()*colors.length)];
		homeBooksBackground2Temp += `<div style='--primary: var(--${randomColor}); --primary-rgb: var(--${randomColor}-rgb); transform: rotate(${Math.random()*12-6}deg);' class="home-books-background2-unit-book" href='${randomDemo['url']}' target='_blank'><span>${randomDemo['name']}</span></div>`;
	}
	homeBooksBackground2Temp += '</div>';
	homeBooksBackground2.innerHTML = homeBooksBackground2Temp + homeBooksBackground2Temp + homeBooksBackground2Temp;
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