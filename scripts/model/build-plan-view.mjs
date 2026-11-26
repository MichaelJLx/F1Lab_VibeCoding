import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Matrix4,Vector3} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Orthographic silhouette traced directly from the same prepared GLB as the 3D car.
// Raster union retains concave sidepods, wing tips, suspension arms and floor edges.
const file='public/models/rb22.glb',bytes=await readFile(file);
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const scale=150,width=330,height=870,originX=165,originY=435;
function simplify(points,tolerance=.65){
 if(points.length<=2)return points;
 const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
 let best=tolerance*tolerance,index=0;
 for(let i=1;i<points.length-1;i++){
  const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  const d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
  if(d>best){best=d;index=i;}
 }
 return index?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b];
}
function contours(mask){
 const links=new Map();
 const key=(x,y)=>y*(width+1)+x;
 const add=(x,y,a,b)=>{const k=key(x,y);if(!links.has(k))links.set(k,[]);links.get(k).push(key(a,b));};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){
  if(!y||!mask[(y-1)*width+x])add(x,y,x+1,y);
  if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1);
  if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1);
  if(!x||!mask[y*width+x-1])add(x,y+1,x,y);
 }
 const paths=[];
 while(links.size){
  const start=links.keys().next().value,points=[];let at=start;
  do{points.push([at%(width+1),Math.floor(at/(width+1))]);const next=links.get(at);if(!next)break;const target=next.pop();if(!next.length)links.delete(at);at=target;}while(at!==start);
  const area=Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-p[1]*q[0];},0))/2;
  if(area<12)continue;
  points.push(points[0]);const path=simplify(points);
  paths.push(path.map(([x,y],i)=>`${i?'L':'M'}${((x-originX)/scale*100).toFixed(2)},${((y-originY)/scale*100).toFixed(2)}`).join('')+'Z');
 }
 return paths.join('');
}
const components=[],wheels={};
for(const node of doc.getRoot().listNodes()){
 if(!node.getMesh())continue;
 const mask=new Uint8Array(width*height),matrix=new Matrix4().fromArray(node.getWorldMatrix());
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const primitive of node.getMesh().listPrimitives()){
  if(primitive.getMaterial()?.getAlphaMode()==='BLEND')continue;
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
  const projected=Array.from({length:positions.getCount()},(_,i)=>{
   const p=new Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix),x=-p.x,y=-p.z;
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   return [originX+x*scale,originY+y*scale];
  });
  for(let i=0;i<indices.length;i+=3){
   const [a,b,c]=[projected[indices[i]],projected[indices[i+1]],projected[indices[i+2]]];
   const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],det=bx*cy-by*cx;
   if(Math.abs(det)<.001)continue;
   for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<Math.min(height,Math.ceil(Math.max(a[1],b[1],c[1])));y++)
    for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<Math.min(width,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
     const dx=x+.5-a[0],dy=y+.5-a[1],u=(dx*cy-dy*cx)/det,v=(bx*dy-by*dx)/det;
     if(u>=0&&v>=0&&u+v<=1)mask[y*width+x]=1;
    }
  }
 }
 const name=node.getName(),d=contours(mask);
 components.push({name,d});
 if(/^(FL|FR|RL|RR)$/.test(name))wheels[name]={x:(minX+maxX)*50,y:(minY+maxY)*50,width:(maxX-minX)*100,height:(maxY-minY)*100};
}
const output={source:'public/models/rb22.glb',sha256:createHash('sha256').update(bytes).digest('hex'),viewBox:'-110 -290 220 580',units:'centimetres; front at top; driver left at screen left',components,wheels};
await writeFile('src/model/rb22-plan-view.json',JSON.stringify(output));
console.log('RB22 plan view:',components.length,'model silhouettes,',Object.keys(wheels).length,'wheel envelopes');
