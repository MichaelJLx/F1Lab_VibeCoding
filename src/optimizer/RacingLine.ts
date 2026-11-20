import * as T from 'three';
import type {SpaTrack} from '../tracks/SpaTrack';
import {spaData} from '../tracks/SpaTrack';
import data from '../tracks/spa-racing-line.json';
export const racingLineData=data;
export class RacingLine {
 curve:T.CatmullRomCurve3;mesh:T.Mesh;
 constructor(public track:SpaTrack){
 const points=spaData.nodes.map((n,i)=>track.point(n.s,data.offsets[i]));this.curve=new T.CatmullRomCurve3(points,true,'centripetal');
 this.mesh=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:'#A8F0A0',side:T.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 this.mesh.renderOrder=2;
 }
 update(sample:(station:number)=>T.Vector3){
 const track=this.track;
 const vertices:number[]=[],indices:number[]=[];for(let s=0;s<track.length;s+=5.5)for(let t=s;t<Math.min(s+3.5,track.length);t+=.7){const end=Math.min(t+.7,s+3.5,track.length),a=sample(t),b=sample(end),f=b.clone().sub(a).normalize(),side=new T.Vector3(0,1,0).cross(f).normalize().multiplyScalar(.10),n=vertices.length/3;a.y+=.055;b.y+=.055;for(const p of [a.clone().add(side),a.clone().sub(side),b.clone().add(side),b.clone().sub(side)])vertices.push(...p.toArray());indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();this.mesh.geometry.dispose();this.mesh.geometry=g;
 }
 point(s:number){return this.curve.getPoint(this.track.wrap(s)/this.track.length);}
}
