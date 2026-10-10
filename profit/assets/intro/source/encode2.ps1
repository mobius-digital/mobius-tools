param([int]$crfW = 45, [int]$crfX = 26, [string]$in = 'full', [switch]$skipClean)
# 1) clean: the shadow's faint pixels get a plain black colour (un-premultiplied dither there is noise the encoder
#    pays for), then a light spatial + temporal denoise of the COLOUR only (hqdn3d/nlmeans drop alpha, so alpha is
#    split off and merged back untouched).
# 2) encode: frames are 1080x1080 (the film never leaves the centre square); the 1920x1080 copies are padded.
$S = $PSScriptRoot
$F = "$S\node_modules\ffmpeg-static\ffmpeg.exe"
$cl = "$S\clean"
if (-not $skipClean) {
  New-Item -ItemType Directory -Force $cl | Out-Null
  $k = 'if(eq(alpha(X\,Y)\,255)\,1\,if(lt(alpha(X\,Y)\,6)+lt(0.3*r(X\,Y)+0.59*g(X\,Y)+0.11*b(X\,Y)\,90)\,0\,1))'
  $fc = "[0]format=rgba,geq=r='r(X,Y)*$k':g='g(X,Y)*$k':b='b(X,Y)*$k':a='alpha(X,Y)',format=rgba,split[c][a];[c]format=yuv444p,nlmeans=s=3:p=7:r=13,hqdn3d=1.5:1.5:6:6[cd];[a]alphaextract,format=gray[al];[cd][al]alphamerge,format=rgba[o]"
  & $F -y -hide_banner -loglevel error -framerate 60 -i "$S\$in\f%04d.png" -filter_complex $fc -map "[o]" "$cl\f%04d.png"
}
$src = "$cl\f%04d.png"
$o = "$S\out"; New-Item -ItemType Directory -Force $o | Out-Null
$pad = 'format=rgba,pad=1920:1080:420:0:color=0x00000000'
$vp9 = @('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', "$crfW", '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-auto-alt-ref', '0', '-an')
& $F -y -hide_banner -loglevel error -framerate 60 -i $src @vp9 "$o\mobius-intro-square.webm"
& $F -y -hide_banner -loglevel error -framerate 60 -i $src -vf $pad @vp9 "$o\mobius-intro.webm"
foreach ($v in @(@('', 'F7F7F8'), @('-dark', '111113'))) {
  $suf = $v[0]; $c = $v[1]
  & $F -y -hide_banner -loglevel error -framerate 60 -i $src -filter_complex "color=c=0x$($c):s=1080x1080:r=60[bg];[bg][0]overlay=shortest=1:format=auto,format=yuv420p" -c:v libx264 -preset slow -crf $crfX -movflags +faststart -an "$o\mobius-intro-square$suf.mp4"
}
& $F -y -hide_banner -loglevel error -framerate 60 -i $src -filter_complex "color=c=0xF7F7F8:s=1920x1080:r=60[bg];[0]$pad[fg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p" -c:v libx264 -preset slow -crf $crfX -movflags +faststart -an "$o\mobius-intro.mp4"
$last = (Get-ChildItem "$cl\f*.png" | Sort-Object Name | Select-Object -Last 1).FullName
& $F -y -hide_banner -loglevel error -i $last -filter_complex "color=c=0xF7F7F8:s=1920x1080[bg];[0]$pad[fg];[bg][fg]overlay=shortest=1:format=auto" -frames:v 1 -update 1 -q:v 2 "$o\mobius-intro-poster.jpg"
Get-ChildItem $o | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB)}} | Format-Table -AutoSize
