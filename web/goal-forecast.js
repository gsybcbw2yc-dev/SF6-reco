/* SF6-reco conditional MR target extrapolation, not a claim of play hours or certainty. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6GoalForecast=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  const MAX_STALE=3*HOUR;
  const MAX_ETA=24*365; // Never publish 1+ year extrapolations as numeric forecasts.
  function timeLabel(hours){
    if(hours===0)return '達成済み';
    if(!Number.isFinite(hours)||hours<0)return '算定不可';
    if(hours>MAX_ETA)return '1年以上（算定対象外）';
    if(hours<24)return `約${hours.toFixed(1)}時間`;
    const rounded=Math.round(hours),days=Math.floor(rounded/24),remainder=rounded%24;
    return `約${days}日${remainder}時間`;
  }
  function rateValue(rate,isUsable){
    if(!isUsable||!Number.isFinite(rate)||rate<=0)return null;
    return rate;
  }
  // Rolling observed-value comparison: match a real snapshot about 24h before
  // the latest snapshot within 35 min, without inventing intermediate values.
  function rolling24h(rows,toleranceMinutes=35){
    const clean=rows.filter(p=>Number.isFinite(p?.mr)&&Number.isFinite(Date.parse(p?.observed_at)))
      .slice().sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
    const latest=clean.at(-1);
    if(!latest)return null;
    const end=Date.parse(latest.observed_at),target=end-24*HOUR;
    let best=null,error=Infinity;
    for(const p of clean.slice(0,-1)){
      if(p.character!==latest.character||p.phase!==latest.phase)continue;
      const d=Math.abs(Date.parse(p.observed_at)-target);
      if(d<=toleranceMinutes*60000&&d<error){error=d;best=p;}
    }
    if(!best)return null;
    const start=Date.parse(best.observed_at),elapsed=(end-start)/HOUR;
    if(elapsed<23||elapsed>25)return null;
    const delta=latest.mr-best.mr;
    return {start,end,delta,rate:delta/elapsed,
      observedStart:best.observed_at,observedEnd:latest.observed_at,
      elapsedHours:elapsed};
  }
  function analyze({latest,lastBar,regression,now=Date.now(),targets=[1500,1600]}){
    const observed=latest?Date.parse(latest.observed_at):NaN;
    const current=Number.isFinite(latest?.mr)?latest.mr:null;
    const age=now-observed,stale=!Number.isFinite(observed)||age>MAX_STALE||age< -10*60000;
    const barEnd=lastBar?.end;
    const shortOK=!stale&&lastBar?.delta!==null&&Number.isFinite(lastBar?.rate)&&
      Number.isFinite(barEnd)&&observed>=barEnd&&observed-barEnd<=MAX_STALE&&
      Number.isFinite(Date.parse(lastBar?.observedStart))&&
      Number.isFinite(Date.parse(lastBar?.observedEnd));
    const longOK=!stale&&regression?.available&&regression.count>=12&&
      regression.spanHours>=48&&Math.abs(regression.endStamp-observed)<60000;
    const short=rateValue(lastBar?.rate,shortOK);
    const long=rateValue(regression?.slope,longOK);
    const result=targets.map(target=>{
      const remaining=current===null?null:Math.max(0,target-current);
      const eta=rate=>remaining===0?0:remaining===null||rate===null?null:remaining/rate;
      return {target,remaining,shortHours:eta(short),longHours:eta(long),
        shortLabel:remaining===0?'達成済み':timeLabel(eta(short)),
        longLabel:remaining===0?'達成済み':timeLabel(eta(long))};
    });
    return {current,observedAt:latest?.observed_at??null,stale,
      shortRate:short,longRate:long,shortRawRate:shortOK?lastBar.rate:null,
      longRawRate:longOK?regression.slope:null,
      regressionHours:longOK?regression.spanHours:null,
      regressionCount:longOK?regression.count:0,
      targets:result};
  }
  return {analyze,timeLabel,rolling24h};
});
