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

    function lerp(value, inMin, inMax, outMin, outMax) {
        if (inMax === inMin) {
            return outMin;
        }

        const t = Math.min(1, Math.max(0, (value - inMin) / (inMax - inMin)));
        return outMin + t * (outMax - outMin);
    }


    function midiToNote(midi) {
        return Tone.Frequency(midi, "midi").toNote();
    }

    const perfStats = {
        audioCallbackLagMs: 0,
        audioCallbackPeakMs: 0,
    };

    const droneReverbSend = new Tone.Gain(0.4);
    const droneReverb = new Tone.Reverb({
        decay: 6,
        wet: 1.0,
    });
    droneReverbSend.connect(droneReverb);
    droneReverb.toDestination();

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
        delayFeedback = 0.4,
        delayWet = 0.,

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
        delay.connect(gain);
        gain.connect(fbDelay);
        gain.connect(limiter);
        fbDelay.connect(limiter);
        limiter.connect(droneReverbSend);
        limiter.toDestination();

        /* ================= API ================= */

         // seconds


        //DOESNT WORK CUZ VOICES ARE NOT AWARE OF EACH OTHER, NEED TO MOVE THIS LOGIC OUTSIDE
        

        return {
            osc,
            detuneOsc,
            filter,
            delay,
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

            setDrive(value) {
                drive.distortion = clamp(value, 0.0, 1.0);
                // console.log("setting drive to", drive.distortion);
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
        maxPolyphony = 5,
        harmonicity = 9.,
        ampAttack = 0.,
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
        delayFeedback = 0.8,
        delayMix = 0.3,
        combDelayTime = 0.059,
        combResonance = 0.0,
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

        // const delayLfo = new Tone.LFO({
        //     frequency: 0.1,
        //     min: delayTime * 0.95,
        //     max: delayTime * 1.05,
        // });
        // delayLfo.connect(delay.delayTime);

        // const delayLfolfo = new Tone.LFO({
        //     frequency: 0.45,
        //     min: 0.1,
        //     max: 2,
        // });
        // delayLfolfo.connect(delayLfo.frequency);
        // delayLfo.connect(delayLfolfo.frequency);

        const shiftedLevel = new Tone.Gain(0.);
        const shiftedDelay = new Tone.Delay(delayTime * 1.5, delayFeedback);
        const pitchShift = new Tone.PitchShift(-12);

        const limiter = new Tone.Limiter(limiterThreshold);

        const panner = new Tone.Panner(0);

        

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
        }, 1 / 10);

        const combResLoop = new Tone.Loop((time) => {
            systemState.agitation >= 0.3 ? comb.resonance.rampTo(lerp(systemState.engagement, 0, 0.99, 0.5, 0.99), 0.5) : comb.resonance.rampTo(0.0, 0.5);
        }, 0.5);

        const shiftedLevelLoop = new Tone.Loop((time) => {
            systemState.engagement >= 0.25 ? shiftedLevel.gain.rampTo(lerp(systemState.engagement, 0, 1, 0.5, 1.5), 0.5) : shiftedLevel.gain.rampTo(0.0, 0.5);
        }, 0.5);

        synth.connect(synthGain);
        synthGain.connect(filter);
        filter.connect(shiftedDelay);
        shiftedDelay.connect(shiftedLevel);
        shiftedLevel.connect(pitchShift);
        pitchShift.connect(comb);
        filter.connect(comb);
        // filter.connect(comb);
        comb.connect(limiter);
        // delay.connect(limiter);
        limiter.connect(panner);
        panner.toDestination();

        return {
            synth,
            synthGain,
            filter,
            comb,
            delay,
            shiftedDelay,
            pitchShift,
            shiftedLevel,
            // delayLfo,
            // delayLfolfo,
            limiter,
            panner,
            filterLfo,
            modIndexLoop,
            combResLoop,
            shiftedLevelLoop,

            playRun(notes, {
                noteDuration = 0.24,
                noteSpacing = 0.05,
                velocity = 0.7,
                startTime = Tone.now() + 0.01,
            } = {}) {
                notes.forEach((note, index) => {
                    // synth.set({harmonicity: randomItem([0.5, 1, 2, 3, 4, 5, 7, 9])});
                    synth.set({
                        envelope: {
                            attack: randomItem([0.0, randomInRange(0.05, 0.15)]),
                        },
                        modulationEnvelope: {
                            attack: randomItem([0.0, randomInRange(0.05, 0.15)]),
                        }
                    })
                    synth.triggerAttackRelease(
                        note,
                        clamp(noteDuration + randomInRange(-0.05, 0.07), 0.05, 0.45),
                        startTime + index * noteSpacing,
                        velocity
                    );
                });
            },

            setPanner(value) {
                panner.pan.rampTo(clamp(value, -1, 1), 0.05);
            },

            setShiftedLevel(value) {
                shiftedLevel.gain.rampTo(clamp(value, 0, 1), 0.05);
            },

            setCombResonance(value) {   
                comb.resonance.rampTo(clamp(value, 0, 0.), 0.25);
            },

            start() {
                filterLfo.start();
                // delayLfo.start();
                // delayLfolfo.start();
                modIndexLoop.start();
                combResLoop.start();
                shiftedLevelLoop.start();
            },

            stop() {
                filterLfo.stop();
                // delayLfo.stop();
                // delayLfolfo.stop();
                modIndexLoop.stop();
                synth.releaseAll();
                combResLoop.stop();
                shiftedLevelLoop.stop();
            },

            dispose() {
                synth.dispose();
                synthGain.dispose();
                filter.dispose();
                comb.dispose();
                delay.dispose();
                shiftedDelay.dispose();
                pitchShift.dispose();
                shiftedLevel.dispose();
                // delayLfo.dispose();
                // delayLfolfo.dispose();
                limiter.dispose();
                panner.dispose();
                filterLfo.dispose();
                modIndexLoop.dispose();
                combResLoop.dispose();
                shiftedLevelLoop.dispose();
            },
        };

    }

    function lead({
        pitch = "C4",
        harmonicity = 1.0,
        modulationIndex = 0.0,
        filterFrequency = 4200,
        filterQ = 1.0,
        gainLevel = 1.,
        // reverbDecay = 8,
        // reverbWet = 0.98,
        fbDelayTime = 0.375,
        fbGainLevel = 0.7,
        fbFilterFrequency = 1000,
        driveAmount = 0.2,
        clickDelayTime = 0.09,
        clickDelayFeedback = 0.82,
    } = {}) {
        const filter = new Tone.Filter({
            frequency: filterFrequency,
            type: "lowpass",
            Q: filterQ,
        });

        const gain = new Tone.Gain(0.4);
        // const reverb = new Tone.Reverb({
        //     decay: reverbDecay,
        //     wet: reverbWet,
        // });

        // FB delay loop for extra texture
        const fbDelay = new Tone.Delay(fbDelayTime);
        const fbGain = new Tone.Gain(fbGainLevel);
        const fbFilter = new Tone.Filter(fbFilterFrequency, "lowpass");
        const drive = new Tone.Distortion(driveAmount);
        const fbDelWet = new Tone.Gain(0.0);
        const delSendGain = new Tone.Gain(0.0);
        const clickDelay = new Tone.FeedbackDelay({
            delayTime: clickDelayTime,
            feedback: clickDelayFeedback,
            wet: 1.0,
        });

        const fbDelTimeLfo = new Tone.LFO({
            frequency: 1.5,
            min: fbDelayTime * 0.25,
            max: fbDelayTime * 1.5,
        });

        fbDelTimeLfo.connect(fbDelay.delayTime);

        const fbDelTimeLfoLfo = new Tone.LFO({
            frequency: 1.5,
            min: 0.5,
            max: 5.,
        });

        fbDelTimeLfoLfo.connect(fbDelTimeLfo.frequency);
        fbDelTimeLfo.connect(fbDelTimeLfoLfo.frequency)


        fbDelay.connect(fbFilter);
        fbFilter.connect(fbDelWet);
        fbDelWet.connect(drive);
        drive.connect(fbGain);
        fbGain.connect(fbDelay);

        const osc = new Tone.FMOscillator({
            frequency: pitch,
            type: "sawtooth",
            modulationType: "sine",
            harmonicity,
            modulationIndex,
        });

        const oscGain = new Tone.Gain(1.0);

        const oscModIndexLfo = new Tone.LFO({
            frequency: 0.5,
            min: 0.0,
            max: 2.0,
        });
       oscModIndexLfo.connect(osc.modulationIndex.factor);


        const highOsc = new Tone.FMOscillator({
            frequency: Tone.Frequency((Tone.Frequency(pitch).toMidi() + 12), "midi").toNote(),
            type: "sawtooth",
            modulationType: "sine",
            harmonicity: 0.99,
            modulationIndex,
        });

        const highOscGain = new Tone.Gain(0.);

        const vib = new Tone.Vibrato({
            frequency: 2.5,
            depth: 0.21,
        });

        const vibLfo = new Tone.LFO({
            frequency: Math.random() + 0.1,
            min: 3.,
            max: 6.,
        });
        vibLfo.connect(vib.frequency);


        const chorus = new Tone.Chorus({frequency: 1.5, delayTime: 3, depth: 0.6, type: "sine", spread: 90})

        osc.connect(oscGain);
        oscGain.connect(filter);
        highOsc.connect(highOscGain);
        highOscGain.connect(vib);
        vib.connect(chorus);
        chorus.connect(filter);
        filter.connect(gain);
        gain.connect(fbDelWet);
        gain.connect(delSendGain);
        delSendGain.connect(clickDelay);
        fbDelWet.toDestination();
        clickDelay.toDestination();
        gain.toDestination();

    //    gain.connect(reverb);
    //     fbDelay.connect(reverb);
    //     reverb.toDestination();

        let hasStarted = false;
        let hasStopped = false;

        function rampParam(param, value, rampTime = 0) {
            if (rampTime > 0) {
                param.rampTo(value, rampTime);
            } else {
                param.value = value;
            }
        }

        return {
            osc,
            oscGain,
            oscModIndexLfo,
            highOsc,
            highOscGain,
            vib,
            vibLfo,
            filter,
            gain,
            // reverb,
            fbDelay,
            fbDelWet,
            delSendGain,
            clickDelay,
            fbDelTimeLfo,
            fbDelTimeLfoLfo,
            fbGain,
            fbFilter,
            drive,


            setPitch(value, rampTime = 0) {
                if (rampTime > 0) {
                    osc.frequency.rampTo(value, rampTime);
                    // highOsc.frequency.rampTo(value * 2., rampTime);
                } else {
                    osc.frequency.value = Tone.Frequency(value).toFrequency();
                    // highOsc.frequency.value = Tone.Frequency(value).toFrequency() * 2;
                }
            },

            setHighOscPitch(value, rampTime = 0) {
                if (rampTime > 0) {
                    // osc.frequency.rampTo(value, rampTime);
                    highOsc.frequency.rampTo(value * 2., rampTime);
                } else {
                    // osc.frequency.value = Tone.Frequency(value).toFrequency();
                    highOsc.frequency.value = Tone.Frequency(value).toFrequency() * 2;
                }
            },

            setFilterFrequency(value, rampTime = 0) {
                rampParam(filter.frequency, value, rampTime);
            },

            setFilterQ(value, rampTime = 0) {
                rampParam(filter.Q, value, rampTime);
            },

            setGainLevel(value, rampTime = 0) {
                rampParam(oscGain.gain, value, rampTime);
            },

            setFbDelWet(value, rampTime = 3.0) {
                rampParam(fbDelWet.gain, value, rampTime);
            },

            setDelSendGain(value, rampTime = 0) {
                rampParam(delSendGain.gain, value, rampTime);
            },

            setModulationIndex(value, rampTime = 0) {
                rampParam(highOsc.modulationIndex, value, rampTime);
            },

            setVibDepth(value, rampTime = 0) {
                rampParam(vib.depth, value, rampTime);
            },

            setHighOscGain(value, rampTime = 0) {
                rampParam(highOscGain.gain, value, rampTime);
            },

            setHarmonicity(value, rampTime = 0) {
                rampParam(osc.harmonicity, value, rampTime);
            },

            triggerClickDelaySplash(
                peak = 0.42,
                attackTime = 0.02,
                releaseTime = 1.1
            ) {
                const now = Tone.now();
                const currentValue = delSendGain.gain.value;

                clickDelay.delayTime.value = randomInRange(0.005, 0.06);
                delSendGain.gain.cancelScheduledValues(now);
                delSendGain.gain.setValueAtTime(currentValue, now);

                if (attackTime > 0) {
                    delSendGain.gain.linearRampToValueAtTime(peak, now + attackTime);
                } else {
                    delSendGain.gain.setValueAtTime(peak, now);
                }

                delSendGain.gain.linearRampToValueAtTime(
                    0.0,
                    now + attackTime + releaseTime
                );
            },

            // setReverbWet(value, rampTime = 0) {
            //     rampParam(reverb.wet, value, rampTime);
            // },

            start(time = Tone.now()) {
                if (hasStarted || hasStopped) {
                    return;
                }

                osc.start(time);
                oscModIndexLfo.start(time);
                fbDelTimeLfo.start(time);
                fbDelTimeLfoLfo.start(time);
                highOsc.start(time);
                chorus.start(time);
                vibLfo.start(time);
                hasStarted = true;
            },

            stop(time = Tone.now()) {
                if (!hasStarted || hasStopped) {
                    return;
                }
                vibLfo.stop(time);
                osc.stop(time);
                fbDelTimeLfo.stop(time);
                fbDelTimeLfoLfo.stop(time);
                oscModIndexLfo.stop(time);
                highOsc.stop(time);
                hasStopped = true;
            },

            dispose() {
                osc.dispose();
                oscGain.dispose();
                highOsc.dispose();
                highOscGain.dispose();
                fbDelTimeLfo.dispose();
                fbDelTimeLfoLfo.dispose();
                oscModIndexLfo.dispose();
                filter.dispose();
                gain.dispose();
                // reverb.dispose();
                fbDelay.dispose();
                fbDelWet.dispose();
                delSendGain.dispose();
                clickDelay.dispose();
                fbGain.dispose();
                fbFilter.dispose();
                drive.dispose();
                vib.dispose();
                vibLfo.dispose();
            },
        };
    }

    function generateChordPair(){
        let c1BassNote = Math.floor(randomInRange(41, 52))
        let c1Note2 = c1BassNote + Math.floor(randomInRange(2, 10)) + Math.floor(randomInRange(0, 2)) * 12
        let c1Note3  = c1BassNote + Math.floor(randomInRange(2, 10)) + Math.floor(randomInRange(0, 2)) * 12
        while(c1Note3 === c1Note2){
            c1Note3 = c1BassNote + Math.floor(randomInRange(2, 10))
        }
        // if(Math.random() < 0.3){
        //     c1Note2 += 12
        // }
        // if(Math.random() < 0.3){
        //     c1Note3 += 12
        // }

        let c2BassNote = c1BassNote + Math.floor(randomItem([-7, -5,-3, -2, 2, 3, 5, 7, 9, 12]))
        let c2Note2 = c1Note2 + Math.floor(randomItem([-4, -3, -2, -1, 1, 2, 3, 4, 5, 12]))
        let c2Note3 = c1Note3 + Math.floor(randomItem([-4, -3, -2, -1, 1, 2, 3, 4, 5, 12]))

        let chord1 = [Tone.Frequency(c1BassNote, "midi").toNote(), Tone.Frequency(c1Note2, "midi").toNote(), Tone.Frequency(c1Note3, "midi").toNote()]
        let chord2 = [Tone.Frequency(c2BassNote, "midi").toNote(), Tone.Frequency(c2Note2, "midi").toNote(), Tone.Frequency(c2Note3, "midi").toNote()]

        let chordPair = [chord1, chord2]
        console.log("generated chord pair:", chordPair);

        return chordPair

    }

    const systemState = {
        engagement: 0,
        agitation: 0,
        lastUpdateTime: Tone.now(),
    };


    
    function updateSystemState(
        now = Tone.now(),
        engagementInput = 0,
        agitationInput = 0
        ) {
        const dt = Math.max(0, now - systemState.lastUpdateTime);
        systemState.lastUpdateTime = now;

        const engagementDecay = 0.2;
        const agitationDecay = 0.8;

        systemState.engagement = clamp(
            systemState.engagement * Math.exp(-engagementDecay * dt) + engagementInput,
            0,
            1
        );

        systemState.agitation = clamp(
            systemState.agitation * Math.exp(-agitationDecay * dt) + agitationInput,
            0,
            1
        );
    }

    const systemStateMaintenanceLoop = new Tone.Loop(() => {
        updateSystemState(Tone.now(), 0, 0);
        updateDronePartialMorphSwells(Tone.now());
        // console.log("system state:", {
        //     engagement: systemState.engagement.toFixed(2),
        //     agitation: systemState.agitation.toFixed(2),
        // });
    }, 0.1);


  // Original chords (voice1 voice2 voice3): [["C3", "D4", "F4"], ["Bb2", "C4", "G4"]];
  // cool spooky chords: [['C3', 'D#3', 'G3'],['G3', 'B2', 'E3']]


    const chordPair1 = [['C3', 'D#3', 'G3'],['G3', 'B2', 'E3']];



    //bass
    const voice1 = drone({
        pitch: chordPair1[0][0],
        secondaryPitch: chordPair1[1][0],
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


    const voice2 = drone({
        pitch: chordPair1[0][1],
        secondaryPitch: chordPair1[1][1],
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
  





    const voice3 = drone({
        pitch: chordPair1[0][2],
        secondaryPitch: chordPair1[1][2],
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
    const leadVoice = lead({
        pitch: Tone.Frequency(chordPair1[0][1]).transpose(12).toNote(),
        gainLevel: 0.0,
        filterFrequency: 900,
        reverbWet: 0.44,
        reverbDecay: 10,
    });
    const leadGestureState = {
        isDown: false,
        holdStartTime: 0,
        dragDistance: 0,
        dragEnergy: 0,
        lastUpdateTime: Tone.now(),
        pitchChangePoints: [],
        nextPitchChangeIndex: 0,
        previousDragProgress: 0,
    };
    const leadGestureConfig = {
        pressGain: 0.18,
        holdBaseGain: 0.11,
        holdGainBoost: 0.08,
        gainAttack: 0.02,
        gainRelease: 5.18,
        quickReleaseMaxHold: 0.5,
        clickDelaySplashPeak: 0.42,
        clickDelaySplashAttack: 0.02,
        clickDelaySplashRelease: 1.1,
        filterPressHigh: 7200,
        filterPressLow: 100,
        filterRiseMax: 5200,
        filterDropTime: 5.1,
        filterRampTime: 0.07,
        holdRiseSeconds: 12.0,
        dragDistanceMax: 1500,
        dragEnergyDecayPerSecond: 3.4,
        modIndexBase: 0.0,
        modIndexRange: 1.5,
        modIndexRampTime: 4.05,
    };

    function updateLeadGesture({
        speed = 0,
        rawSpeed = 0,
        speedPxPerSecond = 0,
        dx = 0,
        dy = 0,
        mouseDown = false,
    } = {}) {
        const contextIsRunning = Tone.getContext().rawContext.state === "running";

        if (!isStarted && !contextIsRunning) {
            return false;
        }



        const now = Tone.now();
        const held = Boolean(mouseDown);
        const normalizedSpeed = Number.isFinite(speed) ? speed : 0;
        const pixelsPerSecond = Number.isFinite(speedPxPerSecond)
            ? speedPxPerSecond
            : 0;
        const movementDistance = Number.isFinite(rawSpeed) && rawSpeed > 0
            ? rawSpeed
            : Math.sqrt(dx * dx + dy * dy);
        const movementNorm = clamp(
            Math.max(normalizedSpeed, movementDistance / 120, pixelsPerSecond / 4200),
            0,
            1
        );
        const dt = clamp(now - leadGestureState.lastUpdateTime, 1 / 120, 0.25);
        leadGestureState.lastUpdateTime = now;




        if (held && !leadGestureState.isDown) {
            let randomPitch = getNearestStableDronePitch(randomItem(voices));
            leadGestureState.isDown = true;
            leadGestureState.holdStartTime = now;
            leadGestureState.dragDistance = 0;
            leadGestureState.dragEnergy = 0;

            leadVoice.start();
            leadVoice.setGainLevel(0.0);
            leadVoice.setFbDelWet(0.0);
            leadVoice.setModulationIndex(leadGestureConfig.modIndexBase);
            leadVoice.setHighOscGain(
            0.0);
            leadVoice.setVibDepth(0.0);
            leadVoice.setPitch(randomPitch);
            leadVoice.setHighOscPitch(randomPitch);
            // leadVoice.setHighOscPitch(getNearestStableDronePitch(randomItem(voices)));
            leadVoice.setFilterFrequency(leadGestureConfig.filterPressHigh);
            leadVoice.setGainLevel(
                leadGestureConfig.pressGain,
                leadGestureConfig.gainAttack
            );
            leadVoice.setFilterFrequency(
                leadGestureConfig.filterPressLow,
                leadGestureConfig.filterDropTime
            );

            leadGestureState.pitchChangePoints = Array.from(
                { length: Math.floor(randomInRange(3, 8)) },
                () => Math.random()
                ).sort((a, b) => a - b);
            // console.log("pitch change points:", leadGestureState.pitchChangePoints);

            leadGestureState.nextPitchChangeIndex = 0;
            leadGestureState.previousDragProgress = 0;

            return true;
        }

        if (!held && leadGestureState.isDown) {
            const holdDuration = now - leadGestureState.holdStartTime;
            leadGestureState.isDown = false;
            leadGestureState.dragDistance = 0;
            leadGestureState.dragEnergy = 0;

            leadVoice.setGainLevel(0.0, leadGestureConfig.gainRelease);
            leadVoice.setModulationIndex(0.0, 0.14);
            leadVoice.setFbDelWet(0.0);
            leadVoice.setHighOscGain(0.);
            leadVoice.setFilterFrequency(leadGestureConfig.filterPressLow, 0.2);

            if (holdDuration <= leadGestureConfig.quickReleaseMaxHold) {
                leadVoice.triggerClickDelaySplash(
                    leadGestureConfig.clickDelaySplashPeak,
                    leadGestureConfig.clickDelaySplashAttack,
                    leadGestureConfig.clickDelaySplashRelease
                );
            }

            voices[0].setDrive(0.);

            return true;
        }

        if (!held) {
            return false;
        }

        const dragDecay = Math.exp(-leadGestureConfig.dragEnergyDecayPerSecond * dt);
        leadGestureState.dragDistance = Math.min(
            leadGestureState.dragDistance + movementDistance,
            leadGestureConfig.dragDistanceMax
        );
        leadGestureState.dragEnergy = clamp(
            leadGestureState.dragEnergy * dragDecay + movementNorm * (1 - dragDecay) * 2.2,
            0,
            1
        );

        const holdProgress = clamp(
            (now - leadGestureState.holdStartTime) / leadGestureConfig.holdRiseSeconds,
            0,
            1
        );
        const dragProgress = clamp(
            leadGestureState.dragDistance / leadGestureConfig.dragDistanceMax,
            0,
            1
        );
        const filterProgress = clamp(
            holdProgress + leadGestureState.dragEnergy * 0.2 + dragProgress * 0.15,
            0,
            1
        );
        const filterTarget =
            leadGestureConfig.filterPressLow +
            filterProgress *
                (leadGestureConfig.filterRiseMax - leadGestureConfig.filterPressLow);
        const modIndexTarget =
            leadGestureConfig.modIndexBase +
            clamp(leadGestureState.dragEnergy * 0.85 + dragProgress * 0.4, 0, 1) *
                leadGestureConfig.modIndexRange;
        const holdGainProgress = holdProgress * (1 - holdProgress * 0.45);
        const gainTarget =
            leadGestureConfig.holdBaseGain +
            holdGainProgress * leadGestureConfig.holdGainBoost;


        const leadInfluence = clamp(
            holdProgress * 0.9 + dragProgress * 0.9,
            0,
            1
        );

        voices[0].setDrive(clamp(leadInfluence * 0.7, 0.2, 0.9));


        leadVoice.setFilterFrequency(filterTarget, leadGestureConfig.filterRampTime);
        leadVoice.setModulationIndex(
            modIndexTarget * 1.0,
            leadGestureConfig.modIndexRampTime * 6
        );
        leadVoice.setFbDelWet(clamp(dragProgress, 0, 1));
        const highOscProgress = dragProgress * (1 - dragProgress * 0.55);
        leadVoice.setHighOscGain(
            clamp(highOscProgress * 0.6, 0, 0.32),
            leadGestureConfig.modIndexRampTime
        );
        leadVoice.setVibDepth(
            clamp(modIndexTarget / 7., 0, 0.2),
            leadGestureConfig.modIndexRampTime
        );
        leadVoice.setGainLevel(gainTarget, 0.08);

        updateSystemState(Tone.now(), 0.0015 * (holdProgress * 2.0), 0.002 * (dragProgress * 2.0) );

        //intermittent pitch changes
        //console.log("hold progress:", holdProgress.toFixed(2), "drag progress:", dragProgress.toFixed(2));
        const pitchChangePoint =
            leadGestureState.pitchChangePoints[leadGestureState.nextPitchChangeIndex];

            if (
                pitchChangePoint != null &&
                leadGestureState.previousDragProgress < pitchChangePoint &&
                dragProgress >= pitchChangePoint
            ) {
                leadVoice.setPitch(getNearestStableDronePitch(randomItem(voices)), randomInRange(0.2, 0.6));
                leadVoice.setHighOscPitch(getNearestStableDronePitch(randomItem(voices)), randomInRange(0.2, 0.6));
                leadGestureState.nextPitchChangeIndex += 1;
            }

            leadGestureState.previousDragProgress = dragProgress;

        return {
            filterTarget,
            modIndexTarget,
            gainTarget,
        };
    }

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
        x = 0,
    } = {}) {
        const contextIsRunning = Tone.getContext().rawContext.state === "running";

        // if (leadGestureState.isDown) {
        //     return false;
        // }
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
            // console.log("arp gesture input", {
            //     speed: effectiveSpeed.toFixed(2),
            //     frameDistance: frameDistance.toFixed(1),
            //     speedPxPerSecond: pixelsPerSecond.toFixed(0),
            //     context: Tone.getContext().rawContext.state,
            // });
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
                effectiveSpeed * 4 +
                distanceAmount * 3 +
                randomInRange(-1, 1)
            ),
            4,
            10
        );
        const rangeSpread = 16 + Math.round(effectiveSpeed * 12 + distanceAmount * 8);
        const rangeCenter = 74 + Math.round(verticalBias * 8 + randomInRange(-3, 4));
        const minPitch = Math.round(clamp(rangeCenter - rangeSpread * 0.5, 52, 104));
        const maxPitch = Math.round(clamp(rangeCenter + rangeSpread * 0.5, minPitch + 3, 108));
        const noteSpacing = clamp(
            0.17 -
            effectiveSpeed * 0.07 -
            distanceAmount * 0.02 +
            randomInRange(-0.008, 0.012),
            0.055,
            0.18
        );
        const noteDuration = clamp(
            0.1 + distanceAmount * 0.16 + randomInRange(-0.02, 0.06),
            0.05,
            0.32
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

        const pan = x * 2 - 1;
        arpVoice.setPanner(pan, 0.03);


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

        updateSystemState(Tone.now(), 0.08, 0.12);

        // console.log("gesture arp", {
        //     notes,
        //     speed: effectiveSpeed.toFixed(2),
        //     numNotes: noteCount,
        //     pitchRange: [minPitch, maxPitch],
        //     noteSpacing: noteSpacing.toFixed(3),
        // });

        return notes;
    }

    const start = () => {
        pitchSlideLoop.cancel(0);
        systemStateMaintenanceLoop.cancel(0);
        duckLoop.cancel(0);
        perfLoop.cancel(0);
        arpVoice.start();
        pitchSlideLoop.start(0);
        systemStateMaintenanceLoop.start(0);
        duckLoop.start(0);
        perfLoop.start(0);
        partialSwellTestLoop.start(0);
        Tone.Transport.start();
        isStarted = true;
    }

    const stop = () => {
        pitchSlideLoop.stop();
        systemStateMaintenanceLoop.stop();
        duckLoop.stop();
        perfLoop.stop();
        arpVoice.stop();
        leadVoice.stop();
        partialSwellTestLoop.stop();
        Tone.Transport.stop();
        isStarted = false;
    }

    const dispose = () => {
        stop();
        arpVoice.dispose();
        leadVoice.dispose();
        voices.forEach((voice) => voice.dispose());
        droneReverbSend.dispose();
        droneReverb.dispose();
        pitchSlideLoop.dispose();
        systemStateMaintenanceLoop.dispose();
        duckLoop.dispose();
        perfLoop.dispose();
        partialSwellTestLoop.dispose();
    }

    const voices = [voice1, voice2, voice3];

    const droneMorphState = voices.map(() => ({
        active: false,
        startTime: 0,
        duration: 0,
        peakAmount: 0,
        baseAmount: 0,
    }));



    function triggerDronePartialMorphSwell(voiceIndex, peakAmount = 0.8, duration = 6) {
        const now = Tone.now();
        const state = droneMorphState[voiceIndex];

        state.active = true;
        state.startTime = now;
        state.duration = duration;
        state.peakAmount = peakAmount;
        state.baseAmount = 0;

        console.log(`triggering morph swell on voice ${voiceIndex} with peak ${peakAmount} and duration ${duration}`);
    }


    function updateDronePartialMorphSwells(now = Tone.now()) {
        for (let i = 0; i < voices.length; i += 1) {
            const state = droneMorphState[i];
            if (!state.active) {
            continue;
            }

            const progress = (now - state.startTime) / state.duration;

            if (progress >= 1) {
            state.active = false;
            voices[i].setMorphAmount(state.baseAmount);
            continue;
            }

            const hairpin = Math.sin(progress * Math.PI);
            const amount = clamp(state.baseAmount + hairpin * state.peakAmount, 0, 1);
            voices[i].setMorphAmount(amount);
        }
    }


    const slideProbability = 0.25;
    const slideCheckInterval = 1.0;

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

        

    const partialSwellTestLoop = new Tone.Loop((time) => {
        if (Math.random() < 0.65) {
            const voiceIndex = Math.floor(Math.random() * voices.length);
            console.log("engagement: ", systemState.engagement.toFixed(2), "agitation: ", systemState.agitation.toFixed(2));
            triggerDronePartialMorphSwell(voiceIndex, randomInRange(0.1, 0.3) * (lerp(systemState.engagement, 0, 1, 0., 1.3)), randomInRange(4, 6));
        }
    }, 4.0);

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
        leadVoice,
        createLead(options = {}) {
            return lead(options);
        },
        start,
        stop,
        dispose,
        makePitchSequence,
        playArpRun,
        triggerArpGesture,
        updateLeadGesture,
        getPerfStats() {
            return { ...perfStats };
        },
    }

  return audioEngine;

  // NEED TO CHANGE APP.JSX TO ACCOMODATE THE AUDIOENGINE OBJECT INSTEAD OF JUST VOICES
  
}
