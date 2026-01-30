/**
 * Markdown processing utilities for Feishu cards.
 * Uses unified/remark for robust markdown parsing and processing.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import type { Root, Paragraph, Text, Code, InlineCode, Strong, Emphasis, Delete, Link, Image, Heading, List, ListItem, Blockquote, ThematicBreak, Table } from "mdast";

/**
 * Normalize markdown content for Feishu cards.
 * Uses unified/remark to parse and normalize markdown properly.
 */
export function normalizeMarkdownForFeishu(text: string): string {
  if (!text) return "";

  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(normalizeCodeBlocks)
      .use(normalizeTables)
      .use(remarkStringify);

    const result = processor.processSync(text);
    return String(result);
  } catch (error) {
    // Fallback to original text if processing fails
    console.error("Markdown normalization failed:", error);
    return text;
  }
}

/**
 * Remark plugin to normalize code blocks.
 * Ensures code blocks have proper language identifiers.
 */
function normalizeCodeBlocks() {
  return (tree: Root) => {
    const visit = (node: unknown, callback: (node: unknown) => void) => {
      if (!node || typeof node !== "object") return;
      
      if ("type" in node && node.type === "code") {
        const codeNode = node as Code;
        // Ensure code blocks have a language identifier
        if (!codeNode.lang || codeNode.lang.trim() === "") {
          codeNode.lang = "text";
        }
      }
      
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child, callback);
        }
      }
    };
    
    visit(tree, () => {});
  };
}

/**
 * Remark plugin to normalize tables.
 * Ensures tables have proper formatting for Feishu.
 */
function normalizeTables() {
  return (tree: Root) => {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      
      if ("type" in node && node.type === "table") {
        const tableNode = node as Table;
        // Ensure table has proper structure
        // Feishu requires at least one row
        if (!tableNode.children || tableNode.children.length === 0) {
          // Remove empty tables
          return;
        }
      }
      
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    
    visit(tree);
  };
}

/**
 * Check if text contains markdown elements that benefit from card rendering.
 * Uses unified/remark to parse and check the AST.
 */
export function shouldUseCard(text: string): boolean {
  if (!text) return false;

  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm);

    const tree = processor.parse(text);

    // Check for various markdown elements in the AST
    const hasMarkdownElements = (node: unknown): boolean => {
      if (!node || typeof node !== "object") return false;

      const typedNode = node as { type?: string; children?: unknown[] };

      switch (typedNode.type) {
        case "code":
          return true; // Code blocks
        case "inlineCode":
          return true; // Inline code
        case "heading":
          return true; // Headers
        case "strong":
          return true; // Bold
        case "emphasis":
          return true; // Italic
        case "delete":
          return true; // Strikethrough
        case "link":
          return true; // Links
        case "image":
          return true; // Images
        case "blockquote":
          return true; // Blockquotes
        case "thematicBreak":
          return true; // Horizontal rules
        case "table":
          return true; // Tables
        case "list":
          return true; // Lists
        case "paragraph":
          // Check if paragraph contains any inline markdown
          if (typedNode.children) {
            return typedNode.children.some(child => hasMarkdownElements(child));
          }
          return false;
        default:
          // Recursively check children
          if (typedNode.children && typedNode.children.length > 0) {
            return typedNode.children.some(child => hasMarkdownElements(child));
          }
          return false;
      }
    };

    return hasMarkdownElements(tree);
  } catch (error) {
    // Fallback: check for basic markdown patterns
    return /(```|`|#{1,6}\s|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|^>[\s>]|^(\s*[-*+]|\s*\d+\.)\s|^(\s{0,3}(---|\*\*\*|___)\s*)$)/m.test(text);
  }
}

/**
 * Convert markdown tables to ASCII format for plain text mode.
 * Uses unified/remark to parse and convert tables.
 */
export function convertTablesToAscii(text: string): string {
  if (!text) return "";

  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(convertTablesToAsciiPlugin);

    const result = processor.processSync(text);
    return String(result);
  } catch (error) {
    // Fallback to original text if processing fails
    console.error("Table conversion failed:", error);
    return text;
  }
}

/**
 * Remark plugin to convert tables to ASCII format.
 */
function convertTablesToAsciiPlugin() {
  return (tree: Root) => {
    const visit = (node: unknown, parent: unknown, index?: number) => {
      if (!node || typeof node !== "object") return;

      if ("type" in node && node.type === "table") {
        const tableNode = node as Table;
        
        // Convert table to ASCII text
        const asciiLines: string[] = [];
        
        for (const row of tableNode.children) {
          if (row.type === "tableRow") {
            const cells = row.children
              .filter(child => child.type === "tableCell")
              .map(cell => {
                // Extract text content from cell
                const cellText = extractTextFromNode(cell);
                return cellText.trim();
              });
            
            if (cells.length > 0) {
              asciiLines.push(cells.join(" | "));
            }
          }
        }
        
        // Replace table node with paragraph containing ASCII text
        if (asciiLines.length > 0 && parent && typeof parent === "object" && "children" in parent && Array.isArray(parent.children) && index !== undefined) {
          const textNode: Paragraph = {
            type: "paragraph",
            children: [{
              type: "text",
              value: asciiLines.join("\n")
            }]
          };
          (parent.children as unknown[])[index] = textNode;
        }
      } else if ("children" in node && Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          visit(node.children[i], node, i);
        }
      }
    };
    
    visit(tree, null, undefined);
  };
}

/**
 * Extract plain text from an AST node.
 */
function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const typedNode = node as { type?: string; value?: string; children?: unknown[] };

  if (typedNode.type === "text" && typedNode.value) {
    return typedNode.value;
  }

  if (typedNode.children && typedNode.children.length > 0) {
    return typedNode.children.map(child => extractTextFromNode(child)).join("");
  }

  return "";
}