import assert from 'node:assert/strict';
import test from 'node:test';
import {Tyre} from '../src/motion/Tyre';
import {Suspension} from '../src/motion/Suspension';
import {TyreSmoke} from '../src/model/TyreSmoke';
import {SkidSparks} from '../src/model/SkidSparks';
import * as T from 'three';

test('lockup stores exact rubber phase and damage rotates with the contact patch',()=>{
 const tyre=new Tyre(.35);tyre.angle=1.234567;
 for(let i=0;i<240;i++)tyre.step(1/240,40,-16000,5000,3500);
 assert.ok(tyre.locked);assert.equal(tyre.flatSpots[0].phase,1.234567);
 assert.ok(tyre.depthAt(1.234567)>.0001);assert.equal(tyre.depthAt(1.234567+Math.PI),0);
 assert.ok(tyre.smokePower>0);assert.equal(tyre.degradation,0,'flat spots do not require normal tyre wear');
 tyre.clearFlatSpots();assert.equal(tyre.depthAt(1.234567),0);assert.ok(tyre.wear.every(x=>x===0));
});
test('ordinary rolling stays smoke-free; severe lateral sliding produces friction smoke',()=>{
 const tyre=new Tyre(.35);tyre.omega=40/.35;tyre.lateralForce=4000;tyre.lateralSlip=.07;
 tyre.step(1/240,40,0,5000,3500);assert.equal(tyre.smokePower,0);
 tyre.lateralSlip=.4;tyre.step(1/240,40,0,5000,3500);assert.ok(tyre.smokePower>0);
 tyre.lateralSlip=0;tyre.step(1/240,40,0,5000,3500);assert.equal(tyre.smokePower,0);
});
test('independent bump and flat-spot runout move their own hubs; heavy braking loads the front',()=>{
 const s=new Suspension(800,1.75,1.636);s.ground.FL=.025;
 for(let i=0;i<50;i++)s.step(1/1200,0,0,0,0);
 assert.ok(s.hub.FL>s.hub.FR+.005);
 const smooth=new Suspension(800,1.75,1.636),flat=new Suspension(800,1.75,1.636);
 flat.runout.FL=.004;
 for(let i=0;i<100;i++){smooth.step(1/1200,30,0,0,0);flat.step(1/1200,30,0,0,0);}
 assert.ok(flat.hub.FL<smooth.hub.FL-.0005);
 s.reset();for(let i=0;i<240;i++)s.step(1/240,65,-35,0,0);
 assert.ok(s.loads.FL+s.loads.FR>s.loads.RL+s.loads.RR);
 assert.ok([s.heave,s.pitch,...Object.values(s.loads)].every(Number.isFinite));
});
test('smoke pool stays bounded and sparks require floor contact, then bounce above asphalt',()=>{
 const tyres=Object.fromEntries(['FL','FR','RL','RR'].map(k=>[k,new Tyre(.35)]));
 for(const t of Object.values(tyres))t.smokePower=200000;
 const car=new T.Group(),wheels=Object.fromEntries(Object.keys(tyres).map(k=>{const pivot=new T.Group();pivot.position.y=.35;car.add(pivot);return [k,{pivot,radius:.35}];}));
 const cruise={status:'running',recovering:false,dynamics:{tyres},speed:60,track:{pit:{heightAt:()=>0}},gearbox:{brake:1}} as any;
 const smoke=new TyreSmoke(1);for(let i=0;i<180;i++)smoke.update(1/60,cruise,wheels,car,1);
 assert.ok((smoke.mesh.geometry as T.InstancedBufferGeometry).instanceCount>0);assert.ok((smoke.mesh.geometry as T.InstancedBufferGeometry).instanceCount<=256);
 const sparks=new SkidSparks(1),chassis=new T.Group();chassis.position.y=.6;
 for(let i=0;i<60;i++)sparks.update(1/60,cruise,chassis,1,false);assert.equal(sparks.trails.visible,false);
 chassis.position.y=.20;for(let i=0;i<12;i++)sparks.update(1/60,cruise,chassis,1,false);
 assert.equal(sparks.trails.visible,true);
 const pos=sparks.trails.geometry.getAttribute('position');for(let i=0;i<sparks.trails.geometry.drawRange.count;i+=2)assert.ok(pos.getY(i)>=.0019);
 smoke.clear();sparks.clear();assert.equal(smoke.mesh.visible,false);assert.equal(sparks.trails.visible,false);
});
