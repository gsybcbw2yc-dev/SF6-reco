/* SF6-reco navigation: view organization only; data collectors and filters are unchanged. */
(function(){
  'use strict';
  const views=['overview','matches','analysis','system'];
  const analysisViews=['deep','timeofday','velocity'];
  function toggle(tabName,ids,selector,prefix){
    if(!ids.includes(tabName))return;
    const buttons=[...document.querySelectorAll(selector)];
    for(const b of buttons){
      const selected=b.dataset[prefix==='view-'?'navView':'analysisView']===tabName;
      b.classList.toggle('active',selected);
      b.setAttribute('aria-selected',String(selected));
      b.tabIndex=selected?0:-1;
    }
    for(const id of ids){
      const section=document.getElementById(prefix+id);
      if(section)section.hidden=id!==tabName;
    }
  }
  const mainButtons=[...document.querySelectorAll('[data-nav-view]')];
  const analysisButtons=[...document.querySelectorAll('[data-analysis-view]')];
  function activateView(name,scroll=false){
    toggle(name,views,'[data-nav-view]','view-');
    if(scroll&&typeof window.scrollTo==='function')window.scrollTo(0,0);
  }
  function activateAnalysis(name){
    toggle(name,analysisViews,'[data-analysis-view]','analysis-');
  }
  function bind(buttons,attribute,handler){
    for(const [i,button] of buttons.entries()){
      button.addEventListener('click',()=>handler(button.dataset[attribute],true));
      button.addEventListener('keydown',event=>{
        let next;
        if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%buttons.length;
        else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i-1+buttons.length)%buttons.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=buttons.length-1;
        else return;
        event.preventDefault();
        buttons[next].focus();
        handler(buttons[next].dataset[attribute],false);
      });
    }
  }
  bind(mainButtons,'navView',activateView);
  bind(analysisButtons,'analysisView',activateAnalysis);
  activateView('overview');
  activateAnalysis('deep');
})();
