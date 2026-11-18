/**
 * A deliberately tiny Python evaluator, for the first twenty minutes only.
 *
 * ## Why this exists
 *
 * The single most important moment in this product is the learner running
 * their own program and seeing it work — the spec puts it under ten minutes
 * from launch, with no setup. Real CPython arrives with the sidecar, which
 * needs a virtualenv provisioned in the background. Making a beginner wait for
 * that, or showing them a canned "here is what it would have printed", throws
 * away the moment the whole app is built around.
 *
 * ## The rule that makes it safe
 *
 * This evaluator supports a documented subset and **refuses everything else**.
 * It will never produce a plausible-but-wrong answer, because a teaching tool
 * that lies about what Python does is worse than one that says "not yet". Any
 * construct outside the subset returns `BootPythonUnsupported` with a message
 * pointing at the real engine.
 *
 * ## Supported subset
 *
 *   print(...)            with any number of comma-separated arguments
 *   name = <expression>   assignment to a plain identifier
 *   literals              int, float, string (single/double quoted), f-string,
 *                         True, False, None
 *   operators             + - * / // % **, parentheses, unary minus,
 *                         == != < <= > >=
 *   builtins              str(), int(), float(), len()
 *   comments              # to end of line, and blank lines
 *
 * Everything else — loops, conditionals, imports, functions, collections,
 * input() — belongs to Track 1 and runs on real CPython.
 */

export const BootPythonUnsupported = 'unsupported' as const
export type BootPythonErrorKind = 'syntax' | 'name' | 'runtime' | typeof BootPythonUnsupported

export interface BootPythonError {
  kind: BootPythonErrorKind
  message: string
  line: number
}

export interface BootPythonResult {
  ok: boolean
  stdout: string
  error: BootPythonError
}

type PyValue = string | number | boolean | null

interface FloatTagged {
  value: number
  isFloat: boolean
}

/** Python prints floats with a decimal point even when whole: 4/2 is "2.0". */
function formatValue(v: PyValue, floats: WeakSet<object>, floatNums: Set<number>): string {
  if (v === null) return 'None'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') {
    if (Number.isInteger(v) && !floatNums.has(v)) return String(v)
    return Number.isInteger(v) ? `${v}.0` : String(v)
  }
  return v
}

class PyError extends Error {
  constructor(
    readonly kind: BootPythonErrorKind,
    message: string,
  ) {
    super(message)
  }
}

const UNSUPPORTED_HINT =
  'That needs the Python engine, which is still warming up. In Boot you can use print, variables, text and numbers.'

/** Tokens the tokenizer understands. Anything else is a refusal, not a guess. */
type Token =
  | { t: 'num'; v: number; float: boolean }
  | { t: 'str'; v: string }
  | { t: 'fstr'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t') {
      i += 1
      continue
    }
    if (c === '#') break

    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let value = ''
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const next = src[j + 1]!
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          j += 2
          continue
        }
        value += src[j]
        j += 1
      }
      if (j >= src.length) throw new PyError('syntax', 'SyntaxError: unterminated string literal')
      tokens.push({ t: 'str', v: value })
      i = j + 1
      continue
    }

    if ((c === 'f' || c === 'F') && (src[i + 1] === '"' || src[i + 1] === "'")) {
      const quote = src[i + 1]!
      let j = i + 2
      let value = ''
      while (j < src.length && src[j] !== quote) {
        value += src[j]
        j += 1
      }
      if (j >= src.length) throw new PyError('syntax', 'SyntaxError: unterminated string literal')
      tokens.push({ t: 'fstr', v: value })
      i = j + 1
      continue
    }

    if (/[0-9]/.test(c)) {
      let j = i
      let isFloat = false
      while (j < src.length && /[0-9_.]/.test(src[j]!)) {
        if (src[j] === '.') isFloat = true
        j += 1
      }
      const text = src.slice(i, j).replace(/_/g, '')
      tokens.push({ t: 'num', v: Number(text), float: isFloat })
      i = j
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j += 1
      tokens.push({ t: 'name', v: src.slice(i, j) })
      i = j
      continue
    }

    const three = src.slice(i, i + 2)
    if (['**', '//', '==', '!=', '<=', '>='].includes(three)) {
      tokens.push({ t: 'op', v: three })
      i += 2
      continue
    }
    if ('+-*/%()=,<>'.includes(c)) {
      tokens.push({ t: 'op', v: c })
      i += 1
      continue
    }

    throw new PyError(BootPythonUnsupported, UNSUPPORTED_HINT)
  }
  return tokens
}

