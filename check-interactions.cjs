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
    const e={value:'',min:0,max:100,textContent:'',checked:false,style:{},dataset:{},attributes:{},classList:{toggle(){},add(){},remove(){}},addEventListener(type,fn){handlers[type]=fn},setAttribute(key,v){this.attributes[key]=v},trigger(type){handlers[type]?.({target:e,preventDefault(){}})},getContext:()=>context,getBoundingClientRect:()=>({width:900,height:900}),handlers};
    elements.set(id,e);return e;
  }
  const presets=[128,1024,4095].map(n=>{const e=element('preset-'+n);e.dataset.harmonics=String(n);return e});
  Object.assign(element('harmonics'),{value:1024,min:2,max:4095});Object.assign(element('speed'),{value:1,min:.25,max:2});
  const document={hidden:false,body:{classList:{toggle(){},add(){},remove(){}}},activeElement:{tagName:'BODY'},getElementById:element,querySelectorAll:()=>presets,createElement:tag=>element('created-'+(++nextId)),addEventListener:(type,fn)=>listeners.set(type,fn)};
  const sandbox={window:{Fourier,BANGLADESH_BOUNDARY:asset.window.BANGLADESH_BOUNDARY},document,matchMedia:()=>({matches:reduced}),devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}},requestAnimationFrame:fn=>{const id=++nextId;raf.set(id,fn);return id},cancelAnimationFrame:id=>raf.delete(id),setTimeout:()=>0,clearTimeout(){},URL:{},console};
  vm.runInNewContext(fs.readFileSync('./dist/app.js','utf8'),sandbox);
  function frame(){const jobs=[...raf.values()];raf.clear();for(const job of jobs)job(now);now+=250}
  function advance(seconds){for(let i=0;i<Math.ceil(seconds*4);i++)frame()}
  return {element,frame,advance};
}
const h=harness();
assert.equal(h.element('harmonic-value').textContent,1024);
assert.match(h.element('math-state').textContent,/N = 1024/);
assert.match(h.element('numeric-x').textContent,/x\(t\) ≈ .*cos\(t/);
assert.match(h.element('numeric-y').textContent,/y\(t\) ≈ .*cos\(t/);
assert.match(h.element('math-preview-note').textContent,/First 3 of 1024/);
assert.equal(h.element('play-text').textContent,'Pause');h.advance(2);
assert.ok(Number(h.element('timeline').value)>0);
h.element('play').trigger('click');const paused=h.element('timeline').value;h.advance(3);assert.equal(h.element('timeline').value,paused);
h.element('timeline').value=100;h.element('timeline').trigger('input');assert.equal(h.element('completion-value').textContent,'100%');assert.equal(h.element('play-text').textContent,'Play');
h.element('preset-128').trigger('click');assert.equal(h.element('harmonic-value').textContent,128);assert.equal(h.element('completion-value').textContent,'100%','Detail changes preserve the comparison position');
for(const invalid of ['2^32','4294967296','1','0','2.5','-4','','word']){h.element('n-value').value=invalid;h.element('n-form').trigger('submit');assert.equal(h.element('harmonic-value').textContent,128);assert.equal(h.element('n-value').attributes['aria-invalid'],'true')}
for(const [input,expected] of [['777',777],['2^11',2048],['4,095',4095]]){h.element('n-value').value=input;h.element('n-form').trigger('submit');assert.equal(h.element('harmonic-value').textContent,expected);assert.equal(h.element('n-error').hidden,true)}
h.element('minimum').trigger('click');assert.equal(h.element('harmonic-value').textContent,4095);assert.ok(parseFloat(h.element('error-value').textContent)<.001);
assert.match(h.element('math-state').textContent,/N = 4095/);
h.element('math-example').trigger('click');assert.equal(h.element('harmonic-value').textContent,150);assert.match(h.element('math-state').textContent,/N = 150/);
h.element('n-value').value='2';h.element('n-form').trigger('submit');assert.match(h.element('math-preview-note').textContent,/First 2 of 2/);assert.ok(!h.element('numeric-x').textContent.includes('…'));
h.element('focus').trigger('click');assert.equal(h.element('circles').checked,false);assert.equal(h.element('focus').textContent,'Show axes ↙');
h.element('focus').trigger('click');assert.equal(h.element('circles').checked,true);
h.element('restart').trigger('click');assert.equal(h.element('completion-value').textContent,'0%');assert.equal(h.element('play-text').textContent,'Play','Restart preserves pause');
h.element('progressive').checked=true;h.element('progressive').trigger('change');assert.equal(h.element('harmonic-value').textContent,2);
h.element('speed').value=2;h.element('speed').trigger('input');assert.equal(h.element('speed-value').textContent,'2×');
h.element('play').trigger('click');h.advance(17);assert.equal(h.element('harmonic-value').textContent,4);assert.equal(h.element('cycle-label').textContent,'CYCLE 02');
h.advance(190);assert.equal(h.element('harmonic-value').textContent,4095,'Progressive detail reaches and stops at 4095');
assert.ok(Number(h.element('timeline').value)>=0&&Number(h.element('timeline').value)<=100);
const r=harness(true);assert.equal(r.element('completion-value').textContent,'100%');assert.equal(r.element('play-text').textContent,'Play');r.advance(5);assert.equal(r.element('completion-value').textContent,'100%');
console.log('Interaction checks passed: pause, scrub, presets, minimum, focus, restart, progressive ceiling, reduced motion.');
