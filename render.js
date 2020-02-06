const shaders = require("./shaders.js");
const RawData = require("./raw-data");

let gl;
let ANGLE;
let screenWidth, screenHeight;

function initialize() {

    const success =
        setupGL() &&
        setupExtensions() &&
        setupStaticSettings() &&
        compileShaders() &&
        setupPrimitives();

    return success;
}

function glEnumToString(gl, value) {
    // Optimization for the most common enum:
    if (value === gl.NO_ERROR) {
        return "NO_ERROR";
    }
    for (const p in gl) {
        if (gl[p] === value) {
            return p;
        }
    }
    return "0x" + value.toString(16);
}

function createGLErrorWrapper(context, fname) {
    return function() {
        const rv = context[fname].apply(context, arguments);
        const err = context.getError();
        if (err !== context.NO_ERROR)
            throw "GL error " + glEnumToString(context, err) + " in " + fname;
        return rv;
    };
}

function create3DContextWithWrapperThatThrowsOnGLError(context) {

    const wrap = {};
    for (const i in context) {
        try {
            if (typeof context[i] === 'function') {
                wrap[i] = createGLErrorWrapper(context, i);
            } else {
                wrap[i] = context[i];
            }
        } catch (e) {
            error("createContextWrapperThatThrowsOnGLError: Error accessing " + i);
        }
    }
    wrap.getError = function() {
        return context.getError();
    };
    return wrap;
}

function setupGL() {

    const canvas = document.getElementById('game-surface');

    gl = canvas.getContext('webgl');
    if (!gl)
        gl = canvas.getContext('experimental-webgl');

    if (!gl)
        return false;

    // gl = create3DContextWithWrapperThatThrowsOnGLError(gl);

    return true;
}

function getGL() {
    return gl;
}

function setupExtensions() {

    ANGLE = gl.getExtension("ANGLE_instanced_arrays");
    if (!ANGLE)
        return false;

    if (!gl.getExtension("OES_texture_float"))
        return false;

    if (!gl.getExtension("OES_texture_float_linear"))
        return false;

    return true;
}

function setScreenSize(width, height) {
    screenWidth = width;
    screenHeight = height;
}

function getAspectRatio() {
    return screenWidth / screenHeight;
}

function setupStaticSettings() {

    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    return true;
}

let frameBuffer;
let primitivesBuffer, instanceCoordsBuffer, positionsBuffer;
let screenTriangleStart, screenTriangleSize, cubeStart, cubeSize;

function setupPrimitives() {

    frameBuffer = gl.createFramebuffer();

    const data = new Float32Array(RawData.data);

    screenTriangleStart = RawData.screenTriangleStart;
    screenTriangleSize = RawData.screenTriangleSize;

    cubeStart = RawData.cubeStart;
    cubeSize = RawData.cubeSize;

    primitivesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, primitivesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    let index;

    index = gl.getAttribLocation(sceneShader.program, "vertexPosition");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        3,
        gl.FLOAT,
        gl.FALSE,
        8 * Float32Array.BYTES_PER_ELEMENT,
        0
    );

    index = gl.getAttribLocation(sceneShader.program, "texCoord");
    // remove this when texCoord wouldn't be optimized away (e.g. will be used)
    if (index !== -1) {
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(
            index,
            2,
            gl.FLOAT,
            gl.FALSE,
            8 * Float32Array.BYTES_PER_ELEMENT,
            3 * Float32Array.BYTES_PER_ELEMENT
        );
    }

    index = gl.getAttribLocation(sceneShader.program, "vertexNormal");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        3,
        gl.FLOAT,
        gl.FALSE,
        8 * Float32Array.BYTES_PER_ELEMENT,
        5 * Float32Array.BYTES_PER_ELEMENT
    );

    instanceCoordsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceCoordsBuffer);

    index = gl.getAttribLocation(sceneShader.program, "instanceCoord");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        2,
        gl.FLOAT,
        gl.FALSE,
        2 * Float32Array.BYTES_PER_ELEMENT,
        0
    );
    ANGLE.vertexAttribDivisorANGLE(index, 1);

    positionsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);

    index = gl.getAttribLocation(sceneShader.program, "rootPosition");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        3,
        gl.FLOAT,
        gl.FALSE,
        3 * Float32Array.BYTES_PER_ELEMENT,
        0
    );
    ANGLE.vertexAttribDivisorANGLE(index, 1);

    return true;
}

// shared

let quatMulShader, offsetAddShader, sceneShader, texOutputShader;

