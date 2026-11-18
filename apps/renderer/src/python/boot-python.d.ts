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
export declare const BootPythonUnsupported: "unsupported";
export type BootPythonErrorKind = 'syntax' | 'name' | 'runtime' | typeof BootPythonUnsupported;
export interface BootPythonError {
    kind: BootPythonErrorKind;
    message: string;
    line: number;
}
export interface BootPythonResult {
    ok: boolean;
    stdout: string;
    error: BootPythonError;
}
/**
 * Runs `source` in the Boot subset.
 *
 * Output produced before a failure is preserved, because that is what CPython
 * shows and because a learner needs to see how far their program got.
 */
export declare function bootPython(source: string): BootPythonResult;
