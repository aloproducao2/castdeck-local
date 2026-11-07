; CastDeck Local — instalador Windows (Inno Setup 6)
; Build: npm run build:installer
; O executável portátil continua sendo dist\CastDeck.exe.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "CastDeck Local"
#define MyAppPublisher "CastDeck / flue.live"
#define MyAppURL "https://cast.flue.live"
#define MyAppExeName "CastDeck.exe"
#define MyNdiExeName "castdeck-ndi.exe"
#define MyAppId "{{7C3D2D5E-9B64-4A3B-9C2B-4C7D6F1A8E21}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\CastDeck
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist\installer
OutputBaseFilename=CastDeck-Setup-{#MyAppVersion}
SetupIconFile=..\assets\castdeck.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ChangesAssociations=no
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
LicenseFile=..\..\LICENSE
InfoAfterFile=NDI-AFTER-INSTALL.txt
MinVersion=10.0.17763

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked
Name: "startup"; Description: "Iniciar o CastDeck com o Windows"; GroupDescription: "Inicialização:"; Flags: unchecked
Name: "launch"; Description: "Abrir o CastDeck agora"; GroupDescription: "Depois de instalar:"; Flags: checkedonce

[Files]
Source: "..\..\dist\CastDeck.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\castdeck-ndi.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\browser-host-cef\*"; DestDir: "{app}\browser-host-cef"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\NOTICE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\COMMERCIAL-LICENSE.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\NDI — instruções"; Filename: "{app}\README.md"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir {#MyAppName}"; Flags: nowait postinstall skipifsilent; Tasks: launch

[UninstallDelete]
; A pasta de dados do usuário (%LOCALAPPDATA%\CastDeck) é preservada de propósito:
; gravações, estúdios e configurações não são apagados ao desinstalar.
Type: filesandordirs; Name: "{app}\logs"

[Code]
function NdiRuntimeLikelyInstalled: Boolean;
var
  Paths: array[0..3] of String;
  I: Integer;
begin
  Paths[0] := ExpandConstant('{pf}\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll');
  Paths[1] := ExpandConstant('{pf32}\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll');
  Paths[2] := ExpandConstant('{pf}\NDI\NDI 5 Tools\Runtime\Processing.NDI.Lib.x64.dll');
  Paths[3] := ExpandConstant('{pf32}\NDI\NDI 5 Tools\Runtime\Processing.NDI.Lib.x64.dll');
  Result := False;
  for I := 0 to 3 do
    if FileExists(Paths[I]) then
    begin
      Result := True;
      Exit;
    end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and (not NdiRuntimeLikelyInstalled) then
    MsgBox('O CastDeck foi instalado. Para usar NDI, instale o NDI Tools/Runtime 6.3+.' + #13#10 +
      'O restante do aplicativo funciona sem ele; o NDI fica desligado até você ativá-lo.',
      mbInformation, MB_OK);
end;
