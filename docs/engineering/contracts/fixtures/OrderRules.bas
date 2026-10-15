Attribute VB_Name = "OrderRules"
Option Explicit

Public Function IsPositiveAmount(ByVal amount As Currency) As Boolean
    IsPositiveAmount = (amount > 0)
End Function
