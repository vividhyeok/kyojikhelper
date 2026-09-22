import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStructuredResponse } from "./response-processing";

const schema = z.object({ value: z.string() });
describe("Responses status before JSON parsing", () => {
  it("parses completed structured output", () => {
    expect(parseStructuredResponse({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"value":"ok"}' }] }] }, schema)).toEqual({ value: "ok" });
  });
  it("classifies incomplete, empty, invalid JSON, and schema mismatch", () => {
    expect(() => parseStructuredResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: '{"value":"cut' }, schema)).toThrowError(expect.objectContaining({ stage: "openai_incomplete", retryable: true }));
    expect(() => parseStructuredResponse({ status: "completed", output_text: "" }, schema)).toThrowError(expect.objectContaining({ stage: "empty_output" }));
    expect(() => parseStructuredResponse({ status: "completed", output_text: "{" }, schema)).toThrowError(expect.objectContaining({ stage: "json_parse" }));
    expect(() => parseStructuredResponse({ status: "completed", output_text: "{}" }, schema)).toThrowError(expect.objectContaining({ stage: "schema_validation" }));
  });
});
