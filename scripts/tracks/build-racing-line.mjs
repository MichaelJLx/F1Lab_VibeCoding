import {readFile,writeFile} from 'node:fs/promises';
const track=JSON.parse(await readFile('src/tracks/spa.json','utf8')),L=track.geometryLength;
const M=Math.ceil(L/28),N=Math.ceil(L/7),controls=new Float64Array(M);
const wrap=(i,n)=>((i%n)+n)%n;
function base(s){const t=wrap(s,L)/L*track.nodes.length,i=Math.floor(t),f=t-i,a=track.nodes[i],b=track.nodes[(i+1)%track.nodes.length];return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.z+(b.z-a.z)*f];}
function offset(s,c=controls){const t=wrap(s,L)/L*M,i=Math.floor(t),u=t-i,w=[(1-u)**3/6,(3*u**3-6*u*u+4)/6,(-3*u**3+3*u*u+3*u+1)/6,u**3/6];return w.reduce((a,v,j)=>a+v*c[wrap(i+j-1,M)],0);}
// Use the narrowest road half-width, and reserve the physical half-car width plus clearance.
const bound=Math.min(...track.nodes.map(p=>Math.min(p.widthLeft,p.widthRight)))-.95-.35;
const samples=Array.from({length:N},(_,i)=>{const s=i/N*L,p=base(s),a=base(s-2),b=base(s+2),dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);return {s,p,left:[-dy/d,dx/d]};});
const assumptions={carWidth:1.9,clearanceHalfWidth:1.30,lateralAcceleration:15.7,acceleration:6,braking:12,maxSpeed:90,units:'SI',notes:'Neutral engineering assumptions, no aero/ERS/gearbox calibration; road and car share one visual scale.'};
function evaluate(c,returnProfile=false){const x=new Float64Array(N),y=new Float64Array(N),z=new Float64Array(N),ds=new Float64Array(N),v=new Float64Array(N);
for(let i=0;i<N;i++){const a=samples[i],o=offset(a.s,c);x[i]=a.p[0]+a.left[0]*o;y[i]=a.p[1]+a.left[1]*o;z[i]=a.p[2];}
for(let i=0;i<N;i++){const p=wrap(i-1,N),n=(i+1)%N,ux=x[i]-x[p],uy=y[i]-y[p],vx=x[n]-x[i],vy=y[n]-y[i],a=Math.hypot(ux,uy),b=Math.hypot(vx,vy),chord=Math.hypot(x[n]-x[p],y[n]-y[p]),k=2*Math.abs(ux*vy-uy*vx)/Math.max(1e-8,a*b*chord);ds[i]=Math.hypot(vx,vy,z[n]-z[i]);v[i]=Math.min(assumptions.maxSpeed,Math.sqrt(assumptions.lateralAcceleration/Math.max(1e-8,k)));}
for(let pass=0;pass<4;pass++){for(let i=0;i<N;i++){const n=(i+1)%N;v[n]=Math.min(v[n],Math.sqrt(v[i]*v[i]+2*assumptions.acceleration*ds[i]));}for(let i=N-1;i>=0;i--){const n=(i+1)%N;v[i]=Math.min(v[i],Math.sqrt(v[n]*v[n]+2*assumptions.braking*ds[i]));}}
let time=0,smooth=0;for(let i=0;i<N;i++)time+=2*ds[i]/Math.max(1,v[i]+v[(i+1)%N]);for(let i=0;i<M;i++)smooth+=(c[wrap(i-1,M)]-2*c[i]+c[(i+1)%M])**2;const cost=time+.002*smooth+guideCost(c);return returnProfile?{time,cost,length:ds.reduce((a,b)=>a+b,0)}:cost;}
// Approximate distances from local layout curvature. Positive offset is left.
const apexTargets = [
 [170, 1], [247, -1], [320, 1],                 // La Source: wide entry, late apex
 [2200, 1], [2282, -1], [2366, 1], [2508, -1], // Les Combes through Malmedy
 [3535, -1], [3634, 1], [3680, -.35], [3742, 1], [3830, -1], // Pouhon double left
 [6520, 1], [6589, -1], [6639, 1], [6720, -1] // Bus Stop
];
function guideCost(c) {
 return apexTargets.reduce((total, [s, side]) => total + .32 * (offset(s,c)-side*bound)**2, 0);
}
const baseline=evaluate(controls,true);let score=baseline.cost;
// Deterministic bounded coordinate descent; nonnegative B-spline weights keep all offsets bounded.
for(const step of [.9,.45,.2,.08])for(let sweep=0;sweep<3;sweep++)for(let i=0;i<M;i++){const old=controls[i];let best=old,bestScore=score;for(const sign of [-1,1]){controls[i]=Math.max(-bound,Math.min(bound,old+sign*step));const value=evaluate(controls);if(value<bestScore-1e-8){bestScore=value;best=controls[i];}}controls[i]=best;score=bestScore;}
const result=evaluate(controls,true),offsets=track.nodes.map(p=>+offset(p.s).toFixed(6));
const data={guideSource:"https://driver61.com/circuit-guide/spa/",apexTargets,version:2,trackId:track.trackId,label:'模型计算的近似最优线',method:'Bounded periodic cubic B-spline coordinate descent minimizing simplified lap time with forward/backward acceleration-braking profile and small lateral smoothness penalty',globalOptimumClaim:false,assumptions,controlSpacing:L/M,lateralBound:bound,baselineSeconds:baseline.time,optimizedSeconds:result.time,estimatedLineLength:result.length,offsets,disclaimer:'A local approximate solution under stated assumptions, not a team racing line; widths/bank/elevation remain approximate. Cruise independently references the 2023 race lap.'};
await writeFile('src/tracks/spa-racing-line.json',JSON.stringify(data));console.log(`Reference line generated: baseline ${baseline.time.toFixed(2)} s -> local solution ${result.time.toFixed(2)} s; lateral bound ±${bound.toFixed(2)} m.`);
