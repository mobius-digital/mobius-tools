# Renders every ebf-*.html (and later bf-*/dec-*) to out\ at 1080x1350. Own Chrome profile so it never
# collides with another chat's render.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$prof = Join-Path $env:TEMP 'bonk-ad-render'
New-Item -ItemType Directory -Force (Join-Path $dir 'out') | Out-Null
Get-ChildItem -Path $dir -Filter '*.html' | Where-Object { $_.BaseName -match '^(ebf|bf|dec|ai)-' } | ForEach-Object {
  $out = Join-Path $dir "out\$($_.BaseName).png"
  & $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --user-data-dir="$prof" --window-size="1080,1350" --virtual-time-budget=4000 --screenshot="$out" ("file:///" + ($_.FullName -replace '\\','/')) 2>$null | Out-Null
  Write-Output $out
}
