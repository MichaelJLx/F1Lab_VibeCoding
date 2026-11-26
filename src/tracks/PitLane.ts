import * as T from 'three';
import type {SpaTrack} from './SpaTrack';

// Registered OpenStreetMap way 323851541, see docs/sources.md.
import path from './spa-pit-path.json';
import circuits from './circuit-pits.json';

export class PitLane {
 entry=-420;exit=490;limitEntry=-300;limitExit=325;speedLimit=80;halfWidth=3.2;
 get exitBlendStart(){return this.track.id==='spa'?350:this.exit-40;}
 get exitEnd(){return this.exit+150;}
 private centers:T.Vector3[]=[];
 private cells=new Map<string,T.Triangle[]>();
 constructor(private track:SpaTrack){
   const surveyed=circuits[track.id as keyof typeof circuits];
   if(surveyed){
     Object.assign(this,{entry:surveyed.entry,exit:surveyed.exit,limitEntry:surveyed.limitEntry,limitExit:surveyed.limitExit,speedLimit:surveyed.speedLimit,halfWidth:surveyed.halfWidth});
     const anchors=surveyed.points;
     const points=anchors.map(([,x,z])=>{const p=new T.Vector3(x,0,z).sub(track.spawn);return new T.Vector3(p.dot(track.startLeft),0,p.dot(track.startForward));});
     const curve=new T.CatmullRomCurve3(points,false,'centripetal');
     curve.arcLengthDivisions=Math.max(2000,points.length*40);
     const lengths=curve.getLengths(),gates=anchors.map((p,i)=>({s:p[0],u:lengths[Math.round(i*curve.arcLengthDivisions/(anchors.length-1))]/curve.getLength(),tunnel:p[3]}));
     const y0=track.point(this.entry).y,y1=track.point(this.exit).y;
     let k=0;
     for(let s=this.entry;s<=this.exit;s++){
       while(k+2<gates.length && gates[k+1].s<s)k++;
       const a=gates[k],b=gates[k+1],t=T.MathUtils.clamp((s-a.s)/(b.s-a.s),0,1),u=T.MathUtils.lerp(a.u,b.u,t);
       const p=curve.getPointAt(u);p.y=T.MathUtils.lerp(y0,y1,u);
       // The surveyed Yas Marina exit passes under the racing surface.
       if(track.id==='ae-2009')p.y-=5.5*T.MathUtils.smoothstep(s,80,250)*(1-T.MathUtils.smoothstep(s,610,830));
       this.centers.push(p);
     }
     // Match both position and tangent at each road junction.
     for(const outlet of [false,true]){
       const a=outlet?this.exit-60:this.entry,b=outlet?this.exit:this.entry+60;
       const p0=outlet?this.point(a):track.point(a),p1=outlet?track.point(b):this.point(b);
       const d0=outlet?this.point(a+1).sub(this.point(a-1)).normalize():track.point(a+1).sub(track.point(a-1)).normalize();
       const d1=outlet?track.point(b+1).sub(track.point(b-1)).normalize():this.point(b+1).sub(this.point(b-1)).normalize();
       const span=p0.distanceTo(p1);
       for(let station=a;station<=b;station++){
         const t=(station-a)/(b-a),u=1-t;
         this.centers[station-this.entry].copy(p0).multiplyScalar(u*u*(1+2*t)).addScaledVector(p1,t*t*(3-2*t))
           .addScaledVector(d0,span*t*u*u).addScaledVector(d1,-span*t*t*u);
       }
     }
     return;
   }
   const anchors=[[-420,...this.xy(-420)],...path,[490,...this.xy(490)]];
   const curve=new T.CatmullRomCurve3(anchors.map(([,x,z])=>new T.Vector3(x,0,z)));
   curve.arcLengthDivisions=3000;
   const arc=curve.getLengths();
   const gates=anchors.map((v,i)=>({s:v[0],arc:arc[Math.round(i*3000/(anchors.length-1))]}))
     .filter(v=>v.s<=171.35 || v.s>=315.91);
   let i=0;
   for(let s=-420;s<=490;s++){
     while(i+2<gates.length && gates[i+1].s<s)i++;
     const a=gates[i],b=gates[i+1],t=(s-a.s)/(b.s-a.s);
     const raw=curve.getPointAt(T.MathUtils.lerp(a.arc,b.arc,t)/curve.getLength()).sub(track.spawn);
     this.centers.push(new T.Vector3(raw.dot(track.startLeft),track.point(s).y,raw.dot(track.startForward)));
   }

   // Continue from the surveyed exit tangent into the near edge of the main straight.
   // Keep the paved connector separate from the subsequent move to the racing line.
   const join=379,end=490,start=this.point(join);
   const dir=this.point(join).sub(this.point(join-5)).normalize();
   const centre=track.point(end),axis=track.point(end+1).sub(track.point(end-1)).normalize();
   const left=new T.Vector3(axis.z,0,-axis.x).normalize();
   const side=Math.sign(start.clone().sub(track.point(join)).dot(left));
   const dest=centre.addScaledVector(left,side*(track.width(end,side)-this.halfWidth-.3));
   const span=start.distanceTo(dest);
   for(let s=join+1;s<=end;s++){
     const t=(s-join)/(end-join),u=1-t;
     const point=this.centers[s+420],height=point.y;
     point.copy(start).multiplyScalar(u*u*(1+2*t)).addScaledVector(dest,t*t*(3-2*t))
       .addScaledVector(dir,span*t*u*u).addScaledVector(axis,-span*t*t*u);
     point.y=height;
   }
   // The pit shortcut covers less ground than T1. Interpolate its grade
   // by its own horizontal arc length and match the slopes at both joins.
   const first=420+171,last=420+316,distances=[0];
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
 private xy(s:number){const p=this.track.rawSample(s);return [p.x,p.z];}
 point(s:number){
   const t=T.MathUtils.clamp(s-this.entry,0,this.centers.length-1),i=Math.floor(t);
   return this.centers[i].clone().lerp(this.centers[Math.min(i+1,this.centers.length-1)],t-i);
 }
 exitLine(s:number,race:T.Vector3){
   if(s<=this.exit)return this.point(s);
   const t=T.MathUtils.clamp((s-this.exit)/150,0,1);
   const offset=this.point(this.exit).sub(this.track.point(this.exit));
   const edge=this.track.point(s).add(offset);
   return edge.lerp(race,t*t*t*(10-15*t+6*t*t));
 }
 blend(s:number){
   if(this.track.id!=='spa')return T.MathUtils.smootherstep(s,this.entry,this.entry+35)*(1-T.MathUtils.smootherstep(s,this.exit-30,this.exit));
   return T.MathUtils.smoothstep(s,-378,-353)*(1-T.MathUtils.smoothstep(s,376,485));
 }
 private kerbFaces=new WeakSet<T.Triangle>();
 addFace(a:T.Vector3,b:T.Vector3,c:T.Vector3,kerb=false){
   const triangle=new T.Triangle(a,b,c);
   if(kerb)this.kerbFaces.add(triangle);
   const bounds=new T.Box3().setFromPoints([a,b,c]);
   for(let x=Math.floor(bounds.min.x/8);x<=Math.floor(bounds.max.x/8);x++)
     for(let z=Math.floor(bounds.min.z/8);z<=Math.floor(bounds.max.z/8);z++){
       const key=x+','+z,cell=this.cells.get(key);
       if(cell)cell.push(triangle);else this.cells.set(key,[triangle]);
     }
 }
 heightAt(point:T.Vector3,includeKerbs=true){
   const faces=this.cells.get(Math.floor(point.x/8)+','+Math.floor(point.z/8));
   if(!faces)return undefined;
   let best:number|undefined;
   for(const face of faces){
     if(!includeKerbs && this.kerbFaces.has(face))continue;
     const {a,b,c}=face;
     const x=point.x-a.x,z=point.z-a.z,bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z;
     const det=bx*cz-bz*cx;
     if(Math.abs(det)<1e-8)continue;
     const u=(x*cz-z*cx)/det,v=(bx*z-bz*x)/det;
     if(u>=-1e-6 && v>=-1e-6 && u+v<=1.000001){const y=a.y+u*(b.y-a.y)+v*(c.y-a.y);if(best===undefined || Math.abs(y-point.y)<Math.abs(best-point.y))best=y;}
   }
   return best;
 }
 // Modelled divider in the available median. Both ends stop before the merge paint.
 fence(){
   const frame:number[]=[],wire:number[]=[];
   const posts:T.Vector3[]=[];
   const baseHeight=.55,meshHeight=1.45,pitch=.16;
   const row=(s:number)=>{
     const {inner,left}=this.edges(s);
     const foot=inner.addScaledVector(left,.4);
     return this.mainHeightNear(foot.clone().addScaledVector(left,.6))===undefined &&
       this.mainHeightNear(foot)===undefined ? foot : undefined;
   };
   let previous:T.Vector3|undefined;
   for(let s=this.limitEntry;s<=this.exit;s+=4){
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
   const group=new T.Group();group.name='Pit divider';
   const wall=geometry(frame);wall.computeVertexNormals();
   group.add(new T.Mesh(wall,new T.MeshStandardMaterial({color:0x939590,roughness:.88,side:T.DoubleSide})));
   group.add(new T.LineSegments(geometry(wire),new T.LineBasicMaterial({color:0x465150,transparent:true,opacity:.48,depthWrite:false})));
   const uprights=new T.InstancedMesh(new T.BoxGeometry(.075,2,.075),new T.MeshStandardMaterial({color:0x606b6a,roughness:.7}),posts.length);
   posts.forEach((p,i)=>uprights.setMatrixAt(i,new T.Matrix4().makeTranslation(p.x,p.y+1,p.z)));
   group.add(uprights);return group;
 }
 private mainCells=new Map<string,T.Triangle[]>();
 private mainHeightNear(p:T.Vector3){
   const cell=this.mainCells.get(Math.floor(p.x/8)+','+Math.floor(p.z/8));
   if(!cell)return undefined;
   for(const tri of cell){
     const {a,b,c}=tri;
     const cross=(u:T.Vector3,v:T.Vector3)=>(v.x-u.x)*(p.z-u.z)-(v.z-u.z)*(p.x-u.x);
     const sides=[cross(a,b),cross(b,c),cross(c,a)];
     if(sides.every(v=>v>=0)||sides.every(v=>v<=0))return true;
   }
 }
 private edges(s:number){
   const center=this.point(s),dir=this.point(s+1).sub(this.point(s-1));
   const left=new T.Vector3(dir.z,0,-dir.x).normalize();
   if(this.track.id!=='spa' && this.track.point(s).sub(center).dot(left)<0)left.negate();
   // Taper the outlet only after its wheels are supported by the main road.
   const width=this.track.id==='spa'?this.halfWidth*T.MathUtils.smootherstep(s,-378,-357)*(1-.75*T.MathUtils.smootherstep(s,420,490)):this.halfWidth;
   return {left,inner:center.clone().addScaledVector(left,width),outer:center.clone().addScaledVector(left,-width)};
 }
 surface(rows:{s:number,left:T.Vector3,right:T.Vector3}[],asphalt:T.Material){
   const pos:number[]=[],uv:number[]=[],paint:number[]=[],colors:number[]=[];
   for(let i=1;i<rows.length;i++){
     const a=rows[i-1],b=rows[i];
     if(a.s>this.exit+20 && b.s<this.track.length+this.entry-20)continue;
     this.addFace(a.left,b.left,a.right);this.addFace(a.right,b.left,b.right);
   }
   this.cells.forEach((faces,key)=>this.mainCells.set(key,[...faces]));
   for(let i=1;i<rows.length;i++){
     const a=rows[i-1],b=rows[i];
     if(a.s<=this.exit+20 || b.s>=this.track.length+this.entry-20)continue;
     this.addFace(a.left,b.left,a.right);this.addFace(a.right,b.left,b.right);
   }
   // At shared pavement the lane must use the road deck's actual elevation.
   // Fade that correction along the lane before/after the overlap, retaining
   // independent height where an exit passes underneath the main circuit.
   if(this.track.id!=='spa'){
     const correction=this.centers.map(p=>{const y=this.heightAt(p);return y!==undefined&&Math.abs(y-p.y)<2?y-p.y:undefined;});
     const before:number[]=[],after:number[]=[];let nearest=-1;
     for(let i=0;i<correction.length;i++){if(correction[i]!==undefined)nearest=i;before[i]=nearest;}
     nearest=-1;for(let i=correction.length-1;i>=0;i--){if(correction[i]!==undefined)nearest=i;after[i]=nearest;}
     this.centers.forEach((p,i)=>{
       if(correction[i]!==undefined){p.y+=correction[i]!;return;}
       let delta=0,weight=0;
       for(const j of [before[i],after[i]])if(j>=0){const w=1-T.MathUtils.smoothstep(Math.abs(i-j),0,30);delta+=correction[j]!*w;weight+=w;}
       p.y+=delta/Math.max(1,weight);
     });
   }
   // Subtract the actual main-road triangles in plan view. Each surviving
   // polygon retains its pit-lane elevation and cannot cross the merge seam.
   const emit=(polygon:T.Vector3[],stripe=false,box=false)=>{
     const bounds=new T.Box3().setFromPoints(polygon),near=new Set<T.Triangle>();
     for(let x=Math.floor(bounds.min.x/8);x<=Math.floor(bounds.max.x/8);x++)
       for(let z=Math.floor(bounds.min.z/8);z<=Math.floor(bounds.max.z/8);z++)
         this.mainCells.get(x+','+z)?.forEach(f=>near.add(f));
     let pieces=[polygon];
     for(const {a,b,c} of near){
       if(Math.abs((a.y+b.y+c.y)/3-polygon.reduce((v,p)=>v+p.y,0)/polygon.length)>2)continue;
       const sign=Math.sign((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
       if(!sign)continue;
       const remaining:T.Vector3[][]=[];
       for(const piece of pieces){
         let inside=piece;
         for(const [u,v] of [[a,b],[b,c],[c,a]]){
           const d=(p:T.Vector3)=>sign*((v.x-u.x)*(p.z-u.z)-(v.z-u.z)*(p.x-u.x));
           if(inside.every(p=>d(p)>=0))continue;
           if(inside.every(p=>d(p)<=0)){remaining.push(inside);inside=[];break;}
           const keep:T.Vector3[]=[],outside:T.Vector3[]=[];
           inside.forEach((p,j)=>{
             const q=inside[(j+1)%inside.length],dp=d(p),dq=d(q);
             if(dp>=0)keep.push(p);
             if(dp<=0)outside.push(p);
             if(dp*dq<0){const cut=p.clone().lerp(q,dp/(dp-dq));
               // Match the elevation only on the finite main-road edge. The
               // clipping half-plane can also intersect far beyond its endpoints.
               const dx=v.x-u.x,dz=v.z-u.z;
               const along=((cut.x-u.x)*dx+(cut.z-u.z)*dz)/(dx*dx+dz*dz);
               if(along>=0 && along<=1)cut.y=T.MathUtils.lerp(u.y,v.y,along);
               keep.push(cut);outside.push(cut);}
           });
           if(outside.length>=3)remaining.push(outside);
           inside=keep;
         }
       }
       pieces=remaining;
     }
     for(const poly of pieces)for(let j=1;j+1<poly.length;j++){
       const tri=[poly[0],poly[j],poly[j+1]] as const;
       if(!stripe)this.addFace(...tri);
       for(const p of tri){
         if(stripe){paint.push(p.x,p.y+.007,p.z);colors.push(...(box?[.68,.39,.08]:[.68,.63,.54]));}
         else {pos.push(...p.toArray());uv.push(p.x/2,p.z/2);}
       }
     }
   };
   for(let s=this.track.id==='spa'?-378:this.entry;s<this.exit;s++){
     const a=this.edges(s),b=this.edges(s+1);
     emit([a.inner,b.inner,a.outer]);emit([a.outer,b.inner,b.outer]);
     for(const side of [-1,1]){
       const garage=this.track.layout.grid.s;
       if(s>=garage-3 && s<garage+3){
         const offset=side*1.5;
         const mark=(station:number,x:number)=>this.point(station).addScaledVector(this.edges(station).left,x);
         emit([mark(s,offset),mark(s+1,offset),mark(s+1,offset+.12),mark(s,offset+.12)],true,true);
       }
       const edge=side>0?'inner':'outer';
       emit([a[edge],b[edge],b[edge].clone().addScaledVector(b.left,-side*.12),a[edge].clone().addScaledVector(a.left,-side*.12)],true);
     }
   }
   const geometry=(vertices:number[])=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   if(this.track.id!=='spa')for(const p of this.centers){
     const y=this.heightAt(p);if(y!==undefined&&Math.abs(y-p.y)<2)p.y=y;
   }
   const base=geometry(pos);base.setAttribute('uv',new T.Float32BufferAttribute(uv,2));base.computeVertexNormals();
   return {road:new T.Mesh(base,asphalt),paint:new T.Mesh(geometry(paint).setAttribute('color',new T.Float32BufferAttribute(colors,3)),new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}))};
 }
}
