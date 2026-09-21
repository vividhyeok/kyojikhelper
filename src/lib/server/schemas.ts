import { z } from "zod";
export const stateSchema = z.object({
  currentTopic: z.string().max(120),
  conceptChain: z.array(z.string().max(120)).max(10),
  recentClaims: z.array(z.string().max(240)).max(8),
  unresolved: z.array(z.string().max(160)).max(8),
  professorPosition: z.string().max(300).nullable(),
});
export const analyzeRequestSchema = z.object({
  mode: z.enum(["auto", "missed", "why"]).default("auto"),
  density: z.enum(["minimal", "normal"]).default("minimal"),
  profile: z.string().max(2000),
  state: stateSchema,
  recent: z.array(z.string().max(800)).max(12),
  pending: z.array(z.string().max(800)).max(12),
});
export const analysisSchema = z.object({
  shouldDisplay: z.boolean(),
  eventType: z.enum([
    "none",
    "bridge",
    "definition",
    "prerequisite",
    "orientation",
    "contrast",
  ]),
  confidence: z.number().min(0).max(1),
  currentTopic: z.string().max(120),
  professorMove: z.string().max(200).nullable(),
  fromConcept: z.string().max(100).nullable(),
  toConcept: z.string().max(100).nullable(),
  missingBridge: z.string().max(280).nullable(),
  prerequisite: z.string().max(240).nullable(),
  shortExplanation: z.string().max(360).nullable(),
  nextFocus: z.string().max(180).nullable(),
  importance: z.enum(["low", "normal", "high"]),
  statePatch: z.object({
    currentTopic: z.string().max(120).optional(),
    conceptChain: z.array(z.string().max(100)).max(8).optional(),
    recentClaims: z.array(z.string().max(200)).max(5).optional(),
    unresolved: z.array(z.string().max(120)).max(5).optional(),
  }),
});
export const finalizeSchema = z.object({
  title: z.string().max(120),
  state: stateSchema,
  transcript: z.array(z.string().max(1200)).max(500),
  events: z
    .array(
      z.object({
        fromConcept: z.string().nullable(),
        toConcept: z.string().nullable(),
        missingBridge: z.string().nullable(),
        shortExplanation: z.string().nullable(),
      }),
    )
    .max(100),
});
export const finalNoteSchema = z.object({
  overview: z.array(z.string().max(100)).max(12),
  keyPoints: z.array(z.string().max(240)).max(8),
  bridges: z
    .array(
      z.object({
        from: z.string().max(100),
        to: z.string().max(100),
        explanation: z.string().max(300),
      }),
    )
    .max(10),
  terms: z
    .array(
      z.object({ term: z.string().max(100), meaning: z.string().max(240) }),
    )
    .max(12),
  structure: z.string().max(1500),
  review: z.string().max(2500),
});
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shouldDisplay: { type: "boolean" },
    eventType: {
      type: "string",
      enum: [
        "none",
        "bridge",
        "definition",
        "prerequisite",
        "orientation",
        "contrast",
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    currentTopic: { type: "string" },
    professorMove: { type: ["string", "null"] },
    fromConcept: { type: ["string", "null"] },
    toConcept: { type: ["string", "null"] },
    missingBridge: { type: ["string", "null"] },
    prerequisite: { type: ["string", "null"] },
    shortExplanation: { type: ["string", "null"] },
    nextFocus: { type: ["string", "null"] },
    importance: { type: "string", enum: ["low", "normal", "high"] },
    statePatch: {
      type: "object",
      additionalProperties: false,
      properties: {
        currentTopic: { type: ["string", "null"] },
        conceptChain: { type: ["array", "null"], items: { type: "string" } },
        recentClaims: { type: ["array", "null"], items: { type: "string" } },
        unresolved: { type: ["array", "null"], items: { type: "string" } },
      },
      required: ["currentTopic", "conceptChain", "recentClaims", "unresolved"],
    },
  },
  required: [
    "shouldDisplay",
    "eventType",
    "confidence",
    "currentTopic",
    "professorMove",
    "fromConcept",
    "toConcept",
    "missingBridge",
    "prerequisite",
    "shortExplanation",
    "nextFocus",
    "importance",
    "statePatch",
  ],
} as const;
