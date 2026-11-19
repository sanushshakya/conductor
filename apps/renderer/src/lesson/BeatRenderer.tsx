import { useState } from 'react'
import type { Beat, Exercise, ExerciseResult } from '@conductor/shared'
import { Markdown } from '../components/Markdown'
import { CodeEditor } from '../components/CodeEditor'
import { HintStack } from '../components/HintStack'
import { MentorPanel } from '../mentor/MentorPanel'
import { DuelArena } from '../duel/DuelArena'
import { ChecklistBeat } from '../components/ChecklistBeat'
import { duelById } from '../content'
import { CheckList } from '../components/CheckList'
import { getVisualizer } from '../visualizers/registry'
import { grade } from '@conductor/core'
import { sqlEngineFor } from '../sql/useSqlEngine'
import { SqlPlayground } from '../sql/SqlPlayground'
import { runLearnerCode } from '../python/run'
import { host } from '../host'

export interface BeatProps {
  beat: Beat
  /** The lesson this beat belongs to, passed to the mentor for context. */
  lessonId?: string
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

    case 'checklist':
      return (
        <ChecklistBeat
          items={beat.items}
          intro={beat.intro}
          onAllChecked={props.onSatisfied}
        />
      )

    case 'duel': {
      const duel = duelById(beat.duelId)
      if (!duel) {
        return (
          <div className="rounded-xl border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-parchment-400">
            This duel is still being written.
          </div>
        )
      }
      return (
        <div>
          {beat.intro && <Markdown text={beat.intro} />}
          <DuelArena duel={duel} onFinished={() => props.onSatisfied()} />
        </div>
      )
    }
  }
}

/**
 * Renders any exercise, picking the right surface from its grader.
 *
 * Shared by lesson beats and boss criteria so there is exactly one
 * implementation of "run, check, hint" — a second one would drift, and the
 * boss projects are precisely where a learner would notice.
 */
export function ExercisePanel({
  exercise,
  intro,
  language,
  ...props
}: BeatProps & { exercise: Exercise; intro?: string; language?: 'python' | 'javascript' }) {
  const kind = exercise.grader.kind

  if (kind === 'quiz') return <QuizBeat exercise={exercise} {...props} />
  if (kind === 'sql-result' || kind === 'sql-schema' || kind === 'sql-mutation') {
    return <SqlExerciseBeat exercise={exercise} intro={intro} {...props} />
  }
  if (kind === 'api-suite') return <ApiExerciseBeat exercise={exercise} intro={intro} {...props} />
  return (
    <CodeExerciseBeat
      exercise={exercise}
      intro={intro}
      language={language ?? 'python'}
      {...props}
    />
  )
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
        runCode: runLearnerCode,
      })
      setResult(graded)
      props.onExerciseGraded(exercise.id, graded)
      if (graded.passed) props.onSatisfied()
    } catch (error) {
      // A rejection here used to make the button silently do nothing: the
      // learner pressed Check, saw "Checking…" flicker, and got no answer
      // ever. Grading can genuinely fail — the sidecar refuses before it is
      // ready, a fetch dies, a malformed body throws inside a grader — so the
      // failure has to be visible and has to say it is not their fault.
      console.error('grading failed', error)
      setResult({
        passed: false,
        checks: [],
        xpAwarded: 0,
        unavailableReason:
          'This could not be checked just now. Nothing is wrong with your answer — try again in a moment.',
      })
    } finally {
      setGrading(false)
    }
  }

  return { result, setResult, grading, submit }
}

