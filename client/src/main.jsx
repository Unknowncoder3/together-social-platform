import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{io}from'socket.io-client';
import'./styles.css';

const api=async(u,o={})=>{
  const r=await fetch('/api'+u,{...o,headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('together_token')}`,...(o.headers||{})}});
  const raw=await r.text();
  let d={};
  try{d=raw?JSON.parse(raw):{}}catch{d={message:raw||'Server returned an invalid response.'}}
  if(!r.ok)throw Error(d.message||'Request failed');
  return d;
};

function Auth({done}){
  const[m,setM]=useState('login'),[f,setF]=useState({name:'',email:'',password:''}),[e,setE]=useState('');
  const go=async x=>{x.preventDefault();setE('');try{const d=await api('/auth/'+(m==='login'?'login':'register'),{method:'POST',body:JSON.stringify(f)});localStorage.setItem('together_token',d.token);done(d.user)}catch(x){setE(x.message)}};
  return <main className="auth"><div className="brand">Together<span>•</span></div><h1>Don't just call.<br/><em>Hang out.</em></h1><p className="muted">Your small virtual room for the people you care about.</p><form onSubmit={go}>{m==='register'&&<input placeholder="Your name" value={f.name} onChange={x=>setF({...f,name:x.target.value})}/>}<input type="email" placeholder="Email" value={f.email} onChange={x=>setF({...f,email:x.target.value})}/><input type="password" placeholder="Password (6+ characters)" value={f.password} onChange={x=>setF({...f,password:x.target.value})}/>{e&&<div className="error">{e}</div>}<button>{m==='login'?'Enter Together':'Create account'}</button></form><button className="link" onClick={()=>{setM(m==='login'?'register':'login');setE('')}}>{m==='login'?'New here? Create an account':'Already have an account? Login'}</button></main>;
}

function Remote({stream}){
  const r=useRef();
  useEffect(()=>{if(r.current)r.current.srcObject=stream},[stream]);
  return <div className="videoCard"><video ref={r} autoPlay playsInline/><span>Guest</span></div>;
}

function Room({room,user,s,onLeave}){
  const local=useRef(),stream=useRef(),screenStream=useRef(),pcs=useRef({});
  const[cam,setCam]=useState(true),[mic,setMic]=useState(true),[sharing,setSharing]=useState(false),[connected,setConnected]=useState(s.connected);
  const[remote,setRemote]=useState([]),[msgs,setMsgs]=useState([]),[text,setText]=useState(''),[notice,setNotice]=useState('');

  const make=async(uid,offer=false)=>{
    let pc=pcs.current[uid];
    if(pc)return pc;
    pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pcs.current[uid]=pc;
    stream.current?.getTracks().forEach(t=>{
      const sender=pc.addTrack(t,stream.current);
      if(t.kind==='video'){
        const params=sender.getParameters();
        params.encodings=params.encodings?.length?params.encodings:[{}];
        params.encodings[0].maxBitrate=2500000;
        params.encodings[0].maxFramerate=30;
        sender.setParameters(params).catch(()=>{});
      }
    });
    pc.onicecandidate=e=>e.candidate&&s.emit('webrtc:signal',{roomId:room.id,target:uid,data:{type:'candidate',candidate:e.candidate}});
    pc.ontrack=e=>setRemote(a=>[...a.filter(x=>x.id!==uid),{id:uid,stream:e.streams[0]}]);
    if(offer){const o=await pc.createOffer();await pc.setLocalDescription(o);s.emit('webrtc:signal',{roomId:room.id,target:uid,data:o})}
    return pc;
  };

  useEffect(()=>{
    let alive=true;
    api(`/rooms/${room.id}/messages`).then(d=>setMsgs(d.messages)).catch(()=>{});
    const onConnect=()=>setConnected(true),onDisconnect=()=>setConnected(false);
    s.on('connect',onConnect).on('disconnect',onDisconnect);
    (async()=>{
      try{
        stream.current=await navigator.mediaDevices.getUserMedia({
          video:{width:{ideal:1280},height:{ideal:720},aspectRatio:{ideal:16/9},frameRate:{ideal:30,max:30}},
          audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
        });
        if(alive)local.current.srcObject=stream.current;
      }catch{setNotice('Camera/microphone unavailable. You can still use chat.')}
      s.emit('room:join',room.id);
    })();
    const users=ids=>ids.forEach(id=>make(id,true));
    const signal=async({from,data})=>{
      const pc=await make(from,false);
      if(data.type==='offer'){
        await pc.setRemoteDescription(data);
        const a=await pc.createAnswer();
        await pc.setLocalDescription(a);
        s.emit('webrtc:signal',{roomId:room.id,target:from,data:a});
      }else if(data.type==='answer')await pc.setRemoteDescription(data);
      else if(data.type==='candidate')try{await pc.addIceCandidate(data.candidate)}catch{}
    };
    const chat=m=>m.roomId===room.id&&setMsgs(x=>[...x,m]);
    const n=x=>{setNotice(x.text);setTimeout(()=>setNotice(''),2500)};
    s.on('room:users',users).on('webrtc:signal',signal).on('chat:message',chat).on('room:notice',n);
    return()=>{
      alive=false;
      s.off('connect',onConnect).off('disconnect',onDisconnect).off('room:users',users).off('webrtc:signal',signal).off('chat:message',chat).off('room:notice',n);
      screenStream.current?.getTracks().forEach(t=>t.stop());
      stream.current?.getTracks().forEach(t=>t.stop());
      Object.values(pcs.current).forEach(p=>p.close());
      pcs.current={};
    };
  },[room.id]);

  const restoreCamera=()=>{
    const v=stream.current?.getVideoTracks()[0];
    if(v)Object.values(pcs.current).forEach(p=>p.getSenders().find(q=>q.track?.kind==='video')?.replaceTrack(v));
    if(local.current&&stream.current)local.current.srcObject=stream.current;
    screenStream.current=null;
    setSharing(false);
  };

  const stopShare=()=>{
    const x=screenStream.current;
    if(x){x.getTracks().forEach(t=>t.stop());screenStream.current=null}
    restoreCamera();
  };

  const share=async()=>{
    if(sharing){stopShare();return}
    try{
      const x=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60}},audio:false});
      const t=x.getVideoTracks()[0];
      screenStream.current=x;
      Object.values(pcs.current).forEach(p=>p.getSenders().find(q=>q.track?.kind==='video')?.replaceTrack(t));
      if(local.current)local.current.srcObject=x;
      setSharing(true);
      t.onended=()=>restoreCamera();
    }catch{}
  };

  const send=e=>{e.preventDefault();if(text.trim()){s.emit('chat:send',{roomId:room.id,text});setText('')}};
  const toggle=k=>{stream.current?.getTracks().filter(t=>t.kind===k).forEach(t=>t.enabled=!t.enabled);k==='video'?setCam(x=>!x):setMic(x=>!x)};

  return <div className="room"><header><div><strong>{room.name}</strong><small>Room code: <b>{room.code||'—'}</b></small></div><div className="roomStatus"><span className={connected?'statusDot online':'statusDot'}></span>{connected?'Connected':'Reconnecting…'}<button className="danger" onClick={onLeave}>Leave</button></div></header>{notice&&<div className="notice">{notice}</div>}<section className="stage"><div className="videos"><div className="videoCard"><video ref={local} autoPlay muted playsInline/><span>You · {user.name}</span></div>{remote.map(x=><Remote key={x.id} stream={x.stream}/>)}</div><div className="controls"><button onClick={()=>toggle('audio')}>{mic?'🎙️':'🔇'}</button><button onClick={()=>toggle('video')}>{cam?'📷':'🚫'}</button><button className={sharing?'shareActive':''} onClick={share}>{sharing?'⏹ Stop sharing':'🖥️ Share screen'}</button></div></section><aside className="chat"><h3>Room chat</h3><div className="messages">{msgs.map(m=><div className={m.userId===user.id?'mine':''} key={m.id}><b>{m.userName}</b><span>{m.text}</span></div>)}</div><form onSubmit={send}><input value={text} onChange={e=>setText(e.target.value)} placeholder="Say something..."/><button>Send</button></form></aside></div>;
}

function App(){
  const[u,setU]=useState(null),[room,setRoom]=useState(null),[rooms,setRooms]=useState([]),[fr,setFr]=useState({friends:[],requests:[]});
  const[q,setQ]=useState(''),[found,setFound]=useState([]),[name,setName]=useState(''),[joinCode,setJoinCode]=useState(''),[err,setErr]=useState(''),[s,setS]=useState(null);
  useEffect(()=>{if(localStorage.getItem('together_token'))api('/me').then(d=>setU(d.user)).catch(()=>localStorage.removeItem('together_token'))},[]);
  useEffect(()=>{if(!u)return;api('/rooms').then(d=>setRooms(d.rooms));api('/friends').then(setFr);const x=io({auth:{token:localStorage.getItem('together_token')}});setS(x);return()=>x.disconnect()},[u]);
  if(!u)return <Auth done={setU}/>;
  if(room&&s)return <Room room={room} user={u} s={s} onLeave={()=>setRoom(null)}/>;

  const create=async()=>{try{setErr('');const d=await api('/rooms',{method:'POST',body:JSON.stringify({name:name||'Together Room'})});setRooms(x=>[...x,d.room]);setName('');setRoom(d.room)}catch(x){setErr(x.message)}};
  const join=async()=>{if(!joinCode.trim())return;try{setErr('');const d=await api('/rooms/'+encodeURIComponent(joinCode.trim()),{method:'POST'});setRooms(x=>x.some(r=>r.id===d.room.id)?x:x.concat(d.room));setJoinCode('');setRoom(d.room)}catch(x){setErr(x.message)}};
  const search=async()=>{try{setFound(await api('/users/search?q='+encodeURIComponent(q)))}catch(x){setErr(x.message)}};
  const add=async id=>{try{await api('/friends/request/'+id,{method:'POST'});setErr('Friend request sent.')}catch(x){setErr(x.message)}};
  const enter=async r=>{try{setErr('');const d=await api('/rooms/'+r.id+'/join',{method:'POST'});setRoom(d.room)}catch(x){setErr(x.message)}};
  const copy=async code=>{try{await navigator.clipboard.writeText(code);setErr('Room code copied. Share it with your friend.')}catch{setErr('Room code: '+code)}};
  const refresh=async()=>setFr(await api('/friends'));

  return <main className="dashboard"><header className="top"><div><div className="brand">Together<span>•</span></div><small>Welcome, {u.name}</small></div><button className="link" onClick={()=>{localStorage.removeItem('together_token');location.reload()}}>Logout</button></header>{err&&<div className="error banner">{err}</div>}<div className="grid"><section className="panel hero"><h1>Your people.<br/><em>Your room.</em></h1><p>Start a private room and invite a friend. Share the room code so they can join from their account.</p><div className="create"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Room name"/><button onClick={create}>Create room</button></div></section><section className="panel joinPanel"><h2>Join a room</h2><p className="muted">Enter the room code your friend shared with you.</p><div className="search"><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4E5" maxLength={10}/><button onClick={join}>Join</button></div></section><section className="panel"><h2>Find friends</h2><div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or email"/><button onClick={search}>Search</button></div>{found.map(x=><div className="row" key={x.id}><span><b>{x.name}</b><small>{x.email}</small></span><button onClick={()=>add(x.id)}>Add</button></div>)}</section><section className="panel"><h2>Your rooms</h2>{rooms.map(r=><div className="roomRow" key={r.id}><span><b>{r.name}</b><small>{r.members.length} member{r.members.length!==1?'s':''} · Code <strong>{r.code}</strong></small></span><div className="roomActions"><button className="secondary" onClick={()=>copy(r.code)}>Copy</button><button onClick={()=>enter(r)}>Enter</button></div></div>)}{!rooms.length&&<p className="muted">Create your first room.</p>}</section><section className="panel"><h2>Friends</h2>{fr.friends.map(x=><div className="row" key={x.id}><span><b>{x.name}</b><small>{x.email}</small></span></div>)}{fr.requests.map(x=><div className="row" key={x.id}><span><b>{x.user.name}</b><small>Friend request</small></span><button onClick={async()=>{await api('/friends/'+x.id+'/accept',{method:'POST'});refresh()}}>Accept</button></div>)}{!fr.friends.length&&!fr.requests.length&&<p className="muted">Add someone to get started.</p>}</section></div></main>;
}

createRoot(document.getElementById('root')).render(<App/>);
