import { CONDUCTOR_VERSION } from './index'

test('exports a semver version string', () => {
  expect(CONDUCTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})
