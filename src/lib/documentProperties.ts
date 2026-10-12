import { isMap, isScalar, isSeq, parseDocument } from "yaml";

export type DocumentProperties = { title: string; type: string; tags: string; status: string; owner: string; review_date: string };
const fields = ["title", "type", "tags", "status", "owner", "review_date"] as const;
export const emptyDocumentProperties = (): DocumentProperties => ({ title: "", type: "", tags: "", status: "", owner: "", review_date: "" });

function frontmatter(markdown: string) {
  const bom = markdown.startsWith("\uFEFF") ? 1 : 0;
  const opening = /^---[ \t]*\r?\n/.exec(markdown.slice(bom));
  const start = bom + (opening?.[0].length ?? 0);
  const closing = opening ? /^---[ \t]*(?:\r?\n|$)/m.exec(markdown.slice(start)) : null;
  if (opening && !closing) throw new Error("Frontmatter has no closing --- line. Fix it in Source before editing properties.");
  const yaml = closing ? markdown.slice(start, start + closing.index) : "";
  if (yaml.length > 1_000_000) throw new Error("This frontmatter is too large for the properties form. Edit it in Source.");
  const document = parseDocument(yaml, { keepSourceTokens: true });
  if (document.errors.length) throw new Error(`Invalid YAML frontmatter: ${document.errors[0].message}`);
  if (document.contents !== null && !isMap(document.contents)) throw new Error("Frontmatter must be a YAML mapping of property names to values. Edit it in Source.");
  return { bom, yaml, start, end: closing ? start + closing.index + closing[0].length : bom, document,
    newline: markdown.includes("\r\n") ? "\r\n" : "\n", exists: !!opening };
}

export function readDocumentProperties(markdown: string): DocumentProperties {
  const { document } = frontmatter(markdown);
  const properties = emptyDocumentProperties();
  if (!isMap(document.contents)) return properties;
  for (const key of fields) {
    const node = document.contents.get(key, true);
    if (node === undefined) continue;
    if ((isScalar(node) || isSeq(node)) && node.anchor) throw new Error(`The ${key} property uses a YAML anchor. Edit it in Source to preserve linked values.`);
    if (isScalar(node) && node.value === null) continue;
    if (key === "tags" && isSeq(node)) {
      if (!node.items.every(item => isScalar(item) && !item.anchor && typeof item.value === "string" && !/[\r\n]/.test(item.value))) {
        throw new Error("The tags property must be a list of text tags. Edit it in Source.");
      }
      properties.tags = node.items.map(item => (item as { value: string }).value).join("\n");
    } else if (isScalar(node) && typeof node.value === "string") {
      properties[key] = node.value;
    } else {
      throw new Error(`The ${key} property must be ${key === "tags" ? "text or a list of text tags" : "text"}. Edit it in Source.`);
    }
  }
  return properties;
}

export function validReviewDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Update only changed properties. Block mappings use original node offsets to preserve all other YAML bytes. */
export function applyDocumentProperties(markdown: string, properties: DocumentProperties) {
  const original = readDocumentProperties(markdown);
  const block = frontmatter(markdown);
  const changes: { key: typeof fields[number]; value: string | string[] | null }[] = [];
  for (const key of fields) {
    if (typeof properties[key] !== "string") throw new Error(`Invalid ${key} property.`);
    if (properties[key] === original[key]) continue;
    const text = properties[key].trim();
    if (key === "review_date" && text && !validReviewDate(text)) throw new Error("Review date must be a real calendar date in YYYY-MM-DD format.");
    const value = key === "tags" ? [...new Set(text.split(/\r?\n/).map(tag => tag.trim()).filter(Boolean))] : text;
    changes.push({ key, value: value.length ? value : null });
  }
  if (!changes.length) return { markdown, change: null, yaml: block.exists ? block.yaml : null };

  let yaml = block.yaml;
  const map = isMap(block.document.contents) ? block.document.contents : null;
  if (map?.flow) {
    // Flow mappings have shared commas/braces; the YAML library preserves their structure and comments.
    for (const { key, value } of changes) {
      if (value === null) block.document.delete(key); else block.document.set(key, value);
    }
    yaml = block.document.toString({ lineWidth: 0 }).replace(/\n/g, block.newline);
  } else {
    const edits: { from: number; to: number; insert: string }[] = [];
    const added: string[] = [];
    const mapStart = map?.range?.[0] ?? 0;
    const indentation = yaml.slice(yaml.lastIndexOf("\n", mapStart - 1) + 1, mapStart);
    const prefix = /^ *$/.test(indentation) ? indentation : "";
    for (const { key, value } of changes) {
      const pair = map?.items.find(pair => isScalar(pair.key) && pair.key.value === key);
      if (!pair || !isScalar(pair.key) || !pair.key.range) {
        if (value !== null) added.push(`${prefix}${key}: ${JSON.stringify(value)}`);
        continue;
      }
      const node = pair.value;
      if (value === null) {
        const from = yaml.lastIndexOf("\n", pair.key.range[0] - 1) + 1;
        // Empty values may attach following comments to their node range; only remove their own line.
        const empty = !node || (isScalar(node) && node.value === null && node.range?.[0] === node.range?.[1]);
        const lineEnd = yaml.indexOf("\n", pair.key.range[0]);
        const to = empty ? lineEnd < 0 ? yaml.length : lineEnd + 1 : node.range?.[2];
        if (to === undefined) throw new Error(`Cannot safely remove ${key}. Edit it in Source.`);
        edits.push({ from, to, insert: "" });
      } else {
        if (!node?.range) throw new Error(`Cannot safely edit ${key}. Edit it in Source.`);
        const [from, to] = node.range;
        const prefix = yaml[from - 1] === ":" ? " " : "";
        const suffix = yaml.slice(from, to).endsWith("\n") ? block.newline : "";
        edits.push({ from, to, insert: prefix + JSON.stringify(value) + suffix });
      }
    }
    for (const edit of edits.sort((a, b) => b.from - a.from)) yaml = yaml.slice(0, edit.from) + edit.insert + yaml.slice(edit.to);
    if (added.length) yaml += (yaml && !yaml.endsWith("\n") ? block.newline : "") + added.join(block.newline) + block.newline;
  }
  // Validate the result before touching the editor; retain comments even when the last property is removed.
  const checked = parseDocument(yaml);
  if (checked.errors.length) throw new Error("These properties could not be applied safely. Edit the frontmatter in Source.");
  const hasContent = yaml.trim().length > 0;
  const insert = hasContent ? `---${block.newline}${yaml.endsWith("\n") ? yaml : yaml + block.newline}---${block.newline}` + (!block.exists && markdown.length > block.bom ? block.newline : "") : "";
  return { markdown: markdown.slice(0, block.bom) + insert + markdown.slice(block.end),
    change: { from: block.bom, to: block.end, insert }, yaml: hasContent ? yaml : null };
}
