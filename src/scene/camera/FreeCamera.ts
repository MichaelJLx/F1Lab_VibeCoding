import * as T from 'three';

export class FreeCamera {
 enabled=false;
 speed=35;
 keys=new Set<string>();
 private pointer?:number;
 private pan=false;
 private x=0;
 private y=0;
 private yaw=0;
 private pitch=0;
 private velocity=new T.Vector3();
 private forward=new T.Vector3();
 private right=new T.Vector3();
 private motion=new T.Vector3();
 private dolly=0;
 constructor(public camera:T.PerspectiveCamera, public canvas:HTMLCanvasElement){
   canvas.tabIndex=0;
   canvas.setAttribute('aria-label','三维赛道');
   canvas.addEventListener('pointerdown',this.down);
   canvas.addEventListener('pointermove',this.move);
   canvas.addEventListener('pointerup',this.up);
   canvas.addEventListener('pointercancel',this.up);
   canvas.addEventListener('lostpointercapture',this.up);
   canvas.addEventListener('wheel',this.wheel,{passive:false});
   canvas.addEventListener('keydown',this.keydown);
   canvas.addEventListener('blur',this.stop);
   canvas.addEventListener('contextmenu',this.context);
   window.addEventListener('keyup',this.keyup);
   window.addEventListener('blur',this.stop);
 }
 stop=()=>{this.keys.clear();this.velocity.set(0,0,0);this.dolly=0;this.pointer=undefined;};
 setEnabled(enabled:boolean){
   this.stop();this.enabled=enabled;
   const e=new T.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');
   this.yaw=e.y;this.pitch=e.x;
   if(enabled)this.canvas.focus({preventScroll:true});
 }
 down=(e:PointerEvent)=>{
   if(!this.enabled||this.pointer!==undefined)return;
   this.canvas.focus({preventScroll:true});this.pointer=e.pointerId;
   this.x=e.clientX;this.y=e.clientY;this.pan=e.button===2||e.shiftKey;
   this.canvas.setPointerCapture(e.pointerId);
 };
 move=(e:PointerEvent)=>{
   if(e.pointerId!==this.pointer)return;
   const dx=e.clientX-this.x,dy=e.clientY-this.y;
   if(this.pan){
     this.camera.translateX(-dx*this.speed*.002);
     this.camera.translateY(dy*this.speed*.002);
   }else{
     this.yaw-=dx*.0025;this.pitch=T.MathUtils.clamp(this.pitch-dy*.0025,-1.55,1.55);
     this.camera.quaternion.setFromEuler(new T.Euler(this.pitch,this.yaw,0,'YXZ'));
   }
   this.x=e.clientX;this.y=e.clientY;
 };
 up=(e:PointerEvent)=>{if(e.pointerId===this.pointer)this.pointer=undefined;};
 context=(e:Event)=>{if(this.enabled)e.preventDefault();};
 wheel=(e:WheelEvent)=>{
   if(!this.enabled)return;e.preventDefault();
   const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.canvas.clientHeight:1);
   this.dolly=T.MathUtils.clamp(this.dolly-pixels*this.speed*.004,-this.speed,this.speed);
 };
 keydown=(e:KeyboardEvent)=>{
   if(!this.enabled||e.metaKey||e.ctrlKey||e.altKey)return;
   if(/^(Key[WASDQE]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code)){
     e.preventDefault();this.keys.add(e.code);
   }
 };
 keyup=(e:KeyboardEvent)=>{this.keys.delete(e.code);};
 tick(dt:number){
   if(!this.enabled)return;
   const held=(a:string,b?:string)=>Number(this.keys.has(a)||!!b&&this.keys.has(b));
   this.forward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
   this.right.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
   this.motion.copy(this.forward).multiplyScalar(held('KeyW','ArrowUp')-held('KeyS','ArrowDown'))
     .addScaledVector(this.right,held('KeyD','ArrowRight')-held('KeyA','ArrowLeft'));
   this.motion.y=held('KeyE')-held('KeyQ');
   this.motion.normalize().multiplyScalar(this.speed*(held('ShiftLeft','ShiftRight')?3:1));
   const blend=1-Math.exp(-14*dt);
   this.velocity.lerp(this.motion,blend);this.camera.position.addScaledVector(this.velocity,dt);
   this.camera.translateZ(-this.dolly*blend);this.dolly*=1-blend;
 }
 dispose(){
   const c=this.canvas;
   c.removeEventListener('pointerdown',this.down);c.removeEventListener('pointermove',this.move);
   c.removeEventListener('pointerup',this.up);c.removeEventListener('pointercancel',this.up);
   c.removeEventListener('lostpointercapture',this.up);c.removeEventListener('wheel',this.wheel);
   c.removeEventListener('keydown',this.keydown);c.removeEventListener('blur',this.stop);
   c.removeEventListener('contextmenu',this.context);
   window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.stop);
 }
}
