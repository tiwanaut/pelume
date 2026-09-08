(function () {
  var root = document.documentElement;

  /* Theme toggle */
  var button = document.querySelector("[data-theme-toggle]");
  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function sync() {
    if (!button) return;
    var dark = current() === "dark";
    button.setAttribute("aria-checked", dark ? "true" : "false");
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  if (button) {
    button.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      sync();
    });
    sync();
  }

  /* Any link whose visible text is emoji (plus arrows or punctuation) loses its
     underline automatically, so new emoji links need no extra class. */
  var pictographic = /\p{Extended_Pictographic}/u;
  var decorative = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s\u200d\uFE0F\u2190-\u21FF\u00B7.,!?:;·—–-]*$/u;

  Array.prototype.forEach.call(document.querySelectorAll("a"), function (a) {
    var text = a.textContent.trim();
    if (pictographic.test(text) && decorative.test(text)) {
      a.classList.add("plain");
    }
  });
})();
