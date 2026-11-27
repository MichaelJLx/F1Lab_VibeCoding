import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import catalog from '../src/tracks/catalog.json';
import {circuitData} from '../src/tracks/CircuitRegistry';
import {validateCircuit} from '../src/tracks/CircuitSchema';
import {CircuitTrack} from '../src/tracks/CircuitTrack';
import {TrackSurface} from '../src/tracks/TrackSurface';
import {CircuitSession} from '../src/tracks/CircuitSession';
import {RacingLine} from '../src/optimizer/RacingLine';
import {mapGeometry} from '../src/ui/TrackMapLayout';
import {TelemetryStore,controlKey,idleSnapshot} from '../src/ui/TelemetryStore';

test('all 24 circuits share a valid schema, closed road and complete map labels',()=>{
 assert.equal(catalog.length,24);
 for(const c of catalog){const d=circuitData(c.id);validateCircuit(d);const track=new CircuitTrack(d,false);
 try{
  assert.equal(track.profile.turns.length,c.turns);
  assert.ok(track.point(0).distanceTo(track.point(track.length))<1e-8);
  for(let i=0;i<16;i++)assert.ok(Number.isFinite(track.getSurfaceHeightAt(track.point(track.length*i/16))),c.id);
  assert.ok(Number.isFinite(track.getSurfaceHeightAt(track.pit.point(d.pit.box.station))),`${c.id} pit box`);
  const labels=mapGeometry(track).keyTurns;assert.equal(labels.length,c.turns);
  for(const {label} of labels)assert.ok(label[0]>=0&&label[0]<=300&&label[1]>=0&&label[1]<=220);
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(Math.abs(labels[i].label[0]-labels[j].label[0])>=((i<9?7:12)+(j<9?7:12))/2+3||Math.abs(labels[i].label[1]-labels[j].label[1])>=10,`${c.id} labels ${i+1}/${j+1}`);
 }finally{track.dispose();}}
});
test('surface queries distinguish overpasses, kerbs and material without per-query allocation',()=>{
 const surface=new TrackSurface(),p=new T.Vector3(.2,0,.2);
 for(const y of [0,5])surface.addFace(new T.Vector3(0,y,0),new T.Vector3(1,y,0),new T.Vector3(0,y,1));
 const hit=surface.query(p)!;assert.equal(hit.height,0);assert.equal(hit.normal.y,1);
 p.y=4.9;assert.equal(surface.query(p),hit);assert.equal(hit.height,5);
 surface.addFace(new T.Vector3(0,5.1,0),new T.Vector3(1,5.1,0),new T.Vector3(0,5.1,1),'kerb');p.y=5.1;
 assert.equal(surface.query(p)?.material,'kerb');assert.equal(surface.heightAt(p,false),5);
 surface.clear();assert.equal(surface.query(p),undefined);
});
test('hidden lines defer rendering; revealing them uses the latest route and colour',()=>{
 const track=new CircuitTrack(circuitData(catalog[0].id),false),line=new RacingLine(track),workerLine=new RacingLine(track,false);let samples=0;
 const route=(s:number)=>{samples++;return track.point(s);};
 line.setVisible(false,false);line.update(route);line.shade(()=>3);line.setAlternatives([0,0,0,1,0,1]);
 workerLine.update(route);workerLine.shade(()=>3);assert.equal(samples,0);
 assert.equal(workerLine.mesh.geometry.getAttribute('position'),undefined);
 line.setVisible(true,true);assert.ok(samples>0);assert.ok(line.mesh.geometry.getAttribute('color').count>0);assert.equal(line.alternatives.geometry.getAttribute('position').count,2);
 line.dispose();workerLine.dispose();track.dispose();
});
test('telemetry numbers update subscribers without changing the controls key',()=>{
 const store=new TelemetryStore();let calls=0;const off=store.subscribe(()=>calls++);
 const moving={...idleSnapshot,speed:100,elapsed:2,distance:100};store.publish(moving);
 assert.equal(store.get(),moving);assert.equal(calls,1);assert.equal(controlKey(idleSnapshot),controlKey(moving));
 assert.notEqual(controlKey(moving),controlKey({...moving,phase:'timed'}));off();store.publish(idleSnapshot);assert.equal(calls,1);
});
test('session disposal terminates its planner and releases shared resources once',()=>{
 const session=new CircuitSession(circuitData(catalog[0].id),undefined,false);let terminated=0,disposed=0;
 session.cruise.planWorker={terminate(){terminated++;}} as unknown as Worker;
 session.track.road.geometry.addEventListener('dispose',()=>disposed++);
 session.dispose();session.dispose();assert.equal(terminated,1);assert.equal(disposed,1);
 assert.equal(session.track.getSurfaceHeightAt(new T.Vector3()),undefined);
});
