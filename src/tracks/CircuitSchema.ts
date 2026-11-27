import type {CircuitData} from './CircuitData';
/** Validate at import/build boundaries, never inside the render or physics loop. */
export function validateCircuit(value:unknown):asserts value is CircuitData{
 const d=value as CircuitData;
 const require=(ok:unknown,message:string)=>{if(!ok)throw new Error(`${d?.id??'Circuit'}: ${message}`);};
 require(d&&d.schemaVersion===1,'unsupported schema');
 require(typeof d.id==='string'&&typeof d.name==='string'&&typeof d.shortName==='string','identity');
 require(d.display&&typeof d.display.name==='string'&&typeof d.display.region==='string','display');
 require(Number.isInteger(d.raceLaps)&&d.raceLaps>0&&Array.isArray(d.sources)&&d.sources.every(s=>typeof s==='string'),'race and sources');
 const finite=(n:number)=>Number.isFinite(n);
 require(finite(d.geometryLength)&&d.geometryLength>500&&d.officialLength>0,'length');
 require(d.nodes?.length>50,'centreline');
 for(const [i,n] of d.nodes.entries()){
   require([n.s,n.x,n.y,n.z,n.widthLeft,n.widthRight].every(finite),'node numbers');
   require(n.widthLeft>0&&n.widthRight>0&&n.s>=0&&n.s<d.geometryLength,'node bounds');
   require(i===0?n.s===0:n.s>d.nodes[i-1].s,'ordered station samples');
   require(Math.abs(n.s-i*d.geometryLength/d.nodes.length)<.02,'uniform centreline spacing');
 }
 require(d.grid&&Object.values(d.grid).filter(v=>typeof v==='number').every(finite),'grid');
 require(d.kerbStripeLength>0&&Array.isArray(d.kerbs),'kerbs');
 for(const k of d.kerbs)require(k.start>=0&&k.end<=d.geometryLength&&k.end>k.start&&Math.abs(k.side)===1&&k.width>0&&k.stations.every(s=>finite(s)&&s>k.start&&s<k.end),'kerb interval');
 const p=d.pit;
 require(p&&p.entry<0&&p.exit>0&&p.limitEntry>=p.entry&&p.limitExit<=p.exit&&p.limitEntry<p.limitExit,'pit limits');
 require(p.points?.length===Math.floor(p.exit-p.entry)+1&&p.points.every(v=>v.length===3&&v.every(finite)),'pit centreline');
 require(p.surfacePoints?.length===p.points.length&&p.surfacePoints.every(v=>v.length===3&&v.every(finite)),'pit surface centreline');
 require(p.box.station>=p.entry&&p.box.station<=p.exit&&p.box.length>0&&p.halfWidth>0&&p.speedLimit>0,'pit box');
 require(p.approach.kind==='junction'||(p.approach.kind==='blend'&&p.approach.blendIn?.length===2&&p.approach.blendOut?.length===2),'pit approach');
 const f=d.driving;
 require(f&&f.turns.length>0&&f.turnNames.length===f.turns.length,'corner names');
 require(f.turns.every((s,i)=>finite(s)&&s>=0&&s<d.geometryLength&&(i===0||s>=f.turns[i-1])),'corner stations');
 require(f.splits.length===2&&f.splits[0]>0&&f.splits[1]>f.splits[0]&&f.splits[1]<d.geometryLength,'timing sectors');
 require(f.groups.flatMap(g=>Array.from({length:g.last-g.turn+1},(_,i)=>g.turn+i)).join(',')===f.turns.map((_,i)=>i).join(','),'complete corner groups');
 for(const z of f.zones)require([z.start,z.end].every(s=>finite(s)&&s>=0&&s<d.geometryLength)&&z.start!==z.end,'aero zone');
 if(d.reference){const r=d.reference;require([r.raceOffsets,r.lineOffsets,r.fastOffsets,r.smoothing].every(a=>a.length===d.nodes.length),'reference line sample count');require(r.speed.every(p=>finite(p.s)&&finite(p.speed)),'reference speeds');}
}
