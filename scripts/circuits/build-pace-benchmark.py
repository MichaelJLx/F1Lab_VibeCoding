"""Build a green-flag benchmark from a circuit session directory."""
from pathlib import Path
from datetime import datetime,timedelta
from statistics import mean,median,quantiles
import json,re,argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('session_directory',type=Path)
p=parser.parse_args().session_directory
read=lambda name:json.loads((p/(name+'.json')).read_text())
pit={(r['driver_number'],lap) for r in read('pit') for lap in (r['lap_number'],r['lap_number']+1)}
deleted=set()
flags={};intervals=[]
for row in sorted(read('race_control'),key=lambda r:r['date']):
    match=re.search(r'CAR (\d+).* TIME .* DELETED .* LAP (\d+)',row['message'])
    if match:deleted.add(tuple(map(int,match.groups())))
    key=(row['scope'],row['sector']);t=datetime.fromisoformat(row['date'])
    if row['flag'] in ('YELLOW','DOUBLE YELLOW','RED'): flags.setdefault(key,t)
    if row['flag'] in ('GREEN','CLEAR') and key in flags:intervals.append((flags.pop(key),t))
rows=[]
for r in read('laps'):
    t=r['lap_duration']
    if not t or not r['date_start'] or r['lap_number']==1 or r['is_pit_out_lap'] or (r['driver_number'],r['lap_number']) in (pit|deleted):continue
    if not all(r[f'duration_sector_{i}'] for i in (1,2,3)):continue
    start=datetime.fromisoformat(r['date_start']);end=start+timedelta(seconds=t)
    if any(start<b and end>a for a,b in intervals) or any(end>a for a in flags.values()):continue
    rows.append(r)
times=[r['lap_duration'] for r in rows];sectors=[mean(r[f'duration_sector_{i}'] for r in rows) for i in (1,2,3)]
representative=min(rows,key=lambda r:sum((r[f'duration_sector_{i+1}']-s)**2 for i,s in enumerate(sectors)))
result=dict(session=representative['session_key'],laps=len(rows),drivers=len({r['driver_number'] for r in rows}),mean=mean(times),median=median(times),quartiles=quantiles(times,n=4),sectors=sectors,representative=representative)
(p/'benchmark.json').write_text(json.dumps(result,indent=2));print(result)
