"""Static checks for Gold1315.mq5 (there is no MQL5 compiler on Linux).

Catches typos and copy errors before the first real compile in MetaEditor:
  * brackets balanced, source is plain ASCII (MetaEditor-safe), version property present
  * every called function is defined in the file, a CTrade method, or on the reviewed MQL5 API list
  * every UPPER_CASE constant is defined in the file or on the reviewed MQL5 constant list
  * no MQL4-only functions
New API names must be checked against the MQL5 reference and then added to the lists below.
"""
import os
import re

EA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "MQL5", "Experts", "Gold1315", "Gold1315.mq5")

MQL5_API = {
    "AccountInfoDouble", "AccountInfoString", "Alert", "ArrayResize", "ArraySize", "Comment", "CopyBuffer",
    "CopyRates", "DoubleToString", "FileClose", "FileOpen", "FileSeek", "FileSize", "FileWrite", "GetLastError",
    "GlobalVariableCheck", "GlobalVariableGet", "GlobalVariableSet", "HistoryDealGetDouble", "HistoryDealGetInteger",
    "HistoryDealGetString", "HistoryDealGetTicket", "HistoryDealSelect", "HistoryDealsTotal", "HistoryOrderGetDouble",
    "HistoryOrderGetTicket", "HistoryOrdersTotal", "HistorySelect", "HistorySelectByPosition", "IndicatorRelease",
    "IntegerToString", "MQLInfoInteger", "MathAbs", "MathFloor", "MathMax", "MathMin", "MathRound", "MathSqrt",
    "NormalizeDouble", "OrderCalcMargin", "OrderCalcProfit", "PositionGetInteger", "PositionGetString",
    "PositionGetTicket", "PositionsTotal", "Print", "PrintFormat", "SendNotification", "StringFind", "StringFormat",
    "StructToTime", "SymbolInfoDouble", "SymbolInfoInteger", "TerminalInfoInteger", "TimeCurrent", "TimeGMT",
    "TimeToString", "TimeToStruct", "TimeTradeServer", "ZeroMemory", "iATR",
}
CTRADE = {"Buy", "Sell", "PositionClose", "ResultPrice", "ResultRetcode", "ResultRetcodeDescription",
          "SetDeviationInPoints", "SetExpertMagicNumber", "SetTypeFillingBySymbol"}
MQL5_CONSTANTS = {
    "ACCOUNT_CURRENCY", "ACCOUNT_EQUITY", "ACCOUNT_MARGIN_FREE", "DEAL_COMMISSION", "DEAL_ENTRY", "DEAL_ENTRY_IN",
    "DEAL_ENTRY_OUT", "DEAL_ENTRY_OUT_BY", "DEAL_MAGIC", "DEAL_ORDER", "DEAL_POSITION_ID", "DEAL_PRICE", "DEAL_PROFIT",
    "DEAL_SWAP", "DEAL_SYMBOL", "DEAL_TYPE", "DEAL_TYPE_BUY", "DEAL_VOLUME", "EMPTY_VALUE", "ENUM_DEAL_ENTRY",
    "ENUM_DEAL_TYPE", "ENUM_ORDER_TYPE", "FILE_ANSI", "FILE_COMMON", "FILE_CSV", "FILE_READ", "FILE_SHARE_READ",
    "FILE_WRITE", "INIT_FAILED", "INIT_PARAMETERS_INCORRECT", "INIT_SUCCEEDED", "INVALID_HANDLE", "MQL_OPTIMIZATION",
    "MQL_TESTER", "MQL_TRADE_ALLOWED", "MQL_VISUAL_MODE", "ORDER_SL", "ORDER_TYPE_BUY", "ORDER_TYPE_SELL", "PERIOD_D1",
    "PERIOD_H1", "PERIOD_M1", "POSITION_MAGIC", "POSITION_SYMBOL", "POSITION_TIME", "SEEK_END", "SYMBOL_ASK", "SYMBOL_BID",
    "SYMBOL_TRADE_MODE", "SYMBOL_TRADE_MODE_CLOSEONLY", "SYMBOL_TRADE_MODE_DISABLED", "SYMBOL_TRADE_STOPS_LEVEL",
    "SYMBOL_VOLUME_MAX", "SYMBOL_VOLUME_MIN", "SYMBOL_VOLUME_STEP", "TERMINAL_TRADE_ALLOWED", "TIME_DATE",
    "TIME_MINUTES", "TIME_SECONDS", "TRADE_RETCODE_DONE", "TRADE_RETCODE_DONE_PARTIAL", "TRADE_RETCODE_PLACED",
    "TRADE_TRANSACTION_DEAL_ADD",
}
MQL4_ONLY = {"OrderSend", "OrderSelect", "OrdersTotal_", "MarketInfo", "iClose", "iOpen", "iHigh", "iLow", "Bid", "Ask",
             "TimeHour", "TimeMinute", "TimeDayOfWeek", "DayOfWeek", "RefreshRates", "OrderClose", "OrderModify"}
