function Ne(n,r){return n.batch?n.batch(r):r()}var yt={square:{inputRes:{w:256,h:256},file:"mediapipe_selfie_segmenter.f16.bin"},landscape:{inputRes:{w:256,h:144},file:"mediapipe_selfie_segmenter_landscape.f16.bin"}};function ri(n,r){let e=n/r,t=i=>{let a=yt[i].inputRes;return Math.abs(Math.log(e/(a.w/a.h)))};return t("landscape")<t("square")-1e-9?"landscape":"square"}var qe=class{constructor(r,e,t){this.backend=r;this.w=t;if(!t?.layers)throw new Error("MediaPipeSelfie: weights have no `layers` \u2014 expected a mediapipe_selfie_*.bin pack");if(e.h%16||e.w%16)throw new Error(`MediaPipeSelfie: input ${e.w}\xD7${e.h} must be a multiple of 16 (use MEDIAPIPE_SELFIE_CONFIG)`);let i=t.meta?.input;i&&(i.w!==e.w||i.h!==e.h)&&console.warn(`[longpipe] MediaPipeSelfie: input ${e.w}\xD7${e.h} differs from the ${i.w}\xD7${i.h} these weights were trained at`),this.inputs=[e];let a=(b,v,w)=>this.scale(b,this.conv(this.conv(this.pool(b),v,"relu"),w,"sigmoid")),o=(b,v,w,U,k={})=>{let B=k.act??"relu",G=this.depthwise(this.conv(b,v,B),w,B,k.stride??1);return k.se&&(G=a(G,...k.se)),k.residual?this.projResidual(G,b,U):this.conv(G,U)},s=(b,v,w,[U,k],B,G)=>{let I=this.upsampleConv(b,w),H=this.conv(this.conv(this.pool(this.add(v,I)),U,"relu"),k,"sigmoid"),R=this.conv(this.add(this.scale(v,H),I),B,"relu");return this.add(R,this.depthwise(R,G,"relu"))},u=this.conv(e,"conv2d","hswish",2),p=this.depthwise(this.conv(u,"conv2d_1","relu"),"depthwise_conv2d","relu",2);p=a(p,"conv2d_2","conv2d_3");let l=this.conv(p,"conv2d_4");p=o(l,"conv2d_5","depthwise_conv2d_1","conv2d_6",{stride:2});let d=o(p,"conv2d_7","depthwise_conv2d_2","conv2d_8",{residual:true});p=o(d,"conv2d_9","depthwise_conv2d_3","conv2d_12",{stride:2,se:["conv2d_10","conv2d_11"],act:"hswish"});for(let b=0;b<4;b++){let v=13+4*b;p=o(p,`conv2d_${v}`,`depthwise_conv2d_${4+b}`,`conv2d_${v+3}`,{se:[`conv2d_${v+1}`,`conv2d_${v+2}`],act:"hswish",residual:true});}p=this.scale(this.conv(p,"conv2d_29","relu"),this.conv(this.pool(p),"conv2d_30","sigmoid")),p=s(p,d,"conv2d_31",["conv2d_32","conv2d_33"],"conv2d_34","depthwise_conv2d_8"),p=s(p,l,"conv2d_35",["conv2d_36","conv2d_37"],"conv2d_38","depthwise_conv2d_9"),p=s(p,u,"conv2d_39",["conv2d_40","conv2d_41"],"conv2d_42","depthwise_conv2d_10");let _=this.layer("segment"),T=r.ops.ConvTranspose2d(p,_,{outChannels:4,kernel:2,stride:2,padding:0,activation:"sigmoid"});this.check("segment",_.weights.length,4*(p.c/4)*16),this.steps.push(T),this.output=T.output;}backend;w;inputs;output;steps=[];run(){Ne(this.backend,()=>{for(let r of this.steps)r.run();});}get opCount(){return this.steps.length}layer(r){let e=this.w.layers[r];if(!e)throw new Error(`MediaPipeSelfie: weights missing layer '${r}'`);return e}check(r,e,t){if(e!==t)throw new Error(`MediaPipeSelfie: layer '${r}' has ${e} weights, expected ${t} \u2014 wrong weight file?`)}push(r){return this.steps.push(r),r.output}conv(r,e,t="none",i=1){let a=this.layer(e),o=a.bias.length,s=a.weights.length/(o/4*(r.c/4)*16),u=Math.round(Math.sqrt(s));return this.check(e,a.weights.length,u*u*(o/4)*(r.c/4)*16),this.push(this.backend.ops.Conv2d(r,a,{outChannels:o,kernel:u,stride:i,padding:"same",activation:t}))}depthwise(r,e,t,i=1){let a=this.layer(e),o=Math.round(Math.sqrt(a.weights.length/r.c));return this.check(e,a.weights.length,o*o*r.c),this.check(e,a.bias.length,r.c),this.push(this.backend.ops.DepthwiseConv2d(r,a,{kernel:o,stride:i,padding:"same",activation:t}))}projResidual(r,e,t){let i=this.layer(t),a=i.bias.length;if(this.check(t,i.weights.length,a/4*(r.c/4)*16),a!==e.c)throw new Error(`MediaPipeSelfie: '${t}' residual has ${e.c} channels, expected ${a}`);return this.push(this.backend.ops.ProjResidual(r,e,i,{outChannels:a}))}upsampleConv(r,e){let t=this.layer(e),i=t.bias.length;return this.check(e,t.weights.length,i/4*(r.c/4)*16),this.push(this.backend.ops.UpsampleConv1x1(r,t,{outH:r.h*2,outW:r.w*2,outChannels:i,activation:"none"}))}pool(r){return this.push(this.backend.ops.GlobalAvgPool(r))}scale(r,e){return this.push(this.backend.ops.ChannelScale(r,e))}add(r,e){return this.push(this.backend.ops.Add(r,e))}};var N=new Float32Array(1),K=new Uint32Array(N.buffer);function xt(n){N[0]=n;let r=K[0],e=r>>>16&32768,t=r&2147483647,i=(t>>>23)-127+15;if((r&2139095040)===2139095040)return (r&8388607)!==0?e|32256:e|31744;if(i>=31)return e|31744;if(i<=0){if(i<-10)return e;let p=t&8388607|8388608,l=14-i,d=p>>>l,_=p>>>l-1&1,T=(p&(1<<l-1)-1)!==0?1:0;return _&&(T||d&1)&&(d+=1),e|d}let a=t>>>13&1023,o=t>>>12&1,s=(t&4095)!==0?1:0,u=i<<10|a;return o&&(s||a&1)&&(u+=1,(u>>>10&31)===31)?e|31744:e|u}function Ee(n){let r=(n&32768)<<16,e=(n&31744)>>>10,t=n&1023;if(e===0){if(t===0)return K[0]=r,N[0];let i=t,a=1;for(;(i&1024)===0;)i<<=1,a-=1;return i&=1023,K[0]=r|a+127-15<<23|i<<13,N[0]}return e===31?(K[0]=r|2139095040|t<<13,N[0]):(K[0]=r|e+127-15<<23|t<<13,N[0])}function je(n){let r=new Uint16Array(n.length);for(let e=0;e<n.length;e++)r[e]=xt(n[e]);return r}function Le(n){let r=new Float32Array(n.length);for(let e=0;e<n.length;e++)r[e]=Ee(n[e]);return r}var c=class{constructor(r){this.backend=r;}backend;shader="";pipeline;bindGroup;uniformDefs=[];uniformBuffers={};createUniform(r,e){this.uniformDefs.push({name:r,type:e});}setUniform(r,e){let t=this.backend.device.createBuffer({size:e.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,mappedAtCreation:true});e instanceof Uint32Array?new Uint32Array(t.getMappedRange()).set(e):new Float32Array(t.getMappedRange()).set(e),t.unmap(),this.uniformBuffers[r]=t;}defaultBindGroup(){let r=[],e=0;for(let t of this.inputs)r.push({binding:e++,resource:{buffer:t.buffer}});for(let t of this.weights)r.push({binding:e++,resource:{buffer:t.buffer}});for(let t of this.uniformDefs)r.push({binding:e++,resource:{buffer:this.uniformBuffers[t.name]}});return r.push({binding:e,resource:{buffer:this.output.buffer}}),this.backend.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:r})}defaultSetup(){let r=this.backend.device.createShaderModule({code:this.shader});this.pipeline=this.backend.device.createComputePipeline({layout:"auto",compute:{module:r,entryPoint:"main"}}),this.bindGroup=this.defaultBindGroup();}run(){let r=this.backend.computePass();if(r){this.encode(r);return}let e=this.backend.device.createCommandEncoder(),t=e.beginComputePass();this.encode(t),t.end(),this.backend.device.queue.submit([e.finish()]);}encode(r){r.setPipeline(this.pipeline),r.setBindGroup(0,this.bindGroup),r.dispatchWorkgroups(...this.dispatch);}};var Xe=`// Conv2d, output-channel-blocked (K=2) \u2014 drop-in replacement for conv2d.wgsl.
//
// Identical math, layout, and output to conv2d.wgsl, but each thread computes 2
// output channel-groups (8 channels) for one pixel, loading each input vec4 ONCE
// and reusing it across both groups' mat4x4 weight blocks in registers. Half the
// register pressure of the K=4 variant (2 accumulators vs 4). Output is bit-
// identical to conv2d.wgsl (\u22641 ULP from FMA contraction). Dispatch
// ceil(out_groups / 2) in z (see conv2d.ts).
//
// Tensor layout: NHWC, channels in vec4 groups (same as conv2d.wgsl).
// Weight layout: [K*K][out_groups][in_groups] array of mat4x4 (same as conv2d.wgsl).

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,   // in_channels / 4
    out_groups  : u32,   // out_channels / 4
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,   // 0 = none, 1 = relu6, 2 = relu, 3 = leaky, 4 = hswish, 5 = sigmoid
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

const KB = 2u;

fn act(v: vec4<f32>, a: u32) -> vec4<f32> {
    if (a == 1u) { return clamp(v, vec4<f32>(0.0), vec4<f32>(6.0)); }
    if (a == 2u) { return max(v, vec4<f32>(0.0)); }
    if (a == 3u) { return max(v, 0.1 * v); }   // leaky relu (slope 0.1)
    if (a == 4u) { return v * clamp(v + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }   // hard-swish
    if (a == 5u) { return 1.0 / (1.0 + exp(-v)); }                                       // sigmoid
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x  = gid.x;       // output column
    let y  = gid.y;       // output row
    let o0 = gid.z * KB;  // first output channel group

    if (x >= params.out_w || y >= params.out_h || o0 >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    // Tail handling when out_groups is odd: clamp the spare lane to o0 (valid
    // index, no OOB) and just don't write it.
    let has1 = (o0 + 1u) < O;
    let o1 = select(o0, o0 + 1u, has1);

    var acc0 = bias_buf[o0];
    var acc1 = bias_buf[o1];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let z   = ky * params.kernel_w + kx;
            let inB = u32(in_y_s) * params.in_w * I + u32(in_x_s) * I;
            let wb0 = z * O * I + o0 * I;
            let wb1 = z * O * I + o1 * I;
            for (var i = 0u; i < I; i++) {
                let iv = input_buf[inB + i];   // loaded ONCE, reused across 2 groups
                acc0 += weight_buf[wb0 + i] * iv;
                acc1 += weight_buf[wb1 + i] * iv;
            }
        }
    }

    let baseO = y * params.out_w * O + x * O;
    output_buf[baseO + o0] = act(acc0, params.activation);
    if (has1) { output_buf[baseO + o1] = act(acc1, params.activation); }
}
`;var $e=`enable f16;

// Conv2d, output-channel-blocked (K=2) \u2014 full f16. Drop-in replacement for
// conv2d_f16.wgsl. Each thread computes 2 output channel-groups for one pixel,
// loading each input vec4 ONCE and reusing it across both weight blocks. Half the
// register pressure of the K=4 variant (2 accumulators vs 4). Output is bit-
// identical to conv2d_f16.wgsl. Dispatch ceil(out_groups / 2) in z.

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

const KB = 2u;

fn act(v: vec4<f16>, a: u32) -> vec4<f16> {
    if (a == 1u) { return clamp(v, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    if (a == 2u) { return max(v, vec4<f16>(0.0h)); }
    if (a == 3u) { return max(v, 0.1h * v); }   // leaky relu (slope 0.1)
    if (a == 4u) { return v * clamp(v + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }   // hard-swish
    if (a == 5u) { return vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(v)))); }                     // sigmoid (f32 exp)
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x  = gid.x;
    let y  = gid.y;
    let o0 = gid.z * KB;

    if (x >= params.out_w || y >= params.out_h || o0 >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let has1 = (o0 + 1u) < O;
    let o1 = select(o0, o0 + 1u, has1);

    var acc0 = bias_buf[o0];
    var acc1 = bias_buf[o1];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let z   = ky * params.kernel_w + kx;
            let inB = u32(in_y_s) * params.in_w * I + u32(in_x_s) * I;
            let wb0 = z * O * I + o0 * I;
            let wb1 = z * O * I + o1 * I;
            for (var i = 0u; i < I; i++) {
                let iv = input_buf[inB + i];   // loaded ONCE, reused across 2 groups
                acc0 += weight_buf[wb0 + i] * iv;
                acc1 += weight_buf[wb1 + i] * iv;
            }
        }
    }

    let baseO = y * params.out_w * O + x * O;
    output_buf[baseO + o0] = act(acc0, params.activation);
    if (has1) { output_buf[baseO + o1] = act(acc1, params.activation); }
}
`;function W(n,r,e,t){return typeof t=="number"?Math.floor((n+2*t-r)/e)+1:t==="same"?Math.ceil(n/e):Math.floor((n-r)/e)+1}function He(n,r,e,t){return (n-1)*e-2*t+r}function Pt(n,r,e,t){return Math.floor(Math.max((r-1)*t+e-n,0)/2)}function A(n,r,e,t,i){return typeof n=="number"?n:n==="same"?Pt(r,e,t,i):0}function q(n){switch(n){case "relu6":return 1;case "relu":return 2;case "leaky":return 3;case "hswish":return 4;case "sigmoid":return 5;default:return 0}}function f(n){return n instanceof Float32Array||n instanceof Uint16Array?n:new Float32Array(n)}function x(n){let r=Math.max(4,Math.ceil(n.length/4)*4),e=new Float32Array(r),t=n instanceof Uint16Array;for(let i=0;i<n.length;i++)e[i]=t?Ee(n[i]):n[i];return e}var J=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?$e:Xe;let a=W(e.h,i.kernel,i.stride,i.padding),o=W(e.w,i.kernel,i.stride,i.padding),s=e.c/4,u=i.outChannels/4,p=A(i.padding,e.h,a,i.kernel,i.stride),l=A(i.padding,e.w,o,i.kernel,i.stride);this.output=r.tensor(a,o,i.outChannels),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(f(t.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,a,o,s,u,i.kernel,i.kernel,i.stride,p,l,q(i.activation)])),this.defaultSetup(),this.dispatch=[Math.ceil(o/8),Math.ceil(a/8),Math.ceil(u/2)];}};var Ke=`// ConvTranspose2d \u2014 gather form, f32 variant. See conv_transpose2d_f16.wgsl for
// the math; this is the f32 storage build (mat4x4<f32>).

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    kernel_h   : u32,
    kernel_w   : u32,
    stride     : u32,
    pad_top    : u32,
    pad_left   : u32,
    activation : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

fn act(v: vec4<f32>, a: u32) -> vec4<f32> {
    if (a == 1u) { return clamp(v, vec4<f32>(0.0), vec4<f32>(6.0)); }
    if (a == 2u) { return max(v, vec4<f32>(0.0)); }
    if (a == 3u) { return max(v, 0.1 * v); }
    if (a == 4u) { return v * clamp(v + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }   // hard-swish
    if (a == 5u) { return 1.0 / (1.0 + exp(-v)); }                                       // sigmoid
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let o  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let s = i32(params.stride);

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let iy_num = i32(oy) + i32(params.pad_top)  - i32(ky);
            let ix_num = i32(ox) + i32(params.pad_left) - i32(kx);
            if (iy_num < 0 || ix_num < 0 || (iy_num % s) != 0 || (ix_num % s) != 0) {
                continue;
            }
            let iy = iy_num / s;
            let ix = ix_num / s;
            if (iy >= i32(params.in_h) || ix >= i32(params.in_w)) {
                continue;
            }

            let z = ky * params.kernel_w + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = u32(iy) * params.in_w * I + u32(ix) * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    output_buf[oy * params.out_w * O + ox * O + o] = act(result, params.activation);
}
`;var Ye=`enable f16;

// ConvTranspose2d \u2014 gather form, full f16 variant.
// Each output (oy,ox) sums every input pixel + kernel tap that maps onto it:
//   iy = (oy + pad - ky) / stride   (must divide evenly and be in bounds)
// No explicit kernel flip \u2014 the (oy + pad - ky) indexing carries it.
// Weight layout is IDENTICAL to conv2d (mat4x4[z][o][i], M[in_sub][out_sub] =
// W(in, out, ky, kx)), so the op uploads the flat buffer unchanged.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    kernel_h   : u32,
    kernel_w   : u32,
    stride     : u32,
    pad_top    : u32,
    pad_left   : u32,
    activation : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

fn act(v: vec4<f16>, a: u32) -> vec4<f16> {
    if (a == 1u) { return clamp(v, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    if (a == 2u) { return max(v, vec4<f16>(0.0h)); }
    if (a == 3u) { return max(v, 0.1h * v); }
    if (a == 4u) { return v * clamp(v + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }   // hard-swish
    if (a == 5u) { return vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(v)))); }                  // sigmoid (f32 exp)
    return v;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let o  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let s = i32(params.stride);

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let iy_num = i32(oy) + i32(params.pad_top)  - i32(ky);
            let ix_num = i32(ox) + i32(params.pad_left) - i32(kx);
            if (iy_num < 0 || ix_num < 0 || (iy_num % s) != 0 || (ix_num % s) != 0) {
                continue;
            }
            let iy = iy_num / s;
            let ix = ix_num / s;
            if (iy >= i32(params.in_h) || ix >= i32(params.in_w)) {
                continue;
            }

            let z = ky * params.kernel_w + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = u32(iy) * params.in_w * I + u32(ix) * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    output_buf[oy * params.out_w * O + ox * O + o] = act(result, params.activation);
}
`;var Z=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?Ye:Ke;let a=He(e.h,i.kernel,i.stride,i.padding),o=He(e.w,i.kernel,i.stride,i.padding),s=e.c/4,u=i.outChannels/4;this.output=r.tensor(a,o,i.outChannels),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(f(t.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,a,o,s,u,i.kernel,i.kernel,i.stride,i.padding,i.padding,q(i.activation)])),this.defaultSetup(),this.dispatch=[Math.ceil(o/8),Math.ceil(a/8),u];}};var Qe=`// Depthwise Conv2d \u2014 groups = in_channels (each channel convolved independently).
//
// Weight layout: [K*K][channel_groups] array of vec4
//   weight index = (ky*kernel_w + kx) * channel_groups + c
//   Each vec4 holds the kernel weight for 4 consecutive channels at one spatial position.
//   Operation: element-wise multiply (each input channel multiplied by its own weight).
//
// Contrast with conv2d.wgsl which uses mat4x4 (dense cross-channel mixing).
// 4\xD7 smaller weight buffer than a diagonal mat4x4 representation (4 floats vs 16 per group).
//
// Padding model: only \`pad_top\` and \`pad_left\` are applied to the input offset.
// Asymmetric SAME padding is handled implicitly via the in_h/in_w bounds check.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,   // channels / 4
    kernel_h       : u32,
    kernel_w       : u32,
    stride         : u32,
    pad_top        : u32,
    pad_left       : u32,
    activation     : u32,   // 0 none, 1 relu6, 2 relu, 3 leaky, 4 hswish, 5 sigmoid
    _pad0          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;  // output column
    let y = gid.y;  // output row
    let c = gid.z;  // channel group

    if (x >= params.out_w || y >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let C = params.channel_groups;

    var result = bias_buf[c];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            let in_idx = in_y * params.in_w * C + in_x * C + c;
            let w_idx  = z * C + c;
            result += weight_buf[w_idx] * input_buf[in_idx];
        }
    }

    let a = params.activation;
    if (a == 1u)      { result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0)); }
    else if (a == 2u) { result = max(result, vec4<f32>(0.0)); }
    else if (a == 3u) { result = max(result, 0.1 * result); }
    else if (a == 4u) { result = result * clamp(result + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0; }
    else if (a == 5u) { result = 1.0 / (1.0 + exp(-result)); }

    let out_idx = y * params.out_w * C + x * C + c;
    output_buf[out_idx] = result;
}
`;var Je=`enable f16;

// Depthwise conv2d \u2014 full f16 variant. All buffers f16.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    kernel_h       : u32,
    kernel_w       : u32,
    stride         : u32,
    pad_top        : u32,
    pad_left       : u32,
    activation     : u32,   // 0 none, 1 relu6, 2 relu, 3 leaky, 4 hswish, 5 sigmoid
    _pad0          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;

    if (x >= params.out_w || y >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let C = params.channel_groups;

    var result = bias_buf[c];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            let in_idx = in_y * params.in_w * C + in_x * C + c;
            let w_idx  = z * C + c;
            result += weight_buf[w_idx] * input_buf[in_idx];
        }
    }

    let a = params.activation;
    if (a == 1u)      { result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h)); }
    else if (a == 2u) { result = max(result, vec4<f16>(0.0h)); }
    else if (a == 3u) { result = max(result, 0.1h * result); }
    else if (a == 4u) { result = result * clamp(result + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h; }
    else if (a == 5u) { result = vec4<f16>(1.0 / (1.0 + exp(-vec4<f32>(result)))); }

    output_buf[y * params.out_w * C + x * C + c] = result;
}
`;var ee=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?Je:Qe;let a=W(e.h,i.kernel,i.stride,i.padding),o=W(e.w,i.kernel,i.stride,i.padding),s=e.c/4,u=A(i.padding,e.h,a,i.kernel,i.stride),p=A(i.padding,e.w,o,i.kernel,i.stride);this.output=r.tensor(a,o,e.c),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(f(t.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,a,o,s,i.kernel,i.kernel,i.stride,u,p,q(i.activation),0])),this.defaultSetup(),this.dispatch=[Math.ceil(o/8),Math.ceil(a/8),s];}};var Ze=`// Element-wise add of two tensors \u2014 used for residual connections in MBConv blocks.
// Operates on the flat float buffer directly; layout is irrelevant for a pure element-wise op.

struct Params {
    size  : u32,   // total number of f32 elements
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f32>;
@group(0) @binding(1) var<storage, read>       input_b : array<f32>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] + input_b[idx];
}
`;var er=`enable f16;

// Element-wise add \u2014 full f16 variant.
// array<f16> is binary-compatible with array<vec4<f16>> written by the f16 conv shaders.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f16>;
@group(0) @binding(1) var<storage, read>       input_b : array<f16>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f16>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] + input_b[idx];
}
`;var re=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?er:Ze;let i=e.h*e.w*e.c;this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([i,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(i/256),1,1];}};var rr=`// Element-wise sigmoid: output = 1 / (1 + exp(-x)).
// Operates on packed vec4 buffers (NHWC layout). exp() and arithmetic are element-wise on vec4.

struct Params {
    n_groups : u32,   // total vec4 elements (H * W * channel_groups)
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    output_buf[idx] = 1.0 / (1.0 + exp(-input_buf[idx]));
}
`;var tr=`enable f16;

// Sigmoid \u2014 full f16 variant.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    let x = vec4<f32>(input_buf[idx]);
    output_buf[idx] = vec4<f16>(1.0 / (1.0 + exp(-x)));
}
`;var te=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e){super(r),this.shader=r.dtype==="f16"?tr:rr;let t=e.h*e.w*(e.c/4);this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t/256),1,1];}};var ar=`// Element-wise tanh \u2014 used by ConvGRU candidate activation.
// Operates on packed vec4 buffers (NHWC layout). tanh() is element-wise on vec4.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    output_buf[idx] = tanh(input_buf[idx]);
}
`;var ir=`enable f16;

// Tanh \u2014 full f16 variant.

struct Params {
    n_groups : u32,
    _pad0    : u32,
    _pad1    : u32,
    _pad2    : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.n_groups) { return; }
    let x = vec4<f32>(input_buf[idx]);
    output_buf[idx] = vec4<f16>(tanh(x));
}
`;var ae=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e){super(r),this.shader=r.dtype==="f16"?ir:ar;let t=e.h*e.w*(e.c/4);this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([t,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t/256),1,1];}};var or=`// Element-wise multiply \u2014 used in ConvGRU for r \u2299 h_prev.
// Same flat-float layout as add.wgsl.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f32>;
@group(0) @binding(1) var<storage, read>       input_b : array<f32>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] * input_b[idx];
}
`;var sr=`enable f16;

// Element-wise multiply \u2014 full f16 variant.
// array<f16> is binary-compatible with array<vec4<f16>> written by the f16 conv shaders.

struct Params {
    size  : u32,
    _pad0 : u32,
    _pad1 : u32,
    _pad2 : u32,
}

@group(0) @binding(0) var<storage, read>       input_a : array<f16>;
@group(0) @binding(1) var<storage, read>       input_b : array<f16>;
@group(0) @binding(2) var<uniform>             params  : Params;
@group(0) @binding(3) var<storage, read_write> output  : array<f16>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.size) { return; }
    output[idx] = input_a[idx] * input_b[idx];
}
`;var ie=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?sr:or;let i=e.h*e.w*e.c;this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([i,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(i/256),1,1];}};var nr=`// Bilinear gather-warp (f32). See warp_f16.wgsl for the math.

struct Params {
    h          : u32,
    w          : u32,
    flow_scale : f32,
    groups     : u32,   // source/output channel groups (c/4); flow is always 1 group
}

@group(0) @binding(0) var<storage, read>       source_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       flow_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

fn samp(x: i32, y: i32, W: i32, H: i32, g: u32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return source_buf[(u32(cy) * u32(W) + u32(cx)) * params.groups + g];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.w || y >= params.h || g >= params.groups) { return; }

    let W = i32(params.w);
    let H = i32(params.h);

    let f  = flow_buf[y * params.w + x].xy;
    let sx = clamp(f32(x) + params.flow_scale * f.x, 0.0, f32(W - 1));
    let sy = clamp(f32(y) + params.flow_scale * f.y, 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H, g), samp(x0 + 1, y0, W, H, g), tx);
    let bot = mix(samp(x0, y0 + 1, W, H, g), samp(x0 + 1, y0 + 1, W, H, g), tx);
    output_buf[(y * params.w + x) * params.groups + g] = mix(top, bot, ty);
}
`;var ur=`enable f16;

// Bilinear gather-warp (f16 storage, f32 coordinate math). For each output pixel
// p, sample the source at p + flow_scale\xB7flow[p].xy and bilinearly interpolate,
// clamping the sample to the edge (border-replicate). Source + flow are 4-ch
// (1 group), same resolution; flow vector is in .xy.

struct Params {
    h          : u32,
    w          : u32,
    flow_scale : f32,
    groups     : u32,   // source/output channel groups (c/4); flow is always 1 group
}

@group(0) @binding(0) var<storage, read>       source_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       flow_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

fn samp(x: i32, y: i32, W: i32, H: i32, g: u32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return vec4<f32>(source_buf[(u32(cy) * u32(W) + u32(cx)) * params.groups + g]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.w || y >= params.h || g >= params.groups) { return; }

    let W = i32(params.w);
    let H = i32(params.h);
    

    let f  = vec2<f32>(flow_buf[y * params.w + x].xy);
    let sx = clamp(f32(x) + params.flow_scale * f.x, 0.0, f32(W - 1));
    let sy = clamp(f32(y) + params.flow_scale * f.y, 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H, g), samp(x0 + 1, y0, W, H, g), tx);
    let bot = mix(samp(x0, y0 + 1, W, H, g), samp(x0 + 1, y0 + 1, W, H, g), tx);
    output_buf[(y * params.w + x) * params.groups + g] = vec4<f16>(mix(top, bot, ty));
}
`;var oe=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?ur:nr,this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e,t],this.createUniform("params","Params");let a=new Uint32Array(4);a[0]=e.h,a[1]=e.w,new Float32Array(a.buffer)[2]=i.flowScale,a[3]=e.c/4,this.setUniform("params",a),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),e.c/4];}};var pr=`// Face-box decode from 5-keypoint heatmaps (f32). One workgroup: threads 0-4
// each soft-argmax one channel (peak + windowed centroid \u2014 hard argmax snaps
// to whole cells and jitters the crop); thread 0 combines the keypoint hull
// into a pixel-square box.
//
// Output (1 vec4): (cx, cy, halfSide, score) in FRAME FRACTIONS \u2014 halfSide as
// a fraction of frame WIDTH. The heatmap grid shares the frame's aspect, so
// squaring in grid-cell px squares in frame px. score = min keypoint peak,
// forced to 0 if any peak < thresh.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f32>>;

var<workgroup> kp_x : array<f32, 5>;   // continuous cell coords
var<workgroup> kp_y : array<f32, 5>;
var<workgroup> kp_s : array<f32, 5>;   // peak scores

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \u2192 2 vec4 groups
    return v[k % 4u];
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // Peak.
    var peak = -1.0;
    var pr = 0u;
    var pc = 0u;
    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v > peak) { peak = v; pr = y; pc = x; }
        }
    }

    // Windowed soft-argmax centroid around the peak.
    let r0 = u32(max(0, i32(pr) - params.win));
    let r1 = u32(min(i32(params.h), i32(pr) + params.win + 1));
    let c0 = u32(max(0, i32(pc) - params.win));
    let c1 = u32(min(i32(params.w), i32(pc) + params.win + 1));
    var wsum = 0.0;
    var sy = 0.0;
    var sx = 0.0;
    for (var y = r0; y < r1; y++) {
        for (var x = c0; x < c1; x++) {
            let v = hm_at(x, y, k);
            wsum += v;
            sy += v * f32(y);
            sx += v * f32(x);
        }
    }
    wsum = max(wsum, 1e-6);
    kp_x[k] = sx / wsum;
    kp_y[k] = sy / wsum;
    kp_s[k] = peak;
    workgroupBarrier();

    if (k != 0u) { return; }

    // Hull over the 5 keypoints, in grid-cell px.
    var x0 = 1e9; var x1 = -1e9;
    var y0 = 1e9; var y1 = -1e9;
    var score = 1e9;
    for (var i = 0u; i < 5u; i++) {
        x0 = min(x0, kp_x[i]); x1 = max(x1, kp_x[i]);
        y0 = min(y0, kp_y[i]); y1 = max(y1, kp_y[i]);
        score = min(score, kp_s[i]);
    }
    if (score < params.thresh) { score = 0.0; }

    // Square box: side = boxScale \xD7 hull long side (grid px == frame-px aspect).
    let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
    let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \u2192 center
    let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
    out_buf[0] = vec4<f32>(cx, cy, half_px / f32(params.w), score);
}
`;var cr=`enable f16;

// Face-box decode from 5-keypoint heatmaps (f16 storage, f32 math). One workgroup: threads 0-4
// each soft-argmax one channel (peak + windowed centroid \u2014 hard argmax snaps
// to whole cells and jitters the crop); thread 0 combines the keypoint hull
// into a pixel-square box.
//
// Output (1 vec4): (cx, cy, halfSide, score) in FRAME FRACTIONS \u2014 halfSide as
// a fraction of frame WIDTH. The heatmap grid shares the frame's aspect, so
// squaring in grid-cell px squares in frame px. score = min keypoint peak,
// forced to 0 if any peak < thresh.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f16>>;

var<workgroup> kp_x : array<f32, 5>;   // continuous cell coords
var<workgroup> kp_y : array<f32, 5>;
var<workgroup> kp_s : array<f32, 5>;   // peak scores

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \u2192 2 vec4 groups
    return f32(v[k % 4u]);
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // Peak.
    var peak = -1.0;
    var pr = 0u;
    var pc = 0u;
    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v > peak) { peak = v; pr = y; pc = x; }
        }
    }

    // Windowed soft-argmax centroid around the peak.
    let r0 = u32(max(0, i32(pr) - params.win));
    let r1 = u32(min(i32(params.h), i32(pr) + params.win + 1));
    let c0 = u32(max(0, i32(pc) - params.win));
    let c1 = u32(min(i32(params.w), i32(pc) + params.win + 1));
    var wsum = 0.0;
    var sy = 0.0;
    var sx = 0.0;
    for (var y = r0; y < r1; y++) {
        for (var x = c0; x < c1; x++) {
            let v = hm_at(x, y, k);
            wsum += v;
            sy += v * f32(y);
            sx += v * f32(x);
        }
    }
    wsum = max(wsum, 1e-6);
    kp_x[k] = sx / wsum;
    kp_y[k] = sy / wsum;
    kp_s[k] = peak;
    workgroupBarrier();

    if (k != 0u) { return; }

    // Hull over the 5 keypoints, in grid-cell px.
    var x0 = 1e9; var x1 = -1e9;
    var y0 = 1e9; var y1 = -1e9;
    var score = 1e9;
    for (var i = 0u; i < 5u; i++) {
        x0 = min(x0, kp_x[i]); x1 = max(x1, kp_x[i]);
        y0 = min(y0, kp_y[i]); y1 = max(y1, kp_y[i]);
        score = min(score, kp_s[i]);
    }
    if (score < params.thresh) { score = 0.0; }

    // Square box: side = boxScale \xD7 hull long side (grid px == frame-px aspect).
    let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
    let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \u2192 center
    let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
    out_buf[0] = vec4<f16>(vec4<f32>(cx, cy, half_px / f32(params.w), score));
}
`;var se=class extends c{inputs;weights=[];output;dispatch=[1,1,1];shader;constructor(r,e,t){if(super(r),e.c!==8)throw new Error(`FaceBoxFromHeatmaps: expected 8-ch heatmaps (5 real), got ${e.c}`);this.shader=r.dtype==="f16"?cr:pr,this.output=r.tensor(1,1,4),this.inputs=[e],this.createUniform("params","Params");let i=new Uint32Array(5);i[0]=e.h,i[1]=e.w,new Int32Array(i.buffer)[2]=t.win;let a=new Float32Array(i.buffer);a[3]=t.thresh,a[4]=t.boxScale,this.setUniform("params",i),this.defaultSetup();}};var lr=`// MULTI-FACE box decode from 5-keypoint heatmaps (f32) \u2192 1\xD7K\xD74 box tensor.
// The multi-face sibling of face_box.wgsl (which is single-face: one global
// argmax per channel + hull, so two faces merge into one box).
//
// Stage 1 (threads 0-4, one channel each): 3\xD73 local-maximum candidates above
//   thresh, top-MAX_CAND by peak score, refined with the windowed soft-argmax
//   centroid (the required decode \u2014 hard argmax cell-snaps and jitters the
//   crop), deduped by refined position.
// Stage 2 (thread 0): every (L-eye, R-eye) candidate pair is a face hypothesis.
//   The pair fixes the face's center, scale (interocular distance) and roll, so
//   nose + mouth corners are PREDICTED from the ArcFace canonical template and
//   matched against candidates within tol \xD7 interocular. Cross-pairing (face A's
//   left eye with face B's right eye) survives stage 1 but dies here: the
//   implied scale is wrong and there's no nose/mouth support where the template
//   says there should be.
// Stage 3/4 (thread 0): score = mean matched peak \u2212 LAMBDA \xB7 mean normalized
//   residual; greedy NMS rejects any hypothesis reusing a consumed candidate.
//
// Output slot i: (cx, cy, halfSide, score) in FRAME FRACTIONS, halfSide as a
// fraction of frame WIDTH (the grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Slots past the face count are zeroed \u2014 score 0
// means "no face", which every consumer already gates on.
//
// CPU reference (kept in sync deliberately): sdk/demo/face.ts findCandidates /
// groupFaces.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
    max_faces : u32,
    tol       : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f32>>;

const N_KP     : u32 = 5u;
const MAX_CAND : u32 = 5u;    // candidates per channel
const LAMBDA   : f32 = 0.5;   // geometric-residual weight
const MIN_SEP  : f32 = 1.0;   // cells \u2014 closer refined centroids are one blob
const MIN_EYE  : f32 = 1.0;   // cells \u2014 below this the grid can't resolve a pair

// Candidate table, N_KP \xD7 MAX_CAND, filled by stage 1 (thread k owns row k).
var<workgroup> c_x : array<f32, 25>;   // refined cell coords
var<workgroup> c_y : array<f32, 25>;
var<workgroup> c_s : array<f32, 25>;   // peak scores
var<workgroup> c_n : array<u32, 5>;    // candidates found per channel

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \u2192 2 vec4 groups
    return v[k % 4u];
}

// ArcFace canonical 5-point template in the EYE FRAME: origin = L-eye, +u along
// the L-eye\u2192R-eye vector, +w perpendicular (image-down for an upright face),
// both normalized by interocular distance. t: 0 = nose, 1 = L-mouth, 2 = R-mouth.
fn tmpl_u(t: u32) -> f32 {
    if (t == 0u) { return 0.50002; }
    if (t == 1u) { return 0.08598; }
    return 0.91410;
}
fn tmpl_w(t: u32) -> f32 {
    if (t == 0u) { return 0.57150; }
    return 1.15462;   // both mouth corners sit at the same depth
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // \u2500\u2500 stage 1: local-maximum candidates for channel k \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var pr : array<u32, 5>;
    var pc : array<u32, 5>;
    var ps : array<f32, 5>;
    var n  = 0u;

    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v < params.thresh) { continue; }

            // 3\xD73 strict local max. The index tiebreak keeps exactly one member
            // of a plateau (f16 heatmaps produce exact ties).
            var is_max = true;
            for (var dy: i32 = -1; dy <= 1; dy++) {
                for (var dx: i32 = -1; dx <= 1; dx++) {
                    if (dx == 0 && dy == 0) { continue; }
                    let rr = i32(y) + dy;
                    let cc = i32(x) + dx;
                    if (rr < 0 || rr >= i32(params.h) || cc < 0 || cc >= i32(params.w)) { continue; }
                    let u = hm_at(u32(cc), u32(rr), k);
                    if (u > v || (u == v && u32(rr) * params.w + u32(cc) < y * params.w + x)) {
                        is_max = false;
                    }
                }
            }
            if (!is_max) { continue; }

            // Insert into the score-ordered top-MAX_CAND list.
            var slot = n;
            if (n == MAX_CAND) {
                if (v <= ps[MAX_CAND - 1u]) { continue; }
                slot = MAX_CAND - 1u;
            } else {
                n = n + 1u;
            }
            while (slot > 0u && ps[slot - 1u] < v) {
                ps[slot] = ps[slot - 1u];
                pr[slot] = pr[slot - 1u];
                pc[slot] = pc[slot - 1u];
                slot = slot - 1u;
            }
            ps[slot] = v; pr[slot] = y; pc[slot] = x;
        }
    }

    // Refine each peak with the windowed soft-argmax centroid, dropping any that
    // lands on top of a higher-scoring one (two maxima on a single blob).
    var m = 0u;
    for (var i = 0u; i < n; i++) {
        var rx = f32(pc[i]);
        var ry = f32(pr[i]);
        if (params.win > 0) {
            let r0 = u32(max(0, i32(pr[i]) - params.win));
            let r1 = u32(min(i32(params.h), i32(pr[i]) + params.win + 1));
            let c0 = u32(max(0, i32(pc[i]) - params.win));
            let c1 = u32(min(i32(params.w), i32(pc[i]) + params.win + 1));
            var wsum = 0.0; var sy = 0.0; var sx = 0.0;
            for (var y = r0; y < r1; y++) {
                for (var x = c0; x < c1; x++) {
                    let v = hm_at(x, y, k);
                    wsum += v; sy += v * f32(y); sx += v * f32(x);
                }
            }
            wsum = max(wsum, 1e-6);
            rx = sx / wsum; ry = sy / wsum;
        }
        var dup = false;
        for (var j = 0u; j < m; j++) {
            let dx = c_x[k * MAX_CAND + j] - rx;
            let dy = c_y[k * MAX_CAND + j] - ry;
            if (sqrt(dx * dx + dy * dy) < MIN_SEP) { dup = true; }
        }
        if (dup) { continue; }
        c_x[k * MAX_CAND + m] = rx;
        c_y[k * MAX_CAND + m] = ry;
        c_s[k * MAX_CAND + m] = ps[i];
        m = m + 1u;
    }
    c_n[k] = m;

    workgroupBarrier();
    if (k != 0u) { return; }

    // \u2500\u2500 stage 2: eye-pair hypotheses \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var h_score : array<f32, 25>;
    var h_kp    : array<i32, 125>;   // hypothesis q, channel t \u2192 candidate idx (-1 = unmatched)
    var nh = 0u;
    let max_eye = f32(params.w) * 0.45;   // a face wider than ~half the frame

    for (var i = 0u; i < c_n[0]; i++) {
        for (var j = 0u; j < c_n[1]; j++) {
            let ax = c_x[i];
            let ay = c_y[i];
            let bx = c_x[MAX_CAND + j];
            let by = c_y[MAX_CAND + j];
            let evx = bx - ax;
            let evy = by - ay;
            let len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > max_eye) { continue; }
            let ex = vec2<f32>(evx / len, evy / len);
            let ey = vec2<f32>(-ex.y, ex.x);

            var sc      = c_s[i] + c_s[MAX_CAND + j];
            var resid   = 0.0;
            var n_match = 2u;
            var mouths  = 0u;
            var nose    = -1;
            var mo      = array<i32, 2>(-1, -1);

            for (var t = 0u; t < 3u; t++) {
                let kk = t + 2u;
                let px = ax + len * (tmpl_u(t) * ex.x + tmpl_w(t) * ey.x);
                let py = ay + len * (tmpl_u(t) * ex.y + tmpl_w(t) * ey.y);
                var best   = -1;
                var best_d = params.tol * len;
                for (var q = 0u; q < c_n[kk]; q++) {
                    let dx = c_x[kk * MAX_CAND + q] - px;
                    let dy = c_y[kk * MAX_CAND + q] - py;
                    let d  = sqrt(dx * dx + dy * dy);
                    if (d < best_d) { best_d = d; best = i32(q); }
                }
                if (best < 0) { continue; }
                sc += c_s[kk * MAX_CAND + u32(best)];
                resid += best_d / len;
                n_match += 1u;
                if (t == 0u) { nose = best; } else { mo[t - 1u] = best; mouths += 1u; }
            }
            // Support floor: a hypothesis needs the nose and at least one mouth
            // corner, otherwise two stray eye peaks become a face.
            if (nose < 0 || mouths < 1u) { continue; }

            h_score[nh] = sc / f32(n_match) - LAMBDA * (resid / f32(n_match - 2u));
            h_kp[nh * N_KP + 0u] = i32(i);
            h_kp[nh * N_KP + 1u] = i32(j);
            h_kp[nh * N_KP + 2u] = nose;
            h_kp[nh * N_KP + 3u] = mo[0];
            h_kp[nh * N_KP + 4u] = mo[1];
            nh = nh + 1u;
        }
    }

    // \u2500\u2500 stage 3/4: greedy NMS by score \u2192 boxes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var used : array<bool, 25>;
    for (var i = 0u; i < N_KP * MAX_CAND; i++) { used[i] = false; }
    var out_n = 0u;

    for (var iter = 0u; iter < 25u; iter++) {
        if (out_n >= params.max_faces) { break; }

        // Best remaining hypothesis. Consumed ones are marked -1e9; real scores
        // are bounded well above -1e8 (mean peak \u2208 [0,1] minus LAMBDA\xB7tol).
        var best   = -1;
        var best_s = -1e8;
        for (var q = 0u; q < nh; q++) {
            if (h_score[q] > best_s) { best_s = h_score[q]; best = i32(q); }
        }
        if (best < 0) { break; }
        let q = u32(best);
        h_score[q] = -1e9;

        var clash = false;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            if (used[t * MAX_CAND + u32(ci)]) { clash = true; }
        }
        if (clash) { continue; }

        // Hull over this face's matched keypoints, in grid cells.
        var x0 = 1e9; var x1 = -1e9;
        var y0 = 1e9; var y1 = -1e9;
        var score = 1e9;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            let e = t * MAX_CAND + u32(ci);
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
        let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \u2192 center
        let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
        out_buf[out_n] = vec4<f32>(cx, cy, half_px / f32(params.w), score);
        out_n = out_n + 1u;
    }

    for (var i = out_n; i < params.max_faces; i++) {
        out_buf[i] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
}
`;var fr=`enable f16;

// MULTI-FACE box decode from 5-keypoint heatmaps (f16 storage, f32 math) \u2192 1\xD7K\xD74 box tensor.
// The multi-face sibling of face_box.wgsl (which is single-face: one global
// argmax per channel + hull, so two faces merge into one box).
//
// Stage 1 (threads 0-4, one channel each): 3\xD73 local-maximum candidates above
//   thresh, top-MAX_CAND by peak score, refined with the windowed soft-argmax
//   centroid (the required decode \u2014 hard argmax cell-snaps and jitters the
//   crop), deduped by refined position.
// Stage 2 (thread 0): every (L-eye, R-eye) candidate pair is a face hypothesis.
//   The pair fixes the face's center, scale (interocular distance) and roll, so
//   nose + mouth corners are PREDICTED from the ArcFace canonical template and
//   matched against candidates within tol \xD7 interocular. Cross-pairing (face A's
//   left eye with face B's right eye) survives stage 1 but dies here: the
//   implied scale is wrong and there's no nose/mouth support where the template
//   says there should be.
// Stage 3/4 (thread 0): score = mean matched peak \u2212 LAMBDA \xB7 mean normalized
//   residual; greedy NMS rejects any hypothesis reusing a consumed candidate.
//
// Output slot i: (cx, cy, halfSide, score) in FRAME FRACTIONS, halfSide as a
// fraction of frame WIDTH (the grid shares the frame's aspect, so squaring in
// grid px squares in frame px). Slots past the face count are zeroed \u2014 score 0
// means "no face", which every consumer already gates on.
//
// CPU reference (kept in sync deliberately): sdk/demo/face.ts findCandidates /
// groupFaces.

struct Params {
    h         : u32,
    w         : u32,
    win       : i32,
    thresh    : f32,
    box_scale : f32,
    max_faces : u32,
    tol       : f32,
}

@group(0) @binding(0) var<storage, read>       hm_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params  : Params;
@group(0) @binding(2) var<storage, read_write> out_buf : array<vec4<f16>>;

const N_KP     : u32 = 5u;
const MAX_CAND : u32 = 5u;    // candidates per channel
const LAMBDA   : f32 = 0.5;   // geometric-residual weight
const MIN_SEP  : f32 = 1.0;   // cells \u2014 closer refined centroids are one blob
const MIN_EYE  : f32 = 1.0;   // cells \u2014 below this the grid can't resolve a pair

// Candidate table, N_KP \xD7 MAX_CAND, filled by stage 1 (thread k owns row k).
var<workgroup> c_x : array<f32, 25>;   // refined cell coords
var<workgroup> c_y : array<f32, 25>;
var<workgroup> c_s : array<f32, 25>;   // peak scores
var<workgroup> c_n : array<u32, 5>;    // candidates found per channel

fn hm_at(x: u32, y: u32, k: u32) -> f32 {
    var v = hm_buf[(y * params.w + x) * 2u + (k / 4u)];   // 8ch \u2192 2 vec4 groups
    return f32(v[k % 4u]);
}

// ArcFace canonical 5-point template in the EYE FRAME: origin = L-eye, +u along
// the L-eye\u2192R-eye vector, +w perpendicular (image-down for an upright face),
// both normalized by interocular distance. t: 0 = nose, 1 = L-mouth, 2 = R-mouth.
fn tmpl_u(t: u32) -> f32 {
    if (t == 0u) { return 0.50002; }
    if (t == 1u) { return 0.08598; }
    return 0.91410;
}
fn tmpl_w(t: u32) -> f32 {
    if (t == 0u) { return 0.57150; }
    return 1.15462;   // both mouth corners sit at the same depth
}

@compute @workgroup_size(5, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lid.x;

    // \u2500\u2500 stage 1: local-maximum candidates for channel k \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var pr : array<u32, 5>;
    var pc : array<u32, 5>;
    var ps : array<f32, 5>;
    var n  = 0u;

    for (var y = 0u; y < params.h; y++) {
        for (var x = 0u; x < params.w; x++) {
            let v = hm_at(x, y, k);
            if (v < params.thresh) { continue; }

            // 3\xD73 strict local max. The index tiebreak keeps exactly one member
            // of a plateau (f16 heatmaps produce exact ties).
            var is_max = true;
            for (var dy: i32 = -1; dy <= 1; dy++) {
                for (var dx: i32 = -1; dx <= 1; dx++) {
                    if (dx == 0 && dy == 0) { continue; }
                    let rr = i32(y) + dy;
                    let cc = i32(x) + dx;
                    if (rr < 0 || rr >= i32(params.h) || cc < 0 || cc >= i32(params.w)) { continue; }
                    let u = hm_at(u32(cc), u32(rr), k);
                    if (u > v || (u == v && u32(rr) * params.w + u32(cc) < y * params.w + x)) {
                        is_max = false;
                    }
                }
            }
            if (!is_max) { continue; }

            // Insert into the score-ordered top-MAX_CAND list.
            var slot = n;
            if (n == MAX_CAND) {
                if (v <= ps[MAX_CAND - 1u]) { continue; }
                slot = MAX_CAND - 1u;
            } else {
                n = n + 1u;
            }
            while (slot > 0u && ps[slot - 1u] < v) {
                ps[slot] = ps[slot - 1u];
                pr[slot] = pr[slot - 1u];
                pc[slot] = pc[slot - 1u];
                slot = slot - 1u;
            }
            ps[slot] = v; pr[slot] = y; pc[slot] = x;
        }
    }

    // Refine each peak with the windowed soft-argmax centroid, dropping any that
    // lands on top of a higher-scoring one (two maxima on a single blob).
    var m = 0u;
    for (var i = 0u; i < n; i++) {
        var rx = f32(pc[i]);
        var ry = f32(pr[i]);
        if (params.win > 0) {
            let r0 = u32(max(0, i32(pr[i]) - params.win));
            let r1 = u32(min(i32(params.h), i32(pr[i]) + params.win + 1));
            let c0 = u32(max(0, i32(pc[i]) - params.win));
            let c1 = u32(min(i32(params.w), i32(pc[i]) + params.win + 1));
            var wsum = 0.0; var sy = 0.0; var sx = 0.0;
            for (var y = r0; y < r1; y++) {
                for (var x = c0; x < c1; x++) {
                    let v = hm_at(x, y, k);
                    wsum += v; sy += v * f32(y); sx += v * f32(x);
                }
            }
            wsum = max(wsum, 1e-6);
            rx = sx / wsum; ry = sy / wsum;
        }
        var dup = false;
        for (var j = 0u; j < m; j++) {
            let dx = c_x[k * MAX_CAND + j] - rx;
            let dy = c_y[k * MAX_CAND + j] - ry;
            if (sqrt(dx * dx + dy * dy) < MIN_SEP) { dup = true; }
        }
        if (dup) { continue; }
        c_x[k * MAX_CAND + m] = rx;
        c_y[k * MAX_CAND + m] = ry;
        c_s[k * MAX_CAND + m] = ps[i];
        m = m + 1u;
    }
    c_n[k] = m;

    workgroupBarrier();
    if (k != 0u) { return; }

    // \u2500\u2500 stage 2: eye-pair hypotheses \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var h_score : array<f32, 25>;
    var h_kp    : array<i32, 125>;   // hypothesis q, channel t \u2192 candidate idx (-1 = unmatched)
    var nh = 0u;
    let max_eye = f32(params.w) * 0.45;   // a face wider than ~half the frame

    for (var i = 0u; i < c_n[0]; i++) {
        for (var j = 0u; j < c_n[1]; j++) {
            let ax = c_x[i];
            let ay = c_y[i];
            let bx = c_x[MAX_CAND + j];
            let by = c_y[MAX_CAND + j];
            let evx = bx - ax;
            let evy = by - ay;
            let len = sqrt(evx * evx + evy * evy);
            if (len < MIN_EYE || len > max_eye) { continue; }
            let ex = vec2<f32>(evx / len, evy / len);
            let ey = vec2<f32>(-ex.y, ex.x);

            var sc      = c_s[i] + c_s[MAX_CAND + j];
            var resid   = 0.0;
            var n_match = 2u;
            var mouths  = 0u;
            var nose    = -1;
            var mo      = array<i32, 2>(-1, -1);

            for (var t = 0u; t < 3u; t++) {
                let kk = t + 2u;
                let px = ax + len * (tmpl_u(t) * ex.x + tmpl_w(t) * ey.x);
                let py = ay + len * (tmpl_u(t) * ex.y + tmpl_w(t) * ey.y);
                var best   = -1;
                var best_d = params.tol * len;
                for (var q = 0u; q < c_n[kk]; q++) {
                    let dx = c_x[kk * MAX_CAND + q] - px;
                    let dy = c_y[kk * MAX_CAND + q] - py;
                    let d  = sqrt(dx * dx + dy * dy);
                    if (d < best_d) { best_d = d; best = i32(q); }
                }
                if (best < 0) { continue; }
                sc += c_s[kk * MAX_CAND + u32(best)];
                resid += best_d / len;
                n_match += 1u;
                if (t == 0u) { nose = best; } else { mo[t - 1u] = best; mouths += 1u; }
            }
            // Support floor: a hypothesis needs the nose and at least one mouth
            // corner, otherwise two stray eye peaks become a face.
            if (nose < 0 || mouths < 1u) { continue; }

            h_score[nh] = sc / f32(n_match) - LAMBDA * (resid / f32(n_match - 2u));
            h_kp[nh * N_KP + 0u] = i32(i);
            h_kp[nh * N_KP + 1u] = i32(j);
            h_kp[nh * N_KP + 2u] = nose;
            h_kp[nh * N_KP + 3u] = mo[0];
            h_kp[nh * N_KP + 4u] = mo[1];
            nh = nh + 1u;
        }
    }

    // \u2500\u2500 stage 3/4: greedy NMS by score \u2192 boxes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    var used : array<bool, 25>;
    for (var i = 0u; i < N_KP * MAX_CAND; i++) { used[i] = false; }
    var out_n = 0u;

    for (var iter = 0u; iter < 25u; iter++) {
        if (out_n >= params.max_faces) { break; }

        // Best remaining hypothesis. Consumed ones are marked -1e9; real scores
        // are bounded well above -1e8 (mean peak \u2208 [0,1] minus LAMBDA\xB7tol).
        var best   = -1;
        var best_s = -1e8;
        for (var q = 0u; q < nh; q++) {
            if (h_score[q] > best_s) { best_s = h_score[q]; best = i32(q); }
        }
        if (best < 0) { break; }
        let q = u32(best);
        h_score[q] = -1e9;

        var clash = false;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            if (used[t * MAX_CAND + u32(ci)]) { clash = true; }
        }
        if (clash) { continue; }

        // Hull over this face's matched keypoints, in grid cells.
        var x0 = 1e9; var x1 = -1e9;
        var y0 = 1e9; var y1 = -1e9;
        var score = 1e9;
        for (var t = 0u; t < N_KP; t++) {
            let ci = h_kp[q * N_KP + t];
            if (ci < 0) { continue; }
            let e = t * MAX_CAND + u32(ci);
            used[e] = true;
            x0 = min(x0, c_x[e]); x1 = max(x1, c_x[e]);
            y0 = min(y0, c_y[e]); y1 = max(y1, c_y[e]);
            score = min(score, c_s[e]);
        }

        let half_px = 0.5 * params.box_scale * max(x1 - x0, y1 - y0);
        let cx = ((x0 + x1) * 0.5 + 0.5) / f32(params.w);   // +0.5: cell \u2192 center
        let cy = ((y0 + y1) * 0.5 + 0.5) / f32(params.h);
        out_buf[out_n] = vec4<f16>(vec4<f32>(cx, cy, half_px / f32(params.w), score));
        out_n = out_n + 1u;
    }

    for (var i = out_n; i < params.max_faces; i++) {
        out_buf[i] = vec4<f16>(0.0h, 0.0h, 0.0h, 0.0h);
    }
}
`;var ne=class extends c{inputs;weights=[];output;dispatch=[1,1,1];shader;constructor(r,e,t){if(super(r),e.c!==8)throw new Error(`FaceBoxesFromHeatmaps: expected 8-ch heatmaps (5 real), got ${e.c}`);if(t.maxFaces<1||t.maxFaces>6)throw new Error(`FaceBoxesFromHeatmaps: maxFaces must be 1..6, got ${t.maxFaces}`);this.shader=r.dtype==="f16"?fr:lr,this.output=r.tensor(1,t.maxFaces,4),this.inputs=[e],this.createUniform("params","Params");let i=new ArrayBuffer(32),a=new Uint32Array(i),o=new Int32Array(i),s=new Float32Array(i);a[0]=e.h,a[1]=e.w,o[2]=t.win,s[3]=t.thresh,s[4]=t.boxScale,a[5]=t.maxFaces,s[6]=t.tol,this.setUniform("params",a),this.defaultSetup();}};var dr=`// Auto-reframe state update (f32) \u2014 one thread, one frame of camera work.
// In:  boxes (1\xD7K\xD74, FaceBoxesFromHeatmaps), prev state, command.
// Out: new state, 1\xD71\xD78 = two vec4s:
//        [0] (cx, cy, size, moving)   \u2014 the view rect; all FRAME FRACTIONS
//        [1] (subjX, subjY, subjHs, valid) \u2014 the incumbent subject, for hysteresis
//
// The subject is remembered by POSITION, not by slot: FaceBoxesFromHeatmaps
// orders its slots by NMS score, so slot 1 can be a different person next frame.
//
// \`size\` is a fraction of BOTH width and height, which is what preserves the
// frame's aspect: equal fractions of a 640\xD7400 frame is still 8:5.
//
// The rule (tuned in demo/reframe.ts):
//   centre = frameCentre + gravity\xB7(subject \u2212 frameCentre)   \u2014 pull, never centre
//   crop   = frame / zoom
//   constraints: the crop stays INSIDE the frame AND contains the subject+margin
// Neither is a special case; "head in the corner does nothing" falls out of them:
// once the crop centre clamps to the frame edge, containment reduces to
// x >= half+margin regardless of zoom, so an edge subject simply never fits and
// the solve falls through to its full-frame fallback (= no reframe). The zoom
// relaxation earns its keep elsewhere \u2014 backing off for a subject too BIG for
// the requested crop.
//
// Smoothing is deadband + ease: hold, move deliberately, hold. A plain EMA reads
// as swimming as the subject breathes.
//
// State is threaded across frames by the renderer with copyTensor \u2014 same carrier
// pattern as the flow stabilizer's stabPrev. No readback anywhere.

struct Params {
    k        : u32,
    zoom     : f32,
    gravity  : f32,
    margin   : f32,
    deadband : f32,
    ease     : f32,
    aspect   : f32,   // frame w/h \u2014 the box's halfSide is a fraction of WIDTH
    _pad     : f32,
}

// cmd.x \u2014 0 auto (track), 1 manual-hold (frozen), 2 manual-solve (snap once).
const MODE_HOLD  : f32 = 1.0;
const MODE_SOLVE : f32 = 2.0;
// Subject hysteresis: a challenger must be this much bigger than the incumbent
// to take the camera, and the incumbent is re-found within this radius (or 2\xD7
// its own halfSide, whichever is larger).
const SWITCH_RATIO     : f32 = 1.25;
const TRACK_RADIUS_MIN : f32 = 0.1;

@group(0) @binding(0) var<storage, read>       box_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       prev_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       cmd_buf  : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params   : Params;
@group(0) @binding(4) var<storage, read_write> out_buf  : array<vec4<f32>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
    let prev   = prev_buf[0];
    let prev_s = prev_buf[1];
    let mode   = cmd_buf[0].x;

    // \u2500\u2500 subject selection, with hysteresis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Challenger = the largest live face.
    var chal = -1;
    var chal_hs = 0.0;
    for (var i = 0u; i < params.k; i++) {
        let b = box_buf[i];
        if (b.w > 0.0 && b.z > chal_hs) { chal_hs = b.z; chal = i32(i); }
    }
    if (chal < 0) {
        out_buf[0] = prev;
        out_buf[1] = prev_s;   // keep the memory: a one-frame detection miss must
        return;                // not hand the camera to someone else
    }

    // Incumbent = the live face nearest where the subject was, tracked by
    // position because slot indices aren't stable identities.
    var inc = -1;
    var inc_d = 1e9;
    if (prev_s.w > 0.5) {
        let radius = max(TRACK_RADIUS_MIN, prev_s.z * 2.0);
        for (var i = 0u; i < params.k; i++) {
            let b = box_buf[i];
            if (b.w <= 0.0) { continue; }
            let d = length(vec2<f32>(b.x - prev_s.x, b.y - prev_s.y));
            if (d < radius && d < inc_d) { inc_d = d; inc = i32(i); }
        }
    }

    // Stick with the incumbent unless the challenger is decisively bigger.
    // halfSide \u2248 1/distance, so 1.25\xD7 \u2248 "20% closer to the camera" \u2014 enough that
    // two people sitting side by side can't trade the camera back and forth.
    var pick = chal;
    if (inc >= 0 && chal_hs <= box_buf[u32(inc)].z * SWITCH_RATIO) { pick = inc; }
    let subj = box_buf[u32(pick)];
    out_buf[1] = vec4<f32>(subj.x, subj.y, subj.z, 1.0);

    // Solve. Stepped relaxation rather than closed-form: the frame-edge clamp
    // makes the centre depend on the crop size, so it's implicit.
    let half_x = subj.z;
    let half_y = subj.z * params.aspect;
    // Fallback = the FULL frame, i.e. no reframe at all. A subject too close to
    // the edge to contain can't be rescued by relaxing zoom (once the crop centre
    // clamps to the frame edge, the containment test reduces to x >= half+margin,
    // independent of zoom) \u2014 so it falls through to this and eases out to the raw
    // frame. That IS "head in the corner does nothing"; holding the last crop
    // instead would freeze on a shot the subject is walking out of.
    //
    // What the relaxation actually buys is the other axis: a subject too BIG for
    // the requested zoom (a close-up) backs the crop off until they fit.
    var w_cx = 0.5; var w_cy = 0.5; var w_s = 1.0;
    for (var t = 0; t <= 25; t++) {
        let z = params.zoom + (1.0 - params.zoom) * (f32(t) / 25.0);
        let s = 1.0 / z;
        let cx = clamp(0.5 + params.gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        let cy = clamp(0.5 + params.gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + half_x + params.margin <= s * 0.5 &&
            abs(subj.y - cy) + half_y + params.margin <= s * 0.5) {
            w_cx = cx; w_cy = cy; w_s = s;
            break;
        }
    }
    // size 0 = uninitialised: snap rather than easing in from nothing. This is
    // also what makes manual mode "reframe once when enabled, then freeze".
    if (prev.z <= 0.0 || mode == MODE_SOLVE) {
        out_buf[0] = vec4<f32>(w_cx, w_cy, w_s, 0.0);
        return;
    }
    if (mode == MODE_HOLD) { out_buf[0] = prev; return; }

    let d = length(vec2<f32>(w_cx - prev.x, w_cy - prev.y)) + abs(w_s - prev.z);
    var moving = prev.w;
    if (d > params.deadband) { moving = 1.0; }
    else if (d < params.deadband * 0.3) { moving = 0.0; }
    if (moving < 0.5) { out_buf[0] = vec4<f32>(prev.xyz, 0.0); return; }

    out_buf[0] = vec4<f32>(
        mix(prev.x, w_cx, params.ease),
        mix(prev.y, w_cy, params.ease),
        mix(prev.z, w_s,  params.ease),
        1.0,
    );
}
`;var mr=`enable f16;

// Auto-reframe state update (f16 storage, f32 math) \u2014 one thread, one frame of camera work.
// NOTE f16: the ease step is ~0.07\xB7d and only runs while d > deadband(0.09), so
// steps are ~1.9e-3 \u2014 comfortably above f16's ~4.9e-4 resolution near 0.5. It
// converges to the deadband then holds exactly (prev is passed through, not
// re-lerped), so there's no slow drift.
// In:  boxes (1\xD7K\xD74, FaceBoxesFromHeatmaps), prev state, command.
// Out: new state, 1\xD71\xD78 = two vec4s:
//        [0] (cx, cy, size, moving)   \u2014 the view rect; all FRAME FRACTIONS
//        [1] (subjX, subjY, subjHs, valid) \u2014 the incumbent subject, for hysteresis
//
// The subject is remembered by POSITION, not by slot: FaceBoxesFromHeatmaps
// orders its slots by NMS score, so slot 1 can be a different person next frame.
//
// \`size\` is a fraction of BOTH width and height, which is what preserves the
// frame's aspect: equal fractions of a 640\xD7400 frame is still 8:5.
//
// The rule (tuned in demo/reframe.ts):
//   centre = frameCentre + gravity\xB7(subject \u2212 frameCentre)   \u2014 pull, never centre
//   crop   = frame / zoom
//   constraints: the crop stays INSIDE the frame AND contains the subject+margin
// Neither is a special case; "head in the corner does nothing" falls out of them:
// once the crop centre clamps to the frame edge, containment reduces to
// x >= half+margin regardless of zoom, so an edge subject simply never fits and
// the solve falls through to its full-frame fallback (= no reframe). The zoom
// relaxation earns its keep elsewhere \u2014 backing off for a subject too BIG for
// the requested crop.
//
// Smoothing is deadband + ease: hold, move deliberately, hold. A plain EMA reads
// as swimming as the subject breathes.
//
// State is threaded across frames by the renderer with copyTensor \u2014 same carrier
// pattern as the flow stabilizer's stabPrev. No readback anywhere.

struct Params {
    k        : u32,
    zoom     : f32,
    gravity  : f32,
    margin   : f32,
    deadband : f32,
    ease     : f32,
    aspect   : f32,   // frame w/h \u2014 the box's halfSide is a fraction of WIDTH
    _pad     : f32,
}

// cmd.x \u2014 0 auto (track), 1 manual-hold (frozen), 2 manual-solve (snap once).
const MODE_HOLD  : f32 = 1.0;
const MODE_SOLVE : f32 = 2.0;
// Subject hysteresis: a challenger must be this much bigger than the incumbent
// to take the camera, and the incumbent is re-found within this radius (or 2\xD7
// its own halfSide, whichever is larger).
const SWITCH_RATIO     : f32 = 1.25;
const TRACK_RADIUS_MIN : f32 = 0.1;

@group(0) @binding(0) var<storage, read>       box_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       prev_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       cmd_buf  : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params   : Params;
@group(0) @binding(4) var<storage, read_write> out_buf  : array<vec4<f16>>;

@compute @workgroup_size(1, 1, 1)
fn main() {
    let prev   = vec4<f32>(prev_buf[0]);
    let prev_s = vec4<f32>(prev_buf[1]);
    let mode   = f32(cmd_buf[0].x);

    // \u2500\u2500 subject selection, with hysteresis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Challenger = the largest live face.
    var chal = -1;
    var chal_hs = 0.0;
    for (var i = 0u; i < params.k; i++) {
        let b = vec4<f32>(box_buf[i]);
        if (b.w > 0.0 && b.z > chal_hs) { chal_hs = b.z; chal = i32(i); }
    }
    if (chal < 0) {
        out_buf[0] = vec4<f16>(prev);
        out_buf[1] = vec4<f16>(prev_s);   // keep the memory: a one-frame detection miss must
        return;                // not hand the camera to someone else
    }

    // Incumbent = the live face nearest where the subject was, tracked by
    // position because slot indices aren't stable identities.
    var inc = -1;
    var inc_d = 1e9;
    if (prev_s.w > 0.5) {
        let radius = max(TRACK_RADIUS_MIN, prev_s.z * 2.0);
        for (var i = 0u; i < params.k; i++) {
            let b = vec4<f32>(box_buf[i]);
            if (b.w <= 0.0) { continue; }
            let d = length(vec2<f32>(b.x - prev_s.x, b.y - prev_s.y));
            if (d < radius && d < inc_d) { inc_d = d; inc = i32(i); }
        }
    }

    // Stick with the incumbent unless the challenger is decisively bigger.
    // halfSide \u2248 1/distance, so 1.25\xD7 \u2248 "20% closer to the camera" \u2014 enough that
    // two people sitting side by side can't trade the camera back and forth.
    var pick = chal;
    if (inc >= 0 && chal_hs <= f32(box_buf[u32(inc)].z) * SWITCH_RATIO) { pick = inc; }
    let subj = vec4<f32>(box_buf[u32(pick)]);
    out_buf[1] = vec4<f16>(vec4<f32>(subj.x, subj.y, subj.z, 1.0));

    // Solve. Stepped relaxation rather than closed-form: the frame-edge clamp
    // makes the centre depend on the crop size, so it's implicit.
    let half_x = subj.z;
    let half_y = subj.z * params.aspect;
    // Fallback = the FULL frame, i.e. no reframe at all. A subject too close to
    // the edge to contain can't be rescued by relaxing zoom (once the crop centre
    // clamps to the frame edge, the containment test reduces to x >= half+margin,
    // independent of zoom) \u2014 so it falls through to this and eases out to the raw
    // frame. That IS "head in the corner does nothing"; holding the last crop
    // instead would freeze on a shot the subject is walking out of.
    //
    // What the relaxation actually buys is the other axis: a subject too BIG for
    // the requested zoom (a close-up) backs the crop off until they fit.
    var w_cx = 0.5; var w_cy = 0.5; var w_s = 1.0;
    for (var t = 0; t <= 25; t++) {
        let z = params.zoom + (1.0 - params.zoom) * (f32(t) / 25.0);
        let s = 1.0 / z;
        let cx = clamp(0.5 + params.gravity * (subj.x - 0.5), s * 0.5, 1.0 - s * 0.5);
        let cy = clamp(0.5 + params.gravity * (subj.y - 0.5), s * 0.5, 1.0 - s * 0.5);
        if (abs(subj.x - cx) + half_x + params.margin <= s * 0.5 &&
            abs(subj.y - cy) + half_y + params.margin <= s * 0.5) {
            w_cx = cx; w_cy = cy; w_s = s;
            break;
        }
    }
    // size 0 = uninitialised: snap rather than easing in from nothing. This is
    // also what makes manual mode "reframe once when enabled, then freeze".
    if (prev.z <= 0.0 || mode == MODE_SOLVE) {
        out_buf[0] = vec4<f16>(vec4<f32>(w_cx, w_cy, w_s, 0.0));
        return;
    }
    if (mode == MODE_HOLD) { out_buf[0] = vec4<f16>(prev); return; }

    let d = length(vec2<f32>(w_cx - prev.x, w_cy - prev.y)) + abs(w_s - prev.z);
    var moving = prev.w;
    if (d > params.deadband) { moving = 1.0; }
    else if (d < params.deadband * 0.3) { moving = 0.0; }
    if (moving < 0.5) { out_buf[0] = vec4<f16>(vec4<f32>(prev.xyz, 0.0)); return; }

    out_buf[0] = vec4<f16>(vec4<f32>(
        mix(prev.x, w_cx, params.ease),
        mix(prev.y, w_cy, params.ease),
        mix(prev.z, w_s,  params.ease),
        1.0,
    ));
}
`;var ue=class extends c{inputs;weights=[];output;dispatch=[1,1,1];shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?mr:dr,this.output=r.tensor(1,1,8),this.inputs=[e,t,i],this.createUniform("params","Params");let o=new ArrayBuffer(32);new Uint32Array(o,0,1)[0]=e.w*e.h;let s=new Float32Array(o,4,7);s[0]=a.zoom,s[1]=a.gravity,s[2]=a.margin,s[3]=a.deadband,s[4]=a.ease,s[5]=a.aspect,this.setUniform("params",new Uint32Array(o)),this.defaultSetup();}};var gr=`// Apply the reframe crop (f32): sample \`src\` through the view rect. Same shape
// in and out \u2014 this is the geometric slot of the one-compositor design.
//
// Applied AFTER the effect chain (touch-up draws its mesh at FULL-frame landmark
// coords; reframing upstream would land every face effect in the wrong place),
// and to the foreground + alpha only. The background is bound separately by the
// compositor and deliberately does NOT move \u2014 you zoom toward the person, the
// virtual backdrop behind them stays put. Blur backgrounds are derived from the
// foreground, so they follow for free; no per-mode special case.
//
// rect = (cx, cy, size, moving) in frame fractions; size is a fraction of BOTH
// dims (that's what preserves aspect). size \u2264 0 means uninitialised \u2192 identity.

struct Params {
    h : u32,
    w : u32,
}

@group(0) @binding(0) var<storage, read>       src_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       rect_buf : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params   : Params;
@group(0) @binding(3) var<storage, read_write> out_buf  : array<vec4<f32>>;

fn samp(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(params.w) - 1);
    let cy = clamp(y, 0, i32(params.h) - 1);
    return src_buf[u32(cy) * params.w + u32(cx)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.w || gid.y >= params.h) { return; }

    let r = rect_buf[0];
    var s = r.z; var rcx = r.x; var rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }   // identity until the first solve

    let fx = (rcx - s * 0.5) + ((f32(gid.x) + 0.5) / f32(params.w)) * s;
    let fy = (rcy - s * 0.5) + ((f32(gid.y) + 0.5) / f32(params.h)) * s;
    // frame fraction \u2192 texel index (a texel's centre sits at index + 0.5), so an
    // identity rect samples each texel exactly and the op is a bit-exact copy.
    let sx = fx * f32(params.w) - 0.5;
    let sy = fy * f32(params.h) - 0.5;

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    let bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    out_buf[gid.y * params.w + gid.x] = mix(top, bot, ty);
}
`;var hr=`enable f16;

// Apply the reframe crop (f16 storage, f32 math): sample \`src\` through the view rect. Same shape
// in and out \u2014 this is the geometric slot of the one-compositor design.
//
// Applied AFTER the effect chain (touch-up draws its mesh at FULL-frame landmark
// coords; reframing upstream would land every face effect in the wrong place),
// and to the foreground + alpha only. The background is bound separately by the
// compositor and deliberately does NOT move \u2014 you zoom toward the person, the
// virtual backdrop behind them stays put. Blur backgrounds are derived from the
// foreground, so they follow for free; no per-mode special case.
//
// rect = (cx, cy, size, moving) in frame fractions; size is a fraction of BOTH
// dims (that's what preserves aspect). size \u2264 0 means uninitialised \u2192 identity.

struct Params {
    h : u32,
    w : u32,
}

@group(0) @binding(0) var<storage, read>       src_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       rect_buf : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params   : Params;
@group(0) @binding(3) var<storage, read_write> out_buf  : array<vec4<f16>>;

fn samp(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(params.w) - 1);
    let cy = clamp(y, 0, i32(params.h) - 1);
    return vec4<f32>(src_buf[u32(cy) * params.w + u32(cx)]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.w || gid.y >= params.h) { return; }

    let r = vec4<f32>(rect_buf[0]);
    var s = r.z; var rcx = r.x; var rcy = r.y;
    if (s <= 0.0) { s = 1.0; rcx = 0.5; rcy = 0.5; }   // identity until the first solve

    let fx = (rcx - s * 0.5) + ((f32(gid.x) + 0.5) / f32(params.w)) * s;
    let fy = (rcy - s * 0.5) + ((f32(gid.y) + 0.5) / f32(params.h)) * s;
    // frame fraction \u2192 texel index (a texel's centre sits at index + 0.5), so an
    // identity rect samples each texel exactly and the op is a bit-exact copy.
    let sx = fx * f32(params.w) - 0.5;
    let sy = fy * f32(params.h) - 0.5;

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0),     samp(x0 + 1, y0),     tx);
    let bot = mix(samp(x0, y0 + 1), samp(x0 + 1, y0 + 1), tx);
    out_buf[gid.y * params.w + gid.x] = vec4<f16>(mix(top, bot, ty));
}
`;var pe=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?hr:gr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var br=`// Box-driven square crop + bilinear resample + channel normalization (f32).
// Reads the box tensor (FaceBoxFromHeatmaps output: cx, cy, halfSide, score in
// frame fractions; halfSide as a fraction of frame WIDTH) and emits the
// landmark model's input: ((rgb - mean) / std), .w = 0.
//
// Sampling mirrors landmark training's warpAffine: src = center + (u - out/2)
// \xB7 side/out \u2014 u is the integer output pixel index (cv2 convention).

struct Params {
    in_h  : u32,
    in_w  : u32,
    out_h : u32,
    out_w : u32,
    slot  : u32,        // box-tensor slot (multi-face); 0 for the single-face path
    pad0  : u32,
    pad1  : u32,
    pad2  : u32,
    mean  : vec4<f32>,   // .xyz used
    stdev : vec4<f32>,   // .xyz used
}

@group(0) @binding(0) var<storage, read>       frame_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       box_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params    : Params;
@group(0) @binding(3) var<storage, read_write> out_buf   : array<vec4<f32>>;

fn samp(x: i32, y: i32, W: i32, H: i32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return frame_buf[u32(cy) * u32(W) + u32(cx)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let W = i32(params.in_w);
    let H = i32(params.in_h);
    let box = box_buf[params.slot];
    let cx   = box.x * f32(params.in_w);
    let cy   = box.y * f32(params.in_h);
    let side = 2.0 * box.z * f32(params.in_w);   // square in frame px

    let sx = clamp(cx + (f32(x) - f32(params.out_w) * 0.5) * side / f32(params.out_w), 0.0, f32(W - 1));
    let sy = clamp(cy + (f32(y) - f32(params.out_h) * 0.5) * side / f32(params.out_h), 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H), samp(x0 + 1, y0, W, H), tx);
    let bot = mix(samp(x0, y0 + 1, W, H), samp(x0 + 1, y0 + 1, W, H), tx);
    let v = mix(top, bot, ty);

    let n = (v.rgb - params.mean.rgb) / params.stdev.rgb;
    out_buf[y * params.out_w + x] = vec4<f32>(n, 0.0);
}
`;var vr=`enable f16;

// Box-driven square crop + bilinear resample + channel normalization (f16 storage, f32 math).
// Reads the box tensor (FaceBoxFromHeatmaps output: cx, cy, halfSide, score in
// frame fractions; halfSide as a fraction of frame WIDTH) and emits the
// landmark model's input: ((rgb - mean) / std), .w = 0.
//
// Sampling mirrors landmark training's warpAffine: src = center + (u - out/2)
// \xB7 side/out \u2014 u is the integer output pixel index (cv2 convention).

struct Params {
    in_h  : u32,
    in_w  : u32,
    out_h : u32,
    out_w : u32,
    slot  : u32,        // box-tensor slot (multi-face); 0 for the single-face path
    pad0  : u32,
    pad1  : u32,
    pad2  : u32,
    mean  : vec4<f32>,   // .xyz used
    stdev : vec4<f32>,   // .xyz used
}

@group(0) @binding(0) var<storage, read>       frame_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       box_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params    : Params;
@group(0) @binding(3) var<storage, read_write> out_buf   : array<vec4<f16>>;

fn samp(x: i32, y: i32, W: i32, H: i32) -> vec4<f32> {
    let cx = clamp(x, 0, W - 1);
    let cy = clamp(y, 0, H - 1);
    return vec4<f32>(frame_buf[u32(cy) * u32(W) + u32(cx)]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let W = i32(params.in_w);
    let H = i32(params.in_h);
    let box = vec4<f32>(box_buf[params.slot]);
    let cx   = box.x * f32(params.in_w);
    let cy   = box.y * f32(params.in_h);
    let side = 2.0 * box.z * f32(params.in_w);   // square in frame px

    let sx = clamp(cx + (f32(x) - f32(params.out_w) * 0.5) * side / f32(params.out_w), 0.0, f32(W - 1));
    let sy = clamp(cy + (f32(y) - f32(params.out_h) * 0.5) * side / f32(params.out_h), 0.0, f32(H - 1));

    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);

    let top = mix(samp(x0, y0, W, H), samp(x0 + 1, y0, W, H), tx);
    let bot = mix(samp(x0, y0 + 1, W, H), samp(x0 + 1, y0 + 1, W, H), tx);
    let v = mix(top, bot, ty);

    let n = (v.rgb - params.mean.rgb) / params.stdev.rgb;
    out_buf[y * params.out_w + x] = vec4<f16>(vec4<f32>(n, 0.0));
}
`;var ce=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?vr:br,this.output=r.tensor(i.outH,i.outW,4),this.inputs=[e,t];let a=i.slot??0;if(a>=t.w*t.h)throw new Error(`CropResample: slot ${a} out of range for a ${t.h}\xD7${t.w} box tensor`);this.createUniform("params","Params");let o=new ArrayBuffer(64),s=new Uint32Array(o,0,5);s[0]=e.h,s[1]=e.w,s[2]=i.outH,s[3]=i.outW,s[4]=a,new Float32Array(o,32,4).set([...i.mean,0]),new Float32Array(o,48,4).set([...i.std,1]),this.setUniform("params",new Uint32Array(o)),this.defaultSetup(),this.dispatch=[Math.ceil(i.outW/8),Math.ceil(i.outH/8),1];}};var _r=`// Landmark overlay (f32) \u2014 draws the image, then VERTEX-PULLS landmark dots
// straight from the LandmarkNet output tensor: the vertex shader fetches
// landmark i from the storage buffer and transforms crop coords \u2192 canvas NDC
// via the box tensor. The per-frame landmark data never touches the CPU.
//
// Entry points: vs_img/fs_img (fullscreen image, 6 verts) and vs_pts/fs_pts
// (count \xD7 6 verts \u2014 one quad per landmark; WebGPU has no point size).

struct Params {
    img_w      : u32,
    count      : u32,
    thresh     : f32,   // hide all dots when box score < thresh
    point_size : f32,   // dot diameter in canvas px
    slot       : u32,   // box-tensor slot to read (multi-face); 0 = single-face
    color      : vec4<f32>,
    canvas     : vec4<f32>,   // .xy = canvas w, h
}

@group(0) @binding(0) var<storage, read> image_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f32>>;   // 478 \xD7 (x, y), [0,1] crop coords
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f32>>;   // (cx, cy, halfSide/W, score) frame fractions
@group(0) @binding(3) var<uniform>       params    : Params;

// \u2500\u2500 image pass \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct VOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs_img(@builtin(vertex_index) vi: u32) -> VOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

@fragment
fn fs_img(in: VOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * params.img_w + u32(in.pos.x);
    return vec4<f32>(image_buf[i].rgb, 1.0);
}

// \u2500\u2500 landmark dots \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

@vertex
fn vs_pts(@builtin(vertex_index) vi: u32) -> VOut {
    let i      = vi / 6u;
    let corner = vi % 6u;
    var out: VOut;

    let box = box_buf[params.slot];
    if (box.w < params.thresh || i >= params.count) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);   // clipped away
        return out;
    }

    // Landmark i: two (x, y) pairs per vec4.
    var g = lm_buf[i / 2u];
    let lx = g[(i % 2u) * 2u];
    let ly = g[(i % 2u) * 2u + 1u];

    // Crop coords [0,1] \u2192 frame fractions. halfSide is a fraction of WIDTH;
    // the y half-extent rescales by the canvas aspect (the box is px-square).
    let hsx = box.z;
    let hsy = box.z * params.canvas.x / params.canvas.y;
    let px = (box.x - hsx) + lx * 2.0 * hsx;
    let py = (box.y - hsy) + ly * 2.0 * hsy;

    let corners = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    let off = corners[corner] * params.point_size / params.canvas.xy;   // NDC half-extents \xD72
    out.pos = vec4<f32>(px * 2.0 - 1.0 + off.x, 1.0 - 2.0 * py + off.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_pts(in: VOut) -> @location(0) vec4<f32> {
    return vec4<f32>(params.color.rgb, 1.0);
}
`;var yr=`enable f16;

// Landmark overlay (f16 storage, f32 math) \u2014 draws the image, then VERTEX-PULLS landmark dots
// straight from the LandmarkNet output tensor: the vertex shader fetches
// landmark i from the storage buffer and transforms crop coords \u2192 canvas NDC
// via the box tensor. The per-frame landmark data never touches the CPU.
//
// Entry points: vs_img/fs_img (fullscreen image, 6 verts) and vs_pts/fs_pts
// (count \xD7 6 verts \u2014 one quad per landmark; WebGPU has no point size).

struct Params {
    img_w      : u32,
    count      : u32,
    thresh     : f32,   // hide all dots when box score < thresh
    point_size : f32,   // dot diameter in canvas px
    slot       : u32,   // box-tensor slot to read (multi-face); 0 = single-face
    color      : vec4<f32>,
    canvas     : vec4<f32>,   // .xy = canvas w, h
}

@group(0) @binding(0) var<storage, read> image_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f16>>;   // 478 \xD7 (x, y), [0,1] crop coords
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f16>>;   // (cx, cy, halfSide/W, score) frame fractions
@group(0) @binding(3) var<uniform>       params    : Params;

// \u2500\u2500 image pass \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct VOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs_img(@builtin(vertex_index) vi: u32) -> VOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

@fragment
fn fs_img(in: VOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * params.img_w + u32(in.pos.x);
    return vec4<f32>(vec3<f32>(image_buf[i].rgb), 1.0);
}

// \u2500\u2500 landmark dots \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

@vertex
fn vs_pts(@builtin(vertex_index) vi: u32) -> VOut {
    let i      = vi / 6u;
    let corner = vi % 6u;
    var out: VOut;

    let box = vec4<f32>(box_buf[params.slot]);
    if (box.w < params.thresh || i >= params.count) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);   // clipped away
        return out;
    }

    // Landmark i: two (x, y) pairs per vec4.
    var g = vec4<f32>(lm_buf[i / 2u]);
    let lx = g[(i % 2u) * 2u];
    let ly = g[(i % 2u) * 2u + 1u];

    // Crop coords [0,1] \u2192 frame fractions. halfSide is a fraction of WIDTH;
    // the y half-extent rescales by the canvas aspect (the box is px-square).
    let hsx = box.z;
    let hsy = box.z * params.canvas.x / params.canvas.y;
    let px = (box.x - hsx) + lx * 2.0 * hsx;
    let py = (box.y - hsy) + ly * 2.0 * hsy;

    let corners = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    let off = corners[corner] * params.point_size / params.canvas.xy;   // NDC half-extents \xD72
    out.pos = vec4<f32>(px * 2.0 - 1.0 + off.x, 1.0 - 2.0 * py + off.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_pts(in: VOut) -> @location(0) vec4<f32> {
    return vec4<f32>(params.color.rgb, 1.0);
}
`;var le=class{constructor(r,e,t,i,a){this.backend=r;if(t.c<a.count*2)throw new Error(`LandmarkOverlay: landmarks tensor holds ${t.c/2} points < count ${a.count}`);let o=a.slot??0;if(o>=i.w*i.h)throw new Error(`LandmarkOverlay: slot ${o} out of range for a ${i.h}\xD7${i.w} box tensor`);this.count=a.count,this.drawImage=a.drawImage??true;let s=r.device,u=s.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),p=new ArrayBuffer(64),l=new Uint32Array(p,0,2);l[0]=e.w,l[1]=a.count;let d=new Float32Array(p,8,2);d[0]=a.thresh,d[1]=a.pointSize,new Uint32Array(p,16,1)[0]=o,new Float32Array(p,32,4).set([...a.color,1]),new Float32Array(p,48,4).set([e.w,e.h,0,0]),s.queue.writeBuffer(u,0,p);let _=s.createShaderModule({code:r.dtype==="f16"?yr:_r}),T=[{format:r.canvasFormat}];this.imgPipeline=s.createRenderPipeline({layout:"auto",vertex:{module:_,entryPoint:"vs_img"},fragment:{module:_,entryPoint:"fs_img",targets:T},primitive:{topology:"triangle-list"}}),this.ptsPipeline=s.createRenderPipeline({layout:"auto",vertex:{module:_,entryPoint:"vs_pts"},fragment:{module:_,entryPoint:"fs_pts",targets:T},primitive:{topology:"triangle-list"}}),this.imgBindGroup=s.createBindGroup({layout:this.imgPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.buffer}},{binding:3,resource:{buffer:u}}]}),this.ptsBindGroup=s.createBindGroup({layout:this.ptsPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:i.buffer}},{binding:3,resource:{buffer:u}}]});}backend;imgPipeline;ptsPipeline;imgBindGroup;ptsBindGroup;count;drawImage;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("LandmarkOverlayWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.backend.device.createCommandEncoder(),t=e.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:this.drawImage?"clear":"load",storeOp:"store"}]});this.drawImage&&(t.setPipeline(this.imgPipeline),t.setBindGroup(0,this.imgBindGroup),t.draw(6)),t.setPipeline(this.ptsPipeline),t.setBindGroup(0,this.ptsBindGroup),t.draw(this.count*6),t.end(),r||this.backend.device.queue.submit([e.finish()]),this.outputView=null;}};var Re=`// UV-space face touch-up (f32) \u2014 five passes, one module:
//   unwrap    : canonical mesh \u2192 512\xB2 atlas; vertex at canonical UV, textured
//               by the frame at its landmark's position (vertex-pulled from the
//               landmark tensor, crop \u2192 frame via the box tensor). The
//               rasterizer's barycentric interpolation IS the piecewise-affine
//               warp \u2014 one draw call.
//   blur \xD72   : separable gaussian on the atlas (freq-sep low band). Uses the
//               framebuffer-aligned vquad_fb so read row == write row and no
//               vertical flip accumulates across passes (WebGPU NDC-y is up,
//               texel rows are down).
//   combine   : low + (atlas \u2212 low) \xB7 detail \u2014 smooths skin, keeps pores.
//   composite : frame passthrough, then the mesh drawn at landmark screen
//               positions sampling the smoothed atlas, blended by the static
//               weight mask \xD7 strength. Score-gated: no face \u2192 passthrough.
//
// Landmarks are [0,1] CROP coords; the box tensor (cx, cy, halfSide/W, score,
// frame fractions) turns them into frame fractions in the vertex shaders \u2014
// the whole path stays GPU-resident.

struct Uni {
    frame_w  : u32,
    frame_h  : u32,
    sigma    : f32,
    detail   : f32,
    strength : f32,
    thresh   : f32,
    dir      : vec2<f32>,   // blur step (1/atlas, 0) or (0, 1/atlas)
    canvas   : vec2<f32>,   // frame w, h (aspect for the box y half-extent)
    slots    : u32,         // faces packed into lm_buf / box_buf (1 or 4)
    grid     : u32,         // atlas tile grid: 1 \u2192 whole atlas, 2 \u2192 2\xD72 tiles
}

@group(0) @binding(0) var<storage, read> frame_buf : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>       uni       : Uni;
@group(0) @binding(4) var samp : sampler;
@group(0) @binding(5) var tex0 : texture_2d<f32>;
@group(0) @binding(6) var tex1 : texture_2d<f32>;

// Bilinear sample of the frame tensor buffer at frame-fraction coords.
fn frame_at(px: i32, py: i32) -> vec3<f32> {
    let x = clamp(px, 0, i32(uni.frame_w) - 1);
    let y = clamp(py, 0, i32(uni.frame_h) - 1);
    return frame_buf[u32(y) * uni.frame_w + u32(x)].rgb;
}
fn frame_bilinear(f: vec2<f32>) -> vec3<f32> {
    let sx = clamp(f.x * f32(uni.frame_w) - 0.5, 0.0, f32(uni.frame_w - 1u));
    let sy = clamp(f.y * f32(uni.frame_h) - 0.5, 0.0, f32(uni.frame_h - 1u));
    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);
    let top = mix(frame_at(x0, y0),     frame_at(x0 + 1, y0),     tx);
    let bot = mix(frame_at(x0, y0 + 1), frame_at(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}

// Landmark i \u2192 (frame-fraction x, y, score). halfSide is a fraction of frame
// WIDTH; the y half-extent rescales by the aspect (the box is px-square).
fn lm_frame(i: u32, face: u32) -> vec3<f32> {
    let box = box_buf[face];
    // lm_buf packs \`slots\` faces \xD7 478 landmarks (ChannelConcat of the K
    // LandmarkNet outputs); 478 is even, so face f starts on a vec4 boundary.
    let gi = face * 478u + i;
    var g = lm_buf[gi / 2u];
    let lx = g[(gi % 2u) * 2u];
    let ly = g[(gi % 2u) * 2u + 1u];
    let hsx = box.z;
    let hsy = box.z * uni.canvas.x / uni.canvas.y;
    return vec3<f32>((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face \`face\` owns tile (face % grid, face / grid) of the atlas. grid=1 (K=1)
// maps to the whole atlas \u2014 i.e. the single-face layout, unchanged.
fn tile_uv(uv: vec2<f32>, face: u32) -> vec2<f32> {
    let g = f32(uni.grid);
    return (uv + vec2<f32>(f32(face % uni.grid), f32(face / uni.grid))) / g;
}

// The tile containing \`uv\`, as (lo.x, lo.y, hi.x, hi.y) \u2014 filter passes clamp
// their taps to it so one face's skin can't bleed into a neighbour's tile.
fn tile_bounds(uv: vec2<f32>) -> vec4<f32> {
    let g = f32(uni.grid);
    let t = floor(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.99999)) * g);
    return vec4<f32>(t / g, (t + vec2<f32>(1.0, 1.0)) / g);
}

// \u2500\u2500 unwrap: mesh \u2192 atlas \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct UnwrapOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) src: vec2<f32>,   // frame-fraction sample position
};

@vertex
fn vs_unwrap(@builtin(instance_index) inst: u32,
             @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> UnwrapOut {
    var out: UnwrapOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.src = l.xy;
    let uv = tile_uv(a_uv, inst);
    out.pos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);   // atlas row == uv.y
    return out;
}

@fragment
fn fs_unwrap(in: UnwrapOut) -> @location(0) vec4<f32> {
    return vec4<f32>(frame_bilinear(in.src), 1.0);
}

// \u2500\u2500 fullscreen quads \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct QOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Framebuffer-aligned uv for FILTER passes: uv.y equals the output texel's
// row so read == write and no flip accumulates.
@vertex
fn vs_quad_fb(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
    return out;
}

@fragment
fn fs_blur(in: QOut) -> @location(0) vec4<f32> {
    // dir is always \xB11/ATLAS, so this recovers the atlas texel size.
    let tb = tile_bounds(in.uv);
    let ht = max(uni.dir.x, uni.dir.y) * 0.5;
    let lo = tb.xy + ht;
    let hi = tb.zw - ht;
    let s = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(s * 2.5), 1.0, 48.0));
    var sum = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var i = -48; i <= 48; i++) {
        if (i < -R || i > R) { continue; }
        let w = exp(-f32(i * i) / (2.0 * s * s));
        sum += textureSample(tex0, samp, clamp(in.uv + uni.dir * f32(i), lo, hi)) * w;
        wsum += w;
    }
    return sum / wsum;
}

@fragment
fn fs_combine(in: QOut) -> @location(0) vec4<f32> {
    let a  = textureSample(tex0, samp, in.uv);
    let lo = textureSample(tex1, samp, in.uv);
    return clamp(lo + (a - lo) * uni.detail, vec4<f32>(0.0), vec4<f32>(1.0));
}

// Single-pass edge-preserving bilateral (style 'bilateral'). uni.dir carries
// the 2D texel size here; range sigma 0.15 (edge stop), spatial radius \u2264 12.
@fragment
fn fs_bilateral(in: QOut) -> @location(0) vec4<f32> {
    let btb = tile_bounds(in.uv);
    let bht = max(uni.dir.x, uni.dir.y) * 0.5;
    let blo = btb.xy + bht;
    let bhi = btb.zw - bht;
    let ss = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(ss), 1.0, 12.0));
    let sr = 0.15;
    let c = textureSample(tex0, samp, in.uv).rgb;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var y = -12; y <= 12; y++) {
        if (y < -R || y > R) { continue; }
        for (var x = -12; x <= 12; x++) {
            if (x < -R || x > R) { continue; }
            let sc = textureSample(tex0, samp, clamp(in.uv + uni.dir * vec2<f32>(f32(x), f32(y)), blo, bhi)).rgb;
            let ws = exp(-f32(x * x + y * y) / (2.0 * ss * ss));
            let d = sc - c;
            let wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    return vec4<f32>(sum / wsum, 1.0);
}

// \u2500\u2500 composite: passthrough + mesh over the face \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

@vertex
fn vs_pass(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(0.0);
    return out;
}

@fragment
fn fs_pass(in: QOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * uni.frame_w + u32(in.pos.x);
    return vec4<f32>(frame_buf[i].rgb, 1.0);
}

struct CompOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,      // TILED atlas uv \u2014 the atlas is per-face
    @location(1) src: vec2<f32>,     // frame-fraction position
    @location(2) uv_mask: vec2<f32>, // UNTILED canonical uv \u2014 the weight mask is
                                     // one static 512\xB2 asset shared by every face
};

@vertex
fn vs_comp(@builtin(instance_index) inst: u32,
           @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> CompOut {
    var out: CompOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.uv = tile_uv(a_uv, inst);
    out.uv_mask = a_uv;
    out.src = l.xy;
    out.pos = vec4<f32>(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_comp(in: CompOut) -> @location(0) vec4<f32> {
    let orig = frame_bilinear(in.src);
    let sm   = textureSample(tex0, samp, in.uv).rgb;                   // smoothed atlas \u2014 TILED
    // The weight mask is NOT tiled: it's one canonical 512\xB2 asset, so it must be
    // sampled with the untiled uv. Using the tiled uv here made every face read
    // only its quadrant OF THE MASK, stretched over the whole face \u2014 invisible at
    // slots=1 (tile_uv is identity) and badly wrong at slots=4.
    let w    = textureSample(tex1, samp, in.uv_mask).r * uni.strength; // weight mask \u2014 UNTILED
    return vec4<f32>(mix(orig, sm, w), 1.0);
}

// \u2500\u2500 stage mode: unpack the composited float texture into the output tensor \u2500\u2500
// (WebGPU tensors are storage buffers; the mesh passes need a raster target.
// copyTextureToBuffer has a 256-byte bytesPerRow constraint that arbitrary
// widths violate, so a tiny compute blit does the copy instead.)

@group(0) @binding(7) var<storage, read_write> unpack_out : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn cs_unpack(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= uni.frame_w || gid.y >= uni.frame_h) { return; }
    let v = textureLoad(tex0, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
    unpack_out[gid.y * uni.frame_w + gid.x] = v;
}
`;var Ve=`enable f16;

// UV-space face touch-up (f16 storage, f32 math) \u2014 five passes, one module:
//   unwrap    : canonical mesh \u2192 512\xB2 atlas; vertex at canonical UV, textured
//               by the frame at its landmark's position (vertex-pulled from the
//               landmark tensor, crop \u2192 frame via the box tensor). The
//               rasterizer's barycentric interpolation IS the piecewise-affine
//               warp \u2014 one draw call.
//   blur \xD72   : separable gaussian on the atlas (freq-sep low band). Uses the
//               framebuffer-aligned vquad_fb so read row == write row and no
//               vertical flip accumulates across passes (WebGPU NDC-y is up,
//               texel rows are down).
//   combine   : low + (atlas \u2212 low) \xB7 detail \u2014 smooths skin, keeps pores.
//   composite : frame passthrough, then the mesh drawn at landmark screen
//               positions sampling the smoothed atlas, blended by the static
//               weight mask \xD7 strength. Score-gated: no face \u2192 passthrough.
//
// Landmarks are [0,1] CROP coords; the box tensor (cx, cy, halfSide/W, score,
// frame fractions) turns them into frame fractions in the vertex shaders \u2014
// the whole path stays GPU-resident.

struct Uni {
    frame_w  : u32,
    frame_h  : u32,
    sigma    : f32,
    detail   : f32,
    strength : f32,
    thresh   : f32,
    dir      : vec2<f32>,   // blur step (1/atlas, 0) or (0, 1/atlas)
    canvas   : vec2<f32>,   // frame w, h (aspect for the box y half-extent)
    slots    : u32,         // faces packed into lm_buf / box_buf (1 or 4)
    grid     : u32,         // atlas tile grid: 1 \u2192 whole atlas, 2 \u2192 2\xD72 tiles
}

@group(0) @binding(0) var<storage, read> frame_buf : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> lm_buf    : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read> box_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>       uni       : Uni;
@group(0) @binding(4) var samp : sampler;
@group(0) @binding(5) var tex0 : texture_2d<f32>;
@group(0) @binding(6) var tex1 : texture_2d<f32>;

// Bilinear sample of the frame tensor buffer at frame-fraction coords.
fn frame_at(px: i32, py: i32) -> vec3<f32> {
    let x = clamp(px, 0, i32(uni.frame_w) - 1);
    let y = clamp(py, 0, i32(uni.frame_h) - 1);
    return vec3<f32>(frame_buf[u32(y) * uni.frame_w + u32(x)].rgb);
}
fn frame_bilinear(f: vec2<f32>) -> vec3<f32> {
    let sx = clamp(f.x * f32(uni.frame_w) - 0.5, 0.0, f32(uni.frame_w - 1u));
    let sy = clamp(f.y * f32(uni.frame_h) - 0.5, 0.0, f32(uni.frame_h - 1u));
    let x0 = i32(floor(sx));
    let y0 = i32(floor(sy));
    let tx = sx - f32(x0);
    let ty = sy - f32(y0);
    let top = mix(frame_at(x0, y0),     frame_at(x0 + 1, y0),     tx);
    let bot = mix(frame_at(x0, y0 + 1), frame_at(x0 + 1, y0 + 1), tx);
    return mix(top, bot, ty);
}

// Landmark i \u2192 (frame-fraction x, y, score). halfSide is a fraction of frame
// WIDTH; the y half-extent rescales by the aspect (the box is px-square).
fn lm_frame(i: u32, face: u32) -> vec3<f32> {
    let box = vec4<f32>(box_buf[face]);
    // lm_buf packs \`slots\` faces \xD7 478 landmarks (ChannelConcat of the K
    // LandmarkNet outputs); 478 is even, so face f starts on a vec4 boundary.
    let gi = face * 478u + i;
    var g = vec4<f32>(lm_buf[gi / 2u]);
    let lx = g[(gi % 2u) * 2u];
    let ly = g[(gi % 2u) * 2u + 1u];
    let hsx = box.z;
    let hsy = box.z * uni.canvas.x / uni.canvas.y;
    return vec3<f32>((box.x - hsx) + lx * 2.0 * hsx, (box.y - hsy) + ly * 2.0 * hsy, box.w);
}

// Face \`face\` owns tile (face % grid, face / grid) of the atlas. grid=1 (K=1)
// maps to the whole atlas \u2014 i.e. the single-face layout, unchanged.
fn tile_uv(uv: vec2<f32>, face: u32) -> vec2<f32> {
    let g = f32(uni.grid);
    return (uv + vec2<f32>(f32(face % uni.grid), f32(face / uni.grid))) / g;
}

// The tile containing \`uv\`, as (lo.x, lo.y, hi.x, hi.y) \u2014 filter passes clamp
// their taps to it so one face's skin can't bleed into a neighbour's tile.
fn tile_bounds(uv: vec2<f32>) -> vec4<f32> {
    let g = f32(uni.grid);
    let t = floor(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.99999)) * g);
    return vec4<f32>(t / g, (t + vec2<f32>(1.0, 1.0)) / g);
}

// \u2500\u2500 unwrap: mesh \u2192 atlas \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct UnwrapOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) src: vec2<f32>,   // frame-fraction sample position
};

@vertex
fn vs_unwrap(@builtin(instance_index) inst: u32,
             @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> UnwrapOut {
    var out: UnwrapOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.src = l.xy;
    let uv = tile_uv(a_uv, inst);
    out.pos = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, 0.0, 1.0);   // atlas row == uv.y
    return out;
}

@fragment
fn fs_unwrap(in: UnwrapOut) -> @location(0) vec4<f32> {
    return vec4<f32>(frame_bilinear(in.src), 1.0);
}

// \u2500\u2500 fullscreen quads \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

struct QOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Framebuffer-aligned uv for FILTER passes: uv.y equals the output texel's
// row so read == write and no flip accumulates.
@vertex
fn vs_quad_fb(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
    return out;
}

@fragment
fn fs_blur(in: QOut) -> @location(0) vec4<f32> {
    // dir is always \xB11/ATLAS, so this recovers the atlas texel size.
    let tb = tile_bounds(in.uv);
    let ht = max(uni.dir.x, uni.dir.y) * 0.5;
    let lo = tb.xy + ht;
    let hi = tb.zw - ht;
    let s = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(s * 2.5), 1.0, 48.0));
    var sum = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var i = -48; i <= 48; i++) {
        if (i < -R || i > R) { continue; }
        let w = exp(-f32(i * i) / (2.0 * s * s));
        sum += textureSample(tex0, samp, clamp(in.uv + uni.dir * f32(i), lo, hi)) * w;
        wsum += w;
    }
    return sum / wsum;
}

@fragment
fn fs_combine(in: QOut) -> @location(0) vec4<f32> {
    let a  = textureSample(tex0, samp, in.uv);
    let lo = textureSample(tex1, samp, in.uv);
    return clamp(lo + (a - lo) * uni.detail, vec4<f32>(0.0), vec4<f32>(1.0));
}

// Single-pass edge-preserving bilateral (style 'bilateral'). uni.dir carries
// the 2D texel size here; range sigma 0.15 (edge stop), spatial radius \u2264 12.
@fragment
fn fs_bilateral(in: QOut) -> @location(0) vec4<f32> {
    let btb = tile_bounds(in.uv);
    let bht = max(uni.dir.x, uni.dir.y) * 0.5;
    let blo = btb.xy + bht;
    let bhi = btb.zw - bht;
    let ss = max(uni.sigma, 0.001);
    let R = i32(clamp(ceil(ss), 1.0, 12.0));
    let sr = 0.15;
    let c = textureSample(tex0, samp, in.uv).rgb;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var y = -12; y <= 12; y++) {
        if (y < -R || y > R) { continue; }
        for (var x = -12; x <= 12; x++) {
            if (x < -R || x > R) { continue; }
            let sc = textureSample(tex0, samp, clamp(in.uv + uni.dir * vec2<f32>(f32(x), f32(y)), blo, bhi)).rgb;
            let ws = exp(-f32(x * x + y * y) / (2.0 * ss * ss));
            let d = sc - c;
            let wr = exp(-dot(d, d) / (2.0 * sr * sr));
            sum += sc * ws * wr;
            wsum += ws * wr;
        }
    }
    return vec4<f32>(sum / wsum, 1.0);
}

// \u2500\u2500 composite: passthrough + mesh over the face \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

@vertex
fn vs_pass(@builtin(vertex_index) vi: u32) -> QOut {
    let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    var out: QOut;
    out.pos = vec4<f32>(p[vi], 0.0, 1.0);
    out.uv = vec2<f32>(0.0);
    return out;
}

@fragment
fn fs_pass(in: QOut) -> @location(0) vec4<f32> {
    let i = u32(in.pos.y) * uni.frame_w + u32(in.pos.x);
    return vec4<f32>(vec3<f32>(frame_buf[i].rgb), 1.0);
}

struct CompOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,      // TILED atlas uv \u2014 the atlas is per-face
    @location(1) src: vec2<f32>,     // frame-fraction position
    @location(2) uv_mask: vec2<f32>, // UNTILED canonical uv \u2014 the weight mask is
                                     // one static 512\xB2 asset shared by every face
};

@vertex
fn vs_comp(@builtin(instance_index) inst: u32,
           @location(0) a_uv: vec2<f32>, @location(1) a_idx: f32) -> CompOut {
    var out: CompOut;
    let l = lm_frame(u32(a_idx), inst);
    if (l.z < uni.thresh) {
        out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.uv = tile_uv(a_uv, inst);
    out.uv_mask = a_uv;
    out.src = l.xy;
    out.pos = vec4<f32>(l.x * 2.0 - 1.0, 1.0 - 2.0 * l.y, 0.0, 1.0);
    return out;
}

@fragment
fn fs_comp(in: CompOut) -> @location(0) vec4<f32> {
    let orig = frame_bilinear(in.src);
    let sm   = textureSample(tex0, samp, in.uv).rgb;                   // smoothed atlas \u2014 TILED
    // The weight mask is NOT tiled: it's one canonical 512\xB2 asset, so it must be
    // sampled with the untiled uv. Using the tiled uv here made every face read
    // only its quadrant OF THE MASK, stretched over the whole face \u2014 invisible at
    // slots=1 (tile_uv is identity) and badly wrong at slots=4.
    let w    = textureSample(tex1, samp, in.uv_mask).r * uni.strength; // weight mask \u2014 UNTILED
    return vec4<f32>(mix(orig, sm, w), 1.0);
}

// \u2500\u2500 stage mode: unpack the composited float texture into the output tensor \u2500\u2500
// (WebGPU tensors are storage buffers; the mesh passes need a raster target.
// copyTextureToBuffer has a 256-byte bytesPerRow constraint that arbitrary
// widths violate, so a tiny compute blit does the copy instead.)

@group(0) @binding(7) var<storage, read_write> unpack_out : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn cs_unpack(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= uni.frame_w || gid.y >= uni.frame_h) { return; }
    let v = textureLoad(tex0, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
    unpack_out[gid.y * uni.frame_w + gid.x] = vec4<f16>(v);
}
`;var j=512,fe=class{constructor(r,e,t,i,a,o){this.backend=r;let s=o.slots??1;if(s!==1&&s!==4)throw new Error(`FaceTouchup: slots must be 1 or 4, got ${s}`);let u=s===4?2:1;if(i.w*i.h<s)throw new Error(`FaceTouchup: slots ${s} exceeds the ${i.h}\xD7${i.w} box tensor`);if(t.c<s*956)throw new Error(`FaceTouchup: landmarks tensor holds ${t.c/956} faces < slots ${s}`);this.slots=s,this.activeSlots=s;let p=r.device;this.device=p,this.uvBuf=p.createBuffer({size:a.uv.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),p.queue.writeBuffer(this.uvBuf,0,a.uv.buffer,a.uv.byteOffset,a.uv.byteLength),this.idxBuf=p.createBuffer({size:a.idx.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),p.queue.writeBuffer(this.idxBuf,0,a.idx.buffer,a.idx.byteOffset,a.idx.byteLength);let l=()=>p.createTexture({size:[j,j],format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),d=l(),_=l(),T=l(),b=l(),v=p.createTexture({size:[a.weightMask.width,a.weightMask.height],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});p.queue.copyExternalImageToTexture({source:a.weightMask},{texture:v},[a.weightMask.width,a.weightMask.height]);let w=p.createSampler({magFilter:"linear",minFilter:"linear"}),U=g=>{let y=p.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),M=new ArrayBuffer(48),m=new Uint32Array(M,0,2);m[0]=e.w,m[1]=e.h;let h=new Float32Array(M,8,8);return h[0]=g.sigma??0,h[1]=o.detail,h[2]=o.strength,h[3]=o.thresh,h[4]=g.dirX??0,h[5]=g.dirY??0,h[6]=e.w,h[7]=e.h,new Uint32Array(M,40,2).set([s,u]),p.queue.writeBuffer(y,0,M),y},k=U({}),B=U({sigma:o.amount,dirX:1/j}),G=U({sigma:o.amount,dirY:1/j}),I=U({sigma:o.amount,dirX:1/j,dirY:1/j}),H=p.createShaderModule({code:r.dtype==="f16"?Ve:Re}),R=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,attributes:[{shaderLocation:1,offset:0,format:"float32"}]}],D=(g,y,M,m)=>p.createRenderPipeline({layout:"auto",vertex:{module:H,entryPoint:g,buffers:m?R:[]},fragment:{module:H,entryPoint:y,targets:[{format:M}]},primitive:{topology:"triangle-list"}}),S=(g,y,M)=>p.createBindGroup({layout:g.getBindGroupLayout(0),entries:[...M,{binding:3,resource:{buffer:y}}]}),F=(g,y)=>({binding:g,resource:{buffer:y}}),P=(g,y)=>({binding:g,resource:y.createView()}),C=e.buffer,O=t.buffer,z=i.buffer,V=D("vs_unwrap","fs_unwrap","rgba8unorm",true),X=D("vs_pass","fs_pass",r.canvasFormat,false),$=D("vs_comp","fs_comp",r.canvasFormat,true),Y=(o.style??"freq-sep")==="bilateral"?(()=>{let g=D("vs_quad_fb","fs_bilateral","rgba8unorm",false);return [{pipeline:g,target:b.createView(),verts:3,mesh:false,load:false,bind:S(g,I,[{binding:4,resource:w},P(5,d)])}]})():(()=>{let g=D("vs_quad_fb","fs_blur","rgba8unorm",false),y=D("vs_quad_fb","fs_combine","rgba8unorm",false);return [{pipeline:g,target:_.createView(),verts:3,mesh:false,load:false,bind:S(g,B,[{binding:4,resource:w},P(5,d)])},{pipeline:g,target:T.createView(),verts:3,mesh:false,load:false,bind:S(g,G,[{binding:4,resource:w},P(5,_)])},{pipeline:y,target:b.createView(),verts:3,mesh:false,load:false,bind:S(y,k,[{binding:4,resource:w},P(5,d),P(6,T)])}]})();this.passes=[{pipeline:V,target:d.createView(),verts:a.count,mesh:true,load:false,bind:S(V,k,[F(0,C),F(1,O),F(2,z)])},...Y,{pipeline:X,target:null,verts:3,mesh:false,load:false,bind:S(X,k,[F(0,C)])},{pipeline:$,target:null,verts:a.count,mesh:true,load:true,bind:S($,k,[F(0,C),F(1,O),F(2,z),{binding:4,resource:w},P(5,b),P(6,v)])}];}backend;device;passes;uvBuf;idxBuf;slots;activeSlots;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("FaceTouchupWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.device.createCommandEncoder();for(let t of this.passes){let i=e.beginRenderPass({colorAttachments:[{view:t.target??this.outputView,clearValue:[0,0,0,1],loadOp:t.load?"load":"clear",storeOp:"store"}]});i.setPipeline(t.pipeline),i.setBindGroup(0,t.bind),t.mesh&&(i.setVertexBuffer(0,this.uvBuf),i.setVertexBuffer(1,this.idxBuf)),i.draw(t.verts,t.mesh?this.activeSlots:1),i.end();}r||this.device.queue.submit([e.finish()]),this.outputView=null;}},de=class{constructor(r,e,t,i,a,o){this.backend=r;let u=o.slots??1;if(u!==1&&u!==4)throw new Error(`FaceTouchup: slots must be 1 or 4, got ${u}`);let p=u===4?2:1;if(i.w*i.h<u)throw new Error(`FaceTouchup: slots ${u} exceeds the ${i.h}\xD7${i.w} box tensor`);if(t.c<u*956)throw new Error(`FaceTouchup: landmarks tensor holds ${t.c/956} faces < slots ${u}`);this.slots=u,this.activeSlots=u;let l=r.device;this.device=l,this.inputs=[e,t,i],this.output=r.tensor(e.h,e.w,4),this.meshCount=a.count,this.uvBuf=l.createBuffer({size:a.uv.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),l.queue.writeBuffer(this.uvBuf,0,a.uv.buffer,a.uv.byteOffset,a.uv.byteLength),this.idxBuf=l.createBuffer({size:a.idx.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),l.queue.writeBuffer(this.idxBuf,0,a.idx.buffer,a.idx.byteOffset,a.idx.byteLength);let d=()=>l.createTexture({size:[512,512],format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),_=d(),T=d(),b=d(),v=d(),w=r.dtype==="f16"?"rgba16float":"rgba32float",U=l.createTexture({size:[e.w,e.h],format:w,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),k=l.createTexture({size:[a.weightMask.width,a.weightMask.height],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});l.queue.copyExternalImageToTexture({source:a.weightMask},{texture:k},[a.weightMask.width,a.weightMask.height]);let B=l.createSampler({magFilter:"linear",minFilter:"linear"}),G=m=>{let h=l.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),E=new ArrayBuffer(48),Q=new Uint32Array(E,0,2);Q[0]=e.w,Q[1]=e.h;let L=new Float32Array(E,8,8);return L[0]=m.sigma??0,L[1]=o.detail,L[2]=o.strength,L[3]=o.thresh,L[4]=m.dirX??0,L[5]=m.dirY??0,L[6]=e.w,L[7]=e.h,new Uint32Array(E,40,2).set([u,p]),l.queue.writeBuffer(h,0,E),h},I=G({}),H=G({sigma:o.amount,dirX:1/512}),R=G({sigma:o.amount,dirY:1/512}),D=G({sigma:o.amount,dirX:1/512,dirY:1/512}),S=l.createShaderModule({code:r.dtype==="f16"?Ve:Re}),F=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,attributes:[{shaderLocation:1,offset:0,format:"float32"}]}],P=(m,h,E,Q)=>l.createRenderPipeline({layout:"auto",vertex:{module:S,entryPoint:m,buffers:Q?F:[]},fragment:{module:S,entryPoint:h,targets:[{format:E}]},primitive:{topology:"triangle-list"}}),C=(m,h,E)=>l.createBindGroup({layout:m.getBindGroupLayout(0),entries:[...E,{binding:3,resource:{buffer:h}}]}),O=(m,h)=>({binding:m,resource:{buffer:h}}),z=(m,h)=>({binding:m,resource:h.createView()}),V=e.buffer,X=t.buffer,$=i.buffer,Y=P("vs_unwrap","fs_unwrap","rgba8unorm",true),g=P("vs_pass","fs_pass",w,false),y=P("vs_comp","fs_comp",w,true),M=(o.style??"freq-sep")==="bilateral"?(()=>{let m=P("vs_quad_fb","fs_bilateral","rgba8unorm",false);return [{pipeline:m,target:v.createView(),verts:3,mesh:false,load:false,bind:C(m,D,[{binding:4,resource:B},z(5,_)])}]})():(()=>{let m=P("vs_quad_fb","fs_blur","rgba8unorm",false),h=P("vs_quad_fb","fs_combine","rgba8unorm",false);return [{pipeline:m,target:T.createView(),verts:3,mesh:false,load:false,bind:C(m,H,[{binding:4,resource:B},z(5,_)])},{pipeline:m,target:b.createView(),verts:3,mesh:false,load:false,bind:C(m,R,[{binding:4,resource:B},z(5,T)])},{pipeline:h,target:v.createView(),verts:3,mesh:false,load:false,bind:C(h,I,[{binding:4,resource:B},z(5,_),z(6,b)])}]})();this.passes=[{pipeline:Y,target:_.createView(),verts:a.count,mesh:true,load:false,bind:C(Y,I,[O(0,V),O(1,X),O(2,$)])},...M,{pipeline:g,target:U.createView(),verts:3,mesh:false,load:false,bind:C(g,I,[O(0,V)])},{pipeline:y,target:U.createView(),verts:a.count,mesh:true,load:true,bind:C(y,I,[O(0,V),O(1,X),O(2,$),{binding:4,resource:B},z(5,v),z(6,k)])}],this.unpackPipeline=l.createComputePipeline({layout:"auto",compute:{module:S,entryPoint:"cs_unpack"}}),this.unpackBind=C(this.unpackPipeline,I,[z(5,U),O(7,this.output.buffer)]),this.unpackDispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8)];}backend;inputs;weights=[];output;device;passes;unpackPipeline;unpackBind;unpackDispatch;uvBuf;idxBuf;meshCount;slots;activeSlots;setActiveSlots(r){this.activeSlots=Math.max(0,Math.min(r,this.slots));}run(){let r=this.backend.batchEncoder(),e=r??this.device.createCommandEncoder();for(let i of this.passes){let a=e.beginRenderPass({colorAttachments:[{view:i.target,clearValue:[0,0,0,1],loadOp:i.load?"load":"clear",storeOp:"store"}]});a.setPipeline(i.pipeline),a.setBindGroup(0,i.bind),i.mesh&&(a.setVertexBuffer(0,this.uvBuf),a.setVertexBuffer(1,this.idxBuf)),a.draw(i.verts,i.mesh?this.activeSlots:1),a.end();}let t=e.beginComputePass();t.setPipeline(this.unpackPipeline),t.setBindGroup(0,this.unpackBind),t.dispatchWorkgroups(this.unpackDispatch[0],this.unpackDispatch[1],1),t.end(),r||this.device.queue.submit([e.finish()]);}};var xr=`// Flow-gated temporal stabilizer (f32). See stabilize_f16.wgsl for the math.

struct Params {
    h        : u32,
    w        : u32,
    t_lo     : f32,
    t_hi     : f32,
    leak     : f32,
    release  : f32,
    t_div    : f32,
    div_scale: f32,
    step_x   : u32,
    step_y   : u32,
}

@group(0) @binding(0) var<storage, read>       flow_buf     : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       pred_buf     : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       ref_buf      : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       env_prev_buf : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params       : Params;
@group(0) @binding(5) var<storage, read_write> output_buf   : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }
    let idx = y * params.w + x;

    let mag      = length(flow_buf[idx].xy);
    let env_prev = env_prev_buf[idx].y;
    let env      = max(mag, params.release * env_prev);

    let xr = min(x + params.step_x, params.w - 1u);
    let xl = select(x - params.step_x, 0u, x < params.step_x);
    let yd = min(y + params.step_y, params.h - 1u);
    let yu = select(y - params.step_y, 0u, y < params.step_y);
    let dfx = flow_buf[y * params.w + xr].x - flow_buf[y * params.w + xl].x;
    let dfy = flow_buf[yd * params.w + x].y - flow_buf[yu * params.w + x].y;
    let divg = abs(dfx + dfy);

    let g_mag = clamp((env - params.t_lo) / max(params.t_hi - params.t_lo, 1e-3), 0.0, 1.0);
    let g_div = clamp((divg - params.t_div) / max(params.div_scale, 1e-3), 0.0, 1.0);
    let g = max(max(g_mag, g_div), params.leak);

    let pred = pred_buf[idx].x;
    let refv = ref_buf[idx].x;
    let stab = g * pred + (1.0 - g) * refv;

    output_buf[idx] = vec4<f32>(stab, env, 0.0, 0.0);
}
`;var wr=`enable f16;

// Flow-gated temporal stabilizer (f16 storage, f32 gate math). Per pixel:
//   env = max(|flow.xy|, release\xB7envPrev.y)      peak-hold (fast attack, slow release)
//   div = |\u2202fx/\u2202x + \u2202fy/\u2202y|                       flow divergence (occlusion seam)
//   g   = max(clamp((env-tLo)/(tHi-tLo),0,1), clamp((div-tDiv)/divScale,0,1), leak)
//   out = vec4((g\xB7pred + (1-g)\xB7ref).x, env, 0, 0)
// The divergence term opens the gate at occlusion/disocclusion boundaries (where
// the flow tears but the revealed-background magnitude is ~0). Finite-difference
// step spans ~1 base/4 pixel. alpha is in .x of pred/ref; env threads via .y.

struct Params {
    h        : u32,
    w        : u32,
    t_lo     : f32,
    t_hi     : f32,
    leak     : f32,
    release  : f32,
    t_div    : f32,
    div_scale: f32,
    step_x   : u32,
    step_y   : u32,
}

@group(0) @binding(0) var<storage, read>       flow_buf     : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       pred_buf     : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       ref_buf      : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       env_prev_buf : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params       : Params;
@group(0) @binding(5) var<storage, read_write> output_buf   : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }
    let idx = y * params.w + x;

    let mag      = length(vec2<f32>(flow_buf[idx].xy));
    let env_prev = f32(env_prev_buf[idx].y);
    let env      = max(mag, params.release * env_prev);

    // Flow divergence over a \xB1step finite-difference (clamped to the edges).
    let xr = min(x + params.step_x, params.w - 1u);
    let xl = select(x - params.step_x, 0u, x < params.step_x);
    let yd = min(y + params.step_y, params.h - 1u);
    let yu = select(y - params.step_y, 0u, y < params.step_y);
    let dfx = f32(flow_buf[y * params.w + xr].x) - f32(flow_buf[y * params.w + xl].x);
    let dfy = f32(flow_buf[yd * params.w + x].y) - f32(flow_buf[yu * params.w + x].y);
    let divg = abs(dfx + dfy);

    let g_mag = clamp((env - params.t_lo) / max(params.t_hi - params.t_lo, 1e-3), 0.0, 1.0);
    let g_div = clamp((divg - params.t_div) / max(params.div_scale, 1e-3), 0.0, 1.0);
    let g = max(max(g_mag, g_div), params.leak);

    let pred = f32(pred_buf[idx].x);
    let refv = f32(ref_buf[idx].x);
    let stab = g * pred + (1.0 - g) * refv;

    output_buf[idx] = vec4<f16>(f16(stab), f16(env), 0.0h, 0.0h);
}
`;var me=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t,i,a,o){super(r),this.shader=r.dtype==="f16"?wr:xr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t,i,a],this.createUniform("params","Params");let s=new Uint32Array(10);s[0]=e.h,s[1]=e.w;let u=new Float32Array(s.buffer);u[2]=o.tLo,u[3]=o.tHi,u[4]=o.leak,u[5]=o.release,u[6]=o.tDiv,u[7]=o.divScale,s[8]=o.stepX,s[9]=o.stepY,this.setUniform("params",s),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var kr=`// Bilinear upsample (arbitrary ratio), align_corners=False (matches PyTorch default).
// Input/output in NHWC vec4 format: index = y*W*(C/4) + x*(C/4) + c_group.
// Each thread computes one output pixel for one channel group (vec4 = 4 channels).

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    // align_corners=False: src = (out + 0.5) * (in / out) - 0.5
    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    // Clamp to [0, in-1] for border replication. Use i32 intermediates so that
    // floor() returning -1.0 doesn't produce an invalid u32 conversion.
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = input_buf[y0 * IW * C + x0 * C + c];
    let tr = input_buf[y0 * IW * C + x1 * C + c];
    let bl = input_buf[y1 * IW * C + x0 * C + c];
    let br = input_buf[y1 * IW * C + x1 * C + c];

    // Bilinear blend \u2014 vec4 ops are element-wise, so all 4 channels blend identically.
    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = result;
}
`;var Pr=`enable f16;

// Bilinear upsample 2\xD7 \u2014 full f16 variant.
// Interpolation weights (wx, wy) and intermediate blends computed in f32 for
// accuracy; result cast to f16 on write.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec4<f32>(input_buf[y0 * IW * C + x0 * C + c]);
    let tr = vec4<f32>(input_buf[y0 * IW * C + x1 * C + c]);
    let bl = vec4<f32>(input_buf[y1 * IW * C + x0 * C + c]);
    let br = vec4<f32>(input_buf[y1 * IW * C + x1 * C + c]);

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(result);
}
`;var ge=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?Pr:kr;let i=e.c/4;this.output=r.tensor(t.outH,t.outW,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,t.outH,t.outW,i,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.outW/8),Math.ceil(t.outH/8),i];}};var Tr=`// Top-left crop (f32). See crop_f16.wgsl.

struct Params {
    in_w   : u32,
    out_h  : u32,
    out_w  : u32,
    groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.out_w || y >= params.out_h || g >= params.groups) { return; }
    let G = params.groups;
    output_buf[y * params.out_w * G + x * G + g] = input_buf[y * params.in_w * G + x * G + g];
}
`;var Ur=`enable f16;

