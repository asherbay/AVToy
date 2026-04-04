# AVToy

Interactive audio toy built with React, Tone.js, and p5.

It generates three evolving drone voices with:
- intermittent pitch slides
- occasional voice ducking
- a retriggered metal texture layer
- mouse-driven spatial/timbre modulation

## Run

Requires Node 20+.

```bash
npm install
npm run dev
```

## Use

- Click `Start` to unlock audio.
- Move the mouse to modulate the sound.
- Vertical position affects reverb wetness.
- The `Partials` slider is mainly a direct test/control for oscillator morphing.

## Notes

- Audio behavior is defined primarily in [`src/audioEngine.js`](/Users/eshbay/code/AVToy/src/audioEngine.js).
- Visual/input behavior is defined in [`src/sketch.js`](/Users/eshbay/code/AVToy/src/sketch.js) and [`src/App.jsx`](/Users/eshbay/code/AVToy/src/App.jsx).

## TODO

- Mouse-movement-driven partial morphing is not working yet.
