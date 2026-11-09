//+------------------------------------------------------------------+
//|                                                     Gold1315.mq5 |
//|                                                                  |
//|  Gold (XAUUSD) momentum expert advisor.                          |
//|  Makes exactly one decision per day at 13:15 German time         |
//|  (Europe/Berlin, CET/CEST) and closes the trade at 22:45.        |
//|                                                                  |
//|  Rule (tested on XAUUSD M1 data 2009-2026, see README.md):       |
//|   move = (bid at 13:15 - price at 00:00 German time) / ATR14(D1) |
//|   trade only if |move| > 0.4 and ATR14(D1) / ATR100(D1) <= 1.0   |
//|   direction = sign(move), stop = 0.75 * ATR14, no take profit,   |
//|   exit at 22:45 German time.                                     |
//+------------------------------------------------------------------+
#property copyright   "porcherliam-glitch/liam"
#property version     "1.00"
#property description "Gold 13:15 Momentum: entscheidet nur einmal am Tag um 13:15 Uhr deutscher Zeit."
#property description "Handelt in Richtung der Bewegung seit 00:00 Uhr, wenn sie groesser als 0,4 ATR ist"
#property description "und der Markt ruhig ist (ATR14 <= ATR100). Stop 0,75 ATR, Ausstieg 22:45 Uhr."
#property description "Erst im Strategietester und auf einem Demokonto pruefen!"

#include <Trade\Trade.mqh>

//--- daylight saving time rule of the broker server
enum ENUM_DST_RULE
  {
   DST_US   = 0, // USA (die meisten Broker: GMT+2 Winter / GMT+3 Sommer)
   DST_EU   = 1, // Europa
   DST_NONE = 2  // keine Sommerzeit
  };

//--- inputs (labels are shown in the MT5 settings dialog, therefore German)
input group "Zeit (deutsche Uhrzeit)"
input int           InpEntryHour        = 13;     // Einstieg: Stunde (deutsche Zeit)
input int           InpEntryMinute      = 15;     // Einstieg: Minute
input int           InpEntryWindowMin   = 5;      // Einstieg noch bis so viele Minuten danach moeglich
input int           InpExitHour         = 22;     // Ausstieg: Stunde (deutsche Zeit)
input int           InpExitMinute       = 45;     // Ausstieg: Minute

input group "Broker-Zeitzone"
input bool          InpAutoServerOffset = true;   // Live: Zeitzone des Servers automatisch messen
input int           InpServerGmtWinter  = 2;      // Server-Zeit = GMT + x im Winter (meist 2)
input ENUM_DST_RULE InpServerDst        = DST_US; // Sommerzeit-Regel des Servers

input group "Signal"
input double        InpMomentumATR      = 0.4;    // Mindestbewegung seit 00:00 Uhr (x ATR14)
input double        InpMaxVolRatio      = 1.0;    // Nur handeln, wenn ATR14 / ATR100 hoechstens so gross ist
input int           InpAtrFast          = 14;     // ATR kurz (Tage)
input int           InpAtrSlow          = 100;    // ATR lang (Tage)
input bool          InpAllowLong        = true;   // Kaufen erlaubt
input bool          InpAllowShort       = true;   // Verkaufen erlaubt

input group "Risiko"
input double        InpRiskPercent      = 0.5;    // Risiko pro Trade in % vom Kontowert (Equity)
input double        InpFixedLots        = 0.0;    // Feste Lotgroesse (0 = Risiko-% verwenden)
input double        InpStopATR          = 0.75;   // Stop-Loss-Abstand (x ATR14)
input double        InpTakeProfitATR    = 0.0;    // Take-Profit-Abstand (x ATR14, 0 = aus)
input double        InpMaxSpread        = 0.80;   // Hoechster Spread in Preis-Einheiten (bei Gold: USD)
input double        InpMaxDrawdownPct   = 20.0;   // Keine neuen Trades nach so viel % Verlust vom Hoechststand (0 = aus)

input group "Sonstiges"
input long          InpMagic            = 131500; // Magic Number (Kennung der Trades dieses Bots)
input int           InpSlippagePoints   = 30;     // Hoechste Kursabweichung beim Ausfuehren (Punkte)

