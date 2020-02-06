const Render = require("./render.js");
const ResourceLoader = require("./resource-loader.js");
const AnimationManager = require("./animation-manager");

const fps = 60;
const fpsInterval = 1000 / fps;
const dt = 1.0 / fps;

let lastFrameTime = 0;
let lastFPSUpdateTime = 0;
let currentFPS = 0;

function tick() {

    const now = Date.now();

    const elapsedSinceLastFrame = now - lastFrameTime;
    if (elapsedSinceLastFrame >= fpsInterval || true) {

        lastFrameTime = now - (elapsedSinceLastFrame % fpsInterval);

        AnimationManager.advance(dt);
        AnimationManager.drawAnimations();

        currentFPS++;
    }

    const fpsUpdateInterval = 1000;
    const elapsedSinceLastFPSUpdate = now - lastFPSUpdateTime;
    if (elapsedSinceLastFPSUpdate >= fpsUpdateInterval) {

        lastFPSUpdateTime = now - (elapsedSinceLastFPSUpdate % fpsUpdateInterval);

        document.title = currentFPS + " FPS";

        currentFPS = 0;
    }

    window.requestAnimationFrame(tick);
}

function loaded() {

    const canvas = document.getElementById("game-surface");
    Render.setScreenSize(canvas.width, canvas.height);

    AnimationManager.initialize();

    const size = 64;
    const spacing = 1.0;

    for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++) {
            const instance = AnimationManager.createAnimationInstance(-x * spacing, y * spacing, 0);
            instance.setAnimation("new_walk");
        }

    // setInterval(tick, 0);
    window.requestAnimationFrame(tick);
}

if (!Render.initialize()) {
    // TODO show message about not being able to draw
    return;
}

// TODO show some loading screen

ResourceLoader.initialize(loaded);