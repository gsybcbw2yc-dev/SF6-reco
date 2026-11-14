/* ACT provenance:
 * - Current ACT: read from official PLAY pageProps.play.current_season_id.
 * - Match records without an explicit phase: assign the last observed ACT
 *   by upload time (inferred, never a direct match-phase verification).
 * - Before first verified snapshot: the user's Act 14 assumption stays provisional.
 * - Between the last old-ACT and first new-ACT snapshot: unknown boundary.
 */
(function(root,factory){
  const config=factory();
  if(typeof module==='object'&&module.exports)module.exports=config;
  root.SF6PhaseConfig=config;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const ACTS=[{act:14,effectiveFrom:null,source:'user_provisional'}];
  let observations=[],boundaries=[];
  const actNumber=value=>{
    if(!/^\d{1,3}$/.test(String(value??'')))return null;
    const n=Number(value);
    return n>=1&&n<=100?n:null;
  };
  function setVerifiedObservations(rows){
    const filtered=(Array.isArray(rows)?rows:[])
      .filter(x=>x&&x.phase_source==='play_page.play.current_season_id'&&
        actNumber(x.phase)!==null&&Number.isFinite(Date.parse(x.observed_at||'')))
      .map(x=>({act:actNumber(x.phase),at:Date.parse(x.observed_at)}))
      .sort((a,b)=>a.at-b.at||a.act-b.act);
    // Contradictory values at the same instant cannot establish an ACT.
    const uniq=[];
    for(const item of filtered){
      const prev=uniq.at(-1);
      if(prev&&prev.at===item.at){
        if(prev.act!==item.act)prev.conflict=true;
      }else uniq.push({...item});
    }
    observations=uniq.filter(x=>!x.conflict);
    boundaries=[];
    for(let i=1;i<observations.length;i++){
      if(observations[i].act!==observations[i-1].act)
        boundaries.push({from:observations[i-1].at,to:observations[i].at});
    }
    return observations.length;
  }
  function assignedAct(time){
    const stamp=Date.parse(time||'');
    let active=ACTS[0];
    if(!Number.isFinite(stamp))return active;
    for(const entry of ACTS.slice(1)){
      if(Number.isFinite(Date.parse(entry.effectiveFrom||''))&&
        stamp>=Date.parse(entry.effectiveFrom))active=entry;
    }
    for(const entry of observations){
      if(entry.at>stamp)break;
      active={act:entry.act,effectiveFrom:new Date(entry.at).toISOString(),
        source:'official_observation'};
    }
    if(boundaries.some(x=>stamp>x.from&&stamp<x.to))
      return {act:null,effectiveFrom:null,source:'transition_uncertain'};
    return active;
  }
  function latestVerified(){
    const item=observations.at(-1);
    return item?{act:item.act,observedAt:new Date(item.at).toISOString()}:null;
  }
  function version(){
    return observations.length+':'+(observations.at(-1)?.at||0)+':'+boundaries.length;
  }
  function label(phase,time){
    const number=actNumber(phase);
    if(number!==null)return `Act ${number}（公式取得）`;
    const assigned=assignedAct(time);
    if(assigned.act===null)return 'Act不明（切替境界）';
    return `Act ${assigned.act}（${assigned.source==='official_observation'?'時刻推定':'暫定'}）`;
  }
  return {get currentAct(){return latestVerified()?.act??ACTS.at(-1).act;},
    acts:ACTS,label,assignedAct,setVerifiedObservations,latestVerified,version};
});
