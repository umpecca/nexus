// Vendors the drawio web app into public/drawio/ so Nexus can host the diagram editor fully offline
// (no calls to diagrams.net at runtime). drawio publishes no clean npm distribution of its web app,
// so we pin a release and extract its `src/main/webapp` directory from the GitHub source tarball.
// Run once after cloning, and again to bump the pinned version:
//
//   npm run fetch:drawio              # uses DEFAULT_DRAWIO_VERSION below
//   npm run fetch:drawio -- 24.7.17   # or pass an explicit version tag
//
// Requires `tar` on PATH (bundled with Windows 10+/Server, macOS, and Linux). The result is large
// (tens of MB) and is git-ignored — CI/packaging should run this before `vite build`.
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DRAWIO_VERSION = "30.2.5";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const destDir = path.join(repoRoot, "public", "drawio");

async function main() {
  const version = process.argv[2] || process.env.DRAWIO_VERSION || DEFAULT_DRAWIO_VERSION;
  const tarballUrl = `https://github.com/jgraph/drawio/archive/refs/tags/v${version}.tar.gz`;
  console.log(`Fetching drawio v${version} from ${tarballUrl}`);

  const work = await mkdtemp(path.join(tmpdir(), "nexus-drawio-"));
  const tarballPath = path.join(work, "drawio.tgz");
  try {
    const response = await fetch(tarballUrl);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tarballPath, buffer);
    console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    // Extract only the web app subtree. Run tar from the work dir with a RELATIVE archive name so
    // no Windows drive-letter path (`C:\…`) is passed to `-f` — GNU tar would otherwise read the
    // colon as a remote host. This keeps the invocation portable across GNU tar (Git Bash) and
    // bsdtar (Windows System32 / macOS).
    const webappMember = `drawio-${version}/src/main/webapp`;
    execFileSync("tar", ["-xzf", "drawio.tgz", webappMember], { cwd: work, stdio: "inherit" });

    // Replace any previously vendored copy so a version bump never leaves stale files behind, but
    // keep the git-tracked placeholders (README.md, .gitkeep) — never nuke the whole directory.
    await mkdir(destDir, { recursive: true });
    const tracked = new Set(["README.md", ".gitkeep"]);
    for (const entry of await readdir(destDir).catch(() => [])) {
      if (!tracked.has(entry)) {
        await rm(path.join(destDir, entry), { recursive: true, force: true });
      }
    }
    await cp(path.join(work, "drawio-" + version, "src", "main", "webapp"), destDir, {
      recursive: true
    });

    const entries = await readdir(destDir);
    if (!entries.includes("index.html")) {
      throw new Error(
        "Extraction did not produce index.html — check the version tag and the tarball layout."
      );
    }
    // Keep the directory tracked even after a `git clean` of the (ignored) vendored files.
    await writeFile(path.join(destDir, ".gitkeep"), "");
    console.log(`Vendored drawio v${version} into public/drawio/ (${entries.length} top-level entries).`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
