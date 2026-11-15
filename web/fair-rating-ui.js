/* Exploratory ACT-by-ACT "equal-win opponent MR" view.
 * Never calls a forecast "true skill" and never renders unsupported ACT claims.
 */
(function(root){
  const $=id=>document.getElementById(id);
  const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:0});
  const dec=n=>Number(n).toFixed(4);
  const pct=n=>Number(n).toFixed(1)+'%';
  function node(tag,text,cls){
    const e=document.createElement(tag);
    if(text!==undefined)e.textContent=text;
    if(cls)e.className=cls;
    return e;
  }
  let snapshot=[],bound=false,cacheKey='',cached=null,lastRows=null;
  function ensureOptions(el, options){
    const selected=el.value;
    const values=options.map(x=>x.value);
    const current=[...el.options].map(x=>x.value);
    if(current.length!==values.length||current.some((x,i)=>x!==values[i])){
      el.options.length=0;
      options.forEach(x=>el.add(new Option(x.label,x.value)));
    }
    el.value=values.includes(selected)?selected:values[0]||'';
  }
  const signed=n=>(n>0?'+':'')+n.toFixed(1);
  const date=t=>new Date(t).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
  function drawRolling(result){
    const n=Number($('fair-window').value)||100,points=result.series[n]||[],latest=points.at(-1),
      valid=points.filter(p=>p.crossing!==null),host=$('fair-rolling-chart');
    host.replaceChildren();
    $('fair-rolling-summary').textContent=latest?
      '最新 '+(latest.crossing===null?'算定保留':fmt(latest.crossing)+' MR')+
      ' ／ 実測 '+(latest.own===null?'不明':fmt(latest.own)+' MR'):
      '対象データなし';
    $('fair-rolling-note').textContent=(latest?'最新の計算：'+latest.reason+'。':'')+
      ' 推定可能 '+valid.length+' / '+points.length+'地点。'+
      (n===50?'50試合窓は変動が大きいため探索用です。':'')+
      ' 実測は各地点の最後の試合の対戦前MR。重複する窓は独立ではなく、成長の証明ではありません。';
    const vals=points.flatMap(p=>[p.own,p.crossing]).filter(Number.isFinite);
    if(!points.length||!vals.length){host.append(node('p','表示できるMRデータがありません。'));return;}
    const svg=(tag,attrs={},content)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
      Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));if(content!==undefined)e.textContent=content;return e;};
    const chart=svg('svg',{viewBox:'0 0 620 260',role:'img','aria-label':'実測対戦前MRと直近'+n+'試合による推定互角MRの推移'});
    const min=Math.floor(vals.reduce((a,b)=>Math.min(a,b),Infinity)/50)*50-50,
      max=Math.ceil(vals.reduce((a,b)=>Math.max(a,b),-Infinity)/50)*50+50;
    const left=63,right=601,top=15,bottom=220,first=points[0].t,last=latest.t;
    const x=t=>first===last?(left+right)/2:left+(t-first)/(last-first)*(right-left),
      y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    for(let i=0;i<=4;i++){
      const v=min+(max-min)*i/4,yy=y(v);
      chart.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,class:'fairmr-gridline'}),
        svg('text',{x:left-8,y:yy+5,'text-anchor':'end',class:'fairmr-axis'},fmt(v)));
    }
    const ticks=first===last?[first]:[first,(first+last)/2,last];
    for(const t of ticks)chart.append(svg('text',{x:x(t),y:245,'text-anchor':t===first&&first!==last?'start':t===last&&first!==last?'end':'middle',class:'fairmr-axis'},date(t)));
    for(const [field,cls] of [['own','fairmr-line-real'],['crossing','fairmr-line-est']]){
      let path='',prev=false;
      for(const p of points){
        if(!Number.isFinite(p[field])){prev=false;continue;}
        path+=(prev?'L':'M')+x(p.t)+' '+y(p[field])+' ';prev=true;
      }
      chart.append(svg('path',{d:path,class:cls}));
      for(const p of points){if(!Number.isFinite(p[field]))continue;
        const dot=svg('circle',{cx:x(p.t),cy:y(p[field]),r:2.2,class:cls+' fairmr-chart-dot'});
        dot.append(svg('title',{},date(p.t)+' · '+p.count+'試合目 · '+fmt(p[field])+' MR'));chart.append(dot);
      }
    }
    host.append(chart);
  }
  function drawAdjusted(result){
    $('fair-adjusted-status').textContent='比較対象 '+result.tested+'試合 ／ 条件外 '+result.skipped+'試合'+
      (result.unknown?' ／ 相手キャラ不明 '+result.unknown+'試合':'')+'。'+
      (result.tested>=60?' Brier（低いほど良い）：相手MR '+dec(result.brier)+' ／ 過去勝率 '+dec(result.baselineBrier)+'。'+
        (result.validated?'今回の比較試合で改善。':'改善は未確認。補正結果は参考のみ。'):' 予測精度の検証には比較60試合以上が必要です。');
    const body=$('fair-adjusted-body');body.replaceChildren();
    for(const r of result.matchups){
      const row=node('tr');if(!r.qualified)row.className='fairmr-unqualified';
      const name=node('th',r.character);name.scope='row';
      if(!r.qualified||!result.validated)name.append(node('small','参考'));
      const count=node('td',r.n+' / '+r.total);count.title=r.sessions+'セッション';
      row.append(name,count,node('td',r.actual===null?'—':pct(r.actual)),node('td',r.expected===null?'—':pct(r.expected)),
        node('td',r.delta===null?'—':signed(r.delta),r.delta!==null&&r.qualified&&result.validated?(r.delta>0?'fairmr-positive':r.delta<0?'fairmr-negative':''):''));
      body.append(row);
    }
    if(!result.matchups.length){const row=node('tr'),cell=node('td','対象の対戦記録がありません。');cell.colSpan=5;row.append(cell);body.append(row);}
  }
  function show(){
    const chars=[...new Set(snapshot.filter(r=>r&&r.mode==='ranked'&&
      typeof r.mr_before==='number'&&r.mr_before>0).map(r=>r.character))].sort();
    const selected=$('fair-character');
    ensureOptions(selected,chars.length?chars.map(c=>({value:c,label:c})):
      [{value:'',label:'対象キャラなし'}]);
    const character=selected.value;
    const actAt=time=>typeof SF6PhaseConfig==='undefined'?null:SF6PhaseConfig.assignedAct(time);
    // Build the ACT selector without estimating the model twice.
    const groups=new Map();
    for(const r of SF6FairRating.clean(snapshot,{character,actAt})){
      if(r.phase==='unknown')continue;
      if(!groups.has(r.phase))groups.set(r.phase,{value:r.phase,label:r.phaseLabel,n:0,t:0});
      const group=groups.get(r.phase);group.n++;group.t=Math.max(group.t,r.t);
    }
    const acts=[...groups.values()].sort((a,b)=>b.t-a.t);
    ensureOptions($('fair-act'),acts.length?acts.map(x=>({value:x.value,label:x.label+' · '+x.n+'試合'})):
      [{value:'',label:'分析可能なACTなし'}]);
    const selectedAct=$('fair-act').value;
    const key=character+':'+selectedAct+':'+(typeof SF6PhaseConfig!=='undefined'?SF6PhaseConfig.version():'')+':'+snapshot.length+':'+
      (snapshot.at(-1)?.key||'')+':'+(snapshot[0]?.key||'');
    if(key!==cacheKey){cached=SF6FairRating.analyze(snapshot,{character,actAt,selectedAct});cacheKey=key;}
    const report=cached;
    drawRolling(report.rolling);
    drawAdjusted(report.adjusted);
    const c=report.current;
    $('fair-phase-note').textContent=report.actLabel+
      ' · 検証可能 '+report.selectedN+'試合 · 公式PLAYのActで統合集計。'+
      (report.inferredN?' このうち'+report.inferredN+'試合は観測時刻から割り当て（初回公式確認以前'+report.retrospectiveN+'試合）。':'')+
      (report.unassignedN?' Act判定不能'+report.unassignedN+'試合は集計対象外。':'')+
      ' 試合別の公式Actが直接取得できたことを意味しません。';
    $('fair-rating-value').textContent=c.crossing!==null?fmt(c.crossing)+' MR':'算定保留';
    $('fair-rating-sub').textContent=c.crossing!==null?
      '相手への予測勝率が50%になるMR（真の実力・到達保証ではありません）':c.check.reason;
    $('fair-rating-range').textContent=c.interval.range?
      'セッション再標本化による参考95%区間 '+fmt(c.interval.range[0])+
      '〜'+fmt(c.interval.range[1])+' MR':
      '不確実性の区間：算定不可（'+c.interval.reason+'）';
    $('fair-count').textContent=c.n+'試合 · '+c.groups+'セッション · '+
      c.wins+'勝 '+(c.n-c.wins)+'敗';
    $('fair-validation').textContent=c.backtest.status!=='ready'?
      '時系列の予測精度は未検証：'+(c.backtest.reason||'十分なデータがありません'):
      '過去'+c.backtest.training+'試合で開始し、その後'+c.backtest.tested+
      '試合（'+c.backtest.folds+'セッション）を順に予測。Brier：相手MRモデル '+
      dec(c.backtest.brier)+' ／ 過去勝率だけ '+dec(c.backtest.baselineBrier)+
      '。'+(c.backtest.improved?'今回の検証ではモデルが改善。':'モデルの改善は確認できず。');
    $('fair-trend').textContent=!report.shift?
      'ACT内の前半・後半比較：各150試合以上の記録が必要です。':
      report.shift.difference===null?
        '前半／後半の互角MR：片方または両方が算定保留。成長幅を断定できません。':
        '同一ACT内の前半 '+fmt(report.shift.early)+' MR（'+report.shift.earlyN+
        '試合）→ 後半 '+fmt(report.shift.late)+' MR（'+report.shift.lateN+
        '試合）。差 '+(report.shift.difference>0?'+':'')+
        fmt(report.shift.difference)+' MR。成長の証明ではなく区間別の参考比較です。';
    $('fair-limits').textContent=
      '解釈：対戦互角MRは相手の絶対MRと勝敗の関係から計算した50%交点です。'+
      '本人の適正MR・将来MRの確定値ではありません。相手との組合せ、'+
      '同じ相手との再戦、プレイ中の成長、マッチングと取得欠落による偏りがあります。'+
      '相手の対戦前MR・勝敗があるマスター帯のランクマッチのみ対象とし、'+
      'Act区分は公式PLAYの観測値で統一し、記録内のActがunknownの試合は時刻から推定します。初回確認より前の割当は遡及推定、切替境界は集計除外です。'+
      '予測力はセッションを分離した過去→未来のBrierスコアで検証。'+
      '参考区間はセッション単位の再標本化であり厳密な保証ではありません。';
    const bands=$('fair-bands');bands.replaceChildren();
    const meaningful=c.bands.filter(b=>b.n>=1);
    for(const band of meaningful){
      const row=node('div',undefined,'fair-band');
      const head=node('div',undefined,'fair-band-label');
      head.append(node('span',band.start+'〜'+band.end+' MR'),
                  node('strong',pct(band.winRate)));
      row.append(head);
      const track=node('div',undefined,'fair-track');
      track.setAttribute('role','img');
      track.setAttribute('aria-label',band.start+'〜'+band.end+'MR、'+band.n+
        '試合、勝率'+pct(band.winRate));
      const fill=node('span',undefined,'fair-fill');
      fill.style.width=band.winRate+'%';
      track.append(fill);row.append(track);
      row.append(node('small',band.n+'試合 · '+band.wins+'勝 '+
        (band.n-band.wins)+'敗'+(band.n<20?' · 少数データ':''),
        band.n<20?'fair-sparse':''));
      bands.append(row);
    }
    if(!meaningful.length)bands.append(node('p','このACTで対戦前MRを確認できる試合がありません。'));
    $('fair-conclusion').textContent=c.status==='exploratory'?
      '50%交点を推定でき、今回の時系列検証では勝敗の予測精度も改善。ただし適正MRの証明ではありません。':
      c.status==='not_validated'?'交点の推定は可能ですが、未来試合への予測精度の改善は未確認です。':
      c.status==='uncertain'?'交点の候補はありますが、不確実性が大きいため判断を保留します。':
      'データ条件が足りないため、対戦互角MRを表示しません。';
  }
  function render(rows){
    if(rows!==lastRows){cacheKey='';lastRows=rows;}
    snapshot=Array.isArray(rows)?rows:[];
    if(!bound){
      $('fair-character').onchange=()=>{cacheKey='';$('fair-act').value='';show();};
      $('fair-act').onchange=show;
      $('fair-window').onchange=()=>{if(cached)drawRolling(cached.rolling);};
      bound=true;
    }
    show();
  }
  root.SF6FairRatingUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);

