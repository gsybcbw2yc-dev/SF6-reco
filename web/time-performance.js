/* Time-of-day analysis based only on stored match records; no play-time inference. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6TimePerformance=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const JST_OFFSET=9*60*60*1000;
  const HOURS=[1,2,4];
  const DAYS=['日','月','火','水','木','金','土'];
  function parts(value){
    const ms=Date.parse(value);
    if(!Number.isFinite(ms))return null;
    const d=new Date(ms+JST_OFFSET);
    return {ms,day:d.toISOString().slice(0,10),hour:d.getUTCHours(),weekday:d.getUTCDay()};
  }
  function make(label){return {label,games:0,wins:0,losses:0,draws:0,unknown:0,days:new Set()};}
  function add(stat,row,part){
    stat.games++;
    const field={win:'wins',loss:'losses',draw:'draws'}[row.outcome]||'unknown';
    stat[field]++;
    stat.days.add(part.day);
  }
  function finish(s){
    const rated=s.wins+s.losses+s.draws;
    return {label:s.label,games:s.games,wins:s.wins,losses:s.losses,draws:s.draws,unknown:s.unknown,
      playDays:s.days.size,winRate:rated?100*s.wins/rated:null,
      enough:s.games>=30&&s.days.size>=5};
  }
  function analyze(rows,span=4){
    if(!HOURS.includes(span))throw new RangeError('Time bucket must be 1, 2 or 4 hours');
    const slots=Array.from({length:24/span},(_,i)=>{
      const h=i*span;return make(`${String(h).padStart(2,'0')}:00〜${String(h+span).padStart(2,'0')}:00`);
    });
    const weekdays=DAYS.map(d=>make(d+'曜'));
    const total=make('全時間');
    let undated=0;
    for(const row of rows){
      const part=parts(row.occurred_at);
      if(!part){undated++;continue;}
      add(slots[Math.floor(part.hour/span)],row,part);
      add(weekdays[part.weekday],row,part);
      add(total,row,part);
    }
    return {span,slots:slots.map(finish),weekdays:weekdays.map(finish),total:finish(total),
      undated,timeBasis:'buckler_uploaded_at',minGames:30,minDays:5};
  }
  function previousPeriod(rows,options,span=4,now=Date.now()){
    if(options.days==='all')return null;
    const days=Number(options.days);
    if(!Number.isFinite(days)||days<1)return null;
    const ms=days*86400000,from=now-ms,previousFrom=from-ms;
    // Apply mode/character/control filters before slicing two equal calendar durations.
    const eligible=rows.filter(row=>(options.mode==='all'||row.mode===options.mode)&&
      (options.character==='all'||row.character===options.character)&&
      (options.ownControl==='all'||row.own_control===options.ownControl)&&
      (options.opponentControl==='all'||row.opponent_control===options.opponentControl));
    const recent=eligible.filter(row=>{const t=Date.parse(row.occurred_at);return t>=from&&t<=now;});
    const prior=eligible.filter(row=>{const t=Date.parse(row.occurred_at);return t>=previousFrom&&t<from;});
    return {days,recent:analyze(recent,span),prior:analyze(prior,span)};
  }
  return {analyze,previousPeriod,parts};
});
