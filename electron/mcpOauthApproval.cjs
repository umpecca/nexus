// Native owner approval is the authentication boundary for OAuth. Nothing in the browser form
// authenticates the owner, and MCP's auto-approve-writes setting cannot approve a connection.
async function confirmMcpOauthConnection(dialog, parentWindow, { clientName, redirectUri }) {
  // Client-controlled labels must not insert fake lines into the trusted dialog's explanation.
  const displayName = String(clientName).replace(/[\x00-\x1f\x7f]/g, " ");
  const displayRedirect = String(redirectUri).replace(/[\x00-\x1f\x7f]/g, " ");
  const options = {
    type: "warning",
    title: "Authorize MCP connection",
    message: "Allow this client to connect to Nexus?",
    detail: `Client name (provided by the client): ${displayName}\nCallback address: ${displayRedirect}\n\n` +
      "Only approve if you just started this connection in your AI client. " +
      "Approval grants access to your open documents and permits edit requests, subject to your MCP write settings.",
    buttons: ["Deny", "Allow connection"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  };
  const result = parentWindow && !parentWindow.isDestroyed()
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
}

module.exports = { confirmMcpOauthConnection };
