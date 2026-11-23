import {i,j as j$1,a,g,o,p,k,m,n,l}from'./chunk-ED63M5HJ.js';export{b as MEDIAPIPE_SELFIE_CONFIG,d as MediaPipeSelfie,q as WebGPUBackend,c as pickMediaPipeSelfieVariant}from'./chunk-ED63M5HJ.js';export{b as DEFAULT_MEDIAPIPE_WEIGHTS_BASE_URL,a as DEFAULT_WEIGHTS_BASE_URL}from'./chunk-JXGR3YHT.js';var Nt=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,c=class{constructor(e){this.backend=e;}backend;shader="";program;samplers=[];uniformInts={};uniformFloats={};makeTexture(e,t,r){let o=this.backend.gl,i=this.backend.textureFormat,n=this.backend.toTextureView(e),s=o.createTexture();return o.bindTexture(o.TEXTURE_2D,s),o.texImage2D(o.TEXTURE_2D,0,i.internalFormat,t,r,0,i.format,i.type,n),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),s}defaultSetup(){let e=this.backend.gl,t=e.createShader(e.VERTEX_SHADER);e.shaderSource(t,Nt),e.compileShader(t);let r=e.createShader(e.FRAGMENT_SHADER);if(e.shaderSource(r,this.shader),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw new Error(`GLSL compile error: ${e.getShaderInfoLog(r)}`);if(this.program=e.createProgram(),e.attachShader(this.program,t),e.attachShader(this.program,r),e.linkProgram(this.program),!e.getProgramParameter(this.program,e.LINK_STATUS))throw new Error(`GLSL link error: ${e.getProgramInfoLog(this.program)}`)}glCache=null;run(){let e=this.backend.gl;e.useProgram(this.program);let t=this.glCache;if(!t||t.target!==this.output.texture){t&&e.deleteFramebuffer(t.fbo);let r=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,r),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.output.texture,0),t=this.glCache={samplerLocs:this.samplers.map(({name:o},i)=>{let n=e.getUniformLocation(this.program,o);return e.uniform1i(n,i),n}),ints:new Map,floats:new Map,fbo:r,target:this.output.texture};}this.samplers.forEach(({name:r,texture:o},i)=>{if(i>=t.samplerLocs.length){let n=e.getUniformLocation(this.program,r);e.uniform1i(n,i),t.samplerLocs.push(n);}e.activeTexture(e.TEXTURE0+i),e.bindTexture(e.TEXTURE_2D,o);});for(let[r,o]of Object.entries(this.uniformInts)){let i=t.ints.get(r);i||t.ints.set(r,i={loc:e.getUniformLocation(this.program,r),val:void 0}),i.val!==o&&(e.uniform1i(i.loc,o),i.val=o);}for(let[r,o]of Object.entries(this.uniformFloats)){let i=t.floats.get(r);i||t.floats.set(r,i={loc:e.getUniformLocation(this.program,r),val:void 0}),i.val!==o&&(e.uniform1f(i.loc,o),i.val=o);}e.bindFramebuffer(e.FRAMEBUFFER,t.fbo),e.viewport(0,0,this.dispatch[0],this.dispatch[1]),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var He=`#version 300 es
// Conv2d \u2014 handles all variants: 1\xD71 (pointwise), 3\xD73, 5\xD75, strided, BN-fused.
//
// Tensor layout: NHWC vec4 \u2014 texture dimensions (W * C/4, H).
//   texel (x * C_groups + c_group, y) = channels [c_group*4 .. c_group*4+3] at pixel (x,y).
//
// Weight layout: (I_groups * 4, K\xB2 * O_groups) RGBA32F texture.
//   Row  = z * u_out_c_groups + o_group   (kernel_pos outer, out_group inner)
//   Col  = i_group * 4 + mat_col          (4 texels per mat4)
//   mat4[col][row] = weight(in_channel=col, out_channel=row)
//   Operation: (mat4 * in_val)[r] = \u03A3_c weight(in=c, out=r) * in_val[c]  \u2014 same as WGSL.
//
// Bias layout: (O_groups, 1).
//
// Padding model: pad_top / pad_left applied to input offset; right/bottom asymmetry
// is handled implicitly by the bounds check, same as the WGSL implementation.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * in_C_groups, in_H)
uniform sampler2D u_weights;  // (in_C_groups * 4, K\xB2 * out_C_groups)
uniform sampler2D u_bias;     // (out_C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;   // hard-swish
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));                      // sigmoid

    fragColor = result;
}
`;var F=class extends c{inputs;weights;output;dispatch;shader=He;constructor(e,t,r,o$1){super(e);let i=k(t.h,o$1.kernel,o$1.stride,o$1.padding),n$1=k(t.w,o$1.kernel,o$1.stride,o$1.padding),s=t.c/4,u=o$1.outChannels/4,l=m(o$1.padding,t.h,i,o$1.kernel,o$1.stride),p=m(o$1.padding,t.w,n$1,o$1.kernel,o$1.stride),h=o(r.weights),m$1=o(r.bias),x=this.makeTexture(h,s*4,o$1.kernel*o$1.kernel*u),_=this.makeTexture(m$1,u,1),g=n$1*u,b=this.makeTexture(null,g,i);this.output={h:i,w:n$1,c:o$1.outChannels,texture:b,texW:g,texH:i},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:x},{name:"u_bias",texture:_}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:s,u_out_c_groups:u,u_kernel_h:o$1.kernel,u_kernel_w:o$1.kernel,u_stride:o$1.stride,u_pad_top:l,u_pad_left:p,u_activation:n(o$1.activation)},this.defaultSetup(),this.dispatch=[g,i];}};var Ie=`#version 300 es
// ConvTranspose2d \u2014 gather form. Identical texture layouts + mat4 weight
// semantics as conv2d.glsl; only the spatial mapping differs:
//   in_y = (y_out + pad - ky) / stride   (must divide evenly + be in bounds)
// No explicit kernel flip \u2014 the (y_out + pad - ky) indexing carries it.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * in_C_groups, in_H)
uniform sampler2D u_weights;  // (in_C_groups * 4, K\xB2 * out_C_groups)
uniform sampler2D u_bias;     // (out_C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int iy_num = y_out + u_pad_top  - ky;
            int ix_num = x_out + u_pad_left - kx;
            if (iy_num < 0 || ix_num < 0) continue;
            if ((iy_num % u_stride) != 0 || (ix_num % u_stride) != 0) continue;
            int in_y = iy_num / u_stride;
            int in_x = ix_num / u_stride;
            if (in_y >= u_in_h || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;   // hard-swish
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));                      // sigmoid

    fragColor = result;
}
`;var S=class extends c{inputs;weights;output;dispatch;shader=Ie;constructor(e,t,r,o$1){super(e);let i=l(t.h,o$1.kernel,o$1.stride,o$1.padding),n$1=l(t.w,o$1.kernel,o$1.stride,o$1.padding),s=t.c/4,u=o$1.outChannels/4,l$1=o(r.weights),p=o(r.bias),h=this.makeTexture(l$1,s*4,o$1.kernel*o$1.kernel*u),m=this.makeTexture(p,u,1),x=n$1*u,_=this.makeTexture(null,x,i);this.output={h:i,w:n$1,c:o$1.outChannels,texture:_,texW:x,texH:i},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:h},{name:"u_bias",texture:m}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:s,u_out_c_groups:u,u_kernel_h:o$1.kernel,u_kernel_w:o$1.kernel,u_stride:o$1.stride,u_pad_top:o$1.padding,u_pad_left:o$1.padding,u_activation:n(o$1.activation)},this.defaultSetup(),this.dispatch=[x,i];}};var Ne=`#version 300 es
// Depthwise Conv2d \u2014 groups = in_channels (each channel convolved independently).
//
// Weight layout: (C_groups, K\xB2) RGBA32F texture \u2014 contrast with conv2d which uses mat4.
//   texel (c_group, z) = vec4 kernel weights for 4 channels at kernel position z.
//   Operation: element-wise multiply (not matmul). 4\xD7 smaller than a mat4 approach.
//
// Padding model: same asymmetric SAME-pad handling as conv2d.glsl.

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (in_W * C_groups, in_H)
uniform sampler2D u_weights;  // (C_groups, K\xB2)
uniform sampler2D u_bias;     // (C_groups, 1)

uniform int u_in_w;
uniform int u_in_h;
uniform int u_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;    // 0 = none, 1 = relu6, 2 = relu, 3 = leaky(0.1), 4 = hswish, 5 = sigmoid

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_c_groups;
    int y_out   = fy;
    int c_group = fx - x_out * u_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(c_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z = ky * u_kernel_w + kx;

            vec4 in_val = texelFetch(u_input,   ivec2(in_x * u_c_groups + c_group, in_y), 0);
            vec4 w      = texelFetch(u_weights, ivec2(c_group, z), 0);

            result += w * in_val;  // element-wise multiply, not matmul
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));
    else if (u_activation == 3) result = max(result, 0.1 * result);
    else if (u_activation == 4) result = result * clamp(result + 3.0, 0.0, 6.0) / 6.0;
    else if (u_activation == 5) result = 1.0 / (1.0 + exp(-result));

    fragColor = result;
}
`;var A=class extends c{inputs;weights;output;dispatch;shader=Ne;constructor(e,t,r,o$1){super(e);let i=k(t.h,o$1.kernel,o$1.stride,o$1.padding),n$1=k(t.w,o$1.kernel,o$1.stride,o$1.padding),s=t.c/4,u=m(o$1.padding,t.h,i,o$1.kernel,o$1.stride),l=m(o$1.padding,t.w,n$1,o$1.kernel,o$1.stride),p=o(r.weights),h=o(r.bias),m$1=this.makeTexture(p,s,o$1.kernel*o$1.kernel),x=this.makeTexture(h,s,1),_=n$1*s,g=this.makeTexture(null,_,i);this.output={h:i,w:n$1,c:t.c,texture:g,texW:_,texH:i},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:m$1},{name:"u_bias",texture:x}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_c_groups:s,u_kernel_h:o$1.kernel,u_kernel_w:o$1.kernel,u_stride:o$1.stride,u_pad_top:u,u_pad_left:l,u_activation:n(o$1.activation)},this.defaultSetup(),this.dispatch=[_,i];}};var Ve=`#version 300 es
// Element-wise add \u2014 both inputs and output share the same texture dimensions.
// Works for any 2D layout; used here with a flat (nVec4, 1) texture.

precision highp float;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;

out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input_a, fc, 0) + texelFetch(u_input_b, fc, 0);
}
`;var R=class extends c{inputs;weights=[];output;dispatch;shader=Ve;constructor(e,t,r){super(e);let o=t,i=this.makeTexture(null,o.texW,o.texH);this.output={h:t.h,w:t.w,c:t.c,texture:i,texW:o.texW,texH:o.texH},this.inputs=[t,r],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:r.texture}],this.defaultSetup(),this.dispatch=[o.texW,o.texH];}};var Xe=`#version 300 es
// Element-wise sigmoid \u2014 works on any texture layout (flat or spatial).

precision highp float;

uniform sampler2D u_input;

out vec4 fragColor;

void main() {
    vec4 x = texelFetch(u_input, ivec2(gl_FragCoord.xy), 0);
    fragColor = 1.0 / (1.0 + exp(-x));
}
`;var D=class extends c{inputs;weights=[];output;dispatch;shader=Xe;constructor(e,t){super(e);let r=t,o=this.makeTexture(null,r.texW,r.texH);this.output={h:t.h,w:t.w,c:t.c,texture:o,texW:r.texW,texH:r.texH},this.inputs=[t],this.samplers=[{name:"u_input",texture:r.texture}],this.defaultSetup(),this.dispatch=[r.texW,r.texH];}};var ze=`#version 300 es
// Element-wise tanh \u2014 used by ConvGRU candidate activation.
// Layout-agnostic (flat or spatial); GLSL tanh is element-wise on vec4.

precision highp float;

uniform sampler2D u_input;

out vec4 fragColor;

void main() {
    fragColor = tanh(texelFetch(u_input, ivec2(gl_FragCoord.xy), 0));
}
`;var B=class extends c{inputs;weights=[];output;dispatch;shader=ze;constructor(e,t){super(e);let r=t,o=this.makeTexture(null,r.texW,r.texH);this.output={h:t.h,w:t.w,c:t.c,texture:o,texW:r.texW,texH:r.texH},this.inputs=[t],this.samplers=[{name:"u_input",texture:r.texture}],this.defaultSetup(),this.dispatch=[r.texW,r.texH];}};var $e=`#version 300 es
// Element-wise multiply \u2014 used in ConvGRU for r \u2299 h_prev.
// Same shape constraint as add.glsl.

precision highp float;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;

out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input_a, fc, 0) * texelFetch(u_input_b, fc, 0);
}
`;var U=class extends c{inputs;weights=[];output;dispatch;shader=$e;constructor(e,t,r){super(e);let o=t,i=this.makeTexture(null,o.texW,o.texH);this.output={h:t.h,w:t.w,c:t.c,texture:i,texW:o.texW,texH:o.texH},this.inputs=[t,r],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:r.texture}],this.defaultSetup(),this.dispatch=[o.texW,o.texH];}};var je=`#version 300 es
// Bilinear gather-warp. out[p] = sample(source, p + flow_scale\xB7flow[p].xy),
// edge-clamped. Source/output are (W\xB7G, H) with G = c/4 channel groups
// (fragment x decomposes to pixel + group, like conv); flow is 4-ch, same
// spatial resolution, vector in .xy.

precision highp float;
precision highp int;

uniform sampler2D u_source;   // (W * G, H)
uniform sampler2D u_flow;     // (W, H), flow in .xy
uniform int   u_w;
uniform int   u_h;
uniform int   u_groups;
uniform float u_flow_scale;

out vec4 fragColor;

vec4 samp(int x, int y, int g) {
    int cx = clamp(x, 0, u_w - 1);
    int cy = clamp(y, 0, u_h - 1);
    return texelFetch(u_source, ivec2(cx * u_groups + g, cy), 0);
}

void main() {
    int fx = int(gl_FragCoord.x);
    int y  = int(gl_FragCoord.y);
    int x  = fx / u_groups;
    int g  = fx - x * u_groups;

    vec2 f  = texelFetch(u_flow, ivec2(x, y), 0).xy;
    float sx = clamp(float(x) + u_flow_scale * f.x, 0.0, float(u_w - 1));
    float sy = clamp(float(y) + u_flow_scale * f.y, 0.0, float(u_h - 1));

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0, g), samp(x0 + 1, y0, g), tx);
    vec4 bot = mix(samp(x0, y0 + 1, g), samp(x0 + 1, y0 + 1, g), tx);
    fragColor = mix(top, bot, ty);
}
`;var P=class extends c{inputs;weights=[];output;dispatch;shader=je;constructor(e,t,r,o){super(e);let i=t.w,n=t.h,s=t.c/4,u=this.makeTexture(null,i*s,n);this.output={h:n,w:i,c:t.c,texture:u,texW:i*s,texH:n},this.inputs=[t,r],this.samplers=[{name:"u_source",texture:t.texture},{name:"u_flow",texture:r.texture}],this.uniformInts={u_w:i,u_h:n,u_groups:s},this.uniformFloats={u_flow_scale:o.flowScale},this.defaultSetup(),this.dispatch=[i*s,n];}};var Ke=`#version 300 es
// Face-box decode from 5-keypoint heatmaps. Output is a 1\xD71 texture:
// (cx, cy, halfSide, score) in FRAME FRACTIONS (halfSide as a fraction of
// frame WIDTH; the heatmap grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Peaks refined with a windowed soft-argmax
// centroid \u2014 NEVER hard argmax (whole-cell snapping jitters the crop).
//
// Single fragment does all 5 channels serially \u2014 the grid is tiny (\u2264 ~48\xD728).
// Heatmap texture: (w * 2, h) \u2014 8 channels = 2 vec4 groups per pixel.

precision highp float;
precision highp int;

uniform sampler2D u_hm;
uniform int u_h;
uniform int u_w;
uniform int u_win;
uniform float u_thresh;
uniform float u_box_scale;

out vec4 fragColor;

float hmAt(int x, int y, int k) {
    vec4 v = texelFetch(u_hm, ivec2(x * 2 + k / 4, y), 0);
    return v[k % 4];
}

void main() {
    float x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, score = 1e9;

    for (int k = 0; k < 5; k++) {
        // Peak.
        float peak = -1.0;
        int pr = 0, pc = 0;
        for (int y = 0; y < u_h; y++) {
            for (int x = 0; x < u_w; x++) {
                float v = hmAt(x, y, k);
                if (v > peak) { peak = v; pr = y; pc = x; }
            }
        }
        // Windowed soft-argmax centroid.
        int r0 = max(0, pr - u_win), r1 = min(u_h, pr + u_win + 1);
        int c0 = max(0, pc - u_win), c1 = min(u_w, pc + u_win + 1);
        float wsum = 0.0, sy = 0.0, sx = 0.0;
        for (int y = r0; y < r1; y++) {
            for (int x = c0; x < c1; x++) {
                float v = hmAt(x, y, k);
                wsum += v; sy += v * float(y); sx += v * float(x);
            }
        }
        wsum = max(wsum, 1e-6);
        float kx = sx / wsum, ky = sy / wsum;
        x0 = min(x0, kx); x1 = max(x1, kx);
        y0 = min(y0, ky); y1 = max(y1, ky);
        score = min(score, peak);
    }
    if (score < u_thresh) score = 0.0;

    float halfPx = 0.5 * u_box_scale * max(x1 - x0, y1 - y0);
    float cx = ((x0 + x1) * 0.5 + 0.5) / float(u_w);
    float cy = ((y0 + y1) * 0.5 + 0.5) / float(u_h);
    fragColor = vec4(cx, cy, halfPx / float(u_w), score);
}
`;var M=class extends c{inputs;weights=[];output;dispatch=[1,1];shader=Ke;constructor(e,t,r){if(super(e),t.c!==8)throw new Error(`FaceBoxFromHeatmaps: expected 8-ch heatmaps (5 real), got ${t.c}`);let o=this.makeTexture(null,1,1);this.output={h:1,w:1,c:4,texture:o,texW:1,texH:1},this.inputs=[t],this.samplers=[{name:"u_hm",texture:t.texture}],this.uniformInts={u_h:t.h,u_w:t.w,u_win:r.win},this.uniformFloats={u_thresh:r.thresh,u_box_scale:r.boxScale},this.defaultSetup();}};var Ye=`#version 300 es
// MULTI-FACE box decode from 5-keypoint heatmaps \u2192 1\xD7K texture, slot i =
// (cx, cy, halfSide, score) in FRAME FRACTIONS (halfSide a fraction of frame
// WIDTH). The multi-face sibling of face_box.glsl. See face_boxes.wgsl for the
// full algorithm commentary \u2014 this mirrors it exactly.
//
// WebGL has no compute and no shared memory, so each fragment (= one face slot)
// independently redoes the ENTIRE decode \u2014 candidates for all 5 channels,
// hypotheses, NMS \u2014 and emits the slot matching its own x. That's K\xD7 redundant
// work, which is fine here: the grid is \u2264 ~48\xD728 and K \u2264 6, and it keeps the
// WGSL and GLSL paths line-for-line comparable.
//
// Heatmap texture: (w * 2, h) \u2014 8 channels = 2 vec4 groups per pixel.

precision highp float;
precision highp int;

uniform sampler2D u_hm;
uniform int u_h;
uniform int u_w;
uniform int u_win;
uniform float u_thresh;
uniform float u_box_scale;
uniform int u_max_faces;
uniform float u_tol;

out vec4 fragColor;

const int N_KP     = 5;
const int MAX_CAND = 5;
const float LAMBDA  = 0.5;
const float MIN_SEP = 1.0;
const float MIN_EYE = 1.0;

float c_x[25];
float c_y[25];
float c_s[25];
int   c_n[5];

float hmAt(int x, int y, int k) {
    vec4 v = texelFetch(u_hm, ivec2(x * 2 + k / 4, y), 0);
    return v[k % 4];
}

// ArcFace canonical template in the eye frame (origin = L-eye, +u along the
// L\u2192R eye vector, +w perpendicular), normalized by interocular distance.
float tmplU(int t) { return t == 0 ? 0.50002 : (t == 1 ? 0.08598 : 0.91410); }
float tmplW(int t) { return t == 0 ? 0.57150 : 1.15462; }

void main() {
    int myFace = int(gl_FragCoord.x);

    // \u2500\u2500 stage 1: local-maximum candidates, per channel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    for (int k = 0; k < N_KP; k++) {
        int   pr[5];
        int   pc[5];
        float ps[5];
        int n = 0;

        for (int y = 0; y < u_h; y++) {
            for (int x = 0; x < u_w; x++) {
                float v = hmAt(x, y, k);
                if (v < u_thresh) continue;

                bool isMax = true;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (dx == 0 && dy == 0) continue;
                        int rr = y + dy, cc = x + dx;
                        if (rr < 0 || rr >= u_h || cc < 0 || cc >= u_w) continue;
                        float u = hmAt(cc, rr, k);
                        if (u > v || (u == v && rr * u_w + cc < y * u_w + x)) isMax = false;
                    }
                }
                if (!isMax) continue;

                int slot = n;
                if (n == MAX_CAND) {
                    if (v <= ps[MAX_CAND - 1]) continue;
                    slot = MAX_CAND - 1;
                } else {
                    n++;
                }
                while (slot > 0 && ps[slot - 1] < v) {
                    ps[slot] = ps[slot - 1]; pr[slot] = pr[slot - 1]; pc[slot] = pc[slot - 1];
                    slot--;
                }
                ps[slot] = v; pr[slot] = y; pc[slot] = x;
            }
        }

        int m = 0;
        for (int i = 0; i < n; i++) {
            float rx = float(pc[i]);
            float ry = float(pr[i]);
            if (u_win > 0) {
                int r0 = max(0, pr[i] - u_win), r1 = min(u_h, pr[i] + u_win + 1);
                int c0 = max(0, pc[i] - u_win), c1 = min(u_w, pc[i] + u_win + 1);
                float wsum = 0.0, sy = 0.0, sx = 0.0;
                for (int y = r0; y < r1; y++) {
                    for (int x = c0; x < c1; x++) {
                        float v = hmAt(x, y, k);
                        wsum += v; sy += v * float(y); sx += v * float(x);
                    }
                }
                wsum = max(wsum, 1e-6);
                rx = sx / wsum; ry = sy / wsum;
            }
            bool dup = false;
            for (int j = 0; j < m; j++) {
                float dx = c_x[k * MAX_CAND + j] - rx;
                float dy = c_y[k * MAX_CAND + j] - ry;
                if (sqrt(dx * dx + dy * dy) < MIN_SEP) dup = true;
            }
            if (dup) continue;
            c_x[k * MAX_CAND + m] = rx;
            c_y[k * MAX_CAND + m] = ry;
            c_s[k * MAX_CAND + m] = ps[i];
            m++;
        }
        c_n[k] = m;
    }

    // \u2500\u2500 stage 2: eye-pair hypotheses \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    float h_score[25];
    int   h_kp[125];
    int nh = 0;
    float maxEye = float(u_w) * 0.45;

    for (int i = 0; i < c_n[0]; i++) {
        for (int j = 0; j < c_n[1]; j++) {
            float ax = c_x[i], ay = c_y[i];
            float bx = c_x[MAX_CAND + j], by = c_y[MAX_CAND + j];
            float evx = bx - ax, evy = by - ay;
            float len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > maxEye) continue;
            vec2 ex = vec2(evx / len, evy / len);
            vec2 ey = vec2(-ex.y, ex.x);

            float sc = c_s[i] + c_s[MAX_CAND + j];
            float resid = 0.0;
            int nMatch = 2, mouths = 0, nose = -1;
            int mo[2];
            mo[0] = -1; mo[1] = -1;

            for (int t = 0; t < 3; t++) {
                int kk = t + 2;
                float px = ax + len * (tmplU(t) * ex.x + tmplW(t) * ey.x);
                float py = ay + len * (tmplU(t) * ex.y + tmplW(t) * ey.y);
                int best = -1;
                float bestD = u_tol * len;
                for (int q = 0; q < c_n[kk]; q++) {
                    float dx = c_x[kk * MAX_CAND + q] - px;
                    float dy = c_y[kk * MAX_CAND + q] - py;
                    float d = sqrt(dx * dx + dy * dy);
                    if (d < bestD) { bestD = d; best = q; }
                }
                if (best < 0) continue;
                sc += c_s[kk * MAX_CAND + best];
                resid += bestD / len;
                nMatch++;
                if (t == 0) nose = best; else { mo[t - 1] = best; mouths++; }
            }
            if (nose < 0 || mouths < 1) continue;

            h_score[nh] = sc / float(nMatch) - LAMBDA * (resid / float(nMatch - 2));
            h_kp[nh * N_KP + 0] = i;
            h_kp[nh * N_KP + 1] = j;
            h_kp[nh * N_KP + 2] = nose;
            h_kp[nh * N_KP + 3] = mo[0];
            h_kp[nh * N_KP + 4] = mo[1];
            nh++;
        }
    }

    // \u2500\u2500 stage 3/4: greedy NMS \u2192 the box for slot myFace \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    bool used[25];
    for (int i = 0; i < N_KP * MAX_CAND; i++) used[i] = false;
    int outN = 0;

    for (int iter = 0; iter < 25; iter++) {
        if (outN >= u_max_faces) break;

        int best = -1;
        float bestS = -1e8;
        for (int q = 0; q < nh; q++) {
            if (h_score[q] > bestS) { bestS = h_score[q]; best = q; }
        }
        if (best < 0) break;
        h_score[best] = -1e9;

        bool clash = false;
        for (int t = 0; t < N_KP; t++) {
            int ci = h_kp[best * N_KP + t];
            if (ci < 0) continue;
            if (used[t * MAX_CAND + ci]) clash = true;
        }
        if (clash) continue;

        float x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, score = 1e9;
        for (int t = 0; t < N_KP; t++) {
            int ci = h_kp[best * N_KP + t];
            if (ci < 0) continue;
            int e = t * MAX_CAND + ci;
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        if (outN == myFace) {
            float halfPx = 0.5 * u_box_scale * max(x1 - x0, y1 - y0);
            float cx = ((x0 + x1) * 0.5 + 0.5) / float(u_w);
            float cy = ((y0 + y1) * 0.5 + 0.5) / float(u_h);
            fragColor = vec4(cx, cy, halfPx / float(u_w), score);
            return;
        }
        outN++;
    }

    fragColor = vec4(0.0);   // no face in this slot
}
`;var O=class extends c{inputs;weights=[];output;dispatch;shader=Ye;constructor(e,t,r){if(super(e),t.c!==8)throw new Error(`FaceBoxesFromHeatmaps: expected 8-ch heatmaps (5 real), got ${t.c}`);if(r.maxFaces<1||r.maxFaces>6)throw new Error(`FaceBoxesFromHeatmaps: maxFaces must be 1..6, got ${r.maxFaces}`);let o=r.maxFaces;this.dispatch=[o,1];let i=this.makeTexture(null,o,1);this.output={h:1,w:o,c:4,texture:i,texW:o,texH:1},this.inputs=[t],this.samplers=[{name:"u_hm",texture:t.texture}],this.uniformInts={u_h:t.h,u_w:t.w,u_win:r.win,u_max_faces:o},this.uniformFloats={u_thresh:r.thresh,u_box_scale:r.boxScale,u_tol:r.tol},this.defaultSetup();}};var qe=`#version 300 es
// Auto-reframe state update \u2192 1\xD71\xD78 tensor, i.e. a 2\xD71 texture of vec4 groups:
//   x=0  (cx, cy, size, moving)          \u2014 the view rect
//   x=1  (subjX, subjY, subjHs, valid)   \u2014 the incumbent subject, for hysteresis
// See reframe_state.wgsl for the full commentary \u2014 this mirrors it.
//
// A fragment shader writes ONE vec4, so both fragments redo the whole (tiny)
// computation and each emits its own group \u2014 same shape as face_boxes.glsl.

precision highp float;
precision highp int;

uniform sampler2D u_box;    // 1\xD7K \u2014 (cx, cy, halfSide/W, score)
uniform sampler2D u_prev;   // 1\xD71 \u2014 previous state
uniform sampler2D u_cmd;    // 1\xD71 \u2014 .x = mode
uniform int   u_k;
uniform float u_zoom;
uniform float u_gravity;
uniform float u_margin;
uniform float u_deadband;
uniform float u_ease;
uniform float u_aspect;     // frame w/h

out vec4 fragColor;

const float MODE_HOLD  = 1.0;
const float MODE_SOLVE = 2.0;
const float SWITCH_RATIO     = 1.25;
const float TRACK_RADIUS_MIN = 0.1;

void main() {
    int group = int(gl_FragCoord.x);   // 0 = view rect, 1 = subject memory
    vec4 prev  = texelFetch(u_prev, ivec2(0, 0), 0);
    vec4 prevS = texelFetch(u_prev, ivec2(1, 0), 0);
    float mode = texelFetch(u_cmd, ivec2(0, 0), 0).x;

    // Challenger = largest live face.
    int chal = -1;
    float chalHs = 0.0;
    for (int i = 0; i < u_k; i++) {
        vec4 b = texelFetch(u_box, ivec2(i, 0), 0);
        if (b.w > 0.0 && b.z > chalHs) { chalHs = b.z; chal = i; }
    }
    if (chal < 0) {
        // Hold, and keep the subject memory \u2014 a one-frame detection miss must not
        // hand the camera to someone else.
        fragColor = (group == 0) ? prev : prevS;
        return;
    }

    // Incumbent = the live face nearest where the subject was (slot indices are
    // not stable identities, so it's tracked by position).
    int inc = -1;
    float incD = 1e9;
    if (prevS.w > 0.5) {
        float radius = max(TRACK_RADIUS_MIN, prevS.z * 2.0);
        for (int i = 0; i < u_k; i++) {
            vec4 b = texelFetch(u_box, ivec2(i, 0), 0);
            if (b.w <= 0.0) continue;
            float d = length(vec2(b.x - prevS.x, b.y - prevS.y));
            if (d < radius && d < incD) { incD = d; inc = i; }
        }
    }

    int pick = chal;
    if (inc >= 0 && chalHs <= texelFetch(u_box, ivec2(inc, 0), 0).z * SWITCH_RATIO) pick = inc;
    vec4 subj = texelFetch(u_box, ivec2(pick, 0), 0);
    if (group == 1) { fragColor = vec4(subj.x, subj.y, subj.z, 1.0); return; }

    float halfX = subj.z;
    float halfY = subj.z * u_aspect;
    // Fallback = the full frame (no reframe) \u2014 see reframe_state.wgsl.
    float wcx = 0.5, wcy = 0.5, ws = 1.0;
    for (int t = 0; t <= 25; t++) {
        float z = u_zoom + (1.0 - u_zoom) * (float(t) / 25.0);
        float s = 1.0 / z;
        float cx = clamp(0.5 + u_gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        float cy = clamp(0.5 + u_gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + halfX + u_margin <= s * 0.5 &&
            abs(subj.y - cy) + halfY + u_margin <= s * 0.5) {
            wcx = cx; wcy = cy; ws = s;
            break;
        }
    }
    if (prev.z <= 0.0 || mode == MODE_SOLVE) { fragColor = vec4(wcx, wcy, ws, 0.0); return; }
    if (mode == MODE_HOLD) { fragColor = prev; return; }

    float d = length(vec2(wcx - prev.x, wcy - prev.y)) + abs(ws - prev.z);
    float moving = prev.w;
    if (d > u_deadband) moving = 1.0;
    else if (d < u_deadband * 0.3) moving = 0.0;
    if (moving < 0.5) { fragColor = vec4(prev.xyz, 0.0); return; }

    fragColor = vec4(
        mix(prev.x, wcx, u_ease),
        mix(prev.y, wcy, u_ease),
        mix(prev.z, ws,  u_ease),
        1.0
    );
}
`;var H=class extends c{inputs;weights=[];output;dispatch=[2,1];shader=qe;constructor(e,t,r,o,i){super(e);let n=this.makeTexture(null,2,1);this.output={h:1,w:1,c:8,texture:n,texW:2,texH:1},this.inputs=[t,r,o],this.samplers=[{name:"u_box",texture:t.texture},{name:"u_prev",texture:r.texture},{name:"u_cmd",texture:o.texture}],this.uniformInts={u_k:t.w*t.h},this.uniformFloats={u_zoom:i.zoom,u_gravity:i.gravity,u_margin:i.margin,u_deadband:i.deadband,u_ease:i.ease,u_aspect:i.aspect},this.defaultSetup();}};var Qe=`#version 300 es
// Apply the reframe crop: sample \`src\` through the view rect. Same shape in and
// out. See reframe.wgsl for why this sits after the effect chain and touches
// only the foreground + alpha (never the background).
//
// rect = (cx, cy, size, moving), frame fractions; size \u2264 0 \u2192 identity.

precision highp float;
precision highp int;

uniform sampler2D u_src;
uniform sampler2D u_rect;   // 1\xD71
uniform int u_h;
uniform int u_w;

out vec4 fragColor;

vec4 samp(int x, int y) {
    return texelFetch(u_src, ivec2(clamp(x, 0, u_w - 1), clamp(y, 0, u_h - 1)), 0);
}

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 r = texelFetch(u_rect, ivec2(0, 0), 0);
    float s = r.z, rcx = r.x, rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }

    float fx = (rcx - s * 0.5) + ((float(x) + 0.5) / float(u_w)) * s;
    float fy = (rcy - s * 0.5) + ((float(y) + 0.5) / float(u_h)) * s;
    // fraction \u2192 texel index; an identity rect lands exactly on texel centres,
    // making the op a bit-exact copy.
    float sx = fx * float(u_w) - 0.5;
    float sy = fy * float(u_h) - 0.5;

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    vec4 bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    fragColor = mix(top, bot, ty);
}
`;var I=class extends c{inputs;weights=[];output;dispatch;shader=Qe;constructor(e,t,r){super(e);let o=this.makeTexture(null,t.w,t.h);this.output={h:t.h,w:t.w,c:4,texture:o,texW:t.w,texH:t.h},this.inputs=[t,r],this.samplers=[{name:"u_src",texture:t.texture},{name:"u_rect",texture:r.texture}],this.uniformInts={u_h:t.h,u_w:t.w},this.defaultSetup(),this.dispatch=[t.w,t.h];}};var Je=`#version 300 es
// Box-driven square crop + bilinear resample + ((rgb - mean)/std) normalize.
// Reads the box tensor (face_box output: cx, cy, halfSide, score in frame
// fractions; halfSide as a fraction of frame WIDTH) and emits the landmark
// model's input, .w = 0. Sampling mirrors landmark training's warpAffine:
// src = center + (u - out/2) \xB7 side/out.
//
// frame texture: (w, h) \u2014 4-ch, 1 group. box texture: 1\xD71.

precision highp float;
precision highp int;

uniform sampler2D u_frame;
uniform sampler2D u_box;
uniform int u_in_h;
uniform int u_in_w;
uniform int u_out_h;
uniform int u_out_w;
uniform int u_slot;   // box-tensor slot (multi-face); 0 for the single-face path
uniform float u_mean_r;
uniform float u_mean_g;
uniform float u_mean_b;
uniform float u_std_r;
uniform float u_std_g;
uniform float u_std_b;

out vec4 fragColor;

vec4 samp(int x, int y) {
    return texelFetch(u_frame, ivec2(clamp(x, 0, u_in_w - 1), clamp(y, 0, u_in_h - 1)), 0);
}

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 box = texelFetch(u_box, ivec2(u_slot, 0), 0);
    float cx   = box.x * float(u_in_w);
    float cy   = box.y * float(u_in_h);
    float side = 2.0 * box.z * float(u_in_w);

    float sx = clamp(cx + (float(x) - float(u_out_w) * 0.5) * side / float(u_out_w), 0.0, float(u_in_w - 1));
    float sy = clamp(cy + (float(y) - float(u_out_h) * 0.5) * side / float(u_out_h), 0.0, float(u_in_h - 1));

    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);

    vec4 top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    vec4 bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    vec4 v = mix(top, bot, ty);

    vec3 mean = vec3(u_mean_r, u_mean_g, u_mean_b);
    vec3 std  = vec3(u_std_r, u_std_g, u_std_b);
    fragColor = vec4((v.rgb - mean) / std, 0.0);
}
`;var N=class extends c{inputs;weights=[];output;dispatch;shader=Je;constructor(e,t,r,o){super(e);let i=o.slot??0;if(i>=r.w*r.h)throw new Error(`CropResample: slot ${i} out of range for a ${r.h}\xD7${r.w} box tensor`);let n=this.makeTexture(null,o.outW,o.outH);this.output={h:o.outH,w:o.outW,c:4,texture:n,texW:o.outW,texH:o.outH},this.inputs=[t,r],this.samplers=[{name:"u_frame",texture:t.texture},{name:"u_box",texture:r.texture}],this.uniformInts={u_in_h:t.h,u_in_w:t.w,u_out_h:o.outH,u_out_w:o.outW,u_slot:i},this.uniformFloats={u_mean_r:o.mean[0],u_mean_g:o.mean[1],u_mean_b:o.mean[2],u_std_r:o.std[0],u_std_g:o.std[1],u_std_b:o.std[2]},this.defaultSetup(),this.dispatch=[o.outW,o.outH];}};var V=`#version 300 es
// Passthrough "compositor": writes the image directly to the canvas
// (default framebuffer). No alpha math, no background. Used by RenderOp
// when the renderer is in disabled state.
//
// Caller invariants:
//   - canvas (viewport) === image h \xD7 w (no resampling here)

precision highp float;

uniform sampler2D u_image;   // image as NHWC vec4 (RGBA)

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left; tensor textures are stored
    // top-down. Flip y so the displayed image is upright. (Matches what the
    // existing composite_solid.glsl does.)
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    vec3  rgb = texelFetch(u_image, px, 0).rgb;
    fragColor = vec4(rgb, 1.0);
}
`;var ro=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,io=`#version 300 es
precision highp float;
uniform sampler2D u_lm;
uniform sampler2D u_box;
uniform int u_slot;
uniform float u_thresh;
uniform float u_point_size;
uniform float u_canvas_w;
uniform float u_canvas_h;

void main() {
    int i = gl_VertexID;
    vec4 box = texelFetch(u_box, ivec2(u_slot, 0), 0);
    if (box.w < u_thresh) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // clipped away
        gl_PointSize = 0.0;
        return;
    }
    vec4 g = texelFetch(u_lm, ivec2(i / 2, 0), 0);
    float lx = g[(i % 2) * 2];
    float ly = g[(i % 2) * 2 + 1];

    float hsx = box.z;
    float hsy = box.z * u_canvas_w / u_canvas_h;
    float px = (box.x - hsx) + lx * 2.0 * hsx;
    float py = (box.y - hsy) + ly * 2.0 * hsy;

    gl_Position = vec4(px * 2.0 - 1.0, 1.0 - 2.0 * py, 0.0, 1.0);
    gl_PointSize = u_point_size;
}`,so=`#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 1.0); }`;function Ze(a,e,t,r){let o=a.createShader(a.VERTEX_SHADER);if(a.shaderSource(o,e),a.compileShader(o),!a.getShaderParameter(o,a.COMPILE_STATUS))throw new Error(`${r} vert compile error: ${a.getShaderInfoLog(o)}`);let i=a.createShader(a.FRAGMENT_SHADER);if(a.shaderSource(i,t),a.compileShader(i),!a.getShaderParameter(i,a.COMPILE_STATUS))throw new Error(`${r} frag compile error: ${a.getShaderInfoLog(i)}`);let n=a.createProgram();if(a.attachShader(n,o),a.attachShader(n,i),a.linkProgram(n),!a.getProgramParameter(n,a.LINK_STATUS))throw new Error(`${r} link error: ${a.getProgramInfoLog(n)}`);return n}var X=class{constructor(e,t,r,o,i){this.backend=e;if(r.c<i.count*2)throw new Error(`LandmarkOverlay: landmarks tensor holds ${r.c/2} points < count ${i.count}`);if(this.slot=i.slot??0,this.slot>=o.w*o.h)throw new Error(`LandmarkOverlay: slot ${this.slot} out of range for a ${o.h}\xD7${o.w} box tensor`);this.imageTex=t.texture,this.lmTex=r.texture,this.boxTex=o.texture,this.params=i,this.canvasW=t.w,this.canvasH=t.h;let n=e.gl;this.imgProgram=Ze(n,ro,V,"landmark_overlay img"),this.ptsProgram=Ze(n,io,so,"landmark_overlay pts");}backend;imgProgram;ptsProgram;imageTex;lmTex;boxTex;params;canvasW;canvasH;slot;run(){let e=this.backend.gl;this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),(this.params.drawImage??true)&&(e.useProgram(this.imgProgram),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.imgProgram,"u_image"),0),e.drawArrays(e.TRIANGLES,0,6)),e.useProgram(this.ptsProgram),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.lmTex),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_lm"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.boxTex),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_box"),1),e.uniform1i(e.getUniformLocation(this.ptsProgram,"u_slot"),this.slot),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_thresh"),this.params.thresh),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_point_size"),this.params.pointSize),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_canvas_w"),this.canvasW),e.uniform1f(e.getUniformLocation(this.ptsProgram,"u_canvas_h"),this.canvasH),e.uniform3f(e.getUniformLocation(this.ptsProgram,"u_color"),this.params.color[0],this.params.color[1],this.params.color[2]),e.drawArrays(e.POINTS,0,this.params.count);}};var C=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,Ge=`
uniform sampler2D u_lm;
uniform sampler2D u_box;
uniform float u_thresh;
uniform float u_canvas_w;
uniform float u_canvas_h;
uniform int u_grid;

