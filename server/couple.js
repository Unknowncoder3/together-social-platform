import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
const PORT = Number(process.env.PORT || process.env.COUPLE_PORT || 5002);
const SECRET=process.env.JWT_SECRET||'together-dev-secret';
const dir=path.resolve('data');
const file=path.join(dir,'couples.json');
fs.mkdirSync(dir,{recursive:true});
const load=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
const save=x=>fs.writeFileSync(file,JSON.stringify(x,null,2));
const id=()=>crypto.randomUUID();
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').replace('Bearer ','').trim(),SECRET);next()}catch{res.status(401).json({message:'Authentication required'})}};
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.use(express.json());

const usersFile=path.join(dir,'../db.json');
const readUsers=()=>{try{const d=JSON.parse(fs.readFileSync(usersFile,'utf8'));return d.users||[]}catch{return[]}};
const userById=uid=>readUsers().find(u=>u.id===uid);
const pub=u=>u?({id:u.id,name:u.name,email:u.email,bio:u.bio||''}):null;
const relationships=()=>load();
const statusFor=uid=>{const rs=relationships();const r=rs.find(x=>x.partnerA===uid||x.partnerB===uid);if(!r)return{relationship:null};const partnerId=r.partnerA===uid?r.partnerB:r.partnerA;return{relationship:{...r,partner:pub(userById(partnerId))}}};

app.get('/api/couple',auth,(req,res)=>res.json(statusFor(req.user.id)));
app.post('/api/couple/request/:userId',auth,(req,res)=>{const other=req.params.userId;if(other===req.user.id)return res.status(400).json({message:'You cannot connect with yourself.'});if(!userById(other))return res.status(404).json({message:'User not found.'});const rs=relationships();if(rs.some(r=>r.partnerA===req.user.id||r.partnerB===req.user.id))return res.status(409).json({message:'You are already connected to a partner.'});const pending=rs.find(r=>r.type==='request'&&r.from===req.user.id&&r.to===other);if(pending)return res.status(409).json({message:'Request already sent.'});rs.push({id:id(),type:'request',from:req.user.id,to:other,createdAt:new Date().toISOString()});save(rs);res.status(201).json({message:'Partner request sent.'})});
app.post('/api/couple/request/:requestId/accept',auth,(req,res)=>{const rs=relationships();const q=rs.find(r=>r.id===req.params.requestId&&r.type==='request'&&r.to===req.user.id);if(!q)return res.status(404).json({message:'Request not found.'});if(rs.some(r=>r.type==='connected'&&(r.partnerA===req.user.id||r.partnerB===req.user.id)))return res.status(409).json({message:'You already have a partner.'});rs.splice(rs.indexOf(q),1);rs.push({id:id(),type:'connected',partnerA:q.from,partnerB:q.to,connectedAt:new Date().toISOString(),bonding:{level:1,answers:{}}});save(rs);res.json({message:'Connected.',relationship:statusFor(req.user.id).relationship})});
app.post('/api/couple/request/:requestId/reject',auth,(req,res)=>{const rs=relationships();const i=rs.findIndex(r=>r.id===req.params.requestId&&r.type==='request'&&r.to===req.user.id);if(i<0)return res.status(404).json({message:'Request not found.'});rs.splice(i,1);save(rs);res.json({message:'Rejected.'})});
app.delete('/api/couple',auth,(req,res)=>{const rs=relationships();const next=rs.filter(r=>!(r.type==='connected'&&(r.partnerA===req.user.id||r.partnerB===req.user.id)));save(next);res.json({message:'Connection ended.'})});

const relFor=uid=>load().find(r=>r.type==='connected'&&(r.partnerA===uid||r.partnerB===uid));
const bondingFor=rel=>{const a=rel?.bonding?.answers||{};const keys=['firstMeet','togetherLength','favoriteMemory','adoreMost','futureMoment'];const answered=keys.filter(k=>String(a[k]||'').trim()).length;return Math.max(1,Math.min(5,answered+1))};
app.get('/api/couple/bonding',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});r.bonding=r.bonding||{level:1,answers:{}};r.bonding.level=bondingFor(r);save(load());res.json(r.bonding)});
app.post('/api/couple/bonding',auth,(req,res)=>{const rs=load(),r=rs.find(x=>x.type==='connected'&&(x.partnerA===req.user.id||x.partnerB===req.user.id));if(!r)return res.status(404).json({message:'No partner connection.'});r.bonding=r.bonding||{level:1,answers:{}};r.bonding.answers={...r.bonding.answers,...(req.body.answers||{})};r.bonding.level=bondingFor(r);save(rs);res.json(r.bonding)});