// Top-left crop: output[y,x,g] = input[y,x,g] for y<outH, x<outW (training crop_like).

struct Params {
    in_w   : u32,
    out_h  : u32,
    out_w  : u32,
    groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let g = gid.z;
    if (x >= params.out_w || y >= params.out_h || g >= params.groups) { return; }
    let G = params.groups;
    output_buf[y * params.out_w * G + x * G + g] = input_buf[y * params.in_w * G + x * G + g];
}
`;var he=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?Ur:Tr;let i=e.c/4;this.output=r.tensor(t.outH,t.outW,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.w,t.outH,t.outW,i])),this.defaultSetup(),this.dispatch=[Math.ceil(t.outW/8),Math.ceil(t.outH/8),i];}};var Gr=`// Bicubic upsample (arbitrary scale) \u2014 Keys cubic, a=-0.75 (PyTorch default
// for mode='bicubic', align_corners=False). Direct 2D, 4\xD74 = 16 taps per
// output pixel. NHWC vec4 layout: index = y*W*(C/4) + x*(C/4) + c_group.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

const A: f32 = -0.75;

fn wcubic(d: f32) -> f32 {
    let ad = abs(d);
    if (ad <= 1.0) { return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0; }
    if (ad <  2.0) { return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A; }
    return 0.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = i32(floor(src_x));
    let y0 = i32(floor(src_y));
    let fx = src_x - f32(x0);
    let fy = src_y - f32(y0);

    var wx: array<f32, 4>;
    var wy: array<f32, 4>;
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx); wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy); wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    var acc: vec4<f32> = vec4<f32>(0.0);
    for (var j: i32 = 0; j < 4; j = j + 1) {
        let sy = u32(clamp(y0 + j - 1, 0, i32(IH) - 1));
        for (var i: i32 = 0; i < 4; i = i + 1) {
            let sx = u32(clamp(x0 + i - 1, 0, i32(IW) - 1));
            let v  = input_buf[sy * IW * C + sx * C + c];
            acc = acc + (wx[i] * wy[j]) * v;
        }
    }

    output_buf[oy * params.out_w * C + ox * C + c] = acc;
}
`;var Br=`enable f16;

