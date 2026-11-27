import * as T from 'three';
import type {CircuitTrack} from './CircuitTrack';

export class PitLane {
 get entry(){return this.track.layout.pit.entry;}get exit(){return this.track.layout.pit.exit;}
 get limitEntry(){return this.track.layout.pit.limitEntry;}get limitExit(){return this.track.layout.pit.limitExit;}
 get speedLimit(){return this.track.layout.pit.speedLimit;}get halfWidth(){return this.track.layout.pit.halfWidth;}
 get exitBlendStart(){return this.track.layout.pit.exitBlendStart;}get exitEnd(){return this.track.layout.pit.exitEnd;}
 private centers:T.Vector3[];
 constructor(private track:CircuitTrack){this.centers=track.layout.pit.points.map(p=>new T.Vector3().fromArray(p));}
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
 blend(s:number){const a=this.track.layout.pit.approach;return a.kind==='blend'?T.MathUtils.smoothstep(s,...a.blendIn!)*(1-T.MathUtils.smoothstep(s,...a.blendOut!)):T.MathUtils.smootherstep(s,this.entry,this.entry+35)*(1-T.MathUtils.smootherstep(s,this.exit-30,this.exit));}
 // Modelled divider in the available median. Both ends stop before the merge paint.
 fence(){
   const frame:number[]=[],wire:number[]=[];
   const posts:T.Vector3[]=[];
   const baseHeight=.55,meshHeight=1.45,pitch=.16;
   const row=(s:number)=>{
     const {inner,left}=this.edges(s);
     const foot=inner.addScaledVector(left,.4);
     return !this.track.surface.onJunction(foot.clone().addScaledVector(left,.6)) &&
       !this.track.surface.onJunction(foot) ? foot : undefined;
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
 private edges(s:number){
   const center=this.point(s),dir=this.point(s+1).sub(this.point(s-1));
   const left=new T.Vector3(dir.z,0,-dir.x).normalize();
   if(this.track.layout.pit.edge.orientation==='toward-track' && this.track.point(s).sub(center).dot(left)<0)left.negate();
   // Taper the outlet only after its wheels are supported by the main road.
   const edge=this.track.layout.pit.edge;
   const width=this.halfWidth*(edge.start?T.MathUtils.smootherstep(s,...edge.start):1)*(1-(edge.narrowing??0)*(edge.end?T.MathUtils.smootherstep(s,...edge.end):0));
   return {left,inner:center.clone().addScaledVector(left,width),outer:center.clone().addScaledVector(left,-width)};
 }
 surface(asphalt:T.Material){
   const route=this.centers;this.centers=this.track.layout.pit.surfacePoints.map(p=>new T.Vector3().fromArray(p));
   const pos:number[]=[],uv:number[]=[],paint:number[]=[],colors:number[]=[];
   // Subtract the actual main-road triangles in plan view. Each surviving
   // polygon retains its pit-lane elevation and cannot cross the merge seam.
   const emit=(polygon:T.Vector3[],stripe=false,box=false)=>{
     const bounds=new T.Box3().setFromPoints(polygon),near=this.track.surface.junctionFaces(bounds);
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
       if(!stripe)this.track.surface.addFace(...tri,'pit');
       for(const p of tri){
         if(stripe){paint.push(p.x,p.y+.007,p.z);colors.push(...(box?[.68,.39,.08]:[.68,.63,.54]));}
         else {pos.push(...p.toArray());uv.push(p.x/2,p.z/2);}
       }
     }
   };
   for(let s=this.track.layout.pit.surfaceStart;s<this.exit;s++){
     const a=this.edges(s),b=this.edges(s+1);
     emit([a.inner,b.inner,a.outer]);emit([a.outer,b.inner,b.outer]);
     for(const side of [-1,1]){
       const garage=this.track.layout.pit.box.station;
       if(s>=garage-this.track.layout.pit.box.length/2 && s<garage+this.track.layout.pit.box.length/2){
         const offset=side*1.5;
         const mark=(station:number,x:number)=>this.point(station).addScaledVector(this.edges(station).left,x);
         emit([mark(s,offset),mark(s+1,offset),mark(s+1,offset+.12),mark(s,offset+.12)],true,true);
       }
       const edge=side>0?'inner':'outer';
       emit([a[edge],b[edge],b[edge].clone().addScaledVector(b.left,-side*.12),a[edge].clone().addScaledVector(a.left,-side*.12)],true);
     }
   }
   const geometry=(vertices:number[])=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   this.centers=route;
   const base=geometry(pos);base.setAttribute('uv',new T.Float32BufferAttribute(uv,2));base.computeVertexNormals();
   return {road:new T.Mesh(base,asphalt),paint:new T.Mesh(geometry(paint).setAttribute('color',new T.Float32BufferAttribute(colors,3)),new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}))};
 }
}
