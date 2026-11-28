export type TyreCompound='soft'|'medium'|'hard';
// Relative dry-compound tuning. Soft retains the existing baseline physics.
export const tyreCompounds={
 soft:{label:'软胎',color:'#ed3446',grip:1,wear:1},
 medium:{label:'中性胎',color:'#f5ce36',grip:.97,wear:.72},
 hard:{label:'硬胎',color:'#f0f1ed',grip:.94,wear:.5},
} as const;
export const nextCompound=(compound:TyreCompound):TyreCompound=>compound==='soft'?'medium':compound==='medium'?'hard':'soft';
