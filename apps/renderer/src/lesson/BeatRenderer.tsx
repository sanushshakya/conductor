import { useState } from 'react'
import type { Beat, Exercise, ExerciseResult } from '@conductor/shared'
import { Markdown } from '../components/Markdown'
import { CodeEditor } from '../components/CodeEditor'
import { HintStack } from '../components/HintStack'
import { CheckList } from '../components/CheckList'
import { getVisualizer } from '../visualizers/registry'
import { grade } from '@conductor/core'
import { sqlEngineFor } from '../sql/useSqlEngine'
import { SqlPlayground } from '../sql/SqlPlayground'
import { bootPython } from '@conductor/core'
import { host } from '../host'

export interface BeatProps {
  beat: Beat
  /** Called when this beat's requirement is met and the learner may continue. */
  onSatisfied(): void
  satisfied: boolean
  onExerciseGraded(exerciseId: string, result: ExerciseResult): void
}

/**
 * Renders one beat and decides what "done with this" means for it.
 *
 * Prose and visuals are satisfied by being read; exercises are satisfied by
 * passing. That distinction is the whole pacing model — a learner is never
 * blocked by something they only had to look at, and never waved past
 * something they had to actually do.
 */
export function BeatRenderer(props: BeatProps) {
  const { beat } = props

  switch (beat.kind) {
    case 'prose':
      return <Markdown text={beat.body} />

    case 'checkpoint':
      return (
        <div className="rounded-xl border border-brass-600/30 bg-brass-600/5 px-5 py-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-brass-500">
            Checkpoint
          </div>
          <Markdown text={beat.body} />
          {beat.unlocks && <p className="mt-2 text-sm text-parchment-400">{beat.unlocks}</p>}
        </div>
      )

    case 'visual': {
      const Visualizer = getVisualizer(beat.visualizer)
      return (
        <figure>
          <Visualizer config={beat.config ?? {}} onComplete={props.onSatisfied} />
          {beat.caption && (
            <figcaption className="mt-2 text-sm text-parchment-400">{beat.caption}</figcaption>
          )}
        </figure>
      )
    }

    case 'code':
      return (
        <CodeExerciseBeat intro={beat.intro} language={beat.language} exercise={beat.exercise} {...props} />
      )

    case 'sql':
      return (
        <SqlExerciseBeat
          intro={beat.intro}
          fixture={beat.fixture}
          exercise={beat.exercise}
          {...props}
        />
      )

    case 'quiz':
      return <QuizBeat exercise={beat.exercise} {...props} />

    case 'duel':
      return (
        <div className="rounded-xl border border-ink-700 bg-ink-850 px-5 py-4 text-sm text-parchment-300">
          {beat.intro ?? 'A duel waits here.'}
        </div>
      )
  }
}

function useGrading(exercise: Exercise, props: BeatProps) {
  const [result, setResult] = useState<ExerciseResult | null>(null)
  const [grading, setGrading] = useState(false)

  async function submit(submission: string) {
    setGrading(true)
    try {
      const graded = await grade(submission, exercise.grader, {
        exerciseId: exercise.id,
        xp: exercise.xp ?? 25,
        host: host(),
        sqlEngineFor,
      })
      setResult(graded)
      props.onExerciseGraded(exercise.id, graded)
      if (graded.passed) props.onSatisfied()
    } finally {
      setGrading(false)
    }
  }

  return { result, grading, submit }
}

