import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {Tyre} from '../../src/simulation/vehicle/Tyre';
import {nextCompound,tyreCompounds} from '../../src/simulation/vehicle/TyreCompound';
import {nextPressureUnit,pressureReading} from '../../src/ui/controls/VehicleStatus';
import {CircuitTrack} from '../../src/tracks/CircuitTrack';
import {circuitData} from '../../src/tracks/CircuitRegistry';
import {Cruise} from '../../src/simulation/driving/Cruise';
import {RacingLine} from '../../src/simulation/driving/RacingLine';
import {tyreView} from '../../src/scene/vehicle/TyreView';

test('pressure units cycle without changing physical pressure; compounds trade grip for wear',()=>{
 assert.equal(nextPressureUnit(nextPressureUnit(nextPressureUnit('PSI'))),'PSI');
 assert.deepEqual(['PSI','BAR','kPa'].map(u=>pressureReading(160,u as 'PSI'|'BAR'|'kPa')),['23.2','1.60','160']);
 assert.equal(nextCompound(nextCompound(nextCompound('soft'))),'soft');
 const tyres=(['soft','medium','hard'] as const).map(compound=>{const t=new Tyre(.35);t.compound=compound;t.wearEnabled=true;t.lateralG=3;t.omega=40/.35;for(let i=0;i<240;i++)t.step(1/240,40,0,5000,3500);return t;});
 assert.ok(tyres[0].grip>tyres[1].grip&&tyres[1].grip>tyres[2].grip);
 assert.ok(tyres[0].degradation>tyres[1].degradation&&tyres[1].degradation>tyres[2].degradation);
});

test('replacement preserves lap, car motion and tyre phase, resets wear and invalidates stale planning',()=>{
 const track=new CircuitTrack(circuitData('be-1925'),false),line=new RacingLine(track,false),car=new Cruise(track,line);
 try{
  car.distance=2000;car.elapsed=22.5;car.speed=50;car.status='running';car.lap=2;car.wearEnabled=true;
  const pose=car.pose().position.clone(),oldGeneration=(car as any).generation;
  car.tyreCompound='hard';
  const hardPlan=[...car.speedPlan];car.tyreCompound='soft';
  assert.ok(car.speedPlan.some((v,i)=>v>hardPlan[i]+.1),'planner uses compound grip');
  car.tyreCompound='hard';
  for(const t of Object.values(car.dynamics.tyres)){t.degradation=.6;t.pressure=205;t.temperature=120;t.omega=123;t.angle=1.23;t.flatSpots[0].depth=.003;}
  car.replaceTyres();
  assert.equal(car.distance,2000);assert.equal(car.elapsed,22.5);assert.equal(car.speed,50);assert.equal(car.lap,2);assert.equal(car.status,'running');assert.ok(car.pose().position.distanceTo(pose)<1e-8);
  for(const t of Object.values(car.dynamics.tyres)){assert.equal(t.compound,'hard');assert.equal(t.pressure,160);assert.equal(t.degradation,0);assert.equal(t.omega,123);assert.equal(t.angle,1.23);assert.ok(t.flatSpots.every(s=>s.depth===0));}
  assert.ok((car as any).generation>oldGeneration);
  let request:any;car.planWorker={postMessage(data:unknown){request=data;},terminate(){}} as unknown as Worker;
  (car as any).stageNextLap();assert.equal(request.request.compound,'hard');assert.deepEqual(request.request.wear,[0,0,0,0]);
  car.dynamics.reset();assert.ok(Object.values(car.dynamics.tyres).every(t=>t.compound==='hard'));
 }finally{car.dispose();line.dispose();track.dispose();}
});

test('compound colour updates tyre sidewall shader while preserving the rubber material map',()=>{
 const spin=new T.Group(),wheel=new T.Group(),material=new T.MeshStandardMaterial({name:'sidewall-test',map:new T.Texture()});spin.add(wheel);wheel.add(new T.Mesh(new T.SphereGeometry(.35),material));
 const view=tyreView(spin,.35),bound=(wheel.children[0] as T.Mesh).material as T.MeshStandardMaterial;
 const shader:any={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>'};bound.onBeforeCompile(shader,{} as T.WebGLRenderer);
 const tyre=new Tyre(.35);tyre.compound='medium';view.update(tyre);
 assert.equal(shader.uniforms.compoundColour.value.getHexString(),new T.Color(tyreCompounds.medium.color).getHexString());assert.equal(bound.map,material.map);
 tyre.compound='hard';view.update(tyre);assert.equal(shader.uniforms.compoundColour.value.getHexString(),new T.Color(tyreCompounds.hard.color).getHexString());
 view.dispose();
});
