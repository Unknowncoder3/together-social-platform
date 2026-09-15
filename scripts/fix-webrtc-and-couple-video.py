from pathlib import Path
import re

# 1) Make normal-room peer discovery authoritative for everyone already connected.
p = Path('server/index.js')
s = p.read_text()
old = "s.emit('room:users',peers);s.to(rid).emit('room:notice',{text:`${db.users.find(u=>u.id===uid)?.name||'Someone'} joined the room.`});emitPresence(rid)"
new = "const allPeers=[...new Set([...peers,uid])].filter(Boolean);io.to(rid).emit('room:users',allPeers);s.to(rid).emit('room:notice',{text:`${db.users.find(u=>u.id===uid)?.name||'Someone'} joined the room.`});emitPresence(rid)"
if old not in s:
    raise SystemExit('normal room join snippet not found')
p.write_text(s.replace(old,new,1))

# 2) Keep Couple Mode video visible while Games/Date/Dates/Memories/Moments/Mood tabs are open.
p = Path('client/src/couple-widget.js')
s = p.read_text()
pattern = r"const renderPrivateTab=\(\)=>\{.*?\};\nconst renderRoomTab="
replacement = r'''const renderPrivateTab=()=>{const c=panel.querySelector('#privateContent');if(!c)return;if(roomTab==='room')renderRoomTab(c);if(roomTab==='games')renderGamesTab(c);if(roomTab==='date')renderDateTab(c);if(roomTab==='dates')renderDatesTab(c);if(roomTab==='memories')renderMemoriesTab(c);if(roomTab==='moments')renderMomentsTab(c);if(roomTab==='mood')renderMoodTab(c);if(roomTab!=='room'){const video=document.createElement('div');video.className='privateVideoGrid';video.innerHTML=`<div class="privateVideoWrap"><video id="privateLocal" class="privateVideo" autoplay muted playsinline></video><span class="videoLabel">You</span></div><div class="privateVideoWrap"><video id="privateRemote" class="privateVideo" autoplay playsinline></video><span id="remoteWaiting" class="videoWaiting">Waiting for your partner’s video…</span><span class="videoLabel">${esc(state.relationship.partner?.name||'Partner')}</span></div>`;c.prepend(video);startRoomMedia()}};
const renderRoomTab='''
new_s, n = re.subn(pattern, replacement, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'couple renderPrivateTab replacement count={n}')
p.write_text(new_s)

print('patched normal-room peer discovery and persistent Couple Mode video')
