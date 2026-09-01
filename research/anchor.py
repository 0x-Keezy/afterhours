import json,io,subprocess,time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
u=json.load(io.open("_universo.json",encoding="utf-8"))
SUF="\u2022 Robinhood Token"
print("=== TEST DEL FILTRO ANCLADO  name.endswith('%s') ==="%SUF)
ok=[s for s,n in u.items() if n.endswith(SUF)]
no=[s for s,n in u.items() if not n.endswith(SUF)]
print("  pasan:",len(ok),"| rechazados:",len(no))
print("  rechazado(s):",[s[:40]+('...' if len(s)>40 else '') for s in no])
print("\n  -> substring 'Robinhood Token' acepta %d (incl. el scam); endswith acepta %d (excluye el scam)"%(len(u),len(ok)))
# el scam tiene par USDG?
scam=[s for s in no]
def get(q):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,"https://api.dexscreener.com/latest/dex/search?q="+q],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return []
print("\n=== el token-scam: tiene par contra USDG real? ===")
hit=[p for p in get("Bitcoin%20Ethereum%20Tether%20USDt%20BNB") if p.get("chainId")=="robinhood" and len(p["baseToken"]["name"])>1000]
print("  pares del scam encontrados:",len(hit))
for p in hit[:6]:
    print("   base sym len=%d / quote=%s | liq=%s | pair=%s"%(len(p["baseToken"]["symbol"]),p["quoteToken"]["symbol"],(p.get("liquidity") or {}).get("usd"),p["pairAddress"]))
