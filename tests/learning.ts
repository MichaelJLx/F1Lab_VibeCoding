import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultStrategy,rememberGroup,nextStrategy,type GroupMemory} from '../src/motion/LapLearning';
import {DriverMemory} from '../src/motion/DriverMemory';
test('group exploration preserves measured best and backs off immediately after an incident',()=>{
 const memory:GroupMemory={step:.2,clean:0,failed:false};const safe=defaultStrategy();
 rememberGroup(memory,safe,12,55,false,[.2,.8]);
 const trial=nextStrategy(memory);assert.ok(trial.late>safe.late&&trial.apexGain>safe.apexGain);
 rememberGroup(memory,trial,12.3,55,false);assert.deepEqual(memory.best,safe);assert.deepEqual(memory.weights,[.2,.8]);assert.ok(memory.step<.2);
 const smaller=memory.step;
 rememberGroup(memory,trial,10,55,true);assert.deepEqual(nextStrategy(memory),safe);assert.equal(memory.step,smaller*.5);assert.equal(memory.time,12);
 rememberGroup(memory,safe,12,55,false);const fast={...nextStrategy(memory),apex:.2};
 rememberGroup(memory,fast,11.9,55,false);assert.deepEqual(memory.best,fast);assert.equal(memory.time,11.9);
 // A rolling-start advantage cannot replace the same-entry benchmark.
 rememberGroup(memory,{...fast,entry:1},10,70,false);assert.deepEqual(memory.best,fast);
});
test('learned groups and lap history remain isolated per circuit',()=>{
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 const a=new DriverMemory('circuit-a',16,8),b=new DriverMemory('circuit-b',14,7);
 rememberGroup(a.groups[0],defaultStrategy(),8,40,false);a.save();
 assert.equal(new DriverMemory('circuit-a',16,8).groups[0].time,8);assert.equal(b.groups[0].best,undefined);
 delete (globalThis as {localStorage?:unknown}).localStorage;
});
