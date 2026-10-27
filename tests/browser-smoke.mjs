import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:8765/';
const dir='qa-screenshots';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let failures=[];
const check=(condition,label)=>{if(!condition)failures.push(label)};
const routes=[
 ['index.html','home'],['curriculum.html','curriculum'],
 ['fiziknama.html','fiziknama'],['practice.html','practice'],
 ['labs-plus.html','labs'],['learning-path.html','learning'],
 ['about.html','about'],['sources.html','sources']
];
for(const config of [{w:1440,h:900,name:'desktop'},{w:390,h:844,name:'mobile'}]){
 for(const [route,key] of routes){
  const context=await browser.newContext({viewport:{width:config.w,height:config.h},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  try{
   const resp=await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForTimeout(250);
   check(resp?.status()===200,route+' '+config.name+' HTTP status');
   check((await page.title()).trim().length>12,route+' '+config.name+' missing title');
   const info=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,window:innerWidth,body:document.body.scrollWidth,
    font:getComputedStyle(document.body).fontFamily,
    header:document.querySelector('header.science-header')?.getBoundingClientRect().height||0
   }));
   check(info.width<=info.window+5,route+' '+config.name+' horizontal overflow '+info.width+'>'+info.window);
   check(info.font.includes('Vazirmatn'),route+' '+config.name+' wrong type system');
   if(key!=='fiziknama')check(info.header>=55,route+' '+config.name+' no platform header');
   if(key==='home'){
    check(await page.locator('#home-main-title').isVisible(),'Home title missing');
    const before=(await page.locator('#home-pressure').textContent()).trim();
    await page.locator('#depthRange').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}))});
    const after=(await page.locator('#home-pressure').textContent()).trim();
    check(before!==after,'Home pressure slider does not update');
    check(after==='۲۹٫۴'||after==='۲۹.۴','Home water pressure wrong at 3m: '+after);
    check(await page.locator('.home-platform-card').count()===3,'Home platform taxonomy missing');
    const illustrationStatus=await page.locator('.showcase-scene img').evaluateAll(imgs=>imgs.map(img=>({src:img.getAttribute('src'),ok:img.complete&&img.naturalWidth>0,alt:img.getAttribute('alt')||''})));
    check(illustrationStatus.length===4,'Expected four illustrated 3D physics experiment scenes');
    for(const img of illustrationStatus){check(img.ok,'Experiment scene missing: '+img.src);check(img.alt.length>20,'Weak illustration alt text '+img.src)}
    const capabilityStatus=await page.locator('.showcase-tool').evaluateAll((els)=>els.map(el=>({name:el.textContent.trim(),top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)})));
    check(capabilityStatus.length===4,'Expected four core platform capabilities on the homepage');
    if(config.name==='mobile'){
     for(const tile of capabilityStatus){
      check(tile.visible&&tile.bottom<=config.h+3,'Main mobile feature not visible in first screen: '+tile.name+' bottom '+tile.bottom+' viewport '+config.h);
     }
     const gallery=await page.locator('.showcase-gallery').boundingBox();
     check(!!gallery&&(gallery.y+gallery.height)<config.h-80,'3D experiment gallery extends too far below mobile viewport: '+JSON.stringify(gallery));
    }
   }
   if(key==='curriculum')check(await page.locator('.unit').count()===33,route+' missing 33 lessons');
   if(key==='labs'){
    const first=page.locator('.controls input[type=range]').first();
    const output=await page.locator('#metrics').textContent();
    await first.evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}))});
    const after=await page.locator('#metrics').textContent();
    check(output!==after,'Special lab slider did not recompute');
    check(await page.locator('#labList .pick').count()===16,'Missing specialist labs');
   }
   if(key==='practice')check(await page.locator('#problemList .pick').count()===33,'Missing problem list');
   if(key==='fiziknama')check(await page.locator('#mainContent').count()===1,'Fiziknama shell missing');
   check(errors.length===0,route+' '+config.name+' JavaScript errors '+errors.join('; ').slice(0,450));
   if(['home','curriculum','labs','fiziknama'].includes(key)){
    const name=key+'-'+config.name+'.png';
    await page.screenshot({path:dir+'/'+name,fullPage:key==='home',animations:'disabled'});
   }
   console.log('PASS/SCAN',route,config.name,JSON.stringify(info));
  }catch(e){failures.push(route+' '+config.name+': '+e.stack)}
  finally{await context.close()}
 }
}
await browser.close();
if(failures.length){for(const fail of failures)console.error('FAIL',fail);process.exitCode=1}
else console.log('Browser visual and functionality smoke tests PASSED for all eight pages at desktop and mobile sizes.');