/** Shown when grading could not run at all. Never phrased as a verdict. */
function UnavailableNotice({ result }: { result: ExerciseResult | null }) {
  if (!result?.unavailableReason) return null
  return (
    <p className="mt-4 rounded-lg border border-ink-600 bg-ink-800 px-4 py-3 text-sm text-parchment-300">
      {result.unavailableReason}
    </p>
  )
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

  async function run() {
    const outcome = await runLearnerCode(code)
    setOutput({
      text: outcome.ok
        ? outcome.stdout || '(the program ran, but printed nothing)'
        : `${outcome.stdout}${outcome.stderr}`,
      ok: outcome.ok,
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
          onClick={() => void run()}
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

      <UnavailableNotice result={result} />
      {result && <CheckList checks={result.checks} />}
      <HintStack hints={exercise.hints} />
      <MentorPanel
        authoredHints={exercise.hints}
        learnerCode={code}
        lessonId={props.lessonId}
        solution={exercise.solution}
      />
    </div>
  )
}

function QuizBeat({ exercise, ...props }: BeatProps & { exercise: Exercise }) {
  const [selected, setSelected] = useState<number[]>([])
  const { result, setResult, submit } = useGrading(exercise, props)

  if (exercise.grader.kind !== 'quiz') return null
  const { question, options, correct } = exercise.grader
  const multi = correct.length > 1

  // Locked only once they are RIGHT. A wrong answer has to be correctable:
  // a quiz beat gates the lesson, so a one-shot quiz is a dead end, and four
  // of them sit in the first thirty minutes of the course.
  const solved = result?.passed === true

  function toggle(index: number) {
    if (solved) return
    setResult(null)
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
          const isCorrect = correct.includes(index)
          const wasWrong = result !== null && !result.passed && isSelected

          // On a wrong answer only the chosen option is marked. Revealing the
          // right one here would make the retry pointless.
          const tone = solved
            ? isCorrect
              ? 'border-verify-600/50 bg-verify-600/10 text-verify-400'
              : 'border-ink-700 bg-ink-850 text-parchment-400'
            : wasWrong
              ? 'border-wrong-500/50 bg-wrong-500/10 text-wrong-400'
              : isSelected
                ? 'border-brass-500 bg-brass-500/10 text-parchment-100'
                : 'border-ink-700 bg-ink-850 text-parchment-200 hover:border-ink-600'

          return (
            <button
              key={index}
              type="button"
              aria-pressed={isSelected && !solved ? true : isSelected && solved}
              disabled={solved}
              onClick={() => toggle(index)}
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
        disabled={selected.length === 0 || solved}
        className="focus-ring mt-3 rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:opacity-40"
      >
        Check my answer
      </button>

      <UnavailableNotice result={result} />
      {result && <CheckList checks={result.checks} />}
      {!solved && <HintStack hints={exercise.hints} />}
      {!solved && (
        <MentorPanel
          authoredHints={exercise.hints}
          lessonId={props.lessonId}
          solution={exercise.solution}
        />
      )}
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


function ApiExerciseBeat({
  intro,
  exercise,
  ...props
}: BeatProps & { intro?: string; exercise: Exercise }) {
  const [baseUrl, setBaseUrl] = useState(exercise.starter?.trim() ?? 'http://127.0.0.1:8000')
  const { result, grading, submit } = useGrading(exercise, props)
  const criteria = exercise.grader.kind === 'api-suite' ? (exercise.grader.criteria ?? []) : []

  return (
    <div>
      {intro && <Markdown text={intro} />}
      <p className="mb-3 font-medium text-parchment-100">{exercise.prompt}</p>

      {criteria.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm text-parchment-400">
          {criteria.map((criterion) => (
            <li key={criterion} className="flex gap-2">
              <span aria-hidden className="text-ink-500">
                •
              </span>
              {criterion}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          aria-label="Your server's address"
          spellCheck={false}
          className="focus-ring min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-950 px-3 py-1.5 font-mono text-sm text-parchment-100"
        />
        <button
          type="button"
          onClick={() => void submit(baseUrl)}
          disabled={grading}
          className="focus-ring shrink-0 rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:opacity-50"
        >
          {grading ? 'Checking your server…' : 'Check my server'}
        </button>
      </div>

      {result?.unavailableReason && (
        <p className="mt-3 rounded-lg border border-ink-600 bg-ink-800 px-4 py-3 text-sm text-parchment-300">
          {result.unavailableReason}
        </p>
      )}
      {result && <CheckList checks={result.checks} />}
      <HintStack hints={exercise.hints} />
    </div>
  )
}
