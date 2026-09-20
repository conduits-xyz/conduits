import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../library", import.meta.url));
const allowedKinds = new Set(["widget", "example"]);
const allowedStatuses = new Set(["official", "verified-community"]);
const allowedCategories = new Set(["capture", "feedback", "events", "content", "engagement", "utilities"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const tagPattern = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;
const errors = [];
const metadata = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    if (entry.isFile() && (entry.name === "widget.json" || entry.name === "example.json")) {
      metadata.push({ path, value: JSON.parse(await readFile(path, "utf8")) });
    }
  }
}

function requireString(value, field, path) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${relative(process.cwd(), path)}: ${field} must be a non-empty string`);
  }
}

function validateAuthor(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${relative(process.cwd(), path)}: author must be an object`);
    return;
  }
  requireString(value.name, "author.name", path);
  for (const field of ["url", "twitter", "websiteTitle", "websiteUrl"]) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      errors.push(`${relative(process.cwd(), path)}: author.${field} must be a string`);
    }
  }
}

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && buffer.toString("ascii", 12, 16) === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (buffer.length >= 25 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && buffer.toString("ascii", 12, 16) === "VP8L" && buffer[20] === 0x2f) {
    return {
      width: 1 + ((buffer[21] | (buffer[22] << 8)) & 0x3fff),
      height: 1 + (((buffer[22] >> 6) | (buffer[23] << 2) | (buffer[24] << 10)) & 0x3fff),
    };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && buffer.toString("ascii", 12, 16) === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

await walk(root);

for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  for (const field of ["slug", "name", "description", "license"]) {
    requireString(value[field], field, path);
  }
  validateAuthor(value.author, path);
  if (typeof value.slug !== "string" || !slugPattern.test(value.slug)) {
    errors.push(`${label}: slug must contain only lowercase letters, numbers, and single hyphens`);
  }
  if (!allowedKinds.has(value.kind)) errors.push(`${label}: kind must be widget or example`);
  if (!allowedCategories.has(value.category)) errors.push(`${label}: category is not approved`);
  if (value.screenshot !== null && typeof value.screenshot !== "string") errors.push(`${label}: screenshot must be a string or null`);
  if (typeof value.screenshot === "string") {
    if (value.screenshot.startsWith("/") || value.screenshot.split("/").includes("..")) errors.push(`${label}: screenshot must stay inside its item directory`);
    const screenshotPath = join(path, "..", value.screenshot);
    try {
      await access(screenshotPath);
      if (!/\.(png|webp)$/i.test(value.screenshot)) errors.push(`${label}: screenshot must be PNG or WebP`);
      const dimensions = imageDimensions(await readFile(screenshotPath));
      if (!dimensions || dimensions.width !== 1600 || dimensions.height !== 1000) {
        errors.push(`${label}: screenshot must be a readable 1600x1000 PNG or WebP`);
      }
    } catch {
      errors.push(`${label}: screenshot file does not exist: ${value.screenshot}`);
    }
  }
  if (value.kind === "widget") {
    if (!allowedStatuses.has(value.status)) errors.push(`${label}: status is not approved`);
    requireString(value.source, "source", path);
    requireString(value.reviewedAt, "reviewedAt", path);
    if (typeof value.featured !== "boolean") errors.push(`${label}: featured must be boolean`);
    if (!Array.isArray(value.examples)) errors.push(`${label}: examples must be an array`);
    requireString(value.tag, "tag", path);
    if (typeof value.tag === "string" && !tagPattern.test(value.tag)) errors.push(`${label}: tag must be a valid custom-element name`);
    requireString(value.demo, "demo", path);
    if (typeof value.demo === "string") {
      try {
        await access(join(path, "..", value.demo));
      } catch {
        errors.push(`${label}: demo file does not exist: ${value.demo}`);
      }
    }
  } else if (!Array.isArray(value.widgets)) {
    errors.push(`${label}: widgets must be an array`);
  }
}

const slugs = new Set();
const widgets = new Map();
const examples = new Map();
for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  if (slugs.has(value.slug)) errors.push(`${label}: duplicate slug ${value.slug}`);
  slugs.add(value.slug);
  const expectedPath = join(root, value.kind === "widget" ? "widgets" : "examples", value.slug, `${value.kind}.json`);
  if (path !== expectedPath) errors.push(`${label}: metadata path does not match kind and slug`);
  (value.kind === "widget" ? widgets : examples).set(value.slug, value);
}

for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  const references = value.kind === "widget" ? value.examples : value.widgets;
  const referenced = value.kind === "widget" ? examples : widgets;
  if (Array.isArray(references)) {
    for (const slug of references) {
      if (typeof slug !== "string" || !referenced.has(slug)) {
        errors.push(`${label}: references missing ${value.kind === "widget" ? "example" : "widget"} ${slug}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const catalog = metadata
  .sort((left, right) => left.value.kind.localeCompare(right.value.kind) || left.value.slug.localeCompare(right.value.slug))
  .map(({ value }) => value);
await writeFile(join(root, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Validated ${metadata.length} library metadata files.`);
