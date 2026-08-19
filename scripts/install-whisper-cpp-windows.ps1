$ErrorActionPreference = "Stop"

$toolsRoot = "C:\AutoSubTools"
$whisperRoot = Join-Path $toolsRoot "whisper.cpp"
$modelsRoot = Join-Path $toolsRoot "models"
$downloadsRoot = Join-Path $toolsRoot "downloads"
$releaseVersion = "v1.8.6"
$whisperZipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/$releaseVersion/whisper-bin-x64.zip"
$whisperZipPath = Join-Path $downloadsRoot "whisper-bin-x64-$releaseVersion.zip"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
$modelPath = Join-Path $modelsRoot "ggml-small.bin"

New-Item -ItemType Directory -Force $whisperRoot | Out-Null
New-Item -ItemType Directory -Force $modelsRoot | Out-Null
New-Item -ItemType Directory -Force $downloadsRoot | Out-Null

if (-not (Test-Path $whisperZipPath)) {
  Write-Host "Downloading whisper.cpp $releaseVersion Windows CPU binary..."
  Invoke-WebRequest -Uri $whisperZipUrl -OutFile $whisperZipPath
}

Write-Host "Extracting whisper.cpp..."
Expand-Archive -Path $whisperZipPath -DestinationPath $whisperRoot -Force

$whisperCli = Get-ChildItem -Path $whisperRoot -Filter "whisper-cli.exe" -Recurse -File | Select-Object -First 1
if (-not $whisperCli) {
  throw "whisper-cli.exe was not found after extracting $whisperZipPath"
}

if (-not (Test-Path $modelPath)) {
  Write-Host "Downloading ggml-small.bin multilingual model. This is about 466 MiB..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
}

$modelInfo = Get-Item $modelPath
if ($modelInfo.Length -lt 100MB) {
  throw "Model file looks too small: $modelPath ($($modelInfo.Length) bytes)"
}

$cliDir = $whisperCli.Directory.FullName
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = @($userPath -split ";" | Where-Object { $_ })
if ($pathParts -notcontains $cliDir) {
  [Environment]::SetEnvironmentVariable("Path", (($pathParts + $cliDir) -join ";"), "User")
}

[Environment]::SetEnvironmentVariable("AUTOSUB_WHISPER_CPP_MODEL", $modelPath, "User")
[Environment]::SetEnvironmentVariable("AUTOSUB_WHISPER_CPP_CLI", $whisperCli.FullName, "User")
$env:Path = (($env:Path -split ";" | Where-Object { $_ }) + $cliDir | Select-Object -Unique) -join ";"
$env:AUTOSUB_WHISPER_CPP_MODEL = $modelPath
$env:AUTOSUB_WHISPER_CPP_CLI = $whisperCli.FullName

Write-Host ""
Write-Host "Installed whisper.cpp:"
Write-Host "CLI:   $($whisperCli.FullName)"
Write-Host "Model: $modelPath"
Write-Host ""
Write-Host "Checking whisper-cli..."
& $whisperCli.FullName -h | Select-Object -First 5
