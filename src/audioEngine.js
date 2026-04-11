import * as Tone from "tone";

export function createEngine() {

    function randomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function midiToNote(midi) {
        return Tone.Frequency(midi, "midi").toNote();
    }

    const perfStats = {
        audioCallbackLagMs: 0,
        audioCallbackPeakMs: 0,
    };

    function drone({
        // pitch / drone
        pitch = "C4",
        pitchRange = 200,
        secondaryPitch = "G4",

        // pitch rate modulation
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
        morphTarget = [1, 0.7, 0.35, 0.18, 0.08, 0.04, 0.02, 0.01],

        // metal texture
        metalHarmonicity = randomInRange(2.4, 4.2),
        metalModulationIndex = randomInRange(7, 16),
        metalResonance = randomInRange(4200, 7600),
        metalOctaves = randomInRange(2.2, 4.1),

        
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
        const fbDelay = new Tone.Delay(0.175);
        const fbGain = new Tone.Gain(0.3);
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

        const fromPartials = [1,0,0,0,0,0,0,0];
        let toPartials = morphTarget.slice();
        const primaryPitchHz = Tone.Frequency(pitch).toFrequency();
        const secondaryPitchHz = Tone.Frequency(secondaryPitch).toFrequency();
        let currentPitchTarget = primaryPitchHz;
        let slideUntilTime = 0;

        function setMorphTarget(partials) {
            toPartials = partials.slice();
        }

        function setMorphAmount(t) {
            const amt = Math.pow(Math.min(Math.max(t, 0), 1), 0.6);
            const out = fromPartials.map((a, i) => a + (toPartials[i] - a) * amt);
            osc.partials = out;
        }
       
        const metal = new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.08, decay: 1.6, release: 0.5 },
            harmonicity: metalHarmonicity,
            modulationIndex: metalModulationIndex,
            resonance: metalResonance,
            octaves: metalOctaves
        });

        const comb = new Tone.FeedbackCombFilter({ delayTime: 0.029, resonance: 0.8 });
        const verb = new Tone.Reverb({ decay: 15, wet: 1.0 });
        const out = new Tone.Gain(2.5)

        const metalLfo = new Tone.LFO({ 
            frequency: 0.2,
            min: 10,
            max: 40,
        });

        metalLfo.connect(metal.frequency);

        metal.connect(comb);
        comb.connect(verb);
        verb.connect(out);
        out.connect(filter)


        const metalLoop = new Tone.Loop((time) => {
            metal.triggerAttackRelease("C0", 0.4, time);
        }, 0.9);

        /* ================= GAIN ================= */

        const oscGain = new Tone.Gain(1.0);
        const oscMorphTap = new Tone.Gain(0.2);
        const detuneGain = new Tone.Gain(0.3);
        const gain = new Tone.Gain(gainLevel);
        const gainLfo = new Tone.LFO(gainLfoRate, 0., gainMax);
        gainLfo.connect(gain.gain);
        const duckGain = new Tone.Gain(1.0);
        const limiter = new Tone.Limiter(-6);
        

        /* ================= PITCH ================= */

        const pitchLfo = new Tone.LFO({
            frequency: 3,
            type: "square",
            min: pitchRange,
            max: 0,
        });

        const pitchRateLfo = new Tone.LFO({
            frequency: rateModRate,
            type: "sine",
            min: rateMin,
            max: rateMax,
        });

        pitchLfo.connect(osc.detune);
        pitchRateLfo.connect(pitchLfo.frequency);

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

        osc.connect(oscGain);
        detuneOsc.connect(detuneGain);
        oscGain.connect(oscMorphTap);
        oscMorphTap.connect(duckGain);
        oscGain.connect(vib);
        detuneGain.connect(vib);
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
            oscGain,
            oscMorphTap,
            detuneGain,
            gain,
            gainLfo,
            pitchLfo,
            pitchRateLfo,
            filterLfo,
            loop,
            fbDelay,
            fbGain,
            fbFilter,
            drive,
            limiter,
            duckGain,
            metal,
            comb,
            verb,
            out,
            metalLoop,
            metalLfo,
            vib,
            vibLfo,
    
            triggerMetal() {
                metal.triggerAttackRelease("C0", 10);
            },

            setMorphTarget,
            setMorphAmount,   
            

            getPrimaryPitch() {
                // console.log("primary pitch:", pitch);
                //return pitch;
                return primaryPitchHz;
            },

            getSecondaryPitch() {
                // console.log("secondary pitch:", secondaryPitch);
                //return secondaryPitch;
                return secondaryPitchHz;
            },

            isAtPrimaryPitch() {
                return currentPitchTarget === primaryPitchHz;
            },

            isSliding() {
                return Tone.now() < slideUntilTime;
            },


            slideToPitch(pitchTarget, duration = 1) {
                const rampDuration = Math.max(duration, 0.05);

                osc.frequency.rampTo(pitchTarget, rampDuration);
                detuneOsc.frequency.rampTo(pitchTarget, rampDuration + 0.3);

                currentPitchTarget = pitchTarget;
                slideUntilTime = Tone.now() + rampDuration;
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
                pitchLfo.start();
                pitchRateLfo.start();
                filterLfo.start();
                loop.start();
               
                metalLfo.start();
                vibLfo.start();
                metalLoop.start();
                //pitchSlideLoop.start();
            },

            stop() {
                osc.stop();
                detuneOsc.stop();
                loop.stop();
                pitchLfo.stop();
                pitchRateLfo.stop();
                filterLfo.stop();
                gainLfo.stop();
                Tone.Transport.stop();
                metalLfo.stop();
                vibLfo.stop();
                metalLoop.stop();   
                //pitchSlideLoop.stop();
            },

            dispose() {
                osc.dispose();
                detuneOsc.dispose();
                filter.dispose();
                delay.dispose();
                reverb.dispose();
                oscGain.dispose();
                oscMorphTap.dispose();
                detuneGain.dispose();
                gain.dispose();
                gainLfo.dispose();
                pitchLfo.dispose();
                pitchRateLfo.dispose();
                filterLfo.dispose();
                loop.dispose();
                limiter.dispose();
                duckGain.dispose();
                fbDelay.dispose();
                fbGain.dispose();
                fbFilter.dispose();
                drive.dispose();
                metal.dispose();
                comb.dispose();
                verb.dispose(); 
                out.dispose();
                metalLfo.dispose();
                metalLoop.dispose();
                vib.dispose();
                vibLfo.dispose();
            },
        };

    }


    function arp({
        maxPolyphony = 8,
        harmonicity = 9.0,
        ampAttack = 0.1,
        ampDecay = 0.2,
        ampSustain = 0.0,
        ampRelease = 0.9,
        modAttack = 0.02,
        modDecay = 0.18,
        modSustain = 0.0,
        modRelease = 0.2,
        filterQ = 1.4,
        filterLFOMin = 1800,
        filterLFOMax = 3200,
        filterLFORate = 0.52,
        modIndexLFOMin = 0.,
        modIndexLFOMax = 9.0,
        modIndexLFORate = 0.56,
        delayTime = 0.18,
        delayFeedback = 0.4,
        delayMix = 0.3,
        combDelayTime = 0.039,
        combResonance = 0.3,
        synthGainLevel = 0.56,
        limiterThreshold = -6,
    } = {}) {

        const synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity,
            modulationIndex: modIndexLFOMin,
            oscillator: {
                type: "sine",
            },
            modulation: {
                type: "triangle",
            },
            envelope: {
                attack: ampAttack,
                decay: ampDecay,
                sustain: ampSustain,
                release: ampRelease,
            },
            modulationEnvelope: {
                attack: modAttack,
                decay: modDecay,
                sustain: modSustain,
                release: modRelease,
            },
        });
        synth.maxPolyphony = maxPolyphony;

        const synthGain = new Tone.Gain(synthGainLevel);
        const filter = new Tone.Filter({
            frequency: (filterLFOMin + filterLFOMax) * 0.5,
            type: "bandpass",
            Q: filterQ,
        });
        const comb = new Tone.FeedbackCombFilter({
            delayTime: combDelayTime,
            resonance: combResonance,
        });
        const delay = new Tone.FeedbackDelay(delayTime, delayFeedback);
        delay.wet.value = delayMix;
        const limiter = new Tone.Limiter(limiterThreshold);

        const filterLfo = new Tone.LFO({
            frequency: filterLFORate,
            type: "sine",
            min: filterLFOMin,
            max: filterLFOMax,
        });
        filterLfo.connect(filter.frequency);

        const modIndexLoop = new Tone.Loop((time) => {
            const phase = 2 * Math.PI * modIndexLFORate * time;
            const x = (Math.sin(phase) + 1) * 0.5;
            const value = modIndexLFOMin + x * (modIndexLFOMax - modIndexLFOMin);
            synth.set({ modulationIndex: value });
        }, 1 / 30);

        synth.connect(synthGain);
        synthGain.connect(filter);
        filter.connect(comb);
        comb.connect(delay);
        delay.connect(limiter);
        limiter.toDestination();

        return {
            synth,
            synthGain,
            filter,
            comb,
            delay,
            limiter,
            filterLfo,
            modIndexLoop,

            playRun(notes, {
                noteDuration = 0.36,
                noteSpacing = 0.03,
                velocity = 0.7,
                startTime = Tone.now() + 0.01,
            } = {}) {
                notes.forEach((note, index) => {
                    synth.triggerAttackRelease(
                        note,
                        clamp(noteDuration + (Math.random() * 2.0 - 1.0), 0.05, 4.0),
                        startTime + index * noteSpacing,
                        velocity
                    );
                });
            },

            start() {
                filterLfo.start();
                modIndexLoop.start();
            },

            stop() {
                filterLfo.stop();
                modIndexLoop.stop();
                synth.releaseAll();
            },

            dispose() {
                synth.dispose();
                synthGain.dispose();
                filter.dispose();
                comb.dispose();
                delay.dispose();
                limiter.dispose();
                filterLfo.dispose();
                modIndexLoop.dispose();
            },
        };

    }

    const voice1 = drone({
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
        reverbWet: 0.2,
        gainLfoRate: 0.4,
        gainMax: 0.5,
        morphTarget: [0.1, 1.0, 0.7, 0.35, 0.18, 0.09, 0.04, 0.02],
    });
  

    const voice2 = drone({
        pitch: "C3",
        secondaryPitch: "Bb2",
        pitchRange: 0,
        rateMin: 0.25,
        rateMax: 0.5,
        filterMin: 200,
        filterMax: 1000,
        filterModRate: 0.3,
        modIndexMin: 0.0,
        modIndexMax: 1.5,
        harmonicity: 0.5,
        gainLfoRate: 0.24,
        gainMax: 0.5,
        morphTarget: [0.05, 0.2, 1.0, 0.65, 0.32, 0.14, 0.06, 0.03],
    });



    const voice3 = drone({
        pitch: "F4",
        secondaryPitch: "G4",
        pitchRange: 0,
        rateMin: 0.5,
        rateMax: 2,
        filterMin: 800,
        filterMax: 1900,
        filterModRate: 0.15,
        modIndexMin: 0.0,
        modIndexMax: 0.7,
        harmonicity: 4.,
        reverbWet: 0.,
        gainLfoRate: 0.22,
        gainMax: 0.1,
        morphTarget: [0.04, 0.16, 0.28, 1.0, 0.6, 0.24, 0.1, 0.04],
    });

    const arpVoice = arp();

    function getNearestStableDronePitch(voice) {
        const primaryPitch = voice.getPrimaryPitch();
        const secondaryPitch = voice.getSecondaryPitch();
        const currentPitch = Number(voice.osc.frequency.value);

        if (!Number.isFinite(currentPitch)) {
            return primaryPitch;
        }

        return Math.abs(currentPitch - primaryPitch) <=
            Math.abs(currentPitch - secondaryPitch)
            ? primaryPitch
            : secondaryPitch;
    }

    function makePitchSequence(
        numNotes = 8,
        pitchRange = [60, 84],
        repeatPitches = false
    ) {
        const minPitch = Math.round(clamp(pitchRange[0] ?? 60, 0, 127));
        const maxPitch = Math.round(clamp(pitchRange[1] ?? 84, minPitch, 127));
        const dronePitchClasses = voices.map((voice) => {
            const midi = Tone.Frequency(getNearestStableDronePitch(voice)).toMidi();
            return ((Math.round(midi) % 12) + 12) % 12;
        });
        const pitchClasses = [...new Set(dronePitchClasses)];
        const candidates = [];

        for (let midi = minPitch; midi <= maxPitch; midi += 1) {
            if (pitchClasses.includes(midi % 12)) {
                candidates.push(midi);
            }
        }

        if (!candidates.length || numNotes <= 0) {
            return [];
        }

        const sequence = [];

        for (let i = 0; i < numNotes; i += 1) {
            let possiblePitches = candidates;

            if (!repeatPitches && sequence.length > 0 && candidates.length > 1) {
                const previousPitch = sequence[sequence.length - 1];
                possiblePitches = candidates.filter((midi) => midi !== previousPitch);
            }

            sequence.push(randomItem(possiblePitches));
        }

        return sequence.map(midiToNote);
    }

    function playArpRun({
        numNotes = 8,
        pitchRange = [60, 88],
        repeatPitches = false,
        noteDuration = 0.16,
        noteSpacing = 0.08,
        velocity = 0.72,
    } = {}) {
        const notes = makePitchSequence(numNotes, pitchRange, repeatPitches);

        arpVoice.playRun(notes, {
            noteDuration,
            noteSpacing,
            velocity,
        });

        return notes;
    }

    let isStarted = false;
    let lastArpGestureTime = -Infinity;
    let accumulatedGestureDistance = 0;
    let accumulatedGestureY = 0;
    let hasLoggedArpGestureInput = false;

    function triggerArpGesture({
        speed = 0,
        rawSpeed = 0,
        speedPxPerSecond = 0,
        accel = 0,
        dx = 0,
        dy = 0,
    } = {}) {
        const contextIsRunning = Tone.getContext().rawContext.state === "running";

        if (!isStarted && !contextIsRunning) {
            return false;
        }

        const normalizedSpeed = Number.isFinite(speed) ? speed : 0;
        const pixelsPerSecond = Number.isFinite(speedPxPerSecond)
            ? speedPxPerSecond
            : 0;
        const movementAccel = Number.isFinite(accel) ? accel : 0;
        const frameDistance = Number.isFinite(rawSpeed) && rawSpeed > 0
            ? rawSpeed
            : Math.sqrt(dx * dx + dy * dy);
        const effectiveSpeed = clamp(
            Math.max(normalizedSpeed, frameDistance / 72, pixelsPerSecond / 3200),
            0,
            1
        );
        const positiveAccel = Math.max(0, movementAccel);
        const motionWeight = clamp((effectiveSpeed - 0.16) / 0.84, 0, 1);

        if (!hasLoggedArpGestureInput && effectiveSpeed > 0.04) {
            hasLoggedArpGestureInput = true;
            console.log("arp gesture input", {
                speed: effectiveSpeed.toFixed(2),
                frameDistance: frameDistance.toFixed(1),
                speedPxPerSecond: pixelsPerSecond.toFixed(0),
                context: Tone.getContext().rawContext.state,
            });
        }

        if (motionWeight > 0) {
            accumulatedGestureDistance = Math.min(
                accumulatedGestureDistance + frameDistance * motionWeight,
                1200
            );
            accumulatedGestureY += dy * motionWeight;
        } else {
            accumulatedGestureDistance *= 0.8;
            accumulatedGestureY *= 0.8;
        }

        const now = Tone.now();
        const cooldown = clamp(0.6 - effectiveSpeed * 0.24, 0.28, 0.6);
        const passesThreshold = effectiveSpeed > 0.34 || positiveAccel > 0.18;
        const hasEnoughMotion = accumulatedGestureDistance > 56;

        if (
            !passesThreshold ||
            !hasEnoughMotion ||
            now - lastArpGestureTime < cooldown
        ) {
            return false;
        }

        const distanceAmount = clamp(accumulatedGestureDistance / 420, 0, 1);
        const verticalBias = clamp(
            -accumulatedGestureY / Math.max(accumulatedGestureDistance, 1),
            -1,
            1
        );
        const noteCount = clamp(
            Math.round(
                4 +
                effectiveSpeed * 6 +
                distanceAmount * 5 +
                randomInRange(-1, 2)
            ),
            4,
            15
        );
        const rangeSpread = 16 + Math.round(effectiveSpeed * 12 + distanceAmount * 8);
        const rangeCenter = 74 + Math.round(verticalBias * 8 + randomInRange(-3, 4));
        const minPitch = Math.round(clamp(rangeCenter - rangeSpread * 0.5, 52, 104));
        const maxPitch = Math.round(clamp(rangeCenter + rangeSpread * 0.5, minPitch + 3, 108));
        const noteSpacing = clamp(
            0.15 -
            effectiveSpeed * 0.085 -
            distanceAmount * 0.025 +
            randomInRange(-0.01, 0.015),
            0.035,
            0.16
        );
        const noteDuration = clamp(
            0.12 + distanceAmount * 0.24 + randomInRange(-0.03, 0.12),
            0.06,
            0.55
        );
        const velocity = clamp(
            0.48 +
            effectiveSpeed * 0.32 +
            distanceAmount * 0.12 +
            positiveAccel * 0.16 +
            randomInRange(-0.06, 0.08),
            0.35,
            0.95
        );
        const notes = playArpRun({
            numNotes: noteCount,
            pitchRange: [minPitch, maxPitch],
            repeatPitches: false,
            noteDuration,
            noteSpacing,
            velocity,
        });

        lastArpGestureTime = now;
        accumulatedGestureDistance = 0;
        accumulatedGestureY = 0;

        console.log("gesture arp", {
            notes,
            speed: effectiveSpeed.toFixed(2),
            numNotes: noteCount,
            pitchRange: [minPitch, maxPitch],
            noteSpacing: noteSpacing.toFixed(3),
        });

        return notes;
    }

    const start = () => {
        pitchSlideLoop.cancel(0);
        duckLoop.cancel(0);
        perfLoop.cancel(0);
        arpVoice.start();
        pitchSlideLoop.start(0);
        duckLoop.start(0);
        perfLoop.start(0);
        Tone.Transport.start();
        isStarted = true;
    }

    const stop = () => {
        pitchSlideLoop.stop();
        duckLoop.stop();
        perfLoop.stop();
        arpVoice.stop();
        Tone.Transport.stop();
        isStarted = false;
    }

    const dispose = () => {
        stop();
        arpVoice.dispose();
        voices.forEach((voice) => voice.dispose());
        pitchSlideLoop.dispose();
        duckLoop.dispose();
        perfLoop.dispose();
    }

    const voices = [voice1, voice2, voice3];

    const slideProbability = 0.25;
    const slideCheckInterval = 2.0;

    const pitchSlideLoop = new Tone.Loop((time) => {
        if (Math.random() < slideProbability) {
            
            const v = randomItem(voices);
            if (v && !v.isSliding?.()) {
                const targetPitch = v.isAtPrimaryPitch?.()
                    ? v.getSecondaryPitch()
                    : v.getPrimaryPitch();
                v.slideToPitch?.(targetPitch, Math.random() * 2.5 + 0.75);
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

    const perfLoop = new Tone.Loop((time) => {
        const currentTime = Tone.getContext().rawContext.currentTime;
        const lagMs = Math.max(0, (currentTime - time) * 1000);

        perfStats.audioCallbackLagMs = lagMs;
        perfStats.audioCallbackPeakMs = Math.max(
            perfStats.audioCallbackPeakMs * 0.96,
            lagMs
        );
    }, 0.25);

    const audioEngine = {
        voices,
        arpVoice,
        start,
        stop,
        dispose,
        makePitchSequence,
        playArpRun,
        triggerArpGesture,
        getPerfStats() {
            return { ...perfStats };
        },
    }

  return audioEngine;

  // NEED TO CHANGE APP.JSX TO ACCOMODATE THE AUDIOENGINE OBJECT INSTEAD OF JUST VOICES
  
}
