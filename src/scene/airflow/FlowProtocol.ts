export type FlowPart={positions:Float32Array;indices:Uint32Array|null;matrix:number[]};
export type FlowState={speed:number;opening:number;beta:number;frontGap:number;rearGap:number;steer:number;yawRate?:number;time?:number;poses:number[][];axes:number[][];matrices:number[][];toChassis?:number[]};
export type FlowBuffers={positions:Float32Array;directions:Float32Array;frames:Float32Array;transit:Float32Array;ratios:Float32Array};
export type FlowRequest={type:'init';parts:FlowPart[];shapes:number[][];clearance?:Float32Array;distance?:Int16Array}|{type:'step';state:FlowState;buffers:FlowBuffers};
export type FlowResult=FlowBuffers&{solveMs:number};
