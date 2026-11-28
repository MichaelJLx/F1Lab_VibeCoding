import * as T from 'three';

// Vertical silhouette of the sprung body, sampled in chassis-local metres.
// Store the underside separately so smoke can still pass through the floor gap.
export function bodyClearance(chassis:T.Group){
 const nx=64,nz=160,data=new Float32Array(nx*nz*4),edges=Array.from({length:nz},()=>[Infinity,-Infinity]);
 for(let i=0;i<data.length;i+=4){data[i]=2;data[i+1]=-2;}
 chassis.updateWorldMatrix(true,true);
 const inverse=chassis.matrixWorld.clone().invert();
 const matrix=new T.Matrix4(),vertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
 for(const name of ['floor','body','cockpit']){
   chassis.getObjectByName(name)?.traverse(mesh=>{
     if(!(mesh instanceof T.Mesh))return;
     const geometry=mesh.geometry,positions=geometry.getAttribute('position'),indices=geometry.index;
     if(!positions)return;
     matrix.multiplyMatrices(inverse,mesh.matrixWorld);
     const count=indices?.count??positions.count;
     for(let i=0;i<count;i+=3){
       vertices.forEach((p,k)=>{
         p.fromBufferAttribute(positions,indices?indices.getX(i+k):i+k).applyMatrix4(matrix);
         p.x=(p.x+1.2)*nx/2.4;p.z=(p.z+3)*nz/6;
       });
       const [a,b,c]=vertices;
       const bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z,det=bx*cz-bz*cx;
       if(Math.abs(det)<1e-8)continue;
       for(let z=Math.max(0,Math.floor(Math.min(a.z,b.z,c.z)));z<Math.min(nz,Math.ceil(Math.max(a.z,b.z,c.z)));z++)
         for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)));x<Math.min(nx,Math.ceil(Math.max(a.x,b.x,c.x)));x++){
           const dx=x+.5-a.x,dz=z+.5-a.z,u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
           if(u<0 || v<0 || u+v>1)continue;
           const j=4*(z*nx+x),y=a.y+u*(b.y-a.y)+v*(c.y-a.y);
           data[j]=Math.min(data[j],y);data[j+1]=Math.max(data[j+1],y);
           if(name==='floor'||y<-.12){edges[z][0]=Math.min(edges[z][0],(x+.5)*2.4/nx-1.2);edges[z][1]=Math.max(edges[z][1],(x+.5)*2.4/nx-1.2);}
         }
     }
   });
 }
 // The GLB splits the floor into several material/part islands. A row containing
 // only the central plank is NOT a tunnel narrowed to the plank's width. Bridge
 // those gaps using adjacent full-width floor sections, before querying edges.
 const valid=edges.map((e,i)=>e[1]-e[0]>.6&&e[1]-e[0]<2?i:-1).filter(i=>i>=0);
 for(let z=0;z<nz;z++){
   if(valid.length&&!valid.includes(z)){
     const right=valid.find(i=>i>z)??valid[valid.length-1];
     const left=valid.filter(i=>i<z).at(-1)??valid[0];
     const t=left===right?0:(z-left)/(right-left);
     edges[z]=[T.MathUtils.lerp(edges[left][0],edges[right][0],t),T.MathUtils.lerp(edges[left][1],edges[right][1],t)];
   }
   for(let x=0;x<nx;x++){const i=4*(z*nx+x);data[i+2]=Number.isFinite(edges[z][0])?edges[z][0]:-1.2;data[i+3]=Number.isFinite(edges[z][1])?edges[z][1]:1.2;}
 }
 const texture=new T.DataTexture(data,nx,nz,T.RGBAFormat,T.FloatType);
 texture.needsUpdate=true;
 return texture;
}
