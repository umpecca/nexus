const { parse } = require("yaml");

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function example(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function isOpenApiExportFence(language) {
  const tokens = String(language ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (tokens[0] === "yaml" || tokens[0] === "yml") && tokens.includes("openapi");
}

function parseOpenApi(source) {
  let document;
  try { document = parse(source); } catch { return null; }
  if (!isRecord(document) || typeof document.openapi !== "string" || !/^3(?:\.|$)/.test(document.openapi)) return null;
  if (!isRecord(document.info) || !text(document.info.title).trim() || !text(document.info.version).trim()) return null;
  if (!isRecord(document.paths)) return null;
  return document;
}

function decodePointerSegment(value) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolve(document, value) {
  if (!isRecord(value) || typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) return value;
  let current = document;
  for (const part of value.$ref.slice(2).split("/").map(decodePointerSegment)) {
    if (!isRecord(current) || !(part in current)) return value;
    current = current[part];
  }
  return isRecord(current) ? current : value;
}

function referenceName(value) {
  if (!isRecord(value) || typeof value.$ref !== "string") return "";
  return decodePointerSegment(value.$ref.split("/").at(-1) ?? "");
}

function schemaModel(document, value, depth = 0, visited = new Set()) {
  if (!isRecord(value)) return null;
  const ref = text(value.$ref);
  const resolved = resolve(document, value) ?? value;
  const nextVisited = new Set(visited);
  if (ref) nextVisited.add(ref);
  let label = referenceName(value);
  const type = text(resolved.type);
  if (!label && type === "array") label = `${schemaModel(document, resolved.items, depth + 1, nextVisited)?.label ?? "value"}[]`;
  if (!label && type) label = text(resolved.format) ? `${type} (${resolved.format})` : type;
  if (!label && isRecord(resolved.properties)) label = "object";
  if (!label) label = "value";
  if (resolved.nullable === true) label += " or null";
  const required = new Set(Array.isArray(resolved.required) ? resolved.required.filter((item) => typeof item === "string") : []);
  const properties = [];
  if (depth < 2 && (!ref || !visited.has(ref)) && isRecord(resolved.properties)) {
    for (const [name, property] of Object.entries(resolved.properties)) {
      const model = schemaModel(document, property, depth + 1, nextVisited);
      if (model) properties.push({ name, required: required.has(name), schema: model });
    }
  }
  return { label, description: text(resolved.description), enumValues: Array.isArray(resolved.enum) ? resolved.enum.map(example) : [], properties };
}

function mediaModels(document, content) {
  if (!isRecord(content)) return [];
  return Object.entries(content).flatMap(([mediaType, media]) => {
    if (!isRecord(media)) return [];
    const sample = media.example !== undefined ? example(media.example) : isRecord(media.examples) ? example(Object.values(media.examples)[0]) : "";
    return [{ mediaType, schema: schemaModel(document, media.schema), example: sample }];
  });
}

function parameterModels(document, values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const parameter = resolve(document, value);
    if (!isRecord(parameter) || !text(parameter.name) || !text(parameter.in)) return [];
    return [{ name: parameter.name, location: parameter.in, description: text(parameter.description), required: parameter.required === true || parameter.in === "path", deprecated: parameter.deprecated === true, schema: schemaModel(document, parameter.schema), example: example(parameter.example) }];
  });
}

function mergedParameters(pathParameters, operationParameters) {
  const entries = new Map();
  [...pathParameters, ...operationParameters].forEach((parameter) => entries.set(`${parameter.location}:${parameter.name}`, parameter));
  return [...entries.values()];
}

function buildReference(document) {
  const tagDescriptions = new Map();
  if (Array.isArray(document.tags)) document.tags.forEach((tag) => { if (isRecord(tag) && text(tag.name)) tagDescriptions.set(tag.name, text(tag.description)); });
  const groups = new Map();
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItem = resolve(document, rawPathItem);
    if (!isRecord(pathItem)) continue;
    const pathParameters = parameterModels(document, pathItem.parameters);
    for (const method of HTTP_METHODS) {
      if (!isRecord(pathItem[method])) continue;
      const operation = pathItem[method];
      const tag = Array.isArray(operation.tags) && typeof operation.tags[0] === "string" ? operation.tags[0] : "Default";
      if (!groups.has(tag)) groups.set(tag, { name: tag, description: tagDescriptions.get(tag) ?? "", operations: [] });
      const body = resolve(document, operation.requestBody);
      const responses = isRecord(operation.responses) ? Object.entries(operation.responses).flatMap(([status, raw]) => {
        const response = resolve(document, raw);
        return isRecord(response) ? [{ status, description: text(response.description), content: mediaModels(document, response.content) }] : [];
      }) : [];
      const security = Array.isArray(operation.security) ? operation.security.flatMap((item) => isRecord(item) ? Object.keys(item) : []) : [];
      groups.get(tag).operations.push({ method, path, operationId: text(operation.operationId), summary: text(operation.summary), description: text(operation.description), deprecated: operation.deprecated === true, parameters: mergedParameters(pathParameters, parameterModels(document, operation.parameters)), requestBody: isRecord(body) ? { description: text(body.description), required: body.required === true, content: mediaModels(document, body.content) } : null, responses, security });
    }
  }
  const servers = Array.isArray(document.servers) ? document.servers.flatMap((server) => isRecord(server) && text(server.url) ? [{ url: server.url, description: text(server.description) }] : []) : [];
  return { description: text(document.info.description), servers, groups: [...groups.values()] };
}

