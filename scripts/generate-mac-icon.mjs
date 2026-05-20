import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(projectRoot, "nexus.png");
const outputPath = path.join(projectRoot, "nexus.icns");

const iconEntries = [
  { type: "icp4", size: 16 },
  { type: "icp5", size: 32 },
  { type: "icp6", size: 64 },
  { type: "ic07", size: 128 },
  { type: "ic08", size: 256 },
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 }
];

async function createPngEntry(size) {
  return sharp(sourcePath)
    .resize(size, size, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: "contain"
    })
    .png()
    .toBuffer();
}

function createIcnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(data.length + header.length, 4);
  return Buffer.concat([header, data]);
}

async function main() {
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) {
    throw new Error("nexus.png must be a readable PNG image.");
  }

  const chunks = await Promise.all(
    iconEntries.map(async ({ type, size }) => createIcnsChunk(type, await createPngEntry(size)))
  );
  const totalLength = 8 + chunks.reduce((length, chunk) => length + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(totalLength, 4);

  await fs.writeFile(outputPath, Buffer.concat([header, ...chunks], totalLength));
  console.log(`Generated ${path.relative(projectRoot, outputPath)} from ${metadata.width}x${metadata.height} ${metadata.format}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
