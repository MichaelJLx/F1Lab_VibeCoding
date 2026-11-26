import {Quaternion,Vector3} from 'three';

/** Rotation-minimising frame; no camera-dependent cross-product sign changes. */
export class RibbonFrame{
 private previous=new Vector3(0,0,-1);
 private rotation=new Quaternion();
 normal=new Vector3(1,0,0);
 reset(tangent:Vector3){
  this.previous.copy(tangent);
  this.normal.set(Math.abs(tangent.x)<.8?1:0,Math.abs(tangent.x)<.8?0:1,0);
  this.normal.addScaledVector(tangent,-this.normal.dot(tangent)).normalize();
 }
 advance(tangent:Vector3){
  this.rotation.setFromUnitVectors(this.previous,tangent);
  this.normal.applyQuaternion(this.rotation).addScaledVector(tangent,-this.normal.dot(tangent)).normalize();
  this.previous.copy(tangent);
 }
}
