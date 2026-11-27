import * as T from 'three';
import {corners,type Corner} from '../motion/Suspension';
import type {Cruise} from '../motion/Cruise';

const capacity=256;
type Wheel={pivot:T.Group,radius:number};
/** World-space pooled billboards: old smoke stays at the contact patch as the car leaves. */
export class TyreSmoke{
 private geometry=new T.InstancedBufferGeometry();
 private centers=new Float32Array(capacity*3);
 private floors=new Float32Array(capacity);
 private sizes=new Float32Array(capacity);private opacity=new Float32Array(capacity);private seeds=new Float32Array(capacity);
 private particles=Array.from({length:capacity},(_,i)=>({p:new T.Vector3(),v:new T.Vector3(),age:0,life:0,strength:0,ground:0,seed:i*.61803399%1}));
 private remainder:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 private cursor=0;private contact=new T.Vector3();private forward=new T.Vector3();
 readonly mesh:T.Mesh;
 constructor(scale:number){
   this.geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));this.geometry.setIndex([0,1,2,0,2,3]);
   for(const [name,array,size] of [['center',this.centers,3],['ground',this.floors,1],['size',this.sizes,1],['alpha',this.opacity,1],['seed',this.seeds,1]] as const)this.geometry.setAttribute(name,new T.InstancedBufferAttribute(array,size).setUsage(T.DynamicDrawUsage));
   const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,
     vertexShader:`attribute vec3 center;attribute float size,alpha,seed,ground;varying vec2 uvSmoke;varying float opacity,noiseSeed,clearance;
       void main(){clearance=center.y-ground+size*(position.x*viewMatrix[1][0]+position.y*viewMatrix[1][1]);uvSmoke=position.xy;opacity=alpha;noiseSeed=seed;vec4 eye=modelViewMatrix*vec4(center,1.);eye.xy+=position.xy*size*${scale.toFixed(4)};gl_Position=projectionMatrix*eye;}`,
     fragmentShader:`varying vec2 uvSmoke;varying float opacity,noiseSeed,clearance;
       void main(){float r=dot(uvSmoke,uvSmoke);float cloud=exp(-r*3.6)*(1.-smoothstep(.6,1.,r));
       float folds=.83+.17*sin(uvSmoke.x*12.+noiseSeed*31.)*sin(uvSmoke.y*9.+noiseSeed*17.);
       gl_FragColor=vec4(vec3(.87,.89,.90),cloud*folds*opacity*smoothstep(0.,.07,clearance));}`});
   this.mesh=new T.Mesh(this.geometry,material);this.mesh.scale.setScalar(scale);this.mesh.frustumCulled=false;this.mesh.visible=false;
 }
 clear(){for(const p of this.particles)p.life=0;for(const k of corners)this.remainder[k]=0;this.mesh.visible=false;this.geometry.instanceCount=0;}
 update(dt:number,cruise:Cruise,wheels:Partial<Record<Corner,Wheel>>,car:T.Group,scale:number){
   if(cruise.recovering || cruise.status==='idle'||cruise.status==='complete'){this.clear();return;}if(cruise.status!=='running')return;
   dt=Math.min(dt,.05);this.forward.set(0,0,1).applyQuaternion(car.quaternion);
   for(const k of corners){
     const wheel=wheels[k],power=cruise.dynamics.tyres[k].smokePower;
     if(!wheel || power<=1000){this.remainder[k]=0;continue;}
     wheel.pivot.getWorldPosition(this.contact).divideScalar(scale);this.contact.y-=wheel.radius;
     const road=cruise.track.getSurfaceHeightAt(this.contact);if(road===undefined)continue;
     this.contact.y=road+.025;
     const strength=Math.min(1,power/180000);
     this.remainder[k]+=dt*Math.min(100,power/1800);
     while(this.remainder[k]>=1){
       this.remainder[k]--;const p=this.particles[this.cursor++%capacity];p.p.copy(this.contact);p.p.x+=(Math.random()-.5)*.12;p.p.z+=(Math.random()-.5)*.12;
       p.v.copy(this.forward).multiplyScalar(cruise.speed*.12);p.v.x+=(Math.random()-.5)*.7;p.v.z+=(Math.random()-.5)*.7;p.v.y=.22+strength*.25;
       p.ground=road;p.age=0;p.life=.8+strength*.9;p.strength=strength;
     }
   }
   let count=0;
   for(const p of this.particles){
     if(p.life<=0)continue;p.age+=dt;if(p.age>=p.life){p.life=0;continue;}
     p.v.x*=Math.exp(-dt*1.8);p.v.z*=Math.exp(-dt*1.8);p.p.addScaledVector(p.v,dt);
     const t=p.age/p.life;p.p.toArray(this.centers,count*3);this.sizes[count]=.085+p.age*(.26+p.strength*.25);
     this.opacity[count]=(.3+p.strength*.48)*Math.min(1,p.age/.045)*(1-t)*(1-t);this.seeds[count]=p.seed;this.floors[count]=p.ground;count++;
   }
   this.geometry.instanceCount=count;this.mesh.visible=count>0;
   if(count)for(const name of ['center','ground','size','alpha','seed'])this.geometry.attributes[name].needsUpdate=true;
 }
}
