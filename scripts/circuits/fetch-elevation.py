import json,urllib.request,urllib.parse,time,pathlib,argparse
root=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description='Fetch elevation samples for a registered circuit')
parser.add_argument('circuit',help='Circuit directory name, such as spa or shanghai')
args=parser.parse_args()
entry=next(row for row in json.loads((root/'circuits/catalog.json').read_text()) if row['directory']==args.circuit)
local=list((root/'circuits'/args.circuit/'sources/layout').glob('*.geojson'))
features=json.loads((local[0] if local else root/'references/circuits/layouts/f1-circuits.geojson').read_text())['features']
feature=features[0] if local else next(f for f in features if f['properties']['id']==entry['id'])
c=feature['geometry']['coordinates']
output=root/'circuits'/args.circuit/'sources/elevation/eudem25m.json'
output.parent.mkdir(parents=True,exist_ok=True)
results=[]
for begin in range(0,len(c),90):
    locations='|'.join(f'{p[1]},{p[0]}' for p in c[begin:begin+90])
    url='https://api.opentopodata.org/v1/eudem25m?'+urllib.parse.urlencode({'locations':locations,'interpolation':'bilinear'})
    with urllib.request.urlopen(url,timeout=45) as response: data=json.load(response)
    if data.get('status')!='OK': raise RuntimeError(data)
    results+=data['results']
    time.sleep(1.1)
output.write_text(json.dumps({'source':'https://api.opentopodata.org/v1/eudem25m','resolutionMeters':25,'interpolation':'bilinear','results':results},indent=2))
print('DEM samples:',len(results),'elevation range:',min(p['elevation'] for p in results),max(p['elevation'] for p in results))
