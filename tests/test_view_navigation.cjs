const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
class Node {
 constructor(id='',dataset={}){
  this.id=id;this.dataset=dataset;this.hidden=false;this.tabIndex=0;
  this.attrs={};this.active=false;this.handlers=new Map();
  this.classList={toggle:(name,active)=>{if(name==='active')this.active=active;}};
 }
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(type,cb){this.handlers.set(type,cb);}
 click(){this.handlers.get('click')?.({});}
 focus(){this.focused=true;}
 key(key){
   let prevented=false;
   this.handlers.get('keydown')?.({key,preventDefault(){prevented=true;}});
   return prevented;
 }
}
const ids=['overview','matches','analysis','system'],analyses=['deep','timeofday','velocity'];
const views=Object.fromEntries(ids.map(x=>['view-'+x,new Node('view-'+x)]));
const panels=Object.fromEntries(analyses.map(x=>['analysis-'+x,new Node('analysis-'+x)]));
const navs=ids.map(x=>new Node('',{navView:x})),
      tabs=analyses.map(x=>new Node('',{analysisView:x}));
const document={
 querySelectorAll(selector){
  if(selector==='[data-nav-view]')return navs;
  if(selector==='[data-analysis-view]')return tabs;
  return [];
 },
 getElementById(id){return views[id]||panels[id]||null;}
};
const window={scrollTo(){window.scrolled=(window.scrolled||0)+1;}};
vm.runInNewContext(fs.readFileSync('web/view-navigation.js','utf8'),{document,window});
const isCurrent=(nodes,id)=>nodes.every(n=>n.active===(n.dataset.navView===id||n.dataset.analysisView===id));
assert.equal(isCurrent(navs,'overview'),true);
assert.equal(views['view-overview'].hidden,false);
assert.equal(views['view-analysis'].hidden,true);
navs[2].click();assert.equal(isCurrent(navs,'analysis'),true);
assert.equal(views['view-analysis'].hidden,false);
assert.equal(views['view-overview'].hidden,true);
assert.ok(window.scrolled>0);
tabs[1].click();assert.equal(isCurrent(tabs,'timeofday'),true);
assert.equal(panels['analysis-timeofday'].hidden,false);
assert.equal(panels['analysis-deep'].hidden,true);
const prevented=tabs[1].key('ArrowRight');assert.equal(prevented,true);
assert.equal(tabs[2].focused,true);
assert.equal(panels['analysis-velocity'].hidden,false);
navs[3].click();assert.equal(views['view-system'].hidden,false);
assert.equal(panels['analysis-velocity'].hidden,false); // preserve inner tab when leaving analytics
navs[2].click();assert.equal(panels['analysis-velocity'].hidden,false);
assert.equal(navs.filter(x=>x.active).length,1);
assert.equal(tabs.filter(x=>x.active).length,1);
console.log('Responsive view navigation, keyboard, tab preservation tests passed');
