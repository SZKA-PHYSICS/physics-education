import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const files = ['index.html','about.html','sources.html','fiziknama.html','learning-path.html','curriculum.html'];
let failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

for(const page of files){
 check(fs.existsSync(path.join(root,page)),`Missing page: ${page}`);
 if(!fs.existsSync(path.join(root,page)))continue;
 const content=read(page);
 check(/<html\b[^>]*lang=["']fa["']/i.test(content),`${page}: language is not fa`);
 check(/<html\b[^>]*dir=["']rtl["']/i.test(content),`${page}: layout is not RTL`);
 for(const [,link] of content.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)){
  if(link.startsWith('#')||/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(link))continue;
  const clean=decodeURIComponent(link.split('#')[0].split('?')[0]);
  if(!clean||clean.startsWith('/')||clean.includes('${'))continue; // runtime-generated HTML links are not static paths
  check(fs.existsSync(path.resolve(root,path.dirname(page),clean)),`${page}: broken relative link ${link}`);
 }
}
const app=read('fiziknama.html');
const match=app.match(/const MODULES = \[[\s\S]*?\n\];/);
check(Boolean(match),'Could not locate self-contained course catalogue');
if(match){
 const mods=vm.runInNewContext(match[0]+'\nMODULES',Object.create(null),{timeout:4000});
 check(mods.length===14,`Expected 14 modules; found ${mods.length}`);
 check(new Set(mods.map(m=>m.id)).size===mods.length,'Duplicate lesson IDs');
 let count=0;
 for(const m of mods){
  check(m.qs?.length===4,`Lesson ${m.id} must include 4 formative questions`);
  count+=m.qs?.length||0;
  check(read('learning-path.html').includes('fiziknama.html#lesson-'+m.id),`Missing pathway for ${m.id}`);
 }
 check(count===56,`Expected 56 formative questions; found ${count}`);
 console.log(`Checked ${mods.length} models, ${count} questions, lesson links, and ${files.length} HTML pages.`);
}

const datasetFile='data/curriculum-data.js';
check(fs.existsSync(path.join(root,datasetFile)),'Missing curriculum dataset');
if(fs.existsSync(path.join(root,datasetFile))){
 const dataSource=read(datasetFile);
 const ctx={window:{}};
 try{
  vm.runInNewContext(dataSource,ctx,{timeout:5000,filename:datasetFile});
  const u=ctx.window.FIZIKNAMA_CURRICULUM?.units;
  check(Array.isArray(u)&&u.length===33,'Expected 33 new grade-mapped learning units');
  if(Array.isArray(u)){
   const idset=new Set(u.map(x=>x.id));
   check(idset.size===u.length,'Duplicate curriculum IDs');
   for(const g of [7,8,9,10,11,12])check(u.some(x=>x.grade===g),'No entries for grade '+g);
   for(const item of u){
    for(const key of ['title','core','deeper','chapter','branch','eq','worked','explore','warning','sim']){
     check(typeof item[key]==='string'&&item[key].trim().length>5,`Bad ${key} in ${item.id}`);
    }
    check(item.quiz?.opts?.length===3,`Incorrect choice count in ${item.id}`);
    check(Number.isInteger(item.quiz?.answer)&&item.quiz.answer>=0&&item.quiz.answer<3,`Missing correct option for ${item.id}`);
    check(item.quiz?.q?.length>12&&item.quiz?.why?.length>12,`Missing teaching feedback in ${item.id}`);
    check(read('curriculum.html').includes('data/curriculum-data.js'),'Curriculum page is not linked to its data file');
    check(read('docs/CURRICULUM_ALIGNMENT.md').includes('curriculum.html#'+item.id),'Missing traceability for '+item.id);
   }
   if(match){
    const mods=vm.runInNewContext(match[0]+'\nMODULES',Object.create(null),{timeout:4000});
    for(const item of u)check(mods.some(m=>m.id===item.sim),`Unknown simulation id in ${item.id}: ${item.sim}`);
   }
   console.log(`Validated 33 grade-mapped lessons and their teaching, assessment, and simulation connections.`);
  }
  for(const script of read('curriculum.html').matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)){
   if(script[1].trim())new vm.Script(script[1],{filename:'curriculum-inline.js'});
  }
 }catch(err){failures.push('Curriculum JS parsing failed: '+err.message)}
}

if(failures.length){for(const e of failures)console.error('FAIL:',e);process.exitCode=1}
else console.log('Static validation PASSED');
