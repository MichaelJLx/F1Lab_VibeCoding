import * as T from 'three';
import type {SpaTrack} from '../tracks/SpaTrack';
import {spaData} from '../tracks/SpaTrack';
import data from '../tracks/spa-racing-line.json';
export const racingLineData=data;
export class RacingLine {
 group=new T.Group();
 curve:T.CatmullRomCurve3;mesh:T.Mesh;
 alternatives=new T.LineSegments(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#acb8c6',transparent:true,opacity:.32,dashSize:1.4,gapSize:2.1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 // Display state never calls the driver or changes a planned path.
 setVisible(selected:boolean,candidates:boolean){this.mesh.visible=selected;this.alternatives.visible=candidates;}
 private onSurface(point:T.Vector3){point.y=(this.track.pit?.heightAt(point)??point.y)+.03;return point;}
 setAlternatives(points:number[]){
   const lifted=points.slice(),point=new T.Vector3();
   for(let i=0;i<lifted.length;i+=3){this.onSurface(point.fromArray(lifted,i)).toArray(lifted,i);}
   this.alternatives.geometry.dispose();
   this.alternatives.geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lifted,3));
   this.alternatives.computeLineDistances();this.alternatives.geometry.computeBoundingSphere();
 }
 constructor(public track:SpaTrack){
 const points=track.layout.nodes.map((n,i)=>track.point(n.s,track.id==='spa'?data.offsets[i]:0));this.curve=new T.CatmullRomCurve3(points,true,'centripetal');
 this.mesh=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 this.mesh.renderOrder=3;this.alternatives.renderOrder=2;this.group.add(this.mesh,this.alternatives);this.alternatives.visible=false;
 }
 update(sample:(station:number)=>T.Vector3,visibleAt:(station:number)=>boolean=()=>true){
 const track=this.track;
 const vertices:number[]=[],indices:number[]=[],stations:number[]=[];for(let s=0;s<track.length;s+=5.5)for(let t=s;t<Math.min(s+3.5,track.length);t+=.7){if(!visibleAt(t))continue;const end=Math.min(t+.7,s+3.5,track.length),a=sample(t),b=sample(end),f=b.clone().sub(a).normalize(),side=new T.Vector3(0,1,0).cross(f).normalize().multiplyScalar(.10),n=vertices.length/3;for(const p of [a.clone().add(side),a.clone().sub(side),b.clone().add(side),b.clone().sub(side)])vertices.push(...this.onSurface(p).toArray());stations.push(t,t,end,end);indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('station',new T.Float32BufferAttribute(stations,1));g.setIndex(indices);g.computeVertexNormals();this.mesh.geometry.dispose();this.mesh.geometry=g;
 }
 shade(braking:(station:number)=>number){
   const g=this.mesh.geometry,stations=g.getAttribute('station');
   const colors=new Float32Array(stations.count*3);
   const clear=new T.Color('#a8f0a0'),brake=new T.Color('#fb765a'),coast=new T.Color('#9dbbc5'),color=new T.Color();
   for(let i=0;i<stations.count;i++){
     const deceleration=braking(stations.getX(i));
     color.copy(deceleration< -1?clear:coast).lerp(brake,T.MathUtils.smoothstep(deceleration,1,18)).toArray(colors,i*3);
   }
   g.setAttribute('color',new T.BufferAttribute(colors,3));
 }
 dispose(){this.mesh.geometry.dispose();(this.mesh.material as T.Material).dispose();this.alternatives.geometry.dispose();this.alternatives.material.dispose();}
 point(s:number){return this.curve.getPoint(this.track.wrap(s)/this.track.length);}
}
