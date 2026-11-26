import * as T from 'three';

function distanceSquared(box:T.Box3,p:T.Vector3){
 const x=Math.max(box.min.x-p.x,0,p.x-box.max.x),y=Math.max(box.min.y-p.y,0,p.y-box.max.y),z=Math.max(box.min.z-p.z,0,p.z-box.max.z);
 return x*x+y*y+z*z;
}
type Node={box:T.Box3,left?:Node,right?:Node,triangles?:T.Triangle[]};
function build(triangles:T.Triangle[]):Node{
 const box=new T.Box3();
 for(const t of triangles)box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
 if(triangles.length<=12)return {box,triangles};
 const size=box.getSize(new T.Vector3()),axis=size.x>size.y&&size.x>size.z?'x':size.y>size.z?'y':'z';
 triangles.sort((a,b)=>(a.a[axis]+a.b[axis]+a.c[axis])-(b.a[axis]+b.b[axis]+b.c[axis]));
 const middle=Math.floor(triangles.length/2);
 return {box,left:build(triangles.slice(0,middle)),right:build(triangles.slice(middle))};
}
// Triangle-distance boundaries in each component's own frame follow wing actuation
// and suspension links. The query is restricted to the smoke's clearance radius.
export function flowBoundary(chassis:T.Group){
 const parts:{object:T.Mesh,tree:Node,toLocal:T.Matrix4,toFlow:T.Matrix4,box:T.Box3}[]=[];
 chassis.traverse(object=>{
   if(!(object instanceof T.Mesh))return;
   const material=Array.isArray(object.material)?object.material[0]:object.material;
   if(material.transparent || object.geometry.getAttribute('position').count<12)return;
   const geometry=object.geometry,position=geometry.getAttribute('position'),index=geometry.index;
   const triangles:T.Triangle[]=[];
   for(let i=0;i<(index?.count??position.count);i+=3){
     const points=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k));
     const triangle=new T.Triangle(points[0],points[1],points[2]);
     if(triangle.getArea()>1e-10)triangles.push(triangle);
   }
   if(triangles.length)parts.push({object,tree:build(triangles),toLocal:new T.Matrix4(),toFlow:new T.Matrix4(),box:new T.Box3()});
 });
 const local=new T.Vector3(),closest=new T.Vector3(),point=new T.Vector3(),normal=new T.Vector3();
 const flowInverse=new T.Matrix4(),stack:Node[]=[];
 return {
   sync(root:T.Object3D){
     root.updateWorldMatrix(true,true);flowInverse.copy(root.matrixWorld).invert();
     for(const p of parts){p.toFlow.multiplyMatrices(flowInverse,p.object.matrixWorld);p.toLocal.copy(p.toFlow).invert();p.box.copy(p.tree.box).applyMatrix4(p.toFlow);}
   },
   repel(position:T.Vector3,velocity:T.Vector3){
     for(const p of parts){
       if(distanceSquared(p.box,position)>.0196)continue;
       local.copy(position).applyMatrix4(p.toLocal);
       if(distanceSquared(p.tree.box,local)>.0196)continue;
       let distanceSquaredLimit=.0196,hit:T.Triangle|undefined;
       stack.length=0;stack.push(p.tree);
       while(stack.length){
         const node=stack.pop()!;
         if(distanceSquared(node.box,local)>distanceSquaredLimit)continue;
         if(node.triangles)for(const t of node.triangles){
           t.closestPointToPoint(local,point);
           const d=point.distanceToSquared(local);
           if(d<distanceSquaredLimit){distanceSquaredLimit=d;hit=t;closest.copy(point);}
         }
         else{
           const left=node.left!,right=node.right!,dl=distanceSquared(left.box,local),dr=distanceSquared(right.box,local);
           // Visit the nearest child first so it tightens the triangle search radius.
           if(dl<dr){if(dr<=distanceSquaredLimit)stack.push(right);if(dl<=distanceSquaredLimit)stack.push(left);}
           else{if(dl<=distanceSquaredLimit)stack.push(left);if(dr<=distanceSquaredLimit)stack.push(right);}
         }
       }
       if(!hit)continue;
       const distance=Math.sqrt(distanceSquaredLimit);
       hit.getNormal(normal);
       const signed=(local.x-closest.x)*normal.x+(local.y-closest.y)*normal.y+(local.z-closest.z)*normal.z;
       // Closest-point gradient smooths convex edge/corner transitions.
       if(signed>=0&&distance>1e-6)normal.copy(local).sub(closest).normalize();
       normal.transformDirection(p.toFlow);
       const approach=velocity.dot(normal);
       if(approach<0)velocity.addScaledVector(normal,-approach*(1-T.MathUtils.smoothstep(distance,.012,.075)));
       if(signed<.012)position.addScaledVector(normal,Math.min(.025,.012-signed));
     }
   }
 };
}