vec3 lmFrame(int i, int face) {
    vec4 box = texelFetch(u_box, ivec2(face, 0), 0);
    int gi = face * 478 + i;
    vec4 g = texelFetch(u_lm, ivec2(gi / 2, 0), 0);
    float lx = g[(gi % 2) * 2];
    float ly = g[(gi % 2) * 2 + 1];
    float hsx = box.z;
    float hsy = box.z * u_canvas_w / u_canvas_h;
    return vec3((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face 'face' owns tile (face % grid, face / grid). grid=1 (K=1) -> the whole
// atlas, i.e. the single-face layout unchanged.
vec2 tileUv(vec2 uv, int face) {
    float g = float(u_grid);
    return (uv + vec2(float(face % u_grid), float(face / u_grid))) / g;
}`,et=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
${Ge}
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_src = l.xy;
    gl_Position = vec4(tileUv(a_uv, gl_InstanceID) * 2.0 - 1.0, 0.0, 1.0);
}`,tt=`
uniform sampler2D u_frame;
uniform float u_frame_w;
uniform float u_frame_h;

vec3 frameAt(int x, int y) {
    return texelFetch(u_frame, ivec2(clamp(x, 0, int(u_frame_w) - 1), clamp(y, 0, int(u_frame_h) - 1)), 0).rgb;
}
vec3 frameBilinear(vec2 f) {
    float sx = clamp(f.x * u_frame_w - 0.5, 0.0, u_frame_w - 1.0);
    float sy = clamp(f.y * u_frame_h - 0.5, 0.0, u_frame_h - 1.0);
    int x0 = int(floor(sx));
    int y0 = int(floor(sy));
    float tx = sx - float(x0);
    float ty = sy - float(y0);
    vec3 top = mix(frameAt(x0, y0),     frameAt(x0 + 1, y0),     tx);
    vec3 bot = mix(frameAt(x0, y0 + 1), frameAt(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}`,ot=`#version 300 es
precision highp float;
precision highp int;
in vec2 v_src;
${tt}
out vec4 fragColor;
void main() { fragColor = vec4(frameBilinear(v_src), 1.0); }`,rt=`#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform float u_sigma;
uniform int u_grid;
// The tile containing 'uv', as (lo.xy, hi.zw) - filter taps clamp to it so one
// face's skin can't bleed into a neighbour's tile.
vec4 tileBounds(vec2 uv) {
    float g = float(u_grid);
    vec2 t = floor(clamp(uv, vec2(0.0), vec2(0.99999)) * g);
    return vec4(t / g, (t + vec2(1.0)) / g);
}
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec4 tb = tileBounds(uv);
    float ht = 0.5 / 512.0;
    vec2 lo = tb.xy + ht, hi = tb.zw - ht;
    float s = max(u_sigma, 0.001);
    int R = int(clamp(ceil(s * 2.5), 1.0, 48.0));
    vec4 sum = vec4(0.0);
    float wsum = 0.0;
    for (int i = -48; i <= 48; i++) {
        if (i < -R || i > R) continue;
        float w = exp(-float(i * i) / (2.0 * s * s));
        sum += texture(u_tex, clamp(uv + u_dir * float(i), lo, hi)) * w;
        wsum += w;
    }
    fragColor = sum / wsum;
}`,it=`#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform sampler2D u_low;
uniform float u_detail;
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec4 a  = texture(u_atlas, uv);
    vec4 lo = texture(u_low, uv);
    fragColor = clamp(lo + (a - lo) * u_detail, 0.0, 1.0);
}`,st=`#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_sigma;
uniform int u_grid;
vec4 tileBounds(vec2 uv) {
    float g = float(u_grid);
    vec2 t = floor(clamp(uv, vec2(0.0), vec2(0.99999)) * g);
    return vec4(t / g, (t + vec2(1.0)) / g);
}
out vec4 fragColor;
void main() {
    vec2 uv = gl_FragCoord.xy / 512.0;
    vec2 texel = vec2(1.0 / 512.0);
    vec4 tb = tileBounds(uv);
    vec2 blo = tb.xy + texel * 0.5, bhi = tb.zw - texel * 0.5;
    float ss = max(u_sigma, 0.001);
    int R = int(clamp(ceil(ss), 1.0, 12.0));
    float sr = 0.15;
    vec3 c = texture(u_tex, uv).rgb;
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int y = -12; y <= 12; y++) {
        if (y < -R || y > R) continue;
        for (int x = -12; x <= 12; x++) {
            if (x < -R || x > R) continue;
            vec3 sc = texture(u_tex, clamp(uv + texel * vec2(float(x), float(y)), blo, bhi)).rgb;
            float ws = exp(-float(x * x + y * y) / (2.0 * ss * ss));
            vec3 d = sc - c;
            float wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    fragColor = vec4(sum / wsum, 1.0);
}`,no=`#version 300 es
precision highp float;
uniform sampler2D u_image;
out vec4 fragColor;
void main() {
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    fragColor = vec4(texelFetch(u_image, px, 0).rgb, 1.0);
}`,ao=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
${Ge}
out vec2 v_uv;        // TILED atlas uv \u2014 the atlas is per-face
out vec2 v_uv_mask;   // UNTILED canonical uv \u2014 the weight mask is one shared asset
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_uv = tileUv(a_uv, gl_InstanceID);
    v_uv_mask = a_uv;
    v_src = l.xy;
    gl_Position = vec4(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
}`,nt=`#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
in vec2 v_uv_mask;
in vec2 v_src;
uniform sampler2D u_smoothed;
uniform sampler2D u_weight;
uniform float u_strength;
${tt}
out vec4 fragColor;
void main() {
    vec3 orig = frameBilinear(v_src);
    vec3 sm   = texture(u_smoothed, v_uv).rgb;
    // v_uv_mask, not v_uv: the atlas is tiled per face, the weight mask is one
    // shared canonical asset. See face_touchup.wgsl fs_comp.
    float w   = texture(u_weight, v_uv_mask).r * u_strength;
    fragColor = vec4(mix(orig, sm, w), 1.0);
}`;function T(a,e,t,r){let o=(n,s,u)=>{let l=a.createShader(n);if(a.shaderSource(l,s),a.compileShader(l),!a.getShaderParameter(l,a.COMPILE_STATUS))throw new Error(`${r} ${u} compile error: ${a.getShaderInfoLog(l)}`);return l},i=a.createProgram();if(a.attachShader(i,o(a.VERTEX_SHADER,e,"vert")),a.attachShader(i,o(a.FRAGMENT_SHADER,t,"frag")),a.linkProgram(i),!a.getProgramParameter(i,a.LINK_STATUS))throw new Error(`${r} link error: ${a.getProgramInfoLog(i)}`);return i}var z=class{constructor(e,t,r,o,i,n){this.backend=e;let s=e.gl;if(this.frame=t,this.lm=r,this.box=o,this.count=i.count,this.params=n,this.slots=n.slots??1,this.slots!==1&&this.slots!==4)throw new Error(`FaceTouchup: slots must be 1 or 4, got ${this.slots}`);if(this.grid=this.slots===4?2:1,this.activeSlots=this.slots,o.w*o.h<this.slots)throw new Error(`FaceTouchup: slots ${this.slots} exceeds the ${o.h}\xD7${o.w} box tensor`);if(r.c<this.slots*956)throw new Error(`FaceTouchup: landmarks tensor holds ${r.c/956} faces < slots ${this.slots}`);this.progs={unwrap:T(s,et,ot,"touchup unwrap"),blur:T(s,C,rt,"touchup blur"),combine:T(s,C,it,"touchup combine"),bilateral:T(s,C,st,"touchup bilateral"),blit:T(s,C,no,"touchup blit"),comp:T(s,ao,nt,"touchup comp")},this.meshVao=s.createVertexArray(),s.bindVertexArray(this.meshVao);let u=s.createBuffer();s.bindBuffer(s.ARRAY_BUFFER,u),s.bufferData(s.ARRAY_BUFFER,i.uv,s.STATIC_DRAW),s.enableVertexAttribArray(0),s.vertexAttribPointer(0,2,s.FLOAT,false,0,0);let l=s.createBuffer();s.bindBuffer(s.ARRAY_BUFFER,l),s.bufferData(s.ARRAY_BUFFER,i.idx,s.STATIC_DRAW),s.enableVertexAttribArray(1),s.vertexAttribPointer(1,1,s.FLOAT,false,0,0),s.bindVertexArray(null);let p=h=>{let m=s.createTexture();return s.bindTexture(s.TEXTURE_2D,m),h?s.texImage2D(s.TEXTURE_2D,0,s.RGBA8,s.RGBA,s.UNSIGNED_BYTE,h):s.texImage2D(s.TEXTURE_2D,0,s.RGBA8,512,512,0,s.RGBA,s.UNSIGNED_BYTE,null),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),m};this.atlas=p(null),this.ping=p(null),this.low=p(null),this.smoothed=p(null),this.weight=p(i.weightMask),this.fbo=s.createFramebuffer();}backend;progs;meshVao;fbo;atlas;ping;low;smoothed;weight;frame;lm;box;count;params;slots;grid;activeSlots;bindTex(e,t,r,o){let i=this.backend.gl;i.activeTexture(i.TEXTURE0+t),i.bindTexture(i.TEXTURE_2D,o),i.uniform1i(i.getUniformLocation(e,r),t);}lmUniforms(e){let t=this.backend.gl;this.bindTex(e,4,"u_lm",this.lm.texture),this.bindTex(e,5,"u_box",this.box.texture),t.uniform1f(t.getUniformLocation(e,"u_thresh"),this.params.thresh),t.uniform1f(t.getUniformLocation(e,"u_canvas_w"),this.frame.w),t.uniform1f(t.getUniformLocation(e,"u_canvas_h"),this.frame.h),t.uniform1i(t.getUniformLocation(e,"u_grid"),this.grid);}frameUniforms(e){let t=this.backend.gl;this.bindTex(e,0,"u_frame",this.frame.texture),t.uniform1f(t.getUniformLocation(e,"u_frame_w"),this.frame.w),t.uniform1f(t.getUniformLocation(e,"u_frame_h"),this.frame.h);}atlasPass(e,t){let r=this.backend.gl;r.bindFramebuffer(r.FRAMEBUFFER,this.fbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,e,0),r.viewport(0,0,512,512),t();}run(){let e=this.backend.gl;if(this.atlasPass(this.atlas,()=>{e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.progs.unwrap),this.frameUniforms(this.progs.unwrap),this.lmUniforms(this.progs.unwrap),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null);}),(this.params.style??"freq-sep")==="bilateral")this.atlasPass(this.smoothed,()=>{e.useProgram(this.progs.bilateral),this.bindTex(this.progs.bilateral,0,"u_tex",this.atlas),e.uniform1f(e.getUniformLocation(this.progs.bilateral,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.bilateral,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6);});else {let t=(r,o,i,n)=>this.atlasPass(o,()=>{e.useProgram(this.progs.blur),this.bindTex(this.progs.blur,0,"u_tex",r),e.uniform2f(e.getUniformLocation(this.progs.blur,"u_dir"),i,n),e.uniform1f(e.getUniformLocation(this.progs.blur,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.blur,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6);});t(this.atlas,this.ping,1/512,0),t(this.ping,this.low,0,1/512),this.atlasPass(this.smoothed,()=>{e.useProgram(this.progs.combine),this.bindTex(this.progs.combine,0,"u_atlas",this.atlas),this.bindTex(this.progs.combine,1,"u_low",this.low),e.uniform1f(e.getUniformLocation(this.progs.combine,"u_detail"),this.params.detail),e.drawArrays(e.TRIANGLES,0,6);});}this.backend.bindDisplayFramebuffer(),e.viewport(0,0,this.frame.w,this.frame.h),e.useProgram(this.progs.blit),this.bindTex(this.progs.blit,0,"u_image",this.frame.texture),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6),e.useProgram(this.progs.comp),this.frameUniforms(this.progs.comp),this.lmUniforms(this.progs.comp),this.bindTex(this.progs.comp,1,"u_smoothed",this.smoothed),this.bindTex(this.progs.comp,2,"u_weight",this.weight),e.uniform1f(e.getUniformLocation(this.progs.comp,"u_strength"),this.params.strength),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null);}},uo=`#version 300 es
precision highp float;
uniform sampler2D u_image;
out vec4 fragColor;
void main() {
    ivec2 px = ivec2(gl_FragCoord.xy);
    fragColor = vec4(texelFetch(u_image, px, 0).rgb, 1.0);
}`,lo=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
layout(location = 1) in float a_idx;
${Ge}
out vec2 v_uv;        // TILED atlas uv \u2014 the atlas is per-face
out vec2 v_uv_mask;   // UNTILED canonical uv \u2014 the weight mask is one shared asset
out vec2 v_src;
void main() {
    vec3 l = lmFrame(int(a_idx), gl_InstanceID);
    if (l.z < u_thresh) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    v_uv = tileUv(a_uv, gl_InstanceID);
    v_uv_mask = a_uv;
    v_src = l.xy;
    gl_Position = vec4(l.x * 2.0 - 1.0, l.y * 2.0 - 1.0, 0.0, 1.0);
}`,$=class{constructor(e,t,r,o,i,n){this.backend=e;let s=e.gl;if(this.inputs=[t,r,o],this.frame=t,this.lm=r,this.box=o,this.count=i.count,this.params=n,this.slots=n.slots??1,this.slots!==1&&this.slots!==4)throw new Error(`FaceTouchup: slots must be 1 or 4, got ${this.slots}`);if(this.grid=this.slots===4?2:1,this.activeSlots=this.slots,o.w*o.h<this.slots)throw new Error(`FaceTouchup: slots ${this.slots} exceeds the ${o.h}\xD7${o.w} box tensor`);if(r.c<this.slots*956)throw new Error(`FaceTouchup: landmarks tensor holds ${r.c/956} faces < slots ${this.slots}`);this.output=e.tensor(t.h,t.w,4),this.progs={unwrap:T(s,et,ot,"touchup-stage unwrap"),blur:T(s,C,rt,"touchup-stage blur"),combine:T(s,C,it,"touchup-stage combine"),bilateral:T(s,C,st,"touchup-stage bilateral"),blitT:T(s,C,uo,"touchup-stage blitT"),compT:T(s,lo,nt,"touchup-stage compT")},this.meshVao=s.createVertexArray(),s.bindVertexArray(this.meshVao);let u=s.createBuffer();s.bindBuffer(s.ARRAY_BUFFER,u),s.bufferData(s.ARRAY_BUFFER,i.uv,s.STATIC_DRAW),s.enableVertexAttribArray(0),s.vertexAttribPointer(0,2,s.FLOAT,false,0,0);let l=s.createBuffer();s.bindBuffer(s.ARRAY_BUFFER,l),s.bufferData(s.ARRAY_BUFFER,i.idx,s.STATIC_DRAW),s.enableVertexAttribArray(1),s.vertexAttribPointer(1,1,s.FLOAT,false,0,0),s.bindVertexArray(null);let p=h=>{let m=s.createTexture();return s.bindTexture(s.TEXTURE_2D,m),h?s.texImage2D(s.TEXTURE_2D,0,s.RGBA8,s.RGBA,s.UNSIGNED_BYTE,h):s.texImage2D(s.TEXTURE_2D,0,s.RGBA8,512,512,0,s.RGBA,s.UNSIGNED_BYTE,null),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),m};this.atlas=p(null),this.ping=p(null),this.low=p(null),this.smoothed=p(null),this.weightTex=p(i.weightMask),this.fbo=s.createFramebuffer();}backend;inputs;weights=[];output;progs;meshVao;fbo;atlas;ping;low;smoothed;weightTex;frame;lm;box;count;params;slots;grid;activeSlots;bindTex(e,t,r,o){let i=this.backend.gl;i.activeTexture(i.TEXTURE0+t),i.bindTexture(i.TEXTURE_2D,o),i.uniform1i(i.getUniformLocation(e,r),t);}lmUniforms(e){let t=this.backend.gl;this.bindTex(e,4,"u_lm",this.lm.texture),this.bindTex(e,5,"u_box",this.box.texture),t.uniform1f(t.getUniformLocation(e,"u_thresh"),this.params.thresh),t.uniform1f(t.getUniformLocation(e,"u_canvas_w"),this.frame.w),t.uniform1f(t.getUniformLocation(e,"u_canvas_h"),this.frame.h),t.uniform1i(t.getUniformLocation(e,"u_grid"),this.grid);}frameUniforms(e){let t=this.backend.gl;this.bindTex(e,0,"u_frame",this.frame.texture),t.uniform1f(t.getUniformLocation(e,"u_frame_w"),this.frame.w),t.uniform1f(t.getUniformLocation(e,"u_frame_h"),this.frame.h);}pass(e,t,r,o){let i=this.backend.gl;i.bindFramebuffer(i.FRAMEBUFFER,this.fbo),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,e,0),i.viewport(0,0,t,r),o();}setActiveSlots(e){this.activeSlots=Math.max(0,Math.min(e,this.slots));}run(){let e=this.backend.gl;if(this.pass(this.atlas,512,512,()=>{e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.progs.unwrap),this.frameUniforms(this.progs.unwrap),this.lmUniforms(this.progs.unwrap),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null);}),(this.params.style??"freq-sep")==="bilateral")this.pass(this.smoothed,512,512,()=>{e.useProgram(this.progs.bilateral),this.bindTex(this.progs.bilateral,0,"u_tex",this.atlas),e.uniform1f(e.getUniformLocation(this.progs.bilateral,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.bilateral,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6);});else {let t=(r,o,i,n)=>this.pass(o,512,512,()=>{e.useProgram(this.progs.blur),this.bindTex(this.progs.blur,0,"u_tex",r),e.uniform2f(e.getUniformLocation(this.progs.blur,"u_dir"),i,n),e.uniform1f(e.getUniformLocation(this.progs.blur,"u_sigma"),this.params.amount),e.uniform1i(e.getUniformLocation(this.progs.blur,"u_grid"),this.grid),e.drawArrays(e.TRIANGLES,0,6);});t(this.atlas,this.ping,1/512,0),t(this.ping,this.low,0,1/512),this.pass(this.smoothed,512,512,()=>{e.useProgram(this.progs.combine),this.bindTex(this.progs.combine,0,"u_atlas",this.atlas),this.bindTex(this.progs.combine,1,"u_low",this.low),e.uniform1f(e.getUniformLocation(this.progs.combine,"u_detail"),this.params.detail),e.drawArrays(e.TRIANGLES,0,6);});}this.pass(this.output.texture,this.frame.w,this.frame.h,()=>{e.useProgram(this.progs.blitT),this.bindTex(this.progs.blitT,0,"u_image",this.frame.texture),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6),e.useProgram(this.progs.compT),this.frameUniforms(this.progs.compT),this.lmUniforms(this.progs.compT),this.bindTex(this.progs.compT,1,"u_smoothed",this.smoothed),this.bindTex(this.progs.compT,2,"u_weight",this.weightTex),e.uniform1f(e.getUniformLocation(this.progs.compT,"u_strength"),this.params.strength),e.bindVertexArray(this.meshVao),e.drawArraysInstanced(e.TRIANGLES,0,this.count,this.activeSlots),e.bindVertexArray(null);});}};var at=`#version 300 es
// Flow-gated temporal stabilizer. Per pixel:
//   env = max(|flow.xy|, release\xB7envPrev.y)   peak-hold
//   g   = max(clamp((env - tLo)/(tHi - tLo), 0, 1), leak)
//   out = vec4((g\xB7pred + (1-g)\xB7ref).x, env, 0, 0)

precision highp float;
precision highp int;

uniform sampler2D u_flow;
uniform sampler2D u_pred;
uniform sampler2D u_ref;
uniform sampler2D u_env_prev;
uniform int   u_w;
uniform int   u_h;
uniform float u_t_lo;
uniform float u_t_hi;
uniform float u_leak;
uniform float u_release;
uniform float u_t_div;
uniform float u_div_scale;
uniform int   u_step_x;
uniform int   u_step_y;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float mag     = length(texelFetch(u_flow, ivec2(x, y), 0).xy);
    float envPrev = texelFetch(u_env_prev, ivec2(x, y), 0).y;
    float env     = max(mag, u_release * envPrev);

    // Flow divergence over a \xB1step finite-difference (clamped to the edges).
    int xr = min(x + u_step_x, u_w - 1);
    int xl = max(x - u_step_x, 0);
    int yd = min(y + u_step_y, u_h - 1);
    int yu = max(y - u_step_y, 0);
    float dfx = texelFetch(u_flow, ivec2(xr, y), 0).x - texelFetch(u_flow, ivec2(xl, y), 0).x;
    float dfy = texelFetch(u_flow, ivec2(x, yd), 0).y - texelFetch(u_flow, ivec2(x, yu), 0).y;
    float divg = abs(dfx + dfy);

    float gMag = clamp((env - u_t_lo) / max(u_t_hi - u_t_lo, 1e-3), 0.0, 1.0);
    float gDiv = clamp((divg - u_t_div) / max(u_div_scale, 1e-3), 0.0, 1.0);
    float g = max(max(gMag, gDiv), u_leak);

    float pred = texelFetch(u_pred, ivec2(x, y), 0).x;
    float refv = texelFetch(u_ref,  ivec2(x, y), 0).x;
    float stab = g * pred + (1.0 - g) * refv;

    fragColor = vec4(stab, env, 0.0, 0.0);
}
`;var j=class extends c{inputs;weights=[];output;dispatch;shader=at;constructor(e,t,r,o,i,n){super(e);let s=t.w,u=t.h,l=this.makeTexture(null,s,u);this.output={h:u,w:s,c:4,texture:l,texW:s,texH:u},this.inputs=[t,r,o,i],this.samplers=[{name:"u_flow",texture:t.texture},{name:"u_pred",texture:r.texture},{name:"u_ref",texture:o.texture},{name:"u_env_prev",texture:i.texture}],this.uniformInts={u_w:s,u_h:u,u_step_x:n.stepX,u_step_y:n.stepY},this.uniformFloats={u_t_lo:n.tLo,u_t_hi:n.tHi,u_leak:n.leak,u_release:n.release,u_t_div:n.tDiv,u_div_scale:n.divScale},this.defaultSetup(),this.dispatch=[s,u];}};var ut=`#version 300 es
// Bilinear upsample (arbitrary scale) \u2014 align_corners=False.
//
// Hardware texture filtering can't be used: adjacent texels in x belong to
// different channel groups, not spatial neighbours. Manual 4-tap blend.
//
// Input:  (in_W  * c_groups, in_H)
// Output: (out_W * c_groups, out_H)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 v00 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y0), 0);
    vec4 v10 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y0), 0);
    vec4 v01 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y1), 0);
    vec4 v11 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y1), 0);

    fragColor = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
}
`;var K=class extends c{inputs;weights=[];output;dispatch;shader=ut;constructor(e,t,r){super(e);let o=t.c/4,i=r.outW*o,n=this.makeTexture(null,i,r.outH);this.output={h:r.outH,w:r.outW,c:t.c,texture:n,texW:i,texH:r.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:r.outW,u_out_h:r.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[i,r.outH];}};var lt=`#version 300 es
// Top-left crop: the output viewport is smaller than the input texture, so reading
// the same fragment coord yields the top-left subregion (channel groups packed in
// the x axis line up because group count is unchanged).

precision highp float;
precision highp int;

uniform sampler2D u_input;
out vec4 fragColor;

void main() {
    fragColor = texelFetch(u_input, ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y)), 0);
}
`;var Y=class extends c{inputs;weights=[];output;dispatch;shader=lt;constructor(e,t,r){super(e);let o=t.c/4,i=r.outW*o,n=this.makeTexture(null,i,r.outH);this.output={h:r.outH,w:r.outW,c:t.c,texture:n,texW:i,texH:r.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.defaultSetup(),this.dispatch=[i,r.outH];}};var ct=`#version 300 es
// Bicubic upsample (arbitrary scale) \u2014 Keys cubic, a=-0.75 (PyTorch default
// for mode='bicubic', align_corners=False).
//
// Direct 2D, 4\xD74 = 16 taps per output pixel. Hardware texture filtering
// can't be used (NHWC vec4 layout means adjacent texels in x belong to
// different channel groups, not spatial neighbours).

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

const float A = -0.75;

float wcubic(float d) {
    float ad = abs(d);
    if (ad <= 1.0) return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0;
    if (ad <  2.0) return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A;
    return 0.0;
}

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float src_x = (float(x_out) + 0.5) * float(u_in_w) / float(u_out_w) - 0.5;
    float src_y = (float(y_out) + 0.5) * float(u_in_h) / float(u_out_h) - 0.5;

    int   x0 = int(floor(src_x));
    int   y0 = int(floor(src_y));
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    // Weights for offsets {-1, 0, 1, 2} from x0/y0.
    float wx[4];
    float wy[4];
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx);       wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy);       wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    vec4 acc = vec4(0.0);
    for (int j = 0; j < 4; j++) {
        int sy = clamp(y0 + j - 1, 0, u_in_h - 1);
        for (int i = 0; i < 4; i++) {
            int sx = clamp(x0 + i - 1, 0, u_in_w - 1);
            vec4 v = texelFetch(u_input, ivec2(sx * u_c_groups + c_group, sy), 0);
            acc += (wx[i] * wy[j]) * v;
        }
    }
    fragColor = acc;
}
`;var q=class extends c{inputs;weights=[];output;dispatch;shader=ct;constructor(e,t,r){super(e);let o=t.c/4,i=r.outW*o,n=this.makeTexture(null,i,r.outH);this.output={h:r.outH,w:r.outW,c:t.c,texture:n,texW:i,texH:r.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:r.outW,u_out_h:r.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[i,r.outH];}};var pt=`#version 300 es
// Channel concat \u2014 concatenates two NHWC textures along the channel dimension.
// Both inputs must share the same spatial dimensions (W, H). Channel counts are
// multiples of 4 so each "group" is one vec4 texel.
//
// Input  A: (W * a_c_groups, H)
// Input  B: (W * b_c_groups, H)
// Output:   (W * (a_c_groups + b_c_groups), H)

precision highp float;
precision highp int;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;
uniform int u_a_c_groups;
uniform int u_b_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc       = ivec2(gl_FragCoord.xy);
    int out_groups = u_a_c_groups + u_b_c_groups;
    int x_spatial  = fc.x / out_groups;
    int c_out      = fc.x - x_spatial * out_groups;
    int y          = fc.y;

    if (c_out < u_a_c_groups) {
        fragColor = texelFetch(u_input_a, ivec2(x_spatial * u_a_c_groups + c_out, y), 0);
    } else {
        int c_b = c_out - u_a_c_groups;
        fragColor = texelFetch(u_input_b, ivec2(x_spatial * u_b_c_groups + c_b, y), 0);
    }
}
`;var Q=class extends c{inputs;weights=[];output;dispatch;shader=pt;constructor(e,t,r){super(e);let o=t.c/4,i=r.c/4,n=o+i,s=t.c+r.c,u=t.w*n,l=this.makeTexture(null,u,t.h);this.output={h:t.h,w:t.w,c:s,texture:l,texW:u,texH:t.h},this.inputs=[t,r],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:r.texture}],this.uniformInts={u_a_c_groups:o,u_b_c_groups:i},this.defaultSetup(),this.dispatch=[u,t.h];}};var ht=`#version 300 es
// Bilinear upsample + sigmoid fused \u2014 sigmoid applied at write time, no intermediate buffer.
// See bilinear_upsample.glsl for the manual 4-tap blend rationale.
//
// Input:  (in_W  * c_groups, in_H)
// Output: (out_W * c_groups, out_H)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc    = ivec2(gl_FragCoord.xy);
    int x_out   = fc.x / u_c_groups;
    int y_out   = fc.y;
    int c_group = fc.x - x_out * u_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx = src_x - float(x0);
    float fy = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 v00 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y0), 0);
    vec4 v10 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y0), 0);
    vec4 v01 = texelFetch(u_input, ivec2(x0 * u_c_groups + c_group, y1), 0);
    vec4 v11 = texelFetch(u_input, ivec2(x1 * u_c_groups + c_group, y1), 0);

    vec4 result = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
    fragColor = 1.0 / (1.0 + exp(-result));
}
`;var J=class extends c{inputs;weights=[];output;dispatch;shader=ht;constructor(e,t,r){super(e);let o=t.c/4,i=r.outW*o,n=this.makeTexture(null,i,r.outH);this.output={h:r.outH,w:r.outW,c:t.c,texture:n,texW:i,texH:r.outH},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:r.outW,u_out_h:r.outH,u_c_groups:o},this.defaultSetup(),this.dispatch=[i,r.outH];}};var mt=`#version 300 es
// Bilinear upsample (input_a) + channel concat (with input_b) fused.
// input_a is the decoder tensor at small spatial res (in_h \xD7 in_w), bilinearly resized to (out_h \xD7 out_w).
// input_b is the encoder skip feature already at output resolution.
// Output channels [0..a_groups-1] come from upsampled input_a.
// Output channels [a_groups..out_groups-1] come from input_b (passthrough).

precision highp float;
precision highp int;

uniform sampler2D u_input_a;
uniform sampler2D u_input_b;
uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_a_c_groups;
uniform int u_b_c_groups;

out vec4 fragColor;

void main() {
    ivec2 fc       = ivec2(gl_FragCoord.xy);
    int out_groups = u_a_c_groups + u_b_c_groups;
    int x_out      = fc.x / out_groups;
    int c_out      = fc.x - x_out * out_groups;
    int y_out      = fc.y;

    if (c_out < u_a_c_groups) {
        // Bilinear sample from input_a at (x_out, y_out) for channel group c_out.
        float scale_x = float(u_in_w) / float(u_out_w);
        float scale_y = float(u_in_h) / float(u_out_h);
        float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
        float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

        int x0 = int(floor(src_x));
        int y0 = int(floor(src_y));
        int x1 = x0 + 1;
        int y1 = y0 + 1;
        float fx = src_x - float(x0);
        float fy = src_y - float(y0);

        x0 = clamp(x0, 0, u_in_w - 1);
        y0 = clamp(y0, 0, u_in_h - 1);
        x1 = clamp(x1, 0, u_in_w - 1);
        y1 = clamp(y1, 0, u_in_h - 1);

        vec4 v00 = texelFetch(u_input_a, ivec2(x0 * u_a_c_groups + c_out, y0), 0);
        vec4 v10 = texelFetch(u_input_a, ivec2(x1 * u_a_c_groups + c_out, y0), 0);
        vec4 v01 = texelFetch(u_input_a, ivec2(x0 * u_a_c_groups + c_out, y1), 0);
        vec4 v11 = texelFetch(u_input_a, ivec2(x1 * u_a_c_groups + c_out, y1), 0);

        fragColor = mix(mix(v00, v10, fx), mix(v01, v11, fx), fy);
    } else {
        int c_b = c_out - u_a_c_groups;
        fragColor = texelFetch(u_input_b, ivec2(x_out * u_b_c_groups + c_b, y_out), 0);
    }
}
`;var Z=class extends c{inputs;weights=[];output;dispatch;shader=mt;constructor(e,t,r,o){super(e);let i=t.c/4,n=r.c/4,s=i+n,u=t.c+r.c,l=o.outW*s,p=this.makeTexture(null,l,o.outH);this.output={h:o.outH,w:o.outW,c:u,texture:p,texW:l,texH:o.outH},this.inputs=[t,r],this.samplers=[{name:"u_input_a",texture:t.texture},{name:"u_input_b",texture:r.texture}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:o.outW,u_out_h:o.outH,u_a_c_groups:i,u_b_c_groups:n},this.defaultSetup(),this.dispatch=[l,o.outH];}};var dt=`#version 300 es
// Bilinear upsample + 1\xD71 pointwise conv fused.
// For each output pixel + out group, bilinearly samples each in_group from input,
// applies the 1\xD71 conv weight, and writes the activated result.
//
// Input:   (in_W  * in_groups,  in_H)
// Output:  (out_W * out_groups, out_H)
// Weights: (in_groups * 4, out_groups)  (K=1, so kernel-row dimension collapses)
//          mat4[col][row] = weight(in_channel=col, out_channel=row)
// Bias:    (out_groups, 1)

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_w;
uniform int u_in_h;
uniform int u_out_w;
uniform int u_out_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    float scale_x = float(u_in_w) / float(u_out_w);
    float scale_y = float(u_in_h) / float(u_out_h);
    float src_x = (float(x_out) + 0.5) * scale_x - 0.5;
    float src_y = (float(y_out) + 0.5) * scale_y - 0.5;

    int x0 = int(floor(src_x));
    int y0 = int(floor(src_y));
    int x1 = x0 + 1;
    int y1 = y0 + 1;
    float fx_w = src_x - float(x0);
    float fy_w = src_y - float(y0);

    x0 = clamp(x0, 0, u_in_w - 1);
    y0 = clamp(y0, 0, u_in_h - 1);
    x1 = clamp(x1, 0, u_in_w - 1);
    y1 = clamp(y1, 0, u_in_h - 1);

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int i = 0; i < u_in_c_groups; i++) {
        vec4 v00 = texelFetch(u_input, ivec2(x0 * u_in_c_groups + i, y0), 0);
        vec4 v10 = texelFetch(u_input, ivec2(x1 * u_in_c_groups + i, y0), 0);
        vec4 v01 = texelFetch(u_input, ivec2(x0 * u_in_c_groups + i, y1), 0);
        vec4 v11 = texelFetch(u_input, ivec2(x1 * u_in_c_groups + i, y1), 0);

        vec4 sampled = mix(mix(v00, v10, fx_w), mix(v01, v11, fx_w), fy_w);

        int base = i * 4;
        mat4 w = mat4(
            texelFetch(u_weights, ivec2(base,     o_group), 0),
            texelFetch(u_weights, ivec2(base + 1, o_group), 0),
            texelFetch(u_weights, ivec2(base + 2, o_group), 0),
            texelFetch(u_weights, ivec2(base + 3, o_group), 0)
        );
        result += w * sampled;
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));

    fragColor = result;
}
`;var ee=class extends c{inputs;weights;output;dispatch;shader=dt;constructor(e,t,r,o$1){super(e);let i=t.c/4,n=o$1.outChannels/4,s=o(r.weights),u=o(r.bias),l=this.makeTexture(s,i*4,n),p=this.makeTexture(u,n,1),h=o$1.outW*n,m=this.makeTexture(null,h,o$1.outH);this.output={h:o$1.outH,w:o$1.outW,c:o$1.outChannels,texture:m,texW:h,texH:o$1.outH},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:l},{name:"u_bias",texture:p}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_out_w:o$1.outW,u_out_h:o$1.outH,u_in_c_groups:i,u_out_c_groups:n,u_activation:o$1.activation==="relu6"?1:0},this.defaultSetup(),this.dispatch=[h,o$1.outH];}};var _t=`#version 300 es
// Conv2d + skip add fused \u2014 identical to conv2d.glsl with a skip texture added at write time.
// See conv2d.glsl for tensor/weight layout details.

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_skip;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_w;
uniform int u_in_h;
uniform int u_in_c_groups;
uniform int u_out_c_groups;
uniform int u_kernel_h;
uniform int u_kernel_w;
uniform int u_stride;
uniform int u_pad_top;
uniform int u_pad_left;
uniform int u_activation;   // 0 = none, 1 = relu6, 2 = relu

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int y_out   = fy;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < u_kernel_h; ky++) {
        for (int kx = 0; kx < u_kernel_w; kx++) {
            int in_y = y_out * u_stride + ky - u_pad_top;
            int in_x = x_out * u_stride + kx - u_pad_left;

            if (in_y < 0 || in_y >= u_in_h || in_x < 0 || in_x >= u_in_w) continue;

            int z     = ky * u_kernel_w + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < u_in_c_groups; i++) {
                vec4 in_val = texelFetch(u_input, ivec2(in_x * u_in_c_groups + i, in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    if      (u_activation == 1) result = clamp(result, 0.0, 6.0);
    else if (u_activation == 2) result = max(result, vec4(0.0));

    fragColor = result + texelFetch(u_skip, ivec2(fx, fy), 0);
}
`;var te=class extends c{inputs;weights;output;dispatch;shader=_t;constructor(e,t,r,o$1,i){super(e);let n=k(t.h,i.kernel,i.stride,i.padding),s=k(t.w,i.kernel,i.stride,i.padding),u=t.c/4,l=i.outChannels/4,p=m(i.padding,t.h,n,i.kernel,i.stride),h=m(i.padding,t.w,s,i.kernel,i.stride),m$1=o(o$1.weights),x=o(o$1.bias),_=this.makeTexture(m$1,u*4,i.kernel*i.kernel*l),g=this.makeTexture(x,l,1),b=s*l,L=this.makeTexture(null,b,n);this.output={h:n,w:s,c:i.outChannels,texture:L,texW:b,texH:n},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_skip",texture:r.texture},{name:"u_weights",texture:_},{name:"u_bias",texture:g}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_in_c_groups:u,u_out_c_groups:l,u_kernel_h:i.kernel,u_kernel_w:i.kernel,u_stride:i.stride,u_pad_top:p,u_pad_left:h,u_activation:i.activation==="relu6"?1:0},this.defaultSetup(),this.dispatch=[b,n];}};var ft=`#version 300 es
// proj_residual: bespoke 1\xD71 conv (no activation) + residual add, fused.
// Specializes conv2d_add to kernel=1 / stride=1 / pad=0 / no activation. Both
// inputs share the same spatial resolution. See conv2d.glsl for the weight
// texture layout (here K=1, so the weight texture is (inGroups*4, outGroups)).

precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_skip;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_in_c_groups;
uniform int u_out_c_groups;

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int o_group = fx - x_out * u_out_c_groups;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int i = 0; i < u_in_c_groups; i++) {
        vec4 in_val = texelFetch(u_input, ivec2(x_out * u_in_c_groups + i, fy), 0);

        int base = i * 4;
        mat4 w = mat4(
            texelFetch(u_weights, ivec2(base,     o_group), 0),
            texelFetch(u_weights, ivec2(base + 1, o_group), 0),
            texelFetch(u_weights, ivec2(base + 2, o_group), 0),
            texelFetch(u_weights, ivec2(base + 3, o_group), 0)
        );
        result += w * in_val;
    }

    fragColor = result + texelFetch(u_skip, ivec2(fx, fy), 0);
}
`;var oe=class extends c{inputs;weights;output;dispatch;shader=ft;constructor(e,t,r,o$1,i){super(e);let n=t.c/4,s=i.outChannels/4,u=o(o$1.weights),l=o(o$1.bias),p=this.makeTexture(u,n*4,s),h=this.makeTexture(l,s,1),m=t.w*s,x=this.makeTexture(null,m,t.h);this.output={h:t.h,w:t.w,c:i.outChannels,texture:x,texW:m,texH:t.h},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_skip",texture:r.texture},{name:"u_weights",texture:p},{name:"u_bias",texture:h}],this.uniformInts={u_in_c_groups:n,u_out_c_groups:s},this.defaultSetup(),this.dispatch=[m,t.h];}};var xt=`#version 300 es
// concat_conv2d: fuses [concat(a, b) \u2192 conv 3\xD73 (pad 1) \u2192 relu6] into one pass.
// Both inputs already at output resolution. Weight cols [0, a_groups) read a,
// [a_groups, I) read b. Weight texture layout matches conv2d.glsl
// ((in_groups*4, 9*out_groups), in_groups = a_groups + b_groups).

