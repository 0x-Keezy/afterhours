import json,io,subprocess,time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return []
print("=== VERIFICACION DE LOS 5 NEGATIVOS (queries alternativas) ===")
neg=["HOOD","BRKB","JPM","WMT","DIS"]
alts={"HOOD":["HOOD/USDG","HOOD Robinhood Token USDG","Robinhood Markets"],
      "BRKB":["BRKB/USDG","BRK.B/USDG","Berkshire Hathaway","BRK/USDG"],
      "JPM":["JPM/USDG","JPMorgan Robinhood Token","JPM Robinhood Token USDG"],
      "WMT":["WMT/USDG","Walmart Robinhood Token","WMT Robinhood Token USDG"],
      "DIS":["DIS/USDG","Disney Robinhood Token","DIS Robinhood Token USDG"]}
for t in neg:
    print("\n--- %s ---"%t)
    for q in alts[t]:
        ps=get("https://api.dexscreener.com/latest/dex/search?q="+q.replace(" ","%20").replace("/","%2F"))
        rh=[p for p in ps if p.get("chainId")=="robinhood"]
        # cualquier par en robinhood con USDG de un lado y el ticker del otro
        hit=[p for p in rh if "USDG" in (p["baseToken"]["symbol"].upper(),p["quoteToken"]["symbol"].upper())
             and t in (p["baseToken"]["symbol"].upper(),p["quoteToken"]["symbol"].upper())]
        # y: existe el token tokenizado en absoluto?
        tok=sorted({p["baseToken"]["name"] for p in rh if "Robinhood Token" in p["baseToken"]["name"] and p["baseToken"]["symbol"].upper().startswith(t[:3])}
                 | {p["quoteToken"]["name"] for p in rh if "Robinhood Token" in p["quoteToken"]["name"] and p["quoteToken"]["symbol"].upper().startswith(t[:3])})
        print("   q=%-32s rh=%2d | %s/USDG hits=%d | RHToken '%s*': %s"%(q,len(rh),t,len(hit),t[:3],tok[:3] or "ninguno"))
        time.sleep(1.2)
