"""Archive public circuit evidence only; never changes circuit.json or runtime geometry.
Run from any directory. Years are selected per source in 2026 -> 2023 order.
"""
import argparse, hashlib, html, json, re, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock
from urllib.parse import urlencode, urljoin
ROOT=Path(__file__).resolve().parents[2]
YEARS=[2026,2025,2024,2023]
TODAY=datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).date().isoformat()
CUTOFF=datetime.fromisoformat(TODAY).replace(tzinfo=timezone.utc)
# External service identifiers are archive metadata, not simulator configuration.
EVENTS={
'melbourne':('Australian','australia',10),'shanghai':('Chinese','china',49),'suzuka':('Japanese','japan',46),
'bahrain':('Bahrain','bahrain',63),'jeddah':('Saudi Arabian','saudi-arabia',149),'miami':('Miami','miami',151),
'montreal':('Canadian','canada',23),'monaco':('Monaco','monaco',22),'barcelona':('Barcelona-Catalunya','barcelona-catalunya',15),
'spielberg':('Austrian','austria',19),'silverstone':('British','great-britain',2),'spa':('Belgian','belgium',7),
'budapest':('Hungarian','hungary',4),'zandvoort':('Dutch','netherlands',55),'monza':('Italian','italy',39),
'madrid':('Spanish','spain',153),'baku':('Azerbaijan','azerbaijan',144),'singapore':('Singapore','singapore',61),
'austin':('United States','united-states',9),'mexico-city':('Mexico City','mexico',65),'sao-paulo':('São Paulo','brazil',14),
'las-vegas':('Las Vegas','las-vegas',152),'lusail':('Qatar','qatar',150),'yas-marina':('Abu Dhabi','united-arab-emirates',70)}
LOCK=Lock();last_api=0

def get(url):
 global last_api
 if 'api.openf1.org' in url:
  with LOCK:
   time.sleep(max(0,1.3-(time.monotonic()-last_api)));last_api=time.monotonic()
 r=subprocess.run(['curl','-fLsS','--retry','1','--max-time','25','-A','Mozilla/5.0',url],capture_output=True)
 if r.returncode:raise ValueError(r.stderr.decode().strip()[-160:])
 return r.stdout

def js(url):return json.loads(get(url))
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def api(endpoint,**params):return 'https://api.openf1.org/v1/'+endpoint+'?'+urlencode(params)
SESSIONS={}

