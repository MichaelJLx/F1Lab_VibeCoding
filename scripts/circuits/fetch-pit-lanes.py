"""Refresh the selected OpenStreetMap pit-lane ways (ODbL 1.0)."""
import json, subprocess, xml.etree.ElementTree as ET
from pathlib import Path
root = Path(__file__).resolve().parents[2]
for path in sorted((root/'circuits').glob('*/sources/pit-lane/map.json')):
    pit = json.loads(path.read_text())
    key = path.parents[2].name
    ways = []
    for way_id in [w['id'] for w in pit['elements']]:
        url = f'https://api.openstreetmap.org/api/0.6/way/{way_id}/full'
        raw = subprocess.check_output(['curl', '-LsS', '--fail', '--max-time', '45', url])
        tree = ET.fromstring(raw)
        nodes = {int(n.attrib['id']): dict(lat=float(n.attrib['lat']), lon=float(n.attrib['lon'])) for n in tree.findall('node')}
        for w in tree.findall('way'):
            ids = [int(n.attrib['ref']) for n in w.findall('nd')]
            ways.append(dict(type='way', id=int(w.attrib['id']), tags={t.attrib['k']: t.attrib['v'] for t in w.findall('tag')}, nodes=ids, geometry=[nodes[i] for i in ids]))
    path.write_text(json.dumps({'source':'https://www.openstreetmap.org/copyright','elements':ways}, separators=(',',':')))
    print(key, len(ways), flush=True)
