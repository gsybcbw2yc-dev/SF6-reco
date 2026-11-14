/* Match-derived rating evidence is a separate stream from periodic snapshots.
 * Each timestamp is Buckler uploaded_at, and each score is PRE-match only.
 * Do not manufacture 30-minute measurements or infer the last match's result.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6RatingEvidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const stamped=r=>r&&typeof r.observed_at==='string'&&Number.isFinite(Date.parse(r.observed_at));
  const usable=(n,key)=>typeof n==='number'&&Number.isFinite(n)&&(key==='mr'?n>0:n>=0);
  function normalize(payload){
    if(!payload||payload.schema!==1||!Array.isArray(payload.events))return {schema:1,events:[],characters:{},checked_at:null};
    const seen=new Set();
    const events=payload.events.filter(r=>{
      if(!r||r.source!=='battlelog_pre_match'||r.rating_basis!=='pre_match'||
         r.time_basis!=='buckler_uploaded_at'||!stamped(r)||typeof r.character!=='string'||
         !r.key||seen.has(r.key))return false;
      if(!usable(r.mr,'mr')&&!usable(r.lp,'lp'))return false;
      seen.add(r.key);return true;
    }).sort((a,b)=>a.observed_at.localeCompare(b.observed_at)||a.key.localeCompare(b.key));
    const characters={};
    for(const r of events)characters[r.character]=r;
    return {schema:1,events,characters,checked_at:typeof payload.checked_at==='string'&&
      Number.isFinite(Date.parse(payload.checked_at))?payload.checked_at:null};
  }
  function trace(archive,character,phase,cutoff,key){
    return (archive?.events||[]).filter(r=>
      (character==='すべて'||r.character===character)&&
      (phase==='all'||r.phase===phase)&&
      Date.parse(r.observed_at)>=cutoff&&usable(r[key],key));
  }
  function latest(archive,character){
    if(!archive||!archive.characters||character==='すべて')return null;
    return archive.characters[character]||null;
  }
  function segments(points,gapMinutes=12){
    const result=[];let segment=[];
    for(const p of points){
      const prev=segment.at(-1);
      if(prev&&(p.character!==prev.character||p.phase!==prev.phase||
          Date.parse(p.observed_at)-Date.parse(prev.observed_at)>gapMinutes*60000)){
        if(segment.length)result.push(segment);
        segment=[];
      }
      segment.push(p);
    }
    if(segment.length)result.push(segment);
    return result;
  }
  return {normalize,trace,latest,segments,usable};
});
