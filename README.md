# Nexus

Nexus is an application for creating/editing Markdown files. The goal is to have an easy to use visual first editor with inline AI capability that can watch/show the differences when it is modified by Agents. It is useful for people working with Markdown writing technical documentation, business presentations, paperwork heavy bureaucracy nonsense, etc...

## Tech Stack

- native application based on web technologies using [Electron](https://www.electronjs.org/)
- [react](https://react.dev/)
- [mdxeditor](https://mdxeditor.dev/)

## Publishing

Nexus can publish a document as a self-contained HTML page to your own server,
either over SFTP or over a simple HTTP endpoint called QuickConnect. If you want
to build a server that accepts QuickConnect pushes, see the
[QuickConnect Publishing Specification](docs/quickconnect.md).
