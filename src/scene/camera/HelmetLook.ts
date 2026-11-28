import {MathUtils} from 'three';

// Conservative cockpit viewing envelope, not an FIA-mandated anatomical limit.
export const helmetLookLimits={yaw:55*MathUtils.DEG2RAD,up:18*MathUtils.DEG2RAD,down:30*MathUtils.DEG2RAD};

export class HelmetLook {
 private targetYaw=0;private targetPitch=0;
 private yaw=0;private pitch=0;
 readonly pose={yaw:0,pitch:0};
 drag(dx:number,dy:number,height:number){
   const sensitivity=70*MathUtils.DEG2RAD/Math.max(1,height);
   this.targetYaw=MathUtils.clamp(this.targetYaw-dx*sensitivity,-helmetLookLimits.yaw,helmetLookLimits.yaw);
   this.targetPitch=MathUtils.clamp(this.targetPitch-dy*sensitivity,-helmetLookLimits.down,helmetLookLimits.up);
 }
 recenter(){this.targetYaw=0;this.targetPitch=0;}
 reset(){this.recenter();this.yaw=0;this.pitch=0;this.pose.yaw=0;this.pose.pitch=0;}
 update(dt:number,automaticPitch:number,automaticYaw:number){
   const blend=1-Math.exp(-Math.max(0,dt)/.075);
   this.yaw=MathUtils.lerp(this.yaw,this.targetYaw,blend);
   this.pitch=MathUtils.lerp(this.pitch,this.targetPitch,blend);
   this.pose.yaw=MathUtils.clamp(this.yaw+automaticYaw,-helmetLookLimits.yaw,helmetLookLimits.yaw);
   const reach=1-.25*(this.pose.yaw/helmetLookLimits.yaw)**2;
   this.pose.pitch=MathUtils.clamp(this.pitch+automaticPitch,-helmetLookLimits.down*reach,helmetLookLimits.up*reach);
   return this.pose;
 }
}
