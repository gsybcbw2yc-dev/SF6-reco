/* Pure analysis over the sanitized archive. No persistent player identity. */
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6TrainingInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const validDelta=d=>d&&['verified','inferred'].includes(d.basis)&&finite(d.delta);
  const key=(character,opponent)=>JSON.stringify([character,opponent]);
  function matchupMR(rows,deltas){
    const out=new Map();
    for(const r of rows){
      if(r.mode!=='ranked'||!finite(r.mr_before)||r.mr_before<=0)continue;
      const k=key(r.character,r.opponent_character),g=out.get(k)||{total:0,known:0,verified:0,net:0};
      g.total++;const d=deltas.get(r.key);
      if(validDelta(d)){g.known++;g.net+=d.delta;if(d.basis==='verified')g.verified++;}
      out.set(k,g);
    }
    for(const g of out.values()){g.average=g.known?g.net/g.known:null;g.coverage=g.known/g.total;}
    return out;
  }
  function rematches(fullRows,selectedRows,phaseKey=()=>null){
    const selected=new Set(selectedRows.map(r=>r.key)),seen=new Set();
    const rows=fullRows.filter(r=>r.key&&Number.isFinite(Date.parse(r.occurred_at||''))&&!seen.has(r.key)&&seen.add(r.key))
      .sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.key.localeCompare(b.key));
    const counters=Object.fromEntries(['first','second','third','afterWin','afterLoss','twoWin','twoLoss'].map(k=>[k,{n:0,w:0}]));
    const add=(k,win)=>{counters[k].n++;counters[k].w+=Number(win);};
    const eligible=r=>r&&selected.has(r.key)&&r.mode==='ranked'&&['win','loss'].includes(r.outcome);
    let position=null,known=0,linked=0;
    for(let i=0;i<rows.length;i++){
      const r=rows[i],prev=rows[i-1],edge=r.rematch_edge,prior=position;
      position=null;
      if(!prev||r.mode!=='ranked'||edge?.previous!==prev.key||typeof edge.same!=='boolean'||
        r.occurred_at===prev.occurred_at||rows[i-2]?.occurred_at===prev.occurred_at||rows[i+1]?.occurred_at===r.occurred_at)continue;
      const act=phaseKey(r),prevAct=phaseKey(prev);
      if(!act||act==='unknown'||!prevAct||prevAct==='unknown')continue;
      if(!edge.same||act!==prevAct){position=1;}
      else {
        if(prev.mode!=='ranked'||r.character!==prev.character||r.opponent_character!==prev.opponent_character||
          r.own_control!==prev.own_control||r.opponent_control!==prev.opponent_control||Date.parse(r.occurred_at)-Date.parse(prev.occurred_at)>600000)continue;
        position=prior===null?null:prior+1;
        if(eligible(r)&&eligible(prev)){linked++;
          if(position===2){if(prev.outcome==='win')add('afterWin',r.outcome==='win');else add('afterLoss',r.outcome==='win');
            add('twoWin',prev.outcome==='win'&&r.outcome==='win');add('twoLoss',prev.outcome==='loss'&&r.outcome==='loss');}}
      }
      if(eligible(r)){known++;if(position===1)add('first',r.outcome==='win');if(position===2)add('second',r.outcome==='win');if(position===3)add('third',r.outcome==='win');}
    }
    return {counters,known,linked,total:selectedRows.filter(eligible).length};
  }
  function priorities(adjusted,cleanRows,deltas){
    const total=cleanRows.length;
    const wins=[],losses=[];
    for(const r of cleanRows){const d=deltas.get(r.key);if(!validDelta(d))continue;
      if(r.y===1&&d.delta>0)wins.push(d.delta);if(r.y===0&&d.delta<0)losses.push(-d.delta);}
    const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
    const swing=wins.length>=5&&losses.length>=5&&wins.length+losses.length>=20?mean(wins)+mean(losses):null;
    const rows=adjusted.matchups.filter(m=>m.qualified&&m.delta<0&&adjusted.validated).map(m=>{
      const share=m.total/total,score=share*(-m.delta),improvement=Math.min(5,-m.delta);
      return {...m,share,score,improvement,mrGain:swing===null?null:share*improvement*swing};
    }).sort((a,b)=>b.score-a.score||b.n-a.n||a.character.localeCompare(b.character));
    return {rows,swing,total,knownDeltas:wins.length+losses.length,validated:adjusted.validated};
  }
  return {key,matchupMR,rematches,priorities};
});
