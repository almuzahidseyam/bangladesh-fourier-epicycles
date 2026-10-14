/* Pixel fixtures, interchange round trips and actual Fourier SVG regression checks. */
const assert = require('node:assert/strict');
const tools = require('./dist/drawing-tools.js');
const F = require('./dist/fourier.js');

function fixture(shape, {light=false, alpha=false}={}) {
  const width=66,height=66,data=new Uint8ClampedArray(width*height*4);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const inside=shape(x,y),i=(y*width+x)*4,value=light?(inside?255:0):(inside?0:255);
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=alpha?(inside?255:0):255;
  }
  return {data,width,height};
}
const square=(x,y)=>x>=12&&x<52&&y>=12&&y<52;
function extract(f,options={}){return tools.extractContour(f.data,f.width,f.height,{name:'Test outline',...options})}
const filled=fixture(square),outline=extract(filled);
assert.equal(outline.samples.length,8192);assert.equal(outline.rings.length,1);
assert.equal(outline.extraction.foregroundPixels,1600);assert.equal(outline.extraction.alphaMode,false);
assert.ok(Math.abs(tools.signedArea(outline.rings[0]))>.999,'Long square edges survive smoothing');
assert.ok(outline.samples.every(([x,y])=>Math.max(Math.abs(x),Math.abs(y))>.49),'Samples follow edges rather than foreground scan order');
const donut=extract(fixture((x,y)=>square(x,y)&&!(x>=24&&x<40&&y>=24&&y<40)));
assert.equal(donut.rings.length,2);assert.equal(donut.extraction.referenceHoles,1);
assert.ok(tools.signedArea(donut.rings[0])*tools.signedArea(donut.rings[1])<0,'Hole has opposite winding');
const multi=extract(fixture((x,y)=>square(x,y)||(x>=2&&x<7&&y>=2&&y<7)));
assert.equal(multi.extraction.ignoredComponents,1);assert.equal(multi.extraction.foregroundPixels,1600);
assert.deepEqual(multi.samples,outline.samples);
const inverted=extract(fixture(square,{light:true}));assert.equal(inverted.extraction.polarity,'light');assert.deepEqual(inverted.samples,outline.samples);
const transparent=extract(fixture(square,{light:true,alpha:true}));assert.equal(transparent.extraction.alphaMode,true);assert.deepEqual(transparent.samples,outline.samples);
assert.throws(()=>extract(fixture(()=>false)),/No clear silhouette/);
assert.throws(()=>extract(fixture((x,y)=>x===20&&y===20)),/No clear silhouette/);
assert.throws(()=>tools.imageMask(new Uint8ClampedArray(1),513,513),/Invalid image/);
assert.throws(()=>extract(filled,{threshold:0}),/Invalid contour/);

