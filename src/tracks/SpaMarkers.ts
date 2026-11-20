import * as T from 'three';

// Local centreline stations in metres, estimated from the FIA corner map.
export const turnStations=[238,903,1010,1127,2274,2365,2505,2892,3142,3632,3733,4331,4548,4790,5073,5780,5982,6588,6637];
// Interpolated on the registered OpenF1 PER lap 44 position stream at 30.808 and 76.117 s.
export const splitStations=[2132.481,4935.569];

export function cornerPlate(number:number){
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=68;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#5a5853';ctx.fillRect(0,0,128,68);
  ctx.fillStyle='#bc854b';ctx.fillRect(0,59,128,3);
  ctx.fillStyle='#eee9de';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='500 42px system-ui';ctx.fillText(String(number).padStart(2,'0'),64,32);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  return new T.Mesh(new T.PlaneGeometry(1.12,.60),new T.MeshBasicMaterial({map,side:T.DoubleSide}));
}
