# Custom CSS

Save `custom.css` in the connected OpenChamber server's data directory. The
default path is `~/.config/openchamber/custom.css`; `OPENCHAMBER_DATA_DIR` selects
a different data directory. Create the file yourself with a text editor.

**Settings → Appearance → Use custom CSS** enables or disables it on this device.
The switch defaults to enabled. File creation, edits, atomic saves and deletion
reach open clients automatically, usually within two seconds. Removing or
emptying the file clears its styles. A failed read retains the current client's
last successful styles until the next successful read or server switch.

The file comes from the active server on web, desktop, hosted mobile and
Capacitor mobile. Switching servers clears the previous server's stylesheet
immediately. VS Code uses its host's styling and does not load this file.
Styles do not cross iframe or shadow-root boundaries.

## Example

Narrow the chat composer and round its surface:

```css
.chat-input-column {
  max-width: 640px !important;
}

.oc-composer-surface {
  border-radius: 24px !important;
}
```

The stylesheet follows theme variables and keeps that order after theme changes.
Normal CSS specificity, cascade layers and inline styles still apply, so an
inline radius needs `!important`. Class and data selectors are implementation
details and can change when updating the app.

## Recovery and limits

If a rule hides the interface, open the app URL with `?custom-css=off` (or append
`&custom-css=off` to an existing query). This bypasses the stylesheet for that
page without changing the saved preference. Delete or fix the file, or turn off
the switch, then remove the query parameter and reload. A desktop window with
an inaccessible interface can also be recovered by renaming the file on its
connected server and reopening the window.

Use CSS from sources you trust: it can hide controls and make network requests
allowed by the app's existing content security policy. The file is limited to
512 KiB and is inserted as stylesheet text, never HTML. The endpoint accepts no
file path and provides no file-writing API. Relative URLs resolve against the
client page, not the server's filesystem. Invalid CSS follows browser parsing
rules; it is not validated or repaired by OpenChamber.

## Bundled appearance

This fork's composer, chat gutters, menus, selection toolbar, text selection,
prose rhythm and content-card styles live in
`packages/ui/src/styles/fork-defaults.css`. They work without a local CSS file
or the custom CSS setting. Code uses its code-size token and uniform 450 weight;
prose uses 500 weight. The default interface weight is 500 and remains adjustable
in Appearance.
`custom.css` loads afterward and can override them. Code colors belong to the
theme's syntax palette; the bundled stylesheet reads those tokens.
