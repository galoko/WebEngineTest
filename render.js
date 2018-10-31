const shaders = require("./shaders.js");
const RawData = require("./raw_data");

let gl;
let screenWidth, screenHeight;

function initialize(_gl) {

    gl = _gl;

    // var ext = gl.getExtension("ANGLE_instanced_arrays"); // Vendor prefixes may apply!
    // alert(ext);

    setupStaticSettings();
    compileShaders();
    setupPrimitives();
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
}

let frameBuffer;
let screenTriangleStart, screenTriangleSize, cubeStart, cubeSize;

function checkGLError() {

    const error = gl.getError();
    if (error !== gl.NO_ERROR)
        alert("WebGL Error: " + error);
}

function writeData(srcData, srcPosition, srcCount, dstData, dstPosition, instanceX, instanceY) {

    for (let i = 0; i < srcCount; i++) {

        for (let j = 0; j < 6; j++)
            dstData[dstPosition++] = srcData[srcPosition++];

        dstData[dstPosition++] = instanceX;
        dstData[dstPosition++] = instanceY;
    }

    return dstPosition;
}

function setupPrimitives() {

    frameBuffer = gl.createFramebuffer();

    const texSize = 64;
    const bufferStride = 8;
    const templateData = RawData.data;
    const data = new Float32Array((RawData.screenTriangleSize + RawData.cubeSize * texSize * texSize) * bufferStride);

    let position = 0;

    screenTriangleStart = position / bufferStride;
    screenTriangleSize = RawData.screenTriangleSize;
    position = writeData(templateData, RawData.screenTriangleStart * 6, screenTriangleSize, data, position, 0, 0);

    cubeStart = position / bufferStride;
    cubeSize = RawData.cubeSize;

    for (let y = 0; y < texSize; y++)
        for (let x = 0; x < texSize; x++) {

            const instanceX = (x / texSize) + (0.5 / texSize);
            const instanceY = (y / texSize) + (0.5 / texSize);

            position = writeData(templateData, RawData.cubeStart * 6, cubeSize, data, position, instanceX, instanceY);
        }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    let index;

    index = gl.getAttribLocation(sceneShader.program, "VertexPosition");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        3,
        gl.FLOAT,
        gl.FALSE,
        8 * Float32Array.BYTES_PER_ELEMENT,
        0
    );

    index = gl.getAttribLocation(sceneShader.program, "VertexNormal");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        3,
        gl.FLOAT,
        gl.FALSE,
        8 * Float32Array.BYTES_PER_ELEMENT,
        3 * Float32Array.BYTES_PER_ELEMENT
    );

    index = gl.getAttribLocation(sceneShader.program, "InstanceCoord");
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
        index,
        2,
        gl.FLOAT,
        gl.FALSE,
        8 * Float32Array.BYTES_PER_ELEMENT,
        6 * Float32Array.BYTES_PER_ELEMENT
    );
}

// shared

let quatMulShader, offsetAddShader, sceneShader, texOutputShader;

function compileShaders() {

    // quaternion multiplication

    quatMulShader = compileShader("quaternion multiplication", shaders.quaternionMultiplicationVertexShader,
        shaders.quaternionMultiplicationFragmentShader, ['database', 'instances', 'parentRotations', 'boneId']);

    quatMulShader.use();
    gl.uniform1i(quatMulShader.database, 0);
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
        ['Rotations', 'Offsets', 'PositionsX', 'PositionsY', 'PositionsZ', 'Projection', 'View', 'Size', 'MiddleTranslation']);

    sceneShader.use();
    gl.uniform1i(sceneShader.Rotations, 0);
    gl.uniform1i(sceneShader.Offsets, 1);
    gl.uniform1i(sceneShader.PositionsX, 2);
    gl.uniform1i(sceneShader.PositionsY, 3);
    gl.uniform1i(sceneShader.PositionsZ, 4);

    // texture output

    texOutputShader = compileShader("texture output", shaders.textureOutputVertexShader,
        shaders.textureOutputFragmentShader, ['inputTex', 'invOutputSize']);

    texOutputShader.use();
    gl.uniform1i(texOutputShader.inputTex, 0);
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

function computeQuats(boneId, database, instances, parentRotations, outputRotations) {

    quatMulShader.use();

    setupFlatRender();
    setupRenderToTexture(outputRotations, 64, 64);

    gl.uniform1f(quatMulShader.boneId, boneId);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, database);
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

function setupScene(Projection, View) {

    sceneShader.use();

    setup3DRender();
    setupRenderToFrontBuffer();

    gl.uniformMatrix4fv(sceneShader.Projection, gl.FALSE, Projection);
    gl.uniformMatrix4fv(sceneShader.View, gl.FALSE, View);

    clear();
}

function setupPositions(X, Y, Z) {

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, X);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, Y);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, Z);
}

function drawInstances(Rotations, Offsets, Size, MiddleTranslation, InstancesCount) {

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, Rotations);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, Offsets);

    gl.uniform3fv(sceneShader.Size, Size);
    gl.uniform3fv(sceneShader.MiddleTranslation, MiddleTranslation);

    gl.drawArrays(gl.TRIANGLES, cubeStart, cubeSize * InstancesCount);
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
module.exports.setScreenSize = setScreenSize;
module.exports.getAspectRatio = getAspectRatio;
module.exports.computeQuats = computeQuats;
module.exports.computeOffsets = computeOffsets;
module.exports.setupScene = setupScene;
module.exports.setupPositions = setupPositions;
module.exports.drawInstances = drawInstances;
module.exports.drawTexture = drawTexture;