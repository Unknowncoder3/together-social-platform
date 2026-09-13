import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
const PORT=process.env.PORT||5001;
const SECRET=process.env.JWT_SECRET||'together-dev-secret';
const dir=path.resolve('data');
const file=path.join(dir,'db.json');
fs.mkdirSync(dir,{recursive:true});
let db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{users:[],friends:[],rooms:[],messages:[],questions:[]};
db.users||=[];db.friends||=[];db.rooms||=[];db.messages||=[];db.questions||=[];
const save=()=>fs.writeFileSync(file,JSON.stringify(db,null,2));
const id=()=>crypto.randomUUID();
const roomCode=()=>crypto.randomBytes(5).toString('hex').toUpperCase();
const uniqueRoomCode=()=>{let code;do code=roomCode();while(db.rooms.some(r=>r.code===code));return code};
let changed=false;for(const room of db.rooms)if(!room.code){room.code=uniqueRoomCode();changed=true}if(changed)save();
const pub=u=>({id:u.id,name:u.name,email:u.email,bio:u.bio||''});
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').replace('Bearer ','').trim(),SECRET);next()}catch{res.status(401).json({message:'Authentication required'})}};
app.use(express.json());
app.get('/api/health',(_,res)=>res.json({ok:true}));
app.post('/api/auth/register',async(req,res)=>{const{name,email,password}=req.body;if(!name||!email||!password||password.length<6)return res.status(400).json({message:'Name, email and a 6+ character password are required.'});const normalizedEmail=email.toLowerCase().trim();if(db.users.some(u=>u.email===normalizedEmail))return res.status(409).json({message:'Email already registered.'});const u={id:id(),name:name.trim(),email:normalizedEmail,password:await bcrypt.hash(password,10),bio:''};db.users.push(u);save();res.status(201).json({token:jwt.sign({id:u.id},SECRET,{expiresIn:'7d'}),user:pub(u)})});
app.post('/api/auth/login',async(req,res)=>{const u=db.users.find(x=>x.email===String(req.body.email||'').toLowerCase().trim());if(!u||!(await bcrypt.compare(req.body.password||'',u.password)))return res.status(401).json({message:'Invalid email or password.'});res.json({token:jwt.sign({id:u.id},SECRET,{expiresIn:'7d'}),user:pub(u)})});
app.get('/api/me',auth,(req,res)=>{const u=db.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({message:'User not found.'});res.json({user:pub(u)})});
app.patch('/api/me',auth,(req,res)=>{const u=db.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({message:'User not found.'});u.name=String(req.body.name||u.name).trim();u.bio=String(req.body.bio??u.bio);save();res.json({user:pub(u)})});
app.get('/api/users/search',auth,(req,res)=>{const q=String(req.query.q||'').toLowerCase();res.json(db.users.filter(u=>u.id!==req.user.id&&(u.name.toLowerCase().includes(q)||u.email.includes(q))).slice(0,20).map(pub))});
app.get('/api/friends',auth,(req,res)=>{const mine=db.friends.filter(f=>f.status==='accepted'&&(f.from===req.user.id||f.to===req.user.id));const requests=db.friends.filter(f=>f.status==='pending'&&f.to===req.user.id);const other=f=>pub(db.users.find(u=>u.id===(f.from===req.user.id?f.to:f.from)));res.json({friends:mine.map(other),requests:requests.map(f=>({id:f.id,user:pub(db.users.find(u=>u.id===f.from))}))})});
app.post('/api/friends/request/:userId',auth,(req,res)=>{const other=req.params.userId;if(!db.users.some(u=>u.id===other)||other===req.user.id)return res.status(400).json({message:'Invalid user.'});if(db.friends.some(f=>(f.from===req.user.id&&f.to===other)||(f.from===other&&f.to===req.user.id)))return res.status(409).json({message:'Friend request already exists.'});db.friends.push({id:id(),from:req.user.id,to:other,status:'pending'});save();res.status(201).json({message:'Friend request sent.'})});
app.post('/api/friends/:requestId/accept',auth,(req,res)=>{const f=db.friends.find(x=>x.id===req.params.requestId&&x.to===req.user.id);if(!f)return res.status(404).json({message:'Request not found.'});f.status='accepted';save();res.json({message:'Accepted.'})});
app.get('/api/rooms',auth,(req,res)=>res.json({rooms:db.rooms.filter(r=>r.members.includes(req.user.id))}));
app.post('/api/rooms',auth,(req,res)=>{const r={id:id(),code:uniqueRoomCode(),name:String(req.body.name||'Together Room').trim(),owner:req.user.id,members:[req.user.id],createdAt:new Date().toISOString()};db.rooms.push(r);save();res.status(201).json({room:r})});
app.post('/api/rooms/:roomId/join',auth,(req,res)=>{const key=String(req.params.roomId||'').trim();const r=db.rooms.find(x=>x.id===key||x.code===key.toUpperCase());if(!r)return res.status(404).json({message:'Room not found. Check the room code.'});if(!r.members.includes(req.user.id))r.members.push(req.user.id);save();res.json({room:r})});
app.get('/api/rooms/:roomId/messages',auth,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.roomId&&x.members.includes(req.user.id));if(!r)return res.status(403).json({message:'You are not a member of this room.'});res.json({messages:db.messages.filter(m=>m.roomId===r.id).slice(-100)})});

