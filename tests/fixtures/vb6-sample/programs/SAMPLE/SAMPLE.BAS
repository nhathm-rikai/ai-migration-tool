Attribute VB_Name = "SampleRules"
Option Explicit
' ‹¤’Κƒ‚ƒWƒ…[ƒ‹ ‡@ ` ξο \

Public Const APP_TITLE As String = "’•¶: 'ƒeƒXƒg' Rem"
Private Declare Function GetTickCount Lib "kernel32" () As Long
#If DEBUG_MODE Then
Private Const LOG_ON As Boolean = True
#End If
Rem ƒ‚ƒWƒ…[ƒ‹•Ο”
Private mCount As Long

Public Function CalcTotal(ByVal price As Long, _
                          ByVal qty As Long) As Long
    Dim total As Long: total = price * qty ' ‡v
    ' „ψ _
      continued comment text
    If total > 1000 Then total = total - 100: Rem ’lψ‚«
    CalcTotal = total
End Function

Private Sub ShowMessage()
Attribute ShowMessage.VB_Description = "ΰ–Ύ"
RetryPoint:
ErrHandler: ' ƒGƒ‰[—
100 Rem s”Τ†•t‚«ƒRƒƒ“ƒg
    MsgBox "It's ""quoted"" : not a comment", vbOKOnly
    mCount = mCount + 1
End Sub

Public Property Get Count() As Long
    Count = mCount
End Property
Public Property Let Count(ByVal value As Long)
    mCount = value
End Property
