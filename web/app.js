const $=id=>document.getElementById(id); let history=[],runs=[],status={},range='7';const fmt=n=>n==null?'—':Number(n).toLocaleString('ja-JP');const date=s=>new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});const signed=n=>n==null?'—':(n>0?'+':'')+fmt(n);
function download(name,contents,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([contents],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function chart(id,points,key,color){let node=$(id);node.replaceChildren();points=points.filter(p=>p[key]!=null);if(!points.length){node.innerHTML='<div class="empty">この期間の観測データはありません<br>初回取得後にグラフが表示されます</div>';return}let W=600,H=210,L=52,R=12,T=16,B=30,min=Math.min(...points.map(x=>x[key])),max=Math.max(...points.map(x=>x[key])),pad=Math.max(1,(max-min)*.13);min-=pad;max+=pad;let times=points.map(x=>new Date(x.observed_at).getTime()),start=Math.min(...times),end=Math.max(...times);let X=(x,i)=>start===end?W/2:L+(x-start)/(end-start)*(W-L-R),Y=y=>T+(max-y)/(max-min)*(H-T-B);let svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${key.toUpperCase()} の時系列グラフ`);let line=(tag,attrs,parent=svg)=>{let el=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([a,v])=>el.setAttribute(a,v));parent.append(el);return el};for(let i=0;i<4;i++){let y=T+i*(H-T-B)/3;line('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#2c354a','stroke-dasharray':'3 5'});let label=line('text',{x:0,y:y+4,fill:'#79869e','font-size':11});label.textContent=fmt(Math.round(max-i*(max-min)/3))}let coords=points.map((p,i)=>[X(times[i],i),Y(p[key])]);for(let i=1;i<coords.length;i++){if(points[i].character!==points[i-1].character||points[i].phase!==points[i-1].phase)continue;line('line',{x1:coords[i-1][0],y1:coords[i-1][1],x2:coords[i][0],y2:coords[i][1],stroke:color,'stroke-width':2.6,'stroke-linecap':'round','stroke-dasharray':times[i]-times[i-1]>90*60000?'5 5':''})}coords.forEach(([x,y],i)=>{let circle=line('circle',{cx:x,cy:y,r:points.length>100?2:4,fill:color,stroke:'#121827','stroke-width':2,tabindex:0});let show=()=>{let t=$('tooltip');t.hidden=false;t.textContent=`${date(points[i].observed_at)} · ${key.toUpperCase()} ${fmt(points[i][key])} · ${points[i].character}`;let box=circle.getBoundingClientRect();t.style.left=Math.max(8,Math.min(innerWidth-220,box.left))+'px';t.style.top=Math.max(8,box.top-47)+'px'};circle.addEventListener('mouseenter',show);circle.addEventListener('focus',show);circle.addEventListener('mouseleave',()=>{$('tooltip').hidden=true});circle.addEventListener('blur',()=>{$('tooltip').hidden=true})});[0,points.length-1].forEach(i=>{let l=line('text',{x:i?W-R:L,y:H-4,'text-anchor':i?'end':'start',fill:'#78859d','font-size':11});l.textContent=date(points[i].observed_at)});node.append(svg)}
function render(){let character=$('character').value,phase=$('phase').value,all=history.filter(p=>(character==='すべて'||p.character===character)&&(phase==='all'||p.phase===phase));let cutoff=range==='all'?0:Date.now()-Number(range)*864e5,points=all.filter(p=>new Date(p.observed_at).getTime()>=cutoff);let latest=all.at(-1);for(let key of ['mr','lp']){let valid=points.filter(p=>p[key]!=null),last=valid.at(-1),previous=valid.at(-2);$(key).textContent=fmt(latest?.[key]);$(key+'-delta').textContent=last&&previous&&last.phase===previous.phase&&last.character===previous.character?`前回観測比 ${signed(last[key]-previous[key])}`:'比較可能な同フェーズの観測値がありません';$(key+'-stats').textContent=`期間内最高 ${fmt(valid.length?Math.max(...valid.map(p=>p[key])):null)}　最低 ${fmt(valid.length?Math.min(...valid.map(p=>p[key])):null)}`;chart(key+'-chart',valid,key,key==='mr'?'#b48aff':'#5bd7e8')}let mr=all.filter(p=>p.mr!=null);function delta(days){let recent=mr.at(-1),before=mr.filter(p=>new Date(p.observed_at)<=new Date(recent?.observed_at).getTime()-days*864e5).at(-1);return recent&&before?signed(recent.mr-before.mr):'—'}$('day').textContent=delta(1);$('week').textContent=delta(7);let first=points.find(p=>p.mr!=null),last=points.filter(p=>p.mr!=null).at(-1);$('trend').textContent=!first||!last||first===last?'—':last.mr>first.mr?'上昇傾向':last.mr<first.mr?'下降傾向':'横ばい';$('samples').textContent=`${all.length} 件の観測値`;let changes=all.filter(p=>p.observation_type==='change');$('last-change').textContent='最終変動：'+(changes.length?date(changes.at(-1).observed_at)+' JST':'比較用の変動は未検出')}
let refreshing=false,hasData=false,lastFetchAt=0,historyVersion='';
function updateSelectors(){
  const chars=[...new Set(history.map(x=>x.character))].sort();
  const selected=$('character').value;
  chars.forEach(c=>{if(![...$('character').options].some(o=>o.value===c))$('character').add(new Option(c,c))});
  if(!hasData){let preferred=chars.find(c=>/akuma|gouki|豪鬼/i.test(c));if(preferred)$('character').value=preferred}
  else $('character').value=selected;
  const phase=$('phase').value;
  [...new Set(history.map(x=>x.phase))].sort().forEach(p=>{if(![...$('phase').options].some(o=>o.value===p))$('phase').add(new Option(p,p))});
  if(hasData)$('phase').value=phase;
}
function updateStatus(){
  $('last-sync').textContent=status.last_success?date(status.last_success)+' JST':'未取得';
  let age=status.last_success?(Date.now()-new Date(status.last_success).getTime())/6e4:Infinity;
  let failed=status.last_error&&(!status.last_success||new Date(status.last_error.at)>new Date(status.last_success));
  let state=failed?'取得エラー':age>90?'更新遅延':status.last_success?'取得正常':'初回取得待ち';
  $('health').textContent=state;
  document.querySelector('.dot').classList.toggle('ok',state==='取得正常');
  $('freshness').textContent=age>90&&status.last_success?`最終成功から ${Math.floor(age)} 分経過。表示値は古い可能性があります。`:'最終成功：'+(status.last_success?date(status.last_success)+' JST':'未取得');
  let recent=runs.filter(x=>new Date(x.started_at).getTime()>=Date.now()-864e5),successful=recent.filter(x=>x.result==='success'),failedRuns=recent.filter(x=>x.result==='failure'),skipped=recent.filter(x=>x.result==='skipped_recent_success');
  let attempts=successful.length+failedRuns.length,successRate=attempts?Math.round(successful.length/attempts*100)+'%':'算定不可';
  $('coverage').textContent=`直近24時間：取得成功 ${successful.length} 回、失敗 ${failedRuns.length} 回、省略 ${skipped.length} 回。到達済み取得の成功率 ${successRate}（予定枠への到達率とは別）。`;
  let allSuccess=runs.filter(x=>x.result==='success'),prevSuccess=allSuccess.at(-2),lastSuccess=allSuccess.at(-1),gap=prevSuccess&&lastSuccess?Math.round((new Date(lastSuccess.started_at)-new Date(prevSuccess.started_at))/60000):null;
  $('cadence').textContent=`外部00・30分／GitHub予備11・41分。直近の成功間隔：${gap==null?'比較不可':gap+'分'}。GitHubの予定起動は保証されません。`;
  let gaps=allSuccess.slice(1).map((x,i)=>(new Date(x.started_at)-new Date(allSuccess[i].started_at))/60000);
  $('longest-gap').textContent=gaps.length?`記録済み成功間の最長空白：${Math.round(Math.max(...gaps))}分（runs.json導入後のみ）。`:'成功間の空白はまだ計算できません。';
  let daysLeft=Math.ceil((new Date('2026-12-08T00:00:00+09:00')-Date.now())/864e5);
  $('token-expiry').textContent=daysLeft<=14?daysLeft<=0?'外部起動用トークンの有効期限（12月8日）を確認し、必要なら更新してください。':`外部起動用トークンの期限まで約${daysLeft}日。期限前に更新してください。`:'';
  $('phase-note').textContent=status.phase_diagnostic?.reason?`フェーズ：判定不能（${status.phase_diagnostic.reason}）`:'';
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
  }finally{refreshing=false;$('refresh').disabled=false}
}
$('refresh').onclick=()=>refresh(true);
$('character').onchange=render;$('phase').onchange=render;document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=b.dataset.range;document.querySelector('.segmented .active')?.classList.remove('active');b.classList.add('active');render()});$('json').onclick=()=>download('sf6-history.json',JSON.stringify({schema:2,observations:history},null,2),'application/json');$('csv').onclick=()=>download('sf6-history.csv','observed_at,character,phase,mr,lp,delta_mr,delta_lp,observation_type,source\n'+history.map(p=>['observed_at','character','phase','mr','lp','delta_mr','delta_lp','observation_type','source'].map(k=>'"'+String(p[k]??'').replaceAll('"','""')+'"').join(',')).join('\n'),'text/csv');refresh(true);
setInterval(()=>{if(!document.hidden)refresh()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('pageshow',()=>refresh());
window.addEventListener('focus',()=>refresh());
