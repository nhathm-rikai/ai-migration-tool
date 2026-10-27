VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
  Persistable = 0  'NotPersistable
  DataBindingBehavior = 0  'vbNone
  DataSourceBehavior  = 0  'vbNone
  MTSTransactionMode  = 0  'NotAnMTSObject
END
Attribute VB_Name = "Legacy"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit
' ŒÚ‹q class
Private mName As String
Private Declare Function GetTickCount Lib "kernel32" () As Long
Public Event Changed(ByVal value As String)

Private Sub Class_Initialize()
    mName = ""
End Sub

Public Property Get Name() As String
    Name = mName
End Property
Public Property Let Name(ByVal value As String)
    If value <> mName Then RaiseEvent Changed(value)
    mName = value
End Property
Friend Function Load() As Long
    Load = GetTickCount()
End Function
