"""Sample Mapzen Terrarium terrain at the vendored circuit vertices (not a road survey)."""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from PIL import Image

root = Path(__file__).resolve().parents[2]
catalog = json.loads((root / 'circuits/catalog.json').read_text())
features = json.loads((root / 'references/circuits/layouts/f1-circuits.geojson').read_text())['features']
directories = {row['id']: row['directory'] for row in catalog}
ids = set(directories)

@lru_cache(maxsize=128)
def tile(x, y):
    url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{x}/{y}.png'
    with urlopen(url, timeout=30) as response:
        return Image.open(BytesIO(response.read())).convert('RGB')

def altitude(lon, lat):
    size = 256 * 2**12
    px = (lon+180)/360*size-.5
    py = (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*size-.5
    x, y = math.floor(px), math.floor(py)
    value = 0
    for i in (0,1):
        for j in (0,1):
            a,b = x+i,y+j
            r,g,blue = tile(a//256,b//256).getpixel((a%256,b%256))
            value += (r*256+g+blue/256-32768)*(1-abs(px-a))*(1-abs(py-b))
    return round(value,2)

def sample(feature):
    return feature['properties']['id'], [altitude(*p[:2]) for p in feature['geometry']['coordinates']]

with ThreadPoolExecutor(max_workers=6) as pool:
    profiles = dict(pool.map(sample,(f for f in features if f['properties']['id'] in ids)))
for circuit_id, profile in profiles.items():
    path = root/'circuits'/directories[circuit_id]/'sources/elevation/terrain.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile,separators=(',',':')) + '\n')
