import * as T from 'three';

// Centres measured from the five existing RB22 rotary meshes, in source coordinates.
const controls=[
  {x:.0261,y:.5892,color:'#e2e7eb'},
  {x:-.0254,y:.5886,color:'#e85a52'},
  {x:.0399,y:.5521,color:'#75a9df'},
  {x:.0003,y:.5579,color:'#e5c763'},
  {x:-.0392,y:.5516,color:'#b5a1df'},
];

/** Replace low-resolution baked rotary artwork, without changing the control geometry. */
export function styleSteeringControls(hub:T.Group,parts:T.Object3D[]){
  const shell=parts.find((p):p is T.Mesh=>p instanceof T.Mesh && !Array.isArray(p.material) && p.material.name.startsWith('redbull_steeringwheel'));
  if(shell && !Array.isArray(shell.material)){
    const geometry=shell.geometry.clone(),position=geometry.getAttribute('position'),indices=geometry.index;
    if(indices){
      const original:number[]=[],rotary:number[]=[];
      for(let i=0;i<indices.count;i+=3){
        const ids=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
        const knob=controls.some(c=>ids.every(j=>position.getZ(j)<.6615 && position.getZ(j)>.647 &&
          Math.hypot(position.getX(j)-c.x,position.getY(j)-c.y)<.0156));
        (knob?rotary:original).push(...ids);
      }
      geometry.setIndex([...original,...rotary]);geometry.clearGroups();
      geometry.addGroup(0,original.length,0);geometry.addGroup(original.length,rotary.length,1);
      shell.geometry=geometry;
      shell.material=[shell.material,new T.MeshStandardMaterial({name:'rotary-matte',color:'#202329',roughness:.88,metalness:0})];
    }
  }
  const decals=parts.find((p):p is T.Mesh=>p instanceof T.Mesh && !Array.isArray(p.material) && p.material.name.startsWith('sw_decals'));
  if(decals && decals.material instanceof T.MeshStandardMaterial){
    const material=decals.material.clone();
    material.customProgramCacheKey=()=>'steering-labels-without-legacy-charts';
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        vec2 atlas=fract(vMapUv);
        bool tyreChart=atlas.x>.22 && atlas.x<.50 && atlas.y>.46 && atlas.y<.75;
        bool modeChart=atlas.x>.60 && atlas.x<.84 && atlas.y>.69 && atlas.y<.995;
        if(tyreChart || modeChart) discard;
      `);
    };
    decals.material=material;
  }
  // Each rotary has its own restrained scale. Canvas is generated only at load time.
  for(const control of controls){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.translate(128,128);
    ctx.fillStyle='#181b20';ctx.beginPath();ctx.arc(0,0,125,0,Math.PI*2);ctx.fill();
    for(let i=0;i<12;i++){
      ctx.save();ctx.rotate(i*Math.PI/6);
      ctx.strokeStyle=i===0?control.color:'#9a9fa6';ctx.lineWidth=i===0?6:2;
      ctx.beginPath();ctx.moveTo(0,-117);ctx.lineTo(0,i===0?-96:-105);ctx.stroke();ctx.restore();
    }
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const scale=new T.Mesh(new T.PlaneGeometry(.038,.038),new T.MeshBasicMaterial({
      name:'rotary-scale',map:texture,transparent:true,depthWrite:false,toneMapped:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    }));
    scale.name='rotary-scale';scale.rotation.y=Math.PI;
    scale.position.set(control.x,control.y,.660).sub(hub.position);hub.add(scale);
  }
}
