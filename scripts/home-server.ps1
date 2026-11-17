param(
  [ValidateSet('Start','Run','Stop','Status')][string]$Action = 'Status',
  [string]$StateRoot = "$env:LOCALAPPDATA\RallyServer",
  [int]$Port = 3210
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$stateFile = Join-Path $StateRoot 'status.json'
$stopFile = Join-Path $StateRoot 'stop.request'
$logRoot = Join-Path $StateRoot 'logs'
$cloudExe = Join-Path $StateRoot 'bin\cloudflared.exe'
New-Item -ItemType Directory -Force -Path $StateRoot,$logRoot | Out-Null

if ($Action -eq 'Status') {
  if (Test-Path -LiteralPath $stateFile) {
    $status = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $status | ConvertTo-Json
    try { Invoke-RestMethod "http://127.0.0.1:$($status.port)/health" -TimeoutSec 3 | ConvertTo-Json }
    catch { Write-Output 'Local server is not responding.' }
  } else { Write-Output 'Server has not started.' }
  exit
}
if ($Action -eq 'Stop') {
  Set-Content -LiteralPath $stopFile -Value 'stop' -Encoding UTF8
  Write-Output 'Stop requested. Existing matches will disconnect. Startup stays paused until Start is used.'
  exit
}
if ($Action -eq 'Start') {
  if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
  $arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Run -StateRoot "' + $StateRoot + '" -Port ' + $Port
  Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList $arguments -WindowStyle Hidden | Out-Null
  Write-Output "Starting. Current address and health: $stateFile"
  exit
}
if (Test-Path -LiteralPath $stopFile) { exit }
if ($Port -lt 1024 -or $Port -gt 65534) { throw 'Port must be between 1024 and 65534.' }
if (!(Test-Path -LiteralPath $cloudExe)) { throw "Missing official cloudflared executable: $cloudExe" }
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$mutex = [Threading.Mutex]::new($false, 'Local\RallyHomeServer3210')
if (!$mutex.WaitOne(0)) { $mutex.Dispose(); exit }

# Keep the host awake only while this supervisor is running; do not change
# the global Windows sleep plan or keep the display on.
Add-Type @'
using System.Runtime.InteropServices;
public static class RallyPower {
  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
}
public static class RallyJob {
  [StructLayout(LayoutKind.Sequential)] struct Basic {
    public long ProcessTime, JobTime; public uint Flags;
    public System.UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
    public System.UIntPtr Affinity; public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Io {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct Extended {
    public Basic Limits; public Io Counters;
    public System.UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern System.IntPtr CreateJobObject(System.IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(System.IntPtr job, int info, ref Extended limits, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(System.IntPtr job, System.IntPtr process);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(System.IntPtr handle);
  public static System.IntPtr Create() {
    var job=CreateJobObject(System.IntPtr.Zero,null);
    if(job==System.IntPtr.Zero)throw new System.ComponentModel.Win32Exception();
    var limits=new Extended(); limits.Limits.Flags=0x2000;
    if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Extended)))) {
      var error=Marshal.GetLastWin32Error(); CloseHandle(job);throw new System.ComponentModel.Win32Exception(error);
    }
    return job;
  }
}
'@
$jobHandle = [RallyJob]::Create()
[RallyPower]::SetThreadExecutionState([uint32]2147483649) | Out-Null
$tunnel = $null; $game = $null; $publicUrl = ''; $failures = 0
$package = Get-Content (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json
function Save-Status([string]$phase, [string]$message = '') {
  $value = [ordered]@{ phase=$phase; url=$publicUrl; localUrl="http://127.0.0.1:$Port"; port=$Port;
    version=$package.version; sourceRoot=$sourceRoot; supervisorPid=$PID;
    tunnelPid=$(if ($tunnel) {$tunnel.Id} else {$null}); serverPid=$(if ($game) {$game.Id} else {$null});
    updatedAt=[DateTime]::UtcNow.ToString('o'); restarts=$failures; message=$message;
    ingress='temporary-quick-tunnel'; maxRooms=10; maxClients=40 }
  $value | ConvertTo-Json | Set-Content -LiteralPath ($stateFile + '.tmp') -Encoding UTF8
  Move-Item -LiteralPath ($stateFile + '.tmp') -Destination $stateFile -Force
}
function Rotate-Log([string]$file) {
  if (Test-Path -LiteralPath ($file + '.3')) { Remove-Item -LiteralPath ($file + '.3') }
  foreach ($i in 2,1) { if (Test-Path -LiteralPath ($file + '.' + $i)) { Move-Item -LiteralPath ($file + '.' + $i) -Destination ($file + '.' + ($i+1)) -Force } }
  if (Test-Path -LiteralPath $file) { Move-Item -LiteralPath $file -Destination ($file + '.1') -Force }
}
function Stop-Children {
  foreach ($child in @($game,$tunnel)) {
    if ($child) { try { if (!$child.HasExited) { $child.Kill(); $child.WaitForExit(5000) | Out-Null } } catch {} }
  }
}
function Protect-Child($child) {
  if (![RallyJob]::AssignProcessToJobObject($jobHandle,$child.Handle)) {
    $code=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
    try { $child.Kill() } catch {}
    throw "Cannot bind child lifetime to supervisor (Windows error $code)."
  }
}
try {
  while (!(Test-Path -LiteralPath $stopFile)) {
    $game = $null; $tunnel = $null; $publicUrl = ''
    try {
      foreach ($name in 'tunnel.stdout.log','tunnel.stderr.log','game.stdout.log','game.stderr.log') { Rotate-Log (Join-Path $logRoot $name) }
      Save-Status 'connecting'
      $tunnel = Start-Process -FilePath $cloudExe -ArgumentList @('tunnel','--url',"http://127.0.0.1:$Port",'--protocol','http2','--no-autoupdate','--metrics',"127.0.0.1:$($Port+1)") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'tunnel.stdout.log') -RedirectStandardError (Join-Path $logRoot 'tunnel.stderr.log') -PassThru
      Protect-Child $tunnel
      $deadline = [DateTime]::UtcNow.AddSeconds(120)
      while (!$publicUrl -and [DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $stopFile) { break }
        if ($tunnel.HasExited) { throw 'Tunnel exited before receiving an address.' }
        $contents = Get-Content (Join-Path $logRoot 'tunnel.stderr.log') -Raw -ErrorAction SilentlyContinue
        if ($contents -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0] }
        else { Start-Sleep -Seconds 2 }
      }
      if (Test-Path -LiteralPath $stopFile) { break }
      if (!$publicUrl) { throw 'Tunnel did not return an address within 120 seconds.' }
      $env:HOST='127.0.0.1'; $env:PORT=[string]$Port; $env:PUBLIC_PEER_MODE='0'; $env:PUBLIC_WS_URL=''
      $env:ALLOWED_ORIGINS="$publicUrl,http://127.0.0.1:$Port"; $env:ALLOW_MISSING_ORIGIN='0'
      $env:MAX_CLIENTS='40'; $env:MAX_ROOMS='10'
      $env:LEADERBOARD_PATH=Join-Path $StateRoot 'data\leaderboard.json'
      New-Item -ItemType Directory -Force -Path (Split-Path $env:LEADERBOARD_PATH -Parent) | Out-Null
      $game = Start-Process -FilePath $nodeExe -ArgumentList @('server/index.js') -WorkingDirectory $sourceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'game.stdout.log') -RedirectStandardError (Join-Path $logRoot 'game.stderr.log') -PassThru
      Protect-Child $game
      Save-Status 'starting'
      $lastSample=[DateTime]::MinValue; $unhealthy=0
      while (!(Test-Path -LiteralPath $stopFile)) {
        if ($tunnel.HasExited) { throw 'Tunnel process stopped; restarting with a new temporary address.' }
        if ($game.HasExited) { throw 'Game process stopped; restarting.' }
        if (([DateTime]::UtcNow-$lastSample).TotalSeconds -ge 15) {
          $lastSample=[DateTime]::UtcNow
          # Soft size bound checked every 15 seconds. Excessive error output
          # triggers a controlled restart/rotation and disconnects matches.
          foreach ($name in 'tunnel.stdout.log','tunnel.stderr.log','game.stdout.log','game.stderr.log') {
            if ((Get-Item (Join-Path $logRoot $name)).Length -gt 10MB) { throw "Log size threshold reached: $name" }
          }
          try {
            $health=Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3
            if (!$health.ok) { throw 'Unhealthy response.' }
            $unhealthy=0
            try {
              Invoke-WebRequest "http://127.0.0.1:$($Port+1)/ready" -TimeoutSec 3 | Out-Null
              Save-Status 'running'
            } catch { Save-Status 'degraded' 'Local game is healthy; tunnel is not ready.' }
            $metrics=Join-Path $logRoot 'metrics.jsonl'
            if ((Test-Path $metrics) -and (Get-Item $metrics).Length -gt 5MB) { Rotate-Log $metrics }
            $game.Refresh()
            @{time=[DateTime]::UtcNow.ToString('o');rooms=$health.rooms;clients=$health.clients;rssBytes=$game.WorkingSet64;cpuSeconds=$game.TotalProcessorTime.TotalSeconds} | ConvertTo-Json -Compress | Add-Content -LiteralPath $metrics -Encoding UTF8
          } catch {
            $unhealthy++; Save-Status 'starting' 'Waiting for local health check.'
            if ($unhealthy -ge 4) { throw 'Local health check failed four times.' }
          }
        }
        Start-Sleep -Seconds 2
      }
    } catch {
      $failures++; Save-Status 'retrying' $_.Exception.Message
    } finally { Stop-Children }
    if (!(Test-Path -LiteralPath $stopFile)) { Start-Sleep -Seconds 10 }
  }
} finally {
  Stop-Children
  Save-Status 'stopped'
  [RallyJob]::CloseHandle($jobHandle) | Out-Null
  [RallyPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
