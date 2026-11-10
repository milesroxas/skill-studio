/**
 * The app's connections, as Settings and the welcome both show them: a CLI
 * found on this computer or not, a key and where it comes from, and the steps
 * to get a key the app walks someone through. One set of components, so a
 * connection reads and saves the same way wherever it is made.
 */
import {
  AI_PROVIDERS,
  type AiProviderInfo,
  type AiVendor,
  accountLine,
  needsSignIn,
  providersOf,
} from '@domain/ai.ts'
import { SECRETS, type SecretId, type Settings } from '@domain/secrets.ts'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { loadAi, recheck, useAi } from '../ai.ts'
import { api } from '../api.ts'
import { copyText } from '../clipboard.ts'
import { type Reporter, useAction, useFetch } from '../hooks.ts'
import { knownKeys, readKeys } from '../secrets.ts'
import { useConfirm } from './confirm.tsx'
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
  const keys = useFetch(readKeys, [])
  const changed = async () => {
    keys.reload()
    await Promise.all([loadAi(), onSaved?.()])
  }
  // Until this visit's own read lands, the last one stands in for it.
  return { keys: { ...keys, data: keys.data ?? knownKeys() }, changed }
}

/**
 * A CLI the app can write through: found on this computer or not, and signed
 * in or not. The app runs the CLI as its maker publishes it and reads how it
 * stands. It never installs the CLI or signs it in: it shows the maker's own
 * command for the person to run in their terminal, and looks again after.
 */
function CliStatus({
  info,
  report,
  onSaved,
}: {
  info: AiProviderInfo | undefined
  report: Reporter
  onSaved: () => Promise<void>
}) {
  if (!info) return <Loading />
  const def = AI_PROVIDERS[info.id]
  if (def.via !== 'cli') return null

  if (!info.connected) {
    const command = info.installable ? def.installCommand : undefined
    return (
      <CliSetup
        info={info}
        title={`${def.label} is not installed`}
        detail="Install it to write on your own account, with no key."
        command={command}
        report={report}
        onSaved={onSaved}
      >
        {command ? (
          <>
            The command in {def.vendor}’s <Link href={def.install}>install guide</Link>.
          </>
        ) : (
          <>
            Follow {def.vendor}’s <Link href={def.install}>install guide</Link>, then check again.
          </>
        )}
      </CliSetup>
    )
  }

  if (needsSignIn(info))
    return (
      <CliSetup
        info={info}
        title={`${def.label} is not signed in`}
        command={def.signInCommand}
        report={report}
        onSaved={onSaved}
      >
        Your browser opens on {def.vendor}’s page to sign in. Skill Studio never sees your login.
      </CliSetup>
    )

  const { account } = info
  return (
    <Field>
      <Status tone="success" detail={accountLine(info.id, account)}>
        {!account?.signedIn
          ? `${def.label} is installed`
          : account.billing === 'key'
            ? `${def.label} uses an API key`
            : `${def.label} is signed in`}
      </Status>
    </Field>
  )
}

/**
 * A CLI that still needs something only the person can do. The command to run
 * is the object of the row, so it stands in a field of its own, in mono and
 * selected whole on a click, with a line under it on what running it does.
 * One button copies it and one looks again. Coming back to this window looks
 * again too, so the row follows without a click.
 */
