// Read-only source checks. Writes only a non-sensitive audit report.
// No environment/credential reads, SQL connections, npm install or app mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const skip=new Set(['node_modules','.git','private','artifacts','coverage','__pycache__','screenshots']);
const vendor=new Set(['tabler.min.js','lucide.min.js']);
const report={generatedAt:new Date().toISOString(),scope:'SOURCE_SYNTAX_AND_REFERENCES_NOT_SQL_INTEGRATION',syntax:[],html:[],json:[],excludedVendor:[],sqlExecuted:false};
async function walk(dir){const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(skip.has(e.name)||e.isSymbolicLink())continue;
  const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(e.isFile())files.push(p);}return files;}
const files=[];for(const dir of ['backend/src','backend/tests','js','tools','deploy','database'])files.push(...await walk(path.join(root,dir)));
for(const p of files){const relative=path.relative(root,p).replaceAll('\\','/');
  if(/\.(mjs|js)$/.test(p)){if(vendor.has(path.basename(p))){report.excludedVendor.push(relative);continue;}
    const result=spawnSync(process.execPath,['--check',p],{windowsHide:true,timeout:15000,stdio:'ignore'});
    report.syntax.push({file:relative,passed:result.status===0});}
  if(p.endsWith('.json')&&!p.endsWith('.local.json')&&!path.basename(p).startsWith('.env')){
    try{JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));report.json.push({file:relative,passed:true});}
    catch{report.json.push({file:relative,passed:false});}}
}
for(const e of await fs.readdir(root,{withFileTypes:true})){if(!e.isFile()||!e.name.endsWith('.html'))continue;
  const html=await fs.readFile(path.join(root,e.name),'utf8'),missing=[];
  const refs=[...html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
  for(const ref of refs){if(/^(?:https?:|data:|#|\/\/)/i.test(ref))continue;
    let full;try{full=path.resolve(root,decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\//,''));
      if(!full.startsWith(root))throw new Error();await fs.access(full);}catch{missing.push(ref.split(/[?#]/)[0]);}}
  report.html.push({file:e.name,assetReferences:refs.length,missing,passed:missing.length===0,
    demoScripts:/js\/(?:store|data|app|reception|housekeeping)\.js/.test(html)});
}
report.summary={jsChecked:report.syntax.length,jsFailed:report.syntax.filter(x=>!x.passed).length,
  htmlChecked:report.html.length,htmlFailed:report.html.filter(x=>!x.passed).length,jsonChecked:report.json.length,jsonFailed:report.json.filter(x=>!x.passed).length};
const destination=path.join(root,'screenshots','audit');await fs.mkdir(destination,{recursive:true});
await fs.writeFile(path.join(destination,'source-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));if(Object.entries(report.summary).some(([k,v])=>k.endsWith('Failed')&&v))process.exitCode=1;
