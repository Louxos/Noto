# Ferme Noto avant de relancer son installation ou sa desinstallation.
# Enregistrez vos documents avant de taper O : la fermeture forcee peut perdre
# les modifications qui ne sont pas enregistrees.

$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'

function Get-NotoProcesses {
    try {
        return @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'Noto.exe'" -ErrorAction Stop)
    } catch {
        # CIM est plus large que Get-Process, mais garder un repli si WMI/CIM
        # est indisponible sur cette installation Windows.
        return @(Get-Process -Name 'noto' -ErrorAction SilentlyContinue | ForEach-Object {
            [PSCustomObject]@{
                ProcessId = $_.Id
                Name = 'Noto.exe'
                ExecutablePath = $null
            }
        })
    }
}

function Wait-NotoExit {
    param([int]$Seconds = 5)

    $deadline = (Get-Date).AddSeconds($Seconds)
    $remaining = @(Get-NotoProcesses)
    while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        $remaining = @(Get-NotoProcesses)
    }
    return $remaining
}

function Invoke-NotoImageKill {
    $output = & $taskkill '/IM' 'Noto.exe' '/T' '/F' 2>&1
    return [PSCustomObject]@{
        ExitCode = $LASTEXITCODE
        Output = @($output)
    }
}

$processes = @(Get-NotoProcesses)

if ($processes.Count -eq 0) {
    Write-Host 'CIM ne voit aucun processus Noto.exe.'
    Write-Host 'Pour verifier quand meme le nom d image utilise par le desinstalleur, le script peut appeler taskkill sur Noto.exe uniquement.'
    $answer = Read-Host 'Tapez O pour essayer cette fermeture ciblee, ou N pour annuler'
    if ($answer.Trim().ToUpperInvariant() -ne 'O') {
        Write-Host 'Operation annulee. Aucun processus n a ete ferme.'
        return
    }

    $result = Invoke-NotoImageKill
    Start-Sleep -Milliseconds 500
    $remaining = @(Get-NotoProcesses)
    if ($remaining.Count -eq 0 -and $result.ExitCode -eq 0) {
        Write-Host 'Tous les processus Noto.exe sont fermes. Relancez le desinstalleur.'
    } elseif ($remaining.Count -eq 0) {
        Write-Warning 'Windows ne trouve aucun processus Noto.exe a fermer. Redemarrez Windows, ne relancez pas Noto, puis lancez aussitot la desinstallation.'
    } else {
        Write-Warning 'Noto.exe est encore actif. Ouvrez PowerShell en tant qu administrateur et relancez ce script.'
        $remaining | Select-Object ProcessId, Name, ExecutablePath | Format-Table -AutoSize
    }
    return
}

Write-Host 'Processus Noto detectes :'
$processes | Select-Object ProcessId, Name, ExecutablePath | Format-Table -AutoSize

foreach ($process in $processes) {
    try {
        $app = Get-Process -Id $process.ProcessId -ErrorAction Stop
        if ($app.MainWindowHandle -ne [IntPtr]::Zero) {
            [void]$app.CloseMainWindow()
        }
    } catch {
        # Le processus peut avoir quitte entre la detection et la fermeture.
    }
}

$remaining = @(Wait-NotoExit -Seconds 5)
if ($remaining.Count -eq 0) {
    Write-Host 'Noto s est ferme normalement. Relancez le desinstalleur.'
    return
}

$answer = Read-Host 'Noto est encore actif. Tapez O pour forcer la fermeture de Noto.exe et de ses processus enfants, ou N pour annuler'
if ($answer.Trim().ToUpperInvariant() -ne 'O') {
    Write-Host 'Fermeture forcee annulee. Aucun autre processus n a ete ferme.'
    return
}

# Fermer par PID, puis par nom d image. Le second passage couvre les cas ou
# Get-Process ne voyait pas la meme instance que le controleur du desinstalleur.
foreach ($process in $remaining) {
    $null = & $taskkill '/PID' $process.ProcessId '/T' '/F' 2>&1
}
$result = Invoke-NotoImageKill
$remaining = @(Wait-NotoExit -Seconds 2)

if ($remaining.Count -eq 0) {
    Write-Host 'Tous les processus Noto.exe sont fermes. Relancez le desinstalleur.'
} else {
    Write-Warning 'Windows voit encore Noto.exe. Essayez depuis PowerShell lance en tant qu administrateur.'
    $remaining | Select-Object ProcessId, Name, ExecutablePath | Format-Table -AutoSize
}
