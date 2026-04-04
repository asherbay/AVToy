import p5 from "p5";

export function mountSketch(containerEl, onControl, onClick) {
  return new p5((p) => {


    function randShape(numPoints, sHeight, sWidth) {
      var s = [];
      for (var i = 0; i < numPoints; i++) {
        s.push([p.random(sWidth * 1), p.random(sHeight * 1)]);
      }
      return s;
    }
    function blob() {      
      var shape = randShape(10, p.height, p.width);
      p.noFill();
      p.stroke(255);
      p.beginShape();
      for (var i = 0; i < shape.length; i++) {
        var s = shape[i];
        p.curveVertex(s[0], s[1]);
      }
      p.endShape(p.CLOSE);
    }



    let lastX = 0;
    let lastY = 0;

    p.setup = () => {
      p.createCanvas(800, 500);
      p.background(0);
      lastX = p.mouseX;
      lastY = p.mouseY;
    };

    p.draw = () => {
      p.fill(0, 20);
      p.noStroke();
      p.rect(0, 0, p.width, p.height);
      
      // mouse velocity
      const dx = p.mouseX - lastX;
      const dy = p.mouseY - lastY;
      const speed = Math.sqrt(dx * dx + dy * dy);

      // simple visual
      p.stroke(255);
      p.point(p.mouseX, p.mouseY);

      // send controls to audio
      if (onControl) {
        onControl({
          x: p.mouseX / p.width,       // 0..1
          y: p.mouseY / p.height,      // 0..1
          speed: Math.min(speed / 50, 1), // roughly 0..1
          mouseDown: p.mouseIsPressed,
        });
      }

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
}
