$processes = @(Get-Process -Name 'noto' -ErrorAction SilentlyContinue)

if ($processes.Count -eq 0) {
    Write-Host 'Noto n''est pas en cours d''execution.'
} else {
    foreach ($process in $processes) {
        try {
            if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
                [void]$process.CloseMainWindow()
            }
        } catch {
            # The process may have exited after it was found.
        }
    }

    $deadline = (Get-Date).AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 250
        $remaining = @(Get-Process -Name 'noto' -ErrorAction SilentlyContinue)
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

    if ($remaining.Count -eq 0) {
        Write-Host 'Tous les processus Noto sont fermes.'
    } else {
        $answer = Read-Host 'Noto est encore ouvert. Tapez O pour forcer (perte possible des modifications non enregistrees), ou N pour annuler'
        if ($answer.Trim().ToUpperInvariant() -eq 'O') {
            $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
            foreach ($process in $remaining) {
                & $taskkill '/PID' $process.Id '/T' '/F' 2>$null | Out-Null
            }

            Start-Sleep -Milliseconds 500
            $remaining = @(Get-Process -Name 'noto' -ErrorAction SilentlyContinue)
            if ($remaining.Count -eq 0) {
                Write-Host 'Tous les processus Noto sont fermes.'
            } else {
                Write-Warning 'Noto est toujours en cours. Fermez les fenetres restantes et reessayez.'
            }
        } else {
            Write-Host 'Fermeture forcee annulee. Noto est peut-etre toujours ouvert.'
        }
    }
}
