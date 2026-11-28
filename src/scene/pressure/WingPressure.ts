// Ladson et al., NASA TM 100526. Free transition, Re=6e6, M=.3.
// Chordwise pressure data at alpha=.0169 and 10.0254 degrees.
import runs from '../../../vehicles/rb22/aero/wing-pressure.json';
export function wingCp(chord:number,suction:boolean,opening:number){
 const face=suction?'suction':'pressure';
 const values=runs.map(run=>{
   const points=run[face];
   for(let i=1;i<points.length;i++){
     const [x,y]=points[i], [a,b]=points[i-1];
     if(chord<=x)return b+(y-b)*Math.max(0,(chord-a)/(x-a));
   }
   return points[points.length-1][1];
 });
 return values[1]+(values[0]-values[1])*opening;
}