//--- clock of one tick, all times as seconds since 1970
struct DeClock
  {
   datetime          server;        // broker server time
   datetime          gmt;           // UTC
   datetime          german;        // Europe/Berlin local time
   datetime          germanDay;     // 00:00 of the German calendar day
   int               germanMinute;  // minutes since German midnight
   int               germanDow;     // 0 = Sunday ... 6 = Saturday
   long              srvOffset;     // server - GMT in seconds
   long              deOffset;      // German - GMT in seconds
  };

//--- globals
CTrade   g_trade;
int      g_hAtrFast      = INVALID_HANDLE;
int      g_hAtrSlow      = INVALID_HANDLE;
datetime g_doneDay       = 0;      // German day whose entry decision is finished
datetime g_attemptDay    = 0;
int      g_attempts      = 0;
double   g_peakEquity    = 0.0;
long     g_offsetWarnDay = -1;
datetime g_statusDay     = 0;
string   g_status        = "";

//+------------------------------------------------------------------+
//| Calendar helpers (pure arithmetic, no broker data)               |
//+------------------------------------------------------------------+
datetime MakeTime(const int year, const int mon, const int day, const int hour)
  {
   MqlDateTime s;
   ZeroMemory(s);
   s.year = year;
   s.mon  = mon;
   s.day  = day;
   s.hour = hour;
   s.min  = 0;
   s.sec  = 0;
   return StructToTime(s);
  }

int DowOf(const datetime t)
  {
   MqlDateTime s;
   TimeToStruct(t, s);
   return s.day_of_week;
  }

int YearOf(const datetime t)
  {
   MqlDateTime s;
   TimeToStruct(t, s);
   return s.year;
  }

//--- last Sunday of a month at the given hour
datetime LastSunday(const int year, const int mon, const int hour)
  {
   int nextYear = (mon == 12) ? year + 1 : year;
   int nextMon  = (mon == 12) ? 1 : mon + 1;
   long lastDay = (long)MakeTime(nextYear, nextMon, 1, hour) - 86400;
   return (datetime)(lastDay - (long)DowOf((datetime)lastDay) * 86400);
  }

//--- n-th Sunday of a month at the given hour
datetime NthSunday(const int year, const int mon, const int n, const int hour)
  {
   datetime first = MakeTime(year, mon, 1, hour);
   int add = (7 - DowOf(first)) % 7;
   return (datetime)((long)first + (long)(add + 7 * (n - 1)) * 86400);
  }

//--- EU summer time: last Sunday of March 01:00 UTC until last Sunday of October 01:00 UTC
bool IsEuDst(const datetime gmt)
  {
   int y = YearOf(gmt);
   return gmt >= LastSunday(y, 3, 1) && gmt < LastSunday(y, 10, 1);
  }

//--- US summer time: second Sunday of March 07:00 UTC until first Sunday of November 06:00 UTC
bool IsUsDst(const datetime gmt)
  {
   int y = YearOf(gmt);
   return gmt >= NthSunday(y, 3, 2, 7) && gmt < NthSunday(y, 11, 1, 6);
  }

//+------------------------------------------------------------------+
//| Time zone conversion                                             |
//+------------------------------------------------------------------+
long RuleServerOffset(const datetime server)
  {
   datetime approxGmt = (datetime)((long)server - (long)InpServerGmtWinter * 3600);
   bool dst = false;
   if(InpServerDst == DST_US)
      dst = IsUsDst(approxGmt);
   else if(InpServerDst == DST_EU)
      dst = IsEuDst(approxGmt);
   return (long)(InpServerGmtWinter + (dst ? 1 : 0)) * 3600;
  }

