# 1단계: 관광지 목록(spots_raw.txt)을 보고서 텍스트와 대조해 jeju_spots.json 생성 + 중복/카테고리 검증
#  - spots_raw.txt : 이름|카테고리|설명|점수|(보고서 검색용 키워드)  ← 직접 고른 100곳
#  - 보고서에 이름이 나오면 source에 보고서명을 채우고, 없으면 빈 문자열로 둔다
#  - selected: score 75 이상이면 true
$root = Split-Path $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Strip([string]$t) { return ($t -replace '\s', '') }

$reports = @(
  @{ file = '동향보고서_2026-03월호.txt'; label = '제주 관광시장 동향 보고서(2026년 3월호)' },
  @{ file = '동향보고서_2026-06월.txt';   label = '제주 관광시장 동향 보고서(2026년 6월)' },
  @{ file = '동향보고서_2026-09월.txt';   label = '제주 관광시장 동향 보고서(2026년 9월)' }
)
foreach ($r in $reports) { $r.text = Strip ([IO.File]::ReadAllText("$root\참고자료\추출텍스트\$($r.file)", $utf8)) }

$items = @()
foreach ($ln in ([IO.File]::ReadAllLines("$PSScriptRoot\spots_raw.txt", $utf8) | Where-Object { $_.Trim() })) {
  $p = $ln.Split('|')
  $key = Strip $(if ($p.Count -ge 5 -and $p[4]) { $p[4] } else { $p[0] })
  $src = @($reports | Where-Object { $_.text.Contains($key) } | ForEach-Object { $_.label })
  $score = [int]$p[3]
  $items += [ordered]@{ name = $p[0]; category = $p[1]; description = $p[2]; score = $score; selected = ($score -ge 75); source = ($src -join ', ') }
}

# 검증
$dup = $items | Group-Object { (Strip $_.name).ToLower() } | Where-Object Count -gt 1
Write-Output ("total=$($items.Count)  중복 이름=$(@($dup).Count)  selected=$(@($items | Where-Object selected).Count)")
$items | Group-Object { $_.category } | Sort-Object Count -Descending | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
Write-Output ("보고서 인용=$(@($items | Where-Object source).Count)  보고서 외=$(@($items | Where-Object { -not $_.source }).Count)")

$sorted = $items | Sort-Object @{Expression={$_.score};Descending=$true}, @{Expression={$_.name}}
$obj = [ordered]@{ region = '제주특별자치도'; topic = '제주 관광지·명소'; items = @($sorted) }
$json = $obj | ConvertTo-Json -Depth 5
$json = [regex]::Replace($json, '\\u([0-9a-fA-F]{4})', { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
[IO.File]::WriteAllText("$root\jeju_spots.json", $json, $utf8)
Write-Output "저장: $root\jeju_spots.json"
