import json,urllib.request,urllib.parse,time,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
c=json.loads((root/'data/tracks/spa/be-1925.geojson').read_text())['features'][0]['geometry']['coordinates']
results=[]
for begin in range(0,len(c),90):
    locations='|'.join(f'{p[1]},{p[0]}' for p in c[begin:begin+90])
    url='https://api.opentopodata.org/v1/eudem25m?'+urllib.parse.urlencode({'locations':locations,'interpolation':'bilinear'})
    with urllib.request.urlopen(url,timeout=45) as response: data=json.load(response)
    if data.get('status')!='OK': raise RuntimeError(data)
    results+=data['results']
    time.sleep(1.1)
(root/'data/tracks/spa/eudem25m.json').write_text(json.dumps({'source':'https://api.opentopodata.org/v1/eudem25m','resolutionMeters':25,'interpolation':'bilinear','results':results},indent=2))
print('DEM samples:',len(results),'elevation range:',min(p['elevation'] for p in results),max(p['elevation'] for p in results))
