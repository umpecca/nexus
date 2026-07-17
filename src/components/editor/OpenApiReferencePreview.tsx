import { LockKeyhole, Server } from "lucide-react";
import {
  buildOpenApiReferencePreview,
  type OpenApiMediaPreview,
  type OpenApiObject,
  type OpenApiSchemaPreview
} from "../../lib/openapiYaml";

function SchemaPreview({ schema }: { schema: OpenApiSchemaPreview }) {
  return (
    <div className="nexus-openapi-schema">
      <code>{schema.label}</code>
      {schema.description ? <span>{schema.description}</span> : null}
      {schema.enumValues.length ? <span>Allowed: {schema.enumValues.join(", ")}</span> : null}
      {schema.properties.length ? (
        <div className="nexus-openapi-properties">
          {schema.properties.map((property) => (
            <div className="nexus-openapi-property" key={property.name}>
              <div>
                <strong>{property.name}</strong>
                {property.required ? <em>required</em> : null}
              </div>
              <SchemaPreview schema={property.schema} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MediaPreview({ media }: { media: OpenApiMediaPreview }) {
  return (
    <div className="nexus-openapi-media">
      <span className="nexus-openapi-media-type">{media.mediaType}</span>
      {media.schema ? <SchemaPreview schema={media.schema} /> : null}
      {media.example ? <pre>{media.example}</pre> : null}
    </div>
  );
}

export function OpenApiReferencePreview({ document }: { document: OpenApiObject }) {
  const reference = buildOpenApiReferencePreview(document);

  return (
    <div className="nexus-openapi-reference" aria-label="OpenAPI reference preview">
      {reference.description ? <p className="nexus-openapi-description">{reference.description}</p> : null}
      {reference.servers.length ? (
        <section className="nexus-openapi-servers" aria-label="Servers">
          <h4><Server aria-hidden="true" /> Servers</h4>
          {reference.servers.map((server) => (
            <div key={server.url}>
              <code>{server.url}</code>
              {server.description ? <span>{server.description}</span> : null}
            </div>
          ))}
        </section>
      ) : null}

      {reference.groups.length ? reference.groups.map((group) => (
        <section className="nexus-openapi-tag" key={group.name}>
          <header>
            <h3>{group.name}</h3>
            {group.description ? <p>{group.description}</p> : null}
          </header>
          <div className="nexus-openapi-operations">
            {group.operations.map((operation, operationIndex) => (
              <details
                className={`nexus-openapi-operation nexus-openapi-operation-${operation.method}`}
                key={`${operation.method}:${operation.path}`}
                open={operationIndex === 0}
              >
                <summary>
                  <span className="nexus-openapi-method">{operation.method.toUpperCase()}</span>
                  <code>{operation.path}</code>
                  <span>{operation.summary || operation.operationId || "OpenAPI operation"}</span>
                  {operation.deprecated ? <em>deprecated</em> : null}
                </summary>
                <div className="nexus-openapi-operation-body">
                  {operation.description ? <p>{operation.description}</p> : null}
                  {operation.operationId ? (
                    <div className="nexus-openapi-operation-id">Operation ID <code>{operation.operationId}</code></div>
                  ) : null}
                  {operation.security.length ? (
                    <div className="nexus-openapi-security">
                      <LockKeyhole aria-hidden="true" /> Secured by {operation.security.join(", ")}
                    </div>
                  ) : null}

                  {operation.parameters.length ? (
                    <section className="nexus-openapi-operation-section">
                      <h4>Parameters</h4>
                      <div className="nexus-openapi-parameters">
                        {operation.parameters.map((parameter) => (
                          <div className="nexus-openapi-parameter" key={`${parameter.location}:${parameter.name}`}>
                            <div>
                              <strong>{parameter.name}</strong>
                              {parameter.required ? <em>required</em> : null}
                              {parameter.deprecated ? <em>deprecated</em> : null}
                            </div>
                            <span className="nexus-openapi-parameter-location">{parameter.location}</span>
                            {parameter.schema ? <SchemaPreview schema={parameter.schema} /> : null}
                            {parameter.description ? <p>{parameter.description}</p> : null}
                            {parameter.example ? <pre>{parameter.example}</pre> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {operation.requestBody ? (
                    <section className="nexus-openapi-operation-section">
                      <h4>Request body {operation.requestBody.required ? <em>required</em> : null}</h4>
                      {operation.requestBody.description ? <p>{operation.requestBody.description}</p> : null}
                      {operation.requestBody.content.map((media) => <MediaPreview key={media.mediaType} media={media} />)}
                    </section>
                  ) : null}

                  <section className="nexus-openapi-operation-section">
                    <h4>Responses</h4>
                    {operation.responses.length ? operation.responses.map((response) => (
                      <div className="nexus-openapi-response" key={response.status}>
                        <div>
                          <code>{response.status}</code>
                          <span>{response.description || "No description"}</span>
                        </div>
                        {response.content.map((media) => <MediaPreview key={media.mediaType} media={media} />)}
                      </div>
                    )) : <p>No responses documented.</p>}
                  </section>
                </div>
              </details>
            ))}
          </div>
        </section>
      )) : <p className="nexus-openapi-empty">No operations are documented in this specification yet.</p>}
    </div>
  );
}

export default OpenApiReferencePreview;
