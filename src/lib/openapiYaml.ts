import { parse, stringify } from "yaml";

export type OpenApiObject = Record<string, unknown>;

export type OpenApiSummary = {
  title: string;
  version: string;
  openapiVersion: string;
  routeCount: number;
  schemaCount: number;
};

export type OpenApiSchemaPreview = {
  label: string;
  description: string;
  enumValues: string[];
  properties: Array<{
    name: string;
    required: boolean;
    schema: OpenApiSchemaPreview;
  }>;
};

export type OpenApiMediaPreview = {
  mediaType: string;
  schema: OpenApiSchemaPreview | null;
  example: string;
};

export type OpenApiParameterPreview = {
  name: string;
  location: string;
  description: string;
  required: boolean;
  deprecated: boolean;
  schema: OpenApiSchemaPreview | null;
  example: string;
};

export type OpenApiOperationPreview = {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  deprecated: boolean;
  parameters: OpenApiParameterPreview[];
  requestBody: {
    description: string;
    required: boolean;
    content: OpenApiMediaPreview[];
  } | null;
  responses: Array<{
    status: string;
    description: string;
    content: OpenApiMediaPreview[];
  }>;
  security: string[];
};

export type OpenApiReferencePreview = {
  description: string;
  servers: Array<{ url: string; description: string }>;
  groups: Array<{
    name: string;
    description: string;
    operations: OpenApiOperationPreview[];
  }>;
};

export type OpenApiParseResult =
  | { ok: true; document: OpenApiObject; warning: string | null }
  | { ok: false; error: string };

export const OPENAPI_BLOCK_LANGUAGE = "yaml";
export const OPENAPI_BLOCK_META = "openapi";
export const DEFAULT_OPENAPI_YAML = `openapi: 3.0.3
info:
  title: New API
  version: 1.0.0
paths: {}
`;