long ServerOffset(const datetime server)
  {
   long rule = RuleServerOffset(server);
   // TimeGMT() is not reliable inside the strategy tester -> always use the rule there
   if(!InpAutoServerOffset || MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION))
      return rule;
   long measured = (long)TimeTradeServer() - (long)TimeGMT();
   measured = (long)MathRound(measured / 900.0) * 900;   // brokers use whole quarter hours
   long day = (long)server / 86400;
   if(measured != rule && g_offsetWarnDay != day)
     {
      g_offsetWarnDay = day;
      PrintFormat("Hinweis: Server-Zeitzone gemessen GMT%+.2f, laut Einstellung GMT%+.2f. Verwende die gemessene. "
                  "Fuer den Strategietester bitte 'Server-Zeit = GMT + x im Winter' und die Sommerzeit-Regel anpassen.",
                  measured / 3600.0, rule / 3600.0);
     }
   return measured;
  }

void GetClock(const datetime server, DeClock &c)
  {
   c.server       = server;
   c.srvOffset    = ServerOffset(server);
   c.gmt          = (datetime)((long)server - c.srvOffset);
   c.deOffset     = IsEuDst(c.gmt) ? 7200 : 3600;
   c.german       = (datetime)((long)c.gmt + c.deOffset);
   long g         = (long)c.german;
   c.germanDay    = (datetime)(g - g % 86400);
   c.germanMinute = (int)((g - (long)c.germanDay) / 60);
   c.germanDow    = DowOf(c.german);
  }

datetime GermanToServer(const DeClock &c, const datetime german)
  {
   return (datetime)((long)german - c.deOffset + c.srvOffset);
  }

datetime GermanDayOfServerTime(const DeClock &c, const datetime server)
  {
   long g = (long)server - c.srvOffset + c.deOffset;
   return (datetime)(g - g % 86400);
  }

string HhMm(const int hour, const int minute)
  {
   return StringFormat("%02d:%02d", hour, minute);
  }

//+------------------------------------------------------------------+
//| Status line on the chart                                         |
//+------------------------------------------------------------------+
void SetStatus(const DeClock &c, const string text)
  {
   g_statusDay = c.germanDay;
   g_status    = text;
  }

void UpdateComment(const DeClock &c)
  {
   if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE))
      return;
   if(g_statusDay != c.germanDay)
      SetStatus(c, "Warte auf " + HhMm(InpEntryHour, InpEntryMinute) + " Uhr");
   Comment(StringFormat("Gold1315  |  deutsche Zeit %s  |  Server GMT%+.1f\nHeute: %s",
                        TimeToString(c.german, TIME_DATE | TIME_MINUTES),
                        c.srvOffset / 3600.0, g_status));
  }

//+------------------------------------------------------------------+
//| Market data                                                      |
//+------------------------------------------------------------------+
bool ReadAtr(double &atrFast, double &atrSlow)
  {
   double a[], b[];
   if(CopyBuffer(g_hAtrFast, 0, 1, 1, a) != 1)
      return false;
   if(CopyBuffer(g_hAtrSlow, 0, 1, 1, b) != 1)
      return false;
   atrFast = a[0];
   atrSlow = b[0];
   return atrFast > 0.0 && atrSlow > 0.0;
  }

//--- open price of the first M1 bar at or after 00:00 German time of the current German day
bool GermanMidnightPrice(const DeClock &c, double &price)
  {
   MqlRates rates[];
   datetime from = GermanToServer(c, c.germanDay);
   int n = CopyRates(_Symbol, PERIOD_M1, from, c.server, rates);
   if(n <= 0)
      return false;
   price = rates[0].open;
   return price > 0.0;
  }

//+------------------------------------------------------------------+
//| Positions and history                                            |
//+------------------------------------------------------------------+
bool IsOwnPosition()
  {
   return PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic;
  }

bool HasOwnPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetTicket(i) == 0)
         continue;
      if(IsOwnPosition())
         return true;
     }
   return false;
  }

//--- did this bot already open a trade during the current German day? (survives restarts)
bool TradedToday(const DeClock &c)
  {
   datetime from = GermanToServer(c, c.germanDay);
   if(!HistorySelect(from, (datetime)((long)c.server + 60)))
      return false;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != InpMagic)
         continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol)
         continue;
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY) == DEAL_ENTRY_IN)
         return true;
     }
   return false;
  }

