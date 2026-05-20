# test-everything.ps1
# Complete end-to-end test of the tenderpreneurs pipeline.
# ASCII-only for PowerShell 5 compatibility.
# Run: .\test-everything.ps1

$ErrorActionPreference = 'Continue'
$PassedCount = 0
$FailedCount = 0
$SkippedCount = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Test)
    Write-Host ""
    Write-Host "TEST: $Name" -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    try {
        $result = & $Test
        if ($result -eq $true) {
            Write-Host "  [PASS]" -ForegroundColor Green
            $script:PassedCount++
        } elseif ($result -eq "SKIP") {
            Write-Host "  [SKIP]" -ForegroundColor Yellow
            $script:SkippedCount++
        } else {
            Write-Host "  [FAIL]" -ForegroundColor Red
            $script:FailedCount++
        }
    } catch {
        Write-Host "  [ERROR] $_" -ForegroundColor Red
        $script:FailedCount++
    }
}

$secret = $null
if (Test-Path .local-secrets.txt) {
    $line = Get-Content .local-secrets.txt | Where-Object { $_ -match "^SESSION_SECRET=" } | Select-Object -Last 1
    if ($line) { $secret = ($line -replace "^SESSION_SECRET=", "").Trim() }
}

$site = "https://tenderpreneurs.pages.dev"

Write-Host ""
Write-Host "Tenderpreneurs End-to-End Test Suite" -ForegroundColor White
Write-Host "Site:   $site" -ForegroundColor Gray
Write-Host "Secret: $($null -ne $secret -and $secret.Length -gt 0)" -ForegroundColor Gray

# ===== Test 1: Site is up =====
Test-Step "Site responds HTTP 200" {
    $r = Invoke-WebRequest -Uri $site -UseBasicParsing -TimeoutSec 30
    Write-Host "  HTTP $($r.StatusCode), $($r.Content.Length) bytes"
    return $r.StatusCode -eq 200
}

# ===== Test 2: D1 reachable =====
Test-Step "D1 database reachable" {
    $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT 1 as ok;" 2>&1 | Out-String
    Write-Host $output.Trim()
    return $output -match "1"
}

# ===== Test 3: Schema check =====
Test-Step "tenders table has expected columns" {
    $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT name FROM pragma_table_info('tenders');" 2>&1 | Out-String
    $expected = @('id','source_id','source_ref','title','procuring_entity','province','sector','closing_date','estimated_value','fingerprint','status','first_seen_at')
    $missing = @()
    foreach ($col in $expected) {
        if ($output -notmatch $col) { $missing += $col }
    }
    if ($missing.Count -gt 0) {
        Write-Host "  Missing: $($missing -join ', ')" -ForegroundColor Red
        return $false
    }
    Write-Host "  All $($expected.Count) columns present"
    return $true
}

# ===== Test 4: Search API =====
Test-Step "/api/tenders/search returns valid JSON" {
    $r = Invoke-WebRequest -Uri "$site/api/tenders/search?limit=5" -UseBasicParsing -TimeoutSec 30
    Write-Host "  HTTP $($r.StatusCode)"
    $data = $r.Content | ConvertFrom-Json
    Write-Host "  ok=$($data.ok) total=$($data.total) shown=$($data.shown) auth=$($data.authenticated)"
    return $data.ok -eq $true
}

# ===== Test 5: D1 tender count =====
$tenderCount = 0
Test-Step "D1 tenders table has rows" {
    $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT COUNT(*) as n FROM tenders;" 2>&1 | Out-String
    Write-Host $output.Trim()
    if ($output -match "\|\s*(\d+)\s*\|") {
        $script:tenderCount = [int]$Matches[1]
        Write-Host "  Tender count: $tenderCount" -ForegroundColor Cyan
        if ($tenderCount -eq 0) {
            Write-Host "  DB is empty - run GitHub Actions to ingest data" -ForegroundColor Yellow
            return $false
        }
        return $true
    }
    return $false
}

# ===== Tests 6-9: only if data exists =====
if ($tenderCount -gt 0) {
    Test-Step "Sample tenders look valid" {
        $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT title, source_id, province, sector FROM tenders LIMIT 3;" 2>&1 | Out-String
        Write-Host $output.Trim()
        return ($output -match "etenders" -or $output -match "treasury")
    }

    Test-Step "Tenders have valid province values" {
        $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT DISTINCT province FROM tenders;" 2>&1 | Out-String
        Write-Host $output.Trim()
        $valid = @('gauteng','western-cape','eastern-cape','free-state','kwazulu-natal','limpopo','mpumalanga','north-west','northern-cape','national')
        foreach ($p in $valid) { if ($output -match $p) { return $true } }
        return $false
    }

    Test-Step "Tenders have valid sector values" {
        $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT DISTINCT sector FROM tenders;" 2>&1 | Out-String
        Write-Host $output.Trim()
        $valid = @('construction','ict','health','education','transport','agriculture','energy','security','consulting','cleaning','catering','legal')
        foreach ($s in $valid) { if ($output -match $s) { return $true } }
        return $false
    }

    Test-Step "Search returns tenders" {
        $r = Invoke-WebRequest -Uri "$site/api/tenders/search?limit=5" -UseBasicParsing -TimeoutSec 30
        $data = $r.Content | ConvertFrom-Json
        if ($data.tenders.Count -eq 0) {
            Write-Host "  DB has $tenderCount rows but search returned 0"
            Write-Host "  All tenders might have status != 'open' or closing_date in past"
            return $false
        }
        $first = $data.tenders[0]
        Write-Host "  Sample title: $($first.title)"
        Write-Host "  Province: $($first.province) / Sector: $($first.sector)"
        return $true
    }
} else {
    Test-Step "Skipping data tests (DB empty)" { return "SKIP" }
}

