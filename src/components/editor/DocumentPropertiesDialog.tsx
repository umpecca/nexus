import { useState } from "react";
import { readDocumentProperties, type DocumentProperties } from "../../lib/documentProperties";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

export default function DocumentPropertiesDialog({ markdown, onApply, onClose }: {
  markdown: string;
  onApply: (properties: DocumentProperties) => void;
  onClose: () => void;
}) {
  const [initial] = useState(() => {
    try { return { properties: readDocumentProperties(markdown), error: null }; }
    catch (error) { return { properties: null, error: error instanceof Error ? error.message : String(error) }; }
  });
  const [properties, setProperties] = useState(initial.properties);
  const [error, setError] = useState(initial.error);
  const field = (key: keyof DocumentProperties, value: string) => {
    setProperties(current => current && ({ ...current, [key]: value }));
    setError(null);
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="nexus-document-properties-dialog">
      <DialogHeader><DialogTitle>Document properties</DialogTitle><DialogDescription>
        Stored in this document's YAML frontmatter. Apply updates the editor; Save writes the file. Empty fields remove existing values.
      </DialogDescription></DialogHeader>
      {properties ? <form id="document-properties" className="nexus-document-properties-form" onSubmit={event => {
        event.preventDefault();
        try { onApply(properties); onClose(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
      }}>
        <label className="nexus-properties-wide">Title<input autoFocus value={properties.title} onChange={event => field("title", event.target.value)} /></label>
        <label>Type<input list="document-property-types" value={properties.type} onChange={event => field("type", event.target.value)} placeholder="e.g. Procedure" /></label>
        <label>Status<input list="document-property-statuses" value={properties.status} onChange={event => field("status", event.target.value)} placeholder="e.g. Draft" /></label>
        <label>Owner<input value={properties.owner} onChange={event => field("owner", event.target.value)} placeholder="Person or team" /></label>
        <label>Review date<input value={properties.review_date} onChange={event => field("review_date", event.target.value)} placeholder="YYYY-MM-DD" aria-describedby="document-review-date-help" /><small id="document-review-date-help">YYYY-MM-DD, e.g. 2026-12-31</small></label>
        <label className="nexus-properties-wide">Tags<textarea rows={3} value={properties.tags} onChange={event => field("tags", event.target.value)} aria-describedby="document-tags-help" /><small id="document-tags-help">One tag per line.</small></label>
        <datalist id="document-property-types">{["Note", "Procedure", "Policy", "System", "Decision", "Meeting", "Project"].map(type => <option key={type} value={type} />)}</datalist>
        <datalist id="document-property-statuses">{["Draft", "In review", "Approved", "Archived"].map(status => <option key={status} value={status} />)}</datalist>
        {error ? <p className="nexus-properties-wide nexus-properties-error" role="alert">{error}</p> : null}
      </form> : <p className="nexus-properties-error" role="alert">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>{properties ? "Cancel" : "Close"}</Button>{properties ? <Button type="submit" form="document-properties">Apply</Button> : null}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
