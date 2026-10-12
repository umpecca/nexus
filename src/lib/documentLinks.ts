import { extractOutline } from "./outline";
import { createHeadingSlugger } from "./toc";

export function findLinkedHeading(markdown: string, fragment: string) {
  const slug = createHeadingSlugger();
  return extractOutline(markdown).find(heading => slug(heading.text) === fragment);
}
