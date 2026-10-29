// The page runtime: the reveal.js configuration, the effect of each fragment (the start of a `show` or `focus` effect, or
// the end of a `focus` ring, `data-effect-edge="end"`), the sounds that ride along with a fragment or a slide and
// `window.reebeatDeck`, the handle the capture drives. It is plain JavaScript text (no framework, no module system) so that
// `deck.html` works from `file://`. The text is generated here and written to `assets/deck.js` by the build program.
import { Array as Arr } from "effect";

import { fontFaces } from "./theme.ts";
import type { DeckSettings } from "./theme.ts";

/**
 * The reveal.js configuration of the Deck page (spec 0001, Deck page contract). The slide size and the Auto-Animate
 * duration come from `plan.settings` (`width`, `height`, `transition`); the rest is fixed.
 */
const revealConfig = (settings: DeckSettings) =>
  ({
    autoAnimateDuration: settings.transition,
    autoAnimateEasing: "ease",
    controls: false,
    fragments: true,
    hash: false,
    height: settings.height,
    margin: 0,
    maxScale: 1,
    minScale: 1,
    progress: false,
    slideNumber: false,
    transition: "fade",
    width: settings.width,
  }) as const;

const fontLoads = Arr.join(
  Arr.map(
    fontFaces,
    ({ weight }) => `document.fonts.load("${weight} 1em Inter")`
  ),
  ", "
);

/** The text of `assets/deck.js` for a Plan's settings. */
export const runtimeJs = (settings: DeckSettings): string => `(function () {
  "use strict";

  var slides = Array.prototype.slice.call(
    document.querySelectorAll(".reveal .slides > section[data-scene]")
  );
  var sceneIds = slides.map(function (slide) {
    return slide.getAttribute("data-scene");
  });
  var focused = null;
  var focusedBy = null;
  var focusBefore = new Map();
  var ringBefore = new Map();

  function target(fragment, id) {
    var slide = fragment.closest("section");
    return slide ? slide.querySelector('[data-id="' + CSS.escape(id) + '"]') : null;
  }

  function setFocus(element, on) {
    if (element) {
      element.classList.toggle("focused", on);
    }
  }

  function playSound(name) {
    var played = new Audio("assets/sfx/" + name + ".wav").play();
    if (played && played.catch) {
      played.catch(function () {});
    }
  }

  function playSounds(element) {
    (element.getAttribute("data-sounds") || "").split(" ").forEach(function (name) {
      if (name) {
        playSound(name);
      }
    });
  }

  // The ring has ONE owner: the effect whose start put it on its target (\`focusedBy\`, an effect id). The end of a ring
  // (\`data-effect-edge="end"\`) takes it off only while its own effect still owns it: a later focus, on another target
  // or on the same one, has taken the ring over, and the Timeline says that focus lasts to its own end, so the earlier
  // end is then a no-op. Stepping back restores the ring and its owner as they were.
  function isEnd(fragment) {
    return fragment.getAttribute("data-effect-edge") === "end";
  }

  function takeRingOff(fragment) {
    var ringed = target(fragment, fragment.getAttribute("data-target"));
    var owned = ringed !== null && focused === ringed && focusedBy === fragment.getAttribute("data-effect-id");
    ringBefore.set(fragment, { element: ringed, owned: owned });
    if (owned) {
      setFocus(ringed, false);
      focused = null;
      focusedBy = null;
    }
  }

  function putRingBack(fragment) {
    var before = ringBefore.get(fragment);
    if (before && before.owned) {
      setFocus(before.element, true);
      focused = before.element;
      focusedBy = fragment.getAttribute("data-effect-id");
    }
  }

  function show(fragment) {
    var verb = fragment.getAttribute("data-effect-verb");
    if (verb === "show") {
      var revealed = target(fragment, fragment.getAttribute("data-target"));
      if (revealed) {
        revealed.classList.remove("hidden");
        revealed.classList.add("shown");
      }
    } else if (verb === "focus" && isEnd(fragment)) {
      takeRingOff(fragment);
    } else if (verb === "focus") {
      focusBefore.set(fragment, { element: focused, by: focusedBy });
      setFocus(focused, false);
      focused = target(fragment, fragment.getAttribute("data-target"));
      focusedBy = fragment.getAttribute("data-effect-id");
      setFocus(focused, true);
    }
    playSounds(fragment);
  }

  function hide(fragment) {
    var verb = fragment.getAttribute("data-effect-verb");
    if (verb === "show") {
      var concealed = target(fragment, fragment.getAttribute("data-target"));
      if (concealed) {
        concealed.classList.remove("shown");
        concealed.classList.add("hidden");
      }
    } else if (verb === "focus" && isEnd(fragment)) {
      putRingBack(fragment);
    } else if (verb === "focus") {
      setFocus(focused, false);
      var previous = focusBefore.get(fragment) || { element: null, by: null };
      focused = previous.element;
      focusedBy = previous.by;
      setFocus(focused, true);
    }
  }

  function eachEffect(event, apply) {
    (event.fragments || [event.fragment]).forEach(function (fragment) {
      if (fragment && fragment.classList.contains("effect")) {
        apply(fragment);
      }
    });
  }

  var pending = Promise.withResolvers();
  var ready = pending.promise;

  Reveal.on("ready", function () {
    Promise.all([${fontLoads}]).then(function () {
      pending.resolve();
    });
  });
  Reveal.on("fragmentshown", function (event) {
    eachEffect(event, show);
  });
  Reveal.on("fragmenthidden", function (event) {
    eachEffect(event, hide);
  });
  Reveal.on("slidechanged", function (event) {
    focused = null;
    focusedBy = null;
    if (event.currentSlide) {
      playSounds(event.currentSlide);
    }
  });

  window.reebeatDeck = {
    ready: ready,
    sceneIds: sceneIds,
    goToScene: function (sceneId) {
      var index = sceneIds.indexOf(sceneId);
      if (index < 0) {
        throw new Error("reebeat: unknown scene " + sceneId);
      }
      Reveal.slide(index, 0, -1);
    },
    stepFragment: function () {
      return Reveal.nextFragment();
    },
  };

  var config = ${JSON.stringify(revealConfig(settings))};
  config.plugins = [RevealNotes];
  Reveal.initialize(config);
})();
`;
