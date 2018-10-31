const Render = require("./render.js");
const RenderUtils = require("./render_utils");
const ResourceLoader = require("./resource_loader.js");
const Character = require("./character.js").Character;

const vec3 = require('gl-matrix').vec3;
const quat = require('gl-matrix').quat;
const mat4 = require('gl-matrix').mat4;
const glMatrix = require('gl-matrix').glMatrix;

const databaseTexSize = 256;
let database;
let animations;

let char;
let parentRotations, parentOffsets;

let instancesMapPixels, instancesMap;

let instances;

const instancesTexSize = 64;

let Projection, View;

let PositionsX, PositionsY, PositionsZ;
let PositionsXPixels, PositionsYPixels, PositionsZPixels;

function initialize() {

    loadAnimations();

    setupCharacterTemplate();

    createAnimationTextures();

    instances = [];

    setupScene();
}

function setupScene() {

    Projection =  mat4.create();
    mat4.perspective(Projection, glMatrix.toRadian(60), Render.getAspectRatio(), 0.1, 1000.0);

    View =  mat4.create();
    mat4.lookAt(View, [2, -2.57, 7.42], [0, -0.5, 5.5], [0, 0, 1]);
}

function loadAnimations() {

    database = ResourceLoader.getDatabase();
    const animationsArray = ResourceLoader.getDatabaseMap().content.animations;

    animations = new Map();

    animationsArray.forEach(function (animation) {

        let stride = animation.keyframes.length;
        if (stride > 1)
            stride++;

        animation.stride = stride;

        animations.set(animation.name, animation);
    });
}

function setupCharacterTemplate() {

    char = new Character();
}

function createAnimationTextures() {

    const quatIdentity = quat.fromValues(0, 0, 0, 1);
    const vecIdentity = vec3.fromValues(0, 0, 0);

    const quatIdentityPixel = RenderUtils.quat_to_pixel(quatIdentity);
    const vecIdentityPixel = RenderUtils.vec_to_pixel(vecIdentity);

    parentRotations = [];
    parentOffsets = [];

    for (let boneId = -1; boneId < char.bones.size; boneId++) {
        parentRotations[1 + boneId] = ResourceLoader.createTextureWithData(instancesTexSize, true,
            RenderUtils.duplicatePixel(instancesTexSize, quatIdentityPixel));
        parentOffsets[1 + boneId] = ResourceLoader.createTextureWithData(instancesTexSize, true,
            RenderUtils.duplicatePixel(instancesTexSize, vecIdentityPixel));
    }

    instancesMap = ResourceLoader.createTexture(instancesTexSize, true);
    instancesMapPixels = new Uint8Array(instancesTexSize * instancesTexSize * 4);

    PositionsX = ResourceLoader.createTexture(instancesTexSize, true);
    PositionsY = ResourceLoader.createTexture(instancesTexSize, true);
    PositionsZ = ResourceLoader.createTexture(instancesTexSize, true);

    PositionsXPixels = new Uint8Array(instancesTexSize * instancesTexSize * 4);
    PositionsYPixels = new Uint8Array(instancesTexSize * instancesTexSize * 4);
    PositionsZPixels = new Uint8Array(instancesTexSize * instancesTexSize * 4);
}

function writeRGBA(dest, index, r, g, b, a) {

    dest[index    ] = r;
    dest[index + 1] = g;
    dest[index + 2] = b;
    dest[index + 3] = a;
}

function writeFloat(dest, index, f) {

    let Value = Math.round(f * 1000.0);

    const a = Value < 0 ?  0 : 0xFF;

    Value = Math.abs(Value);

    const r = (Value >>  0) & 0xFF;
    const g = (Value >>  8) & 0xFF;
    const b = (Value >> 16) & 0xFF;

    writeRGBA(dest, index, r, g, b, a);
}

function fillInstancesMap() {

    let index = 0;

    instances.forEach(function (instance) {

        const animation = instance.animation;

        const start_pixel = animation.pixel_start;

        const x = start_pixel % databaseTexSize + instance.state; // x = 0..255
        const y = Math.floor(start_pixel / databaseTexSize); // 0..255 (should be)
        const z = RenderUtils.t_to_color(Math.min(instance.t * (256.0 / 255.0), 1));
        const w = animation.stride - 1;

        writeRGBA(instancesMapPixels, index, x, y, z, w);
        writeFloat(PositionsXPixels, index, instance.pos[0]);
        writeFloat(PositionsYPixels, index, instance.pos[1]);
        writeFloat(PositionsZPixels, index, instance.pos[2]);

        index += 4;
    });

    ResourceLoader.updateTexture(instancesMap, instancesTexSize, instancesMapPixels);

    ResourceLoader.updateTexture(PositionsX, instancesTexSize, PositionsXPixels);
    ResourceLoader.updateTexture(PositionsY, instancesTexSize, PositionsYPixels);
    ResourceLoader.updateTexture(PositionsZ, instancesTexSize, PositionsZPixels);
}

function advance(dt) {

    instances.forEach(function (instance) {

        instance.state = 1;

        instance.t += dt;
        instance.t = instance.t % 1.0;
    });
}

function calculateQuat(bone) {

    const parent = parentRotations[1 + bone.parentId];
    const output = parentRotations[1 + bone.id];

    Render.computeQuats(bone.id, database, instancesMap, parent, output);

    bone.childs.forEach(function (child) {
        calculateQuat(child);
    });
}

function calculateOffset(bone) {

    const rotation = parentRotations[1 + bone.parentId];
    const parent = parentOffsets[1 + bone.parentId];
    const output = parentOffsets[1 + bone.id];

    Render.computeOffsets(bone.boneOffset, rotation, parent, output);

    bone.childs.forEach(function (child) {
        calculateOffset(child);
    });
}

function drawInstances(bone) {

    const offsets = parentOffsets[1 + bone.id];
    const rotations = parentRotations[1 + bone.id];

    Render.drawInstances(rotations, offsets, bone.size, bone.middleTranslation, instances.length);

    bone.childs.forEach(function (child) {
        drawInstances(child);
    });
}

function drawAnimations() {

    fillInstancesMap();

    calculateQuat(char.pelvis);
    calculateOffset(char.pelvis);

    Render.setupScene(Projection, View);

    Render.setupPositions(PositionsX, PositionsY, PositionsZ);

    drawInstances(char.pelvis);
}

function findAnimationByName(name) {

    const animation = animations.get(name);

    if (animation !== undefined)
        return animation;
    else
        return null;
}

function createAnimationInstance(x, y, z) {

    const instance = new AnimationInstance(x, y, z);

    instances.push(instance);

    return instance;
}

function AnimationInstance(x, y, z) {
    this.animation = null;
    this.t = 0.0;
    this.state = 0;
    this.pos = vec3.fromValues(x, y, z);
}

AnimationInstance.prototype.setAnimation = function (name) {

    this.animation = findAnimationByName(name);
    this.t = 0.0;
    this.state = 0;
};

module.exports.initialize = initialize;
module.exports.createAnimationInstance = createAnimationInstance;
module.exports.advance = advance;
module.exports.drawAnimations = drawAnimations;