const state={count:2,speed:1.25,progress:.42,circles:false,guide:true,progressive:false};
function reconstruction(n){const x=F.transform(outline.samples,0,4095),y=F.transform(outline.samples,1,4095);return {x:F.reconstruct(x,n,16384),y:F.reconstruct(y,n,16384),rms:F.errorCurve(x,y)[n-1].rms}}
const low=reconstruction(2),high=reconstruction(128);
const project=tools.buildProject(donut,state,low.x,low.y,low.rms),restored=tools.parseProject(project);
assert.deepEqual(restored.boundary.samples,donut.samples);assert.deepEqual(restored.boundary.rings,donut.rings);
assert.equal(restored.settings.count,2);assert.equal(restored.settings.speed,1.25);assert.equal(restored.settings.progress,.42);assert.equal(restored.settings.playing,false);
assert.equal(restored.settings.circles,false);
const corrupt=JSON.parse(project);corrupt.reconstruction={path:'untrusted',normalizedRmsPercent:-100};
assert.deepEqual(tools.parseProject(JSON.stringify(corrupt)).boundary.samples,donut.samples,'Stored reconstruction cannot replace source data');
for(const mutate of [p=>p.version=2,p=>p.drawing.samples.pop(),p=>p.drawing.samples[0][0]=1e99,p=>p.settings.harmonics=4294967296,p=>p.settings.progress=-1,p=>p.settings.speed='1',p=>p.drawing.rings=[]]){
  const p=JSON.parse(project);mutate(p);assert.throws(()=>tools.parseProject(JSON.stringify(p)));
}
for(const text of ['null','[]','{"path":[[0,0],[1,1],[2,2]]}','{"path":[[0,0],[1,1],[null,2]]}','{"format":"other"}','not-json',' '.repeat(tools.MAX_FILE_BYTES+1)])assert.throws(()=>tools.parseProject(text));
const legacy=tools.parseProject(JSON.stringify({name:'Legacy path',path:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]}));
assert.equal(legacy.boundary.samples.length,8192);assert.equal(legacy.settings,null);assert.equal(legacy.boundary.name,'Legacy path');
const named={...outline,name:'<script>alert("x")</script> & outline'};
const svg=tools.buildSvg(named,state,low.x,low.y,low.rms),svgHigh=tools.buildSvg(named,{...state,count:128},high.x,high.y,high.rms);
assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(svg.includes('fourier-reconstruction'));
assert.equal((svg.match(/ L/g)||[]).length,16383);assert.notEqual(svg.match(/d="M[^"]+/)[0],svgHigh.match(/d="M[^"]+/)[0],'Selected N changes actual SVG geometry');
assert.ok(!svg.includes('NaN')&&!svg.includes('Infinity'));
assert.ok(tools.buildSvg(donut,state,low.x,low.y,low.rms).includes('reference-outline'));
assert.throws(()=>tools.buildSvg(outline,state,[],[],0),/not ready/);
console.log('Drawing tools passed: silhouette edges, holes, components, alpha/polarity, validation, JSON round trip, actual selected-N SVG and XML escaping.');

// Optional reproducible browser QA assets; never committed or uploaded.
if(process.argv.includes('--fixtures')){
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
  const dir=path.join(os.tmpdir(),'fourier-qa');fs.mkdirSync(dir,{recursive:true});
  function png(f){
    // Pixel tests include the decoder frame; files must omit it before decoding.
    const pixels=new Uint8ClampedArray((f.width-2)*(f.height-2)*4);
    for(let y=1;y<f.height-1;y++)pixels.set(f.data.subarray((y*f.width+1)*4,(y*f.width+f.width-1)*4),(y-1)*(f.width-2)*4);
    f={data:pixels,width:f.width-2,height:f.height-2};
    function crc32(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
    function chunk(type,data){const b=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([b,data])));return Buffer.concat([len,b,data,crc])}
    const header=Buffer.alloc(13);header.writeUInt32BE(f.width);header.writeUInt32BE(f.height,4);header[8]=8;header[9]=6;
    const rows=[];for(let y=0;y<f.height;y++)rows.push(Buffer.from([0]),Buffer.from(f.data.subarray(y*f.width*4,(y+1)*f.width*4)));
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
  }
  const fixtures={silhouette:filled,donut:fixture((x,y)=>square(x,y)&&!(x>=24&&x<40&&y>=24&&y<40)),transparent:fixture(square,{light:true,alpha:true}),inverted:fixture(square,{light:true}),blank:fixture(()=>false)};
  for(const [name,f] of Object.entries(fixtures))fs.writeFileSync(path.join(dir,name+'.png'),png(f));
  fs.writeFileSync(path.join(dir,'legacy.json'),JSON.stringify({name:'Legacy triangle',path:[{x:0,y:0},{x:100,y:0},{x:40,y:90}]}));
  fs.writeFileSync(path.join(dir,'invalid.json'),'{"format":"fourier-portrait","version":99}');
  fs.writeFileSync(path.join(dir,'perfect-circle.json'),JSON.stringify({format:'fourier-portrait',version:1,source:{name:'Circle'},drawing:{samples:Array.from({length:8192},(_,i)=>[.5*Math.cos(i*F.TAU/8192),.5*Math.sin(i*F.TAU/8192)]),rings:[Array.from({length:129},(_,i)=>[.5*Math.cos(i*F.TAU/128),.5*Math.sin(i*F.TAU/128)])]},settings:{harmonics:2,speed:1,progress:1,circles:true,guide:true}}));
  console.log('Browser fixtures: '+dir);
}
