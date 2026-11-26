const key='f1lab.spa.driver.v1';
// Learning is specific to the path/controller revision; retain lap history only
// when older unconfirmed incidents or discontinuous routes were used.
const revision=2;
export type SlideMark={station:number,speed:number,safeSpeed:number,cleanPasses?:number};
export type CornerRecord={lastError?:string,trace?:{entry:number,minimum:number,brakeRelease:number,turnIn:number,pickup:number,full:number},time:number,line:number,pickup:number,caution:number};
const fresh=():CornerRecord=>({time:0,line:0,pickup:0,caution:0});
export class DriverMemory{
 slides:SlideMark[]=[];
 corners=Array.from({length:19},fresh);
 laps:{date:number;sectors:number[]}[]=[];
 constructor(){
   try{
     const saved=JSON.parse(localStorage.getItem(key)??'null');
     if(Array.isArray(saved?.laps))this.laps=saved.laps.slice(-60);
     if(saved?.revision!==revision || saved?.corners?.length!==19)return;
     this.corners=saved.corners.map((r:CornerRecord)=>r && Number.isFinite(r.time)&&r.time>=0&&[r.line,r.pickup,r.caution].every(v=>Number.isFinite(v)&&v>=0&&v<=1)?r:fresh());
     if(Array.isArray(saved.slides))this.slides=saved.slides.filter((p:SlideMark)=>p && Number.isFinite(p.station) && p.station>=0 && Number.isFinite(p.speed) && p.speed>0 && Number.isFinite(p.safeSpeed) && p.safeSpeed>0 && p.safeSpeed<=p.speed);
   }catch{/* Storage can be unavailable in private browsing. */}
 }
 recordSlide(station:number,speed:number){
   const bin=Math.floor(station/50);
   const mark=this.slides.find(p=>Math.floor(p.station/50)===bin);
   const safeSpeed=speed*.94;
   if(mark && mark.safeSpeed<=safeSpeed){
     if(mark.cleanPasses){mark.cleanPasses=0;this.save();}
     return;
   }
   const next={station,speed,safeSpeed,cleanPasses:0};
   if(mark)Object.assign(mark,next);else this.slides.push(next);
   this.save();
 }
 save(){try{localStorage.setItem(key,JSON.stringify({revision,corners:this.corners,laps:this.laps,slides:this.slides}));}catch{/* Keep the session in memory. */}}
}
