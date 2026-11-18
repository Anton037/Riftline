# Riftline audio

The 19 mono transients in `physical-bank.wav` were synthesized for this version of Riftline. The
source is `tools/build-audio-bank.py`, which also generates the clip offsets. Run it with Python 3
to rebuild the 22,050 Hz, 16-bit PCM bank.

Weapon, impact, interface and environmental voices combine the bank with original modal
synthesis in `src/audio/physical-voices.js`. The title, arena and boss music is composed and
synthesized in `src/audio/score.js`. The game plays these assets locally and offline.
