import { defineRule } from "@oxlint/plugins";

import { isPackageSource, toPosix } from "../shared/scope.ts";

const EXTERNAL_REASON = /^\s*\**\s*external:\s.*(https?:\/\/\S+|#\d+)/s;
const SAFETY_REASON = /\bSAFETY\s*:/;
const DIRECTIVE =
  /^[\s*]*(\/\s*<reference\b|(oxlint|eslint)-(disable|enable)\b|@ts-(expect-error|ignore|nocheck|check)\b|@(vitest|jest)-environment\b|[#@]__(PURE|NO_SIDE_EFFECTS)__|@vite-ignore\b|webpack[A-Z]|@jsx(ImportSource|Runtime|Frag)?\b|(c8|v8|istanbul) ignore\b)/;
const LICENSE_BANNER = /^!/;
const LICENSE_NOTICE = /^[\s*]*(Copyright\b|SPDX-License-Identifier:|@(license|copyright)\b|Adapted from\b|(MIT|Apache-2\.0)([;\s]|$))/i;
const JSDOC_TYPE = /@(param|returns?|type|typedef|template|property|callback|import|this|satisfies|extends|implements|enum)\b/;
const PLAIN_SCRIPT = /\.[cm]?js$/;
const MESSAGE_CATALOG = /(\/i18n\/messages\/|\.i18n\.ts$)/;

function isAllowed(filename: string, type: string, value: string): boolean {
  if (DIRECTIVE.test(value) || EXTERNAL_REASON.test(value) || SAFETY_REASON.test(value) || LICENSE_NOTICE.test(value)) return true;
  if (type !== "Block") return false;
  return LICENSE_BANNER.test(value) || (value.startsWith("*") && PLAIN_SCRIPT.test(filename) && JSDOC_TYPE.test(value));
}

export const noCommentsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow explanatory comments in product code while preserving license notices, attribution, directives and external references.",
    },
    messages: {
      comment:
        "Product code takes no new explanatory comments. Copyright, license notices and source attribution stay with copied or adapted code. A comment that explains a workaround: remove the cause of the workaround instead. A comment that says what the code does: rename until the code says it. A design reason goes in the module's DOCUMENTATION.md. External references use `// external: <url or #issue>` with a line about a browser bug, upstream behavior or a spec.",
    },
  },
  createOnce(context) {
    return {
      Program() {
        const filename = toPosix(context.filename);
        if (!isPackageSource(filename) || MESSAGE_CATALOG.test(filename)) return;
        let allowedNoteEndLine = -1;
        for (const comment of context.sourceCode.getAllComments()) {
          const continuesAllowedNote = comment.type === "Line" && comment.loc.start.line === allowedNoteEndLine + 1;
          if (continuesAllowedNote || isAllowed(filename, comment.type, comment.value)) {
            allowedNoteEndLine = comment.type === "Line" ? comment.loc.end.line : -1;
            continue;
          }
          allowedNoteEndLine = -1;
          context.report({ loc: comment.loc, messageId: "comment" });
        }
      },
    };
  },
});
