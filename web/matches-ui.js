/* Only sanitized monthly archives are delivered to the browser. */
(function() {
  const $ = id => document.getElementById(id);
  const labels = {win:'勝利',loss:'敗北',draw:'引き分け',unknown:'不明',ranked:'ランク',casual:'カジュアル',hub:'ハブ',custom:'ルーム',classic:'クラシック',modern:'モダン',dynamic:'ダイナミック'};
  const text = value => labels[value] || value;
  const metric = value => value === null || value === undefined ? '不明' : Number(value).toLocaleString('ja-JP');
  const signed = value => value === null ? '算定不可' : `${value>0?'+':''}${Number(value.toFixed(1)).toLocaleString('ja-JP')}`;
  const percent = value => value === null ? '算定不可' : `${value.toFixed(1)}%`;
  const date = value => value ? new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '時刻不明';
  function element(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }
  function line(parent, content, className) { parent.append(element('p', content, className)); }
  class Dashboard {
    constructor() {
      this.cache = new Map(); this.rows = []; this.index = null; this.status = null;
      this.busy = false; this.pending = false; this.page = 0; this.sessionLimit = 20; this.initial = true;
      for (const id of ['match-period','match-mode','match-character','match-own-control','match-opponent-control','session-gap','matchup-order']) {
        $(id).onchange = () => { this.page = 0; this.sessionLimit = 20; id === 'match-period' ? this.refresh() : this.render(); };
      }
      document.querySelectorAll('[data-match-tab]').forEach(button => button.onclick = () => {
        document.querySelectorAll('[data-match-tab]').forEach(b => {b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});
        for (const id of ['history','sessions','matchups']) $('match-panel-'+id).hidden = id !== button.dataset.matchTab;
      });
      $('match-prev').onclick = () => { this.page = Math.max(0,this.page-1); this.render(); };
      $('match-next').onclick = () => { this.page++; this.render(); };
      $('sessions-more').onclick = () => { this.sessionLimit += 20; this.render(); };
    }
    options() { return {days:$('match-period').value,mode:$('match-mode').value,character:$('match-character').value,ownControl:$('match-own-control').value,opponentControl:$('match-opponent-control').value}; }
    async json(url, cache='no-store') {
      const response = await fetch(url,{cache});
      if (!response.ok) throw Error('Match archive unavailable');
      return response.json();
    }
    async refresh() {
      if (this.busy) { this.pending = true; return; }
      this.busy = true; $('match-refresh').textContent = '試合データを確認中…';
      try {
        const version=Date.now();
        const [index,status] = await Promise.all([this.json(`data/matches/index.json?v=${version}`),this.json(`data/matches/status.json?v=${version}`)]);
        if (index.schema!==1 || !Array.isArray(index.months)) throw Error('Match index unavailable');
        const cutoff=this.options().days==='all'?-Infinity:Date.now()-Number(this.options().days)*86400000;
        const months=index.months.filter(m=>!m.last_at||Date.parse(m.last_at)>=cutoff);
        const loaded = await Promise.all(months.map(async m=>{
          if (!/^(\d{4}-\d{2}|undated)\.json$/.test(m.path)||! /^[0-9a-f]{64}$/.test(m.sha256)) throw Error('Invalid archive path');
          const cached=this.cache.get(m.path);
          if (cached?.hash===m.sha256) return cached.rows;
          const data=await this.json(`data/matches/${m.path}?v=${m.sha256}`,'force-cache');
          if (data.schema!==1||!Array.isArray(data.matches)||data.matches.length!==m.count) throw Error('Incomplete archive');
          // Apply month cache only after validated data has arrived.
          this.cache.set(m.path,{hash:m.sha256,rows:data.matches});
          return data.matches;
        }));
        this.rows=[...new Map(loaded.flat().map(r=>[r.key,r])).values()];
        this.index=index;this.status=status;
        const chars=[...new Set(this.rows.map(r=>r.character))].sort();
        chars.forEach(c=>{if (![...$('match-character').options].some(o=>o.value===c)) $('match-character').add(new Option(c,c));});
        if (this.initial&&chars.includes('AKUMA')) $('match-character').value='AKUMA';
        this.initial=false;this.render();
        $('match-refresh').textContent='最終画面確認：'+date(new Date().toISOString())+' JST';
      } catch(e) {
        $('match-refresh').textContent='試合データの通信・形式エラー。前回の表示を保持します。';
      } finally {
        this.busy=false;
        if(this.pending){this.pending=false;this.refresh();}
      }
    }
    render() {
      const rows=SF6Matches.filter(this.rows,this.options());
      const allStats=SF6Matches.stats(rows);
      const collection=this.status?.events?.at(-1);
      $('match-status').textContent=`保存済み ${this.index?.count??0} 試合／選択条件 ${rows.length} 試合。取得成功：${date(this.status?.last_success)} JST。${this.status?.last_error?'取得エラー：'+this.status.last_error.message:collection?'直近追加 '+collection.added+' 件・重複除外 '+collection.duplicates+' 件':''}`;
      const age=this.status?.last_success?(Date.now()-Date.parse(this.status.last_success))/60000:Infinity;
      $('match-warning').textContent=(age>90?'試合取得が90分以上更新されていません。表示が古い可能性があります。 ':'')+'Bucklerが公開する最近の履歴だけを取得しています。取り込み以前・上限超過・取得失敗による欠落があり得ます。';
      $('match-summary').textContent=`${allStats.wins}勝 ${allStats.losses}敗 ${allStats.draws}分 不明${allStats.unknown}／勝率 ${percent(allStats.winRate)}。勝率＝勝利÷（勝利＋敗北＋引き分け）。不明な結果は分母から除外。`;
      const sorted=rows.slice().sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||'')||a.key.localeCompare(b.key));
      this.page=Math.min(this.page,Math.max(0,Math.ceil(rows.length/20)-1));
      const list=$('match-list');list.replaceChildren();
      for(const r of sorted.slice(this.page*20,this.page*20+20)) {
        const card=element('article',undefined,'battle-card '+r.outcome);
        const head=element('div',undefined,'battle-heading');head.append(element('strong',`${r.character} vs ${r.opponent_character}`),element('b',text(r.outcome),'battle-result'));card.append(head);
        line(card,`${date(r.occurred_at)} JST · ${text(r.mode)} · ${r.own_side}P`);
        line(card,`対戦前 MR ${metric(r.mr_before)} / LP ${metric(r.lp_before)}　相手 MR ${metric(r.opponent_mr_before)} / LP ${metric(r.opponent_lp_before)}`);
        line(card,`自分 ${text(r.own_control)}／相手 ${text(r.opponent_control)} · フェーズ ${r.phase}`);
        const details=element('details');details.append(element('summary','データの根拠・欠損'));
        line(details,`日時＝Buckler uploaded_at（アップロード日時）。正確な試合開始時刻は未検証。取得 ${date(r.fetched_at)} JST。勝敗＝両者のラウンド結果から判定。MR・LPは対戦前値で、試合の確定増減は算定不可。欠損：${r.missing?.length?r.missing.join(', '):'主要項目なし'}。`);
        card.append(details);list.append(card);
      }
      if(!rows.length)line(list,'この条件の記録はありません。');
      $('match-page').textContent=`${this.page+1} / ${Math.max(1,Math.ceil(rows.length/20))}`;
      $('match-prev').disabled=this.page===0;$('match-next').disabled=(this.page+1)*20>=rows.length;
      const sessions=SF6Matches.sessions(rows,Number($('session-gap').value));
      const comparison=SF6Matches.compare(sessions[0],sessions[1]);
      $('session-comparison').textContent=comparison?`直前セッション比：試合数 ${signed(comparison.games)}、勝率 ${signed(comparison.winRate)}ポイント、経過時間 ${signed(comparison.elapsedMinutes)}分。`:'比較できるセッションはまだ2件ありません。';
      const sessionList=$('session-list');sessionList.replaceChildren();
      for(const s of sessions.slice(0,this.sessionLimit)) {
        const card=element('article',undefined,'battle-card');card.append(element('strong',`${date(s.start)} 〜 ${date(s.end)} JST`));
        line(card,`${s.characters.join(' / ')} · 記録${s.games}試合 · ${s.wins}勝 ${s.losses}敗 ${s.draws}分 不明${s.unknown} · 勝率 ${percent(s.winRate)}`);
        line(card,`経過 ${s.elapsedMinutes.toFixed(1)}分 · 最大連勝 ${metric(s.maxWins)}／連敗 ${metric(s.maxLosses)}`);
        line(card,`確定MR/LP収支：${s.mrDelta===null?'算定不可':signed(s.mrDelta)} / ${s.lpDelta===null?'算定不可':signed(s.lpDelta)}`);
        if(s.referenceMr!==null||s.referenceLp!==null)line(card,`先頭→末尾の対戦前観測差（参考、最終試合の結果を含まない）：MR ${signed(s.referenceMr)} / LP ${signed(s.referenceLp)}`);
        if(s.orderUncertain)line(card,'同一秒の試合があり順序不明のため連勝・連敗は算定不可。');
        sessionList.append(card);
      }
      if(!sessions.length)line(sessionList,'日時のある試合が集まると表示します。');
      $('sessions-more').hidden=sessions.length<=this.sessionLimit;
      const matchups=SF6Matches.matchups(rows,$('matchup-order').value),matchupList=$('matchup-list');matchupList.replaceChildren();
      for(const m of matchups) {
        const card=element('article',undefined,'battle-card');
        const heading=element('div',undefined,'battle-heading');
        heading.append(element('strong',`${m.character} vs ${m.opponent}`),element('b',percent(m.winRate)));
        card.append(heading);
        line(card,`${m.games}試合 · ${m.wins}勝 ${m.losses}敗 ${m.draws}分 不明${m.unknown} · MR収支 ${m.mrDelta===null?'算定不可':signed(m.mrDelta)}`);
        const bar=element('div',undefined,'matchup-bar');
        bar.setAttribute('role','img');
        bar.setAttribute('aria-label',`勝利 ${m.wins}試合、敗北 ${m.losses}試合、引き分け ${m.draws}試合、結果不明 ${m.unknown}試合`);
        for(const [outcome,count] of [['win',m.wins],['loss',m.losses],['draw',m.draws],['unknown',m.unknown]]) {
          if(!count || !m.games)continue;
          const segment=element('span',undefined,`matchup-bar-segment ${outcome}`);
          segment.style.width=`${count/m.games*100}%`;
          segment.title=`${text(outcome)} ${count}試合`;
          bar.append(segment);
        }
        card.append(bar);
        if(m.smallSample)line(card,'5試合未満の参考値。相性の良し悪しは判断できません。','sample-warning');
        matchupList.append(card);
      }
      if(!matchups.length)line(matchupList,'この条件の組合せはありません。');
    }
  }
  window.matchDashboard=new Dashboard();
})();
