/** Importing this module registers every visualizer the content can name. */
import './InstructionTape'
import './JoinAnimator'
import './LoopTracer'
import './HttpTrace'
import './ErDiagramBuilder'

export { getVisualizer, registerVisualizer, registeredVisualizers } from './registry'
export type { VisualizerProps } from './registry'