const roomIdFor=rel=>`couple:${rel.id}`;
app.post('/api/couple/room',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});res.json({roomId:roomIdFor(r)})});
app.get('/api/couple/messages',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});res.json({messages:(r.messages||[]).slice(-100)})});
app.post('/api/couple/dates',auth,(req,res)=>{const rs=load(),r=rs.find(x=>x.type==='connected'&&(x.partnerA===req.user.id||x.partnerB===req.user.id));if(!r)return res.status(404).json({message:'No partner connection.'});r.dates=r.dates||[];const item={id:id(),title:String(req.body.title||'Date').trim(),date:req.body.date||'',note:String(req.body.note||'').trim()};r.dates.push(item);save(rs);res.status(201).json(item)});
app.get('/api/couple/dates',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});res.json({dates:r.dates||[]})});
app.post('/api/couple/memories',auth,(req,res)=>{const rs=load(),r=rs.find(x=>x.type==='connected'&&(x.partnerA===req.user.id||x.partnerB===req.user.id));if(!r)return res.status(404).json({message:'No partner connection.'});r.memories=r.memories||[];const item={id:id(),title:String(req.body.title||'Memory').trim(),note:String(req.body.note||'').trim(),createdAt:new Date().toISOString()};r.memories.push(item);save(rs);res.status(201).json(item)});
app.get('/api/couple/memories',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});res.json({memories:r.memories||[]})});
app.post('/api/couple/moments',auth,(req,res)=>{const rs=load(),r=rs.find(x=>x.type==='connected'&&(x.partnerA===req.user.id||x.partnerB===req.user.id));if(!r)return res.status(404).json({message:'No partner connection.'});r.moments=r.moments||[];const item={id:id(),text:String(req.body.text||'').trim(),createdAt:new Date().toISOString()};r.moments.push(item);save(rs);res.status(201).json(item)});
app.get('/api/couple/moments',auth,(req,res)=>{const r=relFor(req.user.id);if(!r)return res.status(404).json({message:'No partner connection.'});res.json({moments:r.moments||[]})});
app.post('/api/couple/mood',auth,(req,res)=>{const rs=load(),r=rs.find(x=>x.type==='connected'&&(x.partnerA===req.user.id||x.partnerB===req.user.id));if(!r)return res.status(404).json({message:'No partner connection.'});r.mood=r.mood||{};r.mood[req.user.id]={level:Number(req.body.level)||1,updatedAt:new Date().toISOString()};save(rs);res.json(r.mood)});

io.use((socket,next)=>{try{socket.user=jwt.verify(socket.handshake.auth?.token||'',SECRET);next()}catch{next(new Error('Unauthorized'))}});
const coupleSockets=new Map();
const gameSessions=new Map();
io.on('connection',socket=>{
 const uid=socket.user.id;
 socket.on('couple:join',()=>{const r=relFor(uid);if(!r)return socket.emit('couple:error',{message:'No partner connection.'});socket.data.coupleRelationshipId=r.id;socket.join(roomIdFor(r));const peers=[...io.sockets.adapter.rooms.get(roomIdFor(r))||[]].filter(id=>id!==socket.id).map(id=>io.sockets.sockets.get(id)?.user?.id).filter(Boolean);socket.emit('couple:joined',{roomId:roomIdFor(r),peers,occupancy:peers.length+1,game:gameSessions.get(r.id)||null});socket.to(roomIdFor(r)).emit('couple:peer-joined',{userId:uid});});
 socket.on('couple:signal',({target,data})=>{const rid=socket.data.coupleRelationshipId;if(!rid||!target)return;for(const[,peer]of io.sockets.sockets){if(peer.user?.id===target&&peer.data.coupleRelationshipId===rid){peer.emit('couple:signal',{from:uid,data});return}}});
 socket.on('couple:chat',payload=>{const rid=socket.data.coupleRelationshipId;if(!rid)return;const rs=load(),r=rs.find(x=>x.id===rid);if(!r)return;const m={id:id(),userId:uid,userName:userById(uid)?.name||'User',text:String(payload?.text||'').trim(),createdAt:new Date().toISOString()};if(!m.text)return;r.messages=r.messages||[];r.messages.push(m);save(rs);io.to(roomIdFor(r)).emit('couple:chat',m)});
 socket.on('couple:mood',payload=>{const rid=socket.data.coupleRelationshipId;if(!rid)return;io.to(roomIdFor({id:rid})).emit('couple:mood',{userId:uid,level:Number(payload?.level)||1})});
 socket.on('couple:game',payload=>{const rid=socket.data.coupleRelationshipId;if(!rid)return;const next=payload?.clear?null:{...payload,updatedAt:Date.now()};if(next)gameSessions.set(rid,next);else gameSessions.delete(rid);io.to(roomIdFor({id:rid})).emit('couple:game',next)});
 socket.on('disconnect',()=>{});
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Together couple service: http://localhost:${PORT}`));
