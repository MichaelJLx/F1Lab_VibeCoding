import {build} from 'esbuild';
const result=await build({entryPoints:[process.argv.includes('--bus-stop')?'tests/bus-stop.ts':'tests/spa-lap.ts'],bundle:true,platform:'node',format:'esm',write:false});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
