(function(root){
  'use strict';
  const engine=root.RpiScenarios, sessions=new Map();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=value=>value==null?'—':Number(value).toFixed(5);
  const delta=value=>(value>0?'+':'')+Number(value).toFixed(5);
  const date=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  let dialog,session,selected,step=0,opponent='',context,loadToken=0;
  function makeDialog(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='rpiScenarioDialog';
    dialog.setAttribute('aria-labelledby','scenarioTitle');
    document.body.append(dialog);
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.action==='close'){dialog.close();return;}
      if(button.dataset.action==='reset'){session.picks={};session.result=null;session.optimization=null;session.optimizerError=null;session.applied=false;root.dispatchEvent(new CustomEvent('rpi-scenario-reset',{detail:{season:context.season}}));step=0;render();return;}
      if(button.dataset.action==='view'){dialog.close();root.dispatchEvent(new CustomEvent('rpi-scenario-view'));return;}
      if(['best','worst'].includes(button.dataset.action)){
        try{
          const pending=engine.remaining(session.games,session.nodes,session.start,session.end);
          const optimized=engine.optimize(session.nodes,session.games,pending,node()?.id,button.dataset.action,session.picks,Boolean(session.keepPicks));
          session.picks=optimized.picks;session.result=null;
          session.optimization={...optimized,teamName:team()?.name};session.optimizerError=null;
          step=2;dialog.scrollTop=0;
        }catch(error){session.optimizerError=error.message;}
        render();return;
      }
      if(button.dataset.step!=null){step=Number(button.dataset.step);dialog.scrollTop=0;render();return;}
      if(button.dataset.action==='run'){step=2;render();return;}
      if(button.dataset.team){event.preventDefault();selected=String(button.dataset.team);opponent='';step=0;dialog.scrollTop=0;render();}
    });
    dialog.addEventListener('change',event=>{
      const el=event.target;
      if(el.id==='scenarioTeam'){selected=el.value;opponent='';step=0;render();}
      if(el.id==='scenarioEnd'){if(el.value && el.value>=session.start)session.end=el.value;session.result=null;session.optimization=null;session.optimizerError=null;render();}
      if(el.id==='scenarioKeepPicks'){session.keepPicks=el.checked;}
      if(el.id==='scenarioOpponent'){opponent=el.value;render();}
      if(el.id==='scenarioBreakdownOther'){session.breakdownOther=el.value;render();}
      if(el.dataset.contest){
        if(el.value)session.picks[el.dataset.contest]=el.value;else delete session.picks[el.dataset.contest];
        session.result=null;session.optimization=null;session.optimizerError=null;render();
      }
    });
  }
  const team=()=>session.teams.find(t=>String(t.team_id)===selected);
  const node=()=>session.nodes.find(n=>String(n.team_id)===selected && n.is_primary && n.is_nchsaa_member);
  const name=id=>session.nodeMap.get(String(id))?.name || 'Unknown team';
  const heading=()=>`<header><div><span class="scenario-tag">Temporary projection · Football ${escape(context.season)}</span><h2 id="scenarioTitle">RPI Scenarios</h2><div class="scenario-muted">${escape(team()?.name || 'Team')} · shared session · nothing is saved to live results</div></div><button data-action="close" aria-label="Close RPI scenarios">×</button></header>`;
  function publish(projected,baseline){
    root.dispatchEvent(new CustomEvent('rpi-scenario-update',{detail:{season:context.season,rows:projected,baseline,
      label:session.optimization?`${session.optimization.mode==='best'?'Best':'Worst'} case for ${session.optimization.teamName}`:`Scenario for ${team()?.name || 'football'}`}}));
  }
  function gameCard(g){
    const picked=session.picks[g.contest_id] || '';
    const h=session.strength.get(String(g.home_node_id)),a=session.strength.get(String(g.away_node_id));
    const autoWinner=(h?.rpi??h?.wp??.5)>=(a?.rpi??a?.wp??.5)?g.home_node_id:g.away_node_id;
    return `<div class="scenario-game"><div><strong>${escape(name(g.away_node_id))} at ${escape(name(g.home_node_id))}</strong><span class="scenario-muted">${escape(g.game_day)} · ${picked?'Selected result · shared across all teams':'Auto: '+escape(name(autoWinner))+' projected win'}</span></div><label><span class="scenario-muted">Winner</span><select aria-label="Winner: ${escape(name(g.away_node_id))} at ${escape(name(g.home_node_id))}" data-contest="${escape(g.contest_id)}"><option value="" ${!picked?'selected':''}>Auto · higher current RPI</option><option value="home" ${picked==='home'?'selected':''}>${escape(name(g.home_node_id))}</option><option value="away" ${picked==='away'?'selected':''}>${escape(name(g.away_node_id))}</option></select></label></div>`;
  }
  function render(){
    if(!session)return;
    const expanded=new Set([...dialog.querySelectorAll('details[data-breakdown-key][open]')].map(el=>el.dataset.breakdownKey));
    const n=node(),target=String(n?.id),current=team();
    const pending=engine.remaining(session.games,session.nodes,session.start,session.end);
    const direct=new Set();
    for(const g of session.games){
      if(String(g.home_node_id)===target)direct.add(String(g.away_node_id));
      if(String(g.away_node_id)===target)direct.add(String(g.home_node_id));
    }
    const own=pending.filter(g=>String(g.home_node_id)===target || String(g.away_node_id)===target);
    const opponents=[...direct].map(id=>session.nodeMap.get(id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
    if(!opponents.some(o=>String(o.id)===opponent))opponent=String(opponents[0]?.id || '');
    const oppGames=pending.filter(g=>String(g.home_node_id)===opponent || String(g.away_node_id)===opponent);
    const stale=session.games.filter(g=>!g.has_result && g.game_day<session.start && !/cancel|postpon|scrimmage|no.contest/i.test(g.status || '')).length;
    const activePicks=pending.filter(g=>session.picks[g.contest_id]).length;
    const options=session.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>`<option value="${escape(t.team_id)}" ${String(t.team_id)===selected?'selected':''}>${escape(t.name)} · ${escape(t.classification)}</option>`).join('');
    let body=`<p class="scenario-muted">One shared set of results for every team. Switch teams to continue the same projection; choosing a winner updates that matchup everywhere. Closing this window keeps selections until the page reloads.</p><div class="scenario-controls"><label>Continue with another team<select id="scenarioTeam">${options}</select></label><label>Project games through<input id="scenarioEnd" type="date" min="${session.start}" value="${escape(session.end)}"></label><button data-action="reset">Reset all projections</button></div><div class="scenario-steps">${['1 · Your remaining games','2 · Opponents’ remaining games','3 · Simulation breakdown'].map((label,i)=>`<button data-step="${i}" ${step===i?'aria-current="step"':''}>${label}</button>`).join('')}</div>`;
    body+=`<div class="scenario-extremes"><div><strong>Explore ${escape(current?.name || 'this team')}’s RPI range</strong><p class="scenario-muted">Choose every remaining winner to maximize or minimize this team’s RPI. This optimizes RPI, not its seed or bye chances.</p></div><div class="scenario-extreme-actions"><button data-action="best" ${!n?'disabled':''}>Best Case · highest RPI</button><button data-action="worst" ${!n?'disabled':''}>Worst Case · lowest RPI</button></div><label class="scenario-lock"><input type="checkbox" id="scenarioKeepPicks" ${session.keepPicks?'checked':''}> Keep selected results fixed</label><div class="scenario-muted">Unchecked: replaces selected results where they affect this team. Checked: finds the best/worst RPI allowed by existing selections, including previous presets.</div></div>`;
    if(session.optimizerError)body+=`<p class="scenario-warning" role="alert">${escape(session.optimizerError)}</p>`;
    if(session.optimization){
      const o=session.optimization;
      body+=`<p class="scenario-optimization" role="status"><strong>${o.mode==='best'?'Best':'Worst'} case for ${escape(o.teamName)}: ${fmt(o.rpi)} RPI</strong><br>${o.mode==='best'?'Maximum':'Minimum'} for the loaded schedule and date range, assuming all projected games finish as wins/losses${o.locked?' and keeping '+o.locked+' selected results fixed':''}. ${o.influential} distinct remaining games affect this team’s RPI. Shared matchups are optimized once across all WP, OWP, and OOWP connections; unrelated games retain their existing forecast.</p>`;
    }
    if(session.applied || step===2)body+='<p><button class="scenario-primary" data-action="view">View in main standings →</button></p>';
    if(!n){body+='<p class="scenario-warning">This team has no matching current football identity. Choose another team.</p>';}
    else if(step===0){
      body+=`<h3>${escape(current.name)} · remaining games</h3><p>Choose wins or losses for your team. Unselected games use the higher baseline RPI; equal ratings favor the home team.</p>${own.length?own.map(gameCard).join(''):'<p class="scenario-muted">No eligible games remain in this date range. Opponents’ results can still change your RPI.</p>'}<button class="scenario-primary" data-step="1">Next · opponents’ results →</button>`;
    }else if(step===1){
      body+=`<h3>All opponents, including teams already played</h3><p>Choose any results you want to control. The rest of the graph is projected automatically, including games that affect OOWP.</p><label>Opponent<select id="scenarioOpponent">${opponents.map(o=>`<option value="${o.id}" ${String(o.id)===opponent?'selected':''}>${escape(o.name)}</option>`).join('')}</select></label>${oppGames.length?oppGames.map(gameCard).join(''):'<p class="scenario-muted">This opponent has no eligible remaining games in the date range.</p>'}<button class="scenario-primary" data-action="run">Run projection →</button>`;
    }else{
      session.result=engine.simulate(session.nodes,session.games,pending,session.picks);
      const baseline=engine.standings(session.result.base,session.teams,context.middleSide);
      const projected=engine.standings(session.result.calculated,session.teams,context.middleSide);
      session.applied=true;publish(projected,baseline);
      const before=new Map(baseline.map(t=>[String(t.team_id),t]));
      const focus=projected.find(t=>String(t.team_id)===selected),old=before.get(selected);
      const drift=baseline.filter(t=>t.rpi!=null && t._publishedRpi!=null && Math.abs(t.rpi-t._publishedRpi)>.00001).length;
      const qualified=focus?.region_rank!=null;
      body+=`<div class="scenario-summary"><strong>${escape(focus?.name)}: ${escape(old?.record)} → ${escape(focus?.record)}</strong><br>RPI ${fmt(old?.rpi)} → <strong>${fmt(focus?.rpi)}</strong> · ${focus?.rpi!=null && old?.rpi!=null?delta(focus.rpi-old.rpi):'—'}<br>${escape(old?.region || 'Unassigned')} #${old?.region_rank || '—'} → ${escape(focus?.region || 'Unassigned')} #${focus?.region_rank || '—'}<br><strong>${focus?.playoff_opted_out?'Opted out of playoffs':!qualified?'Outside projected field, or region cannot be assigned':focus.projected_bye?'Projected first-round bye':'Projected first-round game'}</strong></div><p class="scenario-muted">${pending.length} distinct games projected · ${activePicks} selected results · ${pending.length-activePicks} automatic. Baseline calculated from the same saved graph; ${escape(session.captured_at)}.</p><p class="scenario-warning">A scenario, not a clinch or probability. Qualification uses the current 48-team fields (24 for 8A), longitude split, and playoff opt-outs. Unresolved ties, eligibility rulings, bracket changes, or missing schedules can change the outcome.</p>`;
      if(drift)body+=`<p class="scenario-warning">${drift} baseline RPIs differ from the dashboard by more than 0.00001. Changes below compare this graph’s baseline with its projection, rather than mixing calculation times.</p>`;
      body+=breakdown(target,pending);
    }
    if(session.applied && step!==2){
      session.result=engine.simulate(session.nodes,session.games,pending,session.picks);
      publish(engine.standings(session.result.calculated,session.teams,context.middleSide),engine.standings(session.result.base,session.teams,context.middleSide));
    }
    body+=`<p class="scenario-muted">Games from ${session.start} through ${escape(session.end)}. Earlier unfinished games (${stale}), postponed/cancelled contests, and pseudo or international opponents are not projected. Automatic winners use frozen baseline RPI, then WP if unavailable, with home team as the final fallback. Scores are not predictions.</p>`;
    const top=dialog.scrollTop;dialog.innerHTML=heading()+`<div class="scenario-body">${body}</div>`;
    dialog.querySelectorAll('details[data-breakdown-key]').forEach(el=>{if(expanded.has(el.dataset.breakdownKey))el.open=true;});
    dialog.scrollTop=top;
  }
  function breakdown(target,pending){
    const before=new Map(session.result.base.map(n=>[String(n.id),n]));
    const after=new Map(session.result.calculated.map(n=>[String(n.id),n]));
    const projected=new Map(session.result.projected.map(g=>[g.contest_id,g]));
    const counted=session.games.filter(g=>projected.has(g.contest_id) || engine.outcome(g)!=null);
    const valid=id=>{const n=session.nodeMap.get(id);return n && !n.is_pseudo && !n.is_international;};
    const links=new Map(),seen=new Set();
    for(const g of counted){
      const h=String(g.home_node_id),a=String(g.away_node_id);
      if(seen.has(g.contest_id)||!valid(h)||!valid(a))continue;
      seen.add(g.contest_id);
      if(!links.has(h))links.set(h,new Set());if(!links.has(a))links.set(a,new Set());
      links.get(h).add(a);links.get(a).add(h);
    }
    const sorted=ids=>[...ids].sort((a,b)=>name(a).localeCompare(name(b)));
    function excluding(id,excluded,future){
      let wins=0,losses=0,ties=0;const visited=new Set();
      for(const saved of session.games){
        const g=future?(projected.get(saved.contest_id)||saved):saved;
        const h=String(g.home_node_id),a=String(g.away_node_id),hr=engine.outcome(g);
        if(visited.has(g.contest_id)||hr==null||!valid(h)||!valid(a)||h===excluded||a===excluded)continue;
        visited.add(g.contest_id);
        if(h!==id && a!==id)continue;
        const result=h===id?hr:1-hr;
        if(result===1)wins++;else if(result===0)losses++;else ties++;
      }
      const total=wins+losses+ties;
      return {record:`${wins}-${losses}${ties?'-'+ties:''}`,wp:total?(wins+.5*ties)/total:null};
    }
    function card(id,key,excluded=null,open=false){
      const old=before.get(id),next=after.get(id),n=session.nodeMap.get(id);
      const games=pending.filter(g=>String(g.home_node_id)===id || String(g.away_node_id)===id);
      const stats=['wp','owp','oowp','rpi'].map(stat=>{
        const difference=next?.[stat]!=null && old?.[stat]!=null?next[stat]-old[stat]:0;
        return `<div><span>${stat.toUpperCase()}</span><strong class="${difference>1e-10?'scenario-stat-up':difference< -1e-10?'scenario-stat-down':''}">${fmt(old?.[stat])} → ${fmt(next?.[stat])}</strong></div>`;
      }).join('');
      let contribution='';
      if(excluded){const a=excluding(id,excluded,false),b=excluding(id,excluded,true);
        contribution=`<p class="scenario-muted">WP used in ${escape(name(excluded))}’s OWP (games against that team excluded): <strong>${escape(a.record)} · ${fmt(a.wp)} → ${escape(b.record)} · ${fmt(b.wp)}</strong></p>`;
      }
      const results=games.map(g=>{
        const result=projected.get(g.contest_id),isHome=String(g.home_node_id)===id,won=(isHome?result.home_outcome:result.away_outcome)===1;
        const other=String(isHome?g.away_node_id:g.home_node_id);
        const preset=session.optimization && !session.keepPicks && Math.abs(session.optimization.coefficients.get(g.contest_id)||0)>1e-14;
        const source=session.picks[g.contest_id]?(preset?`${session.optimization.mode==='best'?'Best':'Worst'} case preset`:'Selected result'):'Automatic · baseline RPI';
        return `<li data-breakdown-contest="${escape(g.contest_id)}"><b class="${won?'scenario-stat-up':'scenario-stat-down'}">${won?'W':'L'}</b><div><strong>${escape(isHome?'vs':'at')} ${escape(name(other))}</strong><small>${escape(g.game_day)} · Winner: ${escape(name(won?id:other))} · ${source}</small></div></li>`;
      }).join('');
      return `<details class="scenario-team-breakdown" data-breakdown-node="${escape(id)}" data-breakdown-key="${escape(key)}" ${open?'open':''}><summary><strong>${escape(name(id))}</strong><span>${escape(old?.record || '—')} → ${escape(next?.record || '—')} · ${games.length} simulated game${games.length===1?'':'s'}</span></summary><div class="scenario-breakdown-content"><div class="scenario-component-grid">${stats}</div>${contribution}${results?`<ul class="scenario-result-list">${results}</ul>`:'<p class="scenario-muted">No remaining game simulated for this team. Its RPI can still change through other teams’ results.</p>'}${n?.team_id && session.teams.some(t=>String(t.team_id)===String(n.team_id))?`<button class="scenario-team" data-team="${escape(n.team_id)}">Continue scenario for ${escape(name(id))} →</button>`:''}</div></details>`;
    }
    const direct=sorted(links.get(target)||[]),connected=new Set([target,...direct]);
    let body=`<h3>Simulation breakdown</h3><p class="scenario-muted">Before → projected. Expand each opponent to see its results and record used in your OWP. Expand its opponents to trace OOWP. Shared games may appear under both teams here, but count once in the simulation.</p>${card(target,'selected:'+target,null,true)}<h3>Your opponents · OWP</h3>`;
    for(const id of direct){
      const second=sorted(links.get(id)||[]);second.forEach(s=>connected.add(s));
      body+=`<section class="scenario-opponent-group">${card(id,'direct:'+id,target)}<details class="scenario-second-degree" data-breakdown-key="second:${id}"><summary>${escape(name(id))}’s opponents · OOWP (${second.length})</summary>${second.map(s=>card(s,`second:${id}:${s}`,id)).join('')}</details></section>`;
    }
    const other=sorted(new Set(pending.flatMap(g=>[String(g.home_node_id),String(g.away_node_id)]).filter(id=>!connected.has(id))));
    if(other.length){
      const otherId=other.includes(session.breakdownOther)?session.breakdownOther:other[0];
      body+=`<details data-breakdown-key="other"><summary>Other simulated teams (${other.length})</summary><label>Inspect a team<select id="scenarioBreakdownOther">${other.map(id=>`<option value="${escape(id)}" ${id===otherId?'selected':''}>${escape(name(id))}</option>`).join('')}</select></label>${card(otherId,'other:'+otherId,null,true)}</details>`;
    }
    return body+`<details data-breakdown-key="all-games"><summary>Edit all ${pending.length} simulated matchups</summary><p class="scenario-muted">Each matchup appears once in this editor. Changes update every team breakdown and the main standings.</p>${pending.map(gameCard).join('')}</details>`;
  }
  async function open(ctx,row){
    makeDialog();context=ctx;selected=String(row.team_id);step=0;opponent='';const token=++loadToken;
    if(!dialog.open)dialog.showModal();
    session=sessions.get(ctx.season);
    if(session){render();return;}
    dialog.innerHTML=`<header><h2 id="scenarioTitle">RPI Scenarios</h2><button data-action="close" aria-label="Close RPI scenarios">×</button></header><div class="scenario-body"><p role="status">Loading the current football graph…</p></div>`;
    try{
      const {data,error}=await ctx.client.rpc('football_scenario_graph',{p_season:ctx.season});
      if(error)throw error;
      if(!data?.nodes?.length || !data?.games?.length)throw new Error('No current football graph is available.');
      if(token!==loadToken)return;
      const start=date(new Date()),endDate=new Date(start+'T12:00:00Z');endDate.setUTCDate(endDate.getUTCDate()+(5-endDate.getUTCDay()+7)%7);
      session={...data,start,end:date(endDate),picks:{},teams:ctx.teams.map(t=>({...t,_publishedRpi:t.rpi})),nodeMap:new Map(data.nodes.map(n=>[String(n.id),n])),strength:new Map(engine.calculate(data.nodes,data.games).map(n=>[String(n.id),n]))};
      session.captured_at=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.captured_at))+' Eastern';
      sessions.set(ctx.season,session);render();
    }catch(error){dialog.innerHTML=`<header><h2 id="scenarioTitle">RPI Scenarios</h2><button data-action="close" aria-label="Close RPI scenarios">×</button></header><div class="scenario-body"><p class="scenario-warning">Could not load projections: ${escape(error.message || error)}</p><p>Close and reopen to retry. No live results were changed.</p></div>`;}
  }
  function reset(season){
    sessions.delete(season);
    if(context?.season===season){loadToken++;session=null;if(dialog?.open)dialog.close();if(dialog)dialog.innerHTML='';}
    root.dispatchEvent(new CustomEvent('rpi-scenario-reset',{detail:{season}}));
  }
  root.RpiScenarioUI={open,reset};
})(globalThis);
