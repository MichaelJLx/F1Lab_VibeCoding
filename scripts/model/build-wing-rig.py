"""Identify continuous aero surfaces by welded mesh topology."""
import json,struct
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
root=Path(__file__).resolve().parents[2]
f=(root/'public/models/rb22.glb').open('rb');f.seek(12)
n,_=struct.unpack('<II',f.read(8));g=json.loads(f.read(n));f.read(8);buf=f.read()
def array(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];d=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'VEC3':3,'SCALAR':1}[a['type']]
 return np.ndarray((a['count'],w),d,buf,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*d.itemsize),d.itemsize))
rig={}
for node in g['nodes']:
 if 'wing' not in node['name']:continue
 parts=rig[node['name']]=[]
 for j,p in enumerate(g['meshes'][node['mesh']]['primitives']):
  pos=array(p['attributes']['POSITION']);tri=array(p['indices']).reshape(-1,3) if 'indices' in p else np.arange(len(pos)).reshape(-1,3)
  _,inv=np.unique(pos.round(5),axis=0,return_inverse=True);ids=inv[tri]
  mat=coo_matrix((np.ones(ids.size),(ids.ravel(),np.roll(ids,1,axis=1).ravel())),shape=(inv.max()+1,)*2)
  _,labels=connected_components(mat,directed=False);groups=labels[ids[:,0]]
  ranges=[];parts.append(ranges)
  for gid in np.unique(groups):
   verts=pos[np.unique(tri[groups==gid])];lo=verts.min(0);hi=verts.max(0)
   front=node['name']=='front-wing'
   selected=(lo[1]>.221 and hi[1]<.36 and hi[2]<2.55 and hi[0]-lo[0]>.22) if front else (lo[1]>.835 and hi[2]<-2.14 and hi[0]-lo[0]>.8)
   if selected:
    hits=np.flatnonzero(groups==gid)
    for run in np.split(hits,np.flatnonzero(np.diff(hits)>1)+1):
     ranges.append([int(run[0]),int(run[-1])+1,1 if front and lo[0]>0 else 0])
(root/'src/model/flap-ranges.json').write_text(json.dumps(rig,separators=(',',':')))
