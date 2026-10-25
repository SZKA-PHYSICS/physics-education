import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const files = ['index.html','about.html','sources.html','fiziknama.html','learning-path.html'];
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
if(failures.length){for(const e of failures)console.error('FAIL:',e);process.exitCode=1}
else console.log('Static validation PASSED');