KEYWORDS = {"if", "for", "while", "return", "switch", "sizeof"}
CASTS = {"datetime", "long", "int", "double", "ulong", "bool", "string", "uint", "ENUM_DEAL_ENTRY", "ENUM_DEAL_TYPE",
         "ENUM_ORDER_TYPE"}


def _code():
    src = open(EA, encoding="ascii").read()          # raises if the file is not plain ASCII
    code = re.sub(r"//[^\n]*", "", src)
    code = re.sub(r'"(\\.|[^"\\])*"', '""', code)
    return src, code


def test_brackets_and_header():
    src, code = _code()
    for o, c in ("{}", "()", "[]"):
        assert code.count(o) == code.count(c), f"unbalanced {o}{c}"
    assert re.search(r'#property\s+version\s+"\d+\.\d\d"', src)


def test_called_functions_are_known():
    _, code = _code()
    defined = set(re.findall(r"^\s*(?:void|int|bool|double|long|string|datetime|ulong)\s+(\w+)\s*\(", code, re.M))
    methods = set(re.findall(r"g_trade\.(\w+)\s*\(", code))
    called = set(re.findall(r"(?<![\.\w])([A-Za-z_]\w*)\s*\(", code))
    unknown = called - defined - MQL5_API - KEYWORDS - CASTS
    assert not unknown, f"unknown functions: {sorted(unknown)}"
    assert methods <= CTRADE, f"unknown CTrade methods: {sorted(methods - CTRADE)}"
    assert not (called & MQL4_ONLY), f"MQL4-only functions: {sorted(called & MQL4_ONLY)}"
    unused = defined - called - {"OnInit", "OnDeinit", "OnTick", "OnTradeTransaction"}
    assert not unused, f"functions defined but never used: {sorted(unused)}"


def test_constants_are_known():
    _, code = _code()
    own = set(re.findall(r"#define\s+(\w+)", code))
    own |= set(re.findall(r"^\s*(\w+)\s*=\s*\d+\s*,?", code, re.M))          # enum values
    own |= set(re.findall(r"enum\s+(\w+)", code))
    used = set(re.findall(r"\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b", code))
    unknown = used - own - MQL5_CONSTANTS
    assert not unknown, f"unknown constants: {sorted(unknown)}"


def test_event_handlers_have_mql5_signatures():
    _, code = _code()
    assert re.search(r"int\s+OnInit\s*\(\s*\)", code)
    assert re.search(r"void\s+OnDeinit\s*\(\s*const\s+int\s+\w+\s*\)", code)
    assert re.search(r"void\s+OnTick\s*\(\s*\)", code)
    assert re.search(r"void\s+OnTradeTransaction\s*\(\s*const\s+MqlTradeTransaction\s*&\s*\w+\s*,\s*"
                     r"const\s+MqlTradeRequest\s*&\s*\w+\s*,\s*const\s+MqlTradeResult\s*&\s*\w+\s*\)", code)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
