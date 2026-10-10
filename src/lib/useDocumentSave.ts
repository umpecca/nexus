import { useRef } from "react";
import { areMarkdownBuffersEquivalent } from "./markdown";

export type DocumentSaveSnapshot = {
  documentId: number;
  markdown: string;
  filePath: string | undefined;
  lastSavedMarkdown: string;
  exactText?: boolean;
};

type DocumentSaveOptions = {
  getSnapshot: () => DocumentSaveSnapshot;
  bridge: Pick<NonNullable<Window["nexus"]>, "saveMarkdownFile" | "chooseMarkdownSavePath"> | undefined;
  prepareMarkdownForDisk: (markdown: string, filePath: string) => Promise<{
    markdown: string;
    diagramNames?: string[];
  }>;
  onSaved: (snapshot: DocumentSaveSnapshot, filePath: string) => void;
  onError: (message: string) => void;
};

/** One queue per editor window. Capture text only when the preceding save has finished. */
export function useDocumentSave(options: DocumentSaveOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(false));

  function save(saveAs: boolean): Promise<boolean> {
    const documentId = optionsRef.current.getSnapshot().documentId;
    const pending = saveQueueRef.current.then(async () => {
      const current = optionsRef.current;
      const snapshot = current.getSnapshot();
      // A queued request belongs to the document that requested it, even after New/Open/Reload.
      if (snapshot.documentId !== documentId) {
        return false;
      }
      try {
        const bridge = current.bridge;
        if (!bridge) {
          throw new Error("Saving is unavailable in this window.");
        }
        let targetPath = snapshot.filePath;
        if (saveAs || !targetPath) {
          const result = await (snapshot.exactText ? bridge.chooseMarkdownSavePath(targetPath, "text") : bridge.chooseMarkdownSavePath(targetPath));
          if (result.canceled) {
            return false;
          }
          targetPath = result.filePath;
        }
        const prepared = await current.prepareMarkdownForDisk(snapshot.markdown, targetPath);
        // Folder moves can change this document's path while diagram assets are being prepared.
        if (optionsRef.current.getSnapshot().documentId !== documentId) return false;
        await bridge.saveMarkdownFile(targetPath, prepared.markdown, prepared.diagramNames);
        if (optionsRef.current.getSnapshot().documentId !== documentId) {
          return false;
        }
        current.onSaved(snapshot, targetPath);
        return true;
      } catch (error) {
        if (optionsRef.current.getSnapshot().documentId === documentId) {
          current.onError(error instanceof Error ? error.message : String(error));
        }
        return false;
      }
    });
    saveQueueRef.current = pending;
    return pending;
  }

  async function saveAndConfirmClean(): Promise<boolean> {
    const documentId = optionsRef.current.getSnapshot().documentId;
    if (!(await save(false))) {
      return false;
    }
    const current = optionsRef.current.getSnapshot();
    return current.documentId === documentId &&
      (current.exactText ? current.markdown === current.lastSavedMarkdown : areMarkdownBuffersEquivalent(current.markdown, current.lastSavedMarkdown));
  }

  return {
    saveDocument: () => save(false),
    saveDocumentAs: () => save(true),
    saveAndConfirmClean
  };
}