// Bicubic upsample \u2014 full f16 storage variant. Bicubic weights and the per-
// pixel accumulator are computed in f32 (cheap to keep precision around the
// kernel arithmetic), then demoted to f16 when written to the output buffer.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

const A: f32 = -0.75;

fn wcubic(d: f32) -> f32 {
    let ad = abs(d);
    if (ad <= 1.0) { return ((A + 2.0) * ad - (A + 3.0)) * ad * ad + 1.0; }
    if (ad <  2.0) { return ((A * ad - 5.0 * A) * ad + 8.0 * A) * ad - 4.0 * A; }
    return 0.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = i32(floor(src_x));
    let y0 = i32(floor(src_y));
    let fx = src_x - f32(x0);
    let fy = src_y - f32(y0);

    var wx: array<f32, 4>;
    var wy: array<f32, 4>;
    wx[0] = wcubic(1.0 + fx); wx[1] = wcubic(fx); wx[2] = wcubic(1.0 - fx); wx[3] = wcubic(2.0 - fx);
    wy[0] = wcubic(1.0 + fy); wy[1] = wcubic(fy); wy[2] = wcubic(1.0 - fy); wy[3] = wcubic(2.0 - fy);

    var acc: vec4<f32> = vec4<f32>(0.0);
    for (var j: i32 = 0; j < 4; j = j + 1) {
        let sy = u32(clamp(y0 + j - 1, 0, i32(IH) - 1));
        for (var i: i32 = 0; i < 4; i = i + 1) {
            let sx = u32(clamp(x0 + i - 1, 0, i32(IW) - 1));
            let v  = vec4<f32>(input_buf[sy * IW * C + sx * C + c]);
            acc = acc + (wx[i] * wy[j]) * v;
        }
    }

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(acc);
}
`;var be=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?Br:Gr;let i=e.c/4;this.output=r.tensor(t.outH,t.outW,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,t.outH,t.outW,i,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.outW/8),Math.ceil(t.outH/8),i];}};var Cr=`// Channel concatenation: output = cat(A, B, dim=channel).
// Both A and B must share the same H\xD7W and be in NHWC vec4 format.
// Output layout: for each (y, x), the first a_groups vec4s come from A,
// followed by b_groups vec4s from B.

