export { VisitDetector, detectVisits, DETECTOR_DEFAULTS } from "./detector.ts";
export type { DetectorOptions } from "./detector.ts";
export {
  InteractionDetector,
  detectInteractions,
  INTERACTION_DEFAULTS,
} from "./interactions.ts";
export type { InteractionOptions, Interaction } from "./interactions.ts";
export { startServer, parseDeviceState, parseDistanceLogLine, InteractionStore } from "./server.ts";
export type { ServerOptions, DeviceState, StoredInteraction, LiveState } from "./server.ts";
export { synthTrace, rng } from "./synthetic.ts";
export type { TraceSpec, VisitSpec } from "./synthetic.ts";
export { mad, median, percentile, sortedAsc } from "./stats.ts";
export type { Sample, Visit } from "./types.ts";
