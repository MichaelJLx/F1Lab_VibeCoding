// A two-revolution V6 firing cycle, rendered once at 6,000 rpm.
// Unequal bank contributions and a damped exhaust pulse soften the firing harmonics.
function combustionLoop(ctx:AudioContext){
 const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*.4),ctx.sampleRate);
 const out=buffer.getChannelData(0);
 const banks=[1,.66,.89,.72,.94,.62];
 for(let i=0;i<out.length;i++){
   const cycle=i/out.length*20,ignition=cycle*6,phase=ignition%1;
   const pulse=Math.sin(phase*2*Math.PI)*Math.exp(-phase*4);
   out[i]=banks[Math.floor(ignition)%6]*pulse+.19*Math.sin(cycle*4*Math.PI);
 }
 return buffer;
}

// Cross the recording's tail into its head once at load time. No retrigger at shifts.
function seamlessRecording(ctx:AudioContext,input:AudioBuffer){
 const overlap=Math.min(Math.round(input.sampleRate*.045),Math.floor(input.length/4));
 const length=input.length-overlap,buffer=ctx.createBuffer(1,length,input.sampleRate);
 const src=input.getChannelData(0),dst=buffer.getChannelData(0);
 dst.set(src.subarray(overlap));
 for(let i=0;i<overlap;i++){
   const mix=.5-.5*Math.cos(Math.PI*i/(overlap-1));
   dst[length-overlap+i]=src[length+i]*(1-mix)+src[i]*mix;
 }
 return buffer;
}

// A gently turbulent intake, below the exhaust harmonics. Deterministic and local.
function intakeLoop(ctx:AudioContext){
 const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*2),ctx.sampleRate);
 const samples=buffer.getChannelData(0);
 let seed=1977,air=0;
 for(let i=0;i<samples.length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   air=.94*air+.06*(seed/2147483648-1);
   samples[i]=air*3;
 }
 return seamlessRecording(ctx,buffer);
}

export class CarAudio {
 private context?:AudioContext;
 private body?:AudioBufferSourceNode;
 private firing?:AudioBufferSourceNode;
 private intake?:AudioBufferSourceNode;
 private intakeGain?:GainNode;
 private outlet?:BiquadFilterNode;
 private master?:GainNode;
 private rumble?:GainNode;
 private kerb?:OscillatorNode;
 private request=new AbortController();
 enabled=false;

 private loop(ctx:AudioContext,buffer:AudioBuffer,gain:number,destination:AudioNode){
   const source=ctx.createBufferSource(),level=ctx.createGain();
   source.buffer=buffer;source.loop=true;level.gain.value=gain;
   source.connect(level).connect(destination);source.start();
   return source;
 }
 private async loadRecording(ctx:AudioContext,destination:AudioNode){
   try{
     const response=await fetch('/audio/engine-loop.wav',{signal:this.request.signal});
     if(!response.ok)return;
     const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
     if(!this.request.signal.aborted)this.body=this.loop(ctx,seamlessRecording(ctx,buffer),.78,destination);
   }catch{/* The combustion layer can play independently of the sample. */}
 }
 enable(){
   if(!this.context){
     const ctx=this.context=new AudioContext();
     this.master=ctx.createGain();this.master.gain.value=0;
     this.outlet=ctx.createBiquadFilter();this.outlet.type='lowpass';this.outlet.Q.value=.55;
     const dc=ctx.createBiquadFilter();dc.type='highpass';dc.frequency.value=34;
     this.outlet.connect(dc).connect(this.master).connect(ctx.destination);
     this.firing=this.loop(ctx,combustionLoop(ctx),.31,this.outlet);
     this.intakeGain=ctx.createGain();this.intakeGain.gain.value=0;
     const chamber=ctx.createBiquadFilter();chamber.type='bandpass';chamber.frequency.value=360;chamber.Q.value=.72;
     this.intakeGain.connect(chamber).connect(this.outlet);
     this.intake=this.loop(ctx,intakeLoop(ctx),1,this.intakeGain);
     void this.loadRecording(ctx,this.outlet);
     this.rumble=ctx.createGain();this.rumble.gain.value=0;
     this.kerb=ctx.createOscillator();this.kerb.type='triangle';
     this.kerb.connect(this.rumble).connect(ctx.destination);this.kerb.start();
   }
   this.enabled=true;
   void this.context.resume().catch(()=>{this.enabled=false;});
 }
 update(running:boolean,rpm:number,load:number,speed:number,contact:number,shifting:boolean){
   const ctx=this.context;if(!ctx)return;
   const t=ctx.currentTime,active=running&&this.enabled;
   this.master!.gain.setTargetAtTime(active?(.13+.20*load)*(shifting ? .42 : 1):0,t,.03);
   const power=Math.min(1,Math.max(0,load));
   this.intakeGain!.gain.setTargetAtTime(.16+power*.95,t,shifting ? .015 : .07);
   this.outlet!.frequency.setTargetAtTime(430+690*power,t,.06);
   this.firing!.playbackRate.setTargetAtTime(rpm/6000,t,.022);
   this.body?.playbackRate.setTargetAtTime(.82+rpm/8500,t,.055);
   this.kerb!.frequency.setTargetAtTime(28+speed*.8,t,.025);
   this.rumble!.gain.setTargetAtTime(active?Math.min(.13,contact*Math.min(1,speed/12)):0,t,.02);
 }
 dispose(){
   this.request.abort();this.body?.stop();this.intake?.stop();this.firing?.stop();this.kerb?.stop();
   if(this.context)void this.context.close();
 }
}
