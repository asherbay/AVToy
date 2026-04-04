import * as Tone from "tone";

export function createEngine() {

    function randomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    function trill({
        // pitch / trill
        pitch = "C4",
        pitchRange = 200,
        secondaryPitch = "G4",

        // trill rate modulation
        rateMin = 2,
        rateMax = 8,
        rateModRate = 0.25,

        // filter modulation
        filterMin = 300,
        filterMax = 800,
        filterModRate = 0.25,
        Q = 3.0,

        // FM params
        harmonicity = 1.0,

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
            Q,
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



        // FB delay loop for extra texture
        const fbDelay = new Tone.Delay(0.2);
        const fbGain = new Tone.Gain(0.35);
        const fbFilter = new Tone.Filter(1000, "lowpass");
        const drive = new Tone.Distortion(0.2);

        

        // feedback path
        fbDelay.connect(fbFilter);
        fbFilter.connect(drive);
        drive.connect(fbGain);
        fbGain.connect(fbDelay);


        /* ================= OSC ================= */

        const osc = new Tone.FMOscillator({
            frequency: pitch,
            type: "sine",
            modulationType: "triangle",
            harmonicity,
            modulationIndex: 0.0,
        });

        osc.partials = [1, 0, 0., 0.0]; // harmonic amplitudes

        const detuneOsc = new Tone.FMOscillator({
            frequency: pitch,
            type: "sine",
            modulationType: "triangle",
            harmonicity,
            modulationIndex: 0.,
            detune: 30,
        });

        detuneOsc.partials = [1, 0, 0., 0.0]; // harmonic amplitudes

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
       
        // const metal = new Tone.MetalSynth({
        //     frequency: 200,
        //     envelope: { attack: 0.001, decay: 10.4, release: 0.1 },
        //     harmonicity: 3.1,
        //     modulationIndex: 32,
        //     resonance: 6000,
        //     octaves: 2
        // });

        // const comb = new Tone.FeedbackCombFilter({ delayTime: 0.012, resonance: 0.6 });
        // const verb = new Tone.Reverb({ decay: 8, wet: 0.5 });
        // const out = new Tone.Gain(0.1).toDestination();

        // const metalLfo = new Tone.LFO({ 
        //     frequency: 0.2,
        //     min: 150,
        //     max: 400,
        // });

        // metalLfo.connect(metal.frequency);

        // metal.connect(comb);
        // comb.connect(verb);
        // verb.connect(out);


        /* ================= GAIN ================= */

        const gain = new Tone.Gain(gainLevel);
        const gainLfo = new Tone.LFO(gainLfoRate, 0., gainMax);
        gainLfo.connect(gain.gain);
        const duckGain = new Tone.Gain(1.0);
        const limiter = new Tone.Limiter(-6);
        

        /* ================= TRILL ================= */

        const trillLfo = new Tone.LFO({
            frequency: 3,
            type: "square",
            min: pitchRange,
            max: 0,
        });

        const trillModLfo = new Tone.LFO({
            frequency: rateModRate,
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
        detuneOsc.connect(vib);
        vib.connect(filter);
        filter.connect(duckGain);
        duckGain.connect(delay);
        delay.connect(reverb);
        reverb.connect(gain);
        gain.connect(fbDelay);
        gain.connect(limiter);
        fbDelay.connect(limiter);
        // gain.toDestination();
        limiter.toDestination();

        /* ================= API ================= */

         // seconds


        //DOESNT WORK CUZ VOICES ARE NOT AWARE OF EACH OTHER, NEED TO MOVE THIS LOGIC OUTSIDE
        

        return {
            osc,
            detuneOsc,
            filter,
            delay,
            reverb,
            gain,
            gainLfo,
            trillLfo,
            trillModLfo,
            filterLfo,
            loop,
            fbDelay,
            fbGain,
            fbFilter,
            drive,
            limiter,
            duckGain,
            // metal,
            // comb,
            // verb,
            // out,
            // metalLfo,
            vib,
            vibLfo,
    
            // triggerMetal() {
            //     metal.triggerAttackRelease("C0", 10);
            // },

            setMorphTarget,
            setMorphAmount,   
            

            getPrimaryPitch() {
                // console.log("primary pitch:", pitch);
                //return pitch;
                return Tone.Frequency(pitch).toFrequency();
            },

            getSecondaryPitch() {
                // console.log("secondary pitch:", secondaryPitch);
                //return secondaryPitch;
                return Tone.Frequency(secondaryPitch).toFrequency();
            },


            slideToPitch(pitchTarget, time = 1) {
                console.log("attempting pitch slide");
                osc.frequency.exponentialRampToValueAtTime(pitchTarget, `+1.5`, time);
                detuneOsc.frequency.exponentialRampToValueAtTime(pitchTarget, `+2.5`, time);
               // console.log(`Sliding to ${pitchTarget} over ${time} seconds`);
            },
            
            startTransport() {
                if (Tone.Transport.state !== "started") {
                    Tone.Transport.start();
                }
            },

            start() {
                osc.start();
                detuneOsc.start();
                
                gainLfo.start();
                trillLfo.start();
                trillModLfo.start();
                filterLfo.start();
                loop.start();
               
                // metalLfo.start();
                vibLfo.start();
                //pitchSlideLoop.start();
            },

            stop() {
                osc.stop();
                detuneOsc.stop();
                loop.stop();
                trillLfo.stop();
                trillModLfo.stop();
                filterLfo.stop();
                gainLfo.stop();
                Tone.Transport.stop();
                // metalLfo.stop();
                vibLfo.stop();
                //pitchSlideLoop.stop();
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
                duckGain.dispose();
                fbDelay.dispose();
                fbGain.dispose();
                fbFilter.dispose();
                drive.dispose();
                // metal.dispose();
                // comb.dispose();
                // verb.dispose(); 
                // out.dispose();
                // metalLfo.dispose();
                vib.dispose();
                vibLfo.dispose();
            },
        };

    }
    const voice1 = trill({
        pitch: "D4",
        secondaryPitch: "C4",
        pitchRange: 0,
        rateMin: 1,
        rateMax: 7,
        filterMin: 500,
        filterMax: 1800,
        filterModRate: 0.2,
        modIndexMin: 0.0,
        modIndexMax: 0.5,
        harmonicity: 1.0,
        reverbWet: 0.5,
        gainLfoRate: 0.4,
        gainMax: 0.5,
    });
  

    const voice2 = trill({
        pitch: "C3",
        secondaryPitch: "Bb2",
        pitchRange: 0,
        rateMin: 0.25,
        rateMax: 0.5,
        filterMin: 200,
        filterMax: 1000,
        filterModRate: 0.3,
        modIndexMin: 0.0,
        modIndexMax: 0.5,
        harmonicity: 0.5,
        gainLfoRate: 0.24,
        gainMax: 0.5,
    });



    const voice3 = trill({
        pitch: "F4",
        secondaryPitch: "G4",
        pitchRange: 0,
        rateMin: 1,
        rateMax: 7,
        filterMin: 400,
        filterMax: 1200,
        filterModRate: 0.15,
        modIndexMin: 0.0,
        modIndexMax: 0.7,
        harmonicity: 4.,
        reverbWet: 0.4,
        gainLfoRate: 0.22,
        gainMax: 0.1,
    });

    const start = () => {
        Tone.Transport.start();
        pitchSlideLoop.start();
        duckLoop.start();
    }

    const stop = () => {
        Tone.Transport.stop();
        pitchSlideLoop.stop();
        duckLoop.stop();
    }

    const voices = [voice1, voice2, voice3];

    const slideProbability = 0.25;
    const slideCheckInterval = 2.0;

    const pitchSlideLoop = new Tone.Loop((time) => {
        if (Math.random() < slideProbability) {
            
            const v = randomItem(voices);
            let primaryPitch = v.getPrimaryPitch();
            let secondaryPitch = v.getSecondaryPitch();
            let targetPitch;
            // console.log("frequency: ", v.osc.frequency.value, "primary: ", primaryPitch);

            if (v.osc.frequency.value == primaryPitch) {
            // console.log("voice at primary pitch");
                targetPitch = secondaryPitch;
            } else {
            // console.log("voice not at primary pitch");
                targetPitch = primaryPitch;
            }
            if (v) {
                v.slideToPitch?.(targetPitch, Math.random() * 2.5 + 1.5);
            }
        }
        }, slideCheckInterval);

        


    const duckProbability = 0.75;
    const duckCheckInterval = 4.0;
    const duckLoop = new Tone.Loop((time) => {
        if (Math.random() < duckProbability) {
            
            const v = randomItem(voices);
            if (v.duckGain.gain.value >= 0.9) {
                console.log("ducking voice");
                const now = Tone.now();
                const start = now + 0.01;
                const duckTime = Math.random() * 3.5 + 0.75;

                // duck immediately
                v.duckGain.gain.cancelAndHoldAtTime(start);
                v.duckGain.gain.rampTo(0.05, duckTime, start); // down over 1s

                const unduckTime = Math.random() * 4.5 + 1.75;
                // schedule unduck after `duration` seconds
                const eventId = Tone.Transport.scheduleOnce((time) => {
                    console.log("unducking voice");
                    v.duckGain.gain.cancelAndHoldAtTime(time);
                    v.duckGain.gain.rampTo(1.0, duckTime, time); // up over 2s
                }, `+${unduckTime}`);

                // optional: store eventId if you might cancel later
                // lastUnduckEventId = eventId;
                // duck(v);
            } 
        }
        }, duckCheckInterval);

    const audioEngine = {
        voices,
        start,
        stop,
    }

  return audioEngine;

  // NEED TO CHANGE APP.JSX TO ACCOMODATE THE AUDIOENGINE OBJECT INSTEAD OF JUST VOICES
  
}
