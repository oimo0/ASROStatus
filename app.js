/* ASRO Status 2.0 — public, read-only frontend. Never infer health from the website itself. */
'use strict';
const STATUS_URL = 'https://raw.githubusercontent.com/oimo0/ASROStatus/status-data/status.json';
const STATUS_REF_URL = 'https://api.github.com/repos/oimo0/ASROStatus/git/ref/heads/status-data';
const REFRESH_MS = 120_000;
const STALE_MS = 12 * 60_000;
const STATES = {
  operational:{label:'正常',className:'operational',symbol:'✓'},
  busy:{label:'混雑',className:'busy',symbol:'·'},
  degraded:{label:'一部機能に問題',className:'degraded',symbol:'!'},
  maintenance:{label:'メンテナンス中',className:'maintenance',symbol:'⌁'},
  paused:{label:'一時停止中',className:'paused',symbol:'Ⅱ'},
  outage:{label:'障害発生中',className:'outage',symbol:'!'},
  building:{label:'準備中',className:'building',symbol:'·'},
  unknown:{label:'確認できません',className:'unknown',symbol:'?'}
};
const ICONS = {'asro-web':'⌘','kuup':'✦','cook':'◇','schoollink':'▤','plat':'⬡','moot':'◉','mail':'✉','asra-api':'✳'};
const $ = id => document.getElementById(id);
const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const info = state => STATES[state] || STATES.unknown;
const prettyDate = (date, opts) => {
  const d = new Date(date);
  if(!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',...(opts||{})}).format(d);
};
const readable = state => info(state).label;
const pill = state => '<span class="state-pill '+safe(info(state).className)+'">'+safe(readable(state))+'</span>';
let currentData=null, selectedFilter='all', notices=[];
function effectiveState(service, noticeList){
  if(service.state==='maintenance' || service.state==='paused') return service.state;
  const match = noticeList.find(n=>noticeActive(n) && n.overrideStatus && Array.isArray(n.affected) && n.affected.includes(service.id));
  return match ? (STATES[match.overrideStatus]?match.overrideStatus:service.state) : service.state;
}
function noticeActive(n){
  if(n.enabled===false) return false;
  const t=Date.now();
  const from=n.startsAt?new Date(n.startsAt).getTime():-Infinity;
  const to=n.endsAt?new Date(n.endsAt).getTime():Infinity;
  return Number.isFinite(from) || from === -Infinity ? t>=from && t<=to : false;
}
function metricCode(check){
  if(check.state==='maintenance')return '計画停止';
  if(check.state==='paused')return '一時停止中';
  if(check.state!=='operational')return check.httpCode ? 'HTTP '+safe(check.httpCode) : '失敗';
  if(Number.isFinite(check.latencyMs))return safe(check.latencyMs)+'ms';
  return check.httpCode ? 'HTTP '+safe(check.httpCode) : '正常';
}
function renderServices(data, items){
  const target=$('serviceGrid');
  let filtered=selectedFilter==='issues' ? items.filter(s=>s.effective!=='operational') : items;
  if(!filtered.length){
    target.innerHTML='<div class="no-results">現在、確認が必要なサービスはありません。</div>';
    return;
  }
  target.innerHTML=filtered.map(s=>{
    let checks=Array.isArray(s.checks)?s.checks:[];
    const checksHtml=checks.length ? checks.map(c=>{
      const failed=c.state==='outage',maint=c.state==='maintenance'||c.state==='paused';
      return '<li><span class="check-name"><span class="check-icon '+(failed?'bad':maint?'maint':'')+'">'+(failed?'!':maint?'–':'✓')+'</span>'+safe(c.label)+'</span><span class="check-result '+(failed?'bad':maint?'maint':'')+'" title="'+safe(c.message)+'">'+metricCode(c)+'</span></li>';
    }).join('') : '<li><span class="check-name">詳細チェックを収集中</span><span class="check-result">—</span></li>';
    const message=s.effective==='maintenance' ? '<div class="maintenance-message">メンテナンス'+(s.maintenance?.reason?' · '+safe(s.maintenance.reason):'を実施中')+'</div>' : s.effective==='paused' ? '<div class="maintenance-message">一時停止中'+(s.pause?.reason?' · '+safe(s.pause.reason):'')+'</div>' : '';
    return '<article class="service-card" data-state="'+safe(s.effective)+'">'+
      '<div class="service-top"><div class="service-title-wrap"><span class="service-icon" aria-hidden="true">'+(ICONS[s.id]||'▣')+'</span><div style="min-width:0"><div class="service-name">'+safe(s.name)+'</div><div class="service-desc">'+safe(s.description)+'</div></div></div>'+pill(s.effective)+'</div>'+
      '<div class="service-divider"></div><ul class="check-list">'+checksHtml+'</ul>'+message+
      '<div class="service-footer"><span>'+safe(s.group||'ASRO SERVICE')+'</span><span>'+checks.length+' 項目を監視</span></div></article>';
  }).join('');
}
function renderOverall(data,items,stale){
  const healthy=items.filter(s=>s.effective==='operational').length;
  const incidents=items.filter(s=>s.effective==='outage'||s.effective==='degraded');
  const maintenance=items.filter(s=>s.effective==='maintenance');
  const paused=items.filter(s=>s.effective==='paused');
  const uncertain=items.filter(s=>s.effective==='unknown'||s.effective==='building');
  let title,description,state;
  if(stale){title='監視データの更新が停止しています';description='最後に取得できた情報を表示しています。最新の稼働状況は確認できません。';state='unknown'}
  else if(incidents.length){title='一部のサービスで障害を検知';description=incidents.map(s=>s.name).join('、')+' の状態を確認してください。';state='outage'}
  else if(maintenance.length&&paused.length){title='メンテナンス・一時停止中のサービスがあります';description=maintenance.map(s=>s.name).join('、')+' はメンテナンス中、'+paused.map(s=>s.name).join('、')+' は一時停止中です。';state='maintenance'}
  else if(maintenance.length){title='メンテナンス中のサービスがあります';description=maintenance.map(s=>s.name).join('、')+' はメンテナンス中です。';state='maintenance'}
  else if(paused.length){title='一時停止中のサービスがあります';description=paused.map(s=>s.name).join('、')+' は意図的に一時停止されています。';state='paused'}
  else if(uncertain.length){title='一部の稼働状況を確認できません';description='監視経路に接続できないサービスがあります。';state='unknown'}
  else{title='すべてのサービスが正常に稼働中';description='現在、監視中のサービスに異常は検知されていません。';state='operational'}
  const root=document.querySelector('.overview-card');
  root.dataset.status=state;
  $('heroIcon').textContent=info(state).symbol;
  $('overallTitle').textContent=title;
  $('overallText').textContent=description;
  $('statHealthy').textContent=healthy;
  $('statTotal').textContent=items.length;
  $('heroTime').textContent='LAST CHECKED · '+prettyDate(data.generatedAt);
  $('lastUpdated').textContent='最終更新 '+prettyDate(data.generatedAt)+' JST';
  $('issueCount').textContent=items.filter(s=>s.effective!=='operational').length;
  $('liveMark').style.opacity=stale?'.45':'1';
}
function emptyBlock(title,desc){return '<div class="event-empty"><span class="event-empty-icon">✓</span><div><strong>'+safe(title)+'</strong><p>'+safe(desc)+'</p></div></div>'}
function renderIncidents(data,items){
  const active=items.filter(s=>s.effective==='outage'||s.effective==='degraded');
  const maintenance=items.filter(s=>s.effective==='maintenance');
  const paused=items.filter(s=>s.effective==='paused');
  $('activeIncidentCount').textContent=active.length;
  $('activeMaintenanceCount').textContent=maintenance.length+paused.length;
  $('activeIncidents').innerHTML=active.length?active.map(s=>{
    const failed=(s.checks||[]).filter(c=>c.state==='outage').map(c=>c.label);
    return '<div class="event-item warning"><div class="event-meta"><span>'+safe(s.name)+'</span>'+pill(s.effective)+'</div><strong>'+safe(readable(s.effective))+'</strong><p>'+(failed.length?'異常が検知された項目: '+safe(failed.join('、')):'現在の監視結果から障害が報告されています。')+'</p></div>';
  }).join(''):emptyBlock('現在、検知中の障害はありません','公開されている監視情報の範囲で正常です。');
  const scheduled=notices.filter(n=>noticeActive(n)&&/maint|メンテナンス/i.test(n.type||n.title||''));
  $('maintenanceList').innerHTML=(maintenance.length||paused.length||scheduled.length)?
     maintenance.map(s=>'<div class="event-item maintenance"><div class="event-meta"><span>'+safe(s.name)+'</span>'+pill('maintenance')+'</div><strong>'+safe(s.name)+' のメンテナンス</strong><p>'+safe(s.maintenance?.reason||'メンテナンスを実施しています。')+'</p></div>').join('')+
     paused.map(s=>'<div class="event-item maintenance"><div class="event-meta"><span>'+safe(s.name)+'</span>'+pill('paused')+'</div><strong>'+safe(s.name)+' は一時停止中</strong><p>'+safe(s.pause?.reason||'現在このサービスは意図的に停止しています。')+'</p></div>').join('')+
     scheduled.map(n=>'<div class="event-item maintenance"><div class="event-meta"><span>お知らせ</span><span>'+safe(prettyDate(n.startsAt))+'</span></div><strong>'+safe(n.title||'メンテナンス')+'</strong><p>'+safe(n.message||'')+'</p></div>').join(''):
     emptyBlock('現在、メンテナンスはありません','予定が登録されるとここに表示されます。');
  const events=Array.isArray(data.events)?data.events.slice(0,8):[];
  $('eventLog').innerHTML=events.length?events.map(e=>{
    const state=STATES[e.state]?e.state:'unknown';
    return '<div class="activity-row"><span class="activity-dot '+safe(state)+'"></span><p><strong>'+safe(e.name||e.service)+'　</strong>'+safe(e.previous?readable(e.previous)+' → ':'')+safe(readable(state))+'</p><time datetime="'+safe(e.at)+'">'+safe(prettyDate(e.at))+'</time></div>';
  }).join(''):'<div class="event-empty"><span class="event-empty-icon">↗</span><div><strong>履歴を記録しています</strong><p>状態が変化すると、ここにイベントが記録されます。</p></div></div>';
}
function progress(pct){
  const value=Number(pct);
  if(!Number.isFinite(value))return '<span class="metric-number">—</span><div class="metric-bar"></div>';
  const n=Math.max(0,Math.min(100,value));
  return '<span class="metric-number">'+safe(Math.round(n))+'<small>%</small></span><div class="metric-bar"><div class="metric-fill '+(n>=90?'critical':n>=75?'warn':'')+'" style="width:'+n+'%"></div></div>';
}
function uptimeTime(seconds){
  if(!Number.isFinite(Number(seconds)))return '—';
  const days=Math.floor(seconds/86400);
  const hours=Math.floor((seconds%86400)/3600);
  return days+'日 '+hours+'時間';
}
function renderServers(data){
  const servers=Array.isArray(data.servers)?[...data.servers].sort((a,b)=>({main:0,management:1}[a.id]??99)-({main:0,management:1}[b.id]??99)):[];
  $('serverGrid').innerHTML=servers.length?servers.map(s=>{
    const connected=s.state==='operational';
    const displayName=s.id==='main'?'サーバー1':s.id==='management'?'サーバー2':s.name;
    const values=[['CPU',s.cpu],['RAM',s.memory],['DISK',s.disk]];
    return '<article class="server-card"><div class="server-card-top"><div class="server-identity"><span class="server-icon">▤</span><div><h3>'+safe(displayName)+'</h3><p>HOST MONITOR · '+safe(s.id).toUpperCase()+'</p></div></div>'+pill(connected?'operational':'unknown')+'</div>'+
     (connected?'<div class="metric-grid">'+values.map(([name,value])=>'<div class="metric-box"><span class="metric-label">'+name+'</span>'+progress(value)+'</div>').join('')+'</div><div class="server-bottom"><span>LOAD AVERAGE: '+(Number.isFinite(Number(s.load))?safe(s.load):'—')+'</span><span>UPTIME: '+uptimeTime(s.uptimeSeconds)+'</span></div>':
      '<div class="server-unknown">メトリクスを取得できません。未取得の数値は表示していません。</div>')+'</article>';
  }).join(''):'<div class="no-results">サーバー監視データを取得中です。</div>';
}
function daysBefore(n){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)}
function renderHistory(data,items){
  const history=data.history||{};
  $('historyRows').innerHTML=items.map(s=>{
    const h=history[s.id]||{}, days=Array.isArray(h.days)?h.days:[];
    const byDate=new Map(days.map(row=>[row.date,row]));
    const cells=Array.from({length:90},(_,i)=>{
      const date=daysBefore(89-i);
      const found=byDate.get(date);
      const state=found&&STATES[found.state]?found.state:'unknown';
      const text=found?(found.uptime==null?readable(state):found.uptime+'%'):'データなし';
      return '<span class="uptime-cell '+safe(state)+'" role="img" aria-label="'+safe(date+' '+text)+'" title="'+safe(date+' · '+text)+'"></span>';
    }).join('');
    const rate=Number.isFinite(h.uptimePercent)?h.uptimePercent.toFixed(2)+'%':'—';
    return '<div class="history-row"><span class="history-name">'+safe(s.name)+'</span><div class="uptime-heatmap">'+cells+'</div><span class="uptime-number">'+safe(rate)+'</span></div>';
  }).join('');
}
function render(data, stale=false){
  const services=Array.isArray(data.services)?data.services:[];
  const items=services.map(s=>({...s,effective:effectiveState(s,notices)}));
  renderOverall(data,items,stale);
  renderServices(data,items);
  renderIncidents(data,items);
  renderServers(data);
  renderHistory(data,items);
}
async function fetchNotices(){
  try{
    const r=await fetch('./data/notices.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw Error('notices');
    const d=await r.json();
    notices=Array.isArray(d.notices)?d.notices:[];
  }catch{notices=[]}
}
async function fetchLatestStatus(){
  // GitHub raw may cache branch names for minutes. Resolve the newest immutable commit SHA first.
  // Rate-limit/network failures gracefully fall back to the original public status endpoint.
  try{
    const refRes=await fetch(STATUS_REF_URL+'?t='+Date.now(),{cache:'no-store',headers:{'Accept':'application/vnd.github+json'}});
    if(refRes.ok){
      const ref=await refRes.json();
      const sha=ref?.object?.sha;
      if(typeof sha==='string' && /^[a-f0-9]{40}$/i.test(sha)){
        try{
          const snap=await fetch('https://raw.githubusercontent.com/oimo0/ASROStatus/'+sha+'/status.json',{cache:'no-store'});
          if(snap.ok) return snap;
        }catch{}
      }
    }
  }catch{}
  return fetch(STATUS_URL+'?t='+Date.now(),{cache:'no-store'});
}
async function refresh(){
  await fetchNotices();
  try{
    const res=await fetchLatestStatus();
    if(!res.ok)throw Error('HTTP '+res.status);
    const data=await res.json();
    if(!Array.isArray(data.services)||!data.generatedAt)throw Error('データ形式の不一致');
    currentData=data;
    const age=Date.now()-new Date(data.generatedAt).getTime();
    const stale=!Number.isFinite(age)||age>STALE_MS||age< -300_000;
    const warn=$('dataWarning');
    warn.hidden=!stale;
    if(stale)warn.textContent='監視データの更新が止まっています。画面に表示されるのは最後に取得できた情報です。';
    render(data,stale);
  }catch(error){
    const warn=$('dataWarning');
    warn.hidden=false;
    warn.textContent='最新の監視情報を取得できません。状態を「正常」とは判断していません。';
    if(currentData)render(currentData,true);
    else{
      $('overallTitle').textContent='監視データを取得できません';
      $('overallText').textContent='通信状況を確認しています。';
      $('heroIcon').textContent='?';
      document.querySelector('.overview-card').dataset.status='unknown';
      $('serviceGrid').innerHTML='<div class="no-results">取得できる稼働情報がありません。</div>';
      $('serverGrid').innerHTML='<div class="no-results">監視データを取得できません。</div>';
      $('historyRows').innerHTML='<div class="no-results">履歴データを取得できません。</div>';
      $('eventLog').innerHTML='<p class="muted">履歴を取得できません。</p>';
      $('activeIncidents').innerHTML='<p class="muted">状態を確認できません。</p>';
      $('maintenanceList').innerHTML='<p class="muted">状態を確認できません。</p>';
    }
  }
}
function setFilter(type){
  selectedFilter=type;
  $('filterAll').classList.toggle('is-active',type==='all');
  $('filterIssues').classList.toggle('is-active',type==='issues');
  $('filterAll').setAttribute('aria-pressed',String(type==='all'));
  $('filterIssues').setAttribute('aria-pressed',String(type==='issues'));
  if(currentData)render(currentData,Date.now()-new Date(currentData.generatedAt).getTime()>STALE_MS);
}
function initTheme(){
  let theme='dark';
  try{theme=localStorage.getItem('asro-status-theme')||'dark'}catch{}
  document.documentElement.dataset.theme=theme==='light'?'light':'dark';
  $('themeButton').addEventListener('click',()=>{
    const next=document.documentElement.dataset.theme==='light'?'dark':'light';
    document.documentElement.dataset.theme=next;
    try{localStorage.setItem('asro-status-theme',next)}catch{}
  });
}
initTheme();
$('filterAll').addEventListener('click',()=>setFilter('all'));
$('filterIssues').addEventListener('click',()=>setFilter('issues'));
refresh();
setInterval(()=>{if(!document.hidden)refresh()},REFRESH_MS);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
