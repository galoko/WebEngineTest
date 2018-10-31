const Render = require("./render.js");
const ResourceLoader = require("./resource_loader.js");
const AnimationManager = require("./animation_manager");

let gl;

const fps = 60;
const fpsInterval = 1000 / fps;
const dt = 1.0 / fps;

let lastFrameTime = 0;

function tick() {

    const now = Date.now();
    const elapsed = now - lastFrameTime;

    if (elapsed > fpsInterval) {

        lastFrameTime = now - (elapsed % fpsInterval);

        AnimationManager.advance(dt);
        AnimationManager.drawAnimations();
    }
}

function loaded() {

    const canvas = document.getElementById("game-surface");

    Render.initialize(gl);
    Render.setScreenSize(canvas.width, canvas.height);

    AnimationManager.initialize();

    const size = 64;
    const spacing = 1.0;

    for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++) {
            const instance = AnimationManager.createAnimationInstance(-x * spacing, y * spacing, 0);
            instance.setAnimation("new_walk");
        }

    setInterval(tick, 0);
}

function setupWebGL() {

    const canvas = document.getElementById('game-surface');
    gl = canvas.getContext('webgl');

    if (!gl) {
        console.log('WebGL not supported, falling back on experimental-webgl');
        gl = canvas.getContext('experimental-webgl');
    }

    if (!gl) {
        alert('Your browser does not support WebGL');
        return;
    }

    // alert(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));

    // TODO show some loading screen

    ResourceLoader.initialize(gl, loaded);
}

setupWebGL();
