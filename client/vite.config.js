import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionEndpointRewrite = {
  name: 'together-production-endpoints',
  transform(code, id) {
    if (!id.includes('/client/src/')) return null;
    let out = code;

    // Main app: keep local /api proxy, but allow a production API origin.
    out = out.replace(
      "fetch('/api'+u",
      "fetch((import.meta.env.VITE_API_URL || '/api')+u"
    );
    out = out.replace(
      "const x=io({auth:",
      "const x=io(import.meta.env.VITE_API_ORIGIN || undefined,{auth:"
    );

    // Couple/experience modules: route their relative API calls to the
    // appropriate service when an explicit VITE_* API URL is configured.
    // Normalize /api so VITE_API_URL=https://.../api never becomes /api/api/...
    out = out.replace(
      "const api=async(path,options={})=>{const r=await fetch(path,",
      "const api=async(path,options={})=>{const base=path.startsWith('/api/couple')?(import.meta.env.VITE_COUPLE_URL||''):path.startsWith('/api/ai')?(import.meta.env.VITE_AI_URL||''):(import.meta.env.VITE_API_URL||'');const target=base?(base.endsWith('/api')&&path.startsWith('/api')?base+path.slice(4):base+path):path;const r=await fetch(target,"
    );

    // Couple Mode currently names its local socket endpoint explicitly.
    out = out.replace(
      "socketIO('http://localhost:5002'",
      "socketIO(import.meta.env.VITE_COUPLE_SOCKET_URL || 'http://localhost:5002'"
    );

    // Production WebRTC hardening for the main room. Browser-to-browser
    // ICE candidates can arrive before the remote SDP is installed. Queue
    // those candidates on the peer and flush them after setRemoteDescription.
    out = out.replace(
      "urls: 'stun:stun.l.google.com:19302'",
      "urls: ['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']"
    );
    out = out.replace(
      "urls:\n            'stun:stun.l.google.com:19302'",
      "urls:\n            ['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']"
    );
    out = out.replace(
      "pcs.current[uid] = pc;",
      "pcs.current[uid] = pc;\n    pc.__pendingIce = [];"
    );
    out = out.replace(
      "await pc.setRemoteDescription(\n          data\n        );\n\n        const a =",
      "await pc.setRemoteDescription(\n          data\n        );\n        for (const candidate of pc.__pendingIce.splice(0)) {\n          await pc.addIceCandidate(candidate).catch(() => {});\n        }\n\n        const a ="
    );
    out = out.replace(
      "await pc.setRemoteDescription(\n          data\n        );\n      } else if (\n        data.type === 'candidate'",
      "await pc.setRemoteDescription(\n          data\n        );\n        for (const candidate of pc.__pendingIce.splice(0)) {\n          await pc.addIceCandidate(candidate).catch(() => {});\n        }\n      } else if (\n        data.type === 'candidate'"
    );
    out = out.replace(
      "try {\n          await pc.addIceCandidate(\n            data.candidate\n          );\n        } catch {}",
      "if (pc.remoteDescription) {\n          await pc.addIceCandidate(data.candidate).catch(() => {});\n        } else {\n          pc.__pendingIce.push(data.candidate);\n        }"
    );

    // Couple Mode fix: the no-relationship screen previously hid incoming
    // and outgoing couple requests, so the recipient had no Accept button.
    if (id.endsWith('/client/src/couple-widget.js')) {
      const oldConnect = `const renderConnect=()=>{body.innerHTML=\`<div class="coupleLanding"><div class="coupleOrb">❤️</div><h3>Your private space starts with one person.</h3><p>Choose the person you want to build this experience with. Once connected, the relationship gets one permanent private room that both partners enter — it is not a separate room for each person.</p><button class="couplePrimary" data-action="find">Find your partner</button></div><div id="coupleConnectBox"></div>\`;panel.querySelector('[data-action="find"]').onclick=()=>{panel.querySelector('#coupleConnectBox').innerHTML=\`<div class="bondingGate"><h3>💌 Find your person</h3><div style="display:flex;gap:8px;margin-top:12px"><input id="partnerSearch" style="flex:1;background:#0f0d13;color:#fff;border:1px solid #403441;border-radius:10px;padding:11px" placeholder="Name or email…"/><button class="couplePrimary" id="partnerSearchBtn">Search</button></div><div id="partnerResults"></div></div>\`;panel.querySelector('#partnerSearchBtn').onclick=async()=>{const q=panel.querySelector('#partnerSearch').value.trim();if(!q)return;const box=panel.querySelector('#partnerResults');box.innerHTML='<p class="coupleMeta">Searching…</p>';try{const users=await api('/api/users/search?q='+encodeURIComponent(q));box.innerHTML=users.length?users.map(u=>\`<div class="listItem"><span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span><button class="couplePrimary" data-pick="${u.id}">Choose ❤️</button></div>\`).join(''):'<p class="coupleMeta">No users found.</p>';panel.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{try{await api('/api/couple/request/'+b.dataset.pick,{method:'POST'});await render()}catch(e){alert(e.message)}})}catch(e){box.innerHTML=\`<div class="roomInfo error">${esc(e.message)}</div>\`}}};};`;
      const newConnect = `const renderConnect=()=>{const incoming=state.incoming||[],outgoing=state.outgoing||[];body.innerHTML=\`<div class="coupleLanding"><div class="coupleOrb">❤️</div><h3>Your private space starts with one person.</h3><p>Choose the person you want to build this experience with. Once connected, the relationship gets one permanent private room that both partners enter — it is not a separate room for each person.</p><button class="couplePrimary" data-action="find">Find your partner</button></div>${incoming.length?\`<div class="bondingGate"><h3>💌 Couple request waiting</h3>${incoming.map(r=>\`<div class="listItem"><span><b>${esc(r.user?.name||'Someone')}</b><small>${esc(r.user?.email||'')}</small></span><button class="couplePrimary" data-accept="${r.id}">Accept ❤️</button></div>\`).join('')}</div>\`:''}${outgoing.length?\`<div class="roomInfo">⏳ Waiting for ${esc(outgoing[0]?.user?.name||'them')} to accept your couple request.</div>\`:''}<div id="coupleConnectBox"></div>\`;panel.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{try{await api('/api/couple/request/'+b.dataset.accept+'/accept',{method:'POST'});await render()}catch(e){alert(e.message)}});panel.querySelector('[data-action="find"]').onclick=()=>{panel.querySelector('#coupleConnectBox').innerHTML=\`<div class="bondingGate"><h3>💌 Find your person</h3><div style="display:flex;gap:8px;margin-top:12px"><input id="partnerSearch" style="flex:1;background:#0f0d13;color:#fff;border:1px solid #403441;border-radius:10px;padding:11px" placeholder="Name or email…"/><button class="couplePrimary" id="partnerSearchBtn">Search</button></div><div id="partnerResults"></div></div>\`;panel.querySelector('#partnerSearchBtn').onclick=async()=>{const q=panel.querySelector('#partnerSearch').value.trim();if(!q)return;const box=panel.querySelector('#partnerResults');box.innerHTML='<p class="coupleMeta">Searching…</p>';try{const users=await api('/api/users/search?q='+encodeURIComponent(q));box.innerHTML=users.length?users.map(u=>\`<div class="listItem"><span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span><button class="couplePrimary" data-pick="${u.id}">Choose ❤️</button></div>\`).join(''):'<p class="coupleMeta">No users found.</p>';panel.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{try{await api('/api/couple/request/'+b.dataset.pick,{method:'POST'});await render()}catch(e){alert(e.message)}})}catch(e){box.innerHTML=\`<div class="roomInfo error">${esc(e.message)}</div>\`}}};};`;
      out = out.replace(oldConnect, newConnect);
    }

    return out === code ? null : { code: out, map: null };
  }
};

export default defineConfig({
  root: 'client',
  plugins: [react(), productionEndpointRewrite],
  server: {
    port: 5173,
    proxy: {
      '/api/couple': 'http://localhost:5002',
      '/api/ai': 'http://localhost:5003',
      '/api': 'http://localhost:5001',
      '/socket.io': { target: 'ws://localhost:5001', ws: true }
    }
  }
});