const online=new Map();
const games=new Map();
const gameKey=(roomId,name)=>`${roomId}:${name}`;
const roomMembers=rid=>db.rooms.find(r=>r.id===rid)?.members||[];
const roomUsers=rid=>roomMembers(rid).map(uid=>({id:uid,name:db.users.find(u=>u.id===uid)?.name||'Player'}));
const emitPresence=rid=>{const users=roomMembers(rid).map(uid=>({id:uid,name:db.users.find(u=>u.id===uid)?.name||'User',online:[...io.sockets.sockets.values()].some(s=>s.user?.id===uid&&[...s.rooms].includes(rid))}));io.to(rid).emit('room:presence',users)};
const win3=b=>[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].find(([a,c,d])=>b[a]&&b[a]===b[c]&&b[a]===b[d]);
const win4=b=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++){const v=b[r*7+c];if(!v)continue;for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){let ok=true;for(let n=1;n<4;n++){const rr=r+dr*n,cc=c+dc*n;if(rr<0||rr>=6||cc<0||cc>=7||b[rr*7+cc]!==v){ok=false;break}}if(ok)return v}}return null};
const newSeries=(players={})=>({format:3,wins:{},round:1,players,matchWinner:null});
const broadcastGame=(rid,type,name)=>{const g=games.get(gameKey(rid,name));if(g)io.to(rid).emit(type,{roomId:rid,...g})};
const setupPlayer=(g,uid,a,b)=>{if(g.players[uid])return;const used=Object.values(g.players);if(used.length<2)g.players[uid]=used.includes(a)?b:a};

const triviaBank=[
 {q:'Which planet is known as the Red Planet?',a:['Earth','Mars','Jupiter','Venus'],correct:1},
 {q:'What does HTTP stand for?',a:['HyperText Transfer Protocol','High Transfer Text Process','Hyperlink Transfer Type Protocol','Host Transfer Tool Protocol'],correct:0},
 {q:'Which language is primarily used to style web pages?',a:['Python','SQL','CSS','Java'],correct:2},
 {q:'What is the capital of Japan?',a:['Kyoto','Osaka','Tokyo','Sapporo'],correct:2},
 {q:'Which data structure uses FIFO ordering?',a:['Stack','Queue','Tree','Graph'],correct:1},
 {q:'Which gas do plants absorb during photosynthesis?',a:['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'],correct:2},
 {q:'How many continents are there?',a:['5','6','7','8'],correct:2},
 {q:'Which is the largest ocean?',a:['Atlantic','Indian','Arctic','Pacific'],correct:3},
 {q:'What is 12 × 8?',a:['86','96','108','112'],correct:1},
 {q:'Which instrument has black and white keys?',a:['Violin','Piano','Flute','Drum'],correct:1}
];
const scribbleWords=['apple','rocket','castle','pizza','guitar','mountain','dragon','camera','airplane','hamburger','rainbow','football','lighthouse','robot','ice cream','volcano','pirate ship','birthday cake','snowman','bicycle'];
const spyLocations=['Beach','Airport','Hospital','Restaurant','School','Space Station','Movie Studio','Hotel','Police Station','Amusement Park'];
const sendScribble=rid=>{const g=games.get(gameKey(rid,'scribble'));if(!g)return;io.to(rid).emit('game:scribble',{roomId:rid,drawer:g.drawer,round:g.round,scores:g.scores,started:g.started,choices:g.started?[]:(g.drawer?g.choices||[]:[]),timeLeft:g.timeLeft||0});for(const[,socket]of io.sockets.sockets){if([...socket.rooms].includes(rid)&&socket.user?.id===g.drawer)socket.emit('game:scribble:drawer',{choices:g.choices||[],word:g.word||null})}};
const sendSpyState=roomId=>{const g=games.get(gameKey(roomId,'spy'));if(!g)return;for(const[,socket]of io.sockets.sockets){if(![...socket.rooms].includes(roomId))continue;const role=g.spy===socket.user?.id?'spy':'civilian';socket.emit('game:spy',{roomId,players:g.players,started:g.started,round:g.round,role,clue:role==='civilian'?g.location:null,votes:Object.keys(g.votes||{}).length,result:g.result||null,voted:Boolean(g.votes?.[socket.user?.id])})}};

