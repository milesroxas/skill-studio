/** An error class of a vendor's SDK. Both SDKs name theirs alike. */
type ErrorClass = abstract new (...args: never[]) => Error

interface ErrorClasses {
  AuthenticationError: ErrorClass
  PermissionDeniedError: ErrorClass
  NotFoundError: ErrorClass
  RateLimitError: ErrorClass
  APIConnectionError: ErrorClass
  APIError: ErrorClass
}

/**
 * An SDK error as a line the writer can act on. `rateLimited` ends the line
 * for a refused rate, which means something different at each vendor.
 */
export function explain(
  vendor: string,
  classes: ErrorClasses,
  error: unknown,
  rateLimited: string,
): Error {
  if (error instanceof classes.AuthenticationError)
    return new Error(`${vendor} refused the API key. Check it in Settings.`)
  if (error instanceof classes.PermissionDeniedError)
    return new Error(`This ${vendor} key may not use that model.`)
  if (error instanceof classes.NotFoundError)
    return new Error(`${vendor} does not know that model. Pick another.`)
  if (error instanceof classes.RateLimitError)
    return new Error(`${vendor} is rate limiting this key${rateLimited}`)
  if (error instanceof classes.APIConnectionError)
    return new Error(`Could not reach ${vendor}. Check the connection and try again.`)
  if (error instanceof classes.APIError) return new Error(`${vendor}: ${error.message}`)
  return error instanceof Error ? error : new Error(String(error))
}
