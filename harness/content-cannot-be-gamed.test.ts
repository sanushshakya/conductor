import { gradeExercise } from './run-solutions'

/**
 * Exercises that a learner could pass without doing the work.
 *
 * The reference-solution check proves a correct answer PASSES. It cannot
 * notice that a wrong or empty answer also passes — and three shipped
 * exercises did exactly that, because rendered markup carries no styling and
 * an input's textContent is always empty however much was typed. Each case
 * here is one that reached `main`.
 */

test('web-css-basics now FAILS with the CSS editor empty', async () => {
  const starterHtml = `<h1>Ward B</h1>\n<ul id="board">\n  <li class="urgent">Cal Magar</li>\n  <li>Ana Rai</li>\n  <li>Ben Thapa</li>\n</ul>`
  const r = await gradeExercise(
    'content',
    'web-css-basics',
    JSON.stringify({ html: starterHtml, css: '', js: '' }),
  )
  expect(r.passed).toBe(false)
}, 20000)

test('web-flexbox now FAILS with the CSS editor empty', async () => {
  const starterHtml = `<header class="bar">\n  <h1>Ward B</h1>\n  <span class="count">3 patients</span>\n</header>`
  const r = await gradeExercise(
    'content',
    'web-flexbox',
    JSON.stringify({ html: starterHtml, css: '', js: '' }),
  )
  expect(r.passed).toBe(false)
}, 20000)

test('boss-board-admit now FAILS when the field is not cleared', async () => {
  const js = `const field = document.querySelector("#name");
const button = document.querySelector("#admit");
const board = document.querySelector("#board");
button.addEventListener("click", function () {
  const item = document.createElement("li");
  item.textContent = field.value;
  board.appendChild(item);
});`
  const r = await gradeExercise(
    'content',
    'boss-board-admit',
    JSON.stringify({ html: '<input id="name"><button id="admit">Admit</button><ul id="board"></ul>', css: '', js }),
  )
  expect(r.passed).toBe(false)
}, 20000)
