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