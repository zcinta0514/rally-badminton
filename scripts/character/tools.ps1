param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('blender', 'python', 'ffmpeg')][string]$Tool,
    [string]$ToolRoot = (Join-Path $env:USERPROFILE 'Documents\ChatGPT\开拍\character-program\local'),
    [string[]]$ToolArgs = @()
)
$ErrorActionPreference = 'Stop'
$names = @('PYTHONUTF8', 'PYTHONIOENCODING', 'BLENDER_USER_RESOURCES', 'BLENDER_USER_CONFIG', 'BLENDER_USER_SCRIPTS', 'BLENDER_USER_EXTENSIONS')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $env:BLENDER_USER_RESOURCES = Join-Path $ToolRoot 'blender-user'
    $env:BLENDER_USER_CONFIG = Join-Path $ToolRoot 'blender-user\config'
    $env:BLENDER_USER_SCRIPTS = Join-Path $ToolRoot 'blender-user\scripts'
    $env:BLENDER_USER_EXTENSIONS = Join-Path $ToolRoot 'blender-user\extensions'
    $python = Join-Path $ToolRoot 'pose-env\Scripts\python.exe'
    switch ($Tool) {
        'blender' { $exe = Join-Path $ToolRoot 'tools\blender-4.5.9-windows-x64\blender.exe' }
        'python' { $exe = $python }
        'ffmpeg' {
            $exe = & $python -X utf8 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
            if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve bundled FFmpeg' }
        }
    }
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Missing tool: $exe" }
    & $exe @ToolArgs
    $result = $LASTEXITCODE
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $before[$name], 'Process') }
}
exit $result
