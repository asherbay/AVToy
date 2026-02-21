import * as Tone from "tone";

export function createEngine() {


 

    function trill({
        // pitch / trill
        pitch = "C4",
        pitchRange = 200,

        // trill rate modulation
        rateMin = 2,
        rateMax = 8,
        rateModRate = 0.25,

        // filter modulation
        filterMin = 300,
        filterMax = 800,
        filterModRate = 0.25,
        Q = 1.0,

        // FM params
        harmonicity = 1.0,
        harmModMin = 0.0,
        harmModMax = 2.0,
        harmModRate = 0.2,

        // output / FX
        gainLevel = 0.05,
        gainLfoRate = 0.3,
        gainMax = 0.5,
        delayTime = 0.5,
        delayFeedback = 0.6,
        delayWet = 0.3,
        reverbDecay = 6,
        reverbWet = 0.,

        // modulation index LFO
        modIndexMin = 0.0,
        modIndexMax = 5.0,
        modIndexRate = 0.2,

        
        } = {}) {

        /* ================= FILTER ================= */

        const filter = new Tone.Filter({
            frequency: 500,
            type: "bandpass",
            Q: 3.0,
        });

        const filterLfo = new Tone.LFO({
            frequency: filterModRate,
            type: "sine",
            min: filterMin,
            max: filterMax,
        });

        filterLfo.connect(filter.frequency);

        /* ================= FX ================= */

        const delay = new Tone.PingPongDelay({
            delayTime,
            feedback: delayFeedback,
            wet: delayWet,
        });

        const reverb = new Tone.Reverb({
            decay: reverbDecay,
            wet: reverbWet,
        });

        const vib = new Tone.Vibrato({
            frequency: 2.5,
            depth: 0.21,
        });

        const vibLfo = new Tone.LFO({
            frequency: Math.random() * (5 - 0.1) + 0.1,
            min: 0.1,
            max: 5,
        });
        vibLfo.connect(vib.frequency);

        /* ================= OSC ================= */

        const osc = new Tone.FMOscillator({
            frequency: pitch,
            type: "sine",
            modulationType: "triangle",
            harmonicity,
            modulationIndex: 0.0,
        });

        osc.partials = [1, 0, 0., 0.0]; // harmonic amplitudes

        function randomPartials(count = 8) {
            const partials = [];

            for (let i = 0; i < count; i++) {
                partials.push(Math.random());
            }

            return partials;
        }

        const fromPartials = [1,0,0,0,0,0,0,0];
        let toPartials = randomPartials(8);

        function setMorphTarget(partials) {
            toPartials = partials.slice();
        }

        function setMorphAmount(t) {
            const out = fromPartials.map((a, i) => a + (toPartials[i] - a) * t);
            osc.partials = out;
        }
       
        function lerp(a,b,t){ return a + (b-a)*t; }

        function morphPartials(from, to, t){
            const n = Math.max(from.length, to.length);
            const out = new Array(n).fill(0).map((_,i)=>lerp(from[i]||0, to[i]||0, t));
            osc.partials = out;
        }

        const metal = new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.001, decay: 10.4, release: 0.1 },
            harmonicity: 3.1,
            modulationIndex: 32,
            resonance: 6000,
            octaves: 2
        });

        const comb = new Tone.FeedbackCombFilter({ delayTime: 0.012, resonance: 0.6 });
        const verb = new Tone.Reverb({ decay: 8, wet: 0.5 });
        const out = new Tone.Gain(0.1).toDestination();

        const metalLfo = new Tone.LFO({ 
            frequency: 0.2,
            min: 150,
            max: 400,
        });

        metalLfo.connect(metal.frequency);

        metal.connect(comb);
        comb.connect(verb);
        verb.connect(out);


        /* ================= GAIN ================= */

        const gain = new Tone.Gain(gainLevel);
        const gainLfo = new Tone.LFO(gainLfoRate, 0.1, gainMax);
        gainLfo.connect(gain.gain);
        const limiter = new Tone.Limiter(-6);
        

        /* ================= TRILL ================= */

        const trillLfo = new Tone.LFO({
            frequency: 3,
            type: "square",
            min: pitchRange,
            max: 0,
        });

        const trillModLfo = new Tone.LFO({
            frequency: harmModRate,
            type: "sine",
            min: rateMin,
            max: rateMax,
        });

        trillLfo.connect(osc.detune);
        trillModLfo.connect(trillLfo.frequency);

        /* ================= MOD INDEX “LFO” ================= */

        const loopHz = 20;
        const dt = 1 / loopHz;

        const loop = new Tone.Loop((time) => {
            const phase = 2 * Math.PI * modIndexRate * time;
            const x = (Math.sin(phase) + 1) * 0.5;
            const val = modIndexMin + x * (modIndexMax - modIndexMin);
            osc.modulationIndex.setValueAtTime(val, time);
        }, dt);

        /* ================= ROUTING ================= */

        osc.connect(vib);
        vib.connect(filter);
        filter.connect(delay);
        delay.connect(reverb);
        reverb.connect(gain);
        // gain.toDestination();
        gain.connect(limiter);
        limiter.toDestination();

        /* ================= API ================= */

        return {
            osc,
            filter,
            delay,
            reverb,
            gain,
            gainLfo,
            trillLfo,
            trillModLfo,
            filterLfo,
            loop,
            limiter,
            metal,
            comb,
            verb,
            out,
            metalLfo,
            vib,
            vibLfo,
    
            triggerMetal() {
                metal.triggerAttackRelease("C0", 10);
            },

            setMorphTarget,
            setMorphAmount,   
            
            startTransport() {
                if (Tone.Transport.state !== "started") {
                    Tone.Transport.start();
                }
            },

            start() {
                osc.start();
                gainLfo.start();
                trillLfo.start();
                trillModLfo.start();
                filterLfo.start();
                loop.start();
               
                metalLfo.start();
                vibLfo.start();
            },

            stop() {
                osc.stop();
                loop.stop();
                trillLfo.stop();
                trillModLfo.stop();
                filterLfo.stop();
                gainLfo.stop();
                Tone.Transport.stop();
                metalLfo.stop();
                vibLfo.stop();
            },

            dispose() {
                osc.dispose();
                filter.dispose();
                delay.dispose();
                reverb.dispose();
                gain.dispose();
                gainLfo.dispose();
                trillLfo.dispose();
                trillModLfo.dispose();
                filterLfo.dispose();
                loop.dispose();
                limiter.dispose();
                metal.dispose();
                comb.dispose();
                verb.dispose(); 
                out.dispose();
                metalLfo.dispose();
                vib.dispose();
                vibLfo.dispose();
            },
        };

    }
    const voice1 = trill({
        pitch: "D4",
        pitchRange: 0,
        rateMin: 1,
        rateMax: 7,
        filterMin: 500,
        filterMax: 1500,
        filterModRate: 0.2,
        modIndexMin: 0.0,
        modIndexMax: 1.0,
        harmonicity: 1.0,
        reverbWet: 0.,
        gainLfoRate: 0.4,
        gainMax: 0.5,
    });
  

    const voice2 = trill({
        pitch: "C3",
        pitchRange: 0,
        rateMin: 0.25,
        rateMax: 0.5,
        filterMin: 200,
        filterMax: 600,
        filterModRate: 0.3,
        modIndexMin: 0.0,
        modIndexMax: 2.0,
        harmonicity: 0.5,
        gainLfoRate: 0.24,
        gainMax: 0.5,
    });

    const voice3 = trill({
        pitch: "C5",
        pitchRange: 0,
        rateMin: 0.2,
        rateMax: 3,
        filterMin: 800,
        filterMax: 1600,
        filterModRate: 0.5,
        modIndexMin: 0.0,
        modIndexMax: 0.15,
        harmonicity: 0.66,
        reverbWet: 0.,
        gainLfoRate: 0.5,
        gainMax: 0.3,

    });

  return [voice1, voice2, voice3]
  
}
