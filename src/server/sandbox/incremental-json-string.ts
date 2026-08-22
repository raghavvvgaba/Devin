const MAX_BUFFER_LENGTH = 20_000;

type ParsedString = {
  complete: boolean;
  end: number;
  value: string;
};

function isHex(value: string) {
  return /^[0-9a-f]$/i.test(value);
}

function parseJsonString(input: string, start: number): ParsedString | null {
  if (input[start] !== '"') return null;

  let value = "";
  let index = start + 1;

  while (index < input.length) {
    const character = input[index]!;

    if (character === '"') {
      return { complete: true, end: index + 1, value };
    }

    if (character !== "\\") {
      const code = character.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = input[index + 1];
        if (low === undefined) {
          return { complete: false, end: input.length, value };
        }

        const lowCode = low.charCodeAt(0);
        if (lowCode < 0xdc00 || lowCode > 0xdfff) return null;
        value += `${character}${low}`;
        index += 2;
        continue;
      }

      value += character;
      index += 1;
      continue;
    }

    const escape = input[index + 1];
    if (escape === undefined) {
      return { complete: false, end: input.length, value };
    }

    const simpleEscapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };

    if (escape in simpleEscapes) {
      value += simpleEscapes[escape];
      index += 2;
      continue;
    }

    if (escape !== "u") {
      return null;
    }

    const codeText = input.slice(index + 2, index + 6);
    if (codeText.length < 4) {
      return { complete: false, end: input.length, value };
    }
    if (![...codeText].every(isHex)) {
      return null;
    }

    const code = Number.parseInt(codeText, 16);
    if (code >= 0xd800 && code <= 0xdbff) {
      const lowPrefix = input.slice(index + 6, index + 8);
      const lowText = input.slice(index + 8, index + 12);

      if (lowPrefix.length < 2 || lowText.length < 4) {
        return { complete: false, end: input.length, value };
      }
      if (lowPrefix !== "\\u" || ![...lowText].every(isHex)) {
        return null;
      }

      const lowCode = Number.parseInt(lowText, 16);
      if (lowCode < 0xdc00 || lowCode > 0xdfff) {
        return null;
      }

      value += String.fromCodePoint(
        0x10000 + (code - 0xd800) * 0x400 + (lowCode - 0xdc00),
      );
      index += 12;
      continue;
    }

    value += String.fromCharCode(code);
    index += 6;
  }

  return { complete: false, end: input.length, value };
}

function skipWhitespace(input: string, start: number) {
  let index = start;
  while (index < input.length && /\s/.test(input[index]!)) index += 1;
  return index;
}

function skipJsonValue(input: string, start: number): number | null {
  const valueStart = skipWhitespace(input, start);

  if (input[valueStart] === '"') {
    const parsed = parseJsonString(input, valueStart);
    return parsed?.complete ? parsed.end : null;
  }

  let index = valueStart;
  let depth = 0;
  let inString = false;
  let escaped = false;

  while (index < input.length) {
    const character = input[index]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") {
      if (depth === 0) return index;
      depth -= 1;
    } else if (character === "," && depth === 0) {
      return index;
    }

    index += 1;
  }

  return null;
}

export function extractPartialJsonStringField(
  input: string,
  fieldName: string,
): string | null {
  let index = skipWhitespace(input, 0);
  if (input[index] !== "{") return null;
  index += 1;

  while (index < input.length) {
    index = skipWhitespace(input, index);
    if (input[index] === "}") return null;

    const key = parseJsonString(input, index);
    if (!key?.complete) return null;
    index = skipWhitespace(input, key.end);
    if (input[index] !== ":") return null;
    index = skipWhitespace(input, index + 1);

    if (key.value === fieldName) {
      return parseJsonString(input, index)?.value ?? null;
    }

    const valueEnd = skipJsonValue(input, index);
    if (valueEnd === null) return null;
    index = skipWhitespace(input, valueEnd);

    if (input[index] === ",") {
      index += 1;
      continue;
    }
    if (input[index] === "}") return null;
    return null;
  }

  return null;
}

export class IncrementalJsonStringField {
  private buffer = "";
  private emitted = "";

  constructor(private readonly fieldName: string) {}

  push(chunk: string) {
    this.buffer += chunk;

    if (this.buffer.length > MAX_BUFFER_LENGTH) {
      throw new Error("The streamed structured response exceeded the safe size limit.");
    }

    const value = extractPartialJsonStringField(this.buffer, this.fieldName);
    if (value === null || value === this.emitted) return "";
    if (!value.startsWith(this.emitted)) {
      throw new Error("The streamed structured response changed previously emitted text.");
    }

    const delta = value.slice(this.emitted.length);
    this.emitted = value;
    return delta;
  }
}
