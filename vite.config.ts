import {defineConfig,normalizePath,type Plugin} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
// Runtime code may load only the standardized single-file circuit payloads.
function circuitRuntimeOnly():Plugin {
 const directory=normalizePath(path.resolve('circuits'))+'/';
 return {
  name:'circuit-runtime-only',enforce:'pre',apply:'build',
  load(id){
   const file=normalizePath(id.split('?')[0]);
   if(file.startsWith(directory)&&!/^[-a-z0-9]+\/circuit\.json$/.test(file.slice(directory.length))){
    this.error(`Circuit reference material cannot enter the runtime bundle: ${file}`);
   }
  }
 };
}
export default defineConfig({build:{manifest:true},worker:{format:'es',plugins:()=>[circuitRuntimeOnly()]},plugins:[circuitRuntimeOnly(),{name:'local-model-preview',configureServer(server){server.middlewares.use('/__model-preview',(req,res,next)=>{if(req.method!=='POST')return next();const chunks:Buffer[]=[];let length=0;req.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>8*1024*1024){res.statusCode=413;res.end();req.destroy();return;}chunks.push(chunk);});req.on('end',async()=>{try{const bytes=Buffer.concat(chunks);if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){res.statusCode=400;res.end();return;}const folder=path.resolve('artifacts/previews');await mkdir(folder,{recursive:true});const file=`rb22-${Date.now()}.png`;await writeFile(path.join(folder,file),bytes);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:file}));}catch{res.statusCode=500;res.end();}});});}}]});
