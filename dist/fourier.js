/* Dependency-free radix-2 FFT and real Fourier series; shared by UI and checks. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function fft(re,im,inverse=false){
    const n=re.length;
    if(n<2||(n&(n-1))!==0||im.length!==n)throw new RangeError('FFT requires equal power-of-two arrays.');
    for(let i=1,j=0;i<n;i++){
      let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
      if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}
    }
    for(let len=2;len<=n;len*=2){
      const angle=(inverse?1:-1)*TAU/len,wr=Math.cos(angle),wi=Math.sin(angle);
      for(let start=0;start<n;start+=len){
        let ur=1,ui=0;
        for(let j=0;j<len/2;j++){
          const a=start+j,b=a+len/2,vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;
          re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;
          const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
        }
      }
    }
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n}
    return re;
  }
  function transform(samples,axis,maxFrequency=1024){
    const n=samples.length;
    if(maxFrequency>=n/2)throw new RangeError('Harmonics must be strictly below the Nyquist frequency.');
    const re=Float64Array.from(samples,p=>p[axis]),im=new Float64Array(n);
    const dc=re.reduce((sum,value)=>sum+value,0)/n;
    const variance=re.reduce((sum,value)=>sum+(value-dc)**2,0)/n;
    fft(re,im);
    const terms=[];
    for(let k=1;k<=maxFrequency;k++){
      const a=2*re[k]/n,b=-2*im[k]/n;
      terms.push({frequency:k,a,b,amplitude:Math.hypot(a,b),phase:Math.atan2(-b,a)});
    }
    return {dc,variance,terms,sampleCount:n};
  }
  function evaluate(series,t,count){
    let value=series.dc;
    for(let i=0;i<Math.min(count,series.terms.length);i++){
      const q=series.terms[i];value+=q.amplitude*Math.cos(q.frequency*t+q.phase);
    }
    return value;
  }
  function reconstruct(series,count,size=16384,phaseOffset=0){
    if(count>=size/2)throw new RangeError('Reconstruction size must exceed twice the harmonic count.');
    const re=new Float64Array(size),im=new Float64Array(size);re[0]=series.dc*size;
    for(let i=0;i<Math.min(count,series.terms.length);i++){
      const q=series.terms[i],k=q.frequency,delta=k*phaseOffset,c=Math.cos(delta),s=Math.sin(delta);
      re[k]=(q.a*c+q.b*s)*size/2;im[k]=(q.a*s-q.b*c)*size/2;
      re[size-k]=re[k];im[size-k]=-im[k];
    }
    return fft(re,im,true);
  }
  function errorCurve(x,y){
    const energy=x.variance+y.variance,curve=[];
    let residual=energy;
    for(let i=0;i<Math.min(x.terms.length,y.terms.length);i++){
      residual-=(x.terms[i].amplitude**2+y.terms[i].amplitude**2)/2;
      curve.push({count:i+1,rms:Math.sqrt(Math.max(0,residual)/energy)*100});
    }
    return curve;
  }
  function error(samples,x,y,count){return errorCurve(x,y)[count-1].rms}
  function circleEnvelopes(series,steps=2048){
    if(series.envelopes)return series.envelopes;
    const real=new Float64Array(steps).fill(series.dc),imag=new Float64Array(steps);
    const result=[];
    let derivative=0,minReal=Infinity,maxReal=-Infinity,minImag=Infinity,maxImag=-Infinity;
    for(const q of series.terms){
      // A derivative bound covers extrema between the sampled phases.
      const padding=q.amplitude+derivative*Math.PI/steps;
      for(let j=0;j<steps;j++){
        minReal=Math.min(minReal,real[j]-padding);maxReal=Math.max(maxReal,real[j]+padding);
        minImag=Math.min(minImag,imag[j]-padding);maxImag=Math.max(maxImag,imag[j]+padding);
        const angle=q.frequency*TAU*j/steps+q.phase;
        real[j]+=q.amplitude*Math.cos(angle);imag[j]+=q.amplitude*Math.sin(angle);
      }
      result.push({minReal,maxReal,minImag,maxImag});derivative+=q.frequency*q.amplitude;
    }
    return series.envelopes=result;
  }
  function scene(bounds,x,y,count){
    const rx=x.terms.slice(0,count).reduce((s,q)=>s+q.amplitude,0);
    const ry=y.terms.slice(0,count).reduce((s,q)=>s+q.amplitude,0);
    const xe=circleEnvelopes(x)[count-1],ye=circleEnvelopes(y)[count-1],gap=.18;
    const xAnchor=[0,bounds.maxY-xe.minImag+gap],yAnchor=[bounds.minX+ye.minImag-gap,0];
    return {rx,ry,gap,xAnchor,yAnchor,xe,ye,
      minX:Math.min(yAnchor[0]-ye.maxImag,xe.minReal,bounds.minX)-.12,
      maxX:Math.max(yAnchor[0]-ye.minImag,xe.maxReal,bounds.maxX)+.12,
      minY:Math.min(ye.minReal,bounds.minY)-.12,
      maxY:Math.max(xAnchor[1]+xe.maxImag,ye.maxReal,bounds.maxY)+.12};
  }
  root.Fourier={TAU,fft,transform,evaluate,reconstruct,errorCurve,error,circleEnvelopes,scene};
  if(typeof module!=='undefined')module.exports=root.Fourier;
})(typeof window!=='undefined'?window:globalThis);
