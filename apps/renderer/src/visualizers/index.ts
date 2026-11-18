/** Importing this module registers every visualizer the content can name. */
import './InstructionTape'
import './JoinAnimator'
import './LoopTracer'
import './HttpTrace'
import './ErDiagramBuilder'
import '../atlas/ToolAtlas'

export { getVisualizer, registerVisualizer, registeredVisualizers } from './registry'
export type { VisualizerProps } from './registry'
