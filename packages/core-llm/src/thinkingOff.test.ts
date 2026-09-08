import { describe, expect, it } from "vitest";
import { thinkingOffFields } from "./thinkingOff";

describe("thinkingOffFields", () => {
  it("turns DeepSeek's deliberation off, which it leaves on by default", () => {
    expect(thinkingOffFields("deepseek-v4-flash")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingOffFields("deepseek-v4-pro")).toEqual({ thinking: { type: "disabled" } });
  });

  it("uses Qwen3's own spelling of the same switch, wherever it is hosted", () => {
    expect(thinkingOffFields("Qwen/Qwen3-8B")).toEqual({ enable_thinking: false });
    expect(thinkingOffFields("qwen3.5-4b")).toEqual({ enable_thinking: false });
  });

  it("sends nothing extra to a model it does not know, because an unknown field is a 400", () => {
    expect(thinkingOffFields("glm-4-flash-250414")).toEqual({});
    expect(thinkingOffFields("gemini-3.5-flash-lite")).toEqual({});
    expect(thinkingOffFields("qwen-flash")).toEqual({});
  });
});
