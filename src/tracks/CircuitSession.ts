import {CircuitTrack} from './CircuitTrack';
import type {CircuitData} from './CircuitData';
import {Cruise} from '../motion/Cruise';
import {RacingLine} from '../optimizer/RacingLine';
/** Owns one circuit's resources; the scene only attaches/detaches its groups. */
export class CircuitSession{
 readonly track:CircuitTrack;readonly line:RacingLine;readonly cruise:Cruise;
 private disposed=false;
 constructor(data:CircuitData,previous?:CircuitSession,signage=true){
   this.track=new CircuitTrack(data,signage);this.line=new RacingLine(this.track);this.cruise=new Cruise(this.track,this.line);
   if(previous){const old=previous.cruise;
     this.cruise.contactCenters=old.contactCenters;this.cruise.lapCount=old.lapCount;
     this.cruise.energyEnabled=old.energyEnabled;this.cruise.wearEnabled=old.wearEnabled;
     this.cruise.limitKmh=old.limitKmh;this.cruise.pace=old.pace;
     this.track.signs.visible=previous.track.signs.visible;
     this.line.setVisible(previous.line.mesh.visible,previous.line.alternatives.visible);
   }
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.cruise.dispose();this.line.dispose();this.track.dispose();}
}
