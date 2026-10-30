/* Read-only football projections. No network writes or changes to input objects. */
(function (root) {
  'use strict';
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  function outcome(game) {
    if (!game.has_result) return null;
    if (!game.manual_override_at && [0, .5, 1].includes(number(game.home_outcome))) return number(game.home_outcome);
    const h = number(game.home_score), a = number(game.away_score);
    return h == null || a == null ? null : h > a ? 1 : h < a ? 0 : .5;
  }
  function calculate(nodes, games) {
    const byId = new Map(nodes.map(n => [String(n.id), n]));
    const totals = new Map(), pairs = new Map(), sides = [], seen = new Set();
    const eligible = n => n && !n.is_pseudo && !n.is_international;
    function add(team, opponent, result) {
      const t = totals.get(team) || {games:0, points:0, wins:0, losses:0, ties:0};
      t.games++; t.points += result; t[result === 1 ? 'wins' : result === 0 ? 'losses' : 'ties']++;
      totals.set(team, t);
      const key = `${team}:${opponent}`, p = pairs.get(key) || {games:0, points:0};
      p.games++; p.points += result; pairs.set(key,p); sides.push({team,opponent});
    }
    for (const g of games) {
      if (g.active === false || seen.has(g.contest_id)) continue;
      seen.add(g.contest_id);
      const h = String(g.home_node_id), a = String(g.away_node_id), result = outcome(g);
      if (result == null || !eligible(byId.get(h)) || !eligible(byId.get(a))) continue;
      add(h,a,result); add(a,h,1-result);
    }
    const owps = new Map(), oowps = new Map();
    function average(map,key,value) {
      if (value == null) return;
      const values = map.get(key) || []; values.push(value); map.set(key,values);
    }
    const mean = values => values?.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
    for (const s of sides) {
      const t = totals.get(s.opponent), p = pairs.get(`${s.opponent}:${s.team}`);
      if (t.games > p.games) average(owps,s.team,(t.points-p.points)/(t.games-p.games));
    }
    for (const s of sides) {
      const n = byId.get(s.opponent), state = String(n.state || '').toUpperCase();
      average(oowps,s.team,n.is_nchsaa_member || ['NC','GA','SC','TN','VA'].includes(state) ? mean(owps.get(s.opponent)) : .5);
    }
    return nodes.map(n => {
      const t = totals.get(String(n.id)) || {games:0,points:0,wins:0,losses:0,ties:0};
      const wp = t.games ? t.points/t.games : null, owp = mean(owps.get(String(n.id))), oowp = mean(oowps.get(String(n.id)));
      return {...n,...t,wp,owp,oowp,rpi:wp == null || owp == null || oowp == null ? null : .4*wp+.4*owp+.2*oowp,
        record:`${t.wins}-${t.losses}${t.ties ? '-'+t.ties : ''}`};
    });
  }
  function standings(calculated, teams, middleSide = 'East') {
    const byTeam = new Map(calculated.filter(n=>n.is_primary && n.is_nchsaa_member && n.team_id != null).map(n=>[String(n.team_id),n]));
    const rows = teams.map(t => {
      const n = byTeam.get(String(t.team_id));
      return {...t,...(n ? {rpi:n.rpi,wp:n.wp,owp:n.owp,oowp:n.oowp,record:n.record,wins:n.wins,losses:n.losses,ties:n.ties} : {rpi:null}),region:null,region_rank:null,class_rank:null};
    });
    const order = (a,b) => (b.rpi-a.rpi) || String(a.name || '').localeCompare(String(b.name || '')) || Number(a.team_id)-Number(b.team_id);
    rows.filter(r=>r.rpi != null).sort(order).forEach((r,i)=>r.overall_rank=i+1);
    for (const cls of ['1A','2A','3A','4A','5A','6A','7A','8A']) {
      const ranked = rows.filter(r=>r.classification===cls && r.rpi != null).sort(order);
      ranked.forEach((r,i)=>r.class_rank=i+1);
      const cap = cls === '8A' ? 24 : 48;
      const field = ranked.filter(r=>!r.playoff_opted_out && r.active !== false).slice(0,cap);
      if (field.some(r=>number(r.longitude)==null)) continue;
      field.sort((a,b)=>Math.abs(Number(b.longitude))-Math.abs(Number(a.longitude)) || String(a.name).localeCompare(String(b.name)));
      const westCount = middleSide === 'West' ? Math.ceil(field.length/2) : Math.floor(field.length/2);
      field.forEach((r,i)=>r.region=i<westCount?'West':'East');
      for (const region of ['East','West']) field.filter(r=>r.region===region).sort(order).forEach((r,i)=>{
        r.region_rank=i+1;
        // Each region fills half of a 64-team bracket (32 for 8A).
        r.projected_bye = r.region_rank <= (cls === '8A' ? 16 : 32)-field.filter(x=>x.region===region).length;
      });
    }
    return rows;
  }
  function remaining(games,nodes,start,end) {
    const valid = new Set(nodes.filter(n=>!n.is_pseudo && !n.is_international).map(n=>String(n.id)));
    const seen = new Set();
    return games.filter(g=>{
      if(seen.has(g.contest_id))return false;
      seen.add(g.contest_id);
      return g.active!==false && !g.has_result && g.game_day>=start && g.game_day<=end &&
        !/cancel|postpon|scrimmage|no.contest/i.test(g.status || '') && valid.has(String(g.home_node_id)) && valid.has(String(g.away_node_id));
    });
  }
  function simulate(nodes,games,pending,picks = {}) {
    const base = calculate(nodes,games), strength = new Map(base.map(n=>[String(n.id),n]));
    const projected = new Map();
    for (const g of pending) {
      const h = strength.get(String(g.home_node_id)), a = strength.get(String(g.away_node_id));
      const picked = picks[g.contest_id];
      // Freeze baseline strength: do not let processing order decide later winners.
      const hr = picked === 'home' ? 1 : picked === 'away' ? 0 :
        (h?.rpi ?? h?.wp ?? .5) >= (a?.rpi ?? a?.wp ?? .5) ? 1 : 0;
      projected.set(g.contest_id,{...g,has_result:true,manual_override_at:null,home_outcome:hr,away_outcome:1-hr,
        home_score:hr,away_score:1-hr,scenario_assumed:!picked});
    }
    return {base,calculated:calculate(nodes,games.map(g=>projected.get(g.contest_id) || g)),projected:[...projected.values()]};
  }
  function optimize(nodes,games,pending,targetId,mode='best',picks={},keepPicks=false) {
    if(!['best','worst'].includes(mode))throw new Error('Choose best or worst case.');
    const target=String(targetId),byId=new Map(nodes.map(n=>[String(n.id),n]));
    const eligible=n=>n && !n.is_pseudo && !n.is_international;
    const variable=new Map(pending.map(g=>[g.contest_id,g]));
    const adjacency=new Map(),seen=new Set();
    const coefficients=new Map([...variable.keys()].map(id=>[id,0]));
    function add(team,opponent,id,sign){
      const sides=adjacency.get(team)||[];sides.push({team,opponent,id,sign});adjacency.set(team,sides);
    }
    for(const game of games){
      if(seen.has(game.contest_id) || game.active===false)continue;
      seen.add(game.contest_id);
      const home=String(game.home_node_id),away=String(game.away_node_id);
      if(!eligible(byId.get(home)) || !eligible(byId.get(away)))continue;
      if(!variable.has(game.contest_id) && outcome(game)==null)continue;
      add(home,away,game.contest_id,1);add(away,home,game.contest_id,-1);
    }
    const sides=id=>adjacency.get(id)||[];
    // With the remaining schedule fixed, every denominator is fixed. RPI is
    // affine in each game's home-win indicator, even when both sides influence
    // the target through multiple WP/OWP/OOWP paths. Sum those paths first.
    const owpCache=new Map();
    function owpTerms(id){
      if(!owpCache.has(id))owpCache.set(id,sides(id).map(side=>({
        side,others:sides(side.opponent).filter(other=>other.opponent!==id)
      })).filter(term=>term.others.length));
      return owpCache.get(id);
    }
    function accumulate(side,weight){
      if(coefficients.has(side.id))coefficients.set(side.id,coefficients.get(side.id)+side.sign*weight);
    }
    function addOwp(id,weight){
      const terms=owpTerms(id);
      for(const {others} of terms)for(const side of others)accumulate(side,weight/terms.length/others.length);
    }
    const own=sides(target);
    if(!own.length)throw new Error('This team has no eligible games to calculate RPI.');
    for(const side of own)accumulate(side,.4/own.length);
    addOwp(target,.4);
    const oowp=own.map(side=>{
      const opponent=byId.get(side.opponent);
      const actual=opponent.is_nchsaa_member || ['NC','GA','SC','TN','VA'].includes(String(opponent.state||'').toUpperCase());
      return {side,actual};
    }).filter(term=>!term.actual || owpTerms(term.side.opponent).length);
    if(!owpTerms(target).length || !oowp.length)throw new Error('Not enough opponent data to optimize this team’s RPI.');
    for(const term of oowp)if(term.actual)addOwp(term.side.opponent,.2/oowp.length);
    const optimized={...picks};let changed=0,locked=0,influential=0;
    for(const [id,coefficient] of coefficients){
      if(Math.abs(coefficient)<1e-14)continue;
      influential++;
      if(keepPicks && ['home','away'].includes(picks[id])){locked++;continue;}
      const winner=(mode==='best'?coefficient>0:coefficient<0)?'home':'away';
      if(optimized[id]!==winner)changed++;
      optimized[id]=winner;
    }
    const result=simulate(nodes,games,pending,optimized);
    const optimizedRpi=result.calculated.find(n=>String(n.id)===target)?.rpi;
    if(optimizedRpi==null)throw new Error('This team’s projected RPI is unavailable.');
    return {picks:optimized,coefficients,mode,targetId:target,influential,locked,changed,rpi:optimizedRpi};
  }
  function tableProjection(projected,baseline) {
    const before=new Map(baseline.map(r=>[String(r.team_id),r]));
    const parts=value=>(String(value||'').match(/\d+/g)||[]).slice(0,3).map(Number);
    const direction=delta=>Math.abs(delta)<1e-10?0:Math.sign(delta);
    return projected.map(row=>{
      const old=before.get(String(row.team_id));
      if(!old)return {...row,_scenario:true};
      const current=parts(row.record),previous=parts(old.record),display=parts(old.display_record??old.record);
      const counts=[0,1,2].map(i=>(current[i]||0)+(display[i]||0)-(previous[i]||0));
      const record=counts.slice(0,counts[2]>0?3:2).join('-')+(String(old.display_record||'').includes('*') || Number(old.pseudo_game_count)>0?'*':'');
      const pct=counts=>{const total=counts.reduce((a,b)=>a+b,0);return total?(counts[0]+.5*(counts[2]||0))/total:0;};
      let recordDirection=direction(pct(counts)-pct([display[0]||0,display[1]||0,display[2]||0]));
      const winChange=(current[0]||0)-(previous[0]||0),lossChange=(current[1]||0)-(previous[1]||0);
      if(!recordDirection)recordDirection=winChange>0 && lossChange===0?1:lossChange>0 && winChange===0?-1:0;
      return {...row,display_record:record,_scenario:true,_scenarioRecordDirection:recordDirection,
        _scenarioWpDirection:row.wp!=null && old.wp!=null?direction(row.wp-old.wp):0,
        _scenarioBaselineRecord:old.display_record??old.record,_scenarioBaselineWp:old.wp};
    });
  }
  root.RpiScenarios = {calculate,standings,remaining,simulate,optimize,outcome,tableProjection};
})(globalThis);
