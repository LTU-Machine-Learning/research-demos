import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  server: { port: 4321, host: true },
  output: 'static',
  integrations: [
    starlight({
      title: 'Vision Hub Docs',
      disable404Route: true,

      sidebar: [
        { label: 'Getting started', autogenerate: { directory: '' } },

        // ou mieux : sections explicites
        { label: 'Project',      autogenerate: { directory: 'projets' } },
        { label: 'Architecture', autogenerate: { directory: 'architecture' } },
        { label: 'Frontend',     autogenerate: { directory: 'frontend' } },
        { label: 'API',          autogenerate: { directory: 'api' } },
        // plus tard:
        // { label: 'Video',         autogenerate: { directory: 'video' } },
        // { label: 'Infrastructure', autogenerate: { directory: 'infrastructure' } },
      ],
    }),
  ],
  vite: { build: { assetsInlineLimit: 0 } },
});
