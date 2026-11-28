"""Bind complete welded aero assemblies and their sockets in source-model metres."""
import json, struct
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

root = Path(__file__).resolve().parents[2]
with (root / 'public/vehicles/rb22/model.glb').open('rb') as f:
    f.seek(12)
    n, _ = struct.unpack('<II', f.read(8)); g = json.loads(f.read(n)); f.read(8); buf = f.read()

def array(i):
    a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
    d = np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    w = {'VEC3':3,'SCALAR':1}[a['type']]
    return np.ndarray((a['count'],w),d,buf,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*d.itemsize),d.itemsize))

def runs(hits):
    return [[int(r[0]),int(r[-1])+1] for r in np.split(hits,np.flatnonzero(np.diff(hits)>1)+1)]

def socket(vertices, upper):
    lo, hi = vertices[:,1].min(), vertices[:,1].max()
    band = vertices[vertices[:,1] > hi-(hi-lo)*.08] if upper else vertices[vertices[:,1] < lo+(hi-lo)*.08]
    return band.mean(0).tolist()

def surface_samples(components):
    samples=[]
    for c in components:
        for a,b,d in c['triangles']:
            n=max(1,int(np.ceil(max(np.linalg.norm(b-a),np.linalg.norm(d-a),np.linalg.norm(d-b))/.008)))
            u,v=np.meshgrid(np.arange(n+1)/n,np.arange(n+1)/n)
            keep=u+v<=1
            samples.append(a+u[keep,None]*(b-a)+v[keep,None]*(d-a))
    return np.concatenate(samples)

