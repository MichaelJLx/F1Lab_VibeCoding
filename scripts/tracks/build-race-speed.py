"""Build a source-backed speed reference; T1 alignment is estimated, not surveyed."""
from pathlib import Path
import json,datetime,math
root=Path(__file__).resolve().parents[2]
p=root/'data/tracks/spa/telemetry';lap=json.loads((p/'lap.json').read_text());rows=json.loads((p/'car_data.json').read_text());start=datetime.datetime.fromisoformat(lap['date_start'])
samples=[((datetime.datetime.fromisoformat(r['date'])-start).total_seconds(),r['speed']/3.6) for r in rows];samples.sort();samples=[(0,samples[0][1])]+samples+[(lap['lap_duration'],samples[-1][1])];distance=[0.]
for (t0,v0),(t1,v1) in zip(samples,samples[1:]):distance.append(distance[-1]+(v0+v1)/2*(t1-t0))
track=json.loads((root/'src/tracks/spa.json').read_text());length=track['geometryLength'];t1=min((i for i,(t,v) in enumerate(samples) if 1<t<15),key=lambda i:samples[i][1]);shift=track['corners'][0]['s']-distance[t1]*length/distance[-1]
points=sorted([{'s':round((d*length/distance[-1]+shift)%length,4),'speed':round(v,4)} for d,(t,v) in zip(distance,samples)][1:-1],key=lambda x:x['s'])
data={'source':json.loads((p/'source.json').read_text()),'alignment':'Integrated speed distance normalized to track length; first 15s minimum aligned to La Source anchor. Estimated spatial alignment, not exact GPS replay.','distanceScale':length/distance[-1],'offset':shift,'points':points}
(root/'src/tracks/spa-race-speed.json').write_text(json.dumps(data,separators=(',',':')))
print('Saved speed profile:',len(points),'samples; alignment offset',round(shift,2),'m')
