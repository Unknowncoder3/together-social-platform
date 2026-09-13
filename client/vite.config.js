import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root:'client',
  plugins:[react()],
  server:{
    port:5173,
    proxy:{
      '/api/couple':'http://localhost:5002',
      '/api/ai':'http://localhost:5003',
      '/api':'http://localhost:5001',
      '/socket.io':{target:'ws://localhost:5001',ws:true}
    }
  }
});
