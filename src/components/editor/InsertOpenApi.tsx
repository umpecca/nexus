import {
  $createCodeBlockNode,
  NESTED_EDITOR_UPDATED_COMMAND,
  TooltipWrap,
  activeEditor$,
  rootEditor$
} from "@mdxeditor/editor";
import { useRealm } from "@mdxeditor/gurx";
import { $insertNodes } from "lexical";
import { Braces } from "lucide-react";
import { Button } from "../ui/button";
import {
  DEFAULT_OPENAPI_YAML,
  OPENAPI_BLOCK_LANGUAGE,
  OPENAPI_BLOCK_META
} from "../../lib/openapiYaml";
import { captureDiagramSelection, restoreDiagramSelection } from "./InsertDiagram";
import type { LexicalEditor, RangeSelection } from "lexical";

export function insertOpenApiCodeBlock(
  targetEditor: LexicalEditor,
  rootEditor: LexicalEditor,
  selection: RangeSelection | null,
  yaml: string
) {
  targetEditor.update(() => {
    restoreDiagramSelection(selection);
    $insertNodes([
      $createCodeBlockNode({ code: yaml, language: OPENAPI_BLOCK_LANGUAGE, meta: OPENAPI_BLOCK_META })
    ]);
  }, { discrete: true });
  if (targetEditor !== rootEditor) {
    targetEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
  }
}

function InsertOpenApi() {
  const realm = useRealm();
  const available = typeof window !== "undefined" && Boolean(window.nexus?.editOpenApi);

  async function insert() {
    const bridge = window.nexus;
    if (!bridge?.editOpenApi) return;
    const rootEditor = realm.getValue(rootEditor$);
    const targetEditor = realm.getValue(activeEditor$) ?? rootEditor;
    if (!rootEditor || !targetEditor) return;
    const selection = captureDiagramSelection(targetEditor);
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const result = await bridge.editOpenApi({ yaml: DEFAULT_OPENAPI_YAML, theme });
    if (result.canceled) return;
    insertOpenApiCodeBlock(targetEditor, rootEditor, selection, result.yaml);
  }

  if (!available) return null;
  return (
    <TooltipWrap title="Insert OpenAPI specification">
      <Button aria-label="Insert OpenAPI specification" onClick={() => void insert()} size="icon" type="button" variant="ghost">
        <Braces aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertOpenApi;