precision highp float;
precision highp int;

uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_weights;
uniform sampler2D u_bias;

uniform int u_w;
uniform int u_h;
uniform int u_a_groups;
uniform int u_b_groups;
uniform int u_out_c_groups;

out vec4 fragColor;

void main() {
    int fx      = int(gl_FragCoord.x);
    int fy      = int(gl_FragCoord.y);
    int x_out   = fx / u_out_c_groups;
    int o_group = fx - x_out * u_out_c_groups;
    int A = u_a_groups;
    int B = u_b_groups;
    int I = A + B;

    vec4 result = texelFetch(u_bias, ivec2(o_group, 0), 0);

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int in_y = fy    + ky - 1;
            int in_x = x_out + kx - 1;
            if (in_x < 0 || in_y < 0 || in_x >= u_w || in_y >= u_h) continue;

            int z     = ky * 3 + kx;
            int w_row = z * u_out_c_groups + o_group;

            for (int i = 0; i < I; i++) {
                vec4 in_val = (i < A)
                    ? texelFetch(u_a, ivec2(in_x * A + i,       in_y), 0)
                    : texelFetch(u_b, ivec2(in_x * B + (i - A), in_y), 0);

                int base = i * 4;
                mat4 w = mat4(
                    texelFetch(u_weights, ivec2(base,     w_row), 0),
                    texelFetch(u_weights, ivec2(base + 1, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 2, w_row), 0),
                    texelFetch(u_weights, ivec2(base + 3, w_row), 0)
                );
                result += w * in_val;
            }
        }
    }

    fragColor = clamp(result, 0.0, 6.0);
}
`;var re=class extends c{inputs;weights;output;dispatch;shader=xt;constructor(e,t,r,o$1,i){super(e);let n=t.c/4,s=r.c/4,u=n+s,l=i.outChannels/4,p=o(o$1.weights),h=o(o$1.bias),m=this.makeTexture(p,u*4,9*l),x=this.makeTexture(h,l,1),_=t.w*l,g=this.makeTexture(null,_,t.h);this.output={h:t.h,w:t.w,c:i.outChannels,texture:g,texW:_,texH:t.h},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_a",texture:t.texture},{name:"u_b",texture:r.texture},{name:"u_weights",texture:m},{name:"u_bias",texture:x}],this.uniformInts={u_w:t.w,u_h:t.h,u_a_groups:n,u_b_groups:s,u_out_c_groups:l},this.defaultSetup(),this.dispatch=[_,t.h];}};var gt=`#version 300 es
// gates_fused: ConvGRU z + r gates, fused. Production config (c_up=2,
// recurrent=1). u_in (.x=a, .y=b), h_prev (.x). weights 9 vec4 =
// (z_w_b, z_w_h, r_w_b, r_w_h) in a (9,1) texture. bias .xy. output (z, r, 0, 0).

