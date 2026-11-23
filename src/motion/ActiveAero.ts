// FIA Belgian GP 2026, Doc 7: normal-grip activation offsets from the mapped turns.
// End stations are local estimates for the next corner approach.
export function straightModeZone(s:number,length:number){
  const turns=[6637,238,1127,5073,5982];
  const after=[190,140,60,140,80],end=[145,835,2150,5700,6480];
  for(let i=0;i<turns.length;i++){
    const start=turns[i]+after[i]*length/7004;
    if(start>end[i] ? s>=start || s<end[i] : s>=start && s<end[i])return i+1;
  }
  return 0;
}

export function advanceWing(travel:number,open:boolean,dt:number){
 return Math.max(0,Math.min(1,travel+(open?dt:-dt)/.30));
}
export function wingOpening(travel:number){return travel*travel*(3-2*travel);}
