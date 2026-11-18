import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { AtlasTool } from '@conductor/shared'
import { layoutAtlas, CATEGORY_LABEL, type AtlasCategory } from './atlas-layout'
import { registerVisualizer, type VisualizerProps } from '../visualizers/registry'
import { atlas as allTools } from '../content'
import { useProfile } from '../store/useProfile'

const VERDICT_STYLE: Record<AtlasTool['verdict'], string> = {
  'learn-now': 'border-brass-500/60 bg-brass-500/10 text-brass-400',
  later: 'border-ink-600 bg-ink-900 text-parchment-300',
  skip: 'border-ink-700 bg-ink-900/50 text-parchment-400/60',
}

const VERDICT_LABEL: Record<AtlasTool['verdict'], string> = {
  'learn-now': 'learn now',
  later: 'later',
  skip: 'skip for now',
}

/**
 * The Tool Atlas.
 *
 * The owner asked for every tool and technology, listed. A flat list is the
 * wrong answer to that: it implies you need all of them and gives no order.
 * What a beginner actually needs is a verdict per tool and a reason — and the
 * reason is the part that transfers, because the tools will change and the
 * judgement will not.
 *
 * Tools already covered show the learner's own progress against them, so the
 * map doubles as a record of what they can now do.
 */
function ToolAtlas({ config }: VisualizerProps) {
  const tools = (config.tools as AtlasTool[] | undefined) ?? allTools
  const [filter, setFilter] = useState<'all' | AtlasTool['verdict']>('all')
  const [selected, setSelected] = useState<AtlasTool | null>(null)
  const completed = useProfile((s) => s.profile.completedLessons)

  const visible = useMemo(
    () => (filter === 'all' ? tools : tools.filter((t) => t.verdict === filter)),
    [tools, filter],
  )
  const layout = useMemo(() => layoutAtlas(visible), [visible])

  const learnNow = tools.filter((t) => t.verdict === 'learn-now')
  const covered = learnNow.filter((t) => t.lessonId && completed.includes(t.lessonId))

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'learn-now', 'later', 'skip'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`focus-ring rounded-md border px-2.5 py-1 text-xs transition-colors ${
              filter === option
                ? 'border-brass-500 bg-brass-500/10 text-brass-400'
                : 'border-ink-600 text-parchment-300 hover:border-ink-500'
            }`}
          >
            {option === 'all' ? 'Everything' : VERDICT_LABEL[option]}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-parchment-400">
          {covered.length}/{learnNow.length} of the essentials covered
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          {layout.groups.map((group) => (
            <div
              key={group.category}
              className="absolute left-0 right-0 rounded-lg border border-ink-800"
              style={{ top: group.y, height: group.height }}
            >
              <span className="absolute left-3 top-2 font-mono text-[10px] uppercase tracking-wider text-parchment-400">
                {CATEGORY_LABEL[group.category as AtlasCategory]}
              </span>
            </div>
          ))}

          {layout.nodes.map((node) => {
            const done = node.tool.lessonId && completed.includes(node.tool.lessonId)
            return (
              <motion.button
                key={node.id}
                type="button"
                initial={false}
                animate={{ left: node.x, top: node.y }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                onClick={() => setSelected(node.tool)}
                style={{ width: node.width, height: node.height }}
                className={`focus-ring absolute flex flex-col justify-center rounded-lg border px-3 text-left transition-colors ${
                  VERDICT_STYLE[node.tool.verdict]
                } ${selected?.id === node.id ? 'ring-1 ring-brass-500' : ''}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {node.tool.name}
                  {done && (
                    <span aria-label="covered" className="text-verify-400">
                      ✓
                    </span>
                  )}
                </span>
                <span className="text-[10px] opacity-70">{VERDICT_LABEL[node.tool.verdict]}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 min-h-[4.5rem] rounded-lg border border-ink-700 bg-ink-900 px-4 py-3">
        {selected ? (
          <>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-medium text-parchment-100">{selected.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-brass-500">
                {VERDICT_LABEL[selected.verdict]}
              </span>
            </div>
            <p className="text-sm text-parchment-300">{selected.why}</p>
            {(selected.lessonId || selected.trackId) && (
              <p className="mt-1 text-xs text-parchment-400">
                Covered in {selected.lessonId ? `lesson ${selected.lessonId}` : `the ${selected.trackId} track`}.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-parchment-400">
            Click any tool for the one-line reason it is where it is.
          </p>
        )}
      </div>
    </div>
  )
}

registerVisualizer('tool-atlas', ToolAtlas)
export { ToolAtlas }
