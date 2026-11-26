/**
 * The drawing host's start file (`out/main/draw.js`). On macOS it makes the
 * app a background one, with no Dock icon and no menu bar, before anything
 * else loads: loading the host's code takes long enough that the system
 * would show it as an app in front first. Then it loads the host
 * (`host.ts`), awaited, so the host registers its scheme before `ready`.
 */
import { app } from 'electron'

app.dock?.hide()
await import('./host.ts')