precision highp float;
precision highp int;

uniform sampler2D u_u_in;     // (W, H)
uniform sampler2D u_h_prev;   // (W, H)
uniform sampler2D u_weights;  // (9, 1)
uniform sampler2D u_bias;     // (1, 1)
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 b = texelFetch(u_bias, ivec2(0, 0), 0).xy;
    float z_pre = b.x;
    float r_pre = b.y;

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos  = ky * 3 + kx;
            float b_n = texelFetch(u_u_in,   ivec2(ix, iy), 0).y;
            float h_n = texelFetch(u_h_prev, ivec2(ix, iy), 0).z;
            vec4 w    = texelFetch(u_weights, ivec2(kpos, 0), 0);
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    float z = 1.0 / (1.0 + exp(-z_pre));
    float r = 1.0 / (1.0 + exp(-r_pre));
    fragColor = vec4(z, r, 0.0, 0.0);
}
`;var ie=class extends c{inputs;weights;output;dispatch;shader=gt;constructor(e,t,r,o$1){super(e);let i=this.makeTexture(o(o$1.weights),9,1),n=this.makeTexture(p(o$1.bias),1,1),s=t.w,u=this.makeTexture(null,s,t.h);this.output={h:t.h,w:t.w,c:4,texture:u,texW:s,texH:t.h},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_h_prev",texture:r.texture},{name:"u_weights",texture:i},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[s,t.h];}};var bt=`#version 300 es
// cand_update_fused: ConvGRU candidate + state update + output, fused.
// Production config (c_up=2, recurrent=1). u_in (.x=a, .y=b), h_prev (.x),
// gates_out (.x=z, .y=r). weights 9 vec4 (.xy = b_w, rh_w) in a (9,1) texture.
// bias .x, gamma .x. output (a, b_out, 0, 0).

