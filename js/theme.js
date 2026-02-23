document.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("theme-toggle-btn");
    const body = document.body;

    // Check saved preference
    if (localStorage.getItem("theme") === "light") {
        body.classList.add("light-theme");
        updateIcon(true);
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            body.classList.toggle("light-theme");
            const isLight = body.classList.contains("light-theme");

            // Save preference
            localStorage.setItem("theme", isLight ? "light" : "dark");

            updateIcon(isLight);
        });
    }

    function updateIcon(isLight) {
        if (!themeBtn) return;
        themeBtn.innerHTML = isLight ? "☀️" : "🌙";
    }

    // ── Hamburger Mobile Menu Logic ─────────────────────────────────
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelector('.nav-links');

    if (navbar && navLinks) {
        // Create hamburger button dynamically
        const hamburger = document.createElement('button');
        hamburger.className = 'hamburger';
        hamburger.innerHTML = '<span></span><span></span><span></span>';

        // Insert after the theme button, or at the start
        if (themeBtn) {
            themeBtn.parentNode.insertBefore(hamburger, themeBtn.nextSibling);
        } else {
            navbar.insertBefore(hamburger, navbar.firstChild);
        }

        // Toggle mobile menu
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('show-menu');
            hamburger.classList.toggle('toggle-active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navbar.contains(e.target)) {
                navLinks.classList.remove('show-menu');
                hamburger.classList.remove('toggle-active');
            }
        });
    }
});