/** Statements Boot knows it cannot run. Named so the refusal is specific. */
const KNOWN_UNSUPPORTED: Record<string, string> = {
  for: 'Loops arrive in Track 1, where real Python runs them.',
  while: 'Loops arrive in Track 1, where real Python runs them.',
  if: 'Decisions arrive in Track 1, where real Python runs them.',
  def: 'Functions arrive in Track 1, where real Python runs them.',
  import: 'Importing libraries needs the full Python engine.',
  class: 'Classes are well beyond Boot.',
  input: 'Reading input needs the full Python engine.',
  return: 'Functions arrive in Track 1, where real Python runs them.',
}

const FLOAT_RESULTS = new Set<number>()

class Interpreter {
  private vars = new Map<string, PyValue>()
  private floatVars = new Set<string>()
  out = ''

  run(source: string): void {
    const lines = source.split('\n')
    for (let n = 0; n < lines.length; n += 1) {
      const raw = lines[n]!
      const line = raw.trimEnd()
      if (line.trim() === '' || line.trim().startsWith('#')) continue

      if (/^\s/.test(raw)) {
        // Indentation only exists under a block, and Boot has no blocks.
        throw Object.assign(new PyError(BootPythonUnsupported, UNSUPPORTED_HINT), { line: n + 1 })
      }

      const firstWord = line.trim().split(/[\s(]/)[0] ?? ''
      if (KNOWN_UNSUPPORTED[firstWord]) {
        throw Object.assign(
          new PyError(BootPythonUnsupported, `${KNOWN_UNSUPPORTED[firstWord]} ${UNSUPPORTED_HINT}`),
          { line: n + 1 },
        )
      }

      try {
        this.statement(line.trim())
      } catch (e) {
        throw Object.assign(e as PyError, { line: (e as { line?: number }).line ?? n + 1 })
      }
    }
  }

  private statement(line: string): void {
    const tokens = tokenize(line)
    if (tokens.length === 0) return

    // Assignment: NAME = expression (a lone `=`, not `==`).
    const first = tokens[0]
    const second = tokens[1]
    if (first?.t === 'name' && second?.t === 'op' && second.v === '=') {
      const { value, isFloat } = this.evaluate(tokens.slice(2))
      this.vars.set(first.v, value)
      if (isFloat) this.floatVars.add(first.v)
      else this.floatVars.delete(first.v)
      return
    }

    if (first?.t === 'name' && first.v === 'print') {
      this.print(tokens)
      return
    }

    // A bare expression is legal Python but prints nothing, so evaluating it
    // still surfaces NameError the way CPython would.
    this.evaluate(tokens)
  }

  private print(tokens: Token[]): void {
    const second = tokens[1]
    if (!(second?.t === 'op' && second.v === '(')) {
      throw new PyError('syntax', 'SyntaxError: expected ( after print')
    }
    const inner = this.matchParens(tokens, 1)
    const parts = this.splitTopLevel(inner)
    const rendered = parts.map((part) => {
      if (part.length === 0) return ''
      const { value, isFloat } = this.evaluate(part)
      return this.render(value, isFloat)
    })
    this.out += `${rendered.join(' ')}\n`
  }

  private render(value: PyValue, isFloat: boolean): string {
    if (typeof value === 'number' && isFloat && Number.isInteger(value)) return `${value}.0`
    return formatValue(value, new WeakSet(), FLOAT_RESULTS)
  }

  /** Returns the tokens inside the parenthesis that opens at `openIndex`. */
  private matchParens(tokens: Token[], openIndex: number): Token[] {
    let depth = 0
    for (let i = openIndex; i < tokens.length; i += 1) {
      const tk = tokens[i]!
      if (tk.t === 'op' && tk.v === '(') depth += 1
      else if (tk.t === 'op' && tk.v === ')') {
        depth -= 1
        if (depth === 0) {
          if (i !== tokens.length - 1) {
            throw new PyError('syntax', 'SyntaxError: unexpected text after the closing parenthesis')
          }
          return tokens.slice(openIndex + 1, i)
        }
      }
    }
    throw new PyError('syntax', "SyntaxError: '(' was never closed")
  }

  private splitTopLevel(tokens: Token[]): Token[][] {
    const parts: Token[][] = []
    let depth = 0
    let current: Token[] = []
    for (const tk of tokens) {
      if (tk.t === 'op' && tk.v === '(') depth += 1
      if (tk.t === 'op' && tk.v === ')') depth -= 1
      if (tk.t === 'op' && tk.v === ',' && depth === 0) {
        parts.push(current)
        current = []
        continue
      }
      current.push(tk)
    }
    if (current.length > 0 || parts.length > 0) parts.push(current)
    return parts
  }

  // ── expressions: precedence climbing ───────────────────────────────────

  private evaluate(tokens: Token[]): FloatTagged2 {
    const parser = new ExprParser(tokens, this.vars, this.floatVars)
    const result = parser.parseExpression(0)
    if (!parser.atEnd()) throw new PyError('syntax', 'SyntaxError: invalid syntax')
    return result
  }
}

interface FloatTagged2 {
  value: PyValue
  isFloat: boolean
}

const PRECEDENCE: Record<string, number> = {
  '==': 1,
  '!=': 1,
  '<': 1,
  '<=': 1,
  '>': 1,
  '>=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
  '//': 3,
  '%': 3,
  '**': 4,
}

class ExprParser {
  private i = 0
  constructor(
    private readonly tokens: Token[],
    private readonly vars: Map<string, PyValue>,
    private readonly floatVars: Set<string>,
  ) {}

