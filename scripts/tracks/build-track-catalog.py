"""Build north-up circuit thumbnails from the vendored MIT GeoJSON."""
import json, math
from pathlib import Path
root = Path(__file__).resolve().parents[2]
rows = [
('au-1953','澳大利亚 · 墨尔本','阿尔伯特公园'),('cn-2004','中国 · 上海','上海国际赛车场'),('jp-1962','日本 · 铃鹿','铃鹿赛道'),('bh-2002','巴林 · 萨基尔','巴林国际赛道'),('sa-2021','沙特阿拉伯 · 吉达','吉达滨海赛道'),('us-2022','美国 · 迈阿密','迈阿密国际赛道'),('ca-1978','加拿大 · 蒙特利尔','吉尔·维伦纽夫赛道'),('mc-1929','摩纳哥 · 蒙特卡洛','摩纳哥赛道'),('es-1991','西班牙 · 巴塞罗那','巴塞罗那-加泰罗尼亚赛道'),('at-1969','奥地利 · 施皮尔贝格','红牛环'),('gb-1948','英国 · 银石','银石赛道'),('be-1925','比利时 · 斯帕','斯帕-弗朗科尔尚赛道'),('hu-1986','匈牙利 · 布达佩斯','亨格罗宁赛道'),('nl-1948','荷兰 · 赞德沃特','赞德沃特赛道'),('it-1922','意大利 · 蒙扎','蒙扎国家赛车场'),('es-2026','西班牙 · 马德里','Madring 赛道'),('az-2016','阿塞拜疆 · 巴库','巴库城市赛道'),('sg-2008','新加坡','滨海湾街道赛道'),('us-2012','美国 · 奥斯汀','美洲赛道'),('mx-1962','墨西哥 · 墨西哥城','罗德里格斯兄弟赛道'),('br-1940','巴西 · 圣保罗','英特拉格斯赛道'),('us-2023','美国 · 拉斯维加斯','拉斯维加斯大道赛道'),('qa-2004','卡塔尔 · 卢赛尔','卢赛尔国际赛道'),('ae-2009','阿联酋 · 阿布扎比','亚斯码头赛道')]
features = {f['properties']['id']: f for f in json.loads((root/'data/tracks/layouts/f1-circuits.geojson').read_text())['features']}
catalog=[]
for id, region, name in rows:
    f=features[id]; coords=f['geometry']['coordinates']
    latitude=sum(p[1] for p in coords)/len(coords)
    points=[(p[0]*math.cos(math.radians(latitude)), -p[1]) for p in coords]
    xmin,xmax=min(p[0] for p in points),max(p[0] for p in points)
    ymin,ymax=min(p[1] for p in points),max(p[1] for p in points)
    scale=min(208/(xmax-xmin),108/(ymax-ymin))
    points=[(120+(x-(xmin+xmax)/2)*scale,66+(y-(ymin+ymax)/2)*scale) for x,y in points]
    path=' '.join(('M' if i==0 else 'L')+f'{x:.1f},{y:.1f}' for i,(x,y) in enumerate(points))+' Z'
    catalog.append(dict(id=id,region=region,name=name,english=f['properties']['Name'],path=path,available=id=='be-1925'))
(root/'src/tracks/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
