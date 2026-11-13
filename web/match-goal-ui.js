/* Accessible, match-count-only goal forecast presentation.
   Called whenever match archives refresh; never displays elapsed/play hours.
 */
(function(root){
  const $=id=>document.getElementById(id);
  const num=n=>Number(n).toLocaleString('ja-JP');
  const signed=n=>`${n>0?'+':''}${n.toFixed(2)}`;
  function render(rows,observations){
    const overview=$('character')?.value;
    const archive=$('match-character')?.value;
    const character=overview&&overview!=='すべて'?overview:archive&&archive!=='all'?archive:null;
    const phase=$('phase')?.value||'all';
    if(!character){
      $('goal-forecast-current').textContent='キャラクターを選択';
      $('goal-forecast-quality').textContent='概要または対戦履歴で対象キャラを選んでください。';
      return;
    }
    // The mode follows the *character's* recorded promotion status.
    // Never use MR=0 as a real Master Rating or extrapolate it to MR1500.
    if(SF6MasterPromotionUI.render({rows,observations,character,phase}))return;
    $('goal-master-panel').hidden=true;
    $('goal-mr-panel').hidden=false;
    $('goal-forecast-kicker').textContent='MR TARGET / MATCH FORECAST';
    $('goal-forecast-title').textContent='あと何試合で到達するか';
    $('goal-forecast-intro').textContent='マスター到達済みキャラのMR増減を使った試合数予測です。プレイ時間は計算しません。';
    const ranked=rows.filter(r=>r.mode==='ranked');
    const deltas=SF6MatchDeltas.infer(rows);
    const gap=45; // independent of the match-list display threshold
    const report=SF6MatchGoalForecast.analyze({
      rows,observations,deltas,character,phase,now:Date.now(),
      actAt:time=>typeof SF6PhaseConfig==='undefined'?null:SF6PhaseConfig.assignedAct(time).act,
      sessionRefs:SF6Matches.reconcileSessionDeltas(rows,observations,gap),
      sessions:SF6Matches.sessions(ranked,gap)
    });
    $('goal-forecast-current').textContent=report.current===null?
      '現在MR：未取得':`現在 MR ${num(report.current)} · ${character}`;
    for(const target of report.targets){
      const field='goal-'+target;
      const remaining=report.current===null?null:Math.max(0,target-report.current);
      $(field+'-remaining').textContent=remaining===null?'現在値不明':
        remaining===0?'達成済み':`あと ${num(remaining)} MR`;
    }
    for(const cohort of report.cohort){
      const evidence=$('goal-window-'+cohort.size+'-evidence');
      const percent=cohort.winRate===null?'算定不可':cohort.winRate.toFixed(1)+'%';
      const average=cohort.average===null?'算定不可':signed(cohort.average)+' MR/試合';
      evidence.textContent=`推定可能 ${cohort.known}/${cohort.size}試合 · 平均 ${average} · 勝率 ${percent}`;
      for(const target of report.targets){
        const cell=$('goal-'+target+'-'+cohort.size+'-games');
        const estimate=cohort.targets.find(t=>t.target===target);
        cell.textContent=estimate?.label??'算定不可';
        cell.className='goal-match-estimate'+(estimate?.status==='estimate'?' available':'');
        cell.title=estimate?.status==='estimate'?
          `記録済み直近${cohort.size}試合中、${cohort.known}試合のMR推定差分から外挿。`:
          '条件が満たされないため試合数を推測しません';
      }
    }
    const horizon=report.targets.map(target=>{
      const list=report.cohort.map(c=>c.targets.find(t=>t.target===target))
        .filter(x=>x?.status==='estimate').map(x=>x.required);
      return list.length>=2?
        `MR ${num(target)}：${num(Math.min(...list))}〜${num(Math.max(...list))}試合`:null;
    }).filter(Boolean);
    $('goal-forecast-quality').textContent=report.current===null?
      `${character}は有効なMRが未計測です。LPの推移・対戦戦績は表示できますが、MR1500・1600の予測は開始できません。`:
      report.stale?'MR定期観測が3時間以上更新されていないため、試合数の予測を一時停止しています。':
      !report.storedGames?'比較できるランクマッチの記録がありません。':
      `直近20・50・100試合の3通りで算定。 ${horizon.join(' ／ ')}。各値は参考外挿であり、統計的な予測区間ではありません。`;
    const audits=report.audit;
    $('goal-forecast-audit').textContent=
      `セッション境界と定期観測の一致 ${audits.snapshotMatched}件／照合対象${audits.checked}件。暫定 ${audits.provisional}件・不一致 ${audits.conflict}件。試合別増減が欠ける区間は補完しません。`;
    const list=$('goal-audit-list');
    list.replaceChildren();
    for(const item of audits.sessions){
      const row=document.createElement('p');
      const label=item.status==='snapshot_matched'?'観測照合済み':
        item.status==='snapshot_provisional'?'暫定':'要確認';
      const residual=item.residual===null?'不明':`${item.residual>0?'+':''}${num(item.residual)} MR`;
      row.textContent=`${label}｜${item.gameCount}試合（推定${item.estimatedGames}、未推定${item.unavailable}）｜境界差分 ${item.referenceMR===null?'不明':num(item.referenceMR)+' MR'}、推定値との差 ${residual}`;
      list.append(row);
    }
    $('goal-forecast-act').textContent=report.act===null?'フェーズ：取得元の値を使用':
      `Act ${report.act}（ユーザー申告・暫定）。変更時は有効日時を区別します。`;
  }
  root.SF6MatchGoalUI={render};
})(typeof globalThis!=='undefined'?globalThis:this);
