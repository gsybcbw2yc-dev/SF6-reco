/* Opt-in, local-only SDK controls. Existing native inputs and render logic remain authoritative. */
(()=>{
  const $=id=>document.getElementById(id),toggle=$('dashboard-sdk-toggle'),status=$('dashboard-sdk-status');
  if(!toggle||!status)return;
  const specs={character:'概要 キャラクター',phase:'概要 ACT','match-period':'対戦履歴 期間','match-mode':'対戦履歴 モード','match-character':'対戦履歴 自分のキャラ','match-own-control':'対戦履歴 自分の操作','match-opponent-control':'対戦履歴 相手の操作','session-gap':'セッション 分割間隔','matchup-order':'キャラ相性 並び順','time-bucket':'時間帯 集計幅','fair-character':'対戦互角MR キャラクター','fair-act':'対戦互角MR ACT','fair-window':'対戦互角MR 集計窓','improve-opponent':'改善試算 対策キャラ','improve-target':'改善試算 目標勝率','improve-horizon':'改善試算 総試合数'};
  const groups={view:['nav-view',['overview','matches','analysis','system']],matches:['match-tab',['history','sessions','matchups']],analysis:['analysis-view',['deep','timeofday','velocity','fairmr']],deep:['deep-tab',['streak','rating','position','recent','rematch']],range:['range',['7','30','90','all']],window:['window',['30','60','180','1440']]};
  const controls=new Map();let sdk,agent,active=false,busy=false,registration=null,registered=[];
  const options=e=>[...e.options].filter(o=>o.value&&!o.disabled).map(o=>({value:o.value,label:o.label}));
  const allowed=(e,value)=>typeof value==='string'&&options(e).some(o=>o.value===value);
  const visible=e=>!!e&&!e.closest('[hidden]')&&(!e.closest('details')||e.closest('details').open);
  const requireActive=()=>{if(!active)throw Error('AI操作を有効にしてください。');};
  const activeButton=(name)=>{const [attr]=groups[name];return document.querySelector(`[data-${attr}].active`)?.getAttribute(`data-${attr}`)||null;};
  function sync(){
    if(!active)return;
    for(const c of controls.values()){
      const items=options(c.native),signature=JSON.stringify(items);
      if(c.signature!==signature){c.select.items=items;c.signature=signature;}
      c.select.disabled=c.native.disabled||!items.length;
      const value=allowed(c.native,c.native.value)?c.native.value:null;
      if(c.select.value!==value)c.select.value=value;
    }
  }
  function mount(id,label){
    if(controls.has(id))return;
    const native=$(id),original=native?.closest('label');if(!original)return;
    const wrap=document.createElement('div');wrap.className='fair-sdk-control dashboard-sdk-control';wrap.hidden=true;
    const select=document.createElement('ui-select');select.setAttribute('placeholder','対象データなし');
    select.innerHTML='<ui-select-label></ui-select-label><ui-select-trigger><button type="button"><ui-select-value></ui-select-value></button></ui-select-trigger><ui-select-content><ui-select-list></ui-select-list></ui-select-content>';
    select.querySelector('ui-select-label').textContent=label;
    select.addEventListener('valuechange',event=>{
      const value=event.detail?.value;
      if(!active||!visible(wrap)||!allowed(native,value)){event.preventDefault();return;}
      if(native.value!==value){native.value=value;native.dispatchEvent(new Event('change',{bubbles:true}));}
      queueMicrotask(sync);
    });
    wrap.append(select);original.after(wrap);
    controls.set(id,{native,original,wrap,select,signature:null});
    new MutationObserver(()=>queueMicrotask(sync)).observe(native,{childList:true,subtree:true,attributes:true,characterData:true});
  }
  const selection=()=>Object.fromEntries(Object.keys(groups).map(k=>[k,activeButton(k)]));
  function snapshot(){requireActive();sync();return agent.snapshot().filter(x=>!x.offPage&&[...controls.values()].some(c=>visible(c.wrap)&&x.label===specs[c.native.id]));}
  function navigate({group,value}={}){
    requireActive();const g=Object.hasOwn(groups,group)?groups[group]:null;
    if(!g||!g[1].includes(value))throw Error('未対応の画面・値です。');
    const el=document.querySelector(`[data-${g[0]}="${value}"]`);
    if(!visible(el)||el.disabled)throw Error('対象画面を先に表示してください。');
    el.click();sync();return selection();
  }
  async function setFilter({id,value}={}){
    requireActive();const c=controls.get(id);
    if(!c||c.native.disabled||!allowed(c.native,value)||c.wrap.closest('[hidden]'))throw Error('表示可能な選択肢を指定してください。');
    const drawer=c.wrap.closest('details');if(drawer&&!drawer.open)drawer.open=true;
    sync();const component=snapshot().find(x=>x.label===specs[id]);
    if(!component)throw Error('対象の選択メニューが利用できません。');
    const change=await agent.act({steps:[{ref:component.ref,action:'setValue',args:[value]}]});sync();
    return {ok:change.ok&&c.native.value===value,id,value:c.native.value,loading:!!window.matchDashboard?.busy};
  }
  function chartLayer({chart,layer,enabled}={}){
    requireActive();if(!['mr','lp'].includes(chart)||!['observed','average','regression'].includes(layer)||typeof enabled!=='boolean')throw Error('未対応のグラフ設定です。');
    const e=document.querySelector(`[data-chart="${chart}"][data-layer="${layer}"]`);
    if(!visible(e)||e.disabled)throw Error('概要画面を表示してください。');
    if((e.getAttribute('aria-pressed')==='true')!==enabled)e.click();return {chart,layer,enabled:e.getAttribute('aria-pressed')==='true'};
  }
  const read=id=>$(id)?.textContent.trim().slice(0,1500)||null;
  const reads=ids=>Object.fromEntries(ids.map(id=>[id,read(id)]));
  const list=(id,limit=30)=>[...($(id)?.children||[])].slice(0,limit).map(e=>e.innerText?.trim().slice(0,700)||e.textContent.trim().slice(0,700));
  function report(){
    requireActive();const state=selection(),view=state.view;
    const filters=Object.fromEntries([...controls].map(([id,c])=>[id,c.native.value]));
    const result={state,filters,loading:!!window.matchDashboard?.busy};
    if(view==='overview')Object.assign(result,reads(['mr','lp','mr-delta','lp-delta','mr-stats','lp-stats','day','week','trend','samples','last-change','last-check']));
    else if(view==='matches'){
      Object.assign(result,reads(['match-status','match-summary','match-refresh','match-page']));
      if(state.matches==='history')result.matches=list('match-list',20);
      if(state.matches==='sessions'){result.sessions=list('session-list',20);result.comparison=read('session-comparison');}
      if(state.matches==='matchups')result.matchups=list('matchup-list',60);
    }else if(view==='analysis'){
      if(state.analysis==='fairmr'){result.fair=window.SF6FairRatingUI?.getPilotReport();result.improvement=window.SF6ImprovementUI?.report();result.priorities=list('fair-priority-body');result.adjusted=list('fair-adjusted-body');}
      if(state.analysis==='deep')result.metrics=list(`deep-${state.deep}-list`);
      if(state.analysis==='timeofday'){result.hours=list('time-performance-hours',24);result.weekdays=list('time-performance-weekdays',7);result.summary=read('time-performance-status');}
      if(state.analysis==='velocity'){
        const host=$('goal-master-panel')?.hidden?'goal-mr-panel':'goal-master-panel';result.forecast=read(host);result.current=read('goal-forecast-current');result.quality=read(host==='goal-mr-panel'?'goal-forecast-quality':'master-goal-quality');
      }
    }else if(view==='system')Object.assign(result,reads(['health','freshness','coverage','cadence','longest-gap','last-check','phase-note','refresh-state']));
    return result;
  }
  function page({direction}={}){
    requireActive();const id={next:'match-next',previous:'match-prev',moreSessions:'sessions-more'}[direction];
    if(!['next','previous','moreSessions'].includes(direction)||!visible($(id))||$(id).disabled)throw Error('利用可能なページ操作を指定してください。');
    $(id).click();return {page:read('match-page')};
  }
  function state(){requireActive();sync();return {state:selection(),controls:[...controls].filter(([,c])=>!c.wrap.closest('[hidden]')).map(([id,c])=>({id,label:specs[id],value:c.native.value,options:options(c.native),disabled:c.native.disabled})),loading:!!window.matchDashboard?.busy};}
  const bridge=Object.freeze({status:()=>({active,webMCP:registered.length,version:'0.1.0-beta.3'}),state,snapshot,navigate,setFilter,chartLayer,page,report});window.SF6DashboardSDK=bridge;
  const schema=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
  const str={type:'string'};
  function unregister(){registration?.abort();for(const name of registered)try{Promise.resolve(document.modelContext?.unregisterTool?.(name)).catch(()=>{});}catch{}registration=null;registered=[];}
  async function expose(){
    if(typeof document.modelContext?.registerTool!=='function')return 'WebMCP非対応 · SDK操作は利用可能';
    registration=new AbortController();
    const defs=[['state','Read current view and available filter values',schema({}),state],['navigate','Switch dashboard, analysis, match or deep tab, overview range or velocity window',schema({group:{enum:Object.keys(groups)},value:str}),navigate],['set_filter','Set an allowed filter in the current visible view using UI SDK',schema({id:{enum:Object.keys(specs)},value:str}),setFilter],['chart_layer','Change a visible overview chart layer',schema({chart:{enum:['mr','lp']},layer:{enum:['observed','average','regression']},enabled:{type:'boolean'}}),chartLayer],['page','Change displayed match or session page',schema({direction:{enum:['next','previous','moreSessions']}}),page],['report','Read current rendered dashboard results; no player IDs or credentials',schema({}),report]];
    try{for(const [name,description,inputSchema,execute] of defs){const full='sf6_dashboard_'+name;await document.modelContext.registerTool({name:full,description,inputSchema,execute},{signal:registration.signal});registered.push(full);}return `WebMCP ${registered.length}ツール · 全画面対応`;}
    catch(e){unregister();return 'WebMCP登録不可 · SDK操作は利用可能';}
  }
  function restore(){active=false;unregister();for(const c of controls.values()){c.select.open=false;c.wrap.hidden=true;c.original.hidden=false;}toggle.setAttribute('aria-pressed','false');toggle.textContent='AI操作を有効にする';status.textContent='通常UI';}
  toggle.addEventListener('click',async()=>{
    if(busy)return;if(active){restore();return;}busy=true;toggle.disabled=true;status.textContent='読み込み中…';
    try{
      sdk??=await import('./vendor/fair-sdk-0.1.0-beta.3.mjs');
      agent??=sdk.createAgent({allow:step=>{const id=Object.keys(specs).find(k=>specs[k]===step.label),c=controls.get(id);return !!(active&&c&&visible(c.wrap)&&step.component==='select'&&step.action==='setValue'&&step.args.length===1&&allowed(c.native,step.args[0]));}});
      Object.entries(specs).forEach(([id,label])=>mount(id,label));active=true;sync();
      for(const c of controls.values()){c.wrap.hidden=false;c.original.hidden=true;}
      toggle.setAttribute('aria-pressed','true');toggle.textContent='通常UIに戻す';status.textContent=await expose();
    }catch(e){restore();status.textContent='SDKを読み込めません · 通常UI';console.warn('SF6 dashboard SDK unavailable',e);}
    finally{busy=false;toggle.disabled=false;}
  });
  document.addEventListener('change',()=>queueMicrotask(sync));document.addEventListener('click',()=>queueMicrotask(sync));
  window.addEventListener('sf6-fair-rating-updated',sync);
})();
