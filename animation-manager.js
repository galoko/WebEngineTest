const Render = require("./render.js");
const ResourceLoader = require("./resource-loader.js");
const Character = require("./character.js").Character;

const vec3 = require('gl-matrix').vec3;
const quat = require('gl-matrix').quat;
const mat4 = require('gl-matrix').mat4;
const glMatrix = require('gl-matrix').glMatrix;

let gl;

const relativeRotationsTexSize = 256;
let relativeRotationsTexture;

// templates
let char;
let animations;

// this number actually hard coded into the shaders and the render as of right now
// so if you're gonna change this make sure to adjust everything else
const instancesTexSize = 64;

let instancesMapPixels, instancesMap;
let parentRotations, parentOffsets;

const maxCharacters = instancesTexSize * instancesTexSize;

let positions;

// instances
let instances;

// why the fuck is it here?
// TODO move this somewhere, something like input-manager or GUI-manager or something
let projection, view;

function initialize() {

    gl = Render.getGL();

    setupCharacterTemplate();

    loadAnimations();

    createAnimationTextures();

    instances = [];

    setupScene();
}

function setupScene() {

    projection =  mat4.create();
    mat4.perspective(projection, glMatrix.toRadian(60), Render.getAspectRatio(), 0.1, 1000.0);

    view =  mat4.create();
    mat4.lookAt(view, [2, -2.57, 7.42], [0, -0.5, 5.5], [0, 0, 1]);
    // mat4.lookAt(view, [2, -2.57, 0], [0, -0, 0], [0, 0, 1]);
    // mat4.lookAt(view, [2, -2.57, 7.42], [0, -100.5, 0.5], [0, 0, 1]);
}

function loadAnimations() {

    const database = ResourceLoader.getDatabase();
    const databaseAnimations = database.content.animations;

    animations = new Map();

    const pixelSize = relativeRotationsTexSize * relativeRotationsTexSize;
    const relativeRotationsPixels = new Float32Array(pixelSize * 4);
    let currentPixel = 0;

    const bonesCount = char.getBoneCount();

    // iterate over all animations
    databaseAnimations.forEach(function (animation) {

        animation.stride = animation.keyframes.length + 1;

        const pixelWidth = animation.stride * bonesCount;
        if (pixelWidth > relativeRotationsTexSize) {
            console.warn(animation.name + " have too many keyframes and was not loaded");
            return;
        }

        const pixelX = currentPixel % relativeRotationsTexSize;
        const rowRemaining = relativeRotationsTexSize - pixelX;
        if (pixelWidth > rowRemaining)
            currentPixel += rowRemaining;

        if (currentPixel >= pixelSize) {
            console.warn("Database is full and " + animation.name + " was not loaded");
            return;
        }

        animation.startPixel = currentPixel;
        animation.startPixelX = currentPixel % relativeRotationsTexSize;
        animation.startPixelY = Math.floor(currentPixel / relativeRotationsTexSize);

        // filling float pixels with quaternions
        for (let keyFrameIndex = 0; keyFrameIndex <= animation.keyframes.length; keyFrameIndex++) {

            const keyframe = animation.keyframes[keyFrameIndex === animation.keyframes.length ? 0 : keyFrameIndex];

            for (let boneIndex = 0; boneIndex < animation.bones.length; boneIndex++) {

                const boneName = animation.bones[boneIndex];
                const boneId = char.getBoneIdByName(boneName);
                if (boneId === -1) {
                    console.warn("Didn't find bone " + boneName);
                    continue;
                }

                const rotation = keyframe.rotations[boneIndex];

                const destPixel =
                    animation.startPixel +
                    boneId * animation.stride +
                    keyFrameIndex;

                relativeRotationsPixels[destPixel * 4    ] = rotation.x;
                relativeRotationsPixels[destPixel * 4 + 1] = rotation.y;
                relativeRotationsPixels[destPixel * 4 + 2] = rotation.z;
                relativeRotationsPixels[destPixel * 4 + 3] = rotation.w;
            }
        }

        animations.set(animation.name, animation);

        currentPixel += pixelWidth;
    });

    relativeRotationsTexture = ResourceLoader.createTextureWithData(relativeRotationsTexSize, false, true, false,
        relativeRotationsPixels);

    instancesMap = ResourceLoader.createTexture(instancesTexSize, true, true, false);
    instancesMapPixels = new Float32Array(instancesTexSize * instancesTexSize * 4);
}

