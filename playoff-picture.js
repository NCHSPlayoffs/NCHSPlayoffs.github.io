import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

const SUPABASE_URL='https://xnxjobtvbzgmiqyfkjrs.supabase.co';
const SUPABASE_KEY='sb_publishable_uEOk3b5J2-6vFbRRwwI4SQ_XQyRg9o3';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const localExportHelper=['localhost','127.0.0.1'].includes(location.hostname) && location.port==='8136';
const els={sport:$('sport'),season:$('season'),classification:$('classification'),region:$('region'),comparison:$('comparison'),compareDate:$('compareDate'),reload:$('reload'),download:$('download'),openExportStudio:$('openExportStudio'),exportStudio:$('exportStudio'),closeExportStudio:$('closeExportStudio'),exportClassMode:$('exportClassMode'),exportSport:$('exportSport'),exportLayout:$('exportLayout'),exportClassChoices:$('exportClassChoices'),buildExports:$('buildExports'),exportDownloadAll:$('exportDownloadAll'),exportProgressText:$('exportProgressText'),exportProgressBar:$('exportProgressBar'),saveDatedFolder:$('saveDatedFolder'),browseExportFolder:$('browseExportFolder'),exportFolderName:$('exportFolderName'),clearExportQueue:$('clearExportQueue'),exportQueue:$('exportQueue'),status:$('status'),graphic:$('graphic')};
if(!localExportHelper){document.body.classList.add('static-playoff-view');els.download.hidden=true;els.openExportStudio.hidden=true;}
const seasonLabels={'26-27':'2026–27','25-26':'2025–26','24-25':'2024–25','23-24':'2023–24'};
let currentRows=[],snapshots=[],comparisonRows=[],teamById=new Map(),lastGameByTeamId=new Map();
let showNonzeroMovement=localStorage.getItem('brsnPlayoffLastNonzeroV1')==='1';
let comparisonExplicit=false,nonzeroKey='',nonzeroChanges=new Map();
function movementKey(){return `${els.sport.value}:${els.season.value}:${snapshots[0]?.id||'none'}`;}
function nonzeroActive(){return showNonzeroMovement && !comparisonExplicit;}
function syncMovementControls(){
  $('showNonzeroMovement').checked=showNonzeroMovement;
  $('showNonzeroMovement').disabled=comparisonExplicit;
  $('clearMovementComparison').hidden=!comparisonExplicit;
  $('nonzeroMovementHint').textContent=comparisonExplicit?'Selected comparison log overrides nonzero mode. Reset comparison to return.':nonzeroActive()?'Each team uses its own latest saved nonzero movement. Click the text for times.':'Click the text to browse saved RPI changes.';
}
async function loadNonzeroMovements(){
  const key=movementKey(),sport=els.sport.value,season=els.season.value;
  if(key===nonzeroKey)return;
  const {data,error}=await supabase.rpc('sport_last_nonzero_snapshot_changes',{p_sport:sport,p_season:season});
  if(error)throw error;
  if(key!==movementKey())return;
  nonzeroChanges=new Map((data||[]).map(row=>[String(row.team_id),row]));nonzeroKey=key;
}
function renderNonzeroMovements(){
  const filter=$('nonzeroMovementClass').value,search=$('nonzeroMovementSearch').value.trim().toLowerCase();
  const rows=currentRows.map(team=>({...team,movement:nonzeroChanges.get(String(team.team_id))}))
    .filter(row=>row.movement?.rpi_change!=null && row.movement.last_rpi_change_at && (filter==='ALL'||row.classification===filter) && displayTeamName(row.name||row.school_name).toLowerCase().includes(search))
    .sort((a,b)=>new Date(b.movement.last_rpi_change_at)-new Date(a.movement.last_rpi_change_at)||displayTeamName(a.name).localeCompare(displayTeamName(b.name)));
  const when=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
  $('nonzeroMovementSubtitle').textContent=`${sportNames[els.sport.value]||els.sport.value} · ${labelSeason(els.season.value)} · newest change first`;
  $('nonzeroMovementNote').textContent=`${rows.length} teams · Times are when changes were saved, not game times. Rank and RPI movements are tracked independently and may come from different logs. This list always shows nonzero history, even while the board compares a selected log.`;
  $('nonzeroMovementRows').innerHTML=rows.length?rows.map(row=>{
    const m=row.movement;
    return `<tr data-movement-team="${esc(row.team_id)}"><td>${esc(displayTeamName(row.name||row.school_name))}</td><td>${esc(row.classification)}</td><td>${row.rpi==null?'—':Number(row.rpi).toFixed(5)}</td><td class="movement-${m.rpi_change>0?'up':'down'}">${arrow(m.rpi_change,5)}</td><td class="movement-${m.region_rank_change>0?'up':m.region_rank_change<0?'down':'neutral'}">${m.region_rank_change==null?'—':arrow(m.region_rank_change)}</td><td>${esc(when(m.last_rpi_change_at))}</td></tr>`;
  }).join(''):'<tr><td colspan="6">No saved nonzero RPI changes match these filters.</td></tr>';
}
async function openNonzeroMovements(){
  const dialog=$('nonzeroMovementDialog');if(!dialog.open)dialog.showModal();
  $('nonzeroMovementRows').innerHTML='<tr><td colspan="6">Loading saved movements…</td></tr>';
  try{
    await loadNonzeroMovements();
    const previous=$('nonzeroMovementClass').value,classes=[...new Set(currentRows.map(row=>row.classification).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    $('nonzeroMovementClass').innerHTML='<option value="ALL">ALL classes</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('nonzeroMovementClass').value=classes.includes(previous)?previous:'ALL';
    renderNonzeroMovements();
  }catch(error){$('nonzeroMovementRows').innerHTML=`<tr><td colspan="6">Could not load movements: ${esc(error.message||error)}</td></tr>`;}
}
let sportSeasonRows=[],exportCurrentRows=[],exportTeamById=new Map(),exportSportSeason='';
let oddMiddleSide=localStorage.getItem('brsnOddMiddleSide')==='West'?'West':'East';
let exportJobId='',exportJobItems=[],exportJobPollTimer=0,exportFolderPath='',exportDateFolder='';
const sportNames={football:'Football',baseball:'Baseball',softball:'Softball',volleyball:'Volleyball',boys:'Boys Basketball',girls:'Girls Basketball',boys_basketball:'Boys Basketball',girls_basketball:'Girls Basketball',boys_soccer:'Boys Soccer',girls_soccer:'Girls Soccer'};
const NAME_NORMALIZATION_KEY='nchsaaRpiNameNormalizationV2';
let nameNormalization=loadNameNormalization();

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function loadNameNormalization(){
  try{
    const saved=JSON.parse(localStorage.getItem(NAME_NORMALIZATION_KEY)||'{}');
    return {phrases:Array.isArray(saved.phrases)?saved.phrases:[],tokens:Array.isArray(saved.tokens)?saved.tokens:[],overrides:saved.overrides&&typeof saved.overrides==='object'?saved.overrides:{}};
  }catch{return {phrases:[],tokens:[],overrides:{}};}
}
function normalizeTeamName(value){
  let working=String(value||'').trim();
  for(const phrase of nameNormalization.phrases){if(phrase)working=working.replace(new RegExp(String(phrase).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),' ');}
  return working.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(Boolean).filter(token=>!nameNormalization.tokens.some(t=>token===String(t).toLowerCase())).join(' ').trim();
}
function displayTeamName(value){
  const original=String(value||'');
  const source=normalizeTeamName(original);
  if(!source)return original;
  const target=Object.entries(nameNormalization.overrides).find(([name])=>normalizeTeamName(name)===source)?.[1];
  return target?String(target):original;
}
async function loadNameNormalizationFromHelper(){
  const pageUrl=new URL(location.href),fromAdmin=pageUrl.searchParams.get('nameNormalization');
  let appliedFromAdmin=false,persistedFromAdmin=false;
  if(fromAdmin){
    try{
      const saved=JSON.parse(fromAdmin);
      if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
        nameNormalization={phrases:Array.isArray(saved.phrases)?saved.phrases:[],tokens:Array.isArray(saved.tokens)?saved.tokens:[],overrides:saved.overrides&&typeof saved.overrides==='object'?saved.overrides:{}};
        appliedFromAdmin=true;
        try{localStorage.setItem(NAME_NORMALIZATION_KEY,JSON.stringify(nameNormalization));}catch{}
        if(localExportHelper)try{const response=await fetch('/name-normalization',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...nameNormalization,oddMiddleSide})});persistedFromAdmin=response.ok;}catch{}
      }
    }catch{}
    pageUrl.searchParams.delete('nameNormalization');
    history.replaceState({},'',pageUrl);
  }
  const querySide=pageUrl.searchParams.get('oddMiddleSide');if(['East','West'].includes(querySide)){oddMiddleSide=querySide;localStorage.setItem('brsnOddMiddleSide',oddMiddleSide);pageUrl.searchParams.delete('oddMiddleSide');history.replaceState({},'',pageUrl);}
  if(!appliedFromAdmin){
    try{const {data}=await supabase.from('playoff_picture_settings').select('name_normalization,odd_middle_side').eq('id','global').maybeSingle();if(data){nameNormalization={phrases:Array.isArray(data.name_normalization?.phrases)?data.name_normalization.phrases:[],tokens:Array.isArray(data.name_normalization?.tokens)?data.name_normalization.tokens:[],overrides:data.name_normalization?.overrides&&typeof data.name_normalization.overrides==='object'?data.name_normalization.overrides:{}};if(['East','West'].includes(data.odd_middle_side)){oddMiddleSide=data.odd_middle_side;localStorage.setItem('brsnOddMiddleSide',oddMiddleSide);}}}catch{}
  }
  if(!localExportHelper || (appliedFromAdmin&&!persistedFromAdmin))return;
  try{
    const response=await fetch('/name-normalization',{cache:'no-store'});
    if(!response.ok)return;
    const saved=await response.json();
    if(!saved||typeof saved!=='object'||Array.isArray(saved))return;
    nameNormalization={phrases:Array.isArray(saved.phrases)?saved.phrases:[],tokens:Array.isArray(saved.tokens)?saved.tokens:[],overrides:saved.overrides&&typeof saved.overrides==='object'?saved.overrides:{}};
    if(['East','West'].includes(saved.oddMiddleSide)){oddMiddleSide=saved.oddMiddleSide;localStorage.setItem('brsnOddMiddleSide',oddMiddleSide);}
  }catch{
    // Static deployments can still use same-origin localStorage overrides.
  }
}
function setStatus(message,error=false){els.status.textContent=message;els.status.classList.toggle('error',error);}
function labelSeason(s){return seasonLabels[s]||s;}
function selected(){return {sport:els.sport.value,season:els.season.value,classification:els.classification.value};}
function dateKey(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function todayKey(){return dateKey(new Date());}
function selectedComparisonSnapshot(){return snapshots.find(s=>String(s.id)===String(els.comparison.value))||null;}
function setComparisonLogsForDate(value,preferredId=''){
  const sameDay=snapshots.filter(snapshot=>dateKey(snapshot.snapshot_at)===value).sort((a,b)=>new Date(b.snapshot_at)-new Date(a.snapshot_at));
  els.comparison.innerHTML=sameDay.length?sameDay.map(snapshot=>{
    const timestamp=new Date(snapshot.snapshot_at).toLocaleString([], {month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'});
    const refreshType=String(snapshot.refresh_type||'refresh').replace(/-/g,' ');
    return `<option value="${esc(snapshot.id)}">${esc(timestamp)} · ${esc(refreshType)}${snapshot.calculation_mode?` · ${esc(snapshot.calculation_mode)}`:''}</option>`;
  }).join(''):'<option value="">No saved logs for this date</option>';
  if(preferredId&&sameDay.some(snapshot=>String(snapshot.id)===String(preferredId)))els.comparison.value=String(preferredId);
  else if(sameDay.length)els.comparison.value=String(sameDay[0].id);
  const selected=selectedComparisonSnapshot();
  els.comparison.title=selected?`Compare against ${new Date(selected.snapshot_at).toLocaleString()} (${selected.refresh_type}${selected.calculation_mode?` · ${selected.calculation_mode}`:''}).`:'No saved RPI logs for the selected date.';
}
function syncCompareDate(){const snapshot=selectedComparisonSnapshot();if(snapshot)els.compareDate.value=dateKey(snapshot.snapshot_at);}
let calendarMonth=new Date();
function renderCompareCalendar(){
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
  $('compareCalendarMonth').textContent=calendarMonth.toLocaleDateString([], {month:'long',year:'numeric'});
  const loggedDates=new Set(snapshots.map(snapshot=>dateKey(snapshot.snapshot_at)));
  let html='<span></span>'.repeat(new Date(year,month,1).getDay());
  for(let day=1;day<=new Date(year,month+1,0).getDate();day++){
    const date=new Date(year,month,day),key=dateKey(date),hasLogs=loggedDates.has(key);
    html+=`<button type="button" data-calendar-date="${key}" class="${hasLogs?'has-logs':''}" aria-pressed="${key===els.compareDate.value}" aria-label="${esc(date.toLocaleDateString([], {dateStyle:'full'}))}${hasLogs?', saved logs available':''}">${day}</button>`;
  }
  $('compareCalendarDays').innerHTML=html;
}
function closeCompareCalendar(restoreFocus=false){
  $('compareCalendar').hidden=true;
  $('compareCalendarButton').setAttribute('aria-expanded','false');
  if(restoreFocus)$('compareCalendarButton').focus();
}
$('compareCalendarButton').addEventListener('click',()=>{
  if(!$('compareCalendar').hidden){closeCompareCalendar();return;}
  calendarMonth=els.compareDate.value?new Date(`${els.compareDate.value}T12:00:00`):new Date();
  calendarMonth.setDate(1);renderCompareCalendar();
  $('compareCalendar').hidden=false;
  $('compareCalendarButton').setAttribute('aria-expanded','true');
  $('compareCalendarDays').querySelector('[aria-pressed="true"]')?.focus();
});
$('compareCalendar').addEventListener('click',event=>{
  const monthButton=event.target.closest('[data-calendar-month]');
  if(monthButton){calendarMonth.setMonth(calendarMonth.getMonth()+Number(monthButton.dataset.calendarMonth));renderCompareCalendar();return;}
  const dayButton=event.target.closest('[data-calendar-date]');
  if(dayButton){els.compareDate.value=dayButton.dataset.calendarDate;closeCompareCalendar(true);els.compareDate.dispatchEvent(new Event('change'));}
});
document.addEventListener('click',event=>{if(!event.target.closest('.compare-control'))closeCompareCalendar();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('compareCalendar').hidden){event.preventDefault();closeCompareCalendar(true);}});
function renderExportClassChoices(classes){
  els.exportClassChoices.innerHTML=classes.map(classification=>`<label><input type="checkbox" name="exportClass" value="${esc(classification)}" ${classification===els.classification.value?'checked':''}> ${esc(classification.replace(/^Class\s+/i,''))}</label>`).join('');
}
function regionCap(classification){return /8A/i.test(classification)?24:48;}
function safeColor(value,fallback){return /^#[\da-f]{6}$/i.test(String(value||''))?value:fallback;}
function mostVibrantTeamColor(team){
  const candidates=[team.primary_color,team.secondary_color].filter(value=>/^#[\da-f]{6}$/i.test(String(value||''))).map(value=>String(value).toUpperCase());
  if(!candidates.length)return '#35658A';
  const score=color=>{const rgb=color.slice(1).match(/../g).map(part=>parseInt(part,16)/255),max=Math.max(...rgb),min=Math.min(...rgb),sat=max===0?0:(max-min)/max;return sat*(.72+.28*max)*(max<.22?.45:1);};
  const chosen=candidates.sort((a,b)=>score(b)-score(a))[0];
  return /^#0{6}$/i.test(chosen)?'#FFFFFF':chosen;
}

async function loadSelectors(){
  const {data,error}=await supabase.from('sport_season_status').select('sport,season,enabled,display_order').eq('enabled',true).order('display_order');
  if(error)throw error;
  sportSeasonRows=data||[];
  const sports=[...new Set(sportSeasonRows.map(x=>x.sport))];
  els.sport.innerHTML=sports.map(s=>`<option value="${esc(s)}">${esc(sportNames[s]||s)}</option>`).join('');
  if(sports.includes('football'))els.sport.value='football';
  els.exportSport.innerHTML=sports.map(s=>`<option value="${esc(s)}">${esc(sportNames[s]||s)}</option>`).join('');els.exportSport.value=els.sport.value;
  const seasons=[...new Set(sportSeasonRows.filter(x=>x.sport===els.sport.value).map(x=>x.season))];
  els.season.innerHTML=seasons.map(s=>`<option value="${esc(s)}">${esc(labelSeason(s))}</option>`).join('');
  if(seasons.includes('26-27'))els.season.value='26-27';
}
async function loadRows(){
  const {sport,season}=selected();
  const {data,error}=await supabase.from('sport_dashboard_current').select('sport,season,team_id,name,school_name,mascot,classification,region,longitude,logo_1_url,logo_2_url,primary_color,secondary_color,wins,losses,ties,record,display_record,pseudo_game_count,rpi,overall_rank,class_rank,region_rank,playoff_opted_out,playoff_opt_out_reason,active').eq('sport',sport).eq('season',season).eq('active',true).order('rpi',{ascending:false,nullsFirst:false}).limit(2000);
  if(error)throw error;
  currentRows=data||[];teamById=new Map(currentRows.map(r=>[String(r.team_id),r]));
  const classes=[...new Set(currentRows.map(r=>r.classification).filter(Boolean))].sort((a,b)=>Number(a.match(/\d+/)?.[0]||0)-Number(b.match(/\d+/)?.[0]||0));
  const prior=els.classification.value;
  els.classification.innerHTML=classes.map(c=>`<option>${esc(c)}</option>`).join('');
  if(classes.includes(prior))els.classification.value=prior;
  else if(classes.includes('Class 3A'))els.classification.value='Class 3A';
  renderExportClassChoices(classes);
  await loadSnapshots();
  render();
}
async function loadSnapshots(){
  const {sport,season}=selected();
  const pageSize=500,pages=[];
  for(let from=0;;from+=pageSize){
    const {data,error}=await supabase.from('sport_rpi_snapshots').select('id,snapshot_at,refresh_type,calculation_mode,team_count').eq('sport',sport).eq('season',season).in('refresh_type',['full','manual-final']).order('snapshot_at',{ascending:false}).range(from,from+pageSize-1);
    if(error)throw error;pages.push(...(data||[]));if(!data||data.length<pageSize)break;
  }
  snapshots=pages;
  const selectedId=els.comparison.value;
  const dates=snapshots.map(s=>dateKey(s.snapshot_at)).filter(Boolean).sort();
  if(dates.length){els.compareDate.min=dates[0];els.compareDate.max=todayKey();}
  const chosen=(selectedId&&snapshots.find(s=>String(s.id)===selectedId))||snapshots[0];
  if(chosen){els.compareDate.value=dateKey(chosen.snapshot_at);setComparisonLogsForDate(els.compareDate.value,chosen.id);}
  else{els.compareDate.value='';els.comparison.innerHTML='<option value="">No saved RPI logs</option>';}
  await loadComparisonRows();
}
async function loadComparisonRows(){
  const snapshot=snapshots.find(s=>String(s.id)===els.comparison.value);
  if(!snapshot){comparisonRows=[];return;}
  const pageSize=1000,columns='snapshot_id,team_id,rpi,overall_rank,record,classification,region,playoff_opted_out,active';
  const fetchRows=async(snapshotIds,teamIds=null)=>{
    const result=[];for(let start=0;start<snapshotIds.length;start+=80){const idBatch=snapshotIds.slice(start,start+80);for(let from=0;;from+=pageSize){let query=supabase.from('sport_rpi_snapshot_rows').select(columns).in('snapshot_id',idBatch);if(teamIds)query=query.in('team_id',teamIds);const {data,error}=await query.order('team_id').range(from,from+pageSize-1);if(error)throw error;result.push(...(data||[]));if(!data||data.length<pageSize)break;}}return result;
  };
  const selectedRows=await fetchRows([snapshot.id]),currentTeams=currentRows.filter(row=>row.classification===els.classification.value&&row.rpi!=null&&!row.playoff_opted_out&&Number.isFinite(Number(row.longitude))&&row.team_id!=null),selectedIds=new Set(selectedRows.map(row=>String(row.team_id))),missing=currentTeams.filter(row=>!selectedIds.has(String(row.team_id))).map(row=>row.team_id);
  let fallbackRows=[];
  if(missing.length){
    const older=snapshots.filter(item=>new Date(item.snapshot_at)<new Date(snapshot.snapshot_at)).sort((a,b)=>new Date(b.snapshot_at)-new Date(a.snapshot_at));
    const candidates=await fetchRows(older.map(item=>item.id),missing),snapshotTime=new Map(older.map(item=>[String(item.id),new Date(item.snapshot_at).getTime()])),found=new Map();
    for(const row of candidates){const id=String(row.team_id);if(!missing.some(teamId=>String(teamId)===id)||row.rpi==null||row.active===false)continue;const current=currentTeams.find(team=>String(team.team_id)===id);if(!current||row.classification!==current.classification)continue;const time=snapshotTime.get(String(row.snapshot_id))||0;if(time>(found.get(id)?.time||0))found.set(id,{time,snapshotId:row.snapshot_id});}
    const fallbackIds=[...new Set([...found.values()].map(value=>value.snapshotId))];if(fallbackIds.length)fallbackRows=await fetchRows(fallbackIds);
  }
  const snapshotTimes=new Map(snapshots.map(item=>[String(item.id),item.snapshot_at]));
  comparisonRows=[...selectedRows,...fallbackRows].map(row=>({...row,snapshot_at:snapshotTimes.get(String(row.snapshot_id))||snapshot.snapshot_at,longitude:teamById.get(String(row.team_id))?.longitude??null}));
}
async function loadExportSportRows(){
  const sport=els.exportSport.value||els.sport.value;
  if(sport===els.sport.value){exportCurrentRows=currentRows;exportTeamById=teamById;exportSportSeason=els.season.value;}
  else{
    const seasons=[...new Set(sportSeasonRows.filter(row=>row.sport===sport).map(row=>row.season))];
    const season=seasons.includes(els.season.value)?els.season.value:seasons.includes('26-27')?'26-27':seasons[0];
    if(!season)throw new Error(`No enabled seasons found for ${sportNames[sport]||sport}.`);
    const {data,error}=await supabase.from('sport_dashboard_current').select('sport,season,team_id,name,school_name,mascot,classification,region,longitude,logo_1_url,logo_2_url,primary_color,secondary_color,wins,losses,ties,record,display_record,pseudo_game_count,rpi,overall_rank,class_rank,region_rank,playoff_opted_out,playoff_opt_out_reason,active').eq('sport',sport).eq('season',season).eq('active',true).order('rpi',{ascending:false,nullsFirst:false}).limit(2000);
    if(error)throw error;
    exportCurrentRows=data||[];exportTeamById=new Map(exportCurrentRows.map(row=>[String(row.team_id),row]));exportSportSeason=season;
  }
  const classes=[...new Set(exportCurrentRows.map(row=>row.classification).filter(Boolean))].sort(classSort);
  renderExportClassChoices(classes);
  const prior=els.classification.value;els.classification.innerHTML=classes.map(value=>`<option>${esc(value)}</option>`).join('');
  els.classification.value=classes.includes(prior)?prior:classes[0]||'';
  if(els.exportClassMode.value==='current')els.exportClassMode.value='choose';
  els.exportClassChoices.hidden=els.exportClassMode.value!=='choose';
  return classes;
}
async function loadLastGameResults(rows=currentRows,sport=els.sport.value,season=els.season.value){
  lastGameByTeamId=new Map();
  const teams=rows.filter(r=>r.classification===els.classification.value&&r.team_id!=null);
  const teamIds=[...new Set(teams.map(r=>String(r.team_id)))];
  const startDate=els.compareDate.value||dateKey(selectedComparisonSnapshot()?.snapshot_at||'');
  const endDate=todayKey();
  if(!teamIds.length||!startDate||startDate>endDate)return;
  const idList=teamIds.join(',');
  const teamFilter=`home_team_id.in.(${idList}),away_team_id.in.(${idList})`;
  const columns='contest_id,game_day,has_result,home_score,away_score,home_team_id,away_team_id,home_node_id,away_node_id,home_name,away_name,home_state,away_state,home_classification,away_classification';
  let {data,error}=await supabase.from('sport_dashboard_game_explorer').select(columns).eq('sport',sport).eq('season',season).eq('has_result',true).gte('game_day',startDate).lte('game_day',endDate).or(teamFilter).order('game_day',{ascending:false}).limit(5000);
  if(error&&/home_team_id|away_team_id|column/i.test(String(error.message||''))){
    ({data,error}=await supabase.from('sport_dashboard_game_explorer').select('contest_id,game_day,has_result,home_score,away_score,home_node_id,away_node_id,home_name,away_name,home_state,away_state,home_classification,away_classification').eq('sport',sport).eq('season',season).eq('has_result',true).gte('game_day',startDate).lte('game_day',endDate).order('game_day',{ascending:false}).limit(5000));
  }
  if(error)throw error;
  const teamIdSet=new Set(teamIds);
  const resolveSideId=(game,side)=>{
    const id=game[`${side}_team_id`];if(id!=null&&teamIdSet.has(String(id)))return String(id);
    const gameName=displayTeamName(game[`${side}_name`]||'').trim().toLowerCase();
    const gameClass=String(game[`${side}_classification`]||'').trim().toLowerCase();
    const matches=teams.filter(team=>displayTeamName(team.name||team.school_name||'').trim().toLowerCase()===gameName&&(!gameClass||String(team.classification||'').trim().toLowerCase()===gameClass));
    return matches.length===1?String(matches[0].team_id):null;
  };
  for(const game of data||[]){
    if(game.home_score==null||game.away_score==null)continue;
    for(const side of ['home','away']){
      const teamId=resolveSideId(game,side);if(!teamId||lastGameByTeamId.has(teamId))continue;
      const homeWin=Number(game.home_score)>Number(game.away_score),awayWin=Number(game.home_score)<Number(game.away_score),tied=Number(game.home_score)===Number(game.away_score);
      const won=side==='home'?homeWin:awayWin;
      lastGameByTeamId.set(teamId,{result:tied?'T':won?'W':'L',gameDay:game.game_day});
    }
  }
}
function makeRegionSplit(rows,sourceRows=currentRows){
  const eligible=rows.filter(r=>r.rpi!=null&&!r.playoff_opted_out&&Number.isFinite(Number(r.longitude)))
    .sort((a,b)=>Number(b.rpi)-Number(a.rpi)||Number(a.overall_rank||0)-Number(b.overall_rank||0)).slice(0,regionCap(els.classification.value))
    .sort((a,b)=>Math.abs(Number(a.longitude))-Math.abs(Number(b.longitude)));
  const oddTeamId=oddMiddleTeamId(els.classification.value,sourceRows);
  const eastN=Math.floor(eligible.length/2)+(eligible.length%2&&oddMiddleSide==='East'?1:0);
  const sides={east:eligible.slice(0,eastN),west:eligible.slice(eastN)};
  if(eligible.length%2&&oddTeamId&&eligible.some(team=>String(team.team_id)===oddTeamId)){
    const currentSide=sides.east.some(team=>String(team.team_id)===oddTeamId)?'east':'west',targetSide=oddMiddleSide.toLowerCase();
    if(currentSide!==targetSide){const from=sides[currentSide],to=sides[targetSide],index=from.findIndex(team=>String(team.team_id)===oddTeamId);to.push(from.splice(index,1)[0]);}
  }
  for(const side of Object.keys(sides))sides[side]=sides[side].sort((a,b)=>Number(b.rpi)-Number(a.rpi)||Number(a.overall_rank||0)-Number(b.overall_rank||0)).map((r,i)=>({...r,regionRank:i+1,lineRegion:side==='east'?'East':'West',_odd_middle:String(r.team_id)===oddTeamId}));
  return {...sides,total:eligible.length};
}
function oddMiddleTeamId(classification,sourceRows=currentRows){
  const baseClass=String(classification||'').replace(/^Class\s+/i,'').trim().toLowerCase();
  const qualifiers=sourceRows.filter(row=>String(row.classification||'').replace(/^Class\s+/i,'').trim().toLowerCase()===baseClass&&!row.playoff_opted_out&&(row.region==='East'||row.region==='West')&&row.region_rank!=null&&row.rpi!=null&&row.longitude!=null);
  if(!qualifiers.length||qualifiers.length%2===0)return '';
  qualifiers.sort((a,b)=>Math.abs(Number(b.longitude))-Math.abs(Number(a.longitude))||String(a.name||'').localeCompare(String(b.name||'')));
  return String(qualifiers[Math.floor(qualifiers.length/2)].team_id);
}
function historyFor(side,sourceRows=currentRows,sourceSport=els.sport.value){
  if(nonzeroActive() && sourceSport===els.sport.value){
    return new Map(sourceRows.map(row=>{
      const m=nonzeroKey===movementKey()?nonzeroChanges.get(String(row.team_id)):null;
      return [String(row.team_id),{nonzero:true,rankChange:m?.region_rank_change??null,rpiChange:m?.rpi_change??null,lastRpiChangeAt:m?.last_rpi_change_at??null}];
    }));
  }
  const groups=new Map();for(const row of comparisonRows){const id=String(row.snapshot_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
  const orderedGroups=[...groups.values()].sort((a,b)=>new Date(b[0].snapshot_at)-new Date(a[0].snapshot_at)),history=new Map(),oddId=oddMiddleTeamId(els.classification.value,sourceRows);
  for(const group of orderedGroups){
    const classRows=group.filter(row=>row.classification===els.classification.value&&row.rpi!=null);
    const oldRows=classRows.filter(row=>row.longitude!=null&&Number.isFinite(Number(row.longitude)))
      .sort((a,b)=>Number(b.rpi)-Number(a.rpi)||Number(a.overall_rank||0)-Number(b.overall_rank||0)).sort((a,b)=>Math.abs(Number(a.longitude))-Math.abs(Number(b.longitude)));
    const eastN=Math.floor(oldRows.length/2)+(oldRows.length%2&&oddMiddleSide==='East'?1:0),eastRows=oldRows.slice(0,eastN),westRows=oldRows.slice(eastN);
    if(oldRows.length%2&&oddId){const currentSide=eastRows.some(row=>String(row.team_id)===oddId)?'east':'west',target=oddMiddleSide.toLowerCase();if(currentSide!==target){const from=target==='east'?westRows:eastRows,to=target==='east'?eastRows:westRows,index=from.findIndex(row=>String(row.team_id)===oddId);if(index>=0)to.push(from.splice(index,1)[0]);}}
    const ranks=new Map();
    for(const previousSide of [eastRows,westRows])previousSide.sort((a,b)=>Number(b.rpi)-Number(a.rpi)||Number(a.overall_rank||0)-Number(b.overall_rank||0)).forEach((row,index)=>ranks.set(String(row.team_id),index+1));
    classRows.forEach(row=>{const id=String(row.team_id);if(!history.has(id))history.set(id,{rank:ranks.get(id)??null,rpi:Number(row.rpi),snapshotAt:row.snapshot_at});});
  }
  return history;
}
function arrow(value,digits=0){const n=Number(value);if(!Number.isFinite(n)||!n)return '—';return `${n>0?'▲':'▼'}${Math.abs(n).toFixed(digits)}`;}
function cardEntry(entry,history){
  if(!entry||entry.type==='empty')return '<div class="card-playoff-team card-playoff-placeholder is-bye"><div class="card-playoff-placeholder-text">BYE</div><div class="card-placeholder-detail">[No opponent]</div></div>';
  if(entry.type==='text'){
    const m=String(entry.text||'').match(/^Winner of #(\d+) vs #(\d+)$/i);
    if(m)return `<div class="card-playoff-team card-playoff-placeholder is-winner"><div class="card-placeholder-eyebrow">ADVANCES TO SECOND ROUND</div><div class="card-playoff-placeholder-text"><span>No. ${m[1]}</span><small>VS</small><span>No. ${m[2]}</span></div><div class="card-placeholder-detail">Matchup winner</div></div>`;
    return `<div class="card-playoff-team card-playoff-placeholder ${entry.bye?'is-bye':''}"><div class="card-playoff-placeholder-text">${esc(entry.text||'BYE')}</div></div>`;
  }
  const t=entry.team, old=history.get(String(t.team_id)), move=old?.nonzero?old.rankChange:old?.rank!=null?old.rank-t.regionRank:null, delta=old?.nonzero?old.rpiChange:old?.rpi!=null?Number(t.rpi)-old.rpi:null;
  const logo=t.logo_1_url||t.logo_2_url||'', primary=mostVibrantTeamColor(t),secondary=safeColor(t.secondary_color,'#182735');
  const style=`--team-primary:${primary};--team-secondary:${secondary};--team-accent:${primary};--rank-accent:${primary}`;
  const oddClass=t._odd_middle?` odd-extra-${t.lineRegion.toLowerCase()}`:'';
  const moveClass=move==null||!move?'zero':move>0?'pos':'neg', deltaClass=delta==null||!delta?'zero':delta>0?'positive':'negative';
  const moveDisplay=old?.nonzero?(move==null?'—':arrow(move)):old?.rank!=null?(move===0?'—':arrow(move)):'NEW',deltaDisplay=old?.nonzero?(delta==null?'—':arrow(delta,5).replace('0.','.')):old?.rpi!=null?(delta===0?'—':arrow(delta,5).replace('0.','.')):'NEW';
  const rankTitle=old?.nonzero?'Last nonzero regional rank movement between saved logs':old?.rank!=null?`Previous playoff rank: #${old.rank} (${dateKey(old.snapshotAt)})`:'No previous playoff rank in saved history';
  const rpiTitle=old?.nonzero?`Last nonzero saved RPI change${old.lastRpiChangeAt?' at '+new Date(old.lastRpiChangeAt).toLocaleString():' unavailable'}`:old?.rpi!=null?`Current RPI minus saved RPI ${Number(old.rpi).toFixed(5)} from ${dateKey(old.snapshotAt)}`:'No earlier saved RPI for this team';
  const name=displayTeamName(String(t.name||t.school_name||'Team').trim()),words=name.split(/\s+/),split=words.length>1?1:0,nameHtml=split?`${esc(words.slice(0,split).join(' '))}<br>${esc(words.slice(split).join(' ') )}`:esc(name);
  const lastGame=lastGameByTeamId.get(String(t.team_id)),lastGameGlyph=lastGame?lastGame.result==='W'?'▲':lastGame.result==='L'?'▼':'—':'';
  return `<div class="card-playoff-team${oddClass}" data-move="${moveClass}" ${t._odd_middle?'title="Coin-flip team: this region will be decided at the end of the season"':''} style="${style}"><div class="card-playoff-rank"><svg class="card-playoff-rank-edge" viewBox="0 0 72 104" preserveAspectRatio="none" aria-hidden="true"><path d="M71 0 V87 L63 103 H0" /></svg><div class="card-playoff-rank-number">${t.regionRank}</div><div class="card-playoff-move" title="${esc(rankTitle)}"><span>${moveDisplay}</span></div></div><div class="card-playoff-hero"><div class="card-playoff-logo-wrap">${logo?`<img class="card-playoff-logo" src="${esc(logo)}" alt="" referrerpolicy="no-referrer">`:'<div class="card-playoff-logo-placeholder"></div>'}</div><div class="card-playoff-copy"><div class="card-playoff-school">${nameHtml}</div>${t.mascot?`<div class="card-playoff-mascot">${esc(t.mascot)}</div>`:''}</div></div><div class="card-playoff-stats"><div class="card-playoff-stat"><span>W-L-T</span><div class="card-playoff-stat-value card-playoff-record" title="${esc(t.pseudo_game_count?`Includes placeholder-opponent games excluded from RPI. RPI record: ${t.record}`:'Record used for RPI')}">${lastGame?`<span class="card-playoff-last-result" title="Last game in comparison range: ${lastGame.result==='W'?'Win':lastGame.result==='L'?'Loss':'Tie'} on ${esc(lastGame.gameDay)}">${lastGameGlyph}</span>`:''}${esc(t.display_record??t.record??'—')}</div></div><div class="card-playoff-stat"><span>RPI</span><div class="card-playoff-stat-value">${Number(t.rpi).toFixed(5).replace(/^0\./,'.')}</div></div><div class="card-playoff-stat card-playoff-delta ${deltaClass}" title="${esc(rpiTitle)}"><span>RPI CHANGE</span><div class="card-playoff-stat-value">${deltaDisplay}</div></div></div></div>`;
}
function bracketRows(rows,total){
  const teams=new Map(rows.map(row=>[Number(row.regionRank),{type:'team',team:row}]));
  const size=2**Math.ceil(Math.log2(Math.max(2,...teams.keys()))),games=[],byes=new Map();
  for(let seed=1;seed<=size/2;seed++){const high=size+1-seed;if(teams.has(seed)&&teams.has(high))games.push({seed,high});else if(teams.has(seed)||teams.has(high))byes.set(seed,teams.get(seed)||teams.get(high));}
  games.sort((a,b)=>b.seed-a.seed);
  let data=games.map(({seed,high})=>{const next=size/2+1-seed,left=byes.get(next)||{type:'text',text:`Winner of #${seed} vs #${high}`};byes.delete(next);return{left,middle:teams.get(seed),right:teams.get(high)};});
  for(const [seed,entry] of byes){if(!byes.has(seed))continue;const other=size/2+1-seed;data.push({left:entry,middle:byes.get(other),right:null});byes.delete(seed);byes.delete(other);}
  const ordered=[],placed=new Set();
  for(const row of data){if(placed.has(row))continue;ordered.push(row);placed.add(row);if(row.left?.type!=='text')continue;const opponent=size/2+1-Number(row.middle?.team?.regionRank);const partner=data.find(other=>other.left?.type==='text'&&Number(other.middle?.team?.regionRank)===opponent);if(partner&&!placed.has(partner)){ordered.push(partner);placed.add(partner);}}
  return ordered;
}
function rowHtml(row,history,hasWinnerVs=false){return `<div class="card-playoff-row">${cardEntry(row.left,history)}<div class="card-playoff-connector" aria-hidden="true"></div>${cardEntry(row.middle,history)}<div class="card-playoff-vs" aria-hidden="true">VS</div>${cardEntry(row.right,history)}${hasWinnerVs?'<div class="card-playoff-vs card-playoff-winner-vs" aria-label="Second-round matchup">VS</div>':''}</div>`;}
function render(generatedAt=new Date(),sourceRows=currentRows,sourceSport=els.sport.value){
  const side=els.region.value,classification=els.classification.value,split=makeRegionSplit(sourceRows.filter(r=>r.classification===classification),sourceRows),rows=split[side],history=historyFor(side,sourceRows,sourceSport),orderedRows=bracketRows(rows,split.total);
  const excluded=sourceRows.filter(r=>r.classification===classification&&r.playoff_opted_out).map(r=>displayTeamName(r.name||r.school_name)).filter(Boolean);
  const hasCoinTeam=rows.some(row=>row._odd_middle);
  const hasPlaceholderRecord=rows.some(row=>Number(row.pseudo_game_count)>0);
  const timestamp=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(generatedAt).toUpperCase();
  els.graphic.dataset.region=side;els.graphic.dataset.backgroundSport=/volleyball|basketball/i.test(sourceSport)?'basketball':'football';
  const sportLabel=sportNames[sourceSport]||sourceSport;
  els.graphic.innerHTML=`<header class="card-playoff-title"><div class="card-banner-region">${side.toUpperCase()}<span>REGION</span></div><h1><span class="card-banner-heading">${esc(classification.replace(/^Class\s+/i,''))} ${esc(sportLabel)}</span><span class="card-banner-subtitle">PLAYOFF PICTURE</span></h1><div class="card-banner-meta"><div class="card-banner-wordmark"><div><b>BIG</b> <b>RED</b></div><small>SPORTS NETWORK</small></div></div></header><div class="playoff-regions card-playoff-regions"><div class="graphic-region card-playoff-region ${side}"><div class="card-playoff-heads"><div>Second Round</div><div>First Round</div></div><div class="card-playoff-rows" style="--card-row-count:${orderedRows.length}">${orderedRows.map((r,i)=>rowHtml(r,history,r.left?.type==='text'&&orderedRows[i+1]?.left?.type==='text'&&Number(r.middle?.team?.regionRank)+Number(orderedRows[i+1]?.middle?.team?.regionRank)=== (2**Math.ceil(Math.log2(Math.max(2,...rows.map(team=>Number(team.regionRank))))))/2+1)).join('')}</div><div class="card-playoff-note-slot">${hasCoinTeam?'<div class="odd-extra-note">Highlighted team’s region will be determined by a coin flip at the end of the season.</div>':''}</div></div></div>${hasPlaceholderRecord?'<div class="placeholder-record-note">* Record includes placeholder-opponent games excluded from RPI.</div>':''}${excluded.length?`<div class="excluded-teams-note">OPTED OUT: ${excluded.map(esc).join(' • ')}</div>`:''}<footer class="graphic-footer">BRSN <span>• ${esc(timestamp)}</span></footer>`;
  const snap=selectedComparisonSnapshot(),when=snap?new Date(snap.snapshot_at).toLocaleString():'no comparison log on this date';
  syncMovementControls();
  setStatus(`${classification} ${els.sport.options[els.sport.selectedIndex]?.text||'Football'} · ${side.toUpperCase()} region · ${rows.length} playoff teams · ${nonzeroActive()?'last nonzero saved regional rank and RPI movements':`movement compared with ${when}`} · last-game arrows from ${els.compareDate.value||'—'} through today.`);
}
async function refresh(){
  els.reload.disabled=true;els.download.disabled=true;setStatus('Loading live RPI and saved comparison history…');
  try{await loadNameNormalizationFromHelper();await loadRows();if(nonzeroActive())await loadNonzeroMovements();await loadLastGameResults();render();els.download.disabled=false;}catch(e){setStatus(e.message||String(e),true);els.graphic.innerHTML='';}finally{els.reload.disabled=false;syncMovementControls();}
}
function exportDocument(){
  const artboard=els.graphic.cloneNode(true);artboard.style.cssText+=';width:1600px;height:2000px;min-width:1600px;min-height:2000px;margin:0;zoom:1';
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${location.href}"><link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@500;600;700;800&family=Goldman:wght@400;700&family=Russo+One&display=swap" rel="stylesheet"><link rel="stylesheet" href="playoff-picture.css"><link rel="stylesheet" href="playoff-card-base.css"><link rel="stylesheet" href="playoff-card.css"></head><body class="sports-graphic-export">${artboard.outerHTML}</body></html>`;
}
async function download(){
  els.download.disabled=true;setStatus('Rendering 3200 × 4000 PNG…');
  try{render(new Date());const response=await fetch('/export-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:exportDocument(),selector:'#graphic',scale:2})});if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error||'PNG renderer unavailable. Start the local playoff-picture helper.');}
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`${els.classification.value.replace(/\s/g,'_')}_${els.sport.value}_${els.region.value}_playoff_picture.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('PNG downloaded.');
  }catch(e){setStatus(e.message||String(e),true);}finally{els.download.disabled=false;}
}
function classSort(a,b){return Number(String(a).match(/\d+/)?.[0]||0)-Number(String(b).match(/\d+/)?.[0]||0)||String(a).localeCompare(String(b));}
function displayClass(value){return String(value||'').replace(/^Class\s+/i,'').trim();}
function safeFileBase(value){return String(value||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');}
function selectedExportClasses(){
  const all=[...new Set(currentRows.map(row=>row.classification).filter(Boolean))].sort(classSort);
  if(els.exportClassMode.value==='current')return [els.classification.value].filter(Boolean);
  if(els.exportClassMode.value==='choose')return [...els.exportClassChoices.querySelectorAll('input[name="exportClass"]:checked')].map(input=>input.value).sort(classSort);
  return all;
}
function selectedExportRegions(){return els.exportLayout.value==='both'?['west','east']:[els.exportLayout.value];}
function renderExportQueue(){
  if(!exportJobItems.length){els.exportQueue.innerHTML='<div class="export-queue-empty">Choose classes and layout, then build exports.</div>';els.exportProgressText.textContent='0 / 0 rendered';els.exportProgressBar.style.width='0%';els.exportDownloadAll.disabled=true;return;}
  const rendered=exportJobItems.filter(item=>item.status==='rendered').length,finished=exportJobItems.every(item=>['rendered','error'].includes(item.status));
  els.exportProgressText.textContent=`${rendered} / ${exportJobItems.length} rendered`;els.exportProgressBar.style.width=`${Math.round(rendered/exportJobItems.length*100)}%`;els.exportDownloadAll.disabled=!finished||rendered===0;
  els.exportQueue.innerHTML=exportJobItems.map((item,index)=>`<div class="export-queue-row"><div class="export-queue-title" title="${esc(item.baseName)}">${esc(item.baseName)}</div><input data-export-name="${index}" aria-label="PNG filename" value="${esc(item.baseName)}"><span class="export-queue-status" data-state="${esc(item.status)}">${item.status==='rendered'?'Rendered':item.status==='rendering'?'Rendering':item.status==='error'?'Error':'Queued'}</span><button type="button" data-export-download="${index}" ${item.status!=='rendered'?'disabled':''}>Download</button></div>`).join('');
}
function setExportQueueStatus(message,error=false){els.exportFolderName.textContent=message;els.exportFolderName.classList.toggle('error',error);}
async function openExportStudio(){
  els.exportStudio.hidden=false;document.body.style.overflow='hidden';
  els.exportSport.value=els.sport.value;
  try{await loadExportSportRows();}catch(error){setExportQueueStatus(error.message||String(error),true);}
  if(exportJobItems.length)renderExportQueue();
  els.closeExportStudio.focus();
}
function closeExportStudio(){els.exportStudio.hidden=true;document.body.style.overflow='';}
async function buildExports(){
  const classes=selectedExportClasses().sort(classSort),regions=selectedExportRegions();
  if(!classes.length){setExportQueueStatus('Select at least one class.',true);return;}
  if(classes.length*regions.length>24){setExportQueueStatus('Choose 24 or fewer class and region combinations.',true);return;}
  if(exportJobId){try{await fetch(`/export-job?jobId=${encodeURIComponent(exportJobId)}`,{method:'DELETE'});}catch{}}
  clearTimeout(exportJobPollTimer);exportJobId='';
  const generatedAt=new Date();exportDateFolder=dateKey(generatedAt);
  const sport=els.exportSport.value||els.sport.value,sportLabel=sportNames[sport]||sport;
  if(sport!==els.sport.value){const rows=exportCurrentRows;await loadLastGameResults(rows,sport,exportSportSeason);}
  exportJobItems=classes.flatMap(classification=>regions.map(region=>({classification,region,status:'queued',blob:null,html:'',baseName:''})));
  exportJobItems.forEach((item,index)=>item.baseName=`${String(index+1).padStart(2,'0')} ${displayClass(item.classification)} ${sportLabel} ${item.region==='west'?'West':'East'} Playoff Picture`);
  renderExportQueue();setExportQueueStatus(`Preparing ${exportJobItems.length} playoff pictures…`);els.buildExports.disabled=true;
  const priorClass=els.classification.value,priorRegion=els.region.value;els.reload.disabled=true;els.download.disabled=true;
  try{
    let cursor=0;
    for(const classification of classes){
      els.classification.value=classification;await loadLastGameResults();
      for(const region of regions){
      const item=exportJobItems[cursor++];els.region.value=region;render(generatedAt,exportCurrentRows,sport);item.html=exportDocument();
      }
      setExportQueueStatus(`Prepared ${cursor} of ${exportJobItems.length} images…`);
    }
    const response=await fetch('/export-job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:exportJobItems.map(item=>({name:`${safeFileBase(item.baseName)}.png`,html:item.html}))})});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`Could not start rendering: HTTP ${response.status}. Restart the local playoff-picture server if it does not support Export Studio.`);}
    const job=await response.json();exportJobId=job.jobId;exportJobItems.forEach(item=>item.html='');await pollExportJob();
  }catch(error){setExportQueueStatus(error.message||String(error),true);exportJobItems.forEach(item=>{if(item.status!=='rendered')item.status='error';});renderExportQueue();}
  finally{
    els.classification.value=priorClass;els.region.value=priorRegion;
    try{await loadLastGameResults(currentRows,els.sport.value,els.season.value);}catch{}
    render(generatedAt,currentRows,els.sport.value);els.reload.disabled=false;els.download.disabled=false;els.buildExports.disabled=false;
  }
}
async function pollExportJob(){
  if(!exportJobId)return;
  try{
    const response=await fetch(`/export-job?jobId=${encodeURIComponent(exportJobId)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Export status failed: HTTP ${response.status}`);
    const job=await response.json();
    job.items.forEach((item,index)=>{if(exportJobItems[index]){exportJobItems[index].status=item.status;exportJobItems[index].error=item.error||'';}});
    renderExportQueue();setExportQueueStatus(job.state==='complete'?'All pictures rendered.':job.state==='error'?'Some pictures failed; download the completed images or rebuild.':`Rendering ${job.rendered} of ${job.total} pictures…`,job.state==='error');
    if(['complete','error','cancelled'].includes(job.state)){exportJobPollTimer=0;els.buildExports.disabled=false;return;}
    exportJobPollTimer=setTimeout(pollExportJob,700);
  }catch(error){setExportQueueStatus(error.message||String(error),true);exportJobPollTimer=setTimeout(pollExportJob,1500);}
}
async function getExportImage(index){
  const response=await fetch(`/export-job-item?jobId=${encodeURIComponent(exportJobId)}&index=${index}`);
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`Image download failed: HTTP ${response.status}`);}
  return response.blob();
}
async function saveToChosenFolder(filename,blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  const response=await fetch('/save-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:filename,data:btoa(binary),datedFolder:els.saveDatedFolder.checked?exportDateFolder:''})});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`Saving PNG failed: HTTP ${response.status}`);}
}
function browserDownload(filename,blob){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function downloadQueueItem(index){
  const item=exportJobItems[index];if(!item||item.status!=='rendered')return;
  const filename=`${safeFileBase(item.baseName)||`Playoff Picture ${index+1}`}.png`;
  try{const blob=await getExportImage(index);if(exportFolderPath)await saveToChosenFolder(filename,blob);else browserDownload(filename,blob);setExportQueueStatus(`Saved ${filename}`);}catch(error){setExportQueueStatus(error.message||String(error),true);}
}
async function downloadAllExports(){
  const ready=exportJobItems.some(item=>item.status==='rendered');if(!ready)return;
  els.exportDownloadAll.disabled=true;
  try{
    if(exportFolderPath){
      const indexes=exportJobItems.map((item,index)=>item.status==='rendered'?index:-1).filter(index=>index>=0);
      for(let i=0;i<indexes.length;i++){const index=indexes[i],item=exportJobItems[index],blob=await getExportImage(index);await saveToChosenFolder(`${safeFileBase(item.baseName)}.png`,blob);setExportQueueStatus(`Saved ${i+1} of ${indexes.length} PNGs to ${exportFolderPath}`);}
    }else{
      const names=exportJobItems.map(item=>`${safeFileBase(item.baseName)}.png`);
      const response=await fetch('/export-job-zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:exportJobId,names,datedFolder:els.saveDatedFolder.checked?exportDateFolder:''})});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`ZIP download failed: HTTP ${response.status}`);}
      browserDownload(`Playoff Picture Exports ${exportDateFolder}.zip`,await response.blob());setExportQueueStatus(`Downloaded ${exportJobItems.filter(item=>item.status==='rendered').length} PNGs in a ZIP.`);
    }
  }catch(error){setExportQueueStatus(error.message||String(error),true);}
  finally{renderExportQueue();}
}
async function browseExportFolder(){
  els.browseExportFolder.disabled=true;setExportQueueStatus('Opening the Windows folder browser…');
  try{const response=await fetch('/browse-folder',{cache:'no-store'});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`Folder browser failed: HTTP ${response.status}`);}const result=await response.json();if(!result.selected){setExportQueueStatus('No folder selected.');return;}exportFolderPath=result.folder;els.exportFolderName.textContent=`Selected folder: ${exportFolderPath}`;els.exportFolderName.classList.remove('error');}catch(error){setExportQueueStatus(error.message||String(error),true);}finally{els.browseExportFolder.disabled=false;}
}
async function clearExportQueue(){
  clearTimeout(exportJobPollTimer);if(exportJobId){try{await fetch(`/export-job?jobId=${encodeURIComponent(exportJobId)}`,{method:'DELETE'});}catch{}}
  exportJobId='';exportJobItems=[];renderExportQueue();setExportQueueStatus('ZIP exports will be saved by the browser');
}
els.reload.addEventListener('click',refresh);els.download.addEventListener('click',download);
els.openExportStudio.addEventListener('click',openExportStudio);els.closeExportStudio.addEventListener('click',closeExportStudio);
els.exportStudio.addEventListener('click',event=>{if(event.target===els.exportStudio)closeExportStudio();});
els.exportClassMode.addEventListener('change',()=>{els.exportClassChoices.hidden=els.exportClassMode.value!=='choose';});
els.exportSport.addEventListener('change',async()=>{try{await loadExportSportRows();setExportQueueStatus(`Loaded ${sportNames[els.exportSport.value]||els.exportSport.value} playoff classes.`);}catch(error){setExportQueueStatus(error.message||String(error),true);}});
els.buildExports.addEventListener('click',buildExports);els.exportDownloadAll.addEventListener('click',downloadAllExports);
els.browseExportFolder.addEventListener('click',browseExportFolder);els.clearExportQueue.addEventListener('click',clearExportQueue);
els.exportQueue.addEventListener('input',event=>{const input=event.target.closest('[data-export-name]');if(!input)return;const item=exportJobItems[Number(input.dataset.exportName)];if(item){item.baseName=input.value;const title=input.closest('.export-queue-row')?.querySelector('.export-queue-title');if(title)title.textContent=input.value;}});
els.exportQueue.addEventListener('click',event=>{const button=event.target.closest('[data-export-download]');if(button)void downloadQueueItem(Number(button.dataset.exportDownload));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!els.exportStudio.hidden)closeExportStudio();});
window.addEventListener('storage',event=>{if(event.key===NAME_NORMALIZATION_KEY){nameNormalization=loadNameNormalization();render();}else if(event.key==='brsnOddMiddleSide'){oddMiddleSide=event.newValue==='West'?'West':'East';render();}});
els.sport.addEventListener('change',()=>{comparisonExplicit=false;const seasons=[...new Set(sportSeasonRows.filter(x=>x.sport===els.sport.value).map(x=>x.season))];els.season.innerHTML=seasons.map(s=>`<option value="${esc(s)}">${esc(labelSeason(s))}</option>`).join('');if(seasons.includes('26-27'))els.season.value='26-27';refresh();});
els.season.addEventListener('change',()=>{comparisonExplicit=false;refresh();});
els.classification.addEventListener('change',async()=>{try{await loadLastGameResults();render();}catch(e){setStatus(e.message,true);}});els.region.addEventListener('change',()=>render());
els.comparison.addEventListener('change',async()=>{comparisonExplicit=true;syncMovementControls();const snapshot=selectedComparisonSnapshot();if(snapshot){syncCompareDate();}try{await loadComparisonRows();await loadLastGameResults();render();}catch(e){setStatus(e.message,true);}});
els.compareDate.addEventListener('change',async()=>{comparisonExplicit=true;syncMovementControls();setComparisonLogsForDate(els.compareDate.value);try{await loadComparisonRows();await loadLastGameResults();render();}catch(e){setStatus(e.message,true);}});
$('showNonzeroMovement').addEventListener('change',async()=>{
  showNonzeroMovement=$('showNonzeroMovement').checked;
  localStorage.setItem('brsnPlayoffLastNonzeroV1',showNonzeroMovement?'1':'0');
  syncMovementControls();
  try{if(nonzeroActive())await loadNonzeroMovements();render();}catch(error){setStatus('Could not load saved nonzero movements: '+(error.message||error),true);}
});
$('openNonzeroMovements').addEventListener('click',openNonzeroMovements);
$('closeNonzeroMovements').addEventListener('click',()=>$('nonzeroMovementDialog').close());
$('nonzeroMovementClass').addEventListener('change',renderNonzeroMovements);
$('nonzeroMovementSearch').addEventListener('input',renderNonzeroMovements);
$('clearMovementComparison').addEventListener('click',async()=>{
  comparisonExplicit=false;
  const latest=snapshots[0];if(latest){els.compareDate.value=dateKey(latest.snapshot_at);setComparisonLogsForDate(els.compareDate.value,latest.id);}
  syncMovementControls();
  try{await loadComparisonRows();if(nonzeroActive())await loadNonzeroMovements();await loadLastGameResults();render();}catch(error){setStatus(error.message||String(error),true);}
});
syncMovementControls();
try{await loadSelectors();await refresh();}catch(e){setStatus(e.message||String(e),true);}