precision highp float;
precision highp int;

uniform sampler2D u_u_in;       // (W, H)
uniform sampler2D u_h_prev;     // (W, H)
uniform sampler2D u_gates_out;  // (W, H)
uniform sampler2D u_weights;    // (9, 1)
uniform sampler2D u_bias;       // (1, 1)
uniform sampler2D u_gamma;      // (1, 1)
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float cand_pre = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos  = ky * 3 + kx;
            float b_n = texelFetch(u_u_in,      ivec2(ix, iy), 0).y;
            float h_n = texelFetch(u_h_prev,    ivec2(ix, iy), 0).z;
            float r_n = texelFetch(u_gates_out, ivec2(ix, iy), 0).y;
            vec4 w    = texelFetch(u_weights,   ivec2(kpos, 0), 0);
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    float h_til      = tanh(cand_pre);
    vec4  u_cur      = texelFetch(u_u_in,      ivec2(x, y), 0);
    float z_cur      = texelFetch(u_gates_out, ivec2(x, y), 0).x;
    float h_prev_cur = texelFetch(u_h_prev,    ivec2(x, y), 0).z;
    float h_new      = (1.0 - z_cur) * h_prev_cur + z_cur * h_til;
    float gamma      = texelFetch(u_gamma,     ivec2(0, 0), 0).x;
    float b_out      = u_cur.y + gamma * h_new;
    fragColor = vec4(u_cur.x, b_out, h_new, 0.0);
}
`;var se=class extends c{inputs;weights;output;dispatch;shader=bt;constructor(e,t,r,o$1,i,n){super(e);let s=this.makeTexture(o(i.weights),9,1),u=this.makeTexture(p(i.bias),1,1),l=this.makeTexture(p(n),1,1),p$1=t.w,h=this.makeTexture(null,p$1,t.h);this.output={h:t.h,w:t.w,c:4,texture:h,texW:p$1,texH:t.h},this.inputs=[t,r,o$1],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_h_prev",texture:r.texture},{name:"u_gates_out",texture:o$1.texture},{name:"u_weights",texture:s},{name:"u_bias",texture:u},{name:"u_gamma",texture:l}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[p$1,t.h];}};var vt=`#version 300 es
// conv_expand: bespoke N\u21922 conv 3\xD73 (pad 1) + relu (wrapper expand_feat).
// Input N ch (in_groups vec4); output 2ch in .xy (.zw = 0). Weights: 9 *
// in_groups mat4x2 (8 floats each, col-major c0r0,c0r1,...,c3r0,c3r1) in a
// 1-row texture \u2014 bounded small (feat_ch \u2264 32).

precision highp float;
precision highp int;

uniform sampler2D u_input;    // (W*in_groups, H)
uniform sampler2D u_weights;  // (ceil(9*in_groups*8/4), 1)
uniform sampler2D u_bias;     // (1, 1) \u2014 .xy
uniform int u_w;
uniform int u_h;
uniform int u_in_groups;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 result = texelFetch(u_bias, ivec2(0, 0), 0).xy;

    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            for (int ig = 0; ig < u_in_groups; ig++) {
                vec4 v = texelFetch(u_input, ivec2(ix * u_in_groups + ig, iy), 0);
                int base = (kpos * u_in_groups + ig) * 8;  // mat4x2 = 8 floats
                result.x += wf(base + 0) * v.x + wf(base + 2) * v.y + wf(base + 4) * v.z + wf(base + 6) * v.w;
                result.y += wf(base + 1) * v.x + wf(base + 3) * v.y + wf(base + 5) * v.z + wf(base + 7) * v.w;
            }
        }
    }

    fragColor = vec4(max(result, vec2(0.0)), 0.0, 0.0);   // expand_feat is F.relu
}
`;var ne=class extends c{inputs;weights;output;dispatch;shader=vt;constructor(e,t,r){super(e);let o$1=t.c/4,i=this.makeTexture(o(r.weights),18*o$1,1),n=this.makeTexture(p(r.bias),1,1),s=t.w,u=this.makeTexture(null,s,t.h);this.output={h:t.h,w:t.w,c:4,texture:u,texW:s,texH:t.h},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_weights",texture:i},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h,u_in_groups:o$1},this.defaultSetup(),this.dispatch=[s,t.h];}};var yt=`#version 300 es
// cat_conv_6to2: fused concat(u[2], d[4]) \u2192 6\u21922 conv 3\xD73 (pad 1) + relu
// (E up1_combine). Channel order v3a=(u.x,u.y,d.x), v3b=d.yzw. weights = 9*2
// mat3x2 (6 floats each, col-major) in a 1-row (27-texel) texture.

precision highp float;
precision highp int;

uniform sampler2D u_u_in;     // (W, H) \u2014 .xy
uniform sampler2D u_d_in;     // (W, H) \u2014 full vec4
uniform sampler2D u_weights;  // (27, 1)
uniform sampler2D u_bias;     // (1, 1) \u2014 .xy
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec2 result = texelFetch(u_bias, ivec2(0, 0), 0).xy;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u = texelFetch(u_u_in, ivec2(ix, iy), 0);
            vec4 d = texelFetch(u_d_in, ivec2(ix, iy), 0);
            vec3 v3a = vec3(u.x, u.y, d.x);
            vec3 v3b = d.yzw;
            for (int ig = 0; ig < 2; ig++) {
                int base = (kpos * 2 + ig) * 6;
                vec3 v3 = (ig == 0) ? v3a : v3b;
                for (int col = 0; col < 3; col++) {
                    result.x += wf(base + col * 2 + 0) * v3[col];
                    result.y += wf(base + col * 2 + 1) * v3[col];
                }
            }
        }
    }

    fragColor = vec4(max(result, vec2(0.0)), 0.0, 0.0);   // up1_combine is F.relu
}
`;var ae=class extends c{inputs;weights;output;dispatch;shader=yt;constructor(e,t,r,o$1){super(e);let i=this.makeTexture(o(o$1.weights),27,1),n=this.makeTexture(p(o$1.bias),1,1),s=t.w,u=this.makeTexture(null,s,t.h);this.output={h:t.h,w:t.w,c:4,texture:u,texW:s,texH:t.h},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_u_in",texture:t.texture},{name:"u_d_in",texture:r.texture},{name:"u_weights",texture:i},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[s,t.h];}};var wt=`#version 300 es
// down_adapter: stride-N 3\xD73 conv (mat4x4, 4\u21924) + relu, then 1\xD71 adapter
// (4\u21923, last row 0). down_w = 9 mat4x4 (1-row, 36 texels); adapt_w = 1 mat4x4
// (4 texels). Output 3ch in .xyz (.w=0). Symmetric pad. Weight packing matches
// conv2d (col-major mat4x4 via the flat accessor).

