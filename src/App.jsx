import { useEffect, useRef, useState } from "react";
import "./App.css";
import * as Tone from "tone";
import { createEngine } from "./audioEngine";
import { mountSketch } from "./sketch";

function linMap(x, min, max) {
  return min + x * (max - min);
}

function clamp(x, min = 0, max = 1) {
  return Math.min(max, Math.max(min, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function selectorToVoiceWeights(selector) {
  const x = clamp(selector);
  return [
    clamp(1 - x * 2),
    clamp(1 - Math.abs(x - 0.5) * 2),
    clamp(x * 2 - 1),
  ];
}

function driftingSelector(timeSeconds) {
  const primary = 0.5 + 0.35 * Math.sin(timeSeconds * 0.11);
  const secondary = 0.15 * Math.sin(timeSeconds * 0.043 + 1.7);
  return clamp(primary + secondary);
}

function speedToMorph(speed) {
  return clamp(speed > 0.01 ? 1 : speed * 20);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatPerfValue(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function App() {
  const engineRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [partialsAmt, setpartialsAmt] = useState(0.0);
  const [perfStats, setPerfStats] = useState({
    fps: 0,
    controlAvgMs: 0,
    controlPeakMs: 0,
    longTasksPerSec: 0,
    heapMb: null,
    audioCallbackLagMs: 0,
    audioCallbackPeakMs: 0,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
  });
  const partialsAmtRef = useRef(0.0);
  const morphAmountsRef = useRef([0, 0, 0]);
  const morphEnergyRef = useRef(0.0);
  const activeMorphWeightsRef = useRef([0, 0, 0]);
  const frameCountRef = useRef(0);
  const lastPerfSampleTimeRef = useRef(performance.now());
  const controlAvgMsRef = useRef(0);
  const controlPeakMsRef = useRef(0);
  const longTaskCountRef = useRef(0);

  const p5ContainerRef = useRef(null);

  // Create engine once, dispose on unmount
  useEffect(() => {
    engineRef.current = createEngine();
    lastPerfSampleTimeRef.current = performance.now();

    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.stop?.();
        } catch (err) {
          console.error("Failed to stop audio engine", err);
        }
        try {
          eng.voices.forEach((v) => v.dispose?.());
        } catch (err) {
          console.error("Failed to dispose audio engine", err);
        }
      }
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") {
      return undefined;
    }

    let observer;

    try {
      observer = new PerformanceObserver((list) => {
        longTaskCountRef.current += list.getEntries().length;
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      return undefined;
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = Math.max(
        (now - lastPerfSampleTimeRef.current) / 1000,
        0.001
      );
      const frameCount = frameCountRef.current;
      const ctx = Tone.getContext().rawContext;
      const audioPerf = engineRef.current?.getPerfStats?.() ?? {};
      const memory = performance.memory;

      frameCountRef.current = 0;
      lastPerfSampleTimeRef.current = now;

      setPerfStats({
        fps: frameCount / elapsedSeconds,
        controlAvgMs: controlAvgMsRef.current,
        controlPeakMs: controlPeakMsRef.current,
        longTasksPerSec: longTaskCountRef.current / elapsedSeconds,
        heapMb: memory ? memory.usedJSHeapSize / (1024 * 1024) : null,
        audioCallbackLagMs: audioPerf.audioCallbackLagMs ?? 0,
        audioCallbackPeakMs: audioPerf.audioCallbackPeakMs ?? 0,
        baseLatencyMs: (ctx?.baseLatency ?? 0) * 1000,
        outputLatencyMs: (ctx?.outputLatency ?? 0) * 1000,
      });

      longTaskCountRef.current = 0;
      controlPeakMsRef.current *= 0.9;
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!p5ContainerRef.current) return;

    const instance = mountSketch(p5ContainerRef.current, (ctl) => {
      const controlStart = performance.now();
      frameCountRef.current += 1;

      // ctl.x, ctl.y, ctl.speed, ctl.mouseDown
      // hook these into your Tone engine here
      // e.g. engineRef.current?.forEach(v => v.setSomething(ctl.x))
      engineRef.current?.voices.forEach((v) => {
        // Y controls reverb wet
        const wet =
          linMap(Math.abs(ctl.y), 0, 1.0) < 0.01
            ? 0.01
            : linMap(Math.abs(ctl.y), 0, 1.0) >= 1.0
            ? 1.0
            : linMap(Math.abs(ctl.y), 0, 1.0);
        v.reverb.wet.rampTo(wet, 0.05);
      });

      const selector = driftingSelector(performance.now() * 0.001);
      const speedInput = speedToMorph(ctl.speed);
      const currentEnergy = morphEnergyRef.current;

      if (speedInput > 0.5) {
        activeMorphWeightsRef.current = selectorToVoiceWeights(selector);
        morphEnergyRef.current = 1;
      } else {
        morphEnergyRef.current = currentEnergy * 0.992;
      }

      const speedMorph = morphEnergyRef.current;
      const activeWeights = activeMorphWeightsRef.current;

      engineRef.current?.voices.forEach((v, index) => {
        const targetMorph = clamp(
          partialsAmtRef.current + speedMorph * activeWeights[index]
        );
        const nextMorph = lerp(
          morphAmountsRef.current[index],
          targetMorph,
          0.12
        );

        morphAmountsRef.current[index] = nextMorph;
        v.setMorphAmount(nextMorph);
      });

      const controlDuration = performance.now() - controlStart;
      controlAvgMsRef.current = lerp(
        controlAvgMsRef.current,
        controlDuration,
        0.1
      );
      controlPeakMsRef.current = Math.max(
        controlPeakMsRef.current,
        controlDuration
      );
    }, (clickData) => {
        // let v = randomItem(engineRef.current.voices);
        // let primaryPitch = v.getPrimaryPitch();
        // let secondaryPitch = v.getSecondaryPitch();
        // let targetPitch;
        //   console.log("frequency: ", v.osc.frequency.value, "primary: ", primaryPitch);

        // if (v.osc.frequency.value == primaryPitch) {
        //   console.log("voice at primary pitch");
        //   targetPitch = secondaryPitch;
        // } else {
        //   console.log("voice not at primary pitch");
        //   targetPitch = primaryPitch;
        // }
        // if (clickData.x >= 0. && clickData.x <= 1.0 && clickData.y >= 0. && clickData.y <= 1.0 ) {
        //   v.slideToPitch(targetPitch, Math.random() * 2.5 + 1.5);
        // }
        console.log("click!", clickData);
      }
  );

    return () => {
      instance.remove(); // important: cleanup p5 on unmount
    };
  }, []);

  const handleSlider = (e) => {
    const t = Number(e.target.value);
    setpartialsAmt(t);
    partialsAmtRef.current = t;
    morphAmountsRef.current = morphAmountsRef.current.map(() => t);
    engineRef.current?.voices.forEach((v) => v.setMorphAmount(t));
  };

  const handleClick = async () => {
    if (started) return;

    await Tone.start();
    partialsAmtRef.current = partialsAmt;
    morphAmountsRef.current = morphAmountsRef.current.map(() => partialsAmt);
    morphEnergyRef.current = 0;
    activeMorphWeightsRef.current = [0, 0, 0];
    engineRef.current?.voices.forEach((voice) =>
      voice.setMorphAmount(partialsAmt)
    );
    engineRef.current?.start();
    // unlock audio
    engineRef.current?.voices.forEach((voice) => voice.start()); // start your synth/graph
    setStarted(true);

    console.log("audio ready");
  };
  return (
    <div>
      <button onClick={handleClick} disabled={started}>
        {started ? "Running" : "Start"}
      </button>
      <div className="perf-panel">
        <div>FPS {formatPerfValue(perfStats.fps, 0)}</div>
        <div>Control avg {formatPerfValue(perfStats.controlAvgMs)} ms</div>
        <div>Control peak {formatPerfValue(perfStats.controlPeakMs)} ms</div>
        <div>Audio lag {formatPerfValue(perfStats.audioCallbackLagMs)} ms</div>
        <div>Audio peak {formatPerfValue(perfStats.audioCallbackPeakMs)} ms</div>
        <div>Long tasks/s {formatPerfValue(perfStats.longTasksPerSec, 2)}</div>
        <div>Base latency {formatPerfValue(perfStats.baseLatencyMs)} ms</div>
        <div>Output latency {formatPerfValue(perfStats.outputLatencyMs)} ms</div>
        <div>
          Heap{" "}
          {perfStats.heapMb == null
            ? "--"
            : `${formatPerfValue(perfStats.heapMb)} MB`}
        </div>
      </div>
      <div>
        <label>Partials {partialsAmt.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="1.00"
          step="0.02"
          value={partialsAmt}
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
