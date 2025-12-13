import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  output: 'static',
  integrations: [
    starlight({
      title: 'Vision Hub Docs',
      sidebar: [
        {
          label: 'Getting Started',
          items: ['introduction'],
        },
      ],
    }),
  ],
});