struct Params {
    height    : u32,
    width     : u32,
    a_groups  : u32,  // Ca / 4
    b_groups  : u32,  // Cb / 4
    out_groups: u32,  // a_groups + b_groups
    _pad0     : u32,
    _pad1     : u32,
    _pad2     : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;  // output channel group

    let W   = params.width;
    let Ag  = params.a_groups;
    let Bg  = params.b_groups;
    let Cg  = params.out_groups;

    if (x >= W || y >= params.height || c >= Cg) {
        return;
    }

    let out_idx = y * W * Cg + x * Cg + c;

    if (c < Ag) {
        output_buf[out_idx] = input_a[y * W * Ag + x * Ag + c];
    } else {
        let c_b = c - Ag;
        output_buf[out_idx] = input_b[y * W * Bg + x * Bg + c_b];
    }
}
`;var Wr=`enable f16;

// Channel concatenation \u2014 full f16 variant.

struct Params {
    height    : u32,
    width     : u32,
    a_groups  : u32,
    b_groups  : u32,
    out_groups: u32,
    _pad0     : u32,
    _pad1     : u32,
    _pad2     : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let c = gid.z;

    let W  = params.width;
    let Ag = params.a_groups;
    let Bg = params.b_groups;
    let Cg = params.out_groups;

    if (x >= W || y >= params.height || c >= Cg) { return; }

