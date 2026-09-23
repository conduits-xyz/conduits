// The styling contract for every mother widget: structure/behavior live
// in the JSON/Zod spec (schema.ts), appearance lives entirely in these
// --xyz-* custom properties. A conduit owner who never touches CSS
// still gets a usable, polished page — that's what the default values
// below are for; a self-hosted operator or a future theming feature
// overrides them by redeclaring the same names, never by editing this
// file or reaching into widget internals.
export const DEFAULT_XYZ_STYLES = `
:root {
  --xyz-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --xyz-font-size: 1rem;
  --xyz-color: #1a1a1a;
  --xyz-muted-color: #6b7280;
  --xyz-background: #ffffff;
  --xyz-surface: #f9fafb;
  --xyz-border-color: #e5e7eb;
  --xyz-border-radius: 8px;
  --xyz-spacing: 1rem;
  --xyz-input-background: #ffffff;
  --xyz-input-border: #d1d5db;
  --xyz-button-background: #111827;
  --xyz-button-color: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --xyz-color: #f3f4f6;
    --xyz-muted-color: #9ca3af;
    --xyz-background: #111214;
    --xyz-surface: #1a1b1e;
    --xyz-border-color: #2e3033;
    --xyz-input-background: #1a1b1e;
    --xyz-input-border: #3a3d41;
    --xyz-button-background: #f3f4f6;
    --xyz-button-color: #111214;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: calc(var(--xyz-spacing) * 2) var(--xyz-spacing);
  font-family: var(--xyz-font-family);
  font-size: var(--xyz-font-size);
  color: var(--xyz-color);
  background: var(--xyz-background);
}

.xyz-page {
  max-width: 40rem;
  margin: 0 auto;
}

xyz-form,
xyz-table {
  display: block;
}

.xyz-block-title {
  margin: 0 0 calc(var(--xyz-spacing) / 4);
  font-size: 1.5rem;
  font-weight: 600;
}

.xyz-block-description {
  margin: 0 0 var(--xyz-spacing);
  color: var(--xyz-muted-color);
}

.xyz-field {
  margin-bottom: var(--xyz-spacing);
  display: flex;
  flex-direction: column;
  gap: calc(var(--xyz-spacing) / 4);
}

.xyz-field label {
  font-weight: 500;
}

.xyz-field input,
.xyz-field textarea,
.xyz-field select {
  font: inherit;
  color: var(--xyz-color);
  background: var(--xyz-input-background);
  border: 1px solid var(--xyz-input-border);
  border-radius: var(--xyz-border-radius);
  padding: calc(var(--xyz-spacing) / 2);
}

.xyz-field textarea {
  min-height: 6rem;
  resize: vertical;
}

.xyz-field-checkbox {
  flex-direction: row;
  align-items: center;
}

.xyz-field-checkbox input {
  width: auto;
}

.xyz-submit {
  font: inherit;
  font-weight: 600;
  color: var(--xyz-button-color);
  background: var(--xyz-button-background);
  border: none;
  border-radius: var(--xyz-border-radius);
  padding: calc(var(--xyz-spacing) / 2) var(--xyz-spacing);
  cursor: pointer;
}

.xyz-success,
.xyz-error {
  padding: var(--xyz-spacing);
  border-radius: var(--xyz-border-radius);
  background: var(--xyz-surface);
  border: 1px solid var(--xyz-border-color);
}

.xyz-error h1 {
  margin-top: 0;
  font-size: 1.25rem;
}

.xyz-table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--xyz-border-color);
  border-radius: var(--xyz-border-radius);
}

table.xyz-table {
  width: 100%;
  border-collapse: collapse;
}

table.xyz-table th,
table.xyz-table td {
  text-align: left;
  padding: calc(var(--xyz-spacing) / 2);
  border-bottom: 1px solid var(--xyz-border-color);
}

table.xyz-table th {
  background: var(--xyz-surface);
  font-weight: 600;
}

table.xyz-table tr:last-child td {
  border-bottom: none;
}

.xyz-table-empty {
  color: var(--xyz-muted-color);
  text-align: center;
}

.xyz-table-nav {
  margin-top: var(--xyz-spacing);
  text-align: right;
}

.xyz-table-nav a {
  color: var(--xyz-color);
}
`.trim()
