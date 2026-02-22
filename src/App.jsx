import { useEffect, useRef, useState } from "react";
import "./App.css";
import * as Tone from "tone";
import { createEngine } from "./audioEngine";
import { mountSketch } from "./sketch";

function linMap(x, min, max) {
  return min + x * (max - min);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function App() {
  const engineRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [combFbGain, setCombFbGain] = useState(0.0);

  const p5ContainerRef = useRef(null);

  // Create engine once, dispose on unmount
  useEffect(() => {
    engineRef.current = createEngine();

    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.stop?.();
        } catch (err) {
          console.error("Failed to stop audio engine", err);
        }
        try {
          eng.dispose?.();
        } catch (err) {
          console.error("Failed to dispose audio engine", err);
        }
      }
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!p5ContainerRef.current) return;

    const instance = mountSketch(p5ContainerRef.current, (ctl) => {
      // ctl.x, ctl.y, ctl.speed, ctl.mouseDown
      // hook these into your Tone engine here
      // e.g. engineRef.current?.forEach(v => v.setSomething(ctl.x))
      engineRef.current?.forEach((v) => {
        // Y controls reverb wet
        const wet =
          linMap(Math.abs(ctl.y), 0, 1.0) < 0.01
            ? 0.01
            : linMap(Math.abs(ctl.y), 0, 1.0) >= 1.0
            ? 1.0
            : linMap(Math.abs(ctl.y), 0, 1.0);
        v.reverb.wet.rampTo(wet, 0.05);

        // Mouse speed excites modulation index
        const speed = linMap(ctl.speed, 0.0, 0.5);
        v.setMorphAmount(speed);
        //v.osc.modulationIndex.rampTo(mod, 0.05);
      });
      //console.log(ctl);
    }, (clickData) => {
        let v = randomItem(engineRef.current);
        let primaryPitch = v.getPrimaryPitch();
        let secondaryPitch = v.getSecondaryPitch();
        let targetPitch;
          console.log("frequency: ", v.osc.frequency.value, "primary: ", primaryPitch);

        if (v.osc.frequency.value == primaryPitch) {
          console.log("voice at primary pitch");
          targetPitch = secondaryPitch;
        } else {
          console.log("voice not at primary pitch");
          targetPitch = primaryPitch;
        }
        if (clickData.x >= 0. && clickData.x <= 1.0 && clickData.y >= 0. && clickData.y <= 1.0 ) {
          v.slideToPitch(targetPitch, Math.random() * 2.5 + 1.5);
        }
        console.log("click!", clickData);
      }
  );

    return () => {
      instance.remove(); // important: cleanup p5 on unmount
    };
  }, []);

  const handleSlider = (e) => {
    const t = Number(e.target.value);
    setCombFbGain(t);
    engineRef.current?.forEach((v) => v.setMorphAmount(t));
  };

  const handleClick = async () => {
    if (started) return;

    await Tone.start();
    engineRef.current[0].startTransport();
    // unlock audio
    engineRef.current?.forEach((voice) => voice.start()); // start your synth/graph
    setStarted(true);

    console.log("audio ready");
  };
  return (
    <div>
      <button onClick={handleClick} disabled={started}>
        {started ? "Running" : "Start"}
      </button>
      <div>
        <label>Partials {combFbGain.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="1.00"
          step="0.02"
          value={combFbGain}
          onChange={handleSlider}
        />
        {/* <button onClick={() => engineRef.current?.forEach(voice => voice.triggerMetal?.())}>
          Trigger Metal
        </button> */}
        <div style={{ padding: 20 }}>
          <div ref={p5ContainerRef} />
        </div>
      </div>
    </div>
  );
}

export default App;
