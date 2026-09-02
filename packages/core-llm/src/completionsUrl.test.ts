/**
 * Purpose: unit tests for baseUrl validation — the gate that keeps the Bearer key off
 * plaintext links and keeps a stray query string from redirecting the whole conversation.
 */
import { describe, expect, it } from "vitest";
import { completionsUrl } from "./completionsUrl";

describe("completionsUrl", () => {
  it("appends the path to an https base, with or without a trailing slash", () => {
    expect(completionsUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(completionsUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(completionsUrl("https://api.example.com")).toBe(
      "https://api.example.com/chat/completions",
    );
  });

  it("allows plain http on loopback — a local Ollama or LM Studio has no certificate", () => {
    expect(completionsUrl("http://127.0.0.1:11434/v1")).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    );
    expect(completionsUrl("http://localhost:1234/v1")).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
    expect(completionsUrl("http://[::1]:8080/v1")).toBe("http://[::1]:8080/v1/chat/completions");
  });

  it("refuses plain http to anywhere else — the API key travels as a Bearer header", () => {
    for (const baseUrl of [
      "http://proxy.example.com:8080/v1",
      "http://192.168.1.10:8080/v1",
      "http://127.0.0.1.evil.example/v1",
    ]) {
      expect(() => completionsUrl(baseUrl)).toThrow("must be https");
    }
  });

  it("refuses anything that is not http(s), and anything unparseable", () => {
    expect(() => completionsUrl("ftp://api.example.com/v1")).toThrow("must be https");
    expect(() => completionsUrl("file:///etc/passwd")).toThrow("must be https");
    expect(() => completionsUrl("api.example.com/v1")).toThrow("not a valid absolute URL");
    expect(() => completionsUrl("")).toThrow("not a valid absolute URL");
  });

  it("drops query and fragment, which would otherwise swallow the path", () => {
    expect(completionsUrl("https://api.example.com/v1?token=abc#x")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });
});
