"""Fetch public circuit coordinate frames used by the FIA marking catalog."""
import json,subprocess,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'data/tracks/annotations'
keys={'au-1953':10,'cn-2004':49,'jp-1962':46,'bh-2002':63,'sa-2021':149,'us-2022':151,'ca-1978':23,'mc-1929':22,'es-1991':15,'at-1969':19,'gb-1948':2,'hu-1986':4,'nl-1948':55,'it-1922':39,'es-2026':153,'az-2016':144,'sg-2008':61,'us-2012':9,'mx-1962':65,'br-1940':14,'us-2023':152,'qa-2004':150,'ae-2009':70}
def fetch(pair):
 id,key=pair;path=root/(id+'.json')
 if path.exists():return
 for year in [2026,2025]:
  url=f'https://api.multiviewer.app/api/v1/circuits/{key}/{year}'
  try:
   data=json.loads(subprocess.check_output(['curl','--fail','-LsS','--max-time','30',url]))
   if len(data.get('x',[]))<10:continue
   path.write_text(json.dumps({'source':url,'data':data},separators=(',',':')));print(id,len(data['x']),flush=True);return
  except Exception as e:print(id,year,type(e).__name__,flush=True)
 print('No coordinate frame:',id,flush=True)
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,keys.items()))
