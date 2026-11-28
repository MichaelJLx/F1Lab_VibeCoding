import {useSyncExternalStore} from 'react';
import type {CruiseSnapshot} from '../../simulation/driving/Cruise';
export const idleSnapshot:CruiseSnapshot={status:'idle',speed:0,progress:0,elapsed:0,distance:0};
/** Read-only UI feed. Driving inputs remain explicit commands to Inspector. */
export class TelemetryStore{
 private value=idleSnapshot;
 private listeners=new Set<()=>void>();
 get=()=>this.value;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 publish(snapshot:CruiseSnapshot){this.value=snapshot;for(const listener of this.listeners)listener();}
}
export function useTelemetry(store:TelemetryStore){return useSyncExternalStore(store.subscribe,store.get,store.get);}
/** Only discrete control changes should refresh the application shell. */
export function controlKey(s:CruiseSnapshot){return [s.status,s.phase,s.lap,s.attempt,s.invalidLap,s.recovering,s.aeroZone,s.report?.i,s.report?.delta,Boolean(s.finishHold)].join('/');}
