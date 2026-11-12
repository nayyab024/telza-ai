<#
  Generates the three homepage voice-style samples with ElevenLabs:
    assets/audio/voice-warm.mp3, voice-professional.mp3, voice-energetic.mp3
  The homepage plays these files automatically when they exist (Agent builder card in
  "Voices so natural, callers forget it's AI"), and falls back to the browser voice otherwise.

  Your API key is read from the ELEVENLABS_API_KEY environment variable and is never
  written into the website. Do NOT paste the key into any .html/.js file.

  Usage (PowerShell, from the project folder):
    $env:ELEVENLABS_API_KEY = "your-key-here"
    powershell -ExecutionPolicy Bypass -File tools\generate-voice-styles.ps1

  The voice IDs below are female voices from the ElevenLabs premade library. Check them in
  your Voice Library and swap in any voices you prefer via the parameters.
#>
param(
  [string]$WarmVoiceId = "XrExE9yKIg1WjnnlVkGX",          # "Matilda": warm, friendly
  [string]$ProfessionalVoiceId = "21m00Tcm4TlvDq8ikWAM",  # "Rachel": calm, clear, professional
  [string]$EnergeticVoiceId = "cgSgspJ2msm6clMCkdW9",     # "Jessica": expressive, upbeat
  [string]$ModelId = "eleven_multilingual_v2"
)

$ErrorActionPreference = "Stop"
$key = $env:ELEVENLABS_API_KEY
if (-not $key) { throw "Set the ELEVENLABS_API_KEY environment variable first (see the usage notes at the top of this file)." }

$outDir = Join-Path $PSScriptRoot "..\assets\audio"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Keep these texts in sync with VOICE_STYLES in script.js
$styles = @(
  @{ Name = "warm"; VoiceId = $WarmVoiceId; Stability = 0.55; Style = 0.30
     Text = "Hello! Welcome to Telza. It's lovely to hear from you. How can I help you today?" },
  @{ Name = "professional"; VoiceId = $ProfessionalVoiceId; Stability = 0.70; Style = 0.05
     Text = "Thank you for contacting us. I'm Telza's AI assistant, and I'm here to help you with your request." },
  @{ Name = "energetic"; VoiceId = $EnergeticVoiceId; Stability = 0.30; Style = 0.65
     Text = "Hey there! Thanks for calling Telza. I'm excited to help you today. What can I do for you?" }
)

foreach ($s in $styles) {
  $body = @{
    text           = $s.Text
    model_id       = $ModelId
    voice_settings = @{ stability = $s.Stability; similarity_boost = 0.75; style = $s.Style; use_speaker_boost = $true }
  } | ConvertTo-Json -Depth 4
  $out = Join-Path $outDir "voice-$($s.Name).mp3"
  Invoke-WebRequest -Uri "https://api.elevenlabs.io/v1/text-to-speech/$($s.VoiceId)?output_format=mp3_44100_128" `
    -Method Post `
    -Headers @{ "xi-api-key" = $key; "Accept" = "audio/mpeg" } `
    -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
    -OutFile $out
  Write-Host "Saved $out ($((Get-Item $out).Length) bytes)"
}
Write-Host "Done. Reload index.html and click a voice style."
