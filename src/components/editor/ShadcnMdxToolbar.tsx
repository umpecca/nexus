import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  HighlightToggle,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  StrikeThroughSupSubToggles,
  TooltipWrap,
  viewMode$
} from "@mdxeditor/editor";
import type { EditorInFocus, ViewMode } from "@mdxeditor/editor";
import type { ContainerDirective } from "mdast-util-directive";
import {
  Code2,
  FileText,
  GitCompareArrows
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCellValues, usePublisher } from "@mdxeditor/gurx";
import ChangeCalloutType from "./ChangeCalloutType";
import CleanUpFormatting from "./CleanUpFormatting";
import InsertAdmonition from "./InsertAdmonition";
import InsertDrawioDiagram from "./InsertDrawioDiagram";
import InsertIsoflowDiagram from "./InsertIsoflowDiagram";
import InsertFootnote from "./InsertFootnote";
import InsertGithubAlert from "./InsertGithubAlert";
import InsertImageImport from "./InsertImageImport";
import InsertKatexBlock from "./InsertKatexBlock";
import InsertLocalJavaScriptRunner from "./InsertLocalJavaScriptRunner";
import InsertMermaidDiagram from "./InsertMermaidDiagram";
import InsertTableOfContents from "./InsertTableOfContents";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { Separator } from "../ui/separator";
import { isAdmonitionType } from "../../lib/admonition";
import { isGithubAlertDirective } from "../../lib/githubAlerts";

type DirectiveNode = {
  getType: () => string;
  getMdastNode: () => ContainerDirective;
};

/**
 * True while the caret sits inside a callout — either a `:::` admonition or a GitHub `> [!TYPE]` alert.
 * Both render as Lexical directive nodes; an alert is recognised by its `data.githubAlert` provenance
 * flag, an admonition by its name. Drives both the change-type control (shown) and the insert buttons
 * (hidden), so you can convert a callout in place but not nest another inside it.
 */
function whenInCallout(editorInFocus: EditorInFocus | null) {
  const node = editorInFocus?.rootNode as DirectiveNode | null | undefined;

  if (!node || node.getType() !== "directive") {
    return false;
  }

  const mdastNode = node.getMdastNode();
  // Capture `name` before the guard call: `isGithubAlertDirective` narrows `mdastNode` to `never` in the
  // right-hand operand of the `||`, so reading `mdastNode.name` there would not type-check.
  const name = mdastNode.name;
  return isGithubAlertDirective(mdastNode) || isAdmonitionType(name);
}

function ToolbarButtonGroup({
  "aria-label": ariaLabel,
  children,
  className,
  ribbonLabel,
  wide = false
}: {
  "aria-label": string;
  children: React.ReactNode;
  className?: string;
  /** Office-style group caption rendered under the controls (via CSS). */
  ribbonLabel?: string;
  wide?: boolean;
}) {
  const classNames = [
    "nexus-shadcn-toolbar-group",
    wide ? "nexus-shadcn-toolbar-group-wide" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");
  const ribbonLabelProps = ribbonLabel ? { "data-ribbon-label": ribbonLabel } : {};

  return (
    <ButtonGroup aria-label={ariaLabel} className={classNames} {...ribbonLabelProps}>
      {children}
    </ButtonGroup>
  );
}

function ToolbarRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="nexus-shadcn-toolbar-row">
      {children}
    </div>
  );
}

function ToolbarStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="nexus-shadcn-toolbar-stack">
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
        className="nexus-shadcn-toolbar-mode-button"
      >
        <Icon aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

function EditorModeControls() {
  const [currentMode] = useCellValues(viewMode$);
  const setViewMode = usePublisher(viewMode$);

  return (
    <ButtonGroup className="nexus-shadcn-toolbar-mode-switch" aria-label="Editor view mode">
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
    </ButtonGroup>
  );
}

function RichTextRibbonCommands({
  documentPath,
  onInsertTableOfContents
}: {
  documentPath?: string;
  onInsertTableOfContents: () => void;
}) {
  return (
    <>
      <ToolbarButtonGroup aria-label="Text formatting" ribbonLabel="Font" wide>
        <ToolbarRow>
          <BoldItalicUnderlineToggles />
          <CodeToggle />
          <HighlightToggle />
          <Separator orientation="vertical" />
          <StrikeThroughSupSubToggles />
        </ToolbarRow>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Paragraph formatting" ribbonLabel="Paragraph">
        <ToolbarStack>
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
                        when: whenInCallout,
                        contents: () => <ChangeCalloutType />
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
        </ToolbarStack>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Links and media" ribbonLabel="Links" wide>
        <ToolbarRow>
          <CreateLink />
          <InsertImageImport documentPath={documentPath} />
        </ToolbarRow>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Insert blocks" ribbonLabel="Insert" wide>
        <ToolbarRow>
          <InsertTable />
          <InsertTableOfContents onInsert={onInsertTableOfContents} />
          <InsertThematicBreak />
          <InsertCodeBlock />
          <InsertLocalJavaScriptRunner />
          <InsertMermaidDiagram />
          <InsertDrawioDiagram />
          <InsertIsoflowDiagram />
          <InsertKatexBlock />
          <InsertFootnote />
          <ConditionalContents
            options={[
              {
                when: (editorInFocus) => !whenInCallout(editorInFocus),
                contents: () => (
                  <>
                    <Separator orientation="vertical" />
                    <InsertAdmonition />
                    <InsertGithubAlert />
                  </>
                )
              }
            ]}
          />
        </ToolbarRow>
      </ToolbarButtonGroup>
    </>
  );
}

function ViewRibbonCommands({
  currentMode,
  onCleanUpFormatting
}: {
  currentMode: ViewMode;
  onCleanUpFormatting: () => void;
}) {
  return (
    <ToolbarButtonGroup
      className="nexus-shadcn-toolbar-group-modes"
      aria-label="View controls"
      ribbonLabel="View"
      wide
    >
      <div className="nexus-shadcn-toolbar-mode-controls">
        {/* Clean up formatting acts on the raw Markdown, so it is offered only in source mode. */}
        {currentMode === "source" ? (
          <>
            <CleanUpFormatting onCleanUp={onCleanUpFormatting} />
            <Separator orientation="vertical" />
          </>
        ) : null}
        <EditorModeControls />
      </div>
    </ToolbarButtonGroup>
  );
}

function ShadcnMdxToolbar({
  documentPath,
  onCleanUpFormatting,
  onInsertTableOfContents
}: {
  documentPath?: string;
  onCleanUpFormatting: () => void;
  onInsertTableOfContents: () => void;
}) {
  const [currentMode] = useCellValues(viewMode$);
  const isRichText = currentMode === "rich-text";
  const toolbarClassName = [
    "nexus-shadcn-toolbar",
    `nexus-shadcn-toolbar-${currentMode}-mode`,
    isRichText ? "" : "nexus-shadcn-toolbar-floating"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={toolbarClassName}>
      <div className="nexus-shadcn-toolbar-scroll">
        {isRichText ? (
          <RichTextRibbonCommands
            documentPath={documentPath}
            onInsertTableOfContents={onInsertTableOfContents}
          />
        ) : null}
        <ViewRibbonCommands currentMode={currentMode} onCleanUpFormatting={onCleanUpFormatting} />
      </div>
    </div>
  );
}

export default ShadcnMdxToolbar;
