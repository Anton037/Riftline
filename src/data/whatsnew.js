// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.2.9",
    title: "Safer pauses and checkpoints",
    items: [
      "If the browser loses graphics, the run pauses until you can see again.",
      "Endless saves as soon as you enter it.",
      "Continue tells you when you're returning to a reward choice or the Roadside Forge.",
      "On tablets, you can swipe through a long list of your crafts while choosing a reward.",
      "When no crafts are available, the reward shows how much HP you actually recovered.",
    ],
  },
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
];