precision highp float;
precision highp int;

uniform sampler2D u_input;     // (in_W, in_H) \u2014 in_c padded to 1 vec4
uniform sampler2D u_down_w;    // (36, 1)
uniform sampler2D u_down_b;    // (1, 1)
uniform sampler2D u_adapt_w;   // (4, 1)
uniform sampler2D u_adapt_b;   // (1, 1) \u2014 .xyz
uniform int u_in_w;
uniform int u_in_h;
uniform int u_stride;
uniform int u_pad;

out vec4 fragColor;

float dwf(int i) { return texelFetch(u_down_w,  ivec2(i / 4, 0), 0)[i & 3]; }
float awf(int i) { return texelFetch(u_adapt_w, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    vec4 d = texelFetch(u_down_b, ivec2(0, 0), 0);
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y * u_stride + ky - u_pad;
            int ix = x * u_stride + kx - u_pad;
            if (iy < 0 || ix < 0 || iy >= u_in_h || ix >= u_in_w) continue;
            int kpos = ky * 3 + kx;
            vec4 v = texelFetch(u_input, ivec2(ix, iy), 0);
            int m = kpos * 16;
            d.x += dwf(m + 0) * v.x + dwf(m + 4) * v.y + dwf(m + 8)  * v.z + dwf(m + 12) * v.w;
            d.y += dwf(m + 1) * v.x + dwf(m + 5) * v.y + dwf(m + 9)  * v.z + dwf(m + 13) * v.w;
            d.z += dwf(m + 2) * v.x + dwf(m + 6) * v.y + dwf(m + 10) * v.z + dwf(m + 14) * v.w;
            d.w += dwf(m + 3) * v.x + dwf(m + 7) * v.y + dwf(m + 11) * v.z + dwf(m + 15) * v.w;
        }
    }
    d = max(d, vec4(0.0));   // relu

    vec4 ab = texelFetch(u_adapt_b, ivec2(0, 0), 0);
    vec4 a;
    a.x = awf(0) * d.x + awf(4) * d.y + awf(8)  * d.z + awf(12) * d.w + ab.x;
    a.y = awf(1) * d.x + awf(5) * d.y + awf(9)  * d.z + awf(13) * d.w + ab.y;
    a.z = awf(2) * d.x + awf(6) * d.y + awf(10) * d.z + awf(14) * d.w + ab.z;
    fragColor = vec4(a.xyz, 0.0);
}
`;var ue=class extends c{inputs;weights;output;dispatch;shader=wt;constructor(e,t,r,o$1,i){super(e);let n=k(t.h,3,i.stride,1),s=k(t.w,3,i.stride,1),u=m(1,t.h,n,3,i.stride),l=this.makeTexture(o(r.weights),36,1),p$1=this.makeTexture(p(r.bias),1,1),h=this.makeTexture(o(o$1.weights),4,1),m$1=this.makeTexture(p(o$1.bias),1,1),x=s,_=this.makeTexture(null,x,n);this.output={h:n,w:s,c:4,texture:_,texW:x,texH:n},this.inputs=[t],this.weights=[],this.samplers=[{name:"u_input",texture:t.texture},{name:"u_down_w",texture:l},{name:"u_down_b",texture:p$1},{name:"u_adapt_w",texture:h},{name:"u_adapt_b",texture:m$1}],this.uniformInts={u_in_w:t.w,u_in_h:t.h,u_stride:i.stride,u_pad:u},this.defaultSetup(),this.dispatch=[x,n];}};var Tt=`#version 300 es
// up_final: cat(u[2], rgb[3]) \u2192 conv 3\xD73 5\u21921 \u2192 sigmoid (A/B alpha head).
// weights 18 vec4 (1-row): [kpos]=(w0,w1,0,0) for u, [9+kpos]=(w2,w3,w4,0) rgb.

precision highp float;
precision highp int;

uniform sampler2D u_u_gru;    // (W, H) \u2014 .xy
uniform sampler2D u_rgb;      // (W, H) \u2014 .xyz
uniform sampler2D u_weights;  // (18, 1)
uniform sampler2D u_bias;     // (1, 1) \u2014 .x
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float acc = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u  = texelFetch(u_u_gru,   ivec2(ix, iy), 0);
            vec4 r  = texelFetch(u_rgb,     ivec2(ix, iy), 0);
            vec4 wu = texelFetch(u_weights, ivec2(kpos, 0), 0);
            vec4 wr = texelFetch(u_weights, ivec2(9 + kpos, 0), 0);
            acc += dot(wu.xy, u.xy);
            acc += dot(wr.xyz, r.xyz);
        }
    }

    fragColor = vec4(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
`;var le=class extends c{inputs;weights;output;dispatch;shader=Tt;constructor(e,t,r,o$1){super(e);let i=this.makeTexture(o(o$1.weights),18,1),n=this.makeTexture(p(o$1.bias),1,1),s=t.w,u=this.makeTexture(null,s,t.h);this.output={h:t.h,w:t.w,c:4,texture:u,texW:s,texH:t.h},this.inputs=[t,r],this.weights=[],this.samplers=[{name:"u_u_gru",texture:t.texture},{name:"u_rgb",texture:r.texture},{name:"u_weights",texture:i},{name:"u_bias",texture:n}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[s,t.h];}};var kt=`#version 300 es
// up_final_skip (C/D alpha head): cat(u[2], d_full[4], rgb[3]) \u2192 conv 9\u21921 \u2192
// sigmoid. Weights = 27 vec4 (3 per kpos): [kpos*3+0]=(w0,w1,0,0) u;
// [kpos*3+1]=(w2..w5) d_full; [kpos*3+2]=(w6,w7,w8,0) rgb.

precision highp float;
precision highp int;

uniform sampler2D u_u_gru;    // (W, H) \u2014 .xy
uniform sampler2D u_d_full;   // (W, H) \u2014 full vec4
uniform sampler2D u_rgb;      // (W, H) \u2014 .xyz
uniform sampler2D u_weights;  // (27, 1)
uniform sampler2D u_bias;     // (1, 1) \u2014 .x
uniform int u_w;
uniform int u_h;

out vec4 fragColor;

float wf(int i) { return texelFetch(u_weights, ivec2(i / 4, 0), 0)[i & 3]; }

void main() {
    int x = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);

    float acc = texelFetch(u_bias, ivec2(0, 0), 0).x;
    for (int ky = 0; ky < 3; ky++) {
        for (int kx = 0; kx < 3; kx++) {
            int iy = y + ky - 1;
            int ix = x + kx - 1;
            if (iy < 0 || ix < 0 || iy >= u_h || ix >= u_w) continue;
            int kpos = ky * 3 + kx;
            vec4 u = texelFetch(u_u_gru,  ivec2(ix, iy), 0);
            vec4 d = texelFetch(u_d_full, ivec2(ix, iy), 0);
            vec4 r = texelFetch(u_rgb,    ivec2(ix, iy), 0);
            int b0 = (kpos * 3 + 0) * 4, b1 = (kpos * 3 + 1) * 4, b2 = (kpos * 3 + 2) * 4;
            acc += wf(b0 + 0) * u.x + wf(b0 + 1) * u.y;
            acc += wf(b1 + 0) * d.x + wf(b1 + 1) * d.y + wf(b1 + 2) * d.z + wf(b1 + 3) * d.w;
            acc += wf(b2 + 0) * r.x + wf(b2 + 1) * r.y + wf(b2 + 2) * r.z;
        }
    }

    fragColor = vec4(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
`;var ce=class extends c{inputs;weights;output;dispatch;shader=kt;constructor(e,t,r,o$1,i){super(e);let n=this.makeTexture(o(i.weights),27,1),s=this.makeTexture(p(i.bias),1,1),u=t.w,l=this.makeTexture(null,u,t.h);this.output={h:t.h,w:t.w,c:4,texture:l,texW:u,texH:t.h},this.inputs=[t,r,o$1],this.weights=[],this.samplers=[{name:"u_u_gru",texture:t.texture},{name:"u_d_full",texture:r.texture},{name:"u_rgb",texture:o$1.texture},{name:"u_weights",texture:n},{name:"u_bias",texture:s}],this.uniformInts={u_w:t.w,u_h:t.h},this.defaultSetup(),this.dispatch=[u,t.h];}};var Lt=`#version 300 es
// Composite an RGBA image over a solid background color, gated by a
// 1-channel alpha mask. Output: premultiplied RGBA.
//
// Assumes image and alpha textures are the same h\xD7w and that the canvas
// (viewport) matches that resolution \u2014 no resampling here. The upscaler op
// (separate) handles aligning alpha to the image resolution upstream.

precision highp float;

uniform sampler2D u_image;   // image as NHWC vec4 (RGBA in vec4)
uniform sampler2D u_alpha;   // alpha as NHWC vec4 (value in .r)
uniform vec3      u_bgColor; // straight-alpha background color, [0,1]

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left, but tensor textures are
    // stored top-down (matches NHWC + getImageData). Flip y when sampling so
    // the displayed image is upright. (WebGPU's @builtin(position) is already
    // top-down, so its compositor doesn't need this.)
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));
    vec3  fg = texelFetch(u_image, px, 0).rgb;
    float a  = texelFetch(u_alpha, px, 0).r;

    // Straight-alpha composite, then premultiply for the canvas's
    // premultiplied surface format.
    vec3 rgb = fg * a + u_bgColor * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
`;var Fo=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,pe=class{constructor(e,t,r,o){this.backend=e;if(t.h!==r.h||t.w!==r.w)throw new Error(`CompositeSolid: image (${t.h}\xD7${t.w}) and alpha (${r.h}\xD7${r.w}) must match. Run the upscaler first.`);let i=t,n=r;this.imageTex=i.texture,this.alphaTex=n.texture,this.bgColor=o;let s=e.gl,u=s.createShader(s.VERTEX_SHADER);s.shaderSource(u,Fo),s.compileShader(u);let l=s.createShader(s.FRAGMENT_SHADER);if(s.shaderSource(l,Lt),s.compileShader(l),!s.getShaderParameter(l,s.COMPILE_STATUS))throw new Error(`composite_solid GLSL compile error: ${s.getShaderInfoLog(l)}`);if(this.program=s.createProgram(),s.attachShader(this.program,u),s.attachShader(this.program,l),s.linkProgram(this.program),!s.getProgramParameter(this.program,s.LINK_STATUS))throw new Error(`composite_solid GLSL link error: ${s.getProgramInfoLog(this.program)}`)}backend;program;imageTex;alphaTex;bgColor;run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.uniform3f(e.getUniformLocation(this.program,"u_bgColor"),this.bgColor[0],this.bgColor[1],this.bgColor[2]),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var Wt=`#version 300 es
// Same as composite_solid but bg is a texture (NHWC vec4 tensor) instead of
// a uniform color. Caller invariants: image, alpha, bg all share h \xD7 w, and
// canvas dimensions match.

precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_alpha;
uniform sampler2D u_bg;

out vec4 fragColor;

void main() {
    // WebGL gl_FragCoord origin is bottom-left; tensor textures are top-down.
    int H = textureSize(u_image, 0).y;
    ivec2 px = ivec2(int(gl_FragCoord.x), H - 1 - int(gl_FragCoord.y));

    vec3  fg = texelFetch(u_image, px, 0).rgb;
    float a  = texelFetch(u_alpha, px, 0).r;
    vec3  bg = texelFetch(u_bg,    px, 0).rgb;

    vec3 rgb = fg * a + bg * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
`;var Ao=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,he=class{constructor(e,t,r,o){this.backend=e;if(t.h!==r.h||t.w!==r.w||t.h!==o.h||t.w!==o.w)throw new Error(`CompositeImage: image (${t.h}\xD7${t.w}), alpha (${r.h}\xD7${r.w}), and bg (${o.h}\xD7${o.w}) must all match. Run upscaler / resizer first.`);this.imageTex=t.texture,this.alphaTex=r.texture,this.bgTex=o.texture;let i=e.gl,n=i.createShader(i.VERTEX_SHADER);i.shaderSource(n,Ao),i.compileShader(n);let s=i.createShader(i.FRAGMENT_SHADER);if(i.shaderSource(s,Wt),i.compileShader(s),!i.getShaderParameter(s,i.COMPILE_STATUS))throw new Error(`composite_image GLSL compile error: ${i.getShaderInfoLog(s)}`);if(this.program=i.createProgram(),i.attachShader(this.program,n),i.attachShader(this.program,s),i.linkProgram(this.program),!i.getProgramParameter(this.program,i.LINK_STATUS))throw new Error(`composite_image GLSL link error: ${i.getProgramInfoLog(this.program)}`)}backend;program;imageTex;alphaTex;bgTex;run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.bgTex),e.uniform1i(e.getUniformLocation(this.program,"u_bg"),2),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var Ct=`#version 300 es
// Like composite_image but bg is bilinearly sampled \u2014 bg is at a smaller
// resolution than (image, alpha) at canvas h \xD7 w. Used by CompositorBlur to
// skip the final full-res upsample in the blur pyramid.
//
// Tensor textures are top-down (origin at top-left of the source image),
// while gl_FragCoord origin is bottom-left \u2014 flip y when computing px.

precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_alpha;
uniform sampler2D u_bg;

uniform int u_out_w;
uniform int u_out_h;
uniform int u_bg_w;
uniform int u_bg_h;

out vec4 fragColor;

void main() {
    int x = int(gl_FragCoord.x);
    int y = u_out_h - 1 - int(gl_FragCoord.y);

    vec3  fg = texelFetch(u_image, ivec2(x, y), 0).rgb;
    float a  = texelFetch(u_alpha, ivec2(x, y), 0).r;

    // Bilinear sample bg at the corresponding location. align_corners=False.
    float src_x = (float(x) + 0.5) * (float(u_bg_w) / float(u_out_w)) - 0.5;
    float src_y = (float(y) + 0.5) * (float(u_bg_h) / float(u_out_h)) - 0.5;
    int x0 = clamp(int(floor(src_x)),     0, u_bg_w - 1);
    int x1 = clamp(int(floor(src_x)) + 1, 0, u_bg_w - 1);
    int y0 = clamp(int(floor(src_y)),     0, u_bg_h - 1);
    int y1 = clamp(int(floor(src_y)) + 1, 0, u_bg_h - 1);
    float wx = src_x - floor(src_x);
    float wy = src_y - floor(src_y);

    vec3 tl = texelFetch(u_bg, ivec2(x0, y0), 0).rgb;
    vec3 tr = texelFetch(u_bg, ivec2(x1, y0), 0).rgb;
    vec3 bl = texelFetch(u_bg, ivec2(x0, y1), 0).rgb;
    vec3 br = texelFetch(u_bg, ivec2(x1, y1), 0).rgb;
    vec3 bg = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    vec3 rgb = fg * a + bg * (1.0 - a);
    fragColor = vec4(rgb, 1.0);
}
`;var Do=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,me=class{constructor(e,t,r,o){this.backend=e;if(t.h!==r.h||t.w!==r.w)throw new Error(`CompositeImageBilinear: image (${t.h}\xD7${t.w}) and alpha (${r.h}\xD7${r.w}) must match.`);this.imageTex=t.texture,this.alphaTex=r.texture,this.bgTex=o.texture,this.outW=t.w,this.outH=t.h,this.bgW=o.w,this.bgH=o.h;let i=e.gl,n=i.createShader(i.VERTEX_SHADER);i.shaderSource(n,Do),i.compileShader(n);let s=i.createShader(i.FRAGMENT_SHADER);if(i.shaderSource(s,Ct),i.compileShader(s),!i.getShaderParameter(s,i.COMPILE_STATUS))throw new Error(`composite_image_bilinear GLSL compile error: ${i.getShaderInfoLog(s)}`);if(this.program=i.createProgram(),i.attachShader(this.program,n),i.attachShader(this.program,s),i.linkProgram(this.program),!i.getProgramParameter(this.program,i.LINK_STATUS))throw new Error(`composite_image_bilinear GLSL link error: ${i.getProgramInfoLog(this.program)}`)}backend;program;imageTex;alphaTex;bgTex;outW;outH;bgW;bgH;run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.alphaTex),e.uniform1i(e.getUniformLocation(this.program,"u_alpha"),1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.bgTex),e.uniform1i(e.getUniformLocation(this.program,"u_bg"),2),e.uniform1i(e.getUniformLocation(this.program,"u_out_w"),this.outW),e.uniform1i(e.getUniformLocation(this.program,"u_out_h"),this.outH),e.uniform1i(e.getUniformLocation(this.program,"u_bg_w"),this.bgW),e.uniform1i(e.getUniformLocation(this.program,"u_bg_h"),this.bgH),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var Bo=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,de=class{constructor(e,t){this.backend=e;this.imageTex=t.texture;let r=e.gl,o=r.createShader(r.VERTEX_SHADER);r.shaderSource(o,Bo),r.compileShader(o);let i=r.createShader(r.FRAGMENT_SHADER);if(r.shaderSource(i,V),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS))throw new Error(`composite_passthrough GLSL compile error: ${r.getShaderInfoLog(i)}`);if(this.program=r.createProgram(),r.attachShader(this.program,o),r.attachShader(this.program,i),r.linkProgram(this.program),!r.getProgramParameter(this.program,r.LINK_STATUS))throw new Error(`composite_passthrough GLSL link error: ${r.getProgramInfoLog(this.program)}`)}backend;program;imageTex;run(){let e=this.backend.gl;e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.imageTex),e.uniform1i(e.getUniformLocation(this.program,"u_image"),0),this.backend.bindDisplayFramebuffer(),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var Et=`#version 300 es
precision highp float;

// Input op \u2014 bilinear-sample a source texture (RGBA8 unorm uploaded from an
// ImageBitmap or VideoFrame) at the target resolution. Output texture format
// is RGBA32F or RGBA16F depending on backend.dtype; the framebuffer write
// stores fragColor into whatever format is bound.

uniform sampler2D u_src;
uniform int       u_out_w;
uniform int       u_out_h;
// Orientation: upright uv \u2192 source uv (see model/orientation.ts).
uniform vec3      u_uv_x;
uniform vec3      u_uv_y;

out vec4 fragColor;

void main() {
    // gl_FragCoord is already at the pixel centre (x.5).
    vec3 o = vec3(gl_FragCoord.xy / vec2(float(u_out_w), float(u_out_h)), 1.0);
    fragColor = texture(u_src, vec2(dot(u_uv_x, o), dot(u_uv_y, o)));
}
`;var Po=`#version 300 es
const vec2 VERTS[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
    vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0)
);
void main() { gl_Position = vec4(VERTS[gl_VertexID], 0.0, 1.0); }`,_e=class{constructor(e,t,r){this.backend=e;let o=e.gl;this.gl=o,this.output=e.tensor(t,r,4),this.srcTex=o.createTexture(),o.bindTexture(o.TEXTURE_2D,this.srcTex),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);let i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,Po),o.compileShader(i);let n=o.createShader(o.FRAGMENT_SHADER);if(o.shaderSource(n,Et),o.compileShader(n),!o.getShaderParameter(n,o.COMPILE_STATUS))throw new Error(`Input GLSL compile error: ${o.getShaderInfoLog(n)}`);if(this.program=o.createProgram(),o.attachShader(this.program,i),o.attachShader(this.program,n),o.linkProgram(this.program),!o.getProgramParameter(this.program,o.LINK_STATUS))throw new Error(`Input GLSL link error: ${o.getProgramInfoLog(this.program)}`);this.uSrc=o.getUniformLocation(this.program,"u_src"),this.uOutW=o.getUniformLocation(this.program,"u_out_w"),this.uOutH=o.getUniformLocation(this.program,"u_out_h"),this.uUvX=o.getUniformLocation(this.program,"u_uv_x"),this.uUvY=o.getUniformLocation(this.program,"u_uv_y");}backend;output;gl;program;srcTex;uOutW;uOutH;uSrc;uUvX;uUvY;orientation=null;source=null;setSource(e,t){this.source=e,this.orientation=t??null;}run(){if(!this.source)throw new Error("InputWebGL.run() called before setSource()");let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.srcTex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,this.source),e.useProgram(this.program),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.srcTex),e.uniform1i(this.uSrc,0),e.uniform1i(this.uOutW,this.output.w),e.uniform1i(this.uOutH,this.output.h);let t=g(this.orientation);e.uniform3f(this.uUvX,t[0],t[1],t[2]),e.uniform3f(this.uUvY,t[3],t[4],t[5]),e.bindFramebuffer(e.FRAMEBUFFER,this.backend.fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.output.texture,0),e.viewport(0,0,this.output.texW,this.output.texH),e.bindVertexArray(null),e.drawArrays(e.TRIANGLES,0,6);}};var Gt=`#version 300 es
// Global average pool, pass 1 of 2: mean over x for each (row, channel group).
// Fragment shaders can't share work across pixels, so the pool is split into a
// row pass (out: (C_groups, H)) and a column pass (pool_cols.glsl).
precision highp float;
precision highp int;

