/* Opt-in, local-only experiment. Native selects remain the authoritative state. */
(() => {
  const toggle=document.getElementById('fair-sdk-toggle');
  const status=document.getElementById('fair-sdk-status');
  if(!toggle||!status)return;
  const specs=[['fair-character','対戦互角MR キャラクター'],['fair-act','対戦互角MR ACT'],['fair-window','対戦互角MR 集計窓']];
  const controls=new Map();
  let sdk,agent,active=false,busy=false,registration=null,registered=[];
  const usable=()=>active&&!document.getElementById('analysis-fairmr').closest('[hidden]');
  const options=native=>[...native.options].filter(o=>o.value&&!o.disabled).map(o=>({value:o.value,label:o.label}));
  const allowed=(native,value)=>typeof value==='string'&&options(native).some(o=>o.value===value);
  const assertActive=()=>{if(!usable())throw new Error('対戦互角MRの試験版を表示してください。');};
  function sync(){
    if(!active)return;
    for(const {native,select,signature:old} of controls.values()){
      const items=options(native),signature=JSON.stringify(items);
      if(old!==signature){select.items=items;controls.get(native.id).signature=signature;}
      select.disabled=native.disabled||!items.length;
      const value=allowed(native,native.value)?native.value:null;
      if(select.value!==value)select.value=value;
    }
  }
  function mount(id,label){
    if(controls.has(id))return;
    const native=document.getElementById(id),original=native.closest('label');
    const wrap=document.createElement('div');wrap.className='fair-sdk-control';
    const select=document.createElement('ui-select');
    select.setAttribute('placeholder','対象データなし');
    select.innerHTML='<ui-select-label></ui-select-label><ui-select-trigger><button type="button"><ui-select-value></ui-select-value></button></ui-select-trigger><ui-select-content><ui-select-list></ui-select-list></ui-select-content>';
    select.querySelector('ui-select-label').textContent=label;
    select.addEventListener('valuechange',event=>{
      const value=event.detail?.value;
      if(!usable()||!allowed(native,value)){event.preventDefault();return;}
      if(native.value!==value){
        native.value=value;
        native.dispatchEvent(new Event('change',{bubbles:true}));
      }
      // The SDK commits after valuechange; synchronize once that commit completes.
      queueMicrotask(sync);
    });
    wrap.append(select);original.after(wrap);
    controls.set(id,{native,original,wrap,select,signature:null});
  }
  const bridge=Object.freeze({
    status:()=>({active,visible:usable(),webMCP:registered.length,version:'0.1.0-beta.3'}),
    snapshot:()=>{assertActive();return agent.snapshot().filter(x=>specs.some(([,label])=>x.label===label)&&!x.offPage);},
    query:async input=>{
      assertActive();
      const visible=bridge.snapshot();
      const refs=new Set(visible.map(x=>x.ref));
      if(input?.within&&!visible.some(x=>x.ref===input.within||x.label===input.within))
        return {error:'対象外の選択メニューです。'};
      const result=await agent.query(input??{});
      return Array.isArray(result)?result.filter(x=>refs.has(x.ref)):result;
    },
    act:async input=>{
      assertActive();
      if(!Array.isArray(input?.steps)||input.steps.length>12)throw new Error('最大12件の選択操作のみ対応。');
      const result=await agent.act(input);sync();return result;
    },
    report:()=>{assertActive();return window.SF6FairRatingUI.getPilotReport();}
  });
  window.SF6FairSDK=bridge;
  function unregister(){
    registration?.abort();
    for(const name of registered){
      try{Promise.resolve(document.modelContext?.unregisterTool?.(name)).catch(()=>{});}catch{}
    }
    registration=null;registered=[];
  }
  async function exposeTools(){
    const context=document.modelContext;
    if(typeof context?.registerTool!=='function')return 'WebMCP非対応 · 内部ブリッジ利用可';
    registration=new AbortController();
    const definitions=[...sdk.agentTools.map(t=>({...t,name:'sf6_fair_'+t.name,execute:input=>bridge[t.name](input)})),
      {name:'sf6_fair_report',description:'Read the selected SF6 equal-win MR exploratory aggregate (no match records or player IDs).',
        inputSchema:{type:'object',properties:{}},execute:()=>bridge.report()}];
    try{
      for(const def of definitions){
        await context.registerTool(def,{signal:registration.signal});registered.push(def.name);
      }
      return 'WebMCP 4ツール登録済み';
    }catch(error){unregister();console.warn('SF6 fair SDK WebMCP unavailable',error);return 'WebMCP登録不可 · 内部ブリッジ利用可';}
  }
  function restore(){
    active=false;unregister();
    for(const {original,wrap,select} of controls.values()){
      select.open=false;wrap.hidden=true;original.hidden=false;
    }
    toggle.setAttribute('aria-pressed','false');toggle.textContent='AI操作 試験版を使う';
  }
  toggle.addEventListener('click',async()=>{
    if(busy)return;
    if(active){restore();status.textContent='通常UI · 任意で切替';return;}
    busy=true;toggle.disabled=true;status.textContent='試験版を読み込み中…';
    try{
      sdk??=await import('./vendor/fair-sdk-0.1.0-beta.3.mjs');
      agent??=sdk.createAgent({allow:step=>{
        const id=specs.find(([,label])=>label===step.label)?.[0];
        return !!(usable()&&id&&step.component==='select'&&step.action==='setValue'&&
          step.args.length===1&&allowed(controls.get(id).native,step.args[0]));
      }});
      for(const [id,label] of specs)mount(id,label);
      active=true;sync();
      for(const {original,wrap} of controls.values()){original.hidden=true;wrap.hidden=false;}
      toggle.setAttribute('aria-pressed','true');toggle.textContent='通常UIに戻す';
      status.textContent='試験版 · '+await exposeTools();
    }catch(error){restore();status.textContent='試験版を読み込めません · 通常UIを使用中';console.warn('SF6 fair SDK pilot',error);}
    finally{busy=false;toggle.disabled=false;}
  });
  window.addEventListener('sf6-fair-rating-updated',sync);
})();
