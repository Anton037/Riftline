// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "5.2.3",
    title: "Simple controls",
    items: ["Play with touch in landscape on phones and tablets, or with keyboard and mouse on desktop."],
  },
  {
    version: "5.2.2",
    title: "Steadier aim and cleaner shots",
    items: [
      "With Auto Fire off, the Keeper turns toward the mouse without shooting.",
      "Aim assist checks cover from the weapon, and close enemies can be hit at the barrel.",
      "Shots stay on course during quick turns, and Echo Shot repeats from the original spot.",
      "Back Shot respects cover, and helper wisps turn toward what they shoot.",
      "Star Hall and Star Heart use their own portal and aiming effects again.",
    ],
  },
  {
    version: "5.2.1",
    title: "Cleaner menus",
    items: [
      "Settings and menus have fewer shortcut labels, and the shortcuts still work.",
      "Settings can show live FPS and CPU frame time during play.",
      "Screen-edge arrows point toward enemies and healing pickups.",
    ],
  },
];