function setupCharacterTemplate() {

    char = new Character();
}

function duplicate4FloatValuesSq(size, x, y, z, w) {

    size *= size;

    const result = new Float32Array(size * 4);

    for (let num = 0; num < size; num++) {

        result[num * 4    ] = x;
        result[num * 4 + 1] = y;
        result[num * 4 + 2] = z;
        result[num * 4 + 3] = w;
    }

    return result;
}

function createAnimationTextures() {

    parentRotations = [];
    parentOffsets = [];

    for (let boneId = -1; boneId < char.bones.size; boneId++) {
        parentRotations[1 + boneId] = ResourceLoader.createTextureWithData(instancesTexSize, true, true, true,
            duplicate4FloatValuesSq(instancesTexSize, 0, 0, 0, 1));
        parentOffsets[1 + boneId] = ResourceLoader.createTextureWithData(instancesTexSize, true, true, true,
            duplicate4FloatValuesSq(instancesTexSize, 0, 0, 0, 0));
    }

    positions = new Float32Array(maxCharacters * 3);

    const instanceCoords = new Float32Array(maxCharacters * 2);
    let instanceCoordIndex = 0;
    for (let y = 0; y < instancesTexSize; y++) {

        const coordY = (y + 0.5) / instancesTexSize;

        for (let x = 0; x < instancesTexSize; x++) {

            const coordX = (x + 0.5) / instancesTexSize;

            instanceCoords[instanceCoordIndex    ] = coordX;
            instanceCoords[instanceCoordIndex + 1] = coordY;
            instanceCoordIndex += 2;
        }
    }

    Render.setupInstanceCoords(instanceCoords);
}

function fillPerInstanceData() {

    let instancesIndex = 0;
    let positionsIndex = 0;

    instances.forEach(function (instance) {

        const animation = instance.animation;

        const texCoordX = (0.5 + animation.startPixelX + instance.state + instance.t) / relativeRotationsTexSize;
        const texCoordY = (0.5 + animation.startPixelY) / relativeRotationsTexSize;
        const boneStride = animation.stride / relativeRotationsTexSize;

        instancesMapPixels[instancesIndex    ] = texCoordX;
        instancesMapPixels[instancesIndex + 1] = texCoordY;
        instancesMapPixels[instancesIndex + 2] = boneStride;
        /*
         * TODO if any problems with animation because of linear interpolation of quaternions will occur
         * then we can use this 4th color channel to store t separately and perform SLERP by ourselves
         * using two per pixel texture lookups, it's unused as for right now
         * instancesMapPixels[index + 3] = instance.t;
         */
        instancesIndex += 4;

        positions[positionsIndex    ] = instance.pos[0];
        positions[positionsIndex + 1] = instance.pos[1];
        positions[positionsIndex + 2] = instance.pos[2];
        positionsIndex += 3;
    });

    ResourceLoader.updateTexture(instancesMap, instancesTexSize, true, false, instancesMapPixels);

    Render.setupPositions(positions);
}

function advance(dt) {

    instances.forEach(function (instance) {

        // TODO this stuff property

        instance.state = 1;

        instance.t += dt;
        instance.t = instance.t % 1.0;
    });
}

function calculateQuat(bone) {

    const parent = parentRotations[1 + bone.parentId];
    const output = parentRotations[1 + bone.id];

    Render.computeQuats(bone.id, relativeRotationsTexture, instancesMap, parent, output);

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

    fillPerInstanceData();

    calculateQuat(char.pelvis);
    calculateOffset(char.pelvis);

    Render.setupScene(projection, view);

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