io.use((s,next)=>{try{s.user=jwt.verify(s.handshake.auth.token,SECRET);next()}catch{next(new Error('Unauthorized'))}});
io.on('connection',s=>{
 const uid=s.user.id;online.set(uid,(online.get(uid)||0)+1);s.broadcast.emit('presence',{userId:uid,online:true});
 s.on('room:join',rid=>{const r=db.rooms.find(x=>x.id===rid&&x.members.includes(uid));if(!r)return;s.join(rid);const peers=[...io.sockets.adapter.rooms.get(rid)||[]].filter(x=>x!==s.id).map(x=>io.sockets.sockets.get(x)?.user.id).filter(Boolean);s.emit('room:users',peers);s.to(rid).emit('room:notice',{text:`${db.users.find(u=>u.id===uid)?.name||'Someone'} joined the room.`});emitPresence(rid)});
 s.on('chat:send',({roomId,text})=>{const r=db.rooms.find(x=>x.id===roomId&&x.members.includes(uid));if(!r||!String(text||'').trim())return;const m={id:id(),roomId,userId:uid,userName:db.users.find(u=>u.id===uid)?.name||'User',text:String(text).trim(),createdAt:new Date().toISOString()};db.messages.push(m);save();io.to(roomId).emit('chat:message',m)});
 s.on('webrtc:signal',({roomId,target,data})=>{if(target)for(const[,socket]of io.sockets.sockets)if(socket.user?.id===target){socket.emit('webrtc:signal',{from:uid,data});return}s.to(roomId).emit('webrtc:signal',{from:uid,data})});
 s.on('room:reaction',({roomId,emoji})=>{if(!roomMembers(roomId).includes(uid))return;io.to(roomId).emit('room:reaction',{userId:uid,userName:db.users.find(u=>u.id===uid)?.name||'User',emoji,id:id()})});

 s.on('game:tictactoe:join',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;let g=games.get(gameKey(roomId,'ttt'));if(!g)g={...newSeries(),board:Array(9).fill(''),turn:'X',winner:null};setupPlayer(g,uid,'X','O');games.set(gameKey(roomId,'ttt'),g);broadcastGame(roomId,'game:tictactoe','ttt')});
 s.on('game:tictactoe:format',({roomId,format})=>{if(!roomMembers(roomId).includes(uid)||![3,5,7].includes(Number(format)))return;const old=games.get(gameKey(roomId,'ttt'));const players=old?.players||{};games.set(gameKey(roomId,'ttt'),{...newSeries(players),format:Number(format),board:Array(9).fill(''),turn:'X',winner:null});broadcastGame(roomId,'game:tictactoe','ttt')});
 s.on('game:tictactoe:move',({roomId,index})=>{const g=games.get(gameKey(roomId,'ttt'));if(!g||g.matchWinner||g.winner||g.players[uid]!==g.turn||g.board[index])return;g.board[index]=g.turn;const w=win3(g.board);if(w){g.winner=w;g.wins[w]=(g.wins[w]||0)+1;if(g.wins[w]>=Math.ceil(g.format/2))g.matchWinner=w}else if(g.board.every(Boolean))g.winner='draw';else g.turn=g.turn==='X'?'O':'X';broadcastGame(roomId,'game:tictactoe','ttt')});
 s.on('game:tictactoe:next',({roomId})=>{const g=games.get(gameKey(roomId,'ttt'));if(!g||g.matchWinner)return;g.board=Array(9).fill('');g.turn='X';g.winner=null;g.round++;broadcastGame(roomId,'game:tictactoe','ttt')});
 s.on('game:tictactoe:newmatch',({roomId})=>{const g=games.get(gameKey(roomId,'ttt'));const players=g?.players||{};games.set(gameKey(roomId,'ttt'),{...newSeries(players),format:g?.format||3,board:Array(9).fill(''),turn:'X',winner:null});broadcastGame(roomId,'game:tictactoe','ttt')});

 s.on('game:connect4:join',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;let g=games.get(gameKey(roomId,'c4'));if(!g)g={...newSeries(),board:Array(42).fill(''),turn:'R',winner:null};setupPlayer(g,uid,'R','Y');games.set(gameKey(roomId,'c4'),g);broadcastGame(roomId,'game:connect4','c4')});
 s.on('game:connect4:format',({roomId,format})=>{if(!roomMembers(roomId).includes(uid)||![3,5,7].includes(Number(format)))return;const old=games.get(gameKey(roomId,'c4'));const players=old?.players||{};games.set(gameKey(roomId,'c4'),{...newSeries(players),format:Number(format),board:Array(42).fill(''),turn:'R',winner:null});broadcastGame(roomId,'game:connect4','c4')});
 s.on('game:connect4:move',({roomId,col})=>{const g=games.get(gameKey(roomId,'c4'));if(!g||g.matchWinner||g.winner||g.players[uid]!==g.turn||col<0||col>6)return;for(let r=5;r>=0;r--){const i=r*7+col;if(!g.board[i]){g.board[i]=g.turn;g.winner=win4(g.board);if(g.winner){g.wins[g.winner]=(g.wins[g.winner]||0)+1;if(g.wins[g.winner]>=Math.ceil(g.format/2))g.matchWinner=g.winner}else if(g.board.every(Boolean))g.winner='draw';else g.turn=g.turn==='R'?'Y':'R';break}}broadcastGame(roomId,'game:connect4','c4')});
 s.on('game:connect4:next',({roomId})=>{const g=games.get(gameKey(roomId,'c4'));if(!g||g.matchWinner)return;g.board=Array(42).fill('');g.turn='R';g.winner=null;g.round++;broadcastGame(roomId,'game:connect4','c4')});
 s.on('game:connect4:newmatch',({roomId})=>{const g=games.get(gameKey(roomId,'c4'));const players=g?.players||{};games.set(gameKey(roomId,'c4'),{...newSeries(players),format:g?.format||3,board:Array(42).fill(''),turn:'R',winner:null});broadcastGame(roomId,'game:connect4','c4')});

 s.on('game:trivia:join',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;let g=games.get(gameKey(roomId,'trivia'));if(!g)g={format:5,index:0,score:{},answered:{},matchWinner:null};g.score[uid]??=0;games.set(gameKey(roomId,'trivia'),g);io.to(roomId).emit('game:trivia',{roomId,...g,question:triviaBank[g.index]})});
 s.on('game:trivia:format',({roomId,format})=>{if(!roomMembers(roomId).includes(uid)||![3,5,7,10].includes(Number(format)))return;const score={};roomMembers(roomId).forEach(x=>score[x]=0);games.set(gameKey(roomId,'trivia'),{format:Number(format),index:0,score,answered:{},matchWinner:null});io.to(roomId).emit('game:trivia',{roomId,...games.get(gameKey(roomId,'trivia')),question:triviaBank[0]})});
 s.on('game:trivia:answer',({roomId,answer})=>{const g=games.get(gameKey(roomId,'trivia'));if(!g||g.matchWinner||g.answered[uid])return;g.answered[uid]=true;g.score[uid]??=0;if(Number(answer)===triviaBank[g.index].correct)g.score[uid]++;io.to(roomId).emit('game:trivia',{roomId,...g,question:triviaBank[g.index]})});
 s.on('game:trivia:next',({roomId})=>{const g=games.get(gameKey(roomId,'trivia'));if(!g||g.matchWinner)return;g.index++;g.answered={};if(g.index>=g.format){const entries=Object.entries(g.score);const best=Math.max(...entries.map(([,v])=>v),0);const winners=entries.filter(([,v])=>v===best);g.matchWinner=winners.length===1?winners[0][0]:'draw';g.index=g.format-1}else if(g.index>=triviaBank.length)g.index=0;io.to(roomId).emit('game:trivia',{roomId,...g,question:triviaBank[g.index]})});
 s.on('game:trivia:newmatch',({roomId})=>{const score={};roomMembers(roomId).forEach(x=>score[x]=0);const g=games.get(gameKey(roomId,'trivia'));games.set(gameKey(roomId,'trivia'),{format:g?.format||5,index:0,score,answered:{},matchWinner:null});io.to(roomId).emit('game:trivia',{roomId,...games.get(gameKey(roomId,'trivia')),question:triviaBank[0]})});

 s.on('game:scribble:join',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;let g=games.get(gameKey(roomId,'scribble'));if(!g){const members=roomUsers(roomId);g={drawer:members[0]?.id||uid,round:1,scores:{},word:null,choices:[],started:false,timeLeft:0,timer:null};members.forEach(p=>g.scores[p.id]=0)}else{for(const p of roomUsers(roomId))g.scores[p.id]??=0;if(!g.drawer||!roomMembers(roomId).includes(g.drawer))g.drawer=uid}games.set(gameKey(roomId,'scribble'),g);sendScribble(roomId)});
 s.on('game:scribble:start',({roomId})=>{const g=games.get(gameKey(roomId,'scribble'));if(!g||g.drawer!==uid||g.started)return;g.choices=[];while(g.choices.length<3){const w=scribbleWords[Math.floor(Math.random()*scribbleWords.length)];if(!g.choices.includes(w))g.choices.push(w)}g.word=null;g.started=false;g.timeLeft=0;sendScribble(roomId);s.emit('game:scribble:choices',{choices:g.choices})});
 s.on('game:scribble:choose',({roomId,word})=>{const g=games.get(gameKey(roomId,'scribble'));if(!g||g.drawer!==uid||g.started||!g.choices.includes(word))return;g.word=word;g.started=true;g.timeLeft=60;sendScribble(roomId);clearInterval(g.timer);g.timer=setInterval(()=>{const current=games.get(gameKey(roomId,'scribble'));if(!current?.started){clearInterval(g.timer);return}current.timeLeft--;if(current.timeLeft<=0){current.started=false;clearInterval(current.timer);io.to(roomId).emit('game:scribble:result',{roomId,winnerId:null,winnerName:null,word:current.word,scores:current.scores,message:`Time's up! The word was ${current.word}.`});current.round++;const members=roomUsers(roomId);current.drawer=members[(members.findIndex(x=>x.id===current.drawer)+1)%Math.max(1,members.length)]?.id||uid;current.word=null;current.choices=[];setTimeout(()=>sendScribble(roomId),900)}else sendScribble(roomId)},1000)});
 s.on('game:scribble:draw',({roomId,points})=>{const g=games.get(gameKey(roomId,'scribble'));if(!g||g.drawer!==uid||!g.started||!Array.isArray(points)||points.length!==2)return;s.to(roomId).emit('game:scribble:draw',{points})});
 s.on('game:scribble:clear',({roomId})=>{const g=games.get(gameKey(roomId,'scribble'));if(g?.drawer===uid)io.to(roomId).emit('game:scribble:clear')});
 s.on('game:scribble:guess',({roomId,guess})=>{const g=games.get(gameKey(roomId,'scribble'));if(!g||!g.started||uid===g.drawer||!String(guess||'').trim())return;const clean=String(guess).trim().toLowerCase();if(clean===String(g.word||'').toLowerCase()){g.scores[uid]=(g.scores[uid]||0)+1;g.started=false;clearInterval(g.timer);const winnerName=db.users.find(u=>u.id===uid)?.name||'Player';io.to(roomId).emit('game:scribble:result',{roomId,winnerId:uid,winnerName,word:g.word,scores:g.scores,message:`${winnerName} guessed it! The word was ${g.word}.`});g.round++;const members=roomUsers(roomId);g.drawer=members[(members.findIndex(x=>x.id===g.drawer)+1)%Math.max(1,members.length)]?.id||uid;g.word=null;g.choices=[];setTimeout(()=>sendScribble(roomId),900)}else s.to(roomId).emit('game:scribble:guess',{userName:db.users.find(u=>u.id===uid)?.name||'Player',guess:String(guess).trim()})});

 s.on('game:spy:join',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;let g=games.get(gameKey(roomId,'spy'));if(!g)g={players:roomUsers(roomId),started:false,round:0,spy:null,location:null,votes:{},result:null};g.players=roomUsers(roomId);games.set(gameKey(roomId,'spy'),g);sendSpyState(roomId)});
 s.on('game:spy:start',({roomId})=>{if(!roomMembers(roomId).includes(uid))return;const players=roomUsers(roomId);if(players.length<3){s.emit('game:spy:error',{message:'Find the Spy needs at least 3 players.'});return}const spy=players[Math.floor(Math.random()*players.length)];const g={players,started:true,round:(games.get(gameKey(roomId,'spy'))?.round||0)+1,spy:spy.id,location:spyLocations[Math.floor(Math.random()*spyLocations.length)],votes:{},result:null};games.set(gameKey(roomId,'spy'),g);sendSpyState(roomId)});
 s.on('game:spy:vote',({roomId,target})=>{const g=games.get(gameKey(roomId,'spy'));if(!g||!g.started||!g.players.some(p=>p.id===target)||g.votes[uid])return;g.votes[uid]=target;sendSpyState(roomId);if(Object.keys(g.votes).length<g.players.length)return;const counts={};Object.values(g.votes).forEach(x=>counts[x]=(counts[x]||0)+1);const max=Math.max(...Object.values(counts),0);const top=Object.entries(counts).filter(([,v])=>v===max).map(([k])=>k);const caught=top.length===1&&top[0]===g.spy;const spyName=db.users.find(u=>u.id===g.spy)?.name||'The spy';g.started=false;g.result=caught?`YES — ${spyName} was the SPY! 🕵️ CIVILIANS WIN!`:`NO — ${spyName} was the SPY! 🕵️ SPY WINS!`;sendSpyState(roomId)});

 const categoryOf=text=>{const t=text.toLowerCase();if(/love|date|partner|relationship|romantic/.test(t))return'Relationships';if(/movie|music|song|film/.test(t))return'Entertainment';if(/food|pizza|cook|restaurant/.test(t))return'Food';if(/travel|trip|country|city/.test(t))return'Travel';if(/game|sport|football|cricket/.test(t))return'Games';if(/code|python|javascript|sql|computer/.test(t))return'Technology';return'General'};
 const questionSimilarity=(a,b)=>{const A=new Set(a.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(x=>x.length>2));const B=new Set(b.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(x=>x.length>2));const inter=[...A].filter(x=>B.has(x)).length;const union=new Set([...A,...B]).size;return union?inter/union:0};
 s.on('question:list',({roomId})=>{s.emit('question:update',{roomId,questions:db.questions.filter(q=>q.roomId===roomId).slice(-50)})});
 s.on('question:add',({roomId,text})=>{if(!roomMembers(roomId).includes(uid)||!String(text||'').trim())return;const clean=String(text).trim();const old=db.questions.filter(q=>q.roomId===roomId);const similarity=old.reduce((m,q)=>Math.max(m,questionSimilarity(clean,q.text)),0);const q={id:id(),roomId,userId:uid,text:clean,category:categoryOf(clean),type:/\?$/.test(clean)?'Open question':'Prompt',createdAt:new Date().toISOString()};db.questions.push(q);save();io.to(roomId).emit('question:update',{roomId,questions:db.questions.filter(x=>x.roomId===roomId).slice(-50),analysis:{category:q.category,type:q.type,similarity}})});
 s.on('disconnect',()=>{const n=(online.get(uid)||1)-1;n?online.set(uid,n):online.delete(uid);s.broadcast.emit('presence',{userId:uid,online:n>0});for(const rid of [...s.rooms].filter(r=>r!==s.id))emitPresence(rid)});
});
server.listen(PORT,()=>console.log(`Together server: http://localhost:${PORT}`));
