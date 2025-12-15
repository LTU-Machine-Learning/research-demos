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
        { label: 'Overview', link: '/docs' },

        { label: 'Project', link: '/docs/projects' },

        { label: 'Architecture', link: '/docs/architecture' },

        { label: 'Frontend', link: '/docs/frontend' },

        {
          label: 'API',
          items: [
            { label: 'Overview', link: '/docs/api' },
            { label: 'Security', link: '/docs/api/security' },
          ],
        },

        { label: 'Video', link: '/docs/video' },

        {
          label: 'Infrastructure',
          items: [
            { label: 'Overview', link: '/docs/infrastructure' },
            { label: 'Swarm', link: '/docs/infrastructure/swarm' },
            { label: 'Network', link: '/docs/infrastructure/network' },
          ],
        },

        {
          label: 'Demos',
          items: [
            { label: 'Overview', link: '/docs/demos' },
            { label: 'YOLO', link: '/docs/demos/yolo' },
            { label: 'Pose', link: '/docs/demos/pose' },
            { label: 'Chang', link: '/docs/demos/chang' },
            { label: 'Price estimation', link: '/docs/demos/price' },
          ],
        },
      ],
    }),
  ],

  vite: {
    build: { assetsInlineLimit: 0 },
  },
});