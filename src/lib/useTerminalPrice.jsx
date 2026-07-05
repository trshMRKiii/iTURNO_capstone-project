import { useState, useEffect } from "react";
import { apiService } from "./api-service";

export function useTerminalPrice() {
  const [terminalPrice, setTerminalPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTerminalPrice = async () => {
    try {
      setLoading(true);
      setTerminalPrice(await apiService.getTerminalPrice());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerminalPrice();
  }, []);

  const updateTerminalPrice = async (amount) => {
    const updated = await apiService.updateTerminalPrice({ amount });
    setTerminalPrice(updated);
    return updated;
  };

  return { terminalPrice, loading, error, updateTerminalPrice, refetch: fetchTerminalPrice };
}
