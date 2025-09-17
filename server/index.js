import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDB, recordWin, topWins } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/api/leaderboard', (req,res)=>{
  try { res.json(topWins(20)); } catch(e){ console.error(e); res.status(500).json({error:'lb'}); }
});

const rooms = new Map();
const keyOf = (game, roomId) => `${game}:${roomId}`;

// ---------- Tic Tac Toe ----------
function makeTTT() { return { game:'ttt', players:{}, board:Array(9).fill(null), turn:'X', state:'waiting' }; }
function winTTT(b){
  const L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b1,c] of L){ if (b[a]&&b[a]===b[b1]&&b[a]===b[c]) return b[a]; }
  return b.every(Boolean)?'draw':null;
}

// ---------- Connect Four ----------
const C4C=7,C4R=6;
const makeC4=()=>({game:'c4',players:{},board:Array.from({length:C4R},()=>Array(C4C).fill(null)),turn:'R',state:'waiting'});
function dropC4(board,col,sym){ if(col<0||col>=C4C) return false; for(let r=C4R-1;r>=0;r--){ if(!board[r][col]){ board[r][col]=sym; return true; } } return false; }
function winC4(b){
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(let r=0;r<C4R;r++) for(let c=0;c<C4C;c++){ const v=b[r][c]; if(!v) continue;
    for(const [dr,dc] of dirs){ let k=1; let rr=r+dr, cc=c+dc; while(rr>=0&&rr<C4R&&cc>=0&&cc<C4C&&b[rr][cc]===v){k++; rr+=dr; cc+=dc;} if(k>=4) return v; } }
  return b.every(row=>row.every(Boolean))?'draw':null;
}

// ---------- Checkers (simplified single-jump) ----------
const CK=8;
function makeCheckers(){
  const board=Array.from({length:CK},()=>Array(CK).fill(null));
  for(let r=0;r<3;r++) for(let c=0;c<CK;c++) if((r+c)%2===1) board[r][c]='r';
  for(let r=CK-3;r<CK;r++) for(let c=0;c<CK;c++) if((r+c)%2===1) board[r][c]='b';
  return { game:'checkers', players:{}, board, turn:'r', state:'waiting' };
}
function inb(r,c){ return r>=0&&r<CK&&c>=0&&c<CK; }
function isKing(p){ return p==='R'||p==='B'; }
function ownerOf(p){ return p && (p.toLowerCase()); }
function dirFor(p){ return (p==='r'||p==='R')?1:-1; }
function hasCapture(board, side){
  const me = new Set(side=== 'r'? ['r','R'] : ['b','B']);
  const opp = new Set(side=== 'r'? ['b','B'] : ['r','R']);
  for(let r=0;r<CK;r++) for(let c=0;c<CK;c++){
    const p=board[r][c]; if(!p||!me.has(p)) continue;
    const dirs=isKing(p)?[[1,1],[1,-1],[-1,1],[-1,-1]]: [[dirFor(p),1],[dirFor(p),-1]];
    for(const [dr,dc] of dirs){
      const r1=r+dr, c1=c+dc, r2=r+2*dr, c2=c+2*dc;
      if(inb(r2,c2) && opp.has(board[r1]?.[c1]) && !board[r2][c2]) return true;
    }
  }
  return false;
}
function moveCheckers(board, fromR, fromC, toR, toC){
  const p = board[fromR]?.[fromC]; if(!p) return { ok:false };
  const side = ownerOf(p);
  const dr = toR-fromR, dc = toC-fromC;
  if(!inb(toR,toC) || board[toR][toC]) return { ok:false };
  const mustCapture = hasCapture(board, side);
  const absR=Math.abs(dr), absC=Math.abs(dc);
  const isKingPiece=isKing(p);
  const fwd = dirFor(p);
  if(absR===1 && absC===1 && !mustCapture){
    if(isKingPiece || dr===fwd){
      board[toR][toC]=p; board[fromR][fromC]=null;
      if(side==='r' && toR===CK-1 && p==='r') board[toR][toC]='R';
      if(side==='b' && toR===0 && p==='b') board[toR][toC]='B';
      return { ok:true, captured:false };
    }
  }
  if(absR===2 && absC===2){
    const midR=fromR+dr/2, midC=fromC+dc/2;
    const midP=board[midR][midC];
    if(midP && ownerOf(midP)!==side && (isKingPiece || dr===2*fwd)){
      board[toR][toC]=p; board[fromR][fromC]=null; board[midR][midC]=null;
      if(side==='r' && toR===CK-1 && p==='r') board[toR][toC]='R';
      if(side==='b' && toR===0 && p==='b') board[toR][toC]='B';
      return { ok:true, captured:true };
    }
  }
  return { ok:false };
}
function winCheckers(board){
  let hasR=false, hasB=false, movesR=false, movesB=false;
  for(let r=0;r<CK;r++) for(let c=0;c<CK;c++){
    const p=board[r][c]; if(!p) continue;
    const side=ownerOf(p);
    if(side==='r') hasR=true; else hasB=true;
    const dirs=isKing(p)?[[1,1],[1,-1],[-1,1],[-1,-1]]: [[dirFor(p),1],[dirFor(p),-1]];
    for(const [dr,dc] of dirs){
      const r1=r+dr, c1=c+dc; const r2=r+2*dr, c2=r+2*dc;
      if(inb(r1,c1) && !board[r1][c1]) { if(side==='r') movesR=true; else movesB=true; }
      if(inb(r2,c2) && board[r1]?.[c1] && ownerOf(board[r1][c1])!==side && !board[r2][c2]) { if(side==='r') movesR=true; else movesB=true; }
    }
  }
  if(!hasR || !movesR) return 'b';
  if(!hasB || !movesB) return 'r';
  return null;
}

