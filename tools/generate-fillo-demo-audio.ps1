<#
  Generates natural ElevenLabs recordings for the Fillo live call demo (fillo.html → "See Fillo in action"):
    assets/audio/fillo-demo/turn-1.mp3 … turn-10.mp3
  When these files exist the demo plays them (agent + caller voices); otherwise it uses the
  browser's built-in voices. Audio is always muted until the visitor turns sound on.

  Your API key is read from the ELEVENLABS_API_KEY environment variable and is never
  written into the website. Do NOT paste the key into any .html/.js file.

  Usage (PowerShell, from the project folder):
    $env:ELEVENLABS_API_KEY = "your-key-here"
    powershell -ExecutionPolicy Bypass -File tools\generate-fillo-demo-audio.ps1

  Voice IDs are from the ElevenLabs premade library. Check them in your Voice Library and
  swap in any voices you prefer via the parameters.
#>
param(
  [string]$AgentVoiceId = "21m00Tcm4TlvDq8ikWAM",   # "Rachel": calm, professional female (Fillo)
  [string]$CallerVoiceId = "TxGEqnHWrfWFTfGW9XjX",  # "Josh": natural male (caller)
  [string]$ModelId = "eleven_multilingual_v2"
)

$ErrorActionPreference = "Stop"
$key = $env:ELEVENLABS_API_KEY
if (-not $key) { throw "Set the ELEVENLABS_API_KEY environment variable first (see the usage notes at the top of this file)." }

$outDir = Join-Path $PSScriptRoot "..\assets\audio\fillo-demo"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Keep in sync with FD_TURNS in fillo.js (same order, same text)
$turns = @(
  @{ Who = "ai";   Text = "Hello! Thank you for calling. How can I help you today?" },
  @{ Who = "user"; Text = "Hi, I'd like to book an appointment." },
  @{ Who = "ai";   Text = "Absolutely! I'd be happy to help. What day works best for you?" },
  @{ Who = "user"; Text = "Tomorrow afternoon." },
  @{ Who = "ai";   Text = "Perfect! Let me check the available slots for you." },
  @{ Who = "ai";   Text = "I have 2 PM or 3:30 PM tomorrow. Which would you prefer?" },
  @{ Who = "user"; Text = "3:30 works great." },
  @{ Who = "ai";   Text = "You're all set for tomorrow at 3:30 PM. You'll get a confirmation text shortly." },
  @{ Who = "user"; Text = "Perfect, thank you!" },
  @{ Who = "ai";   Text = "You're welcome! Have a wonderful day." }
)

for ($i = 0; $i -lt $turns.Count; $i++) {
  $t = $turns[$i]
  $voice = if ($t.Who -eq "ai") { $AgentVoiceId } else { $CallerVoiceId }
  $settings = if ($t.Who -eq "ai") { @{ stability = 0.5; similarity_boost = 0.75; style = 0.2; use_speaker_boost = $true } } else { @{ stability = 0.4; similarity_boost = 0.7; style = 0.3; use_speaker_boost = $true } }
  $body = @{ text = $t.Text; model_id = $ModelId; voice_settings = $settings } | ConvertTo-Json -Depth 4
  $out = Join-Path $outDir ("turn-{0}.mp3" -f ($i + 1))
  Invoke-WebRequest -Uri "https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128" `
    -Method Post `
    -Headers @{ "xi-api-key" = $key; "Accept" = "audio/mpeg" } `
    -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
    -OutFile $out
  Write-Host "Saved $out"
}
Write-Host "Done. Reload fillo.html, turn sound on in the demo and press play."
