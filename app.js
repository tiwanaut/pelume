/* Pelume — the paperclip mark, the scroll-driven reveal on the letter, and the
   emoji link tidy-up. All progressive enhancement: the pages read fine without
   any of it. */

(function () {
  "use strict";

  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------- the mark */

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

    var source = null;
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
      if (!sample(image)) return; // canvas is tainted, keep the plain image
      host.appendChild(canvas);
      host.classList.add("is-live");
      resize();
      draw();
      bind();
    });

    /* Read the SVG as text and hand it to an Image as a data URL, which keeps
       the canvas readable. Over file:// the fetch is blocked, so fall back to
       the <img> itself and let sample() decide whether it can be read. */
    function loadSource(done) {
      var direct = function () {
        if (img.complete && img.naturalWidth) {
          done(img);
        } else {
          img.addEventListener("load", function () {
            done(img);
          });
        }
      };

      if (!window.fetch || location.protocol === "file:") {
        direct();
        return;
      }

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
          image.onerror = direct;
          image.src =
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        })
        .catch(direct);
    }

    function sample(image) {
      var off = document.createElement("canvas");
      off.width = off.height = GRID;
      var octx = off.getContext("2d");
      octx.drawImage(image, 0, 0, GRID, GRID);
      try {
        swatch = octx.getImageData(0, 0, GRID, GRID).data;
      } catch (e) {
        return false;
      }
      return true;
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

  /* ------------------------------------------------ letter: scroll reveal */

  var paras = [].slice.call(document.querySelectorAll("[data-reveal]"));
  if (paras.length) initReveal(paras);

  function initReveal(paras) {
    var scroller = document.querySelector(".scroll");
    var MIN = 0.13; // starting ink, matches --dim
    var BAND = 110; // px over which a word comes up to full black
    var MARK = 0.66; // reveal line, as a fraction of the visible height

    var words = [];
    var tops = [];
    var ticking = false;

    paras.forEach(split);

    if (!words.length) return;

    if (reduced) {
      words.forEach(function (w) {
        w.style.color = "";
      });
      return;
    }

    measure();
    paint();

    window.addEventListener("resize", function () {
      measure();
      paint();
    });
    window.addEventListener("scroll", request, { passive: true });
    if (scroller) scroller.addEventListener("scroll", request, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        measure();
        paint();
      });
    }

    /* Wrap every word so each can carry its own ink level. */
    function split(p) {
      var text = p.textContent;
      var frag = document.createDocumentFragment();

      text.split(/(\s+)/).forEach(function (token) {
        if (!token) return;
        if (/^\s+$/.test(token)) {
          frag.appendChild(document.createTextNode(token));
          return;
        }
        var span = document.createElement("span");
        span.className = "word";
        span.textContent = token;
        frag.appendChild(span);
        words.push(span);
      });

      p.textContent = "";
      p.appendChild(frag);
    }

    /* Two scroll models: the inner container on desktop, the window on mobile
       where the shell is allowed to grow. */
    function usesContainer() {
      return !!scroller && scroller.scrollHeight - scroller.clientHeight > 4;
    }

    function measure() {
      var container = usesContainer();
      var base = container ? scroller.getBoundingClientRect().top : 0;
      var offset = container ? scroller.scrollTop : window.scrollY;

      tops = words.map(function (w) {
        return w.getBoundingClientRect().top - base + offset;
      });
    }

    function paint() {
      var container = usesContainer();
      var offset = container ? scroller.scrollTop : window.scrollY;
      var height = container ? scroller.clientHeight : window.innerHeight;
      var reach = offset + height * MARK;

      /* Nothing to scroll through: show the letter in full. */
      var still =
        !container && document.documentElement.scrollHeight <= window.innerHeight + 4;

      for (var i = 0; i < words.length; i++) {
        var t = still ? 1 : (reach - tops[i]) / BAND;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        words[i].style.color = "rgba(0,0,0," + (MIN + (1 - MIN) * t).toFixed(3) + ")";
      }
    }

    function request() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        paint();
      });
    }
  }

  /* ------------------------------------------------------- emoji-only links */

  var pictographic = /\p{Extended_Pictographic}/u;
  var decorative = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s\u200d\uFE0F\u2190-\u21FF\u00B7.,!?:;·—–-]*$/u;

  Array.prototype.forEach.call(document.querySelectorAll("a"), function (a) {
    var text = a.textContent.trim();
    if (pictographic.test(text) && decorative.test(text)) {
      a.classList.add("plain");
    }
  });
})();