//--- close the trade at the exit time, or if it is left over from an earlier day
void ManagePositions(const DeClock &c)
  {
   int exitMinute = InpExitHour * 60 + InpExitMinute;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !IsOwnPosition())
         continue;
      datetime openDay = GermanDayOfServerTime(c, (datetime)PositionGetInteger(POSITION_TIME));
      if(c.germanMinute < exitMinute && openDay >= c.germanDay)
         continue;
      if(g_trade.PositionClose(ticket))
         PrintFormat("Ausstieg %s Uhr: Position %I64u geschlossen.", TimeToString(c.german, TIME_MINUTES), ticket);
      else
         PrintFormat("Ausstieg fehlgeschlagen (Position %I64u): %u %s. Neuer Versuch beim naechsten Tick.",
                     ticket, g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription());
     }
  }

//+------------------------------------------------------------------+
//| Risk                                                             |
//+------------------------------------------------------------------+
int VolumeDigits(const double step)
  {
   int digits = 0;
   double s = step;
   while(s < 1.0 - 1e-9 && digits < 8)
     {
      s *= 10.0;
      digits++;
     }
   return digits;
  }

//--- lot size so that a stop-out loses InpRiskPercent of equity (or the fixed lot size)
double CalcLots(const ENUM_ORDER_TYPE type, const double price, const double sl)
  {
   double vMin  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vMax  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double vStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(vStep <= 0.0)
      vStep = vMin;
   double lots = InpFixedLots;
   if(lots <= 0.0)
     {
      double profitPerLot = 0.0;
      if(!OrderCalcProfit(type, _Symbol, 1.0, price, sl, profitPerLot) || profitPerLot >= 0.0)
        {
         Print("Lotgroesse konnte nicht berechnet werden (OrderCalcProfit).");
         return 0.0;
        }
      double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPercent / 100.0;
      lots = riskMoney / MathAbs(profitPerLot);
     }
   lots = MathFloor(lots / vStep + 1e-9) * vStep;
   if(lots < vMin)
     {
      PrintFormat("Kein Trade: berechnete Lotgroesse %.4f ist kleiner als die kleinste erlaubte (%.2f). "
                  "Mehr Kapital, hoeheres Risiko-%% oder feste Lotgroesse verwenden.", lots, vMin);
      return 0.0;
     }
   lots = MathMin(lots, vMax);
   double margin = 0.0;
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   if(OrderCalcMargin(type, _Symbol, lots, price, margin) && margin > freeMargin * 0.9 && margin > 0.0)
     {
      lots = MathFloor(lots * (freeMargin * 0.9 / margin) / vStep + 1e-9) * vStep;
      if(lots < vMin)
        {
         Print("Kein Trade: nicht genug freie Margin.");
         return 0.0;
        }
      Print("Lotgroesse wegen freier Margin verkleinert.");
     }
   return NormalizeDouble(lots, VolumeDigits(vStep));
  }

//--- false if equity fell more than InpMaxDrawdownPct below its peak
bool DrawdownAllowsTrading()
  {
   if(InpMaxDrawdownPct <= 0.0)
      return true;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   bool persist = !MQLInfoInteger(MQL_TESTER);
   string gv = "Gold1315_peak_" + IntegerToString(InpMagic);
   if(g_peakEquity <= 0.0 && persist && GlobalVariableCheck(gv))
      g_peakEquity = GlobalVariableGet(gv);
   if(equity > g_peakEquity)
     {
      g_peakEquity = equity;
      if(persist)
         GlobalVariableSet(gv, equity);
     }
   return equity >= g_peakEquity * (1.0 - InpMaxDrawdownPct / 100.0);
  }

//+------------------------------------------------------------------+
//| Daily entry decision                                             |
//+------------------------------------------------------------------+
void FinishDay(const DeClock &c, const string status)
  {
   g_doneDay = c.germanDay;
   SetStatus(c, status);
  }

