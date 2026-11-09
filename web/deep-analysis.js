/* SF6-reco: read-only advanced ranked-match analytics from sanitized match archives.
 * No battle-result fabrication, no cross-session streaks, and no post-match MR inference.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  root.SF6DeepAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const OUTCOMES=new Set(['win','loss','draw']);
  const WINDOWS=[20,50,100];
  const POSITION_BANDS=[
    {label:'1〜10試合目',start:0,end:10},
    {label:'11〜20試合目',start:10,end:20},
    {label:'21〜30試合目',start:20,end:30},
    {label:'31試合目以降',start:30,end:Infinity}
  ];
  const LOSS_LABELS=['連敗なし（直前は勝ち・引分）','1連敗後','2連敗後','3連敗以上の後'];
  const MR_LABELS=['格下（MR差 −100以下）','やや格下（−99〜−11）','同格（±10以内）','やや格上（+11〜+99）','格上（+100以上）'];

  function rated(rows){
    let wins=0,losses=0,draws=0,unknown=0;
    for(const r of rows){
      if(r.outcome==='win')wins++;
      else if(r.outcome==='loss')losses++;
      else if(r.outcome==='draw')draws++;
      else unknown++;
    }
    return {games:rows.length,wins,losses,draws,unknown,
      winRate:wins+losses+draws?100*wins/(wins+losses+draws):null};
  }
  function validDate(row){return typeof row.occurred_at==='string'&&Number.isFinite(Date.parse(row.occurred_at));}
  function rankRows(rows){return rows.filter(r=>r.mode==='ranked');}
  function chronological(rows){
    return rows.filter(validDate).slice().sort((a,b)=>
      Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||
      String(a.key||'').localeCompare(String(b.key||'')));
  }
  function sessions(rows,gap=45){
    if(!Number.isFinite(gap)||gap<1)throw new RangeError('Invalid session gap');
    const sorted=chronological(rankRows(rows));
    const groups=[];
    for(const r of sorted){
      const last=groups.at(-1)?.at(-1);
      if(!last||Date.parse(r.occurred_at)-Date.parse(last.occurred_at)>=gap*60000||
          r.phase!==last.phase)groups.push([r]);
      else groups.at(-1).push(r);
    }
    const ambiguous=groups.filter(g=>new Set(g.map(x=>x.occurred_at)).size!==g.length);
    return {groups:groups.filter(g=>!ambiguous.includes(g)),ambiguousSessions:ambiguous.length,
      excludedAmbiguousMatches:ambiguous.reduce((n,g)=>n+g.length,0),
      undated:rankRows(rows).filter(r=>!validDate(r)).length};
  }
  function afterLosses(rows,gap=45){
    const s=sessions(rows,gap),buckets=LOSS_LABELS.map(label=>({label,rows:[]}));
    let firstMatches=0,unresolved=0;
    for(const group of s.groups){
      let losses=null;
      for(let i=0;i<group.length;i++){
        const match=group[i];
        if(i===0)firstMatches++;
        else if(losses!==null) buckets[Math.min(3,losses)].rows.push(match);
        else unresolved++;
        if(match.outcome==='loss')losses=losses===null?1:losses+1;
        else if(match.outcome==='win'||match.outcome==='draw')losses=0;
        else losses=null; // unknown breaks the prior-streak chain
      }
    }
    return {buckets:buckets.map(b=>({label:b.label,...rated(b.rows)})),
      sessions:s.groups.length,firstMatches,unresolved,ambiguousSessions:s.ambiguousSessions,
      excludedAmbiguousMatches:s.excludedAmbiguousMatches,undated:s.undated};
  }
  function mrDifference(rows){
    const buckets=MR_LABELS.map(label=>({label,rows:[]}));
    let excluded=0;
    for(const r of rankRows(rows)){
      const own=r.mr_before,opp=r.opponent_mr_before;
      if(!Number.isFinite(own)||!Number.isFinite(opp)||own<=0||opp<=0){excluded++;continue;}
      const d=opp-own;
      const i=d<=-100?0:d<=-11?1:d<=10?2:d<=99?3:4;
      buckets[i].rows.push(r);
    }
    return {buckets:buckets.map(b=>({label:b.label,...rated(b.rows)})),
      excluded,valid:rankRows(rows).length-excluded,definition:'相手の対戦前MR − 自分の対戦前MR'};
  }
  function sessionPositions(rows,gap=45){
    const s=sessions(rows,gap);
    const buckets=POSITION_BANDS.map(b=>({...b,rows:[],sessions:0}));
    for(const group of s.groups){
      for(const b of buckets){
        const slice=group.slice(b.start,b.end);
        if(slice.length){b.rows.push(...slice);b.sessions++;}
      }
    }
    return {buckets:buckets.map(b=>({label:b.label,sessions:b.sessions,...rated(b.rows)})),
      sessions:s.groups.length,ambiguousSessions:s.ambiguousSessions,
      excludedAmbiguousMatches:s.excludedAmbiguousMatches,undated:s.undated};
  }
  function matchedOpponents(recent,prior){
    const map=new Map();
    for(const [side,rows] of [['recent',recent],['prior',prior]]){
      const g=new Map();
      for(const r of rows){
        const id=r.opponent_character;
        if(!id)continue;
        if(!g.has(id))g.set(id,[]);
        g.get(id).push(r);
      }
      for(const [opponent,group] of g){
        if(!map.has(opponent))map.set(opponent,{opponent,recent:null,prior:null});
        map.get(opponent)[side]=rated(group);
      }
    }
    return [...map.values()].filter(x=>x.recent&&x.prior&&x.recent.games>=3&&x.prior.games>=3&&
      x.recent.winRate!==null&&x.prior.winRate!==null)
      .map(x=>({...x,change:x.recent.winRate-x.prior.winRate}))
      .sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)||b.recent.games-a.recent.games).slice(0,5);
  }
  function recentPerformance(rows){
    const rank=rankRows(rows);
    // If times tie, ordering by hash would be arbitrary. Exclude every such row from rolling boundaries.
    const counts=new Map();
    for(const row of rank)if(validDate(row))counts.set(row.occurred_at,(counts.get(row.occurred_at)||0)+1);
    const ambiguous=rank.filter(r=>validDate(r)&&counts.get(r.occurred_at)>1).length;
    const order=chronological(rank).filter(r=>counts.get(r.occurred_at)===1).reverse();
    const windows=WINDOWS.map(size=>{
      const recent=order.slice(0,size),prior=order.slice(size,size*2);
      return {size,available:recent.length,previousAvailable:prior.length,
        current:rated(recent),previous:prior.length===size?rated(prior):null,
        comparisonsComplete:recent.length===size&&prior.length===size,
        matchupShift:recent.length===size&&prior.length===size?matchedOpponents(recent,prior):[]};
    });
    return {windows,total:order.length,ambiguousExcluded:ambiguous,
      undated:rank.filter(r=>!validDate(r)).length};
  }
  function analyze(rows,gap=45){
    return {ranked:rankRows(rows).length,filteredOut:rows.length-rankRows(rows).length,
      loss:afterLosses(rows,gap),mr:mrDifference(rows),position:sessionPositions(rows,gap),
      recent:recentPerformance(rows)};
  }
  return {analyze,afterLosses,mrDifference,sessionPositions,recentPerformance,sessions,rated,matchedOpponents};
});
