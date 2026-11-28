import type {TyreCompound} from '../simulation/vehicle/TyreCompound';
import {bindCameraHousing} from './vehicle/CameraHousing';
import {styleSteeringControls} from './vehicle/SteeringControls';
import cameraRig from '../../vehicles/rb22/rig/cameras.json';
import {RearLight,type RearLightState} from './vehicle/RearLight';
import {pressureMap} from './pressure/PressureMap';
import {createAirflow} from './airflow/Airflow';
import {bindSuspensionLinks} from './vehicle/SuspensionLinks';
import {staticDrop,rootClearance} from '../simulation/vehicle/AeroPlatform';
import {TyreSmoke} from './effects/TyreSmoke';
import {SkidSparks} from './effects/SkidSparks';
import {shiftRpm} from '../simulation/vehicle/Gearbox';
import {mirrorGlare} from './vehicle/MirrorGlare';
import {tyreView} from './vehicle/TyreView';
import {suspensionParameters,type Corner} from '../simulation/vehicle/Suspension';
import {wheelEffects} from './vehicle/WheelEffects';
import {setFlap,splitFlap,contactShadow} from './vehicle/ActiveWings';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {type RoadStyle} from '../tracks/CircuitTrack';
import {CircuitSession} from '../app/CircuitSession';
import type {CircuitData} from '../tracks/CircuitData';
import {FreeCamera} from './camera/FreeCamera';
import {HelmetLook} from './camera/HelmetLook';
import wheelRig from '../../vehicles/rb22/rig/wheels.json';
import {type CruiseSnapshot,type ReviewFrame} from '../simulation/driving/Cruise';
export type View='helmet'|'trackside'|'onboard'|'hero'|'bottom'|'top'|'side'|'front'|'rear'|'track'|'free';
export const defaultView:View='hero';
export const names:Record<string,string>={body:'车身 / 侧箱',floor:'底板 / 扩散器',cockpit:'座舱 / Halo','front-wing':'前翼','rear-wing':'后翼',FL:'左前轮',FR:'右前轮',RL:'左后轮',RR:'右后轮'};
// Local broadcast positions, in track metres. Choose the next shot at its coverage boundary.

export class Inspector {
 setTrackSigns(on:boolean){this.track.signs.visible=on;}
 private viewportWidth=1;private viewportHeight=1;private projectionMode='';
 private cockpitProjection(){
   const cockpit=this.mode==='helmet'||this.mode==='onboard';
   const key=`${cockpit}/${this.viewportWidth}/${this.viewportHeight}`;if(key===this.projectionMode)return;this.projectionMode=key;
   // The console has its own layout row. Move cockpit framing upward within
   // the remaining canvas without raising the driver's physical eye position.
   if(cockpit)this.camera.setViewOffset(this.viewportWidth,this.viewportHeight,0,Math.min(32,this.viewportHeight*.05),this.viewportWidth,this.viewportHeight);
   else this.camera.clearViewOffset();
 }

