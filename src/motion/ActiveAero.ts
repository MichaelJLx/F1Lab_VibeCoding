// Engineering estimates for the current model at full straight-mode travel.
export const activeAero={dragReduction:.17,downforceReduction:.23,frontBalanceChange:.015};
export function straightModeZone(s:number,length:number){
  const turns=[6637,238,1127,5073,5982];
  const after=[190,140,60,140,80],end=[145,835,2150,5700,6480];
  for(let i=0;i<turns.length;i++){
    const start=turns[i]+after[i]*length/7004;
    if(start>end[i] ? s>=start || s<end[i] : s>=start && s<end[i])return i+1;
  }
  return 0;
}
