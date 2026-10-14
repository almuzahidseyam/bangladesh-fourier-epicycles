(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const canvas=$('drawing'),ctx=canvas.getContext('2d');
  const {TAU,transform,evaluate,reconstruct,errorCurve,scene}=window.Fourier;
  const boundary=window.BANGLADESH_BOUNDARY,MAX_N=boundary.samples.length/2-1,TRACE_SAMPLES=16384,CYCLE_SECONDS=28;
  const xSeries=transform(boundary.samples,0,MAX_N),ySeries=transform(boundary.samples,1,MAX_N);
  const errors=errorCurve(xSeries,ySeries);
  const best=errors.slice(1).reduce((a,b)=>b.rms<a.rms?b:a);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state={count:1024,speed:1,playing:!reduced,progress:reduced?1:0,cycle:1,circles:true,guide:true,progressive:false};
  const traceLayer=document.createElement('canvas'),traceCtx=traceLayer.getContext('2d');
  let width=0,height=0,dpr=1,lastTime=0,lastUi=0,holdTime=0,toastTimer,traceX,traceY,geometry,view,painted=0,rebuildPending=0;
  const tones=[[170,27,48],[203,37,61],[180,31,54],[145,28,54],[170,27,48]];
  const colorAt=progress=>{const p=progress*(tones.length-1),i=Math.min(tones.length-2,Math.floor(p)),t=p-i;return `rgb(${tones[i].map((v,j)=>Math.round(v+(tones[i+1][j]-v)*t)).join(',')})`};
  function formatError(value){return value.toFixed(value<.001?8:value<.1?6:value<1?4:3)+'%'}
  function updateRange(input){const p=(input.value-input.min)/(input.max-input.min)*100;input.style.background=`linear-gradient(to right,#bc2444 ${p}%,#d8d3df ${p}%)`}
  function numericEquation(series,label){
    const shown=series.terms.slice(0,Math.min(3,state.count));
    return `${label}(t) ≈ ${series.dc.toFixed(4)}`+shown.map(q=>{const phi=-q.phase;return ` + ${q.amplitude.toFixed(4)} cos(${q.frequency===1?'t':q.frequency+'t'} ${phi<0?'+':'−'} ${Math.abs(phi).toFixed(3)})`}).join('')+(state.count>shown.length?' + …':'');
  }
  function updateMath(){
    $('math-state').textContent=`Bangladesh · N = ${state.count} · Sampled RMS ${formatError(errors[state.count-1].rms)}`;
    $('numeric-x').textContent=numericEquation(xSeries,'x');$('numeric-y').textContent=numericEquation(ySeries,'y');
    $('math-preview-note').textContent=`First ${Math.min(3,state.count)} of ${state.count} harmonics shown, rounded for readability. The drawing uses every selected harmonic. Values are computed from this boundary.`;
  }
  function rebuild(){
    traceX=reconstruct(xSeries,state.count,TRACE_SAMPLES);traceY=reconstruct(ySeries,state.count,TRACE_SAMPLES);
    const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for(const ring of boundary.rings)for(const [x,y] of ring){bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y)}
    for(let i=0;i<TRACE_SAMPLES;i++){bounds.minX=Math.min(bounds.minX,traceX[i]);bounds.maxX=Math.max(bounds.maxX,traceX[i]);bounds.minY=Math.min(bounds.minY,traceY[i]);bounds.maxY=Math.max(bounds.maxY,traceY[i])}
    geometry=scene(bounds,xSeries,ySeries,state.count);geometry.bounds=bounds;
    $('error-value').textContent=formatError(errors[state.count-1].rms);
    $('harmonic-value').textContent=state.count;$('harmonics').value=state.count;
    $('n-value').value=state.count;$('n-value').setAttribute('aria-invalid','false');$('n-error').textContent='';$('n-error').hidden=true;
    $('harmonics').setAttribute('aria-valuetext',state.count+' harmonics per axis');
    $('detail-label').textContent=state.count<32?'Abstract':state.count<256?'Detailed':state.count<768?'Fine detail':'Ultra detail';
    document.querySelectorAll('[data-harmonics]').forEach(button=>{const active=Number(button.dataset.harmonics)===state.count;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active))});
    const x=chartX(state.count),y=chartY(errors[state.count-1].rms);$('rms-marker').setAttribute('cx',x);$('rms-marker').setAttribute('cy',y);
    updateRange($('harmonics'));updateMath();resetTrace();
  }
  function resetTrace(){
    if(!width||!geometry)return;
    const b=state.circles?geometry:{minX:geometry.bounds.minX-.13,maxX:geometry.bounds.maxX+.13,minY:geometry.bounds.minY-.13,maxY:geometry.bounds.maxY+.13};
    const scale=Math.min((width-26)/(b.maxX-b.minX),(height-26)/(b.maxY-b.minY));
    view={scale,ox:(width-(b.maxX-b.minX)*scale)/2-b.minX*scale,oy:(height-(b.maxY-b.minY)*scale)/2-b.minY*scale};
    traceLayer.width=Math.round(width*dpr);traceLayer.height=Math.round(height*dpr);painted=0;
  }
  function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);resetTrace();draw()}
  function project(x,y){return [view.ox+x*view.scale,view.oy+y*view.scale]}
  function line(context,a,b,color,lineWidth=1,dash=[]){context.beginPath();context.moveTo(...a);context.lineTo(...b);context.strokeStyle=color;context.lineWidth=lineWidth;context.setLineDash(dash);context.stroke();context.setLineDash([])}
  function dot(x,y,r,color,glow=0){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.fill();ctx.shadowBlur=0}
  function epicycles(series,anchor,rotation,t,color){
    let x=anchor[0]+series.dc*Math.cos(rotation),y=anchor[1]+series.dc*Math.sin(rotation);
    const cosRot=Math.cos(rotation),sinRot=Math.sin(rotation);
    for(let i=0;i<state.count;i++){
      const q=series.terms[i],angle=q.frequency*t+q.phase,cos=Math.cos(angle),sin=Math.sin(angle);
      const nx=x+q.amplitude*(cos*cosRot-sin*sinRot),ny=y+q.amplitude*(sin*cosRot+cos*sinRot);
      const radius=q.amplitude*view.scale;
      if(radius>.22){const p=project(x,y),end=project(nx,ny);ctx.beginPath();ctx.arc(...p,radius,0,TAU);ctx.strokeStyle=color==='mint'?'#7545b84d':'#bc24444d';ctx.lineWidth=.75;ctx.stroke();line(ctx,p,end,color==='mint'?'#7545b8c0':'#bc2444bd',.9)}
      x=nx;y=ny;
    }
    const end=project(x,y);dot(...end,2.3,color==='mint'?'#7545b8':'#bc2444',2);return end;
  }
  function paintTrace(){
    const target=Math.floor(state.progress*TRACE_SAMPLES);
    if(target<painted){traceCtx.clearRect(0,0,traceLayer.width,traceLayer.height);painted=0}
    traceCtx.setTransform(dpr,0,0,dpr,0,0);traceCtx.lineJoin='round';traceCtx.lineCap='round';
    // Paint only newly revealed sections. Expensive glows are cached, not redrawn each frame.
    while(painted<target){
      const end=Math.min(target,painted+64),color=colorAt((painted+end)/2/TRACE_SAMPLES);
      traceCtx.beginPath();traceCtx.moveTo(...project(traceX[painted%TRACE_SAMPLES],traceY[painted%TRACE_SAMPLES]));
      for(let i=painted+1;i<=end;i++)traceCtx.lineTo(...project(traceX[i%TRACE_SAMPLES],traceY[i%TRACE_SAMPLES]));
      traceCtx.strokeStyle=color;traceCtx.lineWidth=1.8;traceCtx.shadowColor=color;traceCtx.shadowBlur=1.5;traceCtx.stroke();traceCtx.shadowBlur=0;painted=end;
    }
  }
  function draw(){
    if(!width||!view)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#aaa1ba45';ctx.lineWidth=.5;
    for(let x=21;x<width;x+=35)for(let y=18;y<height;y+=35){ctx.beginPath();ctx.moveTo(x-1.1,y);ctx.lineTo(x+1.1,y);ctx.moveTo(x,y-1.1);ctx.lineTo(x,y+1.1);ctx.stroke()}
    const t=state.progress*TAU,tip=project(evaluate(xSeries,t,state.count),evaluate(ySeries,t,state.count));
    const mapTop=project(geometry.bounds.minX,geometry.bounds.minY),mapBottom=project(geometry.bounds.maxX,geometry.bounds.maxY);
    if(state.guide){
      const fill=ctx.createLinearGradient(mapTop[0],mapTop[1],mapBottom[0],mapBottom[1]);fill.addColorStop(0,'#bc24440b');fill.addColorStop(.45,'#bc244407');fill.addColorStop(1,'#7545b80d');
      ctx.beginPath();for(const ring of boundary.rings){ring.forEach(([x,y],i)=>{const q=project(x,y);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath()}ctx.fillStyle=fill;ctx.fill('evenodd');ctx.strokeStyle='#9b90ac77';ctx.lineWidth=.65;ctx.stroke();
    }
    // Offshore islands are reference geometry, revealed in colour alongside the mainland.
    boundary.rings.slice(1).forEach(ring=>{const end=Math.floor((ring.length-1)*state.progress);if(end<1)return;ctx.beginPath();for(let i=0;i<=end;i++){const p=project(...ring[i]);i?ctx.lineTo(...p):ctx.moveTo(...p)}ctx.strokeStyle='#7545b8';ctx.lineWidth=1.15;ctx.stroke()});
    if(state.circles){
      const xa=project(...geometry.xAnchor),ya=project(...geometry.yAnchor);
      line(ctx,[project(geometry.minX,0)[0],xa[1]],[width-15,xa[1]],'#bc244466',.7);
      line(ctx,[ya[0],15],[ya[0],height-15],'#7545b866',.7);
      ctx.font='8px "IBM Plex Mono",monospace';ctx.fillStyle='#a61f3c';ctx.fillText('X AXIS →',Math.min(width-80,Math.max(15,xa[0]+geometry.rx*view.scale+8)),xa[1]-9);
      ctx.fillStyle='#7545b8';ctx.fillText('Y AXIS ↕',Math.max(15,ya[0]-30),18);
      const xEnd=epicycles(xSeries,geometry.xAnchor,0,t,'gold'),yEnd=epicycles(ySeries,geometry.yAnchor,Math.PI/2,t,'mint');
      line(ctx,xEnd,tip,'#bc244488',.8,[3,5]);line(ctx,yEnd,tip,'#7545b888',.8,[3,5]);
      dot(...xa,1.5,'#bc2444');dot(...ya,1.5,'#7545b8');
    }
    paintTrace();ctx.drawImage(traceLayer,0,0,width,height);
    if(state.progress>0)dot(...tip,2.8,colorAt(state.progress),3);
    ctx.font='italic 12px Georgia';ctx.fillStyle='#71637f';ctx.fillText('বাংলাদেশ',Math.max(15,mapBottom[0]-55),Math.min(height-10,mapBottom[1]+18));
  }
  function updateUi(){
    $('completion-value').textContent=Math.floor(state.progress*100)+'%';$('timeline').value=state.progress*100;$('timeline').setAttribute('aria-valuetext',Math.floor(state.progress*100)+'% of cycle drawn');
    $('math-position').textContent=`t = ${(state.progress*2).toFixed(2)}π   ·   x(t) = ${evaluate(xSeries,state.progress*TAU,state.count).toFixed(4)}   ·   y(t) = ${evaluate(ySeries,state.progress*TAU,state.count).toFixed(4)}`;
    $('progress-fill').style.width=state.progress*100+'%';$('cycle-label').textContent='CYCLE '+String(state.cycle).padStart(2,'0');
    $('play-state').textContent=state.playing?'TRACING THE BORDER':'A MOMENT OF STILLNESS';$('play-text').textContent=state.playing?'Pause':'Play';$('play-icon').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pause animation':'Play animation');document.body.classList.toggle('paused',!state.playing);
  }
  function frame(now){
    const dt=lastTime?Math.min((now-lastTime)/1000,.25):0;lastTime=now;
    if(state.playing&&!document.hidden){
      if(state.progress<1)state.progress=Math.min(1,state.progress+dt*state.speed/CYCLE_SECONDS);else holdTime+=dt;
      if(holdTime>=2){state.progress=0;holdTime=0;state.cycle++;resetTrace();if(state.progressive&&state.count<MAX_N){state.count=Math.min(MAX_N,state.count*2);rebuild()}}
      draw();if(now-lastUi>90){updateUi();lastUi=now}
    }
    requestAnimationFrame(frame);
  }
  function setHarmonics(value){state.count=Math.max(2,Math.min(MAX_N,Number(value)));holdTime=0;rebuild();updateUi();draw()}
  $('n-form').addEventListener('submit',event=>{
    event.preventDefault();
    const raw=String($('n-value').value).trim().replaceAll(',','');
    const power=raw.match(/^(\d+)\s*\^\s*(\d+)$/);
    const value=power?Number(power[1])**Number(power[2]):/^\d+$/.test(raw)?Number(raw):NaN;
    if(!Number.isSafeInteger(value)||value<2||value>MAX_N){
      $('n-error').textContent=`Enter a whole number from 2 to ${MAX_N.toLocaleString()}. This boundary has 8,192 samples.`;
      $('n-error').hidden=false;$('n-value').setAttribute('aria-invalid','true');return;
    }
    setHarmonics(value);
  });
  function chartX(count){return 8+Math.log2(count)/Math.log2(MAX_N)*214}
  function chartY(rms){return 7+(Math.log10(errors[1].rms)-Math.log10(Math.max(rms,1e-12)))/(Math.log10(errors[1].rms)-Math.log10(best.rms))*61}
  $('rms-line').setAttribute('d',errors.slice(1).map((p,i)=>`${i?'L':'M'}${chartX(p.count).toFixed(2)},${chartY(p.rms).toFixed(2)}`).join(' '));
  $('minimum-note').textContent=`Lowest in N=2–${MAX_N}: ${formatError(best.rms)} at N=${best.count}.`;
  $('minimum').addEventListener('click',()=>{setHarmonics(best.count);toast(`Minimum measured RMS: ${formatError(best.rms)} at N=${best.count}`)});
  $('math-example').addEventListener('click',()=>setHarmonics(150));
  $('harmonics').addEventListener('input',e=>{const n=e.target.value;cancelAnimationFrame(rebuildPending);rebuildPending=requestAnimationFrame(()=>setHarmonics(n))});
  document.querySelectorAll('[data-harmonics]').forEach(button=>button.addEventListener('click',()=>setHarmonics(button.dataset.harmonics)));
  $('speed').addEventListener('input',e=>{state.speed=Number(e.target.value);$('speed-value').textContent=state.speed+'×';updateRange(e.target)});
  $('timeline').addEventListener('input',e=>{state.progress=Number(e.target.value)/100;state.playing=false;holdTime=0;draw();updateUi()});
  function syncFocus(){ $('focus').textContent=state.circles?'Focus on map ↗':'Show axes ↙';$('focus').setAttribute('aria-pressed',String(!state.circles)) }
  $('circles').addEventListener('change',e=>{state.circles=e.target.checked;syncFocus();resetTrace();draw()});
  $('focus').addEventListener('click',()=>{state.circles=!state.circles;$('circles').checked=state.circles;syncFocus();resetTrace();draw()});
  $('guide').addEventListener('change',e=>{state.guide=e.target.checked;draw()});
  $('progressive').addEventListener('change',e=>{state.progressive=e.target.checked;if(state.progressive){state.progress=0;setHarmonics(2)}});
  function togglePlay(){state.playing=!state.playing;updateUi();draw()}
  $('play').addEventListener('click',togglePlay);
  $('restart').addEventListener('click',()=>{state.progress=0;holdTime=0;state.cycle=1;if(state.progressive)state.count=2;rebuild();updateUi();draw()});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!['INPUT','BUTTON','A','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();togglePlay()}});
  document.addEventListener('visibilitychange',()=>{lastTime=0});
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500)}
  $('save').addEventListener('click',()=>{
    // Render at export resolution instead of enlarging the screen's bitmap.
    const original={width,height,dpr};width=1800;height=1300;dpr=1;canvas.width=width;canvas.height=height;resetTrace();draw();
    const image=document.createElement('canvas');image.width=1800;image.height=1530;const c=image.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,1800,1530);c.fillStyle='#17151d';c.font='64px Georgia';c.fillText('Bangladesh.',70,85);c.fillStyle='#716a7a';c.font='20px sans-serif';c.fillText('A Fourier Portrait · '+state.count+' harmonics per axis',73,125);c.drawImage(canvas,0,150);c.fillStyle='#bc2444';c.font='18px monospace';c.fillText(formatError(errors[state.count-1].rms)+' normalized RMS  ·  Boundary: Natural Earth / Public domain',70,1490);
    width=original.width;height=original.height;dpr=original.dpr;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);resetTrace();draw();
    image.toBlob(blob=>{if(!blob){toast('Could not save the image. Please try again.');return}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='bangladesh-fourier-'+state.count+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Your moment has been saved.')},'image/png');
  });
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Fullscreen is unavailable in this browser.')}catch{toast('Fullscreen is unavailable here. Open in a browser to use it.')}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen')});
  rebuild();updateRange($('speed'));updateUi();new ResizeObserver(resize).observe(canvas);requestAnimationFrame(frame);
})();
