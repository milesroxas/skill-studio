import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sum } from './sum.mjs'

test('returns 0 for an empty list', () => {
  assert.equal(sum([]), 0)
})

test('adds up finite numbers', () => {
  assert.equal(sum([1, 2, 3]), 6)
  assert.equal(sum([-4, 10, 0.5]), 6.5)
})

test('skips values that are not finite numbers', () => {
  assert.equal(sum([1, NaN, 2, Infinity, -Infinity]), 3)
  assert.equal(sum([5, '7', null, undefined, {}, [], true]), 5)
})

test('returns 0 when no value is a finite number', () => {
  assert.equal(sum(['a', NaN, Infinity]), 0)
})