    let out_idx = y * W * Cg + x * Cg + c;
    if (c < Ag) {
        output_buf[out_idx] = input_a[y * W * Ag + x * Ag + c];
    } else {
        let c_b = c - Ag;
        output_buf[out_idx] = input_b[y * W * Bg + x * Bg + c_b];
    }
}
`;var ve=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?Wr:Cr;let i=e.c/4,a=t.c/4,o=i+a;this.output=r.tensor(e.h,e.w,e.c+t.c),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,i,a,o,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),o];}};var Ar=`// Conv2d + skip add fused.
// Identical to conv2d.wgsl except skip is an activation input (binding 1),
// added element-wise to the conv result at write time.
// Eliminates the separate add dispatch and its intermediate buffer round-trip.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.out_w || y >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            for (var i = 0u; i < I; i++) {
                let in_idx = in_y * params.in_w * I + in_x * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    } else if (params.activation == 2u) {
        result = max(result, vec4<f32>(0.0));
    }

    let out_idx = y * params.out_w * O + x * O + o;
    output_buf[out_idx] = result + skip_buf[out_idx];
}
`;var Sr=`enable f16;

// Conv2d + skip add fused \u2014 full f16 variant.

struct Params {
    in_h        : u32,
    in_w        : u32,
    out_h       : u32,
    out_w       : u32,
    in_groups   : u32,
    out_groups  : u32,
    kernel_h    : u32,
    kernel_w    : u32,
    stride      : u32,
    pad_top     : u32,
    pad_left    : u32,
    activation  : u32,
}

