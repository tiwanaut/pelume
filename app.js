/* Pelume — theme toggle, pixel-dissolve mark, decoding letter text.
   Everything here is progressive enhancement: the page reads fine without it. */

(function () {
  "use strict";

  var root = document.documentElement;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------- theme */

  var button = document.querySelector("[data-theme-toggle]");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function syncToggle() {
    if (!button) return;
    var light = currentTheme() === "light";
    button.setAttribute("aria-checked", light ? "false" : "true");
    button.setAttribute(
      "aria-label",
      light ? "Switch to dark mode" : "Switch to light mode"
    );
  }

  if (button) {
    button.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {
        /* private browsing */
      }
      syncToggle();
    });
    syncToggle();
  }

  /* ----------------------------------------------------------- the mark */

  var host = document.querySelector("[data-clip]");
  if (host && !reduced && window.requestAnimationFrame) {
    initMark(host);
  }

  function initMark(host) {
    var img = host.querySelector("img");
    var GRID = 46; // cells per side
    var RADIUS = 7.5; // cursor influence, in cells
    var DECAY = 0.93;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext("2d");

    var source = null; // decoded SVG as an Image
    var swatch = null; // Uint8ClampedArray, GRID * GRID * 4
    var field = new Float32Array(GRID * GRID);
    var settled = 0; // baseline dissolve, toggled by click
    var px = -999;
    var py = -999;
    var hot = false;
    var frame = 0;
    var size = 0;

    loadSource(function (image) {
      source = image;
      sample(image);
      host.appendChild(canvas);
      host.classList.add("is-live");
      resize();
      draw();
      bind();
    });

    /* Read the SVG as text and hand it to an Image as a data URL. Keeps the
       canvas untainted everywhere, and lets us drop the file's XML prolog. */
    function loadSource(done) {
      fetch(img.currentSrc || img.src)
        .then(function (r) {
          return r.text();
        })
        .then(function (text) {
          var svg = text.replace(/<\?xml[^>]*\?>/i, "").trim();
          var image = new Image();
          image.onload = function () {
            done(image);
          };
          image.onerror = function () {};
          image.src =
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        })
        .catch(function () {});
    }

    function sample(image) {
      var off = document.createElement("canvas");
      off.width = off.height = GRID;
      var octx = off.getContext("2d");
      octx.drawImage(image, 0, 0, GRID, GRID);
      swatch = octx.getImageData(0, 0, GRID, GRID).data;
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = host.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      var cell = size / GRID;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, 0, 0, size, size);

      for (var y = 0; y < GRID; y++) {
        for (var x = 0; x < GRID; x++) {
          var i = y * GRID + x;
          var d = field[i];
          if (d < 0.01) continue;

          var left = x * cell;
          var top = y * cell;
          ctx.clearRect(left - 0.5, top - 0.5, cell + 1, cell + 1);

          var a = swatch[i * 4 + 3] / 255;
          if (a < 0.04) continue;

          var inset = cell * 0.24 * d;
          ctx.globalAlpha = a * (1 - d * 0.1);
          ctx.fillStyle =
            "rgb(" +
            swatch[i * 4] +
            "," +
            swatch[i * 4 + 1] +
            "," +
            swatch[i * 4 + 2] +
            ")";
          ctx.fillRect(
            left + inset,
            top + inset,
            Math.max(cell - inset * 2, 0.5),
            Math.max(cell - inset * 2, 0.5)
          );
          ctx.globalAlpha = 1;
        }
      }
    }

    function step() {
      var busy = false;
      var cell = size / GRID;
      var cx = px / cell;
      var cy = py / cell;

      for (var y = 0; y < GRID; y++) {
        for (var x = 0; x < GRID; x++) {
          var i = y * GRID + x;
          var next = field[i] * DECAY;

          if (hot) {
            var dx = x + 0.5 - cx;
            var dy = y + 0.5 - cy;
            var near = 1 - Math.sqrt(dx * dx + dy * dy) / RADIUS;
            if (near > next) next = near > 1 ? 1 : near;
          }
          if (next < settled) next = settled;
          if (next < 0) next = 0;

          if (Math.abs(next - field[i]) > 0.002) busy = true;
          field[i] = next;
        }
      }

      draw();
      frame = busy || hot ? requestAnimationFrame(step) : 0;
    }

    function wake() {
      if (!frame) frame = requestAnimationFrame(step);
    }

    function bind() {
      host.addEventListener("pointermove", function (e) {
        var box = host.getBoundingClientRect();
        px = e.clientX - box.left;
        py = e.clientY - box.top;
        hot = true;
        wake();
      });

      host.addEventListener("pointerleave", function () {
        hot = false;
        wake();
      });

      host.addEventListener("click", function () {
        settled = settled > 0 ? 0 : 1;
        wake();
      });

      if (window.ResizeObserver) {
        new ResizeObserver(function () {
          if (!source) return;
          resize();
          draw();
        }).observe(host);
      } else {
        window.addEventListener("resize", function () {
          resize();
          draw();
        });
      }
    }
  }

  /* ------------------------------------------------------- letter decode */

  var lines = [].slice.call(document.querySelectorAll("[data-decode]"));
  if (lines.length && !reduced && window.IntersectionObserver) {
    initDecode(lines);
  }

  function initDecode(lines) {
    var GLYPHS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var PER_CHAR = 9; // ms of runway per character
    var MAX = 1400;
    var queued = 0;

    lines.forEach(function (el) {
      el.dataset.final = el.textContent;
      el.textContent = mask(el.dataset.final, 0);
    });

    var watcher = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          watcher.unobserve(entry.target);
          var delay = queued * 140;
          queued++;
          setTimeout(function () {
            run(entry.target);
          }, delay);
        });
      },
      { rootMargin: "0px 0px -12% 0px" }
    );

    lines.forEach(function (el) {
      watcher.observe(el);
    });

    function mask(text, progress) {
      var cut = Math.floor(text.length * progress);
      var out = "";
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (i < cut || !/[A-Za-z]/.test(ch)) {
          out += ch;
        } else {
          out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
      }
      return out;
    }

    function run(el) {
      var text = el.dataset.final;
      var span = Math.min(text.length * PER_CHAR, MAX);
      var start = performance.now();

      (function tick(now) {
        var progress = Math.min((now - start) / span, 1);
        el.textContent = mask(text, progress);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = text;
        }
      })(start);
    }
  }
})();
