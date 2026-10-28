// The page runtime: the reveal.js configuration, the effect of each fragment (a Cue) and `window.reebeatDeck`, the
// handle the capture drives. It is plain JavaScript text (no framework, no module system) so that `deck.html` works
// from `file://`. The text is generated here and written to `assets/deck.js` by `writeDeck`.
import { Array as Arr } from "effect";

import { fontFaces } from "./theme.ts";
import type { DeckSettings } from "./theme.ts";

/**
 * The reveal.js configuration of the Deck page (spec 0001, Deck page contract). The slide size and the Auto-Animate
 * duration come from `plan.settings` (`width`, `height`, `transition`); the rest is fixed.
 */
export const revealConfig = (settings: DeckSettings) =>
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
  var focusBefore = new Map();

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

  function show(fragment) {
    var kind = fragment.getAttribute("data-cue-kind");
    if (kind === "next") {
      var revealed = target(fragment, fragment.getAttribute("data-reveals"));
      if (revealed) {
        revealed.classList.remove("hidden");
        revealed.classList.add("shown");
      }
    } else if (kind === "focus") {
      focusBefore.set(fragment, focused);
      setFocus(focused, false);
      focused = target(fragment, fragment.getAttribute("data-cue-arg"));
      setFocus(focused, true);
    } else if (kind === "sfx") {
      playSound(fragment.getAttribute("data-cue-arg"));
    }
  }

  function hide(fragment) {
    var kind = fragment.getAttribute("data-cue-kind");
    if (kind === "next") {
      var concealed = target(fragment, fragment.getAttribute("data-reveals"));
      if (concealed) {
        concealed.classList.remove("shown");
        concealed.classList.add("hidden");
      }
    } else if (kind === "focus") {
      setFocus(focused, false);
      focused = focusBefore.get(fragment) || null;
      setFocus(focused, true);
    }
  }

  function eachCue(event, apply) {
    (event.fragments || [event.fragment]).forEach(function (fragment) {
      if (fragment && fragment.classList.contains("cue")) {
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
    eachCue(event, show);
  });
  Reveal.on("fragmenthidden", function (event) {
    eachCue(event, hide);
  });
  Reveal.on("slidechanged", function () {
    focused = null;
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