 private scratch={oldPos:new T.Vector3(),oldQ:new T.Quaternion(),rotation:new T.Quaternion(),inverse:new T.Quaternion(),radial:new T.Vector3(),head:new T.Vector3(),eye:new T.Vector3(),patch:new T.Vector3(),headRotation:new T.Quaternion(),euler:new T.Euler()};
 private lcdTime=0;
 private metrics={frames:0,elapsed:0,cpu:0,last:0};
 tyreViews:Partial<Record<Corner,ReturnType<typeof tyreView>>>={};
 private session:CircuitSession;
 get track(){return this.session.track;}get line(){return this.session.line;}get cruise(){return this.session.cruise;}
 scene=new T.Scene();roadStyle:RoadStyle='soft';camera=new T.PerspectiveCamera(40,1,.02,15000);
 renderer:T.WebGLRenderer;controls:OrbitControls;free:FreeCamera;env:T.WebGLRenderTarget;resize:ResizeObserver;
 mode:'helmet'|'trackside'|'onboard'|'follow'|'overview'|'free'='follow';readonly displayScale=1.25;
 private updateLinks?:()=>void;
 private pressure?:ReturnType<typeof pressureMap>;
 private pressureEnabled=false;
 setPressure(on:boolean){if(!this.car)return;this.pressure??=pressureMap(this.car);this.pressureEnabled=on;this.pressure.set(on);if(!on)this.setWire(this.wire);}
 private flowRequested=false;
 private flow?:ReturnType<typeof createAirflow>;
 setAirflow(enabled:boolean){
   this.flowRequested=enabled;
   if(this.car && !this.flow){
     this.flow=createAirflow(this.chassis);
     this.scene.add(this.flow.mesh);
   }
   if(this.flow)this.flow.setVisible(enabled);
 }
 private sparks=new SkidSparks(this.displayScale);
 private tyreSmoke=new TyreSmoke(this.displayScale);
 tireEffects:Record<string,ReturnType<typeof wheelEffects>>={};
 shadow=contactShadow();frontFlap?:T.Group;rearFlap?:T.Group;wingTravel=0;gridWingPreview=false;
 steeringWheel?:T.Group;
 private wheelLCD?:T.CanvasTexture;
 private lastLCD='';
 private wheelRPM={value:0};
 private updateWheelLCD(sample?:ReviewFrame){
   const texture=this.wheelLCD;
   if(!texture)return;
   const box=this.cruise.gearbox,speed=Math.round(sample?.speed??this.cruise.speed*3.6),rpm=Math.round(sample?.rpm??box.rpm),gear=sample?.gear??box.index+1;
   this.wheelRPM.value=sample?.rpm??box.rpm;
   const now=performance.now();if(!sample&&now-this.lcdTime<50)return;this.lcdTime=now;
   const lap=this.cruise,recorded=sample?.telemetry;
   const delta=sample?recorded?.delta:lap.currentDelta;
   const soc=sample?recorded?.energy:lap.energyEnabled?box.energy/5e6:1;
   const electric=sample?recorded?.electricKw:box.electricKw;
   const aero=sample?recorded?.aeroZone:lap.aeroZone;
   const elapsed=sample?.t??(lap.flying?lap.elapsed:undefined);
   const time=elapsed===undefined?'—':`${Math.floor(elapsed/60)}:${(elapsed%60).toFixed(1).padStart(4,'0')}`;
   const energyMode=electric===undefined?'—':electric<-.01?'回收':electric>.01?'释放':'关闭';
   const tyres=sample?recorded?.tyres:Object.fromEntries((['FL','FR','RL','RR'] as Corner[]).map(k=>{
     const t=lap.dynamics.tyres[k];return [k,{temperature:t.temperature,pressure:t.pressure,wear:lap.wearEnabled?t.degradation*100:0}];
   }));
   const mode=sample?'REPLAY':lap.invalidLap?'INVALID':lap.status==='idle'?'READY':lap.lastLap?'IN LAP':!lap.timed?'OUT LAP':'PUSH';
   const key=[speed,rpm,gear,delta?.toFixed(2),soc?.toFixed(3),energyMode,aero,mode,time,
     ...Object.values(tyres??{}).map(t=>Math.round(t.temperature)+'/'+t.pressure.toFixed(1)+'/'+t.wear.toFixed(1))].join('/');
   if(key===this.lastLCD)return;
   this.lastLCD=key;
   const ctx=(texture.image as HTMLCanvasElement).getContext('2d')!;
   // Race-page hierarchy follows the supplied real-wheel reference. Physical
   // shift LEDs live above the LCD; the top LCD bar is available ERS energy.
   ctx.fillStyle='#10101f';ctx.fillRect(0,0,512,256);
   const field=(value:string,x:number,y:number,size:number,color='#e8ebff',align:CanvasTextAlign='center')=>{
     ctx.textAlign=align;ctx.font='600 '+size+'px monospace';ctx.fillStyle=color;ctx.fillText(value,x,y);
   };
   ctx.fillStyle='#232b3c';ctx.fillRect(12,10,344,16);
   if(soc!==undefined){ctx.fillStyle='#78dba6';ctx.fillRect(12,10,344*T.MathUtils.clamp(soc,0,1),16);}
   for(let i=1;i<24;i++){ctx.fillStyle='#10101f';ctx.fillRect(12+i*344/24,10,2,16);}
   field('ERS '+(soc===undefined?'—':Math.round(soc*100)+'%'),12,47,18,'#9accc6','left');
   field((suspensionParameters.brakeFront*100).toFixed(1),498,29,28,'#eef0ff','right');
   field('BRAKE BAL',498,47,12,'#99a1bc','right');
   field(energyMode,256,43,15,'#9accc6');
   field(aero===undefined?'—':aero?'直道模式':'基础模式',256,63,17,'#a7c9ff');
   ctx.fillStyle='#c5cbe2';ctx.fillRect(12,77,112,48);
   field(String(speed),68,114,42,'#171a2b');field('km/h',68,144,16,'#99a1bc');
   field(gear<0?'R':gear===0?'N':String(gear),250,139,90,'#9fe0b5');
   field(delta===undefined?'—':(delta>=0?'+':'')+delta.toFixed(2),498,94,32,
     delta===undefined?'#99a1bc':delta<=0?'#91e0ad':'#ff8f83','right');
   field('LAP DELTA',498,113,13,'#99a1bc','right');
   field(String(rpm),498,143,25,'#eef0ff','right');field('rpm',498,160,12,'#99a1bc','right');
   ctx.fillStyle='#33354e';ctx.fillRect(12,166,488,1);
   ['FL','FR','RL','RR'].forEach((k,i)=>{
     const tyre=tyres?.[k as Corner],x=16+i*125;
     field(k,x,184,13,'#99a1bc','left');
     field(tyre?Math.round(tyre.temperature)+'°':'—',x+98,186,20,
       tyre && tyre.temperature>120?'#ff9588':'#e8ebff','right');
     field(tyre?(tyre.pressure/100).toFixed(2)+' bar':'—',x,204,15,'#a6c8df','left');
     field(tyre?'磨损 '+tyre.wear.toFixed(1)+'%':'—',x,219,11,'#99a1bc','left');
   });
   ctx.fillStyle=aero?'#2c554f':'#3d3151';ctx.fillRect(12,223,488,25);
   field(mode,24,242,15,'#ecedff','left');
   field(time,254,242,19,'#ecedff');
   field(aero===undefined?'—':aero?'AERO SL':'AERO BASE',488,242,15,'#b5dfc9','right');
   texture.needsUpdate=true;
 }
 private mirrorFlash?:ReturnType<typeof mirrorGlare>;
 private tailPulse={value:0};
 private rearLampMaterials:T.MeshStandardMaterial[]=[];
 private mirrorLampMaterials:T.MeshStandardMaterial[]=[];
 private rearLight=new RearLight();
 private lightTime=0;
 private rearLightState:RearLightState={time:0,running:false,consumption:false,pitLimited:false,speed:0,electricKw:0,energyRatio:1,deploymentAllowed:false,flying:false,brake:0,throttle:0};
 private roofDrag?:{id:number,x:number,y:number};
 private head=new T.Vector3();
 private headTime=0;
 private helmetLook=new HelmetLook();
 private cameraHousing?:ReturnType<typeof bindCameraHousing>;
 onboardMount=new T.Object3D();
 chassis=new T.Group();
 car?:T.Group;wheels:Record<string,{pivot:T.Group,spin:T.Group,base:T.Vector3,axis:T.Vector3,radius:number,angle:number,steer:number}>={};
 frame=0;destroyed=false;selected:string|null=null;wire=false;rotate=false;steering=0;
 targetPos?:T.Vector3;targetLook?:T.Vector3;last=performance.now();lastTelemetry=0;ray=new T.Raycaster();pointer=new T.Vector2();down=[0,0];
 constructor(data:CircuitData,public host:HTMLDivElement,public onReady:()=>void,public onSelect:(key:string|null)=>void,public onError:(s:string)=>void,public onCruise:(s:CruiseSnapshot)=>void){
 this.session=new CircuitSession(data);
 this.cruise.planWorker=new Worker(new URL('../simulation/driving/lap.worker.ts',import.meta.url),{type:'module'});
 this.renderer=new T.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(devicePixelRatio);this.renderer.setClearColor('#FFFDF7',1);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;host.appendChild(this.renderer.domElement);
 const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.env=pmrem.fromScene(room,.04);this.scene.environment=this.env.texture;room.dispose();pmrem.dispose();
 this.scene.add(new T.HemisphereLight(0xffffff,0x8d8172,1.1));const sun=new T.DirectionalLight(0xfff5e0,2);sun.position.set(3,6,5);this.scene.add(sun);const fill=new T.DirectionalLight(0xdce8ff,1);fill.position.set(-4,2,-3);this.scene.add(fill);
 this.camera.position.set(7,4,9);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,.5,0);this.controls.enableDamping=true;this.controls.minDistance=.5;this.controls.maxDistance=7000;this.controls.maxPolarAngle=Math.PI;this.controls.enablePan=true;this.controls.screenSpacePanning=true;
 this.controls.addEventListener('start',()=>{this.targetPos=undefined;this.targetLook=undefined;});this.free=new FreeCamera(this.camera,this.renderer.domElement);
 this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);this.fit();
 this.renderer.domElement.addEventListener('dblclick',this.helmetRecenter);window.addEventListener('blur',this.cockpitBlur);
 this.renderer.domElement.addEventListener('pointerdown',this.pointerDown);this.renderer.domElement.addEventListener('pointerup',this.pointerUp);this.renderer.domElement.addEventListener('lostpointercapture',this.roofCancel);this.renderer.domElement.addEventListener('pointercancel',this.roofCancel);this.renderer.domElement.addEventListener('pointermove',this.roofMove);
 this.track.group.scale.setScalar(this.displayScale);this.line.group.scale.setScalar(this.displayScale);
 this.scene.add(this.track.group,this.line.group,this.sparks.trails,this.tyreSmoke.mesh);
 new GLTFLoader().load('/vehicles/rb22/model.glb',g=>{if(this.destroyed){this.disposeObject(g.scene);return;}this.car=g.scene;this.scene.add(this.car);this.car.scale.setScalar(this.displayScale);
 // Preserve source textures and use the device's full oblique texture filtering.
 const anisotropy=this.renderer.capabilities.getMaxAnisotropy();
 this.car.traverse(object=>{
   if(!(object instanceof T.Mesh))return;
   for(const material of Array.isArray(object.material)?object.material:[object.material]){
     if(!(material instanceof T.MeshStandardMaterial))continue;
     for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap,material.emissiveMap])if(texture)texture.anisotropy=anisotropy;
   }
 });
 for(const child of [...this.car.children])if(/^(FL|FR|RL|RR)$/.test(child.name)){const rig=wheelRig.wheels[child.name as keyof typeof wheelRig.wheels],center=new T.Vector3().fromArray(rig.center),pivot=new T.Group(),spin=new T.Group();pivot.name=child.name;pivot.position.copy(child.position).add(center);child.position.copy(center).negate();this.car.remove(child);spin.add(child);pivot.add(spin);this.car.add(pivot);this.wheels[child.name]={pivot,spin,base:pivot.position.clone(),axis:new T.Vector3().fromArray(rig.axis).normalize(),radius:rig.radius,angle:0,steer:0};}
 this.chassis.name='sprung-chassis';this.chassis.position.y=.30;
 for(const child of [...this.car.children]){
   // Wheel hubs follow the road frame; only sprung components inherit body motion.
   if(this.wheels[child.name])continue;
   child.position.y-=.30;
   this.chassis.add(child);
 }this.car.add(this.chassis);
 this.updateLinks=bindSuspensionLinks(this.chassis,this.wheels);
 // Lens on the front of the roll-hoop camera pod; coordinates relative to the sprung chassis.
 this.cameraHousing=bindCameraHousing(this.chassis);
 this.onboardMount.position.copy(this.cameraHousing.lens);
 this.onboardMount.rotation.set(-8*T.MathUtils.DEG2RAD,Math.PI,0,'YXZ');
 this.chassis.add(this.onboardMount);
 for(const [key,w] of Object.entries(this.wheels)){
   this.tyreViews[key as Corner]=tyreView(w.spin,w.radius,w.axis);
   this.tireEffects[key]=wheelEffects(w.pivot,w.spin,Math.sign(w.base.x),w.radius);
   const center=w.base.clone();center.y=0;
   this.cruise.contactCenters[key as keyof typeof this.wheels & ('FL'|'FR'|'RL'|'RR')]=center;
 }
 const cockpit=this.chassis.getObjectByName('cockpit');
 if(cockpit){
   // The GLB stores the grips, carbon face, LCD, LEDs and decals as separate primitives.
   const parts=cockpit.children.filter(child=>{
     if(!(child instanceof T.Mesh))return false;
     child.geometry.computeBoundingBox();
     const box=child.geometry.boundingBox;
     return box && box.min.x>=-.14 && box.max.x<=.14 && box.min.y>.51 &&
       box.max.y<.71 && box.min.z>.64 && box.max.z<.80;
   });
   const hub=new T.Group();hub.position.set(0,.608,.67);cockpit.add(hub);
   for(const part of parts){part.position.sub(hub.position);hub.add(part);}
   this.steeringWheel=hub;
   styleSteeringControls(hub,parts);
   const lcd=document.createElement('canvas');lcd.width=512;lcd.height=256;
   this.wheelLCD=new T.CanvasTexture(lcd);this.wheelLCD.colorSpace=T.SRGBColorSpace;
   const screen=parts.find((part):part is T.Mesh=>part instanceof T.Mesh && !Array.isArray(part.material) && part.material.name.startsWith('gp21_LCD'));
   if(screen){
     const geometry=screen.geometry.clone(),pos=geometry.getAttribute('position'),bounds=geometry.boundingBox!;
     const uv=[];
     for(let i=0;i<pos.count;i++)uv.push((bounds.max.x-pos.getX(i))/(bounds.max.x-bounds.min.x),(pos.getY(i)-bounds.min.y)/(bounds.max.y-bounds.min.y));
     geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));screen.geometry=geometry;
     screen.material=new T.MeshBasicMaterial({map:this.wheelLCD,side:T.DoubleSide,toneMapped:false});
     // The source model places a static KERS strip in front of the LCD.
     // Live ERS is drawn on the canvas; this old overlay obscures its right column.
     for(const part of parts)if(part instanceof T.Mesh && !Array.isArray(part.material) && part.material.name.startsWith('kers_blue'))part.visible=false;
   }
   const lamps=parts.find((part):part is T.Mesh=>part instanceof T.Mesh && !Array.isArray(part.material) && part.material.name.startsWith('clearled'));
   if(lamps){
     lamps.material=new T.ShaderMaterial({
       uniforms:{rpm:this.wheelRPM},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
       fragmentShader:`uniform float rpm;varying vec3 p;void main(){
         float t=clamp((.045-p.x)/.09,0.,1.);
         vec3 lit=t<.34?vec3(.5,7.,.8):t<.68?vec3(16.,.13,.18):vec3(2.,3.,12.);
         float on=step(.682,p.y)*step(8250.+${shiftRpm-8250}.0*t,rpm);
         gl_FragColor=vec4(mix(vec3(.018,.022,.025),lit,on),1.);
         #include <tonemapping_fragment>
         #include <colorspace_fragment>
       }`
     });
   }
 }
 // The GLB already contains two mirror emitters and three rear emitters.
 // Their material is shared across assemblies, so isolate the amber pair.
 const ledMask=new T.TextureLoader().load('/vehicles/rb22/rb22-led-optics.png');
 ledMask.flipY=false;
 ledMask.wrapS=ledMask.wrapT=T.RepeatWrapping;
 for(const [assembly,color] of [['cockpit',0xffa511],['rear-wing',0xff0204]] as const){
   this.chassis.getObjectByName(assembly)?.traverse(node=>{
     if(!(node instanceof T.Mesh) || !(node.material instanceof T.MeshStandardMaterial))return;
     if(assembly==='cockpit' && node.material.name.startsWith('glass.')){
       const cover=node.material.clone();cover.transparent=true;cover.opacity=.09;cover.depthWrite=false;node.material=cover;return;
     }
     // These three GLB primitives contain the lip, surround and rear crash structure.
     if(assembly==='rear-wing' && /^(redbull_detail|redbull_carbon2|redbull_paint)\./.test(node.material.name)){
       const receiver=node.material.clone();
       receiver.customProgramCacheKey=()=>'rear-lamp-rim-v1';
       receiver.onBeforeCompile=shader=>{
         shader.uniforms.tailPulse=this.tailPulse;
         shader.vertexShader='varying vec3 lampLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n lampLocal=position;');
         shader.fragmentShader='varying vec3 lampLocal; uniform float tailPulse;\n'+shader.fragmentShader.replace('#include <opaque_fragment>', `
           vec2 xy=vec2(lampLocal.x/.0411,(lampLocal.y-.3915)/.051);
           float rim=exp(-5.*abs(length(xy)-1.));
           float depth=1.-smoothstep(.002,.018,abs(lampLocal.z+2.43466));
           outgoingLight+=tailPulse*rim*depth*vec3(.38,.012,.004);
           #include <opaque_fragment>
         `);
       };
       node.material=receiver;
       return;
     }
     if(!node.material.name.startsWith('rear_light_2.'))return;
     const lens=node.material.clone();
     lens.emissiveMap=ledMask;
     lens.emissive.setHex(color);
     lens.emissiveIntensity=0;
     // Red channel = existing LED dies, green = local diffusion through the lens.
     // Attenuate the reflected white texture where the illuminated die dominates.
     const mirror=assembly==='cockpit';
     if(mirror)this.mirrorFlash=mirrorGlare(node);
     if(!mirror){
       // The central LED face and its backing are separated by just 4 micrometres.
       // Bias its depth slightly to keep the coplanar backing from breaking up the ring.
       lens.polygonOffset=true;
       lens.polygonOffsetFactor=-1;
       lens.polygonOffsetUnits=-1;
     }
     lens.customProgramCacheKey=()=>mirror?'mirror-amber-v3':'rear-red-diffuser-v3';
     lens.onBeforeCompile=shader=>{
       if(mirror){
         shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>', `
           vec2 optics=texture2D(emissiveMap,vEmissiveMapUv).rg;
           float lampPulse=totalEmissiveRadiance.r;
           float scatter=pow(optics.g,0.68)*smoothstep(.24,.80,lampPulse);
           totalEmissiveRadiance*=3.4*scatter;
           totalEmissiveRadiance+=lampPulse*vec3(11.0,5.8,0.18)*optics.r;
         `).replace('#include <opaque_fragment>', `
           float litCoverage=clamp(lampPulse*(0.96*optics.r+0.42*optics.g),0.0,1.0);
           outgoingLight=mix(outgoingLight,totalEmissiveRadiance,litCoverage);
           #include <opaque_fragment>
         `);
         return;
       }
       shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>', `
         vec3 optics=texture2D(emissiveMap,vEmissiveMapUv).rgb;
         float pulse=totalEmissiveRadiance.r;
         float core=optics.r*optics.b;
         float veil=.45*optics.b+.25*pow(optics.g,1.35);
         // Filtered dies give a continuous shoulder; the broader veil overlaps between LEDs.
         totalEmissiveRadiance=pulse*(vec3(5.0,.085,.035)*core+vec3(1.8,.012,.005)*veil);
       `).replace('#include <opaque_fragment>', `
         float coverage=1.-exp(-pulse*(2.8*core+2.4*veil));
         outgoingLight=mix(outgoingLight,totalEmissiveRadiance,coverage);
         #include <opaque_fragment>
       `);
     };
     lens.toneMapped=true;
     node.material=lens;
     (mirror?this.mirrorLampMaterials:this.rearLampMaterials).push(lens);
   });
 }
 const front=this.chassis.getObjectByName('front-wing'),rear=this.chassis.getObjectByName('rear-wing');
 if(front)this.frontFlap=splitFlap(front,true);
 if(rear)this.rearFlap=splitFlap(rear,false);
 // Capture final split meshes so airflow boundaries follow the moving flaps and links.
 this.setAirflow(this.flowRequested);
 if(this.flow){
   this.chassis.updateMatrix();this.flow.uniforms.toChassis.value.copy(this.chassis.matrix).invert();
   Object.values(this.wheels).forEach((w,i)=>{this.flow!.uniforms.wheelPose.value[i].set(w.pivot.position.x,w.pivot.position.y,w.pivot.position.z,0);});
   this.flow.update(1,70,0,0,.03,.04,0);
 }

 this.car.add(this.shadow);
 this.car.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial)m.envMapIntensity=.8;});
 this.placeCar();this.resetCamera();this.onReady();},undefined,()=>this.onError('赛车暂时无法载入，请刷新页面重试。'));
 this.tick();
 }
 setTyreCompound(compound:TyreCompound){this.cruise.tyreCompound=compound;this.onCruise(this.cruise.snapshot());}
 replaceTyres(){this.cruise.replaceTyres();this.onCruise(this.cruise.snapshot());}
 switchCircuit(data:CircuitData){
 this.setAirflow(false);
 this.sparks.clear();this.tyreSmoke.clear();
   const next=new CircuitSession(data,this.session);
   this.scene.remove(this.track.group,this.line.group);this.session.dispose();this.session=next;
   this.cruise.planWorker=new Worker(new URL('../simulation/driving/lap.worker.ts',import.meta.url),{type:'module'});
   this.track.group.scale.setScalar(this.displayScale);this.line.group.scale.setScalar(this.displayScale);
   this.scene.add(this.track.group,this.line.group);
   this.followHeading=undefined;this.free.keys.clear();this.select(null);
   this.gridWingPreview=false;this.rearLight.reset();this.lightTime=0;this.placeCar();this.resetCamera();this.onCruise(this.cruise.snapshot());
 }
 fit(){const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;this.viewportWidth=width;this.viewportHeight=height;this.camera.aspect=width/height;this.cockpitProjection();this.camera.updateProjectionMatrix();if(this.renderer.getPixelRatio()!==devicePixelRatio)this.renderer.setPixelRatio(devicePixelRatio);this.renderer.setSize(width,height);}
 placeCar(dt=0){if(!this.car)return;const p=this.cruise.pose();this.car.position.copy(p.position).multiplyScalar(this.displayScale);this.car.position.y+=rootClearance*this.displayScale;this.car.quaternion.copy(p.quaternion);this.car.scale.setScalar(this.displayScale);const suspension=this.cruise.dynamics.suspension;this.chassis.position.y=.30-staticDrop+suspension.heave;this.chassis.rotation.set(suspension.pitch,0,suspension.roll,'YXZ');}
 resetCamera(){
 // Discard the previous camera's orbit inertia before applying the shared entry pose.
 this.rotate=false;this.controls.autoRotate=false;
 const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
 this.view(defaultView);
 if(this.targetPos&&this.targetLook){this.camera.position.copy(this.targetPos);this.controls.target.copy(this.targetLook);this.targetPos=undefined;this.targetLook=undefined;}
 this.camera.fov=42;this.camera.updateProjectionMatrix();this.controls.update();
 }
 followHeading?:T.Quaternion; heroFollow=true; followDistance=0;
 view(v:View){
 this.endRoofDrag();
 this.cameraHousing?.setVisible(v!=='onboard');
 this.followDistance=0;this.heroFollow=v==='hero';this.followHeading=undefined;
 this.targetPos=undefined;this.targetLook=undefined;
 if(v==='trackside'){
   this.mode='trackside';this.controls.enabled=false;this.free.setEnabled(false);
   return;
 }
 if(v==='helmet'){this.mode='helmet';this.head.set(0,0,0);this.helmetLook.reset();this.controls.enabled=false;this.free.setEnabled(false);return;}
 if(v==='onboard'){this.onboardMount.rotation.set(-8*T.MathUtils.DEG2RAD,Math.PI,0,'YXZ');this.mode='onboard';this.controls.enabled=false;this.free.setEnabled(false);return;}
 if(v==='free'){
   if(this.mode!=='free' && this.car){
     const distance=this.camera.position.distanceTo(this.car.position);
     if(distance<5 || distance>200 || this.mode==='overview'){
       this.camera.position.set(14,9,-22).applyQuaternion(this.car.quaternion).add(this.car.position);
       this.camera.lookAt(this.car.position);
     }
   }
   this.mode='free';this.controls.enabled=false;this.free.setEnabled(true);return;
 }
 this.free.setEnabled(false);this.controls.enabled=true;
 if(v==='track'){this.mode='overview';const pose=this.track.overview();this.targetPos=pose.position.multiplyScalar(this.displayScale);this.targetLook=pose.target.multiplyScalar(this.displayScale);return;}
 this.mode='follow';const presets:Record<Exclude<View,'trackside'|'track'|'free'|'onboard'|'helmet'>,number[]>={hero:this.camera.aspect>1.2?[5.6,2.4,6]:[8,4,10],bottom:[5,-3.5,5],top:[0,8,.01],side:[8,1,.1],front:[0,1.2,9],rear:[0,1.5,-9]};
 const carPos=this.car?.position??new T.Vector3(),q=this.car?.quaternion??new T.Quaternion(),s=Math.sqrt(this.displayScale);
 if(v==='hero' && this.cruise.status==='idle')presets.hero[0]*=-1;
 this.targetPos=new T.Vector3().fromArray(presets[v]).multiplyScalar(s).applyQuaternion(q).add(carPos);this.targetLook=new T.Vector3(0,v==='bottom'?.15:.6,0).multiplyScalar(this.displayScale).applyQuaternion(q).add(carPos);
 }
 exploreCorner(index:number){const station=this.track.profile.turns[index];if(station===undefined)return;const pose=this.track.pose(station);this.targetPos=undefined;this.targetLook=undefined;this.camera.position.copy(pose.position.multiplyScalar(this.displayScale)).add(new T.Vector3(16,15,-25).applyQuaternion(pose.quaternion));this.camera.lookAt(pose.position);this.view('free');}
 toggleCruise(){if(!this.car)return;this.gridWingPreview=false;this.cruise.toggle();this.onCruise(this.cruise.snapshot());}
 resetGrid(){this.sparks.clear();this.tyreSmoke.clear();this.gridWingPreview=false;this.steering=0;this.wingTravel=0;this.cruise.reset();for(const w of Object.values(this.wheels)){w.angle=0;w.steer=0;w.spin.quaternion.identity();w.pivot.rotation.y=0;}this.rearLight.reset();this.lightTime=0;this.placeCar();this.resetCamera();this.onCruise(this.cruise.snapshot());}
 setWire(v:boolean){this.wire=v;this.car?.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial)m.wireframe=v;});}
 select(key:string|null){this.selected=key;this.onSelect(key);}
 pointerDown=(e:PointerEvent)=>{this.down=[e.clientX,e.clientY];
 if((this.mode==='onboard'||this.mode==='helmet') && e.button===0 && !this.roofDrag){
   this.roofDrag={id:e.pointerId,x:e.clientX,y:e.clientY};
   this.renderer.domElement.setPointerCapture(e.pointerId);
 }
 };
 roofMove=(e:PointerEvent)=>{
   const drag=this.roofDrag;
   if(!drag || drag.id!==e.pointerId)return;
   if(this.mode==='helmet'){
     this.helmetLook.drag(e.clientX-drag.x,e.clientY-drag.y,this.renderer.domElement.clientHeight);
     drag.x=e.clientX;drag.y=e.clientY;return;
   }
   const scale=72*T.MathUtils.DEG2RAD/Math.max(1,this.renderer.domElement.clientHeight);
   const rotation=this.onboardMount.rotation;
   rotation.y-=(e.clientX-drag.x)*scale;
   rotation.x=T.MathUtils.clamp(rotation.x-(e.clientY-drag.y)*scale,-Math.PI*.49,Math.PI*.49);
   drag.x=e.clientX;drag.y=e.clientY;
 };
 endRoofDrag(){
   const drag=this.roofDrag;this.roofDrag=undefined;
   if(drag && this.renderer.domElement.hasPointerCapture(drag.id))this.renderer.domElement.releasePointerCapture(drag.id);
 }
 roofCancel=(e:PointerEvent)=>{if(this.roofDrag?.id===e.pointerId)this.endRoofDrag();};
 helmetRecenter=()=>{if(this.mode==='helmet')this.helmetLook.recenter();};
 cockpitBlur=()=>{this.endRoofDrag();};
 pointerUp=(e:PointerEvent)=>{if(this.mode==='onboard'||this.mode==='helmet'){this.roofCancel(e);return;}if(this.mode==='free'||e.button!==0||Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5||!this.car)return;const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObject(this.car,true)[0];if(!hit){this.select(null);return;}let o:T.Object3D|null=hit.object;while(o&&!names[o.name])o=o.parent;this.select(o?.name??null);};
 tick=()=>{
 if(this.destroyed)return;this.frame=requestAnimationFrame(this.tick);const now=performance.now(),dt=Math.min((now-this.last)/1000,.25);this.last=now;
 const oldPos=this.car?this.scratch.oldPos.copy(this.car.position):undefined,oldQ=this.car?this.scratch.oldQ.copy(this.car.quaternion):undefined;const ds=this.car?this.cruise.tick(dt):0;this.placeCar(dt);
 const warning=this.rearLightState,drive=this.cruise,gearbox=drive.gearbox;
 // A shared active-time clock also advances during the off-track recovery hold.
 if(drive.status==='running'||!drive.energyEnabled)this.lightTime+=dt;
 warning.time=this.lightTime;warning.running=drive.status==='running';warning.consumption=drive.energyEnabled;warning.pitLimited=drive.pitLimiterActive;
 warning.speed=drive.speed;warning.electricKw=gearbox.electricKw;warning.energyRatio=gearbox.energy/5e6;warning.deploymentAllowed=gearbox.deploymentAllowed;
 warning.flying=drive.flying;warning.brake=gearbox.brake;warning.throttle=gearbox.throttle;
 const tail=this.rearLight.update(warning),pulse=this.rearLight.frontIntensity;
 for(const lens of this.mirrorLampMaterials)lens.emissiveIntensity=pulse*1.6;
 for(const lens of this.rearLampMaterials)lens.emissiveIntensity=tail*1.6;
 this.tailPulse.value=tail*1.6;
 if(this.car)this.sparks.update(dt,this.cruise,this.chassis,this.displayScale,false);
 if(this.car&&oldPos&&oldQ&&(ds>0||this.cruise.recovering)&&this.mode==='follow'){
 let rotation=this.scratch.rotation.copy(this.car.quaternion).multiply(this.scratch.inverse.copy(oldQ).invert());
 if(this.heroFollow){
   const previous=this.scratch.inverse.copy(this.followHeading??oldQ);
   this.followHeading??=new T.Quaternion().copy(oldQ);
   this.followHeading.slerp(this.car.quaternion,1-Math.exp(-dt/.16));
   rotation.copy(this.followHeading).multiply(previous.invert());
 }
 const move=(v:T.Vector3)=>v.sub(oldPos).applyQuaternion(rotation).add(this.car!.position);
 move(this.camera.position);move(this.controls.target);
 if(this.heroFollow && !this.targetPos){
   const offset=T.MathUtils.damp(this.followDistance,T.MathUtils.clamp(this.cruise.dynamics.acceleration*.035,-.55,.45),5,dt);
   const radial=this.scratch.radial.copy(this.camera.position).sub(this.controls.target).normalize();
   this.camera.position.addScaledVector(radial,offset-this.followDistance);
   this.followDistance=offset;
 }if(this.targetPos)move(this.targetPos);if(this.targetLook)move(this.targetLook);
 }
 if(this.targetPos&&this.targetLook){const a=1-Math.exp(-6*dt);this.camera.position.lerp(this.targetPos,a);this.controls.target.lerp(this.targetLook,a);if(this.camera.position.distanceTo(this.targetPos)<.005){this.targetPos=undefined;this.targetLook=undefined;}}
 if(this.mode==='trackside' && this.car){
   const station=this.track.wrap(this.cruise.s);
   // A bank of fixed cameras. Each holds its position until the next coverage sector.
   const anchor=this.track.layout.driving.cameraStations.reduce((nearest,candidate)=>{
     const distance=(s:number)=>Math.abs(this.track.wrap(s-station+this.track.length/2)-this.track.length/2);
     return distance(candidate)<distance(nearest)?candidate:nearest;
   });

   const side=this.track.curvature(anchor)>0?-1:1;
   this.camera.position.copy(this.track.point(anchor,side*(this.track.width(anchor,side)+16)).multiplyScalar(this.displayScale));
   this.camera.position.y+=6;
   this.camera.lookAt(this.car.position.x,this.car.position.y+.7,this.car.position.z);
 }
 else if(this.mode==='helmet' && this.car){
   const physics=this.cruise.dynamics;
   const speed=this.cruise.speed;
   const ahead=this.cruise.curvature(this.cruise.distance+Math.max(8,speed*.45),8);
   const target=this.scratch.head.set(
     T.MathUtils.clamp(-physics.acceleration*.0018,-.07,.10),
     T.MathUtils.clamp(ahead*Math.max(12,speed*.30)+physics.steer*.12,-.32,.32),
     T.MathUtils.clamp(-physics.ay*.0009,-.055,.055));
   if(this.cruise.status==='running')this.headTime+=dt;
   this.head.lerp(target,1-Math.exp(-dt/ .16));
   const vibration=T.MathUtils.clamp(physics.suspension.heaveRate*.002,-.003,.003)+physics.flatSpotVibration;
   this.camera.position.set(cameraRig.eye.position[0],cameraRig.eye.position[1]+vibration,cameraRig.eye.position[2]+this.head.x*.12).applyMatrix4(this.chassis.matrixWorld);
   this.chassis.getWorldQuaternion(this.camera.quaternion);
   const look=this.helmetLook.update(dt,-this.head.x,this.head.y);
   this.camera.quaternion.multiply(this.scratch.headRotation.setFromEuler(this.scratch.euler.set(cameraRig.eye.pitch+look.pitch,Math.PI+look.yaw,this.head.z,'YXZ')));
 }
 else if(this.mode==='onboard'){this.onboardMount.getWorldPosition(this.camera.position);this.onboardMount.getWorldQuaternion(this.camera.quaternion);this.camera.position.y+=T.MathUtils.clamp(this.cruise.dynamics.suspension.heaveRate*.0015,-.002,.002)+this.cruise.dynamics.flatSpotVibration*.7;}
 else if(this.mode==='free')this.free.tick(dt);else{this.controls.autoRotate=this.rotate&&this.mode==='follow';this.controls.autoRotateSpeed=.65;this.controls.update(dt);}
 const moving=this.cruise.status!=='idle';

 for(const [key,w] of Object.entries(this.wheels)){
 w.pivot.position.copy(w.base);
 const suspension=this.cruise.dynamics.suspension;
 let hubTravel=suspension.hub[key as Corner];
 // The rendered rigid slick cannot compress like the tyre spring. Keep its contact
 // patch on the measured pavement while still allowing positive wheel travel.
 if(this.car && this.track.pit){
   const patch=this.scratch.patch.set(w.base.x,0,w.base.z).applyQuaternion(this.car.quaternion)
     .addScaledVector(this.car.position,1/this.displayScale);
   const surface=this.track.getSurfaceHeightAt(patch);
   if(surface!==undefined)hubTravel=Math.max(hubTravel,surface-patch.y-this.cruise.dynamics.tyres[key as Corner].runout);
 }
 w.pivot.position.y+=hubTravel;
 const target=key.startsWith('F')?this.cruise.dynamics.wheelAngle(w.base.x,moving?this.cruise.dynamics.steer:this.steering):0;
 const delta=(target-w.steer)*(1-Math.exp(-dt/.12));if(moving)w.steer=target;else w.steer+=T.MathUtils.clamp(delta,-dt*.95,dt*.95);w.pivot.rotation.y=w.steer;
 const tyre=this.cruise.dynamics.tyres[key as Corner];
 this.tyreViews[key as Corner]?.update(tyre);
 w.angle=tyre.angle;w.spin.quaternion.setFromAxisAngle(w.axis,w.angle);
 }
 this.updateLinks?.();
 if(this.car)this.tyreSmoke.update(dt,this.cruise,this.wheels,this.car,this.displayScale);
 this.updateWheelLCD();
 if(this.steeringWheel && this.wheels.FL && this.wheels.FR){
   // Symmetric rack angle from the two displayed Ackermann angles.
   const left=this.wheels.FL.steer,right=this.wheels.FR.steer;
   const rack=Math.abs(left+right)>1e-6?Math.atan(2/(1/Math.tan(left)+1/Math.tan(right))):0;
   this.steeringWheel.rotation.z=-T.MathUtils.clamp(10*rack,-Math.PI,Math.PI);
 }
 const nearCar=this.car&&this.camera.position.distanceTo(this.car.position)<80;const under=Boolean(nearCar&&this.car!.worldToLocal(this.scratch.eye.copy(this.camera.position)).y<-.1);
 for(const [key,fx] of Object.entries(this.tireEffects)){
   const wheel=this.wheels[key];
   fx.shadow.position.y=-wheel.pivot.position.y+.009;
   fx.shadow.visible=!under && this.roadStyle!=='outline';
   const exposure=T.MathUtils.smoothstep(this.cruise.dynamics.tyres[key as Corner].omega,15,160);
   fx.mat.opacity=.24*exposure;fx.streaks.visible=exposure>.01;
 }
 this.shadow.visible=!under && this.roadStyle!=='outline';
 const speed=this.cruise.speed;
 this.cockpitProjection();
 const fov=this.mode==='trackside' && this.car?T.MathUtils.clamp(2*Math.atan(12/Math.max(1,this.camera.position.distanceTo(this.car.position)))*T.MathUtils.RAD2DEG,10,52):this.mode==='helmet'?cameraRig.eye.verticalFov:this.mode==='onboard'?cameraRig.lens.verticalFov:42+(this.mode==='follow' && !under?8*T.MathUtils.smoothstep(speed,12,86):0);
 if(Math.abs(this.camera.fov-fov)>.02){this.camera.fov=this.mode==='onboard'||this.mode==='trackside'?fov:T.MathUtils.damp(this.camera.fov,fov,4,dt);this.camera.updateProjectionMatrix();}
 if(this.cruise.status==='idle'){
   this.wingTravel=T.MathUtils.clamp(this.wingTravel+(this.gridWingPreview?1:-1)*dt/.30,0,1);
 }else this.wingTravel=this.cruise.wingTravel;
 const blend=this.wingTravel*this.wingTravel*(3-2*this.wingTravel);
 setFlap(this.frontFlap,blend);setFlap(this.rearFlap,blend);
 if(this.flow?.mesh.visible && this.car){
   const mesh=this.flow.mesh;
   mesh.position.copy(this.car.position);mesh.quaternion.copy(this.car.quaternion);mesh.scale.copy(this.car.scale);
   const speed=this.cruise.speed,beta=Math.atan2(this.cruise.dynamics.vy,Math.max(1,speed));
   this.chassis.updateMatrix();
   this.flow.uniforms.toChassis.value.copy(this.chassis.matrix).invert();
   ['FL','FR','RL','RR'].forEach((key,i)=>{
     const w=this.wheels[key],p=w.pivot.position;
     this.flow!.uniforms.wheelPose.value[i].set(p.x,p.y,p.z,w.steer);
     this.flow!.uniforms.wheelAxis.value[i].copy(w.axis).applyQuaternion(w.pivot.quaternion).normalize();
   });
   this.flow.update(this.cruise.status==='paused'?0:dt,speed,blend,beta,this.cruise.dynamics.suspension.frontGap,this.cruise.dynamics.suspension.rearGap,this.cruise.dynamics.steer,dt,this.cruise.dynamics.yawRate);
 }
 if(this.pressureEnabled){
   const platform=this.cruise.dynamics.suspension;
   this.pressure?.update(blend,platform.beta,this.cruise.speed,platform.frontGap,platform.rearGap);
 }
 this.track.setStyle(this.roadStyle,under);this.mirrorFlash?.update(this.camera,pulse);this.renderer.render(this.scene,this.camera);
 const metrics=this.metrics;metrics.frames++;metrics.elapsed+=dt;metrics.cpu+=performance.now()-now;
 if(now-metrics.last>1000){
   const canvas=this.renderer.domElement;
   canvas.dataset.frameMs=(metrics.elapsed*1000/metrics.frames).toFixed(2);
   canvas.dataset.mainMs=(metrics.cpu/metrics.frames).toFixed(2);
   canvas.dataset.pixelRatio=String(this.renderer.getPixelRatio());
   canvas.dataset.drawCalls=String(this.renderer.info.render.calls);
   canvas.dataset.flowFirstFrameMs=String(this.flow?.stats.firstFrameMs??-1);
   canvas.dataset.flowSolveMs=(this.flow?.stats.solveMs??0).toFixed(2);
   metrics.frames=metrics.elapsed=metrics.cpu=0;metrics.last=now;
 }
 if(now-this.lastTelemetry<100)return;this.lastTelemetry=now;this.onCruise({...this.cruise.snapshot(),flowRatio:this.flow?.mesh.visible?this.flow.stats.localRatio:undefined});

 };
 private replayCamera=new T.PerspectiveCamera(76,2,.05,15000);
 reviewImage(canvas:HTMLCanvasElement,f:ReviewFrame){
   const car=this.car;if(!car)return;
   const pos=car.position.clone(),q=car.quaternion.clone(),roll=this.chassis.rotation.clone(),height=this.chassis.position.y;
   const wheelStates=Object.values(this.wheels).map(w=>({angle:w.pivot.rotation.y,y:w.pivot.position.y}));
   const rack=this.steeringWheel?.rotation.z??0;
   car.position.copy(f.position).multiplyScalar(this.displayScale);car.position.y+=rootClearance*this.displayScale;car.quaternion.copy(f.rotation);
   this.chassis.position.y=.30-staticDrop+f.heave;this.chassis.rotation.set(f.pitch,0,f.roll,'YXZ');
   for(const [name,w] of Object.entries(this.wheels)){
     w.pivot.position.y=w.base.y+f.hubs[name as Corner];
     if(name.startsWith('F'))w.pivot.rotation.y=this.cruise.dynamics.wheelAngle(w.base.x,f.rack);
   }
   if(this.steeringWheel)this.steeringWheel.rotation.z=-T.MathUtils.clamp(10*f.rack,-Math.PI,Math.PI);
   this.updateLinks?.();
 this.updateWheelLCD(f);this.onboardMount.getWorldPosition(this.replayCamera.position);
   this.chassis.getWorldQuaternion(this.replayCamera.quaternion);
   this.replayCamera.rotateY(Math.PI);this.replayCamera.rotateX(-8*T.MathUtils.DEG2RAD);
   const renderer=this.renderer,viewport=renderer.getViewport(new T.Vector4());
   const source=renderer.domElement,ratio=renderer.getPixelRatio();
   const w=Math.min(source.width,source.height*2,canvas.width),h=Math.floor(w/2);
   this.cameraHousing?.setVisible(false);renderer.setViewport(0,0,w/ratio,h/ratio);renderer.render(this.scene,this.replayCamera);
   canvas.getContext('2d')?.drawImage(source,0,source.height-h,w,h,0,0,canvas.width,canvas.height);
   renderer.setViewport(viewport);car.position.copy(pos);car.quaternion.copy(q);this.chassis.rotation.copy(roll);this.chassis.position.y=height;
   Object.values(this.wheels).forEach((w,i)=>{w.pivot.rotation.y=wheelStates[i].angle;w.pivot.position.y=wheelStates[i].y;});
   this.updateLinks?.();
   if(this.steeringWheel)this.steeringWheel.rotation.z=rack;
   this.lcdTime=0;this.updateWheelLCD();this.cameraHousing?.setVisible(this.mode!=='onboard');renderer.render(this.scene,this.camera);
 }
 disposeObject(o:T.Object3D){const textures=new Set<T.Texture>();o.traverse(n=>{if(n instanceof T.Mesh||n instanceof T.Line||n instanceof T.Points){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);m.dispose();}}});for(const t of textures)t.dispose();}
 dispose(){this.endRoofDrag();window.removeEventListener('blur',this.cockpitBlur);this.renderer.domElement.removeEventListener('dblclick',this.helmetRecenter);this.flow?.dispose();this.pressure?.dispose();this.scene.remove(this.track.group,this.line.group);this.session.dispose();this.mirrorFlash?.dispose();Object.values(this.tyreViews).forEach(v=>v.dispose());this.wheelLCD?.dispose();this.destroyed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.free.dispose();this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.pointerUp);this.renderer.domElement.removeEventListener('lostpointercapture',this.roofCancel);this.renderer.domElement.removeEventListener('pointercancel',this.roofCancel);this.renderer.domElement.removeEventListener('pointermove',this.roofMove);this.disposeObject(this.scene);this.env.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
