import { Button } from "../ui/button";

export type ParseErrorInfo = {
  error: string;
  source: string;
};

type ParseErrorPanelProps = {
  error: ParseErrorInfo;
  filePath?: string;
  onDismiss: () => void;
};

function describeError(rawMessage: string) {
  const trimmed = rawMessage.trim();

  // remark/micromark messages often include a position like "1:3" or "3:14-3:20".
  const positionMatch = trimmed.match(/(\d+):(\d+)(?:-(\d+):(\d+))?/);
  const position = positionMatch
    ? {
        startLine: Number.parseInt(positionMatch[1], 10),
        startColumn: Number.parseInt(positionMatch[2], 10),
        endLine: positionMatch[3] ? Number.parseInt(positionMatch[3], 10) : null,
        endColumn: positionMatch[4] ? Number.parseInt(positionMatch[4], 10) : null
      }
    : null;

  return { message: trimmed, position };
}

function getSourceLine(source: string, lineNumber: number) {
  const lines = source.split(/\r\n|\n|\r/);
  return {
    text: lines[lineNumber - 1] ?? "",
    total: lines.length
  };
}

function ParseErrorPanel({ error, filePath, onDismiss }: ParseErrorPanelProps) {
  const { message, position } = describeError(error.error);
  const lineCount = error.source.split(/\r\n|\n|\r/).length;
  const charCount = error.source.length;
  const offendingLine = position ? getSourceLine(error.source, position.startLine) : null;

  return (
    <div className="nexus-parse-error-overlay" role="alert" aria-live="assertive">
      <div className="nexus-parse-error-card">
        <header className="nexus-parse-error-header">
          <h2 className="nexus-parse-error-title">Markdown could not be displayed</h2>
          <p className="nexus-parse-error-subtitle">
            The rich-text view could not be built because the Markdown parser reported an error.
            Dismiss this panel and switch the editor to <strong>Source</strong> mode to fix the
            document.
          </p>
        </header>

        <section className="nexus-parse-error-section">
          <h3 className="nexus-parse-error-heading">Error</h3>
          <pre className="nexus-parse-error-message">{message}</pre>
          {position ? (
            <p className="nexus-parse-error-position">
              Reported at line {position.startLine}, column {position.startColumn}
              {position.endLine !== null && position.endColumn !== null
                ? ` through line ${position.endLine}, column ${position.endColumn}`
                : ""}
              .
            </p>
          ) : null}
        </section>

        {offendingLine && offendingLine.text.length > 0 ? (
          <section className="nexus-parse-error-section">
            <h3 className="nexus-parse-error-heading">Offending line</h3>
            <pre className="nexus-parse-error-line">
              <span className="nexus-parse-error-line-number">
                {String(position?.startLine).padStart(String(lineCount).length, " ")} |{" "}
              </span>
              {offendingLine.text}
            </pre>
            {position?.startColumn ? (
              <pre className="nexus-parse-error-caret" aria-hidden="true">
                {" ".repeat(String(lineCount).length + 3 + position.startColumn - 1)}^
              </pre>
            ) : null}
          </section>
        ) : null}

        <section className="nexus-parse-error-section">
          <h3 className="nexus-parse-error-heading">Document</h3>
          <dl className="nexus-parse-error-meta">
            {filePath ? (
              <>
                <dt>File</dt>
                <dd className="nexus-parse-error-meta-mono">{filePath}</dd>
              </>
            ) : null}
            <dt>Length</dt>
            <dd>
              {lineCount.toLocaleString()} line{lineCount === 1 ? "" : "s"},{" "}
              {charCount.toLocaleString()} character{charCount === 1 ? "" : "s"}
            </dd>
          </dl>
          <details className="nexus-parse-error-source-details">
            <summary>Show raw Markdown</summary>
            <pre className="nexus-parse-error-source">{error.source}</pre>
          </details>
        </section>

        <footer className="nexus-parse-error-footer">
          <Button onClick={onDismiss} type="button">
            Dismiss and continue
          </Button>
        </footer>
      </div>
    </div>
  );
}

export default ParseErrorPanel;
