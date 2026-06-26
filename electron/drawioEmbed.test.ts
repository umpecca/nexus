import { describe, expect, it } from "vitest";
// The embed-protocol state machine is plain CommonJS shared with the Electron main process.
import { createDrawioSession, DRAWIO_EXPORT_BORDER, EMPTY_DIAGRAM_XML } from "./drawioEmbed.cjs";

const SVG_DATA_URL = "data:image/svg+xml;base64,AAAA";

describe("createDrawioSession", () => {
  it("loads the provided diagram source on init", () => {
    const session = createDrawioSession("<mxfile>existing</mxfile>");
    expect(session.handleMessage({ event: "init" })).toEqual({
      reply: { action: "load", xml: "<mxfile>existing</mxfile>", autosave: 0 },
      result: null
    });
  });

  it("loads the empty template when opening a new diagram", () => {
    const session = createDrawioSession("");
    const { reply } = session.handleMessage({ event: "init" });
    expect(reply).toEqual({ action: "load", xml: EMPTY_DIAGRAM_XML, autosave: 0 });
  });

  it("acknowledges a configure handshake", () => {
    const session = createDrawioSession();
    expect(session.handleMessage({ event: "configure" })).toEqual({
      reply: { action: "configure", config: {} },
      result: null
    });
  });

  it("requests an editable-SVG export with a margin when the user saves", () => {
    const session = createDrawioSession();
    expect(session.handleMessage({ event: "save", xml: "<mxfile>edited</mxfile>" })).toEqual({
      reply: { action: "export", format: "xmlsvg", border: DRAWIO_EXPORT_BORDER },
      result: null
    });
  });

  it("resolves with the editable SVG from the export reply", () => {
    const session = createDrawioSession();
    session.handleMessage({ event: "save", xml: "<mxfile>edited</mxfile>" });
    const { result } = session.handleMessage({
      event: "export",
      format: "xmlsvg",
      data: SVG_DATA_URL,
      xml: "<mxfile>edited</mxfile>"
    });
    expect(result).toEqual({
      canceled: false,
      dataUrl: SVG_DATA_URL,
      xml: "<mxfile>edited</mxfile>"
    });
  });

  it("falls back to the saved xml when the export reply omits it", () => {
    const session = createDrawioSession();
    session.handleMessage({ event: "save", xml: "<mxfile>saved</mxfile>" });
    const { result } = session.handleMessage({ event: "export", data: SVG_DATA_URL });
    expect(result).toMatchObject({ canceled: false, xml: "<mxfile>saved</mxfile>" });
  });

  it("cancels on a bare exit with no prior save", () => {
    const session = createDrawioSession("<mxfile>existing</mxfile>");
    session.handleMessage({ event: "init" });
    expect(session.handleMessage({ event: "exit" }).result).toEqual({ canceled: true });
  });

  it("ignores a trailing exit after a save (the export result is terminal)", () => {
    const session = createDrawioSession();
    session.handleMessage({ event: "save", xml: "<mxfile/>" });
    expect(session.handleMessage({ event: "exit" }).result).toBeNull();
  });

  it("ignores an export with no data and unknown events", () => {
    const session = createDrawioSession();
    expect(session.handleMessage({ event: "export" }).result).toBeNull();
    expect(session.handleMessage({ event: "whatever" })).toEqual({ reply: null, result: null });
    expect(session.handleMessage(null)).toEqual({ reply: null, result: null });
  });
});