export function isRecord(value: unknown): value is OpenApiObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isOpenApiCodeBlock(language: string | null | undefined, meta: string | null | undefined) {
  const normalizedLanguage = (language ?? "").trim().toLowerCase();
  const metaTokens = (meta ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return (normalizedLanguage === "yaml" || normalizedLanguage === "yml") && metaTokens.includes("openapi");
}

export function parseOpenApiYaml(source: string): OpenApiParseResult {
  let value: unknown;
  try {
    value = parse(source);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid YAML: ${error instanceof Error ? error.message : "Unable to parse the document."}`
    };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "The OpenAPI document must be a YAML object." };
  }
  if (typeof value.openapi !== "string" || !/^3(?:\.|$)/.test(value.openapi)) {
    return { ok: false, error: 'The document must declare an OpenAPI 3.x version in "openapi".' };
  }
  if (!isRecord(value.info)) {
    return { ok: false, error: 'The document is missing the required "info" object.' };
  }
  if (typeof value.info.title !== "string" || !value.info.title.trim()) {
    return { ok: false, error: 'The document is missing the required "info.title" value.' };
  }
  if (typeof value.info.version !== "string" || !value.info.version.trim()) {
    return { ok: false, error: 'The document is missing the required "info.version" value.' };
  }
  if (!isRecord(value.paths)) {
    return { ok: false, error: 'The document is missing the required "paths" object.' };
  }

  return {
    ok: true,
    document: value,
    warning: value.openapi.startsWith("3.1")
      ? "OpenAPI 3.1 detected. Nexus edits the fields supported by the visual editor and preserves all other fields unchanged."
      : null
  };
}

export function serializeOpenApiYaml(document: OpenApiObject): string {
  return stringify(document, { indent: 2, lineWidth: 0 }).trimEnd() + "\n";
}

export function summarizeOpenApi(document: OpenApiObject): OpenApiSummary {
  const info = isRecord(document.info) ? document.info : {};
  const paths = isRecord(document.paths) ? document.paths : {};
  const schemas =
    isRecord(document.components) && isRecord(document.components.schemas)
      ? document.components.schemas
      : {};
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  let routeCount = 0;
  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) continue;
    routeCount += Object.keys(pathItem).filter((key) => methods.has(key.toLowerCase())).length;
  }
  return {
    title: typeof info.title === "string" ? info.title : "Untitled API",
    version: typeof info.version === "string" ? info.version : "",
    openapiVersion: typeof document.openapi === "string" ? document.openapi : "",
    routeCount,
    schemaCount: Object.keys(schemas).length
  };
}

const OPENAPI_HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function exampleValue(value: unknown) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    const rendered = JSON.stringify(value, null, 2);
    return rendered.length > 800 ? `${rendered.slice(0, 797)}...` : rendered;
  } catch {
    return String(value);
  }
}

function decodeJsonPointerSegment(value: string) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveLocalReference(document: OpenApiObject, value: unknown): OpenApiObject | null {
  if (!isRecord(value)) return null;
  if (typeof value.$ref !== "string" || !value.$ref.startsWith("#/")) return value;
  let current: unknown = document;
  for (const segment of value.$ref.slice(2).split("/").map(decodeJsonPointerSegment)) {
    if (!isRecord(current) || !(segment in current)) return value;
    current = current[segment];
  }
  return isRecord(current) ? current : value;
}

function referenceName(value: OpenApiObject) {
  if (typeof value.$ref !== "string") return "";
  const segments = value.$ref.split("/");
  return decodeJsonPointerSegment(segments.at(-1) ?? "");
}

function buildSchemaPreview(
  document: OpenApiObject,
  value: unknown,
  depth = 0,
  visitedReferences = new Set<string>()
): OpenApiSchemaPreview | null {
  if (!isRecord(value)) return null;
  const ref = typeof value.$ref === "string" ? value.$ref : "";
  const resolved = resolveLocalReference(document, value) ?? value;
  const refName = referenceName(value);
  const nextVisited = new Set(visitedReferences);
  if (ref) nextVisited.add(ref);

  let label = refName;
  const type = textValue(resolved.type);
  const format = textValue(resolved.format);
  if (!label && type === "array") {
    const item = buildSchemaPreview(document, resolved.items, depth + 1, nextVisited);
    label = `${item?.label || "value"}[]`;
  }
  if (!label && type) label = format ? `${type} (${format})` : type;
  if (!label && isRecord(resolved.properties)) label = "object";
  if (!label) {
    for (const composition of ["oneOf", "anyOf", "allOf"] as const) {
      if (!Array.isArray(resolved[composition])) continue;
      const labels = resolved[composition]
        .map((entry) => buildSchemaPreview(document, entry, depth + 1, nextVisited)?.label)
        .filter(Boolean);
      if (labels.length) label = `${composition}: ${labels.join(" | ")}`;
      break;
    }
  }
  if (!label) label = "value";
  if (resolved.nullable === true) label += " or null";

  const required = new Set(Array.isArray(resolved.required) ? resolved.required.filter((item): item is string => typeof item === "string") : []);
  const properties: OpenApiSchemaPreview["properties"] = [];
  const canExpand = depth < 2 && (!ref || !visitedReferences.has(ref));
  if (canExpand && isRecord(resolved.properties)) {
    for (const [name, property] of Object.entries(resolved.properties)) {
      const schema = buildSchemaPreview(document, property, depth + 1, nextVisited);
      if (schema) properties.push({ name, required: required.has(name), schema });
    }
  }

  return {
    label,
    description: textValue(resolved.description),
    enumValues: Array.isArray(resolved.enum) ? resolved.enum.map(exampleValue) : [],
    properties
  };
}

function readMediaContent(document: OpenApiObject, value: unknown): OpenApiMediaPreview[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([mediaType, media]) => {
    if (!isRecord(media)) return [];
    const example = media.example !== undefined
      ? exampleValue(media.example)
      : isRecord(media.examples)
        ? exampleValue(Object.values(media.examples)[0])
        : "";
    return [{ mediaType, schema: buildSchemaPreview(document, media.schema), example }];
  });
}

function readParameters(document: OpenApiObject, value: unknown): OpenApiParameterPreview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parameter = resolveLocalReference(document, entry);
    if (!parameter) return [];
    const name = textValue(parameter.name);
    const location = textValue(parameter.in);
    if (!name || !location) return [];
    return [{
      name,
      location,
      description: textValue(parameter.description),
      required: parameter.required === true || location === "path",
      deprecated: parameter.deprecated === true,
      schema: buildSchemaPreview(document, parameter.schema),
      example: exampleValue(parameter.example)
    }];
  });
}

function mergeParameters(pathParameters: OpenApiParameterPreview[], operationParameters: OpenApiParameterPreview[]) {
  const merged = new Map<string, OpenApiParameterPreview>();
  pathParameters.forEach((parameter) => merged.set(`${parameter.location}:${parameter.name}`, parameter));
  operationParameters.forEach((parameter) => merged.set(`${parameter.location}:${parameter.name}`, parameter));
  return [...merged.values()];
}

/** Build the read-only API-reference model shown inside a rich-text OpenAPI block. */
export function buildOpenApiReferencePreview(document: OpenApiObject): OpenApiReferencePreview {
  const info = isRecord(document.info) ? document.info : {};
  const servers = Array.isArray(document.servers)
    ? document.servers.flatMap((entry) => isRecord(entry) && typeof entry.url === "string"
      ? [{ url: entry.url, description: textValue(entry.description) }]
      : [])
    : [];
  const tagDescriptions = new Map<string, string>();
  if (Array.isArray(document.tags)) {
    document.tags.forEach((tag) => {
      if (isRecord(tag) && typeof tag.name === "string") tagDescriptions.set(tag.name, textValue(tag.description));
    });
  }

  const groups = new Map<string, OpenApiReferencePreview["groups"][number]>();
  const paths = isRecord(document.paths) ? document.paths : {};
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = resolveLocalReference(document, rawPathItem);
    if (!pathItem) continue;
    const pathParameters = readParameters(document, pathItem.parameters);
    for (const method of OPENAPI_HTTP_METHODS) {
      if (!isRecord(pathItem[method])) continue;
      const operation = pathItem[method] as OpenApiObject;
      const tag = Array.isArray(operation.tags) && typeof operation.tags[0] === "string"
        ? operation.tags[0]
        : "Default";
      if (!groups.has(tag)) {
        groups.set(tag, { name: tag, description: tagDescriptions.get(tag) ?? "", operations: [] });
      }

      const requestBody = resolveLocalReference(document, operation.requestBody);
      const responses = isRecord(operation.responses)
        ? Object.entries(operation.responses).flatMap(([status, rawResponse]) => {
          const response = resolveLocalReference(document, rawResponse);
          return response ? [{
            status,
            description: textValue(response.description),
            content: readMediaContent(document, response.content)
          }] : [];
        })
        : [];
      const security = Array.isArray(operation.security)
        ? operation.security.flatMap((requirement) => isRecord(requirement) ? Object.keys(requirement) : [])
        : [];

      groups.get(tag)?.operations.push({
        method,
        path,
        operationId: textValue(operation.operationId),
        summary: textValue(operation.summary),
        description: textValue(operation.description),
        deprecated: operation.deprecated === true,
        parameters: mergeParameters(pathParameters, readParameters(document, operation.parameters)),
        requestBody: requestBody ? {
          description: textValue(requestBody.description),
          required: requestBody.required === true,
          content: readMediaContent(document, requestBody.content)
        } : null,
        responses,
        security
      });
    }
  }

  return { description: textValue(info.description), servers, groups: [...groups.values()] };
}

export function cloneOpenApiDocument(document: OpenApiObject): OpenApiObject {
  return structuredClone(document);
}

function jsonPointerSegment(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function visitOpenApi(value: unknown, visitor: (object: OpenApiObject) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitOpenApi(item, visitor));
    return;
  }
  if (!isRecord(value)) return;
  visitor(value);
  Object.values(value).forEach((item) => visitOpenApi(item, visitor));
}

/** Move a complete schema node and update every local component reference without touching unknown fields. */
export function renameOpenApiSchema(document: OpenApiObject, from: string, to: string) {
  const components = recordAtForMutation(document, "components");
  const schemas = recordAtForMutation(components, "schemas");
  if (!(from in schemas) || !to || from === to) return;
  schemas[to] = schemas[from];
  delete schemas[from];
  const oldRef = `#/components/schemas/${jsonPointerSegment(from)}`;
  const newRef = `#/components/schemas/${jsonPointerSegment(to)}`;
  visitOpenApi(document, (object) => {
    if (object.$ref === oldRef) object.$ref = newRef;
  });
}

/** Move a security scheme and update global/operation security requirement object keys. */
export function renameOpenApiSecurityScheme(document: OpenApiObject, from: string, to: string) {
  const schemes = recordAtForMutation(recordAtForMutation(document, "components"), "securitySchemes");
  if (!(from in schemes) || !to || from === to) return;
  schemes[to] = schemes[from];
  delete schemes[from];
  visitOpenApi(document, (object) => {
    const requirements = object.security;
    if (!Array.isArray(requirements)) return;
    requirements.forEach((requirement) => {
      if (!isRecord(requirement) || !(from in requirement)) return;
      requirement[to] = requirement[from];
      delete requirement[from];
    });
  });
}

export function renameOpenApiTag(document: OpenApiObject, from: string, to: string) {
  if (!to || from === to) return;
  visitOpenApi(document, (object) => {
    if (!Array.isArray(object.tags)) return;
    object.tags = object.tags.map((tag) => tag === from ? to : tag);
  });
  if (Array.isArray(document.tags)) {
    document.tags.forEach((tag) => {
      if (isRecord(tag) && tag.name === from) tag.name = to;
    });
  }
}

function recordAtForMutation(parent: OpenApiObject, key: string): OpenApiObject {
  if (!isRecord(parent[key])) parent[key] = {};
  return parent[key] as OpenApiObject;
}
