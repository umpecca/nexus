import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  KitchenSinkToolbar,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  sandpackPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin
} from "@mdxeditor/editor";
import {
  DEFAULT_MARKDOWN,
  loadDraft,
  saveDraft
} from "./lib/markdown";

function App() {
  const loadedDraft = useMemo(loadDraft, []);
  const [markdown, setMarkdown] = useState(loadedDraft.markdown);
  const [filePath, setFilePath] = useState<string | undefined>(loadedDraft.filePath);
  const editorRef = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    saveDraft({ markdown, filePath });
  }, [filePath, markdown]);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    async function openDocument() {
      const result = await window.nexus?.openMarkdownFile();
      if (!result || result.canceled) {
        return;
      }

      editorRef.current?.setMarkdown(result.markdown);
      setMarkdown(result.markdown);
      setFilePath(result.filePath);
    }

    async function saveDocument() {
      const currentMarkdown = editorRef.current?.getMarkdown() ?? markdown;

      if (filePath) {
        await window.nexus?.saveMarkdownFile(filePath, currentMarkdown);
        setMarkdown(currentMarkdown);
        return;
      }

      const result = await window.nexus?.saveMarkdownFileAs(undefined, currentMarkdown);
      if (result && !result.canceled) {
        setMarkdown(currentMarkdown);
        setFilePath(result.filePath);
      }
    }

    async function saveDocumentAs() {
      const currentMarkdown = editorRef.current?.getMarkdown() ?? markdown;
      const result = await window.nexus?.saveMarkdownFileAs(filePath, currentMarkdown);
      if (result && !result.canceled) {
        setMarkdown(currentMarkdown);
        setFilePath(result.filePath);
      }
    }

    return window.nexus.onMenuAction((action) => {
      if (action === "new") {
        editorRef.current?.setMarkdown(DEFAULT_MARKDOWN);
        setMarkdown(DEFAULT_MARKDOWN);
        setFilePath(undefined);
      }

      if (action === "open") {
        void openDocument();
      }

      if (action === "save") {
        void saveDocument();
      }

      if (action === "saveAs") {
        void saveDocumentAs();
      }
    });
  }, [filePath, markdown]);

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="editor-column">
          <div className="editor-surface">
            <MDXEditor
              ref={editorRef}
              markdown={markdown}
              onChange={setMarkdown}
              contentEditableClassName="markdown-body"
              plugins={[
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                linkPlugin(),
                linkDialogPlugin(),
                imagePlugin(),
                tablePlugin(),
                frontmatterPlugin(),
                directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
                codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
                codeMirrorPlugin({
                  codeBlockLanguages: {
                    txt: "Text",
                    md: "Markdown",
                    js: "JavaScript",
                    jsx: "JavaScript React",
                    ts: "TypeScript",
                    tsx: "TypeScript React",
                    css: "CSS",
                    html: "HTML",
                    json: "JSON",
                    bash: "Bash",
                    powershell: "PowerShell"
                  }
                }),
                sandpackPlugin({
                  sandpackConfig: {
                    defaultPreset: "react",
                    presets: [
                      {
                        name: "react",
                        label: "React",
                        meta: "live react",
                        sandpackTemplate: "react",
                        sandpackTheme: "light",
                        snippetFileName: "/App.js",
                        snippetLanguage: "jsx",
                        initialSnippetContent: "export default function App() {\\n  return <h1>Hello Nexus</h1>;\\n}\\n"
                      }
                    ]
                  }
                }),
                markdownShortcutPlugin(),
                diffSourcePlugin({ viewMode: "rich-text" }),
                toolbarPlugin({
                  toolbarContents: () => <KitchenSinkToolbar />
                })
              ]}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
