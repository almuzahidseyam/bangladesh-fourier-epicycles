const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {TAU,fft,transform,evaluate,reconstruct,errorCurve,scene}=require('./dist/fourier.js');
const known=Array.from({length:1024},(_,i)=>{const t=i/1024*TAU;return [0.3+0.8*Math.cos(3*t)-0.2*Math.sin(7*t),-0.1+0.6*Math.sin(2*t)]});
const kx=transform(known,0,128),ky=transform(known,1,128);
assert.throws(()=>transform(known,0,1024),/Nyquist/);
assert.throws(()=>fft(new Float64Array(7),new Float64Array(7)),/power-of-two/);
for(let i=0;i<known.length;i++){
  assert.ok(Math.abs(evaluate(kx,i/1024*TAU,8)-known[i][0])<1e-10);
  assert.ok(Math.abs(evaluate(ky,i/1024*TAU,8)-known[i][1])<1e-10);
}
const box={window:{}};vm.runInNewContext(fs.readFileSync('./dist/boundary.js','utf8'),box);
const data=box.window.BANGLADESH_BOUNDARY,samples=data.samples;
assert.equal(samples.length,8192);assert.ok(samples.every(p=>p.every(Number.isFinite)));
const x=transform(samples,0),y=transform(samples,1),curve=errorCurve(x,y);
for(let i=2;i<curve.length;i++)assert.ok(curve[i].rms<=curve[i-1].rms,'Additional orthogonal frequencies must not increase sampled RMS');
const reference=JSON.parse(fs.readFileSync('./validation-samples.json','utf8'));
const comparisons=[];
for(const count of [2,8,32,128,256,512,768,1024]){
  const rx=reconstruct(x,count,8192),ry=reconstruct(y,count,8192);
  let squared=0,radius=0;
  for(let i=0;i<samples.length;i++){
    squared+=(rx[i]-samples[i][0])**2+(ry[i]-samples[i][1])**2;
    radius+=(samples[i][0]-x.dc)**2+(samples[i][1]-y.dc)**2;
  }
  const directRms=Math.sqrt(squared/radius)*100;
  assert.ok(Math.abs(directRms-curve[count-1].rms)<1e-7,'Parseval RMS must match explicit reconstruction');
  const hx=reconstruct(x,count,8192,TAU/(2*8192)),hy=reconstruct(y,count,8192,TAU/(2*8192));
  let heldOutSquared=0,heldOutRadius=0;
  for(let i=0;i<reference.length;i++){
    heldOutSquared+=(hx[i]-reference[i][0])**2+(hy[i]-reference[i][1])**2;
    heldOutRadius+=(reference[i][0]-x.dc)**2+(reference[i][1]-y.dc)**2;
  }
  comparisons.push({count,sampledRmsPercent:directRms,midpointRmsPercent:Math.sqrt(heldOutSquared/heldOutRadius)*100});
  for(const series of [x,y]){
    assert.ok(Math.abs(evaluate(series,0,count)-evaluate(series,TAU,count))<1e-10);
    for(const index of [0,19,1328,4095,7000])assert.ok(Math.abs(reconstruct(series,count,8192)[index]-evaluate(series,TAU*index/8192,count))<1e-10,'Inverse FFT must match direct series evaluation');
  }
  // Test actual circle edges at off-grid phases, including high frequencies.
  const bounds={minX:-.4,maxX:.4,minY:-.5,maxY:.5};
  const g=scene(bounds,x,y,count);
  assert.ok(g.xAnchor[1]+g.xe.minImag>=bounds.maxY+g.gap-1e-10);
  assert.ok(g.yAnchor[0]-g.ye.minImag<=bounds.minX-g.gap+1e-10);
  for(let j=0;j<67;j++){
    const t=TAU*(j+.371)/67;
    let px=x.dc,py=g.xAnchor[1],qx=g.yAnchor[0],qy=y.dc;
    for(let k=0;k<count;k++){
      const a=x.terms[k],b=y.terms[k];
      assert.ok(py-a.amplitude>=bounds.maxY+g.gap-1e-9,'X circle overlaps the map');
      assert.ok(qx+b.amplitude<=bounds.minX-g.gap+1e-9,'Y circle overlaps the map');
      assert.ok(px-a.amplitude>=g.minX&&px+a.amplitude<=g.maxX&&py+a.amplitude<=g.maxY,'X circle leaves the scene');
      assert.ok(qx-b.amplitude>=g.minX&&qy-b.amplitude>=g.minY&&qy+b.amplitude<=g.maxY,'Y circle leaves the scene');
      px+=a.amplitude*Math.cos(a.frequency*t+a.phase);py+=a.amplitude*Math.sin(a.frequency*t+a.phase);
      qx-=b.amplitude*Math.sin(b.frequency*t+b.phase);qy+=b.amplitude*Math.cos(b.frequency*t+b.phase);
    }
    assert.ok(Math.abs(px-evaluate(x,t,count))<1e-10);
    assert.ok(Math.abs(qy-evaluate(y,t,count))<1e-10);
  }
}
const best=curve.slice(1).reduce((a,b)=>b.rms<a.rms?b:a);
assert.equal(best.count,1024);assert.ok(best.rms>0&&best.rms<.1);
const report={source:data.source,license:data.license,sourceVertices:data.vertices,trainingSamples:samples.length,midpointValidationSamples:reference.length,normalization:'RMS reconstruction distance / mainland RMS radius about centroid × 100',search:{from:2,to:1024,step:1},minimum:best,comparisons,curve:curve.slice(1)};
fs.writeFileSync('rms-analysis.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:'passed',minimum:best,comparisons},null,2));
