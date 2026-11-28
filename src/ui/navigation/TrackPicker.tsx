import {useEffect, useRef} from 'react';
import circuits from '../../tracks/generated/circuit-summaries.json';
import {Brand} from './Brand';

export function CircuitFlag({id}:{id:string}){
  const country=id.split('-')[0].toUpperCase();
  const flag=Array.from(country,letter=>String.fromCodePoint(0x1f1e6+letter.charCodeAt(0)-65)).join('');
  return <span aria-hidden="true" className="circuit-flag">{flag}</span>;
}

export function TrackPicker({active,onChoose,onClose,error}: {error?:string,active:string|null,onChoose:(id:string)=>void,onClose?: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className={`track-dialog${active?'':' track-welcome'}`} aria-labelledby="track-title"
    onCancel={event=>{event.preventDefault();onClose?.();}} onKeyDown={event => event.stopPropagation()}
    onClick={event => {if (event.target === event.currentTarget) onClose?.();}}>
    <div className="track-picker">
      <div className="track-picker-header">
        <div className="track-picker-heading track-container">
          <div className="track-picker-identity"><Brand/><h2 id="track-title">选择赛道 <small>{circuits.length} 站</small></h2></div>
          {onClose&&<button className="track-return" onClick={onClose} aria-label="返回赛道" autoFocus><span>返回赛道</span><span aria-hidden="true">🔙</span></button>}
        </div>
      </div>
      <div className="track-scroll">
        <div className="track-container">
          {error&&<p role="alert">{error}</p>}
          <div className="track-grid">
        {circuits.map((c, index) => <button key={c.id} className={`circuit-card ${active === c.id ? 'previewed' : ''}`}
          autoFocus={!onClose && index===0} aria-pressed={active === c.id} onClick={() => onChoose(c.id)}>
          <div className="circuit-meta"><span className="circuit-region"><CircuitFlag id={c.id}/>{c.region}</span>{c.id===active&&<small>当前赛道</small>}</div>
          <svg viewBox="0 0 240 132" role="img" aria-label={`${c.name} · 布局`}><path d={c.path}/></svg>
          <div className="circuit-name"><span className="circuit-number">{String(index + 1).padStart(2, '0')}</span><div><b>{c.name}</b><small>{c.english}</small></div></div>
          <div className="circuit-facts">{(c.length/1000).toFixed(3)} KM · {c.turns} TURNS</div>
        </button>)}
          </div>
          <div className="track-attribution">赛道轮廓 · <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noreferrer">Tomislav Bacinger / f1-circuits · MIT</a></div>
        </div>
      </div>
    </div>
  </dialog>;
}
