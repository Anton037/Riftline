# Riftline audio

The 19 mono acoustic transients in `physical-bank.wav` were synthesized for Riftline using warm
handcrafted modal resonances (felted kalimba, rosewood marimba, glazed celesta bells, antique brass,
clay hand-drums, powdery snow and mossy reeds). The source is `tools/build-audio-bank.py`, which also
generates the clip offsets in `src/audio/source-bank.js`. Run it with Python 3 to rebuild the
22,050 Hz, 16-bit PCM bank.

Weapon, impact, interface and environmental voices combine the bank with warm modal synthesis and
musical UI/reward chimes in `src/audio/physical-voices.js` and `src/audio/sound.js`. The title,
biome and boss scores are composed and synthesized in `src/audio/score.js`, with spatial biome
soundscapes in `src/audio/place.js`. The game plays these assets locally and offline.
