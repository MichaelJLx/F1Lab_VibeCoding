"""Align OpenF1's lap to the Spa map; extract a smoothed, bounded lateral reference."""
from pathlib import Path
import json,numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter1d
root=Path(__file__).resolve().parents[2]
read=lambda path:json.loads((root/path).read_text())
rows=read('data/tracks/spa/flying/location.json')
track=read('src/tracks/spa.json');nodes=track['nodes']
def xy(rows):return np.array([[r['x'],r['y']] for r in rows])
ref=xy(nodes);src=xy(rows)*.1
arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(src,axis=0),axis=1))]
L=track['geometryLength'];stations=np.arange(len(ref))*L/len(ref)
def fit(x,y):
 a=x-x.mean(0);b=y-y.mean(0);u,s,v=np.linalg.svd(a.T@b)
 return (u@v)*(s.sum()/(a*a).sum()),y.mean(0)
def transform(x,y):
 m,c=fit(x,y);return (x-x.mean(0))@m+c
aligned=np.column_stack([np.interp(stations/L*arc[-1],arc,src[:,i]) for i in (0,1)])
def error(shift):
 target=np.roll(ref,shift,0);return np.mean((transform(aligned,target)-target)**2)
shift=min(range(len(ref)),key=error);target=np.roll(ref,shift,0)
m,c=fit(aligned,target);pts=(src-aligned.mean(0))@m+c
# Refine translation/rotation by point-to-polyline projection; preserve lap direction.
tree=cKDTree(ref)
for _ in range(12):
 _,idx=tree.query(pts)
 tangent=ref[(idx+1)%len(ref)]-ref[(idx-1)%len(ref)]
 tangent/=np.linalg.norm(tangent,axis=1)[:,None]
 foot=ref[idx]+tangent*np.sum((pts-ref[idx])*tangent,axis=1)[:,None]
 pts=transform(pts,foot)
_,idx=tree.query(pts)
v=ref[(idx+1)%len(ref)]-ref[(idx-1)%len(ref)]
v/=np.linalg.norm(v,axis=1)[:,None]
delta=pts-ref[idx];s=stations[idx]+(delta*v).sum(1)
offset=delta[:,1]*v[:,0]-delta[:,0]*v[:,1]
# Retain a short, registered height profile rather than using GPS height as a datum.
# build-spa pins this profile to the circuit map heights at the ends of each interval.
profile_s=np.arange(670,1501,10)
filtered_z=gaussian_filter1d(np.interp(stations,s,[r['z']*.1 for r in rows],period=L),30/(L/len(nodes)),mode='wrap')
profile=dict(source='OpenF1 9574 / PER / lap 44; registered location.z in metres, 30 m Gaussian smoothing',
             heights=[[int(m),round(float(np.interp(m*L/7004,stations,filtered_z)),3)] for m in profile_s])
(root/'data/tracks/spa/raidillon-profile.json').write_text(json.dumps(profile,indent=2)+'\n')
bound=np.array([min(n['widthLeft'],n['widthRight'])-1.5 for n in nodes])
raw=np.interp(stations,s,offset,period=L)
smooth=gaussian_filter1d(raw,16/(L/len(nodes)),mode='wrap')
# Smooth saturation preserves entry-to-exit transitions even for uncertain registrations.
line=bound*np.tanh(smooth/bound)
out=dict(source='OpenF1 9574 / PER / lap 44',samples=len(rows),medianAbsoluteOffset=float(np.median(abs(offset))),offsets=np.round(line,4).tolist())
(root/'src/tracks/spa-race-path.json').write_text(json.dumps(out,separators=(',',':')))
# Synchronize the car stream with the aligned location stream by timestamp.
from datetime import datetime
timestamp=lambda row:datetime.fromisoformat(row['date']).timestamp()
times=[timestamp(row) for row in rows]
unwrapped=np.unwrap(s*2*np.pi/L)*L/(2*np.pi)
car=read('data/tracks/spa/flying/car_data.json')
points=sorted([dict(s=round(float(np.interp(timestamp(row),times,unwrapped)%L),4),speed=round(row['speed']/3.6,4)) for row in car],key=lambda row:row['s'])
(root/'src/tracks/spa-flying-speed.json').write_text(json.dumps(dict(points=points,source=out['source']),separators=(',',':')))
print(len(rows),'samples; cross-track absolute percentiles',np.percentile(abs(offset),[50,90,99]))
for station in [165,240,305,2210,2280,2365,3535,3634,3742]:print(station,round(np.interp(station,stations,line),1))
