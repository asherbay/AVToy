import { useEffect, useRef, useState } from "react";
import "./App.css";
import * as Tone from "tone";
import { createEngine } from "./audioEngine";
import { mountSketch } from "./sketch";

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  const frameCountRef = useRef(0);
  const lastPerfSampleTimeRef = useRef(performance.now());
  const controlAvgMsRef = useRef(0);
  const controlPeakMsRef = useRef(0);
  const longTaskCountRef = useRef(0);
  const hasLoggedMovementControlRef = useRef(false);
  const latestControlRef = useRef(null);

  const p5ContainerRef = useRef(null);

  // Create engine once, dispose on unmount
  useEffect(() => {
    engineRef.current = createEngine();
    lastPerfSampleTimeRef.current = performance.now();

    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          if (eng.dispose) {
            eng.dispose();
          } else {
            eng.stop?.();
            eng.voices.forEach((v) => v.dispose?.());
          }
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

    let instance = null;
    const arpSparkTimeouts = new Set();

    instance = mountSketch(
      p5ContainerRef.current,
      (ctl) => {
        const controlStart = performance.now();
        frameCountRef.current += 1;
        latestControlRef.current = ctl;

        if (!hasLoggedMovementControlRef.current && ctl.rawSpeed > 0) {
          hasLoggedMovementControlRef.current = true;
          // console.log("movement control", {
          //   source: ctl.source,
          //   rawSpeed: ctl.rawSpeed,
          //   speedPxPerSecond: ctl.speedPxPerSecond,
          //   speed: ctl.speed,
          // });
        }

        engineRef.current?.updateLeadGesture?.(ctl);
        const arpRun = engineRef.current?.triggerArpGesture?.(ctl);
        if (arpRun) {
          instance?.registerArpPulse?.({
            x: ctl.x,
            y: ctl.y,
            dx: ctl.dx,
            dy: ctl.dy,
            speedPxPerSecond: ctl.speedPxPerSecond,
            noteCount: arpRun.notes.length,
            strength: Math.min(
              3.2,
              1.2 + arpRun.notes.length * 0.16 + ctl.speed * 1.4
            ),
            radius: Math.min(
              260,
              120 + arpRun.notes.length * 10 + ctl.speed * 90
            ),
            duration: 700 + arpRun.notes.length * 55,
          });

          arpRun.notes.forEach((_, index) => {
            const delayMs = Math.max(0, Math.round(index * arpRun.noteSpacing * 1000));
            const timeoutId = window.setTimeout(() => {
              arpSparkTimeouts.delete(timeoutId);
              const sparkCtl = latestControlRef.current ?? ctl;
              instance?.registerArpForegroundSpark?.({
                x: sparkCtl.x,
                y: sparkCtl.y,
                dx: sparkCtl.dx,
                dy: sparkCtl.dy,
                speedPxPerSecond: sparkCtl.speedPxPerSecond,
                noteIndex: index,
                noteCount: arpRun.notes.length,
                strength: Math.min(
                  1.8,
                  0.92 + sparkCtl.speed * 0.7 + arpRun.velocity * 0.22
                ),
              });
            }, delayMs);

            arpSparkTimeouts.add(timeoutId);
          });
        }

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
      },
      (ctl) => {
        engineRef.current?.triggerPercClickGate?.(ctl);
      },
      () => engineRef.current?.getVisualLevel?.() ?? 0,
      () => engineRef.current?.getDrone2VisualLevel?.() ?? 0,
      () => engineRef.current?.getVisualAgitation?.() ?? 0
    );

    return () => {
      arpSparkTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      arpSparkTimeouts.clear();
      instance.remove(); // important: cleanup p5 on unmount
    };
  }, []);

  const handleSlider = (e) => {
    const t = Number(e.target.value);
    setpartialsAmt(t);
    engineRef.current?.voices.forEach((v) => v.setMorphAmount(t));
  };

  const handleClick = async () => {
    if (started) return;

    await Tone.start();
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
