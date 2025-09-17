const BACKEND_URL = "https://REPLACE-ME-BACKEND-URL";
(function(){
  const $=s=>document.querySelector(s); const board=$('#board'); const meta=$('#meta'); const lb=$('#lb');
  let game='ttt', socket=null, symbol='S', roomId=null;
  $('#gameSel').addEventListener('change', e=>{ game=e.target.value; build(); });
  function build(){
    board.innerHTML='';
    if(game==='ttt'){ board.style.gridTemplateColumns='repeat(3,80px)'; for(let i=0;i<9;i++){ const d=document.createElement('button'); d.textContent=''; d.dataset.i=i; d.style.height=d.style.width='80px'; board.appendChild(d); } }
    else if(game==='c4'){ board.style.gridTemplateColumns='repeat(7,40px)'; for(let r=0;r<6;r++)for(let c=0;c<7;c++){ const d=document.createElement('button'); d.dataset.r=r; d.dataset.c=c; d.style.height=d.style.width='40px'; board.appendChild(d);} }
    else if(game==='checkers'){ board.style.gridTemplateColumns='repeat(8,50px)'; for(let r=0;r<8;r++) for(let c=0;c<8;c++){ const d=document.createElement('button'); d.dataset.r=r; d.dataset.c=c; d.style.height=d.style.width='50px'; board.appendChild(d);} }
    else { board.style.gridTemplateColumns='repeat(20,24px)'; for(let r=0;r<10;r++) for(let c=0;c<10;c++){ const d=document.createElement('button'); d.dataset.board='own'; d.dataset.r=r; d.dataset.c=c; d.style.height=d.style.width='24px'; board.appendChild(d);} for(let r=0;r<10;r++) for(let c=0;c<10;c++){ const d=document.createElement('button'); d.dataset.board='target'; d.dataset.r=r; d.dataset.c=c; d.style.height=d.style.width='24px'; board.appendChild(d);} }
  }
  build();

  $('#joinBtn').addEventListener('click', ()=>{
    const nickname=$('#nickname').value.trim(); roomId=$('#roomId').value.trim(); if(!nickname||!roomId) return;
    if(!socket){ socket=io(BACKEND_URL,{transports:['websocket','polling']}); socket.on('joined',({symbol:s,roomId:r,game:g})=>{ symbol=s; meta.textContent=`Joined ${g} room ${r} as ${s}`; fetchLB(); }); socket.on('room_update',d=>{ /*no-op*/ }); socket.on('game_state', st=>render(st)); socket.on('game_over',({winner})=>{ meta.textContent += ` | Winner: ${winner}`; fetchLB(); }); socket.on('leaderboard_update',rows=>renderLB(rows)); }
    socket.emit('join_room',{ game, roomId, nickname });
  });

  board.addEventListener('click', (e)=>{
    const el=e.target; if(el.tagName!=='BUTTON'||!roomId||symbol==='S') return;
    if(game==='ttt'){ const i=Number(el.dataset.i); socket.emit('make_move',{game,roomId,index:i}); }
    else if(game==='c4'){ const c=Number(el.dataset.c); socket.emit('make_move',{game,roomId,col:c}); }
    else if(game==='checkers'){ el.classList.toggle('sel'); const sel=board.querySelectorAll('button.sel'); if(sel.length===2){ const [a,b]=sel; a.classList.remove('sel'); b.classList.remove('sel'); socket.emit('make_move',{game,roomId,from:{r:+a.dataset.r,c:+a.dataset.c},to:{r:+b.dataset.r,c:+b.dataset.c}}); } }
    else if(game==='bship'){ if(el.dataset.board==='target'){ socket.emit('make_move',{game,roomId,r:+el.dataset.r,c:+el.dataset.c}); } }
  });

  $('#resetBtn').addEventListener('click', ()=>{ if(roomId) socket.emit('reset_game',{game,roomId}); });

  function render(st){
    if(st.game==='ttt'){ const btns=board.querySelectorAll('button'); for(let i=0;i<9;i++){ btns[i].textContent=st.board[i]??''; } }
    else if(st.game==='c4'){ board.querySelectorAll('button').forEach(b=>{ const r=+b.dataset.r,c=+b.dataset.c; b.textContent = st.board[r][c]??''; }); }
    else if(st.game==='checkers'){ board.querySelectorAll('button').forEach(b=>{ const r=+b.dataset.r,c=+b.dataset.c; b.textContent = st.board[r][c]??''; }); }
    else if(st.game==='bship'){ board.querySelectorAll('button').forEach(b=>{ const r=+b.dataset.r,c=+b.dataset.c, side=b.dataset.board; if(side==='own'){ const ships = (symbol==='A'? st.shipsA : st.shipsB); const hits = (symbol==='A'? st.hitsA : st.hitsB); b.textContent = ships && ships[r][c] ? '■' : ''; if(hits && hits[r][c]) b.textContent='X'; } else { const shots = (symbol==='A'? st.shotsA : st.shotsB); const oppHits = (symbol==='A'? st.hitsB : st.hitsA); if(shots && shots[r][c]) b.textContent = (oppHits && oppHits[r][c]) ? 'X' : '•'; else b.textContent=''; } }); }
    meta.textContent = `Turn: ${st.turn??'—'}`;
  }

  async function fetchLB(){ try{ const r=await fetch('/api/leaderboard'); renderLB(await r.json()); }catch(e){} }
  function renderLB(rows){ lb.innerHTML=''; (rows||[]).forEach(r=>{ const li=document.createElement('li'); li.textContent=`${r.nickname} — ${r.wins}`; lb.appendChild(li);}); }
  fetchLB();
})();
