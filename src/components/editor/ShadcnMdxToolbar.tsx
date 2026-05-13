import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeAdmonitionType,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  DiffSourceToggleWrapper,
  HighlightToggle,
  InsertAdmonition,
  InsertCodeBlock,
  InsertFrontmatter,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  StrikeThroughSupSubToggles
} from "@mdxeditor/editor";
import type { EditorInFocus } from "@mdxeditor/editor";
import { RefreshCw } from "lucide-react";
import InsertLocalJavaScriptRunner from "./InsertLocalJavaScriptRunner";
import InsertMermaidDiagram from "./InsertMermaidDiagram";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";

type DirectiveNode = {
  getType: () => string;
  getMdastNode: () => { name?: string };
};

type ShadcnMdxToolbarProps = {
  canRefresh: boolean;
  onRefresh: () => void;
};

function whenInAdmonition(editorInFocus: EditorInFocus | null) {
  const node = editorInFocus?.rootNode as DirectiveNode | null | undefined;

  if (!node || node.getType() !== "directive") {
    return false;
  }

  return ["note", "tip", "danger", "info", "caution"].includes(
    node.getMdastNode().name ?? ""
  );
}

function ToolbarDivider() {
  return <Separator orientation="vertical" className="nexus-toolbar-divider" />;
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="nexus-toolbar-group">{children}</div>;
}

function ToolbarModeLabel({ children }: { children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm" className="nexus-toolbar-mode-label">
      <span>{children}</span>
    </Button>
  );
}

function MainToolbarControls() {
  return (
    <div className="nexus-toolbar-command-cluster">
      <ToolbarGroup>
        <BoldItalicUnderlineToggles />
        <CodeToggle />
        <HighlightToggle />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <StrikeThroughSupSubToggles />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ListsToggle />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ConditionalContents
          options={[
            {
              when: whenInAdmonition,
              contents: () => <ChangeAdmonitionType />
            },
            {
              fallback: () => <BlockTypeSelect />
            }
          ]}
        />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <CreateLink />
        <InsertImage />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <InsertTable />
        <InsertThematicBreak />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <InsertCodeBlock />
        <InsertMermaidDiagram />
        <InsertLocalJavaScriptRunner />
      </ToolbarGroup>
      <ConditionalContents
        options={[
          {
            when: (editorInFocus) => !whenInAdmonition(editorInFocus),
            contents: () => (
              <>
                <ToolbarDivider />
                <ToolbarGroup>
                  <InsertAdmonition />
                </ToolbarGroup>
              </>
            )
          }
        ]}
      />
      <ToolbarDivider />
      <ToolbarGroup>
        <InsertFrontmatter />
      </ToolbarGroup>
    </div>
  );
}

function ShadcnMdxToolbar({ canRefresh, onRefresh }: ShadcnMdxToolbarProps) {
  return (
    <div className="nexus-shadcn-mdx-toolbar">
      <DiffSourceToggleWrapper
        SourceToolbar={<ToolbarModeLabel>Source mode</ToolbarModeLabel>}
      >
        <div className="nexus-toolbar-rich-controls">
          <ConditionalContents
            options={[
              {
                when: (editor) => editor?.editorType === "codeblock",
                contents: () => (
                  <ToolbarGroup>
                    <ChangeCodeMirrorLanguage />
                  </ToolbarGroup>
                )
              },
              {
                fallback: () => <MainToolbarControls />
              }
            ]}
          />
        </div>
      </DiffSourceToggleWrapper>
      <ToolbarGroup>
        <Button
          aria-label="Refresh from disk"
          disabled={!canRefresh}
          onClick={onRefresh}
          size="icon"
          title="Refresh from disk"
          type="button"
          variant="ghost"
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </ToolbarGroup>
    </div>
  );
}

export default ShadcnMdxToolbar;