function compileShaders() {

    // quaternion multiplication

    quatMulShader = compileShader("quaternion multiplication", shaders.quaternionMultiplicationVertexShader,
        shaders.quaternionMultiplicationFragmentShader, ['relativeRotations', 'instances', 'parentRotations', 'boneId']);

    quatMulShader.use();
    gl.uniform1i(quatMulShader.relativeRotations, 0);
    gl.uniform1i(quatMulShader.instances, 1);
    gl.uniform1i(quatMulShader.parentRotations, 2);

    // offset add

    offsetAddShader = compileShader("offset add", shaders.offsetRotatitionAndAdditionVertexShader,
        shaders.offsetRotatitionAndAdditionFragmentShader, ['rotations', 'parentOffsets', 'boneOffset']);

    offsetAddShader.use();
    gl.uniform1i(offsetAddShader.rotations, 0);
    gl.uniform1i(offsetAddShader.parentOffsets, 1);

    // scene

    sceneShader = compileShader("scene", shaders.sceneVertexShader, shaders.sceneFragmentShader,
        ['rotations', 'offsets', 'projection', 'view', 'size', 'middleTranslation']);

    sceneShader.use();
    gl.uniform1i(sceneShader.rotations, 0);
    gl.uniform1i(sceneShader.offsets, 1);

    // texture output

    texOutputShader = compileShader("texture output", shaders.textureOutputVertexShader,
        shaders.textureOutputFragmentShader, ['inputTex', 'invOutputSize']);

    texOutputShader.use();
    gl.uniform1i(texOutputShader.inputTex, 0);

    return true;
}

// render utils

function setupFlatRender() {
    gl.disable(gl.DEPTH_TEST);
}

function setup3DRender() {
    gl.enable(gl.DEPTH_TEST);
}

function setupRenderToTexture(texOut, texWidth, texHeight) {

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texOut, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.viewport(0, 0, texWidth, texHeight);
}

function setupRenderToFrontBuffer() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenWidth, screenHeight);
}

// specific render modes

function computeQuats(boneId, relativeRotations, instances, parentRotations, outputRotations) {

    quatMulShader.use();

    setupFlatRender();
    setupRenderToTexture(outputRotations, 64, 64);

    gl.uniform1f(quatMulShader.boneId, boneId);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, relativeRotations);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, instances);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, parentRotations);

    drawFlat();
}

function computeOffsets(offset, rotations, parentOffsets, outputOffsets) {

    offsetAddShader.use();

    setupFlatRender();
    setupRenderToTexture(outputOffsets, 64, 64);

    gl.uniform3fv(offsetAddShader.boneOffset, offset);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rotations);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, parentOffsets);

    drawFlat();
}

function drawFlat() {
    gl.drawArrays(gl.TRIANGLES, screenTriangleStart, screenTriangleSize);
}

function clear() {
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function setupScene(projection, view) {

    sceneShader.use();

    setup3DRender();
    setupRenderToFrontBuffer();

    gl.uniformMatrix4fv(sceneShader.projection, gl.FALSE, projection);
    gl.uniformMatrix4fv(sceneShader.view, gl.FALSE, view);

    clear();
}

function setupInstanceCoords(data) {
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceCoordsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function setupPositions(data) {
    gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
}

function drawInstances(rotations, offsets, size, middleTranslation, instancesCount) {

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rotations);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, offsets);

    gl.uniform3fv(sceneShader.size, size);
    gl.uniform3fv(sceneShader.middleTranslation, middleTranslation);

    ANGLE.drawArraysInstancedANGLE(gl.TRIANGLES, cubeStart, cubeSize, instancesCount);
}

function drawTexture(tex) {

    texOutputShader.use();

    setupFlatRender();
    setupRenderToFrontBuffer();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.uniform1f(texOutputShader.invOutputSize, 1.0 / screenWidth);

    drawFlat();
}

function compileShader(name, vertexShaderCode, fragmentShaderCode, uniforms) {

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

    gl.shaderSource(vertexShader, vertexShaderCode);
    gl.shaderSource(fragmentShader, fragmentShaderCode);

    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('ERROR compiling vertex shader for ' + name + '!', gl.getShaderInfoLog(vertexShader));
        return;
    }

    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('ERROR compiling fragment shader for ' + name + '!', gl.getShaderInfoLog(fragmentShader));
        return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('ERROR linking program!', gl.getProgramInfoLog(program));
        return;
    }
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error('ERROR validating program!', gl.getProgramInfoLog(program));
        return;
    }

    const instance = {
        program: program,

        use: function () {
            gl.useProgram(this.program);
        }
    };

    uniforms.forEach(function (uniform) {
        instance[uniform] = gl.getUniformLocation(program, uniform);
    });

    return instance;
}

module.exports.initialize = initialize;
module.exports.getGL = getGL;
module.exports.setScreenSize = setScreenSize;
module.exports.getAspectRatio = getAspectRatio;
module.exports.computeQuats = computeQuats;
module.exports.computeOffsets = computeOffsets;
module.exports.setupScene = setupScene;
module.exports.setupInstanceCoords = setupInstanceCoords;
module.exports.setupPositions = setupPositions;
module.exports.drawInstances = drawInstances;
module.exports.drawTexture = drawTexture;