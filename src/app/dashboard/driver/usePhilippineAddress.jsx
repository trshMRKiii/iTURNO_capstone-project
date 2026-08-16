import { useEffect, useState } from "react";
import { regions, provinces as fetchProvinces, cities as fetchCities, barangays as fetchBarangays } from "select-philippines-address";

// Cascading Province -> City/Municipality -> Barangay selector backed by the
// PSGC dataset. Consumers only deal with names (province/city/barangay
// strings), matching how these fields are stored on the backend.
export function usePhilippineAddress({ active, province, city, onProvinceChange, onCityChange }) {
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [barangayOptions, setBarangayOptions] = useState([]);
  // True once we know the PSGC dataset can't be reached (e.g. no internet),
  // so the form can fall back to plain text inputs instead of empty selects.
  const [offline, setOffline] = useState(false);

  // Load all provinces (nationwide) once the form becomes active.
  useEffect(() => {
    if (!active || provinceOptions.length) return;
    let cancelled = false;
    (async () => {
      try {
        const allRegions = await regions();
        if (!Array.isArray(allRegions) || !allRegions.length) {
          throw new Error("no regions returned");
        }
        const perRegion = await Promise.all(
          allRegions.map((r) => fetchProvinces(r.region_code)),
        );
        const flat = perRegion
          .filter(Array.isArray)
          .flat()
          .sort((a, b) => a.province_name.localeCompare(b.province_name));
        if (!flat.length) throw new Error("no provinces returned");
        if (!cancelled) {
          setProvinceOptions(flat);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, provinceOptions.length]);

  // Load cities whenever the selected province changes.
  useEffect(() => {
    if (!active) return;
    const match = provinceOptions.find((p) => p.province_name === province);
    if (!match) {
      setCityOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await fetchCities(match.province_code);
      if (!cancelled && Array.isArray(list)) {
        list.sort((a, b) => a.city_name.localeCompare(b.city_name));
        setCityOptions(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, province, provinceOptions]);

  // Load barangays whenever the selected city changes.
  useEffect(() => {
    if (!active) return;
    const match = cityOptions.find((c) => c.city_name === city);
    if (!match) {
      setBarangayOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await fetchBarangays(match.city_code);
      if (!cancelled && Array.isArray(list)) {
        list.sort((a, b) => a.brgy_name.localeCompare(b.brgy_name));
        setBarangayOptions(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, city, cityOptions]);

  const handleProvinceSelect = (name) => {
    onProvinceChange(name);
    onCityChange("");
  };

  return {
    provinceOptions,
    cityOptions,
    barangayOptions,
    handleProvinceSelect,
    offline,
  };
}
