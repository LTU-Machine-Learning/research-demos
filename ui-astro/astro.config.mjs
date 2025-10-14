// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  server: { 
    port: 4321, 
    host: true 
  },
  output: 'static',  
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