function CliSetup({
  info,
  title,
  detail,
  command,
  children,
  report,
  onSaved,
}: {
  info: AiProviderInfo
  title: string
  detail?: string
  /** The command to run; none when the maker's guide has no one line for this computer. */
  command: string | undefined
  /** What running the command does, or what to do without one. */
  children: ReactNode
  report: Reporter
  onSaved: () => Promise<void>
}) {
  const [checking, run] = useAction(report)
  const field = useId()
  useEffect(() => {
    const look = () => void loadAi()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [])

  const copy = async () =>
    (await copyText(command ?? ''))
      ? report('Command copied. Paste it in Terminal and press Return.')
      : report('Could not copy. Select the command and copy it.', { tone: 'destructive' })

  const check = () =>
    run(async () => {
      // This look's own answer: a look on focus landing meanwhile does not change it.
      const { info: now, problem } = await recheck(info.id)
      // A look that failed has nothing to say about the CLI: say why it failed instead.
      if (problem) throw new Error(`Could not check: ${problem}`)
      // Unchanged: say so, or the click looks like it did nothing.
      if (!now?.connected || needsSignIn(now)) report(`${title} yet`)
      else await onSaved()
    })

  return (
    <>
      <Status tone="muted" detail={detail}>
        {title}
      </Status>
      <Field>
        {command ? (
          <>
            <Label htmlFor={field}>Run in Terminal</Label>
            <Input
              id={field}
              readOnly
              font="mono"
              spellCheck={false}
              value={command}
              onFocus={(event) => event.currentTarget.select()}
            />
          </>
        ) : null}
        <Hint>{children}</Hint>
      </Field>
      <Toolbar>
        {command ? (
          <Button type="button" onClick={() => void copy()}>
            Copy command
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          busy={checking}
          busyLabel="Checking…"
          onClick={() => void check()}
        >
          Check again
        </Button>
      </Toolbar>
    </>
  )
}

/** What having no Jev key means, said one way wherever the key is asked for. */
export const NO_JEV_KEY = 'Grading uses code checks only.'

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
  /** Saving and removing each wait on their own, so each button says its own step. */
  const [saving, runSave] = useAction(report)
  const [removing, runRemove] = useAction(report)
  const [confirm, confirmDialog] = useConfirm()
  const field = useId()
  const { placeholder, launchEnv } = SECRETS[id]
  const { set, source } = settings.keys[id]

  /** Store `next`, or remove the stored key when it is empty. */
  const store = async (next: string) => {
    await api.setKey(id, next)
    setValue('')
    report(next ? 'Key saved' : 'Key removed')
    await onSaved()
  }
  const save = (next: string) => runSave(() => store(next))

  /** A stored key cannot be brought back by Undo: it is pasted again or not at all. So it is asked first. */
  const remove = async () => {
    if (
      await confirm({
        title: 'Remove the stored key?',
        description: 'The key is deleted from the keychain. To use it again, paste it here again.',
        action: 'Remove',
        destructive: true,
      })
    )
      await runRemove(() => store(''))
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
                ? null
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
            if (value.trim() && !removing) void save(value.trim())
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
            <Button
              type="submit"
              disabled={!value.trim() || removing}
              busy={saving}
              busyLabel="Saving…"
            >
              Save key
            </Button>
            {replace && source === 'stored' ? (
              <Button
                type="button"
                variant="destructive-ghost"
                disabled={saving}
                busy={removing}
                busyLabel="Removing…"
                onClick={() => void remove()}
              >
                Remove the stored key…
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
      {confirmDialog}
    </>
  )
}

/**
 * The ways to reach one vendor's models. Its CLI is the main one and stands
 * first, in full. An API key is supported too, folded behind one quiet line so
 * it never competes with the CLI. The line opens by itself when a key is
 * already set, or its status cannot be read, so nothing in use is hidden.
 */
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
    if (def.via === 'cli')
      return <CliStatus key={id} info={info} report={report} onSaved={onSaved} />
    // Not drawn until the key's status is known: only then is it known whether to start open.
    if (!keys.data && !keys.error) return <Loading key={id} />
    const inUse = Boolean(keys.data?.keys[def.secret].set || !keys.data)
    return (
      <Disclosure
        key={id}
        summary={keys.data?.keys[def.secret].set ? 'API key' : 'Use an API key'}
        defaultOpen={inUse}
      >
        <Stack gap="lg">
          <KeySlot
            id={def.secret}
            keys={keys}
            missing={def.about}
            optional
            problem={info?.problem}
            replace={replace}
            report={report}
            onSaved={onSaved}
          />
        </Stack>
      </Disclosure>
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
        <Link href={account.url}>Sign up at {account.label}</Link> to create a key.
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
