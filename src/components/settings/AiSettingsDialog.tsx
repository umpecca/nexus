import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import {
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_PROVIDER_IDS,
  AI_PROVIDER_LIST,
  AI_TEMPERATURE_MAX,
  AI_TEMPERATURE_MIN,
  toAiRequestConfig
} from "../../lib/ai/providers";
import type {
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings
} from "../../lib/ai/providers";

type AiSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  ai: AiSettings;
  onAiChange: (next: AiSettings) => void;
};

type TestResult = { ok: boolean; message: string };

function truncate(value: string, max = 80) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function emptyByProvider<T>(value: T): Record<AiProviderId, T> {
  return AI_PROVIDER_IDS.reduce(
    (accumulator, id) => {
      accumulator[id] = value;
      return accumulator;
    },
    {} as Record<AiProviderId, T>
  );
}

function AiSettingsDialog({ open, onOpenChange, profileName, ai, onAiChange }: AiSettingsDialogProps) {
  const [keys, setKeys] = useState<Record<AiProviderId, string>>(() => emptyByProvider(""));
  const [revealed, setRevealed] = useState<Record<AiProviderId, boolean>>(() =>
    emptyByProvider(false)
  );
  const [testResults, setTestResults] = useState<Record<AiProviderId, TestResult | undefined>>(() =>
    emptyByProvider<TestResult | undefined>(undefined)
  );
  const [testing, setTesting] = useState<AiProviderId | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);

  // Load each provider's stored (encrypted) key when the dialog opens, and clear any stale test
  // readouts so a result never describes a configuration the user has since changed.
  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setTestResults(emptyByProvider<TestResult | undefined>(undefined));

    void (async () => {
      const entries = await Promise.all(
        AI_PROVIDER_IDS.map(
          async (id) =>
            [id, (await window.nexus?.getAiProviderKey(profileName, id)) ?? ""] as const
        )
      );
      if (!active) {
        return;
      }
      const next = emptyByProvider("");
      for (const [id, key] of entries) {
        next[id] = key;
      }
      setKeys(next);
    })();

    return () => {
      active = false;
    };
  }, [open, profileName]);

  function updateProvider(providerId: AiProviderId, patch: Partial<AiProviderConfig>) {
    onAiChange({
      ...ai,
      providers: {
        ...ai.providers,
        [providerId]: { ...ai.providers[providerId], ...patch }
      }
    });
  }

  async function persistKey(providerId: AiProviderId, key: string) {
    const result = await window.nexus?.setAiProviderKey(profileName, providerId, key);
    if (result && !result.encryptionAvailable) {
      setEncryptionAvailable(false);
    }
    return result;
  }

  function handleKeyChange(providerId: AiProviderId, value: string) {
    setKeys((current) => ({ ...current, [providerId]: value }));
    // A stored key is about to change; drop the now-stale test readout.
    setTestResults((current) => ({ ...current, [providerId]: undefined }));
  }

  function handleKeyBlur(providerId: AiProviderId) {
    void persistKey(providerId, keys[providerId] ?? "");
  }

  function handleClearKey(providerId: AiProviderId) {
    setKeys((current) => ({ ...current, [providerId]: "" }));
    setTestResults((current) => ({ ...current, [providerId]: undefined }));
    void persistKey(providerId, "");
  }

  async function handleTest(providerId: AiProviderId) {
    setTesting(providerId);
    setTestResults((current) => ({ ...current, [providerId]: undefined }));

    try {
      // The main process reads the key from its encrypted store, so persist the field first to make
      // sure the test exercises exactly what the user has typed.
      await persistKey(providerId, keys[providerId] ?? "");

      const result = await window.nexus?.aiChat({
        profileName,
        providerId,
        config: toAiRequestConfig(ai.providers[providerId]),
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        temperature: 0,
        maxTokens: 16
      });

      if (!result) {
        setTestResults((current) => ({
          ...current,
          [providerId]: { ok: false, message: "AI requests are only available in the desktop app." }
        }));
        return;
      }

      if (result.ok) {
        const reply = result.text.trim();
        const parts = ["Connected"];
        if (result.model) {
          parts.push(result.model);
        }
        if (reply) {
          parts.push(`“${truncate(reply, 40)}”`);
        }
        setTestResults((current) => ({
          ...current,
          [providerId]: { ok: true, message: parts.join(" · ") }
        }));
      } else {
        const status = result.status ? ` (HTTP ${result.status})` : "";
        setTestResults((current) => ({
          ...current,
          [providerId]: { ok: false, message: `${result.error}${status}` }
        }));
      }
    } catch {
      setTestResults((current) => ({
        ...current,
        [providerId]: { ok: false, message: "The test request failed unexpectedly." }
      }));
    } finally {
      setTesting(null);
    }
  }

  function renderProvider(meta: AiProviderMeta) {
    const config = ai.providers[meta.id];
    const key = keys[meta.id] ?? "";
    const result = testResults[meta.id];
    const isTesting = testing === meta.id;
    const datalistId = `nexus-ai-models-${meta.id}`;

    return (
      <fieldset className="nexus-ai-provider" key={meta.id}>
        <div className="nexus-ai-provider-header">
          <legend className="nexus-ai-provider-title">{meta.label}</legend>
          <label className="nexus-ai-provider-toggle">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) => updateProvider(meta.id, { enabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>
        </div>

        <label className="nexus-settings-field">
          <span className="nexus-settings-label">API key</span>
          <div className="nexus-ai-key-row">
            <input
              className="nexus-settings-input"
              type={revealed[meta.id] ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={meta.keyPlaceholder}
              value={key}
              onChange={(event) => handleKeyChange(meta.id, event.target.value)}
              onBlur={() => handleKeyBlur(meta.id)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRevealed((current) => ({ ...current, [meta.id]: !current[meta.id] }))
              }
            >
              {revealed[meta.id] ? "Hide" : "Show"}
            </Button>
            <Button type="button" variant="outline" disabled={!key} onClick={() => handleClearKey(meta.id)}>
              Clear
            </Button>
          </div>
        </label>

        {meta.usesAzureFields ? (
          <>
            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Resource endpoint</span>
              <input
                className="nexus-settings-input"
                type="text"
                autoComplete="off"
                placeholder="https://my-resource.openai.azure.com"
                value={config.azureResourceUrl}
                onChange={(event) => updateProvider(meta.id, { azureResourceUrl: event.target.value })}
              />
            </label>
            <div className="nexus-ai-inline-fields">
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Deployment</span>
                <input
                  className="nexus-settings-input"
                  type="text"
                  autoComplete="off"
                  placeholder="gpt-4o"
                  value={config.azureDeployment}
                  onChange={(event) => updateProvider(meta.id, { azureDeployment: event.target.value })}
                />
              </label>
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">API version</span>
                <input
                  className="nexus-settings-input"
                  type="text"
                  autoComplete="off"
                  placeholder="2024-10-21"
                  value={config.azureApiVersion}
                  onChange={(event) => updateProvider(meta.id, { azureApiVersion: event.target.value })}
                />
              </label>
            </div>
          </>
        ) : (
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Model</span>
            <input
              className="nexus-settings-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              list={meta.suggestedModels.length > 0 ? datalistId : undefined}
              placeholder={meta.defaultModel}
              value={config.model}
              onChange={(event) => updateProvider(meta.id, { model: event.target.value })}
            />
            {meta.suggestedModels.length > 0 && (
              <datalist id={datalistId}>
                {meta.suggestedModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
          </label>
        )}

        {meta.usesBaseUrl && (
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">API base URL (optional)</span>
            <input
              className="nexus-settings-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={meta.defaultBaseUrl}
              value={config.baseUrl}
              onChange={(event) => updateProvider(meta.id, { baseUrl: event.target.value })}
            />
          </label>
        )}

        <div className="nexus-ai-inline-fields">
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Temperature</span>
            <input
              className="nexus-settings-input"
              type="number"
              inputMode="decimal"
              min={AI_TEMPERATURE_MIN}
              max={AI_TEMPERATURE_MAX}
              step={0.1}
              value={String(config.temperature)}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value);
                if (Number.isFinite(parsed)) {
                  updateProvider(meta.id, {
                    temperature: clampNumber(parsed, AI_TEMPERATURE_MIN, AI_TEMPERATURE_MAX)
                  });
                }
              }}
            />
          </label>
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Max tokens</span>
            <input
              className="nexus-settings-input"
              type="number"
              inputMode="numeric"
              min={AI_MAX_TOKENS_MIN}
              max={AI_MAX_TOKENS_MAX}
              step={1}
              value={String(config.maxTokens)}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(parsed)) {
                  updateProvider(meta.id, {
                    maxTokens: Math.round(clampNumber(parsed, AI_MAX_TOKENS_MIN, AI_MAX_TOKENS_MAX))
                  });
                }
              }}
            />
          </label>
        </div>

        <div className="nexus-ai-test-row">
          <Button type="button" variant="outline" disabled={isTesting} onClick={() => handleTest(meta.id)}>
            {isTesting ? "Testing…" : "Test connection"}
          </Button>
          {result && (
            <span
              className={result.ok ? "nexus-settings-success" : "nexus-settings-warning"}
              role="status"
              aria-live="polite"
            >
              {result.message}
            </span>
          )}
        </div>
      </fieldset>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nexus-ai-dialog-content">
        <DialogHeader>
          <DialogTitle>AI Providers</DialogTitle>
          <DialogDescription>
            Configure one or more model providers. API keys are encrypted at rest and never leave
            this device except to call the provider you select.
          </DialogDescription>
        </DialogHeader>

        <div className="nexus-settings-form">
          {!encryptionAvailable && (
            <p className="nexus-settings-warning">
              Secure key storage is unavailable on this system, so API keys cannot be saved. You can
              still enter a key to use it for this session only.
            </p>
          )}

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Default provider</span>
            <select
              className="nexus-settings-select"
              value={ai.defaultProviderId}
              onChange={(event) =>
                onAiChange({
                  ...ai,
                  defaultProviderId: event.target.value as AiSettings["defaultProviderId"]
                })
              }
            >
              <option value="">None</option>
              {AI_PROVIDER_LIST.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>

          {AI_PROVIDER_LIST.map((meta) => renderProvider(meta))}

          <p className="nexus-settings-profile">Profile: {profileName}</p>
        </div>

        <DialogFooter className="nexus-settings-footer">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiSettingsDialog;
