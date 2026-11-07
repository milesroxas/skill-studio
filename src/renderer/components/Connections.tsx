/**
 * The app's connections, as Settings and the welcome both show them: a CLI
 * found on this computer or not, a key and where it comes from, and the steps
 * to get a key the app walks someone through. One set of components, so a
 * connection reads and saves the same way wherever it is made.
 */
import { AI_PROVIDERS, type AiProviderInfo, type AiVendor, providersOf } from '@domain/ai.ts'
import { SECRETS, type SecretId, type Settings } from '@domain/secrets.ts'
import { useId, useState } from 'react'
import { loadAi, useAi } from '../ai.ts'
import { api } from '../api.ts'
import { type Reporter, useFetch } from '../hooks.ts'
import { Disclosure } from './Disclosure.tsx'
import { Field, List, Loading, ReadFailed, Stack, Toolbar } from './layout.tsx'
import { Status } from './Status.tsx'
import { Code, Hint, Link, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'

type Keys = ReturnType<typeof useFetch<Settings>>

/**
 * Every key's status, and what to do once one changes: read the statuses
 * again, ask the providers what they offer now, and let the caller follow.
 */
export function useKeys(onSaved?: () => Promise<void>): {
  keys: Keys
  changed: () => Promise<void>
} {
  const keys = useFetch(() => api.settings(), [])
  const changed = async () => {
    keys.reload()
    await Promise.all([loadAi(), onSaved?.()])
  }
  return { keys, changed }
}

/** A CLI the app can write through: found on this computer or not, and where to get it. */
function CliStatus({ info }: { info: AiProviderInfo | undefined }) {
  if (!info) return <Loading />
  const def = AI_PROVIDERS[info.id]
  if (def.via !== 'cli') return null
  return (
    <Field>
      <Status
        tone={info.connected ? 'success' : 'muted'}
        detail={info.connected ? def.about : null}
      >
        {info.connected ? `${def.label} is installed` : `${def.label} is not installed`}
      </Status>
      {info.connected ? null : (
        <Hint>
          <Link href={def.install}>Install {def.label}</Link> and sign in with the{' '}
          <Code>{def.command}</Code> command to write on your plan, with no key.
        </Hint>
      )}
    </Field>
  )
}

interface KeyFieldProps {
  id: SecretId
  /** What having no key means, shown beside "No key". */
  missing: string
  /** The app works without this key, so its absence is no warning. */
  optional: boolean
  /** Why a key that is set does not work, such as one the provider refused. */
  problem?: string | null
  /**
   * Offer to replace a key that works. Settings does; the welcome only checks
   * for one and asks when there is none, or when it does not work.
   */
  replace?: boolean
  report: Reporter
  onSaved: () => Promise<void>
}

/** One key, once its status is read: a failed read says so, and a pending one waits. */
export function KeySlot({ keys, ...props }: KeyFieldProps & { keys: Keys }) {
  if (keys.error && !keys.data)
    return (
      <ReadFailed
        size="compact"
        title="Could not read the key’s status"
        retrying={keys.loading}
        onRetry={keys.reload}
      >
        {keys.error}
      </ReadFailed>
    )
  if (!keys.data) return <Loading />
  return <KeyField settings={keys.data} {...props} />
}

/** One key: where it comes from, and a field to store or replace it. */
function KeyField({
  id,
  settings,
  missing,
  optional,
  problem,
  replace = true,
  report,
  onSaved,
}: KeyFieldProps & { settings: Settings }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useId()
  const { placeholder, launchEnv } = SECRETS[id]
  const { set, source } = settings.keys[id]

  const save = async (next: string) => {
    setBusy(true)
    try {
      await api.setKey(id, next)
      setValue('')
      report(next ? 'Key saved' : 'Key removed')
      await onSaved()
    } catch (e) {
      report(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const asking = replace || !set || Boolean(problem)

  return (
    <>
      <Field>
        <Status
          tone={!set ? (optional ? 'muted' : 'warning') : problem ? 'destructive' : 'success'}
          detail={
            source === 'environment'
              ? 'Set in the environment, so it wins over a stored one.'
              : source === 'stored'
                ? 'Stored in the system keychain.'
                : missing
          }
        >
          {source === 'environment'
            ? 'From the environment'
            : source === 'stored'
              ? 'In the keychain'
              : 'No key'}
        </Status>
        {set && problem ? <Hint tone="destructive">{problem}</Hint> : null}
      </Field>
      {/* Where to get one comes before the field to paste it in. */}
      {!set && settings.canStore ? <KeySteps id={id} /> : null}
      {!asking ? null : settings.canStore ? (
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            if (value.trim()) void save(value.trim())
          }}
        >
          <Field>
            <Label htmlFor={field}>
              {source === 'stored' ? 'Replace the stored key' : 'Store a key'}
            </Label>
            <Input
              id={field}
              type="password"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              value={value}
              placeholder={placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Toolbar>
            <Button type="submit" disabled={!value.trim()} busy={busy} busyLabel="Saving…">
              Save key
            </Button>
            {replace && source === 'stored' ? (
              <Button
                type="button"
                variant="destructive-ghost"
                disabled={busy}
                onClick={() => void save('')}
              >
                Remove the stored key
              </Button>
            ) : null}
          </Toolbar>
        </form>
      ) : (
        <Hint>
          This host keeps no key of its own. Set <Code>{launchEnv}</Code> in the environment (or in{' '}
          <Code>.env</Code> when running from a checkout) and start it again.
        </Hint>
      )}
    </>
  )
}

/** Both ways to reach one vendor's models: its CLI, then its key. */
export function VendorRoutes({
  vendor,
  keys,
  replace,
  report,
  onSaved,
}: {
  vendor: AiVendor
  keys: Keys
  replace?: boolean
  report: Reporter
  onSaved: () => Promise<void>
}) {
  const { providers } = useAi()
  return providersOf(vendor).map((id) => {
    const def = AI_PROVIDERS[id]
    const info = providers?.find((p) => p.id === id)
    return def.via === 'cli' ? (
      <CliStatus key={id} info={info} />
    ) : (
      <KeySlot
        key={id}
        id={def.secret}
        keys={keys}
        missing={def.about}
        optional
        problem={info?.problem}
        replace={replace}
        report={report}
        onSaved={onSaved}
      />
    )
  })
}

/**
 * Where to get a key, for a key the app walks someone through: a link to sign
 * up, and on request the steps from there, each a verb and a few words. The
 * request is a quiet line that opens in place, so it never outweighs the
 * field the key goes in.
 */
function KeySteps({ id }: { id: SecretId }) {
  const account = SECRETS[id].account
  if (!account) return null
  return (
    <Stack gap="xs">
      <Hint>
        No key yet? <Link href={account.url}>Sign up at {account.label}</Link> and create one.
      </Hint>
      <Disclosure summary="Show me">
        <List variant="number" gap="sm">
          {account.steps.map((step) => (
            <li key={step.verb}>
              <Text weight="medium">{step.verb}</Text> <Text tone="muted">{step.what}</Text>
            </li>
          ))}
        </List>
      </Disclosure>
    </Stack>
  )
}