// Binding order matches conv2d_add.wgsl: input(0), skip(1), weight(2), bias(3),
// params(4), output(5).
@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.out_w || y >= params.out_h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < params.kernel_h; ky++) {
        for (var kx = 0u; kx < params.kernel_w; kx++) {
            let in_y_s = i32(y * params.stride + ky) - i32(params.pad_top);
            let in_x_s = i32(x * params.stride + kx) - i32(params.pad_left);

            if (in_y_s < 0 || in_x_s < 0 ||
                u32(in_y_s) >= params.in_h || u32(in_x_s) >= params.in_w) {
                continue;
            }

            let in_y = u32(in_y_s);
            let in_x = u32(in_x_s);
            let z    = ky * params.kernel_w + kx;

            for (var i = 0u; i < I; i++) {
                let in_idx = in_y * params.in_w * I + in_x * I + i;
                let w_idx  = z * O * I + o * I + i;
                result += weight_buf[w_idx] * input_buf[in_idx];
            }
        }
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    } else if (params.activation == 2u) {
        result = max(result, vec4<f16>(0.0h));
    }

    let out_idx = y * params.out_w * O + x * O + o;
    output_buf[out_idx] = result + skip_buf[out_idx];
}
`;var _e=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?Sr:Ar;let o=W(e.h,a.kernel,a.stride,a.padding),s=W(e.w,a.kernel,a.stride,a.padding),u=e.c/4,p=a.outChannels/4,l=A(a.padding,e.h,o,a.kernel,a.stride),d=A(a.padding,e.w,s,a.kernel,a.stride);this.output=r.tensor(o,s,a.outChannels),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(f(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,o,s,u,p,a.kernel,a.kernel,a.stride,l,d,a.activation==="relu6"?1:0])),this.defaultSetup(),this.dispatch=[Math.ceil(s/8),Math.ceil(o/8),p];}};var Or=`// proj_residual: bespoke 1\xD71 conv (no activation) + residual add, fused.
// Specializes conv2d_add to kernel=1 / stride=1 / pad=0 / no activation: drops
// the kernel loop, the padding checks, and the activation branch. Used by the
// MBConv project+residual tail. Both inputs share the same spatial resolution.
//
// Weight layout: [out_groups][in_groups] mat4x4 (no K*K dim since K=1).
// Bias: [out_groups] vec4.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    in_groups  : u32,
    out_groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.w || y >= params.h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let pix = y * params.w + x;

    var result = bias_buf[o];
    for (var i = 0u; i < I; i++) {
        result += weight_buf[o * I + i] * input_buf[pix * I + i];
    }
    result += skip_buf[pix * O + o];

    output_buf[pix * O + o] = result;
}
`;var zr=`enable f16;

// proj_residual \u2014 full f16 variant. See proj_residual.wgsl for layout details.
// Bespoke 1\xD71 conv (no activation) + residual add, fused.
// Binding order: input(0), skip(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    in_groups  : u32,
    out_groups : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       skip_buf   : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let o = gid.z;

    if (x >= params.w || y >= params.h || o >= params.out_groups) {
        return;
    }

    let I = params.in_groups;
    let O = params.out_groups;
    let pix = y * params.w + x;

    var result = bias_buf[o];
    for (var i = 0u; i < I; i++) {
        result += weight_buf[o * I + i] * input_buf[pix * I + i];
    }
    result += skip_buf[pix * O + o];

    output_buf[pix * O + o] = result;
}
`;var ye=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?zr:Or;let o=e.c/4,s=a.outChannels/4;this.output=r.tensor(e.h,e.w,a.outChannels),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(f(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,o,s])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),s];}};var Ir=`// concat_conv2d: fuses [concat(a, b) \u2192 conv 3\xD73 (pad 1) \u2192 relu6] into one
// dispatch. Both inputs are already at the output resolution (the upstream
// upsample stays a separate dispatch writing a clean intermediate, so the conv
// reads are plain-indexed). Identical math to conv2d; the only difference is
// that input channels are split across two buffers: weight cols [0, a_groups)
// read a, [a_groups, I) read b.
//
// Weight layout matches conv2d: [kpos][out_groups][in_groups] mat4x4, where
// in_groups = a_groups + b_groups and the input channel order is [a, b].
// Binding order: a(0), b(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,   // a, b and output all share this shape
    w          : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
    _pad1      : u32,
    _pad2      : u32,
}

@group(0) @binding(0) var<storage, read>       buf_a      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       buf_b      : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             p          : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y; let o = gid.z;
    if (x >= p.w || y >= p.h || o >= p.out_groups) { return; }

    let A = p.a_groups;
    let B = p.b_groups;
    let I = A + B;
    let O = p.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let nx = i32(x + kx) - 1;
            let ny = i32(y + ky) - 1;
            if (nx < 0 || ny < 0 || u32(nx) >= p.w || u32(ny) >= p.h) { continue; }
            let z   = ky * 3u + kx;
            let pix = u32(ny) * p.w + u32(nx);
            for (var i = 0u; i < A; i++) {
                result += weight_buf[z * O * I + o * I + i] * buf_a[pix * A + i];
            }
            for (var i = 0u; i < B; i++) {
                result += weight_buf[z * O * I + o * I + (A + i)] * buf_b[pix * B + i];
            }
        }
    }

    result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    output_buf[(y * p.w + x) * O + o] = result;
}
`;var Mr=`enable f16;

// concat_conv2d \u2014 full f16 variant. See concat_conv2d.wgsl for layout details.
// Fuses [concat(a, b) \u2192 conv 3\xD73 (pad 1) \u2192 relu6] into one dispatch.
// Binding order: a(0), b(1), weights(2), bias(3), params(4), output(5)

struct Params {
    h          : u32,
    w          : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
    _pad1      : u32,
    _pad2      : u32,
}

@group(0) @binding(0) var<storage, read>       buf_a      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       buf_b      : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             p          : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y; let o = gid.z;
    if (x >= p.w || y >= p.h || o >= p.out_groups) { return; }

    let A = p.a_groups;
    let B = p.b_groups;
    let I = A + B;
    let O = p.out_groups;

    var result = bias_buf[o];

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let nx = i32(x + kx) - 1;
            let ny = i32(y + ky) - 1;
            if (nx < 0 || ny < 0 || u32(nx) >= p.w || u32(ny) >= p.h) { continue; }
            let z   = ky * 3u + kx;
            let pix = u32(ny) * p.w + u32(nx);
            for (var i = 0u; i < A; i++) {
                result += weight_buf[z * O * I + o * I + i] * buf_a[pix * A + i];
            }
            for (var i = 0u; i < B; i++) {
                result += weight_buf[z * O * I + o * I + (A + i)] * buf_b[pix * B + i];
            }
        }
    }

    result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    output_buf[(y * p.w + x) * O + o] = result;
}
`;var xe=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?Mr:Ir;let o=e.c/4,s=t.c/4,u=a.outChannels/4;this.output=r.tensor(e.h,e.w,a.outChannels),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(f(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,o,s,u,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),u];}};var Fr=`// gates_fused: ConvGRU z + r gates, fused into one dispatch.
// Production config (c_up=2, split_ratio=0.5 \u2192 passthrough=1, recurrent=1):
//   u_in   : c_up=2 packed in a vec4 (.x = passthrough a, .y = recurrent b)
//   h_prev : hidden carrier \u2014 recurrent state in .z (see cand_update_fused: the
//            GRU output tensor doubles as next frame's h_prev, hidden in .z)
// Weight: 9 vec4 per kpos = (z_w_b, z_w_h, r_w_b, r_w_h). Bias .xy = (z, r).
// Output: vec4(z, r, 0, 0) \u2014 consumed by cand_update_fused.
// Binding order: u_in(0), h_prev(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf   : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f32>>;   // 9 vec4
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy = (z, r)
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    let bias = bias_buf[0].xy;
    var z_pre = bias.x;
    var r_pre = bias.y;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let w    = weight_buf[kpos];
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    let z = 1.0 / (1.0 + exp(-z_pre));
    let r = 1.0 / (1.0 + exp(-r_pre));
    output_buf[y * params.w + x] = vec4<f32>(z, r, 0.0, 0.0);
}
`;var Dr=`enable f16;

// gates_fused \u2014 full f16 variant. See gates_fused.wgsl for layout details.
// ConvGRU z + r gates (production config c_up=2, recurrent=1).
// Binding order: u_in(0), h_prev(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf   : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    let bias = bias_buf[0].xy;
    var z_pre = bias.x;
    var r_pre = bias.y;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let w    = weight_buf[kpos];
            z_pre += w.x * b_n + w.y * h_n;
            r_pre += w.z * b_n + w.w * h_n;
        }
    }

    let z = 1.0h / (1.0h + exp(-z_pre));
    let r = 1.0h / (1.0h + exp(-r_pre));
    output_buf[y * params.w + x] = vec4<f16>(z, r, 0.0h, 0.0h);
}
`;var we=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?Dr:Fr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(x(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var Er=`// cand_update_fused: ConvGRU candidate path + state update + output, fused.
// Production config (c_up=2, recurrent=1):
//   u_in      : c_up=2 (.x = a passthrough, .y = b recurrent)
//   h_prev    : hidden carrier \u2014 recurrent state in .z (the previous frame's
//               output of THIS op; on frame 0 it is a zero tensor)
//   gates_out : (.x = z, .y = r) from gates_fused
// cand_pre = bias + \u03A3_kpos (b_w*b_n + rh_w*(r_n*h_n));  h_til = tanh(cand_pre);
//   h_new = (1-z)*h_prev + z*h_til;  b_out = b + gamma*h_new.
// Output: vec4(a, b_out, h_new, 0) \u2014 .xy is the c_up=2 feature consumed
// downstream; .z carries h_new so the same tensor is fed back as next h_prev
// (no separate hidden-state buffer). Cand weight: 9 vec4 per kpos, .xy = (b_w, rh_w).
// Binding order: u_in(0), h_prev(1), gates_out(2), weight(3), bias(4), gamma(5), params(6), output(7)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf    : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       gates_out_buf : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read>       weight_buf    : array<vec4<f32>>;   // 9 vec4
@group(0) @binding(4) var<storage, read>       bias_buf      : array<vec4<f32>>;   // .x = cand_bias
@group(0) @binding(5) var<storage, read>       gamma_buf     : array<vec4<f32>>;   // .x = gamma
@group(0) @binding(6) var<uniform>             params        : Params;
@group(0) @binding(7) var<storage, read_write> output_buf    : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var cand_pre = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let r_n  = gates_out_buf[idx].y;
            let w    = weight_buf[kpos].xy;
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    let h_til      = tanh(cand_pre);
    let cur        = y * params.w + x;
    let u_cur      = u_in_buf[cur];
    let z_cur      = gates_out_buf[cur].x;
    let h_prev_cur = h_prev_buf[cur].z;
    let h_new      = (1.0 - z_cur) * h_prev_cur + z_cur * h_til;
    let b_out      = u_cur.y + gamma_buf[0].x * h_new;
    output_buf[cur] = vec4<f32>(u_cur.x, b_out, h_new, 0.0);
}
`;var Lr=`enable f16;

// cand_update_fused \u2014 full f16 variant. See cand_update_fused.wgsl for details.
// ConvGRU candidate + state update + output (production config c_up=2, recurrent=1).
// Binding order: u_in(0), h_prev(1), gates_out(2), weight(3), bias(4), gamma(5), params(6), output(7)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_in_buf      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       h_prev_buf    : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       gates_out_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       weight_buf    : array<vec4<f16>>;
@group(0) @binding(4) var<storage, read>       bias_buf      : array<vec4<f16>>;
@group(0) @binding(5) var<storage, read>       gamma_buf     : array<vec4<f16>>;
@group(0) @binding(6) var<uniform>             params        : Params;
@group(0) @binding(7) var<storage, read_write> output_buf    : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var cand_pre = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let idx  = u32(iy) * params.w + u32(ix);
            let b_n  = u_in_buf[idx].y;
            let h_n  = h_prev_buf[idx].z;
            let r_n  = gates_out_buf[idx].y;
            let w    = weight_buf[kpos].xy;
            cand_pre += w.x * b_n + w.y * (r_n * h_n);
        }
    }

    let h_til      = tanh(cand_pre);
    let cur        = y * params.w + x;
    let u_cur      = u_in_buf[cur];
    let z_cur      = gates_out_buf[cur].x;
    let h_prev_cur = h_prev_buf[cur].z;
    let h_new      = (1.0h - z_cur) * h_prev_cur + z_cur * h_til;
    let b_out      = u_cur.y + gamma_buf[0].x * h_new;
    output_buf[cur] = vec4<f16>(u_cur.x, b_out, h_new, 0.0h);
}
`;var ke=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a,o){super(r),this.shader=r.dtype==="f16"?Lr:Er,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t,i],this.weights=[r.upload(f(a.weights)),r.upload(x(a.bias)),r.upload(x(o))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var Hr=`// conv_expand: bespoke N\u21922 conv 3\xD73 (pad 1) + relu (wrapper expand_feat).
// Expands feat_lr (in_c, mult of 4) to the c_up=2 carrier \u2014 output .xy = the 2
// native channels, .zw = 0. mat4x2 per (kpos, in_group) with a vec2 accumulator.
// Weight: 9 * in_groups mat4x2 (8 floats each, col-major). Bias .xy.
// Binding order: input(0), weights(1), bias(2), params(3), output(4)

struct Params { h: u32, w: u32, in_groups: u32, _pad: u32 }

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x2<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy used
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    let I = params.in_groups;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = (u32(iy) * params.w + u32(ix)) * I + i;
                result += weight_buf[kpos * I + i] * input_buf[in_idx];
            }
        }
    }

    result = max(result, vec2<f32>(0.0));   // expand_feat is F.relu
    output_buf[y * params.w + x] = vec4<f32>(result, 0.0, 0.0);
}
`;var Rr=`enable f16;

// conv_expand \u2014 full f16 variant. See conv_expand.wgsl for layout details.
// Bespoke N\u21922 conv 3\xD73 (pad 1) + relu (wrapper expand_feat).
// Binding order: input(0), weights(1), bias(2), params(3), output(4)

