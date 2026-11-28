"""Index archived FIA PDF evidence without editing runtime circuit geometry.
Requires PyMuPDF for source-document extraction, never imported by the application.
"""
import hashlib,json,re
from pathlib import Path
import fitz
ROOT=Path(__file__).resolve().parents[2]
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def register(folder,filename,content,origin,kind):
 write(folder/filename,content);path=folder/'source.json';meta=json.loads(path.read_text());meta['files']=[r for r in meta['files'] if r['file']!=filename]
 meta['files'].append(dict(file=filename,year=origin['year'],url=origin['url'],derivedFrom=origin['file'],kind=kind,sha256=hashlib.sha256((folder/filename).read_bytes()).hexdigest()));write(path,meta)
for circuit in json.loads((ROOT/'circuits/catalog.json').read_text()):
 base=ROOT/'circuits'/circuit['directory']/'sources'
 files=json.loads((base/'layout/source.json').read_text())['files'];maps=[]
 for entry in files:
  path=base/'layout'/entry['file']
  if path.suffix!='.pdf' or 'circuit-map' not in path.name:continue
  doc=fitz.open(path)
  for i,page in enumerate(doc):
   text=page.get_text()
   if 'CIRCUIT DATA' in text or i==1:
    version=re.search(r'VERSION\s+(\d+)',text);maps.append((entry['year'],int(version.group(1)) if version else 0,entry,i,text))
 if not maps:continue
 _,_,source,index,text=max(maps,key=lambda x:(x[0],x[1]));path=base/'layout'/source['file'];doc=fitz.open(path);page=doc[index]
 runs=[]
 for block in page.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   runs.append({'text':''.join(s['text'] for s in line['spans']).strip(),'bbox':[round(x,2) for x in line['bbox']]})
 sectors={}
 for run in runs:
  match=re.match(r'^SECTOR\s+([123])(?:\s|$)',run['text'])
  if not match:continue
  inline=re.search(r'(\d+\.\d+)km',run['text'])
  if inline:
   sectors[match.group(1)]=round(float(inline[1])*1000);continue
  values=[r for r in runs if r['bbox'][0]>run['bbox'][2] and abs(r['bbox'][1]-run['bbox'][1])<2 and re.fullmatch(r'-?\s*\d+\.\d+\s*km',r['text'])]
  if values:
   v=min(values,key=lambda r:r['bbox'][0]);sectors[match.group(1)]=round(float(re.search(r'\d+\.\d+',v['text'])[0])*1000)
 lengthMatch=re.search(r'CENTRELINE LENGTH\s*-?\s*(\d+\.\d+)km',text);length=round(float(lengthMatch[1])*1000) if lengthMatch else None
 valid=len(sectors)==3 and length is not None and abs(sum(sectors.values())-length)<=2
 aeroKind='straight-mode' if 'STRAIGHT MODE' in text else 'legacy-drs' if 'DRS' in text else 'not-listed' if text.strip() else 'diagram-only'
 data={'sourceFile':'../layout/'+source['file'],'page':index+1,'year':source['year'],'lengthM':length,'sectorLengthsM':sectors if valid else None,'sectorGatesM':[sectors['1'],sectors['1']+sectors['2'],length] if valid else None,'coordinateSystem':'PDF page points; label rectangles are not track coordinates.','mapLabels':runs,'activeAero':{'kind':aeroKind,'runtimeImported':False},'validation':{'sectorSumMatchesLength':valid}}
 register(base/'annotations','fia-map-index.json',data,{**source,'file':'../layout/'+source['file']},'FIA map label and sector index')
 pitpages=[];pitSource=source
 for candidate in files:
  candidatePath=base/'layout'/candidate['file']
  if candidatePath.suffix!='.pdf':continue
  candidateDoc=fitz.open(candidatePath)
  for i,pitpage in enumerate(candidateDoc):
   text=pitpage.get_text()
   if 'PIT LANE' not in text or i==0:continue
   # Garage numbers can include 60. Keep the speed-sign evidence separate.
   limits=[]
   for block in pitpage.get_text('blocks'):
    if block[4].strip() in ['60','80']:limits.append(int(block[4].strip()))
   if not limits:limits=[int(line.strip()) for line in text.splitlines() if line.strip() in ['60','80']]
   pitpages.append({'sourceFile':'../layout/'+candidate['file'],'page':i+1,'postedLimitKmh':limits[0] if len(set(limits))==1 else None,'labels':text.splitlines()})
 register(base/'pit-lane','fia-pit-index.json',{'sourceFile':'../layout/'+source['file'],'year':source['year'],'pages':pitpages,'runtimeImported':False},{**source,'file':'../layout/'+source['file']},'FIA pit diagram text and posted speed sign')
 print(circuit['directory'],length,sectors,'pit',[(p['page'],p['postedLimitKmh']) for p in pitpages])
