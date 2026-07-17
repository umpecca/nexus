import { useCallback, useState, useEffect, type ChangeEvent, type ReactNode } from "react";
import {
  DEFAULT_OPENAPI_YAML,
  cloneOpenApiDocument,
  isRecord,
  parseOpenApiYaml,
  renameOpenApiSchema,
  renameOpenApiSecurityScheme,
  renameOpenApiTag,
  serializeOpenApiYaml,
  summarizeOpenApi,
  type OpenApiObject
} from "../lib/openapiYaml";
import {
  addOpenApiInlineRequestProperty,
  addOpenApiRequestBody,
  addOpenApiRequestMediaType,
  CUSTOM_REQUEST_MEDIA_TYPE,
  parseOpenApiJsonExample,
  removeOpenApiInlineRequestProperty,
  removeOpenApiRequestMediaType,
  renameOpenApiInlineRequestProperty,
  renameOpenApiRequestMediaType,
  setOpenApiInlineRequestPropertyRequired,
  setOpenApiInlineRequestSchema,
  setOpenApiRequestSchemaReference,
  requestMediaTypeGuidance,
  requestMediaTypeOption,
  REQUEST_MEDIA_TYPE_OPTIONS
} from "../lib/openapiRequestBody";

type Tab = "routes" | "schemas" | "settings";
type History = { past: OpenApiObject[]; current: OpenApiObject; future: OpenApiObject[] };
type RouteRef = { path: string; method: string };
const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

function recordAt(parent: OpenApiObject, key: string): OpenApiObject {
  if (!isRecord(parent[key])) parent[key] = {};
  return parent[key] as OpenApiObject;
}

