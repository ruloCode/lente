// Minimal Server-Sent Events parser for OpenAI-style chat completion streams.
// Pure: feed it chunks of text, get back the `data:` payloads that completed.

export class SseParser {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: string[] = [];
    let end: number;
    while ((end = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) events.push(data);
    }
    return events;
  }
}

/** Text delta of one chat.completion.chunk payload, or "" when it carries none. */
export function deltaText(payload: string): string {
  if (payload === "[DONE]") return "";
  try {
    const json = JSON.parse(payload);
    const content = json?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

/** Reasoning text of one chunk (`reasoning_content`), which some hosts fill while `content` stays null. */
export function deltaReasoning(payload: string): string {
  if (payload === "[DONE]") return "";
  try {
    const text = JSON.parse(payload)?.choices?.[0]?.delta?.reasoning_content;
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}