uniform sampler2D u_input;   // (in_W * C_groups, in_H)
uniform int u_in_w;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    int c = int(gl_FragCoord.x);
    int y = int(gl_FragCoord.y);
    vec4 sum = vec4(0.0);
    for (int x = 0; x < u_in_w; x++) sum += texelFetch(u_input, ivec2(x * u_c_groups + c, y), 0);
    fragColor = sum / float(u_in_w);
}
`;var Ft=`#version 300 es
// Global average pool, pass 2 of 2: mean of the row means \u2192 (C_groups, 1).
precision highp float;
precision highp int;

uniform sampler2D u_input;   // (C_groups, in_H) \u2014 pool_rows output
uniform int u_in_h;

out vec4 fragColor;

void main() {
    int c = int(gl_FragCoord.x);
    vec4 sum = vec4(0.0);
    for (int y = 0; y < u_in_h; y++) sum += texelFetch(u_input, ivec2(c, y), 0);
    fragColor = sum / float(u_in_h);
}
`;var Fe=class extends c{inputs;weights=[];output;dispatch;shader=Gt;constructor(e,t){super(e);let r=t.c/4;this.output={h:t.h,w:1,c:t.c,texture:this.makeTexture(null,r,t.h),texW:r,texH:t.h},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_w:t.w,u_c_groups:r},this.defaultSetup(),this.dispatch=[r,t.h];}},Se=class extends c{inputs;weights=[];output;dispatch;shader=Ft;constructor(e,t){super(e);let r=t.c/4;this.output={h:1,w:1,c:t.c,texture:this.makeTexture(null,r,1),texW:r,texH:1},this.inputs=[t],this.samplers=[{name:"u_input",texture:t.texture}],this.uniformInts={u_in_h:t.h},this.defaultSetup(),this.dispatch=[r,1];}},fe=class{inputs;output;rows;cols;constructor(e,t){this.inputs=[t],this.rows=new Fe(e,t),this.cols=new Se(e,this.rows.output),this.output=this.cols.output;}run(){this.rows.run(),this.cols.run();}};var St=`#version 300 es
// Per-channel scale: x (W * C_groups, H) * scale (C_groups, 1), broadcast over H\xD7W.
precision highp float;
precision highp int;

uniform sampler2D u_input;
uniform sampler2D u_scale;
uniform int u_c_groups;

