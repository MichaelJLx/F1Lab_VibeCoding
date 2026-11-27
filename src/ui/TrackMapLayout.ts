import type {CircuitTrack} from '../tracks/CircuitTrack';
export function mapGeometry(track:CircuitTrack){
const nodes=track.layout.nodes;
const length=track.length;
const turns=track.profile.turns;
const splits=track.profile.splits;
const xs=nodes.map(n=>n.x),ys=nodes.map(n=>-n.z);
const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(236/(maxX-minX),160/(maxY-minY));
const xy=(n:(typeof nodes)[number])=>[150+(n.x-(minX+maxX)/2)*scale,110+(-n.z-(minY+maxY)/2)*scale];
function at(station:number){
 const s=((station%length)+length)%length;
 let low=0,high=nodes.length-1;
 while(low<high){const mid=(low+high+1)>>1;if(nodes[mid].s<=s)low=mid;else high=mid-1;}
 const a=nodes[low],b=nodes[(low+1)%nodes.length],t=(s-a.s)/Math.max(.001,(b.s||length)-a.s);
 const pa=xy(a),pb=xy(b);return [pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t];
}
const gates=[0,...splits,length];
const paths=gates.slice(1).map((end,i)=>[at(gates[i]),...nodes.filter((n,j)=>n.s>gates[i] && n.s<end && j%3===0).map(xy),at(end)].map(p=>p.join(',')).join(' '));
const outline=nodes.filter((_,i)=>i%3===0).map(xy).concat([xy(nodes[0])]).map(p=>p.join(',')).join(' ');
const occupied:{x:number;y:number;w:number}[]=[];
const road=nodes.filter((_,i)=>i%3===0).map(xy);
const keyTurns=turns.map((s,i)=>{
 const p=at(s),a=at(s-12),b=at(s+12),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
 let nx=-dy/len,ny=dx/len;if(nx*(p[0]-150)+ny*(p[1]-110)<0){nx=-nx;ny=-ny;}
 const w=i<9?7:12;let best={x:p[0],y:p[1],score:Infinity};
 for(const side of [1,-1])for(let radius=10;radius<=72;radius+=3)for(const along of [0,-8,8,-16,16,-24,24,-36,36]){
   const x=p[0]+nx*radius*side+dx/len*along,y=p[1]+ny*radius*side+dy/len*along;
   if(x<w/2+4||x>296-w/2||y<9||y>211)continue;
   const overlap=occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+4&&Math.abs(y-o.y)<12);
   const onRoad=road.some(v=>Math.abs(x-v[0])<w/2+4&&Math.abs(y-v[1])<8);
   const score=radius+Math.abs(along)*.65+(side<0?8:0)+(overlap?10000:0)+(onRoad?1000:0);
   if(score<best.score)best={x,y,score};
 }
 occupied.push({...best,w});return {i,p,label:[best.x,best.y]};
});
const start=at(0),startAhead=at(10),startAngle=Math.atan2(startAhead[1]-start[1],startAhead[0]-start[0])*180/Math.PI;
return {at,paths,outline,keyTurns,start,startAngle,turns};
}