rig = {}; actuators = {}; hinge_rig = {}
for node in g['nodes']:
    name = node.get('name', '')
    if name not in ('front-wing', 'rear-wing'): continue
    front = name == 'front-wing'
    primitives = g['meshes'][node['mesh']]['primitives']
    components = []
    for j, primitive in enumerate(primitives):
        pos = array(primitive['attributes']['POSITION']); tri = array(primitive['indices']).reshape(-1,3)
        _, inv = np.unique(pos.round(5),axis=0,return_inverse=True); ids = inv[tri]
        graph = coo_matrix((np.ones(ids.size),(ids.ravel(),np.roll(ids,1,axis=1).ravel())),shape=(inv.max()+1,)*2)
        _, labels = connected_components(graph,directed=False); groups = labels[ids[:,0]]
        for gid in np.unique(groups):
            hits = np.flatnonzero(groups == gid); vertices = pos[np.unique(tri[hits])]
            lo, hi = vertices.min(0), vertices.max(0)
            selected = (lo[1]>.19 and hi[1]<.36 and hi[2]<2.67 and hi[0]-lo[0]>.22) if front else (lo[1]>.835 and hi[2]<-2.14 and hi[0]-lo[0]>.8)
            if front and j==2 and lo[1]>.23 and hi[1]<.34 and hi[2]<2.31 and max(abs(lo[0]),abs(hi[0]))<.64: selected=True
            hinge = (int(lo[0]>0) if front else int(lo[1]>.90)) if selected else -1
            components.append(dict(primitive=j, ranges=runs(hits), vertices=vertices, triangles=pos[tri[hits]], lo=lo, hi=hi, hinge=hinge, link=-1))

    # Only structural carbon surfaces define pivots. Paint, sockets and lettering
    # follow the surfaces but must never bias their hinge or chord estimates.
    structural = [c for c in components if c['primitive']==(1 if front else 2) and c['hinge']>=0]
    hinges = []
    for side in range(2):
        surfaces=[c for c in structural if c['hinge']==side]
        if front:
            # The two rear profiles on each side form one primary flap pack.
            # Locate its forward hinge from the lower/forward profile only.
            primary=min(surfaces,key=lambda c:c['lo'][1])
            verts=primary['vertices']
            lo,hi=verts.min(0),verts.max(0);span=hi[0]-lo[0]
            ends=[]
            for right in (False,True):
                end=verts[verts[:,0]>hi[0]-.08*span] if right else verts[verts[:,0]<lo[0]+.08*span]
                near=end[end[:,2]>end[:,2].max()-.012];ends.append(near.mean(0))
            axis=ends[1]-ends[0];axis/=np.linalg.norm(axis)
            # Flatten the complete pack's incidence, preserving its slot gap.
            verts=np.concatenate([c['vertices'] for c in surfaces])
        else:
            # C3.11.6: all rear flap profiles share a fixed transverse axis and
            # retain their relative geometry. Pivot in the rear half, near the
            # upper trailing edge: opening raises the leading edge off the mainplane.
            verts=np.concatenate([c['vertices'] for c in structural])
            upper=max(structural,key=lambda c:c['lo'][1])['vertices']
            centre=upper[np.abs(upper[:,0])<.08]
            trailing=centre[centre[:,2]<centre[:,2].min()+.008].mean(0)
            trailing[0]=0
            ends=[trailing];axis=np.array([1.,0.,0.])
        lo,hi=verts.min(0),verts.max(0);span=hi[0]-lo[0]
        angles=[]
        for fraction in (.25,.4,.5,.6,.75):
            section=verts[np.abs(verts[:,0]-(lo[0]+span*fraction))<span*.065]
            if len(section)<4:continue
            depth=np.ptp(section[:,2]);leading=section[section[:,2]>section[:,2].max()-depth*.14].mean(0);trailing=section[section[:,2]<section[:,2].min()+depth*.14].mean(0)
            chord=leading-trailing;chord-=axis*np.dot(chord,axis)
            angles.append(np.arctan(-chord[1]/np.cross(axis,chord)[1]))
        if not angles:raise ValueError(f'Cannot locate chord: {name}/{side}')
        hinges.append(dict(pivot=ends[0].tolist(),axis=axis.tolist(),openAngle=float(np.clip(np.median(angles)*.94,-.8,.8))))
    if front:
        # Mirror exactly; mesh tessellation must not create left/right timing differences.
        left=hinges[0]
        hinges[1]=dict(pivot=[-left['pivot'][0],*left['pivot'][1:]],axis=[left['axis'][0],-left['axis'][1],-left['axis'][2]],openAngle=left['openAngle'])
    hinge_rig[name]=hinges

    links=[]
    if front:
        # Each adjuster comprises several disconnected material/weld islands.
        # Group all shaft, collar, socket and paint pieces around the same axis.
        for side in (-1,1):
            for x in (.0824,.227,.4504,.5335):
                selected=[]
                for c in components:
                    lo,hi=c['lo'],c['hi']; centre=(lo[0]+hi[0])*.5
                    if c['primitive']==0 and abs(centre-side*x)<.012 and hi[0]-lo[0]<.03 and lo[1]>.21 and hi[1]<.35:
                        selected.append(c)
                if not selected: raise ValueError(f'Missing front adjuster {side*x}')
                vertices=np.concatenate([c['vertices'] for c in selected])
                upper,lower=socket(vertices,True),socket(vertices,False)
                anchor,attachment=(upper,lower) if x<.15 else (lower,upper)
                links.append(dict(anchor=anchor,attachment=attachment,anchorHinge=-1 if x<.15 else int(side>0),hinge=int(side>0)))
                for c in selected:c['link']=len(links)-1;c['hinge']=-1
    else:
        for first,anchor_hinge,moving_hinge,anchor_upper in [(5936,0,0,False),(6638,-1,0,True)]:
            c=next(c for c in components if c['primitive']==1 and c['ranges'][0][0]==first)
            vertices=c['vertices'];upper,lower=socket(vertices,True),socket(vertices,False)
            links.append(dict(anchor=upper if anchor_upper else lower,attachment=lower if anchor_upper else upper,anchorHinge=anchor_hinge,hinge=moving_hinge))
            c['link']=len(links)-1;c['hinge']=-1

    # Complete material layers of a rod follow that rod, not the nearest wing.
    rod_trees=[cKDTree(surface_samples([c for c in components if c['link']==i])) for i in range(len(links))]
    for c in components:
        if c['hinge']>=0 or c['link']>=0:continue
        if np.max(c['hi']-c['lo'])>.10:continue
        distances=[np.median(t.query(c['vertices'])[0]) for t in rod_trees]
        coating = front and c['primitive']==2 and np.max(c['hi']-c['lo'])<.05
        if min(distances)<(.009 if coating else .004):
            c['link']=int(np.argmin(distances))

    # Small flap-end brackets, surface fasteners and paint patches use the same
    # rigid transform as their supporting surface. Large pylons/endplates stay fixed.
    moving_trees=[cKDTree(surface_samples([c for c in structural if c['hinge']==i])) for i in range(2)]
    fixed_structure=[c for c in components if c['primitive']==(1 if front else 2) and c['hinge']<0 and c['link']<0 and (c['hi'][0]-c['lo'][0]>.5 or c['hi'][1]-c['lo'][1]>.15)]
    fixed_tree=cKDTree(surface_samples(fixed_structure))
    for c in components:
        if c['hinge']>=0 or c['link']>=0:continue
        if np.max(c['hi']-c['lo'])>.16:continue
        distances=[np.median(t.query(c['vertices'])[0]) for t in moving_trees]
        fixed=np.median(fixed_tree.query(c['vertices'])[0])
        if min(distances)<.018 and min(distances)<fixed+.002:
            c['hinge']=int(np.argmin(distances))

    rig[name]=[[] for _ in primitives]
    for c in components:
        if c['hinge']>=0:
            rig[name][c['primitive']].extend([a,b,c['hinge']] for a,b in c['ranges'])
    for i,link in enumerate(links):
        link['pieces']=[dict(primitive=c['primitive'],ranges=c['ranges']) for c in components if c['link']==i]
    actuators[name]=links

(root/'vehicles/rb22/rig/active-wings.json').write_text(json.dumps(rig,separators=(',',':'))+'\n')
(root/'vehicles/rb22/rig/wing-actuators.json').write_text(json.dumps(actuators,indent=2)+'\n')
(root/'vehicles/rb22/rig/wing-hinges.json').write_text(json.dumps(hinge_rig,indent=2)+'\n')
