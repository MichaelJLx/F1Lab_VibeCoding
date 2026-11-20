import * as T from 'three';

// Local centreline stations in metres, estimated from the FIA corner map.
export const turnStations=[238,903,1010,1127,2274,2365,2505,2892,3142,3632,3733,4331,4548,4790,5073,5780,5982,6588,6637];
// Interpolated on the registered OpenF1 PER lap 44 position stream at 30.808 and 76.117 s.
export const splitStations=[2132.481,4935.569];

export function cornerPlate(number:number){
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=68;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#282824';ctx.fillRect(0,0,128,68);
  ctx.fillStyle='#ee923c';ctx.fillRect(0,0,5,68);
  ctx.fillStyle='#faf8ef';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 42px system-ui';ctx.fillText('T'+number,66,34);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const plate=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false}));
  plate.scale.set(1.35,.72,1);return plate;
}
