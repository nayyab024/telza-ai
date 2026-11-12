<#
  Generates the hero "Try AI Voice" greeting with ElevenLabs and saves it as
  assets/audio/telza-voice-sample.mp3, which ai-voice-agent.html plays automatically
  (falling back to the browser voice when the file is missing).

  Your API key is read from the ELEVENLABS_API_KEY environment variable and is
  never written into the website. Do NOT paste the key into any .html/.js file.

  Usage (PowerShell, from the project folder):
    $env:ELEVENLABS_API_KEY = "your-key-here"
    powershell -ExecutionPolicy Bypass -File tools\generate-voice.ps1
    # optional: pick another female voice from your ElevenLabs Voice Library
    powershell -ExecutionPolicy Bypass -File tools\generate-voice.ps1 -VoiceId "<voice-id>"
#>
param(
  # Default: "Rachel", a calm, professional female English voice from the ElevenLabs premade library.
  [string]$VoiceId = "21m00Tcm4TlvDq8ikWAM",
  [string]$ModelId = "eleven_multilingual_v2",
  [string]$Out = (Join-Path $PSScriptRoot "..\assets\audio\telza-voice-sample.mp3")
)

$ErrorActionPreference = "Stop"
$key = $env:ELEVENLABS_API_KEY
if (-not $key) { throw "Set the ELEVENLABS_API_KEY environment variable first (see the usage notes at the top of this file)." }

# Keep this text in sync with VOICE_SCRIPT in voice-agent.js
$text = "Hello! Thank you for calling Telza AI. I'm your virtual assistant. How can I help you today? I can answer your questions, schedule appointments, and connect you with the right team. How may I assist you?"

$body = @{
  text           = $text
  model_id       = $ModelId
  voice_settings = @{ stability = 0.5; similarity_boost = 0.75; style = 0.15; use_speaker_boost = $true }
} | ConvertTo-Json -Depth 4

$outDir = Split-Path -Parent $Out
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

Invoke-WebRequest -Uri "https://api.elevenlabs.io/v1/text-to-speech/${VoiceId}?output_format=mp3_44100_128" `
  -Method Post `
  -Headers @{ "xi-api-key" = $key; "Accept" = "audio/mpeg" } `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
  -OutFile $Out

$size = (Get-Item $Out).Length
Write-Host "Saved $Out ($size bytes). Reload ai-voice-agent.html and press 'Try AI Voice'."
