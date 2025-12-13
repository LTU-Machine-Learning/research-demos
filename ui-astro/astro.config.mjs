// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'static',
  integrations: [
    mdx(),
    starlight({
      title: 'Vision Hub Documentation',
      defaultLocale: 'en',
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'Introduction', slug: 'introduction' },
            { label: 'Architecture', slug: 'architecture' },
          ],
        },
        {
          label: 'Demos',
          items: [
            { label: 'YOLO & Pose', slug: 'demos/yolo' },
            { label: 'Price Estimation', slug: 'demos/price' },
            { label: 'Arabic OCR', slug: 'demos/chang' },
          ],
        },
      ],
    }),
  ],
});
