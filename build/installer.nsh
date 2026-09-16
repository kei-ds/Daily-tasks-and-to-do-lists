; 安装界面上的「开机自启动」勾选框，以及安装/卸载时的相应处理。
;
; 注意：这个文件必须存成 UTF-8 with BOM。NSIS 在 Unicode 模式下靠 BOM 判断
; 脚本编码，没有 BOM 的话下面的中文字面量会被解析成乱码。
;
; 安装器不直接创建启动文件夹的快捷方式，只把用户的选择写进注册表，
; 由应用第一次启动时读取并创建（见 src/autostart.js 的 readInstallerPreference）。
; 这样 NSIS 侧只用碰 ASCII 的键名和值，中文路径的编码风险全部留在
; 已经在用 -EncodedCommand 的应用侧。

!include "LogicLib.nsh"

; 卸载器的编译过程也会包含这个文件，但页面和控件只属于安装器
!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"

  Var AutoStartCheckbox
  Var AutoStartState

  ; 插在「选择安装目录」之后、「开始安装」之前。
  ;
  ; 函数定义必须写在宏里面：宏的展开点在 MUI2.nsh 之后，那时 MUI_HEADER_TEXT
  ; 才存在。写在文件顶层的话会被 include 得太早，编译时报
  ; 「!insertmacro: macro named "MUI_HEADER_TEXT" not found」。
  !macro customPageAfterChangeDir
    Function AutoStartPageCreate
      !insertmacro MUI_HEADER_TEXT "启动选项" "选择是否开机自动启动「每日及代办」"

      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateCheckbox} 0 0 100% 12u "开机时自动启动「每日及代办」"
      Pop $AutoStartCheckbox
      ${NSD_SetState} $AutoStartCheckbox ${BST_CHECKED}

      nsDialogs::Show
    FunctionEnd

    Function AutoStartPageLeave
      ${NSD_GetState} $AutoStartCheckbox $AutoStartState
    FunctionEnd

    Page custom AutoStartPageCreate AutoStartPageLeave
  !macroend
!endif

!macro customInstall
  ; 静默安装（/S）会跳过页面，此时变量保持 0，即不自启动，符合预期
  ${If} $AutoStartState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\DailyWidget" "Autostart" "1"
  ${Else}
    WriteRegStr HKCU "Software\DailyWidget" "Autostart" "0"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\DailyWidget"
  ; 启动文件夹里的快捷方式，路径含中文
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\每日及代办.lnk"
!macroend
