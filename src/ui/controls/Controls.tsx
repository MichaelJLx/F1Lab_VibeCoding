import type {ReactNode} from 'react';
export function Toggle({children,on,disabled,change,title}:{children:ReactNode;on:boolean;disabled?:boolean;change:()=>void;title?:string}){
 return <button className="console-toggle" role="switch" aria-checked={on} disabled={disabled} onClick={change} title={title}><i aria-hidden="true"/>{children}</button>;
}
export function Segments<T extends string>({label,value,options,change,disabled}:{label:string;value:T;options:readonly (readonly [T,string])[];change:(v:T)=>void;disabled?:boolean}){
 return <div className="segments" role="group" aria-label={label}>{options.map(([v,name])=><button key={v} aria-pressed={v===value} disabled={disabled} onClick={()=>change(v)}>{name}</button>)}</div>;
}
export function PlaybackIcon({kind}:{kind:'play'|'pause'|'reset'}){
 return <svg viewBox="0 0 24 24" aria-hidden="true">{kind==='play'?<path d="m9 5 11 7-11 7Z" fill="currentColor"/>:kind==='pause'?<path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3"/>:<path d="M5 8A8 8 0 1 1 4 14M5 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}</svg>;
}