function CodeExerciseBeat({
  intro,
  language,
  exercise,
  ...props
}: BeatProps & { intro?: string; language: 'python' | 'sql' | 'javascript'; exercise: Exercise }) {
  const [code, setCode] = useState(exercise.starter ?? '')
  const [output, setOutput] = useState<{ text: string; ok: boolean } | null>(null)
  const { result, grading, submit } = useGrading(exercise, props)

  // Output belongs to the code that produced it. Leaving a previous run's
  // error on screen beside a freshly-passing check is how a learner concludes
  // the app is lying to them about one of the two.
  function editCode(next: string) {
    setCode(next)
    setOutput(null)
  }

  function run() {
    const run = bootPython(code)
    setOutput({
      text: run.ok
        ? run.stdout || '(the program ran, but printed nothing)'
        : `${run.stdout}${run.error.message}\n  on line ${run.error.line}`,
      ok: run.ok,
    })
  }

  return (
    <div>
      {intro && <Markdown text={intro} />}
      <p className="mb-3 font-medium text-parchment-100">{exercise.prompt}</p>

      <CodeEditor
        value={code}
        onChange={editCode}
        language={language === 'sql' ? 'sql' : 'python'}
        ariaLabel={`Code editor for ${exercise.prompt}`}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          className="focus-ring rounded-md border border-ink-600 px-3 py-1.5 text-sm text-parchment-200 transition-colors hover:border-parchment-400"
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={grading}
          className="focus-ring rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:opacity-50"
        >
          {grading ? 'Checking…' : 'Check my answer'}
        </button>
        {exercise.starter !== undefined && code !== exercise.starter && (
          <button
            type="button"
            onClick={() => {
              setCode(exercise.starter ?? '')
              setOutput(null)
            }}
            className="focus-ring ml-auto text-xs text-parchment-400 hover:text-parchment-200"
          >
            Reset
          </button>
        )}
      </div>

      {output && (
        <div className="mt-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-parchment-400">Output</div>
          <pre
            className={`overflow-x-auto rounded-lg border px-4 py-3 font-mono text-sm ${
              output.ok
                ? 'border-ink-700 bg-ink-950 text-parchment-200'
                : 'border-wrong-500/40 bg-wrong-500/5 text-wrong-400'
            }`}
          >
            {output.text}
          </pre>
        </div>
      )}

      {result && <CheckList checks={result.checks} />}
      <HintStack hints={exercise.hints} />
    </div>
  )
}

function QuizBeat({ exercise, ...props }: BeatProps & { exercise: Exercise }) {
  const [selected, setSelected] = useState<number[]>([])
  const { result, submit } = useGrading(exercise, props)

  if (exercise.grader.kind !== 'quiz') return null
  const { question, options, correct } = exercise.grader
  const multi = correct.length > 1

  function toggle(index: number) {
    setSelected((current) =>
      multi
        ? current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index]
        : [index],
    )
  }

  return (
    <div>
      {exercise.prompt && <p className="mb-3 text-parchment-300">{exercise.prompt}</p>}
      <div className="mb-4 rounded-lg border border-ink-700 bg-ink-950 px-4 py-3">
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm text-parchment-200">
          {question}
        </pre>
      </div>

      {multi && <p className="mb-2 text-xs text-parchment-400">Select every answer that applies.</p>}

      <div role="group" aria-label="Answer options" className="space-y-2">
        {options.map((option, index) => {
          const isSelected = selected.includes(index)
          const settled = result !== null
          const isCorrect = correct.includes(index)
          const tone = !settled
            ? isSelected
              ? 'border-brass-500 bg-brass-500/10 text-parchment-100'
              : 'border-ink-700 bg-ink-850 text-parchment-200 hover:border-ink-600'
            : isCorrect
              ? 'border-verify-600/50 bg-verify-600/10 text-verify-400'
              : isSelected
                ? 'border-wrong-500/50 bg-wrong-500/10 text-wrong-400'
                : 'border-ink-700 bg-ink-850 text-parchment-400'

          return (
            <button
              key={index}
              type="button"
              aria-pressed={isSelected}
              onClick={() => !settled && toggle(index)}
              className={`focus-ring block w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${tone}`}
            >
              {option}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => void submit(JSON.stringify(selected))}
        disabled={selected.length === 0 || result !== null}
        className="focus-ring mt-3 rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:opacity-40"
      >
        Check my answer
      </button>

      {result && <CheckList checks={result.checks} />}
      {!result && <HintStack hints={exercise.hints} />}
    </div>
  )
}


function SqlExerciseBeat({
  intro,
  fixture,
  exercise,
  ...props
}: BeatProps & { intro?: string; fixture?: string; exercise: Exercise }) {
  const [sql, setSql] = useState(exercise.starter ?? '')
  const { result, grading, submit } = useGrading(exercise, props)

  return (
    <div>
      {intro && <Markdown text={intro} />}
      <p className="mb-3 font-medium text-parchment-100">{exercise.prompt}</p>

      <SqlPlayground value={sql} onChange={setSql} fixture={fixture} />

      <button
        type="button"
        onClick={() => void submit(sql)}
        disabled={grading}
        className="focus-ring mt-3 rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:opacity-50"
      >
        {grading ? 'Checking…' : 'Check my answer'}
      </button>

      {result && <CheckList checks={result.checks} />}
      <HintStack hints={exercise.hints} />
    </div>
  )
}