  atEnd(): boolean {
    return this.i >= this.tokens.length
  }

  parseExpression(minPrecedence: number): FloatTagged2 {
    let left = this.parseUnary()
    for (;;) {
      const tk = this.tokens[this.i]
      if (!tk || tk.t !== 'op' || !(tk.v in PRECEDENCE)) break
      const precedence = PRECEDENCE[tk.v]!
      if (precedence < minPrecedence) break
      this.i += 1
      // ** is right-associative in Python; everything else is left.
      const right = this.parseExpression(tk.v === '**' ? precedence : precedence + 1)
      left = applyBinary(tk.v, left, right)
    }
    return left
  }

  private parseUnary(): FloatTagged2 {
    const tk = this.tokens[this.i]
    if (tk?.t === 'op' && tk.v === '-') {
      this.i += 1
      const operand = this.parseUnary()
      if (typeof operand.value !== 'number') {
        throw new PyError('runtime', 'TypeError: bad operand type for unary -')
      }
      return { value: -operand.value, isFloat: operand.isFloat }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): FloatTagged2 {
    const tk = this.tokens[this.i]
    if (!tk) throw new PyError('syntax', 'SyntaxError: unexpected end of expression')

    if (tk.t === 'num') {
      this.i += 1
      return { value: tk.v, isFloat: tk.float }
    }
    if (tk.t === 'str') {
      this.i += 1
      return { value: tk.v, isFloat: false }
    }
    if (tk.t === 'fstr') {
      this.i += 1
      return { value: this.interpolate(tk.v), isFloat: false }
    }
    if (tk.t === 'op' && tk.v === '(') {
      this.i += 1
      const inner = this.parseExpression(0)
      const close = this.tokens[this.i]
      if (!(close?.t === 'op' && close.v === ')')) {
        throw new PyError('syntax', "SyntaxError: '(' was never closed")
      }
      this.i += 1
      return inner
    }
    if (tk.t === 'name') {
      this.i += 1
      const next = this.tokens[this.i]
      if (next?.t === 'op' && next.v === '(') return this.callBuiltin(tk.v)
      if (tk.v === 'True') return { value: true, isFloat: false }
      if (tk.v === 'False') return { value: false, isFloat: false }
      if (tk.v === 'None') return { value: null, isFloat: false }
      if (!this.vars.has(tk.v)) {
        throw new PyError('name', `NameError: name '${tk.v}' is not defined`)
      }
      return { value: this.vars.get(tk.v)!, isFloat: this.floatVars.has(tk.v) }
    }

    throw new PyError(BootPythonUnsupported, UNSUPPORTED_HINT)
  }

  private callBuiltin(name: string): FloatTagged2 {
    this.i += 1 // consume '('
    const arg = this.parseExpression(0)
    const close = this.tokens[this.i]
    if (!(close?.t === 'op' && close.v === ')')) {
      throw new PyError('syntax', "SyntaxError: '(' was never closed")
    }
    this.i += 1

    switch (name) {
      case 'str':
        return {
          value:
            typeof arg.value === 'number' && arg.isFloat && Number.isInteger(arg.value)
              ? `${arg.value}.0`
              : arg.value === null
                ? 'None'
                : typeof arg.value === 'boolean'
                  ? arg.value
                    ? 'True'
                    : 'False'
                  : String(arg.value),
          isFloat: false,
        }
      case 'int': {
        const n = Number(arg.value)
        if (Number.isNaN(n)) {
          throw new PyError('runtime', `ValueError: invalid literal for int(): '${String(arg.value)}'`)
        }
        return { value: Math.trunc(n), isFloat: false }
      }
      case 'float': {
        const n = Number(arg.value)
        if (Number.isNaN(n)) {
          throw new PyError('runtime', `ValueError: could not convert to float: '${String(arg.value)}'`)
        }
        return { value: n, isFloat: true }
      }
      case 'len':
        if (typeof arg.value !== 'string') {
          throw new PyError('runtime', 'TypeError: object of this type has no len()')
        }
        return { value: arg.value.length, isFloat: false }
      default:
        throw new PyError(
          BootPythonUnsupported,
          `${name}() needs the Python engine. ${UNSUPPORTED_HINT}`,
        )
    }
  }

  /** f-string interpolation: `{name}` and `{expression}`. */
  private interpolate(template: string): string {
    return template.replace(/\{([^}]*)\}/g, (_match, expr: string) => {
      const sub = new ExprParser(tokenize(expr), this.vars, this.floatVars)
      const { value, isFloat } = sub.parseExpression(0)
      if (typeof value === 'number' && isFloat && Number.isInteger(value)) return `${value}.0`
      if (value === null) return 'None'
      if (typeof value === 'boolean') return value ? 'True' : 'False'
      return String(value)
    })
  }
}

function applyBinary(op: string, left: FloatTagged2, right: FloatTagged2): FloatTagged2 {
  const a = left.value
  const b = right.value

  if (op === '+' && typeof a === 'string' && typeof b === 'string') {
    return { value: a + b, isFloat: false }
  }
  if (op === '+' && (typeof a === 'string') !== (typeof b === 'string')) {
    throw new PyError(
      'runtime',
      'TypeError: can only concatenate str to str — use str() to convert the number first',
    )
  }

  if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
    const result =
      op === '==' ? a === b
      : op === '!=' ? a !== b
      : op === '<' ? (a as number) < (b as number)
      : op === '<=' ? (a as number) <= (b as number)
      : op === '>' ? (a as number) > (b as number)
      : (a as number) >= (b as number)
    return { value: result, isFloat: false }
  }

  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new PyError('runtime', `TypeError: unsupported operand type(s) for ${op}`)
  }

  const isFloat = left.isFloat || right.isFloat
  switch (op) {
    case '+':
      return { value: a + b, isFloat }
    case '-':
      return { value: a - b, isFloat }
    case '*':
      return { value: a * b, isFloat }
    case '/':
      if (b === 0) throw new PyError('runtime', 'ZeroDivisionError: division by zero')
      // True division always yields a float in Python 3.
      return { value: a / b, isFloat: true }
    case '//':
      if (b === 0) throw new PyError('runtime', 'ZeroDivisionError: integer division or modulo by zero')
      // Python floors towards negative infinity; JS truncates towards zero.
      return { value: Math.floor(a / b), isFloat }
    case '%':
      if (b === 0) throw new PyError('runtime', 'ZeroDivisionError: integer division or modulo by zero')
      return { value: ((a % b) + b) % b, isFloat }
    case '**':
      return { value: a ** b, isFloat }
    default:
      throw new PyError(BootPythonUnsupported, UNSUPPORTED_HINT)
  }
}

/**
 * Runs `source` in the Boot subset.
 *
 * Output produced before a failure is preserved, because that is what CPython
 * shows and because a learner needs to see how far their program got.
 */
export function bootPython(source: string): BootPythonResult {
  const interpreter = new Interpreter()
  try {
    interpreter.run(source)
    return { ok: true, stdout: interpreter.out, error: { kind: 'runtime', message: '', line: 0 } }
  } catch (e) {
    const err = e as PyError & { line?: number }
    return {
      ok: false,
      stdout: interpreter.out,
      error: {
        kind: err.kind ?? 'runtime',
        message: err.message,
        line: err.line ?? 1,
      },
    }
  }
}
