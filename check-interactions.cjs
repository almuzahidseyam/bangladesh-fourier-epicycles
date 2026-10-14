/* Exercise animation transitions deterministically without a browser or timers. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Fourier=require('./dist/fourier.js');
const asset={window:{}};vm.runInNewContext(fs.readFileSync('./dist/boundary.js','utf8'),asset);
function harness(reduced=false){
  const elements=new Map(),listeners=new Map(),raf=new Map();let nextId=0,now=1000;
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  function element(id){
    if(elements.has(id))return elements.get(id);
    const handlers={};
    const e={value:'',min:0,max:100,textContent:'',checked:false,style:{},dataset:{},attributes:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){handlers[type]=fn},setAttribute(key,v){this.attributes[key]=v},trigger(type){handlers[type]?.({target:e})},getContext:()=>context,getBoundingClientRect:()=>({width:900,height:900}),handlers};
    elements.set(id,e);return e;
  }
  const presets=[128,512,1024].map(n=>{const e=element('preset-'+n);e.dataset.harmonics=String(n);return e});
  Object.assign(element('harmonics'),{value:1024,min:2,max:1024});Object.assign(element('speed'),{value:1,min:.25,max:2});
  const document={hidden:false,body:{classList:{toggle(){},add(){},remove(){}}},activeElement:{tagName:'BODY'},getElementById:element,querySelectorAll:()=>presets,createElement:tag=>element('created-'+(++nextId)),addEventListener:(type,fn)=>listeners.set(type,fn)};
  const sandbox={window:{Fourier,BANGLADESH_BOUNDARY:asset.window.BANGLADESH_BOUNDARY},document,matchMedia:()=>({matches:reduced}),devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},requestAnimationFrame:fn=>{const id=++nextId;raf.set(id,fn);return id},cancelAnimationFrame:id=>raf.delete(id),setTimeout:()=>0,clearTimeout(){},URL:{},console};
  vm.runInNewContext(fs.readFileSync('./dist/app.js','utf8'),sandbox);
  function frame(){const jobs=[...raf.values()];raf.clear();for(const job of jobs)job(now);now+=250}
  function advance(seconds){for(let i=0;i<Math.ceil(seconds*4);i++)frame()}
  return {element,frame,advance};
}
const h=harness();
assert.equal(h.element('harmonic-value').textContent,1024);
assert.equal(h.element('play-text').textContent,'Pause');h.advance(2);
assert.ok(Number(h.element('timeline').value)>0);
h.element('play').trigger('click');const paused=h.element('timeline').value;h.advance(3);assert.equal(h.element('timeline').value,paused);
h.element('timeline').value=100;h.element('timeline').trigger('input');assert.equal(h.element('completion-value').textContent,'100%');assert.equal(h.element('play-text').textContent,'Play');
h.element('preset-128').trigger('click');assert.equal(h.element('harmonic-value').textContent,128);assert.equal(h.element('completion-value').textContent,'100%','Detail changes preserve the comparison position');
h.element('minimum').trigger('click');assert.equal(h.element('harmonic-value').textContent,1024);assert.equal(h.element('error-value').textContent,'0.031998%');
h.element('focus').trigger('click');assert.equal(h.element('circles').checked,false);assert.equal(h.element('focus').textContent,'Show axes ↙');
h.element('focus').trigger('click');assert.equal(h.element('circles').checked,true);
h.element('restart').trigger('click');assert.equal(h.element('completion-value').textContent,'0%');assert.equal(h.element('play-text').textContent,'Play','Restart preserves pause');
h.element('progressive').checked=true;h.element('progressive').trigger('change');assert.equal(h.element('harmonic-value').textContent,2);
h.element('speed').value=2;h.element('speed').trigger('input');assert.equal(h.element('speed-value').textContent,'2×');
h.element('play').trigger('click');h.advance(17);assert.equal(h.element('harmonic-value').textContent,4);assert.equal(h.element('cycle-label').textContent,'CYCLE 02');
h.advance(150);assert.equal(h.element('harmonic-value').textContent,1024,'Progressive detail reaches and stops at 1024');
assert.ok(Number(h.element('timeline').value)>=0&&Number(h.element('timeline').value)<=100);
const r=harness(true);assert.equal(r.element('completion-value').textContent,'100%');assert.equal(r.element('play-text').textContent,'Play');r.advance(5);assert.equal(r.element('completion-value').textContent,'100%');
console.log('Interaction checks passed: pause, scrub, presets, minimum, focus, restart, progressive ceiling, reduced motion.');
