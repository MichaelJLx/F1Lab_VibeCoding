import {build} from 'esbuild';
const result=await build({entryPoints:['tests/learning/learning.ts'],bundle:true,platform:'node',format:'esm',write:false});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text+'\n//# sourceURL=learning-tests.mjs').toString('base64'));
