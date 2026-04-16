import p5 from "p5";

const grainImageUrl = new URL("./images/intricate.jpg", import.meta.url).href;

export function mountSketch(containerEl, onControl, onClick) {
  let cleanupPointerMove = () => {};

  const instance = new p5((p) => {
    let sourceImage = null;
    let canvasEl = null;
    let lastX = 0;
    let lastY = 0;
    let lastSpeed = 0;
    let lastControlTime = 0;
    let lastMouseDownState = false;
    let gestureActive = false;

    let testGrainSheet = null;

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

    function randomMorphDuration() {
      return p.random(1400, 3200);
    }

    function randomSamplePosition(w, h) {
      const maxSx = Math.max(0, sourceImage.width - w);
      const maxSy = Math.max(0, sourceImage.height - h);

      return {
        sx: p.random(0, maxSx),
        sy: p.random(0, maxSy),
      };
    }

    function setNextGrainTarget(grain, now) {
      grain.startSx = grain.targetSx;
      grain.startSy = grain.targetSy;

      const nextTarget = randomSamplePosition(grain.w, grain.h);
      grain.targetSx = nextTarget.sx;
      grain.targetSy = nextTarget.sy;
      grain.morphStartTime = now;
      grain.morphDuration = randomMorphDuration();
    }

    function makeGrain(w, h, x, y, rotation) {
      if (!sourceImage) {
        return;
      }

      const startSample = randomSamplePosition(w, h);
      const targetSample = randomSamplePosition(w, h);
      const morphDuration = randomMorphDuration();

      return {
        w,
        h,
        x,
        y,
        rotation,
        startSx: startSample.sx,
        startSy: startSample.sy,
        targetSx: targetSample.sx,
        targetSy: targetSample.sy,
        morphStartTime: p.millis() - p.random(0, morphDuration),
        morphDuration,
      };
    }

    function drawGrain(grain, sx, sy) {
      if (!grain.rotation) {
        p.image(
          sourceImage,
          grain.x - grain.w * 0.5,
          grain.y - grain.h * 0.5,
          grain.w,
          grain.h,
          sx,
          sy,
          grain.w,
          grain.h
        );
        return;
      }

      p.push();
      p.translate(grain.x, grain.y);
      p.rotate(grain.rotation);
      p.image(
        sourceImage,
        -grain.w * 0.5,
        -grain.h * 0.5,
        grain.w,
        grain.h,
        sx,
        sy,
        grain.w,
        grain.h
      );
      p.pop();
    }

    function makeGrainSheet(grainSize) {
      const cols = Math.ceil(p.width / (grainSize / 2));
      const rows = Math.ceil(p.height / (grainSize / 2));

      let grains = [];

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * (grainSize / 2);
          const y = j * (grainSize / 2);

          const grain = makeGrain(grainSize, grainSize, x, y, 0);
          grains.push(grain);
        }
      }
      return grains;
    }

    p.setup = async () => {
      const canvas = p.createCanvas(800, 500);
      canvasEl = canvas.elt;
      window.addEventListener("pointermove", handlePointerMove);
      cleanupPointerMove = () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };

      p.background("rgba(0, 0, 0, 10)");
      //p.noLoop();

      try {
        sourceImage = await p.loadImage(grainImageUrl);
      } catch (error) {
        console.error("Failed to load grain image", error);
      }

      lastX = p.mouseX;
      lastY = p.mouseY;
      lastSpeed = 0;
      lastControlTime = performance.now();
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
      }

      if (gestureActive && (p.mouseIsPressed || mouseStateChanged)) {
        sendControl(0, 0, "draw", currentX, currentY);
      }
      if (!p.mouseIsPressed) {
        gestureActive = false;
      }
      lastMouseDownState = p.mouseIsPressed;

      p.background(0);
      if (!testGrainSheet) {
        return;
      }
      const now = p.millis();

      p.blendMode(p.ADD);
      p.tint(255, 80);

      for (let i = 0; i < testGrainSheet.length; i += 1) {
        const grain = testGrainSheet[i];
        let t = (now - grain.morphStartTime) / grain.morphDuration;

        if (t >= 1) {
          setNextGrainTarget(grain, now);
          t = 0;
        }

        const morphAmount = Math.min(Math.max(t, 0), 1);
        const maxSx = Math.max(0, sourceImage.width - grain.w);
        const maxSy = Math.max(0, sourceImage.height - grain.h);
        const sx = Math.min(
          maxSx,
          Math.max(
            0,
            grain.startSx + morphAmount * (grain.targetSx - grain.startSx)
          )
        );
        const sy = Math.min(
          maxSy,
          Math.max(
            0,
            grain.startSy + morphAmount * (grain.targetSy - grain.startSy)
          )
        );

        drawGrain(grain, sx, sy);
      }

      p.noTint();
      p.blendMode(p.BLEND);
    };

    p.mouseClicked = () => {
      if (onClick) {
        onClick({
          x: Math.abs(p.mouseX / p.width),
          y: Math.abs(p.mouseY / p.height),
        });
      }
    };
  }, containerEl);

  const remove = instance.remove.bind(instance);
  instance.remove = () => {
    cleanupPointerMove();
    remove();
  };

  return instance;
}
