/**
 * @tgap/analysis — deterministic channel-history analysis engine.
 *
 * Input:  MessageRecord[] (a channel's history, ideally ≥ 1 year)
 * Output: ChannelAnalysis (cadence slots, eras, gaps, type mix, style, sources)
 *
 * No I/O and no AI here — this is the reproducible, testable core. The AI layer
 * (@tgap/ai) consumes the analysis to write prompts and generate posts.
 */
export { analyzeChannel, type AnalyzeOptions } from "./analyze.js";
export { classifyMessage } from "./classify.js";
export { detectSlots } from "./cadence.js";
export { detectEras } from "./eras.js";
export { detectGaps } from "./gaps.js";
export { candidateSources } from "./sources.js";
export {
  annotate,
  typeMix,
  postsPerDay,
  postsPerActiveDay,
  styleProfile,
  topDomains,
  type AnnotatedMessage,
  type StyleProfile,
} from "./stats.js";
