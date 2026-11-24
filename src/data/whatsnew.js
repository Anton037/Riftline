// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.2.8",
    title: "A clearer Keeper",
    items: [
      "A shorter brim and a pale clasp make it easier to see which way the Keeper is facing.",
      "The ground arrow and the weapon preview stay lined up with the Keeper as they turn.",
    ],
  },
  {
    version: "5.2.7",
    title: "Movement follows your thumb",
    items: [
      "The mobile movement stick follows long drags so you can change direction quickly.",
      "You can save either movement stick style from Button layout.",
    ],
  },
  {
    version: "5.2.6",
    title: "Easier reward picks",
    items: [
      "Small touch screens show when there are more reward cards to swipe to.",
      "Swiping keeps the offer open, and pausing or turning your phone keeps your place.",
      "Rerolls only spend a charge when they turn up a new card.",
      "Long Endless builds scroll separately so your reward cards stay in view.",
    ],
  },
  {
    version: "5.2.5",
    title: "Faster craft picks",
    items: [
      "Tap a craft as soon as it appears, even while another finger is on the screen.",
      "Boss rewards show when they can't be sealed, and Seal starts off on each new offer.",
    ],
  },
  {
    version: "5.2.4",
    title: "Sharper cues and safer saves",
    items: [
      "Right-click while standing still to dash toward the cursor.",
      "The aim guide and damage markers line up with what happens on screen.",
      "New runs clear old damage markers and held keys.",
      "Boss medals are saved alongside progress from another tab.",
      "Save imports check for bad data, and offline updates check that the game files match.",
    ],
  },
];
