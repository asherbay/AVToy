import p5 from "p5";

const grainImageUrls = [
  new URL("./images/pollock5.jpg", import.meta.url).href,
  new URL("./images/pollock4.jpg", import.meta.url).href,
];
const droneXfadeImageUrl = new URL(
  "./images/complex2.webp",
  import.meta.url
).href;

export function mountSketch(
  containerEl,
  onControl,
  onClick,
  getAudioLevel,
  getDrone2Level
) {
  let cleanupPointerMove = () => {};
  let registerArpPulseFn = () => {};

  const instance = new p5((p) => {
    let sourceImages = [];
    let droneXfadeImage = null;
    let canvasEl = null;
    let grainBuffer = null;
    let echoBuffer = null;
    let lastX = 0;
    let lastY = 0;
    let lastSpeed = 0;
    let lastControlTime = 0;
    let lastMouseDownState = false;
    let gestureActive = false;
    let smoothedAudioLevel = 0;
    let smoothedDrone2Level = 0;
    let lastDrawTimeMs = 0;
    let echoFrameCounter = 0;

    let testGrainSheet = null;
    const activeArpPulses = [];
    const activeLeadSmears = [];
    const droneXfadeClusters = [];
    const grainBufferScale = 0.45;
    const echoFadeAlpha = 10;
    const echoMixAlpha = 0.22;
    const echoFrameStride = 5;
    const grainBlurPx = 2.5;
    const echoBlurPx = 0;
    const droneXfadeMaxMix = 0.72;
    let lastLeadSmearAt = 0;
    let leadDragDistance = 0;
    const leadSmearMinIntervalMs = 28;
    const leadSmearMaxCount = 48;

    function sendControl(dx, dy, source = "draw", x = p.mouseX, y = p.mouseY) {
      if (!onControl) {
        return;
      }

      const now = performance.now();
      const speed = Math.sqrt(dx * dx + dy * dy);
      const dt = Math.max((now - lastControlTime) / 1000, 1 / 120);
      const speedPxPerSecond = speed / dt;
      const speedNorm = Math.min(speedPxPerSecond / 3200, 1);
      const accel = speedNorm - lastSpeed;

      if (p.mouseIsPressed && source !== "draw") {
        leadDragDistance = Math.min(leadDragDistance + speed, 1600);
      }

      onControl({
        x: x / p.width,
        y: y / p.height,
        speed: speedNorm,
        rawSpeed: speed,
        speedPxPerSecond,
        accel,
        dt,
        dx,
        dy,
        mouseDown: p.mouseIsPressed,
        source,
      });

      if (p.mouseIsPressed && speed > 1.2 && source !== "draw") {
        registerLeadSmear({
          x,
          y,
          dx,
          dy,
          speedPxPerSecond,
        });
      }

      lastSpeed = speedNorm;
      lastControlTime = now;
    }

    function handlePointerMove(event) {
      if (!canvasEl) {
        return;
      }

      const rect = canvasEl.getBoundingClientRect();
      const scaleX = p.width / rect.width;
      const scaleY = p.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      if (x < 0 || x > p.width || y < 0 || y > p.height) {
        return;
      }

      const dx = Number.isFinite(event.movementX)
        ? event.movementX * scaleX
        : x - lastX;
      const dy = Number.isFinite(event.movementY)
        ? event.movementY * scaleY
        : y - lastY;

      sendControl(dx, dy, "pointermove", x, y);
      lastX = x;
      lastY = y;
    }

    function randomSampleTravelSpeed() {
      return p.random(22, 38);
    }

    function getMorphDuration(startSample, targetSample) {
      const distance = Math.hypot(
        targetSample.sx - startSample.sx,
        targetSample.sy - startSample.sy
      );
      const pxPerSecond = randomSampleTravelSpeed();
      const durationMs = (distance / pxPerSecond) * 1000;

      return p.constrain(durationMs, 1600, 7200);
    }

    function randomSamplePosition(sourceImage, w, h) {
      const maxSx = Math.max(0, sourceImage.width - w);
      const maxSy = Math.max(0, sourceImage.height - h);

      return {
        sx: p.random(0, maxSx),
        sy: p.random(0, maxSy),
      };
    }

    function setNextGrainTarget(grain) {
      grain.startSx = grain.targetSx;
      grain.startSy = grain.targetSy;

      const nextTarget = randomSamplePosition(grain.sourceImage, grain.w, grain.h);
      grain.targetSx = nextTarget.sx;
      grain.targetSy = nextTarget.sy;
      grain.morphDuration = getMorphDuration(
        { sx: grain.startSx, sy: grain.startSy },
        nextTarget
      );
    }

    function createDroneXfadeClusters() {
      droneXfadeClusters.length = 0;

      for (let i = 0; i < 4; i += 1) {
        droneXfadeClusters.push({
          baseX: p.random(p.width),
          baseY: p.random(p.height),
          driftX: p.random(42, 135),
          driftY: p.random(42, 135),
          phaseX: p.random(Math.PI * 2),
          phaseY: p.random(Math.PI * 2),
          rateX: p.random(0.016, 0.045) * Math.PI * 2,
          rateY: p.random(0.014, 0.04) * Math.PI * 2,
          radius: p.random(180, 300),
          radiusDepth: p.random(0.08, 0.18),
          radiusRate: p.random(0.012, 0.032) * Math.PI * 2,
          radiusPhase: p.random(Math.PI * 2),
          strengthRate: p.random(0.018, 0.05) * Math.PI * 2,
          strengthPhase: p.random(Math.PI * 2),
        });
      }
    }

    function getDroneXfadeClusterStates(nowMs) {
      const time = nowMs * 0.001;

      return droneXfadeClusters.map((cluster) => {
        const radiusScale =
          1 +
          Math.sin(time * cluster.radiusRate + cluster.radiusPhase) *
            cluster.radiusDepth;
        const strengthWave =
          (Math.sin(time * cluster.strengthRate + cluster.strengthPhase) + 1) *
          0.5;

        return {
          x: cluster.baseX + Math.sin(time * cluster.rateX + cluster.phaseX) * cluster.driftX,
          y: cluster.baseY + Math.sin(time * cluster.rateY + cluster.phaseY) * cluster.driftY,
          radius: cluster.radius * radiusScale,
          strength: 0.55 + strengthWave * 0.75,
        };
      });
    }

    function getDroneXfadeInfluence(grain, clusterStates) {
      let influence = 0;

      for (let i = 0; i < clusterStates.length; i += 1) {
        const cluster = clusterStates[i];
        const distance = Math.hypot(grain.x - cluster.x, grain.y - cluster.y);
        if (distance >= cluster.radius) {
          continue;
        }

        const gradient = 1 - distance / cluster.radius;
        const localInfluence =
          gradient * gradient * cluster.strength * grain.droneXfadeBias;
        influence = Math.max(influence, localInfluence);
      }

      return Math.min(influence, 1);
    }

    function mapSamplePositionToImage(fromImage, toImage, grain, sx, sy) {
      const fromMaxSx = Math.max(0, fromImage.width - grain.w);
      const fromMaxSy = Math.max(0, fromImage.height - grain.h);
      const u = fromMaxSx > 0 ? sx / fromMaxSx : 0.5;
      const v = fromMaxSy > 0 ? sy / fromMaxSy : 0.5;
      const toMaxSx = Math.max(0, toImage.width - grain.w);
      const toMaxSy = Math.max(0, toImage.height - grain.h);

      return {
        sx: u * toMaxSx,
        sy: v * toMaxSy,
      };
    }

    function registerArpPulse({
      x = 0.5,
      y = 0.5,
      strength = 1.8,
      radius = 160,
      duration = 1000,
    } = {}) {
      const nowMs = p.millis();
      const pulseX = x * p.width;
      const pulseY = y * p.height;
      activeArpPulses.push({
        x: pulseX,
        y: pulseY,
        strength,
        radius,
        duration,
        createdAt: nowMs,
      });

      if (activeArpPulses.length > 6) {
        activeArpPulses.splice(0, activeArpPulses.length - 6);
      }

      if (!testGrainSheet) {
        return;
      }

      for (let i = 0; i < testGrainSheet.length; i += 1) {
        triggerGrainMotionBurst(testGrainSheet[i], {
          x: pulseX,
          y: pulseY,
          strength,
          radius,
        });
      }
    }
    registerArpPulseFn = registerArpPulse;

    function registerLeadSmear({
      x = p.mouseX,
      y = p.mouseY,
      dx = 0,
      dy = 0,
      speedPxPerSecond = 0,
    } = {}) {
      if (!sourceImages.length) {
        return;
      }

      const nowMs = p.millis();
      if (nowMs - lastLeadSmearAt < leadSmearMinIntervalMs) {
        return;
      }

      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        return;
      }

      const dirX = dx / distance;
      const dirY = dy / distance;
      const normalX = -dirY;
      const normalY = dirX;
      const speedNorm = p.constrain(speedPxPerSecond / 1800, 0, 1.6);
      const dragProgress = p.constrain(leadDragDistance / 520, 0, 1);
      const stampCount = speedNorm > 0.85 ? 2 : 1;

      for (let i = 0; i < stampCount; i += 1) {
        const alongOffset = p.random(-18, 12) - i * p.random(18, 34);
        const normalOffset = p.random(-18, 18);
        const stampX = x + dirX * alongOffset + normalX * normalOffset;
        const stampY = y + dirY * alongOffset + normalY * normalOffset;
        const grain = makeGrain(
          p.random(78, 132) * (0.8 + speedNorm * 0.55),
          p.random(26, 54) * (0.9 + speedNorm * 0.25),
          stampX,
          stampY,
          Math.atan2(dirY, dirX) + p.random(-0.18, 0.18)
        );

        if (!grain) {
          continue;
        }

        grain.alpha = p.random(0.14, 0.26) * (0.75 + speedNorm * 0.25);

        activeLeadSmears.push({
          grain,
          createdAt: nowMs,
          duration: p.random(320, 720),
          directionX: dirX,
          directionY: dirY,
          driftDistance: p.random(22, 58) * (0.65 + speedNorm * 0.45),
          stretch: p.random(0.4, 1.8) * (0.85 + speedNorm * 0.25),
          squash: p.random(
            p.lerp(1.0, 7.0, dragProgress * 0.8),
            p.lerp(1.5, 8.2, dragProgress * 0.8)
          ),
          driftJitter: p.random(0.82, 1.18),
          alphaBoost: p.random(0.9, 1.2),
        });
      }

      if (activeLeadSmears.length > leadSmearMaxCount) {
        activeLeadSmears.splice(0, activeLeadSmears.length - leadSmearMaxCount);
      }

      lastLeadSmearAt = nowMs;
    }

    function triggerGrainMotionBurst(grain, pulse) {
      const distance = Math.hypot(grain.x - pulse.x, grain.y - pulse.y);
      if (distance >= pulse.radius) {
        return;
      }

      const proximity = 1 - distance / pulse.radius;
      const burstStrength = proximity * proximity * pulse.strength;
      const angle = p.random(Math.PI * 2);
      const burstDistance = p.random(10, 28) * burstStrength;
      const impulse = burstDistance * p.random(7, 12);

      grain.motionVelocityX += Math.cos(angle) * impulse;
      grain.motionVelocityY += Math.sin(angle) * impulse;
    }

    function updateGrainMotion(grain, dtMs) {
      const dt = Math.min(dtMs, 80) * 0.001;
      const spring = 18;
      const damping = 7.5;

      const accelX = -grain.motionOffsetX * spring - grain.motionVelocityX * damping;
      const accelY = -grain.motionOffsetY * spring - grain.motionVelocityY * damping;

      grain.motionVelocityX += accelX * dt;
      grain.motionVelocityY += accelY * dt;
      grain.motionOffsetX += grain.motionVelocityX * dt;
      grain.motionOffsetY += grain.motionVelocityY * dt;

      if (
        Math.abs(grain.motionOffsetX) < 0.02 &&
        Math.abs(grain.motionOffsetY) < 0.02 &&
        Math.abs(grain.motionVelocityX) < 0.02 &&
        Math.abs(grain.motionVelocityY) < 0.02
      ) {
        grain.motionOffsetX = 0;
        grain.motionOffsetY = 0;
        grain.motionVelocityX = 0;
        grain.motionVelocityY = 0;
      }
    }

    function getGrainArpBoost(grain, nowMs) {
      let boost = 0;

      for (let i = 0; i < activeArpPulses.length; i += 1) {
        const pulse = activeArpPulses[i];
        const age = nowMs - pulse.createdAt;

        if (age < 0 || age >= pulse.duration) {
          continue;
        }

        const distance = Math.hypot(grain.x - pulse.x, grain.y - pulse.y);
        if (distance >= pulse.radius) {
          continue;
        }

        const proximity = 1 - distance / pulse.radius;
        const decay = 1 - age / pulse.duration;
        boost += pulse.strength * proximity * proximity * decay;
      }

      return Math.min(boost, 3.5);
    }

    function randomBlobMorphDuration() {
      return p.random(1600, 3200);
    }

    function makeBlobPoints(pointCount = Math.floor(p.random(20, 32))) {
      const points = [];

      for (let i = 0; i < pointCount; i += 1) {
        points.push({
          angle:
            (i / pointCount) * Math.PI * 2 + p.random(-0.26, 0.26),
          radiusScale: p.random(0.68, 1.08),
          wobblePhase: p.random(Math.PI * 2),
          wobbleRate: p.random(0.08, 0.22) * Math.PI * 2,
          wobbleDepth: p.random(0.015, 0.055),
        });
      }

      points.sort((a, b) => a.angle - b.angle);
      return points;
    }

    function setNextBlobTarget(grain) {
      grain.startBlobPoints = grain.targetBlobPoints.map((point) => ({
        ...point,
      }));
      grain.targetBlobPoints = makeBlobPoints(grain.blobPointCount);
      grain.blobMorphDuration = randomBlobMorphDuration();
    }

    function updateGrainBlobMorph(grain, dtMs) {
      grain.blobMorphProgress += dtMs / grain.blobMorphDuration;

      while (grain.blobMorphProgress >= 1) {
        grain.blobMorphProgress -= 1;
        setNextBlobTarget(grain);
      }
    }

    function getGrainSamplePosition(grain) {
      const morphAmount = Math.min(Math.max(grain.morphProgress, 0), 1);
      const maxSx = Math.max(0, grain.sourceImage.width - grain.w);
      const maxSy = Math.max(0, grain.sourceImage.height - grain.h);

      return {
        sx: Math.min(
          maxSx,
          Math.max(
            0,
            grain.startSx + morphAmount * (grain.targetSx - grain.startSx)
          )
        ),
        sy: Math.min(
          maxSy,
          Math.max(
            0,
            grain.startSy + morphAmount * (grain.targetSy - grain.startSy)
          )
        ),
      };
    }

    function makeGrain(w, h, x, y, rotation) {
      if (!sourceImages.length) {
        return;
      }

      const sourceImage = p.random(sourceImages);
      const startSample = randomSamplePosition(sourceImage, w, h);
      const targetSample = randomSamplePosition(sourceImage, w, h);
      const morphDuration = getMorphDuration(startSample, targetSample);
      const blobPointCount = Math.floor(p.random(20, 32));
      const startBlobPoints = makeBlobPoints(blobPointCount);
      const targetBlobPoints = makeBlobPoints(blobPointCount);

      return {
        sourceImage,
        w,
        h,
        x,
        y,
        rotation,
        startSx: startSample.sx,
        startSy: startSample.sy,
        targetSx: targetSample.sx,
        targetSy: targetSample.sy,
        morphDuration,
        morphProgress: p.random(),
        alpha: p.random(0.18, 0.38),
        maskScaleX: p.random(0.72, 0.92),
        maskScaleY: p.random(0.72, 0.92),
        pulseRate: p.random(0.16, 0.5) * Math.PI * 2,
        pulsePhase: p.random(Math.PI * 2),
        pulseDepth: p.random(0.14, 0.32),
        warpRateX: p.random(0.18, 0.62) * Math.PI * 2,
        warpRateY: p.random(0.22, 0.7) * Math.PI * 2,
        warpPhaseX: p.random(Math.PI * 2),
        warpPhaseY: p.random(Math.PI * 2),
        warpDepthX: p.random(0.04, 0.11),
        warpDepthY: p.random(0.04, 0.11),
        maskWarpDepthX: p.random(0.03, 0.08),
        maskWarpDepthY: p.random(0.03, 0.08),
        audioPulseLift: p.random(0.08, 0.94),
        arpOverlayColor: p.random([
          [90, 170, 255],
          [255, 120, 90],
          [210, 110, 255],
        ]),
        arpOverlayStrength: p.random(0.7, 1.2),
        secondarySourceImage: droneXfadeImage,
        droneXfadeInfluence: 0,
        droneXfadeBias: p.random(0.78, 2.18),
        blobPointCount,
        startBlobPoints,
        targetBlobPoints,
        blobMorphDuration: randomBlobMorphDuration(),
        blobMorphProgress: p.random(),
        motionOffsetX: 0,
        motionOffsetY: 0,
        motionVelocityX: 0,
        motionVelocityY: 0,
      };
    }

    function getGrainDrawState(target, grain, nowMs, audioLevel) {
      const targetScaleX = target.width / p.width;
      const targetScaleY = target.height / p.height;
      const time = nowMs * 0.001;
      const pulseT =
        (Math.sin(time * grain.pulseRate + grain.pulsePhase) + 1) * 0.5;
      const audioPulseLift = audioLevel * grain.audioPulseLift;
      const pulseMin = 1 - grain.pulseDepth + audioPulseLift;
      const pulseMax = 1 + grain.pulseDepth + audioPulseLift;
      const pulse = pulseMin + pulseT * (pulseMax - pulseMin);
      const warpX =
        1 + Math.sin(time * grain.warpRateX + grain.warpPhaseX) * grain.warpDepthX;
      const warpY =
        1 + Math.sin(time * grain.warpRateY + grain.warpPhaseY) * grain.warpDepthY;
      const maskWarpX =
        1 +
        Math.sin(
          time * (grain.warpRateX * 0.83) + grain.warpPhaseY * 0.71
        ) *
          grain.maskWarpDepthX;
      const maskWarpY =
        1 +
        Math.sin(
          time * (grain.warpRateY * 0.91) + grain.warpPhaseX * 0.67
        ) *
          grain.maskWarpDepthY;
      return {
        x: (grain.x + grain.motionOffsetX) * targetScaleX,
        y: (grain.y + grain.motionOffsetY) * targetScaleY,
        rotation: grain.rotation,
        drawW: grain.w * pulse * warpX * targetScaleX,
        drawH: grain.h * pulse * warpY * targetScaleY,
        maskW:
          grain.w * pulse * warpX * targetScaleX * grain.maskScaleX * maskWarpX,
        maskH:
          grain.h * pulse * warpY * targetScaleY * grain.maskScaleY * maskWarpY,
      };
    }

    function traceBlobPath(ctx, grain, drawState, nowMs) {
      const time = nowMs * 0.001;
      const morphT = Math.min(Math.max(grain.blobMorphProgress, 0), 1);
      const pointCount = Math.min(
        grain.startBlobPoints?.length ?? 0,
        grain.targetBlobPoints?.length ?? 0
      );
      const points = Array.from({ length: pointCount }, (_, index) => {
        const startPoint = grain.startBlobPoints[index];
        const targetPoint = grain.targetBlobPoints[index];
        const angle =
          startPoint.angle + (targetPoint.angle - startPoint.angle) * morphT;
        const radiusBase =
          startPoint.radiusScale +
          (targetPoint.radiusScale - startPoint.radiusScale) * morphT;
        const wobblePhase =
          startPoint.wobblePhase +
          (targetPoint.wobblePhase - startPoint.wobblePhase) * morphT;
        const wobbleRate =
          startPoint.wobbleRate +
          (targetPoint.wobbleRate - startPoint.wobbleRate) * morphT;
        const wobbleDepth =
          startPoint.wobbleDepth +
          (targetPoint.wobbleDepth - startPoint.wobbleDepth) * morphT;
        const wobble =
          1 +
          Math.sin(time * wobbleRate + wobblePhase) *
            wobbleDepth;
        const radius = radiusBase * wobble;

        return {
          x: Math.cos(angle) * drawState.maskW * 0.5 * radius,
          y: Math.sin(angle) * drawState.maskH * 0.5 * radius,
        };
      });

      if (!points || points.length < 3) {
        ctx.ellipse(
          0,
          0,
          drawState.maskW * 0.5,
          drawState.maskH * 0.5,
          0,
          0,
          Math.PI * 2
        );
        return;
      }

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const firstMid = {
        x: (lastPoint.x + firstPoint.x) * 0.5,
        y: (lastPoint.y + firstPoint.y) * 0.5,
      };

      ctx.moveTo(firstMid.x, firstMid.y);

      for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const mid = {
          x: (current.x + next.x) * 0.5,
          y: (current.y + next.y) * 0.5,
        };

        ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
      }

      ctx.closePath();
    }

    function drawGrain(
      target,
      grain,
      sx,
      sy,
      nowMs,
      audioLevel,
      arpBoost,
      droneXfadeMix
    ) {
      const ctx = target.drawingContext;
      const imageSource = grain.sourceImage?.canvas || grain.sourceImage?.elt;
      const secondaryImageSource =
        grain.secondarySourceImage?.canvas || grain.secondarySourceImage?.elt;

      if (!imageSource) {
        return;
      }

      const drawState = getGrainDrawState(target, grain, nowMs, audioLevel);
      const crossfadeT = Math.min(
        1,
        Math.max(0, droneXfadeMix / Math.max(droneXfadeMaxMix, 0.001))
      );
      const baseAlpha = grain.alpha * (1 - crossfadeT);
      const secondaryAlpha = grain.alpha * crossfadeT;

      ctx.save();
      ctx.translate(drawState.x, drawState.y);
      ctx.rotate(drawState.rotation);
      ctx.beginPath();
      traceBlobPath(ctx, grain, drawState, nowMs);
      ctx.clip();
      if (baseAlpha > 0.001) {
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(
          imageSource,
          sx,
          sy,
          grain.w,
          grain.h,
          -drawState.drawW * 0.5,
          -drawState.drawH * 0.5,
          drawState.drawW,
          drawState.drawH
        );
      }

      if (secondaryAlpha > 0.001 && secondaryImageSource && grain.secondarySourceImage) {
        const mappedSample = mapSamplePositionToImage(
          grain.sourceImage,
          grain.secondarySourceImage,
          grain,
          sx,
          sy
        );
        ctx.globalAlpha = secondaryAlpha;
        ctx.drawImage(
          secondaryImageSource,
          mappedSample.sx,
          mappedSample.sy,
          grain.w,
          grain.h,
          -drawState.drawW * 0.5,
          -drawState.drawH * 0.5,
          drawState.drawW,
          drawState.drawH
        );
      }

      if (arpBoost > 0.04) {
        const overlayAlpha = Math.min(
          0.18,
          arpBoost * 0.05 * grain.arpOverlayStrength
        );
        const [r, g, b] = grain.arpOverlayColor;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${overlayAlpha})`;
        ctx.fillRect(
          -drawState.drawW * 0.5,
          -drawState.drawH * 0.5,
          drawState.drawW,
          drawState.drawH
        );
      }

      ctx.restore();
    }

    function drawLeadSmear(target, smear, nowMs, audioLevel, droneXfadeMix) {
      const { grain } = smear;
      const imageSource = grain.sourceImage?.canvas || grain.sourceImage?.elt;
      const secondaryImageSource =
        grain.secondarySourceImage?.canvas || grain.secondarySourceImage?.elt;

      if (!imageSource) {
        return;
      }

      const age = nowMs - smear.createdAt;
      const life = Math.min(Math.max(age / smear.duration, 0), 1);
      const fadeIn = Math.min(1, life / 0.18);
      const fadeOut = 1 - life;
      const alphaEnvelope = fadeIn * fadeOut * smear.alphaBoost;
      const drift = smear.driftDistance * life * smear.driftJitter;
      const baseDrawState = getGrainDrawState(target, grain, nowMs, audioLevel * 0.35);
      const targetScaleX = target.width / p.width;
      const targetScaleY = target.height / p.height;
      const stretch = 1 + smear.stretch * (1 - life * 0.45);
      const squeeze = smear.squash + (1 - smear.squash) * life * 0.35;
      const drawState = {
        x: baseDrawState.x + smear.directionX * drift * targetScaleX,
        y: baseDrawState.y + smear.directionY * drift * targetScaleY,
        rotation: grain.rotation,
        drawW: baseDrawState.drawW * stretch,
        drawH: baseDrawState.drawH * squeeze,
        maskW: baseDrawState.maskW * (0.92 + (stretch - 1) * 0.8),
        maskH: baseDrawState.maskH * (0.84 + (squeeze - 0.84) * 0.9),
      };
      const { sx, sy } = getGrainSamplePosition(grain);
      const crossfadeT = Math.min(
        1,
        Math.max(0, droneXfadeMix / Math.max(droneXfadeMaxMix, 0.001))
      );
      const baseAlpha = grain.alpha * alphaEnvelope * (1 - crossfadeT);
      const secondaryAlpha = grain.alpha * alphaEnvelope * crossfadeT;
      const ctx = target.drawingContext;

      ctx.save();
      ctx.translate(drawState.x, drawState.y);
      ctx.rotate(drawState.rotation);
      ctx.beginPath();
      traceBlobPath(ctx, grain, drawState, nowMs);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";

      if (baseAlpha > 0.001) {
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(
          imageSource,
          sx,
          sy,
          grain.w,
          grain.h,
          -drawState.drawW * 0.5,
          -drawState.drawH * 0.5,
          drawState.drawW,
          drawState.drawH
        );
      }

      if (secondaryAlpha > 0.001 && secondaryImageSource && grain.secondarySourceImage) {
        const mappedSample = mapSamplePositionToImage(
          grain.sourceImage,
          grain.secondarySourceImage,
          grain,
          sx,
          sy
        );
        ctx.globalAlpha = secondaryAlpha;
        ctx.drawImage(
          secondaryImageSource,
          mappedSample.sx,
          mappedSample.sy,
          grain.w,
          grain.h,
          -drawState.drawW * 0.5,
          -drawState.drawH * 0.5,
          drawState.drawW,
          drawState.drawH
        );
      }

      ctx.restore();
    }

    function makeGrainSheet(grainSize) {
      const stepX = grainSize * 0.5;
      const stepY = grainSize * 0.46;
      const startX = -grainSize * 0.25;
      const startY = -grainSize * 0.25;
      const endX = p.width + grainSize * 0.25;
      const endY = p.height + grainSize * 0.25;
      const grains = [];
      let rowIndex = 0;

      for (let y = startY; y <= endY; y += stepY) {
        const rowOffset = rowIndex % 2 === 0 ? 0 : stepX * 0.5;

        for (let x = startX + rowOffset; x <= endX; x += stepX) {
          const sizeScale = p.random(0.78, 1.18);
          const aspect = p.random(0.82, 1.22);
          const w = grainSize * sizeScale * aspect;
          const h = grainSize * sizeScale / aspect;
          const jitterX = p.random(-stepX * 0.22, stepX * 0.22);
          const jitterY = p.random(-stepY * 0.22, stepY * 0.22);
          const rotation = p.random(-0.28, 0.28);
          const grain = makeGrain(w, h, x + jitterX, y + jitterY, rotation);

          if (grain) {
            grains.push(grain);
          }
        }

        rowIndex += 1;
      }

      return grains;
    }

    p.setup = async () => {
      p.pixelDensity(1);
      const canvas = p.createCanvas(800, 500);
      canvasEl = canvas.elt;
      const bufferWidth = Math.max(1, Math.round(p.width * grainBufferScale));
      const bufferHeight = Math.max(1, Math.round(p.height * grainBufferScale));
      grainBuffer = p.createGraphics(bufferWidth, bufferHeight);
      echoBuffer = p.createGraphics(bufferWidth, bufferHeight);
      grainBuffer.pixelDensity(1);
      echoBuffer.pixelDensity(1);
      grainBuffer.drawingContext.imageSmoothingEnabled = true;
      echoBuffer.drawingContext.imageSmoothingEnabled = true;
      grainBuffer.clear();
      echoBuffer.clear();
      window.addEventListener("pointermove", handlePointerMove);
      cleanupPointerMove = () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };

      p.background("rgba(0, 0, 0, 10)");
      //p.noLoop();

      try {
        const loadedImages = await Promise.all(
          [...grainImageUrls, droneXfadeImageUrl].map((url) => p.loadImage(url))
        );
        sourceImages = loadedImages.slice(0, grainImageUrls.length);
        droneXfadeImage = loadedImages[loadedImages.length - 1];
      } catch (error) {
        console.error("Failed to load grain images", error);
      }

      lastX = p.mouseX;
      lastY = p.mouseY;
      lastSpeed = 0;
      lastControlTime = performance.now();
      createDroneXfadeClusters();
      testGrainSheet = makeGrainSheet(200);
      p.redraw();
    };

    p.draw = () => {
      const pointerInCanvas =
        p.mouseX >= 0 &&
        p.mouseX <= p.width &&
        p.mouseY >= 0 &&
        p.mouseY <= p.height;
      const currentX = Math.min(p.width, Math.max(0, p.mouseX));
      const currentY = Math.min(p.height, Math.max(0, p.mouseY));
      const mouseStateChanged = p.mouseIsPressed !== lastMouseDownState;

      if (p.mouseIsPressed && pointerInCanvas && !lastMouseDownState) {
        gestureActive = true;
        leadDragDistance = 0;
      }

      if (gestureActive && (p.mouseIsPressed || mouseStateChanged)) {
        sendControl(0, 0, "draw", currentX, currentY);
      }
      if (!p.mouseIsPressed) {
        gestureActive = false;
        leadDragDistance = 0;
      }
      lastMouseDownState = p.mouseIsPressed;

      p.background(0);
      if (!testGrainSheet) {
        return;
      }
      const now = p.millis();
      const dtMs = lastDrawTimeMs > 0 ? Math.min(now - lastDrawTimeMs, 80) : 16.67;
      lastDrawTimeMs = now;
      const rawAudioLevel = getAudioLevel ? getAudioLevel() : 0;
      const targetAudioLevel = Math.min(
        1,
        Math.pow(Math.max(0, rawAudioLevel), 0.55) * 1.2
      );
      const rawDrone2Level = getDrone2Level ? getDrone2Level() : 0;
      const targetDrone2Level = Math.min(
        1,
        Math.pow(Math.max(0, rawDrone2Level), 0.45) * 2.0
      );
      smoothedAudioLevel += (targetAudioLevel - smoothedAudioLevel) * 0.12;
      smoothedDrone2Level += (targetDrone2Level - smoothedDrone2Level) * 0.09;
      for (let i = activeArpPulses.length - 1; i >= 0; i -= 1) {
        if (now - activeArpPulses[i].createdAt >= activeArpPulses[i].duration) {
          activeArpPulses.splice(i, 1);
        }
      }
      for (let i = activeLeadSmears.length - 1; i >= 0; i -= 1) {
        if (now - activeLeadSmears[i].createdAt >= activeLeadSmears[i].duration) {
          activeLeadSmears.splice(i, 1);
        }
      }
      const droneXfadeClusterStates = getDroneXfadeClusterStates(now);
      echoFrameCounter += 1;
      const shouldRefreshEcho = echoFrameCounter % echoFrameStride === 0;

      grainBuffer.clear();
      grainBuffer.blendMode(p.BURN);
      echoBuffer.blendMode(p.BLEND);
      echoBuffer.noStroke();
      echoBuffer.fill(0, 0, 0, echoFadeAlpha);
      echoBuffer.rect(0, 0, echoBuffer.width, echoBuffer.height);

      for (let i = 0; i < testGrainSheet.length; i += 1) {
        const grain = testGrainSheet[i];
        updateGrainMotion(grain, dtMs);
        updateGrainBlobMorph(grain, dtMs);
        const arpBoost = getGrainArpBoost(grain, now);
        grain.droneXfadeInfluence = getDroneXfadeInfluence(
          grain,
          droneXfadeClusterStates
        );
        const morphRate = 1 + arpBoost;
        grain.morphProgress += (dtMs / grain.morphDuration) * morphRate;

        while (grain.morphProgress >= 1) {
          grain.morphProgress -= 1;
          setNextGrainTarget(grain);
        }

        const { sx, sy } = getGrainSamplePosition(grain);

        const droneXfadeMix =
          grain.droneXfadeInfluence * smoothedDrone2Level;
        drawGrain(
          grainBuffer,
          grain,
          sx,
          sy,
          now,
          smoothedAudioLevel,
          arpBoost,
          droneXfadeMix
        );
      }

      for (let i = 0; i < activeLeadSmears.length; i += 1) {
        const smear = activeLeadSmears[i];
        updateGrainBlobMorph(smear.grain, dtMs * 1.4);
        smear.grain.morphProgress += (dtMs / smear.grain.morphDuration) * 1.7;

        while (smear.grain.morphProgress >= 1) {
          smear.grain.morphProgress -= 1;
          setNextGrainTarget(smear.grain);
        }

        drawLeadSmear(
          grainBuffer,
          smear,
          now,
          smoothedAudioLevel,
          smear.grain.droneXfadeBias * smoothedDrone2Level * 0.18
        );
      }

      grainBuffer.blendMode(p.BLEND);

      {
        const echoCtx = echoBuffer.drawingContext;
        const grainImage = grainBuffer.canvas || grainBuffer.elt;

        if (shouldRefreshEcho) {
          echoCtx.save();
          echoCtx.globalAlpha = echoMixAlpha;
          echoCtx.globalCompositeOperation = "lighter";
          echoCtx.drawImage(grainImage, 0, 0, echoBuffer.width, echoBuffer.height);
          echoCtx.restore();
        }
      }

      {
        const mainCtx = p.drawingContext;
        mainCtx.save();
        mainCtx.imageSmoothingEnabled = true;
        mainCtx.filter = `blur(${echoBlurPx}px)`;
        p.image(echoBuffer, 0, 0, p.width, p.height);
        mainCtx.filter = `blur(${grainBlurPx}px)`;
        p.image(grainBuffer, 0, 0, p.width, p.height);
        mainCtx.filter = "none";
        mainCtx.restore();
      }

      p.blendMode(p.BLEND);
    };

    p.mousePressed = () => {
      const pointerInCanvas =
        p.mouseX >= 0 &&
        p.mouseX <= p.width &&
        p.mouseY >= 0 &&
        p.mouseY <= p.height;

      if (!pointerInCanvas || !onClick) {
        return;
      }

      onClick({
        x: Math.abs(p.mouseX / p.width),
        y: Math.abs(p.mouseY / p.height),
      });
    };
  }, containerEl);

  instance.registerArpPulse = (pulse) => {
    registerArpPulseFn(pulse);
  };

  const remove = instance.remove.bind(instance);
  instance.remove = () => {
    cleanupPointerMove();
    remove();
  };

  return instance;
}
