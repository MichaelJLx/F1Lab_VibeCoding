import * as T from 'three';
/** Unbound camera: rotates in place and translates in world space. No vehicle target. */
export class FreeCamera {
 enabled=false;speed=35;keys=new Set<string>();dragging=false;last=[0,0];yaw=0;pitch=0;
 constructor(public camera:T.PerspectiveCamera,public canvas:HTMLCanvasElement){
 canvas.tabIndex=0;canvas.setAttribute('aria-label','三维赛道画布');
 canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('contextmenu',this.context);
 window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.blur);
 }
 setEnabled(enabled:boolean){this.enabled=enabled;this.keys.clear();this.dragging=false;const e=new T.Euler().setFromQuaternion(this.camera.quaternion,'YXZ');this.yaw=e.y;this.pitch=e.x;if(enabled)this.canvas.focus({preventScroll:true});}
 down=(e:PointerEvent)=>{if(!this.enabled)return;this.dragging=true;this.last=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);this.canvas.focus({preventScroll:true});};
 move=(e:PointerEvent)=>{if(!this.enabled||!this.dragging)return;this.yaw-=(e.clientX-this.last[0])*.003;this.pitch=T.MathUtils.clamp(this.pitch-(e.clientY-this.last[1])*.003,-Math.PI/2+.01,Math.PI/2-.01);this.last=[e.clientX,e.clientY];this.camera.quaternion.setFromEuler(new T.Euler(this.pitch,this.yaw,0,'YXZ'));};
 up=(e:PointerEvent)=>{this.dragging=false;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);};
 wheel=(e:WheelEvent)=>{if(!this.enabled)return;e.preventDefault();const f=this.camera.getWorldDirection(new T.Vector3());this.camera.position.addScaledVector(f,-Math.sign(e.deltaY)*this.speed*.16);};
 context=(e:Event)=>{if(this.enabled)e.preventDefault();};
 keydown=(e:KeyboardEvent)=>{if(!this.enabled||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;const k=e.code;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)){e.preventDefault();this.keys.add(k);}};
 keyup=(e:KeyboardEvent)=>{this.keys.delete(e.code);};blur=()=>{this.keys.clear();this.dragging=false;};
 tick(dt:number){if(!this.enabled)return;const k=this.keys,f=this.camera.getWorldDirection(new T.Vector3()),right=new T.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),motion=new T.Vector3();if(k.has('KeyW')||k.has('ArrowUp'))motion.add(f);if(k.has('KeyS')||k.has('ArrowDown'))motion.sub(f);if(k.has('KeyD')||k.has('ArrowRight'))motion.add(right);if(k.has('KeyA')||k.has('ArrowLeft'))motion.sub(right);if(k.has('KeyE'))motion.y+=1;if(k.has('KeyQ'))motion.y-=1;const boost=k.has('ShiftLeft')||k.has('ShiftRight')?4:1;if(motion.lengthSq())this.camera.position.addScaledVector(motion.normalize(),this.speed*boost*dt);}
 dispose(){this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);this.canvas.removeEventListener('contextmenu',this.context);window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.blur);}
}