function arrayAt(parent: OpenApiObject, key: string): unknown[] {
  if (!Array.isArray(parent[key])) parent[key] = [];
  return parent[key] as unknown[];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "field field-wide" : "field"}><span>{label}</span>{children}</label>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function OpenApiHostApp() {
  const [history, setHistory] = useState<History | null>(null);
  const [tab, setTab] = useState<Tab>("routes");
  const [routeRef, setRouteRef] = useState<RouteRef | null>(null);
  const [schemaName, setSchemaName] = useState<string | null>(null);
  const [showYaml, setShowYaml] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const loadYaml = useCallback((yaml: string) => {
    const result = parseOpenApiYaml(yaml);
    if (!result.ok) {
      setError(result.error);
      setImportText(yaml);
      return false;
    }
    setHistory({ past: [], current: result.document, future: [] });
    setWarning(result.warning);
    setError(null);
    setShowImport(false);
    setRouteRef(null);
    setSchemaName(null);
    return true;
  }, []);

  useEffect(() => {
    const bridge = window.nexusOpenApiHost;
    if (!bridge) {
      loadYaml(DEFAULT_OPENAPI_YAML);
      return;
    }
    bridge.onInit(({ yaml, theme }) => {
      document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
      loadYaml(yaml || DEFAULT_OPENAPI_YAML);
    });
    bridge.ready();
  }, [loadYaml]);

  function update(mutator: (draft: OpenApiObject) => void) {
    setHistory((value) => {
      if (!value) return value;
      const next = cloneOpenApiDocument(value.current);
      mutator(next);
      return { past: [...value.past, value.current], current: next, future: [] };
    });
  }

  function undo() {
    setHistory((value) => {
      if (!value || value.past.length === 0) return value;
      return {
        past: value.past.slice(0, -1),
        current: value.past[value.past.length - 1],
        future: [value.current, ...value.future]
      };
    });
  }

  function redo() {
    setHistory((value) => {
      if (!value || value.future.length === 0) return value;
      return {
        past: [...value.past, value.current],
        current: value.future[0],
        future: value.future.slice(1)
      };
    });
  }

  function save() {
    if (!history) return;
    const yaml = serializeOpenApiYaml(history.current);
    const checked = parseOpenApiYaml(yaml);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    window.nexusOpenApiHost?.save({ yaml });
  }

  function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => setError("The selected file could not be read.");
    reader.readAsText(file);
    event.target.value = "";
  }

  if (!history) {
    return (
      <main className="load-error">
        <h1>OpenAPI Editor</h1>
        <p>{error ?? "Loading specification…"}</p>
        <textarea value={importText} onChange={(event) => setImportText(event.target.value)} />
        <div className="actions"><button onClick={() => loadYaml(importText)}>Try this YAML</button><button onClick={() => window.nexusOpenApiHost?.cancel()}>Cancel</button></div>
      </main>
    );
  }

  const doc = history.current;
  const summary = summarizeOpenApi(doc);
  return (
    <div className="openapi-app">
      <header className="topbar">
        <div className="brand"><strong>OpenAPI Editor</strong><span>{summary.title} · v{summary.version}</span></div>
        <div className="toolbar">
          <button disabled={!history.past.length} onClick={undo}>Undo</button>
          <button disabled={!history.future.length} onClick={redo}>Redo</button>
          <button onClick={() => setShowImport(true)}>Import</button>
          <button className={showYaml ? "active" : ""} onClick={() => setShowYaml((value) => !value)}>YAML</button>
          <button className="primary" onClick={save}>Save</button>
          <button onClick={() => window.nexusOpenApiHost?.cancel()}>Cancel</button>
        </div>
      </header>
      {warning ? <div className="warning">{warning}</div> : null}
      {error ? <div className="error-banner">{error}<button onClick={() => setError(null)}>Dismiss</button></div> : null}
      <div className="workspace">
        <aside className="sidebar">
          <nav className="tabs">
            <button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>Routes</button>
            <button className={tab === "schemas" ? "active" : ""} onClick={() => setTab("schemas")}>Schemas</button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Settings</button>
          </nav>
          {tab === "routes" ? <RouteList document={doc} selected={routeRef} onSelect={setRouteRef} onUpdate={update} /> : null}
          {tab === "schemas" ? <SchemaList document={doc} selected={schemaName} onSelect={setSchemaName} onUpdate={update} /> : null}
          {tab === "settings" ? <div className="sidebar-note">API metadata, servers, tags, and security schemes.</div> : null}
        </aside>
        <section className="editor-pane">
          {tab === "routes" ? (routeRef ? <RouteEditor document={doc} selected={routeRef} onSelect={setRouteRef} onUpdate={update} /> : <Empty>Select or add a route.</Empty>) : null}
          {tab === "schemas" ? (schemaName ? <SchemaEditor document={doc} selected={schemaName} onSelect={setSchemaName} onUpdate={update} /> : <Empty>Select or add a schema.</Empty>) : null}
          {tab === "settings" ? <SettingsEditor document={doc} onUpdate={update} /> : null}
        </section>
        {showYaml ? <aside className="yaml-pane"><div className="pane-heading">OpenAPI YAML</div><pre>{serializeOpenApiYaml(doc)}</pre></aside> : null}
      </div>
      {showImport ? (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>Import OpenAPI YAML or JSON</h2>
            <p>Paste a specification or load a local file. Import replaces the current visual draft only after it validates.</p>
            <input type="file" accept=".yaml,.yml,.json,application/json,text/yaml" onChange={onImportFile} />
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste OpenAPI YAML here…" />
            <div className="actions"><button className="primary" onClick={() => loadYaml(importText)}>Import</button><button onClick={() => setShowImport(false)}>Cancel</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function routeEntries(document: OpenApiObject): RouteRef[] {
  const paths = isRecord(document.paths) ? document.paths : {};
  return Object.entries(paths).flatMap(([path, item]) =>
    isRecord(item) ? METHODS.filter((method) => isRecord(item[method])).map((method) => ({ path, method })) : []
  );
}

function RouteList({ document, selected, onSelect, onUpdate }: { document: OpenApiObject; selected: RouteRef | null; onSelect: (value: RouteRef | null) => void; onUpdate: (mutator: (draft: OpenApiObject) => void) => void }) {
  const [path, setPath] = useState("/");
  const [method, setMethod] = useState("get");
  const routes = routeEntries(document);
  function add() {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    onUpdate((draft) => {
      const paths = recordAt(draft, "paths");
      const item = recordAt(paths, normalized);
      if (!isRecord(item[method])) item[method] = { responses: { "200": { description: "Successful response" } } };
    });
    onSelect({ path: normalized, method });
  }
  return <div className="list-panel"><div className="add-row"><input value={path} onChange={(e) => setPath(e.target.value)} /><select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select><button onClick={add}>Add</button></div>{routes.map((route) => <button className={selected?.path === route.path && selected.method === route.method ? "list-item selected" : "list-item"} key={`${route.method}:${route.path}`} onClick={() => onSelect(route)}><b className={`method method-${route.method}`}>{route.method}</b><span>{route.path}</span></button>)}</div>;
}

function RouteEditor({ document, selected, onSelect, onUpdate }: { document: OpenApiObject; selected: RouteRef; onSelect: (value: RouteRef | null) => void; onUpdate: (mutator: (draft: OpenApiObject) => void) => void }) {
  const paths = isRecord(document.paths) ? document.paths : {};
  const item = isRecord(paths[selected.path]) ? paths[selected.path] as OpenApiObject : null;
  const operation = item && isRecord(item[selected.method]) ? item[selected.method] as OpenApiObject : null;
  if (!operation) return <Empty>The selected route no longer exists.</Empty>;
  const responses = isRecord(operation.responses) ? operation.responses : {};
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  const change = (key: string, value: unknown) => onUpdate((draft) => {
    const op = recordAt(recordAt(recordAt(draft, "paths"), selected.path), selected.method);
    if (value === "" || value === false) delete op[key]; else op[key] = value;
  });
  function renamePath(nextPath: string) {
    if (!nextPath || nextPath === selected.path) return;
    const normalized = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
    onUpdate((draft) => {
      const draftPaths = recordAt(draft, "paths");
      const source = draftPaths[selected.path];
      delete draftPaths[selected.path];
      draftPaths[normalized] = source;
    });
    onSelect({ ...selected, path: normalized });
  }
  function remove() {
    onUpdate((draft) => {
      const draftPaths = recordAt(draft, "paths");
      const pathItem = recordAt(draftPaths, selected.path);
      delete pathItem[selected.method];
      if (!Object.keys(pathItem).some((key) => METHODS.includes(key))) delete draftPaths[selected.path];
    });
    onSelect(null);
  }
  const updateOperation = (mutator: (operation: OpenApiObject) => void) => onUpdate((draft) => {
    mutator(recordAt(recordAt(recordAt(draft, "paths"), selected.path), selected.method));
  });
  return (
    <div className="form-page">
      <div className="page-title"><div><span className={`method method-${selected.method}`}>{selected.method}</span><h1>{selected.path}</h1></div><button className="danger" onClick={remove}>Delete route</button></div>
      <div className="form-grid">
        <Field label="Path"><input defaultValue={selected.path} onBlur={(e) => renamePath(e.target.value)} /></Field>
        <Field label="Operation ID"><input value={text(operation.operationId)} onChange={(e) => change("operationId", e.target.value)} /></Field>
        <Field label="Summary" wide><input value={text(operation.summary)} onChange={(e) => change("summary", e.target.value)} /></Field>
        <Field label="Description" wide><textarea value={text(operation.description)} onChange={(e) => change("description", e.target.value)} /></Field>
        <Field label="Tags" wide><input value={Array.isArray(operation.tags) ? operation.tags.join(", ") : ""} onChange={(e) => change("tags", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></Field>
        <Field label="Deprecated"><input type="checkbox" checked={operation.deprecated === true} onChange={(e) => change("deprecated", e.target.checked)} /></Field>
      </div>
      <Section title="Parameters" onAdd={() => updateOperation((op) => arrayAt(op, "parameters").push({ name: "parameter", in: "query", required: false, schema: { type: "string" } }))}>
        {parameters.map((parameter, index) => <ParameterRow key={index} parameter={isRecord(parameter) ? parameter : {}} onChange={(mutator) => updateOperation((op) => { const params = arrayAt(op, "parameters"); if (!isRecord(params[index])) params[index] = {}; mutator(params[index] as OpenApiObject); })} onDelete={() => updateOperation((op) => arrayAt(op, "parameters").splice(index, 1))} />)}
      </Section>
      <RequestBodyEditor document={document} requestBody={isRecord(operation.requestBody) ? operation.requestBody : null} onUpdate={updateOperation} />
      <Section title="Responses" onAdd={() => updateOperation((op) => { const map = recordAt(op, "responses"); let code = "200"; while (map[code]) code = String(Number(code) + 1); map[code] = { description: "Response" }; })}>
        {Object.entries(responses).map(([code, response]) => <ResponseRow key={code} code={code} response={isRecord(response) ? response : {}} onRename={(next) => updateOperation((op) => { const map = recordAt(op, "responses"); const value = map[code]; delete map[code]; map[next] = value; })} onChange={(key, value) => updateOperation((op) => { const target = recordAt(recordAt(op, "responses"), code); if (value === "") delete target[key]; else target[key] = value; })} onDelete={() => updateOperation((op) => { delete recordAt(op, "responses")[code]; })} />)}
      </Section>
    </div>
  );
}

function requestSchemaName(schema: OpenApiObject) {
  const ref = text(schema.$ref);
  const prefix = "#/components/schemas/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~") : "";
}

function formatJsonExample(value: unknown) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RequestBodyEditor({ document, requestBody, onUpdate }: { document: OpenApiObject; requestBody: OpenApiObject | null; onUpdate: (mutator: (operation: OpenApiObject) => void) => void }) {
  const [exampleErrors, setExampleErrors] = useState<Record<string, string>>({});
  const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
  const componentSchemas = isRecord(document.components) && isRecord(document.components.schemas) ? document.components.schemas : {};
  const bodyReference = requestBody ? text(requestBody.$ref) : "";
  const content = requestBody && isRecord(requestBody.content) ? requestBody.content : {};

  if (!requestBody) {
    return <Section title="Request body" onAdd={() => onUpdate((operation) => addOpenApiRequestBody(operation))}><p className="section-note">Add a JSON or other request payload for this operation.</p></Section>;
  }

  if (bodyReference) {
    return <section className="section"><div className="section-heading"><h2>Request body</h2><button className="danger subtle" onClick={() => onUpdate((operation) => { operation.requestBody = { required: false, content: { "application/json": { schema: { type: "object", properties: {} } } } }; })}>Replace reference</button></div><p className="section-note">This operation uses <code>{bodyReference}</code>. Replace it only when this route needs its own inline request body.</p></section>;
  }

  function updateBody(mutator: (body: OpenApiObject) => void) {
    onUpdate((operation) => mutator(addOpenApiRequestBody(operation)));
  }

  return (
    <section className="section request-body-section">
      <div className="section-heading"><h2>Request body</h2><div className="section-actions"><button onClick={() => updateBody((body) => addOpenApiRequestMediaType(body))}>Add media type</button><button className="danger subtle" onClick={() => onUpdate((operation) => { delete operation.requestBody; })}>Remove request body</button></div></div>
      <div className="request-body-details">
        <Field label="Description" wide><textarea value={text(requestBody.description)} onChange={(event) => updateBody((body) => { if (event.target.value) body.description = event.target.value; else delete body.description; })} /></Field>
        <label className="check"><input type="checkbox" checked={requestBody.required === true} onChange={(event) => updateBody((body) => { if (event.target.checked) body.required = true; else delete body.required; })} />Required</label>
      </div>
      <div className="section-content">
        {Object.entries(content).map(([mediaType, rawMedia]) => {
          const media = isRecord(rawMedia) ? rawMedia : {};
          const mediaChoice = requestMediaTypeOption(mediaType);
          const schema = isRecord(media.schema) ? media.schema : {};
          const referencedSchema = requestSchemaName(schema);
          const inlineSchema = referencedSchema ? null : schema;
          const properties = inlineSchema && isRecord(inlineSchema.properties) ? inlineSchema.properties : {};
          const required = inlineSchema && Array.isArray(inlineSchema.required) ? inlineSchema.required.filter((entry): entry is string => typeof entry === "string") : [];
          return (
            <div className="request-media-card" key={mediaType}>
              <div className="request-media-heading"><Field label="Payload format"><select aria-label="Request payload format" value={mediaChoice} onChange={(event) => { if (event.target.value === CUSTOM_REQUEST_MEDIA_TYPE) return; updateBody((body) => { if (!renameOpenApiRequestMediaType(body, mediaType, event.target.value)) setMediaErrors((errors) => ({ ...errors, [mediaType]: "That payload format is already present. Remove or rename the existing one first." })); }); }}>{REQUEST_MEDIA_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value={CUSTOM_REQUEST_MEDIA_TYPE}>Custom</option></select></Field><button className="danger subtle" onClick={() => updateBody((body) => removeOpenApiRequestMediaType(body, mediaType))}>Remove media type</button></div>
              <p className="media-guidance">{requestMediaTypeGuidance(mediaChoice)}</p>
              {mediaChoice === CUSTOM_REQUEST_MEDIA_TYPE ? <Field label="Custom media type" wide><input aria-label="Custom request media type" defaultValue={mediaType} placeholder="application/vnd.example+json" onBlur={(event) => { const next = event.target.value.trim(); if (!next) { setMediaErrors((errors) => ({ ...errors, [mediaType]: "Enter a custom media type or choose a standard payload format." })); return; } updateBody((body) => { if (renameOpenApiRequestMediaType(body, mediaType, next)) { setMediaErrors((errors) => { const copy = { ...errors }; delete copy[mediaType]; return copy; }); } else if (next !== mediaType) setMediaErrors((errors) => ({ ...errors, [mediaType]: "That media type is already present." })); }); }} /></Field> : null}
              {mediaErrors[mediaType] ? <p className="inline-error">{mediaErrors[mediaType]}</p> : null}
              <Field label="Schema"><select aria-label="Request body schema" value={referencedSchema || "__inline"} onChange={(event) => updateBody((body) => { const target = recordAt(recordAt(body, "content"), mediaType); if (event.target.value === "__inline") setOpenApiInlineRequestSchema(target); else setOpenApiRequestSchemaReference(target, event.target.value); })}><option value="__inline">Inline object</option>{Object.keys(componentSchemas).map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
              {inlineSchema ? <div className="inline-schema-editor"><div className="section-heading"><h3>Inline fields</h3><button onClick={() => updateBody((body) => addOpenApiInlineRequestProperty(setOpenApiInlineRequestSchema(recordAt(recordAt(body, "content"), mediaType))))}>Add field</button></div>{Object.entries(properties).map(([name, rawProperty]) => <PropertyRow key={name} name={name} property={isRecord(rawProperty) ? rawProperty : {}} required={required.includes(name)} onChange={(mutator) => updateBody((body) => mutator(recordAt(recordAt(setOpenApiInlineRequestSchema(recordAt(recordAt(body, "content"), mediaType)), "properties"), name)))} onRename={(next) => updateBody((body) => renameOpenApiInlineRequestProperty(setOpenApiInlineRequestSchema(recordAt(recordAt(body, "content"), mediaType)), name, next))} onRequired={(checked) => updateBody((body) => setOpenApiInlineRequestPropertyRequired(setOpenApiInlineRequestSchema(recordAt(recordAt(body, "content"), mediaType)), name, checked))} onDelete={() => updateBody((body) => removeOpenApiInlineRequestProperty(setOpenApiInlineRequestSchema(recordAt(recordAt(body, "content"), mediaType)), name))} />)}</div> : null}
              <Field label="JSON example" wide><textarea aria-label="Request body JSON example" defaultValue={formatJsonExample(media.example)} placeholder='{"key": "value"}' onBlur={(event) => { const parsed = parseOpenApiJsonExample(event.target.value); if (!parsed.ok) { setExampleErrors((errors) => ({ ...errors, [mediaType]: parsed.error })); return; } setExampleErrors((errors) => { const next = { ...errors }; delete next[mediaType]; return next; }); updateBody((body) => { const target = recordAt(recordAt(body, "content"), mediaType); if (parsed.value === undefined) delete target.example; else target.example = parsed.value; }); }} /></Field>
              {exampleErrors[mediaType] ? <p className="inline-error">{exampleErrors[mediaType]}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ParameterRow({ parameter, onChange, onDelete }: { parameter: OpenApiObject; onChange: (mutator: (draft: OpenApiObject) => void) => void; onDelete: () => void }) {
  const schema = isRecord(parameter.schema) ? parameter.schema : {};
  return <div className="row-card"><input aria-label="Parameter name" value={text(parameter.name)} onChange={(e) => onChange((p) => { p.name = e.target.value; })} /><select value={text(parameter.in) || "query"} onChange={(e) => onChange((p) => { p.in = e.target.value; })}>{["query", "path", "header", "cookie"].map((v) => <option key={v}>{v}</option>)}</select><select value={text(schema.type) || "string"} onChange={(e) => onChange((p) => { recordAt(p, "schema").type = e.target.value; })}>{["string", "integer", "number", "boolean", "array", "object"].map((v) => <option key={v}>{v}</option>)}</select><label className="check"><input type="checkbox" checked={parameter.required === true} onChange={(e) => onChange((p) => { p.required = e.target.checked; })} />Required</label><input aria-label="Parameter description" placeholder="Description" value={text(parameter.description)} onChange={(e) => onChange((p) => { p.description = e.target.value; })} /><button className="danger subtle" onClick={onDelete}>Remove</button></div>;
}

function ResponseRow({ code, response, onRename, onChange, onDelete }: { code: string; response: OpenApiObject; onRename: (next: string) => void; onChange: (key: string, value: unknown) => void; onDelete: () => void }) {
  return <div className="row-card"><input aria-label="Status code" className="status-code" defaultValue={code} onBlur={(e) => e.target.value && e.target.value !== code && onRename(e.target.value)} /><input aria-label="Response description" value={text(response.description)} onChange={(e) => onChange("description", e.target.value)} /><button className="danger subtle" onClick={onDelete}>Remove</button></div>;
}

function SchemaList({ document, selected, onSelect, onUpdate }: { document: OpenApiObject; selected: string | null; onSelect: (value: string | null) => void; onUpdate: (mutator: (draft: OpenApiObject) => void) => void }) {
  const schemas = isRecord(document.components) && isRecord(document.components.schemas) ? document.components.schemas : {};
  const [name, setName] = useState("NewSchema");
  function add() { const next = name.trim(); if (!next) return; onUpdate((draft) => { recordAt(recordAt(draft, "components"), "schemas")[next] = { type: "object", properties: {} }; }); onSelect(next); }
  return <div className="list-panel"><div className="add-row"><input value={name} onChange={(e) => setName(e.target.value)} /><button onClick={add}>Add</button></div>{Object.entries(schemas).map(([key, schema]) => <button className={selected === key ? "list-item selected" : "list-item"} key={key} onClick={() => onSelect(key)}><b className="schema-icon">S</b><span>{key}</span><small>{isRecord(schema) ? text(schema.type) || "schema" : "schema"}</small></button>)}</div>;
}

function SchemaEditor({ document, selected, onSelect, onUpdate }: { document: OpenApiObject; selected: string; onSelect: (value: string | null) => void; onUpdate: (mutator: (draft: OpenApiObject) => void) => void }) {
  const schemas = isRecord(document.components) && isRecord(document.components.schemas) ? document.components.schemas : {};
  const schema = selected && isRecord(schemas[selected]) ? schemas[selected] as OpenApiObject : null;
  if (!schema) return <Empty>The selected schema no longer exists.</Empty>;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === "string") : [];
  const change = (key: string, value: unknown) => onUpdate((draft) => { const target = recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected); if (value === "") delete target[key]; else target[key] = value; });
  function rename(next: string) { if (!next || next === selected) return; onUpdate((draft) => renameOpenApiSchema(draft, selected, next)); onSelect(next); }
  function remove() { onUpdate((draft) => { delete recordAt(recordAt(draft, "components"), "schemas")[selected]; }); onSelect(null); }
  return <div className="form-page"><div className="page-title"><h1>{selected}</h1><button className="danger" onClick={remove}>Delete schema</button></div><div className="form-grid"><Field label="Name"><input defaultValue={selected} onBlur={(e) => rename(e.target.value.trim())} /></Field><Field label="Type"><select value={text(schema.type) || "object"} onChange={(e) => change("type", e.target.value)}>{["object", "array", "string", "number", "integer", "boolean"].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Description" wide><textarea value={text(schema.description)} onChange={(e) => change("description", e.target.value)} /></Field></div><Section title="Properties" onAdd={() => onUpdate((draft) => { const target = recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected); const map = recordAt(target, "properties"); let name = "property"; let n = 2; while (map[name]) name = `property${n++}`; map[name] = { type: "string" }; })}>{Object.entries(properties).map(([name, value]) => <PropertyRow key={name} name={name} property={isRecord(value) ? value : {}} required={required.includes(name)} onChange={(mutator) => onUpdate((draft) => { const target = recordAt(recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected), "properties"); const property = recordAt(target, name); mutator(property); })} onRename={(next) => onUpdate((draft) => { const target = recordAt(recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected), "properties"); const property = target[name]; delete target[name]; target[next] = property; const owner = recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected); if (Array.isArray(owner.required)) owner.required = owner.required.map((item) => item === name ? next : item); })} onRequired={(checked) => onUpdate((draft) => { const owner = recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected); const list = Array.isArray(owner.required) ? owner.required.filter((item): item is string => typeof item === "string" && item !== name) : []; if (checked) list.push(name); owner.required = list; })} onDelete={() => onUpdate((draft) => { const owner = recordAt(recordAt(recordAt(draft, "components"), "schemas"), selected); delete recordAt(owner, "properties")[name]; if (Array.isArray(owner.required)) owner.required = owner.required.filter((item) => item !== name); })} />)}</Section></div>;
}

function PropertyRow({ name, property, required, onChange, onRename, onRequired, onDelete }: { name: string; property: OpenApiObject; required: boolean; onChange: (mutator: (draft: OpenApiObject) => void) => void; onRename: (next: string) => void; onRequired: (checked: boolean) => void; onDelete: () => void }) {
  return <div className="row-card property-row"><input defaultValue={name} onBlur={(e) => e.target.value && e.target.value !== name && onRename(e.target.value)} /><select value={text(property.type) || "string"} onChange={(e) => onChange((p) => { p.type = e.target.value; })}>{["string", "integer", "number", "boolean", "array", "object"].map((v) => <option key={v}>{v}</option>)}</select><input placeholder="Format" value={text(property.format)} onChange={(e) => onChange((p) => { if (e.target.value) p.format = e.target.value; else delete p.format; })} /><label className="check"><input type="checkbox" checked={required} onChange={(e) => onRequired(e.target.checked)} />Required</label><input placeholder="Description" value={text(property.description)} onChange={(e) => onChange((p) => { p.description = e.target.value; })} /><button className="danger subtle" onClick={onDelete}>Remove</button></div>;
}

function SettingsEditor({ document, onUpdate }: { document: OpenApiObject; onUpdate: (mutator: (draft: OpenApiObject) => void) => void }) {
  const info = isRecord(document.info) ? document.info : {};
  const servers = Array.isArray(document.servers) ? document.servers : [];
  const tags = Array.isArray(document.tags) ? document.tags : [];
  const security = isRecord(document.components) && isRecord(document.components.securitySchemes) ? document.components.securitySchemes : {};
  const infoChange = (key: string, value: string) => onUpdate((draft) => { const target = recordAt(draft, "info"); if (value) target[key] = value; else delete target[key]; });
  return <div className="form-page"><div className="page-title"><h1>API settings</h1><span className="version-pill">OpenAPI {text(document.openapi)}</span></div><div className="form-grid"><Field label="Title"><input value={text(info.title)} onChange={(e) => infoChange("title", e.target.value)} /></Field><Field label="API version"><input value={text(info.version)} onChange={(e) => infoChange("version", e.target.value)} /></Field><Field label="Description" wide><textarea value={text(info.description)} onChange={(e) => infoChange("description", e.target.value)} /></Field><Field label="Terms of service" wide><input value={text(info.termsOfService)} onChange={(e) => infoChange("termsOfService", e.target.value)} /></Field></div><Section title="Servers" onAdd={() => onUpdate((draft) => { arrayAt(draft, "servers").push({ url: "https://api.example.com", description: "Production" }); })}>{servers.map((server, index) => { const value = isRecord(server) ? server : {}; return <div className="row-card" key={index}><input placeholder="URL" value={text(value.url)} onChange={(e) => onUpdate((draft) => { const list = arrayAt(draft, "servers"); if (!isRecord(list[index])) list[index] = {}; (list[index] as OpenApiObject).url = e.target.value; })} /><input placeholder="Description" value={text(value.description)} onChange={(e) => onUpdate((draft) => { const list = arrayAt(draft, "servers"); if (!isRecord(list[index])) list[index] = {}; (list[index] as OpenApiObject).description = e.target.value; })} /><button className="danger subtle" onClick={() => onUpdate((draft) => arrayAt(draft, "servers").splice(index, 1))}>Remove</button></div>; })}</Section><Section title="Tags" onAdd={() => onUpdate((draft) => { arrayAt(draft, "tags").push({ name: "tag", description: "" }); })}>{tags.map((tag, index) => { const value = isRecord(tag) ? tag : {}; const name = text(value.name); return <div className="row-card" key={`${name}:${index}`}><input placeholder="Name" defaultValue={name} onBlur={(e) => onUpdate((draft) => renameOpenApiTag(draft, name, e.target.value))} /><input placeholder="Description" value={text(value.description)} onChange={(e) => onUpdate((draft) => { const list = arrayAt(draft, "tags"); if (!isRecord(list[index])) list[index] = {}; (list[index] as OpenApiObject).description = e.target.value; })} /><button className="danger subtle" onClick={() => onUpdate((draft) => arrayAt(draft, "tags").splice(index, 1))}>Remove</button></div>; })}</Section><Section title="Security schemes" onAdd={() => onUpdate((draft) => { const map = recordAt(recordAt(draft, "components"), "securitySchemes"); let name = "ApiKey"; let n = 2; while (map[name]) name = `ApiKey${n++}`; map[name] = { type: "apiKey", in: "header", name: "X-API-Key" }; })}>{Object.entries(security).map(([name, scheme]) => <SecurityRow key={name} name={name} scheme={isRecord(scheme) ? scheme : {}} onUpdate={(mutator) => onUpdate((draft) => mutator(recordAt(recordAt(recordAt(draft, "components"), "securitySchemes"), name)))} onRename={(next) => onUpdate((draft) => renameOpenApiSecurityScheme(draft, name, next))} onDelete={() => onUpdate((draft) => { delete recordAt(recordAt(draft, "components"), "securitySchemes")[name]; })} />)}</Section></div>;
}

function SecurityRow({ name, scheme, onUpdate, onRename, onDelete }: { name: string; scheme: OpenApiObject; onUpdate: (mutator: (draft: OpenApiObject) => void) => void; onRename: (next: string) => void; onDelete: () => void }) {
  return <div className="row-card security-row"><input defaultValue={name} onBlur={(e) => e.target.value && e.target.value !== name && onRename(e.target.value)} /><select value={text(scheme.type) || "apiKey"} onChange={(e) => onUpdate((s) => { s.type = e.target.value; })}>{["apiKey", "http", "oauth2", "openIdConnect"].map((v) => <option key={v}>{v}</option>)}</select>{scheme.type === "apiKey" ? <><input placeholder="Header/query name" value={text(scheme.name)} onChange={(e) => onUpdate((s) => { s.name = e.target.value; })} /><select value={text(scheme.in) || "header"} onChange={(e) => onUpdate((s) => { s.in = e.target.value; })}><option>header</option><option>query</option><option>cookie</option></select></> : <input placeholder="Scheme / URL" value={text(scheme.scheme) || text(scheme.openIdConnectUrl)} onChange={(e) => onUpdate((s) => { if (s.type === "openIdConnect") s.openIdConnectUrl = e.target.value; else s.scheme = e.target.value; })} />}<button className="danger subtle" onClick={onDelete}>Remove</button></div>;
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: ReactNode }) {
  return <section className="section"><div className="section-heading"><h2>{title}</h2><button onClick={onAdd}>Add</button></div><div className="section-content">{children}</div></section>;
}
