/* Infers a displayed MR change from consecutive rank-match PRE-match snapshots
 * or a stable official periodic post-match observation.
 * This is a reference estimate, never an official per-battle settled MR result.
 * Deliberately ignores unseen matches, different Acts/characters, timestamps tied
 * or farther than 10 minutes apart, and implausible/sign-inconsistent changes.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SF6MatchDeltas=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MAX_GAP_MINUTES=10,MAX_ABS_MR=50,MAX_FIRST_OBSERVATION_MINUTES=180;
  function usable(n){return typeof n==='number'&&Number.isFinite(n)&&n>0;}
  function actOf(r,time){
    if(typeof SF6PhaseConfig!=='undefined')return SF6PhaseConfig.resolve(r.phase,time).act;
    return /^\d{1,3}$/.test(String(r.phase??''))?Number(r.phase):null;
  }
  function signOK(outcome,mr,lp){
    return outcome==='win'?mr>0&&lp>=0:outcome==='loss'?mr<0&&lp<=0:outcome==='draw'?mr===0&&lp===0:false;
  }
  function infer(rows,observations=[]){
    const records=rows.filter(r=>r&&Number.isFinite(Date.parse(r.occurred_at||'')))
      .slice().sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||
        String(a.key||'').localeCompare(String(b.key||'')));
    const results=new Map();
    for(let i=0;i<records.length;i++){
      const cur=records[i],next=records[i+1],base={delta:null,basis:'unavailable',reason:'次の連続試合の対戦前MRを確認できません'};
      if(!cur.key)continue;
      if(cur.delta_basis==='verified_post_match_rating'&&Number.isFinite(cur.mr_delta)){
        results.set(cur.key,{delta:cur.mr_delta,basis:'verified',reason:'対戦後MRの検証済み値'});
        continue;
      }
      if(cur.mode!=='ranked'){results.set(cur.key,{...base,reason:'ランクマッチ以外は対象外'});continue;}
      if(!next){results.set(cur.key,base);continue;}
      const from=Date.parse(cur.occurred_at),to=Date.parse(next.occurred_at);
      const gap=(to-from)/60000;
      if(!(gap>0&&gap<=MAX_GAP_MINUTES)){
        results.set(cur.key,{...base,reason:gap===0?'試合の前後関係が同時刻で不明':
          '次試合まで10分を超えるか、時刻の前後関係が不明'});continue;
      }
      if(records[i-1]?.occurred_at===cur.occurred_at||
         records[i+2]?.occurred_at===next.occurred_at){
        results.set(cur.key,{...base,reason:'同じ記録時刻の試合があるため順序不明'});continue;
      }
      if(next.mode!=='ranked'||cur.character!==next.character||cur.phase!==next.phase||
         (cur.phase==='unknown'&&
          typeof SF6PhaseConfig!=='undefined'&&
          (SF6PhaseConfig.assignedAct(cur.occurred_at).act===null||
           SF6PhaseConfig.assignedAct(next.occurred_at).act===null||
           SF6PhaseConfig.assignedAct(cur.occurred_at).act!==SF6PhaseConfig.assignedAct(next.occurred_at).act))){
        results.set(cur.key,{...base,reason:'次試合のモード・キャラ・Actが異なるため比較不可'});continue;
      }
      if(!usable(cur.mr_before)||!usable(next.mr_before)){
        results.set(cur.key,{...base,reason:'前後の対戦前MRが欠損'});continue;
      }
      const delta=next.mr_before-cur.mr_before;
      if(Math.abs(delta)>MAX_ABS_MR){
        results.set(cur.key,{...base,reason:'MR差が大きく、途中の未収集試合等を否定できません'});continue;
      }
      if((cur.outcome==='win'&&delta<=0)||(cur.outcome==='loss'&&delta>=0)||
         (cur.outcome==='draw'&&delta!==0)||!['win','loss','draw'].includes(cur.outcome)){
        results.set(cur.key,{...base,reason:'勝敗と次試合のMR変化が整合しません'});continue;
      }
      // When LP values exist, check direction too. This catches many missing
      // ranked battles even when MR signs happen to match.
      if(usable(cur.lp_before)&&usable(next.lp_before)){
        const lp=next.lp_before-cur.lp_before;
        if((cur.outcome==='win'&&lp<0)||(cur.outcome==='loss'&&lp>0)||
           (cur.outcome==='draw'&&lp!==0)){
          results.set(cur.key,{...base,reason:'勝敗とLP変化が整合しません'});continue;
        }
      }
      results.set(cur.key,{delta,basis:'inferred',reason:
        `次のランクマッチまで${gap.toFixed(1)}分。次試合の対戦前MRとの差による参考値（未取得試合なしとは断定できません）`});
    }
    // A casual match or another character's match does not change this
    // character's ranked MR. Use only observations before its next rank match.
    const official=Array.isArray(observations)?observations.filter(o=>o&&
      o.source==='periodic_buckler_snapshot'&&o.rating_source==='play_character_league_infos'&&
      o.phase_source==='play_page.play.current_season_id'&&usable(o.mr)&&usable(o.lp)&&
      Number.isFinite(Date.parse(o.observed_at||''))):[];
    const nextRanked=new Map();
    for(let i=records.length-1;i>=0;i--){
      const cur=records[i];
      if(cur.mode!=='ranked')continue;
      const next=nextRanked.get(cur.character);
      nextRanked.set(cur.character,cur);
      if(!cur.key||results.get(cur.key)?.delta!==null||!usable(cur.mr_before)||!usable(cur.lp_before))continue;
      const from=Date.parse(cur.occurred_at),until=next?Date.parse(next.occurred_at):Infinity;
      const act=actOf(cur,cur.occurred_at);
      if(act===null||until<=from||records[i-1]?.occurred_at===cur.occurred_at||records[i+1]?.occurred_at===cur.occurred_at)continue;
      const sameActNext=next&&actOf(next,next.occurred_at)===act;
      // Never use the fallback to override contradictory closely adjacent rank data.
      if(sameActNext&&until-from<=MAX_GAP_MINUTES*60000)continue;
      const post=official.filter(o=>o.character===cur.character&&Number(o.phase)===act&&
        Date.parse(o.observed_at)>from&&Date.parse(o.observed_at)<until)
        .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
      if(!post.length||Date.parse(post[0].observed_at)-from>MAX_FIRST_OBSERVATION_MINUTES*60000)continue;
      const last=post.at(-1);
      const delta=last.mr-cur.mr_before,lp=last.lp-cur.lp_before;
      if(Math.abs(delta)>MAX_ABS_MR||!signOK(cur.outcome,delta,lp))continue;
      if(post.some(o=>o.mr!==last.mr||o.lp!==last.lp)){
        results.set(cur.key,{delta:null,basis:'unavailable',reason:'試合後の定期観測MR/LPが不一致のため算定不可'});continue;
      }
      if(sameActNext&&(!usable(next.mr_before)||!usable(next.lp_before)||
         next.mr_before!==last.mr||next.lp_before!==last.lp)){
        results.set(cur.key,{delta:null,basis:'unavailable',reason:'定期観測値と次のランクマッチ対戦前MR/LPが不一致'});continue;
      }
      results.set(cur.key,{delta,basis:'inferred',source:'periodic_snapshot',
        observedAt:last.observed_at,postMr:last.mr,postLp:last.lp,
        reason:'公式PLAYの試合後定期観測MR '+last.mr+' と対戦前MR '+cur.mr_before+' の差。'+
          (sameActNext?'次のランクマッチ対戦前MR/LPとも一致。':'次のランクマッチで再照合します。')+
          ' 個別試合の公式確定値ではなく、未取得試合がないことを前提とした観測値です。'});
    }
    return results;
  }
  return {infer,MAX_GAP_MINUTES};
});