struct Params { h: u32, w: u32, in_groups: u32, _pad: u32 }

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x2<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    let I = params.in_groups;

    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            for (var i = 0u; i < I; i++) {
                let in_idx = (u32(iy) * params.w + u32(ix)) * I + i;
                result += weight_buf[kpos * I + i] * input_buf[in_idx];
            }
        }
    }

    result = max(result, vec2<f16>(0.0h));
    output_buf[y * params.w + x] = vec4<f16>(result, 0.0h, 0.0h);
}
`;var Pe=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?Rr:Hr;let i=e.c/4;this.output=r.tensor(e.h,e.w,4),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(x(t.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,i,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var Vr=`// cat_conv_6to2: fused concat(u, d) + 6\u21922 conv 3\xD73 (pad 1) + relu (E up1_combine).
// u = c_up=2 carrier (.xy); d = c_high=4 (full vec4). Both same resolution.
// Channel order concat([u, d]) = (u.x, u.y, d.x, d.y, d.z, d.w), split into
//   v3a = (u.x, u.y, d.x)   v3b = d.yzw
// Weight: 9 * 2 mat3x2 (6 floats each, col-major). Bias .xy. Output c_up=2 carrier.
// Binding order: u(0), d(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_buf      : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       d_buf      : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat3x2<f32>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .xy used
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let pix = u32(iy) * params.w + u32(ix);
            let u = u_buf[pix];
            let d = d_buf[pix];
            let v3a = vec3<f32>(u.xy, d.x);
            let v3b = d.yzw;
            result += weight_buf[kpos * 2u + 0u] * v3a;
            result += weight_buf[kpos * 2u + 1u] * v3b;
        }
    }

    result = max(result, vec2<f32>(0.0));   // up1_combine is F.relu
    output_buf[y * params.w + x] = vec4<f32>(result, 0.0, 0.0);
}
`;var Nr=`enable f16;

// cat_conv_6to2 \u2014 full f16 variant. See cat_conv_6to2.wgsl for layout details.
// Fused concat(u, d) + 6\u21922 conv 3\xD73 (pad 1) + relu (E up1_combine).
// Binding order: u(0), d(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_buf      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       d_buf      : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<mat3x2<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var result = bias_buf[0].xy;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let pix = u32(iy) * params.w + u32(ix);
            let u = u_buf[pix];
            let d = d_buf[pix];
            let v3a = vec3<f16>(u.xy, d.x);
            let v3b = d.yzw;
            result += weight_buf[kpos * 2u + 0u] * v3a;
            result += weight_buf[kpos * 2u + 1u] * v3b;
        }
    }

    result = max(result, vec2<f16>(0.0h));
    output_buf[y * params.w + x] = vec4<f16>(result, 0.0h, 0.0h);
}
`;var Te=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?Nr:Vr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(x(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var qr=`// down_adapter: fused stride-N 3\xD73 conv (4\u21924) + relu + 1\xD71 adapter (4\u21923, no
// act) into one dispatch. E variant: down2 (c_high=4 \u2192 c_low=4, stride 2) +
// adapter. A/B variant: down1 (RGB .xyz \u2192 4, stride 2/3) + adapter (the down
// weight's 4th input column is zeroed at export for RGB input). Symmetric pad.
//
// down_w: 9 mat4x4 (3\xD73, 4\u21924). adapt_w: 1 mat4x4 (1\xD71, 4\u21924 padded from 4\u21923,
// last row 0). adapt_b: .xyz used. Output: vec4(adapter.xyz, 0).
// Binding order: input(0), down_w(1), down_b(2), adapt_w(3), adapt_b(4), params(5), output(6)

struct Params {
    in_h     : u32,
    in_w     : u32,
    out_h    : u32,
    out_w    : u32,
    stride   : u32,
    pad_top  : u32,
    pad_left : u32,
    _pad     : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       down_w     : array<mat4x4<f32>>;   // 9 mat4x4
@group(0) @binding(2) var<storage, read>       down_b     : array<vec4<f32>>;     // 1 vec4
@group(0) @binding(3) var<storage, read>       adapt_w    : array<mat4x4<f32>>;   // 1 mat4x4
@group(0) @binding(4) var<storage, read>       adapt_b    : array<vec4<f32>>;     // .xyz used
@group(0) @binding(5) var<uniform>             p          : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= p.out_w || y >= p.out_h) { return; }

    var down_out = down_b[0];
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y * p.stride + ky) - i32(p.pad_top);
            let ix = i32(x * p.stride + kx) - i32(p.pad_left);
            if (iy < 0 || ix < 0 || u32(iy) >= p.in_h || u32(ix) >= p.in_w) { continue; }
            let kpos = ky * 3u + kx;
            down_out += down_w[kpos] * input_buf[u32(iy) * p.in_w + u32(ix)];
        }
    }
    down_out = max(down_out, vec4<f32>(0.0));   // F.relu

    let adapt_out = adapt_w[0] * down_out + adapt_b[0];
    output_buf[y * p.out_w + x] = vec4<f32>(adapt_out.xyz, 0.0);
}
`;var jr=`enable f16;

// down_adapter \u2014 full f16 variant. See down_adapter.wgsl for layout details.
// Fused stride-N 3\xD73 conv (4\u21924) + relu + 1\xD71 adapter (4\u21923, no act).
// Binding order: input(0), down_w(1), down_b(2), adapt_w(3), adapt_b(4), params(5), output(6)

struct Params {
    in_h     : u32,
    in_w     : u32,
    out_h    : u32,
    out_w    : u32,
    stride   : u32,
    pad_top  : u32,
    pad_left : u32,
    _pad     : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       down_w     : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       down_b     : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       adapt_w    : array<mat4x4<f16>>;
@group(0) @binding(4) var<storage, read>       adapt_b    : array<vec4<f16>>;
@group(0) @binding(5) var<uniform>             p          : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= p.out_w || y >= p.out_h) { return; }

    var down_out = down_b[0];
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y * p.stride + ky) - i32(p.pad_top);
            let ix = i32(x * p.stride + kx) - i32(p.pad_left);
            if (iy < 0 || ix < 0 || u32(iy) >= p.in_h || u32(ix) >= p.in_w) { continue; }
            let kpos = ky * 3u + kx;
            down_out += down_w[kpos] * input_buf[u32(iy) * p.in_w + u32(ix)];
        }
    }
    down_out = max(down_out, vec4<f16>(0.0h));

    let adapt_out = adapt_w[0] * down_out + adapt_b[0];
    output_buf[y * p.out_w + x] = vec4<f16>(adapt_out.xyz, 0.0h);
}
`;var Ue=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?jr:qr;let o=W(e.h,3,a.stride,1),s=W(e.w,3,a.stride,1),u=A(1,e.h,o,3,a.stride),p=A(1,e.w,s,3,a.stride);this.output=r.tensor(o,s,4),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(x(t.bias)),r.upload(f(i.weights)),r.upload(x(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,o,s,a.stride,u,p,0])),this.defaultSetup(),this.dispatch=[Math.ceil(s/8),Math.ceil(o/8),1];}};var Xr=`// up_final: fused concat(u, rgb) \u2192 conv 3\xD73 5\u21921 \u2192 sigmoid (A/B alpha head).
// u = c_up=2 carrier (.xy); rgb = x_hr (.xyz). 5 inputs \u2192 1 alpha (output .x).
// Weight: 18 vec4 \u2014 [0..8] = (w0, w1, 0, 0) for u per kpos; [9..17] =
// (w2, w3, w4, 0) for rgb per kpos. Bias .x.
// Binding order: u(0), rgb(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f32>>;   // .xy
@group(0) @binding(1) var<storage, read>       rgb        : array<vec4<f32>>;   // .xyz
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f32>>;   // 18 vec4
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .x
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f32>>;   // .x = alpha

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos].xy,       u_gru[p].xy);
            acc += dot(weight_buf[9u + kpos].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f32>(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
`;var $r=`enable f16;

// up_final \u2014 full f16 variant. See up_final.wgsl for layout details.
// Fused concat(u, rgb) \u2192 conv 3\xD73 5\u21921 \u2192 sigmoid (A/B alpha head).
// Binding order: u(0), rgb(1), weights(2), bias(3), params(4), output(5)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       rgb        : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(4) var<uniform>             params     : Params;
@group(0) @binding(5) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos].xy,       u_gru[p].xy);
            acc += dot(weight_buf[9u + kpos].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f16>(1.0h / (1.0h + exp(-acc)), 0.0h, 0.0h, 0.0h);
}
`;var Ge=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?$r:Xr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t],this.weights=[r.upload(f(i.weights)),r.upload(x(i.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var Kr=`// up_final_skip: C/D alpha head. Fused concat(u, d_full, rgb) \u2192 conv 3\xD73 9\u21921
// \u2192 sigmoid. u = c_up=2 (.xy); d_full = c_high=4 full-res skip (full vec4);
// rgb = x_hr (.xyz). Channel order concat = 2 + 4 + 3 = 9. Output .x = alpha.
// Weight: 27 vec4 (3 per kpos): [kpos*3+0]=(w0,w1,0,0) u; [kpos*3+1]=(w2..w5)
// d_full; [kpos*3+2]=(w6,w7,w8,0) rgb. Bias .x.
// Binding order: u(0), d_full(1), rgb(2), weights(3), bias(4), params(5), output(6)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f32>>;   // .xy
@group(0) @binding(1) var<storage, read>       d_full     : array<vec4<f32>>;   // full vec4
@group(0) @binding(2) var<storage, read>       rgb        : array<vec4<f32>>;   // .xyz
@group(0) @binding(3) var<storage, read>       weight_buf : array<vec4<f32>>;   // 27 vec4
@group(0) @binding(4) var<storage, read>       bias_buf   : array<vec4<f32>>;   // .x
@group(0) @binding(5) var<uniform>             params     : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos * 3u + 0u].xy,  u_gru[p].xy);
            acc += dot(weight_buf[kpos * 3u + 1u],     d_full[p]);
            acc += dot(weight_buf[kpos * 3u + 2u].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f32>(1.0 / (1.0 + exp(-acc)), 0.0, 0.0, 0.0);
}
`;var Yr=`enable f16;

// up_final_skip \u2014 full f16 variant. See up_final_skip.wgsl for layout details.
// C/D alpha head: fused concat(u, d_full, rgb) \u2192 conv 3\xD73 9\u21921 \u2192 sigmoid.
// Binding order: u(0), d_full(1), rgb(2), weights(3), bias(4), params(5), output(6)

struct Params { h: u32, w: u32, _pad0: u32, _pad1: u32 }

@group(0) @binding(0) var<storage, read>       u_gru      : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       d_full     : array<vec4<f16>>;
@group(0) @binding(2) var<storage, read>       rgb        : array<vec4<f16>>;
@group(0) @binding(3) var<storage, read>       weight_buf : array<vec4<f16>>;
@group(0) @binding(4) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(5) var<uniform>             params     : Params;
@group(0) @binding(6) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x; let y = gid.y;
    if (x >= params.w || y >= params.h) { return; }

    var acc = bias_buf[0].x;
    for (var ky = 0u; ky < 3u; ky++) {
        for (var kx = 0u; kx < 3u; kx++) {
            let iy = i32(y + ky) - 1; let ix = i32(x + kx) - 1;
            if (iy < 0 || ix < 0 || u32(iy) >= params.h || u32(ix) >= params.w) { continue; }
            let kpos = ky * 3u + kx;
            let p = u32(iy) * params.w + u32(ix);
            acc += dot(weight_buf[kpos * 3u + 0u].xy,  u_gru[p].xy);
            acc += dot(weight_buf[kpos * 3u + 1u],     d_full[p]);
            acc += dot(weight_buf[kpos * 3u + 2u].xyz, rgb[p].xyz);
        }
    }

    output_buf[y * params.w + x] = vec4<f16>(1.0h / (1.0h + exp(-acc)), 0.0h, 0.0h, 0.0h);
}
`;var Be=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i,a){super(r),this.shader=r.dtype==="f16"?Yr:Kr,this.output=r.tensor(e.h,e.w,4),this.inputs=[e,t,i],this.weights=[r.upload(f(a.weights)),r.upload(x(a.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(e.w/8),Math.ceil(e.h/8),1];}};var Qr=`// Bilinear upsample + channel concat fused.
// input_a is the decoder tensor at small spatial resolution (in_h \xD7 in_w).
// input_b is the encoder skip feature already at output resolution (out_h \xD7 out_w).
// For output channels 0..a_groups-1: bilinearly interpolate from input_a.
// For output channels a_groups..out_groups-1: copy directly from input_b.
// Eliminates the intermediate upsample buffer and the separate concat dispatch.

struct Params {
    in_h       : u32,   // input_a spatial height
    in_w       : u32,   // input_a spatial width
    out_h      : u32,
    out_w      : u32,
    a_groups   : u32,   // input_a channel groups (upsampled)
    b_groups   : u32,   // input_b channel groups (encoder feature)
    out_groups : u32,   // a_groups + b_groups
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.out_groups) { return; }

    let out_idx = oy * params.out_w * params.out_groups + ox * params.out_groups + c;

    if (c < params.a_groups) {
        let IH = params.in_h;
        let IW = params.in_w;
        let AG = params.a_groups;

        let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
        let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

        let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
        let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
        let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
        let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

        let wx = src_x - floor(src_x);
        let wy = src_y - floor(src_y);

        let tl = input_a[y0 * IW * AG + x0 * AG + c];
        let tr = input_a[y0 * IW * AG + x1 * AG + c];
        let bl = input_a[y1 * IW * AG + x0 * AG + c];
        let br = input_a[y1 * IW * AG + x1 * AG + c];

        output_buf[out_idx] = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                            +        wy  * ((1.0 - wx) * bl + wx * br);
    } else {
        let c_b = c - params.a_groups;
        output_buf[out_idx] = input_b[oy * params.out_w * params.b_groups + ox * params.b_groups + c_b];
    }
}
`;var Jr=`enable f16;

// Bilinear upsample + channel concat fused \u2014 full f16 variant.
// Bilinear weights (wx, wy) and intermediate blends computed in f32; result cast to f16.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    a_groups   : u32,
    b_groups   : u32,
    out_groups : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_a    : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       input_b    : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.out_groups) { return; }

    let out_idx = oy * params.out_w * params.out_groups + ox * params.out_groups + c;

    if (c < params.a_groups) {
        let IH = params.in_h;
        let IW = params.in_w;
        let AG = params.a_groups;

        let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
        let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

        let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
        let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
        let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
        let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

        let wx = src_x - floor(src_x);
        let wy = src_y - floor(src_y);

        let tl = vec4<f32>(input_a[y0 * IW * AG + x0 * AG + c]);
        let tr = vec4<f32>(input_a[y0 * IW * AG + x1 * AG + c]);
        let bl = vec4<f32>(input_a[y1 * IW * AG + x0 * AG + c]);
        let br = vec4<f32>(input_a[y1 * IW * AG + x1 * AG + c]);

        let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                   +        wy  * ((1.0 - wx) * bl + wx * br);
        output_buf[out_idx] = vec4<f16>(result);
    } else {
        let c_b = c - params.a_groups;
        output_buf[out_idx] = input_b[oy * params.out_w * params.b_groups + ox * params.b_groups + c_b];
    }
}
`;var Ce=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?Jr:Qr;let a=e.c/4,o=t.c/4,s=a+o;this.output=r.tensor(i.outH,i.outW,e.c+t.c),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,i.outH,i.outW,a,o,s,0])),this.defaultSetup(),this.dispatch=[Math.ceil(i.outW/8),Math.ceil(i.outH/8),s];}};var Zr=`// Bilinear upsample + 1\xD71 pointwise conv fused.
// For each output pixel, bilinearly samples the small input for each in_group,
// immediately applies the 1\xD71 conv weights, and writes the activated result.
// Eliminates the intermediate full-resolution upsample buffer.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    activation : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f32>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let og = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || og >= params.out_groups) { return; }

    let IH = params.in_h;
    let IW = params.in_w;
    let IG = params.in_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    var result = bias_buf[og];

    for (var ig = 0u; ig < IG; ig++) {
        let tl = input_buf[y0 * IW * IG + x0 * IG + ig];
        let tr = input_buf[y0 * IW * IG + x1 * IG + ig];
        let bl = input_buf[y1 * IW * IG + x0 * IG + ig];
        let br = input_buf[y1 * IW * IG + x1 * IG + ig];

        let sampled = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                    +        wy  * ((1.0 - wx) * bl + wx * br);

        result += weight_buf[og * IG + ig] * sampled;
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f32>(0.0), vec4<f32>(6.0));
    } else if (params.activation == 2u) {
        result = result * clamp(result + 3.0, vec4<f32>(0.0), vec4<f32>(6.0)) / 6.0;
    }

    output_buf[oy * params.out_w * params.out_groups + ox * params.out_groups + og] = result;
}
`;var et=`enable f16;

// Bilinear upsample + 1\xD71 pointwise conv fused \u2014 full f16 variant.
// Bilinear weights and intermediate blends computed in f32; conv accumulation in f16.

struct Params {
    in_h       : u32,
    in_w       : u32,
    out_h      : u32,
    out_w      : u32,
    in_groups  : u32,
    out_groups : u32,
    activation : u32,
    _pad0      : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       weight_buf : array<mat4x4<f16>>;
@group(0) @binding(2) var<storage, read>       bias_buf   : array<vec4<f16>>;
@group(0) @binding(3) var<uniform>             params     : Params;
@group(0) @binding(4) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let og = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || og >= params.out_groups) { return; }

    let IH = params.in_h;
    let IW = params.in_w;
    let IG = params.in_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    var result = bias_buf[og];

    for (var ig = 0u; ig < IG; ig++) {
        let tl = vec4<f32>(input_buf[y0 * IW * IG + x0 * IG + ig]);
        let tr = vec4<f32>(input_buf[y0 * IW * IG + x1 * IG + ig]);
        let bl = vec4<f32>(input_buf[y1 * IW * IG + x0 * IG + ig]);
        let br = vec4<f32>(input_buf[y1 * IW * IG + x1 * IG + ig]);

        let sampled = vec4<f16>((1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
                              +        wy  * ((1.0 - wx) * bl + wx * br));

        result += weight_buf[og * IG + ig] * sampled;
    }

    if (params.activation == 1u) {
        result = clamp(result, vec4<f16>(0.0h), vec4<f16>(6.0h));
    } else if (params.activation == 2u) {
        result = result * clamp(result + 3.0h, vec4<f16>(0.0h), vec4<f16>(6.0h)) / 6.0h;
    }

    output_buf[oy * params.out_w * params.out_groups + ox * params.out_groups + og] = result;
}
`;var We=class extends c{inputs;weights;output;dispatch;shader;constructor(r,e,t,i){super(r),this.shader=r.dtype==="f16"?et:Zr;let a=e.c/4,o=i.outChannels/4;this.output=r.tensor(i.outH,i.outW,i.outChannels),this.inputs=[e],this.weights=[r.upload(f(t.weights)),r.upload(f(t.bias))],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,i.outH,i.outW,a,o,i.activation==="relu6"?1:0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(i.outW/8),Math.ceil(i.outH/8),o];}};var rt=`// Bilinear upsample + sigmoid fused.
// Identical to bilinear_upsample.wgsl except sigmoid is applied at write time.
// Eliminates the intermediate full-resolution buffer and the separate sigmoid dispatch.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = input_buf[y0 * IW * C + x0 * C + c];
    let tr = input_buf[y0 * IW * C + x1 * C + c];
    let bl = input_buf[y1 * IW * C + x0 * C + c];
    let br = input_buf[y1 * IW * C + x1 * C + c];

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = 1.0 / (1.0 + exp(-result));
}
`;var tt=`enable f16;

// Bilinear upsample + sigmoid fused \u2014 full f16 variant.
// Interpolation computed in f32 for accuracy; sigmoid and result cast to f16.

struct Params {
    in_h           : u32,
    in_w           : u32,
    out_h          : u32,
    out_w          : u32,
    channel_groups : u32,
    _pad0          : u32,
    _pad1          : u32,
    _pad2          : u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ox = gid.x;
    let oy = gid.y;
    let c  = gid.z;

    if (ox >= params.out_w || oy >= params.out_h || c >= params.channel_groups) {
        return;
    }

    let IH = params.in_h;
    let IW = params.in_w;
    let C  = params.channel_groups;

    let src_x = (f32(ox) + 0.5) * (f32(IW) / f32(params.out_w)) - 0.5;
    let src_y = (f32(oy) + 0.5) * (f32(IH) / f32(params.out_h)) - 0.5;

    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(IW) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(IW) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(IH) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(IH) - 1));

    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec4<f32>(input_buf[y0 * IW * C + x0 * C + c]);
    let tr = vec4<f32>(input_buf[y0 * IW * C + x1 * C + c]);
    let bl = vec4<f32>(input_buf[y1 * IW * C + x0 * C + c]);
    let br = vec4<f32>(input_buf[y1 * IW * C + x1 * C + c]);

    let result = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
               +        wy  * ((1.0 - wx) * bl + wx * br);

    output_buf[oy * params.out_w * C + ox * C + c] = vec4<f16>(1.0 / (1.0 + exp(-result)));
}
`;var Ae=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){super(r),this.shader=r.dtype==="f16"?tt:rt;let i=e.c/4;this.output=r.tensor(t.outH,t.outW,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h,e.w,t.outH,t.outW,i,0,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(t.outW/8),Math.ceil(t.outH/8),i];}};var at=`// Composite an RGBA image over a solid background, gated by a 1-ch alpha.
// Fragment writes the canvas's swapchain texture (premultiplied output).
//
// Caller invariants (matched in CompositeSolidWebGPU):
//   - image and alpha are NHWC vec4 storage buffers, same h \xD7 w
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width:    u32,           // image width in pixels (= canvas width)
    _pad0:    u32,
    _pad1:    u32,
    _pad2:    u32,
    bgColor:  vec4<f32>,     // .rgb used; .a ignored
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg = image[i].rgb;
    let a  = alpha[i].r;
    let rgb = fg * a + params.bgColor.rgb * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var it=`enable f16;

// Composite an RGBA image over a solid background, gated by a 1-ch alpha.
// f16 variant: image and alpha are stored as f16; values promote to f32 on
// read and the fragment writes f32 to the canvas swapchain (color attachment
// format is the swapchain's preferred format, always f32-equivalent).
//
// Caller invariants (matched in CompositeSolidWebGPU):
//   - image and alpha are NHWC vec4 storage buffers, same h \xD7 w
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width:    u32,
    _pad0:    u32,
    _pad1:    u32,
    _pad2:    u32,
    bgColor:  vec4<f32>,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg = vec3<f32>(image[i].rgb);
    let a  = f32(alpha[i].r);
    let rgb = fg * a + params.bgColor.rgb * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var Se=class{constructor(r,e,t,i){this.backend=r;if(e.h!==t.h||e.w!==t.w)throw new Error(`CompositeSolid: image (${e.h}\xD7${e.w}) and alpha (${t.h}\xD7${t.w}) must match. Run the upscaler first.`);let a=r.device;this.uniformBuffer=a.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let o=new ArrayBuffer(32);new Uint32Array(o,0,1)[0]=e.w,new Float32Array(o,16,4).set([i[0],i[1],i[2],0]),a.queue.writeBuffer(this.uniformBuffer,0,o);let s=r.dtype==="f16"?it:at,u=a.createShaderModule({code:s});this.pipeline=a.createRenderPipeline({layout:"auto",vertex:{module:u,entryPoint:"vs"},fragment:{module:u,entryPoint:"fs",targets:[{format:r.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=a.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}}]});}backend;pipeline;bindGroup;uniformBuffer;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("CompositeSolidWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.backend.device.createCommandEncoder(),t=e.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),r||this.backend.device.queue.submit([e.finish()]),this.outputView=null;}};var ot=`// Like composite_solid but bg is an NHWC vec4 storage buffer (e.g. virtual
// background image, or a blurred copy of the input).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f32>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg  = image[i].rgb;
    let a   = alpha[i].r;
    let bgc = bg[i].rgb;
    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var st=`enable f16;

// Like composite_solid_f16 but bg is an NHWC vec4<f16> storage buffer (e.g. a
// virtual background image, or a blurred copy of the input).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f16>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;

    let fg  = vec3<f32>(image[i].rgb);
    let a   = f32(alpha[i].r);
    let bgc = vec3<f32>(bg[i].rgb);
    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var Oe=class{constructor(r,e,t,i){this.backend=r;if(e.h!==t.h||e.w!==t.w||e.h!==i.h||e.w!==i.w)throw new Error(`CompositeImage: image (${e.h}\xD7${e.w}), alpha (${t.h}\xD7${t.w}), and bg (${i.h}\xD7${i.w}) must all match. Run upscaler / resizer first.`);let a=r.device;this.uniformBuffer=a.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let o=new ArrayBuffer(16);new Uint32Array(o,0,1)[0]=e.w,a.queue.writeBuffer(this.uniformBuffer,0,o);let s=r.dtype==="f16"?st:ot,u=a.createShaderModule({code:s});this.pipeline=a.createRenderPipeline({layout:"auto",vertex:{module:u,entryPoint:"vs"},fragment:{module:u,entryPoint:"fs",targets:[{format:r.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=a.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:i.buffer}}]});}backend;pipeline;bindGroup;uniformBuffer;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("CompositeImageWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.backend.device.createCommandEncoder(),t=e.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),r||this.backend.device.queue.submit([e.finish()]),this.outputView=null;}};var nt=`// Like composite_image but bg is sampled bilinearly \u2014 bg may be smaller than
