import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const files = ['index.html','about.html','sources.html','fiziknama.html','learning-path.html','curriculum.html','practice.html','labs-plus.html'];
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
     const minLength=key==='branch'?1:(key==='sim'?2:(key==='eq'?2:5));
     check(typeof item[key]==='string'&&item[key].trim().length>minLength,`Bad ${key} in ${item.id}`);
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


const loadGlobal=(file,key)=>{
 const ctx={window:{}};
 try{vm.runInNewContext(read(file),ctx,{timeout:5000,filename:file})}
 catch(e){check(false,file+': runtime parse: '+e.message);return null}
 return ctx.window[key];
};
const advanced=loadGlobal('data/advanced-content.js','FIZIKNAMA_ADVANCED');
const labs=loadGlobal('data/special-labs-data.js','FIZIKNAMA_LABS');
if(advanced){
 check(advanced.version==='1.2.0','Advanced content version mismatch');
 check(advanced.problems.length===33,'Expected 33 multi-stage problems');
 check(Object.keys(advanced.units).length===33,'Expected 33 subtopic groups');
 const unique=new Set();
 let total=0;
 for(const p of advanced.problems){
  check(!unique.has(p.id),'Duplicate exercise '+p.id);unique.add(p.id);
  check(advanced.units[p.id]?.length===3,'Need 3 well-defined subtopics in '+p.id);
  check(p.steps.length>=2,'Problem needs multiple steps: '+p.id);
  check(p.scenario.length>=30&&p.scope.length>=20,'No statement/assumptions: '+p.id);
  for(const m of advanced.units[p.id]||[]){
   check(m.title?.length>=5&&m.text?.length>=18,'Weak microtopic in '+p.id);
  }
  for(const st of p.steps){
   check(st.ask?.length>10&&st.hint?.length>=5&&st.why?.length>=5,'Missing pedagogical feedback in '+p.id);
   check(Number.isFinite(st.answer)&&Number.isFinite(st.tolerance)&&st.tolerance>0,'Bad numeric answer/tolerance in '+p.id);
   total++;
  }
  check(read('curriculum.html').includes('advanced-content.js'),'Curriculum missing advanced JS');
  check(read('practice.html').includes('advanced-content.js'),'Practice page missing advanced JS');
 }
 check(total===67,'Expected 67 linked numerical checkpoints, got '+total);
 console.log('Validated 99 microtopics, 33 multiple-stage tasks, '+total+' numeric steps.');
}
if(labs){
 check(labs.length===16,'Expected 16 specialist labs');
 const ids=new Set();
 for(const lab of labs){
  check(!ids.has(lab.id),'Duplicate lab '+lab.id);ids.add(lab.id);
  check(lab.assumption.length>=35&&lab.description.length>=35,'Missing model scope for '+lab.id);
  check(lab.params?.length>=2,'Too few variable controls for '+lab.id);
  for(const [key,label,min,max,step,start] of lab.params||[]){
   check(typeof key==='string'&&typeof label==='string','Invalid control: '+lab.id);
   check(Number.isFinite(min)&&Number.isFinite(max)&&Number.isFinite(step)&&Number.isFinite(start)&&max>min&&step>0&&start>=min&&start<=max,'Bad slider bounds in '+lab.id);
  }
 }
 if(advanced)for(const p of advanced.problems)check(ids.has(p.lab)||p.lab==='reflection'||p.lab==='pressure'||p.lab==='gravity'||p.lab==='motion'||p.lab==='forces'||p.lab==='energy'||p.lab==='waves'||p.lab==='nuclear','No lab route for problem '+p.id);
 console.log('Validated 16 specialist labs and parameter constraints.');
}
for(const page of ['curriculum.html','practice.html','labs-plus.html']){
 const html=read(page);
 const tags=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const [i,m] of tags.entries())if(m[1].trim()){
   try{new vm.Script(m[1],{filename:page+'#script-'+i})}
   catch(e){check(false,'Invalid embedded JavaScript '+page+': '+e.stack)}
 }
}
try{
 const src=read('labs-plus.html');
 const st=src.indexOf('function calc(id,p){');
 const en=src.indexOf('const t=',st);
 check(st>0&&en>st,'Cannot isolate numeric lab models');
 if(st>0&&en>st){
  const format=x=>String(Math.round(x*1000000)/1000000);
  const calc=vm.runInNewContext(src.slice(st,en)+'\ncalc',{fmt:format,Math,Number},{timeout:5000});
  const approximate=(got,expected,label)=>check(Math.abs(Number.parseFloat(got)-expected)<Math.max(0.005,Math.abs(expected)*0.01),label+' expected '+expected+', got '+got);
  approximate(calc('coulomb',{q1:2,q2:3,r:0.3})[0][1],0.6,'Coulomb force');
  approximate(calc('buoyancy',{rho:1000,v:2,mass:1.5})[0][1],19.6,'Archimedes force');
  approximate(calc('induction',{n:100,flux:4,t:.2})[0][1],2,'Faraday EMF');
  approximate(calc('capacitor',{area:100,gap:1,eps:1,v:20})[0][1],88.54187817,'Parallel-plate capacitance');
  approximate(calc('pendulum',{length:1,g:9.8})[0][1],2.00709,'Pendulum period');
  approximate(calc('photoelectric',{f:8,phi:2.3})[1][1],1.008534,'Photoelectric electron energy');
  check(calc('refraction',{n1:1.5,n2:1,angle:60})[1][1]==='بازتاب کلی داخلی','Missing total internal reflection');
  check(calc('lorentz',{q:2,v:2,b:.5,angle:0})[0][1].startsWith('0 '),'Force parallel to magnetic field not zero');
  console.log('Validated numeric fixtures for Coulomb, buoyancy, induction, capacitor, pendulum, photoelectric, refraction and Lorentz.');
 }
}catch(e){check(false,'Physics fixture failed: '+e.message)}

if(failures.length){for(const e of failures)console.error('FAIL:',e);process.exitCode=1}
else console.log('Static validation PASSED');
