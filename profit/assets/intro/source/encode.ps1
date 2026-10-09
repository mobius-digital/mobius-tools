param([int]$crfW = 34, [int]$crfX = 23)
$S = $PSScriptRoot
$F = "$S\node_modules\ffmpeg-static\ffmpeg.exe"
$in = "$S\full\f%04d.png"
$o = "$S\out"; New-Item -ItemType Directory -Force $o | Out-Null
$sq = 'crop=1080:1080:420:0'
# alpha webm, square + wide
& $F -y -hide_banner -loglevel error -framerate 60 -i $in -vf $sq -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf $crfW -row-mt 1 -deadline good -cpu-used 1 -auto-alt-ref 0 -an "$o\mobius-intro-square.webm"
& $F -y -hide_banner -loglevel error -framerate 60 -i $in -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf $crfW -row-mt 1 -deadline good -cpu-used 1 -auto-alt-ref 0 -an "$o\mobius-intro.webm"
# H.264 on the light and dark canvas colours
foreach ($v in @(@('', 'F7F7F8'), @('-dark', '111113'))) {
  $suf = $v[0]; $c = $v[1]
  & $F -y -hide_banner -loglevel error -framerate 60 -i $in -filter_complex "color=c=0x$($c):s=1080x1080:r=60[bg];[0]$sq[fg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p" -c:v libx264 -preset slow -crf $crfX -movflags +faststart -an "$o\mobius-intro-square$suf.mp4"
  & $F -y -hide_banner -loglevel error -framerate 60 -i $in -filter_complex "color=c=0x$($c):s=1920x1080:r=60[bg];[bg][0]overlay=shortest=1:format=auto,format=yuv420p" -c:v libx264 -preset slow -crf $crfX -movflags +faststart -an "$o\mobius-intro$suf.mp4"
}
# poster = last frame on the light canvas
& $F -y -hide_banner -loglevel error -i "$S\full\f0192.png" -filter_complex "color=c=0xF7F7F8:s=1920x1080[bg];[bg][0]overlay=format=auto" -frames:v 1 -q:v 2 "$o\mobius-intro-poster.jpg"
Get-ChildItem $o | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB)}} | Format-Table -AutoSize
