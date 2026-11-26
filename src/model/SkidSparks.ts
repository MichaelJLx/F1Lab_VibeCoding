import * as T from 'three';
import {floorSamples} from '../motion/AeroPlatform';
import type {Cruise} from '../motion/Cruise';

const slots=160;
export class SkidSparks {
 private positions=new Float32Array(slots*6);
 private geometry=new T.BufferGeometry();
 readonly trails=new T.LineSegments(this.geometry,new T.LineBasicMaterial({vertexColors:true,depthWrite:false,transparent:true,blending:T.AdditiveBlending}));
 private particles=Array.from({length:slots},()=>({p:new T.Vector3(),v:new T.Vector3(),life:0,bounces:0}));
 private heads=new Float32Array(slots*3);
 private intensity=new Float32Array(slots);
 private glowGeometry=new T.BufferGeometry();
 private colors=new Float32Array(slots*6);
 private cursor=0;
 private remainder=0;
 private contact=new T.Vector3();private hit=new T.Vector3();
 constructor(scale:number){
   const colors=this.colors;
   for(let i=0;i<slots;i++)colors.set([1,.83,.40,1,.25,.025],i*6);
   this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
   this.geometry.setAttribute('color',new T.BufferAttribute(colors,3).setUsage(T.DynamicDrawUsage));
   this.glowGeometry.setAttribute('position',new T.BufferAttribute(this.heads,3).setUsage(T.DynamicDrawUsage));
   this.glowGeometry.setAttribute('intensity',new T.BufferAttribute(this.intensity,1).setUsage(T.DynamicDrawUsage));
   const glow=new T.Points(this.glowGeometry,new T.ShaderMaterial({
     transparent:true,depthWrite:false,blending:T.AdditiveBlending,
     vertexShader:`attribute float intensity;varying float brightness;void main(){brightness=intensity;
       vec4 eye=modelViewMatrix*vec4(position,1.);
       gl_Position=projectionMatrix*eye;
       gl_PointSize=clamp(90./max(1.,-eye.z),1.,7.);
     }`,
     fragmentShader:`varying float brightness;void main(){
       float radius=length(gl_PointCoord-.5)*2.;
       float light=1.-smoothstep(.05,1.,radius);
       gl_FragColor=vec4(mix(vec3(1.,.32,.035),vec3(1.,.96,.76),light*light),light*brightness);
     }`
   }));
   glow.frustumCulled=false;this.trails.add(glow);
   this.trails.scale.setScalar(scale);this.trails.frustumCulled=false;this.trails.visible=false;
 }
 clear(){for(const p of this.particles)p.life=0;this.remainder=0;this.trails.visible=false;}
 private forward=new T.Vector3();
 private blocks=floorSamples.filter(([, ,z])=>z<=.6).map(([x,y,z])=>new T.Vector3(x,y-.30,z));
 update(dt:number,cruise:Cruise,chassis:T.Group,scale:number,preview:boolean){
   if(cruise.recovering){this.clear();return;}
   if(preview || cruise.status==='idle' || cruise.status==='complete'){
     if(this.trails.visible)this.particles.forEach(p=>p.life=0);
     this.trails.visible=false;this.remainder=0;return;
   }
   if(cruise.status!=='running')return;
   const {track,speed}=cruise;
   chassis.updateWorldMatrix(true,false);
   this.forward.set(0,0,1).transformDirection(chassis.matrixWorld);
   if(speed>5){
     let depth=0,hit:T.Vector3|undefined;
     for(const block of this.blocks){
       const p=this.contact.copy(block).applyMatrix4(chassis.matrixWorld).divideScalar(scale);
       const height=track.pit?.heightAt(p);
       if(height!==undefined && height-p.y>depth){depth=height-p.y;hit=this.hit.copy(p);hit.y=height+.001;}
     }
     if(hit){
       const severity=Math.min(1,depth/.012);
       this.remainder+=Math.min(dt,.05)*speed*severity*(.5+2.5*severity)*(1+.4*cruise.gearbox.brake);
       while(this.remainder>=1){
         this.remainder--;
         const spark=this.particles[this.cursor++%slots];
         spark.p.copy(hit);spark.life=.12+severity*(.16+Math.random()*.16);spark.bounces=0;
         spark.v.copy(this.forward).multiplyScalar(speed*(.18+.25*Math.random()));
         spark.v.x+=Math.random()*3.2-1.6;spark.v.z+=Math.random()*3.2-1.6;spark.v.y=-.2-Math.random()*.8;
       }
     }else this.remainder=0;
   }
   let count=0;
   for(const spark of this.particles){
     if(spark.life<=0)continue;
     spark.life-=dt;if(spark.life<=0)continue;
     spark.v.y-=9.81*dt;spark.p.addScaledVector(spark.v,dt);
     const road=track.pit?.heightAt(spark.p);
     if(road!==undefined && spark.p.y<road+.002){
       spark.p.y=road+.002;
       if(spark.v.y<0){spark.v.y=-spark.v.y*.42;spark.v.x*=.77;spark.v.z*=.77;spark.bounces++;}
       if(spark.bounces>3){spark.life=0;continue;}
     }
     const fade=Math.min(1,spark.life/.07);
     this.intensity[count]=fade;
     this.colors.set([fade,.83*fade,.4*fade,fade*.6,.19*fade,.015*fade],count*6);
     spark.p.toArray(this.heads,count*3);
     const i=count++*6;spark.p.toArray(this.positions,i);
     this.positions[i+3]=spark.p.x-spark.v.x*.018;
     this.positions[i+4]=spark.p.y-spark.v.y*.018;
     this.positions[i+5]=spark.p.z-spark.v.z*.018;
   }
   this.trails.visible=count>0;this.geometry.setDrawRange(0,count*2);
   this.glowGeometry.setDrawRange(0,count);
   if(count){this.glowGeometry.attributes.position.needsUpdate=true;this.glowGeometry.attributes.intensity.needsUpdate=true;}
   if(count){this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;}
 }
}