// ---------- Battleship ----------
const BSN=10;
const SHIPS=[5,4,3,3,2];
function makeEmpty(n){ return Array.from({length:n},()=>Array(n).fill(0)); }
function placeRandom(){
  const grid=makeEmpty(BSN);
  let id=1;
  for(const size of SHIPS){
    let ok=false;
    for(let tries=0;tries<200 && !ok;tries++){
      const horiz = Math.random()>0.5;
      const r = Math.floor(Math.random()*(horiz?BSN:BSN-size+1));
      const c = Math.floor(Math.random()*(horiz?BSN-size+1:BSN));
      ok=true;
      for(let k=0;k<size;k++){
        const rr=r+(horiz?0:k), cc=c+(horiz?k:0);
        if(grid[rr][cc]!==0){ ok=false; break; }
      }
      if(ok){
        for(let k=0;k<size;k++){ const rr=r+(horiz?0:k), cc=c+(horiz?k:0); grid[rr][cc]=id; }
        id++;
      }
    }
    if(!ok) return placeRandom();
  }
  return grid;
}
function makeBShip(){
  return { 
    game:'bship',
    players:{},
    turn:'A',
    state:'waiting',
    shipsA:placeRandom(), shipsB:placeRandom(),
    hitsA:makeEmpty(BSN), hitsB:makeEmpty(BSN),
    shotsA:makeEmpty(BSN), shotsB:makeEmpty(BSN)
  };
}
function fireAt(room, attacker, r, c){
  const defender = attacker==='A' ? 'B' : 'A';
  const shots = attacker==='A'? room.shotsA : room.shotsB;
  if(shots[r][c]!==0) return { ok:false };
  shots[r][c]=1;
  const ships = defender==='A'? room.shipsA : room.shipsB;
  const hits = defender==='A'? room.hitsA : room.hitsB;
  const target = ships[r][c];
  if(target!==0){ hits[r][c]=1; return { ok:true, hit:true, sunk: shipSunk(ships,hits,target) }; }
  return { ok:true, hit:false, sunk:false };
}
function shipSunk(ships,hits,id){
  for(let i=0;i<BSN;i++) for(let j=0;j<BSN;j++){
    if(ships[i][j]===id && hits[i][j]!==1) return false;
  }
  return true;
}
function allSunk(ships,hits){
  for(let i=0;i<BSN;i++) for(let j=0;j<BSN;j++){
    if(ships[i][j]!==0 && hits[i][j]!==1) return false;
  }
  return true;
}

