// Scroll controls
function scrollPage(delta) {
	const sections = document.querySelector('.sections');
	sections.scrollLeft += delta;
}

// Hover effect
let sections = document.querySelectorAll('.section');
for (let section of sections) {
	section.addEventListener('mouseenter', () => {
		for (let section of sections) {
			section.dataset.active = 0;
		}
		section.dataset.active = 1;
	})
	section.addEventListener('mouseleave', () => {
		for (let section of sections) {
			section.dataset.active = 1;
		}
	})
}