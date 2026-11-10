/**
 * What every headless run of `claude` shares, whoever starts it: an engine
 * sample, the assistant, or the read of its skills.
 */

/**
 * The arguments of a `claude -p` run that prints one JSON event per line,
 * keeps no session and loads no MCP server but those named to it; `more`
 * follows them.
 */
export const claudePrintArgs = (...more: string[]): string[] => [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--strict-mcp-config',
  ...more,
]

/** The token counts of a `result` event. */
export interface ClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** What a run read and wrote. Input read from the cache or written to it counts as input. */
export const claudeTokens = (usage: ClaudeUsage = {}): { input: number; output: number } => ({
  input:
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0),
  output: usage.output_tokens ?? 0,
})
