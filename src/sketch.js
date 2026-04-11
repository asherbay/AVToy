import p5 from "p5";

export function mountSketch(containerEl, onControl, onClick) {
  let cleanupPointerMove = () => {};
  const instance = new p5((p) => {


    



    let lastX = 0;
    let lastY = 0;
    let lastSpeed = 0;
    let lastControlTime = 0;

    let canvasEl = null;

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
        x: x / p.width,       // 0..1
        y: y / p.height,      // 0..1
        speed: speedNorm, // roughly 0..1
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

    p.setup = () => {
      const canvas = p.createCanvas(800, 500);
      canvasEl = canvas.elt;
      window.addEventListener("pointermove", handlePointerMove);
      cleanupPointerMove = () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };
      p.background(0);
      lastX = p.mouseX;
      lastY = p.mouseY;
      lastSpeed = 0;
      lastControlTime = performance.now();
    };

    p.draw = () => {
      p.fill(0, 20);
      p.noStroke();
      p.rect(0, 0, p.width, p.height);
      
      // mouse velocity
      const dx = p.mouseX - lastX;
      const dy = p.mouseY - lastY;

      // simple visual
      p.stroke(255);
      p.point(p.mouseX, p.mouseY);

      // send controls to audio
      sendControl(dx, dy);

      lastX = p.mouseX;
      lastY = p.mouseY;
      blob()
    };

    p.mouseClicked = () => {
      console.log("mouse clicked");

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
