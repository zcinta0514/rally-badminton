param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '../src/audio/finale-dad.wav'),
    [ValidateRange(-10, 10)][int]$Rate = -3
)

# Run with Windows PowerShell 5.1. No speakers, downloads, or registry writes.
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $OutputEncoding
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [IO.Path]::GetDirectoryName($OutputPath)
if (-not [IO.Directory]::Exists($outputDirectory)) {
    throw "Output directory does not exist: $outputDirectory"
}

$candidates = @(
    @{
        Id = 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_zhCN_KangkangM'
        ExpectedModel = 'M2052Kangkang'
    },
    @{
        Id = 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_ZH-CN_HUIHUI_11.0'
        ExpectedModel = 'M2052Huihui'
    }
)

$selected = $null
$voice = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
$format = New-Object -ComObject SAPI.SpAudioFormat
$opened = $false
$skipped = @()
try {
    foreach ($candidate in $candidates) {
        $token = $null
        try {
            $token = New-Object -ComObject SAPI.SpObjectToken
            $token.SetId($candidate.Id, '', $false)
            $voice.Voice = $token
            $model = [Microsoft.Win32.Registry]::GetValue($candidate.Id, 'VoicePath', $null)
            if ([IO.Path]::GetFileName($model) -ne $candidate.ExpectedModel) {
                throw "Token model mismatch: $model"
            }
            $selected = @{
                Voice = $token.GetDescription()
                Token = $token.Id
                Model = $model
            }
            break
        }
        catch {
            $skipped += "$($candidate.Id): $($_.Exception.Message)"
        }
        finally {
            if ($null -ne $token) {
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($token)
            }
        }
    }
    if ($null -eq $selected) {
        throw ('No supported Chinese voice available. ' + ($skipped -join '; '))
    }

    # SAFT22kHz16BitMono: 22050 Hz, signed 16-bit, mono PCM WAV.
    $format.Type = 22
    $stream.Format = $format
    $stream.Open($OutputPath, 3, $false)
    $opened = $true
    $voice.AudioOutputStream = $stream
    $voice.Rate = $Rate
    $voice.Volume = 100
    # U+7238 U+7238 (Mandarin "baba"); ASCII source works in PowerShell 5.1.
    $phrase = ([string][char]0x7238) + ([string][char]0x7238)
    [void]$voice.Speak($phrase, 0)
}
finally {
    if ($opened) { $stream.Close() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($stream)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($format)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($voice)
}

# Read the RIFF chunks; SAPI may include metadata ahead of the PCM payload.
$wav = [IO.File]::ReadAllBytes($OutputPath)
if ([Text.Encoding]::ASCII.GetString($wav, 0, 4) -ne 'RIFF' -or
    [Text.Encoding]::ASCII.GetString($wav, 8, 4) -ne 'WAVE') {
    throw 'SAPI did not produce a WAV file.'
}
$dataOffset = -1
$dataLength = 0
$sampleRate = 0
for ($offset = 12; $offset + 8 -le $wav.Length;) {
    $chunkId = [Text.Encoding]::ASCII.GetString($wav, $offset, 4)
    $chunkSize = [BitConverter]::ToInt32($wav, $offset + 4)
    $payload = $offset + 8
    if ($chunkSize -lt 0 -or $payload + $chunkSize -gt $wav.Length) {
        throw 'Invalid WAV chunk length.'
    }
    if ($chunkId -eq 'fmt ') {
        if ($chunkSize -lt 16 -or
            [BitConverter]::ToInt16($wav, $payload) -ne 1 -or
            [BitConverter]::ToInt16($wav, $payload + 2) -ne 1 -or
            [BitConverter]::ToInt16($wav, $payload + 14) -ne 16) {
            throw 'Expected signed 16-bit mono PCM.'
        }
        $sampleRate = [BitConverter]::ToInt32($wav, $payload + 4)
    }
    if ($chunkId -eq 'data') {
        $dataOffset = $payload
        $dataLength = $chunkSize
    }
    $offset = $payload + $chunkSize + ($chunkSize % 2)
}
if ($dataOffset -lt 0 -or $sampleRate -ne 22050 -or $dataLength % 2 -ne 0) {
    throw 'Missing or unsupported PCM data.'
}

$samples = New-Object 'Int16[]' ($dataLength / 2)
[Buffer]::BlockCopy($wav, $dataOffset, $samples, 0, $dataLength)
$first = -1
$last = -1
$rawPeak = 0
# -60 dBFS threshold, retaining 30 ms around the audible phrase.
$silenceThreshold = 33
for ($i = 0; $i -lt $samples.Length; $i++) {
    $magnitude = [Math]::Abs([int]$samples[$i])
    $rawPeak = [Math]::Max($rawPeak, $magnitude)
    if ($magnitude -ge $silenceThreshold) {
        if ($first -lt 0) { $first = $i }
        $last = $i
    }
}
if ($first -lt 0) { throw 'The synthesized audio is silent.' }
if ($rawPeak -ge 32767) { throw 'The synthesized audio contains clipped samples.' }
$padding = [int][Math]::Round($sampleRate * 0.030)
$start = [Math]::Max(0, $first - $padding)
$end = [Math]::Min($samples.Length - 1, $last + $padding)
$length = $end - $start + 1
$duration = $length / [double]$sampleRate
if ($duration -lt 0.6 -or $duration -gt 1.2) {
    throw "Trimmed duration $duration seconds is outside 0.6-1.2 seconds; adjust -Rate."
}

# Normalize to 72% peak (-2.85 dBFS) for predictable game playback headroom.
$gain = (32767 * 0.72) / $rawPeak
$pcm = New-Object byte[] ($length * 2)
$peak = 0
$sumSquares = 0.0
$silentSamples = 0
for ($i = 0; $i -lt $length; $i++) {
    $sample = [int16][Math]::Round($samples[$start + $i] * $gain)
    $encoded = [BitConverter]::GetBytes($sample)
    $pcm[$i * 2] = $encoded[0]
    $pcm[$i * 2 + 1] = $encoded[1]
    $magnitude = [Math]::Abs([int]$sample)
    $peak = [Math]::Max($peak, $magnitude)
    $sumSquares += [double]$sample * $sample
    if ($magnitude -lt $silenceThreshold) { $silentSamples++ }
}

$file = [IO.File]::Create($OutputPath)
$writer = New-Object IO.BinaryWriter($file)
try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
    $writer.Write([int](36 + $pcm.Length))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
    $writer.Write([int]16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([int]$sampleRate)
    $writer.Write([int]($sampleRate * 2))
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([int]$pcm.Length)
    $writer.Write($pcm)
}
finally {
    $writer.Dispose()
    $file.Dispose()
}

[pscustomobject]@{
    Path = $OutputPath
    Voice = $selected.Voice
    Token = $selected.Token
    Model = $selected.Model
    Rate = $Rate
    SampleRate = $sampleRate
    Channels = 1
    BitsPerSample = 16
    Frames = $length
    DurationSeconds = [Math]::Round($duration, 6)
    Peak = $peak
    PeakDbFS = [Math]::Round(20 * [Math]::Log10($peak / 32768.0), 3)
    Rms = [Math]::Round([Math]::Sqrt($sumSquares / $length), 3)
    SilentFractionBelowMinus60Db = [Math]::Round($silentSamples / [double]$length, 6)
    ClippedSamples = 0
    SkippedCandidates = $skipped
} | ConvertTo-Json -Depth 3
