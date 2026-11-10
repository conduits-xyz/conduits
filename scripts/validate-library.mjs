import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../library", import.meta.url));
const reservedTags = new Set(["api", "forms", "javascript", "react", "html", "fetch", "static"]);
const maxTags = 5;
const allowedSocialNetworks = new Set(["github", "x", "bluesky"]);
const maxSocialNetworks = 3;
const socialHandlePatterns = {
  github: /^[A-Za-z0-9-]{1,39}$/,
  x: /^@?[A-Za-z0-9_]{1,15}$/,
  bluesky: /^@?[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/,
};
const maxNameLength = 80;
const maxDescriptionLength = 280;
const allowedFields = {
  widget: new Set(["slug", "name", "kind", "description", "tags", "author", "demo"]),
  page: new Set(["slug", "name", "kind", "description", "tags", "author", "widgets"]),
};
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const customElementPattern = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;
const errors = [];
const metadata = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    if (entry.isFile() && (entry.name === "widget.json" || entry.name === "page.json")) {
      metadata.push({ path, value: JSON.parse(await readFile(path, "utf8")) });
    }
  }
}

function requireString(value, field, path, maxLength = Infinity) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${relative(process.cwd(), path)}: ${field} must be a non-empty string`);
  } else if (value.trim().length > maxLength) {
    errors.push(`${relative(process.cwd(), path)}: ${field} must be ${maxLength} characters or fewer`);
  }
}

function validateAuthor(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${relative(process.cwd(), path)}: author must be an object`);
    return;
  }
  requireString(value.name, "author.name", path, maxNameLength);
  if (value.social !== undefined) {
    if (!value.social || typeof value.social !== "object" || Array.isArray(value.social)) {
      errors.push(`${relative(process.cwd(), path)}: author.social must be an object`);
    } else {
      const networks = Object.keys(value.social);
      if (networks.length > maxSocialNetworks) {
        errors.push(`${relative(process.cwd(), path)}: author.social may list no more than ${maxSocialNetworks} networks`);
      }
      for (const network of networks) {
        const handle = value.social[network];
        if (!allowedSocialNetworks.has(network)) {
          errors.push(`${relative(process.cwd(), path)}: author.social.${network} is not an approved network`);
        }
        if (typeof handle !== "string" || !socialHandlePatterns[network]?.test(handle)) {
          errors.push(`${relative(process.cwd(), path)}: author.social.${network} must be a handle, not a URL`);
        }
      }
    }
  }
  for (const field of Object.keys(value)) {
    if (!["name", "social"].includes(field)) {
      errors.push(`${relative(process.cwd(), path)}: author.${field} is not allowed`);
    }
  }
}

function validateTags(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${relative(process.cwd(), path)}: tags must contain between 1 and ${maxTags} values`);
    return;
  }
  if (value.length > maxTags) {
    errors.push(`${relative(process.cwd(), path)}: tags must contain no more than ${maxTags} values`);
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${relative(process.cwd(), path)}: tags must not contain duplicates`);
  }
  for (const tag of value) {
    if (typeof tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag) || tag.length > 32) {
      errors.push(`${relative(process.cwd(), path)}: tags must use lowercase words separated by single hyphens`);
    } else if (reservedTags.has(tag)) {
      errors.push(`${relative(process.cwd(), path)}: tag is reserved for implementation or delivery details: ${tag}`);
    }
  }
}

await walk(root);

for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  const fields = allowedFields[value.kind];
  if (!fields) {
    errors.push(`${label}: kind must be widget or page`);
    continue;
  }
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) errors.push(`${label}: ${field} is not allowed`);
  }
  requireString(value.slug, "slug", path);
  requireString(value.name, "name", path, maxNameLength);
  requireString(value.description, "description", path, maxDescriptionLength);
  validateAuthor(value.author, path);
  if (typeof value.slug !== "string" || !slugPattern.test(value.slug)) {
    errors.push(`${label}: slug must contain only lowercase letters, numbers, and single hyphens`);
  }
  if (value.kind === "widget" && (typeof value.slug !== "string" || !customElementPattern.test(value.slug))) {
    errors.push(`${label}: widget slug must be a valid custom-element name using lowercase letters, numbers, and hyphens`);
  }
  validateTags(value.tags, path);
  if (value.kind === "widget") {
    requireString(value.demo, "demo", path);
    if (typeof value.demo === "string") {
      try {
        await access(join(path, "..", value.demo));
      } catch {
        errors.push(`${label}: demo file does not exist: ${value.demo}`);
      }
    }
  } else if (value.widgets !== undefined && !Array.isArray(value.widgets)) {
    errors.push(`${label}: widgets must be an array when provided`);
  }
}

const slugs = new Set();
const widgets = new Map();
const pages = new Map();
for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  if (slugs.has(value.slug)) errors.push(`${label}: duplicate slug ${value.slug}`);
  slugs.add(value.slug);
  const expectedPath = join(root, value.kind === "widget" ? "widgets" : "pages", value.slug, `${value.kind}.json`);
  if (path !== expectedPath) errors.push(`${label}: metadata path does not match kind and slug`);
  (value.kind === "widget" ? widgets : pages).set(value.slug, value);
}

for (const { path, value } of metadata) {
  const label = relative(process.cwd(), path);
  const references = value.widgets;
  const referenced = widgets;
  if (Array.isArray(references)) {
    for (const slug of references) {
      if (typeof slug !== "string" || !referenced.has(slug)) {
        errors.push(`${label}: references missing widget ${slug}`);
      }
    }
  }
}

const licenseText = await readFile(join(fileURLToPath(new URL("..", import.meta.url)), "LICENSE"), "utf8");
if (!/^MIT License\s/m.test(licenseText)) {
  errors.push("LICENSE: the repository license must be MIT");
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