# ===== Test: Auth rejection =====
Test-Step "/api/cron/ingest rejects unauthenticated POST" {
    try {
        $r = Invoke-WebRequest -Uri "$site/api/cron/ingest" -Method POST -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        Write-Host "  ERROR: HTTP $($r.StatusCode) (expected 401)"
        return $false
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Host "  HTTP $code (expected 401)"
        return $code -eq 401
    }
}

# ===== Test: Auth accepted + persistence =====
if ($secret) {
    Test-Step "Valid x-cron-secret accepted by ingest" {
        $testId = "ocds-test-smoke-" + (Get-Date -Format 'yyyyMMddHHmmss')
        $closing = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
        $opening = (Get-Date).ToString("yyyy-MM-dd")
        $body = @{
            source = "etenders"
            tenders = @(@{
                externalId = $testId
                title = "TEST TENDER - smoke test (delete me)"
                description = "Synthetic test"
                buyer = "Test Buyer"
                province = "gauteng"
                sector = "consulting"
                status = "active"
                closingDate = $closing
                openingDate = $opening
                value = 100000
                currency = "ZAR"
                documentUrls = @()
                sourceUrl = "https://example.com/test"
                briefingCompulsory = $false
            })
        } | ConvertTo-Json -Depth 10

        $r = Invoke-WebRequest -Uri "$site/api/cron/ingest" `
            -Method POST `
            -Headers @{ "x-cron-secret" = $secret; "Content-Type" = "application/json" } `
            -Body $body -UseBasicParsing -TimeoutSec 30
        Write-Host "  HTTP $($r.StatusCode)"
        Write-Host "  Body: $($r.Content)"
        $data = $r.Content | ConvertFrom-Json
        return $data.ok -eq $true
    }

    Test-Step "Test tender persisted in D1" {
        Start-Sleep -Seconds 2
        $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT COUNT(*) as n FROM tenders WHERE source_ref LIKE 'ocds-test-smoke-%';" 2>&1 | Out-String
        Write-Host $output.Trim()
        return $output -match "\|\s*[1-9]"
    }

    Test-Step "Cleanup test tender" {
        wrangler d1 execute tenderpreneurs --remote --command="DELETE FROM tenders WHERE source_ref LIKE 'ocds-test-smoke-%';" 2>&1 | Out-Null
        return $true
    }

    Test-Step "/api/cron/audit returns stats" {
        $r = Invoke-WebRequest -Uri "$site/api/cron/audit" -Method POST -Headers @{ "x-cron-secret" = $secret } -UseBasicParsing -TimeoutSec 30
        Write-Host "  HTTP $($r.StatusCode)"
        $data = $r.Content | ConvertFrom-Json
        Write-Host "  Total: $($data.stats.total_tenders) / Open: $($data.stats.open_tenders) / 24h: $($data.stats.new_24h)"
        Write-Host "  Email: $($data.email)"
        return $data.ok -eq $true
    }
}

# ===== Page tests =====
Test-Step "/tenders page loads" {
    $r = Invoke-WebRequest -Uri "$site/tenders" -UseBasicParsing -TimeoutSec 30
    Write-Host "  HTTP $($r.StatusCode), $($r.Content.Length) bytes"
    return $r.StatusCode -eq 200
}

Test-Step "/blog page loads" {
    $r = Invoke-WebRequest -Uri "$site/blog" -UseBasicParsing -TimeoutSec 30
    Write-Host "  HTTP $($r.StatusCode)"
    return $r.StatusCode -eq 200
}

Test-Step "/sitemap.xml loads" {
    $r = Invoke-WebRequest -Uri "$site/sitemap.xml" -UseBasicParsing -TimeoutSec 30
    Write-Host "  HTTP $($r.StatusCode), $($r.Content.Length) bytes"
    return $r.StatusCode -eq 200 -and $r.Content -match '<loc>'
}

Test-Step "ingestion_runs table has entries" {
    $output = wrangler d1 execute tenderpreneurs --remote --command="SELECT source_id, status, items_found, items_new, started_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 5;" 2>&1 | Out-String
    Write-Host $output.Trim()
    return $output -match "etenders|treasury"
}

# ===== Summary =====
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor White
Write-Host "SUMMARY" -ForegroundColor White
Write-Host ("=" * 70) -ForegroundColor White
Write-Host "  Passed:  $PassedCount" -ForegroundColor Green
Write-Host "  Failed:  $FailedCount" -ForegroundColor $(if ($FailedCount -gt 0) { 'Red' } else { 'Gray' })
Write-Host "  Skipped: $SkippedCount" -ForegroundColor Yellow
Write-Host ""

if ($FailedCount -gt 0) { exit 1 } else { exit 0 }
