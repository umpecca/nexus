import { isRecord, type OpenApiObject } from "./openapiYaml";

export const DEFAULT_REQUEST_MEDIA_TYPE = "application/json";
export const CUSTOM_REQUEST_MEDIA_TYPE = "__custom";

export const REQUEST_MEDIA_TYPE_OPTIONS = [
  { value: "application/json", label: "JSON", guidance: "Structured JSON payloads—the usual choice for API request data." },
  { value: "application/x-www-form-urlencoded", label: "Form fields", guidance: "Standard browser-style text fields submitted as name/value pairs." },
  { value: "multipart/form-data", label: "Form with file upload", guidance: "Use for forms that include files. Add a file field as type string with format binary." },
  { value: "text/plain", label: "Plain text", guidance: "A single unstructured text payload." },
  { value: "application/xml", label: "XML", guidance: "XML request documents for APIs that accept XML." }
] as const;

export function requestMediaTypeOption(mediaType: string) {
  return REQUEST_MEDIA_TYPE_OPTIONS.some((option) => option.value === mediaType)
    ? mediaType
    : CUSTOM_REQUEST_MEDIA_TYPE;
}

export function requestMediaTypeGuidance(option: string) {
  return REQUEST_MEDIA_TYPE_OPTIONS.find((item) => item.value === option)?.guidance
    ?? "Use a custom media type when your API expects a vendor-specific or otherwise non-standard payload.";
}

function recordAt(parent: OpenApiObject, key: string): OpenApiObject {
  if (!isRecord(parent[key])) parent[key] = {};
  return parent[key] as OpenApiObject;
}

function requestContent(requestBody: OpenApiObject) {
  return recordAt(requestBody, "content");
}

export function addOpenApiRequestBody(operation: OpenApiObject) {
  if (isRecord(operation.requestBody)) return operation.requestBody as OpenApiObject;
  operation.requestBody = {
    required: false,
    content: {
      [DEFAULT_REQUEST_MEDIA_TYPE]: {
        schema: { type: "object", properties: {} }
      }
    }
  };
  return operation.requestBody as OpenApiObject;
}

export function addOpenApiRequestMediaType(requestBody: OpenApiObject) {
  const content = requestContent(requestBody);
  let mediaType = DEFAULT_REQUEST_MEDIA_TYPE;
  let suffix = 2;
  while (content[mediaType]) mediaType = `${DEFAULT_REQUEST_MEDIA_TYPE}+${suffix++}`;
  content[mediaType] = { schema: { type: "object", properties: {} } };
  return mediaType;
}

export function renameOpenApiRequestMediaType(requestBody: OpenApiObject, from: string, to: string) {
  const content = requestContent(requestBody);
  const next = to.trim();
  if (!next || from === next || !(from in content) || next in content) return false;
  content[next] = content[from];
  delete content[from];
  return true;
}

export function removeOpenApiRequestMediaType(requestBody: OpenApiObject, mediaType: string) {
  delete requestContent(requestBody)[mediaType];
}

export function setOpenApiRequestSchemaReference(media: OpenApiObject, schemaName: string) {
  media.schema = { $ref: `#/components/schemas/${schemaName.replace(/~/g, "~0").replace(/\//g, "~1")}` };
}

export function setOpenApiInlineRequestSchema(media: OpenApiObject) {
  if (isRecord(media.schema) && typeof media.schema.$ref !== "string") {
    const schema = media.schema as OpenApiObject;
    if (!isRecord(schema.properties)) schema.properties = {};
    if (schema.type !== "object") schema.type = "object";
    return schema;
  }
  media.schema = { type: "object", properties: {} };
  return media.schema as OpenApiObject;
}

export function addOpenApiInlineRequestProperty(schema: OpenApiObject) {
  const properties = recordAt(schema, "properties");
  let name = "property";
  let suffix = 2;
  while (properties[name]) name = `property${suffix++}`;
  properties[name] = { type: "string" };
  return name;
}

export function renameOpenApiInlineRequestProperty(schema: OpenApiObject, from: string, to: string) {
  const properties = recordAt(schema, "properties");
  const next = to.trim();
  if (!next || from === next || !(from in properties) || next in properties) return false;
  properties[next] = properties[from];
  delete properties[from];
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.map((entry) => entry === from ? next : entry);
  }
  return true;
}

export function setOpenApiInlineRequestPropertyRequired(schema: OpenApiObject, name: string, required: boolean) {
  const next = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === "string" && entry !== name)
    : [];
  if (required) next.push(name);
  if (next.length) schema.required = next; else delete schema.required;
}

export function removeOpenApiInlineRequestProperty(schema: OpenApiObject, name: string) {
  delete recordAt(schema, "properties")[name];
  setOpenApiInlineRequestPropertyRequired(schema, name, false);
}

export function parseOpenApiJsonExample(source: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!source.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON example: ${error instanceof Error ? error.message : "Unable to parse JSON."}`
    };
  }
}
