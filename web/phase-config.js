/* Official Buckler ACT is the only numeric source.
 * PLAY pageProps.play.current_season_id is collected into rating snapshots.
 * Old "unknown" match/snapshot records are mapped to the same ACT bucket
 * using these observations; pre-first-observation mapping is retrospective,
 * NEVER a verified historical ACT. Original records remain untouched.
 * When the verified ACT changes, the unobserved transition window stays unknown.
 */
(function(root,factory){
  const config=factory();
  if(typeof module==='object'&&module.exports)module.exports=config;
  root.SF6PhaseConfig=config;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  let observations=[],boundaries=[];
  const actNumber=value=>{
    if(!/^\d{1,3}$/.test(String(value??'')))return null;
    const n=Number(value);
    return n>=1&&n<=100?n:null;
  };
  const unknown=(source='unverified')=>({act:null,effectiveFrom:null,source,inferred:false});
  function setVerifiedObservations(rows){
    const filtered=(Array.isArray(rows)?rows:[])
      .filter(x=>x&&x.phase_source==='play_page.play.current_season_id'&&
        actNumber(x.phase)!==null&&Number.isFinite(Date.parse(x.observed_at||'')))
      .map(x=>({act:actNumber(x.phase),at:Date.parse(x.observed_at)}))
      .sort((a,b)=>a.at-b.at||a.act-b.act);
    const uniq=[];
    for(const item of filtered){
      const prev=uniq.at(-1);
      if(prev&&prev.at===item.at){
        if(prev.act!==item.act)prev.conflict=true;
      }else uniq.push({...item});
    }
    observations=uniq.filter(x=>!x.conflict).map(({at,act})=>({at,act}));
    boundaries=[];
    for(let i=1;i<observations.length;i++){
      if(observations[i].act!==observations[i-1].act)
        boundaries.push({from:observations[i-1].at,to:observations[i].at});
    }
    return observations.length;
  }
  function assignedAct(time){
    const stamp=Date.parse(time||'');
    if(!Number.isFinite(stamp))return unknown('invalid_time');
    if(!observations.length)return unknown();
    const first=observations[0];
    if(stamp<first.at)return {act:first.act,effectiveFrom:null,
      source:'retrospective_inference',inferred:true};
    if(boundaries.some(x=>stamp>x.from&&stamp<x.to))
      return unknown('transition_uncertain');
    let latest=first;
    for(const item of observations){
      if(item.at>stamp)break;
      latest=item;
    }
    return {act:latest.act,effectiveFrom:new Date(latest.at).toISOString(),
      source:'official_observation',inferred:true};
  }
  function resolve(phase,time){
    const direct=actNumber(phase);
    if(direct!==null)return {act:direct,effectiveFrom:time||null,
      source:'record_phase',inferred:false};
    // Malformed non-empty ACT IDs are never reinterpreted as another ACT.
    if(phase!==null&&phase!==undefined&&phase!==''&&phase!=='unknown')
      return unknown('invalid_record_phase');
    return assignedAct(time);
  }
  function phaseKey(phase,time){
    const resolved=resolve(phase,time);
    return resolved.act===null?'unknown':String(resolved.act);
  }
  function label(phase,time){
    const resolved=resolve(phase,time);
    return resolved.act===null?'Act不明':'Act '+resolved.act;
  }
  function latestVerified(){
    const item=observations.at(-1);
    return item?{act:item.act,observedAt:new Date(item.at).toISOString()}:null;
  }
  function version(){
    return observations.map(x=>x.at+':'+x.act).join('|');
  }
  return {get currentAct(){return latestVerified()?.act??null;},
    get acts(){return observations.map(x=>({act:x.act,effectiveFrom:new Date(x.at).toISOString(),source:'official'}));},
    actNumber,resolve,phaseKey,label,assignedAct,setVerifiedObservations,latestVerified,version};
});
