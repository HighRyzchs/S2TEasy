// Exercise the actual UpdateLauncher inside Electron, then prove its helper survives app.quit().
// All executables and data are disposable fixtures. No installed app or user profile is accessed.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')
    throw new Error('Disposable Windows CI only.')
  const root = mkdtempSync(join(tmpdir(), 's2t-electron-handoff-'))
  const folder = join(root, "Pat's 100% & notes")
  mkdirSync(folder)
  const diagnostics = resolve('release/electron-handoff')
  mkdirSync(diagnostics, { recursive: true })
  const target = join(folder, 'current.exe'),
    payload = join(folder, 'payload.exe'),
    marker = join(folder, 'restarted.txt')
  writeFileSync(target, 'original synthetic target')
  const source =
    'public class Fixture { public static void Main() { System.IO.File.WriteAllText(' +
    JSON.stringify(marker) +
    ', "restarted"); } }'
  const literal = (s) => "'" + s.replace(/'/g, "''") + "'"
  const compiled = spawnSync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ${literal(source)} -OutputAssembly ${literal(payload)} -OutputType WindowsApplication`
    ],
    { windowsHide: true, encoding: 'utf8' }
  )
  if (compiled.error || compiled.status !== 0)
    throw new Error(`Compile fixture: ${compiled.error || compiled.stderr}`)
  await build({
    entryPoints: ['src/main/updater.ts'],
    outfile: join(folder, 'updater.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron']
  })
  const bytes = readFileSync(payload),
    hash = createHash('sha256').update(bytes).digest('hex')
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({ name: 's2t-handoff-fixture', version: '0.0.1', main: 'main.cjs' })
  )
  writeFileSync(
    join(folder, 'main.cjs'),
    `
const {app}=require('electron');const {writeFileSync,readFileSync}=require('node:fs');const {join}=require('node:path');
const {UpdateLauncher}=require('./updater.cjs');
const folder=${JSON.stringify(folder)},diagnostics=${JSON.stringify(diagnostics)};
Object.defineProperty(app,'isPackaged',{value:true});
process.env.PORTABLE_EXECUTABLE_FILE=${JSON.stringify(target)};process.env.PORTABLE_EXECUTABLE_DIR=folder;
const bytes=readFileSync(${JSON.stringify(payload)});
global.fetch=async url=>String(url).includes('/releases/latest')?new Response(JSON.stringify({tag_name:'v0.0.2',assets:[{id:1,name:'S2Teasy-0.0.2-portable.exe',size:bytes.length,digest:'sha256:${hash}',url:'https://api.github.com/repos/HighRyzchs/S2TEasy/releases/assets/1',browser_download_url:'https://github.com/HighRyzchs/S2TEasy/releases/download/v0.0.2/S2Teasy-0.0.2-portable.exe'}]})):new Response(bytes);
const states=[];let timer;
app.whenReady().then(async()=>{
 const updater=new UpdateLauncher(()=>'',state=>{states.push(state);writeFileSync(join(diagnostics,'states.json'),JSON.stringify(states,null,2));if(state.phase==='error'){console.error(state.message);clearTimeout(timer);app.exit(1)}},folder,diagnostics);
 timer=setTimeout(()=>{console.error('Electron handoff timed out');app.exit(1)},20000);
 if((await updater.check({download:true})).phase!=='ready')throw Error('Fixture update not ready');
 updater.install();
});
app.on('before-quit',()=>{clearTimeout(timer);writeFileSync(join(diagnostics,'before-quit.json'),readFileSync(join(diagnostics,'update-result.json')))});
process.on('unhandledRejection',e=>{console.error(e);app.exit(1)});
`
  )
  const electron = createRequire(import.meta.url)('electron')
  const child = spawn(electron, [folder], { windowsHide: true, stdio: 'inherit' })
  await new Promise((done, fail) => {
    const timeout = setTimeout(() => {
      child.kill()
      fail(new Error('Electron fixture timeout'))
    }, 30000)
    child.once('error', (e) => {
      clearTimeout(timeout)
      fail(e)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      code === 0
        ? done()
        : fail(
            new Error(
              `Electron fixture exited ${code}; states: ${existsSync(join(diagnostics, 'states.json')) ? readFileSync(join(diagnostics, 'states.json'), 'utf8').slice(-2500) : 'no state was written'}`
            )
          )
    })
  })
  const receipt = () =>
    JSON.parse(readFileSync(join(diagnostics, 'update-result.json'), 'utf8').replace(/^\uFEFF/, ''))
  const ack = JSON.parse(
    readFileSync(join(diagnostics, 'before-quit.json'), 'utf8').replace(/^\uFEFF/, '')
  )
  if (ack.status !== 'waiting') throw new Error('Electron quit without a waiting acknowledgement')
  const deadline = Date.now() + 20000
  while ((!existsSync(marker) || receipt().status !== 'applied') && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100))
  if (receipt().status !== 'applied' || !existsSync(marker))
    throw new Error('Helper did not complete after Electron exited: '+JSON.stringify(receipt())+' logs: '+readdirSync(join(diagnostics,'updates')).map(name=>readFileSync(join(diagnostics,'updates',name,'helper.log'),'utf8').slice(-3000)).join('\n'))
  if (createHash('sha256').update(readFileSync(target)).digest('hex') !== hash)
    throw new Error('Fixture replacement hash mismatch')
  const result = {
    electronLauncher: 'passed',
    acknowledgedBeforeQuit: 'passed',
    survivesElectronExit: 'passed',
    verifiedReplacement: 'passed',
    restartsTarget: 'passed',
    realInstaller: 'covered separately by windows-update-smoke.mjs',
    nativeDesktopInteraction: 'not tested'
  }
  writeFileSync(join(diagnostics, 'report.json'), JSON.stringify(result, null, 2))
  writeFileSync(resolve('release/electron-update-handoff.json'), JSON.stringify(result, null, 2))
  console.log('::notice title=Electron updater handoff::' + JSON.stringify(result))
}
main().catch((error) => {
  const message = String(error instanceof Error ? error.message : error)
    .slice(0, 6000)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
  console.error('::error title=Electron handoff failed::' + message)
  process.exitCode = 1
})
