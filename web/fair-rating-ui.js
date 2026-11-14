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
  let snapshot=[],bound=false,cacheKey='',cached=null;
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
  function show(){
    const chars=[...new Set(snapshot.filter(r=>r&&r.mode==='ranked'&&
      typeof r.mr_before==='number'&&r.mr_before>0).map(r=>r.character))].sort();
    const selected=$('fair-character');
    ensureOptions(selected,chars.length?chars.map(c=>({value:c,label:c})):
      [{value:'',label:'対象キャラなし'}]);
    const character=selected.value;
    const actAt=time=>typeof SF6PhaseConfig==='undefined'?null:SF6PhaseConfig.assignedAct(time);
    // A cheap version key skips regression and bootstrap for unrelated UI events.
    const key=character+':'+snapshot.length+':'+(snapshot.at(-1)?.key||'')+':'+(snapshot[0]?.key||'');
    if(key!==cacheKey){cached=SF6FairRating.analyze(snapshot,{character,actAt});cacheKey=key;}
    const acts=cached.acts;
    ensureOptions($('fair-act'),acts.length?acts.map(x=>({value:x.key,label:x.label+' · '+x.count+'試合'})):
      [{value:'',label:'分析可能なACTなし'}]);
    const selectedAct=$('fair-act').value;
    const report=SF6FairRating.analyze(snapshot,{character,actAt,selectedAct});
    const c=report.current;
    $('fair-phase-note').textContent=report.actLabel+
      ' · 検証可能 '+report.selectedN+'試合 · 記録済みの試合のみ。'+
      (report.provisional?' ACTラベルはユーザー申告に基づく暫定設定です。':'');
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
      'ACTがunknownの場合はACT14を暫定適用します。'+
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
      '暫定推定が可能で、今回の時系列検証では勝敗の予測精度も改善。ただし適正MRの証明ではありません。':
      c.status==='not_validated'?'交点の推定は可能ですが、未来試合への予測精度の改善は未確認です。':
      c.status==='uncertain'?'交点の候補はありますが、不確実性が大きいため判断を保留します。':
      'データ条件が足りないため、対戦互角MRを表示しません。';
  }
  function render(rows){
    snapshot=Array.isArray(rows)?rows:[];
    if(!bound){
      $('fair-character').onchange=()=>{cacheKey='';$('fair-act').value='';show();};
      $('fair-act').onchange=show;
      bound=true;
    }
    show();
  }
  root.SF6FairRatingUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);
