// Total the finite numbers in `values`. Anything else (strings, NaN,
// Infinity, null, objects) is skipped. An empty list sums to 0.
export function sum(values) {
  if (values.length === 0) {
    return 0
  }

  let total = 0
  for (const value of values) {
    if (Number.isFinite(value)) {
      total += value
    }
  }
  return total
}
