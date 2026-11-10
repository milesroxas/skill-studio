/**
 * Reads of one thing that can land out of order, worked out without React so
 * it can be tested. A reply is dropped only once a newer one has landed: a
 * slow read is overtaken, never left to blank what an older one showed. A
 * caller that awaits a read waits for the reads asked for after it too, so
 * what it sees next is no older than what it asked for.
 */

export interface Reads {
  /**
   * Make a read. `took` gets its reply unless a newer read's reply was taken
   * first. `failed` gets its failure only while no newer read was asked for:
   * the newer one says how things stand. Resolves once this read and every
   * read asked for after it have landed.
   */
  read: <T>(
    load: () => Promise<T>,
    took: (value: T) => void,
    failed: (e: Error) => void,
  ) => Promise<void>
}

export function createReads(): Reads {
  /** The newest read asked for, and the newest whose reply was taken. */
  let asked = 0
  let taken = 0
  /** The newest read on its way. */
  let newest: Promise<void> = Promise.resolve()

  const landed = async (read: Promise<void>): Promise<void> => {
    let last = read
    await last
    while (newest !== last) {
      last = newest
      await last
    }
  }

  return {
    read: (load, took, failed) => {
      asked += 1
      const mine = asked
      const read = load().then(
        (value) => {
          if (mine < taken) return
          taken = mine
          took(value)
        },
        (e: Error) => {
          if (mine === asked) failed(e)
        },
      )
      newest = read
      return landed(read)
    },
  }
}
