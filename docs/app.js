(function(){
  const BACKEND_URL = "https://mini-multiplayer-game-hub.onrender.com";
  const ioOpts = { transports:['websocket','polling'] };

  const $ = (s)=>document.querySelector(s);
  const boardEl = $('#board'), roomLabel=$('#roomLabel'), playersLabel=$('#playersLabel'),
        turnLabel=$('#turnLabel'), youLabel=$('#youLabel'), statusEl=$('#status'),
        resultEl=$('#result'), lbTable=$('#lbTable tbody'), gameLabel=$('#gameLabel');

  let currentGame='ttt', socket=null, symbol=null, roomId=null;

  document.querySelectorAll('.tab').forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    currentGame=a.dataset.game;
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    gameLabel.textContent=labelOf(currentGame);
    buildBoard();
    clearUI();
  }));

  function labelOf(g){ return g==='ttt'?'Tic-Tac-Toe': g==='c4'?'Connect Four': g==='checkers'?'Checkers': 'Battleship'; }
  function clearUI(){ roomLabel.textContent='—'; playersLabel.textContent='Waiting…'; turnLabel.textContent='—'; youLabel.textContent='—'; resultEl.textContent=''; resultEl.className='result-banner'; }

  function buildBoard(){
    boardEl.innerHTML='';
    boardEl.className='';
    if(currentGame==='ttt'){
      for(let i=0;i<9;i++){ const c=document.createElement('div'); c.className='cell'; c.dataset.index=i; boardEl.appendChild(c); }
      boardEl.className='board board-ttt';
    } else if(currentGame==='c4'){
      for(let r=0;r<6;r++) for(let c=0;c<7;c++){ const cell=document.createElement('div'); cell.className='cell c4'; cell.dataset.r=r; cell.dataset.c=c; boardEl.appendChild(cell); }
      boardEl.className='board board-c4';
    } else if(currentGame==='checkers'){
      for(let r=0;r<8;r++) for(let c=0;c<8;c++){ const tile=document.createElement('div'); tile.className='ck '+(((r+c)%2)?'dark':'light'); tile.dataset.r=r; tile.dataset.c=c; boardEl.appendChild(tile); }
      boardEl.className='board board-ck';
    } else if(currentGame==='bship'){
      boardEl.className = 'bship-wrap';
      // Build two labeled grids: Your Fleet (left) and Target Grid (right)
      boardEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gridTemplateColumns = '1fr 1fr';
      wrap.style.gap = '18px';

      const ownBox = document.createElement('div');
      const tgtBox = document.createElement('div');
      ownBox.innerHTML = `<div class="muted" style="margin-bottom:6px">Your Fleet</div>`;
      tgtBox.innerHTML = `<div class="muted" style="margin-bottom:6px">Target Grid</div>`;

      const own = document.createElement('div');
      own.className = 'board board-bs';
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const d = document.createElement('div');
        d.className = 'bs-cell own';
        d.dataset.board = 'own'; d.dataset.r = r; d.dataset.c = c;
        own.appendChild(d);
      }

      const tgt = document.createElement('div');
      tgt.className = 'board board-bs';
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const d = document.createElement('div');
        d.className = 'bs-cell target';
        d.dataset.board = 'target'; d.dataset.r = r; d.dataset.c = c;
        tgt.appendChild(d);
      }

      ownBox.appendChild(own);
      tgtBox.appendChild(tgt);
      wrap.appendChild(ownBox);
      wrap.appendChild(tgtBox);
      boardEl.appendChild(wrap);
      // no boardEl.className here; the inner boards already have classes
    }
  }
  buildBoard();

  function connectIfNeeded(){
    if(!socket){
      socket=io(BACKEND_URL, ioOpts);
      socket.on('joined', ({symbol:s,roomId:r,game})=>{ symbol=s; youLabel.textContent = s==='S'?'Spectator':s; roomLabel.textContent=r; statusEl.textContent = s==='S'?'Room full, spectator.':`Joined as ${s}`; fetchLB(); });
      socket.on('room_update', ({game,players,state,turn})=>{
        const keys = game==='ttt'?['X','O'] : game==='c4'?['R','Y'] : game==='checkers'?['r','b'] : ['A','B'];
        playersLabel.textContent = `${keys[0]}: ${players[keys[0]]??'—'} | ${keys[1]}: ${players[keys[1]]??'—'}`;
        turnLabel.textContent = turn??'—';
        resultEl.textContent = (state==='waiting')?'Waiting for an opponent…':'';
        resultEl.className='result-banner';
      });
      socket.on('game_state', (state)=> renderState(state));
      socket.on('game_over', ({game,winner})=>{ resultEl.textContent = winner==='draw'?'It’s a draw!':`Winner: ${winner}`; resultEl.className = 'result-banner '+(winner==='draw'?'draw':'win'); fetchLB(); });
      socket.on('leaderboard_update', rows=> renderLB(rows));
    }
  }

  $('#joinBtn').addEventListener('click', ()=>{
    const nickname=$('#nickname').value.trim(); roomId=$('#roomId').value.trim();
    if(!nickname||!roomId){ statusEl.textContent='Please enter a nickname and room ID.'; return; }
    connectIfNeeded(); socket.emit('join_room', { game: currentGame, roomId, nickname }); statusEl.textContent='Connecting…';
  });

  // interactions
  let ckSel=null;
  boardEl.addEventListener('click', (e)=>{
    const el=e.target;
    if(!roomId || symbol==='S') return;
    if(currentGame==='ttt'){
      const idx=Number(el.dataset.index); if(Number.isFinite(idx)) socket.emit('make_move',{game:currentGame,roomId,index:idx});
    } else if(currentGame==='c4'){
      const c=Number(el.dataset.c); if(Number.isFinite(c)) socket.emit('make_move',{game:currentGame,roomId,col:c});
    } else if(currentGame==='checkers'){
      if(!el.classList.contains('ck')) return;
      if(!ckSel){ ckSel = {r:+el.dataset.r,c:+el.dataset.c}; el.classList.add('sel'); }
      else{
        const dest = {r:+el.dataset.r, c:+el.dataset.c};
        const fromEl = boardEl.querySelector(`.ck[data-r="${ckSel.r}"][data-c="${ckSel.c}"]`);
        if(fromEl) fromEl.classList.remove('sel');
        socket.emit('make_move',{game:'checkers', roomId, from:ckSel, to:dest});
        ckSel=null;
      }
    } else if(currentGame==='bship'){
      if(el.classList.contains('bs-cell') && el.dataset.board==='target'){
        const r=Number(el.dataset.r), c=Number(el.dataset.c);
        socket.emit('make_move', { game: currentGame, roomId, r, c });
      }
    }
  });

  $('#resetBtn').addEventListener('click', ()=>{ if(!roomId) return; socket.emit('reset_game', { game: currentGame, roomId }); });

  function renderState(state){
    if(state.game==='ttt'){
      const cells=boardEl.querySelectorAll('.cell');
      for(let i=0;i<9;i++){ const v=state.board[i]??''; const el=cells[i]; el.textContent=v; el.classList.toggle('filledX',v==='X'); el.classList.toggle('filledO',v==='O'); }
      turnLabel.textContent = state.turn??'—';
    } else if(state.game==='c4'){
      boardEl.querySelectorAll('.cell.c4').forEach(el=>{ const r=Number(el.dataset.r), c=Number(el.dataset.c); const v=state.board[r][c]; el.textContent=''; el.classList.toggle('red',v==='R'); el.classList.toggle('yellow',v==='Y'); });
      turnLabel.textContent = state.turn??'—';
    } else if(state.game==='checkers'){
      boardEl.querySelectorAll('.ck').forEach(el=>{ el.innerHTML=''; });
      for(let r=0;r<8;r++) for(let c=0;c<8;c++){
        const v=state.board[r][c]; if(!v) continue;
        const tile = boardEl.querySelector(`.ck[data-r="${r}"][data-c="${c}"]`);
        if(!tile) continue;
        const d=document.createElement('div'); d.className='man '+(v.toLowerCase())+(v===v.toUpperCase()?' king':'');
        tile.appendChild(d);
      }
      turnLabel.textContent = state.turn??'—';
    } else if(state.game==='bship'){
      const you = symbol==='A'?'A': symbol==='B'?'B': null;
      const ownGrid = boardEl.querySelectorAll('.bs-cell.own');
      ownGrid.forEach(el=>{
        const r=Number(el.dataset.r), c=Number(el.dataset.c);
        const ship = (you==='A'? state.shipsA : you==='B'? state.shipsB : null);
        if(ship && ship[r][c]!==0) el.classList.add('ship'); else el.classList.remove('ship');
        const hit = (you==='A'? state.hitsA : state.hitsB);
        if(hit && hit[r][c]===1) el.classList.add('shot','hit'); else el.classList.remove('shot','hit');
      });
      const targetGrid = boardEl.querySelectorAll('.bs-cell.target');
      targetGrid.forEach(el=>{
        const r=Number(el.dataset.r), c=Number(el.dataset.c);
        const shots = (you==='A'? state.shotsA : state.shotsB);
        const oppHits = (you==='A'? state.hitsB : state.hitsA);
        if(shots && shots[r][c]===1){
          el.classList.add('shot');
          if(oppHits && oppHits[r][c]===1) el.classList.add('hit'); else el.classList.add('miss');
        } else {
          el.classList.remove('shot','hit','miss');
        }
      });
      turnLabel.textContent = state.turn??'—';
    }
  }

  async function fetchLB(){ try{ const r=await fetch(BACKEND_URL+'/api/leaderboard'); renderLB(await r.json()); }catch(e){} }
  function renderLB(rows){ lbTable.innerHTML=''; (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.nickname}</td><td>${r.wins}</td>`; lbTable.appendChild(tr); }); }
  fetchLB();
})();
