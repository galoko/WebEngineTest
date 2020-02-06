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
