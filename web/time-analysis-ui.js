function renderMRForecast(observations, character, phase) {
  const byId=id=>document.getElementById(id);
  if(character==='すべて'){
    byId('goal-forecast-current').textContent='キャラを選択';
    for(const target of [1500,1600]){
      byId('goal-'+target+'-remaining').textContent='—';
      byId('goal-'+target+'-short').textContent='算定不可';
      byId('goal-'+target+'-long').textContent='算定不可';
    }
    byId('goal-forecast-quality').textContent='キャラクターを選ぶと到達時間の目安を計算します。';
    return;
  }
  const now=Date.now();
  const fixed=SF6Analysis.analyze(observations,{character,phase,range:'7',minutes:1440,now});
  const last=fixed.segment.at(-1);
  const regression=SF6ChartTrends.regression(fixed.segment,'mr');
  const projection=SF6GoalForecast.analyze({
    latest:last,lastBar:fixed.bars.at(-1),regression,now,targets:[1500,1600]
  });
  byId('goal-forecast-current').textContent=projection.current===null?
    '現在MR：データ不足':`現在 MR ${projection.current.toLocaleString('ja-JP')}`;
  for(const row of projection.targets){
    const prefix='goal-'+row.target;
    byId(prefix+'-remaining').textContent=row.remaining===null?'データ不足':
      row.remaining===0?'達成済み':`あと ${row.remaining} MR`;
    byId(prefix+'-short').textContent=row.shortLabel;
    byId(prefix+'-long').textContent=row.longLabel;
  }
  const formatRate=n=>`${n>0?'+':''}${n.toFixed(2)} MR/時`;
  if(projection.stale){
    byId('goal-forecast-quality').textContent='MR観測が3時間以上更新されていないため、到達時間の算定を停止しています。';
  }else if(projection.current===null){
    byId('goal-forecast-quality').textContent='MRの実測値が不足しています。';
  }else{
    const a=projection.shortRawRate===null?'直近の有効な24時間窓がありません':
      `24時間ペース ${formatRate(projection.shortRawRate)}`;
    const b=projection.longRawRate===null?'回帰：データ不足（12件・48時間以上必要）':
      `最大7日間の回帰 ${formatRate(projection.longRawRate)}（${projection.regressionCount}件／約${projection.regressionHours.toFixed(1)}時間）`;
    byId('goal-forecast-quality').textContent=
      `${a}。 ${b}。予測はプレイ時間ではなく経過時間換算です。`+
      (fixed.lastPhase==='unknown'?' フェーズ番号は未判定です。':'');
  }
}

function renderTimeAnalysis(observations, range, minutes) {
  const byId = id => document.getElementById(id);
  const character = byId('character').value;
  const phase = byId('phase').value;
  const value = n => n === null ? 'データ不足' : (n > 0 ? '+' : '') + Number(n).toLocaleString('ja-JP');
  const signedRate = n => n === null ? 'データ不足' : `${n > 0 ? '+' : ''}${Number(n.toFixed(1)).toLocaleString('ja-JP')} MR/h`;
  const local = t => new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  renderMRForecast(observations,character,phase);
  if (character === 'すべて') {
    byId('time-summary').textContent = '時間別分析にはキャラクターを選択してください。';
    byId('time-bars').replaceChildren();
    return;
  }
  const a = SF6Analysis.analyze(observations, { character, phase, range, minutes });
  const latest = a.bars.at(-1);
  byId('window-delta').textContent = value(latest?.delta ?? null) + (latest?.delta === null || !latest ? '' : ' MR');
  byId('window-rate').textContent = signedRate(latest?.rate ?? null);
  byId('average-rate').textContent = signedRate(a.averageRate);
  byId('rise-fall').textContent = `期間内の最大上昇 ${value(a.maxRise)} MR ／ 最大下落 ${value(a.maxFall)} MR`;
  byId('drawdown').textContent = a.current === null ? 'データ不足' :
    `期間内最高 ${value(a.peak)} MR ／ 最高値から現在 ${value(-a.belowPeak)} MR ／ 更新に必要 ${value(a.toNewHigh)} MR ／ 最大ドローダウン ${value(a.maxDrawdown)} MR ／ 最高値更新 ${a.recordCount} 回（直近 ${local(a.highRecords.at(-1).observed_at)} JST）`;
  const coverage = a.bars.length ? `${(100 * a.validBars.length / a.bars.length).toFixed(1)}%` : '算定不可';
  byId('time-summary').textContent = `対象 ${range === 'all' ? '全期間' : `過去${range}日`}・${character}・フェーズ ${String(a.lastPhase ?? '不明')}。比較可能な観測 ${a.segment.length} 件（選択内 ${a.selectedCount} 件）、有効窓 ${a.validBars.length}/${a.bars.length} 件（${coverage}）。直近の平均は有効な最大6窓のMR/h。`;
  const note = a.lastPhase === 'unknown' ? 'フェーズ番号は未判定です。同じ unknown の間でも実際のフェーズ切替を検証できないため、長期比較には注意してください。' : '異なるフェーズの観測値は連結・比較しません。';
  byId('time-note').textContent = `定期観測値の差です。実プレイ時間や試合ごとの変動ではありません。各窓の開始・終了境界から5分以内の実測だけを比較し、欠測は補間しません。${note}`;
  const container = byId('time-bars');
  container.replaceChildren();
  for (const b of a.bars.slice(-16)) {
    const row = document.createElement('div'); row.className = 'time-bar-row';
    const title = document.createElement('span'); title.className = 'time-label'; title.textContent = local(b.start);
    const track = document.createElement('div'); track.className = 'time-track';
    const fill = document.createElement('div'); fill.className = `time-fill ${b.delta === null ? 'missing' : b.delta < 0 ? 'negative' : 'positive'}`;
    fill.style.width = b.delta === null ? '0' : `${Math.max(2, Math.abs(b.delta) / Math.max(1, ...a.bars.slice(-16).filter(x => x.delta !== null).map(x => Math.abs(x.delta))) * 100)}%`;
    track.append(fill);
    const number = document.createElement('strong'); number.className = 'time-number'; number.textContent = b.delta === null ? 'データ不足' : value(b.delta);
    row.title = `${local(b.start)}〜${local(b.end)} JST：${number.textContent}${b.observedStart ? `（観測 ${local(b.observedStart)} → ${b.observedEnd ? local(b.observedEnd) : 'なし'}）` : ''}`;
    row.append(title, track, number); container.append(row);
  }
  if (!a.bars.length) container.textContent = 'この期間には比較可能な固定時間窓がありません。';
}
