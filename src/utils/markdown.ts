import MarkdownIt from 'markdown-it';
import markdownItKatex from '@iktakahiro/markdown-it-katex';

// Shared markdown renderer with LaTeX support, used for both posts and previews.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
  .use(markdownItKatex);

// Add a CSS class for images so we can hook click-to-zoom.
const defaultImage =
  md.renderer.rules.image ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const existing = token.attrGet('class');
  token.attrSet('class', existing ? `${existing} post-image` : 'post-image');
  return defaultImage(tokens, idx, options, env, self);
};

export function renderMarkdown(text: string | undefined | null): string {
  if (!text) return '';
  return md.render(text);
}

export function buildBodyWithImages(text: string, images: string[]): string {
  if (!images.length) return text;
  const imagesMd = images.map((url) => `![image](${url})`).join('\n');
  if (!text) return imagesMd;
  return `${text}\n\n${imagesMd}`;
}


