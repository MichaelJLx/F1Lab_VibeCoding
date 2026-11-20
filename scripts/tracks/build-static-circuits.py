"""Build evenly spaced metric road samples using project-local sources only."""
import json
from pathlib import Path

import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter1d, median_filter

root = Path(__file__).resolve().parents[2]
def read(path):
    return json.loads((root/path).read_text())

# FIA reference width in metres; positive lateral is driver's left.
# Melbourne and Lusail use the 2023 list, other entries the November 2026 list.
width_side = {
    'au-1953':(11,1),'cn-2004':(13,1),'jp-1962':(10,1),'bh-2002':(13,1),
    'sa-2021':(12,-1),'us-2022':(12,1),'ca-1978':(10,1),'mc-1929':(10,-1),
    'es-1991':(11,1),'at-1969':(12,1),'gb-1948':(12,1),'hu-1986':(10,1),
    'nl-1948':(10,1),'it-1922':(10,1),'es-2026':(12,-1),'az-2016':(9,-1),
    'sg-2008':(9,-1),'us-2012':(13,-1),'mx-1962':(14,1),'br-1940':(10,-1),
    'us-2023':(13,-1),'qa-2004':(12,1),'ae-2009':(12,-1)
}
profiles = read('data/tracks/terrain/terrain.json')
out = {}
for f in read('data/tracks/layouts/f1-circuits.geojson')['features']:
    key = f['properties']['id']
    if key not in width_side:
        continue
    coords = np.array(f['geometry']['coordinates'])
    xy = np.radians(coords-coords[0])*6371008.8
    xy[:,0] *= np.cos(np.radians(coords[0,1]))
    keep = np.r_[True, np.linalg.norm(np.diff(xy,axis=0),axis=1)>.01]
    xy = xy[keep]
    h = np.array(profiles[key])[keep]
    arc = np.r_[0,np.cumsum(np.linalg.norm(np.diff(xy,axis=0),axis=1))]
    # Extend across the seam before interpolating the road tangent.
    curve = PchipInterpolator(np.r_[arc[-2]-arc[-1],arc,arc[-1]+arc[1]],
                              np.vstack((xy[-2],xy,xy[1])),axis=0)
    dense = curve(np.linspace(0,arc[-1],int(arc[-1])+1))
    lengths = np.r_[0,np.cumsum(np.linalg.norm(np.diff(dense,axis=0),axis=1))]
    length = lengths[-1]
    stations = np.linspace(0,length,int(np.ceil(length/5)),endpoint=False)
    points = np.column_stack([np.interp(stations,lengths,dense[:,i]) for i in (0,1)])
    chainage = np.interp(stations,lengths,np.linspace(0,arc[-1],len(lengths)))
    height = gaussian_filter1d(median_filter(np.interp(chainage,arc,h),size=9,mode='wrap'),8,mode='wrap')
    # DEM cannot distinguish bridge decks. At Suzuka the later crossing is the overpass.
    if key=='jp-1962':
        from scipy.spatial.distance import cdist
        early = np.flatnonzero((stations>.25*length)&(stations<.55*length))
        late = np.flatnonzero((stations>.65*length)&(stations<.88*length))
        dist=cdist(points[early],points[late])
        a,b=np.unravel_index(dist.argmin(),dist.shape)
        assert dist[a,b]<8
        gap=max(0,6+height[early[a]]-height[late[b]])
        height+=gap*np.exp(-.5*((stations-stations[late[b]])/42)**2)
    # These source rings start away from the modern GP grid. Snap a map-based
    # anchor to Hamilton Straight / Boulevard Albert Ier before drawing the grid.
    anchors={'gb-1948':(-1.0222,52.0693),'mc-1929':(7.4212,43.7350)}
    if key in anchors:
        anchor=np.radians(np.array(anchors[key])-coords[0])*6371008.8
        anchor[0]*=np.cos(np.radians(coords[0,1]))
        shift=np.linalg.norm(points-anchor,axis=1).argmin()
        points=np.roll(points,-shift,axis=0)
        height=np.roll(height,-shift)
    if key=='sg-2008':
        order=(-np.arange(len(points)))%len(points)
        points,height=points[order],height[order]
    width,side=width_side[key]
    out[key]=dict(length=round(length,2),width=width,side=side,
                  points=np.round(np.column_stack((points,height-height[0])),2).tolist())
assert out.keys()==width_side.keys()
(root/'src/tracks/static-circuits.json').write_text(json.dumps(out,separators=(',',':')))
