import {build} from 'esbuild';
const result=await build({entryPoints:['tests/circuits.ts'],bundle:true,platform:'node',format:'esm',write:false});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text+'\n//# sourceURL=circuit-regression.mjs').toString('base64'));
