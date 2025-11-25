declare module '@iktakahiro/markdown-it-katex' {
  import type MarkdownIt from 'markdown-it';

  // The plugin function signature: it takes a MarkdownIt instance and optional options,
  // and returns the same instance.
  function markdownItKatex(md: MarkdownIt, options?: unknown): MarkdownIt;

  export default markdownItKatex;
}


