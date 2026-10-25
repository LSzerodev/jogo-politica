@echo off
rem Enquete 22 x 13 - instala o que falta e inicia o servidor da live.
rem Painel: http://127.0.0.1:9595   Jogo para o OBS: http://127.0.0.1:9595/jogo
rem Para parar: feche esta janela ou aperte CTRL+C.
setlocal
title Enquete 22 x 13 - Servidor
cd /d "%~dp0"
set PORT=9595

echo.
echo ==========================================================
echo   ENQUETE 22 x 13 - servidor da live
echo ==========================================================
echo.

rem ---- arquivos do projeto ----
if not exist "server\src\index.js" goto :sem_server
if not exist "server\package.json" goto :sem_server

rem ---- Node.js 20+ ----
where node >nul 2>&1
if errorlevel 1 goto :sem_node
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODEV=%%v
set NODEV=%NODEV:v=%
for /f "delims=." %%a in ("%NODEV%") do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 20 goto :node_velho
where npm >nul 2>&1
if errorlevel 1 goto :sem_npm
echo [ OK ] Node.js %NODEV%

cd server

rem ---- server\.env ----
if exist ".env" goto :env_ok
if not exist ".env.example" goto :sem_env
copy /y ".env.example" ".env" >nul
if errorlevel 1 goto :falha_env
echo [ OK ] Criei server\.env
:env_ok
for /f "tokens=2 delims==" %%a in ('findstr /r /c:"^[ ]*PORT[ ]*=" .env 2^>nul') do set PORT=%%a
set PORT=%PORT: =%

rem ---- ja esta rodando? ----
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" /c:"0.0.0.0:%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 goto :ja_rodando

rem ---- dependencias (npm install) ----
rem instala na primeira vez e sempre que o package.json mudar
set PRECISA=0
if not exist "node_modules\tiktok-live-connector" set PRECISA=1
if not exist "node_modules\.package-lock.json" set PRECISA=1
if "%PRECISA%"=="0" (
    for /f %%r in ('powershell -NoProfile -Command "if ((Get-Item package.json).LastWriteTime -gt (Get-Item node_modules\.package-lock.json).LastWriteTime) { 1 } else { 0 }"') do set PRECISA=%%r
)
if "%PRECISA%"=="0" goto :deps_ok
echo.
echo Instalando as dependencias. Na primeira vez leva cerca de 1 minuto e precisa de internet...
echo.
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :falha_npm
if not exist "node_modules\tiktok-live-connector" goto :falha_npm
echo.
:deps_ok
echo [ OK ] Dependencias instaladas

:iniciar
echo.
echo Servidor iniciando.
echo.
echo   Painel ............ http://127.0.0.1:%PORT%
echo   Jogo para o OBS ... http://127.0.0.1:%PORT%/jogo
echo.
echo   1. O painel abre sozinho no navegador.
echo   2. No OBS: Fonte ^> Navegador ^> cole o link do jogo, largura 1080, altura 1920,
echo      e marque "Controlar audio pelo OBS" para a musica e os audios irem para a live.
echo   3. No painel, coloque o seu @ e clique em CONECTAR quando estiver ao vivo.
echo   4. Para parar tudo, feche esta janela.
echo.
start "" /min "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -Command "Start-Sleep 3; Start-Process 'http://127.0.0.1:%PORT%'"
set tentativas=0

:rodar
node src\index.js
set CODIGO=%errorlevel%
set /a tentativas+=1
echo.
echo [ ERRO ] [%time%] O servidor parou com codigo %CODIGO%. O motivo aparece nas linhas acima.
if %tentativas% geq 5 goto :desistiu
echo Reiniciando, tentativa %tentativas% de 5...
ping -n 4 127.0.0.1 >nul
goto :rodar

:desistiu
echo.
echo [ ERRO ] O servidor caiu 5 vezes seguidas. Causas comuns:
echo   - A porta %PORT% esta sendo usada por outro programa (mude PORT em server\.env).
echo   - Arquivo do servidor apagado ou alterado (copie o projeto de novo).
echo   - Dependencias corrompidas: apague a pasta server\node_modules e rode de novo.
echo Mande o texto desta janela para pedir ajuda.
goto :fim

:sem_server
echo [ FALTA ] Pasta server nao encontrada ao lado deste arquivo.
echo Extraia/copie o projeto inteiro, sem tirar arquivos de lugar, e rode de novo.
goto :fim

:sem_node
echo [ FALTA ] Node.js nao esta instalado.
echo Baixe a versao LTS em https://nodejs.org, instale, FECHE esta janela e rode de novo.
start "" https://nodejs.org
goto :fim

:node_velho
echo [ FALTA ] Node.js %NODEV% e muito antigo. Precisa da versao 20 ou mais nova.
echo Baixe a LTS em https://nodejs.org e instale por cima.
start "" https://nodejs.org
goto :fim

:sem_npm
echo [ FALTA ] O npm nao foi encontrado (ele vem junto com o Node.js).
echo Reinstale o Node.js LTS de https://nodejs.org marcando a opcao "npm package manager".
goto :fim

:sem_env
echo [ FALTA ] server\.env.example nao encontrado. Copie o projeto de novo.
goto :fim

:falha_env
echo [ ERRO ] Nao consegui criar server\.env. A pasta pode estar protegida contra escrita
echo (tente mover o projeto para outra pasta, por exemplo Documentos).
goto :fim

:falha_npm
echo.
echo [ ERRO ] Nao consegui instalar as dependencias (o motivo aparece nas linhas acima).
echo   - Confira a internet, o antivirus ou o firewall.
echo   - Se o erro fala de permissao (EPERM/EACCES), feche outros programas usando a pasta
echo     ou mova o projeto para outra pasta, por exemplo Documentos.
echo   - Se continuar, apague a pasta server\node_modules e rode de novo.
goto :fim

:ja_rodando
echo O servidor ja esta rodando na porta %PORT%. Nao precisa iniciar de novo.
echo Painel: http://127.0.0.1:%PORT%
start "" "http://127.0.0.1:%PORT%"

:fim
echo.
pause
