// Renders a sample story through the site's Markdown component and prints the HTML, to check that
// headings, lists, quotes, inline code and fenced code blocks all come out as real elements.
// Run: npx tsx scripts/check-markdown.tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/markdown";

const sample = [
  "# Big heading", "## Second", "### Third", "",
  "Some **bold**, _italic_, ~~struck~~ and `inline code`.", "",
  "```js", "const offer = null; // revoked", "```", "",
  "- one", "- two", "", "1. first", "2. second", "", "> a quote", "",
  "[a link](https://example.com) and ![img](https://x.y/z.png)", "", "---",
].join("\n");

const html = renderToStaticMarkup(createElement(Markdown, { text: sample }));
for (const tag of ["h3", "h4", "h5", "strong", "em", "del", "code", "pre", "ul", "ol", "blockquote", "hr", "a", "img"]) {
  const n = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
  console.log(tag.padEnd(10), n);
}
