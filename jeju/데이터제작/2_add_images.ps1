# 2단계: wikimedia_images.tsv(이름 / 커먼즈 파일명 / 작가·라이선스)를 jeju_spots.json에 반영
#  - image        : 커먼즈 Special:FilePath 주소(가로 800px)
#  - image_credit : 작가 · 라이선스 (표기 의무가 있어 화면에 함께 보여준다)
#  - image_source : 커먼즈 파일 설명 페이지
#  - 사진이 없는 곳은 세 필드를 만들지 않는다
$root = Split-Path $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$path = "$root\jeju_spots.json"
$data = [IO.File]::ReadAllText($path, $utf8) | ConvertFrom-Json

$img = @{}
foreach ($ln in ([IO.File]::ReadAllLines("$PSScriptRoot\wikimedia_images.tsv", $utf8) | Where-Object { $_.Trim() })) {
  $c = $ln.Split("`t"); $img[$c[0]] = @{ file = $c[1]; credit = $c[2] }
}

$unknown = @($img.Keys | Where-Object { $_ -notin $data.items.name })
$items = foreach ($i in $data.items) {
  $o = [ordered]@{ name = $i.name; category = $i.category; description = $i.description; score = $i.score; selected = $i.selected; source = $i.source }
  if ($img.ContainsKey($i.name)) {
    $f = $img[$i.name].file
    $o.image = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + [Uri]::EscapeDataString($f) + '?width=800'
    $o.image_credit = $img[$i.name].credit
    $o.image_source = 'https://commons.wikimedia.org/wiki/File:' + [Uri]::EscapeDataString($f.Replace(' ', '_'))
  }
  $o
}
$obj = [ordered]@{ region = $data.region; topic = $data.topic; items = @($items) }
$json = $obj | ConvertTo-Json -Depth 5
$json = [regex]::Replace($json, '\\u([0-9a-fA-F]{4})', { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
[IO.File]::WriteAllText($path, $json, $utf8)
Write-Output ("사진 반영=$(@($items | Where-Object { $_.image }).Count)  사진 없음=$(@($items | Where-Object { -not $_.image }).Count)  목록에 없는 이름=$($unknown.Count)")
