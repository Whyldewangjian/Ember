@echo off
setlocal
set "TARGET=D:\Harness-Workspace\Ember130"

echo ============================================
echo  Ember ACL repair  v3
echo  target: %TARGET%
echo ============================================
echo.
echo RUN AS ADMINISTRATOR.
echo Right-click this file, choose "Run as administrator".
echo.
echo --- BEFORE ---
icacls "%TARGET%"
echo.

echo --- [1/4] reset integrity label to Medium ---
icacls "%TARGET%" /setintegritylevel Medium
echo.
echo --- [2/4] grant read/execute to app packages ---
icacls "%TARGET%" /grant *S-1-15-2-2:(OI)(CI)(RX) /grant *S-1-15-2-1:(OI)(CI)(RX) /C
echo.
echo --- [3/4] override the inherited DENY so files can be deleted ---
icacls "%TARGET%" /grant *S-1-1-0:(OI)(CI)(F) /C
echo.
echo --- [4/4] also repair the electron binary ---
icacls "%TARGET%\node_modules\electron\dist\electron.exe" /grant *S-1-1-0:(F) /grant *S-1-15-2-2:(RX) /C
echo.

echo --- AFTER ---
icacls "%TARGET%"
echo.
echo EXPECTED in AFTER:
echo   - "Medium Mandatory Level", no "Low Mandatory Level"
echo   - the APPLICATION PACKAGE AUTHORITY lines are present
echo   - the DENY line may still show as inherited; step 3 adds an explicit
echo     Everyone allow with (F), which takes priority over it for our purposes
echo.
echo Afterwards, test by deleting a throwaway file in this folder.
echo.
pause
