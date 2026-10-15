VERSION 5.00
Object = "{12345678-0000-0000-0000-000000000001}#1.0#0"; "SPIN32.OCX"
Begin VB.Form frmSample 
   Caption         =   "éÛíçì¸óÕ á@"
   ClientHeight    =   3000

   Begin VB.CommandButton cmdOk 
      Caption         =   "End"
      BeginProperty Font 
         Name            =   "ÇlÇr ÉSÉVÉbÉN"
      EndProperty
   End
End
Attribute VB_Name = "frmSample"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Option Explicit

Private Sub cmdOk_Click()
    Dim msg As String
    msg = "ï€ë∂ÇµÇ‹Ç∑Ç©ÅH" & _
          "ÅiYÅ^NÅjÅ`"
    ' ämîF
    Unload Me
End Sub