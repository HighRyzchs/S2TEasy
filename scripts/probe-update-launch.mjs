// Synthetic launch probes: never install an app or touch a real user's update state.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('This probe runs only on disposable Windows Actions runners.')
const directory = mkdtempSync(join(tmpdir(), 's2t-launch-probe-'))
const diagnostics = resolve('release/launch-probe')
mkdirSync(diagnostics, { recursive: true })
await build({
  entryPoints: ['src/shared/update-install.ts'],
  outfile: join(directory, 'helper.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const fixture = join(directory, 'fixture.cjs')
writeFileSync(
  fixture,
  `
const { spawn } = require('node:child_process');
const { writeFileSync, readFileSync, openSync, closeSync, existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { buildVerifiedApplyScript } = require('./helper.cjs');
const directory = ${JSON.stringify(directory)}, diagnostics = ${JSON.stringify(diagnostics)};
async function run() {
  const rows=[],context=process.versions.electron?'electron':'node';
  for (const name of ['legacy-detached', 'no-windowstyle', 'current', 'bootstrap']) {
    const stem=context+'-'+name;
    const receipt=join(directory, stem+'-result.json'), cancel=join(directory,stem+'-cancelled');
    const payload=join(directory, stem+'-payload.bin');writeFileSync(payload,'synthetic payload');
    const script=buildVerifiedApplyScript({kind:'portable',currentExe:join(directory,'absent.exe'),payloadPath:payload,pid:process.pid,expectedSha256:createHash('sha256').update(readFileSync(payload)).digest('hex'),receiptPath:receipt,cancelPath:cancel,fromVersion:'0.0.1',toVersion:'0.0.2',attemptId:name});
    const scriptPath=join(directory,stem+'.ps1');writeFileSync(scriptPath,'\\uFEFF'+script);
    const args=['-NoLogo','-NoProfile','-NonInteractive'];
    if(name==='legacy-detached'||name==='current')args.push('-WindowStyle','Hidden');
    if(name==='bootstrap')args.push('-Command',"$ErrorActionPreference='Stop'; Write-Output 'bootstrap started'; & ([scriptblock]::Create([System.IO.File]::ReadAllText('"+scriptPath.replace(/'/g,"''")+"')))");
    else args.push('-EncodedCommand',Buffer.from(script,'utf16le').toString('base64'));
    const log=openSync(join(diagnostics, stem+'.log'),'a');
    const child=spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),args,{detached:name!=='current',windowsHide:true,stdio:['ignore',log,log],cwd:directory});closeSync(log);
    let error='',exited=false,closed=false,code=null,signal=null;child.on('close',()=>{closed=true});child.on('error',e=>{error=e.message;exited=true});child.on('exit',(c,s)=>{exited=true;code=c;signal=s});
    const deadline=Date.now()+12000;
    while(!exited&&!existsSync(receipt)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    let result;try{result=JSON.parse(readFileSync(receipt,'utf8').replace(/^\\uFEFF/,''))}catch{}
    rows.push({name,acknowledged:result?.status==='waiting',exited,code,signal,error,commandLength:args.join(' ').length,output:readFileSync(join(diagnostics,stem+'.log'),'utf8').slice(-1500)});
    writeFileSync(cancel,'cancelled');child.kill();if(!closed)await new Promise(r=>child.once('close',r));
  }
  writeFileSync(join(diagnostics,process.versions.electron?'electron.json':'node.json'),JSON.stringify(rows,null,2));
  console.log(JSON.stringify({context:process.versions.electron?'electron':'node',rows}));
}
if(process.versions.electron) {const {app}=require('electron');app.whenReady().then(run).then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1)})}else run().catch(e=>{console.error(e);process.exitCode=1});
`
)
async function execute(executable, args) {
  const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true })
  await new Promise((done, fail) => {
    const timer = setTimeout(() => {
      child.kill()
      fail(new Error('Launch probe deadline'))
    }, 120000)
    child.once('error', (e) => {
      clearTimeout(timer)
      fail(e)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      code === 0 ? done() : fail(new Error(`Probe exit ${code}`))
    })
  })
}
await execute(process.execPath, [fixture])
const electron = createRequire(import.meta.url)('electron')
await execute(electron, [fixture])
for (const context of ['node', 'electron']) {
  const rows = JSON.parse(readFileSync(join(diagnostics, context + '.json'), 'utf8'))
  if (!rows.find((row) => row.name === 'current')?.acknowledged)
    throw new Error(context + ' current launch did not acknowledge')
  for (const row of rows)
    console.log(
      '::notice title=Launch ' +
        context +
        ' ' +
        row.name +
        '::' +
        JSON.stringify(row).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    )
}
