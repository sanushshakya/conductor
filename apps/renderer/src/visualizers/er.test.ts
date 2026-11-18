import { validateErModel, type ErModel } from './er'

const model: ErModel = {
  tables: [
    { name: 'departments', columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }] },
    {
      name: 'doctors',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'department_id', type: 'INTEGER' },
      ],
    },
  ],
  relationships: [
    { from: 'doctors.department_id', to: 'departments.id', kind: 'many-to-one' },
  ],
}

test('a well-formed model validates', () => {
  expect(validateErModel(model).errors).toEqual([])
})

test('ErDiagramBuilder reports a validation error for a relationship with no key', () => {
  const broken: ErModel = {
    ...model,
    relationships: [{ from: 'doctors.ward_id', to: 'departments.id', kind: 'many-to-one' }],
  }
  const result = validateErModel(broken)
  expect(result.errors.some((e) => /ward_id/.test(e))).toBe(true)
})

test('a relationship pointing at a non-primary-key column is reported', () => {
  const broken: ErModel = {
    ...model,
    relationships: [{ from: 'doctors.department_id', to: 'departments.name', kind: 'many-to-one' }],
  }
  expect(validateErModel(broken).errors.some((e) => /name/.test(e))).toBe(true)
})

test('a table with no primary key is reported', () => {
  const broken: ErModel = {
    tables: [{ name: 'wards', columns: [{ name: 'name', type: 'TEXT' }] }],
    relationships: [],
  }
  expect(validateErModel(broken).errors.some((e) => /primary key/i.test(e))).toBe(true)
})

test('a duplicate table name is reported', () => {
  const broken: ErModel = {
    tables: [...model.tables, { name: 'doctors', columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }] }],
    relationships: [],
  }
  expect(validateErModel(broken).errors.some((e) => /duplicate/i.test(e))).toBe(true)
})

test('validation reports ok when there is nothing wrong', () => {
  expect(validateErModel(model).ok).toBe(true)
})
