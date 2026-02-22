import * as Tone from "tone";

export function createEngine() {

    function trill(pitch="C4", pitchRange=200, rateMin=2, rateMax=8, rateModRate=0.25, filterMin=300, filterMax=800, filterModRate=0.25) {
        const filter = new Tone.Filter({
            frequency: 500,
            type: "bandpass",
            Q: 3.0
        });;
       const delay = new Tone.PingPongDelay({
            delayTime: 0.5,
            feedback: 0.6,
            wet: 0.3
        });
        const reverb = new Tone.Reverb({ decay: 6, wet: 0.25 });
        const osc = new Tone.FMOscillator({
		    frequency: pitch,
		    type: "sine",
		    modulationType: "triangle",
		    harmonicity: 0.66,
		    modulationIndex: 0.0
	    })
        const gain = new Tone.Gain(0.05);
        const gainLfo = new Tone.LFO(0.3, 0.1, 0.5);

        const trillLfo = new Tone.LFO({
            frequency: 3,
            type: "square",
            min: pitchRange,
            max: 0
        });

        const trillModLfo = new Tone.LFO({
            frequency: rateModRate,
            type: "sine",
            min: rateMin,
            max: rateMax
        });

        const filterLfo = new Tone.LFO({
            frequency: filterModRate,
            type: "sine",
            min: filterMin,
            max: filterMax
        });

        filterLfo.connect(filter.frequency);

        trillLfo.connect(osc.detune);
        trillModLfo.connect(trillLfo.frequency);


        gainLfo.connect(gain.gain);
        osc.connect(filter);
        filter.connect(delay);
        delay.connect(reverb);
        reverb.connect(gain);
        gain.toDestination();
        

        // custom LFO to mod index
        const lfoHz = 0.2;
        const modIndexMin = 0.0;
        const modIndexMax = 5.0;

        const loopHz = 60;             // update rate
        const dt = 1 / loopHz;

        const loop = new Tone.Loop((time) => {
            // time is the scheduled time for this callback
            const phase = 2 * Math.PI * lfoHz * time;
            const x = (Math.sin(phase) + 1) * 0.5;
            const val = modIndexMin + x * (modIndexMax - modIndexMin);

            // schedule at 'time'
            osc.modulationIndex.setValueAtTime(val, time);

            // optional smoothing (comment out if not needed)
            // osc.modulationIndex.linearRampToValueAtTime(val, time + dt);
        }, dt);


        return { osc, filter, reverb, gainLfo, gain, trillLfo, trillModLfo, loop, delay, filterLfo,
            start() { osc.start(); gainLfo.start(); trillLfo.start(); trillModLfo.start(); loop.start(); Tone.Transport.start(); filterLfo.start(); },
            stop() { osc.stop(); loop.stop(); trillLfo.stop(); trillModLfo.stop(); Tone.Transport.stop(); filterLfo.stop(); gainLfo.stop(); }, 
            dispose() { reverb.dispose(); gainLfo.dispose(); trillLfo.dispose(); trillModLfo.dispose(); loop.dispose(); delay.dispose(); filter.dispose(); osc.dispose(); gain.dispose(); filterLfo.dispose();}   
        }
    }
  

  return trill("D4", 100, 0.5, 4.0, 0.3, 200, 500, 0.4)
  
}
