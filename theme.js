(function () {
  var root = document.documentElement;
  var button = document.querySelector("[data-theme-toggle]");
  if (!button) return;

  button.addEventListener("click", function () {
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = root.getAttribute("data-theme") || (systemDark ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
})();
