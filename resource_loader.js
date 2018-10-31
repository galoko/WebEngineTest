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