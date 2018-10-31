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
