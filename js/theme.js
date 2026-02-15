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
});
