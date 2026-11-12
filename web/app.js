const $=id=>document.getElementById(id); let history=[],runs=[],status={},range='7';const fmt=n=>n==null?'—':Number(n).toLocaleString('ja-JP');const date=s=>new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});const signed=n=>n==null?'—':(n>0?'+':'')+fmt(n);
function download(name,contents,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([contents],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
// Per-chart visibility state persists across data refreshes and time-range changes.
const chartLayers={
  mr:{observed:true,average:true,regression:true},
  lp:{observed:true,average:true,regression:true}
};
function chart(id,points,key,color) {
  const node=$(id),detail=$(key+'-point-detail'),
        reading=$(key+'-point-reading'),closeButton=$(key+'-point-close'),
        slopeEl=$(key+'-slope'),layers=chartLayers[key];
  node.replaceChildren();
  detail.hidden=true;
  reading.textContent='';
  closeButton.onclick=null;
  const rows=SF6ChartTrends.normalized(points,key);
  const reg=SF6ChartTrends.regression(rows,key);
  slopeEl.className=reg.available?(reg.slope<0?'negative':''):'unavailable';
  if(reg.available){
    const perHour=Math.abs(reg.slope)<0.05?0:reg.slope;
    slopeEl.textContent=`${perHour>0?'+':''}${perHour.toFixed(1)} ${key.toUpperCase()}/時`;
    slopeEl.title=`${reg.count}件の観測値、${reg.spanHours.toFixed(1)}時間の期間で計算。実プレイ時間ではありません。`;
  }else{
    slopeEl.textContent='算定不可';
    slopeEl.title=reg.reason;
  }
  if(!rows.length){
    node.innerHTML='<div class="empty">この期間の観測データはありません。初回取得後にグラフが表示されます。</div>';
    return;
  }
  const W=Math.max(300,Math.round(node.clientWidth||600)),
        H=Math.max(170,Math.round(node.clientHeight||210)),
        L=52,R=12,T=16,B=30;
  const maSegments=SF6ChartTrends.movingAverage(rows,key,5);
  const projected=reg.available&&layers.regression?[reg.startValue,reg.endValue]:[];
  const displayValues=[...rows.map(row=>row[key]),...projected,
    ...(layers.average?maSegments.flat().map(item=>item.value):[])];
  let min=Math.min(...displayValues),max=Math.max(...displayValues);
  const pad=Math.max(1,(max-min)*.13);
  min-=pad;max+=pad;
  const start=rows[0].stamp,end=rows.at(-1).stamp;
  const X=time=>start===end?W/2:L+(time-start)/(end-start)*(W-L-R);
  const Y=value=>T+(max-value)/(max-min)*(H-T-B);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label',`${key.toUpperCase()}観測値の推移。傾向線は直近5観測の移動平均、近似線は期間全体の線形回帰です。`);
  const draw=(tag,attrs,parent=svg)=>{
    const el=document.createElementNS(svg.namespaceURI,tag);
    Object.entries(attrs).forEach(([name,value])=>el.setAttribute(name,value));
    parent.append(el);
    return el;
  };
  for(let i=0;i<4;i++){
    const y=T+i*(H-T-B)/3;
    draw('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#2c354a','stroke-dasharray':'3 5'});
    const label=draw('text',{x:0,y:y+4,fill:'#79869e','font-size':11});
    label.textContent=fmt(Math.round(max-i*(max-min)/3));
  }
  const coords=rows.map(row=>[X(row.stamp),Y(row[key])]);
  if(layers.observed){
    for(let i=1;i<coords.length;i++){
      if(rows[i].character!==rows[i-1].character||rows[i].phase!==rows[i-1].phase)continue;
      draw('line',{x1:coords[i-1][0],y1:coords[i-1][1],x2:coords[i][0],y2:coords[i][1],
        stroke:color,'stroke-width':2.3,'stroke-linecap':'round',
        'stroke-dasharray':rows[i].stamp-rows[i-1].stamp>90*60000?'5 5':''});
    }
  }
  if(layers.average){
    for(const segment of maSegments){
      if(segment.length<2)continue;
      draw('polyline',{points:segment.map(point=>`${X(point.stamp)},${Y(point.value)}`).join(' '),
        fill:'none',stroke:key==='mr'?'#d7a4ff':'#a1eff4',
        'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round',
        'data-chart-line':'average'});
    }
  }
  if(layers.regression&&reg.available){
    draw('line',{x1:X(reg.startStamp),x2:X(reg.endStamp),
      y1:Y(reg.startValue),y2:Y(reg.endValue),
      stroke:'#e6e7f0','stroke-width':1.8,'stroke-linecap':'round',
      'stroke-dasharray':'6 6','data-chart-line':'regression'});
  }
  let selected=-1,selectedCircle=null;
  function dismiss(){
    detail.hidden=true;
    reading.textContent='';
    if(selectedCircle){
      selectedCircle.setAttribute('aria-pressed','false');
      selectedCircle.setAttribute('r',rows.length>100?2:4);
    }
    selected=-1;selectedCircle=null;
  }
  closeButton.onclick=dismiss;
  if(layers.observed){
    coords.forEach(([x,y],i)=>{
      if(rows.length>25&&i>0&&i<rows.length-1&&
         rows[i][key]===rows[i-1][key]&&rows[i][key]===rows[i+1][key])return;
      const circle=draw('circle',{cx:x,cy:y,r:rows.length>100?2:4,fill:color,
        stroke:'transparent','stroke-width':18,'pointer-events':'all',
        role:'button',tabindex:0,'aria-pressed':'false',
        'aria-label':`${date(rows[i].observed_at)}、${key.toUpperCase()} ${fmt(rows[i][key])}。詳細を表示`});
      const toggle=()=>{
        if(selected===i){dismiss();return;}
        if(selectedCircle){
          selectedCircle.setAttribute('aria-pressed','false');
          selectedCircle.setAttribute('r',rows.length>100?2:4);
        }
        selected=i;selectedCircle=circle;
        circle.setAttribute('aria-pressed','true');
        circle.setAttribute('r',rows.length>100?4:5);
        reading.textContent=`${date(rows[i].observed_at)} JST · ${key.toUpperCase()} ${fmt(rows[i][key])} · ${rows[i].character}`;
        detail.hidden=false;
      };
      circle.addEventListener('click',toggle);
      circle.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}
        else if(event.key==='Escape'){event.preventDefault();dismiss();}
      });
    });
  }
  for(const i of new Set([0,rows.length-1])){
    const label=draw('text',{x:i?W-R:L,y:H-4,'text-anchor':i?'end':'start',
      fill:'#78859d','font-size':11});
    label.textContent=date(rows[i].observed_at);
  }
  node.append(svg);
}

