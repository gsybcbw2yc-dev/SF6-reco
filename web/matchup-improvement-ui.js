(function(root){
  const $=id=>document.getElementById(id),pct=x=>`${(x*100).toFixed(1)}%`,signed=x=>`${x>0?'+':''}${x.toFixed(1)} MR`;
  let data=null,result=null,bound=false;
  function draw(){
    const target=$('improve-target'),opponent=$('improve-opponent'),horizon=Number($('improve-horizon').value);
    const m=data?.matchups.find(x=>x.opponent===opponent.value);
    const mode=target.value,p=m?(mode==='50pct'?.5:Math.min(1,m.p+Number(mode)/100)):NaN;
    result=m?SF6MatchupImprovement.simulate(data,opponent.value,p,horizon):null;
    const r=result;
    $('improve-rate').textContent=r?`${pct(r.currentRate)} → ${pct(r.targetRate)}`:'—';
    $('improve-gain').textContent=r?.gain!=null?signed(r.gain):'算定保留';
    $('improve-encounters').textContent=r?`${r.encounters.toFixed(1)} 回 / ${horizon}試合`:'—';
    $('improve-before').textContent=r?.baseline!=null?signed(r.baseline):'—';
    $('improve-after').textContent=r?.improved!=null?signed(r.improved):'—';
    $('improve-evidence').textContent=r?`${r.n}試合（${r.wins}勝 ${r.losses}敗）／対象遭遇率 ${pct(r.share)}／MR算定 ${r.observed.known}/${r.n}件。${r.payout?`${r.source==='matchup'?'対象キャラ戦':'同キャラ・同ACT全戦の参考値'}：平均勝利 +${r.payout.winMean.toFixed(1)}、敗北 −${r.payout.lossMean.toFixed(1)} MR（${r.payout.winKnown}勝・${r.payout.lossKnown}敗の差分）。`:''} ${r.reason}。${r.gain<0?'目標勝率が現在を下回るため、悪化シナリオです。':''}`:'同ACTに分析可能な対戦記録がありません。';
  }
  function render(rows,deltas){
    if(!$('improve-opponent'))return;
    data=SF6MatchupImprovement.analyze(rows,deltas);
    const e=$('improve-opponent'),old=e.value,options=data.matchups.map(m=>({value:m.opponent,label:`${m.opponent} · ${m.n}試合`}));
    if(!options.length)options.push({value:'',label:'対象なし'});
    if([...e.options].map(o=>o.value+o.label).join('|')!==options.map(o=>o.value+o.label).join('|')){
      e.replaceChildren();for(const o of options)e.add(new Option(o.label,o.value));
    }
    e.value=options.some(o=>o.value===old)?old:(data.matchups.filter(m=>m.n>=10&&m.p<.5).sort((a,b)=>b.share*(.5-b.p)-a.share*(.5-a.p))[0]?.opponent||options[0].value);
    if(!bound){for(const id of ['improve-opponent','improve-target','improve-horizon'])$(id).addEventListener('change',draw);bound=true;}
    draw();
  }
  root.SF6ImprovementUI={render,report:()=>result};
})(globalThis);
