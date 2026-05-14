import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeAdmonitionType,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  HighlightToggle,
  InsertAdmonition,
  InsertCodeBlock,
  InsertFrontmatter,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  StrikeThroughSupSubToggles,
  TooltipWrap,
  viewMode$
} from "@mdxeditor/editor";
import type { EditorInFocus, ViewMode } from "@mdxeditor/editor";
import { Code2, FileText, GitCompareArrows } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCellValues, usePublisher } from "@mdxeditor/gurx";
import InsertImageImport from "./InsertImageImport";
import InsertLocalJavaScriptRunner from "./InsertLocalJavaScriptRunner";
import InsertMermaidDiagram from "./InsertMermaidDiagram";
import { Button } from "../ui/button";

type DirectiveNode = {
  getType: () => string;
  getMdastNode: () => { name?: string };
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

function RibbonGroup({
  children,
  className,
  label,
  wide = false
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  wide?: boolean;
}) {
  const classNames = [
    "nexus-office-ribbon-group",
    wide ? "nexus-office-ribbon-group-wide" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classNames}>
      <div className="nexus-office-ribbon-group-controls">
        {children}
      </div>
      <span className="nexus-office-ribbon-group-label">{label}</span>
    </section>
  );
}

function RibbonRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="nexus-office-ribbon-row">
      {children}
    </div>
  );
}

function RibbonStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="nexus-office-ribbon-stack">
      {children}
    </div>
  );
}

function EditorModeButton({
  currentMode,
  icon: Icon,
  label,
  mode,
  onSelect
}: {
  currentMode: ViewMode;
  icon: LucideIcon;
  label: string;
  mode: ViewMode;
  onSelect: (mode: ViewMode) => void;
}) {
  return (
    <TooltipWrap title={label}>
      <Button
        aria-label={`Switch to ${label}`}
        aria-pressed={currentMode === mode}
        onClick={() => onSelect(mode)}
        size="sm"
        type="button"
        variant="ghost"
        className="nexus-office-mode-button"
      >
        <Icon aria-hidden="true" />
        <span className="nexus-office-mode-label">{label}</span>
      </Button>
    </TooltipWrap>
  );
}

function EditorModeControls() {
  const [currentMode] = useCellValues(viewMode$);
  const setViewMode = usePublisher(viewMode$);

  return (
    <div className="nexus-office-mode-switch" role="group" aria-label="Editor view mode">
      <EditorModeButton
        currentMode={currentMode}
        icon={FileText}
        label="Rich text"
        mode="rich-text"
        onSelect={setViewMode}
      />
      <EditorModeButton
        currentMode={currentMode}
        icon={GitCompareArrows}
        label="Diff"
        mode="diff"
        onSelect={setViewMode}
      />
      <EditorModeButton
        currentMode={currentMode}
        icon={Code2}
        label="Source"
        mode="source"
        onSelect={setViewMode}
      />
    </div>
  );
}

function RichTextRibbonCommands() {
  return (
    <>
      <RibbonGroup label="Font" wide>
        <RibbonRow>
          <BoldItalicUnderlineToggles />
          <CodeToggle />
          <HighlightToggle />
        </RibbonRow>
        <RibbonRow>
          <StrikeThroughSupSubToggles />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Paragraph">
        <RibbonStack>
          <ListsToggle />
          <ConditionalContents
            options={[
              {
                when: (editor) => editor?.editorType === "codeblock",
                contents: () => <ChangeCodeMirrorLanguage />
              },
              {
                fallback: () => (
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
                )
              }
            ]}
          />
        </RibbonStack>
      </RibbonGroup>

      <RibbonGroup className="nexus-office-ribbon-group-centered" label="Links & Media" wide>
        <RibbonRow>
          <CreateLink />
          <InsertImageImport />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Blocks" wide>
        <RibbonRow>
          <InsertTable />
          <InsertThematicBreak />
          <InsertCodeBlock />
        </RibbonRow>
        <RibbonRow>
          <InsertMermaidDiagram />
          <InsertLocalJavaScriptRunner />
          <ConditionalContents
            options={[
              {
                when: (editorInFocus) => !whenInAdmonition(editorInFocus),
                contents: () => <InsertAdmonition />
              }
            ]}
          />
          <InsertFrontmatter />
        </RibbonRow>
      </RibbonGroup>
    </>
  );
}

function ViewRibbonCommands() {
  return (
    <RibbonGroup className="nexus-office-ribbon-group-modes" label="Modes" wide>
      <EditorModeControls />
    </RibbonGroup>
  );
}

function ModeStatePanel({ currentMode }: { currentMode: ViewMode }) {
  return (
    <div className="nexus-office-ribbon-state">
      <span className="nexus-office-ribbon-state-kicker">View mode</span>
      <span className="nexus-office-ribbon-state-label">
        {currentMode === "diff" ? "Reviewing differences" : "Editing Markdown source"}
      </span>
      <span className="nexus-office-ribbon-state-note">
        Use View to return to rich text before editing formatting or insert commands.
      </span>
    </div>
  );
}

function ShadcnMdxToolbar() {
  const [currentMode] = useCellValues(viewMode$);
  const isRichText = currentMode === "rich-text";

  return (
    <div className="nexus-office-ribbon">
      <div className="nexus-office-ribbon-body">
        <div className="nexus-office-ribbon-scroll">
          {isRichText ? (
            <RichTextRibbonCommands />
          ) : (
            <ModeStatePanel currentMode={currentMode} />
          )}
          <ViewRibbonCommands />
        </div>
      </div>
    </div>
  );
}

export default ShadcnMdxToolbar;
