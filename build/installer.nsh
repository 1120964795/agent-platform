!macro customInstall
  DetailPrint "Preparing browser runtime dependencies..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --install-browser-runtime --silent' $0
  DetailPrint "Browser runtime dependency setup exit code: $0"
!macroend
