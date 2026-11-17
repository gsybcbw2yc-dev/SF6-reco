/* Conditional scenario, not a forecast: hold matchup mix and MR payouts fixed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SF6MatchupImprovement=api;})(globalThis,function(){
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  function evidence(rows,deltas){
    const wins=rows.filter(r=>r.y===1),losses=rows.filter(r=>r.y===0);
    const values=(xs,sign)=>xs.map(r=>deltas.get(r.key)).filter(d=>d&&['verified','inferred'].includes(d.basis)&&Number.isFinite(d.delta)&&d.delta*sign>0&&Math.abs(d.delta)<=50).map(d=>Math.abs(d.delta));
    const w=values(wins,1),l=values(losses,-1);
    return {n:rows.length,wins:wins.length,losses:losses.length,known:w.length+l.length,
      winKnown:w.length,lossKnown:l.length,winCoverage:wins.length?w.length/wins.length:0,lossCoverage:losses.length?l.length/losses.length:0,
      winMean:w.length?mean(w):null,lossMean:l.length?mean(l):null};
  }
  function analyze(rows,deltas){
    const valid=rows.filter(r=>r&&[0,1].includes(r.y)&&r.opponent&&r.opponent!=='unknown');
    const groups=new Map();for(const r of valid){if(!groups.has(r.opponent))groups.set(r.opponent,[]);groups.get(r.opponent).push(r);}
    const pooled=evidence(valid,deltas);
    const eligible=(e,min)=>e.winKnown>=min&&e.lossKnown>=min&&e.winCoverage>=.7&&e.lossCoverage>=.7;
    return {total:valid.length,pooled,matchups:[...groups].map(([opponent,rs])=>{
      const e=evidence(rs,deltas),p=e.wins/e.n,source=eligible(e,5)?'matchup':eligible(pooled,10)?'pooled':null;
      return {opponent,n:e.n,wins:e.wins,losses:e.losses,share:e.n/valid.length,p,observed:e,
        source,payout:source==='matchup'?e:source==='pooled'?pooled:null};
    }).sort((a,b)=>b.n-a.n||a.opponent.localeCompare(b.opponent))};
  }
  function simulate(report,opponent,target,horizon){
    const m=report.matchups.find(x=>x.opponent===opponent);
    if(!m||![50,100,200,500].includes(horizon)||!Number.isFinite(target)||target<0||target>1)return null;
    const base={opponent,horizon,currentRate:m.p,targetRate:target,encounters:horizon*m.share,n:m.n,wins:m.wins,losses:m.losses,share:m.share,source:m.source,observed:m.observed,payout:m.payout,baseline:null,improved:null,gain:null};
    if(m.n<10)return {...base,reason:'対象キャラとの対戦が10試合未満'};
    if(!m.payout)return {...base,reason:'勝敗別のMR差分データ不足'};
    const {winMean,lossMean}=m.payout,expected=p=>base.encounters*(p*winMean-(1-p)*lossMean);
    return {...base,baseline:expected(m.p),improved:expected(target),gain:base.encounters*(target-m.p)*(winMean+lossMean),reason:m.n<20?'少数データ・参考値':'条件固定の参考試算'};
  }
  return {analyze,simulate};
});
