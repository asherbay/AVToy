import { useEffect, useRef, useState } from "react";
import "./App.css";
import * as Tone from "tone";
import { createEngine } from "./audioEngine";
import { mountSketch } from "./sketch";

function App() {
  const engineRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [combFbGain, setCombFbGain] = useState(0.0);

  const p5ContainerRef = useRef(null)

  // Create engine once, dispose on unmount
  useEffect(() => {
    engineRef.current = createEngine();

    return () => {
      const eng = engineRef.current;
      if (eng) {
        try { eng.stop?.(); } catch {}
        try { eng.dispose?.(); } catch {}
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
      engineRef.current?.forEach(v => {

    // X controls filter cutoff (log mapping feels natural)
   const partials = linMap(ctl.x, 0., 0.5) < 0. ? 0. : linMap(ctl.x, 0., 0.5);
   v.setMorphAmount(partials);

    // Y controls reverb wet
    const wet = linMap(Math.abs(ctl.y), 0, 1.0) < 0.01 ? 0.01 : linMap(Math.abs(ctl.y), 0, 1.0) >= 1.0 ? 1.0 : linMap(Math.abs(ctl.y), 0, 1.0);
    v.reverb.wet.rampTo(wet, 0.05);

    // Mouse speed excites modulation index
    const mod = linMap(ctl.speed, 0, 10);
    //v.osc.modulationIndex.rampTo(mod, 0.05);

  })
      //console.log(ctl);
    });

    return () => {
      instance.remove(); // important: cleanup p5 on unmount
    };
  }, []);

 const handleSlider = (e) => {
  const t = Number(e.target.value);
  engineRef.current?.forEach(v => v.setMorphAmount(t));
};

  const handleClick = async () => {
    if (started) return;

    await Tone.start();    
   engineRef.current[0].startTransport();
      // unlock audio
    engineRef.current?.forEach(voice => voice.start());      // start your synth/graph
    setStarted(true);

    console.log("audio ready");
  };

  function linMap(x, min, max) {
    return min + x * (max - min);
  }

  function expMap(x, min, max) {
    return min * Math.pow(max / min, x);
  }


  return (
    <div>
      <button onClick={handleClick} disabled={started}>
        {started ? "Running" : "Start"}
      </button>
      <div>
        <label>
          Partials {combFbGain.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="1.00"
          step="0.02"
          value={combFbGain}
          onChange={handleSlider}
        />
        <button onClick={() => engineRef.current?.forEach(voice => voice.triggerMetal?.())}>
          Trigger Metal
        </button>
      <div style={{ padding: 20 }}>
      <div ref={p5ContainerRef} />
      </div>
      </div>
    </div>
  );
}

export default App;
