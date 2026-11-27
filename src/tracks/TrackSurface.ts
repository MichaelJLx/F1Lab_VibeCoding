import * as T from 'three';
export type SurfaceMaterial='asphalt'|'pit'|'kerb';
type Face={triangle:T.Triangle;material:SurfaceMaterial;junction:boolean;normal:T.Vector3};
/** One spatial index for both render triangles and physical contact queries. */
export class TrackSurface{
 private hit={height:0,normal:new T.Vector3(),material:'asphalt' as SurfaceMaterial};
 private cells=new Map<string,Face[]>();
 addFace(a:T.Vector3,b:T.Vector3,c:T.Vector3,material:SurfaceMaterial='asphalt',junction=false){
   const triangle=new T.Triangle(a,b,c),face={triangle,material,junction,normal:triangle.getNormal(new T.Vector3())};
   if(face.normal.y<0)face.normal.negate();
   const bounds=new T.Box3().setFromPoints([a,b,c]);
   for(let x=Math.floor(bounds.min.x/8);x<=Math.floor(bounds.max.x/8);x++)for(let z=Math.floor(bounds.min.z/8);z<=Math.floor(bounds.max.z/8);z++){
     const key=x+','+z,cell=this.cells.get(key);if(cell)cell.push(face);else this.cells.set(key,[face]);
   }
 }
 /** Returned hit is borrowed until the next query; copy it if retained. */
 query(point:T.Vector3,includeKerbs=true){
   const faces=this.cells.get(Math.floor(point.x/8)+','+Math.floor(point.z/8));if(!faces)return;
   let found=false;const best=this.hit;
   for(const {triangle:{a,b,c},normal,material} of faces){
     if(!includeKerbs&&material==='kerb')continue;
     const x=point.x-a.x,z=point.z-a.z,bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z,det=bx*cz-bz*cx;
     if(Math.abs(det)<1e-8)continue;const u=(x*cz-z*cx)/det,v=(bx*z-bz*x)/det;
     if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001){const height=a.y+u*(b.y-a.y)+v*(c.y-a.y);if(!found||Math.abs(height-point.y)<Math.abs(best.height-point.y)){found=true;best.height=height;best.normal.copy(normal);best.material=material;}}
   }
   return found?best:undefined;
 }
 heightAt(point:T.Vector3,includeKerbs=true){return this.query(point,includeKerbs)?.height;}
 junctionFaces(bounds:T.Box3){
   const result=new Set<T.Triangle>();
   for(let x=Math.floor(bounds.min.x/8);x<=Math.floor(bounds.max.x/8);x++)for(let z=Math.floor(bounds.min.z/8);z<=Math.floor(bounds.max.z/8);z++)for(const face of this.cells.get(x+','+z)??[])if(face.junction)result.add(face.triangle);
   return result;
 }
 onJunction(p:T.Vector3){
   const cell=this.cells.get(Math.floor(p.x/8)+','+Math.floor(p.z/8));
   return cell?.some(({triangle:{a,b,c},junction})=>{if(!junction)return false;const cross=(u:T.Vector3,v:T.Vector3)=>(v.x-u.x)*(p.z-u.z)-(v.z-u.z)*(p.x-u.x);const sides=[cross(a,b),cross(b,c),cross(c,a)];return sides.every(v=>v>=0)||sides.every(v=>v<=0);})||false;
 }
 clear(){this.cells.clear();}
}
