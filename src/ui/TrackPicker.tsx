import {useEffect, useRef, useState} from 'react';
import circuits from '../tracks/catalog.json';

export function CircuitFlag({id}:{id:string}){
  const country=id.split('-')[0].toUpperCase();
  const flag=Array.from(country,letter=>String.fromCodePoint(0x1f1e6+letter.charCodeAt(0)-65)).join('');
  return <span aria-hidden="true" className="circuit-flag">{flag}</span>;
}

export function TrackPicker({active,onChoose,onClose}: {active:string,onChoose:(id:string)=>void,onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState(active);
  const selected = circuits.find(c => c.id === preview)!;
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="track-dialog" aria-labelledby="track-title"
    onCancel={onClose} onKeyDown={event => event.stopPropagation()}
    onClick={event => {if (event.target === event.currentTarget) onClose();}}>
    <div className="track-picker">
      <div className="track-picker-heading">
        <h2 id="track-title"><CircuitFlag id={selected.id}/> 选择赛道 <small>{circuits.length} 站</small></h2>
        <button className="track-dismiss" onClick={onClose} aria-label="关闭赛道选择" autoFocus>×</button>
      </div>
      <div className="track-picker-note"><span><i/> {circuits.find(c=>c.id===active)?.name}</span><span>当前赛道</span></div>
      <div className="track-grid">
        {circuits.map((c, index) => <button key={c.id} className={`circuit-card ${preview === c.id ? 'previewed' : ''}`}
          aria-pressed={preview === c.id} onClick={() => setPreview(c.id)}>
          <div className="circuit-meta"><span>{c.region}</span><small>{c.id===active ? '当前赛道' : c.available?'极限推进':'赛道巡览'}</small></div>
          <svg viewBox="0 0 240 132" role="img" aria-label={`${c.name} · 布局`}><path d={c.path}/></svg>
          <div className="circuit-name"><span className="circuit-number">{String(index + 1).padStart(2, '0')}</span><div><b>{c.name}</b><small>{c.english}</small></div></div>
        </button>)}
      </div>
      <div className="track-picker-bottom">
        <div aria-live="polite"><b>{selected.name}</b><p>{selected.available ? '极限推进' : '浏览赛道与赛车'}</p></div>
        <button className="run-button" onClick={()=>onChoose(selected.id)}>{selected.id===active?'返回赛道':'进入赛道'}</button>
      </div>
      <div className="track-attribution">赛道轮廓 · <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noreferrer">Tomislav Bacinger / f1-circuits · MIT</a></div>
    </div>
  </dialog>;
}