void TryEntry(const DeClock &c)
  {
   if(g_doneDay == c.germanDay)
      return;
   if(g_attemptDay != c.germanDay)
     {
      g_attemptDay = c.germanDay;
      g_attempts   = 0;
     }
   if(c.germanDow == 0 || c.germanDow == 6)
     {
      FinishDay(c, "Wochenende");
      return;
     }
   if(HasOwnPosition() || TradedToday(c))
     {
      FinishDay(c, "heute schon gehandelt");
      return;
     }
   if(!DrawdownAllowsTrading())
     {
      PrintFormat("Kein Trade: Konto liegt mehr als %.1f%% unter dem Hoechststand. Sicherheits-Stopp aktiv.", InpMaxDrawdownPct);
      FinishDay(c, "Sicherheits-Stopp (Verlustgrenze erreicht)");
      return;
     }
   if(!MQLInfoInteger(MQL_TESTER) && (!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)))
     {
      FinishDay(c, "Algo-Trading ist ausgeschaltet");
      Print("Kein Trade: Algo-Trading ist im Terminal oder fuer diesen Bot nicht erlaubt.");
      return;
     }

   double atrFast = 0.0, atrSlow = 0.0, midnight = 0.0;
   if(!ReadAtr(atrFast, atrSlow) || !GermanMidnightPrice(c, midnight))
     {
      SetStatus(c, "warte auf Kursdaten ...");
      return;   // try again on the next tick inside the entry window
     }

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double move = (bid - midnight) / atrFast;
   double volRatio = atrFast / atrSlow;
   int dir = 0;
   if(MathAbs(move) > InpMomentumATR && volRatio <= InpMaxVolRatio)
      dir = (move > 0.0) ? 1 : -1;

   PrintFormat("%s Uhr: Bewegung seit 00:00 = %+.2f ATR (Grenze %.2f), ATR14/ATR100 = %.2f (Grenze %.2f) -> %s",
               TimeToString(c.german, TIME_MINUTES), move, InpMomentumATR, volRatio, InpMaxVolRatio,
               dir > 0 ? "KAUFEN" : (dir < 0 ? "VERKAUFEN" : "kein Trade"));

   if(dir == 0)
     {
      FinishDay(c, StringFormat("kein Signal (Bewegung %+.2f ATR, Ruhe %.2f)", move, volRatio));
      return;
     }
   if((dir > 0 && !InpAllowLong) || (dir < 0 && !InpAllowShort))
     {
      FinishDay(c, "Signal, aber diese Richtung ist ausgeschaltet");
      return;
     }
   if(ask - bid > InpMaxSpread)
     {
      SetStatus(c, StringFormat("Spread zu hoch (%.2f), warte ...", ask - bid));
      return;   // the spread may normalise within the entry window
     }

   double stopDist = InpStopATR * atrFast;
   double minStop  = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   stopDist = MathMax(stopDist, minStop + (ask - bid));
   // stops are measured from the bid like in the backtest; the spread is the trading cost
   double sl = (dir > 0) ? bid - stopDist : ask + stopDist;
   double tp = 0.0;
   if(InpTakeProfitATR > 0.0)
      tp = (dir > 0) ? bid + InpTakeProfitATR * atrFast : ask - InpTakeProfitATR * atrFast;
   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);

   ENUM_ORDER_TYPE type = (dir > 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (dir > 0) ? ask : bid;
   double lots = CalcLots(type, price, sl);
   if(lots <= 0.0)
     {
      FinishDay(c, "Signal, aber Lotgroesse zu klein (siehe Journal)");
      return;
     }

   bool sent = (dir > 0) ? g_trade.Buy(lots, _Symbol, price, sl, tp, "Gold1315")
                         : g_trade.Sell(lots, _Symbol, price, sl, tp, "Gold1315");
   uint rc = g_trade.ResultRetcode();
   if(sent && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
     {
      PrintFormat("%s %.2f Lot zu %s, Stop-Loss %s, Ausstieg spaetestens %s Uhr.",
                  dir > 0 ? "Gekauft" : "Verkauft", lots, DoubleToString(g_trade.ResultPrice(), _Digits),
                  DoubleToString(sl, _Digits), HhMm(InpExitHour, InpExitMinute));
      FinishDay(c, StringFormat("%s %.2f Lot, Stop %s", dir > 0 ? "KAUF" : "VERKAUF", lots, DoubleToString(sl, _Digits)));
      return;
     }
   g_attempts++;
   PrintFormat("Order fehlgeschlagen (Versuch %d von 3): %u %s", g_attempts, rc, g_trade.ResultRetcodeDescription());
   if(g_attempts >= 3)
      FinishDay(c, "Order fehlgeschlagen (siehe Journal)");
  }

//+------------------------------------------------------------------+
//| Expert lifecycle                                                 |
//+------------------------------------------------------------------+
int OnInit()
  {
   int entryMinute = InpEntryHour * 60 + InpEntryMinute;
   int exitMinute  = InpExitHour * 60 + InpExitMinute;
   if(InpEntryHour < 0 || InpEntryHour > 23 || InpEntryMinute < 0 || InpEntryMinute > 59 ||
      InpExitHour < 0 || InpExitHour > 23 || InpExitMinute < 0 || InpExitMinute > 59 ||
      InpEntryWindowMin < 1 || exitMinute <= entryMinute + InpEntryWindowMin)
     {
      Print("Einstellungen ungueltig: Die Ausstiegszeit muss am selben Tag nach dem Einstiegsfenster liegen.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpFixedLots <= 0.0 && (InpRiskPercent <= 0.0 || InpRiskPercent > 5.0))
     {
      Print("Einstellungen ungueltig: Risiko pro Trade muss zwischen 0 und 5 % liegen (empfohlen 0,25 bis 1 %).");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpStopATR <= 0.0 || InpMomentumATR < 0.0 || InpMaxVolRatio <= 0.0 || InpAtrFast < 1 || InpAtrSlow <= InpAtrFast)
     {
      Print("Einstellungen ungueltig: Stop, Signal-Grenzen oder ATR-Laengen pruefen.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpServerGmtWinter < -12 || InpServerGmtWinter > 14)
     {
      Print("Einstellungen ungueltig: Server-Zeitzone muss zwischen -12 und +14 liegen.");
      return INIT_PARAMETERS_INCORRECT;
     }

   if(StringFind(_Symbol, "XAU") < 0 && StringFind(_Symbol, "GOLD") < 0)
      PrintFormat("Warnung: Der Bot ist fuer Gold (XAUUSD) getestet, laeuft aber auf %s.", _Symbol);

   g_hAtrFast = iATR(_Symbol, PERIOD_D1, InpAtrFast);
   g_hAtrSlow = iATR(_Symbol, PERIOD_D1, InpAtrSlow);
   if(g_hAtrFast == INVALID_HANDLE || g_hAtrSlow == INVALID_HANDLE)
     {
      Print("ATR-Indikator konnte nicht erstellt werden.");
      return INIT_FAILED;
     }

   g_trade.SetExpertMagicNumber((ulong)InpMagic);
   g_trade.SetDeviationInPoints((ulong)InpSlippagePoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   DeClock c;
   GetClock(TimeCurrent(), c);
   PrintFormat("Gold1315 gestartet auf %s. Entscheidung um %s Uhr, Ausstieg %s Uhr (deutsche Zeit). "
               "Server GMT%+.1f, jetzt in Deutschland %s. Risiko %.2f%% pro Trade.",
               _Symbol, HhMm(InpEntryHour, InpEntryMinute), HhMm(InpExitHour, InpExitMinute),
               c.srvOffset / 3600.0, TimeToString(c.german, TIME_DATE | TIME_MINUTES), InpRiskPercent);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   if(g_hAtrFast != INVALID_HANDLE)
      IndicatorRelease(g_hAtrFast);
   if(g_hAtrSlow != INVALID_HANDLE)
      IndicatorRelease(g_hAtrSlow);
   Comment("");
  }

void OnTick()
  {
   DeClock c;
   GetClock(TimeCurrent(), c);

   ManagePositions(c);

   int entryMinute = InpEntryHour * 60 + InpEntryMinute;
   if(c.germanMinute >= entryMinute && c.germanMinute < entryMinute + InpEntryWindowMin)
      TryEntry(c);
   else if(c.germanMinute >= entryMinute + InpEntryWindowMin && g_doneDay != c.germanDay)
      FinishDay(c, "Einstiegsfenster vorbei, heute kein Trade mehr");

   UpdateComment(c);
  }
//+------------------------------------------------------------------+
