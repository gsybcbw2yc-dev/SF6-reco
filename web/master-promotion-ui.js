/* Renders the promotion target for characters without an observed Master rank.
 * Returns true if Master-promotion mode is active; MR forecasting remains intact.
 */
(function(root){
  const $=id=>document.getElementById(id);
  const format=n=>n.toLocaleString('ja-JP');
  const signed=n=>(n>0?'+':'')+n.toFixed(1);
  function render({rows,observations,character,phase='all'}){
    const status=SF6MasterPromotion.latestStatus(observations,character);
    if(status.mode==='mr')return false;
    const actAt=time=>typeof SF6PhaseConfig==='undefined'?null:SF6PhaseConfig.assignedAct(time).act;
    const ranked=rows.filter(r=>r.mode==='ranked');
    const refs=SF6Matches.reconcileSessionDeltas(rows,observations,45);
    const report=SF6MasterPromotion.analyze({
      rows,observations,character,phase,now:Date.now(),actAt,
      sessionRefs:refs,sessions:SF6Matches.sessions(ranked,45)
    });
    $('goal-master-panel').hidden=false;
    $('goal-mr-panel').hidden=true;
    $('goal-forecast-kicker').textContent='MASTER PROMOTION / LP FORECAST';
    $('goal-forecast-title').textContent='マスターまで、あと何試合？';
    $('goal-forecast-intro').textContent='キャラクターが未マスターの場合は、LP25,000到達までの必要試合数を表示します。';
    $('goal-forecast-current').textContent=report.currentLP===null?
      `${character} · LP未取得`:`${character} · LP ${format(report.currentLP)}`;
    $('master-goal-rank').textContent=report.rank;
    $('master-goal-remaining').textContent=report.remaining===null?
      '残りLP不明':`あと ${format(report.remaining)} LP`;
    $('master-goal-lp').textContent=report.currentLP===null?
      'LP未取得':`現在 ${format(report.currentLP)} LP`;
    const progress=Math.max(0,Math.min(100,(report.currentLP??0)/report.target*100));
    $('master-goal-fill').style.width=progress.toFixed(2)+'%';
    $('master-goal-progress').setAttribute('aria-valuenow',String(report.currentLP??0));
    const results=[];
    for(const cohort of report.cohorts){
      const cell=$('master-goal-'+cohort.size+'-games');
      cell.textContent=cohort.label;
      cell.className='goal-match-estimate'+(cohort.required!==null&&cohort.required>0?' available':'');
      cell.title=cohort.required!==null&&cohort.required>0?
        `${cohort.known}/${cohort.size}試合のLP推定から算出。将来のLP獲得を保証するものではありません。`:
        '参考に必要な試合数・LP増分が不足しています';
      $('master-window-'+cohort.size+'-evidence').textContent=
        `推定可能 ${cohort.known}/${cohort.size}試合 · 平均 ${cohort.average===null?'算定不可':signed(cohort.average)+' LP/試合'} · 勝率 ${cohort.winRate===null?'算定不可':cohort.winRate.toFixed(1)+'%'}`;
      if(cohort.required!==null&&cohort.required>0)results.push(cohort.required);
    }
    $('master-goal-count').textContent=results.length?
      `${results.length}期間で推定`:'集計待ち';
    $('master-goal-quality').textContent=report.currentLP===null?
      '有効なLP観測がありません。最新LPが取得できれば計算します。':
      report.stale?'選択キャラのLP観測が3時間以上更新されていないため、必要試合数を算定しません。':
      !results.length?'LP増加の検証に十分な試合数がない、または増加傾向が確認できません。':
      `必要試合数の試算幅：${format(Math.min(...results))}〜${format(Math.max(...results))}試合（${results.length}期間）。これは統計的な信頼区間ではありません。`;
    $('master-goal-audit').textContent=
      `セッション境界照合：${report.audit.checked}件（観測照合済み ${report.audit.matched}件、暫定 ${report.audit.provisional}件、要確認 ${report.audit.conflict}件）。未推定の試合差分を補完せず、参考値として扱います。`;
    return true;
  }
  root.SF6MasterPromotionUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);
