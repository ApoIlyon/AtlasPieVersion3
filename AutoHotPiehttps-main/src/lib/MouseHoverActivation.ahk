; Functions to support mouse-hover based window activation contexts.

MouseHover_GetWindowInfo()
{
        MouseGetPos,,, hoveredWin
        if (!hoveredWin)
                return ""

        WinGet, hoveredProcess, ProcessName, ahk_id %hoveredWin%
        WinGetClass, hoveredClass, ahk_id %hoveredWin%

        return { "hwnd": hoveredWin
                , "process": hoveredProcess
                , "class": hoveredClass }
}

MouseHover_HandleMatches(windowInfo, ahkHandle)
{
        if (!IsObject(windowInfo))
                return false

        if (ahkHandle = "")
                return false

        if (SubStr(ahkHandle, 1, 7) = "ahk_exe")
        {
                expected := StrSplit(ahkHandle, " ", , 2)[2]
                return (windowInfo.process = expected)
        }
        else if (SubStr(ahkHandle, 1, 9) = "ahk_class")
        {
                expected := StrSplit(ahkHandle, " ", , 2)[2]
                return (windowInfo.class = expected)
        }
        else if (SubStr(ahkHandle, 1, 9) = "ahk_group")
        {
                return WinExist(ahkHandle " ahk_id " windowInfo.hwnd)
        }

        return false
}

MouseHover_ProfileMatches(profile, windowInfo := "")
{
        if (!IsObject(profile))
                return ""

        if (!profile.hoverActivation)
                return ""

        if (!IsObject(windowInfo))
                windowInfo := MouseHover_GetWindowInfo()

        if (!IsObject(windowInfo))
                return ""

        for handleIndex, ahkHandle in profile.ahkHandles
        {
                if (MouseHover_HandleMatches(windowInfo, ahkHandle))
                        return ahkHandle
        }

        return ""
}

MouseHoverAHKHandle(ahkHandle)
{
        windowInfo := MouseHover_GetWindowInfo()
        return MouseHover_HandleMatches(windowInfo, ahkHandle)
}

MouseHover_GetContextForHandle(ahkHandle)
{
        static hoverContexts := {}

        if (ahkHandle = "")
                return ""

        if (!hoverContexts.HasKey(ahkHandle))
                hoverContexts[ahkHandle] := Func("MouseHoverAHKHandle").Bind(ahkHandle)

        return hoverContexts[ahkHandle]
}
