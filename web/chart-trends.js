/* SF6-reco chart trends: descriptive statistics of observed ratings, not playing time.
   Pure calculations; safe for both browser script and Node regression tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6ChartTrends=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const HOUR=3600000;
  const GAP_MS=90*60000;
  function normalized(rows,key){
    return rows.filter(p=>p&&Number.isFinite(p[key])&&p.observed_at&&Number.isFinite(Date.parse(p.observed_at)))
      .map(p=>({...p,stamp:Date.parse(p.observed_at)}))
      .sort((a,b)=>a.stamp-b.stamp);
  }
  function sameSeries(a,b){
    return a.character===b.character&&a.phase===b.phase;
  }
  // Trailing five observations, not a time-weighted or interpolated "five-hour" value.
  // A gap/phase/character boundary resets the window rather than treating an unknown
  // interval as though ratings had been sampled continuously.
  function movingAverage(rows,key,size=5){
    const p=normalized(rows,key),segments=[];
    let current=[],window=[];
    for(let i=0;i<p.length;i++){
      const row=p[i],prev=p[i-1];
      if(prev&&(!sameSeries(row,prev)||row.stamp-prev.stamp>GAP_MS)){
        if(current.length)segments.push(current);
        current=[];window=[];
      }
      window.push(row[key]);
      if(window.length>size)window.shift();
      if(window.length>=3){
        current.push({stamp:row.stamp,value:window.reduce((a,b)=>a+b,0)/window.length});
      }
    }
    if(current.length)segments.push(current);
    return segments;
  }
  function regression(rows,key){
    const points=normalized(rows,key);
    if(points.length<3)return {available:false,reason:'観測点が3件未満です'};
    if(points.some(p=>!sameSeries(p,points[0])))return {available:false,reason:'複数のキャラクター・フェーズが混在しています'};
    const x0=points[0].stamp,spanHours=(points.at(-1).stamp-x0)/HOUR;
    if(spanHours<0.5)return {available:false,reason:'観測期間が30分未満です'};
    // Center observations before OLS to avoid numerical instability of timestamps.
    const n=points.length;
    const xs=points.map(p=>(p.stamp-x0)/HOUR);
    const meanX=xs.reduce((a,b)=>a+b,0)/n;
    const meanY=points.reduce((a,p)=>a+p[key],0)/n;
    let cov=0,varX=0;
    for(let i=0;i<n;i++){
      const delta=xs[i]-meanX;
      cov+=delta*(points[i][key]-meanY);
      varX+=delta*delta;
    }
    if(varX<=0)return {available:false,reason:'異なる観測時刻がありません'};
    const slope=cov/varX;
    const left=meanY+slope*(0-meanX);
    const right=meanY+slope*(spanHours-meanX);
    return {available:true,slope,startStamp:x0,endStamp:points.at(-1).stamp,
      startValue:left,endValue:right,count:n,spanHours};
  }
  return {normalized,movingAverage,regression};
});
