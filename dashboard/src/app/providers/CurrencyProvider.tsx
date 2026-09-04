import { type MoneyDisplay, setMoneyDisplay } from "@shared/lib/format";
import { loadMoneyDisplay, USD } from "@shared/lib/money";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useUsageData } from "./UsageDataProvider";

const CurrencyContext = createContext<MoneyDisplay>(USD);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { config } = useUsageData();
  const [money, setMoney] = useState<MoneyDisplay>(USD);

  useEffect(() => {
    const code = config?.currency || USD.code;
    const sharedRate = config?.currencyRate;
    let active = true;
    void loadMoneyDisplay(code, sharedRate).then((next) => {
      if (!active) return;
      setMoneyDisplay(next);
      setMoney(next);
    });
    return () => {
      active = false;
    };
  }, [config?.currency, config?.currencyRate]);

  return <CurrencyContext.Provider value={money}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): MoneyDisplay {
  return useContext(CurrencyContext);
}
