import * as T from 'three';
import layout from '../../../vehicles/rb22/rig/airflow-boundary.json';
import type {FlowState} from './FlowProtocol';

/** Model-derived, trilinear distance queries. No triangle traversal in a solve. */
export function distanceBoundary(data:Int16Array){
 const body=new T.Matrix4(),pivot=new T.Vector3(),axis=new T.Vector3();
 const point=new T.Vector3(),gradient=new T.Vector3(),bestNormal=new T.Vector3();
 const rotation=new T.Matrix4(),shift=new T.Matrix4();
 const volumes=layout.volumes.map(v=>({...v,toLocal:new T.Matrix4(),fromLocal:new T.Matrix4()}));
 function sample(position:T.Vector3,range:number){
   let nearest=range;bestNormal.set(0,0,0);
   for(const v of volumes){
    point.copy(position).applyMatrix4(v.toLocal);
    const x=(point.x-v.min[0])/layout.spacing,y=(point.y-v.min[1])/layout.spacing,z=(point.z-v.min[2])/layout.spacing;
    const [nx,ny,nz]=v.size;
    if(x<0||y<0||z<0||x>=nx-1||y>=ny-1||z>=nz-1)continue;
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
    const stride=ny*nz,k=v.offset+ix*stride+iy*nz+iz;
    const a=data[k],b=data[k+stride],c=data[k+nz],d=data[k+stride+nz];
    const e=data[k+1],f=data[k+stride+1],g=data[k+nz+1],h=data[k+stride+nz+1];
    const ab=a+(b-a)*fx,cd=c+(d-c)*fx,ef=e+(f-e)*fx,gh=g+(h-g)*fx;
    const low=ab+(cd-ab)*fy,high=ef+(gh-ef)*fy;
    const distance=(low+(high-low)*fz)*.001;
    if(distance>=nearest)continue;
    nearest=distance;
    gradient.set(
     ((b-a)*(1-fy)+(d-c)*fy)*(1-fz)+((f-e)*(1-fy)+(h-g)*fy)*fz,
     (cd-ab)*(1-fz)+(gh-ef)*fz,high-low
    );
    bestNormal.copy(gradient).transformDirection(v.fromLocal);
   }
   return nearest;
 }
 return {
  sync(state:FlowState){
   if(state.toChassis){body.fromArray(state.toChassis);body.premultiply(shift.makeTranslation(0,layout.modelOriginY,0));}else body.identity();
   for(const v of volumes){
    v.toLocal.copy(body);
    if('pivot' in v && v.pivot && v.axis && v.openAngle!==undefined){
     pivot.fromArray(v.pivot);axis.fromArray(v.axis).normalize();
     rotation.makeTranslation(-pivot.x,-pivot.y,-pivot.z);
     rotation.premultiply(shift.makeRotationAxis(axis,-v.openAngle*state.opening));
     rotation.premultiply(shift.makeTranslation(pivot.x,pivot.y,pivot.z));
     v.toLocal.premultiply(rotation);
    }
    v.fromLocal.copy(v.toLocal).invert();
   }
  },
  distanceAt(position:T.Vector3){return sample(position,Infinity);},
  repel(position:T.Vector3,velocity:T.Vector3){
   const nearest=sample(position,.17);
   if(nearest>=.17||bestNormal.lengthSq()<.1)return;
   const inward=velocity.dot(bestNormal);
   const influence=Math.exp(-Math.max(0,nearest-.025)/.055)*(1-T.MathUtils.smoothstep(nearest,.12,.17));
   if(inward<0)velocity.addScaledVector(bestNormal,-inward*influence);
   // Stagnation pressure acts before contact; only a tiny final skin clearance
   // correction remains. Never jump a streamline across a body panel.
   velocity.addScaledVector(bestNormal,.20*influence);
   if(nearest<.012)position.addScaledVector(bestNormal,Math.min(.012,.012-nearest));
  }
 };
}
