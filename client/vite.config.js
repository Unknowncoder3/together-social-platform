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
    out = out.replace(
      "const api=async(path,options={})=>{const r=await fetch(path,",
      "const api=async(path,options={})=>{const base=path.startsWith('/api/couple')?(import.meta.env.VITE_COUPLE_URL||''):path.startsWith('/api/ai')?(import.meta.env.VITE_AI_URL||''):(import.meta.env.VITE_API_URL||'');const target=base&&path.startsWith('/api')?base+path:path;const r=await fetch(target,"
    );

    // Couple Mode currently names its local socket endpoint explicitly.
    // Keep HTTP API calls on the same-origin Render rewrites while sending
    // only the Socket.IO connection directly to the couple service.
    out = out.replace(
      "socketIO('http://localhost:5002'",
      "socketIO(import.meta.env.VITE_COUPLE_SOCKET_URL || 'http://localhost:5002'"
    );

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