def archive(row):
 name=row['directory'];base=ROOT/'circuits'/name/'sources';event,slug,key=EVENTS[name]
 years=[2025,2024,2023] if name=='bahrain' else YEARS
 records={k:[] for k in ['layout','elevation','annotations','pit-lane','sessions']};checks=[]
 def save(category,filename,data,url,year,**extra):
  p=base/category/filename
  entries=records[category]
  if any(e['file']==filename and e['url']!=url for e in entries):
   filename=p.stem+'-'+hashlib.sha256(url.encode()).hexdigest()[:8]+p.suffix;p=base/category/filename
  if isinstance(data,bytes):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
  else:write(p,data)
  records[category].append(dict(file=filename,year=year,url=url,retrieved=TODAY,sha256=sha(p),**extra))
 def attempt(url):
  try:return get(url)
  except Exception as e:checks.append(dict(url=url,result=str(e)));return None
 # Preserve the geographic source vertices, paired with the existing terrain samples.
 features=json.loads((ROOT/'references/circuits/layouts/f1-circuits.geojson').read_text())['features']
 feature=next((f for f in features if f['properties']['id']==row['id']),None)
 if feature:
  save('layout','centerline.geojson',feature,'https://github.com/bacinger/f1-circuits',None,kind='geographic layout',license='MIT',yearNote='Upstream geometry has no survey epoch; retrieval year is not a survey year.')
 # Official public page: save only the factual specification table, not page prose.
 for year in years:
  page_slug='spain' if name=='barcelona' and year<2026 else slug
  u=f'https://www.formula1.com/en/racing/{year}/{page_slug}/circuit';raw=attempt(u)
  if not raw:continue
  s=raw.decode();stats={html.unescape(re.sub('<[^>]+>','',k)).strip():html.unescape(re.sub('<[^>]+>','',v)).strip() for k,v in re.findall(r'<dt\b[^>]*>(.*?)</dt>\s*<dd\b[^>]*>(.*?)</dd>',s,re.S)}
  if 'Circuit Length' in stats:
   if name=='bahrain' and year==2026 and stats['Circuit Length']!='5.412km':
    checks.append(dict(url=u,result='Rejected: 2026 event page describes Sepang, not Sakhir.'));continue
   save('layout',f'official-facts-{year}.json',{'statistics':stats},u,year,kind='F1 official circuit facts');break
 # Archive complete coordinate annotations; do not overwrite maps used by build-circuits.
 for year in years:
  u=f'https://api.multiviewer.app/api/v1/circuits/{key}/{year}';raw=attempt(u)
  if not raw:continue
  try:d=json.loads(raw)
  except ValueError:continue
  if len(d.get('x',[]))<10:continue
  save('annotations',f'coordinate-map-{year}.json',d,u,year,kind='MultiViewer timing coordinate frame',units='F1 timing coordinate units; not surveyed metres')
  save('annotations','timing-markers.json',{k:v for k,v in d.items() if k not in ['x','y']},u,year,kind='Unmodified timing-line, sector and corner annotations')
  break
 # FIA official documents, actual links extracted from the official decision index.
 for year in years:
  season=f'season-{year}-'+str({2026:2072,2025:2071,2024:2043,2023:2042}[year])
  ev='Spanish' if name=='barcelona' and year<2026 else event
  if name=='bahrain' and year==2026:
   checks.append(dict(url='https://www.fia.com/events/fia-formula-one-world-championship/season-2026/bahrain-grand-prix',result='Rejected: Malaysia event documents do not describe Sakhir.'));continue
  u=f'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/{season}/event/'+urlencode({'x':ev+' Grand Prix'})[2:].replace('+','%20')
  raw=attempt(u)
  if not raw:continue
  links=list(dict.fromkeys(urljoin('https://www.fia.com',html.unescape(x)) for x in re.findall(r'href=[\"\']([^\"\']+)',raw.decode())))
  # Event pages can contain other events: require both year and event filename prefix.
  prefix=f'{year}_'+ev.lower().replace(' ','_').replace('ã','a')+'_grand_prix'
  matches=[x for x in links if '.pdf' in x and prefix in x and any(t in x for t in ['circuit_map','race_directors_competition_notes','race_directors_event_notes','competition_visa'])]
  found=False
  for link in matches:
   pdf=attempt(link)
   if not pdf or not pdf.startswith(b'%PDF'):continue
   category='layout' if 'circuit_map' in link else 'pit-lane'
   filename=f'fia-{year}-'+('circuit-map.pdf' if category=='layout' else 'competition-visa.pdf' if 'visa' in link else 'event-notes.pdf')
   save(category,filename,pdf,link,year,kind='FIA official original');found=True
  if found:break
 # Existing terrain arrays gain explicit geographic anchors and honest dataset provenance.
 terrain=base/'elevation/terrain.json'
 if terrain.exists() and feature:
  elevations=json.loads(terrain.read_text());coords=feature['geometry']['coordinates']
  if len(elevations)==len(coords):
   save('elevation','dem-anchors.json',{'dataset':'Mapzen Terrarium','zoom':12,'anchors':[{'lon':p[0],'lat':p[1],'elevationM':z} for p,z in zip(coords,elevations)]},'https://registry.opendata.aws/terrain-tiles/',None,kind='DEM terrain anchors',yearNote='Composite DEM has no single acquisition year; these are terrain samples, not a road-surface survey.')
 # A completed session with a real, full lap: strictly newest season first.
 for year in years:
  candidates=[s for s in SESSIONS.get(year,[]) if s['circuit_key']==key and not s.get('is_cancelled') and s.get('date_end') and datetime.fromisoformat(s['date_end'])<CUTOFF]
  candidates.sort(key=lambda s:(s['session_name']=='Race',s['date_start']),reverse=True)
  selected=False
  for session in candidates[:2]:
   u=api('laps',session_key=session['session_key']);raw=attempt(u)
   if not raw:continue
   laps=json.loads(raw);valid=[l for l in laps if l.get('date_start') and l.get('lap_duration') and not l.get('is_pit_out_lap') and all(l.get(f'duration_sector_{i}') for i in [1,2,3]) and abs(sum(l[f'duration_sector_{i}'] for i in [1,2,3])-l['lap_duration'])<.02]
   if not valid:continue
   lap=min(valid,key=lambda l:l['lap_duration']);start=datetime.fromisoformat(lap['date_start']);end=start+timedelta(seconds=lap['lap_duration'])
   su=api('sessions',session_key=session['session_key']);save('sessions',f'{year}/session.json',session,su,year)
   save('sessions',f'{year}/laps.json',laps,u,year)
   save('sessions',f'{year}/reference-lap.json',lap,u,year,selection='Fastest complete non-pit-out lap with consistent sector sum; timing sample, not certified qualifying record.')
   for endpoint in ['car_data','location']:
    u=api(endpoint,session_key=session['session_key'],driver_number=lap['driver_number'],**{'date>':start.isoformat(),'date<':end.isoformat()});raw=attempt(u)
    if raw:
     d=json.loads(raw)
     if d:save('sessions',f'{year}/{endpoint.replace("_","-")}.json',d,u,year,lap=lap['lap_number'],driver=lap['driver_number'])
   u=api('pit',session_key=session['session_key']);raw=attempt(u)
   if raw:save('sessions',f'{year}/pit.json',json.loads(raw),u,year)
   selected=True;break
  if selected:break
 # All five source categories have a versioned manifest, including pre-existing evidence.
 for category,entries in records.items():
  folder=base/category;folder.mkdir(parents=True,exist_ok=True)
  known={e['file'] for e in entries}
  old=folder/'source.json';previous={r['file']:r for r in json.loads(old.read_text()).get('files',[])} if old.exists() else {}
  legacy=[]
  for p in sorted(folder.rglob('*')):
   if not p.is_file() or p.name=='source.json' or str(p.relative_to(folder)) in known:continue
   rel=str(p.relative_to(folder));url=None;year=None
   if rel in previous and previous[rel].get('sha256')==sha(p):
    legacy.append(previous[rel]);continue
   if p.suffix=='.json':
    try:
     d=json.loads(p.read_text());source=d.get('source') if isinstance(d,dict) else None
     url=source if isinstance(source,str) else source.get('url') if isinstance(source,dict) else None
     rows=d if isinstance(d,list) else []
     dates=[r.get('date_start',r.get('date','')) for r in rows if isinstance(r,dict)]
     datedYears=[int(v[:4]) for v in dates if v and re.match(r'^202[3-6]-',v)]
     year=max(datedYears) if datedYears else None
    except (ValueError,TypeError):pass
   match=re.search(r'202[3-6]',url or p.name)
   if year is None and match:year=int(match.group())
   legacy.append(dict(file=rel,year=year,url=url,sha256=sha(p),kind='Retained pre-existing evidence',yearNote=None if year else 'Original acquisition/version year not stated; not relabelled as 2026.'))
  write(folder/'source.json',dict(schemaVersion=1,circuitId=row['id'],category=category,audited=TODAY,yearPreference=years,files=entries+legacy))
 write(base/'source.json',dict(schemaVersion=1,circuitId=row['id'],audited=TODAY,yearPreference=years,categories={c:f'{c}/source.json' for c in records},runtimeModified=False,failedRequests=checks))
 print(name,{c:len(v) for c,v in records.items()},flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--circuit');args=p.parse_args()
 for year in YEARS:
  try:SESSIONS[year]=js(api('sessions',year=year))
  except Exception as e:print('session catalog',year,str(e),flush=True)
 catalog=json.loads((ROOT/'circuits/catalog.json').read_text());rows=[r for r in catalog if not args.circuit or r['directory']==args.circuit]
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(archive,rows))