function renderSchema(schema) {
  if (!schema) return "";
  const enumValues = schema.enumValues.length ? `<div class="nexus-openapi-export-enum">Allowed: ${schema.enumValues.map((item) => `<code>${escapeHtml(item)}</code>`).join(" ")}</div>` : "";
  const properties = schema.properties.length ? `<ul class="nexus-openapi-export-properties">${schema.properties.map((property) => `<li><code>${escapeHtml(property.name)}</code>${property.required ? " <strong>required</strong>" : ""} <span>— ${escapeHtml(property.schema.label)}</span>${property.schema.description ? `: ${escapeHtml(property.schema.description)}` : ""}${renderSchemaProperties(property.schema)}</li>`).join("")}</ul>` : "";
  return `<span class="nexus-openapi-export-schema"><code>${escapeHtml(schema.label)}</code>${schema.description ? ` — ${escapeHtml(schema.description)}` : ""}${enumValues}${properties}</span>`;
}

function renderSchemaProperties(schema) {
  return schema.properties.length ? `<ul class="nexus-openapi-export-properties">${schema.properties.map((property) => `<li><code>${escapeHtml(property.name)}</code>${property.required ? " <strong>required</strong>" : ""} — ${escapeHtml(property.schema.label)}</li>`).join("")}</ul>` : "";
}

function renderMedia(media) {
  return `<div class="nexus-openapi-export-media"><div><code>${escapeHtml(media.mediaType)}</code></div>${renderSchema(media.schema)}${media.example ? `<pre><code>${escapeHtml(media.example)}</code></pre>` : ""}</div>`;
}

function renderOperation(operation) {
  const parameters = operation.parameters.length ? `<section><h5>Parameters</h5><table><thead><tr><th>Name</th><th>Location</th><th>Description</th></tr></thead><tbody>${operation.parameters.map((parameter) => `<tr><td><code>${escapeHtml(parameter.name)}</code>${parameter.required ? " <strong>required</strong>" : ""}</td><td>${escapeHtml(parameter.location)}</td><td>${escapeHtml(parameter.description)}${renderSchema(parameter.schema)}${parameter.example ? `<pre><code>${escapeHtml(parameter.example)}</code></pre>` : ""}</td></tr>`).join("")}</tbody></table></section>` : "";
  const body = operation.requestBody ? `<section><h5>Request body${operation.requestBody.required ? " <strong>required</strong>" : ""}</h5>${operation.requestBody.description ? `<p>${escapeHtml(operation.requestBody.description)}</p>` : ""}${operation.requestBody.content.map(renderMedia).join("")}</section>` : "";
  const security = operation.security.length ? `<p class="nexus-openapi-export-security"><strong>Security:</strong> ${operation.security.map(escapeHtml).join(", ")}</p>` : "";
  const responses = operation.responses.length ? `<section><h5>Responses</h5>${operation.responses.map((response) => `<div class="nexus-openapi-export-response"><strong>${escapeHtml(response.status)}</strong>${response.description ? ` — ${escapeHtml(response.description)}` : ""}${response.content.map(renderMedia).join("")}</div>`).join("")}</section>` : "";
  return `<article class="nexus-openapi-export-operation nexus-openapi-export-${escapeHtml(operation.method)}"><header><span class="nexus-openapi-export-method">${escapeHtml(operation.method.toUpperCase())}</span><code class="nexus-openapi-export-path">${escapeHtml(operation.path)}</code>${operation.summary ? `<span>${escapeHtml(operation.summary)}</span>` : ""}${operation.deprecated ? " <strong>deprecated</strong>" : ""}</header><div class="nexus-openapi-export-operation-body">${operation.operationId ? `<p><strong>Operation:</strong> <code>${escapeHtml(operation.operationId)}</code></p>` : ""}${operation.description ? `<p>${escapeHtml(operation.description)}</p>` : ""}${security}${parameters}${body}${responses}</div></article>`;
}

function renderOpenApiExport(source) {
  const document = parseOpenApi(source);
  if (!document) return null;
  const reference = buildReference(document);
  const info = document.info;
  return `<section class="nexus-openapi-export" aria-label="OpenAPI reference"><header class="nexus-openapi-export-title"><div><h3>${escapeHtml(info.title)}</h3><p><code>OpenAPI ${escapeHtml(document.openapi)}</code> <span>Version ${escapeHtml(info.version)}</span></p>${reference.description ? `<p>${escapeHtml(reference.description)}</p>` : ""}</div></header>${reference.servers.length ? `<section class="nexus-openapi-export-servers"><h4>Servers</h4><ul>${reference.servers.map((server) => `<li><code>${escapeHtml(server.url)}</code>${server.description ? ` — ${escapeHtml(server.description)}` : ""}</li>`).join("")}</ul></section>` : ""}${reference.groups.map((group) => `<section class="nexus-openapi-export-group"><h4>${escapeHtml(group.name)}</h4>${group.description ? `<p>${escapeHtml(group.description)}</p>` : ""}${group.operations.map(renderOperation).join("")}</section>`).join("")}</section>`;
}

module.exports = { isOpenApiExportFence, renderOpenApiExport };
