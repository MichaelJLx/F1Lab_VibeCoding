"""Bake RB22 surface distance volumes; keep moving aero elements independent.
Run after build-wing-rig.py. Millimetre distances, 25 mm voxels; no runtime triangles.
"""
import json, struct
from pathlib import Path
import numpy as np
from scipy.ndimage import distance_transform_edt, binary_fill_holes

root=Path(__file__).resolve().parents[2]
with (root/'public/vehicles/rb22/model.glb').open('rb') as f:
    f.seek(12); n,_=struct.unpack('<II',f.read(8)); gltf=json.loads(f.read(n)); f.read(8); data=f.read()
def array(index):
    a=gltf['accessors'][index]; v=gltf['bufferViews'][a['bufferView']]
    dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    width={'VEC3':3,'SCALAR':1}[a['type']]
    return np.ndarray((a['count'],width),dtype,data,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize))
rigdir=root/'vehicles/rb22/rig'
flaps=json.loads((rigdir/'active-wings.json').read_text())
hinges=json.loads((rigdir/'wing-hinges.json').read_text())
links=json.loads((rigdir/'wing-actuators.json').read_text())
volumes=[{'name':'chassis','triangles':[]}]
for name in ('front-wing','rear-wing'):
    for i,h in enumerate(hinges[name]): volumes.append({'name':f'{name}-{i}','triangles':[],**h})
for node in gltf['nodes']:
    name=node.get('name','')
    if 'mesh' not in node or name in ('FL','FR','RL','RR'):continue
    # Prepared model stores all source positions in the car frame.
    assert 'matrix' not in node and not node.get('translation') and not node.get('rotation')
    for j,p in enumerate(gltf['meshes'][node['mesh']]['primitives']):
        if gltf['materials'][p.get('material',0)].get('alphaMode')=='BLEND':continue
        pos=array(p['attributes']['POSITION']); tris=pos[array(p['indices']).reshape(-1,3)]
        owner=np.zeros(len(tris),np.int8)
        if name in flaps:
            base=1 if name=='front-wing' else 3
            for start,end,h in flaps[name][j]:owner[start:end]=base+h
            # Slender actuator rods do not form an aerodynamic wall. Exclude their
            # rest pose instead of leaving ghost obstacles when the flap opens.
            for link in links[name]:
                for piece in link['pieces']:
                    if piece['primitive']==j:
                        for start,end in piece['ranges']:owner[start:end]=-1
        for i,v in enumerate(volumes):v['triangles'].append(tris[owner==i])
spacing=.025; offset=0; manifest={'spacing':spacing,'modelOriginY':.30,'volumes':[]}; chunks=[]
for volume in volumes:
    triangles=np.concatenate(volume.pop('triangles'))
    lo=np.floor((triangles.min((0,1))-.20)/spacing)*spacing
    hi=triangles.max((0,1))+.20; shape=np.ceil((hi-lo)/spacing).astype(int)+1
    occupied=np.zeros(tuple(shape),dtype=bool)
    # Dense barycentric rasterization grouped by triangle edge length.
    edges=np.maximum.reduce([np.linalg.norm(triangles[:,1]-triangles[:,0],axis=1),np.linalg.norm(triangles[:,2]-triangles[:,0],axis=1),np.linalg.norm(triangles[:,2]-triangles[:,1],axis=1)])
    levels=np.maximum(1,np.ceil(edges/(spacing*.6)).astype(int))
    for level in np.unique(levels):
        group=triangles[levels==level]
        u,v=np.meshgrid(np.arange(level+1)/level,np.arange(level+1)/level); keep=u+v<=1
        uv=np.stack((u[keep],v[keep]),axis=1)
        for start in range(0,len(group),max(1,500000//len(uv))):
            tri=group[start:start+max(1,500000//len(uv))]
            points=tri[:,0,None,:]+uv[None,:,0,None]*(tri[:,1,None,:]-tri[:,0,None,:])+uv[None,:,1,None]*(tri[:,2,None,:]-tri[:,0,None,:])
            ids=np.rint((points.reshape(-1,3)-lo)/spacing).astype(int)
            occupied[tuple(ids.T)]=True
    solid=binary_fill_holes(occupied)
    distance=(distance_transform_edt(~solid)-distance_transform_edt(solid))*spacing
    packed=np.rint(np.clip(distance,-32,32)*1000).astype('<i2').ravel()
    manifest['volumes'].append({**volume,'min':lo.tolist(),'size':shape.tolist(),'offset':offset,'length':len(packed)})
    offset+=len(packed);chunks.append(packed.tobytes())
folder=root/'public/vehicles/rb22'
(folder/'airflow-boundary.bin').write_bytes(b''.join(chunks))
(rigdir/'airflow-boundary.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'{len(volumes)} volumes, {offset*2/1024:.0f} KiB')
