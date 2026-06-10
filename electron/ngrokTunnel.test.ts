import { describe, expect, it } from "vitest";
// The synchronous teardown used by the app's will-quit and process.exit handlers. It runs on every
// graceful exit — including when ngrok was never started — so it must be safe and idempotent. (The
// real spawn path needs the ngrok CLI and is exercised manually, not in unit tests.)
import { getTunnelState, killTunnelSync } from "./ngrok-tunnel.cjs";

describe("ngrok tunnel killTunnelSync", () => {
  it("does not throw when no tunnel is active", () => {
    expect(() => killTunnelSync()).not.toThrow();
    expect(getTunnelState().connected).toBe(false);
  });

  it("is idempotent across repeated calls (safe for exit handlers)", () => {
    killTunnelSync();
    killTunnelSync();
    const state = getTunnelState();
    expect(state.connected).toBe(false);
    expect(state.url).toBeNull();
  });
});