// (image, alpha). Used by CompositorBlur to skip the final full-res upsample
// in the blur pyramid and let this shader's own per-pixel scan do the
// expansion (the work is already happening here for the composite anyway).
//
// Layout invariant: image, alpha share output dims (canvas h \xD7 w); bg is
// at a smaller resolution (bg_h \xD7 bg_w). All NHWC vec4 storage buffers,
// channelGroups = 1 (RGB padded to vec4).

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    out_w: u32,
    out_h: u32,
    bg_w:  u32,
    bg_h:  u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f32>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.out_w + x;

    let fg = image[i].rgb;
    let a  = alpha[i].r;

    // Bilinear sample bg at the corresponding location. align_corners=False.
    let src_x = (f32(x) + 0.5) * (f32(params.bg_w) / f32(params.out_w)) - 0.5;
    let src_y = (f32(y) + 0.5) * (f32(params.bg_h) / f32(params.out_h)) - 0.5;
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(params.bg_w) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(params.bg_w) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(params.bg_h) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(params.bg_h) - 1));
    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = bg[y0 * params.bg_w + x0].rgb;
    let tr = bg[y0 * params.bg_w + x1].rgb;
    let bl = bg[y1 * params.bg_w + x0].rgb;
    let br = bg[y1 * params.bg_w + x1].rgb;
    let bgc = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var ut=`enable f16;

// f16 storage variant of composite_image_bilinear. bg is at a smaller
// resolution and is bilinearly sampled to match (image, alpha) at full res.
// Computation in f32; storage in f16.

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    out_w: u32,
    out_h: u32,
    bg_w:  u32,
    bg_h:  u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<storage, read> alpha:  array<vec4<f16>>;
@group(0) @binding(2) var<uniform>       params: Params;
@group(0) @binding(3) var<storage, read> bg:     array<vec4<f16>>;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.out_w + x;

    let fg = vec3<f32>(image[i].rgb);
    let a  = f32(alpha[i].r);

    let src_x = (f32(x) + 0.5) * (f32(params.bg_w) / f32(params.out_w)) - 0.5;
    let src_y = (f32(y) + 0.5) * (f32(params.bg_h) / f32(params.out_h)) - 0.5;
    let x0 = u32(clamp(i32(floor(src_x)),     0, i32(params.bg_w) - 1));
    let x1 = u32(clamp(i32(floor(src_x)) + 1, 0, i32(params.bg_w) - 1));
    let y0 = u32(clamp(i32(floor(src_y)),     0, i32(params.bg_h) - 1));
    let y1 = u32(clamp(i32(floor(src_y)) + 1, 0, i32(params.bg_h) - 1));
    let wx = src_x - floor(src_x);
    let wy = src_y - floor(src_y);

    let tl = vec3<f32>(bg[y0 * params.bg_w + x0].rgb);
    let tr = vec3<f32>(bg[y0 * params.bg_w + x1].rgb);
    let bl = vec3<f32>(bg[y1 * params.bg_w + x0].rgb);
    let br = vec3<f32>(bg[y1 * params.bg_w + x1].rgb);
    let bgc = (1.0 - wy) * ((1.0 - wx) * tl + wx * tr)
            +        wy  * ((1.0 - wx) * bl + wx * br);

    let rgb = fg * a + bgc * (1.0 - a);
    return vec4<f32>(rgb, 1.0);
}
`;var ze=class{constructor(r,e,t,i){this.backend=r;if(e.h!==t.h||e.w!==t.w)throw new Error(`CompositeImageBilinear: image (${e.h}\xD7${e.w}) and alpha (${t.h}\xD7${t.w}) must match.`);let a=r.device;this.uniformBuffer=a.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let o=new ArrayBuffer(16),s=new Uint32Array(o);s[0]=e.w,s[1]=e.h,s[2]=i.w,s[3]=i.h,a.queue.writeBuffer(this.uniformBuffer,0,o);let u=r.dtype==="f16"?ut:nt,p=a.createShaderModule({code:u});this.pipeline=a.createRenderPipeline({layout:"auto",vertex:{module:p,entryPoint:"vs"},fragment:{module:p,entryPoint:"fs",targets:[{format:r.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=a.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.buffer}},{binding:1,resource:{buffer:t.buffer}},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:i.buffer}}]});}backend;pipeline;bindGroup;uniformBuffer;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("CompositeImageBilinearWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.backend.device.createCommandEncoder(),t=e.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),r||this.backend.device.queue.submit([e.finish()]),this.outputView=null;}};var pt=`// Passthrough "compositor" \u2014 writes the image directly to the canvas
// swapchain texture with no alpha math and no background. Used by RenderOp
// when the renderer is in disabled state, so the output canvas reflects
// the unmodified input frame instead of a stale matted result.
//
// Caller invariants (matched in CompositePassthroughWebGPU):
//   - image is an NHWC vec4 storage buffer
//   - canvas.width === image.w, canvas.height === image.h (no resampling)

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f32>>;
@group(0) @binding(1) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;
    return vec4<f32>(image[i].rgb, 1.0);
}
`;var ct=`enable f16;

// Passthrough "compositor" \u2014 f16 variant. Image is stored as f16; values
// promote to f32 on read and the fragment writes f32 to the canvas
// swapchain (color attachment is the swapchain's preferred f32-equivalent
// format). See composite_passthrough.wgsl for the f32 version.

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    let verts = array<vec2<f32>, 6>(
        vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
        vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0),
    );
    var out: VertexOut;
    out.pos = vec4<f32>(verts[vi], 0.0, 1.0);
    return out;
}

struct Params {
    width: u32,
};

@group(0) @binding(0) var<storage, read> image:  array<vec4<f16>>;
@group(0) @binding(1) var<uniform>       params: Params;

@fragment
fn fs(in: VertexOut) -> @location(0) vec4<f32> {
    let x = u32(in.pos.x);
    let y = u32(in.pos.y);
    let i = y * params.width + x;
    return vec4<f32>(vec3<f32>(image[i].rgb), 1.0);
}
`;var Ie=class{constructor(r,e){this.backend=r;let t=r.device;this.uniformBuffer=t.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let i=new ArrayBuffer(16);new Uint32Array(i,0,1)[0]=e.w,t.queue.writeBuffer(this.uniformBuffer,0,i);let a=r.dtype==="f16"?ct:pt,o=t.createShaderModule({code:a});this.pipeline=t.createRenderPipeline({layout:"auto",vertex:{module:o,entryPoint:"vs"},fragment:{module:o,entryPoint:"fs",targets:[{format:r.canvasFormat}]},primitive:{topology:"triangle-list"}}),this.bindGroup=t.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.buffer}},{binding:1,resource:{buffer:this.uniformBuffer}}]});}backend;pipeline;bindGroup;uniformBuffer;outputView=null;setOutput(r){this.outputView=r.createView();}run(){if(!this.outputView)throw new Error("CompositePassthroughWebGPU.run() called before setOutput()");let r=this.backend.batchEncoder(),e=r??this.backend.device.createCommandEncoder(),t=e.beginRenderPass({colorAttachments:[{view:this.outputView,clearValue:[0,0,0,1],loadOp:"clear",storeOp:"store"}]});t.setPipeline(this.pipeline),t.setBindGroup(0,this.bindGroup),t.draw(6),t.end(),r||this.backend.device.queue.submit([e.finish()]),this.outputView=null;}};var lt=`// Input op \u2014 sample a regular 2D source texture (RGBA8 unorm) into the NHWC
// vec4<f32> output buffer at the target resolution. Used for ImageBitmap
// sources, which are uploaded into a persistent staging texture via
// copyExternalImageToTexture before each dispatch.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
}

@group(0) @binding(0) var                       src_tex     : texture_2d<f32>;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let uv = vec2<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
    );
    let rgba = textureSampleLevel(src_tex, src_sampler, uv, 0.0);
    output_buf[y * params.out_w + x] = rgba;
}
`;var ft=`enable f16;

// Input op \u2014 f16 storage variant. Source is sampled as vec4<f32>; only the
// store is demoted to vec4<f16>.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
}

@group(0) @binding(0) var                       src_tex     : texture_2d<f32>;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let uv = vec2<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
    );
    let rgba = textureSampleLevel(src_tex, src_sampler, uv, 0.0);
    output_buf[y * params.out_w + x] = vec4<f16>(rgba);
}
`;var dt=`// Input op \u2014 sample a GPUExternalTexture (zero-copy VideoFrame import) into
// the NHWC vec4<f32> output buffer at the target resolution. Used when the
// caller passes a VideoFrame to setSource(); requires importExternalTexture
// to be called in the same task as the dispatch (the texture is invalidated
// after the current task completes).

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
}

@group(0) @binding(0) var                       src_tex     : texture_external;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let uv = vec2<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
    );
    let rgba = textureSampleBaseClampToEdge(src_tex, src_sampler, uv);
    output_buf[y * params.out_w + x] = rgba;
}
`;var mt=`enable f16;

// Input op \u2014 texture_external + f16 storage. Sample in f32, store as f16.

struct Params {
    out_w : u32,
    out_h : u32,
    _pad0 : u32,
    _pad1 : u32,
}

@group(0) @binding(0) var                       src_tex     : texture_external;
@group(0) @binding(1) var                       src_sampler : sampler;
@group(0) @binding(2) var<uniform>              params      : Params;
@group(0) @binding(3) var<storage, read_write>  output_buf  : array<vec4<f16>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if (x >= params.out_w || y >= params.out_h) { return; }

    let uv = vec2<f32>(
        (f32(x) + 0.5) / f32(params.out_w),
        (f32(y) + 0.5) / f32(params.out_h),
    );
    let rgba = textureSampleBaseClampToEdge(src_tex, src_sampler, uv);
    output_buf[y * params.out_w + x] = vec4<f16>(rgba);
}
`;var Xa=n=>typeof VideoFrame<"u"&&n instanceof VideoFrame,Me=class{output;backend;device;dtype;sampler;uniformBuffer;dispatch;pipeline2d=null;pipelineExternal=null;stagingTex=null;stagingW=0;stagingH=0;source=null;constructor(r,e,t){this.backend=r,this.device=r.device,this.dtype=r.dtype,this.output=r.tensor(e,t,4),this.sampler=this.device.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),this.uniformBuffer=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});let i=new ArrayBuffer(16);new Uint32Array(i,0,2).set([t,e]),this.device.queue.writeBuffer(this.uniformBuffer,0,i),this.dispatch=[Math.ceil(t/8),Math.ceil(e/8),1],this.pipeline2d=this.buildPipeline(this.dtype==="f16"?ft:lt);}setSource(r){this.source=r;}run(){if(!this.source)throw new Error("InputWebGPU.run() called before setSource()");Xa(this.source)?this.runExternal(this.source):this.run2d(this.source);}run2d(r){this.ensureStagingTexture(r.width,r.height),this.backend.flush(),this.device.queue.copyExternalImageToTexture({source:r,flipY:false},{texture:this.stagingTex},[r.width,r.height]);let e=this.device.createBindGroup({layout:this.pipeline2d.getBindGroupLayout(0),entries:[{binding:0,resource:this.stagingTex.createView()},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:this.output.buffer}}]});this.dispatchOnce(this.pipeline2d,e);}runExternal(r){this.pipelineExternal||(this.pipelineExternal=this.buildPipeline(this.dtype==="f16"?mt:dt));let e=this.device.importExternalTexture({source:r}),t=this.device.createBindGroup({layout:this.pipelineExternal.getBindGroupLayout(0),entries:[{binding:0,resource:e},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniformBuffer}},{binding:3,resource:{buffer:this.output.buffer}}]});this.dispatchOnce(this.pipelineExternal,t);}ensureStagingTexture(r,e){this.stagingTex&&this.stagingW===r&&this.stagingH===e||(this.stagingTex?.destroy(),this.stagingTex=this.device.createTexture({size:[r,e,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),this.stagingW=r,this.stagingH=e);}buildPipeline(r){let e=this.device.createShaderModule({code:r});return this.device.createComputePipeline({layout:"auto",compute:{module:e,entryPoint:"main"}})}dispatchOnce(r,e){let t=this.backend.computePass();if(t){t.setPipeline(r),t.setBindGroup(0,e),t.dispatchWorkgroups(...this.dispatch);return}let i=this.device.createCommandEncoder(),a=i.beginComputePass();a.setPipeline(r),a.setBindGroup(0,e),a.dispatchWorkgroups(...this.dispatch),a.end(),this.device.queue.submit([i.finish()]);}};var gt=`// Global average pool: (H, W, C) \u2192 (1, 1, C). One 256-thread workgroup per
// channel group; each thread sums a strided slice of the plane, then the
// partials are tree-reduced in workgroup memory. Accumulates in f32 for both
// storage dtypes. Ported from the webrtcHacks selfie-segmentation demo (a
// single thread walking the plane was 80% of that network's GPU time).

struct Params {
    n  : u32,   // H * W
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f32>>;

var<workgroup> partial : array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3<u32>) {
    let c = wg.x;
    var sum = vec4<f32>(0.0);
    for (var i = t; i < params.n; i += 256u) { sum += input_buf[i * params.g + c]; }
    partial[t] = sum;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride >>= 1u) {
        if (t < stride) { partial[t] += partial[t + stride]; }
        workgroupBarrier();
    }
    if (t == 0u) { output_buf[c] = partial[0] / f32(params.n); }
}
`;var ht=`enable f16;
// Global average pool: (H, W, C) \u2192 (1, 1, C). One 256-thread workgroup per
// channel group; each thread sums a strided slice of the plane, then the
// partials are tree-reduced in workgroup memory. Accumulates in f32 for both
// storage dtypes. Ported from the webrtcHacks selfie-segmentation demo (a
// single thread walking the plane was 80% of that network's GPU time).

struct Params {
    n  : u32,   // H * W
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<uniform>             params     : Params;
@group(0) @binding(2) var<storage, read_write> output_buf : array<vec4<f16>>;

var<workgroup> partial : array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3<u32>) {
    let c = wg.x;
    var sum = vec4<f32>(0.0);
    for (var i = t; i < params.n; i += 256u) { sum += vec4<f32>(input_buf[i * params.g + c]); }
    partial[t] = sum;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride >>= 1u) {
        if (t < stride) { partial[t] += partial[t + stride]; }
        workgroupBarrier();
    }
    if (t == 0u) { output_buf[c] = vec4<f16>(partial[0] / f32(params.n)); }
}
`;var Fe=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e){super(r),this.shader=r.dtype==="f16"?ht:gt;let t=e.c/4;this.output=r.tensor(1,1,e.c),this.inputs=[e],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([e.h*e.w,t,0,0])),this.defaultSetup(),this.dispatch=[t,1,1];}};var bt=`// Per-channel scale: out[y, x, c] = x[y, x, c] * scale[c], scale is (1, 1, C).
// The broadcast multiply behind squeeze-excite / attention gates.

struct Params {
    n  : u32,   // H * W * channel groups (vec4 count)
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read>       scale_buf  : array<vec4<f32>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    output_buf[i] = input_buf[i] * scale_buf[i % params.g];
}
`;var vt=`enable f16;
// Per-channel scale: out[y, x, c] = x[y, x, c] * scale[c], scale is (1, 1, C).
// The broadcast multiply behind squeeze-excite / attention gates.

struct Params {
    n  : u32,   // H * W * channel groups (vec4 count)
    g  : u32,   // channel groups
    _p0: u32,
    _p1: u32,
}

@group(0) @binding(0) var<storage, read>       input_buf  : array<vec4<f16>>;
@group(0) @binding(1) var<storage, read>       scale_buf  : array<vec4<f16>>;
@group(0) @binding(2) var<uniform>             params     : Params;
@group(0) @binding(3) var<storage, read_write> output_buf : array<vec4<f16>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    output_buf[i] = input_buf[i] * scale_buf[i % params.g];
}
`;var De=class extends c{inputs;weights=[];output;dispatch;shader;constructor(r,e,t){if(super(r),t.h!==1||t.w!==1||t.c!==e.c)throw new Error(`ChannelScale: scale must be 1\xD71\xD7${e.c}, got ${t.h}\xD7${t.w}\xD7${t.c}`);this.shader=r.dtype==="f16"?vt:bt;let i=e.c/4,a=e.h*e.w*i;this.output=r.tensor(e.h,e.w,e.c),this.inputs=[e,t],this.createUniform("params","Params"),this.setUniform("params",new Uint32Array([a,i,0,0])),this.defaultSetup(),this.dispatch=[Math.ceil(a/256),1,1];}};var Ja=navigator.gpu?GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST:0,_t=class n{constructor(r,e,t){this.device=r;this.canvas=e;this.dtype=t;this.bytesPerElement=t==="f16"?2:4;let i=e.getContext("webgpu");if(!i)throw new Error("Failed to get WebGPU context from canvas");this.canvasFormat=navigator.gpu.getPreferredCanvasFormat(),this.configureContext(i),this.canvasContext=i,this.contexts.set("main",i),this.ops={Conv2d:(a,o,s)=>new J(this,a,o,s),ConvTranspose2d:(a,o,s)=>new Z(this,a,o,s),DepthwiseConv2d:(a,o,s)=>new ee(this,a,o,s),Add:(a,o)=>new re(this,a,o),Sigmoid:a=>new te(this,a),Tanh:a=>new ae(this,a),ElementwiseMul:(a,o)=>new ie(this,a,o),GlobalAvgPool:a=>new Fe(this,a),ChannelScale:(a,o)=>new De(this,a,o),Warp:(a,o,s)=>new oe(this,a,o,s),FaceBoxFromHeatmaps:(a,o)=>new se(this,a,o),FaceBoxesFromHeatmaps:(a,o)=>new ne(this,a,o),ReframeState:(a,o,s,u)=>new ue(this,a,o,s,u),Reframe:(a,o)=>new pe(this,a,o),CropResample:(a,o,s)=>new ce(this,a,o,s),FaceTouchupStage:(a,o,s,u,p)=>new de(this,a,o,s,u,p),Stabilize:(a,o,s,u,p)=>new me(this,a,o,s,u,p),BilinearUpsample:(a,o)=>new ge(this,a,o),Crop:(a,o)=>new he(this,a,o),BicubicUpsample:(a,o)=>new be(this,a,o),ChannelConcat:(a,o)=>new ve(this,a,o),Conv2dAdd:(a,o,s,u)=>new _e(this,a,o,s,u),ProjResidual:(a,o,s,u)=>new ye(this,a,o,s,u),ConcatConv2d:(a,o,s,u)=>new xe(this,a,o,s,u),GatesFused:(a,o,s)=>new we(this,a,o,s),CandUpdateFused:(a,o,s,u,p)=>new ke(this,a,o,s,u,p),ConvExpand:(a,o)=>new Pe(this,a,o),CatConv6to2:(a,o,s)=>new Te(this,a,o,s),DownAdapter:(a,o,s,u)=>new Ue(this,a,o,s,u),UpFinal:(a,o,s)=>new Ge(this,a,o,s),UpFinalSkip:(a,o,s,u)=>new Be(this,a,o,s,u),UpsampleConcat:(a,o,s)=>new Ce(this,a,o,s),UpsampleConv1x1:(a,o,s)=>new We(this,a,o,s),UpsampleSigmoid:(a,o)=>new Ae(this,a,o),Input:(a,o)=>new Me(this,a,o)},this.presenters={CompositeSolid:(a,o,s,u="main")=>{let p=new Se(this,a,o,s);return {run:()=>{p.setOutput(this.getCurrentDisplayTexture(u)),p.run();}}},CompositeImage:(a,o,s,u="main")=>{let p=new Oe(this,a,o,s);return {run:()=>{p.setOutput(this.getCurrentDisplayTexture(u)),p.run();}}},CompositeImageBilinear:(a,o,s,u="main")=>{let p=new ze(this,a,o,s);return {run:()=>{p.setOutput(this.getCurrentDisplayTexture(u)),p.run();}}},CompositePassthrough:(a,o="main")=>{let s=new Ie(this,a);return {run:()=>{s.setOutput(this.getCurrentDisplayTexture(o)),s.run();}}},LandmarkOverlay:(a,o,s,u,p="main")=>{let l=new le(this,a,o,s,u);return {run:()=>{l.setOutput(this.getCurrentDisplayTexture(p)),l.run();}}},FaceTouchup:(a,o,s,u,p,l="main")=>{let d=new fe(this,a,o,s,u,p);return {run:()=>{d.setOutput(this.getCurrentDisplayTexture(l)),d.run();}}}};}device;canvas;dtype;ops;presenters;canvasContext;canvasFormat;bytesPerElement;contexts=new Map;batchState={depth:0,enc:null,pass:null};batch(r){let e=this.batchState;e.depth++;try{return r()}finally{--e.depth===0&&this.flush();}}computePass(){let r=this.batchState;return r.depth===0?null:(r.pass||(r.pass=this.batchEncoder().beginComputePass()),r.pass)}batchEncoder(){let r=this.batchState;return r.depth===0?null:(r.pass&&(r.pass.end(),r.pass=null),r.enc??=this.device.createCommandEncoder())}flush(){let r=this.batchState;if(r.pass&&(r.pass.end(),r.pass=null),r.enc){let e=r.enc;r.enc=null,this.device.queue.submit([e.finish()]);}}configureContext(r){r.configure({device:this.device,format:this.canvasFormat,alphaMode:"premultiplied"});}attachCanvas(r,e){if(r==="main")throw new Error("attachCanvas: 'main' is reserved for the create() canvas");let t=e.getContext("webgpu");if(!t)throw new Error(`attachCanvas: failed to get WebGPU context for target '${r}'`);this.configureContext(t),this.contexts.set(r,t);}static async isAvailable(){return navigator.gpu?await navigator.gpu.requestAdapter()!==null:false}static async hasF16Support(){if(!navigator.gpu)return  false;let r=await navigator.gpu.requestAdapter();return r?r.features.has("shader-f16"):false}static async create(r){let e=r.dtype??"f32",t=r.device;if(t){if(e==="f16"&&!t.features.has("shader-f16"))throw new Error("WebGPU dtype='f16' requested but supplied device lacks `shader-f16`")}else {let i=await navigator.gpu.requestAdapter();if(!i)throw new Error("WebGPU adapter not available");if(e==="f16"&&!i.features.has("shader-f16"))throw new Error("WebGPU dtype='f16' requested but adapter lacks `shader-f16` feature");t=await i.requestDevice({requiredFeatures:e==="f16"?["shader-f16"]:[]});}return new n(t,r.canvas,e)}getCurrentDisplayTexture(r="main"){let e=this.contexts.get(r);if(!e)throw new Error(`getCurrentDisplayTexture: no canvas attached for target '${r}'`);return e.getCurrentTexture()}tensor(r,e,t,i){let o=r*e*t*this.bytesPerElement,s=this.device.createBuffer({size:o,usage:Ja,mappedAtCreation:i!==void 0});if(i!==void 0){let u=s.getMappedRange();this.writeView(u,i),s.unmap();}return {h:r,w:e,c:t,buffer:s}}upload(r){let t=r.length*this.bytesPerElement,i=this.device.createBuffer({size:t,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,mappedAtCreation:true});return this.writeView(i.getMappedRange(),r),i.unmap(),{buffer:i}}writeView(r,e){let t=this.dtype==="f16",i=e instanceof Uint16Array;if(t===i){t?new Uint16Array(r).set(e):new Float32Array(r).set(e);return}t?new Uint16Array(r).set(je(e)):new Float32Array(r).set(Le(e));}async readback(r){this.flush();let e=this.device.createBuffer({size:r.buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),t=this.device.createCommandEncoder();t.copyBufferToBuffer(r.buffer,0,e,0,r.buffer.size),this.device.queue.submit([t.finish()]),await e.mapAsync(GPUMapMode.READ);let i=e.getMappedRange(),a=this.dtype==="f16"?Le(new Uint16Array(i.slice(0))):new Float32Array(i.slice(0));return e.unmap(),e.destroy(),a}copyTensor(r,e){if(r.buffer.size!==e.buffer.size)throw new Error(`copyTensor: size mismatch (src ${r.buffer.size} vs dst ${e.buffer.size})`);let t=this.batchEncoder(),i=t??this.device.createCommandEncoder();i.copyBufferToBuffer(r.buffer,0,e.buffer,0,r.buffer.size),t||this.device.queue.submit([i.finish()]);}async sync(){this.flush(),await this.device.queue.onSubmittedWorkDone();}destroy(){this.batchState.pass=null,this.batchState.enc=null,this.device.destroy();}};export{Ne as a,yt as b,ri as c,qe as d,je as e,Le as f,W as g,He as h,A as i,q as j,f as k,x as l,_t as m};