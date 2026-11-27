import {drivingProfile} from './DrivingProfile';
import {PitLane} from './PitLane';
import * as T from 'three';
import {addBrakingBoards,cornerPlate} from './BrakingBoards';
import {TrackSurface} from './TrackSurface';
import type {CircuitData} from './CircuitData';
export type RoadStyle='soft'|'clear'|'outline';
export class CircuitTrack {
 pit:PitLane;
 readonly surface=new TrackSurface();
 get id(){return this.layout.id;}
 getSurfaceHeightAt(point:T.Vector3,includeKerbs=true){return this.surface.heightAt(point,includeKerbs);}
 getTrackElevationAt(s:number,offset=0){const p=this.point(s,offset);return this.surface.heightAt(p)??p.y;}
 group=new T.Group(); road:T.Mesh; curbs:T.Mesh; markings=new T.Group();signs=new T.Group();edges:T.LineSegments;bounds=new T.Box3();
 length:number;startForward:T.Vector3;startLeft:T.Vector3;spawn:T.Vector3;spawnSlope=0;
 curbFaces:{s:number,heights:number[][],faces:T.Triangle[]}[]=[];
 private sampleScratch={a:new T.Vector3(),b:new T.Vector3(),p:new T.Vector3(),left:new T.Vector3()};
 private curveScratch=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
 private curbPoint=new T.Vector3();private curbBary=new T.Vector3();
 private lastStyle?:RoadStyle;private lastUnder?:boolean;
 private curbBands:{start:number,end:number,side:number}[]=[];
 profile!:ReturnType<typeof drivingProfile>;
 aeroZone(s:number){return this.profile.zones.findIndex(z=>(z.end<z.start?this.wrap(s)>=z.start||this.wrap(s)<z.end:this.wrap(s)>=z.start&&this.wrap(s)<z.end))+1;}
 constructor(public layout:CircuitData,signage=true){
 this.length=layout.geometryLength;
 const data=layout;
 const start=this.rawSample(data.grid.s),front=this.rawSample(data.grid.s+1),back=this.rawSample(data.grid.s-1);
 this.startForward=front.clone().sub(back);this.spawnSlope=this.startForward.y/Math.hypot(this.startForward.x,this.startForward.z);this.startForward.y=0;this.startForward.normalize();this.startLeft=new T.Vector3(-this.startForward.z,0,this.startForward.x);
 this.spawn=start.addScaledVector(this.startLeft,data.grid.lateral);
 this.profile=drivingProfile(this);
 this.pit=new PitLane(this);
 const vertices:number[]=[],indices:number[]=[],curbVertices:number[]=[],curbColors:number[]=[],curbIndices:number[]=[],lines:T.Vector3[]=[];
 // Sample both boundaries once. Every kerb starts on the actual asphalt edge.
 const edgeCurve=(left:boolean)=>new T.CatmullRomCurve3(data.nodes.map(node=>
   this.point(node.s,left?node.widthLeft:-node.widthRight)),true);
 const leftEdge=edgeCurve(true),rightEdge=edgeCurve(false);
 const stations=new Set<number>([0,this.length]);
 for(let i=1;i<Math.ceil(this.length);i++)stations.add(i);
 const bands=layout.kerbs;
 const stripeLength=layout.kerbStripeLength;
 for(const band of bands){stations.add(band.start);stations.add(band.end);for(const s of band.stations)stations.add(s);}
 this.curbBands=bands;
 const uv:number[]=[];
 const ordered=[...stations].sort((a,b)=>a-b);
 const kerbTops:T.Vector3[][]=[];
 const rows=ordered.map(s=>{
   const t=s/this.length,left=leftEdge.getPoint(t),right=rightEdge.getPoint(t);
   vertices.push(...left.toArray(),...right.toArray());
   this.bounds.expandByPoint(left);this.bounds.expandByPoint(right);
   const half=left.distanceTo(right)/2;
   uv.push(half/2,s/2,-half/2,s/2);
   return {s,left,right,across:left.clone().sub(right).normalize()};
 });
 for(let i=0;i<rows.length-1;i++){
   const a=rows[i],b=rows[i+1],j=2*i;
   indices.push(j,j+2,j+1,j+1,j+2,j+3);
   lines.push(a.left,b.left,a.right,b.right);
   const mid=(ordered[i]+ordered[i+1])/2;
   const band=bands.find(zone=>mid>=zone.start && mid<zone.end);
   if(!band)continue;
   const side=band.side;
   const innerA=side>0?a.left:a.right,innerB=side>0?b.left:b.right;
   // Fade configured kerb end ramps in both width and height. Contact uses these same vertices.
   const taper=(s:number)=>band.taper?band.taper.minimum+(1-band.taper.minimum)*T.MathUtils.smoothstep(Math.min(s-band.start,band.end-s),0,band.taper.distance):1;
   const ta=taper(ordered[i]),tb=taper(ordered[i+1]);
   const outerA=innerA.clone().addScaledVector(a.across,band.width*ta*side);
   const outerB=innerB.clone().addScaledVector(b.across,band.width*tb*side);
   const flat=(p:T.Vector3)=>new T.Vector3(p.x,0,p.z);
   this.curbFaces.push({s:mid,heights:[[band.innerHeight*ta,band.innerHeight*tb,band.outerHeight*ta],[band.outerHeight*ta,band.innerHeight*tb,band.outerHeight*tb]],faces:[new T.Triangle(flat(innerA),flat(innerB),flat(outerA)),
     new T.Triangle(flat(outerA),flat(innerB),flat(outerB))]});
   if(this.pit){
     const top=(v:T.Vector3,h:number)=>new T.Vector3(v.x,v.y+h,v.z);
     const ia=top(innerA,band.innerHeight*ta),ib=top(innerB,band.innerHeight*tb),oa=top(outerA,band.outerHeight*ta),ob=top(outerB,band.outerHeight*tb);
     kerbTops.push([ia,ib,oa],[oa,ib,ob]);
   }
   const offset=curbVertices.length/3,color=new T.Color(Math.floor(mid/stripeLength)%2?0xd09b14:0x9d201c);
   for(const [k,v] of [innerA,outerA,innerB,outerB,innerA,innerB,outerA,outerB].entries()){
     curbVertices.push(v.x,v.y+([band.innerHeight*ta,band.outerHeight*ta,band.innerHeight*tb,band.outerHeight*tb,0,0,0,0][k]),v.z);
     curbColors.push(color.r,color.g,color.b);
   }
   // Close the raised inner lip down to the shared edge, including at grazing angles.
   const faces=[0,2,1,1,2,3,4,5,0,0,5,2,1,3,6,6,3,7,4,6,5,5,6,7];
   if(ordered[i]===band.start)faces.push(4,0,6,6,0,1);
   if(ordered[i+1]===band.end)faces.push(5,7,2,2,7,3);
   for(const index of faces)curbIndices.push(offset+index);
 }
 const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geom.setIndex(indices);geom.computeVertexNormals();
 geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 const size=128,pixels=new Uint8Array(size*size*4);
 let seed=1729;
 for(let i=0;i<pixels.length;i+=4){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const grain=156+(seed>>>25)*.65+(seed%19===0?18:0);
   pixels.fill(grain,i,i+3);pixels[i+3]=255;
 }
 const asphalt=new T.DataTexture(pixels,size,size);
 asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;
 asphalt.generateMipmaps=true;asphalt.minFilter=T.LinearMipmapLinearFilter;
 asphalt.magFilter=T.LinearFilter;asphalt.needsUpdate=true;
 this.road=new T.Mesh(geom,new T.MeshStandardMaterial({map:asphalt,bumpMap:asphalt,bumpScale:.0008,envMapIntensity:.08,color:0x343538,roughness:1,metalness:0,side:T.DoubleSide,transparent:true,opacity:.62}));this.road.name='Circuit road';this.group.add(this.road);
 if(this.pit){
   for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],junction=!(a.s>this.pit.exit+20&&b.s<this.length+this.pit.entry-20);this.surface.addFace(a.left,b.left,a.right,'asphalt',junction);this.surface.addFace(a.right,b.left,b.right,'asphalt',junction);}
   const lane=this.pit.surface(this.road.material as T.Material);
   for(const [a,b,c] of kerbTops)this.surface.addFace(a,b,c,'kerb');
   if(signage){this.road.add(lane.road);this.markings.add(lane.paint,this.pit.fence());}
   else{lane.road.geometry.dispose();lane.paint.geometry.dispose();(lane.paint.material as T.Material).dispose();}
 }
 const edgeGeom=new T.BufferGeometry().setFromPoints(lines);this.edges=new T.LineSegments(edgeGeom,new T.LineBasicMaterial({color:0xaaa899,transparent:true,opacity:.45}));this.group.add(this.edges);

 const cg=new T.BufferGeometry();cg.setAttribute('position',new T.Float32BufferAttribute(curbVertices,3));cg.setAttribute('color',new T.Float32BufferAttribute(curbColors,3));cg.setIndex(curbIndices);cg.computeVertexNormals();this.curbs=new T.Mesh(cg,new T.MeshStandardMaterial({vertexColors:true,roughness:.96,envMapIntensity:.14,side:T.DoubleSide}));this.group.add(this.curbs,this.markings);this.markings.add(this.signs);
 // Painted strips have physical width, so they foreshorten with the road.
 const paint:number[]=[],colors:number[]=[];
 const stripe=(back:number,front:number,right:number,left:number,color:T.Color)=>{
   const points=[this.point(back,right),this.point(back,left),this.point(front,left),this.point(front,right)];
   for(const i of [0,1,2,0,2,3]){
     const p=points[i];paint.push(p.x,p.y+.024,p.z);colors.push(color.r,color.g,color.b);
   }
 };
 const white=new T.Color(0xf5f3e9),yellow=new T.Color(0xe9bf43);
 for(let i=0;i<data.grid.rows*2;i++){
   const center=data.grid.s-i*data.grid.stagger;
   const gridOffset=data.grid.lateral||Math.min(3,this.width(center)-2);
   const lateral=i%2===0?gridOffset:-gridOffset;
   const half=data.grid.boxWidth/2,front=center+2.8;
   stripe(front-.12,front,lateral-half,lateral+half,white);
   for(const edge of [lateral-half,lateral+half-.12])stripe(front-1.6,front,edge,edge+.12,white);
   stripe(center+1.65,center+1.75,lateral-.48,lateral+.48,yellow);
 }
 stripe(-.14,0,-this.width(0),this.width(0),white);
 const painted=new T.BufferGeometry();
 painted.setAttribute('position',new T.Float32BufferAttribute(paint,3));
 painted.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 this.markings.add(new T.Mesh(painted,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})));
 if(signage)this.profile.turns.forEach((station,index)=>{
   const plate=cornerPlate(index+1);
   const outside=this.curvature(station)>0?-1:1;
   let offset=this.width(station,outside)+1.5;
   // Clear the entire sign face and the pit approach near pit approaches.
   while(this.pit && offset<60 && [-1,0,1].some(ds=>this.getSurfaceHeightAt(this.point(station+ds,outside*offset),false)!==undefined))offset+=1;
   plate.position.copy(this.point(station,outside*(offset+.6)));
   plate.quaternion.copy(this.pose(station).quaternion);plate.rotateY(Math.PI);this.signs.add(plate);
 });
 if(signage)addBrakingBoards(this);
 this.group.name=layout.name;
 }
 wrap(s:number){return ((s%this.length)+this.length)%this.length;}
 rawSample(s:number,target=new T.Vector3()){const w=this.wrap(s),n=this.layout.nodes.length,t=w/this.length*n,i=Math.floor(t),f=t-i,a=this.layout.nodes[i],b=this.layout.nodes[(i+1)%n];return target.set(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.z+(b.z-a.z)*f);}
 width(s:number,lateral=1){const i=Math.floor(this.wrap(s)/this.length*this.layout.nodes.length);return lateral>=0?this.layout.nodes[i].widthLeft:this.layout.nodes[i].widthRight;}
 point(s:number,lateral=0,target=new T.Vector3()){const scratch=this.sampleScratch,p=this.rawSample(s,scratch.p),f=this.rawSample(s+1,scratch.a).sub(this.rawSample(s-1,scratch.b));f.y=0;f.normalize();p.addScaledVector(scratch.left.set(-f.z,0,f.x),lateral);
 const node=this.layout.nodes[Math.floor(this.wrap(s)/this.length*this.layout.nodes.length)];p.y+=lateral*Math.tan((node.bankAngle??0)*Math.PI/180);p.sub(this.spawn);return target.set(p.dot(this.startLeft),p.y,p.dot(this.startForward));}
 curbSide(s:number){const band=this.curbBands.find(b=>s>=b.start && s<=b.end);return band?.side??0;}
 curbRise(station:number,contact:T.Vector3,across?:T.Vector3){
   // Strips are stored in station order. Only inspect triangles near this wheel.
   let lo=0,hi=this.curbFaces.length;
   while(lo<hi){
     const mid=(lo+hi)>>>1;
     if(this.curbFaces[mid].s<=station-15)lo=mid+1;else hi=mid;
   }
   if(lo===this.curbFaces.length || this.curbFaces[lo].s>=station+15)return 0;
   const point=this.curbPoint;
   const height=(fraction:number)=>{
     point.copy(contact);
     if(across)point.addScaledVector(across,fraction);
     point.y=0;
     for(let k=lo;k<this.curbFaces.length && this.curbFaces[k].s<station+15;k++)for(const [i,face] of this.curbFaces[k].faces.entries()){
       if(!face.containsPoint(point))continue;
       const bary=face.getBarycoord(point,this.curbBary);
       if(bary){const h=this.curbFaces[k].heights[i];return bary.x*h[0]+bary.y*h[1]+bary.z*h[2];}
     }
     return 0;
   };
   return across?.lengthSq()?(.25*height(-1)+.5*height(0)+.25*height(1)):height(0);
 }
 pose(s:number,lateral=0){const position=this.point(s,lateral),forward=this.point(s+2,lateral).sub(this.point(s-2,lateral)).normalize();const left=new T.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(left).normalize();return {position,forward,quaternion:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(left,up,forward))};}
 curvature(s:number,span=6){const [a,b,c]=this.curveScratch;this.point(s-span,0,a);this.point(s,0,b);this.point(s+span,0,c);const v=c.sub(b),u=b.sub(a);return Math.atan2(v.x*u.z-v.z*u.x,u.x*v.x+u.z*v.z)/Math.max(.01,(Math.hypot(u.x,u.z)+Math.hypot(v.x,v.z))/2);}
 setStyle(style:RoadStyle,under:boolean){if(style===this.lastStyle && under===this.lastUnder)return;this.lastStyle=style;this.lastUnder=under;const mat=this.road.material as T.MeshStandardMaterial;mat.transparent=under;mat.opacity=under?.08:1;mat.depthWrite=!under&&style!=='outline';this.road.visible=style!=='outline';mat.color.setHex(style==='clear'?0x292a2c:0x38393a);this.curbs.visible=!under;this.markings.visible=!under;(this.edges.material as T.LineBasicMaterial).opacity=under?.08:style==='outline'?.85:.35;}
 overview(){const c=this.bounds.getCenter(new T.Vector3()),size=this.bounds.getSize(new T.Vector3());return {target:c,position:c.clone().add(new T.Vector3(size.x*.25,Math.max(size.x,size.z)*1.3,Math.max(size.x,size.z)*.42))};}
 dispose(){this.surface.clear();const textures=new Set<T.Texture>(),materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>();this.group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const m of materials){for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);m.dispose();}for(const t of textures)t.dispose();for(const g of geometries)g.dispose();}

}
