@echo off
setlocal
title Fermer Noto

echo Fermeture normale de toutes les instances de Noto...
echo Enregistrez d'abord vos documents ouverts.
echo.

rem Ferme noto.exe et les processus enfants sans forcer dans un premier temps.
taskkill /IM noto.exe /T >nul 2>&1
timeout /t 5 /nobreak >nul
call :check_noto
if errorlevel 1 goto :done

echo.
echo Noto fonctionne encore. Une fenetre peut demander d'enregistrer un document.
echo Repondez-y dans Noto, ou choisissez la fermeture forcee ci-dessous.
choice /C ON /N /M "Forcer la fermeture ? Les changements non enregistres seront perdus. [O/N] "
if errorlevel 2 goto :cancel

taskkill /F /T /IM noto.exe >nul 2>&1
timeout /t 2 /nobreak >nul
call :check_noto
if not errorlevel 1 goto :stuck
goto :done

:cancel
echo.
echo Fermeture forcee annulee. Noto peut etre encore ouvert.
goto :finish

:stuck
echo.
echo Noto semble toujours en cours. Fermez ses fenetres, puis reessayez.
goto :finish

:done
echo.
echo Toutes les instances de Noto sont fermees.
goto :finish

:check_noto
tasklist /FI "IMAGENAME eq noto.exe" /NH 2>nul | find /I "noto.exe" >nul
exit /b %errorlevel%

:finish
echo.
pause
endlocal
