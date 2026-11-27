export function advanceWing(travel:number,open:boolean,dt:number){
 return Math.max(0,Math.min(1,travel+(open?dt:-dt)/.30));
}
export function wingOpening(travel:number){return travel*travel*(3-2*travel);}
