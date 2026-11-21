import * as T from 'three';
import type {SpaTrack} from './SpaTrack';

// Engineering estimates in metres, relative to the finish line. Negative offsets are on driver's right.
const stations=[-420,-400,-382,-360,-300,-210,-100,-10,75,151,196,225,266,325,405,490];
const offsets=[0,-1,-2,-3,-9,-13,-14,-14,-14,-12,-9,-6.9,-10.5,-11,-5,0];
const halfWidth=3.2;
export class PitLane {
 private centers:T.Vector3[]=[];
 private cells=new Map<string,T.Triangle[]>();
 constructor(private track:SpaTrack){
   for(let s=-420;s<=490;s++){
     const lateral=this.offset(s);
     this.centers.push(track.point(s,lateral));
   }
   // Round the independent pit exit inside La Source before joining the downhill straight.
   const raw=this.centers;
   this.centers=raw.map((p,i)=>{
     const station=i-420;
     const bend=T.MathUtils.smoothstep(station,140,205)*(1-T.MathUtils.smoothstep(station,285,345));
     const sigma=station<-300 ? 2.5 : 7+17*bend;
     const result=new T.Vector3();let total=0;
     for(let j=Math.max(0,i-Math.ceil(3*sigma));j<=Math.min(raw.length-1,i+3*sigma);j++){
       const weight=Math.exp(-.5*((j-i)/sigma)**2);
       result.addScaledVector(raw[j],weight);total+=weight;
     }
     return result.divideScalar(total);
   });
   // The pit shortcut covers less ground than T1. Interpolate its grade
   // by its own horizontal arc length and match the slopes at both joins.
   const first=420+160,last=420+340,distances=[0];
   const horizontal=(a:T.Vector3,b:T.Vector3)=>Math.hypot(b.x-a.x,b.z-a.z);
   const grade=(a:T.Vector3,b:T.Vector3)=>(b.y-a.y)/horizontal(a,b);
   const entry=this.centers[first],exit=this.centers[last];
   const startGrade=grade(this.centers[first-1],entry),endGrade=grade(exit,this.centers[last+1]);
   for(let i=first+1;i<=last;i++){
     distances.push(distances[i-first-1]+horizontal(this.centers[i-1],this.centers[i]));
   }
   const length=distances[last-first];
   for(let i=first+1;i<last;i++){
     const t=distances[i-first]/length,u=1-t;
     this.centers[i].y=u*u*(1+2*t)*entry.y+t*t*(3-2*t)*exit.y+
       length*t*u*(u*startGrade-t*endGrade);
   }
 }
 private offset(s:number){
   let i=1;
   while(i<stations.length-1 && stations[i]<s)i++;
   const t=T.MathUtils.smoothstep(s,stations[i-1],stations[i]);
   return T.MathUtils.lerp(offsets[i-1],offsets[i],t);
 }
 point(s:number){
   const t=T.MathUtils.clamp(s+420,0,this.centers.length-1),i=Math.floor(t);
   return this.centers[i].clone().lerp(this.centers[Math.min(i+1,this.centers.length-1)],t-i);
 }
 blend(s:number){
   return T.MathUtils.smoothstep(s,-420,-380)*(1-T.MathUtils.smoothstep(s,445,490));
 }
 private addFace(a:T.Vector3,b:T.Vector3,c:T.Vector3){
   const triangle=new T.Triangle(a,b,c);
   const bounds=new T.Box3().setFromPoints([a,b,c]);
   for(let x=Math.floor(bounds.min.x/8);x<=Math.floor(bounds.max.x/8);x++)
     for(let z=Math.floor(bounds.min.z/8);z<=Math.floor(bounds.max.z/8);z++){
       const key=x+','+z,cell=this.cells.get(key);
       if(cell)cell.push(triangle);else this.cells.set(key,[triangle]);
     }
 }
 heightAt(point:T.Vector3){
   const faces=this.cells.get(Math.floor(point.x/8)+','+Math.floor(point.z/8));
   if(!faces)return undefined;
   for(const {a,b,c} of faces){
     const x=point.x-a.x,z=point.z-a.z,bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z;
     const det=bx*cz-bz*cx;
     if(Math.abs(det)<1e-8)continue;
     const u=(x*cz-z*cx)/det,v=(bx*z-bz*x)/det;
     if(u>=-1e-6 && v>=-1e-6 && u+v<=1.000001)return a.y+u*(b.y-a.y)+v*(c.y-a.y);
   }
 }
 // Modelled divider in the available median. Both ends stop before the merge paint.
 fence(){
   const frame:number[]=[],wire:number[]=[];
   const posts:T.Vector3[]=[];
   const baseHeight=.55,meshHeight=1.45,pitch=.16;
   const row=(s:number)=>{
     const roadEdge=this.track.width(s,-1);
     const center=this.point(s),edge=this.track.point(s,-roadEdge);
     const outward=this.track.point(s,-roadEdge-1).sub(edge).normalize();
     const separation=center.sub(edge).dot(outward);
     // The median narrows around La Source. Follow the track edge until
     // the two drivable corridors converge at the entry or exit taper.
     if(separation<1.25)return undefined;
     return edge.addScaledVector(outward,Math.max(.02,(separation-halfWidth)/2));

   };
   let previous:T.Vector3|undefined;
   for(let s=-420;s<=490;s+=4){
     const next=row(s);
     if(next)posts.push(next);
     if(previous && next){
       const a=previous,b=next,length=a.distanceTo(b);
       const side=new T.Vector3(b.z-a.z,0,a.x-b.x).normalize();
       const point=(x:number,y:number,offset=0)=>{
         const p=a.clone().lerp(b,x/length).addScaledVector(side,offset);p.y+=y;return p;
       };
       // A continuous low wall and top rail give the mesh a readable silhouette.
       for(const [bottom,top,radius] of [[0,baseHeight,.14],[1.98,2.02,.025]]){
         const section=[[-radius,bottom],[-radius,top],[radius,top],[radius,bottom]];
         for(let k=0;k<3;k++){
           const [x,y]=section[k],[u,v]=section[k+1];
           for(const p of [point(0,y,x),point(length,y,x),point(0,v,u),point(length,y,x),point(length,v,u),point(0,v,u)])frame.push(...p.toArray());
         }
       }
       // Clip both diagonal families to the panel perimeter.
       for(let t=-meshHeight;t<length;t+=pitch){
         const x0=Math.max(t,0),x1=Math.min(t+meshHeight,length);
         if(x1<=x0)continue;
         for(const rising of [true,false]){
           const h=(x:number)=>baseHeight+(rising?x-t:meshHeight-x+t);
           wire.push(...point(x0,h(x0)).toArray(),...point(x1,h(x1)).toArray());
         }
       }
     }
     previous=next;
   }
   const geometry=(v:number[])=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(v,3));
   const group=new T.Group();group.name='Spa pit divider';
   const wall=geometry(frame);wall.computeVertexNormals();
   group.add(new T.Mesh(wall,new T.MeshStandardMaterial({color:0x939590,roughness:.88,side:T.DoubleSide})));
   group.add(new T.LineSegments(geometry(wire),new T.LineBasicMaterial({color:0x465150,transparent:true,opacity:.48,depthWrite:false})));
   const uprights=new T.InstancedMesh(new T.BoxGeometry(.075,2,.075),new T.MeshStandardMaterial({color:0x606b6a,roughness:.7}),posts.length);
   posts.forEach((p,i)=>uprights.setMatrixAt(i,new T.Matrix4().makeTranslation(p.x,p.y+1,p.z)));
   group.add(uprights);return group;
 }
 // Extend only the exposed portion of each main-road cross-section.
 // The inner edge is clipped to the exact asphalt vertex, including fractional kerb rows.
 surface(rows:{s:number,left:T.Vector3,right:T.Vector3}[],asphalt:T.Material){
   const pos:number[]=[],uv:number[]=[],median:number[]=[],paint:number[]=[],colors:number[]=[];
   const stripe=(a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3,color:T.Color)=>{
     for(const v of [a,b,c,b,d,c]){paint.push(v.x,v.y+.007,v.z);colors.push(color.r,color.g,color.b);}
   };
   const white=new T.Color(0xd4ccc0),yellow=new T.Color(0xd4a64e);
   const section=(row:typeof rows[number])=>{
     const s=row.s>this.track.length/2?row.s-this.track.length:row.s;
     const normal=row.right.clone().sub(row.left).normalize();
     const pit=this.point(s);
     const tangent=this.point(s+1).sub(this.point(s-1));
     const outward=new T.Vector3(tangent.z,0,-tangent.x).normalize();
     if(outward.dot(normal)<0)outward.negate();
     const outside=pit.clone().addScaledVector(outward,halfWidth);
     const inside=pit.clone().addScaledVector(outward,-halfWidth);
     const far=outside.clone().sub(row.right).dot(normal);
     const near=Math.max(0,inside.clone().sub(row.right).dot(normal));
     const outer=far>0?outside:row.right,inner=near>0?inside:row.right;
     const at=(d:number)=>inner.clone().lerp(outer,(d-near)/Math.max(.0001,far-near));
     return {s,near,far:Math.max(0,far),at,inner,outer};
   };
   for(let i=1;i<rows.length;i++){
     const a=rows[i-1],b=rows[i];
     if(a.s>510 && b.s<this.track.length-440)continue;
     this.addFace(a.left,b.left,a.right);this.addFace(a.right,b.left,b.right);
     const l=section(a),r=section(b);
     if(l.far===0 && r.far===0)continue;
     if(l.near>0 || r.near>0){
       for(const p of [a.right,l.inner,b.right,l.inner,r.inner,b.right])median.push(p.x,p.y-.012,p.z);
     }
     this.addFace(l.inner,l.outer,r.inner);this.addFace(l.outer,r.outer,r.inner);
     for(const [v,d,s] of [[l.inner,l.near,a.s],[l.outer,l.far,a.s],[r.inner,r.near,b.s],[l.outer,l.far,a.s],[r.outer,r.far,b.s],[r.inner,r.near,b.s]] as const){
       pos.push(v.x,v.y,v.z);uv.push(-d/2,s/2);
     }
     stripe(l.outer,l.at(Math.max(l.near,l.far-.13)),r.outer,r.at(Math.max(r.near,r.far-.13)),white);
     if(l.near>0 && r.near>0)stripe(l.inner,l.at(l.near+.13),r.inner,r.at(r.near+.13),white);
     if(l.s>=-13 && r.s<=-7)for(const side of [-1,1]){
       const x=(l.near+l.far)/2+side*1.5,y=(r.near+r.far)/2+side*1.5;
       stripe(l.at(x),l.at(x+.12),r.at(y),r.at(y+.12),yellow);
     }
   }
   const base=new T.BufferGeometry();base.setAttribute('position',new T.Float32BufferAttribute(pos,3));
   base.setAttribute('uv',new T.Float32BufferAttribute(uv,2));base.computeVertexNormals();
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(paint,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
   const slab=new T.BufferGeometry();slab.setAttribute('position',new T.Float32BufferAttribute(median,3));slab.computeVertexNormals();
   return {road:new T.Mesh(base,asphalt),median:new T.Mesh(slab,new T.MeshStandardMaterial({color:0x77766d,roughness:1,side:T.DoubleSide})),paint:new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}))};
 }
}
