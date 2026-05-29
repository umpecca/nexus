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
import {
  Code2,
  FileText,
  GitCompareArrows,
  Newspaper,
  RectangleHorizontal,
  RectangleVertical,
  WrapText
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCellValues, usePublisher } from "@mdxeditor/gurx";
import InsertImageImport from "./InsertImageImport";
import InsertKatexBlock from "./InsertKatexBlock";
import InsertLocalJavaScriptRunner from "./InsertLocalJavaScriptRunner";
import InsertMermaidDiagram from "./InsertMermaidDiagram";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { Separator } from "../ui/separator";
import type { EditorPageOrientation } from "../../lib/settings";

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

function ToolbarButtonGroup({
  "aria-label": ariaLabel,
  children,
  className,
  wide = false
}: {
  "aria-label": string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const classNames = [
    "nexus-shadcn-toolbar-group",
    wide ? "nexus-shadcn-toolbar-group-wide" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ButtonGroup aria-label={ariaLabel} className={classNames}>
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

function PaperViewToggle({
  enabled,
  onChange
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <TooltipWrap title="Paper view">
      <Button
        aria-label={enabled ? "Hide paper view" : "Show paper view"}
        aria-pressed={enabled}
        className="nexus-shadcn-toolbar-mode-button"
        onClick={() => onChange(!enabled)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Newspaper aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

function PageOrientationToggle({
  onChange,
  orientation
}: {
  onChange: (orientation: EditorPageOrientation) => void;
  orientation: EditorPageOrientation;
}) {
  const isLandscape = orientation === "landscape";
  const Icon = isLandscape ? RectangleHorizontal : RectangleVertical;

  return (
    <TooltipWrap title="Page orientation">
      <Button
        aria-label={
          isLandscape
            ? "Switch to portrait orientation"
            : "Switch to landscape orientation"
        }
        aria-pressed={isLandscape}
        className="nexus-shadcn-toolbar-mode-button"
        onClick={() => onChange(isLandscape ? "portrait" : "landscape")}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Icon aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

function ResponsiveWrapToggle({
  disabled,
  enabled,
  onChange
}: {
  disabled: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <TooltipWrap title="Responsive wrapping">
      <Button
        aria-label={enabled ? "Use readable content width" : "Use application width wrapping"}
        aria-pressed={enabled}
        className="nexus-shadcn-toolbar-mode-button"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <WrapText aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

function RichTextRibbonCommands() {
  return (
    <>
      <ToolbarButtonGroup aria-label="Text formatting" wide>
        <ToolbarRow>
          <BoldItalicUnderlineToggles />
          <CodeToggle />
          <HighlightToggle />
          <Separator orientation="vertical" />
          <StrikeThroughSupSubToggles />
        </ToolbarRow>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Paragraph formatting">
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
        </ToolbarStack>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Links and media" wide>
        <ToolbarRow>
          <CreateLink />
          <InsertImageImport />
        </ToolbarRow>
      </ToolbarButtonGroup>

      <ToolbarButtonGroup aria-label="Insert blocks" wide>
        <ToolbarRow>
          <InsertTable />
          <InsertThematicBreak />
          <InsertCodeBlock />
          <Separator orientation="vertical" />
          <InsertMermaidDiagram />
          <InsertKatexBlock />
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
        </ToolbarRow>
      </ToolbarButtonGroup>
    </>
  );
}

function ViewRibbonCommands({
  onPageOrientationChange,
  onPaperViewChange,
  onResponsiveContentWrappingChange,
  pageOrientation,
  paperViewEnabled,
  responsiveContentWrappingEnabled
}: {
  onPageOrientationChange: (orientation: EditorPageOrientation) => void;
  onPaperViewChange: (enabled: boolean) => void;
  onResponsiveContentWrappingChange: (enabled: boolean) => void;
  pageOrientation: EditorPageOrientation;
  paperViewEnabled: boolean;
  responsiveContentWrappingEnabled: boolean;
}) {
  return (
    <ToolbarButtonGroup className="nexus-shadcn-toolbar-group-modes" aria-label="View controls" wide>
      <div className="nexus-shadcn-toolbar-mode-controls">
        <EditorModeControls />
        <Separator orientation="vertical" />
        <PaperViewToggle enabled={paperViewEnabled} onChange={onPaperViewChange} />
        <PageOrientationToggle
          onChange={onPageOrientationChange}
          orientation={pageOrientation}
        />
        <ResponsiveWrapToggle
          disabled={paperViewEnabled}
          enabled={responsiveContentWrappingEnabled}
          onChange={onResponsiveContentWrappingChange}
        />
      </div>
    </ToolbarButtonGroup>
  );
}

function ShadcnMdxToolbar({
  onPageOrientationChange,
  onPaperViewChange,
  onResponsiveContentWrappingChange,
  pageOrientation,
  paperViewEnabled,
  responsiveContentWrappingEnabled
}: {
  onPageOrientationChange: (orientation: EditorPageOrientation) => void;
  onPaperViewChange: (enabled: boolean) => void;
  onResponsiveContentWrappingChange: (enabled: boolean) => void;
  pageOrientation: EditorPageOrientation;
  paperViewEnabled: boolean;
  responsiveContentWrappingEnabled: boolean;
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
        {isRichText ? <RichTextRibbonCommands /> : null}
        <ViewRibbonCommands
          onPageOrientationChange={onPageOrientationChange}
          onPaperViewChange={onPaperViewChange}
          onResponsiveContentWrappingChange={onResponsiveContentWrappingChange}
          pageOrientation={pageOrientation}
          paperViewEnabled={paperViewEnabled}
          responsiveContentWrappingEnabled={responsiveContentWrappingEnabled}
        />
      </div>
    </div>
  );
}

export default ShadcnMdxToolbar;
