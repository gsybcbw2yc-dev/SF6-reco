/* Exploratory equal-win-probability opponent MR.
 * Uses only chronological, ranked, positive-MR 1v1 observations.
 * The 50% crossing is NOT verified true skill or future MR.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6FairRating=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CENTER=1400,MR_SCALE=100,MIN_N=100;
  const sigmoid=z=>z>=0?1/(1+Math.exp(-Math.min(35,z))):
    Math.exp(Math.max(-35,z))/(1+Math.exp(Math.max(-35,z)));
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  const stamp=t=>Date.parse(t||'');
  const rate=xs=>xs.length?xs.reduce((s,r)=>s+r.y,0)/xs.length:null;
  const percentile=(sorted,p)=>sorted[Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)))];
  function period(r,actAt=()=>null){
    const raw=r.phase;
    if(raw!==null&&raw!==undefined&&/^\d{1,3}$/.test(String(raw))){
      const n=Number(raw);
      if(n>=1&&n<=100)
        return {key:'act:'+n,label:'Act '+n,inferred:false,origin:'record_phase'};
    }
    if(raw&&raw!=='unknown')return {key:'unknown',label:'Act不明',inferred:false,origin:'invalid_phase'};
    const assigned=actAt(r.occurred_at);
    const num=typeof assigned==='object'&&assigned!==null?assigned.act:assigned;
    if(Number.isInteger(Number(num))&&num!==null&&num!==undefined&&Number(num)>=1&&Number(num)<=100){
      return {key:'act:'+Number(num),label:'Act '+Number(num),inferred:true,
        origin:typeof assigned==='object'?assigned.source||'time_inference':'time_inference'};
    }
    return {key:'unknown',label:'Act不明',inferred:false,origin:'unverified'};
  }
  function clean(rows,{character,actAt=()=>null}={}){
    const used=new Set(),out=[];
    for(const r of rows){
      if(!r||r.mode!=='ranked'||r.character!==character||!r.key||used.has(r.key)||
         !valid(r.mr_before)||!valid(r.opponent_mr_before)||
         !['win','loss'].includes(r.outcome)||!Number.isFinite(stamp(r.occurred_at)))continue;
      used.add(r.key);
      const phase=period(r,actAt);
      out.push({key:r.key,t:stamp(r.occurred_at),time:r.occurred_at,opp:r.opponent_mr_before,
        own:r.mr_before,y:r.outcome==='win'?1:0,phase:phase.key,
        phaseLabel:phase.label,inferred:phase.inferred,origin:phase.origin,
        opponent:r.opponent_character});
    }
    out.sort((a,b)=>a.t-b.t||a.key.localeCompare(b.key));
    // If upload timestamps collide, fight sequence is unproven. They still
    // contribute to a descriptive rate, but cannot set a temporal cut boundary.
    return out;
  }
  function fit(rows){
    if(rows.length<20)return null;
    let wins=rows.reduce((s,r)=>s+r.y,0);
    if(wins===0||wins===rows.length)return null;
    let a=Math.log((wins+.5)/(rows.length-wins+.5)),b=0;
    for(let i=0;i<50;i++){
      let g0=-.02*a,g1=-b,h00=.02,h01=0,h11=1;
      for(const r of rows){
        const x=(r.opp-CENTER)/MR_SCALE;
        const p=sigmoid(a+b*x),w=p*(1-p);
        g0+=r.y-p;g1+=(r.y-p)*x;
        h00+=w;h01+=w*x;h11+=w*x*x;
      }
      const det=h00*h11-h01*h01;
      if(det<=1e-9)return null;
      const da=Math.max(-1,Math.min(1,(g0*h11-g1*h01)/det));
      const db=Math.max(-1,Math.min(1,(g1*h00-g0*h01)/det));
      a+=da;b+=db;
      if(Math.abs(da)+Math.abs(db)<1e-9)break;
    }
    return {a,b,cross:Math.abs(b)>1e-9?CENTER-MR_SCALE*a/b:null,
      probability:mr=>sigmoid(a+b*(mr-CENTER)/MR_SCALE)};
  }
  function conditions(rows,model){
    if(rows.length<MIN_N)return {ok:false,reason:'対戦データ100試合未満'};
    const wins=rows.reduce((s,r)=>s+r.y,0);
    if(wins<20||rows.length-wins<20)return {ok:false,reason:'勝ち・負けそれぞれ20試合未満'};
    const mr=rows.map(r=>r.opp).sort((a,b)=>a-b);
    const low=percentile(mr,.05),high=percentile(mr,.95);
    if(high-low<100)return {ok:false,reason:'相手MRの分布が狭すぎます'};
    if(!model||model.b>=-.10)return {ok:false,reason:'相手MRが上がるほど勝率が下がる関係を確認できません'};
    if(!Number.isFinite(model.cross)||model.cross<low||model.cross>high)
      return {ok:false,reason:'50%到達点が主な観測MR範囲の外です'};
    const left=rows.filter(x=>x.opp<model.cross).length;
    const right=rows.length-left;
    if(left<30||right<30)return {ok:false,reason:'50%到達点の片側の対戦が30試合未満'};
    return {ok:true,reason:'条件付き推定可能',low,high,left,right};
  }
  function blocks(rows){
    const groups=[];let current=[],prev=null;
    for(const r of rows){
      const day=new Date(r.t).toISOString().slice(0,10);
      if(prev&&(r.t-prev.t>45*60000||day!==new Date(prev.t).toISOString().slice(0,10))){
        groups.push(current);current=[];
      }
      current.push(r);prev=r;
    }
    if(current.length)groups.push(current);
    return groups;
  }
  // Session-resampling interval captures within-session result dependence.
  // Deterministic seed makes CI reproducible in the browser.
  function interval(rows,{iterations=180,seed=20261115}={}){
    const groups=blocks(rows),dist=[];
    if(groups.length<8)return {range:null,valid:0,iterations,sessions:groups.length,reason:'独立セッションが8件未満'};
    let state=seed>>>0;
    const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
    for(let i=0;i<iterations;i++){
      const sample=[];
      for(let j=0;j<groups.length;j++)sample.push(...groups[Math.floor(rand()*groups.length)]);
      const m=fit(sample),check=conditions(sample,m);
      if(check.ok)dist.push(m.cross);
    }
    dist.sort((a,b)=>a-b);
    if(dist.length<iterations*.75)return {range:null,valid:dist.length,iterations,
      sessions:groups.length,reason:'ブロック再標本化で推定不能な組合せが多い'};
    return {range:[percentile(dist,.025),percentile(dist,.975)],valid:dist.length,
      iterations,sessions:groups.length,reason:'セッション単位の再標本化による参考95%区間'};
  }
  function backtest(rows){
    const groups=blocks(rows),all=groups.flat();
    if(all.length<200||groups.length<8)return {status:'insufficient',reason:'200試合・8セッション以上が必要',
      tested:0,folds:0};
    // Choose the session boundary closest to 60% of the full archive.
    // NEVER leak the same session into both train and test.
    const target=all.length*.6;
    let closest=-1,dist=Infinity,prior=0;
    for(let i=1;i<groups.length;i++){
      prior+=groups[i-1].length;
      if(prior<200||all.length-prior<60)continue;
      if(Math.abs(prior-target)<dist){dist=Math.abs(prior-target);closest=i;}
    }
    if(closest===-1)return {status:'insufficient',reason:'セッションを分離できる学習・検証期間が不足',
      tested:0,folds:0};
    let train=groups.slice(0,closest).flat(),tested=0,folds=0;
    const scores={brier:0,baseBrier:0,logloss:0,baseLogloss:0};
    for(const test of groups.slice(closest)){
      const model=fit(train),baseline=rate(train);
      if(model&&baseline!==null){
        for(const r of test){
          const p=Math.max(1e-6,Math.min(1-1e-6,model.probability(r.opp))),
            q=Math.max(1e-6,Math.min(1-1e-6,baseline));
          scores.brier+=(r.y-p)**2;scores.baseBrier+=(r.y-q)**2;
          scores.logloss+=-(r.y*Math.log(p)+(1-r.y)*Math.log(1-p));
          scores.baseLogloss+=-(r.y*Math.log(q)+(1-r.y)*Math.log(1-q));
        }
        tested+=test.length;folds++;
      }
      train.push(...test);
    }
    return {status:tested>=60?'ready':'insufficient',tested,folds,
      training:groups.slice(0,closest).reduce((sum,g)=>sum+g.length,0),
      brier:tested?scores.brier/tested:null,baselineBrier:tested?scores.baseBrier/tested:null,
      logloss:tested?scores.logloss/tested:null,baselineLogloss:tested?scores.baseLogloss/tested:null,
      improved:tested>=60&&scores.brier<scores.baseBrier,
      reason:'古いセッションのみで学習し、各次セッションを予測後に追加して再学習（基準：過去の全体勝率）'};
  }
  function mrBands(rows,step=100){
    const bins=new Map();
    for(const r of rows){
      const band=Math.floor(r.opp/step)*step;
      if(!bins.has(band))bins.set(band,{start:band,end:band+step-1,n:0,wins:0});
      const b=bins.get(band);b.n++;b.wins+=r.y;
    }
    return [...bins.values()].sort((a,b)=>a.start-b.start)
      .map(x=>({...x,winRate:100*x.wins/x.n}));
  }
  function evaluate(rows){
    const model=fit(rows),check=conditions(rows,model);
    const result={n:rows.length,wins:rows.reduce((s,r)=>s+r.y,0),
      meanMR:rows.length?rows.reduce((s,r)=>s+r.own,0)/rows.length:null,
      model:model?{a:model.a,b:model.b,cross:model.cross}:null,
      crossing:check.ok?model.cross:null,check,groups:blocks(rows).length,
      interval:check.ok?interval(rows):{range:null,valid:0,reason:check.reason},
      backtest:backtest(rows),bands:mrBands(rows)};
    // No interval and no validated forward testing -> exploration, not proof.
    result.status=!check.ok?'unavailable':
      !result.interval.range?'uncertain':
      !result.backtest.improved?'not_validated':'exploratory';
    return result;
  }
  function analyze(rows,{character='AKUMA',actAt=()=>null,selectedAct=null}={}){
    const cleanRows=clean(rows,{character,actAt}),byAct=new Map();
    for(const r of cleanRows){
      if(r.phase==='unknown')continue;
      if(!byAct.has(r.phase))byAct.set(r.phase,{key:r.phase,label:r.phaseLabel,rows:[]});
      byAct.get(r.phase).rows.push(r);
    }
    const acts=[...byAct.values()].sort((a,b)=>b.rows.at(-1).t-a.rows.at(-1).t);
    const selected=acts.find(x=>x.key===selectedAct)||acts[0]||null;
    const current=selected?evaluate(selected.rows):evaluate([]);
    let shift=null;
    if(selected?.rows.length>=300){
      const half=Math.floor(selected.rows.length/2);
      const early=evaluate(selected.rows.slice(0,half));
      const late=evaluate(selected.rows.slice(half));
      shift={early:early.crossing,late:late.crossing,
        difference:early.crossing!==null&&late.crossing!==null?
          late.crossing-early.crossing:null,earlyN:half,lateN:selected.rows.length-half};
    }
    const selectedRows=selected?.rows||[];
    return {character,total:cleanRows.length,unassignedN:cleanRows.filter(x=>x.phase==='unknown').length,
      acts:acts.map(x=>({key:x.key,label:x.label,count:x.rows.length,
        inferredN:x.rows.filter(r=>r.inferred).length,
        retrospectiveN:x.rows.filter(r=>r.origin==='retrospective_inference').length})),
      selectedAct:selected?.key??null,actLabel:selected?.label??'公式Act未確認',
      selectedN:selectedRows.length,inferredN:selectedRows.filter(r=>r.inferred).length,
      retrospectiveN:selectedRows.filter(r=>r.origin==='retrospective_inference').length,
      current,shift,scope:'同一ACTの保存済みランクマッチ／勝敗・対戦前MRが検証可能な試合のみ'};
  }
  return {CENTER,MIN_N,sigmoid,period,clean,fit,conditions,blocks,interval,backtest,mrBands,evaluate,analyze};
});
