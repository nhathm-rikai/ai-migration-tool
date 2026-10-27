Attribute VB_Name = "Orders"
Option Explicit
Private Const T_NAME As String = "KMTANT"

' ŒÚ‹q orders
Public Function LoadOrders(ByVal id As Long) As Long
Attribute LoadOrders.VB_Description = "Load"
    Dim strSQL As String

    ' SELECT * FROM NOT_SQL_IN_COMMENT
    strSQL = "SELECT A.F001, B.F002 " & _
        "FROM ORDERS A, KMBUMON B " & _
        "WHERE A.F001 = " & id
    strSQL = strSQL & " ORDER BY A.F001"
    Call ExecSql(strSQL)
    MsgBox "Done"
    Rem trailing comment
    LoadOrders = 1
End Function

Private Sub Purge(ByVal tableName As String)
    Dim s As String
    s = "DELETE FROM " & tableName  ' runtime table
    Call ExecSql(s)
    s = "UPDATE WKLOG SET F001 = 1"
End Sub
Private Sub Ping(): MsgBox "SELECT is a word": End Sub
