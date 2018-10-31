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