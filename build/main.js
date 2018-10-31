(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
},{"./character.js":2,"./render.js":6,"./render_utils":7,"./resource_loader.js":8,"gl-matrix":4}],2:[function(require,module,exports){
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

    const CmToMeters = 0.01;

    const sizeInMeters = vec3.create();
    vec3.mul(sizeInMeters, arrayToVec3(size), vec3.fromValues(CmToMeters, CmToMeters, CmToMeters));

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

module.exports.Character = Character;
},{"gl-matrix":4}],3:[function(require,module,exports){
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

},{"./animation_manager":1,"./render.js":6,"./resource_loader.js":8}],4:[function(require,module,exports){
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
  -1.00, -1.00,  0.00,  0.00,  0.00,  0.00, 
   3.00, -1.00,  0.00,  0.00,  0.00,  0.00, 
  -1.00,  3.00,  0.00,  0.00,  0.00,  0.00, 
  -0.50,  0.50,  0.50,  0.00,  1.00,  0.00,
   0.50,  0.50, -0.50,  0.00,  1.00,  0.00,
  -0.50,  0.50, -0.50,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50,  1.00,  0.00,  0.00,
   0.50, -0.50, -0.50,  1.00,  0.00,  0.00,
   0.50,  0.50, -0.50,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50,  0.00, -1.00,  0.00,
  -0.50, -0.50, -0.50,  0.00, -1.00,  0.00,
   0.50, -0.50, -0.50,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50, -1.00,  0.00,  0.00,
  -0.50,  0.50, -0.50, -1.00,  0.00,  0.00,
  -0.50, -0.50, -0.50, -1.00,  0.00,  0.00,
   0.50, -0.50, -0.50,  0.00,  0.00, -1.00,
  -0.50,  0.50, -0.50,  0.00,  0.00, -1.00,
   0.50,  0.50, -0.50,  0.00,  0.00, -1.00,
   0.50,  0.50,  0.50,  0.00,  0.00,  1.00,
  -0.50, -0.50,  0.50,  0.00,  0.00,  1.00,
   0.50, -0.50,  0.50,  0.00,  0.00,  1.00,
  -0.50,  0.50,  0.50,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50,  0.00,  1.00,  0.00,
   0.50,  0.50, -0.50,  0.00,  1.00,  0.00,
   0.50,  0.50,  0.50,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50,  1.00,  0.00,  0.00,
   0.50, -0.50, -0.50,  1.00,  0.00,  0.00,
   0.50, -0.50,  0.50,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50,  0.00, -1.00,  0.00,
  -0.50, -0.50, -0.50,  0.00, -1.00,  0.00,
  -0.50, -0.50,  0.50, -1.00,  0.00,  0.00,
  -0.50,  0.50,  0.50, -1.00,  0.00,  0.00,
  -0.50,  0.50, -0.50, -1.00,  0.00,  0.00,
   0.50, -0.50, -0.50,  0.00,  0.00, -1.00,
  -0.50, -0.50, -0.50,  0.00,  0.00, -1.00,
  -0.50,  0.50, -0.50,  0.00,  0.00, -1.00,
   0.50,  0.50,  0.50,  0.00,  0.00,  1.00,
  -0.50,  0.50,  0.50,  0.00,  0.00,  1.00,
  -0.50, -0.50,  0.50,  0.00,  0.00,  1.00
]
},{}],6:[function(require,module,exports){
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
},{"./raw_data":5,"./shaders.js":9}],7:[function(require,module,exports){
const vec3 = require('gl-matrix').vec3;

function duplicatePixel(size, pixel) {

    const len = size * size * 4;
    const result = new Uint8Array(len);

    for (let i = 0; i < len; i++)
        result[i] = pixel[i % 4];

    return result;
}

function normalized_float_to_color(f) {
    return Math.round(f * 127) + 127;
}

function t_to_color(t) {
    return Math.round(t * 255.0);
}

function length_to_color(l) {
    return t_to_color(l / 2.0); // max len is 2.0
}

function quat_to_pixel(q) {

    const r = normalized_float_to_color(q[0]);
    const g = normalized_float_to_color(q[1]);
    const b = normalized_float_to_color(q[2]);
    const a = normalized_float_to_color(q[3]);

    return [r, g, b, a];
}

function vec_to_pixel(v) {

    const l = vec3.length(v);

    const r = normalized_float_to_color(l > 0 ? v[0] / l : 0);
    const g = normalized_float_to_color(l > 0 ? v[1] / l : 0);
    const b = normalized_float_to_color(l > 0 ? v[2] / l : 0);

    const a = length_to_color(l);

    return [r, g, b, a];
}

module.exports.duplicatePixel = duplicatePixel;
module.exports.quat_to_pixel = quat_to_pixel;
module.exports.vec_to_pixel = vec_to_pixel;
module.exports.t_to_color = t_to_color;
},{"gl-matrix":4}],8:[function(require,module,exports){
let state = 0;
let doneCallback;
let gl;

function initialize(_gl, callback) {

    gl = _gl;
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

function createTexture(size, nearest) {
    return createTextureWithData(size, nearest, null);
}

function createTextureWithData(size, nearest, pixels) {

    const tex = gl.createTexture();

    updateTexture(tex, size, pixels);

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

function updateTexture(tex, size, pixels) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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

let database, databaseMap;

function loadAllResources() {

    if (state !== 0)
        return;

    state = 2;

    database = loadTexture('/WebEngineTest/build/database.png', false);
    databaseMap = loadJson('/WebEngineTest/build/database_map.json');
}

function getDatabase() {
    return database;
}

function getDatabaseMap() {
    return databaseMap;
}

module.exports.initialize = initialize;
module.exports.createTexture = createTexture;
module.exports.createTextureWithData = createTextureWithData;
module.exports.updateTexture = updateTexture;
module.exports.getDatabase = getDatabase;
module.exports.getDatabaseMap = getDatabaseMap;
},{}],9:[function(require,module,exports){
// shaders start

module.exports.offsetRotatitionAndAdditionFragmentShader = 
    'precision mediump float;\n' +
    '\n' +
    'uniform sampler2D rotations;\n' +
    'uniform sampler2D parentOffsets;\n' +
    'uniform vec3 boneOffset;\n' +
    '\n' +
    'vec4 color_to_quat(vec4 color) {\n' +
    '    return color * (255.0 / 127.0) - 1.0;\n' +
    '}\n' +
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
    'vec3 color_to_offset(vec4 color) {\n' +
    '\n' +
    '    float len = color.w * 2.0;\n' +
    '\n' +
    '    return (color.xyz * (255.0 / 127.0) - 1.0) * len;\n' +
    '}\n' +
    '\n' +
    'vec4 offset_to_color(vec3 offset) {\n' +
    '\n' +
    '    float len = length(offset);\n' +
    '\n' +
    '    vec4 result;\n' +
    '    result.xyz = (offset / len + 1.0) * (127.0 / 255.0);\n' +
    '    result.w = len / 2.0;\n' +
    '\n' +
    '    return result;\n' +
    '}\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec2 currentPosition = vec2(gl_FragCoord.x, gl_FragCoord.y) / 64.0;\n' +
    '\n' +
    '    vec4 rotationQ = color_to_quat(texture2D(rotations, currentPosition));\n' +
    '\n' +
    '    vec3 rotated_offset = rotate_vector(boneOffset, rotationQ);\n' +
    '\n' +
    '    vec3 parent_offset = color_to_offset(texture2D(parentOffsets, currentPosition));\n' +
    '\n' +
    '    vec3 result = parent_offset + rotated_offset;\n' +
    '\n' +
    '    gl_FragData[0] = offset_to_color(result);\n' +
    '}\n';

module.exports.offsetRotatitionAndAdditionVertexShader = 
    'precision mediump float;\n' +
    '\n' +
    'attribute vec3 VertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(VertexPosition, 1.0);\n' +
    '}\n';

module.exports.quaternionMultiplicationFragmentShader = 
    'precision mediump float;\n' +
    '\n' +
    'uniform sampler2D database;\n' +
    'uniform sampler2D instances;\n' +
    'uniform sampler2D parentRotations;\n' +
    'uniform float boneId;\n' +
    '\n' +
    'vec4 color_to_quat(vec4 color) {\n' +
    '    return color * (255.0 / 127.0) - 1.0;\n' +
    '}\n' +
    '\n' +
    'vec4 quat_to_color(vec4 quat) {\n' +
    '    return (quat + 1.0) * (127.0 / 255.0);\n' +
    '}\n' +
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
    '    float stride = instanceInfo.w * (255.0 / 256.0) + (1.0 / 256.0);\n' +
    '\n' +
    '    float database_x =\n' +
    '        instanceInfo.x * (255.0 / 256.0) + (0.5 / 256.0) + // color to [0, 255] / 256 + center offset\n' +
    '        instanceInfo.z * (255.0 / 256.0 / 256.0) + // interpolation t\n' +
    '        stride * boneId;\n' +
    '    float database_y =\n' +
    '        instanceInfo.y * (255.0 / 256.0) + (0.5 / 256.0); // color to [0, 255] / 256 + center offset\n' +
    '\n' +
    '    vec2 databasePosition = vec2(database_x, database_y);\n' +
    '\n' +
    '    vec4 relativeRotationQ = color_to_quat(texture2D(database, databasePosition));\n' +
    '\n' +
    '    vec4 parentRotationQ = color_to_quat(texture2D(parentRotations, currentPosition));\n' +
    '\n' +
    '    vec4 output_quat = quat_mul(relativeRotationQ, parentRotationQ);\n' +
    '\n' +
    '    gl_FragData[0] = quat_to_color(output_quat);\n' +
    '}\n';

module.exports.quaternionMultiplicationVertexShader = 
    'precision mediump float;\n' +
    '\n' +
    'attribute vec3 VertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(VertexPosition, 1.0);\n' +
    '}\n';

module.exports.sceneFragmentShader = 
    'precision mediump float;\n' +
    '\n' +
    'varying vec3 CameraNormal;\n' +
    'varying vec3 CameraLightDirection;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec4 MaterialColor = vec4(1, 1, 1, 1);\n' +
    '\n' +
    '    vec3 Normal = normalize(CameraNormal);\n' +
    '    vec3 LightDirection = normalize(CameraLightDirection);\n' +
    '    float cosTheta = clamp(dot(Normal, LightDirection), 0.0, 1.0);\n' +
    '\n' +
    '    vec3 LightAmbientColor = vec3(0.3, 0.3, 0.3);\n' +
    '    vec3 LightDiffuseColor = vec3(1.0, 1.0, 1.0);\n' +
    '\n' +
    '    gl_FragColor =\n' +
    '        MaterialColor * vec4(LightAmbientColor, 1) +\n' +
    '        MaterialColor * vec4(LightDiffuseColor, 1) * cosTheta;\n' +
    '}\n';

module.exports.sceneVertexShader = 
    'precision mediump float;\n' +
    '\n' +
    'attribute vec3 VertexPosition;\n' +
    'attribute vec3 VertexNormal;\n' +
    'attribute vec2 InstanceCoord;\n' +
    '\n' +
    'varying vec3 CameraNormal;\n' +
    'varying vec3 CameraLightDirection;\n' +
    '\n' +
    'uniform sampler2D Rotations;\n' +
    'uniform sampler2D Offsets;\n' +
    '\n' +
    'uniform sampler2D PositionsX;\n' +
    'uniform sampler2D PositionsY;\n' +
    'uniform sampler2D PositionsZ;\n' +
    '\n' +
    'uniform mat4 Projection;\n' +
    'uniform mat4 View;\n' +
    '\n' +
    'uniform vec3 Size;\n' +
    'uniform vec3 MiddleTranslation;\n' +
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
    'vec4 color_to_quat(vec4 color) {\n' +
    '    return color * (255.0 / 127.0) - 1.0;\n' +
    '}\n' +
    '\n' +
    'vec3 color_to_offset(vec4 color) {\n' +
    '\n' +
    '    float len = color.w * 2.0;\n' +
    '\n' +
    '    return (color.xyz * (255.0 / 127.0) - 1.0) * len;\n' +
    '}\n' +
    '\n' +
    '#define precision 1000.0\n' +
    '\n' +
    'float color_to_float(vec4 color) {\n' +
    '\n' +
    '  return\n' +
    '    (\n' +
    '    color.r * (255.0 / precision) +\n' +
    '    color.g * (256.0 * 255.0 / precision) +\n' +
    '    color.b * (256.0 * 256.0 * 255.0 / precision)\n' +
    '    ) * (color.a * 2.0 - 1.0);\n' +
    '}\n' +
    '\n' +
    'vec3 get_position(vec2 coord) {\n' +
    '\n' +
    '    return vec3\n' +
    '    (\n' +
    '        color_to_float(texture2D(PositionsX, coord)),\n' +
    '        color_to_float(texture2D(PositionsY, coord)),\n' +
    '        color_to_float(texture2D(PositionsZ, coord))\n' +
    '    );\n' +
    '}\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec4 Rotation = color_to_quat(texture2D(Rotations, InstanceCoord));\n' +
    '\n' +
    '    vec3 RootPosition = get_position(InstanceCoord);\n' +
    '    vec3 Offset = color_to_offset(texture2D(Offsets, InstanceCoord));\n' +
    '\n' +
    '    vec3 Position = RootPosition + Offset;\n' +
    '\n' +
    '    vec3 WorldVertexPosition = rotate_vector(VertexPosition * Size + MiddleTranslation, Rotation) + Position;\n' +
    '\n' +
    '    gl_Position = Projection * View * vec4(WorldVertexPosition, 1);\n' +
    '\n' +
    '    CameraLightDirection = -(View * vec4(WorldVertexPosition, 1)).xyz;\n' +
    '    CameraNormal = (View * vec4(rotate_vector(VertexNormal, Rotation), 0)).xyz;\n' +
    '}\n';

module.exports.textureOutputFragmentShader = 
    'precision mediump float;\n' +
    '\n' +
    'uniform sampler2D inputTex;\n' +
    'uniform float invOutputSize;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    vec2 currentPosition = vec2(gl_FragCoord.x, gl_FragCoord.y) * invOutputSize;\n' +
    '\n' +
    '    // gl_FragColor = vec4(texture2D(inputTex, currentPosition).a, 0, 0, 1); // r = aplha\n' +
    '    gl_FragColor = vec4(texture2D(inputTex, currentPosition).rgb, 1);\n' +
    '}\n';

module.exports.textureOutputVertexShader = 
    'precision mediump float;\n' +
    '\n' +
    'attribute vec3 VertexPosition;\n' +
    '\n' +
    'void main()\n' +
    '{\n' +
    '    gl_Position = vec4(VertexPosition, 1.0);\n' +
    '}\n';

// shaders end

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6L1VzZXJzL2dhbG92L0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImFuaW1hdGlvbl9tYW5hZ2VyLmpzIiwiY2hhcmFjdGVyLmpzIiwibWFpbi5qcyIsIm5vZGVfbW9kdWxlcy9nbC1tYXRyaXgvZGlzdC9nbC1tYXRyaXguanMiLCJyYXdfZGF0YS5qcyIsInJlbmRlci5qcyIsInJlbmRlcl91dGlscy5qcyIsInJlc291cmNlX2xvYWRlci5qcyIsInNoYWRlcnMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3VkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJjb25zdCBSZW5kZXIgPSByZXF1aXJlKFwiLi9yZW5kZXIuanNcIik7XHJcbmNvbnN0IFJlbmRlclV0aWxzID0gcmVxdWlyZShcIi4vcmVuZGVyX3V0aWxzXCIpO1xyXG5jb25zdCBSZXNvdXJjZUxvYWRlciA9IHJlcXVpcmUoXCIuL3Jlc291cmNlX2xvYWRlci5qc1wiKTtcclxuY29uc3QgQ2hhcmFjdGVyID0gcmVxdWlyZShcIi4vY2hhcmFjdGVyLmpzXCIpLkNoYXJhY3RlcjtcclxuXHJcbmNvbnN0IHZlYzMgPSByZXF1aXJlKCdnbC1tYXRyaXgnKS52ZWMzO1xyXG5jb25zdCBxdWF0ID0gcmVxdWlyZSgnZ2wtbWF0cml4JykucXVhdDtcclxuY29uc3QgbWF0NCA9IHJlcXVpcmUoJ2dsLW1hdHJpeCcpLm1hdDQ7XHJcbmNvbnN0IGdsTWF0cml4ID0gcmVxdWlyZSgnZ2wtbWF0cml4JykuZ2xNYXRyaXg7XHJcblxyXG5jb25zdCBkYXRhYmFzZVRleFNpemUgPSAyNTY7XHJcbmxldCBkYXRhYmFzZTtcclxubGV0IGFuaW1hdGlvbnM7XHJcblxyXG5sZXQgY2hhcjtcclxubGV0IHBhcmVudFJvdGF0aW9ucywgcGFyZW50T2Zmc2V0cztcclxuXHJcbmxldCBpbnN0YW5jZXNNYXBQaXhlbHMsIGluc3RhbmNlc01hcDtcclxuXHJcbmxldCBpbnN0YW5jZXM7XHJcblxyXG5jb25zdCBpbnN0YW5jZXNUZXhTaXplID0gNjQ7XHJcblxyXG5sZXQgUHJvamVjdGlvbiwgVmlldztcclxuXHJcbmxldCBQb3NpdGlvbnNYLCBQb3NpdGlvbnNZLCBQb3NpdGlvbnNaO1xyXG5sZXQgUG9zaXRpb25zWFBpeGVscywgUG9zaXRpb25zWVBpeGVscywgUG9zaXRpb25zWlBpeGVscztcclxuXHJcbmZ1bmN0aW9uIGluaXRpYWxpemUoKSB7XHJcblxyXG4gICAgbG9hZEFuaW1hdGlvbnMoKTtcclxuXHJcbiAgICBzZXR1cENoYXJhY3RlclRlbXBsYXRlKCk7XHJcblxyXG4gICAgY3JlYXRlQW5pbWF0aW9uVGV4dHVyZXMoKTtcclxuXHJcbiAgICBpbnN0YW5jZXMgPSBbXTtcclxuXHJcbiAgICBzZXR1cFNjZW5lKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU2NlbmUoKSB7XHJcblxyXG4gICAgUHJvamVjdGlvbiA9ICBtYXQ0LmNyZWF0ZSgpO1xyXG4gICAgbWF0NC5wZXJzcGVjdGl2ZShQcm9qZWN0aW9uLCBnbE1hdHJpeC50b1JhZGlhbig2MCksIFJlbmRlci5nZXRBc3BlY3RSYXRpbygpLCAwLjEsIDEwMDAuMCk7XHJcblxyXG4gICAgVmlldyA9ICBtYXQ0LmNyZWF0ZSgpO1xyXG4gICAgbWF0NC5sb29rQXQoVmlldywgWzIsIC0yLjU3LCA3LjQyXSwgWzAsIC0wLjUsIDUuNV0sIFswLCAwLCAxXSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvYWRBbmltYXRpb25zKCkge1xyXG5cclxuICAgIGRhdGFiYXNlID0gUmVzb3VyY2VMb2FkZXIuZ2V0RGF0YWJhc2UoKTtcclxuICAgIGNvbnN0IGFuaW1hdGlvbnNBcnJheSA9IFJlc291cmNlTG9hZGVyLmdldERhdGFiYXNlTWFwKCkuY29udGVudC5hbmltYXRpb25zO1xyXG5cclxuICAgIGFuaW1hdGlvbnMgPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgYW5pbWF0aW9uc0FycmF5LmZvckVhY2goZnVuY3Rpb24gKGFuaW1hdGlvbikge1xyXG5cclxuICAgICAgICBsZXQgc3RyaWRlID0gYW5pbWF0aW9uLmtleWZyYW1lcy5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHN0cmlkZSA+IDEpXHJcbiAgICAgICAgICAgIHN0cmlkZSsrO1xyXG5cclxuICAgICAgICBhbmltYXRpb24uc3RyaWRlID0gc3RyaWRlO1xyXG5cclxuICAgICAgICBhbmltYXRpb25zLnNldChhbmltYXRpb24ubmFtZSwgYW5pbWF0aW9uKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cENoYXJhY3RlclRlbXBsYXRlKCkge1xyXG5cclxuICAgIGNoYXIgPSBuZXcgQ2hhcmFjdGVyKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUFuaW1hdGlvblRleHR1cmVzKCkge1xyXG5cclxuICAgIGNvbnN0IHF1YXRJZGVudGl0eSA9IHF1YXQuZnJvbVZhbHVlcygwLCAwLCAwLCAxKTtcclxuICAgIGNvbnN0IHZlY0lkZW50aXR5ID0gdmVjMy5mcm9tVmFsdWVzKDAsIDAsIDApO1xyXG5cclxuICAgIGNvbnN0IHF1YXRJZGVudGl0eVBpeGVsID0gUmVuZGVyVXRpbHMucXVhdF90b19waXhlbChxdWF0SWRlbnRpdHkpO1xyXG4gICAgY29uc3QgdmVjSWRlbnRpdHlQaXhlbCA9IFJlbmRlclV0aWxzLnZlY190b19waXhlbCh2ZWNJZGVudGl0eSk7XHJcblxyXG4gICAgcGFyZW50Um90YXRpb25zID0gW107XHJcbiAgICBwYXJlbnRPZmZzZXRzID0gW107XHJcblxyXG4gICAgZm9yIChsZXQgYm9uZUlkID0gLTE7IGJvbmVJZCA8IGNoYXIuYm9uZXMuc2l6ZTsgYm9uZUlkKyspIHtcclxuICAgICAgICBwYXJlbnRSb3RhdGlvbnNbMSArIGJvbmVJZF0gPSBSZXNvdXJjZUxvYWRlci5jcmVhdGVUZXh0dXJlV2l0aERhdGEoaW5zdGFuY2VzVGV4U2l6ZSwgdHJ1ZSxcclxuICAgICAgICAgICAgUmVuZGVyVXRpbHMuZHVwbGljYXRlUGl4ZWwoaW5zdGFuY2VzVGV4U2l6ZSwgcXVhdElkZW50aXR5UGl4ZWwpKTtcclxuICAgICAgICBwYXJlbnRPZmZzZXRzWzEgKyBib25lSWRdID0gUmVzb3VyY2VMb2FkZXIuY3JlYXRlVGV4dHVyZVdpdGhEYXRhKGluc3RhbmNlc1RleFNpemUsIHRydWUsXHJcbiAgICAgICAgICAgIFJlbmRlclV0aWxzLmR1cGxpY2F0ZVBpeGVsKGluc3RhbmNlc1RleFNpemUsIHZlY0lkZW50aXR5UGl4ZWwpKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnN0YW5jZXNNYXAgPSBSZXNvdXJjZUxvYWRlci5jcmVhdGVUZXh0dXJlKGluc3RhbmNlc1RleFNpemUsIHRydWUpO1xyXG4gICAgaW5zdGFuY2VzTWFwUGl4ZWxzID0gbmV3IFVpbnQ4QXJyYXkoaW5zdGFuY2VzVGV4U2l6ZSAqIGluc3RhbmNlc1RleFNpemUgKiA0KTtcclxuXHJcbiAgICBQb3NpdGlvbnNYID0gUmVzb3VyY2VMb2FkZXIuY3JlYXRlVGV4dHVyZShpbnN0YW5jZXNUZXhTaXplLCB0cnVlKTtcclxuICAgIFBvc2l0aW9uc1kgPSBSZXNvdXJjZUxvYWRlci5jcmVhdGVUZXh0dXJlKGluc3RhbmNlc1RleFNpemUsIHRydWUpO1xyXG4gICAgUG9zaXRpb25zWiA9IFJlc291cmNlTG9hZGVyLmNyZWF0ZVRleHR1cmUoaW5zdGFuY2VzVGV4U2l6ZSwgdHJ1ZSk7XHJcblxyXG4gICAgUG9zaXRpb25zWFBpeGVscyA9IG5ldyBVaW50OEFycmF5KGluc3RhbmNlc1RleFNpemUgKiBpbnN0YW5jZXNUZXhTaXplICogNCk7XHJcbiAgICBQb3NpdGlvbnNZUGl4ZWxzID0gbmV3IFVpbnQ4QXJyYXkoaW5zdGFuY2VzVGV4U2l6ZSAqIGluc3RhbmNlc1RleFNpemUgKiA0KTtcclxuICAgIFBvc2l0aW9uc1pQaXhlbHMgPSBuZXcgVWludDhBcnJheShpbnN0YW5jZXNUZXhTaXplICogaW5zdGFuY2VzVGV4U2l6ZSAqIDQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZVJHQkEoZGVzdCwgaW5kZXgsIHIsIGcsIGIsIGEpIHtcclxuXHJcbiAgICBkZXN0W2luZGV4ICAgIF0gPSByO1xyXG4gICAgZGVzdFtpbmRleCArIDFdID0gZztcclxuICAgIGRlc3RbaW5kZXggKyAyXSA9IGI7XHJcbiAgICBkZXN0W2luZGV4ICsgM10gPSBhO1xyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZUZsb2F0KGRlc3QsIGluZGV4LCBmKSB7XHJcblxyXG4gICAgbGV0IFZhbHVlID0gTWF0aC5yb3VuZChmICogMTAwMC4wKTtcclxuXHJcbiAgICBjb25zdCBhID0gVmFsdWUgPCAwID8gIDAgOiAweEZGO1xyXG5cclxuICAgIFZhbHVlID0gTWF0aC5hYnMoVmFsdWUpO1xyXG5cclxuICAgIGNvbnN0IHIgPSAoVmFsdWUgPj4gIDApICYgMHhGRjtcclxuICAgIGNvbnN0IGcgPSAoVmFsdWUgPj4gIDgpICYgMHhGRjtcclxuICAgIGNvbnN0IGIgPSAoVmFsdWUgPj4gMTYpICYgMHhGRjtcclxuXHJcbiAgICB3cml0ZVJHQkEoZGVzdCwgaW5kZXgsIHIsIGcsIGIsIGEpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaWxsSW5zdGFuY2VzTWFwKCkge1xyXG5cclxuICAgIGxldCBpbmRleCA9IDA7XHJcblxyXG4gICAgaW5zdGFuY2VzLmZvckVhY2goZnVuY3Rpb24gKGluc3RhbmNlKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGFuaW1hdGlvbiA9IGluc3RhbmNlLmFuaW1hdGlvbjtcclxuXHJcbiAgICAgICAgY29uc3Qgc3RhcnRfcGl4ZWwgPSBhbmltYXRpb24ucGl4ZWxfc3RhcnQ7XHJcblxyXG4gICAgICAgIGNvbnN0IHggPSBzdGFydF9waXhlbCAlIGRhdGFiYXNlVGV4U2l6ZSArIGluc3RhbmNlLnN0YXRlOyAvLyB4ID0gMC4uMjU1XHJcbiAgICAgICAgY29uc3QgeSA9IE1hdGguZmxvb3Ioc3RhcnRfcGl4ZWwgLyBkYXRhYmFzZVRleFNpemUpOyAvLyAwLi4yNTUgKHNob3VsZCBiZSlcclxuICAgICAgICBjb25zdCB6ID0gUmVuZGVyVXRpbHMudF90b19jb2xvcihNYXRoLm1pbihpbnN0YW5jZS50ICogKDI1Ni4wIC8gMjU1LjApLCAxKSk7XHJcbiAgICAgICAgY29uc3QgdyA9IGFuaW1hdGlvbi5zdHJpZGUgLSAxO1xyXG5cclxuICAgICAgICB3cml0ZVJHQkEoaW5zdGFuY2VzTWFwUGl4ZWxzLCBpbmRleCwgeCwgeSwgeiwgdyk7XHJcbiAgICAgICAgd3JpdGVGbG9hdChQb3NpdGlvbnNYUGl4ZWxzLCBpbmRleCwgaW5zdGFuY2UucG9zWzBdKTtcclxuICAgICAgICB3cml0ZUZsb2F0KFBvc2l0aW9uc1lQaXhlbHMsIGluZGV4LCBpbnN0YW5jZS5wb3NbMV0pO1xyXG4gICAgICAgIHdyaXRlRmxvYXQoUG9zaXRpb25zWlBpeGVscywgaW5kZXgsIGluc3RhbmNlLnBvc1syXSk7XHJcblxyXG4gICAgICAgIGluZGV4ICs9IDQ7XHJcbiAgICB9KTtcclxuXHJcbiAgICBSZXNvdXJjZUxvYWRlci51cGRhdGVUZXh0dXJlKGluc3RhbmNlc01hcCwgaW5zdGFuY2VzVGV4U2l6ZSwgaW5zdGFuY2VzTWFwUGl4ZWxzKTtcclxuXHJcbiAgICBSZXNvdXJjZUxvYWRlci51cGRhdGVUZXh0dXJlKFBvc2l0aW9uc1gsIGluc3RhbmNlc1RleFNpemUsIFBvc2l0aW9uc1hQaXhlbHMpO1xyXG4gICAgUmVzb3VyY2VMb2FkZXIudXBkYXRlVGV4dHVyZShQb3NpdGlvbnNZLCBpbnN0YW5jZXNUZXhTaXplLCBQb3NpdGlvbnNZUGl4ZWxzKTtcclxuICAgIFJlc291cmNlTG9hZGVyLnVwZGF0ZVRleHR1cmUoUG9zaXRpb25zWiwgaW5zdGFuY2VzVGV4U2l6ZSwgUG9zaXRpb25zWlBpeGVscyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkdmFuY2UoZHQpIHtcclxuXHJcbiAgICBpbnN0YW5jZXMuZm9yRWFjaChmdW5jdGlvbiAoaW5zdGFuY2UpIHtcclxuXHJcbiAgICAgICAgaW5zdGFuY2Uuc3RhdGUgPSAxO1xyXG5cclxuICAgICAgICBpbnN0YW5jZS50ICs9IGR0O1xyXG4gICAgICAgIGluc3RhbmNlLnQgPSBpbnN0YW5jZS50ICUgMS4wO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZVF1YXQoYm9uZSkge1xyXG5cclxuICAgIGNvbnN0IHBhcmVudCA9IHBhcmVudFJvdGF0aW9uc1sxICsgYm9uZS5wYXJlbnRJZF07XHJcbiAgICBjb25zdCBvdXRwdXQgPSBwYXJlbnRSb3RhdGlvbnNbMSArIGJvbmUuaWRdO1xyXG5cclxuICAgIFJlbmRlci5jb21wdXRlUXVhdHMoYm9uZS5pZCwgZGF0YWJhc2UsIGluc3RhbmNlc01hcCwgcGFyZW50LCBvdXRwdXQpO1xyXG5cclxuICAgIGJvbmUuY2hpbGRzLmZvckVhY2goZnVuY3Rpb24gKGNoaWxkKSB7XHJcbiAgICAgICAgY2FsY3VsYXRlUXVhdChjaGlsZCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlT2Zmc2V0KGJvbmUpIHtcclxuXHJcbiAgICBjb25zdCByb3RhdGlvbiA9IHBhcmVudFJvdGF0aW9uc1sxICsgYm9uZS5wYXJlbnRJZF07XHJcbiAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRPZmZzZXRzWzEgKyBib25lLnBhcmVudElkXTtcclxuICAgIGNvbnN0IG91dHB1dCA9IHBhcmVudE9mZnNldHNbMSArIGJvbmUuaWRdO1xyXG5cclxuICAgIFJlbmRlci5jb21wdXRlT2Zmc2V0cyhib25lLmJvbmVPZmZzZXQsIHJvdGF0aW9uLCBwYXJlbnQsIG91dHB1dCk7XHJcblxyXG4gICAgYm9uZS5jaGlsZHMuZm9yRWFjaChmdW5jdGlvbiAoY2hpbGQpIHtcclxuICAgICAgICBjYWxjdWxhdGVPZmZzZXQoY2hpbGQpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJbnN0YW5jZXMoYm9uZSkge1xyXG5cclxuICAgIGNvbnN0IG9mZnNldHMgPSBwYXJlbnRPZmZzZXRzWzEgKyBib25lLmlkXTtcclxuICAgIGNvbnN0IHJvdGF0aW9ucyA9IHBhcmVudFJvdGF0aW9uc1sxICsgYm9uZS5pZF07XHJcblxyXG4gICAgUmVuZGVyLmRyYXdJbnN0YW5jZXMocm90YXRpb25zLCBvZmZzZXRzLCBib25lLnNpemUsIGJvbmUubWlkZGxlVHJhbnNsYXRpb24sIGluc3RhbmNlcy5sZW5ndGgpO1xyXG5cclxuICAgIGJvbmUuY2hpbGRzLmZvckVhY2goZnVuY3Rpb24gKGNoaWxkKSB7XHJcbiAgICAgICAgZHJhd0luc3RhbmNlcyhjaGlsZCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0FuaW1hdGlvbnMoKSB7XHJcblxyXG4gICAgZmlsbEluc3RhbmNlc01hcCgpO1xyXG5cclxuICAgIGNhbGN1bGF0ZVF1YXQoY2hhci5wZWx2aXMpO1xyXG4gICAgY2FsY3VsYXRlT2Zmc2V0KGNoYXIucGVsdmlzKTtcclxuXHJcbiAgICBSZW5kZXIuc2V0dXBTY2VuZShQcm9qZWN0aW9uLCBWaWV3KTtcclxuXHJcbiAgICBSZW5kZXIuc2V0dXBQb3NpdGlvbnMoUG9zaXRpb25zWCwgUG9zaXRpb25zWSwgUG9zaXRpb25zWik7XHJcblxyXG4gICAgZHJhd0luc3RhbmNlcyhjaGFyLnBlbHZpcyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpbmRBbmltYXRpb25CeU5hbWUobmFtZSkge1xyXG5cclxuICAgIGNvbnN0IGFuaW1hdGlvbiA9IGFuaW1hdGlvbnMuZ2V0KG5hbWUpO1xyXG5cclxuICAgIGlmIChhbmltYXRpb24gIT09IHVuZGVmaW5lZClcclxuICAgICAgICByZXR1cm4gYW5pbWF0aW9uO1xyXG4gICAgZWxzZVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVBbmltYXRpb25JbnN0YW5jZSh4LCB5LCB6KSB7XHJcblxyXG4gICAgY29uc3QgaW5zdGFuY2UgPSBuZXcgQW5pbWF0aW9uSW5zdGFuY2UoeCwgeSwgeik7XHJcblxyXG4gICAgaW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xyXG5cclxuICAgIHJldHVybiBpbnN0YW5jZTtcclxufVxyXG5cclxuZnVuY3Rpb24gQW5pbWF0aW9uSW5zdGFuY2UoeCwgeSwgeikge1xyXG4gICAgdGhpcy5hbmltYXRpb24gPSBudWxsO1xyXG4gICAgdGhpcy50ID0gMC4wO1xyXG4gICAgdGhpcy5zdGF0ZSA9IDA7XHJcbiAgICB0aGlzLnBvcyA9IHZlYzMuZnJvbVZhbHVlcyh4LCB5LCB6KTtcclxufVxyXG5cclxuQW5pbWF0aW9uSW5zdGFuY2UucHJvdG90eXBlLnNldEFuaW1hdGlvbiA9IGZ1bmN0aW9uIChuYW1lKSB7XHJcblxyXG4gICAgdGhpcy5hbmltYXRpb24gPSBmaW5kQW5pbWF0aW9uQnlOYW1lKG5hbWUpO1xyXG4gICAgdGhpcy50ID0gMC4wO1xyXG4gICAgdGhpcy5zdGF0ZSA9IDA7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5pbml0aWFsaXplID0gaW5pdGlhbGl6ZTtcclxubW9kdWxlLmV4cG9ydHMuY3JlYXRlQW5pbWF0aW9uSW5zdGFuY2UgPSBjcmVhdGVBbmltYXRpb25JbnN0YW5jZTtcclxubW9kdWxlLmV4cG9ydHMuYWR2YW5jZSA9IGFkdmFuY2U7XHJcbm1vZHVsZS5leHBvcnRzLmRyYXdBbmltYXRpb25zID0gZHJhd0FuaW1hdGlvbnM7IiwiY29uc3QgdmVjMyA9IHJlcXVpcmUoJ2dsLW1hdHJpeCcpLnZlYzM7XHJcblxyXG5mdW5jdGlvbiBCb25lKGlkLCBuYW1lLCBvZmZzZXQsIHRhaWwsIHNpemUsIHBhcmVudCkge1xyXG5cclxuICAgIHRoaXMuaWQgPSBpZDtcclxuICAgIHRoaXMubmFtZSA9IG5hbWU7XHJcblxyXG4gICAgdGhpcy5vZmZzZXQgPSBvZmZzZXQ7XHJcbiAgICB0aGlzLnRhaWwgPSB0YWlsO1xyXG4gICAgdGhpcy5zaXplID0gc2l6ZTtcclxuXHJcbiAgICB0aGlzLmNoaWxkcyA9IFtdO1xyXG5cclxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xyXG4gICAgaWYgKHRoaXMucGFyZW50ICE9PSBudWxsKVxyXG4gICAgICAgIHRoaXMucGFyZW50LmNoaWxkcy5wdXNoKHRoaXMpO1xyXG5cclxuICAgIHRoaXMuYm9uZU9mZnNldCA9IG51bGw7XHJcbiAgICB0aGlzLm1pZGRsZVRyYW5zbGF0aW9uID0gbnVsbDtcclxuICAgIHRoaXMucGFyZW50SWQgPSAtMTtcclxuXHJcbiAgICB0aGlzLmNhbGN1bGF0ZUluZGlyZWN0VmFsdWVzKCk7XHJcbn1cclxuXHJcbkJvbmUucHJvdG90eXBlLmNhbGN1bGF0ZUluZGlyZWN0VmFsdWVzID0gZnVuY3Rpb24gKCkge1xyXG5cclxuICAgIGxldCBvZmZzZXQ7XHJcbiAgICBpZiAodGhpcy5wYXJlbnQgIT09IG51bGwpIHtcclxuXHJcbiAgICAgICAgb2Zmc2V0ID0gdmVjMy5jcmVhdGUoKTtcclxuICAgICAgICB2ZWMzLm11bChvZmZzZXQsIHRoaXMub2Zmc2V0LCB0aGlzLnBhcmVudC5zaXplKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgICAgICBvZmZzZXQgPSB2ZWMzLmZyb21WYWx1ZXMoMCwgMCwgMCk7XHJcblxyXG4gICAgdGhpcy5ib25lT2Zmc2V0ID0gb2Zmc2V0O1xyXG5cclxuICAgIGNvbnN0IGhhbGYgPSB2ZWMzLmZyb21WYWx1ZXMoMC41LCAwLjUsIDAuNSk7XHJcbiAgICBjb25zdCBtaWRkbGVUcmFuc2xhdGlvbiA9IHZlYzMuY3JlYXRlKCk7XHJcbiAgICB2ZWMzLm11bChtaWRkbGVUcmFuc2xhdGlvbiwgdGhpcy50YWlsLCB0aGlzLnNpemUpO1xyXG4gICAgdmVjMy5tdWwobWlkZGxlVHJhbnNsYXRpb24sIG1pZGRsZVRyYW5zbGF0aW9uLCBoYWxmKTtcclxuXHJcbiAgICB0aGlzLm1pZGRsZVRyYW5zbGF0aW9uID0gbWlkZGxlVHJhbnNsYXRpb247XHJcblxyXG4gICAgaWYgKHRoaXMucGFyZW50ICE9PSBudWxsKVxyXG4gICAgICAgIHRoaXMucGFyZW50SWQgPSB0aGlzLnBhcmVudC5pZDtcclxuICAgIGVsc2VcclxuICAgICAgICB0aGlzLnBhcmVudElkID0gLTE7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBDaGFyYWN0ZXIoKSB7XHJcblxyXG4gICAgdGhpcy5uZXh0Qm9uZUlEID0gMDtcclxuICAgIHRoaXMuYm9uZXMgPSBuZXcgTWFwKCk7XHJcbiAgICB0aGlzLnBlbHZpcyA9IG51bGw7XHJcblxyXG4gICAgdGhpcy5nZW5lcmF0ZUJvbmVzKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFycmF5VG9WZWMzKGEpIHtcclxuICAgIHJldHVybiB2ZWMzLmZyb21WYWx1ZXMoYVswXSwgYVsxXSwgYVsyXSk7XHJcbn1cclxuXHJcbkNoYXJhY3Rlci5wcm90b3R5cGUuZ2VuZXJhdGVCb25lID0gZnVuY3Rpb24gKHBhcmVudCwgdGFpbCwgc2l6ZSwgb2Zmc2V0LCBuYW1lKSB7XHJcblxyXG4gICAgY29uc3QgQ21Ub01ldGVycyA9IDAuMDE7XHJcblxyXG4gICAgY29uc3Qgc2l6ZUluTWV0ZXJzID0gdmVjMy5jcmVhdGUoKTtcclxuICAgIHZlYzMubXVsKHNpemVJbk1ldGVycywgYXJyYXlUb1ZlYzMoc2l6ZSksIHZlYzMuZnJvbVZhbHVlcyhDbVRvTWV0ZXJzLCBDbVRvTWV0ZXJzLCBDbVRvTWV0ZXJzKSk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gbmV3IEJvbmUodGhpcy5uZXh0Qm9uZUlEKyssIG5hbWUsIGFycmF5VG9WZWMzKG9mZnNldCksIGFycmF5VG9WZWMzKHRhaWwpLCBzaXplSW5NZXRlcnMsIHBhcmVudCk7XHJcblxyXG4gICAgdGhpcy5ib25lcy5zZXQocmVzdWx0Lm5hbWUsIHJlc3VsdCk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufTtcclxuXHJcbkNoYXJhY3Rlci5wcm90b3R5cGUuZ2VuZXJhdGVSaWdodFNpZGUgPSBmdW5jdGlvbiAobGVmdEJvbmUsIHJpZ2h0UGFyZW50KSB7XHJcblxyXG4gICAgY29uc3QgbWlycm9yVmVjdG9yID0gdmVjMy5mcm9tVmFsdWVzKDEsIC0xLCAxKTtcclxuXHJcbiAgICBjb25zdCBvcmlnaW5hbE5hbWUgPSBsZWZ0Qm9uZS5uYW1lO1xyXG4gICAgdGhpcy5ib25lcy5kZWxldGUob3JpZ2luYWxOYW1lKTtcclxuXHJcbiAgICBsZWZ0Qm9uZS5uYW1lID0gXCJMZWZ0IFwiICsgb3JpZ2luYWxOYW1lO1xyXG5cclxuICAgIGNvbnN0IHJpZ2h0T2Zmc2V0ID0gdmVjMy5jcmVhdGUoKTtcclxuICAgIHZlYzMubXVsKHJpZ2h0T2Zmc2V0LCBsZWZ0Qm9uZS5vZmZzZXQsIG1pcnJvclZlY3Rvcik7XHJcblxyXG4gICAgY29uc3QgcmlnaHRUYWlsID0gdmVjMy5jcmVhdGUoKTtcclxuICAgIHZlYzMubXVsKHJpZ2h0VGFpbCwgbGVmdEJvbmUudGFpbCwgbWlycm9yVmVjdG9yKTtcclxuXHJcbiAgICBjb25zdCByaWdodEJvbmUgPSBuZXcgQm9uZSh0aGlzLm5leHRCb25lSUQrKywgXCJSaWdodCBcIiArIG9yaWdpbmFsTmFtZSwgcmlnaHRPZmZzZXQsIHJpZ2h0VGFpbCxcclxuICAgICAgICBsZWZ0Qm9uZS5zaXplLCByaWdodFBhcmVudCk7XHJcblxyXG4gICAgdGhpcy5ib25lcy5zZXQobGVmdEJvbmUubmFtZSwgbGVmdEJvbmUpO1xyXG4gICAgdGhpcy5ib25lcy5zZXQocmlnaHRCb25lLm5hbWUsIHJpZ2h0Qm9uZSk7XHJcblxyXG4gICAgbGVmdEJvbmUuY2hpbGRzLmZvckVhY2goZnVuY3Rpb24obGVmdENoaWxkKSB7XHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZVJpZ2h0U2lkZShsZWZ0Q2hpbGQsIHJpZ2h0Qm9uZSk7XHJcbiAgICB9LCB0aGlzKTtcclxufTtcclxuXHJcbkNoYXJhY3Rlci5wcm90b3R5cGUuZ2VuZXJhdGVCb25lcyA9IGZ1bmN0aW9uICgpIHtcclxuXHJcbiAgICB0aGlzLnBlbHZpcyA9IHRoaXMuZ2VuZXJhdGVCb25lKG51bGwsIFsgMCwgMCwgMSBdLCBbIDYuNSwgMTMuMCwgMTcuNiBdLCBbIDAsIDAsIDAgXSwgXCJQZWx2aXNcIik7XHJcbiAgICBjb25zdCBzdG9tYWNoID0gdGhpcy5nZW5lcmF0ZUJvbmUodGhpcy5wZWx2aXMsIFsgMCwgMCwgMSBdLCBbIDYuNSwgMTMsIDE3LjYgXSwgWyAwLCAwLCAxIF0sIFwiU3RvbWFjaFwiKTtcclxuICAgIGNvbnN0IGNoZXN0ID0gdGhpcy5nZW5lcmF0ZUJvbmUoc3RvbWFjaCwgWyAwLCAwLCAxIF0sIFsgNi41LCAxMywgMTcuNiBdLCBbIDAsIDAsIDEgXSwgXCJDaGVzdFwiKTtcclxuXHJcbiAgICBjb25zdCBuZWNrID0gdGhpcy5nZW5lcmF0ZUJvbmUoY2hlc3QsIFsgMCwgMCwgMSBdLCBbIDMsIDMsIDE1IF0sIFsgMCwgMCwgMSBdLCBcIk5lY2tcIik7XHJcbiAgICBjb25zdCBoZWFkID0gdGhpcy5nZW5lcmF0ZUJvbmUobmVjaywgWyAwLCAwLCAwIF0sIFsgMTUsIDE1LCAyMCBdLCBbIDAsIDAsIDEgXSwgXCJIZWFkXCIpO1xyXG5cclxuICAgIGNvbnN0IHVwcGVyTGVnID0gdGhpcy5nZW5lcmF0ZUJvbmUodGhpcy5wZWx2aXMsIFsgMCwgMCwgLTEgXSwgWyA2LjUsIDYuNSwgNDYgXSwgWyAwLCAwLjUsIDAgXSwgXCJVcHBlciBMZWdcIik7XHJcbiAgICBjb25zdCBsb3dlckxlZyA9IHRoaXMuZ2VuZXJhdGVCb25lKHVwcGVyTGVnLCBbIDAsIDAsIC0xIF0sIFsgNi40OSwgNi40OSwgNDUgXSwgWyAwLCAwLCAtMSBdLCBcIkxvd2VyIExlZ1wiKTtcclxuICAgIGNvbnN0IGZvb3QgPSB0aGlzLmdlbmVyYXRlQm9uZShsb3dlckxlZywgWyAxNS41IC8gMjIsIDAsIDAgXSwgWyAyMiwgOCwgMyBdLCBbIDAsIDAsIC0xLjE3NSBdLCBcIkZvb3RcIik7XHJcblxyXG4gICAgdGhpcy5nZW5lcmF0ZVJpZ2h0U2lkZSh1cHBlckxlZywgdXBwZXJMZWcucGFyZW50KTtcclxuXHJcbiAgICBjb25zdCB1cHBlckFybSA9IHRoaXMuZ2VuZXJhdGVCb25lKGNoZXN0LCBbIDAsIDEsIDAgXSwgWyA0LjUsIDMyLCA0LjUgXSwgWyAwLCAwLjg1LCAxIF0sIFwiVXBwZXIgQXJtXCIpO1xyXG4gICAgY29uc3QgbG93ZXJBcm0gPSB0aGlzLmdlbmVyYXRlQm9uZSh1cHBlckFybSwgWyAwLCAxLCAwIF0sIFsgNC40OSwgMjgsIDQuNDkgXSwgWyAwLCAxLCAwIF0sIFwiTG93ZXIgQXJtXCIsKTtcclxuICAgIGNvbnN0IGhhbmQgPSB0aGlzLmdlbmVyYXRlQm9uZShsb3dlckFybSwgWyAwLCAxLCAwIF0sIFsgMy41LCAxNSwgMS41IF0sIFsgMCwgMSwgMCBdLCBcIkhhbmRcIik7XHJcblxyXG4gICAgdGhpcy5nZW5lcmF0ZVJpZ2h0U2lkZSh1cHBlckFybSwgdXBwZXJBcm0ucGFyZW50KTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkNoYXJhY3RlciA9IENoYXJhY3RlcjsiLCJjb25zdCBSZW5kZXIgPSByZXF1aXJlKFwiLi9yZW5kZXIuanNcIik7XHJcbmNvbnN0IFJlc291cmNlTG9hZGVyID0gcmVxdWlyZShcIi4vcmVzb3VyY2VfbG9hZGVyLmpzXCIpO1xyXG5jb25zdCBBbmltYXRpb25NYW5hZ2VyID0gcmVxdWlyZShcIi4vYW5pbWF0aW9uX21hbmFnZXJcIik7XHJcblxyXG5sZXQgZ2w7XHJcblxyXG5jb25zdCBmcHMgPSA2MDtcclxuY29uc3QgZnBzSW50ZXJ2YWwgPSAxMDAwIC8gZnBzO1xyXG5jb25zdCBkdCA9IDEuMCAvIGZwcztcclxuXHJcbmxldCBsYXN0RnJhbWVUaW1lID0gMDtcclxuXHJcbmZ1bmN0aW9uIHRpY2soKSB7XHJcblxyXG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICAgIGNvbnN0IGVsYXBzZWQgPSBub3cgLSBsYXN0RnJhbWVUaW1lO1xyXG5cclxuICAgIGlmIChlbGFwc2VkID4gZnBzSW50ZXJ2YWwpIHtcclxuXHJcbiAgICAgICAgbGFzdEZyYW1lVGltZSA9IG5vdyAtIChlbGFwc2VkICUgZnBzSW50ZXJ2YWwpO1xyXG5cclxuICAgICAgICBBbmltYXRpb25NYW5hZ2VyLmFkdmFuY2UoZHQpO1xyXG4gICAgICAgIEFuaW1hdGlvbk1hbmFnZXIuZHJhd0FuaW1hdGlvbnMoKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZGVkKCkge1xyXG5cclxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ2FtZS1zdXJmYWNlXCIpO1xyXG5cclxuICAgIFJlbmRlci5pbml0aWFsaXplKGdsKTtcclxuICAgIFJlbmRlci5zZXRTY3JlZW5TaXplKGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgQW5pbWF0aW9uTWFuYWdlci5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgY29uc3Qgc2l6ZSA9IDY0O1xyXG4gICAgY29uc3Qgc3BhY2luZyA9IDEuMDtcclxuXHJcbiAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHNpemU7IHgrKylcclxuICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHNpemU7IHkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBpbnN0YW5jZSA9IEFuaW1hdGlvbk1hbmFnZXIuY3JlYXRlQW5pbWF0aW9uSW5zdGFuY2UoLXggKiBzcGFjaW5nLCB5ICogc3BhY2luZywgMCk7XHJcbiAgICAgICAgICAgIGluc3RhbmNlLnNldEFuaW1hdGlvbihcIm5ld193YWxrXCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICBzZXRJbnRlcnZhbCh0aWNrLCAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBXZWJHTCgpIHtcclxuXHJcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZS1zdXJmYWNlJyk7XHJcbiAgICBnbCA9IGNhbnZhcy5nZXRDb250ZXh0KCd3ZWJnbCcpO1xyXG5cclxuICAgIGlmICghZ2wpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnV2ViR0wgbm90IHN1cHBvcnRlZCwgZmFsbGluZyBiYWNrIG9uIGV4cGVyaW1lbnRhbC13ZWJnbCcpO1xyXG4gICAgICAgIGdsID0gY2FudmFzLmdldENvbnRleHQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghZ2wpIHtcclxuICAgICAgICBhbGVydCgnWW91ciBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgV2ViR0wnKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gYWxlcnQoZ2wuZ2V0UGFyYW1ldGVyKGdsLk1BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTKSk7XHJcblxyXG4gICAgLy8gVE9ETyBzaG93IHNvbWUgbG9hZGluZyBzY3JlZW5cclxuXHJcbiAgICBSZXNvdXJjZUxvYWRlci5pbml0aWFsaXplKGdsLCBsb2FkZWQpO1xyXG59XHJcblxyXG5zZXR1cFdlYkdMKCk7XHJcbiIsIi8qIVxuQGZpbGVvdmVydmlldyBnbC1tYXRyaXggLSBIaWdoIHBlcmZvcm1hbmNlIG1hdHJpeCBhbmQgdmVjdG9yIG9wZXJhdGlvbnNcbkBhdXRob3IgQnJhbmRvbiBKb25lc1xuQGF1dGhvciBDb2xpbiBNYWNLZW56aWUgSVZcbkB2ZXJzaW9uIDIuNy4wXG5cbkNvcHlyaWdodCAoYykgMjAxNS0yMDE4LCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuXG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cblxuKi9cbiFmdW5jdGlvbih0LG4pe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzJiZcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlKW1vZHVsZS5leHBvcnRzPW4oKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoW10sbik7ZWxzZXt2YXIgcj1uKCk7Zm9yKHZhciBhIGluIHIpKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzP2V4cG9ydHM6dClbYV09clthXX19KFwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmP3NlbGY6dGhpcyxmdW5jdGlvbigpe3JldHVybiBmdW5jdGlvbih0KXt2YXIgbj17fTtmdW5jdGlvbiByKGEpe2lmKG5bYV0pcmV0dXJuIG5bYV0uZXhwb3J0czt2YXIgZT1uW2FdPXtpOmEsbDohMSxleHBvcnRzOnt9fTtyZXR1cm4gdFthXS5jYWxsKGUuZXhwb3J0cyxlLGUuZXhwb3J0cyxyKSxlLmw9ITAsZS5leHBvcnRzfXJldHVybiByLm09dCxyLmM9bixyLmQ9ZnVuY3Rpb24odCxuLGEpe3Iubyh0LG4pfHxPYmplY3QuZGVmaW5lUHJvcGVydHkodCxuLHtlbnVtZXJhYmxlOiEwLGdldDphfSl9LHIucj1mdW5jdGlvbih0KXtcInVuZGVmaW5lZFwiIT10eXBlb2YgU3ltYm9sJiZTeW1ib2wudG9TdHJpbmdUYWcmJk9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0LFN5bWJvbC50b1N0cmluZ1RhZyx7dmFsdWU6XCJNb2R1bGVcIn0pLE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0LFwiX19lc01vZHVsZVwiLHt2YWx1ZTohMH0pfSxyLnQ9ZnVuY3Rpb24odCxuKXtpZigxJm4mJih0PXIodCkpLDgmbilyZXR1cm4gdDtpZig0Jm4mJlwib2JqZWN0XCI9PXR5cGVvZiB0JiZ0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIGE9T2JqZWN0LmNyZWF0ZShudWxsKTtpZihyLnIoYSksT2JqZWN0LmRlZmluZVByb3BlcnR5KGEsXCJkZWZhdWx0XCIse2VudW1lcmFibGU6ITAsdmFsdWU6dH0pLDImbiYmXCJzdHJpbmdcIiE9dHlwZW9mIHQpZm9yKHZhciBlIGluIHQpci5kKGEsZSxmdW5jdGlvbihuKXtyZXR1cm4gdFtuXX0uYmluZChudWxsLGUpKTtyZXR1cm4gYX0sci5uPWZ1bmN0aW9uKHQpe3ZhciBuPXQmJnQuX19lc01vZHVsZT9mdW5jdGlvbigpe3JldHVybiB0LmRlZmF1bHR9OmZ1bmN0aW9uKCl7cmV0dXJuIHR9O3JldHVybiByLmQobixcImFcIixuKSxufSxyLm89ZnVuY3Rpb24odCxuKXtyZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQsbil9LHIucD1cIlwiLHIoci5zPTEwKX0oW2Z1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnNldE1hdHJpeEFycmF5VHlwZT1mdW5jdGlvbih0KXtuLkFSUkFZX1RZUEU9dH0sbi50b1JhZGlhbj1mdW5jdGlvbih0KXtyZXR1cm4gdCplfSxuLmVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiBNYXRoLmFicyh0LW4pPD1hKk1hdGgubWF4KDEsTWF0aC5hYnModCksTWF0aC5hYnMobikpfTt2YXIgYT1uLkVQU0lMT049MWUtNjtuLkFSUkFZX1RZUEU9XCJ1bmRlZmluZWRcIiE9dHlwZW9mIEZsb2F0MzJBcnJheT9GbG9hdDMyQXJyYXk6QXJyYXksbi5SQU5ET009TWF0aC5yYW5kb207dmFyIGU9TWF0aC5QSS8xODB9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLmZvckVhY2g9bi5zcXJMZW49bi5sZW49bi5zcXJEaXN0PW4uZGlzdD1uLmRpdj1uLm11bD1uLnN1Yj12b2lkIDAsbi5jcmVhdGU9ZSxuLmNsb25lPWZ1bmN0aW9uKHQpe3ZhciBuPW5ldyBhLkFSUkFZX1RZUEUoNCk7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sblsyXT10WzJdLG5bM109dFszXSxufSxuLmZyb21WYWx1ZXM9ZnVuY3Rpb24odCxuLHIsZSl7dmFyIHU9bmV3IGEuQVJSQVlfVFlQRSg0KTtyZXR1cm4gdVswXT10LHVbMV09bix1WzJdPXIsdVszXT1lLHV9LG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdH0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIsYSxlKXtyZXR1cm4gdFswXT1uLHRbMV09cix0WzJdPWEsdFszXT1lLHR9LG4uYWRkPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0sdFsxXT1uWzFdK3JbMV0sdFsyXT1uWzJdK3JbMl0sdFszXT1uWzNdK3JbM10sdH0sbi5zdWJ0cmFjdD11LG4ubXVsdGlwbHk9byxuLmRpdmlkZT1pLG4uY2VpbD1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPU1hdGguY2VpbChuWzBdKSx0WzFdPU1hdGguY2VpbChuWzFdKSx0WzJdPU1hdGguY2VpbChuWzJdKSx0WzNdPU1hdGguY2VpbChuWzNdKSx0fSxuLmZsb29yPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5mbG9vcihuWzBdKSx0WzFdPU1hdGguZmxvb3IoblsxXSksdFsyXT1NYXRoLmZsb29yKG5bMl0pLHRbM109TWF0aC5mbG9vcihuWzNdKSx0fSxuLm1pbj1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09TWF0aC5taW4oblswXSxyWzBdKSx0WzFdPU1hdGgubWluKG5bMV0sclsxXSksdFsyXT1NYXRoLm1pbihuWzJdLHJbMl0pLHRbM109TWF0aC5taW4oblszXSxyWzNdKSx0fSxuLm1heD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09TWF0aC5tYXgoblswXSxyWzBdKSx0WzFdPU1hdGgubWF4KG5bMV0sclsxXSksdFsyXT1NYXRoLm1heChuWzJdLHJbMl0pLHRbM109TWF0aC5tYXgoblszXSxyWzNdKSx0fSxuLnJvdW5kPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5yb3VuZChuWzBdKSx0WzFdPU1hdGgucm91bmQoblsxXSksdFsyXT1NYXRoLnJvdW5kKG5bMl0pLHRbM109TWF0aC5yb3VuZChuWzNdKSx0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdFsyXT1uWzJdKnIsdFszXT1uWzNdKnIsdH0sbi5zY2FsZUFuZEFkZD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0qYSx0WzFdPW5bMV0rclsxXSphLHRbMl09blsyXStyWzJdKmEsdFszXT1uWzNdK3JbM10qYSx0fSxuLmRpc3RhbmNlPXMsbi5zcXVhcmVkRGlzdGFuY2U9YyxuLmxlbmd0aD1mLG4uc3F1YXJlZExlbmd0aD1NLG4ubmVnYXRlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09LW5bMF0sdFsxXT0tblsxXSx0WzJdPS1uWzJdLHRbM109LW5bM10sdH0sbi5pbnZlcnNlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09MS9uWzBdLHRbMV09MS9uWzFdLHRbMl09MS9uWzJdLHRbM109MS9uWzNdLHR9LG4ubm9ybWFsaXplPWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPXIqcithKmErZSplK3UqdTtvPjAmJihvPTEvTWF0aC5zcXJ0KG8pLHRbMF09cipvLHRbMV09YSpvLHRbMl09ZSpvLHRbM109dSpvKTtyZXR1cm4gdH0sbi5kb3Q9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXSpuWzBdK3RbMV0qblsxXSt0WzJdKm5bMl0rdFszXSpuWzNdfSxuLmxlcnA9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXSx1PW5bMV0sbz1uWzJdLGk9blszXTtyZXR1cm4gdFswXT1lK2EqKHJbMF0tZSksdFsxXT11K2EqKHJbMV0tdSksdFsyXT1vK2EqKHJbMl0tbyksdFszXT1pK2EqKHJbM10taSksdH0sbi5yYW5kb209ZnVuY3Rpb24odCxuKXt2YXIgcixlLHUsbyxpLHM7bj1ufHwxO2Rve3I9MiphLlJBTkRPTSgpLTEsZT0yKmEuUkFORE9NKCktMSxpPXIqcitlKmV9d2hpbGUoaT49MSk7ZG97dT0yKmEuUkFORE9NKCktMSxvPTIqYS5SQU5ET00oKS0xLHM9dSp1K28qb313aGlsZShzPj0xKTt2YXIgYz1NYXRoLnNxcnQoKDEtaSkvcyk7cmV0dXJuIHRbMF09bipyLHRbMV09biplLHRbMl09bip1KmMsdFszXT1uKm8qYyx0fSxuLnRyYW5zZm9ybU1hdDQ9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM107cmV0dXJuIHRbMF09clswXSphK3JbNF0qZStyWzhdKnUrclsxMl0qbyx0WzFdPXJbMV0qYStyWzVdKmUrcls5XSp1K3JbMTNdKm8sdFsyXT1yWzJdKmErcls2XSplK3JbMTBdKnUrclsxNF0qbyx0WzNdPXJbM10qYStyWzddKmUrclsxMV0qdStyWzE1XSpvLHR9LG4udHJhbnNmb3JtUXVhdD1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89clswXSxpPXJbMV0scz1yWzJdLGM9clszXSxmPWMqYStpKnUtcyplLE09YyplK3MqYS1vKnUsaD1jKnUrbyplLWkqYSxsPS1vKmEtaSplLXMqdTtyZXR1cm4gdFswXT1mKmMrbCotbytNKi1zLWgqLWksdFsxXT1NKmMrbCotaStoKi1vLWYqLXMsdFsyXT1oKmMrbCotcytmKi1pLU0qLW8sdFszXT1uWzNdLHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwidmVjNChcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiLCBcIit0WzNdK1wiKVwifSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl0mJnRbM109PT1uWzNdfSxuLmVxdWFscz1mdW5jdGlvbih0LG4pe3ZhciByPXRbMF0sZT10WzFdLHU9dFsyXSxvPXRbM10saT1uWzBdLHM9blsxXSxjPW5bMl0sZj1uWzNdO3JldHVybiBNYXRoLmFicyhyLWkpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhpKSkmJk1hdGguYWJzKGUtcyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKHMpKSYmTWF0aC5hYnModS1jKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnMoYykpJiZNYXRoLmFicyhvLWYpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhvKSxNYXRoLmFicyhmKSl9O3ZhciBhPWZ1bmN0aW9uKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn0ocigwKSk7ZnVuY3Rpb24gZSgpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoNCk7cmV0dXJuIGEuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFswXT0wLHRbMV09MCx0WzJdPTAsdFszXT0wKSx0fWZ1bmN0aW9uIHUodCxuLHIpe3JldHVybiB0WzBdPW5bMF0tclswXSx0WzFdPW5bMV0tclsxXSx0WzJdPW5bMl0tclsyXSx0WzNdPW5bM10tclszXSx0fWZ1bmN0aW9uIG8odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qclswXSx0WzFdPW5bMV0qclsxXSx0WzJdPW5bMl0qclsyXSx0WzNdPW5bM10qclszXSx0fWZ1bmN0aW9uIGkodCxuLHIpe3JldHVybiB0WzBdPW5bMF0vclswXSx0WzFdPW5bMV0vclsxXSx0WzJdPW5bMl0vclsyXSx0WzNdPW5bM10vclszXSx0fWZ1bmN0aW9uIHModCxuKXt2YXIgcj1uWzBdLXRbMF0sYT1uWzFdLXRbMV0sZT1uWzJdLXRbMl0sdT1uWzNdLXRbM107cmV0dXJuIE1hdGguc3FydChyKnIrYSphK2UqZSt1KnUpfWZ1bmN0aW9uIGModCxuKXt2YXIgcj1uWzBdLXRbMF0sYT1uWzFdLXRbMV0sZT1uWzJdLXRbMl0sdT1uWzNdLXRbM107cmV0dXJuIHIqcithKmErZSplK3UqdX1mdW5jdGlvbiBmKHQpe3ZhciBuPXRbMF0scj10WzFdLGE9dFsyXSxlPXRbM107cmV0dXJuIE1hdGguc3FydChuKm4rcipyK2EqYStlKmUpfWZ1bmN0aW9uIE0odCl7dmFyIG49dFswXSxyPXRbMV0sYT10WzJdLGU9dFszXTtyZXR1cm4gbipuK3IqcithKmErZSplfW4uc3ViPXUsbi5tdWw9byxuLmRpdj1pLG4uZGlzdD1zLG4uc3FyRGlzdD1jLG4ubGVuPWYsbi5zcXJMZW49TSxuLmZvckVhY2g9ZnVuY3Rpb24oKXt2YXIgdD1lKCk7cmV0dXJuIGZ1bmN0aW9uKG4scixhLGUsdSxvKXt2YXIgaT12b2lkIDAscz12b2lkIDA7Zm9yKHJ8fChyPTQpLGF8fChhPTApLHM9ZT9NYXRoLm1pbihlKnIrYSxuLmxlbmd0aCk6bi5sZW5ndGgsaT1hO2k8cztpKz1yKXRbMF09bltpXSx0WzFdPW5baSsxXSx0WzJdPW5baSsyXSx0WzNdPW5baSszXSx1KHQsdCxvKSxuW2ldPXRbMF0sbltpKzFdPXRbMV0sbltpKzJdPXRbMl0sbltpKzNdPXRbM107cmV0dXJuIG59fSgpfSxmdW5jdGlvbih0LG4scil7XCJ1c2Ugc3RyaWN0XCI7T2JqZWN0LmRlZmluZVByb3BlcnR5KG4sXCJfX2VzTW9kdWxlXCIse3ZhbHVlOiEwfSksbi5mb3JFYWNoPW4uc3FyTGVuPW4ubGVuPW4uc3FyRGlzdD1uLmRpc3Q9bi5kaXY9bi5tdWw9bi5zdWI9dm9pZCAwLG4uY3JlYXRlPWUsbi5jbG9uZT1mdW5jdGlvbih0KXt2YXIgbj1uZXcgYS5BUlJBWV9UWVBFKDMpO3JldHVybiBuWzBdPXRbMF0sblsxXT10WzFdLG5bMl09dFsyXSxufSxuLmxlbmd0aD11LG4uZnJvbVZhbHVlcz1vLG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0fSxuLnNldD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uLHRbMV09cix0WzJdPWEsdH0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0fSxuLnN1YnRyYWN0PWksbi5tdWx0aXBseT1zLG4uZGl2aWRlPWMsbi5jZWlsPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5jZWlsKG5bMF0pLHRbMV09TWF0aC5jZWlsKG5bMV0pLHRbMl09TWF0aC5jZWlsKG5bMl0pLHR9LG4uZmxvb3I9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLmZsb29yKG5bMF0pLHRbMV09TWF0aC5mbG9vcihuWzFdKSx0WzJdPU1hdGguZmxvb3IoblsyXSksdH0sbi5taW49ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPU1hdGgubWluKG5bMF0sclswXSksdFsxXT1NYXRoLm1pbihuWzFdLHJbMV0pLHRbMl09TWF0aC5taW4oblsyXSxyWzJdKSx0fSxuLm1heD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09TWF0aC5tYXgoblswXSxyWzBdKSx0WzFdPU1hdGgubWF4KG5bMV0sclsxXSksdFsyXT1NYXRoLm1heChuWzJdLHJbMl0pLHR9LG4ucm91bmQ9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1NYXRoLnJvdW5kKG5bMF0pLHRbMV09TWF0aC5yb3VuZChuWzFdKSx0WzJdPU1hdGgucm91bmQoblsyXSksdH0sbi5zY2FsZT1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXSpyLHRbMV09blsxXSpyLHRbMl09blsyXSpyLHR9LG4uc2NhbGVBbmRBZGQ9ZnVuY3Rpb24odCxuLHIsYSl7cmV0dXJuIHRbMF09blswXStyWzBdKmEsdFsxXT1uWzFdK3JbMV0qYSx0WzJdPW5bMl0rclsyXSphLHR9LG4uZGlzdGFuY2U9ZixuLnNxdWFyZWREaXN0YW5jZT1NLG4uc3F1YXJlZExlbmd0aD1oLG4ubmVnYXRlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09LW5bMF0sdFsxXT0tblsxXSx0WzJdPS1uWzJdLHR9LG4uaW52ZXJzZT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPTEvblswXSx0WzFdPTEvblsxXSx0WzJdPTEvblsyXSx0fSxuLm5vcm1hbGl6ZT1sLG4uZG90PXYsbi5jcm9zcz1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89clswXSxpPXJbMV0scz1yWzJdO3JldHVybiB0WzBdPWUqcy11KmksdFsxXT11Km8tYSpzLHRbMl09YSppLWUqbyx0fSxuLmxlcnA9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXSx1PW5bMV0sbz1uWzJdO3JldHVybiB0WzBdPWUrYSooclswXS1lKSx0WzFdPXUrYSooclsxXS11KSx0WzJdPW8rYSooclsyXS1vKSx0fSxuLmhlcm1pdGU9ZnVuY3Rpb24odCxuLHIsYSxlLHUpe3ZhciBvPXUqdSxpPW8qKDIqdS0zKSsxLHM9byoodS0yKSt1LGM9byoodS0xKSxmPW8qKDMtMip1KTtyZXR1cm4gdFswXT1uWzBdKmkrclswXSpzK2FbMF0qYytlWzBdKmYsdFsxXT1uWzFdKmkrclsxXSpzK2FbMV0qYytlWzFdKmYsdFsyXT1uWzJdKmkrclsyXSpzK2FbMl0qYytlWzJdKmYsdH0sbi5iZXppZXI9ZnVuY3Rpb24odCxuLHIsYSxlLHUpe3ZhciBvPTEtdSxpPW8qbyxzPXUqdSxjPWkqbyxmPTMqdSppLE09MypzKm8saD1zKnU7cmV0dXJuIHRbMF09blswXSpjK3JbMF0qZithWzBdKk0rZVswXSpoLHRbMV09blsxXSpjK3JbMV0qZithWzFdKk0rZVsxXSpoLHRbMl09blsyXSpjK3JbMl0qZithWzJdKk0rZVsyXSpoLHR9LG4ucmFuZG9tPWZ1bmN0aW9uKHQsbil7bj1ufHwxO3ZhciByPTIqYS5SQU5ET00oKSpNYXRoLlBJLGU9MiphLlJBTkRPTSgpLTEsdT1NYXRoLnNxcnQoMS1lKmUpKm47cmV0dXJuIHRbMF09TWF0aC5jb3MocikqdSx0WzFdPU1hdGguc2luKHIpKnUsdFsyXT1lKm4sdH0sbi50cmFuc2Zvcm1NYXQ0PWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1yWzNdKmErcls3XSplK3JbMTFdKnUrclsxNV07cmV0dXJuIG89b3x8MSx0WzBdPShyWzBdKmErcls0XSplK3JbOF0qdStyWzEyXSkvbyx0WzFdPShyWzFdKmErcls1XSplK3JbOV0qdStyWzEzXSkvbyx0WzJdPShyWzJdKmErcls2XSplK3JbMTBdKnUrclsxNF0pL28sdH0sbi50cmFuc2Zvcm1NYXQzPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl07cmV0dXJuIHRbMF09YSpyWzBdK2UqclszXSt1KnJbNl0sdFsxXT1hKnJbMV0rZSpyWzRdK3Uqcls3XSx0WzJdPWEqclsyXStlKnJbNV0rdSpyWzhdLHR9LG4udHJhbnNmb3JtUXVhdD1mdW5jdGlvbih0LG4scil7dmFyIGE9clswXSxlPXJbMV0sdT1yWzJdLG89clszXSxpPW5bMF0scz1uWzFdLGM9blsyXSxmPWUqYy11KnMsTT11KmktYSpjLGg9YSpzLWUqaSxsPWUqaC11Kk0sdj11KmYtYSpoLGQ9YSpNLWUqZixiPTIqbztyZXR1cm4gZio9YixNKj1iLGgqPWIsbCo9Mix2Kj0yLGQqPTIsdFswXT1pK2YrbCx0WzFdPXMrTSt2LHRbMl09YytoK2QsdH0sbi5yb3RhdGVYPWZ1bmN0aW9uKHQsbixyLGEpe3ZhciBlPVtdLHU9W107cmV0dXJuIGVbMF09blswXS1yWzBdLGVbMV09blsxXS1yWzFdLGVbMl09blsyXS1yWzJdLHVbMF09ZVswXSx1WzFdPWVbMV0qTWF0aC5jb3MoYSktZVsyXSpNYXRoLnNpbihhKSx1WzJdPWVbMV0qTWF0aC5zaW4oYSkrZVsyXSpNYXRoLmNvcyhhKSx0WzBdPXVbMF0rclswXSx0WzFdPXVbMV0rclsxXSx0WzJdPXVbMl0rclsyXSx0fSxuLnJvdGF0ZVk9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9W10sdT1bXTtyZXR1cm4gZVswXT1uWzBdLXJbMF0sZVsxXT1uWzFdLXJbMV0sZVsyXT1uWzJdLXJbMl0sdVswXT1lWzJdKk1hdGguc2luKGEpK2VbMF0qTWF0aC5jb3MoYSksdVsxXT1lWzFdLHVbMl09ZVsyXSpNYXRoLmNvcyhhKS1lWzBdKk1hdGguc2luKGEpLHRbMF09dVswXStyWzBdLHRbMV09dVsxXStyWzFdLHRbMl09dVsyXStyWzJdLHR9LG4ucm90YXRlWj1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1bXSx1PVtdO3JldHVybiBlWzBdPW5bMF0tclswXSxlWzFdPW5bMV0tclsxXSxlWzJdPW5bMl0tclsyXSx1WzBdPWVbMF0qTWF0aC5jb3MoYSktZVsxXSpNYXRoLnNpbihhKSx1WzFdPWVbMF0qTWF0aC5zaW4oYSkrZVsxXSpNYXRoLmNvcyhhKSx1WzJdPWVbMl0sdFswXT11WzBdK3JbMF0sdFsxXT11WzFdK3JbMV0sdFsyXT11WzJdK3JbMl0sdH0sbi5hbmdsZT1mdW5jdGlvbih0LG4pe3ZhciByPW8odFswXSx0WzFdLHRbMl0pLGE9byhuWzBdLG5bMV0sblsyXSk7bChyLHIpLGwoYSxhKTt2YXIgZT12KHIsYSk7cmV0dXJuIGU+MT8wOmU8LTE/TWF0aC5QSTpNYXRoLmFjb3MoZSl9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwidmVjMyhcIit0WzBdK1wiLCBcIit0WzFdK1wiLCBcIit0WzJdK1wiKVwifSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl19LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89blswXSxpPW5bMV0scz1uWzJdO3JldHVybiBNYXRoLmFicyhyLW8pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhvKSkmJk1hdGguYWJzKGUtaSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKGkpKSYmTWF0aC5hYnModS1zKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnMocykpfTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUoKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDMpO3JldHVybiBhLkFSUkFZX1RZUEUhPUZsb2F0MzJBcnJheSYmKHRbMF09MCx0WzFdPTAsdFsyXT0wKSx0fWZ1bmN0aW9uIHUodCl7dmFyIG49dFswXSxyPXRbMV0sYT10WzJdO3JldHVybiBNYXRoLnNxcnQobipuK3IqcithKmEpfWZ1bmN0aW9uIG8odCxuLHIpe3ZhciBlPW5ldyBhLkFSUkFZX1RZUEUoMyk7cmV0dXJuIGVbMF09dCxlWzFdPW4sZVsyXT1yLGV9ZnVuY3Rpb24gaSh0LG4scil7cmV0dXJuIHRbMF09blswXS1yWzBdLHRbMV09blsxXS1yWzFdLHRbMl09blsyXS1yWzJdLHR9ZnVuY3Rpb24gcyh0LG4scil7cmV0dXJuIHRbMF09blswXSpyWzBdLHRbMV09blsxXSpyWzFdLHRbMl09blsyXSpyWzJdLHR9ZnVuY3Rpb24gYyh0LG4scil7cmV0dXJuIHRbMF09blswXS9yWzBdLHRbMV09blsxXS9yWzFdLHRbMl09blsyXS9yWzJdLHR9ZnVuY3Rpb24gZih0LG4pe3ZhciByPW5bMF0tdFswXSxhPW5bMV0tdFsxXSxlPW5bMl0tdFsyXTtyZXR1cm4gTWF0aC5zcXJ0KHIqcithKmErZSplKX1mdW5jdGlvbiBNKHQsbil7dmFyIHI9blswXS10WzBdLGE9blsxXS10WzFdLGU9blsyXS10WzJdO3JldHVybiByKnIrYSphK2UqZX1mdW5jdGlvbiBoKHQpe3ZhciBuPXRbMF0scj10WzFdLGE9dFsyXTtyZXR1cm4gbipuK3IqcithKmF9ZnVuY3Rpb24gbCh0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PXIqcithKmErZSplO3JldHVybiB1PjAmJih1PTEvTWF0aC5zcXJ0KHUpLHRbMF09blswXSp1LHRbMV09blsxXSp1LHRbMl09blsyXSp1KSx0fWZ1bmN0aW9uIHYodCxuKXtyZXR1cm4gdFswXSpuWzBdK3RbMV0qblsxXSt0WzJdKm5bMl19bi5zdWI9aSxuLm11bD1zLG4uZGl2PWMsbi5kaXN0PWYsbi5zcXJEaXN0PU0sbi5sZW49dSxuLnNxckxlbj1oLG4uZm9yRWFjaD1mdW5jdGlvbigpe3ZhciB0PWUoKTtyZXR1cm4gZnVuY3Rpb24obixyLGEsZSx1LG8pe3ZhciBpPXZvaWQgMCxzPXZvaWQgMDtmb3Iocnx8KHI9MyksYXx8KGE9MCkscz1lP01hdGgubWluKGUqcithLG4ubGVuZ3RoKTpuLmxlbmd0aCxpPWE7aTxzO2krPXIpdFswXT1uW2ldLHRbMV09bltpKzFdLHRbMl09bltpKzJdLHUodCx0LG8pLG5baV09dFswXSxuW2krMV09dFsxXSxuW2krMl09dFsyXTtyZXR1cm4gbn19KCl9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnNldEF4ZXM9bi5zcWxlcnA9bi5yb3RhdGlvblRvPW4uZXF1YWxzPW4uZXhhY3RFcXVhbHM9bi5ub3JtYWxpemU9bi5zcXJMZW49bi5zcXVhcmVkTGVuZ3RoPW4ubGVuPW4ubGVuZ3RoPW4ubGVycD1uLmRvdD1uLnNjYWxlPW4ubXVsPW4uYWRkPW4uc2V0PW4uY29weT1uLmZyb21WYWx1ZXM9bi5jbG9uZT12b2lkIDAsbi5jcmVhdGU9cyxuLmlkZW50aXR5PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdPTAsdFsxXT0wLHRbMl09MCx0WzNdPTEsdH0sbi5zZXRBeGlzQW5nbGU9YyxuLmdldEF4aXNBbmdsZT1mdW5jdGlvbih0LG4pe3ZhciByPTIqTWF0aC5hY29zKG5bM10pLGU9TWF0aC5zaW4oci8yKTtlPmEuRVBTSUxPTj8odFswXT1uWzBdL2UsdFsxXT1uWzFdL2UsdFsyXT1uWzJdL2UpOih0WzBdPTEsdFsxXT0wLHRbMl09MCk7cmV0dXJuIHJ9LG4ubXVsdGlwbHk9ZixuLnJvdGF0ZVg9ZnVuY3Rpb24odCxuLHIpe3IqPS41O3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1NYXRoLnNpbihyKSxzPU1hdGguY29zKHIpO3JldHVybiB0WzBdPWEqcytvKmksdFsxXT1lKnMrdSppLHRbMl09dSpzLWUqaSx0WzNdPW8qcy1hKmksdH0sbi5yb3RhdGVZPWZ1bmN0aW9uKHQsbixyKXtyKj0uNTt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9TWF0aC5zaW4ocikscz1NYXRoLmNvcyhyKTtyZXR1cm4gdFswXT1hKnMtdSppLHRbMV09ZSpzK28qaSx0WzJdPXUqcythKmksdFszXT1vKnMtZSppLHR9LG4ucm90YXRlWj1mdW5jdGlvbih0LG4scil7cio9LjU7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPU1hdGguc2luKHIpLHM9TWF0aC5jb3Mocik7cmV0dXJuIHRbMF09YSpzK2UqaSx0WzFdPWUqcy1hKmksdFsyXT11KnMrbyppLHRbM109bypzLXUqaSx0fSxuLmNhbGN1bGF0ZVc9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl07cmV0dXJuIHRbMF09cix0WzFdPWEsdFsyXT1lLHRbM109TWF0aC5zcXJ0KE1hdGguYWJzKDEtcipyLWEqYS1lKmUpKSx0fSxuLnNsZXJwPU0sbi5yYW5kb209ZnVuY3Rpb24odCl7dmFyIG49YS5SQU5ET00oKSxyPWEuUkFORE9NKCksZT1hLlJBTkRPTSgpLHU9TWF0aC5zcXJ0KDEtbiksbz1NYXRoLnNxcnQobik7cmV0dXJuIHRbMF09dSpNYXRoLnNpbigyKk1hdGguUEkqciksdFsxXT11Kk1hdGguY29zKDIqTWF0aC5QSSpyKSx0WzJdPW8qTWF0aC5zaW4oMipNYXRoLlBJKmUpLHRbM109bypNYXRoLmNvcygyKk1hdGguUEkqZSksdH0sbi5pbnZlcnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89cipyK2EqYStlKmUrdSp1LGk9bz8xL286MDtyZXR1cm4gdFswXT0tcippLHRbMV09LWEqaSx0WzJdPS1lKmksdFszXT11KmksdH0sbi5jb25qdWdhdGU9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0tblswXSx0WzFdPS1uWzFdLHRbMl09LW5bMl0sdFszXT1uWzNdLHR9LG4uZnJvbU1hdDM9aCxuLmZyb21FdWxlcj1mdW5jdGlvbih0LG4scixhKXt2YXIgZT0uNSpNYXRoLlBJLzE4MDtuKj1lLHIqPWUsYSo9ZTt2YXIgdT1NYXRoLnNpbihuKSxvPU1hdGguY29zKG4pLGk9TWF0aC5zaW4ocikscz1NYXRoLmNvcyhyKSxjPU1hdGguc2luKGEpLGY9TWF0aC5jb3MoYSk7cmV0dXJuIHRbMF09dSpzKmYtbyppKmMsdFsxXT1vKmkqZit1KnMqYyx0WzJdPW8qcypjLXUqaSpmLHRbM109bypzKmYrdSppKmMsdH0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJxdWF0KFwiK3RbMF0rXCIsIFwiK3RbMV0rXCIsIFwiK3RbMl0rXCIsIFwiK3RbM10rXCIpXCJ9O3ZhciBhPWkocigwKSksZT1pKHIoNSkpLHU9aShyKDIpKSxvPWkocigxKSk7ZnVuY3Rpb24gaSh0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59ZnVuY3Rpb24gcygpe3ZhciB0PW5ldyBhLkFSUkFZX1RZUEUoNCk7cmV0dXJuIGEuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFswXT0wLHRbMV09MCx0WzJdPTApLHRbM109MSx0fWZ1bmN0aW9uIGModCxuLHIpe3IqPS41O3ZhciBhPU1hdGguc2luKHIpO3JldHVybiB0WzBdPWEqblswXSx0WzFdPWEqblsxXSx0WzJdPWEqblsyXSx0WzNdPU1hdGguY29zKHIpLHR9ZnVuY3Rpb24gZih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPXJbMF0scz1yWzFdLGM9clsyXSxmPXJbM107cmV0dXJuIHRbMF09YSpmK28qaStlKmMtdSpzLHRbMV09ZSpmK28qcyt1KmktYSpjLHRbMl09dSpmK28qYythKnMtZSppLHRbM109bypmLWEqaS1lKnMtdSpjLHR9ZnVuY3Rpb24gTSh0LG4scixlKXt2YXIgdT1uWzBdLG89blsxXSxpPW5bMl0scz1uWzNdLGM9clswXSxmPXJbMV0sTT1yWzJdLGg9clszXSxsPXZvaWQgMCx2PXZvaWQgMCxkPXZvaWQgMCxiPXZvaWQgMCxtPXZvaWQgMDtyZXR1cm4odj11KmMrbypmK2kqTStzKmgpPDAmJih2PS12LGM9LWMsZj0tZixNPS1NLGg9LWgpLDEtdj5hLkVQU0lMT04/KGw9TWF0aC5hY29zKHYpLGQ9TWF0aC5zaW4obCksYj1NYXRoLnNpbigoMS1lKSpsKS9kLG09TWF0aC5zaW4oZSpsKS9kKTooYj0xLWUsbT1lKSx0WzBdPWIqdSttKmMsdFsxXT1iKm8rbSpmLHRbMl09YippK20qTSx0WzNdPWIqcyttKmgsdH1mdW5jdGlvbiBoKHQsbil7dmFyIHI9blswXStuWzRdK25bOF0sYT12b2lkIDA7aWYocj4wKWE9TWF0aC5zcXJ0KHIrMSksdFszXT0uNSphLGE9LjUvYSx0WzBdPShuWzVdLW5bN10pKmEsdFsxXT0obls2XS1uWzJdKSphLHRbMl09KG5bMV0tblszXSkqYTtlbHNle3ZhciBlPTA7bls0XT5uWzBdJiYoZT0xKSxuWzhdPm5bMyplK2VdJiYoZT0yKTt2YXIgdT0oZSsxKSUzLG89KGUrMiklMzthPU1hdGguc3FydChuWzMqZStlXS1uWzMqdSt1XS1uWzMqbytvXSsxKSx0W2VdPS41KmEsYT0uNS9hLHRbM109KG5bMyp1K29dLW5bMypvK3VdKSphLHRbdV09KG5bMyp1K2VdK25bMyplK3VdKSphLHRbb109KG5bMypvK2VdK25bMyplK29dKSphfXJldHVybiB0fW4uY2xvbmU9by5jbG9uZSxuLmZyb21WYWx1ZXM9by5mcm9tVmFsdWVzLG4uY29weT1vLmNvcHksbi5zZXQ9by5zZXQsbi5hZGQ9by5hZGQsbi5tdWw9ZixuLnNjYWxlPW8uc2NhbGUsbi5kb3Q9by5kb3Qsbi5sZXJwPW8ubGVycDt2YXIgbD1uLmxlbmd0aD1vLmxlbmd0aCx2PShuLmxlbj1sLG4uc3F1YXJlZExlbmd0aD1vLnNxdWFyZWRMZW5ndGgpLGQ9KG4uc3FyTGVuPXYsbi5ub3JtYWxpemU9by5ub3JtYWxpemUpO24uZXhhY3RFcXVhbHM9by5leGFjdEVxdWFscyxuLmVxdWFscz1vLmVxdWFscyxuLnJvdGF0aW9uVG89ZnVuY3Rpb24oKXt2YXIgdD11LmNyZWF0ZSgpLG49dS5mcm9tVmFsdWVzKDEsMCwwKSxyPXUuZnJvbVZhbHVlcygwLDEsMCk7cmV0dXJuIGZ1bmN0aW9uKGEsZSxvKXt2YXIgaT11LmRvdChlLG8pO3JldHVybiBpPC0uOTk5OTk5Pyh1LmNyb3NzKHQsbixlKSx1Lmxlbih0KTwxZS02JiZ1LmNyb3NzKHQscixlKSx1Lm5vcm1hbGl6ZSh0LHQpLGMoYSx0LE1hdGguUEkpLGEpOmk+Ljk5OTk5OT8oYVswXT0wLGFbMV09MCxhWzJdPTAsYVszXT0xLGEpOih1LmNyb3NzKHQsZSxvKSxhWzBdPXRbMF0sYVsxXT10WzFdLGFbMl09dFsyXSxhWzNdPTEraSxkKGEsYSkpfX0oKSxuLnNxbGVycD1mdW5jdGlvbigpe3ZhciB0PXMoKSxuPXMoKTtyZXR1cm4gZnVuY3Rpb24ocixhLGUsdSxvLGkpe3JldHVybiBNKHQsYSxvLGkpLE0obixlLHUsaSksTShyLHQsbiwyKmkqKDEtaSkpLHJ9fSgpLG4uc2V0QXhlcz1mdW5jdGlvbigpe3ZhciB0PWUuY3JlYXRlKCk7cmV0dXJuIGZ1bmN0aW9uKG4scixhLGUpe3JldHVybiB0WzBdPWFbMF0sdFszXT1hWzFdLHRbNl09YVsyXSx0WzFdPWVbMF0sdFs0XT1lWzFdLHRbN109ZVsyXSx0WzJdPS1yWzBdLHRbNV09LXJbMV0sdFs4XT0tclsyXSxkKG4saChuLHQpKX19KCl9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnN1Yj1uLm11bD12b2lkIDAsbi5jcmVhdGU9ZnVuY3Rpb24oKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDE2KTthLkFSUkFZX1RZUEUhPUZsb2F0MzJBcnJheSYmKHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09MCx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMV09MCx0WzEyXT0wLHRbMTNdPTAsdFsxNF09MCk7cmV0dXJuIHRbMF09MSx0WzVdPTEsdFsxMF09MSx0WzE1XT0xLHR9LG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSgxNik7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sblsyXT10WzJdLG5bM109dFszXSxuWzRdPXRbNF0sbls1XT10WzVdLG5bNl09dFs2XSxuWzddPXRbN10sbls4XT10WzhdLG5bOV09dFs5XSxuWzEwXT10WzEwXSxuWzExXT10WzExXSxuWzEyXT10WzEyXSxuWzEzXT10WzEzXSxuWzE0XT10WzE0XSxuWzE1XT10WzE1XSxufSxuLmNvcHk9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT1uWzBdLHRbMV09blsxXSx0WzJdPW5bMl0sdFszXT1uWzNdLHRbNF09bls0XSx0WzVdPW5bNV0sdFs2XT1uWzZdLHRbN109bls3XSx0WzhdPW5bOF0sdFs5XT1uWzldLHRbMTBdPW5bMTBdLHRbMTFdPW5bMTFdLHRbMTJdPW5bMTJdLHRbMTNdPW5bMTNdLHRbMTRdPW5bMTRdLHRbMTVdPW5bMTVdLHR9LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlLHUsbyxpLHMsYyxmLE0saCxsLHYsZCxiKXt2YXIgbT1uZXcgYS5BUlJBWV9UWVBFKDE2KTtyZXR1cm4gbVswXT10LG1bMV09bixtWzJdPXIsbVszXT1lLG1bNF09dSxtWzVdPW8sbVs2XT1pLG1bN109cyxtWzhdPWMsbVs5XT1mLG1bMTBdPU0sbVsxMV09aCxtWzEyXT1sLG1bMTNdPXYsbVsxNF09ZCxtWzE1XT1iLG19LG4uc2V0PWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8saSxzLGMsZixNLGgsbCx2LGQsYil7cmV0dXJuIHRbMF09bix0WzFdPXIsdFsyXT1hLHRbM109ZSx0WzRdPXUsdFs1XT1vLHRbNl09aSx0WzddPXMsdFs4XT1jLHRbOV09Zix0WzEwXT1NLHRbMTFdPWgsdFsxMl09bCx0WzEzXT12LHRbMTRdPWQsdFsxNV09Yix0fSxuLmlkZW50aXR5PWUsbi50cmFuc3Bvc2U9ZnVuY3Rpb24odCxuKXtpZih0PT09bil7dmFyIHI9blsxXSxhPW5bMl0sZT1uWzNdLHU9bls2XSxvPW5bN10saT1uWzExXTt0WzFdPW5bNF0sdFsyXT1uWzhdLHRbM109blsxMl0sdFs0XT1yLHRbNl09bls5XSx0WzddPW5bMTNdLHRbOF09YSx0WzldPXUsdFsxMV09blsxNF0sdFsxMl09ZSx0WzEzXT1vLHRbMTRdPWl9ZWxzZSB0WzBdPW5bMF0sdFsxXT1uWzRdLHRbMl09bls4XSx0WzNdPW5bMTJdLHRbNF09blsxXSx0WzVdPW5bNV0sdFs2XT1uWzldLHRbN109blsxM10sdFs4XT1uWzJdLHRbOV09bls2XSx0WzEwXT1uWzEwXSx0WzExXT1uWzE0XSx0WzEyXT1uWzNdLHRbMTNdPW5bN10sdFsxNF09blsxMV0sdFsxNV09blsxNV07cmV0dXJuIHR9LG4uaW52ZXJ0PWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPW5bNF0saT1uWzVdLHM9bls2XSxjPW5bN10sZj1uWzhdLE09bls5XSxoPW5bMTBdLGw9blsxMV0sdj1uWzEyXSxkPW5bMTNdLGI9blsxNF0sbT1uWzE1XSxwPXIqaS1hKm8sUD1yKnMtZSpvLEE9cipjLXUqbyxFPWEqcy1lKmksTz1hKmMtdSppLFI9ZSpjLXUqcyx5PWYqZC1NKnYscT1mKmItaCp2LHg9ZiptLWwqdixfPU0qYi1oKmQsWT1NKm0tbCpkLEw9aCptLWwqYixTPXAqTC1QKlkrQSpfK0UqeC1PKnErUip5O2lmKCFTKXJldHVybiBudWxsO3JldHVybiBTPTEvUyx0WzBdPShpKkwtcypZK2MqXykqUyx0WzFdPShlKlktYSpMLXUqXykqUyx0WzJdPShkKlItYipPK20qRSkqUyx0WzNdPShoKk8tTSpSLWwqRSkqUyx0WzRdPShzKngtbypMLWMqcSkqUyx0WzVdPShyKkwtZSp4K3UqcSkqUyx0WzZdPShiKkEtdipSLW0qUCkqUyx0WzddPShmKlItaCpBK2wqUCkqUyx0WzhdPShvKlktaSp4K2MqeSkqUyx0WzldPShhKngtcipZLXUqeSkqUyx0WzEwXT0odipPLWQqQSttKnApKlMsdFsxMV09KE0qQS1mKk8tbCpwKSpTLHRbMTJdPShpKnEtbypfLXMqeSkqUyx0WzEzXT0ocipfLWEqcStlKnkpKlMsdFsxNF09KGQqUC12KkUtYipwKSpTLHRbMTVdPShmKkUtTSpQK2gqcCkqUyx0fSxuLmFkam9pbnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89bls0XSxpPW5bNV0scz1uWzZdLGM9bls3XSxmPW5bOF0sTT1uWzldLGg9blsxMF0sbD1uWzExXSx2PW5bMTJdLGQ9blsxM10sYj1uWzE0XSxtPW5bMTVdO3JldHVybiB0WzBdPWkqKGgqbS1sKmIpLU0qKHMqbS1jKmIpK2QqKHMqbC1jKmgpLHRbMV09LShhKihoKm0tbCpiKS1NKihlKm0tdSpiKStkKihlKmwtdSpoKSksdFsyXT1hKihzKm0tYypiKS1pKihlKm0tdSpiKStkKihlKmMtdSpzKSx0WzNdPS0oYSoocypsLWMqaCktaSooZSpsLXUqaCkrTSooZSpjLXUqcykpLHRbNF09LShvKihoKm0tbCpiKS1mKihzKm0tYypiKSt2KihzKmwtYypoKSksdFs1XT1yKihoKm0tbCpiKS1mKihlKm0tdSpiKSt2KihlKmwtdSpoKSx0WzZdPS0ocioocyptLWMqYiktbyooZSptLXUqYikrdiooZSpjLXUqcykpLHRbN109cioocypsLWMqaCktbyooZSpsLXUqaCkrZiooZSpjLXUqcyksdFs4XT1vKihNKm0tbCpkKS1mKihpKm0tYypkKSt2KihpKmwtYypNKSx0WzldPS0ociooTSptLWwqZCktZiooYSptLXUqZCkrdiooYSpsLXUqTSkpLHRbMTBdPXIqKGkqbS1jKmQpLW8qKGEqbS11KmQpK3YqKGEqYy11KmkpLHRbMTFdPS0ociooaSpsLWMqTSktbyooYSpsLXUqTSkrZiooYSpjLXUqaSkpLHRbMTJdPS0obyooTSpiLWgqZCktZiooaSpiLXMqZCkrdiooaSpoLXMqTSkpLHRbMTNdPXIqKE0qYi1oKmQpLWYqKGEqYi1lKmQpK3YqKGEqaC1lKk0pLHRbMTRdPS0ociooaSpiLXMqZCktbyooYSpiLWUqZCkrdiooYSpzLWUqaSkpLHRbMTVdPXIqKGkqaC1zKk0pLW8qKGEqaC1lKk0pK2YqKGEqcy1lKmkpLHR9LG4uZGV0ZXJtaW5hbnQ9ZnVuY3Rpb24odCl7dmFyIG49dFswXSxyPXRbMV0sYT10WzJdLGU9dFszXSx1PXRbNF0sbz10WzVdLGk9dFs2XSxzPXRbN10sYz10WzhdLGY9dFs5XSxNPXRbMTBdLGg9dFsxMV0sbD10WzEyXSx2PXRbMTNdLGQ9dFsxNF0sYj10WzE1XTtyZXR1cm4obipvLXIqdSkqKE0qYi1oKmQpLShuKmktYSp1KSooZipiLWgqdikrKG4qcy1lKnUpKihmKmQtTSp2KSsocippLWEqbykqKGMqYi1oKmwpLShyKnMtZSpvKSooYypkLU0qbCkrKGEqcy1lKmkpKihjKnYtZipsKX0sbi5tdWx0aXBseT11LG4udHJhbnNsYXRlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1yWzBdLGU9clsxXSx1PXJbMl0sbz12b2lkIDAsaT12b2lkIDAscz12b2lkIDAsYz12b2lkIDAsZj12b2lkIDAsTT12b2lkIDAsaD12b2lkIDAsbD12b2lkIDAsdj12b2lkIDAsZD12b2lkIDAsYj12b2lkIDAsbT12b2lkIDA7bj09PXQ/KHRbMTJdPW5bMF0qYStuWzRdKmUrbls4XSp1K25bMTJdLHRbMTNdPW5bMV0qYStuWzVdKmUrbls5XSp1K25bMTNdLHRbMTRdPW5bMl0qYStuWzZdKmUrblsxMF0qdStuWzE0XSx0WzE1XT1uWzNdKmErbls3XSplK25bMTFdKnUrblsxNV0pOihvPW5bMF0saT1uWzFdLHM9blsyXSxjPW5bM10sZj1uWzRdLE09bls1XSxoPW5bNl0sbD1uWzddLHY9bls4XSxkPW5bOV0sYj1uWzEwXSxtPW5bMTFdLHRbMF09byx0WzFdPWksdFsyXT1zLHRbM109Yyx0WzRdPWYsdFs1XT1NLHRbNl09aCx0WzddPWwsdFs4XT12LHRbOV09ZCx0WzEwXT1iLHRbMTFdPW0sdFsxMl09byphK2YqZSt2KnUrblsxMl0sdFsxM109aSphK00qZStkKnUrblsxM10sdFsxNF09cyphK2gqZStiKnUrblsxNF0sdFsxNV09YyphK2wqZSttKnUrblsxNV0pO3JldHVybiB0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1yWzBdLGU9clsxXSx1PXJbMl07cmV0dXJuIHRbMF09blswXSphLHRbMV09blsxXSphLHRbMl09blsyXSphLHRbM109blszXSphLHRbNF09bls0XSplLHRbNV09bls1XSplLHRbNl09bls2XSplLHRbN109bls3XSplLHRbOF09bls4XSp1LHRbOV09bls5XSp1LHRbMTBdPW5bMTBdKnUsdFsxMV09blsxMV0qdSx0WzEyXT1uWzEyXSx0WzEzXT1uWzEzXSx0WzE0XT1uWzE0XSx0WzE1XT1uWzE1XSx0fSxuLnJvdGF0ZT1mdW5jdGlvbih0LG4scixlKXt2YXIgdT1lWzBdLG89ZVsxXSxpPWVbMl0scz1NYXRoLnNxcnQodSp1K28qbytpKmkpLGM9dm9pZCAwLGY9dm9pZCAwLE09dm9pZCAwLGg9dm9pZCAwLGw9dm9pZCAwLHY9dm9pZCAwLGQ9dm9pZCAwLGI9dm9pZCAwLG09dm9pZCAwLHA9dm9pZCAwLFA9dm9pZCAwLEE9dm9pZCAwLEU9dm9pZCAwLE89dm9pZCAwLFI9dm9pZCAwLHk9dm9pZCAwLHE9dm9pZCAwLHg9dm9pZCAwLF89dm9pZCAwLFk9dm9pZCAwLEw9dm9pZCAwLFM9dm9pZCAwLHc9dm9pZCAwLEk9dm9pZCAwO2lmKHM8YS5FUFNJTE9OKXJldHVybiBudWxsO3UqPXM9MS9zLG8qPXMsaSo9cyxjPU1hdGguc2luKHIpLGY9TWF0aC5jb3MociksTT0xLWYsaD1uWzBdLGw9blsxXSx2PW5bMl0sZD1uWzNdLGI9bls0XSxtPW5bNV0scD1uWzZdLFA9bls3XSxBPW5bOF0sRT1uWzldLE89blsxMF0sUj1uWzExXSx5PXUqdSpNK2YscT1vKnUqTStpKmMseD1pKnUqTS1vKmMsXz11Km8qTS1pKmMsWT1vKm8qTStmLEw9aSpvKk0rdSpjLFM9dSppKk0rbypjLHc9byppKk0tdSpjLEk9aSppKk0rZix0WzBdPWgqeStiKnErQSp4LHRbMV09bCp5K20qcStFKngsdFsyXT12KnkrcCpxK08qeCx0WzNdPWQqeStQKnErUip4LHRbNF09aCpfK2IqWStBKkwsdFs1XT1sKl8rbSpZK0UqTCx0WzZdPXYqXytwKlkrTypMLHRbN109ZCpfK1AqWStSKkwsdFs4XT1oKlMrYip3K0EqSSx0WzldPWwqUyttKncrRSpJLHRbMTBdPXYqUytwKncrTypJLHRbMTFdPWQqUytQKncrUipJLG4hPT10JiYodFsxMl09blsxMl0sdFsxM109blsxM10sdFsxNF09blsxNF0sdFsxNV09blsxNV0pO3JldHVybiB0fSxuLnJvdGF0ZVg9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPU1hdGguc2luKHIpLGU9TWF0aC5jb3MociksdT1uWzRdLG89bls1XSxpPW5bNl0scz1uWzddLGM9bls4XSxmPW5bOV0sTT1uWzEwXSxoPW5bMTFdO24hPT10JiYodFswXT1uWzBdLHRbMV09blsxXSx0WzJdPW5bMl0sdFszXT1uWzNdLHRbMTJdPW5bMTJdLHRbMTNdPW5bMTNdLHRbMTRdPW5bMTRdLHRbMTVdPW5bMTVdKTtyZXR1cm4gdFs0XT11KmUrYyphLHRbNV09byplK2YqYSx0WzZdPWkqZStNKmEsdFs3XT1zKmUraCphLHRbOF09YyplLXUqYSx0WzldPWYqZS1vKmEsdFsxMF09TSplLWkqYSx0WzExXT1oKmUtcyphLHR9LG4ucm90YXRlWT1mdW5jdGlvbih0LG4scil7dmFyIGE9TWF0aC5zaW4ociksZT1NYXRoLmNvcyhyKSx1PW5bMF0sbz1uWzFdLGk9blsyXSxzPW5bM10sYz1uWzhdLGY9bls5XSxNPW5bMTBdLGg9blsxMV07biE9PXQmJih0WzRdPW5bNF0sdFs1XT1uWzVdLHRbNl09bls2XSx0WzddPW5bN10sdFsxMl09blsxMl0sdFsxM109blsxM10sdFsxNF09blsxNF0sdFsxNV09blsxNV0pO3JldHVybiB0WzBdPXUqZS1jKmEsdFsxXT1vKmUtZiphLHRbMl09aSplLU0qYSx0WzNdPXMqZS1oKmEsdFs4XT11KmErYyplLHRbOV09byphK2YqZSx0WzEwXT1pKmErTSplLHRbMTFdPXMqYStoKmUsdH0sbi5yb3RhdGVaPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1NYXRoLnNpbihyKSxlPU1hdGguY29zKHIpLHU9blswXSxvPW5bMV0saT1uWzJdLHM9blszXSxjPW5bNF0sZj1uWzVdLE09bls2XSxoPW5bN107biE9PXQmJih0WzhdPW5bOF0sdFs5XT1uWzldLHRbMTBdPW5bMTBdLHRbMTFdPW5bMTFdLHRbMTJdPW5bMTJdLHRbMTNdPW5bMTNdLHRbMTRdPW5bMTRdLHRbMTVdPW5bMTVdKTtyZXR1cm4gdFswXT11KmUrYyphLHRbMV09byplK2YqYSx0WzJdPWkqZStNKmEsdFszXT1zKmUraCphLHRbNF09YyplLXUqYSx0WzVdPWYqZS1vKmEsdFs2XT1NKmUtaSphLHRbN109aCplLXMqYSx0fSxuLmZyb21UcmFuc2xhdGlvbj1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNV09MSx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMF09MSx0WzExXT0wLHRbMTJdPW5bMF0sdFsxM109blsxXSx0WzE0XT1uWzJdLHRbMTVdPTEsdH0sbi5mcm9tU2NhbGluZz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNV09blsxXSx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMF09blsyXSx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH0sbi5mcm9tUm90YXRpb249ZnVuY3Rpb24odCxuLHIpe3ZhciBlPXJbMF0sdT1yWzFdLG89clsyXSxpPU1hdGguc3FydChlKmUrdSp1K28qbykscz12b2lkIDAsYz12b2lkIDAsZj12b2lkIDA7aWYoaTxhLkVQU0lMT04pcmV0dXJuIG51bGw7cmV0dXJuIGUqPWk9MS9pLHUqPWksbyo9aSxzPU1hdGguc2luKG4pLGM9TWF0aC5jb3MobiksZj0xLWMsdFswXT1lKmUqZitjLHRbMV09dSplKmYrbypzLHRbMl09byplKmYtdSpzLHRbM109MCx0WzRdPWUqdSpmLW8qcyx0WzVdPXUqdSpmK2MsdFs2XT1vKnUqZitlKnMsdFs3XT0wLHRbOF09ZSpvKmYrdSpzLHRbOV09dSpvKmYtZSpzLHRbMTBdPW8qbypmK2MsdFsxMV09MCx0WzEyXT0wLHRbMTNdPTAsdFsxNF09MCx0WzE1XT0xLHR9LG4uZnJvbVhSb3RhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPU1hdGguc2luKG4pLGE9TWF0aC5jb3Mobik7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT1hLHRbNl09cix0WzddPTAsdFs4XT0wLHRbOV09LXIsdFsxMF09YSx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH0sbi5mcm9tWVJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7dmFyIHI9TWF0aC5zaW4obiksYT1NYXRoLmNvcyhuKTtyZXR1cm4gdFswXT1hLHRbMV09MCx0WzJdPS1yLHRbM109MCx0WzRdPTAsdFs1XT0xLHRbNl09MCx0WzddPTAsdFs4XT1yLHRbOV09MCx0WzEwXT1hLHRbMTFdPTAsdFsxMl09MCx0WzEzXT0wLHRbMTRdPTAsdFsxNV09MSx0fSxuLmZyb21aUm90YXRpb249ZnVuY3Rpb24odCxuKXt2YXIgcj1NYXRoLnNpbihuKSxhPU1hdGguY29zKG4pO3JldHVybiB0WzBdPWEsdFsxXT1yLHRbMl09MCx0WzNdPTAsdFs0XT0tcix0WzVdPWEsdFs2XT0wLHRbN109MCx0WzhdPTAsdFs5XT0wLHRbMTBdPTEsdFsxMV09MCx0WzEyXT0wLHRbMTNdPTAsdFsxNF09MCx0WzE1XT0xLHR9LG4uZnJvbVJvdGF0aW9uVHJhbnNsYXRpb249byxuLmZyb21RdWF0Mj1mdW5jdGlvbih0LG4pe3ZhciByPW5ldyBhLkFSUkFZX1RZUEUoMyksZT0tblswXSx1PS1uWzFdLGk9LW5bMl0scz1uWzNdLGM9bls0XSxmPW5bNV0sTT1uWzZdLGg9bls3XSxsPWUqZSt1KnUraSppK3MqcztsPjA/KHJbMF09MiooYypzK2gqZStmKmktTSp1KS9sLHJbMV09MiooZipzK2gqdStNKmUtYyppKS9sLHJbMl09MiooTSpzK2gqaStjKnUtZiplKS9sKTooclswXT0yKihjKnMraCplK2YqaS1NKnUpLHJbMV09MiooZipzK2gqdStNKmUtYyppKSxyWzJdPTIqKE0qcytoKmkrYyp1LWYqZSkpO3JldHVybiBvKHQsbixyKSx0fSxuLmdldFRyYW5zbGF0aW9uPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blsxMl0sdFsxXT1uWzEzXSx0WzJdPW5bMTRdLHR9LG4uZ2V0U2NhbGluZz1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bNF0sbz1uWzVdLGk9bls2XSxzPW5bOF0sYz1uWzldLGY9blsxMF07cmV0dXJuIHRbMF09TWF0aC5zcXJ0KHIqcithKmErZSplKSx0WzFdPU1hdGguc3FydCh1KnUrbypvK2kqaSksdFsyXT1NYXRoLnNxcnQocypzK2MqYytmKmYpLHR9LG4uZ2V0Um90YXRpb249ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdK25bNV0rblsxMF0sYT0wO3I+MD8oYT0yKk1hdGguc3FydChyKzEpLHRbM109LjI1KmEsdFswXT0obls2XS1uWzldKS9hLHRbMV09KG5bOF0tblsyXSkvYSx0WzJdPShuWzFdLW5bNF0pL2EpOm5bMF0+bls1XSYmblswXT5uWzEwXT8oYT0yKk1hdGguc3FydCgxK25bMF0tbls1XS1uWzEwXSksdFszXT0obls2XS1uWzldKS9hLHRbMF09LjI1KmEsdFsxXT0oblsxXStuWzRdKS9hLHRbMl09KG5bOF0rblsyXSkvYSk6bls1XT5uWzEwXT8oYT0yKk1hdGguc3FydCgxK25bNV0tblswXS1uWzEwXSksdFszXT0obls4XS1uWzJdKS9hLHRbMF09KG5bMV0rbls0XSkvYSx0WzFdPS4yNSphLHRbMl09KG5bNl0rbls5XSkvYSk6KGE9MipNYXRoLnNxcnQoMStuWzEwXS1uWzBdLW5bNV0pLHRbM109KG5bMV0tbls0XSkvYSx0WzBdPShuWzhdK25bMl0pL2EsdFsxXT0obls2XStuWzldKS9hLHRbMl09LjI1KmEpO3JldHVybiB0fSxuLmZyb21Sb3RhdGlvblRyYW5zbGF0aW9uU2NhbGU9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXSx1PW5bMV0sbz1uWzJdLGk9blszXSxzPWUrZSxjPXUrdSxmPW8rbyxNPWUqcyxoPWUqYyxsPWUqZix2PXUqYyxkPXUqZixiPW8qZixtPWkqcyxwPWkqYyxQPWkqZixBPWFbMF0sRT1hWzFdLE89YVsyXTtyZXR1cm4gdFswXT0oMS0oditiKSkqQSx0WzFdPShoK1ApKkEsdFsyXT0obC1wKSpBLHRbM109MCx0WzRdPShoLVApKkUsdFs1XT0oMS0oTStiKSkqRSx0WzZdPShkK20pKkUsdFs3XT0wLHRbOF09KGwrcCkqTyx0WzldPShkLW0pKk8sdFsxMF09KDEtKE0rdikpKk8sdFsxMV09MCx0WzEyXT1yWzBdLHRbMTNdPXJbMV0sdFsxNF09clsyXSx0WzE1XT0xLHR9LG4uZnJvbVJvdGF0aW9uVHJhbnNsYXRpb25TY2FsZU9yaWdpbj1mdW5jdGlvbih0LG4scixhLGUpe3ZhciB1PW5bMF0sbz1uWzFdLGk9blsyXSxzPW5bM10sYz11K3UsZj1vK28sTT1pK2ksaD11KmMsbD11KmYsdj11Kk0sZD1vKmYsYj1vKk0sbT1pKk0scD1zKmMsUD1zKmYsQT1zKk0sRT1hWzBdLE89YVsxXSxSPWFbMl0seT1lWzBdLHE9ZVsxXSx4PWVbMl0sXz0oMS0oZCttKSkqRSxZPShsK0EpKkUsTD0odi1QKSpFLFM9KGwtQSkqTyx3PSgxLShoK20pKSpPLEk9KGIrcCkqTyxOPSh2K1ApKlIsZz0oYi1wKSpSLFQ9KDEtKGgrZCkpKlI7cmV0dXJuIHRbMF09Xyx0WzFdPVksdFsyXT1MLHRbM109MCx0WzRdPVMsdFs1XT13LHRbNl09SSx0WzddPTAsdFs4XT1OLHRbOV09Zyx0WzEwXT1ULHRbMTFdPTAsdFsxMl09clswXSt5LShfKnkrUypxK04qeCksdFsxM109clsxXStxLShZKnkrdypxK2cqeCksdFsxNF09clsyXSt4LShMKnkrSSpxK1QqeCksdFsxNV09MSx0fSxuLmZyb21RdWF0PWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPXIrcixpPWErYSxzPWUrZSxjPXIqbyxmPWEqbyxNPWEqaSxoPWUqbyxsPWUqaSx2PWUqcyxkPXUqbyxiPXUqaSxtPXUqcztyZXR1cm4gdFswXT0xLU0tdix0WzFdPWYrbSx0WzJdPWgtYix0WzNdPTAsdFs0XT1mLW0sdFs1XT0xLWMtdix0WzZdPWwrZCx0WzddPTAsdFs4XT1oK2IsdFs5XT1sLWQsdFsxMF09MS1jLU0sdFsxMV09MCx0WzEyXT0wLHRbMTNdPTAsdFsxNF09MCx0WzE1XT0xLHR9LG4uZnJ1c3R1bT1mdW5jdGlvbih0LG4scixhLGUsdSxvKXt2YXIgaT0xLyhyLW4pLHM9MS8oZS1hKSxjPTEvKHUtbyk7cmV0dXJuIHRbMF09Mip1KmksdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNV09Mip1KnMsdFs2XT0wLHRbN109MCx0WzhdPShyK24pKmksdFs5XT0oZSthKSpzLHRbMTBdPShvK3UpKmMsdFsxMV09LTEsdFsxMl09MCx0WzEzXT0wLHRbMTRdPW8qdSoyKmMsdFsxNV09MCx0fSxuLnBlcnNwZWN0aXZlPWZ1bmN0aW9uKHQsbixyLGEsZSl7dmFyIHU9MS9NYXRoLnRhbihuLzIpLG89dm9pZCAwO3RbMF09dS9yLHRbMV09MCx0WzJdPTAsdFszXT0wLHRbNF09MCx0WzVdPXUsdFs2XT0wLHRbN109MCx0WzhdPTAsdFs5XT0wLHRbMTFdPS0xLHRbMTJdPTAsdFsxM109MCx0WzE1XT0wLG51bGwhPWUmJmUhPT0xLzA/KG89MS8oYS1lKSx0WzEwXT0oZSthKSpvLHRbMTRdPTIqZSphKm8pOih0WzEwXT0tMSx0WzE0XT0tMiphKTtyZXR1cm4gdH0sbi5wZXJzcGVjdGl2ZUZyb21GaWVsZE9mVmlldz1mdW5jdGlvbih0LG4scixhKXt2YXIgZT1NYXRoLnRhbihuLnVwRGVncmVlcypNYXRoLlBJLzE4MCksdT1NYXRoLnRhbihuLmRvd25EZWdyZWVzKk1hdGguUEkvMTgwKSxvPU1hdGgudGFuKG4ubGVmdERlZ3JlZXMqTWF0aC5QSS8xODApLGk9TWF0aC50YW4obi5yaWdodERlZ3JlZXMqTWF0aC5QSS8xODApLHM9Mi8obytpKSxjPTIvKGUrdSk7cmV0dXJuIHRbMF09cyx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT1jLHRbNl09MCx0WzddPTAsdFs4XT0tKG8taSkqcyouNSx0WzldPShlLXUpKmMqLjUsdFsxMF09YS8oci1hKSx0WzExXT0tMSx0WzEyXT0wLHRbMTNdPTAsdFsxNF09YSpyLyhyLWEpLHRbMTVdPTAsdH0sbi5vcnRobz1mdW5jdGlvbih0LG4scixhLGUsdSxvKXt2YXIgaT0xLyhuLXIpLHM9MS8oYS1lKSxjPTEvKHUtbyk7cmV0dXJuIHRbMF09LTIqaSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPTAsdFs1XT0tMipzLHRbNl09MCx0WzddPTAsdFs4XT0wLHRbOV09MCx0WzEwXT0yKmMsdFsxMV09MCx0WzEyXT0obityKSppLHRbMTNdPShlK2EpKnMsdFsxNF09KG8rdSkqYyx0WzE1XT0xLHR9LG4ubG9va0F0PWZ1bmN0aW9uKHQsbixyLHUpe3ZhciBvPXZvaWQgMCxpPXZvaWQgMCxzPXZvaWQgMCxjPXZvaWQgMCxmPXZvaWQgMCxNPXZvaWQgMCxoPXZvaWQgMCxsPXZvaWQgMCx2PXZvaWQgMCxkPXZvaWQgMCxiPW5bMF0sbT1uWzFdLHA9blsyXSxQPXVbMF0sQT11WzFdLEU9dVsyXSxPPXJbMF0sUj1yWzFdLHk9clsyXTtpZihNYXRoLmFicyhiLU8pPGEuRVBTSUxPTiYmTWF0aC5hYnMobS1SKTxhLkVQU0lMT04mJk1hdGguYWJzKHAteSk8YS5FUFNJTE9OKXJldHVybiBlKHQpO2g9Yi1PLGw9bS1SLHY9cC15LGQ9MS9NYXRoLnNxcnQoaCpoK2wqbCt2KnYpLG89QSoodio9ZCktRSoobCo9ZCksaT1FKihoKj1kKS1QKnYscz1QKmwtQSpoLChkPU1hdGguc3FydChvKm8raSppK3MqcykpPyhvKj1kPTEvZCxpKj1kLHMqPWQpOihvPTAsaT0wLHM9MCk7Yz1sKnMtdippLGY9dipvLWgqcyxNPWgqaS1sKm8sKGQ9TWF0aC5zcXJ0KGMqYytmKmYrTSpNKSk/KGMqPWQ9MS9kLGYqPWQsTSo9ZCk6KGM9MCxmPTAsTT0wKTtyZXR1cm4gdFswXT1vLHRbMV09Yyx0WzJdPWgsdFszXT0wLHRbNF09aSx0WzVdPWYsdFs2XT1sLHRbN109MCx0WzhdPXMsdFs5XT1NLHRbMTBdPXYsdFsxMV09MCx0WzEyXT0tKG8qYitpKm0rcypwKSx0WzEzXT0tKGMqYitmKm0rTSpwKSx0WzE0XT0tKGgqYitsKm0rdipwKSx0WzE1XT0xLHR9LG4udGFyZ2V0VG89ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXSx1PW5bMV0sbz1uWzJdLGk9YVswXSxzPWFbMV0sYz1hWzJdLGY9ZS1yWzBdLE09dS1yWzFdLGg9by1yWzJdLGw9ZipmK00qTStoKmg7bD4wJiYobD0xL01hdGguc3FydChsKSxmKj1sLE0qPWwsaCo9bCk7dmFyIHY9cypoLWMqTSxkPWMqZi1pKmgsYj1pKk0tcypmOyhsPXYqditkKmQrYipiKT4wJiYobD0xL01hdGguc3FydChsKSx2Kj1sLGQqPWwsYio9bCk7cmV0dXJuIHRbMF09dix0WzFdPWQsdFsyXT1iLHRbM109MCx0WzRdPU0qYi1oKmQsdFs1XT1oKnYtZipiLHRbNl09ZipkLU0qdix0WzddPTAsdFs4XT1mLHRbOV09TSx0WzEwXT1oLHRbMTFdPTAsdFsxMl09ZSx0WzEzXT11LHRbMTRdPW8sdFsxNV09MSx0fSxuLnN0cj1mdW5jdGlvbih0KXtyZXR1cm5cIm1hdDQoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIiwgXCIrdFs0XStcIiwgXCIrdFs1XStcIiwgXCIrdFs2XStcIiwgXCIrdFs3XStcIiwgXCIrdFs4XStcIiwgXCIrdFs5XStcIiwgXCIrdFsxMF0rXCIsIFwiK3RbMTFdK1wiLCBcIit0WzEyXStcIiwgXCIrdFsxM10rXCIsIFwiK3RbMTRdK1wiLCBcIit0WzE1XStcIilcIn0sbi5mcm9iPWZ1bmN0aW9uKHQpe3JldHVybiBNYXRoLnNxcnQoTWF0aC5wb3codFswXSwyKStNYXRoLnBvdyh0WzFdLDIpK01hdGgucG93KHRbMl0sMikrTWF0aC5wb3codFszXSwyKStNYXRoLnBvdyh0WzRdLDIpK01hdGgucG93KHRbNV0sMikrTWF0aC5wb3codFs2XSwyKStNYXRoLnBvdyh0WzddLDIpK01hdGgucG93KHRbOF0sMikrTWF0aC5wb3codFs5XSwyKStNYXRoLnBvdyh0WzEwXSwyKStNYXRoLnBvdyh0WzExXSwyKStNYXRoLnBvdyh0WzEyXSwyKStNYXRoLnBvdyh0WzEzXSwyKStNYXRoLnBvdyh0WzE0XSwyKStNYXRoLnBvdyh0WzE1XSwyKSl9LG4uYWRkPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0sdFsxXT1uWzFdK3JbMV0sdFsyXT1uWzJdK3JbMl0sdFszXT1uWzNdK3JbM10sdFs0XT1uWzRdK3JbNF0sdFs1XT1uWzVdK3JbNV0sdFs2XT1uWzZdK3JbNl0sdFs3XT1uWzddK3JbN10sdFs4XT1uWzhdK3JbOF0sdFs5XT1uWzldK3JbOV0sdFsxMF09blsxMF0rclsxMF0sdFsxMV09blsxMV0rclsxMV0sdFsxMl09blsxMl0rclsxMl0sdFsxM109blsxM10rclsxM10sdFsxNF09blsxNF0rclsxNF0sdFsxNV09blsxNV0rclsxNV0sdH0sbi5zdWJ0cmFjdD1pLG4ubXVsdGlwbHlTY2FsYXI9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qcix0WzFdPW5bMV0qcix0WzJdPW5bMl0qcix0WzNdPW5bM10qcix0WzRdPW5bNF0qcix0WzVdPW5bNV0qcix0WzZdPW5bNl0qcix0WzddPW5bN10qcix0WzhdPW5bOF0qcix0WzldPW5bOV0qcix0WzEwXT1uWzEwXSpyLHRbMTFdPW5bMTFdKnIsdFsxMl09blsxMl0qcix0WzEzXT1uWzEzXSpyLHRbMTRdPW5bMTRdKnIsdFsxNV09blsxNV0qcix0fSxuLm11bHRpcGx5U2NhbGFyQW5kQWRkPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW5bMF0rclswXSphLHRbMV09blsxXStyWzFdKmEsdFsyXT1uWzJdK3JbMl0qYSx0WzNdPW5bM10rclszXSphLHRbNF09bls0XStyWzRdKmEsdFs1XT1uWzVdK3JbNV0qYSx0WzZdPW5bNl0rcls2XSphLHRbN109bls3XStyWzddKmEsdFs4XT1uWzhdK3JbOF0qYSx0WzldPW5bOV0rcls5XSphLHRbMTBdPW5bMTBdK3JbMTBdKmEsdFsxMV09blsxMV0rclsxMV0qYSx0WzEyXT1uWzEyXStyWzEyXSphLHRbMTNdPW5bMTNdK3JbMTNdKmEsdFsxNF09blsxNF0rclsxNF0qYSx0WzE1XT1uWzE1XStyWzE1XSphLHR9LG4uZXhhY3RFcXVhbHM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT09PW5bMF0mJnRbMV09PT1uWzFdJiZ0WzJdPT09blsyXSYmdFszXT09PW5bM10mJnRbNF09PT1uWzRdJiZ0WzVdPT09bls1XSYmdFs2XT09PW5bNl0mJnRbN109PT1uWzddJiZ0WzhdPT09bls4XSYmdFs5XT09PW5bOV0mJnRbMTBdPT09blsxMF0mJnRbMTFdPT09blsxMV0mJnRbMTJdPT09blsxMl0mJnRbMTNdPT09blsxM10mJnRbMTRdPT09blsxNF0mJnRbMTVdPT09blsxNV19LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89dFszXSxpPXRbNF0scz10WzVdLGM9dFs2XSxmPXRbN10sTT10WzhdLGg9dFs5XSxsPXRbMTBdLHY9dFsxMV0sZD10WzEyXSxiPXRbMTNdLG09dFsxNF0scD10WzE1XSxQPW5bMF0sQT1uWzFdLEU9blsyXSxPPW5bM10sUj1uWzRdLHk9bls1XSxxPW5bNl0seD1uWzddLF89bls4XSxZPW5bOV0sTD1uWzEwXSxTPW5bMTFdLHc9blsxMl0sST1uWzEzXSxOPW5bMTRdLGc9blsxNV07cmV0dXJuIE1hdGguYWJzKHItUCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHIpLE1hdGguYWJzKFApKSYmTWF0aC5hYnMoZS1BKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZSksTWF0aC5hYnMoQSkpJiZNYXRoLmFicyh1LUUpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyh1KSxNYXRoLmFicyhFKSkmJk1hdGguYWJzKG8tTyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKG8pLE1hdGguYWJzKE8pKSYmTWF0aC5hYnMoaS1SKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoaSksTWF0aC5hYnMoUikpJiZNYXRoLmFicyhzLXkpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhzKSxNYXRoLmFicyh5KSkmJk1hdGguYWJzKGMtcSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGMpLE1hdGguYWJzKHEpKSYmTWF0aC5hYnMoZi14KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZiksTWF0aC5hYnMoeCkpJiZNYXRoLmFicyhNLV8pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhNKSxNYXRoLmFicyhfKSkmJk1hdGguYWJzKGgtWSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGgpLE1hdGguYWJzKFkpKSYmTWF0aC5hYnMobC1MKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMobCksTWF0aC5hYnMoTCkpJiZNYXRoLmFicyh2LVMpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyh2KSxNYXRoLmFicyhTKSkmJk1hdGguYWJzKGQtdyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGQpLE1hdGguYWJzKHcpKSYmTWF0aC5hYnMoYi1JKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoYiksTWF0aC5hYnMoSSkpJiZNYXRoLmFicyhtLU4pPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhtKSxNYXRoLmFicyhOKSkmJk1hdGguYWJzKHAtZyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHApLE1hdGguYWJzKGcpKX07dmFyIGE9ZnVuY3Rpb24odCl7aWYodCYmdC5fX2VzTW9kdWxlKXJldHVybiB0O3ZhciBuPXt9O2lmKG51bGwhPXQpZm9yKHZhciByIGluIHQpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQscikmJihuW3JdPXRbcl0pO3JldHVybiBuLmRlZmF1bHQ9dCxufShyKDApKTtmdW5jdGlvbiBlKHQpe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0wLHRbNV09MSx0WzZdPTAsdFs3XT0wLHRbOF09MCx0WzldPTAsdFsxMF09MSx0WzExXT0wLHRbMTJdPTAsdFsxM109MCx0WzE0XT0wLHRbMTVdPTEsdH1mdW5jdGlvbiB1KHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1uWzZdLGY9bls3XSxNPW5bOF0saD1uWzldLGw9blsxMF0sdj1uWzExXSxkPW5bMTJdLGI9blsxM10sbT1uWzE0XSxwPW5bMTVdLFA9clswXSxBPXJbMV0sRT1yWzJdLE89clszXTtyZXR1cm4gdFswXT1QKmErQSppK0UqTStPKmQsdFsxXT1QKmUrQSpzK0UqaCtPKmIsdFsyXT1QKnUrQSpjK0UqbCtPKm0sdFszXT1QKm8rQSpmK0UqditPKnAsUD1yWzRdLEE9cls1XSxFPXJbNl0sTz1yWzddLHRbNF09UCphK0EqaStFKk0rTypkLHRbNV09UCplK0EqcytFKmgrTypiLHRbNl09UCp1K0EqYytFKmwrTyptLHRbN109UCpvK0EqZitFKnYrTypwLFA9cls4XSxBPXJbOV0sRT1yWzEwXSxPPXJbMTFdLHRbOF09UCphK0EqaStFKk0rTypkLHRbOV09UCplK0EqcytFKmgrTypiLHRbMTBdPVAqdStBKmMrRSpsK08qbSx0WzExXT1QKm8rQSpmK0UqditPKnAsUD1yWzEyXSxBPXJbMTNdLEU9clsxNF0sTz1yWzE1XSx0WzEyXT1QKmErQSppK0UqTStPKmQsdFsxM109UCplK0EqcytFKmgrTypiLHRbMTRdPVAqdStBKmMrRSpsK08qbSx0WzE1XT1QKm8rQSpmK0UqditPKnAsdH1mdW5jdGlvbiBvKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9YSthLHM9ZStlLGM9dSt1LGY9YSppLE09YSpzLGg9YSpjLGw9ZSpzLHY9ZSpjLGQ9dSpjLGI9byppLG09bypzLHA9bypjO3JldHVybiB0WzBdPTEtKGwrZCksdFsxXT1NK3AsdFsyXT1oLW0sdFszXT0wLHRbNF09TS1wLHRbNV09MS0oZitkKSx0WzZdPXYrYix0WzddPTAsdFs4XT1oK20sdFs5XT12LWIsdFsxMF09MS0oZitsKSx0WzExXT0wLHRbMTJdPXJbMF0sdFsxM109clsxXSx0WzE0XT1yWzJdLHRbMTVdPTEsdH1mdW5jdGlvbiBpKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdFsyXT1uWzJdLXJbMl0sdFszXT1uWzNdLXJbM10sdFs0XT1uWzRdLXJbNF0sdFs1XT1uWzVdLXJbNV0sdFs2XT1uWzZdLXJbNl0sdFs3XT1uWzddLXJbN10sdFs4XT1uWzhdLXJbOF0sdFs5XT1uWzldLXJbOV0sdFsxMF09blsxMF0tclsxMF0sdFsxMV09blsxMV0tclsxMV0sdFsxMl09blsxMl0tclsxMl0sdFsxM109blsxM10tclsxM10sdFsxNF09blsxNF0tclsxNF0sdFsxNV09blsxNV0tclsxNV0sdH1uLm11bD11LG4uc3ViPWl9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnN1Yj1uLm11bD12b2lkIDAsbi5jcmVhdGU9ZnVuY3Rpb24oKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDkpO2EuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFsxXT0wLHRbMl09MCx0WzNdPTAsdFs1XT0wLHRbNl09MCx0WzddPTApO3JldHVybiB0WzBdPTEsdFs0XT0xLHRbOF09MSx0fSxuLmZyb21NYXQ0PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109bls0XSx0WzRdPW5bNV0sdFs1XT1uWzZdLHRbNl09bls4XSx0WzddPW5bOV0sdFs4XT1uWzEwXSx0fSxuLmNsb25lPWZ1bmN0aW9uKHQpe3ZhciBuPW5ldyBhLkFSUkFZX1RZUEUoOSk7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sblsyXT10WzJdLG5bM109dFszXSxuWzRdPXRbNF0sbls1XT10WzVdLG5bNl09dFs2XSxuWzddPXRbN10sbls4XT10WzhdLG59LG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdFs0XT1uWzRdLHRbNV09bls1XSx0WzZdPW5bNl0sdFs3XT1uWzddLHRbOF09bls4XSx0fSxuLmZyb21WYWx1ZXM9ZnVuY3Rpb24odCxuLHIsZSx1LG8saSxzLGMpe3ZhciBmPW5ldyBhLkFSUkFZX1RZUEUoOSk7cmV0dXJuIGZbMF09dCxmWzFdPW4sZlsyXT1yLGZbM109ZSxmWzRdPXUsZls1XT1vLGZbNl09aSxmWzddPXMsZls4XT1jLGZ9LG4uc2V0PWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8saSxzLGMpe3JldHVybiB0WzBdPW4sdFsxXT1yLHRbMl09YSx0WzNdPWUsdFs0XT11LHRbNV09byx0WzZdPWksdFs3XT1zLHRbOF09Yyx0fSxuLmlkZW50aXR5PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0xLHRbNV09MCx0WzZdPTAsdFs3XT0wLHRbOF09MSx0fSxuLnRyYW5zcG9zZT1mdW5jdGlvbih0LG4pe2lmKHQ9PT1uKXt2YXIgcj1uWzFdLGE9blsyXSxlPW5bNV07dFsxXT1uWzNdLHRbMl09bls2XSx0WzNdPXIsdFs1XT1uWzddLHRbNl09YSx0WzddPWV9ZWxzZSB0WzBdPW5bMF0sdFsxXT1uWzNdLHRbMl09bls2XSx0WzNdPW5bMV0sdFs0XT1uWzRdLHRbNV09bls3XSx0WzZdPW5bMl0sdFs3XT1uWzVdLHRbOF09bls4XTtyZXR1cm4gdH0sbi5pbnZlcnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89bls0XSxpPW5bNV0scz1uWzZdLGM9bls3XSxmPW5bOF0sTT1mKm8taSpjLGg9LWYqdStpKnMsbD1jKnUtbypzLHY9cipNK2EqaCtlKmw7aWYoIXYpcmV0dXJuIG51bGw7cmV0dXJuIHY9MS92LHRbMF09TSp2LHRbMV09KC1mKmErZSpjKSp2LHRbMl09KGkqYS1lKm8pKnYsdFszXT1oKnYsdFs0XT0oZipyLWUqcykqdix0WzVdPSgtaSpyK2UqdSkqdix0WzZdPWwqdix0WzddPSgtYypyK2Eqcykqdix0WzhdPShvKnItYSp1KSp2LHR9LG4uYWRqb2ludD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1uWzRdLGk9bls1XSxzPW5bNl0sYz1uWzddLGY9bls4XTtyZXR1cm4gdFswXT1vKmYtaSpjLHRbMV09ZSpjLWEqZix0WzJdPWEqaS1lKm8sdFszXT1pKnMtdSpmLHRbNF09cipmLWUqcyx0WzVdPWUqdS1yKmksdFs2XT11KmMtbypzLHRbN109YSpzLXIqYyx0WzhdPXIqby1hKnUsdH0sbi5kZXRlcm1pbmFudD1mdW5jdGlvbih0KXt2YXIgbj10WzBdLHI9dFsxXSxhPXRbMl0sZT10WzNdLHU9dFs0XSxvPXRbNV0saT10WzZdLHM9dFs3XSxjPXRbOF07cmV0dXJuIG4qKGMqdS1vKnMpK3IqKC1jKmUrbyppKSthKihzKmUtdSppKX0sbi5tdWx0aXBseT1lLG4udHJhbnNsYXRlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1uWzZdLGY9bls3XSxNPW5bOF0saD1yWzBdLGw9clsxXTtyZXR1cm4gdFswXT1hLHRbMV09ZSx0WzJdPXUsdFszXT1vLHRbNF09aSx0WzVdPXMsdFs2XT1oKmErbCpvK2MsdFs3XT1oKmUrbCppK2YsdFs4XT1oKnUrbCpzK00sdH0sbi5yb3RhdGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPW5bNl0sZj1uWzddLE09bls4XSxoPU1hdGguc2luKHIpLGw9TWF0aC5jb3Mocik7cmV0dXJuIHRbMF09bCphK2gqbyx0WzFdPWwqZStoKmksdFsyXT1sKnUraCpzLHRbM109bCpvLWgqYSx0WzRdPWwqaS1oKmUsdFs1XT1sKnMtaCp1LHRbNl09Yyx0WzddPWYsdFs4XT1NLHR9LG4uc2NhbGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPXJbMF0sZT1yWzFdO3JldHVybiB0WzBdPWEqblswXSx0WzFdPWEqblsxXSx0WzJdPWEqblsyXSx0WzNdPWUqblszXSx0WzRdPWUqbls0XSx0WzVdPWUqbls1XSx0WzZdPW5bNl0sdFs3XT1uWzddLHRbOF09bls4XSx0fSxuLmZyb21UcmFuc2xhdGlvbj1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTAsdFs0XT0xLHRbNV09MCx0WzZdPW5bMF0sdFs3XT1uWzFdLHRbOF09MSx0fSxuLmZyb21Sb3RhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPU1hdGguc2luKG4pLGE9TWF0aC5jb3Mobik7cmV0dXJuIHRbMF09YSx0WzFdPXIsdFsyXT0wLHRbM109LXIsdFs0XT1hLHRbNV09MCx0WzZdPTAsdFs3XT0wLHRbOF09MSx0fSxuLmZyb21TY2FsaW5nPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPW5bMV0sdFs1XT0wLHRbNl09MCx0WzddPTAsdFs4XT0xLHR9LG4uZnJvbU1hdDJkPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT0wLHRbM109blsyXSx0WzRdPW5bM10sdFs1XT0wLHRbNl09bls0XSx0WzddPW5bNV0sdFs4XT0xLHR9LG4uZnJvbVF1YXQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89cityLGk9YSthLHM9ZStlLGM9cipvLGY9YSpvLE09YSppLGg9ZSpvLGw9ZSppLHY9ZSpzLGQ9dSpvLGI9dSppLG09dSpzO3JldHVybiB0WzBdPTEtTS12LHRbM109Zi1tLHRbNl09aCtiLHRbMV09ZittLHRbNF09MS1jLXYsdFs3XT1sLWQsdFsyXT1oLWIsdFs1XT1sK2QsdFs4XT0xLWMtTSx0fSxuLm5vcm1hbEZyb21NYXQ0PWZ1bmN0aW9uKHQsbil7dmFyIHI9blswXSxhPW5bMV0sZT1uWzJdLHU9blszXSxvPW5bNF0saT1uWzVdLHM9bls2XSxjPW5bN10sZj1uWzhdLE09bls5XSxoPW5bMTBdLGw9blsxMV0sdj1uWzEyXSxkPW5bMTNdLGI9blsxNF0sbT1uWzE1XSxwPXIqaS1hKm8sUD1yKnMtZSpvLEE9cipjLXUqbyxFPWEqcy1lKmksTz1hKmMtdSppLFI9ZSpjLXUqcyx5PWYqZC1NKnYscT1mKmItaCp2LHg9ZiptLWwqdixfPU0qYi1oKmQsWT1NKm0tbCpkLEw9aCptLWwqYixTPXAqTC1QKlkrQSpfK0UqeC1PKnErUip5O2lmKCFTKXJldHVybiBudWxsO3JldHVybiBTPTEvUyx0WzBdPShpKkwtcypZK2MqXykqUyx0WzFdPShzKngtbypMLWMqcSkqUyx0WzJdPShvKlktaSp4K2MqeSkqUyx0WzNdPShlKlktYSpMLXUqXykqUyx0WzRdPShyKkwtZSp4K3UqcSkqUyx0WzVdPShhKngtcipZLXUqeSkqUyx0WzZdPShkKlItYipPK20qRSkqUyx0WzddPShiKkEtdipSLW0qUCkqUyx0WzhdPSh2Kk8tZCpBK20qcCkqUyx0fSxuLnByb2plY3Rpb249ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPTIvbix0WzFdPTAsdFsyXT0wLHRbM109MCx0WzRdPS0yL3IsdFs1XT0wLHRbNl09LTEsdFs3XT0xLHRbOF09MSx0fSxuLnN0cj1mdW5jdGlvbih0KXtyZXR1cm5cIm1hdDMoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIiwgXCIrdFs0XStcIiwgXCIrdFs1XStcIiwgXCIrdFs2XStcIiwgXCIrdFs3XStcIiwgXCIrdFs4XStcIilcIn0sbi5mcm9iPWZ1bmN0aW9uKHQpe3JldHVybiBNYXRoLnNxcnQoTWF0aC5wb3codFswXSwyKStNYXRoLnBvdyh0WzFdLDIpK01hdGgucG93KHRbMl0sMikrTWF0aC5wb3codFszXSwyKStNYXRoLnBvdyh0WzRdLDIpK01hdGgucG93KHRbNV0sMikrTWF0aC5wb3codFs2XSwyKStNYXRoLnBvdyh0WzddLDIpK01hdGgucG93KHRbOF0sMikpfSxuLmFkZD1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXStyWzBdLHRbMV09blsxXStyWzFdLHRbMl09blsyXStyWzJdLHRbM109blszXStyWzNdLHRbNF09bls0XStyWzRdLHRbNV09bls1XStyWzVdLHRbNl09bls2XStyWzZdLHRbN109bls3XStyWzddLHRbOF09bls4XStyWzhdLHR9LG4uc3VidHJhY3Q9dSxuLm11bHRpcGx5U2NhbGFyPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdFsyXT1uWzJdKnIsdFszXT1uWzNdKnIsdFs0XT1uWzRdKnIsdFs1XT1uWzVdKnIsdFs2XT1uWzZdKnIsdFs3XT1uWzddKnIsdFs4XT1uWzhdKnIsdH0sbi5tdWx0aXBseVNjYWxhckFuZEFkZD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0qYSx0WzFdPW5bMV0rclsxXSphLHRbMl09blsyXStyWzJdKmEsdFszXT1uWzNdK3JbM10qYSx0WzRdPW5bNF0rcls0XSphLHRbNV09bls1XStyWzVdKmEsdFs2XT1uWzZdK3JbNl0qYSx0WzddPW5bN10rcls3XSphLHRbOF09bls4XStyWzhdKmEsdH0sbi5leGFjdEVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPT09blswXSYmdFsxXT09PW5bMV0mJnRbMl09PT1uWzJdJiZ0WzNdPT09blszXSYmdFs0XT09PW5bNF0mJnRbNV09PT1uWzVdJiZ0WzZdPT09bls2XSYmdFs3XT09PW5bN10mJnRbOF09PT1uWzhdfSxuLmVxdWFscz1mdW5jdGlvbih0LG4pe3ZhciByPXRbMF0sZT10WzFdLHU9dFsyXSxvPXRbM10saT10WzRdLHM9dFs1XSxjPXRbNl0sZj10WzddLE09dFs4XSxoPW5bMF0sbD1uWzFdLHY9blsyXSxkPW5bM10sYj1uWzRdLG09bls1XSxwPW5bNl0sUD1uWzddLEE9bls4XTtyZXR1cm4gTWF0aC5hYnMoci1oKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMociksTWF0aC5hYnMoaCkpJiZNYXRoLmFicyhlLWwpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhlKSxNYXRoLmFicyhsKSkmJk1hdGguYWJzKHUtdik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHUpLE1hdGguYWJzKHYpKSYmTWF0aC5hYnMoby1kKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMobyksTWF0aC5hYnMoZCkpJiZNYXRoLmFicyhpLWIpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhpKSxNYXRoLmFicyhiKSkmJk1hdGguYWJzKHMtbSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHMpLE1hdGguYWJzKG0pKSYmTWF0aC5hYnMoYy1wKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoYyksTWF0aC5hYnMocCkpJiZNYXRoLmFicyhmLVApPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhmKSxNYXRoLmFicyhQKSkmJk1hdGguYWJzKE0tQSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKE0pLE1hdGguYWJzKEEpKX07dmFyIGE9ZnVuY3Rpb24odCl7aWYodCYmdC5fX2VzTW9kdWxlKXJldHVybiB0O3ZhciBuPXt9O2lmKG51bGwhPXQpZm9yKHZhciByIGluIHQpT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHQscikmJihuW3JdPXRbcl0pO3JldHVybiBuLmRlZmF1bHQ9dCxufShyKDApKTtmdW5jdGlvbiBlKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1uWzZdLGY9bls3XSxNPW5bOF0saD1yWzBdLGw9clsxXSx2PXJbMl0sZD1yWzNdLGI9cls0XSxtPXJbNV0scD1yWzZdLFA9cls3XSxBPXJbOF07cmV0dXJuIHRbMF09aCphK2wqbyt2KmMsdFsxXT1oKmUrbCppK3YqZix0WzJdPWgqdStsKnMrdipNLHRbM109ZCphK2IqbyttKmMsdFs0XT1kKmUrYippK20qZix0WzVdPWQqdStiKnMrbSpNLHRbNl09cCphK1AqbytBKmMsdFs3XT1wKmUrUCppK0EqZix0WzhdPXAqdStQKnMrQSpNLHR9ZnVuY3Rpb24gdSh0LG4scil7cmV0dXJuIHRbMF09blswXS1yWzBdLHRbMV09blsxXS1yWzFdLHRbMl09blsyXS1yWzJdLHRbM109blszXS1yWzNdLHRbNF09bls0XS1yWzRdLHRbNV09bls1XS1yWzVdLHRbNl09bls2XS1yWzZdLHRbN109bls3XS1yWzddLHRbOF09bls4XS1yWzhdLHR9bi5tdWw9ZSxuLnN1Yj11fSxmdW5jdGlvbih0LG4scil7XCJ1c2Ugc3RyaWN0XCI7T2JqZWN0LmRlZmluZVByb3BlcnR5KG4sXCJfX2VzTW9kdWxlXCIse3ZhbHVlOiEwfSksbi5mb3JFYWNoPW4uc3FyTGVuPW4uc3FyRGlzdD1uLmRpc3Q9bi5kaXY9bi5tdWw9bi5zdWI9bi5sZW49dm9pZCAwLG4uY3JlYXRlPWUsbi5jbG9uZT1mdW5jdGlvbih0KXt2YXIgbj1uZXcgYS5BUlJBWV9UWVBFKDIpO3JldHVybiBuWzBdPXRbMF0sblsxXT10WzFdLG59LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4pe3ZhciByPW5ldyBhLkFSUkFZX1RZUEUoMik7cmV0dXJuIHJbMF09dCxyWzFdPW4scn0sbi5jb3B5PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdH0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW4sdFsxXT1yLHR9LG4uYWRkPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0sdFsxXT1uWzFdK3JbMV0sdH0sbi5zdWJ0cmFjdD11LG4ubXVsdGlwbHk9byxuLmRpdmlkZT1pLG4uY2VpbD1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPU1hdGguY2VpbChuWzBdKSx0WzFdPU1hdGguY2VpbChuWzFdKSx0fSxuLmZsb29yPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5mbG9vcihuWzBdKSx0WzFdPU1hdGguZmxvb3IoblsxXSksdH0sbi5taW49ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPU1hdGgubWluKG5bMF0sclswXSksdFsxXT1NYXRoLm1pbihuWzFdLHJbMV0pLHR9LG4ubWF4PWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1NYXRoLm1heChuWzBdLHJbMF0pLHRbMV09TWF0aC5tYXgoblsxXSxyWzFdKSx0fSxuLnJvdW5kPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09TWF0aC5yb3VuZChuWzBdKSx0WzFdPU1hdGgucm91bmQoblsxXSksdH0sbi5zY2FsZT1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXSpyLHRbMV09blsxXSpyLHR9LG4uc2NhbGVBbmRBZGQ9ZnVuY3Rpb24odCxuLHIsYSl7cmV0dXJuIHRbMF09blswXStyWzBdKmEsdFsxXT1uWzFdK3JbMV0qYSx0fSxuLmRpc3RhbmNlPXMsbi5zcXVhcmVkRGlzdGFuY2U9YyxuLmxlbmd0aD1mLG4uc3F1YXJlZExlbmd0aD1NLG4ubmVnYXRlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09LW5bMF0sdFsxXT0tblsxXSx0fSxuLmludmVyc2U9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0xL25bMF0sdFsxXT0xL25bMV0sdH0sbi5ub3JtYWxpemU9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPXIqcithKmE7ZT4wJiYoZT0xL01hdGguc3FydChlKSx0WzBdPW5bMF0qZSx0WzFdPW5bMV0qZSk7cmV0dXJuIHR9LG4uZG90PWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF0qblswXSt0WzFdKm5bMV19LG4uY3Jvc3M9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0qclsxXS1uWzFdKnJbMF07cmV0dXJuIHRbMF09dFsxXT0wLHRbMl09YSx0fSxuLmxlcnA9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXSx1PW5bMV07cmV0dXJuIHRbMF09ZSthKihyWzBdLWUpLHRbMV09dSthKihyWzFdLXUpLHR9LG4ucmFuZG9tPWZ1bmN0aW9uKHQsbil7bj1ufHwxO3ZhciByPTIqYS5SQU5ET00oKSpNYXRoLlBJO3JldHVybiB0WzBdPU1hdGguY29zKHIpKm4sdFsxXT1NYXRoLnNpbihyKSpuLHR9LG4udHJhbnNmb3JtTWF0Mj1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV07cmV0dXJuIHRbMF09clswXSphK3JbMl0qZSx0WzFdPXJbMV0qYStyWzNdKmUsdH0sbi50cmFuc2Zvcm1NYXQyZD1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV07cmV0dXJuIHRbMF09clswXSphK3JbMl0qZStyWzRdLHRbMV09clsxXSphK3JbM10qZStyWzVdLHR9LG4udHJhbnNmb3JtTWF0Mz1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV07cmV0dXJuIHRbMF09clswXSphK3JbM10qZStyWzZdLHRbMV09clsxXSphK3JbNF0qZStyWzddLHR9LG4udHJhbnNmb3JtTWF0ND1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV07cmV0dXJuIHRbMF09clswXSphK3JbNF0qZStyWzEyXSx0WzFdPXJbMV0qYStyWzVdKmUrclsxM10sdH0sbi5yb3RhdGU9ZnVuY3Rpb24odCxuLHIsYSl7dmFyIGU9blswXS1yWzBdLHU9blsxXS1yWzFdLG89TWF0aC5zaW4oYSksaT1NYXRoLmNvcyhhKTtyZXR1cm4gdFswXT1lKmktdSpvK3JbMF0sdFsxXT1lKm8rdSppK3JbMV0sdH0sbi5hbmdsZT1mdW5jdGlvbih0LG4pe3ZhciByPXRbMF0sYT10WzFdLGU9blswXSx1PW5bMV0sbz1yKnIrYSphO28+MCYmKG89MS9NYXRoLnNxcnQobykpO3ZhciBpPWUqZSt1KnU7aT4wJiYoaT0xL01hdGguc3FydChpKSk7dmFyIHM9KHIqZSthKnUpKm8qaTtyZXR1cm4gcz4xPzA6czwtMT9NYXRoLlBJOk1hdGguYWNvcyhzKX0sbi5zdHI9ZnVuY3Rpb24odCl7cmV0dXJuXCJ2ZWMyKFwiK3RbMF0rXCIsIFwiK3RbMV0rXCIpXCJ9LG4uZXhhY3RFcXVhbHM9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT09PW5bMF0mJnRbMV09PT1uWzFdfSxuLmVxdWFscz1mdW5jdGlvbih0LG4pe3ZhciByPXRbMF0sZT10WzFdLHU9blswXSxvPW5bMV07cmV0dXJuIE1hdGguYWJzKHItdSk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHIpLE1hdGguYWJzKHUpKSYmTWF0aC5hYnMoZS1vKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoZSksTWF0aC5hYnMobykpfTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUoKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDIpO3JldHVybiBhLkFSUkFZX1RZUEUhPUZsb2F0MzJBcnJheSYmKHRbMF09MCx0WzFdPTApLHR9ZnVuY3Rpb24gdSh0LG4scil7cmV0dXJuIHRbMF09blswXS1yWzBdLHRbMV09blsxXS1yWzFdLHR9ZnVuY3Rpb24gbyh0LG4scil7cmV0dXJuIHRbMF09blswXSpyWzBdLHRbMV09blsxXSpyWzFdLHR9ZnVuY3Rpb24gaSh0LG4scil7cmV0dXJuIHRbMF09blswXS9yWzBdLHRbMV09blsxXS9yWzFdLHR9ZnVuY3Rpb24gcyh0LG4pe3ZhciByPW5bMF0tdFswXSxhPW5bMV0tdFsxXTtyZXR1cm4gTWF0aC5zcXJ0KHIqcithKmEpfWZ1bmN0aW9uIGModCxuKXt2YXIgcj1uWzBdLXRbMF0sYT1uWzFdLXRbMV07cmV0dXJuIHIqcithKmF9ZnVuY3Rpb24gZih0KXt2YXIgbj10WzBdLHI9dFsxXTtyZXR1cm4gTWF0aC5zcXJ0KG4qbityKnIpfWZ1bmN0aW9uIE0odCl7dmFyIG49dFswXSxyPXRbMV07cmV0dXJuIG4qbityKnJ9bi5sZW49ZixuLnN1Yj11LG4ubXVsPW8sbi5kaXY9aSxuLmRpc3Q9cyxuLnNxckRpc3Q9YyxuLnNxckxlbj1NLG4uZm9yRWFjaD1mdW5jdGlvbigpe3ZhciB0PWUoKTtyZXR1cm4gZnVuY3Rpb24obixyLGEsZSx1LG8pe3ZhciBpPXZvaWQgMCxzPXZvaWQgMDtmb3Iocnx8KHI9MiksYXx8KGE9MCkscz1lP01hdGgubWluKGUqcithLG4ubGVuZ3RoKTpuLmxlbmd0aCxpPWE7aTxzO2krPXIpdFswXT1uW2ldLHRbMV09bltpKzFdLHUodCx0LG8pLG5baV09dFswXSxuW2krMV09dFsxXTtyZXR1cm4gbn19KCl9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnNxckxlbj1uLnNxdWFyZWRMZW5ndGg9bi5sZW49bi5sZW5ndGg9bi5kb3Q9bi5tdWw9bi5zZXRSZWFsPW4uZ2V0UmVhbD12b2lkIDAsbi5jcmVhdGU9ZnVuY3Rpb24oKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDgpO2EuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFswXT0wLHRbMV09MCx0WzJdPTAsdFs0XT0wLHRbNV09MCx0WzZdPTAsdFs3XT0wKTtyZXR1cm4gdFszXT0xLHR9LG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSg4KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG5bNF09dFs0XSxuWzVdPXRbNV0sbls2XT10WzZdLG5bN109dFs3XSxufSxuLmZyb21WYWx1ZXM9ZnVuY3Rpb24odCxuLHIsZSx1LG8saSxzKXt2YXIgYz1uZXcgYS5BUlJBWV9UWVBFKDgpO3JldHVybiBjWzBdPXQsY1sxXT1uLGNbMl09cixjWzNdPWUsY1s0XT11LGNbNV09byxjWzZdPWksY1s3XT1zLGN9LG4uZnJvbVJvdGF0aW9uVHJhbnNsYXRpb25WYWx1ZXM9ZnVuY3Rpb24odCxuLHIsZSx1LG8saSl7dmFyIHM9bmV3IGEuQVJSQVlfVFlQRSg4KTtzWzBdPXQsc1sxXT1uLHNbMl09cixzWzNdPWU7dmFyIGM9LjUqdSxmPS41Km8sTT0uNSppO3JldHVybiBzWzRdPWMqZStmKnItTSpuLHNbNV09ZiplK00qdC1jKnIsc1s2XT1NKmUrYypuLWYqdCxzWzddPS1jKnQtZipuLU0qcixzfSxuLmZyb21Sb3RhdGlvblRyYW5zbGF0aW9uPWksbi5mcm9tVHJhbnNsYXRpb249ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFswXT0wLHRbMV09MCx0WzJdPTAsdFszXT0xLHRbNF09LjUqblswXSx0WzVdPS41Km5bMV0sdFs2XT0uNSpuWzJdLHRbN109MCx0fSxuLmZyb21Sb3RhdGlvbj1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdFs0XT0wLHRbNV09MCx0WzZdPTAsdFs3XT0wLHR9LG4uZnJvbU1hdDQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1lLmNyZWF0ZSgpO3UuZ2V0Um90YXRpb24ocixuKTt2YXIgbz1uZXcgYS5BUlJBWV9UWVBFKDMpO3JldHVybiB1LmdldFRyYW5zbGF0aW9uKG8sbiksaSh0LHIsbyksdH0sbi5jb3B5PXMsbi5pZGVudGl0eT1mdW5jdGlvbih0KXtyZXR1cm4gdFswXT0wLHRbMV09MCx0WzJdPTAsdFszXT0xLHRbNF09MCx0WzVdPTAsdFs2XT0wLHRbN109MCx0fSxuLnNldD1mdW5jdGlvbih0LG4scixhLGUsdSxvLGkscyl7cmV0dXJuIHRbMF09bix0WzFdPXIsdFsyXT1hLHRbM109ZSx0WzRdPXUsdFs1XT1vLHRbNl09aSx0WzddPXMsdH0sbi5nZXREdWFsPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09bls0XSx0WzFdPW5bNV0sdFsyXT1uWzZdLHRbM109bls3XSx0fSxuLnNldER1YWw9ZnVuY3Rpb24odCxuKXtyZXR1cm4gdFs0XT1uWzBdLHRbNV09blsxXSx0WzZdPW5bMl0sdFs3XT1uWzNdLHR9LG4uZ2V0VHJhbnNsYXRpb249ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzRdLGE9bls1XSxlPW5bNl0sdT1uWzddLG89LW5bMF0saT0tblsxXSxzPS1uWzJdLGM9blszXTtyZXR1cm4gdFswXT0yKihyKmMrdSpvK2Eqcy1lKmkpLHRbMV09MiooYSpjK3UqaStlKm8tcipzKSx0WzJdPTIqKGUqYyt1KnMrcippLWEqbyksdH0sbi50cmFuc2xhdGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT0uNSpyWzBdLHM9LjUqclsxXSxjPS41KnJbMl0sZj1uWzRdLE09bls1XSxoPW5bNl0sbD1uWzddO3JldHVybiB0WzBdPWEsdFsxXT1lLHRbMl09dSx0WzNdPW8sdFs0XT1vKmkrZSpjLXUqcytmLHRbNV09bypzK3UqaS1hKmMrTSx0WzZdPW8qYythKnMtZSppK2gsdFs3XT0tYSppLWUqcy11KmMrbCx0fSxuLnJvdGF0ZVg9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPS1uWzBdLHU9LW5bMV0sbz0tblsyXSxpPW5bM10scz1uWzRdLGM9bls1XSxmPW5bNl0sTT1uWzddLGg9cyppK00qYStjKm8tZip1LGw9YyppK00qdStmKmEtcypvLHY9ZippK00qbytzKnUtYyphLGQ9TSppLXMqYS1jKnUtZipvO3JldHVybiBlLnJvdGF0ZVgodCxuLHIpLGE9dFswXSx1PXRbMV0sbz10WzJdLGk9dFszXSx0WzRdPWgqaStkKmErbCpvLXYqdSx0WzVdPWwqaStkKnUrdiphLWgqbyx0WzZdPXYqaStkKm8raCp1LWwqYSx0WzddPWQqaS1oKmEtbCp1LXYqbyx0fSxuLnJvdGF0ZVk9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPS1uWzBdLHU9LW5bMV0sbz0tblsyXSxpPW5bM10scz1uWzRdLGM9bls1XSxmPW5bNl0sTT1uWzddLGg9cyppK00qYStjKm8tZip1LGw9YyppK00qdStmKmEtcypvLHY9ZippK00qbytzKnUtYyphLGQ9TSppLXMqYS1jKnUtZipvO3JldHVybiBlLnJvdGF0ZVkodCxuLHIpLGE9dFswXSx1PXRbMV0sbz10WzJdLGk9dFszXSx0WzRdPWgqaStkKmErbCpvLXYqdSx0WzVdPWwqaStkKnUrdiphLWgqbyx0WzZdPXYqaStkKm8raCp1LWwqYSx0WzddPWQqaS1oKmEtbCp1LXYqbyx0fSxuLnJvdGF0ZVo9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPS1uWzBdLHU9LW5bMV0sbz0tblsyXSxpPW5bM10scz1uWzRdLGM9bls1XSxmPW5bNl0sTT1uWzddLGg9cyppK00qYStjKm8tZip1LGw9YyppK00qdStmKmEtcypvLHY9ZippK00qbytzKnUtYyphLGQ9TSppLXMqYS1jKnUtZipvO3JldHVybiBlLnJvdGF0ZVoodCxuLHIpLGE9dFswXSx1PXRbMV0sbz10WzJdLGk9dFszXSx0WzRdPWgqaStkKmErbCpvLXYqdSx0WzVdPWwqaStkKnUrdiphLWgqbyx0WzZdPXYqaStkKm8raCp1LWwqYSx0WzddPWQqaS1oKmEtbCp1LXYqbyx0fSxuLnJvdGF0ZUJ5UXVhdEFwcGVuZD1mdW5jdGlvbih0LG4scil7dmFyIGE9clswXSxlPXJbMV0sdT1yWzJdLG89clszXSxpPW5bMF0scz1uWzFdLGM9blsyXSxmPW5bM107cmV0dXJuIHRbMF09aSpvK2YqYStzKnUtYyplLHRbMV09cypvK2YqZStjKmEtaSp1LHRbMl09YypvK2YqdStpKmUtcyphLHRbM109ZipvLWkqYS1zKmUtYyp1LGk9bls0XSxzPW5bNV0sYz1uWzZdLGY9bls3XSx0WzRdPWkqbytmKmErcyp1LWMqZSx0WzVdPXMqbytmKmUrYyphLWkqdSx0WzZdPWMqbytmKnUraSplLXMqYSx0WzddPWYqby1pKmEtcyplLWMqdSx0fSxuLnJvdGF0ZUJ5UXVhdFByZXBlbmQ9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1yWzBdLHM9clsxXSxjPXJbMl0sZj1yWzNdO3JldHVybiB0WzBdPWEqZitvKmkrZSpjLXUqcyx0WzFdPWUqZitvKnMrdSppLWEqYyx0WzJdPXUqZitvKmMrYSpzLWUqaSx0WzNdPW8qZi1hKmktZSpzLXUqYyxpPXJbNF0scz1yWzVdLGM9cls2XSxmPXJbN10sdFs0XT1hKmYrbyppK2UqYy11KnMsdFs1XT1lKmYrbypzK3UqaS1hKmMsdFs2XT11KmYrbypjK2Eqcy1lKmksdFs3XT1vKmYtYSppLWUqcy11KmMsdH0sbi5yb3RhdGVBcm91bmRBeGlzPWZ1bmN0aW9uKHQsbixyLGUpe2lmKE1hdGguYWJzKGUpPGEuRVBTSUxPTilyZXR1cm4gcyh0LG4pO3ZhciB1PU1hdGguc3FydChyWzBdKnJbMF0rclsxXSpyWzFdK3JbMl0qclsyXSk7ZSo9LjU7dmFyIG89TWF0aC5zaW4oZSksaT1vKnJbMF0vdSxjPW8qclsxXS91LGY9bypyWzJdL3UsTT1NYXRoLmNvcyhlKSxoPW5bMF0sbD1uWzFdLHY9blsyXSxkPW5bM107dFswXT1oKk0rZCppK2wqZi12KmMsdFsxXT1sKk0rZCpjK3YqaS1oKmYsdFsyXT12Kk0rZCpmK2gqYy1sKmksdFszXT1kKk0taCppLWwqYy12KmY7dmFyIGI9bls0XSxtPW5bNV0scD1uWzZdLFA9bls3XTtyZXR1cm4gdFs0XT1iKk0rUCppK20qZi1wKmMsdFs1XT1tKk0rUCpjK3AqaS1iKmYsdFs2XT1wKk0rUCpmK2IqYy1tKmksdFs3XT1QKk0tYippLW0qYy1wKmYsdH0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0WzNdPW5bM10rclszXSx0WzRdPW5bNF0rcls0XSx0WzVdPW5bNV0rcls1XSx0WzZdPW5bNl0rcls2XSx0WzddPW5bN10rcls3XSx0fSxuLm11bHRpcGx5PWMsbi5zY2FsZT1mdW5jdGlvbih0LG4scil7cmV0dXJuIHRbMF09blswXSpyLHRbMV09blsxXSpyLHRbMl09blsyXSpyLHRbM109blszXSpyLHRbNF09bls0XSpyLHRbNV09bls1XSpyLHRbNl09bls2XSpyLHRbN109bls3XSpyLHR9LG4ubGVycD1mdW5jdGlvbih0LG4scixhKXt2YXIgZT0xLWE7ZihuLHIpPDAmJihhPS1hKTtyZXR1cm4gdFswXT1uWzBdKmUrclswXSphLHRbMV09blsxXSplK3JbMV0qYSx0WzJdPW5bMl0qZStyWzJdKmEsdFszXT1uWzNdKmUrclszXSphLHRbNF09bls0XSplK3JbNF0qYSx0WzVdPW5bNV0qZStyWzVdKmEsdFs2XT1uWzZdKmUrcls2XSphLHRbN109bls3XSplK3JbN10qYSx0fSxuLmludmVydD1mdW5jdGlvbih0LG4pe3ZhciByPWgobik7cmV0dXJuIHRbMF09LW5bMF0vcix0WzFdPS1uWzFdL3IsdFsyXT0tblsyXS9yLHRbM109blszXS9yLHRbNF09LW5bNF0vcix0WzVdPS1uWzVdL3IsdFs2XT0tbls2XS9yLHRbN109bls3XS9yLHR9LG4uY29uanVnYXRlPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09LW5bMF0sdFsxXT0tblsxXSx0WzJdPS1uWzJdLHRbM109blszXSx0WzRdPS1uWzRdLHRbNV09LW5bNV0sdFs2XT0tbls2XSx0WzddPW5bN10sdH0sbi5ub3JtYWxpemU9ZnVuY3Rpb24odCxuKXt2YXIgcj1oKG4pO2lmKHI+MCl7cj1NYXRoLnNxcnQocik7dmFyIGE9blswXS9yLGU9blsxXS9yLHU9blsyXS9yLG89blszXS9yLGk9bls0XSxzPW5bNV0sYz1uWzZdLGY9bls3XSxNPWEqaStlKnMrdSpjK28qZjt0WzBdPWEsdFsxXT1lLHRbMl09dSx0WzNdPW8sdFs0XT0oaS1hKk0pL3IsdFs1XT0ocy1lKk0pL3IsdFs2XT0oYy11Kk0pL3IsdFs3XT0oZi1vKk0pL3J9cmV0dXJuIHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwicXVhdDIoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIiwgXCIrdFs0XStcIiwgXCIrdFs1XStcIiwgXCIrdFs2XStcIiwgXCIrdFs3XStcIilcIn0sbi5leGFjdEVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPT09blswXSYmdFsxXT09PW5bMV0mJnRbMl09PT1uWzJdJiZ0WzNdPT09blszXSYmdFs0XT09PW5bNF0mJnRbNV09PT1uWzVdJiZ0WzZdPT09bls2XSYmdFs3XT09PW5bN119LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89dFszXSxpPXRbNF0scz10WzVdLGM9dFs2XSxmPXRbN10sTT1uWzBdLGg9blsxXSxsPW5bMl0sdj1uWzNdLGQ9bls0XSxiPW5bNV0sbT1uWzZdLHA9bls3XTtyZXR1cm4gTWF0aC5hYnMoci1NKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMociksTWF0aC5hYnMoTSkpJiZNYXRoLmFicyhlLWgpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhlKSxNYXRoLmFicyhoKSkmJk1hdGguYWJzKHUtbCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHUpLE1hdGguYWJzKGwpKSYmTWF0aC5hYnMoby12KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMobyksTWF0aC5hYnModikpJiZNYXRoLmFicyhpLWQpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhpKSxNYXRoLmFicyhkKSkmJk1hdGguYWJzKHMtYik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHMpLE1hdGguYWJzKGIpKSYmTWF0aC5hYnMoYy1tKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMoYyksTWF0aC5hYnMobSkpJiZNYXRoLmFicyhmLXApPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhmKSxNYXRoLmFicyhwKSl9O3ZhciBhPW8ocigwKSksZT1vKHIoMykpLHU9byhyKDQpKTtmdW5jdGlvbiBvKHQpe2lmKHQmJnQuX19lc01vZHVsZSlyZXR1cm4gdDt2YXIgbj17fTtpZihudWxsIT10KWZvcih2YXIgciBpbiB0KU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0LHIpJiYobltyXT10W3JdKTtyZXR1cm4gbi5kZWZhdWx0PXQsbn1mdW5jdGlvbiBpKHQsbixyKXt2YXIgYT0uNSpyWzBdLGU9LjUqclsxXSx1PS41KnJbMl0sbz1uWzBdLGk9blsxXSxzPW5bMl0sYz1uWzNdO3JldHVybiB0WzBdPW8sdFsxXT1pLHRbMl09cyx0WzNdPWMsdFs0XT1hKmMrZSpzLXUqaSx0WzVdPWUqYyt1Km8tYSpzLHRbNl09dSpjK2EqaS1lKm8sdFs3XT0tYSpvLWUqaS11KnMsdH1mdW5jdGlvbiBzKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPW5bMV0sdFsyXT1uWzJdLHRbM109blszXSx0WzRdPW5bNF0sdFs1XT1uWzVdLHRbNl09bls2XSx0WzddPW5bN10sdH1uLmdldFJlYWw9ZS5jb3B5O24uc2V0UmVhbD1lLmNvcHk7ZnVuY3Rpb24gYyh0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPXJbNF0scz1yWzVdLGM9cls2XSxmPXJbN10sTT1uWzRdLGg9bls1XSxsPW5bNl0sdj1uWzddLGQ9clswXSxiPXJbMV0sbT1yWzJdLHA9clszXTtyZXR1cm4gdFswXT1hKnArbypkK2UqbS11KmIsdFsxXT1lKnArbypiK3UqZC1hKm0sdFsyXT11KnArbyptK2EqYi1lKmQsdFszXT1vKnAtYSpkLWUqYi11Km0sdFs0XT1hKmYrbyppK2UqYy11KnMrTSpwK3YqZCtoKm0tbCpiLHRbNV09ZSpmK28qcyt1KmktYSpjK2gqcCt2KmIrbCpkLU0qbSx0WzZdPXUqZitvKmMrYSpzLWUqaStsKnArdiptK00qYi1oKmQsdFs3XT1vKmYtYSppLWUqcy11KmMrdipwLU0qZC1oKmItbCptLHR9bi5tdWw9Yzt2YXIgZj1uLmRvdD1lLmRvdDt2YXIgTT1uLmxlbmd0aD1lLmxlbmd0aCxoPShuLmxlbj1NLG4uc3F1YXJlZExlbmd0aD1lLnNxdWFyZWRMZW5ndGgpO24uc3FyTGVuPWh9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnN1Yj1uLm11bD12b2lkIDAsbi5jcmVhdGU9ZnVuY3Rpb24oKXt2YXIgdD1uZXcgYS5BUlJBWV9UWVBFKDYpO2EuQVJSQVlfVFlQRSE9RmxvYXQzMkFycmF5JiYodFsxXT0wLHRbMl09MCx0WzRdPTAsdFs1XT0wKTtyZXR1cm4gdFswXT0xLHRbM109MSx0fSxuLmNsb25lPWZ1bmN0aW9uKHQpe3ZhciBuPW5ldyBhLkFSUkFZX1RZUEUoNik7cmV0dXJuIG5bMF09dFswXSxuWzFdPXRbMV0sblsyXT10WzJdLG5bM109dFszXSxuWzRdPXRbNF0sbls1XT10WzVdLG59LG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdFs0XT1uWzRdLHRbNV09bls1XSx0fSxuLmlkZW50aXR5PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdPTEsdFsxXT0wLHRbMl09MCx0WzNdPTEsdFs0XT0wLHRbNV09MCx0fSxuLmZyb21WYWx1ZXM9ZnVuY3Rpb24odCxuLHIsZSx1LG8pe3ZhciBpPW5ldyBhLkFSUkFZX1RZUEUoNik7cmV0dXJuIGlbMF09dCxpWzFdPW4saVsyXT1yLGlbM109ZSxpWzRdPXUsaVs1XT1vLGl9LG4uc2V0PWZ1bmN0aW9uKHQsbixyLGEsZSx1LG8pe3JldHVybiB0WzBdPW4sdFsxXT1yLHRbMl09YSx0WzNdPWUsdFs0XT11LHRbNV09byx0fSxuLmludmVydD1mdW5jdGlvbih0LG4pe3ZhciByPW5bMF0sYT1uWzFdLGU9blsyXSx1PW5bM10sbz1uWzRdLGk9bls1XSxzPXIqdS1hKmU7aWYoIXMpcmV0dXJuIG51bGw7cmV0dXJuIHM9MS9zLHRbMF09dSpzLHRbMV09LWEqcyx0WzJdPS1lKnMsdFszXT1yKnMsdFs0XT0oZSppLXUqbykqcyx0WzVdPShhKm8tcippKSpzLHR9LG4uZGV0ZXJtaW5hbnQ9ZnVuY3Rpb24odCl7cmV0dXJuIHRbMF0qdFszXS10WzFdKnRbMl19LG4ubXVsdGlwbHk9ZSxuLnJvdGF0ZT1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPW5bNF0scz1uWzVdLGM9TWF0aC5zaW4ociksZj1NYXRoLmNvcyhyKTtyZXR1cm4gdFswXT1hKmYrdSpjLHRbMV09ZSpmK28qYyx0WzJdPWEqLWMrdSpmLHRbM109ZSotYytvKmYsdFs0XT1pLHRbNV09cyx0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9bls0XSxzPW5bNV0sYz1yWzBdLGY9clsxXTtyZXR1cm4gdFswXT1hKmMsdFsxXT1lKmMsdFsyXT11KmYsdFszXT1vKmYsdFs0XT1pLHRbNV09cyx0fSxuLnRyYW5zbGF0ZT1mdW5jdGlvbih0LG4scil7dmFyIGE9blswXSxlPW5bMV0sdT1uWzJdLG89blszXSxpPW5bNF0scz1uWzVdLGM9clswXSxmPXJbMV07cmV0dXJuIHRbMF09YSx0WzFdPWUsdFsyXT11LHRbM109byx0WzRdPWEqYyt1KmYraSx0WzVdPWUqYytvKmYrcyx0fSxuLmZyb21Sb3RhdGlvbj1mdW5jdGlvbih0LG4pe3ZhciByPU1hdGguc2luKG4pLGE9TWF0aC5jb3Mobik7cmV0dXJuIHRbMF09YSx0WzFdPXIsdFsyXT0tcix0WzNdPWEsdFs0XT0wLHRbNV09MCx0fSxuLmZyb21TY2FsaW5nPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPTAsdFsyXT0wLHRbM109blsxXSx0WzRdPTAsdFs1XT0wLHR9LG4uZnJvbVRyYW5zbGF0aW9uPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09MSx0WzFdPTAsdFsyXT0wLHRbM109MSx0WzRdPW5bMF0sdFs1XT1uWzFdLHR9LG4uc3RyPWZ1bmN0aW9uKHQpe3JldHVyblwibWF0MmQoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIiwgXCIrdFs0XStcIiwgXCIrdFs1XStcIilcIn0sbi5mcm9iPWZ1bmN0aW9uKHQpe3JldHVybiBNYXRoLnNxcnQoTWF0aC5wb3codFswXSwyKStNYXRoLnBvdyh0WzFdLDIpK01hdGgucG93KHRbMl0sMikrTWF0aC5wb3codFszXSwyKStNYXRoLnBvdyh0WzRdLDIpK01hdGgucG93KHRbNV0sMikrMSl9LG4uYWRkPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0sdFsxXT1uWzFdK3JbMV0sdFsyXT1uWzJdK3JbMl0sdFszXT1uWzNdK3JbM10sdFs0XT1uWzRdK3JbNF0sdFs1XT1uWzVdK3JbNV0sdH0sbi5zdWJ0cmFjdD11LG4ubXVsdGlwbHlTY2FsYXI9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0qcix0WzFdPW5bMV0qcix0WzJdPW5bMl0qcix0WzNdPW5bM10qcix0WzRdPW5bNF0qcix0WzVdPW5bNV0qcix0fSxuLm11bHRpcGx5U2NhbGFyQW5kQWRkPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzBdPW5bMF0rclswXSphLHRbMV09blsxXStyWzFdKmEsdFsyXT1uWzJdK3JbMl0qYSx0WzNdPW5bM10rclszXSphLHRbNF09bls0XStyWzRdKmEsdFs1XT1uWzVdK3JbNV0qYSx0fSxuLmV4YWN0RXF1YWxzPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09PT1uWzBdJiZ0WzFdPT09blsxXSYmdFsyXT09PW5bMl0mJnRbM109PT1uWzNdJiZ0WzRdPT09bls0XSYmdFs1XT09PW5bNV19LG4uZXF1YWxzPWZ1bmN0aW9uKHQsbil7dmFyIHI9dFswXSxlPXRbMV0sdT10WzJdLG89dFszXSxpPXRbNF0scz10WzVdLGM9blswXSxmPW5bMV0sTT1uWzJdLGg9blszXSxsPW5bNF0sdj1uWzVdO3JldHVybiBNYXRoLmFicyhyLWMpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhyKSxNYXRoLmFicyhjKSkmJk1hdGguYWJzKGUtZik8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGUpLE1hdGguYWJzKGYpKSYmTWF0aC5hYnModS1NKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnModSksTWF0aC5hYnMoTSkpJiZNYXRoLmFicyhvLWgpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhvKSxNYXRoLmFicyhoKSkmJk1hdGguYWJzKGktbCk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKGkpLE1hdGguYWJzKGwpKSYmTWF0aC5hYnMocy12KTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMocyksTWF0aC5hYnModikpfTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUodCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1uWzRdLHM9bls1XSxjPXJbMF0sZj1yWzFdLE09clsyXSxoPXJbM10sbD1yWzRdLHY9cls1XTtyZXR1cm4gdFswXT1hKmMrdSpmLHRbMV09ZSpjK28qZix0WzJdPWEqTSt1KmgsdFszXT1lKk0rbypoLHRbNF09YSpsK3UqditpLHRbNV09ZSpsK28qditzLHR9ZnVuY3Rpb24gdSh0LG4scil7cmV0dXJuIHRbMF09blswXS1yWzBdLHRbMV09blsxXS1yWzFdLHRbMl09blsyXS1yWzJdLHRbM109blszXS1yWzNdLHRbNF09bls0XS1yWzRdLHRbNV09bls1XS1yWzVdLHR9bi5tdWw9ZSxuLnN1Yj11fSxmdW5jdGlvbih0LG4scil7XCJ1c2Ugc3RyaWN0XCI7T2JqZWN0LmRlZmluZVByb3BlcnR5KG4sXCJfX2VzTW9kdWxlXCIse3ZhbHVlOiEwfSksbi5zdWI9bi5tdWw9dm9pZCAwLG4uY3JlYXRlPWZ1bmN0aW9uKCl7dmFyIHQ9bmV3IGEuQVJSQVlfVFlQRSg0KTthLkFSUkFZX1RZUEUhPUZsb2F0MzJBcnJheSYmKHRbMV09MCx0WzJdPTApO3JldHVybiB0WzBdPTEsdFszXT0xLHR9LG4uY2xvbmU9ZnVuY3Rpb24odCl7dmFyIG49bmV3IGEuQVJSQVlfVFlQRSg0KTtyZXR1cm4gblswXT10WzBdLG5bMV09dFsxXSxuWzJdPXRbMl0sblszXT10WzNdLG59LG4uY29weT1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPW5bMF0sdFsxXT1uWzFdLHRbMl09blsyXSx0WzNdPW5bM10sdH0sbi5pZGVudGl0eT1mdW5jdGlvbih0KXtyZXR1cm4gdFswXT0xLHRbMV09MCx0WzJdPTAsdFszXT0xLHR9LG4uZnJvbVZhbHVlcz1mdW5jdGlvbih0LG4scixlKXt2YXIgdT1uZXcgYS5BUlJBWV9UWVBFKDQpO3JldHVybiB1WzBdPXQsdVsxXT1uLHVbMl09cix1WzNdPWUsdX0sbi5zZXQ9ZnVuY3Rpb24odCxuLHIsYSxlKXtyZXR1cm4gdFswXT1uLHRbMV09cix0WzJdPWEsdFszXT1lLHR9LG4udHJhbnNwb3NlPWZ1bmN0aW9uKHQsbil7aWYodD09PW4pe3ZhciByPW5bMV07dFsxXT1uWzJdLHRbMl09cn1lbHNlIHRbMF09blswXSx0WzFdPW5bMl0sdFsyXT1uWzFdLHRbM109blszXTtyZXR1cm4gdH0sbi5pbnZlcnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdLGE9blsxXSxlPW5bMl0sdT1uWzNdLG89cip1LWUqYTtpZighbylyZXR1cm4gbnVsbDtyZXR1cm4gbz0xL28sdFswXT11Km8sdFsxXT0tYSpvLHRbMl09LWUqbyx0WzNdPXIqbyx0fSxuLmFkam9pbnQ9ZnVuY3Rpb24odCxuKXt2YXIgcj1uWzBdO3JldHVybiB0WzBdPW5bM10sdFsxXT0tblsxXSx0WzJdPS1uWzJdLHRbM109cix0fSxuLmRldGVybWluYW50PWZ1bmN0aW9uKHQpe3JldHVybiB0WzBdKnRbM10tdFsyXSp0WzFdfSxuLm11bHRpcGx5PWUsbi5yb3RhdGU9ZnVuY3Rpb24odCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1NYXRoLnNpbihyKSxzPU1hdGguY29zKHIpO3JldHVybiB0WzBdPWEqcyt1KmksdFsxXT1lKnMrbyppLHRbMl09YSotaSt1KnMsdFszXT1lKi1pK28qcyx0fSxuLnNjYWxlPWZ1bmN0aW9uKHQsbixyKXt2YXIgYT1uWzBdLGU9blsxXSx1PW5bMl0sbz1uWzNdLGk9clswXSxzPXJbMV07cmV0dXJuIHRbMF09YSppLHRbMV09ZSppLHRbMl09dSpzLHRbM109bypzLHR9LG4uZnJvbVJvdGF0aW9uPWZ1bmN0aW9uKHQsbil7dmFyIHI9TWF0aC5zaW4obiksYT1NYXRoLmNvcyhuKTtyZXR1cm4gdFswXT1hLHRbMV09cix0WzJdPS1yLHRbM109YSx0fSxuLmZyb21TY2FsaW5nPWZ1bmN0aW9uKHQsbil7cmV0dXJuIHRbMF09blswXSx0WzFdPTAsdFsyXT0wLHRbM109blsxXSx0fSxuLnN0cj1mdW5jdGlvbih0KXtyZXR1cm5cIm1hdDIoXCIrdFswXStcIiwgXCIrdFsxXStcIiwgXCIrdFsyXStcIiwgXCIrdFszXStcIilcIn0sbi5mcm9iPWZ1bmN0aW9uKHQpe3JldHVybiBNYXRoLnNxcnQoTWF0aC5wb3codFswXSwyKStNYXRoLnBvdyh0WzFdLDIpK01hdGgucG93KHRbMl0sMikrTWF0aC5wb3codFszXSwyKSl9LG4uTERVPWZ1bmN0aW9uKHQsbixyLGEpe3JldHVybiB0WzJdPWFbMl0vYVswXSxyWzBdPWFbMF0sclsxXT1hWzFdLHJbM109YVszXS10WzJdKnJbMV0sW3QsbixyXX0sbi5hZGQ9ZnVuY3Rpb24odCxuLHIpe3JldHVybiB0WzBdPW5bMF0rclswXSx0WzFdPW5bMV0rclsxXSx0WzJdPW5bMl0rclsyXSx0WzNdPW5bM10rclszXSx0fSxuLnN1YnRyYWN0PXUsbi5leGFjdEVxdWFscz1mdW5jdGlvbih0LG4pe3JldHVybiB0WzBdPT09blswXSYmdFsxXT09PW5bMV0mJnRbMl09PT1uWzJdJiZ0WzNdPT09blszXX0sbi5lcXVhbHM9ZnVuY3Rpb24odCxuKXt2YXIgcj10WzBdLGU9dFsxXSx1PXRbMl0sbz10WzNdLGk9blswXSxzPW5bMV0sYz1uWzJdLGY9blszXTtyZXR1cm4gTWF0aC5hYnMoci1pKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMociksTWF0aC5hYnMoaSkpJiZNYXRoLmFicyhlLXMpPD1hLkVQU0lMT04qTWF0aC5tYXgoMSxNYXRoLmFicyhlKSxNYXRoLmFicyhzKSkmJk1hdGguYWJzKHUtYyk8PWEuRVBTSUxPTipNYXRoLm1heCgxLE1hdGguYWJzKHUpLE1hdGguYWJzKGMpKSYmTWF0aC5hYnMoby1mKTw9YS5FUFNJTE9OKk1hdGgubWF4KDEsTWF0aC5hYnMobyksTWF0aC5hYnMoZikpfSxuLm11bHRpcGx5U2NhbGFyPWZ1bmN0aW9uKHQsbixyKXtyZXR1cm4gdFswXT1uWzBdKnIsdFsxXT1uWzFdKnIsdFsyXT1uWzJdKnIsdFszXT1uWzNdKnIsdH0sbi5tdWx0aXBseVNjYWxhckFuZEFkZD1mdW5jdGlvbih0LG4scixhKXtyZXR1cm4gdFswXT1uWzBdK3JbMF0qYSx0WzFdPW5bMV0rclsxXSphLHRbMl09blsyXStyWzJdKmEsdFszXT1uWzNdK3JbM10qYSx0fTt2YXIgYT1mdW5jdGlvbih0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59KHIoMCkpO2Z1bmN0aW9uIGUodCxuLHIpe3ZhciBhPW5bMF0sZT1uWzFdLHU9blsyXSxvPW5bM10saT1yWzBdLHM9clsxXSxjPXJbMl0sZj1yWzNdO3JldHVybiB0WzBdPWEqaSt1KnMsdFsxXT1lKmkrbypzLHRbMl09YSpjK3UqZix0WzNdPWUqYytvKmYsdH1mdW5jdGlvbiB1KHQsbixyKXtyZXR1cm4gdFswXT1uWzBdLXJbMF0sdFsxXT1uWzFdLXJbMV0sdFsyXT1uWzJdLXJbMl0sdFszXT1uWzNdLXJbM10sdH1uLm11bD1lLG4uc3ViPXV9LGZ1bmN0aW9uKHQsbixyKXtcInVzZSBzdHJpY3RcIjtPYmplY3QuZGVmaW5lUHJvcGVydHkobixcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSxuLnZlYzQ9bi52ZWMzPW4udmVjMj1uLnF1YXQyPW4ucXVhdD1uLm1hdDQ9bi5tYXQzPW4ubWF0MmQ9bi5tYXQyPW4uZ2xNYXRyaXg9dm9pZCAwO3ZhciBhPWwocigwKSksZT1sKHIoOSkpLHU9bChyKDgpKSxvPWwocig1KSksaT1sKHIoNCkpLHM9bChyKDMpKSxjPWwocig3KSksZj1sKHIoNikpLE09bChyKDIpKSxoPWwocigxKSk7ZnVuY3Rpb24gbCh0KXtpZih0JiZ0Ll9fZXNNb2R1bGUpcmV0dXJuIHQ7dmFyIG49e307aWYobnVsbCE9dClmb3IodmFyIHIgaW4gdClPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodCxyKSYmKG5bcl09dFtyXSk7cmV0dXJuIG4uZGVmYXVsdD10LG59bi5nbE1hdHJpeD1hLG4ubWF0Mj1lLG4ubWF0MmQ9dSxuLm1hdDM9byxuLm1hdDQ9aSxuLnF1YXQ9cyxuLnF1YXQyPWMsbi52ZWMyPWYsbi52ZWMzPU0sbi52ZWM0PWh9XSl9KTsiLCJtb2R1bGUuZXhwb3J0cy5zY3JlZW5UcmlhbmdsZVN0YXJ0ID0gMDtcclxubW9kdWxlLmV4cG9ydHMuc2NyZWVuVHJpYW5nbGVTaXplID0gMztcclxubW9kdWxlLmV4cG9ydHMuY3ViZVN0YXJ0ID0gMztcclxubW9kdWxlLmV4cG9ydHMuY3ViZVNpemUgPSAzNjtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmRhdGEgPSBcclxuW1xyXG4gIC0xLjAwLCAtMS4wMCwgIDAuMDAsICAwLjAwLCAgMC4wMCwgIDAuMDAsIFxyXG4gICAzLjAwLCAtMS4wMCwgIDAuMDAsICAwLjAwLCAgMC4wMCwgIDAuMDAsIFxyXG4gIC0xLjAwLCAgMy4wMCwgIDAuMDAsICAwLjAwLCAgMC4wMCwgIDAuMDAsIFxyXG4gIC0wLjUwLCAgMC41MCwgIDAuNTAsICAwLjAwLCAgMS4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAtMC41MCwgIDAuMDAsICAxLjAwLCAgMC4wMCxcclxuICAtMC41MCwgIDAuNTAsIC0wLjUwLCAgMC4wMCwgIDEuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgIDAuNTAsICAxLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAtMC41MCwgIDEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAgMC41MCwgIDAuNTAsIC0wLjUwLCAgMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgIDAuNTAsICAwLjAwLCAtMS4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAtMC41MCwgIDAuMDAsIC0xLjAwLCAgMC4wMCxcclxuICAgMC41MCwgLTAuNTAsIC0wLjUwLCAgMC4wMCwgLTEuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAtMC41MCwgIDAuNTAsIC0xLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAtMC41MCwgLTEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAtMC41MCwgLTAuNTAsIC0wLjUwLCAtMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgLTAuNTAsICAwLjAwLCAgMC4wMCwgLTEuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAtMC41MCwgIDAuMDAsICAwLjAwLCAtMS4wMCxcclxuICAgMC41MCwgIDAuNTAsIC0wLjUwLCAgMC4wMCwgIDAuMDAsIC0xLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgIDAuNTAsICAwLjAwLCAgMC4wMCwgIDEuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAgMC41MCwgIDAuMDAsICAwLjAwLCAgMS4wMCxcclxuICAgMC41MCwgLTAuNTAsICAwLjUwLCAgMC4wMCwgIDAuMDAsICAxLjAwLFxyXG4gIC0wLjUwLCAgMC41MCwgIDAuNTAsICAwLjAwLCAgMS4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsICAwLjUwLCAgMC41MCwgIDAuMDAsICAxLjAwLCAgMC4wMCxcclxuICAgMC41MCwgIDAuNTAsIC0wLjUwLCAgMC4wMCwgIDEuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgIDAuNTAsICAxLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgIDAuNTAsIC0wLjUwLCAgMC41MCwgIDEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAgMC41MCwgLTAuNTAsIC0wLjUwLCAgMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgIDAuNTAsICAwLjAwLCAtMS4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAgMC41MCwgIDAuMDAsIC0xLjAwLCAgMC4wMCxcclxuICAtMC41MCwgLTAuNTAsIC0wLjUwLCAgMC4wMCwgLTEuMDAsICAwLjAwLFxyXG4gIC0wLjUwLCAtMC41MCwgIDAuNTAsIC0xLjAwLCAgMC4wMCwgIDAuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAgMC41MCwgLTEuMDAsICAwLjAwLCAgMC4wMCxcclxuICAtMC41MCwgIDAuNTAsIC0wLjUwLCAtMS4wMCwgIDAuMDAsICAwLjAwLFxyXG4gICAwLjUwLCAtMC41MCwgLTAuNTAsICAwLjAwLCAgMC4wMCwgLTEuMDAsXHJcbiAgLTAuNTAsIC0wLjUwLCAtMC41MCwgIDAuMDAsICAwLjAwLCAtMS4wMCxcclxuICAtMC41MCwgIDAuNTAsIC0wLjUwLCAgMC4wMCwgIDAuMDAsIC0xLjAwLFxyXG4gICAwLjUwLCAgMC41MCwgIDAuNTAsICAwLjAwLCAgMC4wMCwgIDEuMDAsXHJcbiAgLTAuNTAsICAwLjUwLCAgMC41MCwgIDAuMDAsICAwLjAwLCAgMS4wMCxcclxuICAtMC41MCwgLTAuNTAsICAwLjUwLCAgMC4wMCwgIDAuMDAsICAxLjAwXHJcbl0iLCJjb25zdCBzaGFkZXJzID0gcmVxdWlyZShcIi4vc2hhZGVycy5qc1wiKTtcclxuY29uc3QgUmF3RGF0YSA9IHJlcXVpcmUoXCIuL3Jhd19kYXRhXCIpO1xyXG5cclxubGV0IGdsO1xyXG5sZXQgc2NyZWVuV2lkdGgsIHNjcmVlbkhlaWdodDtcclxuXHJcbmZ1bmN0aW9uIGluaXRpYWxpemUoX2dsKSB7XHJcblxyXG4gICAgZ2wgPSBfZ2w7XHJcblxyXG4gICAgLy8gdmFyIGV4dCA9IGdsLmdldEV4dGVuc2lvbihcIkFOR0xFX2luc3RhbmNlZF9hcnJheXNcIik7IC8vIFZlbmRvciBwcmVmaXhlcyBtYXkgYXBwbHkhXHJcbiAgICAvLyBhbGVydChleHQpO1xyXG5cclxuICAgIHNldHVwU3RhdGljU2V0dGluZ3MoKTtcclxuICAgIGNvbXBpbGVTaGFkZXJzKCk7XHJcbiAgICBzZXR1cFByaW1pdGl2ZXMoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0U2NyZWVuU2l6ZSh3aWR0aCwgaGVpZ2h0KSB7XHJcbiAgICBzY3JlZW5XaWR0aCA9IHdpZHRoO1xyXG4gICAgc2NyZWVuSGVpZ2h0ID0gaGVpZ2h0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRBc3BlY3RSYXRpbygpIHtcclxuICAgIHJldHVybiBzY3JlZW5XaWR0aCAvIHNjcmVlbkhlaWdodDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBTdGF0aWNTZXR0aW5ncygpIHtcclxuXHJcbiAgICBnbC5lbmFibGUoZ2wuQ1VMTF9GQUNFKTtcclxuICAgIGdsLmZyb250RmFjZShnbC5DQ1cpO1xyXG4gICAgZ2wuY3VsbEZhY2UoZ2wuQkFDSyk7XHJcbn1cclxuXHJcbmxldCBmcmFtZUJ1ZmZlcjtcclxubGV0IHNjcmVlblRyaWFuZ2xlU3RhcnQsIHNjcmVlblRyaWFuZ2xlU2l6ZSwgY3ViZVN0YXJ0LCBjdWJlU2l6ZTtcclxuXHJcbmZ1bmN0aW9uIGNoZWNrR0xFcnJvcigpIHtcclxuXHJcbiAgICBjb25zdCBlcnJvciA9IGdsLmdldEVycm9yKCk7XHJcbiAgICBpZiAoZXJyb3IgIT09IGdsLk5PX0VSUk9SKVxyXG4gICAgICAgIGFsZXJ0KFwiV2ViR0wgRXJyb3I6IFwiICsgZXJyb3IpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZURhdGEoc3JjRGF0YSwgc3JjUG9zaXRpb24sIHNyY0NvdW50LCBkc3REYXRhLCBkc3RQb3NpdGlvbiwgaW5zdGFuY2VYLCBpbnN0YW5jZVkpIHtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNyY0NvdW50OyBpKyspIHtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCA2OyBqKyspXHJcbiAgICAgICAgICAgIGRzdERhdGFbZHN0UG9zaXRpb24rK10gPSBzcmNEYXRhW3NyY1Bvc2l0aW9uKytdO1xyXG5cclxuICAgICAgICBkc3REYXRhW2RzdFBvc2l0aW9uKytdID0gaW5zdGFuY2VYO1xyXG4gICAgICAgIGRzdERhdGFbZHN0UG9zaXRpb24rK10gPSBpbnN0YW5jZVk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGRzdFBvc2l0aW9uO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFByaW1pdGl2ZXMoKSB7XHJcblxyXG4gICAgZnJhbWVCdWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpO1xyXG5cclxuICAgIGNvbnN0IHRleFNpemUgPSA2NDtcclxuICAgIGNvbnN0IGJ1ZmZlclN0cmlkZSA9IDg7XHJcbiAgICBjb25zdCB0ZW1wbGF0ZURhdGEgPSBSYXdEYXRhLmRhdGE7XHJcbiAgICBjb25zdCBkYXRhID0gbmV3IEZsb2F0MzJBcnJheSgoUmF3RGF0YS5zY3JlZW5UcmlhbmdsZVNpemUgKyBSYXdEYXRhLmN1YmVTaXplICogdGV4U2l6ZSAqIHRleFNpemUpICogYnVmZmVyU3RyaWRlKTtcclxuXHJcbiAgICBsZXQgcG9zaXRpb24gPSAwO1xyXG5cclxuICAgIHNjcmVlblRyaWFuZ2xlU3RhcnQgPSBwb3NpdGlvbiAvIGJ1ZmZlclN0cmlkZTtcclxuICAgIHNjcmVlblRyaWFuZ2xlU2l6ZSA9IFJhd0RhdGEuc2NyZWVuVHJpYW5nbGVTaXplO1xyXG4gICAgcG9zaXRpb24gPSB3cml0ZURhdGEodGVtcGxhdGVEYXRhLCBSYXdEYXRhLnNjcmVlblRyaWFuZ2xlU3RhcnQgKiA2LCBzY3JlZW5UcmlhbmdsZVNpemUsIGRhdGEsIHBvc2l0aW9uLCAwLCAwKTtcclxuXHJcbiAgICBjdWJlU3RhcnQgPSBwb3NpdGlvbiAvIGJ1ZmZlclN0cmlkZTtcclxuICAgIGN1YmVTaXplID0gUmF3RGF0YS5jdWJlU2l6ZTtcclxuXHJcbiAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRleFNpemU7IHkrKylcclxuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHRleFNpemU7IHgrKykge1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VYID0gKHggLyB0ZXhTaXplKSArICgwLjUgLyB0ZXhTaXplKTtcclxuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VZID0gKHkgLyB0ZXhTaXplKSArICgwLjUgLyB0ZXhTaXplKTtcclxuXHJcbiAgICAgICAgICAgIHBvc2l0aW9uID0gd3JpdGVEYXRhKHRlbXBsYXRlRGF0YSwgUmF3RGF0YS5jdWJlU3RhcnQgKiA2LCBjdWJlU2l6ZSwgZGF0YSwgcG9zaXRpb24sIGluc3RhbmNlWCwgaW5zdGFuY2VZKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgY29uc3QgYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XHJcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgYnVmZmVyKTtcclxuICAgIGdsLmJ1ZmZlckRhdGEoZ2wuQVJSQVlfQlVGRkVSLCBkYXRhLCBnbC5TVEFUSUNfRFJBVyk7XHJcblxyXG4gICAgbGV0IGluZGV4O1xyXG5cclxuICAgIGluZGV4ID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24oc2NlbmVTaGFkZXIucHJvZ3JhbSwgXCJWZXJ0ZXhQb3NpdGlvblwiKTtcclxuICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KTtcclxuICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIoXHJcbiAgICAgICAgaW5kZXgsXHJcbiAgICAgICAgMyxcclxuICAgICAgICBnbC5GTE9BVCxcclxuICAgICAgICBnbC5GQUxTRSxcclxuICAgICAgICA4ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxyXG4gICAgICAgIDBcclxuICAgICk7XHJcblxyXG4gICAgaW5kZXggPSBnbC5nZXRBdHRyaWJMb2NhdGlvbihzY2VuZVNoYWRlci5wcm9ncmFtLCBcIlZlcnRleE5vcm1hbFwiKTtcclxuICAgIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KGluZGV4KTtcclxuICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIoXHJcbiAgICAgICAgaW5kZXgsXHJcbiAgICAgICAgMyxcclxuICAgICAgICBnbC5GTE9BVCxcclxuICAgICAgICBnbC5GQUxTRSxcclxuICAgICAgICA4ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxyXG4gICAgICAgIDMgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlRcclxuICAgICk7XHJcblxyXG4gICAgaW5kZXggPSBnbC5nZXRBdHRyaWJMb2NhdGlvbihzY2VuZVNoYWRlci5wcm9ncmFtLCBcIkluc3RhbmNlQ29vcmRcIik7XHJcbiAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShpbmRleCk7XHJcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKFxyXG4gICAgICAgIGluZGV4LFxyXG4gICAgICAgIDIsXHJcbiAgICAgICAgZ2wuRkxPQVQsXHJcbiAgICAgICAgZ2wuRkFMU0UsXHJcbiAgICAgICAgOCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCxcclxuICAgICAgICA2ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXHJcbiAgICApO1xyXG59XHJcblxyXG4vLyBzaGFyZWRcclxuXHJcbmxldCBxdWF0TXVsU2hhZGVyLCBvZmZzZXRBZGRTaGFkZXIsIHNjZW5lU2hhZGVyLCB0ZXhPdXRwdXRTaGFkZXI7XHJcblxyXG5mdW5jdGlvbiBjb21waWxlU2hhZGVycygpIHtcclxuXHJcbiAgICAvLyBxdWF0ZXJuaW9uIG11bHRpcGxpY2F0aW9uXHJcblxyXG4gICAgcXVhdE11bFNoYWRlciA9IGNvbXBpbGVTaGFkZXIoXCJxdWF0ZXJuaW9uIG11bHRpcGxpY2F0aW9uXCIsIHNoYWRlcnMucXVhdGVybmlvbk11bHRpcGxpY2F0aW9uVmVydGV4U2hhZGVyLFxyXG4gICAgICAgIHNoYWRlcnMucXVhdGVybmlvbk11bHRpcGxpY2F0aW9uRnJhZ21lbnRTaGFkZXIsIFsnZGF0YWJhc2UnLCAnaW5zdGFuY2VzJywgJ3BhcmVudFJvdGF0aW9ucycsICdib25lSWQnXSk7XHJcblxyXG4gICAgcXVhdE11bFNoYWRlci51c2UoKTtcclxuICAgIGdsLnVuaWZvcm0xaShxdWF0TXVsU2hhZGVyLmRhdGFiYXNlLCAwKTtcclxuICAgIGdsLnVuaWZvcm0xaShxdWF0TXVsU2hhZGVyLmluc3RhbmNlcywgMSk7XHJcbiAgICBnbC51bmlmb3JtMWkocXVhdE11bFNoYWRlci5wYXJlbnRSb3RhdGlvbnMsIDIpO1xyXG5cclxuICAgIC8vIG9mZnNldCBhZGRcclxuXHJcbiAgICBvZmZzZXRBZGRTaGFkZXIgPSBjb21waWxlU2hhZGVyKFwib2Zmc2V0IGFkZFwiLCBzaGFkZXJzLm9mZnNldFJvdGF0aXRpb25BbmRBZGRpdGlvblZlcnRleFNoYWRlcixcclxuICAgICAgICBzaGFkZXJzLm9mZnNldFJvdGF0aXRpb25BbmRBZGRpdGlvbkZyYWdtZW50U2hhZGVyLCBbJ3JvdGF0aW9ucycsICdwYXJlbnRPZmZzZXRzJywgJ2JvbmVPZmZzZXQnXSk7XHJcblxyXG4gICAgb2Zmc2V0QWRkU2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKG9mZnNldEFkZFNoYWRlci5yb3RhdGlvbnMsIDApO1xyXG4gICAgZ2wudW5pZm9ybTFpKG9mZnNldEFkZFNoYWRlci5wYXJlbnRPZmZzZXRzLCAxKTtcclxuXHJcbiAgICAvLyBzY2VuZVxyXG5cclxuICAgIHNjZW5lU2hhZGVyID0gY29tcGlsZVNoYWRlcihcInNjZW5lXCIsIHNoYWRlcnMuc2NlbmVWZXJ0ZXhTaGFkZXIsIHNoYWRlcnMuc2NlbmVGcmFnbWVudFNoYWRlcixcclxuICAgICAgICBbJ1JvdGF0aW9ucycsICdPZmZzZXRzJywgJ1Bvc2l0aW9uc1gnLCAnUG9zaXRpb25zWScsICdQb3NpdGlvbnNaJywgJ1Byb2plY3Rpb24nLCAnVmlldycsICdTaXplJywgJ01pZGRsZVRyYW5zbGF0aW9uJ10pO1xyXG5cclxuICAgIHNjZW5lU2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKHNjZW5lU2hhZGVyLlJvdGF0aW9ucywgMCk7XHJcbiAgICBnbC51bmlmb3JtMWkoc2NlbmVTaGFkZXIuT2Zmc2V0cywgMSk7XHJcbiAgICBnbC51bmlmb3JtMWkoc2NlbmVTaGFkZXIuUG9zaXRpb25zWCwgMik7XHJcbiAgICBnbC51bmlmb3JtMWkoc2NlbmVTaGFkZXIuUG9zaXRpb25zWSwgMyk7XHJcbiAgICBnbC51bmlmb3JtMWkoc2NlbmVTaGFkZXIuUG9zaXRpb25zWiwgNCk7XHJcblxyXG4gICAgLy8gdGV4dHVyZSBvdXRwdXRcclxuXHJcbiAgICB0ZXhPdXRwdXRTaGFkZXIgPSBjb21waWxlU2hhZGVyKFwidGV4dHVyZSBvdXRwdXRcIiwgc2hhZGVycy50ZXh0dXJlT3V0cHV0VmVydGV4U2hhZGVyLFxyXG4gICAgICAgIHNoYWRlcnMudGV4dHVyZU91dHB1dEZyYWdtZW50U2hhZGVyLCBbJ2lucHV0VGV4JywgJ2ludk91dHB1dFNpemUnXSk7XHJcblxyXG4gICAgdGV4T3V0cHV0U2hhZGVyLnVzZSgpO1xyXG4gICAgZ2wudW5pZm9ybTFpKHRleE91dHB1dFNoYWRlci5pbnB1dFRleCwgMCk7XHJcbn1cclxuXHJcbi8vIHJlbmRlciB1dGlsc1xyXG5cclxuZnVuY3Rpb24gc2V0dXBGbGF0UmVuZGVyKCkge1xyXG4gICAgZ2wuZGlzYWJsZShnbC5ERVBUSF9URVNUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXAzRFJlbmRlcigpIHtcclxuICAgIGdsLmVuYWJsZShnbC5ERVBUSF9URVNUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBSZW5kZXJUb1RleHR1cmUodGV4T3V0LCB0ZXhXaWR0aCwgdGV4SGVpZ2h0KSB7XHJcblxyXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBmcmFtZUJ1ZmZlcik7XHJcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChnbC5GUkFNRUJVRkZFUiwgZ2wuQ09MT1JfQVRUQUNITUVOVDAsIGdsLlRFWFRVUkVfMkQsIHRleE91dCwgMCk7XHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGZyYW1lQnVmZmVyKTtcclxuICAgIGdsLnZpZXdwb3J0KDAsIDAsIHRleFdpZHRoLCB0ZXhIZWlnaHQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFJlbmRlclRvRnJvbnRCdWZmZXIoKSB7XHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xyXG4gICAgZ2wudmlld3BvcnQoMCwgMCwgc2NyZWVuV2lkdGgsIHNjcmVlbkhlaWdodCk7XHJcbn1cclxuXHJcbi8vIHNwZWNpZmljIHJlbmRlciBtb2Rlc1xyXG5cclxuZnVuY3Rpb24gY29tcHV0ZVF1YXRzKGJvbmVJZCwgZGF0YWJhc2UsIGluc3RhbmNlcywgcGFyZW50Um90YXRpb25zLCBvdXRwdXRSb3RhdGlvbnMpIHtcclxuXHJcbiAgICBxdWF0TXVsU2hhZGVyLnVzZSgpO1xyXG5cclxuICAgIHNldHVwRmxhdFJlbmRlcigpO1xyXG4gICAgc2V0dXBSZW5kZXJUb1RleHR1cmUob3V0cHV0Um90YXRpb25zLCA2NCwgNjQpO1xyXG5cclxuICAgIGdsLnVuaWZvcm0xZihxdWF0TXVsU2hhZGVyLmJvbmVJZCwgYm9uZUlkKTtcclxuXHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGRhdGFiYXNlKTtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTEpO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgaW5zdGFuY2VzKTtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTIpO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgcGFyZW50Um90YXRpb25zKTtcclxuXHJcbiAgICBkcmF3RmxhdCgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb21wdXRlT2Zmc2V0cyhvZmZzZXQsIHJvdGF0aW9ucywgcGFyZW50T2Zmc2V0cywgb3V0cHV0T2Zmc2V0cykge1xyXG5cclxuICAgIG9mZnNldEFkZFNoYWRlci51c2UoKTtcclxuXHJcbiAgICBzZXR1cEZsYXRSZW5kZXIoKTtcclxuICAgIHNldHVwUmVuZGVyVG9UZXh0dXJlKG91dHB1dE9mZnNldHMsIDY0LCA2NCk7XHJcblxyXG4gICAgZ2wudW5pZm9ybTNmdihvZmZzZXRBZGRTaGFkZXIuYm9uZU9mZnNldCwgb2Zmc2V0KTtcclxuXHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHJvdGF0aW9ucyk7XHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUxKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHBhcmVudE9mZnNldHMpO1xyXG5cclxuICAgIGRyYXdGbGF0KCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdGbGF0KCkge1xyXG4gICAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIHNjcmVlblRyaWFuZ2xlU3RhcnQsIHNjcmVlblRyaWFuZ2xlU2l6ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFyKCkge1xyXG4gICAgZ2wuY2xlYXJDb2xvcigxLCAwLCAwLCAxKTtcclxuICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQgfCBnbC5ERVBUSF9CVUZGRVJfQklUKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBTY2VuZShQcm9qZWN0aW9uLCBWaWV3KSB7XHJcblxyXG4gICAgc2NlbmVTaGFkZXIudXNlKCk7XHJcblxyXG4gICAgc2V0dXAzRFJlbmRlcigpO1xyXG4gICAgc2V0dXBSZW5kZXJUb0Zyb250QnVmZmVyKCk7XHJcblxyXG4gICAgZ2wudW5pZm9ybU1hdHJpeDRmdihzY2VuZVNoYWRlci5Qcm9qZWN0aW9uLCBnbC5GQUxTRSwgUHJvamVjdGlvbik7XHJcbiAgICBnbC51bmlmb3JtTWF0cml4NGZ2KHNjZW5lU2hhZGVyLlZpZXcsIGdsLkZBTFNFLCBWaWV3KTtcclxuXHJcbiAgICBjbGVhcigpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFBvc2l0aW9ucyhYLCBZLCBaKSB7XHJcblxyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMik7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBYKTtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTMpO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgWSk7XHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkU0KTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIFopO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3SW5zdGFuY2VzKFJvdGF0aW9ucywgT2Zmc2V0cywgU2l6ZSwgTWlkZGxlVHJhbnNsYXRpb24sIEluc3RhbmNlc0NvdW50KSB7XHJcblxyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBSb3RhdGlvbnMpO1xyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMSk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBPZmZzZXRzKTtcclxuXHJcbiAgICBnbC51bmlmb3JtM2Z2KHNjZW5lU2hhZGVyLlNpemUsIFNpemUpO1xyXG4gICAgZ2wudW5pZm9ybTNmdihzY2VuZVNoYWRlci5NaWRkbGVUcmFuc2xhdGlvbiwgTWlkZGxlVHJhbnNsYXRpb24pO1xyXG5cclxuICAgIGdsLmRyYXdBcnJheXMoZ2wuVFJJQU5HTEVTLCBjdWJlU3RhcnQsIGN1YmVTaXplICogSW5zdGFuY2VzQ291bnQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3VGV4dHVyZSh0ZXgpIHtcclxuXHJcbiAgICB0ZXhPdXRwdXRTaGFkZXIudXNlKCk7XHJcblxyXG4gICAgc2V0dXBGbGF0UmVuZGVyKCk7XHJcbiAgICBzZXR1cFJlbmRlclRvRnJvbnRCdWZmZXIoKTtcclxuXHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRleCk7XHJcblxyXG4gICAgZ2wudW5pZm9ybTFmKHRleE91dHB1dFNoYWRlci5pbnZPdXRwdXRTaXplLCAxLjAgLyBzY3JlZW5XaWR0aCk7XHJcblxyXG4gICAgZHJhd0ZsYXQoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY29tcGlsZVNoYWRlcihuYW1lLCB2ZXJ0ZXhTaGFkZXJDb2RlLCBmcmFnbWVudFNoYWRlckNvZGUsIHVuaWZvcm1zKSB7XHJcblxyXG4gICAgY29uc3QgdmVydGV4U2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKGdsLlZFUlRFWF9TSEFERVIpO1xyXG4gICAgY29uc3QgZnJhZ21lbnRTaGFkZXIgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSKTtcclxuXHJcbiAgICBnbC5zaGFkZXJTb3VyY2UodmVydGV4U2hhZGVyLCB2ZXJ0ZXhTaGFkZXJDb2RlKTtcclxuICAgIGdsLnNoYWRlclNvdXJjZShmcmFnbWVudFNoYWRlciwgZnJhZ21lbnRTaGFkZXJDb2RlKTtcclxuXHJcbiAgICBnbC5jb21waWxlU2hhZGVyKHZlcnRleFNoYWRlcik7XHJcbiAgICBpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcih2ZXJ0ZXhTaGFkZXIsIGdsLkNPTVBJTEVfU1RBVFVTKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VSUk9SIGNvbXBpbGluZyB2ZXJ0ZXggc2hhZGVyIGZvciAnICsgbmFtZSArICchJywgZ2wuZ2V0U2hhZGVySW5mb0xvZyh2ZXJ0ZXhTaGFkZXIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgZ2wuY29tcGlsZVNoYWRlcihmcmFnbWVudFNoYWRlcik7XHJcbiAgICBpZiAoIWdsLmdldFNoYWRlclBhcmFtZXRlcihmcmFnbWVudFNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignRVJST1IgY29tcGlsaW5nIGZyYWdtZW50IHNoYWRlciBmb3IgJyArIG5hbWUgKyAnIScsIGdsLmdldFNoYWRlckluZm9Mb2coZnJhZ21lbnRTaGFkZXIpKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcclxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0ZXhTaGFkZXIpO1xyXG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdtZW50U2hhZGVyKTtcclxuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pO1xyXG4gICAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VSUk9SIGxpbmtpbmcgcHJvZ3JhbSEnLCBnbC5nZXRQcm9ncmFtSW5mb0xvZyhwcm9ncmFtKSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZ2wudmFsaWRhdGVQcm9ncmFtKHByb2dyYW0pO1xyXG4gICAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLlZBTElEQVRFX1NUQVRVUykpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdFUlJPUiB2YWxpZGF0aW5nIHByb2dyYW0hJywgZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSkpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbnN0YW5jZSA9IHtcclxuICAgICAgICBwcm9ncmFtOiBwcm9ncmFtLFxyXG5cclxuICAgICAgICB1c2U6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgZ2wudXNlUHJvZ3JhbSh0aGlzLnByb2dyYW0pO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdW5pZm9ybXMuZm9yRWFjaChmdW5jdGlvbiAodW5pZm9ybSkge1xyXG4gICAgICAgIGluc3RhbmNlW3VuaWZvcm1dID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIHVuaWZvcm0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGluc3RhbmNlO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5pbml0aWFsaXplID0gaW5pdGlhbGl6ZTtcclxubW9kdWxlLmV4cG9ydHMuc2V0U2NyZWVuU2l6ZSA9IHNldFNjcmVlblNpemU7XHJcbm1vZHVsZS5leHBvcnRzLmdldEFzcGVjdFJhdGlvID0gZ2V0QXNwZWN0UmF0aW87XHJcbm1vZHVsZS5leHBvcnRzLmNvbXB1dGVRdWF0cyA9IGNvbXB1dGVRdWF0cztcclxubW9kdWxlLmV4cG9ydHMuY29tcHV0ZU9mZnNldHMgPSBjb21wdXRlT2Zmc2V0cztcclxubW9kdWxlLmV4cG9ydHMuc2V0dXBTY2VuZSA9IHNldHVwU2NlbmU7XHJcbm1vZHVsZS5leHBvcnRzLnNldHVwUG9zaXRpb25zID0gc2V0dXBQb3NpdGlvbnM7XHJcbm1vZHVsZS5leHBvcnRzLmRyYXdJbnN0YW5jZXMgPSBkcmF3SW5zdGFuY2VzO1xyXG5tb2R1bGUuZXhwb3J0cy5kcmF3VGV4dHVyZSA9IGRyYXdUZXh0dXJlOyIsImNvbnN0IHZlYzMgPSByZXF1aXJlKCdnbC1tYXRyaXgnKS52ZWMzO1xyXG5cclxuZnVuY3Rpb24gZHVwbGljYXRlUGl4ZWwoc2l6ZSwgcGl4ZWwpIHtcclxuXHJcbiAgICBjb25zdCBsZW4gPSBzaXplICogc2l6ZSAqIDQ7XHJcbiAgICBjb25zdCByZXN1bHQgPSBuZXcgVWludDhBcnJheShsZW4pO1xyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspXHJcbiAgICAgICAgcmVzdWx0W2ldID0gcGl4ZWxbaSAlIDRdO1xyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZWRfZmxvYXRfdG9fY29sb3IoZikge1xyXG4gICAgcmV0dXJuIE1hdGgucm91bmQoZiAqIDEyNykgKyAxMjc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRfdG9fY29sb3IodCkge1xyXG4gICAgcmV0dXJuIE1hdGgucm91bmQodCAqIDI1NS4wKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbGVuZ3RoX3RvX2NvbG9yKGwpIHtcclxuICAgIHJldHVybiB0X3RvX2NvbG9yKGwgLyAyLjApOyAvLyBtYXggbGVuIGlzIDIuMFxyXG59XHJcblxyXG5mdW5jdGlvbiBxdWF0X3RvX3BpeGVsKHEpIHtcclxuXHJcbiAgICBjb25zdCByID0gbm9ybWFsaXplZF9mbG9hdF90b19jb2xvcihxWzBdKTtcclxuICAgIGNvbnN0IGcgPSBub3JtYWxpemVkX2Zsb2F0X3RvX2NvbG9yKHFbMV0pO1xyXG4gICAgY29uc3QgYiA9IG5vcm1hbGl6ZWRfZmxvYXRfdG9fY29sb3IocVsyXSk7XHJcbiAgICBjb25zdCBhID0gbm9ybWFsaXplZF9mbG9hdF90b19jb2xvcihxWzNdKTtcclxuXHJcbiAgICByZXR1cm4gW3IsIGcsIGIsIGFdO1xyXG59XHJcblxyXG5mdW5jdGlvbiB2ZWNfdG9fcGl4ZWwodikge1xyXG5cclxuICAgIGNvbnN0IGwgPSB2ZWMzLmxlbmd0aCh2KTtcclxuXHJcbiAgICBjb25zdCByID0gbm9ybWFsaXplZF9mbG9hdF90b19jb2xvcihsID4gMCA/IHZbMF0gLyBsIDogMCk7XHJcbiAgICBjb25zdCBnID0gbm9ybWFsaXplZF9mbG9hdF90b19jb2xvcihsID4gMCA/IHZbMV0gLyBsIDogMCk7XHJcbiAgICBjb25zdCBiID0gbm9ybWFsaXplZF9mbG9hdF90b19jb2xvcihsID4gMCA/IHZbMl0gLyBsIDogMCk7XHJcblxyXG4gICAgY29uc3QgYSA9IGxlbmd0aF90b19jb2xvcihsKTtcclxuXHJcbiAgICByZXR1cm4gW3IsIGcsIGIsIGFdO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5kdXBsaWNhdGVQaXhlbCA9IGR1cGxpY2F0ZVBpeGVsO1xyXG5tb2R1bGUuZXhwb3J0cy5xdWF0X3RvX3BpeGVsID0gcXVhdF90b19waXhlbDtcclxubW9kdWxlLmV4cG9ydHMudmVjX3RvX3BpeGVsID0gdmVjX3RvX3BpeGVsO1xyXG5tb2R1bGUuZXhwb3J0cy50X3RvX2NvbG9yID0gdF90b19jb2xvcjsiLCJsZXQgc3RhdGUgPSAwO1xyXG5sZXQgZG9uZUNhbGxiYWNrO1xyXG5sZXQgZ2w7XHJcblxyXG5mdW5jdGlvbiBpbml0aWFsaXplKF9nbCwgY2FsbGJhY2spIHtcclxuXHJcbiAgICBnbCA9IF9nbDtcclxuICAgIGRvbmVDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG5cclxuICAgIGxvYWRBbGxSZXNvdXJjZXMoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWR2YW5jZVN0YXRlKCkge1xyXG5cclxuICAgIGlmIChzdGF0ZSA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihcInJlc291cmNlTG9hZGVyOiBzdGF0ZSBpcyBhZHZhbmNlZCBiZXlvbmQgZmluaXNoIHN0YXRlXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0ZS0tO1xyXG4gICAgaWYgKHN0YXRlID09PSAwKVxyXG4gICAgICAgIGRvbmVDYWxsYmFjaygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBsb2FkVGV4dHVyZSh1cmwsIG5lYXJlc3QpIHtcclxuXHJcbiAgICBjb25zdCB0ZXggPSBnbC5jcmVhdGVUZXh0dXJlKCk7XHJcblxyXG4gICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcclxuICAgIGltYWdlLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgICAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0ZXgpO1xyXG4gICAgICAgIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZ2wuUkdCQSwgZ2wuUkdCQSwgZ2wuVU5TSUdORURfQllURSwgaW1hZ2UpO1xyXG5cclxuICAgICAgICBzZXR1cFRleHR1cmVGaWx0ZXJpbmcodGV4LCBuZWFyZXN0KTtcclxuXHJcbiAgICAgICAgYWR2YW5jZVN0YXRlKCk7XHJcbiAgICB9O1xyXG4gICAgaW1hZ2Uuc3JjID0gdXJsO1xyXG5cclxuICAgIHJldHVybiB0ZXg7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUoc2l6ZSwgbmVhcmVzdCkge1xyXG4gICAgcmV0dXJuIGNyZWF0ZVRleHR1cmVXaXRoRGF0YShzaXplLCBuZWFyZXN0LCBudWxsKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlVGV4dHVyZVdpdGhEYXRhKHNpemUsIG5lYXJlc3QsIHBpeGVscykge1xyXG5cclxuICAgIGNvbnN0IHRleCA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcclxuXHJcbiAgICB1cGRhdGVUZXh0dXJlKHRleCwgc2l6ZSwgcGl4ZWxzKTtcclxuXHJcbiAgICBzZXR1cFRleHR1cmVGaWx0ZXJpbmcodGV4LCBuZWFyZXN0KTtcclxuXHJcbiAgICByZXR1cm4gdGV4O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFRleHR1cmVGaWx0ZXJpbmcodGV4LCBuZWFyZXN0KSB7XHJcblxyXG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGV4KTtcclxuXHJcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1QsIGdsLkNMQU1QX1RPX0VER0UpO1xyXG5cclxuICAgIGlmIChuZWFyZXN0KSB7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLk5FQVJFU1QpO1xyXG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5ORUFSRVNUKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUik7XHJcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGdsLkxJTkVBUik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVRleHR1cmUodGV4LCBzaXplLCBwaXhlbHMpIHtcclxuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRleCk7XHJcbiAgICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLlJHQkEsIHNpemUsIHNpemUsIDAsIGdsLlJHQkEsIGdsLlVOU0lHTkVEX0JZVEUsIHBpeGVscyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvYWRKc29uKHVybCkge1xyXG5cclxuICAgIGNvbnN0IGpzb24gPSB7IGNvbnRlbnQ6IG51bGwgfTtcclxuXHJcbiAgICBjb25zdCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgIHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpO1xyXG4gICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcclxuICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcclxuXHJcbiAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMClcclxuICAgICAgICAgICAganNvbi5jb250ZW50ID0geGhyLnJlc3BvbnNlO1xyXG5cclxuICAgICAgICBhZHZhbmNlU3RhdGUoKTtcclxuICAgIH07XHJcbiAgICB4aHIuc2VuZCgpO1xyXG5cclxuICAgIHJldHVybiBqc29uO1xyXG59XHJcblxyXG5sZXQgZGF0YWJhc2UsIGRhdGFiYXNlTWFwO1xyXG5cclxuZnVuY3Rpb24gbG9hZEFsbFJlc291cmNlcygpIHtcclxuXHJcbiAgICBpZiAoc3RhdGUgIT09IDApXHJcbiAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgIHN0YXRlID0gMjtcclxuXHJcbiAgICBkYXRhYmFzZSA9IGxvYWRUZXh0dXJlKCcvV2ViRW5naW5lVGVzdC9idWlsZC9kYXRhYmFzZS5wbmcnLCBmYWxzZSk7XHJcbiAgICBkYXRhYmFzZU1hcCA9IGxvYWRKc29uKCcvV2ViRW5naW5lVGVzdC9idWlsZC9kYXRhYmFzZV9tYXAuanNvbicpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXREYXRhYmFzZSgpIHtcclxuICAgIHJldHVybiBkYXRhYmFzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RGF0YWJhc2VNYXAoKSB7XHJcbiAgICByZXR1cm4gZGF0YWJhc2VNYXA7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzLmluaXRpYWxpemUgPSBpbml0aWFsaXplO1xyXG5tb2R1bGUuZXhwb3J0cy5jcmVhdGVUZXh0dXJlID0gY3JlYXRlVGV4dHVyZTtcclxubW9kdWxlLmV4cG9ydHMuY3JlYXRlVGV4dHVyZVdpdGhEYXRhID0gY3JlYXRlVGV4dHVyZVdpdGhEYXRhO1xyXG5tb2R1bGUuZXhwb3J0cy51cGRhdGVUZXh0dXJlID0gdXBkYXRlVGV4dHVyZTtcclxubW9kdWxlLmV4cG9ydHMuZ2V0RGF0YWJhc2UgPSBnZXREYXRhYmFzZTtcclxubW9kdWxlLmV4cG9ydHMuZ2V0RGF0YWJhc2VNYXAgPSBnZXREYXRhYmFzZU1hcDsiLCIvLyBzaGFkZXJzIHN0YXJ0XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5vZmZzZXRSb3RhdGl0aW9uQW5kQWRkaXRpb25GcmFnbWVudFNoYWRlciA9IFxyXG4gICAgJ3ByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIHJvdGF0aW9ucztcXG4nICtcclxuICAgICd1bmlmb3JtIHNhbXBsZXIyRCBwYXJlbnRPZmZzZXRzO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gdmVjMyBib25lT2Zmc2V0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzQgY29sb3JfdG9fcXVhdCh2ZWM0IGNvbG9yKSB7XFxuJyArXHJcbiAgICAnICAgIHJldHVybiBjb2xvciAqICgyNTUuMCAvIDEyNy4wKSAtIDEuMDtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjNCBxdWF0X211bCh2ZWM0IHExLCB2ZWM0IHEyKSB7XFxuJyArXHJcbiAgICAnXHRyZXR1cm4gdmVjNChcXG4nICtcclxuICAgICdcdFx0cTIueHl6ICogcTEudyArIHExLnh5eiAqIHEyLncgKyBjcm9zcyhxMS54eXosIHEyLnh5eiksXFxuJyArXHJcbiAgICAnXHRcdHExLncgKiBxMi53IC0gZG90KHExLnh5eiwgcTIueHl6KVxcbicgK1xyXG4gICAgJ1x0KTtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjMyByb3RhdGVfdmVjdG9yKHZlYzMgdiwgdmVjNCByKSB7XFxuJyArXHJcbiAgICAnXHR2ZWM0IHJfYyA9IHIgKiB2ZWM0KC0xLCAtMSwgLTEsIDEpO1xcbicgK1xyXG4gICAgJ1x0cmV0dXJuIHF1YXRfbXVsKHIsIHF1YXRfbXVsKHZlYzQodiwgMCksIHJfYykpLnh5ejtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjMyBjb2xvcl90b19vZmZzZXQodmVjNCBjb2xvcikge1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBmbG9hdCBsZW4gPSBjb2xvci53ICogMi4wO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICByZXR1cm4gKGNvbG9yLnh5eiAqICgyNTUuMCAvIDEyNy4wKSAtIDEuMCkgKiBsZW47XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzQgb2Zmc2V0X3RvX2NvbG9yKHZlYzMgb2Zmc2V0KSB7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIGZsb2F0IGxlbiA9IGxlbmd0aChvZmZzZXQpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IHJlc3VsdDtcXG4nICtcclxuICAgICcgICAgcmVzdWx0Lnh5eiA9IChvZmZzZXQgLyBsZW4gKyAxLjApICogKDEyNy4wIC8gMjU1LjApO1xcbicgK1xyXG4gICAgJyAgICByZXN1bHQudyA9IGxlbiAvIDIuMDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgcmV0dXJuIHJlc3VsdDtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIHZlYzIgY3VycmVudFBvc2l0aW9uID0gdmVjMihnbF9GcmFnQ29vcmQueCwgZ2xfRnJhZ0Nvb3JkLnkpIC8gNjQuMDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjNCByb3RhdGlvblEgPSBjb2xvcl90b19xdWF0KHRleHR1cmUyRChyb3RhdGlvbnMsIGN1cnJlbnRQb3NpdGlvbikpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIHJvdGF0ZWRfb2Zmc2V0ID0gcm90YXRlX3ZlY3Rvcihib25lT2Zmc2V0LCByb3RhdGlvblEpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIHBhcmVudF9vZmZzZXQgPSBjb2xvcl90b19vZmZzZXQodGV4dHVyZTJEKHBhcmVudE9mZnNldHMsIGN1cnJlbnRQb3NpdGlvbikpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIHJlc3VsdCA9IHBhcmVudF9vZmZzZXQgKyByb3RhdGVkX29mZnNldDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgZ2xfRnJhZ0RhdGFbMF0gPSBvZmZzZXRfdG9fY29sb3IocmVzdWx0KTtcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLm9mZnNldFJvdGF0aXRpb25BbmRBZGRpdGlvblZlcnRleFNoYWRlciA9IFxyXG4gICAgJ3ByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ2F0dHJpYnV0ZSB2ZWMzIFZlcnRleFBvc2l0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoVmVydGV4UG9zaXRpb24sIDEuMCk7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5xdWF0ZXJuaW9uTXVsdGlwbGljYXRpb25GcmFnbWVudFNoYWRlciA9IFxyXG4gICAgJ3ByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIGRhdGFiYXNlO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIGluc3RhbmNlcztcXG4nICtcclxuICAgICd1bmlmb3JtIHNhbXBsZXIyRCBwYXJlbnRSb3RhdGlvbnM7XFxuJyArXHJcbiAgICAndW5pZm9ybSBmbG9hdCBib25lSWQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjNCBjb2xvcl90b19xdWF0KHZlYzQgY29sb3IpIHtcXG4nICtcclxuICAgICcgICAgcmV0dXJuIGNvbG9yICogKDI1NS4wIC8gMTI3LjApIC0gMS4wO1xcbicgK1xyXG4gICAgJ31cXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICd2ZWM0IHF1YXRfdG9fY29sb3IodmVjNCBxdWF0KSB7XFxuJyArXHJcbiAgICAnICAgIHJldHVybiAocXVhdCArIDEuMCkgKiAoMTI3LjAgLyAyNTUuMCk7XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzQgcXVhdF9tdWwodmVjNCBxMSwgdmVjNCBxMikge1xcbicgK1xyXG4gICAgJ1x0cmV0dXJuIHZlYzQoXFxuJyArXHJcbiAgICAnXHRcdHEyLnh5eiAqIHExLncgKyBxMS54eXogKiBxMi53ICsgY3Jvc3MocTEueHl6LCBxMi54eXopLFxcbicgK1xyXG4gICAgJ1x0XHRxMS53ICogcTIudyAtIGRvdChxMS54eXosIHEyLnh5eilcXG4nICtcclxuICAgICdcdCk7XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICB2ZWMyIGN1cnJlbnRQb3NpdGlvbiA9IHZlYzIoZ2xfRnJhZ0Nvb3JkLngsIGdsX0ZyYWdDb29yZC55KSAvIDY0LjA7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzQgaW5zdGFuY2VJbmZvID0gdGV4dHVyZTJEKGluc3RhbmNlcywgY3VycmVudFBvc2l0aW9uKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgZmxvYXQgc3RyaWRlID0gaW5zdGFuY2VJbmZvLncgKiAoMjU1LjAgLyAyNTYuMCkgKyAoMS4wIC8gMjU2LjApO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBmbG9hdCBkYXRhYmFzZV94ID1cXG4nICtcclxuICAgICcgICAgICAgIGluc3RhbmNlSW5mby54ICogKDI1NS4wIC8gMjU2LjApICsgKDAuNSAvIDI1Ni4wKSArIC8vIGNvbG9yIHRvIFswLCAyNTVdIC8gMjU2ICsgY2VudGVyIG9mZnNldFxcbicgK1xyXG4gICAgJyAgICAgICAgaW5zdGFuY2VJbmZvLnogKiAoMjU1LjAgLyAyNTYuMCAvIDI1Ni4wKSArIC8vIGludGVycG9sYXRpb24gdFxcbicgK1xyXG4gICAgJyAgICAgICAgc3RyaWRlICogYm9uZUlkO1xcbicgK1xyXG4gICAgJyAgICBmbG9hdCBkYXRhYmFzZV95ID1cXG4nICtcclxuICAgICcgICAgICAgIGluc3RhbmNlSW5mby55ICogKDI1NS4wIC8gMjU2LjApICsgKDAuNSAvIDI1Ni4wKTsgLy8gY29sb3IgdG8gWzAsIDI1NV0gLyAyNTYgKyBjZW50ZXIgb2Zmc2V0XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzIgZGF0YWJhc2VQb3NpdGlvbiA9IHZlYzIoZGF0YWJhc2VfeCwgZGF0YWJhc2VfeSk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzQgcmVsYXRpdmVSb3RhdGlvblEgPSBjb2xvcl90b19xdWF0KHRleHR1cmUyRChkYXRhYmFzZSwgZGF0YWJhc2VQb3NpdGlvbikpO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWM0IHBhcmVudFJvdGF0aW9uUSA9IGNvbG9yX3RvX3F1YXQodGV4dHVyZTJEKHBhcmVudFJvdGF0aW9ucywgY3VycmVudFBvc2l0aW9uKSk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzQgb3V0cHV0X3F1YXQgPSBxdWF0X211bChyZWxhdGl2ZVJvdGF0aW9uUSwgcGFyZW50Um90YXRpb25RKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgZ2xfRnJhZ0RhdGFbMF0gPSBxdWF0X3RvX2NvbG9yKG91dHB1dF9xdWF0KTtcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLnF1YXRlcm5pb25NdWx0aXBsaWNhdGlvblZlcnRleFNoYWRlciA9IFxyXG4gICAgJ3ByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ2F0dHJpYnV0ZSB2ZWMzIFZlcnRleFBvc2l0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoVmVydGV4UG9zaXRpb24sIDEuMCk7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5zY2VuZUZyYWdtZW50U2hhZGVyID0gXHJcbiAgICAncHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmFyeWluZyB2ZWMzIENhbWVyYU5vcm1hbDtcXG4nICtcclxuICAgICd2YXJ5aW5nIHZlYzMgQ2FtZXJhTGlnaHREaXJlY3Rpb247XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIHZlYzQgTWF0ZXJpYWxDb2xvciA9IHZlYzQoMSwgMSwgMSwgMSk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzMgTm9ybWFsID0gbm9ybWFsaXplKENhbWVyYU5vcm1hbCk7XFxuJyArXHJcbiAgICAnICAgIHZlYzMgTGlnaHREaXJlY3Rpb24gPSBub3JtYWxpemUoQ2FtZXJhTGlnaHREaXJlY3Rpb24pO1xcbicgK1xyXG4gICAgJyAgICBmbG9hdCBjb3NUaGV0YSA9IGNsYW1wKGRvdChOb3JtYWwsIExpZ2h0RGlyZWN0aW9uKSwgMC4wLCAxLjApO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICB2ZWMzIExpZ2h0QW1iaWVudENvbG9yID0gdmVjMygwLjMsIDAuMywgMC4zKTtcXG4nICtcclxuICAgICcgICAgdmVjMyBMaWdodERpZmZ1c2VDb2xvciA9IHZlYzMoMS4wLCAxLjAsIDEuMCk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIGdsX0ZyYWdDb2xvciA9XFxuJyArXHJcbiAgICAnICAgICAgICBNYXRlcmlhbENvbG9yICogdmVjNChMaWdodEFtYmllbnRDb2xvciwgMSkgK1xcbicgK1xyXG4gICAgJyAgICAgICAgTWF0ZXJpYWxDb2xvciAqIHZlYzQoTGlnaHREaWZmdXNlQ29sb3IsIDEpICogY29zVGhldGE7XFxuJyArXHJcbiAgICAnfVxcbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5zY2VuZVZlcnRleFNoYWRlciA9IFxyXG4gICAgJ3ByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ2F0dHJpYnV0ZSB2ZWMzIFZlcnRleFBvc2l0aW9uO1xcbicgK1xyXG4gICAgJ2F0dHJpYnV0ZSB2ZWMzIFZlcnRleE5vcm1hbDtcXG4nICtcclxuICAgICdhdHRyaWJ1dGUgdmVjMiBJbnN0YW5jZUNvb3JkO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZhcnlpbmcgdmVjMyBDYW1lcmFOb3JtYWw7XFxuJyArXHJcbiAgICAndmFyeWluZyB2ZWMzIENhbWVyYUxpZ2h0RGlyZWN0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIFJvdGF0aW9ucztcXG4nICtcclxuICAgICd1bmlmb3JtIHNhbXBsZXIyRCBPZmZzZXRzO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gc2FtcGxlcjJEIFBvc2l0aW9uc1g7XFxuJyArXHJcbiAgICAndW5pZm9ybSBzYW1wbGVyMkQgUG9zaXRpb25zWTtcXG4nICtcclxuICAgICd1bmlmb3JtIHNhbXBsZXIyRCBQb3NpdGlvbnNaO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gbWF0NCBQcm9qZWN0aW9uO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gbWF0NCBWaWV3O1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gdmVjMyBTaXplO1xcbicgK1xyXG4gICAgJ3VuaWZvcm0gdmVjMyBNaWRkbGVUcmFuc2xhdGlvbjtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICd2ZWM0IHF1YXRfbXVsKHZlYzQgcTEsIHZlYzQgcTIpIHtcXG4nICtcclxuICAgICdcdHJldHVybiB2ZWM0KFxcbicgK1xyXG4gICAgJ1x0XHRxMi54eXogKiBxMS53ICsgcTEueHl6ICogcTIudyArIGNyb3NzKHExLnh5eiwgcTIueHl6KSxcXG4nICtcclxuICAgICdcdFx0cTEudyAqIHEyLncgLSBkb3QocTEueHl6LCBxMi54eXopXFxuJyArXHJcbiAgICAnXHQpO1xcbicgK1xyXG4gICAgJ31cXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICd2ZWMzIHJvdGF0ZV92ZWN0b3IodmVjMyB2LCB2ZWM0IHIpIHtcXG4nICtcclxuICAgICdcdHZlYzQgcl9jID0gciAqIHZlYzQoLTEsIC0xLCAtMSwgMSk7XFxuJyArXHJcbiAgICAnXHRyZXR1cm4gcXVhdF9tdWwociwgcXVhdF9tdWwodmVjNCh2LCAwKSwgcl9jKSkueHl6O1xcbicgK1xyXG4gICAgJ31cXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICd2ZWM0IGNvbG9yX3RvX3F1YXQodmVjNCBjb2xvcikge1xcbicgK1xyXG4gICAgJyAgICByZXR1cm4gY29sb3IgKiAoMjU1LjAgLyAxMjcuMCkgLSAxLjA7XFxuJyArXHJcbiAgICAnfVxcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZlYzMgY29sb3JfdG9fb2Zmc2V0KHZlYzQgY29sb3IpIHtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgZmxvYXQgbGVuID0gY29sb3IudyAqIDIuMDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgcmV0dXJuIChjb2xvci54eXogKiAoMjU1LjAgLyAxMjcuMCkgLSAxLjApICogbGVuO1xcbicgK1xyXG4gICAgJ31cXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcjZGVmaW5lIHByZWNpc2lvbiAxMDAwLjBcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICdmbG9hdCBjb2xvcl90b19mbG9hdCh2ZWM0IGNvbG9yKSB7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICByZXR1cm5cXG4nICtcclxuICAgICcgICAgKFxcbicgK1xyXG4gICAgJyAgICBjb2xvci5yICogKDI1NS4wIC8gcHJlY2lzaW9uKSArXFxuJyArXHJcbiAgICAnICAgIGNvbG9yLmcgKiAoMjU2LjAgKiAyNTUuMCAvIHByZWNpc2lvbikgK1xcbicgK1xyXG4gICAgJyAgICBjb2xvci5iICogKDI1Ni4wICogMjU2LjAgKiAyNTUuMCAvIHByZWNpc2lvbilcXG4nICtcclxuICAgICcgICAgKSAqIChjb2xvci5hICogMi4wIC0gMS4wKTtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndmVjMyBnZXRfcG9zaXRpb24odmVjMiBjb29yZCkge1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICByZXR1cm4gdmVjM1xcbicgK1xyXG4gICAgJyAgICAoXFxuJyArXHJcbiAgICAnICAgICAgICBjb2xvcl90b19mbG9hdCh0ZXh0dXJlMkQoUG9zaXRpb25zWCwgY29vcmQpKSxcXG4nICtcclxuICAgICcgICAgICAgIGNvbG9yX3RvX2Zsb2F0KHRleHR1cmUyRChQb3NpdGlvbnNZLCBjb29yZCkpLFxcbicgK1xyXG4gICAgJyAgICAgICAgY29sb3JfdG9fZmxvYXQodGV4dHVyZTJEKFBvc2l0aW9uc1osIGNvb3JkKSlcXG4nICtcclxuICAgICcgICAgKTtcXG4nICtcclxuICAgICd9XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndm9pZCBtYWluKClcXG4nICtcclxuICAgICd7XFxuJyArXHJcbiAgICAnICAgIHZlYzQgUm90YXRpb24gPSBjb2xvcl90b19xdWF0KHRleHR1cmUyRChSb3RhdGlvbnMsIEluc3RhbmNlQ29vcmQpKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgdmVjMyBSb290UG9zaXRpb24gPSBnZXRfcG9zaXRpb24oSW5zdGFuY2VDb29yZCk7XFxuJyArXHJcbiAgICAnICAgIHZlYzMgT2Zmc2V0ID0gY29sb3JfdG9fb2Zmc2V0KHRleHR1cmUyRChPZmZzZXRzLCBJbnN0YW5jZUNvb3JkKSk7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzMgUG9zaXRpb24gPSBSb290UG9zaXRpb24gKyBPZmZzZXQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIHZlYzMgV29ybGRWZXJ0ZXhQb3NpdGlvbiA9IHJvdGF0ZV92ZWN0b3IoVmVydGV4UG9zaXRpb24gKiBTaXplICsgTWlkZGxlVHJhbnNsYXRpb24sIFJvdGF0aW9uKSArIFBvc2l0aW9uO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJyAgICBnbF9Qb3NpdGlvbiA9IFByb2plY3Rpb24gKiBWaWV3ICogdmVjNChXb3JsZFZlcnRleFBvc2l0aW9uLCAxKTtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICcgICAgQ2FtZXJhTGlnaHREaXJlY3Rpb24gPSAtKFZpZXcgKiB2ZWM0KFdvcmxkVmVydGV4UG9zaXRpb24sIDEpKS54eXo7XFxuJyArXHJcbiAgICAnICAgIENhbWVyYU5vcm1hbCA9IChWaWV3ICogdmVjNChyb3RhdGVfdmVjdG9yKFZlcnRleE5vcm1hbCwgUm90YXRpb24pLCAwKSkueHl6O1xcbicgK1xyXG4gICAgJ31cXG4nO1xyXG5cclxubW9kdWxlLmV4cG9ydHMudGV4dHVyZU91dHB1dEZyYWdtZW50U2hhZGVyID0gXHJcbiAgICAncHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAndW5pZm9ybSBzYW1wbGVyMkQgaW5wdXRUZXg7XFxuJyArXHJcbiAgICAndW5pZm9ybSBmbG9hdCBpbnZPdXRwdXRTaXplO1xcbicgK1xyXG4gICAgJ1xcbicgK1xyXG4gICAgJ3ZvaWQgbWFpbigpXFxuJyArXHJcbiAgICAne1xcbicgK1xyXG4gICAgJyAgICB2ZWMyIGN1cnJlbnRQb3NpdGlvbiA9IHZlYzIoZ2xfRnJhZ0Nvb3JkLngsIGdsX0ZyYWdDb29yZC55KSAqIGludk91dHB1dFNpemU7XFxuJyArXHJcbiAgICAnXFxuJyArXHJcbiAgICAnICAgIC8vIGdsX0ZyYWdDb2xvciA9IHZlYzQodGV4dHVyZTJEKGlucHV0VGV4LCBjdXJyZW50UG9zaXRpb24pLmEsIDAsIDAsIDEpOyAvLyByID0gYXBsaGFcXG4nICtcclxuICAgICcgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCh0ZXh0dXJlMkQoaW5wdXRUZXgsIGN1cnJlbnRQb3NpdGlvbikucmdiLCAxKTtcXG4nICtcclxuICAgICd9XFxuJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLnRleHR1cmVPdXRwdXRWZXJ0ZXhTaGFkZXIgPSBcclxuICAgICdwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICdhdHRyaWJ1dGUgdmVjMyBWZXJ0ZXhQb3NpdGlvbjtcXG4nICtcclxuICAgICdcXG4nICtcclxuICAgICd2b2lkIG1haW4oKVxcbicgK1xyXG4gICAgJ3tcXG4nICtcclxuICAgICcgICAgZ2xfUG9zaXRpb24gPSB2ZWM0KFZlcnRleFBvc2l0aW9uLCAxLjApO1xcbicgK1xyXG4gICAgJ31cXG4nO1xyXG5cclxuLy8gc2hhZGVycyBlbmRcclxuIl19
