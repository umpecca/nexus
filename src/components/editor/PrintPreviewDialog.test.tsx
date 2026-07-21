import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../ui/dialog";
import { PrintPreviewContent } from "./PrintPreviewDialog";

describe("PrintPreviewContent", () => {
  it("shows the generation state and disables snapshot actions appropriately", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <PrintPreviewContent
          loading
          error={null}
          pdfUrl={null}
          canSave={false}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
        />
      </Dialog>
    );

    expect(html).toContain("Rendering the current document");
    expect(html).toContain("Refresh");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("embeds a generated PDF and keeps a refresh error visible beside the snapshot", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <PrintPreviewContent
          loading={false}
          error="Refresh failed"
          pdfUrl="blob:preview"
          canSave
          onRefresh={vi.fn()}
          onSave={vi.fn()}
        />
      </Dialog>
    );

    expect(html).toContain('src="blob:preview"');
    expect(html).toContain("Paginated PDF preview");
    expect(html).toContain("Refresh failed");
    expect(html).not.toContain('disabled=""');
  });
});
