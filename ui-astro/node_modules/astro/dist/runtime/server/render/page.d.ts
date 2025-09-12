import type { RouteData, SSRResult } from '../../../@types/astro.js';
import { type NonAstroPageComponent } from 'astro/runtime/server/render/component.js';
import type { AstroComponentFactory } from 'astro/runtime/server/render/index.js';
export declare function renderPage(result: SSRResult, componentFactory: AstroComponentFactory | NonAstroPageComponent, props: any, children: any, streaming: boolean, route?: RouteData): Promise<Response>;
