import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Inspector,names,type View} from './model/Inspector';
import './style.css';
import {Toggle,Segments,PlaybackIcon} from './ui/Controls';
import circuits from './tracks/catalog.json';
import {CornerReview} from './ui/CornerReview';
import {SpaBroadcast,names as turnNames} from './ui/SpaBroadcast';
import {ErsGauge,VehicleStatus} from './ui/VehicleStatus';
import {LapCount} from './ui/LapCount';
import {SectorHistory} from './ui/SectorHistory';
import {TrackPicker,CircuitFlag} from './ui/TrackPicker';
import type {CruiseSnapshot} from './motion/Cruise';
import {type RoadStyle} from './tracks/SpaTrack';
function formatTime(seconds:number){return Math.floor(seconds/60)+":"+(seconds%60).toFixed(3).padStart(6,"0");}
function App(){const host=useRef<HTMLDivElement>(null),engine=useRef<Inspector|null>(null),anchors=useRef<HTMLDivElement>(null);const [laps,setLaps]=useState(1),[ready,setReady]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<string|null>(null),[view,setView]=useState<View>('hero'),[wire,setWire]=useState(false),[rotate,setRotate]=useState(false),[labels,setLabels]=useState(false),[spin,setSpin]=useState(false),[explode,setExplode]=useState(false),[steer,setSteer]=useState(0),[wingPreview,setWingPreview]=useState(false),[trackPicker,setTrackPicker]=useState(false),[lineVisible,setLineVisible]=useState(true),[road,setRoad]=useState<RoadStyle>('soft'),[flySpeed,setFlySpeed]=useState(35),[cruiseLimit,setCruiseLimit]=useState(Infinity),[cruise,setCruise]=useState<CruiseSnapshot>({status:'idle',speed:0,progress:0,elapsed:0,distance:0});
useEffect(()=>{if(!host.current)return;let e:Inspector;try{e=new Inspector(host.current,()=>setReady(true),setSelected,setError,points=>{if(!anchors.current)return;for(const el of anchors.current.querySelectorAll<HTMLElement>('.anchor')){el.style.opacity='0';el.style.pointerEvents='none';}const occupied:{x:number,y:number}[]=[];for(const p of points){const el=anchors.current.querySelector(`[data-key="${p.key}"]`) as HTMLElement|null;if(!el)continue;const visible=p.visible&&!occupied.some(o=>Math.abs(o.x-p.x)<130&&Math.abs(o.y-p.y)<42);el.style.transform=`translate(${p.x}px,${p.y}px)`;el.style.opacity=visible?'1':'0';el.style.pointerEvents=visible?'auto':'none';if(visible)occupied.push(p);}},setCruise);engine.current=e;}catch{setError('暂时无法显示赛道，请刷新页面或更换浏览器后重试。');}return()=>{e?.dispose();engine.current=null;};},[]);
const [review,setReview]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
useEffect(()=>{if(!historyOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setHistoryOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[historyOpen]);
const [candidates,setCandidates]=useState(false);
const [energyUse,setEnergyUse]=useState(false),[tyreWear,setTyreWear]=useState(false);
const [collapsed,setCollapsed]=useState(false),[boards,setBoards]=useState(true);
useEffect(()=>{if(engine.current)engine.current.labelsVisible=labels;},[labels]);
const [pressure,setPressure]=useState(false);
const [flowVisible,setFlowVisible]=useState(false);
const [aeroVisible,setAeroVisible]=useState(true);
const [circuitId,setCircuitId]=useState('be-1925');
useEffect(()=>{if(engine.current){engine.current.cruise.energyEnabled=energyUse;engine.current.cruise.wearEnabled=tyreWear;}},[energyUse,tyreWear,circuitId]);

useEffect(()=>{if(engine.current){engine.current.cruise.limitKmh=cruiseLimit===-1?Infinity:cruiseLimit;engine.current.cruise.pace=cruiseLimit===-1?.94:1;}},[cruiseLimit,circuitId]);
const circuit=circuits.find(c=>c.id===circuitId)!;
const isSpa=circuitId==='be-1925',preview=engine.current?.preview;
useEffect(()=>{engine.current?.line.setVisible(lineVisible,candidates);},[lineVisible,candidates,ready,circuitId]);
useEffect(()=>{engine.current?.setTrackSigns(boards);},[boards,circuitId,ready]);
function chooseCircuit(id:string){
 setReview(false);
 const e=engine.current;
 if(id!==circuitId && e){
   e.switchCircuit(id);
   setCircuitId(id);setView('track');setWingPreview(false);setSpin(false);setExplode(false);
 }
 setTrackPicker(false);
}
const raceLaps:Record<string,number>={'au-1953':58,'cn-2004':56,'jp-1962':53,'bh-2002':57,'sa-2021':50,'us-2022':57,'ca-1978':70,'mc-1929':78,'es-1991':66,'at-1969':71,'gb-1948':52,'be-1925':44,'hu-1986':70,'nl-1948':72,'it-1922':53,'es-2026':57,'az-2016':51,'sg-2008':62,'us-2012':56,'mx-1962':71,'br-1940':71,'us-2023':50,'qa-2004':57,'ae-2009':58};
const phaseLabel=cruise.phase==='in'?'进站圈':'出站圈';
const stage=cruise.recovering?'冲出赛道 · 正在复位':cruise.invalidLap?'无效圈':cruise.status==='complete'?'已结束':cruise.status==='idle'?'待发车':cruise.phase==='timed'?'飞驰圈 '+cruise.lap+'/'+laps:phaseLabel;
const statusLabel=cruise.status==='paused'?'暂停 · '+stage:stage;
const completed=(cruise.timingRows??[]).filter(row=>row.total!==undefined);
const finish=!cruise.invalidLap&&cruise.finishHold?completed.at(-1):undefined;
const shownRow=finish??(cruise.phase==='timed'?cruise.timingRows?.at(-1):undefined);
function resetCar(){
 setReview(false);engine.current?.resetGrid();
 setView('hero');setSteer(0);setWingPreview(false);setSpin(false);setExplode(false);
}
function runCruise(){setReview(false);setWingPreview(false);if(engine.current){engine.current.cruise.lapCount=laps;engine.current.toggleCruise();}setSpin(false);setExplode(false);}
function camera(v:View){setView(v);engine.current?.view(v);}
function toggle(kind:'wire'|'rotate'|'spin'|'explode'){const e=engine.current;if(!e)return;if(kind==='wire'){setWire(!wire);e.setWire(!wire);}if(kind==='rotate'){setRotate(!rotate);e.rotate=!rotate;}if(kind==='spin'){setSpin(!spin);e.spinning=!spin;}if(kind==='explode'){setExplode(!explode);e.exploded=explode?0:1;}}
return <main className={`telemetry-hud console-layout${collapsed?' console-collapsed':''}`}><header className="app-header">
<div className="brand-track"><a className="brand" href="/" aria-label="Formula one 首页">Formula <span>one</span></a><button className="track-pill" disabled={!ready} aria-haspopup="dialog" aria-expanded={trackPicker} onClick={()=>{engine.current?.free.keys.clear();setTrackPicker(true);}}><CircuitFlag id={circuitId}/>{isSpa?'SPA':circuit.region.split(' · ').at(-1)}<span aria-hidden="true">⌄</span></button></div>
<div className="header-actions"><Segments label="视角" value={view} disabled={!ready} change={camera} options={([['helmet','头盔'],['onboard','车载'],['hero','车尾'],['track','俯瞰'],['free','自由'],...(isSpa?[['trackside','转播']]:[])] as [View,string][])}/>
{isSpa&&<><div className="session-length" title={`最多 ${raceLaps[circuitId]} 圈`}><LapCount value={laps} maximum={raceLaps[circuitId]} locked={cruise.status==='running'||cruise.status==='paused'} onChange={setLaps}/><small>/{raceLaps[circuitId]}</small></div><div className="playback-controls"><button className="run-button icon-button" disabled={!ready} aria-label={cruise.status==='running'?'暂停':cruise.status==='paused'?'继续':'发车'} title={cruise.status==='running'?'暂停':cruise.status==='paused'?'继续':'发车'} onClick={runCruise}><PlaybackIcon kind={cruise.status==='running'?'pause':'play'}/></button><button className="icon-button" disabled={!ready||cruise.status==='idle'} aria-label="重置赛车" title="重置赛车" onClick={resetCar}><PlaybackIcon kind="reset"/></button></div></>}
</div></header>
<section className={view==='helmet'?'stage helmet-stage cockpit-stage':view==='onboard'?'stage cockpit-stage':'stage'}><div className="canvas" ref={host}/><div className="masthead"><div className="eyebrow"><span/> {circuit.region}</div><h1 className={isSpa?undefined:"preview-title"}>{isSpa?'SPA':circuit.name}<span>{isSpa?'7.004 KM / 19 TURNS':((preview?.track.length??0)/1000).toFixed(3)+' KM'}</span></h1><p>RB22 · {cruise.status==='idle'?isSpa?'待发车':'发车格 01':statusLabel}</p></div>{view==='free' && <div className="camera-tools"><b>自由视角</b><small>拖动环视 · 右键平移 · 滚轮推拉<br/>WASD 水平移动 · Q/E 升降 · Shift 加速</small>
{isSpa&&<select aria-label="选择弯道" defaultValue="" onChange={e=>{if(e.target.value!=='')engine.current?.exploreCorner(+e.target.value);e.target.value='';}}><option value="">选择弯道</option>{turnNames.map((name,i)=><option key={i} value={i}>{i+1} · {name}</option>)}</select>}
<label>移动速度 <select value={flySpeed} onChange={e=>{setFlySpeed(+e.target.value);if(engine.current){engine.current.free.speed=+e.target.value;engine.current.free.canvas.focus();}}}>{[8,35,120].map((v,i)=><option key={v} value={v}>{['慢速','标准','快速'][i]}</option>)}</select></label>
<div className="fly-pad">{[['KeyW','前进'],['KeyS','后退'],['KeyA','左移'],['KeyD','右移'],['KeyQ','下降'],['KeyE','上升']].map(([code,label])=><button key={code} onPointerDown={ev=>{ev.preventDefault();ev.currentTarget.setPointerCapture(ev.pointerId);engine.current?.free.keys.add(code);}} onLostPointerCapture={()=>engine.current?.free.keys.delete(code)}>{label}</button>)}</div></div>}
{view==='onboard'&&<div className="stage-note"><small>拖动环视</small></div>}
{review&&engine.current&&<CornerReview engine={engine.current} close={()=>setReview(false)}/>}
<SpaBroadcast data={cruise} showCircuit={isSpa} inspecting={!!selected} aeroVisible={aeroVisible} flowVisible={flowVisible} pressure={pressure}/>
{view==='helmet'&&<div className="helmet-visor" aria-hidden="true"><span/></div>}
<div ref={anchors} className={`annotations ${labels&&ready?'':'hidden'}`}>{Object.entries(names).map(([key,name])=><button key={key} data-key={key} className="anchor" onClick={()=>key==='vehicle'?camera('hero'):engine.current?.select(key)}><i/>{name}<span>＋</span></button>)}</div>
{cruise.recovering&&<div className="recovery-notice" role="status">冲出赛道 · 正在复位</div>}
{!ready&&!error&&<div className="loading"><i/>赛车准备中…</div>}{error&&<div role="alert" className="loading">{error}</div>}
{selected&&<aside className="part-card"><button className="close" aria-label="关闭部件详情" onClick={()=>engine.current?.select(null)}>×</button><h2>{names[selected]}</h2>{/^(FL|FR|RL|RR)$/.test(selected)?<div className="physics-readout">轮胎负荷 <b>{Math.round(cruise.loads?.[selected]??0)} N</b>{cruise.tyres?.[selected] && <small>胎压 {(cruise.tyres[selected].pressure/100).toFixed(2)} bar · 接地压力 {cruise.tyres[selected].contact.toFixed(0)} kPa<br/>平斑 {cruise.tyres[selected].wear.toFixed(2)} mm {cruise.tyres[selected].locked?'· 锁死':''}</small>}</div>:<div className="physics-readout">侧倾 <b>{(cruise.roll??0).toFixed(2)}°</b> · 俯仰 <b>{(cruise.pitch??0).toFixed(2)}°</b><br/>车身起伏 <b>{(cruise.heave??0).toFixed(1)} mm</b></div>}{/^(FL|FR|RL|RR)$/.test(selected)&&<><label className="slider">前轮转向 <b>{steer}°</b><input aria-label="前轮转向角度" disabled={cruise.status==='running'||cruise.status==='paused'} type="range" min="-25" max="25" value={steer} onChange={ev=>{setSteer(+ev.target.value);if(engine.current)engine.current.steering=+ev.target.value*Math.PI/180;}}/></label><button disabled={cruise.status==='running'||cruise.status==='paused'} onClick={()=>toggle('spin')} className="text-action">{spin?'停止旋转':'旋转车轮'} →</button></>}</aside>}

</section>
<button className="console-collapse" aria-label={collapsed?'展开底栏':'收起底栏'} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)} title={collapsed?'展开底栏':'收起底栏'}>{collapsed?'⌃':'⌄'}</button>
<div className="control-console" hidden={collapsed}>
<section className="console-zone energy-zone" aria-label="能源与轮胎"><h2>能源与轮胎</h2><div className="energy-grid"><div className="energy-controls"><Toggle on={energyUse} change={()=>setEnergyUse(v=>!v)} disabled={!isSpa}>ERS 消耗</Toggle><ErsGauge data={cruise} enabled={energyUse}/><Toggle on={tyreWear} change={()=>setTyreWear(v=>!v)} disabled={!isSpa}>轮胎磨损</Toggle></div><VehicleStatus data={cruise} wearEnabled={tyreWear}/></div></section>
<section className="console-zone drive-zone" aria-label="驾驶与空力"><h2>驾驶与空力 <span>{cruise.phase==='timed'&&!cruise.invalidLap&&cruise.aeroZone?'直道模式':'基础模式'}</span></h2>
<Segments label="驾驶节奏" value={String(cruiseLimit)} options={[["Infinity","极限推进"],["-1","稳健节奏"],["120","巡航 120"],["60","巡航 60"]]} change={v=>setCruiseLimit(+v)} disabled={!isSpa}/>
<div className="console-grid"><Toggle on={flowVisible} disabled={!ready} change={()=>{engine.current?.setAirflow(!flowVisible);setFlowVisible(!flowVisible);}}>空气流场</Toggle><Toggle on={pressure} disabled={!ready} change={()=>{engine.current?.setPressure(!pressure);setPressure(!pressure);}}>压力系数</Toggle><Toggle on={aeroVisible} change={()=>setAeroVisible(v=>!v)}>空力读数</Toggle><Toggle on={wingPreview} disabled={!ready||cruise.status!=='idle'} change={()=>{if(engine.current)engine.current.gridWingPreview=!wingPreview;setWingPreview(!wingPreview);}}>主动翼展开</Toggle></div></section>
<section className="console-zone aids-zone" aria-label="视图辅助"><h2>视图辅助</h2><div className="aids-grid">
<Toggle on={lineVisible} disabled={!isSpa} change={()=>setLineVisible(v=>!v)}>最佳走线</Toggle><Toggle on={candidates} disabled={!isSpa} change={()=>setCandidates(v=>!v)}>备选走线</Toggle><Toggle on={boards} change={()=>setBoards(v=>!v)}>赛道提示牌</Toggle><Toggle on={labels} change={()=>setLabels(!labels)}>部件标注</Toggle><Toggle on={wire} change={()=>toggle('wire')}>结构视图</Toggle><Toggle on={rotate} change={()=>toggle('rotate')}>环绕</Toggle><Toggle on={explode} disabled={cruise.status==='running'||cruise.status==='paused'} change={()=>toggle('explode')}>车轮拆解</Toggle><Toggle on={spin} disabled={cruise.status==='running'||cruise.status==='paused'} change={()=>toggle('spin')}>车轮旋转</Toggle>
</div>{candidates&&!cruise.candidatesReady&&isSpa&&<small className="line-hint" role="status">备选走线将在飞驰圈准备完成后显示</small>}<div className="view-tools"><Segments label="路面" value={road} options={[["soft","柔焦"],["clear","清晰"],["outline","轮廓"]]} change={v=>{setRoad(v);if(engine.current)engine.current.roadStyle=v;}}/><Segments label="观察方向" value={view} options={[["bottom","车底"],["side","侧面"],["top","顶部"],["front","车头"],["rear","车尾"]]} change={camera}/></div></section>
<section className="console-zone timing-zone" aria-label="圈速遥测"><h2>圈速遥测 <span>{!ready?'加载中':isSpa?statusLabel:'赛道浏览'}</span></h2>
<div className="session-times"><strong>{isSpa?(cruise.invalidLap?'无效圈':finish?formatTime(finish.total!):cruise.phase==='timed'?formatTime(cruise.elapsed):stage):'—'}</strong><span>{(cruise.distance/1000).toFixed(2)} km</span>{cruise.liveDelta!==undefined&&<em className={cruise.liveDelta<=0?'gain':'loss'}>{cruise.liveDelta>=0?'+':''}{cruise.liveDelta.toFixed(3)}</em>}{Number.isFinite(cruise.bestLap)&&<small>最佳 {formatTime(cruise.bestLap!)}</small>}</div>
<div className="timing-segments">{[0,1,2].map(i=>{const result=shownRow?.sectors[i];return <div key={i} className={result?.color??''}><span>S{i+1}</span><b>{cruise.invalidLap?'无效圈':result?(result.ms/1000).toFixed(3):'—'}</b></div>;})}</div>
<div className="timing-actions"><button aria-haspopup="dialog" onClick={()=>setHistoryOpen(true)}>圈速榜 ↗</button>{(engine.current?.cruise.reviews.length??0)>0&&<button onClick={()=>{if(cruise.status==='running')engine.current?.toggleCruise();setReview(true);}}>过弯回放</button>}{cruise.report&&<small title={`${turnNames[cruise.report.i]} · 出弯 ${cruise.report.exitDelta?.toFixed(0)??'—'} km/h`}>T{cruise.report.i+1} {cruise.report.delta===undefined?'—':(cruise.report.delta>=0?'+':'')+cruise.report.delta.toFixed(2)+' s'}</small>}</div></section>
</div>
{historyOpen&&<div className="history-scrim" onClick={()=>setHistoryOpen(false)}><section className="history-dialog" role="dialog" aria-modal="true" aria-label="圈速榜" onClick={e=>e.stopPropagation()}><button className="close" aria-label="关闭圈速榜" autoFocus onClick={()=>setHistoryOpen(false)}>×</button><SectorHistory rows={cruise.timingRows??[]} expanded/></section></div>}
{trackPicker&&<TrackPicker active={circuitId} onChoose={chooseCircuit} onClose={()=>setTrackPicker(false)}/>}</main>}
createRoot(document.getElementById('root')!).render(<App/>);
