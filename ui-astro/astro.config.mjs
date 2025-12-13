// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

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

  integrations: [
    starlight({
      title: 'Vision Hub Documentation',
    }),
  ],
});
