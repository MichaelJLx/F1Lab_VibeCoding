import * as T from 'three';

// Local centreline stations in metres, estimated from the FIA corner map.
export const turnStations=[238,903,1010,1127,2274,2365,2505,2892,3142,3632,3733,4331,4548,4790,5073,5780,5982,6588,6637];
// Interpolated on the registered OpenF1 PER lap 44 position stream at 30.808 and 76.117 s.
export const splitStations=[2132.481,4935.569];

export function cornerPlate(number:number){
  const canvas=document.createElement('canvas');
  canvas.width=192;canvas.height=96;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#282724';ctx.fillRect(0,0,192,96);
  ctx.fillStyle='#ff9000';ctx.fillRect(0,0,9,96);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 32px system-ui';ctx.fillText('T',40,49);
  ctx.fillStyle='#fffaf0';ctx.font='bold 70px system-ui';
  ctx.fillText(String(number).padStart(2,'0'),119,50);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const group=new T.Group(),plate=new T.Mesh(new T.BoxGeometry(1.8,.9,.065),new T.MeshBasicMaterial({color:0x282724}));
  const face=new T.Mesh(new T.PlaneGeometry(1.8,.9),new T.MeshBasicMaterial({map}));
  face.name="Corner number";face.position.z=.034;plate.add(face);plate.position.y=.98;
  const post=new T.Mesh(new T.BoxGeometry(.09,.56,.09),new T.MeshStandardMaterial({color:0x67645d}));
  post.position.y=.28;group.add(plate,post);return group;
}