function render(){let character=$('character').value,phase=$('phase').value,all=history.filter(p=>(character==='すべて'||p.character===character)&&(phase==='all'||p.phase===phase));let cutoff=range==='all'?0:Date.now()-Number(range)*864e5,points=all.filter(p=>new Date(p.observed_at).getTime()>=cutoff);let latest=all.at(-1);for(let key of ['mr','lp']){let valid=points.filter(p=>p[key]!=null&&(key!=='mr'||p[key]>0)),last=valid.at(-1),previous=valid.at(-2);$(key).textContent=key==='mr'&&!(typeof latest?.mr==='number'&&latest.mr>0)?'未計測':fmt(latest?.[key]);$(key+'-delta').textContent=last&&previous&&last.phase===previous.phase&&last.character===previous.character?`前回観測比 ${signed(last[key]-previous[key])}`:'比較可能な同フェーズの観測値がありません';$(key+'-stats').textContent=`期間内最高 ${fmt(valid.length?Math.max(...valid.map(p=>p[key])):null)}　最低 ${fmt(valid.length?Math.min(...valid.map(p=>p[key])):null)}`;chart(key+'-chart',valid,key,key==='mr'?'#b48aff':'#5bd7e8')}let mr=all.filter(p=>typeof p.mr==='number'&&p.mr>0);function delta(days){let recent=mr.at(-1),before=mr.filter(p=>new Date(p.observed_at)<=new Date(recent?.observed_at).getTime()-days*864e5).at(-1);return recent&&before?signed(recent.mr-before.mr):'—'}$('day').textContent=delta(1);$('week').textContent=delta(7);let first=points.find(p=>p.mr!=null),last=points.filter(p=>p.mr!=null).at(-1);$('trend').textContent=!first||!last||first===last?'—':last.mr>first.mr?'上昇傾向':last.mr<first.mr?'下降傾向':'横ばい';$('samples').textContent=`${all.length} 件の観測値`;let changes=all.filter(p=>p.observation_type==='change');$('last-change').textContent='最終変動：'+(changes.length?date(changes.at(-1).observed_at)+' JST':'比較用の変動は未検出');renderTimeAnalysis(history,range,timeWindow)}
let timeWindow=60;
let refreshing=false,hasData=false,lastFetchAt=0,historyVersion='';
function updateSelectors(){
  const chars=[...new Set(history.map(x=>x.character))].sort();
  const selected=$('character').value;
  chars.forEach(c=>{if(![...$('character').options].some(o=>o.value===c))$('character').add(new Option(c,c))});
  if(!hasData){let preferred=chars.find(c=>/akuma|gouki|豪鬼/i.test(c));if(preferred)$('character').value=preferred}
  else $('character').value=selected;
  const phase=$('phase').value;
  [...new Set(history.map(x=>x.phase))].sort().forEach(p=>{if(![...$('phase').options].some(o=>o.value===p))$('phase').add(new Option(typeof SF6PhaseConfig!=='undefined'?SF6PhaseConfig.label(p):p,p))});
  if(hasData)$('phase').value=phase;
}
function updateStatus(){
  const chosen=$('character').value;
  const selectedLast=chosen==='すべて'?null:history.filter(p=>p.character===chosen).at(-1);
  const lastObserved=chosen==='すべて'?status.last_success:selectedLast?.observed_at;
  $('last-sync').textContent=lastObserved?date(lastObserved)+' JST':'未取得';
  const age=lastObserved?(Date.now()-new Date(lastObserved).getTime())/6e4:Infinity;
  const failed=status.last_error&&(!status.last_success||new Date(status.last_error.at)>new Date(status.last_success));
  const state=failed?'取得エラー':!lastObserved?'初回取得待ち':
    age>90?(chosen==='すべて'?'更新遅延':'選択キャラ更新遅延'):'取得正常';
  $('health').textContent=state;
  document.querySelector('.dot').classList.toggle('ok',state==='取得正常');
  $('freshness').textContent=chosen==='すべて'?
    (age>90&&lastObserved?`最終成功から ${Math.floor(age)} 分経過。表示値は古い可能性があります。`:
    '最終成功：'+(lastObserved?date(lastObserved)+' JST':'未取得')):
    `${chosen} の最終観測：${lastObserved?date(lastObserved)+' JST':'未取得'}。`+
    (age>90?'このキャラの観測値は古い可能性があります。':'');
  let recent=runs.filter(x=>new Date(x.started_at).getTime()>=Date.now()-864e5),successful=recent.filter(x=>x.result==='success'),failedRuns=recent.filter(x=>x.result==='failure'),skipped=recent.filter(x=>x.result==='skipped_recent_success');
  let attempts=successful.length+failedRuns.length,successRate=attempts?Math.round(successful.length/attempts*100)+'%':'算定不可';
  $('coverage').textContent=`直近24時間：取得成功 ${successful.length} 回、失敗 ${failedRuns.length} 回、省略 ${skipped.length} 回。到達済み取得の成功率 ${successRate}（予定枠への到達率とは別）。`;
  let allSuccess=runs.filter(x=>x.result==='success'),prevSuccess=allSuccess.at(-2),lastSuccess=allSuccess.at(-1),gap=prevSuccess&&lastSuccess?Math.round((new Date(lastSuccess.started_at)-new Date(prevSuccess.started_at))/60000):null;
  let recentSuccess=allSuccess.filter(x=>new Date(x.started_at).getTime()>=Date.now()-864e5),intervals=recentSuccess.slice(1).map((x,i)=>(new Date(x.started_at)-new Date(recentSuccess[i].started_at))/60000).filter(x=>x>=0),meanInterval=intervals.length?Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length):null;$('cadence').textContent=`外部00・30分／GitHub予備11・41分。直近の成功間隔：${gap==null?'比較不可':gap+'分'}。直近24時間の成功間隔平均：${meanInterval==null?'比較不可':meanInterval+'分'}（${intervals.length}区間）。GitHubの予定起動は保証されません。`;
  let gaps=allSuccess.slice(1).map((x,i)=>(new Date(x.started_at)-new Date(allSuccess[i].started_at))/60000);
  $('longest-gap').textContent=gaps.length?`記録済み成功間の最長空白：${Math.round(Math.max(...gaps))}分（runs.json導入後のみ）。`:'成功間の空白はまだ計算できません。';
  let daysLeft=Math.ceil((new Date('2026-12-08T00:00:00+09:00')-Date.now())/864e5);
  $('token-expiry').textContent=daysLeft<=14?daysLeft<=0?'外部起動用トークンの有効期限（12月8日）を確認し、必要なら更新してください。':`外部起動用トークンの期限まで約${daysLeft}日。期限前に更新してください。`:'';
  const assumed=typeof SF6PhaseConfig!=='undefined'?SF6PhaseConfig.label('unknown'):'未判定';
  $('phase-note').textContent=`現在の暫定表示：${assumed}（ユーザー指定・Buckler上は未判定）。`+
    (status.phase_diagnostic?.reason?` 取得元フェーズ：判定不能（${status.phase_diagnostic.reason}）`:'');
  $('error').textContent=status.last_error?`${date(status.last_error.at)} · ${status.last_error.message}`:'取得エラーはありません。';
  $('errors').replaceChildren(...(status.errors||[]).map(e=>{let li=document.createElement('li');li.textContent=`${date(e.at)} · ${e.message}`;return li}));
  $('last-check').textContent=lastFetchAt?date(new Date(lastFetchAt).toISOString())+' JST':'未確認';
}
async function refresh(force=false){
  if(refreshing||document.hidden&&!force)return;
  if(!force&&Date.now()-lastFetchAt<3000)return;
  refreshing=true;$('refresh').disabled=true;$('refresh-state').textContent='最新データを確認中…';
  try{
    const version=Date.now();
    const responses=await Promise.all(['history','status','runs'].map(name=>fetch(`data/${name}.json?v=${version}`,{cache:'no-store'})));
    if(responses.some(r=>!r.ok))throw Error('データファイルを読み込めません');
    const [h,s,r]=await Promise.all(responses.map(x=>x.json()));
    if(!Array.isArray(h.observations)||!Array.isArray(r.events))throw Error('データ形式を確認できません');
    const nextHistory=[...h.observations].sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
    const nextVersion=JSON.stringify(nextHistory);
    const changed=nextVersion!==historyVersion;
    history=nextHistory;status=s;runs=r.events;lastFetchAt=Date.now();
    updateSelectors();updateStatus();
    if(changed||!hasData){historyVersion=nextVersion;render()}
    hasData=true;
    $('refresh-state').textContent='画面確認：'+date(new Date(lastFetchAt).toISOString())+' JST';
  }catch(e){
    $('refresh-state').textContent='通信エラー。前回の表示を保持しています。';
    $('health').textContent='画面確認エラー';document.querySelector('.dot').classList.remove('ok');
    $('freshness').textContent='最新データを確認できません。表示中のMR・LPは古い可能性があります。';
    $('error').textContent='画面のデータ再取得に失敗しました。通信が戻ると再試行します。';
  }finally{refreshing=false;$('refresh').disabled=false;window.matchDashboard?.refresh()}
}
document.querySelectorAll('[data-chart][data-layer]').forEach(button=>{
  const key=button.dataset.chart,layer=button.dataset.layer;
  if(!chartLayers[key]||!(layer in chartLayers[key]))return;
  button.onclick=()=>{
    chartLayers[key][layer]=!chartLayers[key][layer];
    const active=chartLayers[key][layer];
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
    // Redraw only the selected graph; the other graph and filters are untouched.
    const character=$('character').value,phase=$('phase').value;
    const cutoff=range==='all'?0:Date.now()-Number(range)*864e5;
    const selected=history.filter(p=>(character==='すべて'||p.character===character)&&
      (phase==='all'||p.phase===phase)&&(key!=='mr'||p.mr>0)&&new Date(p.observed_at).getTime()>=cutoff);
    chart(key+'-chart',selected,key,key==='mr'?'#b48aff':'#5bd7e8');
  };
});
document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>{timeWindow=Number(b.dataset.window);document.querySelector('.time-windows .active')?.classList.remove('active');b.classList.add('active');renderTimeAnalysis(history,range,timeWindow)});
$('refresh').onclick=()=>refresh(true);
function syncOverviewCharacterToMatches(){
  const selected=$('character').value;
  const target=selected==='すべて'?'all':selected;
  const match=$('match-character');
  if(match&&[...match.options].some(option=>option.value===target)){
    match.value=target;
  }
}
window.onSf6MatchCharacterChange=selected=>{
  const target=selected==='all'?'すべて':selected;
  const overview=$('character');
  if([...overview.options].some(option=>option.value===target)){
    overview.value=target;
    if(history.length){render();updateStatus();}
  }
};
$('character').onchange=()=>{syncOverviewCharacterToMatches();render();updateStatus();window.matchDashboard?.render();};
$('phase').onchange=()=>{render();window.matchDashboard?.render();};document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=b.dataset.range;document.querySelector('.segmented .active')?.classList.remove('active');b.classList.add('active');render()});$('json').onclick=()=>download('sf6-history.json',JSON.stringify({schema:2,observations:history},null,2),'application/json');$('csv').onclick=()=>download('sf6-history.csv','observed_at,character,phase,mr,lp,delta_mr,delta_lp,observation_type,source\n'+history.map(p=>['observed_at','character','phase','mr','lp','delta_mr','delta_lp','observation_type','source'].map(k=>'"'+String(p[k]??'').replaceAll('"','""')+'"').join(',')).join('\n'),'text/csv');refresh(true);
setInterval(()=>{if(!document.hidden)refresh()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('pageshow',()=>refresh());
window.addEventListener('focus',()=>refresh());
window.onSf6ViewChange = view => {if(view==='overview' && history.length)render();};
