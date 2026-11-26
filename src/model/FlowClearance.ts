import * as T from 'three';

// Vertical silhouette of the sprung body, sampled in chassis-local metres.
// Store the underside separately so smoke can still pass through the floor gap.
export function bodyClearance(chassis:T.Group){
 const nx=64,nz=160,data=new Float32Array(nx*nz*4);
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
         }
     }
   });
 }
 const texture=new T.DataTexture(data,nx,nz,T.RGBAFormat,T.FloatType);
 texture.needsUpdate=true;
 return texture;
}