out vec4 fragColor;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(u_input, p, 0) * texelFetch(u_scale, ivec2(p.x % u_c_groups, 0), 0);
}
`;var xe=class extends c{inputs;weights=[];output;dispatch;shader=St;constructor(e,t,r){if(super(e),r.h!==1||r.w!==1||r.c!==t.c)throw new Error(`ChannelScale: scale must be 1\xD71\xD7${t.c}, got ${r.h}\xD7${r.w}\xD7${r.c}`);let o=t;this.output={h:t.h,w:t.w,c:t.c,texture:this.makeTexture(null,o.texW,o.texH),texW:o.texW,texH:o.texH},this.inputs=[t,r],this.samplers=[{name:"u_input",texture:o.texture},{name:"u_scale",texture:r.texture}],this.uniformInts={u_c_groups:t.c/4},this.defaultSetup(),this.dispatch=[o.texW,o.texH];}};var Ae=class a{constructor(e,t,r){this.gl=e;this.canvas=t;this.dtype=r;this.fbo=e.createFramebuffer(),this.textureFormat=r==="f16"?{internalFormat:e.RGBA16F,format:e.RGBA,type:e.HALF_FLOAT,bytesPerElement:2}:{internalFormat:e.RGBA32F,format:e.RGBA,type:e.FLOAT,bytesPerElement:4},this.ops={Conv2d:(o,i,n)=>new F(this,o,i,n),ConvTranspose2d:(o,i,n)=>new S(this,o,i,n),DepthwiseConv2d:(o,i,n)=>new A(this,o,i,n),Add:(o,i)=>new R(this,o,i),Sigmoid:o=>new D(this,o),Tanh:o=>new B(this,o),ElementwiseMul:(o,i)=>new U(this,o,i),GlobalAvgPool:o=>new fe(this,o),ChannelScale:(o,i)=>new xe(this,o,i),Warp:(o,i,n)=>new P(this,o,i,n),FaceBoxFromHeatmaps:(o,i)=>new M(this,o,i),FaceBoxesFromHeatmaps:(o,i)=>new O(this,o,i),ReframeState:(o,i,n,s)=>new H(this,o,i,n,s),Reframe:(o,i)=>new I(this,o,i),CropResample:(o,i,n)=>new N(this,o,i,n),FaceTouchupStage:(o,i,n,s,u)=>new $(this,o,i,n,s,u),Stabilize:(o,i,n,s,u)=>new j(this,o,i,n,s,u),BilinearUpsample:(o,i)=>new K(this,o,i),Crop:(o,i)=>new Y(this,o,i),BicubicUpsample:(o,i)=>new q(this,o,i),ChannelConcat:(o,i)=>new Q(this,o,i),Conv2dAdd:(o,i,n,s)=>new te(this,o,i,n,s),ProjResidual:(o,i,n,s)=>new oe(this,o,i,n,s),ConcatConv2d:(o,i,n,s)=>new re(this,o,i,n,s),GatesFused:(o,i,n)=>new ie(this,o,i,n),CandUpdateFused:(o,i,n,s,u)=>new se(this,o,i,n,s,u),ConvExpand:(o,i)=>new ne(this,o,i),CatConv6to2:(o,i,n)=>new ae(this,o,i,n),DownAdapter:(o,i,n,s)=>new ue(this,o,i,n,s),UpFinal:(o,i,n)=>new le(this,o,i,n),UpFinalSkip:(o,i,n,s)=>new ce(this,o,i,n,s),UpsampleConcat:(o,i,n)=>new Z(this,o,i,n),UpsampleConv1x1:(o,i,n)=>new ee(this,o,i,n),UpsampleSigmoid:(o,i)=>new J(this,o,i),Input:(o,i)=>new _e(this,o,i)},this.presenters={CompositeSolid:(o,i,n)=>new pe(this,o,i,n),CompositeImage:(o,i,n)=>new he(this,o,i,n),CompositeImageBilinear:(o,i,n)=>new me(this,o,i,n),CompositePassthrough:o=>new de(this,o),LandmarkOverlay:(o,i,n,s)=>new X(this,o,i,n,s),FaceTouchup:(o,i,n,s,u)=>new z(this,o,i,n,s,u)};}gl;canvas;dtype;ops;presenters;fbo;textureFormat;static isAvailable(){let e=null;try{return e=new OffscreenCanvas(1,1).getContext("webgl2"),!(!e||!e.getExtension("EXT_color_buffer_float"))}catch{return  false}finally{e?.getExtension("WEBGL_lose_context")?.loseContext();}}static create(e){let t=e.canvas.getContext("webgl2");if(!t)throw new Error("WebGL2 not available");if(!t.getExtension("EXT_color_buffer_float"))throw new Error("EXT_color_buffer_float not available");return new a(t,e.canvas,e.dtype??"f32")}attachCanvas(e){throw new Error(`WebGLBackend.attachCanvas('${e}'): WebGL cannot render to a second canvas; use the renderer's snapshot-and-present path for preview output`)}bindDisplayFramebuffer(){this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null),this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}toTextureView(e){if(e===null)return null;let t=this.dtype==="f16",r=e instanceof Uint16Array;return t===r?e:t?i(e):j$1(e)}tensor(e,t,r,o){let i=t*(r/4),n=e,s=this.gl,u=s.createTexture(),l=this.textureFormat,p=this.toTextureView(o??null);return s.bindTexture(s.TEXTURE_2D,u),s.texImage2D(s.TEXTURE_2D,0,l.internalFormat,i,n,0,l.format,l.type,p),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),{h:e,w:t,c:r,texture:u,texW:i,texH:n}}upload(e){return {data:e}}async readback(e){let t=this.gl,r=this.textureFormat;if(t.bindFramebuffer(t.FRAMEBUFFER,this.fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,e.texture,0),this.dtype==="f16"){let i=new Uint16Array(e.texW*e.texH*4);return t.readPixels(0,0,e.texW,e.texH,r.format,t.HALF_FLOAT,i),t.bindFramebuffer(t.FRAMEBUFFER,null),j$1(i)}let o=new Float32Array(e.texW*e.texH*4);return t.readPixels(0,0,e.texW,e.texH,r.format,t.FLOAT,o),t.bindFramebuffer(t.FRAMEBUFFER,null),o}copyTensor(e,t){if(e.texW!==t.texW||e.texH!==t.texH)throw new Error(`copyTensor: size mismatch (src ${e.texW}\xD7${e.texH} vs dst ${t.texW}\xD7${t.texH})`);let r=this.gl;r.bindFramebuffer(r.FRAMEBUFFER,this.fbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,e.texture,0),r.bindTexture(r.TEXTURE_2D,t.texture),r.copyTexSubImage2D(r.TEXTURE_2D,0,0,0,0,0,e.texW,e.texH),r.bindFramebuffer(r.FRAMEBUFFER,null);}async sync(){let e=this.gl,t=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);if(!t){e.finish();return}for(e.flush();;){let r=e.clientWaitSync(t,0,0);if(r===e.ALREADY_SIGNALED||r===e.CONDITION_SATISFIED){e.deleteSync(t);return}if(r===e.WAIT_FAILED)throw e.deleteSync(t),new Error("WebGLBackend.sync: clientWaitSync returned WAIT_FAILED");await new Promise(o=>setTimeout(o,1));}}destroy(){this.gl.deleteFramebuffer(this.fbo),this.gl.getExtension("WEBGL_lose_context")?.loseContext();}};function At(a,e,t,r){let o=r.variant,i=o==="E"||o==="D",n=o==="D",s=e.h,u=e.w,l=[],p=null,h=null,m=0,x=0,_;if(i)if(n){if(!t.down2)throw new Error("variant D requires w.down2");m=Math.round(s/1.25),x=Math.round(u/1.25);let g=a.ops.Conv2d(e,t.down1,{outChannels:r.cHigh,kernel:3,stride:1,padding:1,activation:"relu"});l.push(g),h=g.output;let b=a.ops.BilinearUpsample(h,{outH:m,outW:x});l.push(b),p=b.output;let L=a.ops.DownAdapter(p,t.down2,t.adapter,{stride:2});l.push(L),_=L.output;}else {if(!t.down2)throw new Error("variant E requires w.down2");let g=a.ops.Conv2d(e,t.down1,{outChannels:r.cHigh,kernel:3,stride:2,padding:1,activation:"relu"});l.push(g),p=g.output,m=p.h,x=p.w;let b=a.ops.DownAdapter(p,t.down2,t.adapter,{stride:2});l.push(b),_=b.output;}else {let g=o==="A"?2:3,b=a.ops.DownAdapter(e,t.down1,t.adapter,{stride:g});l.push(b),_=b.output;}return {steps:l,adapted:_,d1:p,dFull:h,midH:m,midW:x}}function Rt(a,e,t,r,o,i,n,s,u){let l=u.variant,p=l==="E"||l==="D",h=l==="D",m=[],x=a.ops.ConvExpand(t,s.expandFeat);m.push(x);let _=x.output,g;if(p){if(!s.up1Combine)throw new Error("two-stage variant requires w.up1Combine");let L=a.ops.BilinearUpsample(_,{outH:i,outW:n});m.push(L);let Ue=a.ops.CatConv6to2(L.output,r,s.up1Combine);m.push(Ue);let Pe=a.ops.BilinearUpsample(Ue.output,{outH:e.h,outW:e.w});m.push(Pe),g=Pe.output;}else {let L=a.ops.BilinearUpsample(_,{outH:e.h,outW:e.w});m.push(L),g=L.output;}let b=h?a.ops.UpFinalSkip(g,o,e,s.upCombine):a.ops.UpFinal(g,e,s.upCombine);return m.push(b),{steps:m,alpha:b.output}}var Re=class{constructor(e,t,r,o,i,n){this.backend=e;this.inputs=[t];let s=At(e,t,o,i),u=new n(e,s.adapted,r),l=e.ops.BilinearUpsample(u.featLowRes,{outH:s.adapted.h,outW:s.adapted.w}),p=Rt(e,t,l.output,s.d1,s.dFull,s.midH,s.midW,o,i);this.steps=[...s.steps,u,l,...p.steps],this.output=p.alpha,this.encoderTaps=u.encoderTaps,this.halfTap=u.halfTap;}backend;inputs;output;encoderTaps;halfTap;steps;run(){a(this.backend,()=>{for(let e of this.steps)e.run();});}};var E=class{inputs;output;dwOp;pwOp;constructor(e,t,r,o){this.inputs=[t],this.dwOp=e.ops.DepthwiseConv2d(t,r.dw,{kernel:o.kernel,stride:o.stride,padding:o.padding,activation:"relu6"}),this.pwOp=e.ops.Conv2d(this.dwOp.output,r.pw,{outChannels:o.outChannels,kernel:1,stride:1,padding:0,activation:"none"}),this.output=this.pwOp.output;}run(){this.dwOp.run(),this.pwOp.run();}};var f=class{inputs;output;expandOp;dwOp;projOp;constructor(e,t,r,o){this.inputs=[t];let i=o.midChannels!==o.inChannels,n=o.stride===1&&o.inChannels===o.outChannels;this.expandOp=i?e.ops.Conv2d(t,r.expand,{outChannels:o.midChannels,kernel:1,stride:1,padding:0,activation:"relu6"}):null;let s=this.expandOp?this.expandOp.output:t;this.dwOp=e.ops.DepthwiseConv2d(s,r.dw,{kernel:o.kernel,stride:o.stride,padding:o.padding,activation:"relu6"}),this.projOp=n?e.ops.ProjResidual(this.dwOp.output,t,r.proj,{outChannels:o.outChannels}):e.ops.Conv2d(this.dwOp.output,r.proj,{outChannels:o.outChannels,kernel:1,stride:1,padding:0,activation:"none"}),this.output=this.projOp.output;}run(){this.expandOp?.run(),this.dwOp.run(),this.projOp.run();}};var y=class{inputs;output;upOp;concatConvOp;conv2Op;constructor(e,t,r,o,i){this.inputs=[t,r],this.upOp=e.ops.BilinearUpsample(t,{outH:r.h,outW:r.w}),this.concatConvOp=e.ops.ConcatConv2d(this.upOp.output,r,o.conv1,{outChannels:i.outChannels}),this.conv2Op=e.ops.Conv2d(this.concatConvOp.output,o.conv2,{outChannels:i.outChannels,kernel:3,stride:1,padding:1,activation:"relu6"}),this.output=this.conv2Op.output;}run(){this.upOp.run(),this.concatConvOp.run(),this.conv2Op.run();}};var ge=class{output;featLowRes;encoderTaps;halfTap;stem;s0;s1b0;s1b1;s2b0;s2b1;s3b0;s3b1;s3b2;s4b0;s4b1;s4b2;bottleneck;dec0;dec1;finalUp;outConv;alpha;constructor(e,t,r){this.stem=e.ops.Conv2d(t,r.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new E(e,this.stem.output,r.encoder.s0,{outChannels:16,kernel:3,stride:1,padding:1}),this.s1b0=new f(e,this.s0.output,r.encoder.s1[0],{inChannels:16,midChannels:96,outChannels:24,kernel:3,stride:2,padding:"same"}),this.s1b1=new f(e,this.s1b0.output,r.encoder.s1[1],{inChannels:24,midChannels:144,outChannels:24,kernel:3,stride:1,padding:1}),this.s2b0=new f(e,this.s1b1.output,r.encoder.s2[0],{inChannels:24,midChannels:144,outChannels:40,kernel:5,stride:2,padding:"same"}),this.s2b1=new f(e,this.s2b0.output,r.encoder.s2[1],{inChannels:40,midChannels:240,outChannels:40,kernel:5,stride:1,padding:2}),this.s3b0=new f(e,this.s2b1.output,r.encoder.s3[0],{inChannels:40,midChannels:240,outChannels:80,kernel:3,stride:2,padding:"same"}),this.s3b1=new f(e,this.s3b0.output,r.encoder.s3[1],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s3b2=new f(e,this.s3b1.output,r.encoder.s3[2],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s4b0=new f(e,this.s3b2.output,r.encoder.s4[0],{inChannels:80,midChannels:480,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b1=new f(e,this.s4b0.output,r.encoder.s4[1],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b2=new f(e,this.s4b1.output,r.encoder.s4[2],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.bottleneck=e.ops.Conv2d(this.s4b2.output,r.bottleneck,{outChannels:128,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new y(e,this.bottleneck.output,this.s2b1.output,r.decoder.blocks[0],{outChannels:64}),this.dec1=new y(e,this.dec0.output,this.s1b1.output,r.decoder.blocks[1],{outChannels:32}),this.finalUp=e.ops.UpsampleConv1x1(this.dec1.output,r.decoder.finalUpsample,{outH:this.dec1.output.h*2,outW:this.dec1.output.w*2,outChannels:32,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[this.s1b1.output,this.s2b1.output,this.s4b2.output],this.halfTap=this.s0.output,this.outConv=e.ops.Conv2d(this.finalUp.output,r.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output;}run(){this.stem.run(),this.s0.run(),this.s1b0.run(),this.s1b1.run(),this.s2b0.run(),this.s2b1.run(),this.s3b0.run(),this.s3b1.run(),this.s3b2.run(),this.s4b0.run(),this.s4b1.run(),this.s4b2.run(),this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run();}};var be=class{output;featLowRes;encoderTaps;stem;s0;s1b0;s1b1;s2b0;s2b1;s3b0;s3b1;s3b2;s4b0;s4b1;s4b2;s5b0;s5b1;s5b2;s5b3;s6b0;bottleneck;dec0;dec1;dec2;finalUp;outConv;alpha;constructor(e,t,r){this.stem=e.ops.Conv2d(t,r.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new E(e,this.stem.output,r.encoder.s0,{outChannels:16,kernel:3,stride:1,padding:1}),this.s1b0=new f(e,this.s0.output,r.encoder.s1[0],{inChannels:16,midChannels:96,outChannels:24,kernel:3,stride:2,padding:"same"}),this.s1b1=new f(e,this.s1b0.output,r.encoder.s1[1],{inChannels:24,midChannels:144,outChannels:24,kernel:3,stride:1,padding:1}),this.s2b0=new f(e,this.s1b1.output,r.encoder.s2[0],{inChannels:24,midChannels:144,outChannels:40,kernel:5,stride:2,padding:"same"}),this.s2b1=new f(e,this.s2b0.output,r.encoder.s2[1],{inChannels:40,midChannels:240,outChannels:40,kernel:5,stride:1,padding:2}),this.s3b0=new f(e,this.s2b1.output,r.encoder.s3[0],{inChannels:40,midChannels:240,outChannels:80,kernel:3,stride:2,padding:"same"}),this.s3b1=new f(e,this.s3b0.output,r.encoder.s3[1],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s3b2=new f(e,this.s3b1.output,r.encoder.s3[2],{inChannels:80,midChannels:480,outChannels:80,kernel:3,stride:1,padding:1}),this.s4b0=new f(e,this.s3b2.output,r.encoder.s4[0],{inChannels:80,midChannels:480,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b1=new f(e,this.s4b0.output,r.encoder.s4[1],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s4b2=new f(e,this.s4b1.output,r.encoder.s4[2],{inChannels:112,midChannels:672,outChannels:112,kernel:5,stride:1,padding:2}),this.s5b0=new f(e,this.s4b2.output,r.encoder.s5[0],{inChannels:112,midChannels:672,outChannels:192,kernel:5,stride:2,padding:"same"}),this.s5b1=new f(e,this.s5b0.output,r.encoder.s5[1],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s5b2=new f(e,this.s5b1.output,r.encoder.s5[2],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s5b3=new f(e,this.s5b2.output,r.encoder.s5[3],{inChannels:192,midChannels:1152,outChannels:192,kernel:5,stride:1,padding:2}),this.s6b0=new f(e,this.s5b3.output,r.encoder.s6[0],{inChannels:192,midChannels:1152,outChannels:320,kernel:3,stride:1,padding:1}),this.bottleneck=e.ops.Conv2d(this.s6b0.output,r.bottleneck,{outChannels:128,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new y(e,this.bottleneck.output,this.s4b2.output,r.decoder.blocks[0],{outChannels:64}),this.dec1=new y(e,this.dec0.output,this.s2b1.output,r.decoder.blocks[1],{outChannels:32}),this.dec2=new y(e,this.dec1.output,this.s1b1.output,r.decoder.blocks[2],{outChannels:16}),this.finalUp=e.ops.UpsampleConv1x1(this.dec2.output,r.decoder.finalUpsample,{outH:this.dec2.output.h*2,outW:this.dec2.output.w*2,outChannels:16,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[this.s1b1.output,this.s2b1.output,this.s4b2.output,this.s6b0.output],this.outConv=e.ops.Conv2d(this.finalUp.output,r.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output;}run(){this.stem.run(),this.s0.run(),this.s1b0.run(),this.s1b1.run(),this.s2b0.run(),this.s2b1.run(),this.s3b0.run(),this.s3b1.run(),this.s3b2.run(),this.s4b0.run(),this.s4b1.run(),this.s4b2.run(),this.s5b0.run(),this.s5b1.run(),this.s5b2.run(),this.s5b3.run(),this.s6b0.run(),this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.dec2.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run();}};var De=[[{in:24,mid:144,out:32,k:3,s:2},{in:32,mid:192,out:32,k:3,s:1},{in:32,mid:192,out:32,k:3,s:1}],[{in:32,mid:192,out:48,k:5,s:2},{in:48,mid:288,out:48,k:5,s:1},{in:48,mid:288,out:48,k:5,s:1}],[{in:48,mid:288,out:96,k:3,s:2},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1},{in:96,mid:576,out:96,k:3,s:1}],[{in:96,mid:576,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1},{in:136,mid:816,out:136,k:5,s:1}],[{in:136,mid:816,out:232,k:5,s:2},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1},{in:232,mid:1392,out:232,k:5,s:1}],[{in:232,mid:1392,out:384,k:3,s:1}]],ve=class{output;featLowRes;encoderTaps;stem;s0;stages;bottleneck;dec0;dec1;dec2;finalUp;outConv;alpha;constructor(e,t,r){this.stem=e.ops.Conv2d(t,r.encoder.stem,{outChannels:32,kernel:3,stride:2,padding:"same",activation:"relu6"}),this.s0=new E(e,this.stem.output,r.encoder.s0,{outChannels:24,kernel:3,stride:1,padding:1});let o=[r.encoder.s1,r.encoder.s2,r.encoder.s3,r.encoder.s4,r.encoder.s5,r.encoder.s6];this.stages=[];let i=this.s0.output;for(let h=0;h<De.length;h++){let m=[];for(let x=0;x<De[h].length;x++){let _=De[h][x],g=new f(e,i,o[h][x],{inChannels:_.in,midChannels:_.mid,outChannels:_.out,kernel:_.k,stride:_.s,padding:_.s===2?"same":(_.k-1)/2});m.push(g),i=g.output;}this.stages.push(m);}let n=h=>this.stages[h][this.stages[h].length-1].output,s=n(0),u=n(1),l=n(3),p=n(5);this.bottleneck=e.ops.Conv2d(p,r.bottleneck,{outChannels:256,kernel:1,stride:1,padding:0,activation:"relu6"}),this.dec0=new y(e,this.bottleneck.output,l,r.decoder.blocks[0],{outChannels:128}),this.dec1=new y(e,this.dec0.output,u,r.decoder.blocks[1],{outChannels:64}),this.dec2=new y(e,this.dec1.output,s,r.decoder.blocks[2],{outChannels:32}),this.finalUp=e.ops.UpsampleConv1x1(this.dec2.output,r.decoder.finalUpsample,{outH:this.dec2.output.h*2,outW:this.dec2.output.w*2,outChannels:32,activation:"relu6"}),this.featLowRes=this.finalUp.output,this.encoderTaps=[s,u,l,p],this.outConv=e.ops.Conv2d(this.finalUp.output,r.decoder.outputConv,{outChannels:4,kernel:1,stride:1,padding:0,activation:"none"}),this.alpha=e.ops.UpsampleSigmoid(this.outConv.output,{outH:this.outConv.output.h*2,outW:this.outConv.output.w*2}),this.output=this.alpha.output;}run(){this.stem.run(),this.s0.run();for(let e of this.stages)for(let t of e)t.run();this.bottleneck.run(),this.dec0.run(),this.dec1.run(),this.dec2.run(),this.finalUp.run(),this.outConv.run(),this.alpha.run();}};var Dt=ge,Bt=be,Io=ve,No={xs:{base:Dt,wrapper:{variant:"B",cHigh:4,cLow:4,cUp:2},canvasRes:{w:384,h:240},baseRes:{w:128,h:80},flowFuseStem:true},small:{base:Dt,wrapper:{variant:"A",cHigh:4,cLow:4,cUp:2},canvasRes:{w:384,h:224},baseRes:{w:192,h:112}},medium:{base:Bt,wrapper:{variant:"A",cHigh:4,cLow:4,cUp:2},canvasRes:{w:512,h:320},baseRes:{w:256,h:160}},large:{base:Bt,wrapper:{variant:"D",cHigh:4,cLow:4,cUp:2},canvasRes:{w:640,h:400},baseRes:{w:256,h:160}},xl:{base:Io,wrapper:{variant:"E",cHigh:4,cLow:4,cUp:2},canvasRes:{w:1280,h:768},baseRes:{w:320,h:192}}};var Vo=a=>typeof a=="object"&&a!==null&&typeof a.offset=="number"&&typeof a.length=="number";function Xo(a){if(a.byteLength<4)throw new Error("weights buffer too small");let e=new DataView(a,0,4).getUint32(0,true),t=4+e;if(a.byteLength<t)throw new Error("weights buffer truncated (header)");let r=new Uint8Array(a,4,e),o=JSON.parse(new TextDecoder().decode(r)),i=o.__dtype__??"f32",n=i==="f16"?2:4;if(t%n!==0)throw new Error(`payload not ${n}-byte aligned (header=${e})`);let s=(a.byteLength-t)/n,u=l=>{if(Vo(l)){let{offset:p,length:h}=l;if(p+h>s)throw new Error(`array ref out of range: offset=${p} length=${h}`);let m=t+p*n;return i==="f16"?new Uint16Array(a,m,h):new Float32Array(a,m,h)}if(Array.isArray(l))return l.map(u);if(typeof l=="object"&&l!==null){let p={};for(let h of Object.keys(l))h!=="__dtype__"&&(p[h]=u(l[h]));return p}return l};return u(o)}var ye=class{op;constructor(e,t,r,o){this.op=e.ops.BilinearUpsample(t,{outH:r,outW:o});}get output(){return this.op.output}run(){this.op.run();}};var we=class{op;constructor(e,t,r,o){this.op=e.ops.BicubicUpsample(t,{outH:r,outW:o});}get output(){return this.op.output}run(){this.op.run();}};var Te=class{presenter;constructor(e,t,r,o,i="main"){this.presenter=e.presenters.CompositeSolid(t,r,o,i);}run(){this.presenter.run();}};var ke=class{presenter;constructor(e,t,r,o,i="main"){this.presenter=e.presenters.CompositeImage(t,r,o,i);}run(){this.presenter.run();}};var Le=class{downs=[];ups=[];constructor(e,t,r){let o=zo(r),i=t;for(let n=0;n<o;n++){let s=e.ops.BilinearUpsample(i,{outH:Math.max(1,Math.floor(i.h/2)),outW:Math.max(1,Math.floor(i.w/2))});this.downs.push(s),i=s.output;}for(let n=o-1;n>=1;n--){let s=this.downs[n-1].output,u=e.ops.BilinearUpsample(i,{outH:s.h,outW:s.w});this.ups.push(u),i=u.output;}}get output(){return this.ups.length>0?this.ups[this.ups.length-1].output:this.downs[0].output}run(){for(let e of this.downs)e.run();for(let e of this.ups)e.run();}};function zo(a){let e=Math.max(1,3*a);return Math.max(2,Math.min(6,Math.round(Math.log2(e))))}var $o=.05,We=class{blur;presenter;constructor(e,t,r,o,i="main"){o<=$o?(this.blur=null,this.presenter=e.presenters.CompositeImage(t,r,t,i)):(this.blur=new Le(e,t,o),this.presenter=e.presenters.CompositeImageBilinear(t,r,this.blur.output,i));}run(){this.blur?.run(),this.presenter.run();}};var Be=class{constructor(e){this.backend=e;let t=e.canvas;this.displayInput=e.ops.Input(t.height,t.width),this.image=this.displayInput.output;}backend;displayInput;image;network=null;networkInput=null;upscaler=null;upscalerMode="bilinear";bgConfig={mode:"solid",color:[0,0,0]};effectChain=[];viewRect=null;viewFg=null;viewAlpha=null;displayDirty=false;compositors=new Map;attachNetwork(e,t,r){this.network=e,this.networkInput=t,this.upscalerMode=r.upscaler,this.bgConfig=r.background,this.upscaler=this.makeUpscaler(),this.rebuildView(),this.compositors.clear();}hasNetwork(){return this.network!==null}setSource(e,t){this.networkInput?.setSource(e,t),this.displayInput.setSource(e,t),this.displayDirty=true;}setUpscaler(e){e!==this.upscalerMode&&(this.upscalerMode=e,this.network&&(this.upscaler=this.makeUpscaler(),this.rebuildView(),this.compositors.clear()));}setBackground(e){this.bgConfig=e;}get displayImage(){return this.image}fgImage(){return this.viewFg?this.viewFg.output:this.chainTail()}chainTail(){return this.effectChain.length?this.effectChain[this.effectChain.length-1].output:this.image}alphaImage(){if(!this.upscaler)throw new Error("RenderOp.alphaImage called before attachNetwork");return this.viewAlpha?this.viewAlpha.output:this.upscaler.output}setViewTransform(e){this.viewRect=e,this.rebuildView(),this.compositors.clear();}rebuildView(){this.viewFg=null,this.viewAlpha=null,this.viewRect&&(this.viewFg=this.backend.ops.Reframe(this.chainTail(),this.viewRect),this.upscaler&&(this.viewAlpha=this.backend.ops.Reframe(this.upscaler.output,this.viewRect)));}setEffectChain(e){this.effectChain=e,this.rebuildView(),this.compositors.clear();}runEffects(){for(let e of this.effectChain)e.run();this.viewFg?.run(),this.viewAlpha?.run();}run(){a(this.backend,()=>{this.runModel(),this.runDisplay();});}runDisplay(){a(this.backend,()=>{this.refreshDisplayInput(),this.runEffects(),this.compositeMain("effect");});}runFgPassthrough(){a(this.backend,()=>{this.refreshDisplayInput(),this.runEffects(),this.compositeMain("fg");});}runPassthrough(){a(this.backend,()=>{this.refreshDisplayInput(),this.compositeMain("raw");});}compositeMain(e){let t=e==="effect"?this.bgConfig:e==="fg"?{mode:"fg-passthrough"}:{mode:"passthrough"};this.compositeTo("main",t);}refreshDisplayInput(){this.displayDirty&&(this.displayInput.run(),this.displayDirty=false);}compositeTo(e,t){let r=this.compositors.get(e);if(r&&jo(r.spec,t)){r.handle.run();return}let o=this.buildCompositor(e,t);this.compositors.set(e,{spec:t,handle:o}),o.run();}applyAlpha(e){if(!this.network||!this.upscaler)throw new Error("RenderOp.applyAlpha called before attachNetwork");a(this.backend,()=>{this.backend.copyTensor(e,this.network.output),this.upscaler.run();});}runModel(){if(!this.network||!this.networkInput||!this.upscaler)throw new Error("RenderOp.runModel called before attachNetwork");let{networkInput:e,network:t,upscaler:r}=this;a(this.backend,()=>{e.run(),t.run(),r.run();});}makeUpscaler(){if(!this.network)throw new Error("makeUpscaler called with no network");let{backend:e,network:t,image:r}=this;return this.upscalerMode==="bicubic"?new we(e,t.output,r.h,r.w):new ye(e,t.output,r.h,r.w)}buildCompositor(e,t){let{backend:r,image:o}=this;if(t.mode==="passthrough")return r.presenters.CompositePassthrough(o,e);let i=this.fgImage();if(t.mode==="fg-passthrough")return r.presenters.CompositePassthrough(i,e);if(!this.upscaler)throw new Error("RenderOp.compositeTo (effect spec) called before attachNetwork");let n=this.alphaImage();switch(t.mode){case "solid":return new Te(r,i,n,t.color,e);case "image":return new ke(r,i,n,t.image,e);case "blur":return new We(r,i,n,t.sigma,e)}}};function jo(a,e){if(a.mode!==e.mode)return  false;switch(e.mode){case "passthrough":return  true;case "fg-passthrough":return  true;case "solid":{let t=a.color;return t[0]===e.color[0]&&t[1]===e.color[1]&&t[2]===e.color[2]}case "blur":return a.sigma===e.sigma;case "image":return a.image===e.image}}export{Be as RenderOp,No as TIER_CONFIG,Re as TierModel,Ae as WebGLBackend,Xo as loadWeightsFromBinary};