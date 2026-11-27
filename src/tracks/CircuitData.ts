export type CornerGroup={turn:number;last:number;start:number;end:number};
export type Window=[number,number];
export interface CircuitData{
 schemaVersion:1;display:{region:string;name:string};raceLaps:number;sources:string[];id:string;name:string;shortName:string;geometryLength:number;officialLength:number;kerbStripeLength:number;
 /** Metric source coordinates: Y is elevation; S is distance along the closed loop. */
 nodes:{s:number;x:number;y:number;z:number;widthLeft:number;widthRight:number;bankAngle?:number}[];
 grid:{s:number;lateral:number;rows:number;stagger:number;boxWidth:number};
 kerbs:{start:number;end:number;stations:number[];side:number;width:number;innerHeight:number;outerHeight:number;taper:{minimum:number;distance:number}|null}[];
 pit:{entry:number;exit:number;limitEntry:number;limitExit:number;speedLimit:number;halfWidth:number;exitBlendStart:number;exitEnd:number;
 /** Metre-spaced points in the track's local frame, starting at entry. */
 points:number[][];surfacePoints:number[][];box:{station:number;length:number};surfaceStart:number;
 approach:{kind:'junction'|'blend';distance?:number;blendIn?:Window;blendOut?:Window};
 edge:{orientation:'fixed'|'toward-track';start?:Window;end?:Window;narrowing?:number}};
 driving:{turns:number[];turnNames:string[];splits:number[];groups:CornerGroup[];zones:{start:number;end:number}[];cameraStations:number[];brakeApproaches:number[];reviewSections:{name:string;start:number;end:number}[];speedCaps:{start:number;end:number;multiplier:number;offset:number}[];lookTransitions:{start:Window;end:Window}[];memoryKey:string};
 /** Optional measured/reference line corrections; the same fields work on any circuit. */
 reference?:{raceOffsets:number[];lineOffsets:number[];fastOffsets:number[];speed:{s:number;speed:number}[];fairingRange:Window;shiftRange:Window;hairpin:{start:number;end:number;apex:number;turn:number;side:number};pairedTurns:Window;smoothing:{section:number;reserve:number;transit:number;transitFade:number;linked:number;pair:number}[]};
}
