# Pushes the keys in .env up to the mobius-ledger worker as Cloudflare secrets.
# Run from ledger/worker:  powershell -File push-secrets.ps1
# Empty values are skipped, so you can fill and push one key at a time.
# ASCII only on purpose: PowerShell 5.1 reads BOM-less files as ANSI and
# mangled the previous version's punctuation into a parse error.

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) { Write-Host "No .env file found next to this script." -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot
$pushed = 0
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*"(.*)"\s*$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value -eq "") { continue }
        Write-Host "Pushing $name..." -NoNewline
        $tmp = [IO.Path]::GetTempFileName()
        [IO.File]::WriteAllText($tmp, $value)   # no trailing newline - it would corrupt the secret
        Get-Content $tmp -Raw | npx.cmd wrangler secret put $name | Out-Null
        Remove-Item $tmp -Force
        if ($LASTEXITCODE -eq 0) { Write-Host " done" -ForegroundColor Green; $pushed++ }
        else { Write-Host " FAILED - run 'npx wrangler secret put $name' by hand to see why" -ForegroundColor Red }
    }
}
if ($pushed -eq 0) { Write-Host "Nothing pushed - paste a key into .env first." -ForegroundColor Yellow }
else { Write-Host "$pushed secret(s) pushed to mobius-ledger. You can now blank or delete .env." }
