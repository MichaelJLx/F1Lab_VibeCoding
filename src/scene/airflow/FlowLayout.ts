export const steps=192;
export const ribbonVertices=4;
export const seeds:Array<[number,number,number]>=[];
for(const side of [-1,1])for(const [x,y] of [[.09,.43],[.24,.57],[.36,.69],[.52,.66],[.68,.57],[.80,.50],[.89,.38],[.98,.28],[1.06,.19],[.39,.054],[.21,.042],[.57,.095]]){
 seeds.push([side*x,y,3.85]);
}
// Probe families share a common free-stream inlet.
for(const side of [-1,1]){
 for(const [x,y,z] of [[.61,.37,.76],[.63,.30,.76],[.76,.13,.53],[.82,.09,.53],[.48,.65,1.27],[.64,.16,-1.75]]){
   seeds.push([side*x,y,3.85]);
 }
}
// Dedicated upper-body and floor-edge smoke probes.
for(const side of [-1,1])for(const [x,y,z] of [[.30,.92,1.25],[.43,1.02,.6],[.28,.98,-.3],[.66,.56,.55],[.70,.12,.25],[.54,.16,-1.5]])seeds.push([side*x,y,3.85]);
for(const side of [-1,1])for(const [x,y,z] of [[.18,.34,2.35],[.35,.4,1.4],[.51,.24,.65],[.58,.53,.35],[.60,.44,-.35]])seeds.push([side*x,y,3.85]);
// Keep outboard probes at their inlet positions; obstacle guidance handles tyres.
// Inboard low probes enter the nose channels.
for(const seed of seeds)if(seed[1]>=.1&&seed[1]<.4&&Math.abs(seed[0])<=.57)seed[0]*=.65;
// Longitudinal probes on both sides of the plank, within the floor channels.
for(const side of [-1,1])for(const x of [.29,.46,.64])seeds.push([side*x,.065,3.85]);
// Synthetic fallback only: production uses the model distance field without
// stacking a second, oversized ellipsoid displacement envelope.
export const bodies=[
 [0,.38,1.12,.25,.27,1.28],[0,.50,-.42,.62,.48,1.38],
 ...[-1,1].flatMap(side=>[-1.69,1.69].map(z=>[side*.77,.35,z,.22,.35,.35]))
];

// Fixed, non-uniform smoke-wand spacing. Never randomize seeds per frame.
seeds.forEach((seed,i)=>{
 if(seed[1]>=.1)return;
 seed[0]+= .018*Math.sin(i*2.399);
 seed[1]=.043+.035*(.5+.5*Math.sin(i*1.73));
 seed[2]+= .16*Math.sin(i*2.17);
});
