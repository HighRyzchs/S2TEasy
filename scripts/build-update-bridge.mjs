import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
if (process.platform !== 'win32')
  throw new Error('The Windows update bridge must be compiled on Windows.')
const framework = join(
  process.env.SystemRoot,
  'Microsoft.NET',
  'Framework64',
  'v4.0.30319',
  'csc.exe'
)
if (!existsSync(framework)) throw new Error('Windows .NET Framework C# compiler is unavailable.')
const output = resolve('resources/update-bridge.exe')
const result = spawnSync(
  framework,
  [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/out:' + output,
    resolve('native/UpdateBridge.cs')
  ],
  { stdio: 'inherit', windowsHide: true }
)
if (result.error || result.status !== 0)
  throw result.error || new Error('Update bridge compilation failed.')
console.log('Compiled GUI update bridge: ' + output)
