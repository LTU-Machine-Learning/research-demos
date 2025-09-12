export { createComponent } from 'astro/runtime/server/astro-component.js';
export { createAstro } from 'astro/runtime/server/astro-global.js';
export { renderEndpoint } from 'astro/runtime/server/endpoint.js';
export { escapeHTML, HTMLBytes, HTMLString, isHTMLString, markHTMLString, unescapeHTML, } from 'astro/runtime/server/escape.js';
export { renderJSX } from 'astro/runtime/server/jsx.js';
export { addAttribute, createHeadAndContent, defineScriptVars, Fragment, maybeRenderHead, renderTemplate as render, renderComponent, Renderer as Renderer, renderHead, renderHTMLElement, renderPage, renderScript, renderScriptElement, renderSlot, renderSlotToString, renderTemplate, renderToString, renderUniqueStylesheet, voidElementNames, } from 'astro/runtime/server/render/index.js';
export type { AstroComponentFactory, AstroComponentInstance, ComponentSlots, RenderInstruction, } from 'astro/runtime/server/render/index.js';
export { createTransitionScope, renderTransition } from 'astro/runtime/server/transition.js';
export declare function mergeSlots(...slotted: unknown[]): Record<string, () => any>;
export declare function spreadAttributes(values?: Record<any, any>, _name?: string, { class: scopedClassName }?: {
    class?: string;
}): any;
export declare function defineStyleVars(defs: Record<any, any> | Record<any, any>[]): any;
