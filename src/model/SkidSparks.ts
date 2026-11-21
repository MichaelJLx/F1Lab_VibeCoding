import * as T from 'three';
import type {Cruise} from '../motion/Cruise';

// Estimated lower faces of three titanium skid blocks, in chassis metres.
const blocks=[new T.Vector3(0,.033,1.25),new T.Vector3(-.14,.041,-1.25),new T.Vector3(.14,.041,-1.25)];
const slots=80;
export class SkidSparks {
 private positions=new Float32Array(slots*6);
 private geometry=new T.BufferGeometry();
 readonly trails=new T.LineSegments(this.geometry,new T.LineBasicMaterial({vertexColors:true,depthWrite:false}));
 private particles=Array.from({length:slots},()=>({p:new T.Vector3(),v:new T.Vector3(),life:0}));
 private cursor=0;
 private remainder=0;
 constructor(scale:number){
   const colors=new Float32Array(slots*6);
   for(let i=0;i<slots;i++)colors.set([1,.83,.40,1,.25,.025],i*6);
   this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
   this.geometry.setAttribute('color',new T.BufferAttribute(colors,3));
   this.trails.scale.setScalar(scale);this.trails.frustumCulled=false;this.trails.visible=false;
 }
 update(dt:number,cruise:Cruise,chassis:T.Group,scale:number,preview:boolean){
   if(preview || cruise.status==='idle' || cruise.status==='complete'){
     if(this.trails.visible)this.particles.forEach(p=>p.life=0);
     this.trails.visible=false;this.remainder=0;return;
   }
   if(cruise.status!=='running')return;
   const {track,s,speed}=cruise;
   if(speed>5){
     chassis.updateWorldMatrix(true,false);
     let depth=0,hit:T.Vector3|undefined;
     for(const block of blocks){
       const p=block.clone();p.y-=.30;p.applyMatrix4(chassis.matrixWorld).divideScalar(scale);
       const station=track.wrap(s+block.z);
       const road=track.pose(station);
       const normal=new T.Vector3(0,1,0).applyQuaternion(road.quaternion);
       const pavement=road.position.y-((p.x-road.position.x)*normal.x+(p.z-road.position.z)*normal.z)/normal.y;
       const height=(track.pit?.heightAt(p)??pavement)+track.curbRise(station,p);
       if(height-p.y>depth){depth=height-p.y;hit=p;hit.y=height+.005;}
     }
     if(hit){
       this.remainder+=Math.min(dt,.05)*speed*Math.min(3,depth*250);
       while(this.remainder>=1){
         this.remainder--;
         const spark=this.particles[this.cursor++%slots];
         spark.p.copy(hit);spark.life=.08+Math.random()*.16;
         spark.v.copy(track.pose(s).forward).multiplyScalar(speed*(.18+.25*Math.random()));
         spark.v.x+=Math.random()*1.8-.9;spark.v.z+=Math.random()*1.8-.9;spark.v.y+=1+Math.random()*1.4;
       }
     }else this.remainder=0;
   }
   let count=0;
   for(const spark of this.particles){
     if(spark.life<=0)continue;
     spark.life-=dt;if(spark.life<=0)continue;
     spark.v.y-=9.81*dt;spark.p.addScaledVector(spark.v,dt);
     const i=count++*6;spark.p.toArray(this.positions,i);
     this.positions[i+3]=spark.p.x-spark.v.x*.009;
     this.positions[i+4]=spark.p.y-spark.v.y*.009;
     this.positions[i+5]=spark.p.z-spark.v.z*.009;
   }
   this.trails.visible=count>0;this.geometry.setDrawRange(0,count*2);
   if(count)this.geometry.attributes.position.needsUpdate=true;
 }
}
