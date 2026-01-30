/**
 * Markdown preprocessing utilities for Feishu cards.
 * Ensures markdown content is properly formatted for Feishu's markdown renderer.
 */

/**
 * Normalize markdown content for Feishu cards.
 * This function ensures:
 * - Code blocks have proper language identifiers
 * - Tables are properly formatted
 * - Lists are properly formatted
 * - Links and images are properly formatted
 * - Other markdown elements are compatible with Feishu
 */
export function normalizeMarkdownForFeishu(text: string): string {
  if (!text) return "";

  let result = text;

  // Ensure code blocks have language identifiers
  result = normalizeCodeBlocks(result);

  // Normalize tables
  result = normalizeTables(result);

  // Normalize lists
  result = normalizeLists(result);

  // Normalize links and images
  result = normalizeLinks(result);

  // Ensure proper spacing around headers
  result = normalizeHeaders(result);

  // Normalize blockquotes
  result = normalizeBlockquotes(result);

  // Normalize horizontal rules
  result = normalizeHorizontalRules(result);

  return result;
}

/**
 * Normalize code blocks to ensure they have language identifiers.
 * Feishu supports 70+ languages for syntax highlighting.
 */
function normalizeCodeBlocks(text: string): string {
  // Match code blocks without language identifier
  // Pattern: ``` followed immediately by newline (no language)
  return text.replace(/^```(\s*\n)/gm, '```text$1');
}

/**
 * Normalize markdown tables to ensure proper formatting.
 * Feishu supports markdown tables with proper pipe syntax.
 */
function normalizeTables(text: string): string {
  // Ensure tables have proper spacing around pipes
  // This is a basic normalization; more complex table handling may be needed
  return text
    // Add space after pipe if missing
    .replace(/\|([^ \n])/g, '| $1')
    // Add space before pipe if missing
    .replace(/([^ \n])\|/g, '$1 |');
}

/**
 * Normalize markdown lists to ensure proper formatting.
 */
function normalizeLists(text: string): string {
  // Ensure there's a space between list marker and content
  // Unordered lists
  let result = text.replace(/^(\s*[-*+])([^\s])/gm, '$1 $2');
  // Ordered lists
  result = result.replace(/^(\s*\d+\.)([^\s])/gm, '$1 $2');

  return result;
}

/**
 * Normalize markdown links and images.
 */
function normalizeLinks(text: string): string {
  // Ensure links have proper format: [text](url)
  // Ensure images have proper format: ![alt](url)
  // This is mainly for validation; most links should be fine
  return text;
}

/**
 * Normalize markdown headers to ensure proper spacing.
 */
function normalizeHeaders(text: string): string {
  // Ensure there's a space after # in headers
  return text.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
}

/**
 * Normalize markdown blockquotes.
 */
function normalizeBlockquotes(text: string): string {
  // Ensure there's a space after > in blockquotes
  return text.replace(/^>([^\s])/gm, '> $1');
}

/**
 * Normalize markdown horizontal rules.
 */
function normalizeHorizontalRules(text: string): string {
  // Ensure horizontal rules are on their own line
  return text
    .replace(/^(\s*)(---|\*\*\*|___)(\s*)$/gm, '$1---$3')
    .replace(/([^\n])(---|\*\*\*|___)([^\n])/g, '$1\n$2\n$3');
}

/**
 * Check if text contains markdown elements that benefit from card rendering.
 * Used by auto render mode.
 */
export function shouldUseCard(text: string): boolean {
  // Code blocks (fenced)
  if (/```[\s\S]*?```/.test(text)) return true;
  // Inline code
  if (/`[^`]+`/.test(text)) return true;
  // Tables (at least header + separator row with |)
  if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) return true;
  // Headers
  if (/^#{1,6}\s/m.test(text)) return true;
  // Bold/italic
  if (/(\*\*[^*]+\*\*)|(\*[^*]+\*\*)|(__[^_]+__)|(_[^_]+_)/.test(text)) return true;
  // Strikethrough
  if (/~~[^~]+~~/.test(text)) return true;
  // Links
  if (/\[([^\]]+)\]\(([^)]+)\)/.test(text)) return true;
  // Images
  if (/!\[([^\]]*)\]\(([^)]+)\)/.test(text)) return true;
  // Blockquotes
  if (/^>[\s>]/m.test(text)) return true;
  // Lists (unordered or ordered)
  if (/^(\s*[-*+]|\s*\d+\.)\s/m.test(text)) return true;
  // Horizontal rules
  if (/^(\s{0,3}(---|\*\*\*|___)\s*)$/m.test(text)) return true;

  return false;
}

/**
 * Convert markdown tables to ASCII format for plain text mode.
 * This is used when renderMode is "raw".
 */
export function convertTablesToAscii(text: string): string {
  // Simple table to ASCII conversion
  // For complex tables, a more sophisticated approach may be needed
  return text.replace(/\|.+\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]+)+)/g, (match) => {
    const lines = match.trim().split('\n');
    const asciiLines: string[] = [];

    for (const line of lines) {
      // Skip separator line
      if (/^[\| ]+[-+: ]+[\| ]+$/.test(line)) continue;

      // Convert pipe-separated line to text
      const text = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim())
        .join(' | ');

      if (text) asciiLines.push(text);
    }

    if (asciiLines.length === 0) return match;
    return asciiLines.join('\n') + '\n';
  });
}