// ---------- Socket Wiring ----------
io.on('connection',(socket)=>{
  socket.on('join_room', ({ game, roomId, nickname }) => {
    if(!game||!roomId||!nickname) return;
    const key=keyOf(game, roomId);
    socket.join(key);
    let room=rooms.get(key);
    if(!room){
      if(game==='ttt') room=makeTTT();
      else if(game==='c4') room=makeC4();
      else if(game==='checkers') room=makeCheckers();
      else if(game==='bship') room=makeBShip();
      else return;
      rooms.set(key, room);
    }
    let assigned='S';
    if(game==='ttt'){
      if(!room.players.X){ room.players.X={id:socket.id,nick:nickname}; assigned='X'; }
      else if(!room.players.O){ room.players.O={id:socket.id,nick:nickname}; assigned='O'; }
    } else if(game==='c4'){
      if(!room.players.R){ room.players.R={id:socket.id,nick:nickname}; assigned='R'; }
      else if(!room.players.Y){ room.players.Y={id:socket.id,nick:nickname}; assigned='Y'; }
    } else if(game==='checkers'){
      if(!room.players.r){ room.players.r={id:socket.id,nick:nickname}; assigned='r'; }
      else if(!room.players.b){ room.players.b={id:socket.id,nick:nickname}; assigned='b'; }
    } else if(game==='bship'){
      if(!room.players.A){ room.players.A={id:socket.id,nick:nickname}; assigned='A'; }
      else if(!room.players.B){ room.players.B={id:socket.id,nick:nickname}; assigned='B'; }
    }
    socket.data={ nickname, roomKey:key, symbol:assigned };

    io.to(key).emit('room_update', briefRoom(room));
    socket.emit('joined', { symbol:assigned, roomId, game });
    socket.emit('game_state', serializeState(room, assigned));

    if(readyToStart(room)){
      room.state='playing';
      io.to(key).emit('room_update', briefRoom(room));
      io.to(key).emit('game_state', serializeState(room));
    }
  });

  socket.on('make_move', (payload) => {
    const { game, roomId } = payload;
    const key=keyOf(game, roomId);
    const room=rooms.get(key); if(!room||room.state!=='playing') return;
    const sym = socket.data.symbol;

    if(game==='ttt'){
      const { index } = payload;
      if(sym!==room.turn) return;
      if(room.board[index]) return;
      room.board[index]=sym;
      const w=winTTT(room.board);
      if(w==='X'||w==='O') endWithWin(room,key,w);
      else if(w==='draw') endDraw(room,key);
      else { room.turn = room.turn==='X'?'O':'X'; io.to(key).emit('game_state', serializeState(room)); }
    }
    else if(game==='c4'){
      const { col } = payload;
      if(sym!==room.turn) return;
      if(!dropC4(room.board, col, sym)) return;
      const w=winC4(room.board);
      if(w==='R'||w==='Y') endWithWin(room,key,w);
      else if(w==='draw') endDraw(room,key);
      else { room.turn = room.turn==='R'?'Y':'R'; io.to(key).emit('game_state', serializeState(room)); }
    }
    else if(game==='checkers'){
      const { from, to } = payload;
      if(sym!==room.turn) return;
      const mv = moveCheckers(room.board, from.r, from.c, to.r, to.c);
      if(!mv.ok) return;
      const w=winCheckers(room.board);
      if(w==='r'||w==='b') endWithWin(room,key,w);
      else { room.turn = room.turn==='r'?'b':'r'; io.to(key).emit('game_state', serializeState(room)); }
    }
    else if(game==='bship'){
      const { r, c } = payload;
      const attacker = sym;
      if(attacker!==room.turn) return;
      const res = fireAt(room, attacker, r, c);
      if(!res.ok) return;
      const defender = attacker==='A'?'B':'A';
      if(allSunk(defender==='A'?room.shipsA:room.shipsB, defender==='A'?room.hitsA:room.hitsB)){
        endWithWin(room,key,attacker);
      } else {
        room.turn = defender;
        io.to(key).emit('game_state', serializeState(room));
      }
    }
  });

  socket.on('reset_game', ({ game, roomId }) => {
    const key=keyOf(game, roomId);
    const room=rooms.get(key); if(!room) return;
    if(game==='ttt') rooms.set(key, makeTTT());
    else if(game==='c4') rooms.set(key, makeC4());
    else if(game==='checkers') rooms.set(key, makeCheckers());
    else if(game==='bship') rooms.set(key, makeBShip());
    const r2=rooms.get(key); r2.players=room.players; r2.state=readyToStart(r2)?'playing':'waiting';
    io.to(key).emit('room_update', briefRoom(r2));
    io.to(key).emit('game_state', serializeState(r2));
  });

  socket.on('disconnect', ()=>{
    const { roomKey } = socket.data || {};
    if(!roomKey) return;
    const room=rooms.get(roomKey); if(!room) return;
    for(const k of Object.keys(room.players)){ if(room.players[k]?.id===socket.id) room.players[k]=null; }
    room.state='waiting';
    io.to(roomKey).emit('room_update', briefRoom(room));
  });

  function readyToStart(room){
    if(room.game==='ttt') return room.players.X && room.players.O;
    if(room.game==='c4') return room.players.R && room.players.Y;
    if(room.game==='checkers') return room.players.r && room.players.b;
    if(room.game==='bship') return room.players.A && room.players.B;
    return false;
  }
  function briefRoom(room){
    const players = Object.fromEntries(Object.entries(room.players).map(([k,v])=>[k, v? v.nick: null]));
    return { game:room.game, players, state:room.state, turn:room.turn };
  }
  function endWithWin(room, key, winnerSym){
    room.state='finished';
    io.to(key).emit('game_state', serializeState(room));
    io.to(key).emit('game_over', { game:room.game, winner:winnerSym });
    const nick = room.players[winnerSym]?.nick;
    if(nick){ recordWin(nick); io.to(key).emit('leaderboard_update', topWins(10)); }
  }
  function endDraw(room, key){
    room.state='finished';
    io.to(key).emit('game_state', serializeState(room));
    io.to(key).emit('game_over', { game:room.game, winner:'draw' });
  }
  function serializeState(room, perspective){
    if(room.game==='bship'){
      return {
        game:'bship',
        turn: room.turn,
        you: perspective || null,
        shipsA: perspective==='A' ? room.shipsA : null,
        shipsB: perspective==='B' ? room.shipsB : null,
        hitsA: room.hitsA, hitsB: room.hitsB,
        shotsA: room.shotsA, shotsB: room.shotsB
      };
    }
    return { game:room.game, board:room.board, turn:room.turn };
  }
});

const PORT = process.env.PORT || 3000;
initDB();
server.listen(PORT, ()=> console.log(`Server on http://localhost:${PORT}`));