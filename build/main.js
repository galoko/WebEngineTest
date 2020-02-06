(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
},{"./character.js":2,"./render.js":6,"./resource-loader.js":7,"gl-matrix":4}],2:[function(require,module,exports){
const vec3 = require('gl-matrix').vec3;

function Bone(id, name, offset, tail, size, parent) {

    this.id = id;
    this.name = name;

    this.offset = offset;
    this.tail = tail;
    this.size = size;

    this.childs = [];

    this.parent = parent;
    if (this.parent !== null)
        this.parent.childs.push(this);

    this.boneOffset = null;
    this.middleTranslation = null;
    this.parentId = -1;

    this.calculateIndirectValues();
}

Bone.prototype.calculateIndirectValues = function () {

    let offset;
    if (this.parent !== null) {

        offset = vec3.create();
        vec3.mul(offset, this.offset, this.parent.size);
    }
    else
        offset = vec3.fromValues(0, 0, 0);

    this.boneOffset = offset;

    const half = vec3.fromValues(0.5, 0.5, 0.5);
    const middleTranslation = vec3.create();
    vec3.mul(middleTranslation, this.tail, this.size);
    vec3.mul(middleTranslation, middleTranslation, half);

    this.middleTranslation = middleTranslation;

    if (this.parent !== null)
        this.parentId = this.parent.id;
    else
        this.parentId = -1;
};

function Character() {

    this.nextBoneID = 0;
    this.bones = new Map();
    this.pelvis = null;

    this.generateBones();
}

function arrayToVec3(a) {
    return vec3.fromValues(a[0], a[1], a[2]);
}

Character.prototype.generateBone = function (parent, tail, size, offset, name) {

    const cmToMeters = 0.01;

    const sizeInMeters = vec3.create();
    vec3.mul(sizeInMeters, arrayToVec3(size), vec3.fromValues(cmToMeters, cmToMeters, cmToMeters));

    const result = new Bone(this.nextBoneID++, name, arrayToVec3(offset), arrayToVec3(tail), sizeInMeters, parent);

    this.bones.set(result.name, result);

    return result;
};

Character.prototype.generateRightSide = function (leftBone, rightParent) {

    const mirrorVector = vec3.fromValues(1, -1, 1);

    const originalName = leftBone.name;
    this.bones.delete(originalName);

    leftBone.name = "Left " + originalName;

    const rightOffset = vec3.create();
    vec3.mul(rightOffset, leftBone.offset, mirrorVector);

    const rightTail = vec3.create();
    vec3.mul(rightTail, leftBone.tail, mirrorVector);

    const rightBone = new Bone(this.nextBoneID++, "Right " + originalName, rightOffset, rightTail,
        leftBone.size, rightParent);

    this.bones.set(leftBone.name, leftBone);
    this.bones.set(rightBone.name, rightBone);

    leftBone.childs.forEach(function(leftChild) {
        this.generateRightSide(leftChild, rightBone);
    }, this);
};

Character.prototype.generateBones = function () {

    this.pelvis = this.generateBone(null, [ 0, 0, 1 ], [ 6.5, 13.0, 17.6 ], [ 0, 0, 0 ], "Pelvis");
    const stomach = this.generateBone(this.pelvis, [ 0, 0, 1 ], [ 6.5, 13, 17.6 ], [ 0, 0, 1 ], "Stomach");
    const chest = this.generateBone(stomach, [ 0, 0, 1 ], [ 6.5, 13, 17.6 ], [ 0, 0, 1 ], "Chest");

    const neck = this.generateBone(chest, [ 0, 0, 1 ], [ 3, 3, 15 ], [ 0, 0, 1 ], "Neck");
    const head = this.generateBone(neck, [ 0, 0, 0 ], [ 15, 15, 20 ], [ 0, 0, 1 ], "Head");

    const upperLeg = this.generateBone(this.pelvis, [ 0, 0, -1 ], [ 6.5, 6.5, 46 ], [ 0, 0.5, 0 ], "Upper Leg");
    const lowerLeg = this.generateBone(upperLeg, [ 0, 0, -1 ], [ 6.49, 6.49, 45 ], [ 0, 0, -1 ], "Lower Leg");
    const foot = this.generateBone(lowerLeg, [ 15.5 / 22, 0, 0 ], [ 22, 8, 3 ], [ 0, 0, -1.175 ], "Foot");

    this.generateRightSide(upperLeg, upperLeg.parent);

    const upperArm = this.generateBone(chest, [ 0, 1, 0 ], [ 4.5, 32, 4.5 ], [ 0, 0.85, 1 ], "Upper Arm");
    const lowerArm = this.generateBone(upperArm, [ 0, 1, 0 ], [ 4.49, 28, 4.49 ], [ 0, 1, 0 ], "Lower Arm",);
    const hand = this.generateBone(lowerArm, [ 0, 1, 0 ], [ 3.5, 15, 1.5 ], [ 0, 1, 0 ], "Hand");

    this.generateRightSide(upperArm, upperArm.parent);
};

Character.prototype.getBoneIdByName = function (name) {

    const bone = this.bones.get(name);

    return (bone ? bone.id : -1);
};

Character.prototype.getBoneCount = function () {

    return this.bones.size;
};

module.exports.Character = Character;
},{"gl-matrix":4}],3:[function(require,module,exports){
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
},{"./animation-manager":1,"./render.js":6,"./resource-loader.js":7}],4:[function(require,module,exports){
/*!
@fileoverview gl-matrix - High performance matrix and vector operations
@author Brandon Jones
@author Colin MacKenzie IV
@version 2.7.0

Copyright (c) 2015-2018, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
!function(t,n){if("object"==typeof exports&&"object"==typeof module)module.exports=n();else if("function"==typeof define&&define.amd)define([],n);else{var r=n();for(var a in r)("object"==typeof exports?exports:t)[a]=r[a]}}("undefined"!=typeof self?self:this,function(){return function(t){var n={};function r(a){if(n[a])return n[a].exports;var e=n[a]={i:a,l:!1,exports:{}};return t[a].call(e.exports,e,e.exports,r),e.l=!0,e.exports}return r.m=t,r.c=n,r.d=function(t,n,a){r.o(t,n)||Object.defineProperty(t,n,{enumerable:!0,get:a})},r.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},r.t=function(t,n){if(1&n&&(t=r(t)),8&n)return t;if(4&n&&"object"==typeof t&&t&&t.__esModule)return t;var a=Object.create(null);if(r.r(a),Object.defineProperty(a,"default",{enumerable:!0,value:t}),2&n&&"string"!=typeof t)for(var e in t)r.d(a,e,function(n){return t[n]}.bind(null,e));return a},r.n=function(t){var n=t&&t.__esModule?function(){return t.default}:function(){return t};return r.d(n,"a",n),n},r.o=function(t,n){return Object.prototype.hasOwnProperty.call(t,n)},r.p="",r(r.s=10)}([function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.setMatrixArrayType=function(t){n.ARRAY_TYPE=t},n.toRadian=function(t){return t*e},n.equals=function(t,n){return Math.abs(t-n)<=a*Math.max(1,Math.abs(t),Math.abs(n))};var a=n.EPSILON=1e-6;n.ARRAY_TYPE="undefined"!=typeof Float32Array?Float32Array:Array,n.RANDOM=Math.random;var e=Math.PI/180},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.forEach=n.sqrLen=n.len=n.sqrDist=n.dist=n.div=n.mul=n.sub=void 0,n.create=e,n.clone=function(t){var n=new a.ARRAY_TYPE(4);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n},n.fromValues=function(t,n,r,e){var u=new a.ARRAY_TYPE(4);return u[0]=t,u[1]=n,u[2]=r,u[3]=e,u},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t},n.set=function(t,n,r,a,e){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t},n.subtract=u,n.multiply=o,n.divide=i,n.ceil=function(t,n){return t[0]=Math.ceil(n[0]),t[1]=Math.ceil(n[1]),t[2]=Math.ceil(n[2]),t[3]=Math.ceil(n[3]),t},n.floor=function(t,n){return t[0]=Math.floor(n[0]),t[1]=Math.floor(n[1]),t[2]=Math.floor(n[2]),t[3]=Math.floor(n[3]),t},n.min=function(t,n,r){return t[0]=Math.min(n[0],r[0]),t[1]=Math.min(n[1],r[1]),t[2]=Math.min(n[2],r[2]),t[3]=Math.min(n[3],r[3]),t},n.max=function(t,n,r){return t[0]=Math.max(n[0],r[0]),t[1]=Math.max(n[1],r[1]),t[2]=Math.max(n[2],r[2]),t[3]=Math.max(n[3],r[3]),t},n.round=function(t,n){return t[0]=Math.round(n[0]),t[1]=Math.round(n[1]),t[2]=Math.round(n[2]),t[3]=Math.round(n[3]),t},n.scale=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t},n.scaleAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t[3]=n[3]+r[3]*a,t},n.distance=s,n.squaredDistance=c,n.length=f,n.squaredLength=M,n.negate=function(t,n){return t[0]=-n[0],t[1]=-n[1],t[2]=-n[2],t[3]=-n[3],t},n.inverse=function(t,n){return t[0]=1/n[0],t[1]=1/n[1],t[2]=1/n[2],t[3]=1/n[3],t},n.normalize=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=r*r+a*a+e*e+u*u;o>0&&(o=1/Math.sqrt(o),t[0]=r*o,t[1]=a*o,t[2]=e*o,t[3]=u*o);return t},n.dot=function(t,n){return t[0]*n[0]+t[1]*n[1]+t[2]*n[2]+t[3]*n[3]},n.lerp=function(t,n,r,a){var e=n[0],u=n[1],o=n[2],i=n[3];return t[0]=e+a*(r[0]-e),t[1]=u+a*(r[1]-u),t[2]=o+a*(r[2]-o),t[3]=i+a*(r[3]-i),t},n.random=function(t,n){var r,e,u,o,i,s;n=n||1;do{r=2*a.RANDOM()-1,e=2*a.RANDOM()-1,i=r*r+e*e}while(i>=1);do{u=2*a.RANDOM()-1,o=2*a.RANDOM()-1,s=u*u+o*o}while(s>=1);var c=Math.sqrt((1-i)/s);return t[0]=n*r,t[1]=n*e,t[2]=n*u*c,t[3]=n*o*c,t},n.transformMat4=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3];return t[0]=r[0]*a+r[4]*e+r[8]*u+r[12]*o,t[1]=r[1]*a+r[5]*e+r[9]*u+r[13]*o,t[2]=r[2]*a+r[6]*e+r[10]*u+r[14]*o,t[3]=r[3]*a+r[7]*e+r[11]*u+r[15]*o,t},n.transformQuat=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=r[0],i=r[1],s=r[2],c=r[3],f=c*a+i*u-s*e,M=c*e+s*a-o*u,h=c*u+o*e-i*a,l=-o*a-i*e-s*u;return t[0]=f*c+l*-o+M*-s-h*-i,t[1]=M*c+l*-i+h*-o-f*-s,t[2]=h*c+l*-s+f*-i-M*-o,t[3]=n[3],t},n.str=function(t){return"vec4("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+")"},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=n[0],s=n[1],c=n[2],f=n[3];return Math.abs(r-i)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(i))&&Math.abs(e-s)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(s))&&Math.abs(u-c)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(c))&&Math.abs(o-f)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(f))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(){var t=new a.ARRAY_TYPE(4);return a.ARRAY_TYPE!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0,t[3]=0),t}function u(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t[3]=n[3]-r[3],t}function o(t,n,r){return t[0]=n[0]*r[0],t[1]=n[1]*r[1],t[2]=n[2]*r[2],t[3]=n[3]*r[3],t}function i(t,n,r){return t[0]=n[0]/r[0],t[1]=n[1]/r[1],t[2]=n[2]/r[2],t[3]=n[3]/r[3],t}function s(t,n){var r=n[0]-t[0],a=n[1]-t[1],e=n[2]-t[2],u=n[3]-t[3];return Math.sqrt(r*r+a*a+e*e+u*u)}function c(t,n){var r=n[0]-t[0],a=n[1]-t[1],e=n[2]-t[2],u=n[3]-t[3];return r*r+a*a+e*e+u*u}function f(t){var n=t[0],r=t[1],a=t[2],e=t[3];return Math.sqrt(n*n+r*r+a*a+e*e)}function M(t){var n=t[0],r=t[1],a=t[2],e=t[3];return n*n+r*r+a*a+e*e}n.sub=u,n.mul=o,n.div=i,n.dist=s,n.sqrDist=c,n.len=f,n.sqrLen=M,n.forEach=function(){var t=e();return function(n,r,a,e,u,o){var i=void 0,s=void 0;for(r||(r=4),a||(a=0),s=e?Math.min(e*r+a,n.length):n.length,i=a;i<s;i+=r)t[0]=n[i],t[1]=n[i+1],t[2]=n[i+2],t[3]=n[i+3],u(t,t,o),n[i]=t[0],n[i+1]=t[1],n[i+2]=t[2],n[i+3]=t[3];return n}}()},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.forEach=n.sqrLen=n.len=n.sqrDist=n.dist=n.div=n.mul=n.sub=void 0,n.create=e,n.clone=function(t){var n=new a.ARRAY_TYPE(3);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n},n.length=u,n.fromValues=o,n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t},n.set=function(t,n,r,a){return t[0]=n,t[1]=r,t[2]=a,t},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t},n.subtract=i,n.multiply=s,n.divide=c,n.ceil=function(t,n){return t[0]=Math.ceil(n[0]),t[1]=Math.ceil(n[1]),t[2]=Math.ceil(n[2]),t},n.floor=function(t,n){return t[0]=Math.floor(n[0]),t[1]=Math.floor(n[1]),t[2]=Math.floor(n[2]),t},n.min=function(t,n,r){return t[0]=Math.min(n[0],r[0]),t[1]=Math.min(n[1],r[1]),t[2]=Math.min(n[2],r[2]),t},n.max=function(t,n,r){return t[0]=Math.max(n[0],r[0]),t[1]=Math.max(n[1],r[1]),t[2]=Math.max(n[2],r[2]),t},n.round=function(t,n){return t[0]=Math.round(n[0]),t[1]=Math.round(n[1]),t[2]=Math.round(n[2]),t},n.scale=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t},n.scaleAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t},n.distance=f,n.squaredDistance=M,n.squaredLength=h,n.negate=function(t,n){return t[0]=-n[0],t[1]=-n[1],t[2]=-n[2],t},n.inverse=function(t,n){return t[0]=1/n[0],t[1]=1/n[1],t[2]=1/n[2],t},n.normalize=l,n.dot=v,n.cross=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=r[0],i=r[1],s=r[2];return t[0]=e*s-u*i,t[1]=u*o-a*s,t[2]=a*i-e*o,t},n.lerp=function(t,n,r,a){var e=n[0],u=n[1],o=n[2];return t[0]=e+a*(r[0]-e),t[1]=u+a*(r[1]-u),t[2]=o+a*(r[2]-o),t},n.hermite=function(t,n,r,a,e,u){var o=u*u,i=o*(2*u-3)+1,s=o*(u-2)+u,c=o*(u-1),f=o*(3-2*u);return t[0]=n[0]*i+r[0]*s+a[0]*c+e[0]*f,t[1]=n[1]*i+r[1]*s+a[1]*c+e[1]*f,t[2]=n[2]*i+r[2]*s+a[2]*c+e[2]*f,t},n.bezier=function(t,n,r,a,e,u){var o=1-u,i=o*o,s=u*u,c=i*o,f=3*u*i,M=3*s*o,h=s*u;return t[0]=n[0]*c+r[0]*f+a[0]*M+e[0]*h,t[1]=n[1]*c+r[1]*f+a[1]*M+e[1]*h,t[2]=n[2]*c+r[2]*f+a[2]*M+e[2]*h,t},n.random=function(t,n){n=n||1;var r=2*a.RANDOM()*Math.PI,e=2*a.RANDOM()-1,u=Math.sqrt(1-e*e)*n;return t[0]=Math.cos(r)*u,t[1]=Math.sin(r)*u,t[2]=e*n,t},n.transformMat4=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=r[3]*a+r[7]*e+r[11]*u+r[15];return o=o||1,t[0]=(r[0]*a+r[4]*e+r[8]*u+r[12])/o,t[1]=(r[1]*a+r[5]*e+r[9]*u+r[13])/o,t[2]=(r[2]*a+r[6]*e+r[10]*u+r[14])/o,t},n.transformMat3=function(t,n,r){var a=n[0],e=n[1],u=n[2];return t[0]=a*r[0]+e*r[3]+u*r[6],t[1]=a*r[1]+e*r[4]+u*r[7],t[2]=a*r[2]+e*r[5]+u*r[8],t},n.transformQuat=function(t,n,r){var a=r[0],e=r[1],u=r[2],o=r[3],i=n[0],s=n[1],c=n[2],f=e*c-u*s,M=u*i-a*c,h=a*s-e*i,l=e*h-u*M,v=u*f-a*h,d=a*M-e*f,b=2*o;return f*=b,M*=b,h*=b,l*=2,v*=2,d*=2,t[0]=i+f+l,t[1]=s+M+v,t[2]=c+h+d,t},n.rotateX=function(t,n,r,a){var e=[],u=[];return e[0]=n[0]-r[0],e[1]=n[1]-r[1],e[2]=n[2]-r[2],u[0]=e[0],u[1]=e[1]*Math.cos(a)-e[2]*Math.sin(a),u[2]=e[1]*Math.sin(a)+e[2]*Math.cos(a),t[0]=u[0]+r[0],t[1]=u[1]+r[1],t[2]=u[2]+r[2],t},n.rotateY=function(t,n,r,a){var e=[],u=[];return e[0]=n[0]-r[0],e[1]=n[1]-r[1],e[2]=n[2]-r[2],u[0]=e[2]*Math.sin(a)+e[0]*Math.cos(a),u[1]=e[1],u[2]=e[2]*Math.cos(a)-e[0]*Math.sin(a),t[0]=u[0]+r[0],t[1]=u[1]+r[1],t[2]=u[2]+r[2],t},n.rotateZ=function(t,n,r,a){var e=[],u=[];return e[0]=n[0]-r[0],e[1]=n[1]-r[1],e[2]=n[2]-r[2],u[0]=e[0]*Math.cos(a)-e[1]*Math.sin(a),u[1]=e[0]*Math.sin(a)+e[1]*Math.cos(a),u[2]=e[2],t[0]=u[0]+r[0],t[1]=u[1]+r[1],t[2]=u[2]+r[2],t},n.angle=function(t,n){var r=o(t[0],t[1],t[2]),a=o(n[0],n[1],n[2]);l(r,r),l(a,a);var e=v(r,a);return e>1?0:e<-1?Math.PI:Math.acos(e)},n.str=function(t){return"vec3("+t[0]+", "+t[1]+", "+t[2]+")"},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=n[0],i=n[1],s=n[2];return Math.abs(r-o)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(o))&&Math.abs(e-i)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(i))&&Math.abs(u-s)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(s))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(){var t=new a.ARRAY_TYPE(3);return a.ARRAY_TYPE!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t}function u(t){var n=t[0],r=t[1],a=t[2];return Math.sqrt(n*n+r*r+a*a)}function o(t,n,r){var e=new a.ARRAY_TYPE(3);return e[0]=t,e[1]=n,e[2]=r,e}function i(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t}function s(t,n,r){return t[0]=n[0]*r[0],t[1]=n[1]*r[1],t[2]=n[2]*r[2],t}function c(t,n,r){return t[0]=n[0]/r[0],t[1]=n[1]/r[1],t[2]=n[2]/r[2],t}function f(t,n){var r=n[0]-t[0],a=n[1]-t[1],e=n[2]-t[2];return Math.sqrt(r*r+a*a+e*e)}function M(t,n){var r=n[0]-t[0],a=n[1]-t[1],e=n[2]-t[2];return r*r+a*a+e*e}function h(t){var n=t[0],r=t[1],a=t[2];return n*n+r*r+a*a}function l(t,n){var r=n[0],a=n[1],e=n[2],u=r*r+a*a+e*e;return u>0&&(u=1/Math.sqrt(u),t[0]=n[0]*u,t[1]=n[1]*u,t[2]=n[2]*u),t}function v(t,n){return t[0]*n[0]+t[1]*n[1]+t[2]*n[2]}n.sub=i,n.mul=s,n.div=c,n.dist=f,n.sqrDist=M,n.len=u,n.sqrLen=h,n.forEach=function(){var t=e();return function(n,r,a,e,u,o){var i=void 0,s=void 0;for(r||(r=3),a||(a=0),s=e?Math.min(e*r+a,n.length):n.length,i=a;i<s;i+=r)t[0]=n[i],t[1]=n[i+1],t[2]=n[i+2],u(t,t,o),n[i]=t[0],n[i+1]=t[1],n[i+2]=t[2];return n}}()},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.setAxes=n.sqlerp=n.rotationTo=n.equals=n.exactEquals=n.normalize=n.sqrLen=n.squaredLength=n.len=n.length=n.lerp=n.dot=n.scale=n.mul=n.add=n.set=n.copy=n.fromValues=n.clone=void 0,n.create=s,n.identity=function(t){return t[0]=0,t[1]=0,t[2]=0,t[3]=1,t},n.setAxisAngle=c,n.getAxisAngle=function(t,n){var r=2*Math.acos(n[3]),e=Math.sin(r/2);e>a.EPSILON?(t[0]=n[0]/e,t[1]=n[1]/e,t[2]=n[2]/e):(t[0]=1,t[1]=0,t[2]=0);return r},n.multiply=f,n.rotateX=function(t,n,r){r*=.5;var a=n[0],e=n[1],u=n[2],o=n[3],i=Math.sin(r),s=Math.cos(r);return t[0]=a*s+o*i,t[1]=e*s+u*i,t[2]=u*s-e*i,t[3]=o*s-a*i,t},n.rotateY=function(t,n,r){r*=.5;var a=n[0],e=n[1],u=n[2],o=n[3],i=Math.sin(r),s=Math.cos(r);return t[0]=a*s-u*i,t[1]=e*s+o*i,t[2]=u*s+a*i,t[3]=o*s-e*i,t},n.rotateZ=function(t,n,r){r*=.5;var a=n[0],e=n[1],u=n[2],o=n[3],i=Math.sin(r),s=Math.cos(r);return t[0]=a*s+e*i,t[1]=e*s-a*i,t[2]=u*s+o*i,t[3]=o*s-u*i,t},n.calculateW=function(t,n){var r=n[0],a=n[1],e=n[2];return t[0]=r,t[1]=a,t[2]=e,t[3]=Math.sqrt(Math.abs(1-r*r-a*a-e*e)),t},n.slerp=M,n.random=function(t){var n=a.RANDOM(),r=a.RANDOM(),e=a.RANDOM(),u=Math.sqrt(1-n),o=Math.sqrt(n);return t[0]=u*Math.sin(2*Math.PI*r),t[1]=u*Math.cos(2*Math.PI*r),t[2]=o*Math.sin(2*Math.PI*e),t[3]=o*Math.cos(2*Math.PI*e),t},n.invert=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=r*r+a*a+e*e+u*u,i=o?1/o:0;return t[0]=-r*i,t[1]=-a*i,t[2]=-e*i,t[3]=u*i,t},n.conjugate=function(t,n){return t[0]=-n[0],t[1]=-n[1],t[2]=-n[2],t[3]=n[3],t},n.fromMat3=h,n.fromEuler=function(t,n,r,a){var e=.5*Math.PI/180;n*=e,r*=e,a*=e;var u=Math.sin(n),o=Math.cos(n),i=Math.sin(r),s=Math.cos(r),c=Math.sin(a),f=Math.cos(a);return t[0]=u*s*f-o*i*c,t[1]=o*i*f+u*s*c,t[2]=o*s*c-u*i*f,t[3]=o*s*f+u*i*c,t},n.str=function(t){return"quat("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+")"};var a=i(r(0)),e=i(r(5)),u=i(r(2)),o=i(r(1));function i(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}function s(){var t=new a.ARRAY_TYPE(4);return a.ARRAY_TYPE!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t[3]=1,t}function c(t,n,r){r*=.5;var a=Math.sin(r);return t[0]=a*n[0],t[1]=a*n[1],t[2]=a*n[2],t[3]=Math.cos(r),t}function f(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=r[0],s=r[1],c=r[2],f=r[3];return t[0]=a*f+o*i+e*c-u*s,t[1]=e*f+o*s+u*i-a*c,t[2]=u*f+o*c+a*s-e*i,t[3]=o*f-a*i-e*s-u*c,t}function M(t,n,r,e){var u=n[0],o=n[1],i=n[2],s=n[3],c=r[0],f=r[1],M=r[2],h=r[3],l=void 0,v=void 0,d=void 0,b=void 0,m=void 0;return(v=u*c+o*f+i*M+s*h)<0&&(v=-v,c=-c,f=-f,M=-M,h=-h),1-v>a.EPSILON?(l=Math.acos(v),d=Math.sin(l),b=Math.sin((1-e)*l)/d,m=Math.sin(e*l)/d):(b=1-e,m=e),t[0]=b*u+m*c,t[1]=b*o+m*f,t[2]=b*i+m*M,t[3]=b*s+m*h,t}function h(t,n){var r=n[0]+n[4]+n[8],a=void 0;if(r>0)a=Math.sqrt(r+1),t[3]=.5*a,a=.5/a,t[0]=(n[5]-n[7])*a,t[1]=(n[6]-n[2])*a,t[2]=(n[1]-n[3])*a;else{var e=0;n[4]>n[0]&&(e=1),n[8]>n[3*e+e]&&(e=2);var u=(e+1)%3,o=(e+2)%3;a=Math.sqrt(n[3*e+e]-n[3*u+u]-n[3*o+o]+1),t[e]=.5*a,a=.5/a,t[3]=(n[3*u+o]-n[3*o+u])*a,t[u]=(n[3*u+e]+n[3*e+u])*a,t[o]=(n[3*o+e]+n[3*e+o])*a}return t}n.clone=o.clone,n.fromValues=o.fromValues,n.copy=o.copy,n.set=o.set,n.add=o.add,n.mul=f,n.scale=o.scale,n.dot=o.dot,n.lerp=o.lerp;var l=n.length=o.length,v=(n.len=l,n.squaredLength=o.squaredLength),d=(n.sqrLen=v,n.normalize=o.normalize);n.exactEquals=o.exactEquals,n.equals=o.equals,n.rotationTo=function(){var t=u.create(),n=u.fromValues(1,0,0),r=u.fromValues(0,1,0);return function(a,e,o){var i=u.dot(e,o);return i<-.999999?(u.cross(t,n,e),u.len(t)<1e-6&&u.cross(t,r,e),u.normalize(t,t),c(a,t,Math.PI),a):i>.999999?(a[0]=0,a[1]=0,a[2]=0,a[3]=1,a):(u.cross(t,e,o),a[0]=t[0],a[1]=t[1],a[2]=t[2],a[3]=1+i,d(a,a))}}(),n.sqlerp=function(){var t=s(),n=s();return function(r,a,e,u,o,i){return M(t,a,o,i),M(n,e,u,i),M(r,t,n,2*i*(1-i)),r}}(),n.setAxes=function(){var t=e.create();return function(n,r,a,e){return t[0]=a[0],t[3]=a[1],t[6]=a[2],t[1]=e[0],t[4]=e[1],t[7]=e[2],t[2]=-r[0],t[5]=-r[1],t[8]=-r[2],d(n,h(n,t))}}()},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.sub=n.mul=void 0,n.create=function(){var t=new a.ARRAY_TYPE(16);a.ARRAY_TYPE!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0);return t[0]=1,t[5]=1,t[10]=1,t[15]=1,t},n.clone=function(t){var n=new a.ARRAY_TYPE(16);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n[4]=t[4],n[5]=t[5],n[6]=t[6],n[7]=t[7],n[8]=t[8],n[9]=t[9],n[10]=t[10],n[11]=t[11],n[12]=t[12],n[13]=t[13],n[14]=t[14],n[15]=t[15],n},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],t},n.fromValues=function(t,n,r,e,u,o,i,s,c,f,M,h,l,v,d,b){var m=new a.ARRAY_TYPE(16);return m[0]=t,m[1]=n,m[2]=r,m[3]=e,m[4]=u,m[5]=o,m[6]=i,m[7]=s,m[8]=c,m[9]=f,m[10]=M,m[11]=h,m[12]=l,m[13]=v,m[14]=d,m[15]=b,m},n.set=function(t,n,r,a,e,u,o,i,s,c,f,M,h,l,v,d,b){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t[4]=u,t[5]=o,t[6]=i,t[7]=s,t[8]=c,t[9]=f,t[10]=M,t[11]=h,t[12]=l,t[13]=v,t[14]=d,t[15]=b,t},n.identity=e,n.transpose=function(t,n){if(t===n){var r=n[1],a=n[2],e=n[3],u=n[6],o=n[7],i=n[11];t[1]=n[4],t[2]=n[8],t[3]=n[12],t[4]=r,t[6]=n[9],t[7]=n[13],t[8]=a,t[9]=u,t[11]=n[14],t[12]=e,t[13]=o,t[14]=i}else t[0]=n[0],t[1]=n[4],t[2]=n[8],t[3]=n[12],t[4]=n[1],t[5]=n[5],t[6]=n[9],t[7]=n[13],t[8]=n[2],t[9]=n[6],t[10]=n[10],t[11]=n[14],t[12]=n[3],t[13]=n[7],t[14]=n[11],t[15]=n[15];return t},n.invert=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=n[6],c=n[7],f=n[8],M=n[9],h=n[10],l=n[11],v=n[12],d=n[13],b=n[14],m=n[15],p=r*i-a*o,P=r*s-e*o,A=r*c-u*o,E=a*s-e*i,O=a*c-u*i,R=e*c-u*s,y=f*d-M*v,q=f*b-h*v,x=f*m-l*v,_=M*b-h*d,Y=M*m-l*d,L=h*m-l*b,S=p*L-P*Y+A*_+E*x-O*q+R*y;if(!S)return null;return S=1/S,t[0]=(i*L-s*Y+c*_)*S,t[1]=(e*Y-a*L-u*_)*S,t[2]=(d*R-b*O+m*E)*S,t[3]=(h*O-M*R-l*E)*S,t[4]=(s*x-o*L-c*q)*S,t[5]=(r*L-e*x+u*q)*S,t[6]=(b*A-v*R-m*P)*S,t[7]=(f*R-h*A+l*P)*S,t[8]=(o*Y-i*x+c*y)*S,t[9]=(a*x-r*Y-u*y)*S,t[10]=(v*O-d*A+m*p)*S,t[11]=(M*A-f*O-l*p)*S,t[12]=(i*q-o*_-s*y)*S,t[13]=(r*_-a*q+e*y)*S,t[14]=(d*P-v*E-b*p)*S,t[15]=(f*E-M*P+h*p)*S,t},n.adjoint=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=n[6],c=n[7],f=n[8],M=n[9],h=n[10],l=n[11],v=n[12],d=n[13],b=n[14],m=n[15];return t[0]=i*(h*m-l*b)-M*(s*m-c*b)+d*(s*l-c*h),t[1]=-(a*(h*m-l*b)-M*(e*m-u*b)+d*(e*l-u*h)),t[2]=a*(s*m-c*b)-i*(e*m-u*b)+d*(e*c-u*s),t[3]=-(a*(s*l-c*h)-i*(e*l-u*h)+M*(e*c-u*s)),t[4]=-(o*(h*m-l*b)-f*(s*m-c*b)+v*(s*l-c*h)),t[5]=r*(h*m-l*b)-f*(e*m-u*b)+v*(e*l-u*h),t[6]=-(r*(s*m-c*b)-o*(e*m-u*b)+v*(e*c-u*s)),t[7]=r*(s*l-c*h)-o*(e*l-u*h)+f*(e*c-u*s),t[8]=o*(M*m-l*d)-f*(i*m-c*d)+v*(i*l-c*M),t[9]=-(r*(M*m-l*d)-f*(a*m-u*d)+v*(a*l-u*M)),t[10]=r*(i*m-c*d)-o*(a*m-u*d)+v*(a*c-u*i),t[11]=-(r*(i*l-c*M)-o*(a*l-u*M)+f*(a*c-u*i)),t[12]=-(o*(M*b-h*d)-f*(i*b-s*d)+v*(i*h-s*M)),t[13]=r*(M*b-h*d)-f*(a*b-e*d)+v*(a*h-e*M),t[14]=-(r*(i*b-s*d)-o*(a*b-e*d)+v*(a*s-e*i)),t[15]=r*(i*h-s*M)-o*(a*h-e*M)+f*(a*s-e*i),t},n.determinant=function(t){var n=t[0],r=t[1],a=t[2],e=t[3],u=t[4],o=t[5],i=t[6],s=t[7],c=t[8],f=t[9],M=t[10],h=t[11],l=t[12],v=t[13],d=t[14],b=t[15];return(n*o-r*u)*(M*b-h*d)-(n*i-a*u)*(f*b-h*v)+(n*s-e*u)*(f*d-M*v)+(r*i-a*o)*(c*b-h*l)-(r*s-e*o)*(c*d-M*l)+(a*s-e*i)*(c*v-f*l)},n.multiply=u,n.translate=function(t,n,r){var a=r[0],e=r[1],u=r[2],o=void 0,i=void 0,s=void 0,c=void 0,f=void 0,M=void 0,h=void 0,l=void 0,v=void 0,d=void 0,b=void 0,m=void 0;n===t?(t[12]=n[0]*a+n[4]*e+n[8]*u+n[12],t[13]=n[1]*a+n[5]*e+n[9]*u+n[13],t[14]=n[2]*a+n[6]*e+n[10]*u+n[14],t[15]=n[3]*a+n[7]*e+n[11]*u+n[15]):(o=n[0],i=n[1],s=n[2],c=n[3],f=n[4],M=n[5],h=n[6],l=n[7],v=n[8],d=n[9],b=n[10],m=n[11],t[0]=o,t[1]=i,t[2]=s,t[3]=c,t[4]=f,t[5]=M,t[6]=h,t[7]=l,t[8]=v,t[9]=d,t[10]=b,t[11]=m,t[12]=o*a+f*e+v*u+n[12],t[13]=i*a+M*e+d*u+n[13],t[14]=s*a+h*e+b*u+n[14],t[15]=c*a+l*e+m*u+n[15]);return t},n.scale=function(t,n,r){var a=r[0],e=r[1],u=r[2];return t[0]=n[0]*a,t[1]=n[1]*a,t[2]=n[2]*a,t[3]=n[3]*a,t[4]=n[4]*e,t[5]=n[5]*e,t[6]=n[6]*e,t[7]=n[7]*e,t[8]=n[8]*u,t[9]=n[9]*u,t[10]=n[10]*u,t[11]=n[11]*u,t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],t},n.rotate=function(t,n,r,e){var u=e[0],o=e[1],i=e[2],s=Math.sqrt(u*u+o*o+i*i),c=void 0,f=void 0,M=void 0,h=void 0,l=void 0,v=void 0,d=void 0,b=void 0,m=void 0,p=void 0,P=void 0,A=void 0,E=void 0,O=void 0,R=void 0,y=void 0,q=void 0,x=void 0,_=void 0,Y=void 0,L=void 0,S=void 0,w=void 0,I=void 0;if(s<a.EPSILON)return null;u*=s=1/s,o*=s,i*=s,c=Math.sin(r),f=Math.cos(r),M=1-f,h=n[0],l=n[1],v=n[2],d=n[3],b=n[4],m=n[5],p=n[6],P=n[7],A=n[8],E=n[9],O=n[10],R=n[11],y=u*u*M+f,q=o*u*M+i*c,x=i*u*M-o*c,_=u*o*M-i*c,Y=o*o*M+f,L=i*o*M+u*c,S=u*i*M+o*c,w=o*i*M-u*c,I=i*i*M+f,t[0]=h*y+b*q+A*x,t[1]=l*y+m*q+E*x,t[2]=v*y+p*q+O*x,t[3]=d*y+P*q+R*x,t[4]=h*_+b*Y+A*L,t[5]=l*_+m*Y+E*L,t[6]=v*_+p*Y+O*L,t[7]=d*_+P*Y+R*L,t[8]=h*S+b*w+A*I,t[9]=l*S+m*w+E*I,t[10]=v*S+p*w+O*I,t[11]=d*S+P*w+R*I,n!==t&&(t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15]);return t},n.rotateX=function(t,n,r){var a=Math.sin(r),e=Math.cos(r),u=n[4],o=n[5],i=n[6],s=n[7],c=n[8],f=n[9],M=n[10],h=n[11];n!==t&&(t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15]);return t[4]=u*e+c*a,t[5]=o*e+f*a,t[6]=i*e+M*a,t[7]=s*e+h*a,t[8]=c*e-u*a,t[9]=f*e-o*a,t[10]=M*e-i*a,t[11]=h*e-s*a,t},n.rotateY=function(t,n,r){var a=Math.sin(r),e=Math.cos(r),u=n[0],o=n[1],i=n[2],s=n[3],c=n[8],f=n[9],M=n[10],h=n[11];n!==t&&(t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15]);return t[0]=u*e-c*a,t[1]=o*e-f*a,t[2]=i*e-M*a,t[3]=s*e-h*a,t[8]=u*a+c*e,t[9]=o*a+f*e,t[10]=i*a+M*e,t[11]=s*a+h*e,t},n.rotateZ=function(t,n,r){var a=Math.sin(r),e=Math.cos(r),u=n[0],o=n[1],i=n[2],s=n[3],c=n[4],f=n[5],M=n[6],h=n[7];n!==t&&(t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15]);return t[0]=u*e+c*a,t[1]=o*e+f*a,t[2]=i*e+M*a,t[3]=s*e+h*a,t[4]=c*e-u*a,t[5]=f*e-o*a,t[6]=M*e-i*a,t[7]=h*e-s*a,t},n.fromTranslation=function(t,n){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=n[0],t[13]=n[1],t[14]=n[2],t[15]=1,t},n.fromScaling=function(t,n){return t[0]=n[0],t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=n[1],t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=n[2],t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.fromRotation=function(t,n,r){var e=r[0],u=r[1],o=r[2],i=Math.sqrt(e*e+u*u+o*o),s=void 0,c=void 0,f=void 0;if(i<a.EPSILON)return null;return e*=i=1/i,u*=i,o*=i,s=Math.sin(n),c=Math.cos(n),f=1-c,t[0]=e*e*f+c,t[1]=u*e*f+o*s,t[2]=o*e*f-u*s,t[3]=0,t[4]=e*u*f-o*s,t[5]=u*u*f+c,t[6]=o*u*f+e*s,t[7]=0,t[8]=e*o*f+u*s,t[9]=u*o*f-e*s,t[10]=o*o*f+c,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.fromXRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a,t[6]=r,t[7]=0,t[8]=0,t[9]=-r,t[10]=a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.fromYRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=a,t[1]=0,t[2]=-r,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=r,t[9]=0,t[10]=a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.fromZRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=a,t[1]=r,t[2]=0,t[3]=0,t[4]=-r,t[5]=a,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.fromRotationTranslation=o,n.fromQuat2=function(t,n){var r=new a.ARRAY_TYPE(3),e=-n[0],u=-n[1],i=-n[2],s=n[3],c=n[4],f=n[5],M=n[6],h=n[7],l=e*e+u*u+i*i+s*s;l>0?(r[0]=2*(c*s+h*e+f*i-M*u)/l,r[1]=2*(f*s+h*u+M*e-c*i)/l,r[2]=2*(M*s+h*i+c*u-f*e)/l):(r[0]=2*(c*s+h*e+f*i-M*u),r[1]=2*(f*s+h*u+M*e-c*i),r[2]=2*(M*s+h*i+c*u-f*e));return o(t,n,r),t},n.getTranslation=function(t,n){return t[0]=n[12],t[1]=n[13],t[2]=n[14],t},n.getScaling=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[4],o=n[5],i=n[6],s=n[8],c=n[9],f=n[10];return t[0]=Math.sqrt(r*r+a*a+e*e),t[1]=Math.sqrt(u*u+o*o+i*i),t[2]=Math.sqrt(s*s+c*c+f*f),t},n.getRotation=function(t,n){var r=n[0]+n[5]+n[10],a=0;r>0?(a=2*Math.sqrt(r+1),t[3]=.25*a,t[0]=(n[6]-n[9])/a,t[1]=(n[8]-n[2])/a,t[2]=(n[1]-n[4])/a):n[0]>n[5]&&n[0]>n[10]?(a=2*Math.sqrt(1+n[0]-n[5]-n[10]),t[3]=(n[6]-n[9])/a,t[0]=.25*a,t[1]=(n[1]+n[4])/a,t[2]=(n[8]+n[2])/a):n[5]>n[10]?(a=2*Math.sqrt(1+n[5]-n[0]-n[10]),t[3]=(n[8]-n[2])/a,t[0]=(n[1]+n[4])/a,t[1]=.25*a,t[2]=(n[6]+n[9])/a):(a=2*Math.sqrt(1+n[10]-n[0]-n[5]),t[3]=(n[1]-n[4])/a,t[0]=(n[8]+n[2])/a,t[1]=(n[6]+n[9])/a,t[2]=.25*a);return t},n.fromRotationTranslationScale=function(t,n,r,a){var e=n[0],u=n[1],o=n[2],i=n[3],s=e+e,c=u+u,f=o+o,M=e*s,h=e*c,l=e*f,v=u*c,d=u*f,b=o*f,m=i*s,p=i*c,P=i*f,A=a[0],E=a[1],O=a[2];return t[0]=(1-(v+b))*A,t[1]=(h+P)*A,t[2]=(l-p)*A,t[3]=0,t[4]=(h-P)*E,t[5]=(1-(M+b))*E,t[6]=(d+m)*E,t[7]=0,t[8]=(l+p)*O,t[9]=(d-m)*O,t[10]=(1-(M+v))*O,t[11]=0,t[12]=r[0],t[13]=r[1],t[14]=r[2],t[15]=1,t},n.fromRotationTranslationScaleOrigin=function(t,n,r,a,e){var u=n[0],o=n[1],i=n[2],s=n[3],c=u+u,f=o+o,M=i+i,h=u*c,l=u*f,v=u*M,d=o*f,b=o*M,m=i*M,p=s*c,P=s*f,A=s*M,E=a[0],O=a[1],R=a[2],y=e[0],q=e[1],x=e[2],_=(1-(d+m))*E,Y=(l+A)*E,L=(v-P)*E,S=(l-A)*O,w=(1-(h+m))*O,I=(b+p)*O,N=(v+P)*R,g=(b-p)*R,T=(1-(h+d))*R;return t[0]=_,t[1]=Y,t[2]=L,t[3]=0,t[4]=S,t[5]=w,t[6]=I,t[7]=0,t[8]=N,t[9]=g,t[10]=T,t[11]=0,t[12]=r[0]+y-(_*y+S*q+N*x),t[13]=r[1]+q-(Y*y+w*q+g*x),t[14]=r[2]+x-(L*y+I*q+T*x),t[15]=1,t},n.fromQuat=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=r+r,i=a+a,s=e+e,c=r*o,f=a*o,M=a*i,h=e*o,l=e*i,v=e*s,d=u*o,b=u*i,m=u*s;return t[0]=1-M-v,t[1]=f+m,t[2]=h-b,t[3]=0,t[4]=f-m,t[5]=1-c-v,t[6]=l+d,t[7]=0,t[8]=h+b,t[9]=l-d,t[10]=1-c-M,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},n.frustum=function(t,n,r,a,e,u,o){var i=1/(r-n),s=1/(e-a),c=1/(u-o);return t[0]=2*u*i,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=2*u*s,t[6]=0,t[7]=0,t[8]=(r+n)*i,t[9]=(e+a)*s,t[10]=(o+u)*c,t[11]=-1,t[12]=0,t[13]=0,t[14]=o*u*2*c,t[15]=0,t},n.perspective=function(t,n,r,a,e){var u=1/Math.tan(n/2),o=void 0;t[0]=u/r,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=u,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,null!=e&&e!==1/0?(o=1/(a-e),t[10]=(e+a)*o,t[14]=2*e*a*o):(t[10]=-1,t[14]=-2*a);return t},n.perspectiveFromFieldOfView=function(t,n,r,a){var e=Math.tan(n.upDegrees*Math.PI/180),u=Math.tan(n.downDegrees*Math.PI/180),o=Math.tan(n.leftDegrees*Math.PI/180),i=Math.tan(n.rightDegrees*Math.PI/180),s=2/(o+i),c=2/(e+u);return t[0]=s,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=c,t[6]=0,t[7]=0,t[8]=-(o-i)*s*.5,t[9]=(e-u)*c*.5,t[10]=a/(r-a),t[11]=-1,t[12]=0,t[13]=0,t[14]=a*r/(r-a),t[15]=0,t},n.ortho=function(t,n,r,a,e,u,o){var i=1/(n-r),s=1/(a-e),c=1/(u-o);return t[0]=-2*i,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*s,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*c,t[11]=0,t[12]=(n+r)*i,t[13]=(e+a)*s,t[14]=(o+u)*c,t[15]=1,t},n.lookAt=function(t,n,r,u){var o=void 0,i=void 0,s=void 0,c=void 0,f=void 0,M=void 0,h=void 0,l=void 0,v=void 0,d=void 0,b=n[0],m=n[1],p=n[2],P=u[0],A=u[1],E=u[2],O=r[0],R=r[1],y=r[2];if(Math.abs(b-O)<a.EPSILON&&Math.abs(m-R)<a.EPSILON&&Math.abs(p-y)<a.EPSILON)return e(t);h=b-O,l=m-R,v=p-y,d=1/Math.sqrt(h*h+l*l+v*v),o=A*(v*=d)-E*(l*=d),i=E*(h*=d)-P*v,s=P*l-A*h,(d=Math.sqrt(o*o+i*i+s*s))?(o*=d=1/d,i*=d,s*=d):(o=0,i=0,s=0);c=l*s-v*i,f=v*o-h*s,M=h*i-l*o,(d=Math.sqrt(c*c+f*f+M*M))?(c*=d=1/d,f*=d,M*=d):(c=0,f=0,M=0);return t[0]=o,t[1]=c,t[2]=h,t[3]=0,t[4]=i,t[5]=f,t[6]=l,t[7]=0,t[8]=s,t[9]=M,t[10]=v,t[11]=0,t[12]=-(o*b+i*m+s*p),t[13]=-(c*b+f*m+M*p),t[14]=-(h*b+l*m+v*p),t[15]=1,t},n.targetTo=function(t,n,r,a){var e=n[0],u=n[1],o=n[2],i=a[0],s=a[1],c=a[2],f=e-r[0],M=u-r[1],h=o-r[2],l=f*f+M*M+h*h;l>0&&(l=1/Math.sqrt(l),f*=l,M*=l,h*=l);var v=s*h-c*M,d=c*f-i*h,b=i*M-s*f;(l=v*v+d*d+b*b)>0&&(l=1/Math.sqrt(l),v*=l,d*=l,b*=l);return t[0]=v,t[1]=d,t[2]=b,t[3]=0,t[4]=M*b-h*d,t[5]=h*v-f*b,t[6]=f*d-M*v,t[7]=0,t[8]=f,t[9]=M,t[10]=h,t[11]=0,t[12]=e,t[13]=u,t[14]=o,t[15]=1,t},n.str=function(t){return"mat4("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+", "+t[8]+", "+t[9]+", "+t[10]+", "+t[11]+", "+t[12]+", "+t[13]+", "+t[14]+", "+t[15]+")"},n.frob=function(t){return Math.sqrt(Math.pow(t[0],2)+Math.pow(t[1],2)+Math.pow(t[2],2)+Math.pow(t[3],2)+Math.pow(t[4],2)+Math.pow(t[5],2)+Math.pow(t[6],2)+Math.pow(t[7],2)+Math.pow(t[8],2)+Math.pow(t[9],2)+Math.pow(t[10],2)+Math.pow(t[11],2)+Math.pow(t[12],2)+Math.pow(t[13],2)+Math.pow(t[14],2)+Math.pow(t[15],2))},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t[4]=n[4]+r[4],t[5]=n[5]+r[5],t[6]=n[6]+r[6],t[7]=n[7]+r[7],t[8]=n[8]+r[8],t[9]=n[9]+r[9],t[10]=n[10]+r[10],t[11]=n[11]+r[11],t[12]=n[12]+r[12],t[13]=n[13]+r[13],t[14]=n[14]+r[14],t[15]=n[15]+r[15],t},n.subtract=i,n.multiplyScalar=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=n[7]*r,t[8]=n[8]*r,t[9]=n[9]*r,t[10]=n[10]*r,t[11]=n[11]*r,t[12]=n[12]*r,t[13]=n[13]*r,t[14]=n[14]*r,t[15]=n[15]*r,t},n.multiplyScalarAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t[3]=n[3]+r[3]*a,t[4]=n[4]+r[4]*a,t[5]=n[5]+r[5]*a,t[6]=n[6]+r[6]*a,t[7]=n[7]+r[7]*a,t[8]=n[8]+r[8]*a,t[9]=n[9]+r[9]*a,t[10]=n[10]+r[10]*a,t[11]=n[11]+r[11]*a,t[12]=n[12]+r[12]*a,t[13]=n[13]+r[13]*a,t[14]=n[14]+r[14]*a,t[15]=n[15]+r[15]*a,t},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]&&t[4]===n[4]&&t[5]===n[5]&&t[6]===n[6]&&t[7]===n[7]&&t[8]===n[8]&&t[9]===n[9]&&t[10]===n[10]&&t[11]===n[11]&&t[12]===n[12]&&t[13]===n[13]&&t[14]===n[14]&&t[15]===n[15]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=t[4],s=t[5],c=t[6],f=t[7],M=t[8],h=t[9],l=t[10],v=t[11],d=t[12],b=t[13],m=t[14],p=t[15],P=n[0],A=n[1],E=n[2],O=n[3],R=n[4],y=n[5],q=n[6],x=n[7],_=n[8],Y=n[9],L=n[10],S=n[11],w=n[12],I=n[13],N=n[14],g=n[15];return Math.abs(r-P)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(P))&&Math.abs(e-A)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(A))&&Math.abs(u-E)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(E))&&Math.abs(o-O)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(O))&&Math.abs(i-R)<=a.EPSILON*Math.max(1,Math.abs(i),Math.abs(R))&&Math.abs(s-y)<=a.EPSILON*Math.max(1,Math.abs(s),Math.abs(y))&&Math.abs(c-q)<=a.EPSILON*Math.max(1,Math.abs(c),Math.abs(q))&&Math.abs(f-x)<=a.EPSILON*Math.max(1,Math.abs(f),Math.abs(x))&&Math.abs(M-_)<=a.EPSILON*Math.max(1,Math.abs(M),Math.abs(_))&&Math.abs(h-Y)<=a.EPSILON*Math.max(1,Math.abs(h),Math.abs(Y))&&Math.abs(l-L)<=a.EPSILON*Math.max(1,Math.abs(l),Math.abs(L))&&Math.abs(v-S)<=a.EPSILON*Math.max(1,Math.abs(v),Math.abs(S))&&Math.abs(d-w)<=a.EPSILON*Math.max(1,Math.abs(d),Math.abs(w))&&Math.abs(b-I)<=a.EPSILON*Math.max(1,Math.abs(b),Math.abs(I))&&Math.abs(m-N)<=a.EPSILON*Math.max(1,Math.abs(m),Math.abs(N))&&Math.abs(p-g)<=a.EPSILON*Math.max(1,Math.abs(p),Math.abs(g))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function u(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=n[6],f=n[7],M=n[8],h=n[9],l=n[10],v=n[11],d=n[12],b=n[13],m=n[14],p=n[15],P=r[0],A=r[1],E=r[2],O=r[3];return t[0]=P*a+A*i+E*M+O*d,t[1]=P*e+A*s+E*h+O*b,t[2]=P*u+A*c+E*l+O*m,t[3]=P*o+A*f+E*v+O*p,P=r[4],A=r[5],E=r[6],O=r[7],t[4]=P*a+A*i+E*M+O*d,t[5]=P*e+A*s+E*h+O*b,t[6]=P*u+A*c+E*l+O*m,t[7]=P*o+A*f+E*v+O*p,P=r[8],A=r[9],E=r[10],O=r[11],t[8]=P*a+A*i+E*M+O*d,t[9]=P*e+A*s+E*h+O*b,t[10]=P*u+A*c+E*l+O*m,t[11]=P*o+A*f+E*v+O*p,P=r[12],A=r[13],E=r[14],O=r[15],t[12]=P*a+A*i+E*M+O*d,t[13]=P*e+A*s+E*h+O*b,t[14]=P*u+A*c+E*l+O*m,t[15]=P*o+A*f+E*v+O*p,t}function o(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=a+a,s=e+e,c=u+u,f=a*i,M=a*s,h=a*c,l=e*s,v=e*c,d=u*c,b=o*i,m=o*s,p=o*c;return t[0]=1-(l+d),t[1]=M+p,t[2]=h-m,t[3]=0,t[4]=M-p,t[5]=1-(f+d),t[6]=v+b,t[7]=0,t[8]=h+m,t[9]=v-b,t[10]=1-(f+l),t[11]=0,t[12]=r[0],t[13]=r[1],t[14]=r[2],t[15]=1,t}function i(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t[3]=n[3]-r[3],t[4]=n[4]-r[4],t[5]=n[5]-r[5],t[6]=n[6]-r[6],t[7]=n[7]-r[7],t[8]=n[8]-r[8],t[9]=n[9]-r[9],t[10]=n[10]-r[10],t[11]=n[11]-r[11],t[12]=n[12]-r[12],t[13]=n[13]-r[13],t[14]=n[14]-r[14],t[15]=n[15]-r[15],t}n.mul=u,n.sub=i},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.sub=n.mul=void 0,n.create=function(){var t=new a.ARRAY_TYPE(9);a.ARRAY_TYPE!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[5]=0,t[6]=0,t[7]=0);return t[0]=1,t[4]=1,t[8]=1,t},n.fromMat4=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[4],t[4]=n[5],t[5]=n[6],t[6]=n[8],t[7]=n[9],t[8]=n[10],t},n.clone=function(t){var n=new a.ARRAY_TYPE(9);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n[4]=t[4],n[5]=t[5],n[6]=t[6],n[7]=t[7],n[8]=t[8],n},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t},n.fromValues=function(t,n,r,e,u,o,i,s,c){var f=new a.ARRAY_TYPE(9);return f[0]=t,f[1]=n,f[2]=r,f[3]=e,f[4]=u,f[5]=o,f[6]=i,f[7]=s,f[8]=c,f},n.set=function(t,n,r,a,e,u,o,i,s,c){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t[4]=u,t[5]=o,t[6]=i,t[7]=s,t[8]=c,t},n.identity=function(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=1,t[5]=0,t[6]=0,t[7]=0,t[8]=1,t},n.transpose=function(t,n){if(t===n){var r=n[1],a=n[2],e=n[5];t[1]=n[3],t[2]=n[6],t[3]=r,t[5]=n[7],t[6]=a,t[7]=e}else t[0]=n[0],t[1]=n[3],t[2]=n[6],t[3]=n[1],t[4]=n[4],t[5]=n[7],t[6]=n[2],t[7]=n[5],t[8]=n[8];return t},n.invert=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=n[6],c=n[7],f=n[8],M=f*o-i*c,h=-f*u+i*s,l=c*u-o*s,v=r*M+a*h+e*l;if(!v)return null;return v=1/v,t[0]=M*v,t[1]=(-f*a+e*c)*v,t[2]=(i*a-e*o)*v,t[3]=h*v,t[4]=(f*r-e*s)*v,t[5]=(-i*r+e*u)*v,t[6]=l*v,t[7]=(-c*r+a*s)*v,t[8]=(o*r-a*u)*v,t},n.adjoint=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=n[6],c=n[7],f=n[8];return t[0]=o*f-i*c,t[1]=e*c-a*f,t[2]=a*i-e*o,t[3]=i*s-u*f,t[4]=r*f-e*s,t[5]=e*u-r*i,t[6]=u*c-o*s,t[7]=a*s-r*c,t[8]=r*o-a*u,t},n.determinant=function(t){var n=t[0],r=t[1],a=t[2],e=t[3],u=t[4],o=t[5],i=t[6],s=t[7],c=t[8];return n*(c*u-o*s)+r*(-c*e+o*i)+a*(s*e-u*i)},n.multiply=e,n.translate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=n[6],f=n[7],M=n[8],h=r[0],l=r[1];return t[0]=a,t[1]=e,t[2]=u,t[3]=o,t[4]=i,t[5]=s,t[6]=h*a+l*o+c,t[7]=h*e+l*i+f,t[8]=h*u+l*s+M,t},n.rotate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=n[6],f=n[7],M=n[8],h=Math.sin(r),l=Math.cos(r);return t[0]=l*a+h*o,t[1]=l*e+h*i,t[2]=l*u+h*s,t[3]=l*o-h*a,t[4]=l*i-h*e,t[5]=l*s-h*u,t[6]=c,t[7]=f,t[8]=M,t},n.scale=function(t,n,r){var a=r[0],e=r[1];return t[0]=a*n[0],t[1]=a*n[1],t[2]=a*n[2],t[3]=e*n[3],t[4]=e*n[4],t[5]=e*n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t},n.fromTranslation=function(t,n){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=1,t[5]=0,t[6]=n[0],t[7]=n[1],t[8]=1,t},n.fromRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=a,t[1]=r,t[2]=0,t[3]=-r,t[4]=a,t[5]=0,t[6]=0,t[7]=0,t[8]=1,t},n.fromScaling=function(t,n){return t[0]=n[0],t[1]=0,t[2]=0,t[3]=0,t[4]=n[1],t[5]=0,t[6]=0,t[7]=0,t[8]=1,t},n.fromMat2d=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=0,t[3]=n[2],t[4]=n[3],t[5]=0,t[6]=n[4],t[7]=n[5],t[8]=1,t},n.fromQuat=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=r+r,i=a+a,s=e+e,c=r*o,f=a*o,M=a*i,h=e*o,l=e*i,v=e*s,d=u*o,b=u*i,m=u*s;return t[0]=1-M-v,t[3]=f-m,t[6]=h+b,t[1]=f+m,t[4]=1-c-v,t[7]=l-d,t[2]=h-b,t[5]=l+d,t[8]=1-c-M,t},n.normalFromMat4=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=n[6],c=n[7],f=n[8],M=n[9],h=n[10],l=n[11],v=n[12],d=n[13],b=n[14],m=n[15],p=r*i-a*o,P=r*s-e*o,A=r*c-u*o,E=a*s-e*i,O=a*c-u*i,R=e*c-u*s,y=f*d-M*v,q=f*b-h*v,x=f*m-l*v,_=M*b-h*d,Y=M*m-l*d,L=h*m-l*b,S=p*L-P*Y+A*_+E*x-O*q+R*y;if(!S)return null;return S=1/S,t[0]=(i*L-s*Y+c*_)*S,t[1]=(s*x-o*L-c*q)*S,t[2]=(o*Y-i*x+c*y)*S,t[3]=(e*Y-a*L-u*_)*S,t[4]=(r*L-e*x+u*q)*S,t[5]=(a*x-r*Y-u*y)*S,t[6]=(d*R-b*O+m*E)*S,t[7]=(b*A-v*R-m*P)*S,t[8]=(v*O-d*A+m*p)*S,t},n.projection=function(t,n,r){return t[0]=2/n,t[1]=0,t[2]=0,t[3]=0,t[4]=-2/r,t[5]=0,t[6]=-1,t[7]=1,t[8]=1,t},n.str=function(t){return"mat3("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+", "+t[8]+")"},n.frob=function(t){return Math.sqrt(Math.pow(t[0],2)+Math.pow(t[1],2)+Math.pow(t[2],2)+Math.pow(t[3],2)+Math.pow(t[4],2)+Math.pow(t[5],2)+Math.pow(t[6],2)+Math.pow(t[7],2)+Math.pow(t[8],2))},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t[4]=n[4]+r[4],t[5]=n[5]+r[5],t[6]=n[6]+r[6],t[7]=n[7]+r[7],t[8]=n[8]+r[8],t},n.subtract=u,n.multiplyScalar=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=n[7]*r,t[8]=n[8]*r,t},n.multiplyScalarAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t[3]=n[3]+r[3]*a,t[4]=n[4]+r[4]*a,t[5]=n[5]+r[5]*a,t[6]=n[6]+r[6]*a,t[7]=n[7]+r[7]*a,t[8]=n[8]+r[8]*a,t},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]&&t[4]===n[4]&&t[5]===n[5]&&t[6]===n[6]&&t[7]===n[7]&&t[8]===n[8]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=t[4],s=t[5],c=t[6],f=t[7],M=t[8],h=n[0],l=n[1],v=n[2],d=n[3],b=n[4],m=n[5],p=n[6],P=n[7],A=n[8];return Math.abs(r-h)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(h))&&Math.abs(e-l)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(l))&&Math.abs(u-v)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(v))&&Math.abs(o-d)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(d))&&Math.abs(i-b)<=a.EPSILON*Math.max(1,Math.abs(i),Math.abs(b))&&Math.abs(s-m)<=a.EPSILON*Math.max(1,Math.abs(s),Math.abs(m))&&Math.abs(c-p)<=a.EPSILON*Math.max(1,Math.abs(c),Math.abs(p))&&Math.abs(f-P)<=a.EPSILON*Math.max(1,Math.abs(f),Math.abs(P))&&Math.abs(M-A)<=a.EPSILON*Math.max(1,Math.abs(M),Math.abs(A))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=n[6],f=n[7],M=n[8],h=r[0],l=r[1],v=r[2],d=r[3],b=r[4],m=r[5],p=r[6],P=r[7],A=r[8];return t[0]=h*a+l*o+v*c,t[1]=h*e+l*i+v*f,t[2]=h*u+l*s+v*M,t[3]=d*a+b*o+m*c,t[4]=d*e+b*i+m*f,t[5]=d*u+b*s+m*M,t[6]=p*a+P*o+A*c,t[7]=p*e+P*i+A*f,t[8]=p*u+P*s+A*M,t}function u(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t[3]=n[3]-r[3],t[4]=n[4]-r[4],t[5]=n[5]-r[5],t[6]=n[6]-r[6],t[7]=n[7]-r[7],t[8]=n[8]-r[8],t}n.mul=e,n.sub=u},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.forEach=n.sqrLen=n.sqrDist=n.dist=n.div=n.mul=n.sub=n.len=void 0,n.create=e,n.clone=function(t){var n=new a.ARRAY_TYPE(2);return n[0]=t[0],n[1]=t[1],n},n.fromValues=function(t,n){var r=new a.ARRAY_TYPE(2);return r[0]=t,r[1]=n,r},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t},n.set=function(t,n,r){return t[0]=n,t[1]=r,t},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t},n.subtract=u,n.multiply=o,n.divide=i,n.ceil=function(t,n){return t[0]=Math.ceil(n[0]),t[1]=Math.ceil(n[1]),t},n.floor=function(t,n){return t[0]=Math.floor(n[0]),t[1]=Math.floor(n[1]),t},n.min=function(t,n,r){return t[0]=Math.min(n[0],r[0]),t[1]=Math.min(n[1],r[1]),t},n.max=function(t,n,r){return t[0]=Math.max(n[0],r[0]),t[1]=Math.max(n[1],r[1]),t},n.round=function(t,n){return t[0]=Math.round(n[0]),t[1]=Math.round(n[1]),t},n.scale=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t},n.scaleAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t},n.distance=s,n.squaredDistance=c,n.length=f,n.squaredLength=M,n.negate=function(t,n){return t[0]=-n[0],t[1]=-n[1],t},n.inverse=function(t,n){return t[0]=1/n[0],t[1]=1/n[1],t},n.normalize=function(t,n){var r=n[0],a=n[1],e=r*r+a*a;e>0&&(e=1/Math.sqrt(e),t[0]=n[0]*e,t[1]=n[1]*e);return t},n.dot=function(t,n){return t[0]*n[0]+t[1]*n[1]},n.cross=function(t,n,r){var a=n[0]*r[1]-n[1]*r[0];return t[0]=t[1]=0,t[2]=a,t},n.lerp=function(t,n,r,a){var e=n[0],u=n[1];return t[0]=e+a*(r[0]-e),t[1]=u+a*(r[1]-u),t},n.random=function(t,n){n=n||1;var r=2*a.RANDOM()*Math.PI;return t[0]=Math.cos(r)*n,t[1]=Math.sin(r)*n,t},n.transformMat2=function(t,n,r){var a=n[0],e=n[1];return t[0]=r[0]*a+r[2]*e,t[1]=r[1]*a+r[3]*e,t},n.transformMat2d=function(t,n,r){var a=n[0],e=n[1];return t[0]=r[0]*a+r[2]*e+r[4],t[1]=r[1]*a+r[3]*e+r[5],t},n.transformMat3=function(t,n,r){var a=n[0],e=n[1];return t[0]=r[0]*a+r[3]*e+r[6],t[1]=r[1]*a+r[4]*e+r[7],t},n.transformMat4=function(t,n,r){var a=n[0],e=n[1];return t[0]=r[0]*a+r[4]*e+r[12],t[1]=r[1]*a+r[5]*e+r[13],t},n.rotate=function(t,n,r,a){var e=n[0]-r[0],u=n[1]-r[1],o=Math.sin(a),i=Math.cos(a);return t[0]=e*i-u*o+r[0],t[1]=e*o+u*i+r[1],t},n.angle=function(t,n){var r=t[0],a=t[1],e=n[0],u=n[1],o=r*r+a*a;o>0&&(o=1/Math.sqrt(o));var i=e*e+u*u;i>0&&(i=1/Math.sqrt(i));var s=(r*e+a*u)*o*i;return s>1?0:s<-1?Math.PI:Math.acos(s)},n.str=function(t){return"vec2("+t[0]+", "+t[1]+")"},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]},n.equals=function(t,n){var r=t[0],e=t[1],u=n[0],o=n[1];return Math.abs(r-u)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(u))&&Math.abs(e-o)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(o))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(){var t=new a.ARRAY_TYPE(2);return a.ARRAY_TYPE!=Float32Array&&(t[0]=0,t[1]=0),t}function u(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t}function o(t,n,r){return t[0]=n[0]*r[0],t[1]=n[1]*r[1],t}function i(t,n,r){return t[0]=n[0]/r[0],t[1]=n[1]/r[1],t}function s(t,n){var r=n[0]-t[0],a=n[1]-t[1];return Math.sqrt(r*r+a*a)}function c(t,n){var r=n[0]-t[0],a=n[1]-t[1];return r*r+a*a}function f(t){var n=t[0],r=t[1];return Math.sqrt(n*n+r*r)}function M(t){var n=t[0],r=t[1];return n*n+r*r}n.len=f,n.sub=u,n.mul=o,n.div=i,n.dist=s,n.sqrDist=c,n.sqrLen=M,n.forEach=function(){var t=e();return function(n,r,a,e,u,o){var i=void 0,s=void 0;for(r||(r=2),a||(a=0),s=e?Math.min(e*r+a,n.length):n.length,i=a;i<s;i+=r)t[0]=n[i],t[1]=n[i+1],u(t,t,o),n[i]=t[0],n[i+1]=t[1];return n}}()},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.sqrLen=n.squaredLength=n.len=n.length=n.dot=n.mul=n.setReal=n.getReal=void 0,n.create=function(){var t=new a.ARRAY_TYPE(8);a.ARRAY_TYPE!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0,t[4]=0,t[5]=0,t[6]=0,t[7]=0);return t[3]=1,t},n.clone=function(t){var n=new a.ARRAY_TYPE(8);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n[4]=t[4],n[5]=t[5],n[6]=t[6],n[7]=t[7],n},n.fromValues=function(t,n,r,e,u,o,i,s){var c=new a.ARRAY_TYPE(8);return c[0]=t,c[1]=n,c[2]=r,c[3]=e,c[4]=u,c[5]=o,c[6]=i,c[7]=s,c},n.fromRotationTranslationValues=function(t,n,r,e,u,o,i){var s=new a.ARRAY_TYPE(8);s[0]=t,s[1]=n,s[2]=r,s[3]=e;var c=.5*u,f=.5*o,M=.5*i;return s[4]=c*e+f*r-M*n,s[5]=f*e+M*t-c*r,s[6]=M*e+c*n-f*t,s[7]=-c*t-f*n-M*r,s},n.fromRotationTranslation=i,n.fromTranslation=function(t,n){return t[0]=0,t[1]=0,t[2]=0,t[3]=1,t[4]=.5*n[0],t[5]=.5*n[1],t[6]=.5*n[2],t[7]=0,t},n.fromRotation=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=0,t[5]=0,t[6]=0,t[7]=0,t},n.fromMat4=function(t,n){var r=e.create();u.getRotation(r,n);var o=new a.ARRAY_TYPE(3);return u.getTranslation(o,n),i(t,r,o),t},n.copy=s,n.identity=function(t){return t[0]=0,t[1]=0,t[2]=0,t[3]=1,t[4]=0,t[5]=0,t[6]=0,t[7]=0,t},n.set=function(t,n,r,a,e,u,o,i,s){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t[4]=u,t[5]=o,t[6]=i,t[7]=s,t},n.getDual=function(t,n){return t[0]=n[4],t[1]=n[5],t[2]=n[6],t[3]=n[7],t},n.setDual=function(t,n){return t[4]=n[0],t[5]=n[1],t[6]=n[2],t[7]=n[3],t},n.getTranslation=function(t,n){var r=n[4],a=n[5],e=n[6],u=n[7],o=-n[0],i=-n[1],s=-n[2],c=n[3];return t[0]=2*(r*c+u*o+a*s-e*i),t[1]=2*(a*c+u*i+e*o-r*s),t[2]=2*(e*c+u*s+r*i-a*o),t},n.translate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=.5*r[0],s=.5*r[1],c=.5*r[2],f=n[4],M=n[5],h=n[6],l=n[7];return t[0]=a,t[1]=e,t[2]=u,t[3]=o,t[4]=o*i+e*c-u*s+f,t[5]=o*s+u*i-a*c+M,t[6]=o*c+a*s-e*i+h,t[7]=-a*i-e*s-u*c+l,t},n.rotateX=function(t,n,r){var a=-n[0],u=-n[1],o=-n[2],i=n[3],s=n[4],c=n[5],f=n[6],M=n[7],h=s*i+M*a+c*o-f*u,l=c*i+M*u+f*a-s*o,v=f*i+M*o+s*u-c*a,d=M*i-s*a-c*u-f*o;return e.rotateX(t,n,r),a=t[0],u=t[1],o=t[2],i=t[3],t[4]=h*i+d*a+l*o-v*u,t[5]=l*i+d*u+v*a-h*o,t[6]=v*i+d*o+h*u-l*a,t[7]=d*i-h*a-l*u-v*o,t},n.rotateY=function(t,n,r){var a=-n[0],u=-n[1],o=-n[2],i=n[3],s=n[4],c=n[5],f=n[6],M=n[7],h=s*i+M*a+c*o-f*u,l=c*i+M*u+f*a-s*o,v=f*i+M*o+s*u-c*a,d=M*i-s*a-c*u-f*o;return e.rotateY(t,n,r),a=t[0],u=t[1],o=t[2],i=t[3],t[4]=h*i+d*a+l*o-v*u,t[5]=l*i+d*u+v*a-h*o,t[6]=v*i+d*o+h*u-l*a,t[7]=d*i-h*a-l*u-v*o,t},n.rotateZ=function(t,n,r){var a=-n[0],u=-n[1],o=-n[2],i=n[3],s=n[4],c=n[5],f=n[6],M=n[7],h=s*i+M*a+c*o-f*u,l=c*i+M*u+f*a-s*o,v=f*i+M*o+s*u-c*a,d=M*i-s*a-c*u-f*o;return e.rotateZ(t,n,r),a=t[0],u=t[1],o=t[2],i=t[3],t[4]=h*i+d*a+l*o-v*u,t[5]=l*i+d*u+v*a-h*o,t[6]=v*i+d*o+h*u-l*a,t[7]=d*i-h*a-l*u-v*o,t},n.rotateByQuatAppend=function(t,n,r){var a=r[0],e=r[1],u=r[2],o=r[3],i=n[0],s=n[1],c=n[2],f=n[3];return t[0]=i*o+f*a+s*u-c*e,t[1]=s*o+f*e+c*a-i*u,t[2]=c*o+f*u+i*e-s*a,t[3]=f*o-i*a-s*e-c*u,i=n[4],s=n[5],c=n[6],f=n[7],t[4]=i*o+f*a+s*u-c*e,t[5]=s*o+f*e+c*a-i*u,t[6]=c*o+f*u+i*e-s*a,t[7]=f*o-i*a-s*e-c*u,t},n.rotateByQuatPrepend=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=r[0],s=r[1],c=r[2],f=r[3];return t[0]=a*f+o*i+e*c-u*s,t[1]=e*f+o*s+u*i-a*c,t[2]=u*f+o*c+a*s-e*i,t[3]=o*f-a*i-e*s-u*c,i=r[4],s=r[5],c=r[6],f=r[7],t[4]=a*f+o*i+e*c-u*s,t[5]=e*f+o*s+u*i-a*c,t[6]=u*f+o*c+a*s-e*i,t[7]=o*f-a*i-e*s-u*c,t},n.rotateAroundAxis=function(t,n,r,e){if(Math.abs(e)<a.EPSILON)return s(t,n);var u=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);e*=.5;var o=Math.sin(e),i=o*r[0]/u,c=o*r[1]/u,f=o*r[2]/u,M=Math.cos(e),h=n[0],l=n[1],v=n[2],d=n[3];t[0]=h*M+d*i+l*f-v*c,t[1]=l*M+d*c+v*i-h*f,t[2]=v*M+d*f+h*c-l*i,t[3]=d*M-h*i-l*c-v*f;var b=n[4],m=n[5],p=n[6],P=n[7];return t[4]=b*M+P*i+m*f-p*c,t[5]=m*M+P*c+p*i-b*f,t[6]=p*M+P*f+b*c-m*i,t[7]=P*M-b*i-m*c-p*f,t},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t[4]=n[4]+r[4],t[5]=n[5]+r[5],t[6]=n[6]+r[6],t[7]=n[7]+r[7],t},n.multiply=c,n.scale=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=n[7]*r,t},n.lerp=function(t,n,r,a){var e=1-a;f(n,r)<0&&(a=-a);return t[0]=n[0]*e+r[0]*a,t[1]=n[1]*e+r[1]*a,t[2]=n[2]*e+r[2]*a,t[3]=n[3]*e+r[3]*a,t[4]=n[4]*e+r[4]*a,t[5]=n[5]*e+r[5]*a,t[6]=n[6]*e+r[6]*a,t[7]=n[7]*e+r[7]*a,t},n.invert=function(t,n){var r=h(n);return t[0]=-n[0]/r,t[1]=-n[1]/r,t[2]=-n[2]/r,t[3]=n[3]/r,t[4]=-n[4]/r,t[5]=-n[5]/r,t[6]=-n[6]/r,t[7]=n[7]/r,t},n.conjugate=function(t,n){return t[0]=-n[0],t[1]=-n[1],t[2]=-n[2],t[3]=n[3],t[4]=-n[4],t[5]=-n[5],t[6]=-n[6],t[7]=n[7],t},n.normalize=function(t,n){var r=h(n);if(r>0){r=Math.sqrt(r);var a=n[0]/r,e=n[1]/r,u=n[2]/r,o=n[3]/r,i=n[4],s=n[5],c=n[6],f=n[7],M=a*i+e*s+u*c+o*f;t[0]=a,t[1]=e,t[2]=u,t[3]=o,t[4]=(i-a*M)/r,t[5]=(s-e*M)/r,t[6]=(c-u*M)/r,t[7]=(f-o*M)/r}return t},n.str=function(t){return"quat2("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+")"},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]&&t[4]===n[4]&&t[5]===n[5]&&t[6]===n[6]&&t[7]===n[7]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=t[4],s=t[5],c=t[6],f=t[7],M=n[0],h=n[1],l=n[2],v=n[3],d=n[4],b=n[5],m=n[6],p=n[7];return Math.abs(r-M)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(M))&&Math.abs(e-h)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(h))&&Math.abs(u-l)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(l))&&Math.abs(o-v)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(v))&&Math.abs(i-d)<=a.EPSILON*Math.max(1,Math.abs(i),Math.abs(d))&&Math.abs(s-b)<=a.EPSILON*Math.max(1,Math.abs(s),Math.abs(b))&&Math.abs(c-m)<=a.EPSILON*Math.max(1,Math.abs(c),Math.abs(m))&&Math.abs(f-p)<=a.EPSILON*Math.max(1,Math.abs(f),Math.abs(p))};var a=o(r(0)),e=o(r(3)),u=o(r(4));function o(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}function i(t,n,r){var a=.5*r[0],e=.5*r[1],u=.5*r[2],o=n[0],i=n[1],s=n[2],c=n[3];return t[0]=o,t[1]=i,t[2]=s,t[3]=c,t[4]=a*c+e*s-u*i,t[5]=e*c+u*o-a*s,t[6]=u*c+a*i-e*o,t[7]=-a*o-e*i-u*s,t}function s(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t}n.getReal=e.copy;n.setReal=e.copy;function c(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=r[4],s=r[5],c=r[6],f=r[7],M=n[4],h=n[5],l=n[6],v=n[7],d=r[0],b=r[1],m=r[2],p=r[3];return t[0]=a*p+o*d+e*m-u*b,t[1]=e*p+o*b+u*d-a*m,t[2]=u*p+o*m+a*b-e*d,t[3]=o*p-a*d-e*b-u*m,t[4]=a*f+o*i+e*c-u*s+M*p+v*d+h*m-l*b,t[5]=e*f+o*s+u*i-a*c+h*p+v*b+l*d-M*m,t[6]=u*f+o*c+a*s-e*i+l*p+v*m+M*b-h*d,t[7]=o*f-a*i-e*s-u*c+v*p-M*d-h*b-l*m,t}n.mul=c;var f=n.dot=e.dot;var M=n.length=e.length,h=(n.len=M,n.squaredLength=e.squaredLength);n.sqrLen=h},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.sub=n.mul=void 0,n.create=function(){var t=new a.ARRAY_TYPE(6);a.ARRAY_TYPE!=Float32Array&&(t[1]=0,t[2]=0,t[4]=0,t[5]=0);return t[0]=1,t[3]=1,t},n.clone=function(t){var n=new a.ARRAY_TYPE(6);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n[4]=t[4],n[5]=t[5],n},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t},n.identity=function(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=1,t[4]=0,t[5]=0,t},n.fromValues=function(t,n,r,e,u,o){var i=new a.ARRAY_TYPE(6);return i[0]=t,i[1]=n,i[2]=r,i[3]=e,i[4]=u,i[5]=o,i},n.set=function(t,n,r,a,e,u,o){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t[4]=u,t[5]=o,t},n.invert=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=n[4],i=n[5],s=r*u-a*e;if(!s)return null;return s=1/s,t[0]=u*s,t[1]=-a*s,t[2]=-e*s,t[3]=r*s,t[4]=(e*i-u*o)*s,t[5]=(a*o-r*i)*s,t},n.determinant=function(t){return t[0]*t[3]-t[1]*t[2]},n.multiply=e,n.rotate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=Math.sin(r),f=Math.cos(r);return t[0]=a*f+u*c,t[1]=e*f+o*c,t[2]=a*-c+u*f,t[3]=e*-c+o*f,t[4]=i,t[5]=s,t},n.scale=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=r[0],f=r[1];return t[0]=a*c,t[1]=e*c,t[2]=u*f,t[3]=o*f,t[4]=i,t[5]=s,t},n.translate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=r[0],f=r[1];return t[0]=a,t[1]=e,t[2]=u,t[3]=o,t[4]=a*c+u*f+i,t[5]=e*c+o*f+s,t},n.fromRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=a,t[1]=r,t[2]=-r,t[3]=a,t[4]=0,t[5]=0,t},n.fromScaling=function(t,n){return t[0]=n[0],t[1]=0,t[2]=0,t[3]=n[1],t[4]=0,t[5]=0,t},n.fromTranslation=function(t,n){return t[0]=1,t[1]=0,t[2]=0,t[3]=1,t[4]=n[0],t[5]=n[1],t},n.str=function(t){return"mat2d("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+")"},n.frob=function(t){return Math.sqrt(Math.pow(t[0],2)+Math.pow(t[1],2)+Math.pow(t[2],2)+Math.pow(t[3],2)+Math.pow(t[4],2)+Math.pow(t[5],2)+1)},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t[4]=n[4]+r[4],t[5]=n[5]+r[5],t},n.subtract=u,n.multiplyScalar=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t[4]=n[4]*r,t[5]=n[5]*r,t},n.multiplyScalarAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t[3]=n[3]+r[3]*a,t[4]=n[4]+r[4]*a,t[5]=n[5]+r[5]*a,t},n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]&&t[4]===n[4]&&t[5]===n[5]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=t[4],s=t[5],c=n[0],f=n[1],M=n[2],h=n[3],l=n[4],v=n[5];return Math.abs(r-c)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(c))&&Math.abs(e-f)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(f))&&Math.abs(u-M)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(M))&&Math.abs(o-h)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(h))&&Math.abs(i-l)<=a.EPSILON*Math.max(1,Math.abs(i),Math.abs(l))&&Math.abs(s-v)<=a.EPSILON*Math.max(1,Math.abs(s),Math.abs(v))};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=n[4],s=n[5],c=r[0],f=r[1],M=r[2],h=r[3],l=r[4],v=r[5];return t[0]=a*c+u*f,t[1]=e*c+o*f,t[2]=a*M+u*h,t[3]=e*M+o*h,t[4]=a*l+u*v+i,t[5]=e*l+o*v+s,t}function u(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t[3]=n[3]-r[3],t[4]=n[4]-r[4],t[5]=n[5]-r[5],t}n.mul=e,n.sub=u},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.sub=n.mul=void 0,n.create=function(){var t=new a.ARRAY_TYPE(4);a.ARRAY_TYPE!=Float32Array&&(t[1]=0,t[2]=0);return t[0]=1,t[3]=1,t},n.clone=function(t){var n=new a.ARRAY_TYPE(4);return n[0]=t[0],n[1]=t[1],n[2]=t[2],n[3]=t[3],n},n.copy=function(t,n){return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t},n.identity=function(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=1,t},n.fromValues=function(t,n,r,e){var u=new a.ARRAY_TYPE(4);return u[0]=t,u[1]=n,u[2]=r,u[3]=e,u},n.set=function(t,n,r,a,e){return t[0]=n,t[1]=r,t[2]=a,t[3]=e,t},n.transpose=function(t,n){if(t===n){var r=n[1];t[1]=n[2],t[2]=r}else t[0]=n[0],t[1]=n[2],t[2]=n[1],t[3]=n[3];return t},n.invert=function(t,n){var r=n[0],a=n[1],e=n[2],u=n[3],o=r*u-e*a;if(!o)return null;return o=1/o,t[0]=u*o,t[1]=-a*o,t[2]=-e*o,t[3]=r*o,t},n.adjoint=function(t,n){var r=n[0];return t[0]=n[3],t[1]=-n[1],t[2]=-n[2],t[3]=r,t},n.determinant=function(t){return t[0]*t[3]-t[2]*t[1]},n.multiply=e,n.rotate=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=Math.sin(r),s=Math.cos(r);return t[0]=a*s+u*i,t[1]=e*s+o*i,t[2]=a*-i+u*s,t[3]=e*-i+o*s,t},n.scale=function(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=r[0],s=r[1];return t[0]=a*i,t[1]=e*i,t[2]=u*s,t[3]=o*s,t},n.fromRotation=function(t,n){var r=Math.sin(n),a=Math.cos(n);return t[0]=a,t[1]=r,t[2]=-r,t[3]=a,t},n.fromScaling=function(t,n){return t[0]=n[0],t[1]=0,t[2]=0,t[3]=n[1],t},n.str=function(t){return"mat2("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+")"},n.frob=function(t){return Math.sqrt(Math.pow(t[0],2)+Math.pow(t[1],2)+Math.pow(t[2],2)+Math.pow(t[3],2))},n.LDU=function(t,n,r,a){return t[2]=a[2]/a[0],r[0]=a[0],r[1]=a[1],r[3]=a[3]-t[2]*r[1],[t,n,r]},n.add=function(t,n,r){return t[0]=n[0]+r[0],t[1]=n[1]+r[1],t[2]=n[2]+r[2],t[3]=n[3]+r[3],t},n.subtract=u,n.exactEquals=function(t,n){return t[0]===n[0]&&t[1]===n[1]&&t[2]===n[2]&&t[3]===n[3]},n.equals=function(t,n){var r=t[0],e=t[1],u=t[2],o=t[3],i=n[0],s=n[1],c=n[2],f=n[3];return Math.abs(r-i)<=a.EPSILON*Math.max(1,Math.abs(r),Math.abs(i))&&Math.abs(e-s)<=a.EPSILON*Math.max(1,Math.abs(e),Math.abs(s))&&Math.abs(u-c)<=a.EPSILON*Math.max(1,Math.abs(u),Math.abs(c))&&Math.abs(o-f)<=a.EPSILON*Math.max(1,Math.abs(o),Math.abs(f))},n.multiplyScalar=function(t,n,r){return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=n[3]*r,t},n.multiplyScalarAndAdd=function(t,n,r,a){return t[0]=n[0]+r[0]*a,t[1]=n[1]+r[1]*a,t[2]=n[2]+r[2]*a,t[3]=n[3]+r[3]*a,t};var a=function(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}(r(0));function e(t,n,r){var a=n[0],e=n[1],u=n[2],o=n[3],i=r[0],s=r[1],c=r[2],f=r[3];return t[0]=a*i+u*s,t[1]=e*i+o*s,t[2]=a*c+u*f,t[3]=e*c+o*f,t}function u(t,n,r){return t[0]=n[0]-r[0],t[1]=n[1]-r[1],t[2]=n[2]-r[2],t[3]=n[3]-r[3],t}n.mul=e,n.sub=u},function(t,n,r){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.vec4=n.vec3=n.vec2=n.quat2=n.quat=n.mat4=n.mat3=n.mat2d=n.mat2=n.glMatrix=void 0;var a=l(r(0)),e=l(r(9)),u=l(r(8)),o=l(r(5)),i=l(r(4)),s=l(r(3)),c=l(r(7)),f=l(r(6)),M=l(r(2)),h=l(r(1));function l(t){if(t&&t.__esModule)return t;var n={};if(null!=t)for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(n[r]=t[r]);return n.default=t,n}n.glMatrix=a,n.mat2=e,n.mat2d=u,n.mat3=o,n.mat4=i,n.quat=s,n.quat2=c,n.vec2=f,n.vec3=M,n.vec4=h}])});
},{}],5:[function(require,module,exports){
module.exports.screenTriangleStart = 0;
module.exports.screenTriangleSize = 3;
module.exports.cubeStart = 3;
module.exports.cubeSize = 36;

module.exports.data = 
[
  -1.00, -1.00,  0.00, 0, 0,  0.00,  0.00,  0.00,
   3.00, -1.00,  0.00, 1, 0,  0.00,  0.00,  0.00,
  -1.00,  3.00,  0.00, 0, 1,  0.00,  0.00,  0.00,
  -0.50,  0.50,  0.50, 1, 0,  0.00,  1.00,  0.00,
   0.50,  0.50, -0.50, 0, 1,  0.00,  1.00,  0.00,
  -0.50,  0.50, -0.50, 0, 0,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50, 1, 0,  1.00,  0.00,  0.00,
   0.50, -0.50, -0.50, 0, 1,  1.00,  0.00,  0.00,
   0.50,  0.50, -0.50, 0, 0,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50, 1, 0,  0.00, -1.00,  0.00,
  -0.50, -0.50, -0.50, 0, 1,  0.00, -1.00,  0.00,
   0.50, -0.50, -0.50, 0, 0,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50, 1, 0, -1.00,  0.00,  0.00,
  -0.50,  0.50, -0.50, 0, 1, -1.00,  0.00,  0.00,
  -0.50, -0.50, -0.50, 0, 0, -1.00,  0.00,  0.00,
   0.50, -0.50, -0.50, 1, 0,  0.00,  0.00, -1.00,
  -0.50,  0.50, -0.50, 0, 1,  0.00,  0.00, -1.00,
   0.50,  0.50, -0.50, 0, 0,  0.00,  0.00, -1.00,
   0.50,  0.50,  0.50, 1, 0,  0.00,  0.00,  1.00,
  -0.50, -0.50,  0.50, 0, 1,  0.00,  0.00,  1.00,
   0.50, -0.50,  0.50, 0, 0,  0.00,  0.00,  1.00,
  -0.50,  0.50,  0.50, 1, 0,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50, 1, 1,  0.00,  1.00,  0.00,
   0.50,  0.50, -0.50, 0, 1,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50, 1, 0,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50, 1, 1,  1.00,  0.00,  0.00,
   0.50, -0.50, -0.50, 0, 1,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50, 1, 0,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50, 1, 1,  0.00, -1.00,  0.00,
  -0.50, -0.50, -0.50, 0, 1,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50, 1, 0, -1.00,  0.00,  0.00,
  -0.50,  0.50,  0.50, 1, 1, -1.00,  0.00,  0.00,
  -0.50,  0.50, -0.50, 0, 1, -1.00,  0.00,  0.00,
   0.50, -0.50, -0.50, 1, 0,  0.00,  0.00, -1.00,
  -0.50, -0.50, -0.50, 1, 1,  0.00,  0.00, -1.00,
  -0.50,  0.50, -0.50, 0, 1,  0.00,  0.00, -1.00,
   0.50,  0.50,  0.50, 1, 0,  0.00,  0.00,  1.00,
  -0.50,  0.50,  0.50, 1, 1,  0.00,  0.00,  1.00,
  -0.50, -0.50,  0.50, 0, 1,  0.00,  0.00,  1.00,
];
},{}],6:[function(require,module,exports){
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
},{"./raw-data":5,"./shaders.js":8}],7:[function(require,module,exports){
const Render = require("./render.js");

let state = 0;
let doneCallback;
let gl;

function initialize(callback) {

    gl = Render.getGL();

    doneCallback = callback;

    loadAllResources();
}

function advanceState() {

    if (state === 0) {
        console.warn("resourceLoader: state is advanced beyond finish state");
        return;
    }

    state--;
    if (state === 0)
        doneCallback();
}

function loadTexture(url, nearest) {

    const tex = gl.createTexture();

    const image = new Image();
    image.onload = function() {

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        setupTextureFiltering(tex, nearest);

        advanceState();
    };
    image.src = url;

    return tex;
}

function createTexture(size, nearest, float, renderable) {
    return createTextureWithData(size, nearest, float, renderable, null);
}

function createTextureWithData(size, nearest, float, renderable, pixels) {

    const tex = gl.createTexture();

    updateTexture(tex, size, float, renderable, pixels);

    setupTextureFiltering(tex, nearest);

    return tex;
}

function setupTextureFiltering(tex, nearest) {

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (nearest) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
}

function updateTexture(tex, size, float, renderable, pixels) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, pixels);
}

function loadJson(url) {

    const json = { content: null };

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.onload = function() {

        if (xhr.status === 200)
            json.content = xhr.response;

        advanceState();
    };
    xhr.send();

    return json;
}

let database;

function loadAllResources() {

    if (state !== 0)
        return;

    state = 1;
    database = loadJson('database.json');
}

function getDatabase() {
    return database;
}

module.exports.initialize = initialize;
module.exports.createTexture = createTexture;
module.exports.createTextureWithData = createTextureWithData;
module.exports.updateTexture = updateTexture;
module.exports.getDatabase = getDatabase;
},{"./render.js":6}],8:[function(require,module,exports){
// shaders start

module.exports.offsetRotatitionAndAdditionFragmentShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'uniform sampler2D rotations;\n' +
    'uniform sampler2D parentOffsets;\n' +
    'uniform vec3 boneOffset;\n' +
    '\n' +
    'vec4 quat_mul(vec4 q1, vec4 q2) {\n' +
    '	return vec4(\n' +
    '		q2.xyz * q1.w + q1.xyz * q2.w + cross(q1.xyz, q2.xyz),\n' +
    '		q1.w * q2.w - dot(q1.xyz, q2.xyz)\n' +
    '	);\n' +
    '}\n' +
    '\n' +
    'vec3 rotate_vector(vec3 v, vec4 r) {\n' +
    '	vec4 r_c = r * vec4(-1, -1, -1, 1);\n' +
    '	return quat_mul(r, quat_mul(vec4(v, 0), r_c)).xyz;\n' +
    '}\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec2 currentPosition = vec2(gl_FragCoord.x, gl_FragCoord.y) / 64.0;\n' +
    '\n' +
    '    vec4 rotationQ = texture2D(rotations, currentPosition);\n' +
    '\n' +
    '    vec3 rotated_offset = rotate_vector(boneOffset, rotationQ);\n' +
    '\n' +
    '    vec3 parent_offset = texture2D(parentOffsets, currentPosition).xyz;\n' +
    '\n' +
    '    vec3 result = parent_offset + rotated_offset;\n' +
    '\n' +
    '    gl_FragColor = vec4(result, 1);\n' +
    '}\n';

module.exports.offsetRotatitionAndAdditionVertexShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'attribute vec3 vertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(vertexPosition, 1.0);\n' +
    '}\n';

module.exports.quaternionMultiplicationFragmentShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'uniform sampler2D relativeRotations;\n' +
    'uniform sampler2D instances;\n' +
    'uniform sampler2D parentRotations;\n' +
    'uniform float boneId;\n' +
    '\n' +
    'vec4 quat_mul(vec4 q1, vec4 q2) {\n' +
    '	return vec4(\n' +
    '		q2.xyz * q1.w + q1.xyz * q2.w + cross(q1.xyz, q2.xyz),\n' +
    '		q1.w * q2.w - dot(q1.xyz, q2.xyz)\n' +
    '	);\n' +
    '}\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec2 currentPosition = vec2(gl_FragCoord.x, gl_FragCoord.y) / 64.0;\n' +
    '\n' +
    '    vec4 instanceInfo = texture2D(instances, currentPosition);\n' +
    '\n' +
    '    float stride = instanceInfo.z;\n' +
    '\n' +
    '    vec2 relativeRotationsPosition = vec2(instanceInfo.x + stride * boneId, instanceInfo.y);\n' +
    '\n' +
    '    vec4 relativeRotationQ = texture2D(relativeRotations, relativeRotationsPosition);\n' +
    '\n' +
    '    vec4 parentRotationQ = texture2D(parentRotations, currentPosition);\n' +
    '\n' +
    '    vec4 output_quat = quat_mul(relativeRotationQ, parentRotationQ);\n' +
    '\n' +
    '    gl_FragColor = output_quat;\n' +
    '}\n';

module.exports.quaternionMultiplicationVertexShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'attribute vec3 vertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(vertexPosition, 1.0);\n' +
    '}\n';

module.exports.sceneFragmentShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'varying vec3 cameraNormal;\n' +
    'varying vec3 cameraLightDirection;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec4 materialColor = vec4(1, 1, 1, 1);\n' +
    '\n' +
    '    vec3 normal = normalize(cameraNormal);\n' +
    '    vec3 lightDirection = normalize(cameraLightDirection);\n' +
    '    float cosTheta = clamp(dot(normal, lightDirection), 0.0, 1.0);\n' +
    '\n' +
    '    vec3 lightAmbientColor = vec3(0.3, 0.3, 0.3);\n' +
    '    vec3 lightDiffuseColor = vec3(1.0, 1.0, 1.0);\n' +
    '\n' +
    '    gl_FragColor =\n' +
    '        materialColor * vec4(lightAmbientColor, 1) +\n' +
    '        materialColor * vec4(lightDiffuseColor, 1) * cosTheta;\n' +
    '}\n';

module.exports.sceneVertexShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'attribute vec3 vertexPosition;\n' +
    'attribute vec2 texCoord;\n' +
    'attribute vec3 vertexNormal;\n' +
    '\n' +
    '// per instance attributes\n' +
    'attribute vec2 instanceCoord;\n' +
    'attribute vec3 rootPosition;\n' +
    '\n' +
    'varying vec3 cameraNormal;\n' +
    'varying vec3 cameraLightDirection;\n' +
    '\n' +
    'uniform sampler2D rotations;\n' +
    'uniform sampler2D offsets;\n' +
    '\n' +
    'uniform mat4 projection;\n' +
    'uniform mat4 view;\n' +
    '\n' +
    'uniform vec3 size;\n' +
    'uniform vec3 middleTranslation;\n' +
    '\n' +
    'vec4 quat_mul(vec4 q1, vec4 q2) {\n' +
    '	return vec4(\n' +
    '		q2.xyz * q1.w + q1.xyz * q2.w + cross(q1.xyz, q2.xyz),\n' +
    '		q1.w * q2.w - dot(q1.xyz, q2.xyz)\n' +
    '	);\n' +
    '}\n' +
    '\n' +
    'vec3 rotate_vector(vec3 v, vec4 r) {\n' +
    '	vec4 r_c = r * vec4(-1, -1, -1, 1);\n' +
    '	return quat_mul(r, quat_mul(vec4(v, 0), r_c)).xyz;\n' +
    '}\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec4 rotation = texture2D(rotations, instanceCoord);\n' +
    '\n' +
    '    vec3 offset = texture2D(offsets, instanceCoord).xyz;\n' +
    '\n' +
    '    vec3 position = rootPosition + offset;\n' +
    '\n' +
    '    vec3 worldVertexPosition = rotate_vector(vertexPosition * size + middleTranslation, rotation) + position;\n' +
    '\n' +
    '    gl_Position = projection * view * vec4(worldVertexPosition, 1);\n' +
    '\n' +
    '    cameraLightDirection = -(view * vec4(worldVertexPosition, 1)).xyz;\n' +
    '    cameraNormal = (view * vec4(rotate_vector(vertexNormal, rotation), 0)).xyz;\n' +
    '}\n';

module.exports.textureOutputFragmentShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'uniform sampler2D inputTex;\n' +
    'uniform float invOutputSize;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec2 currentPosition = vec2(gl_FragCoord.x, gl_FragCoord.y) * invOutputSize;\n' +
    '\n' +
    '    gl_FragColor = vec4(texture2D(inputTex, currentPosition).rgb, 1);\n' +
    '    // gl_FragColor = vec4(texture2D(inputTex, currentPosition).a, 0, 0, 1); // r = aplha\n' +
    '}\n';

module.exports.textureOutputVertexShader = 
    'precision lowp float;\n' +
    'precision lowp sampler2D;\n' +
    '\n' +
    'attribute vec3 vertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(vertexPosition, 1.0);\n' +
    '}\n';

// shaders end

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhbmltYXRpb24tbWFuYWdlci5qcyIsImNoYXJhY3Rlci5qcyIsIm1haW4uanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0cml4L2Rpc3QvZ2wtbWF0cml4LmpzIiwicmF3LWRhdGEuanMiLCJyZW5kZXIuanMiLCJyZXNvdXJjZS1sb2FkZXIuanMiLCJzaGFkZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL2FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiY29uc3QgUmVuZGVyID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xyXG5jb25zdCBSZXNvdXJjZUxvYWRlciA9IHJlcXVpcmUoXCIuL3Jlc291cmNlLWxvYWRlci5qc1wiKTtcclxuY29uc3QgQ2hhcmFjdGVyID0gcmVxdWlyZShcIi4vY2hhcmFjdGVyLmpzXCIpLkNoYXJhY3RlcjtcclxuXHJcbmNvbnN0IHZlYzMgPSByZXF1aXJlKCdnbC1tYXRyaXgnKS52ZWMzO1xyXG5jb25zdCBxdWF0ID0gcmVxdWlyZSgnZ2wtbWF0cml4JykucXVhdDtcclxuY29uc3QgbWF0NCA9IHJlcXVpcmUoJ2dsLW1hdHJpeCcpLm1hdDQ7XHJcbmNvbnN0IGdsTWF0cml4ID0gcmVxdWlyZSgnZ2wtbWF0cml4JykuZ2xNYXRyaXg7XHJcblxyXG5sZXQgZ2w7XHJcblxyXG5jb25zdCByZWxhdGl2ZVJvdGF0aW9uc1RleFNpemUgPSAyNTY7XHJcbmxldCByZWxhdGl2ZVJvdGF0aW9uc1RleHR1cmU7XHJcblxyXG4vLyB0ZW1wbGF0ZXNcclxubGV0IGNoYXI7XHJcbmxldCBhbmltYXRpb25zO1xyXG5cclxuLy8gdGhpcyBudW1iZXIgYWN0dWFsbHkgaGFyZCBjb2RlZCBpbnRvIHRoZSBzaGFkZXJzIGFuZCB0aGUgcmVuZGVyIGFzIG9mIHJpZ2h0IG5vd1xyXG4vLyBzbyBpZiB5b3UncmUgZ29ubmEgY2hhbmdlIHRoaXMgbWFrZSBzdXJlIHRvIGFkanVzdCBldmVyeXRoaW5nIGVsc2VcclxuY29uc3QgaW5zdGFuY2VzVGV4U2l6ZSA9IDY0O1xyXG5cclxubGV0IGluc3RhbmNlc01hcFBpeGVscywgaW5zdGFuY2VzTWFwO1xyXG5sZXQgcGFyZW50Um90YXRpb25zLCBwYXJlbnRPZmZzZXRzO1xyXG5cclxuY29uc3QgbWF4Q2hhcmFjdGVycyA9IGluc3RhbmNlc1RleFNpemUgKiBpbnN0YW5jZXNUZXhTaXplO1xyXG5cclxubGV0IHBvc2l0aW9ucztcclxuXHJcbi8vIGluc3RhbmNlc1xyXG5sZXQgaW5zdGFuY2VzO1xyXG5cclxuLy8gd2h5IHRoZSBmdWNrIGlzIGl0IGhlcmU/XHJcbi8vIFRPRE8gbW92ZSB0aGlzIHNvbWV3aGVyZSwgc29tZXRoaW5nIGxpa2UgaW5wdXQtbWFuYWdlciBvciBHVUktbWFuYWdlciBvciBzb21ldGhpbmdcclxubGV0IHByb2plY3Rpb24sIHZpZXc7XHJcblxyXG5mdW5jdGlvbiBpbml0aWFsaXplKCkge1xyXG5cclxuICAgIGdsID0gUmVuZGVyLmdldEdMKCk7XHJcblxyXG4gICAgc2V0dXBDaGFyYWN0ZXJUZW1wbGF0ZSgpO1xyXG5cclxuICAgIGxvYWRBbmltYXRpb25zKCk7XHJcblxyXG4gICAgY3JlYXRlQW5pbWF0aW9uVGV4dHVyZXMoKTtcclxuXHJcbiAgICBpbnN0YW5jZXMgPSBbXTtcclxuXHJcbiAgICBzZXR1cFNjZW5lKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU2NlbmUoKSB7XHJcblxyXG4gICAgcHJvamVjdGlvbiA9ICBtYXQ0LmNyZWF0ZSgpO1xyXG4gICAgbWF0NC5wZXJzcGVjdGl2ZShwcm9qZWN0aW9uLCBnbE1hdHJpeC50b1JhZGlhbig2MCksIFJlbmRlci5nZXRBc3BlY3RSYXRpbygpLCAwLjEsIDEwMDAuMCk7XHJcblxyXG4gICAgdmlldyA9ICBtYXQ0LmNyZWF0ZSgpO1xyXG4gICAgbWF0NC5sb29rQXQodmlldywgWzIsIC0yLjU3LCA3LjQyXSwgWzAsIC0wLjUsIDUuNV0sIFswLCAwLCAxXSk7XHJcbiAgICAvLyBtYXQ0Lmxvb2tBdCh2aWV3LCBbMiwgLTIuNTcsIDBdLCBbMCwgLTAsIDBdLCBbMCwgMCwgMV0pO1xyXG4gICAgLy8gbWF0NC5sb29rQXQodmlldywgWzIsIC0yLjU3LCA3LjQyXSwgWzAsIC0xMDAuNSwgMC41XSwgWzAsIDAsIDFdKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZEFuaW1hdGlvbnMoKSB7XHJcblxyXG4gICAgY29uc3QgZGF0YWJhc2UgPSBSZXNvdXJjZUxvYWRlci5nZXREYXRhYmFzZSgpO1xyXG4gICAgY29uc3QgZGF0YWJhc2VBbmltYXRpb25zID0gZGF0YWJhc2UuY29udGVudC5hbmltYXRpb25zO1xyXG5cclxuICAgIGFuaW1hdGlvbnMgPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgY29uc3QgcGl4ZWxTaXplID0gcmVsYXRpdmVSb3RhdGlvbnNUZXhTaXplICogcmVsYXRpdmVSb3RhdGlvbnNUZXhTaXplO1xyXG4gICAgY29uc3QgcmVsYXRpdmVSb3RhdGlvbnNQaXhlbHMgPSBuZXcgRmxvYXQzMkFycmF5KHBpeGVsU2l6ZSAqIDQpO1xyXG4gICAgbGV0IGN1cnJlbnRQaXhlbCA9IDA7XHJcblxyXG4gICAgY29uc3QgYm9uZXNDb3VudCA9IGNoYXIuZ2V0Qm9uZUNvdW50KCk7XHJcblxyXG4gICAgLy8gaXRlcmF0ZSBvdmVyIGFsbCBhbmltYXRpb25zXHJcbiAgICBkYXRhYmFzZUFuaW1hdGlvbnMuZm9yRWFjaChmdW5jdGlvbiAoYW5pbWF0aW9uKSB7XHJcblxyXG4gICAgICAgIGFuaW1hdGlvbi5zdHJpZGUgPSBhbmltYXRpb24ua2V5ZnJhbWVzLmxlbmd0aCArIDE7XHJcblxyXG4gICAgICAgIGNvbnN0IHBpeGVsV2lkdGggPSBhbmltYXRpb24uc3RyaWRlICogYm9uZXNDb3VudDtcclxuICAgICAgICBpZiAocGl4ZWxXaWR0aCA+IHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYW5pbWF0aW9uLm5hbWUgKyBcIiBoYXZlIHRvbyBtYW55IGtleWZyYW1lcyBhbmQgd2FzIG5vdCBsb2FkZWRcIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHBpeGVsWCA9IGN1cnJlbnRQaXhlbCAlIHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZTtcclxuICAgICAgICBjb25zdCByb3dSZW1haW5pbmcgPSByZWxhdGl2ZVJvdGF0aW9uc1RleFNpemUgLSBwaXhlbFg7XHJcbiAgICAgICAgaWYgKHBpeGVsV2lkdGggPiByb3dSZW1haW5pbmcpXHJcbiAgICAgICAgICAgIGN1cnJlbnRQaXhlbCArPSByb3dSZW1haW5pbmc7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50UGl4ZWwgPj0gcGl4ZWxTaXplKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkRhdGFiYXNlIGlzIGZ1bGwgYW5kIFwiICsgYW5pbWF0aW9uLm5hbWUgKyBcIiB3YXMgbm90IGxvYWRlZFwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYW5pbWF0aW9uLnN0YXJ0UGl4ZWwgPSBjdXJyZW50UGl4ZWw7XHJcbiAgICAgICAgYW5pbWF0aW9uLnN0YXJ0UGl4ZWxYID0gY3VycmVudFBpeGVsICUgcmVsYXRpdmVSb3RhdGlvbnNUZXhTaXplO1xyXG4gICAgICAgIGFuaW1hdGlvbi5zdGFydFBpeGVsWSA9IE1hdGguZmxvb3IoY3VycmVudFBpeGVsIC8gcmVsYXRpdmVSb3RhdGlvbnNUZXhTaXplKTtcclxuXHJcbiAgICAgICAgLy8gZmlsbGluZyBmbG9hdCBwaXhlbHMgd2l0aCBxdWF0ZXJuaW9uc1xyXG4gICAgICAgIGZvciAobGV0IGtleUZyYW1lSW5kZXggPSAwOyBrZXlGcmFtZUluZGV4IDw9IGFuaW1hdGlvbi5rZXlmcmFtZXMubGVuZ3RoOyBrZXlGcmFtZUluZGV4KyspIHtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGtleWZyYW1lID0gYW5pbWF0aW9uLmtleWZyYW1lc1trZXlGcmFtZUluZGV4ID09PSBhbmltYXRpb24ua2V5ZnJhbWVzLmxlbmd0aCA/IDAgOiBrZXlGcmFtZUluZGV4XTtcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IGJvbmVJbmRleCA9IDA7IGJvbmVJbmRleCA8IGFuaW1hdGlvbi5ib25lcy5sZW5ndGg7IGJvbmVJbmRleCsrKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgYm9uZU5hbWUgPSBhbmltYXRpb24uYm9uZXNbYm9uZUluZGV4XTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvbmVJZCA9IGNoYXIuZ2V0Qm9uZUlkQnlOYW1lKGJvbmVOYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChib25lSWQgPT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiRGlkbid0IGZpbmQgYm9uZSBcIiArIGJvbmVOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3RhdGlvbiA9IGtleWZyYW1lLnJvdGF0aW9uc1tib25lSW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGRlc3RQaXhlbCA9XHJcbiAgICAgICAgICAgICAgICAgICAgYW5pbWF0aW9uLnN0YXJ0UGl4ZWwgK1xyXG4gICAgICAgICAgICAgICAgICAgIGJvbmVJZCAqIGFuaW1hdGlvbi5zdHJpZGUgK1xyXG4gICAgICAgICAgICAgICAgICAgIGtleUZyYW1lSW5kZXg7XHJcblxyXG4gICAgICAgICAgICAgICAgcmVsYXRpdmVSb3RhdGlvbnNQaXhlbHNbZGVzdFBpeGVsICogNCAgICBdID0gcm90YXRpb24ueDtcclxuICAgICAgICAgICAgICAgIHJlbGF0aXZlUm90YXRpb25zUGl4ZWxzW2Rlc3RQaXhlbCAqIDQgKyAxXSA9IHJvdGF0aW9uLnk7XHJcbiAgICAgICAgICAgICAgICByZWxhdGl2ZVJvdGF0aW9uc1BpeGVsc1tkZXN0UGl4ZWwgKiA0ICsgMl0gPSByb3RhdGlvbi56O1xyXG4gICAgICAgICAgICAgICAgcmVsYXRpdmVSb3RhdGlvbnNQaXhlbHNbZGVzdFBpeGVsICogNCArIDNdID0gcm90YXRpb24udztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYW5pbWF0aW9ucy5zZXQoYW5pbWF0aW9uLm5hbWUsIGFuaW1hdGlvbik7XHJcblxyXG4gICAgICAgIGN1cnJlbnRQaXhlbCArPSBwaXhlbFdpZHRoO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmVsYXRpdmVSb3RhdGlvbnNUZXh0dXJlID0gUmVzb3VyY2VMb2FkZXIuY3JlYXRlVGV4dHVyZVdpdGhEYXRhKHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZSwgZmFsc2UsIHRydWUsIGZhbHNlLFxyXG4gICAgICAgIHJlbGF0aXZlUm90YXRpb25zUGl4ZWxzKTtcclxuXHJcbiAgICBpbnN0YW5jZXNNYXAgPSBSZXNvdXJjZUxvYWRlci5jcmVhdGVUZXh0dXJlKGluc3RhbmNlc1RleFNpemUsIHRydWUsIHRydWUsIGZhbHNlKTtcclxuICAgIGluc3RhbmNlc01hcFBpeGVscyA9IG5ldyBGbG9hdDMyQXJyYXkoaW5zdGFuY2VzVGV4U2l6ZSAqIGluc3RhbmNlc1RleFNpemUgKiA0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBDaGFyYWN0ZXJUZW1wbGF0ZSgpIHtcclxuXHJcbiAgICBjaGFyID0gbmV3IENoYXJhY3RlcigpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkdXBsaWNhdGU0RmxvYXRWYWx1ZXNTcShzaXplLCB4LCB5LCB6LCB3KSB7XHJcblxyXG4gICAgc2l6ZSAqPSBzaXplO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoc2l6ZSAqIDQpO1xyXG5cclxuICAgIGZvciAobGV0IG51bSA9IDA7IG51bSA8IHNpemU7IG51bSsrKSB7XHJcblxyXG4gICAgICAgIHJlc3VsdFtudW0gKiA0ICAgIF0gPSB4O1xyXG4gICAgICAgIHJlc3VsdFtudW0gKiA0ICsgMV0gPSB5O1xyXG4gICAgICAgIHJlc3VsdFtudW0gKiA0ICsgMl0gPSB6O1xyXG4gICAgICAgIHJlc3VsdFtudW0gKiA0ICsgM10gPSB3O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUFuaW1hdGlvblRleHR1cmVzKCkge1xyXG5cclxuICAgIHBhcmVudFJvdGF0aW9ucyA9IFtdO1xyXG4gICAgcGFyZW50T2Zmc2V0cyA9IFtdO1xyXG5cclxuICAgIGZvciAobGV0IGJvbmVJZCA9IC0xOyBib25lSWQgPCBjaGFyLmJvbmVzLnNpemU7IGJvbmVJZCsrKSB7XHJcbiAgICAgICAgcGFyZW50Um90YXRpb25zWzEgKyBib25lSWRdID0gUmVzb3VyY2VMb2FkZXIuY3JlYXRlVGV4dHVyZVdpdGhEYXRhKGluc3RhbmNlc1RleFNpemUsIHRydWUsIHRydWUsIHRydWUsXHJcbiAgICAgICAgICAgIGR1cGxpY2F0ZTRGbG9hdFZhbHVlc1NxKGluc3RhbmNlc1RleFNpemUsIDAsIDAsIDAsIDEpKTtcclxuICAgICAgICBwYXJlbnRPZmZzZXRzWzEgKyBib25lSWRdID0gUmVzb3VyY2VMb2FkZXIuY3JlYXRlVGV4dHVyZVdpdGhEYXRhKGluc3RhbmNlc1RleFNpemUsIHRydWUsIHRydWUsIHRydWUsXHJcbiAgICAgICAgICAgIGR1cGxpY2F0ZTRGbG9hdFZhbHVlc1NxKGluc3RhbmNlc1RleFNpemUsIDAsIDAsIDAsIDApKTtcclxuICAgIH1cclxuXHJcbiAgICBwb3NpdGlvbnMgPSBuZXcgRmxvYXQzMkFycmF5KG1heENoYXJhY3RlcnMgKiAzKTtcclxuXHJcbiAgICBjb25zdCBpbnN0YW5jZUNvb3JkcyA9IG5ldyBGbG9hdDMyQXJyYXkobWF4Q2hhcmFjdGVycyAqIDIpO1xyXG4gICAgbGV0IGluc3RhbmNlQ29vcmRJbmRleCA9IDA7XHJcbiAgICBmb3IgKGxldCB5ID0gMDsgeSA8IGluc3RhbmNlc1RleFNpemU7IHkrKykge1xyXG5cclxuICAgICAgICBjb25zdCBjb29yZFkgPSAoeSArIDAuNSkgLyBpbnN0YW5jZXNUZXhTaXplO1xyXG5cclxuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IGluc3RhbmNlc1RleFNpemU7IHgrKykge1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY29vcmRYID0gKHggKyAwLjUpIC8gaW5zdGFuY2VzVGV4U2l6ZTtcclxuXHJcbiAgICAgICAgICAgIGluc3RhbmNlQ29vcmRzW2luc3RhbmNlQ29vcmRJbmRleCAgICBdID0gY29vcmRYO1xyXG4gICAgICAgICAgICBpbnN0YW5jZUNvb3Jkc1tpbnN0YW5jZUNvb3JkSW5kZXggKyAxXSA9IGNvb3JkWTtcclxuICAgICAgICAgICAgaW5zdGFuY2VDb29yZEluZGV4ICs9IDI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIFJlbmRlci5zZXR1cEluc3RhbmNlQ29vcmRzKGluc3RhbmNlQ29vcmRzKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmlsbFBlckluc3RhbmNlRGF0YSgpIHtcclxuXHJcbiAgICBsZXQgaW5zdGFuY2VzSW5kZXggPSAwO1xyXG4gICAgbGV0IHBvc2l0aW9uc0luZGV4ID0gMDtcclxuXHJcbiAgICBpbnN0YW5jZXMuZm9yRWFjaChmdW5jdGlvbiAoaW5zdGFuY2UpIHtcclxuXHJcbiAgICAgICAgY29uc3QgYW5pbWF0aW9uID0gaW5zdGFuY2UuYW5pbWF0aW9uO1xyXG5cclxuICAgICAgICBjb25zdCB0ZXhDb29yZFggPSAoMC41ICsgYW5pbWF0aW9uLnN0YXJ0UGl4ZWxYICsgaW5zdGFuY2Uuc3RhdGUgKyBpbnN0YW5jZS50KSAvIHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZTtcclxuICAgICAgICBjb25zdCB0ZXhDb29yZFkgPSAoMC41ICsgYW5pbWF0aW9uLnN0YXJ0UGl4ZWxZKSAvIHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZTtcclxuICAgICAgICBjb25zdCBib25lU3RyaWRlID0gYW5pbWF0aW9uLnN0cmlkZSAvIHJlbGF0aXZlUm90YXRpb25zVGV4U2l6ZTtcclxuXHJcbiAgICAgICAgaW5zdGFuY2VzTWFwUGl4ZWxzW2luc3RhbmNlc0luZGV4ICAgIF0gPSB0ZXhDb29yZFg7XHJcbiAgICAgICAgaW5zdGFuY2VzTWFwUGl4ZWxzW2luc3RhbmNlc0luZGV4ICsgMV0gPSB0ZXhDb29yZFk7XHJcbiAgICAgICAgaW5zdGFuY2VzTWFwUGl4ZWxzW2luc3RhbmNlc0luZGV4ICsgMl0gPSBib25lU3RyaWRlO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgICogVE9ETyBpZiBhbnkgcHJvYmxlbXMgd2l0aCBhbmltYXRpb24gYmVjYXVzZSBvZiBsaW5lYXIgaW50ZXJwb2xhdGlvbiBvZiBxdWF0ZXJuaW9ucyB3aWxsIG9jY3VyXHJcbiAgICAgICAgICogdGhlbiB3ZSBjYW4gdXNlIHRoaXMgNHRoIGNvbG9yIGNoYW5uZWwgdG8gc3RvcmUgdCBzZXBhcmF0ZWx5IGFuZCBwZXJmb3JtIFNMRVJQIGJ5IG91cnNlbHZlc1xyXG4gICAgICAgICAqIHVzaW5nIHR3byBwZXIgcGl4ZWwgdGV4dHVyZSBsb29rdXBzLCBpdCdzIHVudXNlZCBhcyBmb3IgcmlnaHQgbm93XHJcbiAgICAgICAgICogaW5zdGFuY2VzTWFwUGl4ZWxzW2luZGV4ICsgM10gPSBpbnN0YW5jZS50O1xyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGluc3RhbmNlc0luZGV4ICs9IDQ7XHJcblxyXG4gICAgICAgIHBvc2l0aW9uc1twb3NpdGlvbnNJbmRleCAgICBdID0gaW5zdGFuY2UucG9zWzBdO1xyXG4gICAgICAgIHBvc2l0aW9uc1twb3NpdGlvbnNJbmRleCArIDFdID0gaW5zdGFuY2UucG9zWzFdO1xyXG4gICAgICAgIHBvc2l0aW9uc1twb3NpdGlvbnNJbmRleCArIDJdID0gaW5zdGFuY2UucG9zWzJdO1xyXG4gICAgICAgIHBvc2l0aW9uc0luZGV4ICs9IDM7XHJcbiAgICB9KTtcclxuXHJcbiAgICBSZXNvdXJjZUxvYWRlci51cGRhdGVUZXh0dXJlKGluc3RhbmNlc01hcCwgaW5zdGFuY2VzVGV4U2l6ZSwgdHJ1ZSwgZmFsc2UsIGluc3RhbmNlc01hcFBpeGVscyk7XHJcblxyXG4gICAgUmVuZGVyLnNldHVwUG9zaXRpb25zKHBvc2l0aW9ucyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkdmFuY2UoZHQpIHtcclxuXHJcbiAgICBpbnN0YW5jZXMuZm9yRWFjaChmdW5jdGlvbiAoaW5zdGFuY2UpIHtcclxuXHJcbiAgICAgICAgLy8gVE9ETyB0aGlzIHN0dWZmIHByb3BlcnR5XHJcblxyXG4gICAgICAgIGluc3RhbmNlLnN0YXRlID0gMTtcclxuXHJcbiAgICAgICAgaW5zdGFuY2UudCArPSBkdDtcclxuICAgICAgICBpbnN0YW5jZS50ID0gaW5zdGFuY2UudCAlIDEuMDtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYWxjdWxhdGVRdWF0KGJvbmUpIHtcclxuXHJcbiAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRSb3RhdGlvbnNbMSArIGJvbmUucGFyZW50SWRdO1xyXG4gICAgY29uc3Qgb3V0cHV0ID0gcGFyZW50Um90YXRpb25zWzEgKyBib25lLmlkXTtcclxuXHJcbiAgICBSZW5kZXIuY29tcHV0ZVF1YXRzKGJvbmUuaWQsIHJlbGF0aXZlUm90YXRpb25zVGV4dHVyZSwgaW5zdGFuY2VzTWFwLCBwYXJlbnQsIG91dHB1dCk7XHJcblxyXG4gICAgYm9uZS5jaGlsZHMuZm9yRWFjaChmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgICAgICBjYWxjdWxhdGVRdWF0KGNoaWxkKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYWxjdWxhdGVPZmZzZXQoYm9uZSkge1xyXG5cclxuICAgIGNvbnN0IHJvdGF0aW9uID0gcGFyZW50Um90YXRpb25zWzEgKyBib25lLnBhcmVudElkXTtcclxuICAgIGNvbnN0IHBhcmVudCA9IHBhcmVudE9mZnNldHNbMSArIGJvbmUucGFyZW50SWRdO1xyXG4gICAgY29uc3Qgb3V0cHV0ID0gcGFyZW50T2Zmc2V0c1sxICsgYm9uZS5pZF07XHJcblxyXG4gICAgUmVuZGVyLmNvbXB1dGVPZmZzZXRzKGJvbmUuYm9uZU9mZnNldCwgcm90YXRpb24sIHBhcmVudCwgb3V0cHV0KTtcclxuXHJcbiAgICBib25lLmNoaWxkcy5mb3JFYWNoKGZ1bmN0aW9uIChjaGlsZCkge1xyXG4gICAgICAgIGNhbGN1bGF0ZU9mZnNldChjaGlsZCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0luc3RhbmNlcyhib25lKSB7XHJcblxyXG4gICAgY29uc3Qgb2Zmc2V0cyA9IHBhcmVudE9mZnNldHNbMSArIGJvbmUuaWRdO1xyXG4gICAgY29uc3Qgcm90YXRpb25zID0gcGFyZW50Um90YXRpb25zWzEgKyBib25lLmlkXTtcclxuXHJcbiAgICBSZW5kZXIuZHJhd0luc3RhbmNlcyhyb3RhdGlvbnMsIG9mZnNldHMsIGJvbmUuc2l6ZSwgYm9uZS5taWRkbGVUcmFuc2xhdGlvbiwgaW5zdGFuY2VzLmxlbmd0aCk7XHJcblxyXG4gICAgYm9uZS5jaGlsZHMuZm9yRWFjaChmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgICAgICBkcmF3SW5zdGFuY2VzKGNoaWxkKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3QW5pbWF0aW9ucygpIHtcclxuXHJcbiAgICBmaWxsUGVySW5zdGFuY2VEYXRhKCk7XHJcblxyXG4gICAgY2FsY3VsYXRlUXVhdChjaGFyLnBlbHZpcyk7XHJcbiAgICBjYWxjdWxhdGVPZmZzZXQoY2hhci5wZWx2aXMpO1xyXG5cclxuICAgIFJlbmRlci5zZXR1cFNjZW5lKHByb2plY3Rpb24sIHZpZXcpO1xyXG5cclxuICAgIGRyYXdJbnN0YW5jZXMoY2hhci5wZWx2aXMpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kQW5pbWF0aW9uQnlOYW1lKG5hbWUpIHtcclxuXHJcbiAgICBjb25zdCBhbmltYXRpb24gPSBhbmltYXRpb25zLmdldChuYW1lKTtcclxuXHJcbiAgICBpZiAoYW5pbWF0aW9uICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgcmV0dXJuIGFuaW1hdGlvbjtcclxuICAgIGVsc2VcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQW5pbWF0aW9uSW5zdGFuY2UoeCwgeSwgeikge1xyXG5cclxuICAgIGNvbnN0IGluc3RhbmNlID0gbmV3IEFuaW1hdGlvbkluc3RhbmNlKHgsIHksIHopO1xyXG5cclxuICAgIGluc3RhbmNlcy5wdXNoKGluc3RhbmNlKTtcclxuXHJcbiAgICByZXR1cm4gaW5zdGFuY2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEFuaW1hdGlvbkluc3RhbmNlKHgsIHksIHopIHtcclxuICAgIHRoaXMuYW5pbWF0aW9uID0gbnVsbDtcclxuICAgIHRoaXMudCA9IDAuMDtcclxuICAgIHRoaXMuc3RhdGUgPSAwO1xyXG4gICAgdGhpcy5wb3MgPSB2ZWMzLmZyb21WYWx1ZXMoeCwgeSwgeik7XHJcbn1cclxuXHJcbkFuaW1hdGlvbkluc3RhbmNlLnByb3RvdHlwZS5zZXRBbmltYXRpb24gPSBmdW5jdGlvbiAobmFtZSkge1xyXG5cclxuICAgIHRoaXMuYW5pbWF0aW9uID0gZmluZEFuaW1hdGlvbkJ5TmFtZShuYW1lKTtcclxuICAgIHRoaXMudCA9IDAuMDtcclxuICAgIHRoaXMuc3RhdGUgPSAwO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuaW5pdGlhbGl6ZSA9IGluaXRpYWxpemU7XHJcbm1vZHVsZS5leHBvcnRzLmNyZWF0ZUFuaW1hdGlvbkluc3RhbmNlID0gY3JlYXRlQW5pbWF0aW9uSW5zdGFuY2U7XHJcbm1vZHVsZS5leHBvcnRzLmFkdmFuY2UgPSBhZHZhbmNlO1xyXG5tb2R1bGUuZXhwb3J0cy5kcmF3QW5pbWF0aW9ucyA9IGRyYXdBbmltYXRpb25zOyIsImNvbnN0IHZlYzMgPSByZXF1aXJlKCdnbC1tYXRyaXgnKS52ZWMzO1xyXG5cclxuZnVuY3Rpb24gQm9uZShpZCwgbmFtZSwgb2Zmc2V0LCB0YWlsLCBzaXplLCBwYXJlbnQpIHtcclxuXHJcbiAgICB0aGlzLmlkID0gaWQ7XHJcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xyXG5cclxuICAgIHRoaXMub2Zmc2V0ID0gb2Zmc2V0O1xyXG4gICAgdGhpcy50YWlsID0gdGFpbDtcclxuICAgIHRoaXMuc2l6ZSA9IHNpemU7XHJcblxyXG4gICAgdGhpcy5jaGlsZHMgPSBbXTtcclxuXHJcbiAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcclxuICAgIGlmICh0aGlzLnBhcmVudCAhPT0gbnVsbClcclxuICAgICAgICB0aGlzLnBhcmVudC5jaGlsZHMucHVzaCh0aGlzKTtcclxuXHJcbiAgICB0aGlzLmJvbmVPZmZzZXQgPSBudWxsO1xyXG4gICAgdGhpcy5taWRkbGVUcmFuc2xhdGlvbiA9IG51bGw7XHJcbiAgICB0aGlzLnBhcmVudElkID0gLTE7XHJcblxyXG4gICAgdGhpcy5jYWxjdWxhdGVJbmRpcmVjdFZhbHVlcygpO1xyXG59XHJcblxyXG5Cb25lLnByb3RvdHlwZS5jYWxjdWxhdGVJbmRpcmVjdFZhbHVlcyA9IGZ1bmN0aW9uICgpIHtcclxuXHJcbiAgICBsZXQgb2Zmc2V0O1xyXG4gICAgaWYgKHRoaXMucGFyZW50ICE9PSBudWxsKSB7XHJcblxyXG4gICAgICAgIG9mZnNldCA9IHZlYzMuY3JlYXRlKCk7XHJcbiAgICAgICAgdmVjMy5tdWwob2Zmc2V0LCB0aGlzLm9mZnNldCwgdGhpcy5wYXJlbnQuc2l6ZSk7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICAgICAgb2Zmc2V0ID0gdmVjMy5mcm9tVmFsdWVzKDAsIDAsIDApO1xyXG5cclxuICAgIHRoaXMuYm9uZU9mZnNldCA9IG9mZnNldDtcclxuXHJcbiAgICBjb25zdCBoYWxmID0gdmVjMy5mcm9tVmFsdWVzKDAuNSwgMC41LCAwLjUpO1xyXG4gICAgY29uc3QgbWlkZGxlVHJhbnNsYXRpb24gPSB2ZWMzLmNyZWF0ZSgpO1xyXG4gICAgdmVjMy5tdWwobWlkZGxlVHJhbnNsYXRpb24sIHRoaXMudGFpbCwgdGhpcy5zaXplKTtcclxuICAgIHZlYzMubXVsKG1pZGRsZVRyYW5zbGF0aW9uLCBtaWRkbGVUcmFuc2xhdGlvbiwgaGFsZik7XHJcblxyXG4gICAgdGhpcy5taWRkbGVUcmFuc2xhdGlvbiA9IG1pZGRsZVRyYW5zbGF0aW9uO1xyXG5cclxuICAgIGlmICh0aGlzLnBhcmVudCAhPT0gbnVsbClcclxuICAgICAgICB0aGlzLnBhcmVudElkID0gdGhpcy5wYXJlbnQuaWQ7XHJcbiAgICBlbHNlXHJcbiAgICAgICAgdGhpcy5wYXJlbnRJZCA9IC0xO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gQ2hhcmFjdGVyKCkge1xyXG5cclxuICAgIHRoaXMubmV4dEJvbmVJRCA9IDA7XHJcbiAgICB0aGlzLmJvbmVzID0gbmV3IE1hcCgpO1xyXG4gICAgdGhpcy5wZWx2aXMgPSBudWxsO1xyXG5cclxuICAgIHRoaXMuZ2VuZXJhdGVCb25lcygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhcnJheVRvVmVjMyhhKSB7XHJcbiAgICByZXR1cm4gdmVjMy5mcm9tVmFsdWVzKGFbMF0sIGFbMV0sIGFbMl0pO1xyXG59XHJcblxyXG5DaGFyYWN0ZXIucHJvdG90eXBlLmdlbmVyYXRlQm9uZSA9IGZ1bmN0aW9uIChwYXJlbnQsIHRhaWwsIHNpemUsIG9mZnNldCwgbmFtZSkge1xyXG5cclxuICAgIGNvbnN0IGNtVG9NZXRlcnMgPSAwLjAxO1xyXG5cclxuICAgIGNvbnN0IHNpemVJbk1ldGVycyA9IHZlYzMuY3JlYXRlKCk7XHJcbiAgICB2ZWMzLm11bChzaXplSW5NZXRlcnMsIGFycmF5VG9WZWMzKHNpemUpLCB2ZWMzLmZyb21WYWx1ZXMoY21Ub01ldGVycywgY21Ub01ldGVycywgY21Ub01ldGVycykpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBCb25lKHRoaXMubmV4dEJvbmVJRCsrLCBuYW1lLCBhcnJheVRvVmVjMyhvZmZzZXQpLCBhcnJheVRvVmVjMyh0YWlsKSwgc2l6ZUluTWV0ZXJzLCBwYXJlbnQpO1xyXG5cclxuICAgIHRoaXMuYm9uZXMuc2V0KHJlc3VsdC5uYW1lLCByZXN1bHQpO1xyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG5DaGFyYWN0ZXIucHJvdG90eXBlLmdlbmVyYXRlUmlnaHRTaWRlID0gZnVuY3Rpb24gKGxlZnRCb25lLCByaWdodFBhcmVudCkge1xyXG5cclxuICAgIGNvbnN0IG1pcnJvclZlY3RvciA9IHZlYzMuZnJvbVZhbHVlcygxLCAtMSwgMSk7XHJcblxyXG4gICAgY29uc3Qgb3JpZ2luYWxOYW1lID0gbGVmdEJvbmUubmFtZTtcclxuICAgIHRoaXMuYm9uZXMuZGVsZXRlKG9yaWdpbmFsTmFtZSk7XHJcblxyXG4gICAgbGVmdEJvbmUubmFtZSA9IFwiTGVmdCBcIiArIG9yaWdpbmFsTmFtZTtcclxuXHJcbiAgICBjb25zdCByaWdodE9mZnNldCA9IHZlYzMuY3JlYXRlKCk7XHJcbiAgICB2ZWMzLm11bChyaWdodE9mZnNldCwgbGVmdEJvbmUub2Zmc2V0LCBtaXJyb3JWZWN0b3IpO1xyXG5cclxuICAgIGNvbnN0IHJpZ2h0VGFpbCA9IHZlYzMuY3JlYXRlKCk7XHJcbiAgICB2ZWMzLm11bChyaWdodFRhaWwsIGxlZnRCb25lLnRhaWwsIG1pcnJvclZlY3Rvcik7XHJcblxyXG4gICAgY29uc3QgcmlnaHRCb25lID0gbmV3IEJvbmUodGhpcy5uZXh0Qm9uZUlEKyssIFwiUmlnaHQgXCIgKyBvcmlnaW5hbE5hbWUsIHJpZ2h0T2Zmc2V0LCByaWdodFRhaWwsXHJcbiAgICAgICAgbGVmdEJvbmUuc2l6ZSwgcmlnaHRQYXJlbnQpO1xyXG5cclxuICAgIHRoaXMuYm9uZXMuc2V0KGxlZnRCb25lLm5hbWUsIGxlZnRCb25lKTtcclxuICAgIHRoaXMuYm9uZXMuc2V0KHJpZ2h0Qm9uZS5uYW1lLCByaWdodEJvbmUpO1xyXG5cclxuICAgIGxlZnRCb25lLmNoaWxkcy5mb3JFYWNoKGZ1bmN0aW9uKGxlZnRDaGlsZCkge1xyXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVSaWdodFNpZGUobGVmdENoaWxkLCByaWdodEJvbmUpO1xyXG4gICAgfSwgdGhpcyk7XHJcbn07XHJcblxyXG5DaGFyYWN0ZXIucHJvdG90eXBlLmdlbmVyYXRlQm9uZXMgPSBmdW5jdGlvbiAoKSB7XHJcblxyXG4gICAgdGhpcy5wZWx2aXMgPSB0aGlzLmdlbmVyYXRlQm9uZShudWxsLCBbIDAsIDAsIDEgXSwgWyA2LjUsIDEzLjAsIDE3LjYgXSwgWyAwLCAwLCAwIF0sIFwiUGVsdmlzXCIpO1xyXG4gICAgY29uc3Qgc3RvbWFjaCA9IHRoaXMuZ2VuZXJhdGVCb25lKHRoaXMucGVsdmlzLCBbIDAsIDAsIDEgXSwgWyA2LjUsIDEzLCAxNy42IF0sIFsgMCwgMCwgMSBdLCBcIlN0b21hY2hcIik7XHJcbiAgICBjb25zdCBjaGVzdCA9IHRoaXMuZ2VuZXJhdGVCb25lKHN0b21hY2gsIFsgMCwgMCwgMSBdLCBbIDYuNSwgMTMsIDE3LjYgXSwgWyAwLCAwLCAxIF0sIFwiQ2hlc3RcIik7XHJcblxyXG4gICAgY29uc3QgbmVjayA9IHRoaXMuZ2VuZXJhdGVCb25lKGNoZXN0LCBbIDAsIDAsIDEgXSwgWyAzLCAzLCAxNSBdLCBbIDAsIDAsIDEgXSwgXCJOZWNrXCIpO1xyXG4gICAgY29uc3QgaGVhZCA9IHRoaXMuZ2VuZXJhdGVCb25lKG5lY2ssIFsgMCwgMCwgMCBdLCBbIDE1LCAxNSwgMjAgXSwgWyAwLCAwLCAxIF0sIFwiSGVhZFwiKTtcclxuXHJcbiAgICBjb25zdCB1cHBlckxlZyA9IHRoaXMuZ2VuZXJhdGVCb25lKHRoaXMucGVsdmlzLCBbIDAsIDAsIC0xIF0sIFsgNi41LCA2LjUsIDQ2IF0sIFsgMCwgMC41LCAwIF0sIFwiVXBwZXIgTGVnXCIpO1xyXG4gICAgY29uc3QgbG93ZXJMZWcgPSB0aGlzLmdlbmVyYXRlQm9uZSh1cHBlckxlZywgWyAwLCAwLCAtMSBdLCBbIDYuNDksIDYuNDksIDQ1IF0sIFsgMCwgMCwgLTEgXSwgXCJMb3dlciBMZWdcIik7XHJcbiAgICBjb25zdCBmb290ID0gdGhpcy5nZW5lcmF0ZUJvbmUobG93ZXJMZWcsIFsgMTUuNSAvIDIyLCAwLCAwIF0sIFsgMjIsIDgsIDMgXSwgWyAwLCAwLCAtMS4xNzUgXSwgXCJGb290XCIpO1xyXG5cclxuICAgIHRoaXMuZ2VuZXJhdGVSaWdodFNpZGUodXBwZXJMZWcsIHVwcGVyTGVnLnBhcmVudCk7XHJcblxyXG4gICAgY29uc3QgdXBwZXJBcm0gPSB0aGlzLmdlbmVyYXRlQm9uZShjaGVzdCwgWyAwLCAxLCAwIF0sIFsgNC41LCAzMiwgNC41IF0sIFsgMCwgMC44NSwgMSBdLCBcIlVwcGVyIEFybVwiKTtcclxuICAgIGNvbnN0IGxvd2VyQXJtID0gdGhpcy5nZW5lcmF0ZUJvbmUodXBwZXJBcm0sIFsgMCwgMSwgMCBdLCBbIDQuNDksIDI4LCA0LjQ5IF0sIFsgMCwgMSwgMCBdLCBcIkxvd2VyIEFybVwiLCk7XHJcbiAgICBjb25zdCBoYW5kID0gdGhpcy5nZW5lcmF0ZUJvbmUobG93ZXJBcm0sIFsgMCwgMSwgMCBdLCBbIDMuNSwgMTUsIDEuNSBdLCBbIDAsIDEsIDAgXSwgXCJIYW5kXCIpO1xyXG5cclxuICAgIHRoaXMuZ2VuZXJhdGVSaWdodFNpZGUodXBwZXJBcm0sIHVwcGVyQXJtLnBhcmVudCk7XHJcbn07XHJcblxyXG5DaGFyYWN0ZXIucHJvdG90eXBlLmdldEJvbmVJZEJ5TmFtZSA9IGZ1bmN0aW9uIChuYW1lKSB7XHJcblxyXG4gICAgY29uc3QgYm9uZSA9IHRoaXMuYm9uZXMuZ2V0KG5hbWUpO1xyXG5cclxuICAgIHJldHVybiAoYm9uZSA/IGJvbmUuaWQgOiAtMSk7XHJcbn07XHJcblxyXG5DaGFyYWN0ZXIucHJvdG90eXBlLmdldEJvbmVDb3VudCA9IGZ1bmN0aW9uICgpIHtcclxuXHJcbiAgICByZXR1cm4gdGhpcy5ib25lcy5zaXplO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuQ2hhcmFjdGVyID0gQ2hhcmFjdGVyOyIsImNvbnN0IFJlbmRlciA9IHJlcXVpcmUoXCIuL3JlbmRlci5qc1wiKTtcclxuY29uc3QgUmVzb3VyY2VMb2FkZXIgPSByZXF1aXJlKFwiLi9yZXNvdXJjZS1sb2FkZXIuanNcIik7XHJcbmNvbnN0IEFuaW1hdGlvbk1hbmFnZXIgPSByZXF1aXJlKFwiLi9hbmltYXRpb24tbWFuYWdlclwiKTtcclxuXHJcbmNvbnN0IGZwcyA9IDYwO1xyXG5jb25zdCBmcHNJbnRlcnZhbCA9IDEwMDAgLyBmcHM7XHJcbmNvbnN0IGR0ID0gMS4wIC8gZnBzO1xyXG5cclxubGV0IGxhc3RGcmFtZVRpbWUgPSAwO1xyXG5sZXQgbGFzdEZQU1VwZGF0ZVRpbWUgPSAwO1xyXG5sZXQgY3VycmVudEZQUyA9IDA7XHJcblxyXG5mdW5jdGlvbiB0aWNrKCkge1xyXG5cclxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcblxyXG4gICAgY29uc3QgZWxhcHNlZFNpbmNlTGFzdEZyYW1lID0gbm93IC0gbGFzdEZyYW1lVGltZTtcclxuICAgIGlmIChlbGFwc2VkU2luY2VMYXN0RnJhbWUgPj0gZnBzSW50ZXJ2YWwgfHwgdHJ1ZSkge1xyXG5cclxuICAgICAgICBsYXN0RnJhbWVUaW1lID0gbm93IC0gKGVsYXBzZWRTaW5jZUxhc3RGcmFtZSAlIGZwc0ludGVydmFsKTtcclxuXHJcbiAgICAgICAgQW5pbWF0aW9uTWFuYWdlci5hZHZhbmNlKGR0KTtcclxuICAgICAgICBBbmltYXRpb25NYW5hZ2VyLmRyYXdBbmltYXRpb25zKCk7XHJcblxyXG4gICAgICAgIGN1cnJlbnRGUFMrKztcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmcHNVcGRhdGVJbnRlcnZhbCA9IDEwMDA7XHJcbiAgICBjb25zdCBlbGFwc2VkU2luY2VMYXN0RlBTVXBkYXRlID0gbm93IC0gbGFzdEZQU1VwZGF0ZVRpbWU7XHJcbiAgICBpZiAoZWxhcHNlZFNpbmNlTGFzdEZQU1VwZGF0ZSA+PSBmcHNVcGRhdGVJbnRlcnZhbCkge1xyXG5cclxuICAgICAgICBsYXN0RlBTVXBkYXRlVGltZSA9IG5vdyAtIChlbGFwc2VkU2luY2VMYXN0RlBTVXBkYXRlICUgZnBzVXBkYXRlSW50ZXJ2YWwpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC50aXRsZSA9IGN1cnJlbnRGUFMgKyBcIiBGUFNcIjtcclxuXHJcbiAgICAgICAgY3VycmVudEZQUyA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZGVkKCkge1xyXG5cclxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ2FtZS1zdXJmYWNlXCIpO1xyXG4gICAgUmVuZGVyLnNldFNjcmVlblNpemUoY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICBBbmltYXRpb25NYW5hZ2VyLmluaXRpYWxpemUoKTtcclxuXHJcbiAgICBjb25zdCBzaXplID0gNjQ7XHJcbiAgICBjb25zdCBzcGFjaW5nID0gMS4wO1xyXG5cclxuICAgIGZvciAobGV0IHggPSAwOyB4IDwgc2l6ZTsgeCsrKVxyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgc2l6ZTsgeSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlID0gQW5pbWF0aW9uTWFuYWdlci5jcmVhdGVBbmltYXRpb25JbnN0YW5jZSgteCAqIHNwYWNpbmcsIHkgKiBzcGFjaW5nLCAwKTtcclxuICAgICAgICAgICAgaW5zdGFuY2Uuc2V0QW5pbWF0aW9uKFwibmV3X3dhbGtcIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgIC8vIHNldEludGVydmFsKHRpY2ssIDApO1xyXG4gICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcclxufVxyXG5cclxuaWYgKCFSZW5kZXIuaW5pdGlhbGl6ZSgpKSB7XHJcbiAgICAvLyBUT0RPIHNob3cgbWVzc2FnZSBhYm91dCBub3QgYmVpbmcgYWJsZSB0byBkcmF3XHJcbiAgICByZXR1cm47XHJcbn1cclxuXHJcbi8vIFRPRE8gc2hvdyBzb21lIGxvYWRpbmcgc2NyZWVuXHJcblxyXG5SZXNvdXJjZUxvYWRlci5pbml0aWFsaXplKGxvYWRlZCk7IiwiLyohXG5AZmlsZW92ZXJ2aWV3IGdsLW1hdHJpeCAtIEhpZ2ggcGVyZm9ybWFuY2UgbWF0cml4IGFuZCB2ZWN0b3Igb3BlcmF0aW9uc1xuQGF1dGhvciBCcmFuZG9uIEpvbmVzXG5AYXV0aG9yIENvbGluIE1hY0tlbnppZSBJVlxuQHZlcnNpb24gMi43LjBcblxuQ29weXJpZ2h0IChjKSAyMDE1LTIwMTgsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi5cblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG5mdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLlxuXG4qL1xuIWZ1bmN0aW9uKHQsbil7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMmJlwib2JqZWN0XCI9PXR5cGVvZiBtb2R1bGUpbW9kdWxlLmV4cG9ydHM9bigpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShbXSxuKTtlbHNle3ZhciByPW4oKTtmb3IodmFyIGEgaW4gcikoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHM/ZXhwb3J0czp0KVthXT1yW2FdfX0oXCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGY/c2VsZjp0aGlzLGZ1bmN0aW9uKCl7cmV0dXJuIGZ1bmN0aW9uKHQpe3ZhciBuPXt9O2Z1bmN0aW9uIHIoYSl7aWYoblthXSlyZXR1cm4gblthXS5leHBvcnRzO3ZhciBlPW5bYV09e2k6YSxsOiExLGV4cG9ydHM6e319O3JldHVybiB0W2FdLmNhbGwoZS5leHBvcnRzLGUsZS5leHBvcnRzLHIpLGUubD0hMCxlLmV4cG9ydHN9cmV0dXJuIHIubT10LHIuYz1uLHIuZD1mdW5jdGlvbih0LG4sYSl7ci5vKHQsbil8fE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0LG4se2VudW1lcmFibGU6ITAsZ2V0OmF9KX0sci5yPWZ1bmN0aW9uKHQpe1widW5kZWZpbmVkXCIhPXR5cGVvZiBTeW1ib2wmJlN5bWJvbC50b1N0cmluZ1RhZyYmT2JqZWN0LmRlZmluZVByb3BlcnR5KHQsU3ltYm9sLnRvU3RyaW5nVGFnLHt2YWx1ZTpcIk1vZHVsZVwifSksT2JqZWN0LmRlZmluZVByb3BlcnR5KHQsXCJfX2VzTW9kdWxlXCIse3ZhbHVlOiEwfSl9LHIudD1mdW5jdGlvbih0LG4pe2lmKDEmbiYmKHQ9cih0KSksOCZuKXJldHVybiB0O2lmKDQmbiYmXCJvYmplY3RcIj09dHlwZW9mIHQmJnQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgYT1PYmplY3QuY3JlYXRlKG51bGwpO2lmKHIucihhKSxPYmplY3QuZGVmaW5lUHJvcGVydHkoYSxcImRlZmF1bHRcIix7ZW51bWVyYWJsZTohMCx2YWx1ZTp0fSksMiZuJiZcInN0cmluZ1wiIT10eXBlb2YgdClmb3IodmFyIGUgaW4gdClyLmQoYSxlLGZ1bmN0aW9uKG4pe3JldHVybiB0W25dfS5iaW5kKG51bGwsZSkpO3JldHVybiBhfSxyLm49ZnVuY3Rpb24odCl7dmFyIG49dCYmdC5fX2VzTW9kdWxlP2Z1bmN0aW9uKCl7cmV0dXJuIHQuZGVmYXVsdH06ZnVuY3Rpb24oKXtyZXR1cm4gdH07cmV0dXJuIHIuZChuLFwiYVwiLG4pLG59LHIubz1mdW5jdGlvbih0LG4pe3JldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxuKX0sci5wPVwiXCIscihyLnM9MTApfShbZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc2V0TWF0cml4QXJyYXlUeXBlPWZ1bmN0aW9uKHQpe24uQVJSQVlfVFlQRT10fSxuLnRvUmFkaWFuPWZ1bmN0aW9uKHQpe3JldHVybiB0KmV9LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIE1hdGguYWJzKHQtbik8PWEqTWF0aC5tYXgoMSxNYXRoLmFicyh0KSxNYXRoLmFicyhuKSl9O3ZhciBhPW4uRVBTSUxPTj0xZS02O24uQVJSQVlfVFlQRT1cInVuZGVmaW5lZFwiIT10eXBlb2YgRmxvYXQzMkFycmF5P0Zsb2F0MzJBcnJheTpBcnJheSxuLlJBTkRPTT1NYXRoLnJhbmRvbTt2YXIgZT1NYXRoLlBJLzE4MH0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uZm9yRWFjaD1uLnNxckxlbj1uLmxlbj1uLnNxckRpc3Q9bi5kaXN0PW4uZGl2PW4ubXVsPW4uc3ViPXZvaWQgMCxuLmNyZWF0ZT1lLG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSg0KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG59LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlKXt2YXIgdT1uZXcgYS5BUlJBWV9UWVBFKDQpO3JldHVybiB1WzBdPXQsdVsxXT1uLHVbMl09cix1WzNdPWUsdX0sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0fSxuLnNldD1mdW5jdGlvbih0LG4scixhLGUpe3JldHVybiB0WzBdPW4sdFsxXT1yLHRbMl09YSx0WzNdPWUsdH0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0WzNdPW5bM10rclszXSx0fSxuLnN1YnRyYWN0PXUsbi5tdWx0aXBseT1vLG4uZGl2aWRlPWksbi5jZWlsPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5jZWlsKG5bMF0pLHRbMV09TWF0aC5jZWlsKG5bMV0pLHRbMl09TWF0aC5jZWlsKG5bMl0pLHRbM109TWF0aC5jZWlsKG5bM10pLHR9LG4uZmxvb3I9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLmZsb29yKG5bMF0pLHRbMV09TWF0aC5mbG9vcihuWzFdKSx0WzJdPU1hdGguZmxvb3IoblsyXSksdFszXT1NYXRoLmZsb29yKG5bM10pLHR9LG4ubWluPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1NYXRoLm1pbihuWzBdLHJbMF0pLHRbMV09TWF0aC5taW4oblsxXSxyWzFdKSx0WzJdPU1hdGgubWluKG5bMl0sclsyXSksdFszXT1NYXRoLm1pbihuWzNdLHJbM10pLHR9LG4ubWF4PWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1NYXRoLm1heChuWzBdLHJbMF0pLHRbMV09TWF0aC5tYXgoblsxXSxyWzFdKSx0WzJdPU1hdGgubWF4KG5bMl0sclsyXSksdFszXT1NYXRoLm1heChuWzNdLHJbM10pLHR9LG4ucm91bmQ9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLnJvdW5kKG5bMF0pLHRbMV09TWF0aC5yb3VuZChuWzFdKSx0WzJdPU1hdGgucm91bmQoblsyXSksdFszXT1NYXRoLnJvdW5kKG5bM10pLHR9LG4uc2NhbGU9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qcix0WzFdPW5bMV0qcix0WzJdPW5bMl0qcix0WzNdPW5bM10qcix0fSxuLnNjYWxlQW5kQWRkPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW5bMF0rclswXSphLHRbMV09blsxXStyWzFdKmEsdFsyXT1uWzJdK3JbMl0qYSx0WzNdPW5bM10rclszXSphLHR9LG4uZGlzdGFuY2U9cyxuLnNxdWFyZWREaXN0YW5jZT1jLG4ubGVuZ3RoPWYsbi5zcXVhcmVkTGVuZ3RoPU0sbi5uZWdhdGU9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0tblswXSx0WzFdPS1uWzFdLHRbMl09LW5bMl0sdFszXT0tblszXSx0fSxuLmludmVyc2U9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0xL25bMF0sdFsxXT0xL25bMV0sdFsyXT0xL25bMl0sdFszXT0xL25bM10sdH0sbi5ub3JtYWxpemU9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89cipyK2EqYStlKmUrdSp1O28+MCYmKG89MS9NYXRoLnNxcnQobyksdFswXT1yKm8sdFsxXT1hKm8sdFsyXT1lKm8sdFszXT11Km8pO3JldHVybiB0fSxuLmRvdD1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdKm5bMF0rdFsxXSpuWzFdK3RbMl0qblsyXSt0WzNdKm5bM119LG4ubGVycD1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLHU9blsxXSxvPW5bMl0saT1uWzNdO3JldHVybiB0WzBdPWUrYSooclswXS1lKSx0WzFdPXUrYSooclsxXS11KSx0WzJdPW8rYSooclsyXS1vKSx0WzNdPWkrYSooclszXS1pKSx0fSxuLnJhbmRvbT1mdW5jdGlvbih0LG4pe3ZhciByLGUsdSxvLGkscztuPW58fDE7ZG97cj0yKmEuUkFORE9NKCktMSxlPTIqYS5SQU5ET00oKS0xLGk9cipyK2UqZX13aGlsZShpPj0xKTtkb3t1PTIqYS5SQU5ET00oKS0xLG89MiphLlJBTkRPTSgpLTEscz11KnUrbypvfXdoaWxlKHM+PTEpO3ZhciBjPU1hdGguc3FydCgoMS1pKS9zKTtyZXR1cm4gdFswXT1uKnIsdFsxXT1uKmUsdFsyXT1uKnUqYyx0WzNdPW4qbypjLHR9LG4udHJhbnNmb3JtTWF0ND1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXTtyZXR1cm4gdFswXT1yWzBdKmErcls0XSplK3JbOF0qdStyWzEyXSpvLHRbMV09clsxXSphK3JbNV0qZStyWzldKnUrclsxM10qbyx0WzJdPXJbMl0qYStyWzZdKmUrclsxMF0qdStyWzE0XSpvLHRbM109clszXSphK3JbN10qZStyWzExXSp1K3JbMTVdKm8sdH0sbi50cmFuc2Zvcm1RdWF0PWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1yWzBdLGk9clsxXSxzPXJbMl0sYz1yWzNdLGY9YyphK2kqdS1zKmUsTT1jKmUrcyphLW8qdSxoPWMqdStvKmUtaSphLGw9LW8qYS1pKmUtcyp1O3JldHVybiB0WzBdPWYqYytsKi1vK00qLXMtaCotaSx0WzFdPU0qYytsKi1pK2gqLW8tZiotcyx0WzJdPWgqYytsKi1zK2YqLWktTSotbyx0WzNdPW5bM10sdH0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJ2ZWM0KFwiK3RbMF0rXCIsIFwiK3RbMV0rXCIsIFwiK3RbMl0rXCIsIFwiK3RbM10rXCIpXCJ9LG4uZXhhY3RFcXVhbHM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT09PW5bMF0mJnRbMV09PT1uWzFdJiZ0WzJdPT09blsyXSYmdFszXT09PW5bM119LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89dFszXSxpPW5bMF0scz1uWzFdLGM9blsyXSxmPW5bM107cmV0dXJuIE1hdGguYWJzKHItaSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHIpLE1hdGguYWJzKGkpKSYmTWF0aC5hYnMoZS1zKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZSksTWF0aC5hYnMocykpJiZNYXRoLmFicyh1LWMpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyh1KSxNYXRoLmFicyhjKSkmJk1hdGguYWJzKG8tZik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKG8pLE1hdGguYWJzKGYpKX07dmFyIGE9ZnVuY3Rpb24odCl7aWYodCYmdC5fX2VzTW9kdWxlKXJldHVybiB0O3ZhciBuPXt9O2lmKG51bGwhPXQpZm9yKHZhciByIGluIHQpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQscikmJihuW3JdPXRbcl0pO3JldHVybiBuLmRlZmF1bHQ9dCxufShyKDApKTtmdW5jdGlvbiBlKCl7dmFyIHQ9bmV3IGEuQVJSQVlfVFlQRSg0KTtyZXR1cm4gYS5BUlJBWV9UWVBFIT1GbG9hdDMyQXJyYXkmJih0WzBdPTAsdFsxXT0wLHRbMl09MCx0WzNdPTApLHR9ZnVuY3Rpb24gdSh0LG4scil7cmV0dXJuIHRbMF09blswXS1yWzBdLHRbMV09blsxXS1yWzFdLHRbMl09blsyXS1yWzJdLHRbM109blszXS1yWzNdLHR9ZnVuY3Rpb24gbyh0LG4scil7cmV0dXJuIHRbMF09blswXSpyWzBdLHRbMV09blsxXSpyWzFdLHRbMl09blsyXSpyWzJdLHRbM109blszXSpyWzNdLHR9ZnVuY3Rpb24gaSh0LG4scil7cmV0dXJuIHRbMF09blswXS9yWzBdLHRbMV09blsxXS9yWzFdLHRbMl09blsyXS9yWzJdLHRbM109blszXS9yWzNdLHR9ZnVuY3Rpb24gcyh0LG4pe3ZhciByPW5bMF0tdFswXSxhPW5bMV0tdFsxXSxlPW5bMl0tdFsyXSx1PW5bM10tdFszXTtyZXR1cm4gTWF0aC5zcXJ0KHIqcithKmErZSplK3UqdSl9ZnVuY3Rpb24gYyh0LG4pe3ZhciByPW5bMF0tdFswXSxhPW5bMV0tdFsxXSxlPW5bMl0tdFsyXSx1PW5bM10tdFszXTtyZXR1cm4gcipyK2EqYStlKmUrdSp1fWZ1bmN0aW9uIGYodCl7dmFyIG49dFswXSxyPXRbMV0sYT10WzJdLGU9dFszXTtyZXR1cm4gTWF0aC5zcXJ0KG4qbityKnIrYSphK2UqZSl9ZnVuY3Rpb24gTSh0KXt2YXIgbj10WzBdLHI9dFsxXSxhPXRbMl0sZT10WzNdO3JldHVybiBuKm4rcipyK2EqYStlKmV9bi5zdWI9dSxuLm11bD1vLG4uZGl2PWksbi5kaXN0PXMsbi5zcXJEaXN0PWMsbi5sZW49ZixuLnNxckxlbj1NLG4uZm9yRWFjaD1mdW5jdGlvbigpe3ZhciB0PWUoKTtyZXR1cm4gZnVuY3Rpb24obixyLGEsZSx1LG8pe3ZhciBpPXZvaWQgMCxzPXZvaWQgMDtmb3Iocnx8KHI9NCksYXx8KGE9MCkscz1lP01hdGgubWluKGUqcithLG4ubGVuZ3RoKTpuLmxlbmd0aCxpPWE7aTxzO2krPXIpdFswXT1uW2ldLHRbMV09bltpKzFdLHRbMl09bltpKzJdLHRbM109bltpKzNdLHUodCx0LG8pLG5baV09dFswXSxuW2krMV09dFsxXSxuW2krMl09dFsyXSxuW2krM109dFszXTtyZXR1cm4gbn19KCl9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLmZvckVhY2g9bi5zcXJMZW49bi5sZW49bi5zcXJEaXN0PW4uZGlzdD1uLmRpdj1uLm11bD1uLnN1Yj12b2lkIDAsbi5jcmVhdGU9ZSxuLmNsb25lPWZ1bmN0aW9uKHQpe3ZhciBuPW5ldyBhLkFSUkFZX1RZUEUoMyk7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sblsyXT10WzJdLG59LG4ubGVuZ3RoPXUsbi5mcm9tVmFsdWVzPW8sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHR9LG4uc2V0PWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW4sdFsxXT1yLHRbMl09YSx0fSxuLmFkZD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXStyWzBdLHRbMV09blsxXStyWzFdLHRbMl09blsyXStyWzJdLHR9LG4uc3VidHJhY3Q9aSxuLm11bHRpcGx5PXMsbi5kaXZpZGU9YyxuLmNlaWw9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLmNlaWwoblswXSksdFsxXT1NYXRoLmNlaWwoblsxXSksdFsyXT1NYXRoLmNlaWwoblsyXSksdH0sbi5mbG9vcj1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPU1hdGguZmxvb3IoblswXSksdFsxXT1NYXRoLmZsb29yKG5bMV0pLHRbMl09TWF0aC5mbG9vcihuWzJdKSx0fSxuLm1pbj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09TWF0aC5taW4oblswXSxyWzBdKSx0WzFdPU1hdGgubWluKG5bMV0sclsxXSksdFsyXT1NYXRoLm1pbihuWzJdLHJbMl0pLHR9LG4ubWF4PWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1NYXRoLm1heChuWzBdLHJbMF0pLHRbMV09TWF0aC5tYXgoblsxXSxyWzFdKSx0WzJdPU1hdGgubWF4KG5bMl0sclsyXSksdH0sbi5yb3VuZD1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPU1hdGgucm91bmQoblswXSksdFsxXT1NYXRoLnJvdW5kKG5bMV0pLHRbMl09TWF0aC5yb3VuZChuWzJdKSx0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdFsyXT1uWzJdKnIsdH0sbi5zY2FsZUFuZEFkZD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0qYSx0WzFdPW5bMV0rclsxXSphLHRbMl09blsyXStyWzJdKmEsdH0sbi5kaXN0YW5jZT1mLG4uc3F1YXJlZERpc3RhbmNlPU0sbi5zcXVhcmVkTGVuZ3RoPWgsbi5uZWdhdGU9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0tblswXSx0WzFdPS1uWzFdLHRbMl09LW5bMl0sdH0sbi5pbnZlcnNlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09MS9uWzBdLHRbMV09MS9uWzFdLHRbMl09MS9uWzJdLHR9LG4ubm9ybWFsaXplPWwsbi5kb3Q9dixuLmNyb3NzPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1yWzBdLGk9clsxXSxzPXJbMl07cmV0dXJuIHRbMF09ZSpzLXUqaSx0WzFdPXUqby1hKnMsdFsyXT1hKmktZSpvLHR9LG4ubGVycD1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLHU9blsxXSxvPW5bMl07cmV0dXJuIHRbMF09ZSthKihyWzBdLWUpLHRbMV09dSthKihyWzFdLXUpLHRbMl09bythKihyWzJdLW8pLHR9LG4uaGVybWl0ZT1mdW5jdGlvbih0LG4scixhLGUsdSl7dmFyIG89dSp1LGk9byooMip1LTMpKzEscz1vKih1LTIpK3UsYz1vKih1LTEpLGY9byooMy0yKnUpO3JldHVybiB0WzBdPW5bMF0qaStyWzBdKnMrYVswXSpjK2VbMF0qZix0WzFdPW5bMV0qaStyWzFdKnMrYVsxXSpjK2VbMV0qZix0WzJdPW5bMl0qaStyWzJdKnMrYVsyXSpjK2VbMl0qZix0fSxuLmJlemllcj1mdW5jdGlvbih0LG4scixhLGUsdSl7dmFyIG89MS11LGk9bypvLHM9dSp1LGM9aSpvLGY9Myp1KmksTT0zKnMqbyxoPXMqdTtyZXR1cm4gdFswXT1uWzBdKmMrclswXSpmK2FbMF0qTStlWzBdKmgsdFsxXT1uWzFdKmMrclsxXSpmK2FbMV0qTStlWzFdKmgsdFsyXT1uWzJdKmMrclsyXSpmK2FbMl0qTStlWzJdKmgsdH0sbi5yYW5kb209ZnVuY3Rpb24odCxuKXtuPW58fDE7dmFyIHI9MiphLlJBTkRPTSgpKk1hdGguUEksZT0yKmEuUkFORE9NKCktMSx1PU1hdGguc3FydCgxLWUqZSkqbjtyZXR1cm4gdFswXT1NYXRoLmNvcyhyKSp1LHRbMV09TWF0aC5zaW4ocikqdSx0WzJdPWUqbix0fSxuLnRyYW5zZm9ybU1hdDQ9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPXJbM10qYStyWzddKmUrclsxMV0qdStyWzE1XTtyZXR1cm4gbz1vfHwxLHRbMF09KHJbMF0qYStyWzRdKmUrcls4XSp1K3JbMTJdKS9vLHRbMV09KHJbMV0qYStyWzVdKmUrcls5XSp1K3JbMTNdKS9vLHRbMl09KHJbMl0qYStyWzZdKmUrclsxMF0qdStyWzE0XSkvbyx0fSxuLnRyYW5zZm9ybU1hdDM9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXTtyZXR1cm4gdFswXT1hKnJbMF0rZSpyWzNdK3Uqcls2XSx0WzFdPWEqclsxXStlKnJbNF0rdSpyWzddLHRbMl09YSpyWzJdK2Uqcls1XSt1KnJbOF0sdH0sbi50cmFuc2Zvcm1RdWF0PWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1yWzBdLGU9clsxXSx1PXJbMl0sbz1yWzNdLGk9blswXSxzPW5bMV0sYz1uWzJdLGY9ZSpjLXUqcyxNPXUqaS1hKmMsaD1hKnMtZSppLGw9ZSpoLXUqTSx2PXUqZi1hKmgsZD1hKk0tZSpmLGI9MipvO3JldHVybiBmKj1iLE0qPWIsaCo9YixsKj0yLHYqPTIsZCo9Mix0WzBdPWkrZitsLHRbMV09cytNK3YsdFsyXT1jK2grZCx0fSxuLnJvdGF0ZVg9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9W10sdT1bXTtyZXR1cm4gZVswXT1uWzBdLXJbMF0sZVsxXT1uWzFdLXJbMV0sZVsyXT1uWzJdLXJbMl0sdVswXT1lWzBdLHVbMV09ZVsxXSpNYXRoLmNvcyhhKS1lWzJdKk1hdGguc2luKGEpLHVbMl09ZVsxXSpNYXRoLnNpbihhKStlWzJdKk1hdGguY29zKGEpLHRbMF09dVswXStyWzBdLHRbMV09dVsxXStyWzFdLHRbMl09dVsyXStyWzJdLHR9LG4ucm90YXRlWT1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1bXSx1PVtdO3JldHVybiBlWzBdPW5bMF0tclswXSxlWzFdPW5bMV0tclsxXSxlWzJdPW5bMl0tclsyXSx1WzBdPWVbMl0qTWF0aC5zaW4oYSkrZVswXSpNYXRoLmNvcyhhKSx1WzFdPWVbMV0sdVsyXT1lWzJdKk1hdGguY29zKGEpLWVbMF0qTWF0aC5zaW4oYSksdFswXT11WzBdK3JbMF0sdFsxXT11WzFdK3JbMV0sdFsyXT11WzJdK3JbMl0sdH0sbi5yb3RhdGVaPWZ1bmN0aW9uKHQsbixyLGEpe3ZhciBlPVtdLHU9W107cmV0dXJuIGVbMF09blswXS1yWzBdLGVbMV09blsxXS1yWzFdLGVbMl09blsyXS1yWzJdLHVbMF09ZVswXSpNYXRoLmNvcyhhKS1lWzFdKk1hdGguc2luKGEpLHVbMV09ZVswXSpNYXRoLnNpbihhKStlWzFdKk1hdGguY29zKGEpLHVbMl09ZVsyXSx0WzBdPXVbMF0rclswXSx0WzFdPXVbMV0rclsxXSx0WzJdPXVbMl0rclsyXSx0fSxuLmFuZ2xlPWZ1bmN0aW9uKHQsbil7dmFyIHI9byh0WzBdLHRbMV0sdFsyXSksYT1vKG5bMF0sblsxXSxuWzJdKTtsKHIsciksbChhLGEpO3ZhciBlPXYocixhKTtyZXR1cm4gZT4xPzA6ZTwtMT9NYXRoLlBJOk1hdGguYWNvcyhlKX0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJ2ZWMzKFwiK3RbMF0rXCIsIFwiK3RbMV0rXCIsIFwiK3RbMl0rXCIpXCJ9LG4uZXhhY3RFcXVhbHM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT09PW5bMF0mJnRbMV09PT1uWzFdJiZ0WzJdPT09blsyXX0sbi5lcXVhbHM9ZnVuY3Rpb24odCxuKXt2YXIgcj10WzBdLGU9dFsxXSx1PXRbMl0sbz1uWzBdLGk9blsxXSxzPW5bMl07cmV0dXJuIE1hdGguYWJzKHItbyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHIpLE1hdGguYWJzKG8pKSYmTWF0aC5hYnMoZS1pKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZSksTWF0aC5hYnMoaSkpJiZNYXRoLmFicyh1LXMpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyh1KSxNYXRoLmFicyhzKSl9O3ZhciBhPWZ1bmN0aW9uKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn0ocigwKSk7ZnVuY3Rpb24gZSgpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoMyk7cmV0dXJuIGEuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFswXT0wLHRbMV09MCx0WzJdPTApLHR9ZnVuY3Rpb24gdSh0KXt2YXIgbj10WzBdLHI9dFsxXSxhPXRbMl07cmV0dXJuIE1hdGguc3FydChuKm4rcipyK2EqYSl9ZnVuY3Rpb24gbyh0LG4scil7dmFyIGU9bmV3IGEuQVJSQVlfVFlQRSgzKTtyZXR1cm4gZVswXT10LGVbMV09bixlWzJdPXIsZX1mdW5jdGlvbiBpKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdFsyXT1uWzJdLXJbMl0sdH1mdW5jdGlvbiBzKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnJbMF0sdFsxXT1uWzFdKnJbMV0sdFsyXT1uWzJdKnJbMl0sdH1mdW5jdGlvbiBjKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdL3JbMF0sdFsxXT1uWzFdL3JbMV0sdFsyXT1uWzJdL3JbMl0sdH1mdW5jdGlvbiBmKHQsbil7dmFyIHI9blswXS10WzBdLGE9blsxXS10WzFdLGU9blsyXS10WzJdO3JldHVybiBNYXRoLnNxcnQocipyK2EqYStlKmUpfWZ1bmN0aW9uIE0odCxuKXt2YXIgcj1uWzBdLXRbMF0sYT1uWzFdLXRbMV0sZT1uWzJdLXRbMl07cmV0dXJuIHIqcithKmErZSplfWZ1bmN0aW9uIGgodCl7dmFyIG49dFswXSxyPXRbMV0sYT10WzJdO3JldHVybiBuKm4rcipyK2EqYX1mdW5jdGlvbiBsKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9cipyK2EqYStlKmU7cmV0dXJuIHU+MCYmKHU9MS9NYXRoLnNxcnQodSksdFswXT1uWzBdKnUsdFsxXT1uWzFdKnUsdFsyXT1uWzJdKnUpLHR9ZnVuY3Rpb24gdih0LG4pe3JldHVybiB0WzBdKm5bMF0rdFsxXSpuWzFdK3RbMl0qblsyXX1uLnN1Yj1pLG4ubXVsPXMsbi5kaXY9YyxuLmRpc3Q9ZixuLnNxckRpc3Q9TSxuLmxlbj11LG4uc3FyTGVuPWgsbi5mb3JFYWNoPWZ1bmN0aW9uKCl7dmFyIHQ9ZSgpO3JldHVybiBmdW5jdGlvbihuLHIsYSxlLHUsbyl7dmFyIGk9dm9pZCAwLHM9dm9pZCAwO2ZvcihyfHwocj0zKSxhfHwoYT0wKSxzPWU/TWF0aC5taW4oZSpyK2Esbi5sZW5ndGgpOm4ubGVuZ3RoLGk9YTtpPHM7aSs9cil0WzBdPW5baV0sdFsxXT1uW2krMV0sdFsyXT1uW2krMl0sdSh0LHQsbyksbltpXT10WzBdLG5baSsxXT10WzFdLG5baSsyXT10WzJdO3JldHVybiBufX0oKX0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc2V0QXhlcz1uLnNxbGVycD1uLnJvdGF0aW9uVG89bi5lcXVhbHM9bi5leGFjdEVxdWFscz1uLm5vcm1hbGl6ZT1uLnNxckxlbj1uLnNxdWFyZWRMZW5ndGg9bi5sZW49bi5sZW5ndGg9bi5sZXJwPW4uZG90PW4uc2NhbGU9bi5tdWw9bi5hZGQ9bi5zZXQ9bi5jb3B5PW4uZnJvbVZhbHVlcz1uLmNsb25lPXZvaWQgMCxuLmNyZWF0ZT1zLG4uaWRlbnRpdHk9ZnVuY3Rpb24odCl7cmV0dXJuIHRbMF09MCx0WzFdPTAsdFsyXT0wLHRbM109MSx0fSxuLnNldEF4aXNBbmdsZT1jLG4uZ2V0QXhpc0FuZ2xlPWZ1bmN0aW9uKHQsbil7dmFyIHI9MipNYXRoLmFjb3MoblszXSksZT1NYXRoLnNpbihyLzIpO2U+YS5FUFNJTE9OPyh0WzBdPW5bMF0vZSx0WzFdPW5bMV0vZSx0WzJdPW5bMl0vZSk6KHRbMF09MSx0WzFdPTAsdFsyXT0wKTtyZXR1cm4gcn0sbi5tdWx0aXBseT1mLG4ucm90YXRlWD1mdW5jdGlvbih0LG4scil7cio9LjU7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPU1hdGguc2luKHIpLHM9TWF0aC5jb3Mocik7cmV0dXJuIHRbMF09YSpzK28qaSx0WzFdPWUqcyt1KmksdFsyXT11KnMtZSppLHRbM109bypzLWEqaSx0fSxuLnJvdGF0ZVk9ZnVuY3Rpb24odCxuLHIpe3IqPS41O3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1NYXRoLnNpbihyKSxzPU1hdGguY29zKHIpO3JldHVybiB0WzBdPWEqcy11KmksdFsxXT1lKnMrbyppLHRbMl09dSpzK2EqaSx0WzNdPW8qcy1lKmksdH0sbi5yb3RhdGVaPWZ1bmN0aW9uKHQsbixyKXtyKj0uNTt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9TWF0aC5zaW4ocikscz1NYXRoLmNvcyhyKTtyZXR1cm4gdFswXT1hKnMrZSppLHRbMV09ZSpzLWEqaSx0WzJdPXUqcytvKmksdFszXT1vKnMtdSppLHR9LG4uY2FsY3VsYXRlVz1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXTtyZXR1cm4gdFswXT1yLHRbMV09YSx0WzJdPWUsdFszXT1NYXRoLnNxcnQoTWF0aC5hYnMoMS1yKnItYSphLWUqZSkpLHR9LG4uc2xlcnA9TSxuLnJhbmRvbT1mdW5jdGlvbih0KXt2YXIgbj1hLlJBTkRPTSgpLHI9YS5SQU5ET00oKSxlPWEuUkFORE9NKCksdT1NYXRoLnNxcnQoMS1uKSxvPU1hdGguc3FydChuKTtyZXR1cm4gdFswXT11Kk1hdGguc2luKDIqTWF0aC5QSSpyKSx0WzFdPXUqTWF0aC5jb3MoMipNYXRoLlBJKnIpLHRbMl09bypNYXRoLnNpbigyKk1hdGguUEkqZSksdFszXT1vKk1hdGguY29zKDIqTWF0aC5QSSplKSx0fSxuLmludmVydD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1yKnIrYSphK2UqZSt1KnUsaT1vPzEvbzowO3JldHVybiB0WzBdPS1yKmksdFsxXT0tYSppLHRbMl09LWUqaSx0WzNdPXUqaSx0fSxuLmNvbmp1Z2F0ZT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPS1uWzBdLHRbMV09LW5bMV0sdFsyXT0tblsyXSx0WzNdPW5bM10sdH0sbi5mcm9tTWF0Mz1oLG4uZnJvbUV1bGVyPWZ1bmN0aW9uKHQsbixyLGEpe3ZhciBlPS41Kk1hdGguUEkvMTgwO24qPWUscio9ZSxhKj1lO3ZhciB1PU1hdGguc2luKG4pLG89TWF0aC5jb3MobiksaT1NYXRoLnNpbihyKSxzPU1hdGguY29zKHIpLGM9TWF0aC5zaW4oYSksZj1NYXRoLmNvcyhhKTtyZXR1cm4gdFswXT11KnMqZi1vKmkqYyx0WzFdPW8qaSpmK3UqcypjLHRbMl09bypzKmMtdSppKmYsdFszXT1vKnMqZit1KmkqYyx0fSxuLnN0cj1mdW5jdGlvbih0KXtyZXR1cm5cInF1YXQoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIilcIn07dmFyIGE9aShyKDApKSxlPWkocig1KSksdT1pKHIoMikpLG89aShyKDEpKTtmdW5jdGlvbiBpKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn1mdW5jdGlvbiBzKCl7dmFyIHQ9bmV3IGEuQVJSQVlfVFlQRSg0KTtyZXR1cm4gYS5BUlJBWV9UWVBFIT1GbG9hdDMyQXJyYXkmJih0WzBdPTAsdFsxXT0wLHRbMl09MCksdFszXT0xLHR9ZnVuY3Rpb24gYyh0LG4scil7cio9LjU7dmFyIGE9TWF0aC5zaW4ocik7cmV0dXJuIHRbMF09YSpuWzBdLHRbMV09YSpuWzFdLHRbMl09YSpuWzJdLHRbM109TWF0aC5jb3MociksdH1mdW5jdGlvbiBmKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9clswXSxzPXJbMV0sYz1yWzJdLGY9clszXTtyZXR1cm4gdFswXT1hKmYrbyppK2UqYy11KnMsdFsxXT1lKmYrbypzK3UqaS1hKmMsdFsyXT11KmYrbypjK2Eqcy1lKmksdFszXT1vKmYtYSppLWUqcy11KmMsdH1mdW5jdGlvbiBNKHQsbixyLGUpe3ZhciB1PW5bMF0sbz1uWzFdLGk9blsyXSxzPW5bM10sYz1yWzBdLGY9clsxXSxNPXJbMl0saD1yWzNdLGw9dm9pZCAwLHY9dm9pZCAwLGQ9dm9pZCAwLGI9dm9pZCAwLG09dm9pZCAwO3JldHVybih2PXUqYytvKmYraSpNK3MqaCk8MCYmKHY9LXYsYz0tYyxmPS1mLE09LU0saD0taCksMS12PmEuRVBTSUxPTj8obD1NYXRoLmFjb3ModiksZD1NYXRoLnNpbihsKSxiPU1hdGguc2luKCgxLWUpKmwpL2QsbT1NYXRoLnNpbihlKmwpL2QpOihiPTEtZSxtPWUpLHRbMF09Yip1K20qYyx0WzFdPWIqbyttKmYsdFsyXT1iKmkrbSpNLHRbM109YipzK20qaCx0fWZ1bmN0aW9uIGgodCxuKXt2YXIgcj1uWzBdK25bNF0rbls4XSxhPXZvaWQgMDtpZihyPjApYT1NYXRoLnNxcnQocisxKSx0WzNdPS41KmEsYT0uNS9hLHRbMF09KG5bNV0tbls3XSkqYSx0WzFdPShuWzZdLW5bMl0pKmEsdFsyXT0oblsxXS1uWzNdKSphO2Vsc2V7dmFyIGU9MDtuWzRdPm5bMF0mJihlPTEpLG5bOF0+blszKmUrZV0mJihlPTIpO3ZhciB1PShlKzEpJTMsbz0oZSsyKSUzO2E9TWF0aC5zcXJ0KG5bMyplK2VdLW5bMyp1K3VdLW5bMypvK29dKzEpLHRbZV09LjUqYSxhPS41L2EsdFszXT0oblszKnUrb10tblszKm8rdV0pKmEsdFt1XT0oblszKnUrZV0rblszKmUrdV0pKmEsdFtvXT0oblszKm8rZV0rblszKmUrb10pKmF9cmV0dXJuIHR9bi5jbG9uZT1vLmNsb25lLG4uZnJvbVZhbHVlcz1vLmZyb21WYWx1ZXMsbi5jb3B5PW8uY29weSxuLnNldD1vLnNldCxuLmFkZD1vLmFkZCxuLm11bD1mLG4uc2NhbGU9by5zY2FsZSxuLmRvdD1vLmRvdCxuLmxlcnA9by5sZXJwO3ZhciBsPW4ubGVuZ3RoPW8ubGVuZ3RoLHY9KG4ubGVuPWwsbi5zcXVhcmVkTGVuZ3RoPW8uc3F1YXJlZExlbmd0aCksZD0obi5zcXJMZW49dixuLm5vcm1hbGl6ZT1vLm5vcm1hbGl6ZSk7bi5leGFjdEVxdWFscz1vLmV4YWN0RXF1YWxzLG4uZXF1YWxzPW8uZXF1YWxzLG4ucm90YXRpb25Ubz1mdW5jdGlvbigpe3ZhciB0PXUuY3JlYXRlKCksbj11LmZyb21WYWx1ZXMoMSwwLDApLHI9dS5mcm9tVmFsdWVzKDAsMSwwKTtyZXR1cm4gZnVuY3Rpb24oYSxlLG8pe3ZhciBpPXUuZG90KGUsbyk7cmV0dXJuIGk8LS45OTk5OTk/KHUuY3Jvc3ModCxuLGUpLHUubGVuKHQpPDFlLTYmJnUuY3Jvc3ModCxyLGUpLHUubm9ybWFsaXplKHQsdCksYyhhLHQsTWF0aC5QSSksYSk6aT4uOTk5OTk5PyhhWzBdPTAsYVsxXT0wLGFbMl09MCxhWzNdPTEsYSk6KHUuY3Jvc3ModCxlLG8pLGFbMF09dFswXSxhWzFdPXRbMV0sYVsyXT10WzJdLGFbM109MStpLGQoYSxhKSl9fSgpLG4uc3FsZXJwPWZ1bmN0aW9uKCl7dmFyIHQ9cygpLG49cygpO3JldHVybiBmdW5jdGlvbihyLGEsZSx1LG8saSl7cmV0dXJuIE0odCxhLG8saSksTShuLGUsdSxpKSxNKHIsdCxuLDIqaSooMS1pKSkscn19KCksbi5zZXRBeGVzPWZ1bmN0aW9uKCl7dmFyIHQ9ZS5jcmVhdGUoKTtyZXR1cm4gZnVuY3Rpb24obixyLGEsZSl7cmV0dXJuIHRbMF09YVswXSx0WzNdPWFbMV0sdFs2XT1hWzJdLHRbMV09ZVswXSx0WzRdPWVbMV0sdFs3XT1lWzJdLHRbMl09LXJbMF0sdFs1XT0tclsxXSx0WzhdPS1yWzJdLGQobixoKG4sdCkpfX0oKX0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc3ViPW4ubXVsPXZvaWQgMCxuLmNyZWF0ZT1mdW5jdGlvbigpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoMTYpO2EuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNl09MCx0WzddPTAsdFs4XT0wLHRbOV09MCx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wKTtyZXR1cm4gdFswXT0xLHRbNV09MSx0WzEwXT0xLHRbMTVdPTEsdH0sbi5jbG9uZT1mdW5jdGlvbih0KXt2YXIgbj1uZXcgYS5BUlJBWV9UWVBFKDE2KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG5bNF09dFs0XSxuWzVdPXRbNV0sbls2XT10WzZdLG5bN109dFs3XSxuWzhdPXRbOF0sbls5XT10WzldLG5bMTBdPXRbMTBdLG5bMTFdPXRbMTFdLG5bMTJdPXRbMTJdLG5bMTNdPXRbMTNdLG5bMTRdPXRbMTRdLG5bMTVdPXRbMTVdLG59LG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdFs0XT1uWzRdLHRbNV09bls1XSx0WzZdPW5bNl0sdFs3XT1uWzddLHRbOF09bls4XSx0WzldPW5bOV0sdFsxMF09blsxMF0sdFsxMV09blsxMV0sdFsxMl09blsxMl0sdFsxM109blsxM10sdFsxNF09blsxNF0sdFsxNV09blsxNV0sdH0sbi5mcm9tVmFsdWVzPWZ1bmN0aW9uKHQsbixyLGUsdSxvLGkscyxjLGYsTSxoLGwsdixkLGIpe3ZhciBtPW5ldyBhLkFSUkFZX1RZUEUoMTYpO3JldHVybiBtWzBdPXQsbVsxXT1uLG1bMl09cixtWzNdPWUsbVs0XT11LG1bNV09byxtWzZdPWksbVs3XT1zLG1bOF09YyxtWzldPWYsbVsxMF09TSxtWzExXT1oLG1bMTJdPWwsbVsxM109dixtWzE0XT1kLG1bMTVdPWIsbX0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIsYSxlLHUsbyxpLHMsYyxmLE0saCxsLHYsZCxiKXtyZXR1cm4gdFswXT1uLHRbMV09cix0WzJdPWEsdFszXT1lLHRbNF09dSx0WzVdPW8sdFs2XT1pLHRbN109cyx0WzhdPWMsdFs5XT1mLHRbMTBdPU0sdFsxMV09aCx0WzEyXT1sLHRbMTNdPXYsdFsxNF09ZCx0WzE1XT1iLHR9LG4uaWRlbnRpdHk9ZSxuLnRyYW5zcG9zZT1mdW5jdGlvbih0LG4pe2lmKHQ9PT1uKXt2YXIgcj1uWzFdLGE9blsyXSxlPW5bM10sdT1uWzZdLG89bls3XSxpPW5bMTFdO3RbMV09bls0XSx0WzJdPW5bOF0sdFszXT1uWzEyXSx0WzRdPXIsdFs2XT1uWzldLHRbN109blsxM10sdFs4XT1hLHRbOV09dSx0WzExXT1uWzE0XSx0WzEyXT1lLHRbMTNdPW8sdFsxNF09aX1lbHNlIHRbMF09blswXSx0WzFdPW5bNF0sdFsyXT1uWzhdLHRbM109blsxMl0sdFs0XT1uWzFdLHRbNV09bls1XSx0WzZdPW5bOV0sdFs3XT1uWzEzXSx0WzhdPW5bMl0sdFs5XT1uWzZdLHRbMTBdPW5bMTBdLHRbMTFdPW5bMTRdLHRbMTJdPW5bM10sdFsxM109bls3XSx0WzE0XT1uWzExXSx0WzE1XT1uWzE1XTtyZXR1cm4gdH0sbi5pbnZlcnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89bls0XSxpPW5bNV0scz1uWzZdLGM9bls3XSxmPW5bOF0sTT1uWzldLGg9blsxMF0sbD1uWzExXSx2PW5bMTJdLGQ9blsxM10sYj1uWzE0XSxtPW5bMTVdLHA9cippLWEqbyxQPXIqcy1lKm8sQT1yKmMtdSpvLEU9YSpzLWUqaSxPPWEqYy11KmksUj1lKmMtdSpzLHk9ZipkLU0qdixxPWYqYi1oKnYseD1mKm0tbCp2LF89TSpiLWgqZCxZPU0qbS1sKmQsTD1oKm0tbCpiLFM9cCpMLVAqWStBKl8rRSp4LU8qcStSKnk7aWYoIVMpcmV0dXJuIG51bGw7cmV0dXJuIFM9MS9TLHRbMF09KGkqTC1zKlkrYypfKSpTLHRbMV09KGUqWS1hKkwtdSpfKSpTLHRbMl09KGQqUi1iKk8rbSpFKSpTLHRbM109KGgqTy1NKlItbCpFKSpTLHRbNF09KHMqeC1vKkwtYypxKSpTLHRbNV09KHIqTC1lKngrdSpxKSpTLHRbNl09KGIqQS12KlItbSpQKSpTLHRbN109KGYqUi1oKkErbCpQKSpTLHRbOF09KG8qWS1pKngrYyp5KSpTLHRbOV09KGEqeC1yKlktdSp5KSpTLHRbMTBdPSh2Kk8tZCpBK20qcCkqUyx0WzExXT0oTSpBLWYqTy1sKnApKlMsdFsxMl09KGkqcS1vKl8tcyp5KSpTLHRbMTNdPShyKl8tYSpxK2UqeSkqUyx0WzE0XT0oZCpQLXYqRS1iKnApKlMsdFsxNV09KGYqRS1NKlAraCpwKSpTLHR9LG4uYWRqb2ludD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1uWzRdLGk9bls1XSxzPW5bNl0sYz1uWzddLGY9bls4XSxNPW5bOV0saD1uWzEwXSxsPW5bMTFdLHY9blsxMl0sZD1uWzEzXSxiPW5bMTRdLG09blsxNV07cmV0dXJuIHRbMF09aSooaCptLWwqYiktTSoocyptLWMqYikrZCoocypsLWMqaCksdFsxXT0tKGEqKGgqbS1sKmIpLU0qKGUqbS11KmIpK2QqKGUqbC11KmgpKSx0WzJdPWEqKHMqbS1jKmIpLWkqKGUqbS11KmIpK2QqKGUqYy11KnMpLHRbM109LShhKihzKmwtYypoKS1pKihlKmwtdSpoKStNKihlKmMtdSpzKSksdFs0XT0tKG8qKGgqbS1sKmIpLWYqKHMqbS1jKmIpK3YqKHMqbC1jKmgpKSx0WzVdPXIqKGgqbS1sKmIpLWYqKGUqbS11KmIpK3YqKGUqbC11KmgpLHRbNl09LShyKihzKm0tYypiKS1vKihlKm0tdSpiKSt2KihlKmMtdSpzKSksdFs3XT1yKihzKmwtYypoKS1vKihlKmwtdSpoKStmKihlKmMtdSpzKSx0WzhdPW8qKE0qbS1sKmQpLWYqKGkqbS1jKmQpK3YqKGkqbC1jKk0pLHRbOV09LShyKihNKm0tbCpkKS1mKihhKm0tdSpkKSt2KihhKmwtdSpNKSksdFsxMF09ciooaSptLWMqZCktbyooYSptLXUqZCkrdiooYSpjLXUqaSksdFsxMV09LShyKihpKmwtYypNKS1vKihhKmwtdSpNKStmKihhKmMtdSppKSksdFsxMl09LShvKihNKmItaCpkKS1mKihpKmItcypkKSt2KihpKmgtcypNKSksdFsxM109ciooTSpiLWgqZCktZiooYSpiLWUqZCkrdiooYSpoLWUqTSksdFsxNF09LShyKihpKmItcypkKS1vKihhKmItZSpkKSt2KihhKnMtZSppKSksdFsxNV09ciooaSpoLXMqTSktbyooYSpoLWUqTSkrZiooYSpzLWUqaSksdH0sbi5kZXRlcm1pbmFudD1mdW5jdGlvbih0KXt2YXIgbj10WzBdLHI9dFsxXSxhPXRbMl0sZT10WzNdLHU9dFs0XSxvPXRbNV0saT10WzZdLHM9dFs3XSxjPXRbOF0sZj10WzldLE09dFsxMF0saD10WzExXSxsPXRbMTJdLHY9dFsxM10sZD10WzE0XSxiPXRbMTVdO3JldHVybihuKm8tcip1KSooTSpiLWgqZCktKG4qaS1hKnUpKihmKmItaCp2KSsobipzLWUqdSkqKGYqZC1NKnYpKyhyKmktYSpvKSooYypiLWgqbCktKHIqcy1lKm8pKihjKmQtTSpsKSsoYSpzLWUqaSkqKGMqdi1mKmwpfSxuLm11bHRpcGx5PXUsbi50cmFuc2xhdGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPXJbMF0sZT1yWzFdLHU9clsyXSxvPXZvaWQgMCxpPXZvaWQgMCxzPXZvaWQgMCxjPXZvaWQgMCxmPXZvaWQgMCxNPXZvaWQgMCxoPXZvaWQgMCxsPXZvaWQgMCx2PXZvaWQgMCxkPXZvaWQgMCxiPXZvaWQgMCxtPXZvaWQgMDtuPT09dD8odFsxMl09blswXSphK25bNF0qZStuWzhdKnUrblsxMl0sdFsxM109blsxXSphK25bNV0qZStuWzldKnUrblsxM10sdFsxNF09blsyXSphK25bNl0qZStuWzEwXSp1K25bMTRdLHRbMTVdPW5bM10qYStuWzddKmUrblsxMV0qdStuWzE1XSk6KG89blswXSxpPW5bMV0scz1uWzJdLGM9blszXSxmPW5bNF0sTT1uWzVdLGg9bls2XSxsPW5bN10sdj1uWzhdLGQ9bls5XSxiPW5bMTBdLG09blsxMV0sdFswXT1vLHRbMV09aSx0WzJdPXMsdFszXT1jLHRbNF09Zix0WzVdPU0sdFs2XT1oLHRbN109bCx0WzhdPXYsdFs5XT1kLHRbMTBdPWIsdFsxMV09bSx0WzEyXT1vKmErZiplK3YqdStuWzEyXSx0WzEzXT1pKmErTSplK2QqdStuWzEzXSx0WzE0XT1zKmEraCplK2IqdStuWzE0XSx0WzE1XT1jKmErbCplK20qdStuWzE1XSk7cmV0dXJuIHR9LG4uc2NhbGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPXJbMF0sZT1yWzFdLHU9clsyXTtyZXR1cm4gdFswXT1uWzBdKmEsdFsxXT1uWzFdKmEsdFsyXT1uWzJdKmEsdFszXT1uWzNdKmEsdFs0XT1uWzRdKmUsdFs1XT1uWzVdKmUsdFs2XT1uWzZdKmUsdFs3XT1uWzddKmUsdFs4XT1uWzhdKnUsdFs5XT1uWzldKnUsdFsxMF09blsxMF0qdSx0WzExXT1uWzExXSp1LHRbMTJdPW5bMTJdLHRbMTNdPW5bMTNdLHRbMTRdPW5bMTRdLHRbMTVdPW5bMTVdLHR9LG4ucm90YXRlPWZ1bmN0aW9uKHQsbixyLGUpe3ZhciB1PWVbMF0sbz1lWzFdLGk9ZVsyXSxzPU1hdGguc3FydCh1KnUrbypvK2kqaSksYz12b2lkIDAsZj12b2lkIDAsTT12b2lkIDAsaD12b2lkIDAsbD12b2lkIDAsdj12b2lkIDAsZD12b2lkIDAsYj12b2lkIDAsbT12b2lkIDAscD12b2lkIDAsUD12b2lkIDAsQT12b2lkIDAsRT12b2lkIDAsTz12b2lkIDAsUj12b2lkIDAseT12b2lkIDAscT12b2lkIDAseD12b2lkIDAsXz12b2lkIDAsWT12b2lkIDAsTD12b2lkIDAsUz12b2lkIDAsdz12b2lkIDAsST12b2lkIDA7aWYoczxhLkVQU0lMT04pcmV0dXJuIG51bGw7dSo9cz0xL3Msbyo9cyxpKj1zLGM9TWF0aC5zaW4ociksZj1NYXRoLmNvcyhyKSxNPTEtZixoPW5bMF0sbD1uWzFdLHY9blsyXSxkPW5bM10sYj1uWzRdLG09bls1XSxwPW5bNl0sUD1uWzddLEE9bls4XSxFPW5bOV0sTz1uWzEwXSxSPW5bMTFdLHk9dSp1Kk0rZixxPW8qdSpNK2kqYyx4PWkqdSpNLW8qYyxfPXUqbypNLWkqYyxZPW8qbypNK2YsTD1pKm8qTSt1KmMsUz11KmkqTStvKmMsdz1vKmkqTS11KmMsST1pKmkqTStmLHRbMF09aCp5K2IqcStBKngsdFsxXT1sKnkrbSpxK0UqeCx0WzJdPXYqeStwKnErTyp4LHRbM109ZCp5K1AqcStSKngsdFs0XT1oKl8rYipZK0EqTCx0WzVdPWwqXyttKlkrRSpMLHRbNl09dipfK3AqWStPKkwsdFs3XT1kKl8rUCpZK1IqTCx0WzhdPWgqUytiKncrQSpJLHRbOV09bCpTK20qdytFKkksdFsxMF09dipTK3AqdytPKkksdFsxMV09ZCpTK1AqdytSKkksbiE9PXQmJih0WzEyXT1uWzEyXSx0WzEzXT1uWzEzXSx0WzE0XT1uWzE0XSx0WzE1XT1uWzE1XSk7cmV0dXJuIHR9LG4ucm90YXRlWD1mdW5jdGlvbih0LG4scil7dmFyIGE9TWF0aC5zaW4ociksZT1NYXRoLmNvcyhyKSx1PW5bNF0sbz1uWzVdLGk9bls2XSxzPW5bN10sYz1uWzhdLGY9bls5XSxNPW5bMTBdLGg9blsxMV07biE9PXQmJih0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdFsxMl09blsxMl0sdFsxM109blsxM10sdFsxNF09blsxNF0sdFsxNV09blsxNV0pO3JldHVybiB0WzRdPXUqZStjKmEsdFs1XT1vKmUrZiphLHRbNl09aSplK00qYSx0WzddPXMqZStoKmEsdFs4XT1jKmUtdSphLHRbOV09ZiplLW8qYSx0WzEwXT1NKmUtaSphLHRbMTFdPWgqZS1zKmEsdH0sbi5yb3RhdGVZPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1NYXRoLnNpbihyKSxlPU1hdGguY29zKHIpLHU9blswXSxvPW5bMV0saT1uWzJdLHM9blszXSxjPW5bOF0sZj1uWzldLE09blsxMF0saD1uWzExXTtuIT09dCYmKHRbNF09bls0XSx0WzVdPW5bNV0sdFs2XT1uWzZdLHRbN109bls3XSx0WzEyXT1uWzEyXSx0WzEzXT1uWzEzXSx0WzE0XT1uWzE0XSx0WzE1XT1uWzE1XSk7cmV0dXJuIHRbMF09dSplLWMqYSx0WzFdPW8qZS1mKmEsdFsyXT1pKmUtTSphLHRbM109cyplLWgqYSx0WzhdPXUqYStjKmUsdFs5XT1vKmErZiplLHRbMTBdPWkqYStNKmUsdFsxMV09cyphK2gqZSx0fSxuLnJvdGF0ZVo9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPU1hdGguc2luKHIpLGU9TWF0aC5jb3MociksdT1uWzBdLG89blsxXSxpPW5bMl0scz1uWzNdLGM9bls0XSxmPW5bNV0sTT1uWzZdLGg9bls3XTtuIT09dCYmKHRbOF09bls4XSx0WzldPW5bOV0sdFsxMF09blsxMF0sdFsxMV09blsxMV0sdFsxMl09blsxMl0sdFsxM109blsxM10sdFsxNF09blsxNF0sdFsxNV09blsxNV0pO3JldHVybiB0WzBdPXUqZStjKmEsdFsxXT1vKmUrZiphLHRbMl09aSplK00qYSx0WzNdPXMqZStoKmEsdFs0XT1jKmUtdSphLHRbNV09ZiplLW8qYSx0WzZdPU0qZS1pKmEsdFs3XT1oKmUtcyphLHR9LG4uZnJvbVRyYW5zbGF0aW9uPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT0xLHRbNl09MCx0WzddPTAsdFs4XT0wLHRbOV09MCx0WzEwXT0xLHRbMTFdPTAsdFsxMl09blswXSx0WzEzXT1uWzFdLHRbMTRdPW5bMl0sdFsxNV09MSx0fSxuLmZyb21TY2FsaW5nPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT1uWzFdLHRbNl09MCx0WzddPTAsdFs4XT0wLHRbOV09MCx0WzEwXT1uWzJdLHRbMTFdPTAsdFsxMl09MCx0WzEzXT0wLHRbMTRdPTAsdFsxNV09MSx0fSxuLmZyb21Sb3RhdGlvbj1mdW5jdGlvbih0LG4scil7dmFyIGU9clswXSx1PXJbMV0sbz1yWzJdLGk9TWF0aC5zcXJ0KGUqZSt1KnUrbypvKSxzPXZvaWQgMCxjPXZvaWQgMCxmPXZvaWQgMDtpZihpPGEuRVBTSUxPTilyZXR1cm4gbnVsbDtyZXR1cm4gZSo9aT0xL2ksdSo9aSxvKj1pLHM9TWF0aC5zaW4obiksYz1NYXRoLmNvcyhuKSxmPTEtYyx0WzBdPWUqZSpmK2MsdFsxXT11KmUqZitvKnMsdFsyXT1vKmUqZi11KnMsdFszXT0wLHRbNF09ZSp1KmYtbypzLHRbNV09dSp1KmYrYyx0WzZdPW8qdSpmK2Uqcyx0WzddPTAsdFs4XT1lKm8qZit1KnMsdFs5XT11Km8qZi1lKnMsdFsxMF09bypvKmYrYyx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH0sbi5mcm9tWFJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7dmFyIHI9TWF0aC5zaW4obiksYT1NYXRoLmNvcyhuKTtyZXR1cm4gdFswXT0xLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09MCx0WzVdPWEsdFs2XT1yLHRbN109MCx0WzhdPTAsdFs5XT0tcix0WzEwXT1hLHRbMTFdPTAsdFsxMl09MCx0WzEzXT0wLHRbMTRdPTAsdFsxNV09MSx0fSxuLmZyb21ZUm90YXRpb249ZnVuY3Rpb24odCxuKXt2YXIgcj1NYXRoLnNpbihuKSxhPU1hdGguY29zKG4pO3JldHVybiB0WzBdPWEsdFsxXT0wLHRbMl09LXIsdFszXT0wLHRbNF09MCx0WzVdPTEsdFs2XT0wLHRbN109MCx0WzhdPXIsdFs5XT0wLHRbMTBdPWEsdFsxMV09MCx0WzEyXT0wLHRbMTNdPTAsdFsxNF09MCx0WzE1XT0xLHR9LG4uZnJvbVpSb3RhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPU1hdGguc2luKG4pLGE9TWF0aC5jb3Mobik7cmV0dXJuIHRbMF09YSx0WzFdPXIsdFsyXT0wLHRbM109MCx0WzRdPS1yLHRbNV09YSx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMF09MSx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH0sbi5mcm9tUm90YXRpb25UcmFuc2xhdGlvbj1vLG4uZnJvbVF1YXQyPWZ1bmN0aW9uKHQsbil7dmFyIHI9bmV3IGEuQVJSQVlfVFlQRSgzKSxlPS1uWzBdLHU9LW5bMV0saT0tblsyXSxzPW5bM10sYz1uWzRdLGY9bls1XSxNPW5bNl0saD1uWzddLGw9ZSplK3UqdStpKmkrcypzO2w+MD8oclswXT0yKihjKnMraCplK2YqaS1NKnUpL2wsclsxXT0yKihmKnMraCp1K00qZS1jKmkpL2wsclsyXT0yKihNKnMraCppK2MqdS1mKmUpL2wpOihyWzBdPTIqKGMqcytoKmUrZippLU0qdSksclsxXT0yKihmKnMraCp1K00qZS1jKmkpLHJbMl09MiooTSpzK2gqaStjKnUtZiplKSk7cmV0dXJuIG8odCxuLHIpLHR9LG4uZ2V0VHJhbnNsYXRpb249ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzEyXSx0WzFdPW5bMTNdLHRbMl09blsxNF0sdH0sbi5nZXRTY2FsaW5nPWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9bls0XSxvPW5bNV0saT1uWzZdLHM9bls4XSxjPW5bOV0sZj1uWzEwXTtyZXR1cm4gdFswXT1NYXRoLnNxcnQocipyK2EqYStlKmUpLHRbMV09TWF0aC5zcXJ0KHUqdStvKm8raSppKSx0WzJdPU1hdGguc3FydChzKnMrYypjK2YqZiksdH0sbi5nZXRSb3RhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0rbls1XStuWzEwXSxhPTA7cj4wPyhhPTIqTWF0aC5zcXJ0KHIrMSksdFszXT0uMjUqYSx0WzBdPShuWzZdLW5bOV0pL2EsdFsxXT0obls4XS1uWzJdKS9hLHRbMl09KG5bMV0tbls0XSkvYSk6blswXT5uWzVdJiZuWzBdPm5bMTBdPyhhPTIqTWF0aC5zcXJ0KDErblswXS1uWzVdLW5bMTBdKSx0WzNdPShuWzZdLW5bOV0pL2EsdFswXT0uMjUqYSx0WzFdPShuWzFdK25bNF0pL2EsdFsyXT0obls4XStuWzJdKS9hKTpuWzVdPm5bMTBdPyhhPTIqTWF0aC5zcXJ0KDErbls1XS1uWzBdLW5bMTBdKSx0WzNdPShuWzhdLW5bMl0pL2EsdFswXT0oblsxXStuWzRdKS9hLHRbMV09LjI1KmEsdFsyXT0obls2XStuWzldKS9hKTooYT0yKk1hdGguc3FydCgxK25bMTBdLW5bMF0tbls1XSksdFszXT0oblsxXS1uWzRdKS9hLHRbMF09KG5bOF0rblsyXSkvYSx0WzFdPShuWzZdK25bOV0pL2EsdFsyXT0uMjUqYSk7cmV0dXJuIHR9LG4uZnJvbVJvdGF0aW9uVHJhbnNsYXRpb25TY2FsZT1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLHU9blsxXSxvPW5bMl0saT1uWzNdLHM9ZStlLGM9dSt1LGY9bytvLE09ZSpzLGg9ZSpjLGw9ZSpmLHY9dSpjLGQ9dSpmLGI9bypmLG09aSpzLHA9aSpjLFA9aSpmLEE9YVswXSxFPWFbMV0sTz1hWzJdO3JldHVybiB0WzBdPSgxLSh2K2IpKSpBLHRbMV09KGgrUCkqQSx0WzJdPShsLXApKkEsdFszXT0wLHRbNF09KGgtUCkqRSx0WzVdPSgxLShNK2IpKSpFLHRbNl09KGQrbSkqRSx0WzddPTAsdFs4XT0obCtwKSpPLHRbOV09KGQtbSkqTyx0WzEwXT0oMS0oTSt2KSkqTyx0WzExXT0wLHRbMTJdPXJbMF0sdFsxM109clsxXSx0WzE0XT1yWzJdLHRbMTVdPTEsdH0sbi5mcm9tUm90YXRpb25UcmFuc2xhdGlvblNjYWxlT3JpZ2luPWZ1bmN0aW9uKHQsbixyLGEsZSl7dmFyIHU9blswXSxvPW5bMV0saT1uWzJdLHM9blszXSxjPXUrdSxmPW8rbyxNPWkraSxoPXUqYyxsPXUqZix2PXUqTSxkPW8qZixiPW8qTSxtPWkqTSxwPXMqYyxQPXMqZixBPXMqTSxFPWFbMF0sTz1hWzFdLFI9YVsyXSx5PWVbMF0scT1lWzFdLHg9ZVsyXSxfPSgxLShkK20pKSpFLFk9KGwrQSkqRSxMPSh2LVApKkUsUz0obC1BKSpPLHc9KDEtKGgrbSkpKk8sST0oYitwKSpPLE49KHYrUCkqUixnPShiLXApKlIsVD0oMS0oaCtkKSkqUjtyZXR1cm4gdFswXT1fLHRbMV09WSx0WzJdPUwsdFszXT0wLHRbNF09Uyx0WzVdPXcsdFs2XT1JLHRbN109MCx0WzhdPU4sdFs5XT1nLHRbMTBdPVQsdFsxMV09MCx0WzEyXT1yWzBdK3ktKF8qeStTKnErTip4KSx0WzEzXT1yWzFdK3EtKFkqeSt3KnErZyp4KSx0WzE0XT1yWzJdK3gtKEwqeStJKnErVCp4KSx0WzE1XT0xLHR9LG4uZnJvbVF1YXQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89cityLGk9YSthLHM9ZStlLGM9cipvLGY9YSpvLE09YSppLGg9ZSpvLGw9ZSppLHY9ZSpzLGQ9dSpvLGI9dSppLG09dSpzO3JldHVybiB0WzBdPTEtTS12LHRbMV09ZittLHRbMl09aC1iLHRbM109MCx0WzRdPWYtbSx0WzVdPTEtYy12LHRbNl09bCtkLHRbN109MCx0WzhdPWgrYix0WzldPWwtZCx0WzEwXT0xLWMtTSx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH0sbi5mcnVzdHVtPWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8pe3ZhciBpPTEvKHItbikscz0xLyhlLWEpLGM9MS8odS1vKTtyZXR1cm4gdFswXT0yKnUqaSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT0yKnUqcyx0WzZdPTAsdFs3XT0wLHRbOF09KHIrbikqaSx0WzldPShlK2EpKnMsdFsxMF09KG8rdSkqYyx0WzExXT0tMSx0WzEyXT0wLHRbMTNdPTAsdFsxNF09byp1KjIqYyx0WzE1XT0wLHR9LG4ucGVyc3BlY3RpdmU9ZnVuY3Rpb24odCxuLHIsYSxlKXt2YXIgdT0xL01hdGgudGFuKG4vMiksbz12b2lkIDA7dFswXT11L3IsdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNV09dSx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMV09LTEsdFsxMl09MCx0WzEzXT0wLHRbMTVdPTAsbnVsbCE9ZSYmZSE9PTEvMD8obz0xLyhhLWUpLHRbMTBdPShlK2EpKm8sdFsxNF09MiplKmEqbyk6KHRbMTBdPS0xLHRbMTRdPS0yKmEpO3JldHVybiB0fSxuLnBlcnNwZWN0aXZlRnJvbUZpZWxkT2ZWaWV3PWZ1bmN0aW9uKHQsbixyLGEpe3ZhciBlPU1hdGgudGFuKG4udXBEZWdyZWVzKk1hdGguUEkvMTgwKSx1PU1hdGgudGFuKG4uZG93bkRlZ3JlZXMqTWF0aC5QSS8xODApLG89TWF0aC50YW4obi5sZWZ0RGVncmVlcypNYXRoLlBJLzE4MCksaT1NYXRoLnRhbihuLnJpZ2h0RGVncmVlcypNYXRoLlBJLzE4MCkscz0yLyhvK2kpLGM9Mi8oZSt1KTtyZXR1cm4gdFswXT1zLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09MCx0WzVdPWMsdFs2XT0wLHRbN109MCx0WzhdPS0oby1pKSpzKi41LHRbOV09KGUtdSkqYyouNSx0WzEwXT1hLyhyLWEpLHRbMTFdPS0xLHRbMTJdPTAsdFsxM109MCx0WzE0XT1hKnIvKHItYSksdFsxNV09MCx0fSxuLm9ydGhvPWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8pe3ZhciBpPTEvKG4tcikscz0xLyhhLWUpLGM9MS8odS1vKTtyZXR1cm4gdFswXT0tMippLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09MCx0WzVdPS0yKnMsdFs2XT0wLHRbN109MCx0WzhdPTAsdFs5XT0wLHRbMTBdPTIqYyx0WzExXT0wLHRbMTJdPShuK3IpKmksdFsxM109KGUrYSkqcyx0WzE0XT0obyt1KSpjLHRbMTVdPTEsdH0sbi5sb29rQXQ9ZnVuY3Rpb24odCxuLHIsdSl7dmFyIG89dm9pZCAwLGk9dm9pZCAwLHM9dm9pZCAwLGM9dm9pZCAwLGY9dm9pZCAwLE09dm9pZCAwLGg9dm9pZCAwLGw9dm9pZCAwLHY9dm9pZCAwLGQ9dm9pZCAwLGI9blswXSxtPW5bMV0scD1uWzJdLFA9dVswXSxBPXVbMV0sRT11WzJdLE89clswXSxSPXJbMV0seT1yWzJdO2lmKE1hdGguYWJzKGItTyk8YS5FUFNJTE9OJiZNYXRoLmFicyhtLVIpPGEuRVBTSUxPTiYmTWF0aC5hYnMocC15KTxhLkVQU0lMT04pcmV0dXJuIGUodCk7aD1iLU8sbD1tLVIsdj1wLXksZD0xL01hdGguc3FydChoKmgrbCpsK3Yqdiksbz1BKih2Kj1kKS1FKihsKj1kKSxpPUUqKGgqPWQpLVAqdixzPVAqbC1BKmgsKGQ9TWF0aC5zcXJ0KG8qbytpKmkrcypzKSk/KG8qPWQ9MS9kLGkqPWQscyo9ZCk6KG89MCxpPTAscz0wKTtjPWwqcy12KmksZj12Km8taCpzLE09aCppLWwqbywoZD1NYXRoLnNxcnQoYypjK2YqZitNKk0pKT8oYyo9ZD0xL2QsZio9ZCxNKj1kKTooYz0wLGY9MCxNPTApO3JldHVybiB0WzBdPW8sdFsxXT1jLHRbMl09aCx0WzNdPTAsdFs0XT1pLHRbNV09Zix0WzZdPWwsdFs3XT0wLHRbOF09cyx0WzldPU0sdFsxMF09dix0WzExXT0wLHRbMTJdPS0obypiK2kqbStzKnApLHRbMTNdPS0oYypiK2YqbStNKnApLHRbMTRdPS0oaCpiK2wqbSt2KnApLHRbMTVdPTEsdH0sbi50YXJnZXRUbz1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLHU9blsxXSxvPW5bMl0saT1hWzBdLHM9YVsxXSxjPWFbMl0sZj1lLXJbMF0sTT11LXJbMV0saD1vLXJbMl0sbD1mKmYrTSpNK2gqaDtsPjAmJihsPTEvTWF0aC5zcXJ0KGwpLGYqPWwsTSo9bCxoKj1sKTt2YXIgdj1zKmgtYypNLGQ9YypmLWkqaCxiPWkqTS1zKmY7KGw9dip2K2QqZCtiKmIpPjAmJihsPTEvTWF0aC5zcXJ0KGwpLHYqPWwsZCo9bCxiKj1sKTtyZXR1cm4gdFswXT12LHRbMV09ZCx0WzJdPWIsdFszXT0wLHRbNF09TSpiLWgqZCx0WzVdPWgqdi1mKmIsdFs2XT1mKmQtTSp2LHRbN109MCx0WzhdPWYsdFs5XT1NLHRbMTBdPWgsdFsxMV09MCx0WzEyXT1lLHRbMTNdPXUsdFsxNF09byx0WzE1XT0xLHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwibWF0NChcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiLCBcIit0WzRdK1wiLCBcIit0WzVdK1wiLCBcIit0WzZdK1wiLCBcIit0WzddK1wiLCBcIit0WzhdK1wiLCBcIit0WzldK1wiLCBcIit0WzEwXStcIiwgXCIrdFsxMV0rXCIsIFwiK3RbMTJdK1wiLCBcIit0WzEzXStcIiwgXCIrdFsxNF0rXCIsIFwiK3RbMTVdK1wiKVwifSxuLmZyb2I9ZnVuY3Rpb24odCl7cmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh0WzBdLDIpK01hdGgucG93KHRbMV0sMikrTWF0aC5wb3codFsyXSwyKStNYXRoLnBvdyh0WzNdLDIpK01hdGgucG93KHRbNF0sMikrTWF0aC5wb3codFs1XSwyKStNYXRoLnBvdyh0WzZdLDIpK01hdGgucG93KHRbN10sMikrTWF0aC5wb3codFs4XSwyKStNYXRoLnBvdyh0WzldLDIpK01hdGgucG93KHRbMTBdLDIpK01hdGgucG93KHRbMTFdLDIpK01hdGgucG93KHRbMTJdLDIpK01hdGgucG93KHRbMTNdLDIpK01hdGgucG93KHRbMTRdLDIpK01hdGgucG93KHRbMTVdLDIpKX0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0WzNdPW5bM10rclszXSx0WzRdPW5bNF0rcls0XSx0WzVdPW5bNV0rcls1XSx0WzZdPW5bNl0rcls2XSx0WzddPW5bN10rcls3XSx0WzhdPW5bOF0rcls4XSx0WzldPW5bOV0rcls5XSx0WzEwXT1uWzEwXStyWzEwXSx0WzExXT1uWzExXStyWzExXSx0WzEyXT1uWzEyXStyWzEyXSx0WzEzXT1uWzEzXStyWzEzXSx0WzE0XT1uWzE0XStyWzE0XSx0WzE1XT1uWzE1XStyWzE1XSx0fSxuLnN1YnRyYWN0PWksbi5tdWx0aXBseVNjYWxhcj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXSpyLHRbMV09blsxXSpyLHRbMl09blsyXSpyLHRbM109blszXSpyLHRbNF09bls0XSpyLHRbNV09bls1XSpyLHRbNl09bls2XSpyLHRbN109bls3XSpyLHRbOF09bls4XSpyLHRbOV09bls5XSpyLHRbMTBdPW5bMTBdKnIsdFsxMV09blsxMV0qcix0WzEyXT1uWzEyXSpyLHRbMTNdPW5bMTNdKnIsdFsxNF09blsxNF0qcix0WzE1XT1uWzE1XSpyLHR9LG4ubXVsdGlwbHlTY2FsYXJBbmRBZGQ9ZnVuY3Rpb24odCxuLHIsYSl7cmV0dXJuIHRbMF09blswXStyWzBdKmEsdFsxXT1uWzFdK3JbMV0qYSx0WzJdPW5bMl0rclsyXSphLHRbM109blszXStyWzNdKmEsdFs0XT1uWzRdK3JbNF0qYSx0WzVdPW5bNV0rcls1XSphLHRbNl09bls2XStyWzZdKmEsdFs3XT1uWzddK3JbN10qYSx0WzhdPW5bOF0rcls4XSphLHRbOV09bls5XStyWzldKmEsdFsxMF09blsxMF0rclsxMF0qYSx0WzExXT1uWzExXStyWzExXSphLHRbMTJdPW5bMTJdK3JbMTJdKmEsdFsxM109blsxM10rclsxM10qYSx0WzE0XT1uWzE0XStyWzE0XSphLHRbMTVdPW5bMTVdK3JbMTVdKmEsdH0sbi5leGFjdEVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPT09blswXSYmdFsxXT09PW5bMV0mJnRbMl09PT1uWzJdJiZ0WzNdPT09blszXSYmdFs0XT09PW5bNF0mJnRbNV09PT1uWzVdJiZ0WzZdPT09bls2XSYmdFs3XT09PW5bN10mJnRbOF09PT1uWzhdJiZ0WzldPT09bls5XSYmdFsxMF09PT1uWzEwXSYmdFsxMV09PT1uWzExXSYmdFsxMl09PT1uWzEyXSYmdFsxM109PT1uWzEzXSYmdFsxNF09PT1uWzE0XSYmdFsxNV09PT1uWzE1XX0sbi5lcXVhbHM9ZnVuY3Rpb24odCxuKXt2YXIgcj10WzBdLGU9dFsxXSx1PXRbMl0sbz10WzNdLGk9dFs0XSxzPXRbNV0sYz10WzZdLGY9dFs3XSxNPXRbOF0saD10WzldLGw9dFsxMF0sdj10WzExXSxkPXRbMTJdLGI9dFsxM10sbT10WzE0XSxwPXRbMTVdLFA9blswXSxBPW5bMV0sRT1uWzJdLE89blszXSxSPW5bNF0seT1uWzVdLHE9bls2XSx4PW5bN10sXz1uWzhdLFk9bls5XSxMPW5bMTBdLFM9blsxMV0sdz1uWzEyXSxJPW5bMTNdLE49blsxNF0sZz1uWzE1XTtyZXR1cm4gTWF0aC5hYnMoci1QKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMociksTWF0aC5hYnMoUCkpJiZNYXRoLmFicyhlLUEpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhlKSxNYXRoLmFicyhBKSkmJk1hdGguYWJzKHUtRSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHUpLE1hdGguYWJzKEUpKSYmTWF0aC5hYnMoby1PKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMobyksTWF0aC5hYnMoTykpJiZNYXRoLmFicyhpLVIpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhpKSxNYXRoLmFicyhSKSkmJk1hdGguYWJzKHMteSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHMpLE1hdGguYWJzKHkpKSYmTWF0aC5hYnMoYy1xKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoYyksTWF0aC5hYnMocSkpJiZNYXRoLmFicyhmLXgpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhmKSxNYXRoLmFicyh4KSkmJk1hdGguYWJzKE0tXyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKE0pLE1hdGguYWJzKF8pKSYmTWF0aC5hYnMoaC1ZKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoaCksTWF0aC5hYnMoWSkpJiZNYXRoLmFicyhsLUwpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhsKSxNYXRoLmFicyhMKSkmJk1hdGguYWJzKHYtUyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHYpLE1hdGguYWJzKFMpKSYmTWF0aC5hYnMoZC13KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZCksTWF0aC5hYnModykpJiZNYXRoLmFicyhiLUkpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhiKSxNYXRoLmFicyhJKSkmJk1hdGguYWJzKG0tTik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKG0pLE1hdGguYWJzKE4pKSYmTWF0aC5hYnMocC1nKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMocCksTWF0aC5hYnMoZykpfTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUodCl7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT0xLHRbNl09MCx0WzddPTAsdFs4XT0wLHRbOV09MCx0WzEwXT0xLHRbMTFdPTAsdFsxMl09MCx0WzEzXT0wLHRbMTRdPTAsdFsxNV09MSx0fWZ1bmN0aW9uIHUodCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLE09bls4XSxoPW5bOV0sbD1uWzEwXSx2PW5bMTFdLGQ9blsxMl0sYj1uWzEzXSxtPW5bMTRdLHA9blsxNV0sUD1yWzBdLEE9clsxXSxFPXJbMl0sTz1yWzNdO3JldHVybiB0WzBdPVAqYStBKmkrRSpNK08qZCx0WzFdPVAqZStBKnMrRSpoK08qYix0WzJdPVAqdStBKmMrRSpsK08qbSx0WzNdPVAqbytBKmYrRSp2K08qcCxQPXJbNF0sQT1yWzVdLEU9cls2XSxPPXJbN10sdFs0XT1QKmErQSppK0UqTStPKmQsdFs1XT1QKmUrQSpzK0UqaCtPKmIsdFs2XT1QKnUrQSpjK0UqbCtPKm0sdFs3XT1QKm8rQSpmK0UqditPKnAsUD1yWzhdLEE9cls5XSxFPXJbMTBdLE89clsxMV0sdFs4XT1QKmErQSppK0UqTStPKmQsdFs5XT1QKmUrQSpzK0UqaCtPKmIsdFsxMF09UCp1K0EqYytFKmwrTyptLHRbMTFdPVAqbytBKmYrRSp2K08qcCxQPXJbMTJdLEE9clsxM10sRT1yWzE0XSxPPXJbMTVdLHRbMTJdPVAqYStBKmkrRSpNK08qZCx0WzEzXT1QKmUrQSpzK0UqaCtPKmIsdFsxNF09UCp1K0EqYytFKmwrTyptLHRbMTVdPVAqbytBKmYrRSp2K08qcCx0fWZ1bmN0aW9uIG8odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1hK2Escz1lK2UsYz11K3UsZj1hKmksTT1hKnMsaD1hKmMsbD1lKnMsdj1lKmMsZD11KmMsYj1vKmksbT1vKnMscD1vKmM7cmV0dXJuIHRbMF09MS0obCtkKSx0WzFdPU0rcCx0WzJdPWgtbSx0WzNdPTAsdFs0XT1NLXAsdFs1XT0xLShmK2QpLHRbNl09ditiLHRbN109MCx0WzhdPWgrbSx0WzldPXYtYix0WzEwXT0xLShmK2wpLHRbMTFdPTAsdFsxMl09clswXSx0WzEzXT1yWzFdLHRbMTRdPXJbMl0sdFsxNV09MSx0fWZ1bmN0aW9uIGkodCxuLHIpe3JldHVybiB0WzBdPW5bMF0tclswXSx0WzFdPW5bMV0tclsxXSx0WzJdPW5bMl0tclsyXSx0WzNdPW5bM10tclszXSx0WzRdPW5bNF0tcls0XSx0WzVdPW5bNV0tcls1XSx0WzZdPW5bNl0tcls2XSx0WzddPW5bN10tcls3XSx0WzhdPW5bOF0tcls4XSx0WzldPW5bOV0tcls5XSx0WzEwXT1uWzEwXS1yWzEwXSx0WzExXT1uWzExXS1yWzExXSx0WzEyXT1uWzEyXS1yWzEyXSx0WzEzXT1uWzEzXS1yWzEzXSx0WzE0XT1uWzE0XS1yWzE0XSx0WzE1XT1uWzE1XS1yWzE1XSx0fW4ubXVsPXUsbi5zdWI9aX0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc3ViPW4ubXVsPXZvaWQgMCxuLmNyZWF0ZT1mdW5jdGlvbigpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoOSk7YS5BUlJBWV9UWVBFIT1GbG9hdDMyQXJyYXkmJih0WzFdPTAsdFsyXT0wLHRbM109MCx0WzVdPTAsdFs2XT0wLHRbN109MCk7cmV0dXJuIHRbMF09MSx0WzRdPTEsdFs4XT0xLHR9LG4uZnJvbU1hdDQ9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09blsxXSx0WzJdPW5bMl0sdFszXT1uWzRdLHRbNF09bls1XSx0WzVdPW5bNl0sdFs2XT1uWzhdLHRbN109bls5XSx0WzhdPW5bMTBdLHR9LG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSg5KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG5bNF09dFs0XSxuWzVdPXRbNV0sbls2XT10WzZdLG5bN109dFs3XSxuWzhdPXRbOF0sbn0sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0WzRdPW5bNF0sdFs1XT1uWzVdLHRbNl09bls2XSx0WzddPW5bN10sdFs4XT1uWzhdLHR9LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlLHUsbyxpLHMsYyl7dmFyIGY9bmV3IGEuQVJSQVlfVFlQRSg5KTtyZXR1cm4gZlswXT10LGZbMV09bixmWzJdPXIsZlszXT1lLGZbNF09dSxmWzVdPW8sZls2XT1pLGZbN109cyxmWzhdPWMsZn0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIsYSxlLHUsbyxpLHMsYyl7cmV0dXJuIHRbMF09bix0WzFdPXIsdFsyXT1hLHRbM109ZSx0WzRdPXUsdFs1XT1vLHRbNl09aSx0WzddPXMsdFs4XT1jLHR9LG4uaWRlbnRpdHk9ZnVuY3Rpb24odCl7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTEsdFs1XT0wLHRbNl09MCx0WzddPTAsdFs4XT0xLHR9LG4udHJhbnNwb3NlPWZ1bmN0aW9uKHQsbil7aWYodD09PW4pe3ZhciByPW5bMV0sYT1uWzJdLGU9bls1XTt0WzFdPW5bM10sdFsyXT1uWzZdLHRbM109cix0WzVdPW5bN10sdFs2XT1hLHRbN109ZX1lbHNlIHRbMF09blswXSx0WzFdPW5bM10sdFsyXT1uWzZdLHRbM109blsxXSx0WzRdPW5bNF0sdFs1XT1uWzddLHRbNl09blsyXSx0WzddPW5bNV0sdFs4XT1uWzhdO3JldHVybiB0fSxuLmludmVydD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1uWzRdLGk9bls1XSxzPW5bNl0sYz1uWzddLGY9bls4XSxNPWYqby1pKmMsaD0tZip1K2kqcyxsPWMqdS1vKnMsdj1yKk0rYSpoK2UqbDtpZighdilyZXR1cm4gbnVsbDtyZXR1cm4gdj0xL3YsdFswXT1NKnYsdFsxXT0oLWYqYStlKmMpKnYsdFsyXT0oaSphLWUqbykqdix0WzNdPWgqdix0WzRdPShmKnItZSpzKSp2LHRbNV09KC1pKnIrZSp1KSp2LHRbNl09bCp2LHRbN109KC1jKnIrYSpzKSp2LHRbOF09KG8qci1hKnUpKnYsdH0sbi5hZGpvaW50PWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPW5bNF0saT1uWzVdLHM9bls2XSxjPW5bN10sZj1uWzhdO3JldHVybiB0WzBdPW8qZi1pKmMsdFsxXT1lKmMtYSpmLHRbMl09YSppLWUqbyx0WzNdPWkqcy11KmYsdFs0XT1yKmYtZSpzLHRbNV09ZSp1LXIqaSx0WzZdPXUqYy1vKnMsdFs3XT1hKnMtcipjLHRbOF09cipvLWEqdSx0fSxuLmRldGVybWluYW50PWZ1bmN0aW9uKHQpe3ZhciBuPXRbMF0scj10WzFdLGE9dFsyXSxlPXRbM10sdT10WzRdLG89dFs1XSxpPXRbNl0scz10WzddLGM9dFs4XTtyZXR1cm4gbiooYyp1LW8qcykrciooLWMqZStvKmkpK2EqKHMqZS11KmkpfSxuLm11bHRpcGx5PWUsbi50cmFuc2xhdGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLE09bls4XSxoPXJbMF0sbD1yWzFdO3JldHVybiB0WzBdPWEsdFsxXT1lLHRbMl09dSx0WzNdPW8sdFs0XT1pLHRbNV09cyx0WzZdPWgqYStsKm8rYyx0WzddPWgqZStsKmkrZix0WzhdPWgqdStsKnMrTSx0fSxuLnJvdGF0ZT1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPW5bNF0scz1uWzVdLGM9bls2XSxmPW5bN10sTT1uWzhdLGg9TWF0aC5zaW4ociksbD1NYXRoLmNvcyhyKTtyZXR1cm4gdFswXT1sKmEraCpvLHRbMV09bCplK2gqaSx0WzJdPWwqdStoKnMsdFszXT1sKm8taCphLHRbNF09bCppLWgqZSx0WzVdPWwqcy1oKnUsdFs2XT1jLHRbN109Zix0WzhdPU0sdH0sbi5zY2FsZT1mdW5jdGlvbih0LG4scil7dmFyIGE9clswXSxlPXJbMV07cmV0dXJuIHRbMF09YSpuWzBdLHRbMV09YSpuWzFdLHRbMl09YSpuWzJdLHRbM109ZSpuWzNdLHRbNF09ZSpuWzRdLHRbNV09ZSpuWzVdLHRbNl09bls2XSx0WzddPW5bN10sdFs4XT1uWzhdLHR9LG4uZnJvbVRyYW5zbGF0aW9uPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTEsdFs1XT0wLHRbNl09blswXSx0WzddPW5bMV0sdFs4XT0xLHR9LG4uZnJvbVJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7dmFyIHI9TWF0aC5zaW4obiksYT1NYXRoLmNvcyhuKTtyZXR1cm4gdFswXT1hLHRbMV09cix0WzJdPTAsdFszXT0tcix0WzRdPWEsdFs1XT0wLHRbNl09MCx0WzddPTAsdFs4XT0xLHR9LG4uZnJvbVNjYWxpbmc9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09blsxXSx0WzVdPTAsdFs2XT0wLHRbN109MCx0WzhdPTEsdH0sbi5mcm9tTWF0MmQ9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09blsxXSx0WzJdPTAsdFszXT1uWzJdLHRbNF09blszXSx0WzVdPTAsdFs2XT1uWzRdLHRbN109bls1XSx0WzhdPTEsdH0sbi5mcm9tUXVhdD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1yK3IsaT1hK2Escz1lK2UsYz1yKm8sZj1hKm8sTT1hKmksaD1lKm8sbD1lKmksdj1lKnMsZD11Km8sYj11KmksbT11KnM7cmV0dXJuIHRbMF09MS1NLXYsdFszXT1mLW0sdFs2XT1oK2IsdFsxXT1mK20sdFs0XT0xLWMtdix0WzddPWwtZCx0WzJdPWgtYix0WzVdPWwrZCx0WzhdPTEtYy1NLHR9LG4ubm9ybWFsRnJvbU1hdDQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89bls0XSxpPW5bNV0scz1uWzZdLGM9bls3XSxmPW5bOF0sTT1uWzldLGg9blsxMF0sbD1uWzExXSx2PW5bMTJdLGQ9blsxM10sYj1uWzE0XSxtPW5bMTVdLHA9cippLWEqbyxQPXIqcy1lKm8sQT1yKmMtdSpvLEU9YSpzLWUqaSxPPWEqYy11KmksUj1lKmMtdSpzLHk9ZipkLU0qdixxPWYqYi1oKnYseD1mKm0tbCp2LF89TSpiLWgqZCxZPU0qbS1sKmQsTD1oKm0tbCpiLFM9cCpMLVAqWStBKl8rRSp4LU8qcStSKnk7aWYoIVMpcmV0dXJuIG51bGw7cmV0dXJuIFM9MS9TLHRbMF09KGkqTC1zKlkrYypfKSpTLHRbMV09KHMqeC1vKkwtYypxKSpTLHRbMl09KG8qWS1pKngrYyp5KSpTLHRbM109KGUqWS1hKkwtdSpfKSpTLHRbNF09KHIqTC1lKngrdSpxKSpTLHRbNV09KGEqeC1yKlktdSp5KSpTLHRbNl09KGQqUi1iKk8rbSpFKSpTLHRbN109KGIqQS12KlItbSpQKSpTLHRbOF09KHYqTy1kKkErbSpwKSpTLHR9LG4ucHJvamVjdGlvbj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09Mi9uLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09LTIvcix0WzVdPTAsdFs2XT0tMSx0WzddPTEsdFs4XT0xLHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwibWF0MyhcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiLCBcIit0WzRdK1wiLCBcIit0WzVdK1wiLCBcIit0WzZdK1wiLCBcIit0WzddK1wiLCBcIit0WzhdK1wiKVwifSxuLmZyb2I9ZnVuY3Rpb24odCl7cmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh0WzBdLDIpK01hdGgucG93KHRbMV0sMikrTWF0aC5wb3codFsyXSwyKStNYXRoLnBvdyh0WzNdLDIpK01hdGgucG93KHRbNF0sMikrTWF0aC5wb3codFs1XSwyKStNYXRoLnBvdyh0WzZdLDIpK01hdGgucG93KHRbN10sMikrTWF0aC5wb3codFs4XSwyKSl9LG4uYWRkPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0sdFsxXT1uWzFdK3JbMV0sdFsyXT1uWzJdK3JbMl0sdFszXT1uWzNdK3JbM10sdFs0XT1uWzRdK3JbNF0sdFs1XT1uWzVdK3JbNV0sdFs2XT1uWzZdK3JbNl0sdFs3XT1uWzddK3JbN10sdFs4XT1uWzhdK3JbOF0sdH0sbi5zdWJ0cmFjdD11LG4ubXVsdGlwbHlTY2FsYXI9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qcix0WzFdPW5bMV0qcix0WzJdPW5bMl0qcix0WzNdPW5bM10qcix0WzRdPW5bNF0qcix0WzVdPW5bNV0qcix0WzZdPW5bNl0qcix0WzddPW5bN10qcix0WzhdPW5bOF0qcix0fSxuLm11bHRpcGx5U2NhbGFyQW5kQWRkPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW5bMF0rclswXSphLHRbMV09blsxXStyWzFdKmEsdFsyXT1uWzJdK3JbMl0qYSx0WzNdPW5bM10rclszXSphLHRbNF09bls0XStyWzRdKmEsdFs1XT1uWzVdK3JbNV0qYSx0WzZdPW5bNl0rcls2XSphLHRbN109bls3XStyWzddKmEsdFs4XT1uWzhdK3JbOF0qYSx0fSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl0mJnRbM109PT1uWzNdJiZ0WzRdPT09bls0XSYmdFs1XT09PW5bNV0mJnRbNl09PT1uWzZdJiZ0WzddPT09bls3XSYmdFs4XT09PW5bOF19LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89dFszXSxpPXRbNF0scz10WzVdLGM9dFs2XSxmPXRbN10sTT10WzhdLGg9blswXSxsPW5bMV0sdj1uWzJdLGQ9blszXSxiPW5bNF0sbT1uWzVdLHA9bls2XSxQPW5bN10sQT1uWzhdO3JldHVybiBNYXRoLmFicyhyLWgpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhoKSkmJk1hdGguYWJzKGUtbCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKGwpKSYmTWF0aC5hYnModS12KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnModikpJiZNYXRoLmFicyhvLWQpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhvKSxNYXRoLmFicyhkKSkmJk1hdGguYWJzKGktYik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGkpLE1hdGguYWJzKGIpKSYmTWF0aC5hYnMocy1tKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMocyksTWF0aC5hYnMobSkpJiZNYXRoLmFicyhjLXApPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhjKSxNYXRoLmFicyhwKSkmJk1hdGguYWJzKGYtUCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGYpLE1hdGguYWJzKFApKSYmTWF0aC5hYnMoTS1BKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoTSksTWF0aC5hYnMoQSkpfTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUodCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLE09bls4XSxoPXJbMF0sbD1yWzFdLHY9clsyXSxkPXJbM10sYj1yWzRdLG09cls1XSxwPXJbNl0sUD1yWzddLEE9cls4XTtyZXR1cm4gdFswXT1oKmErbCpvK3YqYyx0WzFdPWgqZStsKmkrdipmLHRbMl09aCp1K2wqcyt2Kk0sdFszXT1kKmErYipvK20qYyx0WzRdPWQqZStiKmkrbSpmLHRbNV09ZCp1K2IqcyttKk0sdFs2XT1wKmErUCpvK0EqYyx0WzddPXAqZStQKmkrQSpmLHRbOF09cCp1K1AqcytBKk0sdH1mdW5jdGlvbiB1KHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdFsyXT1uWzJdLXJbMl0sdFszXT1uWzNdLXJbM10sdFs0XT1uWzRdLXJbNF0sdFs1XT1uWzVdLXJbNV0sdFs2XT1uWzZdLXJbNl0sdFs3XT1uWzddLXJbN10sdFs4XT1uWzhdLXJbOF0sdH1uLm11bD1lLG4uc3ViPXV9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLmZvckVhY2g9bi5zcXJMZW49bi5zcXJEaXN0PW4uZGlzdD1uLmRpdj1uLm11bD1uLnN1Yj1uLmxlbj12b2lkIDAsbi5jcmVhdGU9ZSxuLmNsb25lPWZ1bmN0aW9uKHQpe3ZhciBuPW5ldyBhLkFSUkFZX1RZUEUoMik7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sbn0sbi5mcm9tVmFsdWVzPWZ1bmN0aW9uKHQsbil7dmFyIHI9bmV3IGEuQVJSQVlfVFlQRSgyKTtyZXR1cm4gclswXT10LHJbMV09bixyfSxuLmNvcHk9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09blsxXSx0fSxuLnNldD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09bix0WzFdPXIsdH0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0fSxuLnN1YnRyYWN0PXUsbi5tdWx0aXBseT1vLG4uZGl2aWRlPWksbi5jZWlsPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5jZWlsKG5bMF0pLHRbMV09TWF0aC5jZWlsKG5bMV0pLHR9LG4uZmxvb3I9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLmZsb29yKG5bMF0pLHRbMV09TWF0aC5mbG9vcihuWzFdKSx0fSxuLm1pbj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09TWF0aC5taW4oblswXSxyWzBdKSx0WzFdPU1hdGgubWluKG5bMV0sclsxXSksdH0sbi5tYXg9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPU1hdGgubWF4KG5bMF0sclswXSksdFsxXT1NYXRoLm1heChuWzFdLHJbMV0pLHR9LG4ucm91bmQ9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLnJvdW5kKG5bMF0pLHRbMV09TWF0aC5yb3VuZChuWzFdKSx0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdH0sbi5zY2FsZUFuZEFkZD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0qYSx0WzFdPW5bMV0rclsxXSphLHR9LG4uZGlzdGFuY2U9cyxuLnNxdWFyZWREaXN0YW5jZT1jLG4ubGVuZ3RoPWYsbi5zcXVhcmVkTGVuZ3RoPU0sbi5uZWdhdGU9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0tblswXSx0WzFdPS1uWzFdLHR9LG4uaW52ZXJzZT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPTEvblswXSx0WzFdPTEvblsxXSx0fSxuLm5vcm1hbGl6ZT1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9cipyK2EqYTtlPjAmJihlPTEvTWF0aC5zcXJ0KGUpLHRbMF09blswXSplLHRbMV09blsxXSplKTtyZXR1cm4gdH0sbi5kb3Q9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXSpuWzBdK3RbMV0qblsxXX0sbi5jcm9zcz1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSpyWzFdLW5bMV0qclswXTtyZXR1cm4gdFswXT10WzFdPTAsdFsyXT1hLHR9LG4ubGVycD1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLHU9blsxXTtyZXR1cm4gdFswXT1lK2EqKHJbMF0tZSksdFsxXT11K2EqKHJbMV0tdSksdH0sbi5yYW5kb209ZnVuY3Rpb24odCxuKXtuPW58fDE7dmFyIHI9MiphLlJBTkRPTSgpKk1hdGguUEk7cmV0dXJuIHRbMF09TWF0aC5jb3Mocikqbix0WzFdPU1hdGguc2luKHIpKm4sdH0sbi50cmFuc2Zvcm1NYXQyPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXTtyZXR1cm4gdFswXT1yWzBdKmErclsyXSplLHRbMV09clsxXSphK3JbM10qZSx0fSxuLnRyYW5zZm9ybU1hdDJkPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXTtyZXR1cm4gdFswXT1yWzBdKmErclsyXSplK3JbNF0sdFsxXT1yWzFdKmErclszXSplK3JbNV0sdH0sbi50cmFuc2Zvcm1NYXQzPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXTtyZXR1cm4gdFswXT1yWzBdKmErclszXSplK3JbNl0sdFsxXT1yWzFdKmErcls0XSplK3JbN10sdH0sbi50cmFuc2Zvcm1NYXQ0PWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXTtyZXR1cm4gdFswXT1yWzBdKmErcls0XSplK3JbMTJdLHRbMV09clsxXSphK3JbNV0qZStyWzEzXSx0fSxuLnJvdGF0ZT1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1uWzBdLXJbMF0sdT1uWzFdLXJbMV0sbz1NYXRoLnNpbihhKSxpPU1hdGguY29zKGEpO3JldHVybiB0WzBdPWUqaS11Km8rclswXSx0WzFdPWUqbyt1KmkrclsxXSx0fSxuLmFuZ2xlPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxhPXRbMV0sZT1uWzBdLHU9blsxXSxvPXIqcithKmE7bz4wJiYobz0xL01hdGguc3FydChvKSk7dmFyIGk9ZSplK3UqdTtpPjAmJihpPTEvTWF0aC5zcXJ0KGkpKTt2YXIgcz0ociplK2EqdSkqbyppO3JldHVybiBzPjE/MDpzPC0xP01hdGguUEk6TWF0aC5hY29zKHMpfSxuLnN0cj1mdW5jdGlvbih0KXtyZXR1cm5cInZlYzIoXCIrdFswXStcIiwgXCIrdFsxXStcIilcIn0sbi5leGFjdEVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPT09blswXSYmdFsxXT09PW5bMV19LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT1uWzBdLG89blsxXTtyZXR1cm4gTWF0aC5hYnMoci11KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMociksTWF0aC5hYnModSkpJiZNYXRoLmFicyhlLW8pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhlKSxNYXRoLmFicyhvKSl9O3ZhciBhPWZ1bmN0aW9uKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn0ocigwKSk7ZnVuY3Rpb24gZSgpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoMik7cmV0dXJuIGEuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFswXT0wLHRbMV09MCksdH1mdW5jdGlvbiB1KHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdH1mdW5jdGlvbiBvKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnJbMF0sdFsxXT1uWzFdKnJbMV0sdH1mdW5jdGlvbiBpKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdL3JbMF0sdFsxXT1uWzFdL3JbMV0sdH1mdW5jdGlvbiBzKHQsbil7dmFyIHI9blswXS10WzBdLGE9blsxXS10WzFdO3JldHVybiBNYXRoLnNxcnQocipyK2EqYSl9ZnVuY3Rpb24gYyh0LG4pe3ZhciByPW5bMF0tdFswXSxhPW5bMV0tdFsxXTtyZXR1cm4gcipyK2EqYX1mdW5jdGlvbiBmKHQpe3ZhciBuPXRbMF0scj10WzFdO3JldHVybiBNYXRoLnNxcnQobipuK3Iqcil9ZnVuY3Rpb24gTSh0KXt2YXIgbj10WzBdLHI9dFsxXTtyZXR1cm4gbipuK3Iqcn1uLmxlbj1mLG4uc3ViPXUsbi5tdWw9byxuLmRpdj1pLG4uZGlzdD1zLG4uc3FyRGlzdD1jLG4uc3FyTGVuPU0sbi5mb3JFYWNoPWZ1bmN0aW9uKCl7dmFyIHQ9ZSgpO3JldHVybiBmdW5jdGlvbihuLHIsYSxlLHUsbyl7dmFyIGk9dm9pZCAwLHM9dm9pZCAwO2ZvcihyfHwocj0yKSxhfHwoYT0wKSxzPWU/TWF0aC5taW4oZSpyK2Esbi5sZW5ndGgpOm4ubGVuZ3RoLGk9YTtpPHM7aSs9cil0WzBdPW5baV0sdFsxXT1uW2krMV0sdSh0LHQsbyksbltpXT10WzBdLG5baSsxXT10WzFdO3JldHVybiBufX0oKX0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc3FyTGVuPW4uc3F1YXJlZExlbmd0aD1uLmxlbj1uLmxlbmd0aD1uLmRvdD1uLm11bD1uLnNldFJlYWw9bi5nZXRSZWFsPXZvaWQgMCxuLmNyZWF0ZT1mdW5jdGlvbigpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoOCk7YS5BUlJBWV9UWVBFIT1GbG9hdDMyQXJyYXkmJih0WzBdPTAsdFsxXT0wLHRbMl09MCx0WzRdPTAsdFs1XT0wLHRbNl09MCx0WzddPTApO3JldHVybiB0WzNdPTEsdH0sbi5jbG9uZT1mdW5jdGlvbih0KXt2YXIgbj1uZXcgYS5BUlJBWV9UWVBFKDgpO3JldHVybiBuWzBdPXRbMF0sblsxXT10WzFdLG5bMl09dFsyXSxuWzNdPXRbM10sbls0XT10WzRdLG5bNV09dFs1XSxuWzZdPXRbNl0sbls3XT10WzddLG59LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlLHUsbyxpLHMpe3ZhciBjPW5ldyBhLkFSUkFZX1RZUEUoOCk7cmV0dXJuIGNbMF09dCxjWzFdPW4sY1syXT1yLGNbM109ZSxjWzRdPXUsY1s1XT1vLGNbNl09aSxjWzddPXMsY30sbi5mcm9tUm90YXRpb25UcmFuc2xhdGlvblZhbHVlcz1mdW5jdGlvbih0LG4scixlLHUsbyxpKXt2YXIgcz1uZXcgYS5BUlJBWV9UWVBFKDgpO3NbMF09dCxzWzFdPW4sc1syXT1yLHNbM109ZTt2YXIgYz0uNSp1LGY9LjUqbyxNPS41Kmk7cmV0dXJuIHNbNF09YyplK2Yqci1NKm4sc1s1XT1mKmUrTSp0LWMqcixzWzZdPU0qZStjKm4tZip0LHNbN109LWMqdC1mKm4tTSpyLHN9LG4uZnJvbVJvdGF0aW9uVHJhbnNsYXRpb249aSxuLmZyb21UcmFuc2xhdGlvbj1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPTAsdFsxXT0wLHRbMl09MCx0WzNdPTEsdFs0XT0uNSpuWzBdLHRbNV09LjUqblsxXSx0WzZdPS41Km5bMl0sdFs3XT0wLHR9LG4uZnJvbVJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0WzRdPTAsdFs1XT0wLHRbNl09MCx0WzddPTAsdH0sbi5mcm9tTWF0ND1mdW5jdGlvbih0LG4pe3ZhciByPWUuY3JlYXRlKCk7dS5nZXRSb3RhdGlvbihyLG4pO3ZhciBvPW5ldyBhLkFSUkFZX1RZUEUoMyk7cmV0dXJuIHUuZ2V0VHJhbnNsYXRpb24obyxuKSxpKHQscixvKSx0fSxuLmNvcHk9cyxuLmlkZW50aXR5PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdPTAsdFsxXT0wLHRbMl09MCx0WzNdPTEsdFs0XT0wLHRbNV09MCx0WzZdPTAsdFs3XT0wLHR9LG4uc2V0PWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8saSxzKXtyZXR1cm4gdFswXT1uLHRbMV09cix0WzJdPWEsdFszXT1lLHRbNF09dSx0WzVdPW8sdFs2XT1pLHRbN109cyx0fSxuLmdldER1YWw9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzRdLHRbMV09bls1XSx0WzJdPW5bNl0sdFszXT1uWzddLHR9LG4uc2V0RHVhbD1mdW5jdGlvbih0LG4pe3JldHVybiB0WzRdPW5bMF0sdFs1XT1uWzFdLHRbNl09blsyXSx0WzddPW5bM10sdH0sbi5nZXRUcmFuc2xhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPW5bNF0sYT1uWzVdLGU9bls2XSx1PW5bN10sbz0tblswXSxpPS1uWzFdLHM9LW5bMl0sYz1uWzNdO3JldHVybiB0WzBdPTIqKHIqYyt1Km8rYSpzLWUqaSksdFsxXT0yKihhKmMrdSppK2Uqby1yKnMpLHRbMl09MiooZSpjK3UqcytyKmktYSpvKSx0fSxuLnRyYW5zbGF0ZT1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPS41KnJbMF0scz0uNSpyWzFdLGM9LjUqclsyXSxmPW5bNF0sTT1uWzVdLGg9bls2XSxsPW5bN107cmV0dXJuIHRbMF09YSx0WzFdPWUsdFsyXT11LHRbM109byx0WzRdPW8qaStlKmMtdSpzK2YsdFs1XT1vKnMrdSppLWEqYytNLHRbNl09bypjK2Eqcy1lKmkraCx0WzddPS1hKmktZSpzLXUqYytsLHR9LG4ucm90YXRlWD1mdW5jdGlvbih0LG4scil7dmFyIGE9LW5bMF0sdT0tblsxXSxvPS1uWzJdLGk9blszXSxzPW5bNF0sYz1uWzVdLGY9bls2XSxNPW5bN10saD1zKmkrTSphK2Mqby1mKnUsbD1jKmkrTSp1K2YqYS1zKm8sdj1mKmkrTSpvK3MqdS1jKmEsZD1NKmktcyphLWMqdS1mKm87cmV0dXJuIGUucm90YXRlWCh0LG4sciksYT10WzBdLHU9dFsxXSxvPXRbMl0saT10WzNdLHRbNF09aCppK2QqYStsKm8tdip1LHRbNV09bCppK2QqdSt2KmEtaCpvLHRbNl09dippK2QqbytoKnUtbCphLHRbN109ZCppLWgqYS1sKnUtdipvLHR9LG4ucm90YXRlWT1mdW5jdGlvbih0LG4scil7dmFyIGE9LW5bMF0sdT0tblsxXSxvPS1uWzJdLGk9blszXSxzPW5bNF0sYz1uWzVdLGY9bls2XSxNPW5bN10saD1zKmkrTSphK2Mqby1mKnUsbD1jKmkrTSp1K2YqYS1zKm8sdj1mKmkrTSpvK3MqdS1jKmEsZD1NKmktcyphLWMqdS1mKm87cmV0dXJuIGUucm90YXRlWSh0LG4sciksYT10WzBdLHU9dFsxXSxvPXRbMl0saT10WzNdLHRbNF09aCppK2QqYStsKm8tdip1LHRbNV09bCppK2QqdSt2KmEtaCpvLHRbNl09dippK2QqbytoKnUtbCphLHRbN109ZCppLWgqYS1sKnUtdipvLHR9LG4ucm90YXRlWj1mdW5jdGlvbih0LG4scil7dmFyIGE9LW5bMF0sdT0tblsxXSxvPS1uWzJdLGk9blszXSxzPW5bNF0sYz1uWzVdLGY9bls2XSxNPW5bN10saD1zKmkrTSphK2Mqby1mKnUsbD1jKmkrTSp1K2YqYS1zKm8sdj1mKmkrTSpvK3MqdS1jKmEsZD1NKmktcyphLWMqdS1mKm87cmV0dXJuIGUucm90YXRlWih0LG4sciksYT10WzBdLHU9dFsxXSxvPXRbMl0saT10WzNdLHRbNF09aCppK2QqYStsKm8tdip1LHRbNV09bCppK2QqdSt2KmEtaCpvLHRbNl09dippK2QqbytoKnUtbCphLHRbN109ZCppLWgqYS1sKnUtdipvLHR9LG4ucm90YXRlQnlRdWF0QXBwZW5kPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1yWzBdLGU9clsxXSx1PXJbMl0sbz1yWzNdLGk9blswXSxzPW5bMV0sYz1uWzJdLGY9blszXTtyZXR1cm4gdFswXT1pKm8rZiphK3MqdS1jKmUsdFsxXT1zKm8rZiplK2MqYS1pKnUsdFsyXT1jKm8rZip1K2kqZS1zKmEsdFszXT1mKm8taSphLXMqZS1jKnUsaT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLHRbNF09aSpvK2YqYStzKnUtYyplLHRbNV09cypvK2YqZStjKmEtaSp1LHRbNl09YypvK2YqdStpKmUtcyphLHRbN109ZipvLWkqYS1zKmUtYyp1LHR9LG4ucm90YXRlQnlRdWF0UHJlcGVuZD1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPXJbMF0scz1yWzFdLGM9clsyXSxmPXJbM107cmV0dXJuIHRbMF09YSpmK28qaStlKmMtdSpzLHRbMV09ZSpmK28qcyt1KmktYSpjLHRbMl09dSpmK28qYythKnMtZSppLHRbM109bypmLWEqaS1lKnMtdSpjLGk9cls0XSxzPXJbNV0sYz1yWzZdLGY9cls3XSx0WzRdPWEqZitvKmkrZSpjLXUqcyx0WzVdPWUqZitvKnMrdSppLWEqYyx0WzZdPXUqZitvKmMrYSpzLWUqaSx0WzddPW8qZi1hKmktZSpzLXUqYyx0fSxuLnJvdGF0ZUFyb3VuZEF4aXM9ZnVuY3Rpb24odCxuLHIsZSl7aWYoTWF0aC5hYnMoZSk8YS5FUFNJTE9OKXJldHVybiBzKHQsbik7dmFyIHU9TWF0aC5zcXJ0KHJbMF0qclswXStyWzFdKnJbMV0rclsyXSpyWzJdKTtlKj0uNTt2YXIgbz1NYXRoLnNpbihlKSxpPW8qclswXS91LGM9bypyWzFdL3UsZj1vKnJbMl0vdSxNPU1hdGguY29zKGUpLGg9blswXSxsPW5bMV0sdj1uWzJdLGQ9blszXTt0WzBdPWgqTStkKmkrbCpmLXYqYyx0WzFdPWwqTStkKmMrdippLWgqZix0WzJdPXYqTStkKmYraCpjLWwqaSx0WzNdPWQqTS1oKmktbCpjLXYqZjt2YXIgYj1uWzRdLG09bls1XSxwPW5bNl0sUD1uWzddO3JldHVybiB0WzRdPWIqTStQKmkrbSpmLXAqYyx0WzVdPW0qTStQKmMrcCppLWIqZix0WzZdPXAqTStQKmYrYipjLW0qaSx0WzddPVAqTS1iKmktbSpjLXAqZix0fSxuLmFkZD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXStyWzBdLHRbMV09blsxXStyWzFdLHRbMl09blsyXStyWzJdLHRbM109blszXStyWzNdLHRbNF09bls0XStyWzRdLHRbNV09bls1XStyWzVdLHRbNl09bls2XStyWzZdLHRbN109bls3XStyWzddLHR9LG4ubXVsdGlwbHk9YyxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdFsyXT1uWzJdKnIsdFszXT1uWzNdKnIsdFs0XT1uWzRdKnIsdFs1XT1uWzVdKnIsdFs2XT1uWzZdKnIsdFs3XT1uWzddKnIsdH0sbi5sZXJwPWZ1bmN0aW9uKHQsbixyLGEpe3ZhciBlPTEtYTtmKG4scik8MCYmKGE9LWEpO3JldHVybiB0WzBdPW5bMF0qZStyWzBdKmEsdFsxXT1uWzFdKmUrclsxXSphLHRbMl09blsyXSplK3JbMl0qYSx0WzNdPW5bM10qZStyWzNdKmEsdFs0XT1uWzRdKmUrcls0XSphLHRbNV09bls1XSplK3JbNV0qYSx0WzZdPW5bNl0qZStyWzZdKmEsdFs3XT1uWzddKmUrcls3XSphLHR9LG4uaW52ZXJ0PWZ1bmN0aW9uKHQsbil7dmFyIHI9aChuKTtyZXR1cm4gdFswXT0tblswXS9yLHRbMV09LW5bMV0vcix0WzJdPS1uWzJdL3IsdFszXT1uWzNdL3IsdFs0XT0tbls0XS9yLHRbNV09LW5bNV0vcix0WzZdPS1uWzZdL3IsdFs3XT1uWzddL3IsdH0sbi5jb25qdWdhdGU9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0tblswXSx0WzFdPS1uWzFdLHRbMl09LW5bMl0sdFszXT1uWzNdLHRbNF09LW5bNF0sdFs1XT0tbls1XSx0WzZdPS1uWzZdLHRbN109bls3XSx0fSxuLm5vcm1hbGl6ZT1mdW5jdGlvbih0LG4pe3ZhciByPWgobik7aWYocj4wKXtyPU1hdGguc3FydChyKTt2YXIgYT1uWzBdL3IsZT1uWzFdL3IsdT1uWzJdL3Isbz1uWzNdL3IsaT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLE09YSppK2Uqcyt1KmMrbypmO3RbMF09YSx0WzFdPWUsdFsyXT11LHRbM109byx0WzRdPShpLWEqTSkvcix0WzVdPShzLWUqTSkvcix0WzZdPShjLXUqTSkvcix0WzddPShmLW8qTSkvcn1yZXR1cm4gdH0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJxdWF0MihcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiLCBcIit0WzRdK1wiLCBcIit0WzVdK1wiLCBcIit0WzZdK1wiLCBcIit0WzddK1wiKVwifSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl0mJnRbM109PT1uWzNdJiZ0WzRdPT09bls0XSYmdFs1XT09PW5bNV0mJnRbNl09PT1uWzZdJiZ0WzddPT09bls3XX0sbi5lcXVhbHM9ZnVuY3Rpb24odCxuKXt2YXIgcj10WzBdLGU9dFsxXSx1PXRbMl0sbz10WzNdLGk9dFs0XSxzPXRbNV0sYz10WzZdLGY9dFs3XSxNPW5bMF0saD1uWzFdLGw9blsyXSx2PW5bM10sZD1uWzRdLGI9bls1XSxtPW5bNl0scD1uWzddO3JldHVybiBNYXRoLmFicyhyLU0pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhNKSkmJk1hdGguYWJzKGUtaCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKGgpKSYmTWF0aC5hYnModS1sKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnMobCkpJiZNYXRoLmFicyhvLXYpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhvKSxNYXRoLmFicyh2KSkmJk1hdGguYWJzKGktZCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGkpLE1hdGguYWJzKGQpKSYmTWF0aC5hYnMocy1iKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMocyksTWF0aC5hYnMoYikpJiZNYXRoLmFicyhjLW0pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhjKSxNYXRoLmFicyhtKSkmJk1hdGguYWJzKGYtcCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGYpLE1hdGguYWJzKHApKX07dmFyIGE9byhyKDApKSxlPW8ocigzKSksdT1vKHIoNCkpO2Z1bmN0aW9uIG8odCl7aWYodCYmdC5fX2VzTW9kdWxlKXJldHVybiB0O3ZhciBuPXt9O2lmKG51bGwhPXQpZm9yKHZhciByIGluIHQpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQscikmJihuW3JdPXRbcl0pO3JldHVybiBuLmRlZmF1bHQ9dCxufWZ1bmN0aW9uIGkodCxuLHIpe3ZhciBhPS41KnJbMF0sZT0uNSpyWzFdLHU9LjUqclsyXSxvPW5bMF0saT1uWzFdLHM9blsyXSxjPW5bM107cmV0dXJuIHRbMF09byx0WzFdPWksdFsyXT1zLHRbM109Yyx0WzRdPWEqYytlKnMtdSppLHRbNV09ZSpjK3Uqby1hKnMsdFs2XT11KmMrYSppLWUqbyx0WzddPS1hKm8tZSppLXUqcyx0fWZ1bmN0aW9uIHModCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09blsxXSx0WzJdPW5bMl0sdFszXT1uWzNdLHRbNF09bls0XSx0WzVdPW5bNV0sdFs2XT1uWzZdLHRbN109bls3XSx0fW4uZ2V0UmVhbD1lLmNvcHk7bi5zZXRSZWFsPWUuY29weTtmdW5jdGlvbiBjKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9cls0XSxzPXJbNV0sYz1yWzZdLGY9cls3XSxNPW5bNF0saD1uWzVdLGw9bls2XSx2PW5bN10sZD1yWzBdLGI9clsxXSxtPXJbMl0scD1yWzNdO3JldHVybiB0WzBdPWEqcCtvKmQrZSptLXUqYix0WzFdPWUqcCtvKmIrdSpkLWEqbSx0WzJdPXUqcCtvKm0rYSpiLWUqZCx0WzNdPW8qcC1hKmQtZSpiLXUqbSx0WzRdPWEqZitvKmkrZSpjLXUqcytNKnArdipkK2gqbS1sKmIsdFs1XT1lKmYrbypzK3UqaS1hKmMraCpwK3YqYitsKmQtTSptLHRbNl09dSpmK28qYythKnMtZSppK2wqcCt2Km0rTSpiLWgqZCx0WzddPW8qZi1hKmktZSpzLXUqYyt2KnAtTSpkLWgqYi1sKm0sdH1uLm11bD1jO3ZhciBmPW4uZG90PWUuZG90O3ZhciBNPW4ubGVuZ3RoPWUubGVuZ3RoLGg9KG4ubGVuPU0sbi5zcXVhcmVkTGVuZ3RoPWUuc3F1YXJlZExlbmd0aCk7bi5zcXJMZW49aH0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4uc3ViPW4ubXVsPXZvaWQgMCxuLmNyZWF0ZT1mdW5jdGlvbigpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoNik7YS5BUlJBWV9UWVBFIT1GbG9hdDMyQXJyYXkmJih0WzFdPTAsdFsyXT0wLHRbNF09MCx0WzVdPTApO3JldHVybiB0WzBdPTEsdFszXT0xLHR9LG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSg2KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG5bNF09dFs0XSxuWzVdPXRbNV0sbn0sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0WzRdPW5bNF0sdFs1XT1uWzVdLHR9LG4uaWRlbnRpdHk9ZnVuY3Rpb24odCl7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MSx0WzRdPTAsdFs1XT0wLHR9LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlLHUsbyl7dmFyIGk9bmV3IGEuQVJSQVlfVFlQRSg2KTtyZXR1cm4gaVswXT10LGlbMV09bixpWzJdPXIsaVszXT1lLGlbNF09dSxpWzVdPW8saX0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIsYSxlLHUsbyl7cmV0dXJuIHRbMF09bix0WzFdPXIsdFsyXT1hLHRbM109ZSx0WzRdPXUsdFs1XT1vLHR9LG4uaW52ZXJ0PWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPW5bNF0saT1uWzVdLHM9cip1LWEqZTtpZighcylyZXR1cm4gbnVsbDtyZXR1cm4gcz0xL3MsdFswXT11KnMsdFsxXT0tYSpzLHRbMl09LWUqcyx0WzNdPXIqcyx0WzRdPShlKmktdSpvKSpzLHRbNV09KGEqby1yKmkpKnMsdH0sbi5kZXRlcm1pbmFudD1mdW5jdGlvbih0KXtyZXR1cm4gdFswXSp0WzNdLXRbMV0qdFsyXX0sbi5tdWx0aXBseT1lLG4ucm90YXRlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1NYXRoLnNpbihyKSxmPU1hdGguY29zKHIpO3JldHVybiB0WzBdPWEqZit1KmMsdFsxXT1lKmYrbypjLHRbMl09YSotYyt1KmYsdFszXT1lKi1jK28qZix0WzRdPWksdFs1XT1zLHR9LG4uc2NhbGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPXJbMF0sZj1yWzFdO3JldHVybiB0WzBdPWEqYyx0WzFdPWUqYyx0WzJdPXUqZix0WzNdPW8qZix0WzRdPWksdFs1XT1zLHR9LG4udHJhbnNsYXRlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1yWzBdLGY9clsxXTtyZXR1cm4gdFswXT1hLHRbMV09ZSx0WzJdPXUsdFszXT1vLHRbNF09YSpjK3UqZitpLHRbNV09ZSpjK28qZitzLHR9LG4uZnJvbVJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7dmFyIHI9TWF0aC5zaW4obiksYT1NYXRoLmNvcyhuKTtyZXR1cm4gdFswXT1hLHRbMV09cix0WzJdPS1yLHRbM109YSx0WzRdPTAsdFs1XT0wLHR9LG4uZnJvbVNjYWxpbmc9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09MCx0WzJdPTAsdFszXT1uWzFdLHRbNF09MCx0WzVdPTAsdH0sbi5mcm9tVHJhbnNsYXRpb249ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0xLHRbMV09MCx0WzJdPTAsdFszXT0xLHRbNF09blswXSx0WzVdPW5bMV0sdH0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJtYXQyZChcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiLCBcIit0WzRdK1wiLCBcIit0WzVdK1wiKVwifSxuLmZyb2I9ZnVuY3Rpb24odCl7cmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh0WzBdLDIpK01hdGgucG93KHRbMV0sMikrTWF0aC5wb3codFsyXSwyKStNYXRoLnBvdyh0WzNdLDIpK01hdGgucG93KHRbNF0sMikrTWF0aC5wb3codFs1XSwyKSsxKX0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0WzNdPW5bM10rclszXSx0WzRdPW5bNF0rcls0XSx0WzVdPW5bNV0rcls1XSx0fSxuLnN1YnRyYWN0PXUsbi5tdWx0aXBseVNjYWxhcj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXSpyLHRbMV09blsxXSpyLHRbMl09blsyXSpyLHRbM109blszXSpyLHRbNF09bls0XSpyLHRbNV09bls1XSpyLHR9LG4ubXVsdGlwbHlTY2FsYXJBbmRBZGQ9ZnVuY3Rpb24odCxuLHIsYSl7cmV0dXJuIHRbMF09blswXStyWzBdKmEsdFsxXT1uWzFdK3JbMV0qYSx0WzJdPW5bMl0rclsyXSphLHRbM109blszXStyWzNdKmEsdFs0XT1uWzRdK3JbNF0qYSx0WzVdPW5bNV0rcls1XSphLHR9LG4uZXhhY3RFcXVhbHM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT09PW5bMF0mJnRbMV09PT1uWzFdJiZ0WzJdPT09blsyXSYmdFszXT09PW5bM10mJnRbNF09PT1uWzRdJiZ0WzVdPT09bls1XX0sbi5lcXVhbHM9ZnVuY3Rpb24odCxuKXt2YXIgcj10WzBdLGU9dFsxXSx1PXRbMl0sbz10WzNdLGk9dFs0XSxzPXRbNV0sYz1uWzBdLGY9blsxXSxNPW5bMl0saD1uWzNdLGw9bls0XSx2PW5bNV07cmV0dXJuIE1hdGguYWJzKHItYyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHIpLE1hdGguYWJzKGMpKSYmTWF0aC5hYnMoZS1mKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZSksTWF0aC5hYnMoZikpJiZNYXRoLmFicyh1LU0pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyh1KSxNYXRoLmFicyhNKSkmJk1hdGguYWJzKG8taCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKG8pLE1hdGguYWJzKGgpKSYmTWF0aC5hYnMoaS1sKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoaSksTWF0aC5hYnMobCkpJiZNYXRoLmFicyhzLXYpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhzKSxNYXRoLmFicyh2KSl9O3ZhciBhPWZ1bmN0aW9uKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn0ocigwKSk7ZnVuY3Rpb24gZSh0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPW5bNF0scz1uWzVdLGM9clswXSxmPXJbMV0sTT1yWzJdLGg9clszXSxsPXJbNF0sdj1yWzVdO3JldHVybiB0WzBdPWEqYyt1KmYsdFsxXT1lKmMrbypmLHRbMl09YSpNK3UqaCx0WzNdPWUqTStvKmgsdFs0XT1hKmwrdSp2K2ksdFs1XT1lKmwrbyp2K3MsdH1mdW5jdGlvbiB1KHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdFsyXT1uWzJdLXJbMl0sdFszXT1uWzNdLXJbM10sdFs0XT1uWzRdLXJbNF0sdFs1XT1uWzVdLXJbNV0sdH1uLm11bD1lLG4uc3ViPXV9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnN1Yj1uLm11bD12b2lkIDAsbi5jcmVhdGU9ZnVuY3Rpb24oKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDQpO2EuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFsxXT0wLHRbMl09MCk7cmV0dXJuIHRbMF09MSx0WzNdPTEsdH0sbi5jbG9uZT1mdW5jdGlvbih0KXt2YXIgbj1uZXcgYS5BUlJBWV9UWVBFKDQpO3JldHVybiBuWzBdPXRbMF0sblsxXT10WzFdLG5bMl09dFsyXSxuWzNdPXRbM10sbn0sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0fSxuLmlkZW50aXR5PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTEsdH0sbi5mcm9tVmFsdWVzPWZ1bmN0aW9uKHQsbixyLGUpe3ZhciB1PW5ldyBhLkFSUkFZX1RZUEUoNCk7cmV0dXJuIHVbMF09dCx1WzFdPW4sdVsyXT1yLHVbM109ZSx1fSxuLnNldD1mdW5jdGlvbih0LG4scixhLGUpe3JldHVybiB0WzBdPW4sdFsxXT1yLHRbMl09YSx0WzNdPWUsdH0sbi50cmFuc3Bvc2U9ZnVuY3Rpb24odCxuKXtpZih0PT09bil7dmFyIHI9blsxXTt0WzFdPW5bMl0sdFsyXT1yfWVsc2UgdFswXT1uWzBdLHRbMV09blsyXSx0WzJdPW5bMV0sdFszXT1uWzNdO3JldHVybiB0fSxuLmludmVydD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1yKnUtZSphO2lmKCFvKXJldHVybiBudWxsO3JldHVybiBvPTEvbyx0WzBdPXUqbyx0WzFdPS1hKm8sdFsyXT0tZSpvLHRbM109cipvLHR9LG4uYWRqb2ludD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF07cmV0dXJuIHRbMF09blszXSx0WzFdPS1uWzFdLHRbMl09LW5bMl0sdFszXT1yLHR9LG4uZGV0ZXJtaW5hbnQ9ZnVuY3Rpb24odCl7cmV0dXJuIHRbMF0qdFszXS10WzJdKnRbMV19LG4ubXVsdGlwbHk9ZSxuLnJvdGF0ZT1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPU1hdGguc2luKHIpLHM9TWF0aC5jb3Mocik7cmV0dXJuIHRbMF09YSpzK3UqaSx0WzFdPWUqcytvKmksdFsyXT1hKi1pK3Uqcyx0WzNdPWUqLWkrbypzLHR9LG4uc2NhbGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1yWzBdLHM9clsxXTtyZXR1cm4gdFswXT1hKmksdFsxXT1lKmksdFsyXT11KnMsdFszXT1vKnMsdH0sbi5mcm9tUm90YXRpb249ZnVuY3Rpb24odCxuKXt2YXIgcj1NYXRoLnNpbihuKSxhPU1hdGguY29zKG4pO3JldHVybiB0WzBdPWEsdFsxXT1yLHRbMl09LXIsdFszXT1hLHR9LG4uZnJvbVNjYWxpbmc9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09MCx0WzJdPTAsdFszXT1uWzFdLHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwibWF0MihcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiKVwifSxuLmZyb2I9ZnVuY3Rpb24odCl7cmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh0WzBdLDIpK01hdGgucG93KHRbMV0sMikrTWF0aC5wb3codFsyXSwyKStNYXRoLnBvdyh0WzNdLDIpKX0sbi5MRFU9ZnVuY3Rpb24odCxuLHIsYSl7cmV0dXJuIHRbMl09YVsyXS9hWzBdLHJbMF09YVswXSxyWzFdPWFbMV0sclszXT1hWzNdLXRbMl0qclsxXSxbdCxuLHJdfSxuLmFkZD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXStyWzBdLHRbMV09blsxXStyWzFdLHRbMl09blsyXStyWzJdLHRbM109blszXStyWzNdLHR9LG4uc3VidHJhY3Q9dSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl0mJnRbM109PT1uWzNdfSxuLmVxdWFscz1mdW5jdGlvbih0LG4pe3ZhciByPXRbMF0sZT10WzFdLHU9dFsyXSxvPXRbM10saT1uWzBdLHM9blsxXSxjPW5bMl0sZj1uWzNdO3JldHVybiBNYXRoLmFicyhyLWkpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhpKSkmJk1hdGguYWJzKGUtcyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKHMpKSYmTWF0aC5hYnModS1jKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnMoYykpJiZNYXRoLmFicyhvLWYpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhvKSxNYXRoLmFicyhmKSl9LG4ubXVsdGlwbHlTY2FsYXI9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qcix0WzFdPW5bMV0qcix0WzJdPW5bMl0qcix0WzNdPW5bM10qcix0fSxuLm11bHRpcGx5U2NhbGFyQW5kQWRkPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW5bMF0rclswXSphLHRbMV09blsxXStyWzFdKmEsdFsyXT1uWzJdK3JbMl0qYSx0WzNdPW5bM10rclszXSphLHR9O3ZhciBhPWZ1bmN0aW9uKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn0ocigwKSk7ZnVuY3Rpb24gZSh0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPXJbMF0scz1yWzFdLGM9clsyXSxmPXJbM107cmV0dXJuIHRbMF09YSppK3Uqcyx0WzFdPWUqaStvKnMsdFsyXT1hKmMrdSpmLHRbM109ZSpjK28qZix0fWZ1bmN0aW9uIHUodCxuLHIpe3JldHVybiB0WzBdPW5bMF0tclswXSx0WzFdPW5bMV0tclsxXSx0WzJdPW5bMl0tclsyXSx0WzNdPW5bM10tclszXSx0fW4ubXVsPWUsbi5zdWI9dX0sZnVuY3Rpb24odCxuLHIpe1widXNlIHN0cmljdFwiO09iamVjdC5kZWZpbmVQcm9wZXJ0eShuLFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pLG4udmVjND1uLnZlYzM9bi52ZWMyPW4ucXVhdDI9bi5xdWF0PW4ubWF0ND1uLm1hdDM9bi5tYXQyZD1uLm1hdDI9bi5nbE1hdHJpeD12b2lkIDA7dmFyIGE9bChyKDApKSxlPWwocig5KSksdT1sKHIoOCkpLG89bChyKDUpKSxpPWwocig0KSkscz1sKHIoMykpLGM9bChyKDcpKSxmPWwocig2KSksTT1sKHIoMikpLGg9bChyKDEpKTtmdW5jdGlvbiBsKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn1uLmdsTWF0cml4PWEsbi5tYXQyPWUsbi5tYXQyZD11LG4ubWF0Mz1vLG4ubWF0ND1pLG4ucXVhdD1zLG4ucXVhdDI9YyxuLnZlYzI9ZixuLnZlYzM9TSxuLnZlYzQ9aH1dKX0pOyIsIm1vZHVsZS5leHBvcnRzLnNjcmVlblRyaWFuZ2xlU3RhcnQgPSAwO1xyXG5tb2R1bGUuZXhwb3J0cy5zY3JlZW5UcmlhbmdsZVNpemUgPSAzO1xyXG5tb2R1bGUuZXhwb3J0cy5jdWJlU3RhcnQgPSAzO1xyXG5tb2R1bGUuZXhwb3J0cy5jdWJlU2l6ZSA9IDM2O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuZGF0YSA9IFxyXG5bXHJcbiAgLTEuMDAsIC0xLjAwLCAgMC4wMCwgMCwgMCwgIDAuMDAsICAwLjAwLCAgMC4wMCxcclxuICAgMy4wMCwgLTEuMDAsICAwLjAwLCAxLCAwLCAgMC4wMCwgIDAuMDAsICAwLjAwLFxyXG4gIC0xLjAwLCAgMy4wMCwgIDAuMDAsIDAsIDEsICAwLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsICAxLjAwLCAgMC4wMCxcclxuICAgMC41MCwgIDAuNTAsIC0wLjUwLCAwLCAxLCAgMC4wMCwgIDEuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAgMC41MCwgLTAuNTAsIDAsIDAsICAwLjAwLCAgMS4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAgMC41MCwgLTAuNTAsIC0wLjUwLCAwLCAxLCAgMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgLTAuNTAsIDAsIDAsICAxLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsIC0xLjAwLCAgMC4wMCxcclxuICAtMC41MCwgLTAuNTAsIC0wLjUwLCAwLCAxLCAgMC4wMCwgLTEuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgLTAuNTAsIDAsIDAsICAwLjAwLCAtMS4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAgMC41MCwgMSwgMCwgLTEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAtMC41MCwgIDAuNTAsIC0wLjUwLCAwLCAxLCAtMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAtMC41MCwgLTAuNTAsIDAsIDAsIC0xLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAtMC41MCwgMSwgMCwgIDAuMDAsICAwLjAwLCAtMS4wMCxcclxuICAtMC41MCwgIDAuNTAsIC0wLjUwLCAwLCAxLCAgMC4wMCwgIDAuMDAsIC0xLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgLTAuNTAsIDAsIDAsICAwLjAwLCAgMC4wMCwgLTEuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsICAwLjAwLCAgMS4wMCxcclxuICAtMC41MCwgLTAuNTAsICAwLjUwLCAwLCAxLCAgMC4wMCwgIDAuMDAsICAxLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgIDAuNTAsIDAsIDAsICAwLjAwLCAgMC4wMCwgIDEuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsICAxLjAwLCAgMC4wMCxcclxuICAgMC41MCwgIDAuNTAsICAwLjUwLCAxLCAxLCAgMC4wMCwgIDEuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgLTAuNTAsIDAsIDEsICAwLjAwLCAgMS4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAgMC41MCwgLTAuNTAsICAwLjUwLCAxLCAxLCAgMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgLTAuNTAsIDAsIDEsICAxLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsIC0xLjAwLCAgMC4wMCxcclxuICAtMC41MCwgLTAuNTAsICAwLjUwLCAxLCAxLCAgMC4wMCwgLTEuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAtMC41MCwgLTAuNTAsIDAsIDEsICAwLjAwLCAtMS4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAgMC41MCwgMSwgMCwgLTEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAtMC41MCwgIDAuNTAsICAwLjUwLCAxLCAxLCAtMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAgMC41MCwgLTAuNTAsIDAsIDEsIC0xLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAtMC41MCwgMSwgMCwgIDAuMDAsICAwLjAwLCAtMS4wMCxcclxuICAtMC41MCwgLTAuNTAsIC0wLjUwLCAxLCAxLCAgMC4wMCwgIDAuMDAsIC0xLjAwLFxyXG4gIC0wLjUwLCAgMC41MCwgLTAuNTAsIDAsIDEsICAwLjAwLCAgMC4wMCwgLTEuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAgMC41MCwgMSwgMCwgIDAuMDAsICAwLjAwLCAgMS4wMCxcclxuICAtMC41MCwgIDAuNTAsICAwLjUwLCAxLCAxLCAgMC4wMCwgIDAuMDAsICAxLjAwLFxyXG4gIC0wLjUwLCAtMC41MCwgIDAuNTAsIDAsIDEsICAwLjAwLCAgMC4wMCwgIDEuMDAsXHJcbl07IiwiY29uc3Qgc2hhZGVycyA9IHJlcXVpcmUoXCIuL3NoYWRlcnMuanNcIik7XHJcbmNvbnN0IFJhd0RhdGEgPSByZXF1aXJlKFwiLi9yYXctZGF0YVwiKTtcclxuXHJcbmxldCBnbDtcclxubGV0IEFOR0xFO1xyXG5sZXQgc2NyZWVuV2lkdGgsIHNjcmVlbkhlaWdodDtcclxuXHJcbmZ1bmN0aW9uIGluaXRpYWxpemUoKSB7XHJcblxyXG4gICAgY29uc3Qgc3VjY2VzcyA9XHJcbiAgICAgICAgc2V0dXBHTCgpICYmXHJcbiAgICAgICAgc2V0dXBFeHRlbnNpb25zKCkgJiZcclxuICAgICAgICBzZXR1cFN0YXRpY1NldHRpbmdzKCkgJiZcclxuICAgICAgICBjb21waWxlU2hhZGVycygpICYmXHJcbiAgICAgICAgc2V0dXBQcmltaXRpdmVzKCk7XHJcblxyXG4gICAgcmV0dXJuIHN1Y2Nlc3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdsRW51bVRvU3RyaW5nKGdsLCB2YWx1ZSkge1xyXG4gICAgLy8gT3B0aW1pemF0aW9uIGZvciB0aGUgbW9zdCBjb21tb24gZW51bTpcclxuICAgIGlmICh2YWx1ZSA9PT0gZ2wuTk9fRVJST1IpIHtcclxuICAgICAgICByZXR1cm4gXCJOT19FUlJPUlwiO1xyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBwIGluIGdsKSB7XHJcbiAgICAgICAgaWYgKGdsW3BdID09PSB2YWx1ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gcDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gXCIweFwiICsgdmFsdWUudG9TdHJpbmcoMTYpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVHTEVycm9yV3JhcHBlcihjb250ZXh0LCBmbmFtZSkge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGNvbnN0IHJ2ID0gY29udGV4dFtmbmFtZV0uYXBwbHkoY29udGV4dCwgYXJndW1lbnRzKTtcclxuICAgICAgICBjb25zdCBlcnIgPSBjb250ZXh0LmdldEVycm9yKCk7XHJcbiAgICAgICAgaWYgKGVyciAhPT0gY29udGV4dC5OT19FUlJPUilcclxuICAgICAgICAgICAgdGhyb3cgXCJHTCBlcnJvciBcIiArIGdsRW51bVRvU3RyaW5nKGNvbnRleHQsIGVycikgKyBcIiBpbiBcIiArIGZuYW1lO1xyXG4gICAgICAgIHJldHVybiBydjtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZTNEQ29udGV4dFdpdGhXcmFwcGVyVGhhdFRocm93c09uR0xFcnJvcihjb250ZXh0KSB7XHJcblxyXG4gICAgY29uc3Qgd3JhcCA9IHt9O1xyXG4gICAgZm9yIChjb25zdCBpIGluIGNvbnRleHQpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnRleHRbaV0gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgIHdyYXBbaV0gPSBjcmVhdGVHTEVycm9yV3JhcHBlcihjb250ZXh0LCBpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHdyYXBbaV0gPSBjb250ZXh0W2ldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBlcnJvcihcImNyZWF0ZUNvbnRleHRXcmFwcGVyVGhhdFRocm93c09uR0xFcnJvcjogRXJyb3IgYWNjZXNzaW5nIFwiICsgaSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgd3JhcC5nZXRFcnJvciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBjb250ZXh0LmdldEVycm9yKCk7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHdyYXA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwR0woKSB7XHJcblxyXG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWUtc3VyZmFjZScpO1xyXG5cclxuICAgIGdsID0gY2FudmFzLmdldENvbnRleHQoJ3dlYmdsJyk7XHJcbiAgICBpZiAoIWdsKVxyXG4gICAgICAgIGdsID0gY2FudmFzLmdldENvbnRleHQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpO1xyXG5cclxuICAgIGlmICghZ2wpXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgIC8vIGdsID0gY3JlYXRlM0RDb250ZXh0V2l0aFdyYXBwZXJUaGF0VGhyb3dzT25HTEVycm9yKGdsKTtcclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0R0woKSB7XHJcbiAgICByZXR1cm4gZ2w7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwRXh0ZW5zaW9ucygpIHtcclxuXHJcbiAgICBBTkdMRSA9IGdsLmdldEV4dGVuc2lvbihcIkFOR0xFX2luc3RhbmNlZF9hcnJheXNcIik7XHJcbiAgICBpZiAoIUFOR0xFKVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoIWdsLmdldEV4dGVuc2lvbihcIk9FU190ZXh0dXJlX2Zsb2F0XCIpKVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBpZiAoIWdsLmdldEV4dGVuc2lvbihcIk9FU190ZXh0dXJlX2Zsb2F0X2xpbmVhclwiKSlcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldFNjcmVlblNpemUod2lkdGgsIGhlaWdodCkge1xyXG4gICAgc2NyZWVuV2lkdGggPSB3aWR0aDtcclxuICAgIHNjcmVlbkhlaWdodCA9IGhlaWdodDtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QXNwZWN0UmF0aW8oKSB7XHJcbiAgICByZXR1cm4gc2NyZWVuV2lkdGggLyBzY3JlZW5IZWlnaHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU3RhdGljU2V0dGluZ3MoKSB7XHJcblxyXG4gICAgZ2wuZW5hYmxlKGdsLkNVTExfRkFDRSk7XHJcbiAgICBnbC5mcm9udEZhY2UoZ2wuQ0NXKTtcclxuICAgIGdsLmN1bGxGYWNlKGdsLkJBQ0spO1xyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG5sZXQgZnJhbWVCdWZmZXI7XHJcbmxldCBwcmltaXRpdmVzQnVmZmVyLCBpbnN0YW5jZUNvb3Jkc0J1ZmZlciwgcG9zaXRpb25zQnVmZmVyO1xyXG5sZXQgc2NyZWVuVHJpYW5nbGVTdGFydCwgc2NyZWVuVHJpYW5nbGVTaXplLCBjdWJlU3RhcnQsIGN1YmVTaXplO1xyXG5cclxuZnVuY3Rpb24gc2V0dXBQcmltaXRpdmVzKCkge1xyXG5cclxuICAgIGZyYW1lQnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcclxuXHJcbiAgICBjb25zdCBkYXRhID0gbmV3IEZsb2F0MzJBcnJheShSYXdEYXRhLmRhdGEpO1xyXG5cclxuICAgIHNjcmVlblRyaWFuZ2xlU3RhcnQgPSBSYXdEYXRhLnNjcmVlblRyaWFuZ2xlU3RhcnQ7XHJcbiAgICBzY3JlZW5UcmlhbmdsZVNpemUgPSBSYXdEYXRhLnNjcmVlblRyaWFuZ2xlU2l6ZTtcclxuXHJcbiAgICBjdWJlU3RhcnQgPSBSYXdEYXRhLmN1YmVTdGFydDtcclxuICAgIGN1YmVTaXplID0gUmF3RGF0YS5jdWJlU2l6ZTtcclxuXHJcbiAgICBwcmltaXRpdmVzQnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XHJcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgcHJpbWl0aXZlc0J1ZmZlcik7XHJcbiAgICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgZGF0YSwgZ2wuU1RBVElDX0RSQVcpO1xyXG5cclxuICAgIGxldCBpbmRleDtcclxuXHJcbiAgICBpbmRleCA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHNjZW5lU2hhZGVyLnByb2dyYW0sIFwidmVydGV4UG9zaXRpb25cIik7XHJcbiAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleCk7XHJcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxyXG4gICAgICAgIGluZGV4LFxyXG4gICAgICAgIDMsXHJcbiAgICAgICAgZ2wuRkxPQVQsXHJcbiAgICAgICAgZ2wuRkFMU0UsXHJcbiAgICAgICAgOCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCxcclxuICAgICAgICAwXHJcbiAgICApO1xyXG5cclxuICAgIGluZGV4ID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24oc2NlbmVTaGFkZXIucHJvZ3JhbSwgXCJ0ZXhDb29yZFwiKTtcclxuICAgIC8vIHJlbW92ZSB0aGlzIHdoZW4gdGV4Q29vcmQgd291bGRuJ3QgYmUgb3B0aW1pemVkIGF3YXkgKGUuZy4gd2lsbCBiZSB1c2VkKVxyXG4gICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KTtcclxuICAgICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxyXG4gICAgICAgICAgICBpbmRleCxcclxuICAgICAgICAgICAgMixcclxuICAgICAgICAgICAgZ2wuRkxPQVQsXHJcbiAgICAgICAgICAgIGdsLkZBTFNFLFxyXG4gICAgICAgICAgICA4ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxyXG4gICAgICAgICAgICAzICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBpbmRleCA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHNjZW5lU2hhZGVyLnByb2dyYW0sIFwidmVydGV4Tm9ybWFsXCIpO1xyXG4gICAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoaW5kZXgpO1xyXG4gICAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihcclxuICAgICAgICBpbmRleCxcclxuICAgICAgICAzLFxyXG4gICAgICAgIGdsLkZMT0FULFxyXG4gICAgICAgIGdsLkZBTFNFLFxyXG4gICAgICAgIDggKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXHJcbiAgICAgICAgNSAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVFxyXG4gICAgKTtcclxuXHJcbiAgICBpbnN0YW5jZUNvb3Jkc0J1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xyXG4gICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIGluc3RhbmNlQ29vcmRzQnVmZmVyKTtcclxuXHJcbiAgICBpbmRleCA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHNjZW5lU2hhZGVyLnByb2dyYW0sIFwiaW5zdGFuY2VDb29yZFwiKTtcclxuICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KTtcclxuICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIoXHJcbiAgICAgICAgaW5kZXgsXHJcbiAgICAgICAgMixcclxuICAgICAgICBnbC5GTE9BVCxcclxuICAgICAgICBnbC5GQUxTRSxcclxuICAgICAgICAyICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxyXG4gICAgICAgIDBcclxuICAgICk7XHJcbiAgICBBTkdMRS52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoaW5kZXgsIDEpO1xyXG5cclxuICAgIHBvc2l0aW9uc0J1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xyXG4gICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHBvc2l0aW9uc0J1ZmZlcik7XHJcblxyXG4gICAgaW5kZXggPSBnbC5nZXRBdHRyaWJMb2NhdGlvbihzY2VuZVNoYWRlci5wcm9ncmFtLCBcInJvb3RQb3NpdGlvblwiKTtcclxuICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KTtcclxuICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIoXHJcbiAgICAgICAgaW5kZXgsXHJcbiAgICAgICAgMyxcclxuICAgICAgICBnbC5GTE9BVCxcclxuICAgICAgICBnbC5GQUxTRSxcclxuICAgICAgICAzICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxyXG4gICAgICAgIDBcclxuICAgICk7XHJcbiAgICBBTkdMRS52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoaW5kZXgsIDEpO1xyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG4vLyBzaGFyZWRcclxuXHJcbmxldCBxdWF0TXVsU2hhZGVyLCBvZmZzZXRBZGRTaGFkZXIsIHNjZW5lU2hhZGVyLCB0ZXhPdXRwdXRTaGFkZXI7XHJcblxyXG5mdW5jdGlvbiBjb21waWxlU2hhZGVycygpIHtcclxuXHJcbiAgICAvLyBxdWF0ZXJuaW9uIG11bHRpcGxpY2F0aW9uXHJcblxyXG4gICAgcXVhdE11bFNoYWRlciA9IGNvbXBpbGVTaGFkZXIoXCJxdWF0ZXJuaW9uIG11bHRpcGxpY2F0aW9uXCIsIHNoYWRlcnMucXVhdGVybmlvbk11bHRpcGxpY2F0aW9uVmVydGV4U2hhZGVyLFxyXG4gICAgICAgIHNoYWRlcnMucXVhdGVybmlvbk11bHRpcGxpY2F0aW9uRnJhZ21lbnRTaGFkZXIsIFsncmVsYXRpdmVSb3RhdGlvbnMnLCAnaW5zdGFuY2VzJywgJ3BhcmVudFJvdGF0aW9ucycsICdib25lSWQnXSk7XHJcblxyXG4gICAgcXVhdE11bFNoYWRlci51c2UoKTtcclxuICAgIGdsLnVuaWZvcm0xaShxdWF0TXVsU2hhZGVyLnJlbGF0aXZlUm90YXRpb25zLCAwKTtcclxuICAgIGdsLnVuaWZvcm0xaShxdWF0TXVsU2hhZGVyLmluc3RhbmNlcywgMSk7XHJcbiAgICBnbC51bmlmb3JtMWkocXVhdE11bFNoYWRlci5wYXJlbnRSb3RhdGlvbnMsIDIpO1xyXG5cclxuICAgIC8vIG9mZnNldCBhZGRcclxuXHJcbiAgICBvZmZzZXRBZGRTaGFkZXIgPSBjb21waWxlU2hhZGVyKFwib2Zmc2V0IGFkZFwiLCBzaGFkZXJzLm9mZnNldFJvdGF0aXRpb25BbmRBZGRpdGlvblZlcnRleFNoYWRlcixcclxuICAgICAgICBzaGFkZXJzLm9mZnNldFJvdGF0aXRpb25BbmRBZGRpdGlvbkZyYWdtZW50U2hhZGVyLCBbJ3JvdGF0aW9ucycsICdwYXJlbnRPZmZzZXRzJywgJ2JvbmVPZmZzZXQnXSk7XHJcblxyXG4gICAgb2Zmc2V0QWRkU2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKG9mZnNldEFkZFNoYWRlci5yb3RhdGlvbnMsIDApO1xyXG4gICAgZ2wudW5pZm9ybTFpKG9mZnNldEFkZFNoYWRlci5wYXJlbnRPZmZzZXRzLCAxKTtcclxuXHJcbiAgICAvLyBzY2VuZVxyXG5cclxuICAgIHNjZW5lU2hhZGVyID0gY29tcGlsZVNoYWRlcihcInNjZW5lXCIsIHNoYWRlcnMuc2NlbmVWZXJ0ZXhTaGFkZXIsIHNoYWRlcnMuc2NlbmVGcmFnbWVudFNoYWRlcixcclxuICAgICAgICBbJ3JvdGF0aW9ucycsICdvZmZzZXRzJywgJ3Byb2plY3Rpb24nLCAndmlldycsICdzaXplJywgJ21pZGRsZVRyYW5zbGF0aW9uJ10pO1xyXG5cclxuICAgIHNjZW5lU2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKHNjZW5lU2hhZGVyLnJvdGF0aW9ucywgMCk7XHJcbiAgICBnbC51bmlmb3JtMWkoc2NlbmVTaGFkZXIub2Zmc2V0cywgMSk7XHJcblxyXG4gICAgLy8gdGV4dHVyZSBvdXRwdXRcclxuXHJcbiAgICB0ZXhPdXRwdXRTaGFkZXIgPSBjb21waWxlU2hhZGVyKFwidGV4dHVyZSBvdXRwdXRcIiwgc2hhZGVycy50ZXh0dXJlT3V0cHV0VmVydGV4U2hhZGVyLFxyXG4gICAgICAgIHNoYWRlcnMudGV4dHVyZU91dHB1dEZyYWdtZW50U2hhZGVyLCBbJ2lucHV0VGV4JywgJ2ludk91dHB1dFNpemUnXSk7XHJcblxyXG4gICAgdGV4T3V0cHV0U2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKHRleE91dHB1dFNoYWRlci5pbnB1dFRleCwgMCk7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbi8vIHJlbmRlciB1dGlsc1xyXG5cclxuZnVuY3Rpb24gc2V0dXBGbGF0UmVuZGVyKCkge1xyXG4gICAgZ2wuZGlzYWJsZShnbC5ERVBUSF9URVNUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXAzRFJlbmRlcigpIHtcclxuICAgIGdsLmVuYWJsZShnbC5ERVBUSF9URVNUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBSZW5kZXJUb1RleHR1cmUodGV4T3V0LCB0ZXhXaWR0aCwgdGV4SGVpZ2h0KSB7XHJcblxyXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBmcmFtZUJ1ZmZlcik7XHJcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuQ09MT1JfQVRUQUNITUVOVDAsIGdsLlRFWFRVUkVfMkQsIHRleE91dCwgMCk7XHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGZyYW1lQnVmZmVyKTtcclxuICAgIGdsLnZpZXdwb3J0KDAsIDAsIHRleFdpZHRoLCB0ZXhIZWlnaHQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFJlbmRlclRvRnJvbnRCdWZmZXIoKSB7XHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xyXG4gICAgZ2wudmlld3BvcnQoMCwgMCwgc2NyZWVuV2lkdGgsIHNjcmVlbkhlaWdodCk7XHJcbn1cclxuXHJcbi8vIHNwZWNpZmljIHJlbmRlciBtb2Rlc1xyXG5cclxuZnVuY3Rpb24gY29tcHV0ZVF1YXRzKGJvbmVJZCwgcmVsYXRpdmVSb3RhdGlvbnMsIGluc3RhbmNlcywgcGFyZW50Um90YXRpb25zLCBvdXRwdXRSb3RhdGlvbnMpIHtcclxuXHJcbiAgICBxdWF0TXVsU2hhZGVyLnVzZSgpO1xyXG5cclxuICAgIHNldHVwRmxhdFJlbmRlcigpO1xyXG4gICAgc2V0dXBSZW5kZXJUb1RleHR1cmUob3V0cHV0Um90YXRpb25zLCA2NCwgNjQpO1xyXG5cclxuICAgIGdsLnVuaWZvcm0xZihxdWF0TXVsU2hhZGVyLmJvbmVJZCwgYm9uZUlkKTtcclxuXHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHJlbGF0aXZlUm90YXRpb25zKTtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTEpO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgaW5zdGFuY2VzKTtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTIpO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgcGFyZW50Um90YXRpb25zKTtcclxuXHJcbiAgICBkcmF3RmxhdCgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb21wdXRlT2Zmc2V0cyhvZmZzZXQsIHJvdGF0aW9ucywgcGFyZW50T2Zmc2V0cywgb3V0cHV0T2Zmc2V0cykge1xyXG5cclxuICAgIG9mZnNldEFkZFNoYWRlci51c2UoKTtcclxuXHJcbiAgICBzZXR1cEZsYXRSZW5kZXIoKTtcclxuICAgIHNldHVwUmVuZGVyVG9UZXh0dXJlKG91dHB1dE9mZnNldHMsIDY0LCA2NCk7XHJcblxyXG4gICAgZ2wudW5pZm9ybTNmdihvZmZzZXRBZGRTaGFkZXIuYm9uZU9mZnNldCwgb2Zmc2V0KTtcclxuXHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHJvdGF0aW9ucyk7XHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUxKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHBhcmVudE9mZnNldHMpO1xyXG5cclxuICAgIGRyYXdGbGF0KCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdGbGF0KCkge1xyXG4gICAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIHNjcmVlblRyaWFuZ2xlU3RhcnQsIHNjcmVlblRyaWFuZ2xlU2l6ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFyKCkge1xyXG4gICAgZ2wuY2xlYXJDb2xvcigxLCAwLCAwLCAxKTtcclxuICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQgfCBnbC5ERVBUSF9CVUZGRVJfQklUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBTY2VuZShwcm9qZWN0aW9uLCB2aWV3KSB7XHJcblxyXG4gICAgc2NlbmVTaGFkZXIudXNlKCk7XHJcblxyXG4gICAgc2V0dXAzRFJlbmRlcigpO1xyXG4gICAgc2V0dXBSZW5kZXJUb0Zyb250QnVmZmVyKCk7XHJcblxyXG4gICAgZ2wudW5pZm9ybU1hdHJpeDRmdihzY2VuZVNoYWRlci5wcm9qZWN0aW9uLCBnbC5GQUxTRSwgcHJvamVjdGlvbik7XHJcbiAgICBnbC51bmlmb3JtTWF0cml4NGZ2KHNjZW5lU2hhZGVyLnZpZXcsIGdsLkZBTFNFLCB2aWV3KTtcclxuXHJcbiAgICBjbGVhcigpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cEluc3RhbmNlQ29vcmRzKGRhdGEpIHtcclxuICAgIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBpbnN0YW5jZUNvb3Jkc0J1ZmZlcik7XHJcbiAgICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgZGF0YSwgZ2wuU1RBVElDX0RSQVcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFBvc2l0aW9ucyhkYXRhKSB7XHJcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgcG9zaXRpb25zQnVmZmVyKTtcclxuICAgIGdsLmJ1ZmZlckRhdGEoZ2wuQVJSQVlfQlVGRkVSLCBkYXRhLCBnbC5EWU5BTUlDX0RSQVcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3SW5zdGFuY2VzKHJvdGF0aW9ucywgb2Zmc2V0cywgc2l6ZSwgbWlkZGxlVHJhbnNsYXRpb24sIGluc3RhbmNlc0NvdW50KSB7XHJcblxyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCByb3RhdGlvbnMpO1xyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMSk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBvZmZzZXRzKTtcclxuXHJcbiAgICBnbC51bmlmb3JtM2Z2KHNjZW5lU2hhZGVyLnNpemUsIHNpemUpO1xyXG4gICAgZ2wudW5pZm9ybTNmdihzY2VuZVNoYWRlci5taWRkbGVUcmFuc2xhdGlvbiwgbWlkZGxlVHJhbnNsYXRpb24pO1xyXG5cclxuICAgIEFOR0xFLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRShnbC5UUklBTkdMRVMsIGN1YmVTdGFydCwgY3ViZVNpemUsIGluc3RhbmNlc0NvdW50KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd1RleHR1cmUodGV4KSB7XHJcblxyXG4gICAgdGV4T3V0cHV0U2hhZGVyLnVzZSgpO1xyXG5cclxuICAgIHNldHVwRmxhdFJlbmRlcigpO1xyXG4gICAgc2V0dXBSZW5kZXJUb0Zyb250QnVmZmVyKCk7XHJcblxyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0ZXgpO1xyXG5cclxuICAgIGdsLnVuaWZvcm0xZih0ZXhPdXRwdXRTaGFkZXIuaW52T3V0cHV0U2l6ZSwgMS4wIC8gc2NyZWVuV2lkdGgpO1xyXG5cclxuICAgIGRyYXdGbGF0KCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXBpbGVTaGFkZXIobmFtZSwgdmVydGV4U2hhZGVyQ29kZSwgZnJhZ21lbnRTaGFkZXJDb2RlLCB1bmlmb3Jtcykge1xyXG5cclxuICAgIGNvbnN0IHZlcnRleFNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcihnbC5WRVJURVhfU0hBREVSKTtcclxuICAgIGNvbnN0IGZyYWdtZW50U2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKGdsLkZSQUdNRU5UX1NIQURFUik7XHJcblxyXG4gICAgZ2wuc2hhZGVyU291cmNlKHZlcnRleFNoYWRlciwgdmVydGV4U2hhZGVyQ29kZSk7XHJcbiAgICBnbC5zaGFkZXJTb3VyY2UoZnJhZ21lbnRTaGFkZXIsIGZyYWdtZW50U2hhZGVyQ29kZSk7XHJcblxyXG4gICAgZ2wuY29tcGlsZVNoYWRlcih2ZXJ0ZXhTaGFkZXIpO1xyXG4gICAgaWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIodmVydGV4U2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFUlJPUiBjb21waWxpbmcgdmVydGV4IHNoYWRlciBmb3IgJyArIG5hbWUgKyAnIScsIGdsLmdldFNoYWRlckluZm9Mb2codmVydGV4U2hhZGVyKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGdsLmNvbXBpbGVTaGFkZXIoZnJhZ21lbnRTaGFkZXIpO1xyXG4gICAgaWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoZnJhZ21lbnRTaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VSUk9SIGNvbXBpbGluZyBmcmFnbWVudCBzaGFkZXIgZm9yICcgKyBuYW1lICsgJyEnLCBnbC5nZXRTaGFkZXJJbmZvTG9nKGZyYWdtZW50U2hhZGVyKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XHJcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydGV4U2hhZGVyKTtcclxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnbWVudFNoYWRlcik7XHJcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKTtcclxuICAgIGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBnbC5MSU5LX1NUQVRVUykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFUlJPUiBsaW5raW5nIHByb2dyYW0hJywgZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSkpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGdsLnZhbGlkYXRlUHJvZ3JhbShwcm9ncmFtKTtcclxuICAgIGlmICghZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBnbC5WQUxJREFURV9TVEFUVVMpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignRVJST1IgdmFsaWRhdGluZyBwcm9ncmFtIScsIGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaW5zdGFuY2UgPSB7XHJcbiAgICAgICAgcHJvZ3JhbTogcHJvZ3JhbSxcclxuXHJcbiAgICAgICAgdXNlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGdsLnVzZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHVuaWZvcm1zLmZvckVhY2goZnVuY3Rpb24gKHVuaWZvcm0pIHtcclxuICAgICAgICBpbnN0YW5jZVt1bmlmb3JtXSA9IGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCB1bmlmb3JtKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBpbnN0YW5jZTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMuaW5pdGlhbGl6ZSA9IGluaXRpYWxpemU7XHJcbm1vZHVsZS5leHBvcnRzLmdldEdMID0gZ2V0R0w7XHJcbm1vZHVsZS5leHBvcnRzLnNldFNjcmVlblNpemUgPSBzZXRTY3JlZW5TaXplO1xyXG5tb2R1bGUuZXhwb3J0cy5nZXRBc3BlY3RSYXRpbyA9IGdldEFzcGVjdFJhdGlvO1xyXG5tb2R1bGUuZXhwb3J0cy5jb21wdXRlUXVhdHMgPSBjb21wdXRlUXVhdHM7XHJcbm1vZHVsZS5leHBvcnRzLmNvbXB1dGVPZmZzZXRzID0gY29tcHV0ZU9mZnNldHM7XHJcbm1vZHVsZS5leHBvcnRzLnNldHVwU2NlbmUgPSBzZXR1cFNjZW5lO1xyXG5tb2R1bGUuZXhwb3J0cy5zZXR1cEluc3RhbmNlQ29vcmRzID0gc2V0dXBJbnN0YW5jZUNvb3JkcztcclxubW9kdWxlLmV4cG9ydHMuc2V0dXBQb3NpdGlvbnMgPSBzZXR1cFBvc2l0aW9ucztcclxubW9kdWxlLmV4cG9ydHMuZHJhd0luc3RhbmNlcyA9IGRyYXdJbnN0YW5jZXM7XHJcbm1vZHVsZS5leHBvcnRzLmRyYXdUZXh0dXJlID0gZHJhd1RleHR1cmU7IiwiY29uc3QgUmVuZGVyID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xyXG5cclxubGV0IHN0YXRlID0gMDtcclxubGV0IGRvbmVDYWxsYmFjaztcclxubGV0IGdsO1xyXG5cclxuZnVuY3Rpb24gaW5pdGlhbGl6ZShjYWxsYmFjaykge1xyXG5cclxuICAgIGdsID0gUmVuZGVyLmdldEdMKCk7XHJcblxyXG4gICAgZG9uZUNhbGxiYWNrID0gY2FsbGJhY2s7XHJcblxyXG4gICAgbG9hZEFsbFJlc291cmNlcygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZHZhbmNlU3RhdGUoKSB7XHJcblxyXG4gICAgaWYgKHN0YXRlID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKFwicmVzb3VyY2VMb2FkZXI6IHN0YXRlIGlzIGFkdmFuY2VkIGJleW9uZCBmaW5pc2ggc3RhdGVcIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRlLS07XHJcbiAgICBpZiAoc3RhdGUgPT09IDApXHJcbiAgICAgICAgZG9uZUNhbGxiYWNrKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvYWRUZXh0dXJlKHVybCwgbmVhcmVzdCkge1xyXG5cclxuICAgIGNvbnN0IHRleCA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcclxuXHJcbiAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgaW1hZ2Uub25sb2FkID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRleCk7XHJcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBnbC5SR0JBLCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBpbWFnZSk7XHJcblxyXG4gICAgICAgIHNldHVwVGV4dHVyZUZpbHRlcmluZyh0ZXgsIG5lYXJlc3QpO1xyXG5cclxuICAgICAgICBhZHZhbmNlU3RhdGUoKTtcclxuICAgIH07XHJcbiAgICBpbWFnZS5zcmMgPSB1cmw7XHJcblxyXG4gICAgcmV0dXJuIHRleDtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlVGV4dHVyZShzaXplLCBuZWFyZXN0LCBmbG9hdCwgcmVuZGVyYWJsZSkge1xyXG4gICAgcmV0dXJuIGNyZWF0ZVRleHR1cmVXaXRoRGF0YShzaXplLCBuZWFyZXN0LCBmbG9hdCwgcmVuZGVyYWJsZSwgbnVsbCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVXaXRoRGF0YShzaXplLCBuZWFyZXN0LCBmbG9hdCwgcmVuZGVyYWJsZSwgcGl4ZWxzKSB7XHJcblxyXG4gICAgY29uc3QgdGV4ID0gZ2wuY3JlYXRlVGV4dHVyZSgpO1xyXG5cclxuICAgIHVwZGF0ZVRleHR1cmUodGV4LCBzaXplLCBmbG9hdCwgcmVuZGVyYWJsZSwgcGl4ZWxzKTtcclxuXHJcbiAgICBzZXR1cFRleHR1cmVGaWx0ZXJpbmcodGV4LCBuZWFyZXN0KTtcclxuXHJcbiAgICByZXR1cm4gdGV4O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFRleHR1cmVGaWx0ZXJpbmcodGV4LCBuZWFyZXN0KSB7XHJcblxyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGV4KTtcclxuXHJcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1QsIGdsLkNMQU1QX1RPX0VER0UpO1xyXG5cclxuICAgIGlmIChuZWFyZXN0KSB7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLk5FQVJFU1QpO1xyXG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5ORUFSRVNUKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUik7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGdsLkxJTkVBUik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVRleHR1cmUodGV4LCBzaXplLCBmbG9hdCwgcmVuZGVyYWJsZSwgcGl4ZWxzKSB7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0ZXgpO1xyXG4gICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBnbC5SR0JBLCBzaXplLCBzaXplLCAwLCBnbC5SR0JBLCBmbG9hdCA/IGdsLkZMT0FUIDogZ2wuVU5TSUdORURfQllURSwgcGl4ZWxzKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZEpzb24odXJsKSB7XHJcblxyXG4gICAgY29uc3QganNvbiA9IHsgY29udGVudDogbnVsbCB9O1xyXG5cclxuICAgIGNvbnN0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSk7XHJcbiAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xyXG4gICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKVxyXG4gICAgICAgICAgICBqc29uLmNvbnRlbnQgPSB4aHIucmVzcG9uc2U7XHJcblxyXG4gICAgICAgIGFkdmFuY2VTdGF0ZSgpO1xyXG4gICAgfTtcclxuICAgIHhoci5zZW5kKCk7XHJcblxyXG4gICAgcmV0dXJuIGpzb247XHJcbn1cclxuXHJcbmxldCBkYXRhYmFzZTtcclxuXHJcbmZ1bmN0aW9uIGxvYWRBbGxSZXNvdXJjZXMoKSB7XHJcblxyXG4gICAgaWYgKHN0YXRlICE9PSAwKVxyXG4gICAgICAgIHJldHVybjtcclxuXHJcbiAgICBzdGF0ZSA9IDE7XHJcbiAgICBkYXRhYmFzZSA9IGxvYWRKc29uKCdkYXRhYmFzZS5qc29uJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldERhdGFiYXNlKCkge1xyXG4gICAgcmV0dXJuIGRhdGFiYXNlO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5pbml0aWFsaXplID0gaW5pdGlhbGl6ZTtcclxubW9kdWxlLmV4cG9ydHMuY3JlYXRlVGV4dHVyZSA9IGNyZWF0ZVRleHR1cmU7XHJcbm1vZHVsZS5leHBvcnRzLmNyZWF0ZVRleHR1cmVXaXRoRGF0YSA9IGNyZWF0ZVRleHR1cmVXaXRoRGF0YTtcclxubW9kdWxlLmV4cG9ydHMudXBkYXRlVGV4dHVyZSA9IHVwZGF0ZVRleHR1cmU7XHJcbm1vZHVsZS5leHBvcnRzLmdldERhdGFiYXNlID0gZ2V0RGF0YWJhc2U7IiwiLy8gc2hhZGVycyBzdGFydFxyXG5cclxubW9kdWxlLmV4cG9ydHMub2Zmc2V0Um90YXRpdGlvbkFuZEFkZGl0aW9uRnJhZ21lbnRTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbG93cCBmbG9hdDtcXG4nICtcclxuICAgICdwcmVjaXNpb24gbG93cCBzYW1wbGVyMkQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSBzYW1wbGVyMkQgcm90YXRpb25zO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIHBhcmVudE9mZnNldHM7XFxuJyArXHJcbiAgICAndW5pZm9ybSB2ZWMzIGJvbmVPZmZzZXQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjNCBxdWF0X211bCh2ZWM0IHExLCB2ZWM0IHEyKSB7XFxuJyArXHJcbiAgICAnXHRyZXR1cm4gdmVjNChcXG4nICtcclxuICAgICdcdFx0cTIueHl6ICogcTEudyArIHExLnh5eiAqIHEyLncgKyBjcm9zcyhxMS54eXosIHEyLnh5eiksXFxuJyArXHJcbiAgICAnXHRcdHExLncgKiBxMi53IC0gZG90KHExLnh5eiwgcTIueHl6KVxcbicgK1xyXG4gICAgJ1x0KTtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjMyByb3RhdGVfdmVjdG9yKHZlYzMgdiwgdmVjNCByKSB7XFxuJyArXHJcbiAgICAnXHR2ZWM0IHJfYyA9IHIgKiB2ZWM0KC0xLCAtMSwgLTEsIDEpO1xcbicgK1xyXG4gICAgJ1x0cmV0dXJuIHF1YXRfbXVsKHIsIHF1YXRfbXVsKHZlYzQodiwgMCksIHJfYykpLnh5ejtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIHZlYzIgY3VycmVudFBvc2l0aW9uID0gdmVjMihnbF9GcmFnQ29vcmQueCwgZ2xfRnJhZ0Nvb3JkLnkpIC8gNjQuMDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjNCByb3RhdGlvblEgPSB0ZXh0dXJlMkQocm90YXRpb25zLCBjdXJyZW50UG9zaXRpb24pO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIHJvdGF0ZWRfb2Zmc2V0ID0gcm90YXRlX3ZlY3Rvcihib25lT2Zmc2V0LCByb3RhdGlvblEpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIHBhcmVudF9vZmZzZXQgPSB0ZXh0dXJlMkQocGFyZW50T2Zmc2V0cywgY3VycmVudFBvc2l0aW9uKS54eXo7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzMgcmVzdWx0ID0gcGFyZW50X29mZnNldCArIHJvdGF0ZWRfb2Zmc2V0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KHJlc3VsdCwgMSk7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5vZmZzZXRSb3RhdGl0aW9uQW5kQWRkaXRpb25WZXJ0ZXhTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbG93cCBmbG9hdDtcXG4nICtcclxuICAgICdwcmVjaXNpb24gbG93cCBzYW1wbGVyMkQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzMgdmVydGV4UG9zaXRpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh2ZXJ0ZXhQb3NpdGlvbiwgMS4wKTtcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLnF1YXRlcm5pb25NdWx0aXBsaWNhdGlvbkZyYWdtZW50U2hhZGVyID0gXHJcbiAgICAncHJlY2lzaW9uIGxvd3AgZmxvYXQ7XFxuJyArXHJcbiAgICAncHJlY2lzaW9uIGxvd3Agc2FtcGxlcjJEO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIHJlbGF0aXZlUm90YXRpb25zO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIGluc3RhbmNlcztcXG4nICtcclxuICAgICd1bmlmb3JtIHNhbXBsZXIyRCBwYXJlbnRSb3RhdGlvbnM7XFxuJyArXHJcbiAgICAndW5pZm9ybSBmbG9hdCBib25lSWQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjNCBxdWF0X211bCh2ZWM0IHExLCB2ZWM0IHEyKSB7XFxuJyArXHJcbiAgICAnXHRyZXR1cm4gdmVjNChcXG4nICtcclxuICAgICdcdFx0cTIueHl6ICogcTEudyArIHExLnh5eiAqIHEyLncgKyBjcm9zcyhxMS54eXosIHEyLnh5eiksXFxuJyArXHJcbiAgICAnXHRcdHExLncgKiBxMi53IC0gZG90KHExLnh5eiwgcTIueHl6KVxcbicgK1xyXG4gICAgJ1x0KTtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIHZlYzIgY3VycmVudFBvc2l0aW9uID0gdmVjMihnbF9GcmFnQ29vcmQueCwgZ2xfRnJhZ0Nvb3JkLnkpIC8gNjQuMDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjNCBpbnN0YW5jZUluZm8gPSB0ZXh0dXJlMkQoaW5zdGFuY2VzLCBjdXJyZW50UG9zaXRpb24pO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBmbG9hdCBzdHJpZGUgPSBpbnN0YW5jZUluZm8uejtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjMiByZWxhdGl2ZVJvdGF0aW9uc1Bvc2l0aW9uID0gdmVjMihpbnN0YW5jZUluZm8ueCArIHN0cmlkZSAqIGJvbmVJZCwgaW5zdGFuY2VJbmZvLnkpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IHJlbGF0aXZlUm90YXRpb25RID0gdGV4dHVyZTJEKHJlbGF0aXZlUm90YXRpb25zLCByZWxhdGl2ZVJvdGF0aW9uc1Bvc2l0aW9uKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjNCBwYXJlbnRSb3RhdGlvblEgPSB0ZXh0dXJlMkQocGFyZW50Um90YXRpb25zLCBjdXJyZW50UG9zaXRpb24pO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IG91dHB1dF9xdWF0ID0gcXVhdF9tdWwocmVsYXRpdmVSb3RhdGlvblEsIHBhcmVudFJvdGF0aW9uUSk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIGdsX0ZyYWdDb2xvciA9IG91dHB1dF9xdWF0O1xcbicgK1xyXG4gICAgJ31cXG4nO1xyXG5cclxubW9kdWxlLmV4cG9ydHMucXVhdGVybmlvbk11bHRpcGxpY2F0aW9uVmVydGV4U2hhZGVyID0gXHJcbiAgICAncHJlY2lzaW9uIGxvd3AgZmxvYXQ7XFxuJyArXHJcbiAgICAncHJlY2lzaW9uIGxvd3Agc2FtcGxlcjJEO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ2F0dHJpYnV0ZSB2ZWMzIHZlcnRleFBvc2l0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICBnbF9Qb3NpdGlvbiA9IHZlYzQodmVydGV4UG9zaXRpb24sIDEuMCk7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5zY2VuZUZyYWdtZW50U2hhZGVyID0gXHJcbiAgICAncHJlY2lzaW9uIGxvd3AgZmxvYXQ7XFxuJyArXHJcbiAgICAncHJlY2lzaW9uIGxvd3Agc2FtcGxlcjJEO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZhcnlpbmcgdmVjMyBjYW1lcmFOb3JtYWw7XFxuJyArXHJcbiAgICAndmFyeWluZyB2ZWMzIGNhbWVyYUxpZ2h0RGlyZWN0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IG1hdGVyaWFsQ29sb3IgPSB2ZWM0KDEsIDEsIDEsIDEpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIG5vcm1hbCA9IG5vcm1hbGl6ZShjYW1lcmFOb3JtYWwpO1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIGxpZ2h0RGlyZWN0aW9uID0gbm9ybWFsaXplKGNhbWVyYUxpZ2h0RGlyZWN0aW9uKTtcXG4nICtcclxuICAgICcgICAgZmxvYXQgY29zVGhldGEgPSBjbGFtcChkb3Qobm9ybWFsLCBsaWdodERpcmVjdGlvbiksIDAuMCwgMS4wKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjMyBsaWdodEFtYmllbnRDb2xvciA9IHZlYzMoMC4zLCAwLjMsIDAuMyk7XFxuJyArXHJcbiAgICAnICAgIHZlYzMgbGlnaHREaWZmdXNlQ29sb3IgPSB2ZWMzKDEuMCwgMS4wLCAxLjApO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBnbF9GcmFnQ29sb3IgPVxcbicgK1xyXG4gICAgJyAgICAgICAgbWF0ZXJpYWxDb2xvciAqIHZlYzQobGlnaHRBbWJpZW50Q29sb3IsIDEpICtcXG4nICtcclxuICAgICcgICAgICAgIG1hdGVyaWFsQ29sb3IgKiB2ZWM0KGxpZ2h0RGlmZnVzZUNvbG9yLCAxKSAqIGNvc1RoZXRhO1xcbicgK1xyXG4gICAgJ31cXG4nO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuc2NlbmVWZXJ0ZXhTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbG93cCBmbG9hdDtcXG4nICtcclxuICAgICdwcmVjaXNpb24gbG93cCBzYW1wbGVyMkQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzMgdmVydGV4UG9zaXRpb247XFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzIgdGV4Q29vcmQ7XFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzMgdmVydGV4Tm9ybWFsO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJy8vIHBlciBpbnN0YW5jZSBhdHRyaWJ1dGVzXFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzIgaW5zdGFuY2VDb29yZDtcXG4nICtcclxuICAgICdhdHRyaWJ1dGUgdmVjMyByb290UG9zaXRpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmFyeWluZyB2ZWMzIGNhbWVyYU5vcm1hbDtcXG4nICtcclxuICAgICd2YXJ5aW5nIHZlYzMgY2FtZXJhTGlnaHREaXJlY3Rpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSBzYW1wbGVyMkQgcm90YXRpb25zO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIG9mZnNldHM7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSBtYXQ0IHByb2plY3Rpb247XFxuJyArXHJcbiAgICAndW5pZm9ybSBtYXQ0IHZpZXc7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSB2ZWMzIHNpemU7XFxuJyArXHJcbiAgICAndW5pZm9ybSB2ZWMzIG1pZGRsZVRyYW5zbGF0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzQgcXVhdF9tdWwodmVjNCBxMSwgdmVjNCBxMikge1xcbicgK1xyXG4gICAgJ1x0cmV0dXJuIHZlYzQoXFxuJyArXHJcbiAgICAnXHRcdHEyLnh5eiAqIHExLncgKyBxMS54eXogKiBxMi53ICsgY3Jvc3MocTEueHl6LCBxMi54eXopLFxcbicgK1xyXG4gICAgJ1x0XHRxMS53ICogcTIudyAtIGRvdChxMS54eXosIHEyLnh5eilcXG4nICtcclxuICAgICdcdCk7XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzMgcm90YXRlX3ZlY3Rvcih2ZWMzIHYsIHZlYzQgcikge1xcbicgK1xyXG4gICAgJ1x0dmVjNCByX2MgPSByICogdmVjNCgtMSwgLTEsIC0xLCAxKTtcXG4nICtcclxuICAgICdcdHJldHVybiBxdWF0X211bChyLCBxdWF0X211bCh2ZWM0KHYsIDApLCByX2MpKS54eXo7XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IHJvdGF0aW9uID0gdGV4dHVyZTJEKHJvdGF0aW9ucywgaW5zdGFuY2VDb29yZCk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzMgb2Zmc2V0ID0gdGV4dHVyZTJEKG9mZnNldHMsIGluc3RhbmNlQ29vcmQpLnh5ejtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjMyBwb3NpdGlvbiA9IHJvb3RQb3NpdGlvbiArIG9mZnNldDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjMyB3b3JsZFZlcnRleFBvc2l0aW9uID0gcm90YXRlX3ZlY3Rvcih2ZXJ0ZXhQb3NpdGlvbiAqIHNpemUgKyBtaWRkbGVUcmFuc2xhdGlvbiwgcm90YXRpb24pICsgcG9zaXRpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbiAqIHZpZXcgKiB2ZWM0KHdvcmxkVmVydGV4UG9zaXRpb24sIDEpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBjYW1lcmFMaWdodERpcmVjdGlvbiA9IC0odmlldyAqIHZlYzQod29ybGRWZXJ0ZXhQb3NpdGlvbiwgMSkpLnh5ejtcXG4nICtcclxuICAgICcgICAgY2FtZXJhTm9ybWFsID0gKHZpZXcgKiB2ZWM0KHJvdGF0ZV92ZWN0b3IodmVydGV4Tm9ybWFsLCByb3RhdGlvbiksIDApKS54eXo7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy50ZXh0dXJlT3V0cHV0RnJhZ21lbnRTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbG93cCBmbG9hdDtcXG4nICtcclxuICAgICdwcmVjaXNpb24gbG93cCBzYW1wbGVyMkQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSBzYW1wbGVyMkQgaW5wdXRUZXg7XFxuJyArXHJcbiAgICAndW5pZm9ybSBmbG9hdCBpbnZPdXRwdXRTaXplO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICB2ZWMyIGN1cnJlbnRQb3NpdGlvbiA9IHZlYzIoZ2xfRnJhZ0Nvb3JkLngsIGdsX0ZyYWdDb29yZC55KSAqIGludk91dHB1dFNpemU7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQodGV4dHVyZTJEKGlucHV0VGV4LCBjdXJyZW50UG9zaXRpb24pLnJnYiwgMSk7XFxuJyArXHJcbiAgICAnICAgIC8vIGdsX0ZyYWdDb2xvciA9IHZlYzQodGV4dHVyZTJEKGlucHV0VGV4LCBjdXJyZW50UG9zaXRpb24pLmEsIDAsIDAsIDEpOyAvLyByID0gYXBsaGFcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLnRleHR1cmVPdXRwdXRWZXJ0ZXhTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbG93cCBmbG9hdDtcXG4nICtcclxuICAgICdwcmVjaXNpb24gbG93cCBzYW1wbGVyMkQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnYXR0cmlidXRlIHZlYzMgdmVydGV4UG9zaXRpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh2ZXJ0ZXhQb3NpdGlvbiwgMS4wKTtcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbi8vIHNoYWRlcnMgZW5kXHJcbiJdfQ==
