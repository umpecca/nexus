const OPENAPI_WINDOW = Object.freeze({
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640
});

function normalizeOpenApiSaveResult(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.yaml !== "string" || !raw.yaml.trim()) {
    return null;
  }
  return { canceled: false, yaml: raw.yaml };
}

module.exports = { OPENAPI_WINDOW, normalizeOpenApiSaveResult };
