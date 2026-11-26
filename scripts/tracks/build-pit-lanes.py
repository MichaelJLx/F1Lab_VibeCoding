"""Register surveyed OSM pit lanes in the circuit's metric coordinates."""
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
root=Path(__file__).resolve().parents[2];folder=root/'data/tracks/pit-lanes'
roads=json.loads((root/'src/tracks/static-circuits.json').read_text());marks=json.loads((root/'src/tracks/circuit-markings.json').read_text());features={f['properties']['id']:f for f in json.loads((root/'data/tracks/layouts/f1-circuits.geojson').read_text())['features']}
selected={'au-1953':[28119448],'bh-2002':[187123422],'cn-2004':[107371147,107371138],'es-1991':[33742214,178416729,178416733],'mc-1929':[850261588,166399479,1453878835,1388331347],'ca-1978':[413000959],'at-1969':[289111668],'gb-1948':[227902927],'hu-1986':[231417580],'it-1922':[38168747],'sg-2008':[100484287],'jp-1962':[120917578],'us-2012':[514836373],'mx-1962':[638504647,772763791],'br-1940':[33779109],'ae-2009':[176695254,176695255,176695253],'nl-1948':[38144527],'sa-2021':[1121870473,1257884703,1257884704],'us-2022':[1017340352],'qa-2004':[1037707300,196193732],'es-2026':[1552567031],'az-2016':[1513267145],'us-2023':[1223479152]}
out={}
for key,ids in selected.items():
 ways={w['id']:w for w in json.loads((folder/(key+'-map.json')).read_text())['elements']};origin=np.array(features[key]['geometry']['coordinates'][0]);scale=np.array([np.cos(np.radians(origin[1])),1])*6371008.8*np.pi/180
 parts=[]
 for id in ids:
  w=ways[id]
  if key=='mc-1929' and id==166399479:
   first=w['nodes'].index(9911623941);w={**w,'geometry':w['geometry'][first:]}
  p=(np.array([[v['lon'],v['lat']] for v in w['geometry']])-origin)*scale
  parts.append(np.column_stack((p,np.full(len(p),-1 if w['tags'].get('tunnel')=='yes' else 0))))
 # Join pieces by their actual shared endpoints, including ways mapped backwards.
 p=parts.pop(0)
 while parts:
  choices=[(np.linalg.norm(p[a,:2]-q[b,:2]),j,a,b) for j,q in enumerate(parts) for a in [0,-1] for b in [0,-1]]
  gap,j,a,b=min(choices);assert gap<5,(key,'disconnected',gap);q=parts.pop(j)
  if a==-1:p=np.vstack((p,q[1:] if b==0 else q[-2::-1]))
  else:p=np.vstack((q[:-1] if b==-1 else q[:0:-1],p))
 road=roads[key];xy=np.array(road['points'])[:,:2];L=road['length'];n=len(xy);tree=cKDTree(xy);shift=round(marks.get(key,{}).get('start',0)/L*n)%n
 def station(q):return ((tree.query(q)[1]-shift)*L/n+L/2)%L-L/2
 start,end=station(p[0,:2]),station(p[-1,:2])
 if start>end:p=p[::-1].copy();start,end=end,start
 # Preserve the surveyed lane and close the short gaps to the current main road.
 stations=((np.arange(n)-shift)*L/n+L/2)%L-L/2
 def main(s):
  i=round((s/L*n+shift))%n;return xy[i]
 start-=35;end+=40
 p=np.vstack((np.r_[main(start),0],p,np.r_[main(end),0]))
 arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p[:,:2],axis=0),axis=1))]
 garage=int(np.argmin(np.linalg.norm(p[:,:2]-xy[shift],axis=1)));garage=max(1,min(len(p)-2,garage));zero=arc[garage]
 ss=np.where(arc<=zero,start+(0-start)*arc/zero,end*(arc-zero)/(arc[-1]-zero))
 points=np.round(np.column_stack((ss,p)),3).tolist()
 out[key]={'entry':round(start),'exit':round(end),'limitEntry':round(start+65),'limitExit':round(end-55),'speedLimit':60 if key in ['mc-1929','nl-1948'] else 80,'halfWidth':2.4 if key in ['mc-1929','sa-2021'] else 3.2,'points':points,'ways':ids}
 print(key,'stations',round(start),round(end),'length',round(arc[-1]),'garage',garage)
(root/'src/tracks/circuit-pits.json').write_text(json.dumps(out,separators=(',',':')))
