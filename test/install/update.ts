import tape = require('tape')
import promisifyTape from 'tape-promise'
import {
  prepare,
  addDistTag,
  testDefaults,
} from '../utils'
import {install, installPkgs} from '../../src'

const test = promisifyTape(tape)

test('preserve subdeps on update', async (t: tape.Test) => {
  const project = prepare(t)

  await Promise.all([
    addDistTag('foobarqar', '1.0.0', 'latest'),
    addDistTag('foo', '100.0.0', 'latest'),
    addDistTag('bar', '100.0.0', 'latest'),
  ])

  await installPkgs(['foobarqar'], testDefaults())

  await Promise.all([
    addDistTag('foobarqar', '1.0.1', 'latest'),
    addDistTag('foo', '100.1.0', 'latest'),
    addDistTag('bar', '100.1.0', 'latest'),
  ])

  await install(testDefaults({update: true, depth: 0}))

  const shr = await project.loadShrinkwrap()

  t.ok(shr.packages)
  t.ok(shr.packages['/foobarqar/1.0.1'])
  t.deepEqual(shr.packages['/foobarqar/1.0.1'].dependencies, {
    bar: '100.0.0',
    foo: '100.0.0',
    qar: '100.0.0',
  })
})
