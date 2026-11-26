"""Register published circuit annotations onto the existing metric road ribbons."""
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
root=Path(__file__).resolve().parents[2]
raw=root/'data/tracks/annotations'
catalog=json.loads((raw/'catalog.json').read_text())
roads=json.loads((root/'src/tracks/static-circuits.json').read_text())
def ring(x):
 x=np.asarray(x);d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(np.vstack((x,x[:1])),axis=0),axis=1))]
 keep=np.r_[True,np.diff(d)>1e-7];xx=np.vstack((x,x[:1]))[keep];d=d[keep]
 ss=np.linspace(0,d[-1],512,endpoint=False)
 return np.column_stack([np.interp(ss,d,xx[:,i]) for i in [0,1]])
def fit(source,target):
 a=ring(source);b=ring(target);az=a[:,0]+1j*a[:,1];bz=b[:,0]+1j*b[:,1];az-=az.mean();bm=bz.mean();bc=bz-bm
 best=None
 for reverse in [False,True]:
  z=np.conj(az) if reverse else az
  for shift in range(512):
   q=np.roll(bc,shift);scale=np.vdot(z,q)/np.vdot(z,z);err=np.mean(abs(q-z*scale)**2)
   if best is None or err<best[0]:best=(err,scale,reverse)
 err,scale,reverse=best;centre=np.mean(a[:,0]+1j*a[:,1])
 def transform(p):
  z=np.asarray(p);z=z[...,0]+1j*z[...,1]-centre
  if reverse:z=np.conj(z)
  z=z*scale+bm
  return np.stack((z.real,z.imag),axis=-1)
 return transform,float(np.sqrt(err))
overrides=json.loads((raw/'station-overrides.json').read_text())
result={}
for id,road in roads.items():
 file=raw/(id+'.json')
 if not file.exists():continue
 source=json.loads(file.read_text());data=source['data'];xy=np.column_stack((data['x'],data['y']));target=np.array(road['points'])[:,:2]
 transform,error=fit(xy,target);tree=cKDTree(target);length=road['length'];n=len(target)
 def station(p):return float(tree.query(transform(p))[1]*length/n)
 layers={r['layer']:r for r in catalog if r['circuit_key']==str(data['circuitKey']) and r['valid_from_season']==2026}
 corners=layers.get('corners',{}).get('items')
 if corners:turns=[station(c['anchor']) for c in corners]
 else:turns=[station([c['trackPosition']['x'],c['trackPosition']['y']]) for c in data.get('corners',[])]
 splits=[station(np.mean([c['start'],c['end']],axis=0)) for c in layers.get('sectors',{}).get('items',[])]
 start=layers.get('start_finish',{}).get('items',[])
 origin=station(np.mean([start[0]['start'],start[0]['end']],axis=0)) if start else station(xy[0])
 activations=[station(c['anchor']) for c in layers.get('detection_zones',{}).get('items',[]) if c['id'].startswith('sm_') and c['id'].endswith('_n')]
 override=overrides.get(id,{})
 for turn,distance in override.get('addActivations',[]):activations.append((turns[turn-1]+distance)%length)
 if 'activations' in override:activations=[(turns[t-1]+d)%length for t,d in override['activations']]
 if 'splits' in override:splits=[(turns[t-1]+d)%length for t,d in override['splits']]
 result[id]={'turns':[round(s,2) for s in turns],'splits':sorted(round(s,2) for s in splits),'start':round(origin,2),'activations':sorted(round(s,2) for s in activations),'source':source['source'],'mapSource':layers.get('corners',{}).get('source',{}).get('url'),'registrationRms':round(error,2)}
 print(id,'turns',len(turns),'splits',len(splits),'active',len(activations),'rms',round(error,1),'start',round(origin))
(root/'src/tracks/circuit-markings.json').write_text(json.dumps(result,separators=(',',':')))
