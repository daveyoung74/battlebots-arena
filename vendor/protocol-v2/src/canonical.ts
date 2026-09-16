import type { z } from "zod";
import { keccak256, stringToBytes } from "viem";
import { LIMITS } from "./schemas.js";

function scalarString(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("INVALID_DOCUMENT: lone surrogate");
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("INVALID_DOCUMENT: lone surrogate");
  }
  return JSON.stringify(value);
}

/** RFC 8785-compatible restricted profile: ASCII keys, safe integers, scalar Unicode strings. */
export function canonicalJson(value: unknown, maxBytes: number = LIMITS.documentBytes): string {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set<object>();
  function walk(item: unknown, depth: number): string {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new Error("LIMIT_EXCEEDED: JSON structure");
    if (item === null) return "null";
    if (typeof item === "boolean") return item ? "true" : "false";
    if (typeof item === "string") {
      characters += item.length;
      if (characters > maxBytes) throw new Error("LIMIT_EXCEEDED: string budget");
      return scalarString(item);
    }
    if (typeof item === "number") {
      if (!Number.isSafeInteger(item) || Object.is(item, -0)) throw new Error("INVALID_DOCUMENT: noncanonical number");
      return String(item);
    }
    if (typeof item !== "object") throw new Error("INVALID_DOCUMENT: unsupported JSON value");
    if (ancestors.has(item)) throw new Error("INVALID_DOCUMENT: cycle");
    ancestors.add(item);
    let result: string;
    if (Array.isArray(item)) {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Object.keys(descriptors).length !== item.length + 1 || Object.getOwnPropertySymbols(item).length) {
        throw new Error("INVALID_DOCUMENT: sparse or decorated array");
      }
      const values: string[] = [];
      for (let index = 0; index < item.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || descriptor.get || descriptor.set) {
          throw new Error("INVALID_DOCUMENT: array property");
        }
        values.push(walk(descriptor.value, depth + 1));
      }
      result = `[${values.join(",")}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error("INVALID_DOCUMENT: nonplain object");
      if (Object.getOwnPropertySymbols(item).length) throw new Error("INVALID_DOCUMENT: symbol key");
      const descriptors = Object.getOwnPropertyDescriptors(item);
      result = `{${Object.keys(descriptors).sort().map(key => {
        const descriptor = descriptors[key];
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || ["constructor", "prototype"].includes(key) ||
          !descriptor.enumerable || descriptor.get || descriptor.set) throw new Error("INVALID_DOCUMENT: object key/property");
        characters += key.length;
        if (characters > maxBytes) throw new Error("LIMIT_EXCEEDED: key budget");
        return `${scalarString(key)}:${walk(descriptor.value, depth + 1)}`;
      }).join(",")}}`;
    }
    ancestors.delete(item);
    return result;
  }
  const result = walk(value, 0);
  if (new TextEncoder().encode(result).length > maxBytes) throw new Error("LIMIT_EXCEEDED: document bytes");
  return result;
}

export function parseDocument<T extends z.ZodType>(schema: T, value: unknown,
  maxBytes: number = LIMITS.documentBytes): z.output<T> {
  canonicalJson(value, maxBytes); // Bound untrusted recursive values before invoking schemas.
  return schema.parse(value);
}

/** Signed/committed artifact bytes must already be canonical; duplicates/BOM/whitespace fail. */
export function parseCanonical<T extends z.ZodType>(schema: T, bytes: Uint8Array,
  maxBytes: number = LIMITS.documentBytes): z.output<T> {
  if (bytes.length > maxBytes) throw new Error("LIMIT_EXCEEDED: document bytes");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (text !== canonicalJson(value, maxBytes)) throw new Error("INVALID_DOCUMENT: noncanonical encoding");
  return schema.parse(value);
}

export function hashDocument(value: unknown, maxBytes: number = LIMITS.documentBytes) {
  return keccak256(stringToBytes(canonicalJson(value, maxBytes)));
}
